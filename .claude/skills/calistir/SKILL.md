---
name: calistir
description: N-Terminal'i geliştirme kipinde başlatır ve değişikliğin gerçekten çalıştığını uygulamanın kendisinde doğrular. Kullanıcı "çalıştır", "başlat", "aç", "kontrol edelim", "ekran görüntüsü al", "uygulamada dene", "npm start" dediğinde ya da bir arayüz değişikliğinin testlerle değil GÖZLE doğrulanması gerektiğinde bu skill'i kullan. Uygulamayı `npx tauri dev` ile başlatmaya kalkma — bu makinede bağlayıcı hatasıyla düşüyor, gerekçesi burada.
---

# N-Terminal'i çalıştır

## Başlat

```bash
npm start
```

`npx tauri dev` **çağırma**. Bu makinede iki Visual Studio kurulu ve doğrudan
çağrı eksik kurulmuş toolset'i seçip `LNK1104: cannot open file 'msvcrt.lib'`
ile düşüyor. `npm start` → `scripts/run.mjs dev` → `scripts/dev.ps1` zinciri
önce `win-env.ps1` ile çalışan toolset'i ortama koyuyor. Gerekçenin tamamı
`scripts/win-env.ps1` içinde.

Uygulama pencereyi açtıktan sonra kapanmadığı için önplanda çalıştırmak
oturumu kilitler. Arka plana al ve günlüğü bir dosyaya yaz:

```bash
Start-Process cmd.exe -ArgumentList "/c npm start > `"$env:TEMP\nterminal-dev.log`" 2>&1" -WindowStyle Hidden
```

Sonra günlükte şu satırı bekle — bu geldiğinde pencere açılmış demektir:

```
Running `target\debug\nterminal.exe`
```

İlk derleme birkaç dakika sürebilir; `target/` sıcaksa 10 saniyenin altında.

Günlükte bunun yerine şu satırı görürsen yeni örnek **açılmadı**:

```
[nterminal] <klasör> klasoruyle calisan bir N-Terminal var; penceresi one getirildi
```

Uygulama tek örnek: aynı veri klasörüyle ikinci kez açılınca çalışanın
penceresini öne getirip çıkıyor (`src-tauri/src/instance.rs`). Öne gelen,
önceki bir denemeden kalmış geliştirme örneği ve **eski kodu** çalıştırıyor.
Kapatma düğmesi varsayılan olarak pencereyi yalnızca gizlediği için böyle bir
örnek görünmeden yaşayabiliyor. Onu kapat (aşağıda "Kapatma"), sonra yeniden
başlat. Kilidin ad alanı geliştirme yapısında ayrı; kurulu uygulama
geliştirme örneğini engellemiyor.

## Kurulu uygulama açıkken: AYRI veri klasörü

Önce bak: `Get-Process nterminal` iki satır veriyorsa (biri
`C:\Program Files\N-Terminal\`, biri `target\debug\`) kullanıcının kendi
uygulaması çalışıyor demek. Geliştirme örneği o durumda **aynı**
`%APPDATA%\NTerminal` klasörünü paylaşıyor ve iki şey oluyor:

- İkisi de `workspace.json`'a yazıyor (120 saniyede bir periyodik kayıt);
  geliştirme örneğinde açtığın grup/sekme kullanıcının düzenine karışıyor.
- Kullanıcının penceresini yanlışlıkla öne getirmek kolay: ikisinin de adı
  `nterminal`.

Ayrı bir tuzak, örnek sayısından bağımsız: geliştirme örneği "N-Terminal
yükleniyor…" ekranında takılırsa sebep Rust değil — `useStore.ts`
düzenlendiğinde depo sıcak yenilemeyle sıfırlanıyor ve eskiden `App` bir
ref'e bakıp açılışı bir daha koşturmuyordu (düzeltmesi `App.tsx`teki açılış
etkisinde). Hâlâ görürsen pencereyi yenile (Ctrl+R değil — o sekmeleri
düşürür; uygulamayı kapatıp `npm start`ı yeniden koştur).

Çözüm `NTERMINAL_DATA_DIR`: `paths.rs` bu değişkeni her şeyin önünde okuyor.
Kullanıcının ayarlarını (profiller, davranış) kopyala ki aynı koşullarda
denesin, çalışma alanını kopyalama:

```powershell
$iso = "$env:TEMP\nterminal-dev-data"
New-Item -ItemType Directory -Force $iso | Out-Null
Copy-Item "$env:APPDATA\NTerminal\settings.json" $iso -Force
$env:NTERMINAL_DATA_DIR = $iso
Start-Process cmd.exe -ArgumentList "/c npx vite > `"$env:TEMP\nt-vite.log`" 2>&1" -WindowStyle Hidden -WorkingDirectory "C:\Users\nurullah.yayan\Desktop\Work\NYAYAN\NTerminal"
Start-Sleep -Seconds 4
Start-Process "C:\Users\nurullah.yayan\Desktop\Work\NYAYAN\NTerminal\src-tauri\target\debug\nterminal.exe" -WorkingDirectory "C:\Users\nurullah.yayan\Desktop\Work\NYAYAN\NTerminal\src-tauri"
```

