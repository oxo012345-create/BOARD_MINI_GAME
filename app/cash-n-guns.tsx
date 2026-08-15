"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { CashNGunsClientState, CashNGunsLootCard, CashNGunsPhase } from "./api/_lib/cash-n-guns";
export type { CashNGunsClientState } from "./api/_lib/cash-n-guns";

type Player = { id: string; name: string; avatar: string; status: "active" | "waiting" };
type ActionHandler = (payload: Record<string, unknown>) => Promise<unknown>;
type CharacterPose = "idle" | "aim" | "crouch" | "hit" | "dead";
type ModalName = "aim" | "godfather" | "loot" | "settings" | null;
type DebugAction = "cash-n-guns-debug-step" | "cash-n-guns-debug-auto" | "cash-n-guns-debug-reset" | "cash-n-guns-debug-mutate";
type LootVisual = { kind: CashNGunsLootCard["kind"] | "token"; value?: number };

const PHASE_LABEL: Record<CashNGunsPhase, string> = {
  loot_reveal: "전리품 공개", bullet_select: "탄환 선택", aim: "목표 선택", godfather: "대부의 권한", reaim: "목표 변경", courage: "결단", resolve: "발포", loot: "전리품 분배", game_over: "게임 종료",
};

const SEAT_COORDS: Record<string, { x: number; y: number }> = {
  top: { x: 50, y: 17 }, ul: { x: 20, y: 25 }, ur: { x: 80, y: 25 }, ml: { x: 13, y: 47 }, mr: { x: 87, y: 47 }, ll: { x: 18, y: 69 }, lr: { x: 82, y: 69 }, bottom: { x: 50, y: 79 },
};

const OTHER_SEATS: Record<number, string[]> = {
  0: [], 1: ["top"], 2: ["ml", "mr"], 3: ["top", "ml", "mr"], 4: ["ul", "ur", "ll", "lr"], 5: ["top", "ul", "ur", "ml", "mr"], 6: ["top", "ul", "ur", "ml", "mr", "ll"], 7: ["top", "ul", "ur", "ml", "mr", "ll", "lr"],
};

