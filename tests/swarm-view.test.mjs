import {test} from 'node:test';
import assert from 'node:assert/strict';
import {battleView} from '../public/swarm/battle-view.js';
import {MatchSession} from '../public/swarm/integration.js';

for(const mode of ['duel','team','ffa'])test(`${mode}: each participant sees their own base below and taps the same authoritative world`,()=>{
 const session=new MatchSession({mode,seed:42,humans:[0,1,2,3]}),game=session.game;
 for(const player of game.players){
  const view=battleView(mode,player.id),home=game.zonesOf(player.id)[0];
  assert.equal(view.y(home.x,home.y),900);
  if(mode==='team')for(const other of game.players){
   const base=game.zonesOf(other.id)[0];
   assert.equal(view.y(base.x,base.y),game.allied(player.id,other.id)?900:100);
  }
  const original=game.zones.map(z=>[z.x,z.y,z.owner]);
  for(const z of game.zones){
   const p=view.toWorld(view.x(z.x,z.y),view.y(z.x,z.y));
   assert.deepEqual(p,{x:z.x,y:z.y});
   assert.ok(view.x(z.x,z.y)>=100&&view.x(z.x,z.y)<=900);
  }
  const destination=view.toWorld(325,615);
  assert.ok(game.command({player:player.id,...destination,fraction:1})>0);
  assert.deepEqual(game.zones.map(z=>[z.x,z.y,z.owner]),original,'view cannot alter authority or ownership');
  assert.equal(view.x(destination.x,destination.y),325);
  assert.equal(view.y(destination.x,destination.y),615);
 }
});
