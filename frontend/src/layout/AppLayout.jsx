import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import AssistantWidget from "../components/AssistantWidget";
import { StudyProvider, useStudy } from "../context/StudyContext";
import { AssistantSessionProvider } from "../context/AssistantSessionContext";
import { useAuth } from "../context/AuthContext";
import "./PlatformTheme.css";

// Keep the assistant off the active study screen to avoid interruptions.
const ASSISTANT_ROUTES = new Set(["/dashboard"]);

function LayoutAssistant() {
  const location = useLocation();
  const { study } = useStudy();
  const { user } = useAuth();
  if (!user) return null;
  if (!ASSISTANT_ROUTES.has(location.pathname)) return null;
  return <AssistantWidget sessionId={study.sessionId} />;
}

export default function AppLayout() {
  const { user } = useAuth();
  return (
    <AssistantSessionProvider key={user?.user_id ?? "anonymous"}>
      <StudyProvider>
      <div className="app-shell">
        <Sidebar />
        <main className="app-content">
          <Outlet />
        </main>
        <LayoutAssistant />
      </div>
      </StudyProvider>
    </AssistantSessionProvider>
  );
}
