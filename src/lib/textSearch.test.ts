// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLanguage } from "./i18n";
import { api } from "./ipc";
import {
  DEFAULT_FLAGS,
  SEARCH_DEBOUNCE_MS,
  nextSearchId,
  searchErrorText,
  searchSummary,
  segments,
  useTextSearch,
} from "./textSearch";
import type { SearchFlags, TextSearchResult } from "../types";

/**
 * Dosyaların içinde arama — arayüz tarafı.
 *
 * Aramanın kendisi Rust'ta (`search_tests.rs`). Burada üç şey bağlanıyor:
 * eşleşme aralıklarının metni doğru yerden bölmesi (yanlış yerdeki `<mark>`
 * en kolay fark edilen ama en zor bulunan hata), sınırların söylenmesi ve
 * yazdıkça aramanın beklemesi + eskisini durdurması — hızlı yazan birinin
 * ekranda eski sorgunun sonucunu görmemesi.
 */

function result(partial: Partial<TextSearchResult> = {}): TextSearchResult {
  return {
    files: [],
    matches: 0,
    lines: 0,
    searched: 0,
    truncated: false,
    filesCapped: false,
    skippedLarge: 0,
    git: false,
    cancelled: false,
    ...partial,
  };
}

beforeEach(() => setLanguage("tr"));

describe("eşleşme parçaları", () => {
  it("metni işaretli ve düz parçalara bölüyor", () => {
    expect(segments("a foo b foo", [[2, 5], [8, 11]])).toEqual([
      { text: "a ", hit: false },
      { text: "foo", hit: true },
      { text: " b ", hit: false },
      { text: "foo", hit: true },
    ]);
  });

  it("aralıklar UTF-16 konumu: emoji ve Türkçe harfte kaymıyor", () => {
    // Rust konumları UTF-16 biriminde gönderiyor (bkz. `search::line_hit`).
    const text = "ğüş foo 😀 foo";
    const parts = segments(text, [[4, 7], [11, 14]]);
    expect(parts.filter((p) => p.hit).map((p) => p.text)).toEqual(["foo", "foo"]);
    expect(parts.map((p) => p.text).join("")).toBe(text);
  });

  it("bozuk aralık metni kaybettirmiyor", () => {
    // Sözleşme dışarıdan geliyor: sırasız, çakışan ya da taşan aralık olsa da
    // metnin tamamı çiziliyor.
    const text = "abcdef";
    for (const ranges of [
      [[4, 6], [0, 2]],
      [[0, 4], [2, 5]],
      [[3, 99]],
      [[9, 12]],
      [[2, 2]],
    ] as [number, number][][]) {
      expect(segments(text, ranges).map((p) => p.text).join(""), JSON.stringify(ranges)).toBe(text);
    }
    expect(segments(text, [])).toEqual([{ text, hit: false }]);
    expect(segments("", [])).toEqual([{ text: "", hit: false }]);
  });
});

describe("hata ve özet metni", () => {
  it("bozuk düzenli ifade kendi cümlesiyle", () => {
    expect(searchErrorText("regex: unclosed group")).toBe("Geçersiz düzenli ifade: unclosed group");
    expect(searchErrorText("klasor degil: /x")).toBe("Arama yapılamadı: klasor degil: /x");
  });

  it("sayılar iki dilde, çoğul İngilizcede", () => {
    const one = result({ matches: 1, files: [{ path: "a", lines: [], matches: 1 }] });
    expect(searchSummary(one).counts).toBe("1 eşleşme · 1 dosya");
    setLanguage("en");
    expect(searchSummary(one).counts).toBe("1 match · 1 file");
    const many = result({
      matches: 5,
      files: [
        { path: "a", lines: [], matches: 3 },
        { path: "b", lines: [], matches: 2 },
      ],
    });
    expect(searchSummary(many).counts).toBe("5 matches · 2 files");
  });

  it("sınırlar SÖYLENİYOR", () => {
    // Kesilen bir listeyi tam sanmak "başka yerde yokmuş" demek olurdu.
    expect(searchSummary(result()).notes).toEqual([]);
    const notes = searchSummary(result({ truncated: true, lines: 2000, filesCapped: true, skippedLarge: 3 })).notes;
    expect(notes).toHaveLength(3);
    expect(notes[0]).toContain("2000");
    expect(notes[2]).toContain("3");
  });
});

describe("arama kimliği", () => {
  it("tekil, artan ve JavaScript sayısında tam", () => {
    const ids = Array.from({ length: 50 }, () => nextSearchId());
    expect(new Set(ids).size).toBe(ids.length);
    for (let i = 1; i < ids.length; i++) expect(ids[i]).toBeGreaterThan(ids[i - 1]);
    expect(Number.isSafeInteger(ids[ids.length - 1])).toBe(true);
  });
});

