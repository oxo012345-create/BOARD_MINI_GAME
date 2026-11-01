import Matter from './vendor/matter.mjs';
export type Disc = { id:number; side:number; x:number; y:number; vx:number; vy:number; alive:boolean };
export type Barrier = { x:number; y:number; r:number };
export const DISC_RADIUS=18*600/560, MAX_PULL=130*600/560, FRAME_MS=50;
export const BARRIERS:Barrier[]=[{x:30,y:30,r:23},{x:570,y:30,r:23},{x:300,y:300,r:23},{x:30,y:570,r:23},{x:570,y:570,r:23}];
export function initialDiscs():Disc[]{return [0,1].flatMap(side=>Array.from({length:5},(_,i)=>({id:side*5+i,side,x:(95+i*92)*600/560,y:(side?120:440)*600/560,vx:0,vy:0,alive:true})));}
/** Original Hansu Matter.js 0.20 simulation scaled from 560 to 600 units.
 * Server authority is preserved. Clients interpolate real-time snapshots. */
export function simulateShot(input:Disc[],id:number,dx:number,dy:number,obstacles:boolean){
 const length=Math.hypot(dx,dy);
 if(![dx,dy].every(Number.isFinite)||length<3||length>181)throw new Error('힘을 다시 조절해 주세요.');
 const discs=structuredClone(input);
 const engine=Matter.Engine.create({gravity:{x:0,y:0,scale:0},enableSleeping:false});
 const bodies=new Map(discs.filter(d=>d.alive).map(d=>[d.id,Matter.Bodies.circle(d.x,d.y,DISC_RADIUS,{restitution:.86,friction:0,frictionAir:.025,density:.003,slop:.01})]));
 const selected=bodies.get(id);if(!selected)throw new Error('돌을 다시 선택해 주세요.');
 Matter.Composite.add(engine.world,[...bodies.values(),...(obstacles?BARRIERS.map(b=>Matter.Bodies.circle(b.x,b.y,b.r,{isStatic:true,restitution:.86,friction:0})):[])]);
 const power=Math.min(length,MAX_PULL)/5;
 Matter.Body.setVelocity(selected,{x:dx/length*power,y:dy/length*power});
 const frames:Disc[][]=[structuredClone(discs)];let settled=0;
 for(let step=1;step<=1440;step++){
  Matter.Engine.update(engine,1000/120);
  for(const d of discs){const b=bodies.get(d.id);if(!d.alive||!b)continue;d.x=b.position.x;d.y=b.position.y;d.vx=b.velocity.x;d.vy=b.velocity.y;if(d.x<0||d.x>600||d.y<0||d.y>600){d.alive=false;d.vx=d.vy=0;Matter.Composite.remove(engine.world,b);}}
  settled=discs.every(d=>!d.alive||Math.hypot(d.vx,d.vy)<.12*600/560)?settled+1:0;
  if(step%6===0){frames.push(discs.map(d=>({...d,x:+d.x.toFixed(3),y:+d.y.toFixed(3),vx:+d.vx.toFixed(3),vy:+d.vy.toFixed(3)})));if(settled>19)break;}
 }
 for(const d of discs){d.vx=0;d.vy=0;}frames[frames.length-1]=structuredClone(discs);
 Matter.Composite.clear(engine.world,false);Matter.Engine.clear(engine);return {discs,frames};
}
