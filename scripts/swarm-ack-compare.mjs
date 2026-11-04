// Deterministic WAN simulation using the real room, codec, receipt queue and
// browser client. Timing is simulated delivery/render cadence, not device FPS.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {OnlineRoom} from '../app/api/_lib/vendor/swarm/room.js';
import {MatchSession} from '../public/swarm/integration.js';
import {NetworkSession} from '../public/swarm/network.js';
const summarize=a=>{const b=[...a].sort((x,y)=>x-y);return{mean:a.reduce((s,v)=>s+v,0)/(a.length||1),p95:b[Math.ceil(b.length*.95)-1]??0,max:b.at(-1)??0,count:a.length};};

function run({rtt,jitter=0,spike=false,batching,units=800}){
 let now=100,id=0,events=[];const clients=[],marks=[],original=globalThis.WebSocket;globalThis.WebSocket={OPEN:1};
 const schedule=(fn,ms)=>{events.push({id:++id,at:now+ms,fn});return id;},cancel=id=>{events=events.filter(e=>e.id!==id);};
 const room=new OnlineRoom({code:'ack-compare',mode:'team',seed:32,now:()=>now,cpuTiming:false,patchMs:50});
 room.seats=[0,1,2,3].map(id=>({id,name:'Seat '+id,token:'seat-'+id}));
 room.session=new MatchSession({mode:'team',seed:32,matchId:room.code,humans:[0,1,2,3],participants:room.seats.map(s=>({id:'seat-'+s.id,name:s.name}))});
 const g=room.session.game;
 for(const p of g.players){while(g.unitsOf(p.id).length<units/4)g.spawn(g.zonesOf(p.id)[0],p.id);}g.reindex();
 const periodic=(fn,ms)=>{const step=()=>{fn();schedule(step,ms);};schedule(step,ms);};
 function wire(fn,offset){let last=0;return payload=>{const wave=[0,1,-.6,.4,-.2][Math.floor((now+offset)/50)%5]*jitter;
  let at=now+rtt/2+wave;if(spike&&now>=15500&&now<15800)at=Math.max(at,15800+rtt/2);at=Math.max(last+.001,at);last=at;schedule(()=>fn(payload),Math.max(0,at-now));};}
 try{
  for(let seat=0;seat<4;seat++){
   const c=new NetworkSession({room:room.code,storage:null,now:()=>now,ackBatching:batching});clients.push(c);c.acks.setTimer=schedule;c.acks.clearTimer=cancel;
   const down=wire(data=>{if(typeof data==='string')c.message(JSON.parse(data));else c.snapshot(data);},seat*11);
   const peer={send:down,close(){}};const up=wire(raw=>room.handle(peer,JSON.parse(raw)),seat*13+7);
   c.socket={readyState:1,bufferedAmount:0,send:up,close(){}};c.lastPong=now;room.join(peer,{token:'seat-'+seat});
   periodic(()=>c.ping(),1000);periodic(()=>{c.tick();c.painted();},1000/30);
   for(let n=0;n<6;n++)schedule(()=>{c.dispatch('seat',{type:'upgrade',kind:n%2?'armor':'attack'});},12700+n*800+seat*2);
  }
  let droppedBefore=0;schedule(()=>{droppedBefore=room.stats.droppedSnapshots;for(const c of clients){marks.push({traffic:{...c.traffic},bytes:c.bytes,received:c.received});c.samples.gaps=[];}},12000);
  periodic(()=>room.advance(),1000/60);
  // Keep the armies moving, without converging into a terminal battle.
  periodic(()=>{for(const p of g.players){const h=g.zonesOf(p.id)[0];g.command({player:p.id,x:h.x<500?250:750,y:h.y<500?250:750,fraction:1});}},1500);
  while(events.length){events.sort((a,b)=>a.at-b.at||a.id-b.id);const e=events.shift();if(e.at>20100)break;now=e.at;e.fn();}
  const total=key=>clients.reduce((sum,c,i)=>sum+c.traffic[key]-(marks[i]?.traffic[key]||0),0);const result={warmupSeconds:12,rtt,jitter,spike,batching,units,receipts:total('stateAcks'),piggybacks:total('piggybackAcks'),upMessages:total('sentMessages'),upBytes:total('sentBytes'),downStateBytes:clients.reduce((s,c,i)=>s+c.bytes-marks[i].bytes,0),received:clients.map((c,i)=>c.received-marks[i].received),dropped:room.stats.droppedSnapshots-droppedBefore,commandToScheduledDraw:summarize(clients.flatMap(c=>c.samples.paint)),snapshotGaps:summarize(clients.flatMap(c=>c.samples.gaps)),rttSamples:summarize(clients.flatMap(c=>c.samples.rtt))};
  assert.equal(result.commandToScheduledDraw.count,24);return result;
 }finally{for(const c of clients)c.close();globalThis.WebSocket=original;}
}

const profiles=[{rtt:40},{rtt:65},{rtt:80},{rtt:150},{rtt:300},{rtt:40,jitter:12},{rtt:40,jitter:12,spike:true}],results=[];
for(const p of profiles){const before=run({...p,batching:false}),after=run({...p,batching:true});
 assert.deepEqual(after.received,before.received,'snapshot cadence must not regress');assert.equal(after.dropped,before.dropped,'batching must not add backpressure');
 assert.ok(after.commandToScheduledDraw.p95<=before.commandToScheduledDraw.p95+.01,'commands must not wait for receipts');
 const row={profile:p,before,after,reduction:{upMessages:1-after.upMessages/before.upMessages,upBytes:1-after.upBytes/before.upBytes,totalAppBytes:1-(after.upBytes+after.downStateBytes)/(before.upBytes+before.downStateBytes)}};results.push(row);console.log(JSON.stringify({profile:p,upMessageReduction:row.reduction.upMessages,upByteReduction:row.reduction.upBytes,commandP95:[before.commandToScheduledDraw.p95,after.commandToScheduledDraw.p95],snapshots:[before.received,after.received]}));
}
await fs.mkdir('tmp',{recursive:true});await fs.writeFile('tmp/swarm-ack-compare.json',JSON.stringify({method:'Deterministic800-unit real-engine WAN delivery simulation. Scheduled30Hz draw, not real browser rendering or physical-phone measurement.',results},null,2));
