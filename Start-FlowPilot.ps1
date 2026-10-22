$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$runtimeRoot = Join-Path (Resolve-Path (Join-Path $projectRoot '../../work')).Path 'flowpilot-runtime'
New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null
$nodeCommand = (Get-Command node -ErrorAction Stop).Source
function Start-LocalService([int]$Port, [string[]]$Arguments, [string]$Name) {
  if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
    Write-Output "$Name is already listening on port $Port."
    return
  }
  Start-Process -FilePath $nodeCommand -ArgumentList $Arguments -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeRoot "$Name.log") -RedirectStandardError (Join-Path $runtimeRoot "$Name-error.log") | Out-Null
}
Start-LocalService 5174 @('node_modules/vite/bin/vite.js','--host','127.0.0.1','--mode','demo','--port','5174') 'demo'
if (Test-Path (Join-Path $projectRoot '.env.local')) {
  Start-LocalService 5173 @('node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5173') 'connected'
}
if (Test-Path (Join-Path $projectRoot '.env.automation.local')) {
  Start-LocalService 8787 @('--env-file=.env.local','--env-file=.env.automation.local','automation/server.mjs') 'advisory'
}
Write-Output 'Demo: http://127.0.0.1:5174'
Write-Output 'Connected workspace: http://127.0.0.1:5173'
Write-Output 'n8n remains disabled until its dependency release gate is cleared.'
