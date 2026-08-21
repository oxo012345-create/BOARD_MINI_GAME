/**
 * 2대2 3라인 공성전 — client renderer and input.
 *
 * The server owns the battle; this file only draws it and forwards taps. Two
 * things shape the whole design:
 *
 * - Snapshots arrive at 10Hz but we render at 60fps, so everything is played
 *   back 1.5 snapshots behind the newest one and interpolated. That buffer
 *   absorbs a dropped packet without a visible hitch.
 * - The server keeps a single absolute coordinate system. "My team at the
 *   bottom" is achieved by rotating one scene root 180°, which also flips left
 *   and right exactly as a real 180° turn would. No per-unit mirroring.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { decodeSnapshot } from "./codec.js";

// ---------------------------------------------------------------- constants
const LANE_COUNT = 3;
const LANE_LENGTH_M = 60;
const LANE_SPACING = 7.6;
/** Narrower than the spacing so a clear strip of grass separates the lanes —
 *  the three fronts have to be distinguishable at a glance. */
const LANE_WIDTH = 5.2;
const HALF = LANE_LENGTH_M / 2;
const TICK_MS = 100;
const INTERP_TICKS = 1.5;

const UNIT_SOLDIER = 0;
const UNIT_ARCHER = 1;
const UNIT_RAM = 2;
const STATE_MOVE = 0;
const STATE_ATTACK = 1;
const STATE_ATTACK_GATE = 2;

const EVENT_SPAWN = 0;
// Deaths are inferred from units leaving the stream rather than from the event
// tail, so a unit that dies during a dropped packet still falls over properly.
const EVENT_GATE_BREAK = 3;

const UNIT_MAX_HP = [20, 10, 60];
const UNIT_NAME = ["병사", "궁수", "공성추"];
const MAX_INSTANCES = 300;
const DEATH_MS = 260;
const SPAWN_MS = 140;

/**
 * Multiplied over the baked vertex colours. Cloth parts are near-white in the
 * geometry precisely so this tint lands hard and the two armies stay telling
 * apart at a glance, while skin and timber keep their own hue.
 */
const TEAM_TINT = [new THREE.Color(0.42, 0.66, 1.55), new THREE.Color(1.55, 0.42, 0.38)];
/** A brief lift on the team colour, not a wash to white — a fully desaturated
 *  flash reads as a third unit type in the middle of a crowded lane. */
const FLASH_TINT = [new THREE.Color(1.15, 1.35, 2.1), new THREE.Color(2.1, 1.15, 1.05)];
const FLASH_MS = 70;

/** sim millimetres → world Z, centred so the mirror rotation stays about origin. */
const simToZ = (millimetres) => millimetres / 1000 - HALF;
const laneX = (lane) => (lane - 1) * LANE_SPACING;

const params = new URLSearchParams(location.search);
const roomCode = params.get("room") ?? "";
const debugMode = params.get("debug") === "1";

// ---------------------------------------------------------------- scene
const stage = document.getElementById("stage");
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x6fa8d8);
// Fog starts past the far wall so it softens the scenery beyond the field
// without dulling the battle itself.
scene.fog = new THREE.Fog(0x6fa8d8, 105, 170);

/** Everything in world space hangs off this; team B sees it rotated 180°. */
const root = new THREE.Group();
scene.add(root);

/**
 * Fixed 3/4 view. High enough that the tops and the fronts of both walls read as
 * solid objects, far enough back that all 60m of the field and both gate rows fit
 * a portrait phone at once. Units end up small on purpose — the subject is the
 * flow of an army across three lanes, not any one soldier.
 */
// A long lens from far back keeps the lanes near-parallel instead of fanning
// out, so the far wall reads at roughly the same size as the near one and all
// three fronts stay comparable at a glance.
const CAMERA_HEIGHT = 54;
const CAMERA_BACK = -84;
const CAMERA_TARGET_Z = -6;
const camera = new THREE.PerspectiveCamera(38, 1, 1, 260);
camera.position.set(0, CAMERA_HEIGHT, CAMERA_BACK);
camera.lookAt(0, 0, CAMERA_TARGET_Z);

scene.add(new THREE.AmbientLight(0xdCE8F5, 1.9));
const sun = new THREE.DirectionalLight(0xfff6e0, 2.1);
sun.position.set(-26, 46, -20);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -40;
sun.shadow.camera.right = 40;
sun.shadow.camera.top = 46;
sun.shadow.camera.bottom = -46;
sun.shadow.camera.far = 140;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xbfe8a8, 0x4a3a20, 0.85));

