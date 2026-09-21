import { Link, Outlet } from "react-router-dom";
import { LogoMark } from "../components/icons";
import { useAuth } from "../context/AuthContext";

// The landing page uses its own navbar, with account links from shared auth state.
export default function LandingLayout() {
  const { user, loading } = useAuth();
  return (
    <div className="landing-shell">
      <header className="landing-nav">
        <Link to="/" className="landing-logo">
          <LogoMark className="landing-logo-icon" aria-hidden="true" />
          MindPace
        </Link>
        <nav className="landing-nav-links">
          <a href="#about">About</a>
          <a href="#features">Features</a>
          <a href="#reviews">Reviews</a>
        </nav>
        <div className="landing-nav-cta">
          {!loading && (user ? (
            <Link to="/dashboard" className="btn-solid">Dashboard</Link>
          ) : (
            <>
              <Link to="/login" className="btn-ghost">
                Log in
              </Link>
              <Link to="/login" className="btn-solid">
                Sign up
              </Link>
            </>
          ))}
        </div>
      </header>
      <main className="landing-content">
        <Outlet />
      </main>
    </div>
  );
}
