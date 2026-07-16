"use client";

/* eslint-disable @next/next/no-img-element */

import QRCode from "qrcode";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Point = { x: number; y: number };
type Stroke = { eraser?: boolean; points: Point[] };
type Player = { id: string; name: string; avatar: string; joinedAt: number; lastSeen: number; status: "active" | "waiting" };
type HistoryItem = { prompt: string; answer?: string; imageId?: string; imageSource?: string };
type TelestrationChain = { id: string; prompt: string; steps: Array<{ playerId: string; strokes?: Stroke[]; guess?: string }> };
type GameRound = {
  id: string; title: string; prompt: string; briefing?: string; answer?: string; category?: string; liarId?: string; liarWord?: string;
  liarMode?: "normal" | "dumb"; storytellerId?: string; memoryWord?: string; memoryEntries?: string[]; memoryReady?: boolean;
  fakeSlot?: number; fakeMemoryIndex?: number; fakeMemoryText?: string; imageId?: string; imageSource?: string; startedAt: number;
  playerOrder?: string[]; currentPlayerIndex?: number; deadline?: number; correctVotes?: string[]; answerRevealed?: boolean; history?: HistoryItem[];
  choices?: string[]; selectionStatus?: string[]; myChoice?: string; selections?: Record<string, string>;
  timerResults?: Array<{ playerId: string; seconds: number; submittedAt: number }>;
  photoSubmissions?: Array<{ playerId: string; key: string; submittedAt: number }>;
  privateRole?: { danger: boolean; label: string; value: string }; isStoryteller?: boolean;
  telestrationTask?: { round: number; deadline: number; submitted: boolean; prompt?: string; previousStrokes?: Stroke[]; action: "draw" | "guess" };
  telestrationResults?: TelestrationChain[];
};
type Surprise = { phase: "active" | "rest"; title?: string; text?: string; startedAt: number; endsAt: number; ruleId?: string; reveal?: boolean };
type Room = { code: string; hostId: string; players: Player[]; view: "lobby" | "hub" | "briefing" | "game" | "result"; roundNumber: number; game?: GameRound; surprise?: Surprise; meId?: string; authenticated: boolean };
type GameMeta = { id: string; title: string; icon: string; description: string; category: "solo" | "coop" };

const AVATARS = ["😎", "🥳", "🤠", "👻", "🐥", "🐰", "🐻", "🦊"];
const SOLO_GAMES: GameMeta[] = [
  { id: "liar", title: "오리지널 라이어", icon: "🕵️", description: "한 명만 제시어를 몰라요", category: "solo" },
  { id: "dumb-liar", title: "바보 라이어", icon: "🤡", description: "한 명만 살짝 다른 단어를 받아요", category: "solo" },
  { id: "body-liar", title: "몸으로 라이어", icon: "🕺", description: "말 없이 몸으로 표현해요", category: "solo" },
  { id: "face-liar", title: "얼굴로 라이어", icon: "😶", description: "표정만으로 제시어를 표현해요", category: "solo" },
  { id: "unknown", title: "라이어-질문", icon: "❓", description: "한 명만 질문을 모르거나 달라요", category: "solo" },
  { id: "initial", title: "초성 퀴즈", icon: "ㄱ", description: "3초 안에 초성 정답을 맞혀요", category: "solo" },
  { id: "hunmin", title: "무한 훈민정음", icon: "ㅎ", description: "초성 단어를 막힐 때까지 말해요", category: "solo" },
  { id: "taste", title: "취향 일치", icon: "🤝", description: "휴대폰으로 취향을 선택해요", category: "solo" },
  { id: "trivia", title: "중급 상식 퀴즈", icon: "💡", description: "랜덤 순서로 3초 상식 퀴즈", category: "solo" },
  { id: "memory", title: "가짜 추억 찾기", icon: "🎭", description: "섞인 추억 중 가짜를 찾아요", category: "solo" },
  { id: "ten-seconds", title: "정확히 10초", icon: "⏱️", description: "각자 한 번씩 10초에 도전해요", category: "solo" },
  { id: "color", title: "색깔 찾기", icon: "🎨", description: "같은 색 물건을 찍어 올려요", category: "solo" },
  { id: "object-initial", title: "초성 물건 찾기", icon: "📸", description: "초성 물건을 찍어 올려요", category: "solo" },
];
const COOP_GAMES: GameMeta[] = [
  { id: "telestration", title: "텔레그레이션", icon: "✏️", description: "그림을 보고 이어 그리는 릴레이", category: "coop" },
  { id: "people", title: "인물 퀴즈", icon: "👤", description: "3초 안에 사진 속 인물을 맞혀요", category: "coop" },
  { id: "chain", title: "줄줄이 말해요", icon: "🔗", description: "조건에 맞는 말을 차례대로 말해요", category: "coop" },
  { id: "four", title: "네 글자 이어말하기", icon: "4️⃣", description: "앞 두 글자를 보고 뒤를 완성해요", category: "coop" },
  { id: "syllable", title: "이어말하기", icon: "🗣️", description: "한 글자씩 이어 정답을 만들어요", category: "coop" },
  { id: "character", title: "캐릭터 퀴즈", icon: "🧸", description: "사진 속 캐릭터를 함께 맞혀요", category: "coop" },
  { id: "group-initial", title: "단체 초성 퀴즈", icon: "👥", description: "3초 안에 초성 단어를 말해요", category: "coop" },
];
const ALL_GAMES = [...SOLO_GAMES, ...COOP_GAMES];
const LIAR_OPTION_GAMES = ["liar", "body-liar", "face-liar", "unknown"];
const pick = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)];

