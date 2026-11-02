// Pure simulation. Player identity and team identity are independent;
// a future authoritative server can consume the same command API.
import {RULES,MOBILE_RULES,convertKillScore} from "./rules.js";
import {createRoster,inferMode,colorsForMode,SOLO_COLORS} from "./modes.js";
export {MODES,createRoster} from "./modes.js";
export const PALETTES=SOLO_COLORS;
export const SIZE=1000, CELL=200, DURATION=Infinity, PLAYER_CAP=RULES.sharedUnitLimit;
export const BALANCE=MOBILE_RULES;
export function validCell(c,r){return c>=0&&c<5&&r>=0&&r<5;}
export function cellId(x,y){const c=Math.floor(x/CELL),r=Math.floor(y/CELL);return validCell(c,r)?r*5+c:null;}
export function clampPosition(x,y){return {x:Math.max(14,Math.min(986,x)),y:Math.max(14,Math.min(986,y))};}
function seeded(seed){const random=()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};random.getState=()=>seed;random.setState=value=>{seed=value|0;};return random;}
export class Game{
 constructor({seed=Date.now(),difficulty='normal',players=null,mode=null,duration=DURATION,rules=BALANCE}={}){
  players??=createRoster(mode??'duel');this.mode=mode??inferMode(players);this.palettes=colorsForMode(this.mode);
  if(players.length<2||players.length>4||new Set(players.map(p=>p.id)).size!==players.length||players.some((p,i)=>p.id!==i))throw new Error('Provide 2–4 players with sequential unique IDs.');
  this.rules=rules;this.random=seeded(seed);this.difficulty=difficulty;this.duration=duration;this.time=0;this.over=false;this.winner=null;this.uid=0;this.units=[];this.projectiles=[];this.events=[];this.frame=0;this.lastCapture=0;this.triggerTimer=this.rules.triggerSeconds;this.dispensers=[];
  this.players=players.map(p=>({...p,minerals:this.rules.startMinerals,attack:0,armor:0,upgrading:{},speedReady:false,rangeReady:false,freeResearchTimer:this.rules.freeResearchSeconds,killScore:0,razingScore:0,rescueTimer:0,kills:0,captured:0,peak:0,researchLost:false,eliminated:false,rally:null,aiTimer:p.id+3}));
  this.zones=[];this.zoneMap=new Map();for(let r=0;r<5;r++)for(let c=0;c<5;c++)if(validCell(c,r)){const z={id:r*5+c,c,r,x:c*200+100,y:r*200+100,owner:-1,hp:0,maxHp:this.rules.baseHp,spawn:0,fire:0,progress:0,claimant:-1,captureFlash:0};this.zones.push(z);this.zoneMap.set(z.id,z);}
  const starts=[[20],[4],[0],[24]];
  for(const p of this.players){for(const id of starts[p.id]){const z=this.zoneMap.get(id);z.owner=p.id;z.hp=z.maxHp;z.spawn=0;p.home={x:z.x,y:z.y};this.spawn(z,p.id);}p.rally={x:this.zoneMap.get(starts[p.id][0]).x,y:this.zoneMap.get(starts[p.id][0]).y};}
  this.refreshDispensers();this.reindex();
 }
 allied(a,b){return a>=0&&b>=0&&this.players[a].team===this.players[b].team;}
 zonesOf(id){return this.zones.filter(z=>z.owner===id);}
 unitsOf(id){return this.units.filter(u=>u.player===id&&u.hp>0);}
 // The same live-target selection defines fighting for orders and simulation.
 combatTarget(u){let target=null,dist=125,kind='unit';
  for(const e of this.nearbyEnemies(u.x,u.y,u.player)){if(e.hp<=0||Math.abs(e.x-u.x)>=dist||Math.abs(e.y-u.y)>=dist)continue;const d=Math.hypot(e.x-u.x,e.y-u.y);if(d<dist){dist=d;target=e;}}
  if(!target)for(const z of this.zones){if(z.hp<=0||z.owner<0||this.allied(z.owner,u.player))continue;const d=Math.hypot(z.x-u.x,z.y-u.y);if(d<dist){dist=d;target=z;kind='base';}}
  return {target,dist,kind,range:(this.players[u.player].rangeReady?this.rules.hydraRange:this.rules.hydraBaseRange)+(kind==='base'?20:0)};
 }
 baseTarget(z){let target=null,dist=this.rules.baseRange;for(const u of this.nearbyEnemies(z.x,z.y,z.owner)){if(u.hp<=0||u.ground===false)continue;const d=Math.hypot(u.x-z.x,u.y-z.y);if(d<dist){target=u;dist=d;}}return target;}
 // Teams are fixed within a match. Cache membership/order, never live HP or position.
 // reindex() invalidates this alongside the spatial buckets before every step/order.
 nearbyEnemies(x,y,player){const team=this.players[player].team;let cache=this.enemyNeighborhoodCache.get(team);if(!cache){cache=new Map();this.enemyNeighborhoodCache.set(team,cache);}const key=Math.floor(x/70)+','+Math.floor(y/70);let units=cache.get(key);if(!units){units=this.nearby(x,y,2).filter(u=>this.players[u.player].team!==team);cache.set(key,units);}return units;}
 movableUnitsOf(player){this.reindex();return this.unitsOf(player).filter(u=>{const {target,dist,range}=this.combatTarget(u);return !target||dist>=range;});}
 commandCount(player,fraction=1){if(this.over||!this.players[player]||this.players[player].eliminated||!Number.isFinite(fraction))return 0;const count=this.movableUnitsOf(player).length;return count?Math.max(1,Math.floor(count*Math.min(1,Math.max(.1,fraction)))):0;}
 emit(type,data={}){this.events.push({type,...data});if(this.events.length>500)this.events.shift();}
 spawn(z,player){if(this.unitsOf(player).length>=(this.rules.playerUnitLimit??Infinity)||this.units.length+this.dispensers.length+this.zones.filter(z=>z.owner>=0).length>=this.rules.sharedUnitLimit)return;const a=this.random()*Math.PI*2,d=24+this.random()*40,pos=clampPosition(z.x+Math.cos(a)*d,z.y+Math.sin(a)*d);const p=this.players[player];this.units.push({id:++this.uid,player,...pos,hp:this.rules.hydraHp,maxHp:this.rules.hydraHp,cooldown:this.random()*.8,tx:p.rally?.x??z.x,ty:p.rally?.y??z.y,phase:this.random()*Math.PI*2,face:player===0?1:-1,walking:false,hit:0,recoil:0,command:-1,selectedUntil:0});}
 command({player=0,x,y,fraction=1,source=null}){
  if(this.over||!this.players[player]||this.players[player].eliminated||!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(fraction)||cellId(x,y)===null)return 0;
  const all=this.movableUnitsOf(player);if(!all.length)return 0;
  const origin=source??{x,y};all.sort((a,b)=>Math.hypot(a.x-origin.x,a.y-origin.y)-Math.hypot(b.x-origin.x,b.y-origin.y));
  const n=Math.max(1,Math.floor(all.length*Math.min(1,Math.max(.1,fraction))));
  for(const u of all.slice(0,n)){const a=(u.id*2.39996)%(Math.PI*2),d=12+Math.sqrt(u.id%41)*8;const pos=clampPosition(x+Math.cos(a)*d,y+Math.sin(a)*d);u.tx=pos.x;u.ty=pos.y;u.command=this.time;u.selectedUntil=this.time+1.1;u.movingOrder=true;}
  if(fraction>=1)this.players[player].rally={x,y};this.emit('command',{player,x,y,count:n});return n;
 }
 upgrade(player,kind){const p=this.players[player];if(this.over||!p||p.eliminated||p.researchLost||!this.zonesOf(player).length||!['attack','armor'].includes(kind)||p.upgrading[kind]||p[kind]>=this.rules.upgradeMax||p.minerals<this.rules.upgradeCost)return false;p.minerals-=this.rules.upgradeCost;p.upgrading[kind]=this.rules.upgradeSeconds;this.refreshDispensers();this.emit('research',{player,kind});return true;}
 dispenserOf(player){return this.dispensers.find(d=>d.player===player);}
 refreshDispensers(){for(const p of this.players){const d=this.dispenserOf(p.id);if(p.eliminated||p.minerals<this.rules.claimCost){this.dispensers=this.dispensers.filter(d=>d.player!==p.id);continue;}if(!d&&this.unitsOf(p.id).length&&this.units.length+this.dispensers.length+this.zones.filter(z=>z.owner>=0).length<this.rules.sharedUnitLimit){this.dispensers.push({id:++this.uid,player:p.id,x:p.home.x,y:p.home.y,hp:this.rules.dispenserHp,maxHp:this.rules.dispenserHp,zone:null});}}}
 claimCommand(player,zone){const p=this.players[player],z=this.zoneMap.get(zone),d=this.dispenserOf(player);if(this.over||!p||p.eliminated||!d||!z)return false;if(this.allied(z.owner,player))return false;d.zone=zone;this.emit('claimOrder',{player,x:z.x,y:z.y});return true;}
 sectorCounts(zone){return this.players.map(p=>this.units.filter(u=>u.hp>0&&u.player===p.id&&cellId(u.x,u.y)===zone).length+this.dispensers.filter(d=>d.hp>0&&d.player===p.id&&cellId(d.x,d.y)===zone).length);}
 canClaimStrength(player,zone){const counts=this.sectorCounts(zone),totals=new Map();for(const p of this.players)totals.set(p.team,(totals.get(p.team)||0)+counts[p.id]);return (totals.get(this.players[player].team)||0)>=Math.max(...totals.values());}
 claimStatus(player,zone){const p=this.players[player],z=this.zoneMap.get(zone),d=this.dispenserOf(player);if(!z)return '전장 구역을 선택하세요';if(z.owner>=0)return this.allied(z.owner,player)?'이미 아군 거점':'적 성큰 파괴 대기';if(p.minerals<this.rules.claimCost)return '미네랄 250 필요';if(!d)return '병력이 있어야 대군주가 생깁니다';if(!this.canClaimStrength(player,zone))return '구역 내 병력 우세 필요';if(Math.abs(d.x-z.x)>33||Math.abs(d.y-z.y)>33)return '대군주 이동 중';return '다음 점령 판정 대기';}
 triggerPass(){
  if(this.over||this.checkElimination())return;
  // Capture: most Any Unit in the entire sector (ties pass), no building, dispenser in centre, 250 minerals.
  for(const p of this.players){if(p.eliminated)continue;const d=this.dispenserOf(p.id),z=d&&this.zoneMap.get(d.zone);if(z&&z.owner<0&&p.minerals>=this.rules.claimCost&&Math.abs(d.x-z.x)<=33&&Math.abs(d.y-z.y)<=33){if(this.canClaimStrength(p.id,z.id)){
   // Original Kill Unit At removes all units in the central 128x128-pixel location without bounty.
   this.units=this.units.filter(u=>Math.abs(u.x-z.x)>33||Math.abs(u.y-z.y)>33);
   this.dispensers=this.dispensers.filter(u=>Math.abs(u.x-z.x)>33||Math.abs(u.y-z.y)>33);
   p.minerals-=this.rules.claimCost;z.owner=p.id;z.hp=z.maxHp;z.captureFlash=1.2;p.captured++;this.emit('capture',{player:p.id,x:z.x,y:z.y,zone:z.id});
  }}
  }
  for(const z of this.zones){if(z.owner<0)continue;const local=this.units.filter(u=>u.hp>0&&u.player===z.owner&&cellId(u.x,u.y)===z.id).length+this.dispensers.filter(d=>d.player===z.owner&&cellId(d.x,d.y)===z.id).length;if(local<=this.rules.sectorUnitLimit)this.spawn(z,z.owner);}
  for(const p of this.players){if(p.eliminated)continue;const reward=this.rules.killReward?{score:p.killScore%100,minerals:Math.floor(p.killScore/100)*this.rules.killReward}:convertKillScore(p.killScore);p.killScore=reward.score;p.minerals+=reward.minerals;if(p.razingScore>=150){p.razingScore-=150;p.minerals+=150;}
   if(!this.zonesOf(p.id).length&&!this.dispenserOf(p.id)&&this.time>=1&&this.time>=p.rescueTimer){p.minerals+=this.rules.rescueMinerals;p.rescueTimer=this.time+this.rules.rescueSeconds;this.emit('rescue',{player:p.id});}
  }
  this.refreshDispensers();
 }
 // Collision reach is 19px: a separate 24px grid keeps every relevant pair,
 // while targeting retains its original 70px grid and stable candidate order.
 reindex(){this.neighborhoodCache=new Map();this.enemyNeighborhoodCache=new Map();this.separationCache=new Map();this.buckets=new Map();this.separationBuckets=new Map();this.unitMap=new Map();this.separationRadius=1;let order=0;const stride=this.units.length+1;for(const u of this.units){if(u.hp<=0)continue;u._bucketX=Math.floor(u.x/70);u._bucketY=Math.floor(u.y/70);u._spatialOrder=(u._bucketY*16+u._bucketX)*stride+order++;this.unitMap.set(u.id,u);for(const [size,buckets]of [[70,this.buckets],[24,this.separationBuckets]]){const key=Math.floor(u.x/size)+','+Math.floor(u.y/size);let list=buckets.get(key);if(!list){list=[];buckets.set(key,list);}list.push(u);}}}
 nearby(x,y,r=1){const separation=r===1,size=separation?24:70,buckets=separation?this.separationBuckets:this.buckets,cache=separation?this.separationCache:this.neighborhoodCache,bx=Math.floor(x/size),by=Math.floor(y/size),coarseX=Math.floor(x/70),coarseY=Math.floor(y/70),radius=separation?this.separationRadius:r,key=bx+','+by+','+radius+(separation?','+coarseX+','+coarseY:''),cached=cache.get(key);if(cached)return cached;const out=[];for(let j=-radius;j<=radius;j++)for(let i=-radius;i<=radius;i++){const b=buckets.get((bx+i)+','+(by+j));if(b)for(const u of b)if(!separation||Math.abs(u._bucketX-coarseX)<=1&&Math.abs(u._bucketY-coarseY)<=1)out.push(u);}if(separation)out.sort((a,b)=>a._spatialOrder-b._spatialOrder);cache.set(key,out);return out;}
 shoot(from,target,kind,damage){if(kind==='drone')return;const dx=target.x-from.x,dy=target.y-from.y;this.projectiles.push({x:from.x,y:from.y-3,tx:target.x,ty:target.y,id:target.id,kind,player:from.player??from.owner,damage,life:.8,speed:440});from.face=dx>=0?1:-1;from.recoil=.15;this.emit('shot',{x:from.x,y:from.y,player:from.player??from.owner});}
 damage(target,amount,attacker,kind){if(kind==='drone')return;if(this.over||target.hp<=0)return;const owner=kind==='base'?target.owner:target.player;if(this.allied(owner,attacker)||owner<0)return;const armor=kind==='unit'?this.players[owner].armor:kind==='drone'?this.rules.dispenserArmor:this.rules.baseArmor;const scale=kind==='unit'?.75:1;target.hp-=Math.max(.5,(amount-armor)*scale);target.hit=.12;this.emit('hit',{x:target.x,y:target.y,player:owner,base:kind==='base'});if(target.hp<=0){if(kind==='unit'){this.players[attacker].kills++;this.players[attacker].killScore+=100;this.emit('death',{x:target.x,y:target.y,player:owner});}else if(kind==='drone'){this.emit('death',{x:target.x,y:target.y,player:owner});}else{target.owner=-1;target.hp=0;target.progress=0;target.claimant=-1;this.players[attacker].razingScore+=150;this.emit('destroy',{x:target.x,y:target.y,player:owner});this.checkElimination();}}}
 ai(p,dt){p.aiTimer-=dt;if(p.aiTimer>0||p.eliminated)return;const delay={easy:7,normal:3.5,hard:1.8}[this.difficulty]??3.5;p.aiTimer=delay+this.random();
  const own=this.zonesOf(p.id),army=this.unitsOf(p.id);if(!army.length)return;
  // Same minerals, costs, spawn cadence, damage and capture rules as the human.
  const neutral=this.zones.filter(z=>z.owner<0);const d=this.dispenserOf(p.id);
  if(d&&neutral.length){const pending=this.zoneMap.get(d.zone);if(!pending||pending.owner>=0){neutral.sort((a,b)=>Math.hypot(a.x-d.x,a.y-d.y)-Math.hypot(b.x-d.x,b.y-d.y));this.claimCommand(p.id,neutral[0].id);}const z=this.zoneMap.get(d.zone);if(z){this.command({player:p.id,x:z.x,y:z.y,fraction:.55});}}
  const reserve=neutral.length?this.rules.claimCost:0;
  p.aiUpgradeBudget=Math.max(0,Math.min(own.length<4?2:6,Math.floor((p.minerals-reserve)/this.rules.upgradeCost)));
  const centre={x:army.reduce((s,u)=>s+u.x,0)/army.length,y:army.reduce((s,u)=>s+u.y,0)/army.length};
  const fighting=army.some(u=>{const t=this.combatTarget(u);return t.target&&t.dist<t.range;});
  if(fighting||!p.aiProgress||p.aiProgress.kills!==p.kills||Math.hypot(centre.x-p.aiProgress.x,centre.y-p.aiProgress.y)>18)p.aiProgress={...centre,kills:p.kills,at:this.time};
  const stalled=this.time-p.aiProgress.at>=8;
  if(stalled){p.aiAssaultUntil=this.time+10;p.aiProgress={...centre,kills:p.kills,at:this.time};}
  let best=null,score=-Infinity,defender=null;for(const z of this.zones){if(z.owner<0)continue;const enemies=this.units.filter(u=>!this.allied(u.player,p.id)&&Math.hypot(u.x-z.x,u.y-z.y)<170),foes=enemies.length;let rank,target=null;
   // Defend a firing threat, not a distant army outside the base's attack reach.
   // Aim at the attacker instead of retreating into our own base centre.
   if(this.allied(z.owner,p.id)){if(this.time<(p.aiAssaultUntil||0))continue;target=enemies.find(u=>Math.hypot(u.x-z.x,u.y-z.y)<this.rules.hydraRange+20);if(!target)continue;rank=1000+foes;}else{const distance=Math.min(...army.map(u=>Math.hypot(u.x-z.x,u.y-z.y)));rank=300-distance*.35-foes*.4+(1-z.hp/z.maxHp)*90;}
   if(rank>score){score=rank;best=z;defender=target;}}
  if(!best){const foes=this.units.filter(u=>u.hp>0&&!this.allied(u.player,p.id));if(foes.length){let focus=foes[0],distance=Infinity;for(const enemy of foes){const value=Math.hypot(enemy.x-army[0].x,enemy.y-army[0].y);if(value<distance){distance=value;focus=enemy;}}this.command({player:p.id,x:focus.x,y:focus.y,fraction:1});}}
  if(best&&(!d?.zone||!neutral.length||score>900||own.length>=5)){const target=defender||best;this.command({player:p.id,x:target.x,y:target.y,fraction:this.difficulty==='easy'?.65:.85});}
 }
 step(dt){if(this.over||!Number.isFinite(dt)||dt<=0||this.checkElimination())return;dt=Math.min(dt,.1);this.time+=dt;this.frame++;this.reindex();
  for(const p of this.players){if(p.eliminated)continue;
   for(const kind of Object.keys(p.upgrading)){p.upgrading[kind]-=dt;if(p.upgrading[kind]<=0){delete p.upgrading[kind];p[kind]++;this.emit('upgrade',{player:p.id,kind,level:p[kind]});}}
   if(!p.researchLost&&!p.rangeReady){p.freeResearchTimer-=dt;if(p.freeResearchTimer<=0){if(!p.speedReady){p.speedReady=true;p.freeResearchTimer+=this.rules.freeResearchSeconds;}else p.rangeReady=true;}}
   p.peak=Math.max(p.peak,this.unitsOf(p.id).length);if(!p.human){this.ai(p,dt);
    const reserve=this.zones.some(z=>z.owner<0)?this.rules.claimCost:0;
    if(p.aiUpgradeBudget>0&&p.minerals-reserve>=this.rules.upgradeCost){const kind=p.attack<p.armor+8?'attack':'armor';if(this.upgrade(p.id,kind))p.aiUpgradeBudget--;}
   }}
  for(const d of this.dispensers){const z=this.zoneMap.get(d.zone);if(z){const dx=z.x-d.x,dy=z.y-d.y,dist=Math.hypot(dx,dy),step=Math.min(dist,(this.players[d.player].speedReady?this.rules.dispenserSpeed:this.rules.dispenserBaseSpeed)*dt);if(dist>0){d.x+=dx/dist*step;d.y+=dy/dist*step;}}}
  for(const z of this.zones){z.captureFlash=Math.max(0,z.captureFlash-dt);if(z.owner<0)continue;z.fire-=dt;z.strike=Math.max(0,(z.strike||0)-dt);if(z.fire<=0){const target=this.baseTarget(z);if(target){z.fire=this.rules.baseCooldown;z.strike=.3;this.emit('sunkenStrike',{x:z.x,y:z.y,tx:target.x,ty:target.y,player:z.owner});this.damage(target,this.rules.baseDamage,z.owner,'unit');}}z.hp=Math.min(z.maxHp,z.hp+dt*this.rules.regenPerSecond);}
  for(const u of this.units){if(u.hp<=0)continue;u.hp=Math.min(u.maxHp,u.hp+dt*this.rules.regenPerSecond);u.cooldown-=dt;u.hit=Math.max(0,u.hit-dt);u.recoil=Math.max(0,u.recoil-dt);u.walking=false;const {target,dist,kind,range}=this.combatTarget(u);
   let tx=u.tx,ty=u.ty;
   // A fresh non-fighting order takes priority over chasing outside firing range.
   if(u.movingOrder&&Math.hypot(tx-u.x,ty-u.y)<=8)u.movingOrder=false;
   if(target){if(dist<range){tx=u.x;ty=u.y;if(u.cooldown<=0){u.cooldown=this.rules.hydraCooldown;this.shoot(u,target,kind,this.rules.hydraDamage+this.players[u.player].attack);}}else if(!u.movingOrder){tx=target.x;ty=target.y;}}
   const dx=tx-u.x,dy=ty-u.y,d=Math.hypot(dx,dy);let vx=0,vy=0;if(d>8){const speed=this.players[u.player].speedReady?this.rules.hydraSpeed:this.rules.hydraBaseSpeed;vx=dx/d*speed;vy=dy/d*speed;u.walking=true;u.face=dx>=0?1:-1;}
   // Local separation keeps dense groups readable without quadratic pair checks.
   for(const e of this.nearby(u.x,u.y)){if(e.id===u.id||e.hp<=0)continue;const ex=u.x-e.x,ey=u.y-e.y,d2=ex*ex+ey*ey;if(d2>0&&d2<361){const d1=Math.sqrt(d2),force=(19-d1)*7;vx+=ex/d1*force;vy+=ey/d1*force;}}
   const pos=clampPosition(u.x+vx*dt,u.y+vy*dt),sx=pos.x-u.x,sy=pos.y-u.y,shift2=sx*sx+sy*sy,margin=this.separationRadius*24-19;if(shift2>margin*margin)this.separationRadius=Math.ceil((19+Math.sqrt(shift2))/24);u.x=pos.x;u.y=pos.y;
  }
  for(const b of this.projectiles){if(this.over)break;b.life-=dt;const target=b.kind==='unit'?this.unitMap.get(b.id):b.kind==='base'?this.zoneMap.get(b.id):null;if(target&&target.hp>0){b.tx=target.x;b.ty=target.y;}const dx=b.tx-b.x,dy=b.ty-b.y,d=Math.hypot(dx,dy);if(d<b.speed*dt+5){if(target)this.damage(target,b.damage,b.player,b.kind);b.life=-1;}else{b.x+=dx/d*b.speed*dt;b.y+=dy/d*b.speed*dt;}}
  this.projectiles=this.projectiles.filter(b=>b.life>0);this.units=this.units.filter(u=>u.hp>0);
  this.dispensers=this.dispensers.filter(d=>d.hp>0);
  if(this.over)return;
  this.triggerTimer-=dt;if(this.triggerTimer<=0){this.triggerTimer+=this.rules.triggerSeconds;this.triggerPass();}
  this.checkElimination();
 }
 checkElimination(){
  // TRIG 34: defeat requires BOTH zero Sunkens and zero Hydralisks.
  for(const p of this.players){if(p.eliminated||this.zones.some(z=>z.owner===p.id&&z.hp>0))continue;
   if(!p.researchLost){p.researchLost=true;p.upgrading={};this.emit('researchLost',{player:p.id});}
   if(!this.unitsOf(p.id).length){p.eliminated=true;this.dispensers=this.dispensers.filter(d=>d.player!==p.id);this.emit('eliminated',{player:p.id});}}
  const teams=new Set(this.players.filter(p=>!p.eliminated).map(p=>p.team));if(teams.size<=1)this.finish(teams.size?[...teams][0]:null,'annihilation');
  return this.over;
 }
 finish(team,reason){if(this.over)return;this.over=true;this.winner=team;this.reason=reason;this.emit('end',{team,reason});}
}
