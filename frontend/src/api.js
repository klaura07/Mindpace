const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8000";

async function request(path, options) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, options);
  } catch {
    throw new Error("Could not reach the server. Is it running?");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const error = new Error(body.detail ?? `Request failed: ${res.status}`);
    error.status = res.status;
    throw error;
  }
  return res.json();
}

export function createUser(email) {
  return request("/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
}

export function getUserByEmail(email) {
  return request(`/users?email=${encodeURIComponent(email)}`);
}

export function createSession(userId) {
  return request("/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId }),
  });
}

export function getQuestions(topic) {
  return request(`/questions?topic=${encodeURIComponent(topic)}`);
}

export function createResponse({ sessionId, questionId, answerText, confidence }) {
  return request("/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: sessionId,
      question_id: questionId,
      answer_text: answerText,
      confidence,
    }),
  });
}

export function computeCalibration(userId) {
  return request(`/calibration/${userId}/compute`, { method: "POST" });
}

export function getCalibration(userId) {
  return request(`/calibration/${userId}`);
}

export function generateQuestions(topic, count = 5) {
  return request("/questions/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic, count }),
  });
}

export function createJournalEntry(sessionId, entryText) {
  return request("/journal-entries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, entry_text: entryText }),
  });
}
