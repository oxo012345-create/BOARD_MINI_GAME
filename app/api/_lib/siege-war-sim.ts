/**
 * 2대2 3라인 공성전 — pure combat simulation.
 *
 * Deliberately free of any Durable Object, D1, DOM or timer dependency so it can
 * run headless in tests and in a batch balance harness. The Durable Object owns
 * the clock and the sockets; this module owns nothing but the battlefield.
 *
 * Design notes that matter if you change anything here:
 * - Fixed timestep. `DT` is a constant, never a measured delta, so a replay of
 *   the same inputs always produces the same battle.
 * - Structure-of-arrays over typed arrays, allocated once. The tick loop must
 *   not allocate: GC pauses are what blow a per-tick CPU budget.
 * - Units live in per-lane, per-team buckets kept sorted by lane position. That
 *   single invariant makes "nearest enemy" a monotonic two-pointer sweep
 *   (amortized O(1) per unit) instead of an O(n²) scan.
 */

export const LANE_COUNT = 3;
export const TICK_MS = 100;
export const DT = TICK_MS / 1000;

/**
 * Lane positions are integer millimetres, not floats.
 *
 * The battlefield is mirrored: team 0 accumulates position upward from its gate
 * while team 1 accumulates downward from the opposite end. In floating point
 * those two accumulations do not land on bit-identical values, so a unit sitting
 * *exactly* at the edge of its attack range would pass the `<= range` test on one
 * side and fail it on the other — a tiny discrepancy that compounds into a
 * measurable win-rate bias. Every speed and range in this game is a whole number
 * of millimetres per tick, so integers remove the problem outright rather than
 * papering over it with an epsilon.
 */
export const MM = 1000;
export const LANE_LENGTH_MM = 60 * MM;
export const LANE_LENGTH = 60;
export const SPAWN_OFFSET_MM = 1_500;

export const MAX_UNITS = 256;
export const MAX_UNITS_PER_TEAM = 100;
export const MAX_UNITS_PER_LANE = 45;

export const GATE_MAX_HP = 1000;
export const MATCH_MS = 120_000;
export const SUDDEN_DEATH_MS = 60_000;
/** Total assault begins with 60s left, i.e. 60s into the match. */
export const ASSAULT_AT_MS = 60_000;
/** Anti-macro floor kept even when the nominal cooldown reaches zero. */
export const MIN_SPAWN_INTERVAL_MS = 120;

export const UNIT_SOLDIER = 0;
export const UNIT_ARCHER = 1;
export const UNIT_RAM = 2;
export type UnitType = 0 | 1 | 2;

export const STATE_MOVE = 0;
export const STATE_ATTACK = 1;
export const STATE_ATTACK_GATE = 2;

export type UnitStats = {
  hp: number; attack: number; attackInterval: number;
  /** metres per second — the readable form; `stepMm` is what the sim uses. */
  speed: number;
  /** metres — the readable form; `rangeMm` is what the sim uses. */
  range: number;
  /** millimetres travelled per tick. Whole numbers by construction. */
  stepMm: number;
  rangeMm: number;
  cooldownMs: number; assaultCooldownMs: number;
};

const unitStat = (
  hp: number, attack: number, attackInterval: number, speed: number, range: number,
  cooldownMs: number, assaultCooldownMs: number,
): UnitStats => {
  const stepMm = speed * MM * DT;
  const rangeMm = range * MM;
  if (!Number.isInteger(stepMm) || !Number.isInteger(rangeMm)) {
    throw new Error(`siege-war: speed ${speed} / range ${range} must be whole millimetres per tick`);
  }
  return { hp, attack, attackInterval, speed, range, stepMm, rangeMm, cooldownMs, assaultCooldownMs };
};

export const UNIT_STATS: readonly UnitStats[] = [
  unitStat(20, 10, 0.55, 6.0, 2.0, 350, 0),
  unitStat(10, 5, 0.90, 4.5, 9.0, 1200, 0),
  unitStat(60, 30, 1.40, 2.5, 3.0, 5500, 5500),
];

export const PHASE_PLAYING = 0;
export const PHASE_SUDDEN_DEATH = 1;
export const PHASE_ENDED = 2;

