// Opt-in, four independent sessions in an owned disposable room only.
import assert from 'node:assert/strict';import fs from 'node:fs/promises';import WebSocket from 'ws';
import {matchActor,matchSide} from '../app/api/_lib/club.ts';import {renjuMove} from '../app/api/_lib/renju.ts';import {previewClubInput} from '../app/club-input.ts';
if(!process.argv.includes('--production'))throw Error('Explicit --production required');
const base='https://hanpan-mobile-game.oxo012345.chatgpt.site',direct=process.argv.includes('--direct');
const report={at:new Date().toISOString(),route:direct?'direct':'site',actions:[],cleaned:false},clients=[],sockets=[];let code;
async function call(p,body,path='/api/rooms/'+code){const r=await fetch(base+path,{method:body?(path==='/api/rooms'?'POST':'PATCH'):'GET',headers:{'Content-Type':'application/json',...(p?{Cookie:p.cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});const b=await r.json();assert.ok(r.ok,b.error||r.status);return {...b,cookie:r.headers.get('set-cookie')?.split(';')[0]};}
async function send(p,b){return(await call(p,b,'/api/rooms/'+code+(['club-place','club-launch','club-settle-shot'].includes(b.action)?'/club':''))).room;}
async function connect(p){const t=await call(p,null,'/api/rooms/'+code+'/club/input');const ws=new WebSocket(direct?t.directSocketUrl:t.socketUrl,{origin:base});
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Socket ready timeout')),10000);ws.on('error',reject);ws.on('message',x=>{if(JSON.parse(x).type==='ready'){clearTimeout(timer);resolve();}});});
 const renewal=setInterval(async()=>{try{const t=await call(p,null,'/api/rooms/'+code+'/club/input');if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'renew',ticket:t.ticket}));}catch{ws.close();}},20000);ws.once('close',()=>clearInterval(renewal));sockets.push(ws);return ws;
}
async function watch(p,revision,predicate,begin){for(let i=0;i<10;i++){const r=await call(p,null,`/api/rooms/${code}/events?wait=1&clubMotion=2&revision=${revision}`);revision=r.revision;if(r.room&&predicate(r.room.game.club))return Math.round(performance.now()-begin);}throw Error('HTTP recovery missing');}
async function game(kind,mode){for(const ws of sockets.splice(0))ws.close();await send(clients[0],{action:'prepare-game',gameId:kind});await send(clients[0],{action:'club-settings',clubSetup:{mode,obstacles:true,redIds:mode==='team'?[clients[0].id,clients[2].id]:undefined}});await send(clients[0],{action:'start-game',gameId:kind});
 for(const p of clients)p.ws=await connect(p);
 for(let turn=0;turn<6;turn++){
  const room=(await call(clients[0])).room,s=room.game.club,m=s.matches[turn%s.matches.length],actor=clients.find(p=>p.id===matchActor(m));
  const payload={clubId:s.id,requestId:crypto.randomUUID(),matchId:m.id,attempt:m.attempt,turn:m.turn,...(kind==='gomoku'?{action:'club-place',cell:m.board.findIndex((v,i)=>!v&&renjuMove(m.board,i,matchSide(m)+1).legal)}:{action:'club-launch',discId:m.discs.find(d=>d.alive&&d.side===matchSide(m)).id,dx:12,dy:0})};
  const begin=performance.now(),peers=clients.filter(p=>p!==actor);
  const incoming=peers.map(p=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>{p.ws.off('message',receive);reject(Error('Peer input timeout'));},5000);function receive(x){const msg=JSON.parse(x);if(msg.payload?.requestId!==payload.requestId)return;clearTimeout(timer);p.ws.off('message',receive);assert.ok(previewClubInput(s,msg));resolve(Math.round(performance.now()-begin));}p.ws.on('message',receive);}));
  const predicate=v=>{const next=v.matches.find(x=>x.id===m.id);return kind==='gomoku'?next.turn>m.turn:next.launch?.id===payload.requestId;};
  const http=peers.map(p=>watch(p,room.revision,predicate,begin));actor.ws.send(JSON.stringify({type:'intent',payload}));
  const accepted=await send(actor,payload),ackMs=Math.round(performance.now()-begin),peerMs=await Promise.all(incoming),httpMs=await Promise.all(http);
  if(kind==='alkkagi')await Promise.all(clients.map(p=>send(p,{action:'club-settle-shot',clubId:s.id,requestId:'settle:'+payload.requestId,matchId:m.id,attempt:m.attempt,launchId:payload.requestId})));
  const views=await Promise.all(clients.map(p=>call(p)));assert.ok(views.every(v=>v.room.game.club.matches.find(x=>x.id===m.id).turn===m.turn+1));
  report.actions.push({kind,mode,turn:m.turn,peerMs,httpMs,ackMs});
  assert.ok(accepted.game.club);
 }
 // A reconnected viewer starts from authoritative state, without replaying history.
 clients[3].ws.close();clients[3].ws=await connect(clients[3]);assert.equal((await call(clients[3])).room.game.club.kind,kind);
 console.log('passed',kind,mode);
}
try{
 const made=await call(null,{player:{name:'속도검수1',avatar:'🐻'}},'/api/rooms');code=made.room.code;clients.push({id:made.room.meId,cookie:made.cookie});
 for(let i=2;i<=4;i++){const j=await call(null,{action:'join',player:{name:'속도검수'+i,avatar:'🐥'}});clients.push({id:j.room.meId,cookie:j.cookie});}
 for(const kind of ['gomoku','alkkagi'])for(const mode of ['team','tournament'])await game(kind,mode);
}finally{
 for(const ws of sockets)ws.close();if(code&&clients[0]){await send(clients[0],{action:'prepare-game',gameId:'alkkagi'});for(const p of clients)await send(p,{action:'leave'});report.cleaned=true;}
 const stats=a=>{a.sort((a,b)=>a-b);return{min:a[0],median:a[Math.floor(a.length/2)],p95:a[Math.floor(a.length*.95)],max:a.at(-1)}};
 report.summary={peerMs:stats(report.actions.flatMap(x=>x.peerMs)),httpMs:stats(report.actions.flatMap(x=>x.httpMs))};await fs.mkdir('artifacts/club',{recursive:true});await fs.writeFile('artifacts/club/input-'+report.route+'.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report.summary));
}
