import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createClub, clubAction, clubClientState, type ClubState } from '../app/api/_lib/club';
import { commitClubAction } from '../app/api/_lib/club-fast';
import { INDIVIDUAL_SUBMISSION_SQL, individualSubmissionArgs } from '../app/api/_lib/club-submit';
import type { RoomState } from '../app/api/_lib/rooms';

function fixture(){
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE rooms(code TEXT PRIMARY KEY,state TEXT,updated_at TEXT)');
 const ids=['a','b','c','d'],club=createClub('number-baseball',ids,{mode:'individual',digits:3});club.secret='123';
 const room:RoomState={code:'1234',hostId:'a',view:'game',roundNumber:1,revision:1,players:ids.map(id=>({id,name:id,avatar:'🙂',sessionHash:id,status:'active',lastSeen:0,joinedAt:0})),game:{id:'number-baseball',club}};
 db.prepare('INSERT INTO rooms(code,state) VALUES(?,?)').run(room.code,JSON.stringify(room));
 const read=()=>JSON.parse((db.prepare('SELECT state FROM rooms').get() as {state:string}).state) as RoomState;
 const set=(r:RoomState)=>db.prepare('UPDATE rooms SET state=?').run(JSON.stringify(r));
 let atomic=0,cas=0;
 const io={read:async()=>read(),write:async(r:RoomState,rev:number)=>{cas++;if(read().revision!==rev)return false;set({...r,revision:rev+1});return true;},tick:()=>{},submitIndividual:async(r:RoomState,id:string,hash:string,p:Record<string,unknown>)=>{atomic++;const row=db.prepare(INDIVIDUAL_SUBMISSION_SQL).get(...individualSubmissionArgs(r.code,r.game!.club as ClubState,id,hash,p)) as {state:string}|undefined;return row?JSON.parse(row.state) as RoomState:null;}};
 const payload=(value='456',round=1)=>({action:'club-guess',clubId:club.id,requestId:crypto.randomUUID(),round,value});
 const send=(id:string,p:Record<string,unknown>,initial=read())=>commitClubAction(initial,id,id,p,io);
 return {ids,club,room,read,set,payload,send,counts:()=>({atomic,cas})};
}
test('four stale snapshots merge independently in SQLite; last write alone publishes verdict and all histories',async()=>{
 const q=fixture(),initial=q.read(),values=['123','132','456','789'];
 for(let i=0;i<4;i++){
  const r=await q.send(q.ids[i],q.payload(values[i]),structuredClone(initial));assert.equal(r.status,200);
  const s=q.read().game!.club as ClubState;
  for(const id of q.ids){const v=clubClientState(s,id);assert.equal('pendingResults' in v,false);assert.equal(v.history.length,i===3?1:0);}
  if(i<3){assert.equal(s.finished,false);assert.equal(Object.keys(s.pending).length,i+1);}
 }
 const r=q.read(),s=r.game!.club as ClubState;assert.equal(r.view,'result');assert.deepEqual(s.winners,['a']);assert.deepEqual(s.ranking,[['a']]);assert.equal(s.processed.length,4);assert.deepEqual(s.pending,{});assert.deepEqual(s.pendingResults,{});
 assert.deepEqual(q.counts(),{atomic:4,cas:0});
});
test('atomic submissions match the rules engine over multiple rounds, including joint winners',async()=>{
 const q=fixture(),reference=JSON.parse(JSON.stringify(q.club));
 for(const values of [['456','457','458','459'],['132','213','231','321'],['123','123','123','123']]){
  const initial=q.read(),round=reference.round;
  const actions=q.ids.map((id,i)=>({id,p:q.payload(values[i],round)}));
  const results=await Promise.all(actions.map(({id,p})=>q.send(id,p,structuredClone(initial))));assert.ok(results.every(r=>r.status===200));
  for(const {id,p} of actions)clubAction(reference,id,p);
  const actual=q.read().game!.club as ClubState;
  for(const id of q.ids)assert.deepEqual(clubClientState(actual,id),clubClientState(reference,id));
 }
 assert.deepEqual(q.counts(),{atomic:12,cas:0});
});
test('duplicate simultaneous request is applied once; invalid and stale round cannot alter state',async()=>{
 const q=fixture(),p=q.payload(),initial=q.read();
 assert.ok((await Promise.all([q.send('a',p,structuredClone(initial)),q.send('a',p,structuredClone(initial))])).every(r=>r.status===200));
 assert.equal((q.read().game!.club as ClubState).processed.length,1);
 for(const bad of [q.payload('112'),q.payload('567',2),{...q.payload(),clubId:'old'}]){const before=JSON.stringify(q.read());assert.equal((await q.send('b',bad)).status,422);assert.equal(JSON.stringify(q.read()),before);}
});
test('an old deployment partial round finishes through CAS before entering the atomic path',async()=>{
 const q=fixture(),r=q.read();clubAction(r.game!.club as ClubState,'a',q.payload());q.set(r);
 for(const id of ['b','c','d'])assert.equal((await q.send(id,q.payload())).status,200);
 assert.equal((q.read().game!.club as ClubState).round,2);assert.deepEqual(q.counts(),{atomic:0,cas:3});
 assert.equal((await q.send('a',q.payload('567',2))).status,200);assert.equal(q.counts().atomic,1);
});
test('SQL rechecks session, pause and game identity after the initial read',async()=>{
 for(const change of ['removed','paused','game']){
  const q=fixture(),initial=q.read(),latest=q.read();if(change==='removed')latest.players=latest.players.filter(p=>p.id!=='a');if(change==='paused')(latest.game!.club as ClubState).paused=['b'];if(change==='game')(latest.game!.club as ClubState).id='new';q.set(latest);
  const result=await q.send('a',q.payload(),initial);assert.equal(result.status,change==='removed'?401:422);assert.equal(JSON.stringify(q.read()),JSON.stringify(latest));
 }
});
