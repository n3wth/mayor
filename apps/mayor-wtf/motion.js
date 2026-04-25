// Mayor motion — 2026 Apple/Vercel feel, yellow/black only.
//
// Composition:
//   1. Volumetric yellow mesh-gradient background (WebGL, fragment shader).
//   2. Three-layer parallax MAYOR hero (back halo / body / edge).
//   3. Particle stream — black ink particles flowing through a noise field.
//   4. Glass pill CTA + status chips with backdrop blur.
//   5. Custom cursor (soft yellow halo + tight white dot, both elastic-following).
//   6. Real-event reactions: letter delight, ripples, accent sparks.
//
// All ambient motion is slow + signal-tied. No idle decorative random.

const reduceMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const STATS_URL = "/api/stats";
const POLL_MS = 5000;

const E = {
  out:    "power3.out",
  inOut:  "sine.inOut",
  bounce: "elastic.out(1, 0.55)",
  glide:  "expo.out",
};

const SPARK_COLORS = ["#ffb000", "#4ade80", "#22d3ee", "#c084fc", "#f87171"];

// ── BACKGROUND: WebGL mesh gradient ─────────────────────────────────────
// A single fragment shader renders a slow 3D-feeling yellow surface with
// subtle wells of light. Cool pale yellow at edges, warm core. Drifts.
function initField(canvas) {
  const gl = canvas.getContext("webgl", { antialias: false, alpha: true });
  if (!gl) return null;

  const VS = `
    attribute vec2 a_pos;
    void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
  `;
  // Volumetric mesh: two soft "lights" that drift and interact, on top of
  // a deep yellow base. Gives the page a depth illusion without any image.
  const FS = `
    precision mediump float;
    uniform vec2 u_res;
    uniform float u_time;
    uniform float u_intensity; // 0..1 from stats
    uniform vec2 u_mouse;      // 0..1
    uniform vec2 u_pulse;      // location of last pulse (0..1)
    uniform float u_pulseAge;  // seconds since pulse

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
      for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.07; a *= 0.5; }
      return v;
    }

    void main() {
      vec2 uv = gl_FragCoord.xy / u_res.xy;
      vec2 p = uv * 2.0 - 1.0;
      p.x *= u_res.x / u_res.y;

      float t = u_time * 0.04;

      // Two drifting "wells" of yellow light
      vec2 well1 = vec2(sin(t * 0.7) * 0.6, cos(t * 0.5) * 0.4);
      vec2 well2 = vec2(cos(t * 0.6 + 1.7) * 0.7, sin(t * 0.4 + 0.4) * 0.5);
      float d1 = length(p - well1);
      float d2 = length(p - well2);

      // Mouse acts as a third soft light
      vec2 m = (u_mouse * 2.0 - 1.0) * vec2(u_res.x / u_res.y, 1.0);
      float dm = length(p - m);

      // Domain warp the noise so light "flows"
      vec2 q = vec2(fbm(p + t), fbm(p - t * 0.6));
      float n = fbm(p * 1.8 + q * (0.5 + u_intensity * 0.5));

      // Base yellow tint, slightly warmer toward the cores
      vec3 cool = vec3(0.95, 0.89, 0.21);   // #f2e437-ish
      vec3 warm = vec3(1.00, 0.69, 0.0);    // #ffb000
      vec3 deep = vec3(0.84, 0.77, 0.10);   // y-deep

      float light1 = smoothstep(1.6, 0.0, d1);
      float light2 = smoothstep(1.4, 0.0, d2);
      float lightM = smoothstep(0.7, 0.0, dm) * 0.6;

      vec3 col = mix(deep, cool, light1);
      col = mix(col, warm, light2 * 0.6);
      col += vec3(0.04, 0.03, 0.0) * lightM;

      // Modulate brightness by noise to give a subtle 3D feel
      float shade = 0.55 + n * 0.5;
      col *= shade;

      // Pulse ring from last event
      float pulseR = u_pulseAge * 0.9;
      vec2 pp = (u_pulse * 2.0 - 1.0) * vec2(u_res.x / u_res.y, 1.0);
      float pd = length(p - pp);
      float ring = exp(-pow((pd - pulseR) * 8.0, 2.0)) * exp(-u_pulseAge * 0.7);
      col += vec3(ring * 0.5);

      // Strong vignette so HUD remains readable
      float vig = smoothstep(1.7, 0.4, length(p));
      col *= mix(0.4, 1.05, vig);

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

  let dpr = Math.min(2, window.devicePixelRatio || 1);
  function resize() {
    canvas.width = (canvas.clientWidth * dpr) | 0;
    canvas.height = (canvas.clientHeight * dpr) | 0;
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  resize();
  window.addEventListener("resize", resize);

  let state = { intensity: 0, mouse: [0.5, 0.5], pulse: [0.5, 0.5], pulseStart: -10 };
  const t0 = performance.now();

  let raf = 0;
  function tick() {
    const t = (performance.now() - t0) / 1000;
    gl.uniform2f(u.res, canvas.width, canvas.height);
    gl.uniform1f(u.time, t);
    gl.uniform1f(u.intensity, state.intensity);
    gl.uniform2f(u.mouse, state.mouse[0], state.mouse[1]);
    gl.uniform2f(u.pulse, state.pulse[0], state.pulse[1]);
    gl.uniform1f(u.pulseAge, t - state.pulseStart);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
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

// ── PARTICLE STREAM ─────────────────────────────────────────────────────
// Tiny black particles flow through a noise-warped flow field. They feel
// like ink suspended in the yellow plane. Density scales with active sessions.
function initStream(canvas, getDensity) {
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

  const MAX = 120;
  const particles = [];
  for (let i = 0; i < MAX; i++) {
    particles.push({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: 0, vy: 0,
      life: Math.random() * 200 + 50,
      age: 0,
      r: 0.6 + Math.random() * 1.6,
      alive: false,
    });
  }

  // Cheap noise for flow field direction
  function noise2(x, y) {
    const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return n - Math.floor(n);
  }
  function flowAngle(x, y, t) {
    const fx = x * 0.0018 + t * 0.05;
    const fy = y * 0.0018;
    return (noise2(Math.floor(fx * 4) / 4, Math.floor(fy * 4) / 4) +
            noise2(Math.floor(fx * 2) / 2, Math.floor(fy * 2) / 2) * 0.5) * Math.PI * 2;
  }

  let raf = 0;
  let t = 0;
  function tick() {
    t += 0.016;
    // Fade trail
    ctx.fillStyle = "rgba(0, 0, 0, 0)";
    ctx.clearRect(0, 0, W, H);

    const target = Math.min(MAX, Math.max(20, getDensity()));
    let alive = 0;
    for (const p of particles) if (p.alive) alive++;

    // Spawn / kill to match target
    if (alive < target) {
      for (const p of particles) {
        if (alive >= target) break;
        if (!p.alive) {
          p.alive = true;
          p.x = Math.random() * W;
          p.y = Math.random() * H;
          p.age = 0;
          p.life = 80 + Math.random() * 200;
          alive++;
        }
      }
    } else if (alive > target) {
      for (const p of particles) {
        if (alive <= target) break;
        if (p.alive && Math.random() < 0.02) { p.alive = false; alive--; }
      }
    }

    ctx.fillStyle = "rgba(0,0,0,0.65)";
    for (const p of particles) {
      if (!p.alive) continue;
      const a = flowAngle(p.x, p.y, t);
      p.vx = p.vx * 0.85 + Math.cos(a) * 0.7;
      p.vy = p.vy * 0.85 + Math.sin(a) * 0.7;
      p.x += p.vx;
      p.y += p.vy;
      p.age++;
      if (p.age > p.life || p.x < -10 || p.x > W + 10 || p.y < -10 || p.y > H + 10) {
        p.alive = false;
        continue;
      }
      const fadeIn = Math.min(1, p.age / 30);
      const fadeOut = Math.min(1, (p.life - p.age) / 30);
      const alpha = Math.min(fadeIn, fadeOut) * 0.45;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * dpr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);

  return {
    destroy: () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); },
  };
}

// ── SPARK BURST ──────────────────────────────────────────────────────────
function emitSparks(gsap, container, x, y, count, opts = {}) {
  if (!container) return;
  const palette = opts.colors || SPARK_COLORS;
  const radius = opts.radius || 200;
  for (let i = 0; i < count; i++) {
    const el = document.createElement("div");
    el.className = "spark";
    const color = palette[Math.floor(Math.random() * palette.length)];
    const size = 4 + Math.random() * 6;
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.background = color;
    el.style.boxShadow = `0 0 ${size * 2}px ${color}`;
    container.appendChild(el);
    const angle = Math.random() * Math.PI * 2;
    const dist = radius * (0.5 + Math.random() * 0.6);
    gsap.fromTo(el,
      { x: 0, y: 0, scale: 0.2, opacity: 1 },
      { x: Math.cos(angle) * dist, y: Math.sin(angle) * dist, scale: 1, duration: 0.5, ease: "power3.out" }
    );
    gsap.to(el, {
      opacity: 0, scale: 0,
      duration: 1.2, ease: "power2.in", delay: 0.3,
      onComplete: () => el.remove(),
    });
  }
}

export function initMotion(gsap) {
  if (!gsap) return { destroy: () => {} };
  const reduced = reduceMotion();

  const sparksLayer = document.querySelector("[data-sparks]");
  const fieldCanvas = document.querySelector("[data-field]");
  const streamCanvas = document.querySelector("[data-stream]");
  const halo = document.querySelector("[data-cursor-halo]");
  const dot = document.querySelector("[data-cursor-dot]");
  const layers = {
    back:  document.querySelector('[data-layer="back"]'),
    mid:   document.querySelector('[data-layer="mid"]'),
    front: document.querySelector('[data-layer="front"]'),
  };
  const letters = Array.from(document.querySelectorAll(".ml"));
  letters.forEach((l) => {
    l.style.transformBox = "fill-box";
    l.style.transformOrigin = "center 80%";
  });

  // ── FIELD + STREAM ──
  let fieldHandle = null, streamHandle = null;
  let streamDensity = 30;
  if (!reduced) {
    fieldHandle = initField(fieldCanvas);
    streamHandle = initStream(streamCanvas, () => streamDensity);
  }

  // ── HERO ENTRANCE: scale from 0.94 + blur out ──
  if (!reduced) {
    gsap.from(".hero", {
      scale: 0.94,
      filter: "blur(20px)",
      opacity: 0,
      duration: 1.6,
      ease: E.glide,
    });
    gsap.from(".glass, .topright, .status", {
      opacity: 0, y: 12,
      duration: 1.0,
      stagger: 0.1,
      ease: E.glide,
      delay: 0.6,
    });
  }

  // ── CURSOR: halo follows with elastic delay, dot is precise ──
  if (!reduced && halo && dot) {
    const haloX = gsap.quickTo(halo, "x", { duration: 0.6, ease: "power3.out" });
    const haloY = gsap.quickTo(halo, "y", { duration: 0.6, ease: "power3.out" });
    const dotX = gsap.quickTo(dot, "x", { duration: 0.12, ease: "power2.out" });
    const dotY = gsap.quickTo(dot, "y", { duration: 0.12, ease: "power2.out" });
    window.addEventListener("pointermove", (e) => {
      haloX(e.clientX); haloY(e.clientY);
      dotX(e.clientX); dotY(e.clientY);
      if (fieldHandle) fieldHandle.setMouse(e.clientX / window.innerWidth, 1 - e.clientY / window.innerHeight);
      // Parallax depth: layers move different amounts
      const nx = e.clientX / window.innerWidth - 0.5;
      const ny = e.clientY / window.innerHeight - 0.5;
      gsap.to(layers.back, { x: nx * 22, y: ny * 12, duration: 1.2, ease: "power3.out" });
      gsap.to(layers.mid,  { x: nx * -10, y: ny * -6,  duration: 0.9, ease: "power3.out" });
      gsap.to(layers.front,{ x: nx * 30, y: ny * 18, duration: 0.7, ease: "power3.out" });
    }, { passive: true });

    // Cursor grows over interactive elements
    document.querySelectorAll(".glass, .topright, .status").forEach((el) => {
      el.addEventListener("pointerenter", () => gsap.to(halo, { scale: 1.6, duration: 0.4, ease: "power3.out" }));
      el.addEventListener("pointerleave", () => gsap.to(halo, { scale: 1, duration: 0.5, ease: "power3.out" }));
    });
  }

  // ── LETTER DELIGHT (on real events) ──
  function delightLetter(opts = {}) {
    if (reduced || !letters.length) return;
    const letter = opts.letter || letters[Math.floor(Math.random() * letters.length)];
    gsap.timeline({ overwrite: false })
      .to(letter, { yPercent: -8, scale: 1.08, duration: 0.4, ease: "back.out(2.4)" }, 0)
      .to(letter, { rotation: (Math.random() - 0.5) * 14, duration: 0.4, ease: "back.out(2)" }, 0)
      .to(letter, { yPercent: 0, scale: 1, rotation: 0, duration: 1.4, ease: E.bounce }, 0.4);

    if (sparksLayer) {
      const rect = letter.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const count = opts.count ?? 16;
      for (let i = 0; i < count; i++) {
        const el = document.createElement("div");
        el.className = "spark";
        const color = SPARK_COLORS[Math.floor(Math.random() * SPARK_COLORS.length)];
        const size = 4 + Math.random() * 7;
        el.style.width = `${size}px`;
        el.style.height = `${size}px`;
        el.style.left = `${cx}px`;
        el.style.top = `${cy}px`;
        el.style.background = color;
        el.style.boxShadow = `0 0 ${size * 2.4}px ${color}`;
        sparksLayer.appendChild(el);
        const baseAngle = -Math.PI / 2;
        const angle = baseAngle + (Math.random() - 0.5) * 1.6;
        const dist = 80 + Math.random() * 240;
        const dx = Math.cos(angle) * dist;
        const dy = Math.sin(angle) * dist;
        const dur = 1.0 + Math.random() * 0.9;
        gsap.fromTo(el,
          { x: 0, y: 0, scale: 0.2, opacity: 1 },
          { x: dx, y: dy + 30, scale: 1, duration: dur, ease: "power2.out" }
        );
        gsap.to(el, { y: dy + 180, duration: dur * 0.9, delay: dur * 0.7, ease: "power2.in" });
        gsap.to(el, {
          opacity: 0, scale: 0.2,
          duration: 0.6, delay: dur * 1.1, ease: "power2.in",
          onComplete: () => el.remove(),
        });
      }
    }
  }

  // ── CLICK SHOCKWAVE: pulse the field + shock the letters ──
  function shockwave(e) {
    if (reduced) return;
    if (fieldHandle && e) {
      fieldHandle.triggerPulse(e.clientX / window.innerWidth, 1 - e.clientY / window.innerHeight);
    }
    if (e && sparksLayer) emitSparks(gsap, sparksLayer, e.clientX, e.clientY, 10, { radius: 180 });
    if (Math.random() < 0.34) delightLetter({ count: 12 });
    // Letters tilt as the wave passes
    letters.forEach((l, i) => {
      gsap.fromTo(l,
        { skewX: 0 },
        { skewX: (i % 2 === 0 ? 4 : -4), duration: 0.18, ease: "power2.out", delay: i * 0.04 }
      );
      gsap.to(l, { skewX: 0, duration: 1.0, ease: E.bounce, delay: i * 0.04 + 0.18 });
    });
  }
  if (!reduced) {
    document.querySelector(".stage").addEventListener("click", (e) => {
      if (e.target.closest("a")) return;
      shockwave(e);
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        shockwave({ clientX: window.innerWidth / 2, clientY: window.innerHeight / 2 });
      }
    });
  }

  // ── TAB-RETURN ──
  if (!reduced) {
    let hiddenAt = 0;
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) { hiddenAt = Date.now(); return; }
      if (hiddenAt && Date.now() - hiddenAt > 600) {
        delightLetter({ count: 14 });
      }
      hiddenAt = 0;
    });
  }

  // ── SIGNAL ENGINE ──
  let lastStats = null;
  const statusEl = document.querySelector('[data-stat="status"]');

  function applyStats(s) {
    // Status chip — implicit
    if (statusEl) {
      const active = s.active_sessions || 0;
      const sessions = s.sessions_today || 0;
      const citizens = s.citizens || 0;
      if (s.online === false) statusEl.textContent = "offline";
      else if (active > 0) statusEl.textContent = `${active} active · ${citizens} citizens`;
      else statusEl.textContent = `${sessions} today · ${citizens} citizens`;
    }

    // Pulse intensity — controls field warmth + stream density
    const pulse = Number(s.recent_pulse || 0);
    const ageScore = (() => {
      const a = s.last_email_age_seconds;
      if (a == null) return 0;
      if (a < 60) return 1;
      if (a < 300) return 0.6;
      if (a < 1800) return 0.35;
      return 0.1;
    })();
    const activeScore = Math.min(1, (s.active_sessions || 0) / 3);
    const intensity = Math.min(1, 0.45 * pulse + 0.35 * activeScore + 0.20 * ageScore);

    if (fieldHandle) fieldHandle.setIntensity(intensity);
    streamDensity = 25 + Math.round(intensity * 70);

    // EVENTS — real changes since last poll
    if (lastStats) {
      const newSession = (s.sessions_today || 0) > (lastStats.sessions_today || 0);
      const newCitizen = (s.citizens || 0) > (lastStats.citizens || 0);
      if (newSession) {
        delightLetter({ count: 18 });
        if (fieldHandle) fieldHandle.triggerPulse(0.5, 0.18);
      }
      if (newCitizen) {
        letters.forEach((l, i) => setTimeout(() => delightLetter({ letter: l, count: 10 }), i * 90));
        if (fieldHandle) fieldHandle.triggerPulse(0.5, 0.5);
      }
    }
    lastStats = s;
  }

  async function pollStats() {
    try {
      const res = await fetch(STATS_URL, { cache: "no-cache" });
      if (!res.ok) throw new Error("stats");
      applyStats(await res.json());
    } catch {
      applyStats({
        online: false,
        citizens: lastStats?.citizens || 0,
        sessions_today: lastStats?.sessions_today || 0,
        sessions_this_hour: 0,
        last_email_age_seconds: null,
        active_sessions: 0,
        recent_pulse: 0,
      });
    }
  }

  pollStats();
  const pollInterval = setInterval(pollStats, POLL_MS);

  const onPageHide = () => {
    clearInterval(pollInterval);
    if (fieldHandle) fieldHandle.destroy();
    if (streamHandle) streamHandle.destroy();
    gsap.killTweensOf("*");
  };
  window.addEventListener("pagehide", onPageHide);
  return {
    destroy: () => {
      clearInterval(pollInterval);
      if (fieldHandle) fieldHandle.destroy();
      if (streamHandle) streamHandle.destroy();
      window.removeEventListener("pagehide", onPageHide);
      gsap.killTweensOf("*");
    },
  };
}
