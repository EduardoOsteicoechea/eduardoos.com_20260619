$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$bundleDir = Join-Path $root "RevitHello\RevitHello.bundle"
$zipPath = Join-Path $root "RevitHello\RevitHello.zip"
if (-not (Test-Path (Join-Path $bundleDir "Contents\RevitHello.dll"))) {
  throw "Falta Contents\RevitHello.dll. Corre: cd aps_app\RevitHello; dotnet build"
}
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Compress-Archive -Path (Join-Path $bundleDir "*") -DestinationPath $zipPath -Force
Write-Output "Created $zipPath"
