import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import {Miniflare} from 'miniflare';import fs from 'node:fs/promises';import {signTicket} from '../realtime-swarm/tickets.js';
test('four authenticated sockets relay only input, isolate games, reject invalid origin/tickets and reconnect',async()=>{
 await fs.mkdir('tmp',{recursive:true});await build({entryPoints:['realtime-club/index.js'],outfile:'tmp/club-input-worker.mjs',bundle:true,format:'esm',platform:'browser',external:['cloudflare:workers']});
 const secret='test-only-club-input-secret-0123456789',origin='https://hanpan.test',game=crypto.randomUUID(),ids=Array.from({length:4},()=>crypto.randomUUID());
 const mf=new Miniflare({modules:true,scriptPath:'tmp/club-input-worker.mjs',compatibilityDate:'2026-05-15',bindings:{CLUB_INPUT_SECRET:secret,ALLOWED_ORIGIN:origin},durableObjects:{CLUB_INPUTS:{className:'ClubInputRoom',useSQLite:true}}});
 const sockets=[],messages=[];
 const ticket=(id,matchId=game)=>signTicket(secret,{version:1,kind:'club-connect',expiresAt:Date.now()+30000,roomCode:'1234',matchId,gameKind:'alkkagi',playerId:id});
 async function connect(id,matchId=game){const r=await mf.dispatchFetch('http://test/connect?ticket='+await ticket(id,matchId),{headers:{Upgrade:'websocket',Origin:origin}});assert.equal(r.status,101);const s=r.webSocket;s.accept();const log=[];s.addEventListener('message',e=>log.push(JSON.parse(e.data)));sockets.push(s);messages.push(log);return s;}
 async function until(fn){for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw Error('Timed out waiting for socket');}
 try{
  for(const id of ids)await connect(id);await connect(crypto.randomUUID(),crypto.randomUUID());
  const p={action:'club-launch',clubId:game,requestId:crypto.randomUUID(),matchId:'team',turn:0,attempt:1,discId:0,dx:24,dy:0,secret:'must-not-relay'};
  sockets[0].send(JSON.stringify({type:'intent',payload:p,playerId:ids[1]}));await until(()=>messages.slice(1,4).every(l=>l.some(m=>m.type==='intent')));
  for(const log of messages.slice(1,4)){const m=log.find(m=>m.type==='intent');assert.equal(m.playerId,ids[0]);assert.equal('secret'in m.payload,false);assert.equal('frames'in m.payload,false);}
  assert.equal(messages[4].some(m=>m.type==='intent'),false);
  sockets[0].send(JSON.stringify({type:'intent',payload:p}));sockets[0].send(JSON.stringify({type:'cancel',requestId:p.requestId}));await until(()=>messages[1].some(m=>m.type==='cancel'));
  assert.equal(messages[1].filter(m=>m.type==='intent').length,1);
  const renewal=await ticket(ids[0]);sockets[0].send(JSON.stringify({type:'renew',ticket:renewal}));
  let closed=false;sockets[0].addEventListener('close',()=>closed=true);await connect(ids[0]);await until(()=>closed);
  const bad=await mf.dispatchFetch('http://test/connect?ticket='+renewal,{headers:{Upgrade:'websocket',Origin:'https://evil.test'}});assert.equal(bad.status,403);
  const invalid=await mf.dispatchFetch('http://test/connect?ticket=invalid',{headers:{Upgrade:'websocket',Origin:origin}});assert.equal(invalid.status,401);
 }finally{for(const s of sockets)try{s.close();}catch{}await mf.dispose();}
});
