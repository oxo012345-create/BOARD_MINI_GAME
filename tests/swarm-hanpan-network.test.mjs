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
  globalThis.location={href:'https://hanpan.test/'};globalThis.WebSocket=Socket;globalThis.fetch=async(url,options)=>{requests.push({url,body:JSON.parse(options.body),credentials:options.credentials});return Response.json({transport:'durable',socketUrl:'wss://swarm.test/connect?ticket=test-only'});};
  client=new HanpanSession({room:matchId,roomCode:'2468',name:'',storage:null});await client.connect();await pause(10);
  assert.equal(client.diagnostics().transport,'websocket-durable');assert.equal(client.received,1);assert.equal(requests.length,1);assert.equal(requests[0].url,'/api/rooms/2468/swarm');assert.equal(requests[0].credentials,'same-origin');
  assert.ok(client.dispatch('untrusted-client-actor',{type:'move',x:500,y:500,fraction:1}));const command=sent.find(m=>m.type==='command').command;assert.equal(command.sequence,5);assert.equal(command.matchId,matchId);assert.equal(requests.length,1,'WS commands never fall back to the D1 HTTP queue');
 }finally{client?.close();Object.assign(globalThis,originals);}
});
test('a legacy match continues using one non-overlapping HTTP poll loop',async()=>{
 const oldFetch=globalThis.fetch,matchId=crypto.randomUUID(),packet=new SnapshotEncoder().encode(new Game({seed:3}),{full:true});let active=0,maxActive=0,client;const operations=[];
 try{globalThis.fetch=async(url,options)=>{active++;maxActive=Math.max(active,maxActive);const body=JSON.parse(options.body);operations.push(body.operation);await pause(2);active--;return Response.json(body.operation==='join'?{welcome:{type:'welcome',room:matchId,seat:0,mode:'duel',sequence:0},lobby:{started:true}}:{lobby:{started:true},acks:[],snapshot:Buffer.from(packet).toString('base64')});};client=new HanpanSession({room:matchId,roomCode:'2468',name:'',storage:null});await client.connect();await pause(30);assert.equal(client.diagnostics().transport,'https-d1');assert.deepEqual(operations,['join','poll']);assert.equal(maxActive,1);assert.equal(client.received,1);
 }finally{client?.close();globalThis.fetch=oldFetch;}
});
