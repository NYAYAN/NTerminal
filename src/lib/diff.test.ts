import { describe, expect, it } from "vitest";

import {
  contextLines,
  diffItems,
  diffStat,
  hunkContext,
  hunkNewStart,
  isRedundantHeader,
  parseDiff,
  splitGap,
} from "./diff";

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

/**
 * Bağlam açıcıları.
 *
 * İSTEK: "Değişiklik olmayan satırları göster için yukarıda ve aşağıda 50
 * satırlık kod açma butonları olsun, bastıkça açılsın."
 *
 * `git diff` değişen satırların çevresinde üç satır bağlam veriyor; arası
 * gizli. Fark metni o satırları TAŞIMIYOR, yani açma işi iki parçadan
 * oluşuyor: boşluğun NEREDE olduğunu farktan çıkarmak (burası) ve satırları
 * dosyadan getirmek. İlk parçanın hatası sessiz olurdu — yanlış numaralanmış
 * bir boşluk, açıldığında ilgisiz kod gösterirdi.
 */
const IKI_HUNK = [
  "diff --git a/src/a.ts b/src/a.ts",
  "--- a/src/a.ts",
  "+++ b/src/a.ts",
  "@@ -10,3 +10,4 @@ export function bir()",
  " bir",
  "+iki",
  " uc",
  "@@ -120,2 +121,2 @@ export function iki()",
  "-eski",
  "+yeni",
].join("\n");

describe("hunk başlığı", () => {
  it("yeni taraftaki başlangıç numarası okunuyor", () => {
    expect(hunkNewStart("@@ -10,3 +21,4 @@")).toBe(21);
    expect(hunkNewStart("@@ -10 +21 @@")).toBe(21);
    expect(hunkNewStart(" const x = 1;")).toBe(null);
  });

  it("başlıktan sonraki bağlam metni ayrılıyor", () => {
    // Başlığın tek özgün parçası bu: kapsayan işlevin adı. Numaralar zaten
    // soldaki sütunda yazıyor.
    expect(hunkContext("@@ -10,3 +10,4 @@ export function bir()")).toBe("export function bir()");
    expect(hunkContext("@@ -10,3 +10,4 @@")).toBe("");
  });
});

describe("boşlukların bulunması", () => {
  it("hunk başlığının yerine boşluk geçiyor", () => {
    const items = diffItems(parseDiff(IKI_HUNK));
    // Ham `@@` satırı artık çizilmiyor: söylediği iki şeyden biri boşluk
    // satırında, öteki numara sütununda.
    expect(items.some((i) => i.kind === "line" && i.line.kind === "hunk")).toBe(false);
  });

  it("dosyanın başındaki gizli satırlar", () => {
    const items = diffItems(parseDiff(IKI_HUNK));
    const ilk = items.find((i) => i.kind === "gap");
    expect(ilk).toEqual({
      kind: "gap",
      from: 1,
      to: 9,
      context: "export function bir()",
    });
  });

  it("iki hunk ARASINDAKİ gizli satırlar", () => {
    // İlk hunk 10'da başlayıp 13'te bitiyor (bir, iki, uc → 10,11,12);
    // ikincisi 121'de başlıyor.
    const items = diffItems(parseDiff(IKI_HUNK));
    const araliklar = items.filter((i) => i.kind === "gap");
    expect(araliklar[1]).toEqual({
      kind: "gap",
      from: 13,
      to: 120,
      context: "export function iki()",
    });
  });

  it("dosyanın SONU ancak satır sayısı biliniyorsa boşluk üretiyor", () => {
    // Fark, dosyanın kaç satır olduğunu söylemiyor. Bilinmiyorken düğme
    // göstermek, basınca hiçbir şey açmayan bir düğme demek.
    const yok = diffItems(parseDiff(IKI_HUNK));
    expect(yok.filter((i) => i.kind === "gap")).toHaveLength(2);

    const var_ = diffItems(parseDiff(IKI_HUNK), 200);
    const son = var_.filter((i) => i.kind === "gap").at(-1);
    expect(son).toEqual({ kind: "gap", from: 122, to: 200, context: "" });
  });

  it("dosya son hunk'ta bitiyorsa sonda boşluk YOK", () => {
    const items = diffItems(parseDiff(IKI_HUNK), 121);
    expect(items.filter((i) => i.kind === "gap")).toHaveLength(2);
  });

  it("ayrıştırılamayan başlık ham satır olarak kalıyor", () => {
    // Uydurma bir boşluk göstermektense ham satırı göstermek dürüst.
    const items = diffItems(parseDiff("@@ bozuk @@\n satir"));
    expect(items[0]).toEqual({ kind: "line", line: expect.objectContaining({ kind: "hunk" }) });
  });
});

