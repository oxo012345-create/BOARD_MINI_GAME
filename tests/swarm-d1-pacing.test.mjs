import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {Miniflare} from 'miniflare';
import {D1Rooms} from '../app/api/_lib/vendor/swarm/d1-rooms.js';import {decodeSnapshot} from '../public/swarm/net-protocol.js';
import {authorizedPoll} from '../app/api/_lib/vendor/swarm/hanpan-poll.js';

test('slow request intervals retain normal simulation speed and atomic queue admission',async()=>{
 const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-05-15',d1Databases:{DB:'swarm-pacing-test'}});
 try{
  const db=await mf.getD1Database('DB');for(const sql of (await fs.readFile('drizzle/0002_slim_daimon_hellstrom.sql','utf8')).split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await db.prepare(sql).run();
  let now=1000,calls=0;const wrap=s=>({inner:s,bind:(...a)=>wrap(s.bind(...a)),first:(...a)=>{calls++;return s.first(...a);},run:(...a)=>{calls++;return s.run(...a);}}),counted={prepare:sql=>wrap(db.prepare(sql)),batch:ss=>{calls++;return db.batch(ss.map(s=>s.inner));}};
  const rooms=new D1Rooms(counted,{now:()=>now}),{code}=await rooms.create('team'),seats=[];for(let i=0;i<4;i++)seats.push((await rooms.join(code,{name:'Pacing '+i})).welcome);
  await rooms.start(code,seats[0].token);now+=900;calls=0;const first=await rooms.poll(code,seats[0].token),meta=decodeSnapshot(Buffer.from(first.snapshot,'base64')).meta;
  assert.ok(meta.time>.86&&meta.time<=.901,'a900ms interval advances27 normal ticks, not only6');assert.equal(calls,3,'due poll uses read, atomic lease+checkpoint, and commit');
  now+=300;await Promise.all(seats.map(s=>rooms.poll(code,s.token)));const latest=decodeSnapshot(Buffer.from((await rooms.poll(code,seats[0].token)).snapshot,'base64')).meta;assert.ok(latest.time>=1.16&&latest.time<=1.201,'concurrent polls do not advance time twice');
  await db.prepare('UPDATE swarm_rooms SET lease=?,lease_until=? WHERE code=?').bind('queue-test',now+12000,code).run();
  for(let n=1;n<=64;n++)await rooms.command(code,seats[0].token,{type:'upgrade',kind:'attack',sequence:n,matchId:code});
  await assert.rejects(rooms.command(code,seats[0].token,{type:'upgrade',kind:'attack',sequence:65,matchId:code}),e=>e.status===429);
  await rooms.command(code,seats[0].token,{type:'upgrade',kind:'attack',sequence:1,matchId:code});
  assert.equal((await db.prepare('SELECT count(*) n FROM swarm_commands WHERE code=?').bind(code).first()).n,64,'a full queue still accepts idempotent retries without duplicates');
  await db.batch([db.prepare('UPDATE swarm_commands SET done=1 WHERE code=?').bind(code),db.prepare('UPDATE swarm_rooms SET lease=NULL,lease_until=0 WHERE code=?').bind(code)]);
  await db.prepare('CREATE TABLE rooms(code TEXT PRIMARY KEY,state TEXT)').run();
  const roomCode='2468',matchId=crypto.randomUUID(),parent={view:'game',players:seats.map(s=>({id:'seat-'+s.seat,sessionHash:'hash-'+s.seat,status:'active'})),game:{id:'swarm-territory',swarm:{matchId,playerIds:seats.map(s=>'seat-'+s.seat)}}};
  await db.prepare('INSERT INTO rooms(code,state) VALUES(?,?)').bind(roomCode,JSON.stringify(parent)).run();now+=1700;
  const args={roomCode,key:code,matchId,sessionHash:'hash-0',token:seats[0].token,revision:0,now};
  const unchanged=await db.prepare('SELECT lease,seats FROM swarm_rooms WHERE code=?').bind(code).first();
  for(const invalid of [{sessionHash:'wrong'},{matchId:'old-round'},{token:seats[1].token}])assert.equal(await authorizedPoll(db,{...args,...invalid}),null,'invalid credentials/round/seat cannot claim a tick');
  assert.deepEqual(await db.prepare('SELECT lease,seats FROM swarm_rooms WHERE code=?').bind(code).first(),unchanged,'rejected polls cannot mutate heartbeats or locks');
  calls=0;const prefetched=await authorizedPoll(counted,args);assert.equal(prefetched.claimed,1);assert.equal(calls,1);
  await db.prepare("UPDATE swarm_rooms SET seats=json_set(seats,'$[1].seen',?) WHERE code=?").bind(now+100,code).run();
  await rooms.poll(code,seats[0].token,0,0,prefetched);assert.equal(calls,2,'authenticated hot poll needs one input transaction and one output transaction');
  const stored=await db.prepare('SELECT lease,seats FROM swarm_rooms WHERE code=?').bind(code).first();assert.equal(stored.lease,null);assert.equal(JSON.parse(stored.seats)[1].seen,now+100,'a concurrent heartbeat survives a slower owner commit');
  parent.view='lobby';await db.prepare('UPDATE rooms SET state=? WHERE code=?').bind(JSON.stringify(parent),roomCode).run();assert.equal(await authorizedPoll(db,args),null,'returning to lobby closes the fast path');
 }finally{await mf.dispose();}
});
