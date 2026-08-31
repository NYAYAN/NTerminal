import { describe, expect, it } from "vitest";

import { diffStat, parseDiff } from "./diff";

const ORNEK = [
  "diff --git a/src/a.ts b/src/a.ts",
  "index 1234567..89abcde 100644",
  "--- a/src/a.ts",
  "+++ b/src/a.ts",
  "@@ -1,4 +1,5 @@",
  " const x = 1;",
  "-const y = 2;",
  "+const y = 3;",
  "+const z = 4;",
  " export { x };",
].join("\n");

describe("fark satırlarının sınıflandırılması", () => {
  it("başlık satırları ekleme/silme SAYILMIYOR", () => {
    // `+++ b/dosya` ve `--- a/dosya` `+`/`-` ile başlıyor; naif bir kural
    // dosya adını yeşile boyuyor ve sayacı bozuyor.
    const lines = parseDiff(ORNEK);
    const basliklar = lines.filter((l) => l.kind === "meta").map((l) => l.text);
    expect(basliklar).toContain("--- a/src/a.ts");
    expect(basliklar).toContain("+++ b/src/a.ts");
  });

  it("hunk başlığı ayrı", () => {
    expect(parseDiff(ORNEK).find((l) => l.kind === "hunk")?.text).toBe("@@ -1,4 +1,5 @@");
  });

  it("eklenen ve silinen satırlar", () => {
    const lines = parseDiff(ORNEK);
    expect(lines.filter((l) => l.kind === "add").map((l) => l.text)).toEqual([
      "+const y = 3;",
      "+const z = 4;",
    ]);
    expect(lines.filter((l) => l.kind === "del").map((l) => l.text)).toEqual(["-const y = 2;"]);
  });

  it("değişmeyen satırlar korunuyor", () => {
    // Bağlam satırları farkın okunabilmesi için gerekli.
    expect(parseDiff(ORNEK).filter((l) => l.kind === "same")).toHaveLength(2);
  });

  it("sayaç yalnızca gerçek değişiklikleri sayıyor", () => {
    expect(diffStat(parseDiff(ORNEK))).toEqual({ added: 2, removed: 1 });
  });

  it("ikili dosya bildirimi başlık sayılıyor", () => {
    const lines = parseDiff("Binary files a/x.png and b/x.png differ");
    expect(lines[0].kind).toBe("meta");
  });

  it("yeni dosya bildirimi başlık sayılıyor", () => {
    const lines = parseDiff("new file mode 100644\n+ilk satır");
    expect(lines[0].kind).toBe("meta");
    expect(lines[1].kind).toBe("add");
  });

  it("boş fark boş liste", () => {
    expect(parseDiff("")).toEqual([]);
  });

  it("sondaki boş satır çizilmiyor", () => {
    // `split` her zaman bir tane üretiyor; gereksiz bir boşluk satırı ekliyor.
    expect(parseDiff("@@ -1 +1 @@\n+x\n")).toHaveLength(2);
  });
});
