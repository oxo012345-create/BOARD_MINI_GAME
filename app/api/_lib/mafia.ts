import type { Player } from "./rooms";

export type MafiaRole = "citizen" | "mafia" | "police" | "doctor";
export type MafiaPhase = "role_reveal" | "night" | "day_reveal" | "discussion" | "vote" | "defense" | "verdict" | "execution" | "game_over";
export type MafiaWinner = "citizen" | "mafia";

export type MafiaPublicResult = {
  quiet: boolean;
  victimId?: string;
  message: string;
};

export type MafiaExecution = {
  playerId?: string;
  message: string;
  tied: boolean;
};

type MafiaPlayer = {
  role: MafiaRole;
  alive: boolean;
};

export type MafiaState = {
  phase: MafiaPhase;
  day: number;
  phaseEndsAt?: number;
  discussionSeconds: 60 | 90 | 120;
  mafiaCount: 1 | 2;
  participantIds: string[];
  participantProfiles: Array<{ id: string; name: string; avatar: string }>;
  players: Record<string, MafiaPlayer>;
  roleReadyIds: string[];
  nightChoices: Record<string, string | undefined>;
  nightSubmittedIds: string[];
  nightResult?: MafiaPublicResult;
  policeResults: Record<string, boolean>;
  votes: Record<string, string>;
  voteSubmittedIds: string[];
  verdictVotes: Record<string, "execute" | "spare">;
  verdictSubmittedIds: string[];
  discussionShortenerIds: string[];
  voteShortenerIds: string[];
  execution?: MafiaExecution;
  defensePlayerId?: string;
  winner?: MafiaWinner;
  revealedRoles?: Record<string, MafiaRole>;
};

export type MafiaClientState = {
  phase: MafiaPhase;
  day: number;
  phaseEndsAt?: number;
  settings: { discussionSeconds: 60 | 90 | 120; mafiaCount: 1 | 2; policeIncluded: true; doctorIncluded: true };
  participants: Array<{ id: string; name: string; avatar: string; alive: boolean }>;
  roleReadyCount: number;
  nightSubmittedCount: number;
  voteSubmittedCount: number;
  verdictSubmittedCount: number;
  discussionShortenCount: number;
  voteShortenCount: number;
  defensePlayerId?: string;
  nightResult?: MafiaPublicResult;
  execution?: MafiaExecution;
  winner?: MafiaWinner;
  finalRoles?: Record<string, MafiaRole>;
  my: {
    role: MafiaRole;
    alive: boolean;
    roleReady: boolean;
    selectedTarget?: string;
    nightSubmitted: boolean;
    investigation?: { targetId: string; isMafia: boolean };
    vote?: string;
    verdict?: "execute" | "spare";
    discussionShortened: boolean;
    voteShortened: boolean;
  };
};

export const MAFIA_NIGHT_MS = 20_000;
export const MAFIA_DAY_REVEAL_MS = 5_000;
export const MAFIA_EXECUTION_MS = 5_000;
export const MAFIA_VOTE_MS = 50_000;
export const MAFIA_DEFENSE_MS = 20_000;
export const MAFIA_VERDICT_MS = 30_000;
export const MAFIA_SHORTEN_MS = 10_000;

function shuffle<T>(items: T[]) {
  return [...items].sort(() => Math.random() - 0.5);
}

function aliveIds(state: MafiaState) {
  return state.participantIds.filter((id) => state.players[id]?.alive);
}

function beginNight(state: MafiaState, now = Date.now()) {
  state.phase = "night";
  state.phaseEndsAt = now + MAFIA_NIGHT_MS;
  state.nightChoices = {};
  state.nightSubmittedIds = [];
  state.nightResult = undefined;
  state.votes = {};
  state.voteSubmittedIds = [];
  state.verdictVotes = {};
  state.verdictSubmittedIds = [];
  state.discussionShortenerIds = [];
  state.voteShortenerIds = [];
  state.execution = undefined;
  state.defensePlayerId = undefined;
}

function checkWinner(state: MafiaState) {
  const alive = aliveIds(state);
  const mafia = alive.filter((id) => state.players[id]?.role === "mafia").length;
  const civilians = alive.length - mafia;
  if (mafia === 0) return "citizen" as const;
  if (mafia >= civilians) return "mafia" as const;
  return undefined;
}

function finishGame(state: MafiaState, winner: MafiaWinner) {
  state.winner = winner;
  state.phase = "game_over";
  state.phaseEndsAt = undefined;
  state.revealedRoles = Object.fromEntries(state.participantIds.map((id) => [id, state.players[id].role]));
}

