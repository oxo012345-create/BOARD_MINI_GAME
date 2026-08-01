export const MAX_PLAYERS = 8;
export const GAME_DURATION_MS = 3 * 60 * 1000;
export const GRID = 19;
export const HALF = (GRID - 1) / 2;
export const TILE_SIZE = 0.92;
export const PLAYER_WALL_RADIUS = 0.29;
export const PLAYER_COLLISION_RADIUS = 0.29;
export const PLAYER_SPEED = 3.15;

export const SPAWNS = [
  { x: -1, y: 0.04, z: 7.85, rotation: Math.PI },
  { x: 1, y: 0.04, z: 7.85, rotation: Math.PI },
  { x: 7.85, y: 0.04, z: -1, rotation: -Math.PI / 2 },
  { x: 7.85, y: 0.04, z: 1, rotation: -Math.PI / 2 },
  { x: -1, y: 0.04, z: -7.85, rotation: 0 },
  { x: 1, y: 0.04, z: -7.85, rotation: 0 },
  { x: -7.85, y: 0.04, z: -1, rotation: Math.PI / 2 },
  { x: -7.85, y: 0.04, z: 1, rotation: Math.PI / 2 },
];

export const SUPPLY_DEPOTS = [
  { grid: [8, 0], spawn: [-1, -8.3] },
  { grid: [10, 0], spawn: [1, -8.3] },
  { grid: [18, 8], spawn: [8.3, -1] },
  { grid: [18, 10], spawn: [8.3, 1] },
  { grid: [8, 18], spawn: [-1, 8.3] },
  { grid: [10, 18], spawn: [1, 8.3] },
  { grid: [0, 8], spawn: [-8.3, -1] },
  { grid: [0, 10], spawn: [-8.3, 1] },
];

export const INGREDIENT_KEYS = [
  "bread", "bun", "ham", "egg", "oil", "tomato", "broth", "sausage",
  "strawberry", "milk", "cheese", "banana", "chocolate", "patty", "lettuce",
  "dough", "rice", "seaweed", "carrot", "flour", "tortilla", "meat", "riceCake",
  "chiliSauce", "fishCake", "apple", "grape", "curry", "potato", "noodles",
  "scallion", "greens", "wasabi", "salmon", "mushroom",
];

export const FOOD_RECIPES = [
  { name: "햄 샌드위치", ingredients: ["bread", "ham"] },
  { name: "계란 프라이", ingredients: ["egg", "oil"] },
  { name: "토마토 수프", ingredients: ["tomato", "broth"] },
  { name: "핫도그", ingredients: ["bun", "sausage"] },
  { name: "딸기 우유", ingredients: ["strawberry", "milk"] },
  { name: "치즈 토스트", ingredients: ["bread", "cheese"] },
  { name: "초코 바나나", ingredients: ["banana", "chocolate"] },
  { name: "햄버거", ingredients: ["bun", "patty", "lettuce"] },
  { name: "치즈 피자", ingredients: ["dough", "tomato", "cheese"] },
  { name: "김밥", ingredients: ["rice", "seaweed", "carrot"] },
  { name: "팬케이크", ingredients: ["flour", "egg", "milk"] },
  { name: "타코", ingredients: ["tortilla", "meat", "lettuce"] },
  { name: "떡볶이", ingredients: ["riceCake", "chiliSauce", "fishCake"] },
  { name: "과일 샐러드", ingredients: ["apple", "banana", "grape"] },
  { name: "카레라이스", ingredients: ["rice", "curry", "potato", "carrot"] },
  { name: "계란 라면", ingredients: ["noodles", "broth", "egg", "scallion"] },
  { name: "비빔밥", ingredients: ["rice", "greens", "egg", "chiliSauce"] },
  { name: "연어 초밥 세트", ingredients: ["rice", "seaweed", "salmon", "wasabi"] },
  { name: "딸기 케이크", ingredients: ["flour", "egg", "milk", "strawberry"] },
  { name: "버섯 파스타", ingredients: ["noodles", "tomato", "cheese", "mushroom"] },
];

export const CHARACTER_LOADOUTS = [
  { movement: "sprint", disruption: "power-push" },
  { movement: "sprint", disruption: "oil" },
  { movement: "jump", disruption: "swap" },
  { movement: "fluidize", disruption: "freeze" },
  { movement: "fluidize", disruption: "power-push" },
  { movement: "jump", disruption: "power-push" },
  { movement: "sprint", disruption: "freeze" },
  { movement: "fluidize", disruption: "power-push" },
  { movement: "jump", disruption: "swap" },
  { movement: "fluidize", disruption: "oil" },
  { movement: "sprint", disruption: "swap" },
  { movement: "jump", disruption: "freeze" },
  { movement: "fluidize", disruption: "swap" },
  { movement: "sprint", disruption: "oil" },
  { movement: "fluidize", disruption: "freeze" },
  { movement: "jump", disruption: "oil" },
];

