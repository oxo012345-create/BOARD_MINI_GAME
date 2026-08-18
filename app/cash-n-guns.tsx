"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { CashNGunsClientState, CashNGunsLootCard, CashNGunsPhase } from "./api/_lib/cash-n-guns";
export type { CashNGunsClientState } from "./api/_lib/cash-n-guns";

type Player = { id: string; name: string; avatar: string; status: "active" | "waiting" };
type ActionHandler = (payload: Record<string, unknown>) => Promise<unknown>;
type CharacterPose = "idle" | "aim" | "crouch" | "hit" | "dead";
type ModalName = "loot" | "settings" | null;
type DebugAction = "cash-n-guns-debug-step" | "cash-n-guns-debug-auto" | "cash-n-guns-debug-reset" | "cash-n-guns-debug-mutate";
type LootVisual = { kind: CashNGunsLootCard["kind"] | "token"; value?: number };
type FxName = "button" | "select" | "confirm" | "click" | "gun" | "hit" | "loot" | "phase";
const BGM_SOURCE = "https://opengameart.org/sites/default/files/dark_things_loop.mp3";

const PHASE_LABEL: Record<CashNGunsPhase, string> = {
  loot_reveal: "전리품 공개", bullet_select: "탄환 선택", aim: "조준", godfather: "대부의 권한", reaim: "재조준", courage: "결단", resolve: "발포", loot: "예약 분배", game_over: "게임 종료",
};
const SEAT_COORDS: Record<string, { x: number; y: number }> = {
  top: { x: 50, y: 16 }, ul: { x: 20, y: 25 }, ur: { x: 80, y: 25 }, ml: { x: 13, y: 47 }, mr: { x: 87, y: 47 }, ll: { x: 18, y: 69 }, lr: { x: 82, y: 69 }, bottom: { x: 50, y: 81 },
};
const OTHER_SEATS: Record<number, string[]> = {
  0: [], 1: ["top"], 2: ["ml", "mr"], 3: ["top", "ml", "mr"], 4: ["ul", "ur", "ll", "lr"], 5: ["top", "ul", "ur", "ml", "mr"], 6: ["top", "ul", "ur", "ml", "mr", "ll"], 7: ["top", "ul", "ur", "ml", "mr", "ll", "lr"],
};

function timerText(deadline?: number, now = Date.now()) { return deadline ? String(Math.max(0, Math.ceil((deadline - now) / 1000))).padStart(2, "0") : "∞"; }
function paintingScore(count: number) { return [0, 4_000, 12_000, 30_000, 60_000, 100_000, 150_000, 200_000, 300_000, 400_000, 500_000][Math.min(10, count)] ?? 0; }
function playerName(state: CashNGunsClientState, id?: string) { return state.players.find((player) => player.id === id)?.name ?? "알 수 없음"; }
function lootDetail(card: LootVisual & { label?: string }) {
  if (card.kind === "cash") return card.label ?? `$${(card.value ?? 0).toLocaleString()}`;
  if (card.kind === "diamond") return `${card.label ?? "다이아"} · 최다 보너스`;
  if (card.kind === "painting") return "그림 · 모을수록 세트 가치 상승";
  if (card.kind === "medkit") return "구급상자 · 상처 전부 회복";
  if (card.kind === "clip") return "탄창 · BANG 1장 회수";
  return "대부 토큰 · 다음 라운드 대부";
}
function lootCompactLabel(card: LootVisual & { label?: string }) {
  if (card.kind === "cash") return `현금 ($${(card.value ?? 0).toLocaleString()})`;
  if (card.kind === "diamond") return `다이아 ($${(card.value ?? 0).toLocaleString()})`;
  if (card.kind === "painting") return "그림 ($4,000+)";
  if (card.kind === "medkit") return "구급상자";
  if (card.kind === "clip") return "탄창";
  return "대부 토큰";
}

function AimSegments({ from, to, className = "" }: { from: { x: number; y: number }; to: { x: number; y: number }; className?: string }) {
  const middle = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  return <><line x1={from.x} y1={from.y} x2={middle.x} y2={middle.y} markerEnd="url(#cng2-arrow)" className={className} /><line x1={middle.x} y1={middle.y} x2={to.x} y2={to.y} className={className} /></>;
}

