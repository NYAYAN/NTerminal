# Geliştirme notları

Bu dosya bir değişiklik günlüğü değil, **yol haritası**: neyin neden öyle
yapıldığını ve neyin hâlâ açık olduğunu tutuyor. Amaç, aylar sonra "şunu da
ekleyelim" dendiğinde aynı kararları baştan tartışmak zorunda kalmamak.

`README.md` ürünü ANLATIYOR (ne yapar, nasıl kullanılır). Burası ise
geliştirmenin arkasındaki gerekçeleri ve açık işleri tutuyor. Bir karar
kalıcılaştıysa yeri README, hâlâ tartışmaya açıksa burası.

Ayrıntılı gerekçeler kodun kendisinde: aşağıdaki her madde ilgili dosyayı
işaret ediyor ve o dosyadaki yorum "neden" sorusunu tam olarak yanıtlıyor.
Burada yalnızca özet ve bağlantı var.

---

## 1. Yapılanlar

### 1.1 Sekme rozeti ve profil bağı

| Ne | Nerede |
|---|---|
| Kabuk rozeti (`PS`, `CMD`, `WSL`) açılıp kapanabilir ayar | `Appearance.showShellBadge`, Ayarlar › Görünüm › Sekmeler |
| Rozet `?` gösteriyordu — düzeltildi | [`lib/labels.ts`](src/lib/labels.ts) `resolveProfile`, [`lib/tabs.ts`](src/lib/tabs.ts) `healTabProfiles` |
| Rozet okunmuyordu (koyu profil rengi) | [`lib/themes.ts`](src/lib/themes.ts) `readableAccent` |

**`?` neden çıkıyordu.** Sekme kabuğunu bir profil KİMLİĞİ ile tutuyor. Profil
silindiğinde ya da "Ayarları sıfırla" profilleri yeniden ürettiğinde kimlik
boşa düşüyor. Rust tarafı açarken varsayılana düşüyor (`store::resolve_profile`),
yani sekme çalışmaya devam ediyordu; arayüz ise TAM eşleşme arayıp `?`
yazıyordu. İki taraf artık aynı düşüş sırasını kullanıyor ve bağ kalıcı olarak
onarılıyor (açılışta, profil silmede, ayar sıfırlamada).

**Rozet neden görünmüyordu.** Windows PowerShell profilinin rengi `#0e4d92`
(koyu lacivert) ve koyu tema yüzeyinde karşıtlığı 1.4:1 — 9px kalın bir metin
için tümüyle okunmaz. Tema renkleri zaten `ensureContrast`ten geçiyordu;
atlanan yer KULLANICININ SEÇTİĞİ renklerdi. `readableAccent` tonu koruyup
yalnızca gerektiği kadar itiyor, yani "PowerShell mavisi" mavi kalıyor.

Testler: `lib/labels.test.ts`, `lib/theme.test.ts`, `components/shellBadge.test.tsx`.

### 1.2 Görünüm düğmeleri ve düzen

- Başlık çubuğunun sol köşesine **iki açma/kapama** düğmesi: grup kenar çubuğu
  ve dosya ağacı. İkisi de kalıcı ya da iki durumlu; sıraları düzenin sırasını
  izliyor. [`App.tsx`](src/App.tsx), sınıf `.view-btn`.
- Kenar çubuğunun daraltma durumu ayarda (`Appearance.sidebarCollapsed`) —
  kapatan kullanıcı uygulamayı yeniden açtığında da kapalı bekliyor.
- Sekme satırında başlık ile yol arasına nefes payı (`.tab-row-body` gap).
- Kaydırma çubuğu 14px → **9px**. Tek yolu xterm'in `overviewRuler.width`
  seçeneği; xterm içeride `verticalScrollbarSize = overviewRuler?.width || 14`
  diyor. Yan etkisi bilinçli: arama eklentisi `matchOverviewRuler` rengini
  zaten veriyordu ama sütun kapalı olduğu için o renk ÖLÜYDÜ — artık
  eşleşmeler çubuğun yanında işaretleniyor.
