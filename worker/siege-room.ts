/**
 * 2대2 3라인 공성전 — the authoritative match server.
 *
 * This is the first Durable Object in this project to run a real simulation
 * rather than relay client-reported state, so a few decisions are load-bearing:
 *
 * - Sockets are accepted with `ctx.acceptWebSocket` (hibernatable) but the match
 *   is driven by a chained `setTimeout`. A pending timer is pending work, so the
 *   object stays resident for the ~180s of a match and the ticks cost no billable
 *   requests; once the match ends the timer is gone and the object hibernates
 *   like `MazeRoom` does. Alarms are the alternative and would cost ~1,800
 *   requests per match against a daily budget shared with every other game here.
 * - The timer targets absolute deadlines rather than a fixed interval, because
 *   `setInterval` does not compensate for callback duration: measured on this
 *   runtime a 3ms body turns a 100ms period into 105ms and drops ~8 ticks every
 *   20 seconds.
 * - One alarm is armed per match as a dead man's switch, so an evicted object
 *   still settles and reports its result.
 */
import { DurableObject } from "cloudflare:workers";
import {
  ASSAULT_AT_MS, GATE_MAX_HP, LANE_COUNT, MATCH_MS, MAX_UNITS_PER_LANE, MAX_UNITS_PER_TEAM,
  PHASE_ENDED, SUDDEN_DEATH_MS, TICK_MS, UNIT_ARCHER, UNIT_RAM, UNIT_SOLDIER, UNIT_STATS,
  createSimState, gateIndex, remainingMs, spawnCooldownMs, spawnUnit, stepSim,
  type SimState, type UnitType,
} from "../app/api/_lib/siege-war-sim";
import { SNAPSHOT_BUFFER_BYTES, encodeSnapshot } from "../public/siege-war/codec.js";

type SiegeRoomEnv = { DB?: D1Database };

type Seat = {
  id: string;
  name: string;
  /** 0 = team A, 1 = team B. Matches the simulation's side index. */
  side: 0 | 1;
  bot: boolean;
  lane: number;
  /** Last spawn time per unit type, for server-side cooldown enforcement. */
  lastSpawnAt: number[];
  spawned: number;
  /** Bots only: when the current intent may next be acted on. */
  nextDecisionAt: number;
};

type BootstrapPayload = {
  roomCode: string;
  startedAt: number;
  teams: { A: string[]; B: string[] };
  botIds: string[];
  players: Array<{ id: string; name: string }>;
};

/**
 * Scene-setting commands for the debug room. Guarded so they only exist in a
 * match that was started with bot seats — a normal 4-player room can never
 * reach them. They exist so a single person can stage the states that are
 * otherwise hard to reach on demand: a saturated lane, the total assault, a
 * gate one hit from falling.
 */
type DebugCommand =
  | { op: "fill"; team: number; lane: number; unitType: number; count: number }
  | { op: "clash"; lane: number; count: number }
  | { op: "clear" }
  | { op: "assault" }
  | { op: "sudden" }
  | { op: "gate"; team: number; lane: number; hp: number }
  | { op: "clock"; remainingMs: number }
  | { op: "bots"; enabled: boolean };

type SocketAttachment = { playerId: string };

const MATCH_LIMIT_MS = MATCH_MS + SUDDEN_DEATH_MS;
/** Comfortably past the longest possible match, so it only fires if we died. */
const DEAD_MAN_MS = MATCH_LIMIT_MS + 20_000;
const RESUME_EVERY_TICKS = 20;
const BOT_DECISION_TICKS = 4;

const clampLane = (value: unknown) => {
  const lane = Math.floor(Number(value));
  return Number.isFinite(lane) && lane >= 0 && lane < LANE_COUNT ? lane : 0;
};

export class SiegeRoom extends DurableObject<SiegeRoomEnv> {
  private roomCode = "";
  /**
   * Origin the tick scheduler aims at. Debug commands that move the clock move
   * this, so it is *not* the match's identity.
   */
  private startedAt = 0;
  /**
   * The match's identity, exactly as stored in D1. Kept separate from
   * `startedAt` because the result write is guarded on it: letting a debug clock
   * change shift this made the guard match no rows and silently drop the result.
   */
  private matchStartedAt = 0;
  /** True only for rooms started with bot seats; gates every debug command. */
  private debug = false;
  private botsEnabled = true;
  private seats = new Map<string, Seat>();
  private sim: SimState = createSimState();
  private timer?: ReturnType<typeof setTimeout>;
  private running = false;
  private resultWritten = false;
  private readonly scratch = new ArrayBuffer(SNAPSHOT_BUFFER_BYTES);
  private readonly view = new DataView(this.scratch);
  private readonly ready: Promise<void>;

