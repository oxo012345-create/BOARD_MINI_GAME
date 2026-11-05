import {test,after} from 'node:test';import assert from 'node:assert/strict';
import {HanpanSession} from '../public/swarm/hanpan-network.js';import {Game} from '../public/swarm/engine.js';import {SnapshotEncoder} from '../public/swarm/net-protocol.js';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const previousViewport={innerWidth:globalThis.innerWidth,innerHeight:globalThis.innerHeight,devicePixelRatio:globalThis.devicePixelRatio};Object.assign(globalThis,{innerWidth:393,innerHeight:664,devicePixelRatio:3});after(()=>Object.assign(globalThis,previousViewport));
test('browser transport follows the server choice and sends commands over its authenticated socket',async()=>{
 const originals={fetch:globalThis.fetch,WebSocket:globalThis.WebSocket,location:globalThis.location},requests=[],sent=[],matchId=crypto.randomUUID(),packet=new SnapshotEncoder().encode(new Game({seed:3}),{full:true});let client;
 class Socket{
  static OPEN=1;
  constructor(url){this.url=url;this.readyState=1;this.bufferedAmount=0;queueMicrotask(()=>{this.onopen?.();});}
  send(raw){const m=JSON.parse(raw);sent.push(m);if(m.type==='join')queueMicrotask(()=>{this.onmessage?.({data:JSON.stringify({type:'welcome',room:matchId,seat:0,mode:'duel',sequence:4})});this.onmessage?.({data:packet});});if(m.type==='ping')queueMicrotask(()=>this.onmessage?.({data:JSON.stringify({type:'pong',id:m.id})}));}
  close(){this.readyState=3;this.onclose?.({code:1000});}
 }
 try{
  globalThis.location={href:'https://hanpan.test/'};globalThis.WebSocket=Socket;globalThis.fetch=async(url,options)=>{requests.push({url,body:JSON.parse(options.body),credentials:options.credentials});return Response.json({transport:'durable',socketUrl:'/api/swarm/realtime-connect?ticket=test-only'});};
  client=new HanpanSession({room:matchId,roomCode:'2468',name:'',storage:null});await client.connect();await pause(10);
  assert.equal(String(client.socket.url),'wss://hanpan.test/api/swarm/realtime-connect?ticket=test-only');assert.equal(client.diagnostics().transport,'websocket-durable');assert.equal(client.received,1);assert.equal(requests.length,1);assert.equal(requests[0].url,'/api/rooms/2468/swarm');assert.equal(requests[0].credentials,'same-origin');
  assert.ok(client.dispatch('untrusted-client-actor',{type:'move',x:500,y:500,fraction:1}));const command=sent.find(m=>m.type==='command').command;assert.equal(command.sequence,5);assert.equal(command.matchId,matchId);assert.equal(requests.length,1,'WS commands never fall back to the D1 HTTP queue');
 }finally{client?.close();Object.assign(globalThis,originals);}
});
test('a legacy match continues using one non-overlapping HTTP poll loop',async()=>{
 const oldFetch=globalThis.fetch,matchId=crypto.randomUUID(),packet=new SnapshotEncoder().encode(new Game({seed:3}),{full:true});let active=0,maxActive=0,client;const operations=[];
 try{globalThis.fetch=async(url,options)=>{active++;maxActive=Math.max(active,maxActive);const body=JSON.parse(options.body);operations.push(body.operation);await pause(2);active--;return Response.json(body.operation==='join'?{welcome:{type:'welcome',room:matchId,seat:0,mode:'duel',sequence:0},lobby:{started:true}}:{lobby:{started:true},acks:[],snapshot:Buffer.from(packet).toString('base64')});};client=new HanpanSession({room:matchId,roomCode:'2468',name:'',storage:null});await client.connect();await pause(30);assert.equal(client.diagnostics().transport,'https-d1');assert.deepEqual(operations,['join','poll']);assert.equal(maxActive,1);assert.equal(client.received,1);
 }finally{client?.close();globalThis.fetch=oldFetch;}
});

test('the fast WebSocket resume watchdog never duplicates a slow legacy HTTP poll',async()=>{
 const oldFetch=globalThis.fetch,matchId=crypto.randomUUID(),packet=new SnapshotEncoder().encode(new Game({seed:3}),{full:true}),operations=[];let active=0,maxActive=0,client;
 try{
  globalThis.fetch=async(url,options)=>{const {operation}=JSON.parse(options.body);operations.push(operation);active++;maxActive=Math.max(maxActive,active);if(operation==='poll')await pause(950);active--;return Response.json(operation==='join'?{welcome:{type:'welcome',seat:0,mode:'duel',sequence:0},lobby:{started:true}}:{lobby:{started:true},acks:[],snapshot:Buffer.from(packet).toString('base64')});};
  client=new HanpanSession({room:matchId,roomCode:'2468',storage:null});await client.connect();await pause(1000);
  assert.equal(operations.filter(s=>s==='join').length,1);assert.equal(maxActive,1);assert.equal(client.received,1);
 }finally{client?.close();globalThis.fetch=oldFetch;}
});

