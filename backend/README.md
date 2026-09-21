# MindPace backend — setup (Windows / PowerShell)

```powershell
cd backend

# Create an isolated Python environment so these packages don't pollute
# your global Python install
python -m venv venv
venv\Scripts\activate

pip install -r requirements.txt

# Runs on http://127.0.0.1:8000 and auto-restarts when you edit code
uvicorn app.main:app --reload
```

Then open **http://127.0.0.1:8000/docs** in a browser — FastAPI builds a
live, clickable tester for every endpoint from the code alone.

Each time you open a new terminal to work on this project, you need to
re-run `venv\Scripts\activate` first (you'll see `(venv)` appear in your
prompt when it's active).

## What's here so far

- `db/schema.sql` — the 8-table schema
- `app/database.py` — SQLite connection + startup init
- `app/models.py` — request/response validation
- `app/main.py` — authenticated application endpoints
- `app/auth.py` — password signup/login, cookie sessions, CSRF and login throttling

`mindpace.db` is created automatically the first time you run the
server — it's not in this zip.

## Gemini configuration

Set `GOOGLE_API_KEY` in `backend/.env`. Optional `GEMINI_MODEL` selects the
primary model (default `gemini-3.6-flash`). Temporary upstream errors are retried
after one second, then after two seconds using `GEMINI_FALLBACK_MODEL` (default
`gemini-3.5-flash`). There are at most three attempts per generation call.
Set `GEMINI_FALLBACK_MODEL=` to retry only the primary model. Restart the backend
after changing these settings. Invalid keys and quota errors are not retried.

## Authentication

Signup requires an email and a 4–15 character password. Passwords are salted
and hashed with PBKDF2-HMAC-SHA256 (600,000 iterations). Login issues an opaque
HttpOnly, SameSite=Lax cookie valid for seven days; only its SHA-256 digest is
stored in SQLite. Login rotates the current cookie and logout revokes it.
User IDs in API payloads are checked against the authenticated account.
New questions are private to their creator; seeded questions remain shared.

Endpoints: `POST /auth/signup`, `POST /auth/login`, `GET /auth/me`, and
`POST /auth/logout`. All modifying requests, including signup/login, require
`X-Mindpace-Request: 1`. Browser origins must be explicitly allowed. Email-only
`GET /users` and `POST /users` have been removed.

The frontend uses `/api` by default. Vite proxies this to the local backend so
cookies work whether you open the site on localhost or 127.0.0.1. Restart Vite
after changing its configuration.

For production, add these values to `backend/.env` and restart the backend:

```dotenv
APP_ENV=production
AUTH_ALLOWED_ORIGINS=https://your-website.example
```

Serve the site over HTTPS and proxy `/api/*` to the backend, stripping `/api`.
Production cookies use Secure and the `__Host-` prefix. Keep the API on the same
site; if using a separate API subdomain, set `VITE_API_BASE` at frontend build
time and retain the explicit website origin above. Do not use unrelated domains.
The proxy should forward Origin and Set-Cookie unchanged. Configure trusted proxy
IPs in Uvicorn if forwarding client IPs; never trust arbitrary forwarded headers.
Login/signup are limited in SQLite to 10 attempts per normalized email and 30
per client IP per 15 minutes, shared by workers using the same database.

Startup applies additive migrations. Existing accounts without password hashes
remain locked: do not assign a password based only on someone knowing the email.
There is no email verification/recovery service configured in this project.
After independently verifying an existing account owner, an operator can set a
hash using `app.auth.hash_password` and revoke that user's `auth_sessions`.
Existing questions have no creator provenance and remain shared; review any old
document-generated question data before making an existing deployment public.

Run the regression suite with `python -m pytest tests -q`. Tests use temporary
databases and mocked AI calls; they do not modify application data.

References: [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
and [CSRF custom headers](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html#employing-custom-request-headers-for-ajaxapi).
