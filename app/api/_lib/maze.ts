// Server-authoritative state and validation for the embedded Maze Courier game.
// @ts-expect-error The shared game rules are authored as a runtime ESM module.
import {
  CHARACTER_LOADOUTS,
  FOOD_RECIPES,
  GAME_DURATION_MS,
  HALF,
  INGREDIENT_KEYS,
  PLAYER_COLLISION_RADIUS,
  PLAYER_SPEED,
  PLAYER_WALL_RADIUS,
  SKILL_COOLDOWNS_MS,
  SPAWNS,
  SUPPLY_DEPOTS,
  TILE_SIZE,
  generateRandomWallLayout,
} from "./maze-rules.js";
import type { Player } from "./rooms";

type MazePlayerState = {
  x: number; y: number; z: number; rotation: number; moving: boolean; sprinting: boolean;
  wallRunning: boolean; fluidized: boolean; seq: number; updatedAt: number;
};

type MazePlayer = {
  id: string; name: string; character: number; state: MazePlayerState; score: number;
  recipeIndex: number; progress: string[]; heldItemId: string | null;
  cooldowns: Record<string, number>; stunUntil: number; immunityUntil: number;
  wallRunUntil: number; fluidizeUntil: number; sprintStamina: number; sprintRechargeAt: number;
  recentActionIds?: string[]; lastActionAt?: number;
};

type MazeItem = { id: string; ingredientKey: string; depotIndex: number; heldBy: string | null };
type MazeOil = { id: string; ownerId: string; x: number; z: number; affected: string[] };

export type MazeState = {
  mapSeed: number; theme: "ice" | "lava" | "space"; startedAt: number; endsAt: number;
  players: Record<string, MazePlayer>; items: Record<string, MazeItem>; oils: Record<string, MazeOil>;
  nextItemSerial: number; nextOilSerial: number;
  depotReadyAt?: number[];
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const finite = (value: unknown, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const randomIndex = (length: number) => length > 0 ? Math.floor(Math.random() * length) : 0;
const distance = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

function randomSeed() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0];
}

function makePlayer(player: Player, index: number, now: number, characterSelections: Record<string, number>): MazePlayer {
  const spawn = SPAWNS[index % SPAWNS.length];
  return {
    id: player.id,
    name: player.name,
    character: clamp(Math.floor(finite(characterSelections[player.id], index)), 0, CHARACTER_LOADOUTS.length - 1),
    state: { ...spawn, moving: false, sprinting: false, wallRunning: false, fluidized: false, seq: 0, updatedAt: now },
    score: 0,
    recipeIndex: randomIndex(FOOD_RECIPES.length),
    progress: [],
    heldItemId: null,
    cooldowns: {},
    stunUntil: 0,
    immunityUntil: 0,
    wallRunUntil: 0,
    fluidizeUntil: 0,
    sprintStamina: 2,
    sprintRechargeAt: now,
    recentActionIds: [],
    lastActionAt: 0,
  };
}

function neededIngredient(state: MazeState, depotIndex: number) {
  const players = Object.values(state.players);
  const player = players[depotIndex % Math.max(1, players.length)];
  const recipe = FOOD_RECIPES[player?.recipeIndex ?? 0];
  const missing = recipe?.ingredients.filter((key: string) => !player.progress.includes(key)) ?? [];
  return missing[randomIndex(missing.length)] ?? INGREDIENT_KEYS[randomIndex(INGREDIENT_KEYS.length)];
}

function refillDepots(state: MazeState) {
  const now = Date.now();
  const depotReadyAt = state.depotReadyAt ?? (state.depotReadyAt = Array(SUPPLY_DEPOTS.length).fill(0));
  for (let depotIndex = 0; depotIndex < SUPPLY_DEPOTS.length; depotIndex += 1) {
    if (Object.values(state.items).some((item) => item.depotIndex === depotIndex && !item.heldBy)) continue;
    if ((depotReadyAt[depotIndex] ?? 0) > now) continue;
    const id = `item-${++state.nextItemSerial}`;
    state.items[id] = { id, ingredientKey: neededIngredient(state, depotIndex), depotIndex, heldBy: null };
    depotReadyAt[depotIndex] = 0;
  }
}

