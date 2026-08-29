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
    // Satırlar: sekme çubuğu, terminal (1fr), öneri çubuğu, durum çubuğu.
    // Öneri çubuğu görünmediğinde `auto` satır sıfır yükseklikte kalıyor;
    // terminalin ÜSTÜNE bindirmek istem satırını kapatırdı.
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
    expect(areaRows.some((r) => r.includes("suggest")), "öneri çubuğunun alanı yok").toBe(true);
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
    expect(body).toMatch(/max-height:\s*\d/);
    expect(body).toMatch(/overflow-y:\s*auto/);
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
    for (const selector of [".ctx-item", ".suggest-row", ".add-tab", ".settings-nav button"]) {
      expect(ruleBody(selector), `${selector} sola dayalı olmalı`).toMatch(
        /text-align:\s*left/,
      );
    }
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
 * ipuçları (`.section > .hintline`) hiçbir kural bulamayıp 13px ve tam
 * parlaklıkta kalıyordu — yani ayarın kendisiyle aynı ağırlıkta görünüyorlar,
 * üstelik satır başına daha çok yer kaplıyorlardı. Ölçülen: iki ayrı biçim
 * (`11px / rgb(139,148,158)` ve `13px / rgb(230,237,243)`).
 */
describe("ipucu metni", () => {
  it("taban kuralda boyut ve renk tanımlı", () => {
    const body = ruleBody(".hintline");
    expect(body, "ipucu boyutu tanımsız").toMatch(/font-size:\s*11px/);
    expect(body, "ipucu rengi tanımsız").toContain("var(--text-dim)");
  });

  it("alan içindeki ipucu biçimi yeniden tanımlamıyor", () => {
    // Yeniden tanımlamak iki biçimin yeniden ayrışmasının yolu.
    const body = ruleBody(".field .hintline");
    expect(body, "font-size tekrar tanımlanmış").not.toMatch(/font-size/);
    expect(body, "renk tekrar tanımlanmış").not.toMatch(/color/);
  });
});