Bu yol `tauri dev`i atlıyor: Vite'ı kendin başlatıyorsun, hazır exe'yi ortam
değişkeniyle açıyorsun. Rust değiştirmediysen yeterli; HMR yine çalışıyor.
Önce aynı klasörle kalmış bir geliştirme örneği olmadığına bak (aşağıda
"Kapatma"daki ilk komutun seçtiği süreçler). Varsa yeni exe açılmadan çıkar ve
eskisi öne gelir; ayrıntısı "Başlat"ta.
Ekran görüntüsü alırken süreci yola göre seç (`$_.Path -like "*target\debug*"`),
yoksa kullanıcının penceresini öne getirirsin. İşin bitince geçici klasörü sil.

## Değişikliği uygulamaya yansıtmak

- **Arayüz (`src/**/*.tsx`, `*.ts`, `*.css`)**: Vite anında yeniden yüklüyor.
  Yeniden başlatma **gerekmiyor** — dosyayı kaydet, uygulamaya bak.
- **Rust (`src-tauri/src/**`)**: `tauri dev` değişikliği görüp yeniden
  derliyor ve uygulamayı yeniden başlatıyor. Bu sırada pencere kapanıp
  açılıyor, bu normal.

Uygulamanın **gerçekten hangi kodu çalıştırdığından** emin değilsen Vite'ın
servis ettiği dosyaya bak — depoya baktığında gördüğün şey ile pencerede
çalışan şey ayrışabiliyor:

```bash
curl -s "http://localhost:5273/src/components/TabBar.tsx" | grep -n "aradığın"
```

## Gördüğünü doğrula

Pencereyi açmak "çalıştı" demek değil; ekranda ne olduğuna **bakmak**
gerekiyor. Tüm ekranı yakalama — kullanıcının başka pencerelerinde özel
içerik oluyor. Yalnızca uygulamanın penceresini al:

```powershell
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
Add-Type @"
using System;using System.Runtime.InteropServices;
public class W {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h,int c);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  public struct RECT { public int Left, Top, Right, Bottom; }
}
"@
$p = Get-Process nterminal | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
[void][W]::ShowWindow($p.MainWindowHandle, 9); [void][W]::SetForegroundWindow($p.MainWindowHandle)
Start-Sleep -Milliseconds 900
$r = New-Object W+RECT; [void][W]::GetWindowRect($p.MainWindowHandle, [ref]$r)
$bmp = New-Object System.Drawing.Bitmap ($r.Right-$r.Left), ($r.Bottom-$r.Top)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($r.Left, $r.Top, 0, 0, $bmp.Size)
$bmp.Save("$env:TEMP\nterminal-pencere.png", [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
```

Sonra görüntüyü **oku**. Küçük bir ayrıntıya bakıyorsan (rozet, simge, 1px
boşluk) kırp ve büyüt — `InterpolationMode = NearestNeighbor` ile 3-7 kat,
yoksa bulanıklıkta kaybolur.

## "Çizilmiyor mu, yoksa görünmüyor mu?"

Bir öğe ekranda yoksa iki ayrı sebep var ve ayırmadan doğru yeri aramaya
başlarsan zaman kaybedersin:

1. **Öğe DOM'da yok** — koşul yanlış, ayar kapalı, bileşen çizilmiyor.
2. **Öğe var ama görünmüyor** — renk zeminle karışıyor, genişlik sıfır,
   üstünde başka bir katman var.

Ayırmanın en hızlı yolu geçici bir CSS sondası: kuralın içine
`background: #ff0000 !important; color: #fff !important` koy, kaydet (Vite
anında uygular), bak, sonra **geri al**. Kırmızı görünüyorsa öğe orada ve
sorun renkte. Sondayı koyarken kullanıcıya bunun geçici olduğunu söyle —
aksi halde ekranda kırmızı bir şey görüp "yanlış yaptın" diye okuyor.

Bu depoda bir kez tam olarak bu oldu: kabuk rozeti çiziliyordu ama Windows
PowerShell profilinin rengi `#0e4d92` (koyu lacivert) olduğu için koyu temada
1.4:1 karşıtlıkla görünmüyordu. Kullanıcının seçtiği renkleri metin olarak
kullanmadan önce `themes.ts` içindeki `readableAccent()`ten geçir.

## Uygulamanın durumunu diskten okumak