// ---------------------------------------------------------------- geometry helpers
/** A box baked into world position with a flat vertex colour, ready to merge. */
function part(width, height, depth, x, y, z, hex, rotY = 0) {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  if (rotY) geometry.rotateY(rotY);
  geometry.translate(x, y, z);
  const color = new THREE.Color(hex);
  const count = geometry.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

/**
 * Units are tiny on screen — the point is the flow of an army, not portraiture —
 * so they are chunky low-poly silhouettes built from a handful of boxes. Reading
 * "soldier vs archer vs ram" at a glance matters far more than detail.
 */
function soldierGeometry() {
  return mergeGeometries([
    part(0.24, 0.34, 0.22, -0.13, 0.17, 0, 0x3b3f4a),
    part(0.24, 0.34, 0.22, 0.13, 0.17, 0, 0x3b3f4a),
    part(0.62, 0.56, 0.38, 0, 0.62, 0, 0xdcdce4),
    part(0.66, 0.16, 0.42, 0, 0.86, 0, 0xb8bcc8),
    part(0.34, 0.30, 0.30, 0, 1.06, 0.02, 0xf1c9a0),
    part(0.42, 0.20, 0.40, 0, 1.20, 0, 0xc9ced8),
    part(0.10, 0.74, 0.10, 0.36, 0.92, 0.12, 0xe8e8ee, 0.32),
    part(0.10, 0.16, 0.10, 0.36, 0.52, 0.12, 0x8a6a3a),
    part(0.14, 0.52, 0.46, -0.38, 0.62, 0.04, 0xa8843c),
  ]);
}

function archerGeometry() {
  return mergeGeometries([
    part(0.22, 0.34, 0.20, -0.12, 0.17, 0, 0x6b6f78),
    part(0.22, 0.34, 0.20, 0.12, 0.17, 0, 0x6b6f78),
    part(0.56, 0.54, 0.34, 0, 0.60, 0, 0xe8e8ee),
    part(0.60, 0.14, 0.38, 0, 0.82, 0, 0xc4c4cc),
    part(0.32, 0.28, 0.28, 0, 1.00, 0.02, 0xf1c9a0),
    part(0.40, 0.26, 0.36, 0, 1.16, -0.02, 0xdcdce4),
    part(0.08, 0.86, 0.08, 0.32, 0.78, 0.14, 0x8a5a2c),
    part(0.06, 0.06, 0.52, -0.02, 0.86, 0.24, 0xe6e0cc),
    part(0.24, 0.30, 0.16, -0.30, 0.74, -0.14, 0x7a5a34),
  ]);
}

function ramGeometry() {
  // The team tint is a multiply, so anything warm and brown comes out a muddy
  // grey and the ram stops reading as belonging to either side. Every large
  // surface is therefore near-neutral, letting the tint carry the colour, with
  // timber left only on the small trim.
  return mergeGeometries([
    part(1.16, 0.30, 1.78, 0, 0.22, 0, 0xe8e8f0),
    part(1.40, 0.46, 0.32, 0, 0.62, -0.64, 0xf2f2f8),
    part(1.40, 0.46, 0.32, 0, 0.62, 0.64, 0xf2f2f8),
    part(0.84, 0.80, 1.44, 0, 0.92, 0, 0xf6f6fb),
    part(0.92, 0.20, 1.52, 0, 1.40, 0, 0xd6d6e0),
    // Ironwork and the ram's head stay metallic so the silhouette still reads.
    part(0.38, 0.38, 0.56, 0, 0.86, 1.08, 0x9aa2ae),
    part(0.34, 0.34, 0.34, 0, 0.86, 1.42, 0x6d747f),
    part(0.20, 0.66, 0.66, -0.66, 0.34, -0.44, 0x8a6a44),
    part(0.20, 0.66, 0.66, 0.66, 0.34, -0.44, 0x8a6a44),
    part(0.20, 0.66, 0.66, -0.66, 0.34, 0.44, 0x8a6a44),
    part(0.20, 0.66, 0.66, 0.66, 0.34, 0.44, 0x8a6a44),
  ]);
}

const UNIT_GEOMETRY = [soldierGeometry(), archerGeometry(), ramGeometry()];
/** Small enough that a full lane still reads as a crowd, large enough that the
 *  three types stay distinguishable on a phone. */
const UNIT_SCALE = [1.5, 1.5, 1.15];

// ---------------------------------------------------------------- terrain
const groundMaterial = new THREE.MeshLambertMaterial({ color: 0x66a83f });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(150, 150), groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
root.add(ground);

const laneGroups = [];
for (let lane = 0; lane < LANE_COUNT; lane += 1) {
  const dirt = new THREE.Mesh(
    new THREE.PlaneGeometry(LANE_WIDTH, LANE_LENGTH_M),
    new THREE.MeshLambertMaterial({ color: 0x7a6440 }),
  );
  dirt.rotation.x = -Math.PI / 2;
  dirt.position.set(laneX(lane), 0.01, 0);
  dirt.receiveShadow = true;
  root.add(dirt);

  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(LANE_WIDTH + 0.5, LANE_LENGTH_M),
    new THREE.MeshBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0, depthWrite: false }),
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.set(laneX(lane), 0.03, 0);
  root.add(glow);
  laneGroups.push({ dirt, glow });
}

