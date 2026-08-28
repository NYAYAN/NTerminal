# NTerminal

Windows için gruplanabilir sekmeli terminal. Gruplar, gruba bağlı sekmeler,
oturum devamlılığı, komut geçmişi ve ayarların makineler arası taşınması.

Tauri 2 (Rust / ConPTY) + xterm.js 6 üzerine kurulu.

---

## Ne yapar

**Gruplar ve sekmeler.** Sekmeler gruplara bağlı. Her grubun kendi rengi,
varsayılan kabuk profili, başlangıç klasörü ve kendine özel ortam değişkenleri
var — bir projeye ait sekmeler `NODE_ENV=development` ile açılırken diğerleri
etkilenmez. Sekmeler gruplar arasında taşınabilir.

**Sekme adlandırma.** Sekmeye çift tıklayarak (ya da sağ tık menüsünden,
`Ctrl+Shift+R` ile) ad verilir. Elle verilen ad kabuğun kendi başlığını ezer ve
küçük bir işaretle belirtilir; boş bırakmak adı sıfırlar, başlık yeniden
klasör/kabuk adından türetilir. Aynı işlem kenar çubuğundaki sekme satırında da
geçerli. Gruplar da aynı şekilde adlandırılıyor.

**Grup düzeni.** Kenar çubuğunun başlığından tüm grupları tek tuşla katlayıp
açabilirsiniz (biri bile açıksa hepsi katlanır, hepsi katlıysa hepsi açılır).
Gruplar favori işaretlenebilir (sağ tık → *Favori Gruba Ekle* ya da satırdaki
yıldız) ve ★ süzgeciyle yalnızca favoriler listelenir — çok grupla çalışırken
listeyi kısaltmak için. Süzgeç açıkken **etkin grup favori olmasa da listede
kalır**; aksi hâlde çalıştığınız yeri gözden kaybediyorsunuz.

**Sürükle-bırak.** Sekmeler hem sekme çubuğunda hem kenar çubuğunda
sürüklenerek yeniden sıralanır. Kenar çubuğunda bir sekmeyi başka bir grubun
üstüne bırakmak onu o gruba taşır. Bırakma konumu ince bir çizgiyle gösteriliyor;
imleç öğenin ilk yarısındaysa öncesine, ikinci yarısındaysa sonrasına bırakılır.

**Sekme kilidi.** Sürekli açık kalması gereken sekmeler kilitlenebilir
(`Ctrl+Shift+L` ya da sağ tık → *Kilitli*). Kilitli sekmede kapatma düğmesinin
yerini kilit simgesi alıyor; kapatma düğmesi, orta tuş, `Ctrl+W`, *diğerlerini
kapat* ve grup silme — hepsi reddediliyor. Kilit bir onay penceresi değil: tek
tıkla aşılabilen bir kilidin koruma değeri olmaz, kapatmak için önce kilidi
kaldırmak gerekiyor. Kilit durumu çalışma alanıyla birlikte kaydedilir ve
aktarıma dahildir.

**Favori komutlar.** Sık kullandığınız komutlar yıldızlanıp ayrı bir listede
tutulur — geçmişten ayrı, çünkü geçmiş otomatik birikip sınır aşılınca budanıyor.
Favoriye kısa bir ad, not, klasör ve "yalnızca şu grupta görünsün" kısıtı
verilebilir; sıralaması elle ayarlanır. Klasör tanımlıysa çalıştırmadan önce o
klasöre geçilir. `Ctrl+Shift+B` panelini açar, `Ctrl+R` hızlı çağırmada
favoriler listenin başında gelir, komut paletinde de doğrudan çalıştırılabilir.

**Kaldığı yerden devam.** Uygulama kapanırken grup/sekme düzeni, her sekmenin
çalışma dizini ve ekran çıktısı diske yazılır. Yeniden açıldığında düzen geri
gelir, sekmeye girdiğinizde önceki çıktı ekranda durur ve altında ayırıcı bir
satırla yeni kabuk başlar. Sekmeler tembel açılır: 20 sekmeli bir çalışma alanı
açılışta 20 kabuk süreci başlatmaz, sekmeye tıkladığınızda başlar.

> Kabuk süreçleri uygulamayla birlikte kapanır. Geri yüklenen içerik geçmiş
> ekran görüntüsüdür, canlı bir oturum değildir (tmux gibi değil).

