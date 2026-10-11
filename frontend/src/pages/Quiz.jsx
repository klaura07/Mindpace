import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useStudy } from "../context/StudyContext";
import { createSession, listDocuments, listQuestionTopics, generateFromDocument, generateQuestions, createResponse, getNextStudyQuestion, getNextTopicQuestion, endSession } from "../api";
import ConfidenceBar from "../components/ConfidenceBar";
import PlatformPage from "../components/PlatformPage";
import MaterialActions from "../components/MaterialActions";
import RemoveConcept from "../components/RemoveConcept";
import "./Study.css";

const EMPTY = { sessionId: null, question: null, feedback: null, answer: "", confidence: .5, answered: 0, done: false, error: null };
export default function Questions() {
  const { user } = useAuth();
  const { practices, setPractices } = useStudy();
  const [params] = useSearchParams();
  const documentId = params.get("document");
  const topic = documentId ? null : params.get("topic");
  const sourceKey = documentId ? `document:${documentId}` : topic ? `topic:${topic}` : "";
  const sourceQuery = documentId ? `document=${encodeURIComponent(documentId)}` : `topic=${encodeURIComponent(topic || "")}`;
  const practice = practices[sourceKey] || EMPTY;
  const [materials, setMaterials] = useState(null);
  const [materialError, setMaterialError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(false);
  const busy = useRef(false);
  const update = useCallback(patch => setPractices(previous => ({ ...previous,
    [sourceKey]: { ...(previous[sourceKey] || EMPTY), ...patch } })), [setPractices, sourceKey]);
  useEffect(() => {
    let cancelled = false;
    Promise.all([listDocuments(user.user_id), listQuestionTopics()]).then(([documents, topics]) => {
      if (!cancelled) setMaterials({ documents, topics });
    }).catch(error => { if (!cancelled) setMaterialError(error.message); });
    return () => { cancelled = true; };
  }, [user.user_id, attempt]);
  const title = topic || materials?.documents.find(doc => String(doc.document_id) === documentId)?.filename || "Your document";
  const fetchNext = useCallback(sessionId => topic ? getNextTopicQuestion(topic, sessionId) : getNextStudyQuestion(documentId, sessionId), [topic, documentId]);
  const openQuestion = useCallback(async sessionId => {
    const result = await fetchNext(sessionId);
    if (!result.question) {
      await endSession(sessionId);
      update({ done: true, question: null, feedback: null, error: null });
    } else update({ question: result.question, adaptation: result.adaptation, remaining: result.remaining,
      feedback: null, answer: "", confidence: .5, error: null });
  }, [fetchNext, update]);
  const begin = useCallback(async () => {
    if (busy.current || !sourceKey) return;
    busy.current = true; setLoading(true); update({ error: null });
    try {
      let sessionId = practice.sessionId;
      if (!sessionId) {
        const bank = topic ? await generateQuestions(topic) : (await generateFromDocument(documentId)).questions;
        if (!bank.length) throw new Error("No questions were created. Please try again.");
        const session = await createSession(user.user_id);
        sessionId = session.session_id;
        update({ ...EMPTY, sessionId, title });
      }
      await openQuestion(sessionId);
    } catch (error) { update({ error: error.message }); }
    finally { busy.current = false; setLoading(false); }
  }, [sourceKey, topic, documentId, practice.sessionId, user.user_id, title, update, openQuestion]);
  useEffect(() => {
    if (sourceKey && !loading && !practice.sessionId && !practice.error && !practice.done) void begin();
  }, [sourceKey, loading, practice.sessionId, practice.error, practice.done, begin]);
  async function submit(event) {
    event.preventDefault();
    if (busy.current || practice.feedback || !practice.answer.trim()) return;
    busy.current = true; setLoading(true); update({ error: null });
    try {
      const result = await createResponse({ sessionId: practice.sessionId, questionId: practice.question.question_id,
        answerText: practice.answer, confidence: practice.confidence });
      update({ feedback: result, answered: practice.answered + 1 });
    } catch (error) { update({ error: error.message }); }
    finally { busy.current = false; setLoading(false); }
  }
  async function finish() {
    if (busy.current) return;
    busy.current = true; setLoading(true); update({ error: null });
    try { await endSession(practice.sessionId); update({ done: true, question: null, feedback: null }); }
    catch (error) { update({ error: error.message }); }
    finally { busy.current = false; setLoading(false); }
  }
  return <PlatformPage title="Questions" description="Think through the idea, apply it, and explore why the answer works.">
    {!sourceKey ? <section>
      <h2>What would you like to explore?</h2>
      <Link to="/upload">Add a document or concept</Link>
      {materialError && <p role="alert">{materialError} <button onClick={() => { setMaterialError(null); setAttempt(value => value + 1); }}>Retry loading material</button></p>}
      {!materials && !materialError && <p role="status">Loading your material...</p>}
      {materials && <ul className="platform-list">
        {materials.topics.map(item => <li key={item.topic}><h3>{item.topic}</h3><MaterialActions topic={item.topic} /><RemoveConcept topic={item.topic} onRemoved={name => setMaterials(previous => ({ ...previous, topics: previous.topics.filter(saved => saved.topic !== name) }))} /></li>)}
        {materials.documents.map(doc => <li key={doc.document_id}><h3>{doc.filename}</h3><MaterialActions documentId={doc.document_id} /></li>)}
      </ul>}
    </section> : <section className="question-practice">
      <div className="practice-navigation"><Link to="/upload">Change material</Link><Link to={`/study-time?${sourceQuery}`}>Keep me company</Link></div>
      <h2>{title}</h2>
      {practice.error && <p role="alert">{practice.error}</p>}
      {practice.done ? <div>
        <h3>Practice complete</h3><p>{practice.answered} questions answered. Your progress is saved.</p>
        <button onClick={() => update({ ...EMPTY })}>Explore these questions again</button>
        <Link to="/dashboard">View learning progress</Link>
      </div> : !practice.question ? <div>
        <p role="status">{loading ? "Preparing conceptual questions and explanations..." : "Your questions are ready to retry."}</p>
        {!loading && <button onClick={begin}>Retry questions</button>}
      </div> : <>
        <p>Question {practice.answered + (practice.feedback ? 0 : 1)} · {practice.remaining} in this set</p>
        <h3>{practice.question.prompt_text}</h3>
        {practice.feedback ? <div className="platform-feedback" role="status">
          <p><strong>{practice.feedback.is_correct ? "Correct." : "Let's unpack this idea."}</strong></p>
          <p>Answer: {practice.feedback.correct_answer}</p>
          {practice.feedback.explanation && <><h4>Why this works</h4><p>{practice.feedback.explanation}</p></>}
          <p>{practice.feedback.adaptation?.reason}</p>
          <button onClick={begin} disabled={loading}>{loading ? "Loading..." : "Continue"}</button>
        </div> : <form onSubmit={submit}>
          {practice.question.options?.length ? <fieldset disabled={loading}><legend>Which explanation fits best?</legend>
            {practice.question.options.map(option => <label key={option}><input type="radio" name="answer" value={option} checked={practice.answer === option} onChange={() => update({ answer: option })} required />{option}</label>)}
          </fieldset> : <><label htmlFor="practice-answer">Your answer</label><input id="practice-answer" value={practice.answer} disabled={loading} onChange={event => update({ answer: event.target.value })} required /></>}
          <ConfidenceBar value={practice.confidence} onChange={confidence => update({ confidence })} disabled={loading} />
          <button disabled={loading || !practice.answer.trim()}>{loading ? "Saving..." : "Check answer"}</button>
        </form>}
      </>}
      {practice.sessionId && !practice.done && <button className="platform-secondary" disabled={loading} onClick={finish}>Finish practice</button>}
    </section>}
  </PlatformPage>;
}
