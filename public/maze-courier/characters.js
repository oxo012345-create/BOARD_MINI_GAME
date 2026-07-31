import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const canvas = document.querySelector("#character-canvas");
const loading = document.querySelector("#loading");
const list = document.querySelector("#character-list");
const selectedName = document.querySelector("#selected-name");
const selectedRole = document.querySelector("#selected-role");
const selectedMovement = document.querySelector("#selected-movement");
const selectedDisruption = document.querySelector("#selected-disruption");
const randomCharacterButton = document.querySelector("#random-character");
const startGameButton = document.querySelector("#start-game");
const createRoomButton = document.querySelector("#create-room");
const joinRoomButton = document.querySelector("#join-room");
const roomCodeInput = document.querySelector("#room-code");
const lobbyMessage = document.querySelector("#lobby-message");
const compactDevice = window.matchMedia("(max-width: 650px), (pointer: coarse)").matches;
const pageParams = new URLSearchParams(window.location.search);
const embeddedMode = pageParams.get("embedded") === "1";
const embeddedRoom = String(pageParams.get("room") ?? "").replace(/\D/g, "").slice(0, 4);
document.documentElement.classList.toggle("embedded", embeddedMode);
const providedServerUrl = pageParams.get("server")?.trim();
if (providedServerUrl) {
  localStorage.setItem("mazeCourierServerUrl", providedServerUrl);
}

const CHARACTER_CONFIGS = [
  { name: "민트 배달부", role: "균형형 · 기본 운반", movement: "달리기", disruption: "강력 밀치기", color: 0x35d5b5, accent: 0xffa52d, accessory: "pack", eyes: "oval" },
  { name: "딸기 요리사", role: "가벼움 · 빠른 탐색", movement: "달리기", disruption: "기름칠", color: 0xff567f, accent: 0xfff2d2, accessory: "chef", eyes: "happy" },
  { name: "레몬 탐험가", role: "민첩형 · 지름길 발견", movement: "점프", disruption: "자리바꾸기", color: 0xffd33f, accent: 0x4e9cff, accessory: "lamp", eyes: "focused" },
  { name: "블루 연구원", role: "위험 감지 · 함정 분석", movement: "유체화", disruption: "급속냉각", color: 0x4d91ff, accent: 0x79f4ff, accessory: "goggles", eyes: "round" },
  { name: "보라 수호자", role: "중량형 · 길목 방어", movement: "유체화", disruption: "강력 밀치기", color: 0x9a62f2, accent: 0xffd84c, accessory: "shoulders", eyes: "angry" },
  { name: "주황 정비사", role: "힘형 · 대형 재료 운반", movement: "점프", disruption: "강력 밀치기", color: 0xff842d, accent: 0x3a4962, accessory: "helmet", eyes: "sleepy" },
  { name: "라임 냉동원", role: "냉기 저항 · 얼음 운반", movement: "달리기", disruption: "급속냉각", color: 0x83e34f, accent: 0x42d8ff, accessory: "earmuffs", eyes: "tall" },
  { name: "차콜 조련사", role: "밀치기형 · 몬스터 제어", movement: "유체화", disruption: "강력 밀치기", color: 0x586174, accent: 0xff4f72, accessory: "horns", eyes: "tiny" },
  { name: "레드 구조대", role: "구조형 · 동료 구출", movement: "점프", disruption: "자리바꾸기", color: 0xe9434f, accent: 0xffd349, accessory: "cap", eyes: "wink" },
  { name: "아쿠아 잠수부", role: "탐색형 · 수로 통과", movement: "유체화", disruption: "기름칠", color: 0x28c4ce, accent: 0x7ff5ff, accessory: "diver", eyes: "bubble" },
  { name: "골드 보물꾼", role: "운형 · 희귀 재료 발견", movement: "달리기", disruption: "자리바꾸기", color: 0xe2ad31, accent: 0xffef7a, accessory: "crown", eyes: "cyclops" },
  { name: "화이트 의무원", role: "지원형 · 회복과 보호", movement: "점프", disruption: "급속냉각", color: 0xe8edf5, accent: 0x51d6c5, accessory: "headband", eyes: "square" },
  { name: "네이비 잠입꾼", role: "은신형 · 위험 통로 정찰", movement: "유체화", disruption: "자리바꾸기", color: 0x263b78, accent: 0x8a96ff, accessory: "bandana", eyes: "diamond" },
  { name: "브라운 창고지기", role: "적재형 · 추가 아이템 운반", movement: "달리기", disruption: "기름칠", color: 0x9b643c, accent: 0xf1ba6b, accessory: "crate", eyes: "triple" },
  { name: "마젠타 연금술사", role: "변환형 · 가짜 재료 판별", movement: "유체화", disruption: "급속냉각", color: 0xd94eb7, accent: 0x73f29e, accessory: "antenna", eyes: "uneven" },
  { name: "실버 꼬마비행사", role: "소형 · 좁은 길 통과", movement: "점프", disruption: "기름칠", color: 0x9aa9bd, accent: 0xff684d, accessory: "propeller", eyes: "sparkle" },
];

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x081225);
scene.fog = new THREE.Fog(0x081225, 32, 50);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, compactDevice ? 1.25 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;

