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

## Kapatma

```powershell
Get-Process nterminal, cargo, node -ErrorAction SilentlyContinue |
  Where-Object { $_.Path -like "*NTerminal*" } | Stop-Process -Force
```

Kullanıcı "kapat" demediyse **kapatma** — çalışan uygulamaya bakıyor olabilir.
