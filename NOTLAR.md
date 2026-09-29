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

### 1.9 Durum çubuğu, arayüz ölçüsü ve terminalin korunması

**Yeni grup açmak ilk grubun terminalini boşaltıyordu.** Bildirilen belirti:
ilk grupta `ng serve` çalışırken yeni grup açılınca o sekmenin ekranı
siliniyor. Zincir iki halkalı ve ikisi de ayrı ayrı düzeltildi:

1. Yeni grubun bir çizim boyunca sekmesi yok (sekmeyi `App` bir etkide
   ekliyor). [`TerminalArea`](src/components/TerminalArea.tsx) o çizimde "hiç
   sekme yok" kutusunu ALANIN YERİNE döndürüyordu — yani yalnızca yeni grubun
   değil, bağlı HER sekmenin barındırıcısı ağaçtan çıkıyordu. Kutu artık alanın
   İÇİNDE bir katman.
2. React barındırıcıları yeniden kurunca `attach` ikinci kez çağrılıyor ve
   orada `term.open()` vardı — **xterm ikinci çağrıda hiçbir şey yapmıyor**
   (`if (this.element?.ownerDocument.defaultView && this._coreBrowserService) return`).
   Terminalin düğümü kopmuş eski kabın içinde kalıyor, yeni kap boş duruyordu.
   [`TerminalSession.attach`](src/terminal/TerminalSession.ts) artık düğümü
   TAŞIYOR.

Testler: `components/emptyGroup.test.tsx` (düğüm kimliği korunuyor mu),
`terminal/reattach.test.ts` (ikinci kap, yeniden açma değil taşıma).

**Durum çubuğu artık yalnızca kimlik taşıyor.** Grup, profil, klasör görünür;
okumalar (komut çalışıyor, komut takibi, geçmişten tamamlama, pid, komut ve
sekme sayısı) "⋯" menüsünde. Eski ayrım YER darlığına göreydi — hepsi çubuktaydı,
sığmayan menüye düşüyordu; sonuç pencere genişliğine göre değişen bir şeritti.
Rozetlerin ipuçları da kayboldu sanılmasın diye `MenuEntry`nin `info` girdisine
`title` eklendi. Sığdırma hesabı duruyor (`lib/statusFit.ts`) ama gerekçesi
değişti: çubukta kalan üç öğenin ikisini KULLANICI adlandırıyor. "⋯" artık her
düzeyde hesaba giriyor, çünkü kalıcı.

**"Kabuk önerisi" → "Geçmişten tamamlama".** Eski ad ne dediğini söylemiyordu:
neyin önerildiği de, kimin önerdiği de belirsizdi. Yapılan iş şu — kabuk,
geçmişte çalıştırılan komutlardan satırın kalanını tamamlıyor.

**Arayüz yazı tipi ayrı bir ayar** (`Appearance.uiFontFamily`, `uiFontSize`).
`styles/global.css` içindeki 98 `font-size` değeri `rem`e çevrildi ve kök
`--ui-font-size`e bağlandı; `em` değil `rem` çünkü `em` iç içe kurallarda
KATLANIYOR. Terminal etkilenmiyor: xterm ölçüsünü JS seçeneğinden alıyor ve
kendi ölçüm elemanlarına açıkça yazıyor (`.xterm-rows`, genişlik önbelleği).
Metin taşıyan iki sabit yükseklik (`.tab`, `.group-row`) asgariye çevrildi.

### 1.10 Gruplanmamış sekmeler, Ctrl+C ve geçmiş paneli

**Sekme artık bir gruba ait olmak zorunda değil.** Bildirilen istek: "Bir
sekmeyi illa gruba eklemeye gerek olmamalı… her zaman bir grup seçili olduğu
için sağ tıklayıp sekme ekle dediğimde seçili gruba ekleniyor." MODEL
DEĞİŞMEDİ — sekmeler yine bir grubun içinde. Değiştirmek "sekme nerede
yaşıyor" sorusunu geçmiş kaydından favori süzgecine, bölme kipinden aktarıma
kadar her yerde ikiye bölerdi. Bunun yerine TEK bir grup `ungrouped` olarak
işaretleniyor ve kenar çubuğunda **başlıksız düz bir liste** olarak, en üstte
çiziliyor. Kova talep üzerine kuruluyor (`addLooseTab`), son sekmesi kapanınca
kayboluyor, süzgeçten muaf ve en üstte sabit. Adı çeviriden geliyor
(`groupLabel`), çünkü kullanıcının koyduğu bir ad değil.
Testler: `store/looseTab.test.ts`, `lib/tabs.test.ts`.

**"Gösterilecek fark yok" — iki git kuralının ayrışması.** `status --porcelain`
yolları her zaman depo KÖKÜNE göre veriyor; `diff -- <yol>` ise pathspec'i
BULUNULAN DİZİNE göre çözüyor. Kabuk bir alt klasördeyken ikisi tutmuyor ve
çıktı boş dönüyordu. Aynı sebeple `revert` de sessizce hiçbir şey yapmıyordu —
yıkıcı bir işlemin sessizce çalışmaması daha kötü, kullanıcı geri alındığını
sanıyor. Komutlar artık KÖKTEN koşuyor ([`git.rs`](src-tauri/src/git.rs)
`work_dir`) ve `GitInfo.root` arayüze taşınıyor ("dosyayı aç" tam yolu ondan
kuruyor). Testler: `git_tests.rs` `alt_klasorden_*`, `GitChanges.test.tsx`.

