import {env} from 'cloudflare:workers';
import {verifyTicket} from '../../../../../../../realtime-swarm/tickets.js';

// Keep the client connection on the Site ingress. The upstream hop travels
// within Cloudflare rather than taking the ISP's workers.dev route.
export async function GET(request:Request,context:{params:Promise<{code:string}>}){
 const {code}=await context.params,u=new URL(request.url),e=env as unknown as Record<string,string>;
 if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return new Response(null,{status:426});
 if(request.headers.get('Origin')!==u.origin)return new Response(null,{status:403});
 const ticket=u.searchParams.get('ticket'),p=await verifyTicket(e.CLUB_INPUT_SECRET,ticket,'club-connect');
 if(!p||p.roomCode!==code||!['gomoku','alkkagi'].includes(p.gameKind))return new Response(null,{status:401});
 const remote=new URL('/connect',e.CLUB_INPUT_URL);remote.searchParams.set('ticket',ticket!);
 const response=await fetch(remote,{headers:{Upgrade:'websocket',Origin:u.origin},redirect:'manual'});
 return new Response(response.body,{status:response.status,headers:response.headers,...(response.status===101?{webSocket:(response as Response&{webSocket:unknown}).webSocket}:{})});
}
