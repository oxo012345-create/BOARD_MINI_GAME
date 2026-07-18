import { createRoomEventStreamResponse } from "../../../_lib/realtime";
import { readRoom, readRoomRevision, toClientRoom } from "../../../_lib/rooms";
import { authenticatePlayer } from "../../../_lib/session";

function normalizeCode(code: string) {
  return code.replace(/\D/g, "").slice(0, 4);
}

export async function GET(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const { code: rawCode } = await context.params;
    const code = normalizeCode(rawCode);
    if (code.length !== 4) return Response.json({ error: "방 코드를 확인해 주세요." }, { status: 400 });
    const room = await readRoom(code);
    if (!room) return Response.json({ error: "방을 찾을 수 없어요." }, { status: 404 });
    const viewer = await authenticatePlayer(request, room);
    if (!viewer) return Response.json({ error: "방에 다시 참가해 주세요." }, { status: 401 });
    const requestedRevision = Math.max(0, Number(new URL(request.url).searchParams.get("revision")) || 0);
    const initialRevision = Math.min(room.revision ?? 0, requestedRevision);
    return createRoomEventStreamResponse(initialRevision, async (knownRevision) => {
      const revision = await readRoomRevision(code);
      if (revision === null) return { revision: knownRevision + 1, room: null };
      if (revision <= knownRevision) return { revision };
      const latestRoom = await readRoom(code);
      return { revision, room: latestRoom ? toClientRoom(latestRoom, viewer.id) : null };
    });
  } catch {
    return Response.json({ error: "실시간 연결을 시작하지 못했어요." }, { status: 500 });
  }
}
