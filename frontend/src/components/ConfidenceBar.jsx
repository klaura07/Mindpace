export default function ConfidenceBar({ value, onChange, disabled = false, id = "confidence" }) {
  return <div className="study-confidence">
    <label htmlFor={id}>How confident are you? <strong>{Math.round(value * 100)}%</strong></label>
    <input id={id} type="range" min="0" max="1" step="0.05" value={value}
      disabled={disabled} onChange={(e) => onChange(Number(e.target.value))}
      aria-valuetext={`${Math.round(value * 100)} percent confident`} />
    <div className="study-confidence-labels"><span>Unsure</span><span>Very sure</span></div>
  </div>;
}
