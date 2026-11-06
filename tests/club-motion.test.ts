import test from 'node:test';
import assert from 'node:assert/strict';
import { ShotPlayback } from '../app/club-motion';
import {createClub,clubAction,clubClientState,matchActor} from '../app/api/_lib/club';
import { initialDiscs, simulateShot } from '../app/api/_lib/club-physics';
const before=initialDiscs(),after=before.map(d=>({...d,x:d.x+10})),frames=[before,after];

test('late remote shots keep the full path at the original 50 ms frame cadence',()=>{
 const longFrames=Array.from({length:81},(_,i)=>before.map(d=>({...d,x:d.x+i})));
 const p=new ShotPlayback(0,before);p.receive(1,longFrames,longFrames.at(-1)!,90000);
 assert.deepEqual(p.sample(90000).discs,before);assert.equal(p.sample(90600).discs[0].x,before[0].x+12);
 p.receive(1,longFrames,longFrames.at(-1)!,90800);assert.equal(p.sample(90800).moving,true);
 assert.equal(p.sample(91200).moving,true);assert.equal(p.sample(94000).locked,false);assert.deepEqual(p.sample(94000).discs,longFrames.at(-1));
 // Opening a completed snapshot is a reconnect, not a new live shot.
 const rejoined=new ShotPlayback(1,longFrames.at(-1)!);rejoined.receive(1,longFrames,longFrames.at(-1)!,100000);assert.equal(rejoined.sample(100000).moving,false);
});

test('local release moves before network acknowledgement, waits without replay, then unlocks',()=>{
 const p=new ShotPlayback(0,before);assert.ok(p.predict(1,frames,100));assert.ok(p.sample(125).discs[0].x>before[0].x);
 assert.equal(p.sample(2000).awaiting,true);assert.equal(p.predict(1,frames,2100),false);
 p.receive(0,[],before,2200);assert.deepEqual(p.sample(2200).discs,after);
 p.receive(1,frames,after,3000);assert.deepEqual(p.sample(3000),{discs:after,moving:false,awaiting:false,locked:false});
 p.receive(1,frames,after,4000);assert.equal(p.sample(4000).locked,false);assert.ok(p.predict(2,frames,4100));
});
test('acknowledgement during animation does not reset its clock; duplicate and stale snapshots cannot lock it',()=>{
 const p=new ShotPlayback(0,before);p.predict(1,frames,100);p.receive(1,frames,after,120);
 assert.equal(p.sample(125).discs[0].x,before[0].x+5);p.receive(1,frames,after,130);p.receive(0,frames,before,135);
 assert.equal(p.sample(150).locked,false);assert.deepEqual(p.sample(150).discs,after);
});
test('remote animation, background resume, missing frames, rejection and successful retry',()=>{
 const p=new ShotPlayback(0,before);p.receive(1,frames,after,100);assert.equal(p.sample(125).moving,true);assert.equal(p.sample(90000).locked,false);
 p.receive(2,[],before,90001);assert.equal(p.sample(90002).locked,false);assert.deepEqual(p.sample(90002).discs,before);
 p.predict(3,frames,90003);p.reject(3);assert.deepEqual(p.sample(90004).discs,before);assert.ok(p.predict(3,frames,90005));
 p.receive(3,frames,after,90006);p.reject(3);assert.equal(p.sample(90007).moving,true);
});
test('multiple physical shots settle, acknowledge and unlock in sequence',()=>{
 let discs=before;const p=new ShotPlayback(0,discs);
 for(let shot=1;shot<=8;shot++){const d=discs.find(d=>d.alive&&d.side===(shot-1)%2)!;const result=simulateShot(discs,d.id,12,0,true);const start=shot*20000;
 assert.ok(p.predict(shot,result.frames,start));assert.equal(p.sample(start+20).locked,true);
 p.receive(shot,result.frames,result.discs,start+1000);assert.equal(p.sample(start+15000).locked,false);discs=result.discs;assert.deepEqual(p.sample(start+15001).discs,discs);}
});


test('launch starts remote playback before final state; late acknowledgements never speed up or replay motion',()=>{
 const s=createClub('alkkagi',['a','b','c','d'],{mode:'team',redIds:['a','c'],obstacles:true}),m=s.matches[0],actor=matchActor(m),d=m.discs.find(d=>d.side===0)!;
 const local=new ShotPlayback(0,m.discs),remote=new ShotPlayback(0,m.discs);
 const expected=simulateShot(m.discs,d.id,24,0,true);local.predict(1,expected.frames,0);
 clubAction(s,actor,{action:'club-launch',clubId:s.id,requestId:'launch-one',matchId:m.id,attempt:1,turn:0,discId:d.id,dx:24,dy:0});
 assert.equal(m.turn,0);assert.equal(m.frames,undefined);assert.equal(m.launch!.settled,false);
 remote.sync(m,true,100);assert.equal(remote.sample(125).moving,true);assert.equal(local.sample(25).discs[0].x,remote.sample(125).discs[0].x);
 const pending=JSON.parse(JSON.stringify(m));clubAction(s,'d',{action:'club-settle-shot',clubId:s.id,requestId:'settle:launch-one',matchId:m.id,attempt:1,launchId:'launch-one'});
 const compact=clubClientState(s,'b',true).matches[0];assert.equal(compact.frames,undefined);
 remote.sync(compact,true,200);remote.sync(compact,true,300);remote.sync(pending,true,400);
 assert.deepEqual(remote.sample(600).discs,expected.frames[10]);assert.equal(remote.sample(1300).moving,true);
 const duration=(expected.frames.length-1)*50;assert.deepEqual(remote.sample(100+duration).discs,m.discs);assert.equal(remote.sample(100+duration).locked,false);
 const missed=new ShotPlayback(0,pending.discs);missed.sync(compact,true,9000);assert.deepEqual(missed.sample(9500).discs,expected.frames[10]);
});
