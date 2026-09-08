import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createSession, getQuestions, createResponse } from "../api";

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
  const navigate = useNavigate();

  useEffect(() => {
    const id = localStorage.getItem("user_id");
    if (!id) {
      navigate("/login");
      return;
    }
    setUserId(id);
  }, [navigate]);

  async function startQuiz(e) {
    e.preventDefault();
    if (!topic.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const fetched = await getQuestions(topic.trim());
      if (fetched.length === 0) {
        setError(`No questions found for topic "${topic}". Try generating some from the dashboard first.`);
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
      });
      setFeedback(response);
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

  if (!userId) return null;

  if (!questions) {
    return (
      <div>
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
      </div>
    );
  }

  if (index >= questions.length) {
    return (
      <div>
        <h1>Done!</h1>
        <p>
          You answered {questions.length} question{questions.length === 1 ? "" : "s"} on "{topic}".
        </p>
        <button onClick={() => navigate("/dashboard")}>Back to Dashboard</button>
      </div>
    );
  }

  const question = questions[index];

  return (
    <div>
      <h1>Quiz</h1>
      <p>
        Question {index + 1} of {questions.length}
      </p>
      <h2>{question.prompt_text}</h2>

      {feedback ? (
        <div>
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
    </div>
  );
}
