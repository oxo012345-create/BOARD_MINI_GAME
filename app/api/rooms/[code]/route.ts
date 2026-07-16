import { checkRateLimit, deleteRoom, readRoom, toClientRoom, touchAndPrunePlayers, writeRoom, type Player, type RoomState } from "../../_lib/rooms";
import { advanceCoopQuestion, advanceQuestion, advanceSyllableQuestion, advanceTelestration, assignedTelestrationChain, failCoopQuestion, GAME_IDS, GAME_INFO, getTelestrationCorrectCount, makeRound, removePlayerFromRound, type GameRound, type Stroke } from "../../_lib/rounds";
import { authenticatePlayer, createSession, sessionCookie } from "../../_lib/session";
import { tickSurprise } from "../../_lib/surprise";

function normalizeCode(code: string) { return code.replace(/\D/g, "").slice(0, 4); }

function cleanProfile(value: unknown): Pick<Player, "name" | "avatar"> | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<Player>;
  const name = String(raw.name ?? "").trim().slice(0, 10);
  const avatar = String(raw.avatar ?? "🙂").slice(0, 4);
  return name ? { name, avatar } : null;
}

async function getRoom(context: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = await context.params;
  const code = normalizeCode(rawCode);
  return code.length === 4 ? readRoom(code) : null;
}

function cleanStrokes(value: unknown): Stroke[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 180).map((raw) => {
    const item = raw && typeof raw === "object" ? raw as { eraser?: unknown; points?: unknown } : {};
    const points = Array.isArray(item.points) ? item.points.slice(0, 500).map((point) => {
      const p = point && typeof point === "object" ? point as { x?: unknown; y?: unknown } : {};
      return { x: Math.max(0, Math.min(1, Number(p.x) || 0)), y: Math.max(0, Math.min(1, Number(p.y) || 0)) };
    }) : [];
    return { eraser: Boolean(item.eraser), points };
  }).filter((stroke) => stroke.points.length > 0);
}

function finishTelestrationRound(game: GameRound, players: Player[]) {
  const expected = (game.telestrationOrder ?? []).filter((id) => players.some((player) => player.id === id));
  if (!expected.length || !expected.every((id) => game.telestrationSubmitted?.includes(id))) return false;
  if ((game.telestrationRound ?? 1) >= 4) {
    game.telestrationComplete = true;
    game.telestrationCorrectCount = getTelestrationCorrectCount(game);
    return true;
  }
  return advanceTelestration(game, players);
}

function handleTelestrationTimeout(room: RoomState) {
  const game = room.game as GameRound | undefined;
  if (!game?.telestrationDeadline || Date.now() < game.telestrationDeadline || (game.telestrationRound ?? 0) > 4) return false;
  const submitted = new Set(game.telestrationSubmitted ?? []);
  for (const player of room.players) {
    if (submitted.has(player.id)) continue;
    const chain = assignedTelestrationChain(game, player.id);
    if (!chain) continue;
    chain.steps.push({ playerId: player.id, strokes: [] });
    submitted.add(player.id);
  }
  game.telestrationSubmitted = [...submitted];
  if ((game.telestrationRound ?? 1) < 4) advanceTelestration(game, room.players);
  return true;
}

async function persistAndRespond(room: RoomState, viewerId: string) {
  tickSurprise(room);
  await writeRoom(room);
  return Response.json({ room: toClientRoom(room, viewerId) });
}

