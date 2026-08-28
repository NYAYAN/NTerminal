# NTerminal - gelistirme kipinde baslat.
#
# MSVC ortamini kurup `tauri dev` cagiriyor. Dogrudan `npx tauri dev`
# cagirmak bu makinede eksik kurulmus bir Visual Studio toolset'ine dusup
# "LNK1104: cannot open file 'msvcrt.lib'" ile basarisiz oluyor; nedeni ve
# cozumu win-env.ps1 icinde anlatiliyor.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

. (Join-Path $PSScriptRoot "win-env.ps1")

if (-not (Test-Path (Join-Path $root "node_modules"))) {
    Write-Host "node_modules yok, npm install kosuluyor..." -ForegroundColor Yellow
    npm install --no-audit --no-fund
}

npx tauri dev @args
exit $LASTEXITCODE
