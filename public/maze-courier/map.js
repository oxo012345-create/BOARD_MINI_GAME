import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const canvas = document.querySelector("#map-canvas");
const loading = document.querySelector("#loading");
const mapTitle = document.querySelector("#map-title");
const mapSubtitle = document.querySelector("#map-subtitle");
const mapButtons = [...document.querySelectorAll("[data-map]")];
const touchJoystick = document.querySelector("#touch-joystick");
const joystickKnob = document.querySelector("#joystick-knob");
const resetPlayerButton = document.querySelector("#reset-player");
const regenerateMazeButton = document.querySelector("#regenerate-maze");
const mazeSeedLabel = document.querySelector("#maze-seed");
const gameTimerLabel = document.querySelector("#game-timer");
const gameScoreLabel = document.querySelector("#game-score");
const recipeNameLabel = document.querySelector("#recipe-name");
const recipePointsLabel = document.querySelector("#recipe-points");
const recipeIngredients = document.querySelector("#recipe-ingredients");
const heldItemLabel = document.querySelector("#held-item");
const gameMessage = document.querySelector("#game-message");
const actionButtons = [...document.querySelectorAll("[data-action]")];
const activeCharacterNameLabel = document.querySelector("#active-character-name");
const activeCharacterSkillsLabel = document.querySelector("#active-character-skills");
const audioToggleButton = document.querySelector("#audio-toggle");
const bgmAudio = document.querySelector("#bgm-audio");
const onlineStatus = document.querySelector("#online-status");
const onlineRoomLabel = document.querySelector("#online-room");
const onlineCountLabel = document.querySelector("#online-count");
const copyRoomCodeButton = document.querySelector("#copy-room-code");
const characterChangeLink = document.querySelector(".scene-link");
const launchParams = new URLSearchParams(window.location.search);
const multiplayerEnabled = launchParams.get("online") === "1";
const requestedRoomCode = String(launchParams.get("room") ?? "")
  .toUpperCase()
  .replace(/[^A-Z0-9]/g, "")
  .slice(0, 8);
if (multiplayerEnabled && characterChangeLink) {
  characterChangeLink.href = `./characters.html?select=1&embedded=1&online=1&room=${requestedRoomCode}`;
}

const BGM_TRACKS = {
  ice: "./assets/audio/bgm/ice-silly-pups-in-snow.mp3",
  lava: "./assets/audio/bgm/lava-upbeat-rpg-battle.mp3",
  space: "./assets/audio/bgm/space-magical-technology.mp3",
};
const SFX_TRACKS = {
  "item-pickup": "./assets/audio/sfx/processed/item-pickup.wav",
  "item-drop": "./assets/audio/sfx/processed/item-drop.wav",
  push: "./assets/audio/sfx/processed/push.wav",
  "power-push": "./assets/audio/sfx/processed/power-push.wav",
  sprint: "./assets/audio/sfx/processed/sprint.wav",
  jump: "./assets/audio/sfx/processed/jump.wav",
  freeze: "./assets/audio/sfx/processed/freeze.wav",
  swap: "./assets/audio/sfx/processed/swap.wav",
  oil: "./assets/audio/sfx/processed/oil.wav",
  fluidize: "./assets/audio/sfx/processed/fluidize.wav",
  immunity: "./assets/audio/sfx/processed/immunity.wav",
};
const SKILL_SFX = {
  push: "push",
  "power-push": "power-push",
  freeze: "freeze",
  swap: "swap",
  oil: "oil",
  fluidize: "fluidize",
  jump: "jump",
};
const BGM_VOLUME = 0.18;
const SFX_VOLUME = 0.72;
const sfxLibrary = new Map(
  Object.entries(SFX_TRACKS).map(([key, src]) => {
    const audio = new Audio(src);
    audio.preload = "auto";
    return [key, audio];
  }),
);
bgmAudio.loop = true;
bgmAudio.preload = "none";

let audioUnlocked = false;
let audioMuted = localStorage.getItem("mazeCourierMuted") === "true";
let requestedBgmTheme = "ice";
let bgmFadeFrame = 0;
let bgmChangeToken = 0;

function updateAudioToggle() {
  audioToggleButton.textContent = audioMuted ? "🔇" : "🔊";
  audioToggleButton.setAttribute("aria-pressed", String(audioMuted));
  audioToggleButton.setAttribute("aria-label", audioMuted ? "사운드 켜기" : "사운드 끄기");
}

function fadeBgmTo(targetVolume, duration, onComplete) {
  cancelAnimationFrame(bgmFadeFrame);
  const initialVolume = bgmAudio.volume;
  const startedAt = performance.now();
  const update = (now) => {
    const progress = Math.min(1, (now - startedAt) / duration);
    const eased = progress * progress * (3 - 2 * progress);
    bgmAudio.volume = THREE.MathUtils.lerp(initialVolume, targetVolume, eased);
    if (progress < 1) {
      bgmFadeFrame = requestAnimationFrame(update);
    } else {
      onComplete?.();
    }
  };
  bgmFadeFrame = requestAnimationFrame(update);
}

function startThemeBgm(themeKey) {
  requestedBgmTheme = themeKey;
  if (!audioUnlocked || audioMuted) return;
  const nextSource = new URL(BGM_TRACKS[themeKey], window.location.href).href;
  const changeToken = bgmChangeToken += 1;
  const startNextTrack = () => {
    if (changeToken !== bgmChangeToken || audioMuted) return;
    if (bgmAudio.src !== nextSource) {
      bgmAudio.src = nextSource;
      bgmAudio.currentTime = 0;
      bgmAudio.load();
    }
    bgmAudio.volume = 0;
    bgmAudio.play()
      .then(() => fadeBgmTo(BGM_VOLUME, 480))
      .catch(() => {});
  };

  if (bgmAudio.src && !bgmAudio.paused && bgmAudio.src !== nextSource) {
    fadeBgmTo(0, 220, () => {
      bgmAudio.pause();
      startNextTrack();
    });
  } else if (bgmAudio.src === nextSource) {
    bgmAudio.play()
      .then(() => fadeBgmTo(BGM_VOLUME, 280))
      .catch(() => {});
  } else {
    startNextTrack();
  }
}

function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  sfxLibrary.forEach((audio) => audio.load());
  startThemeBgm(requestedBgmTheme);
}

function playSfx(key, volumeScale = 1) {
  if (!audioUnlocked || audioMuted) return;
  const template = sfxLibrary.get(key);
  if (!template) return;
  const sound = template.cloneNode();
  sound.volume = Math.min(1, SFX_VOLUME * volumeScale);
  sound.play().catch(() => {});
}

function setAudioMuted(nextMuted) {
  audioMuted = nextMuted;
  localStorage.setItem("mazeCourierMuted", String(audioMuted));
  updateAudioToggle();
  if (audioMuted) {
    bgmChangeToken += 1;
    cancelAnimationFrame(bgmFadeFrame);
    bgmAudio.pause();
  } else {
    unlockAudio();
    startThemeBgm(requestedBgmTheme);
  }
}

updateAudioToggle();

const CHARACTER_LOADOUTS = [
  { name: "민트 배달부", color: 0x35d5b5, accent: 0xffa52d, movement: "sprint", disruption: "power-push" },
  { name: "딸기 요리사", color: 0xff567f, accent: 0xfff2d2, movement: "sprint", disruption: "oil" },
  { name: "레몬 탐험가", color: 0xffd33f, accent: 0x4e9cff, movement: "jump", disruption: "swap" },
  { name: "블루 연구원", color: 0x4d91ff, accent: 0x79f4ff, movement: "fluidize", disruption: "freeze" },
  { name: "보라 수호자", color: 0x9a62f2, accent: 0xffd84c, movement: "fluidize", disruption: "power-push" },
  { name: "주황 정비사", color: 0xff842d, accent: 0x3a4962, movement: "jump", disruption: "power-push" },
  { name: "라임 냉동원", color: 0x83e34f, accent: 0x42d8ff, movement: "sprint", disruption: "freeze" },
  { name: "차콜 조련사", color: 0x586174, accent: 0xff4f72, movement: "fluidize", disruption: "power-push" },
  { name: "레드 구조대", color: 0xe9434f, accent: 0xffd349, movement: "jump", disruption: "swap" },
  { name: "아쿠아 잠수부", color: 0x28c4ce, accent: 0x7ff5ff, movement: "fluidize", disruption: "oil" },
  { name: "골드 보물꾼", color: 0xe2ad31, accent: 0xffef7a, movement: "sprint", disruption: "swap" },
  { name: "화이트 의무원", color: 0xe8edf5, accent: 0x51d6c5, movement: "jump", disruption: "freeze" },
  { name: "네이비 잠입꾼", color: 0x263b78, accent: 0x8a96ff, movement: "fluidize", disruption: "swap" },
  { name: "브라운 창고지기", color: 0x9b643c, accent: 0xf1ba6b, movement: "sprint", disruption: "oil" },
  { name: "마젠타 연금술사", color: 0xd94eb7, accent: 0x73f29e, movement: "fluidize", disruption: "freeze" },
  { name: "실버 꼬마비행사", color: 0x9aa9bd, accent: 0xff684d, movement: "jump", disruption: "oil" },
];
const SKILL_LABELS = {
  sprint: "달리기",
  jump: "점프",
  fluidize: "유체화",
  "power-push": "강력 밀치기",
  freeze: "급속냉각",
  swap: "자리바꾸기",
  oil: "기름칠",
};
const selectedCharacterIndex = THREE.MathUtils.clamp(
  Number.parseInt(localStorage.getItem("mazeCourierCharacter") ?? "0", 10) || 0,
  0,
  CHARACTER_LOADOUTS.length - 1,
);
const activeLoadout = CHARACTER_LOADOUTS[selectedCharacterIndex];

const GAME_DURATION_SECONDS = 5 * 60;
const SUPPLY_DEPOTS = [
  { grid: [8, 0], spawn: [-1, -8.3] },
  { grid: [10, 0], spawn: [1, -8.3] },
  { grid: [18, 8], spawn: [8.3, -1] },
  { grid: [18, 10], spawn: [8.3, 1] },
  { grid: [8, 18], spawn: [-1, 8.3] },
  { grid: [10, 18], spawn: [1, 8.3] },
  { grid: [0, 8], spawn: [-8.3, -1] },
  { grid: [0, 10], spawn: [-8.3, 1] },
];

const INGREDIENTS = {
  bread: { name: "빵", icon: "🍞", color: 0xd6a65a, shape: "box" },
  bun: { name: "번", icon: "🥯", color: 0xd48b3d, shape: "sphere" },
  ham: { name: "햄", icon: "🥓", color: 0xe96b70, shape: "box" },
  egg: { name: "달걀", icon: "🥚", color: 0xfff0be, shape: "sphere" },
  oil: { name: "식용유", icon: "🫗", color: 0xf4c94c, shape: "cylinder" },
  tomato: { name: "토마토", icon: "🍅", color: 0xed4d3d, shape: "sphere" },
  broth: { name: "육수", icon: "🥣", color: 0xd78a4a, shape: "cylinder" },
  sausage: { name: "소시지", icon: "🌭", color: 0xc84f40, shape: "capsule" },
  strawberry: { name: "딸기", icon: "🍓", color: 0xe63b55, shape: "cone" },
  milk: { name: "우유", icon: "🥛", color: 0xf0f5ee, shape: "box" },
  cheese: { name: "치즈", icon: "🧀", color: 0xf2c83f, shape: "box" },
  banana: { name: "바나나", icon: "🍌", color: 0xf6d849, shape: "capsule" },
  chocolate: { name: "초콜릿", icon: "🍫", color: 0x70402b, shape: "box" },
  patty: { name: "패티", icon: "🥩", color: 0x82462f, shape: "cylinder" },
  lettuce: { name: "양상추", icon: "🥬", color: 0x62b84f, shape: "sphere" },
  dough: { name: "도우", icon: "🫓", color: 0xe7c58b, shape: "cylinder" },
  rice: { name: "밥", icon: "🍚", color: 0xf3f0db, shape: "sphere" },
  seaweed: { name: "김", icon: "🌿", color: 0x244e36, shape: "box" },
  carrot: { name: "당근", icon: "🥕", color: 0xf07832, shape: "cone" },
  flour: { name: "밀가루", icon: "🌾", color: 0xead8b1, shape: "sphere" },
  tortilla: { name: "토르티야", icon: "🫓", color: 0xdcb76a, shape: "cylinder" },
  meat: { name: "고기", icon: "🍖", color: 0xa9543e, shape: "box" },
  riceCake: { name: "떡", icon: "🍥", color: 0xf6efe1, shape: "capsule" },
  chiliSauce: { name: "고추장", icon: "🌶️", color: 0xb52d27, shape: "cylinder" },
  fishCake: { name: "어묵", icon: "🍢", color: 0xd99e61, shape: "box" },
  apple: { name: "사과", icon: "🍎", color: 0xd9363e, shape: "sphere" },
  grape: { name: "포도", icon: "🍇", color: 0x7446a7, shape: "sphere" },
  curry: { name: "카레", icon: "🍛", color: 0xc88d28, shape: "cylinder" },
  potato: { name: "감자", icon: "🥔", color: 0xb48a58, shape: "sphere" },
  noodles: { name: "면", icon: "🍜", color: 0xe8ce77, shape: "torus" },
  scallion: { name: "대파", icon: "🌱", color: 0x62a85b, shape: "capsule" },
  greens: { name: "나물", icon: "🥗", color: 0x3d9650, shape: "sphere" },
  wasabi: { name: "와사비", icon: "🟢", color: 0x78b84f, shape: "sphere" },
  salmon: { name: "연어", icon: "🍣", color: 0xf17d62, shape: "box" },
  mushroom: { name: "버섯", icon: "🍄", color: 0xb76d53, shape: "sphere" },
};

const FOOD_RECIPES = [
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

const THEMES = {
  ice: {
    title: "빙하 연구기지",
    subtitle: "반투명 얼음과 입체적인 눈이 덮인 빙하 기지",
    background: 0x07172a,
    fog: 0x07172a,
    floorA: 0xb8dce9,
    floorB: 0x91c4dc,
    wall: 0x4f85aa,
    wallTop: 0x7fc8e8,
    edge: 0x213e59,
    base: 0x24455e,
    objective: 0x19c9ff,
    storage: [0xa4f5ff, 0xd4fbff, 0x73d7ff, 0xb0e6ff],
    layout: "ice",
  },
  lava: {
    title: "화산 제련소",
    subtitle: "현무암 바닥과 흐르는 용암 기둥이 있는 제련소",
    background: 0x170907,
    fog: 0x170907,
    floorA: 0x39353c,
    floorB: 0x484149,
    wall: 0x642f28,
    wallTop: 0x9a5138,
    edge: 0x160c0a,
    base: 0x26110e,
    objective: 0xff7538,
    storage: [0xffa23d, 0xffd35b, 0xff6844, 0xffbd48],
    layout: "lava",
  },
  space: {
    title: "무중력 정거장",
    subtitle: "황금 메탈 블록과 태양계 행성이 떠 있는 우주 기지",
    background: 0x01030a,
    fog: 0x01030a,
    floorA: 0x141925,
    floorB: 0x202738,
    wall: 0x30384c,
    wallTop: 0xb98a32,
    edge: 0x4f3b19,
    base: 0x050711,
    objective: 0xffb62e,
    storage: [0x67e8f9, 0xa78bfa, 0x60a5fa, 0xf0abfc],
    layout: "space",
  },
};

const GRID = 19;
const HALF = (GRID - 1) / 2;
const TILE_SIZE = 0.92;
const LAVA_SURFACE_WALL_COORDS = [
  [2, 0], [5, 0], [13, 0], [16, 0],
  [0, 4], [18, 4], [0, 14], [18, 14],
  [0, 7], [18, 11],
];
const LAVA_SURFACE_WALL_KEYS = new Set(
  LAVA_SURFACE_WALL_COORDS.map(([x, z]) => `${x},${z}`),
);

const scene = new THREE.Scene();
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;

const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 160);
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.42, 0.34, 0.76);
const outputPass = new OutputPass();
composer.addPass(renderPass);
composer.addPass(bloomPass);
composer.addPass(outputPass);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.enablePan = false;
controls.zoomSpeed = 1.25;
controls.target.set(0, 0.2, 0);
controls.minPolarAngle = Math.PI * 0.18;
controls.maxPolarAngle = Math.PI * 0.48;

scene.add(new THREE.HemisphereLight(0xe4f1ff, 0x20283b, 3.2));

const keyLight = new THREE.DirectionalLight(0xfff2df, 4.1);
keyLight.position.set(10, 19, 12);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -15;
keyLight.shadow.camera.right = 15;
keyLight.shadow.camera.top = 15;
keyLight.shadow.camera.bottom = -15;
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0x4a9fff, 2.3);
rimLight.position.set(-12, 10, -10);
scene.add(rimLight);

const mapRoot = new THREE.Group();
const decorRoot = new THREE.Group();
const playerRoot = new THREE.Group();
const itemRoot = new THREE.Group();
const gameplayEffectRoot = new THREE.Group();
scene.add(mapRoot, decorRoot, playerRoot, itemRoot, gameplayEffectRoot);

let currentTheme = THEMES.ice;
let objectiveCore = null;
let objectiveRing = null;
let compactView = null;
let renderWidth = 0;
let renderHeight = 0;
let activeEffects = [];
let activeWallCells = new Set();
let generatedWallLayout = null;
let currentMazeSeed = 0;
let gameTimeRemaining = GAME_DURATION_SECONDS;
let gameScore = 0;
let gameActive = true;
let currentRecipe = null;
let recipeDeck = [];
let recipeProgress = new Set();
let heldItem = null;
let messageTimer = 0;
let sprintHeld = false;
let oilSerial = 0;
let gameRoundId = 0;
let sprintTrailTimer = 0;
const spawnedItems = [];
const oilPuddles = [];
const skillState = {
  push: { cooldown: 5, remaining: 0 },
  sprint: {
    stamina: 2,
    maxStamina: 2,
    rechargeDelay: 0,
  },
  jump: { cooldown: 14, remaining: 0, active: 0 },
  fluidize: { cooldown: 10, remaining: 0, active: 0 },
  "power-push": { cooldown: 10, remaining: 0 },
  freeze: { cooldown: 10, remaining: 0 },
  swap: { cooldown: 15, remaining: 0 },
  oil: { cooldown: 15, remaining: 0 },
};
const depotRespawnTimers = Array(SUPPLY_DEPOTS.length).fill(0);
const gameplayEffects = [];
const clock = new THREE.Clock();
const geometryCache = new Map();
const movementKeys = new Set();
const joystickInput = new THREE.Vector2();
const playerVelocity = new THREE.Vector3();
const cameraForward = new THREE.Vector3();
const cameraRight = new THREE.Vector3();
const desiredWorldDirection = new THREE.Vector3();
const desiredLocalDirection = new THREE.Vector3();
const cameraFollowWorld = new THREE.Vector3();
const cameraFollowStep = new THREE.Vector3();
const yAxis = new THREE.Vector3(0, 1, 0);
const PLAYER_WALL_RADIUS = 0.29;
// Match character-to-character spacing to the usable width of a one-tile lane.
// Two solid characters can queue in the lane, but cannot stand side by side.
const PLAYER_COLLISION_RADIUS = 0.29;
const PLAYER_SPEED = 3.15;
const PLAYER_SPAWN = new THREE.Vector3(0, 0.04, 7.85);
const BOT_SPAWNS = [
  new THREE.Vector3(7.85, 0.04, 0),
  new THREE.Vector3(0, 0.04, -7.85),
  new THREE.Vector3(-7.85, 0.04, 0),
];

function roundedBox(width, height, radius = 0.07) {
  const key = `${width}:${height}:${radius}`;
  if (!geometryCache.has(key)) {
    geometryCache.set(key, new RoundedBoxGeometry(width, height, width, 2, radius));
  }
  return geometryCache.get(key);
}

