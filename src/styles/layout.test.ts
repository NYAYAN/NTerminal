import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Terminal boşluk dolgusunun nerede durduğu bir stil tercihi değil, doğruluk
 * meselesi — bu yüzden testle bağlı.
 *
 * FitAddon satır sayısını şöyle buluyor:
 *
 *   available = getComputedStyle(parent).height - (xterm ÖĞESİNİN dolgusu)
 *   rows      = floor(available / hücreYüksekliği)
 *
 * Ebeveynin (`.term-host`) dolgusu bu hesaba girmiyor. Dolgu ebeveyne
 * konulduğunda fit, gerçek iç alandan daha büyük bir yükseklik görüp fazla
 * satır üretiyor; son satır — kullanıcının yazdığı satır — durum çubuğunun
 * altına taşıyor.
 *
 * Ölçülen hata: 627px yükseklik / 12px hücre = 52 satır = 624px, gerçek iç
 * alan 609px → 5px bindirme. Dolgu xterm öğesine taşındığında 50 satır ve
 * 19px boşluk.
 */
/*
 * Yorumlar ayıklanıyor. İki sebep: (1) bir kuralın gövdesindeki açıklama
 * metni bildirim sanılıyordu — `display:none` yapsak…` diye başlayan yorum,
 * "display:none kullanılmamalı" testini düşürüyordu; (2) yorum içindeki bir
 * `}` karakteri aşağıdaki basit blok ayrıştırmasını da bozar.
 */
