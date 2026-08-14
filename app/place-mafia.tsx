"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  PLACE_MAFIA_LOCATION_IDS,
  PLACE_MAFIA_LOCATION_META,
  placeMafiaLocationName,
  placeMafiaReachableLocations,
  type PlaceMafiaBalance,
  type PlaceMafiaClientState,
  type PlaceMafiaDebugRole,
  type PlaceMafiaLocationId,
  type PlaceMafiaRole,
} from "./place-mafia-shared";
import { usePlaceMafiaExperience, type PlaceMafiaCue, type PlaceMafiaPreferences } from "./place-mafia-audio";

type MafiaPlayer = { id: string; name: string; avatar: string; status: "active" | "waiting"; bot?: boolean };
type ActionHandler = (payload: Record<string, unknown>) => Promise<unknown>;

function playerName(players: MafiaPlayer[], id?: string) {
  return players.find((player) => player.id === id)?.name ?? "알 수 없음";
}

function formatTimer(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function roleName(role?: PlaceMafiaRole) {
  return role === "mafia" ? "마피아" : "시민";
}

function balanceCopy(balance: PlaceMafiaBalance) {
  if (balance === "citizen") return "첫날 공격 없음";
  if (balance === "mafia") return "첫날 2곳 공격";
  return "첫날 1곳 공격";
}

function PlaceMafiaExperienceControls({
  preferences,
  onToggle,
  compact = false,
}: {
  preferences: PlaceMafiaPreferences;
  onToggle: (key: keyof PlaceMafiaPreferences) => void;
  compact?: boolean;
}) {
  const controls = [
    ["music", "음악", "BGM"],
    ["effects", "효과음", "SFX"],
    ["haptics", "진동", "HAPTIC"],
    ["reduceMotion", "모션 줄이기", "MOTION"],
  ] as const;
  return <details className={`pm-experience-menu ${compact ? "compact" : ""}`}>
    <summary><span className="pm-sound-wave"><i /><i /><i /></span><strong>연출 설정</strong><small>음악 · 효과음 · 진동</small></summary>
    <div>{controls.map(([key, label, code]) => {
      const active = key === "reduceMotion" ? preferences.reduceMotion : preferences[key];
      return <button type="button" key={key} className={active ? "active" : ""} aria-pressed={active} onClick={() => onToggle(key)}><span>{code}</span><strong>{label}</strong><i /></button>;
    })}</div>
    <p>브라우저 정책상 첫 화면 터치 후 음악이 시작됩니다.</p>
  </details>;
}

function transitionCopy(phase: PlaceMafiaClientState["phase"], state: PlaceMafiaClientState) {
  if (phase === "night") return { code: `NIGHT ${state.day}`, title: "도시가 잠듭니다", detail: "20초 동안 자신의 동선을 숨기세요" };
  if (phase === "day_reveal") return state.night?.quiet
    ? { code: `DAY ${state.day}`, title: "아침이 밝았습니다", detail: "밤사이 새로운 사건은 없었습니다" }
    : { code: `INCIDENT ${state.day}`, title: "사건이 발생했습니다", detail: "밤의 기록을 확인하세요" };
  if (phase === "discussion") return { code: "INVESTIGATION", title: "진술을 대조하세요", detail: "목격과 동선에서 모순을 찾으세요" };
  if (phase === "vote") return { code: "SECRET BALLOT", title: "익명 투표", detail: "선택은 누구에게도 공개되지 않습니다" };
  if (phase === "execution") return { code: "FINAL VERDICT", title: state.execution?.tied ? "의견이 갈렸습니다" : "판결을 공개합니다", detail: state.execution?.tied ? "오늘은 아무도 처형되지 않습니다" : "지목된 사람의 역할을 확인하세요" };
  if (phase === "game_over") return { code: "CASE CLOSED", title: state.winner === "mafia" ? "도시가 어둠에 잠겼습니다" : "도시가 평화를 되찾았습니다", detail: "모든 역할과 결과를 공개합니다" };
  return { code: "CLASSIFIED", title: "비밀 역할이 배정되었습니다", detail: "다른 사람이 보지 못하게 확인하세요" };
}

export function PlaceMafiaBriefing({
  players,
  isHost,
  busy,
  discussionSeconds,
  balance,
  debugMode,
  debugRole,
  onDiscussionChange,
  onBalanceChange,
  onDebugModeChange,
  onDebugRoleChange,
  onStart,
  topBar,
  overlays,
}: {
  players: MafiaPlayer[];
  isHost: boolean;
  busy: boolean;
  discussionSeconds: 60 | 90 | 120;
  balance: PlaceMafiaBalance;
  debugMode: boolean;
  debugRole: PlaceMafiaDebugRole;
  onDiscussionChange: (seconds: 60 | 90 | 120) => void;
  onBalanceChange: (balance: PlaceMafiaBalance) => void;
  onDebugModeChange: (enabled: boolean) => void;
  onDebugRoleChange: (role: PlaceMafiaDebugRole) => void;
  onStart: () => void;
  topBar: ReactNode;
  overlays?: ReactNode;
}) {
  const soloDebug = debugMode && players.length === 1 && isHost;
  const effectiveCount = soloDebug ? 4 : players.length;
  const valid = soloDebug || (players.length >= 4 && players.length <= 8);
  const mafiaCount = effectiveCount >= 7 ? 2 : 1;
  const experience = usePlaceMafiaExperience("briefing");
  return <main className={`pm-shell pm-briefing-shell ${experience.preferences.reduceMotion ? "pm-reduce-motion" : ""}`} onPointerDownCapture={() => void experience.unlock()}>
    {topBar}
    <section className="pm-briefing-hero">
      <img src="/place-mafia/city-board.png" alt="주택가와 경찰서, 광장과 공원, 골목과 병원으로 연결된 장소 마피아 도시 지도" />
      <div className="pm-briefing-shade" />
      <div className="pm-briefing-title"><span>NOIR SOCIAL DEDUCTION</span><h1>장소 마피아</h1><p>위치와 동선, 거짓말을 추적하세요.</p></div>
      <div className="pm-briefing-badges"><span>4–8명</span><span>밤 20초</span><span>6개 장소</span></div>
    </section>

    <PlaceMafiaExperienceControls preferences={experience.preferences} onToggle={experience.toggle} />

    <section className="pm-rules-panel">
      <header><span>CASE RULES</span><h2>범행이 가능했던 사람을 찾으세요</h2></header>
      <div className="pm-rule-flow">
        <div><b>01</b><span><strong>동시 이동</strong><small>현재 또는 인접 장소 한 칸</small></span></div>
        <div><b>02</b><span><strong>장소 습격</strong><small>마피아는 사람 대신 장소를 공격</small></span></div>
        <div><b>03</b><span><strong>동선 추리</strong><small>목격·광장·경찰 기록으로 토론</small></span></div>
      </div>
    </section>

    <section className="pm-settings-panel">
      <div className="pm-setting-heading"><span>토론 시간</span><small>낮마다 적용</small></div>
      <div className="pm-segmented">{([60, 90, 120] as const).map((seconds) => <button type="button" key={seconds} disabled={!isHost} className={discussionSeconds === seconds ? "selected" : ""} onClick={() => onDiscussionChange(seconds)}><strong>{seconds}</strong><small>초</small></button>)}</div>
      <div className="pm-setting-heading balance"><span>첫날 밸런스</span><small>둘째 밤부터 1곳 공격</small></div>
      <div className="pm-balance-grid">
        {([
          ["citizen", "시민 유리", "첫날 살인 없음"],
          ["normal", "기본", "첫날 1곳 공격"],
          ["mafia", "마피아 유리", "첫날 2곳 공격"],
        ] as const).map(([value, title, detail]) => <button type="button" key={value} disabled={!isHost} className={balance === value ? "selected" : ""} onClick={() => onBalanceChange(value)}><i /><strong>{title}</strong><small>{detail}</small></button>)}
      </div>
      {isHost && players.length === 1 && <section className={`pm-debug-setup ${debugMode ? "enabled" : ""}`}>
        <button type="button" className="pm-debug-toggle" aria-pressed={debugMode} onClick={() => onDebugModeChange(!debugMode)}><span><b>SOLO DEBUG</b><strong>혼자 디버깅</strong><small>가상 참가자 3명이 자동으로 행동합니다</small></span><i /></button>
        {debugMode && <div className="pm-debug-role"><span>확인할 내 역할</span><div>{(["auto", "citizen", "mafia"] as const).map((role) => <button type="button" key={role} className={debugRole === role ? "selected" : ""} onClick={() => onDebugRoleChange(role)}>{role === "auto" ? "자동" : role === "citizen" ? "시민" : "마피아"}</button>)}</div><p>단계 건너뛰기 버튼으로 모든 화면을 빠르게 확인할 수 있어요.</p></div>}
      </section>}
      <div className={`pm-player-check ${valid ? "valid" : "invalid"}`}><span>{effectiveCount}</span><div><strong>{soloDebug ? "1명 + 가상 참가자 3명" : valid ? `${players.length}명 · 마피아 ${mafiaCount}명` : "4~8명이 필요해요"}</strong><small>{soloDebug ? "디버깅 전용 판으로 시작합니다" : valid ? "현재 멤버로 시작할 수 있습니다" : "참가 인원을 맞추거나 혼자 디버깅을 켜세요"}</small></div></div>
    </section>

    <div className="pm-sticky-action">{isHost
      ? <button type="button" className="pm-primary-button" disabled={!valid || busy} onClick={onStart}>{busy ? "도시를 준비하는 중…" : "게임 시작"}</button>
      : <div className="pm-waiting"><i />방장이 사건을 준비하고 있어요</div>}
    </div>
    {overlays}
  </main>;
}

function PlaceMafiaMap({
  state,
  mode,
  selected,
  selectable,
  onSelect,
}: {
  state: PlaceMafiaClientState;
  mode: "move" | "attack" | "display";
  selected: PlaceMafiaLocationId[];
  selectable: PlaceMafiaLocationId[];
  onSelect?: (location: PlaceMafiaLocationId) => void;
}) {
  const origin = mode === "move" ? state.my?.location : mode === "attack" ? state.my?.selectedMove : undefined;
  const reachableSet = new Set(origin ? placeMafiaReachableLocations(origin) : []);
  const selectableSet = new Set(selectable.filter((location) => reachableSet.has(location)));
  const selectedSet = new Set(selected);
  const isNight = state.phase === "night";
  const buildingSpriteNames: Record<PlaceMafiaLocationId, string> = {
    residential: "residential",
    police: "police",
    square: "plaza",
    park: "park",
    alley: "alley",
    hospital: "hospital",
  };
  return <section className={`pm-map pm-map-${mode} ${isNight ? "is-night" : "is-day"}`} aria-label="장소 마피아 도시 지도">
    <div className="pm-pixel-sky" aria-hidden="true">
      <div className="pm-stars" />
      <div className="pm-sky-dither" />
      <div className="pm-celestial"><i className="pm-sun" /><i className="pm-moon" /></div>
      <div className="pm-cloud pm-cloud-a" /><div className="pm-cloud pm-cloud-b" />
      <div className="pm-skyline pm-skyline-far" /><div className="pm-skyline pm-skyline-near" />
    </div>
    <div className="pm-city-deck" aria-hidden="true" />
    <div className="pm-map-grid">{PLACE_MAFIA_LOCATION_IDS.map((location) => {
      const meta = PLACE_MAFIA_LOCATION_META[location];
      const isCurrent = state.my?.location === location;
      const isSelectable = selectableSet.has(location);
      const isSelected = selectedSet.has(location);
      return <button
        type="button"
        key={location}
        className={`pm-location pm-location-${location} pm-location-${meta.kind} ${isCurrent ? "current" : ""} ${isSelectable ? "selectable" : ""} ${isSelected ? "selected" : ""}`}
        disabled={!isSelectable || !onSelect}
        onClick={() => onSelect?.(location)}
        aria-pressed={isSelected}
        aria-label={`${meta.name}${isCurrent ? ", 현재 위치" : ""}${isSelectable ? ", 선택 가능" : ""}`}
      >
        <span className="pm-building-sprite" aria-hidden="true">
          <img className="pm-building-state pm-building-off" src={`/place-mafia/pixel/states/${buildingSpriteNames[location]}-off-v1.png`} alt="" />
          <img className="pm-building-state pm-building-half" src={`/place-mafia/pixel/states/${buildingSpriteNames[location]}-half-v1.png`} alt="" />
          <img className="pm-building-state pm-building-full" src={`/place-mafia/pixel/states/${buildingSpriteNames[location]}-full-v1.png`} alt="" />
          {isCurrent && <span className="pm-rooftop-player"><i /><b>◆</b></span>}
        </span>
        <span className="pm-location-label"><b>{meta.symbol}</b><strong>{meta.name}</strong></span>
        {isCurrent && <small className="pm-current-marker"><i />현재</small>}
      </button>;
    })}</div>
  </section>;
}

function PhaseHeader({ state, remaining }: { state: PlaceMafiaClientState; remaining: number }) {
  const phase = state.phase === "role_reveal" ? "역할 확인"
    : state.phase === "night" ? `${state.day}일차 · 밤`
      : state.phase === "day_reveal" ? `${state.day}일차 · 아침`
        : state.phase === "discussion" ? `${state.day}일차 · 토론`
          : state.phase === "vote" ? `${state.day}일차 · 익명 투표`
            : state.phase === "execution" ? `${state.day}일차 · 판결`
              : "게임 종료";
  return <header className={`pm-phase-header phase-${state.phase} ${state.phaseEndsAt && remaining <= 3_000 ? "urgent" : ""}`}>
    <span>{phase}</span>
    {state.phaseEndsAt && <time>{formatTimer(remaining)}</time>}
  </header>;
}

function MinimalResultNotice({ state, players, open, onToggle }: { state: PlaceMafiaClientState; players: MafiaPlayer[]; open: boolean; onToggle: () => void }) {
  const report = state.night;
  const execution = state.execution;
  if (!report && !execution) return null;
  const isVerdict = state.phase === "execution" && execution;
  const title = isVerdict
    ? execution.tied ? "오늘은 아무도 처형되지 않았습니다" : `${playerName(players, execution.playerId)} · ${roleName(execution.role)}`
    : report?.message ?? "밤이 끝났습니다";
  const details = isVerdict ? [] : [
    ...(report?.victimId ? [`사망 · ${playerName(players, report.victimId)}`] : []),
    ...(state.my?.witnessIds.length ? [`같은 장소 · ${state.my.witnessIds.map((id) => playerName(players, id)).join(", ")}`] : []),
    ...(report?.plazaVisitorIds.length ? [`광장 · ${report.plazaVisitorIds.map((id) => playerName(players, id)).join(", ")}`] : []),
    ...(report?.policeCandidates.length ? [`범인 위치 후보 · ${report.policeCandidates.map((id) => PLACE_MAFIA_LOCATION_META[id].shortName).join(" / ")}`] : []),
  ];
  return <button type="button" className={`pm-result-notice ${open ? "open" : "collapsed"} ${report && !report.quiet ? "danger" : ""}`} onClick={onToggle} aria-expanded={open}>
    <span>{isVerdict ? "투표 결과" : "지난밤 결과"}</span>
    {open && <><strong>{title}</strong>{details.map((detail) => <small key={detail}>{detail}</small>)}</>}
    <i>{open ? "접기" : "보기"}</i>
  </button>;
}

export function PlaceMafiaGame({
  code,
  players: roomPlayers,
  meId,
  state,
  clockOffsetMs,
  isHost,
  busy,
  onAction,
  onReplay,
  onLobby,
  onLeave,
  overlays,
}: {
  code: string;
  players: MafiaPlayer[];
  meId?: string;
  state: PlaceMafiaClientState;
  clockOffsetMs: number;
  isHost: boolean;
  busy: boolean;
  onAction: ActionHandler;
  onReplay: () => void;
  onLobby: () => void;
  onLeave: () => void;
  overlays?: ReactNode;
}) {
  const [now, setNow] = useState(Date.now());
  const [roleOpen, setRoleOpen] = useState(false);
  const [moveChoice, setMoveChoice] = useState<PlaceMafiaLocationId | undefined>();
  const [attackChoices, setAttackChoices] = useState<PlaceMafiaLocationId[]>([]);
  const [voteTarget, setVoteTarget] = useState("");
  const [voteConfirm, setVoteConfirm] = useState(false);
  const [working, setWorking] = useState(false);
  const [localNotice, setLocalNotice] = useState("");
  const [resultNoticeOpen, setResultNoticeOpen] = useState(false);
  const [transition, setTransition] = useState<ReturnType<typeof transitionCopy> | null>(null);
  const lastTickRef = useRef("");
  const lastCutRef = useRef(0);
  const lastCountdownRef = useRef(0);
  const previousPhaseRef = useRef(state.phase);
  const experience = usePlaceMafiaExperience(state.phase);
  const synchronizedNow = now + clockOffsetMs;
  const remaining = Math.max(0, (state.phaseEndsAt ?? synchronizedNow) - synchronizedNow);
  const me = state.my;
  const gamePlayers = useMemo<MafiaPlayer[]>(() => state.participants?.length
    ? state.participants.map((player) => ({ ...player, status: "active" }))
    : roomPlayers, [roomPlayers, state.participants]);
  const livingPlayers = useMemo(() => gamePlayers.filter((player) => state.alivePlayerIds.includes(player.id)), [gamePlayers, state.alivePlayerIds]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(interval);
  }, []);
  useEffect(() => {
    setMoveChoice(undefined);
    setAttackChoices([]);
    setVoteTarget("");
    setVoteConfirm(false);
  }, [state.day, state.phase]);
  useEffect(() => {
    if (state.phase !== "day_reveal" && state.phase !== "execution") return;
    setResultNoticeOpen(true);
    const timer = window.setTimeout(() => setResultNoticeOpen(false), 5_500);
    return () => window.clearTimeout(timer);
  }, [state.day, state.phase]);
  useEffect(() => {
    const previous = previousPhaseRef.current;
    if (previous === state.phase) return;
    previousPhaseRef.current = state.phase;
    const copy = transitionCopy(state.phase, state);
    const showTransition = state.phase === "night" || state.phase === "day_reveal" || state.phase === "game_over";
    setTransition(showTransition ? copy : null);
    const cue: PlaceMafiaCue = state.phase === "night" ? "night"
      : state.phase === "day_reveal" ? state.night?.quiet ? "quiet" : "incident"
        : state.phase === "vote" ? "vote"
          : state.phase === "execution" ? state.execution?.tied ? "tie" : state.execution?.role === "mafia" ? "mafia-out" : "citizen-out"
            : state.phase === "game_over" ? state.winner === "mafia" ? "mafia-win" : "citizen-win"
              : "evidence";
    experience.cue(cue);
    const timer = window.setTimeout(() => setTransition(null), showTransition ? experience.preferences.reduceMotion ? 280 : 1050 : 0);
    return () => window.clearTimeout(timer);
  }, [experience.cue, experience.preferences.reduceMotion, state.day, state.execution?.role, state.execution?.tied, state.night?.quiet, state.phase, state.winner]);
  useEffect(() => {
    if (!state.phaseEndsAt || remaining <= 0 || remaining > 3_000) {
      lastCountdownRef.current = 0;
      return;
    }
    const second = Math.ceil(remaining / 1_000);
    if (lastCountdownRef.current === second) return;
    lastCountdownRef.current = second;
    experience.cue("tick");
  }, [experience.cue, remaining, state.phaseEndsAt]);
  useEffect(() => {
    if (!state.phaseEndsAt || remaining > 0) return;
    const key = `${state.phase}:${state.day}:${state.phaseEndsAt}`;
    if (lastTickRef.current === key) return;
    lastTickRef.current = key;
    void onAction({ action: "place-mafia-tick" }).catch(() => undefined);
  }, [onAction, remaining, state.day, state.phase, state.phaseEndsAt]);
  useEffect(() => {
    const cut = state.lastDiscussionCut;
    if (!cut || cut.at <= lastCutRef.current) return;
    lastCutRef.current = cut.at;
    setLocalNotice(`${playerName(gamePlayers, cut.playerId)}님이 토론을 10초 줄였습니다.`);
    const timer = window.setTimeout(() => setLocalNotice(""), 2600);
    return () => window.clearTimeout(timer);
  }, [gamePlayers, state.lastDiscussionCut]);

  const run = async (payload: Record<string, unknown>, successCue?: PlaceMafiaCue) => {
    if (working) return;
    setWorking(true);
    try {
      await experience.unlock();
      await onAction(payload);
      if (successCue) experience.cue(successCue);
    }
    catch (error) {
      setLocalNotice(error instanceof Error ? error.message : "행동을 처리하지 못했어요.");
      window.setTimeout(() => setLocalNotice(""), 2600);
    } finally { setWorking(false); }
  };

  const selectAttack = (location: PlaceMafiaLocationId) => {
    experience.cue("select");
    const required = me?.requiredAttackCount ?? 1;
    setAttackChoices((items) => items.includes(location) ? items.filter((item) => item !== location) : [...items, location].slice(-required));
  };

  const selectMove = (location: PlaceMafiaLocationId) => {
    setMoveChoice(location);
    experience.cue("select");
  };

  const toggleRole = async () => {
    await experience.unlock();
    const opening = !roleOpen;
    setRoleOpen(opening);
    if (opening) experience.cue(me?.role === "mafia" ? "role-mafia" : "role-citizen");
    else experience.cue("tap");
  };

  const mapMode = state.phase === "night" && me?.isKiller && me.moveConfirmed && !me.attackConfirmed && me.requiredAttackCount > 0 ? "attack"
    : state.phase === "night" && !me?.moveConfirmed ? "move"
      : "display";
  const mapSelected = state.phase === "night" ? mapMode === "attack" ? attackChoices : moveChoice ? [moveChoice] : me?.selectedMove ? [me.selectedMove] : [] : [];
  const mapSelectable = mapMode === "attack" ? me?.legalAttackLocations ?? [] : mapMode === "move" ? me?.legalMoves ?? [] : [];

  return <main className={`pm-shell pm-game-shell pm-phase-${state.phase} ${experience.preferences.reduceMotion ? "pm-reduce-motion" : ""}`} onPointerDownCapture={() => void experience.unlock()}>
    <header className="pm-topbar"><div className="pm-room-code"><i />{code}</div><strong>장소 마피아</strong><div>{isHost && <button type="button" disabled={busy} onClick={onLobby}>대기실</button>}<button type="button" onClick={onLeave}>나가기</button></div></header>
    <PhaseHeader state={state} remaining={remaining} />
    {state.debug?.controller && <aside className="pm-debug-toolbar" aria-label="혼자 디버깅 제어판">
      <div><span>SOLO DEBUG</span><strong>가상 참가자 {state.debug.botCount}명 작동 중</strong><small>{state.phase === "role_reveal" ? "역할 확인 화면" : state.phase === "night" ? "이동·공격 화면" : state.phase === "day_reveal" ? "아침 결과 화면" : state.phase === "discussion" ? "낮 토론 화면" : state.phase === "vote" ? "익명 투표 화면" : state.phase === "execution" ? "판결 화면" : "최종 결과 화면"}</small></div>
      {state.phase !== "game_over" && <button type="button" disabled={working} onClick={() => void run({ action: "place-mafia-debug-skip" }, "confirm")}>다음 단계 ›</button>}
    </aside>}

    {transition && <div className={`pm-cinematic pm-cinematic-${state.phase}`} role="status" aria-live="polite"><div className="pm-cinematic-orbit" /><span>{transition.code}</span><strong>{transition.title}</strong><small>{transition.detail}</small></div>}

    {state.phase === "role_reveal" && me && <section className="pm-role-stage">
      <div className={`pm-role-card ${roleOpen ? "open" : ""} ${me.role}`}>
        <span>{roleOpen ? (me.role === "mafia" ? "MAFIA" : "CITIZEN") : "CLASSIFIED"}</span>
        <strong>{roleOpen ? roleName(me.role) : "내 역할 확인"}</strong>
        <p>{roleOpen ? me.role === "mafia" ? "시민을 속이고 마지막까지 살아남으세요." : "목격과 동선을 조합해 마피아를 찾아내세요." : "휴대폰을 가리고 눌러 확인하세요."}</p>
        {roleOpen && me.role === "mafia" && me.teammateIds.length > 0 && <div className="pm-teammate">동료 마피아 · {me.teammateIds.map((id) => playerName(gamePlayers, id)).join(", ")}</div>}
        <button type="button" onClick={() => void toggleRole()}>{roleOpen ? "역할 숨기기" : "비밀 카드 열기"}</button>
      </div>
      <div className="pm-role-progress"><span>{state.roleReadyCount}/{state.participantIds.length}</span><div><strong>역할 확인</strong><small>모두 확인하면 20초의 밤이 시작됩니다.</small></div></div>
      <button type="button" className="pm-primary-button" disabled={!roleOpen || working || me.roleReady} onClick={() => void run({ action: "place-mafia-ready" })}>{me.roleReady ? "확인 완료 · 다른 참가자 대기 중" : "역할 확인 완료"}</button>
    </section>}

    {state.phase !== "role_reveal" && state.phase !== "game_over" && <>
      <PlaceMafiaMap state={state} mode={mapMode} selected={mapSelected} selectable={mapSelectable} onSelect={mapMode === "attack" ? selectAttack : mapMode === "move" ? selectMove : undefined} />
      {(["day_reveal", "discussion", "execution"] as const).includes(state.phase as "day_reveal" | "discussion" | "execution") && <MinimalResultNotice state={state} players={gamePlayers} open={resultNoticeOpen} onToggle={() => setResultNoticeOpen((value) => !value)} />}
      {state.phase === "night" && <section className="pm-action-panel night">
        {!me?.alive ? <div className="pm-spectator"><strong>관전 중</strong></div>
          : !me.moveConfirmed ? <>
            <h2>{moveChoice ? `${placeMafiaLocationName(moveChoice)}으로 이동` : "이동 장소를 선택하세요"}</h2>
            <button type="button" className="pm-primary-button" disabled={!moveChoice || working || remaining <= 0} onClick={() => void run({ action: "place-mafia-move", location: moveChoice }, "confirm")}>이동 확정</button>
          </> : me.isKiller && me.requiredAttackCount > 0 && !me.attackConfirmed ? <>
            <h2>공격 장소 {me.requiredAttackCount}곳을 선택하세요</h2>
            <button type="button" className="pm-danger-button" disabled={attackChoices.length !== me.requiredAttackCount || working || remaining <= 0} onClick={() => void run({ action: "place-mafia-attack", locations: attackChoices }, "attack")}>{attackChoices.length === me.requiredAttackCount ? `${attackChoices.map(placeMafiaLocationName).join(" · ")} 습격 확정` : `공격 장소 ${me.requiredAttackCount}곳 선택`}</button>
          </> : <div className="pm-night-wait"><i /><span><strong>{me.isKiller && me.attackConfirmed ? "습격 지시 완료" : "이동 확정 완료"}</strong><small>모두 끝내도 밤은 20초를 끝까지 유지합니다.</small></span><time>{formatTimer(remaining)}</time></div>}
      </section>}

      {state.phase === "discussion" && <button type="button" className="pm-discussion-cut" disabled={!me?.alive || me.discussionCutUsed || remaining <= 20_000 || working} onClick={() => void run({ action: "place-mafia-shorten" })}>{me?.discussionCutUsed ? "−10초 사용 완료" : remaining <= 20_000 ? "마지막 20초" : "토론 −10초"}</button>}

      {state.phase === "vote" && <section className="pm-vote-panel">
        <header><h2>익명 투표</h2><p>마피아라고 생각하는 한 명을 고르세요</p></header>
        {!me?.alive ? <div className="pm-spectator"><span>OBSERVER</span><strong>투표를 지켜보는 중</strong></div>
          : me.voteSubmitted ? <div className="pm-sealed-vote"><span>SEALED</span><strong>투표를 봉인했습니다</strong><small>{state.voteSubmittedCount}/{livingPlayers.length}명 제출</small></div>
            : <>
              <div className="pm-vote-grid">{livingPlayers.map((player) => <button type="button" key={player.id} disabled={player.id === meId} className={voteTarget === player.id ? "selected" : ""} onClick={() => { setVoteTarget(player.id); setVoteConfirm(false); experience.cue("select"); }}><span>{player.avatar}</span><strong>{player.name}</strong><small>{player.id === meId ? "나" : voteTarget === player.id ? "지목 대상" : "선택"}</small></button>)}</div>
              {voteTarget && !voteConfirm && <button type="button" className="pm-primary-button" onClick={() => setVoteConfirm(true)}>{playerName(gamePlayers, voteTarget)} 지목하기</button>}
              {voteConfirm && <div className="pm-vote-confirm"><strong>{playerName(gamePlayers, voteTarget)}님에게 익명 투표할까요?</strong><small>투표 대상은 결과 화면에도 공개되지 않습니다.</small><div><button type="button" onClick={() => setVoteConfirm(false)}>취소</button><button type="button" disabled={working} onClick={() => void run({ action: "place-mafia-vote", targetId: voteTarget }, "vote")}>익명 투표 확정</button></div></div>}
            </>}
      </section>}

    </>}

    {state.phase === "game_over" && <section className={`pm-game-over ${state.winner}`}>
      <div className="pm-result-mark"><span>CASE CLOSED</span><h1>{state.winner === "mafia" ? "MAFIA WIN" : "CITIZEN WIN"}</h1><p>{state.winner === "mafia" ? "거짓 동선이 도시를 장악했습니다." : "모든 마피아를 찾아냈습니다."}</p></div>
      <div className="pm-final-roles">{state.participantIds.map((id) => <div key={id} className={state.finalRoles?.[id] ?? "citizen"}><span>{gamePlayers.find((player) => player.id === id)?.avatar ?? "·"}</span><div><strong>{playerName(gamePlayers, id)}</strong><small>{roleName(state.finalRoles?.[id])}</small></div><b>{state.deadPlayerIds.includes(id) ? "사망" : "생존"}</b></div>)}</div>
      {isHost ? <div className="pm-result-actions"><button type="button" className="pm-primary-button" disabled={busy} onClick={onReplay}>같은 멤버로 다시하기</button><button type="button" onClick={onLobby}>대기실로</button></div> : <div className="pm-waiting"><i />방장의 선택을 기다리는 중</div>}
    </section>}

    {localNotice && <div className="pm-toast" role="status">{localNotice}</div>}
    {overlays}
  </main>;
}
