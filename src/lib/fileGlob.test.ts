import { describe, expect, it } from "vitest";

import { compileGlob, globPositions, globTest, parseFileQuery } from "./fileGlob";
import { fileMatch, rankFiles } from "./format";

/**
 * Dosya aramasında kalıp. İSTEK: "aramalarda *.tsx dersem bunların da
 * çalışması gerekir." Sorgu harf harf aranıyordu; `*` hiçbir adda geçmediği
 * için `*.tsx` hiç sonuç vermiyordu.
 */

const uyar = (pattern: string, path: string) => globTest(compileGlob(pattern)!, path);

describe("kalıp", () => {
  it("eğik çizgisiz kalıp dosyanın ADINA uyuyor", () => {
    expect(uyar("*.tsx", "src/App.tsx")).toBe(true);
    expect(uyar("*.tsx", "src/App.ts")).toBe(false);
    expect(uyar("*.tsx", "src/tsx/App.ts"), "klasör adı sayıldı").toBe(false);
    expect(uyar("use*", "src/hooks/useStore.ts")).toBe(true);
    expect(uyar("*store*", "src/store/useStore.ts")).toBe(true);
  });

  it("büyük-küçük harf ayırmıyor; Windows yolu da uyuyor", () => {
    expect(uyar("*.tsx", "SRC/APP.TSX")).toBe(true);
    expect(uyar("*.tsx", "src\\components\\App.tsx")).toBe(true);
    expect(uyar("components/*.tsx", "src\\components\\App.tsx")).toBe(true);
  });

  it("seçenekler, tek karakter ve karakter kümesi", () => {
    expect(uyar("*.{ts,tsx}", "a/b.ts")).toBe(true);
    expect(uyar("*.{ts,tsx}", "a/b.tsx")).toBe(true);
    expect(uyar("*.{ts,tsx}", "a/b.js")).toBe(false);
    expect(uyar("a?.ts", "ab.ts")).toBe(true);
    expect(uyar("a?.ts", "abc.ts")).toBe(false);
    expect(uyar("[!a]*.ts", "b.ts")).toBe(true);
    expect(uyar("[!a]*.ts", "a.ts")).toBe(false);
  });

  it("eğik çizgili kalıp YOLA uyuyor: herhangi bir klasör sınırından, `/` ile kökten", () => {
    expect(uyar("components/*.tsx", "src/components/App.tsx")).toBe(true);
    expect(uyar("components/*.tsx", "src/components/sub/App.tsx"), "* klasörü geçti").toBe(false);
    expect(uyar("components/*.tsx", "src/mycomponents/App.tsx"), "klasör adının ortası").toBe(false);
    expect(uyar("/src/*.ts", "src/a.ts")).toBe(true);
    expect(uyar("/src/*.ts", "lib/src/a.ts")).toBe(false);
  });

  it("`**` klasörleri geçiyor, `**/` hiç klasör de olabilir", () => {
    expect(uyar("src/**/*.test.ts", "src/lib/deep/a.test.ts")).toBe(true);
    expect(uyar("src/**/*.test.ts", "src/a.test.ts")).toBe(true);
    expect(uyar("src/**/*.test.ts", "test/a.test.ts")).toBe(false);
  });

  it("düz parçaların yolda yeri: vurgu için", () => {
    expect(globPositions(compileGlob("*.tsx")!, "src/App.tsx")).toEqual([7, 8, 9, 10]);
    expect(globPositions(compileGlob("*.tsx")!, "src/App.ts")).toBeNull();
  });
});

describe("sorgunun bölünmesi", () => {
  it("kalıpsız sorgu olduğu gibi: boşluklu ad aranabilsin", () => {
    expect(parseFileQuery("my  file")).toEqual({ text: "my  file", globs: [] });
  });

  it("kalıp süzüyor, kalan metin bulanık arıyor", () => {
    const q = parseFileQuery("rail *.tsx");
    expect(q.text).toBe("rail");
    expect(q.globs).toHaveLength(1);
  });
});

describe("dosya aramasında kalıp", () => {
  const FILES = [
    "src/components/GroupRail.tsx",
    "src/components/railTree.test.tsx",
    "src/lib/rail.ts",
    "README.md",
    "src/App.tsx",
  ];

  it("`*.tsx` yalnız tsx dosyaları, köke yakın olan önce", () => {
    expect(rankFiles(FILES, "*.tsx", 50)).toEqual([
      "src/App.tsx",
      "src/components/GroupRail.tsx",
      "src/components/railTree.test.tsx",
    ]);
  });

  it("kalıp ve metin birlikte: adı 'rail'e uyan tsx dosyaları", () => {
    expect(rankFiles(FILES, "rail *.tsx", 50)).toEqual([
      "src/components/railTree.test.tsx",
      "src/components/GroupRail.tsx",
    ]);
  });

  it("vurgu: kalıbın düz parçası ve metnin harfleri", () => {
    const path = "src/components/GroupRail.tsx";
    const m = fileMatch(path, "rail *.tsx")!;
    const marked = m.positions.map((i) => path[i]).join("");
    expect(marked).toBe("Rail.tsx");
    expect(m.scattered).toBe(false);
    expect(fileMatch("README.md", "*.tsx")).toBeNull();
  });
});
