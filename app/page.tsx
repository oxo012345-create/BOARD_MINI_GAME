"use client";

/* eslint-disable @next/next/no-img-element */

import QRCode from "qrcode";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Player = { id: string; name: string; avatar: string; joinedAt: number };
type Modifier = { title: string; text: string; targetId?: string };
type GameRound = {
  id: string;
  title: string;
  prompt: string;
  answer?: string;
  category?: string;
  liarId?: string;
  liarWord?: string;
  storytellerId?: string;
  memoryWord?: string;
  memoryEntries?: string[];
  memoryReady?: boolean;
  imageQuery?: string;
  startedAt: number;
  modifier?: Modifier;
};
type Room = {
  code: string;
  hostId: string;
  players: Player[];
  view: "lobby" | "hub" | "game" | "result";
  roundNumber: number;
  game?: GameRound;
};
type GameContent = Record<string, unknown>;
type GameMeta = {
  id: string;
  title: string;
  icon: string;
  description: string;
  category: "solo" | "coop";
};

declare global {
  interface Window { GAME_CONTENT?: GameContent }
}

const AVATARS = ["😎", "🥳", "🤠", "👻", "🐥", "🐰", "🐻", "🦊"];
const SOLO_GAMES: GameMeta[] = [
  { id: "liar", title: "오리지널 라이어", icon: "🕵️", description: "한 명만 제시어를 몰라요", category: "solo" },
  { id: "dumb-liar", title: "바보 라이어", icon: "🤡", description: "한 명만 살짝 다른 단어를 받아요", category: "solo" },
  { id: "body-liar", title: "몸으로 라이어", icon: "🕺", description: "말 없이 몸으로 표현해요", category: "solo" },
  { id: "face-liar", title: "얼굴로 라이어", icon: "😶", description: "표정만으로 제시어를 표현해요", category: "solo" },
  { id: "initial", title: "초성 퀴즈", icon: "ㄱ", description: "초성을 보고 정답을 맞혀요", category: "solo" },
  { id: "hunmin", title: "무한 훈민정음", icon: "ㅎ", description: "초성 단어를 막힐 때까지 말해요", category: "solo" },
  { id: "taste", title: "취향 일치", icon: "🤝", description: "하나 둘 셋에 동시에 골라요", category: "solo" },
  { id: "trivia", title: "중급 상식 퀴즈", icon: "💡", description: "알 듯 말 듯한 상식 문제", category: "solo" },
  { id: "memory", title: "가짜 추억 찾기", icon: "🎭", description: "섞인 추억 중 가짜를 찾아요", category: "solo" },
  { id: "ten-seconds", title: "정확히 10초", icon: "⏱️", description: "화면을 보지 않고 10초를 맞혀요", category: "solo" },
  { id: "color", title: "색깔 찾기", icon: "🎨", description: "주변에서 같은 색을 찾아 찍어요", category: "solo" },
  { id: "object-initial", title: "초성 물건 찾기", icon: "📸", description: "해당 초성 물건을 가장 빨리 찍어요", category: "solo" },
  { id: "zoom", title: "확대 사진 퀴즈", icon: "🔎", description: "확대된 사진의 정체를 맞혀요", category: "solo" },
  { id: "unknown", title: "범인은 질문을 모른다", icon: "❓", description: "한 명만 질문을 모른 채 대답해요", category: "solo" },
];
const COOP_GAMES: GameMeta[] = [
  { id: "telestration", title: "텔레그레이션", icon: "✏️", description: "그림만 보고 다음 사람이 이어 그려요", category: "coop" },
  { id: "people", title: "인물 퀴즈", icon: "👤", description: "사진 속 인물을 함께 맞혀요", category: "coop" },
  { id: "chain", title: "줄줄이 말해요", icon: "🔗", description: "조건에 맞는 말을 차례대로 말해요", category: "coop" },
  { id: "four", title: "네 글자 이어말하기", icon: "4️⃣", description: "앞 두 글자를 보고 뒤를 완성해요", category: "coop" },
  { id: "syllable", title: "이어말하기", icon: "🗣️", description: "한 글자씩 이어 정답을 만들어요", category: "coop" },
  { id: "character", title: "캐릭터 퀴즈", icon: "🧸", description: "사진 속 캐릭터를 함께 맞혀요", category: "coop" },
  { id: "group-initial", title: "단체 초성 퀴즈", icon: "👥", description: "각자 다른 초성 단어를 말해요", category: "coop" },
];
const ALL_GAMES = [...SOLO_GAMES, ...COOP_GAMES];

