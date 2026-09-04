import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Grup rengi seçicisinin düzeni ve davranışı.
 *
 * Buradaki iddialar KAYNAK taramasıyla ölçülüyor (aynı yöntem
 * `titlebar.test.tsx`te de kullanılıyor): seçici bir bağlam menüsü öğesiyle
 * açılıyor ve onu DOM'da açtırmak menüyü kurup tıklamak demek — ölçülecek şey
 * ise seçicinin İÇ SIRASI ve seçimin ne yaptığı, ikisi de kaynakta net.
 *
 * Üç bildirilen hata bir arada kapanıyor:
 *  1. Renkler daire değil oval görünüyordu → ölçüler `styles/layout.test.ts`te.
 *  2. Bir renge basınca seçici hemen kapanıyordu; kullanıcı renkler arasında
 *     gezinip karar vermek istiyor.
 *  3. Sekiz renk dar çubukta sarıyordu; dört yeterli, "temizle" başta ve özel
 *     renk sonda dursun.
 */

const SRC = readFileSync(join(process.cwd(), "src/components/GroupSidebar.tsx"), "utf8");

/** Seçicinin işaretlemesi: `color-swatches` kabının gövdesi. */
function swatchesBlock(): string {
  const at = SRC.indexOf('className="color-swatches"');
  expect(at, "renk kutusu kabı yok").toBeGreaterThan(-1);
  const end = SRC.indexOf("</div>", at);
  return SRC.slice(at, end);
}

describe("grup rengi seçicisi", () => {
  it("dört hazır renk var", () => {
    const at = SRC.indexOf("const GROUP_COLORS");
    const decl = SRC.slice(at, SRC.indexOf(";", at));
    const renkler = decl.match(/#[0-9a-fA-F]{6}/g) ?? [];
    expect(renkler, "hazır renk sayısı dört değil").toHaveLength(4);
  });

  it("seçim seçiciyi KAPATMIYOR", () => {
    /*
     * BİLDİRİLEN HATA: renge basınca seçici kapanıyordu ve her deneme için
     * menüyü yeniden açmak gerekiyordu. Renk seçmek tek hamlelik bir iş
     * değil — kullanıcı birkaçını deneyip grubun listedeki hâline bakıyor.
     *
     * Ölçüt: kutuların hiçbirinin tıklamasında `setColorFor(null)` olmamalı.
     * Kapatma yalnızca kapatma düğmesinin işi.
     */
    expect(swatchesBlock(), "seçim hâlâ seçiciyi kapatıyor").not.toContain("setColorFor(null)");
    // Kapatma yolu yine DURUYOR; yalnızca yeri değişti.
    expect(SRC, "kapatma düğmesi kalkmış").toContain("setColorFor(null)");
    expect(SRC, "kapatma düğmesi işaretlenmemiş").toContain("color-close");
  });

  it("sıra: temizle → renkler → özel", () => {
    // Soldan sağa okuyan göz önce "rengi yok"u geçiyor; özel renk ise ayrı
    // bir kapı ve sonda duruyor.
    const block = swatchesBlock();
    const temizle = block.indexOf("swatch clear");
    const renkler = block.indexOf("GROUP_COLORS.map");
    const ozel = block.indexOf("swatch custom");
    expect(temizle, "temizle düğmesi yok").toBeGreaterThan(-1);
    expect(renkler, "hazır renkler çizilmiyor").toBeGreaterThan(-1);
    expect(ozel, "özel renk seçici yok").toBeGreaterThan(-1);
    expect(temizle, "temizle en başta değil").toBeLessThan(renkler);
    expect(renkler, "özel renk hazır renklerden önce").toBeLessThan(ozel);
  });

  it("seçili olan işaretli", () => {
    // Seçim artık kapatmadığı için "hangisi etkin" ekranda görünmek zorunda:
    // kullanıcı denemeler arasında nerede olduğunu ancak böyle biliyor.
    const block = swatchesBlock();
    expect(block, "seçili renk işaretlenmiyor").toContain("aria-pressed");
    expect(block, "temizle durumu işaretlenmiyor").toContain('group.color === null');
  });
});
