// @vitest-environment jsdom
import { act, cleanup, configure, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLanguage } from "../lib/i18n";
import { api } from "../lib/ipc";
import { setPlatform } from "../lib/platform";
import { DEFAULT_FLAGS } from "../lib/textSearch";
import { sessions, useStore } from "../store/useStore";
import type { Group, TabState, TextSearchResult } from "../types";
import { FilePalette } from "./FilePalette";

/*
 * Arama 200 ms bekleyip koşuyor (`SEARCH_DEBOUNCE_MS`). `waitFor`un 1 sn'lik
 * varsayılanı tek başına yetiyor, ama bütün paket paralel koşarken bir kez
 * aşıldı (ölçüldü: mutasyon denetimi sırasında). Bekleme sonucu değil, makinenin
 * yükünü ölçmesin.
 */
configure({ asyncUtilTimeout: 3000 });

/**
 * Başlık çubuğundaki arama: dosya ADI ve dosya İÇERİĞİ sekmeleri.
 *
 * İSTEK: "üstte arama var, dosyaları arıyor; dosyaların içinde metin arama da
 * olmalı." Aynı paletin ikinci sekmesi — kutu ve sorgu ortak, Tab sekmeyi
 * değiştiriyor. Buradaki testler kullanıcının gözlediği sözleşmeyi bağlıyor:
 * hangi sekmede ne okunuyor, Enter nereyi açıyor, sorgu nerede kalıyor.
 */

const CWD = "/depo";

function tab(): TabState {
  return {
    id: "t1",
    title: "t1",
    customTitle: null,
    profileId: "p1",
    cwd: CWD,
    createdAt: 0,
    lastActiveAt: 0,
    hasScrollback: false,
    lastCommand: null,
    locked: false,
  };
}

function group(): Group {
  return {
    id: "g1",
    name: "Grup",
    color: null,
    icon: null,
    collapsed: false,
    favorite: false,
    ungrouped: false,
    defaultProfileId: null,
    defaultCwd: null,
    env: {},
    activeTabId: "t1",
    tabs: [tab()],
  };
}

const GERCEK = {
  openFile: useStore.getState().openFile,
  insertPath: useStore.getState().insertPath,
};

function seed(mode: "files" | "text", query = "") {
  const state = useStore.getState();
  useStore.setState({
    ...GERCEK,
    ready: true,
    groups: [group()],
    activeGroupId: "g1",
    ui: {
      ...state.ui,
      filePaletteOpen: true,
      paletteMode: mode,
      paletteQuery: query,
      searchFlags: DEFAULT_FLAGS,
    },
  });
}

const HITS: TextSearchResult = {
  files: [
    {
      path: "src/a.ts",
      matches: 2,
      lines: [
        { line: 3, text: "const foo = 1;", ranges: [[6, 9]], col: 8, len: 3 },
        { line: 9, text: "foo()", ranges: [[0, 3]], col: 0, len: 3 },
      ],
    },
    {
      path: "b.ts",
      matches: 1,
      lines: [{ line: 1, text: "// foo", ranges: [[3, 6]], col: 3, len: 3 }],
    },
  ],
  matches: 3,
  lines: 3,
  searched: 10,
  truncated: false,
  filesCapped: false,
  skippedLarge: 0,
  git: true,
  cancelled: false,
};

const input = (c: HTMLElement) => c.querySelector<HTMLInputElement>(".palette input")!;
const palette = (c: HTMLElement) => c.querySelector<HTMLElement>(".palette")!;

async function type(c: HTMLElement, value: string) {
  await act(async () => {
    fireEvent.change(input(c), { target: { value } });
  });
}

beforeEach(() => {
  setLanguage("tr");
  setPlatform("windows");
});

afterEach(() => {
  cleanup();
  sessions.clear();
  vi.restoreAllMocks();
});