const pick = <T,>(items: T[]): T => items[Math.floor(Math.random() * items.length)];

function getOrCreatePlayerId() {
  if (typeof window === "undefined") return "";
  const storedId = localStorage.getItem("hanpan-player-id") || crypto.randomUUID();
  localStorage.setItem("hanpan-player-id", storedId);
  return storedId;
}

function getStoredValue(key: string, fallback = "") {
  return typeof window === "undefined" ? fallback : localStorage.getItem(key) || fallback;
}

function getRoomCodeFromUrl() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(location.search).get("room")?.replace(/\D/g, "").slice(0, 4) || "";
}

function getList<T>(data: GameContent, key: string, fallback: T[]): T[] {
  return Array.isArray(data[key]) ? data[key] as T[] : fallback;
}

function makeModifier(data: GameContent, players: Player[]): Modifier | undefined {
  if (players.length < 2 || Math.random() > 0.42) return undefined;
  const type = pick(["동물의 왕국", "비밀미션", "모션게임", "금지어", "웃음 참기", "용용체", "이응 게임"]);
  if (type === "비밀미션") {
    return { title: "나만의 비밀미션", text: pick(getList(data, "secretMissions", ["누군가에게 칭찬받기"])), targetId: pick(players).id };
  }
  if (type === "모션게임") {
    const leader = pick(players);
    return { title: "모션게임 시작!", text: `${leader.name}의 ${pick(getList(data, "motions", ["손가락하트"]))} 동작을 몰래 따라 하세요.` };
  }
  if (type === "금지어") return { title: "금지어 추가", text: `지금부터 “${pick(getList(data, "forbiddenWords", ["진짜"]))}” 금지!` };
  if (type === "동물의 왕국") return { title: type, text: "말하기 전에 자기만의 동물 울음소리를 내세요." };
  if (type === "웃음 참기") return { title: type, text: "지금부터 웃는 사람이 바로 걸립니다." };
  if (type === "용용체") return { title: type, text: "모든 문장을 ~용으로 끝내세용." };
  return { title: type, text: "모든 말의 받침을 ㅇ으로 바꿔 말하세요." };
}

