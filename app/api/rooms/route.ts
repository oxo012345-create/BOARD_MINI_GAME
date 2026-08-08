import { checkRateLimit, createRoom, removeExpiredRooms, toClientRoom, type Player, type RoomState } from "../_lib/rooms";
import { createSession, sessionCookie } from "../_lib/session";

function cleanProfile(value: unknown): Pick<Player, "name" | "avatar"> | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<Player>;
  const name = String(raw.name ?? "").trim().slice(0, 10);
  const avatar = String(raw.avatar ?? "🙂").slice(0, 4);
  if (!name) return null;
  return { name, avatar };
}

export async function POST(request: Request) {
  try {
    const rate = await checkRateLimit(request, "create", 8, 60);
    if (!rate.allowed) return Response.json({ error: "방을 너무 많이 만들었어요. 잠시 후 다시 시도해 주세요." }, { status: 429, headers: { "Retry-After": String(rate.retryAfter) } });
    const payload = (await request.json()) as { player?: unknown };
    const profile = cleanProfile(payload.player);
    if (!profile) return Response.json({ error: "이름을 입력해 주세요." }, { status: 400 });
    const session = await createSession();
    const player: Player = { ...profile, id: session.playerId, sessionHash: session.tokenHash, joinedAt: Date.now(), lastSeen: Date.now(), status: "active" };

    await removeExpiredRooms();
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const code = String(Math.floor(1000 + Math.random() * 9000));
      const room: RoomState = {
        code,
        hostId: player.id,
        players: [player],
        view: "lobby",
        roundNumber: 0,
        surpriseEnabled: true,
      };
      if (await createRoom(room)) return Response.json({ room: toClientRoom(room, player.id) }, { status: 201, headers: { "Set-Cookie": sessionCookie(code, session.token) } });
    }
    return Response.json({ error: "방을 만들지 못했어요. 다시 시도해 주세요." }, { status: 503 });
  } catch (error) {
    const message = error instanceof Error && error.message === "ROOM_DATABASE_UNAVAILABLE"
      ? "방 저장소를 준비하지 못했어요."
      : "잠시 후 다시 시도해 주세요.";
    return Response.json({ error: message }, { status: 500 });
  }
}
