import { env } from "cloudflare:workers";

export type Player = {
  id: string;
  name: string;
  avatar: string;
  joinedAt: number;
};

export type RoomState = {
  code: string;
  hostId: string;
  players: Player[];
  view: "lobby" | "hub" | "game" | "result";
  roundNumber: number;
  game?: Record<string, unknown>;
};

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

export async function removeExpiredRooms() {
  await ensureRoomsTable();
  await getD1()
    .prepare("DELETE FROM rooms WHERE updated_at < datetime('now', '-8 hours')")
    .run();
}
