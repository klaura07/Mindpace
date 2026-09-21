import { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import { newTimer, tickTimer } from "../study/timer";

const StudyContext = createContext(null);

export function StudyProvider({ children }) {
  const { user } = useAuth();
  const key = `mindpace-study-${user.user_id}`;
  const [study, setStudy] = useState(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(key));
      if (saved?.version === 1 && saved.timer) return { ...saved, timer: tickTimer(saved.timer, Date.now()) };
    } catch { /* Storage may be unavailable. The session still works in memory. */ }
    return { version: 1, sessionId: null, timer: newTimer(), question: null, mode: "question", answered: 0 };
  });
  useEffect(() => {
    try { sessionStorage.setItem(key, JSON.stringify(study)); } catch { /* In-memory fallback. */ }
  }, [key, study]);
  useEffect(() => {
    const id = setInterval(() => setStudy((s) => {
      const timer = tickTimer(s.timer, Date.now());
      return timer === s.timer ? s : { ...s, timer };
    }), 500);
    return () => clearInterval(id);
  }, []);
  return <StudyContext.Provider value={{ study, setStudy }}>{children}</StudyContext.Provider>;
}

// Context consumers share the module, as with AuthContext.
// oxlint-disable-next-line react/only-export-components
export function useStudy() { return useContext(StudyContext); }
