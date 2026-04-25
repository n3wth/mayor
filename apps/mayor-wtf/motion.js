// Mayor motion — beauty pass.
//
// Restraint over flourish. The page sits still until something real happens.
// The only ambient motion is a slow drift in the WebGL field and a periodic
// specular sweep across the letters every ~8 seconds.

const reduceMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const STATS_URL = "/api/stats";
const POLL_MS = 5000;
const SYNC_BASE = "https://inbox.mayor.wtf";

// Stable per-tab nonce so SSE peers can ignore their own echoed events.
const SELF_ID = (() => {
  const g = (Math.random().toString(36) + Date.now().toString(36)).slice(2, 14);
  try { return g; } catch { return "anon"; }
})();

const E = {
  out:    "expo.out",
  inOut:  "sine.inOut",
  bounce: "elastic.out(1, 0.6)",
  glide:  "power4.out",
};

const SPARK_COLORS = ["#ffd54a", "#ffb000"]; // restrained — yellow family only

// ── BACKGROUND: WebGL volumetric yellow ─────────────────────────────────
function initField(canvas) {
  const gl = canvas.getContext("webgl", { antialias: false, alpha: true });
  if (!gl) return null;

  const VS = `
    attribute vec2 a_pos;
    void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
  `;
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
      for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.07; a *= 0.5; }
      return v;
    }

    void main() {
      vec2 uv = gl_FragCoord.xy / u_res.xy;
      vec2 p = uv * 2.0 - 1.0;
      p.x *= u_res.x / u_res.y;

      float t = u_time * 0.025;

      // Two soft yellow lights drifting through space
      vec2 well1 = vec2(sin(t * 0.7) * 0.55, cos(t * 0.5) * 0.30);
      vec2 well2 = vec2(cos(t * 0.6 + 1.7) * 0.65, sin(t * 0.4 + 0.4) * 0.45);
      float d1 = length(p - well1);
      float d2 = length(p - well2);

      vec2 m = (u_mouse * 2.0 - 1.0) * vec2(u_res.x / u_res.y, 1.0);
      float dm = length(p - m);

      vec2 q = vec2(fbm(p + t), fbm(p - t * 0.6));
      float n = fbm(p * 1.5 + q * (0.4 + u_intensity * 0.4));

      // Yellow palette — quiet daylight
      vec3 deep = vec3(0.42, 0.36, 0.05);   // dark olive
      vec3 mid_ = vec3(0.78, 0.69, 0.12);   // y-deep
      vec3 hi   = vec3(1.00, 0.83, 0.27);   // y-warm

      float light1 = smoothstep(1.5, 0.0, d1);
      float light2 = smoothstep(1.3, 0.0, d2);
      float lightM = smoothstep(0.7, 0.0, dm) * 0.5;

      vec3 col = mix(deep * 0.45, mid_, light1 * 0.9);
      col = mix(col, hi, light2 * 0.6);
      col += hi * lightM * 0.25;

      float shade = 0.55 + n * 0.5;
      col *= shade;

      // Pulse ring
      float pulseR = u_pulseAge * 0.7;
      vec2 pp = (u_pulse * 2.0 - 1.0) * vec2(u_res.x / u_res.y, 1.0);
      float pd = length(p - pp);
      float ring = exp(-pow((pd - pulseR) * 6.0, 2.0)) * exp(-u_pulseAge * 0.7);
      col += hi * ring * 0.45;

      // Strong vignette so chrome stays readable
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

// ── INK PARTICLES (subtle, low-opacity, behind hero) ────────────────────
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

  const MAX = 60;
  const particles = [];
  for (let i = 0; i < MAX; i++) {
    particles.push({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: 0, vy: 0,
      life: Math.random() * 200 + 100,
      age: 0,
      r: 0.5 + Math.random() * 1.0,
      alive: false,
    });
  }
  function noise2(x, y) {
    const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return n - Math.floor(n);
  }
  function flowAngle(x, y, t) {
    const fx = x * 0.0014 + t * 0.04;
    const fy = y * 0.0014;
    return (noise2(Math.floor(fx * 4) / 4, Math.floor(fy * 4) / 4) +
            noise2(Math.floor(fx * 2) / 2, Math.floor(fy * 2) / 2) * 0.5) * Math.PI * 2;
  }

  let raf = 0;
  let t = 0;
  function tick() {
    t += 0.016;
    ctx.clearRect(0, 0, W, H);
    const target = Math.min(MAX, Math.max(8, getDensity()));
    let alive = 0;
    for (const p of particles) if (p.alive) alive++;
    if (alive < target) {
      for (const p of particles) {
        if (alive >= target) break;
        if (!p.alive) {
          p.alive = true;
          p.x = Math.random() * W;
          p.y = Math.random() * H;
          p.age = 0;
          p.life = 120 + Math.random() * 220;
          alive++;
        }
      }
    } else if (alive > target) {
      for (const p of particles) {
        if (alive <= target) break;
        if (p.alive && Math.random() < 0.02) { p.alive = false; alive--; }
      }
    }

    ctx.fillStyle = "rgba(0,0,0,0.6)";
    for (const p of particles) {
      if (!p.alive) continue;
      const a = flowAngle(p.x, p.y, t);
      p.vx = p.vx * 0.88 + Math.cos(a) * 0.45;
      p.vy = p.vy * 0.88 + Math.sin(a) * 0.45;
      p.x += p.vx;
      p.y += p.vy;
      p.age++;
      if (p.age > p.life || p.x < -10 || p.x > W + 10 || p.y < -10 || p.y > H + 10) {
        p.alive = false;
        continue;
      }
      const fadeIn = Math.min(1, p.age / 40);
      const fadeOut = Math.min(1, (p.life - p.age) / 40);
      ctx.globalAlpha = Math.min(fadeIn, fadeOut) * 0.32;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * dpr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);

  return { destroy: () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); } };
}