export const EVENT_SPAWN = 0;
export const EVENT_DEATH = 1;
export const EVENT_GATE_HIT = 2;
export const EVENT_GATE_BREAK = 3;

export type SimEvent = { unitId: number; kind: number; lane: number; team: number };

export type SimResult = { winner: 0 | 1 | -1; reason: "gate" | "timeout"; brokenLane: number };

export type SimState = {
  tick: number;
  elapsedMs: number;
  phase: number;
  assaultActive: boolean;
  suddenDeathApplied: boolean;
  result?: SimResult;

  /** Slot-indexed unit columns. A slot is stable for a unit's whole life. */
  id: Uint16Array;
  /** Lane position in integer millimetres. See the note on `MM`. */
  y: Int32Array;
  xoff: Float32Array;
  hp: Int16Array;
  lane: Uint8Array;
  team: Uint8Array;
  type: Uint8Array;
  atkCd: Float32Array;
  state: Uint8Array;
  alive: Uint8Array;

  /**
   * Per-team spawn ordinal. Used as the final targeting tie-break because it is
   * the only total order available that mirrors between the teams: bucket order
   * cannot be used, since ascending position means "rear to front" for one team
   * and "front to rear" for the other.
   */
  seq: Int32Array;
  teamSeq: Int32Array;

  /** Slot free list. */
  freeSlots: Uint16Array;
  freeCount: number;
  nextUnitId: number;
  liveCount: number;
  teamCount: Int32Array;

  /** buckets[team * LANE_COUNT + lane] holds live slots sorted by ascending y. */
  buckets: Uint16Array[];
  bucketLen: Int32Array;

  /** Scratch, reused every tick. Never read across ticks. */
  target: Int32Array;
  /**
   * Damage is accumulated during the update pass and applied afterwards so that
   * both teams resolve simultaneously. Applying damage inline gives whichever
   * team is iterated first a compounding advantage — a mirrored lane would
   * reliably break the second team's gate.
   */
  pendingDamage: Int32Array;
  pendingGateDamage: Int32Array;

  gateHp: Int32Array;
  events: SimEvent[];
  rngState: number;
};

/** Team 0 defends y=0 and advances +y; team 1 defends the far end. Millimetres. */
export const gateY = (team: number) => (team === 0 ? 0 : LANE_LENGTH_MM);
export const advanceDir = (team: number) => (team === 0 ? 1 : -1);
const bucketIndex = (team: number, lane: number) => team * LANE_COUNT + lane;

/** xorshift32 — deterministic lateral jitter without touching Math.random. */
function nextRandom(state: SimState) {
  let x = state.rngState;
  x ^= x << 13; x >>>= 0;
  x ^= x >> 17;
  x ^= x << 5; x >>>= 0;
  state.rngState = x || 1;
  return x / 0x1_0000_0000;
}

export function createSimState(seed = 0x2f6e2b1): SimState {
  const freeSlots = new Uint16Array(MAX_UNITS);
  for (let slot = 0; slot < MAX_UNITS; slot += 1) freeSlots[slot] = MAX_UNITS - 1 - slot;
  return {
    tick: 0,
    elapsedMs: 0,
    phase: PHASE_PLAYING,
    assaultActive: false,
    suddenDeathApplied: false,
    id: new Uint16Array(MAX_UNITS),
    y: new Int32Array(MAX_UNITS),
    xoff: new Float32Array(MAX_UNITS),
    hp: new Int16Array(MAX_UNITS),
    lane: new Uint8Array(MAX_UNITS),
    team: new Uint8Array(MAX_UNITS),
    type: new Uint8Array(MAX_UNITS),
    atkCd: new Float32Array(MAX_UNITS),
    state: new Uint8Array(MAX_UNITS),
    alive: new Uint8Array(MAX_UNITS),
    seq: new Int32Array(MAX_UNITS),
    teamSeq: new Int32Array(2),
    freeSlots,
    freeCount: MAX_UNITS,
    nextUnitId: 1,
    liveCount: 0,
    teamCount: new Int32Array(2),
    buckets: Array.from({ length: 2 * LANE_COUNT }, () => new Uint16Array(MAX_UNITS)),
    bucketLen: new Int32Array(2 * LANE_COUNT),
    target: new Int32Array(MAX_UNITS),
    pendingDamage: new Int32Array(MAX_UNITS),
    pendingGateDamage: new Int32Array(2 * LANE_COUNT),
    gateHp: new Int32Array([GATE_MAX_HP, GATE_MAX_HP, GATE_MAX_HP, GATE_MAX_HP, GATE_MAX_HP, GATE_MAX_HP]),
    events: [],
    rngState: seed || 1,
  };
}

