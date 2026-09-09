import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  computeCalibration,
  generateFromDocument,
  generateQuestions,
  getCalibration,
  getCalibrationTrend,
  getLearningState,
  listDocuments,
  uploadDocument,
} from "../api";
import AssistantWidget from "../components/AssistantWidget";

export default function Dashboard() {
  const [userId, setUserId] = useState(null);
  const [calibration, setCalibration] = useState(null);
  const [calibrationError, setCalibrationError] = useState(null);
  const [calibrationTrend, setCalibrationTrend] = useState(null);
  const [topic, setTopic] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState(null);
  const [generatedCount, setGeneratedCount] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [documentsError, setDocumentsError] = useState(null);
  const [docFile, setDocFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [generatingDocId, setGeneratingDocId] = useState(null);
  const [docGenerateResults, setDocGenerateResults] = useState({});
  const [docGenerateErrors, setDocGenerateErrors] = useState({});
  const [learningState, setLearningState] = useState(null);
  const [learningStateError, setLearningStateError] = useState(null);
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
        await computeCalibration(userId);
      } catch (err) {
        if (err.status !== 400) {
          setCalibrationError(err.message);
          return;
        }
        // No responses yet to compute from — fall through and try to show
        // whatever the most recent score is, if any.
      }
      try {
        const score = await getCalibration(userId);
        setCalibration(score);
      } catch (err) {
        setCalibrationError(
          err.status === 404 ? "No calibration data yet — complete a quiz first." : err.message
        );
      }
      try {
        const trend = await getCalibrationTrend(userId);
        setCalibrationTrend(trend);
      } catch {
        // Trend is a nice-to-have — the single-score display above already
        // reports any real error, so fail quietly here.
      }
    })();
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        setDocuments(await listDocuments(userId));
      } catch (err) {
        setDocumentsError(err.message);
      }
      try {
        setLearningState(await getLearningState(userId));
      } catch (err) {
        setLearningStateError(err.message);
      }
    })();
  }, [userId]);

  async function handleUpload(e) {
    e.preventDefault();
    if (!docFile) return;
    setUploading(true);
    setUploadError(null);
    try {
      const doc = await uploadDocument(userId, docFile);
      setDocuments((prev) => [...prev, doc]);
      setDocFile(null);
      e.target.reset();
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleGenerateFromDocument(documentId) {
    setGeneratingDocId(documentId);
    setDocGenerateErrors((prev) => ({ ...prev, [documentId]: null }));
    try {
      const result = await generateFromDocument(documentId);
      setDocGenerateResults((prev) => ({ ...prev, [documentId]: result }));
    } catch (err) {
      setDocGenerateErrors((prev) => ({ ...prev, [documentId]: err.message }));
    } finally {
      setGeneratingDocId(null);
    }
  }

  async function handleGenerate(e) {
    e.preventDefault();
    if (!topic.trim()) return;
    setGenerating(true);
    setGenerateError(null);
    setGeneratedCount(null);
    try {
      const created = await generateQuestions(topic.trim());
      setGeneratedCount(created.length);
    } catch (err) {
      setGenerateError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem("user_id");
    navigate("/login");
  }

  if (!userId) return null;

  // Light gamification: a "well-calibrated streak" (trailing trend points
  // with a small gap, most recent first) and an XP/level readout derived
  // from how many calibration checkpoints exist — both computed from data
  // already on the page, no new backend calls.
  let calibrationStreak = 0;
  if (calibrationTrend) {
    for (let i = calibrationTrend.length - 1; i >= 0; i--) {
      if (Math.abs(calibrationTrend[i].calibration_gap) < 0.15) calibrationStreak++;
      else break;
    }
  }
  const xp = (calibrationTrend?.length ?? 0) * 10;
  const level = Math.floor(xp / 30) + 1;

  return (
    <div className="fade-in">
      <h1>Dashboard</h1>
      <p>Logged in as user #{userId}</p>

      <section>
        <h2>Calibration</h2>
        {calibration && (
          <>
            <p>
              <strong className="glow-stat">{calibration.calibration_gap.toFixed(3)}</strong>
            </p>
            <p>Positive means overconfident, negative means underconfident.</p>
          </>
        )}
        {calibrationError && <p role="alert">{calibrationError}</p>}

        {calibrationTrend && calibrationTrend.length > 0 && (
          <>
            <div className="badge-row">
              {calibrationStreak > 1 && (
                <span className="badge badge-streak">
                  🔥 {calibrationStreak} well-calibrated in a row
                </span>
              )}
              <span className="badge badge-xp">⭐ Level {level} · {xp} XP</span>
            </div>
            <h3>Trend</h3>
            <table>
              <thead>
                <tr>
                  <th>Computed at</th>
                  <th>Gap</th>
                </tr>
              </thead>
              <tbody>
                {calibrationTrend.map((point) => (
                  <tr key={point.score_id}>
                    <td>{point.computed_at}</td>
                    <td>{point.calibration_gap.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>

      <section>
        <h2>Generate Questions</h2>
        <form onSubmit={handleGenerate}>
          <label htmlFor="gen-topic">Topic</label>
          <input
            id="gen-topic"
            type="text"
            required
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />
          <button type="submit" disabled={generating}>
            {generating ? "Generating..." : "Generate questions"}
          </button>
        </form>
        {generatedCount !== null && <p>Generated {generatedCount} questions.</p>}
        {generateError && <p role="alert">{generateError}</p>}
      </section>

      <section>
        <h2>Documents</h2>
        <form onSubmit={handleUpload}>
          <label htmlFor="doc-file">Upload a document (PDF, DOCX, or TXT)</label>
          <input
            id="doc-file"
            type="file"
            accept=".pdf,.docx,.txt"
            onChange={(e) => setDocFile(e.target.files[0] ?? null)}
            required
          />
          <button type="submit" disabled={uploading || !docFile}>
            {uploading ? "Uploading..." : "Upload"}
          </button>
        </form>
        {uploadError && <p role="alert">{uploadError}</p>}
        {documentsError && <p role="alert">{documentsError}</p>}

        {documents.length > 0 && (
          <ul>
            {documents.map((doc) => (
              <li key={doc.document_id}>
                <p>
                  {doc.filename} — uploaded {doc.uploaded_at}
                </p>
                <button
                  onClick={() => handleGenerateFromDocument(doc.document_id)}
                  disabled={generatingDocId === doc.document_id}
                >
                  {generatingDocId === doc.document_id
                    ? "Generating..."
                    : "Generate revision guide + questions"}
                </button>
                {docGenerateErrors[doc.document_id] && (
                  <p role="alert">{docGenerateErrors[doc.document_id]}</p>
                )}
                {docGenerateResults[doc.document_id] && (
                  <div className="fade-in">
                    <h3>Revision guide</h3>
                    <p style={{ whiteSpace: "pre-wrap" }}>
                      {docGenerateResults[doc.document_id].revision_guide}
                    </p>
                    <h3>Generated questions</h3>
                    <ul>
                      {docGenerateResults[doc.document_id].questions.map((q) => (
                        <li key={q.question_id}>{q.prompt_text}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>Learning State</h2>
        {learningState && learningState.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Topic</th>
                <th>Label</th>
                <th>Count</th>
              </tr>
            </thead>
            <tbody>
              {learningState.flatMap(({ topic: t, counts }) =>
                Object.entries(counts).map(([label, count]) => (
                  <tr key={`${t}-${label}`}>
                    <td>{t}</td>
                    <td>{label}</td>
                    <td>{count}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        ) : (
          <p>No learning-state data yet — complete a quiz first.</p>
        )}
        {learningStateError && <p role="alert">{learningStateError}</p>}
      </section>

      <button onClick={() => navigate("/quiz")}>Start Quiz</button>
      <button onClick={handleLogout}>Log out</button>

      <AssistantWidget />
    </div>
  );
}
