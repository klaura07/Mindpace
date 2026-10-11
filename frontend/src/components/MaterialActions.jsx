import { Link } from "react-router-dom";

export default function MaterialActions({ documentId, topic }) {
  const source = documentId ? `document=${documentId}` : `topic=${encodeURIComponent(topic)}`;
  return <div className="doodle-document-actions material-actions">
    <Link className="material-button" to={`/questions?${source}`}>Dive In</Link>
    <Link className="material-button material-company" to={`/study-time?${source}`}>Keep me company</Link>
  </div>;
}
