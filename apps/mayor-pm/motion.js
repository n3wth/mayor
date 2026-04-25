// Mayor motion system — yellow + black, abstract but meaningful.
//
// Each shape is bound to a real signal pulled from /api/stats:
//   citizen      → big circles fade in/scale up as new citizens are added
//   citizen-slot → faint placeholder circles fill in as new slots become real
//   session-today → side rail length scales with sessions today
//   session-hour  → side rail length scales with sessions this hour
//   active       → top triangle rotates while sessions are in flight
//   pulse        → small dots breathe with recent_pulse (0..1)
//   last-email   → bottom square pulses brighter the more recent the last email
//   decor        → ambient drift only, no signal binding
//
// Motion philosophy:
//   - Every numeric transition is GSAP-eased. No hard cuts.
//   - Stats poll every 5s; UI animates over 1.5s with sine.inOut.
//   - Cursor influence layered on top of signal-driven baseline (additive via xPercent/y).
//   - Click anywhere = shockwave. Space too.
//   - Heartbeat dot pulses always, faster when active sessions > 0.
//   - Reduced-motion = static, all signal values still rendered as numbers.

const reduceMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const STATS_URL = "/api/stats";
const POLL_MS = 5000;

// Easing presets — share the curve language across the page.
const E = {
  in:    "power2.in",
  out:   "expo.out",
  inOut: "sine.inOut",
  bounce: "elastic.out(1, 0.45)",
  squish: "back.out(1.6)",
};

// ── tiny helpers ─────────────────────────────────────────
const fmtAge = (s) => {
  if (s == null) return "—";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};

// Eased numeric tween for HUD counters. No DOM thrash.
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
      const v = Math.round(proxy.v);
      el.textContent = String(v);
    },
    onComplete: () => {
      el.setAttribute("data-current", String(target));
    },
  });
}

