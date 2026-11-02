import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
import {decodeSnapshot} from '../public/swarm/net-protocol.js';

await fs.mkdir('tmp',{recursive:true});
await build({stdin:{contents:`import {GET,PATCH} from './app/api/rooms/[code]/route.ts';import {POST} from './app/api/rooms/[code]/swarm/route.ts';export default{fetch(request){const url=new URL(request.url),context={params:Promise.resolve({code:url.pathname.split('/')[3]})};return url.pathname.endsWith('/swarm')?POST(request,context):request.method==='GET'?GET(request,context):PATCH(request,context);}};`,resolveDir:process.cwd(),sourcefile:'swarm-audit-entry.ts'},bundle:true,outfile:'tmp/swarm-audit-worker.mjs',format:'esm',platform:'neutral',target:'es2022',external:['cloudflare:workers'],logLevel:'silent'});
const mf=new Miniflare({modules:true,scriptPath:'tmp/swarm-audit-worker.mjs',compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'hanpan-swarm-audit'},port:0,host:'127.0.0.1'});
const base=String(await mf.ready).replace(/\/$/,''),db=await mf.getD1Database('DB');
let checks=0,sequence=2000;
const ok=(value,message)=>{assert.ok(value,message);checks++;};
async function request(room,actor,body,swarm=false){const r=await fetch(base+`/api/rooms/${room.code}${swarm?'/swarm':''}`,{method:swarm?'POST':'PATCH',headers:{'Content-Type':'application/json',...(actor?{Cookie:`hanpan_room_${room.code}=${actor.token}`}:{})},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};}
async function fixture(count,mode=count===2?'duel':'ffa'){
 const now=Date.now(),actors=Array.from({length:count},(_,i)=>{const token=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');return {id:'player-'+i,token,hash:createHash('sha256').update(token).digest('hex')};});
 const room={code:String(sequence++),hostId:actors[0].id,players:actors.map((a,i)=>({id:a.id,name:'Audit '+i,avatar:'🙂',joinedAt:now,lastSeen:now,sessionHash:a.hash,status:'active'})),view:'briefing',roundNumber:0,revision:1,surpriseEnabled:false,game:{id:'swarm-territory',title:'군단 땅따먹기',prompt:'',startedAt:now,swarm:{mode}}};
 await db.prepare('INSERT INTO rooms(code,state) VALUES(?,?)').bind(room.code,JSON.stringify(room)).run();return {room,actors};
}
const packet=r=>decodeSnapshot(Buffer.from(r.body.snapshot,'base64')).meta;
try{
 for(const name of (await fs.readdir('drizzle')).filter(n=>n.endsWith('.sql')).sort())for(const sql of (await fs.readFile('drizzle/'+name,'utf8')).split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await db.prepare(sql).run();
 for(const mode of ['duel','team','ffa']){
  const {room,actors}=await fixture(mode==='duel'?2:4,mode);
  ok((await request(room,actors[1],{action:'start-game',gameId:'swarm-territory'})).status===403,'only host starts');
  const start=await request(room,actors[0],{action:'start-game',gameId:'swarm-territory'});ok(start.status===200,'start valid mode');const matchId=start.body.room.game.swarm.matchId;
  const joins=await Promise.all(actors.map(a=>request(room,a,{operation:'join',matchId},true)));
  joins.forEach((r,i)=>{ok(r.status===200,'concurrent authenticated join');ok(r.body.welcome.seat===i,'fixed player-to-seat mapping');ok(!('token'in r.body.welcome),'no independent seat credential exposed');ok(!JSON.stringify(r.body).includes(actors[i].hash),'no session hash exposed');});
  ok((await request(room,null,{operation:'poll',matchId},true)).status===401,'room code alone gives no game access');
  ok((await request(room,actors[0],{operation:'poll',matchId:'old-round'},true)).status===409,'stale round rejected');
  await Promise.all(actors.map(a=>request(room,a,{operation:'command',matchId,command:{type:'upgrade',kind:'attack',matchId,sequence:1,player:0}},true)));
  let view;const until=Date.now()+5000;do{view=await request(room,actors[0],{operation:'poll',matchId},true);if(view.status===200&&packet(view).players.every(p=>p.attack===1))break;await new Promise(r=>setTimeout(r,25));}while(Date.now()<until);
  ok(view.status===200&&packet(view).players.every(p=>p.attack===1),'all cookie-owned seats apply their own command');
  for(const actor of actors){const state=await request(room,actor,{operation:'poll',matchId},true);ok(packet(state).players.every(p=>p.attack===1&&p.minerals===950),'shared authoritative upgrade state');ok(packet(state).mode===mode,'same selected mode');}
  await request(room,actors[1],{operation:'command',matchId,command:{type:'upgrade',kind:'attack',matchId,sequence:1}},true);
  ok(packet(await request(room,actors[1],{operation:'poll',matchId},true)).players[1].attack===1,'duplicate retry applies once');
  ok((await request(room,actors[1],{operation:'finish',matchId,winner:1},true)).status===400,'client cannot submit victory');
  await request(room,actors[0],{action:'leave'});
  const stored=JSON.parse((await db.prepare('SELECT state FROM rooms WHERE code=?').bind(room.code).first()).state);
  ok(stored.hostId===actors[1].id,'host transfers on leave');ok(stored.players[0].status==='waiting','departed identity preserved for reconnect');
  ok((await request(room,actors[1],{operation:'poll',matchId},true)).status===200,'remaining battle continues');
  const returned=await request(room,actors[0],{action:'join',player:{name:'Audit 0',avatar:'🙂'}});ok(returned.status===200&&returned.body.room.meId===actors[0].id,'same Hanpan cookie reconnects');
  const rejoin=await request(room,actors[0],{operation:'join',matchId},true);ok(rejoin.status===200&&rejoin.body.welcome.seat===0,'same battle seat after refresh');
  ok(packet(await request(room,actors[0],{operation:'poll',matchId},true)).players[0].attack===1,'reconnect does not reset battle');
  await request(room,actors[1],{action:'set-view',view:'lobby'});
  ok((await request(room,actors[0],{operation:'poll',matchId},true)).status===409,'leaving parent game closes old command boundary');
 }
 const invalid=await fixture(3);ok((await request(invalid.room,invalid.actors[0],{action:'start-game',gameId:'swarm-territory'})).status===422,'three players cannot start a four-player battle');
 const wrongMode=await fixture(4);ok((await request(wrongMode.room,wrongMode.actors[0],{action:'swarm-settings',swarmMode:'duel'})).status===422,'invalid mode count rejected');
 const metadata=JSON.parse(await fs.readFile('public/swarm/source.json','utf8'));
 for(const file of ['engine.js','rules.js','modes.js','integration.js','art.js','audio.js','frame-clock.js','net-protocol.js'])ok(createHash('sha256').update((await fs.readFile('public/swarm/'+file,'utf8')).replaceAll('\r\n','\n')).digest('hex')===metadata.hashes[file],file+' matches original');
 console.log(JSON.stringify({checks,passed:true,modes:['duel','team','ffa'],authority:'server',sourceCommit:metadata.sourceCommit,coverage:['authenticated fixed seats','concurrent joins','shared state','duplicate commands','stale rounds','host handoff','same-cookie reconnect','unchanged gameplay assets']}));
}finally{await mf.dispose();}
