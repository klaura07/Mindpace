import { useId, useRef, useState } from "react";
import { removeStudyTopic } from "../api";

export default function RemoveConcept({ topic, onRemoved }) {
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState(null);
  const dialog = useRef(null);
  const cancelButton = useRef(null);
  const titleId = useId();
  const descriptionId = useId();
  function openConfirmation() {
    setError(null);
    dialog.current.showModal();
    cancelButton.current.focus();
  }
  async function remove() {
    if (removing) return;
    setRemoving(true); setError(null);
    try {
      await removeStudyTopic(topic);
      dialog.current.close();
      onRemoved(topic);
    } catch (err) { setError(err.message); setRemoving(false); }
  }
  return <div className="concept-removal">
    <button type="button" className="concept-close" disabled={removing} onClick={openConfirmation}
      aria-label={`Remove concept: ${topic}`} aria-busy={removing} title="Remove concept">
      <span aria-hidden="true">×</span>
    </button>
    <dialog ref={dialog} className="concept-confirmation" aria-labelledby={titleId} aria-describedby={descriptionId}
      onCancel={event => { if (removing) event.preventDefault(); }}>
      <p className="doodle-eyebrow">A little room for new ideas</p>
      <h2 id={titleId}>Remove this concept?</h2>
      <div id={descriptionId}>
        <p>Are you sure you want to remove <strong>{topic}</strong> from your concepts?</p>
        <p className="concept-confirmation-note">Your saved questions and answers will be kept. You can add this concept again anytime.</p>
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="concept-confirmation-actions">
        <button ref={cancelButton} type="button" className="platform-secondary" disabled={removing} onClick={() => dialog.current.close()}>Keep concept</button>
        <button type="button" disabled={removing} onClick={remove}>{removing ? "Removing..." : "Remove concept"}</button>
      </div>
    </dialog>
  </div>;
}
