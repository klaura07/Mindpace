import sqlite3
import time
from contextlib import closing

import pytest
from fastapi.testclient import TestClient

from app import auth, database, main

PASSWORD = "private phrase"
HEADERS = {"X-Mindpace-Request": "1", "Origin": "http://localhost:5173"}


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(database, "DB_PATH", tmp_path / "auth.db")
    with TestClient(main.app, headers=HEADERS) as client:
        yield client


def signup(client, email="learner@example.com"):
    response = client.post("/auth/signup", json={"email": email, "password": PASSWORD})
    assert response.status_code == 201, response.text
    return response


def test_document_quiz_questions_are_persistent_and_isolated(client, monkeypatch):
    user = signup(client).json()
    def upload(text):
        response = client.post(
            f"/documents?user_id={user['user_id']}",
            files={"file": ("notes.txt", text, "text/plain")},
        )
        assert response.status_code == 201, response.text
        return response.json()["document_id"]

    first = upload("Java interfaces define contracts.")
    second = upload("Python uses indentation.")
    assert client.get(f"/documents/{first}/questions").json() == []
    monkeypatch.setattr(main, "generate_mcqs_from_document", lambda text, count: [
        {"prompt_text": text, "options": ["A", "B", "C", "D"], "correct_answer": "A", "difficulty": 1}
    ])
    generated = client.post(f"/documents/{first}/generate")
    assert generated.status_code == 201, generated.text
    questions = generated.json()["questions"]
    assert client.get(f"/documents/{first}/questions").json() == questions
    assert client.get(f"/documents/{second}/questions").json() == []
    assert client.post(f"/documents/{second}/generate").status_code == 201
    assert client.get(f"/documents/{first}/questions").json() == questions
    # Reopening the database must preserve source links.
    database.init_db()
    assert client.get(f"/documents/{first}/questions").json() == questions
    session = client.post("/sessions", json={"user_id": user["user_id"]}).json()
    answer = client.post("/responses", json={
        "session_id": session["session_id"], "question_id": questions[0]["question_id"],
        "answer_text": "A", "confidence": 0.8,
    })
    assert answer.status_code == 201, answer.text
    assert answer.json()["is_correct"] == 1
    client.post("/auth/logout")
    signup(client, "another@example.com")
    assert client.get(f"/documents/{first}/questions").status_code == 404
    assert client.get("/documents/999999/questions").status_code == 404


def test_signup_hashes_password_and_uses_persistent_cookie(client):
    response = signup(client, "  LEARNER@example.com  ")
    assert response.json()["email"] == "learner@example.com"
    assert "password" not in response.text
    cookie = response.headers["set-cookie"]
    assert "HttpOnly" in cookie and "SameSite=lax" in cookie and "Max-Age=604800" in cookie
    assert "Domain=" not in cookie and "Path=/" in cookie
    token = client.cookies.get(auth.COOKIE_NAME)
    with closing(database.get_connection()) as conn:
        stored = conn.execute("SELECT password_hash FROM users").fetchone()[0]
        assert stored != PASSWORD and auth.verify_password(PASSWORD, stored)
        assert conn.execute("SELECT token_hash FROM auth_sessions").fetchone()[0] == auth.token_hash(token)
    with TestClient(main.app, cookies={auth.COOKIE_NAME: token}) as returning_browser:
        assert returning_browser.get("/auth/me").json() == response.json()
    assert response.headers["cache-control"] == "no-store"


def test_login_rotates_session_and_logout_revokes_it(client):
    signup(client)
    old_token = client.cookies.get(auth.COOKIE_NAME)
    response = client.post("/auth/login", json={"email": "LEARNER@example.com", "password": PASSWORD})
    assert response.status_code == 200
    token = client.cookies.get(auth.COOKIE_NAME)
    assert token != old_token
    with TestClient(main.app, cookies={auth.COOKIE_NAME: old_token}) as replay:
        assert replay.get("/auth/me").status_code == 401
    assert client.post("/auth/logout").status_code == 204
    assert client.get("/auth/me").status_code == 401
    with TestClient(main.app, cookies={auth.COOKIE_NAME: token}) as replay:
        assert replay.get("/auth/me").status_code == 401
    assert client.post("/auth/logout").status_code == 204


def test_expired_and_tampered_cookies_are_rejected(client):
    signup(client)
    with closing(database.get_connection()) as conn, conn:
        conn.execute("UPDATE auth_sessions SET expires_at = ?", (int(time.time()) - 1,))
    assert client.get("/auth/me").status_code == 401
    client.cookies.clear()
    client.cookies.set(auth.COOKIE_NAME, "forged-user-1")
    assert client.get("/auth/me").status_code == 401


