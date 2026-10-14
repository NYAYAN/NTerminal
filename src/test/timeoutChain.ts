import { act } from "@testing-library/react";
import { it as vitestIt } from "vitest";

/**
 * Zaman aşımı zinciri: süre sınırı ve sarılı `it`.
 *
 * vitest zaman aşımında testin sözünü bırakıp söküme ve sonraki teste geçiyor
 * ama test fonksiyonunu durdurmuyor; yalnızca `context.signal`i iptal ediyor
 * (@vitest/runner, `withTimeout`). Bırakılan test arka planda sürüyor ve
 * yarım kalan `act`i öteki testleri iki yoldan düşürüyor:
 *
 * - Kapsamı açık kaldıkça sökümün ve sonraki testlerin `act`leri onun İÇİNE
 *   giriyor; iç içe `act` kuyruğu boşaltmıyor, çizim gelmiyor ("Unable to
 *   fire a "click" event", "Cannot read properties of null").
 * - Sonraki testin async `act`i onunla çakışırsa kapsamlar ters sırada
 *   kapanıyor ("You seem to have overlapping act() calls") ve React'in act
 *   derinliği kalıcı olarak kayıyor: dosyanın geri kalanında hiçbir `act`
 *   kuyruğunu boşaltmıyor.
 *
 * Ölçüldü (2026-10-13, iki tam takım + işlemci yükü): fark penceresinde tek
 * zaman aşımından sonra 61 testin 37'si, ayarlar penceresinde 69'un 62'si
 * düştü. Sayılar ve kasıtlı üretim dosyaların başlığında.
 *
 * Çare üç parça; dosya başına `zincirKorumasi(süreSınırı)` ile kuruluyor:
 *
 * - `it`: vitest'in `it`i; süre sınırı varsayılan olarak verilen sayı ve
 *   testin sözü izleniyor. `.only` ve `.skip` aynı yoldan; `.each` yok
 *   (gerekirse döngü).
 * - `adim`: testin bir async `act` adımı. Dosyadaki BÜTÜN async `act`ler
 *   bundan geçmeli: bırakılan test bir sonraki adımda hata atıp bitiyor.
 * - `birakilaniBekle`: sökümün ilk satırı. Test bırakıldıysa sözünün
 *   bitmesini bekliyor (en çok 8 sn, gerçek saatle). React'e ya da saatlere
 *   dokunan HER `afterEach` bununla başlamalı; describe içindekiler de, vitest
 *   önce onları koşuyor. İkinci çağrı hemen dönüyor.
 *
 * RTL'nin eşzamanlı `act`leri (`render`, `fireEvent`, `cleanup`) kapsamı açık
 * bırakmıyor; zinciri yalnızca beklenen bir `act` başlatıyor.
 */

type TestFn = () => void | Promise<void>;
type TestAyari = { timeout?: number };
type Tanimla = (ad: string, ayar: TestAyari, fn: () => Promise<void>) => void;

/** Sahte saat kurulsa da gerçek: bırakılan testi beklemenin üst sınırı için. */
const gercekSetTimeout = globalThis.setTimeout;

export function zincirKorumasi(sureSiniri: number) {
  /** Koşan testin sözü; vitest testi bırakırsa `bitti` söküme kadar false kalır. */
  let suren: { soz: Promise<void>; bitti: boolean } | null = null;
  /** Bırakılan test yeni bir adıma (`act`) girmesin. */
  let durdur = false;

  function sarili(tanimla: Tanimla, ad: string, a: TestFn | TestAyari, b?: TestFn) {
    const [ayar, fn] = typeof a === "function" ? [{}, a] : [a, b!];
    tanimla(ad, { timeout: sureSiniri, ...ayar }, () => {
      const kayit = { soz: Promise.resolve(), bitti: false };
      kayit.soz = (async () => {
        try {
          await fn();
        } finally {
          kayit.bitti = true;
        }
      })();
      suren = kayit;
      return kayit.soz;
    });
  }

  /** vitest'in `it`i; süre sınırı `sureSiniri` ve testin sözü izleniyor. */
  const it = Object.assign(
    (ad: string, a: TestFn | TestAyari, b?: TestFn) => sarili(vitestIt, ad, a, b),
    {
      only: (ad: string, a: TestFn | TestAyari, b?: TestFn) => sarili(vitestIt.only, ad, a, b),
      skip: (ad: string, a: TestFn | TestAyari, b?: TestFn) => sarili(vitestIt.skip, ad, a, b),
    },
  );

  /**
   * Söküm bundan başlıyor. Test zaman aşımıyla bırakıldıysa (sözü sürüyorsa)
   * bitmesini bekliyor: yarım kalan adımı bitiyor, bir sonraki adımı `durdur`a
   * çarpıp hata atıyor. En çok 8 sn; takılıp kalmış bir testte söküm yine
   * koşuyor (korumasız davranış).
   */
  async function birakilaniBekle() {
    const kayit = suren;
    suren = null;
    if (!kayit || kayit.bitti) return;
    durdur = true;
    try {
      await Promise.race([kayit.soz.catch(() => {}), new Promise((r) => gercekSetTimeout(r, 8_000))]);
    } finally {
      durdur = false;
    }
  }

  /** Testin bir `act` adımı. Bırakılan test buradan geçemiyor. */
  async function adim(fn: () => unknown) {
    if (durdur) throw new Error("zaman aşımına düşen test durduruldu");
    await act(async () => {
      await fn();
    });
  }

  return { it, adim, birakilaniBekle };
}