const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 70);
camera.position.set(0, 11, 24);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.minDistance = 18;
controls.maxDistance = 36;
controls.minPolarAngle = Math.PI * 0.3;
controls.maxPolarAngle = Math.PI * 0.5;
controls.target.set(0, 1.5, 0);

scene.add(new THREE.HemisphereLight(0xe2f2ff, 0x202942, 3.2));

const keyLight = new THREE.DirectionalLight(0xfff1dc, 4.4);
keyLight.position.set(7, 12, 9);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(compactDevice ? 1024 : 2048, compactDevice ? 1024 : 2048);
keyLight.shadow.camera.left = -10;
keyLight.shadow.camera.right = 10;
keyLight.shadow.camera.top = 9;
keyLight.shadow.camera.bottom = -5;
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0x4bc8ff, 2.7);
rimLight.position.set(-8, 6, -6);
scene.add(rimLight);

const stage = new THREE.Group();
scene.add(stage);

const common = {
  dark: new THREE.MeshStandardMaterial({ color: 0x111829, roughness: 0.48 }),
  eye: new THREE.MeshStandardMaterial({ color: 0xf7fbff, emissive: 0xbcefff, emissiveIntensity: 0.35, roughness: 0.25 }),
  sole: new THREE.MeshStandardMaterial({ color: 0x202a3d, roughness: 0.8 }),
};

function material(color, roughness = 0.55) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.02 });
}

function mesh(geometry, meshMaterial, position, parent, rotation = [0, 0, 0]) {
  const item = new THREE.Mesh(geometry, meshMaterial);
  item.position.set(...position);
  item.rotation.set(...rotation);
  item.castShadow = true;
  item.receiveShadow = true;
  parent.add(item);
  return item;
}