/** Wall + three independent gates per side. Gate HP is per-lane, never a pool. */
function buildWall(side) {
  const group = new THREE.Group();
  const z = side === 0 ? -HALF : HALF;
  const stone = new THREE.MeshLambertMaterial({ color: 0x9a958c });
  const trim = new THREE.MeshLambertMaterial({ color: 0x7d786f });
  const banner = new THREE.MeshLambertMaterial({ color: side === 0 ? 0x3f7fe0 : 0xd64848 });

  const segments = [-1.5, -0.5, 0.5, 1.5].map((slot) => slot * LANE_SPACING);
  for (const x of segments) {
    const block = new THREE.Mesh(new THREE.BoxGeometry(LANE_SPACING - LANE_WIDTH + 3.4, 5.2, 2.6), stone);
    block.position.set(x, 2.6, z);
    block.castShadow = true;
    block.receiveShadow = true;
    group.add(block);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(LANE_SPACING - LANE_WIDTH + 3.8, 0.7, 3.0), trim);
    cap.position.set(x, 5.5, z);
    cap.castShadow = true;
    group.add(cap);
  }

  const gates = [];
  for (let lane = 0; lane < LANE_COUNT; lane += 1) {
    const gate = new THREE.Group();
    const arch = new THREE.Mesh(new THREE.BoxGeometry(LANE_WIDTH - 0.4, 1.1, 2.8), trim);
    arch.position.set(0, 4.6, 0);
    arch.castShadow = true;
    gate.add(arch);
    const door = new THREE.Mesh(new THREE.BoxGeometry(LANE_WIDTH - 1.2, 4.0, 0.6), new THREE.MeshLambertMaterial({ color: 0x6b4a2a }));
    door.position.set(0, 2.0, 0);
    door.castShadow = true;
    gate.add(door);
    // Banners on both faces. Each client rotates the whole scene 180° to put its
    // own wall at the bottom, so "the side facing the camera" is not the same
    // face for the two teams — decorating only one would hide it for one side.
    const flag = new THREE.Group();
    for (const offset of [-1.5, 1.5]) {
      const cloth = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.4, 0.16), banner);
      cloth.position.set(0, 4.1, offset);
      flag.add(cloth);
    }
    gate.add(flag);
    gate.position.set(laneX(lane), 0, z);
    group.add(gate);
    gates.push({ group: gate, door, flag, broken: false });
  }
  root.add(group);
  return gates;
}
const wallGates = [buildWall(0), buildWall(1)];

/** Scenery so the edges of the field do not read as empty page margin. */
(function decorate() {
  const trunk = new THREE.MeshLambertMaterial({ color: 0x4a3520 });
  const leaves = new THREE.MeshLambertMaterial({ color: 0x2f6b32 });
  const tent = new THREE.MeshLambertMaterial({ color: 0x8d3f34 });
  let seed = 20260821;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  for (let index = 0; index < 44; index += 1) {
    const side = index % 2 === 0 ? -1 : 1;
    const x = side * (13.5 + random() * 11);
    const z = (random() - 0.5) * (LANE_LENGTH_M + 16);
    if (random() < 0.75) {
      const height = 2.6 + random() * 2.2;
      const stem = new THREE.Mesh(new THREE.BoxGeometry(0.5, height, 0.5), trunk);
      stem.position.set(x, height / 2, z);
      stem.castShadow = true;
      root.add(stem);
      const crown = new THREE.Mesh(new THREE.ConeGeometry(1.7, 3.4, 7), leaves);
      crown.position.set(x, height + 1.3, z);
      crown.castShadow = true;
      root.add(crown);
    } else {
      const hut = new THREE.Mesh(new THREE.ConeGeometry(1.5, 2.0, 4), tent);
      hut.position.set(x, 1.0, z);
      hut.rotation.y = random() * Math.PI;
      hut.castShadow = true;
      root.add(hut);
    }
  }
})();

// ---------------------------------------------------------------- instanced pools
const unitMeshes = [];
for (let team = 0; team < 2; team += 1) {
  for (let type = 0; type < 3; type += 1) {
    const material = new THREE.MeshLambertMaterial({ vertexColors: true });
    const mesh = new THREE.InstancedMesh(UNIT_GEOMETRY[type], material, MAX_INSTANCES);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    mesh.count = 0;
    root.add(mesh);
    unitMeshes[team * 3 + type] = mesh;
  }
}

const shadowMesh = new THREE.InstancedMesh(
  new THREE.CircleGeometry(0.44, 10).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.26, depthWrite: false }),
  MAX_INSTANCES * 2,
);
shadowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
shadowMesh.frustumCulled = false;
shadowMesh.count = 0;
root.add(shadowMesh);

/** Health bars exist only while a unit is hurt — a full-HP army shows none. */
const barGeometry = new THREE.PlaneGeometry(1, 1);
const barBack = new THREE.InstancedMesh(barGeometry, new THREE.MeshBasicMaterial({ color: 0x120c08, transparent: true, opacity: 0.72, depthWrite: false, depthTest: false }), MAX_INSTANCES * 2);
const barFill = new THREE.InstancedMesh(barGeometry, new THREE.MeshBasicMaterial({ color: 0x5ce06a, depthWrite: false, depthTest: false }), MAX_INSTANCES * 2);
for (const bar of [barBack, barFill]) {
  bar.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  bar.frustumCulled = false;
  bar.count = 0;
  bar.renderOrder = 5;
  root.add(bar);
}

