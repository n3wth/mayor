// Mayor motion system — every shape is meaningful, every motion is signal-driven.
//
// Shapes map to real semantics:
//   citizen-ring     → outer dashed ring; stroke rotates slowly, dash density modulates with citizens
//   citizen          → orbital nodes positioned at angular slots; lit when allocated
//   citizen-slot     → faint orbital nodes; brighten as citizens claim them
//   session-today-fill → vertical bar growing upward from y=780 toward y=220; literally maps to count
//   session-hour-fill → mirror bar on the right
//   active           → triangle: rotates while sessions active, breathes opacity
//   pulse-arc        → 3 concentric arcs; bloom outward when recent_pulse goes up
//   last-email       → square at bottom; brightness/scale = recency
//   corner           → static compass anchors; ambient breathing only
//
// GLSL ambient field:
//   - Fragment shader paints a yellow-on-black warped flow.
//   - Uniforms u_time, u_intensity, u_pulse drive the morph.
//   - The whole field warms toward the page's --y color when busy.
//
// Sparks:
//   - On new email / new citizen / shockwave, emit colored particles using the bold accent palette.
//   - These are the ONLY non-yellow elements on screen.
//
// Easing: every transition uses GSAP curves. No linear, no hard cuts.

const reduceMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const STATS_URL = "/api/stats";
const POLL_MS = 5000;

const E = {
  in:    "power2.in",
  out:   "expo.out",
  inOut: "sine.inOut",
  bounce: "elastic.out(1, 0.45)",
  squish: "back.out(1.6)",
};

// Sparkle accent palette — borrowed from the terminal status line.
// Used SPARINGLY: only on real events (new email, citizen promo, shockwave).
const SPARK_COLORS = [
  "#ffb000", // gold
  "#4ade80", // green
  "#22d3ee", // cyan
  "#c084fc", // magenta-violet
  "#f87171", // red-coral
];

const fmtAge = (s) => {
  if (s == null) return "—";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};

function easedCount(gsap, el, to, duration = 1.4) {
  if (!el) return;
  const fromText = el.getAttribute("data-current") || "0";
  const from = Number(fromText) || 0;
  const target = Number(to) || 0;
  if (from === target) return;
  const proxy = { v: from };
  gsap.to(proxy, {
    v: target,
    duration,
    ease: E.inOut,
    onUpdate: () => {
      el.textContent = String(Math.round(proxy.v));
    },
    onComplete: () => {
      el.setAttribute("data-current", String(target));
    },
  });
}

