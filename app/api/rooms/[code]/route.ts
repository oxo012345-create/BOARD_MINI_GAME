import { deleteRoom, readRoom, writeRoom, type Player, type RoomState } from "../../_lib/rooms";

function normalizeCode(code: string) {
  return code.replace(/\D/g, "").slice(0, 4);
}

function cleanPlayer(value: unknown): Player | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<Player>;
  const id = String(raw.id ?? "").slice(0, 80);
  const name = String(raw.name ?? "").trim().slice(0, 10);
  const avatar = String(raw.avatar ?? "🙂").slice(0, 4);
  if (!id || !name) return null;
  return { id, name, avatar, joinedAt: Date.now() };
}

export async function GET(_request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const { code: rawCode } = await context.params;
    const code = normalizeCode(rawCode);
    const room = code.length === 4 ? await readRoom(code) : null;
    if (!room) return Response.json({ error: "방을 찾을 수 없어요." }, { status: 404 });
    return Response.json({ room }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "방 정보를 불러오지 못했어요." }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const { code: rawCode } = await context.params;
    const code = normalizeCode(rawCode);
    const room = code.length === 4 ? await readRoom(code) : null;
    if (!room) return Response.json({ error: "방을 찾을 수 없어요." }, { status: 404 });

    const payload = (await request.json()) as {
      action?: string;
      player?: unknown;
      playerId?: string;
      state?: RoomState;
      entries?: string[];
    };

    if (payload.action === "join") {
      const player = cleanPlayer(payload.player);
      if (!player) return Response.json({ error: "이름을 입력해 주세요." }, { status: 400 });
      if (!room.players.some((item) => item.id === player.id)) {
        if (room.players.length >= 12) return Response.json({ error: "방이 가득 찼어요." }, { status: 409 });
        if (room.players.some((item) => item.name.toLowerCase() === player.name.toLowerCase())) {
          return Response.json({ error: "이미 사용 중인 이름이에요." }, { status: 409 });
        }
        room.players.push(player);
      }
      await writeRoom(room);
      return Response.json({ room });
    }

    if (payload.action === "set-state") {
      if (payload.playerId !== room.hostId) return Response.json({ error: "방장만 할 수 있어요." }, { status: 403 });
      if (!payload.state || payload.state.code !== room.code) return Response.json({ error: "잘못된 방 상태예요." }, { status: 400 });
      const next: RoomState = {
        ...payload.state,
        code: room.code,
        hostId: room.hostId,
        players: room.players,
      };
      await writeRoom(next);
      return Response.json({ room: next });
    }

    if (payload.action === "submit-memory") {
      const game = room.game as { storytellerId?: string; memoryEntries?: string[]; memoryReady?: boolean } | undefined;
      if (!game || game.storytellerId !== payload.playerId) {
        return Response.json({ error: "작성자만 제출할 수 있어요." }, { status: 403 });
      }
      const entries = (payload.entries ?? []).map((item) => item.trim().slice(0, 80)).filter(Boolean);
      if (entries.length !== 4) return Response.json({ error: "추억 네 문장을 모두 적어 주세요." }, { status: 400 });
      game.memoryEntries = [...entries].sort(() => Math.random() - 0.5);
      game.memoryReady = true;
      room.game = game as Record<string, unknown>;
      await writeRoom(room);
      return Response.json({ room });
    }

    if (payload.action === "leave") {
      room.players = room.players.filter((item) => item.id !== payload.playerId);
      if (room.players.length === 0) {
        await deleteRoom(room.code);
        return Response.json({ room: null });
      }
      if (room.hostId === payload.playerId) room.hostId = room.players[0].id;
      await writeRoom(room);
      return Response.json({ room });
    }

    return Response.json({ error: "지원하지 않는 요청이에요." }, { status: 400 });
  } catch {
    return Response.json({ error: "요청을 처리하지 못했어요." }, { status: 500 });
  }
}
