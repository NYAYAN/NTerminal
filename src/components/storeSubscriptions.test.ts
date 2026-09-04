import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Geniş depo abonelikleri.
 *
 * ## Ölçülen sorun
 *
 * `useStore((s) => s.ui)` demek `ui` nesnesinin TAMAMINA abone olmak. `setUi`
 * her çağrıda yeni bir nesne üretiyor (`{ ...ui, ...patch }`), dolayısıyla
 * hangi alan değişirse o bileşen yeniden çiziliyor.
 *
 * En sıcak yol yazmaktı: `ui.suggest` her tuş vuruşunda güncelleniyor. App bu
 * alanı hiç okumadığı hâlde tuş başına bir kez yeniden çiziliyordu ve altındaki
 * bütün ağaç — sekme çubuğu, terminal alanı, blok katmanı — onunla birlikte
 * geliyordu. Durum çubuğu ayrıca sığdırma hesabı koşuyor, yani oradaki boş
 * çizim iki kat pahalı.
 *
 * ## Neden kaynak taraması
 *
 * Ölçülecek şey "kaç kez çizildi" değil, KARARIN kendisi: bu iki bileşen dar
 * dilim seçiyor mu. Çizim sayısını saymak jsdom'da kırılgan bir test olurdu
 * (React'in toplulaştırması, `StrictMode` çift çizimi); kaynak ise net.
 *
 * Kural yalnızca bu iki dosya için: ikisi de ağacın TEPESİNDE ve gereksiz
 * çizimleri en pahalı olan yerler. Küçük bir bileşenin `ui`ye tümden abone
 * olması aynı bedeli ödemiyor.
 */

/**
 * Kaynağı YORUMLARDAN arındırarak okur.
 *
 * Şart: bu kararı açıklayan yorumun içinde yasaklı kalıbın kendisi geçiyor
 * ("`useStore((s) => s.ui)` diyorduk") ve yorum ayıklanmazsa test, düzeltmenin
 * kendi açıklamasını hata sanıyor. `layout.test.ts` CSS tarafında aynı şeyi
 * aynı sebeple yapıyor.
 */
const read = (p: string) =>
  readFileSync(join(process.cwd(), p), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

/** Tamamına abonelik: `useStore((s) => s.ui)` — sonunda alan seçimi YOK. */
const GENIS_UI = /useStore\(\(\w+\)\s*=>\s*\w+\.ui\s*\)/;

describe("ağacın tepesindeki abonelikler dar", () => {
  for (const dosya of ["src/App.tsx", "src/components/StatusBar.tsx"]) {
    it(`${dosya} \`ui\` nesnesinin tamamına abone değil`, () => {
      const src = read(dosya);
      expect(
        GENIS_UI.test(src),
        `${dosya} \`useStore((s) => s.ui)\` diyor: her arayüz durumu değişimi ` +
          "(yazarken her tuş vuruşu dâhil) bu bileşeni yeniden çizdirir. " +
          "Okunan alanları tek tek seçin: `useStore((s) => s.ui.historyOpen)`.",
      ).toBe(false);
    });

    it(`${dosya} en az bir dar \`ui\` dilimi seçiyor`, () => {
      // Yukarıdaki iddia, `ui` hiç kullanılmadığında da geçer — bu ikinci
      // iddia testin gerçekten bir şey ölçtüğünü garanti ediyor.
      const src = read(dosya);
      expect(/useStore\(\(\w+\)\s*=>\s*\w+\.ui\.\w+\)/.test(src), "dar dilim yok").toBe(true);
    });
  }

  it("kural gerçekten çalışıyor", () => {
    // Kalıp geri alınırsa test yakalamalı; yakalamayan bir kural sessizce
    // geçer ve hiçbir şey korumaz.
    expect(GENIS_UI.test("const ui = useStore((s) => s.ui);")).toBe(true);
    expect(GENIS_UI.test("const ui = useStore((state) => state.ui);")).toBe(true);
    // Dar dilim ve öteki dilimler işaretlenmemeli.
    expect(GENIS_UI.test("const open = useStore((s) => s.ui.historyOpen);")).toBe(false);
    expect(GENIS_UI.test("const groups = useStore((s) => s.groups);")).toBe(false);
  });
});
