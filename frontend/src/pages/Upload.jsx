import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { generateFromDocument, listDocuments, uploadDocument } from "../api";
import EmptyState from "../components/EmptyState";

export default function Upload() {
  const [userId, setUserId] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [documentsError, setDocumentsError] = useState(null);
  const [docFile, setDocFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [generatingDocId, setGeneratingDocId] = useState(null);
  const [docGenerateResults, setDocGenerateResults] = useState({});
  const [docGenerateErrors, setDocGenerateErrors] = useState({});
  const [docView, setDocView] = useState({});
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
        setDocuments(await listDocuments(userId));
      } catch (err) {
        setDocumentsError(err.message);
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

  if (!userId) return null;

  return (
    <div className="fade-in">
      <h1>Upload</h1>
      <p>Upload a document to generate a revision guide and quiz questions from it.</p>

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

        {documents.length === 0 && !documentsError && (
          <EmptyState
            title="No documents yet"
            message="Upload your first PDF, DOCX, or TXT above to generate a revision guide and quiz questions."
          />
        )}

        {documents.length > 0 && (
          <ul>
            {documents.map((doc) => {
              const result = docGenerateResults[doc.document_id];
              const view = docView[doc.document_id];
              return (
                <li key={doc.document_id}>
                  <p>
                    {doc.filename} — uploaded {doc.uploaded_at}
                  </p>
                  {!result && (
                    <button
                      onClick={() => handleGenerateFromDocument(doc.document_id)}
                      disabled={generatingDocId === doc.document_id}
                    >
                      {generatingDocId === doc.document_id
                        ? "Generating..."
                        : "Generate revision guide + questions"}
                    </button>
                  )}
                  {docGenerateErrors[doc.document_id] && (
                    <p role="alert">{docGenerateErrors[doc.document_id]}</p>
                  )}

                  {result && (
                    <div className="fade-in">
                      <div className="badge-row">
                        <button
                          onClick={() =>
                            setDocView((prev) => ({ ...prev, [doc.document_id]: "summary" }))
                          }
                        >
                          View Summary
                        </button>
                        <button
                          onClick={() =>
                            setDocView((prev) => ({ ...prev, [doc.document_id]: "quiz" }))
                          }
                        >
                          Take Quiz
                        </button>
                      </div>

                      {view === "summary" && (
                        <div className="fade-in">
                          <h3>Revision guide</h3>
                          <p style={{ whiteSpace: "pre-wrap" }}>{result.revision_guide}</p>
                        </div>
                      )}

                      {view === "quiz" && (
                        <div className="fade-in">
                          <h3>Generated questions</h3>
                          <ul>
                            {result.questions.map((q) => (
                              <li key={q.question_id}>{q.prompt_text}</li>
                            ))}
                          </ul>
                          <button onClick={() => navigate("/quiz")}>Go to Quiz</button>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
