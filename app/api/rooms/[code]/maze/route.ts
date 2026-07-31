import { applyMazeMessage, mazeGameSnapshot, mazeWelcome, type MazeState } from "../../../_lib/maze";
import { authenticatePlayer } from "../../../_lib/session";
import { readRoom, writeRoomIfRevision, type RoomState } from "../../../_lib/rooms";

function normalizeCode(value: string) {
  return value.replace(/\D/g, "").slice(0, 4);
}

async function load(context: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = await context.params;
  const code = normalizeCode(rawCode);
  return code.length === 4 ? readRoom(code) : null;
}

function mazeFrom(room: RoomState) {
  const game = room.game as { id?: string; maze?: MazeState } | undefined;
  return game?.id === "maze-courier" ? game.maze : undefined;
}

export async function GET(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const room = await load(context);
    if (!room) return Response.json({ error: "방을 찾을 수 없어요." }, { status: 404 });
    const viewer = await authenticatePlayer(request, room);
    if (!viewer) return Response.json({ error: "방에 다시 참가해 주세요." }, { status: 401 });
    const maze = mazeFrom(room);
    if (!maze || room.view !== "game") return Response.json({ error: "미로의 배달부가 진행 중이 아니에요." }, { status: 409 });
    const welcome = new URL(request.url).searchParams.get("welcome") === "1";
    const message = welcome
      ? { ...mazeWelcome(maze, viewer.id, room.hostId), room: room.code }
      : { type: "game", game: mazeGameSnapshot(maze) };
    return Response.json({ messages: [message] }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "게임 상태를 불러오지 못했어요." }, { status: 500 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  let message: Record<string, unknown>;
  try {
    message = await request.json() as Record<string, unknown>;
  } catch {
    return Response.json({ error: "잘못된 게임 요청이에요." }, { status: 400 });
  }

  for (let attempt = 0; attempt < 7; attempt += 1) {
    try {
      const room = await load(context);
      if (!room) return Response.json({ error: "방을 찾을 수 없어요." }, { status: 404 });
      const viewer = await authenticatePlayer(request, room);
      if (!viewer) return Response.json({ error: "방에 다시 참가해 주세요." }, { status: 401 });
      const maze = mazeFrom(room);
      if (!maze || room.view !== "game") return Response.json({ error: "미로의 배달부가 진행 중이 아니에요." }, { status: 409 });
      const messages = applyMazeMessage(maze, viewer, room.hostId, message);
      const expectedRevision = room.revision ?? 0;
      if (await writeRoomIfRevision(room, expectedRevision)) {
        return Response.json({ messages }, { headers: { "Cache-Control": "no-store" } });
      }
    } catch {
      return Response.json({ error: "게임 요청을 처리하지 못했어요." }, { status: 500 });
    }
  }
  return Response.json({ error: "다른 참가자의 입력과 겹쳤어요. 다시 시도해 주세요." }, { status: 409 });
}
