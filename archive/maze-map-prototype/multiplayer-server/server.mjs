import { createServer } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { WebSocket, WebSocketServer } from "ws";
import {
  CHARACTER_LOADOUTS,
  FOOD_RECIPES,
  GAME_DURATION_MS,
  GRID,
  HALF,
  INGREDIENT_KEYS,
  MAX_PLAYERS,
  PLAYER_COLLISION_RADIUS,
  PLAYER_SPEED,
  PLAYER_WALL_RADIUS,
  SKILL_COOLDOWNS_MS,
  SPAWNS,
  SUPPLY_DEPOTS,
  TILE_SIZE,
  distance2d,
  generateRandomWallLayout,
} from "./game-rules.mjs";

const DEFAULT_PORT = 8788;
const MAX_MESSAGES_PER_SECOND = 45;
const ROOM_CODE_LENGTH = 5;
const VALID_THEMES = new Set(["ice", "lava", "space"]);
const SERVER_TICK_MS = 100;
const SNAPSHOT_INTERVAL_MS = 200;
const ITEM_RESPAWN_MS = 2800;
const IMMUNITY_MS = 2000;

function randomRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(ROOM_CODE_LENGTH);
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join("");
}

function randomMapSeed() {
  return randomBytes(4).readUInt32LE(0);
}

function randomIndex(length) {
  return length > 0 ? randomBytes(4).readUInt32LE(0) % length : -1;
}

function normalizeRoomCode(value) {
  return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

function finiteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function send(socket, payload) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
}

function broadcast(room, payload, exceptSocket = null) {
  const serialized = JSON.stringify(payload);
  room.players.forEach((player) => {
    if (player.socket === exceptSocket || player.socket.readyState !== WebSocket.OPEN) return;
    player.socket.send(serialized);
  });
}

function remainingSeconds(until, now) {
  return Math.max(0, (until - now) / 1000);
}

function publicPlayer(player, now = Date.now()) {
  const cooldowns = {};
  for (const [skill, until] of Object.entries(player.cooldowns)) {
    cooldowns[skill] = remainingSeconds(until, now);
  }
  return {
    id: player.id,
    name: player.name,
    character: player.character,
    state: {
      ...player.state,
      stunRemaining: remainingSeconds(player.stunUntil, now),
      immunityRemaining: remainingSeconds(player.immunityUntil, now),
      wallRunRemaining: remainingSeconds(player.wallRunUntil, now),
      fluidizeRemaining: remainingSeconds(player.fluidizeUntil, now),
      sprintStamina: player.sprintStamina,
    },
    game: {
      score: player.score,
      recipeIndex: player.recipeIndex,
      progress: [...player.recipeProgress],
      heldItemId: player.heldItemId,
      cooldowns,
    },
  };
}

function publicGame(room, now = Date.now()) {
  return {
    serverTime: now,
    startedAt: room.startedAt,
    endsAt: room.startedAt + GAME_DURATION_MS,
    players: [...room.players.values()].map((player) => publicPlayer(player, now)),
    items: [...room.items.values()].map(({ id, ingredientKey, depotIndex, heldBy }) => ({
      id,
      ingredientKey,
      depotIndex,
      heldBy,
    })),
    oils: [...room.oils.values()].map(({ id, ownerId, x, z }) => ({ id, ownerId, x, z })),
  };
}

function assignRecipe(player) {
  let next = randomIndex(FOOD_RECIPES.length);
  if (FOOD_RECIPES.length > 1 && next === player.recipeIndex) next = (next + 1) % FOOD_RECIPES.length;
  player.recipeIndex = next;
  player.recipeProgress.clear();
}

function missingIngredients(player) {
  const recipe = FOOD_RECIPES[player.recipeIndex];
  if (!recipe) return [];
  return recipe.ingredients.filter((key) => !player.recipeProgress.has(key));
}

function spawnItemAtDepot(room, depotIndex, ingredientKey) {
  if (!SUPPLY_DEPOTS[depotIndex] || !INGREDIENT_KEYS.includes(ingredientKey)) return null;
  if ([...room.items.values()].some((item) => item.depotIndex === depotIndex && !item.heldBy)) return null;
  const item = {
    id: `item-${room.nextItemSerial += 1}`,
    ingredientKey,
    depotIndex,
    heldBy: null,
  };
  room.items.set(item.id, item);
  return item;
}

