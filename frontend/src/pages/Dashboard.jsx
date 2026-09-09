import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { computeCalibration, getCalibration, getCalibrationTrend, generateQuestions } from "../api";
import AssistantWidget from "../components/AssistantWidget";

export default function Dashboard() {
  const [userId, setUserId] = useState(null);
  const [calibration, setCalibration] = useState(null);
  const [calibrationError, setCalibrationError] = useState(null);
  const [calibrationTrend, setCalibrationTrend] = useState(null);
  const [topic, setTopic] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState(null);
  const [generatedCount, setGeneratedCount] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const id = localStorage.getItem("user_id");
    if (!id) {
      navigate("/login");
      return;
    }
    setUserId(id);
  }, [navigate]);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        await computeCalibration(userId);
      } catch (err) {
        if (err.status !== 400) {
          setCalibrationError(err.message);
          return;
        }
        // No responses yet to compute from — fall through and try to show
        // whatever the most recent score is, if any.
      }
      try {
        const score = await getCalibration(userId);
        setCalibration(score);
      } catch (err) {
        setCalibrationError(
          err.status === 404 ? "No calibration data yet — complete a quiz first." : err.message
        );
      }
      try {
        const trend = await getCalibrationTrend(userId);
        setCalibrationTrend(trend);
      } catch {
        // Trend is a nice-to-have — the single-score display above already
        // reports any real error, so fail quietly here.
      }
    })();
  }, [userId]);

  async function handleGenerate(e) {
    e.preventDefault();
    if (!topic.trim()) return;
    setGenerating(true);
    setGenerateError(null);
    setGeneratedCount(null);
    try {
      const created = await generateQuestions(topic.trim());
      setGeneratedCount(created.length);
    } catch (err) {
      setGenerateError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem("user_id");
    navigate("/login");
  }

  if (!userId) return null;

  return (
    <div>
      <h1>Dashboard</h1>
      <p>Logged in as user #{userId}</p>

      <section>
        <h2>Calibration</h2>
        {calibration && (
          <>
            <p>
              <strong>{calibration.calibration_gap.toFixed(3)}</strong>
            </p>
            <p>Positive means overconfident, negative means underconfident.</p>
          </>
        )}
        {calibrationError && <p role="alert">{calibrationError}</p>}

        {calibrationTrend && calibrationTrend.length > 0 && (
          <>
            <h3>Trend</h3>
            <table>
              <thead>
                <tr>
                  <th>Computed at</th>
                  <th>Gap</th>
                </tr>
              </thead>
              <tbody>
                {calibrationTrend.map((point) => (
                  <tr key={point.score_id}>
                    <td>{point.computed_at}</td>
                    <td>{point.calibration_gap.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>

      <section>
        <h2>Generate Questions</h2>
        <form onSubmit={handleGenerate}>
          <label htmlFor="gen-topic">Topic</label>
          <input
            id="gen-topic"
            type="text"
            required
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />
          <button type="submit" disabled={generating}>
            {generating ? "Generating..." : "Generate questions"}
          </button>
        </form>
        {generatedCount !== null && <p>Generated {generatedCount} questions.</p>}
        {generateError && <p role="alert">{generateError}</p>}
      </section>

      <button onClick={() => navigate("/quiz")}>Start Quiz</button>
      <button onClick={handleLogout}>Log out</button>

      <AssistantWidget />
    </div>
  );
}