function CharacterSprite({ index, pose, facing = "right" }: { index: number; pose: CharacterPose; facing?: "left" | "right" }) {
  const column = { idle: 0, aim: 1, crouch: 2, hit: 3, dead: 4 }[pose];
  return <span className={`cng2-character pose-${pose} face-${facing}`} style={{ backgroundPosition: `${column * 25}% ${(index % 8) * (100 / 7)}%` } as CSSProperties} aria-hidden="true" />;
}
function lootCell(card: LootVisual) {
  if (card.kind === "cash") return card.value === 5_000 ? [0, 0] : card.value === 10_000 ? [1, 0] : [2, 0];
  if (card.kind === "diamond") return (card.value ?? 0) <= 1_000 ? [3, 0] : [4, 0];
  if (card.kind === "painting") return [0, 1];
  if (card.kind === "medkit") return [1, 1];
  if (card.kind === "clip") return [2, 1];
  return [3, 1];
}
function LootSprite({ card, className = "" }: { card: LootVisual; className?: string }) {
  const [column, row] = lootCell(card);
  return <span className={`cng2-loot-sprite ${className}`} style={{ backgroundPosition: `${column * 25}% ${row * 100}%` }} aria-hidden="true" />;
}
function ActionSprite({ index }: { index: number }) {
  const column = index % 4; const row = Math.floor(index / 4);
  return <span className="cng2-action-sprite" style={{ backgroundPosition: `${column * (100 / 3)}% ${row * 100}%` }} aria-hidden="true" />;
}
function PixelModal({ title, subtitle, children, footer, onClose, className = "" }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode; onClose?: () => void; className?: string }) {
  return <div className="cng2-modal-shade" role="presentation"><section className={`cng2-modal ${className}`} role="dialog" aria-modal="true" aria-label={title}><div className="cng2-modal-corners" aria-hidden="true" />{onClose && <button type="button" className="cng2-modal-close" onClick={onClose} aria-label="닫기">×</button>}<header><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</header><div className="cng2-modal-body">{children}</div>{footer && <footer>{footer}</footer>}</section></div>;
}

