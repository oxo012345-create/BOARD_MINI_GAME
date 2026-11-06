'use client';
import { useRef, useState, type ReactNode } from 'react';
import { defaultClubSetup, matchActor, matchSide, type ClubId, type ClubSetup, type ClubView, type Match } from './api/_lib/club';
import { renjuMove } from './api/_lib/renju';
import { ClubBoard } from './club-board';
import { ClubSheet } from './club-sheet';
import { StoneSound } from './club-stone-sound';
import { ClubBaseball, BaseballBriefing } from './club-baseball';
import './club-games.css';
type Player = {id:string;name:string};
type Action = (p:Record<string,unknown>)=>Promise<unknown>;
export function ClubBriefing({kind,setup,players,isHost,onAction,onStart,topBar,overlays}:{kind:ClubId;setup?:ClubSetup;players:Player[];isHost:boolean;onAction:Action;onStart:()=>void;topBar:ReactNode;overlays:ReactNode}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const s=setup??defaultClubSetup(kind,players.length);
  if(kind==='number-baseball')return <BaseballBriefing setup={setup} players={players} isHost={isHost} onAction={onAction} onStart={onStart} topBar={topBar} overlays={overlays}/>;
  const required=s.mode==='duel'?2:4;
  async function update(p:Partial<ClubSetup>){setBusy(true);try{await onAction({action:'club-settings',clubSetup:{...s,...p}});}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <main className="app-shell club-shell club-fullscreen club-setup">{topBar}<section className="club-panel"><h2>모드</h2><div className="club-options">{[['duel','1대1'],...([['tournament','4인 토너먼트'],['team','2대2 팀전']])].map(([mode,label])=><button key={mode} disabled={!isHost||busy||(mode==='duel'&&players.length!==2)} aria-pressed={s.mode===mode} onClick={()=>void update({mode:mode as ClubSetup['mode']})}>{label}</button>)}</div>
  {players.length!==2&&<p>1대1은 정확히 2명일 때 선택할 수 있어요.</p>}
  {s.mode==='team'&&<><h3>팀 편성</h3><div className="club-options"><button disabled={!isHost||busy} aria-pressed={!s.redIds} onClick={()=>void update({redIds:undefined})}>랜덤</button><button disabled={!isHost||busy||players.length!==4} aria-pressed={!!s.redIds} onClick={()=>void update({redIds:players.slice(0,2).map(p=>p.id)})}>직접</button></div>{s.redIds&&<div className="club-teams">{players.map(p=><label key={p.id}><input type="checkbox" checked={s.redIds!.includes(p.id)} disabled={!isHost||busy} onChange={()=>void update({redIds:s.redIds!.includes(p.id)?s.redIds!.filter(id=>id!==p.id):[...s.redIds!,p.id].slice(-2)})}/>{p.name} · {s.redIds!.includes(p.id)?'흑 팀':'백 팀'}</label>)}</div>}</>}
  {kind==='alkkagi'&&<><h3>장애물</h3><button className="club-toggle" aria-pressed={s.obstacles} disabled={!isHost||busy} onClick={()=>void update({obstacles:!s.obstacles})}>장애물 {s.obstacles?'ON':'OFF'}</button></>}
  {s.mode==='tournament'&&<p>준결승 2경기 → 결승 · 3·4위전</p>}
  {kind==='gomoku'&&<p>렌주룰 · 흑은 중앙에서 시작 · 삼삼·사사·장목 금수 · 흑 5목 / 백 5목 이상 승리</p>}
  {kind==='alkkagi'&&<p>우리 돌을 뒤로 당겼다 놓으세요. 중심이 판 밖으로 나가면 탈락합니다.</p>}
  {s.mode==='team'&&<p>흑1 → 백1 → 흑2 → 백2</p>}
  <p role="alert">{error}</p><p>{players.length}/{required}명</p>{isHost?<button className="button primary xl" disabled={busy||players.length!==required||(s.mode==='team'&&!!s.redIds&&s.redIds.length!==2)} onClick={onStart}>게임 시작</button>:<p>방장이 시작하기를 기다리는 중</p>}</section>{overlays}</main>;
}
export function ClubGame({s,players,meId,isHost,onAction,onReplay,onLobby,topBar,overlays}:{s:ClubView;players:Player[];meId?:string;isHost:boolean;onAction:Action;onReplay:()=>void;onLobby:()=>void;topBar:ReactNode;overlays:ReactNode}) {
 const [selected,setSelected]=useState<number|null>(null),[watch,setWatch]=useState(''),[busy,setBusy]=useState(false),[moving,setMoving]=useState(false),[error,setError]=useState('');
 const lock=useRef(false);
 const [resultOpen,setResultOpen]=useState(false),[placement,setPlacement]=useState<{matchId:string;attempt:number;turn:number;cell:number;color:number}|null>(null);
 const name=(id?:string)=>players.find(p=>p.id===id)?.name??'참가자';
 const own=s.matches.find(m=>m.sides.flat().includes(meId??'')&&m.winner===undefined&&!m.draw)??s.matches.findLast(m=>m.sides.flat().includes(meId??''));
 const m=s.matches.find(m=>m.id===watch)??own??s.matches[0];
 const shownMatch=m&&placement&&placement.matchId===m.id&&placement.attempt===m.attempt&&placement.turn===m.turn?{...m,board:m.board.map((v,i)=>i===placement.cell?placement.color:v),lastMove:placement.cell}:m;
 const canPlay=!!m&&!busy&&!moving&&!s.finished&&!s.paused?.length&&!m.draw&&m.winner===undefined&&matchActor(m)===meId;
 async function send(p:Record<string,unknown>){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{const result=await onAction({clubId:s.id,requestId:crypto.randomUUID(),...p});setSelected(null);return result;}catch(e){setError((e as Error).message);}finally{setPlacement(null);setBusy(false);lock.current=false;}}
 const matchPayload=m?{matchId:m.id,turn:m.turn,attempt:m.attempt}:{};
 return <main className={`app-shell club-shell club-fullscreen ${s.kind}`} >{topBar}{s.kind!=='number-baseball'&&<div className="club-mode">{s.setup.mode==='duel'?'1대1':s.setup.mode==='team'?'2대2 팀전':'4인 토너먼트'}</div>}
 {!!s.paused?.length&&<p className="club-paused">{s.paused.map(name).join(' · ')} 복귀 대기</p>}
 {s.kind==='number-baseball'?<ClubBaseball key={s.id} s={s} name={name} meId={meId} busy={busy} isHost={isHost} onReplay={onReplay} onLobby={onLobby} onSecret={value=>void send({action:'club-secret',value})} onGuess={value=>void send({action:'club-guess',round:s.round,turn:s.baseball?.turn,value})}/>:m&&<>
 {s.matches.length>1&&<nav className="club-match-tabs" aria-label="경기 관전">{s.matches.map(match=><button key={match.id} aria-pressed={match.id===m.id} onClick={()=>{setWatch(match.id);setSelected(null);}}>{match.label}{match.winner!==undefined?' ✓':''}</button>)}</nav>}
 <section className={`club-panel club-play-panel ${s.kind}`}><div className="club-panel-heading"><h2>{s.kind==='gomoku'?'오목':'알까기'}</h2>{s.kind==='gomoku'&&<StoneSound gameId={s.id} matchId={m.id} attempt={m.attempt} turn={m.turn}/>}<span>{s.kind==='gomoku'?'렌주룰 · 15 × 15':`5알 대전${s.setup.obstacles?' · 장애물 ON':''}`}</span></div>
 <div className="club-players">{m.sides.map((ids,side)=><div key={side} className={`club-player ${!s.finished&&m.winner===undefined&&!m.draw&&matchSide(m)===side?'current':''}`}><i className={`club-avatar ${side?'white':'black'}`}/><div><b>{ids.map(name).join(' · ')}</b><small>{side?'백돌':'흑돌'}{ids.includes(meId??'')?' · 나':''}</small></div>{s.kind==='alkkagi'&&<span>{m.discs.filter(d=>d.alive&&d.side===side).length}알</span>}</div>)}</div>
 <ClubBoard key={s.id+'-'+m.id+'-'+m.attempt} kind={s.kind} m={shownMatch!} sampledAt={s.sampledAt} canPlay={canPlay} obstacles={s.setup.obstacles} selected={selected} onSelect={setSelected} onMotion={setMoving} onShot={async p=>{const result=await send({action:'club-shot',...matchPayload,...p}) as {game?:{club?:ClubView}}|undefined;return result?.game?.club?.matches.find((match:Match)=>match.id===m.id)??null;}}/>
 <div className="club-status" aria-live="polite"><i/><div><b>{s.kind==='gomoku'&&busy?'착수 확인 중':moving?'발사 진행 중':m.winner!==undefined?`${m.sides[m.winner].map(name).join(' · ')} 승리`:m.draw?'무승부':`${name(matchActor(m))} 차례`}</b><small>{moving?'돌이 멈추고 결과가 확인되면 다음 차례로 넘어갑니다.':m.winner!==undefined?(s.kind==='gomoku'?`${m.winner===0?'흑 5목':'백 5목 이상'} 완성 · 붉은 연결선을 확인하세요.`:'상대 돌이 모두 판 밖으로 나갔어요.'):s.kind==='gomoku'?'놓을 곳을 선택하고, 착수 버튼을 누르세요.':'내 돌을 누른 뒤, 쏘고 싶은 방향의 반대로 당기세요.'}</small></div></div>
 {s.kind==='gomoku'&&m.winner===undefined&&!m.draw&&<button className="button primary xl" disabled={!canPlay||selected===null||!renjuMove(m.board,selected,matchSide(m)+1).legal} onClick={()=>{if(selected===null||!canPlay)return;setPlacement({matchId:m.id,attempt:m.attempt,turn:m.turn,cell:selected,color:matchSide(m)+1});void send({action:'club-place',...matchPayload,cell:selected});}}>착수</button>}
 {m.draw&&!moving&&<div className="club-draw"><p>선공을 바꿔 재경기합니다. {m.replayReady.length}/{m.sides.flat().length}명 준비</p>{m.sides.flat().includes(meId??'')&&<button className="button primary" disabled={busy||m.replayReady.includes(meId??'')} onClick={()=>void send({action:'club-replay-draw',...matchPayload})}>재경기 준비</button>}</div>}
 </section></>}
 {s.finished&&!moving&&s.kind!=='number-baseball'&&<section className="club-result-inline" aria-label="경기 결과"><div><span>우승</span><strong>{s.ranking[0]?.map(name).join(' · ')}</strong><button onClick={()=>setResultOpen(true)}>전체 순위</button></div>{isHost&&<div className="club-result-actions"><button onClick={onReplay}>재대결</button><button onClick={onLobby}>로비</button></div>}</section>}
 {resultOpen&&<ClubSheet title="전체 순위" onClose={()=>setResultOpen(false)}><div className="club-ranking">{s.ranking.map((ids,i)=><p key={i}><b>{i+1}위</b> {ids.map(name).join(' · ')}</p>)}</div></ClubSheet>}
 <p role="alert" className="club-error">{error}</p>{overlays}</main>;
}