export function initMotion(gsap) {
  if (!gsap) return { destroy: () => {} };

  const reduced = reduceMotion();
  const letters = Array.from(document.querySelectorAll(".mayor-wrap svg text.l"));
  const shapes = Array.from(document.querySelectorAll(".shape"));
  const stage = document.querySelector(".stage");
  const hb = document.querySelector("[data-hb]");
  const statusText = document.querySelector("[data-status]");

  // Pre-rendered: each shape gets a stable "rest scale" for signal-driven scaling.
  const shapeMeta = new Map(); // el -> {signal, idx, restScale, restOpacity}
  const bySignal = {}; // signal -> array of shape elements
  shapes.forEach((el, i) => {
    const signal = el.getAttribute("data-signal") || "decor";
    bySignal[signal] = bySignal[signal] || [];
    bySignal[signal].push(el);
    shapeMeta.set(el, {
      signal,
      idx: bySignal[signal].length - 1,
      restScale: 1,
      restOpacity: 1,
    });
    el.style.transformBox = "fill-box";
    el.style.transformOrigin = "center center";
  });
  letters.forEach((el) => {
    el.style.transformBox = "fill-box";
    el.style.transformOrigin = "center center";
  });

  // ── ENTRANCE ────────────────────────────────────────────
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

  // ── PER-LETTER PERSONALITY (idle ambient) ──────────────
  if (!reduced) {
    const [M, A, Y, O, R] = letters;
    const start = 1.4;
    gsap.to(M, { yPercent: 0.8, duration: 4.2, ease: E.inOut, yoyo: true, repeat: -1, delay: start });
    gsap.to(A, { rotation: 1.2, duration: 3.4, ease: E.inOut, yoyo: true, repeat: -1, delay: start + 0.3 });
    gsap.to(Y, { scaleY: 1.03, transformOrigin: "center bottom", duration: 2.8, ease: E.inOut, yoyo: true, repeat: -1, delay: start + 0.6 });
    gsap.to(O, { rotation: -2, duration: 5.5, ease: E.inOut, yoyo: true, repeat: -1, delay: start + 0.2 });
    gsap.to(R, { yPercent: -2, duration: 1.8, ease: E.inOut, yoyo: true, repeat: -1, delay: start + 0.8 });
  }

  // ── SHAPE AMBIENT DRIFT ─────────────────────────────────
  // Each shape has a slow x/y/rotation oscillation so the canvas always feels alive.
  // This stays separate from signal-driven reactions, layered via additive props.
  if (!reduced) {
    shapes.forEach((shape, i) => {
      const dur = 6 + (i % 5) * 1.3;
      const xRange = 8 + (i % 4) * 4;
      const yRange = 8 + (i % 3) * 4;
      const rotRange = (i % 2 === 0 ? 1 : -1) * (4 + (i % 3) * 3);
      gsap.to(shape, {
        x: xRange, y: yRange, rotation: rotRange,
        duration: dur,
        ease: E.inOut,
        yoyo: true,
        repeat: -1,
        delay: 1.5 + i * 0.07,
      });
    });
  }

  // ── HEARTBEAT ───────────────────────────────────────────
  let heartbeatTween = null;
  function setHeartbeat(activeCount) {
    if (heartbeatTween) heartbeatTween.kill();
    const speed = activeCount > 0 ? 0.6 : 1.2; // beat faster when busy
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

  // ── CURSOR INFLUENCE ───────────────────────────────────
  // Layered on top of signal scale via xPercent/yPercent (additive to absolute x/y).
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
        const depth = 0.3 + (i % 5) * 0.18;
        shapesX[i](nx * 60 * depth);
        shapesY[i](ny * 50 * depth);
      });
    }, { passive: true });
  }

  // ── CLICK SHOCKWAVE ────────────────────────────────────
  function shockwave() {
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
        { scale: "+=0.5", rotation: "+=20", duration: 0.25, ease: "power3.out" },
        { scale: "-=0.5", rotation: "+=0", duration: 1.4, ease: "elastic.out(1, 0.5)" },
      ],
      stagger: { amount: 0.4, from: "random" },
      overwrite: "auto",
    });
  }
  if (!reduced) {
    stage.addEventListener("click", (e) => {
      // Don't intercept clicks on links / CTAs
      if (e.target.closest("a, .cta")) return;
      shockwave();
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        shockwave();
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
        gsap.to(shapes, {
          keyframes: [
            { scale: "+=0.18", duration: 0.5, ease: "power2.out" },
            { scale: "-=0.18", duration: 1.4, ease: E.inOut },
          ],
          stagger: { amount: 0.5, from: "random" },
          overwrite: "auto",
        });
      }
      hiddenAt = 0;
    });
  }

  // ── SIGNAL ENGINE: poll /api/stats and animate shapes ──
  let lastStats = null;
  let lastPollOk = true;
  let activeTriangleTween = null;

  function applyStats(s) {
    // Update HUD counters with eased tweens
    easedCount(gsap, document.querySelector('[data-stat="citizens"]'), s.citizens || 0);
    easedCount(gsap, document.querySelector('[data-stat="sessions_today"]'), s.sessions_today || 0);
    const ageEl = document.querySelector('[data-stat="last_email_age"]');
    if (ageEl) ageEl.textContent = fmtAge(s.last_email_age_seconds);

    // Status indicator
    if (statusText) statusText.textContent = s.online === false ? "offline" : "online";
    if (hb) hb.classList.toggle("offline", s.online === false);

    // ── citizen circles ─────────────────────────────────
    // First N "citizen" shapes light up (scale 1, opacity 1).
    // Remaining are dimmed slots showing future capacity.
    const citizenShapes = bySignal["citizen"] || [];
    const slotShapes = bySignal["citizen-slot"] || [];
    const totalSlots = citizenShapes.length + slotShapes.length;
    const lit = Math.min(s.citizens || 0, citizenShapes.length);

    citizenShapes.forEach((el, i) => {
      const isLit = i < lit;
      gsap.to(el, {
        opacity: isLit ? 1 : 0.18,
        scale: isLit ? 1 : 0.6,
        duration: 1.4,
        ease: E.inOut,
        overwrite: "auto",
      });
    });
    // Slots fill in once all main citizen circles are lit
    slotShapes.forEach((el, i) => {
      const idx = citizenShapes.length + i;
      const isLit = idx < (s.citizens || 0);
      gsap.to(el, {
        opacity: isLit ? 0.9 : 0.18,
        scale: isLit ? 1 : 0.5,
        duration: 1.4,
        ease: E.inOut,
        overwrite: "auto",
      });
    });

    // ── session rails: scale length with counts ────────
    // sessions_today rail: maxes at 30
    const todayRail = (bySignal["session-today"] || [])[0];
    if (todayRail) {
      const norm = Math.min(1, (s.sessions_today || 0) / 30);
      gsap.to(todayRail, {
        scaleX: 0.25 + norm * 0.75,
        opacity: 0.45 + norm * 0.55,
        duration: 1.4,
        ease: E.inOut,
        overwrite: "auto",
      });
    }
    const hourRail = (bySignal["session-hour"] || [])[0];
    if (hourRail) {
      const norm = Math.min(1, (s.sessions_this_hour || 0) / 12);
      gsap.to(hourRail, {
        scaleX: 0.25 + norm * 0.75,
        opacity: 0.45 + norm * 0.55,
        duration: 1.4,
        ease: E.inOut,
        overwrite: "auto",
      });
    }

    // ── active triangle: rotates while sessions in-flight ─
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
        // Settle it back to a clean angle smoothly
        gsap.to(tri, { rotation: 0, opacity: 0.7, scale: 1, duration: 1.2, ease: E.inOut, overwrite: "auto" });
      }
    }

    // ── pulse dots: breathe at intensity = recent_pulse ──
    const pulseShapes = bySignal["pulse"] || [];
    const pulse = Number(s.recent_pulse || 0);
    pulseShapes.forEach((el, i) => {
      // Kill prior pulse tween for this shape
      gsap.killTweensOf(el, "scale,opacity");
      const baseScale = 1;
      const peakScale = 1 + pulse * 0.6;
      const opacity = 0.4 + pulse * 0.6;
      const speed = 1.0 + i * 0.25; // each at its own rhythm
      gsap.timeline({ overwrite: "auto" })
        .to(el, { opacity, duration: 0.6, ease: E.inOut })
        .to(el, {
          scale: peakScale,
          duration: speed,
          ease: E.inOut,
          yoyo: true,
          repeat: -1,
        }, 0);
    });

    // ── last-email square: flashes brighter the fresher the last email ──
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

    // ── EVENT DETECTION: new email since last poll ─────
    if (lastStats) {
      const newSession = (s.sessions_today || 0) > (lastStats.sessions_today || 0);
      const newCitizen = (s.citizens || 0) > (lastStats.citizens || 0);
      if (newSession) {
        // Letters do a small joyful hop
        gsap.to(letters, {
          keyframes: [
            { yPercent: -4, duration: 0.4, ease: "power2.out" },
            { yPercent: 0, duration: 1.0, ease: E.bounce },
          ],
          stagger: 0.05,
          overwrite: "auto",
        });
        // Pulse dots flare briefly
        (bySignal["pulse"] || []).forEach((el, i) => {
          gsap.fromTo(el,
            { scale: 1.6, opacity: 1 },
            { scale: 1, opacity: 0.6, duration: 1.6, ease: "elastic.out(1, 0.4)", delay: i * 0.05 }
          );
        });
      }
      if (newCitizen) {
        // The newly-promoted citizen circle entrance: scale up + 360° spin
        const idx = (s.citizens || 0) - 1;
        const newShape = citizenShapes[idx] || slotShapes[idx - citizenShapes.length];
        if (newShape) {
          gsap.fromTo(newShape,
            { scale: 0, rotation: -90, opacity: 0 },
            { scale: 1, rotation: 0, opacity: 1, duration: 1.6, ease: E.bounce, overwrite: "auto" }
          );
        }
      }
    }

    setHeartbeat(s.active_sessions || 0);
    lastStats = s;
  }

  async function pollStats() {
    try {
      const res = await fetch(STATS_URL, { cache: "no-cache" });
      if (!res.ok) throw new Error("stats");
      const data = await res.json();
      lastPollOk = true;
      applyStats(data);
    } catch {
      // Treat as offline degraded — animate the page into "I'm asleep" state
      lastPollOk = false;
      applyStats({ online: false, citizens: lastStats?.citizens || 0, sessions_today: 0, sessions_this_hour: 0, last_email_age_seconds: null, active_sessions: 0, recent_pulse: 0 });
    }
  }

  // First poll fast, then every POLL_MS
  pollStats();
  const pollInterval = setInterval(pollStats, POLL_MS);

  // ── BFCache cleanup ────────────────────────────────────
  const onPageHide = () => {
    clearInterval(pollInterval);
    gsap.killTweensOf("*");
  };
  window.addEventListener("pagehide", onPageHide);

  return {
    destroy: () => {
      clearInterval(pollInterval);
      window.removeEventListener("pagehide", onPageHide);
      gsap.killTweensOf("*");
    },
  };
}
