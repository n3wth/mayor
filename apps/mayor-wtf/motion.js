// Mayor motion — implicit, smooth, GSAP-driven object morph.
//
// The page is a yellow plane. MAYOR + a fleet of small "objects" punch black
// cutouts in it. Each object is one session or one citizen. Sessions are
// small organic blobs scattered around the composition. Citizens are larger
// circles that orbit slowly. Objects spawn and morph in via GSAP — no random
// drift, no symmetric mandala.
//
// Smoothness invariants:
//   - One target per (element, property). Reuse handles. No keyframes chains.
//   - Cursor work uses gsap.quickTo. Stat work uses .to with overwrite:auto.
//   - Object spawn uses MorphSVG-style scale-from-zero with elastic.out.

const reduceMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const STATS_URL = "/api/stats";
const POLL_MS = 5000;
const SVG_NS = "http://www.w3.org/2000/svg";

const E = {
  out:    "power3.out",
  inOut:  "sine.inOut",
  bounce: "elastic.out(1, 0.55)",
};

const SPARK_COLORS = ["#ffb000", "#4ade80", "#22d3ee", "#c084fc", "#f87171"];

// Deterministic pseudo-random for stable object placement.
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function emitSparks(gsap, container, x, y, count, opts = {}) {
  if (!container) return;
  const palette = opts.colors || SPARK_COLORS;
  const radius = opts.radius || 180;
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
  const fieldSvg = document.querySelector(".field svg");
  const objectsG = document.getElementById("objects");

  // ── ENTRANCE ───────────────────────────────────────────
  if (!reduced) {
    gsap.from(".field svg", { opacity: 0, duration: 1.2, ease: E.out });
    gsap.from(".cta, .hud", { opacity: 0, y: 6, duration: 0.9, stagger: 0.15, ease: E.out, delay: 0.5 });
  }

  // ── CURSOR PARALLAX: subtle field drift ──
  if (!reduced) {
    const px = gsap.quickTo(".field svg", "xPercent", { duration: 1.4, ease: "power3.out" });
    const py = gsap.quickTo(".field svg", "yPercent", { duration: 1.4, ease: "power3.out" });
    window.addEventListener("pointermove", (e) => {
      const w = window.innerWidth, h = window.innerHeight;
      px((e.clientX / w - 0.5) * 1.4);
      py((e.clientY / h - 0.5) * 1.4);
    }, { passive: true });
  }

  // ── MAYOR LETTERS: per-letter ambient breath + delight bursts ──
  // Each letter is a <text> in the mask. Subtle independent yoyo so the
  // word feels alive without looking choreographed.
  const letters = Array.from(document.querySelectorAll(".ml"));
  const letterPos = new Map(); // letter el -> {cx, cy} in viewBox coords
  letters.forEach((l) => {
    l.style.transformBox = "fill-box";
    l.style.transformOrigin = "center center";
    const cx = Number(l.getAttribute("x"));
    const cy = Number(l.getAttribute("y")) - 110; // visual letter center, not baseline
    letterPos.set(l, { cx, cy });
  });

  if (!reduced) {
    const breathConfigs = [
      { yPercent: 0.6, dur: 4.4, delay: 0.0 },
      { rotation: 1.0, dur: 3.6, delay: 0.3 },
      { scaleY: 1.02,  dur: 2.8, delay: 0.6 },
      { rotation: -1.4, dur: 5.2, delay: 0.2 },
      { yPercent: -1.2, dur: 1.9, delay: 0.7 },
    ];
    letters.forEach((l, i) => {
      const cfg = breathConfigs[i] || breathConfigs[0];
      gsap.to(l, { ...cfg, ease: E.inOut, yoyo: true, repeat: -1 });
    });
  }

  // Letter delight: pick a random letter, do a happy hop, emit colored
  // sparks tangent to it in a fountain. Used on real events (new email,
  // citizen promo) and occasionally on click.
  function delightLetter(opts = {}) {
    if (reduced || !letters.length) return;
    const letter = opts.letter || letters[Math.floor(Math.random() * letters.length)];
    const sparkCount = opts.count ?? 16;
    const direction = opts.direction ?? -1; // -1 = upward fountain

    // Letter hops & wobbles
    gsap.timeline({ overwrite: false })
      .to(letter, { yPercent: -6, scale: 1.06, duration: 0.35, ease: "back.out(2)" }, 0)
      .to(letter, { rotation: (Math.random() - 0.5) * 18, duration: 0.35, ease: "back.out(2)" }, 0)
      .to(letter, { yPercent: 0, scale: 1, rotation: 0, duration: 1.2, ease: E.bounce }, 0.35);

    // Sparks above the letter — fountain shape, biased by `direction`
    if (sparksLayer) {
      const pos = letterPos.get(letter);
      if (pos) {
        const { x, y } = svgToScreen(pos.cx, pos.cy);
        // Custom emit so sparks shoot upward in a cone, not radial.
        for (let i = 0; i < sparkCount; i++) {
          const el = document.createElement("div");
          el.className = "spark";
          const color = SPARK_COLORS[Math.floor(Math.random() * SPARK_COLORS.length)];
          const size = 4 + Math.random() * 7;
          el.style.width = `${size}px`;
          el.style.height = `${size}px`;
          el.style.left = `${x}px`;
          el.style.top = `${y}px`;
          el.style.background = color;
          el.style.boxShadow = `0 0 ${size * 2}px ${color}`;
          sparksLayer.appendChild(el);

          // Cone aimed up: angle in [-π/2 - 0.8 ... -π/2 + 0.8]
          const baseAngle = direction < 0 ? -Math.PI / 2 : Math.PI / 2;
          const angle = baseAngle + (Math.random() - 0.5) * 1.6;
          const dist = 80 + Math.random() * 240;
          const dx = Math.cos(angle) * dist;
          const dy = Math.sin(angle) * dist;
          const dur = 1.0 + Math.random() * 0.9;

          gsap.fromTo(el,
            { x: 0, y: 0, scale: 0.2, opacity: 1 },
            { x: dx, y: dy + 30, scale: 1, duration: dur, ease: "power2.out" }
          );
          // Gravity tail: continue downward after peak
          gsap.to(el, {
            y: dy + 180,
            duration: dur * 0.9,
            delay: dur * 0.7,
            ease: "power2.in",
          });
          gsap.to(el, {
            opacity: 0, scale: 0.2,
            duration: 0.6,
            delay: dur * 1.1,
            ease: "power2.in",
            onComplete: () => el.remove(),
          });
        }
      }
    }
  }

  // ── OBJECT POOL ────────────────────────────────────────
  // Each "object" is a SVG element inside the mask <g id="objects">.
  // Objects with kind="session" are organic blobs scattered around.
  // Objects with kind="citizen" are larger orbiting circles.
  // We diff against current stats and spawn / despawn with GSAP.

  const live = new Map(); // key -> { el, kind, baseTween }

  function pickSessionPosition(seed) {
    // Place sessions in a wide ring AROUND the MAYOR text, avoiding center.
    const rand = mulberry32(seed);
    // Polar coords: r between 320 and 480, angle anywhere.
    // But avoid the band 460..540 in y (the MAYOR text band).
    for (let tries = 0; tries < 20; tries++) {
      const r = 280 + rand() * 220;
      const a = rand() * Math.PI * 2;
      const x = 800 + Math.cos(a) * r * 1.2; // wider horizontal spread
      const y = 500 + Math.sin(a) * r * 0.85;
      // Reject if inside MAYOR band
      if (y > 440 && y < 580 && Math.abs(x - 800) < 480) continue;
      // Reject if outside viewBox
      if (x < 80 || x > 1520 || y < 60 || y > 940) continue;
      return { x, y };
    }
    return { x: 800 + (rand() - 0.5) * 1200, y: 200 + rand() * 200 };
  }

  function makeSessionBlob(seed) {
    const rand = mulberry32(seed * 17 + 3);
    const r = 9 + rand() * 14;
    const c = document.createElementNS(SVG_NS, "circle");
    c.setAttribute("r", "0");
    c.setAttribute("fill", "black");
    c.dataset.r = r;
    return c;
  }

  function spawnSession(key, seed) {
    if (live.has(key)) return;
    const { x, y } = pickSessionPosition(seed);
    const blob = makeSessionBlob(seed);
    blob.setAttribute("cx", x);
    blob.setAttribute("cy", y);
    objectsG.appendChild(blob);
    const targetR = Number(blob.dataset.r);
    if (reduced) {
      blob.setAttribute("r", targetR);
    } else {
      gsap.fromTo(blob,
        { attr: { r: 0 } },
        { attr: { r: targetR }, duration: 1.2, ease: E.bounce, overwrite: "auto" }
      );
    }
    live.set(key, { el: blob, kind: "session", x, y });

    // Subtle ambient breath, unique per object.
    if (!reduced) {
      const rand = mulberry32(seed * 41 + 7);
      const dur = 3 + rand() * 3;
      const delay = rand() * dur;
      gsap.to(blob, {
        attr: { r: targetR * 1.18 },
        duration: dur,
        ease: E.inOut,
        yoyo: true,
        repeat: -1,
        delay,
      });
    }
  }

  function despawnSession(key) {
    const obj = live.get(key);
    if (!obj) return;
    if (reduced) {
      obj.el.remove();
      live.delete(key);
      return;
    }
    gsap.to(obj.el, {
      attr: { r: 0 },
      duration: 0.8,
      ease: "power2.in",
      overwrite: "auto",
      onComplete: () => { obj.el.remove(); live.delete(key); },
    });
  }

  // Citizens: larger circles spaced around an orbit. They animate to their
  // assigned slot when they spawn.
  const ORBIT_CX = 800, ORBIT_CY = 500, ORBIT_R = 480;

  function citizenSlotPos(idx, total) {
    const a = -Math.PI / 2 + (idx / Math.max(total, 1)) * Math.PI * 2;
    return { x: ORBIT_CX + Math.cos(a) * ORBIT_R * 1.05, y: ORBIT_CY + Math.sin(a) * ORBIT_R * 0.7 };
  }

  function spawnCitizen(key, idx, total) {
    if (live.has(key)) return;
    const { x, y } = citizenSlotPos(idx, total);
    const c = document.createElementNS(SVG_NS, "circle");
    c.setAttribute("cx", x);
    c.setAttribute("cy", y);
    c.setAttribute("r", "0");
    c.setAttribute("fill", "black");
    objectsG.appendChild(c);
    const targetR = 42;
    if (reduced) {
      c.setAttribute("r", targetR);
    } else {
      gsap.fromTo(c,
        { attr: { r: 0 } },
        { attr: { r: targetR }, duration: 1.6, ease: E.bounce, overwrite: "auto" }
      );
      gsap.to(c, {
        attr: { r: targetR * 1.12 },
        duration: 4,
        ease: E.inOut,
        yoyo: true,
        repeat: -1,
        delay: idx * 0.3,
      });
    }
    live.set(key, { el: c, kind: "citizen", idx, x, y });
  }

  function reflowCitizens(total) {
    let i = 0;
    for (const [key, obj] of live) {
      if (obj.kind !== "citizen") continue;
      const { x, y } = citizenSlotPos(i, total);
      obj.idx = i;
      obj.x = x;
      obj.y = y;
      gsap.to(obj.el, {
        attr: { cx: x, cy: y },
        duration: 1.6,
        ease: E.inOut,
        overwrite: "auto",
      });
      i++;
    }
  }

  // ── CLICK SHOCKWAVE ──
  function shockwave(e) {
    if (reduced) return;
    for (const obj of live.values()) {
      const r = Number(obj.el.getAttribute("r")) || 10;
      gsap.fromTo(obj.el,
        { attr: { r: r * 1.6 } },
        { attr: { r }, duration: 1.2, ease: E.bounce, overwrite: "auto" }
      );
    }
    if (e && sparksLayer) emitSparks(gsap, sparksLayer, e.clientX, e.clientY, 12, { radius: 200 });
    // 1-in-3 chance of letter delight on click — keeps it surprising
    if (Math.random() < 0.34) delightLetter({ count: 12 });
  }
  if (!reduced) {
    document.querySelector(".stage").addEventListener("click", (e) => {
      if (e.target.closest("a, .cta")) return;
      shockwave(e);
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        shockwave({ clientX: window.innerWidth / 2, clientY: window.innerHeight / 2 });
      }
    });
  }

  function svgToScreen(svgX, svgY) {
    const rect = fieldSvg.getBoundingClientRect();
    const scale = Math.max(rect.width / 1600, rect.height / 1000);
    const offX = rect.left + (rect.width - 1600 * scale) / 2;
    const offY = rect.top + (rect.height - 1000 * scale) / 2;
    return { x: offX + svgX * scale, y: offY + svgY * scale };
  }

  // ── SIGNAL ENGINE ──
  let lastStats = null;
  let dayKey = new Date().toISOString().slice(0, 10);

  function applyStats(s) {
    const sessions = Math.max(0, s.sessions_today || 0);
    const citizens = Math.max(0, s.citizens || 0);

    // SESSION OBJECTS: spawn one cutout per session today, despawn extras.
    // Use deterministic seeds so existing objects keep their positions across polls.
    // Cap visible objects at 60 to keep things readable on very busy days.
    const maxSessions = Math.min(sessions, 60);
    for (let i = 0; i < maxSessions; i++) {
      const key = `session-${dayKey}-${i}`;
      if (!live.has(key)) {
        // Stagger entrance slightly so they don't all pop at once on first load.
        const delay = lastStats ? 0 : i * 0.04;
        if (delay > 0) {
          setTimeout(() => spawnSession(key, i + 1), delay * 1000);
        } else {
          spawnSession(key, i + 1);
        }
      }
    }
    // Despawn sessions beyond the current count (e.g., midnight rollover).
    for (const key of [...live.keys()]) {
      const obj = live.get(key);
      if (obj.kind !== "session") continue;
      const idx = Number(key.split("-").pop());
      if (idx >= maxSessions || key.indexOf(dayKey) === -1) despawnSession(key);
    }

    // CITIZEN OBJECTS: one large cutout per citizen, arranged on the orbit.
    for (let i = 0; i < citizens; i++) {
      const key = `citizen-${i}`;
      if (!live.has(key)) spawnCitizen(key, i, Math.max(citizens, 3));
    }
    reflowCitizens(Math.max(citizens, 3));

    // EVENTS: real changes since last poll → object sparks + letter delight.
    if (lastStats) {
      const newSession = sessions > (lastStats.sessions_today || 0);
      const newCitizen = citizens > (lastStats.citizens || 0);
      if (newSession && sparksLayer) {
        const idx = sessions - 1;
        const obj = live.get(`session-${dayKey}-${idx}`);
        if (obj) {
          const { x, y } = svgToScreen(obj.x, obj.y);
          emitSparks(gsap, sparksLayer, x, y, 14, { radius: 180 });
        }
        // Random letter does a happy hop + colored fountain
        delightLetter({ count: 18 });
      }
      if (newCitizen && sparksLayer) {
        const idx = citizens - 1;
        const obj = live.get(`citizen-${idx}`);
        if (obj) {
          const { x, y } = svgToScreen(obj.x, obj.y);
          emitSparks(gsap, sparksLayer, x, y, 22, { radius: 200 });
        }
        // All five letters do a wave on a citizen promotion
        letters.forEach((l, i) => {
          setTimeout(() => delightLetter({ letter: l, count: 10 }), i * 90);
        });
      }
    }

    // PAGE-LEVEL MORPH: yellow shifts toward warm under load.
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

    const lerp = (a, b, t) => Math.round(a + (b - a) * t);
    const r = lerp(242, 255, intensity);
    const g = lerp(228, 176, intensity);
    const bb = lerp(55, 0, intensity);
    const newY = `rgb(${r}, ${g}, ${bb})`;
    const root = document.documentElement;
    if (root.style.getPropertyValue("--y") !== newY) {
      gsap.to(root, { "--y": newY, duration: 2.4, ease: E.inOut });
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

  const onPageHide = () => { clearInterval(pollInterval); gsap.killTweensOf("*"); };
  window.addEventListener("pagehide", onPageHide);
  return {
    destroy: () => {
      clearInterval(pollInterval);
      window.removeEventListener("pagehide", onPageHide);
      gsap.killTweensOf("*");
    },
  };
}
