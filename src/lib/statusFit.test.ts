import { describe, expect, it } from "vitest";

import { fitDropLevel, type FitPart } from "./statusFit";

/**
 * Sayılar uydurma değil: `src/styles/global.css` yüklenmiş gerçek bir sayfada,
 * macOS'ta 11px sistem yazı tipiyle ölçüldü.
 */
const GAP = 12;
const MORE = 28;
const MAX = 3;

/**
 * Bugünkü çubuk: grup, profil, yol ve iki panel düğmesi.
 *
 * Durum ROZETLERİ (komut takibi, geçmişten tamamlama, pid, sayaçlar) artık
 * çubukta değil, "⋯" menüsünde — gerekçesi `StatusBar.tsx` içinde. Buradaki
 * genişlikler aynı ölçümün rozet dışı kalan parçaları.
 */
const CUBUK: FitPart[] = [
  { level: 1, width: 20 }, // profil
  { level: 2, width: 42 }, // grup
  { level: 3, width: 145 }, // yol (…/Desktop/Works/Other_Projects)
  { level: 0, width: 58 }, // Geçmiş
  { level: 0, width: 79 }, // Favoriler
];

/**
 * Uzun uç: kullanıcının koyduğu bir grup adı ve derin bir dizin.
 *
 * Bu ikisinin ÖLÇÜLEBİLİR bir üst sınırı yok — sığdırma hesabının sabit bir
 * eşik yerine ölçüme dayanmasının bugünkü sebebi de bu. Genişlikler yukarıdaki
 * ölçümün karakter başına değerinden türetildi (grup: 42px / 4 karakter).
 */
const CUBUK_UZUN: FitPart[] = [
  { level: 1, width: 62 }, // "Windows PowerShell"
  { level: 2, width: 230 }, // "Müşteri Projeleri – Faz 2"
  { level: 3, width: 300 }, // 46ch'lik üst sınıra dayanmış yol
  { level: 0, width: 58 },
  { level: 0, width: 79 },
];

const fit = (parts: FitPart[], available: number) =>
  fitDropLevel({ parts, moreWidth: MORE, gap: GAP, available, maxLevel: MAX });

describe("durum çubuğu sığdırma", () => {
  it("yer varken hiçbir şey gizlemiyor", () => {
    expect(fit(CUBUK, 2000)).toBe(0);
    expect(fit(CUBUK_UZUN, 2000)).toBe(0);
  });

  it("gereğinden fazlasını gizlemiyor", () => {
    // Bir öncelik gitmesi yetiyorsa ikincisine dokunulmuyor: eski sabit
    // eşiklerin sorunu tam da buydu, en kötü hâle göre kuruldukları için
    // sıradan bir pencerede çubuk boş yere boşalıyordu.
    let birinciyeDusen = 2000;
    while (fit(CUBUK, birinciyeDusen) === 0) birinciyeDusen -= 1;
    expect(fit(CUBUK, birinciyeDusen)).toBe(1);
  });

  it("aynı genişlikte farklı adlar farklı karar veriyor", () => {
    // Bu testin varlık sebebi: tek bir sabit eşiğin neden yetmediği. Çubuktaki
    // üç öğenin ikisini KULLANICI adlandırıyor; aynı pencerede biri sığarken
    // öteki sığmıyor.
    const w = 460;
    expect(fit(CUBUK_UZUN, w)).toBeGreaterThan(fit(CUBUK, w));
  });

  it("daraldıkça gizlenen artıyor, hiç azalmıyor", () => {
    for (const parts of [CUBUK, CUBUK_UZUN]) {
      let onceki = 0;
      for (let w = 1200; w >= 200; w -= 5) {
        const k = fit(parts, w);
        expect(k, `${w}px: gizleme geri gitti`).toBeGreaterThanOrEqual(onceki);
        onceki = k;
      }
    }
  });

  it("⋯ düğmesi HER düzeyde hesaba giriyor", () => {
    // Düğme çubuğun kalıcı parçası (durum okumalarının tek yolu o). Koşullu
    // sayılsaydı çubuk, hiçbir şey gizlenmediği durumda kendini düğmenin
    // genişliği kadar geniş sanar ve tam sınırda taşardı.
    const parts: FitPart[] = [
      { level: 0, width: 100 },
      { level: 1, width: 50 },
    ];
    // Tam olarak iki öğe + üç boşluk kadar yer var; düğme sığmıyor.
    const available = 150 + GAP * 3;
    expect(
      fitDropLevel({ parts, moreWidth: MORE, gap: GAP, available, maxLevel: MAX }),
      "düğmenin genişliği sayılmamış",
    ).toBe(1);
  });

  it("en dar uçta düğmeler sığıyor", () => {
    // Kenar çubuğu 480px'e kadar genişleyebiliyor; 760px'lik asgari pencerede
    // çubuğa 280px kalıyor. Düğmeler çubuktaki tek eylem, kırpılmamalılar.
    for (const parts of [CUBUK, CUBUK_UZUN]) {
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
    expect(fit(CUBUK, 0)).toBe(MAX);
  });
});
