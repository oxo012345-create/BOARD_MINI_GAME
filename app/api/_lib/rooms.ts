import { env } from "cloudflare:workers";
import { assignedTelestrationChain, type GameRound } from "./rounds";
import { clientSurprise, type SurpriseState } from "./surprise";

export type Player = {
  id: string;
  name: string;
  avatar: string;
  joinedAt: number;
  lastSeen: number;
  sessionHash: string;
  status: "active" | "waiting";
};

export type RoomState = {
  code: string;
  hostId: string;
  players: Player[];
  view: "lobby" | "hub" | "briefing" | "game" | "result";
  roundNumber: number;
  revision?: number;
  game?: Record<string, unknown>;
  surprise?: SurpriseState;
};

type PublicPlayer = Omit<Player, "sessionHash">;

export type ClientRoom = Omit<RoomState, "players" | "game" | "surprise"> & {
  players: PublicPlayer[];
  meId?: string;
  authenticated: boolean;
  serverNow: number;
  game?: Record<string, unknown>;
  surprise?: Record<string, unknown>;
};

export function toClientRoom(room: RoomState, viewerId?: string): ClientRoom {
  const game = room.game ? JSON.parse(JSON.stringify(room.game)) as Record<string, unknown> : undefined;
  if (game) {
    const internal = room.game as GameRound;
    const answer = typeof game.answer === "string" ? game.answer : undefined;
    const liarId = typeof game.liarId === "string" ? game.liarId : undefined;
    const liarWord = typeof game.liarWord === "string" ? game.liarWord : undefined;
    const storytellerId = typeof game.storytellerId === "string" ? game.storytellerId : undefined;
    const imageSource = typeof game.imageSource === "string" ? game.imageSource : undefined;
    const liarMode = game.liarMode;

    delete game.answer;
    delete game.liarId;
    delete game.liarWord;
    delete game.storytellerId;
    delete game.memoryWord;
    delete game.imageSource;
    delete game.fakeSlot;
    delete game.fakeMemoryIndex;
    delete game.fakeMemoryText;
    delete game.telestrationChains;
    delete game.telestrationOrder;
    delete game.selections;

    if (room.view === "result") {
      if (answer) game.answer = answer;
      if (liarId) game.liarId = liarId;
      if (storytellerId) game.storytellerId = storytellerId;
      if (imageSource) game.imageSource = imageSource;
      if (liarWord) game.liarWord = liarWord;
      if (internal.fakeMemoryIndex) game.fakeMemoryIndex = internal.fakeMemoryIndex;
      if (internal.fakeMemoryText) game.fakeMemoryText = internal.fakeMemoryText;
      if (internal.telestrationChains) game.telestrationResults = internal.telestrationChains;
      if (internal.selections) game.selections = internal.selections;
    } else if (viewerId) {
      if (["liar", "body-liar", "face-liar", "unknown"].includes(String(game.id))) {
        const roleLabel = String(game.category ?? "제시어");
        game.privateRole = liarMode === "dumb"
          ? { danger: false, label: roleLabel, value: liarId === viewerId ? liarWord ?? "?" : String(game.prompt ?? "") }
          : liarId === viewerId
            ? { danger: false, label: `${roleLabel} · 라이어`, value: "당신은 라이어입니다" }
            : { danger: false, label: roleLabel, value: String(game.prompt ?? "") };
      } else if (game.id === "dumb-liar") {
        game.privateRole = { danger: false, label: "내 제시어", value: liarId === viewerId ? liarWord ?? "?" : String(game.prompt ?? "") };
      }
      if (storytellerId === viewerId) {
        game.isStoryteller = true;
        game.fakeSlot = internal.fakeSlot;
      }
      if (internal.memoryWord) game.memoryWord = internal.memoryWord;
      if (internal.selections) {
        game.selectionStatus = Object.keys(internal.selections);
        game.myChoice = internal.selections[viewerId];
      }
      if (internal.telestrationChains) {
        const chain = assignedTelestrationChain(internal, viewerId);
        const round = internal.telestrationRound ?? 1;
        game.telestrationTask = chain ? {
          round,
          deadline: internal.telestrationDeadline,
          submitted: internal.telestrationSubmitted?.includes(viewerId) ?? false,
          prompt: round === 1 ? chain.prompt : undefined,
          previousStrokes: round > 1 ? [...chain.steps].reverse().find((step) => step.strokes)?.strokes ?? [] : undefined,
          action: round === 4 ? "guess" : "draw",
        } : undefined;
      }
    }
    if (room.view !== "result" && Array.isArray(internal.history)) {
      game.history = internal.history.map((item) => ({ prompt: item.prompt, imageId: item.imageId }));
    }
    if (room.view !== "result" && ["initial", "trivia"].includes(String(game.id)) && internal.answerRevealed && answer) game.answer = answer;
    if (room.view !== "result") {
      if (["liar", "dumb-liar"].includes(String(game.id))) game.prompt = "내 단어를 라이어가 모르게 설명하세요.";
      if (game.id === "body-liar") game.prompt = "차례대로 몸으로 표현하세요";
      if (game.id === "face-liar") game.prompt = "차례대로 표정만 보여주세요";
      if (game.id === "unknown") game.prompt = "차례대로 질문에 답하세요";
    }
  }

  return {
    code: room.code,
    hostId: room.hostId,
    players: room.players.map((player) => ({ id: player.id, name: player.name, avatar: player.avatar, joinedAt: player.joinedAt, lastSeen: player.lastSeen, status: player.status })),
    view: room.view,
    roundNumber: room.roundNumber,
    game,
    surprise: clientSurprise(room.surprise, room.players, viewerId),
    meId: viewerId,
    authenticated: Boolean(viewerId),
    serverNow: Date.now(),
  };
}

