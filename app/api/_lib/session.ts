import type { Player, RoomState } from "./rooms";

const COOKIE_PREFIX = "hanpan_room_";

function bytesToHex(bytes: Uint8Array) {
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function hashToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return bytesToHex(new Uint8Array(digest));
}

export async function createSession() {
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll("-", "");
  return { token, tokenHash: await hashToken(token), playerId: crypto.randomUUID() };
}

export function getSessionToken(request: Request, code: string) {
  const name = `${COOKIE_PREFIX}${code}`;
  const cookies = request.headers.get("cookie") ?? "";
  for (const part of cookies.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return "";
}

export function sessionCookie(code: string, token: string, remove = false) {
  const maxAge = remove ? 0 : 60 * 60 * 24;
  return `${COOKIE_PREFIX}${code}=${remove ? "" : encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export async function authenticatePlayer(request: Request, room: RoomState): Promise<Player | null> {
  const token = getSessionToken(request, room.code);
  if (!token) return null;
  const tokenHash = await hashToken(token);
  return room.players.find((player) => player.sessionHash === tokenHash) ?? null;
}
