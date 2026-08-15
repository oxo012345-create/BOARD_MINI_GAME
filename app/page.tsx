"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { gemAsset } from "./gem-heist-assets";
import { PlaceMafiaBriefing, PlaceMafiaGame } from "./place-mafia";
import type { PlaceMafiaBalance, PlaceMafiaClientState, PlaceMafiaSetup } from "./place-mafia-shared";
import { CashNGunsGame } from "./cash-n-guns";
import type { CashNGunsClientState } from "./cash-n-guns";

type Point = { x: number; y: number };
type Stroke = { eraser?: boolean; points: Point[] };
type Player = { id: string; name: string; avatar: string; joinedAt: number; lastSeen: number; status: "active" | "waiting" };
type HistoryItem = { prompt: string; answer?: string; imageId?: string; imageSource?: string };
type TelestrationChain = { id: string; prompt: string; steps: Array<{ playerId: string; strokes?: Stroke[]; guess?: string }> };
type GemCard = { id: string; label: string; icon: string; detail: string; group?: string; locationId?: string; evidenceGroup?: string };
type GemClue = { icon: string; title: string; text: string; strength: "정황" | "부분" | "교차검증" | "기밀" };
type GemDossier = {
  location: GemCard;
  trait: GemCard;
  alibi: GemCard;
  claimedAlibi: GemCard;
  statement: {
    locationClaim: string;
    witnessClaim: string;
    observedEvent: string;
    timeClaim: string;
    pressurePoint: string;
    privateSecret: string;
  };
};
type GemPrivate = {
  role: "thief" | "detective" | "accomplice" | "investigator";
  title: string;
  icon: string;
  goal: string;
  dossier: GemDossier;
  clues: GemClue[];
  thiefId?: string;
};
const GEM_CLUE_IMAGE_IDS = ["q43", "q44", "q35", "q21", "q30", "q40"];
type GemResult = {
  thiefId?: string;
  detectiveId?: string;
  accompliceId?: string;
  roles?: Record<string, GemPrivate["role"]>;
  dossiers?: Record<string, GemDossier>;
  clues?: Record<string, GemClue[]>;
  votes?: Record<string, string>;
  caught?: boolean;
  solution?: {
    culpritSignature: string[];
    finalSuspectIds?: string[];
    candidateSets: {
      traits: string[];
      locations: string[];
      evidenceGroups: string[];
    };
    decisiveClues: Array<{ title: string; explanation: string }>;
    reconstruction: string;
    decoyIds: string[];
  };
};
type GemCase = {
  scene: { id: string; title: string; icon: string; report: string };
  location: GemCard;
  stolenItem: GemCard;
  tool: GemCard;
  time: GemCard;
  report: string;
};
type GameRound = {
  id: string; title: string; prompt: string; briefing?: string; answer?: string; category?: string; liarId?: string; liarWord?: string;
  liarMode?: "normal" | "dumb"; storytellerId?: string; memoryWord?: string; memoryEntries?: string[]; memoryReady?: boolean;
  fakeSlot?: number; fakeMemoryIndex?: number; fakeMemoryText?: string; imageId?: string; imageSource?: string; startedAt: number;
  dealerId?: string; playerOrder?: string[]; currentPlayerIndex?: number; deadline?: number; correctVotes?: string[]; answerRevealed?: boolean; history?: HistoryItem[];
  choices?: string[]; selectionStatus?: string[]; myChoice?: string; selections?: Record<string, string>;
  timerResults?: Array<{ playerId: string; seconds: number; submittedAt: number }>;
  photoSubmissions?: Array<{ playerId: string; key: string; submittedAt: number }>;
  privateRole?: { danger: boolean; label: string; value: string }; isStoryteller?: boolean;
  successfulPlayerIds?: string[]; teamOutcome?: "passed" | "failed"; failedPlayerId?: string;
  telestrationTask?: { round: number; deadline?: number; submitted: boolean; prompt?: string; previousStrokes?: Stroke[]; action: "draw" | "guess" };
  telestrationResults?: TelestrationChain[]; telestrationComplete?: boolean; telestrationCorrectCount?: number; telestrationSubmitted?: string[];
  telestrationAutoCorrectChainIds?: string[]; telestrationAcceptedChainIds?: string[];
  gemSpecialRoles?: boolean; gemPhase?: "dossier" | "investigation" | "vote"; gemCase?: GemCase; gemPrivate?: GemPrivate;
  gemDifficulty?: "easy" | "normal" | "hard";
  gemQuestion?: GemCard; gemQuestionIndex?: number; gemVoteStatus?: string[]; gemMyVote?: string; gemResult?: GemResult; gemCaught?: boolean;
  mazeStartedAt?: number;
  mazeCharacters?: Record<string, number>; mazeReadyPlayerIds?: string[];
  mazeResults?: Array<{ playerId: string; score: number; recipeIndex: number }>;
  apartmentMaxFloor?: number; apartmentSubmitted?: string[]; apartmentMyChoice?: number; apartmentSelections?: Record<string, number>; apartmentFloorCounts?: Record<string, number>; apartmentPenaltyFloor?: number; apartmentPenaltyPlayerIds?: string[]; apartmentRevealed?: boolean;
  placeMafia?: PlaceMafiaClientState;
  placeMafiaSetup?: PlaceMafiaSetup;
  cashNGuns?: CashNGunsClientState;
};
type Surprise = { phase: "waiting" | "active" | "rest"; title?: string; text?: string; startedAt: number; endsAt: number; ruleId?: string; reveal?: boolean };
type Room = { code: string; hostId: string; players: Player[]; view: "lobby" | "hub" | "briefing" | "game" | "result"; roundNumber: number; revision?: number; serverNow: number; game?: GameRound; surpriseEnabled?: boolean; surprise?: Surprise; meId?: string; authenticated: boolean };
type GameMeta = { id: string; title: string; icon: string; description: string; category: "solo" | "coop" | "board" };

const AVATARS = ["😎", "🥳", "🤠", "👻", "🐥", "🐰", "🐻", "🦊"];
const SOLO_GAMES: GameMeta[] = [
  { id: "liar", title: "오리지널 라이어", icon: "🕵️", description: "한 명만 제시어를 몰라요", category: "solo" },
  { id: "dumb-liar", title: "바보 라이어", icon: "🤡", description: "한 명만 살짝 다른 단어를 받아요", category: "solo" },
  { id: "body-liar", title: "몸으로 라이어", icon: "🕺", description: "말 없이 몸으로 표현해요", category: "solo" },
  { id: "face-liar", title: "얼굴로 라이어", icon: "😶", description: "표정만으로 제시어를 표현해요", category: "solo" },
  { id: "unknown", title: "라이어-질문", icon: "❓", description: "한 명만 질문을 모르거나 달라요", category: "solo" },
  { id: "initial", title: "초성 퀴즈", icon: "ㄱ", description: "술래 오른쪽부터 틀릴 때까지", category: "solo" },
  { id: "hunmin", title: "무한 훈민정음", icon: "ㅎ", description: "초성 단어를 막힐 때까지 말해요", category: "solo" },
  { id: "taste", title: "취향 일치", icon: "🤝", description: "휴대폰으로 취향을 선택해요", category: "solo" },
  { id: "trivia", title: "중급 상식 퀴즈", icon: "💡", description: "술래 오른쪽부터 틀릴 때까지", category: "solo" },
  { id: "memory", title: "가짜 추억 찾기", icon: "🎭", description: "섞인 추억 중 가짜를 찾아요", category: "solo" },
  { id: "ten-seconds", title: "정확히 10초", icon: "⏱️", description: "각자 한 번씩 10초에 도전해요", category: "solo" },
  { id: "color", title: "색깔 찾기", icon: "🎨", description: "같은 색 물건을 찍어 올려요", category: "solo" },
  { id: "object-initial", title: "초성 물건 찾기", icon: "📸", description: "초성 물건을 찍어 올려요", category: "solo" },
  { id: "apartment", title: "아파트 게임", icon: "🏢", description: "가장 많이 겹친 층을 찾아 벌칙을 정해요 · 3인 이상", category: "solo" },
];
const COOP_GAMES: GameMeta[] = [
  { id: "telestration", title: "텔레그레이션", icon: "✏️", description: "그림을 보고 이어 그리는 릴레이", category: "coop" },
  { id: "people", title: "인물 퀴즈", icon: "👤", description: "한 명씩 5초, 전원 성공하면 통과", category: "coop" },
  { id: "chain", title: "줄줄이 말해요", icon: "🔗", description: "같은 주제로 한 명씩 5초 도전", category: "coop" },
  { id: "four", title: "네 글자 이어말하기", icon: "4️⃣", description: "한 명씩 5초, 전원 성공하면 통과", category: "coop" },
  { id: "syllable", title: "이어말하기 · 팀전", icon: "🗣️", description: "두 팀이 알아서 판정하는 이어말하기", category: "coop" },
  { id: "character", title: "캐릭터 퀴즈", icon: "🧸", description: "한 명씩 5초, 전원 성공하면 통과", category: "coop" },
  { id: "group-initial", title: "단체 초성 퀴즈", icon: "👥", description: "3초 안에 초성 단어를 말해요", category: "coop" },
];
const BOARD_GAMES: GameMeta[] = [
  { id: "place-mafia", title: "장소 마피아", icon: "⌖", description: "4~8인 위치·동선 추리 마피아", category: "board" },
  { id: "double-dealers", title: "수상한 딜러들", icon: "🎩", description: "3~8인 프라이빗 경매와 사실적인 소장품 카드", category: "board" },
  { id: "maze-courier", title: "미로의 배달부", icon: "📦", description: "최대 8인 서버 판정 3D 배달 대결", category: "board" },
  { id: "gem-heist", title: "사라진 보석", icon: "◇", description: "단서를 합쳐 보석 도둑을 찾아요", category: "board" },
];
BOARD_GAMES.push({ id: "cash-n-guns", title: "캐시 앤 건즈", icon: "¤", description: "4~8인 · 총을 겨누고 전리품을 차지하는 픽셀 보드게임", category: "board" });
const ALL_GAMES = [...SOLO_GAMES, ...COOP_GAMES, ...BOARD_GAMES];
const RANDOM_GAMES = ALL_GAMES.filter((game) => game.id !== "syllable");
const randomGamesForPlayers = (count: number) => RANDOM_GAMES.filter((game) => game.id !== "cash-n-guns" || (count >= 4 && count <= 8));
const LIAR_OPTION_GAMES = ["liar", "body-liar", "face-liar", "unknown"];
const FAST_SYNC_INTERVAL_MS = 500;
const IDLE_SYNC_INTERVAL_MS = 1400;
const HOST_ACTION_LOCK_MS = 350;
const REALTIME_RECONNECT_MIN_MS = 500;
const REALTIME_RECONNECT_MAX_MS = 8000;
const REALTIME_SAFETY_SYNC_INTERVAL_MS = 5000;
const FAST_SYNC_VIEWS: Room["view"][] = ["hub", "briefing", "game"];
const pick = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)];

function getStoredValue(key: string, fallback = "") { return typeof window === "undefined" ? fallback : localStorage.getItem(key) || fallback; }
async function patchRoomWithConflictRetry(code: string, payload: Record<string, unknown>, options: { keepalive?: boolean; attempts?: number } = {}) {
  const attempts = options.attempts ?? 4;
  let lastResponse: Response | null = null;
  let lastBody: { room?: Room | null; error?: string; code?: string } = {};
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await fetch(`/api/rooms/${code}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: options.keepalive,
    });
    const body = await response.json() as { room?: Room | null; error?: string; code?: string };
    lastResponse = response;
    lastBody = body;
    if (response.status !== 409 || body.code !== "ROOM_CONFLICT") return { response, body };
    await new Promise((resolve) => window.setTimeout(resolve, 35 * (attempt + 1)));
  }
  return { response: lastResponse!, body: lastBody };
}
function getRoomCodeFromUrl() { return typeof window === "undefined" ? "" : new URLSearchParams(location.search).get("room")?.replace(/\D/g, "").slice(0, 4) || ""; }
function getFreshRoomCodeFromUrl() {
  if (typeof window === "undefined") return "";
  const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  const legacyType = (performance as Performance & { navigation?: { type: number } }).navigation?.type;
  const isFreshNavigation = navigation ? navigation.type === "navigate" : legacyType === undefined || legacyType === 0;
  return isFreshNavigation ? getRoomCodeFromUrl() : "";
}
function playerName(room: Room, id?: string) { return room.players.find((player) => player.id === id)?.name ?? "참가자"; }
function formatClock(ms: number) { const seconds = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`; }

function QuizImageRequest({ imageId }: { imageId: string }) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const retry = () => { setFailed(false); setAttempt((value) => value + 1); };
  return <div className="quiz-image">{!failed
    ? <img src={`/api/game-image/${imageId}?retry=${attempt}`} alt="퀴즈 이미지" draggable={false} onError={() => setFailed(true)} />
    : <div className="image-fallback"><span>사진을 불러오지 못했어요</span><button type="button" onClick={retry}>다시 불러오기</button></div>}
  </div>;
}

function QuizImage({ imageId }: { imageId: string }) {
  return <QuizImageRequest key={imageId} imageId={imageId} />;
}

