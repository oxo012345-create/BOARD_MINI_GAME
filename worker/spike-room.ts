/**
 * MILESTONE 0 SPIKE — measurement harness. Not a game feature, and deliberately
 * NOT wired into the worker: it is a public endpoint that starts a CPU-burning
 * loop, so it stays disconnected until someone is actually taking a measurement.
 *
 * To run it, temporarily add back to `vite.config.ts`:
 *   durable_objects.bindings += { name: "SPIKE_ROOMS", class_name: "SpikeRoom" }
 *   migrations             += { tag: "spike-room-v1", new_sqlite_classes: ["SpikeRoom"] }
 * and to `worker/index.ts` an export plus a route forwarding `/api/spike/*` to
 * `env.SPIKE_ROOMS.get(idFromName("m0"))`. Then `GET /api/spike/start?secs=200&load=3`,
 * attach a few sockets to `/api/spike/connect`, and read `/api/spike/stats`.
 * Remove the wiring again when finished.
 *
 * The 2대2 3라인 공성전 design depends on one unverified platform assumption:
 * that a `setInterval` inside a Durable Object with hibernatable WebSockets
 * attached (a) keeps firing for a whole match, and (b) gets a fresh CPU budget
 * per callback instead of accumulating against the invocation that armed it.
 *
 * If (b) is false the whole server-authoritative tick design is dead on the
 * free plan, so it must be measured rather than reasoned about. This object
 * runs a synthetic tick loop and reports timing so we can answer that.
 *
 * Delete this file (and its binding/route) once M0 is signed off.
 */
import { DurableObject } from "cloudflare:workers";

type SpikeMode = "interval" | "deadline";
type SpikeConfig = { loadMs: number; tickMs: number; durationMs: number; payloadBytes: number; mode: SpikeMode };

type SpikeReport = {
  running: boolean;
  config: SpikeConfig;
  startedAt: number;
  elapsedMs: number;
  ticks: number;
  expectedTicks: number;
  /** Wall-clock gap between consecutive tick callbacks. */
  drift: { p50: number; p95: number; max: number };
  /** Time spent inside the tick body (synthetic load + serialize + broadcast). */
  body: { p50: number; p95: number; max: number };
  catchUps: number;
  sockets: number;
  stoppedReason?: string;
};

function percentile(sorted: number[], fraction: number) {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * fraction));
  return Math.round(sorted[index] * 100) / 100;
}

function summarize(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  return { p50: percentile(sorted, 0.5), p95: percentile(sorted, 0.95), max: percentile(sorted, 1) };
}

