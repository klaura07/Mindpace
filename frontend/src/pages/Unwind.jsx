import PlatformPage from "../components/PlatformPage";
import { Link } from "react-router-dom";

export default function Activities() {
  return <PlatformPage title="Activities" eyebrow="A quiet break"
    description="A separate space for low-stimulation games and activities.">
    <section><h2>Activities are being chosen</h2>
      <p>No games are available yet. For now, enjoy a quiet moment in your little corner.</p>
      <Link to="/study-time">Return to study time</Link>
    </section>
  </PlatformPage>;
}