function refillDepots(room, now = Date.now()) {
  const players = [...room.players.values()];
  if (players.length === 0) return;
  for (let depotIndex = 0; depotIndex < SUPPLY_DEPOTS.length; depotIndex += 1) {
    if (room.depotReadyAt[depotIndex] > now) continue;
    const occupied = [...room.items.values()].some(
      (item) => item.depotIndex === depotIndex && !item.heldBy,
    );
    if (occupied) continue;
    const assignedPlayer = players[depotIndex % players.length];
    const needed = missingIngredients(assignedPlayer);
    const ingredientKey = needed.length > 0
      ? needed[randomIndex(needed.length)]
      : INGREDIENT_KEYS[randomIndex(INGREDIENT_KEYS.length)];
    spawnItemAtDepot(room, depotIndex, ingredientKey);
    room.depotReadyAt[depotIndex] = Number.POSITIVE_INFINITY;
  }
}

function createRoom(code) {
  const mapSeed = randomMapSeed();
  return {
    code,
    players: new Map(),
    hostId: null,
    mapSeed,
    walls: generateRandomWallLayout(mapSeed),
    theme: "ice",
    startedAt: Date.now(),
    items: new Map(),
    oils: new Map(),
    depotReadyAt: Array(SUPPLY_DEPOTS.length).fill(0),
    nextItemSerial: 0,
    nextOilSerial: 0,
    lastSnapshotAt: 0,
  };
}

function createPlayer({ id, socket, name, character, spawn, now }) {
  const player = {
    id,
    socket,
    name,
    character,
    state: {
      ...spawn,
      moving: false,
      sprinting: false,
      wallRunning: false,
      fluidized: false,
      seq: 0,
      updatedAt: now,
    },
    score: 0,
    recipeIndex: -1,
    recipeProgress: new Set(),
    heldItemId: null,
    cooldowns: {},
    stunUntil: 0,
    immunityUntil: 0,
    wallRunUntil: 0,
    fluidizeUntil: 0,
    sprintStamina: 2,
    sprintRechargeAt: now,
  };
  assignRecipe(player);
  return player;
}

function isWallTop(room, x, z) {
  const gridX = Math.round(x + HALF);
  const gridZ = Math.round(z + HALF);
  return room.walls.has(`${gridX},${gridZ}`)
    && Math.abs(x - (gridX - HALF)) <= TILE_SIZE * 0.55
    && Math.abs(z - (gridZ - HALF)) <= TILE_SIZE * 0.55;
}

function canOccupy(room, player, x, z, now, { ignorePlayer = null } = {}) {
  const mapLimit = HALF + TILE_SIZE * 0.5 - PLAYER_WALL_RADIUS;
  if (x < -mapLimit || x > mapLimit || z < -mapLimit || z > mapLimit) return false;
  const wallRunning = player.wallRunUntil > now;
  const fluidized = player.fluidizeUntil > now;
  if (wallRunning) return isWallTop(room, x, z);
  if (!fluidized) {
    const centerGridX = Math.round(x + HALF);
    const centerGridZ = Math.round(z + HALF);
    const wallHalf = TILE_SIZE * 0.5;
    for (let gridZ = centerGridZ - 1; gridZ <= centerGridZ + 1; gridZ += 1) {
      for (let gridX = centerGridX - 1; gridX <= centerGridX + 1; gridX += 1) {
        if (!room.walls.has(`${gridX},${gridZ}`)) continue;
        const wallX = gridX - HALF;
        const wallZ = gridZ - HALF;
        const nearestX = clamp(x, wallX - wallHalf, wallX + wallHalf);
        const nearestZ = clamp(z, wallZ - wallHalf, wallZ + wallHalf);
        const dx = x - nearestX;
        const dz = z - nearestZ;
        if (dx * dx + dz * dz < PLAYER_WALL_RADIUS ** 2) return false;
      }
    }
  }
  if (x * x + z * z < 1.48 ** 2) return false;
  for (const other of room.players.values()) {
    if (other === player || other === ignorePlayer) continue;
    if (fluidized || other.fluidizeUntil > now) continue;
    if ((other.wallRunUntil > now) !== wallRunning) continue;
    const dx = x - other.state.x;
    const dz = z - other.state.z;
    if (dx * dx + dz * dz < (PLAYER_COLLISION_RADIUS * 2) ** 2) return false;
  }
  return true;
}

