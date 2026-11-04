import {swarmEnvironment} from './vendor/swarm/bootstrap.js';
import {signTicket,verifyTicket} from '../../../realtime-swarm/tickets.js';
import type {RoomState,Player} from './rooms';
import type {SwarmMatch} from './swarm-host';

function config(){const e=swarmEnvironment() as unknown as Record<string,string>;let url:URL;try{url=new URL(e.SWARM_REALTIME_URL);}catch{return null;}if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||!e.SWARM_REALTIME_SECRET||e.SWARM_REALTIME_SECRET.length<32)return null;return {origin:url.origin,secret:e.SWARM_REALTIME_SECRET};}
export async function selectSwarmRealtime(roomCode:string){const c=config(),allowed=String((swarmEnvironment() as unknown as Record<string,string>).SWARM_REALTIME_ROOMS||'').split(',').map(v=>v.trim());if(!c||!allowed.includes('*')&&!allowed.includes(roomCode))return {};try{const r=await fetch(c.origin+'/health',{signal:AbortSignal.timeout(1800)});if(r.ok&&(await r.json() as {service?:string}).service==='hanpan-swarm-realtime')return {transport:'durable' as const,endpoint:c.origin};}catch{}return {};}
export async function realtimeWelcome(room:RoomState,viewer:Player,match:Required<Pick<SwarmMatch,'matchId'|'playerIds'>>&SwarmMatch){
 const c=config();if(!c||match.endpoint!==c.origin)throw Object.assign(new Error('전투 서버 연결을 확인해 주세요.'),{status:503});
 const seat=match.playerIds.indexOf(viewer.id),roster=match.playerIds.map(id=>({name:room.players.find(p=>p.id===id)?.name||'플레이어'}));
 const token=await signTicket(c.secret,{version:1,kind:'connect',expiresAt:Date.now()+30000,roomCode:room.code,matchId:match.matchId,mode:match.mode,seat,roster});
 return {transport:'durable',socketUrl:c.origin.replace('https:','wss:')+'/connect?ticket='+encodeURIComponent(token)};
}
export async function realtimeAuthority(request:Request,body:Record<string,unknown>){const c=config();if(!c)return null;const token=request.headers.get('Authorization')?.replace(/^Bearer /,'');const p=await verifyTicket(c.secret,token,'authority');return p&&p.roomCode===body.roomCode&&p.matchId===body.matchId?p:null;}
