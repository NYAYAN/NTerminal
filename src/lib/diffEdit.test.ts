import { describe, expect, it } from "vitest";

import {
  applyEdit,
  displayOffset,
  EditHistory,
  editableEol,
  indentSelection,
  indentUnit,
  lineAt,
  MERGE_MS,
  newlineWithIndent,
  offsetOfLine,
  textEdit,
  toDisplay,
  toFile,
} from "./diffEdit";

/*
 * Fark penceresinin sağ tarafında yazmak — DOM'suz yarı.
 *
 * En önemli güvence satır sonları: yazı alanı her satır sonunu `\n` yapıyor;
 * dosyaya geri yazarken dokunulmayan satırların baytları değişmemeli.
 */

describe("satır sonları", () => {
  it("tek tür satır sonu düzenlenebilir, karışık ve yalnız CR değil", () => {
    expect(editableEol("a\nb\n")).toBe("\n");
    expect(editableEol("a\r\nb\r\n")).toBe("\r\n");
    expect(editableEol("tek satır")).toBe("\n");
    expect(editableEol("a\r\nb\n")).toBe(null);
    expect(editableEol("a\rb\r")).toBe(null);
    expect(editableEol("a\r\nb\rc\r\n")).toBe(null);
  });

  it("CRLF dosya gidiş-dönüşte bayt bayt aynı", () => {
    const raw = "x\r\n\r\ny\r\nson";
    expect(toFile(toDisplay(raw, "\r\n"), "\r\n")).toBe(raw);
    expect(toDisplay(raw, "\r\n")).toBe("x\n\ny\nson");
  });

  it("ham konumun yazı alanındaki karşılığı her CRLF için bir eksik", () => {
    const raw = "ab\r\ncd\r\nef";
    expect(displayOffset(raw, 0, "\r\n")).toBe(0);
    expect(displayOffset(raw, 4, "\r\n")).toBe(3); // c
    expect(displayOffset(raw, 8, "\r\n")).toBe(6); // e
    expect(displayOffset(raw, 8, "\n")).toBe(8);
  });
});

describe("değişiklik", () => {
  it("iki metnin farkı tek bitişik aralık", () => {
    expect(textEdit("abc", "abc")).toBe(null);
    expect(textEdit("abc", "abXc")).toEqual({ at: 2, removed: "", inserted: "X" });
    expect(textEdit("abc", "ac")).toEqual({ at: 1, removed: "b", inserted: "" });
    expect(textEdit("hello world", "hello there world")).toEqual({ at: 6, removed: "", inserted: "there " });
  });

  it("aynı harflerin tekrarında da metni doğru kuruyor", () => {
    for (const [a, b] of [
      ["aaa", "aaaa"],
      ["abab", "ab"],
      ["x\r\ny", "x\r\n\r\ny"],
      ["", "yeni"],
      ["eski", ""],
    ]) {
      const edit = textEdit(a, b)!;
      expect(applyEdit(a, edit)).toBe(b);
      expect(applyEdit(b, { at: edit.at, removed: edit.inserted, inserted: edit.removed })).toBe(a);
    }
  });
});