// ── SPARKS ──────────────────────────────────────────────────────────────
function emitSparks(gsap, container, x, y, count, opts = {}) {
  if (!container) return;
  const palette = opts.colors || SPARK_COLORS;
  const radius = opts.radius || 160;
  for (let i = 0; i < count; i++) {
    const el = document.createElement("div");
    el.className = "spark";
    const color = palette[Math.floor(Math.random() * palette.length)];
    const size = 3 + Math.random() * 4;
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.background = color;
    el.style.boxShadow = `0 0 ${size * 3}px ${color}`;
    container.appendChild(el);
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.4;
    const dist = radius * (0.4 + Math.random() * 0.7);
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist;
    const dur = 1.0 + Math.random() * 0.9;
    gsap.fromTo(el,
      { x: 0, y: 0, scale: 0.2, opacity: 1 },
      { x: dx, y: dy, scale: 1, duration: dur, ease: "power2.out" }
    );
    gsap.to(el, { y: dy + 200, duration: dur * 0.9, delay: dur * 0.7, ease: "power2.in" });
    gsap.to(el, {
      opacity: 0, scale: 0.2,
      duration: 0.7, delay: dur * 1.0, ease: "power2.in",
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
    shine: document.querySelector('[data-layer="shine"]'),
  };
  const letters = Array.from(document.querySelectorAll(".ml"));
  letters.forEach((l) => {
    l.style.transformBox = "fill-box";
    l.style.transformOrigin = "center bottom";
  });
  const shineRect = document.querySelector("[data-shine-rect]");
  const statNum = document.querySelector("[data-stat-num]");
  const statLab = document.querySelector("[data-stat-lab]");
  const tagstat = document.querySelector("[data-tagstat]");

  // ── FIELD + STREAM ──
  let fieldHandle = null, streamHandle = null;
  let streamDensity = 12;
  if (!reduced) {
    fieldHandle = initField(fieldCanvas);
    streamHandle = initStream(streamCanvas, () => streamDensity);
  }

  // ── HERO ENTRANCE: cinematic letter reveal ──
  // Each letter starts below baseline, masked by container overflow, slides
  // up into place with stagger. The halo and shine fade in afterward.
  if (!reduced) {
    gsap.set(layers.back, { opacity: 0, scale: 0.92 });
    gsap.set(layers.shine, { opacity: 0 });
    gsap.set(letters, { yPercent: 110, opacity: 0 });

    const tl = gsap.timeline({ defaults: { ease: E.glide } });
    tl.to(letters, {
      yPercent: 0,
      opacity: 1,
      duration: 1.2,
      stagger: 0.07,
    }, 0)
      .to(layers.back, { opacity: 1, scale: 1, duration: 1.6, ease: E.out }, 0.3)
      .to(layers.shine, { opacity: 0.9, duration: 0.8 }, 0.9)
      .from(".tagline, .top.l, .top.r, .cta-wrap", {
        opacity: 0, y: 10, duration: 0.9, stagger: 0.08,
      }, 0.7);
  }

  // ── SHINE SWEEP: every ~8s, a soft white pass slides across MAYOR ──
  // The rect is 700 wide and starts at x=-700 (offscreen left). We slide
  // it to x=1500 (offscreen right) over 1.6s, then wait ~6.5s, then repeat.
  if (!reduced && shineRect) {
    const sweep = () => {
      gsap.fromTo(shineRect,
        { attr: { x: -700 } },
        {
          attr: { x: 1500 },
          duration: 1.6,
          ease: "sine.inOut",
          onComplete: () => {
            gsap.delayedCall(6.5 + Math.random() * 2, sweep);
          },
        }
      );
    };
    gsap.delayedCall(2.6, sweep);
  }

  // ── CURSOR ──
  if (!reduced && halo && dot) {
    const haloX = gsap.quickTo(halo, "x", { duration: 0.55, ease: "power3.out" });
    const haloY = gsap.quickTo(halo, "y", { duration: 0.55, ease: "power3.out" });
    const dotX = gsap.quickTo(dot, "x", { duration: 0.10, ease: "power2.out" });
    const dotY = gsap.quickTo(dot, "y", { duration: 0.10, ease: "power2.out" });
    window.addEventListener("pointermove", (e) => {
      haloX(e.clientX); haloY(e.clientY);
      dotX(e.clientX); dotY(e.clientY);
      if (fieldHandle) fieldHandle.setMouse(e.clientX / window.innerWidth, 1 - e.clientY / window.innerHeight);
      const nx = e.clientX / window.innerWidth - 0.5;
      const ny = e.clientY / window.innerHeight - 0.5;
      gsap.to(layers.back, { x: nx * 18, y: ny * 10, duration: 1.4, ease: "power3.out" });
      gsap.to(layers.mid,  { x: nx * -8, y: ny * -4, duration: 1.0, ease: "power3.out" });
      gsap.to(layers.shine,{ x: nx * 22, y: ny * 12, duration: 0.8, ease: "power3.out" });
    }, { passive: true });

    document.querySelectorAll(".chip, .cta").forEach((el) => {
      el.addEventListener("pointerenter", () => gsap.to(halo, { scale: 1.5, duration: 0.4, ease: "power3.out" }));
      el.addEventListener("pointerleave", () => gsap.to(halo, { scale: 1, duration: 0.5, ease: "power3.out" }));
    });
  }

  // ── LETTER DELIGHT (real events only) ──
  function delightLetter(opts = {}) {
    if (reduced || !letters.length) return;
    const letter = opts.letter || letters[Math.floor(Math.random() * letters.length)];
    gsap.timeline({ overwrite: false })
      .to(letter, { yPercent: -6, scale: 1.06, duration: 0.4, ease: "back.out(2.4)" }, 0)
      .to(letter, { yPercent: 0, scale: 1, duration: 1.4, ease: E.bounce }, 0.4);
    if (sparksLayer) {
      const r = letter.getBoundingClientRect();
      emitSparks(gsap, sparksLayer, r.left + r.width / 2, r.top + r.height * 0.3, opts.count ?? 12, { radius: 160 });
    }
  }

  // ── CLICK PULSE ──
  function shockwave(e) {
    if (reduced) return;
    if (fieldHandle && e) {
      fieldHandle.triggerPulse(e.clientX / window.innerWidth, 1 - e.clientY / window.innerHeight);
    }
    // Letters bow softly
    letters.forEach((l, i) => {
      gsap.fromTo(l,
        { y: 0 },
        { y: -6, duration: 0.18, ease: "power2.out", delay: i * 0.04 }
      );
      gsap.to(l, { y: 0, duration: 0.9, ease: E.bounce, delay: i * 0.04 + 0.18 });
    });
    if (Math.random() < 0.34) delightLetter({ count: 10 });
  }
  // ── REMOTE PRESENCE: when other visitors interact, mirror it here ──
  // Server publishes events on /events (SSE). Each event is {type,x,y,from,ts}.
  // x/y are normalized 0..1 (screen-space). We translate to local pixel coords
  // and fire a ghost ripple — same animation as a local click but no spark
  // sound, so it reads as 'someone else is here'.
  function ghostRipple(nx, ny) {
    if (reduced) return;
    const px = nx * window.innerWidth;
    const py = ny * window.innerHeight;
    if (fieldHandle) fieldHandle.triggerPulse(nx, 1 - ny);
    // Faint dot at the spot, fades out — represents 'someone clicked here'.
    if (sparksLayer) {
      const ghost = document.createElement("div");
      ghost.className = "spark";
      ghost.style.width = "12px";
      ghost.style.height = "12px";
      ghost.style.left = `${px}px`;
      ghost.style.top = `${py}px`;
      ghost.style.background = "rgba(240,215,42,0.95)";
      ghost.style.boxShadow = "0 0 28px rgba(240,215,42,0.7)";
      ghost.style.transform = "translate(-50%,-50%) scale(0.4)";
      ghost.style.opacity = "0";
      sparksLayer.appendChild(ghost);
      gsap.to(ghost, {
        scale: 1.4, opacity: 1,
        duration: 0.25,
        ease: "power3.out",
      });
      gsap.to(ghost, {
        scale: 3.5, opacity: 0,
        duration: 1.2,
        delay: 0.18,
        ease: "power2.out",
        onComplete: () => ghost.remove(),
      });
    }
    // Letters bow softly as the wave passes (same as click, weaker)
    letters.forEach((l, i) => {
      gsap.fromTo(l,
        { y: 0 },
        { y: -3, duration: 0.18, ease: "power2.out", delay: i * 0.04 }
      );
      gsap.to(l, { y: 0, duration: 0.9, ease: E.bounce, delay: i * 0.04 + 0.18 });
    });
  }

  // Update presence chip text when the count changes.
  let presenceCount = 1;
  function updatePresence(n) {
    presenceCount = n || 1;
    // We render presence inside the existing top-left chip when there are
    // multiple peers; otherwise the citizens count stays as primary.
    if (statNum && statLab && presenceCount > 1) {
      statNum.textContent = String(presenceCount);
      statLab.textContent = presenceCount === 2 ? "watching · you + 1" : `watching · you + ${presenceCount - 1}`;
    }
  }

  // Publish a local event to the server so peers see it.
  function publishEvent(type, e) {
    let nx = 0.5, ny = 0.5;
    if (e && typeof e.clientX === "number") {
      nx = e.clientX / window.innerWidth;
      ny = e.clientY / window.innerHeight;
    }
    // Don't await — fire and forget.
    fetch(`${SYNC_BASE}/event`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type, x: nx, y: ny, from: SELF_ID }),
      keepalive: true,
    }).catch(() => {});
  }

  // ── COLLABORATIVE PALETTE: click letter → click color → all peers update ──
  const root = document.documentElement;
  const palette = document.querySelector("[data-palette]");
  const paletteButtons = palette ? Array.from(palette.querySelectorAll("button")) : [];
  let selectedLetter = null;

  function applyLetterColor(letter, color, animate = true) {
    if (!letter || !color) return;
    const varName = `--letter-color-${letter}`;
    if (animate) {
      // Tween via a proxy so we can blend old → new color smoothly.
      const cur = getComputedStyle(root).getPropertyValue(varName).trim() || "#f0d72a";
      const proxy = { v: 0 };
      gsap.to(proxy, {
        v: 1,
        duration: 1.0,
        ease: "sine.inOut",
        onUpdate: () => {
          // Linear interp between cur and color via canvas
          const blended = lerpHex(cur, color, proxy.v);
          root.style.setProperty(varName, blended);
        },
        onComplete: () => root.style.setProperty(varName, color),
      });
    } else {
      root.style.setProperty(varName, color);
    }
  }

  function lerpHex(a, b, t) {
    const pa = parseHex(a), pb = parseHex(b);
    if (!pa || !pb) return b;
    const r = Math.round(pa[0] + (pb[0] - pa[0]) * t);
    const g = Math.round(pa[1] + (pb[1] - pa[1]) * t);
    const bl = Math.round(pa[2] + (pb[2] - pa[2]) * t);
    return `rgb(${r},${g},${bl})`;
  }
  function parseHex(s) {
    s = s.trim();
    if (s.startsWith("#")) {
      const h = s.slice(1);
      const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
      return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
    }
    const m = s.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (m) return [+m[1], +m[2], +m[3]];
    return null;
  }

  // Letter selection: clicking a MAYOR letter "arms" the palette for it.
  letters.forEach((l) => {
    l.addEventListener("click", (e) => {
      e.stopPropagation();
      letters.forEach((x) => x.classList.remove("selected"));
      l.classList.add("selected");
      selectedLetter = l.dataset.letter;
    });
  });

  // Click outside the letters: deselect.
  document.querySelector(".stage").addEventListener("pointerdown", (e) => {
    if (e.target.closest(".ml") || e.target.closest(".palette")) return;
    letters.forEach((x) => x.classList.remove("selected"));
    selectedLetter = null;
  });

  // Palette click: publish color for the selected letter (or all letters
  // if none selected — fun default for "first time" interactions).
  paletteButtons.forEach((b) => {
    b.addEventListener("click", () => {
      const color = b.dataset.color;
      paletteButtons.forEach((x) => x.classList.toggle("active", x === b));
      const targets = selectedLetter ? [selectedLetter] : ["M", "A", "Y", "O", "R"];
      targets.forEach((letter) => {
        applyLetterColor(letter, color);
        fetch(`${SYNC_BASE}/event`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ type: "color", letter, color, from: SELF_ID }),
          keepalive: true,
        }).catch(() => {});
      });
      // Reset palette swatch active state after a beat — it's transient
      setTimeout(() => paletteButtons.forEach((x) => x.classList.remove("active")), 1400);
    });
  });

  // Modes — solid / outline / dotted / stripes. Same semantics as palette:
  // selected letter (or all) + click a mode → broadcasts to peers.
  const modeButtons = Array.from(document.querySelectorAll("[data-modes] button"));
  function applyLetterMode(letter, mode, animate = true) {
    const target = letters.find((l) => l.dataset.letter === letter);
    if (!target) return;
    if (animate && target.dataset.mode !== mode) {
      // Subtle fade-through so the mode swap doesn't snap.
      gsap.fromTo(target,
        { opacity: 1 },
        {
          opacity: 0.35,
          duration: 0.28,
          ease: "sine.in",
          onComplete: () => {
            target.dataset.mode = mode;
            gsap.to(target, { opacity: 1, duration: 0.5, ease: "sine.out" });
          },
        }
      );
    } else {
      target.dataset.mode = mode;
    }
  }
  modeButtons.forEach((b) => {
    b.addEventListener("click", () => {
      const mode = b.dataset.mode;
      modeButtons.forEach((x) => x.classList.toggle("active", x === b));
      const targets = selectedLetter ? [selectedLetter] : ["M", "A", "Y", "O", "R"];
      targets.forEach((letter) => {
        applyLetterMode(letter, mode);
        fetch(`${SYNC_BASE}/event`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ type: "mode", letter, mode, from: SELF_ID }),
          keepalive: true,
        }).catch(() => {});
      });
      setTimeout(() => modeButtons.forEach((x) => x.classList.remove("active")), 1400);
    });
  });

  // Open SSE connection for incoming events.
  let es = null;
  function connectSync() {
    if (reduced) return;
    try {
      es = new EventSource(`${SYNC_BASE}/events`);
      es.onmessage = (msg) => {
        try {
          const ev = JSON.parse(msg.data);
          if (ev.type === "presence") {
            updatePresence(ev.count);
            return;
          }
          if (ev.type === "colors") {
            for (const [letter, color] of Object.entries(ev.colors || {})) {
              applyLetterColor(letter, color, false);
            }
            return;
          }
          if (ev.type === "modes") {
            for (const [letter, mode] of Object.entries(ev.modes || {})) {
              applyLetterMode(letter, mode, false);
            }
            return;
          }
          // Ignore our own echoes
          if (ev.from === SELF_ID) return;
          if (ev.type === "color") {
            applyLetterColor(ev.letter, ev.color);
            const target = letters.find((l) => l.dataset.letter === ev.letter);
            if (target) {
              gsap.fromTo(target, { y: 0 }, { y: -8, duration: 0.3, ease: "back.out(2)" });
              gsap.to(target, { y: 0, duration: 0.9, ease: E.bounce, delay: 0.3 });
            }
            return;
          }
          if (ev.type === "mode") {
            applyLetterMode(ev.letter, ev.mode);
            const target = letters.find((l) => l.dataset.letter === ev.letter);
            if (target) {
              gsap.fromTo(target, { y: 0 }, { y: -6, duration: 0.3, ease: "back.out(2)" });
              gsap.to(target, { y: 0, duration: 0.9, ease: E.bounce, delay: 0.3 });
            }
            return;
          }
          if (ev.type === "click" || ev.type === "tab") {
            ghostRipple(ev.x ?? 0.5, ev.y ?? 0.5);
          } else if (ev.type === "wave") {
            // Real email arrival — bigger reaction.
            ghostRipple(ev.x ?? 0.5, ev.y ?? 0.18);
            delightLetter({ count: 14 });
          }
        } catch {}
      };
      es.onerror = () => {
        // Auto-reconnect with backoff
        if (es) { try { es.close(); } catch {} es = null; }
        setTimeout(connectSync, 4000);
      };
    } catch {
      setTimeout(connectSync, 6000);
    }
  }
  connectSync();

  if (!reduced) {
    document.querySelector(".stage").addEventListener("click", (e) => {
      if (e.target.closest("a")) return;
      shockwave(e);
      publishEvent("click", e);
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        const fakeE = { clientX: window.innerWidth / 2, clientY: window.innerHeight / 2 };
        shockwave(fakeE);
        publishEvent("click", fakeE);
      }
    });
  }

  // ── TAB-RETURN ──
  if (!reduced) {
    let hiddenAt = 0;
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) { hiddenAt = Date.now(); return; }
      if (hiddenAt && Date.now() - hiddenAt > 600) delightLetter({ count: 12 });
      hiddenAt = 0;
    });
  }

  // ── SIGNAL ENGINE ──
  let lastStats = null;

  function easedNum(el, to, dur = 1.4) {
    if (!el) return;
    const from = Number(el.getAttribute("data-current") || el.textContent) || 0;
    const target = Number(to) || 0;
    if (from === target) return;
    const proxy = { v: from };
    gsap.to(proxy, {
      v: target, duration: dur, ease: E.inOut,
      onUpdate: () => { el.textContent = String(Math.round(proxy.v)); },
      onComplete: () => el.setAttribute("data-current", String(target)),
    });
  }

  function fmtAge(s) {
    if (s == null) return "—";
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.round(s / 60)}m ago`;
    return `${Math.round(s / 3600)}h ago`;
  }

  function applyStats(s) {
    const sessions = s.sessions_today || 0;
    const citizens = s.citizens || 0;
    const active = s.active_sessions || 0;

    // Top-left chip: switches between citizens/active depending on what's happening.
    if (active > 0) {
      easedNum(statNum, active);
      if (statLab) statLab.textContent = "active";
    } else {
      easedNum(statNum, citizens);
      if (statLab) statLab.textContent = citizens === 1 ? "citizen" : "citizens";
    }

    // Tagline second slot — last received age
    if (tagstat) tagstat.textContent = `last received · ${fmtAge(s.last_email_age_seconds)}`;

    // Field + stream intensity
    const pulse = Number(s.recent_pulse || 0);
    const ageScore = (() => {
      const a = s.last_email_age_seconds;
      if (a == null) return 0;
      if (a < 60) return 1;
      if (a < 300) return 0.6;
      if (a < 1800) return 0.3;
      return 0.05;
    })();
    const activeScore = Math.min(1, active / 3);
    const intensity = Math.min(1, 0.45 * pulse + 0.35 * activeScore + 0.20 * ageScore);
    if (fieldHandle) fieldHandle.setIntensity(intensity);
    streamDensity = 8 + Math.round(intensity * 35);

    // Events
    if (lastStats) {
      const newSession = sessions > (lastStats.sessions_today || 0);
      const newCitizen = citizens > (lastStats.citizens || 0);
      if (newSession) {
        delightLetter({ count: 14 });
        if (fieldHandle) fieldHandle.triggerPulse(0.5, 0.2);
      }
      if (newCitizen) {
        letters.forEach((l, i) => setTimeout(() => delightLetter({ letter: l, count: 9 }), i * 90));
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
    if (es) { try { es.close(); } catch {} }
    gsap.killTweensOf("*");
  };
  window.addEventListener("pagehide", onPageHide);
  return {
    destroy: () => {
      clearInterval(pollInterval);
      if (fieldHandle) fieldHandle.destroy();
      if (streamHandle) streamHandle.destroy();
      if (es) { try { es.close(); } catch {} }
      window.removeEventListener("pagehide", onPageHide);
      gsap.killTweensOf("*");
    },
  };
}
