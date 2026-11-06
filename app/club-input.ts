import {matchActor,matchSide,type ClubView,type Match} from './api/_lib/club';
import {renjuMove} from './api/_lib/renju';
import {cleanInput} from '../realtime-club/protocol.js';
export type ClubIntent={playerId:string;payload:Record<string,unknown>};
/** Predict only the visible move, never a turn or outcome. */
export function previewClubInput(s:ClubView,intent:ClubIntent):Match|null{
 const p=cleanInput(intent.payload,s.id);
 if(!p||s.finished||s.paused?.length||!['gomoku','alkkagi'].includes(s.kind))return null;
 const m=s.matches.find(m=>m.id===p.matchId);
 if(!m||m.turn!==p.turn||m.attempt!==p.attempt||m.winner!==undefined||m.draw||matchActor(m)!==intent.playerId||m.launch&&!m.launch.settled)return null;
 if(s.kind==='gomoku'&&p.action==='club-place'&&'cell'in p&&renjuMove(m.board,p.cell,matchSide(m)+1).legal){
  return {...m,board:m.board.map((v,i)=>i===p.cell?matchSide(m)+1:v),lastMove:p.cell};
 }
 if(s.kind==='alkkagi'&&p.action==='club-launch'&&'discId'in p&&m.discs.some(d=>d.id===p.discId&&d.alive&&d.side===matchSide(m)))return {...m,launch:{id:p.requestId,shot:(m.shot??0)+1,discId:p.discId,dx:p.dx,dy:p.dy,discs:m.discs,startedAt:Date.now(),settled:false,provisional:true}};
 return null;
}
