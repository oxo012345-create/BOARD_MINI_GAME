export function validTicket(p){return p&&['gomoku','alkkagi'].includes(p.gameKind)&&typeof p.playerId==='string'&&p.playerId.length===36;}
export function cleanInput(p,clubId){
 if(!p||p.clubId!==clubId||typeof p.requestId!=='string'||p.requestId.length<8||p.requestId.length>90||typeof p.matchId!=='string'||p.matchId.length>40||!Number.isInteger(p.turn)||p.turn<0||!Number.isInteger(p.attempt)||p.attempt<0)return null;
 const b={clubId,requestId:p.requestId,matchId:p.matchId,turn:p.turn,attempt:p.attempt,action:p.action};
 if(p.action==='club-place'&&Number.isInteger(p.cell)&&p.cell>=0&&p.cell<225)return {...b,cell:p.cell};
 if(p.action==='club-launch'&&Number.isInteger(p.discId)&&p.discId>=0&&p.discId<10&&typeof p.dx==='number'&&typeof p.dy==='number'&&Number.isFinite(p.dx)&&Number.isFinite(p.dy)&&Math.hypot(p.dx,p.dy)>=3&&Math.hypot(p.dx,p.dy)<=181)return {...b,discId:p.discId,dx:p.dx,dy:p.dy};
 return null;
}
