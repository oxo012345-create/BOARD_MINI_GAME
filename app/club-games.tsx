'use client';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { defaultClubSetup, matchActor, matchSide, type ClubId, type ClubSetup, type ClubView, type Match } from './api/_lib/club';
import { BARRIERS, type Disc } from './api/_lib/club-physics';
import './club-games.css';
type Player = {id:string;name:string};
type Action = (p:Record<string,unknown>)=>Promise<unknown>;
export function ClubBriefing({kind,setup,players,isHost,onAction,onStart,topBar,overlays}:{kind:ClubId;setup?:ClubSetup;players:Player[];isHost:boolean;onAction:Action;onStart:()=>void;topBar:ReactNode;overlays:ReactNode}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const s=setup??defaultClubSetup(kind);
  async function update(p:Partial<ClubSetup>){setBusy(true);try{await onAction({action:'club-settings',clubSetup:{...s,...p}});}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <main className="app-shell club-shell">{topBar}<section className="club-panel"><h2>모드</h2><div className="club-options">{(kind==='number-baseball'?[['individual','4인 개인전'],['team','2대2 팀전']]:[['tournament','4인 토너먼트'],['team','2대2 팀전']]).map(([mode,label])=><button key={mode} disabled={!isHost||busy} aria-pressed={s.mode===mode} onClick={()=>void update({mode:mode as ClubSetup['mode']})}>{label}</button>)}</div>
  {s.mode==='team'&&<><h3>팀 편성</h3><div className="club-options"><button disabled={!isHost||busy} aria-pressed={!s.redIds} onClick={()=>void update({redIds:undefined})}>랜덤</button><button disabled={!isHost||busy||players.length!==4} aria-pressed={!!s.redIds} onClick={()=>void update({redIds:players.slice(0,2).map(p=>p.id)})}>직접</button></div>{s.redIds&&<div className="club-teams">{players.map(p=><label key={p.id}><input type="checkbox" checked={s.redIds!.includes(p.id)} disabled={!isHost||busy} onChange={()=>void update({redIds:s.redIds!.includes(p.id)?s.redIds!.filter(id=>id!==p.id):[...s.redIds!,p.id].slice(-2)})}/>{p.name} · {s.redIds!.includes(p.id)?'빨강':'파랑'}</label>)}</div>}</>}
  {kind==='alkkagi'&&<><h3>장애물</h3><button className="club-toggle" aria-pressed={s.obstacles} disabled={!isHost||busy} onClick={()=>void update({obstacles:!s.obstacles})}>장애물 {s.obstacles?'ON':'OFF'}</button></>}
  {kind==='number-baseball'&&<><h3>자리 수</h3><div className="club-options">{([3,4] as const).map(d=><button key={d} aria-pressed={s.digits===d} disabled={!isHost||busy} onClick={()=>void update({digits:d})}>{d}자리</button>)}</div><p>1~9 · 중복 없음 · 전원 제출 후 판정</p></>}
  {s.mode==='tournament'&&<p>준결승 2경기 → 결승 · 3·4위전</p>}
  {kind==='gomoku'&&<p>15×15 · 5알 이상 승리 · 3·3 / 4·4 / 장목 허용</p>}
  {kind==='alkkagi'&&<p>우리 돌을 뒤로 당겼다 놓으세요. 중심이 판 밖으로 나가면 탈락합니다.</p>}
  {s.mode==='team'&&<p>{kind==='number-baseball'?'매 라운드 팀 입력 담당 교대':'빨강1 → 파랑1 → 빨강2 → 파랑2'}</p>}
  <p role="alert">{error}</p><p>{players.length}/4명</p>{isHost?<button className="button primary xl" disabled={busy||players.length!==4||(s.mode==='team'&&!!s.redIds&&s.redIds.length!==2)} onClick={onStart}>게임 시작</button>:<p>방장이 시작하기를 기다리는 중</p>}</section>{overlays}</main>;
}
function DiscBoard({m,obstacles,canPlay,onShot}:{m:Match;obstacles:boolean;canPlay:boolean;onShot:(p:Record<string,unknown>)=>void}) {
  const [drag,setDrag]=useState<{id:number;x:number;y:number;dx:number;dy:number}|null>(null);
  const [playback,setPlayback]=useState<{shot:number;discs:Disc[]}|null>(null);
  const lastShot=useRef<number|undefined>(undefined);
  const framesJSON=JSON.stringify(m.frames??[]);
  const frames=useMemo(()=>JSON.parse(framesJSON) as Disc[][],[framesJSON]);
  useEffect(()=>{if(!m.shot||lastShot.current===m.shot)return;lastShot.current=m.shot;let n=0;const timer=setInterval(()=>{if(n>=frames.length){clearInterval(timer);setPlayback(null);}else setPlayback({shot:m.shot!,discs:frames[n++]});},24);return()=>clearInterval(timer);},[m.shot,frames]);
  const svgRef=useRef<SVGSVGElement>(null);
  const point=(e:React.PointerEvent)=>{const r=svgRef.current!.getBoundingClientRect();return{x:(e.clientX-r.left)*600/r.width,y:(e.clientY-r.top)*600/r.height};};
  function move(e:React.PointerEvent){if(!drag)return;const p=point(e),dx=drag.x-p.x,dy=drag.y-p.y,k=Math.min(1,180/Math.hypot(dx,dy));setDrag({...drag,dx:dx*k,dy:dy*k});}
  const discs=playback&&playback.shot===m.shot?playback.discs:m.discs;
  return <svg ref={svgRef} className="club-disc-board" viewBox="0 0 600 600" role="img" aria-label="알까기 게임판. 우리 돌을 역방향으로 드래그" onPointerMove={move} onPointerCancel={()=>setDrag(null)} onPointerUp={()=>{if(drag&&Math.hypot(drag.dx,drag.dy)>=3&&canPlay&&!playback)onShot({discId:drag.id,dx:drag.dx,dy:drag.dy});setDrag(null);}}>
    <defs><pattern id="club-grain" width="600" height="35" patternUnits="userSpaceOnUse"><path d="M0 12 Q150 0 300 15 T600 12" stroke="#b8874a" fill="none" opacity=".25"/></pattern><radialGradient id="club-red"><stop stopColor="#ff9478"/><stop offset="1" stopColor="#ab302c"/></radialGradient><radialGradient id="club-blue"><stop stopColor="#8bbff2"/><stop offset="1" stopColor="#245d9b"/></radialGradient></defs>
    <rect width="600" height="600" fill="#dfb77c"/><rect width="600" height="600" fill="url(#club-grain)"/><rect x="5" y="5" width="590" height="590" fill="none" stroke="#78582e" strokeWidth="4"/>
    {obstacles&&BARRIERS.map((b,i)=><rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} rx="7" fill="#566052" stroke="#303b2d" strokeWidth="4"/>)}
    {discs.filter(d=>d.alive).map(d=><g key={d.id} role="button" aria-label={`${d.side?'파랑':'빨강'} ${d.id%5+1}번 돌`} onPointerDown={e=>{if(!canPlay||playback||d.side!==matchSide(m))return;e.preventDefault();svgRef.current!.setPointerCapture(e.pointerId);setDrag({id:d.id,x:d.x,y:d.y,dx:0,dy:0});}}><circle cx={d.x+2} cy={d.y+4} r="20" fill="#543e2a" opacity=".3"/><circle cx={d.x} cy={d.y} r="19" stroke={canPlay&&d.side===matchSide(m)?'#fff':'#23352d'} strokeWidth="3" fill={`url(#club-${d.side?'blue':'red'})`}/></g>)}
    {drag&&<><line x1={drag.x} y1={drag.y} x2={drag.x+drag.dx} y2={drag.y+drag.dy} stroke="#fff" strokeWidth="5" strokeDasharray="9 5"/><circle cx={drag.x+drag.dx} cy={drag.y+drag.dy} r="7" fill="#fff"/><text x="300" y="580" textAnchor="middle" fill="#263a2d" fontSize="24">힘 {Math.round(Math.hypot(drag.dx,drag.dy)/180*100)}%</text></>}
  </svg>;
}
export function ClubGame({s,players,meId,isHost,onAction,onReplay,onLobby,topBar,overlays}:{s:ClubView;players:Player[];meId?:string;isHost:boolean;onAction:Action;onReplay:()=>void;onLobby:()=>void;topBar:ReactNode;overlays:ReactNode}) {
  const [selected,setSelected]=useState<number|null>(null),[watch,setWatch]=useState(''),[guess,setGuess]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const lock=useRef(false);
  const name=(id?:string)=>players.find(p=>p.id===id)?.name??'참가자';
  const own=s.matches.find(m=>m.sides.flat().includes(meId??'')&&m.winner===undefined&&!m.draw)??s.matches.findLast(m=>m.sides.flat().includes(meId??''));
  const m=s.matches.find(m=>m.id===watch)??own??s.matches[0];
  const canPlay=!!m&&!busy&&!s.finished&&!s.paused?.length&&!m.draw&&m.winner===undefined&&matchActor(m)===meId;
  async function send(p:Record<string,unknown>){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await onAction({clubId:s.id,requestId:crypto.randomUUID(),...p});setSelected(null);setGuess('');}catch(e){setError((e as Error).message);}finally{setBusy(false);lock.current=false;}}
  const matchPayload=m?{matchId:m.id,turn:m.turn,attempt:m.attempt}:{};
  return <main className="app-shell club-shell">{topBar}
    <div className="club-mode">{s.setup.mode==='team'?'2대2 팀전':s.kind==='number-baseball'?'4인 개인전':'4인 토너먼트'}</div>
    {s.setup.mode==='team'&&s.kind==='number-baseball'&&<div className="club-team-banner"><span>🔴 {s.teams[0].map(name).join(' · ')}</span><span>🔵 {s.teams[1].map(name).join(' · ')}</span></div>}
    {!!s.paused?.length&&<p className="club-paused">{s.paused.map(name).join(' · ')} 복귀 대기</p>}
    {s.finished?<section className="club-panel club-result"><h2>{s.kind==='number-baseball'&&s.ranking.length>1?(s.setup.mode==='team'?'무승부':'공동승'):'경기 결과'}</h2>{s.ranking.map((ids,i)=><p key={i}><b>{s.kind==='number-baseball'?'승리':`${i+1}위`}</b> {ids.map(name).join(' · ')}</p>)}{isHost?<div className="club-options"><button className="button primary" onClick={onReplay}>재대결</button><button className="button secondary" onClick={onLobby}>로비</button></div>:<p>방장의 선택을 기다리는 중</p>}</section>:s.kind==='number-baseball'?<section className="club-panel"><h2>{s.round}라운드 · {s.setup.digits}자리</h2><p>{s.mySubmitted?'제출 완료':`${name(s.inputter)} 입력 차례`}</p><div className="club-submitted">{(s.setup.mode==='team'?['team-0','team-1']:s.players).map((id,i)=><span key={id}>{s.setup.mode==='team'?i?'파랑':'빨강':name(id)} · {s.submitted.includes(id)?'제출 완료':'입력 중'}</span>)}</div><form onSubmit={e=>{e.preventDefault();void send({action:'club-guess',round:s.round,value:guess});}}><input className="text-field" aria-label="추리 숫자" inputMode="numeric" pattern={`[1-9]{${s.setup.digits}}`} maxLength={s.setup.digits} value={guess} disabled={busy||s.mySubmitted||s.inputter!==meId||!!s.paused?.length} onChange={e=>setGuess(e.target.value.replace(/[^1-9]/g,''))}/><button className="button primary xl" disabled={busy||s.mySubmitted||s.inputter!==meId||guess.length!==s.setup.digits||new Set(guess).size!==guess.length||!!s.paused?.length}>제출</button></form></section>:m&&<>
      {s.matches.length>1&&<nav className="club-match-tabs" aria-label="경기 관전">{s.matches.map(match=><button key={match.id} aria-pressed={match.id===m.id} onClick={()=>{setWatch(match.id);setSelected(null);}}>{match.label}{match.winner!==undefined?' ✓':''}</button>)}</nav>}
      <div className="club-match-info"><span>🔴 {m.sides[0].map(name).join(' · ')}</span><span>🔵 {m.sides[1].map(name).join(' · ')}</span></div>
      <h2 className="club-turn" aria-live="polite">{m.winner!==undefined?`${m.sides[m.winner].map(name).join(' · ')} 승리`:m.draw?'무승부':`${matchSide(m)?'🔵':'🔴'} ${name(matchActor(m))} 차례`}</h2>
      {m.draw&&<div className="club-panel"><p>선공을 바꿔 재경기합니다. {m.replayReady.length}/{m.sides.flat().length}명 준비</p>{m.sides.flat().includes(meId??'')&&<button className="button primary" disabled={busy||m.replayReady.includes(meId??'')} onClick={()=>void send({action:'club-replay-draw',...matchPayload})}>재경기 준비</button>}</div>}
      {s.kind==='gomoku'?<><div className="club-gomoku" role="grid" aria-label="15×15 오목판">{m.board.map((color,i)=><button role="gridcell" key={i} disabled={!canPlay||!!color} aria-label={`${String.fromCharCode(65+i%15)}${Math.floor(i/15)+1}${color?' '+(color===1?'빨강':'파랑'):''}`} aria-selected={selected===i} onClick={()=>setSelected(i)}><span className={`club-stone ${color?'color-'+color:selected===i?'preview-'+(matchSide(m)+1):''}`}/></button>)}</div>{m.winner===undefined&&!m.draw&&<button className="button primary xl" disabled={!canPlay||selected===null} onClick={()=>void send({action:'club-place',...matchPayload,cell:selected})}>착수</button>}</>:<DiscBoard key={m.id+'-'+m.attempt} m={m} obstacles={s.setup.obstacles} canPlay={canPlay} onShot={p=>void send({action:'club-shot',...matchPayload,...p})}/>}
    </>}
    {s.kind==='number-baseball'&&<section className="club-panel"><h3>{s.setup.mode==='team'?'우리 팀 기록':'내 기록'}</h3><div className="club-history">{s.history.map(h=><div key={h.round}><span>{h.round}회</span><b>{h.value}</b><span>{h.strikes===0&&h.balls===0?'OUT':`${h.strikes}S ${h.balls}B`}</span></div>)}</div></section>}
    <p role="alert" className="club-error">{error}</p>{overlays}</main>;
}
