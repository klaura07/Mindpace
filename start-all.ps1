# Launches the MindPace backend and frontend, each in its own PowerShell
# window that stays open after the process exits/is Ctrl+C'd, so you can
# read logs and shut them down independently.
$root = $PSScriptRoot

Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\backend'; .\venv\Scripts\Activate.ps1; uvicorn app.main:app --reload"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\frontend'; npm run dev"
