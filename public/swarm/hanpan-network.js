import {HttpNetworkSession} from './http-network.js';
import {NetworkSession} from './network.js';

export class HanpanSession extends HttpNetworkSession{
 constructor({roomCode,...options}){super(options);this.roomCode=roomCode;this.socketMode=false;}
 async request(operation,body){
  const response=await fetch(`/api/rooms/${this.roomCode}/swarm`,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,operation,matchId:this.id}),signal:AbortSignal.any([this.abort.signal,AbortSignal.timeout(12000)])});
  const raw=await response.text();this.httpBytes+=new TextEncoder().encode(raw).length;this.requestCount++;
  let data;try{data=JSON.parse(raw);}catch{throw new Error('서버 응답을 확인하지 못했습니다.');}
  if(!response.ok)throw Object.assign(new Error(data.error||'서버 연결 실패'),{status:response.status});return data;
 }
 async connect(){
  if(this.disposed)return;this.status='connecting';this.emit('status',this.status);
  try{
   const data=await this.request('join',{name:this.name});if(this.disposed)return;
   if(data.transport==='durable'){
    const url=new URL(data.socketUrl,globalThis.location?.href);if(url.protocol==='https:')url.protocol='wss:';else if(url.protocol==='http:')url.protocol='ws:';if(!['wss:','ws:'].includes(url.protocol))throw new Error('전투 서버 주소가 잘못되었습니다.');
    this.socketMode=true;this.socketAddress=url.href;return NetworkSession.prototype.connect.call(this);
   }
   this.socketMode=false;this.message(data.welcome);this.ackCursor=data.welcome.sequence;this.emit('lobby',data.lobby);this.poll();
  }catch(error){
   if(this.disposed)return;this.status='disconnected';this.emit('status',this.status);
   if([400,401,403,404,409].includes(error.status)){this.emit('error',error.message);return;}
   this.retry=setTimeout(()=>this.connect(),Math.min(5000,500*2**this.retries++));
  }
 }
 sendRaw(message){return this.socketMode?NetworkSession.prototype.sendRaw.call(this,message):super.sendRaw(message);}
 latency(now=performance.now()){return this.socketMode?NetworkSession.prototype.latency.call(this,now):super.latency(now);}
 diagnostics(){return this.socketMode?{...NetworkSession.prototype.diagnostics.call(this),transport:'websocket-durable',authority:'server',rttMeaning:'WebSocket ping round trip; command-to-draw and snapshot gaps are measured separately'}:super.diagnostics();}
}
