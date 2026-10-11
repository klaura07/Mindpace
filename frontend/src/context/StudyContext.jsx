import { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import { newTimer, tickTimer } from "../study/timer";

const StudyContext = createContext(null);
function read(key, fallback) {
  try { return JSON.parse(sessionStorage.getItem(key)) || fallback; } catch { return fallback; }
}
function save(key, value) {
  try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* In-memory fallback. */ }
}

export function StudyProvider({ children }) {
  const { user } = useAuth();
  const practiceKey = `mindpace-questions-${user.user_id}`;
  const focusKey = `mindpace-focus-${user.user_id}`;
  const [practices, setPractices] = useState(() => read(practiceKey, {}));
  const [focus, setFocus] = useState(() => {
    const saved = read(focusKey, { timer: newTimer(), source: "", title: "Your own study" });
    return { ...saved, timer: tickTimer(saved.timer, Date.now()) };
  });
  useEffect(() => save(practiceKey, practices), [practiceKey, practices]);
  useEffect(() => save(focusKey, focus), [focusKey, focus]);
  useEffect(() => {
    const id = setInterval(() => setFocus(state => {
      const timer = tickTimer(state.timer, Date.now());
      return timer === state.timer ? state : { ...state, timer };
    }), 500);
    return () => clearInterval(id);
  }, []);
  return <StudyContext.Provider value={{ practices, setPractices, focus, setFocus }}>{children}</StudyContext.Provider>;
}

// oxlint-disable-next-line react/only-export-components
export function useStudy() { return useContext(StudyContext); }
