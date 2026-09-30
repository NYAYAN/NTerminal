// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { contrastRatio, ensureContrast, filledColors, luminance } from "./contrast";
import { THEMES, applyThemeToDocument, getTheme } from "./themes";

/**
 * Dolgulu düğmenin (birincil, yıkıcı) zemini ve yazısı.
 *
 * İSTEK: "Commit düğmesindeki metin rengi yanlış gibi." Eski kural iki renkten
 * karşıtlığı yüksek olanı seçiyordu; açık mavi bir vurguda (`#61afef`) bu hep KOYU
 * yazı demekti. Kullanıcı beyaz yazı istedi; beyaz yazı açık maviye ancak zemin
 * koyulaşırsa okunuyor (2,4:1 → 4,5:1), o yüzden `filledColors` zemini koyulaştırıyor.
 */

describe("filledColors", () => {
  it("açık mavi vurgu: beyaz yazı, zemin 4,5:1 verecek kadar koyulaşıyor", () => {
    const f = filledColors("#61afef");
    expect(f.text).toBe("#ffffff");
    expect(f.fill).toBe("#447ba7");
    expect(contrastRatio(f.text, f.fill)).toBeGreaterThanOrEqual(4.5);
    // Ham vurguyla beyaz yazı okunmuyordu: değişikliğin sebebi bu.
    expect(contrastRatio("#ffffff", "#61afef")).toBeLessThan(2.5);
  });

  it("zaten koyu renk aynen kalıyor", () => {
    // Açık temalarda vurgu yüzeyde metin olarak okunsun diye zaten koyu.
    const f = filledColors("#2a4bb0");
    expect(f.fill).toBe("#2a4bb0");
    expect(f.text).toBe("#ffffff");
  });

  it("ton korunuyor: koyulaşan mavi hâlâ mavi", () => {
    const { fill } = filledColors("#61afef");
    const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(fill.slice(i, i + 2), 16));
    expect(b).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(r);
  });

  it("zemin, vurgunun parlaklığının en az üçte biri kadar kalıyor", () => {
    for (const renk of ["#61afef", "#58a6ff", "#268bd2", "#bc8cff", "#39c5cf", "#f778ba", "#ff7b72"]) {
      const f = filledColors(renk);
      if (f.text !== "#ffffff") continue;
      expect(luminance(f.fill) / luminance(renk), renk).toBeGreaterThanOrEqual(0.35);
    }
  });

  it("çok açık renk (sarı) çamurlaşmıyor: zemin rengin kendisi, yazı koyu", () => {
    // Beyaz yazı için sarıyı yarıdan fazla koyulaştırmak zemini çamur rengine çevirirdi;
    // orada eski kural: zemin aynen, yazı karşıtlığı yüksek olan.
    const f = filledColors("#ffe066");
    expect(f.fill).toBe("#ffe066");
    expect(f.text).not.toBe("#ffffff");
    expect(contrastRatio(f.text, f.fill)).toBeGreaterThanOrEqual(4.5);
  });

  it("uçlar: saf beyaz ve saf siyah", () => {
    const beyaz = filledColors("#ffffff");
    expect(beyaz.fill).toBe("#ffffff");
    expect(contrastRatio(beyaz.text, beyaz.fill)).toBeGreaterThanOrEqual(4.5);
    const siyah = filledColors("#000000");
    expect(siyah.fill).toBe("#000000");
    expect(siyah.text).toBe("#ffffff");
  });

  it("yazı zeminde HER rengin için okunuyor", () => {
    // Renk uzayını tarıyoruz: hangi yoldan (koyulaştırma ya da eski kural) gidilirse gidilsin
    // yazı zeminde en az 4,5:1 olmalı.
    for (let r = 0; r <= 255; r += 51) {
      for (let g = 0; g <= 255; g += 51) {
        for (let b = 0; b <= 255; b += 51) {
          const renk = `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
          const f = filledColors(renk);
          const oran = contrastRatio(f.text, f.fill);
          expect(oran, `${renk} → zemin ${f.fill}, yazı ${f.text}, ${oran.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it("hap rengi yazının TERSİ: beyaz yazıda siyah, koyu yazıda beyaz", () => {
    expect(filledColors("#61afef").chip).toBe("#000000");
    const sari = filledColors("#ffe066");
    expect(sari.text).not.toBe("#ffffff");
    expect(sari.chip).toBe("#ffffff");
  });

  it("asgari oran ölçülebiliyor: biraz daha yüksek istenirse zemin daha koyu", () => {
    const a = filledColors("#61afef", 4.5).fill;
    const b = filledColors("#61afef", 5).fill;
    expect(luminance(b)).toBeLessThan(luminance(a));
  });

  it("çok yüksek oran istenirse zemin çamurlaşmak yerine eski kurala düşüyor", () => {
    // 7:1 için #61afef'in parlaklığı %25'e inmeli (sınır %35): zemin rengin kendisi,
    // yazı koyu. Beyaz yazı bu vurguda ancak 5:1'e kadar kalıyor.
    const f = filledColors("#61afef", 7);
    expect(f.fill).toBe("#61afef");
    expect(f.text).not.toBe("#ffffff");
    expect(contrastRatio(f.text, f.fill)).toBeGreaterThanOrEqual(7);
  });
});

describe("tema uygulanınca dolgulu düğme değişkenleri", () => {
  const oku = (ad: string) => document.documentElement.style.getPropertyValue(ad).trim();

  for (const meta of THEMES) {
    it(`${meta.id}: zemin, yazı ve hap yazılıyor; yazı beyaz`, () => {
      const tema = getTheme(meta.id);
      applyThemeToDocument(tema);

      const yuzey = tema.ui.surfaceAlt;
      const vurgu = ensureContrast(tema.ui.accent, yuzey, 4.5);
      const beklenen = filledColors(vurgu);
      expect(oku("--accent-solid")).toBe(beklenen.fill);
      expect(oku("--accent-fg")).toBe("#ffffff");
      expect(oku("--accent-chip")).toBe(beklenen.chip);
      expect(oku("--err-solid")).not.toBe("");
      expect(oku("--err-fg")).toBe("#ffffff");
    });

    it(`${meta.id}: yüzeydeki vurgu rengi (metin) ile dolgu zemini AYRI değişkenler`, () => {
      // Aynı renk hem koyu yüzeyde metin olarak okunacak kadar açık hem beyaz yazıya zemin
      // olacak kadar koyu olamaz; koyu temalarda ikisi farklı olmak zorunda.
      const tema = getTheme(meta.id);
      applyThemeToDocument(tema);
      const yuzey = luminance(tema.ui.surfaceAlt);
      if (yuzey < 0.5) {
        expect(oku("--accent-solid")).not.toBe(oku("--accent"));
        expect(luminance(oku("--accent-solid"))).toBeLessThan(luminance(oku("--accent")));
      }
    });
  }
});