**Ctrl+C ile durdurma — iki basış.** Komut çalışırken kutu kapanıp yerine şerit
geliyor, odak terminalin DIŞINDA kalıyor ve genel kopyalama dalı tuşu
yutuyordu; kabuğa SIGINT hiç gitmiyordu. İki basış kullanıcının isteği: aynı
tuş kopyalama da demek. İlk basış silahlıyor (şerit kırmızıya dönüp "tekrar
basın" yazıyor, şerit yoksa balon), ikincisi durduruyor; silah 1.5 sn sonra
kendiliğinden düşüyor. **Terminalin içi hariç** — orada düz Ctrl+C kabuğun
kendi tuşu ve tek basışta gitmeli. Testler: `store/stopRunning.test.ts`.

**Komut kutusuna yapıştırma.** mac'te Cmd+V burada yakalanıp `session.paste()`e
gidiyordu; o da `navigator.clipboard.readText()` çağırıyor ve WebKit panoyu
okumak için kendi "Paste" düğmesini çiziyor. İzin verilse bile metin KUTUYA
değil kabuğa giderdi. Kutu zaten bir `textarea`: kopyala/yapıştır artık
yakalanmıyor. Aynı satırın ikizi kaçış kapısındaydı (`e.ctrlKey || e.metaKey`)
ve mac'te Cmd+C'yi SIGINT'e çeviriyordu — yalnızca gerçek Ctrl'e bağlandı.

**Diff'te bağlam açıcıları** (eski açık iş 2.2). Fark bloklarının arasındaki
değişmemiş satırlar artık açılabiliyor: "59 değişmemiş satır" yazan bir şerit,
solunda satır numarası sütunuyla aynı genişlikte bir düğme bloğu, iki ok ve
elli satırlık adımlar.

Tasarımın iki kararı var. Birincisi satırların NEREDEN geldiği: ilk taslak
`git diff -U<n>` ile daha geniş bağlam istemeyi öneriyordu ama `-U` her hunk'ın
İKİ yanını birden açıyor, yani "yukarıyı aç" diye bir şey yok. Onun yerine
dosyanın kendisi okunuyor (`readTextFile`) — çalışma ağacındaki dosya farkın
YENİ tarafı, açılan satırlar doğrudan oradan. İkincisi adlandırma: açılma
miktarları EKRANDAKİ yöne göre tutuluyor (`top` / `bottom`), kaynağa göre değil
("önceki hunk'tan aşağı") — kaynağa göre adlandırma okla ters düşüyordu.

Metin "gizli" DEMİYOR: satırlar saklanmıyor, yalnızca değişmedikleri için
gösterilmiyorlar — "gizli" bir sır ima edip okuyanı "neden" diye
düşündürüyordu. Düzen de iki parçalı (Warp'ın açıcısı gibi): solda düğme
bloğu, sağda okunacak metin. Önce hepsi tek bir sıraydı ve düğmeler şerit
zemininde yüzüyordu; nereye basılacağı ancak imleç üzerine gelince belli
oluyordu.

**Kabuk kapanınca otomatik yeniden başlatma.** "Bu sekmedeki kabuk kapandı"
kutusu kalktı; kabuk düşünce sekme kendiliğinden yeni bir kabuk açıyor. Asıl iş
iki koruma:

- **Döngü.** Koşulsuz yeniden başlatma, açılamayan bir kabukta saniyede
  yüzlerce süreç demek. Kural "arka arkaya HEMEN ölme" (`AUTO_RESTART_GAP_MS`):
  kabuk bu süreden kısa yaşadıysa ikinci kez denenmiyor ve karar kullanıcıya
  bırakılıyor — kutu yalnızca o durumda çıkıyor, metni de tekrarı anlatıyor.
- **Ekran.** Yeniden başlatma xterm örneğini yeniden kuruyor ve yeni örnek boş
  açılıyor; elle basılan bir düğmede göze alınabilir bir bedeldi, kendiliğinden
  olunca değil. `restartTab` artık ekranı serileştirip kaydırma tamponuna
  yazıyor — oturum geri yüklemenin zaten kullandığı yol, dolayısıyla ayıraç da
  kendiliğinden doğru yerde çiziliyor.

Testler: `store/autoRestart.test.ts` (döngü koruması dâhil; sahte saat testler
arasında bir saat ileri alınıyor, çünkü kayıt modül düzeyinde yaşıyor).

**Satır düzeni.** Sayaç (`+15 -1`) dosya adının yanına alındı; sağ uç eylemlere
bırakıldı ve eylemler artık HER ZAMAN görünür (soluk, satır üstündeyken tam).
Eylemler mutlak konumdan AKIŞA geçti: mutlak konum sayaçla çakışmayı garanti
ediyordu, akışta çakışma diye bir şey kalmıyor ve yola ayrılan yer kendiliğinden
doğru hesaplanıyor. Yol da artık esnemiyor yalnızca sıkışıyor (`flex: 0 1 auto`),
yoksa bütün boşluğu yiyip sayacı sağ uca itiyordu.

**İki yarış ve bir gürültü** aynı özellikte peş peşe çıktı, üçü de burada:

1. *"Dosya okunamadı" diyor ama dosya var.* Fark ile dosya tek bir etkide arka
   arkaya isteniyordu ve `lines` etkinin BAĞIMLILIĞIYDI: `setLines` bir yeniden
   çizim tetikliyor → React etkiyi yeniden koşmadan önce eskisinin temizliğini
   çağırıyor → temizlik `cancelled = true` diyor → yoldaki dosya okuması
   atılıyordu. Belirti yalnızca GERÇEK IPC gecikmesinde görünüyordu; sahte IPC
   anında çözüldüğü için testler yakalamıyordu. Bugün "bunu zaten getirdim mi"
   sorusunu bir ref anahtarı yanıtlıyor, durum bağımlılık değil. Test okumayı
   bilinçli olarak bir sonraki döngüye atıyor — hatayı ancak öyle üretiyor.
2. *Panel yeniden boyutlandırmada bozuluyordu* — ayrıntısı §1.10'da.
3. *Künye satırları* (`diff --git`, `index`, `--- a/`, `+++ b/`) artık
   çizilmiyor: dosya adı satırın başlığında zaten yazıyor ve bu dört satır dar
   panelde görünen farkın üçte birini yiyordu. Ayrım "meta mı" değil "başka
   yerde yazıyor mu": `Binary files`, `rename from/to`, `similarity index` ve
   `old/new mode` KALIYOR — tek kaynakları o satırlar.

Hunk başlığı (`@@ -10,7 +10,8 @@`) artık çizilmiyor: söylediği iki şeyden biri
şeridin kendisinde (kaç satır), öteki numara sütununda. Başlığın tek özgün
parçası olan kapsayan işlev adı şeridin sağına taşındı. Dosya okunamıyorsa
(silinmiş, ikili) şerit yine yazıyor ama düğmesiz — kopukluk gerçek, yalnızca
açılamıyor. Testler: `lib/diff.test.ts`, `components/GitChanges.test.tsx`.

**Boş satırda yukarı ok: geçmiş paneli.** Warp'ın davranışı istendi — kutunun
ÜSTÜNDE "GEÇMİŞ" başlıklı panel. Panel zaten vardı (`SuggestionBar`), eksik
olan onu boş satırda açan yoldu (`recentCommands` + `openHistorySuggestions`).
Önceki hâli Ctrl+R penceresini açıyordu; doğru işi yapıyordu ama ekranın
ortasında bir örtü olarak. Panel açıkken Enter seçileni KUTUYA yazıyor,
çalıştırmıyor: tek Enter'la geçmişten komut koşturmak `rm -rf` sınıfı bir kaza.

**Liste O SEKMEYE ait.** İlk hâli tüm sekmelerin ortak havuzundan geliyordu ve
bildirilen istek bunu düzeltti: "bir terminal açtığımda yukarı oka bastığımda o
terminalin geçmişi gelsin". Gerçek bir kabuk da yalnızca kendi oturumunu
hatırlıyor. Süzgeç `SuggestEntry.tabId` üzerinden; `Ctrl+A` kapsamı tüm
sekmelere genişletiyor (Ctrl+R penceresindeki kısayolun aynısı) ve panelin
altındaki etiket hangi kapsamda olduğunu söylüyor.

Bunun bir yan koşulu var: öneri kaynağındaki tekrar temizliği de SEKME BAŞINA
yapılmak zorunda (`noteCommand`). Komut metnine bakıp hangi sekmede olursa
olsun eskisini silmek, A'da çalıştırılan bir komutu B'de tekrar çalıştırınca
A'nın geçmişinden düşürüyordu — "bu sekmenin geçmişi" garantisi oracıkta
bozulurdu. Yeni ve kendi geçmişi hiç olmayan bir sekmede liste tüm geçmişten
kuruluyor: orada hiçbir şey açmamak "geçmişim gitti" demek olurdu, yani
panelin var oluş sebebinin tersi.

**Ctrl+R penceresinde favoriler artık davetsiz değil.** Bildirilen: "en üstte
favorilere eklediklerim geliyor, gelmemeli; orada bir tik olabilir." Pencerenin
sorduğu soru "bu sekmede ne çalıştırdım"; favori ise bir NİYET — hiç
çalıştırılmamış bir favori listenin başını tutup aranan komutu aşağı itiyordu.
Tik (`Ctrl+F`) eski davranışı geri veriyor. Buradaki tuzak tekrar süzgeci:
yalnızca favoriler listedeyken çalışmak zorunda, yoksa favoriye eklenmiş bir
komut geçmiş satırından da elenir ve Ctrl+R ile hiç bulunamazdı
(`components/HistoryRecall.test.tsx`).

### 1.11 Yeni sürüm bildirimi

Uygulama kendini GÜNCELLEMİYOR, haber veriyor: her açılışta GitHub'ın son
yayınını okuyup sürümü karşılaştırıyor, yenisi varsa durum çubuğunda bir rozet
çıkıyor. Kendi kendine güncelleyen bir akış (Tauri updater) imza anahtarı,
imzalı paket üreten bir CI ve yayımlanan bir `latest.json` istiyor; üçü
kurulmadan çalışmıyor — bildirim ise hiçbir kuruluma bağlı değil.

**`curl`, HTTP kütüphanesi değil.** `ureq`/`reqwest` + rustls kendi kök
sertifika listesini taşıyor ve sistemin güven deposunu yok sayıyor; araya giren
bir kurumsal TLS proxy'sinde denetim hep başarısız dönerdi (kullanıcının
çalıştığı ağ tam olarak öyle). `curl` sertifikayı da vekil sunucuyu da işletim
sisteminden alıyor ve yeni bir bağımlılık gerektirmiyor. Bulunmama riski düşük
(Windows 10 1803+, macOS her zaman) ve sonucu zararsız: denetim sessizce
başarısız oluyor.

**Karşılaştırma Rust tarafında** (`update::is_newer`), arayüzde değil: "hangisi
yeni" sorusunun tek bir doğru yanıtı var ve iki yerde ayrı yazılırsa biri
güncellenip öteki unutulduğunda ya bildirim hiç çıkmıyor ya da her açılışta
çıkıyor. Kural noktayla ayrılmış sayısal parçalar + semver'in ön-yayın kuralı;
taslak ve ön-yayınlar atlanıyor.

**"Yeni sürüm yok" ile "denetleyemedim" AYRI.** Birleştirilirse ağı olmayan bir
makinede "bu sürüm güncel" yazılırdı — bilmediğimiz bir şeyi biliyormuş gibi.
Depo eylemi `undefined` (istek düştü) ile `null` (yeni yok) ayrımını taşıyor.

**Ayar kapalıyken hiçbir istek yok**, ama Ayarlar'daki düğme yine çalışıyor:
ayar KENDİLİĞİNDEN yapılan denetimi kapatıyor, düğmeye basmak isteğin kendisi.

Testler: `src-tauri/src/update_tests.rs` (sürüm karşılaştırması ve yanıt
ayrıştırma), `store/updateCheck.test.ts`, `components/updateBadge.test.tsx`.

**Açık uç:** depoda henüz yayın yok, yani rozet hiç çıkmıyor. İlk GitHub
Release yayımlandığında çalışmaya başlıyor; CI şu an paketleri yalnızca koşu
çıktısı olarak yüklüyor, Release oluşturmuyor.

### 1.12 Komut kutusunda Ctrl+C: karar tek yere indi

**Bildirilen hata:** "Komut yazın kısmında `cd Desktop\Work\Github\Survey`
yazıyorum, metni seçip kopyalamak için Ctrl+C basıyorum; metin kayboluyor ve
kopyalayamamış oluyorum." Sebep tekti: Ctrl+C'nin "kopyala mı, kes mi" kararı
oturumdaydı (`wantsCtrlCCopy` → `term.hasSelection()`) ve yalnızca terminal
IZGARASINDAKİ seçimi biliyordu. Kutu bir `textarea`, seçimi tarayıcının
modelinde; oturum onu göremiyor, karar "seçim yok" çıkıyor, tuş `\x03` olarak
kabuğa gidiyor ve `setValue("")` satırı siliyordu — pano boş, komut yok.

**İlk düzeltme yanlış derinlikteydi.** Kutuya kendi Ctrl+C koşulu yazıldı
(`!isMac() && ctrlKey && seçim var → return`). Aynı gün koşturulan kod
incelemesi (8 açı, 7 doğrulayıcı) bunun bedelini saydı: platform kuralı iki
yerde, `ctrlCCopiesSelection` ayarı yalnızca birinde, tuş yüklemi üç biçimde
(`toLowerCase()==="c"` / `==="c"||==="C"` / App.tsx'in kendi hâli) — ve
`keysMac.test.ts`'in "kural tek yerde" koruması yalnızca `App.tsx`i okuduğu için
kopyayı görmüyordu. Tam da o testin başındaki senaryo: kopyalar ayrışırsa tuş
ya boşa gider ya da SIGINT kabuğa hiç ulaşmaz.

**Bugünkü hâl.** Kural saf bir işlevde: [`resolveCtrlC`](src/lib/inputMode.ts)
— `{ mac, copiesSelection, boxSelection, gridSelection }` alıyor,
`"copy-box" | "copy-grid" | "sigint"` veriyor. Sıra: mac → her zaman kabuğa
(kopyalama Cmd+C); ayar kapalı → kabuğa (kullanıcı "her zaman kes" demiş; ayarı
yalnızca ızgarada saymak onu yarım yalan yapardı); kutudaki seçim → kutu;
ızgaradaki → ızgara; yoksa kabuğa. Oturum girdileri topluyor
(`ctrlCAction(boxSelection)`; `wantsCtrlCCopy` ona devrediyor), kutu yalnızca
kendi seçimini bildiriyor. Koruma testi artık `CommandInput.tsx`i de okuyor ve
orada `ctrlCCopiesSelection` ya da `isMac()` görürse düşüyor.

**Kutu kopyalamayı kendisi yapıyor.** Üç sebep, üçü de ölçüldü:

1. Windows'ta kopyalama kısayolu Ctrl+Shift+C ve `App.tsx` onu "tarayıcı
   kopyalasın" diye kutuya bırakıyordu — tarayıcının o tuşa bir karşılığı YOK
   (yapıştırma için doğru: Ctrl+Shift+V düz metin yapıştırıyor; kopyalama için
   o gerekçe yarı doğruydu). Tuş kutuda ölüyordu.
2. Odak kutudayken ızgarada seçim varsa (çıktıdan sürükleyip seçince kutu
   odağı `mouseup`ta geri alıyor) eski kod yalnızca `return` ediyor ve "App.tsx
   kopyalıyor" diyordu — kopyalamıyordu; oradaki dal odağın TERMİNALDE olmasını
   istiyor. Hiçbir şey kopyalanmıyor, ızgara seçimi de durduğu için sonraki her
   Ctrl+C aynı yere düşüyordu. Kutu artık `copyForCtrlC`yi kendisi çağırıyor.
3. Ctrl+C ile kopyalandıktan sonra kutudaki seçim KALDIRILIYOR; yoksa seçim
   durduğu sürece her Ctrl+C yine kopyalar ve tuşun öteki anlamına (satırı
   bırak) ulaşılamaz — ızgara yolu aynı sebeple `clearSelection()` çağırıyor.
   Kısayolla kopyalamada seçim duruyor: orada ikinci bir anlam yok.

**Denetim karakterleri yalnız Ctrl ile.** `passThroughSequence` olayı olduğu
gibi alıyor (`KeyboardEvent` adlarıyla) ve Shift, Alt ya da Win eşlik ediyorsa
geçirmiyor. Her eksik değiştirici bir kez hata oldu: Shift → Ctrl+Shift+C
SIGINT'e dönüşüyordu; Alt → Windows'ta AltGr tarayıcıya `ctrl+alt` geliyor,
Türkçe Q'da sürekli basılan tuş, eşlenmemiş AltGr+C satırı siliyordu ve
Ctrl+Alt+D EOF gönderip kabuğu kapatabiliyordu. `SIGINT` sabiti dışa açıldı;
"Durdur" düğmesi sahte tuş olayı kurmak yerine onu gönderiyor.

**`133;A` açık komutu kapatıyor.** `running` yalnızca `133;D` ile düşüyordu;
`D` kaçınca (kaçan parça, yedek zamanlayıcının açtığı kayıt) `running` açık
kalıyor, ardından gelen `133;B` `atPrompt`ı açıyor ve ikisi aynı anda doğru
oluyordu: kutu çiziliyor ama `App.tsx`in durdurma dalı Ctrl+C'yi kutuya
ulaşmadan yutuyor — ne kopyalama ne SIGINT, "tekrar basın" şeridi de yok
(yalnızca kutu kapalıyken çiziliyor). Yeni istem çiziliyorsa önceki komut
bitmiştir; `A` artık `closeBlock(null)` + `endCommand(null)` çağırıyor, ikisi
de boşta zararsız.

**Açılışın ref koruması.** Geliştirme kipinde `useStore.ts` düzenlenince
uygulama "N-Terminal yükleniyor…" ekranında sonsuza kadar kaldı. Depo sıcak
yenilemeyle `ready:false` ile sıfırdan kuruluyor, `App` ise yerinde kalıyor ve
Fast Refresh **ref'leri koruyor** — `bootstrapped` ref'i "bir kez koştum"
diyor, yeni depo için hiç koşmamıştı. Belirti yanlış yere yazılmak üzereydi
("ikinci örnek kilit tutuyor"); Rust tarafı yalnızca iki kilit alıp klonluyor,
takılacak bir şeyi yok. Koruma artık deponun `ready` alanı.

**Kurulu sürüm ile depo ayrışması.** Kullanıcının "yeni grup açınca yazı üst
kısma gidiyor" bildirimi, kurulu 1 Eylül 23:10 derlemesinde (`bd4ffb0`)
çıktı; §1.9'daki "sekmesiz grup bütün barındırıcıları söküyordu" düzeltmesi
(`a678f95`, 2 Eylül 01:30) o derlemede yoktu. Güncel kodda canlı denemede
tekrarlanmadı. Bir bildirim geldiğinde önce `(Get-Item "C:\Program
Files\N-Terminal\nterminal.exe").LastWriteTime` ile derleme tarihini `git log`
ile karşılaştır.

Testler: `lib/inputMode.test.ts` (`resolveCtrlC` altı durum, değiştirici
matrisi, `SIGINT`), `components/CommandInput.test.tsx` (kutu/ızgara seçimi,
seçim kalkması, kısayolla kopyalama, AltGr), `lib/keysMac.test.ts` (koruma
üç dosyada). Canlı doğrulama CDP üzerinden yapıldı (bkz. §3 ve
`.claude/skills/calistir`): pano gerçekten `cd Desktop\Work` oldu, ikinci
Ctrl+C terminale `^C` düşürdü, yeni grubun kutusu yazıyı aldı.

### 1.13 `cd` önerisi tam eşleşen klasöre iniyor

**Bildirilen hata:** "cd NYAYAN yazdığımda NYAYAN altındaki dizinler için
tamamlama yok; cd yapınca geliyor, bir yol yazdıktan sonra gelmiyor." Canlıda
(CDP ile) ölçülen: `cd Desktop\Work\NYAYAN` yazıldığında panel **1/1** açılıyor
ve tek satırı `cd Desktop\Work\NYAYAN` — kullanıcının zaten yazdığı şey. Kabul
akışında da aynı: `cd Desk` → kabul → `cd Desktop`, panel yine `cd Desktop`
diyor. Yeni bir şey söylemeyen satır öneri değil; kullanıcı onu haklı olarak
"öneri yok" diye okuyor. Ayırıcıyla (`cd …\NYAYAN\`) alt klasörler geliyordu
ama ayırıcıyı yazmayan kişi boş kalıyordu.

**İki kural, ikisi de saf modülde (`lib/cdSuggest.ts`):**

1. Yazılanla birebir aynı ad listeden düşüyor (`cdSuggestions`).
2. Yazılan son parça listedeki bir klasörle TAM eşleşiyorsa (büyük/küçük
   harf gözetmeden, `exactDir`) o klasörün İÇİ önce geliyor (`descend`) —
   kabuğun sekme tamamlaması gibi. Aynı adla başlayan kardeşler onun ardından:
   `Work` yazana `Work\Docs`… ve `Workspace`. Üretilen komut diskteki adı
   kullanıyor (`nyayan` yazana `NYAYAN\…`), ayırıcı kullanıcının yazdığı.

**Önbellek tek girdiden çoklu girdiye.** İnme kuralı aynı hesapta iki dizin
listesi istiyor (üst: eşleşme var mı; alt: çocuklar). Tek girdilik önbellek
birini her seferinde düşürür ve iki dizin arasında getir-at döngüsü kurulurdu.
Şimdi küçük bir `Map` (8 dizin) ve "getiriliyor" kümesi; liste gelince hesap
kullanıcının o anki girdisiyle yeniden koşuyor. Bir komut BİTİNCE önbellek
boşalıyor (`mkdir` yeni klasör açmış olabilir); tuşlar arasında tazelenmiyor.

Testler: `lib/cdSuggest.test.ts` (aynı ad düşüyor, tam eşleşme ve inme,
ayırıcı korunuyor, diskteki ad). Depo tarafı testte yok — `activeSession()`
jsdom'da kurulamıyor; canlı doğrulama CDP ile: `cd Desktop\Work\NYAYAN` beş
alt klasör, kabul sonrası `cd Desktop` üç alt klasör, küçük harfle `cd
desktop\work` yine `Work`un içi.

### 1.14 "Yanıt vermiyor" donması: teşhis okuması

**Bildirilen hata:** iki olay. (1) Altı sekme, birkaç dev sunucusu açıkken
sekmeler arasında geçiş yapılamıyor, uygulama donuyor — **kapatıp açana kadar
geçmiyor**. (2) `npm run build -- --configuration dev` koşarken uygulama yanıt
vermiyor, **30-40 saniye sonra kendiliğinden** düzeliyor. Ayrıca pencereyi
başlıktan sürüklemek arada takılıyor.

**Sebep ARANDI, bulunamadı.** Canlı uygulamada (CDP + kare sondası, gerçek iş
yüküyle) üç hipotez ölçümle ELENDİ:

| Deney | Sekme geçişi | En büyük kare boşluğu |
|---|---|---|
| 130 MB kesintisiz çıktı akışı | 51 ms | 127 ms |
| 16 çekirdek %97 doygun, terminalde çıktı yok | 62 ms | 43 ms |
| `ng build --configuration dev` (bildirilen komut) | 50-72 ms | 69 ms |

- **Ham çıktı hacmi değil.** ConPTY bayt borusu değil EKRAN borusu: kaydırıp
  geçen çıktıyı özetleyerek yayıyor, ölçülen verim ~1,2 MB/s'de kalıyor.
- **CPU açlığı değil.** Windows zamanlayıcısı ön plandaki pencereyi besliyor.
- **Bildirilen komutun kendisi değil.** Aynı derleme, arayüzü hiç bozmadı.

**Denenip GERİ ALINAN çözüm.** İlk teşhis "sınırsız IPC kuyruğu" idi:
`app.emit` ateşle-ve-unut, arayüz yetişmezse olaylar WebView kuyruğunda
birikiyor. Onay tabanlı geri baskı yazıldı (Rust'ta onaylanmamış bayt sayacı +
`pty_ack`) ve ölçüldü: tavan 130 MB boyunca **hiç devreye girmedi**, en kötü
kare boşluğu 127 → 78 ms, akış süresi 96 → 109 sn (~%13 yavaşlama). Yani
kanıtlanmamış bir fayda için sürekli fazladan IPC. Geri alındı.

**Yapılan: aramayı tahminden ölçüme taşımak.** Ayarlar › Hakkında › Teşhis
([`components/HealthPanel.tsx`](src/components/HealthPanel.tsx),
[`lib/health.ts`](src/lib/health.ts)) iki ayrı yoldan geçen iki sonda
gösteriyor — görev kuyruğu (`setTimeout` sapması, çizimden bağımsız) ve çizim
döngüsü (`requestAnimationFrame` boşluğu, GPU'ya bağlı):

| Görev kuyruğu | Çizim | Anlamı |
|---|---|---|
| takılıyor | takılıyor | Ana iş parçacığı bloke: JavaScript, React, xterm |
| temiz | takılıyor | Çizim hattı: WebView2 / GPU / birleştirici |
| temiz | temiz | Donma arayüzde değil |

Takılmalar (≥250 ms) zaman damgasıyla halka tamponda tutuluyor: **donmuş bir
uygulamada kullanıcı Ayarlar'ı açamaz**, kayıt sonradan okunmalı. Yanında
sekme başına biriken durum sayaçları var (tampon satırı, işaretçi, dekorasyon,
blok) — kalan hipotez bu ve hangisinin büyüdüğü görülmeden doğru yeri aramak
tahmindir.

**İki yanlış sondaj yazıldı ve ölçümle atıldı** — ikisi de aynı hatanın iki
yüzü, panelin yanlış tarafı suçlaması:

1. Birleştirici, compositor'da koşan bir CSS animasyonunun `currentTime`ından
   okunuyordu. Ana iş parçacığı bilerek 900 ms bloke edildiğinde animasyon da
   889 ms geride görünüyordu: `Animation.currentTime` belge zaman çizelgesine
   bağlı ve o da kare başına bir kez ilerliyor, yani iki sayı aynı şeyi
   ölçüyordu.
2. Takılmanın kuyruk değeri kayıt anındaki son sapmaydı ve "çizim 915 ms ·
   kuyruk 0 ms" yazıyordu — sebebi tümüyle JavaScript olan bir donmayı çizime
   yıkıyordu. Sebep sıralama: bloklanma bitince gecikmiş rAF ile gecikmiş
   `setTimeout` birlikte kuyruğa giriyor ve rAF önce koşabiliyor. Değer artık
   takılmanın kapsadığı aralıktan geriye okunuyor (`maxDriftIn`) ve 150 ms
   sonra dolduruluyor.

**Yanında düzeltilen sızıntı.** `closeTab` yalnızca `running` haritasını
temizliyordu; `exited`, `inputSignals`, `runLinks`, `scrollAtBottom` ve
`sessionEpoch` kapanan sekmenin anahtarını sonsuza dek taşıyordu
(`dropTabKeys`). Küçük değerler ama uygulama günlerce açık kalıyor.

Testler: `lib/health.test.ts` (yüzdelikler, halka tampon, aralık okuması),
`store/dropTabKeys.test.ts`. Canlı doğrulama: ana iş parçacığı 900 ms bloke
edildiğinde panel `çizim 912 ms · kuyruk 886 ms` yazıyor — ikisi birden, yani
doğru taraf.

**Açık:** belirti hâlâ yeniden üretilmedi. Sıradaki adım kullanıcının KURULU
uygulamasında uzun bir oturum boyunca panelin okunması; geliştirme örneği
yeniden yüklendikçe kayıt sıfırlanıyor.

### 1.15 Sekme geçişi ağır komutlar altında yavaşlıyordu

**Bildirilen hata:** "sekmeler arası geçişte yavaşlıyor, `ng build` `dotnet
run` gibi komutları çalıştırınca."

**Ölçüm.** Altı sekme, dördünde kesintisiz çıktı akarken geçiş 50-84 ms ve
geçiş başına en büyük kare boşluğu 70 ms — her sekme değişiminde üç-dört kare
düşüyor. Örnekleme profili (CDP `Profiler`, 18 geçiş, 5,5 sn) sebebi isimle
verdi:

| İş | Süre |
|---|---|
| genel bakış sütununun `onRender` işleyicisi (`clientHeight` okuyup yerleşimi zorluyor) | 990 ms |
| `createRow` — DOM oluşturucu satır kuruyor | 263 ms |
| `replaceChildren` | 189 ms |
| `getContext` — WebGL bağlamı kuruluyor | 144 ms |
| `_measure` — karakter ölçüsü | 141 ms |
| `handleResize` + `getShaderParameter` (WebGL kurulumu) | 129 ms |

**Kök neden:** bağlam SEKME BAŞINA DEĞİL ODAK BAŞINA veriliyordu. Odağı
kaybeden terminalin WebGL eklentisi bırakılıyor, xterm onun yerine sıfırdan
DOM oluşturucu kuruyor; odağı alanda ters yönde aynı iş. Yani her geçiş iki
oluşturucu kurulumu ödüyordu. Bedeli geçişte de bitmiyor: DOM oluşturucuyla
çizilen gizli terminaller kare başına DOM'u değiştiriyor ve bu, genel bakış
sütununun her çizimdeki `clientHeight` okumasını gerçek bir yerleşim hesabına
çeviriyor — listenin başındaki 990 ms buradan.

**Çözüm:** bağlam artık odakla gelip gitmiyor; görünür olana veriliyor ve
tavan (`MAX_WEBGL = 8`) zorlamadıkça KALIYOR. Görünmez olan bağlamını
bırakmıyor, yalnızca sırada geriye atılıyor (ilk kurban). Sıralama saf ve
ayrı: [`lib/webglLru.ts`](src/lib/webglLru.ts).

**A/B (aynı yük, iki sekme arası 12 geçiş):**

| | Geçiş süresi (ortanca / en büyük) | Geçişin blokladığı kare |
|---|---|---|
| Eski (odakla gelip giden bağlam) | 59 / 68 ms | 50 / 64 ms |
| Yeni (kalıcı bağlam, tavan 4) | 34 / 50 ms | 22 / 45 ms |

Profilde boşta geçen süre **%24,8 → %59,7**.

**Tavan neden sekiz.** Yayın derlemesinde (beş sekme, dördünde çıktı) dört ile
geçişler 27-33 ms ve kare düşmüyor, ama tavanın dışında kalan beşinci sekmeye
ilk geçiş **233 ms** sürüyor (tek karede 231 ms blok): bağlam o sekme için
sıfırdan kuruluyor. Kullanıcının çalışma alanı altı sekme, dolayısıyla sekiz
bu uçurumu gerçek kullanımda tümden kaldırıyor ve motorun ~16 sınırının
yarısında kalıyor. Uçurum yok olmuyor, dokuzuncu sekmeye taşınıyor.

Yayın derlemesi ayrıca hata ayıklamadan belirgin hızlı: iki sekme arası
ortanca **33 ms**, en büyük 34 ms, kare boşluğu 17-18 ms.

Testler: `lib/webglLru.test.ts` (sıraya alma, geriye atma, kimin düştüğü,
istek yapanın asla düşmemesi).

---

### 1.16 Sığmayan sekmelere ulaşmanın bir yolu yoktu

**Bildirilen hata:** "çok fazla sekme ekleyince sığmayınca bir ok işaretiyle
görünmeyen sekmeleri görüntüleyebilmeliyim."

Şerit `overflow-x: auto` ama kaydırma çubuğu bilinçli olarak gizli
(`.tabbar-strip`). Sonuç: taşan sekmelere yalnızca fare tekerleğiyle
ulaşılıyordu ve ekranda daha sekme olduğuna dair hiçbir işaret yoktu —
kullanıcı için o sekmeler yok demekti.

**Eklenen:** şerit taştığında sekme çubuğunun sağında bir ok + gizli sekme
sayısı; tıklayınca grubun TÜM sekmeleri listeleniyor, etkin olan işaretli.
Ölçülen: 14 sekmeyle 1320px'te "7", 1920px'te "2", sığdığında düğme hiç
çizilmiyor.

Üç karar ve gerekçesi:

- **Ok aşağı, sağa değil.** Gizli sekmeler şeridin iki yanında da olabiliyor;
  sağa bakan ok yanlış yön iddia ediyordu.
- **Sayı düğmenin üstünde.** "İki sekme daha var" bilgisi basmadan önce
  görünmeli, yoksa kullanıcı menüyü açıp kapatarak öğreniyor.
- **Listede grubun tümü var, yalnızca gizliler değil.** Hangilerinin gizli
  olduğu kaydırma konumuna bağlı; tam liste tek ve öngörülebilir bir cevap.

Menü satırlarına **ayırt edici ipucu** eklendi (`tabSubtitle`: çalışan komut
ya da klasör): kabuk başlığı kullanıcı adı olduğu için sekiz satır da
"nurullah.yayan" görünüyordu ve listenin var olma sebebi tam olarak doğru
sekmeyi bulmak. `ctx-hint` bu yüzden `flex: none` olmaktan çıktı — uzun ipucu
adı "Porta…", "P…" diye eziyor, birkaç satırda tümden kaybettiriyordu.

Testler: `lib/tabOverflow.test.ts` (yarı eşiği, iki yandan kırpılma,
ölçülemeyen sekme, hepsi sığdığında sıfır).

### 1.17 Komut çalışırken yanıt da kutuya yazılıyor

**Bildirilen:** "`ng serve` dediğimde 'Would you like to use a different port?
(Y/n)' geliyor; bu bilgiyi komut yazma kısmına yazamıyoruz, doğrudan mesajın
çıktığı yere yazıyoruz — gerçek bir terminal yapısı sağlamamış oluyor."

Eski karar bilinçliydi ve [`lib/inputMode.ts`](src/lib/inputMode.ts) başında
yazıyordu: komut çalışırken kutu kapanıyor, tuşlar ızgaraya gidiyor, çünkü
"program tuşları BİR BİR, o an isteyebilir". Doğru bir gözlem ama kullanıcıya
iki yazma yeri bırakıyordu: komut aşağıya, programın sorusuna yanıt yukarıya.

**Bugünkü hâl: üçüncü kip, `stdin`.** Kabuk istemdeyse `app` (komut satırı),
komut çalışıyorsa `stdin` (yanıt satırı), tam ekran programda ya da
entegrasyonsuz profilde `raw`. Yanıt satırında kural tek cümle
([`stdinKeyAction`](src/lib/inputMode.ts)): **kutu boşken** kutunun kullanmadığı
tuşlar doğrudan programa, yazmaya başlayınca satır kutuda ve Enter'la gidiyor.
Satırı Enter'a kadar tutmak terminal sürücüsünün kanonik kipte zaten yaptığı
iş; "tuşları o an isteyen" programların istediği tuşlar (oklar, Enter, Boşluk,
Esc, Ctrl+harf) boş kutuda anında geçtiği için seçim listeleri ve "bir tuşa
basın" çalışıyor. Dolu kutuda Tab satırı programa devrediyor (`flush`):
tamamlamayı REPL ya da ssh ardındaki kabuk yapıyor ve satırı görmeden
yapamaz.

Yan kararlar, her biri bir tuzağı kapatıyor:

- **İki ayrı değer** (`draft` / `reply`). Tek değerle, gönderilmemiş bir yanıt
  komut bitince kutuda kalıp sonraki Enter'da KOMUT olarak çalışırdı.
- **Parola sezgisi** ([`looksLikeSecretPrompt`](src/lib/inputMode.ts)). Terminal
  parola sorarken yankıyı kapatıyor, kutu kapatmıyordu; ConPTY konsolun kipini
  dışarı vermediği için elde kalan sorunun metni. İki noktayla biten ve parola
  sözcüğü taşıyan satır → yazılan nokta, panoya kopyalanmıyor.
- **Ctrl+C kutuda tek basış.** `App.tsx`in iki basış kuralı odak "yazılan yerin
  dışındayken" içindi; yanıt satırı artık yazılan yer, terminalin içi gibi
  dışarıda bırakıldı (`shellCtrlC`). mac'te kutudaki seçim Cmd+C'de kopyalama
  sayılıyor (`boxSelected`), yoksa tuş durdurma silahına dönerdi.
- **Odak etkisi `stdin`e de bağlı.** Komut başlarken kutu açık kaldığı için
  `active` değişmiyor; komut kenar çubuğundaki bir düğmeden başlarsa odak
  orada kalırdı.
- **Ölçü aynı.** Yanıt satırı komut satırıyla aynı yükseklikte (ölçüldü: ikisi
  de 32px, terminal 750px'te sabit) — komut başlarken terminal yeniden
  ölçülendirilmiyor, "flash" geri gelmiyor. `>_` yerine gelen nokta `2ch`
  genişlikte, metin aynı sütundan başlıyor.

**Bedel.** Yazdıkça süzülen listeler süzgeci Enter'da görüyor; Jest/Vitest
izleme kipinin tek harflik kısayolları harf + Enter istiyor (fazladan `\r`
çoğunda zararsız: "testleri yeniden koş"). Tuşları anında isteyen bir program
için çıkış yolu ayar: komut satırı kapatılınca terminal klasik davranışa
dönüyor. Ayrı bir "çalışırken kutu" ayarı eklenmedi; ihtiyaç doğarsa yeri
`resolveInputMode`deki `running` dalı.

Gözle doğrulandı (yalıtılmış geliştirme örneği, CDP): `(Y/n)` sorusuna kutudan
`n` → program `"n"` aldı; parola sorusunda kutu `•••••••`, program 7 karakter
aldı; oklarla liste seçimi; kutudan tek Ctrl+C; odak dışarıdayken silahlı hâl
ve Durdur düğmesi. Testler: `lib/inputMode.test.ts` (kip, tuş kodlaması,
parola sezgisi), `components/CommandInput.test.tsx` (yanıt satırı — yeni
15 testin 15'i de eski bileşende düşüyor), `store/stopRunning.test.ts`
(kaynaktaki `shellCtrlC` / `copyWins` kuralı).

---

## 2. Açık işler

Sıra önerisi yukarıdan aşağı.

### 2.1 Sekme geçişinde hayalet yazı — ÇÖZÜLDÜ

**Belirti.** Sağ panel (Geçmiş / Favoriler / Değişiklikler) açılıp kapanınca
terminalin son satırlarında eski blok başlıkları — dizin rozeti (`.block-cwd`)
ve süre rozeti (`.block-badge`) — yanlış satıra çizili kalıp statik çıktının
(örn. `ls`) üstüne biniyordu.

**Neden xterm değil.** Büyütünce üst üste binen şeyin yuvarlak dizin rozeti ve
`41 ms` gibi süre rozeti olduğu görüldü: bunlar xterm'in çizdiği metin değil,
`TerminalBlocks` DOM katmanı. Yani hata xterm boyama artığı değil, uygulamanın
kendi katmanının ESKİ konumda kalması. Ayırt edici soru da bunu doğruladı:
kaydırınca (yani bir `onScroll` gelince) düzeliyordu — veri değil, katmanın son
çizimi eskiydi.

**Kök neden.** Katman kendini xterm'in `onRender`ına bağlı tazeliyor. Panel
aç-kapa net boyut değişimini sıfıra indirdiğinde [`safeFit`](src/terminal/TerminalSession.ts)
satır/sütun aynı kaldığı için erken dönüyor: `fit` yok, `onRender` yok, katmanı
yeniden çizen kimse yok. Ama genişlik değişti ve geometri önbelleği düştü, yani
katman eski geometriyle ekranda kalıyor; ekran statikse düzeltecek sonraki çizim
de gelmiyor. Deterministik değildi çünkü `ResizeObserver`ın olayları
birleştirmesine ve net boyut değişimine bağlıydı — hızlı aç-kapa ile deterministik
üretildi.

**Çözüm.** Kap her boyutlandığında blok katmanı KOŞULSUZ tazeleniyor:
`ResizeObserver` geri çağrısı `onContainerResize`e alındı ve sonunda
`notifyBlocks()` çağrılıyor (`setDisplay`in görünür olurken zaten yaptığı iş).
Ucuz ve tekrarlanabilir. Test: `src/terminal/resizeBlocks.test.ts` — `attach`
jsdom'da xterm canvas bağlamına takıldığı için `ResizeObserver` geri çağrısı
doğrudan test edilemiyordu; bu yüzden yol `onContainerResize` yöntemine ayrıldı
ve test fitin ETKİSİZ olduğu (hatanın çıktığı) durumu kuruyor.

### 2.2 Üçüncü skill: arayüz metni / i18n

`.claude/skills/` altında iki skill var: `calistir` (uygulamayı çalıştırma ve
gözle doğrulama) ve `testler` (doğrulama zinciri). Üçüncüsü yazılmadı:
arayüz metni kuralları — her metnin `messages.ts` içinde İKİ dille tanımlanması,
cümle stili, `data-setting` ile `settingsIndex` eşleşmesi, kullanılmayan anahtar
denetimi. Bu oturumda bu testlere en çok takılan yer burasıydı, yani skill'in
karşılığı var.

### 2.3 Küçük açık uçlar

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
Sonraki oturumda aynı tuzak dört kez daha ısırdı: tırnaklı heredoc (`<<'PY'`)
bile `\\x03` yazımını ham **ETX baytına** çevirdi ve yoruma denetim karakteri
girdi; Python `write_text` iki dosyayı **CRLF**'ye döndürdü (`.gitattributes`
LF diyor). Kaçış gerekiyorsa `chr(92) + "x03"` gibi kur; yazdıktan sonra
`git ls-files --eol` ve `[x for x in b if x < 32 and x not in (9, 10)]` ile
bak.

**Fast Refresh ref'leri koruyor, depoyu değil.** `useStore.ts` düzenlenince
depo sıfırdan kuruluyor ama bileşen ref'leri yaşamaya devam ediyor. "Bir kez
koştum" diyen bir ref, yeni depo için hiç koşmamış bir işi koşmuş sayar —
açılış böyle takıldı (§1.12). Tek seferlik işler için koruma ref değil,
deponun kendi durumu olmalı.

**Uzak masaüstü önde değilse tuş gönderilemez, ekran alınamaz.** RDP penceresi
küçültülmüş ya da arkadaysa `GetForegroundWindow` sıfır dönüyor, `SendKeys`
"Erişim engellendi" veriyor, `CopyFromScreen` kilit ekranını ya da bayat kareyi
yakalıyor; `LogonUI`ye bakmak da yanıltıyor (başka bir oturumun kilidi olabilir,
`SessionId` karşılaştır). Doğrulamayı buna bağlama: WebView2'yi
`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222` ile aç ve
Chrome DevTools Protocol'den sür — `Input.insertText`, `Input.dispatchKeyEvent`,
`Page.captureScreenshot` ön plan istemiyor. Sürücü:
`.claude/skills/calistir/cdp.mjs`. Geliştirme derlemesinde gerçek Ctrl+Shift+C
WebView2'nin DevTools kısayolu; sayfaya hiç ulaşmıyor, CDP'den gönderilen
ulaşıyor.

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

Bu oturumun sonunda: **1042 arayüz testi**, **133 Rust testi**, tip denetimi
temiz.
