import type { Player } from "./rooms";
import {
  PLACE_MAFIA_GRAPH,
  PLACE_MAFIA_LOCATION_IDS,
  placeMafiaLegalMoveLocations,
  placeMafiaReachableLocations,
  placeMafiaLocationName,
  type PlaceMafiaBalance,
  type PlaceMafiaClientState,
  type PlaceMafiaDebugRole,
  type PlaceMafiaExecution,
  type PlaceMafiaLocationId,
  type PlaceMafiaPhase,
  type PlaceMafiaPublicNight,
  type PlaceMafiaRole,
  type PlaceMafiaWinner,
} from "../../place-mafia-shared";

export const PLACE_MAFIA_NIGHT_MS = 20_000;
export const PLACE_MAFIA_REVEAL_MS = 8_000;
export const PLACE_MAFIA_VOTE_MS = 20_000;
export const PLACE_MAFIA_EXECUTION_MS = 7_000;

type PlaceMafiaPlayer = {
  role: PlaceMafiaRole;
  alive: boolean;
  location: PlaceMafiaLocationId;
};

export type PlaceMafiaState = {
  phase: PlaceMafiaPhase;
  day: number;
  phaseEndsAt?: number;
  discussionSeconds: 60 | 90 | 120;
  balance: PlaceMafiaBalance;
  participantIds: string[];
  participantProfiles: Array<{ id: string; name: string; avatar: string; bot?: boolean }>;
  players: Record<string, PlaceMafiaPlayer>;
  mafiaIds: string[];
  killerOrder: string[];
  killerIndex: number;
  activeKillerId?: string;
  roleReadyIds: string[];
  moveChoices: Record<string, PlaceMafiaLocationId>;
  moveConfirmedIds: string[];
  attackChoices: PlaceMafiaLocationId[];
  attackConfirmed: boolean;
  witnesses: Record<string, string[]>;
  night?: PlaceMafiaPublicNight;
  discussionCutIds: string[];
  lastDiscussionCut?: { playerId: string; at: number };
  votes: Record<string, string>;
  execution?: PlaceMafiaExecution;
  revealedRoles: Record<string, PlaceMafiaRole>;
  winner?: PlaceMafiaWinner;
  debug?: {
    enabled: true;
    controllerId: string;
    botIds: string[];
  };
};

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

function shuffle<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target]!, result[index]!];
  }
  return result;
}

function attackCount(state: PlaceMafiaState): 0 | 1 | 2 {
  if (state.day > 1) return 1;
  return state.balance === "citizen" ? 0 : state.balance === "mafia" ? 2 : 1;
}

function aliveIds(state: PlaceMafiaState) {
  return state.participantIds.filter((id) => state.players[id]?.alive);
}

function legalMovesFrom(location: PlaceMafiaLocationId) {
  return placeMafiaLegalMoveLocations(location);
}

function legalAttacksFrom(location: PlaceMafiaLocationId) {
  return placeMafiaReachableLocations(location);
}

function findWinner(state: PlaceMafiaState): PlaceMafiaWinner | undefined {
  const alive = aliveIds(state);
  const mafia = alive.filter((id) => state.players[id]?.role === "mafia").length;
  const citizens = alive.length - mafia;
  if (mafia === 0) return "citizen";
  if (mafia >= citizens) return "mafia";
  return undefined;
}

function setActiveKiller(state: PlaceMafiaState, advance: boolean) {
  const livingMafia = state.killerOrder.filter((id) => state.players[id]?.alive);
  if (!livingMafia.length) {
    state.activeKillerId = undefined;
    return;
  }
  if (livingMafia.length === 1) {
    state.activeKillerId = livingMafia[0];
    state.killerIndex = Math.max(0, state.killerOrder.indexOf(livingMafia[0]!));
    return;
  }
  if (advance) state.killerIndex = (state.killerIndex + 1) % state.killerOrder.length;
  for (let attempts = 0; attempts < state.killerOrder.length; attempts += 1) {
    const candidate = state.killerOrder[state.killerIndex];
    if (candidate && state.players[candidate]?.alive) {
      state.activeKillerId = candidate;
      return;
    }
    state.killerIndex = (state.killerIndex + 1) % state.killerOrder.length;
  }
}

