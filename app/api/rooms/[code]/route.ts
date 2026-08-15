import { checkRateLimit, deleteRoom, readRoom, toClientRoom, touchAndPrunePlayers, writeRoomIfRevision, type Player, type RoomState } from "../../_lib/rooms";
import { advanceCoopQuestion, advanceQuestion, advanceSyllableQuestion, advanceTelestration, assignedTelestrationChain, failCoopQuestion, GAME_IDS, GAME_INFO, getTelestrationCorrectCount, makeRound, removePlayerFromRound, resolveApartmentPenalty, roundContentKey, type GameRound, type GemDifficulty, type Stroke } from "../../_lib/rounds";
import { authenticatePlayer, createSession, sessionCookie } from "../../_lib/session";
import { tickSurprise, waitingSurpriseState } from "../../_lib/surprise";
import { createMazeState } from "../../_lib/maze";
import { createDealerState, dealerAction, pauseDealer, removeDealerPlayer, resumeDealerIfReady, tickDealer, type DealerState } from "../../_lib/dealer";
import { acknowledgePlaceMafiaRole, advancePlaceMafiaIfDue, createPlaceMafiaState, pausePlaceMafia, removePlaceMafiaPlayer, resumePlaceMafia, shortenPlaceMafiaDiscussion, shortenPlaceMafiaVote, submitPlaceMafiaAttack, submitPlaceMafiaMove, submitPlaceMafiaVote } from "../../_lib/place-mafia";
import { PLACE_MAFIA_LOCATION_IDS, type PlaceMafiaBalance, type PlaceMafiaLocationId, type PlaceMafiaSetup } from "../../../place-mafia-shared";
import { advanceCashNGunsIfDue, createCashNGunsState, debugAutoCashNGuns, debugStepCashNGuns, handleCashNGunsAction, removeCashNGunsPlayer } from "../../_lib/cash-n-guns";

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

function handleGemInvestigationTimeout(room: RoomState) {
  const game = room.game as GameRound | undefined;
  if (game?.id !== "gem-heist" || game.gemPhase !== "investigation" || !game.deadline || Date.now() < game.deadline) return false;
  game.gemPhase = "vote";
  game.deadline = undefined;
  game.gemVotes = {};
  return true;
}

/** Keep the dealer roster fixed to the players whose balances were created
 * when the host started the round. Waiting/late players must not influence
 * selection completion, seller rotation, or shop offers. */
function dealerPlayers(room: RoomState, dealer: DealerState) {
  const participantIds = new Set(Object.keys(dealer.balances));
  return room.players.filter((player) => participantIds.has(player.id));
}

const DEALER_HEARTBEAT_TOUCH_MS = 3_000;
const DEALER_DISCONNECT_GRACE_MS = 12_000;

function reconcileDealerPresence(room: RoomState, dealer: DealerState) {
  if (dealer.phase === "finished") return false;
  const now = Date.now();
  const participants = dealerPlayers(room, dealer);
  const missing = participants.filter((player) => player.status !== "active" || now - (player.lastSeen || player.joinedAt) > DEALER_DISCONNECT_GRACE_MS);
  let changed = false;
  if (missing.length) {
    for (const player of missing) {
      if (player.status !== "waiting") {
        player.status = "waiting";
        changed = true;
      }
    }
    changed = pauseDealer(dealer, missing.map((player) => player.id), "disconnect") || changed;
  } else if (dealer.pause) {
    changed = resumeDealerIfReady(dealer, participants) || changed;
  }
  return changed;
}

function handleDealerTimeout(room: RoomState) {
  const game = room.game as GameRound | undefined;
  if (game?.id !== "double-dealers" || !game.dealer) return false;
  const players = dealerPlayers(room, game.dealer);
  return players.length > 0 ? tickDealer(game.dealer, players) : false;
}

function completeApartmentIfReady(room: RoomState) {
  const game = room.game as GameRound | undefined;
  if (room.view !== "game" || game?.id !== "apartment" || game.apartmentRevealed) return false;
  const activeIds = room.players.filter((player) => player.status === "active").map((player) => player.id);
  if (!activeIds.length || !activeIds.every((playerId) => Number.isInteger(game.apartmentSelections?.[playerId]))) return false;
  resolveApartmentPenalty(game, room.players);
  room.view = "result";
  return true;
}