function ApartmentBuilding({ maxFloor, selectedFloor, onSelect, submittedIds, players, revealed, counts, penaltyFloor, penaltyPlayerIds, preview }: { maxFloor: number; selectedFloor?: number; onSelect?: (floor: number) => void; submittedIds: string[]; players: Player[]; revealed?: boolean; counts?: Record<string, number>; penaltyFloor?: number; penaltyPlayerIds?: string[]; preview?: boolean }) {
  const floors = Array.from({ length: maxFloor }, (_, index) => maxFloor - index);
  const penaltyNames = (penaltyPlayerIds ?? []).map((id) => players.find((player) => player.id === id)?.name ?? "참가자");
  const submittedSet = new Set(submittedIds);
  const submittedNames = players.filter((player) => submittedSet.has(player.id)).map((player) => player.name);
  const waitingNames = players.filter((player) => !submittedSet.has(player.id)).map((player) => player.name);
  return <section className={`apartment-board ${revealed ? "revealed" : ""} ${preview ? "preview" : ""}`}>
    <div className="apartment-board-heading">
      <div><span className="apartment-kicker">APARTMENT DRAW</span><h2>{revealed ? `${penaltyFloor}층 벌칙 층` : `${maxFloor}층 아파트`}</h2><p>{revealed ? penaltyNames.length ? `${penaltyNames.join(", ")} · 같은 층에 모였어요.` : "벌칙 대상이 정해졌어요." : "한 층을 골라 주세요"}</p></div>
      <strong>{revealed ? "RESULT" : `${maxFloor}F`}</strong>
    </div>
    <div className="apartment-scene">
      <div className="apartment-skyline"><i /><i /><i /><i /><span>HANPAN HEIGHTS</span></div>
      <div className="apartment-building">
        <div className="apartment-roof" aria-hidden="true">{Array.from({ length: 9 }, (_, index) => <span key={index} />)}</div>
        <div className="apartment-floors">
          {floors.map((floor) => {
            const count = counts?.[String(floor)] ?? 0;
            const isSelected = selectedFloor === floor;
            const isPenalty = revealed && penaltyFloor === floor;
            return <button type="button" key={floor} disabled={revealed || !onSelect} className={`apartment-floor ${isSelected ? "selected" : ""} ${isPenalty ? "penalty" : ""}`} onClick={() => onSelect?.(floor)} aria-pressed={isSelected}>
              <span className="apartment-floor-number">{floor}<small>F</small></span>
              <span className="apartment-windows" aria-hidden="true">{Array.from({ length: 6 }, (_, index) => <i key={index} className={(floor + index) % 4 === 0 ? "lit" : ""} />)}</span>
              <span className="apartment-floor-meta">{isPenalty ? "벌칙 층" : revealed ? count ? `${count}명 겹침` : "비어 있음" : isSelected ? "내 선택" : "선택"}</span>
            </button>;
          })}
        </div>
        <div className="apartment-lobby"><span>H</span><small>LOBBY</small></div>
      </div>
      <div className="apartment-street"><i /><i /><i /></div>
    </div>
    {!revealed && !preview && <div className="apartment-submit-status">
      <div className="apartment-status-head"><div><span className="status-dot" /><strong>{submittedIds.length}/{players.length}명 선택 완료</strong></div><small>층 번호는 결과 공개 전까지 비공개</small></div>
      <div className="apartment-status-groups">
        <div className="apartment-status-group submitted"><span>선택 완료</span><div className="apartment-name-list">{submittedNames.length ? submittedNames.map((name, index) => <b key={`${name}-${index}`}>{name}</b>) : <em>아직 없음</em>}</div></div>
        <div className="apartment-status-group waiting"><span>아직 선택 안 함</span><div className="apartment-name-list">{waitingNames.length ? waitingNames.map((name, index) => <b key={`${name}-${index}`}>{name}</b>) : <em>모두 선택 완료</em>}</div></div>
      </div>
    </div>}
    {revealed && <div className="apartment-verdict"><span>벌칙 판정</span><strong>{penaltyFloor}층 · {penaltyNames.length ? penaltyNames.join(", ") : "해당 없음"}</strong><small>가장 많이 겹친 층 우선 · 동률이면 낮은 층 · 겹침이 없으면 가장 낮은 층</small></div>}
  </section>;
}

function ApartmentResultSummary({ maxFloor, players, selections, counts, penaltyFloor, penaltyPlayerIds }: { maxFloor: number; players: Player[]; selections?: Record<string, number>; counts?: Record<string, number>; penaltyFloor?: number; penaltyPlayerIds?: string[] }) {
  const groups = new Map<number, string[]>();
  for (const player of players) {
    const floor = selections?.[player.id];
    if (!Number.isInteger(floor)) continue;
    const normalizedFloor = Number(floor);
    const names = groups.get(normalizedFloor) ?? [];
    names.push(player.name);
    groups.set(normalizedFloor, names);
  }
  const rows = Array.from({ length: maxFloor }, (_, index) => maxFloor - index).filter((floor) => groups.has(floor));
  const penaltyNames = (penaltyPlayerIds ?? []).map((id) => players.find((player) => player.id === id)?.name ?? "참가자");
  const shownPenaltyNames = penaltyNames.length ? penaltyNames : (groups.get(penaltyFloor ?? -1) ?? []);
  return <section className="apartment-result-summary" data-apartment-result-screen>
    <div className="apartment-result-heading"><div><span>RESULT</span><h2>아파트 게임 결과</h2><p>각자 고른 층과 겹친 인원을 확인하세요.</p></div><strong>{shownPenaltyNames.length}명</strong></div>
    <div className="apartment-result-verdict"><span>벌칙 층</span><strong>{penaltyFloor ? `${penaltyFloor}층` : "계산 중"}</strong><b>{shownPenaltyNames.length ? shownPenaltyNames.join(", ") : "벌칙 대상 확인 중"}</b></div>
    <div className="apartment-result-list">
      {rows.length ? rows.map((floor) => {
        const names = groups.get(floor) ?? [];
        const count = counts?.[String(floor)] ?? names.length;
        return <div className={`apartment-result-row ${floor === penaltyFloor ? "penalty" : ""}`} key={floor}><strong>{floor}층</strong><span>{names.join(", ")}</span><b>{count}명</b></div>;
      }) : <div className="apartment-result-empty">선택 결과를 불러오는 중이에요.</div>}
    </div>
    <small className="apartment-result-rule">가장 많이 겹친 층 우선 · 동률이면 낮은 층 · 겹침이 없으면 가장 낮은 층</small>
  </section>;
}

function ConfirmDialog({ title, message, confirmLabel, busy, onConfirm, onCancel }: { title: string; message: string; confirmLabel: string; busy?: boolean; onConfirm: () => void; onCancel: () => void }) {
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={title}><section className="confirm-card"><div className="eyebrow">한 번 더 확인</div><h2>{title}</h2><p>{message}</p><div className="confirm-actions"><button className="button secondary" disabled={busy} onClick={onCancel}>취소</button><button className="button danger-button" disabled={busy} onClick={onConfirm}>{busy ? "처리 중…" : confirmLabel}</button></div></section></div>;
}

type SurprisePosition = { side: "left" | "center" | "right"; y: number };

function SurpriseDrawer({ surprise, now, collapsed, onCollapsedChange, position, onPositionChange }: {
  surprise: Surprise;
  now: number;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  position: SurprisePosition;
  onPositionChange: (position: SurprisePosition) => void;
}) {
  const drag = useRef<{ pointerId: number; startX: number; startY: number; offsetY: number; moved: boolean } | null>(null);
  const pointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.parentElement?.getBoundingClientRect();
    drag.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, offsetY: event.clientY - (rect?.top ?? position.y), moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const pointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const state = drag.current;
    if (!state || state.pointerId !== event.pointerId) return;
    if (Math.abs(event.clientX - state.startX) > 5 || Math.abs(event.clientY - state.startY) > 5) state.moved = true;
    if (!state.moved) return;
    const maxY = Math.max(12, window.innerHeight - (collapsed ? 70 : 190));
    onPositionChange({ side: event.clientX < window.innerWidth / 2 ? "left" : "right", y: Math.min(maxY, Math.max(12, event.clientY - state.offsetY)) });
  };
  const pointerUp = () => {
    const state = drag.current;
    drag.current = null;
    if (state && !state.moved) onCollapsedChange(!collapsed);
  };
  return <aside className={`surprise-drawer ${position.side} ${collapsed ? "collapsed" : ""}`} style={{ top: position.y }}>
    <button onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={() => { drag.current = null; }}>
      {!collapsed && <span>⚡ {surprise.title}</span>}
      <strong>{formatClock(surprise.endsAt - now)}</strong>
    </button>
    {!collapsed && <p>{surprise.text?.split("\n").map((line) => <span key={line}>{line}</span>)}</p>}
  </aside>;
}

function StrokePreview({ strokes, label }: { strokes: Stroke[]; label?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { drawCanvas(ref.current, strokes); }, [strokes]);
  return <div className="stroke-preview">{label && <small>{label}</small>}<canvas ref={ref} /></div>;
}

function drawCanvas(canvas: HTMLCanvasElement | null, strokes: Stroke[], current?: Stroke) {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, rect.width, rect.height);
  for (const stroke of [...strokes, ...(current ? [current] : [])]) {
    if (stroke.points.length < 1) continue;
    ctx.beginPath();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = stroke.eraser ? "#fff" : "#111";
    ctx.lineWidth = stroke.eraser ? 22 : 4;
    ctx.moveTo(stroke.points[0].x * rect.width, stroke.points[0].y * rect.height);
    for (const point of stroke.points.slice(1)) ctx.lineTo(point.x * rect.width, point.y * rect.height);
    ctx.stroke();
  }
}

function DrawingBoard({ task, clockOffsetMs, onSubmit }: { task: NonNullable<GameRound["telestrationTask"]>; clockOffsetMs: number; onSubmit: (payload: { strokes?: Stroke[]; guess?: string }) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const strokesRef = useRef<Stroke[]>([]);
  const working = useRef<Stroke | null>(null);
  const [eraser, setEraser] = useState(false);
  const [guess, setGuess] = useState("");
  const [now, setNow] = useState(0);
  const sent = useRef(false);
  useEffect(() => { strokesRef.current = strokes; drawCanvas(canvasRef.current, strokes); }, [strokes]);
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 100); return () => window.clearInterval(id); }, []);
  const submit = useCallback(() => {
    if (sent.current || task.submitted) return;
    sent.current = true;
    onSubmit(task.action === "guess" ? { guess } : { strokes: strokesRef.current });
  }, [guess, onSubmit, task.action, task.submitted]);
  useEffect(() => { if (task.deadline && task.deadline <= now + clockOffsetMs) submit(); }, [clockOffsetMs, now, submit, task.deadline]);
  if (task.submitted) return <div className="waiting-card"><span className="big-emoji">✅</span><h2>제출 완료</h2><p>다른 참가자의 제출을 기다리고 있어요.</p></div>;
  const remaining = Math.max(0, (task.deadline ?? now + clockOffsetMs) - (now + clockOffsetMs));
  if (task.action === "guess") return <section className="drawing-stage"><div className="drawing-round">텔레그레이션 {task.round} / 4</div><div className="drawing-timer unlimited">제한시간 없음</div><h2>마지막 그림의 정답은?</h2><StrokePreview strokes={task.previousStrokes ?? []} /><input className="text-field" maxLength={30} placeholder="정답 입력" value={guess} onChange={(event) => setGuess(event.target.value)} /><button className="button primary xl" onClick={submit}>정답 제출</button></section>;
  const point = (event: React.PointerEvent<HTMLCanvasElement>) => { const rect = event.currentTarget.getBoundingClientRect(); return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height }; };
  return <section className="drawing-stage"><div className="drawing-round">텔레그레이션 {task.round} / 4</div><div className="drawing-timer">{Math.ceil(remaining / 1000)}초</div>{task.round === 1 ? <><div className="eyebrow">내 제시어</div><h2>{task.prompt}</h2></> : <><h2>이 그림을 보고 다시 그리세요</h2><StrokePreview strokes={task.previousStrokes ?? []} /></>}<canvas className="drawing-canvas" ref={canvasRef}
    onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); working.current = { eraser, points: [point(event)] }; drawCanvas(canvasRef.current, strokesRef.current, working.current); }}
    onPointerMove={(event) => { if (!working.current) return; working.current.points.push(point(event)); drawCanvas(canvasRef.current, strokesRef.current, working.current); }}
    onPointerUp={() => { if (!working.current) return; const next = [...strokesRef.current, working.current]; working.current = null; strokesRef.current = next; setStrokes(next); }} />
    <div className="drawing-tools"><button className={!eraser ? "active" : ""} onClick={() => setEraser(false)}>검은 펜</button><button className={eraser ? "active" : ""} onClick={() => setEraser(true)}>지우개</button><button onClick={() => setStrokes((items) => items.slice(0, -1))}>되돌리기</button><button onClick={() => setStrokes([])}>전체 지우기</button></div><button className="button primary xl" onClick={submit}>그림 제출</button></section>;
}

async function compressPhoto(file: File) {
  let source: CanvasImageSource;
  let width: number;
  let height: number;
  let cleanup = () => {};
  try {
    const bitmap = await createImageBitmap(file);
    source = bitmap; width = bitmap.width; height = bitmap.height; cleanup = () => bitmap.close();
  } catch {
    const url = URL.createObjectURL(file);
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element); element.onerror = () => reject(new Error("사진을 불러오지 못했어요.")); element.src = url;
    });
    source = image; width = image.naturalWidth; height = image.naturalHeight; cleanup = () => URL.revokeObjectURL(url);
  }
  const scale = Math.min(1, 1280 / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  if (!context) { cleanup(); throw new Error("사진 변환을 지원하지 않는 브라우저예요."); }
  try { context.drawImage(source, 0, 0, canvas.width, canvas.height); }
  finally { cleanup(); }
  const blob = await new Promise<Blob | null>((resolve) => {
    try { canvas.toBlob(resolve, "image/jpeg", .8); }
    catch { resolve(null); }
  });
  if (blob) return blob;
  try { return await (await fetch(canvas.toDataURL("image/jpeg", .8))).blob(); }
  catch { throw new Error("사진을 변환하지 못했어요."); }
}

async function uploadPhotoWithRetry(roomCode: string, blob: Blob) {
  let lastError = new Error("사진을 올리지 못했어요.");
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    try {
      const form = new FormData();
      form.append("photo", blob, "camera.jpg");
      const response = await fetch(`/api/rooms/${roomCode}/photos`, { method: "POST", body: form, signal: controller.signal });
      const body = await response.json().catch(() => ({})) as { room?: Room; error?: string };
      if (response.ok && body.room) return body.room;
      lastError = new Error(body.error || "사진을 올리지 못했어요.");
      if (response.status < 500) break;
    } catch (error) {
      lastError = error instanceof DOMException && error.name === "AbortError"
        ? new Error("사진 업로드 시간이 초과됐어요.")
        : new Error("인터넷 연결을 확인하고 다시 시도해 주세요.");
    } finally {
      window.clearTimeout(timeout);
    }
    if (attempt === 0) await new Promise((resolve) => window.setTimeout(resolve, 500));
  }
  throw lastError;
}

function GemCaseBoard({ game, compact = false }: { game: GameRound; compact?: boolean }) {
  const caseFile = game.gemCase;
  if (!caseFile) return null;
  return <section className={`gem-case-board ${compact ? "compact" : ""}`}>
    <div className="gem-scene-art">
      <img className="gem-scene-photo" src={gemAsset("scenes", caseFile.scene.id)} alt="" aria-hidden="true" />
      <div className="gem-case-no">CASE {String(game.startedAt).slice(-6)}</div>
      <div className="gem-scene-status"><span>INCIDENT</span><strong>도난 사건</strong></div>
      <div className="gem-scene-copy">
        <span className="gem-kicker">사건 발생</span>
        <h2>{caseFile.scene.title}</h2>
        <p>{caseFile.report}</p>
      </div>
      <div className="gem-evidence-grid">
        <div className="evidence-item stolen">
          <div className="gem-evidence-visual"><img src={gemAsset("items", caseFile.stolenItem.id)} alt="" aria-hidden="true" /></div>
          <div className="gem-evidence-copy"><span>도난품</span><strong>{caseFile.stolenItem.label}</strong></div>
        </div>
        <div className="evidence-item location">
          <div className="gem-evidence-visual"><img src={gemAsset("locations", caseFile.location.id)} alt="" aria-hidden="true" /></div>
          <div className="gem-evidence-copy"><span>사건 장소</span><strong>{caseFile.location.label}</strong></div>
        </div>
        <div className="evidence-item time">
          <GemClock time={caseFile.time} />
          <div className="gem-evidence-copy"><span>범행 시각</span><strong>{caseFile.time.label}</strong></div>
        </div>
        <div className="evidence-item tool">
          <div className="gem-evidence-visual"><img src={gemAsset("tools", caseFile.tool.id)} alt="" aria-hidden="true" /></div>
          <div className="gem-evidence-copy"><span>발견된 도구</span><strong>{caseFile.tool.label}</strong></div>
        </div>
      </div>
    </div>
  </section>;
}

