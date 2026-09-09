import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createSession, getQuestions, createResponse, createJournalEntry } from "../api";
import AssistantWidget from "../components/AssistantWidget";

const QUESTIONS_PER_QUIZ = 5;

export default function Quiz() {
  const [userId, setUserId] = useState(null);
  const [topic, setTopic] = useState("");
  const [sessionId, setSessionId] = useState(null);
  const [questions, setQuestions] = useState(null);
  const [index, setIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState("");
  const [confidence, setConfidence] = useState(0.5);
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [reflectionText, setReflectionText] = useState("");
  const [reflectionDone, setReflectionDone] = useState(false);
  const [reflectionLoading, setReflectionLoading] = useState(false);
  const [questionStartedAt, setQuestionStartedAt] = useState(null);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
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
    if (questions && index < questions.length) {
      setQuestionStartedAt(Date.now());
    }
  }, [questions, index]);

  async function startQuiz(e) {
    e.preventDefault();
    const trimmedTopic = topic.trim();
    if (!trimmedTopic) return;
    setLoading(true);
    setError(null);
    try {
      const fetched = await getQuestions(trimmedTopic);
      if (fetched.length === 0) {
        setError(
          `No questions found for topic "${trimmedTopic}". Try generating some from the dashboard first.`
        );
        return;
      }
      const session = await createSession(Number(userId));
      setSessionId(session.session_id);
      setQuestions(fetched.slice(0, QUESTIONS_PER_QUIZ));
      setIndex(0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function submitAnswer(e) {
    e.preventDefault();
    const question = questions[index];
    setLoading(true);
    setError(null);
    try {
      const response = await createResponse({
        sessionId,
        questionId: question.question_id,
        answerText: selectedAnswer,
        confidence: Number(confidence),
        responseTimeMs: questionStartedAt ? Date.now() - questionStartedAt : null,
      });
      setFeedback(response);
      setStreak((s) => {
        const next = response.is_correct ? s + 1 : 0;
        setBestStreak((best) => Math.max(best, next));
        return next;
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function nextQuestion() {
    setFeedback(null);
    setSelectedAnswer("");
    setConfidence(0.5);
    setIndex((i) => i + 1);
  }

  async function submitReflection(e) {
    e.preventDefault();
    if (!reflectionText.trim()) {
      setReflectionDone(true);
      return;
    }
    setReflectionLoading(true);
    setError(null);
    try {
      await createJournalEntry(sessionId, reflectionText.trim());
      setReflectionDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setReflectionLoading(false);
    }
  }

  function skipReflection() {
    setReflectionText("");
    setReflectionDone(true);
  }

  if (!userId) return null;

  if (!questions) {
    return (
      <div className="fade-in">
        <h1>Quiz</h1>
        <form onSubmit={startQuiz}>
          <label htmlFor="topic">Topic</label>
          <input
            id="topic"
            type="text"
            required
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />
          <button type="submit" disabled={loading}>
            {loading ? "Starting..." : "Start Quiz"}
          </button>
        </form>
        {error && <p role="alert">{error}</p>}
        <AssistantWidget />
      </div>
    );
  }

  if (index >= questions.length) {
    return (
      <div className="fade-in">
        <h1>Done!</h1>
        <p>
          You answered {questions.length} question{questions.length === 1 ? "" : "s"} on "{topic}".
        </p>
        {bestStreak > 1 && (
          <div className="badge-row">
            <span className="badge badge-streak">🔥 Best streak: {bestStreak}</span>
          </div>
        )}

        {!reflectionDone && (
          <form onSubmit={submitReflection}>
            <label htmlFor="reflection">What tripped you up, in one line?</label>
            <input
              id="reflection"
              type="text"
              value={reflectionText}
              onChange={(e) => setReflectionText(e.target.value)}
              placeholder="Optional"
            />
            <button type="submit" disabled={reflectionLoading}>
              {reflectionLoading ? "Saving..." : "Submit"}
            </button>
            <button type="button" onClick={skipReflection} disabled={reflectionLoading}>
              Skip
            </button>
          </form>
        )}

        {error && <p role="alert">{error}</p>}
        <button onClick={() => navigate("/dashboard")}>Back to Dashboard</button>
        <AssistantWidget sessionId={sessionId} />
      </div>
    );
  }

  const question = questions[index];

  return (
    <div className="fade-in">
      <h1>Quiz</h1>
      <p>
        Question {index + 1} of {questions.length}
      </p>
      {streak > 1 && (
        <div className="badge-row">
          <span className="badge badge-streak">🔥 Streak: {streak}</span>
        </div>
      )}
      <h2>{question.prompt_text}</h2>

      {feedback ? (
        <div className="fade-in" key={index}>
          <p>{feedback.is_correct ? "Correct!" : "Incorrect."}</p>
          <p>Your answer: {feedback.answer_text}</p>
          <button onClick={nextQuestion}>Next</button>
        </div>
      ) : (
        <form onSubmit={submitAnswer}>
          {question.options && question.options.length > 0 ? (
            <fieldset>
              {question.options.map((option) => (
                <label key={option}>
                  <input
                    type="radio"
                    name="answer"
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
              <label htmlFor="free-answer">Your answer</label>
              <input
                id="free-answer"
                type="text"
                required
                value={selectedAnswer}
                onChange={(e) => setSelectedAnswer(e.target.value)}
              />
            </div>
          )}

          <label htmlFor="confidence">Confidence: {confidence}</label>
          <input
            id="confidence"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={confidence}
            onChange={(e) => setConfidence(e.target.value)}
          />

          <button type="submit" disabled={loading || !selectedAnswer}>
            {loading ? "Submitting..." : "Submit"}
          </button>
        </form>
      )}

      {error && <p role="alert">{error}</p>}
      <AssistantWidget sessionId={sessionId} />
    </div>
  );
}
