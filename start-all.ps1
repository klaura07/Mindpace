# Start both services without virtual-environment activation or shell policy changes.
$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$pythonPath = Join-Path $projectRoot 'backend\venv\Scripts\python.exe'
$vitePath = Join-Path $projectRoot 'frontend\node_modules\vite\bin\vite.js'
if (!(Test-Path -LiteralPath $pythonPath)) {
    throw 'Missing backend virtual environment. Run: cd backend; python -m venv venv; .\venv\Scripts\python.exe -m pip install -r requirements.txt'
}
if (!(Test-Path -LiteralPath $vitePath)) {
    throw 'Missing frontend dependencies. Run npm.cmd install in frontend.'
}
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source

# Bypass system HTTP proxies for these local readiness checks.
function Test-LocalService([string]$Url, [string]$Expected) {
    try {
        $request = [System.Net.HttpWebRequest]::Create($Url)
        $request.Proxy = $null
        $request.Timeout = 1500
        $response = $request.GetResponse()
        try {
            $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
            try { return $reader.ReadToEnd().Contains($Expected) }
            finally { $reader.Dispose() }
        } finally { $response.Dispose() }
    } catch { return $false }
}

function Wait-LocalService([string]$Url, [string]$Expected, $Process, [string]$LogPath) {
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        if (Test-LocalService $Url $Expected) { return }
        if ($Process.HasExited) { throw "Server exited. Check $LogPath" }
        Start-Sleep -Milliseconds 500
    }
    throw "Server did not become ready at $Url. Check $LogPath"
}

if (!(Test-LocalService 'http://127.0.0.1:8000/health' '"status":"ok"')) {
    $backendLog = Join-Path $projectRoot 'backend\server-error.log'
    $backendProcess = Start-Process -FilePath $pythonPath -ArgumentList '-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000' -WorkingDirectory (Join-Path $projectRoot 'backend') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $projectRoot 'backend\server.log') -RedirectStandardError $backendLog -PassThru
    Wait-LocalService 'http://127.0.0.1:8000/health' '"status":"ok"' $backendProcess $backendLog
    Write-Host "Backend started (PID $($backendProcess.Id))."
}

if (!(Test-LocalService 'http://localhost:5173/@vite/client' 'vite')) {
    $frontendLog = Join-Path $projectRoot 'frontend\server-error.log'
    $frontendProcess = Start-Process -FilePath $nodePath -ArgumentList "`"$vitePath`"" -WorkingDirectory (Join-Path $projectRoot 'frontend') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $projectRoot 'frontend\server.log') -RedirectStandardError $frontendLog -PassThru
    Wait-LocalService 'http://localhost:5173/@vite/client' 'vite' $frontendProcess $frontendLog
    Write-Host "Frontend started (PID $($frontendProcess.Id))."
}
if (!(Test-LocalService 'http://localhost:5173/api/health' '"status":"ok"')) {
    throw 'Frontend cannot reach the backend. Check frontend\server-error.log and backend\server-error.log.'
}
Write-Host 'MindPace is ready: http://localhost:5173'
Write-Host 'Services run in the background. Logs: backend\server*.log and frontend\server*.log.'
