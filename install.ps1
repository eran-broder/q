# Thin wrapper around install.js for Windows PowerShell.
$ErrorActionPreference = 'Stop'
$dir = Split-Path -Parent $PSCommandPath
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Error "node is required but not found on PATH. Install from https://nodejs.org/ then re-run."
    exit 1
}
& node (Join-Path $dir 'install.js') @args
exit $LASTEXITCODE
