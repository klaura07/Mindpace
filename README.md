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

## Choose how to learn

Start on **Upload** with a PDF, DOCX, TXT, or a concept name. Saving material
immediately offers **Dive In** and **Keep me company**. The saved library offers
the same choices. Saving a concept or opening Study time does not call Gemini.
Use the **×** button at the top-right of a concept and confirm to remove it from view. This persists
after refresh and keeps saved answers; entering the concept again restores it.

**Dive In** opens the separate **Questions** page. It creates five conceptual
questions about applying principles, explaining cause and effect, comparing
scenarios, and diagnosing misconceptions. Each answer includes a reasoning
explanation, shown after submission. Questions have no timers or response-time
tracking. Confidence and correctness guide question selection and scheduled
review. Flashcards have been removed from the interface and new submissions.

Question generation uses structured output without Google Search grounding.
It uses the configured Gemini API key and remains subject to its free quota;
the application does not enable billing. Generation failures offer a retry.
Saved conceptual banks are reused. Older banks without explanations are upgraded
on the next Dive In; the old questions and response history remain in the database.
Empty/unreadable files and malformed generated questions are rejected.

**Keep me company** opens **Study time** for independent reading and learning.
It has a 25-minute Pomodoro timer, 5-minute breaks, and a 15-minute break after
every fourth focus block. Each new phase waits for the learner to start it.
Uploaded document text can be opened in the room. There are no questions here,
and the timer works without a Gemini request or a selected material.

Question progress and the focus timer are saved separately across navigation
and refresh in the same browser tab. Reviews reuse saved questions. Dashboard
analytics show question attempts, accuracy, and confidence. Historical timing
and recall records are preserved, but the current question UI does not collect them.

The room has an animated companion, rain, steam, and plants. Animations remain
running without a Motion button. **Play rain sound** loops the supplied
`dragon-studio-rain-444805.mp3`, served as `frontend/public/audio/rain.mp3`.
It starts only on request, has a volume control, and stops when leaving Study time.

The fullscreen icon opens only the study room and timer, hiding material,
music panels, and navigation. Fullscreen does not scroll; an **Esc to exit**
hint appears on entry. Escape or the exit icon restores the normal page.

The Spotify icon connects each learner's own account using OAuth with PKCE,
then lets them choose their playlists or saved songs. There is no preset Spotify
rain playlist. Selected music uses Spotify's embedded player, with an Open in
Spotify link when fuller playback is needed. Spotify may limit embedded playback
to previews. Rain audio and the timer remain independent of Spotify.

Dashboard, Upload, Questions, Review, and Activities use matching animated
doodle scenes and responsive layouts.

## Spotify setup

In the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard),
create a Web API app and register this exact redirect URI:
`http://127.0.0.1:5173/spotify-callback.html`.
Set `SPOTIFY_CLIENT_ID` and `SPOTIFY_REDIRECT_URI` in `backend/.env`, then restart
the backend. No Client Secret is needed. The provided Client ID is configured locally.
Vite binds to 127.0.0.1 so Spotify's numeric-loopback callback works; localhost
continues to work for the app. For a deployment, register an HTTPS callback
at the same site's `/spotify-callback.html` path.

Each learner connects through the Spotify icon and approves access in Spotify's
own window. Add allowed test accounts under the developer app's user management.
Spotify currently requires a Premium app owner and limits development access to
five approved accounts. The owner's Premium account does not grant Premium to
other users. See [Spotify quotas](https://developer.spotify.com/documentation/web-api/concepts/quota-modes).

Tokens stay in server memory, bound to the learner's current MindPace login.
They are never returned to the frontend or stored in the project database.
Restarting the backend or starting a new MindPace login requires reconnecting.
This local implementation uses a single backend process. Disconnect Spotify
removes its tokens and stops the selected player in the current page.

The Activities tab is reserved for games chosen by the project owner. The sand
game is removed. Personal Spotify music is available in Study time.

Validation: `cd backend; .\venv\Scripts\python.exe -m pytest tests -q`.
For the frontend, run `npm.cmd run build`, `npm.cmd run lint`, and
`node --test --test-isolation=none src/study/*.test.js` from `frontend`.

Study control regression checks: with the frontend running on port 5173,
run `npm.cmd run test:study-controls` from `frontend`. This requires Playwright
and Microsoft Edge; `PLAYWRIGHT_MODULE` can point to an existing Playwright
installation. The checks use isolated API fixtures, including failed requests,
and never modify the learner's database.
`npm.cmd run test:study-motion` checks actual rendered motion on desktop/mobile, with both system motion preferences, plus persistence after refresh. It uses the same Playwright setup.
`npm.cmd run test:doodle-tabs` checks Dashboard analytics/upload, the document
library and independent learning paths, Review answers, assistant controls, shared motion,
and responsive layouts using isolated API fixtures.

`npm.cmd run test:question-banks` checks the two learning paths, failed-request
retries, saved question progress, explanations, and the absence of question timing.

`node tests/spotify-music.mjs` exercises the popup callback, connection retries,
library selection, fullscreen visibility, and disconnect using mocked Spotify API calls.