function beginNight(state: PlaceMafiaState, at: number, advanceKiller: boolean) {
  setActiveKiller(state, advanceKiller);
  state.phase = "night";
  state.phaseEndsAt = at + PLACE_MAFIA_NIGHT_MS;
  state.moveChoices = {};
  state.moveConfirmedIds = [];
  state.attackChoices = [];
  state.attackConfirmed = false;
  state.witnesses = {};
  state.night = undefined;
  state.discussionCutIds = [];
  state.lastDiscussionCut = undefined;
  state.votes = {};
  state.execution = undefined;
  autoPlayDebugNight(state, at + 10);
}

export function createPlaceMafiaState(
  players: Player[],
  options: { discussionSeconds?: number; balance?: PlaceMafiaBalance; debugMode?: boolean; debugRole?: PlaceMafiaDebugRole } = {},
): PlaceMafiaState {
  const debugEnabled = options.debugMode === true && players.length === 1;
  if (!debugEnabled && (players.length < 4 || players.length > 8)) throw new Error("장소 마피아는 4~8명이 함께할 수 있어요.");
  const controller = players[0];
  const debugProfiles = debugEnabled ? [
    { id: "pm-debug-bot-1", name: "가상 민지", avatar: "🕵️", bot: true },
    { id: "pm-debug-bot-2", name: "가상 준호", avatar: "🧥", bot: true },
    { id: "pm-debug-bot-3", name: "가상 유나", avatar: "🔎", bot: true },
  ] : [];
  const participantProfiles = [
    ...players.map((player) => ({ id: player.id, name: player.name, avatar: player.avatar })),
    ...debugProfiles,
  ];
  const participantIds = participantProfiles.map((player) => player.id);
  const mafiaCount = participantIds.length >= 7 ? 2 : 1;
  const forcedRole = options.debugRole === "citizen" || options.debugRole === "mafia" ? options.debugRole : "auto";
  const mafiaIds = debugEnabled && controller && forcedRole === "mafia"
    ? [controller.id]
    : debugEnabled && forcedRole === "citizen"
      ? [pick(debugProfiles).id]
      : shuffle(participantIds).slice(0, mafiaCount);
  const killerOrder = shuffle(mafiaIds);
  const debug = debugEnabled && controller ? { enabled: true as const, controllerId: controller.id, botIds: debugProfiles.map((player) => player.id) } : undefined;
  const state: PlaceMafiaState = {
    phase: "role_reveal",
    day: 1,
    discussionSeconds: options.discussionSeconds === 60 || options.discussionSeconds === 120 ? options.discussionSeconds : 90,
    balance: options.balance === "citizen" || options.balance === "mafia" ? options.balance : "normal",
    participantIds,
    participantProfiles,
    players: Object.fromEntries(participantIds.map((id) => [id, {
      role: mafiaIds.includes(id) ? "mafia" as const : "citizen" as const,
      alive: true,
      location: pick(PLACE_MAFIA_LOCATION_IDS),
    }])),
    mafiaIds,
    killerOrder,
    killerIndex: 0,
    activeKillerId: killerOrder[0],
    roleReadyIds: debug ? [...debug.botIds] : [],
    moveChoices: {},
    moveConfirmedIds: [],
    attackChoices: [],
    attackConfirmed: false,
    witnesses: {},
    discussionCutIds: [],
    votes: {},
    revealedRoles: {},
    debug,
  };
  return state;
}

export function acknowledgePlaceMafiaRole(state: PlaceMafiaState, playerId: string, now = Date.now()) {
  if (state.phase !== "role_reveal" || !state.participantIds.includes(playerId)) return false;
  if (!state.roleReadyIds.includes(playerId)) state.roleReadyIds.push(playerId);
  if (state.participantIds.every((id) => state.roleReadyIds.includes(id))) beginNight(state, now, false);
  return true;
}

