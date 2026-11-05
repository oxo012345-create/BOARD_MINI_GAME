import {OnlineRoom} from './room.js';
import {SnapshotEncoder} from '../../../../../public/swarm/net-protocol.js';
import {MODES} from '../../../../../public/swarm/modes.js';

const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
export function base64(buffer){let text='';const bytes=new Uint8Array(buffer);for(let i=0;i<bytes.length;i+=16384)text+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(text);}
const equalToken=(a,b)=>typeof b==='string'&&b.length===36&&a===b;
const publicLobby=row=>({type:'lobby',room:row.code,mode:row.mode,started:!!row.started,capacity:MODES[row.mode].count,seats:JSON.parse(row.seats).map(s=>({id:s.id,name:s.name,connected:Date.now()-s.seen<8000}))});
const validCommand=c=>c&&Number.isSafeInteger(c.sequence)&&c.sequence>0&&c.sequence<=50000&&(c.type==='move'?Number.isFinite(c.x)&&Number.isFinite(c.y)&&c.x>=0&&c.x<=1000&&c.y>=0&&c.y<=1000&&[.5,1].includes(c.fraction):c.type==='claim'?Number.isInteger(c.zone)&&c.zone>=0&&c.zone<25:c.type==='active'||c.type==='upgrade'&&['attack','armor'].includes(c.kind));
export function sanitizeCommand(command,matchId){if(!validCommand(command)||command.matchId!==matchId)return null;return {sequence:command.sequence,matchId,type:command.type,...(command.type==='move'?{x:command.x,y:command.y,fraction:command.fraction}:command.type==='claim'?{zone:command.zone}:{kind:command.kind})};}

