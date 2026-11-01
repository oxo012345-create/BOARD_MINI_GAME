import { submitIndividualClub, readExistingClubRoom, toClientRoom, writeRoomIfRevision } from '../../../_lib/rooms';
import { authenticatePlayer } from '../../../_lib/session';
import { commitClubAction, isFastClub } from '../../../_lib/club-fast';
import { tickSurprise } from '../../../_lib/surprise';

/** Existing rooms only: keep gameplay free of schema-creation queries.
 * The general room endpoint remains compatible with already-open clients. */
export async function PATCH(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await context.params;
    if (!/^\d{4}$/.test(code)) return Response.json({ error: '방 코드를 확인해 주세요.' }, { status: 400 });
    const payload = await request.json() as Record<string, unknown>;
    if (!['club-guess', 'club-secret', 'club-shot'].includes(String(payload.action))) return Response.json({ error: '지원하지 않는 행동이에요.' }, { status: 422 });
    const room = await readExistingClubRoom(code);
    if (!room) return Response.json({ error: '방을 찾을 수 없어요.' }, { status: 404 });
    const viewer = await authenticatePlayer(request, room);
    if (!viewer) return Response.json({ error: '방에 다시 참가해 주세요.' }, { status: 401 });
    if (!isFastClub(room.game?.id)) return Response.json({ error: '진행 중인 경기가 없어요.' }, { status: 409 });
    const result = await commitClubAction(room, viewer.id, viewer.sessionHash, payload, { read: readExistingClubRoom, write: writeRoomIfRevision, tick: tickSurprise, submitIndividual: submitIndividualClub });
    return result.room ? Response.json({ room: toClientRoom(result.room, viewer.id) }) : Response.json({ error: result.error, code: result.code }, { status: result.status });
  } catch {
    return Response.json({ error: '입력을 처리하지 못했어요. 다시 시도해 주세요.' }, { status: 500 });
  }
}
