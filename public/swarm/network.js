import {Game} from './engine.js';
import {SnapshotReplica} from './net-protocol.js';
const summary=a=>{if(!a.length)return null;const sorted=[...a].sort((x,y)=>x-y);return {mean:a.reduce((s,x)=>s+x,0)/a.length,p95:sorted[Math.ceil(sorted.length*.95)-1],max:sorted.at(-1),samples:a.length};};
export class NetworkSession extends EventTarget{
 constructor({room,name,token=null,storage=globalThis.sessionStorage}={}){
  super();this.id=room;this.name=name;this.token=token;this.storage=storage;this.game=new Game({seed:1});this.online=true;this.replica=new SnapshotReplica();this.seat=0;this.sequence=0;this.pending=new Map();this.pings=new Map();this.samples={rtt:[],ack:[],paint:[],gaps:[],server:[]};this.status='connecting';this.retries=0;this.disposed=false;this.received=0;this.lastState=0;this.targets=new Map();this.lastPong=0;this.bytes=0;
 }
 emit(type,detail){this.dispatchEvent(new CustomEvent(type,{detail}));}
 connect(){
  const url=new URL('/api/swarm/ws',location.href);url.protocol=location.protocol==='https:'?'wss:':'ws:';url.searchParams.set('room',this.id);this.status='connecting';this.emit('status',this.status);
  const socket=this.socket=new WebSocket(url);socket.binaryType='arraybuffer';
  socket.onopen=()=>{this.sendRaw({type:'join',name:this.name,token:this.token});this.lastPong=performance.now();this.heartbeat=setInterval(()=>this.ping(),1000);this.ping();};
  socket.onmessage=e=>{if(socket!==this.socket)return;try{if(typeof e.data==='string')this.message(JSON.parse(e.data));else this.snapshot(e.data);}catch{this.sendRaw({type:'resync'});}};
  socket.onerror=()=>{};
  socket.onclose=e=>{clearInterval(this.heartbeat);if(this.disposed)return;this.status='disconnected';this.emit('status',this.status);if(e.code===4001||e.code===4000){this.emit('error','연결이 종료되었습니다. 방으로 돌아가 다시 참가하세요.');return;}this.retry=setTimeout(()=>this.connect(),Math.min(5000,500*2**this.retries++));};
 }
 sendRaw(message){if(this.socket?.readyState!==WebSocket.OPEN)return false;if(this.socket.bufferedAmount>32*1024)return false;this.socket.send(JSON.stringify(message));return true;}
 ping(){const now=performance.now();if(now-this.lastPong>8000){this.socket?.close();return;}const id=crypto.randomUUID();this.pings.set(id,now);for(const [key,t]of this.pings)if(now-t>10000)this.pings.delete(key);this.sendRaw({type:'ping',id});}
 record(key,value){const list=this.samples[key];list.push(value);if(list.length>300)list.shift();}
 message(m){const now=performance.now();
  if(m.type==='welcome'){this.seat=m.seat;this.token=m.token;this.mode=m.mode;this.sequence=m.sequence;this.game=new Game({mode:m.mode,seed:1});this.replica=new SnapshotReplica();this.lastState=0;this.targets.clear();this.pending.clear();this.status='connected';this.retries=0;try{this.storage?.setItem('swarm-room-'+this.id,JSON.stringify({token:m.token,name:this.name}));}catch{}this.emit('welcome',m);this.emit('status',this.status);}
  if(m.type==='lobby')this.emit('lobby',m);
  if(m.type==='error')this.emit('error',m.message);
  if(m.type==='pong'){const start=this.pings.get(m.id);if(start!==undefined){this.record('rtt',now-start);this.pings.delete(m.id);}this.lastPong=now;}
  if(m.type==='ack'){const pending=this.pending.get(m.sequence);if(pending){this.record('ack',now-pending.sent);if(Number.isFinite(m.serverMs))this.record('server',m.serverMs);if(m.ok)pending.frame=m.frame;else this.pending.delete(m.sequence);}if(!m.ok)this.emit('error','명령을 실행할 수 없습니다');}
 }
 snapshot(data){const packet=this.replica.apply(data);if(!packet)return;if(packet.resync){this.sendRaw({type:'resync'});return;}const now=performance.now(),m=packet.meta,g=this.game;this.sendRaw({type:'stateAck',revision:m.revision});
  if(this.lastState)this.record('gaps',now-this.lastState);this.lastState=now;this.received++;this.bytes+=data.byteLength;this.serverStats=m.stats;const before=new Map(g.units.map(u=>[u.id,u]));this.targets=new Map();
  g.mode=m.mode;g.time=m.time;g.frame=m.frame;g.over=m.over;g.winner=m.winner;g.reason=m.reason;g.players=m.players;
  g.units=[...this.replica.units.values()].map(u=>{const old=before.get(u.id),copy={...u};if(old){this.targets.set(u.id,{fromX:old.x,fromY:old.y,x:u.x,y:u.y});copy.x=old.x;copy.y=old.y;}return copy;});
  for(const z of m.zones){const target=g.zoneMap.get(z[0]);Object.assign(target,{owner:z[1],hp:z[2]/10,maxHp:z[3],captureFlash:z[4],strike:z[5]});}
  g.dispensers=m.drones.map(d=>({id:d[0],player:d[1],x:d[2],y:d[3],zone:d[4],hp:d[5],maxHp:d[5]}));g.projectiles=m.shots.map(b=>({x:b[0],y:b[1],player:b[2],tx:b[3],ty:b[4]}));g.events.push(...m.events);g.reindex();this.snapshotAt=now;this.emit('snapshot',m);
 }
 tick(){const a=Math.max(0,Math.min(1,(performance.now()-(this.snapshotAt||0))/100));for(const u of this.game.units){const target=this.targets.get(u.id);if(target){u.x=target.fromX+(target.x-target.fromX)*a;u.y=target.fromY+(target.y-target.fromY)*a;}}}
 canIssue(){return this.status==='connected'&&!!this.lastState&&performance.now()-this.lastState<=1500&&!this.game.over;}
 dispatch(actor,input){if(!this.canIssue())return false;const sequence=++this.sequence,command={...input,sequence,matchId:this.id};if(!this.sendRaw({type:'command',command}))return false;this.pending.set(sequence,{sent:performance.now(),frame:null});return input.type==='move'?this.game.commandCount(this.seat,input.fraction)||1:true;}
 painted(){const now=performance.now();this.draws??=[];this.draws.push(now);this.draws=this.draws.filter(t=>now-t<5000);for(const [sequence,p]of this.pending){if(p.frame!==null&&this.game.frame>=p.frame){this.record('paint',now-p.sent);this.pending.delete(sequence);}else if(now-p.sent>10000)this.pending.delete(sequence);}}
 diagnostics(){const draws=this.draws||[];return {transport:'websocket',room:this.id,seat:this.seat,status:this.status,source:'this-client-real-connection',drawFps:draws.length>1?(draws.length-1)/((draws.at(-1)-draws[0])/1000):null,rttMs:summary(this.samples.rtt),ackMs:summary(this.samples.ack),commandToDrawMs:summary(this.samples.paint),snapshotGapMs:summary(this.samples.gaps),serverCommandMs:summary(this.samples.server),server:this.serverStats||null,staleMs:this.lastState?performance.now()-this.lastState:null,bytesReceived:this.bytes,snapshots:this.received,viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,userAgent:navigator.userAgent,gpuExecutionMs:null,thermalStatus:null};}
 close(){this.disposed=true;clearInterval(this.heartbeat);clearTimeout(this.retry);this.socket?.close();}
}
