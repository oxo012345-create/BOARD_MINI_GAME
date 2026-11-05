import {DurableObject} from 'cloudflare:workers';
import {OnlineRoom} from '../app/api/_lib/vendor/swarm/room.js';
import {MatchSession} from '../public/swarm/integration.js';
import {MODES} from '../public/swarm/modes.js';
import {verifyTicket,signTicket} from './tickets.js';

const reply=(error,status)=>Response.json({error},{status,headers:{'Cache-Control':'no-store'}});
function validConfig(p){return p&&Object.hasOwn(MODES,p.mode)&&Array.isArray(p.roster)&&p.roster.length===MODES[p.mode].count&&p.roster.every(s=>typeof s.name==='string'&&s.name.length<=32)&&Number.isInteger(p.seat)&&p.seat>=0&&p.seat<p.roster.length;}
const worker={
 async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname==='/health')return Response.json({service:'hanpan-swarm-realtime',transport:'websocket-durable',tickHz:30,patchMs:Number(env.STATE_PATCH_MS)||100});
  if(url.pathname!=='/connect'||request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return reply('NOT_FOUND',404);
  if(request.headers.get('Origin')!==env.ALLOWED_ORIGIN)return reply('ORIGIN_NOT_ALLOWED',403);
  const p=await verifyTicket(env.SWARM_REALTIME_SECRET,url.searchParams.get('ticket'),'connect');if(!validConfig(p))return reply('INVALID_TICKET',401);
  const stub=env.SWARM_ROOMS.get(env.SWARM_ROOMS.idFromName(p.roomCode+':'+p.matchId),{locationHint:'apac'});
  return stub.fetch('https://swarm-room/connect',{headers:{Upgrade:'websocket','x-swarm-config':JSON.stringify(p)}});
 }
};
export default worker;