function addFace(parent, style) {
  const plate = mesh(
    new THREE.SphereGeometry(0.6, 24, 16),
    common.dark,
    [0, 1.95, 0.47],
    parent,
  );
  plate.scale.set(1, 0.72, 0.26);

  const sphereEye = (x, y, scaleX, scaleY, rotation = 0) => {
    const eye = mesh(new THREE.SphereGeometry(0.1, 14, 10), common.eye, [x, y, 0.625], parent);
    eye.scale.set(scaleX, scaleY, 0.48);
    eye.rotation.z = rotation;
    return eye;
  };

  const boxEye = (x, y, scaleX, scaleY, rotation = 0) => {
    const eye = mesh(new THREE.BoxGeometry(0.16, 0.16, 0.07), common.eye, [x, y, 0.635], parent);
    eye.scale.set(scaleX, scaleY, 1);
    eye.rotation.z = rotation;
    return eye;
  };

  if (style === "oval") {
    sphereEye(-0.19, 2.0, 0.58, 1.0);
    sphereEye(0.19, 2.0, 0.58, 1.0);
  }
  if (style === "happy") {
    sphereEye(-0.2, 2.0, 0.8, 0.34, -0.24);
    sphereEye(0.2, 2.0, 0.8, 0.34, 0.24);
  }
  if (style === "focused") {
    sphereEye(-0.2, 2.0, 0.72, 0.5, 0.32);
    sphereEye(0.2, 2.0, 0.72, 0.5, -0.32);
  }
  if (style === "round") {
    sphereEye(-0.22, 2.0, 1.05, 1.05);
    sphereEye(0.22, 2.0, 1.05, 1.05);
  }
  if (style === "angry") {
    sphereEye(-0.2, 2.0, 0.82, 0.45, -0.38);
    sphereEye(0.2, 2.0, 0.82, 0.45, 0.38);
  }
  if (style === "sleepy") {
    sphereEye(-0.2, 1.98, 0.88, 0.24);
    sphereEye(0.2, 1.98, 0.88, 0.24);
  }
  if (style === "tall") {
    sphereEye(-0.19, 2.0, 0.42, 1.28);
    sphereEye(0.19, 2.0, 0.42, 1.28);
  }
  if (style === "tiny") {
    sphereEye(-0.16, 2.0, 0.38, 0.38);
    sphereEye(0.16, 2.0, 0.38, 0.38);
  }
  if (style === "wink") {
    sphereEye(-0.2, 2.0, 0.75, 0.9);
    sphereEye(0.2, 1.98, 0.88, 0.18, -0.12);
  }
  if (style === "bubble") {
    sphereEye(-0.22, 2.0, 1.18, 1.18);
    sphereEye(0.22, 2.02, 0.62, 0.62);
  }
  if (style === "cyclops") {
    sphereEye(0, 2.0, 1.35, 1.08);
    const pupil = mesh(new THREE.SphereGeometry(0.045, 10, 8), common.dark, [0.02, 2.0, 0.68], parent);
    pupil.scale.set(0.75, 1, 0.4);
  }
  if (style === "square") {
    boxEye(-0.2, 2.0, 0.75, 0.9);
    boxEye(0.2, 2.0, 0.75, 0.9);
  }
  if (style === "diamond") {
    boxEye(-0.2, 2.0, 0.72, 0.72, Math.PI / 4);
    boxEye(0.2, 2.0, 0.72, 0.72, Math.PI / 4);
  }
  if (style === "triple") {
    [-0.25, 0, 0.25].forEach((x) => sphereEye(x, 2.0, 0.48, 0.65));
  }
  if (style === "uneven") {
    sphereEye(-0.2, 2.04, 1.08, 1.08);
    sphereEye(0.22, 1.98, 0.5, 0.72, 0.16);
  }
  if (style === "sparkle") {
    boxEye(-0.2, 2.0, 0.76, 0.76, Math.PI / 4);
    sphereEye(0.2, 2.0, 0.46, 1.12);
  }
}

function addPack(parent, accent) {
  const pack = mesh(new THREE.BoxGeometry(0.78, 0.88, 0.34), accent, [0, 1.45, -0.63], parent);
  pack.scale.set(1, 1, 0.8);
  mesh(new THREE.BoxGeometry(0.5, 0.12, 0.12), common.dark, [0, 1.85, -0.84], parent);
}

function addChefHat(parent, accent) {
  mesh(new THREE.CylinderGeometry(0.46, 0.52, 0.25, 24), accent, [0, 2.7, 0], parent);
  [-0.28, 0, 0.28].forEach((x, index) => {
    mesh(new THREE.SphereGeometry(0.34, 18, 12), accent, [x, 2.96 + (index === 1 ? 0.07 : 0), 0], parent);
  });
}

function addLamp(parent, accent) {
  const band = mesh(new THREE.TorusGeometry(0.51, 0.055, 10, 30), common.dark, [0, 2.45, 0], parent, [Math.PI / 2, 0, 0]);
  band.scale.y = 0.84;
  const lamp = mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.13, 16), accent, [0, 2.49, 0.48], parent, [Math.PI / 2, 0, 0]);
  const light = new THREE.PointLight(accent.color, 1.4, 2.4);
  light.position.set(0, 2.48, 0.8);
  parent.add(light);
}

function addGoggles(parent, accent) {
  [-0.25, 0.25].forEach((x) => {
    mesh(new THREE.TorusGeometry(0.18, 0.055, 10, 24), accent, [x, 2.02, 0.67], parent);
  });
  mesh(new THREE.BoxGeometry(0.18, 0.06, 0.07), accent, [0, 2.02, 0.67], parent);
}

function addShoulders(parent, accent) {
  [-0.78, 0.78].forEach((x) => {
    const pad = mesh(new THREE.SphereGeometry(0.3, 16, 10), accent, [x, 1.72, 0], parent);
    pad.scale.set(1.15, 0.65, 1);
  });
}

