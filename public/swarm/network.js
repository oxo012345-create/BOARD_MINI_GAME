import {Game} from './engine.js';
import {SnapshotReplica} from './net-protocol.js';
import {SnapshotMotion,motionTarget,moveVisual} from './snapshot-motion.js';
const summary=a=>{if(!a.length)return null;const sorted=[...a].sort((x,y)=>x-y);return {mean:a.reduce((s,x)=>s+x,0)/a.length,p95:sorted[Math.ceil(sorted.length*.95)-1],max:sorted.at(-1),samples:a.length};};
export class NetworkSession extends EventTarget{
 constructor({room,name,token=null,storage=globalThis.sessionStorage,now=()=>performance.now()}={}){
  super();this.id=room;this.name=name;this.token=token;this.storage=storage;this.now=now;this.game=new Game({seed:1});this.online=true;this.replica=new SnapshotReplica();this.seat=0;this.sequence=0;this.pending=new Map();this.pings=new Map();this.samples={rtt:[],ack:[],paint:[],gaps:[],server:[]};this.status='connecting';this.retries=0;this.disposed=false;this.received=0;this.lastState=0;this.targets=new Map();this.droneTargets=new Map();this.rawDrones=new Map();this.motion=new SnapshotMotion();this.lastVisualTick=null;this.lastPong=0;this.bytes=0;
 }
 emit(type,detail){this.dispatchEvent(new CustomEvent(type,{detail}));}
 connect(){
  const url=new URL(this.socketAddress||'/api/swarm/ws',location.href);if(url.protocol==='https:'||url.protocol==='http:')url.protocol=url.protocol==='https:'?'wss:':'ws:';if(!this.socketAddress)url.searchParams.set('room',this.id);this.status='connecting';this.emit('status',this.status);
  this.latencySampleAt=null;const socket=this.socket=new WebSocket(url);socket.binaryType='arraybuffer';
  socket.onopen=()=>{this.sendRaw({type:'join',name:this.name,token:this.token});this.lastPong=performance.now();this.heartbeat=setInterval(()=>this.ping(),1000);this.ping();};
  socket.onmessage=e=>{if(socket!==this.socket)return;try{if(typeof e.data==='string')this.message(JSON.parse(e.data));else this.snapshot(e.data);}catch{this.sendRaw({type:'resync'});}};
  socket.onerror=()=>{};
  socket.onclose=e=>{clearInterval(this.heartbeat);if(this.disposed)return;this.status='disconnected';this.emit('status',this.status);if(e.code===4001||e.code===4000){this.emit('error','연결이 종료되었습니다. 방으로 돌아가 다시 참가하세요.');return;}this.retry=setTimeout(()=>this.connect(),Math.min(5000,500*2**this.retries++));};
 }
 sendRaw(message){if(this.socket?.readyState!==WebSocket.OPEN)return false;if(this.socket.bufferedAmount>32*1024)return false;this.socket.send(JSON.stringify(message));return true;}
 ping(){const now=performance.now();if(now-this.lastPong>8000){this.socket?.close();return;}const id=crypto.randomUUID();this.pings.set(id,now);for(const [key,t]of this.pings)if(now-t>10000)this.pings.delete(key);this.sendRaw({type:'ping',id});}
 record(key,value){const list=this.samples[key];list.push(value);if(list.length>300)list.shift();if(key==='rtt')this.latencySampleAt=performance.now();}
 latency(now=performance.now()){const stale=this.status!=='connected'||this.latencySampleAt==null||now-this.latencySampleAt>3500;return {kind:'ping',ms:stale?null:this.samples.rtt.at(-1)};}
 message(m){const now=performance.now();
  if(m.type==='welcome'){this.seat=m.seat;this.token=m.token;this.mode=m.mode;this.sequence=m.sequence;this.game=new Game({mode:m.mode,seed:1});this.replica=new SnapshotReplica();this.lastState=0;this.targets.clear();this.droneTargets.clear();this.rawDrones.clear();this.motion.reset();this.lastVisualTick=null;this.pending.clear();this.status='connected';this.retries=0;try{this.storage?.setItem('swarm-room-'+this.id,JSON.stringify({token:m.token,name:this.name}));}catch{}this.emit('welcome',m);this.emit('status',this.status);}
  if(m.type==='lobby')this.emit('lobby',m);
  if(m.type==='error')this.emit('error',m.message);
  if(m.type==='pong'){const start=this.pings.get(m.id);if(start!==undefined){this.record('rtt',now-start);this.pings.delete(m.id);}this.lastPong=now;}
  if(m.type==='ack'){const pending=this.pending.get(m.sequence);if(pending){this.record('ack',now-pending.sent);if(Number.isFinite(m.serverMs))this.record('server',m.serverMs);if(m.ok)pending.frame=m.frame;else this.pending.delete(m.sequence);}if(!m.ok)this.emit('error','명령을 실행할 수 없습니다');}
 }
 snapshot(data){const previousUnits=new Map(this.replica.units),packet=this.replica.apply(data);if(!packet)return;if(packet.resync){this.sendRaw({type:'resync'});return;}const now=this.now(),m=packet.meta,g=this.game,seconds=this.motion.serverTime===null?0:m.time-this.motion.serverTime;this.sendRaw({type:'stateAck',revision:m.revision});
  if(this.lastState)this.record('gaps',now-this.lastState);this.lastState=now;this.received++;this.bytes+=data.byteLength;this.serverStats=m.stats;const before=new Map(g.units.map(u=>[u.id,u])),oldTargets=this.targets,phase=this.motion.receive(m.time,now,g.time);this.targets=new Map();
  g.mode=m.mode;if(phase.reset)g.time=m.time;g.frame=m.frame;g.over=m.over;g.winner=m.winner;g.reason=m.reason;g.players=m.players;
  g.units=[...this.replica.units.values()].map(u=>{const old=before.get(u.id),copy={...u};if(old&&!phase.reset){const target=phase.advanced?motionTarget(old,u,previousUnits.get(u.id),seconds,u.walking):oldTargets.get(u.id);if(target){this.targets.set(u.id,target);copy.x=old.x;copy.y=old.y;}}return copy;});
  for(const z of m.zones){const target=g.zoneMap.get(z[0]);Object.assign(target,{owner:z[1],hp:z[2]/10,maxHp:z[3],captureFlash:z[4],strike:z[5]});}
  const beforeDrones=new Map(g.dispensers.map(d=>[d.id,d])),oldDroneTargets=this.droneTargets,nextRaw=new Map();this.droneTargets=new Map();
  g.dispensers=m.drones.map(d=>{const raw={id:d[0],player:d[1],x:d[2],y:d[3],zone:d[4],hp:d[5],maxHp:d[5]},old=beforeDrones.get(raw.id);nextRaw.set(raw.id,{...raw});if(old&&!phase.reset){const target=phase.advanced?motionTarget(old,raw,this.rawDrones.get(raw.id),seconds):oldDroneTargets.get(raw.id);if(target){this.droneTargets.set(raw.id,target);raw.x=old.x;raw.y=old.y;}}return raw;});this.rawDrones=nextRaw;
  if(phase.advanced)g.projectiles=m.shots.map(b=>({x:b[0],y:b[1],player:b[2],tx:b[3],ty:b[4]}));g.events.push(...m.events);g.reindex();this.snapshotAt=now;if(phase.reset)this.lastVisualTick=now;this.emit('snapshot',m);
 }
 tick(){const now=this.now(),dt=this.lastVisualTick===null?0:Math.max(0,Math.min(.1,(now-this.lastVisualTick)/1000));this.lastVisualTick=now;const g=this.game,phase=this.motion.phase(now);g.time=phase.time;
  for(const u of g.units){moveVisual(u,this.targets.get(u.id),phase);u.hit=Math.max(0,u.hit-dt);u.recoil=Math.max(0,u.recoil-dt);}
  for(const d of g.dispensers)moveVisual(d,this.droneTargets.get(d.id),phase);
  for(const z of g.zones){z.strike=Math.max(0,(z.strike||0)-dt);z.captureFlash=Math.max(0,z.captureFlash-dt);}
  for(const b of g.projectiles){const dx=b.tx-b.x,dy=b.ty-b.y,d=Math.hypot(dx,dy),step=Math.min(d,440*dt);if(d){b.x+=dx/d*step;b.y+=dy/d*step;}}
  g.projectiles=g.projectiles.filter(b=>Math.hypot(b.tx-b.x,b.ty-b.y)>1);
 }
 canIssue(){return this.status==='connected'&&!!this.lastState&&performance.now()-this.lastState<=1500&&!this.game.over;}
 dispatch(actor,input){if(!this.canIssue())return false;const sequence=++this.sequence,command={...input,sequence,matchId:this.id};if(!this.sendRaw({type:'command',command}))return false;this.pending.set(sequence,{sent:performance.now(),frame:null});return input.type==='move'?this.game.commandCount(this.seat,input.fraction)||1:true;}
 painted(){const now=performance.now();this.draws??=[];this.draws.push(now);this.draws=this.draws.filter(t=>now-t<5000);for(const [sequence,p]of this.pending){if(p.frame!==null&&this.game.frame>=p.frame){this.record('paint',now-p.sent);this.pending.delete(sequence);}else if(now-p.sent>10000)this.pending.delete(sequence);}}
 diagnostics(){const draws=this.draws||[];return {transport:'websocket',room:this.id,seat:this.seat,status:this.status,source:'this-client-real-connection',drawFps:draws.length>1?(draws.length-1)/((draws.at(-1)-draws[0])/1000):null,rttMs:summary(this.samples.rtt),ackMs:summary(this.samples.ack),commandToDrawMs:summary(this.samples.paint),snapshotGapMs:summary(this.samples.gaps),serverCommandMs:summary(this.samples.server),server:this.serverStats||null,staleMs:this.lastState?performance.now()-this.lastState:null,bytesReceived:this.bytes,snapshots:this.received,viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,userAgent:navigator.userAgent,gpuExecutionMs:null,thermalStatus:null};}
 close(){this.disposed=true;clearInterval(this.heartbeat);clearTimeout(this.retry);this.socket?.close();}
}