export function createMazeState(players: Player[], characterSelections: Record<string, number> = {}): MazeState {
  const now = Date.now();
  const startsAt = now + 5_000;
  const themes: MazeState["theme"][] = ["ice", "lava", "space"];
  const state: MazeState = {
    mapSeed: randomSeed(), theme: themes[randomIndex(themes.length)], startedAt: startsAt, endsAt: startsAt + GAME_DURATION_MS,
    players: {}, items: {}, oils: {}, nextItemSerial: 0, nextOilSerial: 0, depotReadyAt: Array(SUPPLY_DEPOTS.length).fill(0),
  };
  players.slice(0, 8).forEach((player, index) => { state.players[player.id] = makePlayer(player, index, now, characterSelections); });
  refillDepots(state);
  return state;
}

function wallTop(walls: Set<string>, x: number, z: number) {
  const gridX = Math.round(x + HALF);
  const gridZ = Math.round(z + HALF);
  return walls.has(`${gridX},${gridZ}`)
    && Math.abs(x - (gridX - HALF)) <= TILE_SIZE * 0.55
    && Math.abs(z - (gridZ - HALF)) <= TILE_SIZE * 0.55;
}

function canOccupy(state: MazeState, player: MazePlayer, x: number, z: number, now: number) {
  const mapLimit = HALF + TILE_SIZE * 0.5 - PLAYER_WALL_RADIUS;
  if (x < -mapLimit || x > mapLimit || z < -mapLimit || z > mapLimit) return false;
  const walls = generateRandomWallLayout(state.mapSeed) as Set<string>;
  const wallRunning = player.wallRunUntil > now;
  const fluidized = player.fluidizeUntil > now;
  if (wallRunning) return wallTop(walls, x, z);
  if (!fluidized) {
    const centerX = Math.round(x + HALF);
    const centerZ = Math.round(z + HALF);
    for (let gz = centerZ - 1; gz <= centerZ + 1; gz += 1) {
      for (let gx = centerX - 1; gx <= centerX + 1; gx += 1) {
        if (!walls.has(`${gx},${gz}`)) continue;
        const wx = gx - HALF;
        const wz = gz - HALF;
        const nx = clamp(x, wx - TILE_SIZE / 2, wx + TILE_SIZE / 2);
        const nz = clamp(z, wz - TILE_SIZE / 2, wz + TILE_SIZE / 2);
        if ((x - nx) ** 2 + (z - nz) ** 2 < PLAYER_WALL_RADIUS ** 2) return false;
      }
    }
  }
  if (x * x + z * z < 1.48 ** 2) return false;
  for (const other of Object.values(state.players)) {
    if (other.id === player.id || fluidized || other.fluidizeUntil > now) continue;
    if ((other.wallRunUntil > now) !== wallRunning) continue;
    if (distance({ x, z }, other.state) < PLAYER_COLLISION_RADIUS * 2) return false;
  }
  return true;
}

function landPlayerFromWall(state: MazeState, player: MazePlayer, now: number) {
  const centerX = Math.round(player.state.x + HALF) - HALF;
  const centerZ = Math.round(player.state.z + HALF) - HALF;
  const candidates: Array<{ x: number; z: number }> = [];
  for (let radius = 1; radius <= 5; radius += 1) {
    for (let dz = -radius; dz <= radius; dz += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue;
        candidates.push({ x: centerX + dx, z: centerZ + dz });
      }
    }
  }

  player.wallRunUntil = 0;
  for (const candidate of candidates) {
    if (!canOccupy(state, player, candidate.x, candidate.z, now)) continue;
    player.state.x = candidate.x;
    player.state.y = 0.04;
    player.state.z = candidate.z;
    player.state.wallRunning = false;
    markServerMovement(player, now);
    return true;
  }

  const players = Object.values(state.players);
  const playerIndex = Math.max(0, players.findIndex((candidate) => candidate.id === player.id));
  const spawn = SPAWNS[playerIndex % SPAWNS.length];
  player.state = { ...player.state, ...spawn, moving: false, sprinting: false, wallRunning: false, seq: player.state.seq + 1, updatedAt: now };
  return false;
}

