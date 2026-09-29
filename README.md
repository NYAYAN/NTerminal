# N-Terminal

Windows ve macOS için gruplanabilir sekmeli terminal. Gruplar, gruba bağlı
sekmeler, sekme ya da bölme görünümü, oturum devamlılığı, komut geçmişi,
Türkçe/İngilizce arayüz ve ayarların makineler arası taşınması.

Tauri 2 (Rust) + xterm.js 6 üzerine kurulu. PTY katmanı `portable-pty`
üzerinden: Windows'ta ConPTY, macOS'ta yerel Unix PTY.

> Yalnızca kurup kullanmak istiyorsan: **[KURULUM.md](KURULUM.md)** — hangi
> dizinde hangi komut, hangi dosya oluşuyor. Bu dosya nedenleri ve ayrıntıları
> anlatıyor.
>
> Geliştirmeye devam edeceksen: **[NOTLAR.md](NOTLAR.md)** — hangi kararın
> arkasında hangi ölçülmüş hata var, neler açık kaldı ve tekrar ısıracak
> tuzaklar hangileri.

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
verilebilir; sıralaması elle ayarlanır. Klasör tanımlıysa çalıştırmadan önce o
klasöre geçilir. `Ctrl+Shift+B` panelini açar, komut paletinde de doğrudan
çalıştırılabilir. `Ctrl+R` hızlı çağırmada favoriler **varsayılan olarak
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
ekler. Başlıktaki toplu kutu hepsini ekler ya da çıkarır ve kaç dosyanın
commit'e gireceğini yazar.

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
değişiklik olması gerekmez.

Hata **kalıcı** ve kutunun içinde: git'in kendi metni satır sonlarıyla, olduğu
gibi gösterilir. Bir commit kancasının (lint, test) ya da reddedilen bir
push'un çıktısı üç saniyelik bir bildirimde okunmaz. Kancalar atlanmaz
(`--no-verify` yok).

Fark artık `HEAD`e karşı alınıyor: eskiden çalışma ağacını indeksle
karşılaştırıyordu ve bir dosya eklenince satırın farkı boş çıkıyordu.

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
tıklamak farkını açar (yalnızca okunur). Uygula simgesinin ne yapacağını iki kutu
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

**Dosya arama (`Ctrl+P`).** Başlık çubuğunun ortasındaki kutu ya da kısayol,
bulunulan dizindeki dosyalarda bulanık arama açıyor. Enter dosyayı sağ
paneldeki görüntüleyicide açar, `Shift+Enter` yolu komut satırının sonuna ekler
(`code ` yazıp `Ctrl+P`). Satırda dosya **adı solda**, klasörü sağda ve soluk:
klasör zinciri çoğu satırda aynı, yani ayırt etmeyen kısmı önce okutmak gözü
boşuna yoruyordu. Ad öne alınınca satırlar ilk harften ayrışıyor. Liste açılışta
bir kez okunuyor, süzme bellekte — her tuş vuruşunda binlerce dosyayı diskten
geçirmemek için.

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
Ayarlar → Gruplar → Renk'ten verilir; kaldırılabilir. Etkin grubun rengi sekme
çubuğunun altındaki çizgide de görünüyor, böylece kenar çubuğu kapalıyken de
hangi gruptasınız belli oluyor. Karışım oranları okunabilirlik sınırıyla
bağlıdır (bkz. Testler).

**Kopyala / yapıştır.** Terminalde sağ tık **menü** açar: kopyala, yapıştır,
tümünü seç, temizle, ara, görünüm kipi, kabuğu yeniden başlat, klasörü Gezgin'de
aç. Eskiden koşulsuz yapıştırıyordu — metin seçip sağ tıklayan kullanıcı için tam
ters sonuç. Ayardan "seçim varsa kopyala, yoksa yapıştır" ya da "her zaman
yapıştır" seçilebilir. `Ctrl+C` seçim varken kopyalar, seçim yokken kabuğa SIGINT
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

**Kabuk kapanınca sekme kendiliğinden yeniden başlar.** `exit` yazdığınızda ya
da kabuk düştüğünde sekme boş bir kutuya dönüşmüyor: yeni bir kabuk açılıyor ve
önceki ekran, altında "önceki oturum burada bitti" ayıracıyla yerinde kalıyor.
Sekmeyi gerçekten kapatmak isterseniz kenar çubuğundan ya da sekme çubuğundan
kapatırsınız.

Koşulsuz değil: **arka arkaya hemen ölen** bir kabuk yeniden denenmiyor. Profilde
olmayan bir yürütülebilir ya da silinmiş bir çalışma dizini, koşulsuz bir
yeniden başlatmada saniyede yüzlerce süreç demek olurdu. O durumda eski kutu
geri geliyor ve nereye bakılacağını söylüyor.

