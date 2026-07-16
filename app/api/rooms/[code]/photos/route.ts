import { env } from "cloudflare:workers";
import { readRoom, toClientRoom, writeRoom } from "../../../_lib/rooms";
import { authenticatePlayer } from "../../../_lib/session";
import type { GameRound } from "../../../_lib/rounds";

function bucket() {
  const value = (env as unknown as { UPLOADS?: R2Bucket }).UPLOADS;
  if (!value) throw new Error("UPLOAD_BUCKET_UNAVAILABLE");
  return value;
}

export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await context.params;
    const room = await readRoom(code.replace(/\D/g, "").slice(0, 4));
    if (!room) return Response.json({ error: "방을 찾을 수 없어요." }, { status: 404 });
    const viewer = await authenticatePlayer(request, room);
    if (!viewer) return Response.json({ error: "참가 인증이 필요해요." }, { status: 401 });
    const game = room.game as GameRound | undefined;
    if (!game || !["color", "object-initial"].includes(game.id)) return Response.json({ error: "사진을 올릴 수 있는 게임이 아니에요." }, { status: 409 });
    if (game.photoSubmissions?.some((item) => item.playerId === viewer.id)) return Response.json({ error: "이미 사진을 제출했어요." }, { status: 409 });
    const form = await request.formData();
    const file = form.get("photo");
    if (!(file instanceof File) || !file.type.startsWith("image/") || file.size < 1 || file.size > 6 * 1024 * 1024) return Response.json({ error: "6MB 이하 사진을 선택해 주세요." }, { status: 400 });
    const key = crypto.randomUUID().replaceAll("-", "");
    await bucket().put(`${room.code}/${key}`, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
    game.photoSubmissions = [...(game.photoSubmissions ?? []), { playerId: viewer.id, key, submittedAt: Date.now() }];
    viewer.lastSeen = Date.now();
    await writeRoom(room);
    return Response.json({ room: toClientRoom(room, viewer.id) });
  } catch {
    return Response.json({ error: "사진을 업로드하지 못했어요." }, { status: 500 });
  }
}