function updateStamina(player, now, requestedSprint, moving) {
  const dt = clamp((now - player.state.updatedAt) / 1000, 0, 0.25);
  if (requestedSprint && moving && player.sprintStamina > 0) {
    player.sprintStamina = Math.max(0, player.sprintStamina - dt);
    player.sprintRechargeAt = now + 1000;
    return player.sprintStamina > 0;
  }
  if (now >= player.sprintRechargeAt) {
    player.sprintStamina = Math.min(2, player.sprintStamina + dt * (2 / 3));
  }
  return false;
}

function sanitizeState(room, player, message, now) {
  const incomingSequence = Math.floor(finiteNumber(message.seq, -1));
  if (incomingSequence <= player.state.seq) return null;
  const stunned = player.stunUntil > now;
  const moving = !stunned && Boolean(message.moving);
  const loadout = CHARACTER_LOADOUTS[player.character];
  const sprintRequested = Boolean(message.sprinting) && loadout.movement === "sprint";
  const sprinting = updateStamina(player, now, sprintRequested, moving);
  const wallRunning = player.wallRunUntil > now;
  const fluidized = player.fluidizeUntil > now;
  const dt = clamp((now - player.state.updatedAt) / 1000, 0.016, 0.25);
  const speedMultiplier = sprinting ? 1.7 : wallRunning ? 1.18 : 1;
  const maxDistance = PLAYER_SPEED * speedMultiplier * dt + 0.075;
  let dx = finiteNumber(message.x, player.state.x) - player.state.x;
  let dz = finiteNumber(message.z, player.state.z) - player.state.z;
  const requestedDistance = Math.hypot(dx, dz);
  if (requestedDistance > maxDistance && requestedDistance > 0) {
    dx *= maxDistance / requestedDistance;
    dz *= maxDistance / requestedDistance;
  }
  let nextX = player.state.x;
  let nextZ = player.state.z;
  if (!stunned && canOccupy(room, player, nextX + dx, nextZ, now)) nextX += dx;
  if (!stunned && canOccupy(room, player, nextX, nextZ + dz, now)) nextZ += dz;
  player.state = {
    x: nextX,
    y: wallRunning ? 1.64 : 0.04,
    z: nextZ,
    rotation: finiteNumber(message.rotation, player.state.rotation),
    moving: moving && (Math.abs(nextX - player.state.x) > 0.0001 || Math.abs(nextZ - player.state.z) > 0.0001),
    sprinting,
    wallRunning,
    fluidized,
    seq: incomingSequence,
    updatedAt: now,
  };
  return player.state;
}

function applyKnockback(room, target, directionX, directionZ, distance, now) {
  const length = Math.hypot(directionX, directionZ) || 1;
  const stepX = directionX / length * 0.1;
  const stepZ = directionZ / length * 0.1;
  let moved = 0;
  while (moved < distance) {
    const amount = Math.min(0.1, distance - moved);
    const x = target.state.x + stepX * (amount / 0.1);
    const z = target.state.z + stepZ * (amount / 0.1);
    if (!canOccupy(room, target, x, z, now)) break;
    target.state.x = x;
    target.state.z = z;
    moved += amount;
  }
  target.state.updatedAt = now;
  target.state.seq += 1;
  return moved;
}

function stunPlayer(target, durationMs, now) {
  if (!target || target.immunityUntil > now || target.fluidizeUntil > now) return false;
  target.stunUntil = now + durationMs;
  target.immunityUntil = target.stunUntil + IMMUNITY_MS;
  target.state.moving = false;
  target.state.sprinting = false;
  return true;
}

