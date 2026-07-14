import { createRoom, removeExpiredRooms, type Player, type RoomState } from "../_lib/rooms";

function cleanPlayer(value: unknown): Player | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<Player>;
  const id = String(raw.id ?? "").slice(0, 80);
  const name = String(raw.name ?? "").trim().slice(0, 10);
  const avatar = String(raw.avatar ?? "🙂").slice(0, 4);
  if (!id || !name) return null;
  return { id, name, avatar, joinedAt: Date.now() };
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { player?: unknown };
    const player = cleanPlayer(payload.player);
    if (!player) return Response.json({ error: "이름을 입력해 주세요." }, { status: 400 });

    await removeExpiredRooms();
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const code = String(Math.floor(1000 + Math.random() * 9000));
      const room: RoomState = {
        code,
        hostId: player.id,
        players: [player],
        view: "lobby",
        roundNumber: 0,
      };
      if (await createRoom(room)) return Response.json({ room }, { status: 201 });
    }
    return Response.json({ error: "방을 만들지 못했어요. 다시 시도해 주세요." }, { status: 503 });
  } catch (error) {
    const message = error instanceof Error && error.message === "ROOM_DATABASE_UNAVAILABLE"
      ? "방 저장소를 준비하지 못했어요."
      : "잠시 후 다시 시도해 주세요.";
    return Response.json({ error: message }, { status: 500 });
  }
}