function createSnowCapGeometry(seed = 1) {
  const geometry = new THREE.BufferGeometry();
  const segments = 48;
  const rings = 10;
  const halfSize = 0.49;
  const randomAt = (value) => {
    const result = Math.sin(value * 91.733 + seed * 37.719) * 43758.5453;
    return result - Math.floor(result);
  };
  const driftAngle = randomAt(1.3) * Math.PI * 2;
  const driftAmount = 0.025 + randomAt(2.7) * 0.065;
  const moundX = Math.cos(driftAngle) * driftAmount;
  const moundZ = Math.sin(driftAngle) * driftAmount;
  const moundHeight = 0.105 + randomAt(4.1) * 0.065;
  const roundness = 2.45 + randomAt(5.9) * 2.1;
  const aspectX = 0.91 + randomAt(7.2) * 0.11;
  const aspectZ = 0.91 + randomAt(8.6) * 0.11;
  const lobeAngle = randomAt(10.4) * Math.PI * 2;
  const dentAngle = lobeAngle + Math.PI * (0.55 + randomAt(11.8) * 0.7);
  const positions = [moundX, 0.03 + moundHeight, moundZ];
  const uvs = [moundX / (halfSize * 2) + 0.5, moundZ / (halfSize * 2) + 0.5];
  const indices = [];

  for (let ring = 1; ring <= rings; ring += 1) {
    const t = ring / rings;
    for (let segment = 0; segment < segments; segment += 1) {
      const angle = (segment / segments) * Math.PI * 2;
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      const superEllipseRadius = halfSize
        / Math.pow(
          Math.pow(Math.abs(cosine), roundness) + Math.pow(Math.abs(sine), roundness),
          1 / roundness,
        );
      const lobeDistance = Math.atan2(Math.sin(angle - lobeAngle), Math.cos(angle - lobeAngle));
      const dentDistance = Math.atan2(Math.sin(angle - dentAngle), Math.cos(angle - dentAngle));
      const broadLobe = Math.exp(-(lobeDistance * lobeDistance) / 0.34) * (0.035 + randomAt(13.2) * 0.035);
      const softDent = Math.exp(-(dentDistance * dentDistance) / 0.2) * (0.018 + randomAt(14.7) * 0.026);
      const broadWave = Math.sin(angle * 2 + seed * 0.17) * 0.018
        + Math.sin(angle * 3 + seed * 0.31) * 0.011;
      const edgeNoise = (randomAt(segment + seed * 13) - 0.5) * 0.052;
      const radius = (superEllipseRadius + broadLobe - softDent + broadWave + edgeNoise * Math.pow(t, 3)) * t;
      const x = moundX * (1 - t) + cosine * radius * aspectX;
      const z = moundZ * (1 - t) + sine * radius * aspectZ;
      const distanceFromMound = Math.min(1, Math.hypot(x - moundX, z - moundZ) / (halfSize * 1.2));
      const softRipple = Math.sin(angle * (2 + seed % 3) + seed) * 0.009 * t;
      const mound = 0.024 + Math.pow(1 - distanceFromMound, 1.55) * moundHeight;
      const y = mound + softRipple + (randomAt(segment * 5 + ring * 17) - 0.5) * 0.009;
      positions.push(x, y, z);
      uvs.push(x / (halfSize * 2) + 0.5, z / (halfSize * 2) + 0.5);
    }
  }

  for (let segment = 0; segment < segments; segment += 1) {
    indices.push(0, 1 + ((segment + 1) % segments), 1 + segment);
  }
  for (let ring = 1; ring < rings; ring += 1) {
    const innerStart = 1 + (ring - 1) * segments;
    const outerStart = innerStart + segments;
    for (let segment = 0; segment < segments; segment += 1) {
      const next = (segment + 1) % segments;
      indices.push(
        innerStart + segment, outerStart + next, outerStart + segment,
        innerStart + segment, innerStart + next, outerStart + next,
      );
    }
  }

  const outerStart = 1 + (rings - 1) * segments;
  const skirtStart = positions.length / 3;
  for (let segment = 0; segment < segments; segment += 1) {
    const sourceIndex = outerStart + segment;
    const x = positions[sourceIndex * 3];
    const topY = positions[sourceIndex * 3 + 1];
    const z = positions[sourceIndex * 3 + 2];
    const drip = Math.pow(randomAt(segment * 23 + 5), 3) * 0.075;
    positions.push(x * 0.992, topY - 0.045 - drip, z * 0.992);
    uvs.push(segment / segments, 0);
  }
  for (let segment = 0; segment < segments; segment += 1) {
    const next = (segment + 1) % segments;
    indices.push(
      outerStart + segment, skirtStart + next, skirtStart + segment,
      outerStart + segment, outerStart + next, skirtStart + next,
    );
  }

  geometry.setIndex(indices);
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function gridToWorld(x, z) {
  return { x: x - HALF, z: z - HALF };
}

function addMesh(geometry, material, position, parent = mapRoot, rotation = [0, 0, 0]) {
  const item = new THREE.Mesh(geometry, material);
  item.position.set(...position);
  item.rotation.set(...rotation);
  item.castShadow = true;
  item.receiveShadow = true;
  parent.add(item);
  return item;
}

function createPlayerCharacter({
  bodyColor = 0x35d5b5,
  accentColor = 0xffa52d,
  name = "플레이어",
  isBot = false,
} = {}) {
  const character = new THREE.Group();
  character.position.copy(PLAYER_SPAWN);
  playerRoot.add(character);

  const model = new THREE.Group();
  character.add(model);

  const mintMaterial = new THREE.MeshPhysicalMaterial({
    color: bodyColor,
    roughness: 0.46,
    metalness: 0.02,
    clearcoat: 0.16,
    clearcoatRoughness: 0.62,
  });
  const orangeMaterial = new THREE.MeshStandardMaterial({
    color: accentColor,
    roughness: 0.55,
  });
  const darkMaterial = new THREE.MeshStandardMaterial({
    color: 0x101827,
    roughness: 0.58,
  });
  const eyeMaterial = new THREE.MeshStandardMaterial({
    color: 0xf5fdff,
    emissive: 0x8ddfff,
    emissiveIntensity: 0.22,
    roughness: 0.32,
  });

  const addCharacterMesh = (
    geometry,
    material,
    position,
    parent = model,
    rotation = [0, 0, 0],
  ) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  const shadowMaterial = new THREE.MeshBasicMaterial({
    color: 0x07101b,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
  });
  const shadow = addCharacterMesh(
    new THREE.CircleGeometry(0.43, 28),
    shadowMaterial,
    [0, 0.005, 0],
    character,
    [-Math.PI / 2, 0, 0],
  );
  shadow.castShadow = false;

  const body = addCharacterMesh(
    new THREE.CapsuleGeometry(0.4, 0.48, 8, 18),
    mintMaterial,
    [0, 0.86, 0],
  );
  body.scale.z = 0.9;

  const facePlate = addCharacterMesh(
    new THREE.SphereGeometry(0.35, 24, 16),
    darkMaterial,
    [0, 1.02, 0.335],
  );
  facePlate.scale.set(1, 0.67, 0.24);
  [-0.115, 0.115].forEach((x) => {
    const eye = addCharacterMesh(
      new THREE.SphereGeometry(0.055, 14, 10),
      eyeMaterial,
      [x, 1.04, 0.414],
    );
    eye.scale.set(0.7, 1.1, 0.5);
  });

  const pack = addCharacterMesh(
    new THREE.BoxGeometry(0.48, 0.58, 0.24),
    orangeMaterial,
    [0, 0.83, -0.39],
  );
  pack.scale.z = 0.8;
  addCharacterMesh(
    new THREE.BoxGeometry(0.31, 0.07, 0.08),
    darkMaterial,
    [0, 1.09, -0.515],
  );

  const armPivots = [];
  [-1, 1].forEach((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.43, 1.02, 0);
    model.add(pivot);
    const arm = addCharacterMesh(
      new THREE.CapsuleGeometry(0.105, 0.28, 6, 12),
      mintMaterial,
      [0, -0.18, 0],
      pivot,
      [0, 0, side * -0.14],
    );
    arm.scale.z = 0.9;
    armPivots.push(pivot);
  });

  const legPivots = [];
  [-1, 1].forEach((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.2, 0.27, 0);
    model.add(pivot);
    addCharacterMesh(
      new THREE.CapsuleGeometry(0.115, 0.18, 6, 12),
      mintMaterial,
      [0, -0.08, 0],
      pivot,
    );
    addCharacterMesh(
      new THREE.BoxGeometry(0.25, 0.12, 0.34),
      darkMaterial,
      [0, -0.25, 0.07],
      pivot,
    );
    legPivots.push(pivot);
  });

  const immunityEffect = new THREE.Group();
  immunityEffect.visible = false;
  character.add(immunityEffect);
  const shield = addCharacterMesh(
    new THREE.SphereGeometry(0.61, 24, 18),
    new THREE.MeshPhysicalMaterial({
      color: 0x75e7ff,
      emissive: 0x2e9fff,
      emissiveIntensity: 0.7,
      transparent: true,
      opacity: 0.13,
      roughness: 0.1,
      metalness: 0.05,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
    [0, 0.86, 0],
    immunityEffect,
  );
  shield.castShadow = false;
  const immunityRings = [0.62, 0.7].map((radius, index) => {
    const ring = addCharacterMesh(
      new THREE.TorusGeometry(radius, 0.018, 8, 40),
      new THREE.MeshBasicMaterial({
        color: index ? 0xffdf75 : 0x71e9ff,
        transparent: true,
        opacity: 0.76,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
      [0, 0.86, 0],
      immunityEffect,
      [Math.PI / 2 + index * 0.62, index * 0.45, 0],
    );
    ring.castShadow = false;
    return ring;
  });
  const immunityDots = [];
  for (let index = 0; index < 7; index += 1) {
    const dot = addCharacterMesh(
      new THREE.SphereGeometry(0.035, 8, 6),
      new THREE.MeshBasicMaterial({
        color: index % 2 ? 0xffea8a : 0x78eaff,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
      [0, 0.86, 0],
      immunityEffect,
    );
    dot.castShadow = false;
    immunityDots.push(dot);
  }

  const fluidizeEffect = new THREE.Group();
  fluidizeEffect.visible = false;
  character.add(fluidizeEffect);
  const fluidShell = addCharacterMesh(
    new THREE.IcosahedronGeometry(0.68, 2),
    new THREE.MeshBasicMaterial({
      color: 0x9cf8ff,
      wireframe: true,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
    [0, 0.86, 0],
    fluidizeEffect,
  );
  fluidShell.castShadow = false;
  const fluidRings = [0.48, 0.62, 0.76].map((radius, index) => {
    const ring = addCharacterMesh(
      new THREE.TorusGeometry(radius, 0.018, 7, 40),
      new THREE.MeshBasicMaterial({
        color: index % 2 ? 0xa68cff : 0x6eefff,
        transparent: true,
        opacity: 0.68,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
      [0, 0.45 + index * 0.37, 0],
      fluidizeEffect,
      [Math.PI / 2, 0, 0],
    );
    ring.castShadow = false;
    return ring;
  });

  return {
    name,
    isBot,
    group: character,
    model,
    body,
    shadow,
    armPivots,
    legPivots,
    moving: false,
    stunRemaining: 0,
    immunityRemaining: 0,
    decisionTimer: 0,
    moveDirection: new THREE.Vector3(),
    slipperyVelocity: new THREE.Vector3(),
    wallRunRemaining: 0,
    fluidizeRemaining: 0,
    sprinting: false,
    immunityEffect,
    immunityRings,
    immunityDots,
    fluidizeEffect,
    fluidShell,
    fluidRings,
  };
}

const playerCharacter = createPlayerCharacter({
  bodyColor: activeLoadout.color,
  accentColor: activeLoadout.accent,
  name: activeLoadout.name,
});
const botCharacters = [
  createPlayerCharacter({
    bodyColor: 0xff5a86,
    accentColor: 0x69e3ff,
    name: "분홍 배달부",
    isBot: true,
  }),
  createPlayerCharacter({
    bodyColor: 0x8a6cff,
    accentColor: 0xffdf57,
    name: "보라 배달부",
    isBot: true,
  }),
  createPlayerCharacter({
    bodyColor: 0xff9c40,
    accentColor: 0x57ef9b,
    name: "주황 배달부",
    isBot: true,
  }),
];
const remotePlayers = new Map();
let multiplayerSocket = null;
let localNetworkId = null;
let roomHostId = null;
let activeRoomCode = requestedRoomCode;
let networkReconnectTimer = 0;
let networkReconnectAttempts = 0;
let networkSequence = 0;
let networkSendAccumulator = 0;
let lastNetworkStateSignature = "";
let lastNetworkStateSentAt = 0;
let multiplayerConnected = false;
let multiplayerClosing = false;
let multiplayerFatalError = false;
let serverClockOffset = 0;
let multiplayerTransport = "websocket";
let networkPollTimer = 0;
let networkPostInFlight = false;
const networkPostQueue = [];
let lastAppliedNetworkSequence = -1;
const networkSentStates = new Map();

function resolveMultiplayerServerUrl(realtimeEndpoint = "") {
  const provided = launchParams.get("server")?.trim();
  if (provided) localStorage.setItem("mazeCourierServerUrl", provided);
  const saved = provided || localStorage.getItem("mazeCourierServerUrl");
  if (saved) {
    try {
      const url = new URL(saved, window.location.href);
      if (url.protocol === "http:") url.protocol = "ws:";
      if (url.protocol === "https:") url.protocol = "wss:";
      if (url.protocol === "ws:" || url.protocol === "wss:") return url.href;
    } catch {
      localStorage.removeItem("mazeCourierServerUrl");
    }
  }
  const url = realtimeEndpoint
    ? new URL(realtimeEndpoint)
    : new URL(`/api/rooms/${requestedRoomCode}/maze/socket`, window.location.href);
  if (realtimeEndpoint) url.pathname = `${url.pathname.replace(/\/$/, "")}/connect`;
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.href;
}

function setOnlineStatus(status, message, playerCount = remotePlayers.size + 1) {
  if (!multiplayerEnabled) return;
  onlineStatus.hidden = false;
  onlineStatus.classList.toggle("connected", status === "connected");
  onlineStatus.classList.toggle("reconnecting", status === "connecting");
  onlineRoomLabel.textContent = message;
  onlineCountLabel.textContent = `${playerCount} / 8명`;
}

function clearOtherCharacters() {
  botCharacters.forEach((character) => {
    playerRoot.remove(character.group);
  });
  botCharacters.splice(0, botCharacters.length);
  remotePlayers.clear();
}

function applyRemoteState(character, state, immediate = false) {
  if (!state) return;
  character.networkTargetPosition.set(
    Number(state.x) || 0,
    Number(state.y) || PLAYER_SPAWN.y,
    Number(state.z) || 0,
  );
  character.networkTargetRotation = Number(state.rotation) || 0;
  character.networkMoving = Boolean(state.moving);
  character.networkSprinting = Boolean(state.sprinting);
  character.networkWallRunning = Boolean(state.wallRunning);
  character.networkFluidized = Boolean(state.fluidized);
  character.stunRemaining = Math.max(0, Number(state.stunRemaining) || 0);
  character.immunityRemaining = Math.max(0, Number(state.immunityRemaining) || 0);
  character.networkUpdatedAt = performance.now();
  if (immediate) {
    character.group.position.copy(character.networkTargetPosition);
    character.group.rotation.y = character.networkTargetRotation;
  }
}

function applyAuthoritativeSelf(player, immediate = false) {
  if (!player?.state || player.id !== localNetworkId) return;
  const serverSequence = Number(player.state.seq);
  const hasServerSequence = Number.isFinite(serverSequence);
  const target = new THREE.Vector3(
    Number(player.state.x) || 0,
    Number(player.state.y) || PLAYER_SPAWN.y,
    Number(player.state.z) || 0,
  );

  // A poll can finish after a newer state POST. Applying that older snapshot on
  // every poll pulls the locally predicted player back toward an already
  // acknowledged position. Reconcile each authoritative sequence only once.
  if (immediate || !hasServerSequence || serverSequence > lastAppliedNetworkSequence) {
    const sentState = hasServerSequence ? networkSentStates.get(serverSequence) : null;
    if (immediate || !sentState) {
      playerCharacter.group.position.copy(target);
    } else {
      // Preserve movement made after this packet was sent. Only apply the
      // difference introduced by server collision/speed validation.
      const correctionX = target.x - sentState.x;
      const correctionY = target.y - sentState.y;
      const correctionZ = target.z - sentState.z;
      const correctionDistance = Math.hypot(correctionX, correctionY, correctionZ);
      if (correctionDistance > 1.35) {
        playerCharacter.group.position.copy(target);
      } else if (correctionDistance > 0.075) {
        playerCharacter.group.position.x += correctionX;
        playerCharacter.group.position.y += correctionY;
        playerCharacter.group.position.z += correctionZ;
      }
    }
    // Acknowledgements describe the direction from when the packet was sent.
    // Reapplying it after local prediction makes the character twitch toward an
    // old diagonal direction on every network response.
    if (immediate || !sentState) {
      playerCharacter.group.rotation.y = Number(player.state.rotation) || 0;
    }
    if (hasServerSequence) {
      lastAppliedNetworkSequence = serverSequence;
      networkSequence = Math.max(networkSequence, serverSequence);
      for (const sequence of networkSentStates.keys()) {
        if (sequence <= serverSequence) networkSentStates.delete(sequence);
      }
    }
  }
  playerCharacter.stunRemaining = Math.max(0, Number(player.state.stunRemaining) || 0);
  playerCharacter.immunityRemaining = Math.max(0, Number(player.state.immunityRemaining) || 0);
  playerCharacter.wallRunRemaining = Math.max(0, Number(player.state.wallRunRemaining) || 0);
  playerCharacter.fluidizeRemaining = Math.max(0, Number(player.state.fluidizeRemaining) || 0);
  if (Number.isFinite(Number(player.state.sprintStamina))) {
    skillState.sprint.stamina = THREE.MathUtils.clamp(Number(player.state.sprintStamina), 0, 2);
  }
  const game = player.game;
  if (!game) return;
  gameScore = Math.max(0, Number(game.score) || 0);
  const recipeIndex = THREE.MathUtils.clamp(Number(game.recipeIndex) || 0, 0, FOOD_RECIPES.length - 1);
  currentRecipe = FOOD_RECIPES[recipeIndex];
  recipeProgress = new Set(Array.isArray(game.progress) ? game.progress : []);
  Object.entries(game.cooldowns || {}).forEach(([skill, remaining]) => {
    if (skillState[skill] && "remaining" in skillState[skill]) {
      skillState[skill].remaining = Math.max(0, Number(remaining) || 0);
    }
  });
}

function attachNetworkItem(item, holderId) {
  const holder = holderId === localNetworkId ? playerCharacter : remotePlayers.get(holderId);
  if (holder) {
    holder.model.add(item.group);
    item.group.position.set(0, 1.42, 0.52);
    item.group.rotation.set(0, 0, 0);
    item.group.scale.setScalar(0.82);
    item.group.children.forEach((child) => {
      if (child.userData.ingredientLabel) child.visible = false;
    });
    item.held = true;
    item.heldBy = holderId;
    if (holderId === localNetworkId) heldItem = item;
    return;
  }
  itemRoot.add(item.group);
  const [x, z] = SUPPLY_DEPOTS[item.depotIndex].spawn;
  item.group.position.set(x, item.spawnY, z);
  item.group.rotation.set(0, 0, 0);
  item.group.scale.setScalar(1);
  item.group.children.forEach((child) => {
    if (child.userData.ingredientLabel) child.visible = true;
  });
  item.held = false;
  item.heldBy = null;
  if (heldItem === item) heldItem = null;
}

function syncAuthoritativeItems(serverItems) {
  const presentIds = new Set();
  (Array.isArray(serverItems) ? serverItems : []).forEach((serverItem) => {
    presentIds.add(serverItem.id);
    let item = spawnedItems.find((candidate) => candidate.networkId === serverItem.id);
    if (!item) {
      item = spawnIngredient(serverItem.ingredientKey, Number(serverItem.depotIndex) || 0);
      if (!item) return;
      item.networkId = serverItem.id;
    }
    item.ingredientKey = serverItem.ingredientKey;
    item.depotIndex = Number(serverItem.depotIndex) || 0;
    if (item.heldBy !== (serverItem.heldBy || null)) attachNetworkItem(item, serverItem.heldBy || null);
  });
  [...spawnedItems].forEach((item) => {
    if (item.networkId && !presentIds.has(item.networkId)) removeIngredientItem(item);
  });
  if (heldItem?.networkId && !presentIds.has(heldItem.networkId)) heldItem = null;
}

function syncAuthoritativeOils(serverOils) {
  const presentIds = new Set();
  (Array.isArray(serverOils) ? serverOils : []).forEach((serverOil) => {
    presentIds.add(serverOil.id);
    let puddle = oilPuddles.find((candidate) => candidate.networkId === serverOil.id);
    if (!puddle) {
      puddle = createOilPuddle(
        new THREE.Vector3(Number(serverOil.x) || 0, 0.078, Number(serverOil.z) || 0),
        serverOil.id,
        false,
      );
    }
  });
  for (let index = oilPuddles.length - 1; index >= 0; index -= 1) {
    const puddle = oilPuddles[index];
    if (!puddle.networkId || presentIds.has(puddle.networkId)) continue;
    puddle.group.removeFromParent();
    oilPuddles.splice(index, 1);
  }
}

function applyAuthoritativeGame(game, immediate = false) {
  if (!game) return;
  serverClockOffset = Number(game.serverTime || Date.now()) - Date.now();
  gameTimeRemaining = Math.max(0, (Number(game.endsAt) - (Date.now() + serverClockOffset)) / 1000);
  gameActive = gameTimeRemaining > 0;
  const players = Array.isArray(game.players) ? game.players : [];
  const self = players.find((player) => player.id === localNetworkId);
  applyAuthoritativeSelf(self, immediate);
  players.forEach((player) => {
    if (player.id === localNetworkId) return;
    const character = addRemotePlayer(player, immediate);
    if (character) applyRemoteState(character, player.state, immediate);
  });
  syncAuthoritativeItems(game.items);
  syncAuthoritativeOils(game.oils);
  if (currentRecipe) updateRecipeUI();
}

function addRemotePlayer(player, immediate = true) {
  if (!player || player.id === localNetworkId) return null;
  const existing = remotePlayers.get(player.id);
  if (existing) {
    applyRemoteState(existing, player.state, immediate);
    return existing;
  }
  const characterIndex = THREE.MathUtils.clamp(Number(player.character) || 0, 0, 15);
  const loadout = CHARACTER_LOADOUTS[characterIndex];
  const character = createPlayerCharacter({
    bodyColor: loadout.color,
    accentColor: loadout.accent,
    name: player.name || loadout.name,
  });
  character.isRemote = true;
  character.networkId = player.id;
  character.networkTargetPosition = new THREE.Vector3();
  character.networkTargetRotation = 0;
  character.networkMoving = false;
  character.networkSprinting = false;
  character.networkWallRunning = false;
  character.networkFluidized = false;
  character.networkUpdatedAt = performance.now();
  botCharacters.push(character);
  remotePlayers.set(player.id, character);
  applyRemoteState(character, player.state, immediate);
  return character;
}

function removeRemotePlayer(playerId) {
  const character = remotePlayers.get(playerId);
  if (!character) return;
  playerRoot.remove(character.group);
  const index = botCharacters.indexOf(character);
  if (index >= 0) botCharacters.splice(index, 1);
  remotePlayers.delete(playerId);
}

function applyNetworkWorld(message) {
  if (!message) return;
  regenerateWallLayout(Number(message.mapSeed) >>> 0);
  buildMap(message.theme in THEMES ? message.theme : "ice");
  resetGameState();
  const elapsed = Math.max(0, (Date.now() - Number(message.startedAt || Date.now())) / 1000);
  gameTimeRemaining = Math.max(0, GAME_DURATION_SECONDS - elapsed);
  gameTimerLabel.textContent = formatGameTime(gameTimeRemaining);
  gameActive = gameTimeRemaining > 0;

  const players = Array.isArray(message.players) ? message.players : [];
  const self = players.find((player) => player.id === localNetworkId);
  if (self?.state) {
    playerCharacter.group.position.set(
      Number(self.state.x) || 0,
      Number(self.state.y) || PLAYER_SPAWN.y,
      Number(self.state.z) || 0,
    );
    playerCharacter.group.rotation.y = Number(self.state.rotation) || 0;
  }

  const presentRemoteIds = new Set();
  players.forEach((player) => {
    if (player.id === localNetworkId) return;
    presentRemoteIds.add(player.id);
    addRemotePlayer(player, true);
  });
  [...remotePlayers.keys()].forEach((playerId) => {
    if (!presentRemoteIds.has(playerId)) removeRemotePlayer(playerId);
  });
  applyAuthoritativeGame(message.game, true);
}

function handleMultiplayerMessage(message) {
  if (message.type === "welcome") {
    localNetworkId = message.id;
    activeRoomCode = message.room;
    roomHostId = message.hostId;
    multiplayerConnected = true;
    networkReconnectAttempts = 0;
    clearOtherCharacters();
    applyNetworkWorld(message);
    setOnlineStatus(
      "connected",
      `${activeRoomCode}${roomHostId === localNetworkId ? " · 방장" : ""}`,
      message.players.length,
    );
    showGameMessage(`${activeRoomCode} 방에 참가했습니다.`);
    return;
  }

  if (message.type === "playerJoined") {
    roomHostId = message.hostId;
    addRemotePlayer(message.player, true);
    setOnlineStatus(
      "connected",
      `${activeRoomCode}${roomHostId === localNetworkId ? " · 방장" : ""}`,
      message.playerCount,
    );
    showGameMessage(`${message.player.name} 참가`);
    return;
  }

  if (message.type === "playerLeft") {
    removeRemotePlayer(message.id);
    roomHostId = message.hostId;
    setOnlineStatus(
      "connected",
      `${activeRoomCode}${roomHostId === localNetworkId ? " · 방장" : ""}`,
      message.playerCount,
    );
    return;
  }

  if (message.type === "state") {
    if (message.id === localNetworkId) {
      applyAuthoritativeSelf({ id: localNetworkId, state: message.state });
    } else {
      const character = remotePlayers.get(message.id);
      if (character) applyRemoteState(character, message.state);
    }
    return;
  }

  if (message.type === "game") {
    applyAuthoritativeGame(message.game);
    return;
  }

  if (message.type === "event") {
    const actor = message.actorId === localNetworkId ? playerCharacter : remotePlayers.get(message.actorId);
    const target = message.targetId === localNetworkId ? playerCharacter : remotePlayers.get(message.targetId);
    if (message.kind === "message") showGameMessage(message.message || "서버 알림");
    if (message.kind === "pickup") playSfx("item-pickup", 0.9);
    if (message.kind === "submitted") playSfx("item-drop", 0.86);
    if (message.kind === "recipeComplete") {
      playSfx("item-drop", 0.95);
      showGameMessage(`요리 완성! +${Number(message.points) || 0}점`, 2.7);
    }
    if (message.kind === "oilHit" && target) {
      createShockwaveEffect(target.group.position, 0x55d9e6, 0.58);
      showGameMessage(message.targetId === localNetworkId ? "기름에 미끄러졌습니다!" : `${target.name}이(가) 미끄러졌습니다!`);
    }
    if (message.kind === "skill") {
      if (message.skill === "freeze" && target) createFreezeEffect(target);
      if ((message.skill === "push" || message.skill === "power-push") && target) {
        createShockwaveEffect(target.group.position, message.skill === "power-push" ? 0xff754f : 0x66eaff, 0.9);
      }
      if (message.skill === "swap") {
        if (message.actorPosition) createSwapPortalEffect(new THREE.Vector3(message.actorPosition.x, 0.04, message.actorPosition.z), 0x5cecff);
        if (message.targetPosition) createSwapPortalEffect(new THREE.Vector3(message.targetPosition.x, 0.04, message.targetPosition.z), 0xff75df);
      }
      if (message.skill === "fluidize" && actor) createSwapPortalEffect(actor.group.position, 0x74efff);
      const state = skillState[message.skill];
      if (message.actorId === localNetworkId && state && "cooldown" in state) state.remaining = state.cooldown;
      const sfxKey = SKILL_SFX[message.skill];
      if (sfxKey) playSfx(sfxKey);
    }
    return;
  }

  if (message.type === "world") {
    applyNetworkWorld(message);
    showGameMessage("방장이 맵을 동기화했습니다.");
    return;
  }

  if (message.type === "error") {
    showGameMessage(message.message || "온라인 연결 오류");
    if (message.code === "ROOM_FULL" || message.code === "JOIN_TIMEOUT") {
      multiplayerFatalError = true;
      setOnlineStatus("error", message.message || "방 참가 실패", 1);
    }
  }
}

function handleGatewayPayload(payload) {
  (Array.isArray(payload?.messages) ? payload.messages : []).forEach(handleMultiplayerMessage);
}

function postMultiplayer(payload) {
  if (!multiplayerConnected || multiplayerSocket?.readyState !== WebSocket.OPEN) return false;
  if (multiplayerTransport === "http") {
    void postMultiplayerHttp(payload);
    return true;
  }
  try {
    multiplayerSocket.send(JSON.stringify(payload));
    return true;
  } catch {
    multiplayerSocket?.close(1011, "send failed");
    return false;
  }
}

async function postMultiplayerHttp(payload) {
  if (!multiplayerConnected) return false;
  if (networkPostInFlight) {
    const tailIndex = networkPostQueue.length - 1;
    if (payload?.type === "state" && networkPostQueue[tailIndex]?.type === "state") networkPostQueue[tailIndex] = payload;
    else networkPostQueue.push(payload);
    return true;
  }
  networkPostInFlight = true;
  try {
    const response = await fetch(`/api/rooms/${requestedRoomCode}/maze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    handleGatewayPayload(await response.json());
    return true;
  } catch {
    setOnlineStatus("connecting", `${activeRoomCode || requestedRoomCode} · 동기화 중`, remotePlayers.size + 1);
    return false;
  } finally {
    networkPostInFlight = false;
    const nextPayload = networkPostQueue.shift();
    if (nextPayload) window.setTimeout(() => { void postMultiplayerHttp(nextPayload); }, 0);
  }
}

async function pollMultiplayerHttp() {
  if (!multiplayerConnected || multiplayerClosing || multiplayerTransport !== "http") return;
  try {
    const response = await fetch(`/api/rooms/${requestedRoomCode}/maze?snapshot=1`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    handleGatewayPayload(await response.json());
    setOnlineStatus("connected", `${activeRoomCode}${roomHostId === localNetworkId ? " · 방장" : ""}`, remotePlayers.size + 1);
  } catch {
    setOnlineStatus("connecting", `${activeRoomCode || requestedRoomCode} · 재연결 중`, remotePlayers.size + 1);
  } finally {
    networkPollTimer = window.setTimeout(pollMultiplayerHttp, 250);
  }
}

async function connectHttpFallback() {
  if (multiplayerClosing) return;
  multiplayerTransport = "http";
  multiplayerSocket = { readyState: WebSocket.OPEN, close: () => { multiplayerConnected = false; } };
  setOnlineStatus("connecting", `${activeRoomCode || requestedRoomCode} · 호환 연결 중`);
  try {
    const response = await fetch(`/api/rooms/${requestedRoomCode}/maze?welcome=1`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    handleGatewayPayload(await response.json());
    await postMultiplayerHttp({ type: "join", room: requestedRoomCode, name: activeLoadout.name, character: selectedCharacterIndex });
    networkPollTimer = window.setTimeout(pollMultiplayerHttp, 250);
  } catch {
    multiplayerConnected = false;
    multiplayerSocket = null;
    scheduleMultiplayerReconnect();
  }
}

function scheduleMultiplayerReconnect() {
  if (multiplayerClosing || multiplayerFatalError) return;
  networkReconnectAttempts += 1;
  const delay = Math.min(8_000, 700 * 2 ** Math.min(networkReconnectAttempts - 1, 4));
  setOnlineStatus("connecting", `${activeRoomCode || requestedRoomCode} · 재연결 중`, 1);
  clearTimeout(networkReconnectTimer);
  networkReconnectTimer = window.setTimeout(connectMultiplayer, delay);
}

async function connectMultiplayer() {
  if (!multiplayerEnabled || !requestedRoomCode) return;
  clearTimeout(networkReconnectTimer);
  if (multiplayerSocket && [WebSocket.CONNECTING, WebSocket.OPEN].includes(multiplayerSocket.readyState)) return;
  setOnlineStatus("connecting", `${activeRoomCode || requestedRoomCode} · 연결 중`);
  multiplayerTransport = "websocket";
  try {
    let endpoint = "";
    let ticket = "";
    if (!launchParams.get("server")) {
      const accessResponse = await fetch(`/api/rooms/${requestedRoomCode}/maze/realtime`, { method: "POST", cache: "no-store" });
      if (!accessResponse.ok) throw new Error(`realtime access ${accessResponse.status}`);
      const access = await accessResponse.json();
      endpoint = String(access.endpoint || "");
      ticket = String(access.ticket || "");
      const bootstrapResponse = await fetch(`${endpoint.replace(/\/$/, "")}/bootstrap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: access.bootstrap }),
      });
      if (!bootstrapResponse.ok) throw new Error(`realtime bootstrap ${bootstrapResponse.status}`);
    }
    const socketUrl = new URL(resolveMultiplayerServerUrl(endpoint));
    if (ticket) socketUrl.searchParams.set("ticket", ticket);
    const socket = new WebSocket(socketUrl.href);
    multiplayerSocket = socket;
    socket.addEventListener("open", () => {
      if (socket !== multiplayerSocket) return;
      socket.send(JSON.stringify({
        type: "join",
        room: requestedRoomCode,
        name: activeLoadout.name,
        character: selectedCharacterIndex,
      }));
    });
    socket.addEventListener("message", (event) => {
      if (socket !== multiplayerSocket) return;
      try {
        const payload = JSON.parse(String(event.data));
        if (Array.isArray(payload?.messages)) handleGatewayPayload(payload);
        else handleMultiplayerMessage(payload);
      } catch {
        showGameMessage("실시간 서버 응답을 읽지 못했습니다.");
      }
    });
    socket.addEventListener("close", (event) => {
      if (socket !== multiplayerSocket) return;
      multiplayerConnected = false;
      multiplayerSocket = null;
      if (event.code === 4003) multiplayerFatalError = true;
      if (!multiplayerFatalError) void connectHttpFallback();
    });
    socket.addEventListener("error", () => {
      if (socket === multiplayerSocket) socket.close();
    });
  } catch {
    multiplayerConnected = false;
    multiplayerSocket = null;
    void connectHttpFallback();
  }
}

function sendMultiplayerControl(kind, value) {
  if (!multiplayerConnected || multiplayerSocket?.readyState !== WebSocket.OPEN) return false;
  if (roomHostId !== localNetworkId) {
    showGameMessage("방장만 맵을 변경할 수 있습니다.");
    return true;
  }
  const payload = { type: "control", kind };
  if (kind === "map") payload.seed = value >>> 0;
  if (kind === "theme") payload.theme = value;
  postMultiplayer(payload);
  return true;
}

function sendAuthoritativeAction(action, skill = null) {
  if (!multiplayerConnected || multiplayerSocket?.readyState !== WebSocket.OPEN) return false;
  const payload = { type: "action", action };
  if (skill) payload.skill = skill;
  postMultiplayer(payload);
  return true;
}

function updateMultiplayer(delta) {
  if (!multiplayerConnected || multiplayerSocket?.readyState !== WebSocket.OPEN) return;
  networkSendAccumulator += delta;
  if (networkSendAccumulator < 1 / 12) return;
  networkSendAccumulator = 0;
  const position = playerCharacter.group.position;
  const signature = [
    position.x.toFixed(2),
    position.y.toFixed(2),
    position.z.toFixed(2),
    playerCharacter.group.rotation.y.toFixed(2),
    Number(playerCharacter.moving),
    Number(playerCharacter.sprinting),
    Number(playerCharacter.wallRunRemaining > 0),
    Number(playerCharacter.fluidizeRemaining > 0),
  ].join(":");
  const now = performance.now();
  if (signature === lastNetworkStateSignature && now - lastNetworkStateSentAt < 950) return;
  lastNetworkStateSignature = signature;
  lastNetworkStateSentAt = now;
  networkSequence += 1;
  const payload = {
    type: "state",
    seq: networkSequence,
    x: position.x,
    y: position.y,
    z: position.z,
    rotation: playerCharacter.group.rotation.y,
    moving: playerCharacter.moving,
    sprinting: playerCharacter.sprinting,
    wallRunning: playerCharacter.wallRunRemaining > 0,
    fluidized: playerCharacter.fluidizeRemaining > 0,
  };
  networkSentStates.set(networkSequence, {
    x: payload.x,
    y: payload.y,
    z: payload.z,
  });
  // Defensive cap for long offline/retry periods.
  if (networkSentStates.size > 32) {
    networkSentStates.delete(networkSentStates.keys().next().value);
  }
  postMultiplayer(payload);
}

function resetPlayer() {
  playerCharacter.group.position.copy(PLAYER_SPAWN);
  playerCharacter.group.rotation.set(0, 0, 0);
  playerCharacter.group.position.y = PLAYER_SPAWN.y;
  playerCharacter.wallRunRemaining = 0;
  playerCharacter.fluidizeRemaining = 0;
  playerCharacter.stunRemaining = 0;
  playerCharacter.immunityRemaining = 0;
  playerVelocity.set(0, 0, 0);
  botCharacters.forEach((bot, index) => {
    if (bot.isRemote) {
      bot.stunRemaining = 0;
      bot.immunityRemaining = 0;
      bot.slipperyVelocity.set(0, 0, 0);
      return;
    }
    bot.group.position.copy(BOT_SPAWNS[index]);
    bot.group.rotation.set(0, Math.PI * index * 0.5, 0);
    bot.stunRemaining = 0;
    bot.immunityRemaining = 0;
    bot.decisionTimer = 0;
    bot.slipperyVelocity.set(0, 0, 0);
  });
}

function isWallTopAt(x, z) {
  const gridX = Math.round(x + HALF);
  const gridZ = Math.round(z + HALF);
  return activeWallCells.has(`${gridX},${gridZ}`)
    && Math.abs(x - (gridX - HALF)) <= TILE_SIZE * 0.55
    && Math.abs(z - (gridZ - HALF)) <= TILE_SIZE * 0.55;
}

function canCharacterOccupy(
  character,
  x,
  z,
  { ignoreWalls = false, wallTopOnly = false, ignoreCharacter = null } = {},
) {
  const mapLimit = HALF + TILE_SIZE * 0.5 - PLAYER_WALL_RADIUS;
  if (x < -mapLimit || x > mapLimit || z < -mapLimit || z > mapLimit) return false;
  if (wallTopOnly) return isWallTopAt(x, z);

  if (!ignoreWalls) {
    const centerGridX = Math.round(x + HALF);
    const centerGridZ = Math.round(z + HALF);
    const wallHalf = TILE_SIZE * 0.5;
    for (let gridZ = centerGridZ - 1; gridZ <= centerGridZ + 1; gridZ += 1) {
      for (let gridX = centerGridX - 1; gridX <= centerGridX + 1; gridX += 1) {
        if (!activeWallCells.has(`${gridX},${gridZ}`)) continue;
        const wallX = gridX - HALF;
        const wallZ = gridZ - HALF;
        const nearestX = THREE.MathUtils.clamp(x, wallX - wallHalf, wallX + wallHalf);
        const nearestZ = THREE.MathUtils.clamp(z, wallZ - wallHalf, wallZ + wallHalf);
        const dx = x - nearestX;
        const dz = z - nearestZ;
        if (dx * dx + dz * dz < PLAYER_WALL_RADIUS * PLAYER_WALL_RADIUS) return false;
      }
    }
  }

  if (x * x + z * z < 1.48 * 1.48) return false;
  const characters = [playerCharacter, ...botCharacters];
  for (const other of characters) {
    if (other === character || other === ignoreCharacter) continue;
    if (character.fluidizeRemaining > 0 || other.fluidizeRemaining > 0) continue;
    if (other.wallRunRemaining > 0 !== (character.wallRunRemaining > 0)) continue;
    const dx = x - other.group.position.x;
    const dz = z - other.group.position.z;
    if (dx * dx + dz * dz < (PLAYER_COLLISION_RADIUS * 2) ** 2) return false;
  }
  return true;
}

function canPlayerOccupy(x, z) {
  if (playerCharacter.wallRunRemaining > 0) {
    return canCharacterOccupy(playerCharacter, x, z, { wallTopOnly: true });
  }
  return canCharacterOccupy(playerCharacter, x, z);
}

function updatePlayer(time, delta) {
  const wasSprinting = playerCharacter.sprinting;
  let inputX = joystickInput.x;
  let inputY = joystickInput.y;
  if (movementKeys.has("KeyA") || movementKeys.has("ArrowLeft")) inputX -= 1;
  if (movementKeys.has("KeyD") || movementKeys.has("ArrowRight")) inputX += 1;
  if (movementKeys.has("KeyW") || movementKeys.has("ArrowUp")) inputY += 1;
  if (movementKeys.has("KeyS") || movementKeys.has("ArrowDown")) inputY -= 1;

  const inputLength = Math.hypot(inputX, inputY);
  playerCharacter.sprinting = false;
  playerCharacter.moving = gameActive
    && playerCharacter.stunRemaining <= 0
    && inputLength > 0.08;
  if (playerCharacter.moving) {
    inputX /= Math.max(1, inputLength);
    inputY /= Math.max(1, inputLength);
    camera.getWorldDirection(cameraForward);
    cameraForward.y = 0;
    cameraForward.normalize();
    cameraRight.set(-cameraForward.z, 0, cameraForward.x);
    desiredWorldDirection
      .copy(cameraForward)
      .multiplyScalar(inputY)
      .addScaledVector(cameraRight, inputX)
      .normalize();
    desiredLocalDirection
      .copy(desiredWorldDirection)
      .applyAxisAngle(yAxis, -playerRoot.rotation.y);
    const sprinting = sprintHeld
      && activeLoadout.movement === "sprint"
      && skillState.sprint.stamina > 0
      && playerCharacter.wallRunRemaining <= 0;
    playerCharacter.sprinting = sprinting;
    if (sprinting && !wasSprinting) playSfx("sprint", 0.72);
    if (sprinting) {
      skillState.sprint.stamina = Math.max(0, skillState.sprint.stamina - delta);
      skillState.sprint.rechargeDelay = 1;
    }
    const speedMultiplier = sprinting ? 1.7 : playerCharacter.wallRunRemaining > 0 ? 1.18 : 1;
    playerVelocity.copy(desiredLocalDirection).multiplyScalar(PLAYER_SPEED * speedMultiplier);

    const nextX = playerCharacter.group.position.x + playerVelocity.x * delta;
    const nextZ = playerCharacter.group.position.z + playerVelocity.z * delta;
    if (canPlayerOccupy(nextX, playerCharacter.group.position.z)) {
      playerCharacter.group.position.x = nextX;
    }
    if (canPlayerOccupy(playerCharacter.group.position.x, nextZ)) {
      playerCharacter.group.position.z = nextZ;
    }

    const targetRotation = Math.atan2(desiredLocalDirection.x, desiredLocalDirection.z);
    const rotationDifference = Math.atan2(
      Math.sin(targetRotation - playerCharacter.group.rotation.y),
      Math.cos(targetRotation - playerCharacter.group.rotation.y),
    );
    playerCharacter.group.rotation.y += rotationDifference * Math.min(1, delta * 12);
  } else {
    playerVelocity.multiplyScalar(Math.max(0, 1 - delta * 12));
  }

  const moveBlend = playerCharacter.moving ? 1 : 0;
  const stride = Math.sin(time * 10.5) * 0.58 * moveBlend;
  playerCharacter.armPivots[0].rotation.x = THREE.MathUtils.lerp(
    playerCharacter.armPivots[0].rotation.x,
    stride,
    Math.min(1, delta * 14),
  );
  playerCharacter.armPivots[1].rotation.x = THREE.MathUtils.lerp(
    playerCharacter.armPivots[1].rotation.x,
    -stride,
    Math.min(1, delta * 14),
  );
  playerCharacter.legPivots[0].rotation.x = THREE.MathUtils.lerp(
    playerCharacter.legPivots[0].rotation.x,
    -stride * 0.72,
    Math.min(1, delta * 14),
  );
  playerCharacter.legPivots[1].rotation.x = THREE.MathUtils.lerp(
    playerCharacter.legPivots[1].rotation.x,
    stride * 0.72,
    Math.min(1, delta * 14),
  );
  playerCharacter.model.position.y = playerCharacter.moving
    ? 0.035 + Math.abs(Math.sin(time * 10.5)) * 0.055
    : 0.035 + Math.sin(time * 2.2) * 0.012;
  const squash = playerCharacter.moving
    ? 1 - Math.abs(Math.sin(time * 10.5)) * 0.025
    : 1;
  playerCharacter.body.scale.y = squash;
  playerCharacter.shadow.scale.setScalar(playerCharacter.moving ? 0.92 : 1);
  const targetHeight = playerCharacter.wallRunRemaining > 0 ? 1.64 : PLAYER_SPAWN.y;
  playerCharacter.group.position.y = THREE.MathUtils.lerp(
    playerCharacter.group.position.y,
    targetHeight,
    Math.min(1, delta * 9),
  );
  playerCharacter.shadow.visible = playerCharacter.wallRunRemaining <= 0;
  updateImmunityEffect(playerCharacter, time);
  updateFluidizeEffect(playerCharacter, time);
}

function updateCameraFollow(delta) {
  cameraFollowWorld
    .set(
      playerCharacter.group.position.x,
      0.72,
      playerCharacter.group.position.z,
    )
    .applyAxisAngle(yAxis, playerRoot.rotation.y);
  cameraFollowStep
    .copy(cameraFollowWorld)
    .sub(controls.target)
    .multiplyScalar(1 - Math.exp(-delta * 6.5));
  controls.target.add(cameraFollowStep);
  camera.position.add(cameraFollowStep);
}

function showGameMessage(text, duration = 2.2) {
  gameMessage.textContent = text;
  gameMessage.classList.add("visible");
  messageTimer = duration;
}

function isActionEquipped(action) {
  return action === "interact"
    || action === "push"
    || action === activeLoadout.movement
    || action === activeLoadout.disruption;
}

function configureActiveLoadoutUI() {
  activeCharacterNameLabel.textContent = activeLoadout.name;
  activeCharacterSkillsLabel.textContent = `${SKILL_LABELS[activeLoadout.movement]} · ${SKILL_LABELS[activeLoadout.disruption]}`;
  actionButtons.forEach((button) => {
    const action = button.dataset.action;
    button.hidden = !isActionEquipped(action);
    const key = button.querySelector("kbd");
    if (!key) return;
    if (action === activeLoadout.movement) {
      key.textContent = action === "sprint" ? "⇧" : "Space";
    }
    if (action === activeLoadout.disruption) key.textContent = "1";
  });
}

function formatGameTime(seconds) {
  const safeSeconds = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function shuffleRecipes() {
  recipeDeck = [...FOOD_RECIPES];
  for (let index = recipeDeck.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [recipeDeck[index], recipeDeck[swapIndex]] = [recipeDeck[swapIndex], recipeDeck[index]];
  }
}

function updateRecipeUI() {
  if (!currentRecipe) return;
  recipeNameLabel.textContent = currentRecipe.name;
  recipePointsLabel.textContent = `${currentRecipe.ingredients.length}점`;
  recipeIngredients.replaceChildren();
  currentRecipe.ingredients.forEach((ingredientKey) => {
    const ingredient = INGREDIENTS[ingredientKey];
    const chip = document.createElement("span");
    chip.className = `ingredient-chip${recipeProgress.has(ingredientKey) ? " done" : ""}`;
    chip.textContent = `${ingredient.icon} ${ingredient.name}`;
    recipeIngredients.append(chip);
  });
  heldItemLabel.textContent = heldItem
    ? `운반 중: ${INGREDIENTS[heldItem.ingredientKey].icon} ${INGREDIENTS[heldItem.ingredientKey].name}`
    : "운반 중: 없음";
  gameScoreLabel.textContent = `${gameScore}점`;
}

let foodSurfaceTexture = null;
const foodColorTextureCache = new Map();

function getFoodSurfaceTexture() {
  if (foodSurfaceTexture) return foodSurfaceTexture;
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 96;
  textureCanvas.height = 96;
  const context = textureCanvas.getContext("2d");
  const image = context.createImageData(96, 96);
  for (let y = 0; y < 96; y += 1) {
    for (let x = 0; x < 96; x += 1) {
      const index = (y * 96 + x) * 4;
      const broad = Math.sin(x * 0.23) * 8 + Math.cos(y * 0.19) * 7;
      const grain = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
      const noise = grain - Math.floor(grain);
      const value = THREE.MathUtils.clamp(128 + broad + (noise - 0.5) * 34, 74, 184);
      image.data[index] = value;
      image.data[index + 1] = value;
      image.data[index + 2] = value;
      image.data[index + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  foodSurfaceTexture = new THREE.CanvasTexture(textureCanvas);
  foodSurfaceTexture.wrapS = THREE.RepeatWrapping;
  foodSurfaceTexture.wrapT = THREE.RepeatWrapping;
  foodSurfaceTexture.repeat.set(2.5, 2.5);
  return foodSurfaceTexture;
}

function getFoodColorTexture(colorValue) {
  const color = new THREE.Color(colorValue);
  const key = color.getHexString();
  if (foodColorTextureCache.has(key)) return foodColorTextureCache.get(key);
  const sourceColor = color.clone().convertLinearToSRGB();
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 64;
  textureCanvas.height = 64;
  const context = textureCanvas.getContext("2d");
  const image = context.createImageData(64, 64);
  for (let y = 0; y < 64; y += 1) {
    for (let x = 0; x < 64; x += 1) {
      const index = (y * 64 + x) * 4;
      const cellular = Math.sin(x * 0.41 + Math.sin(y * 0.17) * 2.2)
        + Math.cos(y * 0.37 + Math.sin(x * 0.13) * 1.8);
      const grain = Math.sin(x * 17.13 + y * 31.71) * 43758.5453;
      const noise = grain - Math.floor(grain);
      const variation = 0.86 + cellular * 0.035 + (noise - 0.5) * 0.13;
      image.data[index] = THREE.MathUtils.clamp(sourceColor.r * 255 * variation, 0, 255);
      image.data[index + 1] = THREE.MathUtils.clamp(sourceColor.g * 255 * variation, 0, 255);
      image.data[index + 2] = THREE.MathUtils.clamp(sourceColor.b * 255 * variation, 0, 255);
      image.data[index + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2.2, 2.2);
  foodColorTextureCache.set(key, texture);
  return texture;
}

function createFoodMaterial(color, {
  roughness = 0.5,
  metalness = 0,
  clearcoat = 0.08,
  transparent = false,
  opacity = 1,
  bumpScale = 0.012,
} = {}) {
  return new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: getFoodColorTexture(color),
    roughness,
    metalness,
    clearcoat,
    clearcoatRoughness: 0.42,
    transparent,
    opacity,
    bumpMap: getFoodSurfaceTexture(),
    bumpScale,
  });
}

function addIngredientPart(parent, geometry, material, position, scale = [1, 1, 1], rotation = [0, 0, 0]) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function createDetailedIngredientModel(ingredientKey, ingredient) {
  const model = new THREE.Group();
  const main = createFoodMaterial(ingredient.color, { roughness: 0.46, clearcoat: 0.16 });
  const pale = createFoodMaterial(new THREE.Color(ingredient.color).lerp(new THREE.Color(0xffffff), 0.42), {
    roughness: 0.58,
  });
  const dark = createFoodMaterial(new THREE.Color(ingredient.color).multiplyScalar(0.48), {
    roughness: 0.64,
  });
  const green = createFoodMaterial(0x3e8f42, { roughness: 0.72 });
  const cream = createFoodMaterial(0xfff4d7, { roughness: 0.62 });

  if (ingredientKey === "egg") {
    [[0, 0], [0.12, 0.05], [-0.12, -0.04]].forEach(([x, z], index) => {
      addIngredientPart(
        model,
        new THREE.SphereGeometry(0.25, 24, 14),
        cream,
        [x, 0.02 + index * 0.004, z],
        [1, 0.18, 0.86],
      );
    });
    addIngredientPart(
      model,
      new THREE.SphereGeometry(0.14, 24, 16),
      createFoodMaterial(0xffb915, { roughness: 0.3, clearcoat: 0.42 }),
      [0.03, 0.075, 0],
      [1, 0.62, 1],
    );
  } else if (ingredientKey === "strawberry") {
    addIngredientPart(model, new THREE.SphereGeometry(0.25, 26, 18), main, [0, 0.06, 0], [0.88, 1.18, 0.88]);
    addIngredientPart(model, new THREE.ConeGeometry(0.17, 0.15, 7), green, [0, 0.35, 0], [1, 0.45, 1], [Math.PI, 0, 0]);
    const seedMaterial = createFoodMaterial(0xffd784, { roughness: 0.54 });
    for (let index = 0; index < 12; index += 1) {
      const angle = index * 2.399;
      const y = -0.08 + (index % 4) * 0.1;
      const radius = 0.205 * Math.sqrt(Math.max(0.15, 1 - ((y - 0.06) / 0.32) ** 2));
      addIngredientPart(
        model,
        new THREE.SphereGeometry(0.018, 8, 6),
        seedMaterial,
        [Math.cos(angle) * radius, y + 0.06, Math.sin(angle) * radius],
        [0.65, 1.15, 0.45],
      );
    }
  } else if (ingredientKey === "grape") {
    const grapeMaterial = createFoodMaterial(0x7140a5, { roughness: 0.32, clearcoat: 0.38 });
    [[0, 0.2, 0], [-0.12, 0.1, 0], [0.12, 0.1, 0], [-0.17, -0.02, 0], [0, -0.02, 0.06],
      [0.17, -0.02, 0], [-0.09, -0.15, 0.02], [0.09, -0.15, 0.02], [0, -0.27, 0]].forEach((position) => {
      addIngredientPart(model, new THREE.SphereGeometry(0.105, 18, 14), grapeMaterial, position);
    });
    addIngredientPart(model, new THREE.CylinderGeometry(0.025, 0.035, 0.25, 9), green, [0, 0.39, 0], [1, 1, 1], [0, 0, -0.25]);
  } else if (ingredientKey === "banana") {
    addIngredientPart(
      model,
      new THREE.TorusGeometry(0.27, 0.075, 16, 36, Math.PI * 1.3),
      main,
      [0, 0, 0],
      [1, 1, 0.84],
      [Math.PI / 2, 0, -0.65],
    );
    addIngredientPart(model, new THREE.SphereGeometry(0.07, 12, 8), dark, [-0.27, 0.12, 0], [0.72, 1, 0.72]);
    addIngredientPart(model, new THREE.SphereGeometry(0.07, 12, 8), dark, [0.25, 0.14, 0], [0.72, 1, 0.72]);
  } else if (ingredientKey === "apple" || ingredientKey === "tomato" || ingredientKey === "potato") {
    addIngredientPart(
      model,
      new THREE.SphereGeometry(0.25, 28, 20),
      main,
      [0, 0.04, 0],
      ingredientKey === "potato" ? [1.08, 0.82, 0.92] : [1, 0.94, 1],
    );
    if (ingredientKey !== "potato") {
      addIngredientPart(model, new THREE.CylinderGeometry(0.025, 0.035, 0.17, 8), dark, [0, 0.31, 0], [1, 1, 1], [0.08, 0, 0.15]);
      addIngredientPart(model, new THREE.SphereGeometry(0.1, 12, 8), green, [0.08, 0.29, 0], [1.25, 0.18, 0.5], [0, 0, -0.35]);
    } else {
      const eyeMaterial = createFoodMaterial(0x765435, { roughness: 0.9 });
      [[-0.12, 0.13, 0.2], [0.14, -0.05, 0.2], [0.03, 0.16, -0.19]].forEach((position) => {
        addIngredientPart(model, new THREE.SphereGeometry(0.025, 8, 6), eyeMaterial, position, [1, 0.4, 1]);
      });
    }
  } else if (ingredientKey === "mushroom") {
    addIngredientPart(model, new THREE.CylinderGeometry(0.09, 0.13, 0.35, 16), cream, [0, -0.06, 0]);
    addIngredientPart(
      model,
      new THREE.SphereGeometry(0.28, 26, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      main,
      [0, 0.14, 0],
      [1, 0.72, 1],
    );
  } else if (["oil", "milk", "broth", "chiliSauce"].includes(ingredientKey)) {
    const bottleShell = createFoodMaterial(
      ingredientKey === "milk" ? 0xf3f6f0 : 0xffffff,
      { roughness: 0.18, clearcoat: 0.6, transparent: ingredientKey !== "milk", opacity: ingredientKey === "milk" ? 1 : 0.3 },
    );
    addIngredientPart(model, new THREE.CylinderGeometry(0.16, 0.19, 0.48, 24), bottleShell, [0, 0.02, 0]);
    addIngredientPart(model, new THREE.CylinderGeometry(0.13, 0.16, 0.36, 22), main, [0, -0.03, 0], [0.9, 1, 0.9]);
    addIngredientPart(model, new THREE.CylinderGeometry(0.09, 0.11, 0.14, 18), bottleShell, [0, 0.32, 0]);
    addIngredientPart(model, new THREE.CylinderGeometry(0.105, 0.105, 0.07, 18), dark, [0, 0.43, 0]);
    addIngredientPart(model, new THREE.BoxGeometry(0.29, 0.13, 0.015), pale, [0, 0.02, 0.19]);
  } else if (["bread", "bun", "dough", "tortilla"].includes(ingredientKey)) {
    if (ingredientKey === "bread") {
      addIngredientPart(model, new RoundedBoxGeometry(0.46, 0.38, 0.28, 4, 0.11), dark, [0, 0.02, 0]);
      addIngredientPart(model, new RoundedBoxGeometry(0.39, 0.32, 0.245, 4, 0.09), pale, [0, 0.035, 0.025]);
    } else if (ingredientKey === "bun") {
      addIngredientPart(model, new THREE.SphereGeometry(0.28, 26, 18), main, [0, 0.02, 0], [1, 0.72, 1]);
      for (let index = 0; index < 6; index += 1) {
        addIngredientPart(model, new THREE.SphereGeometry(0.012, 7, 5), cream, [(index - 2.5) * 0.055, 0.22 - Math.abs(index - 2.5) * 0.014, 0.08]);
      }
    } else {
      addIngredientPart(model, new THREE.CylinderGeometry(0.3, 0.3, ingredientKey === "tortilla" ? 0.045 : 0.12, 30), main, [0, 0, 0]);
      addIngredientPart(model, new THREE.TorusGeometry(0.22, 0.012, 8, 28), dark, [0, 0.07, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
    }
  } else if (["ham", "meat", "salmon", "seaweed"].includes(ingredientKey)) {
    const thickness = ingredientKey === "seaweed" ? 0.035 : 0.2;
    addIngredientPart(model, new RoundedBoxGeometry(0.48, thickness, 0.34, 3, 0.055), main, [0, 0, 0]);
    if (ingredientKey !== "seaweed") {
      const stripeMaterial = ingredientKey === "salmon" ? cream : pale;
      for (let index = -1; index <= 1; index += 1) {
        addIngredientPart(
          model,
          new THREE.BoxGeometry(0.045, 0.012, 0.31),
          stripeMaterial,
          [index * 0.13, thickness * 0.54, 0],
          [1, 1, 1],
          [0, 0.28, 0],
        );
      }
    }
  } else if (ingredientKey === "cheese") {
    addIngredientPart(model, new THREE.CylinderGeometry(0.3, 0.3, 0.28, 3), main, [0, 0, 0], [1, 1, 0.86], [0, Math.PI / 6, 0]);
    const holeMaterial = createFoodMaterial(0xc99119, { roughness: 0.9 });
    [[0.02, 0.16, 0.16], [-0.13, 0.05, 0.17], [0.16, -0.08, 0.13]].forEach((position) => {
      addIngredientPart(model, new THREE.SphereGeometry(0.045, 12, 8), holeMaterial, position, [1, 0.35, 0.45]);
    });
  } else if (ingredientKey === "chocolate") {
    for (let x = -1; x <= 1; x += 1) {
      for (let z = -1; z <= 1; z += 2) {
        addIngredientPart(model, new RoundedBoxGeometry(0.14, 0.09, 0.16, 2, 0.025), main, [x * 0.145, 0, z * 0.085]);
      }
    }
  } else if (ingredientKey === "carrot") {
    addIngredientPart(model, new THREE.ConeGeometry(0.16, 0.52, 22), main, [0, -0.02, 0], [1, 1, 1], [0, 0, Math.PI]);
    for (let index = -1; index <= 1; index += 1) {
      addIngredientPart(model, new THREE.CapsuleGeometry(0.025, 0.22, 4, 8), green, [index * 0.055, 0.34, 0], [1, 1, 1], [0, 0, index * 0.36]);
    }
  } else if (["lettuce", "greens"].includes(ingredientKey)) {
    for (let index = 0; index < 7; index += 1) {
      const angle = index / 7 * Math.PI * 2;
      addIngredientPart(
        model,
        new THREE.SphereGeometry(0.2, 18, 12),
        index % 2 ? main : pale,
        [Math.cos(angle) * 0.12, Math.sin(index) * 0.035, Math.sin(angle) * 0.12],
        [0.8, 0.22, 1.15],
        [0, -angle, Math.sin(angle) * 0.24],
      );
    }
  } else if (["sausage", "riceCake", "scallion"].includes(ingredientKey)) {
    const count = ingredientKey === "riceCake" ? 3 : ingredientKey === "scallion" ? 3 : 1;
    for (let index = 0; index < count; index += 1) {
      addIngredientPart(
        model,
        new THREE.CapsuleGeometry(ingredientKey === "scallion" ? 0.045 : 0.095, ingredientKey === "scallion" ? 0.42 : 0.34, 7, 14),
        ingredientKey === "scallion" && index === 0 ? cream : main,
        [0, (index - (count - 1) / 2) * 0.12, (index - (count - 1) / 2) * 0.08],
        [1, 1, 1],
        [0, 0, Math.PI / 2 + index * 0.08],
      );
    }
  } else if (["rice", "flour", "curry", "noodles"].includes(ingredientKey)) {
    const bowlMaterial = createFoodMaterial(0xe9edf1, { roughness: 0.34, clearcoat: 0.32 });
    addIngredientPart(model, new THREE.CylinderGeometry(0.22, 0.29, 0.2, 28), bowlMaterial, [0, -0.08, 0]);
    if (ingredientKey === "noodles") {
      for (let index = 0; index < 4; index += 1) {
        addIngredientPart(
          model,
          new THREE.TorusGeometry(0.17 - index * 0.018, 0.018, 8, 28),
          main,
          [0, 0.04 + index * 0.025, 0],
          [1, 1, 1],
          [Math.PI / 2, 0, index * 0.45],
        );
      }
    } else {
      addIngredientPart(model, new THREE.SphereGeometry(0.22, 24, 16), main, [0, 0.055, 0], [1, 0.54, 1]);
      if (ingredientKey === "rice" || ingredientKey === "flour") {
        for (let index = 0; index < 14; index += 1) {
          const angle = index * 2.399;
          const radius = 0.05 + (index % 4) * 0.035;
          addIngredientPart(
            model,
            new THREE.SphereGeometry(0.018, 7, 5),
            cream,
            [Math.cos(angle) * radius, 0.15 + (index % 3) * 0.015, Math.sin(angle) * radius],
            [1.7, 0.55, 0.75],
            [0, angle, 0],
          );
        }
      }
    }
  } else if (ingredientKey === "patty") {
    addIngredientPart(
      model,
      new THREE.CylinderGeometry(0.27, 0.28, 0.16, 28),
      main,
      [0, 0, 0],
      [1, 1, 0.92],
    );
    const grillMaterial = createFoodMaterial(0x3d2118, { roughness: 0.9 });
    for (let index = -1; index <= 1; index += 1) {
      addIngredientPart(
        model,
        new THREE.BoxGeometry(0.035, 0.012, 0.42),
        grillMaterial,
        [index * 0.11, 0.088, 0],
        [1, 1, 1],
        [0, 0.3, 0],
      );
    }
  } else if (ingredientKey === "fishCake") {
    const skewer = createFoodMaterial(0x9b673b, { roughness: 0.78 });
    addIngredientPart(model, new THREE.CylinderGeometry(0.018, 0.018, 0.72, 8), skewer, [0, 0, 0], [1, 1, 1], [0, 0, Math.PI / 2]);
    for (let index = -1; index <= 1; index += 1) {
      addIngredientPart(
        model,
        new RoundedBoxGeometry(0.15, 0.1, 0.25, 2, 0.035),
        index % 2 ? pale : main,
        [index * 0.19, 0.02, 0],
        [1, 1, 1],
        [0.15 * index, 0.1 * index, 0],
      );
    }
  } else if (ingredientKey === "wasabi") {
    for (let index = 0; index < 4; index += 1) {
      const radius = 0.05 + index * 0.045;
      addIngredientPart(
        model,
        new THREE.SphereGeometry(0.14, 18, 12),
        index % 2 ? main : pale,
        [Math.cos(index * 2.1) * radius, -0.08 + index * 0.075, Math.sin(index * 2.1) * radius],
        [1, 0.7, 1],
      );
    }
  } else {
    const geometry = ingredient.shape === "sphere"
      ? new THREE.SphereGeometry(0.25, 24, 18)
      : ingredient.shape === "cylinder"
        ? new THREE.CylinderGeometry(0.23, 0.23, 0.34, 24)
        : ingredient.shape === "capsule"
          ? new THREE.CapsuleGeometry(0.13, 0.34, 7, 16)
          : ingredient.shape === "cone"
            ? new THREE.ConeGeometry(0.22, 0.48, 22)
            : new RoundedBoxGeometry(0.43, 0.32, 0.38, 4, 0.08);
    const fallback = addIngredientPart(model, geometry, main, [0, 0, 0]);
    if (ingredient.shape === "capsule") fallback.rotation.z = Math.PI / 2;
  }
  model.scale.setScalar(1.28);
  return model;
}

function createIngredientLabel(ingredient) {
  const labelCanvas = document.createElement("canvas");
  labelCanvas.width = 256;
  labelCanvas.height = 96;
  const context = labelCanvas.getContext("2d");
  context.fillStyle = "rgba(6, 14, 27, 0.84)";
  context.beginPath();
  context.roundRect(4, 4, 248, 88, 24);
  context.fill();
  context.font = "700 36px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "#ffffff";
  context.fillText(`${ingredient.icon} ${ingredient.name}`, 128, 49);
  const texture = new THREE.CanvasTexture(labelCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: false,
  }));
  sprite.position.y = 1.18;
  sprite.scale.set(1.72, 0.64, 1);
  sprite.renderOrder = 20;
  sprite.userData.ingredientLabel = true;
  return sprite;
}

function spawnIngredient(ingredientKey, depotIndex = Math.floor(Math.random() * SUPPLY_DEPOTS.length)) {
  if (!INGREDIENTS[ingredientKey]) return null;
  if (spawnedItems.some((item) => item.depotIndex === depotIndex && !item.held)) return null;
  const ingredient = INGREDIENTS[ingredientKey];
  const depot = SUPPLY_DEPOTS[depotIndex % SUPPLY_DEPOTS.length];
  const group = new THREE.Group();
  const [baseX, baseZ] = depot.spawn;
  group.position.set(baseX, 0.42, baseZ);
  group.add(createDetailedIngredientModel(ingredientKey, ingredient));

  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(0.39, 0.024, 10, 36),
    new THREE.MeshBasicMaterial({
      color: ingredient.color,
      transparent: true,
      opacity: 0.62,
      blending: THREE.AdditiveBlending,
    }),
  );
  halo.rotation.x = Math.PI / 2;
  halo.position.y = -0.34;
  group.add(halo);
  const beacon = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0.32, 0),
      new THREE.Vector3(0, 0.98, 0),
    ]),
    new THREE.LineBasicMaterial({
      color: ingredient.color,
      transparent: true,
      opacity: 0.34,
      blending: THREE.AdditiveBlending,
    }),
  );
  group.add(beacon);
  group.add(createIngredientLabel(ingredient));
  group.userData.ingredientKey = ingredientKey;
  itemRoot.add(group);

  const item = {
    group,
    ingredientKey,
    depotIndex,
    held: false,
    spawnY: group.position.y,
    phase: Math.random() * Math.PI * 2,
    age: 0,
    networkId: null,
    heldBy: null,
  };
  spawnedItems.push(item);
  return item;
}

function removeIngredientItem(item) {
  const index = spawnedItems.indexOf(item);
  if (index >= 0) spawnedItems.splice(index, 1);
  item.group.removeFromParent();
  if (heldItem === item) heldItem = null;
}

function ensureRecipeIngredientsAvailable() {
  if (!currentRecipe) return;
  const missingIngredients = currentRecipe.ingredients.filter(
    (ingredientKey) => !recipeProgress.has(ingredientKey),
  );
  if (missingIngredients.length === 0) return;
  const requiredItemVisible = spawnedItems.some(
    (item) => missingIngredients.includes(item.ingredientKey),
  );
  if (requiredItemVisible) return;

  let depotIndex = SUPPLY_DEPOTS.findIndex(
    (_, index) => depotRespawnTimers[index] <= 0
      && !spawnedItems.some((item) => item.depotIndex === index && !item.held),
  );
  if (depotIndex < 0) {
    const replaceable = spawnedItems.find(
      (item) => !item.held && !missingIngredients.includes(item.ingredientKey),
    );
    if (replaceable) {
      depotIndex = replaceable.depotIndex;
      removeIngredientItem(replaceable);
    }
  }
  if (depotIndex >= 0) {
    const ingredientKey = missingIngredients[Math.floor(Math.random() * missingIngredients.length)];
    spawnIngredient(ingredientKey, depotIndex);
    depotRespawnTimers[depotIndex] = 0;
  }
}

function advanceRecipe() {
  if (recipeDeck.length === 0) shuffleRecipes();
  currentRecipe = recipeDeck.pop();
  recipeProgress = new Set();
  ensureRecipeIngredientsAvailable();
  updateRecipeUI();
  showGameMessage(`새 주문: ${currentRecipe.name} · ${currentRecipe.ingredients.length}점`);
}

function dropHeldItem() {
  showGameMessage("재료는 바닥에 내려놓을 수 없습니다. 중앙 제작대에 제출하세요.");
}

function interactWithItem() {
  if (!gameActive || playerCharacter.stunRemaining > 0) return;
  if (multiplayerEnabled) {
    sendAuthoritativeAction("interact");
    return;
  }
  if (heldItem) {
    const distanceToTable = Math.hypot(
      playerCharacter.group.position.x,
      playerCharacter.group.position.z,
    );
    if (distanceToTable < 2.05) {
      const key = heldItem.ingredientKey;
      if (!currentRecipe.ingredients.includes(key)) {
        showGameMessage(`${INGREDIENTS[key].name}은(는) 현재 주문 재료가 아닙니다.`);
        return;
      }
      if (recipeProgress.has(key)) {
        showGameMessage(`${INGREDIENTS[key].name}은(는) 이미 제출했습니다.`);
        return;
      }
      recipeProgress.add(key);
      playSfx("item-drop", 0.86);
      removeIngredientItem(heldItem);
      ensureRecipeIngredientsAvailable();
      updateRecipeUI();
      if (recipeProgress.size === currentRecipe.ingredients.length) {
        const points = currentRecipe.ingredients.length;
        gameScore += points;
        gameScoreLabel.textContent = `${gameScore}점`;
        showGameMessage(`${currentRecipe.name} 완성! +${points}점`, 2.7);
        const completedRoundId = gameRoundId;
        window.setTimeout(() => {
          if (gameActive && gameRoundId === completedRoundId) advanceRecipe();
        }, 700);
      } else {
        showGameMessage("중앙 제작대에 재료를 제출했습니다.");
      }
      return;
    }
    dropHeldItem();
    return;
  }

  let nearest = null;
  let nearestDistance = 1.22;
  spawnedItems.forEach((item) => {
    if (item.held) return;
    const distance = item.group.position.distanceTo(playerCharacter.group.position);
    if (distance < nearestDistance) {
      nearest = item;
      nearestDistance = distance;
    }
  });
  if (!nearest) {
    showGameMessage("가까이에 집을 재료가 없습니다.", 1.4);
    return;
  }
  const isMyIngredient = currentRecipe.ingredients.includes(nearest.ingredientKey)
    && !recipeProgress.has(nearest.ingredientKey);
  if (!isMyIngredient) {
    showGameMessage(`${INGREDIENTS[nearest.ingredientKey].name}은(는) 내 주문 재료가 아닙니다.`);
    return;
  }
  nearest.group.removeFromParent();
  playerCharacter.model.add(nearest.group);
  nearest.group.position.set(0, 1.42, 0.52);
  nearest.group.rotation.set(0, 0, 0);
  nearest.group.scale.setScalar(0.82);
  nearest.group.children.forEach((child) => {
    if (child.userData.ingredientLabel) child.visible = false;
  });
  nearest.held = true;
  depotRespawnTimers[nearest.depotIndex] = 2.8;
  heldItem = nearest;
  playSfx("item-pickup", 0.9);
  showGameMessage(`${INGREDIENTS[nearest.ingredientKey].name}을(를) 집었습니다.`);
  updateRecipeUI();
}

function updateImmunityEffect(character, time) {
  const active = character.stunRemaining <= 0 && character.immunityRemaining > 0;
  character.immunityEffect.visible = active;
  if (!active) return;
  const pulse = 1 + Math.sin(time * 7 + character.group.id) * 0.045;
  character.immunityEffect.scale.setScalar(pulse);
  character.immunityRings[0].rotation.z = time * 1.8;
  character.immunityRings[1].rotation.x = time * -1.35;
  character.immunityRings[1].rotation.y = time * 1.1;
  character.immunityDots.forEach((dot, index) => {
    const angle = time * (1.45 + index * 0.045) + index / character.immunityDots.length * Math.PI * 2;
    const radius = 0.62 + Math.sin(time * 3 + index) * 0.04;
    dot.position.set(
      Math.cos(angle) * radius,
      0.86 + Math.sin(angle * 1.7 + index) * 0.42,
      Math.sin(angle) * radius,
    );
  });
}

function updateFluidizeEffect(character, time) {
  const active = character.fluidizeRemaining > 0;
  character.fluidizeEffect.visible = active;
  if (character.fluidVisualActive !== active) {
    character.fluidVisualActive = active;
    character.model.traverse((child) => {
      if (!child.isMesh || !child.material) return;
      child.material.transparent = active;
      child.material.opacity = active ? 0.34 : 1;
      child.material.depthWrite = !active;
      child.material.needsUpdate = true;
    });
  }
  if (!active) return;
  character.fluidShell.rotation.y = time * 1.6;
  character.fluidShell.rotation.x = time * 0.7;
  character.fluidRings.forEach((ring, index) => {
    ring.rotation.z = time * (1.8 + index * 0.42) * (index % 2 ? -1 : 1);
    ring.scale.setScalar(0.9 + Math.sin(time * 5 + index) * 0.08);
  });
}

function animateCharacter(character, time, delta) {
  const moveBlend = character.moving ? 1 : 0;
  const stride = Math.sin(time * 10 + character.group.id) * 0.52 * moveBlend;
  character.armPivots[0].rotation.x = THREE.MathUtils.lerp(
    character.armPivots[0].rotation.x,
    stride,
    Math.min(1, delta * 12),
  );
  character.armPivots[1].rotation.x = THREE.MathUtils.lerp(
    character.armPivots[1].rotation.x,
    -stride,
    Math.min(1, delta * 12),
  );
  character.legPivots[0].rotation.x = -stride * 0.65;
  character.legPivots[1].rotation.x = stride * 0.65;
  character.model.position.y = character.stunRemaining > 0
    ? 0.03 + Math.sin(time * 22) * 0.035
    : 0.035 + Math.abs(Math.sin(time * 10 + character.group.id)) * 0.04 * moveBlend;
  character.model.rotation.z = THREE.MathUtils.lerp(
    character.model.rotation.z,
    character.stunRemaining > 0 ? Math.sin(time * 18) * 0.12 : 0,
    Math.min(1, delta * 13),
  );
  character.body.material.emissive.setHex(character.stunRemaining > 0 ? 0x5bc8ff : 0x000000);
  character.body.material.emissiveIntensity = character.stunRemaining > 0 ? 0.55 : 0;
  updateImmunityEffect(character, time);
  updateFluidizeEffect(character, time);
}

function updateBots(time, delta) {
  botCharacters.forEach((bot) => {
    if (bot.isRemote) {
      const blend = 1 - Math.exp(-delta * 13);
      bot.group.position.lerp(bot.networkTargetPosition, blend);
      const angleDelta = Math.atan2(
        Math.sin(bot.networkTargetRotation - bot.group.rotation.y),
        Math.cos(bot.networkTargetRotation - bot.group.rotation.y),
      );
      bot.group.rotation.y += angleDelta * blend;
      bot.moving = bot.networkMoving;
      bot.sprinting = bot.networkSprinting;
      bot.wallRunRemaining = bot.networkWallRunning ? 0.2 : 0;
      bot.fluidizeRemaining = bot.networkFluidized ? 0.2 : 0;
      bot.shadow.visible = !bot.networkWallRunning;
      animateCharacter(bot, time, delta);
      return;
    }
    bot.stunRemaining = Math.max(0, bot.stunRemaining - delta);
    bot.immunityRemaining = Math.max(0, bot.immunityRemaining - delta);
    bot.decisionTimer -= delta;
    bot.moving = false;

    if (!gameActive || bot.stunRemaining > 0) {
      animateCharacter(bot, time, delta);
      return;
    }

    if (bot.slipperyVelocity.lengthSq() > 0.02) {
      const nextX = bot.group.position.x + bot.slipperyVelocity.x * delta;
      const nextZ = bot.group.position.z + bot.slipperyVelocity.z * delta;
      if (canCharacterOccupy(bot, nextX, nextZ)) {
        bot.group.position.set(nextX, bot.group.position.y, nextZ);
      } else {
        bot.slipperyVelocity.multiplyScalar(-0.32);
      }
      bot.slipperyVelocity.multiplyScalar(Math.max(0, 1 - delta * 2.2));
    }

    if (bot.decisionTimer <= 0) {
      const angle = Math.random() * Math.PI * 2;
      bot.moveDirection.set(Math.sin(angle), 0, Math.cos(angle));
      bot.decisionTimer = 0.55 + Math.random() * 1.35;
    }
    const botSpeed = PLAYER_SPEED * 0.66;
    const nextX = bot.group.position.x + bot.moveDirection.x * botSpeed * delta;
    const nextZ = bot.group.position.z + bot.moveDirection.z * botSpeed * delta;
    let moved = false;
    if (canCharacterOccupy(bot, nextX, bot.group.position.z)) {
      bot.group.position.x = nextX;
      moved = true;
    }
    if (canCharacterOccupy(bot, bot.group.position.x, nextZ)) {
      bot.group.position.z = nextZ;
      moved = true;
    }
    if (!moved) bot.decisionTimer = 0;
    bot.moving = moved;
    if (moved) {
      const targetRotation = Math.atan2(bot.moveDirection.x, bot.moveDirection.z);
      bot.group.rotation.y = THREE.MathUtils.lerp(
        bot.group.rotation.y,
        targetRotation,
        Math.min(1, delta * 9),
      );
    }
    animateCharacter(bot, time, delta);
  });
}

function findSkillTarget(maxDistance = 1.65) {
  const forward = new THREE.Vector3(
    Math.sin(playerCharacter.group.rotation.y),
    0,
    Math.cos(playerCharacter.group.rotation.y),
  );
  let target = null;
  let bestDistance = maxDistance;
  botCharacters.forEach((bot) => {
    const offset = bot.group.position.clone().sub(playerCharacter.group.position);
    const distance = offset.length();
    if (distance >= bestDistance || distance < 0.001) return;
    if (offset.normalize().dot(forward) < 0.1) return;
    target = bot;
    bestDistance = distance;
  });
  return target;
}

function registerGameplayEffect(group, duration, update) {
  gameplayEffectRoot.add(group);
  gameplayEffects.push({
    group,
    duration,
    elapsed: 0,
    update,
  });
}

function createShockwaveEffect(position, color = 0xff9c54, strength = 1) {
  const group = new THREE.Group();
  group.position.set(position.x, 0.12, position.z);
  const rings = [0, 0.11, 0.22].map((delay, index) => {
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9 - index * 0.18,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.34 + index * 0.08, 0.035 - index * 0.006, 9, 42),
      material,
    );
    ring.rotation.x = Math.PI / 2;
    ring.userData.delay = delay;
    group.add(ring);
    return ring;
  });
  const sparks = [];
  for (let index = 0; index < 18; index += 1) {
    const angle = index / 18 * Math.PI * 2 + Math.random() * 0.18;
    const spark = new THREE.Mesh(
      new THREE.TetrahedronGeometry(0.045 + Math.random() * 0.035, 0),
      new THREE.MeshBasicMaterial({
        color: index % 3 === 0 ? 0xffffff : color,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    spark.position.set(Math.cos(angle) * 0.24, 0.12, Math.sin(angle) * 0.24);
    spark.userData.velocity = new THREE.Vector3(
      Math.cos(angle) * (1.5 + Math.random()) * strength,
      0.8 + Math.random() * 1.2,
      Math.sin(angle) * (1.5 + Math.random()) * strength,
    );
    group.add(spark);
    sparks.push(spark);
  }
  registerGameplayEffect(group, 0.72, (progress, delta) => {
    rings.forEach((ring) => {
      const local = THREE.MathUtils.clamp((progress - ring.userData.delay) / (1 - ring.userData.delay), 0, 1);
      ring.scale.setScalar(0.45 + local * 3.2 * strength);
      ring.material.opacity = (1 - local) * 0.82;
    });
    sparks.forEach((spark) => {
      spark.position.addScaledVector(spark.userData.velocity, delta);
      spark.userData.velocity.y -= delta * 3.4;
      spark.rotation.x += delta * 8;
      spark.rotation.y += delta * 6;
      spark.material.opacity = 1 - progress;
    });
  });
}

function createFreezeEffect(target) {
  const group = new THREE.Group();
  group.position.copy(target.group.position);
  const crystalMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x91eeff,
    emissive: 0x38bfff,
    emissiveIntensity: 0.8,
    roughness: 0.14,
    metalness: 0.05,
    transparent: true,
    opacity: 0.88,
    clearcoat: 0.6,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const crystals = [];
  for (let index = 0; index < 10; index += 1) {
    const angle = index / 10 * Math.PI * 2;
    const crystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.12 + (index % 3) * 0.035, 0),
      crystalMaterial.clone(),
    );
    crystal.position.set(Math.cos(angle) * 0.54, 0.3 + (index % 4) * 0.24, Math.sin(angle) * 0.54);
    crystal.scale.set(0.65, 2.2 + (index % 2) * 0.7, 0.65);
    crystal.rotation.z = (index % 2 ? -1 : 1) * 0.34;
    group.add(crystal);
    crystals.push(crystal);
  }
  const frostRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.56, 0.045, 10, 48),
    new THREE.MeshBasicMaterial({
      color: 0xc9f8ff,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  frostRing.rotation.x = Math.PI / 2;
  frostRing.position.y = 0.08;
  group.add(frostRing);
  registerGameplayEffect(group, 1.1, (progress, delta) => {
    group.position.x = target.group.position.x;
    group.position.z = target.group.position.z;
    const grow = Math.min(1, progress * 5);
    crystals.forEach((crystal, index) => {
      crystal.scale.x = grow * 0.65;
      crystal.scale.z = grow * 0.65;
      crystal.rotation.y += delta * (index % 2 ? -1.8 : 1.8);
      crystal.material.opacity = progress > 0.68 ? (1 - progress) / 0.32 * 0.88 : 0.88;
    });
    frostRing.scale.setScalar(0.45 + progress * 2.2);
    frostRing.material.opacity = 1 - progress;
  });
}

function createSwapPortalEffect(position, color) {
  const group = new THREE.Group();
  group.position.set(position.x, 0.08, position.z);
  const rings = [];
  for (let index = 0; index < 5; index += 1) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.42 + index * 0.035, 0.026, 8, 42),
      new THREE.MeshBasicMaterial({
        color: index % 2 ? 0xffffff : color,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = index * 0.32;
    group.add(ring);
    rings.push(ring);
  }
  registerGameplayEffect(group, 0.95, (progress, delta) => {
    rings.forEach((ring, index) => {
      ring.rotation.z += delta * (3.5 + index * 0.7) * (index % 2 ? -1 : 1);
      ring.position.y = index * 0.32 + Math.sin(progress * Math.PI * 3 + index) * 0.1;
      ring.scale.setScalar(0.55 + Math.sin(progress * Math.PI) * 0.75);
      ring.material.opacity = (1 - progress) * 0.8;
    });
  });
}

function createSprintTrail(position) {
  const group = new THREE.Group();
  group.position.set(position.x, 0.18, position.z);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.24, 0.026, 7, 24),
    new THREE.MeshBasicMaterial({
      color: 0x60f4ff,
      transparent: true,
      opacity: 0.58,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  ring.rotation.x = Math.PI / 2;
  group.add(ring);
  registerGameplayEffect(group, 0.42, (progress) => {
    ring.scale.setScalar(0.5 + progress * 2.1);
    ring.material.opacity = (1 - progress) * 0.56;
    group.position.y += 0.008;
  });
}

function updateGameplayEffects(delta) {
  sprintTrailTimer = Math.max(0, sprintTrailTimer - delta);
  if (playerCharacter.sprinting && sprintTrailTimer <= 0) {
    createSprintTrail(playerCharacter.group.position);
    sprintTrailTimer = 0.11;
  }
  for (let index = gameplayEffects.length - 1; index >= 0; index -= 1) {
    const effect = gameplayEffects[index];
    effect.elapsed += delta;
    const progress = Math.min(1, effect.elapsed / effect.duration);
    effect.update(progress, delta);
    if (progress >= 1) {
      effect.group.removeFromParent();
      gameplayEffects.splice(index, 1);
    }
  }
}

function applyStun(target, duration, label) {
  if (!target || target.immunityRemaining > 0) {
    if (target?.immunityRemaining > 0) playSfx("immunity", 0.9);
    showGameMessage(target ? `${target.name}은(는) 방해 면역 중입니다.` : "대상이 없습니다.");
    return false;
  }
  target.stunRemaining = duration;
  target.immunityRemaining = duration + 2.5;
  target.slipperyVelocity.set(0, 0, 0);
  showGameMessage(`${target.name}: ${label}`);
  return true;
}

function pushTarget(strength, stunDuration = 0) {
  const target = findSkillTarget(stunDuration > 0 ? 2.05 : 1.62);
  if (!target) {
    showGameMessage("앞쪽에 밀칠 상대가 없습니다.");
    return false;
  }
  if (stunDuration > 0 && target.immunityRemaining > 0) {
    playSfx("immunity", 0.9);
    showGameMessage(`${target.name}은(는) 방해 면역 중입니다.`);
    return false;
  }
  const direction = target.group.position.clone()
    .sub(playerCharacter.group.position)
    .setY(0);
  if (direction.lengthSq() < 0.0001) {
    direction.set(
      Math.sin(playerCharacter.group.rotation.y),
      0,
      Math.cos(playerCharacter.group.rotation.y),
    );
  } else {
    direction.normalize();
  }
  let movedDistance = 0;
  const step = 0.11;
  while (movedDistance < strength) {
    const distance = Math.min(step, strength - movedDistance);
    const nextX = target.group.position.x + direction.x * distance;
    const nextZ = target.group.position.z + direction.z * distance;
    if (!canCharacterOccupy(target, nextX, nextZ, { ignoreCharacter: playerCharacter })) break;
    target.group.position.x = nextX;
    target.group.position.z = nextZ;
    movedDistance += distance;
  }
  createShockwaveEffect(target.group.position, stunDuration > 0 ? 0xff754f : 0x66eaff, stunDuration > 0 ? 1.15 : 0.72);
  if (stunDuration > 0) return applyStun(target, stunDuration, "강력 밀치기에 기절!");
  showGameMessage(`${target.name}을(를) ${movedDistance.toFixed(1)}m 밀쳤습니다.`);
  return true;
}

function findNearestWallCell(maxDistance = 1.22) {
  let nearest = null;
  let distance = maxDistance;
  activeWallCells.forEach((key) => {
    const [gridX, gridZ] = key.split(",").map(Number);
    const x = gridX - HALF;
    const z = gridZ - HALF;
    const nextDistance = Math.hypot(
      x - playerCharacter.group.position.x,
      z - playerCharacter.group.position.z,
    );
    if (nextDistance < distance) {
      nearest = { x, z };
      distance = nextDistance;
    }
  });
  return nearest;
}

function landPlayerFromWall() {
  const centerX = Math.round(playerCharacter.group.position.x + HALF) - HALF;
  const centerZ = Math.round(playerCharacter.group.position.z + HALF) - HALF;
  const candidates = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [-1, 1], [1, -1], [-1, -1],
    [2, 0], [-2, 0], [0, 2], [0, -2],
  ];
  for (const [dx, dz] of candidates) {
    const x = centerX + dx;
    const z = centerZ + dz;
    playerCharacter.wallRunRemaining = 0;
    if (canCharacterOccupy(playerCharacter, x, z)) {
      playerCharacter.group.position.set(x, PLAYER_SPAWN.y, z);
      showGameMessage("벽체 위에서 내려왔습니다.");
      return;
    }
    playerCharacter.wallRunRemaining = 0.01;
  }
  playerCharacter.wallRunRemaining = 0;
  resetPlayer();
  showGameMessage("안전한 착지 지점이 없어 출입구로 이동했습니다.");
}

function createOilPuddle(
  position = playerCharacter.group.position,
  networkId = null,
  clearExisting = true,
) {
  if (clearExisting) {
    oilPuddles.forEach((puddle) => puddle.group.removeFromParent());
    oilPuddles.length = 0;
  }

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    uniforms: {
      uTime: { value: 0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform float uTime;
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      void main() {
        vec2 p = (vUv - 0.5) * 2.0;
        float angle = atan(p.y, p.x);
        float wobble = noise(vec2(angle * 2.4, 1.7)) * 0.16
          + sin(angle * 7.0 + uTime * 0.35) * 0.025;
        float distanceField = length(p) - (0.86 + wobble);
        float mask = 1.0 - smoothstep(-0.035, 0.035, distanceField);
        float flow = noise(p * 3.4 + vec2(uTime * 0.08, -uTime * 0.05));
        float thinFilm = sin((p.x - p.y) * 9.0 + flow * 5.0 + uTime * 0.65) * 0.5 + 0.5;
        vec3 blackOil = vec3(0.012, 0.016, 0.022);
        vec3 rainbowA = vec3(0.03, 0.22, 0.28);
        vec3 rainbowB = vec3(0.28, 0.05, 0.20);
        vec3 color = mix(blackOil, mix(rainbowA, rainbowB, thinFilm), 0.32 + flow * 0.18);
        float rim = smoothstep(0.1, -0.025, abs(distanceField));
        color += vec3(0.18, 0.32, 0.36) * rim * 0.34;
        gl_FragColor = vec4(color, mask * 0.88);
      }
    `,
  });
  const group = new THREE.Group();
  group.position.copy(position);
  group.position.y = 0.078;
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(0.92, 64), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.scale.set(1.12, 0.76, 1);
  group.add(mesh);
  const glint = new THREE.Mesh(
    new THREE.TorusGeometry(0.69, 0.018, 8, 52),
    new THREE.MeshBasicMaterial({
      color: 0x4ee5ec,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  glint.rotation.x = Math.PI / 2;
  glint.scale.set(1.08, 0.72, 1);
  group.add(glint);
  gameplayEffectRoot.add(group);
  const puddle = {
    id: oilSerial += 1,
    networkId,
    group,
    mesh,
    glint,
    affected: new Set(),
  };
  oilPuddles.push(puddle);
  if (!networkId) showGameMessage("기름칠이 설치되었습니다. 다시 사용하기 전까지 유지됩니다.");
  return puddle;
}

function useSkill(action) {
  if (!gameActive || playerCharacter.stunRemaining > 0) return;
  if (!isActionEquipped(action)) {
    showGameMessage("현재 캐릭터에게 배치되지 않은 스킬입니다.");
    return;
  }
  if (action === "interact") {
    interactWithItem();
    return;
  }
  if (action === "sprint") return;
  if (multiplayerEnabled) {
    sendAuthoritativeAction("skill", action);
    return;
  }
  if (action === "jump" && playerCharacter.wallRunRemaining > 0) {
    createShockwaveEffect(playerCharacter.group.position, 0x7eeaff, 0.62);
    playSfx("jump", 0.86);
    landPlayerFromWall();
    return;
  }
  const state = skillState[action];
  if (state?.remaining > 0) {
    showGameMessage(`${state.remaining.toFixed(1)}초 뒤에 사용할 수 있습니다.`);
    return;
  }

  let succeeded = false;
  if (action === "push") succeeded = pushTarget(1);
  if (action === "power-push") succeeded = pushTarget(1.65, 3);
  if (action === "freeze") {
    const candidates = botCharacters.filter((bot) => bot.immunityRemaining <= 0);
    const target = candidates[Math.floor(Math.random() * candidates.length)];
    succeeded = applyStun(target, 3, "급속 냉각으로 얼어붙음!");
    if (succeeded) createFreezeEffect(target);
  }
  if (action === "swap") {
    const target = botCharacters[Math.floor(Math.random() * botCharacters.length)];
    if (target) {
      const playerPosition = playerCharacter.group.position.clone();
      const targetPosition = target.group.position.clone();
      playerCharacter.group.position.copy(target.group.position);
      target.group.position.copy(playerPosition);
      target.decisionTimer = 0;
      createSwapPortalEffect(playerPosition, 0x5cecff);
      createSwapPortalEffect(targetPosition, 0xff75df);
      showGameMessage(`${target.name}과(와) 자리를 바꿨습니다.`);
      succeeded = true;
    }
  }
  if (action === "oil") {
    createOilPuddle();
    succeeded = true;
  }
  if (action === "fluidize") {
    if (playerCharacter.wallRunRemaining > 0) {
      showGameMessage("점프와 유체화는 동시에 사용할 수 없습니다.");
    } else {
      playerCharacter.fluidizeRemaining = 3;
      createSwapPortalEffect(playerCharacter.group.position, 0x74efff);
      showGameMessage("3초 동안 유체화: 다른 플레이어를 통과합니다.");
      succeeded = true;
    }
  }
  if (action === "jump") {
    if (playerCharacter.fluidizeRemaining > 0) {
      showGameMessage("점프와 유체화는 동시에 사용할 수 없습니다.");
    } else if (heldItem) {
      showGameMessage("재료를 든 상태에서는 벽체 위로 오를 수 없습니다.");
    } else {
      const wall = findNearestWallCell();
      if (!wall) {
        showGameMessage("벽체 가까이에서 점프를 사용하세요.");
      } else {
        playerCharacter.group.position.set(wall.x, 0.72, wall.z);
        playerCharacter.wallRunRemaining = 4;
        createShockwaveEffect(playerCharacter.group.position, 0x72edff, 0.72);
        showGameMessage("벽체 위 이동 4초! 점프를 다시 누르면 내려옵니다.");
        succeeded = true;
      }
    }
  }
  if (succeeded) {
    const sfxKey = SKILL_SFX[action];
    if (sfxKey) playSfx(sfxKey);
    if (state && "cooldown" in state) state.remaining = state.cooldown;
  }
}

function updateOilPuddles(delta) {
  oilPuddles.forEach((puddle) => {
    puddle.mesh.material.uniforms.uTime.value += delta;
    puddle.glint.rotation.z += delta * 0.23;
    puddle.glint.material.opacity = 0.18 + Math.sin(puddle.mesh.material.uniforms.uTime.value * 1.7) * 0.06;
    if (multiplayerEnabled) return;
    botCharacters.forEach((bot) => {
      const distance = bot.group.position.distanceTo(puddle.group.position);
      if (distance > 1.1) {
        puddle.affected.delete(bot);
        return;
      }
      if (puddle.affected.has(bot) || bot.stunRemaining > 0 || bot.immunityRemaining > 0) return;
      puddle.affected.add(bot);
      const direction = bot.moveDirection.lengthSq() > 0.1
        ? bot.moveDirection
        : new THREE.Vector3(1, 0, 0);
      bot.slipperyVelocity.copy(direction).multiplyScalar(3.4);
      createShockwaveEffect(bot.group.position, 0x55d9e6, 0.58);
      applyStun(bot, 2, "기름에 미끄러져 넘어짐!");
    });
  });
}

function updateSkills(delta) {
  playerCharacter.stunRemaining = Math.max(0, playerCharacter.stunRemaining - delta);
  playerCharacter.immunityRemaining = Math.max(0, playerCharacter.immunityRemaining - delta);
  Object.entries(skillState).forEach(([key, state]) => {
    if ("remaining" in state) state.remaining = Math.max(0, state.remaining - delta);
    const button = actionButtons.find((candidate) => candidate.dataset.action === key);
    if (!button) return;
    const meter = button.querySelector("i");
    if (!meter) return;
    const ratio = key === "sprint"
      ? state.stamina / state.maxStamina
      : state.remaining > 0
        ? 1 - state.remaining / state.cooldown
        : 1;
    meter.style.setProperty("--charge", `${Math.max(0, ratio) * 100}%`);
    button.disabled = key !== "sprint"
      && state.remaining > 0
      && !(key === "jump" && playerCharacter.wallRunRemaining > 0);
  });

  const stamina = skillState.sprint;
  if (!sprintHeld || !playerCharacter.moving) {
    stamina.rechargeDelay = Math.max(0, stamina.rechargeDelay - delta);
    if (stamina.rechargeDelay <= 0) {
      stamina.stamina = Math.min(
        stamina.maxStamina,
        stamina.stamina + (stamina.maxStamina / 3) * delta,
      );
    }
  }

  if (playerCharacter.wallRunRemaining > 0) {
    playerCharacter.wallRunRemaining -= delta;
    if (playerCharacter.wallRunRemaining <= 0 && !multiplayerEnabled) landPlayerFromWall();
  }
  playerCharacter.fluidizeRemaining = Math.max(0, playerCharacter.fluidizeRemaining - delta);
  updateOilPuddles(delta);
}

function updateItems(time, delta) {
  const ingredientKeys = Object.keys(INGREDIENTS);
  [...spawnedItems].forEach((item) => {
    if (item.held) return;
    item.age += delta;
    item.group.position.y = item.spawnY + Math.sin(time * 2.6 + item.phase) * 0.055;
    item.group.rotation.y += delta * 0.78;
    if (!multiplayerEnabled && item.age > 12 && !currentRecipe.ingredients.includes(item.ingredientKey)) {
      const depotIndex = item.depotIndex;
      removeIngredientItem(item);
      depotRespawnTimers[depotIndex] = 0.25;
    }
  });
  if (multiplayerEnabled) return;
  if (!gameActive) return;
  depotRespawnTimers.forEach((remaining, depotIndex) => {
    depotRespawnTimers[depotIndex] = Math.max(0, remaining - delta);
    const occupied = spawnedItems.some((item) => item.depotIndex === depotIndex && !item.held);
    if (occupied || depotRespawnTimers[depotIndex] > 0) return;
    spawnIngredient(
      ingredientKeys[Math.floor(Math.random() * ingredientKeys.length)],
      depotIndex,
    );
  });
  ensureRecipeIngredientsAvailable();
}

function updateGame(delta) {
  if (messageTimer > 0) {
    messageTimer -= delta;
    if (messageTimer <= 0) gameMessage.classList.remove("visible");
  }
  if (!gameActive) return;
  gameTimeRemaining = Math.max(0, gameTimeRemaining - delta);
  gameTimerLabel.textContent = formatGameTime(gameTimeRemaining);
  if (gameTimeRemaining <= 0) {
    gameActive = false;
    movementKeys.clear();
    sprintHeld = false;
    showGameMessage(`게임 종료! 최종 점수 ${gameScore}점`, 999);
  }
}

function resetGameState() {
  gameRoundId += 1;
  if (heldItem) heldItem.group.removeFromParent();
  clearGroup(itemRoot);
  clearGroup(gameplayEffectRoot);
  spawnedItems.length = 0;
  oilPuddles.length = 0;
  gameplayEffects.length = 0;
  depotRespawnTimers.fill(0);
  heldItem = null;
  gameTimeRemaining = GAME_DURATION_SECONDS;
  gameScore = 0;
  gameActive = true;
  messageTimer = 0;
  sprintHeld = false;
  Object.values(skillState).forEach((state) => {
    if ("remaining" in state) state.remaining = 0;
  });
  skillState.sprint.stamina = skillState.sprint.maxStamina;
  skillState.sprint.rechargeDelay = 0;
  shuffleRecipes();
  currentRecipe = null;
  recipeProgress = new Set();
  gameTimerLabel.textContent = "05:00";
  gameScoreLabel.textContent = "0점";
  if (multiplayerEnabled) {
    recipeNameLabel.textContent = "서버 주문 동기화 중";
    recipePointsLabel.textContent = "0점";
    recipeIngredients.replaceChildren();
    heldItemLabel.textContent = "운반 중: 없음";
  } else {
    advanceRecipe();
  }
}

function startNewGame(regenerate = true) {
  if (regenerate) regenerateWallLayout();
  buildMap(currentTheme.layout);
  resetGameState();
}

function addOutlinedBlock({ x, y, z, height, material, edgeMaterial, width = TILE_SIZE, radius = 0.07 }) {
  const geometry = roundedBox(width, height, radius);
  const block = addMesh(geometry, material, [x, y, z]);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 34), edgeMaterial);
  edges.position.copy(block.position);
  mapRoot.add(edges);
  block.userData.outline = edges;
  return block;
}

function createStaticInstancedMesh(geometry, material, count, castShadow = true) {
  const instances = new THREE.InstancedMesh(geometry, material, count);
  instances.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  instances.castShadow = castShadow;
  instances.receiveShadow = true;
  mapRoot.add(instances);
  return instances;
}

function addInstancedFloor(theme, materials) {
  const tileCount = GRID * GRID;
  const parityCounts = [
    Math.ceil(tileCount / 2),
    Math.floor(tileCount / 2),
  ];
  const radius = theme.layout === "lava" ? 0.11 : 0.075;
  const bodyGeometry = roundedBox(TILE_SIZE, 0.3, radius);
  const bodyMeshes = [
    createStaticInstancedMesh(bodyGeometry, materials.floorB, parityCounts[0]),
    createStaticInstancedMesh(bodyGeometry, materials.floorA, parityCounts[1]),
  ];
  const bodyIndices = [0, 0];
  const dummy = new THREE.Object3D();

  let topMeshes = null;
  const topIndices = [0, 0];
  if (theme.layout !== "ice") {
    const topGeometry = roundedBox(0.76, 0.035, 0.012);
    topMeshes = [
      createStaticInstancedMesh(topGeometry, materials.tileTopB, parityCounts[0], false),
      createStaticInstancedMesh(topGeometry, materials.tileTopA, parityCounts[1], false),
    ];
  }

  for (let gridZ = 0; gridZ < GRID; gridZ += 1) {
    for (let gridX = 0; gridX < GRID; gridX += 1) {
      const { x, z } = gridToWorld(gridX, gridZ);
      const parity = (gridX + gridZ) % 2;
      dummy.position.set(x, -0.19, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      bodyMeshes[parity].setMatrixAt(bodyIndices[parity], dummy.matrix);
      bodyIndices[parity] += 1;

      if (topMeshes) {
        dummy.position.y = -0.012;
        dummy.updateMatrix();
        topMeshes[parity].setMatrixAt(topIndices[parity], dummy.matrix);
        topIndices[parity] += 1;
      }
    }
  }

  bodyMeshes.forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  });
  topMeshes?.forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  });

  const edgeMaterial = new THREE.MeshBasicMaterial({
    color: materials.floorEdge.color,
    transparent: true,
    opacity: materials.floorEdge.opacity,
    depthWrite: false,
  });
  const horizontalEdges = createStaticInstancedMesh(
    new THREE.BoxGeometry(0.88, 0.014, 0.018),
    edgeMaterial,
    tileCount * 2,
    false,
  );
  const verticalEdges = createStaticInstancedMesh(
    new THREE.BoxGeometry(0.018, 0.014, 0.88),
    edgeMaterial,
    tileCount * 2,
    false,
  );
  let horizontalIndex = 0;
  let verticalIndex = 0;
  for (let gridZ = 0; gridZ < GRID; gridZ += 1) {
    for (let gridX = 0; gridX < GRID; gridX += 1) {
      const { x, z } = gridToWorld(gridX, gridZ);
      [-0.449, 0.449].forEach((offset) => {
        dummy.position.set(x, 0.012, z + offset);
        dummy.updateMatrix();
        horizontalEdges.setMatrixAt(horizontalIndex, dummy.matrix);
        horizontalIndex += 1;

        dummy.position.set(x + offset, 0.012, z);
        dummy.updateMatrix();
        verticalEdges.setMatrixAt(verticalIndex, dummy.matrix);
        verticalIndex += 1;
      });
    }
  }
  [horizontalEdges, verticalEdges].forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.renderOrder = 2;
  });
}

function addInstancedWallBodies(walls, theme, materials) {
  const standardWallKeys = [...walls].filter((key) => (
    theme.layout !== "lava" || !LAVA_SURFACE_WALL_KEYS.has(key)
  ));
  if (!standardWallKeys.length) return;

  const radius = theme.layout === "lava" ? 0.12 : 0.09;
  const wallInstances = createStaticInstancedMesh(
    roundedBox(TILE_SIZE, 1.46, radius),
    materials.wall,
    standardWallKeys.length,
  );
  const edgeMaterial = new THREE.MeshBasicMaterial({
    color: materials.edge.color,
    transparent: true,
    opacity: materials.edge.opacity * 0.82,
    depthWrite: false,
  });
  const verticalEdges = createStaticInstancedMesh(
    new THREE.BoxGeometry(0.018, 1.22, 0.018),
    edgeMaterial,
    standardWallKeys.length * 4,
    false,
  );
  const dummy = new THREE.Object3D();
  let edgeIndex = 0;
  standardWallKeys.forEach((key, index) => {
    const [gridX, gridZ] = key.split(",").map(Number);
    const { x, z } = gridToWorld(gridX, gridZ);
    dummy.position.set(x, 0.58, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    wallInstances.setMatrixAt(index, dummy.matrix);

    [
      [-0.448, -0.448],
      [-0.448, 0.448],
      [0.448, -0.448],
      [0.448, 0.448],
    ].forEach(([offsetX, offsetZ]) => {
      dummy.position.set(x + offsetX, 0.58, z + offsetZ);
      dummy.updateMatrix();
      verticalEdges.setMatrixAt(edgeIndex, dummy.matrix);
      edgeIndex += 1;
    });
  });
  [wallInstances, verticalEdges].forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  });
}

function createGranularTexture(kind, size = 128) {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = size;
  textureCanvas.height = size;
  const context = textureCanvas.getContext("2d");
  const image = context.createImageData(size, size);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const broad = Math.sin(x * 0.16) * 5 + Math.cos(y * 0.13) * 5;
      const grain = (Math.random() - 0.5) * (kind === "snow" ? 22 : kind === "dirt" ? 30 : 42);
      const value = broad + grain;

      if (kind === "snow") {
        image.data[index] = Math.max(210, Math.min(255, 241 + value));
        image.data[index + 1] = Math.max(220, Math.min(255, 246 + value));
        image.data[index + 2] = Math.max(225, Math.min(255, 250 + value));
      } else if (kind === "dirt") {
        image.data[index] = Math.max(62, Math.min(142, 103 + value));
        image.data[index + 1] = Math.max(45, Math.min(112, 78 + value * 0.78));
        image.data[index + 2] = Math.max(34, Math.min(88, 57 + value * 0.62));
      } else {
        image.data[index] = Math.max(24, Math.min(92, 52 + value));
        image.data[index + 1] = Math.max(22, Math.min(82, 45 + value * 0.8));
        image.data[index + 2] = Math.max(25, Math.min(88, 49 + value * 0.9));
      }
      image.data[index + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);

  if (kind === "snow") {
    for (let i = 0; i < 160; i += 1) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const radius = 0.4 + Math.random() * 1.5;
      const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, "rgba(255,255,255,0.95)");
      gradient.addColorStop(1, "rgba(205,229,240,0)");
      context.fillStyle = gradient;
      context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
  } else if (kind === "dirt") {
    for (let i = 0; i < 110; i += 1) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const radius = 0.35 + Math.random() * 1.35;
      context.fillStyle = Math.random() > 0.5
        ? "rgba(63, 42, 29, 0.42)"
        : "rgba(156, 119, 79, 0.32)";
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
    }
  } else {
    context.strokeStyle = "rgba(10,8,12,0.7)";
    context.lineWidth = 1.2;
    for (let i = 0; i < 18; i += 1) {
      let x = Math.random() * size;
      let y = Math.random() * size;
      context.beginPath();
      context.moveTo(x, y);
      for (let j = 0; j < 5; j += 1) {
        x += (Math.random() - 0.5) * 18;
        y += Math.random() * 10;
        context.lineTo(x, y);
      }
      context.stroke();
    }
  }

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1.5, 1.5);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createIceCrackTexture(seed, size = 256) {
  const crackCanvas = document.createElement("canvas");
  crackCanvas.width = size;
  crackCanvas.height = size;
  const context = crackCanvas.getContext("2d");
  let state = seed >>> 0;
  const random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };

  const paths = [];
  const clusterCount = 1 + Math.floor(random() * 2);
  for (let cluster = 0; cluster < clusterCount; cluster += 1) {
    const edgeOrigin = random() > 0.38;
    const edge = Math.floor(random() * 4);
    let centerX = size * (0.08 + random() * 0.84);
    let centerY = size * (0.08 + random() * 0.84);
    if (edgeOrigin) {
      if (edge === 0) centerX = size * 0.015;
      if (edge === 1) centerX = size * 0.985;
      if (edge === 2) centerY = size * 0.015;
      if (edge === 3) centerY = size * 0.985;
    }

    const rayCount = 1 + Math.floor(random() * 2);
    for (let ray = 0; ray < rayCount; ray += 1) {
      let x = centerX;
      let y = centerY;
      let angle = random() * Math.PI * 2;
      if (edgeOrigin) {
        if (edge === 0) angle = (random() - 0.5) * 1.4;
        if (edge === 1) angle = Math.PI + (random() - 0.5) * 1.4;
        if (edge === 2) angle = Math.PI / 2 + (random() - 0.5) * 1.4;
        if (edge === 3) angle = -Math.PI / 2 + (random() - 0.5) * 1.4;
      }
      const points = [[x, y]];
      const segmentCount = 3 + Math.floor(random() * 5);

      for (let segment = 0; segment < segmentCount; segment += 1) {
        angle += (random() - 0.5) * 0.82;
        const step = size * (0.038 + random() * 0.045);
        x += Math.cos(angle) * step;
        y += Math.sin(angle) * step;
        points.push([x, y]);

        if (segment > 1 && random() > 0.82) {
          const branchAngle = angle + (random() > 0.5 ? 1 : -1) * (0.48 + random() * 0.9);
          const branchLength = step * (0.75 + random() * 1.35);
          paths.push({
            major: false,
            points: [
              [x, y],
              [
                x + Math.cos(branchAngle) * branchLength * 0.48,
                y + Math.sin(branchAngle) * branchLength * 0.48,
              ],
              [
                x + Math.cos(branchAngle + (random() - 0.5) * 0.55) * branchLength,
                y + Math.sin(branchAngle + (random() - 0.5) * 0.55) * branchLength,
              ],
            ],
          });
        }
      }
      paths.push({ major: random() > 0.35, points });
    }
  }

  const longCrackCount = 1;
  for (let crack = 0; crack < longCrackCount; crack += 1) {
    let x = random() * size;
    let y = -size * 0.05;
    let angle = Math.PI / 2 + (random() - 0.5) * 0.7;
    const points = [[x, y]];
    for (let segment = 0; segment < 9; segment += 1) {
      angle += (random() - 0.5) * 0.46;
      const step = size * (0.07 + random() * 0.025);
      x += Math.cos(angle) * step;
      y += Math.sin(angle) * step;
      points.push([x, y]);
    }
    paths.push({ major: true, points });
  }

  context.lineCap = "round";
  context.lineJoin = "round";
  paths.forEach(({ points, major }) => {
    context.beginPath();
    context.moveTo(points[0][0], points[0][1]);
    points.slice(1).forEach(([x, y]) => context.lineTo(x, y));
    context.strokeStyle = major
      ? "rgba(218, 250, 255, 0.44)"
      : "rgba(184, 235, 248, 0.3)";
    context.lineWidth = major ? 2.7 : 1.25;
    context.shadowColor = "rgba(127, 224, 255, 0.48)";
    context.shadowBlur = major ? 1.6 : 0.8;
    context.stroke();

    context.shadowBlur = 0;
    context.strokeStyle = major ? "rgba(20, 72, 105, 0.56)" : "rgba(26, 83, 117, 0.38)";
    context.lineWidth = major ? 0.82 : 0.45;
    context.stroke();
  });

  const texture = new THREE.CanvasTexture(crackCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function createSoftParticleTexture() {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 64;
  textureCanvas.height = 64;
  const context = textureCanvas.getContext("2d");
  const gradient = context.createRadialGradient(32, 32, 1, 32, 32, 30);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.32, "rgba(255,255,255,0.9)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(textureCanvas);
}

function createSnowFieldMask(size = 512) {
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = size;
  maskCanvas.height = size;
  const context = maskCanvas.getContext("2d");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, size, size);

  const tileStep = size / GRID;
  context.strokeStyle = "rgba(150,150,150,0.22)";
  context.lineWidth = 1.05;
  for (let tile = 1; tile < GRID; tile += 1) {
    const position = tile * tileStep;
    context.beginPath();
    context.moveTo(position, 0);
    context.lineTo(position, size);
    context.stroke();
    context.beginPath();
    context.moveTo(0, position);
    context.lineTo(size, position);
    context.stroke();
  }

  const texture = new THREE.CanvasTexture(maskCanvas);
  texture.anisotropy = 4;
  return texture;
}

const snowTexture = createGranularTexture("snow");
const basaltTexture = createGranularTexture("basalt");
const particleTexture = createSoftParticleTexture();
const snowFieldMaskTexture = createSnowFieldMask();
const iceCrackTextures = [
  3817, 5129, 6983, 9127, 11083, 14303,
  17027, 19819, 22441, 25793, 28657, 31963,
].map((seed) => createIceCrackTexture(seed));
const snowCapGeometries = [
  191, 337, 487, 659, 823, 1019, 1193, 1427,
].map((seed) => createSnowCapGeometry(seed));
const surfaceTextureLoader = new THREE.TextureLoader();
const lavaNoiseTexture = surfaceTextureLoader.load("./assets/lava/cloud.png");
const lavaTileTexture = surfaceTextureLoader.load("./assets/lava/lavatile.jpg");
[lavaNoiseTexture, lavaTileTexture].forEach((texture) => {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
});
lavaTileTexture.colorSpace = THREE.SRGBColorSpace;
const snowDiffuseTexture = surfaceTextureLoader.load("./assets/pbr/snow_02-diffuse.jpg");
const snowNormalTexture = surfaceTextureLoader.load("./assets/pbr/snow_02-normal.jpg");
const snowRoughnessTexture = surfaceTextureLoader.load("./assets/pbr/snow_02-rough.jpg");
const snowDisplacementTexture = surfaceTextureLoader.load("./assets/pbr/snow_02-displacement.jpg");
[snowDiffuseTexture, snowNormalTexture, snowRoughnessTexture, snowDisplacementTexture].forEach((texture) => {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1.7, 1.7);
  texture.anisotropy = 8;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
});
snowDiffuseTexture.colorSpace = THREE.SRGBColorSpace;
const snowFieldDiffuseTexture = surfaceTextureLoader.load("./assets/pbr/snow_02-diffuse.jpg");
const snowFieldNormalTexture = surfaceTextureLoader.load("./assets/pbr/snow_02-normal.jpg");
const snowFieldRoughnessTexture = surfaceTextureLoader.load("./assets/pbr/snow_02-rough.jpg");
const snowFieldDisplacementTexture = surfaceTextureLoader.load("./assets/pbr/snow_02-displacement.jpg");
[
  snowFieldDiffuseTexture,
  snowFieldNormalTexture,
  snowFieldRoughnessTexture,
  snowFieldDisplacementTexture,
].forEach((texture) => {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(18, 18);
  texture.anisotropy = 8;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
});
snowFieldDiffuseTexture.colorSpace = THREE.SRGBColorSpace;

function createMaterials(theme) {
  const isIce = theme.layout === "ice";
  const isLava = theme.layout === "lava";
  const isSpace = theme.layout === "space";
  const floorOptions = {
    roughness: isIce ? 0.12 : isLava ? 0.92 : 0.5,
    metalness: isSpace ? 0.58 : 0.03,
    map: isLava ? basaltTexture : null,
    bumpMap: isLava ? basaltTexture : null,
    bumpScale: isLava ? 0.075 : 0,
  };
  const wallOptions = {
    roughness: isIce ? 0.16 : isLava ? 0.88 : 0.3,
    metalness: isSpace ? 0.78 : 0.02,
    map: isLava ? basaltTexture : null,
    bumpMap: isLava ? basaltTexture : null,
    bumpScale: isLava ? 0.085 : 0,
  };

  const floorA = isIce
    ? new THREE.MeshPhysicalMaterial({
      color: 0x6f98ad,
      roughness: 0.48,
      metalness: 0,
      clearcoat: 0.18,
      clearcoatRoughness: 0.58,
    })
    : new THREE.MeshStandardMaterial({ color: theme.floorA, ...floorOptions });
  const floorB = isIce
    ? new THREE.MeshPhysicalMaterial({
      color: 0x648ba0,
      roughness: 0.54,
      metalness: 0,
      clearcoat: 0.14,
      clearcoatRoughness: 0.62,
    })
    : new THREE.MeshStandardMaterial({ color: theme.floorB, ...floorOptions });
  const wall = isIce
    ? new THREE.MeshPhysicalMaterial({
      color: theme.wall,
      roughness: 0.18,
      transmission: 0.1,
      thickness: 0.58,
      ior: 1.31,
      transparent: false,
      opacity: 1,
      clearcoat: 1,
      clearcoatRoughness: 0.15,
    })
    : isSpace
      ? new THREE.MeshPhysicalMaterial({
        color: theme.wall,
        emissive: 0x121a2d,
        emissiveIntensity: 0.3,
        roughness: 0.46,
        metalness: 0.64,
        clearcoat: 0.24,
        clearcoatRoughness: 0.5,
      })
      : new THREE.MeshStandardMaterial({ color: theme.wall, ...wallOptions });

  return {
    floorA,
    floorB,
    tileTopA: new THREE.MeshPhysicalMaterial({
      color: isIce ? 0xf3fbff : theme.floorA,
      roughness: isIce ? 0.94 : isLava ? 0.82 : 0.5,
      metalness: isSpace ? 0.58 : 0.02,
      clearcoat: isSpace ? 0.12 : 0,
      map: isIce ? snowTexture : isLava ? basaltTexture : null,
      bumpMap: isIce ? snowTexture : isLava ? basaltTexture : null,
      bumpScale: isIce ? 0.055 : isLava ? 0.075 : 0,
    }),
    tileTopB: new THREE.MeshPhysicalMaterial({
      color: isIce ? 0xdbeef5 : theme.floorB,
      roughness: isIce ? 0.96 : isLava ? 0.87 : 0.52,
      metalness: isSpace ? 0.56 : 0.02,
      clearcoat: isSpace ? 0.1 : 0,
      map: isIce ? snowTexture : isLava ? basaltTexture : null,
      bumpMap: isIce ? snowTexture : isLava ? basaltTexture : null,
      bumpScale: isIce ? 0.06 : isLava ? 0.08 : 0,
    }),
    wall,
    wallTop: new THREE.MeshPhysicalMaterial({
      color: isIce ? 0xf7fdff : theme.wallTop,
      roughness: isIce ? 0.95 : isLava ? 0.74 : 0.42,
      metalness: isSpace ? 0.65 : 0.02,
      clearcoat: isSpace ? 0.16 : 0,
      map: isIce ? snowTexture : isLava ? basaltTexture : null,
      bumpMap: isIce ? snowTexture : isLava ? basaltTexture : null,
      bumpScale: isIce ? 0.07 : isLava ? 0.08 : 0,
    }),
    snowCap: isIce
      ? new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        map: snowDiffuseTexture,
        normalMap: snowNormalTexture,
        normalScale: new THREE.Vector2(0.72, 0.72),
        roughnessMap: snowRoughnessTexture,
        roughness: 0.94,
        displacementMap: snowDisplacementTexture,
        displacementScale: 0.032,
        displacementBias: -0.008,
        metalness: 0,
        clearcoat: 0.06,
        clearcoatRoughness: 0.82,
        sheen: 0.24,
        sheenColor: new THREE.Color(0xdff4ff),
        sheenRoughness: 0.9,
      })
      : null,
    snowField: isIce
      ? new THREE.MeshPhysicalMaterial({
        color: 0xc3d5de,
        map: snowFieldDiffuseTexture,
        normalMap: snowFieldNormalTexture,
        normalScale: new THREE.Vector2(0.42, 0.42),
        roughnessMap: snowFieldRoughnessTexture,
        roughness: 0.9,
        displacementMap: snowFieldDisplacementTexture,
        displacementScale: 0.022,
        displacementBias: -0.004,
        alphaMap: snowFieldMaskTexture,
        alphaTest: 0.01,
        transparent: true,
        opacity: 0.84,
        depthWrite: true,
        metalness: 0,
        clearcoat: 0.025,
        clearcoatRoughness: 0.9,
      })
      : null,
    inset: new THREE.MeshStandardMaterial({
      color: isIce ? 0xe9fbff : isLava ? 0x27242b : 0x253149,
      roughness: isIce ? 0.18 : isLava ? 0.9 : 0.48,
      metalness: isSpace ? 0.5 : 0.02,
      transparent: isIce,
      opacity: isIce ? 0.9 : 1,
    }),
    detail: new THREE.MeshStandardMaterial({
      color: isIce ? 0xffffff : isLava ? 0xff6a24 : 0x69e8ff,
      emissive: isIce ? 0x6fdfff : isLava ? 0xff2a08 : 0x25b9ff,
      emissiveIntensity: isIce ? 0.35 : isLava ? 0.72 : 1.8,
      roughness: 0.28,
    }),
    base: new THREE.MeshStandardMaterial({ color: theme.base, roughness: 0.9 }),
    floorEdge: new THREE.LineBasicMaterial({
      color: isIce ? 0x8ca8b6 : theme.edge,
      transparent: true,
      opacity: isIce ? 0.62 : 0.95,
    }),
    edge: new THREE.LineBasicMaterial({ color: theme.edge, transparent: true, opacity: 0.95 }),
    green: new THREE.MeshStandardMaterial({
      color: 0x58f57a,
      emissive: 0x117b31,
      emissiveIntensity: isLava ? 0.26 : isSpace ? 0.58 : 0.42,
      roughness: 0.46,
    }),
    objective: new THREE.MeshStandardMaterial({
      color: theme.objective,
      emissive: theme.objective,
      emissiveIntensity: isLava ? 0.48 : 1.7,
      roughness: 0.25,
    }),
  };
}

function addFloorFinish(x, z, gridX, gridZ, theme, materials, addTop = true) {
  if (theme.layout === "ice") return;

  if (addTop) {
    const topMaterial = (gridX + gridZ) % 2 ? materials.tileTopA : materials.tileTopB;
    addMesh(roundedBox(0.76, 0.035, 0.012), topMaterial, [x, -0.012, z]);
  }

  if ((gridX * 3 + gridZ * 5) % 11 !== 0) return;

  if (theme.layout === "lava") {
    const seam = addMesh(new THREE.BoxGeometry(0.46, 0.022, 0.035), materials.detail, [x, 0.014, z]);
    seam.rotation.y = gridX % 2 ? Math.PI / 4 : -Math.PI / 4;
  }

  if (theme.layout === "space") {
    addMesh(roundedBox(0.11, 0.026, 0.009), materials.detail, [x + 0.25, 0.015, z + 0.25]);
  }
}

function addIceGroundSnow(materials) {
  const geometry = new THREE.PlaneGeometry(GRID - 0.1, GRID - 0.1, 152, 152);
  const snowField = addMesh(
    geometry,
    materials.snowField,
    [0, -0.008, 0],
    mapRoot,
    [-Math.PI / 2, 0, 0],
  );
  snowField.castShadow = false;
  snowField.receiveShadow = true;
  snowField.renderOrder = 1;
}

function addWallFinish(x, z, gridX, gridZ, theme, materials) {
  if (theme.layout === "ice") {
    const hash = Math.abs(gridX * 73856093 ^ gridZ * 19349663);
    const variant = hash % snowCapGeometries.length;
    const cap = addMesh(snowCapGeometries[variant], materials.snowCap, [x, 1.342, z]);
    const scaleX = 0.94 + (hash % 5) * 0.014;
    const scaleZ = 0.94 + ((hash >>> 4) % 5) * 0.014;
    const scaleY = 0.88 + ((hash >>> 8) % 5) * 0.032;
    cap.scale.set(scaleX, scaleY, scaleZ);
    cap.rotation.y = (((hash >>> 12) % 7) - 3) * 0.012;
    cap.castShadow = true;
    return;
  }

  addMesh(roundedBox(0.76, 0.075, 0.025), materials.wallTop, [x, 1.35, z]);
  addMesh(roundedBox(0.48, 0.025, 0.009), materials.inset, [x, 1.402, z]);

  if ((gridX + gridZ * 2) % 7 !== 0) return;

  if (theme.layout === "lava") {
    const seam = addMesh(new THREE.BoxGeometry(0.4, 0.02, 0.035), materials.detail, [x, 1.426, z]);
    seam.rotation.y = Math.PI / 4;
  }

  if (theme.layout === "space") {
    addMesh(roundedBox(0.1, 0.028, 0.009), materials.detail, [x + 0.21, 1.425, z + 0.21]);
  }
}

function createSeededRandom(seed) {
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

  // 네 방향 재료 출입구의 최단 동선을 중앙 십자 통로로 합쳐
  // 플레이어들이 자연스럽게 같은 길과 교차로를 반복해서 사용하게 한다.
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
  for (const key of reserved) {
    if (walls.has(key)) return false;
  }

  const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const visited = new Set(["9,9"]);
  const queue = [[9, 9]];
  let queueIndex = 0;
  while (queueIndex < queue.length) {
    const [x, z] = queue[queueIndex];
    queueIndex += 1;
    directions.forEach(([dx, dz]) => {
      const nextX = x + dx;
      const nextZ = z + dz;
      if (nextX < 0 || nextX >= GRID || nextZ < 0 || nextZ >= GRID) return;
      const key = `${nextX},${nextZ}`;
      if (walls.has(key) || visited.has(key)) return;
      visited.add(key);
      queue.push([nextX, nextZ]);
    });
  }

  let walkableCount = 0;
  for (let z = 0; z < GRID; z += 1) {
    for (let x = 0; x < GRID; x += 1) {
      const key = `${x},${z}`;
      if (walls.has(key)) continue;
      walkableCount += 1;

      let exits = 0;
      directions.forEach(([dx, dz]) => {
        const nextX = x + dx;
        const nextZ = z + dz;
        if (nextX < 0 || nextX >= GRID || nextZ < 0 || nextZ >= GRID) {
          if (isOutsideConnection(x, z, nextX, nextZ)) exits += 1;
          return;
        }
        if (!walls.has(`${nextX},${nextZ}`)) exits += 1;
      });
      if (exits < 2) return false;
    }
  }

  if (visited.size !== walkableCount) return false;
  return ["9,0", "9,18", "0,9", "18,9"].every((key) => visited.has(key));
}

function generateRandomWallLayout(seed) {
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

function makeMazeSeed() {
  if (globalThis.crypto?.getRandomValues) {
    return globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
  }
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}

function regenerateWallLayout(seed = makeMazeSeed()) {
  currentMazeSeed = seed >>> 0;
  generatedWallLayout = generateRandomWallLayout(currentMazeSeed);
  mazeSeedLabel.textContent = `MAP ${currentMazeSeed
    .toString(16)
    .padStart(8, "0")
    .toUpperCase()}`;
}

function createWallLayout() {
  if (!generatedWallLayout) regenerateWallLayout();
  return new Set(generatedWallLayout);
}

function createPad(x, z, material, edgeMaterial, size = 0.74) {
  const p = gridToWorld(x, z);
  const pad = addOutlinedBlock({
    x: p.x,
    y: 0.04,
    z: p.z,
    height: 0.16,
    material,
    edgeMaterial,
    width: size,
  });
  const light = new THREE.PointLight(
    material.color,
    currentTheme.layout === "lava" ? 0.28 : currentTheme.layout === "space" ? 0.52 : 0.48,
    currentTheme.layout === "lava" ? 2.0 : currentTheme.layout === "space" ? 2.5 : 2.35,
  );
  light.position.set(p.x, 0.9, p.z);
  mapRoot.add(light);
  return pad;
}

function createSupplyDepot(gridX, gridZ, materials, index) {
  const p = gridToWorld(gridX, gridZ);
  const depotColor = currentTheme.layout === "lava"
    ? 0xffc84a
    : currentTheme.layout === "space"
      ? 0xe9b949
      : 0x75d9e8;
  const depotMaterial = new THREE.MeshStandardMaterial({
    color: depotColor,
    emissive: depotColor,
    emissiveIntensity: currentTheme.layout === "lava" ? 0.12 : 0.08,
    roughness: 0.58,
    metalness: currentTheme.layout === "space" ? 0.46 : 0.08,
  });
  createPad(gridX, gridZ, depotMaterial, materials.edge, 1.34);

  const ring = addMesh(
    new THREE.TorusGeometry(0.5, 0.045, 9, 36),
    materials.wallTop,
    [p.x, 0.19, p.z],
    mapRoot,
    [Math.PI / 2, 0, 0],
  );
  ring.castShadow = false;

  const marker = addMesh(
    new THREE.OctahedronGeometry(0.16, 0),
    depotMaterial,
    [p.x, 0.58, p.z],
  );
  marker.userData.depotIndex = index;
  activeEffects.push((time) => {
    marker.rotation.y = time * 1.2 + index;
    marker.position.y = 0.58 + Math.sin(time * 2.1 + index) * 0.06;
  });
}

function addIceDecor(theme, materials) {
  const crystalMaterial = new THREE.MeshStandardMaterial({
    color: theme.objective,
    emissive: theme.objective,
    emissiveIntensity: 0.45,
    roughness: 0.25,
    transparent: true,
    opacity: 0.88,
  });
  [[-11, -7], [11, -5], [-10, 7], [10, 8]].forEach(([x, z], index) => {
    const crystal = addMesh(new THREE.OctahedronGeometry(0.75 + index * 0.08, 0), crystalMaterial, [x, -0.2, z], decorRoot);
    crystal.scale.y = 2.1;
    crystal.rotation.y = index * 0.6;
  });

  const crackInstances = iceCrackTextures.map(() => []);
  const wallKeys = [...createWallLayout("ice")];
  wallKeys.forEach((key) => {
    const [gridX, gridZ] = key.split(",").map(Number);
    const { x, z } = gridToWorld(gridX, gridZ);
    const faceTransforms = [
      { position: [x, 0.58, z + 0.466], rotationY: 0 },
      { position: [x, 0.58, z - 0.466], rotationY: Math.PI },
      { position: [x + 0.466, 0.58, z], rotationY: Math.PI / 2 },
      { position: [x - 0.466, 0.58, z], rotationY: -Math.PI / 2 },
    ];
    faceTransforms.forEach((transform, faceIndex) => {
      const hash = Math.abs(gridX * 73856093 ^ gridZ * 19349663 ^ faceIndex * 83492791);
      const variant = hash % iceCrackTextures.length;
      crackInstances[variant].push({
        ...transform,
        scaleX: (hash % 2 ? -1 : 1) * (0.97 + ((hash >>> 3) % 5) * 0.008),
        scaleY: 0.97 + ((hash >>> 6) % 5) * 0.008,
        rotationZ: (((hash >>> 9) % 5) - 2) * 0.008,
      });
    });
  });

  const crackGeometry = new THREE.PlaneGeometry(0.9, 1.42);
  const dummy = new THREE.Object3D();
  crackInstances.forEach((instances, variant) => {
    const crackMaterial = new THREE.MeshBasicMaterial({
      map: iceCrackTextures[variant],
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const cracks = new THREE.InstancedMesh(crackGeometry, crackMaterial, instances.length);
    instances.forEach((instance, index) => {
      dummy.position.set(...instance.position);
      dummy.rotation.set(0, instance.rotationY, instance.rotationZ);
      dummy.scale.set(instance.scaleX, instance.scaleY, 1);
      dummy.updateMatrix();
      cracks.setMatrixAt(index, dummy.matrix);
    });
    cracks.instanceMatrix.needsUpdate = true;
    cracks.computeBoundingSphere();
    cracks.renderOrder = 3;
    decorRoot.add(cracks);
  });

  const grainsPerWall = compactView ? 5 : 9;
  const grainGeometry = new THREE.IcosahedronGeometry(0.018, 1);
  const grainMaterial = new THREE.MeshStandardMaterial({
    color: 0xf8fdff,
    roughness: 0.96,
    metalness: 0,
  });
  const grains = new THREE.InstancedMesh(grainGeometry, grainMaterial, wallKeys.length * grainsPerWall);
  const grainDummy = new THREE.Object3D();
  let grainIndex = 0;
  wallKeys.forEach((key, wallIndex) => {
    const [gridX, gridZ] = key.split(",").map(Number);
    const { x, z } = gridToWorld(gridX, gridZ);
    for (let grain = 0; grain < grainsPerWall; grain += 1) {
      const value = Math.sin((wallIndex + 1) * 93.17 + grain * 41.73) * 43758.5453;
      const random = value - Math.floor(value);
      const side = (grain + wallIndex) % 4;
      const along = (random - 0.5) * 0.82;
      const edge = 0.468 + ((grain * 17 + wallIndex * 3) % 5) * 0.006;
      const localX = side < 2 ? along : (side === 2 ? edge : -edge);
      const localZ = side >= 2 ? along : (side === 0 ? edge : -edge);
      const scale = 0.55 + ((grain * 13 + wallIndex * 7) % 11) * 0.09;
      grainDummy.position.set(
        x + localX,
        1.375 + random * 0.055 - (grain % 4 === 0 ? 0.04 : 0),
        z + localZ,
      );
      grainDummy.rotation.set(random * 2.4, random * 4.7, random * 3.1);
      grainDummy.scale.set(scale * 1.15, scale, scale * 0.9);
      grainDummy.updateMatrix();
      grains.setMatrixAt(grainIndex, grainDummy.matrix);
      grainIndex += 1;
    }
  });
  grains.instanceMatrix.needsUpdate = true;
  grains.computeBoundingSphere();
  grains.castShadow = true;
  decorRoot.add(grains);

  const snowCount = 320;
  const snowPositions = new Float32Array(snowCount * 3);
  const snowSpeeds = new Float32Array(snowCount);
  for (let i = 0; i < snowCount; i += 1) {
    snowPositions[i * 3] = (Math.random() - 0.5) * 27;
    snowPositions[i * 3 + 1] = Math.random() * 11;
    snowPositions[i * 3 + 2] = (Math.random() - 0.5) * 27;
    snowSpeeds[i] = 0.45 + Math.random() * 0.85;
  }
  const snowGeometry = new THREE.BufferGeometry();
  snowGeometry.setAttribute("position", new THREE.BufferAttribute(snowPositions, 3));
  const snowMaterial = new THREE.PointsMaterial({
    color: 0xf5fdff,
    size: 0.18,
    map: particleTexture,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const snow = new THREE.Points(snowGeometry, snowMaterial);
  decorRoot.add(snow);

  activeEffects.push((time, delta) => {
    const positionAttribute = snowGeometry.getAttribute("position");
    for (let i = 0; i < snowCount; i += 1) {
      const offset = i * 3;
      snowPositions[offset + 1] -= snowSpeeds[i] * delta;
      snowPositions[offset] += Math.sin(time * 0.55 + i) * delta * 0.06;
      if (snowPositions[offset + 1] < -0.3) {
        snowPositions[offset + 1] = 10 + Math.random() * 2;
        snowPositions[offset] = (Math.random() - 0.5) * 27;
        snowPositions[offset + 2] = (Math.random() - 0.5) * 27;
      }
    }
    positionAttribute.needsUpdate = true;
  });
}

function createLavaFlowMaterial(phase = 0, fullSurface = false) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPhase: { value: phase },
      uFlowSpeed: { value: 0.82 + (Math.sin(phase * 2.17) * 0.5 + 0.5) * 0.34 },
      uUvScale: { value: fullSurface ? new THREE.Vector2(1.85, 1.85) : new THREE.Vector2(1.1, 2.6) },
      uNoiseTexture: { value: lavaNoiseTexture },
      uLavaTexture: { value: lavaTileTexture },
      uFullSurface: { value: fullSurface ? 1 : 0 },
    },
    vertexShader: `
      varying vec2 vUv;
      uniform float uTime;
      uniform float uPhase;
      uniform float uFlowSpeed;
      uniform vec2 uUvScale;
      void main() {
        vUv = uv;
        vec3 flowingPosition = position;
        float pulse = sin(position.y * 10.0 - uTime * 2.4 * uFlowSpeed + uPhase);
        flowingPosition.z += pulse * 0.0025;
        flowingPosition.z += sin(position.x * 19.0 + uTime * 1.25 + uPhase) * 0.0012;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(flowingPosition, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform float uTime;
      uniform float uPhase;
      uniform float uFlowSpeed;
      uniform vec2 uUvScale;
      uniform sampler2D uNoiseTexture;
      uniform sampler2D uLavaTexture;
      uniform float uFullSurface;

      void main() {
        float time = uTime * uFlowSpeed;
        vec2 coarseUv = vec2(vUv.x * 2.15 + uPhase * 0.07, vUv.y * 2.8 + time * 0.13);
        vec4 coarse = texture2D(uNoiseTexture, coarseUv);
        vec4 medium = texture2D(
          uNoiseTexture,
          coarseUv * 2.13 + vec2(coarse.g * 0.42 - time * 0.025, time * 0.21)
        );
        vec4 fine = texture2D(
          uNoiseTexture,
          coarseUv * 4.2 + vec2(medium.r * 0.35 + time * 0.04, -time * 0.28)
        );

        float centerA = 0.28
          + sin(vUv.y * 8.5 + uPhase + coarse.r * 2.4) * 0.026
          + (medium.g - 0.5) * 0.022;
        float centerB = 0.7
          + sin(vUv.y * 10.7 + uPhase * 1.73 + medium.r * 2.0) * 0.03
          + (coarse.b - 0.5) * 0.02;
        float widthA = 0.155 + coarse.g * 0.06 + sin(vUv.y * 15.0 + uPhase) * 0.022;
        float widthB = 0.125 + medium.b * 0.058 + sin(vUv.y * 13.0 - uPhase) * 0.02;
        float distanceA = abs(vUv.x - centerA);
        float distanceB = abs(vUv.x - centerB);
        float streamA = 1.0 - smoothstep(widthA, widthA + 0.035, distanceA);
        float streamB = 1.0 - smoothstep(widthB, widthB + 0.032, distanceB);
        float upperJoin = smoothstep(0.79, 1.0, vUv.y)
          * (1.0 - smoothstep(0.43, 0.5, abs(vUv.x - 0.5)));
        float streamMask = max(max(streamA, streamB), upperJoin * 0.82);
        streamMask *= 0.8 + coarse.a * 0.2;
        streamMask = mix(streamMask, 1.0, uFullSurface);
        if (streamMask < 0.025) discard;

        vec2 shaderUv = vUv * uUvScale;
        vec4 noiseSample = texture2D(uNoiseTexture, shaderUv);
        vec2 T1 = shaderUv + vec2(1.5, -1.5) * time * 0.02;
        vec2 T2 = shaderUv + vec2(-0.5, 2.0) * time * 0.01;
        T1.x += noiseSample.x * 2.0;
        T1.y += noiseSample.y * 2.0;
        T2.x -= noiseSample.y * 0.2;
        T2.y += noiseSample.z * 0.2;

        float p = texture2D(uNoiseTexture, T1 * 2.0).a;
        vec4 lavaSample = texture2D(uLavaTexture, T2 * 2.0);
        vec4 temp = lavaSample * (vec4(p) * 2.0) + (lavaSample * lavaSample - 0.1);
        if (temp.r > 1.0) temp.bg += clamp(temp.r - 2.0, 0.0, 100.0);
        if (temp.g > 1.0) temp.rb += temp.g - 1.0;
        if (temp.b > 1.0) temp.rg += temp.b - 1.0;

        float channel = clamp(coarse.r * 0.38 + medium.g * 0.42 + fine.b * 0.28, 0.0, 1.0);
        float thermalPulse = 0.5 + 0.5 * sin(time * 2.6 + vUv.y * 17.0 + uPhase);
        float heat = smoothstep(0.24, 0.88, channel + thermalPulse * 0.14);
        float crustCells = abs(medium.r - medium.g);
        float crust = 1.0 - smoothstep(0.028, 0.095, crustCells);
        crust *= smoothstep(0.48, 0.78, coarse.b + fine.r * 0.28);

        vec3 cooled = vec3(0.028, 0.008, 0.004);
        vec3 deepMolten = vec3(0.52, 0.055, 0.002);
        vec3 goldenMolten = vec3(2.65, 1.18, 0.095);
        float moltenEnergy = clamp(temp.r * 0.5 + p * 0.62 + heat * 0.28, 0.0, 1.0);
        vec3 color = mix(deepMolten, goldenMolten, smoothstep(0.18, 0.9, moltenEnergy));
        color *= 0.82 + lavaSample.rgb * 0.3;
        float hotVein = smoothstep(0.52, 0.96, p + fine.g * 0.18);
        color += vec3(0.76, 0.4, 0.035) * hotVein * (0.24 + heat * 0.28);
        color *= 0.88 + heat * 0.26;

        float nearestEdge = min(abs(distanceA - widthA), abs(distanceB - widthB));
        float edgeCrust = 1.0 - smoothstep(0.015, 0.075, nearestEdge);
        edgeCrust *= 1.0 - uFullSurface;
        color = mix(color, cooled, clamp(crust * 0.28 + edgeCrust * 0.52, 0.0, 0.78));
        color = min(color, vec3(2.8, 1.42, 0.46));

        gl_FragColor = vec4(color, streamMask * 0.985);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });
}

function createLavaSheetGeometry(width, height, phase) {
  const geometry = new THREE.PlaneGeometry(width, height, 12, 32);
  const position = geometry.getAttribute("position");
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const normalizedY = y / height + 0.5;
    const normalizedX = x / width + 0.5;
    const taper = 0.88 + Math.sin(normalizedY * 8.0 + phase) * 0.045 + normalizedY * 0.09;
    const drift = Math.sin(normalizedY * 12.0 + phase * 1.9) * 0.024;
    const ripples = Math.sin(normalizedY * 19.0 + normalizedX * 8.0 + phase) * 0.012;
    const lip = Math.pow(Math.max(0, normalizedY - 0.86) / 0.14, 2.0) * 0.055;
    position.setX(
      index,
      THREE.MathUtils.clamp(x * taper + drift, -width * 0.5, width * 0.5),
    );
    position.setZ(index, 0.012 + ripples + lip);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function createLavaLakeMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform float uTime;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(91.7, 217.3))) * 43758.5453);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }

      void main() {
        vec2 p = vUv * 9.0;
        p += vec2(uTime * 0.09, -uTime * 0.055);
        float broad = noise(p) * 0.62 + noise(p * 2.25 - uTime * 0.08) * 0.38;
        float cells = abs(noise(p * 0.72) - 0.5);
        float crack = 1.0 - smoothstep(0.035, 0.15, cells);
        float hot = clamp(crack * 1.35 + smoothstep(0.70, 0.93, broad) * 0.42, 0.0, 1.0);
        vec3 cooledRock = vec3(0.045, 0.012, 0.009);
        vec3 deepRed = vec3(0.48, 0.025, 0.005);
        vec3 molten = vec3(1.0, 0.31, 0.015);
        vec3 color = mix(cooledRock, deepRed, broad * 0.42);
        color = mix(color, molten, hot);
        gl_FragColor = vec4(color, 1.0);
      }
    `,
    side: THREE.DoubleSide,
  });
}

function addLavaDecor(theme) {
  const lavaFlowMaterials = [];
  const lavaGlowLights = [];
  const fountainBubbles = [];
  const eruptionSystems = [];
  const eruptionRings = [];
  const lavaBlobGeometry = new THREE.IcosahedronGeometry(0.075, 1);
  const lavaBlobMaterial = new THREE.MeshStandardMaterial({
    color: 0xffc32f,
    emissive: 0xff5a08,
    emissiveIntensity: 1.15,
    roughness: 0.42,
  });
  const eruptionDummy = new THREE.Object3D();

  function createBlobEruption(emitters, count, power, spread) {
    const blobs = new THREE.InstancedMesh(lavaBlobGeometry, lavaBlobMaterial, count);
    const states = Array.from({ length: count }, () => ({
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      life: 0,
      scale: 1,
    }));
    const reset = (state, index, delayed = false) => {
      const emitter = emitters[index % emitters.length];
      state.position.set(
        emitter.x + (Math.random() - 0.5) * spread,
        emitter.y + Math.random() * 0.08,
        emitter.z + (Math.random() - 0.5) * spread,
      );
      state.velocity.set(
        (Math.random() - 0.5) * 1.5 * power,
        (2.1 + Math.random() * 2.8) * power,
        (Math.random() - 0.5) * 1.5 * power,
      );
      state.life = delayed ? Math.random() * 1.2 : 0.48 + Math.random() * 0.72;
      state.scale = 0.48 + Math.random() * 0.72;
    };
    states.forEach((state, index) => reset(state, index, true));
    blobs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    blobs.frustumCulled = false;
    blobs.castShadow = false;
    decorRoot.add(blobs);
    eruptionSystems.push({ blobs, states, reset, gravity: 5.6 * power });
  }

  const lavaWallLayout = createWallLayout("lava");
  const lavaWallBlocks = LAVA_SURFACE_WALL_COORDS
    .filter(([gridX, gridZ]) => lavaWallLayout.has(`${gridX},${gridZ}`));
  const lavaWallEmitters = lavaWallBlocks.map(([gridX, gridZ]) => {
    const { x, z } = gridToWorld(gridX, gridZ);
    return new THREE.Vector3(x, 1.53, z);
  });
  lavaWallBlocks.forEach(([gridX, gridZ], index) => {
    const { x, z } = gridToWorld(gridX, gridZ);
    const wall = mapRoot.children.find(
      (child) => child.userData?.wallKey === `${gridX},${gridZ}`,
    );
    if (wall) {
      const lavaBlockMaterial = createLavaFlowMaterial(index * 1.17, true);
      lavaBlockMaterial.uniforms.uUvScale.value.set(1.18, 2.45);
      lavaBlockMaterial.depthWrite = true;
      lavaBlockMaterial.side = THREE.FrontSide;
      wall.material = lavaBlockMaterial;
      wall.renderOrder = 2;
      if (wall.userData.outline) wall.userData.outline.visible = false;
      lavaFlowMaterials.push(lavaBlockMaterial);
    }

    const glow = new THREE.PointLight(0xff4c16, 1.35, 3.4, 2);
    glow.position.set(x, 1.55, z);
    decorRoot.add(glow);
    lavaGlowLights.push({ light: glow, phase: index * 0.91 });
  });

  const fountainPoolMaterial = createLavaFlowMaterial(21.7, true);
  lavaFlowMaterials.push(fountainPoolMaterial);
  const fountainPool = addMesh(
    new THREE.CircleGeometry(0.72, 52),
    fountainPoolMaterial,
    [0, 0.845, 0],
    decorRoot,
    [-Math.PI / 2, 0, 0],
  );
  fountainPool.renderOrder = 4;

  for (let index = 0; index < 3; index += 1) {
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xffc936,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });
    const ring = addMesh(
      new THREE.TorusGeometry(0.48, 0.025, 8, 48),
      ringMaterial,
      [0, 0.88 + index * 0.012, 0],
      decorRoot,
      [Math.PI / 2, 0, 0],
    );
    ring.renderOrder = 6;
    eruptionRings.push({ ring, material: ringMaterial, phase: index / 3 });
  }

  createBlobEruption([new THREE.Vector3(0, 0.92, 0)], 52, 1.28, 0.34);
  createBlobEruption(lavaWallEmitters, 76, 0.58, 0.3);

  const bubbleGeometry = new THREE.IcosahedronGeometry(0.1, 2);
  for (let index = 0; index < 9; index += 1) {
    const angle = (index / 9) * Math.PI * 2 + (index % 3) * 0.27;
    const radius = 0.18 + (index % 4) * 0.11;
    const bubble = addMesh(
      bubbleGeometry,
      fountainPoolMaterial,
      [Math.cos(angle) * radius, 0.89, Math.sin(angle) * radius],
      decorRoot,
    );
    const scale = 0.55 + (index % 5) * 0.16;
    bubble.scale.setScalar(scale);
    fountainBubbles.push({
      mesh: bubble,
      baseY: 0.89 + (index % 3) * 0.035,
      baseScale: scale,
      phase: index * 0.77,
    });
  }

  activeEffects.push((time, delta) => {
    lavaFlowMaterials.forEach((flowMaterial, index) => {
      flowMaterial.uniforms.uTime.value = time + index * 0.37;
    });
    lavaGlowLights.forEach(({ light, phase }) => {
      light.intensity = 1.22 + Math.sin(time * 2.7 + phase) * 0.18
        + Math.sin(time * 7.1 + phase * 1.7) * 0.07;
    });
    fountainBubbles.forEach(({ mesh, baseY, baseScale, phase }) => {
      const rise = (time * (0.48 + (phase % 1) * 0.22) + phase) % 1;
      mesh.position.y = baseY + Math.sin(rise * Math.PI) * 0.19;
      const pulse = baseScale * (0.72 + Math.sin(rise * Math.PI) * 0.48);
      mesh.scale.setScalar(pulse);
    });
    eruptionRings.forEach(({ ring, material, phase }) => {
      const progress = (time * 0.78 + phase) % 1;
      const scale = 0.68 + progress * 0.92;
      ring.scale.set(scale, scale, scale);
      material.opacity = Math.pow(1 - progress, 2) * 0.52;
    });
    eruptionSystems.forEach(({ blobs, states, reset, gravity }) => {
      states.forEach((state, index) => {
        state.life -= delta;
        if (state.life <= 0) reset(state, index);
        state.velocity.y -= gravity * delta;
        state.position.addScaledVector(state.velocity, delta);
        const scale = state.scale * (0.62 + Math.min(0.38, state.life * 0.3));
        eruptionDummy.position.copy(state.position);
        eruptionDummy.rotation.set(
          state.position.z * 2.7,
          state.position.x * 3.1,
          time * 2.2 + index,
        );
        eruptionDummy.scale.set(
          scale,
          scale * (1 + Math.max(0, state.velocity.y) * 0.065),
          scale,
        );
        eruptionDummy.updateMatrix();
        blobs.setMatrixAt(index, eruptionDummy.matrix);
      });
      blobs.instanceMatrix.needsUpdate = true;
    });
  });

  const particleCount = 125;
  const positions = new Float32Array(particleCount * 3);
  const velocities = Array.from({ length: particleCount }, () => new THREE.Vector3());
  const lives = new Float32Array(particleCount);
  const emitter = new THREE.Vector3(0, 1.02, 0);

  function resetParticle(index, delay = false) {
    const offset = index * 3;
    positions[offset] = emitter.x + (Math.random() - 0.5) * 0.58;
    positions[offset + 1] = emitter.y;
    positions[offset + 2] = emitter.z + (Math.random() - 0.5) * 0.58;
    velocities[index].set(
      (Math.random() - 0.5) * 2.6,
      4.2 + Math.random() * 4.8,
      (Math.random() - 0.5) * 2.6,
    );
    lives[index] = delay ? -Math.random() * 2.8 : 0.7 + Math.random() * 1.15;
  }

  for (let i = 0; i < particleCount; i += 1) resetParticle(i, true);

  const particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const particleMaterial = new THREE.PointsMaterial({
    color: 0xffca35,
    size: 0.18,
    map: particleTexture,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const particles = new THREE.Points(particleGeometry, particleMaterial);
  decorRoot.add(particles);

  const burstLight = new THREE.PointLight(0xffa01c, 0, 8);
  burstLight.position.copy(emitter).add(new THREE.Vector3(0, 1.5, 0));
  decorRoot.add(burstLight);

  activeEffects.push((time, delta) => {
    const positionAttribute = particleGeometry.getAttribute("position");
    let activeCount = 0;
    for (let i = 0; i < particleCount; i += 1) {
      lives[i] -= delta;
      if (lives[i] < -2.8) resetParticle(i);
      if (lives[i] <= 0) continue;
      activeCount += 1;
      const offset = i * 3;
      velocities[i].y -= 7.4 * delta;
      positions[offset] += velocities[i].x * delta;
      positions[offset + 1] += velocities[i].y * delta;
      positions[offset + 2] += velocities[i].z * delta;
      if (positions[offset + 1] < -0.9) resetParticle(i, true);
    }
    burstLight.intensity = activeCount > 20 ? 2.15 + Math.sin(time * 13) * 0.34 : 0.45;
    positionAttribute.needsUpdate = true;
  });
}

function addSpaceDecor(theme) {
  const starCount = 920;
  const positions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i += 1) {
    positions[i * 3] = (Math.random() - 0.5) * 75;
    positions[i * 3 + 1] = Math.random() * 28 - 7;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 75;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const starMaterial = new THREE.PointsMaterial({
    color: 0xd9eaff,
    size: 0.095,
    map: particleTexture,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const stars = new THREE.Points(geometry, starMaterial);
  decorRoot.add(stars);

  const nebulaCount = 150;
  const nebulaPositions = new Float32Array(nebulaCount * 3);
  for (let i = 0; i < nebulaCount; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 18 + Math.random() * 25;
    nebulaPositions[i * 3] = Math.cos(angle) * radius;
    nebulaPositions[i * 3 + 1] = 3 + Math.sin(angle * 2.1) * 5 + Math.random() * 8;
    nebulaPositions[i * 3 + 2] = Math.sin(angle) * radius;
  }
  const nebulaGeometry = new THREE.BufferGeometry();
  nebulaGeometry.setAttribute("position", new THREE.BufferAttribute(nebulaPositions, 3));
  const nebulaMaterial = new THREE.PointsMaterial({
    color: 0x5544aa,
    size: 1.35,
    map: particleTexture,
    transparent: true,
    opacity: 0.075,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const nebula = new THREE.Points(nebulaGeometry, nebulaMaterial);
  decorRoot.add(nebula);

  const orbitalGoldMaterial = new THREE.MeshStandardMaterial({
    color: 0xc99b3d,
    emissive: 0x6f4210,
    emissiveIntensity: 0.28,
    metalness: 0.62,
    roughness: 0.42,
    transparent: true,
    opacity: 0.76,
  });
  [2.75, 5.15, 7.55].forEach((radius, index) => {
    const orbit = addMesh(
      new THREE.TorusGeometry(radius, 0.022 + index * 0.004, 8, 144),
      orbitalGoldMaterial,
      [0, 0.035 + index * 0.006, 0],
      decorRoot,
      [Math.PI / 2, 0, index * 0.19],
    );
    orbit.receiveShadow = false;
  });

  const goldPedestalMaterial = new THREE.MeshStandardMaterial({
    color: 0x8d681f,
    emissive: 0x3f2708,
    emissiveIntensity: 0.16,
    metalness: 0.66,
    roughness: 0.38,
  });
  const hologramMaterial = new THREE.MeshBasicMaterial({
    color: 0x66e7ff,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const planetSpecs = [
    { color: 0x8f8b82, size: 0.28 },
    { color: 0xd29755, size: 0.4, atmosphere: 0xffbd67 },
    { color: 0x247bc7, size: 0.43, earth: true, atmosphere: 0x55c8ff },
    { color: 0xb94731, size: 0.34, atmosphere: 0xff7755 },
    { color: 0xc99d68, size: 0.68, stripes: true },
    { color: 0xcdb375, size: 0.58, ring: 0xe8d59a },
    { color: 0x62bdc8, size: 0.48, ring: 0x9ce7e8, atmosphere: 0x78f4ff },
    { color: 0x294dbb, size: 0.46, atmosphere: 0x557cff },
  ];
  const wallPositions = [
    [2, 0], [6, 0], [12, 0], [16, 0],
    [0, 4], [18, 4], [0, 14], [18, 14],
  ];
  const planetGroups = [];
  const hologramRings = [];

  planetSpecs.forEach((spec, index) => {
    const [gridX, gridZ] = wallPositions[index];
    const { x, z } = gridToWorld(gridX, gridZ);
    addMesh(
      new THREE.CylinderGeometry(0.34, 0.42, 0.13, 24),
      goldPedestalMaterial,
      [x, 1.49, z],
      decorRoot,
    );
    const hologramRing = addMesh(
      new THREE.TorusGeometry(0.43, 0.018, 8, 48),
      hologramMaterial,
      [x, 1.59, z],
      decorRoot,
      [Math.PI / 2, 0, 0],
    );
    hologramRings.push({ ring: hologramRing, phase: index * 0.63 });

    const planetGroup = new THREE.Group();
    const baseY = 1.98 + spec.size;
    planetGroup.position.set(x, baseY, z);
    decorRoot.add(planetGroup);
    const planetMaterial = new THREE.MeshPhysicalMaterial({
      color: spec.color,
      roughness: spec.stripes ? 0.72 : 0.58,
      metalness: 0.01,
      clearcoat: 0.26,
      clearcoatRoughness: 0.62,
    });
    const planet = addMesh(
      new THREE.SphereGeometry(spec.size, 48, 32),
      planetMaterial,
      [0, 0, 0],
      planetGroup,
    );

    if (spec.atmosphere) {
      const atmosphereMaterial = new THREE.MeshBasicMaterial({
        color: spec.atmosphere,
        transparent: true,
        opacity: 0.14,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
      });
      const atmosphere = addMesh(
        new THREE.SphereGeometry(spec.size * 1.1, 36, 24),
        atmosphereMaterial,
        [0, 0, 0],
        planetGroup,
      );
      atmosphere.renderOrder = 4;
    }

    if (spec.stripes) {
      [-0.2, 0, 0.2].forEach((y, bandIndex) => {
        const band = addMesh(
          new THREE.TorusGeometry(spec.size * Math.sqrt(1 - (y / spec.size) ** 2), 0.025, 8, 30),
          new THREE.MeshStandardMaterial({ color: bandIndex === 1 ? 0x8d5b43 : 0xf0d2a0, roughness: 0.72 }),
          [0, y, 0],
          planetGroup,
          [Math.PI / 2, 0, 0],
        );
        band.scale.setScalar(1.01);
      });
    }

    if (spec.earth) {
      const landMaterial = new THREE.MeshStandardMaterial({ color: 0x61a74d, roughness: 0.8 });
      [[-0.18, 0.12, 0.36], [0.16, -0.08, 0.38], [0.05, 0.2, 0.37]].forEach(([lx, ly, lz]) => {
        const land = addMesh(new THREE.SphereGeometry(0.09, 10, 7), landMaterial, [lx, ly, lz], planetGroup);
        land.scale.set(1.5, 0.75, 0.32);
      });
    }

    if (spec.ring) {
      const ringMaterial = new THREE.MeshPhysicalMaterial({
        color: spec.ring,
        roughness: 0.52,
        metalness: 0.18,
        transparent: true,
        opacity: 0.88,
        side: THREE.DoubleSide,
      });
      addMesh(
        new THREE.RingGeometry(spec.size * 1.3, spec.size * 1.95, 64),
        ringMaterial,
        [0, 0, 0],
        planetGroup,
        [Math.PI / 2.5, 0, 0.2],
      );
    }

    addMesh(
      new THREE.TorusGeometry(spec.size * 1.34, 0.011, 6, 56),
      hologramMaterial,
      [0, 0, 0],
      planetGroup,
      [Math.PI / 2.15, 0, index * 0.31],
    );

    planetGroups.push({ group: planetGroup, planet, baseY, phase: index * 0.72 });
  });

  const centralRings = [
    addMesh(
      new THREE.TorusGeometry(1.08, 0.035, 10, 80),
      orbitalGoldMaterial,
      [0, 1.02, 0],
      decorRoot,
      [Math.PI / 2.5, 0.18, 0],
    ),
    addMesh(
      new THREE.TorusGeometry(1.28, 0.022, 8, 90),
      hologramMaterial,
      [0, 1.02, 0],
      decorRoot,
      [Math.PI / 2.05, -0.3, 0.45],
    ),
  ];
  const satelliteMaterial = new THREE.MeshStandardMaterial({
    color: 0x73dfff,
    emissive: 0x1b75a4,
    emissiveIntensity: 0.9,
    roughness: 0.32,
  });
  const centralSatellites = [0, 1, 2].map((index) => {
    const pivot = new THREE.Group();
    pivot.position.set(0, 1.02, 0);
    decorRoot.add(pivot);
    const satellite = addMesh(
      new THREE.SphereGeometry(0.075 + index * 0.018, 16, 12),
      satelliteMaterial,
      [0.84 + index * 0.2, 0, 0],
      pivot,
    );
    return { pivot, satellite, speed: 0.45 + index * 0.19, phase: index * 2.1 };
  });

  const sunGlowMaterial = new THREE.MeshBasicMaterial({
    color: 0xffc447,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
  });
  const sunGlow = addMesh(
    new THREE.SphereGeometry(0.74, 36, 24),
    sunGlowMaterial,
    [0, 1.02, 0],
    decorRoot,
  );

  activeEffects.push((time) => {
    planetGroups.forEach(({ group, planet, baseY, phase }) => {
      group.position.y = baseY + Math.sin(time * 0.82 + phase) * 0.09;
      planet.rotation.y = time * 0.34 + phase;
      group.rotation.y = Math.sin(time * 0.22 + phase) * 0.08;
    });
    hologramRings.forEach(({ ring, phase }) => {
      const pulse = 0.94 + Math.sin(time * 1.6 + phase) * 0.06;
      ring.scale.setScalar(pulse);
      ring.rotation.z = time * 0.24 + phase;
    });
    centralRings[0].rotation.z = time * 0.31;
    centralRings[0].rotation.y = time * 0.18;
    centralRings[1].rotation.z = -time * 0.24;
    centralRings[1].rotation.x = Math.PI / 2.05 + Math.sin(time * 0.35) * 0.12;
    centralSatellites.forEach(({ pivot, satellite, speed, phase }, index) => {
      pivot.rotation.y = time * speed + phase;
      pivot.rotation.z = Math.sin(time * 0.3 + phase) * (0.08 + index * 0.03);
      satellite.rotation.y = time * 0.8;
    });
    const glowPulse = 1 + Math.sin(time * 1.7) * 0.055;
    sunGlow.scale.setScalar(glowPulse);
    stars.rotation.y = time * 0.004;
    starMaterial.opacity = 0.66 + Math.sin(time * 0.55) * 0.08;
    nebula.rotation.y = -time * 0.0025;
  });
}

function addObjective(theme, materials) {
  const baseMaterial = theme.layout === "space" ? materials.wall : materials.wallTop;
  const base = addMesh(
    new THREE.CylinderGeometry(1.15, 1.32, 0.45, 12),
    baseMaterial,
    [0, 0.24, 0],
  );
  base.receiveShadow = true;

  if (theme.layout === "ice") {
    objectiveCore = addMesh(
      new THREE.OctahedronGeometry(0.62, 0),
      materials.objective,
      [0, 1.4, 0],
    );
    objectiveCore.scale.set(1.12, 1.42, 1.12);
  }

  if (theme.layout === "lava") {
    addMesh(
      new THREE.CylinderGeometry(0.7, 0.88, 0.34, 24),
      materials.wall,
      [0, 0.64, 0],
    );
    addMesh(
      new THREE.TorusGeometry(0.79, 0.12, 12, 40),
      materials.wallTop,
      [0, 0.82, 0],
      mapRoot,
      [Math.PI / 2, 0, 0],
    );
  }

  if (theme.layout === "space") {
    addMesh(
      new THREE.TorusGeometry(1.04, 0.075, 10, 52),
      materials.wallTop,
      [0, 0.48, 0],
      mapRoot,
      [Math.PI / 2, 0, 0],
    );
    objectiveCore = addMesh(
      new THREE.SphereGeometry(0.62, 48, 32),
      materials.objective,
      [0, 1.02, 0],
    );
    objectiveRing = addMesh(
      new THREE.TorusGeometry(0.95, 0.055, 10, 64),
      materials.wallTop,
      [0, 1.02, 0],
      mapRoot,
      [Math.PI / 2.5, 0, 0],
    );
  }

  const light = new THREE.PointLight(
    theme.objective,
    theme.layout === "lava" ? 1.7 : theme.layout === "space" ? 2.7 : 5.2,
    theme.layout === "lava" ? 5.2 : theme.layout === "space" ? 6.5 : 8,
  );
  light.position.set(0, 1.7, 0);
  mapRoot.add(light);
}

function clearGroup(group) {
  while (group.children.length) group.remove(group.children[0]);
}

function buildMap(themeKey) {
  currentTheme = THEMES[themeKey];
  startThemeBgm(themeKey);
  clearGroup(mapRoot);
  clearGroup(decorRoot);
  activeEffects = [];
  objectiveCore = null;
  objectiveRing = null;

  scene.background = new THREE.Color(currentTheme.background);
  renderer.toneMappingExposure = currentTheme.layout === "ice" ? 0.92 : currentTheme.layout === "lava" ? 1.03 : 0.9;
  bloomPass.strength = currentTheme.layout === "lava" ? 0.3 : currentTheme.layout === "space" ? 0.14 : 0.14;
  bloomPass.radius = currentTheme.layout === "lava" ? 0.29 : 0.24;
  bloomPass.threshold = currentTheme.layout === "lava" ? 1.0 : currentTheme.layout === "space" ? 1.05 : 0.84;
  scene.fog = new THREE.Fog(currentTheme.fog, compactView ? 70 : 40, compactView ? 145 : 76);
  const materials = createMaterials(currentTheme);

  addMesh(
    roundedBox(GRID + 0.45, 0.72, 0.24),
    materials.base,
    [0, -0.7, 0],
  );

  addInstancedFloor(currentTheme, materials);
  for (let z = 0; z < GRID; z += 1) {
    for (let x = 0; x < GRID; x += 1) {
      const p = gridToWorld(x, z);
      addFloorFinish(p.x, p.z, x, z, currentTheme, materials, false);
    }
  }
  if (currentTheme.layout === "ice") addIceGroundSnow(materials);

  const walls = createWallLayout(currentTheme.layout);
  activeWallCells = walls;
  addInstancedWallBodies(walls, currentTheme, materials);
  for (const key of walls) {
    const [x, z] = key.split(",").map(Number);
    const p = gridToWorld(x, z);
    const isLavaSurfaceWall = currentTheme.layout === "lava"
      && LAVA_SURFACE_WALL_KEYS.has(key);
    if (isLavaSurfaceWall) {
      const wall = addOutlinedBlock({
        x: p.x,
        y: 0.66,
        z: p.z,
        height: 1.62,
        material: materials.wall,
        edgeMaterial: materials.edge,
        radius: 0.12,
      });
      wall.userData.wallKey = key;
    } else {
      addWallFinish(p.x, p.z, x, z, currentTheme, materials);
    }
  }

  SUPPLY_DEPOTS.forEach(({ grid }, index) => {
    createSupplyDepot(grid[0], grid[1], materials, index);
  });

  addObjective(currentTheme, materials);
  if (currentTheme.layout === "ice") addIceDecor(currentTheme, materials);
  if (currentTheme.layout === "lava") addLavaDecor(currentTheme);
  if (currentTheme.layout === "space") addSpaceDecor(currentTheme);

  mapTitle.textContent = currentTheme.title;
  mapSubtitle.textContent = currentTheme.subtitle;
  mapButtons.forEach((button) => {
    button.setAttribute("aria-pressed", button.dataset.map === themeKey ? "true" : "false");
  });
  resetPlayer();
}

mapButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (multiplayerEnabled) {
      if (!multiplayerConnected) {
        showGameMessage("온라인 서버에 연결된 뒤 변경할 수 있습니다.");
        return;
      }
      sendMultiplayerControl("theme", button.dataset.map);
      return;
    }
    buildMap(button.dataset.map);
  });
});

window.addEventListener("pointerdown", unlockAudio, {
  once: true,
  capture: true,
  passive: true,
});
window.addEventListener("keydown", unlockAudio, {
  once: true,
  capture: true,
});
audioToggleButton.addEventListener("click", () => {
  setAudioMuted(!audioMuted);
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    bgmAudio.pause();
  } else if (audioUnlocked && !audioMuted) {
    startThemeBgm(requestedBgmTheme);
  }
});

const supportedMovementKeys = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
]);
const actionKeyMap = new Map([
  ["KeyE", "interact"],
  ["KeyF", "push"],
  ["Digit1", activeLoadout.disruption],
]);
if (activeLoadout.movement !== "sprint") {
  actionKeyMap.set("Space", activeLoadout.movement);
}

window.addEventListener("keydown", (event) => {
  if (supportedMovementKeys.has(event.code)) {
    movementKeys.add(event.code);
    event.preventDefault();
    return;
  }
  if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
    sprintHeld = activeLoadout.movement === "sprint";
    event.preventDefault();
    return;
  }
  const action = actionKeyMap.get(event.code);
  if (action && !event.repeat) {
    useSkill(action);
    event.preventDefault();
  }
});

window.addEventListener("keyup", (event) => {
  if (supportedMovementKeys.has(event.code)) {
    movementKeys.delete(event.code);
    event.preventDefault();
    return;
  }
  if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
    sprintHeld = false;
    event.preventDefault();
  }
});

function clearMovementInput() {
  movementKeys.clear();
  sprintHeld = false;
  joystickPointerId = null;
  joystickInput.set(0, 0);
  joystickKnob.style.translate = "0 0";
}

window.addEventListener("blur", clearMovementInput);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") clearMovementInput();
});

resetPlayerButton.addEventListener("click", resetPlayer);
regenerateMazeButton.addEventListener("click", () => {
  if (multiplayerEnabled) {
    if (!multiplayerConnected) {
      showGameMessage("온라인 서버에 연결된 뒤 변경할 수 있습니다.");
      return;
    }
    sendMultiplayerControl("map", makeMazeSeed());
    return;
  }
  startNewGame(true);
});

copyRoomCodeButton.addEventListener("click", async () => {
  if (!activeRoomCode) return;
  try {
    await navigator.clipboard.writeText(activeRoomCode);
    showGameMessage(`방 코드 ${activeRoomCode} 복사 완료`);
  } catch {
    showGameMessage(`방 코드: ${activeRoomCode}`);
  }
});

actionButtons.forEach((button) => {
  const action = button.dataset.action;
  if (action === "sprint") {
    button.addEventListener("pointerdown", (event) => {
      sprintHeld = true;
      button.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    const stopSprint = (event) => {
      sprintHeld = false;
      if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
      event.preventDefault();
    };
    button.addEventListener("pointerup", stopSprint);
    button.addEventListener("pointercancel", stopSprint);
    return;
  }
  button.addEventListener("click", () => useSkill(action));
});

let joystickPointerId = null;
const updateJoystick = (event) => {
  const bounds = touchJoystick.getBoundingClientRect();
  const centerX = bounds.left + bounds.width * 0.5;
  const centerY = bounds.top + bounds.height * 0.5;
  const maxDistance = bounds.width * 0.32;
  let offsetX = event.clientX - centerX;
  let offsetY = event.clientY - centerY;
  const distance = Math.hypot(offsetX, offsetY);
  if (distance > maxDistance) {
    offsetX = offsetX / distance * maxDistance;
    offsetY = offsetY / distance * maxDistance;
  }
  const normalizedX = offsetX / maxDistance;
  const normalizedY = -offsetY / maxDistance;
  const normalizedDistance = Math.min(1, Math.hypot(normalizedX, normalizedY));
  const deadzone = 0.16;
  if (normalizedDistance <= deadzone) {
    joystickInput.set(0, 0);
  } else {
    const strength = (normalizedDistance - deadzone) / (1 - deadzone);
    joystickInput.set(
      normalizedX / normalizedDistance * strength,
      normalizedY / normalizedDistance * strength,
    );
  }
  joystickKnob.style.translate = `${offsetX}px ${offsetY}px`;
};

touchJoystick.addEventListener("pointerdown", (event) => {
  joystickPointerId = event.pointerId;
  touchJoystick.setPointerCapture(event.pointerId);
  updateJoystick(event);
  event.preventDefault();
});

touchJoystick.addEventListener("pointermove", (event) => {
  if (event.pointerId !== joystickPointerId) return;
  updateJoystick(event);
  event.preventDefault();
});

const releaseJoystick = (event) => {
  if (event.pointerId !== joystickPointerId) return;
  if (touchJoystick.hasPointerCapture(event.pointerId)) {
    touchJoystick.releasePointerCapture(event.pointerId);
  }
  joystickPointerId = null;
  joystickInput.set(0, 0);
  joystickKnob.style.translate = "0 0";
};

touchJoystick.addEventListener("pointerup", releaseJoystick);
touchJoystick.addEventListener("pointercancel", releaseJoystick);
touchJoystick.addEventListener("lostpointercapture", releaseJoystick);
window.addEventListener("pointerup", releaseJoystick);
window.addEventListener("pointercancel", releaseJoystick);

function resize() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const nextCompactView = width / height < 0.72;
  if (width !== renderWidth || height !== renderHeight) {
    renderer.setSize(width, height, false);
    composer.setSize(width, height);
    renderWidth = width;
    renderHeight = height;
  }
  camera.aspect = width / height;

  if (compactView !== nextCompactView) {
    compactView = nextCompactView;
    if (compactView) {
      camera.fov = 43;
      controls.minDistance = 7;
      controls.maxDistance = 26;
      mapRoot.rotation.y = 0;
      decorRoot.rotation.y = 0;
      playerRoot.rotation.y = 0;
      itemRoot.rotation.y = 0;
      gameplayEffectRoot.rotation.y = 0;
    } else {
      camera.fov = 40;
      controls.minDistance = 6;
      controls.maxDistance = 24;
      mapRoot.rotation.y = Math.PI / 4;
      decorRoot.rotation.y = Math.PI / 4;
      playerRoot.rotation.y = Math.PI / 4;
      itemRoot.rotation.y = Math.PI / 4;
      gameplayEffectRoot.rotation.y = Math.PI / 4;
    }
    cameraFollowWorld
      .set(
        playerCharacter.group.position.x,
        0.72,
        playerCharacter.group.position.z,
      )
      .applyAxisAngle(yAxis, playerRoot.rotation.y);
    controls.target.copy(cameraFollowWorld);
    camera.position
      .copy(cameraFollowWorld)
      .add(compactView
        ? new THREE.Vector3(0, 15.5, 14)
        : new THREE.Vector3(9.5, 11.5, 9.5));
    controls.update();
    scene.fog = new THREE.Fog(currentTheme.fog, compactView ? 70 : 40, compactView ? 145 : 76);
  }
  camera.updateProjectionMatrix();
}

function render() {
  resize();
  const delta = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;
  if (objectiveCore) {
    objectiveCore.rotation.y = time * 0.75;
    objectiveCore.position.y = currentTheme.layout === "space"
      ? 1.02
      : 1.4 + Math.sin(time * 1.75) * 0.07;
  }
  if (objectiveRing) {
    objectiveRing.rotation.z = time * 0.35;
    objectiveRing.rotation.y = time * 0.22;
  }
  updatePlayer(time, delta);
  updateMultiplayer(delta);
  updateBots(time, delta);
  updateItems(time, delta);
  updateSkills(delta);
  updateGameplayEffects(delta);
  updateGame(delta);
  updateCameraFollow(delta);
  activeEffects.forEach((effect) => effect(time, delta));
  controls.update();
  composer.render();
  requestAnimationFrame(render);
}

window.addEventListener("resize", resize);
window.addEventListener("beforeunload", () => {
  multiplayerClosing = true;
  clearTimeout(networkReconnectTimer);
  clearTimeout(networkPollTimer);
  multiplayerSocket?.close(1000, "page leaving");
});
configureActiveLoadoutUI();
startNewGame(true);
onlineStatus.hidden = !multiplayerEnabled;
if (multiplayerEnabled) connectMultiplayer();
loading.remove();
render();
