import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useStudy } from "../context/StudyContext";
import { useRoomMotion } from "../context/RoomMotionContext";
import MotionButton from "../components/MotionButton";
import { createSession, listDocuments, getDocumentQuestions, generateFromDocument, createResponse, getNextStudyQuestion, endSession } from "../api";
import StudyRoomScene from "../study/StudyRoomScene";
import useRainAudio from "../study/useRainAudio";
import ConfidenceBar from "../components/ConfidenceBar";
import useActiveTime from "../study/useActiveTime";
import { FOCUS_MS, newTimer, pauseTimer, SHORT_BREAK_MS } from "../study/timer";
import "./Study.css";
import "./StudyRoom.css";

function RoomIcon({ name }) {
  const paths = {
    rain: <><path d="M6 13a4 4 0 0 1 0-8 6 6 0 0 1 11-1 4.5 4.5 0 0 1 1 9" /><path d="m7 16-1 3m7-3-1 3m7-3-1 3" /></>,
    expand: <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" />,
    book: <path d="M3 4q5-2 9 1 4-3 9-1v15q-5-2-9 1-4-3-9-1ZM12 5v15" />,
    leaf: <path d="M19 3Q3 3 4 14q1 8 8 5 8-4 7-16ZM3 22 15 9" />,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export default function StudyTime() {
  const { user } = useAuth();
  const { study, setStudy } = useStudy();
  const [params] = useSearchParams();
  const [documents, setDocuments] = useState(null);
  const [documentId, setDocumentId] = useState(params.get("document") || "");
  const [mode, setMode] = useState("question");
  const [loading, setLoading] = useState(false);
  const requestBusy = useRef(false);
  const [error, setError] = useState(null);
  const [documentError, setDocumentError] = useState(null);
  const [documentAttempt, setDocumentAttempt] = useState(0);
  const room = useRef(null);
  const { still } = useRoomMotion();
  const [fullScreen, setFullScreen] = useState(false);
  const [viewError, setViewError] = useState("");
  const rain = useRainAudio();
  const { timer, question, feedback } = study;
  const active = timer.phase === "focus" && timer.deadline !== null;
  const getElapsed = useActiveTime(`${user.user_id}-${study.sessionId}-${question?.question_id}`, active && !feedback && !study.revealed && !loading);
  const update = (patch) => setStudy((s) => ({ ...s, ...patch }));
  const answer = study.answer || "";
  const confidence = study.confidence ?? .5;

  useEffect(() => {
    const sync = () => setFullScreen(document.fullscreenElement === room.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  async function toggleFullScreen() {
    setViewError("");
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await room.current.requestFullscreen();
    } catch { setViewError("Full screen is unavailable in this browser. You can keep studying here."); }
  }

  useEffect(() => {
    let cancelled = false;
    listDocuments(user.user_id).then((docs) => {
      if (cancelled) return;
      setDocuments(docs);
      setDocumentId((current) => docs.some((d) => String(d.document_id) === current) ? current : String(docs.at(-1)?.document_id ?? ""));
    }).catch((err) => { if (!cancelled) setDocumentError(err.message); });
    return () => { cancelled = true; };
  }, [user.user_id, documentAttempt]);

  function retryDocuments() {
    setDocumentError(null);
    setDocumentAttempt((attempt) => attempt + 1);
  }

  function freshStart() {
    setError(null);
    update({ sessionId: null, timer: newTimer(), done: false, pendingStart: false,
      question: null, feedback: null, answer: "", confidence: .5, revealed: false, answered: 0 });
  }

  async function start(e) {
    e.preventDefault();
    if (requestBusy.current || !documentId || study.sessionId) return;
    requestBusy.current = true;
    setLoading(true);
    setError(null);
    try {
      let bank = await getDocumentQuestions(documentId);
      if (!bank.length) bank = (await generateFromDocument(documentId)).questions;
      if (!bank.length) throw new Error("No questions were created. Try another document.");
      const session = await createSession(user.user_id);
      // Keep the created session so a failed first-question request can be retried.
      update({ sessionId: session.session_id, documentId, mode, question: null,
        title: documents.find((d) => String(d.document_id) === documentId)?.filename,
        remaining: 0, answered: 0, feedback: null, answer: "", confidence: .5,
        revealed: false, done: false, pendingStart: true, timer: newTimer() });
      const next = await getNextStudyQuestion(documentId, session.session_id, mode);
      if (!next.question) {
        await endSession(session.session_id);
        update({ done: true, pendingStart: false });
      } else update({ question: next.question, pendingStart: false,
        adaptation: next.adaptation, remaining: next.remaining,
        timer: { ...newTimer(), deadline: Date.now() + FOCUS_MS } });
    } catch (err) { setError(err.message); }
    finally { requestBusy.current = false; setLoading(false); }
  }

  async function submit(e, recalled) {
    e?.preventDefault();
    if (requestBusy.current || feedback || !active || !question || (study.mode === "question" && !answer.trim())) return;
    requestBusy.current = true;
    const elapsed = study.mode === "flashcard" ? study.recallTime : getElapsed();
    setLoading(true);
    setError(null);
    try {
      const result = await createResponse({ sessionId: study.sessionId, questionId: question.question_id,
        answerText: study.mode === "question" ? answer : null, confidence,
        responseTimeMs: elapsed, responseMode: study.mode, recalled });
      setStudy((s) => ({ ...s, feedback: result, adaptation: result.adaptation, answered: s.answered + 1 }));
    } catch (err) { setError(err.message); }
    finally { requestBusy.current = false; setLoading(false); }
  }

  async function next() {
    if (requestBusy.current) return;
    requestBusy.current = true;
    setLoading(true);
    setError(null);
    try {
      const result = await getNextStudyQuestion(study.documentId, study.sessionId, study.mode);
      if (!result.question) {
        await endSession(study.sessionId);
        setStudy((s) => ({ ...s, done: true, pendingStart: false, question: null, feedback: null, timer: pauseTimer(s.timer, Date.now()) }));
      } else {
        setStudy((s) => ({ ...s, question: result.question, adaptation: result.adaptation, remaining: result.remaining,
          feedback: null, answer: "", confidence: .5, revealed: false, pendingStart: false,
          timer: s.pendingStart ? { ...newTimer(), deadline: Date.now() + FOCUS_MS } : s.timer }));
      }
    } catch (err) { setError(err.message); }
    finally { requestBusy.current = false; setLoading(false); }
  }

  async function finish() {
    if (requestBusy.current) return;
    requestBusy.current = true;
    setLoading(true);
    setError(null);
    try {
      await endSession(study.sessionId);
      setStudy((s) => ({ ...s, done: true, pendingStart: false, question: null, feedback: null, timer: pauseTimer(s.timer, Date.now()) }));
    } catch (err) { setError(err.message); }
    finally { requestBusy.current = false; setLoading(false); }
  }

  function toggleTimer() {
    if (requestBusy.current || study.pendingStart) return;
    setStudy((s) => ({ ...s, timer: s.timer.deadline === null
      ? { ...s.timer, deadline: Date.now() + s.timer.remaining }
      : pauseTimer(s.timer, Date.now()) }));
  }

  const seconds = Math.ceil(timer.remaining / 1000);
  const timerText = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  const inSession = Boolean(study.sessionId && !study.done);
  return <div ref={room} className={`study-room ${still ? "room-still" : "room-motion-on"}${inSession ? " room-in-session" : ""}`}>
    <header className="room-header">
      <div><p className="room-eyebrow">A SPACE TO SLOW DOWN</p><h1>Study time<span className="room-title-star" aria-hidden="true">✳</span></h1></div>
      <div className="room-tools" aria-label="Room controls">
        <button className="room-tool" onClick={rain.toggle} disabled={rain.busy} aria-pressed={rain.playing} aria-label={rain.playing ? "Turn rain sound off" : "Turn rain sound on"}><RoomIcon name="rain" /><span>Rain {rain.playing ? "on" : "off"}</span></button>
        <MotionButton className="room-tool" />
        {document.fullscreenEnabled && <button className="room-tool room-expand" onClick={toggleFullScreen} aria-label={fullScreen ? "Exit full screen" : "Enter full screen"}><RoomIcon name="expand" /></button>}
      </div>
    </header>
    {rain.playing && <div className="room-volume"><label htmlFor="rain-volume">Rain volume</label><input id="rain-volume" type="range" min="0" max="1" step=".05" value={rain.volume} onChange={(e) => rain.changeVolume(Number(e.target.value))} /></div>}
    {(error || documentError || rain.error || viewError) && <p className="room-error" role="alert">{error || documentError || rain.error || viewError}</p>}
    <div className="room-scene" aria-label="Your illustrated study room">
      <StudyRoomScene />
      <div className="room-wall-timer">
        <p className="room-handwritten">{study.done ? "A little progress is still progress." : timer.phase === "break" && inSession ? "Rest a little. You've earned it." : "I'll keep you company. Let's study."}</p>
        <div className="room-phase"><span className={active && inSession ? "room-live-dot" : ""} />{study.done ? "SESSION COMPLETE" : !inSession ? "MAKE A LITTLE TIME FOR YOU" : timer.phase === "break" ? "A MOMENT TO REST" : active ? "ONE THING AT A TIME" : "TAKE YOUR TIME"}</div>
        <span className="room-clock" role="timer" aria-label={`${timer.phase} time remaining ${study.done ? "25:00" : timerText}`}>{study.done ? "25:00" : timerText}</span>
        <div className="room-rounds" aria-label={`${timer.rounds} focus blocks completed`}>
          {[0, 1, 2, 3].map((i) => <span key={i} className={i < (timer.rounds % 4 || (timer.rounds > 0 ? 4 : 0)) ? "completed" : ""} />)}
          <small>{timer.rounds ? `${timer.rounds} focus ${timer.rounds === 1 ? "block" : "blocks"} complete` : "one small step at a time"}</small>
        </div>
        <div className="room-timer-actions">
          {!study.sessionId ? documentError ? <button key="retry-documents" type="button" className="room-primary" onClick={retryDocuments}>Retry loading materials</button>
            : documents?.length === 0 ? <Link className="room-primary room-start-link" to="/upload">Upload to begin <span aria-hidden="true">↗</span></Link>
            : <button key="begin" className="room-primary" type="submit" form="study-setup" disabled={loading || !documentId || !documents?.length}>{loading ? "Preparing questions..." : documents === null ? "Loading materials..." : "Begin study time"}<span aria-hidden="true">↗</span></button>
            : inSession ? <><button type="button" className="room-primary" onClick={toggleTimer} disabled={loading || study.pendingStart}>{study.pendingStart ? "Preparing question..." : timer.deadline === null ? (timer.phase === "break" ? "Start break" : "Resume focus") : "Pause"}</button><button type="button" className="room-end" onClick={finish} disabled={loading}>End session</button></>
            : <button key="fresh" type="button" className="room-primary" onClick={freshStart}>A fresh start<span aria-hidden="true">↗</span></button>}
        </div>
      </div>
      <span className="room-window-note">a rainy day, a quieter mind</span>
    </div>
    <div className="room-workspace">
    {!study.sessionId ? <section className="room-paper room-setup">
      <div className="room-paper-title"><RoomIcon name="book" /><div><p className="room-eyebrow">ON YOUR DESK</p><h2>What are we learning today?</h2></div><span className="room-paper-number" aria-hidden="true">01</span></div>
      {documents === null ? <p role="status">{documentError ? "Your study material could not be loaded. Use Retry loading materials to try again." : "Loading your study material..."}</p> : !documents.length ?
        <div className="room-empty"><p>Your desk is ready. Bring a little something to learn.</p><Link to="/upload" className="room-link">Upload a document <span aria-hidden="true">↗</span></Link></div> :
        <form id="study-setup" onSubmit={start}>
          <div className="room-setup-fields"><div><label htmlFor="study-document">Your study material</label>
          <select id="study-document" value={documentId} onChange={(e) => setDocumentId(e.target.value)} disabled={loading}>
            {documents.map((d) => <option key={d.document_id} value={d.document_id}>{d.filename}</option>)}
          </select></div>
          <fieldset className="room-mode"><legend>Practice with</legend><div>
            <label><input type="radio" name="practice-mode" value="question" checked={mode === "question"} onChange={() => setMode("question")} disabled={loading} />Questions</label>
            <label><input type="radio" name="practice-mode" value="flashcard" checked={mode === "flashcard"} onChange={() => setMode("flashcard")} disabled={loading} />Flashcards</label>
          </div></fieldset></div>
          <p className="room-setup-hint">{mode === "flashcard" ? "Think, rate your confidence, then reveal. Flashcard recall is self-reported." : "Answer at your own pace. Your confidence helps shape what comes next."}</p>
        </form>}
      <div className="room-rhythm"><RoomIcon name="leaf" /><span><b>25 min</b> focus <i /> <b>5 min</b> rest <i /> a longer break every 4 rounds</span></div>
    </section> : study.done ? <section className="room-paper room-finished">
      <p className="room-eyebrow">YOU SHOWED UP. THAT COUNTS.</p>
      <h2>Study session complete</h2>
      <p>{study.answered} {study.mode === "flashcard" ? "cards practiced" : "questions answered"}. Your responses have been saved.</p>
      <Link className="room-link" to="/dashboard">View learning analytics <span aria-hidden="true">↗</span></Link>
    </section> : <>
      {!question ? <section className="room-paper room-pause">
        <h2>{loading ? "Getting your next question..." : "Let's get your question ready"}</h2>
        <p>{loading ? "Your study timer will wait for your question." : "Your session is saved. Retry to pick up where you left off."}</p>
        {!loading && <button type="button" className="room-primary" onClick={next}>Retry question</button>}
      </section> : timer.phase === "break" ? <section className="room-paper room-pause">
        <p className="room-eyebrow">A LITTLE SPACE TO BREATHE</p><h2>A little time away</h2><p>Your question is saved. Start the break timer when you are ready. The next focus block starts only when you choose.</p>
        <Link className="room-link" to="/activities">Visit Activities <span aria-hidden="true">↗</span></Link>
      </section> : !active ? <section className="room-paper room-pause"><p className="room-eyebrow">NO NEED TO RUSH</p><h2>Study paused</h2><p>Resume when you are ready. Pauses and time in another browser tab are excluded from answer timing.</p></section> : question && <section className="room-paper study-question">
        <div className="room-question-meta"><p>{study.title}</p><span>{study.mode === "flashcard" ? "Flashcard" : "Question"} · {study.remaining} remaining</span></div>
        <h2>{question.prompt_text}</h2>
        {feedback ? <div className="room-feedback" role="status">
          <p>{study.mode === "flashcard" ? (feedback.is_correct ? "Recall recorded." : "Added for more practice.") : (feedback.is_correct ? "Correct." : "Keep practicing this one.")}</p>
          <p>Answer: {feedback.correct_answer}</p>
          <p>{feedback.adaptation?.reason}</p>
          {feedback.adaptation?.suggest_break && <div>
            <p>The last three attempts were misses. You can take a short break before continuing.</p>
            <button type="button" disabled={loading} onClick={() => setStudy((s) => ({ ...s, timer: { ...s.timer, phase: "break", remaining: SHORT_BREAK_MS, deadline: Date.now() + SHORT_BREAK_MS } }))}>Take a break</button>
          </div>}
          <button className="room-primary" onClick={next} disabled={loading}>{loading ? "Loading..." : "Continue"}<span aria-hidden="true">↗</span></button>
        </div> : study.mode === "flashcard" ? <div>
          <p>Try to recall the answer before revealing it.</p>
          <ConfidenceBar value={confidence} onChange={(value) => update({ confidence: value })} disabled={study.revealed || loading} />
          {!study.revealed ? <button className="room-primary" onClick={() => update({ revealed: true, recallTime: getElapsed() })}>Reveal answer</button> : <div>
            <p className="study-card-answer">{question.correct_answer}</p>
            <p>Did you recall it before revealing? This records your own assessment.</p>
            <button className="room-primary" disabled={loading} onClick={() => submit(null, true)}>I recalled it</button>
            <button disabled={loading} onClick={() => submit(null, false)}>Practice again</button>
          </div>}
        </div> : <form onSubmit={submit}>
          {question.options?.length ? <fieldset disabled={loading}>
            <legend>Choose your answer</legend>
            {question.options.map((option, i) => <label key={option}><input type="radio" name="answer" value={option}
              checked={answer === option} onChange={(e) => update({ answer: e.target.value })} required /><span className="room-option-letter" aria-hidden="true">{String.fromCharCode(65 + i)}</span><span>{option}</span></label>)}
          </fieldset> : <><label htmlFor="study-answer">Your answer</label><input id="study-answer" type="text" required value={answer} disabled={loading} onChange={(e) => update({ answer: e.target.value })} /></>}
          <ConfidenceBar value={confidence} onChange={(value) => update({ confidence: value })} disabled={loading} />
          <button className="room-primary" disabled={loading || !answer.trim()}>{loading ? "Saving..." : "Check answer"}<span aria-hidden="true">↗</span></button>
        </form>}
      </section>}
    </>}
    </div>
    <footer className="room-footer"><span aria-hidden="true">✧</span> Less rush. More room to learn. <span aria-hidden="true">✧</span></footer>
  </div>;
}
