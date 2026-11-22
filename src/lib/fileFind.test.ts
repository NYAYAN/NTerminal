// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import {
  findCount,
  findInLines,
  findMatcher,
  isFindKey,
  matchAtOrAfter,
  openViewerFind,
  provideViewerFind,
  viewerFindAvailable,
  type FindMatch,
} from "./fileFind";
import { setLanguage } from "./i18n";
import { DEFAULT_FLAGS } from "./textSearch";
import type { SearchFlags } from "../types";

/*
 * Açık dosyada arama.
 *
 * BİLDİRİLEN: "bir dosya açıkken arama için Cmd+F yapınca gidip terminalden
 * search ediyor, dosyadan değil." Seçenekler dosyaların İÇİNDE aramayla
 * paylaşılıyor; orada eşleşme Rust'ta (`search::matcher`). Aynı sorgu iki yerde
 * farklı eşleşirse "sütunda var, dosyada yok" denirdi — kurallar burada
 * bağlanıyor.
 *
 * Beklenen değerler Rust'ın kendisinden: aynı satırlar ve sorgular
 * `search::matcher`ın kalıp kurulumuyla (regex 1.13.1) koşturuldu, çıktıları
 * birebir bunlar (2026-11-23).
 */

const flags = (more: Partial<SearchFlags> = {}): SearchFlags => ({ ...DEFAULT_FLAGS, ...more });

/** Eşleşen metinler, satırıyla: "1:foo". */
function hits(lines: string[], query: string, more: Partial<SearchFlags> = {}): string[] {
  const result = findInLines(lines, query, flags(more));
  expect(result.error).toBe(null);
  return result.matches.map((m) => `${m.line}:${lines[m.line].slice(m.start, m.end)}`);
}

