const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8000";

async function request(path, options) {
  const res = await fetch(`${API_BASE}${path}`, options);
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
