$ErrorActionPreference = 'Stop'
Push-Location -LiteralPath $PSScriptRoot
try {
  & node scripts/start-local.mjs
  if ($LASTEXITCODE -ne 0) { throw 'FlowPilot local startup did not complete. Check the .runtime logs.' }
} finally {
  Pop-Location
}
