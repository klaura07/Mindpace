import { createContext, useContext, useEffect, useState } from "react";

const RoomMotionContext = createContext(null);
const storageKey = "mindpace-room-still";
const readChoice = () => {
  try {
    const saved = localStorage.getItem(storageKey);
    return saved === null ? null : saved === "true";
  } catch { return null; }
};

export function RoomMotionProvider({ children }) {
  const [choice, setChoice] = useState(readChoice);
  const [reduced, setReduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const still = choice ?? reduced;
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncSystem = (event) => setReduced(event.matches);
    const syncStorage = (event) => { if (event.key === storageKey || event.key === null) setChoice(readChoice()); };
    query.addEventListener("change", syncSystem);
    window.addEventListener("storage", syncStorage);
    return () => {
      query.removeEventListener("change", syncSystem);
      window.removeEventListener("storage", syncStorage);
    };
  }, []);
  function toggleMotion() {
    const next = !still;
    setChoice(next);
    try { localStorage.setItem(storageKey, String(next)); } catch { /* In-memory preference. */ }
  }
  return <RoomMotionContext.Provider value={{ still, toggleMotion }}>{children}</RoomMotionContext.Provider>;
}

// oxlint-disable-next-line react/only-export-components
export function useRoomMotion() { return useContext(RoomMotionContext); }