- Sütun açılınca xterm sol kenarına koşulsuz 1px çizgi atıyor
  (`_renderRulerOutline`); rengi terminal zeminine eşitlenerek görünmez
  yapıldı ([`lib/themes.ts`](src/lib/themes.ts)).
- `.xterm` sağ dolgusu 14px → 4px: çubuk dolgunun içinde kaldığı için sağda
  ölü bir şerit bırakıyordu.
- "En alta in" düğmesi (geriye kaydırıldığında görünüyor) ve süre rozeti,
  çubukla çakışmayacak biçimde konumlandı. **Bu üç sayı birbirine bağlı**
  (çubuk genişliği, sağ dolgu, düğme/rozet konumu) ve üçü ayrı dosyada — ilişki
  `styles/layout.test.ts` içinde testle bağlı.

### 1.3 Terminal davranışı

- **"Önceki oturum burada bitti" ayıracı artık DOM'da çiziliyor.** Terminale
  metin olarak yazılan bir satır yazıldığı genişliğe donuyor: çekmece açılınca
  taşıyor, pencere genişleyince sola yapışık kalıyordu. Terminale yalnızca boş
  bir satır açılıp işaretleniyor; yazıyı ve çizgileri katman çiziyor
  ([`TerminalSession.start`](src/terminal/TerminalSession.ts),
  [`TerminalBlocks`](src/components/TerminalBlocks.tsx), `.restore-divider`).
- **Sunucu şeridi** (`SUNUCU`) üç ayrı hatadan geçti:
  1. Her istek günlüğü yeni bir adres sayılıyordu → köken (`origin`) bazında
     teklileştirme.
  2. Adres yakalayan regex `[` ve `]`'yi dışlıyordu → `http://[::]:1452` hiç
     eşleşmiyordu. Ana makine konumunda parantezlere izin verildi.
  3. Sarılan satırlarda adres ikiye bölünüyor ve `http://localhost` gibi yarım
     bir parça rozete dönüşüyordu → sarılan satırlar araya satır sonu konmadan
     birleştiriliyor ([`lib/serverScan.ts`](src/lib/serverScan.ts) `isWrapped`).

  Joker adresler (`[::]`, `0.0.0.0`) `localhost` olarak gösteriliyor: tarayıcıya
  yazılabilecek adres o.
- **`cd` yazarken dizin önerisi** ([`lib/cdSuggest.ts`](src/lib/cdSuggest.ts)).
  Geçmiş çoğu komut için doğru kaynak ama `cd` için değil — cevabı diskte.
  Ara yollara iniyor (`cd src/comp`), boşluklu klasörü alıntılıyor, ön ekle
  başlayanları öne alıyor. Mutlak yol yazılırsa geçmişe bırakıyor.
- **Öneri listesinde seçili satır görünür kalıyor** (`scrollIntoView`,
  `block: "nearest"`). Öncesinde ok tuşlarıyla seçim listenin dışına çıkıyordu.
- "Kabuk kapandı" kutusu: metin üstte, düğmeler altta.

### 1.4 Git değişiklikleri paneli

- Durum artık **simge**: kalem/artı/eksi/ok/kesik çember. Metin `title` ve
  `aria-label` içinde. Eski metin sütunu 88px sabit yer tutuyordu ve o yer
  dosya YOLUNDAN çıkıyordu.
- **Takip edilmeyen dosya sarı** (`--warn`), eklenen yeşil: ikisi de yeşilken
  "yeni dosya eklendi" diye okunuyordu. Simgesinde artı YOK — artı "eklendi"
  demek. İpucu da açık: "Takip edilmiyor — henüz git add yapılmamış".
- **Satır eylemleri**: yolu kopyala, değişiklikleri geri al, dosyayı aç.
  Satırın üstündeyken görünüyorlar; katlama düğmesinin DIŞINDA (iç içe düğme
  hem geçersiz işaretleme hem karışık tıklama).
