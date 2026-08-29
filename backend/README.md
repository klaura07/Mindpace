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
live, clickable tester for every endpoint from the code alone. Try
`POST /users` there before writing any frontend code against it.

Each time you open a new terminal to work on this project, you need to
re-run `venv\Scripts\activate` first (you'll see `(venv)` appear in your
prompt when it's active).

## What's here so far

- `db/schema.sql` — the 8-table schema
- `app/database.py` — SQLite connection + startup init
- `app/models.py` — request/response validation
- `app/main.py` — the app itself: `/health`, `POST /users`, `GET /users/{id}`

`mindpace.db` is created automatically the first time you run the
server — it's not in this zip.
