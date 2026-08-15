"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { CashNGunsBullet, CashNGunsClientState, CashNGunsLootCard } from "./api/_lib/cash-n-guns";
export type { CashNGunsClientState } from "./api/_lib/cash-n-guns";

type Player = { id: string; name: string; avatar: string; status: "active" | "waiting" };
type ActionHandler = (payload: Record<string, unknown>) => Promise<unknown>;
type DebugAction = "cash-n-guns-debug-step" | "cash-n-guns-debug-auto" | "cash-n-guns-debug-reset";

const PHASE_LABEL: Record<CashNGunsClientState["phase"], string> = {
  loot_reveal: "전리품 공개",
  bullet_select: "탄환 선택",
  aim: "총구를 겨누세요",
  godfather: "대부의 명령",
  reaim: "다시 겨누기",
  courage: "숨을까요, 설까요?",
  resolve: "발포 결과",
  loot: "전리품 분배",
  game_over: "게임 종료",
};

const PHASE_HINT: Record<CashNGunsClientState["phase"], string> = {
  loot_reveal: "이번 라운드에 걸린 전리품을 확인하세요.",
  bullet_select: "CLICK 또는 BANG! 한 장을 비밀리에 고르세요.",
  aim: "살아 있는 다른 플레이어 한 명을 겨누세요.",
  godfather: "대부는 한 명에게 목표를 바꾸라고 명령할 수 있어요.",
  reaim: "지목된 사람만 기존과 다른 목표를 선택합니다.",
  courage: "몸을 숨기거나 그대로 서 있을지 결정하세요.",
  resolve: "모든 총성이 동시에 판정됐어요.",
  loot: "차례가 오면 전리품 하나를 가져가세요.",
  game_over: "마지막까지 살아남고 가장 많은 돈을 모은 사람이 승리합니다.",
};

const PHASE_CLASS: Record<CashNGunsClientState["phase"], string> = {
  loot_reveal: "reveal",
  bullet_select: "bullet",
  aim: "aim",
  godfather: "command",
  reaim: "command",
  courage: "courage",
  resolve: "resolve",
  loot: "loot",
  game_over: "result",
};

function timerText(deadline?: number, now = Date.now()) {
  if (!deadline) return "—";
  return `${Math.max(0, Math.ceil((deadline - now) / 1000))}초`;
}

function playerLabel(players: Player[] | CashNGunsClientState["players"], id?: string) {
  return players.find((player) => player.id === id)?.name ?? "알 수 없음";
}

function lootArt(kind: CashNGunsLootCard["kind"] | "token" | "bullet-click" | "bullet-bang") {
  const positions: Record<string, string> = {
    cash: "0% 0%",
    diamond: "50% 0%",
    painting: "100% 0%",
    medkit: "0% 33%",
    clip: "50% 33%",
    token: "100% 33%",
    "bullet-click": "0% 67%",
    "bullet-bang": "100% 67%",
  };
  return { backgroundImage: "url('/cash-n-guns/pixel/loot.png')", backgroundPosition: positions[kind] ?? "0% 0%" };
}

function CrewSprite({ index }: { index: number }) {
  const col = index % 4;
  const row = Math.floor(index / 4);
  return <span className="cng-crew-sprite" style={{ backgroundImage: "url('/cash-n-guns/pixel/crew.png')", backgroundPosition: `${col * 33.333}% ${row * 100}%` }} aria-hidden="true" />;
}

function LootArt({ kind }: { kind: CashNGunsLootCard["kind"] | "token" }) {
  return <span className="cng-loot-art" style={lootArt(kind)} aria-hidden="true" />;
}

function BulletCard({ bullet, selected, disabled, onClick }: { bullet: CashNGunsBullet; selected: boolean; disabled: boolean; onClick: () => void }) {
  return <button type="button" className={`cng-bullet-card ${bullet} ${selected ? "selected" : ""}`} disabled={disabled} onClick={onClick}>
    <span className="cng-bullet-art" style={lootArt(bullet === "bang" ? "bullet-bang" : "bullet-click")} />
    <span><b>{bullet === "bang" ? "BANG!" : "CLICK"}</b><small>{bullet === "bang" ? "실탄" : "빈 탄창"}</small></span>
  </button>;
}

