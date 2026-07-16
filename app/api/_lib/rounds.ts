import { GAME_CONTENT } from "./content-data.js";
import { VERIFIED_IMAGES, type VerifiedImage } from "./images";
import type { Player } from "./rooms";

export type Point = { x: number; y: number };
export type Stroke = { eraser?: boolean; points: Point[] };
export type HistoryItem = { prompt: string; answer?: string; imageId?: string; imageSource?: string };
export type TelestrationStep = { playerId: string; strokes?: Stroke[]; guess?: string };
export type TelestrationChain = { id: string; prompt: string; steps: TelestrationStep[] };
export type GameRound = {
  id: string;
  title: string;
  prompt: string;
  answer?: string;
  category?: string;
  liarId?: string;
  liarWord?: string;
  liarMode?: "normal" | "dumb";
  storytellerId?: string;
  memoryWord?: string;
  memoryEntries?: string[];
  memoryReady?: boolean;
  fakeSlot?: number;
  fakeMemoryIndex?: number;
  fakeMemoryText?: string;
  imageId?: string;
  imageSource?: string;
  startedAt: number;
  playerOrder?: string[];
  currentPlayerIndex?: number;
  deadline?: number;
  correctVotes?: string[];
  answerRevealed?: boolean;
  history?: HistoryItem[];
  choices?: string[];
  selections?: Record<string, string>;
  timerResults?: Array<{ playerId: string; seconds: number; submittedAt: number }>;
  photoSubmissions?: Array<{ playerId: string; key: string; submittedAt: number }>;
  telestrationRound?: number;
  telestrationDeadline?: number;
  telestrationOrder?: string[];
  telestrationChains?: TelestrationChain[];
  telestrationSubmitted?: string[];
};

export const GAME_INFO: Record<string, { title: string; briefing: string; category: "solo" | "coop" }> = {
  liar: { title: "오리지널 라이어", briefing: "한 명의 라이어를 찾아보세요. 일반 모드에서는 라이어가 장르만, 바보 라이어 모드에서는 다른 제시어를 받습니다.", category: "solo" },
  "dumb-liar": { title: "바보 라이어", briefing: "한 명만 비슷하지만 다른 제시어를 받습니다. 자연스럽게 설명하고 바보 라이어를 찾아보세요.", category: "solo" },
  "body-liar": { title: "몸으로 라이어", briefing: "말하지 않고 몸으로만 표현합니다. 라이어 모드는 시작 전에 선택할 수 있어요.", category: "solo" },
  "face-liar": { title: "얼굴로 라이어", briefing: "말과 몸짓 없이 얼굴 표정만 사용합니다. 라이어 모드는 시작 전에 선택할 수 있어요.", category: "solo" },
  unknown: { title: "라이어-질문", briefing: "한 명만 질문을 모르거나 다른 질문을 받습니다. 차례대로 답하고 라이어를 찾아보세요.", category: "solo" },
  initial: { title: "초성 퀴즈", briefing: "랜덤으로 지목된 사람이 3초 안에 초성 정답을 말합니다. 두 명 이상이 정답 버튼을 누르면 다음 문제로 넘어갑니다.", category: "solo" },
  hunmin: { title: "무한 훈민정음", briefing: "제시된 초성으로 단어를 이어 말합니다. 마지막 술래의 오른쪽 사람부터 시작하세요.", category: "solo" },
  taste: { title: "취향 일치", briefing: "두 선택지 중 하나를 각자 휴대폰으로 고릅니다. 모두 선택하면 결과를 함께 확인하세요.", category: "solo" },
  trivia: { title: "중급 상식 퀴즈", briefing: "랜덤으로 지목된 사람이 3초 안에 답합니다. 방장이 정답을 공개하고 다음 문제를 진행합니다.", category: "solo" },
  memory: { title: "가짜 추억 찾기", briefing: "한 명이 진짜 추억 3개와 거짓 추억 1개를 작성합니다. 섞인 문장 중 가짜를 찾아보세요.", category: "solo" },
  "ten-seconds": { title: "정확히 10초", briefing: "각자 화면을 보지 않고 정확히 10초를 맞혀보세요. 한 번 제출한 기록은 모두에게 공개됩니다.", category: "solo" },
  color: { title: "색깔 찾기", briefing: "제시된 색깔의 물건을 찾아 카메라로 찍어 올리세요. 촬영 순서대로 사진이 표시됩니다.", category: "solo" },
  "object-initial": { title: "초성 물건 찾기", briefing: "제시된 초성으로 시작하는 물건을 찾아 카메라로 찍어 올리세요.", category: "solo" },
  telestration: { title: "텔레그레이션", briefing: "45초·40초·35초 동안 그림을 이어 그리고, 마지막 20초에는 그림을 보고 정답을 입력합니다.", category: "coop" },
  people: { title: "인물 퀴즈", briefing: "랜덤으로 지목된 사람이 3초 안에 사진 속 인물을 맞힙니다. 방장이 다음 문제를 진행합니다.", category: "coop" },
  chain: { title: "줄줄이 말해요", briefing: "제시된 조건에 맞는 단어를 차례대로, 겹치지 않게 말하세요.", category: "coop" },
  four: { title: "네 글자 이어말하기", briefing: "앞 두 글자를 보고 뒤 두 글자를 이어 네 글자 단어를 완성하세요.", category: "coop" },
  syllable: { title: "이어말하기", briefing: "제시된 주제에 맞는 단어를 정하고 한 사람씩 한 글자를 이어 말하세요.", category: "coop" },
  character: { title: "캐릭터 퀴즈", briefing: "사진 속 캐릭터의 이름을 다 같이 맞혀보세요.", category: "coop" },
  "group-initial": { title: "단체 초성 퀴즈", briefing: "랜덤으로 지목된 사람이 3초 안에 초성에 맞는 단어를 말합니다. 방장이 다음 문제를 진행합니다.", category: "coop" },
};

