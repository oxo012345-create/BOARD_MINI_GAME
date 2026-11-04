import {swarmDatabase} from '../../_lib/vendor/swarm/bootstrap.js';
import {realtimeAuthority} from '../../_lib/swarm-realtime';
export async function POST(request:Request){
 try{const raw=await request.text();if(raw.length>4096)return Response.json({error:'INVALID_REQUEST'},{status:413});const body=JSON.parse(raw),verified=await realtimeAuthority(request,body);if(!verified)return Response.json({error:'UNAUTHORIZED'},{status:401});
  const row=await swarmDatabase().prepare('SELECT state FROM rooms WHERE code=?').bind(verified.roomCode).first() as {state:string}|null;
  const room=row?JSON.parse(row.state):null,match=room?.game?.swarm;
  if(room?.view!=='game'||room.game?.id!=='swarm-territory'||match?.matchId!==verified.matchId||match.transport!=='durable')return Response.json({error:'MATCH_ENDED'},{status:409});
  return Response.json({active:match.playerIds.map((id:string)=>room.players.some((p:{id:string;status:string})=>p.id===id&&p.status==='active'))},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'AUTHORITY_UNAVAILABLE'},{status:503});}
}
