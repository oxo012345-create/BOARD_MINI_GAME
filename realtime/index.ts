import { MazeRoom } from "../worker/maze-room";

export { MazeRoom };

type Env = {
  MAZE_ROOMS: DurableObjectNamespace;
  MAZE_REALTIME_SECRET: string;
  ALLOWED_ORIGIN: string;
};

type TokenPayload = {
  version: number;
  kind: "bootstrap" | "connect";
  expiresAt: number;
  roomCode: string;
  playerId?: string;
  startedAt?: number;
  hostId?: string;
  players?: unknown[];
  maze?: unknown;
};

function decodeBase64Url(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(normalized);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function verifyToken(secret: string, token: string): Promise<TokenPayload | null> {
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra) return null;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify("HMAC", key, decodeBase64Url(signature), new TextEncoder().encode(body));
  if (!valid) return null;
  const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(body))) as TokenPayload;
  if (payload.version !== 1 || payload.expiresAt < Date.now() || !/^\d{4}$/.test(payload.roomCode)) return null;
  return payload;
}

function cors(env: Env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

function json(env: Env, value: unknown, status = 200) {
  return Response.json(value, { status, headers: { ...cors(env), "Cache-Control": "no-store" } });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    if (origin && origin !== env.ALLOWED_ORIGIN) return json(env, { error: "ORIGIN_NOT_ALLOWED" }, 403);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(env) });

    if (request.method === "POST" && url.pathname === "/bootstrap") {
      const { token } = await request.json<{ token?: string }>();
      const payload = token ? await verifyToken(env.MAZE_REALTIME_SECRET, token) : null;
      if (!payload || payload.kind !== "bootstrap" || !payload.hostId || !payload.players || !payload.maze) {
        return json(env, { error: "INVALID_BOOTSTRAP" }, 401);
      }
      const stub = env.MAZE_ROOMS.get(env.MAZE_ROOMS.idFromName(payload.roomCode));
      const response = await stub.fetch("https://maze-room/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomCode: payload.roomCode, hostId: payload.hostId, players: payload.players, maze: payload.maze }),
      });
      return json(env, { ok: response.ok }, response.ok ? 200 : 503);
    }

    if (url.pathname === "/connect" && request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      const payload = await verifyToken(env.MAZE_REALTIME_SECRET, url.searchParams.get("ticket") ?? "");
      if (!payload || payload.kind !== "connect" || !payload.playerId) return new Response("Unauthorized", { status: 401 });
      const stub = env.MAZE_ROOMS.get(env.MAZE_ROOMS.idFromName(payload.roomCode));
      return stub.fetch("https://maze-room/connect", { headers: { Upgrade: "websocket", "x-maze-player-id": payload.playerId } });
    }

    if (url.pathname === "/health") return json(env, { ok: true, service: "hanpan-maze-realtime" });
    return json(env, { error: "NOT_FOUND" }, 404);
  },
};