export function submitPlaceMafiaMove(state: PlaceMafiaState, playerId: string, location: PlaceMafiaLocationId, now = Date.now()) {
  if (state.phase !== "night" || (state.phaseEndsAt ?? 0) <= now) throw new Error("밤 행동 시간이 끝났어요.");
  const player = state.players[playerId];
  if (!player?.alive) throw new Error("생존한 참가자만 이동할 수 있어요.");
  if (state.moveConfirmedIds.includes(playerId)) throw new Error("이동은 이미 확정됐어요.");
  if (!legalMovesFrom(player.location).includes(location)) throw new Error("현재 위치에서 이동할 수 없는 장소예요.");
  state.moveChoices[playerId] = location;
  state.moveConfirmedIds.push(playerId);
}

export function submitPlaceMafiaAttack(state: PlaceMafiaState, playerId: string, locations: PlaceMafiaLocationId[], now = Date.now()) {
  if (state.phase !== "night" || (state.phaseEndsAt ?? 0) <= now) throw new Error("밤 행동 시간이 끝났어요.");
  if (state.activeKillerId !== playerId || !state.players[playerId]?.alive) throw new Error("오늘의 살인 담당만 공격할 수 있어요.");
  if (!state.moveConfirmedIds.includes(playerId)) throw new Error("먼저 이동을 확정해 주세요.");
  if (state.attackConfirmed) throw new Error("공격 장소는 이미 확정됐어요.");
  const required = attackCount(state);
  if (required === 0) throw new Error("첫날 살인이 없는 설정이에요.");
  const unique = [...new Set(locations)];
  const destination = state.moveChoices[playerId];
  if (!destination || unique.length !== required || unique.some((location) => !legalAttacksFrom(destination).includes(location))) {
    throw new Error(required === 2 ? "공격 가능한 서로 다른 장소 2곳을 선택해 주세요." : "공격 가능한 장소 1곳을 선택해 주세요.");
  }
  state.attackChoices = unique;
  state.attackConfirmed = true;
}

function autoPlayDebugNight(state: PlaceMafiaState, now: number) {
  const debug = state.debug;
  if (!debug || state.phase !== "night") return;
  const livingBots = debug.botIds.filter((id) => state.players[id]?.alive);
  const killerId = state.activeKillerId;
  const killerIsBot = Boolean(killerId && livingBots.includes(killerId));
  const protectedCitizens = livingBots.filter((id) => state.players[id]?.role === "citizen");
  let plannedVictim: string | undefined;
  let plannedKillerMove: PlaceMafiaLocationId | undefined;
  let plannedVictimMove: PlaceMafiaLocationId | undefined;

  if (killerIsBot && killerId && protectedCitizens.length) {
    const victimId = pick(protectedCitizens);
    const killerMoves = legalMovesFrom(state.players[killerId]!.location);
    const victimMoves = legalMovesFrom(state.players[victimId]!.location);
    outer: for (const killerMove of shuffle(killerMoves)) {
      for (const victimMove of shuffle(victimMoves)) {
        if (legalAttacksFrom(killerMove).includes(victimMove)) {
          plannedVictim = victimId;
          plannedKillerMove = killerMove;
          plannedVictimMove = victimMove;
          break outer;
        }
      }
    }
  }

  for (const botId of livingBots) {
    const player = state.players[botId]!;
    const destination = botId === killerId && plannedKillerMove
      ? plannedKillerMove
      : botId === plannedVictim && plannedVictimMove
        ? plannedVictimMove
        : pick(legalMovesFrom(player.location));
    submitPlaceMafiaMove(state, botId, destination, now);
  }

  const required = attackCount(state);
  if (killerIsBot && killerId && required > 0 && !state.attackConfirmed) {
    const killerDestination = state.moveChoices[killerId]!;
    const legal = shuffle(legalAttacksFrom(killerDestination));
    const primary = plannedVictim ? state.moveChoices[plannedVictim] : legal[0];
    const choices = [primary, ...legal.filter((location) => location !== primary)].filter(Boolean).slice(0, required) as PlaceMafiaLocationId[];
    if (choices.length === required) submitPlaceMafiaAttack(state, killerId, choices, now + 1);
  }
}

function autoPlayDebugVotes(state: PlaceMafiaState, now: number) {
  const debug = state.debug;
  if (!debug || state.phase !== "vote") return;
  const living = aliveIds(state);
  for (const botId of debug.botIds.filter((id) => state.players[id]?.alive)) {
    const nonControllerTargets = living.filter((id) => id !== botId && id !== debug.controllerId);
    const targets = nonControllerTargets.length ? nonControllerTargets : living.filter((id) => id !== botId);
    if (targets.length) state.votes[botId] = pick(targets);
  }
  if (living.every((id) => Boolean(state.votes[id]))) resolveVote(state, now);
}

