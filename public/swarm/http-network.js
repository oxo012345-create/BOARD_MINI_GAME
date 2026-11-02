import {NetworkSession} from './network.js';

// The same server-owned snapshots/rendering as WebSocket, over the Sites D1
// transport. Polls never overlap; commands are idempotent by seat + sequence.
export class HttpNetworkSession extends NetworkSession{
 constructor(options){super(options);this.ackCursor=0;this.httpBytes=0;this.requestCount=0;this.abort=new AbortController();}
 async request(path,body){
  const response=await fetch('/api/swarm/http/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room:this.id,token:this.token,...body}),signal:AbortSignal.any([this.abort.signal,AbortSignal.timeout(12000)])});
  const raw=await response.text();this.httpBytes+=new TextEncoder().encode(raw).length;this.requestCount++;
  let data;try{data=JSON.parse(raw);}catch{throw Object.assign(new Error('서버 응답을 확인하지 못했습니다'),{status:response.status});}
  if(!response.ok)throw Object.assign(new Error(data.error||'서버 연결 실패'),{status:response.status});return data;
 }
 async connect(){
  if(this.disposed)return;this.status='connecting';this.emit('status',this.status);
  try{const data=await this.request('join',{name:this.name});if(this.disposed)return;
   this.message(data.welcome);this.ackCursor=data.welcome.sequence;this.emit('lobby',data.lobby);this.poll();
  }catch(error){if(this.disposed)return;this.status='disconnected';this.emit('status',this.status);if([400,401,404,409].includes(error.status))return this.emit('error',error.message);this.retry=setTimeout(()=>this.connect(),1000);}
 }
 async poll(){
  if(this.disposed)return;const begin=performance.now();
  try{
   const data=await this.request('poll',{revision:this.replica.revision,ack:this.ackCursor});if(this.disposed)return;
   this.record('rtt',performance.now()-begin);this.status='connected';this.emit('status',this.status);
   this.consume(data);
   this.retries=0;
   if(this.replica.revision&&this.game.over)return;
  }catch(error){if(this.disposed)return;this.status='disconnected';this.emit('status',this.status);if([401,404].includes(error.status)){this.emit('error',error.message);return;}}
  this.retry=setTimeout(()=>this.poll(),Math.max(this.status==='connected'?10:700,100-(performance.now()-begin)));
 }
 consume(data){
  if(!data.lobby.started)this.emit('lobby',data.lobby);
  for(const ack of data.acks)if(ack.sequence>this.ackCursor||this.pending.has(ack.sequence)){this.message(ack);this.ackCursor=Math.max(this.ackCursor,ack.sequence);}
  if(data.snapshot){const raw=atob(data.snapshot),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));this.snapshot(bytes.buffer);}
 }
 sendRaw(message){
  if(message.type==='stateAck'||message.type==='resync')return true;
  if(this.disposed||this.status!=='connected')return false;
  const path=message.type==='start'?'start':message.type==='command'?'command':null;if(!path)return false;
  if(path==='command'){
   if(this.pending.size>=8)return false;
   // HTTP requests may arrive out of order. Preserve each seat's command order
   // before insertion into the shared queue, like the WebSocket transport.
   this.sendChain=(this.sendChain||Promise.resolve()).then(()=>this.sendRequest(path,{command:message.command,revision:this.replica.revision,ack:this.ackCursor}));
  }else this.sendRequest(path,{});
  return true;
 }
 async sendRequest(path,body){
  for(let attempt=0;attempt<3&&!this.disposed;attempt++)try{const data=await this.request(path,body);if(!this.disposed&&data.state)this.consume(data.state);return;}catch(error){
   if(this.disposed)return;
   if(error.status&&error.status<500&&error.status!==409){this.emit('error',error.message);return;}
   if(attempt===2){this.emit('error','명령 응답을 확인하지 못했습니다. 연결 상태를 확인하세요');return;}
   await new Promise(resolve=>setTimeout(resolve,150*(attempt+1)));
  }
 }
 diagnostics(){return {...super.diagnostics(),transport:'https-d1',authority:'server',pollsOverlap:false,httpBytesReceived:this.httpBytes,httpRequests:this.requestCount,rttMeaning:'Full state-poll HTTP round trip, including server/DB work; not a WebSocket ping',serverCpuMs:null};}
 close(){super.close();this.abort.abort();}
}
