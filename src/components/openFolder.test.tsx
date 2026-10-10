// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * "Klasörü aç" eyleminin bulunabilirliği.
 *
 * Bir yol ekranda yazıyorsa onu açmanın bir yolu da olmalı. İki eksik vardı:
 *
 *  - **Favoriler** satırda klasörü gösteriyordu ama menüsünde açma yoktu;
 *    aynı yol geçmiş panelinde ve sekme menüsünde açılabiliyordu.
 *  - **Sekme menüsündeki öğe** `tab.cwd` boşken hiç görünmüyordu ve kabuk
 *    entegrasyonu olmayan profillerde (Özel profil, entegrasyonu kapatılmış
 *    profil) `tab.cwd` KALICI olarak boş kalıyordu. Klasör aslında belliydi —
 *    `ptySpawn` sonucu kabuğun gerçekten başladığı dizini döndürüyor — ama o
 *    değer oturuma yazılıp sekmeye hiç bildirilmiyordu.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("başlangıç dizini sekmeye ulaşıyor", () => {
  const session = read("src/terminal/TerminalSession.ts");

  it("spawn sonucu updateCwd ile bildiriliyor", () => {
    // Düz atama (`this.cwd = result.cwd`) oturumun alanını dolduruyor ama
    // `onCwd` çağrılmadığı için depodaki `tab.cwd` boş kalıyor — menü öğesi de
    // ona bakıyor. Tek karakterlik fark, sessiz sonuç.
    expect(session, "spawn sonucu bildirilmiyor").toMatch(
      /if \(result\.cwd\) this\.updateCwd\(result\.cwd\);/,
    );
    expect(session, "düz atama geri gelmiş").not.toMatch(/this\.cwd = result\.cwd/);
  });

  it("updateCwd dinleyiciyi çağırıyor", () => {
    // Yukarıdaki iddia ancak bu doğruysa bir şey ifade ediyor.
    const at = session.indexOf("private updateCwd(");
    expect(at, "updateCwd tanımı yok").toBeGreaterThan(-1);
    const body = session.slice(at, at + 320);
    expect(body, "onCwd tetiklenmiyor").toContain("onCwd");
  });
});

describe("klasörü açma eylemi", () => {
  it("favori menüsünde var", () => {
    const src = read("src/components/FavoritesPanel.tsx");
    expect(src, "favoride klasör açma yok").toContain("common.revealFolder");
    expect(src, "reveal çağrısı yok").toContain("revealInExplorer(favorite.cwd");
  });

  it("yolu gösteren her yüzeyde açma da var", () => {
    // Yol yazıp açmanın yolunu vermemek, kullanıcıyı elle kopyalamaya
    // zorluyor. Geçmiş hızlı seçici (Ctrl+R) bilinçli olarak dışarıda:
    // klavyeyle çalışan geçici bir katman, bağlam menüsü taşımıyor.
    const yuzeyler = [
      "src/components/TabBar.tsx",
      // Kenar çubuğunun ve Kokpit rayındaki sekme ağacının ortak sekme menüsü.
      "src/components/tabMenu.ts",
      "src/components/TerminalArea.tsx",
      "src/components/HistoryPanel.tsx",
      "src/components/FavoritesPanel.tsx",
      "src/components/StatusBar.tsx",
    ];
    const eksik = yuzeyler.filter((f) => !read(f).includes("revealInExplorer"));
    expect(eksik, `klasör açma eksik:\n${eksik.join("\n")}`).toEqual([]);
    // Ortak menünün iddiası ancak o yüzeyler onu gerçekten açıyorsa geçerli.
    for (const f of ["src/components/GroupSidebar.tsx", "src/components/GroupRail.tsx"]) {
      expect(read(f), `${f} ortak sekme menüsünü açmıyor`).toContain("tabMenu(");
    }
  });
});