export const GAME_IDS = Object.keys(GAME_INFO);
const CONTENT = GAME_CONTENT as Record<string, unknown>;
export const pick = <T,>(items: T[]): T => items[Math.floor(Math.random() * items.length)];
export const shuffle = <T,>(items: T[]): T[] => [...items].sort(() => Math.random() - 0.5);
const getList = <T,>(key: string, fallback: T[]): T[] => Array.isArray(CONTENT[key]) ? CONTENT[key] as T[] : fallback;

function pickDifferent<T>(items: T[], first: T): T {
  return pick(items.filter((item) => item !== first).length ? items.filter((item) => item !== first) : items);
}

function timedBase(players: Player[]) {
  return { playerOrder: shuffle(players.map((player) => player.id)), currentPlayerIndex: 0, deadline: Date.now() + 3000, correctVotes: [] as string[] };
}

function initialQuestion(): HistoryItem & { category: string } {
  const groups = CONTENT.initialQuiz as Record<string, Array<{ initial: string; answer: string }>>;
  const category = pick(Object.keys(groups));
  const item = pick(groups[category]);
  return { prompt: item.initial, answer: item.answer, category };
}

function triviaQuestion(): HistoryItem {
  const item = pick(getList<{ question: string; answer: string }>("triviaMedium", [{ question: "호주의 수도는?", answer: "캔버라" }]));
  return { prompt: item.question, answer: item.answer };
}

function peopleQuestion(): HistoryItem {
  const item = pick(VERIFIED_IMAGES.people);
  return { prompt: "사진 속 주인공은 누구일까요?", answer: item.answer, imageId: item.id, imageSource: item.source };
}

function groupInitialQuestion(): HistoryItem {
  return { prompt: pick(getList("groupInitials", ["ㄷㅂ"])) };
}

function nextUnique(game: GameRound, factory: () => HistoryItem): HistoryItem {
  const used = new Set((game.history ?? []).map((item) => `${item.prompt}:${item.answer ?? ""}`));
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const item = factory();
    if (!used.has(`${item.prompt}:${item.answer ?? ""}`)) return item;
  }
  return factory();
}

export function advanceQuestion(game: GameRound, players: Player[]) {
  let item: HistoryItem;
  if (game.id === "initial") item = nextUnique(game, initialQuestion);
  else if (game.id === "trivia") item = nextUnique(game, triviaQuestion);
  else if (game.id === "people") item = nextUnique(game, peopleQuestion);
  else item = nextUnique(game, groupInitialQuestion);
  const order = (game.playerOrder?.length ? game.playerOrder : shuffle(players.map((player) => player.id))).filter((id) => players.some((player) => player.id === id));
  game.playerOrder = order;
  game.currentPlayerIndex = ((game.currentPlayerIndex ?? 0) + 1) % Math.max(1, order.length);
  game.prompt = item.prompt;
  game.answer = item.answer;
  game.imageId = item.imageId;
  game.imageSource = item.imageSource;
  game.deadline = Date.now() + 3000;
  game.correctVotes = [];
  game.answerRevealed = false;
  game.history = [...(game.history ?? []), item];
}

