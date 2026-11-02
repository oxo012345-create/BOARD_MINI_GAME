// Reproducible gameplay pacing, separate from fast regression tests.
// node scripts/swarm-balance-bench.mjs --hp=8000 --output=tmp/swarm-200-hp8000.json
import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import fs from 'node:fs';import {createHash} from 'node:crypto';
import {Game,BALANCE,createRoster} from '../public/swarm/engine.js';

if(!isMainThread){
 const {mode,seed,hp,limit}=workerData,g=new Game({mode,seed,players:createRoster(mode,{humans:[]}),rules:{...BALANCE,baseHp:hp}});
 let peak=0,firstFight=null,lastCombat=0,longestQuiet=0,capSeconds=0;const perPlayerPeak=g.players.map(()=>0),timeline=[];
 for(let step=0;step<limit*30&&!g.over;step++){
  g.step(1/30);peak=Math.max(peak,g.units.length);let atCap=false;
  for(const p of g.players){const count=g.unitsOf(p.id).length;perPlayerPeak[p.id]=Math.max(perPlayerPeak[p.id],count);if(count>200)throw Error('Personal population cap exceeded');if(count===200)atCap=true;}
  if(atCap)capSeconds+=1/30;
  if(g.events.some(e=>['shot','hit','sunkenStrike'].includes(e.type))){firstFight??=g.time;if(lastCombat)longestQuiet=Math.max(longestQuiet,g.time-lastCombat);lastCombat=g.time;}
  if(step%900===0)timeline.push({time:g.time,units:g.units.length,bases:g.players.map(p=>g.zonesOf(p.id).length),population:g.players.map(p=>g.unitsOf(p.id).length)});
  if(g.players.some(p=>p.minerals<0)||g.dispensers.some(d=>d.hp!==g.rules.dispenserHp)||g.units.some(u=>!Number.isFinite(u.hp+u.x+u.y)))throw Error('Invalid battle state');g.events=[];
 }
 parentPort.postMessage({mode,seed,hp,seconds:g.time,finished:g.over,winner:g.winner,peak,perPlayerPeak,capSeconds,firstFight,longestNoCombatSeconds:firstFight?Math.max(longestQuiet,g.time-lastCombat):null,timeline});
}else{
 const args=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('='))),hp=Number(args.hp||BALANCE.baseHp),limit=Number(args.limit||720),seeds=(args.seeds||'12,33,91,42,104,217,389,503,677,809,1009,1301').split(',').map(Number),modes=(args.modes||'team,ffa').split(','),output=args.output||'tmp/swarm-balance-200.json';
 const queue=modes.flatMap(mode=>seeds.map(seed=>({mode,seed,hp,limit}))),rows=[];
 const stats=()=>Object.fromEntries(modes.map(mode=>{const all=rows.filter(r=>r.mode===mode),times=all.filter(r=>r.finished).map(r=>r.seconds).sort((a,b)=>a-b);return [mode,{games:all.length,finished:times.length,unfinished:all.length-times.length,mean:times.reduce((s,t)=>s+t,0)/times.length,median:times.length%2?times[(times.length-1)/2]:(times[times.length/2-1]+times[times.length/2])/2,min:times[0],max:times.at(-1),overEightMinutes:all.filter(r=>!r.finished||r.seconds>480).length,maximumPopulation:Math.max(...all.map(r=>r.peak)),longestNoCombatSeconds:Math.max(...all.map(r=>r.longestNoCombatSeconds||0))}];}));
 const hash=createHash('sha256').update(['engine.js','rules.js'].map(f=>fs.readFileSync('public/swarm/'+f,'utf8').replaceAll('\r\n','\n')).join('\n')).digest('hex');
 const save=()=>fs.writeFileSync(output,JSON.stringify({measuredAt:new Date().toISOString(),engineAndRulesSha256:hash,method:'All-AI, deterministic30Hz, normal difficulty,200 troops per player; no forced victory or speed multiplier; observations end at the stated limit. Not real phone/network/thermal measurements.',profile:{...BALANCE,baseHp:hp},limit,seeds,summary:stats(),rows},null,2));
 async function next(){while(queue.length){const item=queue.shift(),row=await new Promise((resolve,reject)=>{const w=new Worker(new URL(import.meta.url),{workerData:item});let received=false;w.on('message',r=>{received=true;resolve(r);});w.on('error',reject);w.on('exit',code=>{if(code||!received)reject(Error('Balance worker did not return a result'));});});rows.push(row);save();console.log(JSON.stringify({...row,timeline:undefined}));}}
 await Promise.all([next(),next()]);console.log(JSON.stringify(stats()));
}
