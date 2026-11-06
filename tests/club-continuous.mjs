// Four independent sessions, own disposable room, normal player actions only.
// Run: node --import tsx tests/club-continuous.mjs --production
import {registerHooks} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
registerHooks({resolve(s,c,next){if(s.endsWith('.css'))return {url:'data:text/javascript,export default {};',shortCircuit:true};return next(s,c);}});
const {ClubGame}=await import('../app/club-games.tsx');
const {scoreNumbers}=await import('../app/api/_lib/club-baseball.ts');
const {simulateShot}=await import('../app/api/_lib/club-physics.ts');
// Opt-in latency audit. Production is pinned to this site; creates its own
// disposable room, never accepts an existing/user room or reads a secret.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const production=process.argv.includes('--production');
const before=false;
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

async function winnerCheck(){
 const rooms=await Promise.all(clients.map(read)),s=rooms[0].game.club;
 assert.equal(s.finished,true);const ids=s.kind==='number-baseball'?s.winners.flatMap(k=>k.startsWith('team-')?s.teams[Number(k.slice(-1))]:[k]):s.ranking[0];
 const names=ids.map(id=>rooms[0].players.find(p=>p.id===id).name);
 for(const r of rooms){const v=r.game.club;assert.deepEqual(v.ranking,s.ranking);assert.deepEqual(v.winners,s.winners);assert.equal(v.finished,true);
 const html=renderToStaticMarkup(createElement(ClubGame,{s:v,players:r.players,meId:r.meId,isHost:false,onAction:async()=>{},onReplay:()=>{},onLobby:()=>{}}));
 const winnerHtml=s.kind==='number-baseball'?html.slice(html.indexOf('class="nb-winners"'),html.indexOf('class="nb-reveals"')):html.slice(html.indexOf('class="club-result-inline"')).split('</strong>')[0];
 for(const name of names)assert.ok(winnerHtml.includes(name),'Winner missing for '+r.meId);
 }
 return names;
}
function candidates(digits,repeat){const out=[];function walk(v){if(v.length===digits){out.push(v);return;}for(const d of '123456789')if(repeat||!v.includes(d))walk(v+d);}walk('');return out;}
async function baseball(setup){let s=await start('number-baseball',setup),pool=candidates(setup.digits,setup.allowDuplicates);const rounds=[];
 for(let i=0;!s.finished&&i<25;i++){
 const value=pool[Math.floor(pool.length/2)],round=s.round,begin=performance.now();assert.ok(value,'Candidate set empty');
 await Promise.all(clients.map(p=>send(p,{action:'club-guess',clubId:s.id,requestId:crypto.randomUUID(),round,value})));
 const submittedMs=Math.round(performance.now()-begin),rooms=await Promise.all(clients.map(read));s=rooms[0].game.club;
 for(const r of rooms){assert.deepEqual(r.game.club.history,s.history);assert.equal('secret' in r.game.club,false);assert.equal(r.game.club.history.length,round);}
 const h=s.history.at(-1);pool=pool.filter(v=>{const x=scoreNumbers(v,value);return x.strikes===h.strikes&&x.balls===h.balls;});rounds.push({round,submittedMs,allViewsMs:Math.round(performance.now()-begin)});
 }
 const entry={setup,rounds,winnerNames:await winnerCheck()};result.baseball.push(entry);console.log('baseball complete',setup,'rounds',rounds.length,entry.winnerNames);
}
async function teamBaseball(setup){let s=await start('number-baseball',{...setup,mode:'team',redIds:[clients[0].id,clients[2].id]});const secrets=setup.allowDuplicates?['11223','44556']:['12345','56789'];
 for(let side=0;side<2;side++){const p=clients.find(p=>p.id===s.teams[side][0]);s=(await send(p,{action:'club-secret',clubId:s.id,requestId:crypto.randomUUID(),value:secrets[side]})).game.club;}
 for(let turn=0;turn<4;turn++){const side=Number(s.baseball.activeKey.slice(-1)),p=clients.find(p=>p.id===s.teams[side][Math.floor(turn/2)%2]);const value=turn<2?'98765':side===0?secrets[1]:'87654';s=(await send(p,{action:'club-guess',clubId:s.id,requestId:crypto.randomUUID(),round:s.round,turn:s.baseball.turn,value})).game.club;}
 result.baseball.push({setup:s.setup,winnerNames:await winnerCheck()});console.log('team baseball complete',setup);
}
function outward(m,side,obstacles){let best;
 for(const d of m.discs.filter(d=>d.side===side&&d.alive))for(const [dx,dy] of [[130,0],[-130,0],[0,130],[0,-130],[92,92],[-92,92],[92,-92],[-92,-92]]){
 const simulation=simulateShot(m.discs,d.id,dx,dy,obstacles),discs=simulation.discs,removed=m.discs.filter(x=>x.alive).length-discs.filter(x=>x.alive).length,ownRemoved=m.discs.filter(x=>x.alive&&x.side===side).length-discs.filter(x=>x.alive&&x.side===side).length;
 const moved=discs.find(x=>x.id===d.id),score=ownRemoved*10000+removed*1000+Math.hypot(moved.x-300,moved.y-300);
 if(!best||score>best.score)best={discId:d.id,dx,dy,score};
 }return best;
}
async function alkkagi(setup){let s=await start('alkkagi',setup);const shots=[];
 for(let count=0;!s.finished&&count<100;count++){
 const room=await read();s=room.game.club;const m=s.matches.find(m=>m.winner===undefined&&!m.draw);assert.ok(m,'No playable match');const side=(m.turn+m.first)%2,p=clients.find(p=>p.id===m.sides[side][Math.floor(m.turn/2)%m.sides[side].length]);const shot=outward(m,side,setup.obstacles),begin=performance.now();
 const updates=clients.filter(c=>c!==p).map(c=>watch(c,room.revision,v=>v.matches.find(x=>x.id===m.id)?.turn>m.turn,begin));
 s=(await send(p,{action:'club-shot',clubId:s.id,requestId:crypto.randomUUID(),matchId:m.id,attempt:m.attempt,turn:m.turn,discId:shot.discId,dx:shot.dx,dy:shot.dy})).game.club;
 const acknowledgedMs=Math.round(performance.now()-begin),peerUpdateMs=await Promise.all(updates);assert.equal(s.matches.find(x=>x.id===m.id).turn,m.turn+1);shots.push({match:m.id,turn:m.turn+1,acknowledgedMs,peerUpdateMs});
 if(s.matches.some(m=>m.draw))throw Error('Controlled audit shot produced draw; review replay separately');
 }
 result.alkkagi.push({setup,shots,winnerNames:await winnerCheck()});console.log('alkkagi complete',setup,'shots',shots.length);
}
try{
 const made=await request(null,{player:{name:'연속검수민수',avatar:'🐻'}},'/api/rooms');assert.equal(made.status,201,made.error);code=made.room.code;result.room=code;clients.push({id:made.room.meId,cookie:made.cookie});
 for(const name of ['연속검수지영','연속검수현우','연속검수지수']){const j=await request(null,{action:'join',player:{name,avatar:'🐥'}});assert.equal(j.status,200,j.error);clients.push({id:j.room.meId,cookie:j.cookie});}
 for(const digits of [4,5])for(const allowDuplicates of [false,true])await baseball({mode:'individual',digits,allowDuplicates});
 await teamBaseball({digits:5,allowDuplicates:true});await teamBaseball({digits:5,allowDuplicates:false});
 for(const mode of ['team','tournament'])for(const obstacles of [false,true])await alkkagi({mode,obstacles,redIds:mode==='team'?[clients[0].id,clients[2].id]:undefined});
 assert.equal(result.requests.filter(r=>r.status>=400).length,0,'Unexpected request rejection');
}finally{
 if(code&&clients.length){await send(clients[0],{action:'prepare-game',gameId:'number-baseball'});for(const p of clients)await send(p,{action:'leave'});result.cleaned=true;}
 await mkdir('artifacts/club',{recursive:true});await writeFile('artifacts/club/continuous-'+(production?'production':'local')+'.json',JSON.stringify(result,null,2));
}
console.log(JSON.stringify({base:result.base,baseballGames:result.baseball.length,alkkagiGames:result.alkkagi.length,cleaned:result.cleaned}));
