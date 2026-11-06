import test from 'node:test';
import assert from 'node:assert/strict';
import {createClub,clubClientState,clubAction,matchActor} from '../app/api/_lib/club';
import {previewClubInput} from '../app/club-input';
import {ShotPlayback} from '../app/club-motion';
import {simulateShot} from '../app/api/_lib/club-physics';
import {cleanInput} from '../realtime-club/protocol.js';
const ids=['a','b','c','d'];
function fixture(kind:'gomoku'|'alkkagi'){
 const s=createClub(kind,ids,{mode:'team',digits:3,obstacles:true,redIds:['a','c']});const m=s.matches[0];
 const p={clubId:s.id,requestId:crypto.randomUUID(),matchId:m.id,attempt:m.attempt,turn:m.turn,...(kind==='gomoku'?{action:'club-place',cell:112}:{action:'club-launch',discId:m.discs.find(d=>d.side===(m.turn+m.first)%2)!.id,dx:24,dy:0})};
 return {s,m,p,intent:{playerId:matchActor(m),payload:p}};
}
test('opponent preview cannot advance a turn, create a winner or mutate authoritative state',()=>{
 for(const kind of ['gomoku','alkkagi'] as const){const q=fixture(kind),before=JSON.stringify(q.s),view=clubClientState(q.s,'d'),m=previewClubInput(view,q.intent)!;
 assert.ok(m);assert.equal(m.turn,q.m.turn);assert.equal(m.winner,undefined);assert.equal(JSON.stringify(q.s),before);
 if(kind==='gomoku')assert.ok(m.board[112]);else assert.equal(m.launch?.provisional,true);
 }
});
test('stale, wrong-seat, occupied and malformed input is ignored',()=>{
 for(const kind of ['gomoku','alkkagi'] as const){const q=fixture(kind),view=clubClientState(q.s,'d');
 assert.equal(previewClubInput(view,{...q.intent,playerId:'outsider'}),null);
 for(const change of [{clubId:'old'},{attempt:99},{turn:99},{action:'club-settle-shot'},{action:'club-launch',dx:Infinity},{action:'club-launch',discId:99}])assert.equal(previewClubInput(view,{...q.intent,payload:{...q.p,...change}}),null);
 assert.equal(previewClubInput({...view,paused:['a']},q.intent),null);
 assert.equal(previewClubInput({...view,finished:true},q.intent),null);
 }
 const q=fixture('gomoku');q.m.board[112]=1;assert.equal(previewClubInput(clubClientState(q.s,'d'),q.intent),null);
 assert.equal(cleanInput({...q.p,cell:NaN},q.s.id),null);
});
test('early remote flight retains physical time across launch acknowledgement and settlement',()=>{
 const q=fixture('alkkagi'),view=clubClientState(q.s,'d'),preview=previewClubInput(view,q.intent)!;
 const motion=new ShotPlayback(0,q.m.discs),expected=simulateShot(q.m.discs,preview.launch!.discId,24,0,true);
 motion.sync(preview,true,100);assert.equal(motion.sample(125).moving,true);
 clubAction(q.s,q.intent.playerId,q.p);motion.sync(q.m,true,400);
 clubAction(q.s,'d',{action:'club-settle-shot',clubId:q.s.id,requestId:'settle:'+q.p.requestId,matchId:q.m.id,attempt:q.m.attempt,launchId:q.p.requestId});
 motion.sync(q.m,true,600);assert.deepEqual(motion.sample(1100).discs,expected.frames[20]);
 assert.equal(motion.sample(1300).moving,true);assert.equal(motion.sample(100+(expected.frames.length-1)*50).locked,false);
});
test('rejected preview rolls back; a later authoritative move still plays',()=>{
 const q=fixture('alkkagi'),preview=previewClubInput(clubClientState(q.s,'d'),q.intent)!,motion=new ShotPlayback(0,q.m.discs);
 motion.sync(preview,true,0);motion.reject(preview.launch!.shot);motion.sync(q.m,true,100);
 assert.equal(motion.sample(100).locked,false);assert.deepEqual(motion.sample(100).discs,q.m.discs);
 clubAction(q.s,q.intent.playerId,q.p);motion.sync(q.m,true,500);assert.equal(motion.sample(550).moving,true);
});