describe("yazdıkça arama", () => {
  interface Props {
    cwd: string | null;
    query: string;
    flags: SearchFlags;
    enabled: boolean;
  }
  const initial: Props = { cwd: "/p", query: "", flags: DEFAULT_FLAGS, enabled: true };
  const hook = (props: Partial<Props> = {}) =>
    renderHook((p: Props) => useTextSearch(p.cwd, p.query, p.flags, p.enabled), {
      initialProps: { ...initial, ...props },
    });

  /** Sonucu elle verilen aramalar: geç gelen sonucu sınamak için. */
  let pending: { id: number; query: string; resolve: (r: TextSearchResult) => void; reject: (e: unknown) => void }[];
  let search: ReturnType<typeof vi.spyOn>;
  let cancel: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    pending = [];
    search = vi.spyOn(api, "searchText").mockImplementation(
      (id: number, _path: string, query: string) =>
        new Promise<TextSearchResult>((resolve, reject) => pending.push({ id, query, resolve, reject })),
    );
    cancel = vi.spyOn(api, "searchTextCancel").mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const wait = async (ms: number) => {
    await act(async () => {
      vi.advanceTimersByTime(ms);
    });
  };

  it("boş, yalnızca boşluk ya da kapalıyken aramıyor", async () => {
    const { result: r, rerender } = hook();
    await wait(SEARCH_DEBOUNCE_MS * 2);
    rerender({ ...initial, query: "   " });
    await wait(SEARCH_DEBOUNCE_MS * 2);
    rerender({ ...initial, query: "foo", enabled: false });
    await wait(SEARCH_DEBOUNCE_MS * 2);
    rerender({ ...initial, query: "foo", cwd: null });
    await wait(SEARCH_DEBOUNCE_MS * 2);
    expect(search).not.toHaveBeenCalled();
    expect(r.current.status).toBe("idle");
  });

  it("yazma soluğunu bekliyor: art arda harfler TEK arama", async () => {
    const { rerender } = hook({ query: "u" });
    for (const q of ["us", "use", "useS", "useStore"]) {
      await wait(SEARCH_DEBOUNCE_MS / 4);
      rerender({ ...initial, query: q });
    }
    expect(search).not.toHaveBeenCalled();
    await wait(SEARCH_DEBOUNCE_MS);
    expect(search).toHaveBeenCalledTimes(1);
    expect(pending[0].query).toBe("useStore");
  });

  it("sorgu ve seçenekler Rust'a olduğu gibi gidiyor", async () => {
    // Sorgu KIRPILMIYOR: "  foo" girintiyi de arıyor olabilir.
    const flags = { caseSensitive: true, wholeWord: false, regex: true };
    hook({ query: "  foo", flags });
    await wait(SEARCH_DEBOUNCE_MS);
    expect(search).toHaveBeenCalledWith(expect.any(Number), "/p", "  foo", flags);
  });

  it("yeni sorgu süren aramayı HEMEN durduruyor, geç gelen sonucu yok sayıyor", async () => {
    const { result: r, rerender } = hook({ query: "foo" });
    await wait(SEARCH_DEBOUNCE_MS);
    const first = pending[0];

    rerender({ ...initial, query: "foobar" });
    // Bekleme bitmeden: eski arama zaten durduruldu.
    expect(cancel).toHaveBeenCalledWith(first.id);

    // Eskisinin sonucu bu arada gelse de ekrana yazılmıyor.
    await act(async () => {
      first.resolve(result({ matches: 9 }));
    });
    expect(r.current.result).toBe(null);
    expect(r.current.status).toBe("searching");

    await wait(SEARCH_DEBOUNCE_MS);
    await act(async () => {
      pending[1].resolve(result({ matches: 2 }));
    });
    expect(r.current.status).toBe("done");
    expect(r.current.result?.matches).toBe(2);
  });

  it("yeni arama sürerken önceki sonuç ekranda kalıyor", async () => {
    // Her harfte listenin boşalıp dolması titreme gibi görünüyordu.
    const { result: r, rerender } = hook({ query: "foo" });
    await wait(SEARCH_DEBOUNCE_MS);
    await act(async () => {
      pending[0].resolve(result({ matches: 4 }));
    });
    rerender({ ...initial, query: "food" });
    expect(r.current.status).toBe("searching");
    expect(r.current.result?.matches).toBe(4);
  });

  it("hata kullanıcının okuyacağı cümleyle", async () => {
    const { result: r } = hook({ query: "(" });
    await wait(SEARCH_DEBOUNCE_MS);
    await act(async () => {
      pending[0].reject("regex: unclosed group");
    });
    expect(r.current.status).toBe("error");
    expect(r.current.error).toBe("Geçersiz düzenli ifade: unclosed group");
  });

  it("sökülürken süren aramayı durduruyor", async () => {
    // Palet kapanınca Rust'ta binlerce dosyayı okumaya devam etmesin.
    const { unmount } = hook({ query: "foo" });
    await wait(SEARCH_DEBOUNCE_MS);
    const id = pending[0].id;
    unmount();
    expect(cancel).toHaveBeenCalledWith(id);
  });
});
