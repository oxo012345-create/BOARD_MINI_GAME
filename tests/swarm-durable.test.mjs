import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import {build} from 'esbuild';import {Miniflare} from 'miniflare';
import {signTicket,verifyTicket} from '../realtime-swarm/tickets.js';import {SnapshotReplica} from '../public/swarm/net-protocol.js';
const secret='test-only-not-production-secret-123456789',origin='https://hanpan.test',sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(check,label){const end=Date.now()+8000;while(!check()){assert.ok(Date.now()<end,label);await sleep(20);}}
test('short signed tickets reject tampering, expiry, wrong kind and invalid identifiers',async()=>{
 const p={version:1,kind:'connect',roomCode:'2468',matchId:crypto.randomUUID(),expiresAt:Date.now()+30000},token=await signTicket(secret,p);assert.deepEqual(await verifyTicket(secret,token,'connect'),p);
 assert.equal(await verifyTicket(secret,token+'x','connect'),null);assert.equal(await verifyTicket(secret,token,'authority'),null);assert.equal(await verifyTicket(secret,token,'connect',p.expiresAt+1),null);
 assert.equal(await verifyTicket(secret,await signTicket(secret,{...p,roomCode:'../x'}),'connect'),null);
});
test('real SQLite DO sockets preserve fixed seats, shared state, reconnect, stored sequences and authority revocation',async()=>{
 await fs.mkdir('tmp',{recursive:true});await build({entryPoints:['realtime-swarm/index.js'],bundle:true,format:'esm',platform:'neutral',external:['cloudflare:workers'],outfile:'tmp/swarm-durable-test-worker.mjs',logLevel:'silent'});
 const persist=await fs.mkdtemp(path.resolve('tmp/swarm-durable-test-'));let active=[true,true,true,true],calls=0,mf;const peers=[];
 const make=()=>new Miniflare({name:'swarm-durable-test',modules:true,scriptPath:'tmp/swarm-durable-test-worker.mjs',compatibilityDate:'2026-05-15',bindings:{SWARM_REALTIME_SECRET:secret,ALLOWED_ORIGIN:origin,SITE_ORIGIN:origin,STATE_PATCH_MS:'100'},durableObjects:{SWARM_ROOMS:{className:'SwarmRoom',useSQLite:true}},durableObjectsPersist:persist,serviceBindings:{AUTHORITY:()=>{calls++;return Response.json({active});}}});
 const cfg={version:1,kind:'connect',roomCode:'2468',matchId:crypto.randomUUID(),mode:'team',roster:Array.from({length:4},(_,i)=>({name:'Seat '+i})),expiresAt:Date.now()+30000};
 async function connect(seat){const token=await signTicket(secret,{...cfg,seat,expiresAt:Date.now()+30000}),response=await mf.dispatchFetch('https://swarm.test/connect?ticket='+encodeURIComponent(token),{headers:{Upgrade:'websocket',Origin:origin}});assert.equal(response.status,101);const socket=response.webSocket,a={socket,seat,replica:new SnapshotReplica(),acks:[],welcome:null,closed:null};peers.push(a);socket.addEventListener('message',e=>{if(typeof e.data==='string'){const m=JSON.parse(e.data);if(m.type==='welcome')a.welcome=m;if(m.type==='ack')a.acks.push(m);}else{const packet=a.replica.apply(e.data);if(packet?.resync&&socket.readyState===1)socket.send(JSON.stringify({type:'resync'}));else if(packet&&socket.readyState===1)socket.send(JSON.stringify({type:'stateAck',revision:a.replica.revision}));}});socket.addEventListener('close',e=>a.closed=e.code);socket.accept();await until(()=>a.welcome&&a.replica.revision,'connected seat receives welcome and full snapshot');return a;}
 try{
  mf=make();const bad=await mf.dispatchFetch('https://swarm.test/connect?ticket=bad',{headers:{Upgrade:'websocket',Origin:origin}});assert.equal(bad.status,401);
  const wrongOrigin=await mf.dispatchFetch('https://swarm.test/connect?ticket=bad',{headers:{Upgrade:'websocket',Origin:'https://other.test'}});assert.equal(wrongOrigin.status,403);
  const clients=await Promise.all([0,1,2,3].map(connect));assert.deepEqual(clients.map(a=>a.welcome.seat),[0,1,2,3]);assert.ok(clients.every(a=>!('token'in a.welcome)));
  for(const a of clients)a.socket.send(JSON.stringify({type:'command',command:{sequence:1,matchId:cfg.matchId,type:'upgrade',kind:'attack',player:0}}));
  await until(()=>clients.every(a=>a.acks.some(k=>k.sequence===1&&k.ok)&&a.replica.meta.players.every(p=>p.attack===1)),'all peers see all server-owned upgrades');
  assert.ok(clients.every(a=>a.replica.meta.players.every(p=>p.minerals===950)));
  clients[0].socket.send(JSON.stringify({type:'command',command:{sequence:1,matchId:cfg.matchId,type:'upgrade',kind:'attack'}}));
  await until(()=>clients[0].acks.length===2,'duplicate command acknowledged as rejected');assert.equal(clients[0].acks[1].ok,false);
  const before=clients[0].replica.meta.frame;for(const a of clients)a.socket.close();await sleep(200);await mf.dispose();mf=make();
  const resumed=await connect(0);assert.equal(resumed.welcome.sequence,1);assert.ok(resumed.replica.meta.players.every(p=>p.attack===1&&p.minerals===950));assert.ok(resumed.replica.meta.frame>=before,'checkpoint keeps battle progress across DO restart');
  const ally=await connect(2);active[0]=false;await until(()=>resumed.closed===4003,'departed seat loses live connection');assert.equal(ally.closed,null,'remaining player stays connected');assert.ok(calls>=3);
 }finally{for(const a of peers)try{a.socket.close();}catch{}await mf?.dispose();}
});