export function makeRound(id: string, players: Player[], liarMode: "normal" | "dumb" = "normal"): GameRound | null {
  const info = GAME_INFO[id];
  if (!info) return null;
  const base: GameRound = { id, title: info.title, prompt: "준비!", startedAt: Date.now() };
  const selectedPlayer = players.length ? pick(players) : undefined;
  const liar = players.length > 1 ? selectedPlayer : undefined;

  if (["liar", "body-liar", "face-liar"].includes(id)) {
    let category = "제시어";
    let word = "떡볶이";
    let alt = "라볶이";
    if (id === "liar") {
      const groups = CONTENT.liarOriginal as Record<string, string[]>;
      category = pick(Object.keys(groups));
      word = pick(groups[category]);
      alt = pickDifferent(groups[category], word);
    } else {
      const words = getList<string>(id === "body-liar" ? "bodyLiar" : "faceLiar", ["웃음 참기", "울음 참기"]);
      category = id === "body-liar" ? "동작" : "표정";
      word = pick(words);
      alt = pickDifferent(words, word);
    }
    return { ...base, prompt: word, answer: word, category, liarId: liar?.id, liarWord: liarMode === "dumb" ? alt : undefined, liarMode };
  }
  if (id === "dumb-liar") {
    const pair = pick(getList<string[]>("dumbLiar", [["강아지", "고양이"]]));
    return { ...base, prompt: pair[0], answer: pair[0], category: "제시어", liarWord: pair[1], liarId: liar?.id, liarMode: "dumb" };
  }
  if (id === "unknown") {
    const questions = getList<string>("unknownQuestion", ["무인도에 가져갈 물건은?", "가장 좋아하는 음식은?"]);
    const question = pick(questions);
    return { ...base, prompt: question, answer: question, category: "질문", liarWord: liarMode === "dumb" ? pickDifferent(questions, question) : undefined, liarId: liar?.id, liarMode };
  }
  if (id === "initial") {
    const item = initialQuestion();
    return { ...base, ...timedBase(players), prompt: item.prompt, answer: item.answer, category: item.category, history: [item] };
  }
  if (id === "hunmin") return { ...base, prompt: pick(getList("infiniteInitials", ["ㄱㅂ"])) };
  if (id === "taste") {
    const options = pick(getList<string[]>("tasteMatch", [["짜장면", "짬뽕"]]));
    return { ...base, prompt: "둘 중 하나를 선택하세요", choices: options, selections: {} };
  }
  if (id === "trivia") {
    const item = triviaQuestion();
    return { ...base, ...timedBase(players), prompt: item.prompt, answer: item.answer, history: [item], answerRevealed: false };
  }
  if (id === "memory") return { ...base, prompt: "진짜 세 개, 가짜 하나", storytellerId: selectedPlayer?.id, memoryWord: pick(getList("fakeMemoryWords", ["수학여행"])), memoryReady: false, fakeSlot: Math.floor(Math.random() * 4) };
  if (id === "ten-seconds") return { ...base, prompt: "진행중", timerResults: [] };
  if (id === "color") return { ...base, prompt: pick(getList("colors", ["파랑"])), photoSubmissions: [] };
  if (id === "object-initial") return { ...base, prompt: pick(getList("objectInitials", ["ㄱ"])), photoSubmissions: [] };
  if (id === "telestration") {
    const order = shuffle(players.map((player) => player.id));
    const words = shuffle(getList<string>("telestrationWords", ["도깨비", "등대", "우주선", "팝콘"]));
    const chains = order.map((playerId, index) => ({ id: crypto.randomUUID(), prompt: words[index % words.length], steps: [] as TelestrationStep[] }));
    return { ...base, prompt: "그림 릴레이", telestrationRound: 1, telestrationDeadline: Date.now() + 45_000, telestrationOrder: order, telestrationChains: chains, telestrationSubmitted: [] };
  }
  if (id === "chain") return { ...base, prompt: pick(getList("chainPrompts", ["탕으로 끝나는 음식"])) };
  if (id === "four") { const item = pick(getList<{ front: string; word: string }>("fourSyllable", [{ front: "계좌", word: "계좌번호" }])); return { ...base, prompt: `${item.front} ○○`, answer: item.word }; }
  if (id === "syllable") return { ...base, prompt: pick(getList("이어말하기", ["아이돌"])) };
  if (id === "group-initial") {
    const item = groupInitialQuestion();
    return { ...base, ...timedBase(players), prompt: item.prompt, history: [item] };
  }
  if (id === "people") {
    const item = peopleQuestion();
    return { ...base, ...timedBase(players), prompt: item.prompt, answer: item.answer, imageId: item.imageId, imageSource: item.imageSource, history: [item] };
  }
  const image = pick(VERIFIED_IMAGES.character as VerifiedImage[]);
  return { ...base, prompt: "사진 속 주인공은 누구일까요?", answer: image.answer, imageId: image.id, imageSource: image.source };
}

export function assignedTelestrationChain(game: GameRound, playerId: string) {
  const order = game.telestrationOrder ?? [];
  const chains = game.telestrationChains ?? [];
  const playerIndex = order.indexOf(playerId);
  const round = game.telestrationRound ?? 1;
  if (playerIndex < 0 || !chains.length) return null;
  const chainIndex = ((playerIndex - (round - 1)) % chains.length + chains.length) % chains.length;
  return chains[chainIndex] ?? null;
}

export function advanceTelestration(game: GameRound, players: Player[]) {
  const round = game.telestrationRound ?? 1;
  if (round >= 4) return false;
  game.telestrationRound = round + 1;
  game.telestrationSubmitted = [];
  const seconds = [0, 45, 40, 35, 20][round + 1];
  game.telestrationDeadline = Date.now() + seconds * 1000;
  game.telestrationOrder = (game.telestrationOrder ?? []).filter((id) => players.some((player) => player.id === id));
  return true;
}
