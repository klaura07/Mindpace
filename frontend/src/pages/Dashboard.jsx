import { useAuth } from "../context/AuthContext";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getStudyAnalytics, uploadDocument } from "../api";
import PlatformPage from "../components/PlatformPage";
import "./Dashboard.css";
import "./Study.css";

const percent = (value) => value === null ? "—" : `${Math.round(value * 100)}%`;
const pace = (value) => value === null ? "—" : `${(value / 1000).toFixed(1)}s`;

export default function Dashboard() {
  const { user } = useAuth();
  const [analytics, setAnalytics] = useState(null);
  const [error, setError] = useState(null);
  const [docFile, setDocFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [uploadedDocument, setUploadedDocument] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getStudyAnalytics(user.user_id).then((data) => { if (!cancelled) setAnalytics(data); })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [user.user_id]);

  async function handleUpload(e) {
    e.preventDefault();
    if (!docFile || uploading) return;
    const form = e.currentTarget;
    setUploading(true);
    setUploadError(null);
    setUploadedDocument(null);
    try {
      setUploadedDocument(await uploadDocument(user.user_id, docFile));
      setDocFile(null);
      form.reset();
    } catch (err) { setUploadError(err.message); }
    finally { setUploading(false); }
  }

  return <PlatformPage className="dashboard" title="Dashboard" eyebrow="Your learning space"
    description="Your answers, confidence, and active response time guide your next practice.">
    {analytics && <div className="doodle-stats" aria-label="Learning overview">
      <div className="doodle-stat"><span>Questions answered</span><strong>{analytics.question.overall.attempts}</strong><small>one step at a time</small></div>
      <div className="doodle-stat"><span>Cards practiced</span><strong>{analytics.flashcard.overall.attempts}</strong><small>a little more familiar</small></div>
      <div className="doodle-stat"><span>Question accuracy</span><strong>{percent(analytics.question.overall.accuracy)}</strong><small>from your recent attempts</small></div>
    </div>}
    <section className="dashboard-upload">
      <h2>Start with your material</h2><p>Upload a document to practice with questions and flashcards.</p>
      <form className="dashboard-upload-form" onSubmit={handleUpload}>
        <div className="dashboard-file-field"><label htmlFor="dashboard-file">Choose a document (PDF, DOCX, or TXT)</label>
          <input id="dashboard-file" type="file" accept=".pdf,.docx,.txt" required disabled={uploading}
            onChange={(e) => { setDocFile(e.target.files[0] ?? null); setUploadError(null); setUploadedDocument(null); }} />
        </div>
        <div className="dashboard-upload-actions">
          <button className="btn-solid" disabled={uploading || !docFile}>{uploading ? "Uploading..." : "Upload document"}</button>
          <Link to="/upload">View documents</Link><Link to="/study-time">Study time</Link>
        </div>
      </form>
      {uploadedDocument && <p role="status">{uploadedDocument.filename} is ready. <Link to={`/study-time?document=${uploadedDocument.document_id}`}>Start studying</Link></p>}
      {uploadError && <p role="alert">{uploadError}</p>}
    </section>
    {error && <p role="alert">{error}</p>}
    {!analytics && !error && <p role="status">Loading learning analytics...</p>}
    {analytics && <>
      <p className="doodle-fine-print">Recent trends use up to 30 attempts per view, from the latest 200 attempts in each mode. Flashcard recall is self-reported and kept separate from scored answers.</p>
      <div className="dashboard-progress">
        {Object.entries(analytics).map(([mode, data]) => <section className="study-analytics" key={mode}>
          <h2>{mode === "question" ? "Questions" : "Flashcards"}</h2>
          {data.overall.attempts === 0 ? <p>No attempts yet. Begin in <Link to="/study-time">Study time</Link>.</p> : <>
            <p>{data.overall.attempts} recent attempts · {mode === "question" ? "Accuracy" : "Reported recall"}: <strong>{percent(data.overall.accuracy)}</strong></p>
            <p>Confidence: {percent(data.overall.confidence)} · Median active time: {pace(data.overall.median_response_ms)}</p>
            <p>Confidence gap: {Math.round(data.overall.calibration_gap * 100)} percentage points. Positive means confidence is above results; negative means it is below.</p>
            <div className="doodle-table-scroll" role="region" aria-label={`${mode === "question" ? "Question" : "Flashcard"} results by material`} tabIndex="0"><table><thead><tr><th>Material</th><th>Attempts</th><th>{mode === "question" ? "Accuracy" : "Recall"}</th><th>Confidence</th><th>Active time</th></tr></thead>
              <tbody>{data.topics.map((topic) => <tr key={`${topic.document_id}-${topic.topic}`}>
                <td>{topic.document_id ? <Link to={`/study-time?document=${topic.document_id}`}>{topic.topic}</Link> : topic.topic}</td>
                <td>{topic.attempts}</td><td>{percent(topic.accuracy)}</td><td>{percent(topic.confidence)}</td><td>{pace(topic.median_response_ms)}</td>
              </tr>)}</tbody>
            </table></div>
            {data.topics.map((topic) => <div className="doodle-topic-note" key={`${topic.document_id}-${topic.topic}-next`}>
              <h3>{topic.topic}: {topic.state}</h3><p>{topic.reason}</p><p>{topic.pace}</p>
            </div>)}
          </>}
        </section>)}
      </div>
      <p className="doodle-fine-print">Timing comparisons need five earlier attempts at the same difficulty and in the same mode. Longer answers alone do not imply distraction.</p>
    </>}
  </PlatformPage>;
}
