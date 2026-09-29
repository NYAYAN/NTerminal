import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { contrastRatio, luminance as luminanceOf } from "../lib/contrast";
import { ensureContrast, filledColors } from "../lib/contrast";
import { THEMES, getTheme } from "../lib/themes";

/**
 * Grup rengi artık yalnızca ince bir şeritte değil ARKA PLANDA da görünüyor.
 * Bu, okunabilirliği sessizce bozabilecek bir değişiklik: kullanıcı grup rengi
 * olarak herhangi bir rengi seçebiliyor (Ayarlar → Gruplar → Renk yerleşik bir
 * renk seçici) ve arka plan koyulaştıkça sabit renkli soluk metin kayboluyor.
 *
 * Ölçülen ilk hâli: Solarized Açık + siyah grup rengi → alt satır karşıtlığı
 * 2.12, koyu tema + beyaz grup rengi → 2.26. İkisi de okunmuyordu.
 *
 * Bu test CSS'teki karışım oranlarını DOSYADAN okuyup aynı hesabı burada
 * yapıyor: oranı yükseltmek testi düşürür. Amaç bir stil tercihini dondurmak
 * değil, okunabilirlik sınırını korumak.
 */
const CSS = readFileSync(join(process.cwd(), "src/styles/global.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

/** `selector { … color-mix(in srgb, var(--<a>) N%, …) }` içindeki N. */
function mixPercent(selector: string, first: string): number {
  const at = CSS.indexOf(`${selector} {`);
  expect(at, `CSS kuralı bulunamadı: ${selector}`).toBeGreaterThan(-1);
  const body = CSS.slice(at, CSS.indexOf("}", at));
  const re = new RegExp(`color-mix\\(in srgb,\\s*var\\(--${first}\\)\\s*([\\d.]+)%`);
  const match = re.exec(body);
  expect(match, `${selector} içinde ${first} karışımı bulunamadı`).not.toBe(null);
  return Number.parseFloat(match![1]);
}

function rgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ];
}