const GEM_CLOCK_ANGLES: Record<string, { hour: number; minute: number }> = {
  dusk: { hour: 215, minute: 60 },
  toast: { hour: 240, minute: 0 },
  quartet: { hour: 260, minute: 240 },
  blackout: { hour: 276.5, minute: 78 },
  fireworks: { hour: 295, minute: 300 },
  dessert: { hour: 310, minute: 120 },
  rain: { hour: 323.5, minute: 282 },
  midnight: { hour: 1.5, minute: 18 },
  "after-midnight": { hour: 12.5, minute: 150 },
  dawn: { hour: 35, minute: 60 },
};

function GemClock({ time }: { time: GemCard }) {
  const angles = GEM_CLOCK_ANGLES[time.id] ?? { hour: 0, minute: 0 };
  const style = {
    "--gem-hour-angle": `${angles.hour}deg`,
    "--gem-minute-angle": `${angles.minute}deg`,
  } as CSSProperties;
  return <div className="gem-clock-visual" aria-hidden="true">
    <div className="gem-clock" style={style}>
      <i className="hour" />
      <i className="minute" />
      <b />
    </div>
  </div>;
}

function GemSecretFile({ info, room, visible, onVisibleChange }: { info: GemPrivate; room: Room; visible: boolean; onVisibleChange: (visible: boolean) => void }) {
  const dossier = info.dossier;
  const isThief = info.role === "thief";
  const isHiddenRole = isThief || info.role === "accomplice";
  const shownAlibi = isThief ? dossier.claimedAlibi : dossier.alibi;
  const roleMark = info.role === "thief" ? "T" : info.role === "detective" ? "D" : info.role === "accomplice" ? "A" : "I";
  return <section
    id="gem-secret-file"
    className={`gem-secret-file ${visible ? "revealed" : ""} role-${info.role}`}
    onContextMenu={(event) => event.preventDefault()}
    onDragStart={(event) => event.preventDefault()}
  >
    {!visible ? <button type="button" className="gem-file-toggle" onClick={() => onVisibleChange(true)} aria-expanded="false">
      <div className="gem-file-closed">
      <img src="/gem-secret-dossier.webp" alt="" aria-hidden="true" />
      <div><span>TOP SECRET · 개인 열람</span><strong>내 사건 파일</strong><small>휴대폰을 가리고 확인하세요</small><i>눌러서 열기</i></div>
      </div>
    </button> : <div className="gem-file-open">
      <div className="gem-file-hero">
        <img src={gemAsset("traits", dossier.trait.id)} alt="" aria-hidden="true" />
        <span>PERSONAL CASE FILE</span>
        <button type="button" className="gem-file-close" onClick={() => onVisibleChange(false)} aria-label="사건 파일 닫기">닫기</button>
        <div className="gem-role-overlay">
          <div className="gem-role-stamp"><b>{roleMark}</b><div><small>당신의 역할</small><strong>{info.title}</strong></div></div>
          <p className="gem-role-goal">{info.goal}</p>
        </div>
      </div>
      {info.thiefId && info.role === "accomplice" && <div className="gem-accomplice-secret">범인 · <strong>{playerName(room, info.thiefId)}</strong></div>}
      <div className="gem-dossier-grid">
        <div className="gem-dossier-item location"><i aria-hidden="true" style={{ backgroundImage: `url("${gemAsset("locations", dossier.location.id)}")` }} /><div><span>{isThief ? "실제 위치" : "내 위치"}</span><strong>{dossier.location.label}</strong></div></div>
        <div className="gem-dossier-item trait"><i aria-hidden="true" style={{ backgroundImage: `url("${gemAsset("traits", dossier.trait.id)}")` }} /><div><span>내 특징</span><strong>{dossier.trait.label}</strong></div></div>
        <div className={`gem-dossier-item alibi ${isThief ? "cover" : ""}`}><i aria-hidden="true" style={{ backgroundImage: `url("${gemAsset("alibis", shownAlibi.id)}")` }} /><div><span>{isThief ? "말할 가짜 알리바이" : "내 알리바이"}</span><strong>{shownAlibi.label}</strong></div></div>
      </div>
      <details className="gem-disclosure">
        <summary><span>자세한 진술 보기</span><small>사건 전후 행동 · 알리바이 참고사항</small></summary>
        <div className="gem-statement-file">
          <div className="gem-statement-grid">
            <div><small>장소와 행동</small><strong>{dossier.statement.locationClaim}</strong></div>
            <div><small>사건 전 목격</small><strong>{dossier.statement.witnessClaim}</strong></div>
            <div><small>사건 직전</small><strong>{dossier.statement.observedEvent}</strong></div>
            <div><small>사건 시각</small><strong>{dossier.statement.timeClaim}</strong></div>
            <div><small>참고사항</small><strong>{dossier.statement.pressurePoint}</strong></div>
          </div>
          <div className={`gem-private-secret ${isHiddenRole ? "" : "truth"}`}><small>{isHiddenRole ? "비밀 지침" : "진술 원칙"}</small><strong>{dossier.statement.privateSecret}</strong></div>
        </div>
      </details>
      <div className="gem-file-section-title clue-title"><span>EVIDENCE</span><strong>내 단서</strong></div>
      {!isHiddenRole && <div className="gem-one-clue-rule compact"><b>공개 규칙</b><strong>단서 1개만 말하기</strong></div>}
      <div className="gem-clue-stack">{info.clues.map((clue, index) => <div className={`gem-clue-card clue-${index % 3}`} key={`${clue.title}-${index}`}>
        <span className="gem-clue-photo" aria-hidden="true" style={{ backgroundImage: `linear-gradient(90deg, transparent, rgba(11,15,19,.34)), url("${gemAsset("questions", GEM_CLUE_IMAGE_IDS[index % GEM_CLUE_IMAGE_IDS.length])}")` }} /><div><small>{clue.title} · {clue.strength}</small><strong>{clue.text}</strong></div>
      </div>)}</div>
      <button type="button" className="gem-file-close-bottom" onClick={() => onVisibleChange(false)}>사건 파일 닫기</button>
    </div>}
  </section>;
}

function GemStageRail({ phase }: { phase?: GameRound["gemPhase"] }) {
  const stage = phase === "vote" ? 3 : phase === "investigation" ? 2 : 1;
  return <div className="gem-stage-rail" aria-label={`수사 ${stage}단계`}>
    {["사건 파일", "공개 수사", "최종 지목"].map((label, index) => <div className={index + 1 < stage ? "done" : index + 1 === stage ? "active" : ""} key={label}><span>{index + 1 < stage ? "✓" : index + 1}</span><small>{label}</small></div>)}
  </div>;
}

function GemResultPanel({ room, game }: { room: Room; game: GameRound }) {
  const result = game.gemResult;
  if (!result) return null;
  const votes = result.votes ?? {};
  const voteCounts = room.players.map((player) => ({
    player,
    count: Object.values(votes).filter((targetId) => targetId === player.id).length,
  })).sort((a, b) => b.count - a.count);
  const thief = room.players.find((player) => player.id === result.thiefId);
  const thiefDossier = result.thiefId ? result.dossiers?.[result.thiefId] : undefined;
  const roleLabel = (role?: GemPrivate["role"]) => role === "thief" ? "보석 도둑" : role === "detective" ? "수석 탐정" : role === "accomplice" ? "비밀 공범" : "수사대";
  return <div className={`gem-result-panel ${result.caught ? "caught" : "escaped"}`}>
    <div className="gem-result-hero"><img src={gemAsset("items", game.gemCase?.stolenItem.id)} alt="" aria-hidden="true" /></div>
    <div className="gem-verdict-mark">{result.caught ? "CLOSED" : "UNSOLVED"}</div>
    <span className="gem-kicker">{result.caught ? "CASE CLOSED" : "CASE UNSOLVED"}</span>
    <h2>{result.caught ? "보석 도둑을 잡았습니다" : "범인이 흔적을 지웠습니다"}</h2>
    <p>{result.caught ? "수사대 승리" : "범인 탈출"}</p>
    <div className="gem-thief-reveal">
      <span className="player-avatar">{thief?.avatar ?? "🕵️"}</span>
      <div><small>진짜 범인</small><strong>{thief?.name ?? "알 수 없음"}</strong></div>
      <em>{thiefDossier?.trait.icon} {thiefDossier?.trait.label}</em>
    </div>
    {thiefDossier && <div className="gem-result-evidence">
      <div><span>실제 위치</span><strong>{thiefDossier.location.label}</strong></div>
      <div><span>가짜 알리바이</span><strong>{thiefDossier.claimedAlibi.label}</strong></div>
    </div>}
    {result.solution && <>
      {(result.solution.finalSuspectIds?.length ?? 0) > 0 && <div className="gem-final-suspects"><small>모든 단서로 남은 최종 용의자</small><strong>{result.solution.finalSuspectIds?.map((playerId) => playerName(room, playerId)).join(" · ")}</strong></div>}
      <details className="gem-result-disclosure">
        <summary>사건의 전말 보기</summary>
        <div className="gem-case-explanation"><p>{result.solution.reconstruction}</p></div>
      </details>
      <details className="gem-result-disclosure">
        <summary>단서 해설 보기</summary>
        <div className="gem-decisive-clues">
          {result.solution.decisiveClues.map((clue, index) => <div key={clue.title}><span>{String(index + 1).padStart(2, "0")}</span><div><small>{clue.title}</small><strong>{clue.explanation}</strong></div></div>)}
        </div>
        <div className="gem-signature"><span>세 가지 교집합</span><strong>{result.solution.culpritSignature.join(" · ")}</strong></div>
      </details>
    </>}
    <details className="gem-result-disclosure">
      <summary>투표 결과 보기</summary>
      <div className="gem-vote-result">
        {voteCounts.map(({ player, count }) => <div key={player.id}><span>{player.avatar} {player.name}<small>{roleLabel(result.roles?.[player.id])}</small></span><strong>{count}표</strong></div>)}
      </div>
      <div className="gem-vote-map">
        {room.players.map((player) => <span key={player.id}>{player.name} <b>→</b> {playerName(room, votes[player.id])}</span>)}
      </div>
    </details>
    {result.accompliceId && <div className="gem-special-reveal">비밀 공범은 <strong>{playerName(room, result.accompliceId)}</strong>이었어요.</div>}
    {result.detectiveId && <div className="gem-special-reveal detective">수석 탐정은 <strong>{playerName(room, result.detectiveId)}</strong>이었어요.</div>}
  </div>;
}

