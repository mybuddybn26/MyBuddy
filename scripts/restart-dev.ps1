# restart-dev.ps1 — Single command: stop old servers, start fresh
# Run this instead of opening new terminals manually.
# Only kills processes bound to Buddy's dev ports.

$root = Split-Path -Parent $PSScriptRoot
$BUDDY_PORTS = @(3000, 5173)
$stopped = $false

Write-Host "=== Buddy Dev Restart ===" -ForegroundColor Cyan

# Step 1: Find and kill old Buddy processes
foreach ($port in $BUDDY_PORTS) {
  $conns = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Where-Object { $_.State -eq 'Listen' }
  foreach ($c in $conns) {
    $proc = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
    if ($proc) {
      Write-Host "  Stopping $($proc.ProcessName) (PID $($proc.Id)) on port $port" -ForegroundColor Yellow
      Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
      $stopped = $true
    }
  }
}

if ($stopped) {
  Start-Sleep -Seconds 2
  Write-Host "  Old servers stopped." -ForegroundColor Green
} else {
  Write-Host "  No old Buddy servers found." -ForegroundColor Gray
}

# Step 2: Start both servers in this window via background jobs
Write-Host ""
Write-Host "Starting servers..." -ForegroundColor Cyan
Write-Host "  Fastify → http://localhost:3000" -ForegroundColor Green
Write-Host "  Vitejs  → http://localhost:5173" -ForegroundColor Cyan

$env:CI = 'true'

$fastifyJob = Start-Job -Name "fastify-dev" -ScriptBlock {
  $env:CI = 'true'
  Set-Location (Join-Path $using:root "fastify")
  pnpm dev 2>&1 | ForEach-Object { "[fastify] $_" }
}

$vitejsJob = Start-Job -Name "vitejs-dev" -ScriptBlock {
  $env:CI = 'true'
  Set-Location (Join-Path $using:root "vitejs")
  pnpm dev 2>&1 | ForEach-Object { "[vitejs] $_" }
}

Write-Host ""
Write-Host "Both servers starting. Leave this PowerShell window open." -ForegroundColor Magenta
Write-Host "Press Ctrl+C to stop both." -ForegroundColor Yellow
Write-Host ""

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