const ARROW_POOL = 160;
const arrowMesh = new THREE.InstancedMesh(
  new THREE.BoxGeometry(0.07, 0.07, 0.95),
  new THREE.MeshBasicMaterial({ color: 0xf2e6c8 }),
  ARROW_POOL,
);
arrowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
arrowMesh.frustumCulled = false;
arrowMesh.count = 0;
root.add(arrowMesh);
const arrows = [];

const dummy = new THREE.Object3D();
const tintColor = new THREE.Color();

// ---------------------------------------------------------------- net state
let mySide = 0;
let config = null;
const snapshots = [];
let playTick = 0;
let latestTick = 0;
let assaultActive = false;
let suddenDeath = false;
let matchEnded = false;
let selectedLane = 1;
let socket = null;
let reconnectDelay = 250;
let seq = 0;

/** Units that vanished from the stream get a short topple instead of popping out. */
const dying = new Map();
const spawnFlash = new Map();
const hitFlash = new Map();
const lastState = new Map();

const statusBox = document.getElementById("status");
const bannerBox = document.getElementById("banner");
const clockBox = document.getElementById("clock");
const gatesLayer = document.getElementById("gates");
const deck = document.getElementById("deck");

const showStatus = (text) => {
  if (!text) { statusBox.classList.add("hidden"); return; }
  statusBox.classList.remove("hidden");
  statusBox.innerHTML = text;
};
const showBanner = (text, color) => {
  bannerBox.textContent = text;
  bannerBox.style.color = color ?? "#ffd34d";
  bannerBox.classList.remove("show");
  void bannerBox.offsetWidth;
  bannerBox.classList.add("show");
};
// The animation ends at opacity 0, so a finished banner is invisible but still
// sitting in the DOM. Clear it so nothing downstream mistakes it for live state.
bannerBox.addEventListener("animationend", () => {
  bannerBox.classList.remove("show");
  bannerBox.textContent = "";
});

// ---------------------------------------------------------------- deck UI
const ART = [
  '<svg viewBox="0 0 40 40" fill="none"><rect x="12" y="14" width="16" height="15" rx="3" fill="#dcdce4"/><rect x="14" y="7" width="12" height="9" rx="4" fill="#f1c9a0"/><rect x="12" y="5" width="16" height="5" rx="2.5" fill="#c9ced8"/><rect x="29" y="8" width="3.5" height="21" rx="1.7" fill="#eef0f6" transform="rotate(12 29 8)"/><path d="M7 14h7v13l-3.5 3L7 27z" fill="#a8843c"/></svg>',
  '<svg viewBox="0 0 40 40" fill="none"><rect x="12" y="14" width="16" height="15" rx="3" fill="#5f8f52"/><rect x="14" y="7" width="12" height="9" rx="4" fill="#f1c9a0"/><path d="M12 6h16l-2 7H14z" fill="#466b3e"/><path d="M28 8c5 4 5 14 0 18" stroke="#8a5a2c" stroke-width="2.6" fill="none" stroke-linecap="round"/><path d="M28 17h-16" stroke="#e6e0cc" stroke-width="2" stroke-linecap="round"/></svg>',
  '<svg viewBox="0 0 40 40" fill="none"><rect x="7" y="16" width="26" height="13" rx="4" fill="#8a6234"/><rect x="7" y="13" width="26" height="5" rx="2" fill="#5d4326"/><circle cx="12" cy="31" r="4.5" fill="#3d2a17"/><circle cx="28" cy="31" r="4.5" fill="#3d2a17"/><rect x="30" y="19" width="7" height="7" rx="2" fill="#9aa2ae"/></svg>',
];

const cards = [UNIT_SOLDIER, UNIT_ARCHER, UNIT_RAM].map((type) => {
  const button = document.createElement("button");
  button.className = "card";
  button.innerHTML = `<span class="art">${ART[type]}</span><span class="label">${UNIT_NAME[type]}</span><span class="sub"></span><span class="ring hidden"></span>`;
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    requestSpawn(type);
  });
  deck.appendChild(button);
  return { type, button, sub: button.querySelector(".sub"), ring: button.querySelector(".ring"), readyUntil: 0 };
});

/** Cooldowns are predicted locally so the button reacts instantly; the server
 *  still enforces the real one and nacks anything early. */
const cooldownEnd = [0, 0, 0];
function cooldownFor(type) {
  if (!config) return 0;
  const stats = config.units[type];
  return Math.max(assaultActive ? stats.assaultCooldownMs : stats.cooldownMs, 120);
}