  constructor(ctx: DurableObjectState, env: SiegeRoomEnv) {
    super(ctx, env);
    this.ready = ctx.blockConcurrencyWhile(async () => {
      const stored = await ctx.storage.get<{ roomCode: string; startedAt: number; matchStartedAt?: number; seats: Seat[] }>("match");
      if (!stored) return;
      this.roomCode = stored.roomCode;
      this.startedAt = stored.startedAt;
      this.matchStartedAt = stored.matchStartedAt ?? stored.startedAt;
      for (const seat of stored.seats) this.seats.set(seat.id, seat);
    });
  }

  async fetch(request: Request): Promise<Response> {
    await this.ready;
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/bootstrap") {
      const payload = await request.json<BootstrapPayload>();
      if (!payload?.roomCode || !payload.teams || !Number.isFinite(payload.startedAt)) {
        return Response.json({ error: "INVALID_BOOTSTRAP" }, { status: 400 });
      }
      // A reconnect can carry the bootstrap for a match already in progress.
      // Only a genuinely newer match may reset the battlefield.
      if (payload.startedAt > this.matchStartedAt) await this.beginMatch(payload);
      return Response.json({ ok: true, startedAt: this.startedAt, running: this.running });
    }

    if (url.pathname === "/connect" && request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      const playerId = request.headers.get("x-siege-player-id") ?? "";
      const seat = this.seats.get(playerId);
      if (!seat || seat.bot) return Response.json({ error: "NOT_PLAYING" }, { status: 403 });

      for (const existing of this.ctx.getWebSockets(playerId)) {
        try { existing.close(4001, "replaced by a newer connection"); } catch { /* already closed */ }
      }
      const pair = new WebSocketPair();
      const server = pair[1];
      server.serializeAttachment({ playerId } satisfies SocketAttachment);
      this.ctx.acceptWebSocket(server, [playerId]);
      server.send(JSON.stringify(this.welcome(seat)));
      this.sendSnapshot(server);
      // A refresh can arrive after eviction; make sure the clock is running.
      if (this.sim.phase !== PHASE_ENDED && !this.running) this.resumeLoop();
      return new Response(null, { status: 101, webSocket: pair[0] });
    }

