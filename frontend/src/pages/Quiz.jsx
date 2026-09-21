import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useStudy } from "../context/StudyContext";
import { createSession, listDocuments, getDocumentQuestions, generateFromDocument, createResponse, getNextStudyQuestion, endSession } from "../api";
import PlatformPage from "../components/PlatformPage";
import ConfidenceBar from "../components/ConfidenceBar";
import useActiveTime from "../study/useActiveTime";
import { newTimer, pauseTimer, SHORT_BREAK_MS } from "../study/timer";
import "./Study.css";

export default function StudyTime() {
  const { user } = useAuth();
  const { study, setStudy } = useStudy();
  const [params] = useSearchParams();
  const [documents, setDocuments] = useState(null);
  const [documentId, setDocumentId] = useState(params.get("document") || "");
  const [mode, setMode] = useState("question");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { timer, question, feedback } = study;
  const active = timer.phase === "focus" && timer.deadline !== null;
  const getElapsed = useActiveTime(`${user.user_id}-${study.sessionId}-${question?.question_id}`, active && !feedback && !study.revealed && !loading);
  const update = (patch) => setStudy((s) => ({ ...s, ...patch }));
  const answer = study.answer || "";
  const confidence = study.confidence ?? .5;

  useEffect(() => {
    let cancelled = false;
    listDocuments(user.user_id).then((docs) => {
      if (cancelled) return;
      setDocuments(docs);
      setDocumentId((current) => docs.some((d) => String(d.document_id) === current) ? current : String(docs.at(-1)?.document_id ?? ""));
    }).catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [user.user_id]);

  async function start(e) {
    e.preventDefault();
    if (loading || !documentId) return;
    setLoading(true);
    setError(null);
    try {
      let bank = await getDocumentQuestions(documentId);
      if (!bank.length) bank = (await generateFromDocument(documentId)).questions;
      if (!bank.length) throw new Error("No questions were created. Try another document.");
      const session = await createSession(user.user_id);
      const next = await getNextStudyQuestion(documentId, session.session_id, mode);
      update({ sessionId: session.session_id, documentId, mode, question: next.question,
        title: documents.find((d) => String(d.document_id) === documentId)?.filename,
        adaptation: next.adaptation, remaining: next.remaining, answered: 0, feedback: null,
        answer: "", confidence: .5, revealed: false, done: false,
        timer: { ...newTimer(), deadline: Date.now() + 25 * 60 * 1000 } });
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function submit(e, recalled) {
    e?.preventDefault();
    if (loading || feedback || !active || !question || (study.mode === "question" && !answer.trim())) return;
    const elapsed = study.mode === "flashcard" ? study.recallTime : getElapsed();
    setLoading(true);
    setError(null);
    try {
      const result = await createResponse({ sessionId: study.sessionId, questionId: question.question_id,
        answerText: study.mode === "question" ? answer : null, confidence,
        responseTimeMs: elapsed, responseMode: study.mode, recalled });
      update({ feedback: result, adaptation: result.adaptation, answered: study.answered + 1 });
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function next() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const result = await getNextStudyQuestion(study.documentId, study.sessionId, study.mode);
      if (!result.question) {
        await endSession(study.sessionId);
        update({ done: true, question: null, feedback: null, timer: pauseTimer(timer, Date.now()) });
      } else {
        update({ question: result.question, adaptation: result.adaptation, remaining: result.remaining,
          feedback: null, answer: "", confidence: .5, revealed: false });
      }
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function finish() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      await endSession(study.sessionId);
      update({ done: true, question: null, feedback: null, timer: pauseTimer(timer, Date.now()) });
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  function toggleTimer() {
    setStudy((s) => ({ ...s, timer: s.timer.deadline === null
      ? { ...s.timer, deadline: Date.now() + s.timer.remaining }
      : pauseTimer(s.timer, Date.now()) }));
  }

  const seconds = Math.ceil(timer.remaining / 1000);
  const timerText = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  return <PlatformPage title="Study time" eyebrow="One question at a time"
    description="Practice with questions or flashcards, with space to focus and take a break.">
    {error && <p role="alert">{error}</p>}
    {!study.sessionId ? <section>
      <h2>Choose your material</h2>
      <p>25 minutes of focus, then a 5-minute break. Every fourth focus block has a 15-minute break.</p>
      {documents === null ? <p role="status">Loading documents...</p> : !documents.length ?
        <p><Link to="/upload">Upload a document</Link> to begin.</p> :
        <form onSubmit={start}>
          <label htmlFor="study-document">Uploaded file</label>
          <select id="study-document" value={documentId} onChange={(e) => setDocumentId(e.target.value)} disabled={loading}>
            {documents.map((d) => <option key={d.document_id} value={d.document_id}>{d.filename}</option>)}
          </select>
          <label htmlFor="study-mode">Practice with</label>
          <select id="study-mode" value={mode} onChange={(e) => setMode(e.target.value)} disabled={loading}>
            <option value="question">Questions</option><option value="flashcard">Flashcards</option>
          </select>
          {mode === "flashcard" && <p>Think of your answer, rate confidence, then reveal and record whether you recalled it. Recall is self-reported.</p>}
          <button disabled={loading || !documentId}>{loading ? "Preparing questions..." : "Begin study time"}</button>
        </form>}
    </section> : study.done ? <section>
      <h2>Study session complete</h2>
      <p>{study.answered} {study.mode === "flashcard" ? "cards practiced" : "questions answered"}. Your responses have been saved.</p>
      <Link to="/dashboard">View learning analytics</Link>
      <button onClick={() => update({ sessionId: null, timer: newTimer(), done: false })}>Choose another session</button>
    </section> : <>
      <section className="study-timer" aria-label="Pomodoro timer">
        <div><h2>{timer.phase === "focus" ? "Focus time" : "Break time"}</h2>
          <span className="study-clock" role="timer" aria-label={`${timer.phase} time remaining ${timerText}`}>{timerText}</span>
          <p>{timer.rounds} focus blocks completed</p></div>
        <div className="study-actions">
          <button onClick={toggleTimer} disabled={loading}>{timer.deadline === null ? (timer.phase === "break" ? "Start break" : "Resume focus") : "Pause"}</button>
          <button className="platform-secondary" onClick={finish} disabled={loading}>End session</button>
        </div>
      </section>
      {timer.phase === "break" ? <section>
        <h2>A little time away</h2><p>Your question is saved. Start the break timer when you are ready. The next focus block starts only when you choose.</p>
        <Link to="/activities">Activities</Link>
      </section> : !active ? <section><h2>Study paused</h2><p>Resume when you are ready. Pauses and time in another browser tab are excluded from answer timing.</p></section> : question && <section className="study-question">
        <p>{study.title} · {study.mode === "flashcard" ? "Flashcard" : "Question"} · {study.remaining} remaining</p>
        <h2>{question.prompt_text}</h2>
        {feedback ? <div className="platform-feedback" role="status">
          <p>{study.mode === "flashcard" ? (feedback.is_correct ? "Recall recorded." : "Added for more practice.") : (feedback.is_correct ? "Correct." : "Keep practicing this one.")}</p>
          <p>Answer: {feedback.correct_answer}</p>
          <p>{feedback.adaptation?.reason}</p>
          {feedback.adaptation?.suggest_break && <div>
            <p>The last three attempts were misses. You can take a short break before continuing.</p>
            <button onClick={() => update({ timer: { ...timer, phase: "break", remaining: SHORT_BREAK_MS, deadline: null } })}>Take a break</button>
          </div>}
          <button onClick={next} disabled={loading}>{loading ? "Loading..." : "Continue"}</button>
        </div> : study.mode === "flashcard" ? <div>
          <p>Try to recall the answer before revealing it.</p>
          <ConfidenceBar value={confidence} onChange={(value) => update({ confidence: value })} disabled={study.revealed || loading} />
          {!study.revealed ? <button onClick={() => update({ revealed: true, recallTime: getElapsed() })}>Reveal answer</button> : <div>
            <p className="study-card-answer">{question.correct_answer}</p>
            <p>Did you recall it before revealing? This records your own assessment.</p>
            <button disabled={loading} onClick={() => submit(null, true)}>I recalled it</button>
            <button disabled={loading} onClick={() => submit(null, false)}>Practice again</button>
          </div>}
        </div> : <form onSubmit={submit}>
          {question.options?.length ? <fieldset disabled={loading}>
            <legend>Choose your answer</legend>
            {question.options.map((option) => <label key={option}><input type="radio" name="answer" value={option}
              checked={answer === option} onChange={(e) => update({ answer: e.target.value })} required />{option}</label>)}
          </fieldset> : <><label htmlFor="study-answer">Your answer</label><input id="study-answer" required value={answer} disabled={loading} onChange={(e) => update({ answer: e.target.value })} /></>}
          <ConfidenceBar value={confidence} onChange={(value) => update({ confidence: value })} disabled={loading} />
          <button disabled={loading || !answer.trim()}>{loading ? "Saving..." : "Check answer"}</button>
        </form>}
      </section>}
    </>}
  </PlatformPage>;
}