function toHex([r, g, b]: [number, number, number]): string {
  const h = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** `color-mix(in srgb, a p%, b)` — iki opak renk için düz sRGB karışımı. */
function mix(a: string, b: string, percent: number): string {
  const [ar, ag, ab] = rgb(a);
  const [br, bg, bb] = rgb(b);
  const p = percent / 100;
  return toHex([ar * p + br * (1 - p), ag * p + bg * (1 - p), ab * p + bb * (1 - p)]);
}

const IDLE = mixPercent(".group", "group-color");
const ACTIVE = mixPercent(".group.active", "group-color");
const TABS = mixPercent(".group.active .group-tabs", "group-color");
const DIM = mixPercent(".group .group-count,\n.group .tab-row-sub", "text");

/**
 * Kullanıcının seçebileceği renkler. Uçları (saf siyah, saf beyaz) bilinçli
 * içeriyor: yerleşik renk seçici onları da veriyor ve en kötü durumlar orada.
 */
const COLORS = [
  "#58a6ff",
  "#3fb950",
  "#d29922",
  "#bc8cff",
  "#39c5cf",
  "#ff7b72",
  "#f778ba",
  "#a371f7",
  "#ffffff",
  "#000000",
  "#6e7681",
];

const MIN_NAME = 4.5;
const MIN_DIM = 3.0;

describe("grup rengi okunabilirliği", () => {
  it("karışım oranları CSS'ten okunabildi", () => {
    // Oranlar bulunamazsa aşağıdaki testler sessizce anlamsız hâle gelirdi.
    expect(IDLE).toBeGreaterThan(0);
    expect(ACTIVE).toBeGreaterThan(0);
    expect(TABS).toBeGreaterThan(0);
    expect(DIM).toBeGreaterThan(0);
  });

  for (const meta of THEMES) {
    const theme = getTheme(meta.id);
    const { surfaceAlt, text, textDim } = theme.ui;
    // `.group .group-count` kuralı soluk metni ana metinden türetiyor.
    const dimText = mix(text, textDim, DIM);

    for (const color of COLORS) {
      const idleBg = mix(color, surfaceAlt, IDLE);
      const activeBg = mix(color, surfaceAlt, ACTIVE);
      // Sekme listesi etkin grubun arka planı üzerine bir kat daha alıyor.
      const tabsBg = mix(color, activeBg, TABS);

      it(`${meta.id} / ${color}: grup adı okunabilir`, () => {
        for (const [label, bg] of [
          ["etkin değil", idleBg],
          ["etkin", activeBg],
        ] as const) {
          const ratio = contrastRatio(text, bg);
          expect(ratio, `${label} arka plan ${bg}, karşıtlık ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(
            MIN_NAME,
          );
        }
      });

      it(`${meta.id} / ${color}: soluk metin okunabilir`, () => {
        for (const [label, bg] of [
          ["sekme sayısı", activeBg],
          ["sekme alt satırı", tabsBg],
        ] as const) {
          const ratio = contrastRatio(dimText, bg);
          expect(ratio, `${label} arka plan ${bg}, karşıtlık ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(
            MIN_DIM,
          );
        }
      });
    }
  }
});

/**
 * Öneri listesinin seçili satırı.
 *
 * Bu blok ölçülmüş bir hatadan geliyor: seçili satırın "eklenecek kısmı" vurgu
 * renginde çiziliyordu, arka planı da vurgu renginin açık bir karışımıydı —
 * yani renk rengin üzerine geliyordu. Solarized Açık'ta karşıtlık 2.54'e
 * iniyordu; listenin EN ÖNEMLİ metni en okunmaz olanıydı. Vurgu rengi artık
 * yalnızca arka plan tonunda ve sol kenar çizgisinde.
 */
describe("öneri listesi okunabilirliği", () => {
  const SELECTED = mixPercent(".suggest-row.on", "accent");

  it("seçili satırın vurgu oranı okunabildi", () => {
    expect(SELECTED).toBeGreaterThan(0);
  });

  it("seçili satırın metni vurgu rengi DEĞİL", () => {
    // Vurgu rengini vurgu tonlu arka plana koymak hatanın kendisiydi.
    const at = CSS.indexOf(".suggest-row.on .suggest-rest {");
    expect(at, "seçili satırın metin kuralı bulunamadı").toBeGreaterThan(-1);
    const rule = CSS.slice(at, CSS.indexOf("}", at));
    expect(rule, "seçili satırın metni ana metin renginde olmalı").toMatch(
      /color:\s*var\(--text\)/,
    );
    expect(
      CSS,
      "seçili satır için accent renkli metin kuralı geri gelmiş",
    ).not.toMatch(/\.suggest-row\.on\s+\.suggest-rest\s*\{[^}]*var\(--accent\)/);
  });

  it("seçili olmayan satırın metni soluk", () => {
    // Seçimin metnin kendisinden de okunması için: eskiden ikisi de aynı
    // renk ve aynı kalınlıktaydı, "hangisini seçtim" görsel olarak
    // yanıtlanmıyordu.
    const at = CSS.indexOf(".suggest-rest {");
    const rule = CSS.slice(at, CSS.indexOf("}", at));
    expect(rule).toMatch(/color:\s*var\(--text-dim\)/);
  });

  it("seçili satırda üç ayrı işaret var", () => {
    // Arka plan tonu, sol kenar çizgisi ve istem işaretinin renklenmesi. Biri
    // kaldırılırsa seçim yeniden belirsizleşir.
    //
    // İşaret eskiden yalnızca seçili satırda çizilen bir oktu (`visibility`).
    // Artık her satırda duruyor — satırın bir komut olduğunu o söylüyor — ve
    // seçimi rengiyle bildiriyor.
    const at = CSS.indexOf(".suggest-row.on {");
    const rule = CSS.slice(at, CSS.indexOf("}", at));
    expect(rule, "arka plan tonu").toMatch(/background:\s*color-mix/);
    expect(rule, "sol kenar çizgisi").toMatch(/border-left-color:\s*var\(--accent\)/);
    expect(CSS, "istem işareti kuralı").toMatch(
      /\.suggest-row\.on\s+\.suggest-mark\s*\{[^}]*var\(--accent\)/,
    );
  });

  for (const meta of THEMES) {
    const theme = getTheme(meta.id);

    it(`${meta.id}: seçili öneri metni okunabilir`, () => {
      const bg = mix(theme.ui.accent, theme.ui.surfaceAlt, SELECTED);
      const ratio = contrastRatio(theme.ui.text, bg);
      expect(ratio, `arka plan ${bg}, karşıtlık ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
    });

    it(`${meta.id}: seçili olmayan öneri okunabilir`, () => {
      const ratio = contrastRatio(theme.ui.textDim, theme.ui.surfaceAlt);
      expect(ratio, `karşıtlık ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(3.0);
    });
  }
});

/**
 * Açılır liste satırlarının okunabilirliği.
 *
 * ÖLÇÜLEN SORUN: seçili satır dolgulu `--accent` zeminle çiziliyordu ve dosya
 * yolları okunmuyordu. Yol metni ince, küçük ve uzun; gövde metninde yeten bir
 * karşıtlık burada yetmiyor.
 *
 * Çözüm öneri listesindekiyle aynı: soluk zemin, metnin rengine dokunulmuyor.
 * Bu test o kararı bağlıyor — dolgulu zemine geri dönmek testi düşürür.
 */
describe("açılır liste okunabilirliği", () => {
  const SELECTED = mixPercent(".pop-row.on", "accent");

  it("seçili satırın vurgu oranı okunabildi", () => {
    expect(SELECTED).toBeGreaterThan(0);
  });

  it("seçili satırın metni TEMA METNİ, vurgu rengi üstü değil", () => {
    // `color: var(--accent-fg)` dolgulu zemin demek; testin engellediği şey bu.
    const at = CSS.indexOf(".pop-row.on {");
    const rule = CSS.slice(at, CSS.indexOf("}", at));
    expect(rule).toMatch(/color:\s*var\(--text\)/);
    expect(rule, "dolgulu vurgu zemini geri gelmiş").toMatch(/background:\s*color-mix/);
  });

  for (const meta of THEMES) {
    const theme = getTheme(meta.id);

    it(`${meta.id}: seçili satırdaki yol okunuyor`, () => {
      const bg = mix(theme.ui.accent, theme.ui.surfaceAlt, SELECTED);
      const ratio = contrastRatio(theme.ui.text, bg);
      expect(ratio, `arka plan ${bg}, karşıtlık ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
    });
  }
});

/**
 * Komut satırının sözdizimi renkleri.
 *
 * Riskli olan şey şu: `--ok` / `--err` / `--accent` ARAYÜZ yüzeyine göre
 * düzeltiliyor, komut satırı ise TERMİNAL yüzeyinin üzerinde duruyor. İki
 * yüzey her temada aynı değil. Bu yüzden ayrı değişkenler türetildi; test de
 * onların gerçekten okunur olduğunu doğruluyor.
 *
 * Ayrıca üç rengin BİRBİRİNDEN ayırt edilebilmesi gerekiyor — hepsi okunur
 * ama ikisi aynı tona düşerse renklendirmenin bir anlamı kalmıyor.
 */
describe("komut satırı sözdizimi renkleri", () => {
  const MIN = 4.5;

  for (const meta of THEMES) {
    const theme = getTheme(meta.id);
    const termBg = theme.xterm.background ?? theme.ui.surface;
    const renkler = {
      komut: ensureContrast(theme.ui.accent, termBg, MIN),
      bayrak: ensureContrast(theme.xterm.green ?? "#3fb950", termBg, MIN),
      metin: ensureContrast(theme.xterm.yellow ?? "#d29922", termBg, MIN),
    };

    it(`${meta.id}: üç renk de terminal zemininde okunuyor`, () => {
      for (const [ad, renk] of Object.entries(renkler)) {
        const ratio = contrastRatio(renk, termBg);
        expect(ratio, `${ad} (${renk}) / zemin ${termBg}: ${ratio.toFixed(2)}`)
          .toBeGreaterThanOrEqual(MIN);
      }
    });

    it(`${meta.id}: renkler birbirinden ayırt ediliyor`, () => {
      // Aynı tona düşen iki renk, renklendirmeyi anlamsız kılar.
      const ciftler: [string, string][] = [
        [renkler.komut, renkler.bayrak],
        [renkler.komut, renkler.metin],
        [renkler.bayrak, renkler.metin],
      ];
      for (const [a, b] of ciftler) {
        expect(a === b, `iki belirteç aynı renge düştü: ${a}`).toBe(false);
      }
    });
  }
});

/**
 * Düğme renkleri.
 *
 * Dolgulu düğmenin zemini ve metni CSS'te sabitlenemiyor: vurgu rengi temaya göre
 * açık ya da koyu olabiliyor. Eski hâli `color-mix(accent 12%, #000)` idi —
 * koyu vurgu renginde koyu üstüne koyu. Sonra `onColor()` karşıtlığa bakıp
 * siyah/beyaz seçti: açık bir vurguda hep KOYU yazı çıkıyordu ve kullanıcı bunu
 * yanlış buldu ("Commit düğmesindeki metin rengi yanlış gibi"). Bugün
 * `filledColors()`: metin BEYAZ, zemin beyaza 4.5 karşıtlık verecek kadar koyulaşmış
 * vurgu; ikisi de tema uygulanırken değişkenlere yazılıyor.
 *
 * Durum renkleri (kırmızı/yeşil) terminal paletinden geliyor ama ARAYÜZ
 * yüzeyinde de kullanılıyor. Ölçülen sonuç: Windows Terminal temasında kırmızı
 * metinli düğme 2.87 karşıtlık — okunmuyordu. `ensureContrast` artık aynı
 * renkleri arayüz yüzeyine göre de düzeltiyor.
 */
describe("düğme renkleri", () => {
  const MIN = 4.5;

  // CSS'teki oranlar DOSYADAN okunuyor: oranı değiştirmek okunabilirliği sessizce bozamaz.
  const HOVER = mixPercent("button.primary:hover:not(:disabled)", "accent-solid");
  const ACTIVE_BTN = mixPercent("button.primary:active:not(:disabled)", "accent-solid");
  const DIS_FILL = mixPercent("button.primary:disabled", "accent");
  const DIS_TEXT = mixPercent("button.primary:disabled", "text");
  const CHIP = mixPercent(".git-commit-btn .pill-count", "accent-chip");
  /** Devre dışı düğmede metin için asgari karşıtlık: devre dışı ögeler WCAG'den muaf, ama okunmalı. */
  const MIN_DISABLED = 3.0;

  for (const meta of THEMES) {
    const theme = getTheme(meta.id);
    const surface = theme.ui.surfaceAlt;
    // applyThemeToDocument ile AYNI hesap.
    const accent = ensureContrast(theme.ui.accent, surface, MIN);
    const err = ensureContrast(theme.xterm.red ?? "#ff7b72", surface, MIN);
    const ok = ensureContrast(theme.xterm.green ?? "#3fb950", surface, MIN);
    const primary = filledColors(accent);
    const destructive = filledColors(err);

    it(`${meta.id}: dolgulu birincil düğme okunabilir`, () => {
      const ratio = contrastRatio(primary.text, primary.fill);
      expect(ratio, `dolgu ${primary.fill}, metin ${primary.text}, karşıtlık ${ratio.toFixed(2)}`)
        .toBeGreaterThanOrEqual(MIN);
    });

    it(`${meta.id}: dolgulu birincil düğmenin yazısı BEYAZ`, () => {
      // İstek: koyu lacivert yazı "yanlış gibi" görünüyordu; beyaz yazı için zemin koyulaşıyor.
      expect(primary.text).toBe("#ffffff");
    });

    it(`${meta.id}: dolgulu yıkıcı düğme okunabilir ve beyaz yazılı`, () => {
      const ratio = contrastRatio(destructive.text, destructive.fill);
      expect(ratio, `dolgu ${destructive.fill}, metin ${destructive.text}, karşıtlık ${ratio.toFixed(2)}`)
        .toBeGreaterThanOrEqual(MIN);
      expect(destructive.text).toBe("#ffffff");
    });

    it(`${meta.id}: zemin hâlâ vurgu rengi: ton korunuyor, çamurlaşmıyor`, () => {
      // Koyulaştırma zemini siyaha götürmemeli: parlaklığı vurgunun en az üçte biri kalıyor.
      expect(luminanceOf(primary.fill) / luminanceOf(accent)).toBeGreaterThanOrEqual(0.35);
    });

    it(`${meta.id}: uzerine gelince ve basilinca beyaz yazi okunuyor`, () => {
      // Zemin siyaha karışarak koyulaşıyor, yani karşıtlık ARTIYOR; açıklaşsaydı 4.5'in altına inerdi.
      for (const yuzde of [HOVER, ACTIVE_BTN]) {
        const zemin = mix(primary.fill, "#000000", yuzde);
        const ratio = contrastRatio(primary.text, zemin);
        expect(ratio, `%${yuzde} karışım: ${zemin}, karşıtlık ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(MIN);
      }
    });

    for (const [ad, yuzey] of [
      ["yüzey", theme.ui.surface],
      ["alt yüzey", theme.ui.surfaceAlt],
    ] as const) {
      for (const [tur, renk] of [
        ["birincil", accent],
        ["yıkıcı", err],
      ] as const) {
        it(`${meta.id}: devre dışı ${tur} düğmenin yazısı ${ad} üstünde okunuyor`, () => {
          // Saydam zemin: neyin üstündeyse ona uyuyor. Bileşik renkleri elle kuruyoruz.
          const zemin = mix(renk, yuzey, DIS_FILL);
          const yazi = mix(theme.ui.text, zemin, DIS_TEXT);
          const ratio = contrastRatio(yazi, zemin);
          expect(ratio, `zemin ${zemin}, yazı ${yazi}, karşıtlık ${ratio.toFixed(2)}`)
            .toBeGreaterThanOrEqual(MIN_DISABLED);
        });
      }
    }

    it(`${meta.id}: düğmenin içindeki sayaç hapında sayı okunuyor`, () => {
      // Hap, yazının TERSİ renkten türüyor: beyaz yazıda koyu hap. Yazı rengiyle aynı tonda
      // olsaydı (önceki hâli) sayı 2.9:1'e düşerdi.
      const hap = mix(primary.chip, primary.fill, CHIP);
      const ratio = contrastRatio(primary.text, hap);
      expect(ratio, `hap ${hap}, karşıtlık ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(MIN);
    });

    it(`${meta.id}: sessiz kırmızı düğme okunabilir`, () => {
      // `.danger` yüzey üzerinde kırmızı METİN; panel altlıklarında yan yana
      // birkaç tane olabildiği için dolgu yerine metin kullanılıyor.
      const ratio = contrastRatio(err, surface);
      expect(ratio, `metin ${err} yüzey ${surface}, karşıtlık ${ratio.toFixed(2)}`)
        .toBeGreaterThanOrEqual(MIN);
    });

    it(`${meta.id}: yeşil durum rozeti okunabilir`, () => {
      const ratio = contrastRatio(ok, surface);
      expect(ratio, `karşıtlık ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(MIN);
    });

    it(`${meta.id}: çerçeveli düğme okunabilir`, () => {
      const ratio = contrastRatio(theme.ui.text, surface);
      expect(ratio, `karşıtlık ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(MIN);
    });
  }

  it("birincil düğme zemini ve yazısı yeni değişkenlerden geliyor", () => {
    const at = CSS.indexOf("button.primary {");
    expect(at, "birincil düğme kuralı bulunamadı").toBeGreaterThan(-1);
    const rule = CSS.slice(at, CSS.indexOf("}", at));
    expect(rule).toMatch(/background:\s*var\(--accent-solid\)/);
    expect(rule).toMatch(/color:\s*var\(--accent-fg\)/);
    // Ham vurgu rengi metin olarak kalıyor; dolgu için koyulaştırılmış hâli kullanılıyor.
    expect(rule).not.toMatch(/background:\s*var\(--accent\)/);
  });

  it("uzerine gelince zemin hafif, basilinca daha koyu: iki durum ayirt ediliyor", () => {
    // Hover ince bir geri bildirim (zeminin %80'i ve fazlası kalıyor), basılmış hâl ondan koyu.
    // Hover zemini neredeyse siyaha götürseydi düğme "kayboluyor" gibi görünürdü.
    expect(HOVER).toBeGreaterThanOrEqual(80);
    expect(ACTIVE_BTN).toBeLessThan(HOVER);
    expect(ACTIVE_BTN).toBeGreaterThanOrEqual(65);
  });

  it("yıkıcı düğme zemini ve yazısı yeni değişkenlerden geliyor", () => {
    const at = CSS.indexOf("button.primary.destructive {");
    expect(at, "yıkıcı düğme kuralı bulunamadı").toBeGreaterThan(-1);
    const rule = CSS.slice(at, CSS.indexOf("}", at));
    expect(rule).toMatch(/background:\s*var\(--err-solid\)/);
    expect(rule).toMatch(/color:\s*var\(--err-fg\)/);
    expect(rule, "ham hata rengi zemin olmuş: beyaz yazı okunmaz").not.toMatch(/background:\s*var\(--err\)/);
  });

  it("üzerine gelince ve basılınca zemin SİYAHA karışıyor (açıklaşmıyor)", () => {
    // Testler karışım YÜZDESİNİ dosyadan okuyor ama hedef rengi siyah varsayıyor; hedef beyaza
    // dönerse beyaz yazının karşıtlığı 4.5'in altına iner ve yukarıdaki testler bunu görmez.
    for (const kural of [
      "button.primary:hover:not(:disabled)",
      "button.primary:active:not(:disabled)",
      "button.primary.destructive:hover:not(:disabled)",
      "button.primary.destructive:active:not(:disabled)",
    ]) {
      const at = CSS.indexOf(`${kural} {`);
      expect(at, `${kural} bulunamadı`).toBeGreaterThan(-1);
      expect(CSS.slice(at, CSS.indexOf("}", at)), kural).toMatch(
        /color-mix\(in srgb,\s*var\(--(?:accent|err)-solid\)\s*\d+%,\s*#000\)/,
      );
    }
  });

  it("devre dışı dolgulu düğme opacity ile SOLDURULMUYOR", () => {
    // Temel kuraldaki `opacity: 0.4` koyu yazıyı zemine karıştırıyordu (2.5:1). Birincil düğmede
    // opacity 1 ve ayrı bir soluk zemin + açık yazı var.
    const at = CSS.indexOf("button.primary:disabled {");
    expect(at, "devre dışı birincil kuralı bulunamadı").toBeGreaterThan(-1);
    const rule = CSS.slice(at, CSS.indexOf("}", at));
    expect(rule).toMatch(/opacity:\s*1\s*;/);
    expect(rule).toMatch(/background:/);
    expect(rule).toMatch(/color:/);
  });

  it("devre dışı yıkıcı düğme de soluk kırmızı zeminli VE soluk yazılı", () => {
    // `button.primary.destructive` beyaz yazı veriyor, `button.primary:disabled` ile AYNI
    // özgüllükte ve dosyada sonra geliyor: yazı rengi bu kuralda da olmazsa devre dışı yıkıcı
    // düğme soluk zeminde BEYAZ yazı taşır (açık temada ~1.9:1).
    const at = CSS.indexOf("button.primary.destructive:disabled {");
    expect(at, "devre dışı yıkıcı kuralı bulunamadı").toBeGreaterThan(-1);
    const rule = CSS.slice(at, CSS.indexOf("}", at));
    expect(rule).toMatch(/background:[^;]*var\(--err\)/);
    expect(rule, "yazı rengi eksik: beyaz yazı kalıyor").toMatch(/color:[^;]*var\(--text\)/);
  });

  it("devre dışı yıkıcı yazı yüzdesi birincille AYNI", () => {
    // İki devre dışı düğme aynı dilde konuşsun: yazı oranı tek yerden değişmiyor.
    expect(mixPercent("button.primary.destructive:disabled", "text")).toBe(DIS_TEXT);
    expect(mixPercent("button.primary.destructive:disabled", "err")).toBe(DIS_FILL);
  });

  it("commit sayacı yazının TERSİ renkten türüyor", () => {
    const at = CSS.indexOf(".git-commit-btn .pill-count {");
    expect(at, "sayaç kuralı bulunamadı").toBeGreaterThan(-1);
    const rule = CSS.slice(at, CSS.indexOf("}", at));
    expect(rule).toMatch(/var\(--accent-chip\)/);
    expect(rule, "yazı rengiyle aynı tonda hap").not.toMatch(/var\(--accent-fg\)/);
  });

  it("odak halkası iki katmanlı", () => {
    // Tek katmanlı vurgu renkli halka, vurgu renkli DOLGUNUN üzerinde
    // kayboluyordu (halka ile dolgu aynı renk). İç katman yüzey renginde bir
    // ayırıcı çiziyor.
    const at = CSS.indexOf("button:focus-visible {");
    expect(at, "odak kuralı bulunamadı").toBeGreaterThan(-1);
    const rule = CSS.slice(at, CSS.indexOf("}", at));
    expect(rule).toMatch(/box-shadow:/);
    expect(rule, "iç ayırıcı katman eksik").toMatch(/var\(--surface-alt\)/);
    expect(rule).toMatch(/var\(--accent\)/);
  });
});
