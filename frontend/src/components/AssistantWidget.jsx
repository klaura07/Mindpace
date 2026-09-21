import { useRef, useState } from "react";
import { askAssistant } from "../api";
import "./AssistantWidget.css";

export default function AssistantWidget({ sessionId }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const launcher = useRef(null);

  function closeWidget() {
    setOpen(false);
    launcher.current?.focus();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setMessages((prev) => [...prev, { role: "user", text }]);
    setInput("");
    setLoading(true);
    setError(null);
    try {
      const { reply } = await askAssistant(text, sessionId);
      setMessages((prev) => [...prev, { role: "assistant", text: reply }]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="zen-widget">
      <button
        ref={launcher}
        className="zen-launcher"
        type="button"
        onClick={() => setOpen(!open)}
        aria-label={open ? "Close Zen assistant" : "Open Zen assistant"}
        aria-expanded={open}
        aria-controls="zen-panel"
        title="Zen assistant"
      >
        <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M16 24C8 18 11 11 16 6c5 5 8 12 0 18Z" />
          <path d="M16 24C8 24 4 19 4 13c6 0 10 4 12 11Z" />
          <path d="M16 24c8 0 12-5 12-11-6 0-10 4-12 11Z" />
          <path d="M10 27h12" />
        </svg>
      </button>
      {open && (
        <div
          id="zen-panel"
          role="region"
          aria-label="Zen assistant"
          onKeyDown={(event) => {
            if (event.key === "Escape") closeWidget();
          }}
          className="fade-in"
          style={{
            width: "min(320px, calc(100vw - 48px))",
            maxHeight: "min(420px, calc(100dvh - 100px))",
            display: "flex",
            flexDirection: "column",
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            borderRadius: 18,
            boxShadow: "var(--shadow)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "8px 12px",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <strong>Zen</strong>
            <button type="button" onClick={closeWidget} aria-label="Close Zen">
              ×
            </button>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: 12, textAlign: "left" }}>
            {messages.length === 0 && <p>Say something. Zen's listening.</p>}
            {messages.map((m, i) => (
              <p key={i}>
                <strong>{m.role === "user" ? "You" : "Zen"}:</strong> {m.text}
              </p>
            ))}
            {error && <p role="alert">{error}</p>}
          </div>

          <form
            onSubmit={handleSubmit}
            style={{ display: "flex", gap: 8, padding: 8, margin: 0, maxWidth: "none" }}
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question..."
              style={{ flex: 1 }}
            />
            <button type="submit" disabled={loading || !input.trim()}>
              {loading ? "..." : "Send"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
