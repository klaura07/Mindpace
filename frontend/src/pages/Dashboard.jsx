import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  computeCalibration,
  generateQuestions,
  getCalibration,
  getCalibrationTrend,
  getLearningState,
} from "../api";
import EmptyState from "../components/EmptyState";
import LevelRing from "../components/LevelRing";

export default function Dashboard() {
  const [userId, setUserId] = useState(null);
  const [calibration, setCalibration] = useState(null);
  const [calibrationError, setCalibrationError] = useState(null);
  const [calibrationTrend, setCalibrationTrend] = useState(null);
  const [topic, setTopic] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState(null);
  const [generatedCount, setGeneratedCount] = useState(null);
  const [learningState, setLearningState] = useState(null);
  const [learningStateError, setLearningStateError] = useState(null);
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

  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        setLearningState(await getLearningState(userId));
      } catch (err) {
        setLearningStateError(err.message);
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

  if (!userId) return null;

  // Light gamification: a "well-calibrated streak" (trailing trend points
  // with a small gap, most recent first) and an XP/level readout derived
  // from how many calibration checkpoints exist — both computed from data
  // already on the page, no new backend calls.
  let calibrationStreak = 0;
  if (calibrationTrend) {
    for (let i = calibrationTrend.length - 1; i >= 0; i--) {
      if (Math.abs(calibrationTrend[i].calibration_gap) < 0.15) calibrationStreak++;
      else break;
    }
  }
  const xp = (calibrationTrend?.length ?? 0) * 10;
  const level = Math.floor(xp / 30) + 1;

  return (
    <div className="fade-in">
      <h1>Dashboard</h1>
      <p>Logged in as user #{userId}</p>

      <section>
        <h2>Calibration</h2>
        {calibration && (
          <>
            <p>
              <strong className="glow-stat">{calibration.calibration_gap.toFixed(3)}</strong>
            </p>
            <p>Positive means overconfident, negative means underconfident.</p>
          </>
        )}
        {calibrationError && <p role="alert">{calibrationError}</p>}

        {calibrationTrend && calibrationTrend.length > 0 && (
          <>
            <div className="badge-row">
              {calibrationStreak > 1 && (
                <span className="badge badge-streak">
                  🔥 {calibrationStreak} well-calibrated in a row
                </span>
              )}
              <div className="level-badge">
                <LevelRing level={level} progress={(xp % 30) / 30} />
                <div className="level-text">
                  <strong>Level {level}</strong>
                  <span>{xp} XP</span>
                </div>
              </div>
            </div>
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

      <section>
        <h2>Learning State</h2>
        {learningState && learningState.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Topic</th>
                <th>Label</th>
                <th>Count</th>
              </tr>
            </thead>
            <tbody>
              {learningState.flatMap(({ topic: t, counts }) =>
                Object.entries(counts).map(([label, count]) => (
                  <tr key={`${t}-${label}`}>
                    <td>{t}</td>
                    <td>{label}</td>
                    <td>{count}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        ) : (
          <EmptyState
            title="Nothing to show yet"
            message="Complete a quiz first and your learning state will show up here."
          />
        )}
        {learningStateError && <p role="alert">{learningStateError}</p>}
      </section>
    </div>
  );
}
