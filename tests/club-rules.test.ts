import test from 'node:test';
import assert from 'node:assert/strict';
import { createClub, clubAction, clubClientState, matchActor, hasFive, judge } from '../app/api/_lib/club';
import { initialDiscs, simulateShot, BARRIERS } from '../app/api/_lib/club-physics';
const players=['a','b','c','d'];
test('duels require exactly two distinct players in every game; four-player modes stay four-player',()=>{
 for(const kind of ['gomoku','alkkagi','number-baseball'] as const){
  for(const roster of [[],['a'],['a','a'],players.slice(0,3),players,[...players,'e']]) assert.throws(()=>createClub(kind,roster,{mode:'duel'}));
  const s=createClub(kind,['a','b'],{mode:'duel'});
  assert.equal(s.setup.mode,'duel');assert.deepEqual(s.teams.map(t=>t.length),[1,1]);
  assert.throws(()=>createClub(kind,['a','b'],{mode:'team'}));
  assert.throws(()=>createClub(kind,['a','b']));
  const next=createClub(kind,['a','b'],s.setup,s);
  assert.deepEqual(next.teams,s.teams);assert.equal(next.first,1-s.first);
 }
});
test('gomoku duel finishes directly, and alkkagi duel uses one match without a bracket',()=>{
 const s=createClub('gomoku',['a','b'],{mode:'duel'}),m=s.matches[0];
 for(let t=0;t<9;t++)action(s,matchActor(m),{action:'club-place',matchId:m.id,attempt:1,turn:t,cell:t%2?127+Math.floor(t/2):112+Math.floor(t/2)});
 assert.equal(s.finished,true);assert.equal(s.matches.length,1);assert.equal(s.ranking.length,2);
 const a=createClub('alkkagi',['a','b'],{mode:'duel',obstacles:true}),am=a.matches[0];
 for(const d of am.discs)d.alive=d.side===0;
 action(a,matchActor(am),{action:'club-shot',matchId:am.id,attempt:1,turn:0,discId:0,dx:5,dy:0});
 assert.equal(a.finished,true);assert.equal(a.matches.length,1);assert.deepEqual(a.ranking,[am.sides[0],am.sides[1]]);
});
test('legacy baseball duel waits for both players, keeps guesses private and supports ties',()=>{
 const s=createClub('number-baseball',['a','b'],{mode:'duel'});delete s.baseball;s.secret='123';
 action(s,'a',{action:'club-guess',round:1,value:'123'});
 assert.equal(s.finished,false);assert.equal(clubClientState(s,'b').history.length,0);
 assert.equal(JSON.stringify(clubClientState(s,'b')).includes(JSON.stringify('123')),false);
 action(s,'b',{action:'club-guess',round:1,value:'123'});
 assert.equal(s.finished,true);assert.deepEqual(s.winners,['a','b']);
});
function action(s:ReturnType<typeof createClub>, player:string, p:Record<string,unknown>) {clubAction(s,player,{clubId:s.id,requestId:crypto.randomUUID(),...p});}
test('five and overline; no row wrapping',()=>{const b=Array(225).fill(0);for(let i=0;i<6;i++)b[30+i]=1;assert.ok(hasFive(b,32,1));const c=Array(225).fill(0);for(let i=13;i<18;i++)c[i]=1;assert.equal(hasFive(c,15,1),false);});
test('team order, authorization, stale turn and replay idempotency',()=>{const s=createClub('gomoku',players,{mode:'team',redIds:['a','c']});const m=s.matches[0];const order=[];for(let turn=0;turn<4;turn++){const actor=matchActor(m);order.push(actor);const p={clubId:s.id,requestId:crypto.randomUUID(),action:'club-place',matchId:m.id,attempt:1,turn,cell:112+turn};assert.throws(()=>clubAction(s,'outsider',p));clubAction(s,actor,p);clubAction(s,actor,p);assert.equal(m.turn,turn+1);assert.throws(()=>action(s,actor,{...p,requestId:crypto.randomUUID()}));}assert.deepEqual(order,['a','b','c','d']);assert.equal(s.matches[0].board.filter(Boolean).length,4);});
test('parallel semifinal and final/bronze bracket, reconnect persistence',()=>{const s=createClub('gomoku',players);function win(id:string){const m=s.matches.find(m=>m.id===id)!;for(let i=0;i<9;i++)action(s,matchActor(m),{action:'club-place',matchId:id,attempt:m.attempt,turn:m.turn,cell:i%2?127+Math.floor(i/2):112+Math.floor(i/2)});}win('semi-1');assert.equal(s.stage,0);win('semi-2');assert.equal(s.stage,1);assert.equal(s.matches.length,4);assert.equal(new Set(s.matches.slice(2).flatMap(m=>m.sides.flat())).size,4);const copy=JSON.parse(JSON.stringify(s));assert.equal(JSON.stringify(clubClientState(copy,'a')),JSON.stringify(clubClientState(s,'a')));win('final');assert.equal(s.finished,false);win('bronze');assert.equal(s.finished,true);assert.equal(s.ranking.length,4);});
test('draw replay requires both sides, swaps opening and rejects old attempt',()=>{const s=createClub('gomoku',players),m=s.matches[0];m.draw=true;for(const p of m.sides.flat())action(s,p,{action:'club-replay-draw',matchId:m.id,turn:0,attempt:1});assert.equal(m.attempt,2);assert.equal(m.first,0);assert.throws(()=>action(s,matchActor(m),{action:'club-place',matchId:m.id,turn:0,attempt:1,cell:0}));});

