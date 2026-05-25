$ErrorActionPreference = 'Stop'
$dir = Split-Path -Parent $PSCommandPath
& node (Join-Path $dir 'uninstall.js') @args
exit $LASTEXITCODE
