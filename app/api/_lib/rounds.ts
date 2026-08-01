import { GAME_CONTENT } from "./content-data.js";
import { GEM_HEIST_DATA, type GemCard, type GemScene } from "./gem-heist-data";
import { VERIFIED_IMAGES, type VerifiedImage } from "./images";
import { withSubjectParticle } from "./korean-particles.js";
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
  statement: {
    locationClaim: string;
    witnessClaim: string;
    witnessIds: string[];
    witnessLocationId: string;
    observedEvent: string;
    timeClaim: string;
    pressurePoint: string;
    privateSecret: string;
  };
};
export type GemClue = { icon: string; title: string; text: string; strength: "정황" | "부분" | "교차검증" | "기밀" };
export type GemDifficulty = "easy" | "normal" | "hard";
export type GemSolution = {
  culpritSignature: string[];
  finalSuspectIds: string[];
  candidateSets: {
    traits: string[];
    locations: string[];
    evidenceGroups: string[];
  };
  decisiveClues: Array<{ title: string; explanation: string }>;
  reconstruction: string;
  decoyIds: string[];
};
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
  gemDifficulty?: GemDifficulty;
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
  gemSolution?: GemSolution;
  mazeCharacters?: Record<string, number>;
  mazeReadyPlayerIds?: string[];
  mazeResults?: Array<{ playerId: string; score: number; recipeIndex: number }>;
  maze?: import("./maze").MazeState;
  dealer?: import("./dealer").DealerState;
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
  "gem-heist": { title: "사라진 보석", briefing: "범인은 가짜 알리바이로 정체를 숨깁니다. 각자 단서 하나만 말해 두 용의자로 좁힌 뒤, 대화의 모순을 찾아 비밀 투표하세요.", category: "solo" },
  "maze-courier": { title: "미로의 배달부", briefing: "최대 8명이 같은 3D 미로에서 재료를 찾아 중앙 조리대로 배달합니다. 길을 막고, 밀치고, 캐릭터 스킬을 활용해 제한 시간 안에 가장 많은 요리를 완성하세요.", category: "solo" },
  "double-dealers": { title: "수상한 딜러들", briefing: "3~8명이 진짜 가치와 두 조항이 숨겨진 아이템 카드를 사고팝니다. 화면 밖에서는 자유롭게 협상하고, 휴대폰에서는 2D 카드·입찰·아이템·상점만 조작하세요.", category: "solo" },
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
    .replaceAll("{item}이", withSubjectParticle(stolenItem.label))
    .replaceAll("{item}", stolenItem.label);
}

