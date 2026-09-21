import { useAuth } from "../context/AuthContext";
import { useEffect, useState } from "react";
import {
  createResponse,
  createSession,
  getDueReviewItems,
  getLearningState,
  reframeQuestion,
  endSession,
} from "../api";
import EmptyState from "../components/EmptyState";
import PlatformPage from "../components/PlatformPage";
import ConfidenceBar from "../components/ConfidenceBar";
import useActiveTime from "../study/useActiveTime";
import "./Study.css";

// Shared adaptive signals include uncertain correct answers as review candidates.
const WEAK_LABELS = new Set(["Check this concept", "Take another look", "Build the foundation", "Build confidence"]);

export default function Review() {
  const { user } = useAuth();
  const userId = user.user_id;
  const [learningState, setLearningState] = useState(null);
  const [error, setError] = useState(null);

  const [dueItems, setDueItems] = useState(null);
  const [dueError, setDueError] = useState(null);
  const [sessionId, setSessionId] = useState(null);

  // The due item currently being reviewed, and the fresh Gemini-generated
  // variant of it the user actually answers — "review now" never shows
  // the original question verbatim.
  const [activeItemId, setActiveItemId] = useState(null);
  const [variant, setVariant] = useState(null);
  const [variantLoading, setVariantLoading] = useState(false);
  const [variantError, setVariantError] = useState(null);

  const [selectedAnswer, setSelectedAnswer] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [confidence, setConfidence] = useState(.5);
  const getElapsed = useActiveTime(`${userId}-${sessionId}-${variant?.question_id}`, Boolean(variant) && !feedback && !submitting);


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

  async function startReview(item) {
    if (variantLoading || submitting || activeItemId !== null) return;
    setActiveItemId(item.question_id);
    setSelectedAnswer("");
    setConfidence(.5);
    setFeedback(null);
    setSubmitError(null);
    setVariant(null);
    setVariantError(null);
    setVariantLoading(true);

    try {
      const fresh = await reframeQuestion(item.question_id);
      const session = await createSession(Number(userId));
      setSessionId(session.session_id);
      setVariant(fresh);
    } catch (err) {
      setVariantError(err.message);
    } finally {
      setVariantLoading(false);
    }
  }

  async function submitReview(e) {
    e.preventDefault();
    if (!sessionId || !variant || submitting || feedback || !selectedAnswer.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const response = await createResponse({
        sessionId,
        questionId: variant.question_id,
        answerText: selectedAnswer,
        confidence,
        responseTimeMs: getElapsed(),
      });
      setFeedback(response);
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function finishReview(questionId) {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await endSession(sessionId);
    } catch (err) {
      setSubmitError(err.message);
      setSubmitting(false);
      return;
    }
    setDueItems((prev) => (prev ?? []).filter((item) => item.question_id !== questionId));
    setSessionId(null);
    setActiveItemId(null);
    setVariant(null);
    setFeedback(null);
    setSubmitting(false);
    getLearningState(userId).then(setLearningState).catch((err) => setError(err.message));
  }

  if (!userId) return null;

  const weakByTopic = (learningState ?? [])
    .map(({ topic, counts }) => ({
      topic,
      weakCounts: Object.entries(counts).filter(([label]) => WEAK_LABELS.has(label)),
    }))
    .filter(({ weakCounts }) => weakCounts.length > 0);

  return (
    <PlatformPage title="Review" eyebrow="Build on what you know"
      description="Past mistakes and weak areas, grouped by topic.">

      <section>
        <h2>Due for review</h2>
        {dueError && <p role="alert">{dueError}</p>}
        {dueItems && dueItems.length === 0 && (
          <EmptyState
            title="All caught up"
            message="Nothing due for review right now — check back after your next study session."
          />
        )}
        {dueItems && dueItems.length > 0 && (
          <ul className="platform-list">
            {dueItems.map((item) => (
              <li key={item.question_id}>
                <p>
                  <strong>{item.topic}</strong> — {item.prompt_text}
                </p>
                {activeItemId === null && (
                  <button onClick={() => startReview(item)}>Review now</button>
                )}

                {activeItemId === item.question_id && (
                  <div className="fade-in">
                    {variantLoading && <p>Generating a fresh variant of this question...</p>}
                    {variantError && <><p role="alert">{variantError}</p><button onClick={() => { setActiveItemId(null); setVariantError(null); }}>Back to due items</button></>}

                    {variant && !feedback && (
                      <>
                        <h3>{variant.prompt_text}</h3>
                        <form onSubmit={submitReview}>
                          {variant.options && variant.options.length > 0 ? (
                            <fieldset>
                              {variant.options.map((option) => (
                                <label key={option}>
                                  <input
                                    type="radio"
                                    name={`answer-${variant.question_id}`}
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
                              <label htmlFor={`answer-${variant.question_id}`}>Your answer</label>
                              <input
                                id={`answer-${variant.question_id}`}
                                type="text"
                                required
                                value={selectedAnswer}
                                onChange={(e) => setSelectedAnswer(e.target.value)}
                              />
                            </div>
                          )}
                          <ConfidenceBar value={confidence} onChange={setConfidence} disabled={submitting} id={`confidence-${variant.question_id}`} />
                          <button type="submit" disabled={submitting || !selectedAnswer}>
                            {submitting ? "Submitting..." : "Submit"}
                          </button>
                        </form>
                      </>
                    )}

                    {feedback && (
                      <div className="platform-feedback">
                        <p>{feedback.is_correct ? "Correct!" : "Incorrect."}</p>
                        <p>Your answer: {feedback.answer_text}</p>
                        <p>Answer: {feedback.correct_answer}</p>
                        <p>{feedback.adaptation?.reason}</p>
                        <button disabled={submitting} onClick={() => finishReview(item.question_id)}>Done</button>
                      </div>
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
        <EmptyState
          title="No weak spots found"
          message="Complete a study session first and any topics you struggle with will show up here."
        />
      )}

      {weakByTopic.length > 0 && (
        <section>
          {weakByTopic.map(({ topic, weakCounts }) => (
            <div className="platform-topic" key={topic}>
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
    </PlatformPage>
  );
}