function makeRound(meta: GameMeta, data: GameContent, players: Player[]): GameRound {
  const base: GameRound = { id: meta.id, title: meta.title, prompt: "준비!", startedAt: Date.now() };
  const selectedPlayer = players.length ? pick(players) : undefined;
  const liar = players.length > 1 ? selectedPlayer : undefined;
  if (["liar", "body-liar", "face-liar"].includes(meta.id)) {
    const source = meta.id === "liar"
      ? (() => { const groups = data.liarOriginal as Record<string, string[]> | undefined; const category = groups ? pick(Object.keys(groups)) : "음식"; return { word: pick(groups?.[category] ?? ["떡볶이"]), category }; })()
      : { word: pick(getList<string>(data, meta.id === "body-liar" ? "bodyLiar" : "faceLiar", ["웃음 참기"])), category: meta.id === "body-liar" ? "동작" : "표정" };
    return { ...base, prompt: source.word, answer: source.word, category: source.category, liarId: liar?.id, modifier: makeModifier(data, players) };
  }
  if (meta.id === "dumb-liar") {
    const pair = pick(getList<string[]>(data, "dumbLiar", [["강아지", "고양이"]]));
    return { ...base, prompt: pair[0], answer: `${pair[0]} / ${pair[1]}`, liarWord: pair[1], liarId: liar?.id, modifier: makeModifier(data, players) };
  }
  if (meta.id === "initial") {
    const groups = data.initialQuiz as Record<string, Array<{ initial: string; answer: string }>> | undefined;
    const category = groups ? pick(Object.keys(groups)) : "음식";
    const item = pick(groups?.[category] ?? [{ initial: "ㄸㅂㅇ", answer: "떡볶이" }]);
    return { ...base, prompt: item.initial, answer: item.answer, category, modifier: makeModifier(data, players) };
  }
  if (meta.id === "hunmin") return { ...base, prompt: pick(getList(data, "infiniteInitials", ["ㄱㅂ"])), modifier: makeModifier(data, players) };
  if (meta.id === "taste") {
    const options = pick(getList<string[]>(data, "tasteMatch", [["짜장면", "짬뽕"]]));
    return { ...base, prompt: `${options[0]}  vs  ${options[1]}`, modifier: makeModifier(data, players) };
  }
  if (meta.id === "trivia") {
    const item = pick(getList<{ question: string; answer: string }>(data, "triviaMedium", [{ question: "호주의 수도는?", answer: "캔버라" }]));
    return { ...base, prompt: item.question, answer: item.answer, modifier: makeModifier(data, players) };
  }
  if (meta.id === "memory") {
    return { ...base, prompt: "진짜 세 개, 가짜 하나", storytellerId: selectedPlayer?.id, memoryWord: pick(getList(data, "fakeMemoryWords", ["수학여행"])), memoryReady: false, modifier: makeModifier(data, players) };
  }
  if (meta.id === "ten-seconds") return { ...base, prompt: "감으로 정확히 10초를 맞혀보세요", answer: "10.00초", modifier: makeModifier(data, players) };
  if (meta.id === "color") return { ...base, prompt: pick(getList(data, "colors", ["파랑"])), modifier: makeModifier(data, players) };
  if (meta.id === "object-initial") return { ...base, prompt: pick(getList(data, "objectInitials", ["ㄱ"])), modifier: makeModifier(data, players) };
  if (meta.id === "unknown") {
    const question = pick(getList(data, "unknownQuestion", ["무인도에 가져갈 물건은?"]));
    return { ...base, prompt: question, answer: question, liarId: liar?.id, modifier: makeModifier(data, players) };
  }
  if (meta.id === "telestration") return { ...base, prompt: pick(getList(data, "telestrationWords", ["도깨비"])), modifier: makeModifier(data, players) };
  if (meta.id === "chain") return { ...base, prompt: pick(getList(data, "chainPrompts", ["탕으로 끝나는 음식"])), modifier: makeModifier(data, players) };
  if (meta.id === "four") {
    const item = pick(getList<{ front: string; back: string; word: string }>(data, "fourSyllable", [{ front: "계좌", back: "번호", word: "계좌번호" }]));
    return { ...base, prompt: `${item.front} ○○`, answer: item.word, modifier: makeModifier(data, players) };
  }
  if (meta.id === "syllable") return { ...base, prompt: pick(getList(data, "이어말하기", ["아이돌"])), modifier: makeModifier(data, players) };
  if (meta.id === "group-initial") return { ...base, prompt: pick(getList(data, "groupInitials", ["ㄷㅂ"])), modifier: makeModifier(data, players) };
  const imageKey = meta.id === "people" ? "peopleQuiz" : meta.id === "character" ? "characters" : "zoomObjects";
  const imageQuery = pick(getList(data, imageKey, [meta.id === "people" ? "유재석" : meta.id === "character" ? "짱구" : "키보드"]));
  return { ...base, prompt: meta.id === "zoom" ? "이 물건은 무엇일까요?" : "사진 속 주인공은 누구일까요?", answer: imageQuery, imageQuery, modifier: makeModifier(data, players) };
}

