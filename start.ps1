# Starts everything for local use: PostgreSQL, API (port 8000) and the web app (port 3000).
#   powershell -File start.ps1        (from the project folder, wherever it lives) then open http://localhost:3000
$root = $PSScriptRoot
if (-not (Test-NetConnection localhost -Port 5432 -WarningAction SilentlyContinue).TcpTestSucceeded) { & powershell -NoProfile -File "$root\tools\pg.ps1" start }
# Use the project's own Python environment when it exists (see backend\README.md), otherwise the system Python.
$py = if (Test-Path "$root\backend\.venv\Scripts\python.exe") { "$root\backend\.venv\Scripts\python.exe" } else { 'python' }
Start-Process $py -ArgumentList '-W', 'ignore', '-m', 'uvicorn', 'app.main:app', '--port', '8000' -WorkingDirectory "$root\backend" -WindowStyle Hidden
Start-Process cmd.exe -ArgumentList '/c', 'npm run dev' -WorkingDirectory "$root\frontend" -WindowStyle Hidden
Start-Process cmd.exe -ArgumentList '/c', 'npm run dev' -WorkingDirectory "$root\landing" -WindowStyle Hidden
Start-Process cmd.exe -ArgumentList '/c', 'npm run dev' -WorkingDirectory "$root\teacher-app" -WindowStyle Hidden
Write-Output 'Starting... open http://localhost:5173 (landing page) in about 10 seconds; the CRP app is at http://localhost:3000 and the teacher app at http://localhost:3001.'
