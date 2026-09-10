import { useEffect, useRef } from "react";

// Anything the glow should visibly react to by brightening/growing.
const INTERACTIVE_SELECTOR =
  "a, button, input, label, .module-card, .sidebar-link, .review-row, [role='button']";

// A soft, trailing radial glow that follows the cursor — lerped toward the
// pointer position via requestAnimationFrame (one transform write per frame,
// no React re-renders) so it stays fluid without costing layout or paint.
// Disabled outright for reduced-motion and coarse/touch pointers.
export default function CursorGlow() {
  const glowRef = useRef(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;

    const el = glowRef.current;
    if (!el) return;

    let targetX = window.innerWidth / 2;
    let targetY = window.innerHeight / 2;
    let x = targetX;
    let y = targetY;
    let hovering = false;
    let revealed = false;
    let rafId;

    function reveal() {
      if (revealed) return;
      revealed = true;
      el.style.opacity = hovering ? "0.6" : "0.32";
    }

    function onMove(e) {
      targetX = e.clientX;
      targetY = e.clientY;
      reveal();
    }

    function onOver(e) {
      if (!e.target.closest?.(INTERACTIVE_SELECTOR)) return;
      hovering = true;
      el.style.opacity = "0.6";
      el.style.width = "260px";
      el.style.height = "260px";
      el.style.margin = "-130px 0 0 -130px";
    }

    function onOut(e) {
      if (!e.target.closest?.(INTERACTIVE_SELECTOR)) return;
      hovering = false;
      el.style.opacity = "0.32";
      el.style.width = "200px";
      el.style.height = "200px";
      el.style.margin = "-100px 0 0 -100px";
    }

    function tick() {
      x += (targetX - x) * 0.15;
      y += (targetY - y) * 0.15;
      el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      rafId = requestAnimationFrame(tick);
    }

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerover", onOver, { passive: true });
    document.addEventListener("pointerout", onOut, { passive: true });
    rafId = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointerout", onOut);
      cancelAnimationFrame(rafId);
    };
  }, []);

  return <div ref={glowRef} className="cursor-glow" aria-hidden="true" />;
}
