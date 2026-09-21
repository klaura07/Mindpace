import { NavLink, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  DashboardIcon,
  LogoMark,
  QuizIcon,
  ReviewIcon,
  UnwindIcon,
  UploadIcon,
} from "../components/icons";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", Icon: DashboardIcon },
  { to: "/upload", label: "Upload", Icon: UploadIcon },
  { to: "/study-time", label: "Study time", Icon: QuizIcon },
  { to: "/review", label: "Review", Icon: ReviewIcon },
  { to: "/activities", label: "Activities", Icon: UnwindIcon },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const loggedIn = Boolean(user);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState(null);

  async function handleLogout() {
    setLoggingOut(true);
    setLogoutError(null);
    try {
      await logout();
      navigate("/login", { replace: true });
    } catch (err) {
      setLogoutError(err.message);
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <nav className="sidebar">
      <div className="sidebar-brand">
        <LogoMark className="landing-logo-icon" aria-hidden="true" />
        MindPace
      </div>
      <ul className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.end}
              className={({ isActive }) => "sidebar-link" + (isActive ? " active" : "")}
            >
              <item.Icon className="sidebar-nav-icon" aria-hidden="true" />
              <span className="sidebar-label">{item.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
      {loggedIn && (
        <button className="sidebar-logout" disabled={loggingOut} onClick={handleLogout}>
          {loggingOut ? "Logging out..." : "Log out"}
        </button>
      )}
      {logoutError && <p role="alert">{logoutError}</p>}
    </nav>
  );
}