function publicPlayer(player: MazePlayer, now: number) {
  const cooldowns = Object.fromEntries(Object.entries(player.cooldowns).map(([key, until]) => [key, Math.max(0, (until - now) / 1000)]));
  return {
    id: player.id, name: player.name, character: player.character,
    state: {
      ...player.state,
      stunRemaining: Math.max(0, (player.stunUntil - now) / 1000),
      immunityRemaining: Math.max(0, (player.immunityUntil - now) / 1000),
      wallRunRemaining: Math.max(0, (player.wallRunUntil - now) / 1000),
      fluidizeRemaining: Math.max(0, (player.fluidizeUntil - now) / 1000),
      sprintStamina: player.sprintStamina,
    },
    game: { score: player.score, recipeIndex: player.recipeIndex, progress: player.progress, heldItemId: player.heldItemId, cooldowns },
  };
}

export function mazeGameSnapshot(state: MazeState) {
  const now = Date.now();
  for (const player of Object.values(state.players)) {
    const held = player.heldItemId ? state.items[player.heldItemId] : undefined;
    if (!held || held.heldBy !== player.id) player.heldItemId = null;
  }
  for (const item of Object.values(state.items)) {
    if (!item.heldBy) continue;
    const holder = state.players[item.heldBy];
    if (!holder || (holder.heldItemId && holder.heldItemId !== item.id)) item.heldBy = null;
    else holder.heldItemId = item.id;
  }
  refillDepots(state);
  return {
    serverTime: now,
    startedAt: state.startedAt,
    endsAt: state.endsAt,
    players: Object.values(state.players).map((player) => publicPlayer(player, now)),
    items: Object.values(state.items).map(({ id, ingredientKey, depotIndex, heldBy }) => ({ id, ingredientKey, depotIndex, heldBy })),
    oils: Object.values(state.oils).map(({ id, ownerId, x, z }) => ({ id, ownerId, x, z })),
  };
}

export function mazeWelcome(state: MazeState, viewerId: string, hostId: string) {
  const game = mazeGameSnapshot(state);
  return {
    type: "welcome", id: viewerId, room: "", hostId, mapSeed: state.mapSeed, theme: state.theme,
    startedAt: state.startedAt, players: game.players, game,
  };
}