function requestSpawn(type) {
  if (matchEnded || !socket || socket.readyState !== WebSocket.OPEN) return;
  const now = performance.now();
  if (now < cooldownEnd[type]) {
    cards[type].button.classList.remove("blocked");
    void cards[type].button.offsetWidth;
    cards[type].button.classList.add("blocked");
    return;
  }
  cooldownEnd[type] = now + cooldownFor(type);
  seq += 1;
  socket.send(JSON.stringify({ type: "spawn", unitType: type, lane: selectedLane, seq }));
  navigator.vibrate?.(8);
}

function refreshDeck() {
  const now = performance.now();
  for (const card of cards) {
    const remaining = cooldownEnd[card.type] - now;
    const nominal = cooldownFor(card.type);
    if (remaining > 60) {
      card.ring.classList.remove("hidden");
      card.ring.textContent = `${(remaining / 1000).toFixed(1)}초`;
      card.button.classList.remove("ready");
    } else {
      card.ring.classList.add("hidden");
      card.button.classList.add("ready");
    }
    const unlimited = nominal <= 130;
    card.sub.textContent = unlimited ? "무제한" : `${(nominal / 1000).toFixed(1)}초`;
    card.sub.style.display = unlimited || nominal ? "" : "none";
  }
}

// ---------------------------------------------------------------- lane picking
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
function pickLane(clientX, clientY) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObject(ground, false)[0];
  if (!hit) return;
  // The hit is in world space; undo the mirror so lanes map back to sim indices.
  const local = root.worldToLocal(hit.point.clone());
  let best = 0;
  let bestGap = Infinity;
  for (let lane = 0; lane < LANE_COUNT; lane += 1) {
    const gap = Math.abs(local.x - laneX(lane));
    if (gap < bestGap) { bestGap = gap; best = lane; }
  }
  if (bestGap > LANE_SPACING) return;
  selectLane(best);
}

function selectLane(lane) {
  if (lane === selectedLane) return;
  selectedLane = lane;
  navigator.vibrate?.(6);
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "lane", lane }));
}

renderer.domElement.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  pickLane(event.clientX, event.clientY);
});

// ---------------------------------------------------------------- gate labels
const gateTags = [];
for (let side = 0; side < 2; side += 1) {
  for (let lane = 0; lane < LANE_COUNT; lane += 1) {
    const tag = document.createElement("div");
    tag.className = `gate-tag ${side === 0 ? "blue" : "red"}`;
    tag.innerHTML = '<span class="num">1000</span><span class="bar"><i style="width:100%"></i></span>';
    gatesLayer.appendChild(tag);
    gateTags[side * LANE_COUNT + lane] = { element: tag, num: tag.querySelector(".num"), fill: tag.querySelector(".bar i") };
  }
}

const projected = new THREE.Vector3();
function layoutGateTags(gateHp) {
  const rect = renderer.domElement.getBoundingClientRect();
  for (let side = 0; side < 2; side += 1) {
    for (let lane = 0; lane < LANE_COUNT; lane += 1) {
      const index = side * LANE_COUNT + lane;
      const tag = gateTags[index];
      const gate = wallGates[side][lane];
      projected.set(0, 6.6, 0);
      gate.group.localToWorld(projected);
      projected.project(camera);
      const x = (projected.x * 0.5 + 0.5) * rect.width;
      const y = (-projected.y * 0.5 + 0.5) * rect.height;
      tag.element.style.left = `${x}px`;
      tag.element.style.top = `${y}px`;
      const hp = gateHp ? gateHp[index] : config?.gateMaxHp ?? 1000;
      const max = config?.gateMaxHp ?? 1000;
      tag.num.textContent = String(hp);
      tag.fill.style.width = `${Math.max(0, Math.min(100, (hp / max) * 100))}%`;
      tag.element.classList.toggle("broken", hp <= 0);
      if (hp <= 0 && !gate.broken) {
        gate.broken = true;
        gate.door.visible = false;
        gate.flag.visible = false;
      }
    }
  }
}

// ---------------------------------------------------------------- networking
function connect() {
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  socket = new WebSocket(`${protocol}://${location.host}/api/rooms/${roomCode}/siege/socket`);
  socket.binaryType = "arraybuffer";

  socket.addEventListener("open", () => {
    reconnectDelay = 250;
    showStatus("");
  });
  socket.addEventListener("message", (event) => {
    if (typeof event.data !== "string") { onSnapshot(event.data); return; }
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (message.type === "welcome") onWelcome(message);
    else if (message.type === "ended") onEnded(message.result);
    else if (message.type === "nack") onNack(message);
  });
  socket.addEventListener("close", () => {
    if (matchEnded) return;
    showStatus("재접속 중…");
    // A refresh that lands after the last gate fell would otherwise retry
    // forever: the socket is refused because the match is over, which looks
    // identical to a network problem. Ask the room what actually happened.
    if (reconnectDelay >= 1000) void checkMatchOver();
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(4000, Math.round(reconnectDelay * 1.7));
  });
  socket.addEventListener("error", () => { try { socket.close(); } catch { /* already closing */ } });
}