function uniqueValues(values: Array<string | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function joinedEvidence(values: string[]) {
  return values.length > 1 ? values.join("·") : values[0] ?? "복수";
}

const GEM_TOOL_BY_LOCATION_GROUP: Record<string, string[]> = {
  "공개 구역": ["silk-gloves", "sleep-perfume", "smoke-capsule", "music-timer", "fishing-line"],
  "전시 구역": ["silk-gloves", "glass-cutter", "wire-hook", "signal-jammer", "uv-lamp", "fishing-line"],
  "야외 구역": ["silk-gloves", "rope-launcher", "fishing-line", "magnet-cane", "smoke-capsule"],
  "지하 구역": ["silk-gloves", "copied-key", "wax-impression", "stethoscope", "ice-spray"],
  "개인 구역": ["silk-gloves", "copied-key", "mirror-shard", "sleep-perfume", "hollow-coin"],
  "업무 구역": ["silk-gloves", "fake-badge", "remote-cloner", "signal-jammer", "code-notebook"],
  "이동 구역": ["silk-gloves", "fake-badge", "remote-cloner", "magnet-cane", "mirror-shard"],
};

const GEM_ALIBI_TIME_IDS: Record<string, string[]> = {
  "toast-photo": ["toast"],
  "piano-request": ["quartet"],
  "dessert-order": ["dessert"],
  "umbrella-help": ["rain"],
  "watch-fireworks": ["fireworks"],
  "music-listen": ["quartet"],
  "digital-guestbook": ["dusk", "toast"],
  "audio-guide-rental": ["dusk", "toast", "quartet"],
  "rooftop-telescope": ["after-midnight", "dawn"],
  "decanter-polish": ["dusk", "toast", "quartet"],
  "archive-map-copy": ["dusk", "toast", "quartet", "dessert"],
  "atrium-vase": ["dusk", "toast"],
  "pool-locker-reset": ["dusk", "toast", "quartet", "dessert", "after-midnight", "dawn"],
  "greenhouse-humidity": ["rain", "midnight", "after-midnight", "dawn"],
  "loading-taxi-call": ["midnight", "after-midnight", "dawn"],
  "lounge-tea-spill": ["toast", "quartet", "blackout", "fireworks", "dessert", "rain", "midnight"],
  "elevator-mirror-selfie": ["dusk", "toast", "quartet", "fireworks", "dessert", "rain", "midnight", "after-midnight"],
  "hallway-vending": ["dusk", "toast", "quartet", "blackout", "fireworks", "dessert", "rain", "midnight", "after-midnight", "dawn"],
  "boiler-temperature-log": ["rain", "midnight", "after-midnight", "dawn"],
  "vault-guided-tour": ["dusk", "toast", "quartet"],
  "kitchen-flambe-video": ["dessert"],
  "roof-panorama": ["fireworks", "midnight", "after-midnight", "dawn"],
  "gallery-charcoal-sketch": ["dusk", "toast", "quartet", "dessert"],
  "music-sheet-sort": ["dusk", "toast", "quartet"],
  "costume-steaming": ["dusk", "toast", "quartet", "midnight"],
  "terrace-drink-spill": ["toast", "quartet", "fireworks", "dessert", "midnight"],
  "atrium-polaroid": ["dusk", "toast", "quartet", "blackout", "fireworks", "dessert", "midnight"],
  "hall-namecards": ["dusk", "toast"],
  "lounge-powerbank": ["dusk", "toast", "quartet", "blackout", "fireworks", "dessert", "rain", "midnight", "after-midnight", "dawn"],
  "hallway-first-aid": ["dusk", "toast", "quartet", "blackout", "fireworks", "dessert", "rain", "midnight", "after-midnight", "dawn"],
  "library-wax-seal": ["dusk", "toast", "quartet", "blackout", "dessert", "midnight", "after-midnight"],
  "security-pass-return": ["dusk", "toast", "quartet", "blackout", "fireworks", "dessert", "rain", "midnight", "after-midnight", "dawn"],
  "banquet-menu-photo": ["toast", "dessert"],
  "greenhouse-label-copy": ["dusk", "toast", "quartet", "dessert", "rain"],
  "pool-water-test": ["dusk", "toast", "quartet", "after-midnight", "dawn"],
  "vault-braille-plaque": ["dusk", "toast", "quartet", "dessert", "midnight", "after-midnight"],
};

const GEM_SCENE_TIME_IDS: Record<string, string[]> = {
  "last-toast": ["toast"],
  "seventeen-seconds": ["blackout"],
  "silent-quartet": ["quartet"],
  "rain-on-glass": ["rain"],
  "midnight-waltz": ["midnight"],
  "champagne-bubbles": ["toast"],
  "blackout-elevator": ["blackout"],
  "unplayed-note": ["quartet"],
  "frozen-window": ["dawn"],
  "final-curtain": ["midnight", "after-midnight"],
};

function compatibleGemScene(time: GemCard) {
  const candidates = GEM_HEIST_DATA.backgrounds.filter((scene) => {
    const allowedTimes = GEM_SCENE_TIME_IDS[scene.id];
    return !allowedTimes || allowedTimes.includes(time.id);
  });
  return pick(candidates);
}

function compatibleGemAlibis(time: GemCard) {
  return GEM_HEIST_DATA.alibis.filter((alibi) => {
    const allowedTimes = GEM_ALIBI_TIME_IDS[alibi.id];
    return !allowedTimes || allowedTimes.includes(time.id);
  });
}

function gemQuestionsForCase(time: GemCard, tool: GemCard) {
  const byId = new Map(GEM_HEIST_DATA.questions.map((question) => [question.id, question]));
  const question = (id: string, group: string, label: string, detail: string): GemCard => ({
    ...(byId.get(id) ?? { id, icon: "?" }),
    id,
    group,
    label,
    detail,
  });
  return [
    question("q01", "시간", `${time.label}, 어디에서 무엇을 하고 있었나요?`, "사건 파일의 ‘사건 시각의 행동’을 그대로 말하세요. 분 단위 행동을 새로 만들지 마세요."),
    question("q04", "장소", "사건 당시 위치와 알리바이를 함께 공개하세요.", "사건 파일에 적힌 장소와 알리바이 문장을 한 번씩 읽고 서로 비교하세요."),
    question("q02", "목격", "사건 15분 전 누구와 마주쳤나요?", "사건 파일의 ‘사건 전 마주친 사람’을 공개하세요. 서로의 기록이 같은지 확인하세요."),
    question("q30", "도구", `${tool.label}에 남은 이동 흔적과 누구의 동선이 겹치나요?`, "‘이동 기록 대조’ 단서의 두 장소와 각자의 사건 당시 위치를 비교하세요."),
    question("q43", "교차신문", "특징·동선·증거 형식 후보를 한 표로 합쳐보세요.", "세 종류의 핵심 단서에 모두 포함되는 사람만 최종 후보로 남기세요."),
    question("q49", "압박", "최종 후보에게 세 가지 정보를 다시 확인하세요.", "사건 당시 위치, 프로필 특징, 알리바이 증거 형식을 차례로 다시 말하게 하세요."),
  ];
}

function compatibleGemTool(location: GemCard) {
  const compatibleIds = GEM_TOOL_BY_LOCATION_GROUP[location.group ?? ""] ?? [];
  const candidates = GEM_HEIST_DATA.tools.filter((item) => compatibleIds.includes(item.id));
  return pick(candidates.length ? candidates : [...GEM_HEIST_DATA.tools]);
}

function balancedGemAlibis(time: GemCard) {
  const compatibleAlibis = compatibleGemAlibis(time);
  const groups = shuffle(uniqueValues(compatibleAlibis.map((item) => item.evidenceGroup)));
  const pools = Object.fromEntries(groups.map((group) => [
    group,
    shuffle(compatibleAlibis.filter((item) => item.evidenceGroup === group)),
  ])) as Record<string, GemCard[]>;
  const result: GemCard[] = [];
  while (result.length < compatibleAlibis.length) {
    for (const group of groups) {
      const next = pools[group]?.shift();
      if (next) result.push(next);
    }
  }
  return result;
}

function statementForPlayer(
  role: GemRole,
  dossier: Omit<GemDossier, "statement">,
  claimedLocation: GemCard,
  time: GemCard,
  witnessAssignment: { witnesses: Player[]; location: GemCard },
) {
  const isThief = role === "thief";
  const location = isThief ? claimedLocation : dossier.location;
  const alibi = isThief ? dossier.claimedAlibi : dossier.alibi;
  const witnessNames = witnessAssignment.witnesses.map((witness) => witness.name).join(", ");
  return {
    locationClaim: `사건 발생 당시 ${location.label}에 있었다고 말하세요.`,
    witnessClaim: `사건 15분 전 ${witnessAssignment.location.label}에서 ${witnessNames}와 서로 마주쳤습니다.`,
    witnessIds: witnessAssignment.witnesses.map((witness) => witness.id),
    witnessLocationId: witnessAssignment.location.id,
    observedEvent: `사건 5분 전 ${location.label}에 도착했고, 사건 발생 때까지 그곳에 머물렀다고 말하세요.`,
    timeClaim: `${time.label}에는 “${alibi.detail}”라고 진술하세요.`,
    pressurePoint: isThief
      ? `가짜 알리바이는 ${alibi.evidenceGroup ?? "진술"}만 뒷받침합니다. 다른 시간이나 장소를 새로 만들어 말하지 마세요.`
      : `${alibi.evidenceGroup ?? "진술"}은 사건 시각의 행동을 뒷받침하지만, 이것만으로 범인을 단정할 수는 없다고 말하세요.`,
    privateSecret: isThief
      ? `실제 범행 장소는 ${dossier.location.label}입니다. 이 장소와 실제 특징을 직접 말하면 안 됩니다.`
      : role === "accomplice"
        ? "사건 파일의 위치와 알리바이는 사실입니다. 다만 범인을 알고 있으므로 개인 단서 공개 시점을 조절할 수 있습니다."
        : "사건 파일의 위치·특징·알리바이는 모두 사실입니다. 질문받으면 적힌 내용 그대로 공개하세요.",
  };
}

function gemWitnessAssignments(players: Player[]) {
  const neutralLocations = shuffle(GEM_HEIST_DATA.locations.filter((location) =>
    ["grand-hall", "atrium", "hallway", "lounge"].includes(location.id)
  ));
  const groups: Player[][] = [];
  for (let index = 0; index < players.length; index += 2) groups.push(players.slice(index, index + 2));
  if (groups.length > 1 && groups.at(-1)?.length === 1) groups.at(-2)?.push(...groups.pop()!);
  const assignments: Record<string, { witnesses: Player[]; location: GemCard }> = {};
  groups.forEach((group, index) => {
    const location = neutralLocations[index % neutralLocations.length] ?? GEM_HEIST_DATA.locations[0];
    for (const player of group) {
      assignments[player.id] = {
        witnesses: group.filter((candidate) => candidate.id !== player.id),
        location,
      };
    }
  });
  return assignments;
}

function makeGemHeistRound(base: GameRound, players: Player[], specialRoles: boolean, difficulty: GemDifficulty): GameRound {
  const orderedPlayers = shuffle(players);
  const thief = orderedPlayers[0];
  const remaining = orderedPlayers.slice(1);
  const detective = specialRoles ? remaining[0] : undefined;
  const accomplice = specialRoles && players.length >= 6 ? remaining[1] : undefined;
  const crimeLocation = pick([...GEM_HEIST_DATA.locations]);
  const stolenItem = pick([...GEM_HEIST_DATA.stolenItems]);
  const tool = compatibleGemTool(crimeLocation);
  const time = pick([...GEM_HEIST_DATA.times]);
  const scene = compatibleGemScene(time);
  const traits = shuffle([...GEM_HEIST_DATA.traits]);
  const alibis = balancedGemAlibis(time);
  const claimedAlibiIds = new Set(alibis.slice(1, orderedPlayers.length).map((alibi) => alibi.id));
  const coverAlibis = shuffle(compatibleGemAlibis(time).filter((item) =>
    item.locationId !== crimeLocation.id && !claimedAlibiIds.has(item.id)
  ));
  const roles: Record<string, GemRole> = {};
  const rawDossiers: Record<string, Omit<GemDossier, "statement">> = {};

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
    const alibiLocation = GEM_HEIST_DATA.locations.find((location) => location.id === alibi.locationId)
      ?? pick(GEM_HEIST_DATA.locations.filter((location) => location.id !== crimeLocation.id));
    rawDossiers[player.id] = {
      location: player.id === thief?.id ? crimeLocation : alibiLocation,
      trait: traits[index % traits.length],
      alibi,
      claimedAlibi: player.id === thief?.id ? coverAlibis[0] ?? alibi : alibi,
    };
  });

  const thiefRawDossier = rawDossiers[thief.id];
  const claimedLocation = GEM_HEIST_DATA.locations.find((location) => location.id === thiefRawDossier.claimedAlibi.locationId)
    ?? crimeLocation;
  const witnessAssignments = gemWitnessAssignments(orderedPlayers);
  const dossiers: Record<string, GemDossier> = {};
  orderedPlayers.forEach((player) => {
    const raw = rawDossiers[player.id];
    dossiers[player.id] = {
      ...raw,
      statement: statementForPlayer(
        roles[player.id],
        raw,
        claimedLocation,
        time,
        witnessAssignments[player.id],
      ),
    };
  });

  const thiefDossier = dossiers[thief.id];
  const innocentPlayers = orderedPlayers.filter((player) =>
    player.id !== thief.id && player.id !== accomplice?.id
  );
  const decoyPlayers = shuffle(innocentPlayers);
  const publicLocation = (player: Player) => player.id === thief.id ? claimedLocation : dossiers[player.id].location;
  const publicAlibi = (player: Player) => player.id === thief.id ? dossiers[player.id].claimedAlibi : dossiers[player.id].alibi;
  const traitValue = (player: Player) => difficulty === "hard" ? dossiers[player.id].trait.group : dossiers[player.id].trait.label;
  const locationValue = (player: Player) => difficulty === "hard" ? publicLocation(player).group : publicLocation(player).label;
  const evidenceValue = (player: Player) => publicAlibi(player).evidenceGroup;
  const thiefValues = {
    trait: traitValue(thief) ?? "",
    location: locationValue(thief) ?? "",
    evidence: evidenceValue(thief) ?? "",
  };
  const shadowPlayer = decoyPlayers.find((player) => {
    const shadowValues = {
      trait: traitValue(player) ?? "",
      location: locationValue(player) ?? "",
      evidence: evidenceValue(player) ?? "",
    };
    if (
      shadowValues.trait === thiefValues.trait
      || shadowValues.location === thiefValues.location
      || shadowValues.evidence === thiefValues.evidence
    ) return false;
    const candidateTraits = new Set([thiefValues.trait, shadowValues.trait]);
    const candidateLocations = new Set([thiefValues.location, shadowValues.location]);
    const candidateEvidence = new Set([thiefValues.evidence, shadowValues.evidence]);
    const candidates = orderedPlayers.filter((player) =>
      candidateTraits.has(traitValue(player) ?? "")
      && candidateLocations.has(locationValue(player) ?? "")
      && candidateEvidence.has(evidenceValue(player) ?? "")
    );
    return candidates.length === 2
      && candidates.some((candidate) => candidate.id === thief.id)
      && candidates.some((candidate) => candidate.id === player.id);
  });
  const displayedTraitSignals = uniqueValues(shuffle([thiefValues.trait, traitValue(shadowPlayer ?? decoyPlayers[0])]));
  const displayedLocationSignals = uniqueValues(shuffle([thiefValues.location, locationValue(shadowPlayer ?? decoyPlayers[0])]));
  const alibiSignals = uniqueValues(shuffle([thiefValues.evidence, evidenceValue(shadowPlayer ?? decoyPlayers[0])]));
  const locationGroups = uniqueValues(orderedPlayers.map((player) => publicLocation(player).group));
  const traitGroups = uniqueValues(orderedPlayers.map((player) => dossiers[player.id].trait.group));
  const evidenceGroups = uniqueValues(orderedPlayers.map((player) =>
    player.id === thief.id ? dossiers[player.id].claimedAlibi.evidenceGroup : dossiers[player.id].alibi.evidenceGroup
  ));
  const excludedLocation = pick(locationGroups.filter((group) =>
    group !== claimedLocation.group
    && orderedPlayers.filter((player) => publicLocation(player).group !== group).length >= 2
  ));
  const excludedTrait = pick(traitGroups.filter((group) =>
    group !== thiefDossier.trait.group
    && orderedPlayers.filter((player) => dossiers[player.id].trait.group !== group).length >= 2
  ));
  const excludedEvidence = pick(evidenceGroups.filter((group) =>
    group !== thiefDossier.claimedAlibi.evidenceGroup
    && orderedPlayers.filter((player) => {
      const evidenceGroup = player.id === thief.id ? dossiers[player.id].claimedAlibi.evidenceGroup : dossiers[player.id].alibi.evidenceGroup;
      return evidenceGroup !== group;
    }).length >= 2
  ));
  const coreClues: GemClue[] = [
    {
      icon: "특징",
      title: "인상착의 대조",
      text: `현장 영상에 남은 습관은 ‘${joinedEvidence(displayedTraitSignals)}’ 중 하나입니다. 해당 특징의 주인을 후보로 남기세요.`,
      strength: "부분",
    },
    {
      icon: "동선",
      title: "이동 기록 대조",
      text: `${tool.label}에 남은 이동 흔적은 ‘${joinedEvidence(displayedLocationSignals)}’ 중 한 곳과 연결됩니다. 해당 장소를 말한 사람을 확인하세요.`,
      strength: "부분",
    },
    {
      icon: "알리바이",
      title: "증거 형식 대조",
      text: `조작 가능성이 남은 알리바이는 ‘${joinedEvidence(alibiSignals)}’ 형식 중 하나입니다. 해당 형식의 주인을 비교하세요.`,
      strength: "부분",
    },
  ];
  const supportClues: GemClue[] = [
    {
      icon: "교차",
      title: "교차 확인 방법",
      text: "특징·동선·알리바이 단서에 두 번 이상 반복해서 남는 사람을 우선 의심하세요. 단서 하나만으로 확정하면 안 됩니다.",
      strength: "교차검증",
    },
    {
      icon: "시각",
      title: "시간 오차",
      text: `모든 사건 파일의 알리바이는 ${time.label} 행동을 기준으로 작성됐습니다. 파일에 없는 시간대의 행동은 새로 만들지 마세요.`,
      strength: "정황",
    },
    {
      icon: "도구",
      title: "도구 감식",
      text: `${tool.label}에서 검출된 장소 흔적은 ‘${joinedEvidence(displayedLocationSignals)}’ 두 후보로 좁혀졌습니다. 각자의 진술 장소와 대조하세요.`,
      strength: "정황",
    },
    {
      icon: "진술",
      title: "진술 확인 순서",
      text: "각자 장소, 특징, 알리바이 증거 형식을 차례로 공개하세요. 세 정보 중 두 가지가 단서와 겹치면 재질문 대상입니다.",
      strength: "교차검증",
    },
    {
      icon: "검증",
      title: "기록의 맹점",
      text: "사진과 전자 기록도 촬영 시각이 비어 있으면 완전한 증명이 아닙니다. 기록 종류와 실제 장소가 함께 맞는지 확인하세요.",
      strength: "교차검증",
    },
    {
      icon: "목격",
      title: "목격 교차 확인",
      text: "사건 15분 전 마주친 사람의 기록은 서로 같아야 합니다. 상대 사건 파일에도 자신의 이름과 같은 만남 장소가 적혀 있는지 확인하세요.",
      strength: "교차검증",
    },
    {
      icon: "원문",
      title: "알리바이 원문 확인",
      text: "정상 사건 파일의 알리바이 문장은 서로 겹치지 않습니다. 누군가 다른 사람과 완전히 같은 알리바이를 주장하면 다시 질문하세요.",
      strength: "교차검증",
    },
    ...(excludedLocation ? [{
      icon: "구역",
      title: "동선 제외",
      text: `${excludedLocation}의 센서는 범행 시각에 정상 작동했습니다. 그 구역의 움직임은 핵심 범행 동선이 아닌 것으로 보입니다.`,
      strength: "부분" as const,
    }] : []),
    ...(excludedTrait ? [{
      icon: "관찰",
      title: "목격 보정",
      text: `${excludedTrait}에 관한 목격은 사건이 끝난 뒤의 행동으로 확인됐습니다. 해당 진술은 범행 순간의 단서가 아닙니다.`,
      strength: "부분" as const,
    }] : []),
    ...(excludedEvidence ? [{
      icon: "기록",
      title: "알리바이 제외",
      text: `${excludedEvidence} 형식의 원본은 정상으로 확인됐습니다. 이 형식만 제시한 사람은 이번 단서에서 제외할 수 있습니다.`,
      strength: "부분" as const,
    }] : []),
  ];

  const clues: Record<string, GemClue[]> = {};
  const investigators = orderedPlayers.filter((player) => !["thief", "accomplice"].includes(roles[player.id]));
  const coreDeck = shuffle(coreClues);
  const supportDeck = shuffle(supportClues);
  investigators.forEach((player, index) => {
    const first = index < coreDeck.length ? coreDeck[index] : supportDeck[index % supportDeck.length];
    const second = supportDeck[(index + coreDeck.length) % supportDeck.length] ?? coreClues[(index + 1) % coreClues.length];
    clues[player.id] = [first, second];
    if (difficulty === "easy") {
      const sharedLead = coreDeck[(index + 1) % coreDeck.length];
      if (!clues[player.id].some((clue) => clue.title === sharedLead.title)) clues[player.id].push(sharedLead);
    }
  });
  if (detective && clues[detective.id]) {
    clues[detective.id].push({
      icon: "수석",
      title: "교차 분석 권한",
      text: "공개된 단서를 특징·동선·알리바이 세 칸으로 나눠 정리하세요. 세 칸에 모두 남는 두 사람의 진술을 마지막에 비교하세요.",
      strength: "교차검증",
    });
  }

  for (const player of orderedPlayers) {
    const role = roles[player.id];
    if (role === "thief") {
      clues[player.id] = [{
        icon: "위장",
        title: "위장 지침",
        text: `‘${thiefDossier.claimedAlibi.label}’을 자기 경험처럼 자연스럽게 말하세요. 실제 장소와 같은 표현은 포함되지 않습니다.`,
        strength: "기밀",
      }];
    } else if (role === "accomplice") {
      clues[player.id] = [{
        icon: "공범",
        title: "공범의 비밀",
        text: `범인은 ${thief.name}입니다. 수사대가 다른 사람을 의심하도록 자연스럽게 흔드세요.`,
        strength: "기밀",
      }];
    }
  }

  const decisiveClues = [
    {
      title: "인상착의 대조",
      explanation: `${thief.name}의 특징 ‘${thiefDossier.trait.label}’이 현장 영상 후보에 포함됐습니다.`,
    },
    {
      title: "이동 기록 대조",
      explanation: `${tool.label}의 이동 흔적과 ${thief.name}이 주장한 장소 ‘${claimedLocation.label}’가 일치했습니다.`,
    },
    {
      title: "증거 형식 대조",
      explanation: `가짜 알리바이의 증거 형식 ‘${thiefDossier.claimedAlibi.evidenceGroup}’이 감식 후보와 일치했습니다.`,
    },
  ];

  return {
    ...base,
    prompt: scene.title,
    category: "추리 · 심리전",
    playerOrder: shuffle(players.map((player) => player.id)),
    gemSpecialRoles: specialRoles,
    gemDifficulty: difficulty,
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
    gemQuestions: gemQuestionsForCase(time, tool),
    gemQuestionIndex: 0,
    gemVotes: {},
    gemSolution: {
      culpritSignature: [thiefDossier.trait.label, claimedLocation.label, thiefDossier.claimedAlibi.evidenceGroup ?? "단독 진술"],
      finalSuspectIds: shuffle([thief.id, shadowPlayer?.id].filter((id): id is string => Boolean(id))),
      candidateSets: {
        traits: displayedTraitSignals,
        locations: displayedLocationSignals,
        evidenceGroups: alibiSignals,
      },
      decisiveClues,
      reconstruction: `특징·도구 이동 흔적·알리바이 증거 형식의 세 후보군을 모두 겹쳐도 ${thief.name}과 ${shadowPlayer?.name ?? "또 다른 용의자"} 두 명이 남았습니다. 마지막 판단은 두 사람의 진술과 가짜 알리바이의 모순에 달려 있었습니다. ${thief.name}은 실제로 ${crimeLocation.label}에서 ${tool.label}을 이용해 ${stolenItem.label}을 가져간 뒤, ‘${thiefDossier.claimedAlibi.label}’으로 ${claimedLocation.label}에 있었던 것처럼 동선을 꾸몄습니다.`,
      decoyIds: shadowPlayer ? [shadowPlayer.id] : [],
    },
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

function makeRoundCandidate(id: string, players: Player[], liarMode: "normal" | "dumb" = "normal", specialRoles = false, gemDifficulty: GemDifficulty = "normal"): GameRound | null {
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
  if (id === "gem-heist") return makeGemHeistRound(base, players, specialRoles, gemDifficulty);
  if (id === "maze-courier") return { ...base, prompt: "서버 판정 3D 배달 대결" };
  if (id === "double-dealers") return { ...base, prompt: "2D 카드 비밀 경매" };
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
  if (game.id === "gem-heist") return game.gemCase ? `${game.id}:${game.gemCase.scene.id}:${game.gemCase.stolenItem.id}:${game.gemThiefId ?? ""}` : undefined;
  if (["ten-seconds"].includes(game.id)) return undefined;
  return game.prompt ? `${game.id}:${game.prompt}` : undefined;
}

export function makeRound(
  id: string,
  players: Player[],
  liarMode: "normal" | "dumb" = "normal",
  previousContentKey?: string,
  specialRoles = false,
  gemDifficulty: GemDifficulty = "normal",
): GameRound | null {
  let round: GameRound | null = null;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    round = makeRoundCandidate(id, players, liarMode, specialRoles, gemDifficulty);
    if (round?.id === "gem-heist" && validateGemRound(round, players).length > 0) continue;
    if (!round || !previousContentKey) return round;
    if (id === "gem-heist") {
      const [, previousScene, previousItem, previousThief] = previousContentKey.split(":");
      const repeatsCasePart = round.gemCase?.scene.id === previousScene || round.gemCase?.stolenItem.id === previousItem;
      if (!repeatsCasePart && round.gemThiefId !== previousThief) return round;
    } else if (roundContentKey(round) !== previousContentKey) {
      return round;
    }
  }
  if (round?.id === "gem-heist" && validateGemRound(round, players).length > 0) return null;
  return round;
}

