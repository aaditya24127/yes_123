# Starts everything for local use: PostgreSQL, API (port 8000) and the web app (port 3000).
#   powershell -File D:\CRP\start.ps1        then open http://localhost:3000
$root = 'D:\CRP'
if (-not (Test-NetConnection localhost -Port 5432 -WarningAction SilentlyContinue).TcpTestSucceeded) { & powershell -NoProfile -File "$root\tools\pg.ps1" start }
Start-Process python -ArgumentList '-W', 'ignore', '-m', 'uvicorn', 'app.main:app', '--port', '8000' -WorkingDirectory "$root\backend" -WindowStyle Hidden
Start-Process cmd.exe -ArgumentList '/c', 'npm run dev' -WorkingDirectory "$root\frontend" -WindowStyle Hidden
Write-Output 'Starting... open http://localhost:3000 in about 10 seconds.'
