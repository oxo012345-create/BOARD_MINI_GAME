import {test} from 'node:test';import assert from 'node:assert/strict';
import {Game,BALANCE,createRoster} from '../public/swarm/engine.js';
import {RULES} from '../public/swarm/rules.js';
import {MatchSession} from '../public/swarm/integration.js';
import {OnlineRoom} from '../app/api/_lib/vendor/swarm/room.js';

for(const mode of ['duel','team','ffa'])test(`${mode}: 200 per seat, no borrowing, deaths release only the owner's space`,()=>{
 const g=new Game({mode,seed:200,players:createRoster(mode,{humans:[0,1,2,3]})});
 for(const p of g.players)for(let n=0;n<240;n++)g.spawn(g.zonesOf(p.id)[0],p.id);
 assert.deepEqual(g.players.map(p=>g.unitsOf(p.id).length),g.players.map(()=>200));
 assert.equal(g.units.length,g.players.length*200);
 const victim=g.unitsOf(0)[0];g.damage(victim,10000,1,'unit');assert.equal(g.unitsOf(0).length,199);
 g.spawn(g.zonesOf(1)[0],1);assert.equal(g.unitsOf(1).length,200);
 g.spawn(g.zonesOf(0)[0],0);assert.equal(g.unitsOf(0).length,200);
});

test('bases and invulnerable overlords do not consume a seat allowance; over-cap legacy survivors are not deleted',()=>{
 const g=new Game({mode:'ffa',seed:200});for(const z of g.zones)z.owner=0;
 for(let n=0;n<240;n++)g.spawn(g.zones[0],0);assert.equal(g.unitsOf(0).length,200);
 g.dispensers=[];g.refreshDispensers();assert.ok(g.dispenserOf(0));
 const d=g.dispenserOf(0),hp=d.hp;g.damage(d,100000,1,'drone');assert.equal(d.hp,hp);
 const legacy={...g.unitsOf(0)[0],id:++g.uid};g.units.push(legacy);g.spawn(g.zones[0],0);assert.equal(g.unitsOf(0).length,201);
});

test('many owned bases cannot overshoot the personal cap during one production pass',()=>{
 const g=new Game({mode:'ffa',seed:200});for(const z of g.zones)z.owner=0;
 for(let n=0;n<198;n++)g.spawn(g.zones[0],0);
 assert.equal(g.unitsOf(0).length,199);g.triggerPass();assert.equal(g.unitsOf(0).length,200);
 assert.equal(RULES.playerUnitLimit,undefined);assert.equal(RULES.sharedUnitLimit,1700);assert.equal(BALANCE.playerUnitLimit,200);
});

function aiFixture(enemyX=650){
 const g=new Game({mode:'duel',seed:503});for(const z of g.zones){z.owner=1;z.hp=z.maxHp;}const own=g.zoneMap.get(12);own.owner=0;
 Object.assign(g.unitsOf(0)[0],{x:480,y:500,tx:480,ty:500});Object.assign(g.unitsOf(1)[0],{x:enemyX,y:500,tx:enemyX,ty:500});
 g.players[0].aiTimer=0;g.players[0].minerals=0;g.dispensers=[];g.reindex();const commands=[];
 g.command=c=>{commands.push(c);return 1;};return {g,commands};
}
test('AI attacks an enemy base instead of retreating from enemies outside firing reach',()=>{
 const {g,commands}=aiFixture();g.ai(g.players[0],0);const command=commands.at(-1);
 assert.ok(command);assert.ok(g.zoneMap.get(Math.floor(command.y/200)*5+Math.floor(command.x/200)).owner===1);
});
test('AI intercepts a nearby attacker rather than ordering troops into its own base centre',()=>{
 const {g,commands}=aiFixture(580);g.ai(g.players[0],0);assert.equal(commands.at(-1).x,580);assert.equal(commands.at(-1).y,500);
});
test('AI gives a stuck, non-fighting army an assault window after 8 seconds',()=>{
 const {g}=aiFixture();g.time=9;g.players[0].aiProgress={x:480,y:500,kills:0,at:0};g.ai(g.players[0],0);assert.equal(g.players[0].aiAssaultUntil,19);
});
test('a stationary army that is firing is not treated as a stalled army',()=>{
 const {g}=aiFixture(540);g.time=9;g.players[0].aiProgress={x:480,y:500,kills:0,at:0};g.ai(g.players[0],0);assert.equal(g.players[0].aiProgress.at,9);assert.equal(g.players[0].aiAssaultUntil,undefined);
});

test('server checkpoint restores cap, AI progress, and deterministic continuation',()=>{
 let wall=1000;const room=new OnlineRoom({code:'audit-200',mode:'team',seed:503,now:()=>wall});room.seats=[0,1,2,3].map(id=>({id,name:'Audit '+id,token:crypto.randomUUID(),seen:Date.now()}));
 room.session=new MatchSession({mode:'team',seed:503,matchId:room.code,humans:[0,1,2,3],participants:room.seats.map(s=>({id:'seat-'+s.id,name:s.name}))});
 const g=room.session.game;for(const p of g.players)for(let n=0;n<240;n++)g.spawn(g.zonesOf(p.id)[0],p.id);
 g.players[0].aiProgress={x:100,y:900,kills:0,at:2};g.players[0].aiAssaultUntil=12;
 const restored=OnlineRoom.restore(JSON.parse(JSON.stringify(room.checkpoint())),{now:()=>wall});assert.equal(restored.session.game.rules.playerUnitLimit,200);
 for(let n=0;n<30;n++){wall+=1000/30;room.session.tick(1/30);restored.session.tick(1/30);}
 assert.deepEqual(restored.checkpoint(),room.checkpoint());assert.ok(g.players.every(p=>g.unitsOf(p.id).length<=200));
});
