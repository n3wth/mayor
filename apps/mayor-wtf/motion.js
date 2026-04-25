// Mayor motion — the Awe build.
//
// One thing, breathtaking. The page is a quiet cathedral:
// — Volumetric yellow field, breathing.
// — MAYOR sculpted with weight: cursor tilts the slab with momentum.
// — A continuous tonal drone (Tone.js) — the room's sound.
// — Click anywhere → a single note + a synced ripple. Pentatonic, can't
//   sound bad. Played in real time for everyone in the room.
// — Each visitor is a drifting soft star on the field; you can SEE other
//   minds present without faces.
// — First click = a controlled scale-shock: hero swells +12% and settles.
// All other widgets, sequencers, palettes, etc. are gone.

const reduceMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const SYNC_BASE = "https://inbox.mayor.wtf";
const SELF_ID = (Math.random().toString(36) + Date.now().toString(36)).slice(2, 14);

// ── BACKGROUND FIELD ────────────────────────────────────────────────────
function initField(canvas) {
  const gl = canvas.getContext("webgl", { antialias: false, alpha: true });
  if (!gl) return null;

  const VS = `attribute vec2 a_pos; void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }`;
  const FS = `
    precision mediump float;
    uniform vec2 u_res;
    uniform float u_time;
    uniform float u_intensity;
    uniform vec2 u_mouse;
    uniform vec2 u_pulse;
    uniform float u_pulseAge;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      float a = hash(i);
      float b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0));
      float d = hash(i + vec2(1.0, 1.0));
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
    }
    float fbm(vec2 p) {
      float v = 0.0, a = 0.5;
      for (int i = 0; i < 3; i++) { v += a * noise(p); p *= 2.07; a *= 0.5; }
      return v;
    }

    void main() {
      vec2 uv = gl_FragCoord.xy / u_res.xy;
      vec2 p = uv * 2.0 - 1.0;
      p.x *= u_res.x / u_res.y;

      float t = u_time * 0.025;
      vec2 well1 = vec2(sin(t * 0.7) * 0.55, cos(t * 0.5) * 0.30);
      vec2 well2 = vec2(cos(t * 0.6 + 1.7) * 0.65, sin(t * 0.4 + 0.4) * 0.45);
      float d1 = length(p - well1);
      float d2 = length(p - well2);
      vec2 m = (u_mouse * 2.0 - 1.0) * vec2(u_res.x / u_res.y, 1.0);
      float dm = length(p - m);

      vec2 q = vec2(fbm(p + t), fbm(p - t * 0.6));
      float n = fbm(p * 1.5 + q * (0.4 + u_intensity * 0.4));

      vec3 deep = vec3(0.42, 0.36, 0.05);
      vec3 mid_ = vec3(0.78, 0.69, 0.12);
      vec3 hi   = vec3(1.00, 0.83, 0.27);

      float light1 = smoothstep(1.5, 0.0, d1);
      float light2 = smoothstep(1.3, 0.0, d2);
      float lightM = smoothstep(0.7, 0.0, dm) * 0.5;

      vec3 col = mix(deep * 0.45, mid_, light1 * 0.9);
      col = mix(col, hi, light2 * 0.6);
      col += hi * lightM * 0.25;

      float shade = 0.55 + n * 0.5;
      col *= shade;

      // Click ripple — a slow expanding ring. Reads as PHYSICAL.
      float pulseR = u_pulseAge * 0.85;
      vec2 pp = (u_pulse * 2.0 - 1.0) * vec2(u_res.x / u_res.y, 1.0);
      float pd = length(p - pp);
      float ring = exp(-pow((pd - pulseR) * 5.5, 2.0)) * exp(-u_pulseAge * 0.55);
      col += hi * ring * 0.55;

      float vig = smoothstep(1.8, 0.5, length(p));
      col *= mix(0.18, 1.0, vig);

      gl_FragColor = vec4(col, 1.0);
    }
  `;

  function compile(src, type) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.warn("[field]", gl.getShaderInfoLog(sh));
      return null;
    }
    return sh;
  }
  const vs = compile(VS, gl.VERTEX_SHADER);
  const fs = compile(FS, gl.FRAGMENT_SHADER);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, "a_pos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const u = {
    res: gl.getUniformLocation(prog, "u_res"),
    time: gl.getUniformLocation(prog, "u_time"),
    intensity: gl.getUniformLocation(prog, "u_intensity"),
    mouse: gl.getUniformLocation(prog, "u_mouse"),
    pulse: gl.getUniformLocation(prog, "u_pulse"),
    pulseAge: gl.getUniformLocation(prog, "u_pulseAge"),
  };

  const SCALE = 0.5;
  function resize() {
    canvas.width = Math.max(1, (canvas.clientWidth * SCALE) | 0);
    canvas.height = Math.max(1, (canvas.clientHeight * SCALE) | 0);
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  resize();
  window.addEventListener("resize", resize);

  let state = { intensity: 0, mouse: [0.5, 0.5], pulse: [0.5, 0.5], pulseStart: -10 };
  const t0 = performance.now();
  let raf = 0;
  let paused = false;
  document.addEventListener("visibilitychange", () => { paused = document.hidden; });
  function tick() {
    if (!paused) {
      const t = (performance.now() - t0) / 1000;
      gl.uniform2f(u.res, canvas.width, canvas.height);
      gl.uniform1f(u.time, t);
      gl.uniform1f(u.intensity, state.intensity);
      gl.uniform2f(u.mouse, state.mouse[0], state.mouse[1]);
      gl.uniform2f(u.pulse, state.pulse[0], state.pulse[1]);
      gl.uniform1f(u.pulseAge, t - state.pulseStart);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);

  return {
    setIntensity: (v) => { state.intensity = Math.max(0, Math.min(1, v)); },
    setMouse: (x, y) => { state.mouse = [x, y]; },
    triggerPulse: (x, y) => {
      state.pulse = [x, y];
      state.pulseStart = (performance.now() - t0) / 1000;
    },
    destroy: () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); },
  };
}