**Komut geçmişi.** Çalıştırdığınız her komut; klasörü, çıkış kodu, süresi ve
zamanıyla kaydedilir. Sağdaki panelde bu sekmenin / bu grubun / tümünün geçmişi
aranabilir, başarılı-hatalı filtrelenebilir, tekrarlar gizlenebilir. Satırlar
seçilip istem satırına yazılabilir, çalıştırılabilir, kopyalanabilir veya
silinebilir. `Ctrl+R` ile hızlı geri çağırma: iki üç harf yaz, Enter'a bas.

**Ayar aktarımı.** Tek JSON dosyasına dışa aktarım; karşı makinede içe alım.
Yollar `${HOME}` gibi belirteçlere çevrildiği için başka bir kullanıcı adındaki
makinede de çalışır, kabuk konumları (PowerShell 7, Git Bash…) o makinede
yeniden aranır. Ne değiştiğini uygulamadan önce görebilirsiniz.

---

## Gereksinimler

| | |
|---|---|
| Windows | 10 1809+ / 11 (ConPTY gerektirir) |
| WebView2 | Windows 11'de yerleşik; Windows 10'da [Evergreen Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) |
| Node.js | 20+ (yalnızca geliştirme) |
| Rust | 1.82+ (yalnızca geliştirme) |
| Visual Studio | C++ masaüstü geliştirme bileşeni (yalnızca geliştirme) |

## Kurulum ve çalıştırma

```bash
npm install
```

Geliştirme kipinde başlat:

```bash
npm start
```

Dağıtım yapısı (exe + kurucu) üret:

```bash
npm run bundle
```

Testleri koş:

```bash
npm test
```

Çıktılar `src-tauri/target/release/` ve `.../release/bundle/` altında.

### Neden `npx tauri dev` yerine `npm start`?

`scripts/win-env.ps1`, derlemeden önce **kullanılabilir** bir MSVC toolset'i
bulup ortamı kuruyor. Bu makinede iki Visual Studio kurulumu var ve rustc her
zaman en yeni toolset'i seçiyor; yeni olan (VS 18 / MSVC 14.50) linker'ı
içerdiği hâlde x64 CRT kütüphanelerini (`msvcrt.lib`) içermiyor, dolayısıyla
doğrudan `cargo build` şununla düşüyor:

```
LINK : fatal error LNK1104: cannot open file 'msvcrt.lib'
```

Betik toolset'leri `lib\x64\msvcrt.lib` var mı diye tarıyor, sağlam olanın
`vcvars64` ortamını içeriye alıyor ve linker'ı `cargo`'ya açıkça bildiriyor.
Bu yüzden hangi VS kurulu olduğundan bağımsız çalışır — başka bir makineye
taşıdığınızda da uğraşmanız gerekmez.

---

## Kabuk entegrasyonu

Komut geçmişinin doğru olması için uygulamanın *hangi komutun çalıştığını, ne
zaman bittiğini ve hangi kodla çıktığını* bilmesi gerekiyor. Tuş vuruşlarını
saymak bunu vermez: yön tuşlarıyla düzenleme, sekme tamamlama, geçmişten çağırma
hepsi yanlış metin üretir.

Bunun yerine kabuğa küçük bir başlangıç betiği yükleniyor. Betik, VS Code ve
WezTerm'in de kullandığı **OSC 133 / OSC 633** anlamsal istem işaretlerini
gönderiyor:

| Dizi | Anlamı |
|---|---|
| `OSC 133;A` | İstem (prompt) çizilmeye başlıyor |
| `OSC 133;B` | İstem bitti, komut girişi burada başlıyor |
| `OSC 133;C` | Komut çalışmaya başladı |
| `OSC 133;D;<kod>` | Komut bitti, çıkış kodu |
| `OSC 633;E;<komut>` | Çalıştırılan komutun metni |
| `OSC 633;P;Cwd=<yol>` | Geçerli klasör |
| `OSC 7;file://…` | Geçerli klasör (standart biçim) |

Betikler `src-tauri/shell-integration/` altında; exe'nin içine gömülü olarak
dağıtılıyor ve her açılışta veri klasörüne yazılıyor.

### Destek durumu

| Kabuk | Komut metni | Çıkış kodu | Süre | Klasör |
|---|---|---|---|---|
| PowerShell 7 (pwsh) | ✅ | ✅ | ✅ | ✅ |
| Windows PowerShell 5.1 | ✅ | ✅ | ✅ | ✅ |
| Git Bash / MSYS | ✅ | ✅ | ✅ | ✅ |
| WSL | ✅ | ✅ | ✅ | ✅ |
| cmd.exe | ⚠️ tampondan | ❌ | ✅ | ✅ |
| Özel profil | ⚠️ tampondan | ❌ | ⚠️ | ❌ |