export const SKILL_COOLDOWNS_MS = {
  push: 5000,
  jump: 14000,
  fluidize: 10000,
  "power-push": 10000,
  freeze: 10000,
  swap: 15000,
  oil: 15000,
};

export function createSeededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ result >>> 15, result | 1);
    result ^= result + Math.imul(result ^ result >>> 7, result | 61);
    return ((result ^ result >>> 14) >>> 0) / 4294967296;
  };
}

function createOuterWallLayout() {
  const walls = new Set();
  const add = (x, z) => walls.add(`${x},${z}`);
  for (let i = 0; i < GRID; i += 1) {
    if (i < 8 || i > 10) {
      add(i, 0);
      add(i, GRID - 1);
      add(0, i);
      add(GRID - 1, i);
    }
  }
  return walls;
}

function createReservedMazeCells() {
  const reserved = new Set();
  const reserve = (x, z) => reserved.add(`${x},${z}`);
  for (let z = 7; z <= 11; z += 1) {
    for (let x = 7; x <= 11; x += 1) reserve(x, z);
  }
  for (let lane = 8; lane <= 10; lane += 1) {
    for (let depth = 0; depth <= 2; depth += 1) {
      reserve(lane, depth);
      reserve(lane, GRID - 1 - depth);
      reserve(depth, lane);
      reserve(GRID - 1 - depth, lane);
    }
  }
  for (let distance = 1; distance < GRID - 1; distance += 1) {
    reserve(9, distance);
    reserve(distance, 9);
  }
  return reserved;
}

function isOutsideConnection(x, z, nextX, nextZ) {
  if (nextZ < 0) return z === 0 && x >= 8 && x <= 10;
  if (nextZ >= GRID) return z === GRID - 1 && x >= 8 && x <= 10;
  if (nextX < 0) return x === 0 && z >= 8 && z <= 10;
  if (nextX >= GRID) return x === GRID - 1 && z >= 8 && z <= 10;
  return false;
}

function isMazeLayoutPlayable(walls, reserved) {
  for (const key of reserved) if (walls.has(key)) return false;
  const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const visited = new Set(["9,9"]);
  const queue = [[9, 9]];
  for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
    const [x, z] = queue[queueIndex];
    for (const [dx, dz] of directions) {
      const nextX = x + dx;
      const nextZ = z + dz;
      if (nextX < 0 || nextX >= GRID || nextZ < 0 || nextZ >= GRID) continue;
      const key = `${nextX},${nextZ}`;
      if (walls.has(key) || visited.has(key)) continue;
      visited.add(key);
      queue.push([nextX, nextZ]);
    }
  }
  let walkableCount = 0;
  for (let z = 0; z < GRID; z += 1) {
    for (let x = 0; x < GRID; x += 1) {
      if (walls.has(`${x},${z}`)) continue;
      walkableCount += 1;
      let exits = 0;
      for (const [dx, dz] of directions) {
        const nextX = x + dx;
        const nextZ = z + dz;
        if (nextX < 0 || nextX >= GRID || nextZ < 0 || nextZ >= GRID) {
          if (isOutsideConnection(x, z, nextX, nextZ)) exits += 1;
        } else if (!walls.has(`${nextX},${nextZ}`)) {
          exits += 1;
        }
      }
      if (exits < 2) return false;
    }
  }
  return visited.size === walkableCount
    && ["9,0", "9,18", "0,9", "18,9"].every((key) => visited.has(key));
}

export function generateRandomWallLayout(seed) {
  const random = createSeededRandom(seed);
  const reserved = createReservedMazeCells();
  const walls = createOuterWallLayout();
  const outerWallCount = walls.size;
  const targetInternalWalls = 70 + Math.floor(random() * 22);
  let attempts = 0;
  while (walls.size - outerWallCount < targetInternalWalls && attempts < 5000) {
    attempts += 1;
    const horizontal = random() > 0.5;
    const length = 2 + Math.floor(random() * 5);
    const startX = 1 + Math.floor(random() * (GRID - 2));
    const startZ = 1 + Math.floor(random() * (GRID - 2));
    const candidateCells = [];
    let validSegment = true;
    for (let index = 0; index < length; index += 1) {
      const x = startX + (horizontal ? index : 0);
      const z = startZ + (horizontal ? 0 : index);
      const key = `${x},${z}`;
      if (x <= 0 || x >= GRID - 1 || z <= 0 || z >= GRID - 1 || reserved.has(key)) {
        validSegment = false;
        break;
      }
      if (!walls.has(key)) candidateCells.push(key);
    }
    if (!validSegment || candidateCells.length < 2) continue;
    const candidateWalls = new Set(walls);
    candidateCells.forEach((key) => candidateWalls.add(key));
    if (!isMazeLayoutPlayable(candidateWalls, reserved)) continue;
    candidateCells.forEach((key) => walls.add(key));
  }
  return walls;
}

export function distance2d(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