// ── PRESENCE STARS ───────────────────────────────────────────────────────
// One soft point of light per visitor (excluding self). Drifts gently.
// Stars are just dots with motion; their VALUE is "you can see other minds."
// Also: occasional shooting stars streak diagonally — a quiet wonder, with
// a soft bell when sound is on.
function initStars(canvas, getSoundOn) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  let dpr = Math.min(2, window.devicePixelRatio || 1);
  let W = 0, H = 0;
  function resize() {
    canvas.width = (canvas.clientWidth * dpr) | 0;
    canvas.height = (canvas.clientHeight * dpr) | 0;
    W = canvas.width; H = canvas.height;
  }
  resize();
  window.addEventListener("resize", resize);

  // Stable per-visitor seed (server gives us a count, not IDs, so we
  // generate stable jitter from indices). Self is index 0; hidden.
  let count = 1;
  let raf = 0;
  let paused = false;
  document.addEventListener("visibilitychange", () => { paused = document.hidden; });

  // Shooting stars — short-lived diagonal streaks. Spawned every 8–14s.
  // Each carries a small head and a fading trail (~80px in CSS pixels).
  const shooters = [];
  let nextShootAt = performance.now() + (8000 + Math.random() * 6000);
  const TRAIL_LEN = 80; // CSS px
  const LIFE = 1.1;     // seconds, head travels full path

  function spawnShooter() {
    // Diagonal: top-left → bottom-right or top-right → bottom-left.
    const fromLeft = Math.random() < 0.5;
    // Start above the visible area, end below — a generous arc across.
    const startX = fromLeft
      ? (-0.05 + Math.random() * 0.25) * W
      : (0.80 + Math.random() * 0.25) * W;
    const startY = (-0.10 + Math.random() * 0.20) * H;
    // Travel a generous diagonal, angled ~22–38° below horizontal.
    const theta = (Math.PI / 180) * (22 + Math.random() * 16);
    const dist = (0.65 + Math.random() * 0.25) * Math.hypot(W, H);
    const dirX = fromLeft ? 1 : -1;
    const vx = dirX * Math.cos(theta) * dist;
    const vy = Math.sin(theta) * dist;
    shooters.push({
      x0: startX,
      y0: startY,
      vx,
      vy,
      t0: performance.now(),
    });
    // Soft bell — high octave from PENT[12-15].
    if (getSoundOn && getSoundOn()) {
      const note = PENT[12 + ((Math.random() * 4) | 0)];
      pluck(note, 0, 0.4);
    }
  }

  function drawShooter(s, now) {
    const age = (now - s.t0) / 1000;
    if (age > LIFE) return false;
    const p = age / LIFE;
    // Ease-out so the streak feels like it's gliding to a stop.
    const eased = 1 - Math.pow(1 - p, 2.2);
    const hx = s.x0 + s.vx * eased;
    const hy = s.y0 + s.vy * eased;
    // Trail tail point — fixed CSS-px length behind the head along velocity.
    const speedLen = Math.hypot(s.vx, s.vy) || 1;
    const ux = s.vx / speedLen;
    const uy = s.vy / speedLen;
    const trail = TRAIL_LEN * dpr;
    const tx = hx - ux * trail;
    const ty = hy - uy * trail;

    // Fade in fast, hold, fade out — bell-shaped alpha so it feels gentle.
    const alpha = Math.min(1, p * 4) * Math.min(1, (1 - p) * 2.4);

    // Trail: linear gradient from transparent at tail to bright at head.
    const grad = ctx.createLinearGradient(tx, ty, hx, hy);
    grad.addColorStop(0, "rgba(255, 220, 100, 0)");
    grad.addColorStop(1, `rgba(255, 235, 150, ${0.85 * alpha})`);
    ctx.strokeStyle = grad;
    ctx.lineWidth = 1.6 * dpr;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(hx, hy);
    ctx.stroke();

    // Bright head — small glow + tight core.
    const head = ctx.createRadialGradient(hx, hy, 0, hx, hy, 6 * dpr);
    head.addColorStop(0, `rgba(255, 245, 200, ${0.95 * alpha})`);
    head.addColorStop(1, "rgba(255, 220, 100, 0)");
    ctx.fillStyle = head;
    ctx.beginPath();
    ctx.arc(hx, hy, 6 * dpr, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = `rgba(255, 250, 220, ${alpha})`;
    ctx.beginPath();
    ctx.arc(hx, hy, 1.6 * dpr, 0, Math.PI * 2);
    ctx.fill();
    return true;
  }

  function tick() {
    if (!paused) {
      const t = performance.now() / 1000;
      const now = performance.now();
      ctx.clearRect(0, 0, W, H);
      // i=0 is self, hidden. Render i=1..count-1.
      for (let i = 1; i < count; i++) {
        // Stable drift — each visitor has unique slow elliptical orbit.
        const seed = i * 13.37;
        const cx = W * (0.5 + 0.32 * Math.sin(t * 0.06 + seed));
        const cy = H * (0.5 + 0.22 * Math.cos(t * 0.07 + seed * 1.3));
        const r = (10 + Math.sin(t * 0.5 + seed) * 4) * dpr;

        // Soft yellow glow
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 6);
        grad.addColorStop(0, "rgba(255, 220, 80, 0.55)");
        grad.addColorStop(0.4, "rgba(255, 200, 60, 0.18)");
        grad.addColorStop(1, "rgba(255, 200, 60, 0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 6, 0, Math.PI * 2);
        ctx.fill();

        // Tight bright core
        ctx.fillStyle = "rgba(255,240,160,0.95)";
        ctx.beginPath();
        ctx.arc(cx, cy, 2 * dpr, 0, Math.PI * 2);
        ctx.fill();
      }

      // Shooting stars — schedule + render.
      if (now >= nextShootAt) {
        spawnShooter();
        nextShootAt = now + (8000 + Math.random() * 6000);
      }
      for (let i = shooters.length - 1; i >= 0; i--) {
        const alive = drawShooter(shooters[i], now);
        if (!alive) shooters.splice(i, 1);
      }
    } else {
      // While hidden, push the next spawn into the future so we don't burst
      // a stockpile of streaks the moment the tab regains focus.
      nextShootAt = performance.now() + (8000 + Math.random() * 6000);
    }
    raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);

  return {
    setCount: (n) => { count = Math.max(1, n | 0); },
    destroy: () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); },
  };
}

