# NTerminal - tum testleri kosar.
#
#   * TypeScript tip denetimi
#   * Arayuz birim testleri (OSC ayristirma, base64, kisayollar, bicimlendirme)
#   * Rust birim testleri (gecmis deposu, aktarim, kabuk argumanlari)
#   * Kabuk entegrasyonu ucdan uca testleri (gercek ConPTY + gercek PowerShell)

$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

. (Join-Path $PSScriptRoot "win-env.ps1")

$failed = 0

Write-Host ""
Write-Host "== TypeScript tip denetimi ==" -ForegroundColor Cyan
npx tsc --noEmit
if ($LASTEXITCODE -ne 0) { $failed = 1 }

Write-Host ""
Write-Host "== Arayuz testleri (vitest) ==" -ForegroundColor Cyan
npx vitest run
if ($LASTEXITCODE -ne 0) { $failed = 1 }

Write-Host ""
Write-Host "== Rust testleri ==" -ForegroundColor Cyan
Set-Location (Join-Path $root "src-tauri")
# Entegrasyon testleri gercek kabuk sureci baslattigi icin sirali kosuyor.
cargo test -- --test-threads=1
if ($LASTEXITCODE -ne 0) { $failed = 1 }

Set-Location $root
Write-Host ""
if ($failed -eq 0) {
    Write-Host "Tum testler gecti." -ForegroundColor Green
} else {
    Write-Host "Basarisiz testler var." -ForegroundColor Red
}
exit $failed
