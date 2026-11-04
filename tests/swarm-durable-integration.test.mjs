import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {createHash} from 'node:crypto';import {build} from 'esbuild';import {Miniflare} from 'miniflare';
import {verifyTicket,signTicket} from '../realtime-swarm/tickets.js';import {SnapshotReplica} from '../public/swarm/net-protocol.js';
const secret='integration-only-test-secret-0123456789',origin='https://hanpan.test';
test('Hanpan cookies pin every mode to one DO and forbid HTTP simulation/forged seats',async()=>{
 await fs.mkdir('tmp',{recursive:true});await build({stdin:{contents:`import {PATCH} from './app/api/rooms/[code]/route.ts';import {POST} from './app/api/rooms/[code]/swarm/route.ts';import {POST as AUTH} from './app/api/swarm/realtime-authority/route.ts';export default{fetch(request){const url=new URL(request.url),ctx={params:Promise.resolve({code:url.pathname.split('/')[3]})};return url.pathname.endsWith('realtime-authority')?AUTH(request):url.pathname.endsWith('/swarm')?POST(request,ctx):PATCH(request,ctx);}};`,resolveDir:process.cwd(),sourcefile:'swarm-durable-api.ts'},bundle:true,format:'esm',platform:'neutral',external:['cloudflare:workers'],outfile:'tmp/swarm-durable-api-worker.mjs',logLevel:'silent'});
 await build({entryPoints:['realtime-swarm/index.js'],bundle:true,format:'esm',platform:'neutral',external:['cloudflare:workers'],outfile:'tmp/swarm-durable-service-worker.mjs',logLevel:'silent'});
 let mf;const rt=new Miniflare({name:'realtime',modules:true,scriptPath:'tmp/swarm-durable-service-worker.mjs',compatibilityDate:'2026-05-15',port:0,host:'127.0.0.1',bindings:{SWARM_REALTIME_SECRET:secret,ALLOWED_ORIGIN:origin,SITE_ORIGIN:origin},serviceBindings:{AUTHORITY:request=>mf.dispatchFetch(request)},durableObjects:{SWARM_ROOMS:{className:'SwarmRoom',useSQLite:true}}});
 mf=new Miniflare({name:'site',modules:true,scriptPath:'tmp/swarm-durable-api-worker.mjs',compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],port:0,host:'127.0.0.1',d1Databases:{DB:'durable-integration'},bindings:{SWARM_REALTIME_URL:'https://realtime.test',SWARM_REALTIME_SECRET:secret,SWARM_REALTIME_ROOMS:'6000,6001,6002'},outboundService:request=>rt.dispatchFetch(request)});
 const sockets=[];
 try{
  const db=await mf.getD1Database('DB');for(const name of (await fs.readdir('drizzle')).filter(n=>n.endsWith('.sql')).sort())for(const sql of (await fs.readFile('drizzle/'+name,'utf8')).split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await db.prepare(sql).run();
  let codeNumber=6000;
  for(const mode of ['duel','team','ffa','duel']){
   const count=mode==='duel'?2:4,code=String(codeNumber++),now=Date.now(),actors=Array.from({length:count},(_,i)=>{const token=crypto.randomUUID()+crypto.randomUUID();return {id:'player-'+i,token,sessionHash:createHash('sha256').update(token).digest('hex')};});
   const room={code,hostId:actors[0].id,players:actors.map((a,i)=>({id:a.id,name:'Player '+i,avatar:'🙂',joinedAt:now,lastSeen:now,status:'active',sessionHash:a.sessionHash})),view:'briefing',roundNumber:0,revision:1,surpriseEnabled:false,game:{id:'swarm-territory',title:'군단',prompt:'',startedAt:now,swarm:{mode}}};await db.prepare('INSERT INTO rooms(code,state) VALUES(?,?)').bind(code,JSON.stringify(room)).run();
   const call=async(actor,payload,swarm=false)=>{const r=await mf.dispatchFetch(origin+'/api/rooms/'+code+(swarm?'/swarm':''),{method:swarm?'POST':'PATCH',headers:{'Content-Type':'application/json',...(actor?{Cookie:`hanpan_room_${code}=${actor.token}`}:{})},body:JSON.stringify(payload)});return {status:r.status,data:await r.json()};};
   const start=await call(actors[0],{action:'start-game',gameId:'swarm-territory'});assert.equal(start.status,200);const match=start.data.room.game.swarm;
   if(code==='6003'){assert.equal(match.transport,undefined,'a room outside the trial allowlist stays on the old transport');const join=await call(actors[0],{operation:'join',matchId:match.matchId},true);assert.equal(join.status,200);assert.equal(join.data.welcome.seat,0);continue;}
   assert.equal(match.transport,'durable');assert.equal(match.endpoint,'https://realtime.test');
   assert.equal((await call(null,{operation:'join',matchId:match.matchId},true)).status,401);
   const authBody={roomCode:code,matchId:match.matchId},authToken=await signTicket(secret,{version:1,kind:'authority',expiresAt:Date.now()+10000,...authBody});const authResponse=await mf.dispatchFetch(origin+'/api/swarm/realtime-authority',{method:'POST',headers:{Authorization:'Bearer '+authToken},body:JSON.stringify(authBody)});assert.equal(authResponse.status,200,await authResponse.text());
   for(let seat=0;seat<count;seat++){
    const join=await call(actors[seat],{operation:'join',matchId:match.matchId,player:0},true);assert.equal(join.status,200);assert.equal(join.data.transport,'durable');const url=new URL(join.data.socketUrl),ticket=await verifyTicket(secret,url.searchParams.get('ticket'),'connect');assert.equal(ticket.seat,seat);assert.equal(ticket.mode,mode);
    const r=await rt.dispatchFetch('https://realtime.test'+url.pathname+url.search,{headers:{Upgrade:'websocket',Origin:origin}});assert.equal(r.status,101,r.status===101?'':await r.text());const socket=r.webSocket;sockets.push(socket);const replica=new SnapshotReplica();socket.addEventListener('message',e=>{if(typeof e.data!=='string'){const p=replica.apply(e.data);if(p&&!p.resync&&socket.readyState===1)socket.send(JSON.stringify({type:'stateAck',revision:replica.revision}));}});socket.accept();
   }
   assert.equal((await call(actors[0],{operation:'poll',matchId:match.matchId},true)).status,409,'a pinned DO game never starts a competing D1 simulation');
   assert.equal((await call(actors[0],{operation:'join',matchId:'stale-match'},true)).status,409);
   assert.equal((await db.prepare('SELECT count(*) n FROM swarm_rooms').first()).n,0);
   const missingAuth=await mf.dispatchFetch(origin+'/api/swarm/realtime-authority',{method:'POST',body:JSON.stringify({roomCode:code,matchId:match.matchId})});assert.equal(missingAuth.status,401);
   await call(actors[0],{action:'set-view',view:'lobby'});
  }
 }finally{for(const socket of sockets)try{socket.close();}catch{}await rt.dispose();await mf.dispose();}
});
