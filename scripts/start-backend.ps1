$ErrorActionPreference = 'Stop'
$rootPath = Split-Path $PSScriptRoot -Parent
Set-Location (Join-Path $rootPath 'backend')
if (-not (Test-Path 'local.properties')) { Copy-Item 'local.properties.example' 'local.properties' }
$jarPath = Join-Path (Get-Location) 'target/thors-backend-0.2.0.jar'
if (Test-Path $jarPath) { & java -jar $jarPath } else { & mvn spring-boot:run }
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
