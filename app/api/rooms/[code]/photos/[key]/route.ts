import { env } from "cloudflare:workers";
import { readRoom } from "../../../../_lib/rooms";
import { authenticatePlayer } from "../../../../_lib/session";
import type { GameRound } from "../../../../_lib/rounds";

function bucket() {
  const value = (env as unknown as { UPLOADS?: R2Bucket }).UPLOADS;
  if (!value) throw new Error("UPLOAD_BUCKET_UNAVAILABLE");
  return value;
}

export async function GET(request: Request, context: { params: Promise<{ code: string; key: string }> }) {
  try {
    const { code: rawCode, key: rawKey } = await context.params;
    const code = rawCode.replace(/\D/g, "").slice(0, 4);
    const key = rawKey.replace(/[^a-z0-9]/gi, "").slice(0, 40);
    const room = await readRoom(code);
    if (!room) return new Response("Not found", { status: 404 });
    const viewer = await authenticatePlayer(request, room);
    if (!viewer) return new Response("Unauthorized", { status: 401 });
    const game = room.game as GameRound | undefined;
    if (!game?.photoSubmissions?.some((item) => item.key === key)) return new Response("Not found", { status: 404 });
    const object = await bucket().get(`${code}/${key}`);
    if (!object?.body) return new Response("Not found", { status: 404 });
    return new Response(object.body, { headers: { "Content-Type": object.httpMetadata?.contentType ?? "image/jpeg", "Cache-Control": "private, max-age=3600" } });
  } catch {
    return new Response("Image unavailable", { status: 502 });
  }
}
