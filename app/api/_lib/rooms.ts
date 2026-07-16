import { env } from "cloudflare:workers";

export type Player = {
  id: string;
  name: string;
  avatar: string;
  joinedAt: number;
  sessionHash: string;
  status: "active" | "waiting";
};

export type RoomState = {
  code: string;
  hostId: string;
  players: Player[];
  view: "lobby" | "hub" | "game" | "result";
  roundNumber: number;
  game?: Record<string, unknown>;
};

type PublicPlayer = Omit<Player, "sessionHash">;

export type ClientRoom = Omit<RoomState, "players" | "game"> & {
  players: PublicPlayer[];
  meId?: string;
  authenticated: boolean;
  game?: Record<string, unknown>;
};

export function toClientRoom(room: RoomState, viewerId?: string): ClientRoom {
  const game = room.game ? { ...room.game } : undefined;
  if (game) {
    const answer = typeof game.answer === "string" ? game.answer : undefined;
    const liarId = typeof game.liarId === "string" ? game.liarId : undefined;
    const liarWord = typeof game.liarWord === "string" ? game.liarWord : undefined;
    const storytellerId = typeof game.storytellerId === "string" ? game.storytellerId : undefined;
    const imageSource = typeof game.imageSource === "string" ? game.imageSource : undefined;
    const modifier = game.modifier as { targetId?: string } | undefined;

    delete game.answer;
    delete game.liarId;
    delete game.liarWord;
    delete game.storytellerId;
    delete game.memoryWord;
    delete game.imageSource;
    if (modifier?.targetId && modifier.targetId !== viewerId) delete game.modifier;

    if (room.view === "result") {
      if (answer) game.answer = answer;
      if (liarId) game.liarId = liarId;
      if (storytellerId) game.storytellerId = storytellerId;
      if (imageSource) game.imageSource = imageSource;
    } else if (viewerId) {
      if (["liar", "body-liar", "face-liar"].includes(String(game.id))) {
        game.privateRole = liarId === viewerId
          ? { danger: true, label: "당신은 라이어", value: "들키지 않게 연기하세요" }
          : { danger: false, label: String(game.category ?? "제시어"), value: String(game.prompt ?? "") };
      } else if (game.id === "dumb-liar") {
        game.privateRole = { danger: false, label: "내 제시어", value: liarId === viewerId ? liarWord ?? "?" : String(game.prompt ?? "") };
      } else if (game.id === "unknown") {
        game.privateRole = liarId === viewerId
          ? { danger: true, label: "당신은 범인", value: "질문을 모른 채 자연스럽게 대답하세요" }
          : { danger: false, label: "비밀 질문", value: String(game.prompt ?? "") };
      }
      if (storytellerId === viewerId) {
        game.isStoryteller = true;
        game.memoryWord = room.game?.memoryWord;
      }
    }
    if (room.view !== "result") {
      if (["liar", "dumb-liar"].includes(String(game.id))) game.prompt = "내 단어를 확인하고 자연스럽게 설명하세요";
      if (game.id === "body-liar") game.prompt = "차례대로 몸으로 표현하세요";
      if (game.id === "face-liar") game.prompt = "차례대로 표정만 보여주세요";
      if (game.id === "unknown") game.prompt = "차례대로 질문에 답하세요";
    }
  }

  return {
    code: room.code,
    hostId: room.hostId,
    players: room.players.map((player) => ({ id: player.id, name: player.name, avatar: player.avatar, joinedAt: player.joinedAt, status: player.status })),
    view: room.view,
    roundNumber: room.roundNumber,
    game,
    meId: viewerId,
    authenticated: Boolean(viewerId),
  };
}

type RoomRow = { state: string };

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

export async function createRoom(state: RoomState) {
  await ensureRoomsTable();
  const result = await getD1()
    .prepare("INSERT OR IGNORE INTO rooms (code, state) VALUES (?, ?)")
    .bind(state.code, JSON.stringify(state))
    .run();
  return Number(result.meta.changes ?? 0) === 1;
}

export async function writeRoom(state: RoomState) {
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
