// Cache both facings at the canvas backing resolution. Artwork stays unchanged;
// each unit needs one near-native-size blit instead of a transform stack and a
// 128px source resample on every frame.
export class UnitSpriteCache{
 constructor(){this.source=null;this.pixels=0;this.frames=null;}
 get(source,canvasWidth){
  const pixels=Math.max(8,Math.min(128,Math.ceil(canvasWidth*36/1000)));
  if(this.source===source&&this.pixels===pixels)return this.frames;
  this.source=source;this.pixels=pixels;
  this.frames=source.map(sprite=>[1,-1].map(face=>sprite.frames.map(frame=>{
   const c=document.createElement('canvas');c.width=pixels;c.height=Math.ceil(pixels*40.5/36);const context=c.getContext('2d');
   if(face<0){context.translate(c.width,0);context.scale(-1,1);}
   context.drawImage(frame,0,0,c.width,c.height);return c;
  })));
  return this.frames;
 }
}
