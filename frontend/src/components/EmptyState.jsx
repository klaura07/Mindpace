// A friendly, encouraging placeholder for empty lists — used instead of
// blank space or a bare line of text.
export default function EmptyState({ title, message }) {
  return (
    <div className="empty-state">
      <svg
        viewBox="0 0 64 64"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M14 40c0-12 8-22 18-22s18 10 18 22" />
        <path d="M10 40h44" />
        <circle cx="24" cy="30" r="2" fill="currentColor" stroke="none" />
        <circle cx="40" cy="30" r="2" fill="currentColor" stroke="none" />
        <path d="M26 36c2 2 4 3 6 3s4-1 6-3" />
      </svg>
      <strong>{title}</strong>
      <span>{message}</span>
    </div>
  );
}
