import {swarmEnvironment} from './vendor/swarm/bootstrap.js';
import {signTicket,verifyTicket} from '../../../realtime-swarm/tickets.js';
import type {RoomState,Player} from './rooms';
import type {SwarmMatch} from './swarm-host';

function config(){const e=swarmEnvironment() as unknown as Record<string,string>;let url:URL;try{url=new URL(e.SWARM_REALTIME_URL);}catch{return null;}if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||!e.SWARM_REALTIME_SECRET||e.SWARM_REALTIME_SECRET.length<32)return null;return {origin:url.origin,secret:e.SWARM_REALTIME_SECRET};}
export async function selectSwarmRealtime(roomCode:string){const c=config(),allowed=String((swarmEnvironment() as unknown as Record<string,string>).SWARM_REALTIME_ROOMS||'').split(',').map(v=>v.trim());if(!c||!allowed.includes('*')&&!allowed.includes(roomCode))return {};return {transport:'durable' as const,endpoint:c.origin};}
export async function realtimeWelcome(room:RoomState,viewer:Player,match:Required<Pick<SwarmMatch,'matchId'|'playerIds'>>&SwarmMatch){
 const c=config();if(!c||match.endpoint!==c.origin)throw Object.assign(new Error('전투 서버 연결을 확인해 주세요.'),{status:503});
 const seat=match.playerIds.indexOf(viewer.id),roster=match.playerIds.map(id=>({name:room.players.find(p=>p.id===id)?.name||'플레이어'}));
 const token=await signTicket(c.secret,{version:1,kind:'connect',expiresAt:Date.now()+30000,roomCode:room.code,matchId:match.matchId,mode:match.mode,seat,roster});
 return {transport:'durable',socketUrl:'/api/swarm/realtime-connect?ticket='+encodeURIComponent(token)};
}
// Keep the browser on the Site's nearby ingress; the Worker-to-Worker hop uses
// Cloudflare's network instead of the client's workers.dev ISP route.
export async function proxySwarmSocket(request:Request){
 const origin=new URL(request.url).origin;
 if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return new Response('WebSocket required',{status:426});
 if(request.headers.get('Origin')!==origin)return new Response('Origin not allowed',{status:403});
 const c=config(),ticket=new URL(request.url).searchParams.get('ticket');
 if(!c||!await verifyTicket(c.secret,ticket,'connect'))return new Response('Invalid ticket',{status:401});
 const upstream=await fetch(c.origin+'/connect?ticket='+encodeURIComponent(ticket!),{headers:{Upgrade:'websocket',Origin:origin},redirect:'manual'});
 // vinext adds response headers; fetch() responses have immutable headers.
 return new Response(upstream.body,{status:upstream.status,headers:upstream.headers,...(upstream.status===101?{webSocket:(upstream as Response&{webSocket:unknown}).webSocket}:{})});
}
export async function realtimeAuthority(request:Request,body:Record<string,unknown>){const c=config();if(!c)return null;const token=request.headers.get('Authorization')?.replace(/^Bearer /,'');const p=await verifyTicket(c.secret,token,'authority');return p&&p.roomCode===body.roomCode&&p.matchId===body.matchId?p:null;}
