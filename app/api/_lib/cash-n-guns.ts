import type { Player } from "./rooms";

export type CashNGunsPhase = "loot_reveal" | "bullet_select" | "aim" | "godfather" | "reaim" | "courage" | "resolve" | "loot" | "loot_result" | "game_over";
export type CashNGunsBullet = "click" | "bang";
export type CashNGunsCourage = "crouch" | "stand";
export type CashNGunsLootKind = "cash" | "diamond" | "painting" | "clip" | "medkit";

export type CashNGunsLootCard = {
  id: string;
  kind: CashNGunsLootKind;
  value?: number;
  label: string;
};

type CashNGunsPlayer = {
  id: string;
  alive: boolean;
  wounds: number;
  bullets: CashNGunsBullet[];
  chosenBullet?: CashNGunsBullet;
  aimTargetId?: string;
  pendingAimTargetId?: string;
  aimConfirmed?: boolean;
  courage?: CashNGunsCourage;
  lootIds: string[];
  lootReservationIds: string[];
};

export type CashNGunsShotResult = {
  shooterId: string;
  targetId?: string;
  result: "bang" | "click" | "hidden" | "blocked" | "miss";
  wound?: boolean;
  targetWounds?: number;
};

export type CashNGunsRoundOutcome = {
  shots: CashNGunsShotResult[];
  woundedIds: string[];
  deadIds: string[];
  eligibleLootIds: string[];
};

export type CashNGunsLootAward = { playerId: string; lootId: string };

export type CashNGunsScore = {
  playerId: string;
  money: number;
  cash: number;
  diamonds: number;
  diamondBonus: number;
  paintings: number;
  paintingValue: number;
  wounds: number;
  alive: boolean;
};

export type CashNGunsState = {
  version: 1;
  round: number;
  totalRounds: 8;
  phase: CashNGunsPhase;
  phaseEndsAt?: number;
  participantIds: string[];
  playerProfiles: Record<string, { id: string; name: string; avatar: string }>;
  players: Record<string, CashNGunsPlayer>;
  godfatherId: string;
  lootDeck: CashNGunsLootCard[];
  cardIndex: Record<string, CashNGunsLootCard>;
  currentLoot: CashNGunsLootCard[];
  lootTakenIds: string[];
  newGodfatherAvailable: boolean;
  lootTurnOrder: string[];
  lootTurnIndex: number;
  lootAwards: CashNGunsLootAward[];
  godfatherCommandUsed: boolean;
  commandTargetId?: string;
  previousAimTargetId?: string;
  discardedBullets: CashNGunsBullet[];
  roundOutcome?: CashNGunsRoundOutcome;
  finalScores?: CashNGunsScore[];
  winnerIds?: string[];
  /** Automated audit metadata. Production room routes never create or expose it. */
  audit?: {
    botAuto: boolean;
    botIds: string[];
  };
};

export type CashNGunsPublicPlayer = {
  id: string;
  name: string;
  avatar: string;
  alive: boolean;
  wounds: number;
  aimTargetId?: string;
  courage?: CashNGunsCourage;
  aimReady: boolean;
  decisionReady: boolean;
};

export type CashNGunsClientState = {
  phase: CashNGunsPhase;
  phaseEndsAt?: number;
  round: number;
  totalRounds: number;
  godfatherId: string;
  players: CashNGunsPublicPlayer[];
  currentLoot: CashNGunsLootCard[];
  lootTakenIds: string[];
  newGodfatherAvailable: boolean;
  lootTurnOrder: string[];
  lootTurnIndex: number;
  lootAwards: CashNGunsLootAward[];
  godfatherCommandUsed: boolean;
  commandTargetId?: string;
  previousAimTargetId?: string;
  roundOutcome?: CashNGunsRoundOutcome;
  finalScores?: CashNGunsScore[];
  winnerIds?: string[];
  my: {
    bullets: CashNGunsBullet[];
    chosenBullet?: CashNGunsBullet;
    aimTargetId?: string;
    pendingAimTargetId?: string;
    courage?: CashNGunsCourage;
    lootIds: string[];
    loot: CashNGunsLootCard[];
    lootReservationIds: string[];
    canReserveLoot: boolean;
    canAct: boolean;
    isLootEligible: boolean;
  };
};

const PHASE_MS: Record<CashNGunsPhase, number> = {
  loot_reveal: 3_000,
  bullet_select: 15_000,
  aim: 15_000,
  godfather: 10_000,
  reaim: 12_000,
  courage: 0,
  resolve: 4_000,
  loot: 6_000,
  loot_result: 2_200,
  game_over: 0,
};

const shuffle = <T,>(items: T[]): T[] => [...items].sort(() => Math.random() - 0.5);
const uuid = () => crypto.randomUUID();

