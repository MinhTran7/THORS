$ErrorActionPreference = 'Stop'
$rootPath = Split-Path $PSScriptRoot -Parent
Set-Location (Join-Path $rootPath 'frontend')
if (-not (Test-Path 'node_modules')) { & npm ci; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }
& npm run start
