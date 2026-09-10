import { useState } from "react";
import { askAssistant } from "../api";

export default function AssistantWidget({ sessionId }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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
    <div style={{ position: "fixed", bottom: 16, right: 16, zIndex: 1000 }}>
      {open ? (
        <div
          className="fade-in"
          style={{
            width: 320,
            maxHeight: 420,
            display: "flex",
            flexDirection: "column",
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            borderRadius: 10,
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
            <button type="button" onClick={() => setOpen(false)} aria-label="Close Zen">
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
      ) : (
        <button type="button" onClick={() => setOpen(true)}>
          🧘 Zen
        </button>
      )}
    </div>
  );
}
