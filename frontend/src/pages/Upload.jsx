import { useAuth } from "../context/AuthContext";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { generateFromDocument, listDocuments, uploadDocument } from "../api";
import EmptyState from "../components/EmptyState";
import PlatformPage from "../components/PlatformPage";

export default function Upload() {
  const { user } = useAuth();
  const userId = user.user_id;
  const [documents, setDocuments] = useState([]);
  const [documentsError, setDocumentsError] = useState(null);
  const [docFile, setDocFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [generatingDocId, setGeneratingDocId] = useState(null);
  const [docGenerateResults, setDocGenerateResults] = useState({});
  const [docGenerateErrors, setDocGenerateErrors] = useState({});
  const navigate = useNavigate();

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
    <PlatformPage title="Upload" eyebrow="Start with your notes"
      description="Upload a document to generate questions and flashcards from it.">

      <section>
        <h2>A home for your notes</h2>
        <p>Bring a chapter, a few pages, or your own notes. Turn them into a little practice.</p>
        <form onSubmit={handleUpload}>
          <div className="platform-file-field">
            <label htmlFor="doc-file">Upload a document (PDF, DOCX, or TXT)</label>
            <input
              id="doc-file"
              type="file"
              accept=".pdf,.docx,.txt"
              onChange={(e) => setDocFile(e.target.files[0] ?? null)}
              required
            />
          </div>
          <button type="submit" disabled={uploading || !docFile}>
            {uploading ? "Uploading..." : "Upload"}
          </button>
        </form>
        {uploadError && <p role="alert">{uploadError}</p>}
      </section>
      <section>
        <div className="doodle-section-heading"><h2>Your little library</h2><span>{documents.length} {documents.length === 1 ? "document" : "documents"}</span></div>
        {documentsError && <p role="alert">{documentsError}</p>}

        {documents.length === 0 && !documentsError && (
          <EmptyState
            title="No documents yet"
            message="Upload your first PDF, DOCX, or TXT above to generate questions and flashcards."
          />
        )}

        {documents.length > 0 && (
          <ul className="platform-list">
            {documents.map((doc) => {
              const result = docGenerateResults[doc.document_id];
              return (
                <li key={doc.document_id}>
                  <p className="doodle-document-title"><strong>{doc.filename}</strong><span>Uploaded {doc.uploaded_at}</span></p>
                  <div className="doodle-document-actions">
                  {!result && (
                    <button
                      onClick={() => handleGenerateFromDocument(doc.document_id)}
                      disabled={generatingDocId === doc.document_id}
                    >
                      {generatingDocId === doc.document_id
                        ? "Generating..."
                        : "Generate questions + flashcards"}
                    </button>
                  )}
                  <button className="platform-secondary" onClick={() => navigate(`/study-time?document=${doc.document_id}`)} disabled={generatingDocId === doc.document_id}>
                    Start study time
                  </button>
                  </div>
                  {docGenerateErrors[doc.document_id] && (
                    <p role="alert">{docGenerateErrors[doc.document_id]}</p>
                  )}

                  {result && <p role="status">{result.questions.length} questions ready. Use them as questions or flashcards in Study time.</p>}

                </li>
              );
            })}
          </ul>
        )}
      </section>
    </PlatformPage>
  );
}
