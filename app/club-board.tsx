'use client';
import {useId,useMemo,useRef,useState} from 'react';
import {matchSide,type Match} from './api/_lib/club';
import {BARRIERS,DISC_RADIUS,MAX_PULL} from './api/_lib/club-physics';

import { forbiddenBlackMoves } from './api/_lib/renju';
import { useClubShot } from './club-shot';

const P=600*30/560, STEP=600*500/560/14;
function winningCells(m:Match){
 if(m.winner===undefined)return [];
 for(let cell=0;cell<225;cell++)for(const [dx,dy] of [[1,0],[0,1],[1,1],[1,-1]]){
  const px=cell%15-dx,py=Math.floor(cell/15)-dy;if(px>=0&&px<15&&py>=0&&py<15&&m.board[py*15+px]===m.winner+1)continue;
  const cells=[];for(let k=0;k<15;k++){const x=cell%15+dx*k,y=Math.floor(cell/15)+dy*k;if(x<0||x>=15||y<0||y>=15||m.board[y*15+x]!==m.winner+1)break;cells.push(y*15+x);}if(m.winner===0?cells.length===5:cells.length>=5)return cells;
 }return [];
}
export function ClubBoard({kind,m,canPlay,obstacles,selected,onSelect,onShot,onMotion}:{kind:'gomoku'|'alkkagi';m:Match;canPlay:boolean;obstacles:boolean;selected:number|null;onSelect:(cell:number)=>void;onShot:(p:Record<string,unknown>)=>Promise<Match|null>;onMotion:(moving:boolean)=>void}){
 const uid=useId().replace(/:/g,''),svg=useRef<SVGSVGElement>(null);
 const [drag,setDrag]=useState<{id:number;x:number;y:number;ox:number;oy:number;dx:number;dy:number}|null>(null);
 const playback=useClubShot(m,obstacles,onShot,onMotion);
 const boardKey=m.board.join('');
 const forbidden=useMemo(()=>kind==='gomoku'?forbiddenBlackMoves(boardKey.split('').map(Number)):new Map<number,string>(),[boardKey,kind]);
 const opening=kind==='gomoku'&&!m.board.some(Boolean);
 const black=matchSide(m)===0;
 const selectable=(cell:number)=>!m.board[cell]&&(!black||!forbidden.has(cell))&&(!opening||cell===112);
 const point=(e:React.PointerEvent)=>{const r=svg.current!.getBoundingClientRect();return{x:(e.clientX-r.left)*600/r.width,y:(e.clientY-r.top)*600/r.height};};
 const select=(e:React.PointerEvent)=>{const p=point(e),x=Math.round((p.x-P)/STEP),y=Math.round((p.y-P)/STEP);if(canPlay&&x>=0&&x<15&&y>=0&&y<15&&selectable(y*15+x))onSelect(y*15+x);};
 const animating=playback.locked;
 const discs=playback.discs,win=winningCells(m);
 const stone=(x:number,y:number,side:number,r:number,key:string|number,preview=false)=><g key={key} opacity={preview?.5:1}><circle cx={x+1} cy={y+4} r={r+1} fill="#45341d" opacity=".2"/><circle cx={x} cy={y} r={r} fill={`url(#${uid}-${side?'white':'black'})`}/></g>;
 return <><div className={`club-board-frame ${kind}`}><svg ref={svg} className="club-board-svg" viewBox="0 0 600 600" role="img" tabIndex={kind==='gomoku'?0:undefined} onKeyDown={e=>{if(kind!=='gomoku'||!canPlay)return;const delta:Record<string,number>={ArrowLeft:-1,ArrowRight:1,ArrowUp:-15,ArrowDown:15};if(e.key in delta){e.preventDefault();const cell=Math.max(0,Math.min(224,(selected??112)+delta[e.key]));if(selectable(cell))onSelect(cell);}else if(e.key==='Enter'||e.key===' '){e.preventDefault();if(selected===null&&selectable(112))onSelect(112);}}} aria-label={kind==='gomoku'?'나무 오목판':'알까기 게임판. 우리 돌을 역방향으로 드래그'}
 onPointerDown={e=>{if(!canPlay||animating||e.button!==0)return;e.preventDefault();svg.current!.setPointerCapture(e.pointerId);if(kind==='gomoku'){select(e);return;}const p=point(e),d=discs.filter(d=>d.alive&&d.side===matchSide(m)).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y)).find(d=>Math.hypot(d.x-p.x,d.y-p.y)<34);if(d)setDrag({id:d.id,x:d.x,y:d.y,ox:p.x,oy:p.y,dx:0,dy:0});}}
 onPointerMove={e=>{if(kind==='gomoku'&&e.buttons===1){select(e);return;}if(!drag)return;const p=point(e),dx=drag.ox-p.x,dy=drag.oy-p.y,k=Math.min(1,MAX_PULL/(Math.hypot(dx,dy)||1));setDrag({...drag,dx:dx*k,dy:dy*k});}}
 onPointerUp={()=>{if(drag&&canPlay&&!animating&&Math.hypot(drag.dx,drag.dy)>8)void playback.fire(drag.id,drag.dx,drag.dy);setDrag(null);}}
 onPointerCancel={()=>setDrag(null)} onLostPointerCapture={()=>setDrag(null)}>
 <defs><linearGradient id={`${uid}-metal`} x2=".8" y2="1"><stop stopColor="#f4dfaf"/><stop offset=".22" stopColor="#8d795b"/><stop offset=".5" stopColor="#2d302a"/><stop offset=".8" stopColor="#9c865f"/><stop offset="1" stopColor="#3c3326"/></linearGradient><linearGradient id={`${uid}-wood`} x2="1" y2="1"><stop stopColor="#ecd4a7"/><stop offset=".5" stopColor="#e5c795"/><stop offset="1" stopColor="#debb85"/></linearGradient><radialGradient id={`${uid}-black`} cx="35%" cy="25%" r="75%"><stop stopColor="#626860"/><stop offset=".4" stopColor="#333830"/><stop offset="1" stopColor="#161c15"/></radialGradient><radialGradient id={`${uid}-white`} cx="35%" cy="25%" r="75%"><stop stopColor="#fffef6"/><stop offset=".65" stopColor="#f1eee1"/><stop offset="1" stopColor="#c6c9b9"/></radialGradient><marker id={`${uid}-arrow`} viewBox="0 0 12 12" refX="10" refY="6" markerWidth="5" markerHeight="5" orient="auto"><path d="M2 2 L10 6 L2 10" fill="none" stroke="#355d41" strokeWidth="2"/></marker></defs>
 <rect width="600" height="600" fill={`url(#${uid}-wood)`}/>
 {Array.from({length:150},(_,i)=><path key={i} d={`M0 ${i*4} C140 ${i*4-3} 430 ${i*4+3} 600 ${i*4-1}`} stroke="#8c6330" opacity={.015+((i*52)%9)*.002} fill="none"/>)}
 {kind==='gomoku'&&<><g stroke="#8b6c3c" strokeOpacity=".4" strokeWidth=".85">{Array.from({length:15},(_,i)=><path key={i} d={`M${P} ${P+i*STEP}H${600-P} M${P+i*STEP} ${P}V${600-P}`}/>)}</g><rect x={P} y={P} width={600-2*P} height={600-2*P} fill="none" stroke="#896c3e" strokeOpacity=".6" strokeWidth="1.2"/>
 {[[3,3],[11,3],[7,7],[3,11],[11,11]].map(([x,y])=><circle key={x+'-'+y} cx={P+x*STEP} cy={P+y*STEP} r="3" fill="#8b7048"/>)}
 <g fill="#94754c" fontSize="10" textAnchor="middle" dominantBaseline="middle">{Array.from({length:15},(_,i)=><g key={i}><text x={P+i*STEP} y="15">{String.fromCharCode(65+i)}</text><text x="14" y={P+i*STEP}>{i+1}</text></g>)}</g>
 </>}
 {kind==='gomoku'?<>{black&&[...forbidden].map(([cell,reason])=><path key={'forbidden-'+cell} data-forbidden={cell} aria-label={reason+' 금수'} d={`M${P+cell%15*STEP-5} ${P+Math.floor(cell/15)*STEP-5}l10 10m0-10l-10 10`} stroke="#a32f28" strokeWidth="2.4" strokeLinecap="round"/>)}{m.board.map((color,i)=>color?stone(P+i%15*STEP,P+Math.floor(i/15)*STEP,color-1,STEP*.44,i):null)}{m.lastMove!==undefined&&<rect x={P+m.lastMove%15*STEP-4} y={P+Math.floor(m.lastMove/15)*STEP-4} width="8" height="8" fill="none" stroke="#a9bc85" strokeWidth="2"/>}{selected!==null&&canPlay&&selectable(selected)&&<>{stone(P+selected%15*STEP,P+Math.floor(selected/15)*STEP,matchSide(m),STEP*.44,'preview',true)}<rect x={P+selected%15*STEP-STEP*.48} y={P+Math.floor(selected/15)*STEP-STEP*.48} width={STEP*.96} height={STEP*.96} fill="none" stroke="#39614b" strokeWidth="2"/></>}{win.length>0&&<polyline points={win.map(i=>`${P+i%15*STEP},${P+Math.floor(i/15)*STEP}`).join(' ')} stroke="#95b371" strokeWidth="5" strokeLinecap="round" fill="none"/>}</>:<>
 <rect width="600" height="600" fill="#9b5725"/>
 <g>{Array.from({length:18*18},(_,i)=>{const x=i%18,y=Math.floor(i/18);return <rect key={i} x={18+x*564/18} y={18+y*564/18} width={564/18+.3} height={564/18+.3} fill={(x+y)%2?'#d79b54':'#efc586'} opacity={.88+((x*7+y*3)%5)*.025}/>;})}</g>
 <g stroke="#693914" fill="none">{Array.from({length:100},(_,i)=><path key={i} d={`M18 ${18+i*5.65}Q180 ${14+i*5.65} 300 ${18+i*5.65}T582 ${18+i*5.65}`} opacity={.045+((i*13)%5)*.009} strokeWidth="1"/>)}</g>
 <rect x="18" y="18" width="564" height="564" fill="none" stroke="#623512" strokeWidth="4" opacity=".55"/>
 <rect x="21" y="21" width="558" height="558" fill="none" stroke="#ffe3a6" strokeWidth="2" opacity=".65"/>
 {obstacles&&BARRIERS.map((b,i)=><g key={i} data-bumper={i} transform={`translate(${b.x} ${b.y})`}>
 <circle cy="4" r={b.r+2} fill="#28190d" opacity=".42"/>
 <circle r={b.r} fill={`url(#${uid}-metal)`} stroke="#281e16" strokeWidth="2"/>
 <circle r={b.r-4} fill="#3a3c35" stroke="#c7a879" strokeWidth="1.5"/>
 <circle r={b.r-7} fill="#292d29" stroke="#777b6c" strokeWidth="1"/>
 {Array.from({length:8},(_,j)=><g key={j} transform={`rotate(${j*45})`}><path d="M0-14C-6-11-5-5 0-4C5-5 6-11 0-14Z" fill="#777e6c" stroke="#b8b499" strokeWidth=".8"/><circle cy="-18.5" r="1" fill="#e0c591"/></g>)}
 <circle r="4" fill="#b3aa8d" stroke="#4c5046" strokeWidth="1.5"/>
 <path d="M-14-13A19 19 0 0 1 14-13" fill="none" stroke="#fff0ce" opacity=".5" strokeWidth="1.4"/>
 </g>)}
 {discs.filter(d=>d.alive).map(d=><g key={d.id}>{stone(d.x,d.y,d.side,DISC_RADIUS,d.id)}{canPlay&&!animating&&d.side===matchSide(m)&&<circle cx={d.x} cy={d.y} r={DISC_RADIUS+5} fill="none" stroke="#577847" strokeOpacity=".6" strokeWidth="1.5"/>}</g>)}
 {drag&&Math.hypot(drag.dx,drag.dy)>2&&<><path d={`M${drag.x} ${drag.y}l${drag.dx} ${drag.dy}`} fill="none" stroke="#355d41" strokeWidth="3" strokeDasharray="6 5" markerEnd={`url(#${uid}-arrow)`}/><circle cx={drag.x-drag.dx} cy={drag.y-drag.dy} r="7" fill="#f8f6e9" opacity=".7"/></>}</>}
 </svg>{kind==='gomoku'&&<div className="club-board-access" role="grid" aria-label="15×15 오목판">{m.board.map((color,i)=><button key={i} role="gridcell" tabIndex={-1} disabled={!canPlay||!selectable(i)} aria-selected={selected===i} aria-label={`${String.fromCharCode(65+i%15)}${Math.floor(i/15)+1}${color?' '+(color===1?'흑돌':'백돌'):black&&forbidden.has(i)?' '+forbidden.get(i)+' 금수':''}`} onClick={()=>onSelect(i)}/>)}</div>}</div>
 <div className="club-board-caption"><span>{kind==='gomoku'?selected!==null&&canPlay?`선택 ${String.fromCharCode(65+selected%15)}${Math.floor(selected/15)+1} · 위치를 확인해 주세요`:opening?'첫 수는 중앙 H8':black?'× 흑 금수 · 삼삼 / 사사 / 장목':'백은 금수 없이 착수할 수 있어요':playback.awaiting?'서버에서 결과를 확인하고 있어요':animating?'돌이 멈추기를 기다려 주세요':drag?`파워 ${Math.round(Math.hypot(drag.dx,drag.dy)/MAX_PULL*100)}%`:'뒤로 당길수록 강하게 · 손을 떼면 발사'}</span><span>{m.turn} {kind==='gomoku'?'수':'턴'}</span></div>
 {drag&&<div className="club-power"><i style={{width:`${Math.hypot(drag.dx,drag.dy)/MAX_PULL*100}%`}}/></div>}</>;
}