function skillTargets(room, player, now, range = Number.POSITIVE_INFINITY) {
  return [...room.players.values()].filter((target) => (
    target !== player
    && target.immunityUntil <= now
    && target.fluidizeUntil <= now
    && distance2d(player.state, target.state) <= range
  ));
}

function handleSkill(room, player, skill, now) {
  const loadout = CHARACTER_LOADOUTS[player.character];
  const equipped = skill === "push" || skill === loadout.movement || skill === loadout.disruption;
  if (!equipped || skill === "sprint" || player.stunUntil > now) return;

  if (skill === "jump" && player.wallRunUntil > now) {
    player.wallRunUntil = 0;
    player.state.y = 0.04;
    broadcast(room, { type: "event", kind: "skill", skill, actorId: player.id, mode: "land" });
    return;
  }
  const cooldownMs = SKILL_COOLDOWNS_MS[skill];
  if (!cooldownMs || (player.cooldowns[skill] ?? 0) > now) return;
  let target = null;
  let succeeded = false;

  if (skill === "push" || skill === "power-push") {
    const candidates = skillTargets(room, player, now, 1.65)
      .sort((a, b) => distance2d(player.state, a.state) - distance2d(player.state, b.state));
    target = candidates[0];
    if (target) {
      const moved = applyKnockback(
        room,
        target,
        target.state.x - player.state.x,
        target.state.z - player.state.z,
        skill === "power-push" ? 1.65 : 1,
        now,
      );
      succeeded = moved > 0.01;
      if (skill === "power-push") stunPlayer(target, 3000, now);
    }
  } else if (skill === "freeze") {
    const candidates = skillTargets(room, player, now);
    target = candidates[randomIndex(candidates.length)];
    succeeded = stunPlayer(target, 3000, now);
  } else if (skill === "swap") {
    const candidates = skillTargets(room, player, now);
    target = candidates[randomIndex(candidates.length)];
    if (target) {
      const from = { x: player.state.x, z: player.state.z };
      player.state.x = target.state.x;
      player.state.z = target.state.z;
      target.state.x = from.x;
      target.state.z = from.z;
      player.state.seq += 1;
      target.state.seq += 1;
      succeeded = true;
    }
  } else if (skill === "oil") {
    const existing = [...room.oils.values()].find((oil) => oil.ownerId === player.id);
    if (existing) {
      room.oils.delete(existing.id);
    } else {
      const oil = {
        id: `oil-${room.nextOilSerial += 1}`,
        ownerId: player.id,
        x: player.state.x,
        z: player.state.z,
        affected: new Set(),
      };
      room.oils.set(oil.id, oil);
    }
    succeeded = true;
  } else if (skill === "fluidize") {
    if (player.wallRunUntil <= now) {
      player.fluidizeUntil = now + 3000;
      succeeded = true;
    }
  } else if (skill === "jump") {
    if (!player.heldItemId && player.fluidizeUntil <= now) {
      let nearest = null;
      let nearestDistance = 1.35;
      for (const key of room.walls) {
        const [gridX, gridZ] = key.split(",").map(Number);
        const wall = { x: gridX - HALF, z: gridZ - HALF };
        const distance = distance2d(player.state, wall);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = wall;
        }
      }
      if (nearest) {
        player.state.x = nearest.x;
        player.state.z = nearest.z;
        player.state.y = 1.64;
        player.wallRunUntil = now + 4000;
        player.state.seq += 1;
        succeeded = true;
      }
    }
  }

  if (!succeeded) return;
  player.cooldowns[skill] = now + cooldownMs;
  broadcast(room, {
    type: "event",
    kind: "skill",
    skill,
    actorId: player.id,
    targetId: target?.id ?? null,
    actorPosition: { x: player.state.x, z: player.state.z },
    targetPosition: target ? { x: target.state.x, z: target.state.z } : null,
  });
  broadcast(room, { type: "game", game: publicGame(room, now) });
}

