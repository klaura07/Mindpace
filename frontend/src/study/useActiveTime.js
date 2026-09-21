import { useEffect, useRef } from "react";
import { createActiveClock } from "./activeClock";

// Only foreground, unpaused answering time counts; feedback and network time do not.
export default function useActiveTime(key, enabled) {
  const clock = useRef(null);
  useEffect(() => {
    if (clock.current?.key !== key) {
      let elapsed = 0;
      try { elapsed = Number(sessionStorage.getItem(`mindpace-active-${key}`)) || 0; } catch { /* In-memory fallback. */ }
      clock.current = { key, ...createActiveClock(elapsed) };
    }
    const c = clock.current;
    function save() {
      try { sessionStorage.setItem(`mindpace-active-${key}`, String(c.read())); } catch { /* In-memory fallback. */ }
    }
    function update() {
      c.setRunning(enabled && document.visibilityState === "visible");
      save();
    }
    update();
    const interval = setInterval(save, 1000);
    document.addEventListener("visibilitychange", update);
    window.addEventListener("pagehide", save);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("pagehide", save);
      c.setRunning(false);
      save();
    };
  }, [key, enabled]);
  return () => clock.current?.read() ?? 0;
}