export function CashNGunsGame({
  code,
  players,
  meId,
  state,
  isHost,
  debugMode = false,
  busy,
  onAction,
  onReplay,
  onLobby,
  onLeave,
  overlays,
}: {
  code: string;
  players: Player[];
  meId?: string;
  state: CashNGunsClientState;
  isHost: boolean;
  debugMode?: boolean;
  busy: boolean;
  onAction: ActionHandler;
  onReplay: () => void;
  onLobby: () => void;
  onLeave: () => void;
  overlays?: ReactNode;
}) {
  const [now, setNow] = useState(() => Date.now());
  const tickLock = useRef(false);
  const alive = state.players.filter((player) => player.alive);
  const isMyLootTurn = state.phase === "loot" && state.lootTurnOrder[state.lootTurnIndex] === meId;
  const remainingLoot = state.currentLoot.filter((card) => !state.lootTakenIds.includes(card.id));
  const selectedBullet = state.my.chosenBullet;
  const selectedTarget = state.my.aimTargetId;
  const [debugBusy, setDebugBusy] = useState(false);
  const [debugMessage, setDebugMessage] = useState("");
  const canDebug = debugMode && isHost;
  const currentTurnId = state.lootTurnOrder[state.lootTurnIndex];

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!state.phaseEndsAt || now < state.phaseEndsAt || tickLock.current || state.phase === "game_over") return;
    tickLock.current = true;
    void onAction({ action: "cash-n-guns-tick" }).finally(() => { tickLock.current = false; });
  }, [now, onAction, state.phase, state.phaseEndsAt]);

  const act = (payload: Record<string, unknown>) => { if (!busy) void onAction(payload); };
  const runDebug = async (action: DebugAction) => {
    if (!canDebug || debugBusy) return;
    setDebugBusy(true);
    setDebugMessage("서버 상태를 갱신하는 중…");
    try {
      await onAction({ action, debug: true });
      setDebugMessage("완료 · 최신 서버 상태 반영");
    } catch (error) {
      setDebugMessage(error instanceof Error ? error.message : "디버그 동작에 실패했어요.");
    } finally {
      setDebugBusy(false);
    }
  };
  const debugSnapshot = JSON.stringify({
    phase: state.phase,
    round: state.round,
    phaseEndsAt: state.phaseEndsAt,
    godfatherId: state.godfatherId,
    players: state.players.map((player) => ({ id: player.id, name: player.name, alive: player.alive, wounds: player.wounds, aimedAt: player.aimTargetId })),
    lootRemaining: remainingLoot.length,
    lootTurn: currentTurnId,
  }, null, 2);
  const godfather = state.godfatherId === meId;
  const scoreName = (id?: string) => playerLabel(state.players, id);

  return <main className="cng-shell">
    <header className="cng-topbar">
      <div className="cng-room-code"><i />{code}</div>
      <div className="cng-title">캐시 앤 건즈 <small>BASE MODE</small></div>
      <div className="cng-nav"><button type="button" onClick={onLobby} disabled={!isHost}>대기실</button><button type="button" onClick={onLeave}>나가기</button></div>
    </header>

    <section className="cng-hero">
      <div className="cng-hero-copy"><span className="cng-kicker">NOIR LOOT SHOWDOWN</span><h1>캐시 앤 건즈</h1><p>총을 겨누고, 숨고, 전리품을 나누세요.</p><div className="cng-pills"><span>ROUND {state.round}/{state.totalRounds}</span><span>{state.players.length} PLAYERS</span><span>POWER MODE 없음</span></div></div>
      <div className="cng-hero-crew" aria-hidden="true"><CrewSprite index={0} /><CrewSprite index={2} /><CrewSprite index={7} /></div>
    </section>

    <section className="cng-board">
      <div className="cng-board-head"><div><span className="cng-kicker">ROUND {String(state.round).padStart(2, "0")}</span><h2>{PHASE_LABEL[state.phase]}</h2><p>{PHASE_HINT[state.phase]}</p></div><div className={`cng-phase-timer ${PHASE_CLASS[state.phase]}`}>{timerText(state.phaseEndsAt, now)}</div></div>
      <div className="cng-table">
        <div className="cng-table-glow" />
        <div className="cng-player-grid">
          {state.players.map((player, index) => {
            const selectable = (state.phase === "aim" || state.phase === "reaim") && player.alive && player.id !== meId && (state.phase !== "reaim" || state.commandTargetId === meId) && player.id !== state.previousAimTargetId;
            const aimed = selectedTarget === player.id;
            return <button type="button" key={player.id} className={`cng-player-slot ${!player.alive ? "dead" : ""} ${aimed ? "aimed" : ""} ${player.id === state.godfatherId ? "godfather" : ""}`} disabled={!selectable || busy} onClick={() => act({ action: state.phase === "reaim" ? "cash-n-guns-reaim" : "cash-n-guns-aim", targetId: player.id })}>
              <span className="cng-slot-frame"><CrewSprite index={index % 8} />{player.id === state.godfatherId && <em>대부</em>}{!player.alive && <strong>OUT</strong>}</span><b>{player.name}</b><small>{player.alive ? `${"●".repeat(Math.min(3, player.wounds))}${"○".repeat(Math.max(0, 3 - player.wounds))}` : "탈락"}</small>
            </button>;
          })}
        </div>
        <div className="cng-table-mark">{state.phase === "aim" ? "AIM" : state.phase === "courage" ? "STAND OR CROUCH" : "CASH • GUNS • GLORY"}</div>
      </div>
    </section>

    <section className="cng-panel cng-loot-panel"><div className="cng-section-head"><div><span className="cng-kicker">THE POT</span><h3>이번 라운드 전리품</h3></div><span>{remainingLoot.length + (state.newGodfatherAvailable ? 1 : 0)}장 남음</span></div><div className="cng-loot-grid">
      {state.currentLoot.map((card) => <button type="button" key={card.id} className={`cng-loot-card ${state.lootTakenIds.includes(card.id) ? "taken" : ""}`} disabled={state.phase !== "loot" || !isMyLootTurn || state.lootTakenIds.includes(card.id) || busy} onClick={() => act({ action: "cash-n-guns-loot", lootId: card.id })}><LootArt kind={card.kind} /><span><b>{card.label}</b><small>{card.kind === "painting" ? "세트 보너스" : card.kind === "medkit" ? "상처 전부 회복" : card.kind === "clip" ? "버린 BANG 회수" : "현금 가치"}</small></span></button>)}
      {state.newGodfatherAvailable && <button type="button" className="cng-loot-card token" disabled={state.phase !== "loot" || !isMyLootTurn || busy} onClick={() => act({ action: "cash-n-guns-loot", lootId: "godfather-token" })}><LootArt kind="token" /><span><b>NEW GODFATHER</b><small>다음 라운드의 대부</small></span></button>}
    </div>{state.phase === "loot" && <p className="cng-turn-note">{isMyLootTurn ? "내 차례예요. 하나를 가져가세요." : `${scoreName(currentTurnId)}의 차례를 기다리는 중`}</p>}</section>

    <section className={`cng-panel cng-action-panel ${PHASE_CLASS[state.phase]}`}>
      {state.phase === "loot_reveal" && <div className="cng-message"><span className="cng-stamp">LOOT</span><h3>전리품이 테이블에 깔렸어요</h3><p>잠시 후 탄환을 비밀리에 선택합니다.</p></div>}
      {state.phase === "bullet_select" && <div><div className="cng-section-head"><div><span className="cng-kicker">HIDDEN LOADOUT</span><h3>탄환을 고르세요</h3></div><span>{state.my.bullets.length}발 보유</span></div><div className="cng-bullet-grid">{(["click", "bang"] as CashNGunsBullet[]).map((bullet) => <BulletCard key={bullet} bullet={bullet} selected={selectedBullet === bullet} disabled={busy || Boolean(selectedBullet) || !state.my.bullets.includes(bullet)} onClick={() => act({ action: "cash-n-guns-bullet", bullet })} />)}</div><p className="cng-private-note">선택한 탄환은 나만 볼 수 있어요.</p></div>}
      {state.phase === "aim" && <div className="cng-message"><span className="cng-stamp">AIM</span><h3>총구를 한 명에게 고정하세요</h3><p>{selectedTarget ? `${scoreName(selectedTarget)}을(를) 겨누고 있어요.` : "위 플레이어 카드를 눌러 목표를 선택하세요."}</p></div>}
      {state.phase === "godfather" && <div className="cng-message"><span className="cng-stamp">GODFATHER</span><h3>{godfather ? "한 명에게 다시 겨누라고 명령할까요?" : `${scoreName(state.godfatherId)}가 대부입니다.`}</h3>{godfather ? <div className="cng-command-grid">{alive.filter((player) => player.id !== meId).map((player) => <button key={player.id} type="button" disabled={busy || state.godfatherCommandUsed} onClick={() => act({ action: "cash-n-guns-godfather-command", targetId: player.id })}><CrewSprite index={state.players.findIndex((item) => item.id === player.id) % 8} /><span>{player.name}</span><small>목표 변경 지시</small></button>)}<button type="button" className="ghost" disabled={busy || state.godfatherCommandUsed} onClick={() => act({ action: "cash-n-guns-godfather-pass" })}>명령하지 않고 진행</button></div> : <p>대부의 선택이 끝나면 모두가 숨을지 결정합니다.</p>}</div>}
      {state.phase === "reaim" && <div className="cng-message"><span className="cng-stamp">RE-AIM</span><h3>{state.commandTargetId === meId ? "대부의 명령! 목표를 바꾸세요" : `${scoreName(state.commandTargetId)}가 목표를 바꾸는 중입니다.`}</h3><p>기존과 다른 플레이어를 눌러야 합니다.</p></div>}
      {state.phase === "courage" && <div><div className="cng-message"><span className="cng-stamp">COURAGE</span><h3>숨을까요, 설까요?</h3><p>숨으면 총알은 공개되지 않지만 전리품 분배에서 빠집니다.</p></div><div className="cng-courage-grid"><button type="button" className={state.my.courage === "crouch" ? "selected" : ""} disabled={busy || !state.my.canAct} onClick={() => act({ action: "cash-n-guns-courage", courage: "crouch" })}><span>▾</span><b>숨기</b><small>총알을 숨겨요</small></button><button type="button" className={state.my.courage === "stand" ? "selected" : ""} disabled={busy || !state.my.canAct} onClick={() => act({ action: "cash-n-guns-courage", courage: "stand" })}><span>↑</span><b>서기</b><small>전리품을 노려요</small></button></div></div>}
      {state.phase === "resolve" && <div><div className="cng-message"><span className="cng-stamp">FIRE</span><h3>총성이 멎었습니다</h3><p>이번 라운드의 모든 결과가 동시에 공개됩니다.</p></div><div className="cng-shot-list">{(state.roundOutcome?.shots ?? []).map((shot) => <div key={`${shot.shooterId}-${shot.targetId}`}><span>{scoreName(shot.shooterId)} → {scoreName(shot.targetId)}</span><b className={shot.result}>{shot.result === "bang" ? "BANG!" : shot.result === "click" ? "CLICK" : shot.result === "hidden" ? "숨김" : "빗나감"}</b></div>)}</div></div>}
      {state.phase === "game_over" && <div className="cng-final"><span className="cng-stamp">FINAL TABLE</span><h3>{state.winnerIds?.length === 1 ? `${scoreName(state.winnerIds[0])} 승리` : "공동 우승"}</h3><p>살아남은 사람 중 가장 많은 돈을 모은 플레이어가 승리합니다.</p><div className="cng-score-list">{(state.finalScores ?? []).sort((a, b) => b.money - a.money).map((score) => <div key={score.playerId} className={state.winnerIds?.includes(score.playerId) ? "winner" : ""}><span>{scoreName(score.playerId)} {score.alive ? "" : "· OUT"}</span><b>${score.money.toLocaleString()}</b><small>현금 ${score.cash.toLocaleString()} · 다이아 ${score.diamonds.toLocaleString()} · 그림 {score.paintings}장 · 상처 {score.wounds}</small></div>)}</div><div className="cng-result-actions">{isHost && <button type="button" className="cng-primary" onClick={onReplay}>같은 게임 다시하기</button>}{isHost && <button type="button" className="cng-secondary" onClick={onLobby}>다른 게임 하러가기</button>}</div></div>}
    </section>
    {canDebug && <aside className="cng-debug-panel" aria-label="캐시 앤 건즈 디버그 모드">
      <div className="cng-debug-head"><div><span className="cng-kicker">DEVELOPER TOOL</span><strong>DEBUG MODE</strong></div><span className="cng-debug-live">SERVER STATE</span></div>
      <div className="cng-debug-grid"><span>PHASE <b>{state.phase}</b></span><span>ROUND <b>{state.round}/{state.totalRounds}</b></span><span>ALIVE <b>{alive.length}</b></span><span>TIMER <b>{timerText(state.phaseEndsAt, now)}</b></span></div>
      <div className="cng-debug-actions"><button type="button" disabled={debugBusy} onClick={() => void runDebug("cash-n-guns-debug-step")}>현재 단계 넘기기</button><button type="button" disabled={debugBusy} onClick={() => void runDebug("cash-n-guns-debug-auto")}>8라운드 자동 진행</button><button type="button" className="danger" disabled={debugBusy} onClick={() => void runDebug("cash-n-guns-debug-reset")}>게임 상태 초기화</button></div>
      {debugMessage && <small className="cng-debug-message">{debugMessage}</small>}
      <details><summary>상태 JSON 보기</summary><pre>{debugSnapshot}</pre></details>
    </aside>}
    {overlays}
  </main>;
}
