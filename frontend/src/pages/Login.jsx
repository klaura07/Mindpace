import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { createUser, login } from "../api";
import { useAuth } from "../context/AuthContext";
import { LogoMark } from "../components/icons";
import "./Login.css";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [signup, setSignup] = useState(false);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading, acceptUser } = useAuth();
  const from = location.state?.from;
  const destination = ["/dashboard", "/upload", "/quiz", "/study-time", "/review", "/unwind", "/activities"].includes(from) ? from : "/dashboard";

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail) return;
    setError(null);
    if (signup && password !== confirmation) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      const authenticatedUser = await (signup ? createUser : login)(trimmedEmail, password);
      acceptUser(authenticatedUser);
      setPassword("");
      setConfirmation("");
      navigate(destination, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <main className="auth-page"><p role="status">Checking your session...</p></main>;
  if (user) return <Navigate to={destination} replace />;

  return (
    <main className="auth-page">
      <Link to="/" className="landing-logo auth-brand">
        <LogoMark className="landing-logo-icon" aria-hidden="true" />
        MindPace
      </Link>
      <section className="auth-card fade-in" aria-labelledby="auth-title">
        <header className="auth-heading">
          <h1 id="auth-title">{signup ? "Create an account" : "Welcome back"}</h1>
          <p>{signup ? "A little intention. A better way to learn." : "Pick up your learning at your own pace."}</p>
        </header>
        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              name="email"
              autoComplete="username"
              maxLength={254}
              disabled={submitting}
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="auth-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={signup ? "new-password" : "current-password"}
              minLength={signup ? 4 : 1}
              maxLength={signup ? 15 : 128}
              required
              disabled={submitting}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-describedby={signup ? "password-hint" : undefined}
            />
            {signup && <p id="password-hint" className="auth-hint">Use 4–15 characters.</p>}
          </div>
          {signup && <div className="auth-field">
            <label htmlFor="confirm-password">Confirm password</label>
            <input id="confirm-password" name="confirm-password" type="password"
              autoComplete="new-password" required minLength={4} maxLength={15} disabled={submitting}
              value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
          </div>}
          <button className="btn-solid auth-submit" type="submit" disabled={submitting}>
            {submitting ? "Please wait..." : signup ? "Create account" : "Log in"}
          </button>
        </form>
        <button className="auth-switch" type="button" disabled={submitting} onClick={() => {
          setSignup(!signup);
          setPassword("");
          setConfirmation("");
          setError(null);
        }}>{signup ? "Already have an account? Log in" : "New to MindPace? Sign up"}</button>
        {error && <p className="auth-error" role="alert">{error}</p>}
      </section>
    </main>
  );
}
