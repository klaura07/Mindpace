import { useEffect, useState } from "react";

const COLORS = ["var(--accent)", "var(--accent-deep)", "var(--accent-light)"];
let uid = 0;

// A small, cheap celebratory burst — a dozen CSS-animated particles, no
// canvas or physics, torn down after ~1s. Renders nothing when the
// viewer prefers reduced motion. `trigger` is any value that changes
// (e.g. an incrementing counter) each time a burst should fire.
export default function ConfettiBurst({ trigger }) {
  const [pieces, setPieces] = useState([]);

  useEffect(() => {
    if (!trigger) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const next = Array.from({ length: 12 }).map(() => ({
      id: uid++,
      left: Math.random() * 100,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      delay: Math.random() * 120,
      drift: (Math.random() - 0.5) * 70,
    }));
    setPieces(next);
    const timeout = setTimeout(() => setPieces([]), 1000);
    return () => clearTimeout(timeout);
  }, [trigger]);

  if (pieces.length === 0) return null;

  return (
    <span className="confetti-burst" aria-hidden="true">
      {pieces.map((p) => (
        <i
          key={p.id}
          style={{
            left: `${p.left}%`,
            backgroundColor: p.color,
            animationDelay: `${p.delay}ms`,
            "--drift": `${p.drift}px`,
          }}
        />
      ))}
    </span>
  );
}