Ayarlar, çalışma alanı ve geçmiş burada — bir davranışın sebebini ararken
önce buraya bak, tahmin etme:

```bash
python -c "import json,os;print(json.dumps(json.load(open(os.path.expandvars(r'%APPDATA%\NTerminal\settings.json'),encoding='utf-8'))['appearance'],indent=2,ensure_ascii=False))"
```

| Dosya | İçerik |
|---|---|
| `%APPDATA%\NTerminal\settings.json` | Ayarlar (profiller, görünüm, kısayollar) |
| `%APPDATA%\NTerminal\workspace.json` | Gruplar, sekmeler, etkin sekme |
| `%APPDATA%\NTerminal\history.jsonl` | Komut geçmişi |

## PowerShell tuzakları

- Yerel exe'lerde (`cargo`, `npx`) `2>&1` **kullanma**: PowerShell 5.1 stderr
  satırlarını `NativeCommandError`a çeviriyor ve çıkış kodu 0 olsa bile hata
  gibi görünüyor.
- Çalışma dizini çağrılar arasında kalıcı. `Set-Location`ı **mutlak yolla**
  ver, yoksa ikinci çağrı `src-tauri\src-tauri` gibi bir yere gider ve
  `win-env.ps1` bulunamaz — o zaman yanlış toolset seçilip yukarıdaki
  `LNK1104` hatası geri gelir.

## Windows Installer / oturum sonu isteğini dene

MSI kurulurken Restart Manager açık uygulamaya kapanmasını söylüyor; oturum
kapanırken Windows da aynısını (NOTLAR.md §2.6, `session_end.rs`). Kurulu
uygulamaya dokunmadan denemek için yalıtılmış örneği (yukarıda) stderr'i bir
dosyaya giderek aç — panik iletisi ve yeri oraya düşüyor:

```powershell
Start-Process cmd.exe -ArgumentList "/c `"`"<depo>\src-tauri\target\debug\nterminal.exe`" > `"$env:TEMP\nt-oturum.log`" 2>&1`"" -WindowStyle Hidden -WorkingDirectory "<depo>\src-tauri"
.\.claude\skills\calistir\oturum-sonu.ps1 -Exe "<depo>\src-tauri\target\debug\nterminal.exe" -Mode ileti
```

- `-Mode ileti`: Restart Manager'ın GUI uygulamaya gönderdiği iletiler.
  Geliştirme yapısı konsol alt sistemli; Restart Manager onu `Console` sayıyor
  ve pencere iletisi hiç göndermiyor, gerçek API orada bir şey sınamıyor.
- `-Mode api`: gerçek `RmShutdown`. `win-env.ps1` ortamında `cargo build
  --release` ile üretilen `target\release\nterminal.exe` gerekiyor:
  custom-protocol olmadığı için ön yüz yine Vite'tan geliyor, ama GUI alt
  sistemi ve `panic = "abort"` kurulu yapınınki.

Betik yalnızca `-Exe` yolundaki süreci hedefliyor; o yolu çalıştıran tam bir
süreç yoksa ya da Restart Manager listesinde başka bir süreç görünürse hiçbir
şey göndermeden çıkıyor. Beklenen: günlükte `[nterminal] oturum sonu: arayuz
kaydi tamam (… ms)`, `workspace.json` o anda yazılmış, süreç ve kabukları
kapanmış.

Tepsi simgesini dışarıdan doğrulamaya uğraşma: `Shell_NotifyIconGetRect` ölmüş
sürecin hayalet simgesini de "yok" diye bildiriyor, UI Automation taşma panelini
kapalıyken görmüyor (ölçüldü).

## Ön plan yokken: uygulamayı CDP ile sür

Kullanıcı uzak masaüstündeyse (RDP) ve pencere küçültülmüş ya da arkadaysa
`GetForegroundWindow` sıfır döner, `SendKeys` "Erişim engellendi" verir,
`CopyFromScreen` kilit ekranını ya da bayat kareyi yakalar. `LogonUI`
var/yok diye bakmak da yanıltıyor — başka bir oturumun kilidi olabilir
(`SessionId` karşılaştır). Bu durumda tuş göndermeyi bırak; WebView2'yi
uzaktan hata ayıklama portuyla aç ve Chrome DevTools Protocol'den sür:

```powershell
$env:NTERMINAL_DATA_DIR = "$env:TEMP\nterminal-dev-data"
$env:WEBVIEW2_USER_DATA_FOLDER = "$env:TEMP\nterminal-dev-data\webview2"
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9333"
Start-Process "C:\Users\nurullah.yayan\Desktop\Work\NYAYAN\NTerminal\src-tauri\target\debug\nterminal.exe" -WorkingDirectory "C:\Users\nurullah.yayan\Desktop\Work\NYAYAN\NTerminal\src-tauri"
```

