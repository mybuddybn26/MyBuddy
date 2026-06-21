$root = Split-Path -Parent $PSScriptRoot

Write-Host "Starting MyBuddy dev servers..." -ForegroundColor Magenta
Write-Host "  Fastify → http://localhost:3000" -ForegroundColor Green
Write-Host "  Vitejs  → http://localhost:5173" -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop.`n" -ForegroundColor Yellow

$fastifyJob = Start-Job -Name "fastify-dev" -ScriptBlock {
  Set-Location (Join-Path $using:root "fastify")
  pnpm dev 2>&1 | ForEach-Object { "[fastify] $_" }
}

$vitejsJob = Start-Job -Name "vitejs-dev" -ScriptBlock {
  Set-Location (Join-Path $using:root "vitejs")
  pnpm dev 2>&1 | ForEach-Object { "[vitejs] $_" }
}

try {
  while ($fastifyJob.State -ne 'Completed' -or $vitejsJob.State -ne 'Completed') {
    $output = Receive-Job -Job $fastifyJob, $vitejsJob 2>$null
    if ($output) { Write-Host $output }
    Start-Sleep -Milliseconds 500
  }
} finally {
  Stop-Job -Name "fastify-dev", "vitejs-dev" -ErrorAction SilentlyContinue
  Remove-Job -Name "fastify-dev", "vitejs-dev" -ErrorAction SilentlyContinue
  Write-Host "`nServers stopped." -ForegroundColor Magenta
}
