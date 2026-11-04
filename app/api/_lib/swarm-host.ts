import type {RoomState,Player} from './rooms';
import {D1Rooms} from './vendor/swarm/d1-rooms.js';
import {makeInitialBattle,swarmDatabase} from './vendor/swarm/bootstrap.js';
import {authorizedPoll} from './vendor/swarm/hanpan-poll.js';
import {authorizedCommand} from './vendor/swarm/hanpan-command.js';
import {getSessionToken,hashToken} from './session';
import {realtimeWelcome} from './swarm-realtime';

export type SwarmMatch={mode:'duel'|'team'|'ffa';matchId?:string;playerIds?:string[];transport?:'durable';endpoint?:string};
type SwarmGame={id?:string;swarm?:SwarmMatch};
const error=(message:string,status=409)=>{throw Object.assign(new Error(message),{status});};

// Read the parent authority and cached battle view in one D1 round trip.
// Authentication still runs before any battle mutation or snapshot is returned.
export async function readSwarmContext(db:ReturnType<typeof swarmDatabase>,code:string,payload:Record<string,unknown>,request?:Request){
 const key=typeof payload.matchId==='string'?`hanpan:${code}:${payload.matchId}`:'',revision=Number.isSafeInteger(payload.revision)?Number(payload.revision):0;
 if(request&&['poll','command'].includes(String(payload.operation))&&typeof payload.matchId==='string'){
  const session=getSessionToken(request,code);if(session){const sessionHash=await hashToken(session),token=await seatToken(sessionHash,payload.matchId),args={roomCode:code,key,matchId:payload.matchId,sessionHash,token,revision},command=payload.command as Record<string,unknown>|undefined;const row=payload.operation==='poll'?await authorizedPoll(db,args):command?.matchId===payload.matchId?await authorizedCommand(db,{...args,command:{...command,matchId:key}}):null;if(row)return row;}
 }
 return db.prepare('SELECT p.state AS parent_state,r.*,CASE WHEN s.revision>? THEN s.snapshot END AS snapshot,s.acks,s.revision AS state_revision FROM rooms p LEFT JOIN swarm_rooms r ON r.code=? AND r.expires>? LEFT JOIN swarm_states s ON r.code=s.code WHERE p.code=?').bind(revision,key,Date.now(),code).first();
}

export function currentSwarm(room:RoomState,viewer:Player,matchId:unknown){
 const game=room.game as SwarmGame|undefined,match=game?.swarm;
 if(room.view!=='game'||game?.id!=='swarm-territory'||!match?.matchId||match.matchId!==matchId)error('이전 전투 입력입니다. 현재 게임에 다시 연결해 주세요.');
 if(!match!.playerIds?.includes(viewer.id)||viewer.status!=='active')error('이번 전투 참가자가 아닙니다.',403);
 return match as SwarmMatch&Required<Pick<SwarmMatch,'matchId'|'playerIds'>>;
}

async function seatToken(sessionHash:string,matchId:string){
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`hanpan-swarm:${matchId}:${sessionHash}`));
 const hex=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('').slice(0,32);
 return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

async function bootstrap(db:ReturnType<typeof swarmDatabase>,room:RoomState,match:SwarmMatch&Required<Pick<SwarmMatch,'matchId'|'playerIds'>>,key:string){
 const now=Date.now(),seed=parseInt(match.matchId.replaceAll('-','').slice(0,8),16);
 const participants=match.playerIds.map(id=>{const p=room.players.find(p=>p.id===id);if(!p)error('전투 참가자 정보를 찾지 못했습니다.');return p!;});
 const seats=await Promise.all(participants.map(async(p,id)=>({id,name:p.name,token:await seatToken(p.sessionHash,match.matchId),seen:now})));
 const initial=makeInitialBattle({key,mode:match.mode,seed,seats});
 await db.batch([
  db.prepare('DELETE FROM swarm_rooms WHERE expires<?').bind(now),
  db.prepare('INSERT OR IGNORE INTO swarm_rooms(code,mode,seed,seats,started,revision,last_at,next_tick,expires,created) VALUES(?,?,?,?,1,1,?,?,?,?)').bind(key,match.mode,seed,JSON.stringify(seats),now,now+100,now+3600000,now),
  db.prepare('INSERT OR IGNORE INTO swarm_states(code,checkpoint,snapshot,revision,acks) VALUES(?,?,?,1,?)').bind(key,initial.checkpoint,initial.snapshot,'[]'),
 ]);
}

export async function swarmRequest(db:ReturnType<typeof swarmDatabase>,room:RoomState,viewer:Player,payload:Record<string,unknown>,prefetched=null){
 const match=currentSwarm(room,viewer,payload.matchId),key=`hanpan:${room.code}:${match.matchId}`,token=await seatToken(viewer.sessionHash,match.matchId),service=new D1Rooms(db);
 if(match.transport==='durable'){
  if(payload.operation==='join')return realtimeWelcome(room,viewer,match);
  error('이 전투는 실시간 연결을 사용합니다. 다시 연결해 주세요.');
 }
 if(payload.operation==='join'){
  await bootstrap(db,room,match,key);
  const {welcome,lobby}=await service.join(key,{token,name:viewer.name});
  // Keep authority in the existing HttpOnly Hanpan cookie. No seat credential
  // is returned to the browser or stored in the public parent room snapshot.
  return {welcome:{type:'welcome',room:match.matchId,seat:welcome.seat,mode:welcome.mode,sequence:welcome.sequence},lobby};
 }
 if(payload.operation==='poll')return service.poll(key,token,Number.isSafeInteger(payload.revision)?Number(payload.revision):0,Number.isSafeInteger(payload.ack)?Number(payload.ack):0,prefetched);
 if(payload.operation==='command'){
  const command=payload.command as Record<string,unknown>|undefined;
  if(!command||command.matchId!==match.matchId)error('이전 전투 명령입니다.');
  return service.command(key,token,{...command,matchId:key},Number.isSafeInteger(payload.revision)?Number(payload.revision):0,Number.isSafeInteger(payload.ack)?Number(payload.ack):0,prefetched);
 }
 error('지원하지 않는 전투 요청입니다.',400);
}