function handleInteract(room, player, now) {
  if (player.stunUntil > now) return;
  if (player.heldItemId) {
    if (Math.hypot(player.state.x, player.state.z) >= 2.05) {
      send(player.socket, { type: "event", kind: "message", message: "재료는 바닥에 놓을 수 없습니다. 중앙 제작대에 제출하세요." });
      return;
    }
    const item = room.items.get(player.heldItemId);
    const recipe = FOOD_RECIPES[player.recipeIndex];
    if (!item || !recipe?.ingredients.includes(item.ingredientKey) || player.recipeProgress.has(item.ingredientKey)) return;
    player.recipeProgress.add(item.ingredientKey);
    room.items.delete(item.id);
    player.heldItemId = null;
    let completed = false;
    let points = 0;
    if (player.recipeProgress.size === recipe.ingredients.length) {
      points = recipe.ingredients.length;
      player.score += points;
      completed = true;
      assignRecipe(player);
    }
    refillDepots(room, now);
    broadcast(room, {
      type: "event",
      kind: completed ? "recipeComplete" : "submitted",
      actorId: player.id,
      ingredientKey: item.ingredientKey,
      points,
    });
    broadcast(room, { type: "game", game: publicGame(room, now) });
    return;
  }

  let nearest = null;
  let nearestDistance = 1.22;
  for (const item of room.items.values()) {
    if (item.heldBy) continue;
    const [x, z] = SUPPLY_DEPOTS[item.depotIndex].spawn;
    const distance = Math.hypot(player.state.x - x, player.state.z - z);
    if (distance < nearestDistance) {
      nearest = item;
      nearestDistance = distance;
    }
  }
  if (!nearest) return;
  const recipe = FOOD_RECIPES[player.recipeIndex];
  if (!recipe.ingredients.includes(nearest.ingredientKey) || player.recipeProgress.has(nearest.ingredientKey)) {
    send(player.socket, { type: "event", kind: "message", message: "현재 주문에 필요한 재료가 아닙니다." });
    return;
  }
  nearest.heldBy = player.id;
  player.heldItemId = nearest.id;
  room.depotReadyAt[nearest.depotIndex] = now + ITEM_RESPAWN_MS;
  broadcast(room, { type: "event", kind: "pickup", actorId: player.id, itemId: nearest.id, ingredientKey: nearest.ingredientKey });
  broadcast(room, { type: "game", game: publicGame(room, now) });
}

function resetRoom(room, now = Date.now()) {
  room.startedAt = now;
  room.items.clear();
  room.oils.clear();
  room.depotReadyAt.fill(0);
  [...room.players.values()].forEach((player, index) => {
    player.state = {
      ...SPAWNS[index % SPAWNS.length],
      moving: false,
      sprinting: false,
      wallRunning: false,
      fluidized: false,
      seq: player.state.seq + 1,
      updatedAt: now,
    };
    player.score = 0;
    player.heldItemId = null;
    player.cooldowns = {};
    player.stunUntil = 0;
    player.immunityUntil = 0;
    player.wallRunUntil = 0;
    player.fluidizeUntil = 0;
    player.sprintStamina = 2;
    player.sprintRechargeAt = now;
    assignRecipe(player);
  });
  refillDepots(room, now);
}

function tickRoom(room, now) {
  for (const player of room.players.values()) {
    if (!player.state.sprinting && now >= player.sprintRechargeAt) {
      player.sprintStamina = Math.min(2, player.sprintStamina + SERVER_TICK_MS / 1000 * (2 / 3));
    }
    player.state.wallRunning = player.wallRunUntil > now;
    player.state.fluidized = player.fluidizeUntil > now;
    if (player.wallRunUntil <= now && player.state.y > 0.04) player.state.y = 0.04;
  }
  for (const oil of room.oils.values()) {
    for (const player of room.players.values()) {
      if (player.id === oil.ownerId) continue;
      const inside = Math.hypot(player.state.x - oil.x, player.state.z - oil.z) <= 1.1;
      if (!inside) {
        oil.affected.delete(player.id);
        continue;
      }
      if (oil.affected.has(player.id)) continue;
      oil.affected.add(player.id);
      if (stunPlayer(player, 2000, now)) {
        broadcast(room, { type: "event", kind: "oilHit", actorId: oil.ownerId, targetId: player.id, position: { x: oil.x, z: oil.z } });
      }
    }
  }
  refillDepots(room, now);
  if (now - room.lastSnapshotAt >= SNAPSHOT_INTERVAL_MS) {
    room.lastSnapshotAt = now;
    broadcast(room, { type: "game", game: publicGame(room, now) });
  }
}

