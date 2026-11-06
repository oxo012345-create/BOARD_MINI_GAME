import test from 'node:test';
import assert from 'node:assert/strict';
import { commitClubAction } from '../app/api/_lib/club-fast';
import { createClub, clubClientState } from '../app/api/_lib/club';
import type { RoomState } from '../app/api/_lib/rooms';

function fixture() {
 const ids=['a','b','c','d'];
 const club=createClub('number-baseball',ids,{mode:'individual',digits:3});club.secret='123';
 let saved:RoomState={code:'1234',hostId:'a',view:'game',roundNumber:1,revision:1,players:ids.map(id=>({id,name:id,avatar:'🙂',sessionHash:id,joinedAt:0,lastSeen:0,status:'active'})),game:{id:'number-baseball',club}};
 let writes=0,conflicts=0;
 const io={read:async()=>structuredClone(saved),write:async(room:RoomState,revision:number)=>{writes++;if(saved.revision!==revision){conflicts++;return false;}saved=structuredClone({...room,revision:revision+1});return true;},tick:()=>{}};
 return {ids,club,io,read:()=>structuredClone(saved),set:(r:RoomState)=>{saved=r;},counts:()=>({writes,conflicts})};
}
test('four simultaneous guesses finish within one HTTP call each, without lost writes or leaked answers',async()=>{
 const q=fixture(),initial=q.read();
 const payloads=q.ids.map(()=>({action:'club-guess',clubId:q.club.id,requestId:crypto.randomUUID(),round:1,value:'123'}));
 const results=await Promise.all(q.ids.map((id,i)=>commitClubAction(structuredClone(initial),id,id,payloads[i],q.io)));
 assert.ok(results.every(r=>r.status===200));assert.ok(q.counts().conflicts>=3);
 const state=q.read().game!.club as typeof q.club;
 assert.equal(state.finished,true);assert.equal(state.winners.length,4);assert.equal(state.processed.length,4);
 for(const id of q.ids){const view=clubClientState(state,id);assert.equal(view.history.length,1);assert.equal('secret' in view,false);assert.equal('pending' in view,false);}
 const writes=q.counts().writes;
 const retry=await commitClubAction(q.read(),'a','a',payloads[0],q.io);
 assert.equal(retry.status,200);assert.equal(q.counts().writes,writes,'acknowledged retry must not touch D1');
});
test('conflict refresh rechecks removed sessions, pauses and changed game instead of overwriting them',async()=>{
 for(const change of ['removed','paused','newGame','otherGame']){
  const q=fixture(),initial=q.read();let once=true;
  const io={...q.io,write:async(r:RoomState,revision:number)=>{if(once){once=false;const next=q.read();next.revision=2;const s=next.game!.club as typeof q.club;if(change==='removed')next.players=next.players.filter(p=>p.id!=='a');if(change==='paused')s.paused=['b'];if(change==='newGame')s.id='new-game';if(change==='otherGame')next.game={id:'mafia'};q.set(next);return false;}return q.io.write(r,revision);}};
  const result=await commitClubAction(initial,'a','a',{action:'club-guess',clubId:q.club.id,requestId:crypto.randomUUID(),round:1,value:'123'},io);
  assert.equal(result.status,change==='removed'?401:change==='otherGame'?409:422);assert.equal(q.read().revision,2);
 }
});
test('persistent write contention is bounded and reports a retryable conflict',async()=>{
 const q=fixture();let attempts=0;
 const result=await commitClubAction(q.read(),'a','a',{action:'club-guess',clubId:q.club.id,requestId:crypto.randomUUID(),round:1,value:'123'},{...q.io,write:async()=>{attempts++;return false;}});
 assert.equal(attempts,8);assert.equal(result.status,409);assert.equal(result.code,'ROOM_CONFLICT');
});


test('gomoku fast path validates turns and preserves the winning board under concurrent requests',async()=>{
 const q=fixture(),room=q.read(),s=createClub('gomoku',q.ids,{mode:'team',redIds:['a','c']});room.game={id:'gomoku',club:s};q.set(room);
 const payload={action:'club-place',clubId:s.id,requestId:crypto.randomUUID(),matchId:s.matches[0].id,attempt:1,turn:0,cell:112};
 const responses=await Promise.all([commitClubAction(q.read(),'a','a',payload,q.io),commitClubAction(q.read(),'a','a',{...payload,requestId:crypto.randomUUID(),cell:111},q.io)]);
 assert.equal(responses.filter(r=>r.status===200).length,1);assert.equal(q.read().game!.club!.matches[0].turn,1);
 assert.equal((await commitClubAction(q.read(),'a','a',payload,q.io)).status,200);
 assert.equal((await commitClubAction(q.read(),'c','c',{...payload,requestId:crypto.randomUUID(),turn:1,cell:111},q.io)).status,422);
});


test('launch publishes input atomically; four settlers advance once and recover a disconnected shooter',async()=>{
 const q=fixture(),room=q.read(),s=createClub('alkkagi',q.ids,{mode:'team',redIds:['a','c'],obstacles:true});room.game={id:'alkkagi',club:s};q.set(room);const m=s.matches[0],disc=m.discs.find(d=>d.side===0)!;
 const launch={action:'club-launch',clubId:s.id,requestId:'flight',matchId:m.id,attempt:1,turn:0,discId:disc.id,dx:24,dy:0};
 for(const bad of [{...launch,dx:null},{...launch,dy:'0'},{...launch,discId:9}])assert.equal((await commitClubAction(q.read(),'a','a',bad,q.io)).status,422);
 assert.equal((await commitClubAction(q.read(),'b','b',launch,q.io)).status,422);
 assert.equal((await commitClubAction(q.read(),'a','a',launch,q.io)).status,200);
 const pending=q.read(),flight=pending.game!.club!.matches[0];assert.equal(flight.turn,0);assert.equal(flight.frames,undefined);assert.deepEqual(flight.discs,m.discs);
 assert.equal((await commitClubAction(q.read(),'a','a',{...launch,requestId:'double'},q.io)).status,422);
 pending.game!.club!.paused=['a'];q.set(pending);
 const settle={action:'club-settle-shot',clubId:s.id,requestId:'settle:flight',matchId:m.id,attempt:1,launchId:'flight'};
 const replies=await Promise.all(q.ids.map(id=>commitClubAction(q.read(),id,id,settle,q.io)));assert.ok(replies.every(r=>r.status===200));
 const final=q.read().game!.club!;assert.equal(final.matches[0].turn,1);assert.equal(final.matches[0].launch!.settled,true);assert.equal(final.processed.filter(id=>id==='settle:flight').length,1);
 assert.equal((await commitClubAction(q.read(),'b','b',{...settle,requestId:'old',launchId:'old'},q.io)).status,422);
});
