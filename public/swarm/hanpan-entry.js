import {bindSessionLifecycle} from './session-lifecycle.js';
import {attachOnline,showNetworkNotice} from './app.js';
import {HanpanSession} from './hanpan-network.js';
const params=new URLSearchParams(location.search),room=params.get('room'),matchId=params.get('match');
const overlay=document.getElementById('swarm-connection'),status=document.getElementById('swarm-connection-text'),retry=document.getElementById('swarm-retry');
let client,unbindLifecycle;
document.getElementById('hanpan-join')?.addEventListener('click',()=>window.parent.postMessage({type:'hanpan-swarm-exit',matchId},location.origin));
function connect(){
 unbindLifecycle?.();client?.close();retry.hidden=true;overlay.hidden=false;status.textContent='전투에 연결 중…';
 if(!/^\d{4}$/.test(room||'')||!matchId){status.textContent='한판 방에서 게임을 시작해 주세요.';return;}
 client=new HanpanSession({room:matchId,roomCode:room,name:'',storage:null});unbindLifecycle=bindSessionLifecycle(client);let attached=false;
 client.addEventListener('snapshot',()=>{if(!attached){attachOnline(client);attached=true;}overlay.hidden=true;});
 client.addEventListener('error',event=>{if(attached&&client.status==='connected'){showNetworkNotice(event.detail);return;}status.textContent=event.detail;overlay.hidden=false;retry.hidden=false;});
 client.addEventListener('status',event=>{if(event.detail==='disconnected'&&!attached)status.textContent='서버에 다시 연결 중…';});
 client.connect();
}
retry.addEventListener('click',connect);window.addEventListener('pagehide',()=>client?.close());window.addEventListener('pageshow',event=>{if(event.persisted)connect();});connect();