function makePoliceCandidates(killerLocation: PlaceMafiaLocationId) {
  const adjacent = shuffle(PLACE_MAFIA_GRAPH[killerLocation]);
  const candidates: PlaceMafiaLocationId[] = [killerLocation];
  if (adjacent[0]) candidates.push(adjacent[0]);
  const remaining = shuffle(PLACE_MAFIA_LOCATION_IDS.filter((location) => !candidates.includes(location)));
  if (remaining[0]) candidates.push(remaining[0]);
  return shuffle(candidates).slice(0, 3);
}

function resolveNight(state: PlaceMafiaState, at: number) {
  const livingBeforeAttack = aliveIds(state);
  for (const playerId of livingBeforeAttack) {
    const player = state.players[playerId]!;
    const submitted = state.moveConfirmedIds.includes(playerId) ? state.moveChoices[playerId] : undefined;
    const legal = legalMovesFrom(player.location);
    player.location = submitted && legal.includes(submitted)
      ? submitted
      : legal.includes(player.location) ? player.location : pick(legal);
  }

  for (const playerId of livingBeforeAttack) {
    const location = state.players[playerId]!.location;
    state.witnesses[playerId] = livingBeforeAttack.filter((otherId) => otherId !== playerId && state.players[otherId]?.location === location);
  }

  const plazaVisitorIds = livingBeforeAttack.filter((id) => state.players[id]?.location === "square");
  const policeOccupied = livingBeforeAttack.some((id) => state.players[id]?.location === "police");
  const killerId = state.activeKillerId;
  const killer = killerId ? state.players[killerId] : undefined;
  const required = attackCount(state);
  let victimId: string | undefined;

  if (killerId && killer?.alive && required > 0 && state.moveConfirmedIds.includes(killerId) && state.attackConfirmed) {
    const validTargets = [...new Set(state.attackChoices)]
      .filter((location) => legalAttacksFrom(killer.location).includes(location))
      .slice(0, required)
      .filter((location) => location !== "hospital" || killer.location === "hospital");
    const debugBotKiller = Boolean(state.debug && killerId && state.debug.botIds.includes(killerId));
    const candidates = livingBeforeAttack.filter((id) => {
      const player = state.players[id];
      return player?.role === "citizen"
        && validTargets.includes(player.location)
        && (!debugBotKiller || id !== state.debug?.controllerId);
    });
    victimId = candidates.length ? pick(candidates) : undefined;
  }

  if (victimId) state.players[victimId]!.alive = false;
  const incidentLocation = victimId ? state.players[victimId]!.location : undefined;
  const policeCandidates = victimId && policeOccupied && killer ? makePoliceCandidates(killer.location) : [];
  const quietMessage = "어젯밤은 조용한 밤이었습니다. 아무도 죽지 않았습니다.";
  state.night = {
    day: state.day,
    quiet: !victimId,
    message: victimId ? `${placeMafiaLocationName(incidentLocation)}에서 사건이 발생했습니다.` : quietMessage,
    victimId,
    incidentLocation,
    plazaVisitorIds,
    policeCandidates,
  };
  state.winner = findWinner(state);
  state.phase = "day_reveal";
  state.phaseEndsAt = at + PLACE_MAFIA_REVEAL_MS;
}

function beginDiscussion(state: PlaceMafiaState, at: number) {
  state.phase = "discussion";
  state.phaseEndsAt = at + state.discussionSeconds * 1000;
  state.discussionCutIds = [];
  state.votes = {};
}

function beginVote(state: PlaceMafiaState, at: number) {
  state.phase = "vote";
  state.phaseEndsAt = at + PLACE_MAFIA_VOTE_MS;
  state.votes = {};
  autoPlayDebugVotes(state, at + 10);
}

