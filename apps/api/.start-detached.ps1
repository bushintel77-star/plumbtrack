# Detached local API for PlumbTrack — survives agent sessions and terminals.
# Sets DATABASE_URL from apps/api/.env (beats the machine-global kellybet env)
# and runs the API hidden with logs beside it.
$root = "C:\Users\Tim\Downloads\KellyBet-Fresh\plumbtrack-workspac"
$api  = Join-Path $root "apps\api"
$line = (Get-Content (Join-Path $api ".env") | Select-String "^DATABASE_URL=") -replace "^DATABASE_URL=", ""
$env:DATABASE_URL = $line.Trim().Trim('"')
Start-Process -WindowStyle Hidden -FilePath "pnpm.cmd" `
  -ArgumentList "exec", "tsx", "--env-file=.env", "src/index.ts" `
  -WorkingDirectory $api `
  -RedirectStandardOutput (Join-Path $api ".local-api.log") `
  -RedirectStandardError  (Join-Path $api ".local-api.err.log")
Write-Output "API starting detached (logs: apps\api\.local-api.log)"
