import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  BUNDLED_FONTS,
  CANDIDATE_FONTS,
  UI_FONT_CANDIDATES,
  detectInstalled,
  fontStack,
  isFontInstalled,
  uiFontStack,
  withUiFallback,
} from "./fonts";

/**
 * Gömülü yazı tipleri üç yerde birden doğru olmak zorunda: listede
 * (`fonts.ts`), `@font-face` bildiriminde (`styles/fonts.css`) ve diskte.
 *
 * Üçü ayrıştığında hata SESSİZ: kullanıcı listeden bir yazı tipi seçiyor,
 * tarayıcı aileyi bulamıyor ve jenerik `monospace`e düşüyor. Terminal
 * çalışmaya devam ediyor, yalnızca kötü görünüyor — kimse "hata" olarak
 * bildirmiyor, o yüzden testle bağlı.
 */
const CSS = readFileSync(join(process.cwd(), "src/styles/fonts.css"), "utf8");
const DIR = join(process.cwd(), "src/assets/fonts");

/** Bir ailenin `@font-face` bloklarını çıkarır. */
function faces(family: string) {
  return [...CSS.matchAll(/@font-face\s*\{([^}]*)\}/g)]
    .map((m) => m[1])
    .filter((body) => new RegExp(`font-family:\\s*"${family}"`).test(body))
    .map((body) => ({
      style: /font-style:\s*(\w+)/.exec(body)?.[1],
      weight: /font-weight:\s*(\d+)/.exec(body)?.[1],
      url: /url\("([^"]+)"\)/.exec(body)?.[1],
    }));
}

describe("gömülü yazı tipleri", () => {
  it("liste boş değil", () => {
    expect(BUNDLED_FONTS.length).toBeGreaterThan(0);
  });

  it("her ailenin dört kesimi tanımlı", () => {
    // Terminalin kullandığı küme tam olarak bu dördü: xterm kalın ve eğik
    // metni ANSI kaçışlarından çiziyor. Eğik kesim eksikse tarayıcı harfleri
    // kendi eğiyor (yapay italik) ve eş aralık bozuluyor.
    for (const font of BUNDLED_FONTS) {
      const found = faces(font.family);
      const kesimler = found.map((f) => `${f.style}/${f.weight}`).sort();
      expect(kesimler, `${font.family}: eksik kesim`).toEqual([
        "italic/400",
        "italic/700",
        "normal/400",
        "normal/700",
      ]);
    }
  });

  it("bildirilen her dosya diskte var", () => {
    for (const font of BUNDLED_FONTS) {
      for (const face of faces(font.family)) {
        expect(face.url, `${font.family}: src yok`).toBeTruthy();
        const path = join(process.cwd(), "src/styles", face.url!);
        expect(existsSync(path), `dosya yok: ${face.url}`).toBe(true);
      }
    }
  });

  it("yığın kendi ailesiyle başlıyor ve jenerikle bitiyor", () => {
    // Ayara yazılan değer bu yığın. Aile başta olmazsa gömülü yazı tipi hiç
    // kullanılmaz; sonda jenerik olmazsa eksik bir glif tanımsız davranışa
    // düşer.
    for (const font of BUNDLED_FONTS) {
      expect(font.stack.startsWith(font.family), `${font.family}: yığın aileyle başlamıyor`).toBe(
        true,
      );
      expect(font.stack.trim().endsWith("monospace"), `${font.family}: jenerik geri düşüş yok`).toBe(
        true,
      );
    }
  });

  it("lisans dosyaları yazı tiplerinin yanında", () => {
    // İkisi de SIL Open Font License 1.1 ile geliyor; lisans metnini birlikte
    // dağıtmak şart.
    const dosyalar = readdirSync(DIR);
    expect(dosyalar.some((f) => /OFL|LICENSE/i.test(f)), "lisans dosyası yok").toBe(true);
    // Paketlenmiş her aile için bir lisans metni bulunmalı.
    for (const font of BUNDLED_FONTS) {
      const ad = font.family.replace(/\s+/g, "");
      expect(
        dosyalar.some((f) => f.startsWith(ad) && /OFL|LICENSE/i.test(f)),
        `${font.family}: lisans dosyası yok`,
      ).toBe(true);
    }
  });

  it("kullanılmayan yazı tipi dosyası paketlenmemiş", () => {
    // Her woff2'nin bir `@font-face`i olmalı: paketin içinde hiç yüklenmeyen
    // bir dosya taşımak uygulamayı boşuna büyütüyor.
    for (const dosya of readdirSync(DIR).filter((f) => f.endsWith(".woff2"))) {
      expect(CSS, `${dosya} hiçbir @font-face tarafından kullanılmıyor`).toContain(dosya);
    }
  });
});