// ── AURORA CURTAINS ──────────────────────────────────────────────────────
// Three slow vertical gauze ribbons drifting from top to bottom. Each is a
// tall yellow band with sine-wave horizontal displacement, rendered with
// screen blend, low alpha, top→transparent gradient. ~30–50s vertical cycle.
// Adds atmospheric depth behind MAYOR without distracting from the type.
function initAurora(canvas) {
  if (!canvas) return null;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  let dpr = Math.min(2, window.devicePixelRatio || 1);
  let W = 0, H = 0;
  function resize() {
    canvas.width = (canvas.clientWidth * dpr) | 0;
    canvas.height = (canvas.clientHeight * dpr) | 0;
    W = canvas.width; H = canvas.height;
  }
  resize();
  window.addEventListener("resize", resize);

  // Three ribbons — each with its own horizontal anchor, width, drift period,
  // wave amplitude, wave frequency, and phase offset. Periods are long
  // (30–50s) so the eye reads "slow weather," not "animation."
  const ribbons = [
    { xFrac: 0.22, width: 0.30, period: 38, amp: 0.06, freq: 1.1, phase: 0.0,  alpha: 0.085 },
    { xFrac: 0.50, width: 0.42, period: 46, amp: 0.04, freq: 0.7, phase: 1.7,  alpha: 0.070 },
    { xFrac: 0.78, width: 0.34, period: 32, amp: 0.07, freq: 1.4, phase: 3.3,  alpha: 0.095 },
  ];

  const t0 = performance.now();
  let raf = 0;
  let paused = false;
  document.addEventListener("visibilitychange", () => { paused = document.hidden; });

  function tick() {
    if (!paused) {
      const t = (performance.now() - t0) / 1000;
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";

      for (let i = 0; i < ribbons.length; i++) {
        const r = ribbons[i];
        // Drift: each ribbon scrolls its wave-phase downward over `period` s.
        // We model this as a vertical offset in [0..1] that loops.
        const drift = ((t / r.period) + r.phase) % 1;

        // Render the ribbon as a stack of slim horizontal slices, each
        // displaced by a sine wave whose phase advances with vertical drift.
        const SLICES = 36; // enough resolution to feel smooth, cheap to draw
        const sliceH = H / SLICES;
        const halfW = (r.width * W) / 2;
        const baseX = r.xFrac * W;

        for (let s = 0; s < SLICES; s++) {
          const yFrac = s / SLICES;
          const y = yFrac * H;

          // Sine displacement — uses both yFrac (for vertical wave shape) and
          // drift (so the wave migrates down over time).
          const wave = Math.sin((yFrac + drift) * Math.PI * 2 * r.freq + r.phase);
          const cx = baseX + wave * r.amp * W;

          // Vertical gradient: yellow #f0d72a at top → transparent at bottom.
          // Per-slice alpha multiplies the gradient by ribbon alpha and a
          // top-loaded falloff so the ribbon fades as it descends.
          const fall = 1 - yFrac; // 1 at top, 0 at bottom
          const a = r.alpha * fall;

          // Horizontal gradient across the ribbon: 0 at edges → a in middle.
          const grad = ctx.createLinearGradient(cx - halfW, 0, cx + halfW, 0);
          grad.addColorStop(0,    "rgba(240, 215, 42, 0)");
          grad.addColorStop(0.5,  `rgba(240, 215, 42, ${a.toFixed(4)})`);
          grad.addColorStop(1,    "rgba(240, 215, 42, 0)");
          ctx.fillStyle = grad;
          ctx.fillRect(cx - halfW, y, halfW * 2, sliceH + 1);
        }
      }
      ctx.globalCompositeOperation = "source-over";
    }
    raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);

  return {
    destroy: () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); },
  };
}