export function touchAndPrunePlayers(room: RoomState, viewerId?: string) {
  const now = Date.now();
  let changed = false;
  if (viewerId) {
    const viewer = room.players.find((player) => player.id === viewerId);
    if (viewer && now - (viewer.lastSeen || viewer.joinedAt) > 15_000) {
      viewer.lastSeen = now;
      changed = true;
    }
  }
  const before = room.players.length;
  room.players = room.players.filter((player) => player.id === viewerId || now - (player.lastSeen || player.joinedAt) < 30 * 60 * 1000);
  if (room.players.length !== before) changed = true;
  if (room.players.length && !room.players.some((player) => player.id === room.hostId)) {
    room.hostId = room.players[0].id;
    changed = true;
  }
  return changed;
}

type RoomRow = { state: string };
type RoomRevisionRow = { revision: number | null };

function getD1() {
  const db = (env as unknown as { DB?: D1Database }).DB;
  if (!db) throw new Error("ROOM_DATABASE_UNAVAILABLE");
  return db;
}

export async function ensureRoomsTable() {
  await getD1()
    .prepare(`CREATE TABLE IF NOT EXISTS rooms (
      code TEXT PRIMARY KEY,
      state TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`)
    .run();
}

async function ensureRateLimitsTable() {
  await getD1()
    .prepare(`CREATE TABLE IF NOT EXISTS rate_limits (
      key TEXT PRIMARY KEY,
      count INTEGER NOT NULL,
      reset_at INTEGER NOT NULL
    )`)
    .run();
}

export async function checkRateLimit(request: Request, scope: string, limit: number, windowSeconds: number) {
  await ensureRateLimitsTable();
  const ip = request.headers.get("cf-connecting-ip") || "local";
  const key = `${scope}:${ip}`;
  const now = Math.floor(Date.now() / 1000);
  const resetAt = now + windowSeconds;
  const row = await getD1()
    .prepare(`INSERT INTO rate_limits (key, count, reset_at) VALUES (?, 1, ?)
      ON CONFLICT(key) DO UPDATE SET
        count = CASE WHEN rate_limits.reset_at <= ? THEN 1 ELSE rate_limits.count + 1 END,
        reset_at = CASE WHEN rate_limits.reset_at <= ? THEN excluded.reset_at ELSE rate_limits.reset_at END
      RETURNING count, reset_at`)
    .bind(key, resetAt, now, now)
    .first<{ count: number; reset_at: number }>();
  return { allowed: Number(row?.count ?? limit + 1) <= limit, retryAfter: Math.max(1, Number(row?.reset_at ?? resetAt) - now) };
}

export async function readRoom(code: string): Promise<RoomState | null> {
  await ensureRoomsTable();
  const row = await getD1()
    .prepare("SELECT state FROM rooms WHERE code = ?")
    .bind(code)
    .first<RoomRow>();
  if (!row) return null;
  return JSON.parse(row.state) as RoomState;
}

export async function readRoomRevision(code: string): Promise<number | null> {
  await ensureRoomsTable();
  const row = await getD1()
    .prepare("SELECT CAST(COALESCE(json_extract(state, '$.revision'), 0) AS INTEGER) AS revision FROM rooms WHERE code = ?")
    .bind(code)
    .first<RoomRevisionRow>();
  return row ? Number(row.revision ?? 0) : null;
}

export async function createRoom(state: RoomState) {
  await ensureRoomsTable();
  state.revision = Math.max(1, state.revision ?? 1);
  const result = await getD1()
    .prepare("INSERT OR IGNORE INTO rooms (code, state) VALUES (?, ?)")
    .bind(state.code, JSON.stringify(state))
    .run();
  return Number(result.meta.changes ?? 0) === 1;
}

export async function writeRoom(state: RoomState) {
  state.revision = (state.revision ?? 0) + 1;
  const result = await getD1()
    .prepare("UPDATE rooms SET state = ?, updated_at = CURRENT_TIMESTAMP WHERE code = ?")
    .bind(JSON.stringify(state), state.code)
    .run();
  return Number(result.meta.changes ?? 0) === 1;
}

export async function deleteRoom(code: string) {
  await ensureRoomsTable();
  const result = await getD1()
    .prepare("DELETE FROM rooms WHERE code = ?")
    .bind(code)
    .run();
  return Number(result.meta.changes ?? 0) === 1;
}

export async function removeExpiredRooms() {
  await ensureRoomsTable();
  await getD1()
    .prepare("DELETE FROM rooms WHERE updated_at < datetime('now', '-8 hours')")
    .run();
}