function addHelmet(parent, accent) {
  const helmet = mesh(new THREE.SphereGeometry(0.66, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), accent, [0, 2.43, 0], parent);
  helmet.scale.y = 0.7;
  mesh(new THREE.BoxGeometry(1.05, 0.1, 0.32), accent, [0, 2.5, 0.3], parent);
}

function addEarmuffs(parent, accent) {
  [-0.62, 0.62].forEach((x) => {
    mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.16, 18), accent, [x, 2.25, 0], parent, [0, 0, Math.PI / 2]);
  });
  mesh(new THREE.TorusGeometry(0.63, 0.075, 10, 28, Math.PI), accent, [0, 2.34, 0], parent, [0, 0, 0]);
}

function addHorns(parent, accent) {
  [-0.33, 0.33].forEach((x) => {
    const horn = mesh(new THREE.ConeGeometry(0.15, 0.52, 12), accent, [x, 2.76, 0], parent, [0, 0, x < 0 ? -0.18 : 0.18]);
    horn.scale.z = 0.85;
  });
}

function addCap(parent, accent) {
  const cap = mesh(new THREE.SphereGeometry(0.64, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), accent, [0, 2.43, 0], parent);
  cap.scale.y = 0.56;
  mesh(new THREE.BoxGeometry(0.8, 0.08, 0.35), accent, [0, 2.44, 0.38], parent);
}

function addDiver(parent, accent) {
  addPack(parent, accent);
  addGoggles(parent, accent);
  [-0.8, 0.8].forEach((x) => {
    mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.72, 12), accent, [x, 1.42, -0.28], parent);
  });
}

function addCrown(parent, accent) {
  mesh(new THREE.CylinderGeometry(0.48, 0.55, 0.25, 12), accent, [0, 2.68, 0], parent);
  [-0.36, -0.12, 0.12, 0.36].forEach((x, index) => {
    mesh(new THREE.ConeGeometry(0.13, 0.45 + (index % 2) * 0.08, 10), accent, [x, 2.96, 0], parent);
  });
}

function addHeadband(parent, accent) {
  const band = mesh(new THREE.TorusGeometry(0.55, 0.065, 10, 30), accent, [0, 2.35, 0], parent, [Math.PI / 2, 0, 0]);
  band.scale.y = 0.82;
  mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.08, 16), accent, [0, 2.42, 0.53], parent, [Math.PI / 2, 0, 0]);
}

function addBandana(parent, accent) {
  const band = mesh(new THREE.TorusGeometry(0.58, 0.07, 10, 30), accent, [0, 2.34, 0], parent, [Math.PI / 2, 0, 0]);
  band.scale.y = 0.82;
  [-0.13, 0.13].forEach((x) => {
    mesh(new THREE.ConeGeometry(0.1, 0.48, 10), accent, [x, 2.2, -0.63], parent, [Math.PI / 2.4, 0, x < 0 ? -0.25 : 0.25]);
  });
}

function addCrate(parent, accent) {
  const crate = mesh(new THREE.BoxGeometry(0.9, 0.62, 0.82), accent, [0, 2.72, 0], parent);
  mesh(new THREE.BoxGeometry(1.0, 0.08, 0.1), common.dark, [0, 2.72, 0.43], parent, [0, 0, 0.55]);
  mesh(new THREE.BoxGeometry(1.0, 0.08, 0.1), common.dark, [0, 2.72, 0.44], parent, [0, 0, -0.55]);
  crate.rotation.y = 0.08;
}

function addAntenna(parent, accent) {
  [-0.24, 0.24].forEach((x) => {
    mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.62, 10), common.dark, [x, 2.74, 0], parent, [0, 0, x < 0 ? -0.2 : 0.2]);
    mesh(new THREE.SphereGeometry(0.13, 12, 8), accent, [x * 1.5, 3.02, 0], parent);
  });
}

function addPropeller(parent, accent) {
  addCap(parent, accent);
  mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.32, 10), common.dark, [0, 2.87, 0], parent);
  mesh(new THREE.BoxGeometry(0.86, 0.07, 0.18), accent, [0, 3.04, 0], parent, [0, 0.22, 0]);
}