function makeLootDeck(): CashNGunsLootCard[] {
  const cards: CashNGunsLootCard[] = [];
  const add = (kind: CashNGunsLootKind, count: number, label: string, value?: number) => {
    for (let index = 0; index < count; index += 1) cards.push({ id: `${kind}-${index}-${uuid().slice(0, 8)}`, kind, label, value });
  };
  add("cash", 15, "$5,000", 5_000);
  add("cash", 15, "$10,000", 10_000);
  add("cash", 10, "$20,000", 20_000);
  add("diamond", 5, "$1,000 다이아몬드", 1_000);
  add("diamond", 3, "$5,000 다이아몬드", 5_000);
  add("diamond", 1, "$10,000 다이아몬드", 10_000);
  add("painting", 10, "그림", 0);
  add("clip", 3, "탄창", 0);
  add("medkit", 2, "구급상자", 0);
  return shuffle(cards);
}

function drawRoundLoot(state: CashNGunsState) {
  state.currentLoot = state.lootDeck.splice(0, 8);
  state.lootTakenIds = [];
  state.lootAwards = [];
  state.newGodfatherAvailable = true;
  for (const player of Object.values(state.players)) player.lootReservationIds = [];
}

function phaseDeadline(state: CashNGunsState, phase: CashNGunsPhase, now = Date.now()) {
  state.phase = phase;
  state.phaseEndsAt = PHASE_MS[phase] ? now + PHASE_MS[phase] : undefined;
}

export function createCashNGunsState(players: Player[], options: { auditPlayerCount?: number } = {}): CashNGunsState {
  const ordered = [...players].sort((a, b) => a.joinedAt - b.joinedAt);
  const requestedAuditCount = Math.max(0, Math.min(8, Math.floor(options.auditPlayerCount ?? 0)));
  const botCount = Math.max(0, requestedAuditCount - ordered.length);
  const botPlayers: Player[] = Array.from({ length: botCount }, (_, index) => ({
    id: `cash-bot-${index + 1}-${uuid().slice(0, 6)}`,
    name: `BOT ${index + 1}`,
    avatar: "🤖",
    joinedAt: Date.now() + index + 1,
    lastSeen: Date.now(),
    sessionHash: "debug-bot",
    status: "active",
  }));
  ordered.push(...botPlayers);
  const participantIds = ordered.map((player) => player.id);
  const playerProfiles = Object.fromEntries(ordered.map((player) => [player.id, { id: player.id, name: player.name, avatar: player.avatar }]));
  const playerState = Object.fromEntries(ordered.map((player) => [player.id, {
    id: player.id,
    alive: true,
    wounds: 0,
    bullets: ["click", "click", "click", "click", "click", "bang", "bang", "bang"] as CashNGunsBullet[],
    lootIds: [],
    lootReservationIds: [],
  }]));
  const lootDeck = makeLootDeck();
  const state: CashNGunsState = {
    version: 1,
    round: 1,
    totalRounds: 8,
    phase: "loot_reveal",
    phaseEndsAt: Date.now() + PHASE_MS.loot_reveal,
    participantIds,
    playerProfiles,
    players: playerState,
    godfatherId: participantIds[0] ?? "",
    lootDeck,
    cardIndex: Object.fromEntries(lootDeck.map((card) => [card.id, card])),
    currentLoot: [],
    lootTakenIds: [],
    newGodfatherAvailable: true,
    lootTurnOrder: [],
    lootTurnIndex: 0,
    lootAwards: [],
    godfatherCommandUsed: false,
    discardedBullets: [],
    ...(botPlayers.length ? { audit: { botAuto: true, botIds: botPlayers.map((player) => player.id) } } : {}),
  };
  drawRoundLoot(state);
  return state;
}

function aliveIds(state: CashNGunsState) {
  return state.participantIds.filter((id) => state.players[id]?.alive);
}

function nearestAliveFrom(state: CashNGunsState, originId: string) {
  const origin = Math.max(0, state.participantIds.indexOf(originId));
  for (let offset = 1; offset <= state.participantIds.length; offset += 1) {
    const candidate = state.participantIds[(origin + offset) % state.participantIds.length];
    if (state.players[candidate]?.alive) return candidate;
  }
  return aliveIds(state)[0];
}

function ensureLivingGodfather(state: CashNGunsState) {
  if (state.players[state.godfatherId]?.alive) return state.godfatherId;
  const replacement = nearestAliveFrom(state, state.godfatherId);
  if (replacement) state.godfatherId = replacement;
  return replacement;
}

function selectedBulletOrDefault(player: CashNGunsPlayer): CashNGunsBullet | undefined {
  if (player.chosenBullet && player.bullets.includes(player.chosenBullet)) return player.chosenBullet;
  return player.bullets[0];
}

function resetRoundPlayerChoices(state: CashNGunsState) {
  for (const player of Object.values(state.players)) {
    delete player.chosenBullet;
    delete player.aimTargetId;
    delete player.pendingAimTargetId;
    delete player.aimConfirmed;
    delete player.courage;
  }
  state.godfatherCommandUsed = false;
  delete state.commandTargetId;
  delete state.previousAimTargetId;
  delete state.roundOutcome;
  state.lootTurnOrder = [];
  state.lootTurnIndex = 0;
}