def test_bad_credentials_do_not_reveal_account_existence(client):
    signup(client)
    client.post("/auth/logout")
    existing = client.post("/auth/login", json={"email": "learner@example.com", "password": "wrong password"})
    missing = client.post("/auth/login", json={"email": "missing@example.com", "password": PASSWORD})
    assert existing.status_code == missing.status_code == 401
    assert existing.json() == missing.json()
    assert auth.COOKIE_NAME not in client.cookies


@pytest.mark.parametrize("password", ["abc", "x" * 16, ""])
def test_signup_password_validation_does_not_echo_password(client, password):
    result = client.post("/auth/signup", json={"email": "learner@example.com", "password": password})
    assert result.status_code == 422
    assert all("input" not in error for error in result.json()["detail"])


@pytest.mark.parametrize("password", ["abcd", "x" * 15])
def test_signup_accepts_password_length_boundaries(client, password):
    credentials = {"email": "learner@example.com", "password": password}
    assert client.post("/auth/signup", json=credentials).status_code == 201
    client.post("/auth/logout")
    assert client.post("/auth/login", json=credentials).status_code == 200


def test_existing_longer_password_can_still_log_in(client):
    password = "a previously valid long passphrase"
    with closing(database.get_connection()) as conn, conn:
        conn.execute("INSERT INTO users (email, password_hash) VALUES (?, ?)",
                     ("existing@example.com", auth.hash_password(password)))
    assert client.post("/auth/login", json={"email": "existing@example.com", "password": password}).status_code == 200


def test_duplicate_signup_never_logs_in_or_claims_legacy_account(client):
    signup(client)
    client.post("/auth/logout")
    result = client.post("/auth/signup", json={"email": "LEARNER@example.com", "password": PASSWORD})
    assert result.status_code == 409
    assert auth.COOKIE_NAME not in client.cookies
    with closing(database.get_connection()) as conn, conn:
        conn.execute("INSERT INTO users (email) VALUES ('legacy@example.com')")
    assert client.post("/auth/signup", json={"email": "legacy@example.com", "password": PASSWORD}).status_code == 409
    assert client.post("/auth/login", json={"email": "legacy@example.com", "password": PASSWORD}).status_code == 401
    assert client.get("/users?email=legacy@example.com").status_code != 200
    assert client.post("/users", json={"email": "other@example.com"}).status_code != 201