const accessoryBuilders = {
  pack: addPack,
  chef: addChefHat,
  lamp: addLamp,
  goggles: addGoggles,
  shoulders: addShoulders,
  helmet: addHelmet,
  earmuffs: addEarmuffs,
  horns: addHorns,
  cap: addCap,
  diver: addDiver,
  crown: addCrown,
  headband: addHeadband,
  bandana: addBandana,
  crate: addCrate,
  antenna: addAntenna,
  propeller: addPropeller,
};

export function createCourierCharacter(config) {
  const group = new THREE.Group();
  const bodyMaterial = material(config.color, 0.5);
  const accentMaterial = material(config.accent, 0.42);

  const body = mesh(new THREE.CapsuleGeometry(0.68, 1.15, 10, 22), bodyMaterial, [0, 1.45, 0], group);
  body.scale.set(1, 1, 0.9);
  addFace(group, config.eyes);

  [-1, 1].forEach((side) => {
    mesh(
      new THREE.CapsuleGeometry(0.16, 0.52, 6, 12),
      bodyMaterial,
      [side * 0.73, 1.4, 0],
      group,
      [0, 0, side * -0.27],
    );
    mesh(
      new THREE.CapsuleGeometry(0.2, 0.28, 6, 12),
      bodyMaterial,
      [side * 0.34, 0.38, 0.04],
      group,
      [0, 0, side * -0.08],
    );
    const foot = mesh(new THREE.SphereGeometry(0.25, 16, 10), common.sole, [side * 0.37, 0.12, 0.16], group);
    foot.scale.set(1, 0.55, 1.35);
  });

  accessoryBuilders[config.accessory](group, accentMaterial);
  group.userData = config;
  return group;
}

const characters = [];
const positions = [
  [-4.5, 4.8], [-1.5, 4.8], [1.5, 4.8], [4.5, 4.8],
  [-4.5, 1.6], [-1.5, 1.6], [1.5, 1.6], [4.5, 1.6],
  [-4.5, -1.6], [-1.5, -1.6], [1.5, -1.6], [4.5, -1.6],
  [-4.5, -4.8], [-1.5, -4.8], [1.5, -4.8], [4.5, -4.8],
];
const storedCharacterIndex = THREE.MathUtils.clamp(
  Number.parseInt(localStorage.getItem("mazeCourierCharacter") ?? "0", 10) || 0,
  0,
  CHARACTER_CONFIGS.length - 1,
);

CHARACTER_CONFIGS.forEach((config, index) => {
  const pedestalMaterial = material(0x26334d, 0.72);
  const pedestal = mesh(new THREE.CylinderGeometry(1.08, 1.24, 0.3, 24), pedestalMaterial, [positions[index][0], 0, positions[index][1]], stage);
  pedestal.receiveShadow = true;

  const ringMaterial = new THREE.MeshStandardMaterial({
    color: config.color,
    emissive: config.color,
    emissiveIntensity: 0.7,
    roughness: 0.35,
  });
  const ring = mesh(new THREE.TorusGeometry(0.93, 0.05, 10, 36), ringMaterial, [positions[index][0], 0.18, positions[index][1]], stage, [Math.PI / 2, 0, 0]);

  const character = createCourierCharacter(config);
  character.position.set(positions[index][0], 0.18, positions[index][1]);
  character.scale.setScalar(0.69);
  stage.add(character);
  characters.push({ character, pedestal, ring });

  const button = document.createElement("button");
  button.type = "button";
  button.className = "character-button";
  button.textContent = String(index + 1);
  button.style.setProperty("--swatch", `#${config.color.toString(16).padStart(6, "0")}`);
  button.setAttribute("aria-label", config.name);
  button.setAttribute("aria-pressed", index === storedCharacterIndex ? "true" : "false");
  button.addEventListener("click", () => selectCharacter(index));
  list.append(button);
});

let selectedIndex = storedCharacterIndex;

function selectCharacter(index) {
  selectedIndex = index;
  selectedName.textContent = CHARACTER_CONFIGS[index].name;
  selectedRole.textContent = CHARACTER_CONFIGS[index].role;
  selectedMovement.textContent = `이동기 · ${CHARACTER_CONFIGS[index].movement}`;
  selectedDisruption.textContent = `방해기 · ${CHARACTER_CONFIGS[index].disruption}`;
  localStorage.setItem("mazeCourierCharacter", String(index));
  [...list.children].forEach((button, buttonIndex) => {
    button.setAttribute("aria-pressed", buttonIndex === index ? "true" : "false");
  });
}

