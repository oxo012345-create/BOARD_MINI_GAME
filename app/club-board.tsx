'use client';
import {useEffect,useId,useMemo,useRef,useState} from 'react';
import {matchSide,type Match} from './api/_lib/club';
import {BARRIERS,DISC_RADIUS,FRAME_MS,MAX_PULL,type Disc} from './api/_lib/club-physics';

const P=600*30/560, STEP=600*500/560/14;
function winningCells(m:Match){
 if(m.winner===undefined)return [];
 for(let cell=0;cell<225;cell++)for(const [dx,dy] of [[1,0],[0,1],[1,1],[1,-1]]){
  const cells=[];for(let k=0;k<15;k++){const x=cell%15+dx*k,y=Math.floor(cell/15)+dy*k;if(x<0||x>=15||y<0||y>=15||m.board[y*15+x]!==m.winner+1)break;cells.push(y*15+x);}if(cells.length>=5)return cells;
 }return [];
}
export function ClubBoard({kind,m,canPlay,obstacles,selected,onSelect,onShot,onMotion}:{kind:'gomoku'|'alkkagi';m:Match;canPlay:boolean;obstacles:boolean;selected:number|null;onSelect:(cell:number)=>void;onShot:(p:Record<string,unknown>)=>void;onMotion:(moving:boolean)=>void}){
 const uid=useId().replace(/:/g,''),svg=useRef<SVGSVGElement>(null);
 const [drag,setDrag]=useState<{id:number;x:number;y:number;ox:number;oy:number;dx:number;dy:number}|null>(null);
 const [playback,setPlayback]=useState<{shot:number|undefined;discs:Disc[]|null}>({shot:m.shot,discs:null});
 const lastShot=useRef(m.shot); // Reconnect shows authoritative settled positions.
 const json=JSON.stringify(m.frames??[]),frames=useMemo(()=>JSON.parse(json) as Disc[][],[json]);
 const motion=useRef(onMotion);useEffect(()=>{motion.current=onMotion;},[onMotion]);
 useEffect(()=>{
  if(!m.shot||m.shot===lastShot.current||!frames.length)return;
  lastShot.current=m.shot;let raf=0;const start=performance.now();motion.current(true);
  const tick=(now:number)=>{const f=(now-start)/FRAME_MS,i=Math.floor(f),mix=f-i;if(i>=frames.length-1){setPlayback({shot:m.shot,discs:null});motion.current(false);return;}setPlayback({shot:m.shot,discs:frames[i].map((d,n)=>{const next=frames[i+1][n];return {...d,x:d.x+(next.x-d.x)*mix,y:d.y+(next.y-d.y)*mix};})});raf=requestAnimationFrame(tick);};
  raf=requestAnimationFrame(tick);return()=>{cancelAnimationFrame(raf);motion.current(false);};
 },[m.shot,frames]);
 const point=(e:React.PointerEvent)=>{const r=svg.current!.getBoundingClientRect();return{x:(e.clientX-r.left)*600/r.width,y:(e.clientY-r.top)*600/r.height};};
 const select=(e:React.PointerEvent)=>{const p=point(e),x=Math.round((p.x-P)/STEP),y=Math.round((p.y-P)/STEP);if(canPlay&&x>=0&&x<15&&y>=0&&y<15&&!m.board[y*15+x])onSelect(y*15+x);};
 const animating=playback.shot!==m.shot||playback.discs!==null;
 const discs=playback.shot!==m.shot?(frames[0]??m.discs):playback.discs??m.discs,win=winningCells(m);
 const stone=(x:number,y:number,side:number,r:number,key:string|number,preview=false)=><g key={key} opacity={preview?.5:1}><circle cx={x+1} cy={y+4} r={r+1} fill="#45341d" opacity=".2"/><circle cx={x} cy={y} r={r} fill={`url(#${uid}-${side?'white':'black'})`}/></g>;
 return <><div className="club-board-frame"><svg ref={svg} className="club-board-svg" viewBox="0 0 600 600" role="img" tabIndex={kind==='gomoku'?0:undefined} onKeyDown={e=>{if(kind!=='gomoku'||!canPlay)return;const delta:Record<string,number>={ArrowLeft:-1,ArrowRight:1,ArrowUp:-15,ArrowDown:15};if(e.key in delta){e.preventDefault();const cell=Math.max(0,Math.min(224,(selected??112)+delta[e.key]));if(!m.board[cell])onSelect(cell);}else if(e.key==='Enter'||e.key===' '){e.preventDefault();if(selected===null&&!m.board[112])onSelect(112);}}} aria-label={kind==='gomoku'?'나무 오목판':'알까기 게임판. 우리 돌을 역방향으로 드래그'}
 onPointerDown={e=>{if(!canPlay||animating||e.button!==0)return;e.preventDefault();svg.current!.setPointerCapture(e.pointerId);if(kind==='gomoku'){select(e);return;}const p=point(e),d=discs.filter(d=>d.alive&&d.side===matchSide(m)).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y)).find(d=>Math.hypot(d.x-p.x,d.y-p.y)<34);if(d)setDrag({id:d.id,x:d.x,y:d.y,ox:p.x,oy:p.y,dx:0,dy:0});}}
 onPointerMove={e=>{if(kind==='gomoku'&&e.buttons===1){select(e);return;}if(!drag)return;const p=point(e),dx=drag.ox-p.x,dy=drag.oy-p.y,k=Math.min(1,MAX_PULL/(Math.hypot(dx,dy)||1));setDrag({...drag,dx:dx*k,dy:dy*k});}}
 onPointerUp={()=>{if(drag&&canPlay&&!animating&&Math.hypot(drag.dx,drag.dy)>8)onShot({discId:drag.id,dx:drag.dx,dy:drag.dy});setDrag(null);}}
 onPointerCancel={()=>setDrag(null)} onLostPointerCapture={()=>setDrag(null)}>
 <defs><linearGradient id={`${uid}-wood`} x2="1" y2="1"><stop stopColor="#ecd4a7"/><stop offset=".5" stopColor="#e5c795"/><stop offset="1" stopColor="#debb85"/></linearGradient><radialGradient id={`${uid}-black`} cx="35%" cy="25%" r="75%"><stop stopColor="#626860"/><stop offset=".4" stopColor="#333830"/><stop offset="1" stopColor="#161c15"/></radialGradient><radialGradient id={`${uid}-white`} cx="35%" cy="25%" r="75%"><stop stopColor="#fffef6"/><stop offset=".65" stopColor="#f1eee1"/><stop offset="1" stopColor="#c6c9b9"/></radialGradient><marker id={`${uid}-arrow`} viewBox="0 0 12 12" refX="10" refY="6" markerWidth="5" markerHeight="5" orient="auto"><path d="M2 2 L10 6 L2 10" fill="none" stroke="#355d41" strokeWidth="2"/></marker></defs>
 <rect width="600" height="600" fill={`url(#${uid}-wood)`}/>
 {Array.from({length:150},(_,i)=><path key={i} d={`M0 ${i*4} C140 ${i*4-3} 430 ${i*4+3} 600 ${i*4-1}`} stroke="#8c6330" opacity={.015+((i*52)%9)*.002} fill="none"/>)}
 <g stroke="#8b6c3c" strokeOpacity=".4" strokeWidth=".85">{Array.from({length:15},(_,i)=><path key={i} d={`M${P} ${P+i*STEP}H${600-P} M${P+i*STEP} ${P}V${600-P}`}/>)}</g><rect x={P} y={P} width={600-2*P} height={600-2*P} fill="none" stroke="#896c3e" strokeOpacity=".6" strokeWidth="1.2"/>
 {[[3,3],[11,3],[7,7],[3,11],[11,11]].map(([x,y])=><circle key={x+'-'+y} cx={P+x*STEP} cy={P+y*STEP} r="3" fill="#8b7048"/>)}
 <g fill="#94754c" fontSize="10" textAnchor="middle" dominantBaseline="middle">{Array.from({length:15},(_,i)=><g key={i}><text x={P+i*STEP} y="15">{String.fromCharCode(65+i)}</text><text x="14" y={P+i*STEP}>{i+1}</text></g>)}</g>
 {kind==='gomoku'?<>{m.board.map((color,i)=>color?stone(P+i%15*STEP,P+Math.floor(i/15)*STEP,color-1,STEP*.44,i):null)}{m.lastMove!==undefined&&<rect x={P+m.lastMove%15*STEP-4} y={P+Math.floor(m.lastMove/15)*STEP-4} width="8" height="8" fill="none" stroke="#a9bc85" strokeWidth="2"/>}{selected!==null&&canPlay&&!m.board[selected]&&<>{stone(P+selected%15*STEP,P+Math.floor(selected/15)*STEP,matchSide(m),STEP*.44,'preview',true)}<rect x={P+selected%15*STEP-STEP*.48} y={P+Math.floor(selected/15)*STEP-STEP*.48} width={STEP*.96} height={STEP*.96} fill="none" stroke="#39614b" strokeWidth="2"/></>}{win.length>0&&<polyline points={win.map(i=>`${P+i%15*STEP},${P+Math.floor(i/15)*STEP}`).join(' ')} stroke="#95b371" strokeWidth="5" strokeLinecap="round" fill="none"/>}</>:<>
 <rect x="4" y="4" width="592" height="592" stroke="#9d744d" strokeOpacity=".4" strokeDasharray="5 7" fill="none"/>
 {obstacles&&BARRIERS.map((b,i)=><g key={i}><rect x={b.x+2} y={b.y+5} width={b.w} height={b.h} rx="7" fill="#45341d" opacity=".2"/><rect x={b.x} y={b.y} width={b.w} height={b.h} rx="7" fill="#7f8b68" stroke="#536047" strokeWidth="2"/><path d={`M${b.x+8} ${b.y+6}h${b.w-16}`} stroke="#b5c398" strokeWidth="2"/></g>)}
 {discs.filter(d=>d.alive).map(d=><g key={d.id}>{stone(d.x,d.y,d.side,DISC_RADIUS,d.id)}{canPlay&&!animating&&d.side===matchSide(m)&&<circle cx={d.x} cy={d.y} r={DISC_RADIUS+5} fill="none" stroke="#577847" strokeOpacity=".6" strokeWidth="1.5"/>}</g>)}
 {drag&&Math.hypot(drag.dx,drag.dy)>2&&<><path d={`M${drag.x} ${drag.y}l${drag.dx} ${drag.dy}`} fill="none" stroke="#355d41" strokeWidth="3" strokeDasharray="6 5" markerEnd={`url(#${uid}-arrow)`}/><circle cx={drag.x-drag.dx} cy={drag.y-drag.dy} r="7" fill="#f8f6e9" opacity=".7"/></>}</>}
 </svg>{kind==='gomoku'&&<div className="club-board-access" role="grid" aria-label="15×15 오목판">{m.board.map((color,i)=><button key={i} role="gridcell" tabIndex={-1} disabled={!canPlay||!!color} aria-selected={selected===i} aria-label={`${String.fromCharCode(65+i%15)}${Math.floor(i/15)+1}${color?' '+(color===1?'흑돌':'백돌'):''}`} onClick={()=>onSelect(i)}/>)}</div>}</div>
 <div className="club-board-caption"><span>{kind==='gomoku'?selected!==null&&canPlay?`선택 ${String.fromCharCode(65+selected%15)}${Math.floor(selected/15)+1} · 위치를 확인해 주세요`:'교차점을 선택하고 착수 버튼을 누르세요':animating?'돌이 멈추기를 기다려 주세요':drag?`파워 ${Math.round(Math.hypot(drag.dx,drag.dy)/MAX_PULL*100)}%`:'뒤로 당길수록 강하게 · 손을 떼면 발사'}</span><span>{m.turn} {kind==='gomoku'?'수':'턴'}</span></div>
 {drag&&<div className="club-power"><i style={{width:`${Math.hypot(drag.dx,drag.dy)/MAX_PULL*100}%`}}/></div>}</>;
}
