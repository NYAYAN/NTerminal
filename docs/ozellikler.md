# Özellikler ve kullanım

N-Terminal'in her özelliğinin ayrıntılı anlatımı: ne yapıyor, nasıl kullanılıyor ve
neden öyle davranıyor. Kısa tanıtım ve kurulum için [README](../README.md).

- [Ne yapar](#ne-yapar)
- [Kabuk entegrasyonu](#kabuk-entegrasyonu)
- [Tema okunabilirliği](#tema-okunabilirliği)
- [Veri dosyaları](#veri-dosyaları)
- [Ayarları başka makineye taşımak](#ayarları-başka-makineye-taşımak)
- [Ayarlar penceresi](#ayarlar-penceresi)
- [Düğmeler](#düğmeler)
- [Klavye kısayolları](#klavye-kısayolları)

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

**Grup düzeni.** Kenar çubuğunun başlığındaki **Grupları Daralt** / **Grupları Aç**
düğmesi bütün grupları tek tuşla toplar veya açar (biri bile açıksa hepsi
kapanır, hepsi kapalıysa hepsi açılır). Aynı eylem grup sağ tık menüsünde de
var. Gruplar favori işaretlenebilir (sağ tık → *Favori Gruba Ekle* ya da
satırdaki yıldız) ve yıldız süzgeciyle yalnızca favoriler listelenir — çok
grupla çalışırken
listeyi kısaltmak için. Süzgeç açıkken **etkin grup favori olmasa da listede
kalır**; aksi hâlde çalıştığınız yeri gözden kaybediyorsunuz. Başlık çubuğunun
sol köşesindeki panel düğmesi kenar çubuğunu tümden daraltır — terminale bütün
genişliği bırakmak için. Durum ayarda tutuluyor, yani uygulama onu hatırlıyor.

**Gruplanmamış sekmeler.** Bir sekmenin gruba ait olması zorunlu değil. Kenar
çubuğunun **boş yerine sağ tık** → *Yeni sekme*; sekme
listenin en üstünde, başlıksız düz bir bölümde açılıyor — tıpkı bir dosya
yöneticisinde köke bırakılmış dosyalar gibi. Aynı menüde yeni grup, tümünü
daraltma ve favori süzgeci de var.

Bölümün başlığı YOK ve bu bilinçli: başlık bir grubun kimliği (ad, renk,
yıldız, katlama oku, sayı) ve "gruplanmamış" yazan bir başlık koymak onu yine
bir gruba çevirirdi. Süzgeç açıkken de kayboluyor değil — kova favori
işaretlenemediği için süzgeç onu elese sekmeler bir daha bulunamazdı. Son
sekmesi kapanınca bölüm kendiliğinden gidiyor. Bir sekmeyi gruba almak ya da
gruptan çıkarmak: sürükle-bırak, ya da sağ tık → *Gruba taşı*.

**Kabuk rozeti.** Sekme adının solunda hangi kabuğun çalıştığını söyleyen kısa
kod duruyor: `PS7`, `PS`, `CMD`, `SH`, `WSL`, `ZSH`. *Ayarlar › Görünüm ›
Sekmeler* altından kapatılabilir — tek profille çalışırken her satırda aynı şeyi
tekrarlıyor ve dar kenar çubuğunda sekme adına ayrılan yeri yiyor. Rozet
sekmenin **gerçekte açtığı** kabuğu gösteriyor: profil silinmiş ya da ayarlar
sıfırlanmışsa kimlik boşa düşüyor, kabuk varsayılan profille açılıyor ve rozet
de onu yazıyor (eskiden burada `?` çıkıyordu).

**Claude Code.** Sekmede `claude` çalışırken rozetin yerinde Claude Code'un
açılışta terminale çizdiği turuncu maskot duruyor; komut bitince kabuk rozeti
geri geliyor. Rozet kapalıyken de çiziliyor, çünkü kabuğun türünü değil sekmede
o an ne çalıştığını söylüyor. Tanıma kabuk entegrasyonunun bildirdiği komut
metnine bakıyor (`claude`, yoluyla ya da `npx @anthropic-ai/claude-code`);
takma adla (`alias c=claude`) başlatılan Claude tanınmıyor.

**Menüler.** Sağ tık menülerinde uzun listeler alt menüde açılıyor: on beş
grubu olan bir kullanıcıda "Gruba taşı" altındaki düz liste menüyü uzatıp
"Sekmeyi kapat"ı ekranın dışına itiyordu. Alt menü sağda yer yoksa sola
açılıyor.

**Sürükle-bırak.** Sekmeler hem sekme çubuğunda hem kenar çubuğunda
sürüklenerek yeniden sıralanır. Kenar çubuğunda bir sekmeyi başka bir grubun
üstüne bırakmak onu o gruba taşır. **Gruplar da** başlıklarından tutulup
sürüklenerek sıralanır. Bırakma konumu ince bir çizgiyle gösteriliyor; imleç
öğenin ilk yarısındaysa öncesine, ikinci yarısındaysa sonrasına bırakılır.
Aynı hedefe iki tür sürükleme geldiği için (sekme mi grup mu) hangisinin
taşındığı ayrı izleniyor; sekme sürüklerken grup sırası değişmiyor.

> Sürükle-bırak Tauri'nin `dragDropEnabled` ayarı kapalı olmadan **çalışmıyor**:
> açıkken webview'e işletim sistemi düzeyinde bir dosya-bırakma yakalayıcısı
> takılıyor ve o yakalayıcı sayfa içindeki HTML5 sürükleme olaylarını yutuyor.
> Kodda hiçbir belirti vermeyen bir sessizlik; bu yüzden yapılandırma testle
> bağlı (`src/lib/tauriConfig.test.ts`).

**Sekme kilidi.** Sürekli açık kalması gereken sekmeler kilitlenebilir
(`Ctrl+Shift+L` ya da sağ tık → *Kilitli*). Kilitli sekmede kapatma düğmesinin
yerini kilit simgesi alıyor; kapatma düğmesi, orta tuş, `Ctrl+W`, *diğerlerini
kapat* ve grup silme — hepsi reddediliyor. Kilit bir onay penceresi değil: tek
tıkla aşılabilen bir kilidin koruma değeri olmaz, kapatmak için önce kilidi
kaldırmak gerekiyor. Kilit durumu çalışma alanıyla birlikte kaydedilir ve
aktarıma dahildir.

**Kapatma onayı.** Sekme kapatılırken varsayılan olarak onay sorulur —
yanlışlıkla çarpıya basmaya karşı. Ayardan "yalnızca komut çalışıyorsa" ya da
"hiç sorma" seçilebilir. *Diğerlerini kapat* sekme başına değil tek bir onay
sorar. Kilit ve onay birbirinin yerine geçmiyor: onay bir tıklama daha ister,
kilit kapatmayı tümden reddeder.

**Silme her zaman sorar.** Grup silme, favoriden kaldırma (menüden ya da
yıldızı kapatarak), geçmişten kayıt silme, geçmişi temizleme, profil silme,
ortam değişkeni silme ve ayarları sıfırlama — hepsi onay istiyor. Yıldızı
kapatmak bir anahtar gibi görünüyor ama favoriyi **siliyor**: kısa ad, not ve
klasör bilgisi de gidiyor, geri tıklamak onları getirmiyor. Boş bir grup da
soruyor; "boş" olması silmenin geri dönüşü olduğu anlamına gelmiyor.

Ekleme yıkıcı olmadığı için soru sormuyor, ve yapılamayacak bir işlem için de
sormuyor (son grup, son profil) — olmayacak bir şey için onay istemek
yanıltıcı. Onay grup silme ve favori kaldırmada **deponun içinde**: silme yolu
birden fazla olabiliyor (menü, kısayol, komut paleti) ve onayın her birinde
tekrarlanması kaçınılmaz olarak birinde atlanmasıyla sonuçlanıyor.

Onay penceresi uygulamanın kendi penceresi, `window.confirm` değil: webview'ün
yerleşik iletişim pencereleri temayı ve dili taşımıyor, ana iş parçacığını
bloklayabiliyor ve gömülü webview'de hiç görünmeme riski taşıyor. Onay
penceresinin görünmemesi korumanın tümden kaybı demek — o yüzden davranışı
testle bağlı: karar çağırana doğru ulaşıyor mu, ikinci bir istek gelince ilk
bekleyen asılı kalıyor mu, Esc/Enter ne yapıyor.

**Favori komutlar.** Sık kullandığınız komutlar yıldızlanıp ayrı bir listede
tutulur — geçmişten ayrı, çünkü geçmiş otomatik birikip sınır aşılınca budanıyor.
Favoriye kısa bir ad, not, klasör ve "yalnızca şu grupta görünsün" kısıtı
verilebilir; sıralaması elle ayarlanır. Tıklamak komutu yalnızca istem satırına
yazar, klasör değişmez; çalıştırınca (çift tık ya da ▶) klasör tanımlıysa önce o
klasöre geçilir. Favoriye bir kısaltma da verilebilir (ör. `nrb`): komut kutusuna
yazıp Enter'a basınca favorinin komutu terminalin bulunduğu klasörde çalışır,
favori bir gruba bağlı olsa da her grupta. Bir komut yalnızca bir kez favori
olur: zaten favoride olan bir komutu formdan yeniden eklerken form bunu söyler
ve **Mevcut favoriyi düzenle** düğmesi yazdıklarınızı var olan kayda taşır
(kaydetmek yine sizde). `Ctrl+Shift+B` panelini açar, komut
paletinde de doğrudan çalıştırılabilir. `Ctrl+R` hızlı çağırmada favoriler **varsayılan olarak
gelmiyor** — o pencerenin sorusu "bu sekmede ne çalıştırdım" ve hiç
çalıştırılmamış bir favori listenin başını tutuyordu; penceredeki
**Favoriler** tiki (`Ctrl+F`) onları listenin başına geri getiriyor.

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

**Sağ panel terminalin üstünde.** Geçmiş, Favoriler ve Değişiklikler sekmeli
sağ panel, Dosyalar paneli gibi terminalin **üstünde**, sağ kenarında açılır:
terminal daralmaz, kabuk ekranı yeniden çizilmez; bağlam çubuğu ve komut satırı
tam genişlikte kalır. İkisi birden açıkken Dosyalar sağ panelin soluna kadar
uzanır, birbirlerinin üstüne binmezler.

**Değişiklikler.** Sağ panelin *Değişiklikler* sekmesi bulunulan dizin bir git
deposuysa değişen dosyaları listeliyor; farklar **yerinde**, listeyi
kaybetmeden açılıyor. Satırlar **kapalı** geliyor: liste önce dosya adlarını
gösteriyor, bir satıra tıklamak farkını açıyor, başlıktaki düğme hepsini açıyor
ya da topluyor. Fark yalnızca satır açılınca isteniyor; yani elli dosyalık bir
değişiklik elli `git diff` ile başlamıyor. "Hepsini aç" ise hepsini birden
istiyor ve istekler dörtlü bir kuyruktan geçiyor — yüz dosyalık bir değişiklikte
yüz `git` sürecini aynı anda doğurmak makineyi ölçülebilir biçimde takıyor.
Uzun satırlı bir farkı sağa kaydırınca eklenen ve silinen satırların zemini
satırın sonuna kadar uzanıyor.

**Değişmemiş satırları açma.** `git diff` yalnızca değişenlerin çevresinde üç
satır bağlam veriyor; gerisi çizilmiyor. Blokların arasında "**59 değişmemiş
satır**" yazan bir şerit duruyor ve solunda, satır numarası sütunuyla aynı
genişlikte bir düğme bloğu: yukarı ok satırları şeridin üstünde, aşağı ok
altında açıyor, her basış elli satır. Kalan bundan azsa iki yana açılan tek bir
ok kalıyor, boşluk tükenince şerit kayboluyor.

Satırlar dosyanın kendisinden geliyor — `git diff -U<n>` ile daha geniş bağlam
istemek her bloğun **iki** yanını birden açardı, oysa istenen yönlü açma.
Şeridin sağında hunk başlığının tek özgün parçası duruyor: kapsayan işlevin
adı. ("Gizli" değil "değişmemiş": satırlar saklanmıyor, yalnızca değişmedikleri
için gösterilmiyorlar.)

Farkın başındaki künye (`diff --git a/… b/…`, `index …`, `--- a/…`, `+++ b/…`)
çizilmiyor: dosya adı satırın başlığında zaten yazıyor ve o dört satır dar bir
panelde görünenin üçte birini yiyordu. Ayrım "meta mı" değil **"başka yerde
yazıyor mu"** — `Binary files … differ`, `rename from/to`, `similarity index`
ve `old/new mode` duruyor, çünkü tek kaynakları o satırlar (ikili dosyada farkın
tamamı o bildirim; yeniden adlandırmada eski ad başka hiçbir yerde yok).

**Satırın düzeni.** Değişiklik sayacı (`+15 -1`) dosya adının hemen yanında —
bir sıfat gibi okunuyor. Önceki hâlinde satırın sağ ucundaydı ve hangi dosyaya
ait olduğunu bulmak için göz yatay kaymak zorundaydı. Sağ uç eylemlerin: yolu
kopyala, değişiklikleri geri al, dosyayı aç. Üçü de **her zaman görünür** —
gizli bir eylem, bir kez keşfedilene kadar yok demek; ağırlıkları düşük
tutuluyor ve satırın üzerine gelince öne çıkıyorlar.

Durum, satırın başındaki renkli bir **simge**: kalem değişti, artı eklendi, eksi
silindi, ok yeniden adlandırıldı, kesik çizgili artı takipsiz. Metin ipucunda ve
ekran okuyucuda duruyor. Önceki hâli yazıydı ("DEĞİŞTİ", "YENİDEN
ADLANDIRILDI") ve 88px'lik sabit bir sütun tutuyordu; o sütun dosya **yolundan**
çıkıyordu, yani dar panelde asıl aranan bilgi kırpılırken yerinde her satırda
tekrarlanan aynı kelime duruyordu.

**Commit ve push.** Panelin başındaki kutu, terminale dönmeden commit atmayı ve
göndermeyi sağlıyor. Her satırın solundaki **kutu** dosyayı commit'e ekler
(`git add`), kaldırınca çıkarır (`git reset`; dosyaya dokunmaz). Üç hâli var:
işaretli (dosyanın tamamı eklendi), işaretsiz ve **ara** — dosya *kısmen*
eklenmiş (`MM`): commit'e yalnızca eklenen kısım girer, kutuya basmak kalanı da
ekler. Dosyaların üstündeki tablo başlığında, satır kutularıyla aynı sütunda
bir toplu kutu durur: hepsini ekler ya da çıkarır; başlığın sağı kaç dosyanın
commit'e gireceğini yazar. Commit kutusunda düğmelerin solunda bulunduğunuz dal
görünür (ipucu Push'un hedefini, örneğin `main → origin/main`, söyler).

İleti alanına yazıp **Commit**'e ya da `Ctrl+Enter`'a (mac'te `Cmd+Enter`)
basmak yalnızca eklenen dosyaları commit'ler. `-a` yok: işaretlemediğiniz dosya
gitmez. Dosya seçilmemişse ya da ileti boşsa düğme kapalı ve ipucu ilk eksiği
söylüyor. Yarım kalmış ileti panelin sekmesi değişince ya da başka bir dizine
geçince kaybolmaz (depo başına saklanır); commit atılınca silinir, atılamazsa
**korunur**.

**Push** yalnızca geçerli dalı gönderir. **Etiket göndermez** — bu depoda `v*`
etiketi itmek yayın demek — ve zorla itme yoktur; `push.followTags` ayarınız
açık olsa bile. Dalın yukarı akışı yoksa (yeni dal ya da uzaktan silinmiş) düğme
**Yayınla** der: dalı uzakta oluşturur ve izlemeyi kurar. Uzak sizden ilerideyse
düğmeye basmadan önce uyarır. Değişiklik yokken bile gönderilmemiş commit varsa
panelde "N commit gönderilmedi" satırı ve Push görünür — commit'leri itmek için
değişiklik olması gerekmez. Panele giden rozet de kaybolmaz: komut satırının
üstündeki şeritte git deposundayken her zaman `± N` durur — değişiklik yoksa
soluk renkte `± 0`. Tıklamak paneli açar; gönderilmemiş commit varsa ipucu
sayısını söyler.

Neyin gideceği göndermeden önce görünür: **Push** (ya da **Yayınla**) hemen
göndermez, düğmenin altında bir onay paneli açar. Panel Push'un göndereceği
commit'leri (yukarı akışın önündekiler; yayınlanacak dalda hiçbir uzakta
olmayanlar) en yeni başta sıralar — ileti, altında kısa karma, yazar ve zaman.
Commit'e tıklamak dosyalarını, dosyaya tıklamak farkını açar (birleştirme
commit'i ilk ebeveynine göre). Paneldeki **Push** gönderir (odak oradadır,
`Enter` yeter); **Vazgeç**, `Esc` ya da panelin dışına tıklamak göndermeden
kapatır. En üstteki (son) commit'in yanındaki geri alma oku **Commit'i geri
alır** (IntelliJ'deki "Undo Commit", `git reset --soft`): commit kalkar ama
içindeki değişiklikler silinmez, eklenmiş hâlde Değişiklikler listesine döner
ve iletisi commit kutusuna gelir (kutuda yazılmış bir ileti varsa ona
dokunulmaz). Yalnızca henüz gönderilmemiş son commit geri alınır; uzaktaki bir
commit ya da deponun ilk commit'i reddedilir.

Hata **kalıcı** ve kutunun içinde: git'in kendi metni satır sonlarıyla, olduğu
gibi gösterilir. Bir commit kancasının (lint, test) ya da reddedilen bir
push'un çıktısı üç saniyelik bir bildirimde okunmaz. Kancalar atlanmaz
(`--no-verify` yok).

Fark artık `HEAD`e karşı alınıyor: eskiden çalışma ağacını indeksle
karşılaştırıyordu ve bir dosya eklenince satırın farkı boş çıkıyordu.

**Farkı yeni pencerede göster.** Satırın sağındaki bölünmüş pencere simgesi
farkı IntelliJ / WebStorm'daki gibi ayrı bir pencerede açar: solda `HEAD`
(salt okunur, başlıkta commit'in kısa kimliği ve dosyanın yolu), sağda
dosyanın güncel hâli; iki dosyanın tamamı yan yana, satır numaraları ortada,
değişen bloklar ortadaki eğri bağlayıcılarla birbirine bağlı. Renkler
IntelliJ'inkiler: eklenen yeşil, silinen gri, değişen mavi; değişen satırın
içinde değişen sözcükler koyu. İki taraf birlikte kayar. `F7` / `Shift+F7`
sonraki / önceki farka gider; son farktayken basmak doğrudan sıradaki
değişen dosyanın ilk farkına geçer (ilk farkta `Shift+F7` öncekinin sonuncusuna). Dosyalar arasında araç çubuğundaki oklar (mac'te
`⌃⇧←/→`, Windows'ta `Alt+Shift+←/→`) ya da "2/5 dosya" sayacı ile gezilir;
`Esc` pencereyi kapatır. **Sağ taraf düzenlenebilir**: araç çubuğundaki
kalem (**Düzenle**, `F4`, mac'te `⌘↓`) düzenlemeyi açar ve kapatır. Kapalıyken
sağ başlıkta solda olduğu gibi bir kilit durur (salt okunur); açıkken kalem
vurgu renginde ve çerçeveli, sağ başlıkta **✎ Düzenleniyor** yazar ve altında
vurgu çizgisi belirir. Açıkken sağ tarafa tıklayıp yazarsınız; fark yazdıkça
güncellenir ve yazmayı bıraktıktan kısa bir süre sonra dosyaya kaydedilir
(düzenlemeyi kapatınca, pencereden çıkınca, başka dosyaya geçince ya da pencere
kapanırken hemen). `Esc` önce düzenlemeyi kapatır, ikinci `Esc` pencereyi.
Kalemin yanındaki **Geri al**, **İleri al** ve **Kaydet** düğmeleri
`Ctrl+Z` / `Cmd+Z`, `Ctrl+Y` / `⇧⌘Z` ve `Ctrl+S` / `Cmd+S` ile aynı işi yapar. Enter
girintiyi korur, Sekme girinti ekler (`Shift+Sekme` siler); satır sonları
(LF / CRLF) dosyanın kendi biçiminde kalır. Sol oluktaki `»` o bloğu `HEAD`deki
hâline geri alır; `Ctrl+Z` / `Cmd+Z` hem yazdıklarınızı hem `»`ü geri alır
(art arda yazılan harfler tek adımda). Siz yazarken dosya başka bir yerde
kaydedilirse üzerine yazılmaz; pencere sorar: **Diskteki hâli yükle** ya da
**Benimkini kaydet**. Birleşik görünümde ve daraltılmış parça varken sağ taraf
yazılamaz; kalem önce yan yana / açık görünüme geçip imleci sağ tarafta o
satıra koyar. Satır sonları karışık, çok büyük (4 MB'tan
büyük) ya da ikili dosya burada yazılamaz; kalem onu ana penceredeki
görüntüleyicide açar. Pencere
açıkken fark canlıdır: dosyayı başka bir düzenleyicide kaydetmek ya da commit
atmak yarım saniye içinde pencereye yansır, pencereye tıklamak gerekmez. Araç
çubuğundan birleşik görünüme geçilir. Değişmemiş parçalar varsayılan olarak
daraltılmış gelir (dalgalı çizgiye tıklamak kademe kademe açar); araç
çubuğundaki düğme hepsini açar ya da yeniden daraltır, simgesi ve ipucu basınca
ne olacağını söyler. Okuduğunuz satır daraltıp açarken yerinde kalır; dişli menüsünde eş zamanlı
kaydırma, boşlukları yok sayma (baştaki/sondaki, bütün boşluklar, boş
satırlar da) ve vurgulama (sözcük / satır / bölünmüş / karakter / hiçbiri)
seçenekleri var; menü seçim yapınca kapanmaz, seçenekleri art arda denemek
için açık kalır.
Yeni ve takip edilmeyen dosyada tek editör görünür (o da yazılabilir), bütün
satırlar eklenmiş renginde. Fark penceresi tektir: açıkken başka bir dosyanın simgesine basmak
ikinci bir pencere açmaz, açık pencereyi öne getirip o dosyaya geçirir.
Kod iki tarafta da **sözdizimi renkli** (dosya görüntüleyicisiyle aynı
VS Code gramerleri ve tema renkleri): değişen sözcüğün koyu zemini renkli
harflerin altında kalır, yazarken de renkler yazdıkça güncellenir. Renkler
fark zeminlerinin üstünde de okunur kalacak kadar açılıp koyulaştırılır.

**Stash.** Değişiklikleri commit'lemeden kenara almak için commit kutusundaki
**Stash** düğmesi bir pencere açar: hangi dosyaların gideceğini seçersiniz,
isterseniz bir ad verirsiniz (IntelliJ / WebStorm'daki gibi). Pencere
Değişiklikler listesinde **işaretli** olan dosyalarla açılır — kısmen eklenmiş
(`MM`) dosya da dâhil; hiçbiri işaretli değilse seçim **boş** açılır ve "Tüm
dosyaları seç" kutusu var (boş bir Enter ile yanlışlıkla her şeyi kenara atmamak
için hepsini varsaymıyor). Penceredeki seçimi değiştirmek listedeki kutulara
dokunmaz. Dosya adlarının solundaki klasör yolu varsayılan olarak **gizli**;
"Klasör yollarını göster" kutusu — panel başlığındaki klasör düğmesiyle aynı
ayar — onu getirir. Takipsiz bir dosya seçilirse `--include-untracked`
kendiliğinden eklenir; seçilmeyen dosyaya dokunulmaz.

Stash'ler listenin en üstündeki **Stash** başlığının altında. Başlık depo
varken her zaman görünür (temiz bir çalışma ağacında da stash uygulanabilsin
diye), stash varsa sayısı yanında yazar ve varsayılan olarak **kapalı**. Açınca
her stash'in adı, dalı ve zamanı görünür; satıra tıklamak dosyalarını, dosyaya
tıklamak farkını açar (yalnızca okunur). Stash'teki dosyaların klasör yolu da
aynı **Klasör yollarını göster** ayarına uyar (varsayılan gizli). Uygula simgesinin ne yapacağını iki kutu
belirler: **Uyguladıktan sonra sil (pop)** ve **İndeksi geri yükle** (`--index`);
ikisi de varsayılan olarak kapalı. Kutular başlıkta sayacın solundaki **ayar
simgesine** basınca açılan küçük pencerede; dışarı basınca ya da `Esc` ile kapanır.
Bir seçenek açıkken simge vurgulu durur (kutular gizli olsa da belli olsun diye) ve
satırdaki uygula simgesinin ipucu ("Uygula ve sil") hangisinin geçerli olduğunu
söyler. **Silmek her zaman sorar**: stash silinince
geri getirilemez. Uygulamak sormaz — içerik silinmiyor, çalışma ağacına taşınıyor.
Çakışma olursa git stash'i silmez ve hata metni kalıcı bir kutuda gösterilir.
Dördüncü bir sekme olarak yazılmıştı ama panelin başlığına sığmadığı için
Değişiklikler'in içine taşındı.

**Dal seçici.** Dal rozetine tıklamak dalları listeler; birini seçmek
`git checkout`u kabuğa yazıp çalıştırır. **Yerel dallar** üstte durur. `git
fetch` ile gelen **uzak dallar** sayılarıyla birlikte "Uzak dallar" başlığının
altında, varsayılan olarak **kapalı**: başlığa tıklayarak (ya da klavyeyle
başlıkta Enter'a basarak) açılır ve uygulama açık kaldığı sürece açık kalır.
Arama kapalı bölümdeki eşleşmeleri de bulur. Bir uzak dalı seçmek `git checkout
--track origin/ad` gönderir; yerel bir izleme dalı oluşur.

**Dosya paneli.** Başlık çubuğundaki klasör düğmesi bulunulan dizinin ağacını
**terminalin üstünde**, sol kenarında açar — terminal daralmaz, kabuk ekranı
yeniden çizmez (önceden panel kendi sütunuydu ve açılınca terminali
sıkıştırıyordu). Sekme çubuğu, komut kutusu ve durum çubuğu görünür kalır;
ağaçta `Shift`+tıklama yolu komut kutusuna ekler. Bir dosyaya tıklamak onu
ağacın **yanında, terminalin kalan bütün genişliğinde** açar; ağaç yerinde
kalır, açık dosya ağaçta işaretlidir ve başka bir dosyaya tıklamak
görüntüleyiciyi değiştirir. **Değişen dosyalar ağaçta belli olur**: adı
Değişiklikler listesinin renginde (değişen sarı, yeni ve takip edilmeyen yeşil)
ve sağında aynı durum simgesi; içinde değişiklik olan klasörün sağında aynı
renkte bir nokta durur, klasörü açmadan nerede değişiklik olduğu görünür.
Görüntüleyicide kaydedilen dosya hemen işaretlenir. Görüntüleyicinin `×`'i yalnızca dosyayı, panelin
`×`'i ya da klasör düğmesi paneli kapatır. Panelin içindeyken `Esc` önce aramayı,
sonra paneli kapatır ve odak terminale (ya da komut kutusuna) döner;
düzenlerken basılan `Esc` paneli kapatmaz. Açık bir dosya terminali örtüyorsa
**Terminalde ara** kısayolu önce paneli kapatır. Aramadan ya da paletten açılan
dosyanın dalları ağaçta kendiliğinden açılır.

**Panelde arama.** Panel başlığındaki büyüteç bir kutu açar; üstündeki iki düğme
ne arandığını seçer: **Dosya** (dosya adlarında bulanık arama) ya da **İçerik**
(dosyaların içinde metin). Sonuçlar ağacın yerinde listelenir ve seçim listeyi
kapatmaz: dosya sağda açılır, liste solda kalır — eşleşmeler arasında tıklayarak
gezilir. İçerik kipinde sonuçlar dosyaya göre gruplu (başlığa tıklamak grubu
katlar), satır numarası ve işaretli eşleşmeyle gelir; tıklamak dosyayı **o
satırda** açar ve eşleşmeyi işaretler. Kutudan aşağı ok sonuçlara iner.

**Görseller.** PNG, JPEG, GIF, WebP, AVIF, BMP, ICO ve SVG görüntüleyicide resim
olarak açılır (macOS'ta TIFF ve HEIC de). Alandan büyük görsel **sığdırılır**,
küçüğü büyütülmez (bulanıklaşmasın); başlıkta piksel boyutu, o anki ölçek ve
dosya boyutu yazar. Görsele ya da başlıktaki düğmeye tıklamak **gerçek boyuta**
geçer (kaydırılabilir), ikinci tıklama geri sığdırır. Saydam alanlar dama
zeminde görünür. SVG önizlemeyle açılır; başlıktaki `</>` kaynağı gösterir
(düzenlenebilir), görsel simgesi önizlemeye döner — içerik aramasından açılan
SVG doğrudan eşleşmenin satırında, kaynakta açılır. 20 MB'tan büyük görsel
önizlenmez ve bu, boyutuyla birlikte söylenir; açılamayan biçim de (ör.
Windows'ta HEIC) boş bir alan değil, bir uyarı gösterir.

**Görüntüleyicide düzenlemek.** Panelde açılan dosya önce salt
okunur görünür. Başlıktaki kalem (**Düzenle**) düzenlemeyi açar: kalem vurgu
renginde ve çerçeveli olur, başlığın altında vurgu çizgisi belirir, satır
numaraları yanında yazabilirsiniz. Yanındaki **Geri al**, **İleri al** ve
**Kaydet** düğmeleri (`Ctrl+Z` / `Cmd+Z`, `Ctrl+Y` / `⇧⌘Z`, `Ctrl+S` / `Cmd+S`)
her zaman başlıkta; kaydedilmemiş değişiklik varken adın yanında vurgu renginde
bir nokta durur. Kayıt açık (düğme ya da kısayol); ama düzenlemeyi kapatırken,
başka dosyaya geçerken, dosyayı ya da paneli kapatırken kaydedilmemiş olan
kendiliğinden yazılır, kaybolmaz. Dosya siz düzenlerken başka bir yerde kaydedildiyse üzerine
yazılmaz: **Diskteki hâli yükle** ya da **Benimkini kaydet**. Satır sonları
(LF / CRLF) korunur. İkili, yarım megabayttan büyük ya da satır sonları karışık
dosya düzenlenemez; kalem kapalıdır ve üzerine gelince nedenini söyler.

**Sözdizimi renkleri.** Görüntüleyici kodu VS Code'un kendi gramerleriyle
renklendirir: anahtar sözcükler, dizeler, sayılar, yorumlar, işlev ve tür
adları, özellikler, HTML/JSX etiketleri ve öznitelikleri ayrı renklerde.
TypeScript, JavaScript, JSON, Markdown, C#, Java, Python, Go, Rust, C/C++, SQL,
PowerShell, kabuk betikleri, HTML/CSS, YAML, TOML, XML ve Dockerfile dahil
~80 dil dosya adından tanınır; tanınmayan dosya düz metin kalır. Renkler
seçili temanın geldiği editör temasından: N-Terminal Koyu/Açık GitHub'ın,
One Half Dark One Dark'ın, Solarized kendi renklerini, Windows Terminal VS
Code'un varsayılan koyusunu (Dark+) taşır. Renklendirme ayrı bir iş
parçacığında yapılır: dosya önce düz görünür, renkler birkaç yüz milisaniye
içinde gelir; arayüz ve terminal beklemez. Düzenlerken de renkler yazdıkça
güncellenir (bir yorum ya da dize açmak alttaki satırları da etkiler).

**Dosya arama (`Ctrl+P`).** Başlık çubuğunun ortasındaki kutu ya da kısayol,
bulunulan dizindeki dosyalarda bulanık arama açıyor. Enter dosyayı dosya
panelindeki görüntüleyicide açar, `Shift+Enter` yolu komut satırının sonuna ekler
(`code ` yazıp `Ctrl+P`). Satırda dosya **adı önde**, klasörü hemen yanında ve
soluk (Klasik tasarımda sağa hizalı): klasör zinciri çoğu satırda aynı, yani
ayırt etmeyen kısmı önce okutmak gözü boşuna yoruyordu. Eşleşen harfler vurgulu;
harfleri dağınık eşleşen dosyalar "Yakın eşleşmeler" başlığının altında. Kalıp da
yazılabilir: `*.tsx` yalnız tsx dosyalarını, `*.{ts,tsx}` ikisini,
`src/**/*.test.ts` src altındaki testleri getirir; kalıp metinle birlikte de
çalışır (`rail *.tsx`). Aynı kural dosya panelindeki aramada da geçerli. Satırın
başındaki simge dosyanın türü: yaygın türler kendi renginde kısa bir etiketle
(TS, RS, `{}` …), görseller resim simgesiyle; dosya panelindeki ağaçta da aynı
simgeler. Kutu
boşken liste **Değişenler**, **Son açılanlar** ve **Tüm dosyalar** diye
bölünüyor; `Alt+↑` / `Alt+↓` (mac'te `⌥↑` / `⌥↓`) bölümden bölüme atlar. Liste açılışta bir kez okunuyor,
süzme bellekte — her tuş vuruşunda binlerce dosyayı diskten geçirmemek için.

**Dosyaların içinde arama (`Ctrl+Shift+G`, mac'te `⌘⇧F`).** Aynı paletin ikinci
sekmesi: **Dosya içeriği**. Kutu ve sorgu iki sekmede ortak; `Tab` sekmeyi
değiştirir — adında bulamadığınızı içinde aramak için yeniden yazmanız gerekmez.
Sonuçlar dosyaya göre gruplu, satır numarasıyla ve eşleşmesi işaretli gelir;
`Enter` dosyayı **o satırda** açar (eşleşme işaretli), `Shift+Enter` yolu komut
satırına ekler. Kutunun sağındaki üç seçenek: **büyük/küçük harfe duyarlı**
(`Aa`, `Alt+C` / `⌥⌘C`), **yalnızca tam sözcük** (`Alt+W` / `⌥⌘W`) ve **düzenli
ifade** (`.*`, `Alt+R` / `⌥⌘R`; Rust `regex` sözdizimi, her satıra ayrı
uygulanır). Varsayılan büyük/küçük harf gözetmeyen düz metin. Palet son
sorguyu hatırlar ve seçili getirir: bir sonraki eşleşmeye gitmek için yeniden
açıp ok + `Enter` yeter.

Arama Rust'ta ve iş parçacıklarına bölünmüş koşuyor; yazdıkça 200 ms bekleyip
yeniden arar, eskisini durdurur. Dizin bir git deposundaysa dosya listesi
git'ten gelir: **`.gitignore`a takılanlar aranmaz** (derleme çıktısı, önbellek),
izlenmeyen yeni dosyalar aranır. Depo değilse `Ctrl+P`'nin yürüyüşü kullanılır
(`node_modules`, `target`, `dist` gibi klasörler atlanır). Sınırlar **söylenir**:
ilk 2000 satır gösterilir, 2 MB'tan büyük ve ikili dosyalara bakılmaz, en fazla
20.000 dosya taranır — sınıra takılan arama durum satırında bunu yazar. Bu
depoda bir arama ilk seferde ~40 ms, sonrakiler ~3 ms; 20.000 dosyalık git'siz
bir klasörde ilk tarama ~1 sn.

**Tasarım: Premium, Kokpit ya da Klasik.** *Ayarlar › Görünüm › Tasarım* üç
kartla seçiliyor ve renk temasından **bağımsız**: tema rengi, tasarım biçimi belirler.
**Premium** katmanlı yüzeyler, ince hat kenarlıklar, yumuşak gölgeler,
hap biçimli sekmeler, yüzen bir komut kutusu ve menü/palet gibi kısa ömürlü
yüzeylerde cam etkisi getirir. Premium'da Ayarlar penceresi de yeniden
düzenlenir: renkli bölüm simgeleriyle tam boy bir kenar çubuğu, kartlara
toplanmış ayarlar ve onay kutuları yerine açık/kapalı anahtarları.
**Kokpit** (varsayılan; yeni kurulum da güncellenen uygulama da bununla açılır,
seçilen tasarım ise korunur) Premium'un görünüşüyle başka bir yerleşim: solda
grupların baş harfleriyle durduğu **grup bölmesi** (komut çalışan grupta nokta;
altta Geçmiş, Favoriler, Değişiklikler ve Ayarlar), yanında yalnızca etkin
grubun sekmeleri kart olarak (klasör, son komut, çalışan sunucunun portu),
sekme şeridinin yerinde "grup › sekme" yolu ve terminalin üstüne açılmak yerine
yanında sabit duran yan panel. Kenar çubuğu kapatılınca sekme şeridi geri
gelir. Grup bölmesindeki her grup sağ tıkla yönetilir (ad, renk, favori, yeni
sekme, sıra, silme) ve sürüklenerek sıralanır; bölmenin altındaki ok düğmesi
bölmeyi genişletip grup adlarını yazar. Bölme genişken başlığındaki yıldız
yalnızca favori grupları listeler (bölme daraltılmışken süzgeç açıksa yıldız
bölmenin en üstünde kalır), ağaç simgesi ise sekmeleri grupların altında
listeler ve yandaki sekme kartlarını kaldırır: her grup kendi renginde bir
karta dönüşür, sekmeleri kartın içinde durur ve kendi okuyla açılıp
kapanır (açık bıraktığınız gruplar başka gruba geçince de açık kalır), sekmeye
tıklamak ona geçer, sağ tık sekme menüsünü açar, sekmeler sürüklenerek
sıralanır ya da başka grubun altına taşınır.
**Klasik** uygulamanın düz ve yoğun ilk düzeni.
Terminalin ızgarası üçünde de aynı ölçülerde çizilir; geçiş anında uygulanır,
yeniden başlatma gerekmez. Gerekçe `src/lib/design.ts`, `src/styles/premium.css`
ve `src/styles/kokpit.css` başlarında.

**Arayüz yazı tipi.** *Ayarlar › Görünüm* altında terminalin yazı tipinden
**ayrı** bir aile ve boyut var: menüler, paneller, sekme adları ve ayarlar
pencerelerinin tamamı onunla ölçekleniyor. İkisini tek ayara bağlamak, yazıyı
büyütmek isteyen kişiyi terminalini daraltmaya zorlardı — terminalin boyutu
satıra kaç sütun sığdığını da belirliyor.

**Görünüm: sekme ya da bölme.** Sekme çubuğundaki iki düğme (ya da
`Ctrl+Shift+E`) terminal alanını iki kip arasında değiştirir. **Sekmeler** kipinde
aynı anda tek terminal görünür. **Bölmeler** kipinde etkin grubun bütün sekmeleri
döşenir: her bölmenin üstünde kabuk kodu ve sekme adıyla ince bir başlık, odaklı
bölmenin çevresinde vurgu rengi, tıkladığınız bölme etkin sekme olur. Izgara
bölme sayısına göre kuruluyor (2 → yan yana, 3 → üstte iki + altta bir geniş,
7 → 3×3'ün son satırı tam genişlik) ve boş hücre bırakmıyor.

> Bölme kipi grubun **her** sekmesinin kabuğunu başlatır — "hepsini yan yana
> göster" demenin karşılığı bu. Grubu küçük tutmak kullanıcının elinde.

**Dil.** Arayüz Türkçe ve İngilizce. Ayarlar → Görünüm → Dil ile değişir, anında
uygulanır; tarih/saat ve sayı biçimleri de dille birlikte değişir. Dil ayarı dışa
aktarılan dosyaya dahildir.

**Grup renkleri.** Her grubun rengi yalnızca ince bir şeritte değil arka planda
da görünür — kenar çubuğunda onlarca grup varken renginden tanımak için. Renk
sağ tık → *Rengi değiştir* ile hazır renklerden, özel renk seçiciyle ya da
Ayarlar → Gruplar → Renk'ten verilir; kaldırılabilir. Özel renk seçici
uygulamanın kendisinde, renk kutularının hemen altında açılır (doygunluk ve
parlaklık alanı, ton çubuğu, renk kodu); sistemin renk penceresi macOS'ta
ekranın köşesinde açıldığı için kullanılmıyor. Etkin grubun rengi sekme
çubuğunun altındaki çizgide de görünüyor, böylece kenar çubuğu kapalıyken de
hangi gruptasınız belli oluyor. Karışım oranları okunabilirlik sınırıyla
bağlıdır (bkz. Testler).

**Kopyala / yapıştır.** Terminalde sağ tık **menü** açar: kopyala, yapıştır,
tümünü seç, temizle, ara, görünüm kipi, kabuğu yeniden başlat, klasörü Gezgin'de
aç. Eskiden koşulsuz yapıştırıyordu — metin seçip sağ tıklayan kullanıcı için tam
ters sonuç. Ayardan "seçim varsa kopyala, yoksa yapıştır" ya da "her zaman
yapıştır" seçilebilir. Yapıştırılan metin komut kutusu açıksa **kutuya, imlecin
olduğu yere** gider, kutu kapalıysa (klasik terminal, tam ekran program) kabuğa;
nereden yapıştırılırsa yapıştırılsın ara bir onay ("Paste" düğmesi) çıkmaz.
`Ctrl+C` seçim varken kopyalar, seçim yokken kabuğa SIGINT
olarak gider; kopyaladıktan sonra seçim temizlendiği için **ikinci `Ctrl+C` her
zaman komutu durdurur**.

Aynı kural **komut kutusunda** da geçerli ve karar tek yerden çıkıyor
(`resolveCtrlC`): kutuda seçili metin varsa `Ctrl+C` onu kopyalar ve seçimi
kaldırır, satır yerinde durur; seçim yoksa kabuğa gider ve yazılan satırı
bırakır. Odak kutudayken terminalde seçim varsa kopyalanan odur. Kopyalama
kısayolu (`Ctrl+Shift+C`) kutunun seçimini de kopyalar — tarayıcının o tuşa
kendi karşılığı olmadığı için kutu bunu kendisi yapıyor. "Ctrl+C seçim varken
kopyalasın" ayarı kapalıysa `Ctrl+C` iki yüzeyde de her zaman kabuğa gider.
`Ctrl+Shift`, `Ctrl+Alt` (Windows'ta AltGr) ve `Ctrl+Win` ile basılan C/D/L
kabuğun denetim karakteri sayılmaz.

**Bağlantılar.** Terminaldeki URL'ler **vurgu renginde** görünür, üzerine
gelindiğinde imleç değişir ve tıklanınca işletim sisteminin varsayılan
tarayıcısında açılır. (xterm'in varsayılan davranışı `window.open` çağırmak;
Tauri webview'ünde bu hiçbir şey yapmadığı için linkler sessizce
çalışmıyordu.) Yalnızca `http`/`https` açılır ve url kabuktan geçirilmez.

Renklendirme xterm'in dekorasyon API'siyle yapılıyor ve **yalnızca görünür
satırlara** uygulanıyor: dekorasyon tampon satırına bağlı bir imleçle yaşıyor,
on binlerce satırlık kaydırma tamponunun tamamına kaydetmek belleği ve çizimi
boğardı. Tarama iki aşamalı — önce satır metninde hızlı bir eleme, sonra
yalnızca aday satırlarda hücre hücre okuma; tipik çıktıda satırların çoğunda
bağlantı yok. Çok yoğun çıktı üreten işlerde ayardan kapatılabilir.

**Komut önerisi.** Daha önce çalıştırdığınız komutlar yazarken önerilir.
İki bağımsız kaynak var:

*Uygulamanın kendi geçmişi (her kabukta).* Yazdıkça istemin altında bir liste
açılır: **↑↓** seçer, **→** kabul eder, **Esc** kapatır. Seçili öneri üç ayrı
işaretle belli oluyor — işaret oku, arka plan tonu ve metnin parlaklaşması;
önceki hâlinde seçili ve seçili olmayan satırların en dikkat çeken kısmı aynı
renk ve aynı kalınlıktaydı, yani "hangisini seçtim" sorusunun görsel cevabı
yoktu. Liste yalnızca en az
iki karakter yazıldığında, eşleşme varken ve imleç satır sonundayken açılıyor —
bu üç koşul özelliğin güvenliği: boş satırda liste kapalı olduğu için ok tuşları
kabuğun kendi geçmişine gidiyor. Kabul etmek yazılanı silip öneriyi yazıyor;
öneri yazılanla tam olarak başlıyorsa yalnızca kalanı ekliyor (hiçbir şey
silinmiyor). Kaynak uygulamanın geçmişi olduğu için sekmeler ve kabuklar arası
çalışıyor.

`cd` bunun istisnası: cevabı geçmişte değil, diskte. `cd ` yazınca bulunulan
dizinin klasörleri gelir, yazdıkça süzülür (içeren eşleşme; başlayanlar önce).
Yazılan ad bir klasörle **tam eşleşiyorsa** — elle ya da listeden kabul edip —
o klasörün içi gelir, ayırıcı yazmak gerekmez: `cd NYAYAN` yazan kişi
NYAYAN'ın alt klasörlerini görür, aynı adla başlayan kardeşler onların
ardından. Yazılanla birebir aynı satır listede yok — yeni bir şey söylemeyen
öneri öneri değil.

*Kabuğun geçmişten tamamlaması (PSReadLine, zsh-autosuggestions).* Satır içi
soluk "hayalet metin" ya da istemin altında liste. Bunu kabuğa bırakmak
bilinçli: tamamlamayı ekran tamponuna yazmak kabuğun satır düzenleyicisiyle
(imleç, yeniden çizim, sekme tamamlama) yarışmak demek. PSReadLine 2.2+
gerekiyor; sürüm yetmiyorsa durum çubuğunun **⋯** menüsünde *Geçmişten
tamamlama · Desteklenmiyor* yazıyor ve satırın üzerine gelmek ne yapılacağını
söylüyor.

Adı bir kez değişti. Önceki hâli "kabuk önerisi"ydi ve ne dediği
anlaşılmıyordu: neyin önerildiği de, kimin önerdiği de belirsizdi. Yapılan iş
tam olarak şu — kabuk, geçmişte çalıştırdığınız komutlardan satırın kalanını
tamamlıyor.

İkisi birlikte de kullanılabilir; ayrı ayrı kapatılabilir.

**Renkli varsayılan istem** (macOS zsh ve bash). İşletim sisteminin verdiği
düz istem (`kullanıcı@makine dizin %`) renkleniyor: kalın yeşil kimlik, kalın
mavi dizin; renkler ANSI paletinden geldiği için tona tema karar veriyor.
Yalnızca işletim sisteminin varsayılanıyla **birebir aynı** istem renkleniyor;
oh-my-zsh, starship ya da kendi `PROMPT`unu kuran kullanıcının istemine
dokunulmuyor. *Ayarlar › Terminal › Komut satırı › Renkli istem* ile
kapatılabilir; aynı yerde kullanıcı@makine ve klasör için ayrı ayrı renk
seçilebiliyor (seçilmezse temanın yeşili/mavisi). Seçilen renk terminalin
zemininde okunmayacak kadar soluksa aynı tonun okunur bir hâli kullanılıyor.
Yeni açılan sekmelerde geçerli.

**Kabuk kapanınca sekme kendiliğinden yeniden başlar.** `exit` yazdığınızda ya
da kabuk düştüğünde sekme boş bir kutuya dönüşmüyor: yeni bir kabuk açılıyor ve
önceki ekran, altında "önceki oturum burada bitti" ayıracıyla yerinde kalıyor.
Sekmeyi gerçekten kapatmak isterseniz kenar çubuğundan ya da sekme çubuğundan
kapatırsınız.

Koşulsuz değil: **arka arkaya hemen ölen** bir kabuk yeniden denenmiyor. Profilde
olmayan bir yürütülebilir ya da silinmiş bir çalışma dizini, koşulsuz bir
yeniden başlatmada saniyede yüzlerce süreç demek olurdu. O durumda eski kutu
geri geliyor ve nereye bakılacağını söylüyor.

**Komut çalışırken yanıt da komut satırına yazılır.** `ng serve`in
"Would you like to use a different port? (Y/n)" sorusu, `npm init`in soruları,
`Read-Host`, bir REPL — çalışan program bir şey sorduğunda yanıt terminalin
içine değil, alttaki kutuya yazılıyor ve Enter'la programa gidiyor. Kutu komut
çalışırken kapanmıyor; `>_` yerine yanıp sönen bir nokta ve "Komut çalışıyor…"
yazısı çıkıyor. Kural tek cümle: **kutu boşken** tuşlar doğrudan programa
gidiyor, yazmaya başlayınca satır kutuda toplanıp Enter'la gönderiliyor.
Böylece:

- Boş kutuda Enter programa gider — "(Y/n)" sorusunda varsayılanı kabul etmek.
- Boş kutuda oklar, Boşluk, Esc, Backspace ve `Ctrl+<harf>` programa gider:
  `ng new`in stil listesi gibi oklarla seçilen listeler, işaret kutuları,
  "devam etmek için bir tuşa basın" çalışıyor.
- Yazarken oklar ve Backspace kutuyu düzenler; **Tab** yazılanı programa
  devredip tamamlatır (REPL, ssh ardındaki kabuk), **Esc** yazılanı bırakır.
- Program parola soruyorsa (`password:`, `passphrase … :`, `Parola:`) yazılan
  nokta olarak görünüyor ve panoya kopyalanamıyor.
- Yazılan yanıt komut geçmişine girmiyor, öneri listesi açılmıyor. Komut
  gönderilmemiş bir yanıtla biterse o yanıt silinir; istemde yarım bırakılan
  komut taslağı ise komut bitince yerinde durur.

Tam ekran programlarda (`vim`, `less`, `git log`) kutu yine kapanıyor ve tuşlar
doğrudan terminale gidiyor: orada ekranı program yönetiyor.

**Çalışan komutu durdurma.** Yanıt satırının sağındaki **Durdur** düğmesi tek
tıkla durduruyor. Klavyeden kutudayken ya da terminalin içindeyken düz
`Ctrl+C` tek basışta gidiyor — kabuğun kendi tuşu. Odak başka bir yerdeyse
(kenar çubuğu, sekme çubuğu) **Ctrl+C iki kez arka arkaya**: ilk basış satırı
kırmızıya çevirip "tekrar basın" diyor, ikincisi kabuğa SIGINT gönderiyor. İki
basış, tuşun ikinci anlamı yüzünden — Ctrl+C aynı zamanda kopyalama, ve odak
yazılan yerde değilken tek basışta durdurmak kopyalamak isteyenin işini
keserdi. Silah 1,5 saniye sonra kendiliğinden düşüyor. Uygulama komut satırı
ayarı kapalıysa (klasik terminal) kutunun yerinde "Komut çalışıyor…" şeridi ve
aynı düğme duruyor.

**Boş satırda ↑: geçmiş paneli.** Komut satırı boşken yukarı ok, kutunun
hemen üstünde **GEÇMİŞ** panelini açıyor: son komutlar, ne zaman
çalıştırıldıklarıyla. **↑↓** gezer, **→** kabul eder, **Esc** kapatır. Enter
seçileni kutuya yazar — çalıştırmaz; tek bir Enter'la geçmişten komut
koşturmak geri dönüşü olmayan bir kaza demek.

Liste **o sekmenin** geçmişi: gerçek bir kabuğun yukarı oku da yalnızca kendi
oturumunu hatırlar, yan sekmede yazdığınız komutu araya karıştırmaz. `Ctrl+A`
kapsamı tüm sekmelere genişletir, tekrar basmak geri alır; panelin sağ altında
hangi kapsamda olduğu yazıyor. Yeni açılmış, kendi geçmişi olmayan bir sekmede
liste kendiliğinden tüm geçmişten kuruluyor — yoksa yukarı ok orada hiçbir şey
yapmazdı ve bu panelin varlık sebebi tam olarak o boşluğu doldurmak.

İstenmeyen bir komutu panelden **geçmişten silebilirsiniz**: satırın sağındaki
**×** (her satırda soluk durur, üzerine gelince belirginleşir) ya da seçiliyken
**Shift+Delete** (mac'te ⇧⌦, yani Shift+Fn+⌫). Silmeden önce onay sorulur.
Silme panelin kapsamını izler: panel bu sekmeyi gösteriyorsa yalnızca bu
sekmenin kayıtları gider, diğer sekmelerin geçmişi değişmez; `Ctrl+A` ile tüm
sekmelere geçip silmek komutun bütün kayıtlarını siler. Kayıtlar diskten de
silinir — komut bir sonraki açılışta geri gelmez, metni geçmiş dosyasında da
kalmaz. Yazarken açılan öneri listesinde de aynı düğme ve tuş çalışır; o liste
sekmeye göre süzülmediği için orada silme her zaman bütün sekmeleri kapsar.

**Yeni sürüm ve güncelleme.** Uygulama açılışta ve açık kaldıkça altı saatte
bir GitHub'daki son yayına bakar; daha yenisi varsa durum çubuğunda
**⬆ 0.2.2 hazır** rozeti çıkar. Rozete tıklamak *Ayarlar › Hakkında*'yı açıyor:
sürüm notları orada ve iki düğme:

- **Güncelle ve yeniden başlat** — paketi uygulama kendisi indiriyor, imzasını
  doğruluyor, kuruyor ve yeniden açılıyor. Önce onay soruluyor; sekmelerde
  çalışan bir komut varsa (`ng serve` gibi) onun duracağı da yazıyor. Sekmeler
  yeniden açılışta geri geliyor. Windows'ta kurucu ilerleme çubuğuyla, soru
  sormadan çalışıyor (MSI ile kurulduysa yönetici onayı istenir); macOS'ta paket
  yerinde değişiyor ve tarayıcıdan indirilmediği için **ilk açılıştaki "Yine de
  Aç" adımı tekrar etmiyor** — güncellemeye karantina damgası düşmüyor (ölçüldü).
- **İndirme sayfasını aç** — elle kurmak için; tarayıcı kendiliğinden
  açılmıyor, dış bağlantı açmak kullanıcının kararı.

Kurulum düğmesi yalnızca yayın **imzalıysa** (bkz. *Testler › GitHub Actions ›
Güncelleme imzası*) ve uygulama **kurulu bir paketse** çıkıyor: `npm start`ın
geliştirme ikilisinde ve kurulumsuz kopyalanmış `nterminal.exe`de yalnızca
indirme sayfası var. İmza tutmazsa paket kurulmuyor, uygulama olduğu gibi
çalışmaya devam ediyor ve hata *Hakkında*'da yazıyor.

Denetim *Ayarlar › Hakkında*'dan kapatılabiliyor — kapalıyken hiçbir ağ isteği
yapılmıyor, aynı yerdeki düğmeyle elle denetlenebiliyor. "Yeni sürüm yok" ile
"denetleyemedim" ayrı yazılıyor: ağı olmayan bir makinede "bu sürüm güncel"
demek, bilinmeyen bir şeyi biliyormuş gibi göstermek olurdu.

> Denetim isteği `curl` ile yapılıyor, bir HTTP kütüphanesiyle değil. Sebep
> kurumsal ağlar: rustls kendi kök sertifika listesini taşıyıp sistemin güven
> deposunu yok sayıyor ve araya giren bir kurumsal TLS proxy'sinde denetim hep
> başarısız olurdu. `curl` sertifikaları işletim sisteminden alıyor — üstelik
> yeni bir bağımlılık gerekmiyor. Kurulum ise Tauri'nin güncelleme eklentisiyle
> yapılıyor (indirme, imza ve kurucu bir arada); o da aynı sebeple `native-tls`
> ile derleniyor: güven deposu ve vekil sunucu ayarı sistemden.

**Ayar aktarımı.** Tek JSON dosyasına dışa aktarım; karşı makinede içe alım.
Yollar `${HOME}` gibi belirteçlere çevrildiği için başka bir kullanıcı adındaki
makinede de çalışır, kabuk konumları (PowerShell 7, Git Bash…) o makinede
yeniden aranır. Ne değiştiğini uygulamadan önce görebilirsiniz.

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

**PowerShell betiği `-File` ile YÜKLENMİYOR.** `-File` yürütme ilkesine tabi
ve stok bir Windows istemcisinde ilke `Restricted`: betik çalışmıyor, istem
işareti hiç gelmiyor, dipte "Kabuk başlatılıyor…" şeridi sonsuza kadar
kalıyordu (başka bir bilgisayara kurulumda bildirildi; geliştirme makinesinde
grup ilkesi `Unrestricted` koyduğu için görünmüyordu). Uygulama bunun yerine
`-Command` ile küçük bir yükleyici veriyor: yükleyici betiğin metnini okuyup
betik bloğu olarak çalıştırıyor. İlke yalnızca dosyayı denetlediği için
`Restricted`, `AllSigned`, grup ilkesi ve "internetten indirildi" işaretli
dosya bunu durdurmuyor; kullanıcının oturumunun ilkesi de değişmiyor
(`-ExecutionPolicy Bypass` bütün sekmeyi Bypass'a çekerdi). Aynı ilke
uygulamayla gelen PSReadLine'ın `.psm1`ini de engellediğinde betik modülü
DLL'inden kendisi yüklüyor. Yükleme yine de başarısız olursa kabuk
`OSC 633;P;Integration=failed` bildiriyor ve sekme entegrasyonsuz düz terminal
olarak açılıyor. Ayrıntılar `src-tauri/src/pty.rs` içinde,
`POWERSHELL_BOOTSTRAP` üzerinde.

### Destek durumu

| Kabuk | Platform | Komut metni | Çıkış kodu | Süre | Klasör |
|---|---|---|---|---|---|
| PowerShell 7 (pwsh) | ikisi | ✅ | ✅ | ✅ | ✅ |
| Windows PowerShell 5.1 | Windows | ✅ | ✅ | ✅ | ✅ |
| Git Bash / MSYS | Windows | ✅ | ✅ | ✅ | ✅ |
| WSL | Windows | ✅ | ✅ | ✅ | ✅ |
| cmd.exe | Windows | ⚠️ tampondan | ❌ | ✅ | ✅ |
| zsh | macOS | ✅ | ✅ | ✅ | ✅ |
| bash | macOS | ✅ | ✅ | ✅ | ✅ |
| fish | macOS | ⚠️ tampondan | ❌ | ⚠️ | ❌ |
| Özel profil | ikisi | ⚠️ tampondan | ❌ | ⚠️ | ❌ |

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

**Bash macOS'ta** ayrıca login zincirini kendisi yüklüyor. `--init-file`
bash'te yalnızca login *olmayan* etkileşimli kabukta okunuyor, dolayısıyla
`--login` çıkarılmak zorunda; ama mac'te kullanıcı ayarları `.bash_profile`'da
duruyor (Terminal.app login kabuğu açtığı için) ve PATH'i `/etc/profile`
içindeki `path_helper` kuruyor. Betik ikisini de yükleyip `.bashrc`'yi bir kez
daha yüklemiyor — çift yükleme PATH girdilerini ikiye katlardı.

**Zsh** `--init-file` benzeri bir bayrak sunmuyor. Tek yol `ZDOTDIR`'i kendi
klasörümüze çevirmek, ama o zaman kullanıcının `.zshenv`, `.zprofile`, `.zshrc`
ve `.zlogin` dosyalarının **hiçbiri** okunmuyor. `shell-integration/zdotdir/`
altındaki dört köprü dosyası her birini kendi sırasında yükleyip zinciri
kurtarıyor; `.zshrc` sonunda `ZDOTDIR` kullanıcıya geri veriliyor — aksi hâlde
`.zshrc`'ye satır ekleyen bir kurulum betiği (nvm, rustup) bizim klasöre yazar
ve o klasör her açılışta üzerine yazıldığı için ayarı sessizce kaybolurdu.

Zsh tarafı bash'ten daha temiz: komut satırını `preexec` doğrudan argüman
olarak veriyor, `DEBUG` tuzağı ve sentinel gerekmiyor. Buna karşılık `precmd`
kancası dizinin **başına** ekleniyor — `$?` bir sonraki kancaya kadar yaşıyor
ve başka bir kanca önce koşarsa okunan çıkış kodu onunki olurdu. `133;B`
işareti ise her istemde yeniden kontrol ediliyor: powerlevel10k ve starship
PS1'i her istemde yeniden kuruyor, tek seferlik ekleme ilk istemden sonra
kaybolurdu.

**cmd.exe** çıkış kodu bildiremiyor: `PROMPT` değişkeni her istemde yeniden
değerlendiriliyor ama `%ERRORLEVEL%` atama anında bir kez çözülüyor. İstem ve
klasör işaretleri geliyor, komut metni ise ekran tamponundan okunuyor.

### "Tampondan" ne demek?

Entegrasyon komut metni vermediğinde, Enter'a basıldığı anda ekran tamponu
okunuyor: `OSC 133;B` ile işaretlenen noktadan imlece kadar olan metin. Bu,
tuş vuruşlarını saymanın aksine satır düzenlemeye, tamamlamaya ve satır
kaydırmasına dayanıklı.

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

### Tek örnek (Windows)

Aynı veri klasörüyle yalnızca bir N-Terminal çalışıyor. Uygulamayı yeniden
açmak ikinci bir kopya başlatmıyor; çalışanın penceresini, arka planda gizli
olsa bile, öne getiriyor.

Kapatma düğmesinin varsayılanı "arka planda çalış": pencere gizleniyor,
sekmelerdeki komutlar sürüyor. Eskiden uygulamayı yeniden açmak aynı sekmeleri
kuran yeni bir süreç başlatıyordu, eski süreç ise gizli pencerede çalışmaya
devam ediyordu. Bildirilen hatada gizli kopyadaki `ng serve` 1453 portunu
tutuyordu ve yeni kopyada başlatılan `ng serve` portu alamadı. Aynı anda üç
kopya çalışıyordu ve hepsi aynı `workspace.json`a birbirinin üstüne yazıyordu.

Kilit uygulamaya değil veri klasörüne bağlı: taşınabilir kopya ya da
`NTERMINAL_DATA_DIR` ile başka klasör kullanan bir örnek yan yana açılabilir.
Geliştirme yapısının kilidi ayrı; kurulu uygulama açıkken `npm start` yine
açılıyor. Ayrıntılar `src-tauri/src/instance.rs` içinde.

Uygulamadan gerçekten çıkmak için saatin yanındaki simgeden *Çıkış*'ı seçin ya
da *Ayarlar › Oturum › Kapatma düğmesi*ni *Uygulamadan tamamen çık* yapın.
Çıkışta sekmelerdeki süreçler (sunucular dahil) kapanıyor ve portlar boşalıyor.

## Ayarları başka makineye taşımak

İçe ve dışa aktarma *Ayarlar › Yedekleme* bölümünde; komut paletindeki
"Ayarları içe / dışa aktar" da oraya açılır.

**Dışa aktarma** neyin dosyaya yazılacağını seçtiriyor: ayarlar, çalışma alanı,
favori komutlar, komut geçmişi, ekran çıktıları. Favoriler varsayılan olarak
dahil — başka makinede ilk isteyeceğiniz şeylerden biri.

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

## Ayarlar penceresi

Dokuz bölüm, dikey gezinme: **Genel** (dil, görünüm kipi), **Görünüm** (tema,
terminal yazı tipi, **arayüz yazı tipi**, imleç), **Terminal** (kopyala/yapıştır,
bağlantılar, komut önerisi),
**Oturum** (devamlılık, sekme kapatma onayı), **Geçmiş**, **Profiller**,
**Gruplar**, **Kısayollar**, **Hakkında**.

**Hakkında.** Sürüm ve veri dosyalarının yanında geliştirici bilgileri de burada:
ad, kaynak deposunun adresi (yanındaki düğme varsayılan tarayıcıda açıyor) ve
lisans. Bağlantının kendisi tıklanabilir değil — uygulama bir tarayıcı değil ve
dış bağlantıyı açmak kazara tıklamayla değil, düğmeyle oluyor.

**Arama.** Bölüm listesinin üstündeki kutuya ayarın adını (ya da ne yaptığını)
yazınca sonuçlar bölüm adlarıyla listeleniyor; birine tıklamak o bölüme
götürüyor **ve ilgili satırı kısa süre vurguluyor** — yalnızca bölüme götürmek
yarım iş, on ayarlı bir bölümde kullanıcı aradığı satırı gözle taramak zorunda
kalıyor. Arama aksana bakmıyor: "gorunum" yazmak "Görünüm"ü buluyor. Açıklama
metinleri de taranıyor, çünkü kullanıcı çoğu zaman ayarın adını değil ne
yaptığını biliyor ("PSReadLine" yalnızca açıklamada geçiyor). Etiket eşleşmeleri
açıklama eşleşmelerinden önce geliyor.

Arama indeksi elle tutulan bir liste ama sürüklenemiyor: arayüzdeki her ayar
satırı `data-setting="<anahtar>"` taşıyor ve bir test o anahtarların kümesini
indeksle birebir karşılaştırıyor. Yeni bir ayar eklenip indekse yazılmazsa test
düşüyor — aksi hâlde arama onu bulamaz ve bu ancak elle deneyerek görülür.

Pencere bu hâline üç ölçülmüş kusurdan geçerek geldi:

- **Altı bölüm yatay bir şeritteydi** ve iki bölüm birbiriyle ilgisiz ayarları
  taşıyacak kadar büyümüştü: dil "Görünüm" altındaydı, kopyala/yapıştır ile
  sekme kapatma onayı aynı "Terminal" başlığını paylaşıyordu ve **aynı başlık
  iki ayrı bölümde** geçiyordu. Tek bir bölümün içeriği 776px, görünür alan
  461px'ti. Şimdi en uzun bölüm 564px ve dokuz bölümün altısı kaydırmasız
  sığıyor.
- **İlgili metinler dört ayrı sol kenardaydı**: bölüm ipuçları 14px, alan
  etiketleri 215px, onay kutusu etiketleri 244px, denetimler 415px. İpucunun
  bazı yerlerde alanın içinde, bazı yerlerde bölümün doğrudan çocuğu olması
  hizalamayı rastgele bırakıyordu. Şimdi bölüm de aynı ızgarayı taşıyor: iki
  kenar kaldı, etiketler ve denetimler.
- **Pencere içeriğe göre büyüyüp küçülüyordu** (379px ile 590px arası), bölüm
  değiştirmek görsel bir zıplama üretiyordu. Gövde artık sabit yükseklikte.
- **Bölüm adları ortalanmıştı.** Düğme sistemi yenilenirken temel `button`
  kuralına `justify-content: center` konulmuştu; düğme bir flex kabı olduğu için
  bu `text-align: left`i ezdi ve sola dayalı olması gereken her şey ortaya kaydı
  — bölüm listesi, sağ tık menüsü girdileri, öneri listesi satırları ve "sekme
  ekle". Merkezleme artık temel kuralda değil, yalnızca içerikten geniş olabilen
  düğmelerde (`.seg`, panel sekmeleri, pencere altlığı).

## Düğmeler

Üç kademe: sessiz (varsayılan), çerçeveli ve dolgulu. Bir kutuda yalnızca bir
dolgulu düğme var — dolgu "burada devam et" demek, ikisi olunca hiçbiri demiyor.
Yıkıcı birincil eylem (onay penceresindeki *Kapat* / *Sil*) dolgulu ve kırmızı.

Dolgulu düğmede yazı **beyaz**, zemin ise vurgu renginin beyaza en az 4.5:1
karşıtlık verecek kadar koyulaştırılmış hâli (`--accent-solid` / `--err-solid`; yazı
`--accent-fg` / `--err-fg`). CSS bu hesabı yapamadığı için tema uygulanırken
`filledColors()` (`src/lib/contrast.ts`) yazıyor. Açık mavi bir vurguda (One Half
Dark `#61afef`) zemin `#447ba7` oluyor; vurgu zaten koyuysa (açık temalar) olduğu gibi
kalıyor, çok açık bir renk (sarı gibi) çamurlaşmasın diye eski kurala düşüyor.
`--accent` / `--err` yüzeyde metin ve gösterge olarak açık kalıyor: aynı renk hem koyu
yüzeyde okunacak kadar açık hem beyaz yazıya zemin olacak kadar koyu olamaz.

Üzerine gelince zemin biraz koyulaşıyor (açıklaşsaydı beyaz yazı 4.5'in altına
inerdi). **Devre dışı** dolgulu düğme soluk zemin ve açık gri yazı taşıyor, `opacity`
yok: eskiden düğme bütünüyle soluyor, koyu yazı zemine karışıyordu (2.5:1); şimdi en az
3:1. Sayaç hapı yazının TERSİ renkten türüyor (beyaz yazıda koyu hap).

Bu yazı rengi kuralı iki kez değişti. İlkinde `color-mix(accent 12%, #000)` vardı — koyu
vurgu renginde koyu üstüne koyu. Sonra karşıtlığı yüksek olan siyah/beyaz seçildi; açık
bir vurguda bu hep koyu yazı demekti ve "Commit düğmesindeki metin rengi yanlış gibi"
diye bildirildi.

Odak halkası iki katmanlı: iç katman yüzey renginde bir ayırıcı çiziyor. Tek
katmanlı vurgu renkli bir halka, vurgu renkli **dolgunun** üzerinde
kayboluyordu — halka ile dolgu aynı renk.

Durum renkleri (kırmızı/yeşil) terminal paletinden geliyor ama arayüz
yüzeyinde de kullanılıyor; ikisi farklı zemin. Ölçüm: Windows Terminal
temasında kırmızı metinli düğme **2.87** karşıtlık, okunmuyordu. Aynı renkler
artık arayüz yüzeyine göre de düzeltiliyor — en kötü değer 4.56, hepsi WCAG AA.

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
| `Ctrl+R` | Geçmişte hızlı arama (`Ctrl+A` kapsam, `Ctrl+F` favoriler) |
| `Ctrl+Shift+B` | Favori komutlar |
| `Ctrl+Shift+P` | Komut paleti |
| `Ctrl+P` | Bu dizinde dosya ara |
| `Ctrl+Shift+G` | Dosyaların içinde ara (mac'te `⌘⇧F`) |
| `Ctrl+Shift+R` | Sekmeyi yeniden adlandır |
| `Ctrl+Shift+L` | Sekmeyi kilitle / kilidi aç |
| `Ctrl+Shift+E` | Sekme / bölme görünümü |
| `Ctrl+Shift+K` | Terminali temizle |
| `Ctrl+Shift+F` | Terminalde ara |
| `Ctrl+Shift+C` / `Ctrl+Shift+V` | Kopyala / yapıştır |
| `Ctrl+,` | Ayarlar |
| `Ctrl+=` / `Ctrl+-` / `Ctrl+0` | Yazıyı büyült / küçült / sıfırla |

Kenar çubuğu başlığındaki üç düğme sırayla: yıldız favori grup süzgecini açıp
kapatır (süzgeç etkinken yıldız dolu görünür), ortadaki düğme **Grupları Daralt** /
**Grupları Aç**, artı yeni grup ekler. Sekme çubuğunun sağındaki iki düğme sekme /
bölme görünümünü seçer.

Başlık çubuğunun sol köşesindeki iki düğme birer **açma/kapama**: soldaki grup
kenar çubuğunu daraltıp geri getirir, sağdaki bulunulan dizinin dosya ağacını
terminalin üstünde açar ve ikinci tıkta kapatır. Sıraları düzenin sırasını izliyor — en soldaki
düğme en soldaki paneli açıyor. Tek yönlü hâllerinde ikinci tıklama hiçbir şey
yapmıyormuş gibi görünüyordu: ağacı kapatmak için panelin kendi `×` düğmesini
bulmak gerekiyordu, kenar çubuğunu kapatmanın ise hiçbir yolu yoktu.

**Durum çubuğu** yalnızca kimlik taşıyor: hangi grup, hangi profil, hangi
klasör. Okumalar — komut çalışıyor mu, komut takibi tam mı, geçmişten tamamlama
açık mı, kabuk pid'i, kayıtlı komut ve sekme sayısı — sağdaki **⋯** düğmesinde.
Ayrım önceden yer darlığına göreydi: hepsi çubuktaydı, sığmayan menüye
düşüyordu. Sonuç pencerenin genişliğine göre değişen bir şeritti; her açılışta
aynı şeyi aynı yerde bulmak mümkün değildi ve çubuğun yarısı hiç değişmeyen üç
rozetle doluydu ("komut takibi tam" bir kez okunacak bir şey, sürekli değil).
Bugün ayrım işleve göre: kimlik görünür, okuma bir tık uzakta — ipuçlarıyla
birlikte, çünkü "sınırlı" tek başına ne yapılacağını söylemiyor. Kimlik alanı
da sığmazsa aynı menünün altına, ayrı bir bölüme düşüyor.

`Ctrl+C` terminalde iki iş yapar: seçim varsa kopyalar, seçim yoksa kabuğa
gider. Kopyalamadan sonra seçim temizlendiği için ikinci `Ctrl+C` çalışan
komutu durdurur. Komut kutusunda da aynı: seçili metin kopyalanır ve seçim
kalkar, seçim yoksa satır bırakılır ve kesme kabuğa gider. Komut çalışırken
kutu o komutun yanıt satırı olduğundan orada da tek basış yetiyor.

Sekme çubuğunda çift tık yeniden adlandırır, orta tuş kapatır, sağ tık menüyü
açar. Kenar çubuğundaki grup ve sekme satırlarında da aynı davranışlar geçerli.
