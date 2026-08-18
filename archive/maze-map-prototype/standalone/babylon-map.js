(() => {
  "use strict";

  const B = window.BABYLON;
  const canvas = document.getElementById("map-canvas");
  const loading = document.getElementById("loading");
  const mapTitle = document.getElementById("map-title");
  const mapSubtitle = document.getElementById("map-subtitle");
  const mapButtons = [...document.querySelectorAll("[data-map]")];

  if (!B) {
    loading.textContent = "3D 엔진을 불러오지 못했습니다.";
    return;
  }

  const GRID = 19;
  const HALF_GRID = (GRID - 1) / 2;
  const ASSET_ROOT = "./assets/pbr/";
  const THEMES = {
    ice: {
      title: "빙하 연구기지",
      subtitle: "단단한 반투명 얼음과 사실적인 적설이 쌓인 기지",
      clear: new B.Color4(0.008, 0.045, 0.08, 1),
      fog: new B.Color3(0.025, 0.12, 0.19),
    },
    lava: {
      title: "화산 제련소",
      subtitle: "현무암 벽체의 네 면을 타고 용암이 흐르는 제련소",
      clear: new B.Color4(0.035, 0.006, 0.004, 1),
      fog: new B.Color3(0.12, 0.018, 0.008),
    },
    space: {
      title: "무중력 정거장",
      subtitle: "황금 메탈 벽체 위에 태양계 행성이 떠 있는 우주 기지",
      clear: new B.Color4(0.002, 0.004, 0.025, 1),
      fog: new B.Color3(0.005, 0.008, 0.035),
    },
  };

  const engine = new B.Engine(canvas, true, {
    preserveDrawingBuffer: false,
    stencil: true,
    antialias: true,
    adaptToDeviceRatio: true,
  });
  engine.setHardwareScalingLevel(Math.max(1, Math.min(1.65, window.devicePixelRatio || 1)));

  const scene = new B.Scene(engine);
  scene.clearColor = THEMES.ice.clear;
  scene.skipPointerMovePicking = true;
  scene.imageProcessingConfiguration.toneMappingEnabled = true;
  scene.imageProcessingConfiguration.toneMappingType = B.ImageProcessingConfiguration.TONEMAPPING_ACES;
  scene.imageProcessingConfiguration.exposure = 0.88;
  scene.imageProcessingConfiguration.contrast = 1.08;

  const camera = new B.ArcRotateCamera(
    "camera",
    Math.PI * 0.25,
    Math.PI * 0.325,
    27,
    new B.Vector3(0, 0.4, 0),
    scene,
  );
  camera.attachControl(canvas, true);
  camera.lowerRadiusLimit = 18;
  camera.upperRadiusLimit = 37;
  camera.lowerBetaLimit = 0.62;
  camera.upperBetaLimit = 1.28;
  camera.wheelDeltaPercentage = 0.012;
  camera.panningSensibility = 0;

  const hemi = new B.HemisphericLight("hemi", new B.Vector3(0, 1, 0), scene);
  hemi.intensity = 0.72;
  hemi.groundColor = new B.Color3(0.055, 0.07, 0.11);

  const keyLight = new B.DirectionalLight("key", new B.Vector3(-0.55, -1, -0.35), scene);
  keyLight.position = new B.Vector3(10, 20, 14);
  keyLight.intensity = 1.35;

  const fillLight = new B.DirectionalLight("fill", new B.Vector3(0.45, -0.7, 0.55), scene);
  fillLight.position = new B.Vector3(-12, 13, -12);
  fillLight.intensity = 0.42;

  try {
    scene.environmentTexture = B.CubeTexture.CreateFromPrefilteredData(
      "https://assets.babylonjs.com/environments/environmentSpecular.env",
      scene,
    );
    scene.environmentIntensity = 0.5;
  } catch {
    scene.environmentTexture = null;
  }

  const pipeline = new B.DefaultRenderingPipeline("pipeline", true, scene, [camera]);
  pipeline.samples = 2;
  pipeline.fxaaEnabled = true;
  pipeline.bloomEnabled = true;
  pipeline.bloomThreshold = 1.04;
  pipeline.bloomWeight = 0.12;
  pipeline.bloomKernel = 32;
  pipeline.bloomScale = 0.5;

  const glow = new B.GlowLayer("glow", scene, { blurKernelSize: 48 });
  glow.intensity = 0.18;

  let mapRoot = null;
  let themeResources = [];
  let effects = [];
  let elapsed = 0;

  function track(resource) {
    themeResources.push(resource);
    return resource;
  }

  function gridToWorld(x, z) {
    return { x: x - HALF_GRID, z: z - HALF_GRID };
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function createRoundedBox(name, width, height, depth, radius, parent, segments = 3) {
    const mesh = new B.Mesh(name, scene);
    mesh.parent = parent;
    const hx = width / 2;
    const hy = height / 2;
    const hz = depth / 2;
    const ix = Math.max(0.001, hx - radius);
    const iy = Math.max(0.001, hy - radius);
    const iz = Math.max(0.001, hz - radius);
    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];

    const faces = [
      (u, v) => [hx, -hy + v * height, -hz + u * depth],
      (u, v) => [-hx, -hy + v * height, hz - u * depth],
      (u, v) => [-hx + u * width, hy, -hz + v * depth],
      (u, v) => [-hx + u * width, -hy, hz - v * depth],
      (u, v) => [-hx + u * width, -hy + v * height, hz],
      (u, v) => [hx - u * width, -hy + v * height, -hz],
    ];

    faces.forEach((face) => {
      const base = positions.length / 3;
      for (let y = 0; y <= segments; y += 1) {
        for (let x = 0; x <= segments; x += 1) {
          const u = x / segments;
          const v = y / segments;
          const raw = face(u, v);
          const closest = [
            clamp(raw[0], -ix, ix),
            clamp(raw[1], -iy, iy),
            clamp(raw[2], -iz, iz),
          ];
          let nx = raw[0] - closest[0];
          let ny = raw[1] - closest[1];
          let nz = raw[2] - closest[2];
          const length = Math.hypot(nx, ny, nz) || 1;
          nx /= length;
          ny /= length;
          nz /= length;
          positions.push(
            closest[0] + nx * radius,
            closest[1] + ny * radius,
            closest[2] + nz * radius,
          );
          normals.push(nx, ny, nz);
          uvs.push(u, v);
        }
      }
      for (let y = 0; y < segments; y += 1) {
        for (let x = 0; x < segments; x += 1) {
          const a = base + y * (segments + 1) + x;
          const b = a + 1;
          const c = a + segments + 1;
          const d = c + 1;
          indices.push(a, c, b, b, c, d);
        }
      }
    });

    const data = new B.VertexData();
    data.positions = positions;
    data.normals = normals;
    data.uvs = uvs;
    data.indices = indices;
    data.applyToMesh(mesh);
    return mesh;
  }

  function texture(path, scale = 1) {
    const result = track(new B.Texture(`${ASSET_ROOT}${path}`, scene, true, false));
    result.wrapU = B.Texture.WRAP_ADDRESSMODE;
    result.wrapV = B.Texture.WRAP_ADDRESSMODE;
    result.uScale = scale;
    result.vScale = scale;
    return result;
  }

  function pbr(name, options = {}) {
    const material = track(new B.PBRMaterial(name, scene));
    material.albedoColor = options.color || B.Color3.White();
    material.metallic = options.metallic ?? 0;
    material.roughness = options.roughness ?? 0.55;
    material.environmentIntensity = options.environmentIntensity ?? 0.8;
    if (options.albedoTexture) material.albedoTexture = options.albedoTexture;
    if (options.bumpTexture) {
      material.bumpTexture = options.bumpTexture;
      material.bumpTexture.level = options.bumpLevel ?? 1;
    }
    if (options.emissive) {
      material.emissiveColor = options.emissive;
      material.emissiveIntensity = options.emissiveIntensity ?? 1;
    }
    if (options.alpha !== undefined) {
      material.alpha = options.alpha;
      material.transparencyMode = B.PBRMaterial.PBRMATERIAL_ALPHABLEND;
      material.backFaceCulling = false;
    }
    return material;
  }

  function createThemeMaterials(kind) {
    if (kind === "ice") {
      const snowNormal = texture("snow_02-normal.jpg", 1.5);
      const floorIce = pbr("floorIce", {
        color: new B.Color3(0.2, 0.5, 0.68),
        roughness: 0.28,
        metallic: 0.02,
        alpha: 0.97,
        environmentIntensity: 0.58,
      });
      floorIce.indexOfRefraction = 1.31;
      floorIce.clearCoat.isEnabled = true;
      floorIce.clearCoat.intensity = 0.42;
      floorIce.clearCoat.roughness = 0.18;
      const wallIce = pbr("wallIce", {
        color: new B.Color3(0.42, 0.72, 0.86),
        roughness: 0.22,
        metallic: 0.01,
        alpha: 0.95,
        environmentIntensity: 0.64,
      });
      wallIce.indexOfRefraction = 1.31;
      wallIce.clearCoat.isEnabled = true;
      wallIce.clearCoat.intensity = 0.5;
      wallIce.clearCoat.roughness = 0.16;
      const frostedFloor = pbr("frostedFloor", {
        color: new B.Color3(0.52, 0.77, 0.86),
        roughness: 0.58,
        bumpTexture: snowNormal,
        bumpLevel: 0.32,
      });
      const snow = track(new B.StandardMaterial("powderSnow", scene));
      snow.diffuseColor = new B.Color3(0.94, 0.975, 1);
      snow.ambientColor = new B.Color3(0.62, 0.7, 0.78);
      snow.emissiveColor = new B.Color3(0.14, 0.17, 0.2);
      snow.specularColor = new B.Color3(0.08, 0.1, 0.12);
      snow.specularPower = 18;
      snow.bumpTexture = snowNormal;
      snow.bumpTexture.level = 0.48;
      return {
        floorA: floorIce,
        floorB: floorIce,
        wall: wallIce,
        floorTopA: frostedFloor,
        floorTopB: frostedFloor,
        wallTop: snow,
        base: pbr("iceBase", { color: new B.Color3(0.06, 0.22, 0.31), roughness: 0.5 }),
        edge: new B.Color4(0.22, 0.72, 0.94, 0.78),
      };
    }

    if (kind === "lava") {
      const rockDiffuse = texture("volcanic_rock_tiles-diffuse.jpg", 1.2);
      const rockNormal = texture("volcanic_rock_tiles-normal.jpg", 1.2);
      const floorRock = pbr("volcanicFloor", {
        color: new B.Color3(0.42, 0.27, 0.22),
        roughness: 0.9,
        albedoTexture: rockDiffuse,
        bumpTexture: rockNormal,
        bumpLevel: 1.05,
        environmentIntensity: 0.26,
      });
      const wallRock = pbr("volcanicWall", {
        color: new B.Color3(0.72, 0.48, 0.39),
        roughness: 0.94,
        albedoTexture: rockDiffuse,
        bumpTexture: rockNormal,
        bumpLevel: 1.55,
        environmentIntensity: 0.22,
      });
      return {
        floorA: floorRock,
        floorB: floorRock,
        wall: wallRock,
        floorTopA: floorRock,
        floorTopB: floorRock,
        wallTop: wallRock,
        base: pbr("lavaBase", { color: new B.Color3(0.045, 0.008, 0.005), roughness: 0.95 }),
        edge: new B.Color4(0.5, 0.08, 0.025, 0.8),
      };
    }

    const metalDiffuse = texture("metal_plate_02-diffuse.jpg", 1.35);
    const metalNormal = texture("metal_plate_02-normal.jpg", 1.35);
    const floorGold = pbr("goldFloor", {
      color: new B.Color3(0.32, 0.15, 0.025),
      metallic: 0.9,
      roughness: 0.39,
      albedoTexture: metalDiffuse,
      bumpTexture: metalNormal,
      bumpLevel: 0.5,
      environmentIntensity: 0.62,
    });
    const wallGold = pbr("goldWall", {
      color: new B.Color3(0.72, 0.43, 0.085),
      metallic: 0.96,
      roughness: 0.25,
      albedoTexture: metalDiffuse,
      bumpTexture: metalNormal,
      bumpLevel: 0.78,
      environmentIntensity: 0.76,
    });
    return {
      floorA: floorGold,
      floorB: floorGold,
      wall: wallGold,
      floorTopA: floorGold,
      floorTopB: floorGold,
      wallTop: wallGold,
      base: pbr("spaceBase", { color: new B.Color3(0.055, 0.036, 0.008), metallic: 0.82, roughness: 0.35 }),
      edge: new B.Color4(0.98, 0.66, 0.13, 0.72),
    };
  }

  function createWallLayout(kind) {
    const walls = new Set();
    const add = (x, z) => walls.add(`${x},${z}`);
    const lineX = (x1, x2, z) => {
      for (let x = x1; x <= x2; x += 1) add(x, z);
    };
    const lineZ = (z1, z2, x) => {
      for (let z = z1; z <= z2; z += 1) add(x, z);
    };

    for (let i = 0; i < GRID; i += 1) {
      if (i < 8 || i > 10) {
        add(i, 0);
        add(i, GRID - 1);
        add(0, i);
        add(GRID - 1, i);
      }
    }

    if (kind === "ice") {
      lineX(2, 6, 4); lineX(12, 16, 4);
      lineX(3, 7, 8); lineX(11, 15, 8);
      lineX(3, 7, 10); lineX(11, 15, 10);
      lineX(2, 6, 14); lineX(12, 16, 14);
      lineZ(3, 6, 4); lineZ(12, 15, 4);
      lineZ(3, 6, 14); lineZ(12, 15, 14);
    } else if (kind === "lava") {
      lineX(3, 7, 3); lineX(11, 15, 3);
      lineX(2, 5, 7); lineX(13, 16, 7);
      lineX(2, 5, 11); lineX(13, 16, 11);
      lineX(3, 7, 15); lineX(11, 15, 15);
      lineZ(4, 8, 6); lineZ(10, 14, 6);
      lineZ(4, 8, 12); lineZ(10, 14, 12);
    } else {
      lineX(2, 5, 5); lineX(13, 16, 5);
      lineX(5, 7, 7); lineX(11, 13, 7);
      lineX(5, 7, 11); lineX(11, 13, 11);
      lineX(2, 5, 13); lineX(13, 16, 13);
      lineZ(2, 5, 5); lineZ(13, 16, 5);
      lineZ(5, 7, 7); lineZ(11, 13, 7);
      lineZ(5, 7, 11); lineZ(11, 13, 11);
    }

    [[8, 0], [9, 0], [10, 0], [8, 18], [9, 18], [10, 18],
      [0, 8], [0, 9], [0, 10], [18, 8], [18, 9], [18, 10]].forEach(([x, z]) => {
      walls.delete(`${x},${z}`);
    });
    return walls;
  }

  function placeInstances(name, createSource, material, positions) {
    if (!positions.length) return;
    const source = createSource(`${name}-source`);
    source.material = material;
    source.position.copyFrom(positions[0]);
    source.receiveShadows = true;
    source.parent = mapRoot;
    for (let index = 1; index < positions.length; index += 1) {
      const instance = source.createInstance(`${name}-${index}`);
      instance.position.copyFrom(positions[index]);
      instance.parent = mapRoot;
    }
  }

  function addMapBlocks(kind, materials) {
    const base = createRoundedBox("base", GRID + 0.5, 0.72, GRID + 0.5, 0.22, mapRoot, 4);
    base.position.y = -0.72;
    base.material = materials.base;

    const floorEven = [];
    const floorOdd = [];
    const floorTopEven = [];
    const floorTopOdd = [];
    for (let z = 0; z < GRID; z += 1) {
      for (let x = 0; x < GRID; x += 1) {
        const p = gridToWorld(x, z);
        const target = (x + z) % 2 ? floorOdd : floorEven;
        const topTarget = (x + z) % 2 ? floorTopOdd : floorTopEven;
        target.push(new B.Vector3(p.x, -0.2, p.z));
        topTarget.push(new B.Vector3(p.x, -0.015, p.z));
      }
    }

    placeInstances("floorA", (name) => createRoundedBox(name, 0.94, 0.3, 0.94, 0.08, mapRoot), materials.floorA, floorEven);
    placeInstances("floorB", (name) => createRoundedBox(name, 0.94, 0.3, 0.94, 0.08, mapRoot), materials.floorB, floorOdd);
    placeInstances("floorTopA", (name) => createRoundedBox(name, 0.83, 0.045, 0.83, 0.025, mapRoot), materials.floorTopA, floorTopEven);
    placeInstances("floorTopB", (name) => createRoundedBox(name, 0.83, 0.045, 0.83, 0.025, mapRoot), materials.floorTopB, floorTopOdd);

    const wallPositions = [...createWallLayout(kind)].map((key) => {
      const [x, z] = key.split(",").map(Number);
      const p = gridToWorld(x, z);
      return new B.Vector3(p.x, 0.61, p.z);
    });
    const wallTopPositions = wallPositions.map((position) => new B.Vector3(position.x, kind === "ice" ? 1.43 : 1.4, position.z));
    placeInstances("walls", (name) => createRoundedBox(name, 0.92, 1.48, 0.92, kind === "lava" ? 0.15 : 0.1, mapRoot, 4), materials.wall, wallPositions);
    placeInstances(
      "wallTops",
      (name) => createRoundedBox(name, kind === "ice" ? 0.9 : 0.82, kind === "ice" ? 0.14 : 0.08, kind === "ice" ? 0.9 : 0.82, 0.035, mapRoot),
      materials.wallTop,
      wallTopPositions,
    );

    if (kind === "ice") {
      const moundSpecs = [];
      wallPositions.forEach((position, index) => {
        const angle = index * 1.73;
        moundSpecs.push({
          position: new B.Vector3(
            position.x + Math.sin(angle) * 0.16,
            1.515 + (index % 3) * 0.006,
            position.z + Math.cos(angle) * 0.14,
          ),
          scaling: new B.Vector3(0.9 + (index % 4) * 0.06, 0.16 + (index % 3) * 0.025, 0.82),
        });
        moundSpecs.push({
          position: new B.Vector3(
            position.x - Math.cos(angle) * 0.15,
            1.505,
            position.z + Math.sin(angle) * 0.13,
          ),
          scaling: new B.Vector3(0.72, 0.13 + (index % 2) * 0.025, 0.68 + (index % 3) * 0.05),
        });
      });

      const moundSource = B.MeshBuilder.CreateSphere("snowMound-source", { diameter: 0.56, segments: 12 }, scene);
      moundSource.parent = mapRoot;
      moundSource.material = materials.wallTop;
      moundSource.position.copyFrom(moundSpecs[0].position);
      moundSource.scaling.copyFrom(moundSpecs[0].scaling);
      for (let index = 1; index < moundSpecs.length; index += 1) {
        const mound = moundSource.createInstance(`snowMound-${index}`);
        mound.parent = mapRoot;
        mound.position.copyFrom(moundSpecs[index].position);
        mound.scaling.copyFrom(moundSpecs[index].scaling);
      }

      wallPositions.forEach((position, index) => {
        if (index % 3 !== 0) return;
        const face = index % 4;
        const alongX = face < 2;
        const overhang = createRoundedBox(
          `snowOverhang-${index}`,
          alongX ? 0.64 : 0.085,
          0.18,
          alongX ? 0.085 : 0.64,
          0.035,
          mapRoot,
          3,
        );
        overhang.material = materials.wallTop;
        overhang.position.set(position.x, 1.34, position.z);

        if (face === 0) overhang.position.z += 0.455;
        if (face === 1) overhang.position.z -= 0.455;
        if (face === 2) overhang.position.x += 0.455;
        if (face === 3) overhang.position.x -= 0.455;

        const lobe = B.MeshBuilder.CreateSphere(`snowLobe-${index}`, { diameter: 0.2, segments: 8 }, scene);
        lobe.parent = mapRoot;
        lobe.material = materials.wallTop;
        lobe.position.copyFrom(overhang.position);
        lobe.position.y = 1.25;
        if (alongX) {
          lobe.position.x += ((index % 5) - 2) * 0.07;
          lobe.scaling.set(0.95, 0.78, 0.38);
        } else {
          lobe.position.z += ((index % 5) - 2) * 0.07;
          lobe.scaling.set(0.38, 0.78, 0.95);
        }
      });
    }
  }

  function emissiveMaterial(name, color, intensity = 1) {
    return pbr(name, {
      color,
      roughness: 0.25,
      emissive: color,
      emissiveIntensity: intensity,
      environmentIntensity: 0.3,
    });
  }

  function addPadsAndObjective(kind) {
    const entranceMaterial = emissiveMaterial("entrance", new B.Color3(0.04, 0.58, 0.18), 1);
    const storageMaterial = emissiveMaterial("storage", new B.Color3(0.72, 0.31, 0.025), 1);
    const objectiveColors = {
      ice: new B.Color3(0.2, 0.9, 1),
      lava: new B.Color3(1, 0.12, 0.015),
      space: new B.Color3(0.6, 0.35, 1),
    };
    const objectiveMaterial = emissiveMaterial("objective", objectiveColors[kind].scale(0.65), 1.4);

    [[9, 0], [9, 18], [0, 9], [18, 9]].forEach(([x, z]) => {
      const p = gridToWorld(x, z);
      const pad = createRoundedBox("entrancePad", 0.76, 0.07, 0.76, 0.06, mapRoot);
      pad.position.set(p.x, 0.04, p.z);
      pad.material = entranceMaterial;
    });

    [[3, 3], [15, 3], [3, 15], [15, 15]].forEach(([x, z]) => {
      const p = gridToWorld(x, z);
      const pad = createRoundedBox("storagePad", 0.76, 0.07, 0.76, 0.06, mapRoot);
      pad.position.set(p.x, 0.04, p.z);
      pad.material = storageMaterial;
    });

    const pedestal = B.MeshBuilder.CreateCylinder("pedestal", {
      height: 0.46,
      diameterTop: 2.15,
      diameterBottom: 2.45,
      tessellation: 20,
    }, scene);
    pedestal.parent = mapRoot;
    pedestal.position.y = 0.26;
    pedestal.material = kind === "lava" ? storageMaterial : objectiveMaterial;

    let core;
    if (kind === "ice") {
      core = B.MeshBuilder.CreatePolyhedron("iceCore", { type: 1, size: 0.72 }, scene);
      core.scaling.y = 1.35;
    } else {
      core = B.MeshBuilder.CreateSphere("core", { diameter: 1.22, segments: 24 }, scene);
    }
    core.parent = mapRoot;
    core.position.y = 1.06;
    core.material = objectiveMaterial;
    effects.push((time) => {
      core.rotation.y = time * 0.42;
      core.position.y = 1.06 + Math.sin(time * 1.7) * 0.08;
    });
  }

  function createParticleTexture(name, colorA, colorB) {
    const dynamic = track(new B.DynamicTexture(name, { width: 64, height: 64 }, scene, false));
    const context = dynamic.getContext();
    const gradient = context.createRadialGradient(32, 32, 1, 32, 32, 31);
    gradient.addColorStop(0, colorA);
    gradient.addColorStop(0.25, colorB);
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
    dynamic.update();
    return dynamic;
  }

  function addSnow() {
    const snowTexture = createParticleTexture("snowParticle", "rgba(255,255,255,1)", "rgba(220,245,255,.86)");
    const particles = track(new B.ParticleSystem("snow", 520, scene));
    particles.particleTexture = snowTexture;
    particles.emitter = new B.Vector3(0, 11, 0);
    particles.minEmitBox = new B.Vector3(-12, 0, -12);
    particles.maxEmitBox = new B.Vector3(12, 0, 12);
    particles.color1 = new B.Color4(0.92, 0.98, 1, 0.92);
    particles.color2 = new B.Color4(0.72, 0.9, 1, 0.7);
    particles.minSize = 0.035;
    particles.maxSize = 0.12;
    particles.minLifeTime = 4;
    particles.maxLifeTime = 7;
    particles.emitRate = 115;
    particles.gravity = new B.Vector3(0.15, -1.6, 0.08);
    particles.direction1 = new B.Vector3(-0.15, -1, -0.08);
    particles.direction2 = new B.Vector3(0.25, -1, 0.13);
    particles.minAngularSpeed = 0;
    particles.maxAngularSpeed = 2;
    particles.start();
  }

  B.Effect.ShadersStore.lavaRibbonVertexShader = `
    precision highp float;
    attribute vec3 position;
    attribute vec2 uv;
    uniform mat4 worldViewProjection;
    uniform float time;
    uniform float phase;
    varying vec2 vUV;
    void main(void) {
      vUV = uv;
      vec3 p = position;
      p.z += sin(p.y * 8.0 - time * 2.4 + phase) * 0.025;
      p.x += sin(p.y * 5.0 + time * 0.65 + phase) * 0.018;
      gl_Position = worldViewProjection * vec4(p, 1.0);
    }
  `;

  B.Effect.ShadersStore.lavaRibbonFragmentShader = `
    precision highp float;
    varying vec2 vUV;
    uniform float time;
    uniform float phase;
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
    void main(void) {
      vec2 flow = vec2(vUV.x * 5.0 + phase, vUV.y * 10.0 - time * 1.8);
      float n = noise(flow) * 0.65 + noise(flow * 2.25) * 0.35;
      float pulse = sin((vUV.y - time * 0.34) * 22.0 + phase) * 0.13;
      float hot = smoothstep(0.42, 0.82, n + pulse);
      float center = 1.0 - smoothstep(0.04, 0.5, abs(vUV.x - 0.5));
      vec3 deep = vec3(0.42, 0.012, 0.001);
      vec3 orange = vec3(1.0, 0.105, 0.002);
      vec3 yellow = vec3(1.0, 0.72, 0.06);
      vec3 color = mix(deep, orange, n);
      color = mix(color, yellow, hot * (0.58 + center * 0.42));
      gl_FragColor = vec4(color, 0.98);
    }
  `;

  function createLavaRibbon(name, width, height, phase) {
    const rows = 18;
    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];
    for (let row = 0; row <= rows; row += 1) {
      const t = row / rows;
      const y = height * 0.5 - t * height;
      const drift = Math.sin(t * 10 + phase) * 0.045;
      const localWidth = width * (0.78 + Math.sin(t * 13 + phase * 1.3) * 0.12);
      positions.push(-localWidth * 0.5 + drift, y, 0, localWidth * 0.5 + drift, y, 0);
      normals.push(0, 0, 1, 0, 0, 1);
      uvs.push(0, t, 1, t);
      if (row < rows) {
        const a = row * 2;
        indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const mesh = new B.Mesh(name, scene);
    const data = new B.VertexData();
    data.positions = positions;
    data.normals = normals;
    data.uvs = uvs;
    data.indices = indices;
    data.applyToMesh(mesh);
    mesh.parent = mapRoot;

    const material = track(new B.ShaderMaterial(`${name}-material`, scene, {
      vertex: "lavaRibbon",
      fragment: "lavaRibbon",
    }, {
      attributes: ["position", "normal", "uv"],
      uniforms: ["worldViewProjection", "time", "phase"],
      needAlphaBlending: true,
    }));
    material.backFaceCulling = false;
    material.alphaMode = B.Engine.ALPHA_ADD;
    material.setFloat("phase", phase);
    mesh.material = material;
    effects.push((time) => material.setFloat("time", time));
    return mesh;
  }

  function createLavaTopMaterial() {
    const material = emissiveMaterial("moltenTop", new B.Color3(0.78, 0.065, 0.002), 1.8);
    material.roughness = 0.25;
    return material;
  }

  function addLavaEffects() {
    const lavaTopMaterial = createLavaTopMaterial();
    const lavaWallBlocks = [
      [2, 0], [5, 0], [13, 0], [16, 0],
      [0, 4], [18, 4], [0, 14], [18, 14],
      [3, 3], [15, 15],
    ];

    lavaWallBlocks.forEach(([gridX, gridZ], blockIndex) => {
      const p = gridToWorld(gridX, gridZ);
      const top = createRoundedBox(`lavaPool-${blockIndex}`, 0.8, 0.1, 0.8, 0.07, mapRoot, 4);
      top.position.set(p.x, 1.5, p.z);
      top.material = lavaTopMaterial;

      const faces = [
        { offset: new B.Vector3(0, 0.81, 0.47), rotation: 0 },
        { offset: new B.Vector3(0, 0.81, -0.47), rotation: Math.PI },
        { offset: new B.Vector3(0.47, 0.81, 0), rotation: Math.PI / 2 },
        { offset: new B.Vector3(-0.47, 0.81, 0), rotation: -Math.PI / 2 },
      ];
      faces.forEach((face, faceIndex) => {
        const phase = blockIndex * 1.41 + faceIndex * 0.87;
        const ribbon = createLavaRibbon(
          `lavaFlow-${blockIndex}-${faceIndex}`,
          0.58 + ((blockIndex + faceIndex) % 3) * 0.055,
          1.33,
          phase,
        );
        ribbon.position.set(p.x + face.offset.x, face.offset.y, p.z + face.offset.z);
        ribbon.rotation.y = face.rotation;
      });
    });

    const eruption = gridToWorld(13, 0);
    const fireTexture = createParticleTexture("fireParticle", "rgba(255,255,180,1)", "rgba(255,70,0,.9)");
    const particles = track(new B.ParticleSystem("eruption", 180, scene));
    particles.particleTexture = fireTexture;
    particles.emitter = new B.Vector3(eruption.x, 1.55, eruption.z);
    particles.minEmitBox = new B.Vector3(-0.18, 0, -0.18);
    particles.maxEmitBox = new B.Vector3(0.18, 0, 0.18);
    particles.color1 = new B.Color4(1, 0.76, 0.05, 1);
    particles.color2 = new B.Color4(1, 0.08, 0.005, 1);
    particles.minSize = 0.06;
    particles.maxSize = 0.2;
    particles.minLifeTime = 0.4;
    particles.maxLifeTime = 1.2;
    particles.emitRate = 42;
    particles.gravity = new B.Vector3(0, -5.5, 0);
    particles.direction1 = new B.Vector3(-1.2, 4.5, -1.2);
    particles.direction2 = new B.Vector3(1.2, 8.5, 1.2);
    particles.start();

    const lavaLight = new B.PointLight("lavaLight", new B.Vector3(eruption.x, 2.4, eruption.z), scene);
    lavaLight.parent = mapRoot;
    lavaLight.diffuse = new B.Color3(1, 0.12, 0.015);
    lavaLight.intensity = 3.2;
    lavaLight.range = 11;
    effects.push((time) => {
      lavaLight.intensity = 2.9 + Math.sin(time * 8.5) * 0.55;
    });
  }

  function addStars() {
    const starMaterial = emissiveMaterial("stars", new B.Color3(0.62, 0.78, 1), 3);
    const starSource = B.MeshBuilder.CreateSphere("starSource", { diameter: 0.055, segments: 4 }, scene);
    starSource.material = starMaterial;
    starSource.parent = mapRoot;
    starSource.position.set(-30, 12, -30);
    for (let index = 0; index < 230; index += 1) {
      const instance = starSource.createInstance(`star-${index}`);
      const angle = Math.random() * Math.PI * 2;
      const radius = 22 + Math.random() * 24;
      instance.position.set(
        Math.cos(angle) * radius,
        -3 + Math.random() * 24,
        Math.sin(angle) * radius,
      );
      instance.scaling.setAll(0.55 + Math.random() * 1.7);
      instance.parent = mapRoot;
    }
  }

  function addSpaceEffects() {
    addStars();
    const specs = [
      { color: [0.46, 0.43, 0.39], size: 0.24 },
      { color: [0.82, 0.56, 0.28], size: 0.34 },
      { color: [0.08, 0.38, 0.92], size: 0.38, earth: true },
      { color: [0.78, 0.17, 0.08], size: 0.29 },
      { color: [0.84, 0.57, 0.34], size: 0.58, bands: true },
      { color: [0.78, 0.65, 0.35], size: 0.5, ring: [0.9, 0.78, 0.48] },
      { color: [0.24, 0.78, 0.82], size: 0.41, ring: [0.5, 0.92, 0.94] },
      { color: [0.08, 0.19, 0.88], size: 0.39 },
    ];
    const wallPositions = [
      [2, 0], [6, 0], [12, 0], [16, 0],
      [0, 4], [18, 4], [0, 14], [18, 14],
    ];
    const gold = pbr("planetPedestal", {
      color: new B.Color3(1, 0.58, 0.08),
      metallic: 1,
      roughness: 0.2,
      environmentIntensity: 0.78,
    });

    specs.forEach((spec, index) => {
      const p = gridToWorld(...wallPositions[index]);
      const pedestal = B.MeshBuilder.CreateCylinder(`planetBase-${index}`, {
        height: 0.12,
        diameterTop: 0.72,
        diameterBottom: 0.82,
        tessellation: 20,
      }, scene);
      pedestal.parent = mapRoot;
      pedestal.position.set(p.x, 1.51, p.z);
      pedestal.material = gold;

      const planetMaterial = pbr(`planetMaterial-${index}`, {
        color: new B.Color3(...spec.color),
        roughness: spec.bands ? 0.65 : 0.48,
        environmentIntensity: 0.55,
      });
      const planet = B.MeshBuilder.CreateSphere(`planet-${index}`, {
        diameter: spec.size * 2,
        segments: 24,
      }, scene);
      planet.parent = mapRoot;
      const baseY = 1.92 + spec.size;
      planet.position.set(p.x, baseY, p.z);
      planet.material = planetMaterial;

      if (spec.earth) {
        const landMaterial = pbr("earthLand", { color: new B.Color3(0.12, 0.55, 0.16), roughness: 0.85 });
        [-0.12, 0.13].forEach((offset, landIndex) => {
          const land = B.MeshBuilder.CreateSphere(`earthLand-${landIndex}`, { diameter: 0.13, segments: 8 }, scene);
          land.parent = planet;
          land.position.set(offset, landIndex ? -0.06 : 0.08, 0.34);
          land.scaling.set(1.5, 0.7, 0.25);
          land.material = landMaterial;
        });
      }

      if (spec.bands) {
        [-0.16, 0, 0.16].forEach((y, bandIndex) => {
          const bandMaterial = pbr(`bandMaterial-${index}-${bandIndex}`, {
            color: bandIndex === 1 ? new B.Color3(0.36, 0.12, 0.05) : new B.Color3(0.94, 0.73, 0.43),
            roughness: 0.65,
          });
          const band = B.MeshBuilder.CreateTorus(`band-${index}-${bandIndex}`, {
            diameter: spec.size * 2.02,
            thickness: 0.028,
            tessellation: 28,
          }, scene);
          band.parent = planet;
          band.position.y = y;
          band.material = bandMaterial;
        });
      }

      if (spec.ring) {
        const ringMaterial = pbr(`ringMaterial-${index}`, {
          color: new B.Color3(...spec.ring),
          roughness: 0.55,
          alpha: 0.88,
        });
        const ring = B.MeshBuilder.CreateTorus(`ring-${index}`, {
          diameter: spec.size * 3.15,
          thickness: spec.size * 0.32,
          tessellation: 44,
        }, scene);
        ring.parent = planet;
        ring.rotation.x = Math.PI * 0.42;
        ring.rotation.z = 0.22;
        ring.material = ringMaterial;
      }

      const phase = index * 0.72;
      effects.push((time) => {
        planet.rotation.y = time * 0.38 + phase;
        planet.position.y = baseY + Math.sin(time * 1.05 + phase) * 0.1;
      });
    });
  }

  function clearTheme() {
    effects = [];
    if (mapRoot) {
      mapRoot.dispose(false, true);
      mapRoot = null;
    }
    themeResources.forEach((resource) => {
      try {
        if (resource && typeof resource.dispose === "function") resource.dispose();
      } catch {
        // A mesh can already have disposed a shared material.
      }
    });
    themeResources = [];
  }

  function buildMap(kind) {
    const theme = THEMES[kind];
    clearTheme();
    mapRoot = new B.TransformNode(`map-${kind}`, scene);
    scene.clearColor = theme.clear;
    scene.fogMode = B.Scene.FOGMODE_EXP2;
    scene.fogColor = theme.fog;
    scene.fogDensity = kind === "space" ? 0.006 : kind === "lava" ? 0.012 : 0.009;
    scene.environmentIntensity = kind === "space" ? 0.78 : kind === "ice" ? 0.68 : 0.34;
    scene.imageProcessingConfiguration.exposure = kind === "lava" ? 0.86 : kind === "space" ? 0.9 : 0.82;
    glow.intensity = kind === "lava" ? 0.28 : kind === "space" ? 0.18 : 0.12;
    pipeline.bloomWeight = kind === "lava" ? 0.18 : kind === "space" ? 0.11 : 0.08;

    const materials = createThemeMaterials(kind);
    addMapBlocks(kind, materials);
    addPadsAndObjective(kind);
    if (kind === "ice") addSnow();
    if (kind === "lava") addLavaEffects();
    if (kind === "space") addSpaceEffects();

    mapTitle.textContent = theme.title;
    mapSubtitle.textContent = theme.subtitle;
    mapButtons.forEach((button) => {
      button.setAttribute("aria-pressed", button.dataset.map === kind ? "true" : "false");
    });
    loading.hidden = true;
  }

  mapButtons.forEach((button) => {
    button.addEventListener("click", () => buildMap(button.dataset.map));
  });

  function resizeCamera() {
    const portrait = canvas.clientWidth / Math.max(1, canvas.clientHeight) < 0.72;
    camera.radius = portrait ? 30.5 : 27;
    camera.beta = portrait ? 0.94 : Math.PI * 0.325;
    engine.resize();
  }

  window.addEventListener("resize", resizeCamera);
  scene.onBeforeRenderObservable.add(() => {
    const delta = Math.min(engine.getDeltaTime() / 1000, 0.05);
    elapsed += delta;
    effects.forEach((effect) => effect(elapsed, delta));
  });

  const requestedMap = new URLSearchParams(window.location.search).get("map");
  buildMap(requestedMap && THEMES[requestedMap] ? requestedMap : "ice");
  resizeCamera();
  engine.runRenderLoop(() => scene.render());
})();
