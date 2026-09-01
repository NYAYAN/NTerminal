# NTerminal - MSVC derleme ortamini hazirlar.
#
# Neden gerekli: bu makinede iki Visual Studio kurulumu var ve rustc her zaman
# EN YENI MSVC toolset'ini secer. Yeni olan (VS 18 / 14.50) linker'i icerdigi
# halde x64 CRT kutuphanelerini (msvcrt.lib) icermiyor, bu yuzden her yapi
# "LNK1104: cannot open file 'msvcrt.lib'" ile dusuyor.
#
# Bu betik gercekten kullanilabilir bir toolset ariyor (msvcrt.lib var mi diye
# bakarak), onun vcvars ortamini iceriye aliyor ve linker'i cargo'ya acikca
# bildiriyor. Boylece hangi VS'in kurulu oldugundan bagimsiz calisiyor.
#
# Kullanim:  . .\scripts\win-env.ps1     (nokta ile - ortam bu oturuma yuklenir)

$ErrorActionPreference = "Stop"

function Find-UsableMsvc {
    $vswhere = "C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe"
    $roots = @()
    if (Test-Path $vswhere) {
        $roots = & $vswhere -all -prerelease -products * -property installationPath 2>$null
    }
    if (-not $roots) {
        # vswhere yoksa bilinen konumlari tara.
        $roots = Get-ChildItem "C:\Program Files\Microsoft Visual Studio", "C:\Program Files (x86)\Microsoft Visual Studio" -Directory -ErrorAction SilentlyContinue |
            ForEach-Object { Get-ChildItem $_.FullName -Directory -ErrorAction SilentlyContinue } |
            Select-Object -ExpandProperty FullName
    }

    $candidates = @()
    foreach ($root in $roots) {
        $vcvars = Join-Path $root "VC\Auxiliary\Build\vcvars64.bat"
        $toolsDir = Join-Path $root "VC\Tools\MSVC"
        if (-not (Test-Path $vcvars)) { continue }
        if (-not (Test-Path $toolsDir)) { continue }
        foreach ($ts in (Get-ChildItem $toolsDir -Directory -ErrorAction SilentlyContinue)) {
            $link = Join-Path $ts.FullName "bin\HostX64\x64\link.exe"
            $crt  = Join-Path $ts.FullName "lib\x64\msvcrt.lib"
            # Iki kosul birlikte saglanmali: linker VE x64 CRT kutuphaneleri.
            if ((Test-Path $link) -and (Test-Path $crt)) {
                $candidates += [pscustomobject]@{
                    Root    = $root
                    VcVars  = $vcvars
                    Version = $ts.Name
                    Link    = $link
                    # 14.44.35207 -> 14.44  (vcvars -vcvars_ver bu bicimi bekler)
                    Short   = ($ts.Name -split '\.')[0..1] -join '.'
                    Sort    = [version]$ts.Name
                }
            }
        }
    }
    if (-not $candidates) { return $null }
    $candidates | Sort-Object Sort -Descending | Select-Object -First 1
}

$msvc = Find-UsableMsvc
if (-not $msvc) {
    Write-Error "x64 CRT kutuphaneleri olan bir MSVC toolset bulunamadi. Visual Studio Installer'dan 'Desktop development with C++' bileseninin kurulu oldugundan emin olun."
    return
}

Write-Host "MSVC toolset : $($msvc.Version)" -ForegroundColor Cyan
Write-Host "Visual Studio: $($msvc.Root)" -ForegroundColor Cyan

# vcvars64.bat'i cmd icinde kosup ortaya cikan ortam degiskenlerini iceri al.
# -vcvars_ver ile bulunan toolset'i sabitliyoruz; aksi halde vcvars da en yeni
# (bozuk) toolset'i secebilir.
$lines = cmd /c "call `"$($msvc.VcVars)`" -vcvars_ver=$($msvc.Short) >nul 2>&1 && set"
if ($LASTEXITCODE -ne 0 -or -not $lines) {
    Write-Error "vcvars64.bat calistirilamadi: $($msvc.VcVars)"
    return
}

# MSBuild'in OZELLIK olarak okudugu degiskenler iceri ALINMIYOR.
#
# OLCULEN HATA: gelistirme kipinde acilan NTerminal'de `dotnet run` dusuyor,
# ayni komut Windows Terminal'de calisiyordu. Hata karma kipli (C++/CLI) bir
# derlemenin yuklenememesiydi:
#
#   System.IO.FileNotFoundException: Could not load file or assembly
#   'sapnco_utils.dll' -- The specified module could not be found
#
# Sebep bu donguydu. vcvars64.bat ortama Platform=x64 yaziyor; MSBuild ortam
# degiskenlerini ozellik olarak okudugu icin $(Platform) x64 oluyor ve cikti
# klasoru bin/Debug/<tfm> yerine bin/x64/Debug/<tfm> haline geliyor. Ikinci
# klasorde karma kipli derlemeyi yuklemek icin gereken ijwhost.dll yoktu.
#
# Zincir uzun ama tek yonlu: bu betik ortami oturuma aliyor -> dev.ps1
# `tauri dev` cagiriyor -> cargo nterminal.exe'i baslatiyor -> uygulama
# ACTIGI HER KABUGA kendi ortamini veriyor. Yani bir terminal emulatoru
# kullanicinin derleme ciktisinin YERINI degistiriyordu ve belirti
# uygulamada degil KULLANICININ PROJESINDE cikiyordu.
#
# Rust'i derleyip baglamak icin gereken sey PATH, INCLUDE, LIB ve LIBPATH;
# bunlarin MSBuild cikti yoluna etkisi yok. Asagidaki ikisi ise YALNIZCA
# MSBuild icin var, cargo hicbirini okumuyor.
$msbuildEtkili = @('Platform', 'PreferredToolArchitecture')

$imported = 0
$skipped = @()
foreach ($line in $lines) {
    $idx = $line.IndexOf('=')
    if ($idx -lt 1) { continue }
    $name = $line.Substring(0, $idx)
    $value = $line.Substring($idx + 1)
    if ($msbuildEtkili -contains $name) {
        $skipped += $name
        continue
    }
    Set-Item -Path "env:$name" -Value $value
    $imported++
}

# rustc, PATH'te link.exe olsa bile kendi tespitiyle en yeni toolset'i
# secebiliyor. Linker'i cargo'ya acikca soyleyerek bu riski kapatiyoruz.
$env:CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_LINKER = $msvc.Link

Write-Host "Ortam hazir ($imported degisken). Linker: $($msvc.Link)" -ForegroundColor Green
if ($skipped.Count -gt 0) {
    Write-Host "Alinmadi (MSBuild ciktisini kaydiriyor): $($skipped -join ', ')" -ForegroundColor DarkGray
}