export async function GET(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const room = await getRoom(context);
    if (!room) {
      const rate = await checkRateLimit(request, "lookup", 40, 60);
      if (!rate.allowed) return Response.json({ error: "조회가 너무 많아요. 잠시 후 다시 시도해 주세요." }, { status: 429, headers: { "Retry-After": String(rate.retryAfter) } });
      return Response.json({ error: "방을 찾을 수 없어요." }, { status: 404 });
    }
    const viewer = await authenticatePlayer(request, room);
    if (!viewer) {
      const rate = await checkRateLimit(request, "lookup", 40, 60);
      if (!rate.allowed) return Response.json({ error: "조회가 너무 많아요. 잠시 후 다시 시도해 주세요." }, { status: 429, headers: { "Retry-After": String(rate.retryAfter) } });
    }
    const playersChanged = touchAndPrunePlayers(room, viewer?.id);
    const surpriseChanged = tickSurprise(room);
    const telestrationChanged = handleTelestrationTimeout(room);
    const changed = playersChanged || surpriseChanged || telestrationChanged;
    if (!room.players.length) {
      await deleteRoom(room.code);
      return Response.json({ error: "방을 찾을 수 없어요." }, { status: 404 });
    }
    if (changed) await writeRoom(room);
    return Response.json({ room: toClientRoom(room, viewer?.id) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "방 정보를 불러오지 못했어요." }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const room = await getRoom(context);
    if (!room) return Response.json({ error: "방을 찾을 수 없어요." }, { status: 404 });
    const payload = (await request.json()) as {
      action?: string; player?: unknown; gameId?: string; view?: string; mode?: "normal" | "dumb"; entries?: string[];
      choice?: string; seconds?: number; strokes?: unknown; guess?: string;
    };

    if (payload.action === "join") {
      const existing = await authenticatePlayer(request, room);
      if (existing) return Response.json({ room: toClientRoom(room, existing.id) });
      const rate = await checkRateLimit(request, "join", 12, 60);
      if (!rate.allowed) return Response.json({ error: "참가 시도가 너무 많아요. 잠시 후 다시 시도해 주세요." }, { status: 429, headers: { "Retry-After": String(rate.retryAfter) } });
      const profile = cleanProfile(payload.player);
      if (!profile) return Response.json({ error: "이름을 입력해 주세요." }, { status: 400 });
      if (room.players.length >= 12) return Response.json({ error: "방이 가득 찼어요." }, { status: 409 });
      if (room.players.some((item) => item.name.toLowerCase() === profile.name.toLowerCase())) return Response.json({ error: "이미 사용 중인 이름이에요." }, { status: 409 });
      const session = await createSession();
      const now = Date.now();
      const player: Player = { ...profile, id: session.playerId, sessionHash: session.tokenHash, joinedAt: now, lastSeen: now, status: ["lobby", "hub", "briefing"].includes(room.view) ? "active" : "waiting" };
      room.players.push(player);
      await writeRoom(room);
      return Response.json({ room: toClientRoom(room, player.id) }, { headers: { "Set-Cookie": sessionCookie(room.code, session.token) } });
    }

    const viewer = await authenticatePlayer(request, room);
    if (!viewer) return Response.json({ error: "참가 인증이 만료됐어요. 방에 다시 참가해 주세요." }, { status: 401 });
    viewer.lastSeen = Date.now();
    const isHost = viewer.id === room.hostId;

    if (payload.action === "prepare-game") {
      if (!isHost) return Response.json({ error: "방장만 할 수 있어요." }, { status: 403 });
      if (!payload.gameId || !GAME_IDS.includes(payload.gameId)) return Response.json({ error: "지원하지 않는 게임이에요." }, { status: 400 });
      const info = GAME_INFO[payload.gameId];
      room.view = "briefing";
      room.game = { id: payload.gameId, title: info.title, prompt: info.briefing, briefing: info.briefing, liarMode: "normal", startedAt: Date.now() };
      return persistAndRespond(room, viewer.id);
    }

    if (payload.action === "start-game") {
      if (!isHost) return Response.json({ error: "방장만 할 수 있어요." }, { status: 403 });
      const gameId = payload.gameId || String(room.game?.id ?? "");
      if (!GAME_IDS.includes(gameId)) return Response.json({ error: "지원하지 않는 게임이에요." }, { status: 400 });
      room.players.forEach((player) => { player.status = "active"; });
      const game = makeRound(gameId, room.players, payload.mode === "dumb" ? "dumb" : "normal");
      if (!game) return Response.json({ error: "게임을 시작하지 못했어요." }, { status: 400 });
      room.view = "game";
      room.roundNumber += 1;
      room.game = game as unknown as Record<string, unknown>;
      return persistAndRespond(room, viewer.id);
    }

    if (payload.action === "set-view") {
      if (!isHost) return Response.json({ error: "방장만 할 수 있어요." }, { status: 403 });
      if (!["lobby", "hub", "result"].includes(String(payload.view))) return Response.json({ error: "잘못된 화면 상태예요." }, { status: 400 });
      const nextView = String(payload.view) as RoomState["view"];
      room.view = nextView;
      if (nextView === "hub" || nextView === "lobby") {
        room.game = undefined;
        room.players.forEach((player) => { player.status = "active"; });
      }
      return persistAndRespond(room, viewer.id);
    }

    if (payload.action === "leave") {
      const activeGame = room.game as GameRound | undefined;
      removePlayerFromRound(activeGame, viewer.id);
      room.players = room.players.filter((item) => item.id !== viewer.id);
      if (room.players.length === 0) {
        await deleteRoom(room.code);
        return Response.json({ room: null }, { headers: { "Set-Cookie": sessionCookie(room.code, "", true) } });
      }
      if (room.hostId === viewer.id) room.hostId = (room.players.find((player) => player.status === "active") ?? room.players[0]).id;
      if (activeGame?.id === "telestration") {
        finishTelestrationRound(activeGame, room.players);
        if (activeGame.telestrationComplete) room.view = "result";
      }
      await writeRoom(room);
      return Response.json({ room: toClientRoom(room) }, { headers: { "Set-Cookie": sessionCookie(room.code, "", true) } });
    }

    const game = room.game as GameRound | undefined;
    if (!game) return Response.json({ error: "진행 중인 게임이 없어요." }, { status: 409 });

    if (payload.action === "reveal-answer") {
      if (!isHost || !["initial", "trivia"].includes(game.id)) return Response.json({ error: "방장만 정답을 공개할 수 있어요." }, { status: 403 });
      game.answerRevealed = true;
      return persistAndRespond(room, viewer.id);
    }

    if (payload.action === "next-question") {
      if (!isHost) return Response.json({ error: "방장만 다음 문제로 넘어갈 수 있어요." }, { status: 403 });
      if (["initial", "trivia"].includes(game.id)) {
        if (!game.answerRevealed) return Response.json({ error: "정답을 먼저 공개해 주세요." }, { status: 409 });
        advanceQuestion(game, room.players);
      } else if (game.id === "group-initial") {
        advanceQuestion(game, room.players);
      } else if (["people", "chain", "four", "character"].includes(game.id)) {
        if (advanceCoopQuestion(game, room.players)) room.view = "result";
      } else if (game.id === "syllable") {
        advanceSyllableQuestion(game);
      } else {
        return Response.json({ error: "이 게임에서는 사용할 수 없어요." }, { status: 400 });
      }
      return persistAndRespond(room, viewer.id);
    }

    if (payload.action === "fail-game") {
      if (!isHost || !["people", "chain", "four", "character"].includes(game.id)) return Response.json({ error: "방장만 실패를 확정할 수 있어요." }, { status: 403 });
      failCoopQuestion(game);
      room.view = "result";
      return persistAndRespond(room, viewer.id);
    }

    if (payload.action === "taste-choice") {
      if (game.id !== "taste" || !game.choices?.includes(String(payload.choice))) return Response.json({ error: "선택지를 다시 확인해 주세요." }, { status: 400 });
      game.selections = { ...(game.selections ?? {}), [viewer.id]: String(payload.choice) };
      return persistAndRespond(room, viewer.id);
    }

    if (payload.action === "submit-memory") {
      if (game.id !== "memory" || game.storytellerId !== viewer.id) return Response.json({ error: "작성자만 제출할 수 있어요." }, { status: 403 });
      const entries = (payload.entries ?? []).map((item) => item.trim().slice(0, 80));
      if (entries.length !== 4 || entries.some((item) => !item)) return Response.json({ error: "추억 네 문장을 모두 적어 주세요." }, { status: 400 });
      const tagged = entries.map((text, index) => ({ text, fake: index === game.fakeSlot })).sort(() => Math.random() - 0.5);
      game.memoryEntries = tagged.map((item) => item.text);
      game.fakeMemoryIndex = tagged.findIndex((item) => item.fake) + 1;
      game.fakeMemoryText = tagged.find((item) => item.fake)?.text;
      game.memoryReady = true;
      return persistAndRespond(room, viewer.id);
    }

    if (payload.action === "submit-timer") {
      if (game.id !== "ten-seconds") return Response.json({ error: "이 게임에서는 사용할 수 없어요." }, { status: 400 });
      if ((game.timerResults ?? []).some((item) => item.playerId === viewer.id)) return Response.json({ error: "이미 이번 판에 도전했어요." }, { status: 409 });
      const seconds = Number(payload.seconds);
      if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 60) return Response.json({ error: "기록을 다시 측정해 주세요." }, { status: 400 });
      game.timerResults = [...(game.timerResults ?? []), { playerId: viewer.id, seconds: Math.round(seconds * 100) / 100, submittedAt: Date.now() }];
      return persistAndRespond(room, viewer.id);
    }

    if (payload.action === "submit-telestration") {
      if (game.id !== "telestration") return Response.json({ error: "이 게임에서는 사용할 수 없어요." }, { status: 400 });
      if (game.telestrationSubmitted?.includes(viewer.id)) return Response.json({ room: toClientRoom(room, viewer.id) });
      const chain = assignedTelestrationChain(game, viewer.id);
      if (!chain) return Response.json({ error: "그림 순서를 찾지 못했어요." }, { status: 409 });
      const round = game.telestrationRound ?? 1;
      chain.steps.push(round === 4 ? { playerId: viewer.id, guess: String(payload.guess ?? "").trim().slice(0, 30) || "정답 없음" } : { playerId: viewer.id, strokes: cleanStrokes(payload.strokes) });
      game.telestrationSubmitted = [...(game.telestrationSubmitted ?? []), viewer.id];
      finishTelestrationRound(game, room.players);
      if (game.telestrationComplete) room.view = "result";
      return persistAndRespond(room, viewer.id);
    }

    return Response.json({ error: "지원하지 않는 요청이에요." }, { status: 400 });
  } catch {
    return Response.json({ error: "요청을 처리하지 못했어요." }, { status: 500 });
  }
}
