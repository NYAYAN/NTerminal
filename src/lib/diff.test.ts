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

/**
 * Satır numaraları.
 *
 * BİLDİRİLEN EKSİK: "değişiklik dosyalarında satır numaraları görünmüyor".
 *
 * Fark metninde numara YOK; yalnızca hunk başlığında başlangıçlar duruyor ve
 * gerisi sayılarak bulunuyor. Sayma kuralı satır türüne göre değişiyor ve
 * yanlış saymanın belirtisi sessiz: numaralar görünüyor ama bir yerden sonra
 * hepsi kayıyor. Bu yüzden her tür ayrı ayrı bağlı.
 */
describe("satır numaraları", () => {
  const FARK = [
    "diff --git a/x.ts b/x.ts",
    "index 111..222 100644",
    "--- a/x.ts",
    "+++ b/x.ts",
    "@@ -10,4 +10,5 @@",
    " baglam",
    "-silinen",
    "+eklenen-1",
    "+eklenen-2",
    " son",
  ].join("\n");

  /** Okunması kolay özet: `tür numara`. */
  const oku = (text: string) =>
    parseDiff(text).map((l) => `${l.kind} ${l.newLine ?? l.oldLine ?? "-"}`);

  it("hunk başlangıcından sayıyor", () => {
    expect(oku(FARK)).toEqual([
      "meta -",
      "meta -",
      "meta -",
      "meta -",
      "hunk -",
      "same 10",
      // Bağlam satırı iki sayacı da 11'e çekti; silinen satır ESKİ 11.
      "del 11",
      "add 11",
      "add 12",
      "same 13",
    ]);
  });

  it("bağlam satırı İKİ sayacı da ilerletiyor", () => {
    // Numaralamanın çekirdeği. Yalnızca yeniyi ilerletmek, silme çıkan ilk
    // hunk'tan sonra eski numaraları kalıcı olarak kaydırır.
    const lines = parseDiff(FARK);
    const baglam = lines.filter((l) => l.kind === "same");
    expect(baglam.map((l) => [l.oldLine, l.newLine])).toEqual([
      [10, 10],
      [12, 13],
    ]);
  });

  it("eklenen satırın eski numarası yok, silinenin yenisi yok", () => {
    const lines = parseDiff(FARK);
    const eklenen = lines.find((l) => l.kind === "add")!;
    const silinen = lines.find((l) => l.kind === "del")!;
    expect(eklenen.oldLine).toBe(null);
    expect(silinen.newLine).toBe(null);
  });

  it("ikinci hunk kendi başlangıcından devam ediyor", () => {
    // Sayaç sıfırlanmazsa ikinci hunk birincinin bittiği yerden sayar ve
    // dosyanın ortasındaki bütün numaralar yanlış olur.
    const iki = ["@@ -1,1 +1,1 @@", " a", "@@ -50,1 +60,1 @@", " b"].join("\n");
    expect(oku(iki)).toEqual(["hunk -", "same 1", "hunk -", "same 60"]);
  });

  it("hunk yoksa numara da yok", () => {
    // İkili dosya farkı ve yalnızca kip değişikliği hunk içermiyor; sayacı
    // sıfırdan yürütmek uydurma numara üretirdi.
    const ikili = ["diff --git a/x.png b/x.png", "Binary files a/x.png and b/x.png differ"].join(
      "\n",
    );
    expect(parseDiff(ikili).every((l) => l.newLine === null && l.oldLine === null)).toBe(true);
  });

  it("'No newline' notu sayacı ilerletmiyor", () => {
    // Bir satır değil, bir not. Sayarsa ondan sonraki her numara bir kayar —
    // üstelik dosyanın sonunda geldiği için gözden kaçmaya çok müsait.
    const son = ["@@ -1,2 +1,2 @@", " a", "-b", "\\ No newline at end of file", "+c"].join("\n");
    const lines = parseDiff(son);
    expect(lines[3].newLine).toBe(null);
    expect(lines[4].newLine, "not sayaca karışmış").toBe(2);
  });
});
