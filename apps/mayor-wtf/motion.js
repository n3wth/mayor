// Mayor motion system — yellow + black, abstract, GSAP-driven.
//
// Layers (back to front):
//   1. Shape canvas — geometric primitives drift, scale, rotate
//   2. MAYOR letters — entrance, ambient idle, react to cursor
//   3. HUD heartbeat — pulses
//
// Motion philosophy:
//   - Eased, continuous, never snappy
//   - Cursor is gravity; shapes lean toward it, away from it, in waves
//   - On click anywhere: "shockwave" — shapes briefly scale + rotate
//   - On scroll: parallax-ish bias on shape layer

const reduceMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function initMotion(gsap) {
  if (!gsap || reduceMotion()) return { destroy: () => {} };

  const letters = Array.from(document.querySelectorAll(".mayor-wrap svg text.l"));
  const shapes = Array.from(document.querySelectorAll(".shape"));
  const stage = document.querySelector(".stage");
  const hb = document.querySelector(".hud .hb");

  // Normalize transform-box for SVG glyph rotations.
  letters.forEach((el) => {
    el.style.transformBox = "fill-box";
    el.style.transformOrigin = "center center";
  });
  shapes.forEach((el) => {
    el.style.transformBox = "fill-box";
    el.style.transformOrigin = "center center";
  });

  // ── ENTRANCE ────────────────────────────────────────────
  gsap.set(letters, { yPercent: 60, opacity: 0 });
  gsap.set(shapes, { scale: 0, opacity: 0 });
  gsap.set(".hud .label", { opacity: 0, y: 6 });

  const tl = gsap.timeline({ defaults: { ease: "expo.out" } });
  tl.to(shapes, {
    scale: 1, opacity: 1,
    duration: 1.2, stagger: { amount: 0.6, from: "random" },
  }, 0)
    .to(letters, {
      yPercent: 0, opacity: 1,
      duration: 1.1, stagger: 0.07, ease: "power3.out",
    }, 0.2)
    .to(".hud .label", {
      opacity: 0.7, y: 0,
      duration: 0.6, stagger: 0.08,
    }, 0.6);

  // ── AMBIENT: each letter has its own personality ───────
  const [M, A, Y, O, R] = letters;
  const idleStart = 1.4;

  gsap.to(M, { yPercent: 0.8, duration: 4.2, ease: "sine.inOut", yoyo: true, repeat: -1, delay: idleStart });
  gsap.to(A, { rotation: 1.2, duration: 3.4, ease: "sine.inOut", yoyo: true, repeat: -1, delay: idleStart + 0.3 });
  gsap.to(Y, { scaleY: 1.03, transformOrigin: "center bottom", duration: 2.8, ease: "sine.inOut", yoyo: true, repeat: -1, delay: idleStart + 0.6 });
  gsap.to(O, { rotation: -2, duration: 5.5, ease: "sine.inOut", yoyo: true, repeat: -1, delay: idleStart + 0.2 });
  gsap.to(R, { yPercent: -2, duration: 1.8, ease: "sine.inOut", yoyo: true, repeat: -1, delay: idleStart + 0.8 });

  // ── AMBIENT: shape drift ───────────────────────────────
  // Each shape gets unique slow oscillations. Combination of x, y, rotation, scale.
  shapes.forEach((shape, i) => {
    const dur = 6 + (i % 5) * 1.3;
    const xRange = 12 + (i % 4) * 6;
    const yRange = 10 + (i % 3) * 5;
    const rotRange = (i % 2 === 0 ? 1 : -1) * (8 + (i % 3) * 4);
    gsap.to(shape, {
      x: xRange, y: yRange, rotation: rotRange,
      duration: dur,
      ease: "sine.inOut",
      yoyo: true,
      repeat: -1,
      delay: idleStart + (i * 0.08),
    });
    // Independent scale shimmer
    gsap.to(shape, {
      scale: 1.15,
      duration: dur * 0.7,
      ease: "sine.inOut",
      yoyo: true,
      repeat: -1,
      delay: idleStart + 0.5 + (i * 0.05),
    });
  });

  // ── HEARTBEAT pulse ────────────────────────────────────
  if (hb) {
    gsap.to(hb, {
      scale: 1.6, opacity: 0.4,
      duration: 1.2,
      ease: "sine.inOut",
      yoyo: true,
      repeat: -1,
    });
  }

  // ── CURSOR INFLUENCE ──────────────────────────────────
  // Letters lean toward cursor; shapes parallax around it.
  const lettersRot = letters.map((el) => gsap.quickTo(el, "rotation", { duration: 0.7, ease: "power3.out" }));
  const lettersY = letters.map((el) => gsap.quickTo(el, "y", { duration: 0.7, ease: "power3.out" }));
  const shapesX = shapes.map((el) => gsap.quickTo(el, "x", { duration: 1.1, ease: "power3.out" }));
  const shapesY = shapes.map((el) => gsap.quickTo(el, "y", { duration: 1.1, ease: "power3.out" }));

  let pointerActive = false;
  const onPointerMove = (e) => {
    pointerActive = true;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const nx = (e.clientX / w - 0.5) * 2;  // -1..1
    const ny = (e.clientY / h - 0.5) * 2;

    // Letters: rotation tilts toward pointer x; subtle vertical offset toward pointer y
    letters.forEach((_, i) => {
      const lx = (i - (letters.length - 1) / 2) / ((letters.length - 1) / 2); // -1..1
      const tilt = (nx - lx) * 4; // closer letter tilts more toward cursor
      lettersRot[i](tilt);
      lettersY[i](ny * -3);
    });

    // Shapes: parallax — far ones move more, near ones less
    shapes.forEach((_, i) => {
      const depth = 0.3 + (i % 5) * 0.18;
      shapesX[i](nx * 30 * depth);
      shapesY[i](ny * 24 * depth);
    });
  };
  window.addEventListener("pointermove", onPointerMove);

  // ── CLICK SHOCKWAVE ────────────────────────────────────
  const onClick = (e) => {
    // Letters: brief squish + bounce
    gsap.to(letters, {
      keyframes: [
        { scale: 0.93, duration: 0.15, ease: "power2.out" },
        { scale: 1, duration: 0.7, ease: "elastic.out(1, 0.4)" },
      ],
      stagger: 0.04,
      overwrite: "auto",
    });
    // Shapes: explosive scale + rotation kick
    gsap.to(shapes, {
      keyframes: [
        { scale: 1.5, rotation: "+=20", duration: 0.25, ease: "power3.out" },
        { scale: 1, rotation: "+=0", duration: 1.4, ease: "elastic.out(1, 0.45)" },
      ],
      stagger: { amount: 0.4, from: "random" },
      overwrite: "auto",
    });
  };
  stage.addEventListener("click", onClick);

  // ── KEYBOARD: Space triggers shockwave too ────────────
  window.addEventListener("keydown", (e) => {
    if (e.key === " " || e.code === "Space") {
      e.preventDefault();
      onClick();
    }
  });

  // ── TAB-RETURN GREET ──────────────────────────────────
  let hiddenAt = 0;
  const onVisibility = () => {
    if (document.hidden) {
      hiddenAt = Date.now();
      return;
    }
    if (hiddenAt && Date.now() - hiddenAt > 400) {
      // Soft greet — letters lift, shapes ripple
      gsap.to(letters, {
        keyframes: [
          { yPercent: -3, duration: 0.6, ease: "power2.out" },
          { yPercent: 0, duration: 1.2, ease: "power2.inOut" },
        ],
        stagger: 0.06,
        overwrite: "auto",
      });
      gsap.to(shapes, {
        keyframes: [
          { scale: 1.18, duration: 0.5, ease: "power2.out" },
          { scale: 1, duration: 1.4, ease: "power2.inOut" },
        ],
        stagger: { amount: 0.5, from: "random" },
        overwrite: "auto",
      });
    }
    hiddenAt = 0;
  };
  document.addEventListener("visibilitychange", onVisibility);

  // ── BFCache cleanup ────────────────────────────────────
  const onPageHide = () => {
    tl.kill();
    gsap.killTweensOf("*");
  };
  window.addEventListener("pagehide", onPageHide);

  return {
    destroy: () => {
      window.removeEventListener("pointermove", onPointerMove);
      stage.removeEventListener("click", onClick);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      tl.kill();
      gsap.killTweensOf("*");
    },
  };
}
