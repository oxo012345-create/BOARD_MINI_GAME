import assert from "node:assert/strict";
import {
  ASSAULT_AT_MS, DT, GATE_MAX_HP, LANE_LENGTH_MM, MM, MATCH_MS, MAX_UNITS_PER_LANE, MAX_UNITS_PER_TEAM,
  MIN_SPAWN_INTERVAL_MS, PHASE_ENDED, PHASE_SUDDEN_DEATH, STATE_ATTACK, STATE_ATTACK_GATE, SUDDEN_DEATH_MS,
  TICK_MS, UNIT_ARCHER, UNIT_RAM, UNIT_SOLDIER, UNIT_STATS,
  createSimState, gateIndex, laneUnitCount, spawnCooldownMs, spawnUnit, stepSim,
  type SimState, type UnitType,
} from "../app/api/_lib/siege-war-sim";

const test = (name: string, run: () => void) => {
  run();
  console.log(`✓ ${name}`);
};

const runTicks = (state: SimState, ticks: number) => {
  for (let index = 0; index < ticks; index += 1) stepSim(state);
};

/** Finds the live slot for a unit id, or -1. */
function slotOf(state: SimState, unitId: number) {
  for (let slot = 0; slot < state.alive.length; slot += 1) {
    if (state.alive[slot] && state.id[slot] === unitId) return slot;
  }
  return -1;
}

function spawnAndFindSlot(state: SimState, team: number, lane: number, type: UnitType) {
  const rejection = spawnUnit(state, team, lane, type);
  assert.equal(rejection, undefined, `spawn rejected: ${rejection}`);
  const spawned = state.events.filter((event) => event.kind === 0);
  return slotOf(state, spawned[spawned.length - 1].unitId);
}

test("RULE — a single broken gate loses the match outright, not a summed HP pool", () => {
  const state = createSimState();
  // Two gates untouched, one emptied: the team must still lose immediately.
  state.gateHp[gateIndex(1, 2)] = UNIT_STATS[UNIT_SOLDIER].attack;
  const slot = spawnAndFindSlot(state, 0, 2, UNIT_SOLDIER);
  state.y[slot] = LANE_LENGTH_MM - 1 * MM;

  runTicks(state, 3);
  assert.equal(state.gateHp[gateIndex(1, 2)], 0);
  assert.equal(state.phase, PHASE_ENDED);
  assert.equal(state.result?.winner, 0);
  assert.equal(state.result?.reason, "gate");
  assert.equal(state.result?.brokenLane, 2);
  assert.equal(state.gateHp[gateIndex(1, 0)], GATE_MAX_HP, "other gates stay untouched");
});

test("RULE — units damage the gate with their own attack value, no separate siege stat", () => {
  for (const type of [UNIT_SOLDIER, UNIT_ARCHER, UNIT_RAM] as UnitType[]) {
    const state = createSimState();
    const slot = spawnAndFindSlot(state, 0, 1, type);
    state.y[slot] = LANE_LENGTH_MM - 0.5 * MM;
    stepSim(state);
    assert.equal(state.state[slot], STATE_ATTACK_GATE);
    assert.equal(
      state.gateHp[gateIndex(1, 1)],
      GATE_MAX_HP - UNIT_STATS[type].attack,
      `unit type ${type} must hit the gate for exactly its attack value`,
    );
  }
});

test("RULE — archers meaningfully outrange soldiers", () => {
  assert.ok(UNIT_STATS[UNIT_ARCHER].range > UNIT_STATS[UNIT_SOLDIER].range * 4);

  const state = createSimState();
  const archer = spawnAndFindSlot(state, 0, 0, UNIT_ARCHER);
  const enemy = spawnAndFindSlot(state, 1, 0, UNIT_SOLDIER);
  state.y[archer] = 20 * MM;
  state.y[enemy] = 20 * MM + UNIT_STATS[UNIT_ARCHER].rangeMm - 0.5 * MM;
  const enemyHpBefore = state.hp[enemy];

  stepSim(state);
  assert.equal(state.state[archer], STATE_ATTACK, "archer engages from beyond soldier reach");
  assert.equal(state.hp[enemy], enemyHpBefore - UNIT_STATS[UNIT_ARCHER].attack);
  assert.equal(state.state[enemy], 0, "the soldier is still closing, not attacking");
});