function movePlayer(state: MazeState, player: MazePlayer, message: Record<string, unknown>, now: number) {
  const seq = Math.floor(finite(message.seq, -1));
  if (seq <= player.state.seq || player.stunUntil > now) return;
  const sentAt = Number(message.sentAt);
  if (Number.isFinite(sentAt) && (now - sentAt > 1_500 || sentAt - now > 5_000)) return;
  if (player.wallRunUntil > 0 && player.wallRunUntil <= now) landPlayerFromWall(state, player, now);
  const sequenceGap = seq - player.state.seq;
  // State requests are serialized by the client. On a slower mobile link the
  // interval between accepted packets can exceed 450ms, so the old cap treated
  // legitimate accumulated movement as a speed hack and pulled the player
  // backwards. Keep validation speed-based while allowing realistic RTTs.
  // Coalesced packets can also arrive immediately after the preceding request;
  // their sequence gap represents movement time that the server clock alone
  // cannot see.
  const serverDt = (now - player.state.updatedAt) / 1000;
  const sequenceDt = sequenceGap / 12;
  const dt = clamp(Math.max(serverDt, sequenceDt), 0.016, 1.25);
  const moving = Boolean(message.moving);
  const loadout = CHARACTER_LOADOUTS[player.character];
  let sprinting = Boolean(message.sprinting) && loadout.movement === "sprint" && player.sprintStamina > 0;
  if (sprinting && moving) {
    player.sprintStamina = Math.max(0, player.sprintStamina - dt);
    player.sprintRechargeAt = now + 1000;
    sprinting = player.sprintStamina > 0;
  } else if (now >= player.sprintRechargeAt) {
    player.sprintStamina = Math.min(2, player.sprintStamina + dt * 2 / 3);
  }
  const multiplier = sprinting ? 1.7 : player.wallRunUntil > now ? 1.18 : 1;
  const maxDistance = PLAYER_SPEED * multiplier * dt + 0.09;
  let dx = finite(message.x, player.state.x) - player.state.x;
  let dz = finite(message.z, player.state.z) - player.state.z;
  const requested = Math.hypot(dx, dz);
  if (requested > maxDistance && requested > 0) { dx *= maxDistance / requested; dz *= maxDistance / requested; }
  let x = player.state.x;
  let z = player.state.z;
  if (canOccupy(state, player, x + dx, z, now)) x += dx;
  if (canOccupy(state, player, x, z + dz, now)) z += dz;
  player.state = {
    x, y: player.wallRunUntil > now ? 1.64 : 0.04, z,
    rotation: finite(message.rotation, player.state.rotation), moving: moving && (Math.abs(dx) > 0.001 || Math.abs(dz) > 0.001),
    sprinting, wallRunning: player.wallRunUntil > now, fluidized: player.fluidizeUntil > now,
    seq, updatedAt: now,
  };
  for (const oil of Object.values(state.oils)) {
    if (oil.ownerId === player.id || oil.affected.includes(player.id) || distance(oil, player.state) > 0.82) continue;
    oil.affected.push(player.id);
    player.stunUntil = now + 1100;
    player.immunityUntil = now + 3100;
  }
}

function interact(state: MazeState, player: MazePlayer) {
  if (player.heldItemId) {
    const item = state.items[player.heldItemId];
    const recipe = FOOD_RECIPES[player.recipeIndex];
    const canSubmit = Math.hypot(player.state.x, player.state.z) < 2.05
      && item
      && recipe?.ingredients.includes(item.ingredientKey)
      && !player.progress.includes(item.ingredientKey);
    if (!canSubmit) {
      if (item) delete state.items[item.id];
      player.heldItemId = null;
      refillDepots(state);
      return { type: "event", kind: "discarded", actorId: player.id };
    }
    player.progress.push(item.ingredientKey);
    delete state.items[item.id];
    player.heldItemId = null;
    if (recipe.ingredients.every((key: string) => player.progress.includes(key))) {
      const points = recipe.ingredients.length;
      player.score += points;
      player.recipeIndex = (player.recipeIndex + 1 + randomIndex(Math.max(1, FOOD_RECIPES.length - 1))) % FOOD_RECIPES.length;
      player.progress = [];
      refillDepots(state);
      return { type: "event", kind: "recipeComplete", actorId: player.id, points };
    }
    refillDepots(state);
    return { type: "event", kind: "submitted", actorId: player.id };
  }
  const item = Object.values(state.items)
    .filter((candidate) => !candidate.heldBy)
    .sort((a, b) => distance(player.state, { x: SUPPLY_DEPOTS[a.depotIndex].spawn[0], z: SUPPLY_DEPOTS[a.depotIndex].spawn[1] })
      - distance(player.state, { x: SUPPLY_DEPOTS[b.depotIndex].spawn[0], z: SUPPLY_DEPOTS[b.depotIndex].spawn[1] }))[0];
  if (!item) return null;
  const spawn = { x: SUPPLY_DEPOTS[item.depotIndex].spawn[0], z: SUPPLY_DEPOTS[item.depotIndex].spawn[1] };
  if (distance(player.state, spawn) > 1.25) return null;
  item.heldBy = player.id;
  player.heldItemId = item.id;
  const depotReadyAt = state.depotReadyAt ?? (state.depotReadyAt = Array(SUPPLY_DEPOTS.length).fill(0));
  depotReadyAt[item.depotIndex] = Date.now() + 5_000;
  return { type: "event", kind: "pickup", actorId: player.id };
}

