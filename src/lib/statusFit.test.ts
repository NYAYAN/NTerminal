import { describe, expect, it } from "vitest";

import { fitDropLevel, type FitPart } from "./statusFit";

/**
 * Sayılar uydurma değil: `src/styles/global.css` yüklenmiş gerçek bir sayfada,
 * macOS'ta 11px sistem yazı tipiyle ölçüldü.
 */
const GAP = 12;
const MORE = 28;

/** Türkçe, sağlıklı durum, komut çalışmıyor. */
const TR_SAGLIKLI: FitPart[] = [
  { level: 6, width: 42 }, // grup
  { level: 4, width: 20 }, // profil
  { level: 7, width: 145 }, // yol (…/Desktop/Works/Other_Projects)
  { level: 5, width: 104 }, // komut takibi tam
  { level: 5, width: 112 }, // komut önerisi açık
  { level: 1, width: 49 }, // pid
  { level: 2, width: 71 }, // komut sayısı
  { level: 3, width: 44 }, // sekme sayısı
  { level: 0, width: 58 }, // Geçmiş
  { level: 0, width: 79 }, // Favoriler
];

/** İngilizce, uyarı durumu, komut çalışıyor — ölçülen en geniş hâl. */
const EN_UYARI: FitPart[] = [
  { level: 6, width: 50 },
  { level: 4, width: 20 },
  { level: 7, width: 145 },
  { level: 9, width: 102 }, // Command running
  { level: 8, width: 155 }, // Limited command tracking
  { level: 8, width: 206 }, // Command suggestions unsupported
  { level: 1, width: 49 },
  { level: 2, width: 92 },
  { level: 3, width: 40 },
  { level: 0, width: 48 },
  { level: 0, width: 72 },
];

const fit = (parts: FitPart[], available: number) =>
  fitDropLevel({ parts, moreWidth: MORE, gap: GAP, available, maxLevel: 9 });

describe("durum çubuğu sığdırma", () => {
  it("yer varken hiçbir şey gizlemiyor", () => {
    expect(fit(TR_SAGLIKLI, 2000)).toBe(0);
    expect(fit(EN_UYARI, 2000)).toBe(0);
  });

  it("gereğinden fazlasını gizlemiyor", () => {
    // Bir öncelik gitmesi yetiyorsa ikincisine dokunulmuyor: eski sabit
    // eşiklerin sorunu tam da buydu, en kötü hâle göre kuruldukları için
    // sıradan bir pencerede çubuk boş yere boşalıyordu.
    const tam = 2000;
    let birinciyeDusen = tam;
    while (fit(TR_SAGLIKLI, birinciyeDusen) === 0) birinciyeDusen -= 1;
    expect(fit(TR_SAGLIKLI, birinciyeDusen)).toBe(1);
  });

  it("iki dil aynı genişlikte farklı karar veriyor", () => {
    // Bu testin varlık sebebi: tek bir sabit eşiğin neden yetmediği.
    // İngilizce etiketler daha geniş, dolayısıyla aynı çubukta daha erken
    // gizlemek gerekiyor.
    const w = 700;
    expect(fit(EN_UYARI, w)).toBeGreaterThan(fit(TR_SAGLIKLI, w));
  });

  it("daraldıkça gizlenen artıyor, hiç azalmıyor", () => {
    for (const parts of [TR_SAGLIKLI, EN_UYARI]) {
      let onceki = 0;
      for (let w = 1200; w >= 200; w -= 5) {
        const k = fit(parts, w);
        expect(k, `${w}px: gizleme geri gitti`).toBeGreaterThanOrEqual(onceki);
        onceki = k;
      }
    }
  });

  it("en dar uçta düğmeler sığıyor", () => {
    // Kenar çubuğu 480px'e kadar genişleyebiliyor; 760px'lik asgari pencerede
    // çubuğa 280px kalıyor. Düğmeler çubuktaki tek eylem, kırpılmamalılar.
    for (const parts of [TR_SAGLIKLI, EN_UYARI]) {
      const k = fit(parts, 280);
      const kalan = parts.filter((p) => p.level === 0 || p.level > k);
      const genislik =
        kalan.reduce((t, p) => t + p.width, 0) + MORE + GAP * (kalan.length + 1);
      expect(genislik, "280px'de taşıyor").toBeLessThanOrEqual(280);
      expect(kalan.every((p) => p.level === 0), "düğme dışı bir şey kalmış").toBe(true);
    }
  });

  it("maxLevel aşılmıyor", () => {
    // Sıfır genişlikte bile durmalı: sonsuz döngü olmasın.
    expect(fit(TR_SAGLIKLI, 0)).toBe(9);
  });
});
