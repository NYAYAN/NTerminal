import { describe, expect, it } from "vitest";

import { findLinks, linkCellRanges, readCells, type CellLike } from "./links";

/**
 * Bağlantı bulma, terminal çıktısının gerçek biçimleriyle sınanıyor.
 *
 * Buradaki durumların çoğu gerçek araç çıktısından: Vite/Angular'ın
 * `➜  Local:   http://localhost:4200/` satırı, cümle içinde geçen adres,
 * parantez içinde adres, ANSI renkli adres. Yanlış kırpma iki yönlü zarar
 * veriyor: fazla kırpınca adres bozuk açılıyor, az kırpınca sondaki nokta
 * adrese girip 404 üretiyor.
 */

const urls = (text: string) => findLinks(text).map((l) => l.url);
const spans = (text: string) => findLinks(text).map((l) => text.slice(l.start, l.end));

describe("bağlantı bulma", () => {
  it("düz adres", () => {
    expect(urls("http://localhost:4200/")).toEqual(["http://localhost:4200/"]);
    expect(urls("https://example.com")).toEqual(["https://example.com"]);
  });

  it("araç çıktısı satırı", () => {
    const line = "  ➜  Local:   http://localhost:4200/";
    expect(urls(line)).toEqual(["http://localhost:4200/"]);
    expect(spans(line)).toEqual(["http://localhost:4200/"]);
  });

  it("bir satırda birden çok adres", () => {
    const line = "http://a.test/x ve https://b.test/y";
    expect(urls(line)).toEqual(["http://a.test/x", "https://b.test/y"]);
  });

  it("cümle sonundaki nokta adrese girmiyor", () => {
    expect(urls("bkz. http://a.test/b.")).toEqual(["http://a.test/b"]);
    expect(urls("http://a.test/b,")).toEqual(["http://a.test/b"]);
    expect(urls("http://a.test/b;")).toEqual(["http://a.test/b"]);
    expect(urls("http://a.test/b!")).toEqual(["http://a.test/b"]);
    expect(urls("http://a.test/b?")).toEqual(["http://a.test/b"]);
  });

  it("yol sonundaki eğik çizgi korunuyor", () => {
    // Kırpılırsa bazı sunucular yönlendirme yapıyor, bazıları 404 veriyor.
    expect(urls("http://localhost:4200/")).toEqual(["http://localhost:4200/"]);
  });

  it("sorgu dizesi bozulmuyor", () => {
    expect(urls("http://a.test/x?a=1&b=2")).toEqual(["http://a.test/x?a=1&b=2"]);
    expect(urls("http://a.test/x#bolum-2")).toEqual(["http://a.test/x#bolum-2"]);
  });

  it("dengesiz kapanış parantezi kırpılıyor", () => {
    expect(urls("(bkz http://a.test/b)")).toEqual(["http://a.test/b"]);
    expect(urls("[http://a.test/b]")).toEqual(["http://a.test/b"]);
  });

  it("dengeli parantez adrese ait sayılıyor", () => {
    // Wikipedia türü adresler: parantez adresin parçası.
    expect(urls("http://a.test/Foo_(bar)")).toEqual(["http://a.test/Foo_(bar)"]);
    expect(urls("(http://a.test/Foo_(bar))")).toEqual(["http://a.test/Foo_(bar)"]);
  });

  it("tırnak içindeki adres tırnak almıyor", () => {
    expect(urls('"http://a.test/b"')).toEqual(["http://a.test/b"]);
    expect(urls("'http://a.test/b'")).toEqual(["http://a.test/b"]);
    expect(urls("<http://a.test/b>")).toEqual(["http://a.test/b"]);
  });

  it("www. şema kazanıyor", () => {
    expect(urls("www.example.com/x")).toEqual(["https://www.example.com/x"]);
  });

  it("gövdesiz eşleşme bağlantı sayılmıyor", () => {
    expect(urls("www.")).toEqual([]);
    expect(urls("http://")).toEqual([]);
  });

  it("adres olmayan metin eşleşmiyor", () => {
    expect(urls("")).toEqual([]);
    expect(urls("hata: 12 dosya bulunamadi")).toEqual([]);
    expect(urls("C:\\Users\\test\\proje")).toEqual([]);
    // Saat ve oran gibi ':' içeren metinler adres sanılmamalı.
    expect(urls("sure 00:12:45 oran 3:1")).toEqual([]);
  });

  it("indeksler metne göre doğru", () => {
    const line = "once http://a.test/b sonra";
    const [link] = findLinks(line);
    expect(line.slice(link.start, link.end)).toBe("http://a.test/b");
    expect(link.start).toBe(5);
  });

  it("büyük harfli şema de tanınıyor", () => {
    expect(urls("HTTP://A.TEST/B")).toEqual(["HTTP://A.TEST/B"]);
  });

  it("aynı satırda tekrar tekrar çağırmak aynı sonucu veriyor", () => {
    // Global regex'in `lastIndex`i sıfırlanmazsa ikinci çağrı eksik döner —
    // dekorasyonlar her çizimde yeniden hesaplandığı için bu ölümcül olurdu.
    const line = "http://a.test/1 http://a.test/2";
    expect(urls(line)).toEqual(["http://a.test/1", "http://a.test/2"]);
    expect(urls(line)).toEqual(["http://a.test/1", "http://a.test/2"]);
    expect(urls(line)).toEqual(["http://a.test/1", "http://a.test/2"]);
  });
});

