# MindPace

## Run locally on Windows

Install dependencies once from the project folder:

```powershell
python -m venv backend\venv
.\backend\venv\Scripts\python.exe -m pip install -r backend\requirements.txt
cd frontend
npm.cmd install
cd ..
```

Start both services:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\start-all.ps1
```

Open http://localhost:5173. The launcher checks the backend and frontend proxy
before reporting success, and reuses services already running. Services run in
the background; their process IDs are printed when started. To stop a service,
run `Stop-Process -Id <printed-process-id>` in PowerShell. Restart the backend
after changing Python code.

## Sign-in connection errors

A 502 during sign-in means the request could not be completed through the server
connection. Run the launcher above, then reload http://localhost:5173. The frontend
uses port 5173 because that origin is allowed by the backend; it now reports a
port conflict instead of silently switching ports. If another application owns
that port, close that application before starting MindPace.

Check http://localhost:5173/api/health: it should return `{"status":"ok"}`.
Startup errors are recorded in `backend/server-error.log` and
`frontend/server-error.log`. Standard output is in each folder's `server.log`.

Gemini features separately require `GOOGLE_API_KEY` in `backend/.env`.
Signing in does not require an AI API key.

## Adaptive study foundation

The sidebar now opens **Study time**. Choose an uploaded document and practice
with scored questions or flashcards. Flashcards reuse each generated question
and answer; their recall ratings are self-reported and shown separately in analytics.
Document generation produces questions only, with no summaries or revision notes.

Study time uses 25-minute focus blocks, 5-minute breaks, and a 15-minute break
after every fourth completed focus block. Breaks and the next focus block wait
for the learner to start them. Pause/resume, question progress, and the timer
survive navigation and refresh in the same browser tab. Answer timing excludes
hidden tabs, pauses, feedback, answer reveal, and network waits.

The adaptive rules in `backend/app/adaptive.py` combine correctness, confidence,
and personal response-time baselines. Due and missed questions get priority;
three confident correct attempts raise the target difficulty, misses lower it,
and uncertain correct answers stay at the same level. The next question is the
closest available match in the document's existing bank, without repeats in a
session. High-confidence or unusually quick misses return for review in one day;
other misses and uncertain correct answers in two days. Confident review success
expands the interval. These are adjustable initial rules, not a diagnosis of attention.

Pace needs five earlier attempts in the same mode and at the same difficulty.
Analytics use the latest 200 attempts per mode, with up to 30 attempts per trend.
New responses update analytics immediately; opening the dashboard does not award XP
or create artificial calibration checkpoints. Existing data is retained by additive migrations.

The Activities tab is reserved for games chosen by the project owner. The sand
game is removed. Visual redesign and background music await the owner's references.

Validation: `cd backend; .\venv\Scripts\python.exe -m pytest tests -q`.
For the frontend, run `npm.cmd run build`, `npm.cmd run lint`, and
`node --test --test-isolation=none src/study/*.test.js` from `frontend`.