- **Geri alma iki ayrı iş** ([`src-tauri/src/git.rs`](src-tauri/src/git.rs)
  `revert`): takip edilen dosya HEAD'e döner (önce indeks çözülür, sonra
  çalışma ağacı yazılır — dosya HEAD'de yoksa ikinci adım başarısız olur ve bu
  DOĞRUDUR, dosya takipsiz hâle döner, silinmez); takipsiz dosya SİLİNİR ve bu
  geri alınamaz. Onay metni ikisini ayırıyor. Yıkıcı olduğu için davranışı
  GERÇEK bir depo üzerinde test ediliyor (`git_tests.rs`, `geri_alma_*`);
  özellikle "indekste olup HEAD'de olmayan dosya SİLİNMEZ" durumu.
- **Diff'te satır numarası**: fark metninde numara yok, hunk başlığından
  sayılıyor. Bağlam satırı iki sayacı da ilerletir, ekleme yalnızca yeniyi,
  silme yalnızca eskiyi ([`lib/diff.ts`](src/lib/diff.ts)).

### 1.5 Favoriler

- **Gruplar (klasörler)**. Klasör ayrı bir varlık DEĞİL, favorinin üzerinde
  duran serbest bir metin; liste ondan türetiliyor. Böylece "klasör oluştur /
  sil / boş klasör" diye üç ayrı durum doğmuyor: ad yazmak klasörü var ediyor,
  son favori taşınınca kendiliğinden kayboluyor.
- **Sıra tek kaynaktan**: favoriler dizisinin kendisi. Klasörleme onun üzerine
  bir görünüm; klasör başına ayrı sıra tutmak aynı bilgiyi iki yerde tutmak
  olurdu ([`lib/favoriteGroups.ts`](src/lib/favoriteGroups.ts)).
- **Sürükle-bırak**: satıra bırakmak "bunun önüne", başlığa bırakmak "bu
  klasörün sonuna". Taşıma sırayı ve klasörü TEK işlemde değiştiriyor.
- **Daraltma** kalıcı (`Appearance.collapsedFavoriteFolders`), arama sırasında
  yok sayılıyor. "Hepsini aç/kapat" düğmesi tüm gruplara bakıyor, yalnızca
  görünenlere değil.

### 1.6 Ayarlar ve aktarım

- Ayarlar › Hakkında altında **geliştirici bilgileri**: ad, kaynak deposu
  (tarayıcıda açan düğme), lisans, telif.
- İçe aktarma seçenekleri yeniden adlandırıldı: **Üzerine yaz / Üzerine ekle /
  Atla**. "Değiştir" neyin neyle değiştiğini söylemiyordu. "Üzerine yaz"
  seçilince NE SİLİNECEĞİ de yazıyor.

### 1.7 Veri bütünlüğü (sessiz hatalar)

Bunlar kullanıcıya "arayüz hatası" gibi görünen ama aslında veriyi bozan
sorunlardı:

- **Yinelenen sekme kimliği.** Birleştirmeli içe alma çakışan GRUP kimliğini
  yeniliyor ama içindeki SEKME kimliklerini yenilemiyordu. Aynı kimlik iki
  grupta olunca arayüz ilk eşleşmede duruyor: tıklanan sekme yerine öteki
  seçiliyor, kapatma yanlış sekmeyi kapatıyor, iki sekme tek oturumu
  paylaşıyor. Hem kaynak düzeltildi
  ([`transfer.rs`](src-tauri/src/transfer.rs) `ensure_unique_tab_ids`) hem
  diskte duran bozuk dosya açılışta onarılıyor
  ([`store.rs`](src-tauri/src/store.rs) `load_workspace`).