function timerText(deadline?: number, now = Date.now()) { return deadline ? String(Math.max(0, Math.ceil((deadline - now) / 1000))).padStart(2, "0") : "--"; }
function paintingScore(count: number) { return [0, 4_000, 12_000, 30_000, 60_000, 100_000, 150_000, 200_000, 300_000, 400_000, 500_000][Math.min(10, count)] ?? 0; }
function playerName(state: CashNGunsClientState, id?: string) { return state.players.find((player) => player.id === id)?.name ?? "알 수 없음"; }

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
  const [forcedModal, setForcedModal] = useState<ModalName>(null);
  const [pendingTarget, setPendingTarget] = useState("");
  const [pendingCommand, setPendingCommand] = useState("");
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugBusy, setDebugBusy] = useState(false);
  const [debugTarget, setDebugTarget] = useState(meId ?? state.players[0]?.id ?? "");
  const [soundOn, setSoundOn] = useState(true);
  const [vibrationOn, setVibrationOn] = useState(true);
  const tickLock = useRef(false);

  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 250); return () => window.clearInterval(id); }, []);
  useEffect(() => { setPendingTarget(""); setPendingCommand(""); setForcedModal(null); }, [state.phase, state.round]);
  useEffect(() => {
    if (!state.phaseEndsAt || now < state.phaseEndsAt || tickLock.current || state.phase === "game_over") return;
    tickLock.current = true; void onAction({ action: "cash-n-guns-tick" }).finally(() => { tickLock.current = false; });
  }, [now, onAction, state.phase, state.phaseEndsAt]);

  const alivePlayers = state.players.filter((player) => player.alive);
  const me = state.players.find((player) => player.id === meId);
  const myIndex = Math.max(0, state.players.findIndex((player) => player.id === meId));
  const currentLootTurnId = state.lootTurnOrder[state.lootTurnIndex];
  const isMyLootTurn = state.phase === "loot" && currentLootTurnId === meId;
  const naturalAim = Boolean(me?.alive && state.my.canAct && (state.phase === "aim" || (state.phase === "reaim" && state.commandTargetId === meId)));
  const naturalGodfather = Boolean(me?.alive && state.phase === "godfather" && state.godfatherId === meId && !state.godfatherCommandUsed);
  const visibleModal: ModalName = forcedModal ?? (naturalAim ? "aim" : naturalGodfather ? "godfather" : modal);
  const canDebug = Boolean(debugMode && isHost && state.debug?.enabled);
  const myLoot = state.my.loot ?? [];
  const assetTotals = useMemo(() => {
    const cash = myLoot.filter((card) => card.kind === "cash").reduce((sum, card) => sum + (card.value ?? 0), 0);
    const diamondCards = myLoot.filter((card) => card.kind === "diamond"); const diamonds = diamondCards.reduce((sum, card) => sum + (card.value ?? 0), 0);
    const paintings = myLoot.filter((card) => card.kind === "painting").length; const paintingValue = paintingScore(paintings);
    return { cash, diamondCards: diamondCards.length, diamonds, paintings, paintingValue, total: cash + diamonds + paintingValue };
  }, [myLoot]);
  const orderedSeats = useMemo(() => {
    const others = state.players.filter((player) => player.id !== meId); const positions = OTHER_SEATS[others.length] ?? OTHER_SEATS[7];
    const entries = others.map((player, index) => ({ player, seat: positions[index] ?? "top", characterIndex: state.players.findIndex((item) => item.id === player.id) }));
    if (me) entries.push({ player: me, seat: "bottom", characterIndex: myIndex }); return entries;
  }, [me, meId, myIndex, state.players]);
  const seatByPlayer = useMemo(() => Object.fromEntries(orderedSeats.map((entry) => [entry.player.id, entry.seat])), [orderedSeats]);
  const showAimLines = ["godfather", "reaim", "courage", "resolve", "loot"].includes(state.phase);
  const selectedTargetPlayer = state.players.find((player) => player.id === pendingTarget);
  const aimCandidates = alivePlayers.filter((player) => player.id !== meId && (state.phase !== "reaim" || player.id !== state.previousAimTargetId));
  const commandCandidates = alivePlayers.filter((player) => player.id !== meId);
  const clickCount = state.my.bullets.filter((bullet) => bullet === "click").length; const bangCount = state.my.bullets.filter((bullet) => bullet === "bang").length;
  const act = (payload: Record<string, unknown>) => { if (!busy) void onAction(payload); };
  const runDebug = async (action: DebugAction, extra: Record<string, unknown> = {}) => { if (!canDebug || debugBusy) return; setDebugBusy(true); try { await onAction({ action, debug: true, ...extra }); } finally { setDebugBusy(false); } };
  const playerPose = (player: CashNGunsClientState["players"][number]): CharacterPose => {
    if (!player.alive) return "dead";
    if (state.phase === "resolve" && state.roundOutcome?.woundedIds.includes(player.id)) return "hit";
    if (player.courage === "crouch" || (player.id === meId && state.my.courage === "crouch" && state.phase === "courage")) return "crouch";
    if (showAimLines && player.aimTargetId) return "aim";
    return "idle";
  };
  const playerFacing = (player: CashNGunsClientState["players"][number], seat: string): "left" | "right" => {
    const from = SEAT_COORDS[seat];
    const targetSeat = player.aimTargetId ? seatByPlayer[player.aimTargetId] : undefined;
    const target = targetSeat ? SEAT_COORDS[targetSeat] : undefined;
    if (target && target.x !== from?.x) return target.x < from.x ? "left" : "right";
    return (from?.x ?? 50) > 50 ? "left" : "right";
  };

  const actionFooter = (() => {
    if (!me?.alive) return <div className="cng2-status-action dead">탈락 · 다른 조직원의 결말을 지켜보세요</div>;
    if (state.phase === "bullet_select") return <div className="cng2-split-actions ammo"><button type="button" className={state.my.chosenBullet === "click" ? "selected" : ""} disabled={busy || Boolean(state.my.chosenBullet) || clickCount === 0} onClick={() => act({ action: "cash-n-guns-bullet", bullet: "click" })}><ActionSprite index={0} /><span><b>CLICK</b><small>{clickCount}장</small></span></button><button type="button" className={state.my.chosenBullet === "bang" ? "selected" : ""} disabled={busy || Boolean(state.my.chosenBullet) || bangCount === 0} onClick={() => act({ action: "cash-n-guns-bullet", bullet: "bang" })}><ActionSprite index={1} /><span><b>BANG!</b><small>{bangCount}장</small></span></button></div>;
    if (state.phase === "aim") return <button type="button" className="cng2-wide-action gold" disabled={!state.my.canAct} onClick={() => setModal("aim")}><ActionSprite index={6} />{state.my.aimTargetId ? `${playerName(state, state.my.aimTargetId)} 조준 완료` : "목표 선택"}</button>;
    if (state.phase === "godfather") return <button type="button" className="cng2-wide-action gold" disabled={!naturalGodfather} onClick={() => setModal("godfather")}><ActionSprite index={5} />{naturalGodfather ? "대부의 권한 사용" : `${playerName(state, state.godfatherId)}의 선택 대기`}</button>;
    if (state.phase === "reaim") return <button type="button" className="cng2-wide-action gold" disabled={!naturalAim} onClick={() => setModal("aim")}><ActionSprite index={6} />{naturalAim ? "새 목표 선택" : `${playerName(state, state.commandTargetId)}의 재조준 대기`}</button>;
    if (state.phase === "courage") return <div className="cng2-split-actions courage"><button type="button" className={state.my.courage === "crouch" ? "selected" : ""} disabled={busy || !state.my.canAct} onClick={() => act({ action: "cash-n-guns-courage", courage: "crouch" })}><ActionSprite index={2} /><b>숙인다</b></button><button type="button" className={state.my.courage === "stand" ? "selected" : ""} disabled={busy || !state.my.canAct} onClick={() => act({ action: "cash-n-guns-courage", courage: "stand" })}><ActionSprite index={3} /><b>버틴다</b></button></div>;
    if (state.phase === "loot") return <div className={`cng2-status-action ${isMyLootTurn ? "turn" : ""}`}>{isMyLootTurn ? "테이블에서 전리품 하나를 선택하세요" : `${playerName(state, currentLootTurnId)}의 선택 대기`}</div>;
    if (state.phase === "game_over") return <div className="cng2-status-action gold">최종 정산 완료</div>;
    return <div className="cng2-status-action">{state.phase === "resolve" ? "총격 결과를 처리하고 있습니다" : "전리품을 확인하세요"}</div>;
  })();

  return <main className="cng2-shell"><div className="cng2-game-frame">
    <header className="cng2-hud"><div className="cng2-hud-main"><button type="button" className="cng2-assets-button" onClick={() => setModal("loot")}><LootSprite card={{ kind: "cash", value: 10_000 }} /><span><b>${assetTotals.total.toLocaleString()}</b><small>#{code}</small></span></button><h1>캐시 앤 건즈</h1><nav><button type="button" aria-label="설정" onClick={() => setModal("settings")}>⚙</button>{isHost && <button type="button" aria-label="대기실로 이동" onClick={onLobby}>↩</button>}<button type="button" aria-label="나가기" onClick={onLeave}>↗</button></nav></div><div className="cng2-hud-status"><span className="round"><small>ROUND</small><b>{state.round}/{state.totalRounds}</b></span><span className="timer"><i /> <b>{timerText(state.phaseEndsAt, now)}</b><small>초</small></span><span className="mode"><small>BASE MODE</small><b>POWER OFF</b></span><span className="godfather"><ActionSprite index={5} /><small>GODFATHER</small><b>{playerName(state, state.godfatherId)}</b></span></div></header>
    <section className={`cng2-scene phase-${state.phase}`} aria-label={`캐시 앤 건즈 ${PHASE_LABEL[state.phase]}`}><div className="cng2-environment" aria-hidden="true" /><div className="cng2-phase-chip"><span>{PHASE_LABEL[state.phase]}</span><i>{alivePlayers.length}명 생존</i></div>
      {showAimLines && <svg className="cng2-aim-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><defs><marker id="cng2-arrow" markerWidth="4" markerHeight="4" refX="3" refY="2" orient="auto"><path d="M0,0 L4,2 L0,4 Z" /></marker></defs>{state.players.flatMap((player) => { const from = SEAT_COORDS[seatByPlayer[player.id]]; const to = player.aimTargetId ? SEAT_COORDS[seatByPlayer[player.aimTargetId]] : undefined; if (!from || !to || !player.alive) return []; return <line key={`${player.id}-${player.aimTargetId}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} markerEnd="url(#cng2-arrow)" className={player.id === meId ? "mine" : ""} />; })}</svg>}
      <div className="cng2-loot-rail" aria-label="이번 라운드 전리품">{state.currentLoot.map((card) => { const taken = state.lootTakenIds.includes(card.id); return <button type="button" key={card.id} className={taken ? "taken" : ""} disabled={taken || !isMyLootTurn || busy} onClick={() => act({ action: "cash-n-guns-loot", lootId: card.id })} aria-label={taken ? `${card.label} 선택 완료` : card.label} title={card.label}><LootSprite card={card} /></button>; })}{state.newGodfatherAvailable && <button type="button" className="token" disabled={!isMyLootTurn || busy} onClick={() => act({ action: "cash-n-guns-loot", lootId: "godfather-token" })} aria-label="새 대부 토큰" title="NEW GODFATHER"><LootSprite card={{ kind: "token" }} /></button>}</div>
      {orderedSeats.map(({ player, seat, characterIndex }) => <div key={player.id} className={`cng2-seat seat-${seat} ${player.id === meId ? "me" : ""} ${player.id === state.godfatherId ? "is-godfather" : ""} ${!player.alive ? "is-dead" : ""}`}><CharacterSprite index={characterIndex} pose={playerPose(player)} facing={playerFacing(player, seat)} /><div className="cng2-nameplate">{player.id === state.godfatherId && <span className="crown">♛</span>}<b>{player.id === meId ? "나" : player.name}</b><span className="wounds" aria-label={`상처 ${player.wounds}개`}>{[0, 1, 2].map((wound) => <i key={wound} className={wound < player.wounds ? "filled" : ""} />)}</span>{!player.alive && <em>DEAD</em>}</div></div>)}
      {state.phase === "resolve" && <div className="cng2-resolution"><b>{state.roundOutcome?.deadIds.length ? `${state.roundOutcome.deadIds.length}명 탈락` : state.roundOutcome?.woundedIds.length ? `${state.roundOutcome.woundedIds.length}명 피격` : "총성은 빗나갔습니다"}</b><span>{(state.roundOutcome?.shots ?? []).filter((shot) => shot.result === "bang" || shot.result === "click").slice(0, 3).map((shot) => `${playerName(state, shot.shooterId)} ${shot.result === "bang" ? "BANG" : "CLICK"}`).join(" · ")}</span></div>}
    </section>
    <footer className="cng2-action-dock">{actionFooter}</footer>{canDebug && <button type="button" className="cng2-debug-fab" onClick={() => setDebugOpen(true)}>DEBUG</button>}

    {visibleModal === "aim" && <PixelModal title="누구를 겨눌까요?" subtitle="조준할 상대 1명을 선택하세요" onClose={forcedModal ? () => setForcedModal(null) : naturalAim ? undefined : () => setModal(null)} className="aim-modal" footer={<><button type="button" className="secondary" onClick={() => { setPendingTarget(""); if (forcedModal) setForcedModal(null); else setModal(null); }}>취소</button><button type="button" className="danger" disabled={!pendingTarget || !naturalAim || busy} onClick={() => { act({ action: state.phase === "reaim" ? "cash-n-guns-reaim" : "cash-n-guns-aim", targetId: pendingTarget }); setPendingTarget(""); setModal(null); }}>겨눈다</button></>}><div className="cng2-target-grid">{aimCandidates.map((player) => <button type="button" key={player.id} className={pendingTarget === player.id ? "selected" : ""} onClick={() => setPendingTarget(player.id)}><CharacterSprite index={state.players.findIndex((item) => item.id === player.id)} pose="idle" /><b>{player.name}</b></button>)}</div><div className="cng2-target-route"><span>나</span><i>◎</i><span>{selectedTargetPlayer?.name ?? "TARGET"}</span></div></PixelModal>}
    {visibleModal === "godfather" && <PixelModal title="대부의 권한" subtitle="한 명에게 목표를 다시 정하게 할 수 있습니다" onClose={forcedModal ? () => setForcedModal(null) : naturalGodfather ? undefined : () => setModal(null)} className="godfather-modal" footer={<><button type="button" className="secondary" disabled={!naturalGodfather || busy} onClick={() => { act({ action: "cash-n-guns-godfather-pass" }); setModal(null); }}>사용 안 함</button><button type="button" className="danger" disabled={!pendingCommand || !naturalGodfather || busy} onClick={() => { act({ action: "cash-n-guns-godfather-command", targetId: pendingCommand }); setPendingCommand(""); setModal(null); }}>목표 바꾸기</button></>}><p className="cng2-command-note">새 목표는 그 플레이어가 직접 선택합니다</p><div className="cng2-target-grid command">{commandCandidates.map((player) => <button type="button" key={player.id} className={pendingCommand === player.id ? "selected" : ""} onClick={() => setPendingCommand(player.id)}><CharacterSprite index={state.players.findIndex((item) => item.id === player.id)} pose="idle" /><b>{player.name}</b></button>)}</div></PixelModal>}
    {visibleModal === "loot" && <PixelModal title="내 전리품" onClose={() => { setModal(null); setForcedModal(null); }} className="assets-modal"><div className="cng2-assets-list"><div><LootSprite card={{ id: "cash", kind: "cash", value: 20_000, label: "현금" }} /><span><small>현금</small><b>${assetTotals.cash.toLocaleString()}</b></span></div><div><LootSprite card={{ id: "diamond", kind: "diamond", value: 10_000, label: "다이아" }} /><span><small>다이아</small><b>{assetTotals.diamondCards}개</b><em>가치 ${assetTotals.diamonds.toLocaleString()}</em></span></div><div><LootSprite card={{ id: "painting", kind: "painting", label: "그림" }} /><span><small>그림 컬렉션</small><b>{assetTotals.paintings}점</b><em>세트 가치 ${assetTotals.paintingValue.toLocaleString()}</em></span></div></div><div className="cng2-total"><small>총 가치</small><b>${assetTotals.total.toLocaleString()}</b></div><div className="cng2-bonus"><ActionSprite index={5} />다이아 단독 1위 보너스 <b>+$60,000</b></div><p className="cng2-death-warning">☠ 죽으면 승리 불가</p></PixelModal>}
    {visibleModal === "settings" && <PixelModal title="설정" onClose={() => setModal(null)} className="settings-modal"><div className="cng2-settings"><button type="button" onClick={() => setSoundOn((value) => !value)}><span>효과음</span><b>{soundOn ? "ON" : "OFF"}</b></button><button type="button" onClick={() => setVibrationOn((value) => !value)}><span>진동</span><b>{vibrationOn ? "ON" : "OFF"}</b></button></div></PixelModal>}
    {state.phase === "game_over" && <PixelModal title={!state.winnerIds?.length ? "전원 탈락" : state.winnerIds.length === 1 ? `${playerName(state, state.winnerIds[0])} 승리` : "공동 승리"} subtitle={state.winnerIds?.length ? "살아남은 조직원 중 가장 많은 자산을 모았습니다" : "승리 조건을 만족한 조직원이 없습니다"} className="result-modal"><div className="cng2-final-list">{(state.finalScores ?? []).sort((a, b) => b.money - a.money).map((score, index) => <div key={score.playerId} className={state.winnerIds?.includes(score.playerId) ? "winner" : ""}><span>{index + 1}</span><b>{playerName(state, score.playerId)}</b><em>{score.alive ? `$${score.money.toLocaleString()}` : "DEAD"}</em></div>)}</div>{isHost && <div className="cng2-result-buttons"><button type="button" onClick={onReplay}>같은 게임 다시하기</button><button type="button" onClick={onLobby}>다른 게임 하러가기</button></div>}</PixelModal>}

    {debugOpen && canDebug && <div className="cng2-debug-shade"><aside className="cng2-debug-panel"><header><div><small>SOLO TEST LAB</small><b>DEBUG CONTROL</b></div><button type="button" onClick={() => setDebugOpen(false)}>×</button></header><div className="cng2-debug-summary"><span>PHASE <b>{state.phase}</b></span><span>ROUND <b>{state.round}/8</b></span><span>BOT <b>{state.debug?.botIds.length ?? 0}</b></span><span>AUTO <b>{state.debug?.botAuto ? "ON" : "OFF"}</b></span></div><section><h3>진행</h3><div className="cng2-debug-buttons three"><button disabled={debugBusy} onClick={() => void runDebug("cash-n-guns-debug-step")}>다음 단계</button><button disabled={debugBusy} onClick={() => void runDebug("cash-n-guns-debug-auto")}>8R AUTO</button><button disabled={debugBusy} onClick={() => void runDebug("cash-n-guns-debug-reset")}>초기화</button></div></section><section><h3>단계 이동</h3><div className="cng2-debug-buttons phase">{Object.entries(PHASE_LABEL).map(([phase, label]) => <button key={phase} className={state.phase === phase ? "active" : ""} onClick={() => void runDebug("cash-n-guns-debug-mutate", { command: "phase", phase })}>{label}</button>)}</div></section><section><h3>플레이어 상태</h3><select value={debugTarget} onChange={(event) => setDebugTarget(event.target.value)}>{state.players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select><div className="cng2-debug-buttons three"><button onClick={() => void runDebug("cash-n-guns-debug-mutate", { command: "wound", targetId: debugTarget, delta: 1 })}>상처 +1</button><button onClick={() => void runDebug("cash-n-guns-debug-mutate", { command: "wound", targetId: debugTarget, delta: -1 })}>상처 -1</button><button onClick={() => void runDebug("cash-n-guns-debug-mutate", { command: "godfather", targetId: debugTarget })}>대부 지정</button><button onClick={() => void runDebug("cash-n-guns-debug-mutate", { command: "kill", targetId: debugTarget })}>죽이기</button><button onClick={() => void runDebug("cash-n-guns-debug-mutate", { command: "revive", targetId: debugTarget })}>부활</button><button onClick={() => void runDebug("cash-n-guns-debug-mutate", { command: "bot-auto", enabled: !state.debug?.botAuto })}>BOT {state.debug?.botAuto ? "OFF" : "ON"}</button></div></section><section><h3>행동 강제</h3><div className="cng2-debug-buttons three"><button onClick={() => void runDebug("cash-n-guns-debug-mutate", { command: "bullet", targetId: debugTarget, bullet: "bang" })}>BANG</button><button onClick={() => void runDebug("cash-n-guns-debug-mutate", { command: "bullet", targetId: debugTarget, bullet: "click" })}>CLICK</button><button onClick={() => void runDebug("cash-n-guns-debug-mutate", { command: "courage", targetId: debugTarget, courage: "crouch" })}>숙임</button><button onClick={() => void runDebug("cash-n-guns-debug-mutate", { command: "courage", targetId: debugTarget, courage: "stand" })}>버팀</button><button onClick={() => void runDebug("cash-n-guns-debug-mutate", { command: "loot-add" })}>Loot +</button><button onClick={() => void runDebug("cash-n-guns-debug-mutate", { command: "loot-remove" })}>Loot -</button></div></section><section><h3>팝업 검수</h3><div className="cng2-debug-buttons three"><button onClick={() => { setDebugOpen(false); setForcedModal("aim"); }}>TARGET</button><button onClick={() => { setDebugOpen(false); setForcedModal("godfather"); }}>GODFATHER</button><button onClick={() => { setDebugOpen(false); setForcedModal("loot"); }}>LOOT</button></div></section></aside></div>}
  </div>{overlays}</main>;
}
