# dev-clean.ps1 — Clean dev server restart for Buddy
# Closes processes on Buddy's dev ports before starting.

$root = Split-Path -Parent $PSScriptRoot
$BUDDY_PORTS = @(3000, 5173)

Write-Host "=== Buddy Dev Clean Start ===" -ForegroundColor Magenta
Write-Host ""

# Step 1: Find processes on Buddy ports
$toStop = @()
foreach ($port in $BUDDY_PORTS) {
  $conns = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Where-Object { $_.State -eq 'Listen' }
  foreach ($c in $conns) {
    $proc = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
    if ($proc) {
      Write-Host "Found: $($proc.ProcessName) (PID $($proc.Id)) on port $port" -ForegroundColor Yellow
      $toStop += $proc
    }
  }
}

# Step 2: Also stop any lingering node processes from Buddy directory
$nodeProcs = Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -eq '' }
foreach ($p in $nodeProcs) {
  if ($toStop.Id -notcontains $p.Id) {
    $toStop += $p
  }
}

if ($toStop.Count -eq 0) {
  Write-Host "No Buddy processes found. Starting servers..." -ForegroundColor Green
} else {
  Write-Host "Stopping $($toStop.Count) process(es)..." -ForegroundColor Yellow
  foreach ($p in $toStop) {
    Write-Host "  Stopping $($p.ProcessName) (PID $($p.Id))" -ForegroundColor Gray
    Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep -Seconds 2
  Write-Host "All Buddy processes stopped." -ForegroundColor Green
}

# Step 3: Start dev servers
Write-Host ""
Write-Host "Starting MyBuddy..." -ForegroundColor Magenta
Write-Host "  Fastify → http://localhost:3000" -ForegroundColor Green
Write-Host "  Vitejs  → http://localhost:5173" -ForegroundColor Cyan

$env:CI = 'true'

$fastify = Start-Process -WindowStyle Minimized powershell -ArgumentList "-NoExit", "-Command", "\$env:CI='true'; Set-Location '$root\fastify'; pnpm dev" -PassThru
$vitejs = Start-Process -WindowStyle Minimized powershell -ArgumentList "-NoExit", "-Command", "\$env:CI='true'; Set-Location '$root\vitejs'; pnpm dev" -PassThru

Start-Sleep -Seconds 10

# Check if servers started
try {
  $null = Invoke-WebRequest -Uri "http://localhost:3000/api/health" -TimeoutSec 3 -UseBasicParsing
  Write-Host "Fastify: RUNNING" -ForegroundColor Green
} catch {
  Write-Host "Fastify: starting (may need a moment)" -ForegroundColor Yellow
}

try {
  $null = Invoke-WebRequest -Uri "http://localhost:5173" -TimeoutSec 3 -UseBasicParsing
  Write-Host "Vitejs: RUNNING" -ForegroundColor Green
} catch {
  Write-Host "Vitejs: starting (may need a moment)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Opening browser..." -ForegroundColor Cyan
Start-Process "http://localhost:5173"
Write-Host "Done! Keep the minimized PowerShell windows open." -ForegroundColor Magenta