// ── NOTE RIPPLES ─────────────────────────────────────────────────────────
// Concentric rings expanding from a click point. Multiple rings can be
// alive at once (different visitors, different times). Drawn on a 2D canvas.
function initRipples(canvas) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  let dpr = Math.min(2, window.devicePixelRatio || 1);
  let W = 0, H = 0;
  function resize() {
    canvas.width = (canvas.clientWidth * dpr) | 0;
    canvas.height = (canvas.clientHeight * dpr) | 0;
    W = canvas.width; H = canvas.height;
  }
  resize();
  window.addEventListener("resize", resize);

  const ripples = [];
  let raf = 0;
  let paused = false;
  document.addEventListener("visibilitychange", () => { paused = document.hidden; });

  function tick() {
    if (!paused) {
      ctx.clearRect(0, 0, W, H);
      const now = performance.now();
      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i];
        const age = (now - r.t0) / 1000;
        if (age > 2.6) { ripples.splice(i, 1); continue; }
        const radius = age * 320 * dpr;
        const alpha = Math.max(0, 1 - age / 2.6) * (r.self ? 0.85 : 0.55);
        ctx.strokeStyle = `rgba(255, 220, 80, ${alpha})`;
        ctx.lineWidth = (r.self ? 2.2 : 1.6) * dpr;
        ctx.beginPath();
        ctx.arc(r.x * dpr, r.y * dpr, radius, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);

  return {
    add: (x, y, self = false) => {
      ripples.push({ x, y, self, t0: performance.now() });
      if (ripples.length > 24) ripples.shift();
    },
    destroy: () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); },
  };
}

// ── AUDIO: continuous drone + pentatonic note plucks ────────────────────
// Tone.js. The page sounds like a cathedral. Always-on once enabled —
// browser autoplay policy means the user has to click sound-on once.
let Tone = null;
let droneStarted = false;
let droneNodes = null;
let pluckSynth = null;
let audioReady = false;

// Pentatonic scale (A minor pentatonic, octaves 3–5). X position picks pitch.
const PENT = [
  "A2", "C3", "D3", "E3", "G3",
  "A3", "C4", "D4", "E4", "G4",
  "A4", "C5", "D5", "E5", "G5",
  "A5",
];
function noteForX(nx) {
  const i = Math.max(0, Math.min(PENT.length - 1, Math.floor(nx * PENT.length)));
  return PENT[i];
}