function beginNextRound(state: CashNGunsState, now = Date.now()) {
  const alive = aliveIds(state);
  if (alive.length <= 1 || state.round >= state.totalRounds) {
    finishCashNGuns(state);
    return;
  }
  state.round += 1;
  ensureLivingGodfather(state);
  resetRoundPlayerChoices(state);
  drawRoundLoot(state);
  phaseDeadline(state, "loot_reveal", now);
}

function paintingScore(count: number) {
  return [0, 4_000, 12_000, 30_000, 60_000, 100_000, 150_000, 200_000, 300_000, 400_000, 500_000][Math.min(10, count)] ?? 0;
}

function finishCashNGuns(state: CashNGunsState) {
  // Keep the card index on the server so cards taken in earlier rounds remain scoreable.
  const scoreCards = (player: CashNGunsPlayer) => player.lootIds.map((id) => state.cardIndex[id]).filter(Boolean) as CashNGunsLootCard[];
  const diamondCardCounts = Object.fromEntries(state.participantIds.map((id) => [id, scoreCards(state.players[id]).filter((card) => card.kind === "diamond").length]));
  const maxDiamonds = Math.max(0, ...Object.values(diamondCardCounts));
  const tiedDiamondLeaders = Object.values(diamondCardCounts).filter((count) => count === maxDiamonds && count > 0).length > 1;
  state.finalScores = state.participantIds.map((id) => {
    const cards = scoreCards(state.players[id]);
    const cash = cards.filter((card) => card.kind === "cash").reduce((sum, card) => sum + (card.value ?? 0), 0);
    const diamonds = cards.filter((card) => card.kind === "diamond").reduce((sum, card) => sum + (card.value ?? 0), 0);
    const diamondBonus = !tiedDiamondLeaders && maxDiamonds > 0 && diamondCardCounts[id] === maxDiamonds ? 60_000 : 0;
    const paintings = cards.filter((card) => card.kind === "painting").length;
    const paintingValue = paintingScore(paintings);
    return { playerId: id, money: cash + diamonds + diamondBonus + paintingValue, cash, diamonds, diamondBonus, paintings, paintingValue, wounds: state.players[id].wounds, alive: state.players[id].alive };
  });
  const aliveScores = state.finalScores.filter((score) => score.alive);
  const maxMoney = Math.max(...aliveScores.map((score) => score.money), 0);
  state.winnerIds = aliveScores.filter((score) => score.money === maxMoney).map((score) => score.playerId);
  phaseDeadline(state, "game_over");
}

function resolveShots(state: CashNGunsState, now = Date.now()) {
  if (state.phase === "resolve" && state.roundOutcome) return;
  const aliveBefore = new Set(aliveIds(state));
  const standing = new Set([...aliveBefore].filter((id) => (state.players[id].courage ?? "stand") === "stand"));
  const woundCounts = new Map<string, number>();
  const shots: CashNGunsShotResult[] = [];
  for (const shooterId of aliveBefore) {
    const shooter = state.players[shooterId];
    const bullet = selectedBulletOrDefault(shooter);
    const targetId = shooter.aimTargetId;
    if (!bullet) { shots.push({ shooterId, targetId, result: "miss" }); continue; }
    shooter.bullets.splice(shooter.bullets.indexOf(bullet), 1);
    delete shooter.chosenBullet;
    // Every fired card goes to the discard pile. The clip loot can recover a discarded BANG.
    state.discardedBullets.push(bullet);
    if ((shooter.courage ?? "stand") === "crouch") {
      shots.push({ shooterId, targetId, result: "hidden" });
      continue;
    }
    if (!targetId || targetId === shooterId || !aliveBefore.has(targetId)) {
      shots.push({ shooterId, targetId, result: "miss" });
      continue;
    }
    if (!standing.has(targetId)) {
      shots.push({ shooterId, targetId, result: "hidden" });
      continue;
    }
    if (bullet === "bang") {
      woundCounts.set(targetId, (woundCounts.get(targetId) ?? 0) + 1);
      shots.push({ shooterId, targetId, result: "bang", wound: true });
    } else {
      shots.push({ shooterId, targetId, result: "click", wound: false });
    }
  }
  const woundedIds: string[] = [];
  const deadIds: string[] = [];
  for (const [targetId, count] of woundCounts.entries()) {
    const player = state.players[targetId];
    player.wounds = Math.min(3, player.wounds + count);
    woundedIds.push(targetId);
    if (player.wounds >= 3) { player.alive = false; deadIds.push(targetId); }
  }
  for (const shot of shots) if (shot.targetId) shot.targetWounds = state.players[shot.targetId]?.wounds;
  const hitByBang = new Set(woundedIds);
  const eligibleLootIds = aliveIds(state).filter((id) => standing.has(id) && !hitByBang.has(id));
  state.roundOutcome = { shots, woundedIds, deadIds, eligibleLootIds };
  if (aliveIds(state).length <= 1) {
    finishCashNGuns(state);
    return;
  }
  // Even when nobody can take loot, keep the resolve phase visible. Skipping
  // straight to the next round used to swallow the shot feedback entirely.
  const godfather = ensureLivingGodfather(state) ?? eligibleLootIds[0];
  const startIndex = state.participantIds.indexOf(godfather);
  const order = godfather
    ? state.participantIds
      .map((_, index) => state.participantIds[(startIndex + index) % state.participantIds.length])
      .filter((id) => eligibleLootIds.includes(id))
    : [];
  state.lootTurnOrder = order;
  state.lootTurnIndex = 0;
  phaseDeadline(state, "resolve", now);
}

