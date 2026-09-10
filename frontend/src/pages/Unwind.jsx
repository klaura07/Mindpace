import { useEffect, useRef } from "react";

// Internal simulation resolution — small on purpose. The canvas element is
// this many pixels, then scaled up via CSS with pixelated rendering, so the
// falling-sand grid itself stays cheap (tens of thousands of cells, not
// millions) no matter how large the page displays it.
const COLS = 220;
const ROWS = 140;

// An original palette for this page, drawn from the app's sage-green
// direction: three green depths plus a pale moss highlight and a rare warm
// clay fleck, so settled piles read as color, not a flat wash of one green.
const PALETTE = [
  [95, 127, 73], // laurel — deep olive-sage
  [135, 169, 107], // sage — the app's core accent
  [166, 196, 138], // fern — lighter mid tone
  [201, 219, 176], // moss — pale highlight
  [193, 141, 82], // clay — warm fleck, drawn rarely
];
const CLAY_INDEX = PALETTE.length - 1;
const CLAY_CHANCE = 0.07;

function pickColorIndex() {
  if (Math.random() < CLAY_CHANCE) return CLAY_INDEX;
  return Math.floor(Math.random() * (PALETTE.length - 1));
}

export default function Unwind() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d", { alpha: false });
    ctx.imageSmoothingEnabled = false;

    const emptyColor = getComputedStyle(document.documentElement)
      .getPropertyValue("--bg-elevated")
      .trim() || "#faf6ea";
    const emptyRgb = hexToRgb(emptyColor);

    // 0 = empty; otherwise (palette index + 1).
    const grid = new Uint8Array(COLS * ROWS);
    const imageData = ctx.createImageData(COLS, ROWS);

    let pointerDown = false;
    let rafId;

    function idx(x, y) {
      return y * COLS + x;
    }

    function toGridCoords(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      const gx = Math.floor(((clientX - rect.left) / rect.width) * COLS);
      const gy = Math.floor(((clientY - rect.top) / rect.height) * ROWS);
      return [gx, gy];
    }

    function spawnAt(gx, gy) {
      const radius = 2;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (Math.random() < 0.5) continue;
          const x = gx + dx;
          const y = gy + dy;
          if (x < 0 || x >= COLS || y < 0 || y >= ROWS) continue;
          if (dx * dx + dy * dy > radius * radius) continue;
          const cell = idx(x, y);
          if (grid[cell] === 0) grid[cell] = pickColorIndex() + 1;
        }
      }
    }

    function step() {
      const leftToRight = Math.random() < 0.5;
      for (let y = ROWS - 2; y >= 0; y--) {
        for (let i = 0; i < COLS; i++) {
          const x = leftToRight ? i : COLS - 1 - i;
          const cur = idx(x, y);
          const value = grid[cur];
          if (value === 0) continue;

          const below = idx(x, y + 1);
          if (grid[below] === 0) {
            grid[below] = value;
            grid[cur] = 0;
            continue;
          }

          const dir = Math.random() < 0.5 ? -1 : 1;
          const x1 = x + dir;
          const x2 = x - dir;
          if (x1 >= 0 && x1 < COLS && grid[idx(x1, y + 1)] === 0) {
            grid[idx(x1, y + 1)] = value;
            grid[cur] = 0;
          } else if (x2 >= 0 && x2 < COLS && grid[idx(x2, y + 1)] === 0) {
            grid[idx(x2, y + 1)] = value;
            grid[cur] = 0;
          }
        }
      }
    }

    function draw() {
      const data = imageData.data;
      for (let cell = 0; cell < grid.length; cell++) {
        const value = grid[cell];
        const rgb = value === 0 ? emptyRgb : PALETTE[value - 1];
        const offset = cell * 4;
        data[offset] = rgb[0];
        data[offset + 1] = rgb[1];
        data[offset + 2] = rgb[2];
        data[offset + 3] = 255;
      }
      ctx.putImageData(imageData, 0, 0);
    }

    function loop() {
      step();
      draw();
      rafId = requestAnimationFrame(loop);
    }

    function handlePointerDown(e) {
      pointerDown = true;
      const [gx, gy] = toGridCoords(e.clientX, e.clientY);
      spawnAt(gx, gy);
    }

    function handlePointerMove(e) {
      if (!pointerDown) return;
      const [gx, gy] = toGridCoords(e.clientX, e.clientY);
      spawnAt(gx, gy);
    }

    function handlePointerUp() {
      pointerDown = false;
    }

    function handleClearEvent() {
      grid.fill(0);
    }

    canvas.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("unwind:clear", handleClearEvent);
    rafId = requestAnimationFrame(loop);

    return () => {
      canvas.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("unwind:clear", handleClearEvent);
      cancelAnimationFrame(rafId);
    };
  }, []);

  function handleClear() {
    canvasRef.current?.dispatchEvent(new CustomEvent("unwind:clear"));
  }

  return (
    <div className="fade-in">
      <h1>Unwind</h1>
      <p>A quiet corner. Click or drag on the sand below and let the color settle.</p>

      <section style={{ maxWidth: 880 }}>
        <div className="unwind-canvas-wrap">
          <canvas ref={canvasRef} width={COLS} height={ROWS} className="unwind-canvas" />
        </div>
        <button type="button" onClick={handleClear} style={{ marginTop: 12 }}>
          Clear
        </button>
      </section>
    </div>
  );
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const num = parseInt(full, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}