test('draw replay clears terminal flags and accepts the next real move or shot',()=>{
 for(const kind of ['gomoku','alkkagi'] as const){
  const s=createClub(kind,players,{mode:'team',redIds:['a','c']}),m=s.matches[0];
  m.draw=true;m.frames=[initialDiscs()];m.shot=7;
  for(const p of m.sides.flat())action(s,p,{action:'club-replay-draw',matchId:m.id,turn:0,attempt:1});
  assert.equal(m.draw,undefined);assert.equal(m.frames,undefined);assert.equal(m.shot,undefined);
  action(s,matchActor(m),{action:kind==='gomoku'?'club-place':'club-shot',matchId:m.id,turn:0,attempt:2,cell:112,discId:5,dx:0,dy:-120});
  assert.equal(m.turn,1);assert.equal(s.finished,false);
 }
});
test('number generation and S/B/OUT',()=>{for(const digits of [3,4] as const){const s=createClub('number-baseball',players,{digits});assert.equal(s.secret.length,digits);assert.equal(new Set(s.secret).size,digits);assert.match(s.secret,/^[1-9]+$/);}assert.deepEqual(judge('123','231'),{strikes:0,balls:3});assert.deepEqual(judge('123','456'),{strikes:0,balls:0});});
test('simultaneous guesses are private, only all submissions resolve, joint win',()=>{const s=createClub('number-baseball',players);delete s.baseball;s.secret='123';action(s,'a',{action:'club-guess',round:1,value:'123'});const view=clubClientState(s,'b');assert.equal(view.history.length,0);assert.equal('secret' in view,false);assert.equal('pending' in view,false);assert.equal('histories' in view,false);assert.equal(JSON.stringify(view).includes(JSON.stringify('123')),false);for(const p of players.slice(1))action(s,p,{action:'club-guess',round:1,value:p==='b'?'123':'456'});assert.deepEqual(s.winners,['a','b']);assert.equal(s.finished,true);assert.equal(clubClientState(s,'c').history[0].value,'456');});
test('legacy team guesses share private history and alternate inputter; reconnect does not auto-submit',()=>{const s=createClub('number-baseball',players,{mode:'team',redIds:['a','c']});delete s.baseball;s.secret='123';assert.throws(()=>action(s,'c',{action:'club-guess',round:1,value:'456'}));for(const p of ['a','b'])action(s,p,{action:'club-guess',round:1,value:'456'});assert.equal(s.round,2);assert.equal(clubClientState(s,'c').inputter,'c');assert.equal(clubClientState(s,'c').history.length,1);s.paused=['a'];assert.throws(()=>action(s,'c',{action:'club-guess',round:2,value:'123'}));assert.equal(s.round,2);});
test('physics deterministic collision, stopping, boundary elimination and symmetric obstacles',()=>{const d=initialDiscs();d[0].x=200;d[0].y=300;d[5].x=245;d[5].y=300;const a=simulateShot(d,0,160,0,false);assert.deepEqual(a,simulateShot(d,0,160,0,false));assert.ok(a.discs[5].x>245);assert.ok(a.discs.every(d=>d.vx===0&&d.vy===0));const edge=initialDiscs();edge[0].x=599;assert.equal(simulateShot(edge,0,180,0,false).discs[0].alive,false);const o=initialDiscs();o[0].x=300;o[0].y=150;const blocked=simulateShot(o,0,0,160,true);assert.ok(blocked.frames.some(frame=>frame[0].vy<0));assert.equal(BARRIERS.length,5);assert.equal(BARRIERS[0].y,600-BARRIERS[4].y);assert.equal(BARRIERS[0].x,600-BARRIERS[4].x);assert.throws(()=>simulateShot(d,0,Infinity,0,false));});
test('alkkagi accepts only server-validated own discs, rematch changes opening',()=>{const s=createClub('alkkagi',players,{mode:'team',redIds:['a','c']});const m=s.matches[0];assert.throws(()=>action(s,'a',{action:'club-shot',matchId:m.id,turn:0,attempt:1,discId:5,dx:0,dy:-180}));action(s,'a',{action:'club-shot',matchId:m.id,turn:0,attempt:1,discId:0,dx:0,dy:150});assert.equal(m.turn,1);assert.ok(m.frames!.length>1);const next=createClub('alkkagi',players,s.setup,s);assert.equal(next.first,1);});
test('simultaneous final alkkagi removals draw; team baseball tied winners share records only with their team',()=>{const s=createClub('alkkagi',players,{mode:'team',redIds:['a','c']}),m=s.matches[0];for(const d of m.discs)d.alive=false;Object.assign(m.discs[0],{alive:true,x:530,y:270});Object.assign(m.discs[5],{alive:true,x:599,y:270});action(s,'a',{action:'club-shot',matchId:m.id,turn:0,attempt:1,discId:0,dx:180,dy:0});assert.equal(m.draw,true);assert.equal(s.finished,false);const n=createClub('number-baseball',players,{mode:'team',redIds:['a','c']});delete n.baseball;n.secret='123';for(const p of ['a','b'])action(n,p,{action:'club-guess',round:1,value:'123'});assert.equal(n.winners.length,2);assert.equal(n.finished,true);assert.deepEqual(clubClientState(n,'a').history,clubClientState(n,'c').history);assert.equal(clubClientState(n).history.length,0);});

test('malformed Omok coordinate types cannot silently become a legal cell after opening',()=>{
 const s=createClub('gomoku',players,{mode:'team',redIds:['a','c']}),m=s.matches[0];
 action(s,matchActor(m),{action:'club-place',matchId:m.id,attempt:1,turn:0,cell:112});
 for(const cell of [null,true,false,'','0',[],{},-1,225,NaN,Infinity,1.5]){
  const before=JSON.stringify(m);
  assert.throws(()=>action(s,matchActor(m),{action:'club-place',matchId:m.id,attempt:1,turn:1,cell}));
  assert.equal(JSON.stringify(m),before);
 }
});
