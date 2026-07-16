import { GAME_CONTENT } from "./content-data.js";
import type { Player, RoomState } from "./rooms";

export type SurpriseState = {
  phase: "active" | "rest";
  ruleId?: string;
  title?: string;
  text?: string;
  startedAt: number;
  endsAt: number;
  assignments?: Record<string, string>;
  leaderId?: string;
  reveal?: string[];
  revealUntil?: number;
};

const ACTIVE_MS = 10 * 60 * 1000;
const REST_MS = 10 * 60 * 1000;
const CONTENT = GAME_CONTENT as Record<string, unknown>;
const pick = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)];
const shuffle = <T,>(items: T[]) => [...items].sort(() => Math.random() - 0.5);
const getList = (key: string, fallback: string[]) => Array.isArray(CONTENT[key]) ? CONTENT[key] as string[] : fallback;

const animals = ["강아지 멍멍", "고양이 야옹", "오리 꽥꽥", "소 음메", "돼지 꿀꿀", "닭 꼬끼오", "개구리 개굴", "사자 어흥", "염소 메에", "비둘기 구구", "말 히이잉", "까마귀 까악"];

function assignments(players: Player[], values: string[]) {
  const shuffled = shuffle(values);
  return Object.fromEntries(players.map((player, index) => [player.id, shuffled[index % shuffled.length]]));
}

function newRule(players: Player[], previousId?: string): SurpriseState {
  const ids = ["animal", "secret", "motion", "forbidden", "no-laugh", "yong", "ieung", "two-touch"].filter((id) => id !== previousId);
  const ruleId = pick(ids);
  const now = Date.now();
  const state: SurpriseState = { phase: "active", ruleId, startedAt: now, endsAt: now + ACTIVE_MS };
  if (ruleId === "animal") return { ...state, title: "동물의 왕국", text: "말하기 전에 나에게 배정된 울음소리를 내세요.", assignments: assignments(players, animals) };
  if (ruleId === "secret") {
    const missions = shuffle(getList("secretMissions", ["누군가에게 칭찬받기", "누군가와 하이파이브하기"]));
    return { ...state, title: "비밀미션", text: "모두 서로 다른 미션을 받았습니다. 들키지 말고 성공하세요.", assignments: assignments(players, missions) };
  }
  if (ruleId === "motion") {
    const leader = pick(players);
    return { ...state, title: "모션게임", text: "술래의 행동을 눈치껏 따라 하세요.", leaderId: leader?.id };
  }
  if (ruleId === "forbidden") return { ...state, title: "금지어", text: `지금부터 “${pick(getList("forbiddenWords", ["진짜"]))}” 금지!` };
  if (ruleId === "no-laugh") return { ...state, title: "웃음 참기", text: "지금부터 웃는 사람이 바로 걸립니다." };
  if (ruleId === "yong") return { ...state, title: "용용체", text: "모든 문장을 ~용으로 끝내세용." };
  if (ruleId === "ieung") return { ...state, title: "이응 게임", text: "모든 말의 받침을 ㅇ으로 바꿔 말하세요." };
  return { ...state, title: "TWO TOUCH", text: "모든 물건을 두 번 내려놓으세요." };
}

export function tickSurprise(room: RoomState) {
  const now = Date.now();
  if (!room.surprise) {
    if (room.view !== "game") return false;
    room.surprise = newRule(room.players);
    return true;
  }
  if (room.surprise.phase === "active" && now >= room.surprise.endsAt) {
    const old = room.surprise;
    const reveal = old.assignments
      ? room.players.map((player) => `${player.name}: ${old.assignments?.[player.id] ?? "미션 없음"}`)
      : undefined;
    room.surprise = { phase: "rest", startedAt: now, endsAt: now + REST_MS, ruleId: old.ruleId, reveal, revealUntil: reveal ? now + 30_000 : undefined };
    return true;
  }
  if (room.surprise.phase === "rest" && now >= room.surprise.endsAt) {
    room.surprise = newRule(room.players, room.surprise.ruleId);
    return true;
  }
  return false;
}

export function clientSurprise(state: SurpriseState | undefined, players: Player[], viewerId?: string) {
  if (!state) return undefined;
  if (state.phase === "rest") {
    return {
      phase: state.phase,
      title: state.reveal && state.revealUntil && Date.now() < state.revealUntil ? "미션 공개" : "깜짝 룰 휴식",
      text: state.reveal && state.revealUntil && Date.now() < state.revealUntil ? state.reveal.join("\n") : "다음 깜짝 룰까지 쉬는 시간이에요.",
      startedAt: state.startedAt,
      endsAt: state.endsAt,
      reveal: Boolean(state.reveal && state.revealUntil && Date.now() < state.revealUntil),
    };
  }
  let text = state.text ?? "깜짝 룰이 시작됐어요.";
  if (state.ruleId === "animal" && viewerId) text = `나의 울음소리: ${state.assignments?.[viewerId] ?? "자유 동물"}\n말하기 전에 꼭 울음소리를 내세요.`;
  if (state.ruleId === "secret" && viewerId) text = `나의 비밀미션: ${state.assignments?.[viewerId] ?? "자유 미션"}`;
  if (state.ruleId === "motion") text = viewerId === state.leaderId
    ? "1명만 술래! 다른 사람들이 따라 하게 행동하세요."
    : "눈치 보고 술래의 행동을 따라하세요!";
  return { phase: state.phase, title: state.title, text, startedAt: state.startedAt, endsAt: state.endsAt, ruleId: state.ruleId, leaderName: players.find((player) => player.id === state.leaderId)?.name };
}