export default function Home() {
  const [room, setRoom] = useState<Room | null>(null);
  const [resumeRoom, setResumeRoom] = useState<Room | null>(null);
  const [name, setName] = useState(() => getStoredValue("hanpan-name"));
  const [avatar, setAvatar] = useState(() => getStoredValue("hanpan-avatar", AVATARS[0]));
  const [joinCode, setJoinCode] = useState(getFreshRoomCodeFromUrl);
  const [intent, setIntent] = useState<"create" | "join" | null>(null);
  const [tab, setTab] = useState<"solo" | "coop" | "board">("solo");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [roleVisible, setRoleVisible] = useState(false);
  const [qr, setQr] = useState("");
  const [memoryInputs, setMemoryInputs] = useState(["", "", "", ""]);
  const [timerStart, setTimerStart] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [serverClockOffsetMs, setServerClockOffsetMs] = useState(0);
  const [liarMode, setLiarMode] = useState<"normal" | "dumb">("normal");
  const [gemSpecialRoles, setGemSpecialRoles] = useState(false);
  const [gemDifficulty, setGemDifficulty] = useState<"easy" | "normal" | "hard">("normal");
  const [gemSuspect, setGemSuspect] = useState("");
  const [placeMafiaDiscussion, setPlaceMafiaDiscussion] = useState<60 | 90 | 120>(90);
  const [placeMafiaBalance, setPlaceMafiaBalance] = useState<PlaceMafiaBalance>("normal");
  const [placeMafiaCount, setPlaceMafiaCount] = useState<1 | 2>(1);
  const [confirmType, setConfirmType] = useState<"leave" | "finish" | "lobby" | "fail" | null>(null);
  const [surpriseCollapsed, setSurpriseCollapsed] = useState(false);
  const [surprisePosition, setSurprisePosition] = useState<SurprisePosition>({ side: "right", y: 220 });
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<"connected" | "reconnecting" | "restored">("connected");
  const [hostActionLocked, setHostActionLocked] = useState(false);
  const [cashDebugMode, setCashDebugMode] = useState(() => typeof window !== "undefined" && new URLSearchParams(location.search).get("debug") === "1");
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const leavingRef = useRef(false);
  const alertedSurprise = useRef(0);
  const timerSubmitting = useRef(false);
  const connectionStateRef = useRef<"connected" | "reconnecting" | "restored">("connected");
  const connectionFailuresRef = useRef(0);
  const connectionRestoreTimerRef = useRef<number | null>(null);
  const hostActionLockRef = useRef(false);
  const roomRequestSequenceRef = useRef(0);
  const lastAppliedRoomSequenceRef = useRef(0);
  const roomMutationCountRef = useRef(0);
  const realtimeRevisionRef = useRef(0);
  const roomRefreshRef = useRef<() => void>(() => undefined);
  const realtimeAbortRef = useRef<AbortController | null>(null);
  const roleTouchRevealRef = useRef(false);
  const mazeFinishSubmittingRef = useRef(false);
  const me = room?.players.find((player) => player.id === room.meId);
  const isHost = Boolean(room && room.hostId === room.meId);
  const currentGame = room?.game;
  const roomCode = room?.code;
  const debugMode = cashDebugMode;
  const fallbackSyncInterval = room && FAST_SYNC_VIEWS.includes(room.view) ? FAST_SYNC_INTERVAL_MS : IDLE_SYNC_INTERVAL_MS;
  const syncInterval = realtimeConnected ? REALTIME_SAFETY_SYNC_INTERVAL_MS : fallbackSyncInterval;

  const nextRoomRequestSequence = useCallback(() => {
    roomRequestSequenceRef.current += 1;
    return roomRequestSequenceRef.current;
  }, []);
  const applyRoomSnapshot = useCallback((nextRoom: Room | null, sequence: number) => {
    if (sequence < lastAppliedRoomSequenceRef.current) return false;
    lastAppliedRoomSequenceRef.current = sequence;
    realtimeRevisionRef.current = nextRoom?.revision ?? 0;
    if (nextRoom?.serverNow) setServerClockOffsetMs(nextRoom.serverNow - Date.now());
    setRoom(nextRoom);
    return true;
  }, []);

  const markConnectionFailure = useCallback((immediate = false) => {
    connectionFailuresRef.current += 1;
    if (!immediate && connectionFailuresRef.current < 2) return;
    if (connectionRestoreTimerRef.current) window.clearTimeout(connectionRestoreTimerRef.current);
    connectionStateRef.current = "reconnecting";
    setConnectionState("reconnecting");
  }, []);
  const markConnectionSuccess = useCallback(() => {
    connectionFailuresRef.current = 0;
    if (connectionStateRef.current !== "reconnecting") return;
    connectionStateRef.current = "restored";
    setConnectionState("restored");
    if (connectionRestoreTimerRef.current) window.clearTimeout(connectionRestoreTimerRef.current);
    connectionRestoreTimerRef.current = window.setTimeout(() => {
      connectionStateRef.current = "connected";
      setConnectionState("connected");
    }, 1600);
  }, []);
  const withHostLock = useCallback(async (action: () => Promise<void>) => {
    if (hostActionLockRef.current) return;
    hostActionLockRef.current = true;
    setHostActionLocked(true);
    try { await action(); }
    finally {
      window.setTimeout(() => {
        hostActionLockRef.current = false;
        setHostActionLocked(false);
      }, HOST_ACTION_LOCK_MS);
    }
  }, []);

  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 100); return () => window.clearInterval(id); }, []);
  useEffect(() => {
    if (!roleVisible || !roleTouchRevealRef.current) return;
    const releaseRole = () => {
      roleTouchRevealRef.current = false;
      setRoleVisible(false);
    };
    window.addEventListener("touchend", releaseRole, { passive: true });
    window.addEventListener("touchcancel", releaseRole, { passive: true });
    return () => {
      window.removeEventListener("touchend", releaseRole);
      window.removeEventListener("touchcancel", releaseRole);
    };
  }, [roleVisible]);
  useEffect(() => {
    const code = getFreshRoomCodeFromUrl();
    const storedRoom = localStorage.getItem("hanpan-room");
    const targetRoom = code || storedRoom;
    if (!targetRoom) {
      if (location.search) history.replaceState(null, "", location.pathname);
      return;
    }
    const sequence = nextRoomRequestSequence();
    fetch(`/api/rooms/${targetRoom}`, { cache: "no-store" }).then(async (response) => {
      if (!response.ok) {
        if ([401, 404].includes(response.status)) {
          localStorage.removeItem("hanpan-room");
          if (code) { setJoinCode(code); setIntent("join"); }
        }
        throw new Error(String(response.status));
      }
      const body = await response.json() as { room: Room };
      markConnectionSuccess();
      if (body.room.authenticated) {
        if (code) applyRoomSnapshot(body.room, sequence);
        else setResumeRoom(body.room);
      } else if (code) {
        setJoinCode(code);
        setIntent("join");
      } else {
        localStorage.removeItem("hanpan-room");
      }
    }).catch((error: Error) => { if (!["401", "404"].includes(error.message)) markConnectionFailure(true); });
  }, [applyRoomSnapshot, markConnectionFailure, markConnectionSuccess, nextRoomRequestSequence]);
  useEffect(() => {
    const clearRestoredCode = (event: PageTransitionEvent) => {
      const restored = event.persisted || performance.getEntriesByType("navigation").some((entry) => (entry as PerformanceNavigationTiming).type !== "navigate") || (performance as Performance & { navigation?: { type: number } }).navigation?.type === 2;
      if (!localStorage.getItem("hanpan-room") && restored) {
        setJoinCode(""); setIntent(null); history.replaceState(null, "", location.pathname);
      }
    };
    window.addEventListener("pageshow", clearRestoredCode);
    return () => window.removeEventListener("pageshow", clearRestoredCode);
  }, []);
  useEffect(() => {
    if (!roomCode) return;
    let active = true;
    let inFlight = false;
    let controller: AbortController | null = null;
    const pollRoom = async () => {
      if (!active || inFlight || roomMutationCountRef.current > 0 || document.visibilityState === "hidden") return;
      inFlight = true;
      controller = new AbortController();
      const sequence = nextRoomRequestSequence();
      try {
        const response = await fetch(`/api/rooms/${roomCode}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) { markConnectionFailure(); return; }
        const body = await response.json() as { room: Room };
        if (!active) return;
        markConnectionSuccess();
        if (!leavingRef.current && body.room.authenticated) applyRoomSnapshot(body.room, sequence);
        else if (!body.room.authenticated && applyRoomSnapshot(null, sequence)) { localStorage.removeItem("hanpan-room"); setJoinCode(""); setIntent(null); }
      } catch (error) {
        if (active && (!(error instanceof DOMException) || error.name !== "AbortError")) markConnectionFailure();
      } finally {
        inFlight = false;
      }
    };
    roomRefreshRef.current = () => { void pollRoom(); };
    const poll = window.setInterval(() => { void pollRoom(); }, syncInterval);
    const refreshVisibleRoom = () => { if (document.visibilityState === "visible") void pollRoom(); };
    window.addEventListener("focus", refreshVisibleRoom);
    document.addEventListener("visibilitychange", refreshVisibleRoom);
    return () => {
      active = false;
      controller?.abort();
      roomRefreshRef.current = () => undefined;
      window.clearInterval(poll);
      window.removeEventListener("focus", refreshVisibleRoom);
      document.removeEventListener("visibilitychange", refreshVisibleRoom);
    };
  }, [roomCode, syncInterval, applyRoomSnapshot, markConnectionFailure, markConnectionSuccess, nextRoomRequestSequence]);
  useEffect(() => {
    if (!roomCode) return;
    let active = true;
    let reconnectAttempt = 0;
    let loopRunning = false;
    const runRealtimeLoop = async () => {
      if (loopRunning || !active || document.visibilityState === "hidden" || !navigator.onLine) return;
      loopRunning = true;
      try {
        try {
          const probe = await fetch(`/api/rooms/${roomCode}/events?revision=${realtimeRevisionRef.current}`, { cache: "no-store" });
          if (!probe.ok) throw new Error(String(probe.status));
          setRealtimeConnected(true);
          reconnectAttempt = 0;
        } catch {
          setRealtimeConnected(false);
        }
        while (active && document.visibilityState === "visible" && navigator.onLine) {
          const controller = new AbortController();
          realtimeAbortRef.current = controller;
          try {
            const response = await fetch(`/api/rooms/${roomCode}/events?wait=1&revision=${realtimeRevisionRef.current}`, {
              cache: "no-store",
              signal: controller.signal,
            });
            if (!response.ok) throw new Error(String(response.status));
            const message = await response.json() as { revision?: number; room?: Room | null };
            if (!active) return;
            reconnectAttempt = 0;
            setRealtimeConnected(true);
            if (message.room?.authenticated) applyRoomSnapshot(message.room, nextRoomRequestSequence());
            else if (message.room === null && applyRoomSnapshot(null, nextRoomRequestSequence())) {
              localStorage.removeItem("hanpan-room");
              setJoinCode("");
              setIntent(null);
              return;
            }
          } catch (error) {
            if (!active || (error instanceof DOMException && error.name === "AbortError")) return;
            setRealtimeConnected(false);
            const delay = Math.min(REALTIME_RECONNECT_MAX_MS, REALTIME_RECONNECT_MIN_MS * (2 ** reconnectAttempt));
            reconnectAttempt += 1;
            await new Promise((resolve) => window.setTimeout(resolve, delay));
          } finally {
            if (realtimeAbortRef.current === controller) realtimeAbortRef.current = null;
          }
        }
      } finally {
        loopRunning = false;
      }
    };
    const reconnectVisibleRoom = () => {
      if (document.visibilityState !== "visible") {
        realtimeAbortRef.current?.abort();
        realtimeAbortRef.current = null;
        setRealtimeConnected(false);
        return;
      }
      roomRefreshRef.current();
      void runRealtimeLoop();
    };

    void runRealtimeLoop();
    window.addEventListener("online", reconnectVisibleRoom);
    document.addEventListener("visibilitychange", reconnectVisibleRoom);
    return () => {
      active = false;
      setRealtimeConnected(false);
      realtimeAbortRef.current?.abort();
      realtimeAbortRef.current = null;
      window.removeEventListener("online", reconnectVisibleRoom);
      document.removeEventListener("visibilitychange", reconnectVisibleRoom);
    };
  }, [roomCode, applyRoomSnapshot, nextRoomRequestSequence]);
  useEffect(() => {
    const offline = () => markConnectionFailure(true);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("offline", offline);
      if (connectionRestoreTimerRef.current) window.clearTimeout(connectionRestoreTimerRef.current);
    };
  }, [markConnectionFailure]);
  useEffect(() => {
    // 새 라운드의 비공개 역할과 로컬 입력이 이전 판에서 새지 않게 초기화합니다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRoleVisible(false); setMemoryInputs(["", "", "", ""]); setTimerStart(null); setLiarMode("normal"); setGemSuspect("");
  }, [room?.roundNumber, room?.view, currentGame?.id]);
  useEffect(() => {
    if (!roomCode) return;
    let active = true;
    const url = `${location.origin}${location.pathname}?room=${roomCode}`;
    // qrcode's package entry includes Node's fs-based renderers. Load its browser
    // entry only after hydration so the Cloudflare Worker never evaluates them.
    // @ts-expect-error qrcode ships runtime browser entry without a declaration file.
    import("qrcode/lib/browser.js").then(({ default: QRCode }) => QRCode.toDataURL(url, { width: 240, margin: 1, color: { dark: "#0d0f12", light: "#ffffff" } })).then((dataUrl) => { if (active) setQr(dataUrl); }).catch(() => { if (active) setQr(""); });
    return () => { active = false; };
  }, [roomCode]);
  useEffect(() => {
    const surprise = room?.surprise;
    if (!surprise || surprise.phase !== "active" || alertedSurprise.current === surprise.startedAt) return;
    alertedSurprise.current = surprise.startedAt;
    setSurpriseCollapsed(false);
    setSurprisePosition({ side: "right", y: Math.max(80, Math.round(window.innerHeight / 2 - 80)) });
    navigator.vibrate?.([250, 120, 250]);
    try { const Context = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext; if (Context) { const audio = new Context(); const oscillator = audio.createOscillator(); const gain = audio.createGain(); oscillator.frequency.value = 880; gain.gain.value = .08; oscillator.connect(gain).connect(audio.destination); oscillator.start(); oscillator.stop(audio.currentTime + .18); } } catch { /* 소리 권한이 없으면 진동만 사용 */ }
  }, [room?.surprise]);
  const showNotice = useCallback((message: string) => { setNotice(message); window.setTimeout(() => setNotice(""), 2600); }, []);
  const applyAction = useCallback(async (payload: Record<string, unknown>) => {
    if (!room) return null;
    const sequence = nextRoomRequestSequence();
    roomMutationCountRef.current += 1;
    try {
      const { response, body } = await patchRoomWithConflictRetry(room.code, payload);
      if (!response.ok || !body.room) throw new Error(body.error || "요청을 처리하지 못했어요.");
      markConnectionSuccess();
      applyRoomSnapshot(body.room as Room, sequence);
      return body.room as Room;
    } catch (error) {
      if (error instanceof TypeError) markConnectionFailure(true);
      throw error;
    } finally {
      roomMutationCountRef.current = Math.max(0, roomMutationCountRef.current - 1);
    }
  }, [room, applyRoomSnapshot, markConnectionFailure, markConnectionSuccess, nextRoomRequestSequence]);
  useEffect(() => {
    const receiveMazeResult = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data?.type !== "maze-game-finished") return;
      if (!isHost || room?.view !== "game" || currentGame?.id !== "maze-courier" || mazeFinishSubmittingRef.current) return;
      mazeFinishSubmittingRef.current = true;
      void applyAction({ action: "maze-finish", mazeResults: event.data.results })
        .catch((error) => showNotice(error instanceof Error ? error.message : "결과를 열지 못했어요."))
        .finally(() => { mazeFinishSubmittingRef.current = false; });
    };
    window.addEventListener("message", receiveMazeResult);
    return () => window.removeEventListener("message", receiveMazeResult);
  }, [applyAction, currentGame?.id, isHost, room?.view, showNotice]);
  const enterRoom = async () => {
    if (!name.trim()) return showNotice("이름을 입력해 주세요.");
    if (intent === "join" && joinCode.length !== 4) return showNotice("4자리 방 코드를 입력해 주세요.");
    setBusy(true);
    try {
      const sequence = nextRoomRequestSequence();
      const player = { name: name.trim(), avatar };
      const entry = intent === "create"
        ? await fetch("/api/rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ player }) }).then(async (response) => ({ response, body: await response.json() as { room?: Room; error?: string } }))
        : await patchRoomWithConflictRetry(joinCode, { action: "join", player });
      const { response, body } = entry;
      if (!response.ok || !body.room) throw new Error(body.error || "방에 들어가지 못했어요.");
      localStorage.setItem("hanpan-name", name.trim()); localStorage.setItem("hanpan-avatar", avatar); localStorage.setItem("hanpan-room", body.room.code);
      leavingRef.current = false; history.replaceState(null, "", `?room=${body.room.code}${debugMode ? "&debug=1" : ""}`); applyRoomSnapshot(body.room, sequence); setIntent(null);
    } catch (error) { showNotice(error instanceof Error ? error.message : "다시 시도해 주세요."); } finally { setBusy(false); }
  };
  const leaveRoom = async (permanent = false) => {
    if (!room) return;
    const canResumePlaceMafia = room.view === "game" && currentGame?.id === "place-mafia" && currentGame.placeMafia?.phase !== "game_over";
    const canPauseDealer = !permanent && room.view === "game" && currentGame?.id === "double-dealers";
    const sequence = nextRoomRequestSequence();
    setBusy(true); leavingRef.current = true;
    try {
      const { response, body } = await patchRoomWithConflictRetry(room.code, { action: "leave", ...(permanent ? { permanent: true } : {}) }, { keepalive: true });
      if (canPauseDealer && body.room) {
        localStorage.setItem("hanpan-room", room.code);
        history.replaceState(null, "", `?room=${room.code}`);
        leavingRef.current = false;
        applyRoomSnapshot(body.room, sequence);
        setBusy(false);
        setConfirmType(null);
        return;
      }
      if (!response.ok && ![401, 404].includes(response.status)) throw new Error(body.error || "방에서 나가지 못했어요.");
    }
    catch (error) {
      leavingRef.current = false;
      setBusy(false);
      setConfirmType(null);
      showNotice(error instanceof Error ? error.message : "방에서 나가지 못했어요.");
      return;
    }
    if (canResumePlaceMafia) {
      localStorage.setItem("hanpan-room", room.code);
      setResumeRoom(room);
    } else localStorage.removeItem("hanpan-room");
    history.replaceState(null, "", location.pathname);
    applyRoomSnapshot(null, sequence);
    setJoinCode("");
    setIntent(null);
    setBusy(false);
    setConfirmType(null);
  };
  const rejoinCurrentRoom = async () => {
    if (!room || me?.status !== "waiting") return;
    const sequence = nextRoomRequestSequence();
    setBusy(true);
    try {
      const { response, body } = await patchRoomWithConflictRetry(room.code, { action: "join" });
      if (!response.ok || !body.room) throw new Error(body.error || "게임에 다시 들어가지 못했어요.");
      localStorage.setItem("hanpan-room", room.code);
      history.replaceState(null, "", `?room=${room.code}`);
      applyRoomSnapshot(body.room, sequence);
      showNotice("연결이 복구되었습니다. 게임은 곧 재개됩니다.");
    } catch (error) { showNotice(error instanceof Error ? error.message : "다시 시도해 주세요."); }
    finally { setBusy(false); }
  };
  const continuePreviousRoom = async () => {
    if (!resumeRoom) return;
    const sequence = nextRoomRequestSequence();
    setBusy(true);
    try {
      const { response, body } = await patchRoomWithConflictRetry(resumeRoom.code, { action: "join" });
      if (!response.ok || !body.room) throw new Error(body.error || "게임에 다시 들어가지 못했어요.");
      localStorage.setItem("hanpan-room", resumeRoom.code);
      history.replaceState(null, "", `?room=${resumeRoom.code}`);
      applyRoomSnapshot(body.room, sequence);
      setResumeRoom(null);
    } catch (error) { showNotice(error instanceof Error ? error.message : "다시 시도해 주세요."); }
    finally { setBusy(false); }
  };
  const discardPreviousRoom = async () => {
    if (!resumeRoom) return;
    setBusy(true);
    try {
      await patchRoomWithConflictRetry(resumeRoom.code, { action: "leave" }, { keepalive: true });
    } catch { /* 오래된 방이 이미 사라졌다면 로컬 기록만 정리합니다. */ }
    localStorage.removeItem("hanpan-room");
    history.replaceState(null, "", location.pathname);
    setResumeRoom(null);
    setJoinCode("");
    setIntent(null);
    setBusy(false);
  };
  const shareRoom = async () => { if (!room) return; const url = `${location.origin}${location.pathname}?room=${room.code}`; try { if (navigator.share) await navigator.share({ title: "한판 술게임", text: `방 코드 ${room.code}`, url }); else { await navigator.clipboard.writeText(url); showNotice("참가 링크를 복사했어요."); } } catch { /* 공유 취소 */ } };
  const prepareGame = async (meta: GameMeta) => { if (!isHost) return showNotice("방장이 게임을 고르고 있어요."); if (meta.id === "gem-heist") { setGemSpecialRoles(false); setGemDifficulty("normal"); } if (meta.id === "place-mafia") { setPlaceMafiaDiscussion(90); setPlaceMafiaBalance("normal"); setPlaceMafiaCount(1); } await withHostLock(async () => { try { await applyAction({ action: "prepare-game", gameId: meta.id }); } catch (error) { showNotice(error instanceof Error ? error.message : "다시 시도해 주세요."); } }); };
  const setCashDebugModeEnabled = (enabled: boolean) => { setCashDebugMode(enabled); if (typeof window === "undefined") return; const url = new URL(window.location.href); if (enabled) url.searchParams.set("debug", "1"); else url.searchParams.delete("debug"); history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`); };
  const startGame = async () => { if (!currentGame || !isHost) return; const setup = currentGame.placeMafiaSetup; if (currentGame.id === "apartment" && room && room.players.length < 3) return showNotice("아파트 게임은 3명 이상 필요해요."); if (currentGame.id === "place-mafia" && room && (room.players.length < 4 || room.players.length > 8)) return showNotice("장소 마피아는 4~8명이 필요해요."); if (currentGame.id === "cash-n-guns" && room && (room.players.length > 8 || (room.players.length < 4 && !debugMode))) return showNotice("캐시 앤 건즈는 4~8명이 필요해요. 디버그 모드를 켜면 혼자 테스트할 수 있어요."); await withHostLock(async () => { try { await applyAction({ action: "start-game", gameId: currentGame.id, mode: liarMode, debug: currentGame.id === "cash-n-guns" ? debugMode : undefined, specialRoles: currentGame.id === "gem-heist" ? gemSpecialRoles : undefined, difficulty: currentGame.id === "gem-heist" ? gemDifficulty : undefined, discussionSeconds: currentGame.id === "place-mafia" ? setup?.discussionSeconds ?? placeMafiaDiscussion : undefined, balance: currentGame.id === "place-mafia" ? setup?.balance ?? placeMafiaBalance : undefined, mafiaCount: currentGame.id === "place-mafia" ? setup?.mafiaCount ?? placeMafiaCount : undefined }); } catch (error) { showNotice(error instanceof Error ? error.message : "게임을 시작하지 못했어요."); } }); };
  const updatePlaceMafiaSetup = async (patch: Partial<PlaceMafiaSetup>) => {
    if (!isHost || currentGame?.id !== "place-mafia") return;
    if (patch.discussionSeconds) setPlaceMafiaDiscussion(patch.discussionSeconds);
    if (patch.balance) setPlaceMafiaBalance(patch.balance);
    if (patch.mafiaCount) setPlaceMafiaCount(patch.mafiaCount);
    try { await applyAction({ action: "place-mafia-settings", ...patch }); }
    catch (error) { showNotice(error instanceof Error ? error.message : "설정을 공유하지 못했어요."); }
  };
  const finishGame = async () => { setConfirmType(null); await withHostLock(async () => { try { await applyAction({ action: "set-view", view: "result" }); } catch (error) { showNotice(error instanceof Error ? error.message : "결과를 열지 못했어요."); } }); };
  const goHub = async () => { await withHostLock(async () => { try { await applyAction({ action: "set-view", view: "hub" }); } catch (error) { showNotice(error instanceof Error ? error.message : "이동하지 못했어요."); } }); };
  const goLobby = async () => { setConfirmType(null); await withHostLock(async () => { try { await applyAction({ action: "set-view", view: "lobby" }); } catch (error) { showNotice(error instanceof Error ? error.message : "대기실로 이동하지 못했어요."); } }); };
  const setSurpriseEnabled = async (enabled: boolean) => { if (!isHost) return; await withHostLock(async () => { try { await applyAction({ action: "set-surprise", enabled }); } catch (error) { showNotice(error instanceof Error ? error.message : "깜짝 룰 설정을 바꾸지 못했어요."); } }); };
  const failGame = async () => { setConfirmType(null); await withHostLock(async () => { try { await applyAction({ action: "fail-game" }); } catch (error) { showNotice(error instanceof Error ? error.message : "실패 결과를 열지 못했어요."); } }); };
  const nextCoopQuestion = async () => { await withHostLock(async () => { try { await applyAction({ action: "next-question" }); } catch (error) { showNotice(error instanceof Error ? error.message : "다음 문제로 넘어가지 못했어요."); } }); };
  const revealAnswer = async () => { await withHostLock(async () => { try { await applyAction({ action: "reveal-answer" }); } catch (error) { showNotice(error instanceof Error ? error.message : "정답을 공개하지 못했어요."); } }); };
  const acceptTelestrationAnswer = async (chainId: string) => { await withHostLock(async () => { try { await applyAction({ action: "accept-telestration-answer", chainId }); } catch (error) { showNotice(error instanceof Error ? error.message : "정답으로 인정하지 못했어요."); } }); };
  const startGemInvestigation = async () => { await withHostLock(async () => { try { await applyAction({ action: "gem-start-investigation" }); } catch (error) { showNotice(error instanceof Error ? error.message : "수사를 시작하지 못했어요."); } }); };
  const nextGemQuestion = async () => { await withHostLock(async () => { try { await applyAction({ action: "gem-next-question" }); } catch (error) { showNotice(error instanceof Error ? error.message : "질문을 넘기지 못했어요."); } }); };
  const startGemVote = async () => { await withHostLock(async () => { try { await applyAction({ action: "gem-start-vote" }); } catch (error) { showNotice(error instanceof Error ? error.message : "최종 지목을 시작하지 못했어요."); } }); };
  const submitGemVote = async () => {
    if (!gemSuspect) return showNotice("범인이라고 생각하는 사람을 선택해 주세요.");
    try { await applyAction({ action: "gem-vote", suspectId: gemSuspect }); }
    catch (error) { showNotice(error instanceof Error ? error.message : "지목을 제출하지 못했어요."); }
  };
  const submitMemory = async () => { if (memoryInputs.some((value) => !value.trim())) return showNotice("네 문장을 모두 적어 주세요."); try { await applyAction({ action: "submit-memory", entries: memoryInputs }); } catch (error) { showNotice(error instanceof Error ? error.message : "제출하지 못했어요."); } };
  const submitTimer = async () => {
    if (currentGame?.timerResults?.some((item) => item.playerId === room?.meId) || timerSubmitting.current) return;
    if (!timerStart) { setTimerStart(Date.now()); return; }
    const seconds = (Date.now() - timerStart) / 1000;
    timerSubmitting.current = true; setTimerStart(null);
    try { await applyAction({ action: "submit-timer", seconds }); }
    catch (error) { showNotice(error instanceof Error ? error.message : "기록을 제출하지 못했어요."); }
    finally { timerSubmitting.current = false; }
  };
  const selectApartmentFloor = async (floor: number) => {
    if (currentGame?.id !== "apartment" || currentGame.apartmentRevealed) return;
    try { await applyAction({ action: "apartment-choice", floor }); }
    catch (error) { showNotice(error instanceof Error ? error.message : "층 선택을 저장하지 못했어요."); }
  };
  const uploadPhoto = async (file: File) => { if (!room) return; const sequence = nextRoomRequestSequence(); roomMutationCountRef.current += 1; setBusy(true); try { let blob: Blob; try { blob = await compressPhoto(file); } catch (conversionError) { if (!file.type.startsWith("image/") || file.size > 6 * 1024 * 1024) throw conversionError; blob = file; } const nextRoom = await uploadPhotoWithRetry(room.code, blob); applyRoomSnapshot(nextRoom, sequence); } catch (error) { showNotice(error instanceof Error ? error.message : "사진을 올리지 못했어요."); } finally { roomMutationCountRef.current = Math.max(0, roomMutationCountRef.current - 1); setBusy(false); } };
  const currentPlayer = currentGame?.playerOrder?.[currentGame.currentPlayerIndex ?? 0];
  const synchronizedNow = now + serverClockOffsetMs;
  const timeUp = Boolean(currentGame?.deadline && synchronizedNow >= currentGame.deadline);
  const myTimerResult = currentGame?.timerResults?.find((item) => item.playerId === room?.meId);
  const gameMeta = useMemo(() => ALL_GAMES.find((item) => item.id === currentGame?.id), [currentGame?.id]);
  const inlineManagedGame = Boolean(currentGame && ["initial", "trivia", "people", "chain", "four", "character", "syllable", "group-initial", "telestration", "gem-heist"].includes(currentGame.id));
  const activeSurprise = room?.view !== "game" && room?.surprise && (room.surprise.phase === "active" || room.surprise.reveal) ? room.surprise : null;

  const topBar = (title: string) => <TopBar code={room?.code ?? ""} title={title} showLobby={isHost && room?.view !== "lobby"} actionsDisabled={hostActionLocked} onLobby={() => setConfirmType("lobby")} onLeave={() => setConfirmType("leave")} />;
  const confirmSpec = confirmType === "leave"
    ? { title: "방에서 나갈까요?", message: room?.view === "game" ? "현재 게임이 진행 중입니다. 취소하면 동일한 참가자로 계속 게임에 참여합니다." : "나가면 참가자 목록에서 바로 사라집니다.", label: "나가기" }
    : confirmType === "finish"
      ? { title: "게임을 끝낼까요?", message: "결과 화면으로 이동하면 현재 문제 진행이 끝납니다.", label: "결과 보기" }
      : confirmType === "lobby"
        ? { title: "모두 대기실로 이동할까요?", message: "현재 게임 진행이 끝나고 모든 참가자가 대기실로 이동합니다.", label: "대기실로 이동" }
        : confirmType === "fail"
          ? { title: "이번 도전을 실패로 끝낼까요?", message: "실패 결과 화면으로 이동합니다.", label: "실패" }
          : null;
  const confirmAction = () => {
    if (confirmType === "leave") void leaveRoom();
    else if (confirmType === "finish") void finishGame();
    else if (confirmType === "lobby") void goLobby();
    else if (confirmType === "fail") void failGame();
  };
  const commonOverlays = <>
    {activeSurprise && <SurpriseDrawer surprise={activeSurprise} now={synchronizedNow} collapsed={surpriseCollapsed} onCollapsedChange={setSurpriseCollapsed} position={surprisePosition} onPositionChange={setSurprisePosition} />}
    {room?.view === "game" && currentGame?.id === "double-dealers" && me?.status === "waiting" && <div className="dealer-waiting-actions" role="status"><strong>게임이 일시정지되었습니다</strong><span>연결이 끊긴 플레이어의 재접속을 기다리는 중입니다.</span><button className="button primary" disabled={busy} onClick={() => void rejoinCurrentRoom()}>게임으로 돌아가기</button><button className="button secondary" disabled={busy} onClick={() => void leaveRoom(true)}>대기실로 이동</button></div>}
    {connectionState !== "connected" && <div className={`connection-banner ${connectionState}`} role="status">{connectionState === "reconnecting" ? "연결이 불안정해요 · 재연결 중…" : "다시 연결됐어요"}</div>}
    {notice && <div className="toast" role="status">{notice}</div>}
    {lightbox && <button className="photo-lightbox" aria-label="사진 닫기" onClick={() => setLightbox(null)}><img src={lightbox} alt="확대 사진" /></button>}
    {confirmSpec && <ConfirmDialog title={confirmSpec.title} message={confirmSpec.message} confirmLabel={confirmSpec.label} busy={hostActionLocked} onCancel={() => setConfirmType(null)} onConfirm={confirmAction} />}
  </>;

  if (!room) return <main className="app-shell entry-shell">
    <header className="brand"><span className="brand-dot" />한판</header>
    {resumeRoom ? <section className="panel resume-panel">
      <div className="eyebrow">진행 중인 방</div>
      <h1 className="panel-title">{resumeRoom.code}번 방에<br />다시 참여할까요?</h1>
      <div className="resume-summary">
        <span>{resumeRoom.players.find((player) => player.id === resumeRoom.meId)?.avatar ?? "👤"}</span>
        <div><strong>{resumeRoom.players.find((player) => player.id === resumeRoom.meId)?.name ?? "참가자"}</strong><small>{resumeRoom.view === "game" ? `${resumeRoom.game?.title ?? "게임"} 진행 중` : resumeRoom.view === "lobby" ? "대기실" : "게임을 고르는 중"}</small></div>
      </div>
      <button className="button primary xl" disabled={busy} onClick={() => void continuePreviousRoom()}>{busy ? "다시 들어가는 중…" : "이어서 참여하기"}</button>
      {resumeRoom.game?.id !== "place-mafia" && <button className="button secondary xl" disabled={busy} onClick={() => void discardPreviousRoom()}>{busy ? "정리하는 중…" : "나가고 처음으로"}</button>}
    </section> : !intent ? <section className="hero">
      <div className="eyebrow">점수 없이 바로 노는 술게임</div>
      <h1>모이면,<br /><em>한판이면 돼.</em></h1>
      <p>휴대폰 하나씩 들고 방에 들어오세요.<br />판정은 우리끼리, 결과는 바로.</p>
      <button className="button primary xl" onClick={() => { setJoinCode(""); setIntent("create"); }}>새 방 만들기</button>
      <div className="join-inline">
        <input aria-label="4자리 방 코드" inputMode="numeric" autoComplete="off" maxLength={4} placeholder="4자리 코드" value={joinCode} onChange={(event) => setJoinCode(event.target.value.replace(/\D/g, "").slice(0, 4))} />
        <button className="button secondary" onClick={() => joinCode.length === 4 ? setIntent("join") : showNotice("4자리 코드를 입력해 주세요.")}>참가</button>
      </div>
    </section> : <section className="panel profile-panel">
      <button className="back-button" onClick={() => { setIntent(null); setJoinCode(""); history.replaceState(null, "", location.pathname); }} aria-label="뒤로">←</button>
      <div className="eyebrow">{intent === "create" ? "새 방 만들기" : `방 ${joinCode} 참가`}</div>
      <h1 className="panel-title">누구로 들어갈까요?</h1>
      <label className="field-label" htmlFor="name">이름</label>
      <input id="name" className="text-field" maxLength={10} autoFocus placeholder="최대 10자" value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void enterRoom(); }} />
      <div className="field-label">프로필</div>
      <div className="avatar-grid">{AVATARS.map((item) => <button key={item} aria-label={`${item} 프로필`} className={`avatar-choice ${avatar === item ? "selected" : ""}`} onClick={() => setAvatar(item)}>{item}</button>)}</div>
      <button className="button primary xl" disabled={busy} onClick={() => void enterRoom()}>{busy ? "들어가는 중…" : intent === "create" ? "방 만들기" : "참가하기"}</button>
    </section>}
    {commonOverlays}
  </main>;

  if (room.view === "lobby") return <main className="app-shell">{topBar("대기실")}<section className="room-code-card"><div><span>방 코드</span><strong>{room.code}</strong></div><button className="share-button" onClick={() => void shareRoom()}>공유</button></section><section className="qr-card">{qr ? <img src={qr} alt={`방 ${room.code} 참가 QR 코드`} /> : <div className="image-loader" />}<p>QR을 찍거나 코드로 참가하세요</p></section><section className="players-section"><div className="section-heading"><h2>참가자</h2><span>{room.players.length}명</span></div><div className="player-list">{room.players.map((player) => <div className="player-row" key={player.id}><span className="player-avatar">{player.avatar}</span><span>{player.name}</span>{player.id === room.hostId && <span className="host-badge">방장</span>}{player.id === room.meId && <span className="me-label">나</span>}</div>)}</div></section><section className="surprise-setting" aria-label="깜짝 룰 설정"><div><strong>깜짝 룰</strong><small>{room.surpriseEnabled === false ? "게임 중 랜덤 미션을 사용하지 않아요" : "5분 뒤 랜덤 미션이 시작돼요"}</small></div>{isHost ? <button type="button" className={`setting-toggle ${room.surpriseEnabled === false ? "off" : "on"}`} aria-pressed={room.surpriseEnabled !== false} onClick={() => void setSurpriseEnabled(room.surpriseEnabled === false)}><span className="toggle-knob" />{room.surpriseEnabled === false ? "꺼짐" : "켜짐"}</button> : <span className={`setting-status ${room.surpriseEnabled === false ? "off" : "on"}`}>{room.surpriseEnabled === false ? "꺼짐" : "켜짐"}</span>}</section><div className="sticky-action">{isHost ? <button className="button primary xl" disabled={hostActionLocked} onClick={() => void goHub()}>{room.players.length === 1 ? "혼자 시작하기" : "게임 고르기"}</button> : <div className="waiting"><span className="pulse" />방장이 시작하기를 기다리는 중</div>}</div>{commonOverlays}</main>;

  if (me?.status === "waiting") return <main className="app-shell">{topBar("다음 판 대기")}<section className="waiting-card"><span className="big-emoji">👋</span><h2>현재 게임이 진행 중이에요</h2><p>이번 판이 끝나면 동일한 참가자로 자동 참여해요.</p></section>{commonOverlays}</main>;

  if (room.view === "hub") { const games = tab === "solo" ? SOLO_GAMES : tab === "coop" ? COOP_GAMES : BOARD_GAMES; const randomPool = randomGamesForPlayers(room.players.length); return <main className="app-shell">{topBar("게임 고르기")}<button className="random-card" disabled={isHost && hostActionLocked} onClick={() => void prepareGame(pick(randomPool))}><span className="random-icon">✦</span><span><strong>랜덤 게임</strong><small>{randomPool.length}개 게임 중 하나를 골라요</small></span><span>→</span></button><div className="segmented" role="tablist"><button role="tab" aria-selected={tab === "solo"} className={tab === "solo" ? "active" : ""} onClick={() => setTab("solo")}>개인전 <span>{SOLO_GAMES.length}</span></button><button role="tab" aria-selected={tab === "coop"} className={tab === "coop" ? "active" : ""} onClick={() => setTab("coop")}>모두 협동 <span>{COOP_GAMES.length}</span></button><button role="tab" aria-selected={tab === "board"} className={tab === "board" ? "active" : ""} onClick={() => setTab("board")}>미니(보드)게임 <span>{BOARD_GAMES.length}</span></button></div><div className="game-list">{games.map((game) => <button className="game-row" disabled={isHost && hostActionLocked} key={game.id} onClick={() => void prepareGame(game)}><span className={`game-icon ${game.id === "gem-heist" ? "gem-photo-icon" : ""}`}>{game.id === "gem-heist" ? "" : game.icon}</span><span><strong>{game.title}</strong><small>{game.description}</small></span><span className="chevron">›</span></button>)}</div>{!isHost && <div className="floating-wait">방장이 게임을 고르는 중</div>}{commonOverlays}</main>; }

  if (room.view === "briefing" && currentGame) {
    const gemPlayerCountValid = room.players.length >= 4 && room.players.length <= 8;
    const mazePlayerCountValid = room.players.length <= 8;
    const dealerPlayerCountValid = room.players.length >= 3 && room.players.length <= 8;
    const cashNGunsPlayerCountValid = room.players.length >= 4 && room.players.length <= 8;
    if (currentGame.id === "place-mafia") return <PlaceMafiaBriefing
      players={room.players}
      isHost={isHost}
      busy={hostActionLocked}
      discussionSeconds={currentGame.placeMafiaSetup?.discussionSeconds ?? placeMafiaDiscussion}
      balance={currentGame.placeMafiaSetup?.balance ?? placeMafiaBalance}
      mafiaCount={currentGame.placeMafiaSetup?.mafiaCount ?? placeMafiaCount}
      onDiscussionChange={(value) => void updatePlaceMafiaSetup({ discussionSeconds: value })}
      onBalanceChange={(value) => void updatePlaceMafiaSetup({ balance: value })}
      onMafiaCountChange={(value) => void updatePlaceMafiaSetup({ mafiaCount: value })}
      onStart={() => void startGame()}
      topBar={topBar("장소 마피아")}
      overlays={commonOverlays}
    />;
    if (currentGame.id === "maze-courier") {
      const readyCount = room.players.filter((player) => currentGame.mazeReadyPlayerIds?.includes(player.id)).length;
      return <main className="maze-courier-shell maze-selection-shell">
        <iframe
          key={`${room.code}-${currentGame.startedAt}-selection`}
          src={`/maze-courier/characters.html?select=1&embedded=1&online=1&room=${room.code}`}
          title="미로의 배달부 캐릭터 선택"
          allow="autoplay; fullscreen"
        />
        <div className="maze-courier-toolbar maze-selection-toolbar">
          <span><b>{readyCount}/{room.players.length}</b> 선택 완료</span>
          {isHost
            ? <><button className="maze-host-start" type="button" disabled={hostActionLocked || !mazePlayerCountValid} onClick={() => void startGame()}>{readyCount === room.players.length ? "게임 시작" : "미선택 무작위로 시작"}</button><button type="button" onClick={() => setConfirmType("lobby")}>대기실</button></>
            : <span>방장이 시작하기를 기다리는 중</span>}
        </div>
        {commonOverlays}
      </main>;
    }
    return <main className={`app-shell briefing-shell ${currentGame.id === "gem-heist" ? "gem-briefing-shell" : ""}`}>
      {topBar("게임 설명")}
      <section className="briefing-card">
        {currentGame.id === "gem-heist" ? <img className="gem-briefing-cover" src="/gem-case-scene.webp" alt="" aria-hidden="true" /> : <span className="big-emoji">{gameMeta?.icon ?? "🎮"}</span>}
        <div className="eyebrow">시작 전 설명</div>
        <h1>{currentGame.title}</h1>
        <p>{currentGame.briefing ?? currentGame.prompt}</p>
        {currentGame.id === "cash-n-guns" && <div className={`cng-briefing-note ${cashNGunsPlayerCountValid ? "ready" : "warning"}`}><b>4~8명 · POWER MODE 없음</b><span>{cashNGunsPlayerCountValid ? "8라운드 · 탄환 선택 → 조준 → 숨기/서기 → 전리품 분배" : debugMode ? "디버그 모드 · 혼자서 단계별 테스트 가능" : `현재 ${room.players.length}명 · 4~8명이 모이면 시작할 수 있어요`}</span></div>}
        {currentGame.id === "cash-n-guns" && isHost && <div className="cng-debug-toggle"><div><b>디버그 모드</b><small>게임 중 단계 넘기기와 자동 진행 패널을 표시해요.</small></div><button type="button" aria-pressed={debugMode} onClick={() => setCashDebugModeEnabled(!debugMode)}>{debugMode ? "켜짐" : "꺼짐"}</button></div>}
        {currentGame.id === "apartment" && <div className="apartment-briefing"><ApartmentBuilding maxFloor={room.players.length + 2} submittedIds={[]} players={room.players} preview /></div>}
        {currentGame.id === "apartment" && room.players.length < 3 && <div className="count-warning">아파트 게임은 3명 이상 필요해요.</div>}
        {LIAR_OPTION_GAMES.includes(currentGame.id) && isHost && <div className="mode-picker"><button className={liarMode === "normal" ? "active" : ""} onClick={() => setLiarMode("normal")}><strong>일반 라이어</strong><small>라이어는 장르만 확인</small></button><button className={liarMode === "dumb" ? "active" : ""} onClick={() => setLiarMode("dumb")}><strong>바보 라이어 모드</strong><small>라이어만 다른 제시어</small></button></div>}
        {currentGame.id === "gem-heist" && <>
          <div className="gem-briefing-steps">
            <span><b>1</b><strong>파일 확인</strong><small>말할 단서 1개 선택</small></span>
            <span><b>2</b><strong>공개 수사</strong><small>질문하고 모순 찾기</small></span>
            <span><b>3</b><strong>비밀 지목</strong><small>범인 선택</small></span>
          </div>
          <div className="gem-one-clue-rule briefing compact"><b>핵심 규칙</b><strong>단서 1개만 공개 · 최종 2명은 대화로 판별</strong></div>
          {isHost && <div className="gem-special-picker">
            <div className="gem-picker-heading"><span>추리 난이도</span><small>단서의 공개 범위와 교차 정보량이 달라져요</small></div>
            <div className="gem-difficulty-picker">
              <button className={gemDifficulty === "easy" ? "active" : ""} onClick={() => setGemDifficulty("easy")}><strong>쉬움</strong><small>핵심 단서를 여러 명이 공유</small></button>
              <button className={gemDifficulty === "normal" ? "active" : ""} onClick={() => setGemDifficulty("normal")}><strong>보통</strong><small>추천 · 단서를 합쳐 추리</small></button>
              <button className={gemDifficulty === "hard" ? "active" : ""} onClick={() => setGemDifficulty("hard")}><strong>어려움</strong><small>보조 정보가 많고 교차 확인 필수</small></button>
            </div>
          </div>}
          {isHost && <div className="gem-special-picker">
            <div className="gem-picker-heading"><span>특수 역할</span><small>{room.players.length < 4 ? "4명 이상부터 선택할 수 있어요" : room.players.length >= 6 ? "수석 탐정과 비밀 공범이 추가돼요" : "수석 탐정이 추가돼요"}</small></div>
            <div className="mode-picker">
              <button className={!gemSpecialRoles ? "active" : ""} onClick={() => setGemSpecialRoles(false)}><strong>기본 수사</strong><small>보석 도둑 1명 · 나머지는 수사대</small></button>
              <button disabled={room.players.length < 4} className={gemSpecialRoles ? "active" : ""} onClick={() => setGemSpecialRoles(true)}><strong>특수 역할 사용</strong><small>인원에 따라 탐정·공범 자동 배치</small></button>
            </div>
          </div>}
          <div className={`gem-player-rule ${gemPlayerCountValid ? "ready" : "warning"}`}><span>{gemPlayerCountValid ? "✓" : "!"}</span><div><strong>4~8명 전용 게임</strong><small>현재 {room.players.length}명 · {gemPlayerCountValid ? "수사를 시작할 수 있어요" : room.players.length < 4 ? `${4 - room.players.length}명 더 필요해요` : "8명 이하로 참가자를 조정해 주세요"}</small></div></div>
        </>}
        {currentGame.id === "maze-courier" && <>
          <div className="maze-briefing-steps">
            <span><b>1</b><strong>재료 찾기</strong><small>맵 가장자리 8개 출입구</small></span>
            <span><b>2</b><strong>미로 돌파</strong><small>밀치기와 캐릭터 스킬</small></span>
            <span><b>3</b><strong>중앙 배달</strong><small>요리 완성으로 점수 획득</small></span>
          </div>
          <div className={`gem-player-rule ${mazePlayerCountValid ? "ready" : "warning"}`}><span>{mazePlayerCountValid ? "✓" : "!"}</span><div><strong>서버 판정 · 최대 8인</strong><small>현재 {room.players.length}명 · {mazePlayerCountValid ? "모든 이동·충돌·아이템을 서버가 검증해요" : "8명 이하로 참가자를 조정해 주세요"}</small></div></div>
        </>}
        {currentGame.id === "double-dealers" && <>
          <div className="maze-briefing-steps">
            <span><b>1</b><strong>비밀 감정</strong><small>3개 중 판매품 선택</small></span>
            <span><b>2</b><strong>현장 협상</strong><small>말로 속이고 $50씩 입찰</small></span>
            <span><b>3</b><strong>상점 정산</strong><small>세트 판매·카드 구매</small></span>
          </div>
          <div className={`gem-player-rule ${dealerPlayerCountValid ? "ready" : "warning"}`}><span>{dealerPlayerCountValid ? "✓" : "!"}</span><div><strong>휴대폰 전용 · 3~8명</strong><small>현재 {room.players.length}명 · {dealerPlayerCountValid ? "음성채팅 없이 같은 자리에서 대화해요" : room.players.length < 3 ? `${3 - room.players.length}명 더 필요해요` : "8명 이하로 참가자를 조정해 주세요"}</small></div></div>
        </>}
      </section>
      <div className="sticky-action">{isHost ? <button className="button primary xl" disabled={hostActionLocked || (currentGame.id === "gem-heist" && !gemPlayerCountValid) || (currentGame.id === "maze-courier" && !mazePlayerCountValid) || (currentGame.id === "double-dealers" && !dealerPlayerCountValid)} onClick={() => void startGame()}>{currentGame.id === "gem-heist" ? "사건 시작" : currentGame.id === "maze-courier" ? "배달 대결 시작" : currentGame.id === "double-dealers" ? "경매장 입장" : currentGame.id === "cash-n-guns" ? "캐시 앤 건즈 선택 · 시작" : "게임 시작"}</button> : <div className="waiting"><span className="pulse" />방장이 게임을 시작하기를 기다리는 중</div>}</div>
      {commonOverlays}
    </main>;
  }

  if (room.view === "result" || (currentGame?.id === "apartment" && currentGame.apartmentRevealed)) {
    if (!currentGame) return <main className="app-shell"><div className="waiting-card">결과를 불러오는 중</div>{commonOverlays}</main>;
    if (currentGame.id === "apartment") return <main className="app-shell result-shell apartment-result-shell">
      {topBar("아파트 결과")}
      <div className="round-label">ROUND {room.roundNumber}</div>
      <ApartmentBuilding maxFloor={currentGame.apartmentMaxFloor ?? room.players.length + 2} selectedFloor={currentGame.apartmentSelections?.[room.meId ?? ""]} submittedIds={currentGame.apartmentSubmitted ?? []} players={room.players} revealed counts={currentGame.apartmentFloorCounts} penaltyFloor={currentGame.apartmentPenaltyFloor} penaltyPlayerIds={currentGame.apartmentPenaltyPlayerIds} />
      <ApartmentResultSummary maxFloor={currentGame.apartmentMaxFloor ?? room.players.length + 2} players={room.players} selections={currentGame.apartmentSelections} counts={currentGame.apartmentFloorCounts} penaltyFloor={currentGame.apartmentPenaltyFloor} penaltyPlayerIds={currentGame.apartmentPenaltyPlayerIds} />
      <div className="result-actions">{isHost ? <><button className="button primary xl" disabled={hostActionLocked} onClick={() => gameMeta && void prepareGame(gameMeta)}>같은 게임 다시하기</button><button className="button secondary xl" disabled={hostActionLocked} onClick={() => void goHub()}>다른 게임 하러가기</button></> : <div className="waiting"><span className="pulse" />방장의 선택을 기다리는 중</div>}</div>
      {commonOverlays}
    </main>;
    const liarName = playerName(room, currentGame.liarId);
    const history = currentGame.history ?? [];
    return <main className="app-shell result-shell">
      {topBar("결과")}
      <section className={`result-card ${currentGame.id === "gem-heist" ? "gem-result-card" : ""}`}>
        {currentGame.id === "gem-heist" ? <><GemCaseBoard game={currentGame} compact /><GemResultPanel room={room} game={currentGame} /></> : <>
          <div className="result-mark">✓</div><div className="eyebrow">이번 판 끝</div><h1>{currentGame.title}</h1>
          {currentGame.id === "memory" && <div className="answer-block memory-answer"><span>{currentGame.fakeMemoryIndex}번째 <b>가짜</b> 추억</span><strong>{currentGame.fakeMemoryText}</strong></div>}
          {!["memory", "dumb-liar", "initial", "trivia", "people"].includes(currentGame.id) && currentGame.answer && <div className="answer-block"><span>정답</span><strong>{currentGame.answer}</strong></div>}
          {currentGame.id === "dumb-liar" && <><div className="answer-block"><span>정답 제시어</span><strong>{currentGame.answer}</strong></div><div className="answer-block"><span>바보 라이어</span><strong>{liarName} · {currentGame.liarWord}</strong></div></>}
          {currentGame.id !== "dumb-liar" && currentGame.liarId && <div className="answer-block"><span>라이어</span><strong>{liarName}</strong></div>}
          {history.length > 0 && ["initial", "trivia", "people"].includes(currentGame.id) && <div className="history-results"><h3>나왔던 정답</h3>{history.map((item, index) => <div key={`${item.prompt}-${index}`}><span>{index + 1}번 · {item.prompt}</span><strong>{item.answer ?? "우리끼리 판정"}</strong></div>)}</div>}
          {currentGame.id === "taste" && <div className="history-results taste-results"><h3>각자 고른 취향</h3>{room.players.map((player) => <div key={player.id}><span>{player.name}</span><strong>{currentGame.selections?.[player.id] ?? "미선택"}</strong></div>)}</div>}
          {currentGame.id === "ten-seconds" && <TimerResults room={room} results={currentGame.timerResults ?? []} />}
          {currentGame.id === "maze-courier" && <div className="maze-result-list"><h3>배달 점수</h3>{[...(currentGame.mazeResults ?? [])].sort((a, b) => b.score - a.score).map((result, index) => <div key={result.playerId}><span>{index + 1}위 · {playerName(room, result.playerId)}</span><strong>{result.score}점</strong></div>)}</div>}
          {currentGame.telestrationResults && <><div className={`team-result ${(currentGame.telestrationCorrectCount ?? 0) >= 2 ? "passed" : "failed"}`}><strong>{(currentGame.telestrationCorrectCount ?? 0) >= 2 ? "통과!" : "아쉽게 실패"}</strong><span>정답 {currentGame.telestrationCorrectCount ?? 0}명 · 2명 이상이면 통과</span></div><TelestrationResults room={room} chains={currentGame.telestrationResults} isHost={isHost} automaticIds={currentGame.telestrationAutoCorrectChainIds ?? []} acceptedIds={currentGame.telestrationAcceptedChainIds ?? []} busy={hostActionLocked} onAccept={(chainId) => void acceptTelestrationAnswer(chainId)} /></>}
          {currentGame.teamOutcome && <div className={`team-result ${currentGame.teamOutcome}`}><strong>{currentGame.teamOutcome === "passed" ? "전원 성공 · 통과!" : "이번 도전 실패"}</strong>{currentGame.failedPlayerId && <span>{playerName(room, currentGame.failedPlayerId)}에서 도전 종료</span>}</div>}
          {currentGame.imageSource && <p><a href={currentGame.imageSource} target="_blank" rel="noreferrer">사진 출처 보기</a></p>}
        </>}
      </section>
      <div className="result-actions">{isHost ? <>{currentGame.id !== "ten-seconds" && gameMeta && <button className="button primary xl" disabled={hostActionLocked} onClick={() => void prepareGame(gameMeta)}>같은 게임 다시하기</button>}<button className="button secondary xl" disabled={hostActionLocked} onClick={() => void goHub()}>다른 게임 하러가기</button></> : <div className="waiting"><span className="pulse" />방장의 선택을 기다리는 중</div>}</div>
      {commonOverlays}
    </main>;
  }

  if (!currentGame) return <main className="app-shell"><div className="waiting-card">게임 정보를 불러오는 중</div>{commonOverlays}</main>;
  if (currentGame.id === "apartment") return <main className="app-shell game-shell apartment-game-shell">
    {topBar(currentGame.title)}
    <div className="round-label">ROUND {room.roundNumber}</div>
    <ApartmentBuilding maxFloor={currentGame.apartmentMaxFloor ?? room.players.length + 2} selectedFloor={currentGame.apartmentMyChoice} onSelect={currentGame.apartmentSubmitted?.includes(room.meId ?? "") ? undefined : (floor) => void selectApartmentFloor(floor)} submittedIds={currentGame.apartmentSubmitted ?? []} players={room.players} />
    {currentGame.apartmentSubmitted?.includes(room.meId ?? "") ? <div className="apartment-waiting-note"><span className="status-dot" />선택 완료 · 다른 플레이어를 기다리는 중</div> : <div className="apartment-waiting-note">층을 고르면 선택이 잠겨요. 모두 고르면 바로 결과가 공개돼요.</div>}
    {commonOverlays}
  </main>;
  if (currentGame.id === "maze-courier") return <main className="maze-courier-shell">
    <iframe
      key={`${room.code}-${currentGame.mazeStartedAt ?? currentGame.startedAt}`}
      src={`/maze-courier/index.html?play=1&embedded=1&online=1&room=${room.code}&character=${currentGame.mazeCharacters?.[room.meId ?? ""] ?? 0}`}
      title="미로의 배달부"
      allow="autoplay; fullscreen"
    />
    <div className="maze-courier-toolbar">
      <span><b>{room.code}</b> · {room.players.length}/8명</span>
      {isHost && <button type="button" onClick={() => setConfirmType("lobby")}>대기실</button>}
    </div>
    {commonOverlays}
  </main>;
  if (currentGame.id === "double-dealers") return <main className="maze-courier-shell dealer-table-shell">
    <iframe
      key={`${room.code}-${currentGame.startedAt}-dealer-cabinet-v8`}
      src={`/dealer-cards-2d/index.html?embedded=1&room=${room.code}&ui=dealer-cabinet-v9`}
      title="수상한 딜러들 프리미엄 소셜 경매"
    />
    <div className="maze-courier-toolbar dealer-table-toolbar">
      {isHost && <button type="button" onClick={() => setConfirmType("finish")}>게임 종료</button>}
    </div>
    {commonOverlays}
  </main>;
  if (currentGame.id === "place-mafia" && currentGame.placeMafia) return <PlaceMafiaGame
    code={room.code}
    players={room.players}
    meId={room.meId}
    state={currentGame.placeMafia}
    clockOffsetMs={serverClockOffsetMs}
    isHost={isHost}
    busy={hostActionLocked}
    onAction={applyAction}
    onReplay={() => void startGame()}
    onLobby={() => setConfirmType("lobby")}
    onLeave={() => setConfirmType("leave")}
    overlays={commonOverlays}
  />;
  if (currentGame.id === "cash-n-guns" && currentGame.cashNGuns) return <CashNGunsGame
    code={room.code}
    players={room.players}
    meId={room.meId}
    state={currentGame.cashNGuns}
    isHost={isHost}
    debugMode={debugMode}
    busy={hostActionLocked}
    onAction={applyAction}
    onReplay={() => void startGame()}
    onLobby={() => setConfirmType("lobby")}
    onLeave={() => setConfirmType("leave")}
    overlays={commonOverlays}
  />;
  const privateRole = currentGame.privateRole;
  const submissions = [...(currentGame.photoSubmissions ?? [])].sort((a, b) => a.submittedAt - b.submittedAt);
  const hasPhoto = submissions.some((item) => item.playerId === room.meId);
  const turnHeader = currentPlayer && <div className="turn-banner turn-banner-large"><span>술래 {playerName(room, currentGame.dealerId)}의 오른쪽부터</span><strong>{playerName(room, currentPlayer)}</strong> 정답을 맞추세요!</div>;
  const timedHeader = currentPlayer && <><div className={`turn-banner ${timeUp ? "time-up" : ""}`}><strong>{playerName(room, currentPlayer)}</strong> 정답을 맞추세요!</div><div className={`three-second-timer ${timeUp ? "time-up" : ""}`}>{timeUp ? "시간 초과" : `${Math.max(0, Math.ceil(((currentGame.deadline ?? synchronizedNow) - synchronizedNow) / 1000))}초`}</div></>;

  return <main className={`app-shell game-shell ${currentGame.id === "gem-heist" ? "gem-game-shell" : ""} ${timeUp && ["people", "chain", "four", "character", "group-initial"].includes(currentGame.id) ? "red-alert" : ""}`}>{topBar(currentGame.title)}<div className="round-label">ROUND {room.roundNumber}</div>
    {privateRole && <button
      className={`role-card ${roleVisible ? "revealed" : ""}`}
      draggable={false}
      aria-pressed={roleVisible}
      onPointerDown={(event) => {
        roleTouchRevealRef.current = event.pointerType === "touch";
        setRoleVisible(true);
      }}
      onPointerUp={(event) => {
        if (event.pointerType === "touch") return;
        setRoleVisible(false);
      }}
      onPointerCancel={(event) => {
        if (event.pointerType === "touch") return;
        setRoleVisible(false);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "touch") return;
        setRoleVisible(false);
      }}
      onKeyDown={(event) => {
        if (event.key !== " " && event.key !== "Enter") return;
        event.preventDefault();
        setRoleVisible(true);
      }}
      onKeyUp={(event) => {
        if (event.key !== " " && event.key !== "Enter") return;
        event.preventDefault();
        setRoleVisible(false);
      }}
      onDragStart={(event) => event.preventDefault()}
      onBlur={() => setRoleVisible(false)}
      onContextMenu={(event) => event.preventDefault()}
    ><span>{roleVisible ? privateRole.label : "내 역할 확인"}</span><strong>{roleVisible ? privateRole.value : "휴대폰을 가리고 누르고 계세요"}</strong><small>{roleVisible ? "손을 떼면 다시 숨겨져요" : "누르는 동안만 보여요"}</small></button>}
    {currentGame.id === "gem-heist" && currentGame.gemPrivate && <>
      <GemStageRail phase={currentGame.gemPhase} />
      <a className="gem-role-shortcut" href="#gem-secret-file">기밀 역할 확인하기 <span>↓</span></a>
      <GemCaseBoard game={currentGame} compact={currentGame.gemPhase !== "dossier"} />
      <GemSecretFile info={currentGame.gemPrivate} room={room} visible={roleVisible} onVisibleChange={setRoleVisible} />
      {currentGame.gemPhase === "dossier" && <section className="gem-phase-card">
        <span className="gem-kicker">STEP 01 · 비공개</span>
        <h2>내 파일 확인</h2>
        <div className="gem-mini-rules"><span><b>01</b>역할·특징·알리바이 확인</span><span><b>02</b>말할 단서 1개 선택</span><span><b>03</b>나머지 단서는 비밀</span></div>
        {isHost ? <button className="button primary xl" disabled={hostActionLocked} onClick={() => void startGemInvestigation()}>수사 시작</button> : <div className="waiting"><span className="pulse" />방장을 기다리는 중</div>}
      </section>}
      {currentGame.gemPhase === "investigation" && <section className="gem-phase-card investigation">
        <div className="gem-investigation-head"><div><span className="gem-kicker">STEP 02 · 공개 수사</span><h2>질문 카드 {Math.min(6, (currentGame.gemQuestionIndex ?? 0) + 1)} / 6</h2></div><strong className={(currentGame.deadline ?? synchronizedNow) <= synchronizedNow ? "expired" : ""}>{formatClock((currentGame.deadline ?? synchronizedNow) - synchronizedNow)}</strong></div>
        {currentGame.gemQuestion && <div className="gem-question-card"><img src={gemAsset("questions", currentGame.gemQuestion.id)} alt="" aria-hidden="true" /><div><span>{currentGame.gemQuestion.group ?? "교차신문"} · INTERVIEW</span><h3>{currentGame.gemQuestion.label}</h3><p>{currentGame.gemQuestion.detail}</p></div></div>}
        <div className="gem-one-clue-rule investigation-rule compact"><b>공개 제한</b><strong>개인 단서 1개만 말하기</strong><small>특징·알리바이는 자유롭게 말해요.</small></div>
        {isHost ? <div className="gem-host-actions"><button className="button secondary" disabled={hostActionLocked || (currentGame.gemQuestionIndex ?? 0) >= 5} onClick={() => void nextGemQuestion()}>다음 질문</button><button className="button primary" disabled={hostActionLocked} onClick={() => void startGemVote()}>최종 지목 시작</button></div> : <div className="waiting"><span className="pulse" />공개 수사 진행 중</div>}
      </section>}
      {currentGame.gemPhase === "vote" && <section className="gem-phase-card vote">
        <span className="gem-kicker">STEP 03 · 비밀 지목</span>
        <h2>보석 도둑은 누구인가요?</h2>
        <p>한 명을 골라 비밀리에 지목하세요.</p>
        {!currentGame.gemMyVote ? <>
          <div className="gem-suspect-grid">{room.players.filter((player) => player.status === "active").map((player) => <button type="button" disabled={player.id === room.meId} className={gemSuspect === player.id ? "selected" : ""} key={player.id} onClick={() => setGemSuspect(player.id)}><span>{player.avatar}</span><strong>{player.name}</strong><small>{player.id === room.meId ? "나" : gemSuspect === player.id ? "지목 대상" : "선택"}</small></button>)}</div>
          <button className="button primary xl" disabled={!gemSuspect || busy} onClick={() => void submitGemVote()}>{gemSuspect ? `${playerName(room, gemSuspect)} 지목 확정` : "범인을 선택하세요"}</button>
        </> : <div className="gem-vote-sealed"><span>SEALED</span><strong>지목을 봉인했습니다</strong><small>다른 참가자의 선택을 기다리고 있어요.</small></div>}
        <ParticipantProgress room={room} completedIds={currentGame.gemVoteStatus ?? []} completeLabel="지목 완료" pendingLabel="추리 중" />
      </section>}
    </>}
    {currentGame.id === "initial" && <>{turnHeader}<section className="prompt-card">
      <div className="quiz-category">{currentGame.category ?? "초성"}</div>
      <h2 className="prompt-big">{currentGame.prompt}</h2>
      <p>술래 오른쪽부터 진행해요. 틀리는 사람이 나올 때까지 이어갑니다.</p>
      {currentGame.answerRevealed && <div className="inline-answer">정답 · {currentGame.answer}</div>}
      {isHost && (!currentGame.answerRevealed ? <button className="button primary xl" disabled={hostActionLocked} onClick={() => void revealAnswer()}>정답 공개</button> : <div className="host-game-controls"><button className="button secondary" disabled={hostActionLocked} onClick={() => setConfirmType("finish")}>결과 보기</button><button className="button primary" disabled={hostActionLocked} onClick={() => void nextCoopQuestion()}>다음 문제</button></div>)}
    </section></>}
    {currentGame.id === "trivia" && <>{turnHeader}<section className="prompt-card">
      <div className="quiz-category">중급 상식</div><h2>{currentGame.prompt}</h2>
      <p>술래 오른쪽부터 진행해요. 틀리는 사람이 나올 때까지 이어갑니다.</p>
      {currentGame.answerRevealed && <div className="inline-answer">정답 · {currentGame.answer}</div>}
      {isHost && (!currentGame.answerRevealed ? <button className="button primary xl" disabled={hostActionLocked} onClick={() => void revealAnswer()}>정답 공개</button> : <div className="host-game-controls"><button className="button secondary" disabled={hostActionLocked} onClick={() => setConfirmType("finish")}>결과 보기</button><button className="button primary" disabled={hostActionLocked} onClick={() => void nextCoopQuestion()}>다음 문제</button></div>)}
    </section></>}
    {currentGame.id === "memory" && <section className="prompt-card">
      <div className="memory-word-label">제시어</div><h2 className="memory-word">{currentGame.memoryWord}</h2>
      {!currentGame.memoryReady ? currentGame.isStoryteller ? <>
        <p>진짜 3개와 가짜 1개를 적어주세요.</p>
        <div className="memory-fields">{memoryInputs.map((value, index) => <label key={index}>
          <span>{index === currentGame.fakeSlot ? <>{index + 1}번째 <b>가짜</b> 추억</> : `${index + 1}번째 진짜 추억`}</span>
          <input maxLength={80} value={value} onChange={(event) => setMemoryInputs((items) => items.map((item, i) => i === index ? event.target.value : item))} />
        </label>)}</div>
        <button className="button primary xl" onClick={() => void submitMemory()}>섞어서 공개하기</button>
      </> : <div className="waiting-card"><span className="big-emoji">✍️</span><h2>추억을 작성하고 있어요</h2><p>제시어를 보며 잠시 기다려주세요.</p></div> : <>
        <div className="eyebrow">가짜 추억은 몇 번?</div><ol className="memory-list">{currentGame.memoryEntries?.map((entry, index) => <li key={`${entry}-${index}`}><span>{index + 1}</span>{entry}</li>)}</ol>
      </>}
    </section>}
    {currentGame.id === "taste" && <section className="prompt-card"><div className="eyebrow">취향 선택</div><h2>둘 중 하나를 골라주세요</h2><div className="taste-buttons">{currentGame.choices?.map((choice) => <button key={choice} className={currentGame.myChoice === choice ? "selected" : ""} onClick={() => void applyAction({ action: "taste-choice", choice })}>{choice}</button>)}</div><div className="selection-list">{room.players.map((player) => <span key={player.id} className={currentGame.selectionStatus?.includes(player.id) ? "done" : ""}>{player.name} · {currentGame.selectionStatus?.includes(player.id) ? "선택 완료" : "선택 중"}</span>)}</div></section>}
    {currentGame.id === "ten-seconds" && <section className="prompt-card timer-card"><div className="eyebrow">정확히 10초를 맞혀보세요</div><h2>{myTimerResult ? `${myTimerResult.seconds.toFixed(2)}초` : timerStart ? "진행중" : "준비"}</h2>{!myTimerResult && <button className="timer-button" onClick={() => void submitTimer()}>{timerStart ? "멈춤" : "시작"}</button>}<TimerResults room={room} results={currentGame.timerResults ?? []} /></section>}
    {["color", "object-initial"].includes(currentGame.id) && <section className="prompt-card"><div className="eyebrow">{currentGame.id === "color" ? "이 색깔을 찾아요" : "이 초성 물건을 찾아요"}</div><h2 className="prompt-big">{currentGame.prompt}</h2>{!hasPhoto && <label className={`camera-button ${busy ? "disabled" : ""}`}>📷 사진 찍기<input type="file" accept="image/*" capture="environment" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadPhoto(file); event.currentTarget.value = ""; }} /></label>}<ParticipantProgress room={room} completedIds={submissions.map((item) => item.playerId)} completeLabel="사진 완료" pendingLabel="사진 찾는 중" /><PhotoList room={room} submissions={submissions} onOpen={setLightbox} /></section>}
    {currentGame.id === "people" && <>{timedHeader}<section className="prompt-card">{currentGame.imageId && <QuizImage imageId={currentGame.imageId} />}<h2>사진 속 인물은?</h2>{isHost && <div className="host-game-controls"><button className="button secondary fail-button" disabled={hostActionLocked} onClick={() => setConfirmType("fail")}>실패</button><button className="button primary" disabled={hostActionLocked} onClick={() => void nextCoopQuestion()}>다음 문제</button></div>}</section></>}
    {currentGame.id === "group-initial" && <>{timedHeader}<section className="prompt-card"><div className="coop-eyebrow">다 같이 도전</div><h2 className="prompt-big">{currentGame.prompt}</h2>{isHost && <button className="button primary xl" disabled={hostActionLocked} onClick={() => void nextCoopQuestion()}>다음 문제</button>}</section></>}
    {["chain", "four", "character"].includes(currentGame.id) && <>{timedHeader}<section className="prompt-card coop-turn-card">
      {currentGame.imageId && <QuizImage imageId={currentGame.imageId} />}
      <div className="coop-eyebrow">다 같이 도전</div><h2 className={currentGame.prompt.length <= 12 ? "prompt-big" : ""}>{currentGame.prompt}</h2>
      {currentGame.id === "chain" && <p>같은 주제로 차례대로 답하세요. 주제는 이 판에서 바뀌지 않아요.</p>}
      {isHost && <div className="host-game-controls"><button className="button secondary fail-button" disabled={hostActionLocked} onClick={() => setConfirmType("fail")}>실패</button><button className="button primary" disabled={hostActionLocked} onClick={() => void nextCoopQuestion()}>다음 문제</button></div>}
    </section></>}
    {currentGame.id === "syllable" && <section className="prompt-card"><div className="coop-eyebrow">팀전 · 직접 판정</div><h2 className="prompt-big">{currentGame.prompt}</h2><p>두 팀으로 나눠 한 글자씩 이어서 단어를 완성하세요.</p>{isHost && <button className="button primary xl" disabled={hostActionLocked} onClick={() => void nextCoopQuestion()}>다음 문제</button>}</section>}
    {currentGame.id === "telestration" && currentGame.telestrationTask && <><DrawingBoard key={`${room.roundNumber}-${currentGame.telestrationTask.round}`} task={currentGame.telestrationTask} clockOffsetMs={serverClockOffsetMs} onSubmit={(payload) => void applyAction({ action: "submit-telestration", ...payload })} /><ParticipantProgress room={room} completedIds={currentGame.telestrationSubmitted ?? []} completeLabel="제출 완료" pendingLabel={currentGame.telestrationTask.action === "guess" ? "정답 입력 중" : "그리는 중"} /></>}
    {!["initial", "trivia", "memory", "taste", "ten-seconds", "color", "object-initial", "people", "chain", "four", "character", "syllable", "group-initial", "telestration", "gem-heist"].includes(currentGame.id) && <section className="prompt-card">{currentGame.imageId && <QuizImage imageId={currentGame.imageId} />}<div className={gameMeta?.category === "coop" ? "coop-eyebrow" : "eyebrow"}>{privateRole ? "역할을 확인했다면" : gameMeta?.category === "coop" ? "다 같이 도전" : "이번 제시어"}</div><h2 className={!privateRole && currentGame.prompt.length <= 8 ? "prompt-big" : ""}>{privateRole ? currentGame.id === "body-liar" ? "차례대로 몸으로 표현하세요" : currentGame.id === "face-liar" ? "차례대로 표정만 보여주세요" : currentGame.id === "unknown" ? "차례대로 질문에 답하세요" : "내 단어를 라이어가 모르게 설명하세요." : currentGame.prompt}</h2>{currentGame.id === "hunmin" && <p>마지막 술래 오른쪽으로! 제한시간 3초</p>}</section>}
    {currentGame.answer && !privateRole && !["trivia", "initial", "people", "ten-seconds"].includes(currentGame.id) && <details className="answer-reveal"><summary>정답 확인</summary><strong>{currentGame.answer}</strong></details>}
    {currentGame.id !== "gem-heist" && <div className="sticky-action">{isHost ? inlineManagedGame ? <div className="waiting"><span className="pulse" />진행중</div> : <button className="button primary xl" disabled={hostActionLocked || (currentGame.id === "memory" && !currentGame.memoryReady)} onClick={() => setConfirmType("finish")}>{currentGame.id === "memory" && !currentGame.memoryReady ? "추억 작성 대기 중" : "결과 보기"}</button> : <div className="waiting"><span className="pulse" />진행중</div>}</div>}{commonOverlays}</main>;
}