function enterCourage(state: CashNGunsState, now = Date.now()) {
  if (aliveIds(state).every((id) => state.players[id].courage)) resolveShots(state, now);
  else phaseDeadline(state, "courage", now);
}

function defaultCourageAndResolve(state: CashNGunsState, now = Date.now()) {
  for (const id of aliveIds(state)) if (!state.players[id].courage) state.players[id].courage = "stand";
  resolveShots(state, now);
}

function enterAim(state: CashNGunsState, now = Date.now()) {
  for (const id of aliveIds(state)) {
    delete state.players[id].aimTargetId;
    delete state.players[id].pendingAimTargetId;
    state.players[id].aimConfirmed = false;
  }
  phaseDeadline(state, "aim", now);
}

function enterGodfather(state: CashNGunsState, now = Date.now()) {
  if (!aliveIds(state).every((id) => state.players[id].aimConfirmed && state.players[id].aimTargetId && state.players[id].aimTargetId !== id)) {
    enterCourage(state, now);
    return;
  }
  phaseDeadline(state, "godfather", now);
}

function advanceReady(state: CashNGunsState, now = Date.now()) {
  if (state.phase === "bullet_select" && aliveIds(state).every((id) => state.players[id].chosenBullet)) enterAim(state, now);
  if (state.phase === "aim" && aliveIds(state).every((id) => state.players[id].aimConfirmed && state.players[id].aimTargetId)) enterGodfather(state, now);
  if (state.phase === "reaim" && state.commandTargetId && state.players[state.commandTargetId]?.aimConfirmed && state.players[state.commandTargetId].aimTargetId && state.players[state.commandTargetId].aimTargetId !== state.previousAimTargetId) enterCourage(state, now);
  if (state.phase === "courage" && aliveIds(state).every((id) => state.players[id].courage)) resolveShots(state, now);
}

function randomFrom<T>(items: T[]): T | undefined {
  return items[Math.floor(Math.random() * items.length)];
}

function chooseBotTarget(state: CashNGunsState, playerId: string, excludedId?: string) {
  return randomFrom(aliveIds(state).filter((id) => id !== playerId && id !== excludedId));
}

function lootOptionIds(state: CashNGunsState) {
  return [
    ...state.currentLoot.filter((card) => !state.lootTakenIds.includes(card.id)).map((card) => card.id),
    ...(state.newGodfatherAvailable ? ["godfather-token"] : []),
  ];
}

function setLootReservation(state: CashNGunsState, playerId: string, requested: unknown) {
  const player = state.players[playerId];
  if (!player?.alive) throw new Error("생존한 플레이어만 전리품을 예약할 수 있어요.");
  const allowed = new Set([...state.currentLoot.map((card) => card.id), "godfather-token"]);
  const values = Array.isArray(requested) ? requested.map(String) : [];
  player.lootReservationIds = [...new Set(values)].filter((id) => allowed.has(id)).slice(0, 9);
}

function awardLoot(state: CashNGunsState, playerId: string, lootId: string) {
  const player = state.players[playerId];
  if (!player?.alive || !state.roundOutcome?.eligibleLootIds.includes(playerId)) throw new Error("이번 전리품 분배에 참여할 수 없어요.");
  if (lootId === "godfather-token") {
    if (!state.newGodfatherAvailable) throw new Error("새 대부 토큰은 이미 가져갔어요.");
    state.newGodfatherAvailable = false;
    state.godfatherId = playerId;
    (state.lootAwards ??= []).push({ playerId, lootId });
    return;
  }
  const card = state.currentLoot.find((item) => item.id === lootId);
  if (!card || state.lootTakenIds.includes(card.id)) throw new Error("이미 가져간 전리품이에요.");
  state.lootTakenIds.push(card.id);
  player.lootIds.push(card.id);
  (state.lootAwards ??= []).push({ playerId, lootId: card.id });
  if (card.kind === "medkit") player.wounds = 0;
  if (card.kind === "clip") {
    const discardedBang = state.discardedBullets.lastIndexOf("bang");
    if (discardedBang >= 0) {
      state.discardedBullets.splice(discardedBang, 1);
      const click = player.bullets.lastIndexOf("click");
      if (click >= 0) player.bullets.splice(click, 1);
      player.bullets.push("bang");
    }
  }
}