**Çalışan komutu durdurma.** Komut çalışırken komut satırı kapanıp yerine
"Komut çalışıyor…" şeridi geliyor; düğmesi tek tıkla durduruyor. Klavyeden
**Ctrl+C iki kez arka arkaya**: ilk basış şeridi kırmızıya çevirip "tekrar
basın" diyor, ikincisi kabuğa SIGINT gönderiyor. İki basış, tuşun ikinci
anlamı yüzünden — Ctrl+C aynı zamanda kopyalama, ve tek basışta durdurmak
kopyalamak isteyenin işini keserdi. Silah 1,5 saniye sonra kendiliğinden
düşüyor. Terminalin İÇİNDE kural yok: orada düz Ctrl+C kabuğun kendi tuşu ve
tek basışta gidiyor.

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

**Yeni sürüm bildirimi.** Uygulama her açılışta GitHub'daki son yayına bakar;
daha yenisi varsa durum çubuğunda **⬆ 0.2.0 hazır** rozeti çıkar. Rozete
tıklamak *Ayarlar › Hakkında*'yı açıyor — sürüm notları orada, indirme sayfasını
açan düğme de. Tarayıcı kendiliğinden açılmıyor: dış bağlantı açmak
kullanıcının kararı, küçük bir rozete kazara tıklamanın sonucu değil.

Uygulama kendini **güncellemiyor**, haber veriyor. Kendi kendine güncelleyen
bir akış (Tauri updater) bir imza anahtar çifti, imzalı paket üreten bir CI ve
yayımlanan bir sürüm akışı istiyor; üçü kurulmadan çalışmıyor.

Denetim *Ayarlar › Hakkında*'dan kapatılabiliyor — kapalıyken hiçbir ağ isteği
yapılmıyor, aynı yerdeki düğmeyle elle denetlenebiliyor. "Yeni sürüm yok" ile
"denetleyemedim" ayrı yazılıyor: ağı olmayan bir makinede "bu sürüm güncel"
demek, bilinmeyen bir şeyi biliyormuş gibi göstermek olurdu.

> İstek `curl` ile yapılıyor, bir HTTP kütüphanesiyle değil. Sebep kurumsal
> ağlar: rustls kendi kök sertifika listesini taşıyıp sistemin güven deposunu
> yok sayıyor ve araya giren bir kurumsal TLS proxy'sinde denetim hep
> başarısız olurdu. `curl` sertifikaları da vekil sunucu ayarlarını da işletim
> sisteminden alıyor — üstelik yeni bir bağımlılık gerekmiyor.

**Ayar aktarımı.** Tek JSON dosyasına dışa aktarım; karşı makinede içe alım.
Yollar `${HOME}` gibi belirteçlere çevrildiği için başka bir kullanıcı adındaki
makinede de çalışır, kabuk konumları (PowerShell 7, Git Bash…) o makinede
yeniden aranır. Ne değiştiğini uygulamadan önce görebilirsiniz.

---

## Gereksinimler

| | |
|---|---|
| Windows | 10 1809+ / 11 (ConPTY gerektirir) |
| macOS | 11 Big Sur+ (Intel ve Apple Silicon) |
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

### macOS: "hasarlı" uyarısı ve açma yolu

**Paketler imzasız.** İndirilen bir `.dmg`'den kurulan uygulama ilk açılışta
açılmıyor: macOS uygulamanın **hasarlı olduğunu ve Çöp'e taşınması gerektiğini**
söyleyen bir diyalog gösteriyor (tam metin macOS sürümüne ve diline göre
değişiyor).

Uygulama hasarlı değil. Bu, macOS'un imzalanmamış bir pakete verdiği yanıt.
Açmak için karantina damgasını kaldırmak yeterli:

```bash
xattr -dr com.apple.quarantine /Applications/N-Terminal.app
```

Komut bir kez koşuluyor; sonrasında uygulama normal açılıyor. Bir terminali
kurmak için terminal gerekmesi ironik ama macOS'un bıraktığı tek güvenilir yol
bu: sıradan "tanınmayan geliştirici" uyarısındaki **Yine de Aç** düğmesi bu
verdiktte belirmiyor ve macOS 15'ten beri Control+tık → Aç kaçış kapısı da
kaldırıldı.

**Sebebi.** İkili yalnızca ad-hoc imzalı, paketin kaynakları mühürlü değil ve
Team ID yok:

```
$ codesign -dvv /Applications/N-Terminal.app
Identifier=nterminal-9bd84406411f3fc4
Signature=adhoc
TeamIdentifier=not set

$ spctl -a -vvv /Applications/N-Terminal.app
code has no resources but signature indicates they must be present
```

