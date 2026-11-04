import {test} from 'node:test';
import assert from 'node:assert/strict';
import {NetworkSession} from '../public/swarm/network.js';
import {StateAcks} from '../public/swarm/state-acks.js';
import {ConnectionHealth} from '../public/swarm/connection-health.js';
import {bindSessionLifecycle} from '../public/swarm/session-lifecycle.js';
import {SnapshotEncoder} from '../public/swarm/net-protocol.js';
import {Game} from '../public/swarm/engine.js';
import {OnlineRoom} from '../app/api/_lib/vendor/swarm/room.js';

test('cumulative receipts pair snapshots, have a deadline, retry congestion and cancel cleanly',()=>{
 const sent=[],timers=new Map();let id=0,blocked=false;
 const a=new StateAcks({send:m=>{if(blocked)return false;sent.push(m);return true;},setTimer:(fn,ms)=>{timers.set(++id,{fn,ms});return id;},clearTimer:id=>timers.delete(id)});
 a.offer(1,false);assert.deepEqual(sent,[{type:'stateAck',revision:1}]);
 a.offer(2,true);assert.equal(sent.length,1);assert.equal([...timers.values()][0].ms,60);
 a.offer(3,true);assert.equal(sent.at(-1).revision,3);assert.equal(timers.size,0);
 a.offer(4,true);const deadline=[...timers.values()][0];timers.clear();deadline.fn();assert.equal(sent.at(-1).revision,4);
 blocked=true;a.offer(5,false);assert.equal([...timers.values()][0].ms,20);blocked=false;const retry=[...timers.values()][0];timers.clear();retry.fn();assert.equal(sent.at(-1).revision,5);
 a.offer(6,true);a.reset();assert.equal(timers.size,0);assert.equal(a.pending,0);
});

test('ACK batching needs negotiated policy, recent low RTT and no server backpressure',()=>{
 let at=1000;const c=new NetworkSession({storage:null,now:()=>at});
 c.ackPolicy={version:1,window:3,patchMs:50};assert.equal(c.canBatchAcks(),false);
 c.record('rtt',39);assert.equal(c.canBatchAcks(),true);
 c.record('rtt',80);assert.equal(c.canBatchAcks(),false);
 c.samples.rtt=[39];at+=2100;assert.equal(c.canBatchAcks(),false);
 c.record('rtt',39);c.ackBackoffUntil=at+10000;assert.equal(c.canBatchAcks(),false);
 at+=10000;c.record('rtt',39);assert.equal(c.canBatchAcks(),true);
 c.ackPolicy=undefined;assert.equal(c.canBatchAcks(),false,'old servers retain immediate receipts');c.close();
});

test('a pending receipt rides an immediately sent command, without waiting for the batching timer',()=>{
 const original=globalThis.WebSocket;globalThis.WebSocket={OPEN:1};const sent=[];
 const c=new NetworkSession({storage:null,now:()=>1000});
 try{
  c.socket={readyState:1,bufferedAmount:0,send:raw=>sent.push(JSON.parse(raw)),close(){}};
  c.status='connected';c.lastState=1000;c.ackPolicy={version:1,window:3,patchMs:50};c.acks.offer(8,true);
  assert.equal(sent.length,0);assert.ok(c.dispatch('local',{type:'upgrade',kind:'attack'}));
  assert.equal(sent.length,1);assert.equal(sent[0].type,'command');assert.equal(sent[0].stateRevision,8);assert.equal(c.acks.pending,0);assert.equal(c.traffic.piggybackAcks,1);
 }finally{c.close();globalThis.WebSocket=original;}
});

test('compact receipts shrink the payload without waiting, while an old server receives the original object',()=>{
 const original=globalThis.WebSocket;globalThis.WebSocket={OPEN:1};const sent=[];
 const c=new NetworkSession({storage:null});
 try{
  c.socket={readyState:1,bufferedAmount:0,send:raw=>sent.push(raw),close(){}};
  c.ackPolicy={version:1,window:3,patchMs:50,compact:true};c.acks.offer(1234,false);
  assert.deepEqual(JSON.parse(sent[0]),['a',1234]);assert.ok(sent[0].length<12);
  c.ackPolicy=undefined;c.acks.offer(1235,false);
  assert.deepEqual(JSON.parse(sent[1]),{type:'stateAck',revision:1235});
 }finally{c.close();globalThis.WebSocket=original;}
});

test('server cumulative receipts cannot forge credit and a full resync escapes a filled credit window',()=>{
 let at=100;const room=new OnlineRoom({code:'recovery',now:()=>at,patchMs:50,cpuTiming:false}),packets=[];
 const peers=[0,1].map(()=>({send:data=>packets.push(data),close(){}}));
 for(const peer of peers)room.join(peer);room.handle(peers[0],{type:'start'});
 for(let i=0;i<4;i++){at+=50;room.advance();}
 const entry=room.peers.get(peers[0]);assert.equal(entry.inFlight.length,3);
 room.handle(peers[0],{type:'ping',id:'invalid',stateRevision:entry.lastSent+1});assert.equal(entry.inFlight.length,3);
 room.handle(peers[0],{type:'ping',id:'valid',stateRevision:entry.lastSent});assert.equal(entry.inFlight.length,0);
 for(let i=0;i<3;i++){at+=50;room.advance();}assert.equal(entry.inFlight.length,3);
 const before=room.encoder.revision;room.handle(peers[0],{type:'resync'});assert.ok(room.encoder.revision>before);assert.equal(entry.inFlight.length,1,'fresh full state can reach a resumed client');
});

