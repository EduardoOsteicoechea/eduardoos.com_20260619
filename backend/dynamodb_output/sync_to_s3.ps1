param(
  [Parameter(Mandatory=$true)][string]$Bucket,
  [string]$Prefix = "calvin-institutes",
  [string]$Region = "us-east-1",
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$assets = Join-Path $PSScriptRoot "website_assets"
if (-not (Test-Path $assets)) {
  throw "No existe website_assets. Ejecuta primero: python prepare_web_assets.py"
}

$target = "s3://$Bucket/$Prefix"
$flags = @("--region", $Region, "--exclude", "*", "--include", "*.json", "--delete")
if ($DryRun) { $flags += "--dryrun" }
aws s3 sync $assets $target @flags
if ($LASTEXITCODE -ne 0) { throw "aws s3 sync terminó con código $LASTEXITCODE" }
Write-Host "Sincronización terminada: $target"