// No process-local room map: every isolate reads the same D1 state. A fenced
// lease serializes joins/start/steps; state, queue consumption and revision commit
// in one transaction. An expired lease cannot overwrite a newer owner's state.
export class D1Rooms{
 constructor(db,{now=()=>Date.now()}={}){this.db=db.withSession?.('first-primary')||db;this.now=now;}
 stmt(sql,...args){return this.db.prepare(sql).bind(...args);}
 async row(code){const row=await this.stmt('SELECT * FROM swarm_rooms WHERE code=? AND expires>?',code,this.now()).first();if(!row)fail('방이 없거나 만료되었습니다',404);return row;}
 seat(row,token){const seat=JSON.parse(row.seats).find(s=>equalToken(s.token,token));if(!seat)fail('참가 정보가 만료되었습니다. 방에 다시 참가하세요',401);return seat;}
 async lock(code,wait=false,dueOnly=false){
  const lease=crypto.randomUUID();
  for(let attempt=0;attempt<(wait?12:1);attempt++){
   const now=this.now(),r=await this.stmt('UPDATE swarm_rooms SET lease=?,lease_until=? WHERE code=? AND expires>? AND (lease IS NULL OR lease_until<?)'+(dueOnly?' AND started=1 AND next_tick<=?':'')+' RETURNING code',...[lease,now+12000,code,now,now,...(dueOnly?[now]:[])]).first();
   if(r)return lease;
   if(wait)await new Promise(resolve=>setTimeout(resolve,35));
  }
  return null;
 }
 async release(code,lease){await this.stmt('UPDATE swarm_rooms SET lease=NULL,lease_until=0 WHERE code=? AND lease=?',code,lease).run();}
 async create(mode){
  if(!Object.hasOwn(MODES,mode))fail('대전 모드를 확인하세요');
  const now=this.now(),code=crypto.randomUUID().replaceAll('-','').slice(0,6).toUpperCase();
  const room=new OnlineRoom({code,mode,seed:crypto.getRandomValues(new Uint32Array(1))[0],cpuTiming:false});
  const [_,insert]=await this.db.batch([
   this.stmt('DELETE FROM swarm_rooms WHERE expires<?',now),
   this.stmt('INSERT INTO swarm_rooms(code,mode,seed,expires,created) SELECT ?,?,?,?,? WHERE (SELECT count(*) FROM swarm_rooms)<16 RETURNING code',code,mode,room.seed,now+3600000,now),
   this.stmt('INSERT INTO swarm_states(code,checkpoint) SELECT ?,? WHERE EXISTS(SELECT 1 FROM swarm_rooms WHERE code=?)',code,JSON.stringify({room:room.checkpoint(),accumulator:0}),code),
  ]);
  if(!insert.results?.length)fail('현재 방이 가득 찼습니다. 잠시 후 다시 시도하세요',429);
  return {code};
 }
 async hydrate(code,supplied){const saved=supplied||await this.stmt('SELECT checkpoint,acks FROM swarm_states WHERE code=?',code).first();if(!saved)fail('방 상태를 찾지 못했습니다',404);const state=JSON.parse(saved.checkpoint);return {room:OnlineRoom.restore(state.room,{now:this.now,cpuTiming:false}),accumulator:state.accumulator||0,acks:JSON.parse(saved.acks)};}
 async commit(row,lease,state,{lastAt=row.last_at,nextTick=row.next_tick,processed=0,changed=true}={}){
  const revision=changed?row.revision+1:row.revision,game=state.room.session?.game;
  let snapshot='';if(game){const encoder=new SnapshotEncoder();encoder.revision=revision-1;snapshot=base64(encoder.encode(game,{full:true,events:game.events,stats:{transport:'https-d1',authority:'server',tickMs:null,encodeMs:null,lagMs:Math.max(0,state.accumulator-1000/30),timingSource:'worker-cpu-time-unavailable'}}));game.events=[];}
  const checkpoint=JSON.stringify({room:state.room.checkpoint(),accumulator:state.accumulator});
  if(new TextEncoder().encode(checkpoint).byteLength>1800000)fail('방 상태가 저장 한도를 초과했습니다',503);
  const guard='EXISTS(SELECT 1 FROM swarm_rooms WHERE code=? AND lease=?)';
  // A different seat may heartbeat while this owner computes. Preserve its
  // newer timestamp instead of replacing it with the checkpoint's older copy.
  const seatArgs=[JSON.stringify(state.room.seats)],seatParts=[];for(const s of state.room.seats){const path=`$[${s.id}].seen`;seatParts.push('?,max(coalesce(json_extract(seats,?),0),?)');seatArgs.push(path,path,s.seen||0);}
  const mergedSeats=`json_set(?,${seatParts.join(',')})`;
  const results=await this.db.batch([
   this.stmt(`UPDATE swarm_states SET checkpoint=?,snapshot=?,revision=?,acks=? WHERE code=? AND ${guard}`,checkpoint,snapshot,revision,JSON.stringify(state.acks.slice(-64)),row.code,row.code,lease),
   this.stmt(`UPDATE swarm_commands SET done=1 WHERE code=? AND done=0 AND id<=? AND ${guard}`,row.code,processed,row.code,lease),
   this.stmt(`UPDATE swarm_rooms SET seats=${mergedSeats},started=?,revision=?,last_at=?,next_tick=?,lease=NULL,lease_until=0 WHERE code=? AND lease=? RETURNING seats`,...seatArgs,game?1:0,revision,lastAt,nextTick,row.code,lease),
  ]);
  state.snapshot=snapshot;state.revision=revision;if(results[2].results?.[0]?.seats)state.room.seats=JSON.parse(results[2].results[0].seats);
  return results[2].meta.changes===1;
 }
 async join(code,{token,name}){
  const lease=await this.lock(code,true);if(!lease)fail('다른 참가자를 처리 중입니다. 다시 시도하세요',409);
  try{
   const row=await this.row(code),state=await this.hydrate(code),seats=JSON.parse(row.seats);state.room.seats=seats;
   let seat=seats.find(s=>equalToken(s.token,token));
   if(token&&!seat)fail('재접속 정보가 일치하지 않습니다',401);
   if(!seat){if(row.started)fail('이미 시작한 방입니다',409);if(seats.length>=MODES[row.mode].count)fail('방이 가득 찼습니다',409);seat={id:seats.length,name:String(name||'플레이어').trim().slice(0,16)||'플레이어',token:crypto.randomUUID(),seen:this.now()};seats.push(seat);}
   seat.seen=this.now();await this.commit(row,lease,state);
   const queued=await this.stmt('SELECT max(sequence) AS sequence FROM swarm_commands WHERE code=? AND seat=?',code,seat.id).first();
   return {welcome:{type:'welcome',room:code,seat:seat.id,token:seat.token,mode:row.mode,sequence:Math.max(queued.sequence||0,state.room.session?.sequences.get('seat-'+seat.id)||0)},lobby:publicLobby({...row,seats:JSON.stringify(seats)})};
  }finally{await this.release(code,lease);}
 }
 async start(code,token){
  const lease=await this.lock(code,true);if(!lease)fail('방 처리 중입니다. 다시 시도하세요',409);
  try{
   const row=await this.row(code),seat=this.seat(row,token);if(seat.id!==0)fail('방장만 시작할 수 있습니다',403);
   if(row.started)return;
   const seats=JSON.parse(row.seats);if(seats.length!==MODES[row.mode].count||seats.some(s=>this.now()-s.seen>8000))fail('모든 참가자가 연결되어야 시작할 수 있습니다',409);
   const state=await this.hydrate(code);state.room.seats=seats;
   // Use the existing authority/start path; transient peers are never persisted.
   const peers=seats.map(s=>({send(){},bufferedAmount:0}));
   for(const s of seats)state.room.peers.set(peers[s.id],{seat:s.id,needsFull:true,budget:30,refill:state.room.now(),inFlight:[],lastSent:0});
   state.room.handle(peers[0],{type:'start'});state.room.peers.clear();
   if(!state.room.session)fail('전투를 시작하지 못했습니다',409);
   const now=this.now();await this.commit(row,lease,state,{lastAt:now,nextTick:now+100});
  }finally{await this.release(code,lease);}
 }
 async command(code,token,command,revision=0,ack=0,prefetched=null){
  const row=prefetched||await this.row(code);if(!row.code)fail('방이 없거나 만료되었습니다',404);const seat=this.seat(row,token);if(!row.started)fail('전투가 시작되지 않았습니다',409);
  const sanitized=sanitizeCommand(command,code);if(!sanitized)fail('잘못된 명령입니다');
  if(row.fastCommand){if(!row.queueAccepted)fail('명령을 처리 중입니다. 잠시 후 다시 시도하세요',429);const advanced=row.claimed?await this.advanceLocked(row,row.lease):null;return {queued:true,state:this.response(advanced||row,seat.id,revision,ack)};}
  const [,existing]=await this.db.batch([
   this.stmt('INSERT OR IGNORE INTO swarm_commands(code,seat,sequence,body) SELECT ?,?,?,? WHERE (SELECT count(*) FROM swarm_commands WHERE code=? AND done=0)<64',code,seat.id,command.sequence,JSON.stringify(sanitized),code),
   this.stmt('SELECT id FROM swarm_commands WHERE code=? AND seat=? AND sequence=?',code,seat.id,command.sequence),
  ]);if(!existing.results.length)fail('명령을 처리 중입니다. 잠시 후 다시 시도하세요',429);
  const advanced=await this.advance(code,true,row);return {queued:true,...(advanced?{state:this.response(advanced,seat.id,revision,ack)}:{})};
 }
 async advance(code,force=false,known){
  const preliminary=known||await this.row(code);if(!preliminary.started||!force&&preliminary.next_tick>this.now())return;
  if(preliminary.lease&&preliminary.lease_until>this.now())return;
  const lease=crypto.randomUUID(),lockAt=this.now();
  // The lease returns its checkpoint and queue atomically. No second DB read
  // after acquiring a lock, and no isolate-local authoritative state/cache.
  const row=await this.stmt('UPDATE swarm_rooms SET lease=?,lease_until=? WHERE code=? AND expires>? AND (lease IS NULL OR lease_until<?)'+(!force?' AND started=1 AND next_tick<=?':'')+' RETURNING *, (SELECT checkpoint FROM swarm_states WHERE code=swarm_rooms.code) AS checkpoint, (SELECT acks FROM swarm_states WHERE code=swarm_rooms.code) AS acks, (SELECT json_group_array(json_object(\'id\',id,\'seat\',seat,\'sequence\',sequence,\'body\',body)) FROM (SELECT id,seat,sequence,body FROM swarm_commands WHERE code=swarm_rooms.code AND done=0 ORDER BY id LIMIT 64)) AS queued',...[lease,lockAt+12000,code,lockAt,lockAt,...(!force?[lockAt]:[])]).first();
  if(!row)return;
  return this.advanceLocked(row,lease);
 }
 async advanceLocked(row,lease){
  const code=row.code;
  let committed=false;
  try{
   const state=await this.hydrate(code,row),g=state.room.session?.game;if(!g)return;
   state.room.seats=JSON.parse(row.seats);
   state.room.bindPolicy();state.room.session.policy.update({present:state.room.seats.filter(s=>this.now()-s.seen<8000).map(s=>s.id),force:true});
   let processed=0;for(const c of JSON.parse(row.queued||'[]')){
    const ok=state.room.session.dispatch('seat-'+c.seat,JSON.parse(c.body));
    state.acks.push({seat:c.seat,sequence:c.sequence,ok:!!ok,result:ok,frame:g.frame+1});processed=c.id;
   }
   const now=this.now(),active=state.room.seats.some(s=>now-s.seen<8000);
   if(active&&!g.over)state.accumulator+=Math.min(1000,Math.max(0,now-row.last_at));
   // Cover up to one elapsed second at the normal30Hz. A slow DB round trip
   // must not cap the entire shared game's progress at six ticks per request.
   let steps=0;while(state.accumulator+1e-7>=1000/30&&steps<30&&!g.over){state.room.session.tick(1/30);state.accumulator-=1000/30;steps++;}
   state.accumulator=Math.min(1000,state.accumulator);
   committed=await this.commit(row,lease,state,{lastAt:now,nextTick:now+100,processed});
   if(committed)return {...row,seats:JSON.stringify(state.room.seats),state_revision:state.revision,snapshot:state.snapshot,acks:JSON.stringify(state.acks.slice(-64))};
  }finally{if(!committed)await this.release(code,lease);}
 }
 response(row,seat,revision,ack){return {lobby:publicLobby(row),revision:row.state_revision,snapshot:row.state_revision>revision?row.snapshot:null,acks:JSON.parse(row.acks).filter(a=>a.seat===seat&&a.sequence>ack).map(({seat,...a})=>({type:'ack',...a,serverMs:null}))};}
 async poll(code,token,revision=0,ack=0,prefetched=null){
  const row=prefetched||await this.stmt('SELECT r.*,CASE WHEN s.revision>? THEN s.snapshot END AS snapshot,s.acks,s.revision AS state_revision FROM swarm_rooms r JOIN swarm_states s ON r.code=s.code WHERE r.code=? AND r.expires>?',revision,code,this.now()).first();
  if(!row?.code)fail('방이 없거나 만료되었습니다',404);const seat=this.seat(row,token);
  if(!row.fastPoll&&this.now()-seat.seen>1500)await this.stmt('UPDATE swarm_rooms SET seats=json_set(seats,?,?) WHERE code=? AND json_extract(seats,?)=?',`$[${seat.id}].seen`,this.now(),code,`$[${seat.id}].token`,token).run();
  const result=row.fastPoll?(row.claimed?await this.advanceLocked(row,row.lease):null):await this.advance(code,false,row);
  return this.response(result||row,seat.id,revision,ack);
 }
}

