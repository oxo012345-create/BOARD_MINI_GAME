import {test} from 'node:test';import assert from 'node:assert/strict';
import {MatchSession} from '../public/swarm/integration.js';
import {BattlePolicy} from '../public/swarm/battle-policy.js';
import {OnlineRoom} from '../app/api/_lib/vendor/swarm/room.js';
import {matchResult} from '../public/swarm/match-result.js';
import {decodeSnapshot} from '../public/swarm/net-protocol.js';
function fixture(mode='duel'){
 let time=0;const ids=mode==='duel'?[0,1]:[0,1,2,3],s=new MatchSession({mode,seed:42,humans:ids,participants:ids.map(id=>({id:'seat-'+id,name:'Player '+id}))}),g=s.game;
 s.policy=new BattlePolicy(g,{clock:()=>time,online:true});const p=s.policy;
 return{s,g,p,at:t=>{time=t;},update:(t,present=ids)=>{time=t;p.update({present,force:true});},ids};
}
for(const mode of ['duel','team','ffa'])test(`${mode}: combat spectators remain eligible, overtime starts at5m and hard6m ends in a draw`,()=>{
 const {g,p,at,update,ids}=fixture(mode);
 for(let t=0;t<=350;t+=10){at(t);p.events(ids.map(player=>({type:'shot',player})));update(t);assert.equal(g.over,false);}
 assert.equal(g.matchClock.overtime,true);assert.equal(g.matchClock.remaining,10);update(360);assert.equal(g.over,true);assert.equal(g.reason,'timeout');assert.equal(g.winner,null);assert.ok(g.players.every(p=>!p.eliminated));
});
test('5m overtime and6m cap apply to AI practice too',()=>{
 const s=new MatchSession({seed:3});s.game.time=299.99;s.tick(1/30);assert.equal(s.game.over,false);assert.equal(s.game.matchClock.overtime,true);s.game.time=359.99;s.tick(1/30);assert.equal(s.game.reason,'timeout');
});
test('all connected but inactive receive30s warning, then a simultaneous draw',()=>{
 const {g,update}=fixture('ffa');update(89);assert.ok(g.players.every(p=>p.idleWarning===null));update(90);assert.ok(g.players.every(p=>p.idleWarning===30));update(119);assert.equal(g.over,false);update(120);assert.equal(g.reason,'inactive');assert.equal(g.winner,null);
});
test('explicit continue is sequenced, clears inactivity and cannot evade the absolute deadline',()=>{
 const {s,g,update}=fixture();update(90);assert.ok(s.dispatch('seat-0',{type:'active',sequence:1,matchId:s.id}));update(110);assert.equal(g.players[0].idleWarning,null);assert.equal(s.dispatch('seat-0',{type:'active',sequence:1,matchId:s.id}),false);update(120);assert.equal(g.reason,'forfeit');assert.equal(g.winner,0);
});
test('one2v2 forfeit removes only that seat and the teammate keeps playing',()=>{
 const {g,p,at,update}=fixture('team'),ally=g.unitsOf(1).map(u=>u.id),base=g.zonesOf(1)[0].id;
 at(100);for(const id of [0,1,2])p.command(id,{type:'active'});update(120);
 assert.equal(g.over,false);assert.equal(g.players[3].eliminated,true);assert.equal(g.players[3].forfeitReason,'idle');assert.deepEqual(g.unitsOf(1).map(u=>u.id),ally);assert.equal(g.zoneMap.get(base).owner,1);assert.equal(g.unitsOf(3).length,0);assert.equal(g.zonesOf(3).length,0);
});
test('a teammate observing allied combat is not classified as AFK',()=>{
 const {g,p,at,update}=fixture('team');for(const t of [30,60,90,119]){at(t);p.events([{type:'hit',player:0},{type:'shot',player:1}]);update(t);}assert.ok(g.players.every(p=>p.idleWarning===null&&!p.eliminated));
});
test('FFA players can watch combat between other armies without receiving a false AFK warning',()=>{
 const {g,p,at,update}=fixture('ffa');for(const t of [30,60,90,119]){at(t);p.events([{type:'shot',player:1},{type:'hit',player:2}]);update(t);}assert.ok(g.players.every(p=>p.idleWarning===null&&!p.eliminated));
});
test('automatic production, regeneration, invalid orders and repeated no-op destinations cannot renew activity',()=>{
 const {g,p,at,update,s}=fixture();at(80);p.events([{type:'spawn',player:0},{type:'command',player:0}]);
 assert.equal(s.dispatch('seat-0',{type:'upgrade',kind:'invalid',sequence:1,matchId:s.id}),false);
 p.orders[0]='move:6:56';p.command(0,{type:'move',x:100,y:900});update(120);assert.equal(g.reason,'inactive');
});
test('meaningful ordered travel is progress; local separation jitter is not',()=>{
 const {g,p,at,update}=fixture();const u=g.units[0];Object.assign(u,{x:100,y:900,tx:300,ty:900,movingOrder:true,walking:true});update(80);u.x+=3;update(81);assert.equal(p.progress[0],0);u.x+=30;update(82);assert.equal(p.progress[0],82);at(90);p.command(1,{type:'active'});update(120);assert.equal(g.over,false);
});
test('one disconnected seat has2m grace and its ally never forfeits with it',()=>{
 const {g,p,at,update}=fixture('team');update(1);for(const t of [30,60,90,120]){at(t);for(const id of [0,1,2])p.command(id,{type:'active'});update(t,[0,1,2]);}assert.equal(g.players[3].eliminated,false);update(121,[0,1,2]);assert.equal(g.players[3].forfeitReason,'disconnected');assert.equal(g.over,false);assert.equal(g.players[1].eliminated,false);
});
test('all absent, including when only eliminated spectators remain, is an abandoned draw',()=>{
 const {g,update}=fixture('ffa');g.players[2].eliminated=true;g.players[3].eliminated=true;update(0,[2]);update(119,[2]);assert.equal(g.over,false);update(120,[2]);assert.equal(g.reason,'abandoned');assert.equal(g.winner,null);
});
test('a temporary absence pauses the personal idle budget but does not reset the match clock',()=>{
 const {p,g,update}=fixture();update(20);update(21,[]);update(100,[0,1]);assert.equal(p.progress[0],80);assert.equal(g.matchClock.elapsed,100);assert.equal(g.players[0].idleWarning,null);update(170);assert.equal(g.players[0].idleWarning,30);
});
test('checkpoint/reconnect preserves both deadline and abandonment; ping/ACK traffic cannot cancel idle forfeits',()=>{
 let wall=1000;const room=new OnlineRoom({code:'policy-clock',mode:'duel',seed:3,now:()=>wall}),peers=[{send(){},close(){}},{send(){},close(){}}];for(const peer of peers)room.join(peer);room.handle(peers[0],{type:'start'});room.policy(true);const started=room.startedAt;
 for(let seconds=10;seconds<=110;seconds+=10){wall=1000+seconds*1000;for(const peer of peers)room.handle(peer,{type:'ping',id:'not-play'});room.policy(true);}
 const restored=OnlineRoom.restore(JSON.parse(JSON.stringify(room.checkpoint())),{now:()=>wall});assert.equal(restored.startedAt,started);
 wall=121000;for(const peer of peers)room.handle(peer,{type:'stateAck',revision:0});room.policy(true);assert.equal(room.session.game.reason,'inactive');
 restored.peers.clear();wall=240000;restored.policy(true);assert.equal(restored.session.game.reason,'abandoned');
});
test('new result reasons describe timeout, abandonment and forfeits without falsely claiming an annihilation',()=>{
 const {g}=fixture('team');g.winner=null;g.reason='timeout';assert.match(matchResult(g,0).description,/6분/);g.players[0].eliminated=true;assert.equal(matchResult(g,0).draw,true,'a surviving ally still earns the team draw');g.players[2].eliminated=true;assert.equal(matchResult(g,0).draw,false,'an already defeated team does not regain a draw');g.reason='abandoned';assert.match(matchResult(g,0).title,/경기 중단/);g.reason='forfeit';g.winner=1;assert.equal(matchResult(g,1).title,'기권승');assert.equal(matchResult(g,0).title,'기권패');
});
test('an inactivity final state is broadcast even to a peer whose receipt window is full',()=>{
 let wall=100;const packets=[[],[]],room=new OnlineRoom({code:'idle-final',now:()=>wall,patchMs:50,cpuTiming:false}),peers=packets.map(list=>({send:data=>{if(data instanceof ArrayBuffer)list.push(decodeSnapshot(data).meta);},close(){}}));
 for(const peer of peers)room.join(peer);room.handle(peers[0],{type:'start'});
 for(let sec=10;sec<=120;sec+=10){wall=100+sec*1000;for(const peer of peers)room.handle(peer,{type:'ping',id:'receipt-only'});room.advance();}
 assert.equal(room.session.game.reason,'inactive');assert.ok(packets.every(list=>list.at(-1).over&&list.at(-1).reason==='inactive'));
});
