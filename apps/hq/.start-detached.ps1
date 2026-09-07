# Detached local HQ console — survives agent sessions and terminals.
# Serves the last production build (build with `pnpm build` in apps/hq; the
# git-ignored .env.local bakes the local org id + API URL at build time).
$root = "C:\Users\Tim\Downloads\KellyBet-Fresh\plumbtrack-workspac"
$hq   = Join-Path $root "apps\hq"
Start-Process -WindowStyle Hidden -FilePath "pnpm.cmd" `
  -ArgumentList "exec", "next", "start", "-p", "3200" `
  -WorkingDirectory $hq `
  -RedirectStandardOutput (Join-Path $hq ".local-hq.log") `
  -RedirectStandardError  (Join-Path $hq ".local-hq.err.log")
Write-Output "HQ starting detached on :3200 (logs: apps\hq\.local-hq.log)"
