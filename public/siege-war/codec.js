/**
 * 2대2 3라인 공성전 — snapshot wire format.
 *
 * This file is the single source of truth for the binary layout: the Durable
 * Object imports it directly and the browser loads the very same file as a
 * module. Two hand-kept copies of a byte layout is how you ship a silent
 * off-by-one desync, so there is exactly one.
 *
 * Only per-tick snapshots are binary. One-off control messages (welcome, match
 * end, spawn rejections) travel as JSON text frames, where clarity is worth more
 * than bytes.
 *
 * Layout — header 20 bytes:
 *   0  u8   msgType (1 = snapshot)
 *   1  u8   flags: bit0 assault, bit1 suddenDeath, bit2 ended
 *   2  u16  tick
 *   4  u16  remaining centiseconds
 *   6  u16 x6  gate HP, [team0 L,C,R][team1 L,C,R]
 *   18 u16  unit count
 * Then 7 bytes per unit:
 *   u16 id, u8 packed(lane|team|type|state), u16 y (mm), u8 xoff, u8 hp
 * Then the event tail:
 *   u8 count, then u16 unitId + u8 kind per event
 */

export const MSG_SNAPSHOT = 1;
export const HEADER_BYTES = 20;
export const UNIT_BYTES = 7;
export const EVENT_BYTES = 3;
export const MAX_EVENTS = 255;
/** Big enough for the hard unit cap plus a fully saturated event tail. */
export const SNAPSHOT_BUFFER_BYTES = HEADER_BYTES + 256 * UNIT_BYTES + 1 + MAX_EVENTS * EVENT_BYTES;

export const FLAG_ASSAULT = 1;
export const FLAG_SUDDEN_DEATH = 2;
export const FLAG_ENDED = 4;

/** xoff is cosmetic lateral scatter; ±1.8m maps onto a single byte.
 *  Must match LANE_HALF_SPREAD_MM in the simulation. */
const XOFF_RANGE_MM = 1_800;
const encodeXoff = (millimetres) => {
  const clamped = Math.max(-XOFF_RANGE_MM, Math.min(XOFF_RANGE_MM, millimetres));
  return Math.round(((clamped + XOFF_RANGE_MM) / (XOFF_RANGE_MM * 2)) * 255);
};
export const decodeXoffMm = (byte) => (byte / 255) * XOFF_RANGE_MM * 2 - XOFF_RANGE_MM;

/**
 * Writes one tick into `view`. Returns the byte length actually used, so the
 * caller can send a slice instead of the whole scratch buffer.
 *
 * The same bytes go to all four players: the server works in one absolute
 * coordinate system and mirroring is purely a client-side render transform, so
 * this runs once per tick rather than once per viewer.
 */
export function encodeSnapshot(view, sim, remainingMs) {
  view.setUint8(0, MSG_SNAPSHOT);
  const flags = (sim.assaultActive ? FLAG_ASSAULT : 0)
    | (sim.phase === 1 ? FLAG_SUDDEN_DEATH : 0)
    | (sim.phase === 2 ? FLAG_ENDED : 0);
  view.setUint8(1, flags);
  view.setUint16(2, sim.tick & 0xffff);
  view.setUint16(4, Math.min(65_535, Math.round(remainingMs / 10)));
  for (let gate = 0; gate < 6; gate += 1) {
    view.setUint16(6 + gate * 2, Math.max(0, Math.min(65_535, sim.gateHp[gate])));
  }

  let offset = HEADER_BYTES;
  let unitCount = 0;
  for (let bucket = 0; bucket < sim.buckets.length; bucket += 1) {
    const list = sim.buckets[bucket];
    const length = sim.bucketLen[bucket];
    for (let index = 0; index < length; index += 1) {
      const slot = list[index];
      const packed = (sim.lane[slot] & 0x3)
        | ((sim.team[slot] & 0x1) << 2)
        | ((sim.type[slot] & 0x3) << 3)
        | ((sim.state[slot] & 0x7) << 5);
      view.setUint16(offset, sim.id[slot]);
      view.setUint8(offset + 2, packed);
      view.setUint16(offset + 3, Math.max(0, Math.min(65_535, sim.y[slot])));
      view.setUint8(offset + 5, encodeXoff(sim.xoff[slot]));
      view.setUint8(offset + 6, Math.max(0, Math.min(255, sim.hp[slot])));
      offset += UNIT_BYTES;
      unitCount += 1;
    }
  }
  view.setUint16(18, unitCount);

  const events = sim.events;
  const eventCount = Math.min(MAX_EVENTS, events.length);
  view.setUint8(offset, eventCount);
  offset += 1;
  for (let index = 0; index < eventCount; index += 1) {
    const event = events[index];
    view.setUint16(offset, event.unitId & 0xffff);
    view.setUint8(offset + 2, ((event.kind & 0xf) | ((event.lane & 0x3) << 4) | ((event.team & 0x1) << 6)));
    offset += EVENT_BYTES;
  }
  return offset;
}

/** Mirror of `encodeSnapshot`, used by the browser. */
export function decodeSnapshot(buffer) {
  const view = new DataView(buffer);
  const flags = view.getUint8(1);
  const gateHp = new Array(6);
  for (let gate = 0; gate < 6; gate += 1) gateHp[gate] = view.getUint16(6 + gate * 2);
  const unitCount = view.getUint16(18);

  const ids = new Uint16Array(unitCount);
  const lanes = new Uint8Array(unitCount);
  const teams = new Uint8Array(unitCount);
  const types = new Uint8Array(unitCount);
  const states = new Uint8Array(unitCount);
  const ys = new Uint16Array(unitCount);
  const xoffs = new Float32Array(unitCount);
  const hps = new Uint8Array(unitCount);

  let offset = HEADER_BYTES;
  for (let index = 0; index < unitCount; index += 1) {
    ids[index] = view.getUint16(offset);
    const packed = view.getUint8(offset + 2);
    lanes[index] = packed & 0x3;
    teams[index] = (packed >> 2) & 0x1;
    types[index] = (packed >> 3) & 0x3;
    states[index] = (packed >> 5) & 0x7;
    ys[index] = view.getUint16(offset + 3);
    xoffs[index] = decodeXoffMm(view.getUint8(offset + 5));
    hps[index] = view.getUint8(offset + 6);
    offset += UNIT_BYTES;
  }

  const eventCount = view.getUint8(offset);
  offset += 1;
  const events = new Array(eventCount);
  for (let index = 0; index < eventCount; index += 1) {
    const packed = view.getUint8(offset + 2);
    events[index] = {
      unitId: view.getUint16(offset),
      kind: packed & 0xf,
      lane: (packed >> 4) & 0x3,
      team: (packed >> 6) & 0x1,
    };
    offset += EVENT_BYTES;
  }

  return {
    tick: view.getUint16(2),
    remainingMs: view.getUint16(4) * 10,
    assaultActive: Boolean(flags & FLAG_ASSAULT),
    suddenDeath: Boolean(flags & FLAG_SUDDEN_DEATH),
    ended: Boolean(flags & FLAG_ENDED),
    gateHp,
    unitCount,
    ids, lanes, teams, types, states, ys, xoffs, hps,
    events,
  };
}