/** gateHp is laid out [team0 L,C,R, team1 L,C,R]. */
export const gateIndex = (team: number, lane: number) => team * LANE_COUNT + lane;

export function laneUnitCount(state: SimState, team: number, lane: number) {
  return state.bucketLen[bucketIndex(team, lane)];
}

export type SpawnRejection = "phase" | "team-full" | "lane-full" | "no-slot";

/**
 * Places one unit. Cooldown ownership lives with the caller (the Durable Object
 * tracks per-player cooldowns); this only enforces the battlefield's own caps.
 */
export function spawnUnit(state: SimState, team: number, lane: number, type: UnitType): SpawnRejection | undefined {
  if (state.phase === PHASE_ENDED) return "phase";
  if (state.teamCount[team] >= MAX_UNITS_PER_TEAM) return "team-full";
  if (state.bucketLen[bucketIndex(team, lane)] >= MAX_UNITS_PER_LANE) return "lane-full";
  if (!state.freeCount) return "no-slot";

  const slot = state.freeSlots[--state.freeCount];
  const stats = UNIT_STATS[type];
  const unitId = state.nextUnitId;
  state.nextUnitId = state.nextUnitId >= 65_535 ? 1 : state.nextUnitId + 1;

  state.id[slot] = unitId;
  state.y[slot] = gateY(team) + advanceDir(team) * SPAWN_OFFSET_MM;
  state.xoff[slot] = (nextRandom(state) - 0.5) * 2.4;
  // Sudden death spawns join the 1 HP world rather than being born tougher than
  // everything already on the field.
  state.hp[slot] = state.phase === PHASE_SUDDEN_DEATH ? 1 : stats.hp;
  state.lane[slot] = lane;
  state.team[slot] = team;
  state.type[slot] = type;
  state.atkCd[slot] = 0;
  state.state[slot] = STATE_MOVE;
  state.alive[slot] = 1;
  state.pendingDamage[slot] = 0;
  state.seq[slot] = state.teamSeq[team];
  state.teamSeq[team] += 1;

  const bucket = bucketIndex(team, lane);
  insertSorted(state, bucket, slot);
  state.teamCount[team] += 1;
  state.liveCount += 1;
  state.events.push({ unitId, kind: EVENT_SPAWN, lane, team });
  return undefined;
}

/** Spawn position is always at one end, so the insertion point is an end too. */
function insertSorted(state: SimState, bucket: number, slot: number) {
  const list = state.buckets[bucket];
  const length = state.bucketLen[bucket];
  const value = state.y[slot];
  let index = length;
  while (index > 0 && state.y[list[index - 1]] > value) {
    list[index] = list[index - 1];
    index -= 1;
  }
  list[index] = slot;
  state.bucketLen[bucket] = length + 1;
}

/**
 * Insertion sort over an almost-sorted bucket. Same-type units share a speed and
 * move at most 0.6m per tick, so ordering is rarely violated and this is ~n
 * comparisons with almost no swaps. `Array.prototype.sort` is avoided because it
 * allocates and calls a comparator per comparison.
 */
function sortBucket(state: SimState, bucket: number) {
  const list = state.buckets[bucket];
  const length = state.bucketLen[bucket];
  const y = state.y;
  for (let index = 1; index < length; index += 1) {
    const slot = list[index];
    const value = y[slot];
    let scan = index - 1;
    while (scan >= 0 && y[list[scan]] > value) {
      list[scan + 1] = list[scan];
      scan -= 1;
    }
    list[scan + 1] = slot;
  }
}

/**
 * Nearest-enemy for every unit in `fromBucket`, using a cursor into `toBucket`
 * that only ever moves forward. Valid because both buckets are sorted by y, so
 * as the source position increases the nearest target index is non-decreasing.
 */