function initAudio() {
  if (audioReady) return true;
  Tone = window.Tone;
  if (!Tone) return false;

  // The drone: two slow detuned sine pads through reverb + filter.
  // Quiet, room-tone level. Built so it keeps you company without nagging.
  const reverb = new Tone.Reverb({ decay: 8, wet: 0.6 }).toDestination();
  const filter = new Tone.Filter(800, "lowpass").connect(reverb);
  filter.Q.value = 0.9;

  const padA = new Tone.Oscillator({ type: "sine", frequency: "A2", volume: -22 }).connect(filter);
  const padE = new Tone.Oscillator({ type: "sine", frequency: "E3", volume: -22 }).connect(filter);
  // A slowly-modulated detune so the pad never sits still.
  const lfo = new Tone.LFO({ frequency: 0.05, min: -8, max: 8 }).start();
  lfo.connect(padE.detune);

  // Pluck — bright marimba-ish. Reads as "a single thought."
  pluckSynth = new Tone.Synth({
    oscillator: { type: "triangle" },
    envelope: { attack: 0.005, decay: 0.4, sustain: 0.0, release: 1.2 },
  });
  const pluckReverb = new Tone.Reverb({ decay: 4.5, wet: 0.45 }).toDestination();
  pluckSynth.connect(pluckReverb);
  pluckSynth.volume.value = -10;

  droneNodes = { padA, padE, filter, reverb, lfo };
  audioReady = true;
  return true;
}

function startDrone() {
  if (!droneNodes || droneStarted) return;
  // Start pads on next bar
  droneNodes.padA.start();
  droneNodes.padE.start();
  droneStarted = true;
}

function pluck(note, when = 0, vel = 0.7) {
  if (!pluckSynth) return;
  try {
    pluckSynth.triggerAttackRelease(note, "8n", when || Tone.now(), vel);
  } catch {}
}

