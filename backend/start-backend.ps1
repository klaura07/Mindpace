# Starts the MindPace backend (FastAPI via uvicorn) for local development.
Set-Location "$PSScriptRoot"
& .\venv\Scripts\Activate.ps1
uvicorn app.main:app --reload
