import {env} from 'cloudflare:workers';
import {readExistingClubRoom} from '../../../../_lib/rooms';
import {authenticatePlayer} from '../../../../_lib/session';
import {signTicket} from '../../../../../../realtime-swarm/tickets.js';
import type {ClubState} from '../../../../_lib/club';

export async function GET(request:Request,context:{params:Promise<{code:string}>}){
 const {code}=await context.params;
 if(!/^\d{4}$/.test(code))return new Response(null,{status:400});
 const e=env as unknown as Record<string,string>;
 if(!e.CLUB_INPUT_URL||!e.CLUB_INPUT_SECRET)return new Response(null,{status:204});
 const room=await readExistingClubRoom(code);if(!room)return new Response(null,{status:404});
 const viewer=await authenticatePlayer(request,room);if(!viewer)return new Response(null,{status:401});
 const s=room.game?.club as ClubState|undefined;
 if(!s||!['gomoku','alkkagi'].includes(s.kind)||!s.players.includes(viewer.id)||s.finished||room.view!=='game')return new Response(null,{status:409});
 const url=new URL(e.CLUB_INPUT_URL);if(url.protocol!=='https:')return new Response(null,{status:503});
 const ticket=await signTicket(e.CLUB_INPUT_SECRET,{version:1,kind:'club-connect',expiresAt:Date.now()+30000,roomCode:code,matchId:s.id,gameKind:s.kind,playerId:viewer.id});
 url.protocol='wss:';url.pathname='/connect';url.search='';url.searchParams.set('ticket',ticket);
 const proxy=new URL(`/api/rooms/${code}/club/input/socket`,request.url);proxy.protocol='wss:';proxy.searchParams.set('ticket',ticket);
 return Response.json({socketUrl:proxy.href,directSocketUrl:url.href,ticket},{headers:{'Cache-Control':'no-store'}});
}
