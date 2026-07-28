import { GAME_CONTENT } from "./content-data.js";
import { GEM_HEIST_DATA, type GemCard, type GemScene } from "./gem-heist-data";
import { VERIFIED_IMAGES, type VerifiedImage } from "./images";
import type { Player } from "./rooms";

export type Point = { x: number; y: number };
export type Stroke = { eraser?: boolean; points: Point[] };
export type HistoryItem = { prompt: string; answer?: string; imageId?: string; imageSource?: string; category?: string };
export type TelestrationStep = { playerId: string; strokes?: Stroke[]; guess?: string };
export type TelestrationChain = { id: string; prompt: string; steps: TelestrationStep[] };
export type GemRole = "thief" | "detective" | "accomplice" | "investigator";
export type GemDossier = {
  location: GemCard;
  trait: GemCard;
  alibi: GemCard;
  claimedAlibi: GemCard;
};
export type GemClue = { icon: string; title: string; text: string; strength: "보통" | "결정적" };
export type GemCase = {
  scene: GemScene;
  location: GemCard;
  stolenItem: GemCard;
  tool: GemCard;
  time: GemCard;
  report: string;
};
export type GameRound = {
  id: string;
  title: string;
  prompt: string;
  answer?: string;
  category?: string;
  liarId?: string;
  liarWord?: string;
  liarMode?: "normal" | "dumb";
  previousContentKey?: string;
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
  dealerId?: string;
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
  successfulPlayerIds?: string[];
  teamOutcome?: "passed" | "failed";
  failedPlayerId?: string;
  telestrationRound?: number;
  telestrationDeadline?: number;
  telestrationOrder?: string[];
  telestrationChains?: TelestrationChain[];
  telestrationSubmitted?: string[];
  telestrationComplete?: boolean;
  telestrationCorrectCount?: number;
  telestrationAutoCorrectChainIds?: string[];
  telestrationAcceptedChainIds?: string[];
  gemSpecialRoles?: boolean;
  gemPhase?: "dossier" | "investigation" | "vote";
  gemCase?: GemCase;
  gemRoles?: Record<string, GemRole>;
  gemDossiers?: Record<string, GemDossier>;
  gemClues?: Record<string, GemClue[]>;
  gemThiefId?: string;
  gemDetectiveId?: string;
  gemAccompliceId?: string;
  gemQuestions?: GemCard[];
  gemQuestionIndex?: number;
  gemVotes?: Record<string, string>;
  gemCaught?: boolean;
};

