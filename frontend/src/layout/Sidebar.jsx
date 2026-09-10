import { NavLink, useNavigate } from "react-router-dom";
import {
  DashboardIcon,
  HomeIcon,
  LoginIcon,
  QuizIcon,
  ReviewIcon,
  UnwindIcon,
  UploadIcon,
} from "../components/icons";

const NAV_ITEMS = [
  { to: "/", label: "Home", Icon: HomeIcon, end: true },
  { to: "/dashboard", label: "Dashboard", Icon: DashboardIcon },
  { to: "/upload", label: "Upload", Icon: UploadIcon },
  { to: "/quiz", label: "Quiz", Icon: QuizIcon },
  { to: "/review", label: "Review", Icon: ReviewIcon },
  { to: "/unwind", label: "Unwind", Icon: UnwindIcon },
  { to: "/login", label: "Login / Signup", Icon: LoginIcon },
];

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
              <item.Icon className="sidebar-nav-icon" aria-hidden="true" />
              <span className="sidebar-label">{item.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
      {loggedIn && (
        <button className="sidebar-logout" onClick={handleLogout}>
          Log out
        </button>
      )}
    </nav>
  );
}