function enterLootResult(state: CashNGunsState, now = Date.now()) {
  phaseDeadline(state, "loot_result", now);
}

function autoLootChoice(state: CashNGunsState, playerId: string) {
  const player = state.players[playerId];
  const available = new Set(lootOptionIds(state));
  const reserved = player?.lootReservationIds.find((id) => available.has(id));
  if (reserved) return reserved;
  const cards = state.currentLoot
    .filter((card) => available.has(card.id))
    .sort((a, b) => (b.value ?? (b.kind === "medkit" ? 15_000 : b.kind === "clip" ? 12_000 : b.kind === "painting" ? 8_000 : 0)) - (a.value ?? (a.kind === "medkit" ? 15_000 : a.kind === "clip" ? 12_000 : a.kind === "painting" ? 8_000 : 0)));
  return cards[0]?.id ?? (state.newGodfatherAvailable ? "godfather-token" : undefined);
}

function advanceLootDraft(state: CashNGunsState, now = Date.now()) {
  if (state.phase !== "loot") return;
  for (let guard = 0; guard < 72; guard += 1) {
    if (!lootOptionIds(state).length) { enterLootResult(state, now); return; }
    if (!state.lootTurnOrder.length) { enterLootResult(state, now); return; }
    const turnId = state.lootTurnOrder[state.lootTurnIndex % state.lootTurnOrder.length];
    if (!turnId || !state.players[turnId]?.alive || !state.roundOutcome?.eligibleLootIds.includes(turnId)) {
      state.lootTurnIndex = (state.lootTurnIndex + 1) % state.lootTurnOrder.length;
      continue;
    }
    const available = new Set(lootOptionIds(state));
    const reserved = state.players[turnId].lootReservationIds.find((id) => available.has(id));
    if (!reserved) {
      state.phaseEndsAt = now + PHASE_MS.loot;
      return;
    }
    awardLoot(state, turnId, reserved);
    state.lootTurnIndex = (state.lootTurnIndex + 1) % state.lootTurnOrder.length;
    state.phaseEndsAt = now + PHASE_MS.loot;
  }
}

/** Fill only synthetic-player decisions. Real players remain in control, which
 * lets a single tester play a complete room against 3~7 bots. */
function runAuditBots(state: CashNGunsState, now = Date.now()) {
  if (!state.audit?.botAuto) return;
  const botSet = new Set(state.audit.botIds);
  for (let guard = 0; guard < 48 && state.phase !== "game_over"; guard += 1) {
    const before = `${state.phase}:${state.lootTurnIndex}:${state.round}`;
    for (const id of state.audit.botIds.filter((playerId) => state.players[playerId]?.alive)) {
      if (!state.players[id].lootReservationIds.length && state.currentLoot.length) {
        state.players[id].lootReservationIds = shuffle([...state.currentLoot.map((card) => card.id), "godfather-token"]);
      }
    }
    if (state.phase === "bullet_select") {
      for (const id of aliveIds(state).filter((playerId) => botSet.has(playerId))) {
        const bot = state.players[id];
        if (!bot.chosenBullet) bot.chosenBullet = randomFrom(bot.bullets) ?? "click";
      }
    } else if (state.phase === "aim") {
      for (const id of aliveIds(state).filter((playerId) => botSet.has(playerId))) {
        const bot = state.players[id];
        if (!bot.aimConfirmed) {
          bot.aimTargetId = chooseBotTarget(state, id);
          bot.aimConfirmed = true;
        }
      }
    } else if (state.phase === "godfather" && botSet.has(state.godfatherId)) {
      const candidates = aliveIds(state).filter((id) => id !== state.godfatherId);
      const commanded = state.round % 2 === 0 ? randomFrom(candidates) : undefined;
      if (commanded) {
        state.godfatherCommandUsed = true;
        state.commandTargetId = commanded;
        state.previousAimTargetId = state.players[commanded].aimTargetId;
        state.players[commanded].aimConfirmed = false;
        delete state.players[commanded].pendingAimTargetId;
        phaseDeadline(state, "reaim", now);
      } else enterCourage(state, now);
    } else if (state.phase === "reaim" && state.commandTargetId && botSet.has(state.commandTargetId)) {
      const bot = state.players[state.commandTargetId];
      bot.aimTargetId = chooseBotTarget(state, bot.id, state.previousAimTargetId);
      bot.aimConfirmed = true;
      enterCourage(state, now);
    } else if (state.phase === "courage") {
      for (const id of aliveIds(state).filter((playerId) => botSet.has(playerId))) {
        const bot = state.players[id];
        if (!bot.courage) bot.courage = Math.random() < 0.24 ? "crouch" : "stand";
      }
    } else if (state.phase === "loot") {
      advanceLootDraft(state, now);
    }
    advanceReady(state, now);
    const after = `${state.phase}:${state.lootTurnIndex}:${state.round}`;
    if (after === before) break;
  }
}

