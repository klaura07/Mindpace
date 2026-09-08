import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createUser, getUserByEmail } from "../api";

export default function Login() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      let user;
      try {
        user = await createUser(email);
      } catch (err) {
        if (err.status === 409) {
          user = await getUserByEmail(email);
        } else {
          throw err;
        }
      }
      localStorage.setItem("user_id", String(user.user_id));
      navigate("/dashboard");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h1>MindPace</h1>
      <form onSubmit={handleSubmit}>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button type="submit" disabled={submitting}>
          {submitting ? "Logging in..." : "Continue"}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
