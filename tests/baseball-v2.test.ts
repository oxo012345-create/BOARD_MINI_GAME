import test from 'node:test';
import assert from 'node:assert/strict';
import {createClub,clubAction,clubClientState,baseballActor,type ClubState} from '../app/api/_lib/club';
import {activeBaseballKey,baseballKeys,baseballKey} from '../app/api/_lib/club-baseball';
const players=['a','b','c','d'];
const act=(s:ClubState,p:string,body:Record<string,unknown>)=>clubAction(s,p,{clubId:s.id,requestId:crypto.randomUUID(),...body});
function setup(s:ClubState){for(const k of baseballKeys(s))act(s,baseballActor(s,k),{action:'club-secret',value:k===baseballKeys(s)[0]?'123':'456'});}
function attack(s:ClubState,value:string){const k=activeBaseballKey(s)!;act(s,baseballActor(s,k),{action:'club-guess',round:s.round,turn:s.baseball!.turn,value});}
test('secret setup validates, seals each side, forbids noncaptains and guesses before ready',()=>{
 const s=createClub('number-baseball',players,{mode:'team',redIds:['a','c']});
 assert.equal(s.baseball!.phase,'setup');
 assert.throws(()=>act(s,'a',{action:'club-guess',round:1,turn:0,value:'123'}),/비밀/);
 assert.throws(()=>act(s,'c',{action:'club-secret',value:'123'}),/첫 번째/);
 for(const value of ['112','012','12','1234','abc'])assert.throws(()=>act(s,'a',{action:'club-secret',value}));
 const request={clubId:s.id,requestId:'setup-a',action:'club-secret',value:'123'};clubAction(s,'a',request);clubAction(s,'a',request);
 assert.equal(s.baseball!.phase,'setup');assert.throws(()=>act(s,'a',{action:'club-secret',value:'456'}),/이미/);
 assert.equal(clubClientState(s,'c').baseball?.ownSecret,'123');assert.equal(clubClientState(s,'b').baseball?.ownSecret,undefined);
 assert.equal(JSON.stringify(clubClientState(s,'b')).includes(JSON.stringify('123')),false);assert.equal(JSON.stringify(clubClientState(s)).includes(JSON.stringify('123')),false);
 act(s,'b',{action:'club-secret',value:'456'});assert.equal(s.baseball!.phase,'play');
 assert.equal(clubClientState(s,'a').baseball?.ownSecret,'123');assert.equal(clubClientState(s,'a').baseball?.revealed,undefined);
 assert.equal(JSON.stringify(clubClientState(s,'a')).includes(JSON.stringify('456')),false);
});
test('duel first solver waits for equalizing turn; both correct is draw, secrets reveal only at end',()=>{
 const s=createClub('number-baseball',['a','b'],{mode:'duel'});setup(s);const [first,second]=baseballKeys(s);
 attack(s,'456');assert.equal(s.finished,false);assert.equal(clubClientState(s,second).baseball?.lastChance,true);assert.equal(s.baseball!.turn,1);
 assert.equal(clubClientState(s,second).history.length,0);assert.equal(clubClientState(s,second).baseball?.revealed,undefined);
 attack(s,'123');assert.equal(s.finished,true);assert.deepEqual(s.winners,[first,second]);assert.equal(clubClientState(s).baseball?.revealed?.[first],'123');
});
test('missed equalizing chance gives first player victory; second solver also wins fairly',()=>{
 for(const firstWins of [true,false]){const s=createClub('number-baseball',['a','b'],{mode:'duel'});setup(s);attack(s,firstWins?'456':'789');attack(s,firstWins?'789':'123');assert.equal(s.finished,true);assert.deepEqual(s.winners,[baseballKeys(s)[firstWins?0:1]]);}
});
test('four team members alternate; out-of-turn, stale, repeated and absent submissions are rejected',()=>{
 const s=createClub('number-baseball',players,{mode:'team',redIds:['a','c']});setup(s);const order=[];
 for(let i=0;i<4;i++){const k=activeBaseballKey(s)!,p=baseballActor(s,k);order.push(p);
 const body={action:'club-guess',round:s.round,turn:s.baseball!.turn,value:['789','678','987','876'][i]};
 const other=players.find(id=>baseballKey(s,id)!==k)!;assert.throws(()=>act(s,other,body));
 const request={clubId:s.id,requestId:'turn-'+i,...body};clubAction(s,p,request);clubAction(s,p,request);assert.equal(s.baseball!.turn,i+1);
 assert.throws(()=>act(s,p,body));}
 assert.deepEqual(order,['a','b','c','d']);assert.equal(s.round,3);
 assert.throws(()=>attack(s,'789'),/이미 추리/);assert.equal(s.baseball!.turn,4);
 s.paused=['b'];assert.throws(()=>attack(s,'321'),/복귀/);s.paused=[];
 const copy=JSON.parse(JSON.stringify(s));assert.deepEqual(clubClientState(copy,'c'),clubClientState(s,'c'));
 assert.deepEqual(clubClientState(s,'a').history,clubClientState(s,'c').history);assert.notDeepEqual(clubClientState(s,'a').history,clubClientState(s,'b').history);
});
test('individual keeps four simultaneous private guesses and reveals common answer only on completion',()=>{
 const s=createClub('number-baseball',players,{mode:'individual',digits:4});s.secret='1234';assert.equal(s.baseball!.phase,'play');
 for(const p of players.slice(0,3))act(s,p,{action:'club-guess',round:1,value:p==='a'?'1234':'5678'});
 assert.equal(s.finished,false);assert.equal(clubClientState(s,'a').history.length,0);assert.equal(JSON.stringify(clubClientState(s,'d')).includes('1234'),false);
 act(s,'d',{action:'club-guess',round:1,value:'1234'});assert.equal(s.finished,true);assert.deepEqual(s.winners,['a','d']);assert.equal(clubClientState(s).baseball?.revealed?.common,'1234');
});
test('rematch resets secrets, rotates opener, and never reuses previous private numbers',()=>{
 const s=createClub('number-baseball',['a','b'],{mode:'duel'});setup(s);attack(s,'456');attack(s,'123');const next=createClub('number-baseball',s.players,s.setup,s);
 assert.equal(next.first,1);assert.equal(next.baseball!.phase,'setup');assert.deepEqual(next.baseball!.secrets,{});assert.deepEqual(next.histories,{});assert.notEqual(next.id,s.id);
});