**PowerShell**, kullanıcının kendi `prompt` fonksiyonunu ve profilini bozmuyor;
sarmalıyor. Komut metni PSReadLine'ın `PSConsoleHostReadLine` kancasından
alınıyor; PSReadLine yoksa `Get-History` yedeğine düşüyor (süre de oradan
geliyor). Çıkış kodu için `$LASTEXITCODE` değişimi izleniyor — yalnızca `$?`
bakmak yerel uygulamaların (`git`, `dotnet`) gerçek kodunu kaçırırdı.

**Bash**, `--init-file` ile yüklendiği için kullanıcının `~/.bashrc`'sini
betiğin kendisi yüklüyor; aksi hâlde takma adlar ve PATH ayarları kaybolurdu.
Komut yakalama `DEBUG` tuzağıyla yapılıyor, ama tuzak *her* basit komutta
tetikleniyor — kullanıcının komutunda da, `PROMPT_COMMAND` parçalarında da,
başlangıç betiğinin kendi satırlarında da. Ayırt etmek için `PROMPT_COMMAND`'ın
en sonuna bir sentinel (`__nterm_prompt_done`) ekleniyor: yalnızca o çalıştıktan
sonraki ilk tetikleme kullanıcının komutu sayılıyor. Alternatifler yetmiyordu —
`history` numarasını karşılaştırmak `HISTCONTROL=ignoredups` ile tekrarlanan
komutları kaçırıyor, basit bir "bir kez bildir" bayrağı ise kullanıcının kendi
`PROMPT_COMMAND` parçalarını komut sanıyordu.

**cmd.exe** çıkış kodu bildiremiyor: `PROMPT` değişkeni her istemde yeniden
değerlendiriliyor ama `%ERRORLEVEL%` atama anında bir kez çözülüyor. İstem ve
klasör işaretleri geliyor, komut metni ise ekran tamponundan okunuyor.

### "Tampondan" ne demek?

Entegrasyon komut metni vermediğinde, Enter'a basıldığı anda ekran tamponu
okunuyor: `OSC 133;B` ile işaretlenen noktadan imlece kadar olan metin. Bu,
tuş vuruşlarını saymanın aksine satır düzenlemeye, tamamlamaya ve satır
kaydırmasına dayanıklı.

---

## Tema okunabilirliği