async function checkMatchOver() {
  try {
    const response = await fetch(`/api/rooms/${roomCode}`, { credentials: "include" });
    if (!response.ok) return;
    const body = await response.json();
    if (body?.room?.view !== "result") return;
    matchEnded = true;
    const result = body.room.game?.siegeWar?.result;
    const mine = body.room.game?.siegeWar?.myTeam;
    const label = !result || result.winner === "draw" ? "무승부" : result.winner === mine ? "승리!" : "패배";
    showStatus(`<b style="font-size:20px">${label}</b><br><span style="opacity:.8">경기가 끝났어요</span>`);
  } catch { /* keep retrying the socket */ }
}

function onWelcome(message) {
  mySide = message.you.side;
  config = message.config;
  selectedLane = message.you.lane ?? 1;
  // One rotation delivers both "my wall at the bottom" and the left/right flip.
  root.rotation.y = mySide === 1 ? Math.PI : 0;
  document.getElementById("hp-left").classList.toggle("blue", true);
  showStatus("");
  refreshDeck();
}

function onNack(message) {
  if (message.reason === "cooldown") return;
  const card = cards.find((entry) => entry.readyUntil >= 0);
  if (card) {
    card.button.classList.remove("blocked");
    void card.button.offsetWidth;
    card.button.classList.add("blocked");
  }
  // A rejected spawn must not also cost the player their cooldown.
  if (message.reason === "lane-full" || message.reason === "team-full") {
    for (let type = 0; type < 3; type += 1) cooldownEnd[type] = Math.min(cooldownEnd[type], performance.now() + 200);
  }
}

function onSnapshot(buffer) {
  const snapshot = decodeSnapshot(buffer);
  snapshot.index = new Map();
  for (let i = 0; i < snapshot.unitCount; i += 1) snapshot.index.set(snapshot.ids[i], i);
  snapshots.push(snapshot);
  while (snapshots.length > 4) snapshots.shift();

  if (!latestTick) playTick = snapshot.tick - INTERP_TICKS;
  latestTick = snapshot.tick;

  if (snapshot.assaultActive && !assaultActive) showBanner("총공세!", "#ffd34d");
  assaultActive = snapshot.assaultActive;
  if (snapshot.suddenDeath && !suddenDeath) showBanner("서든데스", "#ff7a7a");
  suddenDeath = snapshot.suddenDeath;

  for (const event of snapshot.events) {
    if (event.kind === EVENT_SPAWN) spawnFlash.set(event.unitId, performance.now());
    else if (event.kind === EVENT_GATE_BREAK) showBanner("성문 격파!", "#ff9a4d");
  }
  handleDepartures(snapshot);
}

/** Anything that left the stream since the previous snapshot fell over. */
let previousSnapshot = null;
function handleDepartures(snapshot) {
  if (previousSnapshot) {
    for (let i = 0; i < previousSnapshot.unitCount; i += 1) {
      const id = previousSnapshot.ids[i];
      if (snapshot.index.has(id)) continue;
      dying.set(id, {
        x: laneX(previousSnapshot.lanes[i]) + previousSnapshot.xoffs[i] / 1000,
        z: simToZ(previousSnapshot.ys[i]),
        type: previousSnapshot.types[i],
        team: previousSnapshot.teams[i],
        at: performance.now(),
      });
      lastState.delete(id);
    }
  }
  // Archers fire from a standstill, so a fresh attack state is the cue for an arrow.
  for (let i = 0; i < snapshot.unitCount; i += 1) {
    const id = snapshot.ids[i];
    const state = snapshot.states[i];
    if (snapshot.types[i] === UNIT_ARCHER && state === STATE_ATTACK && lastState.get(id) !== STATE_ATTACK) {
      launchArrow(snapshot, i);
    }
    if (state === STATE_ATTACK && lastState.get(id) !== state) hitFlash.set(id, performance.now());
    lastState.set(id, state);
  }
  previousSnapshot = snapshot;
}

function launchArrow(snapshot, index) {
  if (arrows.length >= ARROW_POOL) return;
  const lane = snapshot.lanes[index];
  const team = snapshot.teams[index];
  const fromZ = simToZ(snapshot.ys[index]);
  let targetZ = null;
  let bestGap = Infinity;
  for (let other = 0; other < snapshot.unitCount; other += 1) {
    if (snapshot.teams[other] === team || snapshot.lanes[other] !== lane) continue;
    const gap = Math.abs(simToZ(snapshot.ys[other]) - fromZ);
    if (gap < bestGap) { bestGap = gap; targetZ = simToZ(snapshot.ys[other]); }
  }
  if (targetZ === null) return;
  arrows.push({
    fromX: laneX(lane) + snapshot.xoffs[index] / 1000,
    fromZ,
    toX: laneX(lane),
    toZ: targetZ,
    at: performance.now(),
    dur: 190,
  });
}