export function createMafiaState(players: Player[], options: { mafiaCount?: number; discussionSeconds?: number } = {}): MafiaState {
  if (players.length < 4 || players.length > 8) throw new Error("오리지널 마피아는 4~8명이 함께할 수 있어요.");
  const participantIds = players.map((player) => player.id);
  const mafiaCount: 1 | 2 = options.mafiaCount === 2 || (options.mafiaCount !== 1 && players.length >= 7) ? 2 : 1;
  const shuffled = shuffle(participantIds);
  const mafiaIds = shuffled.slice(0, mafiaCount);
  const specialIds = shuffled.filter((id) => !mafiaIds.includes(id));
  const policeId = specialIds[0]!;
  const doctorId = specialIds[1]!;
  const playerRoles = Object.fromEntries(participantIds.map((id) => [id, {
    role: mafiaIds.includes(id) ? "mafia" : id === policeId ? "police" : id === doctorId ? "doctor" : "citizen",
    alive: true,
  } satisfies MafiaPlayer]));
  return {
    phase: "role_reveal",
    day: 1,
    phaseEndsAt: undefined,
    discussionSeconds: options.discussionSeconds === 60 || options.discussionSeconds === 120 ? options.discussionSeconds : 90,
    mafiaCount,
    participantIds,
    participantProfiles: players.map((player) => ({ id: player.id, name: player.name, avatar: player.avatar })),
    players: playerRoles,
    roleReadyIds: [],
    nightChoices: {},
    nightSubmittedIds: [],
    policeResults: {},
    votes: {},
    voteSubmittedIds: [],
    verdictVotes: {},
    verdictSubmittedIds: [],
    discussionShortenerIds: [],
    voteShortenerIds: [],
  };
}

export function acknowledgeMafiaRole(state: MafiaState, playerId: string, now = Date.now()) {
  if (state.phase !== "role_reveal" || !state.players[playerId]) return false;
  if (!state.roleReadyIds.includes(playerId)) state.roleReadyIds.push(playerId);
  if (state.roleReadyIds.length === state.participantIds.length) beginNight(state, now);
  return true;
}

export function submitMafiaNight(state: MafiaState, playerId: string, targetId?: string, now = Date.now()) {
  if (state.phase !== "night" || (state.phaseEndsAt ?? 0) <= now) throw new Error("밤 행동 시간이 끝났어요.");
  if (!state.players[playerId]?.alive) throw new Error("사망한 플레이어는 행동할 수 없어요.");
  if (state.nightSubmittedIds.includes(playerId)) throw new Error("밤 행동을 이미 확정했어요.");
  if (targetId) {
    if (targetId === playerId || !aliveIds(state).includes(targetId)) throw new Error("살아 있는 다른 플레이어를 선택해 주세요.");
    state.nightChoices[playerId] = targetId;
  }
  state.nightSubmittedIds.push(playerId);
}

function resolveNight(state: MafiaState, now = Date.now()) {
  const living = aliveIds(state);
  const mafiaTargets = living.filter((id) => state.players[id].role === "mafia").map((id) => state.nightChoices[id]).filter((id): id is string => Boolean(id));
  const uniqueMafiaTargets = [...new Set(mafiaTargets)];
  const attackTarget = uniqueMafiaTargets.length === 1 ? uniqueMafiaTargets[0] : undefined;
  const doctorId = living.find((id) => state.players[id].role === "doctor");
  const policeId = living.find((id) => state.players[id].role === "police");
  const protectedTarget = doctorId ? state.nightChoices[doctorId] : undefined;
  const victimId = attackTarget && attackTarget !== protectedTarget ? attackTarget : undefined;
  if (victimId) state.players[victimId].alive = false;
  if (policeId && state.nightChoices[policeId]) {
    state.policeResults[policeId] = state.players[state.nightChoices[policeId]!]?.role === "mafia";
  }
  state.nightResult = victimId
    ? { quiet: false, victimId, message: "어젯밤 누군가 사망했습니다." }
    : { quiet: true, message: "어젯밤 아무도 죽지 않았습니다." };
  const winner = checkWinner(state);
  if (winner) finishGame(state, winner);
  else { state.phase = "day_reveal"; state.phaseEndsAt = now + MAFIA_DAY_REVEAL_MS; }
}