    if (url.pathname === "/stats") {
      return Response.json({
        roomCode: this.roomCode,
        startedAt: this.startedAt,
        tick: this.sim.tick,
        phase: this.sim.phase,
        running: this.running,
        units: this.sim.liveCount,
        gateHp: [...this.sim.gateHp],
        seats: [...this.seats.values()].map((seat) => ({ id: seat.id, side: seat.side, bot: seat.bot, spawned: seat.spawned })),
      });
    }
    return new Response("Not found", { status: 404 });
  }

  async webSocketMessage(socket: WebSocket, data: string | ArrayBuffer): Promise<void> {
    await this.ready;
    const attachment = socket.deserializeAttachment() as SocketAttachment | null;
    const seat = attachment ? this.seats.get(attachment.playerId) : undefined;
    if (!seat) {
      socket.send(JSON.stringify({ type: "error", code: "UNAUTHORIZED" }));
      try { socket.close(4003, "unauthorized"); } catch { /* already closed */ }
      return;
    }
    let message: { type?: string; unitType?: number; lane?: number; seq?: number };
    try {
      const text = typeof data === "string" ? data : new TextDecoder().decode(data);
      if (text.length > 512) throw new Error("too large");
      message = JSON.parse(text);
    } catch {
      socket.send(JSON.stringify({ type: "error", code: "BAD_MESSAGE" }));
      return;
    }

    if (message.type === "lane") {
      seat.lane = clampLane(message.lane);
      return;
    }
    if (message.type === "debug") {
      if (!this.debug) { socket.send(JSON.stringify({ type: "nack", reason: "not-debug" })); return; }
      this.applyDebug(message as unknown as DebugCommand);
      this.broadcastSnapshot();
      return;
    }
    if (message.type !== "spawn") return;

    const unitType = Math.floor(Number(message.unitType));
    if (![UNIT_SOLDIER, UNIT_ARCHER, UNIT_RAM].includes(unitType as UnitType)) {
      socket.send(JSON.stringify({ type: "nack", reason: "type", seq: message.seq }));
      return;
    }
    seat.lane = clampLane(message.lane ?? seat.lane);
    const rejection = this.trySpawn(seat, unitType as UnitType, seat.lane);
    if (rejection) socket.send(JSON.stringify({ type: "nack", reason: rejection, seq: message.seq }));
  }

  async webSocketClose(socket: WebSocket, code: number, reason: string): Promise<void> {
    // No bot takeover by design: the four players are in the same room, so a
    // dropped connection should not change the battle, only that player's input.
    try { socket.close(code, reason); } catch { /* already closed */ }
  }

  async webSocketError(socket: WebSocket): Promise<void> {
    try { socket.close(1011, "websocket error"); } catch { /* already closed */ }
  }

  /** Fires only if the tick loop died with the object; settles the match. */
  async alarm(): Promise<void> {
    await this.ready;
    if (this.sim.phase === PHASE_ENDED) { await this.publishResult(); return; }
    // Fast-forward rather than replay: the battlefield is gone, but the match
    // must still be closed out so the room does not hang on the game screen.
    this.sim.phase = PHASE_ENDED;
    this.sim.result = { winner: -1, reason: "timeout", brokenLane: -1 };
    this.stopLoop();
    await this.publishResult();
  }

  private async beginMatch(payload: BootstrapPayload) {
    this.stopLoop();
    this.roomCode = payload.roomCode;
    this.startedAt = payload.startedAt;
    this.matchStartedAt = payload.startedAt;
    this.debug = payload.botIds.length > 0;
    this.resultWritten = false;
    this.sim = createSimState(payload.startedAt >>> 0);
    this.seats.clear();

    const names = new Map(payload.players.map((player) => [player.id, player.name]));
    const seatFor = (id: string, side: 0 | 1, index: number): Seat => ({
      id,
      name: names.get(id) ?? (payload.botIds.includes(id) ? `BOT ${index + 1}` : "농부"),
      side,
      bot: payload.botIds.includes(id),
      lane: 1,
      lastSpawnAt: [0, 0, 0],
      spawned: 0,
      nextDecisionAt: 0,
    });
    payload.teams.A.forEach((id, index) => this.seats.set(id, seatFor(id, 0, index)));
    payload.teams.B.forEach((id, index) => this.seats.set(id, seatFor(id, 1, index)));

    // Awaited, not fire-and-forget: an unhandled rejection from a storage call
    // tears the object down, which looks from outside exactly like the socket
    // upgrade hanging with no error at all.
    try {
      await this.ctx.storage.put("match", {
        roomCode: this.roomCode,
        startedAt: this.startedAt,
        matchStartedAt: this.matchStartedAt,
        seats: [...this.seats.values()],
      });
    } catch (error) {
      console.error("siege: match persist failed", error);
    }
    // The dead man's switch is a safety net, so losing it must never stop a match.
    try {
      await this.ctx.storage.setAlarm(Date.now() + DEAD_MAN_MS);
    } catch (error) {
      console.error("siege: alarm unavailable", error);
    }
    this.resumeLoop();
  }

  private resumeLoop() {
    if (this.running || this.sim.phase === PHASE_ENDED) return;
    this.running = true;
    this.scheduleTick();
  }

  private stopLoop() {
    this.running = false;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }

  /**
   * Aims at the absolute deadline for the next tick. Anything else accumulates
   * drift equal to the callback duration on every single tick.
   */
  private scheduleTick() {
    if (!this.running) return;
    const dueAt = this.startedAt + (this.sim.tick + 1) * TICK_MS;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.runTick();
      this.scheduleTick();
    }, Math.max(0, dueAt - Date.now()));
  }

  private runTick() {
    if (this.sim.phase === PHASE_ENDED) { this.stopLoop(); return; }

    // Catch up if the runtime stalled, but never unboundedly: dropping time is
    // far better than blowing the CPU budget trying to reclaim it.
    const behind = Math.floor((Date.now() - this.startedAt) / TICK_MS) - this.sim.tick;
    const steps = Math.max(1, Math.min(5, behind));
    for (let step = 0; step < steps; step += 1) {
      stepSim(this.sim);
      if (this.sim.phase === PHASE_ENDED) break;
    }

    if (this.botsEnabled && this.sim.tick % BOT_DECISION_TICKS === 0) this.runBots();

    this.broadcastSnapshot();

    if (this.sim.tick % RESUME_EVERY_TICKS === 0) {
      this.ctx.waitUntil(
        this.ctx.storage.put("tick", { tick: this.sim.tick, gateHp: [...this.sim.gateHp] })
          .catch((error) => console.error("siege: resume snapshot failed", error)),
      );
    }
    if (this.sim.phase === PHASE_ENDED) {
      this.stopLoop();
      this.broadcastEnd();
      this.ctx.waitUntil(this.publishResult());
    }
  }

  private trySpawn(seat: Seat, unitType: UnitType, lane: number) {
    if (this.sim.phase === PHASE_ENDED) return "phase";
    const now = Date.now();
    const cooldown = spawnCooldownMs(unitType, this.sim.assaultActive);
    if (now - seat.lastSpawnAt[unitType] < cooldown) return "cooldown";
    const rejection = spawnUnit(this.sim, seat.side, lane, unitType);
    if (rejection) return rejection;
    // Only a successful spawn consumes the cooldown, so hitting a cap does not
    // also cost the player their next unit.
    seat.lastSpawnAt[unitType] = now;
    seat.spawned += 1;
    return undefined;
  }

  /**
   * Bot policy. Threat is distance-weighted, and because a single broken gate
   * loses the whole match a lane whose gate is already low is weighted far more
   * heavily — that makes bots abandon a winning push to save a failing gate.
   */
  private runBots() {
    const now = Date.now();
    for (const seat of this.seats.values()) {
      if (!seat.bot || this.sim.phase === PHASE_ENDED) continue;
      if (now < seat.nextDecisionAt) continue;

      const mine = seat.side;
      const enemy = mine === 0 ? 1 : 0;
      const threat = new Array(LANE_COUNT).fill(0);
      const myPresence = new Array(LANE_COUNT).fill(0);
      const enemyDefenders = new Array(LANE_COUNT).fill(0);

      for (let bucket = 0; bucket < this.sim.buckets.length; bucket += 1) {
        const list = this.sim.buckets[bucket];
        const length = this.sim.bucketLen[bucket];
        for (let index = 0; index < length; index += 1) {
          const slot = list[index];
          const lane = this.sim.lane[slot];
          const stats = UNIT_STATS[this.sim.type[slot]];
          const distanceToMyGate = Math.abs(this.sim.y[slot] - (mine === 0 ? 0 : 60_000));
          const closeness = 1 - Math.min(1, distanceToMyGate / 60_000);
          if (this.sim.team[slot] === enemy) {
            threat[lane] += stats.attack * (1 + 2 * closeness);
            if (closeness < 0.35) enemyDefenders[lane] += 1;
          } else {
            myPresence[lane] += closeness < 0.5 ? 1 : 0;
          }
        }
      }

      let defendLane = 0;
      let defendScore = -1;
      let attackLane = 0;
      let attackScore = -Infinity;
      for (let lane = 0; lane < LANE_COUNT; lane += 1) {
        const myGate = this.sim.gateHp[gateIndex(mine, lane)];
        const theirGate = this.sim.gateHp[gateIndex(enemy, lane)];
        const danger = threat[lane] * (1 + 2 * (1 - myGate / GATE_MAX_HP));
        if (danger > defendScore) { defendScore = danger; defendLane = lane; }
        const opportunity = 3 * (1 - theirGate / GATE_MAX_HP) + myPresence[lane] - 1.5 * enemyDefenders[lane];
        if (opportunity > attackScore) { attackScore = opportunity; attackLane = lane; }
      }

      const defending = defendScore > 40;
      let lane = defending ? defendLane : attackLane;
      // A little deviation keeps two bots from mirroring each other exactly.
      if (Math.random() < 0.15) lane = (lane + 1 + Math.floor(Math.random() * 2)) % LANE_COUNT;
      seat.lane = lane;

      const enemyRamPresent = this.laneHasEnemyRam(lane, enemy);
      let unitType: UnitType = UNIT_SOLDIER;
      if (defending) {
        unitType = enemyRamPresent ? UNIT_SOLDIER : myPresence[lane] > 2 ? UNIT_ARCHER : UNIT_SOLDIER;
      } else if (enemyDefenders[lane] <= 1 && Date.now() - seat.lastSpawnAt[UNIT_RAM] >= spawnCooldownMs(UNIT_RAM, this.sim.assaultActive)) {
        unitType = UNIT_RAM;
      } else if (myPresence[lane] > 2) {
        unitType = UNIT_ARCHER;
      }

      if (!this.trySpawn(seat, unitType, lane)) {
        // Humanised pacing: without this the bots become an 8/s wall the instant
        // cooldowns drop at the assault, and the debug mode stops being useful.
        seat.nextDecisionAt = now + 320 + Math.floor(Math.random() * 300);
      }
    }
  }

  /**
   * Stages a battlefield state directly. Everything still goes through the same
   * simulation afterwards, so a scene set up here plays out under exactly the
   * rules a real match uses.
   */
  private applyDebug(command: DebugCommand) {
    const lane = clampLane((command as { lane?: number }).lane);
    switch (command.op) {
      case "fill": {
        const team = command.team === 1 ? 1 : 0;
        const type = [0, 1, 2].includes(command.unitType) ? (command.unitType as UnitType) : UNIT_SOLDIER;
        const count = Math.max(1, Math.min(60, Math.floor(command.count) || 1));
        for (let index = 0; index < count; index += 1) spawnUnit(this.sim, team, lane, type);
        break;
      }
      case "clash": {
        const count = Math.max(1, Math.min(45, Math.floor(command.count) || 1));
        for (let index = 0; index < count; index += 1) {
          spawnUnit(this.sim, 0, lane, index % 4 === 3 ? UNIT_ARCHER : UNIT_SOLDIER);
          spawnUnit(this.sim, 1, lane, index % 4 === 3 ? UNIT_ARCHER : UNIT_SOLDIER);
        }
        break;
      }
      case "clear": {
        for (let bucket = 0; bucket < this.sim.buckets.length; bucket += 1) {
          const list = this.sim.buckets[bucket];
          for (let index = 0; index < this.sim.bucketLen[bucket]; index += 1) this.sim.alive[list[index]] = 0;
        }
        // Reset the gates too: a staged scene should start from a clean board
        // rather than inheriting damage that might end the match mid-setup.
        for (let gate = 0; gate < this.sim.gateHp.length; gate += 1) this.sim.gateHp[gate] = GATE_MAX_HP;
        stepSim(this.sim);
        break;
      }
      case "bots":
        this.botsEnabled = command.enabled !== false;
        break;
      case "assault":
        // Rewind only as far as the assault mark so the phase change is genuine.
        this.sim.tick = Math.max(this.sim.tick, ASSAULT_AT_MS / TICK_MS);
        this.sim.elapsedMs = this.sim.tick * TICK_MS;
        this.sim.assaultActive = true;
        break;
      case "sudden":
        this.sim.tick = Math.max(this.sim.tick, MATCH_MS / TICK_MS);
        this.sim.elapsedMs = this.sim.tick * TICK_MS;
        break;
      case "gate": {
        const team = command.team === 1 ? 1 : 0;
        this.sim.gateHp[gateIndex(team, lane)] = Math.max(0, Math.min(GATE_MAX_HP, Math.floor(command.hp)));
        break;
      }
      case "clock": {
        const remaining = Math.max(0, Math.floor(command.remainingMs));
        const target = Math.max(0, MATCH_MS - remaining);
        this.sim.tick = Math.floor(target / TICK_MS);
        this.sim.elapsedMs = this.sim.tick * TICK_MS;
        this.sim.assaultActive = this.sim.elapsedMs >= ASSAULT_AT_MS;
        break;
      }
    }
    // The tick loop schedules against startedAt, so a moved clock has to move
    // the origin too or the loop spends the next N ticks "catching up".
    this.startedAt = Date.now() - this.sim.elapsedMs;
  }

  private laneHasEnemyRam(lane: number, enemySide: number) {
    const bucket = enemySide * LANE_COUNT + lane;
    const list = this.sim.buckets[bucket];
    for (let index = 0; index < this.sim.bucketLen[bucket]; index += 1) {
      if (this.sim.type[list[index]] === UNIT_RAM) return true;
    }
    return false;
  }

  private welcome(seat: Seat) {
    return {
      type: "welcome",
      room: this.roomCode,
      startedAt: this.startedAt,
      you: { id: seat.id, side: seat.side, lane: seat.lane },
      seats: [...this.seats.values()].map((entry) => ({ id: entry.id, name: entry.name, side: entry.side, bot: entry.bot })),
      config: {
        tickMs: TICK_MS,
        matchMs: MATCH_MS,
        suddenDeathMs: SUDDEN_DEATH_MS,
        assaultAtMs: ASSAULT_AT_MS,
        gateMaxHp: GATE_MAX_HP,
        laneCount: LANE_COUNT,
        maxPerTeam: MAX_UNITS_PER_TEAM,
        maxPerLane: MAX_UNITS_PER_LANE,
        units: UNIT_STATS.map((stats) => ({
          hp: stats.hp, attack: stats.attack, range: stats.range,
          speed: stats.speed, cooldownMs: stats.cooldownMs, assaultCooldownMs: stats.assaultCooldownMs,
        })),
      },
    };
  }

  private sendSnapshot(socket: WebSocket) {
    const length = encodeSnapshot(this.view, this.sim, remainingMs(this.sim));
    try { socket.send(this.scratch.slice(0, length)); } catch { /* connection cleanup follows */ }
  }

  private broadcastSnapshot() {
    // Encode once. The wire format is identical for all four players because the
    // server keeps one absolute coordinate system and mirroring is a client-side
    // render transform.
    const length = encodeSnapshot(this.view, this.sim, remainingMs(this.sim));
    const payload = this.scratch.slice(0, length);
    for (const socket of this.ctx.getWebSockets()) {
      try { socket.send(payload); } catch { /* connection cleanup follows */ }
    }
  }

  private broadcastEnd() {
    const message = JSON.stringify({ type: "ended", result: this.matchResult() });
    for (const socket of this.ctx.getWebSockets()) {
      try { socket.send(message); } catch { /* connection cleanup follows */ }
    }
  }

  private matchResult() {
    const winnerSide = this.sim.result?.winner ?? -1;
    const unitsSpawned: Record<string, number> = {};
    for (const seat of this.seats.values()) unitsSpawned[seat.id] = seat.spawned;
    return {
      winner: winnerSide === 0 ? "A" : winnerSide === 1 ? "B" : "draw",
      reason: this.sim.result?.reason ?? "timeout",
      brokenLane: this.sim.result?.brokenLane ?? -1,
      gateHp: {
        A: [0, 1, 2].map((lane) => this.sim.gateHp[gateIndex(0, lane)]),
        B: [0, 1, 2].map((lane) => this.sim.gateHp[gateIndex(1, lane)]),
      },
      unitsSpawned,
      durationMs: this.sim.elapsedMs,
    };
  }

  /**
   * The Durable Object writes the result itself rather than asking a client to
   * report it, so a locked phone or a closed tab cannot strand the room on the
   * game screen. Guarded on `startedAt` so a stale object cannot overwrite a
   * newer match.
   */
  private async publishResult() {
    if (this.resultWritten || !this.env.DB || !this.roomCode) return;
    this.resultWritten = true;
    const result = JSON.stringify(this.matchResult());
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await this.env.DB.prepare(`UPDATE rooms
          SET state = json_set(
            state,
            '$.game.siegeWar.result', json(?),
            '$.view', 'result',
            '$.revision', COALESCE(CAST(json_extract(state, '$.revision') AS INTEGER), 0) + 1
          ),
          updated_at = CURRENT_TIMESTAMP
          WHERE code = ? AND json_extract(state, '$.game.id') = 'siege-war'
            AND json_extract(state, '$.game.siegeWar.startedAt') = ?`)
          .bind(result, this.roomCode, this.matchStartedAt)
          .run();
        await this.ctx.storage.deleteAlarm().catch(() => undefined);
        return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
      }
    }
    this.resultWritten = false;
  }
}
