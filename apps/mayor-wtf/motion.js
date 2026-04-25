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
    uniform float u_psy;     // 0..1 — psychedelic depth (drifts over time)
    uniform float u_chaos;   // 0..1 — chaos burst (event-driven, decays fast)

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

    // Hue rotate via simple matrix.
    vec3 hueShift(vec3 c, float h) {
      const vec3 k = vec3(0.57735, 0.57735, 0.57735);
      float cs = cos(h), sn = sin(h);
      return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
    }

    void main() {
      vec2 uv = gl_FragCoord.xy / u_res.xy;
      vec2 p = uv * 2.0 - 1.0;
      p.x *= u_res.x / u_res.y;

      float t = u_time * 0.025;

      // Psychedelic warp: a slow rotation + radial breathing keyed to u_psy.
      float ang = u_psy * sin(u_time * 0.13) * 0.6 + u_chaos * 1.4;
      float ca = cos(ang), sa = sin(ang);
      p = mat2(ca, -sa, sa, ca) * p;
      float swirl = u_psy * 0.4 + u_chaos * 1.2;
      float r = length(p);
      p += vec2(-p.y, p.x) * sin(r * 4.0 - u_time * 0.6) * swirl * 0.15;

      vec2 well1 = vec2(sin(t * 0.7) * 0.55, cos(t * 0.5) * 0.30);
      vec2 well2 = vec2(cos(t * 0.6 + 1.7) * 0.65, sin(t * 0.4 + 0.4) * 0.45);
      float d1 = length(p - well1);
      float d2 = length(p - well2);
      vec2 m = (u_mouse * 2.0 - 1.0) * vec2(u_res.x / u_res.y, 1.0);
      float dm = length(p - m);

      vec2 q = vec2(fbm(p + t), fbm(p - t * 0.6));
      float n = fbm(p * 1.5 + q * (0.4 + u_intensity * 0.4 + u_psy * 0.6));

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

      // Pulse ring (clicks)
      float pulseR = u_pulseAge * 0.85;
      vec2 pp = (u_pulse * 2.0 - 1.0) * vec2(u_res.x / u_res.y, 1.0);
      float pd = length(p - pp);
      float ring = exp(-pow((pd - pulseR) * 5.5, 2.0)) * exp(-u_pulseAge * 0.55);
      col += hi * ring * 0.55;

      // Psychedelic hue shift — yellow stays anchor at u_psy=0, drifts otherwise.
      float h = u_psy * 1.4 * sin(u_time * 0.07 + n * 4.0) + u_chaos * 3.0 * sin(u_time * 1.2 + r * 8.0);
      col = hueShift(col, h);

      // Chaos burst: glitchy color separation
      if (u_chaos > 0.001) {
        float gj = u_chaos * 0.15;
        col.r *= 1.0 + sin(uv.y * 80.0 + u_time * 12.0) * gj;
        col.b *= 1.0 - sin(uv.y * 80.0 + u_time * 12.0 + 1.5) * gj;
      }

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
    psy: gl.getUniformLocation(prog, "u_psy"),
    chaos: gl.getUniformLocation(prog, "u_chaos"),
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

  let state = { intensity: 0, mouse: [0.5, 0.5], pulse: [0.5, 0.5], pulseStart: -10, psy: 0, chaos: 0 };
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
      gl.uniform1f(u.psy, state.psy);
      gl.uniform1f(u.chaos, state.chaos);
      // Chaos decays naturally each frame so the JS just bumps it.
      state.chaos *= 0.94;
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);

  return {
    setIntensity: (v) => { state.intensity = Math.max(0, Math.min(1, v)); },
    setMouse: (x, y) => { state.mouse = [x, y]; },
    setPsy: (v) => { state.psy = Math.max(0, Math.min(1, v)); },
    triggerChaos: (v = 1) => { state.chaos = Math.max(state.chaos, Math.max(0, Math.min(1, v))); },
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
function initStars(canvas, getSoundOn, getSingingCount) {
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
  // How many peers are currently "singing" (held tones active).
  // Stars at indices 1..singCount get a slightly larger/brighter render
  // so the chord is something you can both hear and see.
  const singing = () => {
    if (typeof getSingingCount === "function") {
      const n = getSingingCount() | 0;
      return Math.max(0, Math.min(count - 1, n));
    }
    return 0;
  };

  // Per-peer brightness boost. setBrightFor(idx, 1) when a peer's cursor
  // moves; decays to 0 over ~600ms. Star alpha uses (1 + bright * 1.5)
  // so the star noticeably blooms while a peer is in motion.
  const brightness = new Map(); // peerIndex -> { value, lastTs }
  const BRIGHT_DECAY_MS = 600;

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
      const sing = singing();
      for (let i = 1; i < count; i++) {
        // Stable drift — each visitor has unique slow elliptical orbit.
        const seed = i * 13.37;
        const cx = W * (0.5 + 0.32 * Math.sin(t * 0.06 + seed));
        const cy = H * (0.5 + 0.22 * Math.cos(t * 0.07 + seed * 1.3));
        // Sounding peers swell ~25% larger and gain a brighter core, so
        // the chord is visible as well as audible.
        const isSinging = i <= sing;
        const sizeMul = isSinging ? 1.25 : 1.0;
        const r = (10 + Math.sin(t * 0.5 + seed) * 4) * dpr * sizeMul;

        // Per-peer brightness — decays linearly over BRIGHT_DECAY_MS.
        let bloom = 1;
        const b = brightness.get(i);
        if (b) {
          const age = now - b.lastTs;
          const v = age >= BRIGHT_DECAY_MS ? 0 : b.value * (1 - age / BRIGHT_DECAY_MS);
          if (v <= 0) brightness.delete(i);
          else bloom = 1 + v * 1.5;
        }

        // Soft yellow glow — alpha scaled by bloom.
        const a0 = Math.min(1, 0.55 * bloom);
        const a1 = Math.min(1, 0.18 * bloom);
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 6);
        // Combine presence-bloom with starfield 'is singing' brightness multiplier.
        const sm = isSinging ? 1.36 : 1.0;
        grad.addColorStop(0, `rgba(255, 220, 80, ${Math.min(1, 0.55 * bloom * sm).toFixed(3)})`);
        grad.addColorStop(0.4, `rgba(255, 200, 60, ${Math.min(1, 0.18 * bloom * sm).toFixed(3)})`);
        grad.addColorStop(1, "rgba(255, 200, 60, 0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 6, 0, Math.PI * 2);
        ctx.fill();

        // Bright core — combine bloom * sm.
        const ac = Math.min(1, 0.95 * bloom * (isSinging ? 1.05 : 1.0));
        ctx.fillStyle = isSinging ? `rgba(255,250,210,${ac.toFixed(3)})` : `rgba(255,240,160,${ac.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(cx, cy, (isSinging ? 2.6 : 2) * dpr, 0, Math.PI * 2);
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
    setBrightFor: (idx, value = 1) => {
      const i = idx | 0;
      if (i <= 0) return;
      brightness.set(i, { value: Math.max(0, Math.min(1, value)), lastTs: performance.now() });
    },
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
        const fade = Math.max(0, 1 - age / 2.6);
        // Ghost ripples: subtle white outline. Self: bright yellow.
        // Peer: dimmer yellow.
        let alpha, color, lw;
        if (r.ghost) {
          alpha = fade * 0.5 * (r.softness ?? 1);
          color = `rgba(235, 235, 240, ${alpha})`;
          lw = 1.4 * dpr;
        } else if (r.self) {
          alpha = fade * 0.85;
          color = `rgba(255, 220, 80, ${alpha})`;
          lw = 2.2 * dpr;
        } else {
          alpha = fade * 0.55;
          color = `rgba(255, 220, 80, ${alpha})`;
          lw = 1.6 * dpr;
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.arc(r.x * dpr, r.y * dpr, radius, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);

  return {
    add: (x, y, self = false, opts = null) => {
      const ghost = !!(opts && opts.ghost);
      const softness = opts && typeof opts.softness === "number" ? opts.softness : 1;
      ripples.push({ x, y, self, ghost, softness, t0: performance.now() });
      if (ripples.length > 24) ripples.shift();
    },
    destroy: () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); },
  };
}

// ── CURSOR TRAIL ─────────────────────────────────────────────────────────
// Soft yellow particles spawn on pointermove, drift slowly outward, fade in
// ~1.5s. A quiet mark — the cursor leaves a breath behind it.
function initTrail(canvas) {
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

  const MAX = 150;
  const particles = [];
  let raf = 0;
  let paused = false;
  document.addEventListener("visibilitychange", () => { paused = document.hidden; });

  function tick() {
    if (!paused) {
      ctx.clearRect(0, 0, W, H);
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.age++;
        if (p.age >= p.life) { particles.splice(i, 1); continue; }
        p.x += p.vx;
        p.y += p.vy;
        const t = p.age / p.life;
        const alpha = (1 - t) * 0.55;
        const r = (1.6 + t * 1.4) * dpr;
        ctx.fillStyle = `rgba(255, 220, 80, ${alpha})`;
        ctx.beginPath();
        ctx.arc(p.x * dpr, p.y * dpr, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);

  return {
    addPoint: (x, y) => {
      const n = 1 + ((Math.random() * 3) | 0); // 1–3 particles per call
      for (let i = 0; i < n; i++) {
        if (particles.length >= MAX) particles.shift();
        particles.push({
          x, y,
          vx: (Math.random() - 0.5) * 0.6,
          vy: (Math.random() - 0.5) * 0.6,
          age: 0,
          life: 70 + ((Math.random() * 30) | 0), // 70–100 frames (~1.2–1.7s)
        });
      }
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
// Presence instruments — each peer's cursor sings. Soft glissando plucks
// triggered on remote ptr events, panned by their cursor X.
let presenceSynth = null;
let presencePanner = null;

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

// Generative composition state.
// A minor pentatonic over chord progressions: i (Am), VI (F), III (C), VII (G).
// Each chord lives 8 bars. Visitors entering the room hear the same plan.
const CHORDS = [
  { root: "A", scale: ["A", "C", "D", "E", "G"], bass: "A1" },
  { root: "F", scale: ["F", "A", "C", "D", "E"], bass: "F1" },
  { root: "C", scale: ["C", "E", "G", "A", "D"], bass: "C2" },
  { root: "G", scale: ["G", "B", "D", "E", "A"], bass: "G1" },
];
// "Conductor" support: map chord-card name → CHORDS index. Server uses "Am"
// (with the "m" qualifier) for the minor i; CHORDS[0].root is "A".
const CHORD_INDEX_BY_ROOT = { Am: 0, F: 1, C: 2, G: 3 };
// When non-null, playStep + generative loops use this chord instead of the
// auto-rotating cycle. Cleared when chord is "released" (currently never —
// once conducted, the room stays on that chord until next conduct).
let chordOverride = null;
let bassSynth = null, leadSynth = null;
let genLoop = null, bassLoop = null;
let genActive = false;
let presenceForGen = 1;

// ── STARFIELD MUSIC ──
// One held note per visitor. Peer index → chord-tone. As people arrive
// the room literally sings; a held pentatonic chord forms from presence
// alone. Long attack/release so notes fade in/out as visitors join/leave.
const PEER_TONES = ["A3", "C4", "E4", "G4", "A4"];
function peerTone(peerIdx) {
  // peerIdx is 1-based (i=0 is self). Wrap by octave after 5 peers.
  const n = Math.max(1, peerIdx | 0) - 1; // 0-based
  const slot = n % PEER_TONES.length;
  const oct = (n / PEER_TONES.length) | 0;
  const base = PEER_TONES[slot];
  if (oct === 0) return base;
  // Bump octave digit by `oct`.
  const m = base.match(/^([A-G]#?)(-?\d+)$/);
  if (!m) return base;
  return m[1] + (parseInt(m[2], 10) + oct);
}
let peerSynth = null;
let peerNotes = []; // active held notes, indexed by peer index 1..N → notes[i-1]
let peerSingCount = 0; // currently sounding peers (== peerNotes.length while soundOn)

function initAudio() {
  if (audioReady) return true;
  Tone = window.Tone;
  if (!Tone) return false;

  // Master reverb chain — shared across pads, leads, plucks for a
  // unified room sound. Wet rises with psy externally.
  const reverb = new Tone.Reverb({ decay: 8, wet: 0.6 }).toDestination();
  const filter = new Tone.Filter(800, "lowpass").connect(reverb);
  filter.Q.value = 0.9;

  const padA = new Tone.Oscillator({ type: "sine", frequency: "A2", volume: -22 }).connect(filter);
  const padE = new Tone.Oscillator({ type: "sine", frequency: "E3", volume: -22 }).connect(filter);
  const lfo = new Tone.LFO({ frequency: 0.05, min: -8, max: 8 }).start();
  lfo.connect(padE.detune);

  // Pluck — bright marimba-ish for clicks.
  pluckSynth = new Tone.Synth({
    oscillator: { type: "triangle" },
    envelope: { attack: 0.005, decay: 0.4, sustain: 0.0, release: 1.2 },
  });
  const pluckReverb = new Tone.Reverb({ decay: 4.5, wet: 0.45 }).toDestination();
  pluckSynth.connect(pluckReverb);
  pluckSynth.volume.value = -10;

  // Bass — soft sine sub with slow attack. Plays root every bar.
  bassSynth = new Tone.MonoSynth({
    oscillator: { type: "sine" },
    envelope: { attack: 0.06, decay: 0.4, sustain: 0.4, release: 1.2 },
    filterEnvelope: { attack: 0.04, decay: 0.3, sustain: 0.4, release: 1.0, baseFrequency: 120, octaves: 2 },
  }).connect(reverb);
  bassSynth.volume.value = -16;

  // Lead — slow attack triangle through filter. Plays the Markov melody.
  leadSynth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "triangle" },
    envelope: { attack: 0.02, decay: 0.5, sustain: 0.0, release: 1.0 },
  }).connect(filter);
  leadSynth.volume.value = -14;

  // Presence glissando — soft single notes when peers move their cursor.
  presencePanner = new Tone.Panner(0).connect(reverb);
  presenceSynth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "sine" },
    envelope: { attack: 0.01, decay: 0.2, sustain: 0.0, release: 0.6 },
  }).connect(presencePanner);
  presenceSynth.volume.value = -28;

  // Peer chord — each visitor holds a long pentatonic note while connected.
  // 3s attack/release so arrivals/departures bloom and dissolve gently.
  const peerReverb = new Tone.Reverb({ decay: 6, wet: 0.5 }).toDestination();
  const peerFilter = new Tone.Filter(2000, "lowpass").connect(peerReverb);
  peerSynth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "sine" },
    envelope: { attack: 3, decay: 0.5, sustain: 1, release: 3 },
  }).connect(peerFilter);
  peerSynth.volume.value = -28;

  droneNodes = { padA, padE, filter, reverb, lfo };
  audioReady = true;
  return true;
}

// ── PEER VOICES ──
// Sync the held-note chord to the current peer count. Peers leaving
// release their notes; peers arriving attack a fresh tone. Each visitor
// only sings while soundOn — silent users still see stars, just no notes.
function setPeerSinging(n, soundOn) {
  if (!peerSynth || !Tone) { peerSingCount = 0; return; }
  const desired = soundOn ? Math.max(0, (n | 0) - 1) : 0; // exclude self
  const now = Tone.now();
  // Release any notes above the new desired count.
  while (peerNotes.length > desired) {
    const note = peerNotes.pop();
    try { peerSynth.triggerRelease(note, now); } catch {}
  }
  // Attack new notes for arriving peers.
  while (peerNotes.length < desired) {
    const idx = peerNotes.length + 1; // peer index, 1-based
    const note = peerTone(idx);
    peerNotes.push(note);
    try { peerSynth.triggerAttack(note, now); } catch {}
  }
  peerSingCount = peerNotes.length;
}

function silencePeers() {
  if (!peerSynth || !Tone) { peerNotes = []; peerSingCount = 0; return; }
  const now = Tone.now();
  for (const note of peerNotes) {
    try { peerSynth.triggerRelease(note, now); } catch {}
  }
  peerNotes = [];
  peerSingCount = 0;
}

// Markov state for the lead — index into the current chord's scale.
let leadIdx = 2;
function markovStep() {
  // 60% step in random direction, 25% leap of 2, 15% rest (return -1).
  const r = Math.random();
  if (r < 0.15) return -1;
  if (r < 0.40) leadIdx += (Math.random() < 0.5 ? -2 : 2);
  else leadIdx += (Math.random() < 0.5 ? -1 : 1);
  // Keep in [0, scale.length-1] modulo octave: wrap with reflection.
  if (leadIdx < 0) leadIdx = -leadIdx;
  if (leadIdx > 6) leadIdx = 12 - leadIdx;
  if (leadIdx < 0) leadIdx = 1;
  return leadIdx;
}

// Resolve the chord every loop tick: an explicit override beats the cycle.
function currentGenChord(cycleIdx) {
  if (chordOverride != null) {
    return CHORDS[chordOverride] || CHORDS[0];
  }
  return CHORDS[cycleIdx % CHORDS.length];
}

function startGenerative() {
  if (!Tone || genActive) return;
  Tone.Transport.bpm.value = 64;
  Tone.Transport.start();

  // Master 8-bar chord cycle. Each bar advances the bass note.
  let bar = 0;
  let chordIdx = 0;
  bassLoop = new Tone.Loop((time) => {
    if (!genActive) return;
    const ch = currentGenChord(chordIdx);
    // Bass on beat 1; only when 2+ visitors present.
    if (presenceForGen >= 2) bassSynth.triggerAttackRelease(ch.bass, "2n", time, 0.55);
    bar++;
    if (bar % 8 === 0) chordIdx++;
  }, "1m").start(0);

  // Lead Markov melody — eighth-note grid, restful.
  genLoop = new Tone.Loop((time) => {
    if (!genActive || presenceForGen < 1) return;
    const ch = currentGenChord(chordIdx);
    const step = markovStep();
    if (step < 0) return; // rest
    const scale = ch.scale;
    const oct = 4 + ((Math.floor(step / scale.length)) | 0);
    const note = scale[((step % scale.length) + scale.length) % scale.length] + oct;
    // Velocity falls when many visitors so it doesn't crowd.
    const v = 0.22 + Math.random() * 0.2;
    try { leadSynth.triggerAttackRelease(note, "8n", time, v); } catch {}
  }, "8n").start("4n");

  genActive = true;
}

// "Conduct" the room to a specific chord. Sets chordOverride and re-anchors
// Tone.Transport to bar 0 so the new chord lands cleanly on the next bar.
// Called from the chord-wheel UI and from inbound `chord` SSE events.
function applyChord(root) {
  if (!Object.prototype.hasOwnProperty.call(CHORD_INDEX_BY_ROOT, root)) return;
  chordOverride = CHORD_INDEX_BY_ROOT[root];
  // Re-anchor: snap transport position to bar 0 so the conducted chord
  // owns the next downbeat instead of slicing into the current bar.
  if (window.Tone && window.Tone.Transport) {
    try { window.Tone.Transport.position = "0:0:0"; } catch {}
  }
}

function stopGenerative() {
  if (!genActive) return;
  if (genLoop) { genLoop.stop(); genLoop.dispose(); genLoop = null; }
  if (bassLoop) { bassLoop.stop(); bassLoop.dispose(); bassLoop = null; }
  try { Tone.Transport.stop(); } catch {}
  genActive = false;
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

// Soft glissando for a peer cursor at normalized x in [0..1]. Picks a
// note from the upper pentatonic register (PENT[8..14]) and pans by x.
function presencePluck(nx) {
  if (!presenceSynth || !presencePanner || !Tone) return;
  try {
    // PENT[8..14] is the airy upper octave region — feels like wind, not
    // melody. Index range = 7 entries (8..14 inclusive).
    const i = 8 + Math.max(0, Math.min(6, Math.floor(nx * 7)));
    const note = PENT[i];
    // Pan: x=0 → -0.7 (left), x=1 → +0.7 (right).
    const pan = (nx * 2 - 1) * 0.7;
    presencePanner.pan.rampTo(pan, 0.05);
    presenceSynth.triggerAttackRelease(note, "16n", Tone.now(), 0.35);
  } catch {}
}

// ── ENTRY POINT ──────────────────────────────────────────────────────────
export function initMotion(gsap) {
  if (!gsap) return { destroy: () => {} };
  const reduced = reduceMotion();

  const fieldCanvas = document.querySelector("[data-field]");
  const starsCanvas = document.querySelector("[data-stars]");
  const auroraCanvas = document.querySelector("[data-aurora]");
  const trailCanvas = document.querySelector("[data-trail]");
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
  // Echo: idle-replay state (referenced from pointermove/click handlers below)
  let lastInteractionAt = Date.now();
  let lastClick = null;
  // Groove Evolver: "human just did something" timestamp.
  let lastUserInteractionAt = Date.now();
  // Ghost recorder: 'r' captures clicks for up to 16s, loops back as 4 fading echoes.
  const ghostState = {
    recording: false,
    startedAt: 0,
    events: [],
    playbackTimers: [],
    indicatorEl: null,
    recordTimeout: null,
  };

  let fieldHandle = null, starsHandle = null, auroraHandle = null, ripplesHandle = null, trailHandle = null;
  if (!reduced) {
    fieldHandle = initField(fieldCanvas);
    starsHandle = initStars(starsCanvas, () => soundOn, () => peerSingCount);
    auroraHandle = initAurora(auroraCanvas);
    trailHandle = initTrail(trailCanvas);
    ripplesHandle = initRipples(ripplesCanvas);
  }

  // ── SHARED HEARTBEAT ───────────────────────────────────────────────────
  // Every visitor's halo, the .corner .live pin, and the field shader pulse
  // sync to the same global tick. Beat period scales with presence: more
  // people in the room → faster, lighter pulse.
  let serverClockOffset = 0; // ms. server_now = Date.now() + offset
  let serverClockSynced = false;
  let presenceCount = 1;
  let lastTick = -1;
  let haloHovering = false; // set true while cursor is over an interactive
  const liveEl = document.querySelector(".corner .live");
  function beatPeriodMs() {
    const n = Math.max(1, presenceCount | 0);
    return Math.max(700, Math.min(1200, 1200 - 100 * (n - 1)));
  }
  const heartbeatInterval = reduced ? null : setInterval(() => {
    const period = beatPeriodMs();
    const tick = Math.floor((Date.now() + serverClockOffset) / period);
    if (tick === lastTick) return;
    if (lastTick === -1) { lastTick = tick; return; } // skip first to avoid burst
    lastTick = tick;
    // Halo pulse — gentle. Skip while hovering so hover scale wins.
    if (halo && !haloHovering) {
      gsap.fromTo(halo,
        { scale: 1 },
        { scale: 1.2, duration: 0.18, ease: "power2.out", overwrite: "auto" }
      );
      gsap.to(halo, { scale: 1, duration: 0.4, ease: "power2.inOut", delay: 0.18, overwrite: false });
    }
    // .corner .live pin — same rhythm.
    if (liveEl) {
      gsap.fromTo(liveEl,
        { scale: 1 },
        { scale: 1.2, duration: 0.18, ease: "power2.out", overwrite: "auto" }
      );
      gsap.to(liveEl, { scale: 1, duration: 0.4, ease: "power2.inOut", delay: 0.18, overwrite: false });
    }
    // Field shader: subtle centered ring. Click pulses overwrite when
    // they happen — that's fine; clicks should be louder than the metronome.
    if (fieldHandle) fieldHandle.triggerPulse(0.5, 0.5);
  }, 200);

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
    let lastTrail = 0;
    let lastPtrPublish = 0;
    window.addEventListener("pointermove", (e) => {
      lastInteractionAt = Date.now();
      haloX(e.clientX); haloY(e.clientY);
      dotX(e.clientX); dotY(e.clientY);
      const now = performance.now();
      if (trailHandle && now - lastTrail >= 30) {
        lastTrail = now;
        trailHandle.addPoint(e.clientX, e.clientY);
      }
      // Publish a ptr event at most every 100ms so the room can hear us
      // moving without flooding the wire. Skip when reduced motion is on.
      if (!reduced && now - lastPtrPublish >= 100) {
        lastPtrPublish = now;
        fetch(`${SYNC_BASE}/event`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            type: "ptr",
            x: e.clientX / window.innerWidth,
            y: e.clientY / window.innerHeight,
            from: SELF_ID,
          }),
          keepalive: true,
        }).catch(() => {});
      }
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
      el.addEventListener("pointerenter", () => {
        haloHovering = true;
        gsap.to(halo, { scale: 1.5, duration: 0.4, ease: "power3.out", overwrite: "auto" });
      });
      el.addEventListener("pointerleave", () => {
        haloHovering = false;
        gsap.to(halo, { scale: 1, duration: 0.5, ease: "power3.out", overwrite: "auto" });
      });
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
      Tone.start().then(() => {
        startDrone();
        startGenerative();
        // Bring up the per-peer chord to match current presence.
        setPeerSinging(presenceCount, true);
      }).catch(() => {});
    } else {
      stopGenerative();
      if (droneNodes && droneStarted) {
        droneNodes.padA.stop();
        droneNodes.padE.stop();
        droneStarted = false;
      }
      // Let every peer note fade out gracefully (3s release).
      silencePeers();
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
  // Tab away → hero softens. Return → it inhales back. After 30s, welcome chord.
  if (!reduced) {
    let hiddenAt = 0;
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        hiddenAt = Date.now();
        gsap.to(".hero", { scale: 0.92, filter: "blur(4px)", duration: 1.2, ease: "power2.inOut" });
      } else {
        const away = Date.now() - hiddenAt;
        if (away < 600) {
          gsap.set(".hero", { scale: 1, filter: "blur(0px)" });
        } else {
          gsap.to(".hero", { scale: 1, filter: "blur(0px)", duration: 1.4, ease: "elastic.out(1, 0.6)" });
        }
        if (away > 30000 && soundOn) {
          pluck("A3", 0, 0.5);
          pluck("C4", 0.05, 0.45);
          pluck("E4", 0.10, 0.45);
        }
      }
    });
  }

  // ── ECHO: idle replay of last click ── (declarations now at top of initMotion to avoid TDZ)

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
    lastInteractionAt = Date.now();
    lastUserInteractionAt = Date.now();
    const note = noteForX(e.clientX / window.innerWidth);
    lastClick = {
      x: e.clientX,
      y: e.clientY,
      note,
    };
    // Ghost recorder: capture click into the active recording reel.
    if (ghostState.recording) {
      ghostState.events.push({
        x: e.clientX,
        y: e.clientY,
        t: Date.now() - ghostState.startedAt,
        note,
      });
    }
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

  // ── GHOST RECORDER ───────────────────────────────────────────────────
  // 'r' starts recording the visitor's clicks (x,y,t,note). 'r' again stops
  // and immediately schedules a 4-cycle playback loop, each ~10% softer.
  // Recording auto-caps at 16s. Min 1s of recording is required to play.
  // Esc cancels playback mid-loop. Ghost ripples render with a subtle
  // white outline so they're distinguishable from yellow self/peer clicks.
  const GHOST_MAX_MS = 16000;
  const GHOST_MIN_MS = 1000;
  const GHOST_CYCLES = 4;

  // Inject the indicator style once. Flat, minimal — a small dot + label.
  if (!document.getElementById("ghost-style")) {
    const gs = document.createElement("style");
    gs.id = "ghost-style";
    gs.textContent = `
      .ghost-indicator {
        position: absolute;
        bottom: clamp(38px, 6vh, 64px);
        right: calc(clamp(22px, 3vw, 32px) + 110px);
        z-index: 12;
        pointer-events: none;
        padding: 8px 12px;
        border-radius: 999px;
        border: 1px solid rgba(220, 70, 70, 0.55);
        background: rgba(8,8,10,0.45);
        color: rgba(235, 110, 110, 0.95);
        font-family: var(--mono);
        font-size: 10.5px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        opacity: 0;
        transition: opacity .35s ease;
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .ghost-indicator.on { opacity: 1; }
      .ghost-indicator .dot {
        width: 7px; height: 7px;
        border-radius: 50%;
        background: rgb(235, 80, 80);
        animation: ghost-rec-pulse 1.1s ease-in-out infinite;
      }
      @keyframes ghost-rec-pulse {
        0%, 100% { opacity: 0.45; }
        50% { opacity: 1; }
      }
    `;
    document.head.appendChild(gs);
  }

  function ensureGhostIndicator() {
    if (ghostState.indicatorEl) return ghostState.indicatorEl;
    const el = document.createElement("div");
    el.className = "ghost-indicator";
    el.setAttribute("aria-live", "polite");
    el.innerHTML = '<span class="dot"></span><span>rec</span>';
    document.body.appendChild(el);
    ghostState.indicatorEl = el;
    return el;
  }

  function setGhostIndicator(on) {
    const el = ensureGhostIndicator();
    if (on) el.classList.add("on");
    else el.classList.remove("on");
  }

  function startGhostRecording() {
    cancelGhostPlayback();
    ghostState.recording = true;
    ghostState.startedAt = Date.now();
    ghostState.events = [];
    setGhostIndicator(true);
    // Auto-stop after the cap so the loop can't run away.
    ghostState.recordTimeout = setTimeout(() => {
      if (ghostState.recording) stopGhostRecording();
    }, GHOST_MAX_MS);
  }

  function stopGhostRecording() {
    if (!ghostState.recording) return;
    ghostState.recording = false;
    if (ghostState.recordTimeout) {
      clearTimeout(ghostState.recordTimeout);
      ghostState.recordTimeout = null;
    }
    setGhostIndicator(false);
    const elapsed = Date.now() - ghostState.startedAt;
    // Need at least 1s of reel and at least one click to bother playing.
    if (elapsed < GHOST_MIN_MS || ghostState.events.length === 0) {
      ghostState.events = [];
      return;
    }
    // Loop length is the recorded duration so the cycle period feels honest.
    playGhostLoop(elapsed, ghostState.events.slice());
  }

  function playGhostLoop(loopMs, events) {
    // Clear any prior reel still in the air.
    cancelGhostPlayback();
    for (let cycle = 0; cycle < GHOST_CYCLES; cycle++) {
      const cycleStart = cycle * loopMs;
      // Each cycle ~10% softer. Used for both ripple alpha and pluck velocity.
      const softness = Math.pow(0.9, cycle);
      for (const e of events) {
        const id = setTimeout(() => {
          // Drop self-references that fell outside the viewport on resize —
          // ripple draw will clip naturally, but skip wildly out-of-bounds.
          if (ripplesHandle) {
            ripplesHandle.add(e.x, e.y, false, { ghost: true, softness });
          }
          if (soundOn && pluckSynth) {
            pluck(e.note, 0, 0.4 * softness);
          }
        }, cycleStart + e.t);
        ghostState.playbackTimers.push(id);
      }
    }
  }

  function cancelGhostPlayback() {
    if (!ghostState.playbackTimers.length) return;
    for (const id of ghostState.playbackTimers) clearTimeout(id);
    ghostState.playbackTimers.length = 0;
  }

  // 'r' = toggle. Bare key only (no modifiers, not while typing).
  // Esc cancels in-flight ghost playback (and the existing galaxy listener
  // handles galaxy Esc separately — both can fire harmlessly).
  window.addEventListener("keydown", (e) => {
    if (e.defaultPrevented) return;
    const tag = (e.target && e.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA" || (e.target && e.target.isContentEditable)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "r" || e.key === "R") {
      if (ghostState.recording) stopGhostRecording();
      else startGhostRecording();
      return;
    }
    if (e.key === "Escape") {
      // Don't disrupt recording, just cancel any active loop.
      cancelGhostPlayback();
    }
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

  // ── VISUAL KEYS: typing as a live performance instrument ─────────────
  // 1-5 → M/A/Y/O/R drum/voice hit at full velocity.
  // z x c v b → one-shot lead notes pulled from the current chord scale.
  // Each keypress flashes its letter and broadcasts a "kick" so peers
  // hear and see it too. Separate listener so it never interferes with
  // the konami buffer above.
  const KEY_TO_LETTER = { "1": "M", "2": "A", "3": "Y", "4": "O", "5": "R" };
  const LEAD_KEYS = { "z": 0, "x": 1, "c": 2, "v": 3, "b": 4 };
  function pulseLetterGlyph(L) {
    const letter = letters.find((l) => l.dataset.letter === L);
    if (!letter) return;
    gsap.fromTo(letter,
      { scale: 1 },
      { scale: 1.18, duration: 0.08, ease: "power2.out", overwrite: "auto" }
    );
    gsap.to(letter, { scale: 1, duration: 0.55, ease: "elastic.out(1, 0.55)", delay: 0.08, overwrite: "auto" });
  }
  function currentChord() {
    if (!Tone) return CHORDS[0];
    const idx = Math.floor((Tone.Transport.seconds || 0) / (60 / Tone.Transport.bpm.value * 4 * 8)) % CHORDS.length;
    return CHORDS[idx] || CHORDS[0];
  }
  function leadNoteForKey(key) {
    const ch = currentChord();
    const i = LEAD_KEYS[key];
    // z..b → degrees 0..4 of chord scale, alternating octaves 4/5 for variety.
    const degree = i % ch.scale.length;
    const oct = 4 + (i % 2);
    return ch.scale[degree] + oct;
  }
  function broadcastKick(payload) {
    fetch(`${SYNC_BASE}/event`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "kick", from: SELF_ID, ...payload }),
      keepalive: true,
    }).catch(() => {});
  }
  window.addEventListener("keydown", (e) => {
    if (e.shiftKey || e.altKey || e.metaKey || e.ctrlKey) return;
    if (e.repeat) return;
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    const key = e.key;
    const drumLetter = KEY_TO_LETTER[key];
    if (drumLetter) {
      pulseLetterGlyph(drumLetter);
      lastInteractionAt = Date.now();
      if (soundOn && Tone) {
        ensureVoices();
        playStep(drumLetter, Tone.now(), 0.85);
      }
      broadcastKick({ letter: drumLetter });
      return;
    }
    if (LEAD_KEYS.hasOwnProperty(key)) {
      const note = leadNoteForKey(key);
      pulseLetterGlyph("R");
      lastInteractionAt = Date.now();
      if (soundOn && Tone) {
        ensureVoices();
        try { voices.lead.triggerAttackRelease(note, "8n", Tone.now(), 0.7); } catch {}
      }
      broadcastKick({ letter: "R", note });
      return;
    }
  });

  // ── PSYCHEDELIC ESCALATION + WEIRD EVENTS ────────────────────────────
  // Psy rises slowly over time the user is on the page (capped at 0.55 by
  // default). Clicking and chord activity nudges it up, idleness brings it
  // down. Every 18-45s, a "weird event" fires — random hue burst, brief
  // letter rotation, scale glitch, sound bend. Page never gets boring.
  const visitStart = performance.now();
  let psyTarget = 0;
  let psyRaf = 0;
  function psyTick() {
    const dur = (performance.now() - visitStart) / 1000;
    // Baseline rises with visit duration (asymptote 0.55 at ~10 min).
    const baseline = Math.min(0.55, dur / 600);
    psyTarget = Math.max(psyTarget * 0.998, baseline);
    if (fieldHandle) {
      const cur = fieldHandle.__psy ?? 0;
      const next = cur + (psyTarget - cur) * 0.01;
      fieldHandle.__psy = next;
      fieldHandle.setPsy(next);
    }
    psyRaf = requestAnimationFrame(psyTick);
  }
  if (!reduced) psyRaf = requestAnimationFrame(psyTick);

  // Catalogue of weird events. Each runs ~2s and leaves the page changed
  // briefly. Fire ~every 20-50s.
  const weirdEvents = [
    // Color-bend: hue shifts + drone detunes for 1.5s.
    () => {
      psyTarget = Math.min(1, psyTarget + 0.35);
      if (fieldHandle) fieldHandle.triggerChaos(0.4);
      setTimeout(() => { psyTarget *= 0.6; }, 2000);
    },
    // Letters do a hover-and-spin
    () => {
      letters.forEach((l, i) => {
        gsap.timeline()
          .to(l, { rotationZ: 360, duration: 1.4, ease: "expo.inOut", delay: i * 0.08 })
          .set(l, { rotationZ: 0 });
      });
      if (fieldHandle) fieldHandle.triggerChaos(0.5);
    },
    // Universe inverts briefly
    () => {
      gsap.fromTo("body", { filter: "invert(0)" }, { filter: "invert(1)", duration: 0.4, ease: "power2.inOut" });
      gsap.to("body", { filter: "invert(0)", duration: 0.4, delay: 0.5, ease: "power2.inOut" });
      if (soundOn) {
        // discord chord
        try { pluck("F#3", 0, 0.4); pluck("B3", 0.04, 0.4); pluck("D#4", 0.08, 0.4); } catch {}
      }
    },
    // Hero scales briefly to the moon
    () => {
      gsap.fromTo(".hero", { scale: 1 }, { scale: 1.5, duration: 0.6, ease: "power3.out" });
      gsap.to(".hero", { scale: 1, duration: 1.6, ease: "elastic.out(1, 0.5)", delay: 0.6 });
      if (fieldHandle) fieldHandle.triggerChaos(0.6);
    },
    // Reality glitch — 4 quick pulses in different spots
    () => {
      for (let i = 0; i < 4; i++) {
        setTimeout(() => {
          const x = Math.random();
          const y = Math.random();
          if (fieldHandle) fieldHandle.triggerPulse(x, 1 - y);
          if (ripplesHandle) ripplesHandle.add(x * window.innerWidth, y * window.innerHeight, false);
          if (soundOn && pluckSynth) {
            const n = PENT[Math.floor(Math.random() * PENT.length)];
            pluck(n, 0, 0.3);
          }
        }, i * 90);
      }
      if (fieldHandle) fieldHandle.triggerChaos(0.8);
    },
    // Stars stretch into long streaks
    () => {
      const sl = document.querySelector(".stars");
      if (sl) {
        gsap.to(sl, { scaleY: 3, duration: 0.5, ease: "power2.in" });
        gsap.to(sl, { scaleY: 1, duration: 1.2, ease: "elastic.out(1, 0.5)", delay: 0.5 });
      }
    },
  ];
  function fireWeird() {
    if (reduced || document.hidden) {
      setTimeout(fireWeird, 20000);
      return;
    }
    const ev = weirdEvents[Math.floor(Math.random() * weirdEvents.length)];
    try { ev(); } catch {}
    setTimeout(fireWeird, 20000 + Math.random() * 30000);
  }
  setTimeout(fireWeird, 18000);

  // ── DOOM CLOCK ─────────────────────────────────────────────────────────
  // If 90 seconds pass with no click anywhere (locally — we use the existing
  // lastInteractionAt tracker but lastClick presence as the marker), the
  // page lurches into 5s of chaos: hue rotates fast, hero shudders, drone
  // bends, then resolves back. Surprises long-idle visitors.
  let doomFiredAt = 0;
  setInterval(() => {
    if (document.hidden || reduced) return;
    const sinceClick = lastClick ? (Date.now() - lastInteractionAt) / 1000 : 0;
    if (lastClick && sinceClick > 90 && Date.now() - doomFiredAt > 60000) {
      doomFiredAt = Date.now();
      psyTarget = 1;
      if (fieldHandle) fieldHandle.triggerChaos(1);
      gsap.fromTo(".hero", { x: 0 }, { x: 6, duration: 0.06, repeat: 60, yoyo: true, ease: "power2.inOut" });
      if (soundOn) {
        // descending dissonant arpeggio
        ["C4", "B3", "A3", "G#3", "G3", "F#3", "F3"].forEach((n, i) => pluck(n, i * 0.08, 0.4));
      }
      setTimeout(() => { psyTarget *= 0.3; gsap.set(".hero", { x: 0 }); }, 5200);
    }
  }, 1000);

  // ── COLLABORATIVE STEP SEQUENCER ─────────────────────────────────────
  // The whole page is the instrument. 5 letters × 16 steps. Everyone in
  // the room edits the same grid in real time. Each letter has its own
  // Tone.js voice; Tone.Transport runs the loop. Server-clock-aligned so
  // every tab triggers steps simultaneously.
  const SEQ_LETTERS = ["M", "A", "Y", "O", "R"];
  const SEQ_STEPS = 16;
  const seqEl = document.querySelector("[data-seq]");
  const seqGrid = {};
  for (const L of SEQ_LETTERS) seqGrid[L] = new Array(SEQ_STEPS).fill(false);

  // Build the DOM grid: header strip + 5 letter rows.
  if (seqEl) {
    // Header (playhead row)
    const head = document.createElement("div");
    head.className = "head";
    for (let i = 0; i < SEQ_STEPS; i++) {
      const s = document.createElement("span");
      if (i % 4 === 0) s.classList.add("beat");
      head.appendChild(s);
    }
    seqEl.appendChild(head);
    // 5 letter rows
    for (const L of SEQ_LETTERS) {
      const lab = document.createElement("div");
      lab.className = "label";
      lab.textContent = L;
      seqEl.appendChild(lab);
      for (let i = 0; i < SEQ_STEPS; i++) {
        const c = document.createElement("button");
        c.className = "cell";
        c.dataset.letter = L;
        c.dataset.idx = String(i);
        c.addEventListener("click", (e) => {
          e.stopPropagation();
          lastUserInteractionAt = Date.now();
          const next = !seqGrid[L][i];
          seqGrid[L][i] = next;
          c.classList.toggle("on", next);
          // Optimistic local: trigger sound preview if turning on
          if (next && soundOn) playStep(L, Tone ? Tone.now() : 0, 0.6);
          updateMood();
          checkQuests();
          // Broadcast
          fetch(`${SYNC_BASE}/event`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ type: "step", letter: L, idx: i, on: next, from: SELF_ID }),
            keepalive: true,
          }).catch(() => {});
        });
        seqEl.appendChild(c);
      }
    }
  }

  // ── MOOD PROPHET ──────────────────────────────────────────────────────
  // Reads the room's groove from seqGrid and gives it a name. The label
  // floats just above the sequencer and fades when the pattern shifts.
  let moodEl = null;
  let lastMood = "";
  if (seqEl && seqEl.parentNode) {
    moodEl = document.createElement("div");
    moodEl.className = "mood";
    moodEl.setAttribute("aria-live", "polite");
    moodEl.style.cssText = [
      "position:absolute",
      "left:50%",
      "transform:translateX(-50%)",
      // sit just above the sequencer; .seq bottom ranges ~96-150px, so add ~38px
      "bottom:calc(clamp(96px, 14vh, 150px) + 38px)",
      "z-index:14",
      "pointer-events:none",
      "font-family:var(--mono)",
      "font-size:10.5px",
      "font-style:italic",
      "letter-spacing:0.16em",
      "text-transform:uppercase",
      "color:rgba(240,215,42,0.62)",
      "white-space:nowrap",
      "opacity:0",
      "transition:opacity 600ms ease",
    ].join(";");
    seqEl.parentNode.appendChild(moodEl);
  }

  function computeMood() {
    let total = 0;
    let lead = 0; // R + Y (lead voices: open hat & lead synth)
    let bass = 0; // M + A + O (bass body)
    let kickOff = 0; // M cells off the downbeat (1,2,3 of each beat group)
    for (const L of SEQ_LETTERS) {
      for (let i = 0; i < SEQ_STEPS; i++) {
        if (!seqGrid[L][i]) continue;
        total++;
        if (L === "R" || L === "Y") lead++;
        if (L === "M" || L === "A" || L === "O") bass++;
        if (L === "M" && i % 4 !== 0) kickOff++;
      }
    }
    const density = total / 80;
    const leadRatio = lead / (bass + 1);
    // syncopation factored into "wistful" / "alive" feel via kick-off-beat
    if (density === 0) return "patient as the dawn";
    if (density < 0.1) return "patient as the dawn";
    if (density < 0.25 && leadRatio > 1) return "wistful";
    if (density < 0.25) return "minimal";
    if (density < 0.5 && leadRatio > 1) return "shimmering";
    if (density < 0.5 && kickOff >= 2) return "syncopated";
    if (density < 0.5) return "patient";
    if (density > 0.7 && leadRatio < 0.3) return "thunderous";
    if (density > 0.7) return "ecstatic";
    if (density > 0.4) return "alive";
    return "becoming";
  }

  function updateMood() {
    if (!moodEl) return;
    const mood = computeMood();
    if (mood === lastMood) {
      moodEl.style.opacity = "1";
      return;
    }
    lastMood = mood;
    // Fade out, swap text, fade back in.
    moodEl.style.opacity = "0";
    setTimeout(() => {
      if (!moodEl) return;
      moodEl.textContent = mood;
      moodEl.style.opacity = "1";
    }, 240);
  }

  // Initial label
  if (moodEl) {
    moodEl.textContent = computeMood();
    lastMood = moodEl.textContent;
    // Defer so transition runs.
    requestAnimationFrame(() => { if (moodEl) moodEl.style.opacity = "1"; });
  }

  function applyGrid(g) {
    if (!seqEl || !g) return;
    for (const L of SEQ_LETTERS) {
      const row = g[L] || [];
      for (let i = 0; i < SEQ_STEPS; i++) {
        seqGrid[L][i] = !!row[i];
        const c = seqEl.querySelector(`.cell[data-letter="${L}"][data-idx="${i}"]`);
        if (c) c.classList.toggle("on", !!row[i]);
      }
    }
    updateMood();
    checkQuests();
  }
  function applyStepFromPeer(L, idx, on) {
    if (!SEQ_LETTERS.includes(L) || idx < 0 || idx >= SEQ_STEPS) return;
    seqGrid[L][idx] = !!on;
    const c = seqEl?.querySelector(`.cell[data-letter="${L}"][data-idx="${idx}"]`);
    if (c) c.classList.toggle("on", !!on);
    updateMood();
    checkQuests();
  }

  // Voices per letter — instantiated once when audio is enabled.
  let voices = null;
  function ensureVoices() {
    if (voices || !Tone) return voices;
    const fx = new Tone.Reverb({ decay: 5, wet: 0.35 }).toDestination();
    // Kick (M)
    const kick = new Tone.MembraneSynth({
      pitchDecay: 0.04, octaves: 6,
      envelope: { attack: 0.001, decay: 0.4, sustain: 0, release: 0.6 },
    }).toDestination();
    kick.volume.value = -6;
    // Snare/clap (A) — noise burst
    const snare = new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.18, sustain: 0 },
    }).toDestination();
    snare.volume.value = -14;
    // Hi-hat (Y) — high noise short
    const hat = new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.05, sustain: 0 },
    }).connect(new Tone.Filter(7000, "highpass").toDestination());
    hat.volume.value = -22;
    // Bass (O) — sine sub on chord roots
    const bass = new Tone.MonoSynth({
      oscillator: { type: "sine" },
      envelope: { attack: 0.02, decay: 0.4, sustain: 0.4, release: 0.6 },
      filterEnvelope: { attack: 0.04, decay: 0.3, sustain: 0.4, release: 0.6, baseFrequency: 140, octaves: 2 },
    }).connect(fx);
    bass.volume.value = -12;
    // Lead (R) — pluck triangle through reverb
    const lead = new Tone.Synth({
      oscillator: { type: "triangle" },
      envelope: { attack: 0.005, decay: 0.4, sustain: 0.0, release: 1.0 },
    }).connect(fx);
    lead.volume.value = -12;
    voices = { kick, snare, hat, bass, lead };
    return voices;
  }

  // Plays the voice associated with a letter at time `when` (Tone.js seconds).
  function playStep(L, when, vel = 0.7) {
    if (!Tone || !ensureVoices()) return;
    // Chord-aware notes for bass + lead — harmonized to current chord cycle.
    // If a "conductor" has set chordOverride, it wins over the rotating cycle.
    let ch;
    if (chordOverride != null) {
      ch = CHORDS[chordOverride] || CHORDS[0];
    } else {
      const chordIdx = Math.floor((Tone.Transport.seconds || 0) / (60 / Tone.Transport.bpm.value * 4 * 8)) % CHORDS.length;
      ch = CHORDS[chordIdx] || CHORDS[0];
    }
    try {
      if (L === "M") voices.kick.triggerAttackRelease("C2", "8n", when, vel);
      else if (L === "A") voices.snare.triggerAttackRelease("16n", when, vel * 0.8);
      else if (L === "Y") voices.hat.triggerAttackRelease("32n", when, vel * 0.5);
      else if (L === "O") voices.bass.triggerAttackRelease(ch.bass, "8n", when, vel * 0.7);
      else if (L === "R") {
        const note = ch.scale[(Math.random() * ch.scale.length) | 0] + (4 + ((Math.random() * 2) | 0));
        voices.lead.triggerAttackRelease(note, "8n", when, vel * 0.55);
      }
    } catch {}
  }

  // Step loop. Drives all 5 voices off the same Tone.Transport position.
  let stepLoop = null;
  let stepIdx = 0;
  function startStepLoop() {
    if (!Tone || stepLoop) return;
    Tone.Transport.bpm.value = 96;
    Tone.Transport.start();
    stepLoop = new Tone.Loop((time) => {
      // Advance + render playhead
      const i = stepIdx % SEQ_STEPS;
      // Update visual playhead via DOM + letter pulse
      if (seqEl) {
        const heads = seqEl.querySelectorAll(".head span");
        heads.forEach((s, k) => s.classList.toggle("now", k === i));
        seqEl.querySelectorAll(".cell.now").forEach((c) => c.classList.remove("now"));
      }
      let anyHit = false;
      for (const L of SEQ_LETTERS) {
        if (!seqGrid[L][i]) continue;
        anyHit = true;
        playStep(L, time, 0.7);
        if (seqEl) {
          const c = seqEl.querySelector(`.cell[data-letter="${L}"][data-idx="${i}"]`);
          if (c) {
            c.classList.add("now");
          }
          // Letter glyph pulse
          const letter = letters.find((l) => l.dataset.letter === L);
          if (letter) {
            gsap.fromTo(letter, { scale: 1 }, { scale: 1.06, duration: 0.06, ease: "power2.out", overwrite: "auto" });
            gsap.to(letter, { scale: 1, duration: 0.4, ease: "elastic.out(1,0.6)", delay: 0.06, overwrite: "auto" });
          }
        }
      }
      if (anyHit && fieldHandle) fieldHandle.triggerPulse(0.5, 0.5);
      stepIdx++;
    }, "16n").start(0);
  }
  function stopStepLoop() {
    if (stepLoop) { stepLoop.stop(); stepLoop.dispose(); stepLoop = null; }
  }

  // ── CHORD CONDUCTOR ──────────────────────────────────────────────────
  // Press 'c' to reveal a tiny 4-card chord wheel above the seq. Click a
  // card to "conduct" — chordOverride flips, the transport re-anchors, and
  // a `chord` event broadcasts so every peer re-anchors in lockstep.
  const CHORD_CARDS = [
    { name: "Am", label: "Am" },
    { name: "F",  label: "F"  },
    { name: "C",  label: "C"  },
    { name: "G",  label: "G"  },
  ];
  let chordWheelEl = null;
  let chordWheelOpen = false;
  let currentChordName = "Am"; // tracks server-known chord; updated by SSE

  function buildChordWheel() {
    if (chordWheelEl) return chordWheelEl;
    const wheel = document.createElement("div");
    wheel.className = "chord-wheel";
    wheel.setAttribute("role", "group");
    wheel.setAttribute("aria-label", "Chord conductor");
    wheel.style.cssText = [
      "position:absolute",
      "left:50%",
      "transform:translateX(-50%) translateY(8px)",
      "z-index:15",
      "display:flex",
      "gap:6px",
      "padding:6px 8px",
      "border-radius:10px",
      "background:rgba(8,8,10,0.55)",
      "-webkit-backdrop-filter:blur(14px)",
      "backdrop-filter:blur(14px)",
      "border:1px solid rgba(255,255,255,0.10)",
      "pointer-events:auto",
      "opacity:0",
      "visibility:hidden",
      "transition:opacity .14s ease, transform .14s ease",
      "font-family:var(--mono, ui-monospace, monospace)",
    ].join(";");
    // Position above the seq: bottom-anchor near the seq's top edge.
    if (seqEl) {
      const rect = seqEl.getBoundingClientRect();
      wheel.style.bottom = `calc(100vh - ${rect.top - 10}px)`;
    } else {
      wheel.style.bottom = "calc(96px + 14vh + 36px)";
    }
    for (const c of CHORD_CARDS) {
      const card = document.createElement("button");
      card.type = "button";
      card.dataset.chord = c.name;
      card.textContent = c.label;
      card.setAttribute("aria-label", `Conduct chord ${c.name}`);
      card.style.cssText = [
        "min-width:42px",
        "padding:8px 12px",
        "border-radius:8px",
        "border:1px solid rgba(255,255,255,0.14)",
        "background:rgba(255,255,255,0.04)",
        "color:#fff",
        "font: 700 13px/1 var(--mono, ui-monospace, monospace)",
        "letter-spacing:0.04em",
        "cursor:pointer",
        "transition:background .1s ease, border-color .1s ease, color .1s ease",
      ].join(";");
      card.addEventListener("click", (e) => {
        e.stopPropagation();
        applyChord(c.name);
        currentChordName = c.name;
        renderChordWheelState();
        // Broadcast so peers re-anchor.
        fetch(`${SYNC_BASE}/event`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ type: "chord", chord: c.name, from: SELF_ID }),
          keepalive: true,
        }).catch(() => {});
      });
      wheel.appendChild(card);
    }
    document.body.appendChild(wheel);
    chordWheelEl = wheel;
    return wheel;
  }

  function renderChordWheelState() {
    if (!chordWheelEl) return;
    const cards = chordWheelEl.querySelectorAll("[data-chord]");
    cards.forEach((card) => {
      const isActive = card.dataset.chord === currentChordName;
      card.style.background = isActive ? "var(--y, #f0d72a)" : "rgba(255,255,255,0.04)";
      card.style.borderColor = isActive ? "var(--y, #f0d72a)" : "rgba(255,255,255,0.14)";
      card.style.color = isActive ? "#050505" : "#fff";
      card.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }

  function setChordWheelOpen(open) {
    if (open && !chordWheelEl) buildChordWheel();
    chordWheelOpen = !!open;
    if (!chordWheelEl) return;
    chordWheelEl.style.visibility = chordWheelOpen ? "visible" : "hidden";
    chordWheelEl.style.opacity = chordWheelOpen ? "1" : "0";
    chordWheelEl.style.transform = `translateX(-50%) translateY(${chordWheelOpen ? "0" : "8"}px)`;
    if (chordWheelOpen) renderChordWheelState();
  }

  // 'c' toggles the wheel — but stay out of the way of typing in inputs.
  window.addEventListener("keydown", (e) => {
    if (e.key !== "c" && e.key !== "C") return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    setChordWheelOpen(!chordWheelOpen);
  });

  // Hook into existing toggleSound so the sequencer engages with audio.
  const _origStartGen = startGenerative;
  // monkey-patch via re-binding in this scope:
  function ensureSeqAudioRunning() {
    if (!soundOn || !Tone) return;
    ensureVoices();
    startStepLoop();
  }
  // Watch soundOn via a lightweight poll — toggleSound already starts Tone.
  setInterval(ensureSeqAudioRunning, 500);

  // ── GROOVE EVOLVER ────────────────────────────────────────────────────
  // After 30s of silence (empty grid + no interaction), an autonomous
  // musician starts proposing notes. It fills cells across the 5 letter
  // rows over ~16 bars, building a groove from sparse to full. Each
  // addition is broadcast like a real toggle so the whole room hears it
  // emerge. Stops the moment anyone interacts.
  // Capture-phase window click so any click anywhere (incl. CTA, sound
  // button, links) counts as user activity and silences the agent.
  window.addEventListener("click", () => {
    lastUserInteractionAt = Date.now();
  }, { capture: true, passive: true });

  // Inject a brief gold ring CSS keyframe + class. The class auto-removes
  // after the animation runs once. Lives in a single style tag so we don't
  // touch index.html.
  (function injectAgentStyle() {
    if (document.getElementById("groove-evolver-style")) return;
    const style = document.createElement("style");
    style.id = "groove-evolver-style";
    style.textContent = [
      "@keyframes grooveEvolverRing {",
      "  0%   { box-shadow: 0 0 0 0 rgba(240,215,42,0.85); }",
      "  60%  { box-shadow: 0 0 0 6px rgba(240,215,42,0.25); }",
      "  100% { box-shadow: 0 0 0 10px rgba(240,215,42,0); }",
      "}",
      ".seq .cell.agent-add { animation: grooveEvolverRing 0.9s ease-out; }",
    ].join("\n");
    document.head.appendChild(style);
  })();

  // Per-letter musical preferences. Weights bias the agent toward
  // foundation first (kick → bass → snare → hat → lead). Steps are 16th
  // notes; preferred slots reflect classic backbeat / swing positions.
  // (idx 0 = downbeat 1, idx 4 = beat 2, idx 8 = beat 3, idx 12 = beat 4)
  const GROOVE_PRIORS = {
    M: { weight: 5.0, preferred: [0, 8, 4, 12, 6, 14] },           // kick
    O: { weight: 3.5, preferred: [0, 8, 4, 12, 10, 6, 14, 2] },    // bass
    A: { weight: 2.5, preferred: [4, 12, 5, 13, 8, 0] },           // snare
    Y: { weight: 1.6, preferred: [2, 6, 10, 14, 0, 4, 8, 12] },    // hat (offbeats)
    R: { weight: 1.2, preferred: [0, 8, 6, 14, 4, 12, 10, 2] },    // lead
  };

  function pickWeightedLetter() {
    // Bias toward letters that already have notes (build on foundation),
    // but always leave room for fresh layers.
    let total = 0;
    const scores = {};
    for (const L of SEQ_LETTERS) {
      const prior = GROOVE_PRIORS[L] || { weight: 1.0, preferred: [] };
      const filled = seqGrid[L].filter(Boolean).length;
      // If the row is already dense, drop its weight so we layer elsewhere.
      const density = filled / SEQ_STEPS;
      const w = prior.weight * (1 - density * 0.7);
      scores[L] = Math.max(0.05, w);
      total += scores[L];
    }
    let r = Math.random() * total;
    for (const L of SEQ_LETTERS) {
      r -= scores[L];
      if (r <= 0) return L;
    }
    return SEQ_LETTERS[0];
  }

  function pickStepForLetter(L) {
    const prior = GROOVE_PRIORS[L] || { preferred: [] };
    // Try preferred slots first, in order, that are still empty.
    for (const idx of prior.preferred) {
      if (!seqGrid[L][idx]) return idx;
    }
    // Fallback: any empty slot at random.
    const empty = [];
    for (let i = 0; i < SEQ_STEPS; i++) if (!seqGrid[L][i]) empty.push(i);
    if (empty.length === 0) return -1;
    return empty[(Math.random() * empty.length) | 0];
  }

  function evolveStep() {
    if (!seqEl) return;
    // Pick a letter, then a step.
    // Try a few letters in case the first is full.
    let L = null, idx = -1;
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = pickWeightedLetter();
      const slot = pickStepForLetter(candidate);
      if (slot >= 0) { L = candidate; idx = slot; break; }
    }
    if (!L || idx < 0) return;
    // Set the grid + render with a brief gold ring marking it as agent-added.
    seqGrid[L][idx] = true;
    const c = seqEl.querySelector(`.cell[data-letter="${L}"][data-idx="${idx}"]`);
    if (c) {
      c.classList.add("on");
      c.classList.remove("agent-add");
      // Force reflow so the animation restarts even if reused quickly.
      void c.offsetWidth;
      c.classList.add("agent-add");
      setTimeout(() => { c.classList.remove("agent-add"); }, 1000);
    }
    // Optimistic local audio preview (matches the cell click path).
    if (soundOn && Tone) playStep(L, Tone.now(), 0.55);
    // Broadcast to peers — same shape as a human toggle.
    fetch(`${SYNC_BASE}/event`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "step", letter: L, idx, on: true, from: SELF_ID }),
      keepalive: true,
    }).catch(() => {});
  }

  function checkGrooveEvolver() {
    if (document.hidden) return;
    if (Date.now() - lastUserInteractionAt <= 30000) return;
    // Only run when the room is silent — total active cells across all rows.
    let total = 0;
    for (const L of SEQ_LETTERS) {
      for (let i = 0; i < SEQ_STEPS; i++) if (seqGrid[L][i]) total++;
    }
    if (total > 0) return;
    // We made it — propose one note.
    evolveStep();
  }

  // 1.2s cadence so the groove builds slowly. At ~33 cells over 40s the
  // backbeat lands first, mids layer next, leads come last.
  const grooveInterval = setInterval(checkGrooveEvolver, 1200);

  // ── PRESENCE / SYNC via SSE ──
  // Track peer → star index. The server gives presence count, not stable
  // IDs, so we allocate indices client-side as new "from" values appear.
  // Index 0 is self (hidden), indices 1+ are visible stars.
  const peerIndex = new Map(); // from -> index
  let nextPeerIdx = 1;
  function indexFor(from) {
    if (!from) return 0;
    let idx = peerIndex.get(from);
    if (idx === undefined) {
      idx = nextPeerIdx++;
      peerIndex.set(from, idx);
    }
    return idx;
  }
  let es = null;
  function connectSync() {
    if (reduced) return;
    try {
      es = new EventSource(`${SYNC_BASE}/events`);
      es.onmessage = (msg) => {
        try {
          const ev = JSON.parse(msg.data);
          // First SSE message: pin client clock to server clock so all
          // visitors share the same tick boundary.
          if (!serverClockSynced) {
            if (typeof ev.ts === "number") {
              serverClockOffset = ev.ts - Date.now();
            }
            serverClockSynced = true;
          }
          if (ev.type === "presence") {
            const n = ev.count || 1;
            presenceCount = n;
            // Generative ensemble layers up with more visitors
            presenceForGen = n;
            if (presenceEl) {
              presenceEl.textContent = n === 1 ? "alone in the room" : `${n} in the room`;
            }
            if (starsHandle) starsHandle.setCount(n);
            // Each visitor sings a held note. Chord forms from presence.
            setPeerSinging(n, soundOn);
            return;
          }
          // Grid snapshot — apply silently (no preview play).
          if (ev.type === "grid") {
            applyGrid(ev.grid);
            return;
          }
          // Chord conductor — both initial snapshot and peer broadcasts.
          // Self-echoes are fine (idempotent), so handle before the SELF_ID skip.
          if (ev.type === "chord") {
            if (typeof ev.chord === "string") {
              applyChord(ev.chord);
              currentChordName = ev.chord;
              renderChordWheelState();
            }
            return;
          }
          if (ev.from === SELF_ID) return;
          // Peer cursor presence — soft glissando + brighten their star.
          if (ev.type === "ptr") {
            if (reduced) return;
            const nx = Math.max(0, Math.min(1, Number(ev.x) || 0.5));
            const idx = indexFor(ev.from);
            if (starsHandle) starsHandle.setBrightFor(idx, 1);
            if (soundOn) presencePluck(nx);
            return;
          }
          // Step toggle from a peer
          if (ev.type === "step") {
            applyStepFromPeer(ev.letter, ev.idx | 0, !!ev.on);
            return;
          }
          if (ev.type === "kick") {
            // Peer is performing live — pulse the same letter and play
            // the same voice at slightly lower velocity so locals stay
            // audibly forward.
            const L = (typeof ev.letter === "string" ? ev.letter.toUpperCase() : "").slice(0, 1);
            if (L) pulseLetterGlyph(L);
            if (soundOn && Tone) {
              ensureVoices();
              if (typeof ev.note === "string" && ev.note && voices && voices.lead) {
                try { voices.lead.triggerAttackRelease(ev.note, "8n", Tone.now(), 0.5); } catch {}
              } else if (L) {
                playStep(L, Tone.now(), 0.6);
              }
            }
            return;
          }
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
  let statsIntensity = 0;
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
      statsIntensity = Math.min(1, 0.45 * pulse + 0.35 * activeScore + 0.20 * ageScore);
      lastStats = s;
    } catch {}
  }
  pollStats();
  const pollInterval = setInterval(pollStats, 5000);

  // ── WIND CHIMES ──
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

  // ── ECHO IDLE CHECK ──
  function checkIdle() {
    if (document.hidden) return;
    if (!lastClick) return;
    if (Date.now() - lastInteractionAt <= 12000) return;
    if (ripplesHandle) ripplesHandle.add(lastClick.x, lastClick.y, false);
    if (soundOn && pluckSynth) pluck(lastClick.note, 0, 0.3);
    lastInteractionAt += 12000;
  }
  const idleInterval = setInterval(checkIdle, 1000);

  // ── TILT TO NIGHT ──
  let night = 0, nightTarget = 0;
  let entranceDone = false;
  if (!reduced) setTimeout(() => { entranceDone = true; }, 2400);
  const starsLayer = document.querySelector(".stars");
  const heroBack = document.querySelector(".hero .layer.back");
  window.addEventListener("pointermove", (e) => {
    nightTarget = e.clientY < 60 ? 1 : 0;
  }, { passive: true });
  window.addEventListener("pointerleave", () => { nightTarget = 0; }, { passive: true });
  let nightRaf = 0;
  function nightTick() {
    night += (nightTarget - night) * 0.04;
    if (fieldHandle) fieldHandle.setIntensity(statsIntensity * (1 - night * 0.7));
    if (starsLayer) starsLayer.style.opacity = String(0.4 + night * 0.6);
    if (heroBack && entranceDone) heroBack.style.opacity = String(1 - night * 0.5);
    nightRaf = requestAnimationFrame(nightTick);
  }
  if (!reduced) nightRaf = requestAnimationFrame(nightTick);

  // ── PATTERN GALAXY ─────────────────────────────────────────────────
  // Press 'g' to summon a 12-star constellation of preset grooves.
  // Each star = a famous 16-step pattern across the 5 MAYOR rows.
  // Click → load locally + broadcast the diff so the room jumps with you.
  // Esc closes. Yellow on black, organic spiral layout (golden angle).
  const PATTERN_GALAXY = [
    {
      name: "Four on the Floor",
      M: [1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0],
      A: [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],
      Y: [0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0],
      O: [1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0],
      R: [1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0],
    },
    {
      name: "Breakbeat",
      M: [1,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0],
      A: [0,0,0,0,1,0,0,0,0,0,0,0,1,0,1,0],
      Y: [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0],
      O: [1,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0],
      R: [0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0],
    },
    {
      name: "Dembow",
      M: [1,0,0,1,0,0,1,0,1,0,0,1,0,0,1,0],
      A: [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],
      Y: [0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0],
      O: [1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0],
      R: [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    },
    {
      name: "Jungle",
      M: [1,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],
      A: [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,1],
      Y: [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0],
      O: [0,0,0,0,0,0,0,1,0,0,0,1,0,0,0,0],
      R: [0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0],
    },
    {
      name: "Half-Time",
      M: [1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0],
      A: [0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0],
      Y: [1,0,0,0,1,0,1,0,1,0,0,0,1,0,1,0],
      O: [1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0],
      R: [0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0],
    },
    {
      name: "Bossa Nova",
      M: [1,0,0,0,0,1,0,0,0,0,0,1,0,0,0,0],
      A: [0,0,0,1,0,0,0,0,0,1,0,0,1,0,0,0],
      Y: [0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0],
      O: [1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0],
      R: [1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0],
    },
    {
      name: "Samba",
      M: [1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0],
      A: [0,0,1,0,0,0,0,1,0,0,1,0,0,0,0,1],
      Y: [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0],
      O: [1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0],
      R: [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],
    },
    {
      name: "Trap",
      M: [1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0],
      A: [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],
      Y: [1,0,1,0,1,0,1,0,1,0,1,1,1,1,1,1],
      O: [1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0],
      R: [0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0],
    },
    {
      name: "Swing",
      M: [1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0],
      A: [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],
      Y: [1,0,0,1,1,0,0,1,1,0,0,1,1,0,0,1],
      O: [1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0],
      R: [0,0,1,0,0,0,0,0,0,0,1,0,0,0,0,0],
    },
    {
      name: "Motorik",
      M: [1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0],
      A: [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],
      Y: [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
      O: [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0],
      R: [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    },
    {
      name: "Gospel Chop",
      M: [1,0,0,0,1,0,0,1,1,0,1,0,0,0,1,0],
      A: [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],
      Y: [0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0],
      O: [1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0],
      R: [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],
    },
    {
      name: "Footwork",
      M: [1,0,0,1,0,0,0,1,0,0,1,0,0,1,0,0],
      A: [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],
      Y: [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0],
      O: [1,0,0,0,0,0,0,0,1,0,0,1,0,0,0,0],
      R: [0,0,0,0,0,1,0,0,0,0,0,0,0,1,0,0],
    },
  ];

  // Inject galaxy CSS once (kept terse — no shadows, no glows beyond the
  // existing yellow-on-black palette already used by the seq grid).
  if (!document.getElementById("galaxy-style")) {
    const gs = document.createElement("style");
    gs.id = "galaxy-style";
    gs.textContent = `
      .galaxy {
        position: fixed; inset: 0; z-index: 30;
        background: rgba(5,5,5,0.86);
        display: none;
        cursor: crosshair;
        font: 600 12px/1 ui-monospace, "JetBrains Mono", monospace;
        letter-spacing: 0.06em;
      }
      .galaxy.open { display: block; }
      .galaxy .gx-hint {
        position: absolute; top: 16px; left: 50%;
        transform: translateX(-50%);
        color: var(--y, #f0d72a);
        text-transform: uppercase;
        opacity: 0.7;
      }
      .galaxy .gx-star {
        position: absolute;
        width: 22px; height: 22px;
        margin: -11px 0 0 -11px;
        border-radius: 50%;
        background: var(--y, #f0d72a);
        border: 2px solid #050505;
        cursor: pointer;
        transition: transform .15s ease, width .15s ease, height .15s ease;
        padding: 0;
      }
      .galaxy .gx-star:hover,
      .galaxy .gx-star:focus {
        transform: scale(1.35);
        outline: none;
      }
      .galaxy .gx-label {
        position: absolute;
        color: var(--y, #f0d72a);
        background: #050505;
        padding: 4px 8px;
        border: 1px solid var(--y, #f0d72a);
        text-transform: uppercase;
        white-space: nowrap;
        pointer-events: none;
        opacity: 0;
        transform: translate(-50%, -32px);
        transition: opacity .12s ease;
      }
      .galaxy .gx-star:hover + .gx-label,
      .galaxy .gx-star:focus + .gx-label { opacity: 1; }
    `;
    document.head.appendChild(gs);
  }

  // Build the overlay once, lazy.
  let galaxyEl = null;
  function buildGalaxy() {
    if (galaxyEl) return galaxyEl;
    galaxyEl = document.createElement("div");
    galaxyEl.className = "galaxy";
    galaxyEl.setAttribute("role", "dialog");
    galaxyEl.setAttribute("aria-label", "Pattern Galaxy");
    const hint = document.createElement("div");
    hint.className = "gx-hint";
    hint.textContent = "Pattern Galaxy — click a star, Esc to close";
    galaxyEl.appendChild(hint);
    // Golden-angle spiral so the 12 stars feel organic, not gridded.
    const PHI = Math.PI * (3 - Math.sqrt(5));
    PATTERN_GALAXY.forEach((p, i) => {
      const t = (i + 0.5) / PATTERN_GALAXY.length;
      const r = 0.18 + 0.30 * Math.sqrt(t);
      const a = i * PHI;
      const star = document.createElement("button");
      star.className = "gx-star";
      star.type = "button";
      star.setAttribute("aria-label", p.name);
      star.style.left = `${50 + Math.cos(a) * r * 100}%`;
      star.style.top  = `${50 + Math.sin(a) * r * 100}%`;
      star.addEventListener("click", (e) => {
        e.stopPropagation();
        loadGalaxyPattern(p);
        closeGalaxy();
      });
      const label = document.createElement("div");
      label.className = "gx-label";
      label.textContent = p.name;
      label.style.left = star.style.left;
      label.style.top = star.style.top;
      galaxyEl.appendChild(star);
      galaxyEl.appendChild(label);
    });
    // Click outside any star closes
    galaxyEl.addEventListener("click", (e) => {
      if (e.target === galaxyEl) closeGalaxy();
    });
    document.body.appendChild(galaxyEl);
    return galaxyEl;
  }
  function openGalaxy() {
    buildGalaxy().classList.add("open");
  }
  function closeGalaxy() {
    if (galaxyEl) galaxyEl.classList.remove("open");
  }
  // Loading: diff against the current grid, set DOM + seqGrid + broadcast,
  // staggered 5ms apart so the inbox doesn't get a burst.
  function loadGalaxyPattern(p) {
    if (!seqEl) return;
    let delay = 0;
    for (const L of SEQ_LETTERS) {
      const row = p[L] || [];
      for (let i = 0; i < SEQ_STEPS; i++) {
        const next = !!row[i];
        if (seqGrid[L][i] === next) continue;
        seqGrid[L][i] = next;
        const c = seqEl.querySelector(`.cell[data-letter="${L}"][data-idx="${i}"]`);
        if (c) c.classList.toggle("on", next);
        const letter = L, idx = i, on = next;
        setTimeout(() => {
          fetch(`${SYNC_BASE}/event`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ type: "step", letter, idx, on, from: SELF_ID }),
            keepalive: true,
          }).catch(() => {});
        }, delay);
        delay += 5;
      }
    }
  }
  // Separate keydown — won't interfere with konami because we ignore when
  // the user is mid-typing in an input/textarea, and we only act on bare 'g'.
  window.addEventListener("keydown", (e) => {
    if (e.defaultPrevented) return;
    const tag = (e.target && e.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA" || (e.target && e.target.isContentEditable)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "Escape" && galaxyEl && galaxyEl.classList.contains("open")) {
      closeGalaxy();
      return;
    }
    if (e.key === "g" || e.key === "G") {
      if (galaxyEl && galaxyEl.classList.contains("open")) closeGalaxy();
      else openGalaxy();
    }
  });

  // ── QUESTS ────────────────────────────────────────────────────────────
  // Five small musical goals to chase. Press `q` to open the panel; mutate
  // the grid (locally or from a peer) and quests check themselves. Done
  // state persists across visits via localStorage; reward fires once per
  // completion in a session (re-completable across sessions if cleared).
  const QUEST_LS_KEY = "mayor_quests_done_v1";
  const QUESTS = [
    {
      id: "four-on-floor",
      title: "Make a four-on-the-floor",
      hint: "Kick on every 4th step (M cells at 0, 4, 8, 12).",
      check: () => [0, 4, 8, 12].every((i) => seqGrid.M[i]),
      reward: () => rewardFourOnFloor(),
    },
    {
      id: "find-silence",
      title: "Find the silence",
      hint: "Clear every cell. 0 of 80.",
      check: () => SEQ_LETTERS.every((L) => seqGrid[L].every((v) => !v)),
      reward: () => rewardSilence(),
    },
    {
      id: "ride-hat",
      title: "Ride the hat",
      hint: "Every Y cell active (16 of 16).",
      check: () => seqGrid.Y.every(Boolean),
      reward: () => rewardRideHat(),
    },
    {
      id: "build-groove",
      title: "Build a groove",
      hint: "At least one cell active in each of M A Y O R.",
      check: () => SEQ_LETTERS.every((L) => seqGrid[L].some(Boolean)),
      reward: () => rewardGroove(),
    },
    {
      id: "off-grid",
      title: "Off-grid",
      hint: "8+ cells active on non-multiples-of-4 indices.",
      check: () => {
        let n = 0;
        for (const L of SEQ_LETTERS) {
          for (let i = 0; i < SEQ_STEPS; i++) {
            if (seqGrid[L][i] && i % 4 !== 0) n++;
          }
        }
        return n >= 8;
      },
      reward: () => rewardOffGrid(),
    },
  ];

  // Persistent done set (cross-session). Session-fired set prevents the
  // same reward from triggering twice in one tab.
  let questsDone = new Set();
  const sessionFired = new Set();
  try {
    const raw = localStorage.getItem(QUEST_LS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) questsDone = new Set(arr.filter((x) => typeof x === "string"));
    }
  } catch {}
  function saveQuestsDone() {
    try { localStorage.setItem(QUEST_LS_KEY, JSON.stringify([...questsDone])); } catch {}
  }

  // Floating tagline used by several rewards. One element, fades.
  let questTaglineEl = null;
  function ensureQuestTagline() {
    if (questTaglineEl) return questTaglineEl;
    questTaglineEl = document.createElement("div");
    questTaglineEl.className = "quest-tagline";
    questTaglineEl.setAttribute("aria-live", "polite");
    questTaglineEl.style.cssText = [
      "position:fixed",
      "left:50%",
      "top:18%",
      "transform:translateX(-50%)",
      "z-index:35",
      "pointer-events:none",
      "font-family:var(--mono, ui-monospace, monospace)",
      "font-size:13px",
      "letter-spacing:0.18em",
      "text-transform:uppercase",
      "color:var(--y, #f0d72a)",
      "white-space:nowrap",
      "opacity:0",
      "transition:opacity 380ms ease",
    ].join(";");
    document.body.appendChild(questTaglineEl);
    return questTaglineEl;
  }
  function showQuestTagline(text, holdMs = 1800) {
    const el = ensureQuestTagline();
    el.textContent = text;
    el.style.opacity = "1";
    clearTimeout(showQuestTagline._t);
    showQuestTagline._t = setTimeout(() => { el.style.opacity = "0"; }, holdMs);
  }

  // ── REWARDS ─────────────────────────────────────────────────────────
  // Each is unique and small. Sound rewards bypass soundOn gate so the
  // cheering moment lands even on first interaction.
  function rewardFourOnFloor() {
    showQuestTagline("FEEL THE PULSE");
    if (Tone) {
      try {
        ensureVoices();
        const t = Tone.now();
        // Three quick "yeah!" pluck triplets with rising pitch.
        const notes = ["A4", "C5", "E5", "A5"];
        notes.forEach((n, i) => pluck(n, t + i * 0.08, 0.7));
        // Bright noise burst tail like a crowd cheer.
        if (voices && voices.snare) {
          for (let i = 0; i < 6; i++) {
            try { voices.snare.triggerAttackRelease("32n", t + 0.36 + i * 0.04, 0.45); } catch {}
          }
        }
      } catch {}
    }
  }
  function rewardSilence() {
    // No tagline — silence is its own reward. 3-note ascending chord that
    // lingers, then fades. Plays even with sound off so the moment lands.
    if (Tone) {
      try {
        const t = Tone.now();
        pluck("C4", t + 0.00, 0.55);
        pluck("E4", t + 0.16, 0.55);
        pluck("G4", t + 0.32, 0.55);
      } catch {}
    }
    showQuestTagline("EMPTY ROOM, FULL HEART", 2400);
  }
  function rewardRideHat() {
    // White flash overlay across the viewport, then fade.
    const flash = document.createElement("div");
    flash.style.cssText = [
      "position:fixed", "inset:0", "z-index:40",
      "background:#ffffff", "opacity:0", "pointer-events:none",
      "mix-blend-mode:screen",
    ].join(";");
    document.body.appendChild(flash);
    if (window.gsap) {
      gsap.to(flash, { opacity: 0.85, duration: 0.08, ease: "power1.out" });
      gsap.to(flash, { opacity: 0, duration: 0.6, delay: 0.1, ease: "power2.out", onComplete: () => flash.remove() });
    } else {
      flash.style.opacity = "0.85";
      setTimeout(() => { flash.style.opacity = "0"; flash.style.transition = "opacity 600ms ease"; }, 80);
      setTimeout(() => flash.remove(), 800);
    }
    showQuestTagline("RIDING THE WAVE");
  }
  function rewardGroove() {
    // Full chord — root + third + fifth + octave on the lead voice.
    if (Tone) {
      try {
        ensureVoices();
        const t = Tone.now();
        ["A3", "C4", "E4", "A4"].forEach((n, i) => pluck(n, t + i * 0.02, 0.65));
      } catch {}
    }
    showQuestTagline("THE GROOVE IS REAL");
  }
  function rewardOffGrid() {
    // Psychedelic burst: brief hue-rotate sweep on the entire stage,
    // plus a random pluck arpeggio in the upper register.
    const stage = document.querySelector(".stage") || document.body;
    if (window.gsap) {
      gsap.fromTo(stage,
        { filter: "hue-rotate(0deg) saturate(1)" },
        { filter: "hue-rotate(220deg) saturate(1.6)", duration: 0.45, ease: "power1.inOut" }
      );
      gsap.to(stage, { filter: "hue-rotate(0deg) saturate(1)", duration: 0.9, delay: 0.45, ease: "power2.out" });
    }
    if (Tone) {
      try {
        ensureVoices();
        const t = Tone.now();
        const pool = ["C5", "D5", "E5", "G5", "A5", "C6", "E6"];
        for (let i = 0; i < 7; i++) {
          const n = pool[(Math.random() * pool.length) | 0];
          pluck(n, t + i * 0.06, 0.5);
        }
      } catch {}
    }
    showQuestTagline("OFF THE GRID");
  }

  // ── PANEL ───────────────────────────────────────────────────────────
  // Glassy floating panel. Toggled with `q`. Lists each quest with a
  // status dot and a (faded) hint line.
  if (!document.getElementById("quests-style")) {
    const qs = document.createElement("style");
    qs.id = "quests-style";
    qs.textContent = `
      .quests-panel {
        position: fixed;
        top: 50%;
        right: 24px;
        transform: translateY(-50%) translateX(12px);
        z-index: 32;
        width: clamp(260px, 28vw, 340px);
        background: rgba(10, 10, 10, 0.62);
        backdrop-filter: blur(14px) saturate(1.2);
        -webkit-backdrop-filter: blur(14px) saturate(1.2);
        border: 1px solid rgba(240, 215, 42, 0.22);
        border-radius: 14px;
        padding: 18px 18px 16px;
        font: 500 12px/1.4 var(--mono, ui-monospace, "JetBrains Mono", monospace);
        color: rgba(240, 215, 42, 0.92);
        opacity: 0;
        pointer-events: none;
        transition: opacity 220ms ease, transform 280ms cubic-bezier(.2,.8,.2,1);
      }
      .quests-panel.open {
        opacity: 1;
        pointer-events: auto;
        transform: translateY(-50%) translateX(0);
      }
      .quests-panel .qp-head {
        display: flex; align-items: baseline; justify-content: space-between;
        text-transform: uppercase;
        letter-spacing: 0.18em;
        font-size: 10px;
        color: rgba(240, 215, 42, 0.62);
        margin-bottom: 12px;
      }
      .quests-panel .qp-list {
        list-style: none;
        margin: 0; padding: 0;
        display: grid; gap: 10px;
      }
      .quests-panel .qp-item {
        display: grid;
        grid-template-columns: 14px 1fr;
        gap: 10px;
        align-items: start;
      }
      .quests-panel .qp-dot {
        width: 10px; height: 10px;
        margin-top: 4px;
        border-radius: 50%;
        border: 1.5px solid rgba(240, 215, 42, 0.55);
        background: transparent;
        transition: background 240ms ease, border-color 240ms ease;
      }
      .quests-panel .qp-item.done .qp-dot {
        background: var(--y, #f0d72a);
        border-color: var(--y, #f0d72a);
      }
      .quests-panel .qp-title {
        font-size: 12px;
        letter-spacing: 0.04em;
      }
      .quests-panel .qp-item.done .qp-title {
        color: rgba(240, 215, 42, 0.55);
        text-decoration: line-through;
        text-decoration-thickness: 1px;
      }
      .quests-panel .qp-hint {
        margin-top: 3px;
        font-size: 10.5px;
        letter-spacing: 0.02em;
        color: rgba(240, 215, 42, 0.5);
      }
      .quests-panel .qp-foot {
        margin-top: 14px;
        font-size: 10px;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: rgba(240, 215, 42, 0.42);
        text-align: right;
      }
    `;
    document.head.appendChild(qs);
  }

  let questsPanelEl = null;
  function buildQuestsPanel() {
    if (questsPanelEl) return questsPanelEl;
    const el = document.createElement("aside");
    el.className = "quests-panel";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", "Quests");
    el.setAttribute("aria-hidden", "true");
    const head = document.createElement("div");
    head.className = "qp-head";
    const t = document.createElement("span");
    t.textContent = "Quests";
    const c = document.createElement("span");
    c.className = "qp-count";
    c.textContent = `${questsDone.size}/${QUESTS.length}`;
    head.appendChild(t);
    head.appendChild(c);
    el.appendChild(head);
    const list = document.createElement("ul");
    list.className = "qp-list";
    QUESTS.forEach((q) => {
      const li = document.createElement("li");
      li.className = "qp-item";
      li.dataset.qid = q.id;
      const dot = document.createElement("span");
      dot.className = "qp-dot";
      const body = document.createElement("div");
      const title = document.createElement("div");
      title.className = "qp-title";
      title.textContent = q.title;
      const hint = document.createElement("div");
      hint.className = "qp-hint";
      hint.textContent = q.hint;
      body.appendChild(title);
      body.appendChild(hint);
      li.appendChild(dot);
      li.appendChild(body);
      list.appendChild(li);
    });
    el.appendChild(list);
    const foot = document.createElement("div");
    foot.className = "qp-foot";
    foot.textContent = "press q to close";
    el.appendChild(foot);
    document.body.appendChild(el);
    questsPanelEl = el;
    renderQuestsPanel();
    return el;
  }
  function renderQuestsPanel() {
    if (!questsPanelEl) return;
    const count = questsPanelEl.querySelector(".qp-count");
    if (count) count.textContent = `${questsDone.size}/${QUESTS.length}`;
    questsPanelEl.querySelectorAll(".qp-item").forEach((li) => {
      const id = li.dataset.qid;
      li.classList.toggle("done", questsDone.has(id));
    });
  }
  function openQuestsPanel() {
    const el = buildQuestsPanel();
    renderQuestsPanel();
    el.classList.add("open");
    el.setAttribute("aria-hidden", "false");
  }
  function closeQuestsPanel() {
    if (!questsPanelEl) return;
    questsPanelEl.classList.remove("open");
    questsPanelEl.setAttribute("aria-hidden", "true");
  }
  function toggleQuestsPanel() {
    if (questsPanelEl && questsPanelEl.classList.contains("open")) closeQuestsPanel();
    else openQuestsPanel();
  }

  // ── CHECK ──────────────────────────────────────────────────────────
  // Called after every grid mutation. Fires reward + persists on the
  // rising edge of a quest's predicate (false → true). Each quest's
  // reward fires at most once per session; the next session resets the
  // "fired" flag so re-completing replays the moment.
  const lastQuestState = new Map(); // id -> last predicate value
  function checkQuests() {
    let dirty = false;
    for (const q of QUESTS) {
      let passed = false;
      try { passed = !!q.check(); } catch { passed = false; }
      const prev = lastQuestState.get(q.id) || false;
      lastQuestState.set(q.id, passed);
      if (!passed) continue;
      // Rising edge only — and only once per session.
      if (prev) continue;
      if (sessionFired.has(q.id)) {
        if (!questsDone.has(q.id)) { questsDone.add(q.id); dirty = true; }
        continue;
      }
      sessionFired.add(q.id);
      if (!questsDone.has(q.id)) { questsDone.add(q.id); dirty = true; }
      else dirty = true; // re-completion across sessions still re-renders the count
      try { q.reward(); } catch {}
    }
    if (dirty) {
      saveQuestsDone();
      renderQuestsPanel();
    }
  }

  // `q` toggles the panel. Bare key only, not while typing.
  window.addEventListener("keydown", (e) => {
    if (e.defaultPrevented) return;
    const tag = (e.target && e.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA" || (e.target && e.target.isContentEditable)) return;
    if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
    if (e.key === "q" || e.key === "Q") {
      toggleQuestsPanel();
      return;
    }
    if (e.key === "Escape" && questsPanelEl && questsPanelEl.classList.contains("open")) {
      closeQuestsPanel();
    }
  });

  // Seed the rising-edge map with the current state so initial passes
  // (e.g. empty grid satisfies "find-silence") don't fire on page load.
  for (const q of QUESTS) {
    try { lastQuestState.set(q.id, !!q.check()); } catch { lastQuestState.set(q.id, false); }
  }

  // ── CLEANUP ──
  const onPageHide = () => {
    clearInterval(pollInterval);
    clearTimeout(cacheTimer);
    window.removeEventListener("resize", onMagResize);
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    clearInterval(idleInterval);
    clearInterval(grooveInterval);
    if (nightRaf) cancelAnimationFrame(nightRaf);
    if (ghostState.recordTimeout) clearTimeout(ghostState.recordTimeout);
    cancelGhostPlayback();
    if (fieldHandle) fieldHandle.destroy();
    if (starsHandle) starsHandle.destroy();
    if (auroraHandle) auroraHandle.destroy();
    if (trailHandle) trailHandle.destroy();
    if (ripplesHandle) ripplesHandle.destroy();
    if (es) { try { es.close(); } catch {} }
    if (chordWheelEl) { try { chordWheelEl.remove(); } catch {} chordWheelEl = null; }
    gsap.killTweensOf("*");
  };
  window.addEventListener("pagehide", onPageHide);
  return {
    destroy: () => {
      clearInterval(pollInterval);
      clearTimeout(cacheTimer);
      window.removeEventListener("resize", onMagResize);
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      clearInterval(idleInterval);
      clearInterval(grooveInterval);
      if (nightRaf) cancelAnimationFrame(nightRaf);
      if (ghostState.recordTimeout) clearTimeout(ghostState.recordTimeout);
      cancelGhostPlayback();
      if (fieldHandle) fieldHandle.destroy();
      if (starsHandle) starsHandle.destroy();
      if (auroraHandle) auroraHandle.destroy();
      if (trailHandle) trailHandle.destroy();
      if (ripplesHandle) ripplesHandle.destroy();
      if (es) { try { es.close(); } catch {} }
      if (chordWheelEl) { try { chordWheelEl.remove(); } catch {} chordWheelEl = null; }
      window.removeEventListener("pagehide", onPageHide);
      gsap.killTweensOf("*");
    },
  };
}
