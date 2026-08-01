import { DurableObject } from "cloudflare:workers";
import { applyMazeMessage, mazeGameSnapshot, mazeWelcome, type MazeState } from "../app/api/_lib/maze";
import type { Player } from "../app/api/_lib/rooms";

type MazeRoomEnv = {
  DB?: D1Database;
};

type BootstrapPayload = {
  roomCode: string;
  hostId: string;
  players: Player[];
  maze: MazeState;
};

type StoredRoom = {
  roomCode: string;
  hostId: string;
  players: Record<string, Player>;
  maze: MazeState;
};

type SocketAttachment = { playerId: string };

const encoder = new TextEncoder();

function jsonResponse(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class MazeRoom extends DurableObject<MazeRoomEnv> {
  private room: StoredRoom | null = null;
  private readonly ready: Promise<void>;
  private lastD1SyncAt = 0;
  private d1Sync: Promise<void> = Promise.resolve();
  private lastItemSignature = "";

  constructor(ctx: DurableObjectState, env: MazeRoomEnv) {
    super(ctx, env);
    this.ready = ctx.blockConcurrencyWhile(async () => {
      this.room = await ctx.storage.get<StoredRoom>("room") ?? null;
    });
  }

  async fetch(request: Request): Promise<Response> {
    await this.ready;
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/bootstrap") {
      const payload = await request.json<BootstrapPayload>();
      if (!payload?.roomCode || !payload.maze || !Array.isArray(payload.players)) {
        return jsonResponse({ error: "INVALID_BOOTSTRAP" }, 400);
      }
      // A reconnect can carry the older D1 bootstrap after the live room has
      // already restarted its map. Only a genuinely newer game generation may
      // replace Durable Object state.
      if (!this.room || payload.maze.startedAt > this.room.maze.startedAt) {
        this.room = {
          roomCode: payload.roomCode,
          hostId: payload.hostId,
          players: Object.fromEntries(payload.players.map((player) => [player.id, clone(player)])),
          maze: clone(payload.maze),
        };
        await this.ctx.storage.put("room", this.room);
      } else {
        this.room.hostId = payload.hostId;
        for (const player of payload.players) this.room.players[player.id] = clone(player);
      }
      return jsonResponse({ ok: true, startedAt: this.room.maze.startedAt });
    }

    if (url.pathname !== "/connect" || request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Not found", { status: 404 });
    }
    if (!this.room) return jsonResponse({ error: "ROOM_NOT_READY" }, 409);

    const playerId = request.headers.get("x-maze-player-id") ?? "";
    const player = this.room.players[playerId];
    if (!player || !this.room.maze.players[playerId]) return jsonResponse({ error: "NOT_PLAYING" }, 403);

    for (const existing of this.ctx.getWebSockets(playerId)) {
      try { existing.close(4001, "replaced by a newer connection"); } catch { /* already closed */ }
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.serializeAttachment({ playerId } satisfies SocketAttachment);
    this.ctx.acceptWebSocket(server, [playerId]);

    const welcome = { ...mazeWelcome(this.room.maze, playerId, this.room.hostId), room: this.room.roomCode };
    server.send(JSON.stringify(welcome));
    this.broadcastPlayerJoined(playerId, server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, data: string | ArrayBuffer): Promise<void> {
    await this.ready;
    if (!this.room) return;
    const attachment = socket.deserializeAttachment() as SocketAttachment | null;
    const player = attachment ? this.room.players[attachment.playerId] : null;
    if (!player) {
      socket.send(JSON.stringify({ type: "error", code: "UNAUTHORIZED", message: "인증이 만료되었습니다." }));
      socket.close(4003, "unauthorized");
      return;
    }

    let message: Record<string, unknown>;
    try {
      const text = typeof data === "string" ? data : new TextDecoder().decode(data);
      if (encoder.encode(text).byteLength > 8_192) throw new Error("message too large");
      message = JSON.parse(text) as Record<string, unknown>;
    } catch {
      socket.send(JSON.stringify({ type: "error", code: "BAD_MESSAGE", message: "잘못된 요청입니다." }));
      return;
    }

    const messages = applyMazeMessage(this.room.maze, player, this.room.hostId, message);
    if (message.type === "state") {
      const snapshot = mazeGameSnapshot(this.room.maze);
      const current = snapshot.players.find((entry) => entry.id === player.id);
      if (current) this.broadcast({ type: "state", id: player.id, state: current.state });
      const itemSignature = snapshot.items.map((item) => `${item.id}:${item.heldBy ?? ""}`).join("|");
      if (itemSignature !== this.lastItemSignature) {
        this.lastItemSignature = itemSignature;
        this.broadcast({ type: "game", game: snapshot });
      }
    } else {
      for (const outgoing of messages) this.broadcast(outgoing);
    }

    this.persist(message.type !== "state");
  }

  async webSocketClose(socket: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
    await this.ready;
    const attachment = socket.deserializeAttachment() as SocketAttachment | null;
    if (attachment && this.room) {
      this.broadcast({
        type: "playerLeft",
        id: attachment.playerId,
        hostId: this.room.hostId,
        playerCount: this.connectedPlayerCount(),
      });
    }
    try { socket.close(code, reason); } catch { /* already closed */ }
    if (!wasClean) this.persist(true);
  }

  async webSocketError(socket: WebSocket): Promise<void> {
    try { socket.close(1011, "websocket error"); } catch { /* already closed */ }
  }

  private broadcast(message: unknown, except?: WebSocket) {
    const payload = JSON.stringify(message);
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === except) continue;
      try { socket.send(payload); } catch { /* connection cleanup follows */ }
    }
  }

  private connectedPlayerCount() {
    const ids = new Set<string>();
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment() as SocketAttachment | null;
      if (attachment?.playerId) ids.add(attachment.playerId);
    }
    return ids.size;
  }

  private broadcastPlayerJoined(playerId: string, except: WebSocket) {
    if (!this.room) return;
    const snapshot = mazeGameSnapshot(this.room.maze);
    const player = snapshot.players.find((entry) => entry.id === playerId);
    if (!player) return;
    this.broadcast({
      type: "playerJoined",
      player,
      hostId: this.room.hostId,
      playerCount: this.connectedPlayerCount(),
    }, except);
  }

  private persist(forceD1: boolean) {
    if (!this.room) return;
    const stored = clone(this.room);
    this.ctx.waitUntil(this.ctx.storage.put("room", stored));

    const now = Date.now();
    if (!forceD1 && now - this.lastD1SyncAt < 5_000) return;
    this.lastD1SyncAt = now;
    if (!this.env.DB) return;
    this.d1Sync = this.d1Sync
      .catch(() => undefined)
      .then(async () => {
        await this.env.DB!.prepare(`UPDATE rooms
          SET state = json_set(
            state,
            '$.game.maze', json(?),
            '$.revision', COALESCE(CAST(json_extract(state, '$.revision') AS INTEGER), 0) + 1
          ),
          updated_at = CURRENT_TIMESTAMP
          WHERE code = ? AND json_extract(state, '$.game.id') = 'maze-courier'`)
          .bind(JSON.stringify(stored.maze), stored.roomCode)
          .run();
      });
    this.ctx.waitUntil(this.d1Sync);
  }
}
