# NTerminal - dagitim yapisi uretir (exe + NSIS/MSI kurucu).
#
# MSVC ortamini win-env.ps1 ile kurup `tauri build` cagiriyor.
# Cikti: src-tauri\target\release\bundle\

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

. (Join-Path $PSScriptRoot "win-env.ps1")

if (-not (Test-Path (Join-Path $root "node_modules"))) {
    Write-Host "node_modules yok, npm install kosuluyor..." -ForegroundColor Yellow
    npm install --no-audit --no-fund
}

npx tauri build @args
$code = $LASTEXITCODE

if ($code -eq 0) {
    $bundle = Join-Path $root "src-tauri\target\release\bundle"
    Write-Host ""
    Write-Host "Yapi tamamlandi:" -ForegroundColor Green
    if (Test-Path $bundle) {
        Get-ChildItem $bundle -Recurse -Include *.exe, *.msi |
            ForEach-Object { Write-Host ("  " + $_.FullName) }
    }
    $exe = Join-Path $root "src-tauri\target\release\nterminal.exe"
    if (Test-Path $exe) { Write-Host ("  " + $exe) }
}

exit $code
