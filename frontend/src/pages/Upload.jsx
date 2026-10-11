import { useAuth } from "../context/AuthContext";
import { useEffect, useRef, useState } from "react";
import { listDocuments, listQuestionTopics, saveStudyTopic, uploadDocument } from "../api";
import EmptyState from "../components/EmptyState";
import PlatformPage from "../components/PlatformPage";
import MaterialActions from "../components/MaterialActions";
import RemoveConcept from "../components/RemoveConcept";

export default function Upload() {
  const { user } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [topics, setTopics] = useState([]);
  const [libraryError, setLibraryError] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [docFile, setDocFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [topic, setTopic] = useState("");
  const [topicError, setTopicError] = useState(null);
  const [topicLoading, setTopicLoading] = useState(false);
  const [ready, setReady] = useState(null);
  const choices = useRef(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listDocuments(user.user_id), listQuestionTopics()]).then(([docs, savedTopics]) => {
      if (!cancelled) { setDocuments(docs); setTopics(savedTopics); setLoaded(true); }
    }).catch(err => { if (!cancelled) setLibraryError(err.message); });
    return () => { cancelled = true; };
  }, [user.user_id, attempt]);
  useEffect(() => { if (ready) choices.current?.scrollIntoView({ block: "nearest", behavior: "instant" }); }, [ready]);

  async function handleUpload(e) {
    e.preventDefault();
    if (!docFile || uploading) return;
    const form = e.currentTarget;
    setUploading(true); setUploadError(null);
    try {
      const doc = await uploadDocument(user.user_id, docFile);
      setDocuments(prev => [...prev, doc]);
      setDocFile(null); form.reset();
      setReady({ title: doc.filename, documentId: doc.document_id });
    } catch (err) { setUploadError(err.message); }
    finally { setUploading(false); }
  }
  async function handleTopic(e) {
    e.preventDefault();
    if (!topic.trim() || topicLoading) return;
    setTopicLoading(true); setTopicError(null);
    try {
      const saved = await saveStudyTopic(topic.trim());
      setTopics(prev => [{ topic: saved.topic }, ...prev.filter(item => item.topic !== saved.topic)]);
      setReady({ title: saved.topic, topic: saved.topic });
    } catch (err) { setTopicError(err.message); }
    finally { setTopicLoading(false); }
  }
  function removeConcept(name) {
    setTopics(previous => previous.filter(item => item.topic !== name));
    setReady(previous => previous?.topic === name ? null : previous);
  }
  return <PlatformPage title="Upload" description="Bring a document or a concept. Choose thoughtful questions or a quiet study session.">
    <section>
      <h2>Upload study material</h2>
      <p>Add a PDF, DOCX, or TXT, then choose how you want to learn.</p>
      <form onSubmit={handleUpload}>
        <label htmlFor="doc-file">Choose a document (PDF, DOCX, or TXT)</label>
        <input id="doc-file" type="file" accept=".pdf,.docx,.txt" disabled={uploading} required onChange={e => setDocFile(e.target.files[0] ?? null)} />
        <button type="submit" disabled={uploading || !docFile}>{uploading ? "Saving your material..." : "Upload document"}</button>
      </form>
      {uploadError && <p role="alert">{uploadError}</p>}
    </section>
    <section>
      <h2>Explore a concept</h2>
      <form onSubmit={handleTopic}>
        <label htmlFor="content-topic">Topic or concept</label>
        <input id="content-topic" type="text" value={topic} maxLength={200} required placeholder="For example, photosynthesis or AI data centres" disabled={topicLoading} onChange={e => setTopic(e.target.value)} />
        <button type="submit" disabled={topicLoading || !topic.trim()}>{topicLoading ? "Saving your topic..." : "Choose this concept"}</button>
      </form>
      {topicError && <p role="alert">{topicError}</p>}
    </section>
    {ready && <section ref={choices} aria-label="Choose how to learn">
      <h2>{ready.title}</h2>
      <p role="status">Ready. How would you like to learn?</p>
      <MaterialActions documentId={ready.documentId} topic={ready.topic} />
      {ready.topic && <RemoveConcept topic={ready.topic} onRemoved={removeConcept} />}
      <p>Dive In explores the ideas through questions. Keep me company gives you a Pomodoro timer while you learn on your own.</p>
    </section>}
    <section>
      <h2>Your study material</h2>
      {libraryError && <div role="alert">{libraryError} <button onClick={() => { setLibraryError(null); setAttempt(value => value + 1); }}>Retry loading library</button></div>}
      {!loaded && !libraryError && <p role="status">Loading your material...</p>}
      {loaded && !documents.length && !topics.length && <EmptyState title="Your next idea starts here" message="Upload a document or enter a concept above." />}
      <ul className="platform-list">
        {topics.filter(item => item.topic !== ready?.topic).map(item => <li key={`topic-${item.topic}`}><h3>{item.topic}</h3><MaterialActions topic={item.topic} /><RemoveConcept topic={item.topic} onRemoved={removeConcept} /></li>)}
        {documents.filter(doc => doc.document_id !== ready?.documentId).map(doc => <li key={doc.document_id}><h3>{doc.filename}</h3><MaterialActions documentId={doc.document_id} /></li>)}
      </ul>
    </section>
  </PlatformPage>;
}