function markServerMovement(player: MazePlayer, now: number) {
  player.state.seq += 1;
  player.state.updatedAt = now;
}

function activateSkill(state: MazeState, player: MazePlayer, skill: string, now: number) {
  const loadout = CHARACTER_LOADOUTS[player.character];
  if (!["push", loadout.movement, loadout.disruption].includes(skill) || skill === "sprint") return null;
  const descendingFromWall = skill === "jump" && player.wallRunUntil > now;
  if ((!descendingFromWall && (player.cooldowns[skill] ?? 0) > now) || player.stunUntil > now) return null;
  const others = Object.values(state.players).filter((other) => other.id !== player.id && other.immunityUntil <= now);
  let target: MazePlayer | undefined;
  let succeeded = false;
  if (skill === "push" || skill === "power-push") {
    target = others.sort((a, b) => distance(player.state, a.state) - distance(player.state, b.state))[0];
    if (target && distance(player.state, target.state) <= 1.65) {
      const dx = target.state.x - player.state.x;
      const dz = target.state.z - player.state.z;
      const length = Math.hypot(dx, dz) || 1;
      const amount = skill === "power-push" ? 1.5 : 1;
      let moved = false;
      for (let travelled = 0.1; travelled <= amount + 0.001; travelled += 0.1) {
        const nx = target.state.x + dx / length * 0.1;
        const nz = target.state.z + dz / length * 0.1;
        if (!canOccupy(state, target, nx, nz, now)) break;
        target.state.x = nx;
        target.state.z = nz;
        moved = true;
      }
      if (moved) markServerMovement(target, now);
      if (skill === "power-push") { target.stunUntil = now + 3000; target.immunityUntil = now + 5000; }
      succeeded = true;
    }
  } else if (skill === "freeze") {
    target = others[randomIndex(others.length)];
    if (target) { target.stunUntil = now + 3000; target.immunityUntil = now + 5000; succeeded = true; }
  } else if (skill === "swap") {
    target = others[randomIndex(others.length)];
    if (target) {
      [player.state.x, target.state.x] = [target.state.x, player.state.x];
      [player.state.z, target.state.z] = [target.state.z, player.state.z];
      markServerMovement(player, now);
      markServerMovement(target, now);
      succeeded = true;
    }
  } else if (skill === "oil") {
    const existing = Object.values(state.oils).find((oil) => oil.ownerId === player.id);
    if (existing) delete state.oils[existing.id];
    else {
      const id = `oil-${++state.nextOilSerial}`;
      state.oils[id] = { id, ownerId: player.id, x: player.state.x, z: player.state.z, affected: [] };
    }
    succeeded = true;
  } else if (skill === "fluidize") {
    player.fluidizeUntil = now + 3000;
    succeeded = true;
  } else if (descendingFromWall) {
    landPlayerFromWall(state, player, now);
    succeeded = true;
  } else if (skill === "jump" && !player.heldItemId) {
    const walls = generateRandomWallLayout(state.mapSeed) as Set<string>;
    let nearest: { x: number; z: number } | undefined;
    let nearestDistance = 1.35;
    for (const key of walls) {
      const [gx, gz] = key.split(",").map(Number);
      const point = { x: gx - HALF, z: gz - HALF };
      const candidateDistance = distance(player.state, point);
      if (candidateDistance < nearestDistance) { nearest = point; nearestDistance = candidateDistance; }
    }
    if (nearest) {
      player.state.x = nearest.x;
      player.state.y = 1.64;
      player.state.z = nearest.z;
      player.state.wallRunning = true;
      player.wallRunUntil = now + 4000;
      markServerMovement(player, now);
      succeeded = true;
    }
  }
  if (!succeeded) return null;
  if (!descendingFromWall) player.cooldowns[skill] = now + (SKILL_COOLDOWNS_MS[skill] ?? 5000);
  return {
    type: "event", kind: "skill", skill, actorId: player.id, targetId: target?.id ?? null,
    actorPosition: { x: player.state.x, z: player.state.z },
    targetPosition: target ? { x: target.state.x, z: target.state.z } : null,
  };
}