// ── ENTRY POINT ──────────────────────────────────────────────────────────
export function initMotion(gsap) {
  if (!gsap) return { destroy: () => {} };
  const reduced = reduceMotion();

  const fieldCanvas = document.querySelector("[data-field]");
  const starsCanvas = document.querySelector("[data-stars]");
  const auroraCanvas = document.querySelector("[data-aurora]");
  const ripplesCanvas = document.querySelector("[data-ripples]");
  const halo = document.querySelector("[data-cursor-halo]");
  const dot = document.querySelector("[data-cursor-dot]");
  const presenceEl = document.querySelector("[data-presence]");
  const soundBtn = document.querySelector("[data-sound]");
  const layers = {
    back: document.querySelector('[data-layer="back"]'),
    mid: document.querySelector('[data-layer="mid"]'),
  };
  const letters = Array.from(document.querySelectorAll(".ml"));
  letters.forEach((l) => {
    l.style.transformBox = "fill-box";
    l.style.transformOrigin = "center bottom";
  });

  // Forward-reference: shooting stars need to know if sound is on. soundOn
  // is declared further down; the getter reads it lazily each spawn.
  let soundOn = false;

  let fieldHandle = null, starsHandle = null, auroraHandle = null, ripplesHandle = null;
  if (!reduced) {
    fieldHandle = initField(fieldCanvas);
    starsHandle = initStars(starsCanvas, () => soundOn);
    auroraHandle = initAurora(auroraCanvas);
    ripplesHandle = initRipples(ripplesCanvas);
  }

  // ── ENTRANCE: hero swells in from below, slowly. The pause before sound. ──
  if (!reduced) {
    gsap.set(letters, { yPercent: 110, opacity: 0 });
    gsap.set(layers.back, { opacity: 0 });
    gsap.to(letters, {
      yPercent: 0, opacity: 1,
      duration: 1.6, stagger: 0.09, ease: "expo.out", delay: 0.1,
    });
    gsap.to(layers.back, { opacity: 1, duration: 2.0, delay: 0.4 });
    gsap.from(".cta, .corner, .sound", { opacity: 0, y: 8, duration: 1.0, stagger: 0.1, ease: "expo.out", delay: 1.0 });
  }

  // ── MAGNETIC LETTERS: each letter subtly attracts toward the cursor. ──
  // Cached letter centers (screen coordinates), refreshed after entrance
  // settles and on resize. Per-letter quickTo for x/y so magnetic motion
  // composes with the parent .hero rotation parallax (separate elements)
  // and with the click bow (which uses yPercent, not y/x).
  const MAG_RADIUS = 120;
  const MAG_MAX = 14;
  const letterTo = letters.map((l) => ({
    x: gsap.quickTo(l, "x", { duration: 0.6, ease: "power3.out" }),
    y: gsap.quickTo(l, "y", { duration: 0.6, ease: "power3.out" }),
  }));
  let letterCenters = [];
  function cacheLetterCenters() {
    letterCenters = letters.map((l) => {
      const r = l.getBoundingClientRect();
      return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
    });
  }
  // Cache after the entrance animation has fully settled. Last letter
  // starts at delay 0.1 + (letters.length - 1) * 0.09, runs 1.6s.
  const entranceSettleMs = reduced
    ? 0
    : (0.1 + Math.max(0, letters.length - 1) * 0.09 + 1.6) * 1000 + 100;
  const cacheTimer = setTimeout(cacheLetterCenters, entranceSettleMs);
  // Initial cheap cache so it works even before settle (in case the user
  // mouses in early). Letters are off-screen during entrance, so distances
  // will exceed MAG_RADIUS until they arrive — graceful no-op.
  cacheLetterCenters();
  const onMagResize = () => cacheLetterCenters();
  window.addEventListener("resize", onMagResize);

  // ── CURSOR + WEIGHTY HERO PARALLAX ──
  if (!reduced && halo && dot) {
    const haloX = gsap.quickTo(halo, "x", { duration: 0.55, ease: "power3.out" });
    const haloY = gsap.quickTo(halo, "y", { duration: 0.55, ease: "power3.out" });
    const dotX = gsap.quickTo(dot, "x", { duration: 0.10, ease: "power2.out" });
    const dotY = gsap.quickTo(dot, "y", { duration: 0.10, ease: "power2.out" });

    const heroEl = document.querySelector(".hero");
    // Heavier mass — longer settle than before. 1.6s instead of 1.0.
    const heroRotY = gsap.quickTo(heroEl, "rotationY", { duration: 1.6, ease: "power3.out" });
    const heroRotX = gsap.quickTo(heroEl, "rotationX", { duration: 1.6, ease: "power3.out" });
    gsap.set(heroEl, { transformPerspective: 1600 });
    const backX = gsap.quickTo(layers.back, "x", { duration: 1.8, ease: "power3.out" });
    const backY = gsap.quickTo(layers.back, "y", { duration: 1.8, ease: "power3.out" });
    const midX = gsap.quickTo(layers.mid, "x", { duration: 1.4, ease: "power3.out" });
    const midY = gsap.quickTo(layers.mid, "y", { duration: 1.4, ease: "power3.out" });

    let last = 0;
    window.addEventListener("pointermove", (e) => {
      haloX(e.clientX); haloY(e.clientY);
      dotX(e.clientX); dotY(e.clientY);
      const now = performance.now();
      if (now - last < 16) return;
      last = now;
      if (fieldHandle) fieldHandle.setMouse(e.clientX / window.innerWidth, 1 - e.clientY / window.innerHeight);
      const nx = e.clientX / window.innerWidth - 0.5;
      const ny = e.clientY / window.innerHeight - 0.5;
      heroRotY(nx * 8);
      heroRotX(-ny * 5);
      backX(nx * 32); backY(ny * 18);
      midX(nx * -8); midY(ny * -4);

      // Magnetic letters — each letter is "aware" of nearby cursor.
      for (let i = 0; i < letterCenters.length; i++) {
        const c = letterCenters[i];
        const dx = e.clientX - c.cx;
        const dy = e.clientY - c.cy;
        const dist = Math.hypot(dx, dy);
        if (dist < MAG_RADIUS) {
          const k = (1 - dist / MAG_RADIUS) * MAG_MAX;
          const norm = dist === 0 ? 0 : 1 / dist;
          letterTo[i].x(dx * norm * k);
          letterTo[i].y(dy * norm * k);
        } else {
          letterTo[i].x(0);
          letterTo[i].y(0);
        }
      }
    }, { passive: true });

    document.querySelectorAll(".cta, .corner a, .sound").forEach((el) => {
      el.addEventListener("pointerenter", () => gsap.to(halo, { scale: 1.5, duration: 0.4, ease: "power3.out" }));
      el.addEventListener("pointerleave", () => gsap.to(halo, { scale: 1, duration: 0.5, ease: "power3.out" }));
    });
  }

  // ── SOUND: continuous drone + per-click plucks ──
  function toggleSound(forceOn) {
    const want = forceOn === undefined ? !soundOn : !!forceOn;
    if (want && !audioReady) {
      if (!initAudio()) return;
    }
    soundOn = want;
    if (soundBtn) {
      soundBtn.textContent = soundOn ? "🔊 sound" : "🔇 sound";
      soundBtn.classList.toggle("on", soundOn);
    }
    if (soundOn && Tone) {
      Tone.start().then(() => startDrone()).catch(() => {});
    } else if (droneNodes && droneStarted) {
      droneNodes.padA.stop();
      droneNodes.padE.stop();
      droneStarted = false;
    }
  }
  if (soundBtn) soundBtn.addEventListener("click", () => toggleSound());

  // ── SCALE SHOCK on first click: hero swells +12% then settles ──
  let firstClick = true;
  function scaleShock() {
    if (reduced) return;
    gsap.fromTo(".hero",
      { scale: 1 },
      { scale: 1.12, duration: 0.45, ease: "power2.out" }
    );
    gsap.to(".hero", { scale: 1, duration: 1.6, ease: "elastic.out(1, 0.6)", delay: 0.45 });
  }

  // ── THE ROOM REMEMBERS ──
  // Tab away → hero softens (scales down, blurs). Return → it inhales back
  // with elastic settle. After 30s away, return triggers a soft welcome chord.
  // Separate handler from the shader-pause one in initField — don't interfere.
  if (!reduced) {
    let hiddenAt = 0;
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        hiddenAt = Date.now();
        gsap.to(".hero", {
          scale: 0.92,
          filter: "blur(4px)",
          duration: 1.2,
          ease: "power2.inOut",
        });
      } else {
        const away = Date.now() - hiddenAt;
        if (away < 600) {
          gsap.set(".hero", { scale: 1, filter: "blur(0px)" });
        } else {
          gsap.to(".hero", {
            scale: 1,
            filter: "blur(0px)",
            duration: 1.4,
            ease: "elastic.out(1, 0.6)",
          });
        }
        if (away > 30000 && soundOn) {
          pluck("A3", 0, 0.5);
          pluck("C4", 0.05, 0.45);
          pluck("E4", 0.10, 0.45);
        }
      }
    });
  }

  // ── CLICK: ripple + note. The single most important interaction. ──
  function fireClick(clientX, clientY, isSelf = true) {
    const nx = clientX / window.innerWidth;
    const ny = clientY / window.innerHeight;

    // Visual ripple — both on the field shader (background pulse) and as a
    // crisp ring on the foreground.
    if (fieldHandle) fieldHandle.triggerPulse(nx, 1 - ny);
    if (ripplesHandle) ripplesHandle.add(clientX, clientY, isSelf);

    // Note — pentatonic by X; soft when remote, brighter when self.
    if (soundOn && pluckSynth) {
      const note = noteForX(nx);
      pluck(note, 0, isSelf ? 0.75 : 0.45);
    }

    // Letters bow toward the click — tiny tilt that decays.
    // Uses yPercent so it composes with magnetic x/y (px) on the same letter.
    // Scaled down vs original px: ~1/2 since letters are large (yPercent is
    // % of the letter's own bbox height).
    if (!reduced) {
      letters.forEach((l, i) => {
        const lx = (i + 0.5) / letters.length;
        const dist = Math.abs(lx - nx);
        const push = (1 - Math.min(1, dist * 2.5)) * (isSelf ? 7 : 4);
        gsap.fromTo(l,
          { yPercent: 0 },
          { yPercent: -push, duration: 0.18, ease: "power2.out", overwrite: false }
        );
        gsap.to(l, { yPercent: 0, duration: 1.2, ease: "elastic.out(1, 0.6)", delay: 0.18, overwrite: false });
      });
    }

    if (isSelf && firstClick) {
      firstClick = false;
      scaleShock();
    }
  }

  // Local click — fan out to peers + render locally.
  function onStageClick(e) {
    if (e.target.closest("a, .sound")) return;
    fireClick(e.clientX, e.clientY, true);
    fetch(`${SYNC_BASE}/event`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "click",
        x: e.clientX / window.innerWidth,
        y: e.clientY / window.innerHeight,
        from: SELF_ID,
      }),
      keepalive: true,
    }).catch(() => {});
  }
  document.querySelector(".stage").addEventListener("click", onStageClick);
  // Letters click: same handler, but they catch the event first so we stop propagation.
  letters.forEach((l) => {
    l.addEventListener("click", (e) => {
      e.stopPropagation();
      onStageClick(e);
    });
  });

  // ── KONAMI: ↑↑↓↓←→←→ba — letters backflip, chord plays. ──
  const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
  const konamiBuf = [];
  window.addEventListener("keydown", (e) => {
    konamiBuf.push(e.key);
    if (konamiBuf.length > KONAMI.length) konamiBuf.shift();
    if (konamiBuf.length !== KONAMI.length) return;
    for (let i = 0; i < KONAMI.length; i++) {
      if (konamiBuf[i] !== KONAMI[i]) return;
    }
    konamiBuf.length = 0;
    gsap.to(letters, {
      rotationX: "+=360",
      duration: 1.4,
      ease: "expo.inOut",
      stagger: 0.1,
      transformPerspective: 800,
    });
    if (soundOn) {
      pluck("E3", 0, 0.6);
      pluck("G3", 0, 0.5);
      pluck("A3", 0, 0.5);
      pluck("C4", 0, 0.5);
    }
  });

  // ── PRESENCE / SYNC via SSE ──
  let es = null;
  function connectSync() {
    if (reduced) return;
    try {
      es = new EventSource(`${SYNC_BASE}/events`);
      es.onmessage = (msg) => {
        try {
          const ev = JSON.parse(msg.data);
          if (ev.type === "presence") {
            if (presenceEl) {
              const n = ev.count || 1;
              presenceEl.textContent = n === 1 ? "alone in the room" : `${n} in the room`;
            }
            if (starsHandle) starsHandle.setCount(ev.count || 1);
            return;
          }
          if (ev.from === SELF_ID) return;
          if (ev.type === "click" || ev.type === "tab") {
            const x = (ev.x ?? 0.5) * window.innerWidth;
            const y = (ev.y ?? 0.5) * window.innerHeight;
            fireClick(x, y, false);
          } else if (ev.type === "wave") {
            // Real email arrival — full-screen-center ripple + a deeper note.
            const x = (ev.x ?? 0.5) * window.innerWidth;
            const y = (ev.y ?? 0.18) * window.innerHeight;
            fireClick(x, y, false);
            // Lower bell note for email arrival
            if (soundOn && pluckSynth) pluck("A2", 0, 0.6);
          }
        } catch {}
      };
      es.onerror = () => {
        if (es) { try { es.close(); } catch {} es = null; }
        setTimeout(connectSync, 4000);
      };
    } catch {
      setTimeout(connectSync, 6000);
    }
  }
  connectSync();

  // ── STATS poll for field intensity (subtle background warmth) ──
  let lastStats = null;
  async function pollStats() {
    try {
      const res = await fetch("/api/stats", { cache: "no-cache" });
      if (!res.ok) throw new Error("stats");
      const s = await res.json();
      const pulse = Number(s.recent_pulse || 0);
      const ageScore = (() => {
        const a = s.last_email_age_seconds;
        if (a == null) return 0;
        if (a < 60) return 1;
        if (a < 300) return 0.5;
        if (a < 1800) return 0.25;
        return 0.05;
      })();
      const activeScore = Math.min(1, (s.active_sessions || 0) / 3);
      const intensity = Math.min(1, 0.45 * pulse + 0.35 * activeScore + 0.20 * ageScore);
      if (fieldHandle) fieldHandle.setIntensity(intensity);
      lastStats = s;
    } catch {}
  }
  pollStats();
  const pollInterval = setInterval(pollStats, 5000);

  // ── WIND CHIMES: the room sings to itself ──
  // When sound is on, a soft pentatonic note plays at random intervals
  // (every 6–18s) — even with no interaction. Ambient music; no nagging.
  function chime() {
    if (soundOn && !document.hidden) {
      const note = PENT[Math.floor(Math.random() * PENT.length)];
      pluck(note, 0, 0.25 + Math.random() * 0.15);
      if (ripplesHandle) {
        const x = Math.random() * window.innerWidth;
        const y = Math.random() * window.innerHeight;
        ripplesHandle.add(x, y, false);
      }
    }
    setTimeout(chime, 6000 + Math.random() * 12000);
  }
  setTimeout(chime, 10000);

  // ── CLEANUP ──
  const onPageHide = () => {
    clearInterval(pollInterval);
    clearTimeout(cacheTimer);
    window.removeEventListener("resize", onMagResize);
    if (fieldHandle) fieldHandle.destroy();
    if (starsHandle) starsHandle.destroy();
    if (auroraHandle) auroraHandle.destroy();
    if (ripplesHandle) ripplesHandle.destroy();
    if (es) { try { es.close(); } catch {} }
    gsap.killTweensOf("*");
  };
  window.addEventListener("pagehide", onPageHide);
  return {
    destroy: () => {
      clearInterval(pollInterval);
      clearTimeout(cacheTimer);
      window.removeEventListener("resize", onMagResize);
      if (fieldHandle) fieldHandle.destroy();
      if (starsHandle) starsHandle.destroy();
      if (auroraHandle) auroraHandle.destroy();
      if (ripplesHandle) ripplesHandle.destroy();
      if (es) { try { es.close(); } catch {} }
      window.removeEventListener("pagehide", onPageHide);
      gsap.killTweensOf("*");
    },
  };
}