export function submitMafiaVote(state: MafiaState, playerId: string, targetId: string, now = Date.now()) {
  if (state.phase !== "vote" || (state.phaseEndsAt ?? 0) <= now) throw new Error("투표 시간이 끝났어요.");
  if (!state.players[playerId]?.alive || state.voteSubmittedIds.includes(playerId)) throw new Error("투표할 수 없어요.");
  if (targetId !== "abstain" && (targetId === playerId || !aliveIds(state).includes(targetId))) throw new Error("살아 있는 다른 플레이어 또는 기권을 선택해 주세요.");
  state.votes[playerId] = targetId;
  state.voteSubmittedIds.push(playerId);
}

function resolveVote(state: MafiaState, now = Date.now()) {
  const counts: Record<string, number> = {};
  for (const voterId of aliveIds(state)) {
    const target = state.votes[voterId];
    if (target && target !== "abstain") counts[target] = (counts[target] ?? 0) + 1;
  }
  const max = Math.max(0, ...Object.values(counts));
  const leaders = Object.entries(counts).filter(([, count]) => count === max && max > 0).map(([id]) => id);
  const executedId = leaders.length === 1 ? leaders[0] : undefined;
  state.execution = executedId
    ? { playerId: executedId, tied: false, message: `${state.participantProfiles.find((p) => p.id === executedId)?.name ?? "누군가"}님이 최후의 변론을 시작합니다.` }
    : { tied: leaders.length > 1, message: leaders.length > 1 ? "동률이라 아무도 처형되지 않았습니다." : "기권표가 많아 아무도 처형되지 않았습니다." };
  if (executedId) {
    state.defensePlayerId = executedId;
    state.verdictVotes = {};
    state.verdictSubmittedIds = [];
    state.phase = "defense";
    state.phaseEndsAt = now + MAFIA_DEFENSE_MS;
    return;
  }
  const winner = checkWinner(state);
  if (winner) finishGame(state, winner);
  else { state.phase = "execution"; state.phaseEndsAt = now + MAFIA_EXECUTION_MS; }
}

export function submitMafiaVerdict(state: MafiaState, playerId: string, choice: "execute" | "spare", now = Date.now()) {
  if (state.phase !== "verdict" || (state.phaseEndsAt ?? 0) <= now) throw new Error("최종 투표 시간이 끝났어요.");
  if (!state.players[playerId]?.alive || state.verdictSubmittedIds.includes(playerId)) throw new Error("최종 투표를 할 수 없어요.");
  state.verdictVotes[playerId] = choice;
  state.verdictSubmittedIds.push(playerId);
}

function resolveVerdict(state: MafiaState, now = Date.now()) {
  const execute = Object.values(state.verdictVotes).filter((choice) => choice === "execute").length;
  const spare = Object.values(state.verdictVotes).filter((choice) => choice === "spare").length;
  const targetId = state.defensePlayerId;
  const willExecute = Boolean(targetId && execute > spare);
  if (willExecute && targetId) {
    state.players[targetId].alive = false;
    state.execution = { playerId: targetId, tied: false, message: `${state.participantProfiles.find((p) => p.id === targetId)?.name ?? "누군가"}님이 처형되었습니다.` };
  } else {
    state.execution = { playerId: targetId, tied: execute === spare, message: `${state.participantProfiles.find((p) => p.id === targetId)?.name ?? "누군가"}님은 살아남았습니다.` };
  }
  const winner = checkWinner(state);
  if (winner) finishGame(state, winner);
  else { state.phase = "execution"; state.phaseEndsAt = now + MAFIA_EXECUTION_MS; }
}

export function shortenMafiaDiscussion(state: MafiaState, playerId: string, now = Date.now()) {
  if (state.phase !== "discussion" || !state.players[playerId]?.alive || state.discussionShortenerIds.includes(playerId)) return false;
  state.discussionShortenerIds.push(playerId);
  state.phaseEndsAt = Math.max(now + 5_000, (state.phaseEndsAt ?? now) - MAFIA_SHORTEN_MS);
  return true;
}

export function shortenMafiaVote(state: MafiaState, playerId: string, now = Date.now()) {
  if (state.phase !== "vote" || !state.players[playerId]?.alive || state.voteShortenerIds.includes(playerId)) return false;
  state.voteShortenerIds.push(playerId);
  state.phaseEndsAt = Math.max(now + 5_000, (state.phaseEndsAt ?? now) - MAFIA_SHORTEN_MS);
  return true;
}