test('reconnect preserves the renderer game reference and restores units, upgrades, minerals, bases and command sequence',()=>{
 let at=100;const c=new NetworkSession({room:'match',storage:null,now:()=>at}),g=new Game({mode:'team',seed:3}),encoder=new SnapshotEncoder();c.sendRaw=()=>true;
 try{
  c.message({type:'welcome',seat:3,mode:'team',sequence:4});c.snapshot(encoder.encode(g,{full:true}));const displayed=c.game;
  g.players[3].attack=4;g.players[3].armor=2;g.players[3].minerals=765;g.units[0].x=625;g.zones[0].hp=1234;g.time=20;g.frame=600;
  c.message({type:'welcome',seat:3,mode:'team',sequence:8});assert.equal(c.game,displayed);assert.equal(c.canIssue(),false);
  at=300;c.snapshot(encoder.encode(g,{full:true}));assert.equal(c.game,displayed);assert.equal(c.seat,3);assert.equal(c.sequence,8);assert.equal(displayed.players[3].attack,4);assert.equal(displayed.players[3].armor,2);assert.equal(displayed.players[3].minerals,765);assert.equal(displayed.units[0].x,625);assert.equal(displayed.zones[0].hp,1234);assert.equal(c.canIssue(),true);
 }finally{c.close();}
});

test('background return waits for a fresh full state, excludes queued deltas, and measures only foreground recovery',()=>{
 let at=100;const c=new NetworkSession({storage:null,now:()=>at}),g=new Game({seed:3}),encoder=new SnapshotEncoder(),sent=[];c.sendRaw=m=>{sent.push(m);return true;};
 const old=globalThis.WebSocket;globalThis.WebSocket={OPEN:1};c.socket={readyState:1,close(){}};
 try{
  c.message({type:'welcome',seat:0,mode:'duel',sequence:0});c.snapshot(encoder.encode(g,{full:true}));c.setVisible(false);at=10000;c.setVisible(true);assert.equal(c.status,'recovering');assert.ok(sent.some(m=>m.type==='resync'));assert.equal(c.canIssue(),false);
  g.players[0].attack=2;const queued=encoder.encode(g);c.snapshot(queued);assert.equal(c.game.players[0].attack,0,'backlogged deltas cannot unlock stale commands');
  at+=45;c.snapshot(encoder.encode(g,{full:true}));assert.equal(c.status,'connected');assert.equal(c.game.players[0].attack,2);assert.equal(c.health.lastRecoveryMs,45);assert.equal(c.health.state.count,0);assert.equal(c.canIssue(),true);
 }finally{c.close();globalThis.WebSocket=old;}
});

test('health distinguishes frame stalls, received-state stalls, hidden time and deliberate menus',()=>{
 const h=new ConnectionHealth();h.painted(100,true);h.snapshot(100);h.painted(400,true);h.snapshot(500);
 assert.deepEqual(h.frame,{count:1,maxMs:300});assert.deepEqual(h.state,{count:1,maxMs:400});
 assert.equal(h.diagnostics(800).state.count,2);assert.equal(h.diagnostics(850).state.count,2,'an ongoing stall is counted once');
 h.visibility(false);h.painted(9000,true);h.snapshot(9000);h.visibility(true);h.painted(10000,true);h.snapshot(10000);assert.equal(h.state.count,1);
 h.painted(10100,false);h.painted(20000,true);assert.equal(h.frame.count,1,'menu time is excluded');
});

test('lifecycle listeners recover on visibility, browser resume and online without accumulating listeners',()=>{
 const page=new EventTarget(),host=new EventTarget(),calls=[];page.hidden=false;
 const off=bindSessionLifecycle({setVisible:v=>calls.push(v),recover:r=>calls.push(r)},{page,host});
 page.hidden=true;page.dispatchEvent(new Event('visibilitychange'));page.hidden=false;page.dispatchEvent(new Event('resume'));host.dispatchEvent(new Event('online'));
 assert.deepEqual(calls,[true,false,true,'resume','online']);off();host.dispatchEvent(new Event('online'));assert.equal(calls.length,5);
});

test('an apparently-open dead connection is replaced after the resume probe; late old-socket callbacks cannot reconnect again',async()=>{
 const original={WebSocket:globalThis.WebSocket,location:globalThis.location};const sockets=[];
 class Socket{static OPEN=1;constructor(){this.readyState=1;this.bufferedAmount=0;sockets.push(this);queueMicrotask(()=>this.onopen?.());}send(){}close(){this.readyState=3;}}
 globalThis.WebSocket=Socket;globalThis.location={href:'https://test.invalid/'};
 let now=100;const c=new NetworkSession({storage:null,now:()=>now}),g=new Game({seed:3}),e=new SnapshotEncoder();
 try{
  c.connect();await new Promise(r=>setTimeout(r,0));const first=c.socket;
  c.message({type:'welcome',seat:0,mode:'duel',sequence:0});c.snapshot(e.encode(g,{full:true}));const displayed=c.game;
  c.setVisible(false);now=12000;c.setVisible(true);assert.equal(sockets.length,1);
  await new Promise(r=>setTimeout(r,850));assert.equal(sockets.length,2);assert.equal(first.readyState,3);
  first.onclose({code:1000});assert.equal(c.retry,undefined,'old socket cannot schedule a second retry');
  c.message({type:'welcome',seat:0,mode:'duel',sequence:7});g.players[0].armor=3;now+=100;c.snapshot(e.encode(g,{full:true}));assert.equal(c.game,displayed);assert.equal(displayed.players[0].armor,3);assert.equal(c.canIssue(),true);
 }finally{c.close();Object.assign(globalThis,original);}
});