// ---------------------------------------------------------------- hücreler

function cells(text: string, wide: number[] = []): CellLike[] {
  const out: CellLike[] = [];
  for (let i = 0; i < text.length; i++) {
    if (wide.includes(i)) {
      out.push({ chars: text[i], width: 2 });
      out.push({ chars: "", width: 0 });
    } else {
      out.push({ chars: text[i], width: 1 });
    }
  }
  return out;
}

describe("hücre eşlemesi", () => {
  it("düz metinde indeksler birebir", () => {
    const { text, cellOf } = readCells(cells("abc"));
    expect(text).toBe("abc");
    expect(cellOf).toEqual([0, 1, 2]);
  });

  it("geniş karakterin ikinci yarısı metne girmiyor", () => {
    // "a漢b": 漢 iki hücre kaplıyor, ikinci hücre boş.
    const { text, cellOf } = readCells(cells("a漢b", [1]));
    expect(text).toBe("a漢b");
    expect(cellOf).toEqual([0, 1, 3]);
  });

  it("boş hücre boşluk sayılıyor", () => {
    // xterm dolu olmayan hücrede boş dizge veriyor; metin hizası bozulmamalı.
    const { text, cellOf } = readCells([
      { chars: "a", width: 1 },
      { chars: "", width: 1 },
      { chars: "b", width: 1 },
    ]);
    expect(text).toBe("a b");
    expect(cellOf).toEqual([0, 1, 2]);
  });

  it("birleşik karakter tek hücrede", () => {
    // Aksan ayrı bir kod noktası olarak aynı hücrede taşınabiliyor.
    const { text, cellOf } = readCells([
      { chars: "e\u0301", width: 1 },
      { chars: "x", width: 1 },
    ]);
    expect(text).toBe("e\u0301x");
    expect(cellOf).toEqual([0, 0, 1]);
  });
});

describe("bağlantı hücre aralıkları", () => {
  it("düz satırda aralık metinle örtüşüyor", () => {
    const line = "git http://a.test/b";
    const ranges = linkCellRanges(cells(line));
    expect(ranges).toHaveLength(1);
    expect(ranges[0].x).toBe(4);
    expect(ranges[0].width).toBe("http://a.test/b".length);
    expect(ranges[0].url).toBe("http://a.test/b");
  });

  it("geniş karakterler aralığı kaydırıyor", () => {
    // "漢字 http://a.test" — iki geniş karakter dört hücre kaplıyor, adres
    // beşinci hücreden başlıyor.
    const line = "漢字 http://a.test";
    const ranges = linkCellRanges(cells(line, [0, 1]));
    expect(ranges).toHaveLength(1);
    expect(ranges[0].x, "geniş karakterler hesaba katılmalı").toBe(5);
    expect(ranges[0].width).toBe("http://a.test".length);
  });

  it("satır sonundaki adres taşmıyor", () => {
    const line = "http://a.test";
    const list = cells(line);
    const ranges = linkCellRanges(list);
    expect(ranges[0].x + ranges[0].width).toBeLessThanOrEqual(list.length);
  });

  it("adres yoksa aralık yok", () => {
    expect(linkCellRanges(cells("sadece metin"))).toEqual([]);
    expect(linkCellRanges([])).toEqual([]);
  });

  it("birden çok adres ayrı aralıklar", () => {
    const line = "http://a.test/1 http://a.test/2";
    const ranges = linkCellRanges(cells(line));
    expect(ranges).toHaveLength(2);
    expect(ranges[0].x).toBe(0);
    expect(ranges[1].x).toBe(16);
  });
});
