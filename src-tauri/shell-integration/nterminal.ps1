# NTerminal - PowerShell kabuk entegrasyonu (Windows PowerShell 5.1 ve PowerShell 7+)
#
# Uygulamaya su bilgileri OSC kacis dizileriyle bildirir:
#   OSC 133;A        istem (prompt) basliyor
#   OSC 133;B        komut girisi basliyor
#   OSC 133;C        komut calismaya basladi
#   OSC 133;D;<kod>  komut bitti, cikis kodu
#   OSC 633;E;<cmd>  calistirilan komut metni (kacisli)
#   OSC 633;P;Cwd=   gecerli dizin
#   OSC 7;file://    gecerli dizin (standart bicim)
#
# Bu dosya `-NoExit -File` ile yuklenir; kullanicinin kendi profili ve
# istem (prompt) fonksiyonu korunur, sadece sarmalanir.

if ($env:NTERMINAL_INTEGRATION_LOADED -eq '1') { return }
$env:NTERMINAL_INTEGRATION_LOADED = '1'

$Global:__NTermESC = [char]27
$Global:__NTermBEL = [char]7
$Global:__NTermPrevLastExit = $Global:LASTEXITCODE
$Global:__NTermSawCommand = $false
$Global:__NTermLastHistoryId = -1
# Komut metnini PSReadLine kancasindan alamazsak Get-History yedegine dusuyoruz.
# Kanca kurulabildiyse yedek KAPATILMALI: aksi halde bos bir satirda Enter'a
# basmak (komut yok, dolayisiyla SawCommand false) yedegi tetikler ve onceki
# komut ikinci kez kaydedilir.
$Global:__NTermUseHistoryFallback = $true

function Global:__NTermOsc([string]$Body) {
    try { [Console]::Write($Global:__NTermESC + ']' + $Body + $Global:__NTermBEL) } catch { }
}

