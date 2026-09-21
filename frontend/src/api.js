const API_BASE = import.meta.env.VITE_API_BASE ?? "/api";

async function request(path, options) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      credentials: "include",
      headers: { ...options?.headers, "X-Mindpace-Request": "1" },
    });
  } catch {
    throw new Error("Could not reach the server. Is it running?");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail = Array.isArray(body.detail)
      ? body.detail.map((item) => `${item.loc.at(-1)}: ${item.msg}`).join(". ")
      : body.detail;
    const fallback = [502, 503, 504].includes(res.status)
      ? "The app server is unavailable. Start both services with start-all.ps1, then try again."
      : `Request failed: ${res.status}`;
    const error = new Error(detail || fallback);
    error.status = res.status;
    if (res.status === 401 && !path.startsWith("/auth/")) {
      window.dispatchEvent(new Event("auth:expired"));
    }
    throw error;
  }
  return res.status === 204 ? null : res.json();
}

export function createUser(email, password) {
  return request("/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

export function login(email, password) {
  return request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

export function getCurrentUser() {
  return request("/auth/me");
}

export function logout() {
  return request("/auth/logout", { method: "POST" });
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

export function createResponse({ sessionId, questionId, answerText, confidence, responseTimeMs, responseMode = "question", recalled }) {
  return request("/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: sessionId,
      question_id: questionId,
      answer_text: answerText,
      confidence,
      response_time_ms: responseTimeMs ?? null,
      response_mode: responseMode,
      recalled,
    }),
  });
}

export function computeCalibration(userId) {
  return request(`/calibration/${userId}/compute`, { method: "POST" });
}

export function getCalibration(userId) {
  return request(`/calibration/${userId}`);
}

export function getCalibrationTrend(userId) {
  return request(`/calibration/${userId}/trend`);
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

export function askAssistant(message, sessionId) {
  return request("/assistant", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, session_id: sessionId ?? null }),
  });
}

export function uploadDocument(userId, file) {
  const formData = new FormData();
  formData.append("file", file);
  return request(`/documents?user_id=${userId}`, {
    method: "POST",
    body: formData,
  });
}

export function listDocuments(userId) {
  return request(`/documents?user_id=${userId}`);
}

export function generateFromDocument(documentId) {
  return request(`/documents/${documentId}/generate`, { method: "POST" });
}

export function getDocumentQuestions(documentId) {
  return request(`/documents/${documentId}/questions`);
}

export function getLearningState(userId) {
  return request(`/learning-state/${userId}`);
}

export function getDueReviewItems(userId) {
  return request(`/review/${userId}`);
}

export function reframeQuestion(questionId) {
  return request(`/questions/${questionId}/reframe`, { method: "POST" });
}

export function getNextStudyQuestion(documentId, sessionId, mode) {
  return request(`/study/${documentId}/next?session_id=${sessionId}&mode=${mode}`);
}

export function getStudyAnalytics(userId) {
  return request(`/analytics/${userId}`);
}

export function endSession(sessionId) {
  return request(`/sessions/${sessionId}/end`, { method: "POST" });
}