test("RULE — a ram is blocked by enemy bodies and cannot walk past them", () => {
  const state = createSimState();
  const ram = spawnAndFindSlot(state, 0, 1, UNIT_RAM);
  const blocker = spawnAndFindSlot(state, 1, 1, UNIT_SOLDIER);
  state.y[ram] = 20 * MM;
  state.y[blocker] = 22 * MM;
  state.hp[blocker] = 30_000; // keep the wall standing for the whole observation

  const startY = state.y[ram];
  runTicks(state, 20);
  assert.equal(state.state[ram], STATE_ATTACK, "a blocked ram attacks instead of advancing");
  assert.ok(state.y[ram] <= startY, `ram advanced past its blocker (${startY} -> ${state.y[ram]})`);
  assert.ok(state.y[ram] < state.y[blocker], "ram never crosses the blocker");
  assert.ok(state.hp[blocker] < 30_000, "the ram is chewing through the blocker");
});

test("RULE — a ram ignores enemies it has already passed and keeps pushing forward", () => {
  const state = createSimState();
  const ram = spawnAndFindSlot(state, 0, 1, UNIT_RAM);
  const behind = spawnAndFindSlot(state, 1, 1, UNIT_SOLDIER);
  state.y[ram] = 30 * MM;
  state.y[behind] = 29 * MM; // 1m behind — well inside the ram's 3m reach
  state.hp[behind] = 30_000;

  const startY = state.y[ram];
  runTicks(state, 10);
  assert.ok(state.y[ram] > startY, "ram advances rather than turning on a unit behind it");
  assert.equal(state.hp[behind], 30_000, "ram does not attack backwards");
});

test("RULE — non-ram units target the nearest enemy even if it is behind them", () => {
  const state = createSimState();
  const soldier = spawnAndFindSlot(state, 0, 0, UNIT_SOLDIER);
  const behind = spawnAndFindSlot(state, 1, 0, UNIT_SOLDIER);
  const ahead = spawnAndFindSlot(state, 1, 0, UNIT_SOLDIER);
  state.y[soldier] = 30 * MM;
  state.y[behind] = 29 * MM;   // 1m away
  state.y[ahead] = 34 * MM;    // 4m away
  state.hp[behind] = 30_000;
  state.hp[ahead] = 30_000;

  stepSim(state);
  assert.equal(state.state[soldier], STATE_ATTACK);
  assert.ok(state.hp[behind] < 30_000, "nearest enemy was the one behind");
  assert.equal(state.hp[ahead], 30_000);
});

test("RULE — sudden death drops every unit to 1 HP, including later spawns", () => {
  const state = createSimState();
  const veteran = spawnAndFindSlot(state, 0, 0, UNIT_RAM);
  assert.equal(state.hp[veteran], UNIT_STATS[UNIT_RAM].hp);
  // Hold the gates open: a lone unopposed ram would otherwise break through at
  // roughly 70s and end the match before sudden death ever arrives.
  for (let tick = 0; tick < MATCH_MS / TICK_MS; tick += 1) {
    for (let gate = 0; gate < 6; gate += 1) state.gateHp[gate] = GATE_MAX_HP;
    stepSim(state);
  }
  assert.equal(state.phase, PHASE_SUDDEN_DEATH);
  assert.equal(state.hp[veteran], 1, "existing units are reduced to 1 HP");

  const recruit = spawnAndFindSlot(state, 1, 0, UNIT_RAM);
  assert.equal(state.hp[recruit], 1, "sudden-death spawns are not born tougher than the field");
});

test("RULE — an unresolved sudden death ends in a draw at the 180s mark", () => {
  const state = createSimState();
  runTicks(state, (MATCH_MS + SUDDEN_DEATH_MS) / TICK_MS);
  assert.equal(state.phase, PHASE_ENDED);
  assert.equal(state.result?.winner, -1);
  assert.equal(state.result?.reason, "timeout");
});