test('live latency uses a matched ping round trip, expires stale values, and identifies HTTP separately',()=>{
 const client=new HanpanSession({room:crypto.randomUUID(),roomCode:'2468',storage:null});
 try{
  client.socketMode=true;client.status='connected';assert.equal(client.latency().ms,null);
  client.message({type:'pong',id:'not-sent'});assert.equal(client.latency().ms,null,'an unmatched pong is not a measurement');
  client.pings.set('measured',performance.now()-45);client.message({type:'pong',id:'measured'});
  const value=client.latency();assert.equal(value.kind,'ping');assert.ok(value.ms>=45&&value.ms<500);
  assert.equal(client.latency(performance.now()+4000).ms,null,'an old low ping must not imply a healthy connection');
  client.status='disconnected';assert.equal(client.latency().ms,null);client.status='connected';
  client.socketMode=false;client.record('rtt',600);assert.deepEqual(client.latency(),{kind:'response',ms:600},'HTTP processing time is not presented as a ping');
 }finally{client.close();}
});

test('a final authoritative result stops socket heartbeats/retries and keeps the result readable',async()=>{
 const originals={fetch:globalThis.fetch,WebSocket:globalThis.WebSocket,location:globalThis.location},matchId=crypto.randomUUID(),g=new Game({mode:'team',seed:5}),encoder=new SnapshotEncoder();let requests=0,opens=0,closed=0,client;const errors=[];
 class Socket{
  static OPEN=1;
  constructor(){opens++;this.readyState=1;this.bufferedAmount=0;queueMicrotask(()=>this.onopen?.());}
  send(raw){const m=JSON.parse(raw);if(m.type==='join')queueMicrotask(()=>{this.onmessage?.({data:JSON.stringify({type:'welcome',seat:0,mode:'team',sequence:0})});this.onmessage?.({data:encoder.encode(g,{full:true})});});}
  close(){closed++;this.readyState=3;this.onclose?.({code:1000});}
 }
 try{
  globalThis.location={href:'https://hanpan.test/'};globalThis.WebSocket=Socket;globalThis.fetch=async()=>{requests++;return Response.json({transport:'durable',socketUrl:'/api/swarm/realtime-connect?ticket=test-only'});};
  client=new HanpanSession({room:matchId,roomCode:'2468',storage:null});client.addEventListener('error',e=>errors.push(e.detail));await client.connect();await pause(10);
  g.players[0].eliminated=true;client.socket.onmessage({data:encoder.encode(g,{full:true})});assert.equal(closed,0,'an eliminated teammate keeps spectating while the match continues');
  g.finish(1,'annihilation');client.socket.onmessage({data:encoder.encode(g,{full:true})});
  assert.equal(client.game.over,true);assert.equal(client.game.winner,1);assert.equal(client.game.reason,'annihilation');assert.equal(client.status,'finished');assert.equal(client.disposed,true);assert.equal(client.abort.signal.aborted,true);assert.equal(client.retry,undefined);assert.equal(closed,1);
  await pause(550);assert.equal(opens,1,'finished socket does not reconnect');assert.equal(requests,1);assert.deepEqual(errors,[],'normal completion never opens a connection-error overlay');
 }finally{client?.close();Object.assign(globalThis,originals);}
});

test('a legacy final snapshot also stops polling without discarding the result',async()=>{
 const oldFetch=globalThis.fetch,matchId=crypto.randomUUID(),g=new Game({seed:5});g.finish(0,'annihilation');const packet=new SnapshotEncoder().encode(g,{full:true}),operations=[];let client;
 try{globalThis.fetch=async(url,options)=>{const op=JSON.parse(options.body).operation;operations.push(op);return Response.json(op==='join'?{welcome:{type:'welcome',room:matchId,seat:0,mode:'duel',sequence:0},lobby:{started:true}}:{lobby:{started:true},acks:[],snapshot:Buffer.from(packet).toString('base64')});};client=new HanpanSession({room:matchId,roomCode:'2468',storage:null});await client.connect();await pause(120);assert.equal(client.game.winner,0);assert.equal(client.status,'finished');assert.equal(client.disposed,true);assert.deepEqual(operations,['join','poll']);
 }finally{client?.close();globalThis.fetch=oldFetch;}
});

test('a backgrounded client missing its final packet fetches the saved result once after terminal close',async()=>{
 const original={fetch:globalThis.fetch,WebSocket:globalThis.WebSocket,location:globalThis.location},g=new Game({seed:4}),encoder=new SnapshotEncoder(),id=crypto.randomUUID();let client,opens=0,joins=0;
 class Socket{static OPEN=1;constructor(){this.readyState=1;this.bufferedAmount=0;opens++;queueMicrotask(()=>this.onopen?.());}send(raw){const m=JSON.parse(raw);if(m.type==='join')queueMicrotask(()=>{this.onmessage?.({data:JSON.stringify({type:'welcome',seat:0,mode:'duel',sequence:0})});if(opens===2)g.finish(null,'inactive');this.onmessage?.({data:encoder.encode(g,{full:true})});});}close(){this.readyState=3;this.onclose?.({code:1000});}}
 try{
  globalThis.location={href:'https://hanpan.test/'};globalThis.WebSocket=Socket;globalThis.fetch=async()=>{joins++;return Response.json({transport:'durable',socketUrl:'/api/swarm/realtime-connect?ticket=fixture'});};
  client=new HanpanSession({room:id,roomCode:'2468',storage:null});await client.connect();await pause(10);assert.equal(client.game.over,false);client.socket.readyState=3;client.socket.onclose({code:4000});await pause(40);assert.equal(opens,2);assert.equal(joins,2);assert.equal(client.game.over,true);assert.equal(client.game.reason,'inactive');assert.equal(client.disposed,true);
 }finally{client?.close();Object.assign(globalThis,original);}
});