describe("dosya paletinin iki sekmesi", () => {
  it("Tab sekmeyi değiştiriyor, sorgu korunuyor", async () => {
    // "useStore" yazıp adında bulamayan kişi Tab'a basıp içinde geçtiği
    // yerleri görmeli; sorguyu yeniden yazmamalı.
    seed("files");
    vi.spyOn(api, "listFiles").mockResolvedValue(["src/a.ts"]);
    const searchText = vi.spyOn(api, "searchText").mockResolvedValue(HITS);
    const { container } = render(<FilePalette />);
    await type(container, "foo");

    await act(async () => {
      fireEvent.keyDown(input(container), { key: "Tab" });
    });
    expect(useStore.getState().ui.paletteMode).toBe("text");
    expect(input(container).value).toBe("foo");
    expect(input(container).placeholder).toBe("Dosyaların içinde ara…");
    await waitFor(() => expect(searchText).toHaveBeenCalledWith(expect.any(Number), CWD, "foo", DEFAULT_FLAGS));

    // Seçili sekme erişilebilir biçimde bildiriliyor.
    const tabs = [...container.querySelectorAll('[role="tab"]')];
    expect(tabs.map((el) => el.getAttribute("aria-selected"))).toEqual(["false", "true"]);
  });

  it("içerik sekmesi dosya ADI listesini okumuyor", async () => {
    // Büyük bir dizinde yirmi bin dosyalık yürüyüş, kullanılmayacaksa boşuna.
    seed("text", "foo");
    const listFiles = vi.spyOn(api, "listFiles").mockResolvedValue([]);
    const searchText = vi.spyOn(api, "searchText").mockResolvedValue(HITS);
    render(<FilePalette />);
    await waitFor(() => expect(searchText).toHaveBeenCalled());
    expect(listFiles).not.toHaveBeenCalled();
  });

  it("ad sekmesi içeriği aramıyor", async () => {
    seed("files", "foo");
    const listFiles = vi.spyOn(api, "listFiles").mockResolvedValue([]);
    const searchText = vi.spyOn(api, "searchText").mockResolvedValue(HITS);
    render(<FilePalette />);
    await waitFor(() => expect(listFiles).toHaveBeenCalled());
    // Beklemenin (200 ms) ötesine kadar: arama zamanlayıcısı hiç kurulmamalı.
    await new Promise((r) => setTimeout(r, 300));
    expect(searchText).not.toHaveBeenCalled();
  });

  it("sonuçlar dosyaya göre gruplu, eşleşme işaretli, durum satırında sayılar", async () => {
    seed("text", "foo");
    vi.spyOn(api, "searchText").mockResolvedValue(HITS);
    const { container } = render(<FilePalette />);
    await waitFor(() => expect(container.querySelectorAll(".hit-file")).toHaveLength(2));

    const heads = [...container.querySelectorAll(".hit-head")];
    expect(heads[0].querySelector(".hit-name")?.textContent).toBe("a.ts");
    expect(heads[0].querySelector(".hit-dir")?.textContent).toBe("src/");
    expect(heads[0].querySelector(".hit-count")?.textContent).toBe("2");

    const lines = [...container.querySelectorAll(".hit-line")];
    expect(lines.map((el) => el.querySelector(".hit-no")?.textContent)).toEqual(["3", "9", "1"]);
    expect([...container.querySelectorAll(".hit-text mark")].map((m) => m.textContent)).toEqual(["foo", "foo", "foo"]);
    expect(lines[0].querySelector(".hit-text")?.textContent).toBe("const foo = 1;");

    expect(container.querySelector(".search-status")?.textContent).toContain("3 eşleşme · 2 dosya");
    // Palette yer var: git'in yok saydıkları notu görünür.
    expect(container.querySelector(".search-status")?.textContent).toContain("Git'in yok saydığı");
  });

  it.each([
    { ad: "Enter dosyayı O SATIRDA açıyor", shift: false },
    { ad: "Shift+Enter yolu komut satırına ekliyor", shift: true },
  ])("$ad ve paleti kapatıyor", async ({ shift }) => {
    seed("text", "foo");
    const openFile = vi.fn();
    const insertPath = vi.fn();
    useStore.setState({ openFile, insertPath });
    vi.spyOn(api, "searchText").mockResolvedValue(HITS);
    const { container } = render(<FilePalette />);
    await waitFor(() => expect(container.querySelectorAll(".hit-line")).toHaveLength(3));

    // Oklar dosya başlıklarını atlıyor: ikinci satır `a.ts`in 9. satırı.
    await act(async () => {
      fireEvent.keyDown(palette(container), { key: "ArrowDown" });
    });
    expect(container.querySelector(".hit-line.on .hit-no")?.textContent).toBe("9");
    await act(async () => {
      fireEvent.keyDown(palette(container), { key: "Enter", shiftKey: shift });
    });

    if (shift) {
      expect(insertPath).toHaveBeenCalledWith("/depo/src/a.ts");
      expect(openFile).not.toHaveBeenCalled();
    } else {
      expect(openFile).toHaveBeenCalledWith("/depo/src/a.ts", { line: 9, col: 0, len: 3 });
      expect(insertPath).not.toHaveBeenCalled();
    }
    expect(useStore.getState().ui.filePaletteOpen).toBe(false);
  });

  it("seçenekler düğmeyle ve Alt+C/W/R ile değişiyor, aramaya gidiyor", async () => {
    seed("text", "foo");
    const searchText = vi.spyOn(api, "searchText").mockResolvedValue(HITS);
    const { container } = render(<FilePalette />);
    await waitFor(() => expect(searchText).toHaveBeenCalledTimes(1));

    const toggle = (flag: string) => container.querySelector<HTMLButtonElement>(`.search-toggle[data-flag="${flag}"]`)!;
    expect(toggle("caseSensitive").getAttribute("aria-pressed")).toBe("false");
    await act(async () => {
      fireEvent.click(toggle("caseSensitive"));
    });
    expect(useStore.getState().ui.searchFlags.caseSensitive).toBe(true);
    expect(toggle("caseSensitive").getAttribute("aria-pressed")).toBe("true");
    await waitFor(() =>
      expect(searchText).toHaveBeenLastCalledWith(expect.any(Number), CWD, "foo", {
        caseSensitive: true,
        wholeWord: false,
        regex: false,
      }),
    );

    // Tuş `code`dan okunuyor: Türkçe düzende de aynı fiziksel tuş.
    await act(async () => {
      fireEvent.keyDown(input(container), { key: "®", code: "KeyR", altKey: true });
    });
    expect(useStore.getState().ui.searchFlags.regex).toBe(true);
  });

  it("son sorgu hatırlanıyor ve SEÇİLİ geliyor", async () => {
    // Palet seçimde kapanıyor; bir sonraki eşleşmeye gitmek için yeniden açan
    // kişi aynı aramaya dönmeli, yazmaya başlayan ise sorguyu silmeli.
    seed("files");
    vi.spyOn(api, "listFiles").mockResolvedValue([]);
    const first = render(<FilePalette />);
    await type(first.container, "useStore");
    first.unmount();
    expect(useStore.getState().ui.paletteQuery).toBe("useStore");

    const { container } = render(<FilePalette />);
    expect(input(container).value).toBe("useStore");
    expect(document.activeElement).toBe(input(container));
    expect([input(container).selectionStart, input(container).selectionEnd]).toEqual([0, 8]);
  });

  it("bozuk düzenli ifade söyleniyor", async () => {
    seed("text", "(foo");
    vi.spyOn(api, "searchText").mockRejectedValue("regex: unclosed group");
    const { container } = render(<FilePalette />);
    await waitFor(() =>
      expect(container.querySelector(".search-status.err")?.textContent).toBe("Geçersiz düzenli ifade: unclosed group"),
    );
  });

  it("sınıra takılan arama bunu söylüyor", async () => {
    seed("text", "e");
    vi.spyOn(api, "searchText").mockResolvedValue({ ...HITS, truncated: true, lines: 2000, skippedLarge: 2 });
    const { container } = render(<FilePalette />);
    await waitFor(() => expect(container.querySelectorAll(".search-note").length).toBeGreaterThan(0));
    const notes = [...container.querySelectorAll(".search-note")].map((n) => n.textContent ?? "");
    expect(notes.some((n) => n.includes("2000"))).toBe(true);
    expect(notes.some((n) => n.includes("2 MB"))).toBe(true);
  });
});
