import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Stash penceresi uygulamanın örtü listesinde.
 *
 * `App`in genel kısayol işleyicisi açık pencereleri tek tek sayıyor
 * (`anyOverlayOpen`): listede olmayan bir pencerenin arkasında Ctrl+W sekmeyi
 * kapatır, Ctrl+T yeni sekme açar. Metin kutusundaki ve onay kutusundaki odak bunu
 * kendiliğinden engelliyor ama odak bir DÜĞMEDEYKEN ("Vazgeç", "×", "Stash'e at")
 * kısayollar işliyordu. Bu bir davranış değil bir KAYIT hatası sınıfı ve kaynak
 * taraması onu en ucuz yakalıyor (bkz. `storeSubscriptions.test.ts`).
 */

/** Yorumlar atılıyor: açıklama metninin kendisi kalıbı içeriyor olabilir. */
const src = readFileSync(join(process.cwd(), "src/App.tsx"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/[^\n]*/g, "");

describe("stash penceresi ve App", () => {
  it("açıkken kısayollar susuyor (anyOverlayOpen içinde)", () => {
    const blok = src.match(/const anyOverlayOpen =([\s\S]*?);/);
    expect(blok, "anyOverlayOpen bulunamadı").not.toBe(null);
    expect(blok![1]).toContain("store.ui.stashDialog");
  });

  it("Esc'yi kendisi ele alıyor: App yarışmıyor", () => {
    // Pencere Esc'yi capture fazında kendisi işliyor (iş sürerken bilerek yok
    // sayıyor). App de kapatsaydı iş sürerken de kapanırdı.
    const dal = src.match(/if \(event\.key === "Escape"\) \{([\s\S]*?)return;\s*\}/);
    expect(dal, "Escape dalı bulunamadı").not.toBe(null);
    expect(dal![1]).toContain("store.ui.stashDialog");
    expect(dal![1]).not.toContain("stashDialog: null");
  });

  it("pencere kökte çiziliyor ve açık depo kimliğini geçiriyor", () => {
    expect(src).toContain("<StashDialog cwd={stashDialog.cwd} />");
  });

  it("kaynak gerçekten okundu", () => {
    // Boş okuma yukarıdakileri anlamsızca geçirirdi.
    expect(src.length).toBeGreaterThan(5000);
    expect(src).toContain("anyOverlayOpen");
  });
});
