import {BattlePolicy} from './battle-policy.js';
// DOM-free integration boundary. The host owns actor identity and the fixed clock.
import {Game} from './engine.js';
import {createRoster,MODES} from './modes.js';
export const PROTOCOL_VERSION=1;
export class MatchSession{
 constructor({mode='duel',seed=Date.now(),difficulty='normal',participants=[],humans=[0],matchId=String(seed)}={}){
  if(!Object.hasOwn(MODES,mode))throw new Error('Unknown mode');
  if(participants.length&&participants.length!==MODES[mode].count)throw new Error('Roster count must match mode');
  const roster=createRoster(mode,{humans,participants});
  if(new Set(roster.map(p=>p.externalId)).size!==roster.length)throw new Error('Duplicate participant');
  this.id=matchId;this.game=new Game({mode,seed,difficulty,players:roster});this.sequences=new Map();this.policy=new BattlePolicy(this.game);
 }
 dispatch(actorId,input){
  this.policy.update({force:true});const actor=this.game.players.find(p=>p.externalId===actorId);
  if(!actor?.human||actor.eliminated||this.game.over||input?.matchId!==this.id||!Number.isSafeInteger(input.sequence)||input.sequence<1||input.sequence<=(this.sequences.get(actorId)||0))return false;
  if(input.type==='move'&&(!Number.isFinite(input.x)||!Number.isFinite(input.y)||![.5,1].includes(input.fraction)))return false;
  if(input.type==='claim'&&(!Number.isInteger(input.zone)||input.zone<0||input.zone>24))return false;
  if(input.type==='upgrade'&&!['attack','armor'].includes(input.kind))return false;
  if(!['move','claim','upgrade','active'].includes(input.type))return false;
  this.sequences.set(actorId,input.sequence);
  const result=input.type==='active'?true:input.type==='move'?this.game.command({player:actor.id,x:input.x,y:input.y,fraction:input.fraction}):input.type==='claim'?this.game.claimCommand(actor.id,input.zone):this.game.upgrade(actor.id,input.kind);
  if(result)this.policy.command(actor.id,input);return result;
 }
 tick(dt){const before=this.game.events.length;this.game.step(dt);this.policy.events(this.game.events.slice(before));this.policy.update();}
 snapshot(){const g=this.game;return {version:PROTOCOL_VERSION,matchId:this.id,mode:g.mode,time:g.time,over:g.over,winner:g.winner,
  players:g.players.map(p=>({id:p.id,externalId:p.externalId,name:p.name,team:p.team,minerals:p.minerals,attack:p.attack,armor:p.armor,eliminated:p.eliminated})),
  zones:g.zones.map(z=>({id:z.id,x:z.x,y:z.y,owner:z.owner,hp:z.hp,maxHp:z.maxHp})),
  units:g.units.map(u=>({id:u.id,player:u.player,x:u.x,y:u.y,hp:u.hp,face:u.face,walking:u.walking})),
  dispensers:g.dispensers.map(d=>({id:d.id,player:d.player,x:d.x,y:d.y,zone:d.zone})),projectiles:g.projectiles.map(b=>({...b}))};}
}
