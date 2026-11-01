import test from 'node:test';
import assert from 'node:assert/strict';
import {createClub,judge,clubAction,clubClientState,baseballActor,type ClubState} from '../app/api/_lib/club';
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


test('3/4/5 digit settings generate valid secrets and repeat OFF stays backward compatible',()=>{
 for(const digits of [3,4,5] as const)for(const allowDuplicates of [false,true]){
  for(let i=0;i<20;i++){const s=createClub('number-baseball',players,{mode:'individual',digits,allowDuplicates});assert.equal(s.secret.length,digits);assert.match(s.secret,/^[1-9]+$/);assert.equal(s.setup.allowDuplicates,allowDuplicates);if(!allowDuplicates)assert.equal(new Set(s.secret).size,digits);}
  const s=createClub('number-baseball',players,{mode:'individual',digits,allowDuplicates});s.secret='1'.repeat(digits);
  if(allowDuplicates){for(const p of players)act(s,p,{action:'club-guess',round:1,value:s.secret});assert.equal(s.finished,true);assert.deepEqual(s.winners,players);}
  else assert.throws(()=>act(s,'a',{action:'club-guess',round:1,value:s.secret}),/중복/);
 }
 const legacy=createClub('number-baseball',players,{digits:4});delete legacy.setup.allowDuplicates;assert.throws(()=>act(legacy,'a',{action:'club-guess',round:1,value:'1122'}),/중복/);
});
test('repeat scoring counts each secret digit once, reserving strikes before balls',()=>{
 for(const [secret,value,strikes,balls] of [['11223','11111',2,0],['11223','22111',0,4],['12345','11111',1,0],['11112','21111',3,2],['1122','1212',2,2]] as const){assert.deepEqual(judge(secret,value),{strikes,balls});assert.deepEqual(judge(value,secret),{strikes,balls});}
});
test('5-digit repeated team secrets remain private and rematch preserves options',()=>{
 const s=createClub('number-baseball',players,{mode:'team',digits:5,allowDuplicates:true,redIds:['a','c']});
 act(s,'a',{action:'club-secret',value:'11223'});act(s,'b',{action:'club-secret',value:'44556'});
 assert.equal(clubClientState(s,'c').baseball?.ownSecret,'11223');assert.equal(JSON.stringify(clubClientState(s,'d')).includes('11223'),false);
 attack(s,'44556');attack(s,'99999');assert.deepEqual(s.winners,['team-0']);
 const next=createClub('number-baseball',players,s.setup,s);assert.equal(next.setup.digits,5);assert.equal(next.setup.allowDuplicates,true);assert.deepEqual(next.baseball!.secrets,{});
});