function TopBar({ code, title, showLobby, actionsDisabled, onLobby, onLeave }: { code: string; title: string; showLobby: boolean; actionsDisabled?: boolean; onLobby: () => void; onLeave: () => void }) { return <header className="topbar"><div className="mini-brand room-code-mini"><span className="brand-dot" />{code}</div><strong>{title}</strong><div className="topbar-actions">{showLobby && <button disabled={actionsDisabled} onClick={onLobby}>대기실로 이동</button>}<button onClick={onLeave}>나가기</button></div></header>; }
function ParticipantProgress({ room, completedIds, completeLabel, pendingLabel }: { room: Room; completedIds: string[]; completeLabel: string; pendingLabel: string }) {
  const completed = new Set(completedIds);
  return <div className="participant-progress" aria-label="참가자 진행 상태">{room.players.map((player) => {
    const isDone = completed.has(player.id);
    return <div className={isDone ? "done" : "pending"} key={player.id}><span>{player.name}</span><strong>{player.status === "waiting" ? "다음 판 대기" : isDone ? completeLabel : pendingLabel}</strong></div>;
  })}</div>;
}
function TimerResults({ room, results }: { room: Room; results: Array<{ playerId: string; seconds: number }> }) {
  const records = new Map(results.map((item) => [item.playerId, item.seconds]));
  return <div className="live-results">{room.players.map((player) => <div key={player.id}><span>{player.name}</span><strong>{records.has(player.id) ? `${records.get(player.id)?.toFixed(2)}초` : player.status === "waiting" ? "다음 판 대기" : "도전 대기"}</strong></div>)}</div>;
}
function PhotoList({ room, submissions, onOpen }: { room: Room; submissions: Array<{ playerId: string; key: string }>; onOpen: (url: string) => void }) { return <div className="photo-feed">{submissions.map((item, index) => { const url = `/api/rooms/${room.code}/photos/${item.key}`; return <button key={item.key} onClick={() => onOpen(url)}><img src={url} alt={`${playerName(room, item.playerId)} 제출 사진`} /><span><strong>{playerName(room, item.playerId)}</strong><small>{index + 1}번째 업로드 · 눌러서 확대</small></span></button>; })}</div>; }
function TelestrationResults({ room, chains, isHost, automaticIds, acceptedIds, busy, onAccept }: { room: Room; chains: TelestrationChain[]; isHost: boolean; automaticIds: string[]; acceptedIds: string[]; busy?: boolean; onAccept: (chainId: string) => void }) {
  const [chainIndex, setChainIndex] = useState(0);
  const [revealedSteps, setRevealedSteps] = useState(0);
  const chain = chains[Math.min(chainIndex, Math.max(0, chains.length - 1))];
  if (!chain) return null;
  const fullyRevealed = revealedSteps >= chain.steps.length;
  const automatic = automaticIds.includes(chain.id);
  const accepted = acceptedIds.includes(chain.id);
  const nextReveal = () => {
    if (!fullyRevealed) setRevealedSteps((count) => Math.min(chain.steps.length, count + 1));
    else if (chainIndex < chains.length - 1) { setChainIndex((index) => index + 1); setRevealedSteps(0); }
  };
  return <div className="telestration-results"><section className="telestration-chain telestration-reveal" key={chain.id}>
    <div className="reveal-counter">릴레이 {chainIndex + 1} / {chains.length}</div>
    <div className="telestration-origin"><span>원래 제시어</span><strong>{chain.prompt}</strong></div>
    {chain.steps.slice(0, revealedSteps).map((step, index) => step.strokes ? <StrokePreview key={index} strokes={step.strokes} label={`${playerName(room, step.playerId)}의 그림`} /> : <div className="final-guess" key={index}><span>{playerName(room, step.playerId)}의 정답</span><strong>{step.guess}</strong></div>)}
    {fullyRevealed && <div className={`answer-verdict ${automatic || accepted ? "correct" : "incorrect"}`}><strong>{automatic ? "자동 정답" : accepted ? "방장 정답 인정" : "오답 판정"}</strong>{isHost && !automatic && !accepted && <button className="button secondary" disabled={busy} onClick={() => onAccept(chain.id)}>정답으로 인정</button>}</div>}
    <div className="reveal-controls">{!fullyRevealed || chainIndex < chains.length - 1 ? <button className="button primary xl" onClick={nextReveal}>{!fullyRevealed ? revealedSteps === chain.steps.length - 1 ? "마지막 정답 공개" : "다음 그림 공개" : "다음 릴레이"}</button> : <div className="reveal-complete">전체 공개 완료</div>}</div>
  </section></div>;
}