function sweepNearest(state: SimState, fromBucket: number, toBucket: number) {
  const from = state.buckets[fromBucket];
  const to = state.buckets[toBucket];
  const fromLen = state.bucketLen[fromBucket];
  const toLen = state.bucketLen[toBucket];
  const y = state.y;
  const target = state.target;

  if (!toLen) {
    for (let index = 0; index < fromLen; index += 1) target[from[index]] = -1;
    return;
  }
  // Descent and tie-breaking must stay separate. The gap sequence is only
  // *weakly* V-shaped: stacked units create flat runs, so a descent that stops on
  // a tie can halt on a plateau long before the real minimum (gaps 30, 30, 10
  // would settle for 30). Always cross plateaus with `<=`, which lands on the
  // last index of the minimal run, then resolve the run separately.
  //
  // The tie-break must not look at bucket order. Bucket order is reversed between
  // the teams — units that converge on one position end up ordered by spawn time
  // ascending for one team and descending for the other — so picking "an end of
  // the run" makes the two teams focus different targets and hands one side a
  // measurable win-rate edge. Break ties on physical, mirror-invariant state
  // instead: finish the most wounded, then the one closest to firing.
  let cursor = 0;
  for (let index = 0; index < fromLen; index += 1) {
    const slot = from[index];
    const position = y[slot];
    while (cursor + 1 < toLen && Math.abs(y[to[cursor + 1]] - position) <= Math.abs(y[to[cursor]] - position)) {
      cursor += 1;
    }
    // `cursor` is shared and must stay monotonic, so scan the run without moving it.
    const best = Math.abs(y[to[cursor]] - position);
    let chosen = to[cursor];
    for (let scan = cursor - 1; scan >= 0 && Math.abs(y[to[scan]] - position) === best; scan -= 1) {
      const candidate = to[scan];
      if (state.hp[candidate] !== state.hp[chosen]) {
        if (state.hp[candidate] < state.hp[chosen]) chosen = candidate;
        continue;
      }
      if (state.atkCd[candidate] !== state.atkCd[chosen]) {
        if (state.atkCd[candidate] < state.atkCd[chosen]) chosen = candidate;
        continue;
      }
      if (state.seq[candidate] < state.seq[chosen]) chosen = candidate;
    }
    target[slot] = chosen;
  }
}

/**
 * Rams must not turn around to chase something they already passed while a wall
 * of bodies stands in front of them, so they target the nearest enemy *ahead*.
 */
function sweepNearestAhead(state: SimState, fromBucket: number, toBucket: number, team: number) {
  const from = state.buckets[fromBucket];
  const to = state.buckets[toBucket];
  const fromLen = state.bucketLen[fromBucket];
  const toLen = state.bucketLen[toBucket];
  const y = state.y;
  const target = state.target;
  const forward = advanceDir(team) > 0;

  if (forward) {
    let cursor = 0;
    for (let index = 0; index < fromLen; index += 1) {
      const slot = from[index];
      if (state.type[slot] !== UNIT_RAM) continue;
      while (cursor < toLen && y[to[cursor]] < y[slot]) cursor += 1;
      target[slot] = cursor < toLen ? to[cursor] : -1;
    }
    return;
  }
  // Team 1 walks toward decreasing y, so scan its bucket from the far end.
  let cursor = toLen - 1;
  for (let index = fromLen - 1; index >= 0; index -= 1) {
    const slot = from[index];
    if (state.type[slot] !== UNIT_RAM) continue;
    while (cursor >= 0 && y[to[cursor]] > y[slot]) cursor -= 1;
    target[slot] = cursor >= 0 ? to[cursor] : -1;
  }
}

function applySuddenDeath(state: SimState) {
  for (let bucket = 0; bucket < state.buckets.length; bucket += 1) {
    const list = state.buckets[bucket];
    const length = state.bucketLen[bucket];
    for (let index = 0; index < length; index += 1) state.hp[list[index]] = 1;
  }
  state.suddenDeathApplied = true;
}

function endMatch(state: SimState, result: SimResult) {
  state.phase = PHASE_ENDED;
  state.result = result;
}

