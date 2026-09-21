import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { getCurrentUser, logout as endLogin } from "../api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const version = useRef(0);
  const authChannel = useRef(null);

  const acceptUser = useCallback((nextUser) => {
    version.current += 1;
    setUser(nextUser);
    setError(null);
    setLoading(false);
    // Notify other tabs to check their cookie with the server; never send credentials.
    authChannel.current?.postMessage("session-changed");
  }, []);

  const refresh = useCallback(async () => {
    const requestVersion = ++version.current;
    try {
      const current = await getCurrentUser();
      if (requestVersion === version.current) {
        setUser(current);
        setError(null);
      }
    } catch (err) {
      if (requestVersion === version.current) {
        setUser(null);
        setError(err.status === 401 ? null : err.message);
      }
    } finally {
      if (requestVersion === version.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Remove the old, untrusted login marker. The server cookie is authoritative.
    try { localStorage.removeItem("user_id"); } catch { /* Storage may be disabled. */ }
    // This effect synchronizes with the server session; updates follow the fetch.
    // oxlint-disable-next-line react/set-state-in-effect
    refresh();
    const expire = () => acceptUser(null);
    const onFocus = () => refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const onPageShow = (event) => {
      if (event.persisted) {
        setLoading(true);
        refresh();
      }
    };
    // Cookies are shared across tabs, while React state is not.
    const channel = typeof BroadcastChannel !== "undefined"
      ? new BroadcastChannel("mindpace-auth")
      : null;
    authChannel.current = channel;
    if (channel) {
      channel.onmessage = (event) => {
        if (event.data === "session-changed") {
          setLoading(true);
          refresh();
        }
      };
    }
    // Detect expiry even on screens that make no API requests, such as Unwind.
    const expiryCheck = window.setInterval(onVisible, 60_000);
    window.addEventListener("auth:expired", expire);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onFocus);
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      version.current += 1;
      authChannel.current = null;
      channel?.close();
      window.clearInterval(expiryCheck);
      window.removeEventListener("auth:expired", expire);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onFocus);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [acceptUser, refresh]);

  async function logout() {
    await endLogin();
    acceptUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, error, refresh, acceptUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// Context consumers share the same module, as with AssistantSessionContext.
// oxlint-disable-next-line react/only-export-components
export function useAuth() {
  return useContext(AuthContext);
}

export function RequireAuth() {
  const { user, loading, error, refresh } = useAuth();
  const location = useLocation();
  if (loading) return <p role="status">Checking your session...</p>;
  if (error) return <div role="alert"><p>{error}</p><button onClick={refresh}>Try again</button></div>;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return <Outlet key={user.user_id} />;
}