function getStoredValue(key: string, fallback = "") { return typeof window === "undefined" ? fallback : localStorage.getItem(key) || fallback; }
function getRoomCodeFromUrl() { return typeof window === "undefined" ? "" : new URLSearchParams(location.search).get("room")?.replace(/\D/g, "").slice(0, 4) || ""; }
function playerName(room: Room, id?: string) { return room.players.find((player) => player.id === id)?.name ?? "참가자"; }
function formatClock(ms: number) { const seconds = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`; }

function QuizImage({ imageId }: { imageId: string }) {
  const [failed, setFailed] = useState(false);
  return <div className="quiz-image">{!failed ? <img src={`/api/game-image/${imageId}`} alt="퀴즈 이미지" onError={() => setFailed(true)} /> : <div className="image-fallback">이미지를 불러오지 못했어요</div>}</div>;
}

function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel }: { title: string; message: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void }) {
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={title}><section className="confirm-card"><div className="eyebrow">한 번 더 확인</div><h2>{title}</h2><p>{message}</p><div className="confirm-actions"><button className="button secondary" onClick={onCancel}>취소</button><button className="button danger-button" onClick={onConfirm}>{confirmLabel}</button></div></section></div>;
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

function DrawingBoard({ task, onSubmit }: { task: NonNullable<GameRound["telestrationTask"]>; onSubmit: (payload: { strokes?: Stroke[]; guess?: string }) => void }) {
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
  useEffect(() => { if (task.deadline <= now) submit(); }, [now, submit, task.deadline]);
  if (task.submitted) return <div className="waiting-card"><span className="big-emoji">✅</span><h2>제출 완료</h2><p>다른 참가자의 제출을 기다리고 있어요.</p></div>;
  const remaining = Math.max(0, task.deadline - now);
  if (task.action === "guess") return <section className="drawing-stage"><div className="drawing-round">텔레그레이션 {task.round} / 4</div><div className="drawing-timer">{Math.ceil(remaining / 1000)}초</div><h2>마지막 그림의 정답은?</h2><StrokePreview strokes={task.previousStrokes ?? []} /><input className="text-field" maxLength={30} placeholder="정답 입력" value={guess} onChange={(event) => setGuess(event.target.value)} /><button className="button primary xl" onClick={submit}>정답 제출</button></section>;
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
  canvas.getContext("2d")?.drawImage(source, 0, 0, canvas.width, canvas.height);
  cleanup();
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("사진 변환 실패")), "image/jpeg", .8));
}

export default function Home() {
  const [room, setRoom] = useState<Room | null>(null);
  const [name, setName] = useState(() => getStoredValue("hanpan-name"));
  const [avatar, setAvatar] = useState(() => getStoredValue("hanpan-avatar", AVATARS[0]));
  const [joinCode, setJoinCode] = useState(getRoomCodeFromUrl);
  const [intent, setIntent] = useState<"create" | "join" | null>(null);
  const [tab, setTab] = useState<"solo" | "coop">("solo");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [roleVisible, setRoleVisible] = useState(false);
  const [qr, setQr] = useState("");
  const [memoryInputs, setMemoryInputs] = useState(["", "", "", ""]);
  const [timerStart, setTimerStart] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [liarMode, setLiarMode] = useState<"normal" | "dumb">("normal");
  const [confirmType, setConfirmType] = useState<"leave" | "finish" | null>(null);
  const [surpriseCollapsed, setSurpriseCollapsed] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const leavingRef = useRef(false);
  const alertedSurprise = useRef(0);
  const me = room?.players.find((player) => player.id === room.meId);
  const isHost = Boolean(room && room.hostId === room.meId);
  const currentGame = room?.game;
  const roomCode = room?.code;

  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 100); return () => window.clearInterval(id); }, []);
  useEffect(() => {
    const code = getRoomCodeFromUrl();
    const targetRoom = code || localStorage.getItem("hanpan-room");
    if (!targetRoom) return;
    fetch(`/api/rooms/${targetRoom}`, { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error();
      const body = await response.json() as { room: Room };
      if (body.room.authenticated) setRoom(body.room); else if (code) { setJoinCode(code); setIntent("join"); } else localStorage.removeItem("hanpan-room");
    }).catch(() => { localStorage.removeItem("hanpan-room"); if (code) { setJoinCode(code); setIntent("join"); } });
  }, []);
  useEffect(() => {
    if (!roomCode) return;
    const poll = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/rooms/${roomCode}`, { cache: "no-store" });
        if (!response.ok) return;
        const body = await response.json() as { room: Room };
        if (!leavingRef.current && body.room.authenticated) setRoom(body.room);
        else if (!body.room.authenticated) { localStorage.removeItem("hanpan-room"); setRoom(null); setJoinCode(""); setIntent(null); }
      } catch { /* 다음 주기에 재연결 */ }
    }, 1400);
    return () => window.clearInterval(poll);
  }, [roomCode]);
  useEffect(() => {
    // 새 라운드의 비공개 역할과 로컬 입력이 이전 판에서 새지 않게 초기화합니다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRoleVisible(false); setMemoryInputs(["", "", "", ""]); setTimerStart(null); setLiarMode("normal");
  }, [room?.roundNumber, room?.view, currentGame?.id]);
  useEffect(() => {
    if (!roomCode) return;
    const url = `${location.origin}${location.pathname}?room=${roomCode}`;
    QRCode.toDataURL(url, { width: 240, margin: 1, color: { dark: "#0d0f12", light: "#ffffff" } }).then(setQr).catch(() => setQr(""));
  }, [roomCode]);
  useEffect(() => {
    const surprise = room?.surprise;
    if (!surprise || surprise.phase !== "active" || alertedSurprise.current === surprise.startedAt) return;
    alertedSurprise.current = surprise.startedAt;
    setSurpriseCollapsed(false);
    navigator.vibrate?.([250, 120, 250]);
    try { const Context = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext; if (Context) { const audio = new Context(); const oscillator = audio.createOscillator(); const gain = audio.createGain(); oscillator.frequency.value = 880; gain.gain.value = .08; oscillator.connect(gain).connect(audio.destination); oscillator.start(); oscillator.stop(audio.currentTime + .18); } } catch { /* 소리 권한이 없으면 진동만 사용 */ }
  }, [room?.surprise]);

  const showNotice = useCallback((message: string) => { setNotice(message); window.setTimeout(() => setNotice(""), 2600); }, []);
  const applyAction = useCallback(async (payload: Record<string, unknown>) => {
    if (!room) return null;
    const response = await fetch(`/api/rooms/${room.code}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = await response.json() as { room?: Room; error?: string };
    if (!response.ok || !body.room) throw new Error(body.error || "요청을 처리하지 못했어요.");
    setRoom(body.room); return body.room;
  }, [room]);
  const enterRoom = async () => {
    if (!name.trim()) return showNotice("이름을 입력해 주세요.");
    if (intent === "join" && joinCode.length !== 4) return showNotice("4자리 방 코드를 입력해 주세요.");
    setBusy(true);
    try {
      const player = { name: name.trim(), avatar };
      const response = intent === "create" ? await fetch("/api/rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ player }) }) : await fetch(`/api/rooms/${joinCode}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "join", player }) });
      const body = await response.json() as { room?: Room; error?: string };
      if (!response.ok || !body.room) throw new Error(body.error || "방에 들어가지 못했어요.");
      localStorage.setItem("hanpan-name", name.trim()); localStorage.setItem("hanpan-avatar", avatar); localStorage.setItem("hanpan-room", body.room.code);
      leavingRef.current = false; history.replaceState(null, "", `?room=${body.room.code}`); setRoom(body.room); setIntent(null);
    } catch (error) { showNotice(error instanceof Error ? error.message : "다시 시도해 주세요."); } finally { setBusy(false); }
  };
  const leaveRoom = async () => {
    if (!room) return;
    setBusy(true); leavingRef.current = true;
    try { await fetch(`/api/rooms/${room.code}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "leave" }), keepalive: true }); }
    finally { localStorage.removeItem("hanpan-room"); history.replaceState(null, "", location.pathname); setRoom(null); setJoinCode(""); setIntent(null); setBusy(false); setConfirmType(null); }
  };
  const shareRoom = async () => { if (!room) return; const url = `${location.origin}${location.pathname}?room=${room.code}`; try { if (navigator.share) await navigator.share({ title: "한판 술게임", text: `방 코드 ${room.code}`, url }); else { await navigator.clipboard.writeText(url); showNotice("참가 링크를 복사했어요."); } } catch { /* 공유 취소 */ } };
  const prepareGame = async (meta: GameMeta) => { if (!isHost) return showNotice("방장이 게임을 고르고 있어요."); try { await applyAction({ action: "prepare-game", gameId: meta.id }); } catch (error) { showNotice(error instanceof Error ? error.message : "다시 시도해 주세요."); } };
  const startGame = async () => { if (!currentGame || !isHost) return; try { await applyAction({ action: "start-game", gameId: currentGame.id, mode: liarMode }); } catch (error) { showNotice(error instanceof Error ? error.message : "게임을 시작하지 못했어요."); } };
  const finishGame = async () => { setConfirmType(null); try { await applyAction({ action: "set-view", view: "result" }); } catch (error) { showNotice(error instanceof Error ? error.message : "결과를 열지 못했어요."); } };
  const goHub = async () => { try { await applyAction({ action: "set-view", view: "hub" }); } catch (error) { showNotice(error instanceof Error ? error.message : "이동하지 못했어요."); } };
  const submitMemory = async () => { if (memoryInputs.some((value) => !value.trim())) return showNotice("네 문장을 모두 적어 주세요."); try { await applyAction({ action: "submit-memory", entries: memoryInputs }); } catch (error) { showNotice(error instanceof Error ? error.message : "제출하지 못했어요."); } };
  const submitTimer = async () => { if (!timerStart) { setTimerStart(Date.now()); return; } const seconds = (Date.now() - timerStart) / 1000; setTimerStart(null); try { await applyAction({ action: "submit-timer", seconds }); } catch (error) { showNotice(error instanceof Error ? error.message : "기록을 제출하지 못했어요."); } };
  const uploadPhoto = async (file: File) => { if (!room) return; setBusy(true); try { const blob = await compressPhoto(file); const form = new FormData(); form.append("photo", blob, "camera.jpg"); const response = await fetch(`/api/rooms/${room.code}/photos`, { method: "POST", body: form }); const body = await response.json() as { room?: Room; error?: string }; if (!response.ok || !body.room) throw new Error(body.error || "사진을 올리지 못했어요."); setRoom(body.room); } catch (error) { showNotice(error instanceof Error ? error.message : "사진을 올리지 못했어요."); } finally { setBusy(false); } };
  const currentPlayer = currentGame?.playerOrder?.[currentGame.currentPlayerIndex ?? 0];
  const timeUp = Boolean(currentGame?.deadline && now >= currentGame.deadline);
  const myTimerResult = currentGame?.timerResults?.find((item) => item.playerId === room?.meId);
  const gameMeta = useMemo(() => ALL_GAMES.find((item) => item.id === currentGame?.id), [currentGame?.id]);
  const activeSurprise = room?.surprise && (room.surprise.phase === "active" || room.surprise.reveal) ? room.surprise : null;

  const topBar = (title: string) => <TopBar title={title} onLeave={() => setConfirmType("leave")} />;
  const commonOverlays = <>{activeSurprise && <aside className={`surprise-drawer ${surpriseCollapsed ? "collapsed" : ""}`}><button onClick={() => setSurpriseCollapsed((value) => !value)}><span>⚡ {activeSurprise.title}</span><strong>{formatClock(activeSurprise.endsAt - now)}</strong></button>{!surpriseCollapsed && <p>{activeSurprise.text?.split("\n").map((line) => <span key={line}>{line}</span>)}</p>}</aside>}{notice && <div className="toast" role="status">{notice}</div>}{lightbox && <button className="photo-lightbox" aria-label="사진 닫기" onClick={() => setLightbox(null)}><img src={lightbox} alt="확대 사진" /></button>}{confirmType && <ConfirmDialog title={confirmType === "leave" ? "방에서 나갈까요?" : "게임을 끝낼까요?"} message={confirmType === "leave" ? room?.view === "game" ? "현재 게임이 진행 중입니다. 취소하면 동일한 참가자로 계속 게임에 참여합니다." : "나가면 참가자 목록에서 바로 사라집니다." : "결과 화면으로 이동하면 현재 문제 진행이 끝납니다."} confirmLabel={confirmType === "leave" ? "나가기" : "결과 보기"} onCancel={() => setConfirmType(null)} onConfirm={() => confirmType === "leave" ? void leaveRoom() : void finishGame()} />}</>;

  if (!room) return <main className="app-shell entry-shell"><header className="brand"><span className="brand-dot" />한판</header>{!intent ? <section className="hero"><div className="eyebrow">점수 없이 바로 노는 술게임</div><h1>모이면,<br /><em>한판이면 돼.</em></h1><p>휴대폰 하나씩 들고 방에 들어오세요.<br />판정은 우리끼리, 결과는 바로.</p><button className="button primary xl" onClick={() => { setJoinCode(""); setIntent("create"); }}>새 방 만들기</button><div className="join-inline"><input aria-label="4자리 방 코드" inputMode="numeric" autoComplete="off" maxLength={4} placeholder="4자리 코드" value={joinCode} onChange={(event) => setJoinCode(event.target.value.replace(/\D/g, "").slice(0, 4))} /><button className="button secondary" onClick={() => joinCode.length === 4 ? setIntent("join") : showNotice("4자리 코드를 입력해 주세요.")}>참가</button></div><div className="micro-copy"><span>마이크 판정 없음</span><span>점수표 없음</span><span>팀전 없음</span></div></section> : <section className="panel profile-panel"><button className="back-button" onClick={() => { setIntent(null); if (!getRoomCodeFromUrl()) setJoinCode(""); }} aria-label="뒤로">←</button><div className="eyebrow">{intent === "create" ? "새 방 만들기" : `방 ${joinCode} 참가`}</div><h1 className="panel-title">누구로 들어갈까요?</h1><label className="field-label" htmlFor="name">이름</label><input id="name" className="text-field" maxLength={10} autoFocus placeholder="최대 10자" value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void enterRoom(); }} /><div className="field-label">프로필</div><div className="avatar-grid">{AVATARS.map((item) => <button key={item} aria-label={`${item} 프로필`} className={`avatar-choice ${avatar === item ? "selected" : ""}`} onClick={() => setAvatar(item)}>{item}</button>)}</div><button className="button primary xl" disabled={busy} onClick={() => void enterRoom()}>{busy ? "들어가는 중…" : intent === "create" ? "방 만들기" : "참가하기"}</button></section>}{commonOverlays}</main>;

  if (room.view === "lobby") return <main className="app-shell">{topBar("대기실")}<section className="room-code-card"><div><span>방 코드</span><strong>{room.code}</strong></div><button className="share-button" onClick={() => void shareRoom()}>공유</button></section><section className="qr-card">{qr ? <img src={qr} alt={`방 ${room.code} 참가 QR 코드`} /> : <div className="image-loader" />}<p>QR을 찍거나 코드로 참가하세요</p></section><section className="players-section"><div className="section-heading"><h2>참가자</h2><span>{room.players.length}명</span></div><div className="player-list">{room.players.map((player) => <div className="player-row" key={player.id}><span className="player-avatar">{player.avatar}</span><span>{player.name}</span>{player.id === room.hostId && <span className="host-badge">방장</span>}{player.id === room.meId && <span className="me-label">나</span>}</div>)}</div></section><div className="sticky-action">{isHost ? <button className="button primary xl" onClick={() => void goHub()}>{room.players.length === 1 ? "혼자 시작하기" : "게임 고르기"}</button> : <div className="waiting"><span className="pulse" />방장이 시작하기를 기다리는 중</div>}</div>{commonOverlays}</main>;

  if (me?.status === "waiting") return <main className="app-shell">{topBar("다음 판 대기")}<section className="waiting-card"><span className="big-emoji">👋</span><h2>현재 게임이 진행 중이에요</h2><p>이번 판이 끝나면 동일한 참가자로 자동 참여해요.</p></section>{commonOverlays}</main>;

  if (room.view === "hub") { const games = tab === "solo" ? SOLO_GAMES : COOP_GAMES; return <main className="app-shell">{topBar("게임 고르기")}<button className="random-card" onClick={() => void prepareGame(pick(ALL_GAMES))}><span className="random-icon">✦</span><span><strong>랜덤 게임</strong><small>{ALL_GAMES.length}개 게임 중 하나를 골라요</small></span><span>→</span></button><div className="segmented" role="tablist"><button role="tab" aria-selected={tab === "solo"} className={tab === "solo" ? "active" : ""} onClick={() => setTab("solo")}>개인전 <span>{SOLO_GAMES.length}</span></button><button role="tab" aria-selected={tab === "coop"} className={tab === "coop" ? "active" : ""} onClick={() => setTab("coop")}>모두 협동 <span>{COOP_GAMES.length}</span></button></div><div className="game-list">{games.map((game) => <button className="game-row" key={game.id} onClick={() => void prepareGame(game)}><span className="game-icon">{game.icon}</span><span><strong>{game.title}</strong><small>{game.description}</small></span><span className="chevron">›</span></button>)}</div>{!isHost && <div className="floating-wait">방장이 게임을 고르는 중</div>}{commonOverlays}</main>; }

  if (room.view === "briefing" && currentGame) return <main className="app-shell briefing-shell">{topBar("게임 설명")}<section className="briefing-card"><span className="big-emoji">{gameMeta?.icon ?? "🎮"}</span><div className="eyebrow">시작 전 설명</div><h1>{currentGame.title}</h1><p>{currentGame.briefing ?? currentGame.prompt}</p>{LIAR_OPTION_GAMES.includes(currentGame.id) && isHost && <div className="mode-picker"><button className={liarMode === "normal" ? "active" : ""} onClick={() => setLiarMode("normal")}><strong>일반 라이어</strong><small>라이어는 장르만 확인</small></button><button className={liarMode === "dumb" ? "active" : ""} onClick={() => setLiarMode("dumb")}><strong>바보 라이어 모드</strong><small>라이어만 다른 제시어</small></button></div>}</section><div className="sticky-action">{isHost ? <button className="button primary xl" onClick={() => void startGame()}>게임 시작</button> : <div className="waiting"><span className="pulse" />방장이 게임을 시작하기를 기다리는 중</div>}</div>{commonOverlays}</main>;

  if (room.view === "result" && currentGame) {
    const liarName = playerName(room, currentGame.liarId);
    const history = currentGame.history ?? [];
    return <main className="app-shell result-shell">
      {topBar("결과")}
      <section className="result-card">
        <div className="result-mark">✓</div><div className="eyebrow">이번 판 끝</div><h1>{currentGame.title}</h1>
        {currentGame.id === "memory" && <div className="answer-block"><span>가짜 추억</span><strong>{currentGame.fakeMemoryIndex}번 · {currentGame.fakeMemoryText}</strong></div>}
        {!["memory", "dumb-liar", "initial", "trivia", "people"].includes(currentGame.id) && currentGame.answer && <div className="answer-block"><span>정답</span><strong>{currentGame.answer}</strong></div>}
        {currentGame.id === "dumb-liar" && <><div className="answer-block"><span>정답 제시어</span><strong>{currentGame.answer}</strong></div><div className="answer-block"><span>바보 라이어</span><strong>{liarName} · {currentGame.liarWord}</strong></div></>}
        {currentGame.id !== "dumb-liar" && currentGame.liarId && <div className="answer-block"><span>라이어</span><strong>{liarName}</strong></div>}
        {history.length > 0 && ["initial", "trivia", "people"].includes(currentGame.id) && <div className="history-results"><h3>나왔던 정답</h3>{history.map((item, index) => <div key={`${item.prompt}-${index}`}><span>{index + 1}번 · {item.prompt}</span><strong>{item.answer ?? "우리끼리 판정"}</strong></div>)}</div>}
        {currentGame.id === "taste" && <div className="history-results">{currentGame.choices?.map((choice) => <div key={choice}><span>{choice}</span><strong>{Object.values(currentGame.selections ?? {}).filter((value) => value === choice).length}명</strong></div>)}</div>}
        {currentGame.id === "ten-seconds" && <TimerResults room={room} results={currentGame.timerResults ?? []} />}
        {currentGame.telestrationResults && <TelestrationResults room={room} chains={currentGame.telestrationResults} />}
        {currentGame.imageSource && <p><a href={currentGame.imageSource} target="_blank" rel="noreferrer">사진 출처 보기</a></p>}
        <p className="manual-result">{["liar", "dumb-liar", "body-liar", "face-liar", "unknown", "memory"].includes(currentGame.id) ? "누가 걸렸는지는 우리끼리 판정!" : "결과를 같이 확인해 보세요."}</p>
      </section>
      <div className="result-actions">{isHost ? <>{currentGame.id !== "ten-seconds" && gameMeta && <button className="button primary xl" onClick={() => void prepareGame(gameMeta)}>같은 게임 다시하기</button>}<button className="button secondary xl" onClick={() => void goHub()}>다른 게임 하러가기</button></> : <div className="waiting"><span className="pulse" />방장의 선택을 기다리는 중</div>}</div>
      {commonOverlays}
    </main>;
  }

  if (!currentGame) return <main className="app-shell"><div className="waiting-card">게임 정보를 불러오는 중</div>{commonOverlays}</main>;
  const privateRole = currentGame.privateRole;
  const submissions = [...(currentGame.photoSubmissions ?? [])].sort((a, b) => a.submittedAt - b.submittedAt);
  const hasPhoto = submissions.some((item) => item.playerId === room.meId);
  const timedHeader = currentPlayer && <><div className={`turn-banner ${timeUp ? "time-up" : ""}`}><strong>{playerName(room, currentPlayer)}</strong> 정답을 맞추세요!</div><div className={`three-second-timer ${timeUp ? "time-up" : ""}`}>{timeUp ? "시간 초과" : `${Math.max(0, Math.ceil(((currentGame.deadline ?? now) - now) / 1000))}초`}</div></>;

  return <main className={`app-shell game-shell ${timeUp && ["initial", "people", "group-initial"].includes(currentGame.id) ? "red-alert" : ""}`}>{topBar(currentGame.title)}<div className="round-label">ROUND {room.roundNumber}</div>
    {privateRole && <button className={`role-card ${roleVisible ? "revealed" : ""}`} onClick={() => setRoleVisible((value) => !value)}><span>{roleVisible ? privateRole.label : "내 역할 확인"}</span><strong>{roleVisible ? privateRole.value : "휴대폰을 가리고 눌러주세요"}</strong><small>{roleVisible ? "다시 눌러 숨기기" : "나만 확인하기"}</small></button>}
    {currentGame.id === "initial" && <>{timedHeader}<section className="prompt-card"><div className="eyebrow">{currentGame.category ?? "초성"}</div><h2 className="prompt-big">{currentGame.history?.at(-1)?.prompt ?? currentGame.prompt}</h2><p>정답이면 버튼을 눌러주세요. 두 명 이상 누르면 다음 문제!</p><button className="button primary xl" onClick={() => void applyAction({ action: "vote-correct" })}>정답이에요 · {currentGame.correctVotes?.length ?? 0}명</button></section></>}
    {currentGame.id === "trivia" && <>{timedHeader}<section className="prompt-card"><div className="eyebrow">중급 상식</div><h2>{currentGame.prompt}</h2>{currentGame.answerRevealed && <div className="inline-answer">정답 · {currentGame.answer}</div>}{isHost && (!currentGame.answerRevealed ? <button className="button primary xl" onClick={() => void applyAction({ action: "reveal-answer" })}>정답 공개</button> : <button className="button primary xl" onClick={() => void applyAction({ action: "next-question" })}>다음 문제</button>)}</section></>}
    {currentGame.id === "memory" && <section className="prompt-card"><div className="memory-word-label">제시어</div><h2 className="memory-word">{currentGame.memoryWord}</h2>{!currentGame.memoryReady ? currentGame.isStoryteller ? <><p>진짜 3개와 거짓 1개를 적어주세요.</p><div className="memory-fields">{memoryInputs.map((value, index) => <label key={index} className={index === currentGame.fakeSlot ? "fake-field" : ""}><span>{index === currentGame.fakeSlot ? "거짓 추억" : `${index + 1}번째 진짜 추억`}</span><input maxLength={80} value={value} onChange={(event) => setMemoryInputs((items) => items.map((item, i) => i === index ? event.target.value : item))} /></label>)}</div><button className="button primary xl" onClick={() => void submitMemory()}>섞어서 공개하기</button></> : <div className="waiting-card"><span className="big-emoji">✍️</span><h2>추억을 작성하고 있어요</h2><p>제시어를 보며 잠시 기다려주세요.</p></div> : <><div className="eyebrow">가짜 추억은 몇 번?</div><ol className="memory-list">{currentGame.memoryEntries?.map((entry, index) => <li key={`${entry}-${index}`}><span>{index + 1}</span>{entry}</li>)}</ol></>}</section>}
    {currentGame.id === "taste" && <section className="prompt-card"><div className="eyebrow">취향 선택</div><h2>둘 중 하나를 골라주세요</h2><div className="taste-buttons">{currentGame.choices?.map((choice) => <button key={choice} className={currentGame.myChoice === choice ? "selected" : ""} onClick={() => void applyAction({ action: "taste-choice", choice })}>{choice}</button>)}</div><div className="selection-list">{room.players.map((player) => <span key={player.id} className={currentGame.selectionStatus?.includes(player.id) ? "done" : ""}>{player.name} · {currentGame.selectionStatus?.includes(player.id) ? "선택 완료" : "선택 중"}</span>)}</div></section>}
    {currentGame.id === "ten-seconds" && <section className="prompt-card timer-card"><div className="eyebrow">정확히 10초를 맞혀보세요</div><h2>{myTimerResult ? `${myTimerResult.seconds.toFixed(2)}초` : timerStart ? "진행중" : "준비"}</h2>{!myTimerResult && <button className="timer-button" onClick={() => void submitTimer()}>{timerStart ? "멈춤" : "시작"}</button>}<TimerResults room={room} results={currentGame.timerResults ?? []} /></section>}
    {["color", "object-initial"].includes(currentGame.id) && <section className="prompt-card"><div className="eyebrow">{currentGame.id === "color" ? "이 색깔을 찾아요" : "이 초성 물건을 찾아요"}</div><h2 className="prompt-big">{currentGame.prompt}</h2>{!hasPhoto && <label className={`camera-button ${busy ? "disabled" : ""}`}>📷 사진 찍기<input type="file" accept="image/*" capture="environment" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadPhoto(file); event.currentTarget.value = ""; }} /></label>}<PhotoList room={room} submissions={submissions} onOpen={setLightbox} /></section>}
    {currentGame.id === "people" && <>{timedHeader}<section className="prompt-card">{currentGame.imageId && <QuizImage imageId={currentGame.imageId} />}<h2>사진 속 인물은?</h2>{isHost && <button className="button primary xl" onClick={() => void applyAction({ action: "next-question" })}>다음 문제</button>}</section></>}
    {currentGame.id === "group-initial" && <>{timedHeader}<section className="prompt-card"><div className="coop-eyebrow">다 같이 도전</div><h2 className="prompt-big">{currentGame.prompt}</h2>{isHost && <button className="button primary xl" onClick={() => void applyAction({ action: "next-question" })}>다음 문제</button>}</section></>}
    {currentGame.id === "telestration" && currentGame.telestrationTask && <DrawingBoard key={`${room.roundNumber}-${currentGame.telestrationTask.round}`} task={currentGame.telestrationTask} onSubmit={(payload) => void applyAction({ action: "submit-telestration", ...payload })} />}
    {!["initial", "trivia", "memory", "taste", "ten-seconds", "color", "object-initial", "people", "group-initial", "telestration"].includes(currentGame.id) && <section className="prompt-card">{currentGame.imageId && <QuizImage imageId={currentGame.imageId} />}<div className={gameMeta?.category === "coop" ? "coop-eyebrow" : "eyebrow"}>{privateRole ? "역할을 확인했다면" : gameMeta?.category === "coop" ? "다 같이 도전" : "이번 제시어"}</div><h2 className={!privateRole && currentGame.prompt.length <= 8 ? "prompt-big" : ""}>{privateRole ? currentGame.id === "body-liar" ? "차례대로 몸으로 표현하세요" : currentGame.id === "face-liar" ? "차례대로 표정만 보여주세요" : currentGame.id === "unknown" ? "차례대로 질문에 답하세요" : "내 단어를 자연스럽게 설명하세요" : currentGame.prompt}</h2>{currentGame.id === "hunmin" && <p>마지막 술래 오른쪽으로! 제한시간 3초</p>}{currentGame.id === "chain" && <p>시계 방향으로 한 명씩, 겹치지 않게 말하세요.</p>}{currentGame.id === "syllable" && <p>{room.players.length}명이 한 글자씩 이어 정답 하나를 만드세요.</p>}</section>}
    {currentGame.answer && !privateRole && !["trivia", "initial", "people", "ten-seconds"].includes(currentGame.id) && <details className="answer-reveal"><summary>정답 확인</summary><strong>{currentGame.answer}</strong></details>}
    <div className="sticky-action">{isHost ? <button className="button primary xl" disabled={currentGame.id === "memory" && !currentGame.memoryReady} onClick={() => setConfirmType("finish")}>{currentGame.id === "memory" && !currentGame.memoryReady ? "추억 작성 대기 중" : "결과 보기"}</button> : <div className="waiting"><span className="pulse" />우리끼리 판정하고 있어요</div>}</div>{commonOverlays}</main>;
}

function TopBar({ title, onLeave }: { title: string; onLeave: () => void }) { return <header className="topbar"><div className="mini-brand"><span className="brand-dot" />한판</div><strong>{title}</strong><button onClick={onLeave}>나가기</button></header>; }
function TimerResults({ room, results }: { room: Room; results: Array<{ playerId: string; seconds: number }> }) { return <div className="live-results">{results.map((item) => <div key={item.playerId}><span>{playerName(room, item.playerId)}</span><strong>{item.seconds.toFixed(2)}초</strong></div>)}</div>; }
function PhotoList({ room, submissions, onOpen }: { room: Room; submissions: Array<{ playerId: string; key: string }>; onOpen: (url: string) => void }) { return <div className="photo-feed">{submissions.map((item, index) => { const url = `/api/rooms/${room.code}/photos/${item.key}`; return <button key={item.key} onClick={() => onOpen(url)}><img src={url} alt={`${playerName(room, item.playerId)} 제출 사진`} /><span><strong>{playerName(room, item.playerId)}</strong><small>{index + 1}번째 업로드 · 눌러서 확대</small></span></button>; })}</div>; }
function TelestrationResults({ room, chains }: { room: Room; chains: TelestrationChain[] }) { return <div className="telestration-results">{chains.map((chain, chainIndex) => <section className="telestration-chain" key={chain.id}><h3>릴레이 {chainIndex + 1} · {chain.prompt}</h3>{chain.steps.map((step, index) => step.strokes ? <StrokePreview key={index} strokes={step.strokes} label={`${playerName(room, step.playerId)}의 그림`} /> : <div className="final-guess" key={index}><span>{playerName(room, step.playerId)}의 정답</span><strong>{step.guess}</strong></div>)}</section>)}</div>; }