export function advanceCashNGunsIfDue(state: CashNGunsState, now = Date.now()): boolean {
  for (const player of Object.values(state.players)) player.lootReservationIds ??= [];
  state.lootAwards ??= [];
  let changed = false;
  advanceReady(state, now);
  while (state.phaseEndsAt && now >= state.phaseEndsAt && state.phase !== "game_over") {
    changed = true;
    if (state.phase === "loot_reveal") { phaseDeadline(state, "bullet_select", now); continue; }
    if (state.phase === "bullet_select") {
      for (const id of aliveIds(state)) if (!state.players[id].chosenBullet) state.players[id].chosenBullet = state.players[id].bullets[0];
      enterAim(state, now); continue;
    }
    if (state.phase === "aim") {
      const living = aliveIds(state);
      for (const id of living) {
        const player = state.players[id];
        const selected = player.pendingAimTargetId && player.pendingAimTargetId !== id && living.includes(player.pendingAimTargetId) ? player.pendingAimTargetId : living.find((target) => target !== id);
        player.aimTargetId = selected;
        player.aimConfirmed = true;
        delete player.pendingAimTargetId;
      }
      enterGodfather(state, now); continue;
    }
    if (state.phase === "godfather") { enterCourage(state, now); continue; }
    if (state.phase === "reaim") {
      if (state.commandTargetId) {
        const player = state.players[state.commandTargetId];
        if (player.pendingAimTargetId && player.pendingAimTargetId !== state.previousAimTargetId) player.aimTargetId = player.pendingAimTargetId;
        else player.aimTargetId = state.previousAimTargetId;
        player.aimConfirmed = true;
        delete player.pendingAimTargetId;
      }
      enterCourage(state, now); continue;
    }
    if (state.phase === "courage") { defaultCourageAndResolve(state, now); continue; }
    // Keep the reveal screen visible, then move to the loot draft. The round
    // only advances after the loot timer expires or the last card is taken.
    if (state.phase === "resolve") { phaseDeadline(state, "loot", now); advanceLootDraft(state, now); continue; }
    if (state.phase === "loot") {
      const turnId = state.lootTurnOrder[state.lootTurnIndex % Math.max(1, state.lootTurnOrder.length)];
      const lootId = turnId ? autoLootChoice(state, turnId) : undefined;
      if (turnId && lootId) {
        awardLoot(state, turnId, lootId);
        state.lootTurnIndex = (state.lootTurnIndex + 1) % Math.max(1, state.lootTurnOrder.length);
        advanceLootDraft(state, now);
      } else { enterLootResult(state, now); }
      continue;
    }
    if (state.phase === "loot_result") { beginNextRound(state, now); continue; }
    break;
  }
  runAuditBots(state, now);
  return changed;
}

/** Test-only helper that advances through the same production transitions. */
function auditStepCashNGuns(state: CashNGunsState, now = Date.now()) {
  if (state.phase === "game_over") return;
  state.phaseEndsAt = now - 1;
  advanceCashNGunsIfDue(state, now);
}

export function auditAutoCashNGuns(state: CashNGunsState, now = Date.now()) {
  for (let step = 0; step < 256 && state.phase !== "game_over"; step += 1) {
    if (state.phase === "bullet_select") {
      for (const id of aliveIds(state)) state.players[id].chosenBullet = randomFrom(state.players[id].bullets) ?? "click";
    } else if (state.phase === "aim") {
      for (const id of aliveIds(state)) {
        state.players[id].aimTargetId = chooseBotTarget(state, id);
        state.players[id].aimConfirmed = true;
      }
    } else if (state.phase === "godfather") {
      enterCourage(state, now);
    } else if (state.phase === "reaim" && state.commandTargetId) {
      state.players[state.commandTargetId].aimTargetId = chooseBotTarget(state, state.commandTargetId, state.previousAimTargetId);
      state.players[state.commandTargetId].aimConfirmed = true;
      enterCourage(state, now);
    } else if (state.phase === "courage") {
      for (const id of aliveIds(state)) state.players[id].courage = Math.random() < 0.2 ? "crouch" : "stand";
    } else if (state.phase === "loot") {
      for (const id of state.lootTurnOrder) if (!state.players[id].lootReservationIds.length) state.players[id].lootReservationIds = shuffle(lootOptionIds(state));
      advanceLootDraft(state, now);
      if (state.phase === "loot") auditStepCashNGuns(state, now);
      continue;
    }
    advanceReady(state, now);
    if (["loot_reveal", "resolve", "loot_result"].includes(state.phase)) auditStepCashNGuns(state, now);
  }
}

