# Geliştirme

Kaynaktan derleme, mimari, testler ve yayın süreci. Adım adım derleme için
[KURULUM.md](../KURULUM.md); kararların arkasındaki ölçümler ve açık işler için
[NOTLAR.md](../NOTLAR.md).

- [Gereksinimler](#gereksinimler)
- [Kurulum ve çalıştırma](#kurulum-ve-çalıştırma)
- [Proje yapısı](#proje-yapısı)
- [Testler](#testler)

## Gereksinimler

| | |
|---|---|
| Windows | 10 1809+ / 11 (ConPTY gerektirir) |
| macOS | 11 Big Sur+, yalnızca Apple Silicon paketi (Intel için kaynaktan derleyin) |
| WebView2 | Yalnızca Windows. 11'de yerleşik; 10'da [Evergreen Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) |
| Node.js | 20+ (yalnızca geliştirme) |
| Rust | 1.82+ (yalnızca geliştirme) |
| Visual Studio | C++ masaüstü geliştirme bileşeni (yalnızca Windows'ta geliştirme) |
| Xcode Command Line Tools | `xcode-select --install` (yalnızca macOS'ta geliştirme) |

macOS'ta WebView2 gerekmiyor: sistemin WKWebView'ü kullanılıyor.

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

Üç komut da **iki platformda aynı**. Çıktılar `src-tauri/target/release/`
altında: Windows'ta `bundle/nsis/*.exe` ve `bundle/msi/*.msi`, macOS'ta
`bundle/macos/*.app` ve `bundle/dmg/*.dmg`.

macOS paketi bir Mac'te üretilmek zorunda: Apple SDK'sı olmadan çapraz derleme
mümkün değil. Windows kurucusu da aynı şekilde Windows'ta üretiliyor.

**MSI şablonu projede, ama elle yazılmıyor.** `src-tauri/wix/main.wxs`
Tauri'nin kendi şablonu, tek bir satır eksik: Başlat menüsü kısayolunun
`Icon="ProductIcon"` satırı. O simge Windows Installer'ın ürün koduna bağlı
önbelleğinde duruyor, ürün kodu her derlemede değişiyor ve güncelleme eski
klasörü siliyor. Kısayoldan görev çubuğuna sabitlenen düğmenin resmi her MSI
güncellemesinden sonra boşalıyordu; simgesiz kısayol exe'nin simgesini
gösteriyor. Şablon kurulu CLI'den üretiliyor:

```bash
node scripts/wix-template.mjs
```

Tauri güncellendiğinde bu komut yeniden koşulmalı; unutulursa `npm test`
(CI'da Windows paket işi) şablonun CLI'dekinden kaydığını söylüyor. İkisi
de yalnızca Windows'ta iş görüyor: WiX şablonu CLI'nin Windows derlemesinde
var, macOS'takinde yok. macOS'ta komut "uygulanamaz" diyor, test de
atlanıyor.

### macOS paketinin imzası ve ilk açılış

**Paket Apple kimliğiyle imzalı değil, ad-hoc imzalı.** Tarayıcıdan indirilen
bir uygulamayı macOS ilk açılışta denetliyor (Gatekeeper) ve Apple'ın
onaylamadığı paketi açmıyor: "Apple, N-Terminal'in kötü amaçlı yazılım
içermediğini doğrulayamadı". Açmanın yolu **Sistem Ayarları › Gizlilik ve
Güvenlik › Yine de Aç** — adımları [Paketi indirip kurmak](../README.md#paketi-indirip-kurmak)
bölümünde. Bir kez yapılıyor; uygulamanın kendi kurduğu güncellemelerde
karantina işareti olmadığı için tekrar etmiyor.

**Eskiden "hasarlı" diyordu.** CI ad-hoc imzayı eklemeden önceki paketlerde
yalnızca ikilinin bağlayıcı imzası vardı, paketin kaynakları mühürsüzdü;
macOS o pakete **"hasarlı, Çöp'e taşıyın"** diyor ve "Yine de Aç" düğmesini
HİÇ göstermiyor. ÖLÇÜLDÜ (macOS 27, aynı kod, karantinalı iki kopya): imzasız
paket *“…” is damaged and can’t be opened* + yalnızca *Move to Trash / Cancel*;
ad-hoc paket *“…” Not Opened — Apple could not verify…* ve Gizlilik ve
Güvenlik'te *“…” was blocked to protect your Mac. [Open Anyway]*. İş akışındaki
tek fark `APPLE_SIGNING_IDENTITY: "-"`.

Eski bir paket "hasarlı" diyorsa (ya da Terminal tercih ediliyorsa) karantina
damgasını kaldırmak da açıyor:

```bash
xattr -dr com.apple.quarantine /Applications/N-Terminal.app
```

Komut `Permission denied` derse uygulamanın dosyaları sizin hesabınıza ait
değildir — örneğin `/Applications`'a başka bir yönetici hesabıyla ya da
yönetici parolası sorularak kopyalandıysa. O zaman aynı komutu `sudo` ile
koşun; yönetici parolası sorulur (yazarken ekranda görünmez, Enter yeterli):

```bash
sudo xattr -dr com.apple.quarantine /Applications/N-Terminal.app
```

Komut bir kez koşuluyor; sonrasında uygulama normal açılıyor. macOS 15'ten
beri Control+tık → Aç kaçış kapısı yok; Terminal'siz tek yol yukarıdaki
"Yine de Aç".

**Eski paketin imzası.** İkili yalnızca bağlayıcı imzalı, paketin kaynakları
mühürlü değil ve Team ID yok:

```
$ codesign -dvv /Applications/N-Terminal.app
Identifier=nterminal-9bd84406411f3fc4
Signature=adhoc
TeamIdentifier=not set

$ spctl -a -vvv /Applications/N-Terminal.app
code has no resources but signature indicates they must be present
```

`Identifier` `com.nyayan.nterminal` değil, **ikilinin hash'inden türeyen bir
ad** — yani her derleme macOS için başka bir uygulama. Ad-hoc mühürlü pakette
`Identifier` artık `com.nyayan.nterminal`, ama ikinci sonuç iki imzada da
aynı ve herkesi ilgilendiriyor: macOS gizlilik izinlerini (Tam Disk Erişimi,
Erişilebilirlik, Otomasyon) kod imzası şartına bağlıyor; imza ad-hoc olduğu
için şart `cdhash`e çivileniyor ve **her yeni sürümde verdiğiniz izinler
sıfırlanıyor** — uygulama içinden gelen güncellemede de.

**Tamamen uyarısız çözüm** Apple Developer Program üyeliği (yıllık ücretli),
*Developer ID Application* sertifikası ve notarization. O zaman son kullanıcı
yalnızca "internetten indirildi, açılsın mı?" onayını görüp **Aç**'a basıyor —
Sistem Ayarları'na gitmek yok — ve izinler sabit Team ID sayesinde sürümler
arası korunuyor. Tauri bunu derleme sırasında kendisi yapıyor; gereken,
sertifikanın ve Apple hesabı bilgilerinin CI'a sır olarak verilmesi. Şimdilik
yapılmadı: üyelik ücretli ve kararı proje sahibinin.

Kendinden imzalı bir sertifika izin sıfırlanmasını **geliştirme makinesinde**
çözer ama son kullanıcı için hiçbir şey değiştirmez — o sertifika başka bir
Mac'te güvenilmiyor. Yerel derleme için bu yol hazır: `sh scripts/macos-cert.sh`
anahtar zincirine **NTerminal Dev** adlı bir kimlik ekliyor, `npm run bundle`
da kimlik varsa onunla imzalıyor (yoksa imzasız; CI ise ad-hoc imzalıyor).

Kabuktan gelen `APPLE_SIGNING_IDENTITY` bilerek **kullanılmıyor**. Tauri bu
değişkeni yapılandırmadaki imza ayarından önce okuyor; kabuk profilinde başka
bir proje için genel tanımlıyken NTerminal paketleri o projenin sertifikasıyla
imzalanıyordu. Başka bir kimlik gerekiyorsa (örneğin ileride Developer ID)
`NTERMINAL_SIGNING_IDENTITY` ile verilir.

### Neden `npx tauri dev` yerine `npm start`?

`scripts/run.mjs` platforma göre dağıtıyor. macOS ve Linux'ta doğrudan `tauri`
çağırıyor — orada özel bir hazırlık gerekmiyor. Windows'ta ise
`scripts/win-env.ps1` üzerinden geçiyor; o betik derlemeden önce
**kullanılabilir** bir MSVC toolset'i buluyor.

Sebebi somut bir sorun: bu makinede iki Visual Studio kurulumu var ve rustc her
zaman en yeni toolset'i seçiyor. Yeni olan (VS 18 / MSVC 14.50) linker'ı
içerdiği hâlde x64 CRT kütüphanelerini (`msvcrt.lib`) içermiyor, dolayısıyla
doğrudan `cargo build` şununla düşüyor:

```
LINK : fatal error LNK1104: cannot open file 'msvcrt.lib'
```

Betik toolset'leri `lib\x64\msvcrt.lib` var mı diye tarıyor, sağlam olanın
`vcvars64` ortamını içeriye alıyor ve linker'ı `cargo`'ya açıkça bildiriyor.
Bu yüzden hangi VS kurulu olduğundan bağımsız çalışır.

> Paketlemede `LNK1104` yerine **`Access is denied`** görürseniz N-Terminal
> açıktır: çalışan `nterminal.exe` değiştirilemiyor. Uygulamayı kapatıp
> yeniden deneyin.

## Proje yapısı

```
src/                          arayüz (React + TypeScript)
  terminal/TerminalSession.ts   xterm ↔ PTY ↔ geçmiş bağlayıcısı, OSC durum makinesi
  store/useStore.ts             gruplar, sekmeler, ayarlar; oturum kayıt defteri
  components/                   kenar çubuğu, sekmeler, geçmiş, favoriler, ayarlar
  lib/contrast.ts               palet okunabilirlik süzgeci (WCAG karşıtlık)
  lib/labels.ts                 sekme adı / kabuk kodu / ikincil satır mantığı
  lib/ipc.ts                    Rust komutlarının tek geçiş noktası
  lib/i18n.ts                   dil motoru (t, çoğul, dil değişince yeniden çizim)
  lib/messages.ts               arayüz metinleri: [Türkçe, English]
  lib/panes.ts                  bölme ızgarası ve görünüm kipi mantığı
  lib/links.ts                  çıktıda bağlantı bulma, hücre indeksi eşlemesi
  lib/suggest.ts                komut önerisi sıralaması ve kabul dizisi
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

**Teşhis sondası boştayken uyuyor.** Kare ölçümü uygulama ömrü boyunca sürekli
çalışıyordu (16 ms zamanlayıcı + her karede rAF) ve uygulama boştayken bile
toplam CPU'nun yarısından fazlasını yiyordu (%12,9; ölçülen). Şimdi yalnızca
kullanıcı etkinliğinden sonra beş saniye sık örnekliyor, boştayken 250 ms'de bir
yokluyor, pencere gizliyken duruyor. Donma etkileşim sırasında fark edildiği ve
uzun donmalar seyrek kipte de kaydedildiği için sondanın amacı bozulmuyor.

Seyrek kipte kayıt **zamanlayıcının geç ateşlemesinden** geliyor, çizim isteğinden
değil: ilk seyrek kip yalnızca rAF'a bakıyordu ve ana iş parçacığı donmalarını
neredeyse hiç göremiyordu (elle sürülen zamanlayıcıyla 50 evrede 2 kayıt; panel
"kayda geçen takılma yok" diyordu, bu da "donma arayüzde değil" demek).
Garanti dürüstçe şu: 500 ms ve üstü donmalar yoklamanın her evresinde
kaydediliyor, 250-500 ms arası evreye bağlı, 250 ms altı hiçbir kipte takılma
sayılmıyor. Bildirilen belirti saniyelerce süren donmaydı; daha kesin yakalama
isteyen yoklama aralığını küçültür ve maliyetini ölçer.

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

**Sürükle-bırak yapılandırmaya bağlı.** Sıralama matematiğinin testleri
geçiyordu, kod doğruydu, ama paketlenmiş uygulamada sürükleme hiç çalışmıyordu.
Sebep koddan bağımsızdı: Tauri'nin `dragDropEnabled` ayarı varsayılan olarak
açık ve açıkken webview'in sürükleme olaylarını işletim sistemi katmanı
yutuyor. Derleme geçiyor, test geçiyor, hata çıkmıyor — yalnızca özellik
çalışmıyor. Bu yüzden yapılandırmanın kendisi testle bağlı.

**Öneri terminalin üstüne binmiyor, onu küçültüyor.** Öneri listesi ızgarada
ayrı bir satır. Terminalin üstüne bindirmek istem satırını — yani tam olarak
yazdığınız yeri — kapatırdı. Geçmiş önerisi en fazla beş satır: sekizde çubuk
191px oluyordu, 627px'lik bir terminalin üçte biri. `cd` yazarken gelen klasör
listesi bu sınıra bağlı değil — orada her satır eşit derecede olası bir hedef
ve hepsi ok tuşlarıyla gezilebilmeli; kutu beş satır yüksekliğinde kalıyor,
fazlası kaydırılıyor.

**Öneri listesi ters sırada.** En yeni komut en altta, istem satırına en yakın.
Kabuk alışkanlığıyla "yukarı ok = daha eski" tutarlı kalsın diye; sıralamayı
CSS `column-reverse` yapıyor, JavaScript tarafı listeyi her zaman en yeniden
eskiye veriyor.

**Renkli yüzeylerde soluk metin ana metinden türetiliyor.** Grup rengi arka
plana vurunca `--text-dim` gibi sabit bir rengin karşıtlığı düşüyor: ölçülen en
kötü değer 2.12'ydi (Solarized Açık + siyah grup rengi). Aynı hata öneri
listesinde de çıktı — seçili satırın metni vurgu renginde, arka planı vurgu
tonluydu; 2.54. İkisi de artık ana metinden türetiliyor ve oranlar testle bağlı.

**WebGL yalnızca etkin terminalde.** Her sekme kendi WebGL bağlamını tutsa
tarayıcının bağlam sınırına çarpardık. Sekme değişince bağlam bırakılıyor;
bağlam kaybında sessizce DOM oluşturucuya dönülüyor.

## Testler

```bash
npm test
```

- **Arayüz (412 test)** — OSC kaçış çözme ve 133/633/7 ayrıştırma (betiklerle
  simetrik olmak zorunda), base64 çözücü (UTF-8 dışı baytlar dahil), kısayol
  eşleştirme, biçimlendirme, bulanık arama, sekme etiketi mantığı, sekme kilidi
  kuralları, sıralama/sürükle-bırak indeks matematiği, grup görünürlük süzgeci,
  bölme ızgarası matematiği (her bölme ızgaraya sığmalı, boş hücre kalmamalı),
  tüm temalar için palet karşıtlık güvencesi, düzen değişmezleri (dolgunun doğru
  yerde durması, gizli bölmenin düzenden çıkmaması, bölme çerçevesinin `border`
  değil `outline` olması) ve iki ölçülü değişmez:
  - **Sözlük** — her metnin iki dili var mı, çoğul anahtarları çift mi, yer
    tutucular iki dilde aynı mı (İngilizcede `{n}` yazıp Türkçede unutmak
    kullanıcıya sayı göstermeyen bir cümle bırakır).
  - **Yüzey okunabilirliği** — karışım oranları CSS'ten okunup aynı hesap
    testte yapılıyor; 4 tema × 11 grup rengi (saf siyah/beyaz dahil) için grup
    adı ≥ 4.5, soluk metin ≥ 3.0; öneri listesinin seçili satırı için de aynısı.
    Oran yükseltilirse test düşüyor. Ölçülen ilk hâlleri 2.12 ve 2.54'e kadar
    iniyordu.
  - **Bağlantı bulma** — gerçek araç çıktısı biçimleriyle: cümle içinde adres,
    parantez içinde adres, dengeli/dengesiz parantez, sorgu dizesi, tırnak
    içinde adres, geniş karakterlerin (CJK) hücre indekslerini kaydırması.
    Yanlış kırpma iki yönlü zarar veriyor: fazla kırpınca adres bozuk açılıyor,
    az kırpınca sondaki nokta adrese girip 404 üretiyor.
  - **Komut önerisi** — sıralama (en yeni önce, yinelenensiz, büyük/küçük harf
    duyarsız) ve **kabul dizisi**. İkincisi kritik: fazla silme kullanıcının
    yazdığını bozar, o yüzden silme sayısının yazılan karakter sayısıyla birebir
    olduğu ayrıca sınanıyor.
  - **Arayüz bileşenleri (jsdom)** — onay penceresi (kararın çağırana ulaşması,
    Esc/Enter, örtüye tıklama, ikinci istek gelince ilk bekleyenin asılı
    kalmaması), öneri listesi ve **sürükle-bırak**: gerçek
    `dragstart`/`dragover`/`drop` olaylarıyla sekme ve grup sıralaması, bırakma
    göstergesi, favori süzgeci açıkken doğru indeks, sekme sürüklemesinin grup
    sırasını bozmaması.
  - **Sözlük hijyeni** — kullanılmayan anahtar bırakılmıyor (bu test yazıldığında
    sekiz ölü anahtar buldu) ve çoğul kökleri gerçekten `tp()` ile çağrılıyor.
  - **Tauri yapılandırması** — `dragDropEnabled` kapalı, CSP `script-src 'self'`.
  - **Sabit kodlanmış metin taraması** — yorumlar ve `{...}` ifadeleri
    çıkarıldıktan sonra kalan JSX metni ile `placeholder`/`title`/`label`
    değerleri taranıyor; iki sözcükten uzun olanlar sözlüğe taşınmamış sayılıyor.
    Bu test bir kez ödenmiş bedelden geliyor: elle `grep` ile tararken dört
    metni kaçırdım, hepsi arada `{}` ya da satır sonu olduğu için.
  - **Ayarlar penceresi** — dokuz bölüm, gezinmenin çalışması, her bölümün en az
    bir başlığı olması, **aynı başlığın iki bölümde geçmemesi** ve arama
    (sonuçların bölüm adı taşıması, tıklamanın satırı vurgulaması, Enter/Esc,
    aksansız yazım, eşleşme yok iletisi).
  - **Ayar arama indeksi** — indeksin arayüzle birebir olması (kaynaktaki
    `data-setting` anahtarlarıyla karşılaştırılıyor), Türkçe harf sadeleştirme
    ve sıralama (etiket eşleşmesi açıklamadan önce).
  - **Düğme hizalaması** — temel `button` kuralının hizalamayı zorlamaması;
    sola dayalı düğmelerin `text-align: left` taşıması. Kullanıcının ayarlar
    penceresinde gördüğü gerilemenin testi.
  - **"Silme her zaman sorar"** — her silme yolu için iki şey: soruluyor mu ve
    **vazgeçilince silme gerçekten olmuyor mu**. İkincisi kritik; onayı
    gösterip cevabı yok saymak en kötü durum. Ayrıca eklemenin ve
    yapılamayacak işlemlerin soru sormaması.
  - **Düğme renkleri** — 4 tema için dolgulu birincil ve yıkıcı düğmede beyaz yazı
    ≥ 4.5 karşıtlık, zeminin çamurlaşmaması, üzerine gelince/basılınca okunma, devre
    dışı düğmede ≥ 3:1 (iki yüzeyde), sayaç hapında okunma; sessiz kırmızı, yeşil rozet
    ve çerçeveli düğme ≥ 4.5; odak halkasının iki katmanlı olması. `filledColors`
    renk uzayını tarayarak her rengin okunduğunu sınıyor.
  - **Bağlam menüsü** — alt menünün üzerine gelince/tıklayınca açılması, başka
    satıra geçince kapanması, alt menüden seçimin TÜM menüyü kapatması, devre
    dışı alt menünün açılmaması.
  - **Git paneli (commit, push, stash)** — saf kurallar (`gitStage`, `gitStash`),
    satır kutusunun üç hâli, yazma kuyruğunun sırası ve hata sonrası tazeleme,
    satırların varsayılan kapalı gelmesi ve farkın yalnızca açılınca istenmesi,
    Stash penceresinin liste seçimiyle açılması ve klasör yolu kutusu, Stash
    bölümünün varsayılan kapalı olması ve silmenin onayı; `lib/ipcContract.test.ts`
    arayüzün çağırdığı her Rust komutunun kayıtlı olduğunu ve argüman adlarının
    tuttuğunu denetliyor. Rust tarafı gerçek git depolarıyla (bare uzak dâhil)
    sınanıyor.
- **Rust birim (51 test)** — geçmiş deposu (filtreleme, arama, sınır aşımı, diskten
  yeniden okuma, bozuk satıra dayanıklılık, sıkıştırma), yol taşınabilirliği
  (gidiş-dönüş, harf duyarsızlığı, uzun yol önceliği), birleştirme kipleri,
  kabuk başlatma argümanları, Windows sürüm okuma, favori deposu (sıralama,
  yinelenen komut, bozuk dosyaya dayanıklılık) ve **dışa aktar → başka makine
  gibi oku → uygula** zincirinin tamamı. Windows'ta ayrıca **tek örnek kilidi**
  (aynı klasörle ikinci açılış açılmıyor ve ilk örneğe haber veriyor, farklı
  klasörler yan yana açılıyor, klasörün farklı yazımları aynı kilidi veriyor)
  ve **kapanışta portun boşalması**: sekmede port dinleyen bir torun sunucu
  başlatılıp önce sekme kapatılıyor, sonra (ayrı bir süreçte) uygulama
  oturumları kapatmadan çıkıyor. İkisinde de portun gerçekten boşaldığına
  bakılıyor.
- **Uçtan uca (13 test)** — gerçek ConPTY içinde gerçek PowerShell, bash ve
  cmd.exe başlatıp OSC işaretlerini okuyor: istem işaretleri, komut metni, çıkış
  kodu `0` ve yerel uygulamanın `3`'ü, hatadan sonra tekrar `0`, noktalı virgül
  kaçışı, klasör bildirimi. Bash testi ayrıca iki şeyi kilitliyor: ilk bildirilen
  komut kullanıcının komutu olmalı (başlangıç betiğinin satırı değil) ve bir boru
  hattı tek kayıt açmalı. Ayrı bir test de boş satırda Enter'a basmanın önceki
  komutu ikinci kez kaydetmediğini doğruluyor.

  Sonradan eklenenler:
  - **Renk** — `ng serve` / `dotnet run` gibi araçlar rengi kendileri üretiyor;
    bizim işimiz yalnızca ANSI'yi geçirmek değil, onlara "renk üretebilirsin"
    demek. Test gerçek ConPTY içinde gerçek Node'a soruyor: `isTTY` doğru mu,
    `getColorDepth()` kaç, `TERM` ve `COLORTERM` çocuğa ulaşıyor mu. Ölçülen
    değer 24 (truecolor). Testin ANSI temizleyicisine ihtiyaç duyması kanıtın
    kendisi: Node renk desteği gördüğü için çıktısını kendiliğinden renkliyor.
  - **Öneri isteği entegrasyonu bozmuyor** — PSReadLine 2.0
    `-PredictionSource` parametresini tanımıyor. Betik bunu yakalamazsa
    yüklenirken hata verir ve entegrasyonun **tamamı** (geçmiş, çıkış kodu,
    dizin) sessizce ölür; kullanıcı yalnızca "geçmiş boş" görür. Test tahmini
    desteklemeyen kabukla çalışıyor: önemli olan önerinin görünmesi değil,
    isteğin zarar vermemesi.
  - **Yürütme ilkesi** — betiğin "internetten indirildi" işaretli
    (`Zone.Identifier`) bir kopyası `-File` ile yüklenmiyor (hatanın
    mekanizması; `Bypass` dışındaki her ilkede) ama uygulamanın yükleyicisiyle
    yükleniyor. Yanında üç test daha: PSReadLine'ın `.psm1`i düştüğünde betik
    modülü DLL'inden yüklüyor ve komut başlangıcı yine Enter anında geliyor;
    yükleyici başarısız olursa bunu bildiriyor; `-Command` metni kullanıcının
    `Get-History`sinde kalmıyor.

Entegrasyon testleri ConPTY'nin açılışta gönderdiği `ESC[6n` imleç konumu
sorgusunu elle yanıtlıyor — gerçek uygulamada bunu xterm.js kendiliğinden
yapıyor, yanıtlanmazsa kabuk çıktı üretmeye başlamıyor.

### GitHub Actions

`.github/workflows/build.yml`: her dala itmede ve elle tetiklendiğinde
koşuyor. `pull_request` tetikleyicisi yok — aynı depoda push ile PR iki ayrı
koşu demek; koşu head commit'e bağlı olduğu için PR'ın denetimlerinde yine
görünüyor.

- **Arayüz** (ubuntu) — tip denetimi + vitest. jsdom platformdan bağımsız,
  bir kez koşması yeterli; her platformda tekrarlamak iki katı runner dakikası
  demek.
- **Windows ve macOS** — `cargo test -- --test-threads=1`, ardından
  `npx tauri build`. Rust testleri paketlemeden ÖNCE: PTY ve kabuk
  entegrasyonu platforma bağlı ve kırıldığında paketin derlenmesi bunu
  söylemiyor. Kabuğunu bulamayan testler kendini atlıyor (macOS'ta
  `powershell.exe`, `cmd.exe` ve Git Bash yok).

- **Yayın** (ubuntu, yalnızca `main`'de ve `v*` etiketinde) — yayın etiketini
  Actions oluşturuyor. `package.json`daki sürümün `v<sürüm>` etiketi henüz
  yoksa, testler ve iki platformun paketleri geçtikten sonra etiket o commit'te
  açılıyor ve paketler bir GitHub Release'ine bağlanıyor (notlar commit'lerden).
  Etiket zaten varsa yayın yok. Paketler önce `scripts/release-files.mjs` ile
  düz bir klasöre alınıyor ve hepsinin yerinde olduğu denetleniyor; imzalıysa
  `latest.json` da yazılıyor (aşağıda *Güncelleme imzası*). Yani **yeni bir
  sürüm çıkarmak için sürüm numarasını üç dosyada — `src-tauri/Cargo.toml`,
  `package.json` (ve kilidi),
  `src-tauri/tauri.conf.json` — yükseltip main'e itmek yeterli**; elle etiket
  gerekmiyor. Üçünün aynı olduğunu bir test denetliyor: uygulama kendi sürümünü
  Release etiketiyle karşılaştırıyor ve ayrışırlarsa her açılışta "yeni sürüm
  var" derdi. Yeni commit olmadan yayınlamak için Actions'ta "Run workflow"
  (main). Elle itilen `v*` etiketi de çalışıyor, ama sürümle eşleşmeyen etiket
  yayın yapmıyor.

Çıktılar koşunun **Artifacts** bölümünde, 14 gün: Windows için NSIS kurucusu
ve MSI, macOS için DMG. İkisi de bir yayıncı kimliğiyle imzalı DEĞİL — depoda
ne Windows sertifikası ne Apple kimliği var; macOS paketi yalnızca ad-hoc
mühürlü (`APPLE_SIGNING_IDENTITY: "-"`). Windows'ta SmartScreen uyarısı
çıkıyor (*Ek bilgi › Yine de çalıştır*); macOS'ta "Apple doğrulayamadı" ve
*Sistem Ayarları › Gizlilik ve Güvenlik › Yine de Aç* — ayrıntısı
**[macOS: ilk açılış](../README.md#macos-ilk-açılış)**. Ad-hoc mühür olmadan macOS
"hasarlı" deyip yalnızca Terminal'den açılmaya izin veriyordu. İkisi de
**tarayıcıdan indirilen** paketin işaretine bakıyor (macOS'ta karantina,
Windows'ta "internetten indirildi" / Mark of the Web), yani ilk kurulumda
çıkıyor. Uygulamanın kendi indirip kurduğu güncellemede bu işaret yok —
macOS'ta ölçüldü; Windows'ta aynı sebepten SmartScreen'in bakacağı bir şey
kalmıyor.

Linux yok: uygulama orada denenmedi (`src-tauri/src/platform.rs`) ve paket
türlerinin hiçbiri Linux'ta karşılık bulmuyor.

#### Güncelleme imzası

Uygulama içinden kurulum (*Güncelle ve yeniden başlat*) paketin bu depodan
çıktığını bir imzayla doğruluyor. Bu, işletim sisteminin kod imzasından
(Apple / Windows sertifikası) AYRI ve ücretsiz bir şey: bir anahtar çifti
(minisign). Açık anahtar `src-tauri/tauri.conf.json`da
(`plugins.updater.pubkey`); özel anahtar yalnızca CI'da, depo sırrı olarak.

**Kurulum (bir kez).** GitHub'da *Settings › Secrets and variables › Actions ›
New repository secret*:

| Ad | Değer |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | özel anahtar dosyasının içeriği |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | anahtarın parolası — parolasız anahtarda bu sırrı **oluşturmayın** (GitHub boş sır kabul etmiyor; yokken değişken boş geçiyor, doğrusu da bu) |

Sır tanımlıyken *Paketle* adımı `--config '{"bundle":{"createUpdaterArtifacts":true}}'`
ile derliyor: kurucuların yanında `.sig` imzaları ve macOS için
`.app.tar.gz` çıkıyor. *Yayın* işi bunları `scripts/release-files.mjs` ile
düz bir klasöre alıp `latest.json`ı yazıyor; uygulama o dosyayı
`releases/latest/download/latest.json` adresinden okuyor. Sır yoksa paketler
eskisi gibi çıkıyor, `latest.json` yazılmıyor ve kurulu uygulamalar o sürüm için
yalnızca **haber** veriyor (koşuda bir uyarı satırı bunu söylüyor).

**Anahtarı kaybetmeyin.** Kurulu her uygulama açık anahtarı içinde taşıyor;
özel anahtar kaybolursa yeni sürümler o kurulumlara uygulama içinden
**kurulamaz** — anahtarı değiştiren sürümü kullanıcılar bir kez elle
kurmak zorunda kalır. Dosyayı bir parola yöneticisinde yedekleyin.

Yeni anahtar üretmek (yalnızca kaybolduysa ya da sızdıysa):

```bash
npx tauri signer generate -w ~/.tauri/nterminal.key
```

Çıkan `.pub` dosyasının içeriği `tauri.conf.json`daki `pubkey`in yerine, özel
anahtar da yukarıdaki sırra gidiyor.

Yerelde imzalı paket üretmek için (çoğu zaman gerekmiyor):

```bash
TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/nterminal.key)" TAURI_SIGNING_PRIVATE_KEY_PASSWORD="" npm run bundle -- --config '{"bundle":{"createUpdaterArtifacts":true}}'
```

`TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""` parolasız anahtarda bile **gerekli**:
değişken hiç tanımlı değilse CLI parola sormaya kalkıyor ve terminalsiz
ortamda düşüyor (ölçüldü, Tauri CLI 2.11).

---

## Bilinen sınırlar

- Kabuk süreçleri uygulamayla kapanır; arka planda canlı oturum tutulmuyor.
- Komut önerisi (hayalet metin / liste) kabuğa bağlı. PowerShell'de PSReadLine
  2.2+ gerekiyor; Windows PowerShell 5.1'in getirdiği 2.0 desteklemiyor,
  `Install-Module PSReadLine -MinimumVersion 2.2.6 -Force -SkipPublisherCheck`
  ile güncellenir. zsh'de `zsh-autosuggestions` gerekiyor
  (`brew install zsh-autosuggestions`) — kurmuyoruz, varsa kullanıyoruz.
  cmd, bash ve fish'te karşılığı yok. Uygulamanın **kendi** önerisi bundan
  bağımsız ve her kabukta çalışıyor.
- Bağlantı renklendirmesi yalnızca **görünür satırlara** uygulanıyor; çok hızlı
  akan çıktıda renk bir kare gecikmeli oturuyor (erteleme penceresi 90 ms).
- `cmd.exe` için çıkış kodu bildirilemiyor (yukarıda anlatıldı).
- Komut çalışırken kutuya yazılan yanıt programa **Enter'la** gidiyor. Yazdıkça
  süzülen listeler (bazı `npx create-*` araçlarının arama kutuları) süzgeci bu
  yüzden yazarken değil Enter'da görüyor; Jest/Vitest'in izleme kipindeki tek
  harflik kısayollar da harf + Enter ile çalışıyor. Tuşları anında göndermek
  gereken bir programda *Ayarlar › Terminal › Komut satırını uygulama çizsin*
  kapatılabilir; o zaman terminal klasik davranışa döner.
- Bölünmüş bölme (split pane) yok; ayrım gruplar ve sekmeler üzerinden.
- **fish** için kabuk entegrasyonu yok: bash/zsh söz dizimini paylaşmadığı için
  kendi betiği gerekiyor. Profil olarak açılıyor ve terminal çalışıyor, ama
  komut geçmişi, çıkış kodu ve klasör takibi gelmiyor. Bilinçli olarak
  "desteklenmiyor" işaretli — yarım çalışan bir entegrasyon sessiz olurdu.
- **macOS'ta Option tuşu** varsayılan olarak Meta değil: Türkçe Mac klavyesinde
  `@` = Option+Q ve Meta yapılırsa `@` yazılamıyor. Kelime kelime gezinme
  (Option+B/F) isteyenler Ayarlar › Terminal › Klavye'den açabilir.
- macOS derlemesi bir Mac'te yapılmak zorunda: Apple SDK'sı olmadan çapraz
  derleme mümkün değil.