const CSS = readFileSync(join(process.cwd(), "src/styles/global.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

function ruleBody(selector: string): string {
  // Basit ayrıştırma: `selector {` ile başlayan ilk bloğun gövdesi.
  const index = CSS.indexOf(`${selector} {`);
  expect(index, `CSS kuralı bulunamadı: ${selector}`).toBeGreaterThan(-1);
  const open = CSS.indexOf("{", index);
  const close = CSS.indexOf("}", open);
  return CSS.slice(open + 1, close);
}

function paddingOf(selector: string): string | null {
  const match = /(?:^|\s|;)padding\s*:\s*([^;]+);/.exec(ruleBody(selector));
  return match ? match[1].trim() : null;
}

describe("terminal boşluk dolgusu", () => {
  it(".term-host dolgu taşımıyor", () => {
    // Buraya dolgu koymak satır hesabını bozar ve footer yazının üzerine biner.
    const padding = paddingOf(".term-host");
    expect(padding, ".term-host dolgu bildirimi bulunamadı").not.toBe(null);
    expect(
      padding,
      ".term-host dolgusu 0 olmalı — dolgu xterm öğesine ait, yoksa FitAddon fazla satır üretir",
    ).toBe("0");
  });

  it(".term-host .xterm dolgu taşıyor", () => {
    const padding = paddingOf(".term-host .xterm");
    expect(padding, "xterm öğesinde dolgu tanımlı olmalı").not.toBe(null);
    // Alt dolgu, son satır ile durum çubuğu arasındaki asgari boşluğu belirliyor.
    const parts = padding!.split(/\s+/);
    expect(parts.length, `beklenmeyen dolgu biçimi: ${padding}`).toBeGreaterThanOrEqual(3);
    const bottom = Number.parseFloat(parts[2]);
    expect(bottom, "alt dolgu en az 6px olmalı: footer yazıya değmesin").toBeGreaterThanOrEqual(6);
  });

  it("ana ızgara satırları içeriğe göre", () => {
    // Sabit yükseklikler sekme/durum çubuğunun gerçek ölçüsüyle bir piksel
    // oynadığında içerik satır sınırını aşıyordu.
    //
    // Satırlar: sekme çubuğu, terminal (1fr), durum çubuğu.
    const body = ruleBody(".main");
    const match = /grid-template-rows:\s*([^;]+);/.exec(body);
    expect(match, "grid-template-rows tanımlı olmalı").not.toBe(null);
    const rows = match![1].trim().split(/\s+/);
    expect(rows.filter((r) => r === "1fr"), "tam olarak bir esneyen satır olmalı").toHaveLength(1);
    expect(rows.indexOf("1fr"), "esneyen satır terminal satırı olmalı").toBe(1);
    for (const row of rows) {
      expect(["auto", "1fr"]).toContain(row);
    }
    expect(body, "min-height:0 olmadan 1fr satır içeriğe göre büyüyüp footer'ı itiyor").toMatch(
      /min-height:\s*0/,
    );
  });

  it("ızgara alanları satır sayısıyla uyumlu", () => {
    // Alan adı sayısı satır sayısıyla tutmazsa tarayıcı tüm şablonu yok
    // sayıyor ve düzen sessizce blok akışına düşüyor.
    const body = ruleBody(".main");
    const rows = /grid-template-rows:\s*([^;]+);/.exec(body)![1].trim().split(/\s+/);
    const areas = /grid-template-areas:\s*([^;]+);/.exec(body)![1];
    const areaRows = [...areas.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(areaRows).toHaveLength(rows.length);
  });

  it("öneri listesi ızgarada yer kaplamıyor", () => {
    // ÖLÇÜLEN HATA. Liste bir zamanlar `grid-area: suggest` ile kendi
    // satırındaydı; yüksekliği öneri sayısıyla değiştiği için her tuş
    // vuruşunda terminal alanı küçülüp büyüyor, `ResizeObserver` → `fit()` →
    // PTY yeniden ölçülendirme zinciri işliyor ve kabuk istemi yeniden
    // çiziyordu. Terminal hücresi ~17px, öneri satırı ~24px: tek bir önerinin
    // eklenmesi bile ekranı bir iki satır kaydırıyordu.
    //
    // Geri dönüşün yolu ızgaraya bir satır eklemekten geçiyor; ikisi de burada
    // bağlı.
    const areas = /grid-template-areas:\s*([^;]+);/.exec(ruleBody(".main"))![1];
    expect(areas, "öneri listesi yeniden ızgara satırı olmuş").not.toContain("suggest");

    const body = ruleBody(".suggest-bar");
    expect(body, "liste ızgara alanına geri konmuş").not.toMatch(/grid-area/);
    expect(body, "liste yüzmüyor — düzende yer kaplıyor").toMatch(/position:\s*fixed/);
  });

  it("terminal alanı ızgarada büyümüyor", () => {
    expect(ruleBody(".terminal-area")).toMatch(/min-height:\s*0/);
  });
});

/**
 * xterm.css `.xterm .xterm-viewport`a `background-color: #000` veriyor ve bunu
 * temayla değiştirmiyor. Viewport `.xterm`in dolgu kutusunu tamamen kapladığı,
 * metin ise dolgunun içindeki `.xterm-screen`de durduğu için o dolgu halkası
 * viewport'un arka planını gösteriyor — açık temada terminalin çevresinde
 * siyah bir çerçeve olarak. Koyu temada siyah üstüne siyah geldiği için
 * gözden kaçıyordu.
 */
describe("terminal arka planı", () => {
  it("xterm viewport tema arka planını alıyor", () => {
    const body = ruleBody(".term-host .xterm-viewport");
    const match = /background-color:\s*([^;]+);/.exec(body);
    expect(match, "viewport arka planı tanımlı olmalı").not.toBe(null);
    expect(
      match![1].trim(),
      "viewport arka planı tema değişkeninden gelmeli, yoksa xterm.css'in siyahı kalır",
    ).toBe("var(--term-bg)");
  });

  it("dolgu halkasının arkasında tema rengi var", () => {
    // Viewport saydam olsaydı bile arkada doğru renk durmalı.
    expect(ruleBody(".main")).toMatch(/background:\s*var\(--term-bg\)/);
  });
});

/**
 * Bölme kipi, terminal alanının satır hesabına dokunmadan çalışmak zorunda.
 * Buradaki üç kural da bir kez bedeli ödenmiş hatalardan geliyor.
 */
describe("bölme kipi", () => {
  it(".pane dolgu taşımıyor", () => {
    // Dolgu bölme kabuğuna konursa xterm ebeveyninin yüksekliğini olduğu gibi
    // ölçüp fazla satır üretir - .term-host'ta yaşanan hatanın aynısı.
    expect(/(?:^|\s|;)padding\s*:/.test(ruleBody(".pane")), ".pane dolgu taşımamalı").toBe(false);
  });

  it("gizli bölme düzenden çıkarılmıyor", () => {
    const body = ruleBody('.pane[data-visible="false"]');
    expect(body, "display:none xterm'in ölçüm hesabını sıfırlar").not.toMatch(
      /display\s*:\s*none/,
    );
    expect(body).toMatch(/visibility\s*:\s*hidden/);
  });

  it("odaklı bölme kenarlık değil outline kullanıyor", () => {
    // border kutuyu 2px büyütür ve xterm'in satır hesabını kaydırır; outline
    // düzenden yer almıyor.
    const body = ruleBody('.terminal-area[data-view="panes"] > .pane[data-visible="true"]');
    expect(body).toMatch(/outline\s*:/);
    expect(body, "bölme çerçevesi border ile çizilmemeli").not.toMatch(/(?:^|\s|;)border\s*:/);
  });

  it("bölme ızgarası içeriğe göre büyümüyor", () => {
    // `1fr` tek başına içerik boyutunun altına inmiyor; terminal de içerik
    // olarak geniş, dolayısıyla bölmeler kapsayıcıyı taşırıyordu.
    const source = readFileSync(join(process.cwd(), "src/components/TerminalArea.tsx"), "utf8");
    expect(source).toMatch(/gridTemplateColumns:\s*`repeat\(\$\{grid\.cols\}, minmax\(0, 1fr\)\)`/);
    expect(source).toMatch(/gridTemplateRows:\s*`repeat\(\$\{grid\.rows\}, minmax\(0, 1fr\)\)`/);
  });
});

/**
 * Öneri listesi ters sırada çiziliyor: en yeni komut en ALTTA, istem satırına
 * en yakın. Sebebi kabuk alışkanlığı — "yukarı ok = daha eski". Sıralamayı
 * düzeltmek CSS'in işi (`column-reverse`); JavaScript tarafı listeyi her zaman
 * en yeniden eskiye veriyor. İkisinden biri değişirse yön ters döner ve yukarı
 * ok daha YENİ komuta gider.
 */
describe("öneri listesi", () => {
  it("en yeni öneri altta", () => {
    expect(ruleBody(".suggest-list")).toMatch(/flex-direction:\s*column-reverse/);
  });

  it("liste yükseklik sınırı ve kaydırma var", () => {
    // Sınır olmadan uzun liste terminali ekrandan atıyor.
    const body = ruleBody(".suggest-list");
    // Deger artik satir yuksekliginden turuyor (bkz. "oneri paneli"); burada
    // sorulan tek sey bir SINIRIN olmasi.
    expect(body).toMatch(/max-height:\s*(?:\d|calc\()/);
    expect(body).toMatch(/overflow-y:\s*auto/);
  });

  it("kutu değil şerit: yuvarlak köşe ve gölge yok", () => {
    // Yuvarlak köşeli, gölgeli, kenarlardan boşluklu bir kutu "geçici, imlece
    // ait bir balon" diye okunuyordu. Liste ise ekranın bir bölgesi: komut
    // satırının üstünde duran, kenardan kenara bir şerit.
    const body = ruleBody(".suggest-bar");
    expect(body, "yuvarlak köşe geri gelmiş").not.toMatch(/border-radius/);
    expect(body, "gölge geri gelmiş").not.toMatch(/box-shadow/);
    expect(body, "üst kenarlık şeridi ayıran tek çizgi").toMatch(
      /border-top:\s*1px solid var\(--border\)/,
    );
  });
});

/**
 * Komut satırının üstündeki ayırıcı çizgi.
 *
 * "Komut yazma yeri olduğu belli olsun" istendi. İstem dipte sabitken girdi
 * alanı her zaman son satır, yani çizginin yeri ölçülebilir: dipten bir satır
 * yukarı.
 */
describe("komut satırı ayırıcısı", () => {
  const SEL = '.term-host[data-prompt-bottom="1"]::after';

  it("dipten bir satır yukarıda duruyor", () => {
    const body = ruleBody(SEL);
    // Satır yüksekliği yazı tipine bağlı; CSS onu tek başına bilemiyor, bu
    // yüzden TerminalSession `--cell-h` yazıyor. Sabit bir değere düşmek
    // yazı tipi büyüdüğünde çizgiyi satırın ortasına getirirdi.
    expect(body).toMatch(/bottom:\s*calc\(10px \+ var\(--cell-h/);
    expect(body).toMatch(/border-top:\s*1px solid/);
  });

  it("tıklamayı yutmuyor", () => {
    // Çizgi terminalin üzerinde duruyor; seçim ve bağlantı tıklaması onun
    // altından geçmeli.
    expect(ruleBody(SEL)).toMatch(/pointer-events:\s*none/);
  });

  it("yalnızca istem dipteyken çiziliyor", () => {
    // Ayar kapalıyken istem ekranın herhangi bir yerinde olabilir; dipten bir
    // satır yukarıdaki çizgi çıktının ortasından geçerdi.
    expect(CSS).toContain('data-prompt-bottom="1"');
  });
});

/**
 * Pencere iskeleti: durum çubuğu HER ZAMAN görünür kalmalı.
 *
 * ÖLÇÜLEN HATA. Kullanıcının dört grubu ve dokuz sekmesi varken pencere
 * kısaldığında durum çubuğu ekranın dışına itiliyordu — 400px yükseklikte
 * çerçevenin 251px altında. Aynı anda soldaki grup listesi de kaydırılamıyordu.
 *
 * İkisi tek sebep: `overflow-y: auto` kaydırma için TEK BAŞINA yetmiyor.
 * Esnek öğenin ve ızgara izinin otomatik alt sınırı içerik boyutu, yani kutu
 * hiç küçülmüyor — kaydırılacak bir taşma oluşmuyor, onun yerine kutu büyüyüp
 * altındaki her şeyi dışarı itiyor.
 *
 * Aynı hata `.main` için bir kez çözülmüştü (`min-height: 0`); bir üst katmanda
 * atlanmıştı. Üç kural birlikte gerekiyor ve üçü de burada bağlı.
 */
describe("iskelet yüksekliği", () => {
  it("ana ızgara satırı içeriğe göre büyüyemiyor", () => {
    // Yalın `1fr` iznin otomatik alt sınırı min-content: kenar çubuğu uzayınca
    // satır pencereden yüksek oluyor ve durum çubuğu dışarı taşıyor.
    const rows = /grid-template-rows:\s*([^;]+);/.exec(ruleBody(".app"))![1];
    expect(rows, `.app satırları içeriğe göre büyüyebiliyor: ${rows}`).toMatch(
      /minmax\(\s*0\s*,\s*1fr\s*\)/,
    );
  });

  it("kenar çubuğu ızgara izini şişiremiyor", () => {
    expect(ruleBody(".sidebar"), ".sidebar sıkışamıyor").toMatch(/min-height:\s*0/);
  });

  it("grup listesi gerçekten kaydırılabiliyor", () => {
    // `overflow-y: auto` tek başına yetmiyor; kutunun küçülebilmesi de gerekiyor.
    const body = ruleBody(".sidebar-scroll");
    expect(body, "kaydırma tanımlı değil").toMatch(/overflow-y:\s*auto/);
    expect(body, "min-height: 0 yok — kutu küçülemez, kaydırma da oluşmaz").toMatch(
      /min-height:\s*0/,
    );
  });
});

/**
 * Durum çubuğunun daralma davranışı.
 *
 * Ölçülmüş iki hata bu bölümün arkasında duruyor. İkisi de o zamanki DURUM
 * ROZETLERİNDE çıktı; rozetler bugün çubukta değil, "⋯" menüsünde (gerekçesi
 * `StatusBar.tsx`) ve kuralları da onlarla birlikte silindi. Hatalar yine de
 * burada yazılı: aynı tuzağa çubuğa yeni bir şey eklerken düşülüyor.
 *
 * 1. Pencere daraldığında "Komut önerisi desteklenmiyor" gibi çok sözcüklü bir
 *    rozet ikinci satıra sarıyordu: yüksekliği 15px'ten 30px'e çıkıp 24px'lik
 *    çubuğu taşırıyor ve sol komşusunun ÜZERİNE biniyordu.
 *
 * 2. Sarma kesildikten sonra rozet bu kez, yer sıkıntısı OLMADIĞI hâlde
 *    kısalmaya başladı. Sebebi incelikli: açığı önce yol kapatsın diye yola çok
 *    büyük bir sıkışma katsayısı verilmişti, rozete kalan pay 0.02px gibi bir
 *    değerdi — ama `text-overflow: ellipsis` payın büyüklüğüne bakmıyor, bir
 *    pikselin altındaki eksik bile son harfi üç noktaya çeviriyor.
 *
 * Bugünkü kural bu yüzden kesin: çubuktaki hiçbir şey SIKIŞMAZ. Sığmayan her
 * şey "⋯" menüsüne gidiyor, yani gizlemek bilgi kaybı değil.
 *
 * Sığdırma kararı CSS'te değil `statusFit.ts` içinde (gerekçesi orada, testi de
 * `statusFit.test.ts`); burada yalnızca o kararın uygulanabilmesi için gereken
 * stil değişmezleri bağlı.
 */
describe("durum çubuğu daralması", () => {
  const SOURCE = readFileSync(join(process.cwd(), "src/components/StatusBar.tsx"), "utf8");

  it("bilgi öğeleri sıkışmıyor", () => {
    // Yarım kalmış bir sayı ya da kırpılmış bir grup adı, olmayan bilgiden
    // kötü: bunlar küçülmez, sırası gelince tümden gider.
    expect(ruleBody(".statusbar .item"), ".item sıkışabiliyor").toMatch(/flex:\s*none/);
  });

  it("hiçbir öğe sıkışmıyor", () => {
    // Sığdırma hesabı ölçülen genişliği GEREKEN genişlik sayıyor. Sıkışabilen
    // tek bir öğe bile bu varsayımı sessizce bozar: hesap "sığıyor" derken
    // gerçekte yarısı kırpılmış bir öğe kalır.
    for (const selector of [".statusbar .item", ".statusbar .cwd", ".statusbar .status-btn"]) {
      expect(ruleBody(selector), `${selector} sıkışabiliyor`).toMatch(/flex:\s*none/);
    }
  });

  it('"⋯" düğmesi her zaman çubukta', () => {
    // Durum okumalarının TEK yolu bu düğme. Bir zamanlar yalnızca bir şey
    // sığmadığında beliriyordu (`[data-in]`); o hâliyle geniş bir pencerede
    // pid'e ya da komut takibine ulaşmanın hiçbir yolu kalmazdı.
    expect(ruleBody(".statusbar .status-more"), "düğme koşullu gizli").not.toMatch(
      /display:\s*none/,
    );
    expect(CSS, "`data-in` kapısı geri gelmiş").not.toContain(".status-more[data-in]");
  });

  it("yol segment sınırından kısalıyor", () => {
    // Esneklikle sıkıştırıp soldan kırpmak sözcüğün ortasından geçiyordu
    // ("ks/Other_Projects"); ayrıca `direction: rtl` bidi yüzünden yolun
    // başındaki eğik çizgiyi görsel olarak sona taşıyordu.
    expect(SOURCE, "yol kısaltılmadan basılıyor").toMatch(/shortenPath\(tab\.cwd/);
    expect(ruleBody(".statusbar .cwd"), "rtl kırpma numarası geri gelmiş").not.toMatch(
      /direction:\s*rtl/,
    );
  });

  it("gizleme kuralı var ve geç geliyor", () => {
    // `.statusbar [data-out]` ile `.statusbar .item` aynı özgüllükte (0,2,0);
    // ikisi de `display` yazıyor, dolayısıyla kazananı SIRA belirliyor. Kural
    // yukarı taşınırsa gizleme sessizce çalışmaz olur.
    expect(ruleBody(".statusbar [data-out]"), "gizleme kuralı display vermiyor").toMatch(
      /display:\s*none/,
    );
    expect(
      CSS.indexOf(".statusbar [data-out] {"),
      "gizleme kuralı .item kuralından önce geliyor — display: flex onu eziyor",
    ).toBeGreaterThan(CSS.indexOf(".statusbar .item {"));
  });

  it("öncelik numaraları tanımlı aralıkta", () => {
    // Numarayı büyütüp `MAX_DROP_LEVEL`i unutmak sessiz bir hata: o öncelik
    // hiç gizlenmez ve düzen yine taşar.
    const max = Number(/MAX_DROP_LEVEL\s*=\s*(\d+)/.exec(SOURCE)![1]);
    const used = [
      ...new Set(
        [...SOURCE.matchAll(/data-drop=(?:"(\d)"|\{[^}]*?"(\d)"[^}]*?\})/g)].flatMap((m) =>
          [m[1], m[2]].filter(Boolean).map(Number),
        ),
      ),
    ];
    expect(used.length, "StatusBar.tsx hiç data-drop kullanmıyor").toBeGreaterThan(0);
    expect(Math.max(...used), `MAX_DROP_LEVEL (${max}) kullanılan en büyük numaradan küçük`)
      .toBeLessThanOrEqual(max);
  });

  it("yol en son gidiyor", () => {
    // Sıra: profil (sekmenin üstünde de yazıyor) → grup (kenar çubuğunda da
    // yazıyor) → yol. Yol en son çünkü başka hiçbir yerde yazmıyor; ilk giden
    // olsaydı çubuk en çok işe yaradığı bilgiyi ilk elden atardı.
    const drop = (status: string) =>
      Number(
        new RegExp(`data-drop="(\\d)"\\s*\\n?\\s*data-status="${status}"`).exec(SOURCE)![1],
      );
    expect(drop("profile"), "profil yoldan sonra gidiyor").toBeLessThan(drop("cwd"));
    expect(drop("group"), "grup yoldan sonra gidiyor").toBeLessThan(drop("cwd"));
  });

  it("düğmeler hiçbir düzeyde kaybolmuyor", () => {
    // Eski davranışta kırpılan İLK şey bunlardı, çünkü en sağdaydılar.
    // Çapa `<button` — özniteliğin ADINDAN değil ÖĞENİN başından kesiyoruz.
    // İlk sürüm `className=...` satırını çapa almıştı ve ondan ÖNCE eklenen
    // bir `data-drop`u görmüyordu: mutasyon denemesinde test geçiyordu.
    const at = SOURCE.indexOf("<button");
    expect(at, "düğme bulunamadı").toBeGreaterThan(-1);
    expect(
      SOURCE.slice(at).replace(/className="status-btn status-more"/, ""),
      "düğmelere data-drop verilmiş — çubuğun tek eylemi kaybolabilir",
    ).not.toMatch(/data-drop/);
    expect(CSS, ".status-btn gizleyen bir kural var").not.toMatch(
      /\.status-btn[^{[]*\{[^}]*display:\s*none/,
    );
  });

  it("menü çubuğun dışında duruyor", () => {
    // Sığdırma hesabı çubuğun DOĞRUDAN ÇOCUKLARINI ölçüyor. Menü içeride
    // olsaydı bir "durum öğesi" sayılır ve çubuk kendini gereğinden dar
    // sanardı — üstelik yalnızca menü açıkken.
    const bar = SOURCE.indexOf('<div className="statusbar"');
    const menu = SOURCE.indexOf("<ContextMenu");
    expect(bar, "çubuk bulunamadı").toBeGreaterThan(-1);
    expect(menu, "menü çizilmiyor").toBeGreaterThan(bar);
    expect(
      SOURCE.slice(bar, menu),
      "menü çubuğun içinde — ölçüme fazladan bir öğe olarak girer",
    ).toContain("</div>");
  });
});

/**
 * Düğme hizalaması.
 *
 * Ölçülmüş bir gerileme: temel `button` kuralına `justify-content: center`
 * konulduğunda düğme bir flex kabı olduğu için `text-align: left` ezildi ve
 * sola dayalı olması gereken her şey ortaya kaydı — sağ tık menüsü girdileri,
 * öneri listesi satırları, "sekme ekle" ve ayarlar penceresinin bölüm listesi.
 * Kullanıcı bunu ayarlar penceresinde gördü.
 *
 * Merkezleme yalnızca içerikten geniş olabilen düğmelerde anlamlı; kararın
 * temel kuralda değil bileşende olması gerekiyor.
 */
describe("düğme hizalaması", () => {
  it("temel düğme kuralı hizalamayı zorlamıyor", () => {
    const body = ruleBody("button");
    expect(
      body,
      "temel kural justify-content vermemeli: sola dayalı düğmeleri ezer",
    ).not.toMatch(/justify-content/);
  });

  it("sola dayalı düğmeler text-align: left taşıyor", () => {
    // `.add-tab` bu listede DEĞİL: içeriği kadar yer kaplayıp sağa dayanıyor,
    // dolayısıyla metin hizası anlamsız (gerekçe `.add-tab` kuralında).
    for (const selector of [".ctx-item", ".suggest-row", ".settings-nav button"]) {
      expect(ruleBody(selector), `${selector} sola dayalı olmalı`).toMatch(
        /text-align:\s*left/,
      );
    }
  });

  it("sekme ekle düğmesi sağa yapışık", () => {
    // Bildirilen hata: düğme tam genişlikteyken tıklama hedefi son sekme
    // satırının hemen altında, aynı sütunda uzanıyordu; sekmeye nişan alıp
    // birkaç piksel aşağı kayan tıklama istemeden yeni sekme açıyordu.
    const body = ruleBody(".add-tab");
    expect(body, "düğme yine tam genişlikte").not.toMatch(/width:\s*100%/);
    expect(body, "sağa dayama yok").toMatch(/margin-left:\s*auto/);

    // Boş grupta tam genişlik geri geliyor ve bu kasıtlı: üstünde yanlışlıkla
    // nişan alınacak bir sekme satırı yok, düğme de tek yönlendirme.
    const prominent = ruleBody(".add-tab.prominent");
    expect(prominent, "boş grupta tam genişlik kaybolmuş").toMatch(/width:\s*100%/);
    expect(prominent, "boş grupta sağa dayama kaldırılmamış").toMatch(/margin-left:\s*0/);
  });

  it("içerikten geniş olabilen düğmeler ortalanıyor", () => {
    // `.seg`, panel kip sekmeleri ve pencere altlığı: bunlar esneyip
    // içeriğinden geniş olabiliyor, ortalanmazsa metin sola yapışıyor.
    const at = CSS.indexOf(".seg button,");
    expect(at, "ortalama kuralı bulunamadı").toBeGreaterThan(-1);
    const rule = CSS.slice(at, CSS.indexOf("}", at));
    expect(rule).toMatch(/justify-content:\s*center/);
    expect(CSS.slice(at, at + 120)).toContain(".modal-foot button");
  });
});

/**
 * Ayar penceresinin izgara hizası.
 *
 * Üç ayrı kural AYNI izgarayı kuruyor — `.field` (tek ayar satırı), `.section`
 * (bölüm gövdesi) ve `.settings-form` (iki panelli bölümlerin sağ tarafı) —
 * ve denetim sütununun üçünde de aynı yerde başlaması gerekiyor. Sütun
 * genişliği ya da boşluğu birinde değişirse öteki ikisi kayıyor.
 *
 * Bu soyut bir kaygı değil: yoğunluk çalışmasında `.field`in boşluğu 8px'e
 * çekildi, `.section` 10px'te kaldı ve denetim sütunu 2px kaydı (ölçülen:
 * 192'ye karşı 194). Gözle fark edilmiyor, düzen yalnızca "biraz bozuk"
 * görünüyor. Ölçüm yakaladı; bu testler bir daha kaymasın diye.
 */
describe("ayarlar izgara hizası", () => {
  const GRIDS = [".field", ".section", ".settings-form"];

  it("üç kural da aynı sütun genişliği değişkenini kullanıyor", () => {
    for (const selector of GRIDS) {
      const body = ruleBody(selector);
      expect(body, `${selector}: grid-template-columns yok`).toMatch(/grid-template-columns/);
      expect(body, `${selector}: etiket sütunu değişkenden gelmiyor`).toContain(
        "var(--label-col)",
      );
    }
  });

  it("denetim sütunu içerik asgarisinin altına inebiliyor", () => {
    // Yalın `1fr` izinin otomatik asgarisi min-content: iz, içindeki en geniş
    // SIKIŞMAYAN öğenin altına inmiyor. Denetim sütununda "Gözat" düğmesi gibi
    // `white-space: nowrap` öğeler var ve bu yüzden Profiller bölümü yatayda
    // kayıyordu — ölçülen: içerik 697px, görünür alan 696px. Tek piksel ama
    // tarayıcının yatay kaydırma çubuğunu göstermesine yetiyor ve tam ekranda
    // bile görünüyordu.
    for (const selector of GRIDS) {
      const body = ruleBody(selector);
      expect(body, `${selector}: minmax(0, 1fr) yok — iz sıkışamıyor`).toMatch(
        /grid-template-columns:\s*var\(--label-col\)\s+minmax\(\s*0\s*,\s*1fr\s*\)/,
      );
    }
  });

  it("alan içindeki denetimler sıkışabiliyor", () => {
    // İzi düzeltmek yetmiyor: esnek öğenin varsayılan `min-width: auto`su da
    // içerik asgarisinde duruyor. Yol kutusu + "Gözat" ikilisi bu yüzden dar
    // pencerede taşıyordu (ölçülen, modal 700px: 161px taşma).
    expect(ruleBody(".field > *"), ".field çocukları sıkışamıyor").toMatch(/min-width:\s*0/);
    // Seçici iki satıra yayılıyor; `ruleBody` tam metni arıyor.
    const inputs = ruleBody(".field input,\n.field select");
    expect(inputs, "girdi ve seçim sıkışamıyor").toMatch(/min-width:\s*0/);
  });

  it("üç kural da aynı sütun boşluğu değişkenini kullanıyor", () => {
    for (const selector of GRIDS) {
      const body = ruleBody(selector);
      expect(body, `${selector}: sütun boşluğu değişkenden gelmiyor`).toMatch(
        /column-gap:\s*var\(--label-gap\)/,
      );
    }
  });

  it("sütun boşluğu sabit sayıyla yazılmamış", () => {
    // `gap: 10px` kısayolu hem satır hem sütun boşluğunu kuruyor; sütun
    // tarafını değişkenin dışına çıkardığı için kayma buradan geliyordu.
    for (const selector of GRIDS) {
      const body = ruleBody(selector);
      expect(body, `${selector}: 'gap' kısayolu sütunu değişkenden koparıyor`).not.toMatch(
        /(?:^|\s|;)gap\s*:/,
      );
    }
  });

  it("değişkenler tanımlı", () => {
    // `:root` dosyada birden çok kez açılıyor (tema değişkenleri ayrı blokta),
    // o yüzden tek bir bloğa değil dosyanın tamamına bakıyoruz.
    expect(CSS, "--label-col tanımsız").toMatch(/--label-col:\s*\d+px/);
    expect(CSS, "--label-gap tanımsız").toMatch(/--label-gap:\s*\d+px/);
  });
});

/**
 * İpucu metninin tek biçimi.
 *
 * Önceden yalnızca `.field .hintline` biçimlenmişti; bölüm düzeyindeki
 * ipuçları (`.section > .hintline`) hiçbir kural bulamayıp gövde ölçüsünde ve
 * tam parlaklıkta kalıyordu — yani ayarın kendisiyle aynı ağırlıkta
 * görünüyorlar, üstelik satır başına daha çok yer kaplıyorlardı. Ölçülen: iki
 * ayrı biçim (`11px / rgb(139,148,158)` ve `13px / rgb(230,237,243)`).
 *
 * Ölçü bugün `rem`: arayüzün bütün yazı ölçüleri ayardan gelen tek bir köke
 * bağlı (`--ui-font-size`). Testin sorduğu şey değişmedi — taban kuralın bir
 * ölçü VERMESİ; sabit bir piksel değeri artık aranmıyor, çünkü aramak
 * ölçeklenmeyi geri almak olurdu.
 */
describe("ipucu metni", () => {
  it("taban kuralda boyut ve renk tanımlı", () => {
    const body = ruleBody(".hintline");
    expect(body, "ipucu boyutu tanımsız").toMatch(/font-size:\s*[\d.]+rem/);
    expect(body, "ipucu rengi tanımsız").toContain("var(--text-dim)");
  });

  it("alan içindeki ipucu biçimi yeniden tanımlamıyor", () => {
    // Yeniden tanımlamak iki biçimin yeniden ayrışmasının yolu.
    const body = ruleBody(".field .hintline");
    expect(body, "font-size tekrar tanımlanmış").not.toMatch(/font-size/);
    expect(body, "renk tekrar tanımlanmış").not.toMatch(/color/);
  });
});

/**
 * "En alta in" düğmesi ile kaydırma çubuğunun çakışmaması.
 *
 * BİLDİRİLEN HATA: düğme çubuğun üstüne biniyordu. İkisinin yeri üç ayrı
 * sayıdan çıkıyor ve üçü de farklı dosyalarda: çubuğun genişliği xterm
 * seçeneğinden (`overviewRuler.width`), çubuğun kenardan uzaklığı `.xterm`in
 * sağ dolgusundan, düğmenin yeri kendi kuralından. Biri değişince ötekiler
 * sessizce çakışıyor — bu yüzden ilişki testle bağlı.
 */
describe("aşağı in düğmesi", () => {
  const SESSION = readFileSync(join(process.cwd(), "src/terminal/TerminalSession.ts"), "utf8");

  /** `padding: a b c d` içinden sağ (b) değerini piksel olarak verir. */
  function rightPadding(selector: string): number {
    const padding = paddingOf(selector)!;
    return Number.parseFloat(padding.split(/\s+/)[1]);
  }

  it("çubuğun soluna, payla yerleşiyor", () => {
    const rulerWidth = Number(/overviewRuler:\s*\{\s*width:\s*(\d+)\s*\}/.exec(SESSION)![1]);
    const pad = rightPadding(".term-host .xterm");
    const body = ruleBody(".scroll-bottom");
    const right = Number.parseFloat(/(?:^|\s|;)right:\s*(\d+)px/.exec(body)![1]);

    // Çubuğun sol kenarı: dolgu + genişlik. Düğme oradan başlamamalı.
    expect(
      right,
      `düğme çubuğun üstünde: çubuk ${pad}-${pad + rulerWidth}px, düğme ${right}px'ten başlıyor`,
    ).toBeGreaterThan(pad + rulerWidth);
  });

  it("süre rozeti de çubuğa yapışmıyor", () => {
    // BİLDİRİLEN HATA: "52 ms yazısı scroll'a yakın". Rozetin yeri sağ dolgu
    // 14px'ken metnin kenarına denk geliyordu; dolgu daralınca çubuğun üstüne
    // düştü. İkisi arasında görünür bir pay kalmalı.
    const rulerWidth = Number(/overviewRuler:\s*\{\s*width:\s*(\d+)\s*\}/.exec(SESSION)![1]);
    const pad = rightPadding(".term-host .xterm");
    const right = Number.parseFloat(
      /(?:^|\s|;)right:\s*(\d+)px/.exec(ruleBody(".block-badge"))![1],
    );
    expect(
      right - (pad + rulerWidth),
      "süre rozeti ile kaydırma çubuğu arasında pay yok",
    ).toBeGreaterThanOrEqual(6);
  });

  it("düğme düzende yer kaplamıyor", () => {
    // Terminalin üstünde YÜZÜYOR. Akışa girseydi bir satırlık yer alır ve
    // xterm'in satır hesabını kaydırırdı (bu dosyanın en başındaki ders).
    expect(ruleBody(".scroll-bottom")).toMatch(/position:\s*absolute/);
  });

  it("sağ dolgu çubuğu pencere kenarına yaklaştırıyor", () => {
    // 14px'ken çubuğun sağında ölü bir şerit kalıyordu; kullanıcı bunu
    // "scroll'un sağında boşluk var" diye bildirdi.
    expect(rightPadding(".term-host .xterm")).toBeLessThanOrEqual(6);
  });
});

/**
 * Ayar açıklamalarının "i" düğmesi ve satırların sol kenarı.
 *
 * İki BİLDİRİLEN hata, ikisi de aynı ızgaradan:
 *
 *  1. Düğmenin sütunu yazılmamıştı. `.section > *` varsayılanı her çocuğu
 *     `1 / -1` yaptığı için bölüm düzeyindeki düğme kendi satırına düşüyor,
 *     ekranda ayarın ALTINDA ve en solda görünüyordu.
 *  2. Onay kutusu satırları denetim sütununa hizalıydı; solunda 180px boş
 *     alan kalıyordu ve bölümün sol kenarı iki yerden okunuyordu. Kullanıcı:
 *     "ayarlar sola yapışık olsun".
 *
 * Üç ızgara (`.field`, `.section`, `.settings-form`) aynı üç izi taşımak
 * zorunda: biri ikili kalırsa o ızgaradaki düğme sütununu bulamaz.
 */
describe("ayar açıklaması sütunu", () => {
  const GRIDS = [".field", ".section", ".settings-form"];

  it("üç ızgarada da üçüncü iz var", () => {
    for (const selector of GRIDS) {
      expect(ruleBody(selector), `${selector}: bilgi sütunu izi yok`).toMatch(
        /grid-template-columns:\s*var\(--label-col\)\s+minmax\(\s*0\s*,\s*1fr\s*\)\s+var\(--info-col\)\s+var\(--undo-col\)/,
      );
    }
  });

  it("bilgi sütunu sabit genişlikte tanımlı", () => {
    // `auto` OLMAZ: açıklaması olmayan satırlarda sütun 0'a iner ve o satırın
    // denetimi 20px genişler — denetimlerin sağ kenarı satır satır oynar.
    expect(CSS, "--info-col tanımsız").toMatch(/--info-col:\s*\d+px/);
    expect(CSS, "--undo-col tanımsız").toMatch(/--undo-col:\s*\d+px/);
  });

  it("düğme kesin sütunda", () => {
    const body = ruleBody(".field > .info,\n.section > .info,\n.settings-form > .info");
    expect(body, "düğmenin sütunu yazılmamış").toMatch(/grid-column:\s*3/);
  });

  it("onay kutusu satırı soldan başlıyor, bilgi sütununu yutmuyor", () => {
    const body = ruleBody(".section > .check-row,\n.section > .seg");
    expect(body, "onay kutusu hâlâ denetim sütununda").toMatch(/grid-column:\s*1\s*\/\s*3/);
    expect(body, "satırın sonuna kadar uzuyor: bilgi sütunu kalmıyor").not.toMatch(
      /grid-column:\s*1\s*\/\s*-1/,
    );
    expect(ruleBody(".settings-form > .check-row"), "profil formunda sol hizalama yok").toMatch(
      /grid-column:\s*1\s*\/\s*3/,
    );
  });

  it("açıklama katmanı akışta yer kaplamıyor", () => {
    // Satırın altında yer açsaydı kazanılan yoğunluk geri giderdi.
    const body = ruleBody(".info-pop");
    expect(body, "katman akışta").toMatch(/position:\s*absolute/);
    expect(body, "sağa hizalı değil: pencereden taşar").toMatch(/right:\s*0/);
  });
});

/**
 * Öneri / geçmiş paneli.
 *
 * BİLDİRİLEN HATA: "Komut yazın kısmında yukarı oka bastım sonra pencereyi
 * resize ettim, GEÇMİŞ kısmının boyutu bozuk geldi."
 *
 * İki ayrı kusur aynı ekranda görünüyordu:
 *
 * 1. Panel `position: fixed` ve yeri ÖLÇÜMLE bulunuyor; ölçüm yalnızca çizime
 *    bağlıydı. Pencere yeniden boyutlandığında bileşenin abone olduğu hiçbir
 *    depo dilimi değişmiyor, dolayısıyla yeniden çizim de yok — panel eski
 *    genişliği ve eski üst kenarıyla ekranın ortasında kalıyordu.
 *
 * 2. Listenin sınırı sabit bir piksel değeriydi (112px), satır ise 24px:
 *    112 / 24 = 4.67, yani alt kenardan yarım satır sarkıyordu. Arayüz yazı
 *    ölçüsü ayardan değişince sapma her değerde başka bir kesire dönüşüyor —
 *    düzeltilecek tek bir sayı yok, sabitin kendisi yanlış.
 */
describe("öneri paneli", () => {
  const SOURCE = readFileSync(join(process.cwd(), "src/components/SuggestionBar.tsx"), "utf8");

  it("liste sınırı satır yüksekliğinin TAM KATI", () => {
    // Sabit bir piksel değeri her yazı ölçüsünde başka bir kesir bırakır.
    const body = ruleBody(".suggest-list");
    expect(body, "sınır satır yüksekliğinden türemiyor").toMatch(
      /max-height:\s*calc\(\s*\d+\s*\*\s*var\(--suggest-row-h\)\s*\)/,
    );
    expect(body, "sabit piksel sınırı geri gelmiş").not.toMatch(/max-height:\s*\d+px/);
  });

  it("satır ölçüleri sınırla AYNI değişkenlerden geliyor", () => {
    // İki taraf ayrı yazılırsa biri değişip öteki unutulduğunda yarım satır
    // sarkması sessizce geri gelir.
    const row = ruleBody(".suggest-row");
    expect(row, "satır yüksekliği değişkenden gelmiyor").toMatch(
      /line-height:\s*var\(--suggest-row-line\)/,
    );
    expect(row).toMatch(/font-size:\s*var\(--suggest-row-font\)/);
    expect(row).toMatch(/padding:\s*var\(--suggest-row-pad\)/);
  });

  it("düzen değişince yeniden yerleşiyor", () => {
    // `resize` tek başına yetmiyor: kenar çubuğunu sürüklemek pencereyi
    // büyütmüyor ama panelin dayanağını yerinden oynatıyor.
    expect(SOURCE, "gözlemci yok — panel eski yerinde kalır").toContain("new ResizeObserver");
    expect(SOURCE, "dayanaklar gözlenmiyor").toContain('".command-input", ".terminal-area"');
    expect(SOURCE, "pencere yeniden boyutlanması dinlenmiyor").toContain(
      'window.addEventListener("resize"',
    );
  });
});
