import {MatchSession} from '../../../../../public/swarm/integration.js';
import {MODES} from '../../../../../public/swarm/modes.js';
import {SnapshotEncoder,TICK_MS,PATCH_MS} from '../../../../../public/swarm/net-protocol.js';

export class OnlineRoom{
 constructor({code,mode='duel',seed=Date.now(),now=()=>performance.now(),uuid=()=>crypto.randomUUID(),cpuTiming=true}={}){
  if(!Object.hasOwn(MODES,mode))throw new Error('Unknown mode');this.code=code;this.mode=mode;this.seed=seed;this.now=now;this.uuid=uuid;this.cpuTiming=cpuTiming;this.seats=[];this.peers=new Map();this.session=null;this.encoder=new SnapshotEncoder();this.events=[];this.accumulator=0;this.last=now();this.patchAt=now();this.lastActive=now();this.stats={tickMs:cpuTiming?0:null,tickMaxMs:cpuTiming?0:null,encodeMs:cpuTiming?0:null,timingSource:cpuTiming?'process-monotonic-clock':'worker-cpu-time-unavailable',commands:0,rejected:0,droppedSnapshots:0,lagMs:0};
 }
 checkpoint(){const game=this.session?.game;return {code:this.code,mode:this.mode,seed:this.seed,seats:this.seats,game:game?Object.fromEntries(Object.entries(game).filter(([key])=>!['random','rules','palettes','zoneMap','unitMap','buckets','neighborhoodCache','enemyNeighborhoodCache','separationBuckets','separationCache','duration','events'].includes(key))):null,random:game?.random.getState(),sequences:this.session?[...this.session.sequences]:[]};}
 static restore(saved,options={}){const room=new OnlineRoom({...saved,...options});room.seats=saved.seats;if(saved.game){room.session=new MatchSession({mode:saved.mode,seed:saved.seed,matchId:saved.code,humans:saved.seats.map(s=>s.id),participants:saved.seats.map(s=>({id:'seat-'+s.id,name:s.name}))});Object.assign(room.session.game,saved.game);room.session.game.random.setState(saved.random);room.session.game.zoneMap=new Map(room.session.game.zones.map(z=>[z.id,z]));room.session.game.events=[];room.session.game.reindex();room.session.sequences=new Map(saved.sequences);}return room;}
 join(peer,{name='플레이어',token}={}){
  let seat=token&&this.seats.find(s=>s.token===token);
  if(!seat){if(token)throw new Error('재접속 정보가 만료되었습니다');if(this.session)throw new Error('이미 시작한 방입니다');if(this.seats.length>=MODES[this.mode].count)throw new Error('방이 가득 찼습니다');seat={id:this.seats.length,name:String(name).replace(/[\p{C}<>]/gu,'').trim().slice(0,16)||'플레이어',token:this.uuid()};this.seats.push(seat);}
  for(const [old,entry]of this.peers)if(entry.seat===seat.id){old.close?.(4001,'다른 연결에서 재접속');this.peers.delete(old);}
  this.peers.set(peer,{seat:seat.id,needsFull:true,budget:30,refill:this.now(),inFlight:[],lastSent:0});this.lastActive=this.now();this.send(peer,{type:'welcome',room:this.code,seat:seat.id,token:seat.token,mode:this.mode,matchId:this.code,sequence:this.session?.sequences.get('seat-'+seat.id)||0});this.broadcastLobby();if(this.session)this.patch(true);return seat.id;
 }
 send(peer,message){try{peer.send(typeof message==='string'||message instanceof ArrayBuffer?message:JSON.stringify(message));return true;}catch{return false;}}
 lobby(){return {type:'lobby',room:this.code,mode:this.mode,started:!!this.session,seats:this.seats.map(s=>({id:s.id,name:s.name,connected:[...this.peers.values()].some(p=>p.seat===s.id)})),capacity:MODES[this.mode].count};}
 broadcastLobby(){const data=JSON.stringify(this.lobby());for(const peer of this.peers.keys())this.send(peer,data);}
 leave(peer){this.peers.delete(peer);this.lastActive=this.now();this.broadcastLobby();}
 handle(peer,input){
  const entry=this.peers.get(peer);if(!entry)return;const begin=this.now();this.lastActive=begin;
  if(input?.type==='stateAck'){if(Number.isSafeInteger(input.revision)&&input.revision<=entry.lastSent)entry.inFlight=entry.inFlight.filter(rev=>rev>input.revision);return;}
  entry.budget=Math.min(30,entry.budget+(begin-entry.refill)*.02);entry.refill=begin;
  if(!input||typeof input!=='object'||--entry.budget<0){this.stats.rejected++;return this.send(peer,{type:'error',message:'명령이 너무 빠릅니다'});}
  if(input.type==='ping')return this.send(peer,{type:'pong',id:input.id,serverMs:this.cpuTiming?this.now()-begin:null});
  if(input.type==='resync'){entry.needsFull=true;if(this.session)this.patch(true);return;}
  if(input.type==='start'){
   if(entry.seat!==0||this.session||this.seats.length!==MODES[this.mode].count||this.peers.size!==this.seats.length)return this.send(peer,{type:'error',message:'모든 참가자가 연결되면 방장이 시작할 수 있습니다'});
   this.session=new MatchSession({mode:this.mode,seed:this.seed,matchId:this.code,humans:this.seats.map(s=>s.id),participants:this.seats.map(s=>({id:'seat-'+s.id,name:s.name}))});this.last=this.now();this.accumulator=0;this.patchAt=this.last;this.broadcastLobby();this.patch(true);return;
  }
  if(input.type!=='command'||!this.session)return;
  const command=input.command;let accepted=false;
  try{accepted=this.session.dispatch('seat-'+entry.seat,command);}catch{accepted=false;}
  if(accepted)this.stats.commands++;else this.stats.rejected++;
  // No database, polling interval, or outgoing snapshot wait on the command path.
  this.send(peer,{type:'ack',sequence:command?.sequence,ok:!!accepted,result:accepted,frame:this.session.game.frame+1,serverMs:this.cpuTiming?this.now()-begin:null});
 }
 advance(){const now=this.now();if(!this.session||this.session.game.over){this.last=now;return;}if(!this.peers.size){this.last=now;this.accumulator=0;return;}
  this.accumulator+=Math.max(0,now-this.last);this.last=now;let steps=0;
  while(this.accumulator+1e-7>=TICK_MS&&steps<3&&!this.session.game.over){const t=this.now();this.session.tick(1/30);if(this.cpuTiming){const ms=this.now()-t;this.stats.tickMs=ms;this.stats.tickMaxMs=Math.max(this.stats.tickMaxMs,ms);}this.events.push(...this.session.game.events);this.session.game.events.length=0;this.accumulator-=TICK_MS;steps++;}
  // Bound catch-up work; expose overload rather than hiding it with a fake RTT.
  this.stats.lagMs=Math.max(0,this.accumulator-TICK_MS);if(this.accumulator>1000)this.accumulator=1000;
  if(now-this.patchAt>=PATCH_MS||this.session.game.over&&this.events.length){this.patchAt+=Math.floor((now-this.patchAt)/PATCH_MS)*PATCH_MS;this.patch();}
 }
 patch(force=false){
  if(!this.session)return;const ready=[];
  for(const [peer,entry]of this.peers){if((peer.bufferedAmount||0)>128*1024||entry.inFlight.length>=3){entry.needsFull=true;this.stats.droppedSnapshots++;continue;}ready.push([peer,entry]);}
  if(!ready.length){this.events=[];return;}
  const t=this.now(),full=force||ready.some(([,e])=>e.needsFull),data=this.encoder.encode(this.session.game,{full,events:this.events,stats:this.stats});if(this.cpuTiming)this.stats.encodeMs=this.now()-t;
  for(const [peer,entry]of ready){if(this.send(peer,data)){entry.needsFull=false;entry.lastSent=this.encoder.revision;entry.inFlight.push(this.encoder.revision);}else entry.needsFull=true;}this.events=[];
 }
}
