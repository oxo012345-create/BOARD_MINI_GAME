// One authoritative simulation, compact snapshots, and explicit delta baselines.
export const NETWORK_VERSION=2, TICK_MS=1000/30, PATCH_MS=100, UNIT_BYTES=15;
const encoder=new TextEncoder(),decoder=new TextDecoder();
// Render-only coordinates share the unit stream's 0.25-world-unit precision.
// The authoritative game objects and collision/damage calculations stay exact.
const visualCoord=value=>Number.isFinite(value)?Math.round(value*4)/4:value;
const unitRow=u=>[u.id,Math.round(u.x*4),Math.round(u.y*4),Math.max(0,Math.round(u.hp*10)),Math.round(u.phase*1000),u.player,(u.face>0?1:0)|(u.walking?2:0)|(u.hit>0?4:0)|(u.recoil>0?8:0)];
export class SnapshotEncoder{
 constructor(){this.revision=0;this.previous=new Map();}
 encode(game,{full=false,events=[],stats={}}={}){
  const current=new Map(),rows=[];let rowBytes=0;
  for(const u of game.units){const row=unitRow(u);current.set(u.id,row);const before=this.previous.get(u.id),mask=full||!before?15:(row[1]!==before[1]||row[2]!==before[2]?1:0)|(row[3]!==before[3]?2:0)|(row[4]!==before[4]||row[5]!==before[5]?4:0)|(row[6]!==before[6]?8:0);if(mask){rows.push({row,mask});rowBytes+=5+(mask&1?4:0)+(mask&2?2:0)+(mask&4?3:0)+(mask&8?1:0);}}
  const removed=full?[]:[...this.previous.keys()].filter(id=>!current.has(id));
  const meta={v:NETWORK_VERSION,full,base:full?null:this.revision,revision:this.revision+1,frame:game.frame,time:game.time,mode:game.mode,over:game.over,winner:game.winner,reason:game.reason,matchClock:game.matchClock,
   players:game.players.map(({externalId,idleWarning,...p})=>{delete p.away;return {...p,...(Number.isFinite(idleWarning)?{idleWarning}:{})};}),zones:game.zones.map(z=>[z.id,z.owner,Math.round(z.hp*10),z.maxHp,z.captureFlash,z.strike||0]),
   drones:game.dispensers.map(d=>[d.id,d.player,visualCoord(d.x),visualCoord(d.y),d.zone,d.hp]),
   shots:game.projectiles.map(b=>[visualCoord(b.x),visualCoord(b.y),b.player,visualCoord(b.tx),visualCoord(b.ty)]),events:events.slice(-96).map(e=>({...e,x:visualCoord(e.x),y:visualCoord(e.y),tx:visualCoord(e.tx),ty:visualCoord(e.ty)})),stats,count:rows.length,removed:removed.length};
  const json=encoder.encode(JSON.stringify(meta)),out=new ArrayBuffer(4+json.length+rowBytes+removed.length*4),view=new DataView(out);view.setUint32(0,json.length,true);new Uint8Array(out,4,json.length).set(json);let offset=4+json.length;
  for(const {row,mask}of rows){view.setUint32(offset,row[0],true);view.setUint8(offset+4,mask);offset+=5;if(mask&1){view.setUint16(offset,row[1],true);view.setUint16(offset+2,row[2],true);offset+=4;}if(mask&2){view.setUint16(offset,row[3],true);offset+=2;}if(mask&4){view.setUint16(offset,row[4],true);view.setUint8(offset+2,row[5]);offset+=3;}if(mask&8)view.setUint8(offset++,row[6]);}
  for(const id of removed){view.setUint32(offset,id,true);offset+=4;}
  this.previous=current;this.revision++;return out;
 }
}
export function decodeSnapshot(input){
 const data=input instanceof ArrayBuffer?input:input.buffer.slice(input.byteOffset,input.byteOffset+input.byteLength),view=new DataView(data);
 if(data.byteLength<4)throw new Error('Truncated snapshot');const length=view.getUint32(0,true);if(length>data.byteLength-4)throw new Error('Truncated metadata');
 const meta=JSON.parse(decoder.decode(new Uint8Array(data,4,length)));
 if(meta.v!==NETWORK_VERSION||!Number.isSafeInteger(meta.count)||meta.count<0||meta.count>10000||!Number.isSafeInteger(meta.removed)||meta.removed<0||meta.removed>10000)throw new Error('Invalid snapshot');
 const rows=[];let offset=4+length;
 for(let n=0;n<meta.count;n++){const row=[view.getUint32(offset,true)],mask=view.getUint8(offset+4);if(!mask||mask>15)throw new Error('Invalid unit fields');offset+=5;if(mask&1){row[1]=view.getUint16(offset,true)/4;row[2]=view.getUint16(offset+2,true)/4;offset+=4;}if(mask&2){row[3]=view.getUint16(offset,true)/10;offset+=2;}if(mask&4){row[4]=view.getUint16(offset,true)/1000;row[5]=view.getUint8(offset+2);offset+=3;}if(mask&8)row[6]=view.getUint8(offset++);rows.push(row);}
 const removed=[];for(let n=0;n<meta.removed;n++){removed.push(view.getUint32(offset,true));offset+=4;}if(offset!==data.byteLength)throw new Error('Invalid snapshot length');return {meta,rows,removed};
}
export class SnapshotReplica{
 constructor(){this.revision=0;this.units=new Map();this.meta=null;}
 apply(data,{requireFull=false}={}){const packet=decodeSnapshot(data),m=packet.meta;if(requireFull&&!m.full)return {waitingFull:true};if(m.revision<=this.revision)return null;if(!m.full&&m.base!==this.revision)return {resync:true};
  if(m.full)this.units.clear();for(const id of packet.removed)this.units.delete(id);for(const r of packet.rows){const previous=this.units.get(r[0]),u=previous?{...previous}:{id:r[0],maxHp:40,selectedUntil:0};if(r[1]!==undefined){u.x=r[1];u.y=r[2];}if(r[3]!==undefined)u.hp=r[3];if(r[4]!==undefined){u.phase=r[4];u.player=r[5];}if(r[6]!==undefined){const flags=r[6];Object.assign(u,{face:flags&1?1:-1,walking:!!(flags&2),hit:flags&4?.12:0,recoil:flags&8?.15:0});}if(u.x===undefined||u.hp===undefined||u.phase===undefined||u.face===undefined)throw new Error('Missing full unit');this.units.set(u.id,u);}
  this.revision=m.revision;this.meta=m;return packet;
 }
}
