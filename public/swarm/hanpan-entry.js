import {attachOnline,showNetworkNotice} from './app.js';
import {HttpNetworkSession} from './http-network.js';
const params=new URLSearchParams(location.search),room=params.get('room'),matchId=params.get('match');
const overlay=document.getElementById('swarm-connection'),status=document.getElementById('swarm-connection-text'),retry=document.getElementById('swarm-retry');
class HanpanSession extends HttpNetworkSession{
 async request(operation,body){
  const response=await fetch(`/api/rooms/${room}/swarm`,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,operation,matchId}),signal:AbortSignal.any([this.abort.signal,AbortSignal.timeout(12000)])});
  const raw=await response.text();this.httpBytes+=new TextEncoder().encode(raw).length;this.requestCount++;
  let data;try{data=JSON.parse(raw);}catch{throw new Error('서버 응답을 확인하지 못했습니다.');}
  if(!response.ok)throw Object.assign(new Error(data.error||'서버 연결 실패'),{status:response.status});return data;
 }
}
let client;
document.getElementById('hanpan-join')?.addEventListener('click',()=>window.parent.postMessage({type:'hanpan-swarm-exit',matchId},location.origin));
function connect(){
 client?.close();retry.hidden=true;overlay.hidden=false;status.textContent='전투에 연결 중…';
 if(!/^\d{4}$/.test(room||'')||!matchId){status.textContent='한판 방에서 게임을 시작해 주세요.';return;}
 client=new HanpanSession({room:matchId,name:'',storage:null});let attached=false;
 client.addEventListener('snapshot',()=>{if(!attached){attachOnline(client);attached=true;}overlay.hidden=true;});
 client.addEventListener('error',event=>{if(attached&&client.status==='connected'){showNetworkNotice(event.detail);return;}status.textContent=event.detail;overlay.hidden=false;retry.hidden=false;});
 client.addEventListener('status',event=>{if(event.detail==='disconnected'&&!attached)status.textContent='서버에 다시 연결 중…';});
 client.connect();
}
retry.addEventListener('click',connect);window.addEventListener('pagehide',()=>client?.close());window.addEventListener('pageshow',event=>{if(event.persisted)connect();});connect();
