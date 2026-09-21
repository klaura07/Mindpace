"""Password authentication and revocable, server-side browser sessions."""
import hashlib
import hmac
import os
import secrets
import time
from contextlib import closing

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, Request, Response

from app.database import get_connection
from app.models import UserCreate, UserLogin, UserOut

load_dotenv()
PRODUCTION = os.getenv("APP_ENV", "development").lower() == "production"
COOKIE_NAME = "__Host-mindpace_session" if PRODUCTION else "mindpace_session"
SESSION_SECONDS = 7 * 24 * 60 * 60
ALLOWED_ORIGINS = [origin.strip().rstrip("/") for origin in os.getenv(
    "AUTH_ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
).split(",") if origin.strip()]
if "*" in ALLOWED_ORIGINS or (PRODUCTION and (
    not ALLOWED_ORIGINS or any(not origin.startswith("https://") for origin in ALLOWED_ORIGINS)
)):
    raise RuntimeError("Set AUTH_ALLOWED_ORIGINS to explicit HTTPS website origins in production")

router = APIRouter(prefix="/auth", tags=["auth"])


def hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), 600_000)
    return f"pbkdf2_sha256$600000${salt}${digest.hex()}"


DUMMY_HASH = hash_password(secrets.token_urlsafe(32))


def verify_password(password: str, stored: str | None) -> bool:
    encoded = stored or DUMMY_HASH
    try:
        algorithm, iterations, salt, expected = encoded.split("$")
        if algorithm != "pbkdf2_sha256" or iterations != "600000":
            return False
        actual = hash_password(password, salt).rsplit("$", 1)[1]
        return hmac.compare_digest(actual, expected) and stored is not None
    except (ValueError, TypeError):
        return False


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def check_csrf(request: Request) -> None:
    if request.method in {"GET", "HEAD", "OPTIONS"}:
        return
    # A custom header forces browser preflight; CORS permits only our origins.
    origin = request.headers.get("origin")
    if (request.headers.get("x-mindpace-request") != "1"
            or (origin is not None and origin not in ALLOWED_ORIGINS)
            or request.headers.get("sec-fetch-site") == "cross-site"):
        raise HTTPException(403, "Request origin could not be verified")


def current_user(request: Request) -> dict:
    token = request.cookies.get(COOKIE_NAME, "")
    if not token or len(token) > 128:
        raise HTTPException(401, "Please log in to continue")
    with closing(get_connection()) as conn:
        row = conn.execute(
            """SELECT u.user_id, u.email, u.created_at FROM auth_sessions a
               JOIN users u ON u.user_id = a.user_id
               WHERE a.token_hash = ? AND a.expires_at > ?""",
            (token_hash(token), int(time.time())),
        ).fetchone()
    if row is None:
        raise HTTPException(401, "Your session has expired. Please log in again")
    return dict(row)


def require_auth(request: Request) -> None:
    check_csrf(request)
    if request.url.path in {"/health", "/auth/signup", "/auth/login", "/auth/logout"}:
        return
    request.state.user = current_user(request)


def require_owner(user: dict, user_id: int) -> None:
    if user["user_id"] != user_id:
        raise HTTPException(404, "Resource not found")


def require_session_owner(user: dict, session_id: int) -> None:
    with closing(get_connection()) as conn:
        row = conn.execute("SELECT user_id FROM sessions WHERE session_id = ?", (session_id,)).fetchone()
    if row is None:
        raise HTTPException(404, "Session not found")
    require_owner(user, row["user_id"])


def require_question_access(user: dict, question_id: int) -> None:
    with closing(get_connection()) as conn:
        row = conn.execute("SELECT owner_user_id FROM questions WHERE question_id = ?", (question_id,)).fetchone()
    if row is None:
        raise HTTPException(404, "Question not found")
    if row["owner_user_id"] is not None:
        require_owner(user, row["owner_user_id"])


def throttle(request: Request, email: str) -> None:
    now = int(time.time())
    keys = [(f"ip:{request.client.host if request.client else 'unknown'}", 30),
            (f"email:{email}", 10)]
    # SQLite makes limits shared across workers and restarts. No raw emails/IPs stored.
    with closing(get_connection()) as conn, conn:
        conn.execute("BEGIN IMMEDIATE")
        conn.execute("DELETE FROM auth_attempts WHERE expires_at <= ?", (now,))
        for key, limit in keys:
            row = conn.execute("SELECT hits, expires_at FROM auth_attempts WHERE key_hash = ?", (token_hash(key),)).fetchone()
            if row and row["hits"] >= limit:
                raise HTTPException(429, "Too many attempts. Please try again later", headers={"Retry-After": str(row["expires_at"] - now)})
        for key, _ in keys:
            conn.execute("""INSERT INTO auth_attempts (key_hash, hits, expires_at) VALUES (?, 1, ?)
                            ON CONFLICT(key_hash) DO UPDATE SET hits = hits + 1""", (token_hash(key), now + 900))


def issue_session(conn, user_id: int, request: Request, response: Response) -> None:
    token = secrets.token_urlsafe(32)
    now = int(time.time())
    conn.execute("DELETE FROM auth_sessions WHERE expires_at <= ? OR token_hash = ?",
                 (now, token_hash(request.cookies.get(COOKIE_NAME, ""))))
    conn.execute("INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
                 (token_hash(token), user_id, now + SESSION_SECONDS))
    response.set_cookie(COOKIE_NAME, token, max_age=SESSION_SECONDS, httponly=True,
                        secure=PRODUCTION, samesite="lax", path="/")


@router.post("/signup", response_model=UserOut, status_code=201)
def signup(credentials: UserCreate, request: Request, response: Response):
    email = str(credentials.email)
    throttle(request, email)
    password_hash = hash_password(credentials.password.get_secret_value())
    with closing(get_connection()) as conn, conn:
        conn.execute("BEGIN IMMEDIATE")
        if conn.execute("SELECT 1 FROM users WHERE lower(trim(email)) = ?", (email,)).fetchone():
            raise HTTPException(409, "Unable to create an account with these details. Try logging in")
        cursor = conn.execute("INSERT INTO users (email, password_hash) VALUES (?, ?)", (email, password_hash))
        issue_session(conn, cursor.lastrowid, request, response)
        return dict(conn.execute("SELECT user_id, email, created_at FROM users WHERE user_id = ?", (cursor.lastrowid,)).fetchone())


@router.post("/login", response_model=UserOut)
def login(credentials: UserLogin, request: Request, response: Response):
    throttle(request, str(credentials.email))
    with closing(get_connection()) as conn:
        rows = conn.execute("SELECT * FROM users WHERE lower(trim(email)) = ?", (str(credentials.email),)).fetchall()
        row = rows[0] if len(rows) == 1 else None
        valid = verify_password(credentials.password.get_secret_value(), row["password_hash"] if row else None)
        if not valid:
            raise HTTPException(401, "Invalid email or password")
        with conn:
            issue_session(conn, row["user_id"], request, response)
        return dict(row)


@router.get("/me", response_model=UserOut)
def me(user: dict = Depends(current_user)):
    return user


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response):
    with closing(get_connection()) as conn, conn:
        conn.execute("DELETE FROM auth_sessions WHERE token_hash = ?", (token_hash(request.cookies.get(COOKIE_NAME, "")),))
    response.delete_cookie(COOKIE_NAME, path="/", httponly=True, secure=PRODUCTION, samesite="lax")