export function createMultiplayerServer({
  port = Number(process.env.PORT) || DEFAULT_PORT,
  allowedOrigins = process.env.ALLOWED_ORIGINS ?? "",
} = {}) {
  const rooms = new Map();
  const allowedOriginSet = new Set(allowedOrigins.split(",").map((origin) => origin.trim()).filter(Boolean));
  const httpServer = createServer((request, response) => {
    if (request.url === "/health") {
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({
        ok: true,
        authority: "server",
        rooms: rooms.size,
        players: [...rooms.values()].reduce((sum, room) => sum + room.players.size, 0),
        maxPlayersPerRoom: MAX_PLAYERS,
      }));
      return;
    }
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not Found");
  });

  const webSocketServer = new WebSocketServer({ noServer: true, maxPayload: 4096, perMessageDeflate: false });
  httpServer.on("upgrade", (request, socket, head) => {
    const origin = request.headers.origin;
    if (allowedOriginSet.size > 0 && origin && !allowedOriginSet.has(origin)) {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    if (pathname !== "/" && pathname !== "/ws") {
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      socket.destroy();
      return;
    }
    webSocketServer.handleUpgrade(request, socket, head, (webSocket) => webSocketServer.emit("connection", webSocket, request));
  });

  webSocketServer.on("connection", (socket) => {
    socket.isAlive = true;
    socket.playerId = null;
    socket.roomCode = null;
    socket.rateWindowStartedAt = Date.now();
    socket.rateMessageCount = 0;
    socket.on("pong", () => { socket.isAlive = true; });

    const joinTimeout = setTimeout(() => {
      if (!socket.playerId) {
        send(socket, { type: "error", code: "JOIN_TIMEOUT", message: "방 참가 시간이 초과되었습니다." });
        socket.close(1008, "join timeout");
      }
    }, 8000);
    joinTimeout.unref?.();

    socket.on("message", (rawData) => {
      const now = Date.now();
      if (now - socket.rateWindowStartedAt >= 1000) {
        socket.rateWindowStartedAt = now;
        socket.rateMessageCount = 0;
      }
      socket.rateMessageCount += 1;
      if (socket.rateMessageCount > MAX_MESSAGES_PER_SECOND) {
        send(socket, { type: "error", code: "RATE_LIMIT", message: "메시지가 너무 빠릅니다." });
        socket.close(1008, "rate limit");
        return;
      }
      let message;
      try {
        message = JSON.parse(rawData.toString());
      } catch {
        send(socket, { type: "error", code: "BAD_JSON", message: "잘못된 메시지입니다." });
        return;
      }

      if (message.type === "join") {
        if (socket.playerId) return;
        let roomCode = normalizeRoomCode(message.room);
        if (!roomCode) {
          do roomCode = randomRoomCode(); while (rooms.has(roomCode));
        }
        let room = rooms.get(roomCode);
        if (!room) {
          room = createRoom(roomCode);
          rooms.set(roomCode, room);
        }
        if (room.players.size >= MAX_PLAYERS) {
          send(socket, { type: "error", code: "ROOM_FULL", message: "방이 가득 찼습니다." });
          socket.close(1008, "room full");
          return;
        }
        clearTimeout(joinTimeout);
        const playerId = randomUUID();
        const character = clamp(Math.floor(finiteNumber(message.character, 0)), 0, 15);
        const player = createPlayer({
          id: playerId,
          socket,
          name: String(message.name ?? "배달부").trim().slice(0, 24) || "배달부",
          character,
          spawn: SPAWNS[room.players.size % SPAWNS.length],
          now,
        });
        socket.playerId = playerId;
        socket.roomCode = roomCode;
        room.players.set(playerId, player);
        if (!room.hostId) room.hostId = playerId;
        refillDepots(room, now);
        send(socket, {
          type: "welcome",
          id: playerId,
          room: roomCode,
          hostId: room.hostId,
          maxPlayers: MAX_PLAYERS,
          mapSeed: room.mapSeed,
          theme: room.theme,
          startedAt: room.startedAt,
          serverTime: now,
          authority: "server",
          players: [...room.players.values()].map((candidate) => publicPlayer(candidate, now)),
          game: publicGame(room, now),
        });
        broadcast(room, {
          type: "playerJoined",
          player: publicPlayer(player, now),
          hostId: room.hostId,
          playerCount: room.players.size,
        }, socket);
        broadcast(room, { type: "game", game: publicGame(room, now) }, socket);
        return;
      }

      const room = rooms.get(socket.roomCode);
      const player = room?.players.get(socket.playerId);
      if (!room || !player) {
        send(socket, { type: "error", code: "NOT_JOINED", message: "먼저 방에 참가해야 합니다." });
        return;
      }

      if (message.type === "state") {
        const state = sanitizeState(room, player, message, now);
        if (!state) return;
        broadcast(room, { type: "state", id: player.id, state: publicPlayer(player, now).state });
        return;
      }
      if (message.type === "action") {
        if (message.action === "interact") handleInteract(room, player, now);
        if (message.action === "skill") handleSkill(room, player, String(message.skill ?? ""), now);
        return;
      }
      if (message.type === "control") {
        if (player.id !== room.hostId) {
          send(socket, { type: "error", code: "HOST_ONLY", message: "방장만 맵을 변경할 수 있습니다." });
          return;
        }
        if (message.kind === "map") {
          room.mapSeed = Number.isInteger(message.seed) ? message.seed >>> 0 : randomMapSeed();
          room.walls = generateRandomWallLayout(room.mapSeed);
        } else if (message.kind === "theme" && VALID_THEMES.has(message.theme)) {
          room.theme = message.theme;
        } else {
          return;
        }
        resetRoom(room, now);
        broadcast(room, {
          type: "world",
          mapSeed: room.mapSeed,
          theme: room.theme,
          startedAt: room.startedAt,
          players: [...room.players.values()].map((candidate) => publicPlayer(candidate, now)),
          game: publicGame(room, now),
        });
      }
    });

    socket.on("close", () => {
      clearTimeout(joinTimeout);
      const room = rooms.get(socket.roomCode);
      if (!room || !socket.playerId) return;
      const player = room.players.get(socket.playerId);
      if (player?.heldItemId) room.items.delete(player.heldItemId);
      for (const oil of room.oils.values()) if (oil.ownerId === socket.playerId) room.oils.delete(oil.id);
      room.players.delete(socket.playerId);
      if (room.players.size === 0) {
        rooms.delete(room.code);
        return;
      }
      if (room.hostId === socket.playerId) room.hostId = room.players.keys().next().value;
      refillDepots(room);
      broadcast(room, { type: "playerLeft", id: socket.playerId, hostId: room.hostId, playerCount: room.players.size });
      broadcast(room, { type: "game", game: publicGame(room) });
    });
  });

  const heartbeat = setInterval(() => {
    webSocketServer.clients.forEach((socket) => {
      if (!socket.isAlive) {
        socket.terminate();
        return;
      }
      socket.isAlive = false;
      socket.ping();
    });
  }, 15000);
  heartbeat.unref?.();
  const gameLoop = setInterval(() => {
    const now = Date.now();
    rooms.forEach((room) => tickRoom(room, now));
  }, SERVER_TICK_MS);
  gameLoop.unref?.();

  return {
    rooms,
    httpServer,
    webSocketServer,
    async listen() {
      if (httpServer.listening) return httpServer.address();
      await new Promise((resolve, reject) => {
        httpServer.once("error", reject);
        httpServer.listen(port, "0.0.0.0", resolve);
      });
      return httpServer.address();
    },
    async close() {
      clearInterval(heartbeat);
      clearInterval(gameLoop);
      webSocketServer.clients.forEach((socket) => socket.terminate());
      await new Promise((resolve) => httpServer.close(resolve));
    },
  };
}

const isEntryPoint = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isEntryPoint) {
  const multiplayerServer = createMultiplayerServer();
  const address = await multiplayerServer.listen();
  console.log(`Maze Courier authoritative server listening on ws://0.0.0.0:${address.port}/ws`);
}