# OSC yuku icinde ';' ayirici oldugundan komut metnini kacisliyoruz.
# Karsi taraf (arayuz) ayni kurali tersine uyguluyor.
function Global:__NTermEscape([string]$Value) {
    if ([string]::IsNullOrEmpty($Value)) { return '' }
    $sb = New-Object System.Text.StringBuilder
    foreach ($ch in $Value.ToCharArray()) {
        $code = [int]$ch
        if ($ch -eq '\') { [void]$sb.Append('\\') }
        elseif ($ch -eq ';') { [void]$sb.Append('\x3B') }
        elseif ($code -lt 32 -or $code -eq 127) { [void]$sb.Append(('\x{0:X2}' -f $code)) }
        else { [void]$sb.Append($ch) }
    }
    return $sb.ToString()
}

function Global:__NTermReportCwd() {
    try {
        if ($null -eq $PWD) { return }
        # Registry gibi dosya sistemi disi saglayicilarda dizin bildirmiyoruz.
        if ($PWD.Provider.Name -ne 'FileSystem') { return }
        $path = $PWD.ProviderPath
        __NTermOsc ('633;P;Cwd=' + (__NTermEscape $path))
        $slashed = $path -replace '\\', '/'
        __NTermOsc ('7;file:///' + $slashed)
    } catch { }
}

# --- istem sarmalayici ------------------------------------------------------

$Global:__NTermOriginalPrompt = $function:prompt

function Global:prompt {
    # $? ve $LASTEXITCODE ilk satirda okunmali: sonraki her ifade bunlari ezer.
    $lastSuccess = $?
    $lastExit = $Global:LASTEXITCODE

    $out = ''

    if ($Global:__NTermSawCommand) {
        # Cikis kodu: $LASTEXITCODE sadece yerel (native) uygulamalarda degisir.
        # Degistiyse onu kullan; degismediyse $? uzerinden 0/1 uret. Boylece hem
        # `git ...` gibi komutlarin gercek kodu hem de cmdlet hatalari yakalanir.
        $code = 0
        if ($null -ne $lastExit -and $lastExit -ne $Global:__NTermPrevLastExit) {
            $code = $lastExit
        } elseif (-not $lastSuccess) {
            $code = 1
        }
        $out += $Global:__NTermESC + ']133;D;' + $code + $Global:__NTermBEL
        $Global:__NTermSawCommand = $false
    } elseif ($Global:__NTermUseHistoryFallback) {
        # PSReadLine kancasi kurulamadi: komutu gecmisten kurtarmayi dene.
        $recovered = $false
        try {
            $h = Get-History -Count 1 -ErrorAction SilentlyContinue
            if ($null -ne $h -and $h.Id -ne $Global:__NTermLastHistoryId) {
                $Global:__NTermLastHistoryId = $h.Id
                $dur = 0
                try {
                    $dur = [int](($h.EndExecutionTime - $h.StartExecutionTime).TotalMilliseconds)
                } catch { }
                $code = 0
                if ($null -ne $lastExit -and $lastExit -ne $Global:__NTermPrevLastExit) {
                    $code = $lastExit
                } elseif (-not $lastSuccess) {
                    $code = 1
                }
                $out += $Global:__NTermESC + ']633;E;' + (__NTermEscape $h.CommandLine) + $Global:__NTermBEL
                $out += $Global:__NTermESC + ']133;C' + $Global:__NTermBEL
                $out += $Global:__NTermESC + ']633;X;Dur=' + $dur + $Global:__NTermBEL
                $out += $Global:__NTermESC + ']133;D;' + $code + $Global:__NTermBEL
                $recovered = $true
            }
        } catch { }
        if (-not $recovered) {
            $out += $Global:__NTermESC + ']133;D' + $Global:__NTermBEL
        }
    } else {
        # Komut calismadi (bos satirda Enter, Ctrl+C, ilk istem). Kodsuz D
        # gonderiyoruz: arayuz bunu "bildirilecek komut yok" olarak okuyor.
        $out += $Global:__NTermESC + ']133;D' + $Global:__NTermBEL
    }

    $Global:__NTermPrevLastExit = $lastExit

    __NTermReportCwd

    $out += $Global:__NTermESC + ']133;A' + $Global:__NTermBEL

    $userPrompt = ''
    try {
        if ($null -ne $Global:__NTermOriginalPrompt) {
            $userPrompt = [string](& $Global:__NTermOriginalPrompt)
        }
    } catch { }
    if ([string]::IsNullOrEmpty($userPrompt)) {
        $userPrompt = 'PS ' + $executionContext.SessionState.Path.CurrentLocation + '> '
    }

    $out += $userPrompt
    $out += $Global:__NTermESC + ']133;B' + $Global:__NTermBEL
    return $out
}

# --- komut metni yakalama ---------------------------------------------------
#
# PSReadLine, satir okumayi PSConsoleHostReadLine fonksiyonu uzerinden yapar.
# Orijinalini saklayip sarmaliyoruz: kullanici Enter'a bastigi anda tam komut
# metnini biliyoruz, komut daha calismaya baslamadan bildiriyoruz.

if (Get-Command -Name PSConsoleHostReadLine -CommandType Function -ErrorAction SilentlyContinue) {
    $Global:__NTermOriginalReadLine = $function:PSConsoleHostReadLine
    # Kanca kuruldu: Get-History yedegine gerek yok, acik kalirsa komutlar iki
    # kez kaydedilir.
    $Global:__NTermUseHistoryFallback = $false

    function Global:PSConsoleHostReadLine {
        $line = $Global:__NTermOriginalReadLine.InvokeReturnAsIs()
        try {
            $text = [string]$line
            if (-not [string]::IsNullOrWhiteSpace($text)) {
                __NTermOsc ('633;E;' + (__NTermEscape $text))
                $Global:__NTermSawCommand = $true
            }
            # Bos satirda da gonderiyoruz: arayuz burada "komut basladi mi"
            # kararini verip yedek zamanlayicisini kapatiyor.
            __NTermOsc '133;C'
        } catch { }
        return $line
    }
}

# --- komut onerileri (PSReadLine tahmini) -----------------------------------
#
# Daha once calistirilan komutlari yazarken onerme isi PowerShell'de yerlesik:
# PSReadLine 2.2+ (PowerShell 7.2+) iki gorunum sunuyor
#   InlineView - imlecin devaminda soluk "hayalet metin"
#   ListView   - istemin altinda liste; yukari/asagi oklariyla seciliyor
#
# Bunu KABUGA BIRAKMAK bilincli bir karar. Oneriyi uygulama tarafinda cizmek,
# kabugun kendi satir duzenleyicisiyle (imlec konumu, yeniden cizim, secim,
# sekme tamamlama) yarismak demek: kabuk kendi satirini biliyor, uygulama
# yalnizca ekran tamponunu goruyor. Ustune ok tuslarini yakalamak kabugun
# kendi gecmis gezinmesini bozar.
#
# NTERMINAL_PREDICTION yok ya da 'off' ise HIC dokunmuyoruz; kullanicinin
# kendi profilindeki ayar gecerli kalir.
$Global:__NTermPredict = $env:NTERMINAL_PREDICTION
if ([string]::IsNullOrEmpty($Global:__NTermPredict) -or $Global:__NTermPredict -eq 'off') {
    __NTermOsc '633;P;Prediction=off'
} else {
    # Windows PowerShell 5.1 PSReadLine 2.0 ile geliyor ve tahmini
    # desteklemiyor. Uygulama bu durum icin PSReadLine 2.3.6'yi kendisiyle
    # birlikte tasiyor ve `PSModulePath`in basina ekliyor (bkz. pty.rs), yani
    # buraya gelindiginde YENI surum yuklenmis oluyor ve asagidaki denetim
    # geciyor. Kullanicinin bir sey kurmasi gerekmiyor.
    #
    # Yine de 'unsupported' bir cikis yolu olarak duruyor: modul yuklenemezse
    # ya da kabuk pwsh 7.0/7.1 ise buraya dusuyoruz. Durum arayuze bildiriliyor
    # cunku sessiz kalmak "uygulama bozuk" izlenimi veriyor.
    $state = 'unsupported'
    try {
        $psrl = Get-Command Set-PSReadLineOption -ErrorAction Stop
        if ($psrl.Parameters.ContainsKey('PredictionSource')) {
            Set-PSReadLineOption -PredictionSource History -ErrorAction Stop
            $state = 'inline'
            if ($psrl.Parameters.ContainsKey('PredictionViewStyle')) {
                if ($Global:__NTermPredict -eq 'inline') {
                    Set-PSReadLineOption -PredictionViewStyle InlineView -ErrorAction Stop
                } else {
                    Set-PSReadLineOption -PredictionViewStyle ListView -ErrorAction Stop
                    $state = 'list'
                }
            }
        }
    } catch {
        # PSReadLine 2.0 (Windows PowerShell 5.1) tahmini desteklemiyor.
        # Entegrasyonun geri kalani calismaya devam etmeli.
        $state = 'unsupported'
    }
    __NTermOsc ('633;P;Prediction=' + $state)
}

# Ilk istem icin dizin bilgisini hemen gonder.
__NTermReportCwd