function remainingLoot(state: CashNGunsState) {
  const taken = new Set(state.lootTakenIds);
  return state.currentLoot.filter((card) => !taken.has(card.id));
}

function takeLoot(state: CashNGunsState, playerId: string, lootId: string, now = Date.now()) {
  if (state.phase !== "loot") throw new Error("지금은 전리품을 가져갈 시간이 아니에요.");
  const turnId = state.lootTurnOrder[state.lootTurnIndex];
  if (turnId !== playerId) throw new Error("아직 내 차례가 아니에요.");
  awardLoot(state, playerId, lootId);
  const left = remainingLoot(state).length + (state.newGodfatherAvailable ? 1 : 0);
  if (!left) enterLootResult(state, now);
  else {
    state.lootTurnIndex = (state.lootTurnIndex + 1) % Math.max(1, state.lootTurnOrder.length);
    state.phaseEndsAt = now + PHASE_MS.loot;
    advanceLootDraft(state, now);
  }
}

export function handleCashNGunsAction(state: CashNGunsState, playerId: string, action: string, payload: Record<string, unknown> = {}, now = Date.now()) {
  advanceCashNGunsIfDue(state, now);
  const player = state.players[playerId];
  if (!player) throw new Error("게임 참가자를 찾을 수 없어요.");
  // 타이머 만료 직전에 보낸 예약/틱 요청은 응답이 도착하기 전에 게임이
  // 끝날 수 있습니다. 이 늦은 요청들은 안전한 no-op으로 처리합니다.
  if (state.phase === "game_over" && ["cash-n-guns-tick", "cash-n-guns-reserve-loot", "cash-n-guns-reset-reservation"].includes(action)) return;
  if (state.phase === "game_over") throw new Error("게임이 이미 끝났어요.");
  if (action === "cash-n-guns-tick") return;
  if (action === "cash-n-guns-bullet") {
    if (state.phase !== "bullet_select") throw new Error("지금은 탄환을 고를 시간이 아니에요.");
    const bullet = payload.bullet === "bang" ? "bang" : payload.bullet === "click" ? "click" : undefined;
    if (!bullet || !player.bullets.includes(bullet)) throw new Error("가지고 있는 탄환만 고를 수 있어요.");
    player.chosenBullet = bullet;
  } else if (action === "cash-n-guns-aim-select") {
    if (state.phase !== "aim" && !(state.phase === "reaim" && state.commandTargetId === playerId)) throw new Error("지금은 목표를 선택할 시간이 아니에요.");
    const targetId = String(payload.targetId ?? "");
    if (targetId === playerId || !aliveIds(state).includes(targetId)) throw new Error("살아 있는 다른 플레이어를 겨눠야 해요.");
    if (state.phase === "reaim" && targetId === state.previousAimTargetId) throw new Error("기존과 다른 플레이어를 선택해 주세요.");
    player.pendingAimTargetId = targetId;
  } else if (action === "cash-n-guns-aim") {
    if (state.phase !== "aim") throw new Error("지금은 총구를 겨눌 시간이 아니에요.");
    const targetId = String(payload.targetId ?? player.pendingAimTargetId ?? "");
    if (targetId === playerId || !aliveIds(state).includes(targetId)) throw new Error("살아 있는 다른 플레이어를 겨눠야 해요.");
    player.aimTargetId = targetId;
    player.aimConfirmed = true;
    delete player.pendingAimTargetId;
  } else if (action === "cash-n-guns-godfather-pass") {
    if (state.phase !== "godfather" || state.godfatherId !== playerId) throw new Error("대부만 내릴 수 있는 선택이에요.");
    enterCourage(state, now);
  } else if (action === "cash-n-guns-godfather-command") {
    if (state.phase !== "godfather" || state.godfatherId !== playerId || state.godfatherCommandUsed) throw new Error("이번 라운드의 대부 명령은 이미 사용했어요.");
    const targetId = String(payload.targetId ?? "");
    if (!aliveIds(state).includes(targetId) || targetId === playerId) throw new Error("살아 있는 다른 플레이어를 선택해야 해요.");
    state.godfatherCommandUsed = true;
    state.commandTargetId = targetId;
    state.previousAimTargetId = state.players[targetId].aimTargetId;
    state.players[targetId].aimConfirmed = false;
    delete state.players[targetId].pendingAimTargetId;
    phaseDeadline(state, "reaim", now);
  } else if (action === "cash-n-guns-reaim") {
    if (state.phase !== "reaim" || state.commandTargetId !== playerId) throw new Error("대부에게 지목된 플레이어만 다시 겨눌 수 있어요.");
    const targetId = String(payload.targetId ?? player.pendingAimTargetId ?? "");
    if (targetId === playerId || !aliveIds(state).includes(targetId) || targetId === state.previousAimTargetId) throw new Error("기존과 다른 살아 있는 플레이어를 겨눠야 해요.");
    player.aimTargetId = targetId;
    player.aimConfirmed = true;
    delete player.pendingAimTargetId;
    enterCourage(state, now);
  } else if (action === "cash-n-guns-courage") {
    if (state.phase !== "courage") throw new Error("지금은 몸을 숨길지 정할 시간이 아니에요.");
    if (!player.alive) throw new Error("탈락한 플레이어는 선택할 수 없어요.");
    player.courage = payload.courage === "crouch" ? "crouch" : payload.courage === "stand" ? "stand" : undefined;
    if (!player.courage) throw new Error("숨기 또는 서기를 선택해 주세요.");
  } else if (action === "cash-n-guns-loot") {
    takeLoot(state, playerId, String(payload.lootId ?? ""), now);
  } else if (action === "cash-n-guns-reserve-loot") {
    setLootReservation(state, playerId, payload.reservationIds);
    advanceLootDraft(state, now);
  } else if (action === "cash-n-guns-reset-reservation") {
    player.lootReservationIds = [];
    if (state.phase === "loot") state.phaseEndsAt = now + PHASE_MS.loot;
  } else {
    throw new Error("지원하지 않는 캐시 앤 건즈 행동이에요.");
  }
  advanceReady(state, now);
  runAuditBots(state, now);
}