// ── GLSL FIELD ───────────────────────────────────────────────────────────
// Single-pass fragment shader: warped value-noise glow that lerps from cool
// yellow to warm gold based on intensity, with subtle pulse rings centered
// on the canvas. Cheap (single quad), runs in <1ms on integrated graphics.
function initField(canvas) {
  const gl = canvas.getContext("webgl", { antialias: false, premultipliedAlpha: false, alpha: true });
  if (!gl) return null;

  const VS = `
    attribute vec2 a_pos;
    void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
  `;
  // Domain-warped fbm with two color stops and pulse ring overlay.
  const FS = `
    precision mediump float;
    uniform vec2 u_res;
    uniform float u_time;
    uniform float u_intensity;  // 0..1 — drives warmth + warp amplitude
    uniform float u_pulse;      // 0..1 — drives ring brightness
    uniform vec3 u_cool;        // base yellow (rgb 0..1)
    uniform vec3 u_warm;        // hot gold

    // Quick hash + value noise.
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
      vec2 uv = (gl_FragCoord.xy / u_res.xy);
      vec2 p = uv * 2.0 - 1.0;
      p.x *= u_res.x / u_res.y;

      float t = u_time * 0.05;
      // Domain warp: drift the noise field with itself, scaled by intensity.
      float warpAmt = 0.4 + u_intensity * 0.9;
      vec2 q = vec2(fbm(p + vec2(t, 0.0)), fbm(p + vec2(0.0, -t * 0.8)));
      float n = fbm(p * 1.5 + q * warpAmt + t * 0.3);

      // Vignette toward black at edges so the field doesn't fight the HUD.
      float vig = smoothstep(1.4, 0.2, length(p));

      // Pulse ring: faint expanding ring from center.
      float r = length(p);
      float ring = exp(-pow((r - 0.45 + sin(u_time * 0.6) * 0.05) * 10.0, 2.0)) * u_pulse;

      vec3 col = mix(u_cool, u_warm, u_intensity * 0.7 + n * 0.4);
      float brightness = pow(n, 1.6) * vig * (0.55 + u_pulse * 0.35);
      col *= brightness;
      col += vec3(ring * 0.6);
      col = clamp(col, 0.0, 1.0);

      gl_FragColor = vec4(col, brightness * 0.95);
    }
  `;

  function compile(src, type) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.warn("[field] shader compile fail", gl.getShaderInfoLog(sh));
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
    pulse: gl.getUniformLocation(prog, "u_pulse"),
    cool: gl.getUniformLocation(prog, "u_cool"),
    warm: gl.getUniformLocation(prog, "u_warm"),
  };

  let dpr = Math.min(2, window.devicePixelRatio || 1);
  function resize() {
    const w = canvas.clientWidth | 0;
    const h = canvas.clientHeight | 0;
    canvas.width = (w * dpr) | 0;
    canvas.height = (h * dpr) | 0;
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  resize();
  window.addEventListener("resize", resize);

  // State driven from the outside via setters.
  let state = {
    intensity: 0.0,
    pulse: 0.0,
    cool: [242/255, 228/255, 55/255],
    warm: [255/255, 176/255, 0/255],
  };
  let animatedIntensity = 0.0;
  let animatedPulse = 0.0;
  let raf = 0;
  const t0 = performance.now();

  function tick() {
    // Smooth toward state targets so external changes ease.
    animatedIntensity += (state.intensity - animatedIntensity) * 0.04;
    animatedPulse += (state.pulse - animatedPulse) * 0.06;

    const t = (performance.now() - t0) / 1000;
    gl.uniform2f(u.res, canvas.width, canvas.height);
    gl.uniform1f(u.time, t);
    gl.uniform1f(u.intensity, animatedIntensity);
    gl.uniform1f(u.pulse, animatedPulse);
    gl.uniform3f(u.cool, state.cool[0], state.cool[1], state.cool[2]);
    gl.uniform3f(u.warm, state.warm[0], state.warm[1], state.warm[2]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);

  return {
    setIntensity: (v) => { state.intensity = Math.max(0, Math.min(1, v)); },
    setPulse: (v) => { state.pulse = Math.max(0, Math.min(1, v)); },
    setColors: (cool, warm) => { state.cool = cool; state.warm = warm; },
    destroy: () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); },
  };
}

// ── SPARKS ───────────────────────────────────────────────────────────────
// Emit short-lived colored particles at a screen position. Used on real events.
function emitSparks(gsap, container, x, y, count, opts = {}) {
  if (!container) return;
  const palette = opts.colors || SPARK_COLORS;
  const radius = opts.radius || 200;
  for (let i = 0; i < count; i++) {
    const el = document.createElement("div");
    el.className = "spark";
    const color = palette[Math.floor(Math.random() * palette.length)];
    const size = 4 + Math.random() * 8;
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.background = color;
    el.style.boxShadow = `0 0 ${size * 2}px ${color}`;
    el.style.opacity = "1";
    container.appendChild(el);

    const angle = Math.random() * Math.PI * 2;
    const dist = radius * (0.4 + Math.random() * 0.7);
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist;
    const dur = 0.9 + Math.random() * 0.8;

    gsap.fromTo(el,
      { x: 0, y: 0, scale: 0.2 },
      {
        x: dx, y: dy,
        scale: 1,
        duration: dur * 0.35,
        ease: "power3.out",
      }
    );
    gsap.to(el, {
      opacity: 0,
      scale: 0,
      duration: dur,
      ease: "power2.in",
      delay: dur * 0.2,
      onComplete: () => el.remove(),
    });
  }
}

