import { Link } from "react-router-dom";

const MODULES = [
  {
    to: "/login",
    icon: "👤",
    title: "Login / Signup",
    description: "Sign in with your email to start or resume your learning journey.",
  },
  {
    to: "/upload",
    icon: "📄",
    title: "Upload",
    description: "Upload a document to generate a revision guide and quiz questions from it.",
  },
  {
    to: "/quiz",
    icon: "❓",
    title: "Quiz",
    description: "Take a topic quiz, rate your confidence, and get instant feedback.",
  },
  {
    to: "/review",
    icon: "🔁",
    title: "Review",
    description: "Revisit the topics and answers you struggled with, grouped by topic.",
  },
  {
    to: "/dashboard",
    icon: "📊",
    title: "Dashboard",
    description: "Track your calibration score, trends, and overall learning state.",
  },
];

export default function Home() {
  return (
    <div className="fade-in">
      <h1>MindPace</h1>
      <p>
        MindPace helps you learn deliberately: upload material, quiz yourself, rate your own
        confidence, and see where your understanding is actually solid versus shaky.
      </p>

      <section>
        <h2>Get started</h2>
        <ul className="module-list">
          {MODULES.map((mod) => (
            <li key={mod.to}>
              <Link to={mod.to} className="module-card">
                <span className="sidebar-icon" aria-hidden="true">
                  {mod.icon}
                </span>
                <span>
                  <strong>{mod.title}</strong>
                  <p>{mod.description}</p>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
