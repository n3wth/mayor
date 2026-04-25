// 3D Tunnels — periodic immersive worlds you fly through.
//
// Built on three.js + postprocessing. Each scene is hand-tuned for awe:
//   1. letters — Stargate flight through extruded MAYOR letters
//   2. forest  — instanced glowing rods rising from a black plane
//   3. galaxy  — drifting yellow point cloud, slow camera dolly
//   4. mirror  — reflective floor, MAYOR floating, slow orbit
//   5. cells   — your sequencer's active cells become 3D blocks beat-synced
//
// Activation:
//   - Press 't' to enter a random scene
//   - Auto-trigger every ~3 minutes
//   - Server can broadcast 'tunnel' events so the room enters together
//   - Esc or 12-second auto-exit returns you to the page

import * as THREE from "three";
import {
  EffectComposer, RenderPass, EffectPass,
  BloomEffect, ChromaticAberrationEffect, NoiseEffect, VignetteEffect,
  GodRaysEffect, KernelSize,
} from "postprocessing";

const SCENES = ["letters", "forest", "galaxy", "mirror", "cells"];

export async function initTunnel(opts = {}) {
  const { onPlayStep, getSeqGrid, getActiveColors } = opts;

  const wrap = document.querySelector("[data-tunnel]");
  const canvas = document.querySelector("[data-tunnel-canvas]");
  const tag = document.querySelector("[data-tunnel-tag]");
  if (!wrap || !canvas) return null;

  // Renderer (lazy size — only takes space when active)
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, alpha: true, powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  function resize() {
    if (!isActive) return;
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer && composer.setSize(window.innerWidth, window.innerHeight);
    if (camera) {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
    }
  }
  window.addEventListener("resize", resize);

  let scene = null, camera = null, composer = null, sceneCleanup = null;
  let raf = 0;
  let isActive = false;
  let exitTimer = 0;
  let currentScene = null;
  const onUpdate = []; // per-frame callbacks for the active scene
  const beatHooks = []; // playStep hooks for the active scene

  // ── BUILDERS ──────────────────────────────────────────────────────────

  function buildLetters() {
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x000000, 0.035);
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 200);
    camera.position.set(0, 0, 30);

    // Letter material — emissive yellow.
    const mat = new THREE.MeshStandardMaterial({
      color: 0x101000, emissive: 0xffd54a, emissiveIntensity: 1.2,
      metalness: 0.4, roughness: 0.3,
    });

    // Build M A Y O R as extruded shapes. We use simple block letters via
    // BoxGeometry composition so we don't need a font loader.
    const group = new THREE.Group();
    const SPACING = 8;
    const LETTER_BUILDERS = {
      M: (g) => {
        g.add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 5, 1.2), mat).translateX(-1.4));
        g.add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 5, 1.2), mat).translateX(1.4));
        g.add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 3, 1.2), mat).translateX(-0.7).translateY(0.5).rotateZ(0.6));
        g.add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 3, 1.2), mat).translateX(0.7).translateY(0.5).rotateZ(-0.6));
      },
      A: (g) => {
        g.add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 5, 1.2), mat).translateX(-1.4).rotateZ(0.3));
        g.add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 5, 1.2), mat).translateX(1.4).rotateZ(-0.3));
        g.add(new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.6, 1.2), mat).translateY(-0.2));
      },
      Y: (g) => {
        g.add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 3, 1.2), mat).translateX(-1.0).translateY(1.2).rotateZ(0.4));
        g.add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 3, 1.2), mat).translateX(1.0).translateY(1.2).rotateZ(-0.4));
        g.add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 3, 1.2), mat).translateY(-1.2));
      },
      O: (g) => {
        const r = 1.8, t = 0.45;
        g.add(new THREE.Mesh(new THREE.TorusGeometry(r, t, 16, 32), mat));
      },
      R: (g) => {
        g.add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 5, 1.2), mat).translateX(-1.2));
        g.add(new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.4, 12, 24, Math.PI), mat).translateX(-0.2).translateY(1.2).rotateZ(-Math.PI / 2));
        g.add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 3, 1.2), mat).translateX(0.6).translateY(-1.2).rotateZ(-0.5));
      },
    };

    // Build a rail of repeating MAYOR letters going into the distance.
    const RING_COUNT = 18;
    const RING_SPACING = 12;
    const rings = [];
    for (let r = 0; r < RING_COUNT; r++) {
      const z = -r * RING_SPACING;
      const ring = new THREE.Group();
      ring.position.z = z;
      ring.rotation.z = (r % 2 === 0 ? 1 : -1) * (r * 0.08);
      ["M", "A", "Y", "O", "R"].forEach((letter, i) => {
        const lg = new THREE.Group();
        LETTER_BUILDERS[letter](lg);
        const angle = (i / 5) * Math.PI * 2;
        const radius = 7;
        lg.position.x = Math.cos(angle) * radius;
        lg.position.y = Math.sin(angle) * radius;
        lg.rotation.z = angle + Math.PI / 2;
        ring.add(lg);
      });
      group.add(ring);
      rings.push(ring);
    }
    scene.add(group);

    // Lights
    scene.add(new THREE.AmbientLight(0xffeebb, 0.3));
    const point = new THREE.PointLight(0xffd54a, 2, 60);
    point.position.set(0, 0, 5);
    scene.add(point);

    // Effects: bloom + chromatic + vignette
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new EffectPass(camera,
      new BloomEffect({ intensity: 1.6, kernelSize: KernelSize.LARGE, luminanceThreshold: 0.2 }),
      new ChromaticAberrationEffect({ offset: new THREE.Vector2(0.0008, 0.0008) }),
      new VignetteEffect({ darkness: 0.5, offset: 0.3 }),
    ));

    // Per-frame: dolly forward; recycle rings that pass behind the camera.
    let speed = 0.32;
    let elapsed = 0;
    onUpdate.push((dt) => {
      elapsed += dt;
      camera.position.z -= speed;
      // Subtle camera roll
      camera.rotation.z = Math.sin(elapsed * 0.6) * 0.06;
      // Ring twist as you fly
      rings.forEach((ring, i) => {
        ring.rotation.z += dt * (0.4 + (i % 3) * 0.2) * 0.4;
        if (ring.position.z > camera.position.z + 5) {
          ring.position.z -= RING_SPACING * RING_COUNT;
        }
      });
      // Light pulses with camera
      point.position.z = camera.position.z + 5;
      point.intensity = 1.8 + Math.sin(elapsed * 4) * 0.6;
    });

    // Beat hook: every step pulses bloom briefly
    beatHooks.push((letter) => {
      point.intensity += 1.5;
    });

    sceneCleanup = () => {
      group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      mat.dispose();
    };
  }

  function buildForest() {
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x000000, 0.025);
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 200);
    camera.position.set(0, 1.2, 0);

    // Black plane
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 400),
      new THREE.MeshBasicMaterial({ color: 0x000000 }),
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = -0.5;
    scene.add(plane);

    // Instanced glowing rods
    const COUNT = 600;
    const rodGeo = new THREE.CylinderGeometry(0.08, 0.08, 4, 6, 1, true);
    const rodMat = new THREE.MeshBasicMaterial({ color: 0xffd54a, transparent: true, opacity: 0.85 });
    const rods = new THREE.InstancedMesh(rodGeo, rodMat, COUNT);
    const dummy = new THREE.Object3D();
    const rodHeights = [];
    for (let i = 0; i < COUNT; i++) {
      const r = 4 + Math.random() * 70;
      const a = Math.random() * Math.PI * 2;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const h = 1.5 + Math.random() * 4;
      dummy.position.set(x, h / 2 - 0.5, z);
      dummy.scale.set(1, h / 4, 1);
      dummy.updateMatrix();
      rods.setMatrixAt(i, dummy.matrix);
      rodHeights.push(h);
    }
    scene.add(rods);

    // Ambient glow points (small spheres) high up
    const sparks = [];
    for (let i = 0; i < 80; i++) {
      const s = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xffeebb }),
      );
      s.position.set(
        (Math.random() - 0.5) * 80,
        2 + Math.random() * 10,
        -10 - Math.random() * 60,
      );
      scene.add(s);
      sparks.push(s);
    }

    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new EffectPass(camera,
      new BloomEffect({ intensity: 1.2, kernelSize: KernelSize.LARGE, luminanceThreshold: 0.4 }),
      new ChromaticAberrationEffect({ offset: new THREE.Vector2(0.0006, 0.0006) }),
      new VignetteEffect({ darkness: 0.55, offset: 0.25 }),
    ));

    // Camera flies low and weaves
    let elapsed = 0;
    onUpdate.push((dt) => {
      elapsed += dt;
      camera.position.x = Math.sin(elapsed * 0.3) * 4;
      camera.position.z -= dt * 6;
      camera.position.y = 1.2 + Math.sin(elapsed * 0.7) * 0.3;
      camera.rotation.y = Math.sin(elapsed * 0.5) * 0.2;
      // Wrap rods so the forest is endless
      const ofs = Math.floor(camera.position.z / 80) * 80;
      // Sparks drift slowly
      sparks.forEach((s, i) => {
        s.position.y += Math.sin(elapsed * 0.5 + i) * dt * 0.2;
      });
    });

    beatHooks.push(() => {
      // Pulse the rod material opacity briefly
      rodMat.opacity = 1.0;
      gsapTo(rodMat, "opacity", 0.85, 0.4);
    });

    sceneCleanup = () => {
      rodGeo.dispose();
      rodMat.dispose();
      sparks.forEach((s) => { s.geometry.dispose(); s.material.dispose(); });
      plane.geometry.dispose();
      plane.material.dispose();
    };
  }

  function buildGalaxy() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 40);

    // Dense yellow point cloud
    const COUNT = 12000;
    const positions = new Float32Array(COUNT * 3);
    const colors = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      // Spiral galaxy distribution
      const arm = Math.floor(Math.random() * 3) * (Math.PI * 2 / 3);
      const r = Math.pow(Math.random(), 0.5) * 60;
      const a = arm + r * 0.18 + (Math.random() - 0.5) * 0.7;
      const x = Math.cos(a) * r + (Math.random() - 0.5) * 8;
      const y = (Math.random() - 0.5) * 6;
      const z = Math.sin(a) * r + (Math.random() - 0.5) * 8;
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      // Color: yellow at center → warmer at edge
      const t = r / 60;
      colors[i * 3] = 1.0;
      colors[i * 3 + 1] = 0.85 - t * 0.25;
      colors[i * 3 + 2] = 0.2 + t * 0.1;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.18, vertexColors: true,
      transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const points = new THREE.Points(geo, mat);
    scene.add(points);

    // Bright core sphere (acts as god-rays source)
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(1.4, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0xffffaa }),
    );
    scene.add(core);

    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new EffectPass(camera,
      new GodRaysEffect(camera, core, {
        kernelSize: KernelSize.LARGE,
        density: 0.96, decay: 0.93, weight: 0.5, exposure: 0.5,
        samples: 60, clampMax: 1,
      }),
      new BloomEffect({ intensity: 1.2, kernelSize: KernelSize.LARGE, luminanceThreshold: 0.5 }),
      new VignetteEffect({ darkness: 0.4, offset: 0.3 }),
    ));

    let elapsed = 0;
    onUpdate.push((dt) => {
      elapsed += dt;
      points.rotation.y += dt * 0.04;
      // Slow orbit of the camera
      camera.position.x = Math.sin(elapsed * 0.15) * 35;
      camera.position.z = 40 - Math.sin(elapsed * 0.05) * 10;
      camera.position.y = Math.sin(elapsed * 0.2) * 6;
      camera.lookAt(0, 0, 0);
    });

    beatHooks.push(() => {
      core.scale.setScalar(2);
      gsapTo(core.scale, "x", 1, 0.5);
      gsapTo(core.scale, "y", 1, 0.5);
      gsapTo(core.scale, "z", 1, 0.5);
    });

    sceneCleanup = () => {
      geo.dispose();
      mat.dispose();
      core.geometry.dispose();
      core.material.dispose();
    };
  }

  function buildMirror() {
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x000000, 0.04);
    camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 200);
    camera.position.set(0, 4, 18);

    // Reflective floor (faked via stacked low-opacity planes for cheap depth)
    const floorGeo = new THREE.PlaneGeometry(400, 400);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x000000, metalness: 0.95, roughness: 0.15,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    // Glowing yellow grid lines floating just above floor
    const gridMat = new THREE.LineBasicMaterial({ color: 0xffd54a, transparent: true, opacity: 0.4 });
    const gridGeo = new THREE.BufferGeometry();
    const gridPts = [];
    for (let i = -40; i <= 40; i += 2) {
      gridPts.push(i, 0.01, -80, i, 0.01, 80);
      gridPts.push(-80, 0.01, i, 80, 0.01, i);
    }
    gridGeo.setAttribute("position", new THREE.Float32BufferAttribute(gridPts, 3));
    const grid = new THREE.LineSegments(gridGeo, gridMat);
    scene.add(grid);

    // MAYOR floating in air — 5 yellow boxes spelling it crudely
    const lettersGroup = new THREE.Group();
    const lmat = new THREE.MeshStandardMaterial({
      color: 0x222200, emissive: 0xffd54a, emissiveIntensity: 1.5,
      metalness: 0.3, roughness: 0.4,
    });
    const blocks = [];
    for (let i = 0; i < 5; i++) {
      const block = new THREE.Mesh(
        new THREE.BoxGeometry(2, 3, 2),
        lmat.clone(),
      );
      block.position.set(-8 + i * 4, 4, 0);
      lettersGroup.add(block);
      blocks.push(block);
    }
    scene.add(lettersGroup);

    // Lights
    scene.add(new THREE.AmbientLight(0xfff0cc, 0.2));
    const sun = new THREE.DirectionalLight(0xffd54a, 1.5);
    sun.position.set(10, 20, 10);
    scene.add(sun);

    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new EffectPass(camera,
      new BloomEffect({ intensity: 1.5, kernelSize: KernelSize.LARGE, luminanceThreshold: 0.3 }),
      new VignetteEffect({ darkness: 0.55, offset: 0.25 }),
    ));

    let elapsed = 0;
    onUpdate.push((dt) => {
      elapsed += dt;
      // Slow orbit
      const r = 18;
      camera.position.x = Math.sin(elapsed * 0.18) * r;
      camera.position.z = Math.cos(elapsed * 0.18) * r;
      camera.position.y = 4 + Math.sin(elapsed * 0.3) * 1;
      camera.lookAt(0, 4, 0);
      // Letters drift slightly
      blocks.forEach((b, i) => {
        b.position.y = 4 + Math.sin(elapsed * 0.5 + i * 0.7) * 0.4;
        b.rotation.y = elapsed * 0.2 + i * 0.4;
      });
    });

    beatHooks.push((letter) => {
      const idx = ["M", "A", "Y", "O", "R"].indexOf(letter);
      if (idx >= 0 && blocks[idx]) {
        blocks[idx].material.emissiveIntensity = 4;
        gsapTo(blocks[idx].material, "emissiveIntensity", 1.5, 0.4);
      }
    });

    sceneCleanup = () => {
      floorGeo.dispose(); floorMat.dispose();
      gridGeo.dispose(); gridMat.dispose();
      lmat.dispose();
      blocks.forEach((b) => { b.geometry.dispose(); b.material.dispose(); });
    };
  }

  function buildCells() {
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x000000, 0.03);
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 200);
    camera.position.set(0, 3, 12);

    // Build the user's actual sequencer grid as 3D blocks.
    const grid = (typeof getSeqGrid === "function" ? getSeqGrid() : null) || {
      M: [], A: [], Y: [], O: [], R: [],
    };
    const colors = (typeof getActiveColors === "function" ? getActiveColors() : {}) || {};
    const ROWS = ["M", "A", "Y", "O", "R"];
    const STEPS = 16;
    const cellGroup = new THREE.Group();
    const cellMeshes = []; // { mesh, letter, idx }
    for (let r = 0; r < 5; r++) {
      const letter = ROWS[r];
      const rowColor = new THREE.Color(colors[letter] || "#f0d72a");
      for (let i = 0; i < STEPS; i++) {
        const isOn = (grid[letter] && grid[letter][i]) ? 1 : 0;
        const h = isOn ? 1.6 : 0.15;
        const geo = new THREE.BoxGeometry(0.6, h, 0.6);
        const mat = new THREE.MeshStandardMaterial({
          color: 0x000000,
          emissive: rowColor,
          emissiveIntensity: isOn ? 1.5 : 0.2,
          metalness: 0.2, roughness: 0.5,
        });
        const block = new THREE.Mesh(geo, mat);
        block.position.set(
          -7.5 + i * 1.0,
          h / 2,
          -2 + r * 1.0,
        );
        cellGroup.add(block);
        cellMeshes.push({ mesh: block, mat, letter, idx: i, isOn });
      }
    }
    scene.add(cellGroup);

    // Mirror floor
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 400),
      new THREE.MeshStandardMaterial({ color: 0x080808, metalness: 0.9, roughness: 0.2 }),
    );
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    scene.add(new THREE.AmbientLight(0xffffff, 0.25));
    const k1 = new THREE.PointLight(0xffd54a, 1.5, 40);
    k1.position.set(5, 8, 8);
    scene.add(k1);
    const k2 = new THREE.PointLight(0x88ccff, 0.8, 40);
    k2.position.set(-5, 6, 4);
    scene.add(k2);

    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new EffectPass(camera,
      new BloomEffect({ intensity: 1.4, kernelSize: KernelSize.LARGE, luminanceThreshold: 0.3 }),
      new ChromaticAberrationEffect({ offset: new THREE.Vector2(0.0005, 0.0005) }),
      new VignetteEffect({ darkness: 0.5, offset: 0.3 }),
    ));

    // Camera flies along the playhead, panning across the steps.
    let elapsed = 0;
    onUpdate.push((dt) => {
      elapsed += dt;
      const playhead = (elapsed * 1.5) % 16;
      camera.position.x = -7.5 + playhead * 1.0;
      camera.position.y = 3 + Math.sin(elapsed * 0.5) * 0.6;
      camera.position.z = 5 + Math.sin(elapsed * 0.3) * 1;
      camera.lookAt(camera.position.x, 1.5, 0);
    });

    beatHooks.push((letter) => {
      const r = ROWS.indexOf(letter);
      if (r < 0) return;
      // Find cells in this row that are on; flash whichever is "next" in
      // the playhead area.
      const nextOn = cellMeshes.find((c) => c.letter === letter && c.isOn);
      if (nextOn) {
        nextOn.mat.emissiveIntensity = 5;
        gsapTo(nextOn.mat, "emissiveIntensity", 1.5, 0.5);
        const startY = nextOn.mesh.position.y;
        nextOn.mesh.position.y = startY + 0.5;
        gsapTo(nextOn.mesh.position, "y", startY, 0.6);
      }
    });

    sceneCleanup = () => {
      cellMeshes.forEach((c) => { c.mesh.geometry.dispose(); c.mat.dispose(); });
      floor.geometry.dispose(); floor.material.dispose();
    };
  }

  // Tiny gsap-like tween that doesn't depend on gsap so this module is portable
  function gsapTo(target, prop, to, duration) {
    const from = target[prop];
    const start = performance.now();
    const tick = () => {
      const t = Math.min(1, (performance.now() - start) / (duration * 1000));
      const eased = 1 - Math.pow(1 - t, 3);
      target[prop] = from + (to - from) * eased;
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function teardownScene() {
    onUpdate.length = 0;
    beatHooks.length = 0;
    if (sceneCleanup) { try { sceneCleanup(); } catch {} sceneCleanup = null; }
    if (scene) {
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
          else o.material.dispose();
        }
      });
    }
    scene = null;
    if (composer) { composer.dispose(); composer = null; }
    camera = null;
  }

  // ── PUBLIC API ────────────────────────────────────────────────────────

  function enter(sceneId, opts = {}) {
    if (isActive) return;
    const id = SCENES.includes(sceneId) ? sceneId : SCENES[Math.floor(Math.random() * SCENES.length)];
    currentScene = id;
    isActive = true;
    document.body.classList.add("tunneling");
    wrap.classList.add("active");
    wrap.setAttribute("aria-hidden", "false");
    if (tag) tag.textContent = `[ ${id.toUpperCase()} ]`;
    resize();
    if (id === "letters") buildLetters();
    else if (id === "forest") buildForest();
    else if (id === "galaxy") buildGalaxy();
    else if (id === "mirror") buildMirror();
    else if (id === "cells") buildCells();

    // Auto-exit after 12s (or opts.duration ms)
    const dur = opts.duration ?? 12000;
    exitTimer = setTimeout(() => exit(), dur);

    // Render loop
    let last = performance.now();
    const loop = () => {
      if (!isActive) return;
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      onUpdate.forEach((fn) => { try { fn(dt); } catch {} });
      try { composer.render(dt); } catch {}
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }

  function exit() {
    if (!isActive) return;
    isActive = false;
    if (exitTimer) { clearTimeout(exitTimer); exitTimer = 0; }
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    wrap.classList.remove("active");
    wrap.setAttribute("aria-hidden", "true");
    document.body.classList.remove("tunneling");
    // Wait for fade-out then teardown
    setTimeout(() => { teardownScene(); }, 1500);
  }

  // Beat hook — call this when a step plays so scenes can react.
  function onBeat(letter) {
    if (!isActive) return;
    beatHooks.forEach((fn) => { try { fn(letter); } catch {} });
  }

  // Wire onPlayStep callback if provided
  if (typeof onPlayStep === "function") {
    onPlayStep((letter) => onBeat(letter));
  }

  // Esc handler
  window.addEventListener("keydown", (e) => {
    if (!isActive) return;
    if (e.key === "Escape") { e.preventDefault(); exit(); }
  });

  return {
    enter,
    exit,
    isActive: () => isActive,
    onBeat,
    SCENES,
  };
}