- **Boş çalışma alanı yazımı.** Açılış tamamlanmadan `persistNow` çağrılırsa
  diskteki dokuz sekmelik düzen boş bir dosyayla değişiyordu (bir kez oldu;
  Rust'ın `snapshot_if_shrinking` yedeği kurtardı). Artık açılış bitmeden ve
  açılış düştüğünde yazma yapılmıyor.
- **İçe aktarmadan sonra "etkin terminal yok".** `reloadWorkspace` oturumları
  kapatıp epoch'ları SIFIRLIYORDU; React barındırıcıyı `tabId:epoch`
  anahtarıyla tanıdığı için hiç yeniden başlatılmamış bir sekmede anahtar
  değişmiyor ve oturum yaratan etki bir daha koşmuyordu. Sıfırlama yerine
  artırma.

### 1.8 Geliştirme ortamı

**`win-env.ps1` artık `Platform` değişkenini içeri almıyor.** `vcvars64.bat`
ortama `Platform=x64` yazıyor; MSBuild ortam değişkenlerini özellik olarak
okuduğu için çıktı klasörü `bin/Debug/<tfm>` yerine `bin/x64/Debug/<tfm>`
oluyordu. Zincir tek yönlü: betik ortamı oturuma alıyor → `dev.ps1` `tauri dev`
çağırıyor → cargo `nterminal.exe`i başlatıyor → **uygulama açtığı her kabuğa
kendi ortamını veriyor**. Yani bir terminal, kullanıcının derleme çıktısının
YERİNİ değiştiriyordu ve belirti uygulamada değil kullanıcının projesinde
çıkıyordu (`ijwhost.dll` bulunamıyor). Kural `lib/devEnv.test.ts` ile bağlı.

---

## 2. Açık işler

Sıra önerisi yukarıdan aşağı.

### 2.1 Sekme geçişinde hayalet yazı

Sekmeler arasında geçtikten sonra ekranda önceki içeriğin kalıntısı görünüyor
(metin üst üste biniyor, arayüz öğeleri terminalin içine çiziliyor gibi).
Deterministik olarak üretilemedi.

**Ayırt edici soru:** ekran KAYDIRINCA ya da pencere BOYUTLANDIRINCA düzeliyor
mu?
- Düzeliyorsa boyama artığı → çözüm `setDisplay` içinde görünür olan bölmeyi
  zorla yeniden çizmek (`term.refresh(0, rows - 1)`) ve WebGL katmanının
  açılıp kapanma sırasına bakmak.
- Kalıcıysa çizim mantığı → aynı anda iki bölmenin görünür olması ihtimali
  (`data-visible`) araştırılmalı.

Not: bu oturumda gözlenen bazı belirtiler (rozetlerin `?` olması, terminalin
boşalması) SICAK DEĞİŞTİRME yan etkisiydi, gerçek hata değil — bkz. §3.

### 2.2 Diff'te bağlam açıcıları

İstenen: fark bloklarının arasında "**106 unmodified lines**" gibi bir satır ve
tıklanınca o satırların açılması.

Gerekenler:
- `git diff -U<n>` ile daha geniş bağlam istemek — `gitDiff` çağrısına bir
  `context` parametresi eklenmeli
  ([`lib/ipc.ts`](src/lib/ipc.ts), [`git.rs`](src-tauri/src/git.rs) `diff`).
- Hunk başlıkları arasındaki boşluğun kaç satır olduğu zaten hesaplanabiliyor:
  bir hunk'ın bittiği numara ile sonrakinin başladığı numara arasındaki fark
  (`lib/diff.ts` artık numaraları veriyor).
- Açma durumu dosya başına tutulmalı; tümünü açmak büyük dosyada bütün dosyayı
  belleğe almak demek, bir üst sınır gerekiyor.

### 2.3 Üçüncü skill: arayüz metni / i18n

`.claude/skills/` altında iki skill var: `calistir` (uygulamayı çalıştırma ve
gözle doğrulama) ve `testler` (doğrulama zinciri). Üçüncüsü yazılmadı:
arayüz metni kuralları — her metnin `messages.ts` içinde İKİ dille tanımlanması,
cümle stili, `data-setting` ile `settingsIndex` eşleşmesi, kullanılmayan anahtar
denetimi. Bu oturumda bu testlere en çok takılan yer burasıydı, yani skill'in
karşılığı var.

### 2.4 Küçük açık uçlar

- Favori grubu **yeniden adlandırma**: bugün her favorinin alanını tek tek
  düzenlemek gerekiyor. Grup adı serbest metin olduğu için toplu yeniden
  adlandırma ayrı bir işlem ister.
- Geri alma **birden çok dosya** için yok (yalnızca satır bazında).
- `Build FE` sekmesinin dizini yanlış (`...WebAPI`); bu bir veri kalıntısı,
  sekmede bir kez `cd` yapmak yeterli.

---

## 3. Tekrar ısıracak tuzaklar

Bunlar bir kez bedeli ödenmiş ve tekrar karşılaşılması çok muhtemel şeyler.

**Sıcak değiştirme (HMR) depoyu boş bir örnekle kurabiliyor.** Bir modülün
dışa aktarımları değiştiğinde Vite tam yeniden yükleme yapıyor; zustand deposu
yeni ve BOŞ bir örnekle kuruluyor, `bootstrap()` ise koşmamış oluyor. Görülen
belirtiler: bütün rozetler `?` (profiller boş), terminal ekranı boşalıyor,
`workspace.json` boşalıyor. Gerçek bir hata sanıp kovalamadan önce **temiz
yeniden başlat**. Rust ya da `TerminalSession` değiştiyse zaten yeniden
başlatmak şart: canlı oturumlar eski sınıfla kalıyor.

**Araç zinciri kaçış dizilerini yiyor.** Kabuk heredoc'u ya da Python
üzerinden dosyaya `\n`, `\r\n`, `\ ` yazarken tek/çift ters bölü kolayca
kayıyor. Bu oturumda üç kez oldu: bir test dosyası ayrıştırılamaz hâle geldi,
bir PowerShell betiği bozuldu, iki kaynak dosyaya **NUL baytı** girdi (git
dosyayı ikili saydı ve sözlük testinin kaynak taraması sessizce bozuldu).
Kaçış içeren içerikte `Edit` aracını kullan; yazdıktan sonra
`python -c "print(open(p,'rb').read().count(b'\x00'))"` ile kontrol et.

**`Platform` gibi ortam değişkenleri kabuklara sızıyor.** Uygulama kendi
sürecinin ortamını açtığı her kabuğa veriyor. Geliştirme kipinde bu ortam
`vcvars64`ten geliyor. Bir kabuk aracının beklenmedik davranışı varsa önce
`Get-ChildItem env:` ile NTerminal içindeki ortamı normal terminaldekiyle
karşılaştır.

**Terminale yazılan metin yeniden ölçülendirmeye uyum sağlamaz.** Ortalanmış
ya da tam genişlikte bir şey çizilecekse tampona yazmak yerine DOM katmanında
çizilmeli (`TerminalBlocks` bunu yapıyor).

**Elle tutulan listeler.** Yeni bir ayar satırı `data-setting` taşımalı ve
`settingsIndex.ts` içine yazılmalı; yeni bir metin iki dilde tanımlanmalı ve
kullanılmalı. Üçünün de testi var ve düşen test "bir liste güncellenmedi"
demek, "kod bozuk" değil.

---

## 4. Doğrulama

```bash
npm test
```

TypeScript tip denetimi + vitest + cargo. Rust testleri doğrudan `cargo test`
ile koşulamıyor (bkz. `scripts/win-env.ps1`). Ayrıntı ve sık düşen testlerin
anlamı için `.claude/skills/testler/SKILL.md`.

Bu oturumun sonunda: **932 arayüz testi**, **110 Rust testi**, tip denetimi
temiz.
