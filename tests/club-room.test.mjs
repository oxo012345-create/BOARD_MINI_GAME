import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
// Exercise the actual room handlers/session cookies/serializer. Only D1's
// atomic compare-and-swap is substituted; this is not a real Worker/browser test.
const states=new Map();
let conflicts=0;
globalThis.__clubTestEnv={DB:{prepare(sql){let args=[];return{bind(...a){args=a;return this;},async run(){
 if(sql.startsWith('CREATE'))return{meta:{changes:0}};
 if(sql.startsWith('INSERT OR IGNORE INTO rooms')){if(states.has(args[0]))return{meta:{changes:0}};states.set(args[0],args[1]);return{meta:{changes:1}};}
 if(sql.startsWith('UPDATE rooms')){const old=JSON.parse(states.get(args[1]));if(args.length===3&&old.revision!==args[2]){conflicts++;return{meta:{changes:0}};}states.set(args[1],args[0]);return{meta:{changes:1}};}
 if(sql.startsWith('DELETE FROM rooms WHERE code'))states.delete(args[0]);
 return{meta:{changes:0}};
 },async first(){if(sql.startsWith('WITH incoming')){const db=new DatabaseSync(':memory:');try{db.exec('CREATE TABLE rooms(code TEXT PRIMARY KEY,state TEXT,updated_at TEXT)');for(const [code,state] of states)db.prepare('INSERT INTO rooms(code,state) VALUES(?,?)').run(code,state);const row=db.prepare(sql).get(...args);if(row)states.set(args[0],row.state);return row??null;}finally{db.close();}}if(sql.startsWith('INSERT INTO rate_limits'))return{count:1,reset_at:Math.floor(Date.now()/1000)+60};if(sql.startsWith('SELECT state'))return states.has(args[0])?{state:states.get(args[0])}:null;throw new Error('Unhandled test SQL '+sql);}};}}};