// One DO owns one whole battle; local SQLite stores recovery checkpoints.
export class SwarmRoom extends DurableObject{
 constructor(ctx,env){
  super(ctx,env);this.ctx=ctx;this.env=env;this.room=null;this.config=null;this.connections=new Map();this.timer=null;this.lastSaved=0;this.lastChecked=0;this.authorityUntil=0;this.active=[];
  ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS battle(id INTEGER PRIMARY KEY CHECK(id=1),body TEXT NOT NULL)');
  const saved=ctx.storage.sql.exec('SELECT body FROM battle WHERE id=1').toArray()[0];
  if(saved){const state=JSON.parse(saved.body);this.config=state.config;this.room=OnlineRoom.restore(state.checkpoint,this.roomOptions());}
 }
 roomOptions(){return {now:()=>Date.now(),cpuTiming:false,patchMs:Math.max(50,Math.min(100,Number(this.env.STATE_PATCH_MS)||100))};}
 save(){if(!this.room)return;const body=JSON.stringify({config:this.config,checkpoint:this.room.checkpoint()});if(new TextEncoder().encode(body).length>1800000)throw new Error('Checkpoint exceeds limit');this.ctx.storage.sql.exec('INSERT INTO battle(id,body) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body',body);this.lastSaved=Date.now();}
 async authority(){
  if(this.checking)return this.checking;
  this.checking=(async()=>{try{
   const body={roomCode:this.config.roomCode,matchId:this.config.matchId},token=await signTicket(this.env.SWARM_REALTIME_SECRET,{version:1,kind:'authority',expiresAt:Date.now()+10000,...body});
   const req=new Request(this.env.SITE_ORIGIN+'/api/swarm/realtime-authority',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body),signal:AbortSignal.timeout(3000)});
   const r=await (this.env.AUTHORITY?this.env.AUTHORITY.fetch(req):fetch(req));
   if(r.status===409||r.status===404){this.authorityUntil=0;this.room?.session?.game.finish(null,'abandoned');this.shutdown(4000,'전투가 종료되었습니다.');return false;}
   if(!r.ok)throw new Error('Authority unavailable');const data=await r.json();if(!Array.isArray(data.active)||data.active.length!==this.config.roster.length)throw new Error('Invalid authority');
   this.active=data.active.map(v=>v===true);this.authorityUntil=Date.now()+6000;
   for(const [peer,state]of this.connections)if(!this.active[state.seat])peer.close(4003,'방에 다시 참가해 주세요.');return true;
  }catch{return false;}finally{this.lastChecked=Date.now();this.checking=null;}})();return this.checking;
 }
 async scheduleAlarm(){
  if(!this.room?.session)return;
  const g=this.room.session.game;if(g.over){await this.ctx.storage.deleteAlarm();this.nextAlarmAt=null;return;}
  const p=this.room.session.policy;
  // Active battles have no deadline. Clear alarms retained from older releases.
  if(p.emptySince===null){await this.ctx.storage.deleteAlarm();this.nextAlarmAt=null;return;}
  const at=this.room.startedAt+1000*(p.emptySince+p.rules.abandon);
  const target=Math.max(Date.now()+100,Math.ceil(at));if(this.nextAlarmAt===target)return;
  const current=await this.ctx.storage.getAlarm();if(current!==target)await this.ctx.storage.setAlarm(target);this.nextAlarmAt=target;
 }
 async alarm(){
  if(!this.room?.session)return;this.nextAlarmAt=null;this.room.policy(true);
  if(this.room.session.game.over){this.finishBattle();return;}this.save();await this.scheduleAlarm();
 }
 wake(){
  if(!this.room?.session||this.room.session.game.over)return;
  this.room.policy(true);if(this.room.session.game.over){this.finishBattle();return;}
  if(!this.timer){this.room.last=Date.now();this.room.accumulator=0;this.timer=setInterval(()=>this.tick(),1000/60);}
  this.ctx.waitUntil(this.scheduleAlarm());
 }
 async fetch(request){
  if(new URL(request.url).pathname!=='/connect')return reply('NOT_FOUND',404);
  const p=JSON.parse(request.headers.get('x-swarm-config')||'null');if(!validConfig(p))return reply('INVALID_CONFIG',400);
  if(this.config&&(p.matchId!==this.config.matchId||p.roomCode!==this.config.roomCode||p.mode!==this.config.mode||p.roster.length!==this.config.roster.length))return reply('ROSTER_CHANGED',409);
  if(!this.config)this.config={roomCode:p.roomCode,matchId:p.matchId,mode:p.mode,roster:p.roster};
  if(!await this.authority()||!this.active[p.seat])return reply('AUTHORITY_UNAVAILABLE',403);
  if(!this.room){
   this.room=new OnlineRoom({code:p.matchId,mode:p.mode,seed:parseInt(p.matchId.replaceAll('-','').slice(0,8),16),...this.roomOptions()});
   this.room.seats=p.roster.map((s,id)=>({id,name:s.name,token:crypto.randomUUID()}));
   this.room.session=new MatchSession({mode:p.mode,seed:this.room.seed,matchId:p.matchId,humans:this.room.seats.map(s=>s.id),participants:this.room.seats.map(s=>({id:'seat-'+s.id,name:s.name}))});this.save();
  }
  const pair=new WebSocketPair(),client=pair[0],socket=pair[1];socket.accept();let outbox=null;
  const peer={get bufferedAmount(){return socket.bufferedAmount||0;},send:data=>{if(typeof data==='string'){const message=JSON.parse(data);if(message.type==='welcome'){delete message.token;data=JSON.stringify(message);}}if(outbox)outbox.push(data);else socket.send(data);},close:(code,reason)=>socket.close(code,reason)};
  this.connections.set(peer,{seat:p.seat,socket});this.room.join(peer,{token:this.room.seats[p.seat].token});
  socket.addEventListener('message',event=>{
   if(typeof event.data!=='string'||event.data.length>4096)return socket.close(4000,'잘못된 메시지');
   try{const input=JSON.parse(event.data);if(input.type==='join')return;this.room.policy();
    if(this.room.session?.game.over){this.finishBattle();if(input.type==='stateAck'||Array.isArray(input)&&input[0]==='a')this.room.handle(peer,input);return;}
    if(Date.now()>this.authorityUntil||!this.active[p.seat]){socket.send(JSON.stringify({type:'error',message:'방 연결을 확인하고 있습니다.'}));return;}
    if(input.type==='command')outbox=[];
    this.room.handle(peer,input);
    // Store accepted state/sequence before the acknowledgement leaves.
    if(input.type==='command'){this.save();const messages=outbox;outbox=null;for(const message of messages)socket.send(message);}if(this.room.session.game.over)this.finishBattle();else if(!this.timer)this.wake();
   }catch{outbox=null;socket.close(1011,'명령을 저장하지 못했습니다. 다시 연결해 주세요.');}
  });
  const leave=()=>{if(!this.connections.has(peer))return;this.connections.delete(peer);this.room.leave(peer);if(!this.connections.size){clearInterval(this.timer);clearTimeout(this.finishTimer);this.timer=null;this.finishTimer=null;this.save();this.ctx.waitUntil(this.scheduleAlarm());}};
  socket.addEventListener('close',leave);socket.addEventListener('error',leave);
  if(this.room.session.game.over)this.finishBattle();else this.wake();
  return new Response(null,{status:101,webSocket:client});
 }
 tick(){
  if(!this.room||!this.connections.size)return;
  try{
   this.room.policy();if(this.room.session.game.over){this.finishBattle();return;}
   const alive=this.room.session.game.players.filter(p=>!p.eliminated);if(!alive.some(p=>this.room.session.policy.present.has(p.id))){clearInterval(this.timer);this.timer=null;this.save();this.ctx.waitUntil(this.scheduleAlarm());return;}
   if(Date.now()-this.lastChecked>=2000&&!this.checking)this.ctx.waitUntil(this.authority());
   if(Date.now()<=this.authorityUntil)this.room.advance();else {this.room.last=Date.now();this.room.accumulator=0;}
   if(Date.now()-this.lastSaved>=1000)this.save();
   if(this.room.session?.game.over)this.finishBattle();
  }catch{this.shutdown(1011,'전투 서버를 다시 연결해 주세요.');}
 }
 finishBattle(){
  clearInterval(this.timer);this.timer=null;if(this.finishTimer)return;
  if(this.room.session.game.reason==='abandoned'){this.room.session.game.units=[];this.room.session.game.projectiles=[];this.room.session.game.dispensers=[];}
  this.save();this.room.patch(true,{terminal:true});this.ctx.waitUntil(this.scheduleAlarm());if(!this.connections.size)return;
  // The final result is sent before closing. Bound the lifetime even for a
  // backgrounded or older client which doesn't close after receiving it.
  this.finishTimer=setTimeout(()=>this.shutdown(4000,'전투가 종료되었습니다.'),3000);
 }
 shutdown(code,reason){clearInterval(this.timer);clearTimeout(this.finishTimer);this.timer=null;this.finishTimer=null;for(const [peer]of this.connections)try{peer.close(code,reason);}catch{}this.connections.clear();if(this.room){this.room.peers.clear();this.room.policy(true);this.save();this.ctx.waitUntil(this.scheduleAlarm());}}
}
