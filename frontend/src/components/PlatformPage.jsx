export default function PlatformPage({ title, eyebrow, description, children }) {
  return (
    <div className="platform-page fade-in">
      <header className="platform-page-heading">
        <p className="platform-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </header>
      {children}
    </div>
  );
}