export function removeCashNGunsPlayer(state: CashNGunsState, playerId: string) {
  const player = state.players[playerId];
  if (!player) return;
  player.alive = false;
  state.lootTurnOrder = state.lootTurnOrder.filter((id) => id !== playerId);
  if (state.lootTurnIndex >= state.lootTurnOrder.length) state.lootTurnIndex = 0;
  ensureLivingGodfather(state);
  if (aliveIds(state).length <= 1) finishCashNGuns(state);
}

export function cashNGunsClientState(state: CashNGunsState, viewerId?: string): CashNGunsClientState {
  state.lootAwards ??= [];
  const revealTargets = ["godfather", "reaim", "courage", "resolve", "loot", "loot_result", "game_over"].includes(state.phase);
  const revealCourage = ["resolve", "loot", "loot_result", "game_over"].includes(state.phase);
  const players = state.participantIds.map((id) => {
    const profile = state.playerProfiles[id];
    const source = state.players[id];
    return {
      id,
      name: profile?.name ?? "플레이어",
      avatar: profile?.avatar ?? "",
      alive: source.alive,
      wounds: source.wounds,
      ...(revealTargets && source.aimTargetId ? { aimTargetId: source.aimTargetId } : {}),
      ...(revealCourage && source.courage ? { courage: source.courage } : {}),
      aimReady: Boolean(source.aimConfirmed),
      decisionReady: Boolean(source.courage),
    };
  });
  const mine = state.players[viewerId ?? ""];
  const eligible = Boolean(viewerId && state.roundOutcome?.eligibleLootIds.includes(viewerId));
  const canAct = Boolean(mine?.alive && ((state.phase === "bullet_select" && !mine.chosenBullet) || (state.phase === "aim" && !mine.aimConfirmed) || (state.phase === "reaim" && state.commandTargetId === viewerId && !mine.aimConfirmed) || (state.phase === "courage" && !mine.courage) || (state.phase === "loot" && eligible && state.lootTurnOrder[state.lootTurnIndex] === viewerId)));
  const canReserveLoot = Boolean(mine?.alive && !["loot_result", "game_over"].includes(state.phase) && state.currentLoot.length && (!state.roundOutcome || eligible || state.phase !== "loot"));
  return {
    phase: state.phase,
    phaseEndsAt: state.phaseEndsAt,
    round: state.round,
    totalRounds: state.totalRounds,
    godfatherId: state.godfatherId,
    players,
    currentLoot: state.currentLoot,
    lootTakenIds: state.lootTakenIds,
    newGodfatherAvailable: state.newGodfatherAvailable,
    lootTurnOrder: state.lootTurnOrder,
    lootTurnIndex: state.lootTurnIndex,
    lootAwards: state.lootAwards,
    godfatherCommandUsed: state.godfatherCommandUsed,
    commandTargetId: state.commandTargetId,
    previousAimTargetId: state.previousAimTargetId,
    roundOutcome: state.roundOutcome,
    finalScores: state.finalScores,
    winnerIds: state.winnerIds,
    my: {
      bullets: mine?.bullets ?? [],
      chosenBullet: mine?.chosenBullet,
      aimTargetId: mine?.aimTargetId,
      pendingAimTargetId: mine?.pendingAimTargetId,
      courage: mine?.courage,
      lootIds: mine?.lootIds ?? [],
      loot: (mine?.lootIds ?? []).map((id) => state.cardIndex[id]).filter(Boolean),
      lootReservationIds: mine?.lootReservationIds ?? [],
      canReserveLoot,
      canAct,
      isLootEligible: eligible,
    },
  };
}
