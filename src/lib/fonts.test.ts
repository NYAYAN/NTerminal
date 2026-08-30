import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { BUNDLED_FONTS } from "./fonts";

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
