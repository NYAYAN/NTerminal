import { describe, expect, it } from "vitest";

import {
  buildRows,
  changeAtLine,
  lineSegments,
  lineToRow,
  nextChangeIndex,
  prevChangeIndex,
  rowToLine,
  unifiedRows,
} from "./diffView";
import { compareLines, diffTexts, foldRanges } from "./textDiff";

/**
 * Fark penceresinin çizim kararları.
 *
 * Satır ile ekrandaki sıra katlamada ayrışıyor; bir sıra kayarsa ortadaki
 * bağlayıcı yanlış satıra bağlanır ve eş zamanlı kaydırma karşı tarafı yanlış
 * yere götürür. Hata ekranda "biraz kaymış" görünür ve fark edilmesi zordur;
 * o yüzden eşleme burada iki yönlü sınanıyor.
 */

describe("satır modeli", () => {
  const folds = [
    { start: 2, end: 6 },
    { start: 9, end: 12 },
  ];
  const model = buildRows(14, folds);

  it("katlama tek sıraya iniyor", () => {
    // 0 1 [2..6) 6 7 8 [9..12) 12 13 → 8 sıra
    expect(Array.from(model.rows)).toEqual([0, 1, ~0, 6, 7, 8, ~1, 12, 13]);
    expect(model.rowOfLine[4]).toBe(2);
    expect(model.rowOfLine[12]).toBe(7);
  });

  it("satır → sıra → satır iki yönde tutarlı", () => {
    for (const line of [0, 1.5, 2, 3.25, 6, 8.5, 10, 12, 13.5]) {
      expect(rowToLine(model, folds, lineToRow(model, folds, line))).toBeCloseTo(line, 6);
    }
  });

  it("katlamanın içinde oran korunuyor", () => {
    // [2..6) katlaması tek sıra (2): ortası 4. satır.
    expect(lineToRow(model, folds, 4)).toBeCloseTo(2.5, 6);
  });
});

describe("gezinme", () => {
  //    a b c d e f g        a X c d Y f g Z
  const changes = compareLines(
    ["a", "b", "c", "d", "e", "f", "g"],
    ["a", "X", "c", "d", "Y", "f", "g", "Z"],
    "none",
  );

  it("sonraki fark imlecin ALTINDAKİ ilk blok", () => {
    expect(nextChangeIndex(changes, 2, 0)).toBe(0);
    // İmleç bir bloğun içindeyse o değil, sonraki.
    expect(nextChangeIndex(changes, 2, 1)).toBe(1);
    expect(nextChangeIndex(changes, 2, 7)).toBe(null);
  });

  it("önceki fark imlecin ÜSTÜNDE kalan son blok", () => {
    expect(prevChangeIndex(changes, 2, 4)).toBe(0);
    expect(prevChangeIndex(changes, 2, 1)).toBe(null);
    // Dosyanın sonundaki ekleme (Z) sağda 7. satır.
    expect(prevChangeIndex(changes, 2, 8)).toBe(2);
  });

  it("satırın üstündeki blok", () => {
    expect(changeAtLine(changes, 2, 4)).toBe(1);
    expect(changeAtLine(changes, 2, 3)).toBe(null);
  });
});

describe("satır parçaları", () => {
  it("değişen sözcük ayrı parça, gerisi düz", () => {
    const d = diffTexts("const y = 2;", "const y = 3;", { ignore: "none", highlight: "words" });
    const inner = d.changes[0].inner;
    const segs = lineSegments("const y = 3;", 0, inner, 2);
    expect(segs.map((s) => [s.text, s.kind])).toEqual([
      ["const y = ", null],
      ["3", "modified"],
      [";", null],
    ]);
  });

  it("eklenen sözcüğün karşı tarafında boş işaretçi", () => {
    const d = diffTexts("foo bar", "foo baz bar", { ignore: "none", highlight: "words" });
    const segs = lineSegments("foo bar", 0, d.changes[0].inner, 1);
    const bos = segs.find((s) => s.empty);
    expect(bos?.kind).toBe("inserted");
    // İşaretçi metni kaydırmıyor: parçaların birleşimi satırın kendisi.
    expect(segs.map((s) => s.text).join("")).toBe("foo bar");
  });

  it("birden çok satıra yayılan blokta her satır kendi payını alıyor", () => {
    const d = diffTexts("a\nb x\nc", "a\nb y\nc", { ignore: "none", highlight: "words" });
    const change = d.changes[0];
    expect(lineSegments("b y", 0, change.inner, 2).map((s) => s.kind)).toEqual([null, "modified"]);
  });
});

describe("birleşik görünüm", () => {
  it("önce eski, sonra yeni satırlar; değişmemiş satırda iki numara", () => {
    const d = diffTexts("a\nb\nc", "a\nB\nc", { ignore: "none", highlight: "lines" });
    expect(unifiedRows(d.changes, d.lines1.length, [])).toEqual([
      { kind: "same", line1: 0, line2: 0 },
      { kind: "old", line1: 1, change: 0 },
      { kind: "new", line2: 1, change: 0 },
      { kind: "same", line1: 2, line2: 2 },
    ]);
  });

  it("katlanan aralık tek satır", () => {
    const eski = Array.from({ length: 30 }, (_, i) => `l${i}`);
    const yeni = eski.map((l, i) => (i === 15 ? "x" : l));
    const changes = compareLines(eski, yeni, "none");
    const folds = foldRanges(changes, 30, 30, 4);
    const rows = unifiedRows(changes, 30, folds);
    expect(rows.filter((r) => r.kind === "fold")).toHaveLength(2);
    // 30 satır - (11 + 10) katlanan + 2 yer tutucu + 1 eklenen satır = 12 sıra.
    expect(rows).toHaveLength(12);
  });
});