export function initMotion(gsap) {
  if (!gsap) return { destroy: () => {} };

  const reduced = reduceMotion();
  const letters = Array.from(document.querySelectorAll(".mayor-wrap svg text.l"));
  const shapes = Array.from(document.querySelectorAll(".shape"));
  const stage = document.querySelector(".stage");
  const hb = document.querySelector("[data-hb]");
  const statusText = document.querySelector("[data-status]");
  const sparksLayer = document.querySelector("[data-sparks]");
  const fieldCanvas = document.querySelector("[data-field]");

  // ── GLSL field ─────────────────────────────────────────
  const field = !reduced && fieldCanvas ? initField(fieldCanvas) : null;

  // Shape lookup by signal
  const bySignal = {};
  shapes.forEach((el) => {
    const signal = el.getAttribute("data-signal") || "decor";
    bySignal[signal] = bySignal[signal] || [];
    bySignal[signal].push(el);
    el.style.transformBox = "fill-box";
    el.style.transformOrigin = "center center";
  });
  letters.forEach((el) => {
    el.style.transformBox = "fill-box";
    el.style.transformOrigin = "center center";
  });

  // Position citizen orbital nodes around the ring.
  // Center = (800, 500), radius = 380. Equally spaced 8 slots.
  const orbitNodes = [...(bySignal["citizen"] || []), ...(bySignal["citizen-slot"] || [])];
  const ORBIT_CX = 800, ORBIT_CY = 500, ORBIT_R = 380;
  orbitNodes.forEach((g, i) => {
    const total = orbitNodes.length;
    // Start at top (-90°) and go clockwise.
    const a = -Math.PI / 2 + (i / total) * Math.PI * 2;
    const x = ORBIT_CX + Math.cos(a) * ORBIT_R;
    const y = ORBIT_CY + Math.sin(a) * ORBIT_R;
    // Move the inner <circle> by setting the group's transform via cx/cy of the circle.
    const circ = g.querySelector("circle");
    const tip = g.querySelector("text");
    if (circ) { circ.setAttribute("cx", x); circ.setAttribute("cy", y); }
    if (tip)  { tip.setAttribute("x", x); tip.setAttribute("y", y + 42); }
    // Store base position for spark emission
    g.dataset.cx = x;
    g.dataset.cy = y;
  });

  // ── ENTRANCE ───────────────────────────────────────────
  if (!reduced) {
    gsap.set(letters, { yPercent: 60, opacity: 0 });
    gsap.set(shapes, { scale: 0.4, opacity: 0 });
    gsap.set(".hud .panel, .cta", { opacity: 0, y: 6 });

    const tl = gsap.timeline({ defaults: { ease: E.out } });
    tl.to(shapes, {
      scale: 1, opacity: 1,
      duration: 1.4,
      stagger: { amount: 0.7, from: "random" },
      ease: E.squish,
    }, 0)
      .to(letters, {
        yPercent: 0, opacity: 1,
        duration: 1.1, stagger: 0.07, ease: "power3.out",
      }, 0.2)
      .to(".hud .panel, .cta", {
        opacity: 0.85, y: 0,
        duration: 0.7, stagger: 0.06, ease: E.out,
      }, 0.6);
  } else {
    gsap.set(letters, { yPercent: 0, opacity: 1 });
    gsap.set(shapes, { scale: 1, opacity: 1 });
  }

  // ── PER-LETTER PERSONALITY ─────────────────────────────
  if (!reduced) {
    const [M, A, Y, O, R] = letters;
    const start = 1.4;
    gsap.to(M, { yPercent: 0.8, duration: 4.2, ease: E.inOut, yoyo: true, repeat: -1, delay: start });
    gsap.to(A, { rotation: 1.2, duration: 3.4, ease: E.inOut, yoyo: true, repeat: -1, delay: start + 0.3 });
    gsap.to(Y, { scaleY: 1.03, transformOrigin: "center bottom", duration: 2.8, ease: E.inOut, yoyo: true, repeat: -1, delay: start + 0.6 });
    gsap.to(O, { rotation: -2, duration: 5.5, ease: E.inOut, yoyo: true, repeat: -1, delay: start + 0.2 });
    gsap.to(R, { yPercent: -2, duration: 1.8, ease: E.inOut, yoyo: true, repeat: -1, delay: start + 0.8 });
  }

  // ── CITIZEN RING: slowly rotate the dashed ring ────────
  if (!reduced) {
    const ring = (bySignal["citizen-ring"] || [])[0];
    if (ring) {
      gsap.to(ring, { rotation: 360, duration: 120, ease: "none", repeat: -1, transformOrigin: "800px 500px" });
    }
  }

  // ── PULSE ARCS: continuous slow breath, amplitude scales with pulse ──
  // Stored so applyStats can modulate amplitude.
  const arcShapes = bySignal["pulse-arc"] || [];
  const arcBreathe = arcShapes.map((arc, i) => {
    if (reduced) return null;
    return gsap.to(arc, {
      scale: 1.04,
      transformOrigin: "800px 500px",
      duration: 3.2 + i * 0.7,
      ease: E.inOut,
      yoyo: true,
      repeat: -1,
      delay: i * 0.4,
    });
  });

  // ── HEARTBEAT ──────────────────────────────────────────
  let heartbeatTween = null;
  function setHeartbeat(activeCount) {
    if (heartbeatTween) heartbeatTween.kill();
    const speed = activeCount > 0 ? 0.6 : 1.2;
    heartbeatTween = gsap.to(hb, {
      scale: activeCount > 0 ? 1.9 : 1.6,
      opacity: 0.4,
      duration: speed,
      ease: E.inOut,
      yoyo: true,
      repeat: -1,
    });
  }
  if (hb && !reduced) setHeartbeat(0);

  // ── CURSOR INFLUENCE: parallax depth on letters/shapes ──
  const lettersRot = letters.map((el) => gsap.quickTo(el, "rotation", { duration: 0.7, ease: "power3.out" }));
  const lettersY = letters.map((el) => gsap.quickTo(el, "yPercent", { duration: 0.7, ease: "power3.out" }));
  const shapesX = shapes.map((el) => gsap.quickTo(el, "xPercent", { duration: 1.1, ease: "power3.out" }));
  const shapesY = shapes.map((el) => gsap.quickTo(el, "yPercent", { duration: 1.1, ease: "power3.out" }));

  if (!reduced) {
    window.addEventListener("pointermove", (e) => {
      const w = window.innerWidth, h = window.innerHeight;
      const nx = (e.clientX / w - 0.5) * 2;
      const ny = (e.clientY / h - 0.5) * 2;
      letters.forEach((_, i) => {
        const lx = (i - (letters.length - 1) / 2) / ((letters.length - 1) / 2);
        const tilt = (nx - lx) * 4;
        lettersRot[i](tilt);
        lettersY[i](ny * -2);
      });
      shapes.forEach((_, i) => {
        const depth = 0.2 + (i % 5) * 0.12;
        shapesX[i](nx * 30 * depth);
        shapesY[i](ny * 25 * depth);
      });
    }, { passive: true });
  }

  // ── CLICK SHOCKWAVE: now also emits sparks ─────────────
  function shockwave(e) {
    if (reduced) return;
    gsap.to(letters, {
      keyframes: [
        { scale: 0.93, duration: 0.15, ease: E.in },
        { scale: 1, duration: 0.7, ease: E.bounce },
      ],
      stagger: 0.04,
      overwrite: "auto",
    });
    gsap.to(shapes, {
      keyframes: [
        { scale: "+=0.3", rotation: "+=12", duration: 0.25, ease: "power3.out" },
        { scale: "-=0.3", rotation: "+=0", duration: 1.4, ease: "elastic.out(1, 0.5)" },
      ],
      stagger: { amount: 0.4, from: "random" },
      overwrite: "auto",
    });
    // Colored spark burst at click point — sparingly
    if (e && sparksLayer) {
      emitSparks(gsap, sparksLayer, e.clientX, e.clientY, 14, { radius: 220 });
    }
    // Pulse the GLSL field briefly
    if (field) {
      const proxy = { v: 1 };
      field.setPulse(1);
      gsap.to(proxy, { v: 0, duration: 1.4, ease: E.inOut, onUpdate: () => field.setPulse(proxy.v) });
    }
  }
  if (!reduced) {
    stage.addEventListener("click", (e) => {
      if (e.target.closest("a, .cta")) return;
      shockwave(e);
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        shockwave({ clientX: cx, clientY: cy });
      }
    });
  }

  // ── TAB-RETURN GREET ───────────────────────────────────
  if (!reduced) {
    let hiddenAt = 0;
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) { hiddenAt = Date.now(); return; }
      if (hiddenAt && Date.now() - hiddenAt > 400) {
        gsap.to(letters, {
          keyframes: [
            { yPercent: -3, duration: 0.6, ease: "power2.out" },
            { yPercent: 0, duration: 1.2, ease: E.inOut },
          ],
          stagger: 0.06,
          overwrite: "auto",
        });
      }
      hiddenAt = 0;
    });
  }

  // Helper: convert SVG viewBox coords (1600x1000) → screen pixel coords for sparks.
  function svgToScreen(svgX, svgY) {
    const svg = document.querySelector(".shapes svg");
    if (!svg) return { x: svgX, y: svgY };
    const rect = svg.getBoundingClientRect();
    // viewBox is 1600x1000 with preserveAspectRatio="xMidYMid slice"
    const scale = Math.max(rect.width / 1600, rect.height / 1000);
    const offX = rect.left + (rect.width - 1600 * scale) / 2;
    const offY = rect.top + (rect.height - 1000 * scale) / 2;
    return { x: offX + svgX * scale, y: offY + svgY * scale };
  }

  // ── SIGNAL ENGINE: poll /api/stats and animate shapes ──
  let lastStats = null;
  let activeTriangleTween = null;

  function applyStats(s) {
    easedCount(gsap, document.querySelector('[data-stat="citizens"]'), s.citizens || 0);
    easedCount(gsap, document.querySelector('[data-stat="sessions_today"]'), s.sessions_today || 0);
    const ageEl = document.querySelector('[data-stat="last_email_age"]');
    if (ageEl) ageEl.textContent = fmtAge(s.last_email_age_seconds);

    if (statusText) statusText.textContent = s.online === false ? "offline" : "online";
    if (hb) hb.classList.toggle("offline", s.online === false);

    // ── citizen orbital nodes ─────────────────────────────
    const citizenShapes = bySignal["citizen"] || [];
    const slotShapes = bySignal["citizen-slot"] || [];
    const citizens = s.citizens || 0;

    citizenShapes.forEach((el, i) => {
      const isLit = i < citizens;
      gsap.to(el, {
        opacity: isLit ? 1 : 0.18,
        scale: isLit ? 1 : 0.55,
        duration: 1.6,
        ease: E.inOut,
        overwrite: "auto",
      });
    });
    slotShapes.forEach((el, i) => {
      const idx = citizenShapes.length + i;
      const isLit = idx < citizens;
      gsap.to(el, {
        opacity: isLit ? 0.95 : 0.18,
        scale: isLit ? 1 : 0.55,
        duration: 1.6,
        ease: E.inOut,
        overwrite: "auto",
      });
    });

    // ── citizen ring: stroke opacity scales with how many citizens ──
    const ring = (bySignal["citizen-ring"] || [])[0];
    if (ring) {
      const norm = Math.min(1, citizens / 8);
      const strokeCircle = ring.querySelector("circle");
      if (strokeCircle) {
        gsap.to(strokeCircle, {
          opacity: 0.2 + norm * 0.55,
          duration: 1.6,
          ease: E.inOut,
          overwrite: "auto",
        });
      }
    }

    // ── session bars: literal bar-chart fills ──
    // Bar maps from y=780 (bottom) up to y=220 (top), 560px tall, 30 sessions = full.
    const todayFill = (bySignal["session-today-fill"] || [])[0];
    if (todayFill) {
      const norm = Math.min(1, (s.sessions_today || 0) / 30);
      const line = todayFill.querySelector("line");
      if (line) {
        const targetY = 780 - norm * 560;
        gsap.to(line, {
          attr: { y2: targetY },
          duration: 1.8,
          ease: E.inOut,
          overwrite: "auto",
        });
      }
    }
    const hourFill = (bySignal["session-hour-fill"] || [])[0];
    if (hourFill) {
      const norm = Math.min(1, (s.sessions_this_hour || 0) / 12);
      const line = hourFill.querySelector("line");
      if (line) {
        const targetY = 780 - norm * 560;
        gsap.to(line, {
          attr: { y2: targetY },
          duration: 1.8,
          ease: E.inOut,
          overwrite: "auto",
        });
      }
    }

    // ── active triangle ──
    const tri = (bySignal["active"] || [])[0];
    if (tri) {
      const isActive = (s.active_sessions || 0) > 0;
      if (isActive && !activeTriangleTween) {
        activeTriangleTween = gsap.to(tri, {
          rotation: "+=360",
          duration: 6,
          ease: "none",
          repeat: -1,
        });
        gsap.to(tri, { opacity: 1, scale: 1.15, duration: 0.8, ease: E.out, overwrite: "auto" });
      } else if (!isActive && activeTriangleTween) {
        activeTriangleTween.kill();
        activeTriangleTween = null;
        gsap.to(tri, { rotation: 0, opacity: 0.7, scale: 1, duration: 1.2, ease: E.inOut, overwrite: "auto" });
      }
    }

    // ── pulse arcs: amplitude tracks recent_pulse ──
    const pulse = Number(s.recent_pulse || 0);
    arcBreathe.forEach((tw, i) => {
      if (!tw) return;
      // Modulate amplitude by setting timeScale + restarting target via vars.
      tw.timeScale(1 + pulse * 0.8);
    });
    arcShapes.forEach((arc, i) => {
      const circle = arc.querySelector("circle");
      if (circle) {
        gsap.to(circle, {
          opacity: (0.18 + i * 0.06) + pulse * 0.4,
          duration: 1.2,
          ease: E.inOut,
          overwrite: "auto",
        });
      }
    });

    // ── last-email well ──
    const last = (bySignal["last-email"] || [])[0];
    if (last) {
      const age = s.last_email_age_seconds;
      let intensity = 0.3;
      if (age != null) {
        if (age < 30) intensity = 1;
        else if (age < 120) intensity = 0.85;
        else if (age < 600) intensity = 0.6;
        else if (age < 3600) intensity = 0.45;
      }
      gsap.to(last, {
        opacity: intensity,
        scale: 0.9 + intensity * 0.3,
        duration: 1.4,
        ease: E.inOut,
        overwrite: "auto",
      });
    }

    // ── corners: gentle breath only ──
    if (!reduced && !lastStats) {
      (bySignal["corner"] || []).forEach((el, i) => {
        gsap.to(el, {
          opacity: 0.3,
          duration: 3.5 + i * 0.5,
          ease: E.inOut,
          yoyo: true,
          repeat: -1,
        });
      });
    }

    // ── EVENTS: real changes since last poll → colored sparks ──
    if (lastStats) {
      const newSession = (s.sessions_today || 0) > (lastStats.sessions_today || 0);
      const newCitizen = (s.citizens || 0) > (lastStats.citizens || 0);

      if (newSession) {
        // Letters joyful hop
        gsap.to(letters, {
          keyframes: [
            { yPercent: -4, duration: 0.4, ease: "power2.out" },
            { yPercent: 0, duration: 1.0, ease: E.bounce },
          ],
          stagger: 0.05,
          overwrite: "auto",
        });
        // Colored sparks from the bottom last-email well — REAL EVENT, accent color allowed
        if (sparksLayer) {
          const { x, y } = svgToScreen(800, 920);
          emitSparks(gsap, sparksLayer, x, y, 18, { radius: 240 });
        }
        // GLSL pulse
        if (field) {
          const proxy = { v: 1 };
          field.setPulse(1);
          gsap.to(proxy, { v: 0, duration: 2.2, ease: E.inOut, onUpdate: () => field.setPulse(proxy.v) });
        }
      }

      if (newCitizen) {
        // The newly-promoted citizen entrance: scale + 360° spin
        const idx = (s.citizens || 0) - 1;
        const orbitNode = citizenShapes[idx] || slotShapes[idx - citizenShapes.length];
        if (orbitNode) {
          gsap.fromTo(orbitNode,
            { scale: 0, rotation: -90, opacity: 0 },
            { scale: 1, rotation: 0, opacity: 1, duration: 1.6, ease: E.bounce, overwrite: "auto" }
          );
          // Burst of accent-colored sparks at the new citizen's orbital position — REAL EVENT
          if (sparksLayer) {
            const cx = Number(orbitNode.dataset.cx) || 800;
            const cy = Number(orbitNode.dataset.cy) || 500;
            const { x, y } = svgToScreen(cx, cy);
            emitSparks(gsap, sparksLayer, x, y, 24, { radius: 180 });
          }
        }
      }
    }

    setHeartbeat(s.active_sessions || 0);

    // ── PAGE-LEVEL MORPH ──────────────────────────────────
    const ageScore = (() => {
      const a = s.last_email_age_seconds;
      if (a == null) return 0;
      if (a < 60) return 1;
      if (a < 300) return 0.7;
      if (a < 1800) return 0.4;
      if (a < 7200) return 0.2;
      return 0.05;
    })();
    const activeScore = Math.min(1, (s.active_sessions || 0) / 3);
    const intensity = Math.min(1, 0.45 * (s.recent_pulse || 0) + 0.35 * activeScore + 0.20 * ageScore);

    const lerp = (a, b, t) => Math.round(a + (b - a) * t);
    const cool = [242, 228, 55];
    const warm = [255, 176, 0];
    const r = lerp(cool[0], warm[0], intensity);
    const g = lerp(cool[1], warm[1], intensity);
    const bb = lerp(cool[2], warm[2], intensity);
    const newY = `rgb(${r}, ${g}, ${bb})`;

    const root = document.documentElement;
    const cur = root.style.getPropertyValue("--y") || "rgb(242, 228, 55)";
    if (cur !== newY) {
      gsap.to(root, {
        "--y": newY,
        duration: 2.2,
        ease: E.inOut,
      });
    }

    // GLSL field: drive intensity uniform smoothly (it has its own internal damping too)
    if (field) field.setIntensity(intensity);

    const targetMayorScale = 1 + intensity * 0.04;
    gsap.to(".mayor-wrap svg", {
      scale: targetMayorScale,
      duration: 2.4,
      ease: E.inOut,
      overwrite: "auto",
    });

    lastStats = s;
  }

  async function pollStats() {
    try {
      const res = await fetch(STATS_URL, { cache: "no-cache" });
      if (!res.ok) throw new Error("stats");
      const data = await res.json();
      applyStats(data);
    } catch {
      applyStats({
        online: false,
        citizens: lastStats?.citizens || 0,
        sessions_today: 0,
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
    if (field) field.destroy();
    gsap.killTweensOf("*");
  };
  window.addEventListener("pagehide", onPageHide);

  return {
    destroy: () => {
      clearInterval(pollInterval);
      if (field) field.destroy();
      window.removeEventListener("pagehide", onPageHide);
      gsap.killTweensOf("*");
    },
  };
}
