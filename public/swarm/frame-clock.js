// Keep the fractional scheduling phase, but pass each elapsed second to effects once.
export class DrawClock{
 constructor(){this.reset();}
 reset(){this.phase=0;this.elapsed=0;}
 advance(dt,interval){this.phase+=dt;this.elapsed+=dt;if(this.phase+1e-9<interval)return null;const elapsed=this.elapsed;this.phase=Math.max(0,(this.phase+1e-9)%interval);this.elapsed=0;return elapsed;}
}