export function advanceMafiaIfDue(state: MafiaState, now = Date.now()) {
  let changed = false;
  while (state.phaseEndsAt && state.phase !== "game_over" && now >= state.phaseEndsAt) {
    changed = true;
    if (state.phase === "role_reveal") { beginNight(state, now); continue; }
    if (state.phase === "night") { resolveNight(state, now); continue; }
    if (state.phase === "day_reveal") { state.phase = "discussion"; state.phaseEndsAt = now + state.discussionSeconds * 1000; continue; }
    if (state.phase === "discussion") { state.phase = "vote"; state.phaseEndsAt = now + MAFIA_VOTE_MS; state.votes = {}; state.voteSubmittedIds = []; continue; }
    if (state.phase === "vote") { resolveVote(state, now); continue; }
    if (state.phase === "defense") { state.phase = "verdict"; state.phaseEndsAt = now + MAFIA_VERDICT_MS; state.verdictVotes = {}; state.verdictSubmittedIds = []; continue; }
    if (state.phase === "verdict") { resolveVerdict(state, now); continue; }
    if (state.phase === "execution") { state.day += 1; beginNight(state, now); continue; }
    break;
  }
  return changed;
}

export function removeMafiaPlayer(state: MafiaState, playerId: string) {
  if (!state.players[playerId]) return;
  state.players[playerId].alive = false;
  const winner = checkWinner(state);
  if (winner) finishGame(state, winner);
}

export function mafiaClientState(state: MafiaState, viewerId?: string): MafiaClientState {
  const me = viewerId ? state.players[viewerId] : undefined;
  const policeResult = viewerId && state.players[viewerId]?.role === "police" && state.nightChoices[viewerId]
    ? { targetId: state.nightChoices[viewerId]!, isMafia: Boolean(state.policeResults[viewerId]) }
    : undefined;
  return {
    phase: state.phase,
    day: state.day,
    phaseEndsAt: state.phaseEndsAt,
    settings: { discussionSeconds: state.discussionSeconds, mafiaCount: state.mafiaCount, policeIncluded: true, doctorIncluded: true },
    participants: state.participantProfiles.map((profile) => ({ ...profile, alive: Boolean(state.players[profile.id]?.alive) })),
    roleReadyCount: state.roleReadyIds.length,
    nightSubmittedCount: state.nightSubmittedIds.length,
    voteSubmittedCount: state.voteSubmittedIds.length,
    verdictSubmittedCount: state.verdictSubmittedIds.length,
    discussionShortenCount: state.discussionShortenerIds.length,
    voteShortenCount: state.voteShortenerIds.length,
    defensePlayerId: state.defensePlayerId,
    nightResult: state.nightResult,
    execution: state.execution,
    winner: state.winner,
    finalRoles: state.phase === "game_over" ? state.revealedRoles : undefined,
    my: {
      role: me?.role ?? "citizen",
      alive: Boolean(me?.alive),
      roleReady: Boolean(viewerId && state.roleReadyIds.includes(viewerId)),
      selectedTarget: viewerId ? state.nightChoices[viewerId] : undefined,
      nightSubmitted: Boolean(viewerId && state.nightSubmittedIds.includes(viewerId)),
      investigation: policeResult,
      vote: viewerId ? state.votes[viewerId] : undefined,
      verdict: viewerId ? state.verdictVotes[viewerId] : undefined,
      discussionShortened: Boolean(viewerId && state.discussionShortenerIds.includes(viewerId)),
      voteShortened: Boolean(viewerId && state.voteShortenerIds.includes(viewerId)),
    },
  };
}

export function handleMafiaAction(state: MafiaState, playerId: string, action: string, payload: Record<string, unknown> = {}, now = Date.now()) {
  advanceMafiaIfDue(state, now);
  if (action === "mafia-tick") return;
  if (action === "mafia-ready") acknowledgeMafiaRole(state, playerId, now);
  else if (action === "mafia-night") submitMafiaNight(state, playerId, payload.targetId ? String(payload.targetId) : undefined, now);
  else if (action === "mafia-vote") submitMafiaVote(state, playerId, String(payload.targetId ?? "abstain"), now);
  else if (action === "mafia-verdict") submitMafiaVerdict(state, playerId, payload.choice === "execute" ? "execute" : "spare", now);
  else if (action === "mafia-shorten-discussion") shortenMafiaDiscussion(state, playerId, now);
  else if (action === "mafia-shorten-vote") shortenMafiaVote(state, playerId, now);
  else throw new Error("지원하지 않는 마피아 행동이에요.");
  advanceMafiaIfDue(state, now);
}
