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
# Komut satiri pencerenin dibinde dursun mu? Arayuz bildirmediyse HAYIR:
# eski bir surumle calisirken davranisi sessizce degistirmiyoruz.
$Global:__NTermPromptBottom = ($env:NTERMINAL_PROMPT_BOTTOM -eq '1')
# Gorunur istem yerine blok basligi. Arayuz bildirmediyse HAYIR: istemi
# gizlemek gorunumu tumden degistiriyor, sessizce yapilmamali.
$Global:__NTermBlockHeader = ($env:NTERMINAL_BLOCK_HEADER -eq '1')

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

# --- istemi ekranin dibine itme ---------------------------------------------
#
# Warp'ta komut satiri her zaman pencerenin altindadir; ustunde kalan bosluga
# ciktilar ve oneri listesi yerlesir. Ayni sey burada kabuga yaptiriliyor:
# istem cizilmeden once imlecin altinda kalan satir sayisi kadar bos satir
# yaziyoruz, imlec son satira iniyor ve istem oraya cizilyor.
#
# NEDEN KABUK YAPIYOR: satiri kabuk ciziyor. Ayni boslugu arayuz tarafindan
# (xterm'e bos satir yazarak) eklemek ayni akista olmadigi icin sirayi
# bozuyor - istem bazen bosluklardan ONCE cizilip ekran zipliyor.
#
# LF secildi, "imleci son satira tasi" (CUP) DEGIL: LF imleci asagi indirirken
# tamponu da kaydiriyor, yani onceki cikti yukari suzuluyor ve kayboluyor
# degil. CUP yalnizca imleci tasir; istem ekranda duran ciktinin uzerine
# cizilirdi.
function Global:__NTermBottomPad([string]$Prompt) {
    if (-not $Global:__NTermPromptBottom) { return '' }
    try {
        # Cok satirli istemde (git dali ustte, `>` altta gibi) dibe oturmasi
        # gereken SON satir; ustteki satirlar kadar daha az bosluk birakiyoruz.
        $promptLines = ([regex]::Matches($Prompt, "`n")).Count
        $sonSatir = [Console]::WindowTop + [Console]::WindowHeight - 1
        $bosluk = $sonSatir - [Console]::CursorTop - $promptLines
        if ($bosluk -gt 0) { return ("`n" * $bosluk) }
    } catch {
        # Konsol tamponu okunamiyor (cikti yonlendirilmis ya da kabuk gomulu
        # calisiyor). Bosluk eklemiyoruz: ozellik gorsel, calismamasi bir sey
        # bozmuyor.
    }
    return ''
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

    # Istem metni bosluk hesabindan ONCE uretiliyor: kac satir oldugunu
    # bilmeden dibe kac satir kalacagini hesaplayamayiz.
    $userPrompt = ''
    try {
        if ($null -ne $Global:__NTermOriginalPrompt) {
            $userPrompt = [string](& $Global:__NTermOriginalPrompt)
        }
    } catch { }
    if ([string]::IsNullOrEmpty($userPrompt)) {
        $userPrompt = 'PS ' + $executionContext.SessionState.Path.CurrentLocation + '> '
    }

    # --- gorunur istem yerine blok basligi ---
    #
    # Warp'in ust alandaki duzeni: ekranda 'PS C:\Users\...>' yok, onun
    # yerine blogun kendi basligi var - dizin, sure, cikis durumu. Bu bilgilerin
    # hepsi zaten arayuze OSC ile gidiyor; ikinci kez metin olarak yazmak
    # tekrardan ibaret ve her komutun basina uzun bir yol dizesi koyuyor.
    #
    # Istem BOS SATIRA cevriliyor, tumden kaldirilmiyor. Bosluk sart: baslik
    # ekranda bir satir yer istiyor ve arayuz izgaraya satir EKLEYEMEZ, yalnizca
    # var olan satirin uzerine cizebilir. Sira soyle olusuyor:
    #
    #   133;A     -> blok burada basliyor (arayuz isaretini buraya koyuyor)
    #   bos satir -> basligin cizilecegi yer
    #   133;B     -> komut girisi bir alt satirda basliyor
    if ($Global:__NTermBlockHeader) {
        $userPrompt = "`n"
    }

    # Bosluklar 133;A'DAN ONCE yaziliyor. O isaret "istem burada basliyor"
    # demek ve arayuz yazdiginiz satiri oradan okuyor; sonra yazsaydik isaret
    # bos bir satiri gosterir, satir okuma bozulurdu.
    $out += __NTermBottomPad $userPrompt

    $out += $Global:__NTermESC + ']133;A' + $Global:__NTermBEL
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

                    # OLCULEN HATA: acik temada secili satir okunmuyordu.
                    #
                    # PSReadLine'in varsayilani (`ListPredictionSelected`)
                    # yalnizca ARKA PLANI koyu griye cekiyor (48;5;238) ve yazi
                    # rengine dokunmuyor. Koyu temada is goruyor; acik temada
                    # yazi da koyu oldugu icin koyu-uzerine-koyu cikiyor ve
                    # satirin uzerine geldiginizde metin kayboluyor.
                    #
                    # Ters video (SGR 7) terminalin KENDI iki rengini takas
                    # ediyor: arka plan yazi rengi, yazi arka plan rengi olur.
                    # Her temada okunabilir ve tema renklerini kabuga
                    # bildirmemiz gerekmiyor - tek satir, sifir bakim.
                    try {
                        Set-PSReadLineOption -Colors @{
                            ListPredictionSelected = ($Global:__NTermESC + '[7m')
                        } -ErrorAction Stop
                    } catch {
                        # Renk anahtari bu surumde yoksa liste yine calisir.
                    }
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

# Blok basligi kipini bildir. Arayuz bunu bekliyor: bildirmeyen bir kabukta
# (bash, cmd, eski surum) bos satir olusmaz ve baslik ciktinin ustunu orterdi.
if ($Global:__NTermBlockHeader) {
    __NTermOsc '633;P;BlockHeader=1'
} else {
    __NTermOsc '633;P;BlockHeader=0'
}

# Ilk istem icin dizin bilgisini hemen gonder.
__NTermReportCwd