describe("eşleşme kuralları", () => {
  it("varsayılan büyük/küçük harf gözetmiyor; seçenekle gözetiyor", () => {
    expect(hits(["Foo foo FOO"], "foo")).toEqual(["0:Foo", "0:foo", "0:FOO"]);
    expect(hits(["Foo foo FOO"], "foo", { caseSensitive: true })).toEqual(["0:foo"]);
  });

  it("düz metindeki düzenli ifade karakterleri harfi harfine aranıyor", () => {
    expect(hits(["a.b axb a.b"], "a.b")).toEqual(["0:a.b", "0:a.b"]);
    expect(hits(["f(x) [1] {a} $HOME ^ | \\\\ / -"], "(x)")).toEqual(["0:(x)"]);
    for (const q of ["[1]", "{a}", "$HOME", "^", "|", "\\\\", "/", "-"]) {
      expect(hits(["f(x) [1] {a} $HOME ^ | \\\\ / -"], q), q).toEqual([`0:${q}`]);
    }
  });

  it("tam sözcük Türkçe harflerde de çalışıyor", () => {
    // JavaScript'in `\b`'si yalnızca ASCII harfleri sözcük sayıyor: baştaki
    // `ç` "sözcük değil" sayılır ve hiçbir şey eşleşmezdi.
    expect(hits(["çalış, çalışma; yalıçalış çalış"], "çalış", { wholeWord: true })).toEqual([
      "0:çalış",
      "0:çalış",
    ]);
    expect(hits(["ağaç ağaçlar"], "ağaç", { wholeWord: true })).toEqual(["0:ağaç"]);
  });

  it("tam sözcükte düz metin yalnızca sözcük karakteriyle biten ucundan sınırlanıyor", () => {
    // Rust'taki kuralın aynısı: `foo(` aranınca `foo()` eşleşmeli, `xfoo(` değil.
    expect(hits(["foo() xfoo( foo("], "foo(", { wholeWord: true })).toEqual(["0:foo(", "0:foo("]);
    expect(hits(["-x -xy a-x"], "-x", { wholeWord: true })).toEqual(["0:-x", "0:-x"]);
  });

  it("düzenli ifade; tam sözcükte sınırla sarılıyor", () => {
    expect(hits(["foo fooo fo"], "fo+", { regex: true })).toEqual(["0:foo", "0:fooo", "0:fo"]);
    expect(hits(["foo fooo xfoo"], "fo+", { regex: true, wholeWord: true })).toEqual(["0:foo", "0:fooo"]);
    expect(hits(["söz sözcük"], "s\\w+", { regex: true, wholeWord: true })).toEqual(["0:söz", "0:sözcük"]);
    expect(hits(["çalış çalışma xçalış"], "çal\\w+", { regex: true, wholeWord: true })).toEqual([
      "0:çalış",
      "0:çalışma",
    ]);
  });

  it("tam sözcüğe takılan ilk yerden sonra aynı satırda aramaya devam ediliyor", () => {
    expect(hits(["xfoo foo"], "foo", { wholeWord: true })).toEqual(["0:foo"]);
    expect(hits(["aaa aa"], "aa", { wholeWord: true })).toEqual(["0:aa"]);
    expect(hits(["😀x x"], "x", { wholeWord: true })).toEqual(["0:x", "0:x"]);
  });

  it("kurulan ifadede geri bakış yok (eski WebKit)", () => {
    // Sınır eşleşmeden sonra sınanıyor (bkz. `wholeWordCheck`).
    for (const more of [{ wholeWord: true }, { wholeWord: true, regex: true }, { regex: true }]) {
      const m = findMatcher("\\w+ çalış", flags(more));
      expect("re" in m && m.re.source, JSON.stringify(more)).not.toMatch(/\(\?<[=!]/);
    }
  });

  it("düzenli ifadede \\w ve \\d Unicode — Rust'taki gibi", () => {
    // JavaScript'te ikisi de yalnızca ASCII: `\w+` "çalış"ın `ç`sinde dururdu ve
    // içerik aramasında bulunan satır dosyada bulunmazdı.
    expect(hits(["söz sözcük çalış"], "s\\w+", { regex: true })).toEqual(["0:söz", "0:sözcük"]);
    expect(hits(["a-ç b"], "[\\w-]+", { regex: true })).toEqual(["0:a-ç", "0:b"]);
    expect(hits(["x ç!"], "\\W", { regex: true })).toEqual(["0: ", "0:!"]);
    expect(hits(["٣ 3 a"], "\\d", { regex: true })).toEqual(["0:٣", "0:3"]);
    expect(hits(["٣a 3"], "\\D+", { regex: true })).toEqual(["0:a "]);
  });

  it("^ ve $ satırın başı ve sonu", () => {
    expect(hits(["ab ab", "ab"], "^ab", { regex: true })).toEqual(["0:ab", "1:ab"]);
    expect(hits(["ab ab", "xab"], "ab$", { regex: true })).toEqual(["0:ab", "1:ab"]);
  });

  it("Rust'ın kabul ettiği gereksiz kaçışlar geçerli sayılıyor", () => {
    // JavaScript'in `u` kipi `\-`, `\#`, `\:` gibi kaçışları reddediyordu.
    expect(hits(["foo-bar foo_bar"], "foo\\-bar", { regex: true })).toEqual(["0:foo-bar"]);
    expect(hits(["a#b a:b"], "a\\#b|a\\:b", { regex: true })).toEqual(["0:a#b", "0:a:b"]);
    expect(hits(["[a-z]"], "[a\\-z]+", { regex: true })).toEqual(["0:a-z"]);
    expect(hits(["x y"], "x\\ y", { regex: true })).toEqual(["0:x y"]);
    // Asıl kaçışlar yerinde.
    expect(hits(["a.b axb", "\\d"], "a\\.b", { regex: true })).toEqual(["0:a.b"]);
    expect(hits(["12 ab"], "\\d+", { regex: true })).toEqual(["0:12"]);
  });

  it("bozuk düzenli ifade hata cümlesi veriyor, eşleşme yok", () => {
    setLanguage("tr");
    const result = findInLines(["a(b"], "a(", flags({ regex: true }));
    expect(result.matches).toEqual([]);
    expect(result.error).toMatch(/^Geçersiz düzenli ifade: /);
    // Yalnızca neden; motorun cümlesindeki kalıp ve bayraklar ("/a(/giu:") değil.
    expect(result.error).not.toMatch(/\/giu|a\(/);
    expect(findMatcher("a(", flags({ regex: true }))).toEqual({ error: result.error });
  });

  it("boş eşleşmeler sayılmıyor ve arama takılmıyor", () => {
    expect(hits(["aaa b"], "a*", { regex: true })).toEqual(["0:aaa"]);
    expect(hits(["😀😀"], "x*", { regex: true })).toEqual([]);
    expect(hits(["😀 a"], "a|", { regex: true })).toEqual(["0:a"]);
  });

  it("konumlar UTF-16: çok baytlı karakterden sonra da doğru yer", () => {
    const [m] = findInLines(["😀 ağaç"], "ağaç", flags()).matches;
    expect(m).toEqual({ line: 0, start: 3, end: 7 });
  });

  it("sorgu boşsa sonuç boş", () => {
    expect(findInLines(["abc"], "", flags())).toEqual({ matches: [], capped: false, error: null });
  });

  it("sınıra takılınca kesiliyor ve bu söyleniyor", () => {
    const result = findInLines(["a a a", "a a"], "a", flags(), 3);
    expect(result.matches).toHaveLength(3);
    expect(result.capped).toBe(true);
    expect(findCount(result, 0)).toBe("1/3+");
    expect(findInLines(["a a a"], "a", flags(), 3).capped).toBe(false);
  });
});

describe("etkin eşleşme", () => {
  const ms: FindMatch[] = [
    { line: 0, start: 2, end: 4 },
    { line: 3, start: 0, end: 2 },
    { line: 3, start: 5, end: 7 },
  ];

  it("konumda ya da sonrasında başlayan ilk eşleşme; sonrasında yoksa başa dönüyor", () => {
    expect(matchAtOrAfter(ms, 0, 0)).toBe(0);
    expect(matchAtOrAfter(ms, 0, 2)).toBe(0);
    expect(matchAtOrAfter(ms, 0, 3)).toBe(1);
    expect(matchAtOrAfter(ms, 3, 1)).toBe(2);
    expect(matchAtOrAfter(ms, 3, 5)).toBe(2);
    expect(matchAtOrAfter(ms, 3, 6)).toBe(0);
    expect(matchAtOrAfter(ms, 9, 0)).toBe(0);
    expect(matchAtOrAfter([], 0, 0)).toBe(-1);
  });

  it("sayaç: sıra / toplam; eşleşme yoksa 0/0, hata ya da sonuç yoksa boş", () => {
    const result = { matches: ms, capped: false, error: null };
    expect(findCount(result, 1)).toBe("2/3");
    expect(findCount({ matches: [], capped: false, error: null }, -1)).toBe("0/0");
    expect(findCount({ matches: [], capped: false, error: "x" }, -1)).toBe("");
    expect(findCount(null, -1)).toBe("");
  });
});

describe("aramayı açan tuş", () => {
  const key = (init: KeyboardEventInit) => new KeyboardEvent("keydown", init);

  it("ayardaki kısayol", () => {
    expect(isFindKey(key({ key: "f", code: "KeyF", metaKey: true }), "Cmd+F", true)).toBe(true);
    expect(isFindKey(key({ key: "F", code: "KeyF", ctrlKey: true, shiftKey: true }), "Ctrl+Shift+F", false)).toBe(true);
    // Kullanıcı değiştirdiyse yenisi.
    expect(isFindKey(key({ key: "j", code: "KeyJ", ctrlKey: true, altKey: true }), "Ctrl+Alt+J", false)).toBe(true);
  });

  it("platformun kendi 'bul' tuşu da: Windows'ta Ctrl+F, mac'te ⌘F", () => {
    expect(isFindKey(key({ key: "f", code: "KeyF", ctrlKey: true }), "Ctrl+Shift+F", false)).toBe(true);
    expect(isFindKey(key({ key: "f", code: "KeyF", metaKey: true }), "Ctrl+Alt+J", true)).toBe(true);
    // Öbür platformun tuşu değil.
    expect(isFindKey(key({ key: "f", code: "KeyF", ctrlKey: true }), "Cmd+F", true)).toBe(false);
    expect(isFindKey(key({ key: "f", code: "KeyF", metaKey: true }), "Ctrl+Shift+F", false)).toBe(false);
    expect(isFindKey(key({ key: "g", code: "KeyG", ctrlKey: true }), "Ctrl+Shift+F", false)).toBe(false);
  });
});

describe("görüntüleyicinin kaydı", () => {
  it("kayıtlıyken açılıyor; kayıt yalnızca kendi sahibi tarafından siliniyor", () => {
    expect(viewerFindAvailable()).toBe(false);
    const first = vi.fn();
    const second = vi.fn();
    const dropFirst = provideViewerFind(first);
    const dropSecond = provideViewerFind(second);
    expect(viewerFindAvailable()).toBe(true);
    // Dosya değişince eski görüntüleyicinin sökülmesi yenisinin kaydını silmemeli.
    dropFirst();
    expect(viewerFindAvailable()).toBe(true);
    openViewerFind();
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    dropSecond();
    expect(viewerFindAvailable()).toBe(false);
    openViewerFind();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