describe("boşluğun bölünmesi", () => {
  const bosluk = { from: 10, to: 109 }; // 100 satır

  it("hiç açılmamışken hepsi gizli", () => {
    expect(splitGap(bosluk, 0, 0)).toEqual({
      top: null,
      hidden: { from: 10, to: 109 },
      bottom: null,
    });
  });

  it("üstten açmak satırları açıcının ÜSTÜNE koyuyor", () => {
    expect(splitGap(bosluk, 50, 0)).toEqual({
      top: { from: 10, to: 59 },
      hidden: { from: 60, to: 109 },
      bottom: null,
    });
  });

  it("iki yandan açmak ortadan daraltıyor", () => {
    expect(splitGap(bosluk, 50, 30)).toEqual({
      top: { from: 10, to: 59 },
      hidden: { from: 60, to: 79 },
      bottom: { from: 80, to: 109 },
    });
  });

  it("iki taraf buluşunca gizli parça kalmıyor", () => {
    // Açacak bir şey kalmadığında açıcı satır da kaybolmalı.
    expect(splitGap(bosluk, 50, 50).hidden).toBe(null);
  });

  it("taşan açılma AYNI satırı iki kez göstermiyor", () => {
    // 80 + 80 > 100. Alttaki açılma kırpılıyor.
    const s = splitGap(bosluk, 80, 80);
    expect(s.top).toEqual({ from: 10, to: 89 });
    expect(s.bottom).toEqual({ from: 90, to: 109 });
    expect(s.hidden).toBe(null);
  });

  it("boş boşlukta hiçbir şey yok", () => {
    expect(splitGap({ from: 5, to: 4 }, 10, 10)).toEqual({
      top: null,
      hidden: null,
      bottom: null,
    });
  });
});

describe("açılan satırların fark satırına çevrilmesi", () => {
  const dosya = ["bir", "iki", "uc", "dort"];

  it("metin BOŞLUKLA başlıyor", () => {
    // Birleşik farkta bağlam satırlarının biçimi bu; boşluksuz yazılan satır
    // değişenlere göre bir karakter sola kayardı.
    expect(contextLines(dosya, 2, 3).map((l) => l.text)).toEqual([" iki", " uc"]);
  });

  it("numara yeni tarafa yazılıyor", () => {
    expect(contextLines(dosya, 2, 3).map((l) => l.newLine)).toEqual([2, 3]);
    expect(contextLines(dosya, 2, 3).every((l) => l.kind === "same")).toBe(true);
  });

  it("dosyanın dışına taşan aralık kırpılıyor", () => {
    // Kırpılmış (512 KB sınırı) bir dosyada boşluk gerçekte olandan uzun
    // olabiliyor; olmayan satır uydurulmamalı.
    expect(contextLines(dosya, 3, 99)).toHaveLength(2);
    expect(contextLines(dosya, 0, 2)).toHaveLength(2);
  });
});

/**
 * Künye satırları.
 *
 * İSTEK: farkın başındaki `diff --git a/… b/…`, `index …`, `--- a/…`,
 * `+++ b/…` bloğunun görünmemesi. Haklı: dosya adı satırın BAŞLIĞINDA zaten
 * yazıyor ve bu dört satır dar bir panelde görünen farkın üçte birini yiyor.
 *
 * Ama "meta olan gitsin" DEĞİL: bazı künye satırları tek bilgi kaynağı.
 * Testlerin asıl konusu bu ayrım — yanlış tarafa düşen bir satır sessizce
 * bilgi kaybı demek.
 */
describe("künye satırları", () => {
  it("dosya adını tekrarlayanlar gizleniyor", () => {
    for (const satir of [
      "diff --git a/src/a.ts b/src/a.ts",
      "index 1234567..89abcde 100644",
      "--- a/src/a.ts",
      "+++ b/src/a.ts",
      "--- /dev/null",
      "new file mode 100644",
      "deleted file mode 100644",
    ]) {
      expect(isRedundantHeader(satir), satir).toBe(true);
    }
  });

  it("tek kaynağı künye olanlar KALIYOR", () => {
    for (const satir of [
      // İkili dosyada farkın tamamı bu; atılırsa fark bomboş görünür.
      "Binary files a/logo.png and b/logo.png differ",
      // Satır başlığı yalnızca YENİ adı gösteriyor.
      "rename from src/eski.ts",
      "rename to src/yeni.ts",
      "similarity index 96%",
      // chmod +x tek başına bir fark olabiliyor.
      "old mode 100644",
      "new mode 100755",
    ]) {
      expect(isRedundantHeader(satir), satir).toBe(false);
    }
  });

  it("çizim listesinde künye yok, içerik duruyor", () => {
    const items = diffItems(parseDiff(IKI_HUNK));
    const metinler = items
      .filter((i) => i.kind === "line")
      .map((i) => (i.kind === "line" ? i.line.text : ""));
    expect(metinler.some((t) => t.startsWith("diff --git"))).toBe(false);
    expect(metinler.some((t) => t.startsWith("+++"))).toBe(false);
    expect(metinler).toContain("+iki");
  });

  it("ikili dosyada bildirim çiziliyor", () => {
    // Tek satırı o; gizlenseydi panel "fark yok" der gibi görünürdü.
    const items = diffItems(parseDiff("diff --git a/x.png b/x.png\nBinary files a/x.png and b/x.png differ"));
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({
      kind: "line",
      line: expect.objectContaining({ text: "Binary files a/x.png and b/x.png differ" }),
    });
  });
});