/** Advances exactly one fixed timestep. Returns the events produced this tick. */
export function stepSim(state: SimState): SimEvent[] {
  state.events.length = 0;
  if (state.phase === PHASE_ENDED) return state.events;

  state.tick += 1;
  state.elapsedMs = state.tick * TICK_MS;

  if (!state.assaultActive && state.elapsedMs >= ASSAULT_AT_MS) state.assaultActive = true;
  if (state.phase === PHASE_PLAYING && state.elapsedMs >= MATCH_MS) {
    state.phase = PHASE_SUDDEN_DEATH;
    applySuddenDeath(state);
  }
  if (state.phase === PHASE_SUDDEN_DEATH && state.elapsedMs >= MATCH_MS + SUDDEN_DEATH_MS) {
    endMatch(state, { winner: -1, reason: "timeout", brokenLane: -1 });
    return state.events;
  }

  // Buckets are sorted on entry: `spawnUnit` inserts in order and every tick
  // restores the invariant before returning, so the sweeps below can rely on it
  // without sorting first.
  for (let lane = 0; lane < LANE_COUNT; lane += 1) {
    const bucketA = bucketIndex(0, lane);
    const bucketB = bucketIndex(1, lane);
    sweepNearest(state, bucketA, bucketB);
    sweepNearest(state, bucketB, bucketA);
    sweepNearestAhead(state, bucketA, bucketB, 0);
    sweepNearestAhead(state, bucketB, bucketA, 1);
  }

  // Two phases, deliberately. Every unit decides against the *same* start-of-tick
  // snapshot of the battlefield, and only then does anything move. Deciding and
  // moving in one pass lets the team iterated second react to the first team's
  // already-updated positions, which is a systematic advantage that decides
  // mirrored matches.
  for (let lane = 0; lane < LANE_COUNT; lane += 1) {
    for (let team = 0; team < 2; team += 1) decideBucket(state, bucketIndex(team, lane), team, lane);
  }
  applyPendingDamage(state);
  for (let lane = 0; lane < LANE_COUNT; lane += 1) {
    for (let team = 0; team < 2; team += 1) moveBucket(state, bucketIndex(team, lane), team);
  }
  compactDead(state);
  // Movement can reorder a bucket because unit types travel at different speeds
  // (a soldier overtakes a ram), so re-establish the ordering now rather than at
  // the head of the next tick. That keeps the invariant true for the serializer
  // and the renderer as well as for the next tick's sweeps.
  for (let bucket = 0; bucket < state.buckets.length; bucket += 1) sortBucket(state, bucket);

  if (state.phase !== PHASE_ENDED) {
    for (let team = 0; team < 2; team += 1) {
      for (let lane = 0; lane < LANE_COUNT; lane += 1) {
        if (state.gateHp[gateIndex(team, lane)] > 0) continue;
        // A single broken gate loses the match outright — this is not a sum.
        endMatch(state, { winner: team === 0 ? 1 : 0, reason: "gate", brokenLane: lane });
        return state.events;
      }
    }
  }
  return state.events;
}

/** Phase A — read-only over positions: choose a state and bank any damage. */
function decideBucket(state: SimState, bucket: number, team: number, lane: number) {
  const list = state.buckets[bucket];
  const length = state.bucketLen[bucket];
  const enemyGate = gateY(team === 0 ? 1 : 0);
  const enemyGateSlot = gateIndex(team === 0 ? 1 : 0, lane);

  for (let index = 0; index < length; index += 1) {
    const slot = list[index];
    if (!state.alive[slot]) continue;
    const type = state.type[slot];
    const stats = UNIT_STATS[type];

    if (state.atkCd[slot] > 0) {
      state.atkCd[slot] -= DT;
      if (state.atkCd[slot] < 0) state.atkCd[slot] = 0;
    }

    const targetSlot = state.target[slot];
    const hasTarget = targetSlot >= 0 && state.alive[targetSlot] === 1;
    const distance = hasTarget ? Math.abs(state.y[targetSlot] - state.y[slot]) : Infinity;

    if (hasTarget && distance <= stats.rangeMm) {
      state.state[slot] = STATE_ATTACK;
      if (state.atkCd[slot] <= 0) {
        state.pendingDamage[targetSlot] += stats.attack;
        state.atkCd[slot] = stats.attackInterval;
      }
      continue;
    }

    const gateDistance = Math.abs(enemyGate - state.y[slot]);
    if (gateDistance <= stats.rangeMm && state.gateHp[enemyGateSlot] > 0) {
      state.state[slot] = STATE_ATTACK_GATE;
      if (state.atkCd[slot] <= 0) {
        state.pendingGateDamage[enemyGateSlot] += stats.attack;
        state.atkCd[slot] = stats.attackInterval;
        state.events.push({ unitId: state.id[slot], kind: EVENT_GATE_HIT, lane, team });
      }
      continue;
    }

    state.state[slot] = STATE_MOVE;
  }
}

