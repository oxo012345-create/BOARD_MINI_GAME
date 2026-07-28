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
    .replaceAll("{item}이", withSubjectParticle(stolenItem.label))
    .replaceAll("{item}", stolenItem.label);
}

function uniqueValues(values: Array<string | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function joinedEvidence(values: string[]) {
  return values.length > 1 ? values.join("·") : values[0] ?? "복수";
}

const GEM_QUESTION_GROUPS: Record<string, string[]> = {
  시간: ["q01", "q05", "q09", "q20", "q23", "q28", "q29"],
  장소: ["q04", "q18", "q19", "q33", "q39", "q40"],
  목격: ["q02", "q10", "q14", "q15", "q24", "q38"],
  도구: ["q03", "q08", "q26", "q30"],
  교차신문: ["q06", "q07", "q12", "q13", "q16", "q21", "q31", "q43", "q44"],
  압박: ["q11", "q17", "q22", "q25", "q27", "q32", "q35", "q36", "q37", "q42", "q46", "q49"],
};

const GEM_TOOL_BY_LOCATION_GROUP: Record<string, string[]> = {
  "공개 구역": ["sleep-perfume", "smoke-capsule", "music-timer", "fishing-line"],
  "전시 구역": ["glass-cutter", "wire-hook", "signal-jammer", "uv-lamp", "fishing-line"],
  "야외 구역": ["rope-launcher", "fishing-line", "magnet-cane", "smoke-capsule"],
  "지하 구역": ["copied-key", "wax-impression", "stethoscope", "ice-spray"],
  "개인 구역": ["copied-key", "mirror-shard", "sleep-perfume", "hollow-coin"],
  "업무 구역": ["fake-badge", "remote-cloner", "signal-jammer", "code-notebook"],
  "이동 구역": ["fake-badge", "remote-cloner", "magnet-cane", "mirror-shard"],
};

function gemQuestionsByPurpose() {
  const byId = new Map(GEM_HEIST_DATA.questions.map((question) => [question.id, question]));
  return Object.entries(GEM_QUESTION_GROUPS).map(([group, ids]) => {
    const candidates = ids.map((id) => byId.get(id)).filter((question): question is GemCard => Boolean(question));
    return { ...pick(candidates), group };
  });
}

function compatibleGemTool(location: GemCard) {
  const compatibleIds = GEM_TOOL_BY_LOCATION_GROUP[location.group ?? ""] ?? [];
  const candidates = GEM_HEIST_DATA.tools.filter((item) => compatibleIds.includes(item.id));
  return pick(candidates.length ? candidates : [...GEM_HEIST_DATA.tools]);
}

function balancedGemAlibis() {
  const groups = shuffle(uniqueValues(GEM_HEIST_DATA.alibis.map((item) => item.evidenceGroup)));
  const pools = Object.fromEntries(groups.map((group) => [
    group,
    shuffle(GEM_HEIST_DATA.alibis.filter((item) => item.evidenceGroup === group)),
  ])) as Record<string, GemCard[]>;
  const result: GemCard[] = [];
  while (result.length < GEM_HEIST_DATA.alibis.length) {
    for (const group of groups) {
      const next = pools[group]?.shift();
      if (next) result.push(next);
    }
  }
  return result;
}

function statementForPlayer(
  player: Player,
  role: GemRole,
  dossier: Omit<GemDossier, "statement">,
  claimedLocation: GemCard,
  time: GemCard,
  witness?: Player,
) {
  const isThief = role === "thief";
  const location = isThief ? claimedLocation : dossier.location;
  return {
    locationClaim: `${location.label}에서 ${isThief ? dossier.claimedAlibi.detail : dossier.alibi.detail.replace(/[.]$/, "")}고 말하세요.`,
    witnessClaim: witness ? `${witness.name}을 이동 중 잠깐 봤다고 말할 수 있습니다.` : "직접 알리바이를 보증할 목격자는 없다고 말하세요.",
    observedEvent: `${location.detail.split(/[,.]/)[0]}에서 주변 상황을 확인했다고 설명하세요.`,
    timeClaim: `${time.label} 전후 10분의 일만 답하고, 분 단위 시각은 추측하지 마세요.`,
    pressurePoint: isThief
      ? "누구와 함께 있었는지 재질문받으면 먼저 다른 사람의 진술을 확인하세요."
      : `${dossier.alibi.evidenceGroup ?? "진술"}만으로는 완전한 증명이 아니라는 점을 솔직히 인정하세요.`,
    privateSecret: isThief
      ? `실제 범행 장소는 ${dossier.location.label}입니다. 이 장소와 실제 특징을 직접 말하면 안 됩니다.`
      : `${player.name}은 사건과 무관하게 출입 제한 표지판을 지나쳤습니다. 질문받기 전에는 먼저 꺼내지 마세요.`,
  };
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
  const scene = pick([...GEM_HEIST_DATA.backgrounds]);
  const traits = shuffle([...GEM_HEIST_DATA.traits]);
  const alibis = balancedGemAlibis();
  const coverAlibis = shuffle(GEM_HEIST_DATA.alibis.filter((item) => item.locationId !== crimeLocation.id));
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
  const dossiers: Record<string, GemDossier> = {};
  orderedPlayers.forEach((player, index) => {
    const raw = rawDossiers[player.id];
    const sameAreaWitness = orderedPlayers.find((candidate) =>
      candidate.id !== player.id
      && rawDossiers[candidate.id].location.group === raw.location.group
      && roles[candidate.id] !== "thief"
    );
    const fallbackWitness = orderedPlayers[(index + 1) % orderedPlayers.length];
    dossiers[player.id] = {
      ...raw,
      statement: statementForPlayer(player, roles[player.id], raw, claimedLocation, time, sameAreaWitness ?? fallbackWitness),
    };
  });

  const thiefDossier = dossiers[thief.id];
  const otherPlayers = orderedPlayers.filter((player) => player.id !== thief.id);
  const otherDossiers = otherPlayers.map((player) => dossiers[player.id]);
  const decoyPlayers = shuffle(otherPlayers);
  const traitDecoyPlayer = decoyPlayers[0];
  const locationDecoyPlayer = decoyPlayers.find((player) =>
    player.id !== traitDecoyPlayer?.id && dossiers[player.id].location.label !== claimedLocation.label
  ) ?? decoyPlayers.find((player) => dossiers[player.id].location.label !== claimedLocation.label) ?? decoyPlayers[1] ?? decoyPlayers[0];
  const evidenceDecoyPlayer = decoyPlayers.find((player) =>
    player.id !== traitDecoyPlayer?.id
    && player.id !== locationDecoyPlayer?.id
    && dossiers[player.id].alibi.evidenceGroup !== thiefDossier.claimedAlibi.evidenceGroup
  ) ?? decoyPlayers.find((player) => dossiers[player.id].alibi.evidenceGroup !== thiefDossier.claimedAlibi.evidenceGroup) ?? decoyPlayers[2] ?? decoyPlayers[0];
  const traitDecoy = dossiers[traitDecoyPlayer?.id] ?? otherDossiers[0];
  const locationDecoy = dossiers[locationDecoyPlayer?.id] ?? otherDossiers[1] ?? otherDossiers[0];
  const evidenceDecoy = dossiers[evidenceDecoyPlayer?.id] ?? otherDossiers[2] ?? otherDossiers[0];
  const traitSignals = shuffle([
    thiefDossier.trait.label,
    traitDecoy.trait.label,
  ]);
  const locationSignals = shuffle([
    claimedLocation.label,
    locationDecoy.location.label,
  ]);
  const alibiSignals = uniqueValues(shuffle([
    thiefDossier.claimedAlibi.evidenceGroup,
    evidenceDecoy.alibi.evidenceGroup,
  ]));
  const displayedTraitSignals = difficulty === "hard"
    ? uniqueValues(shuffle([thiefDossier.trait.group, traitDecoy.trait.group]))
    : traitSignals;
  const displayedLocationSignals = difficulty === "hard"
    ? uniqueValues(shuffle([claimedLocation.group, locationDecoy.location.group]))
    : locationSignals;
  const locationGroups = uniqueValues(orderedPlayers.map((player) => dossiers[player.id].location.group));
  const traitGroups = uniqueValues(orderedPlayers.map((player) => dossiers[player.id].trait.group));
  const evidenceGroups = uniqueValues(orderedPlayers.map((player) =>
    player.id === thief.id ? dossiers[player.id].claimedAlibi.evidenceGroup : dossiers[player.id].alibi.evidenceGroup
  ));
  const excludedLocation = pick(locationGroups.filter((group) =>
    group !== thiefDossier.location.group
    && orderedPlayers.filter((player) => dossiers[player.id].location.group !== group).length >= 2
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
      text: `범인이 내세운 동선은 ‘${joinedEvidence(displayedLocationSignals)}’ 중 한 곳과 연결됩니다. 해당 장소를 말한 사람을 확인하세요.`,
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
      text: `${time.label} 기준 앞뒤 10분의 기록만 유효합니다. 알리바이 시간이 이 범위를 벗어나면 범행 동선과 직접 연결되지 않습니다.`,
      strength: "정황",
    },
    {
      icon: "도구",
      title: "도구 감식",
      text: `${tool.label}은 범행 전에 여러 사람이 만졌습니다. 도구를 봤다는 사실보다 그 사람이 말한 장소와 시간을 먼저 비교하세요.`,
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
      icon: "경보",
      title: "가짜 경보",
      text: "범행 직전 두 구역의 센서가 울렸지만 하나는 교란이었습니다. 장소 단서에 포함되지 않은 구역은 우선순위를 낮추세요.",
      strength: "정황",
    },
    {
      icon: "흔적",
      title: "겹친 흔적",
      text: "현장 흔적에는 두 사람의 이동이 겹쳐 있습니다. 특징 단서와 동선 단서에 모두 남는 사람부터 확인하세요.",
      strength: "정황",
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
      text: `세 핵심 기록의 공통 후보를 찾으세요. 특징은 ‘${joinedEvidence(displayedTraitSignals)}’, 동선은 ‘${joinedEvidence(displayedLocationSignals)}’, 증거 형식은 ‘${joinedEvidence(alibiSignals)}’입니다.`,
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
      explanation: `${thief.name}이 주장한 장소 ‘${claimedLocation.label}’가 조작 가능 동선 후보에 포함됐습니다.`,
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
    gemQuestions: gemQuestionsByPurpose(),
    gemQuestionIndex: 0,
    gemVotes: {},
    gemSolution: {
      culpritSignature: [thiefDossier.trait.label, claimedLocation.label, thiefDossier.claimedAlibi.evidenceGroup ?? "단독 진술"],
      decisiveClues,
      reconstruction: `${thief.name}은 실제로 ${crimeLocation.label}에 있었지만 ‘${thiefDossier.claimedAlibi.label}’이라고 진술했습니다. ${tool.label}을 이용해 ${stolenItem.label}을 가져간 뒤 ${claimedLocation.label}에 있었던 것처럼 동선을 꾸몄습니다.`,
      decoyIds: uniqueValues([traitDecoyPlayer?.id, locationDecoyPlayer?.id, evidenceDecoyPlayer?.id]),
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
  for (let attempt = 0; attempt < 12; attempt += 1) {
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

export function validateGemRound(round: GameRound, players: Player[]) {
  const errors: string[] = [];
  if (round.id !== "gem-heist" || !round.gemCase || !round.gemThiefId) return ["사건 데이터가 없습니다."];
  const roles = round.gemRoles ?? {};
  const dossiers = round.gemDossiers ?? {};
  const clues = round.gemClues ?? {};
  if (Object.values(roles).filter((role) => role === "thief").length !== 1) errors.push("범인은 정확히 한 명이어야 합니다.");
  if (dossiers[round.gemThiefId]?.claimedAlibi.locationId === round.gemCase.location.id) errors.push("범인의 가짜 알리바이가 범행 장소와 같습니다.");
  for (const player of players) {
    if (!dossiers[player.id]?.statement) errors.push(`${player.id}의 진술 가이드가 없습니다.`);
    if (!["thief", "accomplice"].includes(roles[player.id]) && (clues[player.id]?.length ?? 0) < 2) errors.push(`${player.id}의 단서가 부족합니다.`);
  }
  const questionGroups = uniqueValues(round.gemQuestions?.map((question) => question.group) ?? []);
  if (round.gemQuestions?.length !== 6 || questionGroups.length !== 6) errors.push("질문 카드 유형이 고르게 구성되지 않았습니다.");
  if ((round.gemSolution?.decisiveClues.length ?? 0) < 2) errors.push("결정적 단서 해설이 부족합니다.");
  if ((round.gemSolution?.decoyIds.length ?? 0) < Math.min(2, players.length - 1)) errors.push("미끼 용의자가 부족합니다.");
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
