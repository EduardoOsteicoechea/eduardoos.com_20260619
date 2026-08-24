$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$bundleDir = Join-Path $root "RevitHello\RevitHello.bundle"
$zipPath = Join-Path $root "RevitHello\RevitHello.zip"
if (-not (Test-Path (Join-Path $bundleDir "Contents\RevitHello.dll"))) {
  throw "Falta Contents\RevitHello.dll. Corre: cd aps_app\RevitHello; dotnet build"
}
if (-not (Test-Path (Join-Path $bundleDir "PackageContents.xml"))) {
  throw "Falta PackageContents.xml dentro de RevitHello.bundle"
}
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
# DA expects a top-level *.bundle folder inside the zip (not the loose Contents/).
Compress-Archive -Path $bundleDir -DestinationPath $zipPath -Force
Write-Output "Created $zipPath"
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::OpenRead($zipPath)
try {
  $entries = $zip.Entries | ForEach-Object { $_.FullName }
} finally {
  $zip.Dispose()
}
$hasBundle = $entries | Where-Object { $_ -match '\.bundle[/\\]' }
if (-not $hasBundle) {
  throw "Zip malformed: missing *.bundle path. Entries: $($entries -join ', ')"
}
Write-Output "Zip entries:`n$($entries -join "`n")"
