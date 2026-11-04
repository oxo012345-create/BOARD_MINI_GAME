// A render clock, never a combat simulation. Pace movement to observed state
// arrivals instead of reaching each endpoint in100ms and waiting motionless.
export class SnapshotMotion{
 constructor(){this.reset();}
 reset(){this.serverTime=null;this.updatedAt=null;this.fromTime=0;this.duration=100;this.intervals=[];}
 receive(serverTime,now,visualTime){
  if(this.serverTime!==null&&serverTime<=this.serverTime+1e-7)return {advanced:false,reset:false};
  const gap=this.updatedAt===null?null:now-this.updatedAt,reset=this.serverTime===null||gap>2000;
  if(reset){this.intervals=[];this.duration=100;}
  else if(gap>=20){this.intervals.push(gap);if(this.intervals.length>12)this.intervals.shift();const sorted=[...this.intervals].sort((a,b)=>a-b);this.duration=Math.max(1000/30,Math.min(600,sorted[Math.ceil(sorted.length*.75)-1]*1.1));}
  this.fromTime=reset?serverTime:Math.min(serverTime,visualTime);this.serverTime=serverTime;this.updatedAt=now;return {advanced:true,reset};
 }
 phase(now){const elapsed=this.updatedAt===null?0:Math.max(0,now-this.updatedAt),blend=Math.min(1,elapsed/this.duration);return {blend,extraSeconds:Math.min(100,Math.max(0,elapsed-this.duration))/1000,time:this.fromTime+((this.serverTime??0)-this.fromTime)*blend};}
}

export function motionTarget(old,point,previous,seconds,moving=true){
 let vx=0,vy=0;if(moving&&previous&&seconds>0){vx=(point.x-previous.x)/seconds;vy=(point.y-previous.y)/seconds;const speed=Math.hypot(vx,vy);if(speed>150){vx*=150/speed;vy*=150/speed;}}
 return {fromX:old.x,fromY:old.y,x:point.x,y:point.y,vx,vy};
}
export function moveVisual(point,target,phase){if(!target)return;point.x=Math.max(14,Math.min(986,target.fromX+(target.x-target.fromX)*phase.blend+target.vx*phase.extraSeconds));point.y=Math.max(14,Math.min(986,target.fromY+(target.y-target.fromY)*phase.blend+target.vy*phase.extraSeconds));}
