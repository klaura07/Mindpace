import { useAuth } from "../context/AuthContext";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getStudyAnalytics, uploadDocument } from "../api";
import PlatformPage from "../components/PlatformPage";
import MaterialActions from "../components/MaterialActions";
import "./Dashboard.css";
import "./Study.css";

const percent = (value) => value === null ? "—" : `${Math.round(value * 100)}%`;

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

  return <PlatformPage className="dashboard" title="Dashboard"
    description="Your answers and confidence guide your next practice. Study time is your own space to learn.">
    {analytics && <div className="doodle-stats" aria-label="Learning overview">
      <div className="doodle-stat"><span>Questions answered</span><strong>{analytics.question.overall.attempts}</strong><small>one step at a time</small></div>
      <div className="doodle-stat"><span>Question accuracy</span><strong>{percent(analytics.question.overall.accuracy)}</strong><small>from your recent attempts</small></div>
    </div>}
    <section className="dashboard-upload">
      <h2>Start with your material</h2><p>Upload a document, then choose questions or your own quiet study time.</p>
      <form className="dashboard-upload-form" onSubmit={handleUpload}>
        <div className="dashboard-file-field"><label htmlFor="dashboard-file">Choose a document (PDF, DOCX, or TXT)</label>
          <input id="dashboard-file" type="file" accept=".pdf,.docx,.txt" required disabled={uploading}
            onChange={(e) => { setDocFile(e.target.files[0] ?? null); setUploadError(null); setUploadedDocument(null); }} />
        </div>
        <div className="dashboard-upload-actions">
          <button className="btn-solid" disabled={uploading || !docFile}>{uploading ? "Uploading..." : "Upload document"}</button>
          <Link to="/upload">Documents and topic questions</Link><Link to="/study-time">Study time</Link>
        </div>
      </form>
      {uploadedDocument && <div><p role="status">{uploadedDocument.filename} is ready.</p><MaterialActions documentId={uploadedDocument.document_id} /></div>}
      {uploadError && <p role="alert">{uploadError}</p>}
    </section>
    {error && <p role="alert">{error}</p>}
    {!analytics && !error && <p role="status">Loading learning analytics...</p>}
    {analytics && <>
      <p className="doodle-fine-print">Learning progress reflects your recent question attempts and confidence.</p>
      <div className="dashboard-progress">
        {Object.entries(analytics).filter(([mode]) => mode === "question").map(([mode, data]) => <section className="study-analytics" key={mode}>
          <h2>Questions</h2>
          {data.overall.attempts === 0 ? <p>No attempts yet. Begin in <Link to="/questions">Questions</Link>.</p> : <>
            <p>{data.overall.attempts} recent attempts · Accuracy: <strong>{percent(data.overall.accuracy)}</strong></p>
            <p>Confidence: {percent(data.overall.confidence)}</p>
            <p>Confidence gap: {Math.round(data.overall.calibration_gap * 100)} percentage points. Positive means confidence is above results; negative means it is below.</p>
            <div className="doodle-table-scroll" role="region" aria-label="Question results by material" tabIndex="0"><table><thead><tr><th>Material</th><th>Attempts</th><th>Accuracy</th><th>Confidence</th></tr></thead>
              <tbody>{data.topics.map((topic) => <tr key={`${topic.document_id}-${topic.topic}`}>
                <td><Link to={topic.document_id ? `/questions?document=${topic.document_id}` : `/questions?topic=${encodeURIComponent(topic.topic)}`}>{topic.topic}</Link></td>
                <td>{topic.attempts}</td><td>{percent(topic.accuracy)}</td><td>{percent(topic.confidence)}</td>
              </tr>)}</tbody>
            </table></div>
            {data.topics.map((topic) => <div className="doodle-topic-note" key={`${topic.document_id}-${topic.topic}-next`}>
              <h3>{topic.topic}: {topic.state}</h3><p>{topic.reason}</p>
            </div>)}
          </>}
        </section>)}
      </div>

    </>}
  </PlatformPage>;
}
