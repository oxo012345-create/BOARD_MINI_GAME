/**
 * 2대2 3라인 공성전 — room-level state.
 *
 * Deliberately tiny. The live battle lives entirely inside the `SiegeRoom`
 * Durable Object; what is stored on the room in D1 is only what a REST poller
 * needs: who is on which team, when the match started, and the final result.
 * Nothing here is written per tick.
 *
 * The combat rules live in `./siege-war-sim`.
 */
import { GATE_MAX_HP, LANE_COUNT } from "./siege-war-sim";

export type SiegeTeam = "A" | "B";

export type SiegeWarResult = {
  winner: SiegeTeam | "draw";
  reason: "gate" | "timeout";
  /** Lane whose gate fell, or -1 for a draw. */
  brokenLane: number;
  gateHp: Record<SiegeTeam, number[]>;
  unitsSpawned: Record<string, number>;
  durationMs: number;
};

export type SiegeWarState = {
  version: 1;
  startedAt: number;
  /** Player ids per team. Team A renders on side 0, team B on side 1. */
  teams: Record<SiegeTeam, string[]>;
  /** Debug-only bot slots that fill empty seats. */
  bots: number;
  botIds: string[];
  result?: SiegeWarResult;
};

export type SiegeWarClientState = {
  version: 1;
  startedAt: number;
  teams: Record<SiegeTeam, string[]>;
  bots: number;
  botIds: string[];
  myTeam?: SiegeTeam;
  result?: SiegeWarResult;
};

export const SIEGE_REQUIRED_PLAYERS = 4;
export const SIEGE_TEAM_LABEL: Record<SiegeTeam, string> = { A: "파란팀", B: "빨간팀" };

const emptyGates = () => Array.from({ length: LANE_COUNT }, () => GATE_MAX_HP);

/**
 * Splits players into two sides by join order. The sim is provably side-neutral
 * (mirrored play always draws), so which side a team gets carries no advantage
 * and does not need randomising.
 */
export function assignSiegeTeams(playerIds: string[]): Record<SiegeTeam, string[]> {
  const half = Math.ceil(playerIds.length / 2);
  return { A: playerIds.slice(0, half), B: playerIds.slice(half) };
}

/** Rotates the roster so the host can re-pair a lopsided table in one tap. */
export function shuffleSiegeTeams(current: Record<SiegeTeam, string[]>): Record<SiegeTeam, string[]> {
  const roster = [...current.A, ...current.B];
  if (roster.length < 2) return { A: [...current.A], B: [...current.B] };
  roster.push(roster.shift()!);
  return assignSiegeTeams(roster);
}

export function siegeTeamOf(state: SiegeWarState, playerId: string): SiegeTeam | undefined {
  if (state.teams.A.includes(playerId)) return "A";
  if (state.teams.B.includes(playerId)) return "B";
  return undefined;
}

export function createSiegeWarState(
  playerIds: string[],
  options: { teams?: Record<SiegeTeam, string[]>; bots?: number } = {},
): SiegeWarState {
  const botCount = Math.max(0, Math.min(3, Math.floor(options.bots ?? 0)));
  const botIds = Array.from({ length: botCount }, (_, index) => `siege-bot-${index + 1}`);
  const seats = [...playerIds, ...botIds];
  if (seats.length !== SIEGE_REQUIRED_PLAYERS) {
    throw new Error("2대2 공성전은 정확히 4자리가 필요해요.");
  }
  const provided = options.teams;
  const usable = provided
    && [...provided.A, ...provided.B].length === seats.length
    && [...provided.A, ...provided.B].every((id) => seats.includes(id));
  return {
    version: 1,
    startedAt: Date.now(),
    teams: usable ? { A: [...provided.A], B: [...provided.B] } : assignSiegeTeams(seats),
    bots: botCount,
    botIds,
    result: undefined,
  };
}

export function siegeWarClientState(state: SiegeWarState, viewerId?: string): SiegeWarClientState {
  return {
    version: 1,
    startedAt: state.startedAt,
    teams: { A: [...state.teams.A], B: [...state.teams.B] },
    bots: state.bots,
    botIds: [...state.botIds],
    myTeam: viewerId ? siegeTeamOf(state, viewerId) : undefined,
    result: state.result,
  };
}

/** Used when a match has to be closed out without the Durable Object's help. */
export function siegeTimeoutResult(startedAt: number): SiegeWarResult {
  return {
    winner: "draw",
    reason: "timeout",
    brokenLane: -1,
    gateHp: { A: emptyGates(), B: emptyGates() },
    unitsSpawned: {},
    durationMs: Math.max(0, Date.now() - startedAt),
  };
}