export async function handleD1(request,env,url){
 try{
  const rooms=new D1Rooms(env.DB);
  if(url.pathname==='/api/swarm/health')return json({online:true,transport:'https-d1',authority:'server',tickHz:30,patchHz:10});
  if(request.method!=='POST')return json({error:'NOT_FOUND'},404);
  const raw=await request.text();if(raw.length>4096)fail('요청이 너무 큽니다',413);let body;try{body=JSON.parse(raw);}catch{fail('잘못된 요청입니다');}if(!body||typeof body!=='object'||Array.isArray(body))fail('잘못된 요청입니다');
  if(url.pathname==='/api/swarm/rooms')return json(await rooms.create(body.mode));
  if(!/^[A-F0-9]{6}$/.test(body?.room||''))fail('방 코드를 확인하세요');
  if(url.pathname==='/api/swarm/http/join')return json(await rooms.join(body.room,body));
  if(url.pathname==='/api/swarm/http/start'){await rooms.start(body.room,body.token);return json({ok:true});}
  if(url.pathname==='/api/swarm/http/command')return json(await rooms.command(body.room,body.token,body.command,Number.isSafeInteger(body.revision)?body.revision:0,Number.isSafeInteger(body.ack)?body.ack:0));
  if(url.pathname==='/api/swarm/http/poll')return json(await rooms.poll(body.room,body.token,Number.isSafeInteger(body.revision)?body.revision:0,Number.isSafeInteger(body.ack)?body.ack:0));
  return json({error:'NOT_FOUND'},404);
 }catch(error){if(!error.status)console.error('D1 room operation failed',String(error.message).slice(0,160));return json({error:error.status?error.message:'서버가 요청을 처리하지 못했습니다. 잠시 후 다시 시도하세요'},error.status||503);}
}
