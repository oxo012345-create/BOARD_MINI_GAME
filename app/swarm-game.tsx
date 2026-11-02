"use client";
import {useEffect,useRef,useState,type ReactNode} from 'react';
import './swarm-game.css';

export type SwarmMode='duel'|'team'|'ffa';
export type SwarmRound={mode:SwarmMode;matchId?:string;playerIds?:string[]};
type Player={id:string;name:string};
const MODES:Array<{id:SwarmMode;label:string;count:number}>=[{id:'duel',label:'1대1',count:2},{id:'team',label:'2대2 팀전',count:4},{id:'ffa',label:'4인 개인전',count:4}];

function SwarmFrame({src,matchId,onExit,practice=false,overlays}:{src:string;matchId?:string;onExit:()=>void;practice?:boolean;overlays?:ReactNode}){
 const iframe=useRef<HTMLIFrameElement>(null);
 useEffect(()=>{const receive=(event:MessageEvent)=>{if(event.origin!==location.origin||event.source!==iframe.current?.contentWindow||event.data?.type!=='hanpan-swarm-exit'||(event.data.matchId??null)!==(matchId??null))return;onExit();};window.addEventListener('message',receive);return()=>window.removeEventListener('message',receive);},[matchId,onExit]);
 return <main className={`swarm-shell${practice?' swarm-practice':''}`}>
  {practice&&<nav className="swarm-practice-nav"><button onClick={onExit}>‹ 돌아가기</button><span>AI 연습</span></nav>}
  <iframe ref={iframe} className="swarm-game-frame" title="군단 땅따먹기 전장" src={src} allow="autoplay" />
  {overlays}
 </main>;
}

export function SwarmBriefing({round,players,isHost,busy,onAction,onStart,topBar,overlays}:{round?:SwarmRound;players:Player[];isHost:boolean;busy:boolean;onAction:(payload:Record<string,unknown>)=>Promise<unknown>;onStart:()=>void;topBar:ReactNode;overlays:ReactNode}){
 const [practice,setPractice]=useState(false),[setting,setSetting]=useState(false),[error,setError]=useState('');
 const selected=round?.mode??(players.length===2?'duel':'ffa'),mode=MODES.find(m=>m.id===selected)!;
 if(practice)return <SwarmFrame src={`/swarm/index.html?mode=${selected}`} practice onExit={()=>setPractice(false)} overlays={overlays}/>;
 async function change(value:SwarmMode){setSetting(true);setError('');try{await onAction({action:'swarm-settings',swarmMode:value});}catch(e){setError(e instanceof Error?e.message:'설정을 공유하지 못했어요.');}finally{setSetting(false);}}
 return <main className="app-shell swarm-briefing">{topBar}<section className="panel"><p className="eyebrow">실시간 땅따먹기</p><h1 className="panel-title">군단 땅따먹기</h1>
  <div className="swarm-mode-options" aria-label="군단 대전 모드">{MODES.map(m=><button key={m.id} aria-pressed={selected===m.id} disabled={!isHost||busy||setting||players.length!==m.count} onClick={()=>void change(m.id)}><strong>{m.label}</strong><small>{m.count}명</small></button>)}</div>
  <p className="swarm-player-note" role="status">{players.length===mode.count?`${players.length}명 · ${mode.label}`:`현재 ${players.length}명 · ${mode.label}은 ${mode.count}명이 필요해요.`}</p>
  <div className="swarm-roster">{players.map((p,i)=><span key={p.id}><i style={{background:['#65cfb5','#ed8b99','#36aaa9','#cf638d'][i%4]}}/>{p.name}{selected==='team'&&players.length===4?<small>{i%2?'2팀':'1팀'}</small>:null}</span>)}</div>
  <div className="swarm-rules"><article><b>◈ → ◉</b><strong>병력 이동</strong><span>전군·절반 선택 → 목적지 터치</span></article><article><b>◆ 250 → ▦</b><strong>땅 점령</strong><span>점령 선택 → 빈 구역 터치</span></article><article><b>⚔ → ◆</b><strong>미네랄 획득</strong><span>적 병력 처치·성큰 파괴</span></article><article><b>▦ + ◈ = 0</b><strong>승리 조건</strong><span>적의 거점과 병력을 모두 제거</span></article></div>
  {error&&<p className="swarm-player-note" role="alert">{error}</p>}
  <button className="button secondary swarm-practice-button" onClick={()=>setPractice(true)}>AI와 연습</button>
 </section><div className="sticky-action">{isHost?<button className="button primary xl" disabled={busy||setting||players.length!==mode.count} onClick={onStart}>전투 시작</button>:<div className="waiting"><span className="pulse"/>방장이 시작하기를 기다리는 중</div>}</div>{overlays}</main>;
}

export function SwarmGame({room,round,onExit,overlays}:{room:string;round:SwarmRound;onExit:()=>void;overlays:ReactNode}){
 return <SwarmFrame src={`/swarm/hanpan.html?room=${room}&match=${encodeURIComponent(round.matchId||'')}`} matchId={round.matchId} onExit={onExit} overlays={overlays}/>;
}
