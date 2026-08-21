/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
export { MazeRoom } from "./maze-room";
export { SiegeRoom } from "./siege-room";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  MAZE_ROOMS: DurableObjectNamespace;
  SIEGE_ROOMS: DurableObjectNamespace;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

type RoomRow = { state: string };

function normalizeRoomCode(value: string) {
  return value.replace(/\D/g, "").slice(0, 4);
}

async function hashSessionToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function sessionToken(request: Request, code: string) {
  const cookieName = `hanpan_room_${code}`;
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === cookieName) return decodeURIComponent(value.join("="));
  }
  return "";
}

async function handleMazeSocket(request: Request, env: Env, code: string) {
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
    return Response.json({ error: "WEBSOCKET_REQUIRED" }, { status: 426 });
  }
  if (!env.MAZE_ROOMS) {
    return Response.json({ error: "REALTIME_BINDING_UNAVAILABLE" }, { status: 501 });
  }
  const row = await env.DB.prepare("SELECT state FROM rooms WHERE code = ?").bind(code).first<RoomRow>();
  if (!row) return Response.json({ error: "ROOM_NOT_FOUND" }, { status: 404 });

  const room = JSON.parse(row.state) as {
    code: string;
    hostId: string;
    view: string;
    players: Array<{ id: string; name: string; avatar: string; joinedAt: number; lastSeen: number; sessionHash: string; status: "active" | "waiting" }>;
    game?: { id?: string; maze?: unknown };
  };
  const token = sessionToken(request, code);
  const tokenHash = token ? await hashSessionToken(token) : "";
  const viewer = room.players.find((player) => player.sessionHash === tokenHash);
  if (!viewer) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (room.view !== "game" || room.game?.id !== "maze-courier" || !room.game.maze) {
    return Response.json({ error: "MAZE_NOT_RUNNING" }, { status: 409 });
  }

  const roomId = env.MAZE_ROOMS.idFromName(code);
  const stub = env.MAZE_ROOMS.get(roomId);
  const bootstrap = await stub.fetch("https://maze-room/bootstrap", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomCode: code, hostId: room.hostId, players: room.players, maze: room.game.maze }),
  });
  if (!bootstrap.ok) return Response.json({ error: "REALTIME_ROOM_UNAVAILABLE" }, { status: 503 });

  return stub.fetch("https://maze-room/connect", {
    headers: { Upgrade: "websocket", "x-maze-player-id": viewer.id },
  });
}

async function handleSiegeSocket(request: Request, env: Env, code: string) {
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
    return Response.json({ error: "WEBSOCKET_REQUIRED" }, { status: 426 });
  }
  if (!env.SIEGE_ROOMS) {
    return Response.json({ error: "REALTIME_BINDING_UNAVAILABLE" }, { status: 501 });
  }
  const row = await env.DB.prepare("SELECT state FROM rooms WHERE code = ?").bind(code).first<RoomRow>();
  if (!row) return Response.json({ error: "ROOM_NOT_FOUND" }, { status: 404 });

  const room = JSON.parse(row.state) as {
    hostId: string;
    view: string;
    players: Array<{ id: string; name: string; sessionHash: string }>;
    game?: { id?: string; siegeWar?: { startedAt: number; teams: { A: string[]; B: string[] }; botIds: string[] } };
  };
  const token = sessionToken(request, code);
  const tokenHash = token ? await hashSessionToken(token) : "";
  const viewer = room.players.find((player) => player.sessionHash === tokenHash);
  if (!viewer) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const siege = room.game?.siegeWar;
  if (room.view !== "game" || room.game?.id !== "siege-war" || !siege) {
    return Response.json({ error: "SIEGE_NOT_RUNNING" }, { status: 409 });
  }

  const stub = env.SIEGE_ROOMS.get(env.SIEGE_ROOMS.idFromName(code));
  const bootstrap = await stub.fetch("https://siege-room/bootstrap", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      roomCode: code,
      startedAt: siege.startedAt,
      teams: siege.teams,
      botIds: siege.botIds ?? [],
      players: room.players.map((player) => ({ id: player.id, name: player.name })),
    }),
  });
  if (!bootstrap.ok) return Response.json({ error: "REALTIME_ROOM_UNAVAILABLE" }, { status: 503 });

  return stub.fetch("https://siege-room/connect", {
    headers: { Upgrade: "websocket", "x-siege-player-id": viewer.id },
  });
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    const mazeSocketMatch = url.pathname.match(/^\/api\/rooms\/(\d{4})\/maze\/socket$/);
    if (mazeSocketMatch) {
      return handleMazeSocket(request, env, normalizeRoomCode(mazeSocketMatch[1]));
    }

    const siegeStatsMatch = url.pathname.match(/^\/api\/rooms\/(\d{4})\/siege\/stats$/);
    if (siegeStatsMatch) {
      try {
        if (!env.SIEGE_ROOMS) return Response.json({ error: "NO_BINDING" }, { status: 501 });
        const code = normalizeRoomCode(siegeStatsMatch[1]);
        const stub = env.SIEGE_ROOMS.get(env.SIEGE_ROOMS.idFromName(code));
        return await stub.fetch("https://siege-room/stats");
      } catch (error) {
        return Response.json({
          error: "SIEGE_STATS_FAILED",
          detail: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? String(error.stack).slice(0, 900) : "",
        }, { status: 500 });
      }
    }

    const siegeSocketMatch = url.pathname.match(/^\/api\/rooms\/(\d{4})\/siege\/socket$/);
    if (siegeSocketMatch) {
      // A throw here would surface to the client as a bare socket hang-up, which
      // is indistinguishable from a network fault. Name the failure instead.
      try {
        return await handleSiegeSocket(request, env, normalizeRoomCode(siegeSocketMatch[1]));
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        console.error("siege socket failed:", detail, error instanceof Error ? error.stack : "");
        return Response.json({ error: "SIEGE_SOCKET_FAILED", detail }, { status: 500 });
      }
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