def test_csrf_and_cors(client):
    signup(client)
    assert client.post("/auth/logout", headers={"Origin": "https://attacker.example"}).status_code == 403
    assert client.post("/auth/logout", headers={"Sec-Fetch-Site": "cross-site"}).status_code == 403
    del client.headers["X-Mindpace-Request"]
    assert client.post("/auth/logout").status_code == 403
    assert client.post("/auth/login", json={"email": "learner@example.com", "password": PASSWORD}).status_code == 403
    assert client.get("/auth/me").status_code == 200
    preflight = {"Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "X-Mindpace-Request,Content-Type"}
    result = client.options("/auth/login", headers=preflight)
    assert result.status_code == 200
    assert result.headers["access-control-allow-credentials"] == "true"
    preflight["Origin"] = "https://attacker.example"
    assert client.options("/auth/login", headers=preflight).status_code == 400


def test_production_cookie_attributes(client, monkeypatch):
    monkeypatch.setattr(auth, "PRODUCTION", True)
    monkeypatch.setattr(auth, "COOKIE_NAME", "__Host-mindpace_session")
    cookie = signup(client).headers["set-cookie"]
    assert cookie.startswith("__Host-mindpace_session=") and "Secure" in cookie
    assert "HttpOnly" in cookie and "Domain=" not in cookie


def test_throttling_is_shared_across_clients(client):
    for _ in range(10):
        assert client.post("/auth/login", json={"email": "missing@example.com", "password": PASSWORD}).status_code == 401
    with TestClient(main.app, headers=HEADERS) as another_client:
        result = another_client.post("/auth/login", json={"email": "MISSING@example.com", "password": PASSWORD})
    assert result.status_code == 429 and int(result.headers["retry-after"]) > 0
    with closing(database.get_connection()) as conn, conn:
        conn.execute("UPDATE auth_attempts SET expires_at = 0")
    assert client.post("/auth/login", json={"email": "missing@example.com", "password": PASSWORD}).status_code == 401


def test_private_resources_require_auth_and_ownership(client, monkeypatch):
    assert client.get("/questions").status_code == 401
    assert client.post("/questions/generate", json={"topic": "test"}).status_code == 401
    alice = signup(client).json()["user_id"]
    session = client.post("/sessions", json={"user_id": alice}).json()["session_id"]
    question = client.post("/questions", json={"topic": "private", "prompt_text": "secret", "correct_answer": "A"}).json()["question_id"]
    response = client.post("/responses", json={"session_id": session, "question_id": question, "answer_text": "A", "confidence": 0.8})
    assert response.status_code == 201, response.text
    response_id = response.json()["response_id"]
    doc = client.post(f"/documents?user_id={alice}", files={"file": ("private.txt", b"Private notes", "text/plain")})
    assert doc.status_code == 201, doc.text
    doc_id = doc.json()["document_id"]
    assert client.get(f"/documents/{doc_id}").status_code == 200
    signup(client, "bob@example.com")
    bob = client.get("/auth/me").json()["user_id"]
    bob_session = client.post("/sessions", json={"user_id": bob}).json()["session_id"]
    for path in [f"/users/{alice}", f"/sessions/{session}", f"/responses/{response_id}", f"/documents/{doc_id}", f"/documents?user_id={alice}", f"/calibration/{alice}", f"/calibration/{alice}/trend", f"/learning-state/{alice}", f"/review/{alice}", f"/journal-entries?user_id={alice}", f"/questions/{question}"]:
        assert client.get(path).status_code == 404, path
    assert client.get("/questions").json() == []
    for path, body in [
        ("/sessions", {"user_id": alice}),
        (f"/sessions/{session}/end", {}),
        (f"/calibration/{alice}/compute", {}),
        (f"/documents/{doc_id}/generate", {}),
        (f"/questions/{question}/reframe", {}),
        ("/questions", {"topic": "x", "prompt_text": "x", "parent_question_id": question}),
        ("/journal-entries", {"session_id": session, "entry_text": "secret"}),
        ("/assistant", {"session_id": session, "message": "reveal context"}),
        ("/responses", {"session_id": session, "question_id": question, "confidence": 0.5, "answer_text": "A"}),
        ("/responses", {"session_id": bob_session, "question_id": question, "confidence": 0.5, "answer_text": "A"}),
    ]:
        assert client.post(path, json=body).status_code == 404, path
    assert client.post(f"/documents?user_id={alice}", files={"file": ("x.txt", b"x")}).status_code == 404


def test_generation_and_seeded_question_access(client, monkeypatch):
    user_id = signup(client).json()["user_id"]
    generated = {"prompt_text": "A question?", "options": ["A", "B"], "correct_answer": "A", "difficulty": 1}
    monkeypatch.setattr(main, "generate_mcqs", lambda *args: [generated])
    monkeypatch.setattr(main, "generate_question_variant", lambda *args: generated)
    monkeypatch.setattr(main, "generate_mcqs_from_document", lambda *args, **kwargs: [generated])
    result = client.post("/questions/generate", json={"topic": "test"})
    assert result.status_code == 201, result.text
    question_id = result.json()[0]["question_id"]
    assert client.post(f"/questions/{question_id}/reframe").status_code == 201
    doc = client.post(f"/documents?user_id={user_id}", files={"file": ("doc.txt", b"My notes")}).json()
    assert client.post(f"/documents/{doc['document_id']}/generate").status_code == 201
    with closing(database.get_connection()) as conn, conn:
        assert all(row[0] == user_id for row in conn.execute("SELECT owner_user_id FROM questions"))
        conn.execute("INSERT INTO questions (topic, prompt_text) VALUES ('seeded', 'Shared question')")
    signup(client, "second@example.com")
    assert len(client.get("/questions").json()) == 1
    assert client.get("/questions?topic=test").json() == []


def test_legacy_schema_migration_preserves_data(tmp_path, monkeypatch):
    path = tmp_path / "legacy.db"
    monkeypatch.setattr(database, "DB_PATH", path)
    with sqlite3.connect(path) as conn:
        conn.execute("CREATE TABLE users (user_id INTEGER PRIMARY KEY, email TEXT UNIQUE, created_at TEXT DEFAULT CURRENT_TIMESTAMP)")
        conn.execute("INSERT INTO users (email) VALUES ('legacy@example.com')")
    database.init_db()
    database.init_db()
    with closing(database.get_connection()) as conn:
        assert conn.execute("SELECT email, password_hash FROM users").fetchone()["password_hash"] is None
        assert conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 1
