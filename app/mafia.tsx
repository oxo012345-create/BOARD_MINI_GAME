"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { MafiaClientState, MafiaRole } from "./api/_lib/mafia";
import "./mafia.css";

type ActionHandler = (payload: Record<string, unknown>) => Promise<unknown>;

const ROLE_LABEL: Record<MafiaRole, string> = { citizen: "시민", mafia: "마피아", police: "경찰", doctor: "의사" };
function timerText(deadline: number | undefined, now: number) {
  return deadline ? String(Math.max(0, Math.ceil((deadline - now) / 1000))).padStart(2, "0") : "∞";
}

function nameOf(players: Array<{ id: string; name: string }>, id?: string) {
  return players.find((player) => player.id === id)?.name ?? "누군가";
}

export function MafiaGame({ code, meId, state, clockOffsetMs, isHost, busy, onAction, onReplay, onLobby, onLeave, overlays }: {
  code: string; meId?: string; state: MafiaClientState; clockOffsetMs: number; isHost: boolean; busy: boolean; onAction: ActionHandler; onReplay: () => void; onLobby: () => void; onLeave: () => void; overlays?: ReactNode;
}) {
  const [now, setNow] = useState(() => Date.now() + clockOffsetMs);
  const [roleVisible, setRoleVisible] = useState(false);
  const draftKey = `${state.day}:${state.phase}`;
  const [targetDraft, setTargetDraft] = useState({ key: draftKey, value: state.my.selectedTarget ?? "" });
  const [voteDraft, setVoteDraft] = useState({ key: draftKey, value: state.my.vote ?? "" });
  const [working, setWorking] = useState(false);
  const roleTouchRevealRef = useRef(false);
  const dayBgm = useRef<HTMLAudioElement>(null);
  const nightBgm = useRef<HTMLAudioElement>(null);
  const gunshot = useRef<HTMLAudioElement>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const previousPhase = useRef(state.phase);
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now() + clockOffsetMs), 250); return () => window.clearInterval(id); }, [clockOffsetMs]);
  useEffect(() => {
    if (!roleVisible || !roleTouchRevealRef.current) return;
    const releaseRole = () => { roleTouchRevealRef.current = false; setRoleVisible(false); };
    window.addEventListener("touchend", releaseRole, { passive: true });
    window.addEventListener("touchcancel", releaseRole, { passive: true });
    return () => { window.removeEventListener("touchend", releaseRole); window.removeEventListener("touchcancel", releaseRole); };
  }, [roleVisible]);
  useEffect(() => {
    const day = dayBgm.current; const night = nightBgm.current;
    if (!day || !night) return;
    day.pause(); night.pause();
    const track = state.phase === "night" || state.phase === "role_reveal" ? night : day;
    track.currentTime = track.currentTime || 0;
    void track.play().catch(() => undefined);
  }, [state.phase]);
  const playSfx = (frequency = 520, duration = 0.06) => {
    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    const context = audioContext.current ?? (audioContext.current = new AudioContextCtor());
    void context.resume();
    const oscillator = context.createOscillator(); const gain = context.createGain();
    oscillator.frequency.value = frequency; oscillator.type = "sine"; gain.gain.setValueAtTime(0.04, context.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
    oscillator.connect(gain).connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + duration);
  };
  useEffect(() => {
    if (previousPhase.current === state.phase) return;
    if (state.phase === "day_reveal" && state.nightResult?.victimId) {
      const shot = gunshot.current;
      if (shot) { shot.currentTime = 0; void shot.play().catch(() => undefined); }
    }
    playSfx(state.phase === "night" ? 180 : 680, 0.14);
    previousPhase.current = state.phase;
  }, [state.phase, state.nightResult?.victimId]);
  const target = targetDraft.key === draftKey ? targetDraft.value : state.my.selectedTarget ?? "";
  const voteTarget = voteDraft.key === draftKey ? voteDraft.value : state.my.vote ?? "";
  const setTarget = (value: string) => setTargetDraft({ key: draftKey, value });
  const setVoteTarget = (value: string) => setVoteDraft({ key: draftKey, value });
  const alive = useMemo(() => state.participants.filter((player) => player.alive), [state.participants]);
  const run = async (payload: Record<string, unknown>) => { if (working) return; playSfx(); setWorking(true); try { await onAction(payload); } finally { setWorking(false); } };
  const phaseTitle = state.phase === "role_reveal" ? "역할 확인" : state.phase === "night" ? `${state.day}일차 · 밤` : state.phase === "day_reveal" ? "아침" : state.phase === "discussion" ? `${state.day}일차 · 토론` : state.phase === "vote" ? `${state.day}일차 · 익명 투표` : state.phase === "defense" ? "최후의 변론" : state.phase === "verdict" ? "생사 투표" : state.phase === "execution" ? "결과" : "게임 종료";
  const isNight = state.phase === "night" || state.phase === "role_reveal";
  const isDead = !state.my.alive && state.phase !== "game_over";
  return <main className={`mafia-shell ${isNight ? "mafia-night" : "mafia-day"}`}>
    <audio ref={dayBgm} src="/mafia/day-bgm.mp3" loop preload="auto" aria-hidden="true" />
    <audio ref={nightBgm} src="/mafia/night-bgm.mp3" loop preload="auto" aria-hidden="true" />
    <audio ref={gunshot} src="/mafia/gunshot.ogg" preload="auto" aria-hidden="true" />
    <header className="mafia-topbar"><span className="mafia-code">● {code}</span><h1>오리지널 마피아</h1><nav>{isHost && <button type="button" onClick={onLobby}>대기실</button>}<button type="button" onClick={onLeave}>나가기</button></nav></header>
    <section className="mafia-status"><span>DAY {state.day}</span><strong>{phaseTitle}</strong>{state.phaseEndsAt && <b className="mafia-timer">{timerText(state.phaseEndsAt, now)}</b>}</section>
    <section className="mafia-board">
      {state.phase === "role_reveal" && <section className="mafia-card role-card"><h2>내 역할 확인</h2><button type="button" className={`mafia-role-secret ${roleVisible ? "revealed" : ""}`} draggable={false} aria-pressed={roleVisible} onPointerDown={(event) => { roleTouchRevealRef.current = event.pointerType === "touch"; setRoleVisible(true); }} onPointerUp={(event) => { if (event.pointerType === "touch") return; setRoleVisible(false); }} onPointerCancel={(event) => { if (event.pointerType === "touch") return; setRoleVisible(false); }} onPointerLeave={(event) => { if (event.pointerType === "touch") return; setRoleVisible(false); }} onKeyDown={(event) => { if (event.key !== " " && event.key !== "Enter") return; event.preventDefault(); setRoleVisible(true); }} onKeyUp={(event) => { if (event.key !== " " && event.key !== "Enter") return; event.preventDefault(); setRoleVisible(false); }} onDragStart={(event) => event.preventDefault()} onBlur={() => setRoleVisible(false)} onContextMenu={(event) => event.preventDefault()}>{roleVisible ? <strong>{ROLE_LABEL[state.my.role]}</strong> : <strong>누르고 있기</strong>}</button><button type="button" className="mafia-primary" disabled={working || state.my.roleReady} onClick={() => void run({ action: "mafia-ready" })}>확인 완료</button><small>{state.roleReadyCount}/{state.participants.length}명 확인</small></section>}
      {state.phase === "night" && <section className="mafia-card night-card"><h2>밤 행동</h2>{isDead ? <div className="mafia-wait">사망</div> : state.my.nightSubmitted ? <div className="mafia-wait"><strong>완료</strong></div> : <><div className="mafia-target-grid">{alive.filter((player) => player.id !== meId).map((player) => <button type="button" key={player.id} className={target === player.id ? "selected" : ""} onClick={() => setTarget(player.id)}><span>{player.avatar}</span><b>{player.name}</b></button>)}</div><div className="mafia-choice-actions"><button type="button" className="mafia-secondary" disabled={working || busy} onClick={() => void run({ action: "mafia-night" })}>선택 없음</button><button type="button" className="mafia-primary" disabled={!target || working || busy} onClick={() => void run({ action: "mafia-night", targetId: target })}>확정</button></div></>}</section>}
      {state.phase === "day_reveal" && <section className="mafia-card result-card"><small>DAWN REPORT</small><h2>{state.nightResult?.quiet ? "조용한 밤" : "밤사이 사건 발생"}</h2><strong>{state.nightResult?.message}</strong>{state.nightResult?.victimId && <p className="mafia-victim">{nameOf(state.participants, state.nightResult.victimId)}님이 사망했습니다.</p>}{state.my.investigation && <div className="mafia-private-result">경찰 수사 결과 · {nameOf(state.participants, state.my.investigation.targetId)}은(는) {state.my.investigation.isMafia ? "마피아" : "마피아가 아닙니다"}.</div>}</section>}
      {state.phase === "discussion" && <section className="mafia-card discussion-card"><h2>토론</h2><div className="mafia-player-list">{state.participants.map((player) => <span className={!player.alive ? "dead" : ""} key={player.id}><i />{player.name}{!player.alive && <small>사망</small>}</span>)}</div><button className="mafia-secondary shorten-button" disabled={state.my.discussionShortened || busy || working} onClick={() => void run({ action: "mafia-shorten-discussion" })}>토론 -10초 <small>{state.discussionShortenCount}명 사용</small></button></section>}
      {state.phase === "vote" && <section className="mafia-card vote-card"><h2>익명 투표</h2>{isDead ? <div className="mafia-wait">사망</div> : state.my.vote ? <div className="mafia-wait"><strong>투표 완료</strong></div> : <><div className="mafia-target-grid vote-grid">{alive.filter((player) => player.id !== meId).map((player) => <button type="button" key={player.id} className={voteTarget === player.id ? "selected" : ""} onClick={() => setVoteTarget(player.id)}><span>{player.avatar}</span><b>{player.name}</b></button>)}</div><div className="mafia-choice-actions"><button type="button" className={`mafia-secondary ${voteTarget === "abstain" ? "selected" : ""}`} onClick={() => setVoteTarget("abstain")}>기권</button><button type="button" className="mafia-primary" disabled={!voteTarget || working || busy} onClick={() => void run({ action: "mafia-vote", targetId: voteTarget })}>확정</button></div><button className="mafia-secondary shorten-button" disabled={state.my.voteShortened || busy || working} onClick={() => void run({ action: "mafia-shorten-vote" })}>투표 -10초 <small>{state.voteShortenCount}명 사용</small></button></>}</section>}
      {state.phase === "defense" && <section className="mafia-card defense-card"><h2>최후의 변론</h2><strong>{nameOf(state.participants, state.defensePlayerId)}</strong><p>변론을 들은 뒤 생사를 결정하세요.</p></section>}
      {state.phase === "verdict" && <section className="mafia-card verdict-card"><h2>{nameOf(state.participants, state.defensePlayerId)}의 생사</h2>{isDead ? <div className="mafia-wait">사망</div> : state.my.verdict ? <div className="mafia-wait"><strong>투표 완료</strong></div> : <div className="mafia-choice-actions"><button className="mafia-secondary" onClick={() => void run({ action: "mafia-verdict", choice: "spare" })}>살린다</button><button className="mafia-primary danger" onClick={() => void run({ action: "mafia-verdict", choice: "execute" })}>처형한다</button></div>}</section>}
      {state.phase === "execution" && <section className="mafia-card result-card"><h2>{state.execution?.playerId ? "결과" : "처형 없음"}</h2><strong>{state.execution?.message}</strong></section>}
      {state.phase === "game_over" && <section className="mafia-card result-card game-over"><small>GAME OVER</small><h2>{state.winner === "mafia" ? "마피아 팀 승리" : "시민 팀 승리"}</h2><div className="mafia-final-list">{state.participants.map((player) => <span key={player.id}><b>{player.name}</b><em>{ROLE_LABEL[state.finalRoles?.[player.id] ?? "citizen"]}</em></span>)}</div>{isHost && <div className="mafia-choice-actions"><button className="mafia-secondary" onClick={onLobby}>다른 게임</button><button className="mafia-primary" onClick={onReplay}>같은 게임 다시하기</button></div>}</section>}
    </section>
    {isDead && <div className="mafia-dead-banner">사망했습니다</div>}
    <footer className="mafia-footer"><span>{state.phase === "night" ? `${state.nightSubmittedCount}/${alive.length}` : state.phase === "vote" ? `${state.voteSubmittedCount}/${alive.length}` : state.phase === "verdict" ? `${state.verdictSubmittedCount}/${alive.length}` : ""}</span></footer>{overlays}
  </main>;
}
