import { describe, expect, it } from "vitest";

import { placeSuggestions } from "./anchor";

const GAP = 4;
const CELL = 17;
const VIEW = 900;
/** Terminal alanının alt kenarı; istem genellikle bunun epey üstünde. */
const AREA_BOTTOM = 800;

const place = (anchorTop: number, height: number, areaBottom = AREA_BOTTOM) =>
  placeSuggestions({
    anchorTop,
    cellHeight: CELL,
    areaBottom,
    height,
    viewportHeight: VIEW,
    gap: GAP,
  });

describe("öneri listesinin yerleşimi", () => {
  it("normalde terminalin dibinde duruyor", () => {
    // Asıl istek buydu: sabit bir yer. İmlecin nerede olduğundan bağımsız
    // olarak liste hep aynı yerde açılıyor.
    expect(place(200, 100)).toBe(AREA_BOTTOM - GAP - 100);
    expect(place(500, 100)).toBe(AREA_BOTTOM - GAP - 100);
    expect(place(200, 60)).toBe(AREA_BOTTOM - GAP - 60);
  });

  it("imleç nerede olursa olsun yeri değişmiyor", () => {
    // Kutunun her satırda zıplamaması bu testin bağladığı şey.
    const yerler = new Set<number>();
    for (let anchorTop = 100; anchorTop <= 600; anchorTop += 17) {
      yerler.add(place(anchorTop, 100));
    }
    expect(yerler.size, "liste imlece göre kaydı").toBe(1);
  });

  it("imleç satırını örtmüyor", () => {
    // İmleç dibe yaklaştığında liste aşağıda kalamaz.
    const height = 100;
    for (let anchorTop = 600; anchorTop <= 790; anchorTop += 10) {
      const top = place(anchorTop, height);
      const orter = top < anchorTop + CELL && top + height > anchorTop;
      expect(orter, `anchorTop=${anchorTop}: liste imleç satırını örtüyor`).toBe(false);
    }
  });

  it("altta yer kalmayınca imlecin üstüne çıkıyor", () => {
    const height = 100;
    // İmleç dibe çok yakın: altta 100px'lik kutuya yer yok.
    const top = place(760, height);
    expect(top + height, "liste imleç satırına taşıyor").toBeLessThanOrEqual(760 - GAP);
  });

  it("sınır durumu: tam sığdığında hâlâ altta", () => {
    // Dipteki yer imlecin altına tam denk geliyor.
    const height = 100;
    const anchorTop = AREA_BOTTOM - GAP - height - CELL - GAP;
    expect(place(anchorTop, height)).toBe(AREA_BOTTOM - GAP - height);
  });

  it("görünümden taşmıyor", () => {
    // Küçük pencere: ne altta ne üstte tam yer var; liste yine de ekranda
    // kalmalı, yoksa bir kısmı hiç görünmüyor.
    const height = 150;
    const top = placeSuggestions({
      anchorTop: 30,
      cellHeight: CELL,
      areaBottom: 190,
      height,
      viewportHeight: 200,
      gap: GAP,
    });
    expect(top).toBeGreaterThanOrEqual(GAP);
    expect(top + height).toBeLessThanOrEqual(200 - GAP);
  });

  it("hiçbir durumda negatif değer üretmiyor", () => {
    for (let anchorTop = 0; anchorTop <= 800; anchorTop += 7) {
      for (const height of [24, 60, 112, 140]) {
        expect(place(anchorTop, height), `anchorTop=${anchorTop} height=${height}`)
          .toBeGreaterThanOrEqual(0);
      }
    }
  });
});
