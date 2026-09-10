import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createResponse, createSession, getDueReviewItems, getLearningState } from "../api";

// Labels from classify_learning_state (backend) that indicate an incorrect
// response. There's no dedicated "review" system yet, so we reuse the
// existing learning-state breakdown and filter it down to the weak spots.
const WEAK_LABELS = new Set(["overconfident", "guessing", "struggling"]);

export default function Review() {
  const [userId, setUserId] = useState(null);
  const [learningState, setLearningState] = useState(null);
  const [error, setError] = useState(null);

  const [dueItems, setDueItems] = useState(null);
  const [dueError, setDueError] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [activeQuestionId, setActiveQuestionId] = useState(null);
  const [selectedAnswer, setSelectedAnswer] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

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
      try {
        setDueItems(await getDueReviewItems(userId));
      } catch (err) {
        setDueError(err.message);
      }
    })();
  }, [userId]);

  async function startReview(questionId) {
    setActiveQuestionId(questionId);
    setSelectedAnswer("");
    setFeedback(null);
    setSubmitError(null);
    if (sessionId) return;
    try {
      const session = await createSession(Number(userId));
      setSessionId(session.session_id);
    } catch (err) {
      setSubmitError(err.message);
    }
  }

  async function submitReview(e, question) {
    e.preventDefault();
    if (!sessionId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const response = await createResponse({
        sessionId,
        questionId: question.question_id,
        answerText: selectedAnswer,
        confidence: 0.5,
        responseTimeMs: null,
      });
      setFeedback(response);
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function finishReview(questionId) {
    setDueItems((prev) => (prev ?? []).filter((item) => item.question_id !== questionId));
    setActiveQuestionId(null);
    setFeedback(null);
  }

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

      <section>
        <h2>Due for review</h2>
        {dueError && <p role="alert">{dueError}</p>}
        {dueItems && dueItems.length === 0 && (
          <p>Nothing due for review right now — check back after your next quiz.</p>
        )}
        {dueItems && dueItems.length > 0 && (
          <ul>
            {dueItems.map((item) => (
              <li key={item.question_id}>
                <p>
                  <strong>{item.topic}</strong> — {item.prompt_text}
                </p>
                {activeQuestionId !== item.question_id && (
                  <button onClick={() => startReview(item.question_id)}>Review now</button>
                )}

                {activeQuestionId === item.question_id && (
                  <div className="fade-in">
                    {feedback ? (
                      <>
                        <p>{feedback.is_correct ? "Correct!" : "Incorrect."}</p>
                        <p>Your answer: {feedback.answer_text}</p>
                        <button onClick={() => finishReview(item.question_id)}>Done</button>
                      </>
                    ) : (
                      <form onSubmit={(e) => submitReview(e, item)}>
                        {item.options && item.options.length > 0 ? (
                          <fieldset>
                            {item.options.map((option) => (
                              <label key={option}>
                                <input
                                  type="radio"
                                  name={`answer-${item.question_id}`}
                                  value={option}
                                  checked={selectedAnswer === option}
                                  onChange={(e) => setSelectedAnswer(e.target.value)}
                                  required
                                />
                                {option}
                              </label>
                            ))}
                          </fieldset>
                        ) : (
                          <div>
                            <label htmlFor={`answer-${item.question_id}`}>Your answer</label>
                            <input
                              id={`answer-${item.question_id}`}
                              type="text"
                              required
                              value={selectedAnswer}
                              onChange={(e) => setSelectedAnswer(e.target.value)}
                            />
                          </div>
                        )}
                        <button type="submit" disabled={submitting || !selectedAnswer || !sessionId}>
                          {submitting ? "Submitting..." : "Submit"}
                        </button>
                      </form>
                    )}
                    {submitError && <p role="alert">{submitError}</p>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

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