async function persistAndRespond(room: RoomState, viewerId: string) {
  const expectedRevision = room.revision ?? 0;
  tickSurprise(room);
  const activeGame = room.game as GameRound | undefined;
  if (activeGame?.id === "place-mafia" && activeGame.placeMafia) advancePlaceMafiaIfDue(activeGame.placeMafia);
  if (activeGame?.id === "cash-n-guns" && activeGame.cashNGuns) advanceCashNGunsIfDue(activeGame.cashNGuns);
  if (!await writeRoomIfRevision(room, expectedRevision)) {
    return Response.json({ error: "다른 참가자의 입력을 반영하고 다시 시도해 주세요.", code: "ROOM_CONFLICT" }, { status: 409 });
  }
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
      // Dealer state contains private appraisals, clauses, cards and balances.
      // A room code alone must never be enough to read an active game.
      const activeGame = room.game as GameRound | undefined;
      if (activeGame?.id === "double-dealers" && ["game", "result"].includes(room.view)) {
        return Response.json({ error: "게임 참가 인증이 필요해요.", code: "AUTH_REQUIRED" }, { status: 401 });
      }
    }
    const expectedRevision = room.revision ?? 0;
    const playerIdsBeforePrune = new Set(room.players.map((player) => player.id));
    const activeDealerGame = room.game as GameRound | undefined;
    const dealerParticipantIds = activeDealerGame?.id === "double-dealers" && activeDealerGame.dealer && activeDealerGame.dealer.phase !== "finished"
      ? new Set(Object.keys(activeDealerGame.dealer.balances))
      : undefined;
    const playersChanged = touchAndPrunePlayers(room, viewer?.id, dealerParticipantIds ? DEALER_HEARTBEAT_TOUCH_MS : 15_000, dealerParticipantIds);
    if (activeDealerGame?.id === "double-dealers" && activeDealerGame.dealer && playersChanged) {
      for (const playerId of playerIdsBeforePrune) {
        if (!room.players.some((player) => player.id === playerId)) {
          removeDealerPlayer(activeDealerGame.dealer, playerId, dealerPlayers(room, activeDealerGame.dealer));
        }
      }
    }
    const dealerPresenceChanged = activeDealerGame?.id === "double-dealers" && activeDealerGame.dealer
      ? reconcileDealerPresence(room, activeDealerGame.dealer)
      : false;
    const surpriseChanged = tickSurprise(room);
    const telestrationChanged = handleTelestrationTimeout(room);
    const gemChanged = handleGemInvestigationTimeout(room);
    const dealerChanged = handleDealerTimeout(room);
    const activePlaceMafia = (room.game as GameRound | undefined)?.placeMafia;
    const placeMafiaChanged = activePlaceMafia ? advancePlaceMafiaIfDue(activePlaceMafia) : false;
    const activeCashNGuns = (room.game as GameRound | undefined)?.cashNGuns;
    const cashNGunsChanged = activeCashNGuns ? advanceCashNGunsIfDue(activeCashNGuns) : false;
    const changed = playersChanged || dealerPresenceChanged || surpriseChanged || telestrationChanged || gemChanged || dealerChanged || placeMafiaChanged || cashNGunsChanged;
    if (!room.players.length) {
      await deleteRoom(room.code);
      return Response.json({ error: "방을 찾을 수 없어요." }, { status: 404 });
    }
    if (changed && !await writeRoomIfRevision(room, expectedRevision)) {
      const latest = await readRoom(room.code);
      if (!latest) return Response.json({ error: "방을 찾을 수 없어요." }, { status: 404 });
      return Response.json({ room: toClientRoom(latest, viewer?.id) }, { headers: { "Cache-Control": "no-store" } });
    }
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
      choice?: string; seconds?: number; strokes?: unknown; guess?: string; chainId?: string; specialRoles?: boolean; suspectId?: string; difficulty?: GemDifficulty;
      itemIndex?: number; itemIds?: string[]; cardId?: number; targetId?: string; character?: number; ready?: boolean; requestId?: string;
      mazeResults?: Array<{ playerId?: string; score?: number; recipeIndex?: number }>;
      floor?: number;
      enabled?: boolean;
      permanent?: boolean;
      location?: string;
      locations?: string[];
      bullet?: "click" | "bang";
      courage?: "crouch" | "stand";
      lootId?: string;
      debug?: boolean;
      discussionSeconds?: number;
      balance?: PlaceMafiaBalance;
      mafiaCount?: number;
    };

    if (payload.action === "join") {
      const existing = await authenticatePlayer(request, room);
      if (existing) {
        existing.status = "active";
        existing.lastSeen = Date.now();
        const activeGame = room.game as GameRound | undefined;
        if (activeGame?.id === "place-mafia" && activeGame.placeMafia) resumePlaceMafia(activeGame.placeMafia, existing.id);
        if (activeGame?.id === "double-dealers" && activeGame.dealer) resumeDealerIfReady(activeGame.dealer, dealerPlayers(room, activeGame.dealer));
        return persistAndRespond(room, existing.id);
      }
      const rate = await checkRateLimit(request, "join", 12, 60);
      if (!rate.allowed) return Response.json({ error: "참가 시도가 너무 많아요. 잠시 후 다시 시도해 주세요." }, { status: 429, headers: { "Retry-After": String(rate.retryAfter) } });
      const profile = cleanProfile(payload.player);
      if (!profile) return Response.json({ error: "이름을 입력해 주세요." }, { status: 400 });
      if (room.players.length >= 12) return Response.json({ error: "방이 가득 찼어요." }, { status: 409 });
      if (room.players.some((item) => item.name.toLowerCase() === profile.name.toLowerCase())) return Response.json({ error: "이미 사용 중인 이름이에요." }, { status: 409 });
      const activeGame = room.game as GameRound | undefined;
      if (["double-dealers", "place-mafia", "cash-n-guns"].includes(String(activeGame?.id)) && ["game", "result"].includes(room.view)) {
        return Response.json({ error: "게임이 이미 시작되어 늦은 참가자를 받을 수 없습니다.", code: "GAME_IN_PROGRESS" }, { status: 409 });
      }
      const session = await createSession();
      const now = Date.now();
      const player: Player = { ...profile, id: session.playerId, sessionHash: session.tokenHash, joinedAt: now, lastSeen: now, status: ["lobby", "hub", "briefing"].includes(room.view) ? "active" : "waiting" };
      room.players.push(player);
      if (!await writeRoomIfRevision(room, room.revision ?? 0)) {
        return Response.json({ error: "다른 참가자가 동시에 입장했어요. 다시 시도해 주세요.", code: "ROOM_CONFLICT" }, { status: 409 });
      }
      return Response.json({ room: toClientRoom(room, player.id) }, { headers: { "Set-Cookie": sessionCookie(room.code, session.token) } });
    }

    const viewer = await authenticatePlayer(request, room);
    if (!viewer) return Response.json({ error: "참가 인증이 만료됐어요. 방에 다시 참가해 주세요." }, { status: 401 });
    viewer.lastSeen = Date.now();
    const isHost = viewer.id === room.hostId;

    if (payload.action === "set-surprise") {
      if (!isHost || room.view !== "lobby") return Response.json({ error: "대기실에서 방장만 깜짝 룰을 바꿀 수 있어요." }, { status: 403 });
      const enabled = payload.enabled === true;
      room.surpriseEnabled = enabled;
      room.surprise = enabled ? waitingSurpriseState() : undefined;
      return persistAndRespond(room, viewer.id);
    }

    if (payload.action === "prepare-game") {
      if (!isHost) return Response.json({ error: "방장만 할 수 있어요." }, { status: 403 });
      if (!payload.gameId || !GAME_IDS.includes(payload.gameId)) return Response.json({ error: "지원하지 않는 게임이에요." }, { status: 400 });
      const info = GAME_INFO[payload.gameId];
      const previousGame = room.game as GameRound | undefined;
      const previousContentKey = previousGame?.id === payload.gameId ? roundContentKey(previousGame) : undefined;
      room.view = "briefing";
      room.game = {
        id: payload.gameId, title: info.title, prompt: info.briefing, briefing: info.briefing,
        liarMode: "normal", previousContentKey, startedAt: Date.now(),
        ...(payload.gameId === "place-mafia" ? { placeMafiaSetup: { discussionSeconds: 90, balance: "normal", mafiaCount: 1 } satisfies PlaceMafiaSetup } : {}),
        ...(payload.gameId === "maze-courier" ? { mazeCharacters: {}, mazeReadyPlayerIds: [] } : {}),
      };
      return persistAndRespond(room, viewer.id);
    }

    if (payload.action === "place-mafia-settings") {
      const pending = room.game as GameRound | undefined;
      if (!isHost || room.view !== "briefing" || pending?.id !== "place-mafia") return Response.json({ error: "준비 화면에서 방장만 설정을 바꿀 수 있어요." }, { status: 403 });
      const previous = pending.placeMafiaSetup ?? { discussionSeconds: 90, balance: "normal", mafiaCount: 1 };
      pending.placeMafiaSetup = {
        discussionSeconds: payload.discussionSeconds === 60 || payload.discussionSeconds === 90 || payload.discussionSeconds === 120 ? payload.discussionSeconds : previous.discussionSeconds,
        balance: payload.balance === "citizen" || payload.balance === "mafia" || payload.balance === "normal" ? payload.balance : previous.balance,
        mafiaCount: payload.mafiaCount === 1 || payload.mafiaCount === 2 ? payload.mafiaCount : previous.mafiaCount,
      };
      return persistAndRespond(room, viewer.id);
    }

    if (payload.action === "maze-select-character") {
      const pending = room.game as GameRound | undefined;
      if (room.view !== "briefing" || pending?.id !== "maze-courier") return Response.json({ error: "지금은 배달부를 선택할 수 없어요." }, { status: 409 });
      const character = Math.max(0, Math.min(15, Math.floor(Number(payload.character))));
      if (!Number.isFinite(character)) return Response.json({ error: "캐릭터를 다시 선택해 주세요." }, { status: 400 });
      const claimedBy = Object.entries(pending.mazeCharacters ?? {})
        .find(([playerId, selected]) => playerId !== viewer.id && Number(selected) === character)?.[0];
      if (claimedBy) {
        const playerName = room.players.find((player) => player.id === claimedBy)?.name ?? "다른 플레이어";
        return Response.json({ error: `${playerName}님이 이미 선택한 캐릭터예요.` }, { status: 409 });
      }
      pending.mazeCharacters = { ...(pending.mazeCharacters ?? {}), [viewer.id]: character };
      const ready = new Set(pending.mazeReadyPlayerIds ?? []);
      if (payload.ready !== false) ready.add(viewer.id); else ready.delete(viewer.id);
      pending.mazeReadyPlayerIds = [...ready];
      return persistAndRespond(room, viewer.id);
    }

    if (payload.action === "start-game") {
      if (!isHost) return Response.json({ error: "방장만 할 수 있어요." }, { status: 403 });
      const gameId = payload.gameId || String(room.game?.id ?? "");
      const pendingGame = room.game as GameRound | undefined;
      const previousPlaceMafia = pendingGame?.id === "place-mafia" ? pendingGame.placeMafia : undefined;
      const pendingPlaceMafiaSetup = pendingGame?.id === "place-mafia" ? pendingGame.placeMafiaSetup : undefined;
      if (!GAME_IDS.includes(gameId)) return Response.json({ error: "지원하지 않는 게임이에요." }, { status: 400 });
      if (gameId === "gem-heist" && (room.players.length < 4 || room.players.length > 8)) {
        return Response.json({ error: "사라진 보석은 4~8명이 함께할 수 있어요." }, { status: 409 });
      }
      if (gameId === "maze-courier" && room.players.length > 8) {
        return Response.json({ error: "미로의 배달부는 최대 8명까지 함께할 수 있어요." }, { status: 409 });
      }
      if (gameId === "double-dealers" && (room.players.length < 3 || room.players.length > 8)) {
        return Response.json({ error: "수상한 딜러들은 3~8명이 함께할 수 있어요." }, { status: 409 });
      }
      if (gameId === "apartment" && room.players.length < 3) {
        return Response.json({ error: "아파트 게임은 3명 이상이 함께할 수 있어요." }, { status: 409 });
      }
      const cashNGunsDebugStart = gameId === "cash-n-guns" && payload.debug === true;
      if (gameId === "cash-n-guns" && (room.players.length > 8 || (room.players.length < 4 && !cashNGunsDebugStart))) {
        return Response.json({ error: "캐시 앤 건즈는 4~8명이 필요해요." }, { status: 409 });
      }
      if (gameId === "place-mafia" && (room.players.length < 4 || room.players.length > 8)) {
        return Response.json({ error: "장소 마피아는 4~8명이 함께할 수 있어요." }, { status: 409 });
      }
      room.players.forEach((player) => { player.status = "active"; });
      const previousContentKey = pendingGame?.id === gameId
        ? pendingGame.previousContentKey ?? (room.view === "briefing" ? undefined : roundContentKey(pendingGame))
        : undefined;
      const game = makeRound(
        gameId,
        room.players,
        payload.mode === "dumb" ? "dumb" : "normal",
        previousContentKey,
        gameId === "gem-heist" && room.players.length >= 4 && Boolean(payload.specialRoles),
        payload.difficulty === "easy" || payload.difficulty === "hard" ? payload.difficulty : "normal",
      );
      if (!game) return Response.json({ error: "게임을 시작하지 못했어요." }, { status: 400 });
      if (gameId === "maze-courier") {
        const selected = pendingGame?.mazeCharacters ?? {};
        const usedCharacters = new Set<number>();
        const mazeCharacters = Object.fromEntries(room.players.map((player) => {
          const chosen = Number(selected[player.id]);
          if (Number.isInteger(chosen) && chosen >= 0 && chosen < 16 && !usedCharacters.has(chosen)) {
            usedCharacters.add(chosen);
            return [player.id, chosen];
          }
          const available = Array.from({ length: 16 }, (_, index) => index).filter((index) => !usedCharacters.has(index));
          const randomized = available[Math.floor(Math.random() * available.length)]!;
          usedCharacters.add(randomized);
          return [player.id, randomized];
        }));
        game.mazeCharacters = mazeCharacters;
        game.mazeReadyPlayerIds = room.players.map((player) => player.id);
        game.maze = createMazeState(room.players, mazeCharacters);
      }
      if (gameId === "double-dealers") game.dealer = createDealerState(room.players);
      if (gameId === "place-mafia") {
        const setup: PlaceMafiaSetup = {
          discussionSeconds: payload.discussionSeconds === 60 || payload.discussionSeconds === 90 || payload.discussionSeconds === 120 ? payload.discussionSeconds : pendingPlaceMafiaSetup?.discussionSeconds ?? previousPlaceMafia?.discussionSeconds ?? 90,
          balance: payload.balance === "citizen" || payload.balance === "mafia" || payload.balance === "normal" ? payload.balance : pendingPlaceMafiaSetup?.balance ?? previousPlaceMafia?.balance ?? "normal",
          mafiaCount: payload.mafiaCount === 1 || payload.mafiaCount === 2 ? payload.mafiaCount : pendingPlaceMafiaSetup?.mafiaCount ?? previousPlaceMafia?.mafiaCount ?? 1,
        };
        game.placeMafiaSetup = setup;
        game.placeMafia = createPlaceMafiaState(room.players, {
          discussionSeconds: setup.discussionSeconds,
          balance: setup.balance,
          mafiaCount: setup.mafiaCount,
        });
      }
      if (gameId === "cash-n-guns") game.cashNGuns = createCashNGunsState(room.players);
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

    if (payload.action === "maze-finish") {
      const active = room.game as GameRound | undefined;
      if (!isHost || room.view !== "game" || active?.id !== "maze-courier") return Response.json({ error: "방장만 결과를 확정할 수 있어요." }, { status: 403 });
      const submitted = new Map((Array.isArray(payload.mazeResults) ? payload.mazeResults : [])
        .map((result) => [String(result.playerId), result]));
      active.mazeResults = room.players.map((player) => {
        const result = submitted.get(player.id);
        return {
          playerId: player.id,
          score: Math.max(0, Math.min(999, Math.floor(Number(result?.score) || 0))),
          recipeIndex: Math.max(0, Math.floor(Number(result?.recipeIndex) || 0)),
        };
      });
      room.view = "result";
      return persistAndRespond(room, viewer.id);
    }

    if (payload.action === "leave") {
      const activeGame = room.game as GameRound | undefined;
      if (activeGame?.id === "place-mafia" && activeGame.placeMafia && room.view === "game" && activeGame.placeMafia.phase !== "game_over") {
        viewer.status = "waiting";
        pausePlaceMafia(activeGame.placeMafia, viewer.id);
        if (room.hostId === viewer.id) {
          const nextHost = room.players.find((player) => player.id !== viewer.id && player.status === "active");
          if (nextHost) room.hostId = nextHost.id;
        }
        if (!await writeRoomIfRevision(room, room.revision ?? 0)) return Response.json({ error: "다른 참가자의 변경을 반영하고 다시 시도해 주세요.", code: "ROOM_CONFLICT" }, { status: 409 });
        return Response.json({ room: null });
      }
      if (activeGame?.id === "double-dealers" && activeGame.dealer && room.view === "game" && activeGame.dealer.phase !== "finished" && payload.permanent !== true) {
        viewer.status = "waiting";
        pauseDealer(activeGame.dealer, [viewer.id], "left");
        if (room.hostId === viewer.id) {
          const nextHost = room.players.find((player) => player.id !== viewer.id && player.status === "active");
          if (nextHost) room.hostId = nextHost.id;
        }
        if (!await writeRoomIfRevision(room, room.revision ?? 0)) return Response.json({ error: "다른 참가자의 변경을 반영하지 못했습니다. 다시 시도해주세요.", code: "ROOM_CONFLICT" }, { status: 409 });
        return Response.json({ room: toClientRoom(room, viewer.id) });
      }
      removePlayerFromRound(activeGame, viewer.id);
      room.players = room.players.filter((item) => item.id !== viewer.id);
      if (activeGame?.id === "double-dealers" && activeGame.dealer) {
        removeDealerPlayer(activeGame.dealer, viewer.id, dealerPlayers(room, activeGame.dealer));
      }
      if (activeGame?.id === "place-mafia" && activeGame.placeMafia) removePlaceMafiaPlayer(activeGame.placeMafia, viewer.id);
      if (activeGame?.id === "cash-n-guns" && activeGame.cashNGuns) removeCashNGunsPlayer(activeGame.cashNGuns, viewer.id);
      if (room.players.length === 0) {
        await deleteRoom(room.code);
        return Response.json({ room: null }, { headers: { "Set-Cookie": sessionCookie(room.code, "", true) } });
      }
      if (room.hostId === viewer.id) room.hostId = (room.players.find((player) => player.status === "active") ?? room.players[0]).id;
      if (activeGame?.id === "telestration") {
        finishTelestrationRound(activeGame, room.players);
        if (activeGame.telestrationComplete) room.view = "result";
      }
      completeApartmentIfReady(room);
      if (!await writeRoomIfRevision(room, room.revision ?? 0)) {
        return Response.json({ error: "다른 참가자의 변경을 반영하고 다시 시도해 주세요.", code: "ROOM_CONFLICT" }, { status: 409 });
      }
      return Response.json({ room: toClientRoom(room) }, { headers: { "Set-Cookie": sessionCookie(room.code, "", true) } });
    }

    const game = room.game as GameRound | undefined;
    if (!game) return Response.json({ error: "진행 중인 게임이 없어요." }, { status: 409 });

    if (String(payload.action).startsWith("place-mafia-")) {
      if (game.id !== "place-mafia" || !game.placeMafia || room.view !== "game") return Response.json({ error: "장소 마피아가 진행 중이 아니에요." }, { status: 409 });
      advancePlaceMafiaIfDue(game.placeMafia);
      try {
        if (game.placeMafia.pause?.playerIds.length && payload.action !== "place-mafia-tick") throw new Error("참가자를 기다리는 동안 게임이 멈춰 있어요.");
        if (payload.action === "place-mafia-ready") acknowledgePlaceMafiaRole(game.placeMafia, viewer.id);
        else if (payload.action === "place-mafia-move") {
          const location = String(payload.location) as PlaceMafiaLocationId;
          if (!PLACE_MAFIA_LOCATION_IDS.includes(location)) throw new Error("이동할 장소를 다시 선택해 주세요.");
          submitPlaceMafiaMove(game.placeMafia, viewer.id, location);
        } else if (payload.action === "place-mafia-attack") {
          const locations = (Array.isArray(payload.locations) ? payload.locations : []).map(String) as PlaceMafiaLocationId[];
          if (locations.some((location) => !PLACE_MAFIA_LOCATION_IDS.includes(location))) throw new Error("공격할 장소를 다시 선택해 주세요.");
          submitPlaceMafiaAttack(game.placeMafia, viewer.id, locations);
        } else if (payload.action === "place-mafia-shorten") shortenPlaceMafiaDiscussion(game.placeMafia, viewer.id);
        else if (payload.action === "place-mafia-vote-shorten") shortenPlaceMafiaVote(game.placeMafia, viewer.id);
        else if (payload.action === "place-mafia-vote") submitPlaceMafiaVote(game.placeMafia, viewer.id, String(payload.targetId ?? ""));
        else if (payload.action !== "place-mafia-tick") throw new Error("지원하지 않는 장소 마피아 행동이에요.");
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "행동을 처리하지 못했어요." }, { status: 422 });
      }
      return persistAndRespond(room, viewer.id);
    }

    if (String(payload.action).startsWith("cash-n-guns-debug-")) {
      if (!isHost || payload.debug !== true) return Response.json({ error: "디버그 모드는 방장 전용이에요." }, { status: 403 });
      if (game.id !== "cash-n-guns" || !game.cashNGuns || room.view !== "game") return Response.json({ error: "캐시 앤 건즈가 진행 중이 아니에요." }, { status: 409 });
      const debugAction = String(payload.action);
      if (debugAction === "cash-n-guns-debug-step") debugStepCashNGuns(game.cashNGuns);
      else if (debugAction === "cash-n-guns-debug-auto") debugAutoCashNGuns(game.cashNGuns);
      else if (debugAction === "cash-n-guns-debug-reset") game.cashNGuns = createCashNGunsState(room.players);
      else return Response.json({ error: "지원하지 않는 디버그 동작이에요." }, { status: 400 });
      return persistAndRespond(room, viewer.id);
    }

    if (String(payload.action).startsWith("cash-n-guns-")) {
      if (game.id !== "cash-n-guns" || !game.cashNGuns || room.view !== "game") return Response.json({ error: "캐시 앤 건즈가 진행 중이 아니에요." }, { status: 409 });
      try {
        handleCashNGunsAction(game.cashNGuns, viewer.id, String(payload.action), {
          bullet: payload.bullet,
          targetId: payload.targetId,
          courage: payload.courage,
          lootId: payload.lootId,
        });
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "행동을 처리하지 못했어요." }, { status: 422 });
      }
      return persistAndRespond(room, viewer.id);
    }

    if (payload.action === "apartment-choice") {
      if (game.id !== "apartment" || room.view !== "game") return Response.json({ error: "아파트 게임이 진행 중이 아니에요." }, { status: 409 });
      if (game.apartmentRevealed) return Response.json({ error: "이미 결과가 공개됐어요." }, { status: 409 });
      if (game.apartmentSubmitted?.includes(viewer.id)) return Response.json({ error: "이미 층을 선택했어요." }, { status: 409 });
      const floor = Math.floor(Number(payload.floor));
      const maxFloor = game.apartmentMaxFloor ?? room.players.length + 2;
      if (!Number.isInteger(floor) || floor < 1 || floor > maxFloor) return Response.json({ error: "층을 다시 선택해 주세요." }, { status: 400 });
      game.apartmentSelections = { ...(game.apartmentSelections ?? {}), [viewer.id]: floor };
      game.apartmentSubmitted = [...new Set(Object.keys(game.apartmentSelections))];
      completeApartmentIfReady(room);
      return persistAndRespond(room, viewer.id);
    }

    if (String(payload.action).startsWith("dealer-")) {
      if (game.id !== "double-dealers" || !game.dealer) return Response.json({ error: "딜러 게임이 진행 중이 아니에요." }, { status: 409 });
      const participants = dealerPlayers(room, game.dealer);
      if (!participants.some((player) => player.id === viewer.id)) {
        return Response.json({ error: "이 방의 딜러 라운드 참가자가 아닙니다.", code: "NOT_DEALER_PLAYER" }, { status: 409 });
      }
      const expectedDealerRevision = room.revision ?? 0;
      const beforeDealerAction = JSON.stringify(game.dealer);
      try {
        dealerAction(game.dealer, participants, viewer.id, String(payload.action), payload as Record<string, unknown>);
      } catch (error) {
        if (beforeDealerAction !== JSON.stringify(game.dealer)) {
          if (!await writeRoomIfRevision(room, expectedDealerRevision)) return Response.json({ error: "다른 참가자의 변경을 반영하지 못했습니다. 최신 상태를 다시 불러와주세요.", code: "ROOM_CONFLICT" }, { status: 409 });
          return Response.json({ room: toClientRoom(room, viewer.id), error: error instanceof Error ? error.message : "요청을 처리하지 못했습니다.", code: "DEALER_RULE" }, { status: 422 });
        }
        return Response.json({ error: error instanceof Error ? error.message : "요청을 처리하지 못했어요.", code: "DEALER_RULE" }, { status: 422 });
      }
      return persistAndRespond(room, viewer.id);
    }

    if (payload.action === "gem-start-investigation") {
      if (!isHost || game.id !== "gem-heist") return Response.json({ error: "방장만 수사를 시작할 수 있어요." }, { status: 403 });
      game.gemPhase = "investigation";
      game.gemQuestionIndex = 0;
      game.deadline = Date.now() + 3 * 60 * 1000;
      return persistAndRespond(room, viewer.id);
    }

    if (payload.action === "gem-next-question") {
      if (!isHost || game.id !== "gem-heist" || game.gemPhase !== "investigation") return Response.json({ error: "수사 중에 방장만 질문을 넘길 수 있어요." }, { status: 403 });
      const lastIndex = Math.max(0, (game.gemQuestions?.length ?? 1) - 1);
      game.gemQuestionIndex = Math.min(lastIndex, (game.gemQuestionIndex ?? 0) + 1);
      return persistAndRespond(room, viewer.id);
    }

    if (payload.action === "gem-start-vote") {
      if (!isHost || game.id !== "gem-heist") return Response.json({ error: "방장만 최종 지목을 시작할 수 있어요." }, { status: 403 });
      game.gemPhase = "vote";
      game.deadline = undefined;
      game.gemVotes = {};
      return persistAndRespond(room, viewer.id);
    }

    if (payload.action === "gem-vote") {
      if (game.id !== "gem-heist" || game.gemPhase !== "vote") return Response.json({ error: "지금은 범인을 지목할 수 없어요." }, { status: 409 });
      const suspectId = String(payload.suspectId ?? "");
      const activePlayers = room.players.filter((player) => player.status === "active");
      if (suspectId === viewer.id) return Response.json({ error: "자기 자신은 지목할 수 없어요." }, { status: 400 });
      if (!activePlayers.some((player) => player.id === suspectId)) return Response.json({ error: "참가자를 다시 선택해 주세요." }, { status: 400 });
      game.gemVotes = { ...(game.gemVotes ?? {}), [viewer.id]: suspectId };
      if (activePlayers.every((player) => Boolean(game.gemVotes?.[player.id]))) {
        const counts = activePlayers.reduce<Record<string, number>>((result, player) => {
          result[player.id] = Object.values(game.gemVotes ?? {}).filter((targetId) => targetId === player.id).length;
          return result;
        }, {});
        const highest = Math.max(...Object.values(counts));
        const leaders = Object.entries(counts).filter(([, count]) => count === highest).map(([playerId]) => playerId);
        game.gemCaught = leaders.length === 1 && leaders[0] === game.gemThiefId;
        room.view = "result";
      }
      return persistAndRespond(room, viewer.id);
    }

    if (payload.action === "accept-telestration-answer") {
      if (!isHost || game.id !== "telestration" || room.view !== "result") return Response.json({ error: "결과 화면에서 방장만 정답을 인정할 수 있어요." }, { status: 403 });
      const chainId = String(payload.chainId ?? "");
      if (!game.telestrationChains?.some((chain) => chain.id === chainId)) return Response.json({ error: "릴레이 결과를 찾지 못했어요." }, { status: 400 });
      game.telestrationAcceptedChainIds = [...new Set([...(game.telestrationAcceptedChainIds ?? []), chainId])];
      game.telestrationCorrectCount = getTelestrationCorrectCount(game);
      return persistAndRespond(room, viewer.id);
    }

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
      } else if (["people", "chain", "four", "character", "group-initial"].includes(game.id)) {
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
