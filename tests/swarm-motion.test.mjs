import {test} from 'node:test';import assert from 'node:assert/strict';
import {NetworkSession} from '../public/swarm/network.js';import {SnapshotEncoder} from '../public/swarm/net-protocol.js';import {Game} from '../public/swarm/engine.js';
import {SnapshotMotion} from '../public/swarm/snapshot-motion.js';
function fixture(){let now=100;const c=new NetworkSession({room:'motion',storage:null,now:()=>now});c.sendRaw=()=>true;c.message({type:'welcome',seat:0,mode:'duel',sequence:0});const g=new Game({mode:'duel',seed:1}),encoder=new SnapshotEncoder(),u=g.units[0];u.walking=true;const d=g.dispensers[0];d.zone=15;const send=(time,x,dx)=>{g.time=time;g.frame=Math.round(time*30);u.x=x;d.x=dx;c.snapshot(encoder.encode(g,{full:true}));};return {c,g,u,d,send,setNow:n=>now=n};}

test('250ms arrivals do not freeze units and overlords after the old100ms window',()=>{
 const {c,send,setNow}=fixture();send(0,100,100);setNow(350);send(.25,120,104);setNow(500);c.tick();const mid=c.game.units[0].x,drone=c.game.dispensers[0].x;
 setNow(550);c.tick();assert.ok(c.game.units[0].x>mid);assert.ok(c.game.dispensers[0].x>drone);assert.ok(c.game.time>.15&&c.game.time<.25);
 assert.equal(c.replica.units.get(c.game.units[0].id).x,120,'rendering never changes authoritative positions');
});
test('same-frame command snapshots keep existing motion in progress',()=>{
 const {c,send,setNow}=fixture();send(0,100,100);setNow(350);send(.25,120,104);setNow(450);c.tick();const previous=c.game.units[0].x;
 send(.25,120,104);setNow(500);c.tick();assert.ok(c.game.units[0].x>previous);assert.equal(c.motion.updatedAt,350);
});
test('late and duplicate snapshots cannot rewind state or restart motion',()=>{
 const {c,g,send,setNow}=fixture();const old=new SnapshotEncoder().encode(g,{full:true});send(0,100,100);setNow(350);send(.25,120,104);setNow(500);c.tick();const x=c.game.units[0].x,time=c.game.time;c.snapshot(old);assert.equal(c.game.units[0].x,x);assert.equal(c.game.time,time);
});
test('extended outages stop extrapolation and rebase to the next state',()=>{
 const {c,send,setNow}=fixture();send(0,100,100);setNow(350);send(.25,120,104);setNow(2000);c.tick();const stopped=c.game.units[0].x;setNow(5000);c.tick();assert.equal(c.game.units[0].x,stopped);assert.ok(stopped<=128.001);
 send(4,300,200);assert.equal(c.game.units[0].x,300);assert.equal(c.game.dispensers[0].x,200);
});
test('hit flashes, base strike effects, and projectile visuals advance between packets without local damage',()=>{
 const {c,g,send,setNow}=fixture();g.units[0].hit=.12;g.units[0].recoil=.15;g.zones[0].strike=.3;g.projectiles=[{x:100,y:100,player:0,tx:500,ty:100}];send(0,100,100);const hp=c.game.units[0].hp;setNow(150);c.tick();assert.ok(c.game.units[0].hit<.12);assert.ok(c.game.projectiles[0].x>100);assert.equal(c.game.units[0].hp,hp);assert.equal(c.replica.units.get(c.game.units[0].id).hp,hp);
});
test('adaptive interpolation remains bounded across irregular packet timing',()=>{
 const clock=new SnapshotMotion();let at=0,time=0;clock.receive(0,0,0);for(const gap of [100,180,300,450,800,1200]){at+=gap;time+=gap/1000;clock.receive(time,at,time-.05);assert.ok(clock.duration>=100&&clock.duration<=600);assert.ok(clock.phase(at+5000).extraSeconds<=.1);}
});
