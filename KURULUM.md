# Kurulum

Kısa yol: derle, kur, çalıştır. Ayrıntılar ve gerekçeler için
[README.md](README.md).

---

## 1. Bağımlılıklar (bir kez)

Proje klasöründe:

```bash
cd C:\Users\nurullah.yayan\Desktop\Work\NYAYAN\NTerminal
```

```bash
npm install
```

Bilgisayarda olması gerekenler:

| | |
|---|---|
| Node.js | 20+ |
| Rust | 1.82+ |
| Visual Studio | "C++ ile masaüstü geliştirme" bileşeni |
| Windows | 10 1809+ / 11 |

Windows 10 kullanıyorsan ayrıca
[WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)
gerekiyor; Windows 11'de yerleşik.

## 2. Kurucuyu üret

```bash
npm run bundle
```

Beş on dakika sürer (ilk derlemede daha uzun). Sonunda ekrana üretilen
dosyaların yolları yazılır.

**Oluşan dosyalar** — `src-tauri\target\release\bundle\` altında:

| Dosya | Ne işe yarar |
|---|---|
| `nsis\N-Terminal_0.1.0_x64-setup.exe` | Normal kurulum (önerilen, ~2,3 MB) |
| `msi\N-Terminal_0.1.0_x64_en-US.msi` | Kurumsal dağıtım / grup ilkesi (~2,9 MB) |

Ayrıca `src-tauri\target\release\nterminal.exe` var: kurulum yapmadan
doğrudan çalıştırılabilen ikili (~5 MB). Taşınabilir kullanım için yeterli
ama Başlat menüsüne kısayol koymaz.

> **`Access is denied` hatası alırsan** N-Terminal açıktır: çalışan
> `nterminal.exe` üzerine yazılamıyor. Uygulamayı kapatıp yeniden dene.

> **MSI ile güncelledikten sonra görev çubuğundaki simge boşaldıysa:** bu
> düzeltmeden önce üretilen MSI'lar Başlat menüsü kısayoluna Windows
> Installer'ın önbelleğindeki bir simgeyi veriyordu ve o dosya her
> güncellemede siliniyor. O kısayoldan sabitlenmiş düğme bir süre sonra
> resimsiz kalıyordu. Yeni MSI'da kısayol exe'nin kendi simgesini kullanıyor.
> Eski bir kurulumdan kalan sabitlemeyi bir kez düzeltmek yetiyor: görev
> çubuğundaki simgeye sağ tık → *Görev çubuğundan kaldır*, sonra Başlat
> menüsünde N-Terminal'e sağ tık → *Görev çubuğuna sabitle*.

> **MSI'dan `setup.exe`'ye geçerken** aynı belirti başka bir sebepten
> görülüyor. NSIS kurucusu MSI kurulumunu kaldırıp uygulamayı
> `C:\Program Files\N-Terminal\`dan kullanıcı klasörüne
> (`%LOCALAPPDATA%\N-Terminal\`) taşıyor. Sabitlenmiş düğme hâlâ eski yolu
> gösteriyor, resmi boşalıyor, uygulama kapalıyken tıklanınca da açılmıyor.
> Düzeltmesi yukarıdakiyle aynı: kaldırıp yeniden sabitlemek. Windows tepsi
> simgesinin görünürlüğünü exe yoluna göre hatırladığı için saatin yanındaki
> simge de **^** altına düşebilir: *Ayarlar › Kişiselleştirme › Görev çubuğu
> › Diğer sistem tepsisi simgeleri*'nden N-Terminal'i açın ya da simgeyi
> **^** altından görev çubuğuna sürükleyin. İki kurucu arasında gidip
> gelmemek en iyisi. Uygulamanın içinden gelen güncellemeler zaten kurulu
> olanın türünü koruyor (`latest.json`'da `windows-x86_64-nsis` ve `-msi`
> ayrı).

## 3. Kur

`N-Terminal_0.1.0_x64-setup.exe` dosyasına çift tıkla, ileri de. Kurulum
kullanıcı klasörüne yapılır, yönetici hakkı istemez.

Kurulduğu yer:

```
C:\Users\<kullanıcı>\AppData\Local\N-Terminal\
```

Ayarlar ve geçmiş ayrı bir yerde durur, kaldırma işlemi bunları silmez:

```
C:\Users\<kullanıcı>\AppData\Roaming\NTerminal\
```

## 4. Geliştirirken

Kurmak yerine kaynaktan çalıştırmak için:

```bash
npm start
```

Kod değişince arayüz kendini yeniler. Rust tarafını değiştirirsen uygulama
yeniden derlenip başlar.

> `TerminalSession.ts` değişince **açık sekmeler eski davranışı sürdürür**:
> arayüz modülü yenilenir ama zaten yaratılmış oturum nesneleri yenilenmez.
> Değişikliği görmek için yeni sekme aç ya da uygulamayı kapat-aç.

Testler:

```bash
npm test
```

Üçü de (`npm start`, `npm run bundle`, `npm test`) iki platformda aynı
komut. Windows'ta arada `scripts\win-env.ps1` çalışır ve kullanılabilir bir
MSVC toolset'i bulur — makinede iki Visual Studio kuruluysa rustc yanlış
olanı seçip `LNK1104: cannot open file 'msvcrt.lib'` ile düşüyor.

## macOS

Aynı komutlar çalışır; çıktı `bundle\macos\*.app` ve `bundle\dmg\*.dmg`
olur. macOS paketi bir Mac'te üretilmek zorunda — Apple SDK'sı olmadan
çapraz derleme mümkün değil.

İsteğe bağlı, bir kez: `sh scripts/macos-cert.sh` anahtar zincirine
**NTerminal Dev** imza kimliğini ekler. `npm run bundle` sonra paketi onunla
imzalar ve macOS izinleri (Tam Disk Erişimi vb.) her derlemede sıfırlanmaz.
Kabuktaki `APPLE_SIGNING_IDENTITY` kullanılmaz; gerekçe README'de.

## Temizlik

`src-tauri\target\release\bundle\nsis\` altında eski adla üretilmiş
`NTerminal_0.1.0_x64-setup.exe` kalmış olabilir (ürün adı **N-Terminal**
oldu). Karıştırmamak için silinebilir; derleme onu yeniden üretmiyor.
