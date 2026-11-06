import { clubAction } from './club';
import type { RoomState } from './rooms';
import type { GameRound } from './rounds';
import { canMergeIndividual } from './club-submit';

export const isFastClub = (id: unknown) => id === 'number-baseball' || id === 'alkkagi' || id === 'gomoku';

/** Retry CAS beside D1, instead of making each phone repeat a WAN round trip.
 * Revalidate the session, game and turn against every fresh snapshot. */
export async function commitClubAction(
  initial: RoomState, viewerId: string, sessionHash: string, payload: Record<string, unknown>,
  io: { read: (code: string) => Promise<RoomState | null>; write: (room: RoomState, revision: number) => Promise<boolean>; tick: (room: RoomState) => unknown; submitIndividual?: (room: RoomState, viewerId: string, sessionHash: string, payload: Record<string, unknown>) => Promise<RoomState | null> },
) {
  let room: RoomState | null = initial;
  for (let attempt = 0; attempt < 8; attempt++) {
    if (!room) return { status: 404, error: '방을 찾을 수 없어요.' };
    const viewer = room.players.find(p => p.id === viewerId && p.sessionHash === sessionHash);
    if (!viewer) return { status: 401, error: '방에 다시 참가해 주세요.' };
    const game = room.game as GameRound | undefined;
    if (!isFastClub(game?.id) || !game?.club || !['game', 'result'].includes(room.view)) return { status: 409, error: '진행 중인 경기가 없어요.' };
    const revision = room.revision ?? 0;
    const alreadyApplied = game.club.id === payload.clubId && game.club.processed.includes(String(payload.requestId ?? ''));
    if (io.submitIndividual && payload.action==='club-guess' && canMergeIndividual(game.club) && !alreadyApplied) {
      try { clubAction(structuredClone(game.club), viewer.id, payload); }
      catch (error) { return { status: 422, error: error instanceof Error ? error.message : '입력을 확인해 주세요.' }; }
      const merged = await io.submitIndividual(room, viewer.id, sessionHash, payload);
      if (merged) return { status: 200, room: merged };
      room = await io.read(room.code);
      continue;
    }
    try { clubAction(game.club, viewer.id, payload); }
    catch (error) { return { status: 422, error: error instanceof Error ? error.message : '입력을 확인해 주세요.' }; }
    if (alreadyApplied) return { status: 200, room };
    viewer.lastSeen = Date.now();
    if (game.club.finished) room.view = 'result';
    io.tick(room);
    if (await io.write(room, revision)) return { status: 200, room };
    room = await io.read(room.code);
  }
  return { status: 409, code: 'ROOM_CONFLICT', error: '다른 참가자의 입력을 반영하고 다시 시도해 주세요.' };
}