test("RULE — total assault zeroes soldier/archer cooldowns but never the ram's", () => {
  assert.equal(spawnCooldownMs(UNIT_SOLDIER, false), 350);
  assert.equal(spawnCooldownMs(UNIT_ARCHER, false), 1200);
  assert.equal(spawnCooldownMs(UNIT_RAM, false), 5500);
  // The 0.12s anti-macro floor replaces a literal zero.
  assert.equal(spawnCooldownMs(UNIT_SOLDIER, true), MIN_SPAWN_INTERVAL_MS);
  assert.equal(spawnCooldownMs(UNIT_ARCHER, true), MIN_SPAWN_INTERVAL_MS);
  assert.equal(spawnCooldownMs(UNIT_RAM, true), 5500, "the ram cooldown survives the assault");

  const state = createSimState();
  assert.equal(state.assaultActive, false);
  runTicks(state, ASSAULT_AT_MS / TICK_MS);
  assert.equal(state.assaultActive, true, "assault begins with 60s left");
});

test("RULE — team and lane caps hold, and a rejected spawn frees no slot", () => {
  const state = createSimState();
  for (let index = 0; index < MAX_UNITS_PER_LANE; index += 1) {
    assert.equal(spawnUnit(state, 0, 0, UNIT_SOLDIER), undefined);
  }
  assert.equal(laneUnitCount(state, 0, 0), MAX_UNITS_PER_LANE);
  assert.equal(spawnUnit(state, 0, 0, UNIT_SOLDIER), "lane-full");
  assert.equal(laneUnitCount(state, 0, 0), MAX_UNITS_PER_LANE, "a rejected spawn changes nothing");
  assert.equal(spawnUnit(state, 0, 1, UNIT_SOLDIER), undefined, "other lanes stay open");

  while (state.teamCount[0] < MAX_UNITS_PER_TEAM) {
    const lane = state.teamCount[0] % 2 === 0 ? 1 : 2;
    if (spawnUnit(state, 0, lane, UNIT_SOLDIER)) break;
  }
  assert.equal(state.teamCount[0], MAX_UNITS_PER_TEAM);
  assert.equal(spawnUnit(state, 0, 2, UNIT_SOLDIER), "team-full");
  assert.equal(spawnUnit(state, 1, 2, UNIT_SOLDIER), undefined, "the other team is unaffected");
});

test("INVARIANT — lane buckets stay sorted by position through a heavy battle", () => {
  const state = createSimState(0xc0ffee);
  for (let tick = 0; tick < 600; tick += 1) {
    if (tick % 2 === 0) {
      for (let lane = 0; lane < 3; lane += 1) {
        spawnUnit(state, 0, lane, (tick % 3) as UnitType);
        spawnUnit(state, 1, lane, ((tick + 1) % 3) as UnitType);
      }
    }
    stepSim(state);
    for (let bucket = 0; bucket < state.buckets.length; bucket += 1) {
      const list = state.buckets[bucket];
      for (let index = 1; index < state.bucketLen[bucket]; index += 1) {
        assert.ok(state.y[list[index - 1]] <= state.y[list[index]], `bucket ${bucket} out of order at tick ${tick}`);
      }
    }
    if (state.phase === PHASE_ENDED) break;
  }
});

test("INVARIANT — slot bookkeeping never leaks: live + free always equals capacity", () => {
  const state = createSimState(0x51e6e);
  for (let tick = 0; tick < 900; tick += 1) {
    for (let lane = 0; lane < 3; lane += 1) {
      spawnUnit(state, 0, lane, (tick % 3) as UnitType);
      spawnUnit(state, 1, lane, ((tick + 2) % 3) as UnitType);
    }
    stepSim(state);
    let bucketed = 0;
    for (let bucket = 0; bucket < state.buckets.length; bucket += 1) bucketed += state.bucketLen[bucket];
    assert.equal(bucketed, state.liveCount, `tick ${tick}: bucket contents disagree with liveCount`);
    assert.equal(state.liveCount + state.freeCount, state.alive.length, `tick ${tick}: slots leaked`);
    assert.equal(state.teamCount[0] + state.teamCount[1], state.liveCount, `tick ${tick}: team counts drifted`);
    if (state.phase === PHASE_ENDED) break;
  }
});