function onEnded(result) {
  matchEnded = true;
  const label = result.winner === "draw" ? "무승부" : (result.winner === "A" ? 0 : 1) === mySide ? "승리!" : "패배";
  showBanner(label, result.winner === "draw" ? "#ffd34d" : label === "승리!" ? "#7ee87e" : "#ff7a7a");
  showStatus(`<b style="font-size:20px">${label}</b><br><span style="opacity:.8">잠시 후 결과 화면으로 이동해요</span>`);
}

// ---------------------------------------------------------------- render loop
function sampleUnits(now) {
  // Walk back from the newest snapshot to the pair bracketing the playback head.
  let older = null;
  let newer = null;
  for (let index = snapshots.length - 1; index >= 0; index -= 1) {
    if (snapshots[index].tick <= playTick) { older = snapshots[index]; newer = snapshots[index + 1] ?? snapshots[index]; break; }
  }
  if (!older) { older = snapshots[0]; newer = snapshots[0]; }
  if (!older) return;

  const span = Math.max(1, newer.tick - older.tick);
  const alpha = Math.max(0, Math.min(1, (playTick - older.tick) / span));

  const counts = [0, 0, 0, 0, 0, 0];
  let shadowCount = 0;
  let barCount = 0;

  for (let i = 0; i < older.unitCount; i += 1) {
    const id = older.ids[i];
    const j = newer.index.get(id);
    const type = older.types[i];
    const team = older.teams[i];
    const lane = older.lanes[i];
    const xoff = older.xoffs[i] / 1000;
    const z = j === undefined
      ? simToZ(older.ys[i])
      : simToZ(older.ys[i] + (newer.ys[j] - older.ys[i]) * alpha);
    const x = laneX(lane) + xoff;
    const state = j === undefined ? older.states[i] : newer.states[j];
    const hp = j === undefined ? older.hps[i] : newer.hps[j];

    const facing = team === 0 ? 0 : Math.PI;
    let bob = 0;
    let lunge = 0;
    if (state === STATE_MOVE) bob = Math.abs(Math.sin(now * 0.011 + id * 0.7)) * 0.09;
    else if (state === STATE_ATTACK || state === STATE_ATTACK_GATE) lunge = Math.sin(now * 0.018 + id) * 0.14;

    dummy.position.set(x, bob, z + (team === 0 ? lunge : -lunge));
    dummy.rotation.set(0, facing, 0);
    dummy.scale.setScalar(UNIT_SCALE[type] * spawnScale(id, now));
    dummy.updateMatrix();

    const meshIndex = team * 3 + type;
    const mesh = unitMeshes[meshIndex];
    const slot = counts[meshIndex]++;
    mesh.setMatrixAt(slot, dummy.matrix);
    const flashedAt = hitFlash.get(id);
    const flashing = flashedAt !== undefined && now - flashedAt < FLASH_MS;
    mesh.setColorAt(slot, flashing ? FLASH_TINT[team] : TEAM_TINT[team]);

    dummy.position.set(x, 0.02, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(type === UNIT_RAM ? 1.7 : 1);
    dummy.updateMatrix();
    shadowMesh.setMatrixAt(shadowCount++, dummy.matrix);

    // Full-HP units deliberately carry no bar: an army of bars is unreadable.
    const maxHp = UNIT_MAX_HP[type];
    if (hp > 0 && hp < maxHp) {
      const width = type === UNIT_RAM ? 1.5 : 0.9;
      const height = 0.14;
      const top = (type === UNIT_RAM ? 1.6 : 1.5) + 0.2;
      dummy.rotation.set(-Math.PI / 3.1, 0, 0);
      dummy.position.set(x, top, z);
      dummy.scale.set(width, height, 1);
      dummy.updateMatrix();
      barBack.setMatrixAt(barCount, dummy.matrix);
      const ratio = Math.max(0.02, hp / maxHp);
      dummy.position.set(x - (width * (1 - ratio)) / 2, top + 0.001, z - 0.01);
      dummy.scale.set(width * ratio, height * 0.66, 1);
      dummy.updateMatrix();
      barFill.setMatrixAt(barCount, dummy.matrix);
      barCount += 1;
    }
  }

  // Fallen units keep their last position and topple out over a fraction of a second.
  for (const [id, entry] of dying) {
    const age = now - entry.at;
    if (age > DEATH_MS) { dying.delete(id); continue; }
    const progress = age / DEATH_MS;
    const meshIndex = entry.team * 3 + entry.type;
    const mesh = unitMeshes[meshIndex];
    const slot = counts[meshIndex]++;
    if (slot >= MAX_INSTANCES) continue;
    dummy.position.set(entry.x, -progress * 0.5, entry.z);
    dummy.rotation.set(progress * 1.5, entry.team === 0 ? 0 : Math.PI, progress * 0.4);
    dummy.scale.setScalar(UNIT_SCALE[entry.type] * (1 - progress * 0.35));
    dummy.updateMatrix();
    mesh.setMatrixAt(slot, dummy.matrix);
    tintColor.copy(TEAM_TINT[entry.team]).multiplyScalar(1 - progress * 0.5);
    mesh.setColorAt(slot, tintColor);
  }

  for (let index = 0; index < unitMeshes.length; index += 1) {
    const mesh = unitMeshes[index];
    mesh.count = Math.min(counts[index], MAX_INSTANCES);
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
  shadowMesh.count = shadowCount;
  shadowMesh.instanceMatrix.needsUpdate = true;
  barBack.count = barCount;
  barFill.count = barCount;
  barBack.instanceMatrix.needsUpdate = true;
  barFill.instanceMatrix.needsUpdate = true;

  return newer;
}

function spawnScale(id, now) {
  const at = spawnFlash.get(id);
  if (at === undefined) return 1;
  const age = now - at;
  if (age > SPAWN_MS) { spawnFlash.delete(id); return 1; }
  return 0.45 + 0.55 * (age / SPAWN_MS);
}

function updateArrows(now) {
  let count = 0;
  for (let index = arrows.length - 1; index >= 0; index -= 1) {
    const arrow = arrows[index];
    const progress = (now - arrow.at) / arrow.dur;
    if (progress >= 1) { arrows.splice(index, 1); continue; }
    const x = arrow.fromX + (arrow.toX - arrow.fromX) * progress;
    const z = arrow.fromZ + (arrow.toZ - arrow.fromZ) * progress;
    const y = 1.15 + Math.sin(progress * Math.PI) * 1.1;
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, Math.atan2(arrow.toX - arrow.fromX, arrow.toZ - arrow.fromZ), 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    arrowMesh.setMatrixAt(count++, dummy.matrix);
  }
  arrowMesh.count = count;
  arrowMesh.instanceMatrix.needsUpdate = true;
}

function updateHud(snapshot) {
  if (!snapshot) return;
  const total = (side) => snapshot.gateHp[side * 3] + snapshot.gateHp[side * 3 + 1] + snapshot.gateHp[side * 3 + 2];
  // Blue is always team A; the labels do not swap with the camera.
  document.querySelector("#hp-left .value").textContent = String(total(0));
  document.querySelector("#hp-right .value").textContent = String(total(1));

  const remaining = Math.max(0, snapshot.remainingMs);
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  clockBox.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  clockBox.classList.toggle("urgent", !snapshot.suddenDeath && remaining <= 60000);
  clockBox.classList.toggle("sudden", snapshot.suddenDeath);
  layoutGateTags(snapshot.gateHp);
}

let lastFrame = performance.now();
function frame() {
  requestAnimationFrame(frame);
  step();
}

/** One complete frame. Split out so debug tooling can drive it by hand when the
 *  tab is backgrounded and requestAnimationFrame is throttled. */
function step() {
  const now = performance.now();
  const delta = Math.min(120, now - lastFrame);
  lastFrame = now;

  // Self-correcting playback: nudge the rate to hold ~1.5 snapshots of buffer
  // rather than trying to synchronise clocks with the server.
  if (latestTick) {
    const target = latestTick - INTERP_TICKS;
    const drift = target - playTick;
    const rate = 1 + Math.max(-0.25, Math.min(0.25, drift * 0.08));
    playTick += (delta / TICK_MS) * rate;
    if (Math.abs(drift) > 12) playTick = target;
  }

  for (let lane = 0; lane < LANE_COUNT; lane += 1) {
    const active = lane === selectedLane;
    const glow = laneGroups[lane].glow.material;
    const goal = active ? 0.13 + Math.sin(now * 0.004) * 0.035 : 0;
    glow.opacity += (goal - glow.opacity) * 0.18;
  }

  const newest = sampleUnits(now);
  updateArrows(now);
  updateHud(newest ?? snapshots[snapshots.length - 1]);
  refreshDeck();
  renderer.render(scene, camera);
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  // A portrait phone is narrow, so the horizontal field of view is what actually
  // clips the outer lanes; widen the lens until all three fit.
  camera.fov = height > width ? 31 : 22;
  camera.updateProjectionMatrix();
  camera.lookAt(0, 0, CAMERA_TARGET_Z);
}
window.addEventListener("resize", resize);
resize();

if (!roomCode) showStatus("방 정보를 찾을 수 없어요.");
else connect();
frame();

if (debugMode) {
  window.siegeDebug = {
    snapshots, arrows, dying, camera, scene, renderer, unitMeshes,
    step,
    /** Jump playback to the newest snapshot — used when capturing stills. */
    catchUp() { if (latestTick) playTick = latestTick - INTERP_TICKS; },
    frameCamera(height, back, targetZ, fov) {
      camera.position.set(0, height, back);
      if (fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
      camera.lookAt(0, 0, targetZ);
    },
    get playTick() { return playTick; },
    get selectedLane() { return selectedLane; },
    setLane: selectLane,
    spawn: requestSpawn,
    /** Stage a battlefield state. Only honoured by a debug room (bot seats). */
    debug(command) {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "debug", ...command }));
    },
  };
}
