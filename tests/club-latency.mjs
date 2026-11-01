// Opt-in latency audit. Production is pinned to this site; creates its own
// disposable room, never accepts an existing/user room or reads a secret.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const production=process.argv.includes('--production');
const before=process.argv.includes('--before');
const base=production?'https://hanpan-mobile-game.oxo012345.chatgpt.site':process.env.HANPAN_TEST_URL;
if(!base || (!production&&!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base)))throw Error('Set a local HANPAN_TEST_URL or explicitly pass --production');
const result={base,phase:before?'before':'after',at:new Date().toISOString(),baseball:[],alkkagi:[],requests:[],cleaned:false};
const clients=[];let code;
async function request(p,body,path=`/api/rooms/${code}`,retry=true){
 for(let attempt=0;attempt<4;attempt++){
  const begin=performance.now();
  const response=await fetch(base+path,{method:body?(path==='/api/rooms'?'POST':'PATCH'):'GET',headers:{'Content-Type':'application/json',...(p?{Cookie:p.cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const json=await response.json();
  result.requests.push({action:body?.action??(body?'create':'read'),status:response.status,ms:Math.round(performance.now()-begin),attempt,code:json.code});
  if(retry&&response.status===409&&json.code==='ROOM_CONFLICT'){await new Promise(r=>setTimeout(r,35*(attempt+1)));continue;}
  return{...json,status:response.status,cookie:response.headers.get('set-cookie')?.split(';')[0]};
 }
 throw Error('Client conflict retries exhausted');
}
async function send(p,body){const path=`/api/rooms/${code}${!before&&['club-guess','club-secret','club-shot'].includes(body.action)?'/club':''}`;const r=await request(p,body,path);assert.equal(r.status,200,r.error);return r.room;}
async function read(p=clients[0]){const r=await request(p);assert.equal(r.status,200,r.error);return r.room;}
async function start(kind,setup){await send(clients[0],{action:'prepare-game',gameId:kind});await send(clients[0],{action:'club-settings',clubSetup:setup});return(await send(clients[0],{action:'start-game',gameId:kind})).game.club;}
async function watch(p,revision,predicate,begin){
 for(let i=0;i<12;i++){
  const r=await request(p,undefined,`/api/rooms/${code}/events?wait=1&revision=${revision}`);
  assert.equal(r.status,200);revision=r.revision;
  if(r.room&&predicate(r.room.game.club))return Math.round(performance.now()-begin);
 }
 throw Error('Realtime update not received');
}
try{
 const made=await request(null,{player:{name:'속도검수A',avatar:'🐻'}},'/api/rooms');assert.equal(made.status,201,made.error);code=made.room.code;result.room=code;
 clients.push({id:made.room.meId,cookie:made.cookie});
 for(const name of ['속도검수B','속도검수C','속도검수D']){const j=await request(null,{action:'join',player:{name,avatar:'🐥'}});assert.equal(j.status,200,j.error);clients.push({id:j.room.meId,cookie:j.cookie});}
 let s=await start('number-baseball',{mode:'individual',digits:4});
 for(const value of ['1234','5678','1923','4569']){
  const round=s.round,begin=performance.now(),offset=result.requests.length;
  await Promise.all(clients.map(p=>send(p,{action:'club-guess',clubId:s.id,requestId:crypto.randomUUID(),round,value})));
  const submittedMs=Math.round(performance.now()-begin);
  const rooms=await Promise.all(clients.map(read));s=rooms[0].game.club;
  for(const room of rooms){assert.deepEqual(room.game.club.history,s.history);assert.equal('secret' in room.game.club,false);assert.equal('pending' in room.game.club,false);}
  assert.equal(s.history.length,round);
  const entry={round,submittedMs,allViewsMs:Math.round(performance.now()-begin),conflicts:result.requests.slice(offset).filter(r=>r.code==='ROOM_CONFLICT').length};result.baseball.push(entry);console.log('baseball',entry);
  if(s.finished)break;
 }
 s=await start('alkkagi',{mode:'team',obstacles:true,redIds:[clients[0].id,clients[2].id]});
 for(let turn=0;turn<4;turn++){
  const room=await read();s=room.game.club;const m=s.matches[0],side=(m.turn+m.first)%2,id=m.sides[side][Math.floor(m.turn/2)%2],p=clients.find(p=>p.id===id),d=m.discs.find(d=>d.side===side&&d.alive);
  const begin=performance.now(),updates=clients.filter(c=>c!==p).map(c=>watch(c,room.revision,state=>state.matches[0].turn>turn,begin));
  const response=await send(p,{action:'club-shot',clubId:s.id,requestId:crypto.randomUUID(),matchId:m.id,attempt:m.attempt,turn:m.turn,discId:d.id,dx:0,dy:side?-130:130});
  const acknowledgedMs=Math.round(performance.now()-begin),peerUpdateMs=await Promise.all(updates);
  assert.equal(response.game.club.matches[0].turn,turn+1);
  for(const c of clients)assert.deepEqual((await read(c)).game.club.matches[0].discs,response.game.club.matches[0].discs);
  const entry={turn:turn+1,acknowledgedMs,peerUpdateMs,frameCount:response.game.club.matches[0].frames?.length};result.alkkagi.push(entry);console.log('alkkagi',entry);
 }
 if(!before){assert.ok(result.baseball.every(r=>r.conflicts===0),'server must absorb simultaneous gameplay CAS conflicts');}
}finally{
 if(code&&clients.length){await send(clients[0],{action:'prepare-game',gameId:'number-baseball'});for(const p of clients)await send(p,{action:'leave'});result.cleaned=true;}
 await mkdir('artifacts/club',{recursive:true});
 await writeFile(`artifacts/club/latency-${production?'production':'local'}-${before?'before':'after'}.json`,JSON.stringify(result,null,2));
}
console.log(JSON.stringify({room:code,baseball:result.baseball,alkkagi:result.alkkagi,cleaned:result.cleaned}));