test("DETERMINISM — identical inputs replay to a byte-identical battle", () => {
  const play = () => {
    const state = createSimState(0xabcdef);
    for (let tick = 0; tick < 700; tick += 1) {
      if (tick % 3 === 0) spawnUnit(state, 0, tick % 3, (tick % 3) as UnitType);
      if (tick % 4 === 0) spawnUnit(state, 1, (tick + 1) % 3, ((tick + 1) % 3) as UnitType);
      stepSim(state);
      if (state.phase === PHASE_ENDED) break;
    }
    return state;
  };
  const first = play();
  const second = play();
  assert.equal(first.tick, second.tick);
  assert.equal(first.liveCount, second.liveCount);
  assert.deepEqual([...first.gateHp], [...second.gateHp]);
  assert.deepEqual([...first.y], [...second.y]);
  assert.deepEqual([...first.hp], [...second.hp]);
  assert.deepEqual(first.result, second.result);
});

test("BALANCE — an undefended lane falls, so pressure has to be answered", () => {
  const state = createSimState(0x1234);
  let broke = false;
  for (let tick = 0; tick < (MATCH_MS + SUDDEN_DEATH_MS) / TICK_MS; tick += 1) {
    if (tick % 4 === 0) spawnUnit(state, 0, 1, UNIT_SOLDIER);
    if (tick % 55 === 0) spawnUnit(state, 0, 1, UNIT_RAM);
    stepSim(state);
    if (state.phase === PHASE_ENDED) { broke = true; break; }
  }
  assert.ok(broke, "a completely unanswered push must break a gate inside the match");
  assert.equal(state.result?.winner, 0);
  assert.equal(state.result?.reason, "gate");
  assert.equal(state.result?.brokenLane, 1);
});

test("FAIRNESS — a head-on mirror match trades evenly, with no first-mover bias", () => {
  const state = createSimState(0x5ee5);
  const a = spawnAndFindSlot(state, 0, 1, UNIT_SOLDIER);
  const b = spawnAndFindSlot(state, 1, 1, UNIT_SOLDIER);
  state.y[a] = 29 * MM;
  state.y[b] = 30 * MM;

  // Identical units in identical circumstances must destroy each other, not
  // resolve in favour of whichever team the update loop happens to visit first.
  for (let tick = 0; tick < 40 && (state.alive[a] || state.alive[b]); tick += 1) stepSim(state);
  assert.equal(state.alive[a], state.alive[b], "one team survived a perfectly mirrored duel");
  assert.equal(state.alive[a], 0, "both duellists should have fallen");
});

test("FAIRNESS — mirrored armies leave both gates on identical HP", () => {
  const state = createSimState(0x9a9a);
  for (let tick = 0; tick < 900; tick += 1) {
    if (tick % 5 === 0) { spawnUnit(state, 0, 1, UNIT_SOLDIER); spawnUnit(state, 1, 1, UNIT_SOLDIER); }
    if (tick % 17 === 0) { spawnUnit(state, 0, 1, UNIT_ARCHER); spawnUnit(state, 1, 1, UNIT_ARCHER); }
    stepSim(state);
    if (state.phase === PHASE_ENDED) break;
  }
  assert.equal(
    state.gateHp[gateIndex(0, 1)],
    state.gateHp[gateIndex(1, 1)],
    "identical pressure from both sides must leave identical gate damage",
  );
});

