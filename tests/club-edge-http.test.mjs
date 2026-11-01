import test from 'node:test';
import assert from 'node:assert/strict';
const base=process.env.HANPAN_TEST_URL;
if(base&&!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base))throw Error('Local test server only');
async function room(){
 let code;const people=[];
 async function req(p,body,path=`/api/rooms/${code}`){for(let retry=0;retry<15;retry++){const r=await fetch(base+path,{method:body?path==='/api/rooms'?'POST':'PATCH':'GET',headers:{'Content-Type':'application/json',...(p?{Cookie:p.cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});const j=await r.json();if(r.status===429&&(body?.action==='join'||path==='/api/rooms')){await new Promise(resolve=>setTimeout(resolve,(Number(r.headers.get('retry-after'))||60)*1000+100));continue;}if(j.code==='ROOM_CONFLICT')continue;return{...j,status:r.status,cookie:r.headers.get('set-cookie')?.split(';')[0]};}throw Error('unsettled conflict');}
 const r=await req(null,{player:{name:'QA1',avatar:'😎'}},'/api/rooms');assert.equal(r.status,201);code=r.room.code;people.push({id:r.room.meId,cookie:r.cookie});
 for(const name of ['QA2','QA3','QA4']){const j=await req(null,{action:'join',player:{name,avatar:'🐻'}});assert.equal(j.status,200);people.push({id:j.room.meId,cookie:j.cookie});}
 const read=async(p=people[0])=>(await req(p)).room.game.club;
 const send=async(p,b)=>{const r=await req(p,b);assert.equal(r.status,200,r.error);return r.room.game.club;};
 const start=async(kind,setup)=>{await send(people[0],{action:'prepare-game',gameId:kind});await send(people[0],{action:'club-settings',clubSetup:setup});return send(people[0],{action:'start-game',gameId:kind});};
 const payload=(s,m,extra)=>({clubId:s.id,matchId:m.id,attempt:m.attempt,turn:m.turn,requestId:crypto.randomUUID(),...extra});
 const actor=m=>people.find(p=>p.id===m.sides[(m.turn+m.first)%2][Math.floor(m.turn/2)%m.sides[0].length]);
 const close=async()=>{for(const p of people)await req(p,{action:'leave'});};
 return{people,req,read,send,start,payload,actor,close};
}
test('four real HTTP seats finish alkkagi tournament with obstacles off and on; invalid shots are atomic', {skip:!base,timeout:120000},async()=>{
 const q=await room();try{for(const obstacles of [false,true]){
  let s=await q.start('alkkagi',{mode:'tournament',obstacles});
  const original=s.matches[0],p=q.actor(original),before=JSON.stringify(original);
  for(const more of [{discId:-1,dx:100,dy:0},{discId:original.first?0:5,dx:100,dy:0},{discId:original.first?5:0,dx:0,dy:0},{discId:original.first?5:0,dx:999,dy:0},{discId:original.first?5:0,dx:'NaN',dy:0}]){const r=await q.req(p,q.payload(s,original,{action:'club-shot',...more}));assert.equal(r.status,422);assert.equal(JSON.stringify((await q.read()).matches[0]),before);}
  async function complete(id){let attempts=0;while(true){const state=await q.read(),m=state.matches.find(x=>x.id===id);if(m.winner!==undefined)return;assert.ok(attempts++<50,'match must settle');const side=(m.turn+m.first)%2,d=m.discs.find(x=>x.alive&&x.side===side);assert.ok(d);const edges=[{n:d.x,dx:-130,dy:0},{n:600-d.x,dx:130,dy:0},{n:d.y,dx:0,dy:-130},{n:600-d.y,dx:0,dy:130}].sort((a,b)=>a.n-b.n);const body=q.payload(state,m,{action:'club-shot',discId:d.id,dx:edges[0].dx,dy:edges[0].dy});await q.send(q.actor(m),body);const current=await q.read();await q.send(q.actor(m),body);assert.equal((await q.read()).matches.find(x=>x.id===id).turn,current.matches.find(x=>x.id===id).turn);}}
  await Promise.all(s.matches.map(m=>complete(m.id)));s=await q.read();assert.equal(s.stage,1);await Promise.all(['final','bronze'].map(complete));s=await q.read();assert.equal(s.finished,true);assert.equal(new Set(s.ranking.flat()).size,4);assert.equal(s.ranking.length,4);
  for(const person of q.people)assert.deepEqual((await q.read(person)).ranking,s.ranking);
 }}finally{await q.close();}
});
test('concurrent same-turn Omok actions, expired game input and reconnect cannot double-advance a four-player team game',{skip:!base,timeout:120000},async()=>{
 const q=await room();try{let s=await q.start('gomoku',{mode:'team',redIds:[q.people[0].id,q.people[2].id]});let m=s.matches[0];const p=q.actor(m),body=q.payload(s,m,{action:'club-place',cell:112});
 const res=await Promise.all([q.req(p,body),q.req(p,body),q.req(p,{...body,requestId:crypto.randomUUID()})]);assert.ok(res.some(r=>r.status===200));assert.ok(res.every(r=>[200,422].includes(r.status)));s=await q.read();assert.equal(s.matches[0].turn,1);assert.equal(s.matches[0].board.filter(Boolean).length,1);
 const leave=q.people[2];await q.req(leave,{action:'leave'});s=await q.read();assert.deepEqual(s.paused,[leave.id]);m=s.matches[0];assert.equal((await q.req(q.actor(m),q.payload(s,m,{action:'club-place',cell:113}))).status,422);await q.req(leave,{action:'join'});assert.deepEqual((await q.read()).paused,[]);assert.equal((await q.read()).matches[0].turn,1);
 await q.start('gomoku',{mode:'team',redIds:[q.people[0].id,q.people[2].id]});assert.equal((await q.req(p,body)).status,422);assert.equal((await q.read()).matches[0].turn,0);
 }finally{await q.close();}
});
test('four-seat baseball team setup and attacks reject noncaptain, repeated secret and simultaneous duplicate; hidden values stay private',{skip:!base,timeout:120000},async()=>{
 const q=await room();try{let s=await q.start('number-baseball',{mode:'team',digits:4,redIds:[q.people[0].id,q.people[2].id]});const body={action:'club-secret',clubId:s.id,requestId:crypto.randomUUID(),value:'1234'};
 assert.equal((await q.req(q.people[2],body)).status,422);await Promise.all([q.send(q.people[0],body),q.send(q.people[0],body)]);assert.equal((await q.req(q.people[0],{...body,requestId:crypto.randomUUID(),value:'5678'})).status,422);assert.equal((await q.read(q.people[1])).baseball.ownSecret,undefined);assert.equal((await q.read(q.people[2])).baseball.ownSecret,'1234');
 await q.send(q.people[1],{...body,requestId:crypto.randomUUID(),value:'5678'});s=await q.read();const attack={action:'club-guess',clubId:s.id,requestId:crypto.randomUUID(),round:1,turn:0,value:'5678'};await Promise.all([q.send(q.people[0],attack),q.send(q.people[0],attack)]);s=await q.read();assert.equal(s.baseball.turn,1);assert.equal(s.finished,false);assert.equal(s.baseball.lastChance,true);assert.equal(s.baseball.revealed,undefined);
 await q.send(q.people[1],{...attack,requestId:crypto.randomUUID(),turn:1,value:'1234'});s=await q.read();assert.equal(s.finished,true);assert.equal(s.winners.length,2);for(const p of q.people){const v=await q.read(p);assert.deepEqual(v.baseball.revealed,{'team-0':'1234','team-1':'5678'});assert.equal(v.history.length,1);}
 }finally{await q.close();}
});
