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

**Panelden geçmiş silme.** Bildirilen istek: "terminal geçmişini yukarı ok
tuşuna basınca gösteriyoruz, istemediklerimizi oradan kaldırabilmeliyiz."
Her satırın sağında bir `×`, klavyeden `Shift+Delete`
(`DELETE_SUGGESTION_KEY` — tarayıcıların öneri listesindeki karşılığı; yalnız
Delete olamazdı, yazarken gelen listede kutudaki metni siliyor). `×` ilk hâlinde
yalnızca seçili satırda ve imleç üstündeyken çiziliyordu; bildirilen: "x iconu
sabit, üzerine mouse ile gelince aktif hale gelsin, yoksa boşluk görünüyor" —
öteki satırlarda ona ayrılan yer boş bir yarık gibi duruyordu. Şimdi her
satırda soluk, üzerine gelince etkin; değişiklikler panelindeki satır
eylemleriyle (`.git-actions`) aynı desen ve aynı ölçü. "Silme her
zaman sorar" kuralı gereği onay soruluyor (`store/deleteConfirm.test.ts`).
Üç karar, hepsi `deleteSuggestionAt` üzerinde ve `store/deleteSuggestion.test.ts`
ile bağlı:

- *Kapsam panelinki.* Panel bu sekmeyi gösteriyorsa yalnızca bu sekmenin
  kayıtları gidiyor — `noteCommand`daki sekme başına tekrar temizliğiyle aynı
  gerekçe: yanlış sekmede çalıştırılmış bir komutu temizlemek öteki sekmenin
  yukarı okunu değiştirmemeli. Onay penceresi hangisinin olacağını yazıyor.
- *Diskten, tam eşleşmeyle.* Bellekteki liste son 400 komut; yalnızca oradan
  silmek komutu bir sonraki açılışta geri getirirdi. `HistoryFilter.command`
  bunun için eklendi: `query` "içinde geçen" arıyor ve `ls` silinirken
  `ls -la` de giderdi. Kimlikler arayüzde bir kez daha süzülüyor; süzgeci
  tanımayan eski bir Rust derlemesi (sıcak yenileme) kapsamın tamamını döndürür.
- *Seçim komuta bağlı.* Fareyle başka bir satır silinince seçili komut yerinde
  kalıyor. İlk hâli konumu koruyordu ve düzenekte görüldü: `git pull`
  seçiliyken `npm test` silinince seçim `npm run build`e atladı.

İki yan bulgu aynı işte kapandı. `history_delete` artık günlüğü HEMEN
sıkıştırıyor: `del` satırı kaydı yalnızca yeniden oynatırken gizliyordu,
silinen komutun metni eski `add` satırında diskte duruyordu — tek tek silinen
komut çoğu zaman yanlışlıkla yazılmış bir parola. Geçmiş panelindeki silmeler
de öneri kaynağını yeniden yüklüyor; o kaynak açılışta bir kez kuruluyor ve
panelden silinen komut uygulama yeniden açılana kadar yukarı okta görünmeye
devam ediyordu (`components/historyDeleteSync.test.tsx`).

**Komut kutusu başka bir metin kutusundaki odağı almıyor.** Bildirilen: "klasör
dizini alanına tıklayıp klavyeden yön tuşları ile klasör seçip enter basınca o
klasör dizinine gidiyor, sonrasında yön tuşları ile seçim yapmaya devam
edemiyorum. Mouse ile tıklamak gerekiyor." Dizin seçici `cd`'yi gerçek bir
komut olarak gönderip açık kalıyor; komut başlayınca kutu kapanıyor, istem
dönünce açılıyor ve kutunun kip etkisi bu iki geçişte odağı koşulsuz önce
terminale, sonra kutuya taşıyordu — seçicinin arama kutusundan. Kural artık tek
yerde, `lib/focus.ts` (`typingOutsideTerminal`): kullanıcı terminalin dışında
bir metin kutusuna yazıyorsa odağa dokunulmuyor. Sekme adlandırma kutusu için
`focusTerminal`da bir kez ödenmiş kuralın aynısı; ikinci bir kopya yazmak
yerine oradan çıkarıldı. Seçici kapanınca odak da komut kutusuna (komut
çalışıyorsa terminale) dönüyor; yoksa Escape'ten sonra yine fareye uzanmak
gerekirdi (`components/dirPicker.test.tsx`).

### 1.11 Yeni sürüm bildirimi ve uygulama içinden güncelleme