/**
 * Kurulu yazı tiplerinin bulunması.
 *
 * Neden ölçüme dayanıyor: tarayıcı "kurulu olanları say" diye bir yol vermiyor.
 * Aynı metni "aile, jenerik" ve yalnızca "jenerik" ile çizip genişlikleri
 * karşılaştırıyoruz; aile yoksa tarayıcı jeneriğe düşüyor ve iki ölçüm eşit
 * çıkıyor.
 */
describe("kurulu yazı tipi bulma", () => {
  /** Yalnızca `kurulu` kümesindeki aileleri tanıyan sahte ölçer. */
  const olcer = (kurulu: string[]) => (spec: string) => {
    const aile = /^"([^"]+)"/.exec(spec)?.[1];
    if (aile && kurulu.includes(aile)) return 500;
    // Jenerikler ve bilinmeyen aileler taban genişliğe düşüyor.
    return spec.includes("sans-serif") ? 400 : 300;
  };

  it("kurulu aileyi buluyor", () => {
    expect(isFontInstalled("Hack", olcer(["Hack"]))).toBe(true);
  });

  it("kurulu olmayanı elemiyor", () => {
    expect(isFontInstalled("Hack", olcer([]))).toBe(false);
  });

  it("sistemin varsayılan eş aralıklısını KAÇIRMIYOR", () => {
    // ÖNEMLİ DURUM: aile sistemin varsayılan `monospace`i olduğunda o jenerikle
    // ölçüm eşit çıkıyor ve kurulu bir yazı tipi "yok" sayılıyordu. Windows'ta
    // Consolas tam olarak böyle. İkinci jenerik (`sans-serif`) bunu yakalıyor.
    const varsayilan = (spec: string) => {
      if (spec.includes("sans-serif")) return spec.startsWith('"Consolas"') ? 300 : 400;
      return 300; // hem "Consolas, monospace" hem düz "monospace" aynı
    };
    expect(isFontInstalled("Consolas", varsayilan)).toBe(true);
  });

  it("sırayı koruyor ve yalnızca kurulu olanları veriyor", () => {
    const out = detectInstalled(["A", "B", "C"], olcer(["C", "A"]));
    expect(out).toEqual(["A", "C"]);
  });

  it("aday listesi boş değil ve tekrarsız", () => {
    expect(CANDIDATE_FONTS.length).toBeGreaterThan(5);
    expect(new Set(CANDIDATE_FONTS).size).toBe(CANDIDATE_FONTS.length);
  });

  it("yığın aileyle başlıyor, jenerikle bitiyor", () => {
    // Gömülü ailelerdeki kuralın aynısı: aile başta olmazsa seçim işe
    // yaramıyor, sonda jenerik olmazsa eksik glif tanımsız davranışa düşüyor.
    const stack = fontStack("Fira Code");
    expect(stack.startsWith("Fira Code")).toBe(true);
    expect(stack.trim().endsWith("monospace")).toBe(true);
  });
});

/**
 * Arayüz yazı tipi.
 *
 * Önceki seçici bir öneri listesiydi (`datalist`): öneriler yazmadan
 * görünmüyordu ve mac'te yalnızca Windows'ta olan aileler de listedeydi.
 * Şimdi menüde yalnızca ölçülerek bulunan (kurulu) aileler var.
 */
describe("arayüz yazı tipi", () => {
  it("kurulu olmayan aday menüye girmiyor", () => {
    // Ölçüm taklidi: yalnızca Inter "kurulu" — genişliği jeneriklerden farklı.
    const measure = (spec: string) => (spec.startsWith('"Inter"') ? 900 : 800);
    expect(detectInstalled(UI_FONT_CANDIDATES, measure)).toEqual(["Inter"]);
  });

  it("menü seçenekleri yedekli yığın, olduğu gibi kalıyor", () => {
    const stack = uiFontStack("Inter");
    expect(withUiFallback(stack)).toBe(stack);
  });

  it("özel girişe sistem ailesi ekleniyor", () => {
    // Yalnızca "Inter" yazılıp Inter kurulu değilse tarayıcı tırnaklı
    // serif'e düşüyordu: yanlış bir giriş bütün arayüzü bozmamalı.
    expect(withUiFallback("Inter")).toBe("Inter, system-ui, sans-serif");
    expect(withUiFallback("Avenir Next, sans-serif")).toBe("Avenir Next, sans-serif");
    expect(withUiFallback("ui-rounded")).toBe("ui-rounded");
  });
});
