import {DurableObject} from 'cloudflare:workers';
import {verifyTicket} from '../realtime-swarm/tickets.js';
import {cleanInput,validTicket} from './protocol.js';
const denied=(status)=>new Response('Input connection unavailable',{status});
const worker={async fetch(request,env){
 const u=new URL(request.url);
 if(u.pathname==='/health')return Response.json({service:'hanpan-club-input',transport:'websocket'});
 if(u.pathname!=='/connect'||request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return denied(404);
 if(request.headers.get('Origin')!==env.ALLOWED_ORIGIN)return denied(403);
 const p=await verifyTicket(env.CLUB_INPUT_SECRET,u.searchParams.get('ticket'),'club-connect');
 if(!validTicket(p))return denied(401);
 const stub=env.CLUB_INPUTS.get(env.CLUB_INPUTS.idFromName(p.roomCode+':'+p.matchId),{locationHint:'apac'});
 return stub.fetch('https://club-input/connect',{headers:{Upgrade:'websocket','x-club-ticket':JSON.stringify(p)}});
}};
export default worker;
export class ClubInputRoom extends DurableObject {
 async fetch(request){
  const p=JSON.parse(request.headers.get('x-club-ticket')||'null');if(!validTicket(p))return denied(401);
  // A reconnect replaces this player's old socket; no unbounded duplicate tabs.
  for(const old of this.ctx.getWebSockets(p.playerId))old.close(4001,'Reconnected');
  const pair=new WebSocketPair(),socket=pair[1];this.ctx.acceptWebSocket(socket,[p.playerId]);
  socket.serializeAttachment({...p,leaseUntil:Date.now()+60000,last:0,count:0,turnKey:'',lastRequest:''});
  socket.send(JSON.stringify({type:'ready'}));return new Response(null,{status:101,webSocket:pair[0]});
 }
 async webSocketMessage(socket,data){
  const a=socket.deserializeAttachment();if(typeof data!=='string'||data.length>4096)return socket.close(4000,'Invalid input');
  let m;try{m=JSON.parse(data);}catch{return;}
  if(m.type==='renew'){
   const p=await verifyTicket(this.env.CLUB_INPUT_SECRET,m.ticket,'club-connect');
   if(!validTicket(p)||p.playerId!==a.playerId||p.matchId!==a.matchId||p.roomCode!==a.roomCode)return socket.close(4003,'Authentication expired');
   a.leaseUntil=Date.now()+60000;socket.serializeAttachment(a);return;
  }
  if(Date.now()>a.leaseUntil)return socket.close(4003,'Authentication expired');
  if(Date.now()-a.last>1000){a.last=Date.now();a.count=0;}if(++a.count>12)return socket.close(4008,'Too many inputs');
  let out;
  if(m.type==='cancel'&&m.requestId===a.lastRequest)out={type:'cancel',playerId:a.playerId,requestId:m.requestId};
  else if(m.type==='intent'){
   const p=cleanInput(m.payload,a.matchId);if(!p||(a.gameKind==='gomoku')!==(p.action==='club-place'))return;
   const key=p.matchId+':'+p.attempt+':'+p.turn;
   if(a.turnKey===key&&Date.now()-a.sentAt<5000)return;
   a.turnKey=key;a.lastRequest=p.requestId;a.sentAt=Date.now();out={type:'intent',playerId:a.playerId,payload:p};
  }
  socket.serializeAttachment(a);if(!out)return;
  const json=JSON.stringify(out);
  for(const peer of this.ctx.getWebSockets()){if(peer===socket)continue;const state=peer.deserializeAttachment();if(state.leaseUntil<Date.now()){peer.close(4003,'Authentication expired');continue;}try{peer.send(json);}catch{peer.close(1011,'Reconnect');}}
 }
 webSocketClose(socket,code){socket.close(code===1006?1000:code);}
 webSocketError(socket){socket.close(1011,'Reconnect');}
}
