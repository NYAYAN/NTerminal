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

## Ön plan yokken: uygulamayı CDP ile sür

Kullanıcı uzak masaüstündeyse (RDP) ve pencere küçültülmüş ya da arkadaysa
`GetForegroundWindow` sıfır döner, `SendKeys` "Erişim engellendi" verir,
`CopyFromScreen` kilit ekranını ya da bayat kareyi yakalar. `LogonUI`
var/yok diye bakmak da yanıltıyor — başka bir oturumun kilidi olabilir
(`SessionId` karşılaştır). Bu durumda tuş göndermeyi bırak; WebView2'yi
uzaktan hata ayıklama portuyla aç ve Chrome DevTools Protocol'den sür:

```powershell
$env:NTERMINAL_DATA_DIR = "$env:TEMP\nterminal-dev-data"
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9222"
Start-Process "C:\Users\nurullah.yayan\Desktop\Work\NYAYAN\NTerminal\src-tauri\target\debug\nterminal.exe" -WorkingDirectory "C:\Users\nurullah.yayan\Desktop\Work\NYAYAN\NTerminal\src-tauri"
```

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

```powershell
Get-Process nterminal, cargo, node -ErrorAction SilentlyContinue |
  Where-Object { $_.Path -like "*NTerminal*" } | Stop-Process -Force
```

Kullanıcı "kapat" demediyse **kapatma** — çalışan uygulamaya bakıyor olabilir.