test("FAIRNESS — mirrored play always draws, so neither side of the map is favoured", () => {
  // The strongest fairness statement available: if both teams issue identical
  // orders, a side-neutral simulation cannot produce a winner. This caught three
  // separate real defects — inline damage application, a targeting sweep that
  // stalled on plateaus, and float drift at exact range boundaries — each of
  // which showed up here as a lopsided win rate long before it was visible in play.
  const RUNS = 60;
  let draws = 0;
  for (let run = 0; run < RUNS; run += 1) {
    const seed = 0x1000 + run * 2654435761;
    const state = createSimState(seed);
    let rng = seed || 1;
    const random = () => {
      rng ^= rng << 13; rng >>>= 0;
      rng ^= rng >> 17;
      rng ^= rng << 5; rng >>>= 0;
      return rng / 0x1_0000_0000;
    };
    for (let tick = 0; tick < (MATCH_MS + SUDDEN_DEATH_MS) / TICK_MS; tick += 1) {
      if (random() < 0.22) {
        const roll = random();
        const type: UnitType = roll < 0.62 ? UNIT_SOLDIER : roll < 0.9 ? UNIT_ARCHER : UNIT_RAM;
        const lane = Math.floor(random() * 3);
        spawnUnit(state, 0, lane, type);
        spawnUnit(state, 1, lane, type);
      }
      stepSim(state);
      if (state.phase === PHASE_ENDED) break;
    }
    if (state.result?.winner === -1) draws += 1;
    else assert.fail(`seed ${seed}: mirrored play produced a winner (team ${state.result?.winner})`);
  }
  assert.equal(draws, RUNS);
});

test("BALANCE — an evenly matched lane does not let either gate fall", () => {
  const state = createSimState(0x777);
  for (let tick = 0; tick < MATCH_MS / TICK_MS; tick += 1) {
    if (tick % 4 === 0) { spawnUnit(state, 0, 1, UNIT_SOLDIER); spawnUnit(state, 1, 1, UNIT_SOLDIER); }
    if (tick % 13 === 0) { spawnUnit(state, 0, 1, UNIT_ARCHER); spawnUnit(state, 1, 1, UNIT_ARCHER); }
    stepSim(state);
    if (state.phase === PHASE_ENDED) break;
  }
  assert.notEqual(state.result?.reason, "gate", "a mirrored lane should not break either gate before sudden death");
});

const BENCH_TICKS = 1_800;
test(`PERF — a saturated battlefield stays far inside the per-tick CPU budget`, () => {
  const state = createSimState(0xbeef);
  // Fill toward the cap and keep it there so the benchmark measures the worst
  // realistic case, not an empty field.
  for (let lane = 0; lane < 3; lane += 1) {
    for (let index = 0; index < 40; index += 1) {
      spawnUnit(state, 0, lane, (index % 3) as UnitType);
      spawnUnit(state, 1, lane, ((index + 1) % 3) as UnitType);
    }
  }
  const unitsAtStart = state.liveCount;
  assert.ok(unitsAtStart >= 200, `expected a saturated field, got ${unitsAtStart}`);

  // Keep units immortal so the field stays saturated for the whole benchmark.
  const started = process.hrtime.bigint();
  let ticks = 0;
  for (let index = 0; index < BENCH_TICKS; index += 1) {
    for (let slot = 0; slot < state.hp.length; slot += 1) if (state.alive[slot]) state.hp[slot] = 1_000;
    for (let gate = 0; gate < 6; gate += 1) state.gateHp[gate] = GATE_MAX_HP;
    state.elapsedMs = 0;
    state.tick = 0;
    state.phase = 0;
    stepSim(state);
    ticks += 1;
  }
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
  const perTick = elapsedMs / ticks;
  console.log(`    ${state.liveCount} units · ${perTick.toFixed(3)} ms/tick (budget 10ms, target <1.5ms)`);
  assert.ok(perTick < 1.5, `tick cost ${perTick.toFixed(3)}ms exceeds the 1.5ms target`);
});

test("SANITY — declared movement speeds cross an empty lane in a sensible time", () => {
  for (const type of [UNIT_SOLDIER, UNIT_ARCHER, UNIT_RAM] as UnitType[]) {
    const state = createSimState();
    const slot = spawnAndFindSlot(state, 0, 0, type);
    const startY = state.y[slot];
    let ticks = 0;
    while (state.y[slot] < LANE_LENGTH_MM - UNIT_STATS[type].rangeMm && ticks < 1_800) {
      stepSim(state);
      ticks += 1;
    }
    const seconds = ticks * DT;
    console.log(`    type ${type}: ${(startY / MM).toFixed(1)}m → gate in ${seconds.toFixed(1)}s`);
    assert.ok(seconds > 5 && seconds < 40, `type ${type} crossing time ${seconds}s is outside a playable range`);
  }
});

console.log("\n2대2 3라인 공성전 시뮬레이션 규칙 검증 완료");