function QuizImage({ name, zoom }: { name: string; zoom?: boolean }) {
  const [src, setSrc] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch(`https://ko.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name)}`);
        const json = await response.json() as { thumbnail?: { source?: string } };
        if (json.thumbnail?.source && active) setSrc(json.thumbnail.source);
        else throw new Error("no thumbnail");
      } catch {
        try {
          const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(name)}&gsrnamespace=6&gsrlimit=1&prop=imageinfo&iiprop=url&iiurlwidth=700&format=json&origin=*`;
          const response = await fetch(url);
          const json = await response.json() as { query?: { pages?: Record<string, { imageinfo?: Array<{ thumburl?: string; url?: string }> }> } };
          const page = json.query?.pages ? Object.values(json.query.pages)[0] : undefined;
          const image = page?.imageinfo?.[0];
          if (active && (image?.thumburl || image?.url)) setSrc(image.thumburl || image.url || "");
          else if (active) setFailed(true);
        } catch { if (active) setFailed(true); }
      }
    };
    void load();
    return () => { active = false; };
  }, [name]);
  return (
    <div className={`quiz-image ${zoom ? "is-zoomed" : ""}`}>
      {src && !failed ? <img src={src} alt="퀴즈 이미지" onError={() => setFailed(true)} /> : failed ? <div className="image-fallback">이미지를 불러오지 못했어요<br /><small>다른 게임을 선택해 주세요</small></div> : <div className="image-loader" aria-label="이미지 불러오는 중" />}
    </div>
  );
}

export default function Home() {
  const [room, setRoom] = useState<Room | null>(null);
  const [playerId] = useState(getOrCreatePlayerId);
  const [name, setName] = useState(() => getStoredValue("hanpan-name"));
  const [avatar, setAvatar] = useState(() => getStoredValue("hanpan-avatar", AVATARS[0]));
  const [joinCode, setJoinCode] = useState(getRoomCodeFromUrl);
  const [intent, setIntent] = useState<"create" | "join" | null>(null);
  const [tab, setTab] = useState<"solo" | "coop">("solo");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [roleVisible, setRoleVisible] = useState(false);
  const [qr, setQr] = useState("");
  const [modifierVisible, setModifierVisible] = useState(false);
  const [memoryInputs, setMemoryInputs] = useState(["", "", "", ""]);
  const [timerStart, setTimerStart] = useState<number | null>(null);
  const [timerResult, setTimerResult] = useState<number | null>(null);
  const leavingRef = useRef(false);
  const data = typeof window !== "undefined" ? window.GAME_CONTENT ?? {} : {};

  const me = room?.players.find((player) => player.id === playerId);
  const isHost = Boolean(room && room.hostId === playerId);
  const currentGame = room?.game;
  const roomCode = room?.code;
  const roundNumber = room?.roundNumber;
  const gameStartedAt = currentGame?.startedAt;
  const modifierKey = currentGame?.modifier ? JSON.stringify(currentGame.modifier) : "";

  useEffect(() => {
    const code = getRoomCodeFromUrl();
    const lastRoom = localStorage.getItem("hanpan-room");
    const targetRoom = code || lastRoom;
    if (targetRoom) {
      fetch(`/api/rooms/${targetRoom}`, { cache: "no-store" }).then(async (response) => {
        if (!response.ok) throw new Error();
        const body = await response.json() as { room: Room };
        if (body.room.players.some((player) => player.id === playerId)) setRoom(body.room);
        else if (code) setIntent("join");
        else localStorage.removeItem("hanpan-room");
      }).catch(() => {
        localStorage.removeItem("hanpan-room");
        if (code) setIntent("join");
      });
    }
  }, [playerId]);

  useEffect(() => {
    if (!roomCode) return;
    const poll = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/rooms/${roomCode}`, { cache: "no-store" });
        if (!response.ok) return;
        const body = await response.json() as { room: Room };
        if (!leavingRef.current) setRoom(body.room);
      } catch { /* 다음 주기에 다시 연결 */ }
    }, 1400);
    return () => window.clearInterval(poll);
  }, [roomCode]);

  useEffect(() => {
    const resetId = window.setTimeout(() => {
      setRoleVisible(false);
      setModifierVisible(false);
      setMemoryInputs(["", "", "", ""]);
      setTimerStart(null);
      setTimerResult(null);
    }, 0);
    const modifierId = modifierKey && gameStartedAt
      ? window.setTimeout(() => setModifierVisible(true), Math.max(1200, gameStartedAt + 15000 - Date.now()))
      : undefined;
    return () => {
      window.clearTimeout(resetId);
      if (modifierId !== undefined) window.clearTimeout(modifierId);
    };
  }, [roundNumber, gameStartedAt, modifierKey]);

  useEffect(() => {
    if (!roomCode) return;
    const url = `${location.origin}${location.pathname}?room=${roomCode}`;
    QRCode.toDataURL(url, { width: 240, margin: 1, color: { dark: "#0d0f12", light: "#ffffff" } }).then(setQr).catch(() => setQr(""));
  }, [roomCode]);

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2600);
  }, []);

  const saveProfile = () => {
    localStorage.setItem("hanpan-name", name.trim());
    localStorage.setItem("hanpan-avatar", avatar);
  };

  const enterRoom = async () => {
    if (!playerId || name.trim().length < 1) return showNotice("이름을 입력해 주세요.");
    if (intent === "join" && joinCode.length !== 4) return showNotice("4자리 방 코드를 입력해 주세요.");
    setBusy(true);
    try {
      const player = { id: playerId, name: name.trim(), avatar };
      const response = intent === "create"
        ? await fetch("/api/rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ player }) })
        : await fetch(`/api/rooms/${joinCode}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "join", player }) });
      const body = await response.json() as { room?: Room; error?: string };
      if (!response.ok || !body.room) throw new Error(body.error || "방에 들어가지 못했어요.");
      saveProfile();
      leavingRef.current = false;
      localStorage.setItem("hanpan-room", body.room.code);
      history.replaceState(null, "", `?room=${body.room.code}`);
      setRoom(body.room);
      setIntent(null);
    } catch (error) { showNotice(error instanceof Error ? error.message : "다시 시도해 주세요."); }
    finally { setBusy(false); }
  };

  const updateRoom = async (next: Room) => {
    if (!room || !isHost) return showNotice("방장만 진행할 수 있어요.");
    setRoom(next);
    try {
      const response = await fetch(`/api/rooms/${room.code}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "set-state", playerId, state: next }) });
      const body = await response.json() as { room?: Room; error?: string };
      if (!response.ok || !body.room) throw new Error(body.error || "진행 상태를 저장하지 못했어요.");
      setRoom(body.room);
    } catch (error) { showNotice(error instanceof Error ? error.message : "다시 시도해 주세요."); }
  };

  const startGame = (meta: GameMeta) => {
    if (!room) return;
    const next: Room = { ...room, view: "game", roundNumber: room.roundNumber + 1, game: makeRound(meta, data, room.players) };
    void updateRoom(next);
  };

  const leaveRoom = async () => {
    leavingRef.current = true;
    if (room) void fetch(`/api/rooms/${room.code}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "leave", playerId }) });
    localStorage.removeItem("hanpan-room");
    history.replaceState(null, "", location.pathname);
    setRoom(null);
    setIntent(null);
  };

  const shareRoom = async () => {
    if (!room) return;
    const url = `${location.origin}${location.pathname}?room=${room.code}`;
    try {
      if (navigator.share) await navigator.share({ title: "한판 술게임", text: `방 코드 ${room.code}`, url });
      else { await navigator.clipboard.writeText(url); showNotice("참가 링크를 복사했어요."); }
    } catch { /* 공유 취소 */ }
  };

  const submitMemory = async () => {
    if (!room || memoryInputs.some((value) => !value.trim())) return showNotice("네 문장을 모두 적어 주세요.");
    setBusy(true);
    try {
      const response = await fetch(`/api/rooms/${room.code}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "submit-memory", playerId, entries: memoryInputs }) });
      const body = await response.json() as { room?: Room; error?: string };
      if (!response.ok || !body.room) throw new Error(body.error || "제출하지 못했어요.");
      setRoom(body.room);
    } catch (error) { showNotice(error instanceof Error ? error.message : "다시 시도해 주세요."); }
    finally { setBusy(false); }
  };

  const gameMeta = useMemo(() => ALL_GAMES.find((item) => item.id === currentGame?.id), [currentGame?.id]);
  const privateRole = useMemo(() => {
    if (!currentGame || !me) return null;
    if (["liar", "body-liar", "face-liar"].includes(currentGame.id)) return currentGame.liarId === me.id ? { danger: true, label: "당신은 라이어", value: "들키지 않게 연기하세요" } : { danger: false, label: currentGame.category || "제시어", value: currentGame.prompt };
    if (currentGame.id === "dumb-liar") return { danger: false, label: "내 제시어", value: currentGame.liarId === me.id ? currentGame.liarWord || "?" : currentGame.prompt };
    if (currentGame.id === "unknown") return currentGame.liarId === me.id ? { danger: true, label: "당신은 범인", value: "질문을 모른 채 자연스럽게 대답하세요" } : { danger: false, label: "비밀 질문", value: currentGame.prompt };
    return null;
  }, [currentGame, me]);

  if (!room) {
    return (
      <main className="app-shell entry-shell">
        <header className="brand"><span className="brand-dot" />한판</header>
        {!intent ? (
          <section className="hero">
            <div className="eyebrow">점수 없이 바로 노는 술게임</div>
            <h1>모이면,<br /><em>한판이면 돼.</em></h1>
            <p>휴대폰 하나씩 들고 방에 들어오세요.<br />판정은 우리끼리, 결과는 바로.</p>
            <button className="button primary xl" onClick={() => setIntent("create")}>새 방 만들기</button>
            <div className="join-inline">
              <input aria-label="4자리 방 코드" inputMode="numeric" maxLength={4} placeholder="4자리 코드" value={joinCode} onChange={(event) => setJoinCode(event.target.value.replace(/\D/g, "").slice(0, 4))} />
              <button className="button secondary" onClick={() => { if (joinCode.length === 4) setIntent("join"); else showNotice("4자리 코드를 입력해 주세요."); }}>참가</button>
            </div>
            <div className="micro-copy"><span>마이크 판정 없음</span><span>점수표 없음</span><span>팀전 없음</span></div>
          </section>
        ) : (
          <section className="panel profile-panel">
            <button className="back-button" onClick={() => setIntent(null)} aria-label="뒤로">←</button>
            <div className="eyebrow">{intent === "create" ? "새 방 만들기" : `방 ${joinCode} 참가`}</div>
            <h1 className="panel-title">누구로 들어갈까요?</h1>
            <label className="field-label" htmlFor="name">이름</label>
            <input id="name" className="text-field" maxLength={10} autoFocus placeholder="최대 10자" value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void enterRoom(); }} />
            <div className="field-label">프로필</div>
            <div className="avatar-grid">{AVATARS.map((item) => <button key={item} aria-label={`${item} 프로필`} className={`avatar-choice ${avatar === item ? "selected" : ""}`} onClick={() => setAvatar(item)}>{item}</button>)}</div>
            <button className="button primary xl" disabled={busy} onClick={() => void enterRoom()}>{busy ? "들어가는 중…" : intent === "create" ? "방 만들기" : "참가하기"}</button>
          </section>
        )}
        {notice && <div className="toast" role="status">{notice}</div>}
      </main>
    );
  }

  if (room.view === "lobby") {
    return (
      <main className="app-shell">
        <TopBar title="대기실" onLeave={() => void leaveRoom()} />
        <section className="room-code-card">
          <div><span>방 코드</span><strong>{room.code}</strong></div>
          <button className="share-button" onClick={() => void shareRoom()}>공유</button>
        </section>
        <section className="qr-card">{qr ? <img src={qr} alt={`방 ${room.code} 참가 QR 코드`} /> : <div className="image-loader" />}<p>QR을 찍거나 코드로 참가하세요</p></section>
        <section className="players-section">
          <div className="section-heading"><h2>참가자</h2><span>{room.players.length}명</span></div>
          <div className="player-list">{room.players.map((player) => <div className="player-row" key={player.id}><span className="player-avatar">{player.avatar}</span><span>{player.name}</span>{player.id === room.hostId && <span className="host-badge">방장</span>}{player.id === playerId && <span className="me-label">나</span>}</div>)}</div>
        </section>
        <div className="sticky-action">{isHost ? <button className="button primary xl" onClick={() => void updateRoom({ ...room, view: "hub" })}>{room.players.length === 1 ? "혼자 시작하기" : "게임 고르기"}</button> : <div className="waiting"><span className="pulse" />방장이 시작하기를 기다리는 중</div>}</div>
        {notice && <div className="toast" role="status">{notice}</div>}
      </main>
    );
  }

  if (room.view === "hub") {
    const games = tab === "solo" ? SOLO_GAMES : COOP_GAMES;
    return (
      <main className="app-shell">
        <TopBar title="게임 고르기" onLeave={() => void leaveRoom()} />
        <button className="random-card" onClick={() => isHost ? startGame(pick(ALL_GAMES)) : showNotice("방장이 게임을 고르고 있어요.")}><span className="random-icon">✦</span><span><strong>랜덤 게임</strong><small>21개 게임 중 하나를 바로 시작해요</small></span><span>→</span></button>
        <div className="segmented" role="tablist"><button role="tab" aria-selected={tab === "solo"} className={tab === "solo" ? "active" : ""} onClick={() => setTab("solo")}>개인전 <span>{SOLO_GAMES.length}</span></button><button role="tab" aria-selected={tab === "coop"} className={tab === "coop" ? "active" : ""} onClick={() => setTab("coop")}>모두 협동 <span>{COOP_GAMES.length}</span></button></div>
        <div className="game-list">{games.map((game) => <button className="game-row" key={game.id} onClick={() => isHost ? startGame(game) : showNotice("방장이 게임을 고르고 있어요.")}><span className="game-icon">{game.icon}</span><span><strong>{game.title}</strong><small>{game.description}</small></span><span className="chevron">›</span></button>)}</div>
        {!isHost && <div className="floating-wait">방장이 게임을 고르는 중</div>}
        {notice && <div className="toast" role="status">{notice}</div>}
      </main>
    );
  }

  if (room.view === "result" && currentGame) {
    const liarName = room.players.find((player) => player.id === currentGame.liarId)?.name;
    return (
      <main className="app-shell result-shell">
        <TopBar title="결과" onLeave={() => void leaveRoom()} />
        <section className="result-card"><div className="result-mark">✓</div><div className="eyebrow">이번 판 끝</div><h1>{currentGame.title}</h1>{currentGame.answer && <div className="answer-block"><span>정답</span><strong>{currentGame.answer}</strong></div>}{liarName && <div className="answer-block danger"><span>{currentGame.id === "unknown" ? "범인" : "라이어"}</span><strong>{liarName}</strong></div>}{currentGame.id === "memory" && <p>가짜 추억을 만든 사람은 <strong>{room.players.find((p) => p.id === currentGame.storytellerId)?.name}</strong>이었어요.</p>}<p className="manual-result">{room.players.length === 1 ? "혼자 연습한 이번 판도 바로 완료!" : "누가 걸렸는지는 우리끼리 판정!"}</p></section>
        <div className="result-actions">{isHost ? <><button className="button primary xl" onClick={() => gameMeta && startGame(gameMeta)}>같은 게임 다시하기</button><button className="button secondary xl" onClick={() => void updateRoom({ ...room, view: "hub", game: undefined })}>다른 게임 하러가기</button></> : <div className="waiting"><span className="pulse" />방장의 선택을 기다리는 중</div>}</div>
        {notice && <div className="toast" role="status">{notice}</div>}
      </main>
    );
  }

  if (currentGame) {
    const isStoryteller = currentGame.storytellerId === playerId;
    const canFinish = currentGame.id !== "memory" || currentGame.memoryReady;
    const publicPrompt = privateRole
      ? currentGame.id === "body-liar" ? "차례대로 몸으로 표현하세요"
        : currentGame.id === "face-liar" ? "차례대로 표정만 보여주세요"
          : currentGame.id === "unknown" ? "차례대로 질문에 답하세요"
            : "내 단어를 자연스럽게 설명하세요"
      : currentGame.prompt;
    return (
      <main className="app-shell game-shell">
        <TopBar title={currentGame.title} onLeave={() => void leaveRoom()} />
        <div className="round-label">ROUND {room.roundNumber}</div>
        {privateRole && <button className={`role-card ${privateRole.danger ? "danger" : ""} ${roleVisible ? "revealed" : ""}`} onClick={() => setRoleVisible((value) => !value)}><span>{roleVisible ? privateRole.label : "내 역할 확인"}</span><strong>{roleVisible ? privateRole.value : "휴대폰을 가리고 눌러주세요"}</strong><small>{roleVisible ? "다시 눌러 숨기기" : "나만 확인하기"}</small></button>}

        {currentGame.id === "memory" ? (
          <section className="prompt-card">
            {!currentGame.memoryReady ? isStoryteller ? <><div className="eyebrow">제시 단어 · {currentGame.memoryWord}</div><h2>진짜 3개와 가짜 1개를 적어주세요</h2><div className="memory-fields">{memoryInputs.map((value, index) => <input key={index} maxLength={80} placeholder={`${index + 1}번째 추억`} value={value} onChange={(event) => setMemoryInputs((items) => items.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} />)}</div><button className="button primary" disabled={busy} onClick={() => void submitMemory()}>섞어서 공개하기</button></> : <div className="waiting-card"><span className="big-emoji">✍️</span><h2>추억을 작성하고 있어요</h2><p>완료되면 섞인 문장이 모두에게 보여요.</p></div> : <><div className="eyebrow">가짜 추억은 몇 번?</div><ol className="memory-list">{currentGame.memoryEntries?.map((entry, index) => <li key={`${entry}-${index}`}><span>{index + 1}</span>{entry}</li>)}</ol></>}
          </section>
        ) : currentGame.id === "ten-seconds" ? (
          <section className="prompt-card timer-card"><div className="eyebrow">화면을 보지 마세요</div><h2>{timerResult === null ? currentGame.prompt : `${timerResult.toFixed(2)}초`}</h2><p>{timerResult === null ? "시작을 누른 뒤 감으로 10초에 멈추세요." : `10초와 ${(Math.abs(10 - timerResult)).toFixed(2)}초 차이`}</p><button className="timer-button" onClick={() => { if (timerStart === null) { setTimerStart(Date.now()); setTimerResult(null); } else { setTimerResult((Date.now() - timerStart) / 1000); setTimerStart(null); } }}>{timerStart === null ? timerResult === null ? "시작" : "다시" : "멈춤"}</button></section>
        ) : (
          <section className="prompt-card">
            {currentGame.imageQuery && <QuizImage key={currentGame.imageQuery} name={currentGame.imageQuery} zoom={currentGame.id === "zoom"} />}
            <div className="eyebrow">{privateRole ? "역할을 확인했다면" : currentGame.category || (gameMeta?.category === "coop" ? "다 같이 도전" : "이번 제시어")}</div>
            <h2 className={!privateRole && publicPrompt.length <= 8 ? "prompt-big" : ""}>{publicPrompt}</h2>
            {currentGame.id === "hunmin" && <p>비밀 술래와 순번 없이 막히는 사람이 나올 때까지!</p>}
            {currentGame.id === "taste" && <p>하나, 둘, 셋에 동시에 하나를 외치세요.</p>}
            {currentGame.id === "chain" && <p>시계 방향으로 한 명씩, 겹치지 않게 말하세요.</p>}
            {currentGame.id === "syllable" && <p>{room.players.length}명이 한 글자씩 이어 정답 하나를 만드세요.</p>}
            {currentGame.id === "group-initial" && <p>{room.players.length}명 모두 서로 다른 단어를 말하세요.</p>}
            {["color", "object-initial"].includes(currentGame.id) && <p>가장 빨리 사진을 찍어 온 사람이 성공!</p>}
          </section>
        )}

        {currentGame.answer && !privateRole && !["ten-seconds"].includes(currentGame.id) && <details className="answer-reveal"><summary>정답 확인</summary><strong>{currentGame.answer}</strong></details>}
        {modifierVisible && currentGame.modifier && (!currentGame.modifier.targetId || currentGame.modifier.targetId === playerId) && <aside className="modifier-banner"><button aria-label="닫기" onClick={() => setModifierVisible(false)}>×</button><span>깜짝 룰</span><strong>{currentGame.modifier.title}</strong><p>{currentGame.modifier.text}</p></aside>}
        <div className="sticky-action">{isHost ? <button className="button primary xl" disabled={!canFinish} onClick={() => void updateRoom({ ...room, view: "result" })}>{canFinish ? "결과 보기" : "추억 작성 대기 중"}</button> : <div className="waiting"><span className="pulse" />우리끼리 판정하고 있어요</div>}</div>
        {notice && <div className="toast" role="status">{notice}</div>}
      </main>
    );
  }

  return <main className="app-shell"><div className="waiting-card"><span className="image-loader" />게임 정보를 불러오는 중</div></main>;
}

function TopBar({ title, onLeave }: { title: string; onLeave: () => void }) {
  return <header className="topbar"><div className="mini-brand"><span className="brand-dot" />한판</div><strong>{title}</strong><button onClick={onLeave}>나가기</button></header>;
}