export class SpikeRoom extends DurableObject<Record<string, never>> {
  private timer?: ReturnType<typeof setInterval>;
  private config: SpikeConfig = { loadMs: 3, tickMs: 100, durationMs: 200_000, payloadBytes: 1_536, mode: "deadline" };
  private startedAt = 0;
  private ticks = 0;
  private catchUps = 0;
  private lastTickAt = 0;
  private stoppedReason?: string;
  private readonly driftSamples: number[] = [];
  private readonly bodySamples: number[] = [];
  private payload = new ArrayBuffer(1_536);

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/connect" && request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      const pair = new WebSocketPair();
      // Hibernatable accept — the design claims a live setInterval still keeps
      // the object resident despite this. That is exactly what we are testing.
      this.ctx.acceptWebSocket(pair[1]);
      return new Response(null, { status: 101, webSocket: pair[0] });
    }

    if (url.pathname === "/start") {
      // `Number(null)` is 0, so an absent param must be rejected before parsing
      // or every default silently becomes zero.
      const number = (key: string, fallback: number, min = 0) => {
        const raw = url.searchParams.get(key);
        if (raw === null || raw.trim() === "") return fallback;
        const parsed = Number(raw);
        return Number.isFinite(parsed) && parsed >= min ? parsed : fallback;
      };
      this.config = {
        loadMs: number("load", 3),
        tickMs: number("tick", 100, 1),
        durationMs: number("secs", 200, 1) * 1_000,
        payloadBytes: number("bytes", 1_536, 16),
        mode: url.searchParams.get("mode") === "interval" ? "interval" : "deadline",
      };
      this.start();
      return Response.json({ ok: true, config: this.config });
    }

    if (url.pathname === "/stop") {
      this.stop("manual");
      return Response.json(this.report());
    }

    if (url.pathname === "/stats") return Response.json(this.report());
    return new Response("Not found", { status: 404 });
  }

  /** Hibernation would drop the timer; a message proves the object is awake. */
  async webSocketMessage(socket: WebSocket): Promise<void> {
    socket.send(JSON.stringify({ type: "pong", ticks: this.ticks, running: Boolean(this.timer) }));
  }

  async webSocketClose(socket: WebSocket, code: number, reason: string): Promise<void> {
    try { socket.close(code, reason); } catch { /* already closed */ }
  }

  private start() {
    if (this.timer) clearInterval(this.timer);
    this.payload = new ArrayBuffer(this.config.payloadBytes);
    this.startedAt = Date.now();
    this.lastTickAt = this.startedAt;
    this.ticks = 0;
    this.catchUps = 0;
    this.stoppedReason = undefined;
    this.driftSamples.length = 0;
    this.bodySamples.length = 0;
    if (this.config.mode === "interval") this.timer = setInterval(() => this.tick(), this.config.tickMs);
    else this.scheduleDeadline();
  }

  /**
   * Self-correcting scheduler: aim at the absolute deadline for the next tick
   * rather than "now + tickMs". `setInterval` in workerd does not compensate for
   * callback duration, so a 3ms body turns a 100ms period into ~105ms and the
   * match runs measurably slow. Targeting absolute deadlines removes the
   * cumulative drift entirely.
   */
  private scheduleDeadline() {
    const nextAt = this.startedAt + (this.ticks + 1) * this.config.tickMs;
    this.timer = setTimeout(() => {
      this.tick();
      if (this.timer) this.scheduleDeadline();
    }, Math.max(0, nextAt - Date.now())) as unknown as ReturnType<typeof setInterval>;
  }

  private stop(reason: string) {
    if (this.timer) { clearInterval(this.timer); clearTimeout(this.timer); }
    this.timer = undefined;
    this.stoppedReason = reason;
  }

  private tick() {
    const enteredAt = Date.now();
    this.driftSamples.push(enteredAt - this.lastTickAt);
    this.lastTickAt = enteredAt;
    this.ticks += 1;

    // Synthetic CPU load. A busy loop is the point — we are probing the CPU
    // accounting boundary, so this must be real work the runtime can bill.
    const burnUntil = enteredAt + this.config.loadMs;
    let sink = 0;
    while (Date.now() < burnUntil) {
      for (let index = 0; index < 5_000; index += 1) sink += Math.sqrt(index) * 1.0000001;
    }
    if (sink === Number.POSITIVE_INFINITY) this.stoppedReason = "impossible";

    try {
      const view = new DataView(this.payload);
      view.setUint32(0, this.ticks);
      view.setFloat64(4, sink);
      for (const socket of this.ctx.getWebSockets()) {
        try { socket.send(this.payload); } catch { /* connection cleanup follows */ }
      }
    } catch (error) {
      // A silent throw here would look identical to "the timer stopped", which
      // is the exact conclusion this spike must not get wrong.
      this.stop(`tick threw: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }

    this.bodySamples.push(Date.now() - enteredAt);

    // Drift accounting: how far behind the ideal schedule have we fallen?
    const expected = Math.floor((enteredAt - this.startedAt) / this.config.tickMs) + 1;
    if (expected - this.ticks >= 2) this.catchUps += 1;

    if (Date.now() - this.startedAt >= this.config.durationMs) this.stop("completed");
  }

  private report(): SpikeReport {
    const elapsedMs = this.startedAt ? Date.now() - this.startedAt : 0;
    return {
      running: Boolean(this.timer),
      config: this.config,
      startedAt: this.startedAt,
      elapsedMs,
      ticks: this.ticks,
      expectedTicks: Math.floor(Math.min(elapsedMs, this.config.durationMs) / this.config.tickMs),
      drift: summarize(this.driftSamples),
      body: summarize(this.bodySamples),
      catchUps: this.catchUps,
      sockets: this.ctx.getWebSockets().length,
      stoppedReason: this.stoppedReason,
    };
  }
}
