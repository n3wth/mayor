// Mayor motion system.
//
// Design intent:
// - One signature motion system. Eased, continuous, never snappy.
// - Entrance is a single gesture; idle is ambient; tab-return is a subtle greet.
// - Honors prefers-reduced-motion: if reduced, the DOM is already in its
//   final visible state and this module is a no-op.
// - Pauses idle loops when the tab is hidden (no wasted CPU) and resumes
//   from the same phase — nothing jumps.

const reduceMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Motion tokens. Change here, change everywhere.
const TOKEN = {
  entrance: { duration: 1.1, stagger: 0.07, ease: "power3.out", fromY: 30 },
  // Tab-return greet is deliberately small — a blink, not a wave.
  greet:    { lift: -2, up: 0.7, down: 1.4, stagger: 0.08 },
  idleTravelMax: 3, // max % travel for any idle motion
};

// Per-letter idle "character" — all sine-eased, continuous, out of phase.
// Numbers are intentional, not random. Each letter has a role.
const CHARACTERS = {
  M: { prop: "yPercent", to:  0.8, duration: 4.2, delayOffset: 0.0 },
  A: { prop: "rotation", to:  1.2, duration: 3.4, delayOffset: 0.3 },
  Y: { prop: "scaleY",   to:  1.03, duration: 2.8, delayOffset: 0.6, origin: "center bottom" },
  O: { prop: "rotation", to: -2.0, duration: 5.5, delayOffset: 0.2 },
  R: { prop: "yPercent", to: -2.0, duration: 1.8, delayOffset: 0.8 },
};

export function initMotion(gsap) {
  if (!gsap || reduceMotion()) return { destroy: () => {} };

  const letters = Array.from(
    document.querySelectorAll(".mayor-wrap svg text.l"),
  );
  if (letters.length === 0) return { destroy: () => {} };

  // Normalize transform origin so SVG rotations pivot on each glyph.
  letters.forEach((el) => {
    el.style.transformBox = "fill-box";
    el.style.transformOrigin = "center center";
  });

  // ── Entrance ────────────────────────────────────────────
  gsap.set(letters, { yPercent: TOKEN.entrance.fromY, opacity: 0 });
  const entrance = gsap.to(letters, {
    yPercent: 0,
    opacity: 1,
    duration: TOKEN.entrance.duration,
    stagger: TOKEN.entrance.stagger,
    ease: TOKEN.entrance.ease,
  });

  // ── Idle (starts after entrance completes) ──────────────
  // Stored so we can pause/resume on tab visibility.
  const idleTweens = [];
  entrance.eventCallback("onComplete", () => {
    letters.forEach((el) => {
      const char = CHARACTERS[el.textContent];
      if (!char) return;
      const vars = {
        [char.prop]: char.to,
        duration: char.duration,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
        delay: char.delayOffset,
      };
      if (char.origin) vars.transformOrigin = char.origin;
      idleTweens.push(gsap.to(el, vars));
    });
  });

  // ── Tab-return greet ─────────────────────────────────────
  let hiddenAt = 0;
  const onVisibility = () => {
    if (document.hidden) {
      hiddenAt = Date.now();
      idleTweens.forEach((t) => t.pause());
      return;
    }
    // Resume idle from current position (no snap).
    idleTweens.forEach((t) => t.resume());
    // Only greet if we were actually hidden, and only if gone > 400ms
    // (avoids firing on window blur/focus micro-events).
    if (hiddenAt && Date.now() - hiddenAt > 400) {
      gsap.to(letters, {
        keyframes: [
          { yPercent: TOKEN.greet.lift, duration: TOKEN.greet.up,   ease: "power2.out" },
          { yPercent: 0,                 duration: TOKEN.greet.down, ease: "power2.inOut" },
        ],
        stagger: TOKEN.greet.stagger,
        overwrite: "auto",
      });
    }
    hiddenAt = 0;
  };
  document.addEventListener("visibilitychange", onVisibility);

  // ── BFCache / pagehide cleanup (iOS Safari) ─────────────
  // Without this, animations can resume mid-tween when the page is
  // restored from BFCache, producing visible jumps.
  const onPageHide = () => {
    entrance.kill();
    idleTweens.forEach((t) => t.kill());
  };
  window.addEventListener("pagehide", onPageHide);

  return {
    destroy: () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      entrance.kill();
      idleTweens.forEach((t) => t.kill());
    },
  };
}
