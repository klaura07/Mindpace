import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import AssistantWidget from "../components/AssistantWidget";
import { AssistantSessionProvider, useAssistantSession } from "../context/AssistantSessionContext";

// Zen is only offered on the pages where it makes sense to interrupt with a
// study aside: taking a quiz, or reviewing progress on the dashboard.
const ASSISTANT_ROUTES = new Set(["/quiz", "/dashboard"]);

function LayoutAssistant() {
  const location = useLocation();
  const { sessionId } = useAssistantSession();
  if (!ASSISTANT_ROUTES.has(location.pathname)) return null;
  return <AssistantWidget sessionId={sessionId} />;
}

export default function AppLayout() {
  return (
    <AssistantSessionProvider>
      <div className="app-shell">
        <Sidebar />
        <main className="app-content">
          <Outlet />
        </main>
        <LayoutAssistant />
      </div>
    </AssistantSessionProvider>
  );
}
