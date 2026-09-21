import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  DashboardIcon,
  QuizIcon,
  ReviewIcon,
  UnwindIcon,
  UploadIcon,
  LogoMark,
} from "../components/icons";

const FEATURES = [
  {
    Icon: UploadIcon,
    title: "Upload",
    description: "Turn your documents into practice questions and flashcards.",
  },
  {
    Icon: QuizIcon,
    title: "Study time",
    description: "Answer questions and rate how confident you feel before you see the result.",
  },
  {
    Icon: ReviewIcon,
    title: "Review",
    description: "Revisit the topics you got wrong, or were overconfident about, grouped together.",
  },
  {
    Icon: DashboardIcon,
    title: "Dashboard",
    description: "Watch your calibration score and learning trends develop over time.",
  },
  {
    Icon: UnwindIcon,
    title: "Activities",
    description: "A separate space for quiet breaks. Activities are being chosen.",
  },
];

const TESTIMONIALS = [
  {
    quote:
      "I stopped re-reading the same notes forever. MindPace showed me exactly which topics I only thought I understood.",
    name: "Amara",
    role: "Computer Science student",
  },
  {
    quote:
      "Rating my own confidence before every answer changed how I study. I catch overconfidence early now, not on exam day.",
    name: "Devon",
    role: "Medical student",
  },
  {
    quote:
      "The review sessions are grouped by topic, so I'm never guessing what to revise next. It just tells me.",
    name: "Priya",
    role: "Self-taught developer",
  },
];

function WaveDivider({ top, bottom }) {
  return (
    <svg
      className="landing-wave"
      viewBox="0 0 1440 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <rect width="1440" height="100" fill={top} />
      <path
        fill={bottom}
        d="M0,40 C240,90 480,10 720,34 C960,58 1200,96 1440,42 L1440,100 L0,100 Z"
      />
    </svg>
  );
}

export default function Home() {
  const { user } = useAuth();
  return (
    <div className="landing fade-in">
      <section className="hero">
        <div className="hero-copy">
          <h1>Learn with intention.</h1>
          <p>
            MindPace turns your notes into questions and flashcards, tracks what you actually know, and helps you
            focus your revision where it matters most.
          </p>
          <Link to={user ? "/dashboard" : "/login"} className="btn-solid btn-lg">
            {user ? "Go to dashboard" : "Get started free"}
          </Link>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="hero-art-blob" />
          <ul className="hero-art-steps">
            <li>
              <span className="hero-art-icon">
                <UploadIcon />
              </span>
              <span>Upload notes</span>
            </li>
            <li>
              <span className="hero-art-icon">
                <QuizIcon />
              </span>
              <span>Study time</span>
            </li>
            <li>
              <span className="hero-art-icon">
                <DashboardIcon />
              </span>
              <span>Track mastery</span>
            </li>
          </ul>
        </div>
      </section>

      <section className="about" id="about">
        <h2>About MindPace</h2>
        <p>
          MindPace helps you practice with questions and flashcards. Upload your material, test
          yourself on it, and rate your own confidence as you go. We compare what you believe you
          know against what you actually get right, so you always know where to focus next.
        </p>
        <a href="#features" className="btn-ghost">
          See how it works
        </a>
      </section>

      <section className="features" id="features">
        <h2>What you can do</h2>
        <ul className="feature-grid">
          {FEATURES.map(({ Icon, title, description }) => (
            <li key={title} className="feature-card">
              <span className="feature-icon">
                <Icon />
              </span>
              <strong>{title}</strong>
              <p>{description}</p>
            </li>
          ))}
        </ul>
      </section>

      <WaveDivider top="var(--bg)" bottom="var(--accent-deep)" />

      <section className="reviews" id="reviews">
        <h2>What learners say</h2>
        <ul className="testimonial-grid">
          {TESTIMONIALS.map(({ quote, name, role }) => (
            <li key={name} className="testimonial-card">
              <p>&ldquo;{quote}&rdquo;</p>
              <div className="testimonial-person">
                <span className="testimonial-avatar">{name[0]}</span>
                <span>
                  <strong>{name}</strong>
                  <span className="testimonial-role">{role}</span>
                </span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <WaveDivider top="var(--accent-deep)" bottom="var(--bg-elevated)" />

      <footer className="landing-footer">
        <div className="landing-footer-brand">
          <span className="landing-logo">
            <LogoMark className="landing-logo-icon" aria-hidden="true" />
            MindPace
          </span>
          <p>Learn deliberately.</p>
        </div>
        <div className="landing-footer-col">
          <strong>Product</strong>
          <Link to="/upload">Upload</Link>
          <Link to="/study-time">Study time</Link>
          <Link to="/review">Review</Link>
          <Link to="/dashboard">Dashboard</Link>
          <Link to="/activities">Activities</Link>
        </div>
        <div className="landing-footer-col">
          <strong>Company</strong>
          <a href="#about">About</a>
          <a href="#features">Features</a>
          <a href="#reviews">Reviews</a>
        </div>
        <div className="landing-footer-bottom">© 2026 MindPace</div>
      </footer>
    </div>
  );
}
