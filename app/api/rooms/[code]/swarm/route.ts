import {swarmDatabase} from '../../../_lib/vendor/swarm/bootstrap.js';
import {readExistingClubRoom} from '../../../_lib/rooms';
import {authenticatePlayer} from '../../../_lib/session';
import {swarmRequest} from '../../../_lib/swarm-host';

export async function POST(request:Request,context:{params:Promise<{code:string}>}){
 try{
  const url=new URL(request.url),origin=request.headers.get('Origin');
  if(origin&&origin!==url.origin)return Response.json({error:'다른 사이트의 요청은 허용하지 않습니다.'},{status:403});
  const {code}=await context.params;if(!/^\d{4}$/.test(code))return Response.json({error:'방 코드를 확인해 주세요.'},{status:400});
  const raw=await request.text();if(raw.length>4096)return Response.json({error:'요청이 너무 큽니다.'},{status:413});
  let payload:Record<string,unknown>;try{payload=JSON.parse(raw);}catch{return Response.json({error:'잘못된 요청입니다.'},{status:400});}
  if(!payload||typeof payload!=='object'||Array.isArray(payload))return Response.json({error:'잘못된 요청입니다.'},{status:400});
  const room=await readExistingClubRoom(code);if(!room)return Response.json({error:'방을 찾지 못했습니다.'},{status:404});
  const viewer=await authenticatePlayer(request,room);if(!viewer)return Response.json({error:'한판 방에 다시 참가해 주세요.'},{status:401});
  const db=swarmDatabase();
  return Response.json(await swarmRequest(db,room,viewer,payload),{headers:{'Cache-Control':'no-store'}});
 }catch(error){const failure=error as Error&{status?:number};if(!failure.status)console.error('Hanpan swarm request failed',failure.message?.slice(0,150));return Response.json({error:failure.status?failure.message:'전투 상태를 불러오지 못했습니다. 다시 시도해 주세요.'},{status:failure.status||503});}
}
