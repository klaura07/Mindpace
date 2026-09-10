import { createContext, useContext, useState } from "react";

// Lets a page (currently just Quiz) tell the layout-level Zen widget which
// session it's in, so replies can be grounded in that session's behavioral
// signals. Pages with no active session (e.g. Dashboard) simply never call
// the setter, and Zen falls back to no session context.
const AssistantSessionContext = createContext(null);

export function AssistantSessionProvider({ children }) {
  const [sessionId, setSessionId] = useState(null);
  return (
    <AssistantSessionContext.Provider value={{ sessionId, setSessionId }}>
      {children}
    </AssistantSessionContext.Provider>
  );
}

export function useAssistantSession() {
  return useContext(AssistantSessionContext);
}
