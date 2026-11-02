import {PALETTES} from './engine.js';
const INK='#383044';
export function creature(ctx,x,y,size,player=0,face=1,pose=0,hit=false,colors=PALETTES){const p=colors[player];ctx.save();ctx.translate(x,y);ctx.scale(size/64*face,size/64);ctx.lineWidth=2.7;ctx.lineJoin='round';ctx.lineCap='round';ctx.strokeStyle=INK;
 const shape=(fill,path)=>{ctx.fillStyle=fill;ctx.beginPath();path();ctx.fill();ctx.stroke();};
 shape(hit?'#fff':p.main,()=>{ctx.moveTo(-14,8);ctx.bezierCurveTo(-23,16,-30,9,-31,-3);ctx.bezierCurveTo(-39,18,-25,29,-4,29);ctx.bezierCurveTo(19,31,23,11,15,2);ctx.closePath();});
 shape(p.dark,()=>{ctx.moveTo(-18,-19);ctx.lineTo(-29,-28);ctx.lineTo(-24,-12);ctx.closePath();});
 shape(p.main,()=>{ctx.moveTo(-7,-27);ctx.lineTo(-14,-38);ctx.lineTo(-18,-24);ctx.closePath();});
 shape('#ac5267',()=>{ctx.moveTo(-2,3);ctx.lineTo(21,1);ctx.lineTo(20,17+pose*4);ctx.quadraticCurveTo(9,24,-2,12);ctx.closePath();});
 shape(hit?'#fff':'#f5f7ef',()=>{ctx.moveTo(-26,1);ctx.bezierCurveTo(-31,-22,-15,-34,5,-29);ctx.bezierCurveTo(20,-26,28,-14,29,-4);ctx.lineTo(22,-7);ctx.lineTo(18,4);ctx.lineTo(10,-1);ctx.lineTo(5,9);ctx.lineTo(-3,2);ctx.lineTo(-9,11);ctx.lineTo(-16,3);ctx.lineTo(-20,9);ctx.closePath();});
 ctx.fillStyle=p.main;ctx.beginPath();if(player===0)ctx.arc(-6,-19,5,0,Math.PI*2);else if(player===1){ctx.moveTo(-7,-25);ctx.lineTo(-1,-15);ctx.lineTo(-13,-15);}else if(player===2){ctx.moveTo(-6,-26);ctx.lineTo(0,-20);ctx.lineTo(-6,-14);ctx.lineTo(-12,-20);}else ctx.rect(-11,-24,10,10);ctx.fill();
 ctx.fillStyle=INK;ctx.beginPath();ctx.ellipse(17,-14,1.9,2.5,0,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(7,-9,1.1,0,Math.PI*2);ctx.fill();
 shape('#f5f7ef',()=>{ctx.moveTo(-6,12);ctx.quadraticCurveTo(-12,24,-1,28);ctx.quadraticCurveTo(8,24,12,13-pose*5);ctx.lineTo(1,19);ctx.closePath();});
 ctx.restore();}
export function nest(ctx,x,y,size,player=0,hit=false,colors=PALETTES){const p=colors[player];ctx.save();ctx.translate(x,y);ctx.scale(size/90,size/90);ctx.strokeStyle=INK;ctx.lineWidth=3;ctx.lineJoin='round';const shape=(fill,fn)=>{ctx.fillStyle=fill;ctx.beginPath();fn();ctx.fill();ctx.stroke();};
 shape(p.dark,()=>{ctx.ellipse(0,24,42,13,0,0,Math.PI*2);});
 shape(hit?'#fff':p.main,()=>{ctx.moveTo(-37,23);ctx.bezierCurveTo(-37,0,-21,-21,0,-16);ctx.bezierCurveTo(22,-21,36,0,38,23);ctx.quadraticCurveTo(0,37,-37,23);ctx.closePath();});
 for(const [a,b,d]of[[-31,12,-10],[29,12,10],[-22,-1,-8],[22,-1,8]])shape('#f3eedb',()=>{ctx.moveTo(a-7,b+11);ctx.quadraticCurveTo(a+d,b-15,a+d,b-30);ctx.quadraticCurveTo(a+14,b-3,a+7,b+12);ctx.closePath();});
 shape('#765168',()=>{ctx.ellipse(0,13,21,13,0,0,Math.PI*2);});
 shape('#f4ddbb',()=>{ctx.moveTo(-9,17);ctx.quadraticCurveTo(-7,-16,8,-44);ctx.quadraticCurveTo(20,-26,8,18);ctx.closePath();});
 ctx.fillStyle='#f5f7ef';for(const d of [-24,23]){ctx.beginPath();ctx.ellipse(d,13,3,5,0,0,Math.PI*2);ctx.fill();}ctx.restore();}
export function makeSprites(colors=PALETTES){return colors.map((_,i)=>{const frames=[];for(let f=0;f<3;f++){const c=document.createElement('canvas');c.width=128;c.height=144;creature(c.getContext('2d'),64,79,110,i,1,f===1?1:0,f===2,colors);frames.push(c);}const b=document.createElement('canvas');b.width=160;b.height=150;nest(b.getContext('2d'),80,85,147,i,false,colors);return {frames,base:b};});}
export function makeMap(){const c=document.createElement('canvas');c.width=1000;c.height=1000;const ctx=c.getContext('2d');ctx.fillStyle='#5c4b6b';ctx.fillRect(0,0,1000,1000);
 for(let r=0;r<5;r++)for(let col=0;col<5;col++){const x=col*200,y=r*200;
  ctx.fillStyle=(r+col)%2?'#c8c6ce':'#b6b3c1';ctx.fillRect(x+2,y+2,196,196);ctx.fillStyle='#ffffff20';ctx.fillRect(x+7,y+7,186,3);ctx.fillStyle='#5d53641e';ctx.fillRect(x+6,y+190,188,4);ctx.fillRect(x+190,y+6,4,184);ctx.strokeStyle='#80778930';ctx.lineWidth=1;ctx.strokeRect(x+12,y+12,176,176);
  for(let a=0;a<5;a++)for(let b=0;b<5;b++){ctx.fillStyle='#82788c26';ctx.fillRect(x+78+a*10,y+78+b*10,4,5);ctx.fillStyle='#eee7f020';ctx.fillRect(x+78+a*10,y+83+b*10,4,1);}
  for(const dx of [16,184])for(const dy of [16,184]){ctx.fillStyle='#8c81982b';ctx.beginPath();ctx.arc(x+dx,y+dy,2,0,Math.PI*2);ctx.fill();}
 }
 ctx.strokeStyle='#211e2e';ctx.lineWidth=9;ctx.strokeRect(4,4,992,992);ctx.strokeStyle='#b5a9bf';ctx.lineWidth=3;ctx.strokeRect(10,10,980,980);return c;}
