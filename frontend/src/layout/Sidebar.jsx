import { NavLink, useNavigate } from "react-router-dom";

const NAV_ITEMS = [
  { to: "/", label: "Home", icon: "🏠", end: true },
  { to: "/login", label: "Login / Signup", icon: "👤" },
  { to: "/upload", label: "Upload", icon: "📄" },
  { to: "/quiz", label: "Quiz", icon: "❓" },
  { to: "/review", label: "Review", icon: "🔁" },
];

const DASHBOARD_ITEM = { to: "/dashboard", label: "Dashboard", icon: "📊" };

export default function Sidebar() {
  const navigate = useNavigate();
  const loggedIn = Boolean(localStorage.getItem("user_id"));

  function handleLogout() {
    localStorage.removeItem("user_id");
    navigate("/login");
  }

  return (
    <nav className="sidebar">
      <div className="sidebar-brand">MindPace</div>
      <ul className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.end}
              className={({ isActive }) => "sidebar-link" + (isActive ? " active" : "")}
            >
              <span className="sidebar-icon" aria-hidden="true">
                {item.icon}
              </span>
              <span className="sidebar-label">{item.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
      <ul className="sidebar-nav sidebar-nav-bottom">
        <li>
          <NavLink
            to={DASHBOARD_ITEM.to}
            className={({ isActive }) => "sidebar-link" + (isActive ? " active" : "")}
          >
            <span className="sidebar-icon" aria-hidden="true">
              {DASHBOARD_ITEM.icon}
            </span>
            <span className="sidebar-label">{DASHBOARD_ITEM.label}</span>
          </NavLink>
        </li>
      </ul>
      {loggedIn && (
        <button className="sidebar-logout" onClick={handleLogout}>
          Log out
        </button>
      )}
    </nav>
  );
}