function resolveVote(state: PlaceMafiaState, at: number) {
  const living = aliveIds(state);
  const tally = new Map<string, number>();
  for (const voterId of living) {
    const targetId = state.votes[voterId];
    if (!targetId || targetId === voterId || !state.players[targetId]?.alive) continue;
    tally.set(targetId, (tally.get(targetId) ?? 0) + 1);
  }
  const maximum = Math.max(0, ...tally.values());
  const leaders = maximum > 0 ? [...tally.entries()].filter(([, count]) => count === maximum).map(([id]) => id) : [];
  let execution: PlaceMafiaExecution;
  if (leaders.length === 1) {
    const playerId = leaders[0]!;
    const role = state.players[playerId]!.role;
    state.players[playerId]!.alive = false;
    state.revealedRoles[playerId] = role;
    execution = { day: state.day, tied: false, playerId, role, message: "최다 득표자가 처형되었습니다." };
  } else {
    execution = { day: state.day, tied: true, message: "동률로 아무도 처형되지 않았습니다." };
  }
  state.execution = execution;
  state.winner = findWinner(state);
  state.phase = "execution";
  state.phaseEndsAt = at + PLACE_MAFIA_EXECUTION_MS;
}

export function shortenPlaceMafiaDiscussion(state: PlaceMafiaState, playerId: string, now = Date.now()) {
  if (state.phase !== "discussion" || !state.players[playerId]?.alive) throw new Error("지금은 토론을 단축할 수 없어요.");
  if (state.discussionCutIds.includes(playerId)) throw new Error("오늘은 이미 토론 단축을 사용했어요.");
  const remaining = (state.phaseEndsAt ?? now) - now;
  if (remaining <= 20_000) throw new Error("마지막 20초는 토론 시간으로 남겨둘게요.");
  state.discussionCutIds.push(playerId);
  state.lastDiscussionCut = { playerId, at: now };
  state.phaseEndsAt = Math.max(now + 20_000, (state.phaseEndsAt ?? now) - 10_000);
}

export function submitPlaceMafiaVote(state: PlaceMafiaState, playerId: string, targetId: string, now = Date.now()) {
  if (state.phase !== "vote" || (state.phaseEndsAt ?? 0) <= now) throw new Error("투표 시간이 끝났어요.");
  if (!state.players[playerId]?.alive) throw new Error("생존한 참가자만 투표할 수 있어요.");
  if (state.votes[playerId]) throw new Error("투표는 이미 확정됐어요.");
  if (playerId === targetId) throw new Error("자기 자신에게는 투표할 수 없어요.");
  if (!state.players[targetId]?.alive) throw new Error("생존한 참가자를 선택해 주세요.");
  state.votes[playerId] = targetId;
  if (aliveIds(state).every((id) => Boolean(state.votes[id]))) resolveVote(state, now);
}

export function skipPlaceMafiaDebugPhase(state: PlaceMafiaState, playerId: string, now = Date.now()) {
  if (!state.debug || state.debug.controllerId !== playerId) throw new Error("혼자 디버깅 모드에서만 사용할 수 있어요.");
  if (state.phase === "game_over") return false;
  if (state.phase === "role_reveal") {
    state.roleReadyIds = [...state.participantIds];
    beginNight(state, now, false);
    return true;
  }
  if (state.phase === "night" && state.players[playerId]?.alive) {
    if (!state.moveConfirmedIds.includes(playerId)) {
      submitPlaceMafiaMove(state, playerId, pick(legalMovesFrom(state.players[playerId]!.location)), now);
    }
    if (state.activeKillerId === playerId && attackCount(state) > 0 && !state.attackConfirmed) {
      const destination = state.moveChoices[playerId]!;
      submitPlaceMafiaAttack(state, playerId, shuffle(legalAttacksFrom(destination)).slice(0, attackCount(state)), now + 1);
    }
  }
  state.phaseEndsAt = now;
  return advancePlaceMafiaIfDue(state, now);
}

