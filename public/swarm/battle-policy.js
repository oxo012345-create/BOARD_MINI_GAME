export const MATCH_RULES=Object.freeze({idleWarning:90,idleForfeit:120,awayForfeit:120,abandon:120});
const combat=new Set(['shot','hit','death','destroy','sunkenStrike','capture']);

// Authoritative match policy. Pings/receipts prove connection only, never play.
export class BattlePolicy{
 constructor(game,{clock=()=>game.time,online=false,saved,rules=MATCH_RULES}={}){
  this.game=game;this.clock=clock;this.online=online;this.rules=rules;
  this.progress=saved?.progress??game.players.map(()=>0);this.presentAt=saved?.presentAt??game.players.map(()=>0);this.absentAt=saved?.absentAt??game.players.map(()=>null);this.orders=saved?.orders??[];this.emptySince=saved?.emptySince??null;this.lastCheck=-Infinity;this.lastMovement=-Infinity;this.movement=new Map();this.present=new Set(game.players.map(p=>p.id));
 }
 checkpoint(){return{progress:this.progress,presentAt:this.presentAt,orders:this.orders,absentAt:this.absentAt,emptySince:this.emptySince};}
 credit(player,at=this.clock(),team=false){const owner=this.game.players[player];if(!owner)return;for(const p of this.game.players)if((p.id===player||team&&p.team===owner.team)&&(!this.online||this.present.has(p.id)))this.progress[p.id]=at;}
 events(events){if(!events.some(e=>combat.has(e.type)))return;const at=this.clock();for(const p of this.game.players)if(!p.eliminated)this.credit(p.id,at);}
 command(player,input){
  if(input.type==='active'){this.credit(player);this.game.players[player].idleWarning=null;return;}
  const signature=input.type==='move'?`move:${Math.round(input.x/16)}:${Math.round(input.y/16)}`:input.type==='claim'?`claim:${input.zone}`:null;
  if(signature&&this.orders[player]===signature)return;
  if(input.type==='move'&&!this.game.unitsOf(player).some(u=>Math.hypot(u.x-input.x,u.y-input.y)>40))return;
  if(signature)this.orders[player]=signature;this.credit(player);
 }
 observeMovement(at){const next=new Map();for(const u of this.game.units){if(!u.movingOrder||!u.walking)continue;const distance=Math.hypot(u.tx-u.x,u.ty-u.y),old=this.movement.get(u.id);if(old&&old.player===u.player&&old.distance-distance>=12)this.credit(u.player,at);next.set(u.id,{player:u.player,distance});}this.movement=next;}
 update({present,force=false}={}){
  const g=this.game,t=Math.max(0,this.clock());if(g.over)return;
  if(present)this.present=new Set(present);
  if(!force&&t-this.lastCheck<1)return;this.lastCheck=t;
  g.matchClock={elapsed:Math.floor(t)};
  if(!this.online)return;
  if(t-this.lastMovement>=1){this.observeMovement(t);this.lastMovement=t;}const living=g.players.filter(p=>!p.eliminated),connected=living.filter(p=>this.present.has(p.id));
  for(const p of living){if(this.present.has(p.id)){if(this.absentAt[p.id]!==null){this.progress[p.id]=Math.min(t,this.progress[p.id]+t-this.absentAt[p.id]);this.absentAt[p.id]=null;}this.presentAt[p.id]=t;}else if(this.absentAt[p.id]===null)this.absentAt[p.id]=this.presentAt[p.id];}
  if(connected.length)this.emptySince=null;else if(this.emptySince===null)this.emptySince=Math.max(0,...living.map(p=>this.presentAt[p.id]??0));
  if(this.emptySince!==null&&t-this.emptySince>=this.rules.abandon){g.finish(null,'abandoned');return;}
  const lost=[];
  for(const p of living){const here=this.present.has(p.id),elapsed=t-(here?this.progress[p.id]:this.presentAt[p.id]),limit=here?this.rules.idleForfeit:this.rules.awayForfeit;p.away=!here;p.idleWarning=elapsed>=this.rules.idleWarning?Math.max(0,Math.ceil(limit-elapsed)):null;if(elapsed>=limit)lost.push(p);}
  // Simultaneous inactivity is a draw, independent of seat iteration order.
  if(lost.length&&lost.length===living.length){g.finish(null,'inactive');return;}
  for(const p of lost){p.eliminated=true;p.forfeitReason=this.present.has(p.id)?'idle':'disconnected';p.researchLost=true;p.upgrading={};g.units=g.units.filter(u=>u.player!==p.id);g.dispensers=g.dispensers.filter(d=>d.player!==p.id);g.projectiles=g.projectiles.filter(b=>b.player!==p.id);for(const z of g.zones)if(z.owner===p.id){z.owner=-1;z.hp=0;z.progress=0;z.claimant=-1;}g.emit('eliminated',{player:p.id,reason:p.forfeitReason});}
  if(lost.length){g.reindex();g.checkElimination();if(g.over)g.reason='forfeit';}
 }
}