/** Phase B — the only place a position changes. */
function moveBucket(state: SimState, bucket: number, team: number) {
  const list = state.buckets[bucket];
  const length = state.bucketLen[bucket];
  const direction = advanceDir(team);
  for (let index = 0; index < length; index += 1) {
    const slot = list[index];
    if (!state.alive[slot] || state.state[slot] !== STATE_MOVE) continue;
    const next = state.y[slot] + direction * UNIT_STATS[state.type[slot]].stepMm;
    state.y[slot] = next < 0 ? 0 : next > LANE_LENGTH_MM ? LANE_LENGTH_MM : next;
  }
}

/**
 * Resolves one tick's damage for both teams at once. Two units that would kill
 * each other on the same tick both die — deliberately, because the alternative
 * is deciding it by iteration order, which is a hidden team bias.
 */
function applyPendingDamage(state: SimState) {
  for (let bucket = 0; bucket < state.buckets.length; bucket += 1) {
    const list = state.buckets[bucket];
    const length = state.bucketLen[bucket];
    for (let index = 0; index < length; index += 1) {
      const slot = list[index];
      const damage = state.pendingDamage[slot];
      if (!damage) continue;
      state.pendingDamage[slot] = 0;
      state.hp[slot] -= damage;
      if (state.hp[slot] <= 0) state.alive[slot] = 0;
    }
  }
  for (let gate = 0; gate < state.gateHp.length; gate += 1) {
    const damage = state.pendingGateDamage[gate];
    if (!damage) continue;
    state.pendingGateDamage[gate] = 0;
    if (state.gateHp[gate] <= 0) continue;
    state.gateHp[gate] -= damage;
    if (state.gateHp[gate] > 0) continue;
    state.gateHp[gate] = 0;
    const team = Math.floor(gate / LANE_COUNT);
    state.events.push({ unitId: 0, kind: EVENT_GATE_BREAK, lane: gate % LANE_COUNT, team });
  }
}

/** Single pass per bucket: rewrite live slots, release dead ones. */
function compactDead(state: SimState) {
  for (let bucket = 0; bucket < state.buckets.length; bucket += 1) {
    const list = state.buckets[bucket];
    const length = state.bucketLen[bucket];
    let write = 0;
    for (let read = 0; read < length; read += 1) {
      const slot = list[read];
      if (state.alive[slot]) { list[write] = slot; write += 1; continue; }
      state.events.push({ unitId: state.id[slot], kind: EVENT_DEATH, lane: state.lane[slot], team: state.team[slot] });
      state.teamCount[state.team[slot]] -= 1;
      state.liveCount -= 1;
      state.freeSlots[state.freeCount] = slot;
      state.freeCount += 1;
    }
    state.bucketLen[bucket] = write;
  }
}

/** Milliseconds of cooldown for a unit type, honouring the assault phase. */
export function spawnCooldownMs(type: UnitType, assaultActive: boolean) {
  const stats = UNIT_STATS[type];
  return Math.max(assaultActive ? stats.assaultCooldownMs : stats.cooldownMs, MIN_SPAWN_INTERVAL_MS);
}

export function remainingMs(state: SimState) {
  const total = state.phase === PHASE_SUDDEN_DEATH ? MATCH_MS + SUDDEN_DEATH_MS : MATCH_MS;
  return Math.max(0, total - state.elapsedMs);
}
