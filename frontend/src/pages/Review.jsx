import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getLearningState } from "../api";

// Labels from classify_learning_state (backend) that indicate an incorrect
// response. There's no dedicated "review" system yet, so we reuse the
// existing learning-state breakdown and filter it down to the weak spots.
const WEAK_LABELS = new Set(["overconfident", "guessing", "struggling"]);

export default function Review() {
  const [userId, setUserId] = useState(null);
  const [learningState, setLearningState] = useState(null);
  const [error, setError] = useState(null);
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
        setLearningState(await getLearningState(userId));
      } catch (err) {
        setError(err.message);
      }
    })();
  }, [userId]);

  if (!userId) return null;

  const weakByTopic = (learningState ?? [])
    .map(({ topic, counts }) => ({
      topic,
      weakCounts: Object.entries(counts).filter(([label]) => WEAK_LABELS.has(label)),
    }))
    .filter(({ weakCounts }) => weakCounts.length > 0);

  return (
    <div className="fade-in">
      <h1>Review</h1>
      <p>Past mistakes and weak areas, grouped by topic.</p>

      {error && <p role="alert">{error}</p>}

      {learningState && weakByTopic.length === 0 && (
        <p>No weak areas found yet — complete a quiz first.</p>
      )}

      {weakByTopic.length > 0 && (
        <section>
          {weakByTopic.map(({ topic, weakCounts }) => (
            <div key={topic}>
              <h2>{topic}</h2>
              <table>
                <thead>
                  <tr>
                    <th>Label</th>
                    <th>Count</th>
                  </tr>
                </thead>
                <tbody>
                  {weakCounts.map(([label, count]) => (
                    <tr key={label}>
                      <td>{label}</td>
                      <td>{count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
