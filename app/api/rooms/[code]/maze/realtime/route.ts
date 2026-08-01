import { env } from "cloudflare:workers";
import { readRoom, type Player, type RoomState } from "../../../../_lib/rooms";
import { authenticatePlayer } from "../../../../_lib/session";
import type { MazeState } from "../../../../_lib/maze";

type RealtimeBindings = {
  MAZE_REALTIME_SECRET?: string;
  MAZE_REALTIME_URL?: string;
};

function normalizeCode(value: string) {
  return value.replace(/\D/g, "").slice(0, 4);
}

function mazeFrom(room: RoomState) {
  const game = room.game as { id?: string; maze?: MazeState } | undefined;
  return game?.id === "maze-courier" ? game.maze : undefined;
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

async function signedToken(secret: string, payload: Record<string, unknown>) {
  const body = base64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  return `${body}.${base64Url(signature)}`;
}

function realtimePlayer(player: Player): Player {
  return { ...player, sessionHash: "" };
}

export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const { code: rawCode } = await context.params;
    const code = normalizeCode(rawCode);
    const room = code.length === 4 ? await readRoom(code) : null;
    if (!room) return Response.json({ error: "방을 찾을 수 없습니다." }, { status: 404 });
    const viewer = await authenticatePlayer(request, room);
    if (!viewer) return Response.json({ error: "방에 다시 참가해 주세요." }, { status: 401 });
    const maze = mazeFrom(room);
    if (!maze || room.view !== "game") return Response.json({ error: "미로의 배달부가 진행 중이 아닙니다." }, { status: 409 });

    const bindings = env as unknown as RealtimeBindings;
    const secret = bindings.MAZE_REALTIME_SECRET;
    const endpoint = bindings.MAZE_REALTIME_URL?.replace(/\/$/, "");
    if (!secret || !endpoint) return Response.json({ error: "실시간 서버가 준비되지 않았습니다." }, { status: 503 });

    const expiresAt = Date.now() + 60_000;
    const bootstrap = await signedToken(secret, {
      version: 1,
      kind: "bootstrap",
      expiresAt,
      roomCode: code,
      hostId: room.hostId,
      players: room.players.map(realtimePlayer),
      maze,
    });
    const ticket = await signedToken(secret, {
      version: 1,
      kind: "connect",
      expiresAt,
      roomCode: code,
      playerId: viewer.id,
      startedAt: maze.startedAt,
    });
    return Response.json({ endpoint, bootstrap, ticket }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "실시간 접속권을 만들지 못했습니다." }, { status: 500 });
  }
}
