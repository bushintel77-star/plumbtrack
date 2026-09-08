Get-Process node -ErrorAction SilentlyContinue | ForEach-Object {
  $p = $_
  try {
    foreach ($m in $p.Modules) {
      if ($m.FileName -match 'query_engine|\.prisma') {
        Write-Output ("HOLDER PID=" + $p.Id + " START=" + $p.StartTime + " DLL=" + $m.FileName)
        break
      }
    }
  } catch {
    # modules not accessible for this process
  }
}
Write-Output "DONE"