export const GAME_INFO: Record<string, { title: string; briefing: string; category: "solo" | "coop" }> = {
  liar: { title: "오리지널 라이어", briefing: "한 명의 라이어를 찾아보세요. 일반 모드에서는 라이어가 장르만, 바보 라이어 모드에서는 다른 제시어를 받습니다.", category: "solo" },
  "dumb-liar": { title: "바보 라이어", briefing: "한 명만 비슷하지만 다른 제시어를 받습니다. 자연스럽게 설명하고 바보 라이어를 찾아보세요.", category: "solo" },
  "body-liar": { title: "몸으로 라이어", briefing: "말하지 않고 몸으로만 표현합니다. 라이어 모드는 시작 전에 선택할 수 있어요.", category: "solo" },
  "face-liar": { title: "얼굴로 라이어", briefing: "말과 몸짓 없이 얼굴 표정만 사용합니다. 라이어 모드는 시작 전에 선택할 수 있어요.", category: "solo" },
  unknown: { title: "라이어-질문", briefing: "한 명만 질문을 모르거나 다른 질문을 받습니다. 차례대로 답하고 라이어를 찾아보세요.", category: "solo" },
  initial: { title: "초성 퀴즈", briefing: "술래의 오른쪽 사람부터 차례대로 답합니다. 방장이 정답을 공개하고, 틀리는 사람이 나올 때까지 다음 문제를 이어갑니다.", category: "solo" },
  hunmin: { title: "무한 훈민정음", briefing: "제시된 초성으로 단어를 이어 말합니다. 마지막 술래의 오른쪽 사람부터 시작하세요.", category: "solo" },
  taste: { title: "취향 일치", briefing: "두 선택지 중 하나를 각자 휴대폰으로 고릅니다. 모두 선택하면 결과에서 각자의 선택을 확인하세요.", category: "solo" },
  trivia: { title: "중급 상식 퀴즈", briefing: "술래의 오른쪽 사람부터 차례대로 답합니다. 방장이 정답을 공개하고, 틀리는 사람이 나올 때까지 진행합니다.", category: "solo" },
  memory: { title: "가짜 추억 찾기", briefing: "한 명이 진짜 추억 3개와 가짜 추억 1개를 작성합니다. 섞인 문장 중 가짜를 찾아보세요.", category: "solo" },
  "ten-seconds": { title: "정확히 10초", briefing: "각자 화면을 보지 않고 정확히 10초를 맞혀보세요. 한 사람당 한 번만 도전할 수 있습니다.", category: "solo" },
  color: { title: "색깔 찾기", briefing: "제시된 색깔의 물건을 찾아 카메라로 찍어 올리세요. 촬영 순서대로 사진이 표시됩니다.", category: "solo" },
  "object-initial": { title: "초성 물건 찾기", briefing: "제시된 초성으로 시작하는 물건을 찾아 카메라로 찍어 올리세요.", category: "solo" },
  "gem-heist": { title: "사라진 보석", briefing: "범인은 가짜 알리바이로 정체를 숨기고, 수사대는 각자의 단서를 합쳐 범인을 찾습니다. 사건 파일을 확인한 뒤 질문하고 마지막에 비밀 투표하세요.", category: "solo" },
  telestration: { title: "텔레그레이션", briefing: "45초·40초·35초 동안 그림을 이어 그립니다. 마지막 그림의 정답 입력에는 제한시간이 없고, 두 명 이상 맞히면 통과입니다.", category: "coop" },
  people: { title: "인물 퀴즈", briefing: "한 사람씩 5초 안에 사진 속 인물을 맞힙니다. 전원이 성공하면 통과하고, 방장이 다음 문제 또는 실패를 선택합니다.", category: "coop" },
  chain: { title: "줄줄이 말해요", briefing: "같은 주제로 한 사람씩 5초 안에 답합니다. 전원이 성공하면 통과하고, 주제는 도중에 바뀌지 않습니다.", category: "coop" },
  four: { title: "네 글자 이어말하기", briefing: "한 사람씩 5초 안에 앞 두 글자에 이어지는 네 글자 단어를 맞힙니다. 전원이 성공하면 통과합니다.", category: "coop" },
  syllable: { title: "이어말하기 · 팀전", briefing: "두 팀으로 나눠 제시된 주제에 맞는 단어를 한 글자씩 이어 말하세요. 제한시간 없이 직접 판정합니다.", category: "coop" },
  character: { title: "캐릭터 퀴즈", briefing: "한 사람씩 5초 안에 사진 속 캐릭터를 맞힙니다. 전원이 성공하면 통과합니다.", category: "coop" },
  "group-initial": { title: "단체 초성 퀴즈", briefing: "랜덤으로 지목된 사람이 3초 안에 초성에 맞는 단어를 말합니다. 방장이 다음 문제를 진행합니다.", category: "coop" },
};

export const GAME_IDS = Object.keys(GAME_INFO);
const CONTENT = GAME_CONTENT as Record<string, unknown>;
export const pick = <T,>(items: T[]): T => items[Math.floor(Math.random() * items.length)];
export const shuffle = <T,>(items: T[]): T[] => [...items].sort(() => Math.random() - 0.5);
const getList = <T,>(key: string, fallback: T[]): T[] => Array.isArray(CONTENT[key]) ? CONTENT[key] as T[] : fallback;

function pickDifferent<T>(items: T[], first: T): T {
  const alternatives = items.filter((item) => item !== first);
  return pick(alternatives.length ? alternatives : items);
}

function dealerTurnBase(players: Player[]) {
  const dealerIndex = players.length ? Math.floor(Math.random() * players.length) : 0;
  const dealerId = players[dealerIndex]?.id;
  const ordered = players.length ? [...players.slice(dealerIndex + 1), ...players.slice(0, dealerIndex + 1)] : [];
  return { dealerId, playerOrder: ordered.map((player) => player.id), currentPlayerIndex: 0 };
}

function timedBase(players: Player[], seconds: number) {
  return { playerOrder: shuffle(players.map((player) => player.id)), currentPlayerIndex: 0, deadline: Date.now() + seconds * 1000 };
}

function teamTimedBase(players: Player[]) {
  return { ...timedBase(players, 5), successfulPlayerIds: [] as string[] };
}