export function advancePlaceMafiaIfDue(state: PlaceMafiaState, now = Date.now()) {
  let changed = false;
  for (let steps = 0; steps < 5; steps += 1) {
    const deadline = state.phaseEndsAt;
    if (!deadline || now < deadline || state.phase === "game_over" || state.phase === "role_reveal") break;
    changed = true;
    if (state.phase === "night") resolveNight(state, deadline);
    else if (state.phase === "day_reveal") {
      if (state.winner) {
        state.phase = "game_over";
        state.phaseEndsAt = undefined;
      } else beginDiscussion(state, deadline);
    } else if (state.phase === "discussion") beginVote(state, deadline);
    else if (state.phase === "vote") resolveVote(state, deadline);
    else if (state.phase === "execution") {
      if (state.winner) {
        state.phase = "game_over";
        state.phaseEndsAt = undefined;
      } else {
        state.day += 1;
        beginNight(state, deadline, true);
      }
    }
  }
  return changed;
}

export function removePlaceMafiaPlayer(state: PlaceMafiaState, playerId: string) {
  if (!state.players[playerId]) return;
  state.players[playerId].alive = false;
  state.roleReadyIds = state.roleReadyIds.filter((id) => id !== playerId);
  state.moveConfirmedIds = state.moveConfirmedIds.filter((id) => id !== playerId);
  delete state.moveChoices[playerId];
  delete state.votes[playerId];
  state.winner = findWinner(state);
}

export function placeMafiaClientState(state: PlaceMafiaState, viewerId?: string): PlaceMafiaClientState {
  const living = aliveIds(state);
  const dead = state.participantIds.filter((id) => !state.players[id]?.alive);
  const viewer = viewerId ? state.players[viewerId] : undefined;
  const selectedMove = viewerId ? state.moveChoices[viewerId] : undefined;
  const moveConfirmed = Boolean(viewerId && state.moveConfirmedIds.includes(viewerId));
  const required = attackCount(state);
  const legalAttackLocations = viewerId && viewer?.alive && state.activeKillerId === viewerId && moveConfirmed && selectedMove
    ? legalAttacksFrom(selectedMove)
    : [];
  return {
    phase: state.phase,
    day: state.day,
    phaseEndsAt: state.phaseEndsAt,
    settings: { discussionSeconds: state.discussionSeconds, balance: state.balance },
    participantIds: [...state.participantIds],
    participants: (state.participantProfiles ?? state.participantIds.map((id) => ({ id, name: id, avatar: "·" }))).map((player) => ({ ...player })),
    alivePlayerIds: living,
    deadPlayerIds: dead,
    revealedRoles: { ...state.revealedRoles },
    roleReadyCount: state.roleReadyIds.length,
    voteSubmittedCount: Object.keys(state.votes).length,
    lastDiscussionCut: state.lastDiscussionCut ? { ...state.lastDiscussionCut } : undefined,
    night: state.night ? { ...state.night, plazaVisitorIds: [...state.night.plazaVisitorIds], policeCandidates: [...state.night.policeCandidates] } : undefined,
    execution: state.execution ? { ...state.execution } : undefined,
    winner: state.winner,
    finalRoles: state.phase === "game_over" ? Object.fromEntries(state.participantIds.map((id) => [id, state.players[id]!.role])) : undefined,
    debug: state.debug ? { enabled: true, controller: state.debug.controllerId === viewerId, botCount: state.debug.botIds.length } : undefined,
    my: viewer ? {
      role: viewer.role,
      roleReady: state.roleReadyIds.includes(viewerId!),
      alive: viewer.alive,
      location: viewer.location,
      legalMoves: state.phase === "night" && viewer.alive && !moveConfirmed ? legalMovesFrom(viewer.location) : [],
      selectedMove,
      moveConfirmed,
      witnessIds: state.phase === "night" ? [] : [...(state.witnesses[viewerId!] ?? [])],
      teammateIds: viewer.role === "mafia" ? state.mafiaIds.filter((id) => id !== viewerId) : [],
      activeKillerId: viewer.role === "mafia" ? state.activeKillerId : undefined,
      isKiller: viewer.alive && state.activeKillerId === viewerId,
      requiredAttackCount: required,
      legalAttackLocations,
      selectedAttackLocations: state.activeKillerId === viewerId ? [...state.attackChoices] : [],
      attackConfirmed: state.activeKillerId === viewerId && state.attackConfirmed,
      discussionCutUsed: state.discussionCutIds.includes(viewerId!),
      voteSubmitted: Boolean(state.votes[viewerId!]),
    } : undefined,
  };
}