`Identifier` `com.nyayan.nterminal` değil, **ikilinin hash'inden türeyen bir
ad** — yani her derleme macOS için başka bir uygulama. Bunun ikinci bir sonucu
var ve kendi derlemesini alan herkesi ilgilendiriyor: macOS gizlilik izinlerini
(Tam Disk Erişimi, Erişilebilirlik, Otomasyon) kod imzası şartına bağlıyor;
imza ad-hoc olduğu için şart `cdhash`e çivileniyor ve **her yeni derlemede
verdiğiniz izinler sıfırlanıyor.**

**Gerçek çözüm** Apple Developer Program üyeliği (yıllık ücretli), *Developer
ID Application* sertifikası ve notarization. O zaman son kullanıcı yalnızca
"internetten indirildi" onayını görüp devam ediyor, izinler de sabit Team ID
sayesinde derlemeler arası korunuyor. Şimdilik bilinçli olarak yapılmadı:
proje tek kişilik ve dağıtım GitHub üzerinden.

Kendinden imzalı bir sertifika (`bundle.macOS.signingIdentity`) izin
sıfırlanmasını **geliştirme makinesinde** çözer ama son kullanıcı için hiçbir
şey değiştirmez — o sertifika başka bir Mac'te güvenilmiyor.

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

Dolgunun üzerindeki metin rengi CSS'te sabitlenemiyor: vurgu rengi temaya göre
açık ya da koyu olabiliyor. Karşıtlık hesabıyla siyah/beyaz seçilip tema
uygulanırken bir değişkene yazılıyor (`--accent-fg`, `--err-fg`). Önceki hâli
`color-mix(accent 12%, #000)` idi — koyu vurgu renginde koyu üstüne koyu.

Odak halkası iki katmanlı: iç katman yüzey renginde bir ayırıcı çiziyor. Tek
katmanlı vurgu renkli bir halka, vurgu renkli **dolgunun** üzerinde
kayboluyordu — halka ile dolgu aynı renk.

Durum renkleri (kırmızı/yeşil) terminal paletinden geliyor ama arayüz
yüzeyinde de kullanılıyor; ikisi farklı zemin. Ölçüm: Windows Terminal
temasında kırmızı metinli düğme **2.87** karşıtlık, okunmuyordu. Aynı renkler
artık arayüz yüzeyine göre de düzeltiliyor — en kötü değer 4.56, hepsi WCAG AA.

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
| `Ctrl+R` | Geçmişte hızlı arama (`Ctrl+A` kapsam, `Ctrl+F` favoriler) |
| `Ctrl+Shift+B` | Favori komutlar |
| `Ctrl+Shift+P` | Komut paleti |
| `Ctrl+P` | Bu dizinde dosya ara |
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
açar ve ikinci tıkta kapatır. Sıraları düzenin sırasını izliyor — en soldaki
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
kalkar, seçim yoksa satır bırakılır ve kesme kabuğa gider.

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

---

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
  - **Düğme renkleri** — 4 tema için dolgulu birincil, dolgulu yıkıcı, sessiz
    kırmızı, yeşil rozet ve çerçeveli düğme ≥ 4.5 karşıtlık; odak halkasının
    iki katmanlı olması.
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
  gibi oku → uygula** zincirinin tamamı.
- **Uçtan uca (8 test)** — gerçek ConPTY içinde gerçek PowerShell, bash ve
  cmd.exe başlatıp OSC işaretlerini okuyor: istem işaretleri, komut metni, çıkış
  kodu `0` ve yerel uygulamanın `3`'ü, hatadan sonra tekrar `0`, noktalı virgül
  kaçışı, klasör bildirimi. Bash testi ayrıca iki şeyi kilitliyor: ilk bildirilen
  komut kullanıcının komutu olmalı (başlangıç betiğinin satırı değil) ve bir boru
  hattı tek kayıt açmalı. Ayrı bir test de boş satırda Enter'a basmanın önceki
  komutu ikinci kez kaydetmediğini doğruluyor.

  Son iki test sonradan eklendi:
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

Çıktılar koşunun **Artifacts** bölümünde, 14 gün: Windows için NSIS kurucusu
ve MSI, macOS için DMG. İkisi de **imzasız** — depoda ne Windows sertifikası
ne Apple kimliği var. Windows'ta SmartScreen uyarısı çıkıyor; macOS'ta uyarı
değil doğrudan "hasarlı, Çöp Kutusuna taşıyın" diyaloğu geliyor ve açmak için
karantina damgasının elle kaldırılması gerekiyor. Komut ve sebebi
"Kurulum ve çalıştırma" bölümündeki **macOS: "hasarlı" uyarısı ve açma yolu**
başlığında.

Linux yok: uygulama orada denenmedi (`src-tauri/src/platform.rs`) ve paket
türlerinin hiçbiri Linux'ta karşılık bulmuyor.

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