function initialQuestion(excludedCategory?: string): HistoryItem & { category: string } {
  const groups = CONTENT.initialQuiz as Record<string, Array<{ initial: string; answer: string }>>;
  const categories = Object.keys(groups);
  const category = pick(categories.filter((item) => item !== excludedCategory).length ? categories.filter((item) => item !== excludedCategory) : categories);
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

function characterQuestion(): HistoryItem {
  const item = pick(VERIFIED_IMAGES.character as VerifiedImage[]);
  return { prompt: "사진 속 캐릭터는 누구일까요?", answer: item.answer, imageId: item.id, imageSource: item.source };
}

function fourQuestion(): HistoryItem {
  const item = pick(getList<{ front: string; word: string }>("fourSyllable", [{ front: "계좌", word: "계좌번호" }]));
  return { prompt: `${item.front} ○○`, answer: item.word };
}

function groupInitialQuestion(): HistoryItem {
  return { prompt: pick(getList("groupInitials", ["ㄷㅂ"])) };
}

function syllableQuestion(): HistoryItem {
  return { prompt: pick(getList("이어말하기", ["아이돌"])) };
}

function formatGemReport(scene: GemScene, location: GemCard, stolenItem: GemCard, time: GemCard) {
  return scene.report
    .replaceAll("{time}", time.label)
    .replaceAll("{location}", location.label)
    .replaceAll("{item}", stolenItem.label);
}

function makeGemHeistRound(base: GameRound, players: Player[], specialRoles: boolean): GameRound {
  const orderedPlayers = shuffle(players);
  const thief = orderedPlayers[0];
  const remaining = orderedPlayers.slice(1);
  const detective = specialRoles ? remaining[0] : undefined;
  const accomplice = specialRoles && players.length >= 6 ? remaining[1] : undefined;
  const crimeLocation = pick([...GEM_HEIST_DATA.locations]);
  const stolenItem = pick([...GEM_HEIST_DATA.stolenItems]);
  const tool = pick([...GEM_HEIST_DATA.tools]);
  const time = pick([...GEM_HEIST_DATA.times]);
  const scene = pick([...GEM_HEIST_DATA.backgrounds]);
  const locations = shuffle(GEM_HEIST_DATA.locations.filter((item) => item.id !== crimeLocation.id));
  const traits = shuffle([...GEM_HEIST_DATA.traits]);
  const alibis = shuffle([...GEM_HEIST_DATA.alibis]);
  const coverAlibis = shuffle(GEM_HEIST_DATA.alibis.filter((item) => item.id !== alibis[0]?.id));
  const roles: Record<string, GemRole> = {};
  const dossiers: Record<string, GemDossier> = {};

  orderedPlayers.forEach((player, index) => {
    const role: GemRole = player.id === thief?.id
      ? "thief"
      : player.id === detective?.id
        ? "detective"
        : player.id === accomplice?.id
          ? "accomplice"
          : "investigator";
    roles[player.id] = role;
    const alibi = alibis[index % alibis.length];
    dossiers[player.id] = {
      location: player.id === thief?.id ? crimeLocation : locations[index % locations.length],
      trait: traits[index % traits.length],
      alibi,
      claimedAlibi: player.id === thief?.id ? coverAlibis[0] : alibi,
    };
  });

  const thiefDossier = dossiers[thief.id];
  const clearedPlayers = shuffle(remaining);
  const suspectPair = shuffle([thief, ...remaining]).slice(0, 2);
  if (!suspectPair.some((player) => player.id === thief.id)) suspectPair[0] = thief;
  const cluePool: GemClue[] = shuffle([
    {
      icon: thiefDossier.trait.icon,
      title: "목격자의 기억",
      text: `범인은 ‘${thiefDossier.trait.group}’에 해당하는 특징을 가지고 있습니다.`,
      strength: "보통",
    },
    {
      icon: crimeLocation.icon,
      title: "동선 분석",
      text: `범인은 사건 당시 ${crimeLocation.group}에 있었습니다.`,
      strength: "보통",
    },
    {
      icon: thiefDossier.claimedAlibi.icon,
      title: "알리바이 균열",
      text: `거짓 알리바이에는 ‘${thiefDossier.claimedAlibi.label}’라는 내용이 포함되어 있습니다.`,
      strength: "결정적",
    },
    {
      icon: "👥",
      title: "용의자 압축",
      text: `범인은 ${suspectPair.map((player) => player.name).join(" 또는 ")} 중 한 명입니다.`,
      strength: "결정적",
    },
    ...clearedPlayers.slice(0, Math.max(2, players.length - 2)).map((player) => ({
      icon: "✓",
      title: "확인된 동선",
      text: `${player.name}의 동선은 범행 시각과 일치하지 않습니다.`,
      strength: "보통" as const,
    })),
  ]);

  const clues: Record<string, GemClue[]> = {};
  let clueIndex = 0;
  for (const player of orderedPlayers) {
    const role = roles[player.id];
    if (role === "thief") {
      clues[player.id] = [{
        icon: "🃏",
        title: "위장 지침",
        text: `당신의 가짜 알리바이는 ‘${thiefDossier.claimedAlibi.label}’입니다. 실제 장소와 특징을 들키지 마세요.`,
        strength: "결정적",
      }];
    } else if (role === "accomplice") {
      clues[player.id] = [{
        icon: "🤝",
        title: "공범의 비밀",
        text: `범인은 ${thief.name}입니다. 수사대가 다른 사람을 의심하도록 자연스럽게 흔드세요.`,
        strength: "결정적",
      }];
    } else if (role === "detective") {
      clues[player.id] = [
        {
          icon: thiefDossier.trait.icon,
          title: "정밀 감식",
          text: `범인의 정확한 특징은 ‘${thiefDossier.trait.label}’입니다.`,
          strength: "결정적",
        },
        cluePool[clueIndex++ % cluePool.length],
      ];
    } else {
      clues[player.id] = [cluePool[clueIndex++ % cluePool.length]];
    }
  }

  return {
    ...base,
    prompt: scene.title,
    category: "추리 · 심리전",
    playerOrder: shuffle(players.map((player) => player.id)),
    gemSpecialRoles: specialRoles,
    gemPhase: "dossier",
    gemCase: {
      scene,
      location: crimeLocation,
      stolenItem,
      tool,
      time,
      report: formatGemReport(scene, crimeLocation, stolenItem, time),
    },
    gemRoles: roles,
    gemDossiers: dossiers,
    gemClues: clues,
    gemThiefId: thief.id,
    gemDetectiveId: detective?.id,
    gemAccompliceId: accomplice?.id,
    gemQuestions: shuffle([...GEM_HEIST_DATA.questions]).slice(0, 6),
    gemQuestionIndex: 0,
    gemVotes: {},
  };
}

function nextUnique(game: GameRound, factory: () => HistoryItem): HistoryItem {
  const used = new Set((game.history ?? []).map((item) => `${item.prompt}:${item.answer ?? ""}`));
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const item = factory();
    if (!used.has(`${item.prompt}:${item.answer ?? ""}`)) return item;
  }
  return factory();
}