İki tuzak, ikisi de ölçüldü:

- **`WEBVIEW2_USER_DATA_FOLDER` şart.** Kurulu uygulama açıkken geliştirme
  örneği aynı WebView2 veri klasörünü (`%LOCALAPPDATA%\<kimlik>\EBWebView`)
  paylaşıyor ve WebView2 var olan tarayıcı sürecine bağlanıyor; ek argümanlar
  o zaman hiç okunmuyor — pencere açılıyor, port dinlemiyor, hata yok.
  `NTERMINAL_DATA_DIR` bunu ayırmıyor, o yalnızca uygulamanın kendi verisi.
- **9222 dolu olabilir.** Bu makinede Lenovo Vantage 9222'de dinliyor
  (`netstat -ano | Select-String :9222`); `/json` cevap veriyor ama sayfa
  "Vantage Bileşeni". Başka port seç ve sürücüye `CDP_PORT` ile söyle:
  `$env:CDP_PORT = "9333"` (bash: `export CDP_PORT=9333`).

Portun hazır olduğunu PowerShell'in `Invoke-RestMethod http://localhost:9333/json`
çağrısıyla yoklama. Bu makinede 90 saniye boyunca cevap alamadı, oysa port
açıktı ve `cdp.mjs` (Node `fetch`) hemen bağlandı. Hazır olmayı
`node .claude/skills/calistir/cdp.mjs eval "document.readyState"` ile bekle.

Sürücünün `eval` komutu sayfada JS koşturup sonucu JSON yazıyor; uzun bir
ölçüm betiğini dosyaya koyup `eval @yol` ile ver. Not: Bash aracı komut
metnindeki çift ters bölüyü teke indiriyor — Windows yolu içeren dosya
düzenlemelerini Bash heredoc'uyla değil Edit/Write ile yap.

Sürücü bu klasörde, `cdp.mjs` (Node 24, yerleşik `WebSocket`; ek paket yok):

```bash
node .claude/skills/calistir/cdp.mjs type "cd Desktop\Work"   # kutuya odaklan, metni gir
node .claude/skills/calistir/cdp.mjs selectall
node .claude/skills/calistir/cdp.mjs key c 2                   # Ctrl+C (Alt=1 Ctrl=2 Meta=4 Shift=8)
node .claude/skills/calistir/cdp.mjs value                     # {value, selStart, selEnd, focused}
node .claude/skills/calistir/cdp.mjs shot adim-1               # %TEMP%\nt-cdp\adim-1.png
node .claude/skills/calistir/cdp.mjs newgroup                  # Ctrl+Shift+N
```

Panoyu `Get-Clipboard -Raw` ile adımlar arasında oku; önce yedekle
(`Get-Clipboard`), bitince geri koy. Ekran görüntüsü `Page.captureScreenshot`
ile geliyor — pencere görünmese de doğru kare.

İki uyarı: geliştirme derlemesinde GERÇEK Ctrl+Shift+C WebView2'nin DevTools
kısayolu ve sayfaya hiç ulaşmıyor (üretimde DevTools kapalı); CDP'den
gönderilen ulaşıyor. `Input.insertText` gerçek `input` olayı üretir, React'ın
`onChange`i çalışır — `el.value = …` yazmak çalışmaz.

## Kapatma

Yalnızca kendi başlattığını kapat, yola ve porta göre seç:

```powershell
# Geliştirme örneği: target\debug altındaki exe.
Get-Process nterminal -ErrorAction SilentlyContinue |
  Where-Object { $_.Path -like "*\src-tauri\target\debug\nterminal.exe" } | Stop-Process -Force
# Vite: node.exe depoda değil, Node kurulumunda. Porttan bul.
Get-NetTCPConnection -LocalPort 5273 -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

Örnekle birlikte sekmelerindeki süreçler (torunlar dahil) ve WebView2'nin
hata ayıklama portu (9333) da kapanıyor; ölçüldü, arkada süreç kalmadı.

Eski tarif (`Get-Process nterminal, cargo, node | Where-Object { $_.Path -like
"*NTerminal*" }`) iki yönden yanlıştı. `-like` büyük/küçük harfe bakmıyor ve
kurulu uygulamanın `C:\Program Files\N-Terminal\nterminal.exe` yolunu da
tutuyordu: kullanıcının kendi terminalini, içindeki sunucularla birlikte
öldürürdü (denendi, açık üç kurulu örneğin üçünü de seçti). Vite'ın
`node.exe`'si ise depoda değil, hiç eşleşmiyordu; 5273 açık kalıyordu.

Kullanıcı "kapat" demediyse **kapatma** — çalışan uygulamaya bakıyor olabilir.
Açık bıraktığında hangi portların (5273, 9333) açık kaldığını söyle.