export function gemCandidateIds(round: GameRound) {
  if (!round.gemThiefId || !round.gemDossiers || !round.gemSolution) return [];
  const hard = round.gemDifficulty === "hard";
  const thiefId = round.gemThiefId;
  const sets = round.gemSolution.candidateSets;
  return Object.keys(round.gemDossiers).filter((playerId) => {
    const dossier = round.gemDossiers?.[playerId];
    if (!dossier) return false;
    const claimedLocationId = playerId === thiefId ? dossier.claimedAlibi.locationId : dossier.location.id;
    const claimedLocation = GEM_HEIST_DATA.locations.find((location) => location.id === claimedLocationId);
    const trait = hard ? dossier.trait.group : dossier.trait.label;
    const location = hard ? claimedLocation?.group : claimedLocation?.label;
    const evidence = playerId === thiefId ? dossier.claimedAlibi.evidenceGroup : dossier.alibi.evidenceGroup;
    return sets.traits.includes(trait ?? "")
      && sets.locations.includes(location ?? "")
      && sets.evidenceGroups.includes(evidence ?? "");
  });
}

export function validateGemRound(round: GameRound, players: Player[]) {
  const errors: string[] = [];
  if (round.id !== "gem-heist" || !round.gemCase || !round.gemThiefId) return ["사건 데이터가 없습니다."];
  const roles = round.gemRoles ?? {};
  const dossiers = round.gemDossiers ?? {};
  const clues = round.gemClues ?? {};
  if (Object.values(roles).filter((role) => role === "thief").length !== 1) errors.push("범인은 정확히 한 명이어야 합니다.");
  if (dossiers[round.gemThiefId]?.claimedAlibi.locationId === round.gemCase.location.id) errors.push("범인의 가짜 알리바이가 범행 장소와 같습니다.");
  const publicAlibis = players.map((player) =>
    player.id === round.gemThiefId ? dossiers[player.id]?.claimedAlibi : dossiers[player.id]?.alibi
  ).filter((alibi): alibi is GemCard => Boolean(alibi));
  if (uniqueValues(publicAlibis.map((alibi) => alibi.id)).length !== players.length) errors.push("서로 같은 알리바이가 배정됐습니다.");
  if (publicAlibis.some((alibi) => {
    const allowedTimes = GEM_ALIBI_TIME_IDS[alibi.id];
    return allowedTimes && !allowedTimes.includes(round.gemCase!.time.id);
  })) errors.push("사건 시각과 맞지 않는 알리바이가 있습니다.");
  const allowedSceneTimes = GEM_SCENE_TIME_IDS[round.gemCase.scene.id];
  if (allowedSceneTimes && !allowedSceneTimes.includes(round.gemCase.time.id)) errors.push("사건 배경과 시각이 맞지 않습니다.");
  const compatibleTools = GEM_TOOL_BY_LOCATION_GROUP[round.gemCase.location.group ?? ""] ?? [];
  if (compatibleTools.length && !compatibleTools.includes(round.gemCase.tool.id)) errors.push("사건 장소에서 사용할 수 없는 도구입니다.");
  for (const player of players) {
    if (!dossiers[player.id]?.statement) errors.push(`${player.id}의 진술 가이드가 없습니다.`);
    if (!["thief", "accomplice"].includes(roles[player.id]) && (clues[player.id]?.length ?? 0) < 2) errors.push(`${player.id}의 단서가 부족합니다.`);
    if (player.id !== round.gemThiefId && dossiers[player.id]?.alibi.locationId !== dossiers[player.id]?.location.id) errors.push(`${player.id}의 위치와 알리바이가 다릅니다.`);
    const statement = dossiers[player.id]?.statement;
    if (!statement?.witnessIds.length || statement.witnessIds.includes(player.id)) errors.push(`${player.id}의 목격 관계가 잘못됐습니다.`);
    for (const witnessId of statement?.witnessIds ?? []) {
      const witnessStatement = dossiers[witnessId]?.statement;
      if (!witnessStatement?.witnessIds.includes(player.id) || witnessStatement.witnessLocationId !== statement?.witnessLocationId) {
        errors.push(`${player.id}와 ${witnessId}의 목격 기록이 서로 다릅니다.`);
      }
    }
  }
  const questionGroups = uniqueValues(round.gemQuestions?.map((question) => question.group) ?? []);
  if (round.gemQuestions?.length !== 6 || questionGroups.length !== 6) errors.push("질문 카드 유형이 고르게 구성되지 않았습니다.");
  const allInvestigatorClues = players
    .filter((player) => !["thief", "accomplice"].includes(roles[player.id]))
    .flatMap((player) => clues[player.id] ?? []);
  for (const title of ["인상착의 대조", "이동 기록 대조", "증거 형식 대조"]) {
    if (!allInvestigatorClues.some((clue) => clue.title === title)) errors.push(`${title} 단서가 수사대에 배정되지 않았습니다.`);
  }
  const candidateSets = round.gemSolution?.candidateSets;
  if (!candidateSets || [candidateSets.traits, candidateSets.locations, candidateSets.evidenceGroups].some((values) => uniqueValues(values).length !== 2)) {
    errors.push("핵심 단서의 후보군이 두 개씩 구성되지 않았습니다.");
  }
  const candidates = gemCandidateIds(round);
  if (candidates.length !== 2 || !candidates.includes(round.gemThiefId)) errors.push("모든 단서를 합쳤을 때 범인을 포함한 용의자 두 명이 남지 않습니다.");
  const finalSuspectIds = uniqueValues(round.gemSolution?.finalSuspectIds ?? []);
  if (
    finalSuspectIds.length !== 2
    || finalSuspectIds.some((playerId) => !candidates.includes(playerId))
    || candidates.some((playerId) => !finalSuspectIds.includes(playerId))
  ) errors.push("최종 용의자 명단과 단서 교집합이 일치하지 않습니다.");
  if ((round.gemSolution?.decisiveClues.length ?? 0) < 2) errors.push("결정적 단서 해설이 부족합니다.");
  if (
    round.gemSolution?.decoyIds.length !== 1
    || round.gemSolution.decoyIds[0] === round.gemThiefId
    || round.gemSolution.decoyIds[0] === round.gemAccompliceId
    || !candidates.includes(round.gemSolution.decoyIds[0])
  ) errors.push("무고한 최종 용의자가 정확히 한 명이어야 합니다.");
  return errors;
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