function acceptAction(player: MazePlayer, message: Record<string, unknown>, now: number) {
  const sentAt = Number(message.sentAt);
  if (Number.isFinite(sentAt) && (now - sentAt > 1_500 || sentAt - now > 5_000)) return false;
  const actionId = typeof message.actionId === "string" ? message.actionId.slice(0, 96) : "";
  const recent = player.recentActionIds ?? (player.recentActionIds = []);
  if (actionId && recent.includes(actionId)) return false;
  if (now - (player.lastActionAt ?? 0) < 90) return false;
  player.lastActionAt = now;
  if (actionId) {
    recent.push(actionId);
    if (recent.length > 32) recent.splice(0, recent.length - 32);
  }
  return true;
}

export function applyMazeMessage(
  state: MazeState,
  viewer: Player,
  hostId: string,
  message: Record<string, unknown>,
) {
  const player = state.players[viewer.id];
  if (!player) return [{ type: "error", code: "NOT_PLAYING", message: "이 게임의 참가자가 아니에요." }];
  const now = Date.now();
  const events: Record<string, unknown>[] = [];
  if (message.type === "join") {
    player.character = clamp(Math.floor(finite(message.character, player.character)), 0, CHARACTER_LOADOUTS.length - 1);
    player.name = viewer.name;
  } else if (message.type === "state") {
    if (now >= state.startedAt) movePlayer(state, player, message, now);
  } else if (message.type === "action") {
    if (now < state.startedAt) return [];
    if (!acceptAction(player, message, now)) return [];
    const action = String(message.action ?? "");
    const event = action === "interact" ? interact(state, player) : action === "skill" ? activateSkill(state, player, String(message.skill ?? ""), now) : null;
    if (event) events.push(event);
  } else if (message.type === "control") {
    if (viewer.id !== hostId) return [{ type: "error", code: "HOST_ONLY", message: "방장만 맵을 바꿀 수 있어요." }];
    if (message.kind === "theme" && ["ice", "lava", "space"].includes(String(message.theme))) state.theme = String(message.theme) as MazeState["theme"];
    if (message.kind === "map") state.mapSeed = Math.floor(finite(message.seed, randomSeed())) >>> 0;
    state.startedAt = now;
    state.endsAt = now + GAME_DURATION_MS;
    Object.values(state.players).forEach((item, index) => {
      const spawn = SPAWNS[index % SPAWNS.length];
      item.state = {
        ...item.state, ...spawn, moving: false, sprinting: false, wallRunning: false, fluidized: false,
        seq: item.state.seq + 1, updatedAt: now,
      };
      item.score = 0; item.progress = []; item.heldItemId = null;
      item.stunUntil = 0; item.immunityUntil = 0; item.wallRunUntil = 0; item.fluidizeUntil = 0;
      item.cooldowns = {}; item.sprintStamina = 2; item.sprintRechargeAt = now;
    });
    state.items = {}; state.oils = {}; state.depotReadyAt = Array(SUPPLY_DEPOTS.length).fill(0); refillDepots(state);
    events.push({ type: "world", mapSeed: state.mapSeed, theme: state.theme, startedAt: state.startedAt, players: Object.values(state.players).map((item) => publicPlayer(item, now)), game: mazeGameSnapshot(state) });
  }
  events.push({ type: "game", game: mazeGameSnapshot(state) });
  return events;
}
