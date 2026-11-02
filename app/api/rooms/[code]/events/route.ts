import { waitForRoomUpdate } from "../../../_lib/realtime";
import { readRoom, readRoomRevision, toClientRoom } from "../../../_lib/rooms";
import { authenticatePlayer } from "../../../_lib/session";
import { readClubUpdate } from "../../../_lib/rooms";
import { isFastClub } from "../../../_lib/club-fast";

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
    const shouldWait = new URL(request.url).searchParams.get("wait") === "1";
    if (!shouldWait) return Response.json({ revision: room.revision ?? 0 }, { headers: { "Cache-Control": "no-store" } });
    const swarmRunning = room.view === "game" && room.game?.id === "swarm-territory";
    if (isFastClub(room.game?.id) || swarmRunning) {
      // One read supplies both revision and state; no CREATE/second SELECT on
      // each wake. Other games retain their existing polling path and cadence.
      const snapshot = await waitForRoomUpdate(initialRevision, request.signal, async known => {
        const update = await readClubUpdate(code, known);
        if (!update) return { revision: known + 1, room: null };
        const latest = update.room;
        if (latest && !latest.players.some(p => p.id === viewer.id && p.sessionHash === viewer.sessionHash)) return { revision: update.revision, room: null };
        return latest ? { revision: update.revision, room: toClientRoom(latest, viewer.id) } : { revision: update.revision };
      }, swarmRunning ? 1_000 : 100);
      return Response.json(snapshot, { headers: { "Cache-Control": "no-store" } });
    }
    const snapshot = await waitForRoomUpdate(initialRevision, request.signal, async (knownRevision) => {
      const revision = await readRoomRevision(code);
      if (revision === null) return { revision: knownRevision + 1, room: null };
      if (revision <= knownRevision) return { revision };
      const latestRoom = await readRoom(code);
      return { revision, room: latestRoom ? toClientRoom(latestRoom, viewer.id) : null };
    });
    return Response.json(snapshot, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "실시간 연결을 시작하지 못했어요." }, { status: 500 });
  }
}