registerHooks({resolve(specifier,context,next){if(specifier==='cloudflare:workers')return{url:'data:text/javascript,export const env = globalThis.__clubTestEnv;',shortCircuit:true};return next(specifier,context);}});
const { POST }=await import('../app/api/rooms/route.ts');
const { PATCH,GET }=await import('../app/api/rooms/[code]/route.ts');
async function invoke(code,cookie,p){const req=new Request('https://test/api/rooms/'+code,{method:p?'PATCH':'GET',headers:{'Content-Type':'application/json',Cookie:cookie??''},...(p?{body:JSON.stringify(p)}:{})});const response=await(p?PATCH:GET)(req,{params:Promise.resolve({code})});return{status:response.status,...await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};}
async function send(code,player,p){for(let i=0;i<8;i++){const r=await invoke(code,player.cookie,p);if(r.code!=='ROOM_CONFLICT')return r;}throw new Error('conflict retries exhausted');}
test('four authenticated clients: simultaneous semifinal, team turns, hidden guesses, reconnect and existing timers',async()=>{
 const response=await POST(new Request('https://test/api/rooms',{method:'POST',body:JSON.stringify({player:{name:'가',avatar:'🙂'}})}));assert.equal(response.status,201);const created=await response.json(),code=created.room.code;
 const clients=[{id:created.room.meId,cookie:response.headers.get('set-cookie').split(';')[0]}];
 for(const name of ['나','다','라']){const r=await invoke(code,'',{action:'join',player:{name,avatar:'🙂'}});assert.equal(r.status,200);clients.push({id:r.room.meId,cookie:r.cookie});}
 const host=clients[0];
 async function start(kind,setup){assert.equal((await send(code,host,{action:'prepare-game',gameId:kind})).status,200);if(setup)assert.equal((await send(code,host,{action:'club-settings',clubSetup:setup})).status,200);const r=await send(code,host,{action:'start-game',gameId:kind});assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.room.game.deadline,undefined);return r.room.game.club;}
 const g=await start('gomoku');
 const semis=g.matches;
 const results=await Promise.all(semis.map(m=>{const actor=m.sides[m.first][0];return send(code,clients.find(p=>p.id===actor),{action:'club-place',clubId:g.id,requestId:crypto.randomUUID(),matchId:m.id,turn:0,attempt:1,cell:112});}));
 assert.ok(results.every(r=>r.status===200));let saved=JSON.parse(states.get(code));assert.ok(saved.game.club.matches.every(m=>m.turn===1));assert.ok(conflicts>0,'concurrent mutations must exercise CAS');
 let r=await invoke(code,clients[2].cookie);assert.ok(r.room.game.club.matches.every(m=>m.turn===1));
 await start('gomoku',{mode:'team',redIds:[clients[0].id,clients[2].id]});
 saved=JSON.parse(states.get(code));const team=saved.game.club,m=team.matches[0];
 for(let turn=0;turn<4;turn++){const actor=clients.find(c=>c.id===m.sides[(turn+m.first)%2][Math.floor(turn/2)]);r=await send(code,actor,{action:'club-place',clubId:team.id,requestId:crypto.randomUUID(),matchId:m.id,turn,attempt:1,cell:112+turn});assert.equal(r.status,200);}
 const baseball=await start('number-baseball',{mode:'individual',digits:4});saved=JSON.parse(states.get(code));const secret=saved.game.club.secret;
 const submission={action:'club-guess',clubId:baseball.id,requestId:crypto.randomUUID(),round:1,value:secret};
 r=await send(code,host,submission);assert.equal(r.status,200);r=await send(code,host,submission);assert.equal(r.status,200,'retransmission is harmless');
 for(const c of clients){r=await invoke(code,c.cookie);const view=r.room.game.club;assert.ok(!('secret'in view)&&!('histories'in view)&&!('pending'in view));assert.equal(view.history.length,0);assert.equal(JSON.stringify(view).includes(secret),false);}
 await Promise.all(clients.slice(1).map(c=>send(code,c,{...submission,requestId:crypto.randomUUID()})));
 r=await invoke(code,host.cookie);assert.equal(r.room.view,'result');assert.equal(r.room.game.club.winners.length,4);
 // A response lost on the last submission may be retried after the result view.
 r=await send(code,host,submission);assert.equal(r.status,200);assert.equal(r.room.game.club.history.length,1);
 r=await send(code,host,{...submission,requestId:crypto.randomUUID()});assert.equal(r.status,422,'new inputs after a result remain rejected');
 const a=await start('alkkagi',{mode:'team',obstacles:true,redIds:[clients[0].id,clients[2].id]});
 r=await send(code,host,{action:'club-shot',clubId:a.id,requestId:crypto.randomUUID(),matchId:'team',turn:0,attempt:1,discId:0,dx:0,dy:150});assert.equal(r.status,200);const shot=r.room.game.club.matches[0].discs;
 for(const c of clients){r=await invoke(code,c.cookie);assert.deepEqual(r.room.game.club.matches[0].discs,shot);}
 r=await send(code,clients[1],{action:'leave'});assert.equal(r.room,null);r=await invoke(code,host.cookie);assert.deepEqual(r.room.game.club.paused,[clients[1].id]);
 r=await send(code,clients[1],{action:'join'});assert.equal(r.room.meId,clients[1].id);assert.deepEqual(r.room.game.club.paused,[]);assert.equal(r.room.game.club.matches[0].turn,1);assert.deepEqual(r.room.game.club.matches[0].discs,shot);
 // Absence beyond the old generic 30-minute pruning threshold preserves seats.
 saved=JSON.parse(states.get(code));saved.players.forEach(p=>p.lastSeen=Date.now()-31*60*1000);states.set(code,JSON.stringify(saved));r=await invoke(code,host.cookie);assert.equal(r.room.players.length,4);
 // Existing game registration/timer is not changed by the new branches.
 await start('mafia');for(const c of clients)assert.equal((await send(code,c,{action:'mafia-ready'})).status,200);r=await invoke(code,host.cookie);assert.ok(r.room.game.mafia.phaseEndsAt>Date.now(),'existing timed mafia night remains timed');
});