randomCharacterButton.addEventListener("click", () => {
  let nextIndex = Math.floor(Math.random() * CHARACTER_CONFIGS.length);
  if (CHARACTER_CONFIGS.length > 1 && nextIndex === selectedIndex) {
    nextIndex = (nextIndex + 1 + Math.floor(Math.random() * (CHARACTER_CONFIGS.length - 1)))
      % CHARACTER_CONFIGS.length;
  }
  selectCharacter(nextIndex);
});

function openGame({ online = false, room = "" } = {}) {
  localStorage.setItem("mazeCourierCharacter", String(selectedIndex));
  sessionStorage.setItem("mazeCourierReady", "1");
  const gameUrl = new URL("./index.html", window.location.href);
  gameUrl.searchParams.set("play", "1");
  if (online) {
    gameUrl.searchParams.set("online", "1");
    gameUrl.searchParams.set("room", room);
  }
  if (providedServerUrl) gameUrl.searchParams.set("server", providedServerUrl);
  window.location.href = gameUrl.href;
}

function normalizeRoomCode(value) {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
}

function makeRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join("");
}

roomCodeInput.value = normalizeRoomCode(pageParams.get("room"));
roomCodeInput.addEventListener("input", () => {
  const normalized = normalizeRoomCode(roomCodeInput.value);
  if (roomCodeInput.value !== normalized) roomCodeInput.value = normalized;
  lobbyMessage.textContent = "방 코드는 영문과 숫자 3~8자로 입력하세요.";
});
roomCodeInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") joinRoomButton.click();
});

createRoomButton.addEventListener("click", () => {
  const room = makeRoomCode();
  roomCodeInput.value = room;
  lobbyMessage.textContent = `${room} 방을 만들고 있습니다…`;
  openGame({ online: true, room });
});

joinRoomButton.addEventListener("click", () => {
  const room = normalizeRoomCode(roomCodeInput.value);
  if (room.length < 3) {
    lobbyMessage.textContent = "방 코드를 3자 이상 입력해 주세요.";
    roomCodeInput.focus();
    return;
  }
  lobbyMessage.textContent = `${room} 방에 참가하고 있습니다…`;
  openGame({ online: true, room });
});

if (embeddedMode) {
  startGameButton.textContent = "이 배달부로 참가";
  lobbyMessage.textContent = `${embeddedRoom}번 한판 방에 연결됩니다.`;
}
startGameButton.addEventListener("click", () => embeddedMode
  ? openGame({ online: true, room: embeddedRoom })
  : openGame());

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(18, 16),
  new THREE.MeshStandardMaterial({ color: 0x101b30, roughness: 0.92 }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.19;
floor.receiveShadow = true;
scene.add(floor);

const grid = new THREE.GridHelper(18, 18, 0x314666, 0x1b2a44);
grid.position.y = -0.18;
scene.add(grid);

const clock = new THREE.Clock();
let compactView = null;

function resize() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const nextCompactView = width / height < 0.72;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;

  if (compactView !== nextCompactView) {
    compactView = nextCompactView;
    if (compactView) {
      camera.position.set(0, 14, 33);
      camera.fov = 38;
      controls.minDistance = 26;
      controls.maxDistance = 44;
    } else {
      camera.position.set(0, 11, 24);
      camera.fov = 36;
      controls.minDistance = 18;
      controls.maxDistance = 36;
    }
    controls.target.set(0, 1.5, 0);
    controls.update();
  }

  camera.updateProjectionMatrix();
}

function render() {
  resize();
  const time = clock.getElapsedTime();
  characters.forEach(({ character, ring }, index) => {
    const selected = index === selectedIndex;
    character.position.y = 0.18 + Math.sin(time * 2.1 + index * 0.7) * 0.045 + (selected ? 0.13 : 0);
    character.rotation.y = Math.sin(time * 0.55 + index) * 0.08;
    character.scale.setScalar(selected ? 0.76 : 0.69);
    ring.rotation.z = time * (selected ? 0.7 : 0.18);
    ring.material.emissiveIntensity = selected ? 2.2 : 0.7;
  });
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}

window.addEventListener("resize", resize);
loading.remove();
selectCharacter(storedCharacterIndex);
render();