function applyQuestion(game: GameRound, item: HistoryItem) {
  game.prompt = item.prompt;
  game.answer = item.answer;
  game.imageId = item.imageId;
  game.imageSource = item.imageSource;
  game.category = item.category ?? game.category;
  game.history = [...(game.history ?? []), item];
}

export function advanceQuestion(game: GameRound, players: Player[]) {
  const order = (game.playerOrder?.length ? game.playerOrder : shuffle(players.map((player) => player.id))).filter((id) => players.some((player) => player.id === id));
  game.playerOrder = order;
  game.currentPlayerIndex = ((game.currentPlayerIndex ?? 0) + 1) % Math.max(1, order.length);
  let item: HistoryItem;
  if (game.id === "initial") item = nextUnique(game, () => initialQuestion(game.category));
  else if (game.id === "trivia") item = nextUnique(game, triviaQuestion);
  else item = nextUnique(game, groupInitialQuestion);
  applyQuestion(game, item);
  game.answerRevealed = false;
  game.correctVotes = [];
  game.deadline = game.id === "group-initial" ? Date.now() + 3000 : undefined;
}

export function advanceCoopQuestion(game: GameRound, players: Player[]) {
  if (game.teamOutcome) return false;
  const order = (game.playerOrder ?? []).filter((id) => players.some((player) => player.id === id));
  game.playerOrder = order;
  const currentId = order[game.currentPlayerIndex ?? 0];
  if (currentId) game.successfulPlayerIds = [...new Set([...(game.successfulPlayerIds ?? []), currentId])];
  if (order.length && (game.successfulPlayerIds?.length ?? 0) >= order.length) {
    game.teamOutcome = "passed";
    game.deadline = undefined;
    return true;
  }
  game.currentPlayerIndex = ((game.currentPlayerIndex ?? 0) + 1) % Math.max(1, order.length);
  if (game.id === "people") applyQuestion(game, nextUnique(game, peopleQuestion));
  else if (game.id === "four") applyQuestion(game, nextUnique(game, fourQuestion));
  else if (game.id === "character") applyQuestion(game, nextUnique(game, characterQuestion));
  else if (game.id === "group-initial") applyQuestion(game, nextUnique(game, groupInitialQuestion));
  game.deadline = Date.now() + (game.id === "group-initial" ? 3000 : 5000);
  return false;
}