Geleneksel terminal paletleri açık zeminde okunamayan renkler içeriyor. Resmî
Solarized Light şemasında `brightWhite` doğrudan arka planın aynısı (`#fdf6e3`),
`white` ise bir tık farkı olan `#eee8d5`. Kabuklar bu renkleri bolca kullandığı
için (PSReadLine sayıları "White" ile boyuyor, pek çok araç vurgu için "bright
white" veriyor) yazılan metin görünmez oluyordu.

Tek tek renk düzeltmek yerine palet bir okunabilirlik süzgecinden geçiyor
(`src/lib/contrast.ts`): her renk arka plana karşı WCAG karşıtlık oranıyla
ölçülüyor, eşiğin altındaysa tonu korunarak arka plandan uzaklaştırılıyor —
açık zeminde koyulaşıyor, koyu zeminde açılıyor. Eşikler: normal palet renkleri
için 3.2, varsayılan metin rengi için 4.5.

Solarized Açık'ta ölçülen sonuç:

| Renk | Önce | Sonra |
|---|---|---|
| `brightWhite` | `#fdf6e3` — karşıtlık **1.00** (görünmez) | `#8b877d` — 3.32 |
| `white` | `#eee8d5` — 1.14 | `#838075` — 3.67 |
| `brightCyan` | `#93a1a1` — 2.48 | `#7d8989` — 3.35 |
| `yellow` | `#b58900` — 2.98 | `#ac8200` — 3.27 |
| `foreground` | `#586e75` — 4.99 | değişmedi |

Zaten yeterli karşıtlığa sahip renklere dokunulmuyor, dolayısıyla koyu temalar
(paletleri bu açıdan sağlam) olduğu gibi kalıyor. Testler bu güvenceyi tüm
temalar için doğruluyor: hiçbir palet renginin arka planla karışmadığı
iddiası her tema üzerinde ayrı ayrı ölçülüyor.

---

## Veri dosyaları

Varsayılan konum `%APPDATA%\NTerminal`:

| Dosya | İçerik |
|---|---|
| `settings.json` | Görünüm, davranış, kabuk profilleri, kısayollar |
| `workspace.json` | Gruplar (favori işareti dahil), sekmeler, kilit durumu, çalışma dizinleri |
| `history.jsonl` | Komut geçmişi (append-only günlük) |
| `favorites.json` | Favori komutlar |
| `scrollback/<sekme>.ansi` | Sekme başına kaydedilmiş ekran çıktısı |
| `shell-integration/` | Kabuğa yüklenen betikler |

Ayar bolumleri (`appearance`, `behavior`) kapsayici duzeyinde
`serde(default)` tasiyor: yeni bir alan eklendiginde diskte duran eski dosya
okunmaya devam eder, eksik alan varsayilanla dolar. Bu nitelik olmadan tek bir
yeni alan kullanicinin tum ayarlarini sifirliyor - testler bu gocu dogruluyor.

Yazma her zaman "geçici dosyaya yaz + yerine taşı" biçiminde: yarım yazılmış
bir `settings.json` tüm yapılandırmayı kaybettirmesin.

`history.jsonl` her komut için iki satır yazıyor — başlarken `add`, bitince
`fin`. Böylece her komut sonunda 50 bin satırlık dosya baştan yazılmıyor.
Günlük şiştiğinde kendiliğinden sıkıştırılıyor.

### Taşınabilir kip

Exe'nin yanına `nterminal-data` adlı bir klasör açarsanız tüm yapılandırma
oradan okunur/yazılır. Uygulamayı klasörüyle birlikte kopyalamak (USB, ağ
paylaşımı) ayarları da taşır. `NTERMINAL_DATA_DIR` ortam değişkeni de aynı işi
yapar.

---

## Ayarları başka makineye taşımak

**Dışa aktarma** (`Aktar` → `Dışa aktar`) neyin dosyaya yazılacağını
seçtiriyor: ayarlar, çalışma alanı, favori komutlar, komut geçmişi, ekran
çıktıları. Favoriler varsayılan olarak dahil — başka makinede ilk isteyeceğiniz
şeylerden biri.

*Taşınabilir yollar* açıkken makineye özel ön ekler belirteçlere çevrilir:

```
C:\Users\ali\Desktop\proje   →   ${HOME}\Desktop\proje
C:\Program Files\Git\...     →   ${PROGRAMFILES}\Git\...
```

Uzun yollar önce eşleşir; `%LOCALAPPDATA%` altındaki bir yol yanlışlıkla
`${HOME}\AppData\Local\...` olarak yazılmaz.

**İçe alma** iki adımlı: dosya seçilince ne olacağı gösterilir, onaydan sonra
uygulanır. Ön izleme ile uygulama tam olarak aynı kodu çalıştırıyor, dolayısıyla
gördüğünüz rapor gerçekleşecek olanla birebir aynı.

Karşı makinede:

- Belirteçler o makinenin gerçek yollarına açılır.
- Kabuk konumları doğrulanır. Bulunamayan bir kabuk için aynı türden kurulu bir
  kabuk varsa yol düzeltilir ve raporda *düzeltildi* olarak görünür; yoksa
  profil devre dışı işaretlenir ve *uyarı* olarak listelenir.
- Var olmayan klasörler temizlenir (grup varsayılanı düşer, sekmeler ev dizinine
  döner).

Her bölüm için kip seçilebilir:

| Kip | Anlamı |
|---|---|
| **Değiştir** | Mevcut olanı tamamen gelen dosyayla değiştir |
| **Birleştir** | Gelen kazanır; yerelde olup gelende olmayan korunur |
| **Atla** | Bu bölüme dokunma |

Gruplarda *birleştir*, gelen grupları mevcutların yanına ekler; ad çakışırsa
`(gelen)` eki verir. Mevcut düzeniniz bozulmaz.

---

## Klavye kısayolları

Hepsi Ayarlar → Kısayollar altından değiştirilebilir ve ayarlarla birlikte
dışa aktarılır.

| Kısayol | Eylem |
|---|---|
| `Ctrl+T` | Yeni sekme |
| `Ctrl+W` | Sekmeyi kapat |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Sonraki / önceki sekme |
| `Ctrl+1`…`Ctrl+9` | Gruptaki n. sekmeye geç |
| `Ctrl+Shift+N` | Yeni grup |
| `Ctrl+Shift+H` | Geçmiş panelini aç/kapat |
| `Ctrl+R` | Geçmişte hızlı arama (favoriler önce) |
| `Ctrl+Shift+B` | Favori komutlar |
| `Ctrl+Shift+P` | Komut paleti |
| `Ctrl+Shift+R` | Sekmeyi yeniden adlandır |
| `Ctrl+Shift+L` | Sekme kilidini aç/kapat |

Kenar çubuğu başlığındaki ★ favori süzgecini, ⌃/⌄ tüm grupları katlar/açar.
| `Ctrl+Shift+K` | Terminali temizle |
| `Ctrl+Shift+F` | Terminalde ara |
| `Ctrl+Shift+C` / `Ctrl+Shift+V` | Kopyala / yapıştır |
| `Ctrl+,` | Ayarlar |
| `Ctrl+=` / `Ctrl+-` / `Ctrl+0` | Yazıyı büyült / küçült / sıfırla |

Sekme çubuğunda çift tık yeniden adlandırır, orta tuş kapatır, sağ tık menüyü
açar. Kenar çubuğundaki grup ve sekme satırlarında da aynı davranışlar geçerli.

---

## Proje yapısı

```
src/                          arayüz (React + TypeScript)
  terminal/TerminalSession.ts   xterm ↔ PTY ↔ geçmiş bağlayıcısı, OSC durum makinesi
  store/useStore.ts             gruplar, sekmeler, ayarlar; oturum kayıt defteri
  components/                   kenar çubuğu, sekmeler, geçmiş, favoriler, ayarlar
  lib/contrast.ts               palet okunabilirlik süzgeci (WCAG karşıtlık)
  lib/labels.ts                 sekme adı / kabuk kodu / ikincil satır mantığı
  lib/ipc.ts                    Rust komutlarının tek geçiş noktası
src-tauri/
  src/pty.rs                    ConPTY oturumları, çıktı toplama
  src/history.rs                komut geçmişi deposu (JSONL günlük)
  src/favorites.rs              favori komutlar deposu
  src/transfer.rs               içe/dışa aktarım, yol taşınabilirliği
  src/store.rs                  settings/workspace kalıcılığı (atomik yazma)
  src/shells.rs                 kurulu kabukların tespiti
  shell-integration/            PowerShell / bash / cmd betikleri
scripts/                        MSVC ortamı, dev, build, test sarmalayıcıları
```

### Neden bazı kararlar böyle

**Çıktı toplama.** `dir /s C:\` saniyede binlerce küçük parça üretiyor. Her
parçayı ayrı bir IPC olayı yapmak arayüzü kilitliyordu; okuyucu iş parçası
kanala yazıyor, ayrı bir yayıncı iş parçası 6 ms'lik pencerelerde toplayıp tek
olay gönderiyor. Olay sayısı ~50 kat azalıyor, gecikme göze görünmüyor.

**Base64.** PTY çıktısı geçerli UTF-8 olmak zorunda değil: çok baytlı bir
karakter iki okuma arasında bölünebilir. Ham baytlar base64 olarak taşınıp
xterm'e `Uint8Array` veriliyor — xterm parçalı UTF-8'i kendi içinde doğru
birleştiriyor.

**Geçmiş için SQLite değil JSONL.** Kayıt sayısı on binler mertebesinde
kalıyor, tam liste bellekte rahat duruyor. Düz JSON olması dışa/içe aktarımı
bedava hâle getiriyor ve native bir bağımlılık eklemiyor.

**Sıralama matematiği tek yerde.** Sürükle-bırak hedefi ekranda görülen
sıraya göre hesaplanıyor, ama öğeyi diziden çıkarmak sonraki indeksleri bir
kaydırıyor. Bu düzeltme `reorder()` içinde, tek noktada; sekme çubuğu ve kenar
çubuğu aynı fonksiyonu çağırıyor. İki ayrı kod yolu olsa düzeltme birinde
yanlış kalırdı — testler ileri/geri/uç durumları ayrı ayrı doğruluyor.

**Favoriler geçmişten ayrı depoda.** Aynı yerde tutulsa favoriler geçmiş
sınırı aşıldığında ya da kullanıcı "bu sekmenin geçmişini temizle" dediğinde
sessizce kaybolurdu. Ayrıca favorilerin sırası kullanıcının belirlediği sıra,
geçmişin sırası ise zaman — tek listede ikisi olamaz.

**Sekme adlandırma odağı.** Terminale odak vermek koşulsuz yapıldığında
adlandırma kullanılamıyordu: sekmeye çift tıklandığında kutu açılıyor, hemen
ardından (sekme ilk kez açılıyorsa kabuk başlatıldıktan sonra, asenkron olarak)
`setActive` terminale odaklanıyor, kutu `onBlur` ile kapanıp kaydediyordu.
Artık odak verilirken etkin öğe bir metin kutusuysa dokunulmuyor — xterm'in
kendi gizli textarea'sı bu kuralın dışında.

**Terminal boşluk dolgusu xterm öğesinin kendisinde.** `FitAddon` satır
sayısını `floor((ebeveyn yüksekliği − xterm öğesinin dolgusu) / hücre)` ile
buluyor — **ebeveynin** dolgusunu hesaba katmıyor. Dolgu sarmalayıcıda
(`.term-host`) olduğunda fit gerçek iç alandan büyük bir yükseklik görüp fazla
satır üretiyordu ve son satır — kullanıcının yazdığı satır — durum çubuğunun
altına taşıyordu. Ölçülen: 627 px yükseklik / 12 px hücre = 52 satır = 624 px,
gerçek iç alan 609 px → **5 px bindirme**. Dolgu xterm öğesine taşındığında 50
satır ve 19 px boşluk. Ana ızgara satırları da sabit yükseklikten `auto`ya
geçirildi: sabit 34 px, sekme çubuğunun gerçek 35 px'inden küçüktü.

**Gizli sekmeler `display:none` değil.** Görünmeyen terminaller
`visibility:hidden` ile saklanıyor ama düzende kalıyor; `display:none` xterm'in
ölçüm hesabını sıfırlıyor ve sekmeye dönüldüğünde satırlar kayıyor.

**WebGL yalnızca etkin terminalde.** Her sekme kendi WebGL bağlamını tutsa
tarayıcının bağlam sınırına çarpardık. Sekme değişince bağlam bırakılıyor;
bağlam kaybında sessizce DOM oluşturucuya dönülüyor.

---

## Testler

```bash
npm test
```

- **Arayüz (81 test)** — OSC kaçış çözme ve 133/633/7 ayrıştırma (betiklerle
  simetrik olmak zorunda), base64 çözücü (UTF-8 dışı baytlar dahil), kısayol
  eşleştirme, biçimlendirme, bulanık arama, sekme etiketi mantığı, sekme kilidi
  kuralları, sıralama/sürükle-bırak indeks matematiği, grup görünürlük süzgeci,
  tüm temalar için palet karşıtlık güvencesi ve terminal boşluk dolgusunun doğru
  yerde durduğunu doğrulayan düzen değişmezi.
- **Rust birim (48 test)** — geçmiş deposu (filtreleme, arama, sınır aşımı, diskten
  yeniden okuma, bozuk satıra dayanıklılık, sıkıştırma), yol taşınabilirliği
  (gidiş-dönüş, harf duyarsızlığı, uzun yol önceliği), birleştirme kipleri,
  kabuk başlatma argümanları, Windows sürüm okuma, favori deposu (sıralama,
  yinelenen komut, bozuk dosyaya dayanıklılık) ve **dışa aktar → başka makine
  gibi oku → uygula** zincirinin tamamı.
- **Uçtan uca (6 test)** — gerçek ConPTY içinde gerçek PowerShell, bash ve
  cmd.exe başlatıp OSC işaretlerini okuyor: istem işaretleri, komut metni, çıkış
  kodu `0` ve yerel uygulamanın `3`'ü, hatadan sonra tekrar `0`, noktalı virgül
  kaçışı, klasör bildirimi. Bash testi ayrıca iki şeyi kilitliyor: ilk bildirilen
  komut kullanıcının komutu olmalı (başlangıç betiğinin satırı değil) ve bir boru
  hattı tek kayıt açmalı. Ayrı bir test de boş satırda Enter'a basmanın önceki
  komutu ikinci kez kaydetmediğini doğruluyor.

Entegrasyon testleri ConPTY'nin açılışta gönderdiği `ESC[6n` imleç konumu
sorgusunu elle yanıtlıyor — gerçek uygulamada bunu xterm.js kendiliğinden
yapıyor, yanıtlanmazsa kabuk çıktı üretmeye başlamıyor.

---

## Bilinen sınırlar

- Kabuk süreçleri uygulamayla kapanır; arka planda canlı oturum tutulmuyor.
- `cmd.exe` için çıkış kodu bildirilemiyor (yukarıda anlatıldı).
- Bölünmüş bölme (split pane) yok; ayrım gruplar ve sekmeler üzerinden.
- Yalnızca Windows: ConPTY ve kabuk tespiti Windows'a özgü.
