# Portable local PostgreSQL helper.  Usage:  powershell -File D:\CRP\tools\pg.ps1 init|start|stop|status
param([Parameter(Mandatory = $true)][ValidateSet('init', 'start', 'stop', 'status')][string]$cmd)
$root = 'D:\CRP'
$bin  = "$root\tools\pgsql\bin"
$data = "$root\database\pgdata"
$log  = "$root\database\pg.log"
switch ($cmd) {
    'init' {
        if (Test-Path "$data\PG_VERSION") { Write-Output 'already initialised'; break }
        $pw = "$root\tools\_pwfile"; Set-Content $pw 'postgres' -NoNewline
        & "$bin\initdb.exe" -D $data -U postgres --pwfile=$pw -E UTF8 --locale=C -A scram-sha-256
        Remove-Item $pw
        Add-Content "$data\postgresql.conf" "`nlisten_addresses = 'localhost'`nport = 5432"
    }
    'start'  { Start-Process -FilePath "$bin\pg_ctl.exe" -ArgumentList '-D', $data, '-l', $log, '-w', 'start' -NoNewWindow -Wait -RedirectStandardOutput "$root\tools\_pgstart.txt" }
    'stop'   { & "$bin\pg_ctl.exe" -D $data -m fast stop }
    'status' { & "$bin\pg_ctl.exe" -D $data status }
}

