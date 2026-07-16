import { checkRateLimit, deleteRoom, readRoom, toClientRoom, writeRoom, type Player } from "../../_lib/rooms";
import { GAME_IDS, makeRound } from "../../_lib/rounds";
import { authenticatePlayer, createSession, sessionCookie } from "../../_lib/session";

function normalizeCode(code: string) {
  return code.replace(/\D/g, "").slice(0, 4);
}

function cleanProfile(value: unknown): Pick<Player, "name" | "avatar"> | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<Player>;
  const name = String(raw.name ?? "").trim().slice(0, 10);
  const avatar = String(raw.avatar ?? "🙂").slice(0, 4);
  return name ? { name, avatar } : null;
}

async function getRoom(context: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = await context.params;
  const code = normalizeCode(rawCode);
  return code.length === 4 ? readRoom(code) : null;
}

export async function GET(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const room = await getRoom(context);
    if (!room) {
      const rate = await checkRateLimit(request, "lookup", 40, 60);
      if (!rate.allowed) return Response.json({ error: "조회가 너무 많아요. 잠시 후 다시 시도해 주세요." }, { status: 429, headers: { "Retry-After": String(rate.retryAfter) } });
      return Response.json({ error: "방을 찾을 수 없어요." }, { status: 404 });
    }
    const viewer = await authenticatePlayer(request, room);
    if (!viewer) {
      const rate = await checkRateLimit(request, "lookup", 40, 60);
      if (!rate.allowed) return Response.json({ error: "조회가 너무 많아요. 잠시 후 다시 시도해 주세요." }, { status: 429, headers: { "Retry-After": String(rate.retryAfter) } });
    }
    return Response.json({ room: toClientRoom(room, viewer?.id) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "방 정보를 불러오지 못했어요." }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const room = await getRoom(context);
    if (!room) return Response.json({ error: "방을 찾을 수 없어요." }, { status: 404 });
    const payload = (await request.json()) as { action?: string; player?: unknown; gameId?: string; view?: string; entries?: string[] };

    if (payload.action === "join") {
      const existing = await authenticatePlayer(request, room);
      if (existing) return Response.json({ room: toClientRoom(room, existing.id) });
      const rate = await checkRateLimit(request, "join", 12, 60);
      if (!rate.allowed) return Response.json({ error: "참가 시도가 너무 많아요. 잠시 후 다시 시도해 주세요." }, { status: 429, headers: { "Retry-After": String(rate.retryAfter) } });
      const profile = cleanProfile(payload.player);
      if (!profile) return Response.json({ error: "이름을 입력해 주세요." }, { status: 400 });
      if (room.players.length >= 12) return Response.json({ error: "방이 가득 찼어요." }, { status: 409 });
      if (room.players.some((item) => item.name.toLowerCase() === profile.name.toLowerCase())) return Response.json({ error: "이미 사용 중인 이름이에요." }, { status: 409 });

      const session = await createSession();
      const player: Player = {
        ...profile,
        id: session.playerId,
        sessionHash: session.tokenHash,
        joinedAt: Date.now(),
        status: room.view === "lobby" || room.view === "hub" ? "active" : "waiting",
      };
      room.players.push(player);
      await writeRoom(room);
      return Response.json({ room: toClientRoom(room, player.id) }, { headers: { "Set-Cookie": sessionCookie(room.code, session.token) } });
    }

    const viewer = await authenticatePlayer(request, room);
    if (!viewer) return Response.json({ error: "참가 인증이 만료됐어요. 방에 다시 참가해 주세요." }, { status: 401 });

    if (payload.action === "start-game") {
      if (viewer.id !== room.hostId) return Response.json({ error: "방장만 할 수 있어요." }, { status: 403 });
      if (!payload.gameId || !GAME_IDS.includes(payload.gameId)) return Response.json({ error: "지원하지 않는 게임이에요." }, { status: 400 });
      room.players.forEach((player) => { player.status = "active"; });
      const game = makeRound(payload.gameId, room.players);
      if (!game) return Response.json({ error: "게임을 시작하지 못했어요." }, { status: 400 });
      room.view = "game";
      room.roundNumber += 1;
      room.game = game as unknown as Record<string, unknown>;
      await writeRoom(room);
      return Response.json({ room: toClientRoom(room, viewer.id) });
    }

    if (payload.action === "set-view") {
      if (viewer.id !== room.hostId) return Response.json({ error: "방장만 할 수 있어요." }, { status: 403 });
      if (payload.view !== "hub" && payload.view !== "result") return Response.json({ error: "잘못된 화면 상태예요." }, { status: 400 });
      room.view = payload.view;
      if (payload.view === "hub") {
        room.game = undefined;
        room.players.forEach((player) => { player.status = "active"; });
      }
      await writeRoom(room);
      return Response.json({ room: toClientRoom(room, viewer.id) });
    }

    if (payload.action === "submit-memory") {
      const game = room.game as { storytellerId?: string; memoryEntries?: string[]; memoryReady?: boolean } | undefined;
      if (!game || game.storytellerId !== viewer.id) return Response.json({ error: "작성자만 제출할 수 있어요." }, { status: 403 });
      const entries = (payload.entries ?? []).map((item) => item.trim().slice(0, 80)).filter(Boolean);
      if (entries.length !== 4) return Response.json({ error: "추억 네 문장을 모두 적어 주세요." }, { status: 400 });
      game.memoryEntries = [...entries].sort(() => Math.random() - 0.5);
      game.memoryReady = true;
      await writeRoom(room);
      return Response.json({ room: toClientRoom(room, viewer.id) });
    }

    if (payload.action === "leave") {
      room.players = room.players.filter((item) => item.id !== viewer.id);
      if (room.players.length === 0) {
        await deleteRoom(room.code);
        return Response.json({ room: null }, { headers: { "Set-Cookie": sessionCookie(room.code, "", true) } });
      }
      if (room.hostId === viewer.id) {
        const nextHost = room.players.find((player) => player.status === "active") ?? room.players[0];
        nextHost.status = "active";
        room.hostId = nextHost.id;
      }
      await writeRoom(room);
      return Response.json({ room: toClientRoom(room) }, { headers: { "Set-Cookie": sessionCookie(room.code, "", true) } });
    }

    return Response.json({ error: "지원하지 않는 요청이에요." }, { status: 400 });
  } catch {
    return Response.json({ error: "요청을 처리하지 못했어요." }, { status: 500 });
  }
}