describe("geri alma", () => {
  /** Metne bir dizi değişiklik uygulayıp geçmişe yazar. */
  function typeAll(history: EditHistory, start: string, steps: string[], typing = true, gap = 10): string {
    let text = start;
    let now = 1000;
    for (const next of steps) {
      history.push(textEdit(text, next)!, typing, (now += gap));
      text = next;
    }
    return text;
  }

  it("art arda yazılan harfler TEK adımda geri alınıyor; imleç yazmadan önceki yerde", () => {
    const history = new EditHistory();
    const text = typeAll(history, "ab", ["aXb", "aXYb", "aXYZb"]);
    const step = history.undo()!;
    expect(applyEdit(text, step.edit)).toBe("ab");
    expect(step.caret).toBe(1);
    expect(history.canUndo).toBe(false);
  });

  it("duraksama, yeni satır ve araya giren `»` birleşmeyi bölüyor", () => {
    const slow = new EditHistory();
    typeAll(slow, "", ["a", "ab"], true, MERGE_MS + 1);
    slow.undo();
    expect(slow.canUndo).toBe(true);

    const enter = new EditHistory();
    typeAll(enter, "", ["a", "a\n", "a\nb"]);
    enter.undo();
    expect(enter.canUndo).toBe(true);

    const apply = new EditHistory();
    let text = typeAll(apply, "", ["a"]);
    apply.push(textEdit(text, "ab")!, false, 1011);
    text = "ab";
    expect(applyEdit(text, apply.undo()!.edit)).toBe("a");
  });

  it("geri silme ve ileri silme de birleşiyor", () => {
    const back = new EditHistory();
    let text = typeAll(back, "abcd", ["abc", "ab", "a"]);
    text = applyEdit(text, back.undo()!.edit);
    expect(text).toBe("abcd");

    const forward = new EditHistory();
    text = typeAll(forward, "abcd", ["bcd", "cd"]);
    expect(applyEdit(text, forward.undo()!.edit)).toBe("abcd");
  });

  it("geri alınan yinelenebiliyor; yeni bir değişiklik yinelemeyi siliyor", () => {
    const history = new EditHistory();
    let text = typeAll(history, "a", ["ab"], false);
    text = applyEdit(text, history.undo()!.edit);
    const redo = history.redo()!;
    text = applyEdit(text, redo.edit);
    expect(text).toBe("ab");
    expect(redo.caret).toBe(2);
    text = applyEdit(text, history.undo()!.edit);
    history.push(textEdit(text, "aZ")!, false);
    expect(history.canRedo).toBe(false);
  });
});

describe("satırlar", () => {
  it("konum ↔ satır", () => {
    const text = "bir\niki\n\ndört";
    expect(lineAt(text, 0)).toBe(0);
    expect(lineAt(text, 4)).toBe(1);
    expect(lineAt(text, 9)).toBe(3);
    expect(offsetOfLine(text, 1)).toBe(4);
    expect(offsetOfLine(text, 3)).toBe(9);
    expect(offsetOfLine(text, 99)).toBe(text.length);
  });
});

describe("girinti", () => {
  it("birim: sekme, en sık adım; JSDoc'un tek boşluğu yanıltmıyor", () => {
    expect(indentUnit("a\n\tb\n\t\tc\n")).toBe("\t");
    expect(indentUnit("a {\n  b {\n    c\n  }\n}\n")).toBe("  ");
    expect(indentUnit("/**\n * belge\n */\nf() {\n    x\n}\n")).toBe("    ");
    expect(indentUnit("düz metin\n")).toBe("    ");
  });

  it("sekme tuşu tek satırda bir sonraki durağa kadar boşluk", () => {
    expect(indentSelection("ab", 1, 1, "    ", false)).toEqual({ text: "a   b", start: 4, end: 4 });
    expect(indentSelection("ab", 0, 0, "\t", false)).toEqual({ text: "\tab", start: 1, end: 1 });
  });

  it("çok satırlı seçimde her satırın başına; boş satıra değil; seçim büyüyor", () => {
    const text = "a\n\nb\nc";
    // "a" satırının başından "b"nin ortasına kadar: üç satır, boş olan atlanıyor.
    const out = indentSelection(text, 0, 4, "  ", false);
    expect(out.text).toBe("  a\n\n  b\nc");
    expect(out.start).toBe(0);
    expect(out.end).toBe(8);
  });

  it("seçim bir satırın en başında bitiyorsa o satır girintilenmiyor", () => {
    expect(indentSelection("a\nb\nc", 0, 4, "  ", false).text).toBe("  a\n  b\nc");
  });

  it("Shift+Sekme her satırdan bir birim siliyor; imleç girintinin içindeyse satır başına", () => {
    const out = indentSelection("    a\n  b\nc", 2, 9, "    ", true);
    expect(out.text).toBe("a\nb\nc");
    expect(out.start).toBe(0);
    expect(out.end).toBe(3);
    expect(indentSelection("\tx", 2, 2, "\t", true)).toEqual({ text: "x", start: 1, end: 1 });
  });

  it("Enter girintiyi koruyor; imleç girintinin içindeyse yalnızca imlece kadarını", () => {
    expect(newlineWithIndent("  a", 3, 3)).toEqual({ text: "  a\n  ", start: 6, end: 6 });
    // İmleç eklenen girintinin sonunda; satırın kendi kalan boşluğu önünde.
    expect(newlineWithIndent("    a", 2, 2)).toEqual({ text: "  \n    a", start: 5, end: 5 });
    expect(newlineWithIndent("\tab", 2, 3)).toEqual({ text: "\ta\n\t", start: 4, end: 4 });
  });
});