İki katman. HABER: açılışta ve açık kaldıkça altı saatte bir GitHub'ın son
yayınını okuyup sürümü karşılaştırıyor, yenisi varsa durum çubuğunda bir rozet
çıkıyor; hiçbir kuruluma bağlı değil. KURULUM (6 Ekim'den beri): yayın
imzalıysa *Hakkında*'daki "Güncelle ve yeniden başlat" paketi indirip imzasını
doğruluyor, kuruyor ve uygulamayı yeniden açıyor (Tauri updater). Aşağıda
önce haber katmanının kararları, sonra kurulumunki.

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

**Yayın etiketi Actions'ta oluşuyor (3 Ekim).** Release'i CI'ın `yayin` işi
açıyor; eskiden yalnızca elle itilen `v*` etiketiyle başlıyordu ve etiket
unutuluyordu: 0.2.1 numarası 2 Eylül'de yazıldı, bir ay etiketsiz kaldı, yani
kurulu 0.2.0'lar hiçbir şey duymadı. Şimdi main'e itmede (ya da elle "Run
workflow") `package.json` sürümünün `v<sürüm>` etiketi yoksa, testler ve iki
platformun paketleri geçtikten sonra iş etiketi o commit'te oluşturup paketleri
bağlıyor; etiket varsa hiçbir şey yayınlamıyor. **Yeni yayın = sürümü üç
dosyada (Cargo.toml, package.json, tauri.conf.json) yükseltip main'e itmek.**
Üçünün aynı kalmasını `releaseVersion.test.ts` bağlıyor (ayrışırsa paket kendini
hep eski sanıp her açılışta "yeni sürüm var" derdi). Elle itilen etiket hâlâ
çalışıyor ama sürümle eşleşmezse iş duruyor. main'deki koşular artık
birbirini iptal etmiyor: yarıda kesilen bir `gh release create` paketsiz bir
Release bırakır ve sonraki koşu etiketi görüp onu düzeltmezdi.

**Yayın işi hiç başarıyla çalışmadı (6 Ekim'de bulundu).** Depo herkese açık
olunca Actions sonucu kimliksiz API'den okunabildi: yayın işinin main'de
koşmaya başladığı 9becc18'den (3 Ekim) bu yana altı koşunun altısı da
*Yayın › Etiket ve Release oluştur*da düşmüş; ondan önceki koşular (20 Eylül –
3 Ekim) zaten arayüz testlerinde düşüyordu. Sebep
`gh release create … paketler/*`: Windows paketleri
upload-artifact'in ortak ata kuralıyla `nsis/` ve `msi/` alt klasörlerinde
geliyor, glob klasörleri de yakalıyordu. `gh` klasörü dosya sanıp yüklemeye
çalıştı (kaynağında dizin denetimi yok), taslak Release'i silip 1 ile çıktı —
etiket de oluşmadı (taslak etiket açmıyor). Yani 0.2.1 hiç yayımlanmadı ve hiçbir
kurulu uygulama bir şey duymadı. Çözüm `scripts/release-files.mjs`: yalnızca
dosyaları düz bir klasöre alıyor, beklenen her paketi (NSIS, MSI, DMG)
denetliyor; eksikse yayın duruyor. Koşu günlüğü kimliksiz okunamıyor (403),
ama adım adları ve uyarı satırları `check-runs/<iş>/annotations` ucundan
okunuyor.

**Uygulama içinden kurulum — neden şimdi.** Haber tek başına kullanıcıyı
tarayıcıya gönderiyordu ve paketler işletim sistemi için imzasız: macOS'ta her
sürümde "hasarlı" diyaloğu + elle `xattr`, Windows'ta SmartScreen. Uygulamanın
kendi indirdiği pakette karantina işareti yok — ölçüldü: güncellemeden sonra
pakette `com.apple.quarantine` sıfır, yalnızca zararsız `com.apple.provenance`.
Güncelleme imzası (minisign) ise ücretsiz: açık anahtar `tauri.conf.json`da,
özel anahtar CI sırrı (`TAURI_SIGNING_PRIVATE_KEY`). Sır yoksa paketler eskisi
gibi çıkıyor ve uygulama yalnızca haber veriyor — iki katmanın ayrı olmasının
sebebi bu.

**Kararlar ve ölçümler:**

- *Eklenti yalnızca Rust'ta.* Arayüze `updater:*` izni yok
  (`capabilities/default.json`); akış `update_download` → arayüz durumu
  yazar → `update_apply`. İndirme ile kurulum AYRI çünkü durum (sekmeler,
  ekran çıktısı) indirmeden SONRA yazılmalı: yavaş ağda indirme dakikalar
  sürebilir, önceden yazmak aradaki çıktıyı kaybettirirdi.
- *`tauri-plugin-updater = "~2.12"`.* `"2.12"` yazınca Cargo 2.13.1'i seçip
  tauri'yi 2.12'ye çekti (2.13, tauri 2.12 istiyor); `@tauri-apps/api` 2.11
  kalınca `tauri build` sürüm uyuşmazlığıyla durur. Eklenti macOS'ta 47,
  Windows'ta 37 kasa ekliyor (reqwest/hyper; tauri'de yalnızca mobil için vardı).
- *`native-tls` + `system-proxy`.* Haberdeki `curl` gerekçesinin aynısı:
  rustls sistem güven deposunu yok sayar, kurumsal TLS vekilinde düşerdi.
- *macOS'ta yalnızca `.app` paketinin içinden.* Eklentinin `bundle_type()`i
  macOS'ta tanımsızı `App` sayıyor ve kurulum ikilinin KLASÖRÜNÜ değiştiriyor:
  `npm start`ın `target/debug/nterminal`inde düğme `target/debug`ı silip
  yerine paketi açardı. `update::in_app_bundle` bunu engelliyor; Windows'ta
  kurucunun işlediği tür (NSIS/MSI) şart, kurulumsuz exe güncellenmiyor.
- *`latest.json`da yalnızca türlü anahtarlar* (`windows-x86_64-nsis`, `-msi`,
  `darwin-aarch64-app`): genel `windows-x86_64` anahtarı türü bilinmeyen
  kopyayı NSIS'le "güncelleyip" ikinci bir kurulum yapardı.
- *Süre sınırları.* Eklentinin indirmesinde varsayılan sınır yok; düşen bağlantı
  "İndiriliyor %40"ta sonsuza kadar asılı kalırdı. Bağlantı 15 sn, DURMA 30 sn
  (toplam süre değil: yavaş vekilde birkaç MB dakikalar sürebilir).
- *Windows'ta çıkış.* Eklenti kurucuyu başlatıp süreci `exit(0)` ile bitiriyor,
  pencere olayları gelmiyor; `before_exit` kabukları kapatıyor. Kurucu
  başlatılamazsa (güvenlik yazılımı) temizlik çoktan yapılmış olabilir — o
  zaman aynı sürüm yeniden açılıyor (`update::EXIT_STARTED`).
- *Parolasız anahtar + boş parola değişkeni.* CLI 2.11 parola değişkeni HİÇ
  yoksa terminalsiz ortamda parola sormaya kalkıp düşüyor ("Device not
  configured"); boş dizeyle imzalıyor. İş akışında sır yoksa değişken boş geçiyor.
- *`requireSignedVersion` kapalı.* CLI 2.11 imzanın güvenilir yorumuna sürümü
  yazmıyor (`timestamp:…	file:…`); açılsaydı her güncelleme reddedilirdi.
  CLI yükseltilince açılmalı: imzalı sürüm `latest.json`daki sürümle
  karşılaştırılıyor, eski bir paketin yeni sürüm diye sunulmasını kesiyor.

**Uçtan uca doğrulama (macOS, 6 Ekim).** Aynı kodun ayrı kimlikli
(`com.nyayan.nterminal.e2etest`) 0.2.1 ve 0.2.2 paketleri imzalı derlendi;
yerel bir sunucu GitHub API yanıtını ve `latest.json`ı verdi. 0.2.1 açılışta
rozeti gösterdi → *Hakkında* → onay ("0.2.2 sürümüne güncellenip yeniden
başlatılacak") → bir saniyede indirildi, kuruldu, eski süreç kapandı, yeni süreç
aynı yoldan 0.2.2 olarak açıldı, sekme geri geldi, rozet kayboldu. Başka bir
dosyanın imzasıyla sunulan "0.2.3" REDDEDİLDİ ("The signature verification
failed"), uygulama aynı süreçte 0.2.2 kaldı. Windows yolu burada denenemedi;
eklentinin kurucu kodu okundu (`/P /UPDATE /R /ARGS`, MSI'da
`/passive … AUTOLAUNCHAPP=True`; şablonumuzda `AUTOLAUNCHAPP` var).

**İlk kurulum: ad-hoc mühür (6 Ekim).** Güncellemeler uyarısız ama İLK kurulum
hâlâ "hasarlı" diyalogu + Terminal'de `sudo xattr` istiyordu; kullanıcının
sözleri: "her kullanıcı yapmakla uğraşamaz". ÖLÇÜLDÜ (macOS 27, aynı kodun iki
debug paketi, ayrı kimlik `com.nyayan.nterminal.gktest`, Safari karantina
damgası elle, `open` ile açıldı, diyalog CoreServicesUIAgent'ın AX ağacından
okundu): imzasız paket `codesign` "code has no resources but signature
indicates they must be present" → *“…” is damaged and can’t be opened* (yalnızca
*Move to Trash / Cancel*); `APPLE_SIGNING_IDENTITY="-"` ile mühürlenen paket
"valid on disk", `spctl` yalnızca "rejected" → *“…” Not Opened — Apple could not
verify…* ve Sistem Ayarları › Gizlilik ve Güvenlik'te *“…” was blocked to
protect your Mac. [Open Anyway]*. Yani Terminal'siz, tıklamayla açılıyor. İş
akışında yalnızca bu değişken eklendi (`tauri.conf.json`a değil: yerel imza
kararı `scripts/run.mjs`te, ayrı iş). Ad-hoc pakette hardened runtime açık;
uygulama açıldı, kabuk (zsh) başladı. Gizlilik izinleri yine `cdhash`e bağlı ve
her sürümde sıfırlanıyor — onu ve "Yine de Aç" adımını kaldıran tek şey
ücretli Developer ID + notarization. README'ye son kullanıcı için *Paketi indirip
kurmak* bölümü eklendi; her Release notunun başına o bölümün bağlantısı
(`gh release create --notes`, üretilen notların önüne ekleniyor).

Testler: `update_tests.rs` (paket tanıma, sürüm eşitliği, ilerleme adımı),
`store/updateInstall.test.ts` (onay, sıra, hata, çift basış — 7 mutasyonun 7'si
yakalandı), `components/updateInstall.test.tsx` (düğme, çark, ilerleme, hata
satırı), `lib/updaterRelease.test.ts` (yapılandırma, iş akışı, betik, ilk kurulum:
ad-hoc imza ve README bağlantıları — 3 mutasyonun 3'ü yakalandı).

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

### 1.17 Değişiklikler panelinde commit ve push

**İstek:** "proje içerisinde git repoda bir değişiklik varsa değişiklikleri
gösterdiğimiz bir yapı var N-Terminal içerisinde. Bu yapıda dosyaları commit ve
push edebileceğimiz bir yapı istiyorum."

**Eklenen:** satır başına "commit'e ekle" kutusu (üç hâl: işaretli, işaretsiz,
kısmen), toplu kutu, ileti alanı, Commit ve Push
([`GitCommit.tsx`](src/components/GitCommit.tsx)); Rust'ta `stage`, `unstage`,
`commit`, `push` ([`git.rs`](src-tauri/src/git.rs)); saf kurallar
[`lib/gitStage.ts`](src/lib/gitStage.ts). Kullanıcıya dönük anlatım README'de.

Kararlar (gerekçelerin tamamı kodun yanında):

- **Git doğrudan çağrılıyor, kabuğa yazılmıyor.** Dal geçişi kabuğa yazılıyor
  (tek satır, geri dönüşü bir adım). Commit'in iletisi var, hangi dosyaların
  girdiği listede görünmeli ve sonucu ("reddedildi", "kanca başarısız") ekranda
  kalmalı; kabuğa yazmak kabuğun boşta olmasını şart koşardı.
- **Hata bildirimde değil kutunun içinde, kalıcı.** Toast 3,2 saniye; bir kanca
  ya da reddedilen push çıktısı bu sürede okunmaz. Metin git'in kendisi ve
  **stderr + stdout birlikte**: `git commit` "commit edilecek bir şey yok"
  iletisini STDOUT'a yazıyor (ölçüldü, stderr boş).
- **`commit` yalnızca indeksi alır** (`-a` yok) ve **kancalar atlanmaz**
  (`--no-verify` yok): kutular tam olarak neyin gireceğini gösteriyor; kancayı
  kullanıcı koymuş.
- **Push etiket göndermez.** `--no-follow-tags`. Ölçüldü: `push.followTags=true`
  iken yalın `git push` yerelde duran açıklamalı etiketi de uzağa itiyor, bayrak
  bunu yapılandırmaya rağmen engelliyor. Bu depoda `v*` etiketi itmek yayın
  (`build.yml` `yayin` işi) ve yerelde uzağa gitmemesi gereken bir
  `trailer-oncesi-yedek` etiketi duruyor. Zorla itme hiç yok.
- **Yukarı akışı olmayan dal "Yayınla"** (`push -u origin HEAD`). `[gone]` (uzak
  dal silinmiş) yukarı akış sayılmıyor: silinmiş bir dala gönderilmez, dal
  yeniden oluşur. Hiç commit yoksa (`unborn`) ve ayrık HEAD'de düğme kapalı.
- **Fark `HEAD`e karşı.** Ölçülen hata: panel `git diff -- dosya` çalıştırıyordu,
  o da çalışma ağacını İNDEKSLE karşılaştırıyor; dosya sahnelenince fark 0
  satır çıkıyor ve satır "Gösterilecek fark yok" diyordu. `HEAD`e karşı fark
  sahnelenmiş, sahnelenmemiş ve karışık (`MM`) durumun hepsinde toplam
  değişikliği veriyor; commit'siz depoda `--cached`e düşülüyor.
- **Satır anahtarı yalnızca yol** (eskiden `durum + yol`). Kutuya basmak durumu
  değiştiriyor; satır sökülüp kurulunca açık bağlam kayboluyor, fark yeniden
  isteniyor ve klavyeyle Boşluk'a basanın odağı yok oluyordu. Fark isteğinin
  anahtarı da ham durum değil `diffKind`: sahnelemek içeriği değiştirmiyor.
- **Yazma işlemleri tek sırada** (`gitWrite`, `useStore.ts`). Rust'taki
  `INDEX_LOCK` iki `git add`in `index.lock` yüzünden çakışmasını önlüyor ama
  SIRA garantisi vermiyor: aynı dosyaya art arda "ekle" ve "çıkar" ters
  sırada koşarsa son durum bastığının tersi olur. Kuyruk bir işlemin hatasında
  kilitlenmiyor; her işlem bitince (hata da olsa) depo tazeleniyor.
- **Rust komutları `async` + `spawn_blocking`.** Eşzamansız olmayan komut Tauri'de
  ana iş parçacığında koşuyor: push bir ağ isteği, commit kullanıcının
  kancalarını çalıştırıyor. Hiçbiri pencereyi dondurmamalı.
- **İleti taslağı depoda** (`ui.gitDrafts`, anahtar deponun kökü). Panel sekmesi
  değişince bileşen sökülüyor; yerel durum olsaydı yarım ileti kaybolurdu.
  Commit atılamazsa ileti korunuyor.

Ölçülen dört git davranışı, hepsi `git_tests.rs`'te gerçek depoyla sınanıyor:

- `restore --staged` commit'siz depoda "could not resolve HEAD" ile düşüyor →
  indeksten çıkarma `reset -q`.
- Yeniden adlandırmada yalnızca yeni adı çıkarmak eski adın "silindi" kaydını
  indekste bırakıyor → `GitChange::orig_path`, ikisi birlikte gidiyor.
- `git add -- "[a].txt"` `a.txt`yi de ekliyor (köşeli parantez karakter sınıfı) →
  `--literal-pathspecs`.
- `git status` ASCII dışı yolları sekizlik kaçışla veriyor
  (`"\303\247al..."`) → `-c core.quotepath=false`. Bu **mevcut** diff, geri alma
  ve dosya açma işlemlerini de düzeltiyor: Türkçe harfli bir dosya adında
  hiçbiri çalışmıyordu (yol `git`in bulamadığı bir dizeydi).

**Doğrulama.** Rust: gerçek depolar ve gerçek `bare` uzak, ağa çıkmıyor.
Arayüz: `lib/gitStage.test.ts`, `components/gitCommit.test.tsx`,
`store/gitWrite.test.ts`. `lib/ipcContract.test.ts` TS'in çağırdığı her Rust
komutunun kayıtlı olduğunu ve argüman adlarının tuttuğunu denetliyor — arayüz
testleri IPC'yi taklit ettiği, Rust testleri arayüzü bilmediği için başka hiçbir
test "komut adında yazım hatası" sınıfını görmüyor.

Her koruma kaynakta bozulup ilgili testin düştüğü görülerek doğrulandı (Rust 15,
arayüz 38 mutasyon). Bu denetim iki testin aslında bir şey yakalamadığını
çıkardı: "commit ATMIYOR" testleri eşzamanlı `expect` yapıyordu ama commit
kuyrukta mikro-görev olarak `api`ye gidiyor (§3), ve "ikinci basış yok sayılıyor"
testleri ilk işlem SÜRERKEN sayıyordu, oysa koruma kalksa da ikinci işlem
kuyrukta bekliyor. Gerçek arayüz sahte IPC'li bir tarayıcı harness'inde
(`?t=` tuzağı için §3) tıklanarak da denendi; orada dal seçicinin yeniden
konumlanmaması hatası ortaya çıktı (§1.18).

### 1.18 Dal seçicide uzak dallar ayrı bir bölümde

**Bildirilen sorun:** "branch'leri gösteriyoruz, bu gösterdiğimiz yerde remote
origin'ler de geliyor. Bu da karışıklığa sebebiyet veriyor. Yerel olanlar
gözüksün, bir de collapse gibi bir şey olsun, remote göstermesi için kişi
açmak isterse gelsin."

**Yapılan:** yerel dallar üstte, başlıksız; `git fetch` ile gelen uzak dallar
sayıyla birlikte "Uzak dallar" başlığının altında ve varsayılan **kapalı**.
Kuralların tamamı [`pickerRows`](src/lib/branches.ts) içinde:

- **Arama katlamayı eziyor.** Uzak dallar zaten fetch sonrası bir dalı
  bulabilmek için listeleniyor; kapalı bölümün içindeki eşleşmeyi göstermemek
  aramanın yalan söylemesi demek. Aramada başlık basılamayan düz etiket, sayı
  yalnızca eşleşenleri sayıyor.
- **Gösterilecek yerel dal yoksa bölüm açık ve düz:** katlayacak başka bir şey
  yok.
- **Başlık klavyeyle gezilebilir** (alt ok, Enter açıp kapatıyor); düz etiket
  gezilmiyor (Enter'ın yapacağı bir şey yok).
- **Açık/kapalı durumu depoda** (`ui.branchRemotesOpen`): seçici her kapanışta
  sökülüyor, yerel durum olsaydı uzak dallara bakan her açışta yeniden açardı.
  Uygulama her açılışta kapalı başlıyor.
- **Vurgulanan satır yalnızca klavyede kaydırılıyor:** fareyle üzerine gelinen
  satırı kaydırmak listeyi imlecin altından kaydırıp yeni bir `mouseenter`
  üretiyordu.

**Gözle bulunan hata:** panelin konumu yüksekliğinden hesaplanıyor
(`anchorAbove`) ve yalnızca liste yüklenince koşuyordu. "Uzak dallar" açılınca
panel 120px'ten 340px'e büyüyüp alt kenarı rozetin üstüne biniyor ve satırları
ekran dışına taşıyordu. Şimdi satır sayısı değişince de yeniden yerleşiyor
(arama da aynı sebeple: süzülen liste kısalınca panel rozetten uzakta asılı
kalıyordu). jsdom'da yerleşim olmadığı için test yalnızca NE ZAMAN
çağrıldığına bakıyor; gerçek konumu yalnızca göz doğruladı.

Testler: `lib/branches.test.ts` (kurallar), `components/branchPicker.test.tsx`
(tıklama, klavye, arama, durumun hatırlanması, yeniden yerleşim).

**Çok sayıda dalda — önce ölçüldü, sonra düzeltildi.** Soru: "çok fazla dal olursa
performans sorunu olur mu?" Sentetik depoda ölçüldü (macOS, sıcak önbellek, her
dal AYRI commit'te — aynı commit'e işaret etselerdi sıralama bedava görünürdü;
arayüz üretim derlemesi, Chromium, boyama hariç):

| uzak dal | git, paketli ref | git, `fetch` sonrası | git, yalnızca yerel | bölümü açmak | aramada ilk harf |
|---|---|---|---|---|---|
| 2.000 | 32 ms | 66 ms | 15–19 ms | 62 ms | 49 ms |
| 10.000 | 51 ms | 356 ms | 13–14 ms | 510 ms | 402 ms |
| 50.000 | 634 ms | 8 sn | 29–56 ms | ölçülmedi | ölçülmedi |

"`fetch` sonrası" = her ref ayrı dosya; `git gc` / `pack-refs` onları paketliyor.

- **Çizim tavanı** (`SECTION_ROW_LIMIT` = 200). Darboğaz çizimdi: süzme 0,6 ms,
  IPC ayrıştırma ~0; 10 bin dalda her ok tuşu 45 ms, 90 bin DOM öğesi. Bölüm en
  fazla 200 dal çiziyor, kalanını "N dal daha — aramayı daraltın" satırı sayıyor;
  başlıktaki sayı yine TAMAMI. Tavanla 10 bin dalda açmak 5 ms, ilk harf 6 ms, ok
  tuşu 0,7 ms (50 bin: 6 / 10 / 0,8 ms).
- **`git_branches` `async` + `spawn_blocking`.** Süreyi kısaltmıyor, ana iş
  parçacığını bırakıyor: Tauri'nin makrosu `async` olmayan komutu IPC'yi işleyen
  iş parçacığında satır içi koşuyor (kaynaktan doğrulandı).
- **İki aşamalı yükleme** (`remotes: false`, `REMOTES_GRACE_MS` = 150 ms). Yerel
  dallar uzak dal sayısından bağımsız okunuyor. Tam liste 150 ms içinde gelirse
  tek seferde çiziliyor (çoğu depo; iki aşama orada yalnızca titreme olurdu);
  gelmezse yerel dallar hemen, uzak başlığı "…" ile. Okunurken arama "Dal
  bulunamadı" demiyor: henüz bilmiyoruz. Eski bir ikili `remotes`'u tanımayıp
  her şeyi dönse de (arayüz HMR'la yenilenip Rust yeniden başlatılmadan) ilk aşama
  yalnızca yerel dalları gösteriyor.

Kazanç getirmediği ölçülenler: `--count` sıralamadan SONRA uygulanıyor;
commit-graph `committerdate` sıralamasını hızlandırmadı. `git_fingerprint` ile
önbellek de olmaz: yalnızca `HEAD` ve `index`'e bakıyor, `fetch` ikisine de
dokunmuyor ve liste bayatlardı. Ölçülmeyenler: Windows ve Defender (ref dosyası
okuma orada daha yavaş olabilir), soğuk önbellek, boyama.

Testler: `lib/branches.test.ts` (tavan, bekleme hâli), `components/branchPicker.test.tsx`
(DOM'daki satır sayısı, iki aşama sahte zamanlayıcıyla, düşen okuma, eski ikili),
`git_tests.rs` (`yerel_okuma_uzak_dallari_getirmiyor`). Hepsi kaynak bozularak
doğrulandı: 9 mutasyon, 9'u da yakalandı.

### 1.19 Stash

**İstek:** "bir de stash yapısı ekleyebilir miyiz? IntelliJ, WebStorm'daki gibi.
Kişi istediklerini stash atsın, isimlendirebilsin, stash'ı açsın." Ardından üç
düzeltme: "Değişiklikler default olarak hepsi kapalı gelsin", "Değişiklikler
listesinde neler seçiliyse Stash'a bastığımda onlar seçili gelsin, kişi isterse
değiştirsin; burada da dosya path'i gizli gelsin, checkbox ile isterse açsın" ve
"farkta sağa kaydırınca zemin rengi bir yerde kesiliyor".

**Eklenen:** Rust'ta `stashes`, `stash_files`, `stash_diff`, `stash_push`,
`stash_apply`, `stash_drop`, `stash_count` ([`git.rs`](src-tauri/src/git.rs)); üç
okuma komutu senkron, üç yazma komutu `async` + `spawn_blocking`. Arayüzde
[`StashDialog.tsx`](src/components/StashDialog.tsx) (ad + dosya seçimi),
[`StashSection.tsx`](src/components/StashSection.tsx) (liste, uygula, sil, içerik),
[`StashDiff.tsx`](src/components/StashDiff.tsx) (salt okunur fark), saf kurallar
[`lib/gitStash.ts`](src/lib/gitStash.ts); `useActiveGit` ve `useLabel` ortak
olduğu için [`gitShared.tsx`](src/components/gitShared.tsx)e taşındı (aksi hâlde
`GitChanges` ile stash bileşenleri birbirini içe aktarırdı). Kullanıcıya dönük
anlatım README'de.

Kararlar (gerekçelerin tamamı kodun yanında):

- **Dördüncü sekme değil, Değişiklikler'in içinde bölüm.** İlk hâli sekmeydi;
  gözle bakınca sekme şeridi (~326px) ile sağdaki üç simge (~96px) varsayılan
  390px'te dört etiketi de kırpıyor, 260px'te kapatma çarpısını panelin dışına
  itiyordu. Dört etiketi kırparak sığdırmak mümkündü ama okunmaz olurdu; sorun
  kaynağında çözüldü: stash zaten değişikliklerle aynı konu ve "Stash'e at" düğmesi
  de orada. (Ölçüm aynı zamanda eski bir hatayı gösterdi: üç sekmeyle bile panel
  ~345px'in altına inince çarpı panelden taşıyordu. Şerit ve sekmeler artık
  daralıyor, etiket `…` ile kısalıyor: `.panel-tab-label`, `min-width: 0`;
  varsayılan 390px'te hiçbir şey kırpılmıyor.) Bölüm listenin
  **en üstünde**, başlık depo varken **her zaman** görünüyor (temiz ağaçta stash
  uygulamak en sık an ve o zaman liste "değişiklik yok"tan başka bir şey
  göstermez), sayaç yalnızca stash varken, varsayılan **kapalı** (`ui.stashOpen`,
  depoda: bileşen sekme değişince sökülüyor).
- **Pencere listedeki seçimle açılıyor.** Listedeki kutu `git add` demek; seçim =
  indekste bir şeyi olan dosyalar (`initialSelection`), kısmen eklenmiş (`MM`)
  dâhil. Hiçbiri işaretli değilse seçim **boş** — "hepsini al" varsayılmıyor: ilk
  Enter'la yanlışlıkla her şeyi kenara atmak, boş seçimin bir tık maliyetinden
  pahalı. Pencere ondan sonra **kendi** seçimini taşıyor ve listedeki kutulara
  dokunmuyor (ilk hâli hepsini seçili açıyordu; istek üzerine değişti).
- **Klasör yolu gizli, kutu ortak ayara bağlı** (`ui.gitShowPaths`): listedeki
  klasör düğmesiyle aynı ayar, yani bir yerde açılan öbüründe de açık.
- **Takipsiz dosya seçilince `-u` kendiliğinden.** git onsuz tüm seçimi "pathspec
  did not match" ile düşürüyor; ayrı bir kutu yalnızca "neden hata verdi"yi
  sordururdu.
- **Silmek her zaman sorar, uygulamak sormaz.** Silinen stash'in karması yalnızca
  `git fsck` ile bulunur; uygulamada içerik silinmiyor, çalışma ağacına taşınıyor.
  "Uyguladıktan sonra sil" ve "İndeksi geri yükle" kutuları varsayılan **kapalı**;
  çakışmada git stash'i zaten silmiyor.
- **Kutular başlıktaki ayar simgesinin küçük penceresinde** (istek: "Stash altında
  2 checkbox var; sayacın soluna ayar ikonu koyalım, basınca küçük bir tooltip
  içinde çıksın"). Önce açık bölümün üstünde duruyor ve her açılışta yer
  kaplıyordu. Yapı: satır bir `div` (tıklamak açıp kapatıyor), gerçek düğme
  `stash-toggle`, sonra simge, sonra sayaç. Satırın kendisi düğme olamaz çünkü
  içinde ayar düğmesi var (iç içe düğme geçersiz ve tıklamalar karışıyor; aynı
  sebeple `.git-head`); tıklama satıra kabarcıklanıyor, TEK işleyici orada, simge
  ve pencere kabarcığı kesiyor. Pencere simgeye değil **satıra** göre
  konumlanıyor (`position: absolute`, `max-width: calc(100% - 16px)`): simge
  panelin sol yarısında, simgeye göre açılsa en dar panelde (260px) sağa
  taşardı. Dışarı basınca ve `Esc` ile kapanıyor (`Esc` yakalanıyor, yoksa genel
  kısayol başka bir örtüyü kapatırdı), odak simgeye dönüyor, açılırken ilk
  kutuya geçiyor. **Kutular gizli olduğu için bir seçenek açıkken simge
  vurgulu** (`icon-btn on`): "uyguladıktan sonra sil" geri dönüşü olmayan taraf,
  sessizce etkin kalmamalı.
- **Liste okunamazsa hata gösteriliyor, "Stash yok" denmiyor.** İlk hâli hatayı
  yutup boş liste çiziyordu (bkz. §3, eski Rust ikilisi).
- **Kimlik karma, işlem anında `stash@{n}`e çözülüyor.** `apply` ham karmayı kabul
  ediyor ama `pop` ve `drop` etmiyor; sıra numarası başka bir stash eklenince
  kayar, o yüzden karma → `stash list` ile işlemin hemen öncesinde çözülüyor.
- **Sayaç süreç başlatmadan**: `logs/refs/stash` dosyasının satır sayısı (worktree'de
  ortak dizin, `commondir` dosyası). Durum imzası (`fingerprint`) stash günlüğünü
  de izliyor, yani terminalden atılan bir `git stash` panelde kendiliğinden
  görünüyor.

Ölçülen git davranışları, hepsi `git_tests.rs`te gerçek depoyla sınanıyor:

- `git stash push` değişiklik yoksa **0 koduyla** çıkıyor ("No local changes to
  save"); `refs/stash` öncesi/sonrası karşılaştırılıyor.
- Takipsiz yol `--include-untracked` olmadan "pathspec did not match" ile düşüyor.
- **Sahnelenmiş silme ve sahnelenmiş yeniden adlandırmanın eski adı indekste yok**:
  `stash push -- yol` düşüyor → önce `reset -q --`, hata olursa
  `rm --cached --ignore-unmatch` ile geri yükleniyor.
- Çakışmada `apply`/`pop` 1 ile çıkıyor, dosyalar `UU`, stash **kalıyor**.
- `--index` sahnelenmişi `MM` olarak geri getiriyor (yoksa ` M`).
- Takipsiz dosyalar stash'in **üçüncü ebeveyninde** (`S^3`); yeniden adlandırma farkı
  için iki yol da gerekiyor.
- Git kendisi çok satırlı ileti günlüğünü tek satıra indiriyor.

**Varsayılan kapalı liste (istek üzerine).** `ui.gitCollapsed` (kapalılar)
`ui.gitExpanded`e (açılanlar) çevrildi. Kazanç: fark yalnızca açık satır için
isteniyor, yani elli dosyalık değişiklik elli `git diff` ile başlamıyor. **Yan
etki, bilinçli:** `+N -M` sayacı farkla birlikte çiziliyor; kapalı satır için
fark istenmediğinden sayaç satır **açılana kadar görünmüyor**. Hepsi görünsün
istenirse tek bir `git diff --numstat` yeter (§2.5).

**Fark zemini hatası.** `.diff-line` blok olduğu için satır genişliği kaydırma
alanının GÖRÜNEN genişliğiydi; sarmayan uzun metin kutunun dışına taşıyor ve
eklenen/silinen zemin orada bitiyordu (ölçülen: 370px satır, 2019px kaydırma
alanı). `.git-diff` tek sütunlu ızgaraya çevrildi: sütun en uzun satıra kadar
genişliyor ve bütün satırlar aynı genişlikte (ölçülen: 2029 / 2029). `min-width:
max-content` denenmedi: her satırı KENDİ boyuna getirir, zeminlerin sağ kenarı
tırtıklı olur. Boşluk şeridi `contain: inline-size` taşıyor: kapsayan işlev adı
(80 karaktere kadar) sütunu genişletip kod sığarken bile yatay kaydırma
çıkarırdı. jsdom yerleşim hesaplamadığı için `styles/layout.test.ts` yalnızca bu
KURALLARI bağlıyor; ölçüm tarayıcıda yapıldı.

**Doğrulama.** Rust: gerçek depolar; ~50 stash testi, biri kullanıcının bildirdiği
durumun birebir kopyası (`kullanici_senaryosu_…`: biri `M `, biri `A ` iki dosya
seçili, başka dosyalar ellenmemiş, yol boşluklu ve klasörler iç içe, geri
getirmede `--index`). Arayüz:
`components/stashDialog.test.tsx`, `stashSection.test.tsx`, `stashOverlay.test.ts`,
`lib/gitStash.test.ts`, `store/gitWrite.test.ts` (stash işlemleri de aynı yazma
kuyruğunda), `components/GitChanges.test.tsx` (kapalı gelme, farkın yalnızca
açılınca istenmesi). Her koruma kaynakta bozulup ilgili testin düştüğü görülerek
doğrulandı; bu tur 28 mutasyon denendi ve biri ayakta kaldı: `stashOpen`
**varsayılanı** (testler durumu açıkça kuruyordu, varsayılan hiç sınanmıyordu).
Aynı sınıftan `gitExpanded` varsayılanı için de `getInitialState` testi eklendi ve
mutasyonu doğrulandı. Gerçek arayüz sahte IPC'li tarayıcı harness'inde tıklanarak
denendi: pencere açılışı ve seçimi, klasör yolu kutusu, stash'e atma, liste,
içerik, uygulama + pop, silme onayı, çakışma hatası, kaydırılmış farkta zemin.
Gözle iki yerleşim hatası bulundu: dört sekme (yukarıda) ve stash tarih metninin
eylem simgelerinin üstüne binmesi (`.stash-meta` artık kırpılabiliyor; ad dar
panelde bile en az 48px kalıyor).

### 1.20 Dolgulu düğmelerde beyaz yazı

**Bildirilen:** "Commit butonundaki text color yanlış gibi bakar mısın." Gerçek
pencerenin commit kutusu bölge yakalamasıyla okundu: One Half Dark'ta etkin Commit
açık mavi (`#61afef`) zeminde koyu lacivert (`#0b0f14`) yazı; devre dışıyken
`opacity: 0.4` zemini ve koyu yazıyı birlikte solduruyor, yazı zemine karışıyor
(2,5:1). Ortada bir hata yoktu: kural (`onColor`, karşıtlığı yüksek olan) tam bunu
üretiyordu ve beyaz yazı bu zeminde 2,4:1 verirdi. "Yanlış"ın ne olduğu belli olmadığı
için üç seçenek yan yana çizilip kullanıcıya bırakıldı (şimdiki / beyaz yazı /
yalnızca devre dışı düzelsin); kullanıcı **2. seçeneği** seçti.

**Yapılan:** [`filledColors()`](src/lib/contrast.ts): metin BEYAZ, zemin vurgunun
beyaza 4,5:1 verecek kadar koyulaştırılmış hâli (`ensureContrast(vurgu, "#ffffff")`,
ton korunuyor). Tema uygulanırken `--accent-solid`, `--accent-fg`, `--accent-chip`
(ve yıkıcı için `--err-solid`, `--err-fg`) yazılıyor; `button.primary` zeminini
`--accent-solid`den alıyor. One Half Dark: `#61afef` → `#447ba7`.

Kararlar:

- **`--accent` yüzeyde metin olarak açık kalıyor, dolgu için AYRI değişken.** Aynı renk
  hem koyu yüzeyde okunacak kadar açık hem beyaz yazıya zemin olacak kadar koyu
  olamaz. Açık temalarda vurgu zaten koyu: `--accent-solid` = `--accent`.
- **Çamurlaşma sınırı:** koyulaşmış zeminin parlaklığı vurgunun en az %35'i olmalı;
  değilse (sarı gibi çok açık renk) eski kurala düşülüyor (zemin aynen, yazı `onColor`).
- **Hover/active zemini KOYULAŞIYOR** (siyaha karışım, %88 / %76). Açıklaştırmak beyaz
  yazının karşıtlığını 4,5'in altına indirirdi: zemin zaten sınırda.
- **Devre dışı: `opacity` yok**, soluk zemin (vurgunun %30'u, saydam) + açık gri yazı
  (tema metninin %65'i). Ölçüm: en az 3:1 dört temada iki yüzeyde. %60 denendi,
  Solarized Açık 2,999'da kaldı.
- **Sayaç hapı yazının TERSİ renkten** (`--accent-chip`): beyaz yazıda koyu hap. Yazıyla
  aynı tonda hap (önceki hâli) beyaz yazıda sayıyı 2,9:1'e düşürüyordu.
- **Yıkıcı düğme de aynı kurala girdi** ("tüm dolgulu düğmeler değişir" seçeneği
  gösterilmişti). Koyulaşan kırmızı One Half Dark'ta biraz mat.

**Gözle bulunan hata:** devre dışı yıkıcı düğme soluk zeminde BEYAZ yazı taşıyordu (açık
temada ~1,9:1): `button.primary.destructive` ile `button.primary:disabled` AYNI özgüllükte
(0,2,1) ve yıkıcı kural dosyada SONRA geliyor, yani yazı rengini o veriyordu. Yazı rengi
`destructive:disabled` kuralına da yazıldı (özgüllük 0,3,1) ve testle bağlandı.

**Testler:** türetme artık tek yerde; `surfaceContrast.test.ts` `applyThemeToDocument`in
hesabını elle yeniden yazıyordu (kopya, ayrışma riski), şimdi `filledColors`ı çağırıyor.
`lib/filledColors.test.ts` renk uzayını tarıyor (her renkte yazı ≥ 4,5:1), jsdom'da
tema uygulanınca değişkenlerin yazıldığını sınıyor. 22 mutasyon **scratchpad'deki
kopyada** koşuldu (canlı Vite izlediği için; bkz. hafıza notu): dördü ayakta kaldı, biri
mutasyon donanımının yanlış negatifiydi (toplama aşamasında düşen test dosyası "geçti"
sayılıyordu; düzeltildi), üçü gerçek boşluktu (yıkıcı kuralın yapısı, hover şiddeti,
hover/active ilişkisi) ve kapatıldı.

**Yan bulgu (düzeltildi):** toplu kutunun hata kutusu bir sonraki basışta silinmiyordu
(`commit` ve `push` siliyordu); başarılı bir seçimden sonra da "Dosya seçimi
değiştirilemedi" ekranda kalıyordu. `toggleAll` başında `setError(null)`. Kaynağı §2.4'te.

### 1.21 Komut çalışırken yanıt da kutuya yazılıyor

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
  orada kalırdı. Başka bir metin kutusuna yazılıyorsa bu etki de odağa
  dokunmuyor (`typingElsewhere`, dizin seçici hatasının kuralı): birleştirmede
  ortaya çıktı — dizin seçicinin gönderdiği `cd` kutuyu yanıt satırına
  çeviriyor ve korumasız etki arama kutusunun odağını geri alırdı.
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

### 1.22 MSI güncellemesinden sonra görev çubuğu simgesi boşalıyordu

**Bildirilen:** "uygulamayı kurduktan sonra taskbar üzerinde bir süre sonra
iconu gidiyor" — düğme duruyor, resmi boşalıyor.

**Ölçülen.** Görev çubuğuna sabitlenmiş kısayolun simgesi
`C:\Windows\Installer\{A34D7293-…}\ProductIcon` idi ve dosya yoktu. Başlat
menüsü kısayolu o gün yeniden yazılmıştı ve yeni bir ürün kodunun klasörünü
gösteriyordu; masaüstü kısayolu ise exe'nin kendisini.

**Kök neden.** Tauri'nin MSI şablonu Başlat menüsü kısayoluna
`Icon="ProductIcon"` veriyor. Windows Installer o simgeyi ürün koduna bağlı bir
klasöre koyuyor; Tauri her derlemede yeni ürün kodu üretiyor, güncelleme de
eski ürünü kaldırırken klasörü siliyor. Kısayoldan sabitlenen düğme yolu
kopyaladığı için her güncellemeden sonra silinmiş bir dosyayı gösteriyordu.
Simge önbelleği eski resmi bir süre tuttuğu için belirti "bir süre sonra"
geliyordu. NSIS kurucusu kısayola simge vermiyor (exe'ninki), orada sorun yok.

**Çözüm.** Projenin kendi WiX şablonu (`src-tauri/wix/main.wxs`,
`bundle.windows.wix.template`): Tauri'nin şablonu, o tek satır eksik. Elle
kopyalanmadı — `scripts/wix-template.mjs` şablonu kurulu CLI'nin ikilisinden
çıkarıp değişikliği uyguluyor, çünkü elle kopyalanan şablon Tauri
güncellenince sessizce eskir. `tauriConfig.test.ts` üç şeyi bağlıyor:
yapılandırma şablonu kullanıyor, Başlat menüsü kısayolunda `Icon=` yok (AppID
duruyor), şablon CLI'dekinden kaymamış. Hata geri konunca ikincisi ve
üçüncüsü düşüyor (denendi).

İki karar:

- **Masaüstü kısayoluna AppID eklenmedi.** NSIS ikisine de veriyor ama
  Windows kimliği Başlat menüsü kısayolundan çözüyor (Tauri, tao ve wry
  kaynaklarında süreç kimliği atayan bir çağrı yok); kanıtlanmış bir sorunu
  çözmeyen bir değişiklik şablonu gereksiz yere Tauri'ninkinden uzaklaştırırdı.
- **Eski sabitlemeler kendiliğinden düzelmiyor.** Eski bir MSI'dan sabitlenmiş
  düğme ölü yolu taşımaya devam ediyor; bir kez kaldırıp Başlat menüsünden
  yeniden sabitlemek yetiyor (KURULUM.md). Uygulamanın açılışta kendi
  kısayolunu onarması düşünüldü, kullanıcının dosyalarına kendiliğinden
  dokunmak olduğu için yapılmadı.

**Yan bulgu (§2.6, çözüldü).** Aynı kurulumda eski sürüm, Windows Installer'ın
kapatma isteğinde çöktü.

### 1.23 Fark penceresi — IntelliJ / WebStorm'daki gibi

**İstek:** "Git diff ekranında yeni pencerede göster dediğimde IntelliJ /
WebStorm'daki gibi yeni bir pencere açılmalı; solda eskisi, sağda yenisi.
IntelliJ'de nasılsa birebir aynı şekilde."

**Kaynak.** Tahminle değil ölçerek: JetBrains belgesindeki 2026.2 ekran
görüntüleri (koyu ve açık) piksel piksel okundu, metinler ve sabitler IntelliJ
Community kaynağından alındı. Bulunanlar ve karşılıkları:

- Düzen: sol editörün oluğu SAĞINDA (aynalı, `isMirrored`), kaydırma şeridi en
  solda; iki tarafın numaraları ortada yan yana; aradaki ayırıcı 24 px
  (`diff.divider.width`), bağlayıcılar kübik eğri, kontrol noktaları 0.3 / 0.7.
- Renkler Darcula / IntelliJ Light'ınki (yeni arayüzün koyu temaları bunları
  değiştirmiyor): eklenen `294436` / `bee6be`, silinen `484a4a` / `d6d6d6`,
  değişen `385570` / `c2d8f2`. Sözcük farkı olan satır YUMUŞAK: fark rengi ile
  zeminin %40/%60 karışımı (`getIgnoredColor`); ölçülen `25323e` tam bu.
  Satırı olmayan taraf 2 px çizgi.
- Başlıklar: solda kilit + HEAD'in sekiz haneli kimliği + soluk yol, sağda
  "Current version" ("Güncel sürüm"); dal adı yok. Pencere başlığı
  `ad (klasör)`, yeniden adlandırmada `eski -> yeni (…)`.
- Eş zamanlı kaydırmanın çapası görünen alanın üstten üçte biri; değişen bloğun
  içinde satır satır, karşı bloğun sonunda duruyor (`transferLine`). F7 de
  bloğu oraya getiriyor; son farkta doğrudan sonraki dosya.
- Katlama varsayılan AÇIK (İSTEK: "Default daraltılmış gelmeli"; IntelliJ'in
  ayrı pencere varsayılanı tersi) ve KALICI DEĞİL: pencerenin durumu, her
  açılış ve ana pencereden gelen her yeni hedef daraltılmış. Önceki hâli
  tarayıcı deposundaydı; bir kez açan kullanıcının sonraki pencereleri hep açık
  geliyordu. Düğmenin simgesi ve ipucu basınca ne olacağını söylüyor (BİLDİRİLEN:
  "tıklayınca icon değişmiyor"). Katlama değişince okuma noktasındaki satır
  yerinde kalıyor — ÖLÇÜLDÜ: 200 satırda daraltınca içerik ~22 satıra iniyor,
  kaydırma eski yerinde (453px) kalıp görünen alan boşluğa düşüyordu (BİLDİRİLEN:
  "doğru çalışmıyor"). Bağlam 4 satır, tıklayınca 8, 16, sonra tümü. Yer tutucuda yazı yok, editör + oluk + ayırıcı boyunca dalgalı
  çizgi.
- `»` yalnızca sol olukta (sağ taraf yazılabilir): bloğu HEAD'e döndürüyor,
  Ctrl basılıyken değiştirilmiş blokta "Append". `Esc` pencereyi kapatıyor.
  Kısayollar IntelliJ'in iki tuş haritasından (`keymap()`).

**Yapı.** Pencere Rust'tan açılıyor (`diff_window_open`, etiket `diff-<n>`,
boyut ana pencerenin %90'ı) ve uygulamanın kendi sayfasını
`index.html?view=diff&root=…&path=…` ile yüklüyor. `main.tsx` iki kökü de
DİNAMİK içe aktarıyor: fark penceresi depoyu, kabuk başlatmayı ve xterm'i hiç
yüklemiyor (`diffWindowRules.test.ts` içe aktarma ağacını yürüyerek bağlıyor;
`useLabel` bu yüzden `gitLabel.tsx`e taşındı). İki taraf `git_diff_sides`ten
(`git cat-file blob HEAD:<yol>` + diskteki dosya, taraf başına 4 MB sınır),
fark arayüzde: Myers (GNU diff'in doğrusal bellekli biçimi, "çok pahalı"
sınırıyla) + git'in girinti sezgisi — `git diff --no-index` ile aynı blokları
verdiği ölçüldü. Ayarlar ana pencere kaydettikçe `app:settings` olayıyla,
burada yazılamayan dosyada kalem `app:open-file` ile ana pencereye gidiyor.

**Asıl tehlike Rust'taki kapanış kancasıydı.** `on_window_event`'teki
`Destroyed` HER pencerede koşuyor ve `kill_all()` çağırıyordu: bir fark
penceresini kapatmak bütün sekmelerin kabuklarını öldürürdü. Artık yalnızca
`main`; ana pencere giderken açık fark pencereleri de yok ediliyor (yoksa süreç
onlarla yaşamaya devam ederdi). Gerçek uygulamada doğrulandı: fark penceresi
kapandıktan sonra sekmenin `zsh`'i yaşıyor.

**`»` dosyaya yazıyor**, o yüzden `git_write_file` iki şey denetliyor: dosyanın
şimdiki hâli farkın alındığı hâl mi (değilse `changed`, hiçbir şey yazılmıyor;
arada bir düzenleyicide kaydedilmiş olabilir) ve dosya UTF-8 mi (değilse
`not-text`: elimizdeki metin `from_utf8_lossy` çıktısı, geri yazmak baytları
bozardı). Yol depo kökünün altında, var olan, bağlantı olmayan bir dosya
olmalı. Satır sonları (`\r\n`) ve dosya sonundaki satır sonu korunuyor
(`applyChange` ham metinde çalışıyor). Geri alma yığını yalnızca başarılı
yazmada ilerliyor.

**Kullanımdan sonra IntelliJ'den bilinçli ayrılan üç şey (4 Ekim):**

- **"Yeniden basın" ipucu kaldırıldı.** IntelliJ son farkta F7'ye ilk basışta
  "Press again to go to the next file" deyip ikinci basışı bekliyor. İSTEK:
  "o yazıyı kaldıralım, basınca geçer zaten." Ara adım bir hata kaynağıydı da:
  BİLDİRİLEN "basıyorum ama olmuyor" — ikinci basıştan önce gelen her olay
  (düğmenin `mousedown`u, Shift'in kendi keydown'u) ipucunu siliyor, ikinci
  basış onu yeniden gösteriyordu. Testler artık gerçek olay sırasını gönderiyor.
- **Fark canlı.** BİLDİRİLEN: "değişiklik yapınca açık pencereye anlık
  yansımıyor" — yalnızca odakta tazeleniyordu. Pencere görünürken 500 ms'de bir
  dosya (bir okuma) ve depo imzası (`git_fingerprint`: HEAD, indeks, stash)
  yoklanıyor; pahalı yeniden yükleme yalnızca biri değişince. Aynı okunamayan
  disk durumu yeniden yüklemeyi ikinci kez tetiklemiyor.
- **Tek fark penceresi** (IntelliJ ayrı pencere kipinde her seferinde yenisini
  açıyor). BİLDİRİLEN: "farklı bir dosya için bastım, yeni bir tane açıldı; her
  tıkladığımda mevcut açık ekran güncellenmeli." `diff_window_open` açık bir
  `diff-*` penceresi bulursa onu öne getirip `app:diff-target` olayıyla yeni
  sorguyu gönderiyor; pencere aynı dosyaysa yerinde kalıyor, başka bir depoysa
  listeyi ve geri alma yığınlarını bırakıyor. Sayfa yüklenirken gelen tıklama
  kaybolmasın diye Rust hedefi pencere `diff_window_ready` diyene kadar
  bekletiyor. Gerçek uygulamada (izole örnek, AX) doğrulandı: üç dosyaya art
  arda basınca tek pencere, içerik ve "n/19 dosya" her seferinde değişiyor;
  pencere açılırken hemen ikinci dosyaya basınca ikinci dosya geliyor.
- **Dişli menüsü seçimden sonra açık kalıyor** (IntelliJ kapatıyor). İSTEK: "her
  seçim yaptığımda kapanıyor." Seçenekler karşılaştırmalı denensin diye.
**Sağ taraf yazılabilir (4 Ekim).** BİLDİRİLEN: "Düzenle butonuna basınca dosya
açılıyor fakat düzenleme yapamıyorum" — kalem dosyayı salt okunur
görüntüleyicide açıyordu. İlk çözüm (dosyayı WebStorm / IntelliJ / VS Code /
Cursor'da açan kalem ve Ayarlar › Düzenleyici) GERİ ALINDI — İSTEK: "Düzenle de
bizim terminalimizde olmalı", sorulunca "fark penceresinin sağ tarafında". Artık
IntelliJ'deki gibi sağ taraf doğrudan yazılabilir:

- **Yapı.** Bölmenin sanal satırlarının ÜSTÜNDE, aynı yazı tipi, satır yüksekliği,
  sol boşluk ve sekme genişliğiyle saydam bir `<textarea>` (`DiffEditor.tsx`).
  Harfleri yazı alanı çiziyor, satırlar yalnızca zemini ve sözcük parçalarını
  (`.dw-pane.editable .dw-line { color: transparent }`) — yazarken harf
  gecikmiyor, fark bir sonraki çizimde yetişiyor. İmleç, seçim, IME, kopyala /
  yapıştır tarayıcının. Komut satırındaki renkli girdi kutusuyla aynı yöntem.
  Yazı alanı kendi başına kaymıyor (boyu bütün dosya); iç kaydırma olursa
  bölmeye aktarılıyor.
- **Metin dosyanın kendi biçiminde** (`\r\n` dahil) tutuluyor; yazı alanının
  `\n`i yalnızca kapıda çevriliyor (`diffEdit.ts` `toDisplay` / `toFile`).
  Satır sonu karışık ya da yalnız CR olan dosyada yazı alanı YOK: geri yazarken
  hangi satırın hangi ayırıcıyı taşıdığı bilinemezdi (`»` orada çalışıyor).
- **Kayıt:** yazmayı bıraktıktan 400 ms sonra; `»`, geri alma, pencereden çıkış,
  dosya değiştirme, Ctrl/Cmd+S ve kapanış (`onCloseRequested`, en çok 2 sn
  bekliyor) beklemeden. `expected` metnin üzerine yazıldığı disk içeriği;
  Rust dosya ondan ayrılmışsa yazmıyor. O zaman — ya da yazılmamış değişiklik
  varken yoklama diskte başka bir içerik görürse — IntelliJ'in "File Cache
  Conflict"i gibi bant: **Diskteki hâli yükle** / **Benimkini kaydet**; seçilene
  kadar hiçbir şey yazılmıyor. Kaydedilmiş hâldeyken dışarıdan gelen değişiklik
  sessizce benimseniyor (imleç değişikliğin üzerinden taşınıyor).
- **Geri alma kendi geçmişimiz** (`EditHistory`): yazı alanının yerleşik geri
  alması metni programla değiştirince (`»`, diskten yükleme) bozuluyor. Art
  arda yazılan harfler 1 sn içinde tek adım (IntelliJ'in komut birleştirmesi);
  yeni satır adımı bölüyor. Dosya başına; başka dosyaya geçince sıfırlanıyor.
  macOS Düzen menüsünden gelen Geri Al da (`beforeinput` `historyUndo`) bize.
- **Kalem aç / kapa ve görünürlüğü.** BİLDİRİLEN: "kaleme basınca düzenleme
  açılıyor fakat tekrar basınca kapanmıyor" — sağ taraf hep yazılabilirdi,
  kalem yalnızca odaklıyordu. Artık varsayılan SALT OKUNUR; kalem aç/kapa.
  Sonra: "kullanıcının da anlaması gerek, rengi mi değişir bilmiyorum" — basılı
  hâl üzerine gelmeyle aynı zemindeydi. Açıkken kalem vurgu renginde ve
  çerçeveli, başlığı "Düzenlemeyi kapat"; sağ başlıkta "✎ Düzenleniyor" ve
  altında vurgu çizgisi. Kapalıyken sağ başlıkta kilit (IntelliJ'de kilit = salt
  okunur) ve ipucu "düzenlemek için kaleme basın". Esc önce düzenlemeyi kapatıyor.
  İSTEK üzerine araç çubuğunda Geri al / İleri al / Kaydet düğmeleri de var.
- **Kısayollar:** Enter girintiyi koruyor, Sekme bir birim (dosyadan sezilen:
  sekme ya da en sık girinti adımı; JSDoc'un tek boşluğu sayılmıyor), Shift+Sekme
  siliyor. Yazı alanındayken kalem kısayolu tarayıcının (mac'te `⌘↓` metnin
  sonu); F7 yazı alanının imlecini de farka taşıyor. Kalem (artık "Düzenle")
  birleşik görünümden / daraltmadan çıkıp imleci sağ tarafa koyuyor.
- **Ölçülen iki başarım tuzağı** (20 bin satır, ~490 KB): (1) React
  `defaultValue` her çizimde değişirse textarea'nın içeriğini DOM'da baştan
  yazıyor — ilk değere sabitlendi; (2) en uzun satıra yazarken bölme genişliği
  her tuşta değişirse tarayıcı bütün yazı alanını yeniden diziyor (tuş başına
  ~60–300 ms) — yazılabilirken genişlik 40 sütunluk adımlarla büyüyor. Üretim
  derlemesinde tuş başına 20 bin satırda ~36 ms (yalın textarea 13 ms), 2 bin
  satırda 5–14 ms. GELİŞTİRME derlemesinde aynı dosya ~400 ms: profil sürenin
  ~%85'ini React 19'un yalnız geliştirmede koşan `logComponentRender` /
  `addObjectDiffToProperties`'inde gösterdi (20 bin satırlık dizileri prop farkı
  diye geziyor) — `tauri dev`'de büyük dosyada yazmak yavaş, kurulu sürümde değil.
- **Doğrulama (aç/kapa, araç çubuğu, görüntüleyici).** Fark penceresi ve
  görüntüleyici testleri (açık/kapalı hâlin görünüşü, Kaydet / Ctrl+S, geri al /
  ileri al düğmeleri, kapatırken ve dosya değişirken kayıt, çakışmada Ctrl+S'nin
  de yazmaması) ve 5 Rust testi (`write_text`); 12 mutasyonun 12'si yakalandı
  (ilk turda biri kaçtı: çakışmada Ctrl+S sınanmıyordu). Görünüş tarayıcı
  düzeneğinde iki hâlde bakıldı.
- **Doğrulama.** jsdom testleri (yazma, birleşen geri alma, CRLF, karışık satır
  sonu, yeni dosya, Enter/Sekme, iki çakışma yolu, kapanışta ve dosya
  değişirken kayıt, F7, kalem) ve 16 birim testi; 18 mutasyonun 18'i yakalandı.
  Hizalama Chromium'da ve ayrı bir WKWebView anlık görüntüsünde (ekrana pencere
  açmadan) alt satırlar kırmızı, yazı alanı yeşil boyanarak: harfler tam üst üste.
  Gerçek uygulamada (izole örnek, geçici depo): gerçek tuşlarla yazmak dosyaya
  yazıldı, ⌘Z geri aldı, yazıp 0,1 sn sonra Esc pencereyi kapattı ve bekleyen
  kayıt kapanmadan önce yazıldı.

Seçeneklerin hepsinin pencerede etkili olduğu `diffWindow.test.tsx` › "dişli
menüsündeki seçenekler"de bağlı (SORULAN: "hangileri gerçekten çalışıyor").

**Dosya görüntüleyicisinde düzenleme (4 Ekim).** İSTEK: "Dosyalar kısmından
bir dosyayı açtığımda orada da düzenleme yapabilmeliyim, kaydet butonu da
olmalı; düzenle, geri al, ileri al, kaydet." `FileViewer` başlığında dört düğme;
kalem aç/kapa (fark penceresindekiyle aynı görünüş). Yazı alanı ve geri alma
fark penceresininki (`EditorLayer`, `EditHistory`); numaralar tek bir `pre`
(yazı alanıyla aynı satır yüksekliğinde dizilsin diye — kesirli `line-height`
ayrı satır kutularında binlerce satır sonra kayardı). Kayıt AÇIK (istenen
Kaydet düğmesi); kaybolmasın diye düzenlemeyi kapatırken, başka dosyaya
geçerken ve ağaca dönerken kendiliğinden. Yazma yeni `write_text_file` komutuyla
(`files::write_checked`: fark penceresiyle ORTAK denetim — okunduğu hâlden
ayrılmışsa `changed`, UTF-8 değilse `not-text`, bağlantı / klasör / olmayan dosya
değil). Kesilen (yarım megabayt), ikili, satır sonu karışık dosyada kalem kapalı.
Ana penceredeki genel kısayollar odak bir metin alanındayken çekiliyor; Geri
al / İleri al / Kaydet tuşlarını yazı alanının kendisi yakalıyor.

**Bilinçli olarak YAPILMAYANLAR:** birleşik görünümde yazmak (IntelliJ'de
yazılabilir), sözdizimi renklendirmesi (bkz. `FileViewer`
gerekçesi), "Align Changes in Side-by-Side Diff". Ayrıntı §2.7.

**Doğrulama.** Motor: rastgele girdide en kısa fark (LCS ile karşılaştırma),
bütün bloklar uygulanınca sol metnin çıkması, git'le aynı kayma. Pencere: sahte
IPC'li jsdom testleri. On mutasyonun onu yakalandı (ilk turda girinti sezgisi
kaçtı: örnek onu sınamıyordu, git'le ölçülen yeni örnek eklendi). Gözle:
scratchpad'deki Vite düzeneğinde koyu ve açık tema; gerçek uygulamada
(ayrı veri klasörüyle) pencerenin açılması, IPC izinleri, "Kaynağa git" ve
kapanışta kabukların yaşaması erişilebilirlik ağacından okunarak.

### 1.24 Claude Code çalışan sekmede Claude'un resmi

**İstek:** `claude` açılınca terminalde çıkan resim, soldaki sekmede de
görünsün (başka bir terminal uygulamasında böyle).

**Karar yeri.** Yeni bir durum yok: kabuk entegrasyonu komut başlarken metnini
(`lastCommand`), bitince "bitti"yi (`running`) zaten bildiriyor. İkisinin
birleşimi `isClaudeCommand` (`labels.ts`); kenar çubuğu, sekme çubuğu ve
bölme başlığı rozetin yerine `ClaudeIcon` çiziyor. Rozet ayarından bağımsız:
kabuk kodu bir etiket, resim sekmenin o anki işi. Sınır: metin takma ad
açılmadan geliyor (zsh preexec `$1`), `alias c=claude` tanınmıyor. Süreç adına
bakmak Rust'ta platforma özel bir iş olurdu; istenirse ayrıca.

**Resim.** Claude Code maskotu blok karakterlerle çiziyor; kaynak ikilinin
içinde (`clawd_body` rengi, 2.1.257'de `" ▐" + "▛███▛█"`, `"▝▜" + "█████" +
"█▀"`, bacaklar `"▝▝ ▝▝"`). Her karakter 2×2 piksel ve hücre iki kat uzun, yani
SVG'de piksel 1×2 (viewBox 17×10). Bacaklar kullanıcının ekran görüntüsündeki
2.1.289'a göre gövde kenarlarının ve gözlerin altında; 2.1.257'de daha içerde.
17px genişlikte bir sütun bir piksel: `crispEdges` ile 1x'te de keskin.
Rozette resim kutuyu boydan boya dolduruyor (istek); kutu yazılı rozetle aynı
boyda, `1lh + 4px`. Boyu 5px'in katına yuvarlamak (2x'te tam piksel ızgarası)
denendi: 12px arayüz yazısında kutu 14px, resim ya 10px'e iniyor ya taşıyordu.

**Doğrulama.** `labels.test.ts` (tanınan ve tanınmayan komutlar),
`shellBadge.test.tsx` (üç çizim yeri, bitince geri dönüş, ayar kapalıyken).
Gözle: scratchpad Vite düzeneği + ekran dışı WKWebView görüntüsü, koyu ve
açık tema, sekme ve bölme görünümü.

### 1.25 Dosya paneli terminalin üstünde; dosyaların içinde arama

**İstek:** "Klasörleri göster'e basınca açılıyor ve terminali sıkıştırıyor,
üstüne açılsın. Bir dosyayı seçersem yanına full width açılsın. Üstteki arama
dosyaları arıyor; dosyaların içinde metin araması da olmalı."

**Katman, sütun değil.** Panel ızgarada `files` sütunuydu; açılınca terminal
daralıyor, xterm yeniden ölçülüyor, PTY'ye yeni boyut gidiyor ve kabuk ekranı
yeniden çiziyordu. Şimdi `.main` içinde, terminal hücresinde (`grid-area:
terminal`) duran `.files-layer`; içeriği mutlak konumlu, yani hücrenin ölçüsüne
katkısı sıfır. Ölçüldü (tarayıcı düzeneği): terminal alanı 984×633, xterm
ekranı 948×611 — panel açıkken de, dosya açıkken de aynı. Katman
`pointer-events: none`; yalnızca sütun ve görüntüleyici olay alıyor, ağacın
sağında kalan terminal tıklanabilir. Sekme çubuğu, komut kutusu ve durum
çubuğu örtülmüyor (ağaçta Shift+tıklama yolu kutuya ekliyor). Sağ panel de
örtülmüyor: kullanıcının açtığı sabit bir panel; o açıkken görüntüleyici
terminalin genişliğini alıyor (dar kalırsa başlıkta boyut/klasör kap
sorgusuyla gizleniyor).

**Katman sırası.** Terminal alanı kendi bağlamını kurmuyor (`.terminal-area`
z-index'siz); içindeki arama çubuğu 20, bloklar 4. Panel 22: onların üstünde.
Öneri şeridi 20'den 24'e çıktı — panel açıkken yazılan komutun önerileri
görünmeli. Terminal alanına z-index verip yalıtmak DÜŞÜNÜLDÜ ve yapılmadı:
terminalin sağ tık menüsü (`.ctx-menu`, 300) o alanın İÇİNDE çiziliyor;
yalıtılsaydı menü ve arkasındaki tıklama kalkanı panelin altına düşerdi.

**Görüntüleyici yanda.** `ui.viewerPath` doluysa sütunun yanında
`.file-viewer-pane` (kalan bütün genişlik). "Geri" kalktı; başlıktaki × yalnızca
dosyayı kapatıyor. `key={viewerPath}`: başka dosyaya geçmek görüntüleyiciyi
baştan kuruyor — eskiden aynı yer yeniden kullanılınca kaydırma konumu önceki
dosyadan taşınırdı. Ağaçta açık dosya işaretli; `openFile` dosyanın EKSİK
dallarını `treeExpanded`a ekliyor (kökün altındaysa; hiçbiri eksik değilse
aynı dizi) ve satır bir kez görünür alana kaydırılıyor. Sütun genişliğinin
üst sınırı 900 → 600 (görüntüleyici artık sütunda değil) ve katmanda
`min(600px, 100% - 240px)`. Esc katman katman: arama → panel; düzenleme yazı
alanındaki Esc paneli kapatmıyor; panel kapanırken odak komut kutusuna ya da
terminale dönüyor. "Terminalde ara" açık bir dosya terminali örtüyorsa önce
paneli kapatıyor (yoksa çubuk panelin altında kalırdı).

**İçerik araması Rust'ta (`search.rs`).** Arayüze binlerce dosyanın içeriğini
taşımak yerine. Dosya listesi depoda `git ls-files -z --cached --others
--exclude-standard` (`.gitignore`a uyuyor, yeni bağımlılık yok); depo değilse,
git yoksa ya da liste boşsa (yok sayılan bir klasörün içindeyiz) `files::list`.
Git süreci AKITILARAK okunuyor: 20.000 dosyayı geçince, 4 sn dolunca ya da
arama iptal edilince öldürülüyor — ev klasörü "dotfiles" deposu olan
kullanıcıda `--others` bütün ev klasörünü yürüyebilir. Liste 5 sn önbellekte
(yazma soluğu); içerik her aramada diskten. Eşleştirici `regex` (tauri-utils
zaten aynı sürüme bağlıydı, yeni ağırlık değil): düz metin `regex::escape`,
varsayılan harf gözetmeyen, `multi_line` + `crlf`. Düz metinde dosyaya tek
tarama, eşleşmeler satırlarına dağıtılıyor; düzenli ifadede her satıra ayrı
(`\s` satır sonunu yakalayıp iki satıra yayılmasın, `(?-m)^` dosya başına
kilitlenmesin). Konumlar UTF-16 birimi (arayüz `slice` ile kesiyor; Türkçe
harf ve emoji testte). Dosyalar 8 iş parçacığına kadar paralel, ortak sayaçtan
alınıyor; 2000 satırı geçince yeni dosya alınmıyor, alınanlar bitiriliyor —
sonuç her koşuda aynı ilk 2000 satır. Sınırlar sonuçla geliyor ve arayüz
yazıyor: `truncated`, `files_capped`, `skipped_large` (2 MB), ikili (ilk 8 KB'ta
NUL, görüntüleyiciyle aynı karar). Ölçüldü (release, bu depo): ilk arama
~37 ms, önbellekli ~3 ms; 20.000 dosyalık git'siz bir klasörde ilk ~1,1 sn,
sonra ~170 ms.

**İptal.** Arayüz her aramaya kimlik veriyor (`Date.now()*1000 + sayaç` —
sayfa yenilenince sayaç sıfırlanıp Rust'ta süren eski bir aramayla
çakışmasın) ve yeni sorgu geldiği AN eskisini `search_text_cancel` ile
durduruyor; geç gelen sonuç yok sayılıyor. İptal Rust'ta aramanın kendisinden
önce işlenebiliyor (ayrı görevler): kimlik `early` kümesine yazılıyor, arama
hiç başlamıyor; küme 256'da temizleniyor.

**Arayüz.** Başlık çubuğundaki palet iki sekmeli (Dosya adı / Dosya içeriği,
JetBrains'in Search Everywhere'i gibi): kutu ve sorgu ortak, Tab değiştiriyor,
Enter o satırda açıyor, son sorgu seçili geri geliyor. Kısayol `textSearch`:
mac'te ⌘⇧F; Windows'ta Ctrl+Shift+F zaten "Terminalde ara" olduğu için
Ctrl+Shift+G. Seçenekler (Aa / tam sözcük / .*) palet ve sütunda ortak
(`ui.searchFlags`), tuşları VS Code'unki (Alt+C/W/R, mac'te ⌥⌘; harf `code`dan).
Sütunun aramasında Dosya / İçerik kipi; seçim listeyi kapatmıyor (eskiden
kapatıyordu, çünkü görüntüleyici aynı yeri paylaşıyordu). Sonuç listesi tek
bileşen (`TextResults`): palet ve sütun aynı işareti çiziyor.

**Doğrulama.** Rust: `search_tests.rs` (36 test: konumlar, kırpma, vekil
çifti, CRLF, tam sözcük, düzenli ifadenin satır satır uygulanması, iki yolun
aynı sonucu, sınır kararlılığı, git'in yok saydıkları, yok sayılan klasörde
yürüyüş, iptal). Arayüz: `textSearch.test.ts`, `filePalette.test.tsx`,
`fileOverlay.test.tsx`, `dirs.test.ts` (dallar), `fileViewer.test.tsx`
(satıra gitme), güncellenen `titlebar.test.tsx` / `fileSearch.test.tsx` /
`treeCollapse.test.tsx`. Gözle: scratchpad Vite + sahte IPC (deponun gerçek
kaynakları sahte dosya sistemi), Chromium ve ekran dışı WKWebView, koyu ve açık
tema, sağ panel açıkken. Tuzak: ekran dışı WKWebView'de CSS animasyonu
ilerlemiyor — panelin açılış animasyonu ilk karede (opaklık 0) kalıp paneli
görünmez gösterdi; görüntüden önce animasyonları kapat.

### 1.26 Geri yüklenen ekran kabuğu tam ekran programın kiplerinde bırakıyordu

**Bildirilen:** Claude Code tam ekran açıkken uygulama yeniden başladı (kabuk
SIGHUP aldı). Geri gelen sekmede komut kutusu yoktu; fare oynadıkça isteme
`^[[<35;12;1M`, pencereye dönünce `^[[I` yazılıyordu. "Yeniden başlat"
düzeltmiyordu.

**Kök neden.** `serialize()` seçeneksiz çağrılıyordu ve xterm'in serialize
eklentisi o zaman ikincil ekranı (`?1049h` + son kare) ve kipleri (fare izleme,
odak, uygulama tuşları, bracketed paste) de yazıyor. Geri yükleme bunları yeni
terminale uyguluyordu: kabuk ikincil ekranda doğuyor — komut kutusu orada
bilerek kapalı (`resolveInputMode`) — ve terminal fare / odak raporlarını
kabuğa girdi diye gönderiyordu. Diskteki iki kayıtta `?1049h`, `?1003h`,
`?1004h` sayıldı. Eklenti SGR kodlamasını (`?1006h`) yazmadığı için geri
yüklemeden sonra raporlar X10 biçimine döndü (`[ZZYZ…`). "Yeniden başlat" ekranı
aynı yoldan kaydedip geri yüklediği için durum kendini taşıyordu.

**Çözüm.** Kayıt `excludeModes` + `excludeAltBuffer` ile; tam ekran programın
son karesi, program artık çalışmadığı için zaten yanıltıcı. Düzeltmeden önce
yazılmış dosyalar için geri yüklemenin ardından `RESTORE_RESET`: `?1047l` (ana
ekrana dön, `?1049l`in aksine imleci geri yükleme), DECSTR, fare izleme ve SGR
kodlaması kapalı. Sıfırlama tek başına yetmiyordu: eski kayıttaki `?1004h`
yazıldığı AN xterm odağı bildiriyor (`ESC [ O`) ve rapor sıfırlamadan önce
`ptyWrite`a gidiyordu (düzenekte görüldü). Kabuk o an yok, Rust yazmayı
düşürüyor; ama yeniden başlatmada aynı kimlikle doğan kabuğa ulaşmaması IPC
sırasına kalıyordu. Kayıt yazılırken (`restoring`) terminalin yanıtları
yutuluyor.

**Açık uç.** Uygulama açıkken tam ekran bir program çökerse ya da öldürülürse
kipler canlı terminalde kalıyor; kurtarma artık "Yeniden başlat". İstemde (OSC
133;D) kendiliğinden sıfırlamak düşünüldü, Windows'ta denenmeden yapılmadı.

**Doğrulama.** `TerminalSession.test.ts` › "geri yüklenen ekran": eski biçimli
kayıttan sonra ana ekran, varsayılan kipler, kutunun açılma koşulu
(`atPrompt`, `altScreen`) ve kabuğa odak raporu gitmemesi; kayıtta ikincil
ekran ve kip dizisi yok. Mutasyonla sınandı: düzeltmesiz ikisi, sıfırlamasız,
kayıt seçeneksiz ve kapısız hâlde ilgili olan düşüyor. Uçtan uca: scratchpad
düzeneğinde eski biçimli kaydı geri yükleyip fareyi gezdirmek ve odağı
değiştirmek (ekran dışı WKWebView); kutu açık, kabuğa hiçbir şey yazılmadı.

### 1.27 Dosya panelinde görsel önizlemesi

**İstek:** "Dosyalardan png tıkladığımda görsel olarak göremiyorum." Görüntüleyici
her dosyayı metin olarak okuyup PNG'ye (ilk 8 KB'ta NUL) "ikili dosya" diyordu.

**Karar uzantıdan** (`lib/images.ts`): dosyayı okumadan hangi görüntüleyicinin
açılacağı bilinmeli. PNG, JPEG, GIF, WebP, AVIF, BMP, ICO, SVG; TIFF ve HEIC
listede ama yalnızca WebKit'te çiziliyor — WebView2'de `<img>` hata veriyor ve
"biçim desteklenmiyor olabilir" deniyor, boş alan kalmıyor.

**Neden `data:` adresi.** CSP (`tauri.conf.json`) görsellere `'self'`, `asset:`
ve `data:` dışında kaynak tanımıyor: `blob:` geliştirmede (Vite'ta CSP yok)
çalışıp ÜRETİMDE boş çıkardı. Varlık protokolü (`asset:`) için hem yapılandırma
hem Cargo özelliği gerekirdi ve kapsamı bütün disk olurdu. Yeni komut
`read_image_file` (`files::read_image`) dosyayı base64 veriyor, 20 MB sınırıyla
(`too-large:<bayt>`, arayüz boyutla söylüyor); `async` + `spawn_blocking`.
CSP'deki `data:` izni testle bağlı (`imageViewer.test.tsx`): düşerse yalnızca
kurulu sürümde görülen bir hata olurdu.

**Görüntüleyici** (`ImageViewer`): varsayılan sığdır ama BÜYÜTMEDEN (`max-*`;
`width: 100%` simgeyi bulanıklaştırırdı — kuralı kaynak testi tutuyor). Ölçek
`ResizeObserver` ile alanın ölçüsünden; görsele ya da düğmeye tıklamak gerçek
boyut ↔ sığdır. Görsel zaten sığıyorsa düğme yok. Saydamlık dama zeminde,
görselin kenarı ince çerçeveyle. SVG: önizleme varsayılan, `</>` kaynağa geçiyor
(metin görüntüleyicisi, düzenlenebilir); seçim dosyaya VE gidişe (`seq`) bağlı,
içerik aramasından yeni bir eşleşme yine kaynağı açıyor.

**Doğrulama.** Rust `files_tests.rs` (bayt bayt geri dönüş, sınırın tam kendisi,
klasör/olmayan dosya, alan adları). Arayüz `images.test.ts`,
`imageViewer.test.tsx` (`data:` adresi, %50 ölçek ve geçiş, küçük görselin
büyütülmemesi, büyük/bozuk görsel uyarıları, ağaçtan PNG, SVG önizleme ↔ kaynak,
aramadan SVG). Gözle: düzenekte deponun gerçek simgeleri (`src-tauri/icons`),
ekran dışı WKWebView, geniş ve dar pencere.

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

### 2.4 Değişiklikler paneli: commit ve push'un açık uçları

§1.17'nin bilinçli olarak dışarıda bıraktıkları ve elle denenmemiş yerleri:

- **Pull yok.** Uzak ilerideyse push reddedilir; panel bunu düğmeye basmadan
  önce söylüyor ama çözümü (`git pull`) terminale bırakıyor. Panele pull
  eklenirse birleştirme/çakışma durumu da paneli ilgilendirir; ayrı bir iş.
- **Push için zaman aşımı yok.** Ağ takılırsa düğme "Gönderiliyor…"da kalır (Rust
  tarafındaki süreç bitene kadar). Tüm yazma işleri tek kuyrukta olduğu için o
  süre boyunca sonraki ekle/çıkar/commit işlemleri de bekler.
- **Dosya bazında sahneleme; satır ya da blok bazında yok.** Kısmen eklenmiş bir
  dosya (`MM`) kutuda "ara" görünüyor ama bölmek için terminal gerekiyor.
- **Uzak tanımlı olmasa da "Yayınla" görünüyor.** Tıklamak "uzak depo tanımlı
  değil" hatası veriyor. Uzağı bilmek her durum okumasına bir `git` süreci daha
  eklerdi (bkz. `git.rs` baş yorumu: süreç bedava değil).
- **Yayınlanmamış dalda kaç commit ileride olduğu bilinmiyor** (yalnızca "yayınla"
  yazıyor): yukarı akış yokken `ahead` hesaplanamıyor.
- **Gerçek Tauri penceresinde uçtan uca elle denenmedi.** Rust gerçek git'le, arayüz
  sahte IPC'li harness'te sınandı; ikisini bağlayan IPC sözleşmesini
  `lib/ipcContract.test.ts` denetliyor. Windows/CI'da Rust testleri de
  koşulmadı (yalnızca macOS).
- **YANLIŞ HATA: `git add` izlenen ama yok sayılan klasördeki dosyada `1` dönüyor.**
  Gerçek örnek (yatas): `.gitignore` `js-storefront/yatas/.vscode`u yok sayıyor, içindeki
  dosyalar ise izleniyor. `git add -- <izlenen dosya>` dosyayı EKLİYOR ama "The following
  paths are ignored by one of your .gitignore files: …" yazıp çıkış kodu **1** veriyor
  (scratch depoda üretildi). `stage` çıkış koduna bakıyor: toplu kutu "Dosya seçimi
  değiştirilemedi" gösteriyor, oysa iş görülmüş. Önerilen düzeltme
  ([`git.rs`](src-tauri/src/git.rs) `stage`): izlenenler için `add -u -- <yollar>` (yok sayma
  denetimi yok), izlenmeyenler için `ls-files --others --exclude-standard -z -- <yollar>`
  ile dosyaları bulup tek tek `add`. **`-f` kullanma:** dizin yolunda (porcelain
  `?? dizin/` veriyor) yok sayılan dosyaları da ekler. Rust'a dokunacağı için
  (`tauri dev` uygulamayı yeniden başlatır) kullanıcıya sorulmadan yapılmadı.

### 2.5 Stash'in açık uçları

§1.19'un bilinçli olarak dışarıda bıraktıkları:

- **Kapalı satırlarda `+N -M` sayacı yok.** Sayaç farkla birlikte çiziliyor ve fark
  yalnızca açık satır için isteniyor. Tek bir `git diff HEAD --numstat -z
  --no-renames` bütün sayaçları verir (yeniden adlandırmada `--no-renames` şart:
  satırın farkı yalnızca yeni yolu alıyor, yani tüm dosya "eklendi" görünüyor ve
  sayaç onunla tutmalı); takipsiz dosyalar için satır sayısı ayrıca okunmalı.
- **Stash'ten dal oluşturma yok** (IntelliJ'deki "Create Branch"), **`--keep-index`
  yok**, **hepsini temizle (`stash clear`) yok**.
- **Sayaç reflog dosyasına dayanıyor.** `reftable` arka ucunda (`git init
  --ref-format=reftable`, git ≥ 2.45) `logs/refs/stash` yok: sayı hep 0 görünür ve
  terminalden atılan `git stash` kendiliğinden görünmez. Bölüm başlığı yine durur
  ve liste `git stash list`ten okunur; kendi işlemlerimiz durumu zaten tazeliyor.
- **Dosya listesi 200'de kesiliyor** ("… ve N dosya daha"); tümünü görmek için
  terminal gerekiyor.
- **Zaman aşımı yok.** Takılan bir `git` süreci "atılıyor…"da kalır; tüm yazma
  işleri tek kuyrukta olduğu için sonrakiler de bekler (push için de aynı, §2.4).
- **Gerçek Tauri penceresinde elle denenmedi; Windows'ta Rust testleri koşulmadı.**
  Rust gerçek git'le, arayüz sahte IPC'li harness'te sınandı. (30 Eylül:
  yanıt kutusuyla birleştirmeden sonra Windows'ta koşuldu — 264 + 13, stash
  testleri dahil geçti.)

### 2.6 Windows Installer'ın kapatma isteğinde çökme — ÇÖZÜLDÜ

**Gözlenen (30 Eylül, Windows olay günlüğü).** MSI kurulurken Restart Manager
açık N-Terminal'e (09:23'ten beri çalışan, pid 16988) kapanmasını söyledi;
süreç iki saniye sonra `0xc0000409` ile düştü (Application Error 1000, ardından
WER `BEX64`). Düzgün kapanışın işleri (çalışma alanı, ekran çıktıları)
yapılmadı. Aynı yol Windows güncellemesinden sonra yeniden başlatmada ve oturum
kapatmada da işliyor.

**Yakalandı** (kurulu uygulamaya dokunmadan, yalıtılmış örnekte). Geliştirme
yapısına Restart Manager'ın GUI uygulamaya gönderdiği iletiler
(`WM_QUERYENDSESSION`, ardından `WM_ENDSESSION` + `ENDSESSION_CLOSEAPP`):

```
panicked at …\tao-0.35.3\src\platform_impl\windows\event_loop\runner.rs:371:25:
cannot move state from Destroyed
```

Düzeltmesiz sürüm yapısına gerçek `RmShutdown`: aynı panik, `RmShutdown` 2018
ms, Application Error 1000 `0xc0000409`, WER `BEX64` (P9 = 7,
`FAST_FAIL_FATAL_APP_EXIT`, yani Rust'ın abort'u). Olay günlüğündeki imzanın
aynısı.

**Kök neden tao'da.** tao `WM_ENDSESSION`ı kendi gizli ileti penceresinde
(`Tao Thread Event Target`) karşılıyor: olay döngüsünü `Destroyed` yapıyor ve
`0` dönüyor. Oturum kapanırken Windows süreci ardından kendisi sonlandırıyor;
Restart Manager ise sonlandırmıyor, uygulamanın kendisinin çıkmasını bekliyor.
İleti döngüsü dönmeye devam ediyor ve gelen ilk Tauri iletisi (IPC yanıtı, PTY
çıktısı) `Destroyed`dan çıkmaya çalışıp panikliyor. Sürüm profilinde
`panic = "abort"`: panik doğrudan `0xc0000409`.

**Çözüm** ([`session_end.rs`](src-tauri/src/session_end.rs)). tao'nun
penceresine tao'dan sonra bir alt sınıf takılıyor; comctl32 son takılanı önce
çağırdığı için `WM_ENDSESSION(TRUE)` tao'ya hiç ulaşmıyor. Yerine düzgün
kapanış:

1. `WM_QUERYENDSESSION`: arayüze `app:session-end` gidiyor ve `flushAllState`
   (kapatma düğmesinin kaydının aynısı) başlıyor. Yanıt yine "evet".
2. `WM_ENDSESSION(TRUE)`: kaydın bitmesi bekleniyor, en fazla 3 sn. Kayıt
   komutları ana iş parçacığında koştuğu için bekleme iletileri kendisi işliyor.
3. `kill_all`, `cleanup_before_exit` (tepsi simgesi kalkıyor), çıkış.

"Arka planda kal" burada geçerli değil: kapatan sistem.

Kararlar:

- **Kayıt soru aşamasında başlıyor.** Oturum kapanırken WebView2 süreçleri de
  `WM_ENDSESSION` alıyor ve bizden önce kapanabilir; soru aşamasında herkes
  ayakta. İptal edilen bir kapanışın (`WM_ENDSESSION(FALSE)`) bedeli fazladan
  bir kayıt.
- **Süreç `WM_ENDSESSION`ın içinde bitiyor** (tao 0.37'nin yaptığı da bu).
  Dönüp Tauri'nin çıkışını beklemek, oturum kapanırken Windows'un süreci o arada
  kesmesine açık kalırdı.
- **tao güncellenmedi.** 0.37.0 aynı iletide süreci hemen bitiriyor ve Tauri
  2.12 istiyor: çökme giderdi ama son kayıt yine yapılmazdı, olay işleyicisi
  çalışırken gelen `WM_ENDSESSION` da orada hâlâ panik
  ([tao#1345](https://github.com/tauri-apps/tao/issues/1345)). Alt sınıf
  tao'nun sürümünden bağımsız önce çalışıyor; Tauri güncellendiğinde de kalmalı.

**Ölçüldü** (yalıtılmış örnek, kurulu uygulama açıkken):

| | Düzeltmeden önce | Sonra |
|---|---|---|
| Sürüm yapısı, gerçek `RmShutdown` | `0xc0000409`, 2018 ms | rc=0, 46–87 ms |
| Arayüz kaydı | yapılmadı | 5–14 ms; `workspace.json` ve ekran çıktısı istekle aynı anda |

Pencere gizliyken ("arka planda kal") sonuç aynı; kabuk, conhost ve WebView2
süreçlerinin hepsi kapandı, arkada süreç kalmadı.

Tepsi simgesi süreç içinden ölçüldü (yalnızca karalama kopyasında): tepsinin
penceresi `cleanup_before_exit`te yok ediliyor ve tray-icon'un `Drop`u ondan
önce `NIM_DELETE` yapıyor, hata yazmadı. Dışarıdan ölçmek işe yaramadı:
`Shell_NotifyIconGetRect` zorla sonlandırılmış, kesin hayalet bırakan süreçte de
"yok" diyor, UI Automation da taşma panelini kapalıyken görmüyor. Bu yüzden
eski yapıdaki hayalet simge yeniden ölçülemedi; kodda tao çökmeden önce
Tauri'nin çıkış temizliğini de çalıştırıyor, 0.2.1'de simge o yolda da kalkıyor
olabilir.

**Testler.** [`session_end_tests.rs`](src-tauri/src/session_end_tests.rs)
gerçek tao döngüsüyle koşuyor (`tauri_runtime_wry::tao`, Tauri'nin kullandığı
sürüm; Windows'a özel sınama bağımlılığı). İstek başka iş parçacığından,
Restart Manager gibi yanıt beklenerek gidiyor (soru → iptal → son), ardından
bir kullanıcı olayı. Yakalama kaldırılınca iki test üretimdeki iletiyle, aynı
satırda düşüyor (denendi). Diğer ikisi beklemenin süre sınırını tutuyor: yanıt
vermeyen sayfa ve hiç boşalmayan kuyruk. [`lib/sessionEnd.test.ts`](src/lib/sessionEnd.test.ts):
olay adı iki tarafta aynı, onay kayıttan sonra gidiyor (sıra ters çevrilince
düşüyor, denendi), kayıt düşse de onay gidiyor.

**Elle tekrar:** [`calistir/oturum-sonu.ps1`](.claude/skills/calistir/oturum-sonu.ps1),
kullanımı `calistir` skill'inde. Geliştirme yapısı konsol alt sistemli ve
Restart Manager onu `Console` sayıp ileti göndermiyor; orada `-Mode ileti`.
Gerçek `RmShutdown` (`-Mode api`) için sürüm yapısı gerekiyor.

### 2.7 Fark penceresinin açık uçları

§1.23'ün bilinçli olarak dışarıda bıraktıkları, IntelliJ'den farklar:

- **Birleşik görünümde ve daraltılmış parça varken yazılamıyor** (IntelliJ'de
  yazılıyor): yazı alanının satırları bölmeninkilerle örtüşmüyor. Kalem önce
  yan yana / açık görünüme geçiyor.
- **Ana pencere kapanırken** fark penceresi Rust'tan yok ediliyor
  (`CloseRequested` yok): son 400 ms içinde yazılıp kaydedilmemiş olan gidiyor.
- **UTF-8 olmayan dosya** (kayıplı çözülmüş) ancak kayıtta anlaşılıyor
  (`not-text` bandı); yazmaya izin vermeden önce sezilmiyor.
- **Geri alma geçmişi dosya başına ve geçişte siliniyor**; IntelliJ belge
  başına tutuyor.
- Yazma Windows'ta (WebView2) denenmedi; hizalama Chromium'da ölçüldü.
- **Sözdizimi renklendirmesi yok** — IntelliJ'de var. Hafif bir sözcükçü
  (yorum, dize, sayı, anahtar sözcük; renkler terminal paletinden) en makul yol;
  `FileViewer`'daki "renklendirici yok" kararıyla birlikte tartışılmalı.
- **"Align Changes in Side-by-Side Diff" yok** (dişli menüsünde): karşılıklı
  satırları boş dolguyla hizalayan kip. Satır modeli (`buildRows`) dolgu
  satırını taşıyabilecek biçimde, eklenmesi orada.
- **Stash farkları pencerede açılmıyor**; yalnızca çalışma ağacı değişiklikleri.
- **Pencere boyu hatırlanmıyor** (ana pencerenin %90'ı); IntelliJ boyutu saklıyor.
- **Ana pencere kapanınca fark pencerelerinin kapanması gerçek uygulamada
  denenmedi** (kod yolu `on_window_event`, yalnızca kaynak kuralı testli).
  Windows'ta (WebView2) pencere hiç denenmedi; macOS'ta denendi.

### 2.8 Dosya paneli ve içerik aramasının açık uçları

Bkz. §1.25.

- **Görüntüleyicide dosya içi arama yok.** "Terminalde ara" kısayolu açık dosya
  varken paneli kapatıp terminalde arıyor; dosyanın içinde ⌘F/Ctrl+F ile
  aramak ayrı bir iş (eşleşme işareti hazır: `.viewer-mark`).
- **İki arama iki ayrı dosya kümesine bakıyor.** Ad araması (`files::list`)
  `.gitignore`ı okumuyor, içerik araması (depoda) okuyor: `.env` adla
  bulunuyor, içinde aranmıyor. Ad aramasını da `git ls-files`e bağlamak
  tutarlı olurdu; Ctrl+P'nin bilinen davranışını değiştirdiği için yapılmadı.
  "Yok sayılanları da ara" seçeneği de yok.
- **Değiştir (replace) yok**; yalnızca arama.
- **Sağ panel açıkken görüntüleyici dar** (terminalin genişliği). Katmanı sağ
  panelin üstüne de taşımak düşünüldü; panel dört satıra yayıldığı için
  yarısı örtülüp yarısı görünürdü.
- **Gerçek uygulamada denenmedi**: tarayıcı düzeneğinde ve ekran dışı
  WKWebView'de doğrulandı. Windows'ta (WebView2) ve Ctrl+Shift+G hiç
  denenmedi.
- Görüntüleyici dosyanın ilk 512 KB'ını gösteriyor, arama 2 MB'a kadar
  bakıyor: aradaki eşleşmede görüntüleyici "satır gösterilen kısmın dışında"
  diyor; o satıra gitmenin yolu yok.

### 2.9 Windows'ta dışarıdan dosya bırakmak — DENENMEDİ

**Şüphe.** Gezgin'den N-Terminal penceresine bir dosya bırakılınca WebView2
dosyayı açıp arayüzün yerine koyabilir; arayüz uygulama yeniden başlayana dek
gider. Sebep: `dragDropEnabled: false` iken Tauri yakalayıcı takmıyor ve wry
`SetAllowExternalDrop(false)`ı YALNIZCA yakalayıcı varken çağırıyor
(`wry/src/webview2/mod.rs`), yani dışarıdan bırakmayı WebView2 kendisi
işliyor. Sayfada dosya bırakmayı karşılayan bir işleyici, Rust'ta da gezinmeyi
sınırlayan bir şey (`on_navigation`) yok.

**macOS'ta ölçüldü (8 Ekim): sorun yok.** Ekran dışı WKWebView'de sayfa
`dragover`da `Files` türünü görüyor ama WebKit bırakmayı reddediyor (işlem 0)
ve sayfa yerinde kalıyor.

**Denemesi:** Windows'ta bir dosyayı (.txt, .png) Gezgin'den pencerenin
herhangi bir yerine bırak; arayüz dosyayla değişirse doğrulanmış olur.

**Düzeltme önerisi:** sayfa genelinde, YALNIZCA dosya sürüklemelerinde
(`dataTransfer.types` içinde `Files`) `dragover`da `preventDefault()` +
`dropEffect = "none"`, `drop`ta `preventDefault()`. İç sürüklemeler (sekme,
grup, favori) `Files` taşımadığı için etkilenmez; düzeltmeden sonra onları ve
mac'teki davranışı yeniden dene.

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

**Çalışan geliştirme uygulamasında Rust tarafı eski kalabilir.** Arayüz Vite ile
canlı yenileniyor; Rust ise yalnızca uygulama YENİDEN başlatılınca yeni ikiliye
geçiyor. Belirti: yeni bir komut çağrılınca `Command git_stash_push not found`
(Tauri'nin "kayıtlı değil" iletisi) — oysa komut kaynakta kayıtlı, testler yeşil ve
düğme ekranda. Gerçekten yaşandı: kullanıcı Stash'e bastı, açık uygulama saatler
önce derlenmiş bir ikiliyle çalışıyordu. Kod hatası sanmadan önce üç şeye bak:
`ps -o lstart= -p <pid>` (sürecin başlangıcı), `stat target/debug/nterminal`
(derleme zamanı) ve `strings target/debug/nterminal | grep <komut>` (komut ikilide
var mı). Çözüm uygulamayı kapatıp `npm start`. Uygulamayı BAŞKA bir süreç ya da
oturum başlattıysa öldürme: içinde kullanıcının sekmeleri ve kabukları var.
`cargo test` de `target/debug/nterminal`i yeniden üretiyor (`tests/` dizini
olduğu için ikili de derleniyor); çalışan sürece dokunmuyor ama bir sonraki
başlatma yeni ikiliyi alıyor. Tersi de ısırıyor: `cargo test --lib <süzgeç>`
ikiliyi ÜRETMİYOR. Rust'ı değiştirip yalnızca `--lib` koşan biri elle denemede
eski ikiliyi çalıştırır (§2.6'da oldu: diskte düzeltmenin önceki hâli
kalmıştı); elle denemeden önce `cargo build`.

Yeniden başlatırken ikinci tuzak: `npm start` `Port 5273 is already in use` ile
düşebiliyor (`vite.config.ts` `strictPort: true`, `tauri.conf.json` `devUrl`
sabit). Portu çoğu zaman başka bir oturumun eskiden başlattığı Vite tutuyor ve o
oturumun uygulaması da ona bağlı. Öldürmeden önce sahibine bak
(`lsof -nP -iTCP:5273 -sTCP:LISTEN`, sonra `ps -o ppid=` zinciri ve
`CLAUDE_CODE_SESSION_NAME`); kullanıcıya söyle. Uygulamanın eski kalmasının
sebebi de çoğunlukla buydu: ikili `tauri dev` olmadan doğrudan çalıştırılmış,
yani Rust'ı izleyip yeniden başlatan izleyici yoktu.

Tersi: `tauri dev` çalışırken `src-tauri` altındaki HER dosya değişikliği
(`*_tests.rs` ve düzenleyicinin `*.tmp.<pid>` geçici dosyaları dâhil) "File …
changed. Rebuilding application…" ile uygulamayı yeniden derleyip yeniden
başlatıyor; kullanıcı o sırada çalışıyorsa penceresi yenilenir, süren komutlar
ölür (çalışma alanı geri yüklenir). Rust dosyasına dokunmadan önce
`ps -ax | grep "tauri dev"` ile bak, dokunacaksan değişiklikleri tek seferde yap
ve söyle. `cargo test` yalnızca `target/`a yazdığı için izleyiciyi tetiklemiyor.

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

**Kabuk profilindeki genel değişkenler pakete sızıyor.** `~/.zshrc`deki
`export APPLE_SIGNING_IDENTITY="CopyBoard Dev"` başka bir proje içindi ama Tauri
onu her `tauri build`de okuyor ve `bundle.macOS.signingIdentity`nin önüne
koyuyor: NTerminal paketleri CopyBoard'un sertifikasıyla imzalanıyordu, kurulum
öncesi DMG'ye bakan `codesign -dvv` gösterince fark edildi. Claude oturumlarının
Bash aracında değişken YOKTU; yani aynı komut aracın içinden imzasız,
kullanıcının terminalinden CopyBoard imzalı paket üretiyordu. `npm run bundle`
artık değişkeni devralmıyor (`scripts/run.mjs` → `macSigningEnv`); `npx tauri
build`ı doğrudan koşan hâlâ devralır.

**Platform yapılandırması dizileri birleştirmiyor.** `tauri.macos.conf.json`
temel dosyanın üstüne JSON Merge Patch (RFC 7396) ile biniyor: nesneler alan
alan birleşiyor ama `app.windows` gibi DİZİLER olduğu gibi değişiyor. Mac
dosyası pencereyi yalnızca kendi üç farkıyla yazdığı için 30 Ağustos'tan beri
mac'te `dragDropEnabled: false`, başlık, boyut, asgari boyut ve koyu açılış
yoktu. Belirti "gruplar mac'te sürüklenmiyor" oldu: açık kalan yakalayıcı
yüzünden wry sürüklemeyi WKWebView'e hiç iletmiyor; sürükleme başlıyor ama
sayfaya `dragover`/`drop` gelmiyor (sekme ve favori sürüklemesi de aynı yoldan).
Platform dosyası pencerenin TAMAMINI yazmalı; temel pencerede bir değer
değişince mac dosyası da değişmeli — `tauriConfig.test.ts` ikisini bağlıyor.
Çalışan uygulamada denetim: pencerenin başlığı (Pencere menüsü, AX) "Tauri
App" ise pencere tanımı uygulanmıyor demektir.

**Sürüklerken düzen değişmemeli.** WebKit (macOS) sürüklemeyi başlatmadan önce
sürüklenen öğenin hâlâ fare basılan noktada olduğuna bakıyor; `dragstart`ta
eklenen bir öğe onu kaydırırsa sürüklemeyi sessizce iptal ediyor
(`dragstart`ın hemen ardından `dragend`). Başlasa bile kayan satırlar yüzünden
tutulup yerinde bırakılan öğe başka yere düşüyor — ikisi de ölçüldü: kenar
çubuğu her grubun sonuna bir bırakma alanı ekliyordu. Artık sürükleme hiç öğe
eklemiyor, listenin sonu "Sekme ekle" satırı; `dnd.test.tsx` öğe sayısını
bağlıyor. Sürüklenene yalnızca yerleşimi değiştirmeyen stil (opaklık) ver.

**Terminale yazılan metin yeniden ölçülendirmeye uyum sağlamaz.** Ortalanmış
ya da tam genişlikte bir şey çizilecekse tampona yazmak yerine DOM katmanında
çizilmeli (`TerminalBlocks` bunu yapıyor).

**Elle tutulan listeler.** Yeni bir ayar satırı `data-setting` taşımalı ve
`settingsIndex.ts` içine yazılmalı; yeni bir metin iki dilde tanımlanmalı ve
kullanılmalı. Üçünün de testi var ve düşen test "bir liste güncellenmedi"
demek, "kod bozuk" değil.

**Kuyruğa giden çağrıyı eşzamanlı `expect` göremez.** Git yazma işlemleri
`gitWrite` kuyruğunda mikro-görev olarak `api`ye gidiyor. "Şu çağrılmadı" diyen
bir test `fireEvent`ten hemen sonra `expect` yaparsa çağrıdan ÖNCE çalışır ve
koruma kalksa bile geçer; `await act(async () => {})` ile bekle. Aynı sebeple
"ikinci tetikleme yok sayılıyor" testi ilk işlem SÜRERKEN saymamalı: koruma
kalkınca da ikinci işlem kuyrukta bekler ve sayı 1 görünür. İlkini bitirip
kuyruğun boşalmasını bekle, SONRA say. İkisi de mutasyonla (koruma kaynakta
bozulup testin düştüğünü görerek) yakalandı; test yazarken bu denetimi yap.

**Modül düzeyindeki kuyruk testler arasında sızıyor.** `gitWrite` kuyruğu
`useStore.ts` modülünün değişkeni; bir testin çözülmemiş bıraktığı söz sonraki
her testin yazma işlemini sonsuza dek bekletiyor ve hata kırılan testte değil
ilgisiz bir testte görünüyor. `gitCommit.test.tsx` bekleyen sözleri `afterEach`te
çözüyor; elle çözülen yeni bir söz kuruyorsan aynı yardımcıyı (`bekleyen`)
kullan.

---

## 4. Doğrulama

```bash
npm test
```

TypeScript tip denetimi + vitest + cargo. Rust testleri doğrudan `cargo test`
ile koşulamıyor (bkz. `scripts/win-env.ps1`). Ayrıntı ve sık düşen testlerin
anlamı için `.claude/skills/testler/SKILL.md`.

Son ölçüm (4 Ekim, fark penceresinde ve görüntüleyicide düzenleme, macOS,
`--dir src`): **1833 arayüz testi** (111 dosya; 1832 geçti, 1 atlandı),
**270 Rust birim + 13 entegrasyon testi**, tip denetimi temiz. Atlanan
`tauriConfig.test.ts` › "şablon kurulu Tauri CLI'nin şablonundan kaymamış": WiX
şablonu yalnızca CLI'nin Windows derlemesinde var, mac'te ve CI'ın ubuntu işinde
"uygulanamaz"; denetim CI'da Windows paket işinin ayrı adımı. (30 Eylül,
Windows: 1710 / 104 dosya, 268 + 13.)

Sayıyı depo DIŞINDAKİ testler şişirebiliyor: `npx vitest run` ana checkout'ta
`.claude/worktrees/` altındaki iç içe worktree'lerin test dosyalarını da topluyor
(git onları yok sayıyor ama vitest saymıyor). Bu ölçümde 91 dosya daha geliyordu ve
bir oturum bir süre 2889 test bildirdi. Gerçek sayı için yalnızca izlenen dosyaları
içeren bir kopyada ya da `--exclude '.claude/**'` ile koştur; worktree'lerden biri
yarım işteyse ana paket de onun yüzünden düşebilir.
