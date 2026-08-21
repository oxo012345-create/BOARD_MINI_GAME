import assert from "node:assert/strict";
import test from "node:test";
import {
  HEADER_BYTES, SNAPSHOT_BUFFER_BYTES, UNIT_BYTES, decodeSnapshot, encodeSnapshot,
} from "../public/siege-war/codec.js";
import {
  GATE_MAX_HP, LANE_HALF_SPREAD_MM, LANE_LENGTH_MM, MAX_UNITS,
  createSimState, remainingMs, spawnUnit, stepSim,
} from "../app/api/_lib/siege-war-sim.ts";

/**
 * The wire format is shared by the Durable Object and the browser. A field whose
 * units disagree between the two sides produces no error at all — it just draws
 * wrong — so the round trip is asserted here rather than discovered on screen.
 */

const encodeInto = (sim) => {
  const buffer = new ArrayBuffer(SNAPSHOT_BUFFER_BYTES);
  const length = encodeSnapshot(new DataView(buffer), sim, remainingMs(sim));
  return { buffer: buffer.slice(0, length), length };
};

test("a populated battlefield survives the round trip intact", () => {
  const sim = createSimState(0x515e6e);
  for (let tick = 0; tick < 120; tick += 1) {
    for (let lane = 0; lane < 3; lane += 1) {
      spawnUnit(sim, 0, lane, (tick % 3));
      spawnUnit(sim, 1, lane, ((tick + 1) % 3));
    }
    stepSim(sim);
  }
  assert.ok(sim.liveCount > 30, `expected a busy field, got ${sim.liveCount}`);

  const { buffer } = encodeInto(sim);
  const decoded = decodeSnapshot(buffer);

  assert.equal(decoded.unitCount, sim.liveCount, "unit count must survive");
  assert.equal(decoded.tick, sim.tick);
  assert.deepEqual(decoded.gateHp, [...sim.gateHp]);

  // Rebuild the expected set straight from the simulation's buckets.
  const expected = new Map();
  for (let bucket = 0; bucket < sim.buckets.length; bucket += 1) {
    const list = sim.buckets[bucket];
    for (let index = 0; index < sim.bucketLen[bucket]; index += 1) {
      const slot = list[index];
      expected.set(sim.id[slot], {
        lane: sim.lane[slot], team: sim.team[slot], type: sim.type[slot],
        state: sim.state[slot], y: sim.y[slot], hp: sim.hp[slot], xoff: sim.xoff[slot],
      });
    }
  }
  for (let index = 0; index < decoded.unitCount; index += 1) {
    const source = expected.get(decoded.ids[index]);
    assert.ok(source, `decoded unit ${decoded.ids[index]} is not in the simulation`);
    assert.equal(decoded.lanes[index], source.lane);
    assert.equal(decoded.teams[index], source.team);
    assert.equal(decoded.types[index], source.type);
    assert.equal(decoded.states[index], source.state);
    assert.equal(decoded.hps[index], source.hp);
    assert.equal(decoded.ys[index], source.y, "lane position is exact: both sides use millimetres");
  }
});

test("lateral scatter keeps its units and its spread across the wire", () => {
  const sim = createSimState(0xbeef);
  for (let index = 0; index < 60; index += 1) spawnUnit(sim, 0, 1, 0);
  const decoded = decodeSnapshot(encodeInto(sim).buffer);

  const decodedSpread = Math.max(...[...decoded.xoffs].map(Math.abs));
  const simSpread = Math.max(...[...sim.buckets[1]].slice(0, sim.bucketLen[1]).map((slot) => Math.abs(sim.xoff[slot])));

  // A units mismatch here (metres one side, millimetres the other) silently
  // collapses every unit onto the lane centre, which reads as a single file.
  assert.ok(simSpread > LANE_HALF_SPREAD_MM * 0.5, `simulation scatter too small: ${simSpread}`);
  assert.ok(decodedSpread > LANE_HALF_SPREAD_MM * 0.5, `decoded scatter collapsed to ${decodedSpread}`);
  assert.ok(Math.abs(decodedSpread - simSpread) < LANE_HALF_SPREAD_MM * 0.1, "scatter magnitude must survive quantisation");
});

test("the scratch buffer is large enough for a fully saturated tick", () => {
  const sim = createSimState(0x1234);
  let guard = 0;
  while (sim.liveCount < MAX_UNITS - 6 && guard < 4_000) {
    guard += 1;
    for (let lane = 0; lane < 3; lane += 1) {
      spawnUnit(sim, 0, lane, 2);
      spawnUnit(sim, 1, lane, 2);
    }
  }
  const { length } = encodeInto(sim);
  assert.ok(length <= SNAPSHOT_BUFFER_BYTES, `snapshot ${length}B overflows the ${SNAPSHOT_BUFFER_BYTES}B buffer`);
  assert.equal(length, HEADER_BYTES + sim.liveCount * UNIT_BYTES + 1 + Math.min(255, sim.events.length) * 3);
});

test("gate HP and the end-of-match flags reach the client", () => {
  const sim = createSimState(0x99);
  sim.gateHp[0] = 0;
  sim.gateHp[4] = 137;
  stepSim(sim);
  const decoded = decodeSnapshot(encodeInto(sim).buffer);
  assert.equal(decoded.gateHp[0], 0);
  assert.equal(decoded.gateHp[4], 137);
  assert.equal(decoded.gateHp[5], GATE_MAX_HP);
  assert.equal(decoded.ended, true, "a broken gate ends the match and the flag must ship");
});

test("positions at both ends of the lane encode without clipping", () => {
  const sim = createSimState(0x77);
  spawnUnit(sim, 0, 0, 0);
  spawnUnit(sim, 1, 2, 0);
  const slotA = sim.buckets[0][0];
  const slotB = sim.buckets[5][0];
  sim.y[slotA] = 0;
  sim.y[slotB] = LANE_LENGTH_MM;
  const decoded = decodeSnapshot(encodeInto(sim).buffer);
  const ys = [...decoded.ys].sort((a, b) => a - b);
  assert.equal(ys[0], 0);
  assert.equal(ys[ys.length - 1], LANE_LENGTH_MM, "the far gate must not overflow the u16 position field");
});
