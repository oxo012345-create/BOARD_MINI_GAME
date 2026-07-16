// The content file is shared server-side so the selected answer never ships in the browser bundle.
import { GAME_CONTENT } from "./content-data.js";
import { VERIFIED_IMAGES } from "./images";
import type { Player } from "./rooms";

export type Modifier = { title: string; text: string; targetId?: string };
export type GameRound = {
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
  imageId?: string;
  imageSource?: string;
  startedAt: number;
  modifier?: Modifier;
};

const TITLES: Record<string, string> = {
  liar: "오리지널 라이어", "dumb-liar": "바보 라이어", "body-liar": "몸으로 라이어", "face-liar": "얼굴로 라이어",
  initial: "초성 퀴즈", hunmin: "무한 훈민정음", taste: "취향 일치", trivia: "중급 상식 퀴즈", memory: "가짜 추억 찾기",
  "ten-seconds": "정확히 10초", color: "색깔 찾기", "object-initial": "초성 물건 찾기", zoom: "확대 사진 퀴즈", unknown: "범인은 질문을 모른다",
  telestration: "텔레그레이션", people: "인물 퀴즈", chain: "줄줄이 말해요", four: "네 글자 이어말하기", syllable: "이어말하기",
  character: "캐릭터 퀴즈", "group-initial": "단체 초성 퀴즈"
};

export const GAME_IDS = Object.keys(TITLES);
const CONTENT = GAME_CONTENT as Record<string, unknown>;
const pick = <T,>(items: T[]): T => items[Math.floor(Math.random() * items.length)];
const getList = <T,>(key: string, fallback: T[]): T[] => Array.isArray(CONTENT[key]) ? CONTENT[key] as T[] : fallback;

function makeModifier(players: Player[]): Modifier | undefined {
  if (players.length < 2 || Math.random() > 0.42) return undefined;
  const type = pick(["동물의 왕국", "비밀미션", "모션게임", "금지어", "웃음 참기", "용용체", "이응 게임"]);
  if (type === "비밀미션") return { title: "나만의 비밀미션", text: pick(getList("secretMissions", ["누군가에게 칭찬받기"])), targetId: pick(players).id };
  if (type === "모션게임") {
    const leader = pick(players);
    return { title: "모션게임 시작!", text: `${leader.name}의 ${pick(getList("motions", ["손가락하트"]))} 동작을 몰래 따라 하세요.` };
  }
  if (type === "금지어") return { title: "금지어 추가", text: `지금부터 “${pick(getList("forbiddenWords", ["진짜"]))}” 금지!` };
  if (type === "동물의 왕국") return { title: type, text: "말하기 전에 자기만의 동물 울음소리를 내세요." };
  if (type === "웃음 참기") return { title: type, text: "지금부터 웃는 사람이 바로 걸립니다." };
  if (type === "용용체") return { title: type, text: "모든 문장을 ~용으로 끝내세용." };
  return { title: type, text: "모든 말의 받침을 ㅇ으로 바꿔 말하세요." };
}

export function makeRound(id: string, players: Player[]): GameRound | null {
  const title = TITLES[id];
  if (!title) return null;
  const base: GameRound = { id, title, prompt: "준비!", startedAt: Date.now() };
  const selectedPlayer = players.length ? pick(players) : undefined;
  const liar = players.length > 1 ? selectedPlayer : undefined;

  if (["liar", "body-liar", "face-liar"].includes(id)) {
    const source = id === "liar"
      ? (() => { const groups = CONTENT.liarOriginal as Record<string, string[]>; const category = pick(Object.keys(groups)); return { word: pick(groups[category]), category }; })()
      : { word: pick(getList(id === "body-liar" ? "bodyLiar" : "faceLiar", ["웃음 참기"])), category: id === "body-liar" ? "동작" : "표정" };
    return { ...base, prompt: source.word, answer: source.word, category: source.category, liarId: liar?.id, modifier: makeModifier(players) };
  }
  if (id === "dumb-liar") {
    const pair = pick(getList<string[]>("dumbLiar", [["강아지", "고양이"]]));
    return { ...base, prompt: pair[0], answer: `${pair[0]} / ${pair[1]}`, liarWord: pair[1], liarId: liar?.id, modifier: makeModifier(players) };
  }
  if (id === "initial") {
    const groups = CONTENT.initialQuiz as Record<string, Array<{ initial: string; answer: string }>>;
    const category = pick(Object.keys(groups)); const item = pick(groups[category]);
    return { ...base, prompt: item.initial, answer: item.answer, category, modifier: makeModifier(players) };
  }
  if (id === "hunmin") return { ...base, prompt: pick(getList("infiniteInitials", ["ㄱㅂ"])), modifier: makeModifier(players) };
  if (id === "taste") { const options = pick(getList<string[]>("tasteMatch", [["짜장면", "짬뽕"]])); return { ...base, prompt: `${options[0]}  vs  ${options[1]}`, modifier: makeModifier(players) }; }
  if (id === "trivia") { const item = pick(getList<{ question: string; answer: string }>("triviaMedium", [{ question: "호주의 수도는?", answer: "캔버라" }])); return { ...base, prompt: item.question, answer: item.answer, modifier: makeModifier(players) }; }
  if (id === "memory") return { ...base, prompt: "진짜 세 개, 가짜 하나", storytellerId: selectedPlayer?.id, memoryWord: pick(getList("fakeMemoryWords", ["수학여행"])), memoryReady: false, modifier: makeModifier(players) };
  if (id === "ten-seconds") return { ...base, prompt: "감으로 정확히 10초를 맞혀보세요", answer: "10.00초", modifier: makeModifier(players) };
  if (id === "color") return { ...base, prompt: pick(getList("colors", ["파랑"])), modifier: makeModifier(players) };
  if (id === "object-initial") return { ...base, prompt: pick(getList("objectInitials", ["ㄱ"])), modifier: makeModifier(players) };
  if (id === "unknown") { const question = pick(getList("unknownQuestion", ["무인도에 가져갈 물건은?"])); return { ...base, prompt: question, answer: question, liarId: liar?.id, modifier: makeModifier(players) }; }
  if (id === "telestration") return { ...base, prompt: pick(getList("telestrationWords", ["도깨비"])), modifier: makeModifier(players) };
  if (id === "chain") return { ...base, prompt: pick(getList("chainPrompts", ["탕으로 끝나는 음식"])), modifier: makeModifier(players) };
  if (id === "four") { const item = pick(getList<{ front: string; word: string }>("fourSyllable", [{ front: "계좌", word: "계좌번호" }])); return { ...base, prompt: `${item.front} ○○`, answer: item.word, modifier: makeModifier(players) }; }
  if (id === "syllable") return { ...base, prompt: pick(getList("이어말하기", ["아이돌"])), modifier: makeModifier(players) };
  if (id === "group-initial") return { ...base, prompt: pick(getList("groupInitials", ["ㄷㅂ"])), modifier: makeModifier(players) };

  const image = pick(VERIFIED_IMAGES[id as "people" | "character" | "zoom"]);
  return { ...base, prompt: id === "zoom" ? "이 물건은 무엇일까요?" : "사진 속 주인공은 누구일까요?", answer: image.answer, imageId: image.id, imageSource: image.source, modifier: makeModifier(players) };
}
