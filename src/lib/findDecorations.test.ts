import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { THEMES, getTheme } from "./themes";

/**
 * Arama vurguları.
 *
 * Bildirilen belirti: 150 sonuç arasında "Sonraki"ye basınca hangi eşleşmede
 * olunduğu anlaşılmıyordu. Sebep renklerin YAKIN olmasıydı — sıradan eşleşme
 * `#3b5070`, etkin eşleşme `#58a6ff`, ikisi de mavi. Ayrıca ikisi de sabit
 * kodlanmıştı, yani açık temada zeminle karışıyorlardı.
 *
 * Renk seçimi göz kararı bir şey ve testle "güzel mi" diye sorulamaz; ama iki
 * ölçülebilir kural var ve ikisi de bu hatanın sebebiydi: etkin eşleşmenin
 * renkten BAĞIMSIZ bir ayırt edici işareti (çerçeve) olmalı, ve renkler
 * temadan gelmeli.
 */
const SOURCE = readFileSync(join(process.cwd(), "src/components/TerminalFind.tsx"), "utf8");

/** `decorations: { ... }` bloğunun gövdesi. */
function decorations(): string {
  const at = SOURCE.indexOf("decorations: {");
  expect(at, "decorations bloğu bulunamadı").toBeGreaterThan(-1);
  return SOURCE.slice(at, SOURCE.indexOf("},", at));
}

describe("arama vurguları", () => {
  it("etkin eşleşmenin çerçevesi var", () => {
    // Renk yakınlığından bağımsız ayırt edici. Bunsuz, iki arka plan birbirine
    // benzediğinde etkin eşleşme kalabalıkta kayboluyor.
    expect(decorations(), "etkin eşleşme yalnızca renkle ayrılıyor").toContain(
      "activeMatchBorder",
    );
  });

  it("renkler temadan geliyor", () => {
    // Sabit kodlanmış maviler koyu tema için seçilmişti; Solarized Light'ta
    // zeminle karışıyorlardı.
    const body = decorations();
    for (const key of ["matchBackground", "activeMatchBackground", "activeMatchBorder"]) {
      const satir = new RegExp(`${key}:\\s*([^,]+),`).exec(body);
      expect(satir, `${key} tanımlı değil`).not.toBe(null);
      expect(satir![1], `${key} sabit renk kullanıyor: ${satir![1]}`).toContain("theme.");
    }
  });

  it("her temada etkin ve sıradan eşleşme farklı renkte", () => {
    // Bir temada ikisi aynı renge düşerse çerçeve dışında hiçbir ayrım kalmaz.
    for (const t of THEMES) {
      const theme = getTheme(t.id);
      expect(
        theme.ui.accent.toLowerCase(),
        `${t.id}: etkin ve sıradan eşleşme aynı renk`,
      ).not.toBe((theme.xterm.selectionBackground ?? "").toLowerCase());
    }
  });

  it("her temada çerçeve rengi tanımlı", () => {
    // Çerçeve ön plan renginden geliyor; tanımsızsa yedeğe düşüyoruz ama
    // temaların hepsinde olmalı.
    for (const t of THEMES) {
      expect(getTheme(t.id).xterm.foreground, `${t.id}: ön plan rengi yok`).toBeTruthy();
    }
  });
});