export function failCoopQuestion(game: GameRound) {
  const currentId = game.playerOrder?.[game.currentPlayerIndex ?? 0];
  game.teamOutcome = "failed";
  game.failedPlayerId = currentId;
  game.deadline = undefined;
}

export function advanceSyllableQuestion(game: GameRound) {
  const item = nextUnique(game, syllableQuestion);
  applyQuestion(game, item);
}

export function removePlayerFromRound(game: GameRound | undefined, playerId: string) {
  if (!game) return;
  game.playerOrder = game.playerOrder?.filter((id) => id !== playerId);
  if (game.playerOrder?.length) game.currentPlayerIndex = Math.min(game.currentPlayerIndex ?? 0, game.playerOrder.length - 1);
  game.telestrationOrder = game.telestrationOrder?.filter((id) => id !== playerId);
  game.telestrationSubmitted = game.telestrationSubmitted?.filter((id) => id !== playerId);
  game.successfulPlayerIds = game.successfulPlayerIds?.filter((id) => id !== playerId);
  if (game.gemVotes) {
    delete game.gemVotes[playerId];
    for (const [voterId, suspectId] of Object.entries(game.gemVotes)) {
      if (suspectId === playerId) delete game.gemVotes[voterId];
    }
  }
  if (game.playerOrder?.length) game.currentPlayerIndex = (game.currentPlayerIndex ?? 0) % game.playerOrder.length;
}

function makeRoundCandidate(id: string, players: Player[], liarMode: "normal" | "dumb" = "normal", specialRoles = false): GameRound | null {
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
    return { ...base, ...dealerTurnBase(players), prompt: item.prompt, answer: item.answer, category: item.category, history: [item], answerRevealed: false };
  }
  if (id === "hunmin") return { ...base, prompt: pick(getList("infiniteInitials", ["ㄱㅂ"])) };
  if (id === "taste") return { ...base, prompt: "둘 중 하나를 선택하세요", choices: pick(getList<string[]>("tasteMatch", [["짜장면", "짬뽕"]])), selections: {} };
  if (id === "trivia") {
    const item = triviaQuestion();
    return { ...base, ...dealerTurnBase(players), prompt: item.prompt, answer: item.answer, history: [item], answerRevealed: false };
  }
  if (id === "memory") return { ...base, prompt: "진짜 세 개, 가짜 하나", storytellerId: selectedPlayer?.id, memoryWord: pick(getList("fakeMemoryWords", ["수학여행"])), memoryReady: false, fakeSlot: Math.floor(Math.random() * 4) };
  if (id === "ten-seconds") return { ...base, prompt: "진행중", timerResults: [] };
  if (id === "color") return { ...base, prompt: pick(getList("colors", ["파랑"])), photoSubmissions: [] };
  if (id === "object-initial") return { ...base, prompt: pick(getList("objectInitials", ["ㄱ"])), photoSubmissions: [] };
  if (id === "gem-heist") return makeGemHeistRound(base, players, specialRoles);
  if (id === "telestration") {
    const order = shuffle(players.map((player) => player.id));
    const words = shuffle(getList<string>("telestrationWords", ["도깨비", "등대", "우주선", "팝콘"]));
    const chains = order.map((playerId, index) => ({ id: crypto.randomUUID(), prompt: words[index % words.length], steps: [] as TelestrationStep[] }));
    return { ...base, prompt: "그림 릴레이", telestrationRound: 1, telestrationDeadline: Date.now() + 45_000, telestrationOrder: order, telestrationChains: chains, telestrationSubmitted: [], telestrationComplete: false, telestrationAutoCorrectChainIds: [], telestrationAcceptedChainIds: [] };
  }
  if (id === "chain") return { ...base, ...teamTimedBase(players), prompt: pick(getList("chainPrompts", ["탕으로 끝나는 음식"])), history: [] };
  if (id === "four") {
    const item = fourQuestion();
    return { ...base, ...teamTimedBase(players), prompt: item.prompt, answer: item.answer, history: [item] };
  }
  if (id === "syllable") {
    const item = syllableQuestion();
    return { ...base, prompt: item.prompt, history: [item] };
  }
  if (id === "group-initial") {
    const item = groupInitialQuestion();
    return { ...base, ...timedBase(players, 3), prompt: item.prompt, history: [item], successfulPlayerIds: [] };
  }
  if (id === "people") {
    const item = peopleQuestion();
    return { ...base, ...teamTimedBase(players), prompt: item.prompt, answer: item.answer, imageId: item.imageId, imageSource: item.imageSource, history: [item] };
  }
  if (id === "character") {
    const item = characterQuestion();
    return { ...base, ...teamTimedBase(players), prompt: item.prompt, answer: item.answer, imageId: item.imageId, imageSource: item.imageSource, history: [item] };
  }
  return null;
}