test('final results bypass a slow peer, close all sockets, stop work, and survive restart for result viewing',async()=>{
 const cfg={version:1,kind:'connect',roomCode:'3579',matchId:crypto.randomUUID(),mode:'team',roster:Array.from({length:4},(_,i)=>({name:'Final '+i}))},key=cfg.roomCode+':'+cfg.matchId;
 // Only this generated test entry exposes lifecycle inspection; production has no test routes.
 await build({stdin:{contents:`import service,{SwarmRoom as Base} from './realtime-swarm/index.js';export class SwarmRoom extends Base{async fetch(request){const path=new URL(request.url).pathname;if(path==='/__finish'){this.room.session.game.finish(0,'annihilation');this.finishBattle();return Response.json({ok:true});}if(path==='/__state')return Response.json({connections:this.connections.size,timer:!!this.timer,finishTimer:!!this.finishTimer,over:this.room?.session.game.over});return super.fetch(request);}}export default{fetch(request,env){if(new URL(request.url).pathname.startsWith('/__'))return env.SWARM_ROOMS.get(env.SWARM_ROOMS.idFromName(${JSON.stringify(key)})).fetch(request);return service.fetch(request,env);}};`,resolveDir:process.cwd(),sourcefile:'end-test-only.mjs'},bundle:true,format:'esm',platform:'neutral',external:['cloudflare:workers'],outfile:'tmp/swarm-end-test-worker.mjs',logLevel:'silent'});
 const persist=await fs.mkdtemp(path.resolve('tmp/swarm-end-test-'));let calls=0,mf;const peers=[];
 const make=()=>new Miniflare({name:'swarm-end-test',modules:true,scriptPath:'tmp/swarm-end-test-worker.mjs',compatibilityDate:'2026-05-15',bindings:{SWARM_REALTIME_SECRET:secret,ALLOWED_ORIGIN:origin,SITE_ORIGIN:origin,STATE_PATCH_MS:'50'},durableObjects:{SWARM_ROOMS:{className:'SwarmRoom',useSQLite:true}},durableObjectsPersist:persist,serviceBindings:{AUTHORITY:()=>{calls++;return Response.json({active:[true,true,true,true]});}}});
 async function connect(seat,matchId=cfg.matchId){const token=await signTicket(secret,{...cfg,matchId,seat,expiresAt:Date.now()+30000}),r=await mf.dispatchFetch('https://swarm.test/connect?ticket='+encodeURIComponent(token),{headers:{Upgrade:'websocket',Origin:origin}});assert.equal(r.status,101);const socket=r.webSocket,a={socket,replica:new SnapshotReplica(),closed:null};peers.push(a);socket.addEventListener('message',e=>{if(typeof e.data==='string')return;const p=a.replica.apply(e.data);if(p&&!p.resync&&seat!==3&&socket.readyState===1)socket.send(JSON.stringify({type:'stateAck',revision:a.replica.revision}));if(p?.meta.over){a.finalBeforeClose=a.closed===null;if(seat!==3&&socket.readyState===1)socket.close(1000,'Result received');}});socket.addEventListener('close',e=>a.closed=e.code);socket.accept();await until(()=>a.replica.revision>0,'initial or saved final state arrives');return a;}
 try{
  mf=make();const clients=await Promise.all([0,1,2,3].map(seat=>connect(seat)));await sleep(250);const callsBefore=calls;
  await mf.dispatchFetch('https://swarm.test/__finish');await until(()=>clients.every(a=>a.replica.meta.over),'every player receives the full final result, including the peer withholding acknowledgements');
  assert.ok(clients.every(a=>a.finalBeforeClose&&a.replica.meta.winner===0));await until(()=>clients[3].closed===4000,'a backgrounded or uncooperative client is closed by the server');
  const state=await (await mf.dispatchFetch('https://swarm.test/__state')).json();assert.deepEqual(state,{connections:0,timer:false,finishTimer:false,over:true});assert.equal(calls,callsBefore,'no periodic parent authority traffic remains after game end');
  await mf.dispose();mf=make();const replay=await connect(0);assert.equal(replay.replica.meta.over,true);assert.equal(replay.replica.meta.winner,0,'the result survives DO recreation');
  const next=await connect(0,crypto.randomUUID());assert.equal(next.replica.meta.over,false,'a new match creates an independent live battle');assert.equal(next.replica.meta.players[0].minerals,1000);
 }finally{for(const a of peers)try{a.socket.close();}catch{}await mf?.dispose();}
});