export function CashNGunsGame({ code, meId, state, isHost, debugMode = false, busy, onAction, onReplay, onLobby, onLeave, overlays }: {
  code: string; players: Player[]; meId?: string; state: CashNGunsClientState; isHost: boolean; debugMode?: boolean; busy: boolean; onAction: ActionHandler; onReplay: () => void; onLobby: () => void; onLeave: () => void; overlays?: ReactNode;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [modal, setModal] = useState<ModalName>(null);
  const [pendingTarget, setPendingTarget] = useState(state.my.pendingAimTargetId ?? "");
  const [pendingCommand, setPendingCommand] = useState("");
  const [reservations, setReservations] = useState(state.my.lootReservationIds ?? []);
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugBusy, setDebugBusy] = useState(false);
  const [debugTarget, setDebugTarget] = useState(meId ?? state.players[0]?.id ?? "");
  const [soundOn, setSoundOn] = useState(true);
  const [bgmOn, setBgmOn] = useState(true);
  const [vibrationOn, setVibrationOn] = useState(true);
  const tickLock = useRef(false);
  const audioRef = useRef<AudioContext | null>(null);
  const bgmRef = useRef<HTMLAudioElement | null>(null);
  const lastFxKey = useRef("");
  const reservationDesiredRef = useRef(state.my.lootReservationIds ?? []);
  const reservationSavingRef = useRef(false);

  const getAudio = () => {
    if (!soundOn || typeof window === "undefined") return null;
    const AudioCtor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return null;
    audioRef.current ??= new AudioCtor();
    if (audioRef.current.state === "suspended") void audioRef.current.resume();
    return audioRef.current;
  };
  const playFx = async (name: FxName) => {
    const context = getAudio(); if (!context) return;
    if (context.state === "suspended") await context.resume().catch(() => undefined);
    if (context.state !== "running") return;
    const t = context.currentTime + .012;
    const tone = (frequency: number, duration: number, gain = .035, type: OscillatorType = "square", delay = 0) => {
      const oscillator = context.createOscillator(); const volume = context.createGain();
      oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, t + delay); volume.gain.setValueAtTime(gain, t + delay); volume.gain.exponentialRampToValueAtTime(.0001, t + delay + duration);
      oscillator.connect(volume).connect(context.destination); oscillator.start(t + delay); oscillator.stop(t + delay + duration);
    };
    const noise = (duration: number, gain: number, delay = 0) => {
      const length = Math.ceil(context.sampleRate * duration); const buffer = context.createBuffer(1, length, context.sampleRate); const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
      const source = context.createBufferSource(); const volume = context.createGain(); const filter = context.createBiquadFilter(); filter.type = "lowpass"; filter.frequency.value = 850;
      source.buffer = buffer; volume.gain.setValueAtTime(gain, t + delay); volume.gain.exponentialRampToValueAtTime(.0001, t + delay + duration); source.connect(filter).connect(volume).connect(context.destination); source.start(t + delay);
    };
    if (name === "button") tone(210, .045, .022);
    if (name === "select") { tone(480, .06, .04); tone(720, .08, .03, "square", .04); }
    if (name === "confirm") { tone(360, .06, .04); tone(620, .12, .045, "square", .05); }
    if (name === "click") { tone(105, .09, .075, "triangle"); noise(.035, .045); }
    if (name === "gun") { noise(.3, .32); tone(68, .34, .2, "sawtooth"); tone(42, .4, .14, "triangle", .025); }
    if (name === "hit") { tone(55, .34, .15, "sawtooth", .08); noise(.2, .13, .08); }
    if (name === "loot") { tone(520, .08, .028); tone(780, .14, .025, "square", .06); }
    if (name === "phase") tone(260, .09, .02, "triangle");
  };

  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 250); return () => window.clearInterval(id); }, []);
  useEffect(() => { setPendingTarget(state.my.pendingAimTargetId ?? ""); setPendingCommand(""); }, [state.phase, state.round, state.my.pendingAimTargetId]);
  useEffect(() => {
    if (reservationSavingRef.current) return;
    const serverReservations = state.my.lootReservationIds ?? [];
    reservationDesiredRef.current = serverReservations;
    setReservations(serverReservations);
  }, [state.my.lootReservationIds]);
  useEffect(() => {
    const audio = bgmRef.current; if (!audio) return;
    audio.volume = .16;
    if (!bgmOn) audio.pause();
  }, [bgmOn]);
  useEffect(() => {
    if (!state.phaseEndsAt || now < state.phaseEndsAt || tickLock.current || state.phase === "game_over") return;
    tickLock.current = true; void onAction({ action: "cash-n-guns-tick" }).finally(() => { tickLock.current = false; });
  }, [now, onAction, state.phase, state.phaseEndsAt]);
  useEffect(() => {
    const key = `${state.round}:${state.phase}:${state.roundOutcome?.woundedIds.join(",") ?? ""}`;
    if (key === lastFxKey.current) return; lastFxKey.current = key;
    if (state.phase === "resolve" && state.roundOutcome) {
      const shots = state.roundOutcome.shots.filter((shot) => shot.result === "bang" || shot.result === "click");
      shots.slice(0, 5).forEach((shot, index) => window.setTimeout(() => { void playFx(shot.result === "bang" ? "gun" : "click"); }, index * 190));
      if (state.roundOutcome.woundedIds.length) window.setTimeout(() => { void playFx("hit"); }, Math.min(760, shots.length * 190));
      if (vibrationOn && navigator.vibrate) navigator.vibrate(state.roundOutcome.woundedIds.length ? [70, 45, 130] : 35);
    } else if (state.phase === "loot") void playFx("loot"); else void playFx("phase");
  }, [state.phase, state.round, state.roundOutcome, vibrationOn]);

  const alivePlayers = state.players.filter((player) => player.alive);
  const me = state.players.find((player) => player.id === meId);
  const myIndex = Math.max(0, state.players.findIndex((player) => player.id === meId));
  const currentLootTurnId = state.lootTurnOrder[state.lootTurnIndex];
  const naturalAim = Boolean(me?.alive && state.my.canAct && (state.phase === "aim" || (state.phase === "reaim" && state.commandTargetId === meId)));
  const naturalGodfather = Boolean(me?.alive && state.phase === "godfather" && state.godfatherId === meId && !state.godfatherCommandUsed);
  const canDebug = Boolean(debugMode && isHost && state.debug?.enabled);
  const myLoot = state.my.loot ?? [];
  const assetTotals = useMemo(() => {
    const cash = myLoot.filter((card) => card.kind === "cash").reduce((sum, card) => sum + (card.value ?? 0), 0);
    const diamondCards = myLoot.filter((card) => card.kind === "diamond"); const diamonds = diamondCards.reduce((sum, card) => sum + (card.value ?? 0), 0);
    const paintings = myLoot.filter((card) => card.kind === "painting").length; const paintingValue = paintingScore(paintings);
    const medkits = myLoot.filter((card) => card.kind === "medkit").length; const clips = myLoot.filter((card) => card.kind === "clip").length;
    return { cash, diamondCards: diamondCards.length, diamonds, paintings, paintingValue, medkits, clips, total: cash + diamonds + paintingValue };
  }, [myLoot]);
  const orderedSeats = useMemo(() => {
    const others = state.players.filter((player) => player.id !== meId); const positions = OTHER_SEATS[others.length] ?? OTHER_SEATS[7];
    const entries = others.map((player, index) => ({ player, seat: positions[index] ?? "top", characterIndex: state.players.findIndex((item) => item.id === player.id) }));
    if (me) entries.push({ player: me, seat: "bottom", characterIndex: myIndex }); return entries;
  }, [me, meId, myIndex, state.players]);
  const seatByPlayer = useMemo(() => Object.fromEntries(orderedSeats.map((entry) => [entry.player.id, entry.seat])), [orderedSeats]);
  const allAimLinesVisible = ["godfather", "courage", "resolve", "loot", "game_over"].includes(state.phase);
  const activeTargetId = naturalGodfather ? pendingCommand : naturalAim ? (pendingTarget || state.my.pendingAimTargetId || "") : "";
  const activeTargetSeat = activeTargetId ? SEAT_COORDS[seatByPlayer[activeTargetId]] : undefined;
  const mySeat = SEAT_COORDS[seatByPlayer[meId ?? ""]];
  const clickCount = state.my.bullets.filter((bullet) => bullet === "click").length; const bangCount = state.my.bullets.filter((bullet) => bullet === "bang").length;
  const act = (payload: Record<string, unknown>) => { if (!busy) void onAction(payload); };
  const runDebug = async (action: DebugAction, extra: Record<string, unknown> = {}) => { if (!canDebug || debugBusy) return; setDebugBusy(true); try { await onAction({ action, debug: true, ...extra }); } finally { setDebugBusy(false); } };
  const playerPose = (player: CashNGunsClientState["players"][number]): CharacterPose => {
    if (!player.alive) return "dead";
    if (state.phase === "resolve" && state.roundOutcome?.woundedIds.includes(player.id)) return "hit";
    if (player.courage === "crouch" || (player.id === meId && state.my.courage === "crouch" && state.phase === "courage")) return "crouch";
    if ((allAimLinesVisible && player.aimTargetId) || (player.id === meId && naturalAim && activeTargetId)) return "aim";
    return "idle";
  };
  const playerFacing = (player: CashNGunsClientState["players"][number], seat: string): "left" | "right" => {
    const from = SEAT_COORDS[seat]; const targetId = player.id === meId && activeTargetId ? activeTargetId : player.aimTargetId;
    const target = targetId ? SEAT_COORDS[seatByPlayer[targetId]] : undefined;
    if (target && target.x !== from?.x) return target.x < from.x ? "left" : "right";
    return (from?.x ?? 50) > 50 ? "left" : "right";
  };
  const isSelectable = (playerId: string) => {
    if (!me?.alive || playerId === meId || !state.players.find((player) => player.id === playerId)?.alive) return false;
    if (naturalGodfather) return true;
    if (!naturalAim) return false;
    return state.phase !== "reaim" || playerId !== state.previousAimTargetId;
  };
  const selectPlayer = (playerId: string) => {
    if (!isSelectable(playerId)) return; void playFx("select");
    if (naturalGodfather) setPendingCommand(playerId);
    else { setPendingTarget(playerId); act({ action: "cash-n-guns-aim-select", targetId: playerId }); }
  };
  const flushReservations = async () => {
    if (reservationSavingRef.current) return;
    reservationSavingRef.current = true;
    try {
      while (state.my.canReserveLoot) {
        const sending = [...reservationDesiredRef.current];
        try {
          await onAction({ action: "cash-n-guns-reserve-loot", reservationIds: sending });
        } catch {
          const serverReservations = state.my.lootReservationIds ?? [];
          reservationDesiredRef.current = serverReservations;
          setReservations(serverReservations);
          break;
        }
        if (sending.join("|") === reservationDesiredRef.current.join("|")) break;
      }
    } finally {
      reservationSavingRef.current = false;
    }
  };
  const saveReservations = (next: string[]) => {
    if (!state.my.canReserveLoot) return;
    reservationDesiredRef.current = next;
    setReservations(next);
    void playFx("select");
    void flushReservations();
  };
  const toggleReservation = (lootId: string) => {
    const current = reservationDesiredRef.current;
    const index = current.indexOf(lootId);
    if (index < 0) { saveReservations([...current, lootId]); return; }
    if (index === 0) { saveReservations(current.slice(1)); return; }
    const next = [...current]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; saveReservations(next);
  };

  const actionFooter = (() => {
    if (!me?.alive) return <div className="cng2-status-action dead">탈락 · 다른 조직원의 결말을 지켜보세요</div>;
    if (state.phase === "bullet_select") return <div className="cng2-split-actions ammo"><button type="button" className={state.my.chosenBullet === "click" ? "selected" : ""} disabled={busy || Boolean(state.my.chosenBullet) || clickCount === 0} onClick={() => act({ action: "cash-n-guns-bullet", bullet: "click" })}><ActionSprite index={0} /><span><b>CLICK</b><small>{clickCount}장</small></span></button><button type="button" className={state.my.chosenBullet === "bang" ? "selected" : ""} disabled={busy || Boolean(state.my.chosenBullet) || bangCount === 0} onClick={() => act({ action: "cash-n-guns-bullet", bullet: "bang" })}><ActionSprite index={1} /><span><b>BANG!</b><small>{bangCount}장</small></span></button></div>;
    if (state.phase === "aim") return state.my.canAct ? <button type="button" className="cng2-wide-action danger" disabled={!activeTargetId || busy} onClick={() => { playFx("confirm"); act({ action: "cash-n-guns-aim", targetId: activeTargetId }); }}>조준 확정 · {activeTargetId ? playerName(state, activeTargetId) : "캐릭터를 터치하세요"}</button> : <div className="cng2-status-action gold">조준 완료 · 다른 플레이어를 기다리는 중</div>;
    if (state.phase === "godfather") return naturalGodfather ? <div className="cng2-split-actions command"><button type="button" onClick={() => act({ action: "cash-n-guns-godfather-pass" })}>사용 안 함</button><button type="button" disabled={!pendingCommand || busy} onClick={() => { playFx("confirm"); act({ action: "cash-n-guns-godfather-command", targetId: pendingCommand }); }}>변경 확정</button></div> : <div className="cng2-status-action gold">{playerName(state, state.godfatherId)}의 판단 대기</div>;
    if (state.phase === "reaim") return naturalAim ? <button type="button" className="cng2-wide-action danger" disabled={!activeTargetId || busy} onClick={() => { playFx("confirm"); act({ action: "cash-n-guns-reaim", targetId: activeTargetId }); }}>새 조준 확정 · {activeTargetId ? playerName(state, activeTargetId) : "캐릭터를 터치하세요"}</button> : <div className="cng2-status-action gold">{playerName(state, state.commandTargetId)}의 재조준 대기</div>;
    if (state.phase === "courage") return <div className="cng2-split-actions courage"><button type="button" className={state.my.courage === "crouch" ? "selected" : ""} disabled={busy || !state.my.canAct} onClick={() => act({ action: "cash-n-guns-courage", courage: "crouch" })}><ActionSprite index={2} /><b>숙인다</b></button><button type="button" className={state.my.courage === "stand" ? "selected" : ""} disabled={busy || !state.my.canAct} onClick={() => act({ action: "cash-n-guns-courage", courage: "stand" })}><ActionSprite index={3} /><b>버틴다</b></button></div>;
    if (state.phase === "loot") return <div className="cng2-status-action turn"><span>예약 드래프트</span><b>{currentLootTurnId ? `${playerName(state, currentLootTurnId)} 차례` : "자동 정산 중"}</b></div>;
    if (state.phase === "game_over") return <div className="cng2-status-action gold">최종 정산 완료</div>;
    return <div className="cng2-status-action">{state.phase === "resolve" ? "총격 결과를 처리하고 있습니다" : "전리품을 눌러 우선순위를 예약하세요"}</div>;
  })();

  return <main className="cng2-shell" onPointerDownCapture={(event) => {
    const audio = bgmRef.current;
    if (bgmOn && audio?.paused) void audio.play().catch(() => undefined);
    if ((event.target as Element).closest("button")) void playFx("button");
  }}><audio ref={bgmRef} src={BGM_SOURCE} loop playsInline preload="auto" aria-hidden="true" /><div className="cng2-game-frame">
    <header className="cng2-hud"><div className="cng2-hud-main"><button type="button" className="cng2-assets-button" onClick={() => setModal("loot")} aria-label={`내 전리품 보기, 현재 가치 ${assetTotals.total.toLocaleString()}달러`}><LootSprite card={{ kind: "cash", value: 10_000 }} /><span><b>${assetTotals.total.toLocaleString()}</b><small>내 전리품 보기 ›</small></span></button><h1>CASH AND GUNS<small>#{code}</small></h1><nav><button type="button" aria-label="설정" onClick={() => setModal("settings")}>⚙</button>{isHost && <button type="button" aria-label="대기실로 이동" onClick={onLobby}>↩</button>}<button type="button" aria-label="나가기" onClick={onLeave}>↗</button></nav></div><div className="cng2-hud-status"><span className="round"><small>ROUND</small><b>{state.round}/{state.totalRounds}</b></span><span className={`timer ${state.phaseEndsAt ? "" : "unlimited"}`}><i /> <b>{timerText(state.phaseEndsAt, now)}</b>{state.phaseEndsAt && <small>초</small>}</span><span className="mode"><small>BASE MODE</small><b>POWER OFF</b></span><span className="godfather"><ActionSprite index={5} /><small>대부</small><b>{playerName(state, state.godfatherId)}</b></span></div></header>
    <section className={`cng2-scene phase-${state.phase} ${naturalAim || naturalGodfather ? "selecting-player" : ""}`} aria-label={`CASH AND GUNS ${PHASE_LABEL[state.phase]}`}><div className="cng2-environment" aria-hidden="true" /><div className="cng2-phase-chip"><span>{PHASE_LABEL[state.phase]}</span><i>{alivePlayers.length}명 생존</i></div>
      <svg className="cng2-aim-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><defs><marker id="cng2-arrow" markerUnits="userSpaceOnUse" markerWidth="3.2" markerHeight="3.2" refX="2.9" refY="1.6" orient="auto"><path d="M0,0 L3.2,1.6 L0,3.2 Z" /></marker></defs>{allAimLinesVisible && state.players.flatMap((player) => { const from = SEAT_COORDS[seatByPlayer[player.id]]; const to = player.aimTargetId ? SEAT_COORDS[seatByPlayer[player.aimTargetId]] : undefined; if (!from || !to || !player.alive) return []; return <g key={`${player.id}-${player.aimTargetId}`}><AimSegments from={from} to={to} className={player.id === meId ? "mine confirmed" : "confirmed"} /><circle className={player.id === meId ? "target-ring mine" : "target-ring"} cx={to.x} cy={to.y} r="2.5" /></g>; })}{activeTargetSeat && mySeat && <g className={naturalGodfather ? "command-line" : "active-line"}><AimSegments from={mySeat} to={activeTargetSeat} /><circle className="target-ring active" cx={activeTargetSeat.x} cy={activeTargetSeat.y} r="3.6" /><circle className="target-dot" cx={activeTargetSeat.x} cy={activeTargetSeat.y} r="1" /></g>}</svg>
      <div className="cng2-loot-rail" aria-label="이번 라운드 전리품">{state.currentLoot.map((card) => { const taken = state.lootTakenIds.includes(card.id); const rank = reservations.indexOf(card.id) + 1; return <button type="button" key={card.id} className={`${taken ? "taken" : ""} ${rank ? "reserved" : ""}`} disabled={taken || !state.my.canReserveLoot} onClick={() => toggleReservation(card.id)} aria-label={`${card.label}${rank ? ` 예약 ${rank}순위` : " 예약하기"}`}><LootSprite card={card} /><span className="loot-info"><b>{lootCompactLabel(card)}</b></span>{rank > 0 && <em>{rank}</em>}</button>; })}{state.newGodfatherAvailable && (() => { const rank = reservations.indexOf("godfather-token") + 1; return <button type="button" className={`token ${rank ? "reserved" : ""}`} disabled={!state.my.canReserveLoot} onClick={() => toggleReservation("godfather-token")} aria-label={`대부 토큰${rank ? ` 예약 ${rank}순위` : " 예약하기"}`}><LootSprite card={{ kind: "token" }} /><span className="loot-info"><b>대부 토큰</b></span>{rank > 0 && <em>{rank}</em>}</button>; })()}</div>
      {state.my.canReserveLoot && <div className="cng2-reservation-bar"><span>{reservations.length ? `예약 ${reservations.length}개` : "전리품을 눌러 예약"}</span><button type="button" disabled={!reservations.length} onClick={() => saveReservations([])}>예약 초기화</button></div>}
      {orderedSeats.map(({ player, seat, characterIndex }) => { const selected = activeTargetId === player.id; const selectable = isSelectable(player.id); return <button type="button" key={player.id} className={`cng2-seat seat-${seat} ${player.id === meId ? "me" : ""} ${player.id === state.godfatherId ? "is-godfather" : ""} ${!player.alive ? "is-dead" : ""} ${selectable ? "selectable" : ""} ${selected ? "target-selected" : ""}`} onClick={() => selectPlayer(player.id)} disabled={!selectable} aria-label={`${player.name}${selectable ? " 선택" : ""}`}><CharacterSprite index={characterIndex} pose={playerPose(player)} facing={playerFacing(player, seat)} />{selected && <span className="cng2-pixel-target" aria-hidden="true">⌖</span>}<span className="cng2-nameplate">{player.id === state.godfatherId && <span className="crown">♛</span>}<b>{player.id === meId ? "나" : player.name}</b><span className="wounds" aria-label={`상처 ${player.wounds}개`}>{[0, 1, 2].map((wound) => <i key={wound} className={wound < player.wounds ? "filled" : ""} />)}</span>{state.phase === "courage" && player.alive && <em className={player.decisionReady ? "ready" : "waiting"}>● {player.decisionReady ? "결정완료" : "결정중…"}</em>}{!player.alive && <em>DEAD</em>}</span></button>; })}
      {state.phase === "resolve" && <div className="cng2-resolution"><b>{state.roundOutcome?.deadIds.length ? `${state.roundOutcome.deadIds.length}명 탈락` : state.roundOutcome?.woundedIds.length ? `${state.roundOutcome.woundedIds.length}명 피격` : "총성은 빗나갔습니다"}</b><span>{(state.roundOutcome?.shots ?? []).filter((shot) => shot.result === "bang" || shot.result === "click").slice(0, 3).map((shot) => `${playerName(state, shot.shooterId)} ${shot.result === "bang" ? "BANG" : "CLICK"}`).join(" · ")}</span></div>}
    </section>
    <footer className="cng2-action-dock">{actionFooter}</footer>{canDebug && <button type="button" className="cng2-debug-fab" onClick={() => setDebugOpen(true)}>DEBUG</button>}

    {modal === "loot" && <PixelModal title="내 전리품" subtitle="상단 금액 버튼을 누르면 언제든 확인할 수 있어요" onClose={() => setModal(null)} className="assets-modal"><div className="cng2-assets-list"><div><LootSprite card={{ kind: "cash", value: 20_000 }} /><span><small>현금</small><b>${assetTotals.cash.toLocaleString()}</b></span></div><div><LootSprite card={{ kind: "diamond", value: 10_000 }} /><span><small>다이아</small><b>{assetTotals.diamondCards}개 · ${assetTotals.diamonds.toLocaleString()}</b><em>단독 최다 보유 시 최종 +$60,000</em></span></div><div><LootSprite card={{ kind: "painting" }} /><span><small>그림 컬렉션</small><b>{assetTotals.paintings}점 · ${assetTotals.paintingValue.toLocaleString()}</b><em>1점 $4,000 · 2점 $12,000 · 3점 $30,000 · 이후 계속 상승</em></span></div></div><div className="cng2-special-assets"><span>구급상자 <b>{assetTotals.medkits}</b></span><span>탄창 <b>{assetTotals.clips}</b></span></div><div className="cng2-total"><small>현재 총 가치</small><b>${assetTotals.total.toLocaleString()}</b></div><p className="cng2-death-warning">☠ 죽으면 승리 불가</p></PixelModal>}
    {modal === "settings" && <PixelModal title="설정" onClose={() => setModal(null)} className="settings-modal"><div className="cng2-settings"><button type="button" onClick={() => { setSoundOn((value) => !value); void playFx("confirm"); }}><span>효과음</span><b>{soundOn ? "ON" : "OFF"}</b></button><button type="button" onClick={() => setBgmOn((value) => { const next = !value; const audio = bgmRef.current; if (audio) { if (next) void audio.play().catch(() => undefined); else audio.pause(); } return next; })}><span>긴장감 BGM</span><b>{bgmOn ? "ON" : "OFF"}</b></button><button type="button" onClick={() => { void playFx("gun"); }}><span>효과음 확인</span><b>TEST</b></button><button type="button" onClick={() => setVibrationOn((value) => !value)}><span>진동</span><b>{vibrationOn ? "ON" : "OFF"}</b></button><small className="cng2-audio-credit">BGM · Dark Things Loop (CC0)</small></div></PixelModal>}
    {state.phase === "game_over" && <PixelModal title={!state.winnerIds?.length ? "전원 탈락" : state.winnerIds.length === 1 ? `${playerName(state, state.winnerIds[0])} 승리` : "공동 승리"} subtitle={state.winnerIds?.length ? "살아남은 조직원 중 가장 많은 자산을 모았습니다" : "승리 조건을 만족한 조직원이 없습니다"} className="result-modal"><div className="cng2-final-list">{(state.finalScores ?? []).sort((a, b) => b.money - a.money).map((score, index) => <div key={score.playerId} className={state.winnerIds?.includes(score.playerId) ? "winner" : ""}><span>{index + 1}</span><b>{playerName(state, score.playerId)}</b><em>{score.alive ? `$${score.money.toLocaleString()}` : "DEAD"}</em></div>)}</div>{isHost && <div className="cng2-result-buttons"><button type="button" onClick={onReplay}>같은 게임 다시하기</button><button type="button" onClick={onLobby}>다른 게임 하러가기</button></div>}</PixelModal>}

    {debugOpen && canDebug && <div className="cng2-debug-shade"><aside className="cng2-debug-panel"><header><div><small>SOLO TEST LAB</small><b>DEBUG CONTROL</b></div><button type="button" onClick={() => setDebugOpen(false)}>×</button></header><div className="cng2-debug-summary"><span>PHASE <b>{state.phase}</b></span><span>ROUND <b>{state.round}/8</b></span><span>BOT <b>{state.debug?.botIds.length ?? 0}</b></span><span>AUTO <b>{state.debug?.botAuto ? "ON" : "OFF"}</b></span></div><section><h3>진행</h3><div className="cng2-debug-buttons three"><button disabled={debugBusy} onClick={() => void runDebug("cash-n-guns-debug-step")}>다음 단계</button><button disabled={debugBusy} onClick={() => void runDebug("cash-n-guns-debug-auto")}>8R AUTO</button><button disabled={debugBusy} onClick={() => void runDebug("cash-n-guns-debug-reset")}>초기화</button></div></section><section><h3>단계 이동</h3><div className="cng2-debug-buttons phase">{Object.entries(PHASE_LABEL).map(([phase, label]) => <button key={phase} className={state.phase === phase ? "active" : ""} onClick={() => void runDebug("cash-n-guns-debug-mutate", { command: "phase", phase })}>{label}</button>)}</div></section><section><h3>플레이어 상태</h3><select value={debugTarget} onChange={(event) => setDebugTarget(event.target.value)}>{state.players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select><div className="cng2-debug-buttons three"><button onClick={() => void runDebug("cash-n-guns-debug-mutate", { command: "wound", targetId: debugTarget, delta: 1 })}>상처 +1</button><button onClick={() => void runDebug("cash-n-guns-debug-mutate", { command: "wound", targetId: debugTarget, delta: -1 })}>상처 -1</button><button onClick={() => void runDebug("cash-n-guns-debug-mutate", { command: "godfather", targetId: debugTarget })}>대부 지정</button><button onClick={() => void runDebug("cash-n-guns-debug-mutate", { command: "kill", targetId: debugTarget })}>죽이기</button><button onClick={() => void runDebug("cash-n-guns-debug-mutate", { command: "revive", targetId: debugTarget })}>부활</button><button onClick={() => void runDebug("cash-n-guns-debug-mutate", { command: "bot-auto", enabled: !state.debug?.botAuto })}>BOT {state.debug?.botAuto ? "OFF" : "ON"}</button></div></section><section><h3>행동 강제</h3><div className="cng2-debug-buttons three"><button onClick={() => void runDebug("cash-n-guns-debug-mutate", { command: "bullet", targetId: debugTarget, bullet: "bang" })}>BANG</button><button onClick={() => void runDebug("cash-n-guns-debug-mutate", { command: "bullet", targetId: debugTarget, bullet: "click" })}>CLICK</button><button onClick={() => void runDebug("cash-n-guns-debug-mutate", { command: "courage", targetId: debugTarget, courage: "crouch" })}>숙임</button><button onClick={() => void runDebug("cash-n-guns-debug-mutate", { command: "courage", targetId: debugTarget, courage: "stand" })}>버팀</button><button onClick={() => void runDebug("cash-n-guns-debug-mutate", { command: "loot-add" })}>Loot +</button><button onClick={() => void runDebug("cash-n-guns-debug-mutate", { command: "loot-remove" })}>Loot -</button></div></section><section><h3>화면 검수</h3><div className="cng2-debug-buttons three"><button onClick={() => { setDebugOpen(false); setModal("loot"); }}>ASSETS</button><button onClick={() => { setDebugOpen(false); setModal("settings"); }}>SETTINGS</button></div></section></aside></div>}
  </div>{overlays}</main>;
}