export function roundContentKey(game: GameRound | undefined) {
  if (!game) return undefined;
  if (game.id === "memory") return game.memoryWord ? `${game.id}:${game.memoryWord}` : undefined;
  if (game.id === "taste") return game.choices?.length ? `${game.id}:${JSON.stringify(game.choices)}` : undefined;
  if (["people", "character"].includes(game.id)) return game.imageId ? `${game.id}:${game.imageId}` : undefined;
  if (game.id === "telestration") {
    const prompts = game.telestrationChains?.map((chain) => chain.prompt);
    return prompts?.length ? `${game.id}:${prompts.join("\u0000")}` : undefined;
  }
  if (game.id === "gem-heist") return game.gemCase ? `${game.id}:${game.gemCase.scene.id}:${game.gemCase.stolenItem.id}` : undefined;
  if (["ten-seconds"].includes(game.id)) return undefined;
  return game.prompt ? `${game.id}:${game.prompt}` : undefined;
}

export function makeRound(id: string, players: Player[], liarMode: "normal" | "dumb" = "normal", previousContentKey?: string, specialRoles = false): GameRound | null {
  let round: GameRound | null = null;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    round = makeRoundCandidate(id, players, liarMode, specialRoles);
    if (!round || !previousContentKey || roundContentKey(round) !== previousContentKey) return round;
  }
  return round;
}

export function assignedTelestrationChain(game: GameRound, playerId: string) {
  const order = game.telestrationOrder ?? [];
  const chains = game.telestrationChains ?? [];
  const playerIndex = order.indexOf(playerId);
  const round = game.telestrationRound ?? 1;
  if (playerIndex < 0 || !chains.length) return null;
  const naturalRotation = (round - 1) % chains.length;
  const rotation = round === 4 && chains.length > 1 && naturalRotation === 0 ? 1 : naturalRotation;
  const chainIndex = ((playerIndex - rotation) % chains.length + chains.length) % chains.length;
  return chains[chainIndex] ?? null;
}

export function getTelestrationCorrectCount(game: GameRound) {
  const normalize = (value: string | undefined) => String(value ?? "").replace(/\s+/g, "").toLowerCase();
  const automatic = (game.telestrationChains ?? []).filter((chain) => {
    const guess = [...chain.steps].reverse().find((step) => typeof step.guess === "string")?.guess;
    return normalize(guess) === normalize(chain.prompt);
  }).map((chain) => chain.id);
  game.telestrationAutoCorrectChainIds = automatic;
  return new Set([...automatic, ...(game.telestrationAcceptedChainIds ?? [])]).size;
}

export function advanceTelestration(game: GameRound, players: Player[]) {
  const round = game.telestrationRound ?? 1;
  if (round >= 4) return false;
  game.telestrationRound = round + 1;
  game.telestrationSubmitted = [];
  const nextRound = round + 1;
  game.telestrationDeadline = nextRound === 4 ? undefined : Date.now() + [0, 45, 40, 35][nextRound] * 1000;
  game.telestrationOrder = (game.telestrationOrder ?? []).filter((id) => players.some((player) => player.id === id));
  return true;
}
