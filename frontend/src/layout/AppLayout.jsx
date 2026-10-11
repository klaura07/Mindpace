import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import AssistantWidget from "../components/AssistantWidget";
import { StudyProvider, useStudy } from "../context/StudyContext";
import { AssistantSessionProvider } from "../context/AssistantSessionContext";
import { useAuth } from "../context/AuthContext";
import "./PlatformTheme.css";
import "./DoodleTheme.css";

// Keep the assistant off the active study screen to avoid interruptions.
const ASSISTANT_ROUTES = new Set(["/dashboard"]);

function LayoutAssistant() {
  const location = useLocation();
  const { practices } = useStudy();
  const { user } = useAuth();
  if (!user) return null;
  if (!ASSISTANT_ROUTES.has(location.pathname)) return null;
  const recentSession = Math.max(0, ...Object.values(practices).map(item => item.sessionId || 0));
  return <AssistantWidget sessionId={recentSession || null} />;
}

function AppFrame() {
  return <div className="app-shell doodle-app motion-enabled">
        <Sidebar />
        <main className="app-content">
          <Outlet />
        </main>
        <LayoutAssistant />
      </div>;
}

export default function AppLayout() {
  const { user } = useAuth();
  return (
    <AssistantSessionProvider key={user?.user_id ?? "anonymous"}>
      <StudyProvider>
        <AppFrame />
      </StudyProvider>
    </AssistantSessionProvider>
  );
}
