// @vitest-environment jsdom
import { act, cleanup, configure, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLanguage } from "../lib/i18n";
import { api } from "../lib/ipc";
import { setPlatform } from "../lib/platform";
import { DEFAULT_FLAGS } from "../lib/textSearch";
import { sessions, useStore } from "../store/useStore";
import type { GitChange, GitInfo, Group, TabState, TextSearchResult } from "../types";
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

type Ui = ReturnType<typeof useStore.getState>["ui"];

/**
 * Depoyu paletin açıldığı hâle getirir. Git durumu, son açılanlar ve kısayollar
 * her testte SIFIRDAN: depo modül düzeyinde yaşıyor, bir testin yazdığı ötekine
 * sızmasın.
 */
function seed(mode: "files" | "text", query = "", ui: Partial<Ui> = {}) {
  const state = useStore.getState();
  useStore.setState({
    ...GERCEK,
    ready: true,
    groups: [group()],
    activeGroupId: "g1",
    gitInfo: {},
    settings: { ...state.settings, keybindings: {} },
    ui: {
      ...state.ui,
      filePaletteOpen: true,
      paletteMode: mode,
      paletteQuery: query,
      searchFlags: DEFAULT_FLAGS,
      viewerPath: null,
      recentFiles: [],
      ...ui,
    },
  });
}

/** Etkin sekmenin dizinini değiştirir (kabuk bir alt klasörde, ya da henüz bilinmiyor). */
function dizin(cwd: string | null) {
  useStore.setState({ groups: [{ ...group(), tabs: [{ ...tab(), cwd }] }] });
}

function gitInfo(root: string, changes: GitChange[]): GitInfo {
  return {
    branch: "main",
    detached: false,
    ahead: 0,
    behind: 0,
    upstream: null,
    unborn: false,
    staged: 0,
    stashCount: 0,
    changes,
    root,
  };
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
    // Klasör ad sekmesindeki gibi yazılıyor (`src`, sonda ayırıcı yok): Tab'a
    // basan aynı klasörü iki ayrı biçimde görmesin. Eskiden `src/` idi.
    expect(heads[0].querySelector(".hit-dir")?.textContent).toBe("src");
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

/*
 * Tasarım önerisinin davranışı (Ctrl+P yeniden tasarımı): eşleşen harfler,
 * boş sorgunun bölümleri, sayılar, ⌥↑/⌥↓, boş ve sonuçsuz durumlar ve
 * erişilebilirlik bağları. Görünüşün kendisi CSS'te (premium.css); burada
 * kullanıcının okuduğu ve bastığı şey.
 */

const isaretler = (el: Element, parca: "file-name" | "file-dir" = "file-name") =>
  [...el.querySelectorAll(`.${parca} mark`)].map((m) => m.textContent);

const satirlar = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>(".file-row")];

describe("ad sekmesi: vurgu ve bölümler", () => {
  it("eşleşen harfler işaretli; dağınıklar 'Yakın eşleşmeler' başlığının altında", async () => {
    seed("files", "palet");
    vi.spyOn(api, "listFiles").mockResolvedValue([
      "src/lib/updaterRelease.test.ts",
      "src/components/FilePalette.tsx",
      "src-tauri/capabilities/default.json",
      "README.md",
    ]);
    const { container } = render(<FilePalette />);
    await waitFor(() => expect(satirlar(container)).toHaveLength(3));
    const [birebir, dagenik, klasorde] = satirlar(container);

    // Birebir eşleşme önde ve başlıksız: sorgunun asıl cevabı.
    expect(birebir.querySelector(".file-name")?.textContent).toBe("FilePalette.tsx");
    expect(isaretler(birebir)).toEqual(["Palet"]);

    const yakin = container.querySelector('[role="group"]')!;
    expect(yakin.getAttribute("aria-label")).toBe("Yakın eşleşmeler");
    expect([...container.querySelectorAll(".palette-section")].map((e) => e.textContent)).toEqual([
      "Yakın eşleşmeler",
    ]);
    expect(yakin.contains(dagenik) && yakin.contains(klasorde), "dağınıklar başlığın altında değil").toBe(true);
    expect(yakin.contains(birebir), "birebir eşleşme ayracın altında").toBe(false);

    // Harf harf; bitişik harfler tek parça.
    expect(isaretler(dagenik)).toEqual(["p", "a", "le", "t"]);
    // `default.json`da "p" yok: harfler klasörden geliyor ve orada işaretli.
    expect(isaretler(klasorde, "file-dir")).toEqual(["pa", "l", "e"]);
    expect(isaretler(klasorde)).toEqual(["t"]);
  });

  it("kalıp: `*.tsx` yalnız tsx dosyalarını getiriyor, uzantı işaretli", async () => {
    // İSTEK: "aramalarda *.tsx dersem bunların da çalışması gerekir."
    seed("files", "*.tsx");
    vi.spyOn(api, "listFiles").mockResolvedValue(["src/App.tsx", "src/main.ts", "README.md", "src/ui/Panel.tsx"]);
    const { container } = render(<FilePalette />);
    await waitFor(() => expect(satirlar(container)).toHaveLength(2));
    expect(satirlar(container).map((el) => el.querySelector(".file-name")?.textContent)).toEqual([
      "App.tsx",
      "Panel.tsx",
    ]);
    expect(isaretler(satirlar(container)[0])).toEqual([".tsx"]);
    // Kalıp eşleşmesi "yakın" sayılmıyor: ayraç yok.
    expect(container.querySelector(".palette-section")).toBeNull();
  });

  it("boş sorgu: Değişenler, Son açılanlar, Tüm dosyalar — yollar dizine göre", async () => {
    /*
     * Kabuk deponun ALT klasöründe: git yolları köke göre (`src/a.ts`), liste
     * dizine göre (`a.ts`). Dizinin dışındaki ve silinmiş değişiklik ile
     * dizinin dışındaki son açılan dosya listede olmamalı; bir dosya iki
     * bölümde birden görünmemeli.
     */
    seed("files", "", {
      recentFiles: ["/depo/src/c.ts", "/baska/x.ts", "/depo/src/a.ts"],
      viewerPath: "/depo/src/c.ts",
    });
    dizin("/depo/src");
    useStore.setState({
      gitInfo: {
        "/depo/src": gitInfo("/depo", [
          { path: "README.md", status: " M" },
          { path: "src/a.ts", status: " M" },
          { path: "src/gone.ts", status: " D" },
          { path: "src/lib/b.ts", status: "??" },
        ]),
      },
    });
    vi.spyOn(api, "listFiles").mockResolvedValue(["a.ts", "c.ts", "lib/b.ts", "lib/d.ts"]);
    const openFile = vi.fn();
    useStore.setState({ openFile });
    const { container } = render(<FilePalette />);
    await waitFor(() => expect(satirlar(container)).toHaveLength(4));

    const bolumler = [...container.querySelectorAll('[role="group"]')].map((g) => ({
      ad: g.getAttribute("aria-label"),
      satirlar: [...g.querySelectorAll(".file-row")].map((r) => r.getAttribute("title")),
    }));
    expect(bolumler).toEqual([
      { ad: "Değişenler", satirlar: ["/depo/src/a.ts", "/depo/src/lib/b.ts"] },
      { ad: "Son açılanlar", satirlar: ["/depo/src/c.ts"] },
      { ad: "Tüm dosyalar", satirlar: ["/depo/src/lib/d.ts"] },
    ]);

    // Git durumu Değişiklikler listesindeki simgeyle; açık dosyanın rozeti.
    const satir = (yol: string) => container.querySelector(`.file-row[title="${yol}"]`)!;
    expect(satir("/depo/src/a.ts").querySelector(".git-icon")?.className).toBe("git-icon mod");
    expect(satir("/depo/src/lib/b.ts").querySelector(".git-icon")?.className).toBe("git-icon untracked");
    expect(satir("/depo/src/c.ts").querySelector(".open-dot")?.textContent).toBe("açık");
    expect(satir("/depo/src/lib/d.ts").querySelector(".file-meta"), "değişmeyen dosyada meta var").toBe(null);

    // Enter ilk satırı açıyor: değişen dosya, doğru tam yoluyla.
    await act(async () => {
      fireEvent.keyDown(palette(container), { key: "Enter" });
    });
    expect(openFile).toHaveBeenCalledWith("/depo/src/a.ts");
  });

  it("⌥↓ / ⌥↑ ad sekmesinde bölümden bölüme atlıyor", async () => {
    seed("files", "", { recentFiles: ["/depo/c.ts"] });
    useStore.setState({ gitInfo: { "/depo": gitInfo("/depo", [{ path: "a.ts", status: " M" }]) } });
    vi.spyOn(api, "listFiles").mockResolvedValue(["a.ts", "c.ts", "d.ts", "e.ts"]);
    const { container } = render(<FilePalette />);
    await waitFor(() => expect(satirlar(container)).toHaveLength(4));
    const secili = () => container.querySelector(".file-row.on")?.getAttribute("title");
    const bas = (key: string) =>
      act(async () => {
        fireEvent.keyDown(input(container), { key, altKey: true });
      });

    expect(secili()).toBe("/depo/a.ts");
    await bas("ArrowDown");
    expect(secili(), "Son açılanlar'ın ilk satırı değil").toBe("/depo/c.ts");
    await bas("ArrowDown");
    expect(secili(), "Tüm dosyalar'ın ilk satırı değil").toBe("/depo/d.ts");
    await bas("ArrowUp");
    expect(secili()).toBe("/depo/c.ts");
  });

  it("sağdaki sayı: dosya sayısı, sonuç sayısı ve sınıra takılınca 200+", async () => {
    seed("files");
    const kayitlar = Array.from({ length: 250 }, (_, i) => `logs/kayit-${i}.log`);
    vi.spyOn(api, "listFiles").mockResolvedValue([...kayitlar, "README.md"]);
    const { container } = render(<FilePalette />);
    const sayi = () => container.querySelector(".palette-count")?.textContent;

    await waitFor(() => expect(sayi()).toBe("251 dosya"));
    // 250 eşleşme çizilen sınırın (200) üstünde: sayı "en az" diyor.
    await type(container, "kayit");
    expect(sayi()).toBe("200+ sonuç · 251 dosya");
    expect(satirlar(container)).toHaveLength(200);
    await type(container, "readme");
    expect(sayi()).toBe("1 sonuç · 251 dosya");
    await type(container, "zzzq");
    expect(sayi()).toBe("0 sonuç · 251 dosya");
  });
});

describe("ad sekmesi: boş ve sonuçsuz durumlar", () => {
  it("sonuç yoksa nerede ve kaç dosyaya bakıldığını söylüyor; düğme içeriğe geçiyor", async () => {
    seed("files", "zzzq");
    vi.spyOn(api, "listFiles").mockResolvedValue(["a.ts", "b.ts"]);
    vi.spyOn(api, "searchText").mockResolvedValue(HITS);
    const { container } = render(<FilePalette />);
    await waitFor(() =>
      expect(container.querySelector(".palette-empty strong")?.textContent).toBe("“zzzq” adında dosya yok"),
    );
    expect(container.querySelector(".palette-empty")?.textContent).toContain("/depo altındaki 2 dosyaya bakıldı");

    await act(async () => {
      fireEvent.click(container.querySelector(".palette-empty button")!);
    });
    expect(useStore.getState().ui.paletteMode).toBe("text");
  });

  it("dizin bilinmiyorsa bunu söylüyor, 'eşleşen dosya yok' demiyor", async () => {
    // Yeni sekmede kabuk dizinini bildirene kadar cwd yok. Eskiden boş liste
    // çiziliyordu ve palet "Eşleşen dosya yok" diyordu — eşleşme sorulmamıştı
    // bile.
    seed("files", "foo");
    dizin(null);
    const listFiles = vi.spyOn(api, "listFiles").mockResolvedValue(["a.ts"]);
    const searchText = vi.spyOn(api, "searchText").mockResolvedValue(HITS);
    const { container } = render(<FilePalette />);
    expect(container.querySelector(".palette-empty strong")?.textContent).toBe("Dizin bilinmiyor");
    expect(container.textContent).not.toContain("Eşleşen dosya yok");
    expect(container.textContent).not.toContain("adında dosya yok");
    expect(listFiles).not.toHaveBeenCalled();
    expect(container.querySelector(".palette-root"), "bilinmeyen dizin için kök rozeti").toBe(null);

    // İçerik sekmesinde de aynı: aranacak dizin yok.
    await act(async () => {
      fireEvent.keyDown(input(container), { key: "Tab" });
    });
    expect(container.querySelector(".palette-empty strong")?.textContent).toBe("Dizin bilinmiyor");
    expect(searchText).not.toHaveBeenCalled();
  });
});

describe("içerik sekmesi", () => {
  const satir = (line: number) => ({ line, text: "foo", ranges: [[0, 3]] as [number, number][], col: 0, len: 3 });
  const UC_DOSYA: TextSearchResult = {
    ...HITS,
    files: [
      { path: "a.ts", matches: 2, lines: [satir(1), satir(2)] },
      { path: "b.ts", matches: 2, lines: [satir(3), satir(4)] },
      { path: "c.ts", matches: 1, lines: [satir(5)] },
    ],
    matches: 5,
    lines: 5,
  };

  it("⌥↓ / ⌥↑ sonraki / önceki dosyanın ilk satırına atlıyor", async () => {
    seed("text", "foo");
    vi.spyOn(api, "searchText").mockResolvedValue(UC_DOSYA);
    const { container } = render(<FilePalette />);
    await waitFor(() => expect(container.querySelectorAll(".hit-line")).toHaveLength(5));
    const secili = () => container.querySelector(".hit-line.on .hit-no")?.textContent;
    const bas = (key: string, altKey = false) =>
      act(async () => {
        fireEvent.keyDown(input(container), { key, altKey });
      });

    expect(secili()).toBe("1");
    await bas("ArrowDown", true);
    expect(secili(), "b.ts'in ilk satırı değil").toBe("3");
    await bas("ArrowDown", true);
    expect(secili()).toBe("5");
    // Uçlarda başa dönüyor — oklar da öyle.
    await bas("ArrowDown", true);
    expect(secili()).toBe("1");
    // Dosyanın ortasından ⌥↑ bir ÖNCEKİ dosyaya (burada sondan dönerek c.ts).
    await bas("ArrowDown");
    expect(secili()).toBe("2");
    await bas("ArrowUp", true);
    expect(secili()).toBe("5");
    await bas("ArrowUp", true);
    expect(secili()).toBe("3");

    // Seçili satır kutunun `aria-activedescendant`ı.
    const aktif = input(container).getAttribute("aria-activedescendant")!;
    expect(document.getElementById(aktif)).toBe(container.querySelector(".hit-line.on"));
  });

  it("boş sorguda boş bir şerit yerine kısa bir yönlendirme var", () => {
    seed("text", "");
    const searchText = vi.spyOn(api, "searchText").mockResolvedValue(HITS);
    const { container } = render(<FilePalette />);
    const bos = container.querySelector(".palette-empty")!;
    expect(bos.querySelector("strong")?.textContent).toBe("Aranacak metni yazın");
    expect(bos.textContent).toContain("/depo altındaki dosyaların içinde aranır");
    // Dosyalar arası atlama da burada söyleniyor; alt şeritte yer yok.
    expect(bos.textContent).toContain("Alt+↑");
    expect(container.querySelector(".palette-status"), "boş durum satırı çiziliyor").toBe(null);
    expect(searchText).not.toHaveBeenCalled();
  });

  it("eşleşme yoksa açık seçeneği kapatmayı öneriyor", async () => {
    seed("text", "Foo", { searchFlags: { caseSensitive: true, wholeWord: false, regex: false } });
    vi.spyOn(api, "searchText").mockResolvedValue({ ...HITS, files: [], matches: 0, lines: 0, searched: 12 });
    const { container } = render(<FilePalette />);
    await waitFor(() =>
      expect(container.querySelector(".palette-empty strong")?.textContent).toBe("“Foo” hiçbir dosyada geçmiyor"),
    );
    const bos = container.querySelector(".palette-empty")!;
    expect(bos.textContent).toContain("/depo altındaki 12 dosyaya bakıldı");
    const dugmeler = [...bos.querySelectorAll("button")];
    expect(dugmeler.map((b) => b.textContent)).toEqual(["Büyük/küçük harfi önemseme", "TabDosya adlarında ara"]);

    await act(async () => {
      fireEvent.click(dugmeler[0]);
    });
    expect(useStore.getState().ui.searchFlags.caseSensitive).toBe(false);
  });
});

describe("şerit, alt şerit ve erişilebilirlik", () => {
  it.each([
    { platform: "windows" as const, tuslar: ["Enter", "Shift+Enter", "Tab", "Esc"] },
    { platform: "macos" as const, tuslar: ["↩", "⇧↩", "⇥", "Esc"] },
  ])("alt şerit tuşları rozet olarak, platformun yazımıyla ($platform)", ({ platform, tuslar }) => {
    setPlatform(platform);
    seed("files");
    vi.spyOn(api, "listFiles").mockResolvedValue([]);
    const { container } = render(<FilePalette />);
    const foot = container.querySelector(".palette-foot")!;
    expect([...foot.querySelectorAll(".keycap-word")].map((k) => k.textContent)).toEqual(tuslar);
    expect(foot.querySelectorAll(".keycap svg"), "ok rozetleri").toHaveLength(2);
    expect(foot.textContent).toContain("içerikte ara");
    expect(foot.textContent).toContain("kapat");
  });

  it("sekmeler kendi kısayolunu ayardan, kök rozeti aranan dizini gösteriyor", () => {
    setPlatform("macos");
    seed("files");
    dizin("/Users/ali/Work/NTerminal");
    useStore.setState({
      settings: {
        ...useStore.getState().settings,
        keybindings: { filePalette: "Cmd+P", textSearch: "Cmd+Shift+F" },
      },
    });
    vi.spyOn(api, "listFiles").mockResolvedValue([]);
    const { container } = render(<FilePalette />);
    expect([...container.querySelectorAll('[role="tab"] .keycap')].map((k) => k.textContent)).toEqual([
      "⌘P",
      "⇧⌘F",
    ]);
    const kok = container.querySelector(".palette-root")!;
    expect(kok.textContent).toBe("…/Work/NTerminal");
    expect(kok.getAttribute("title")).toBe("Aranan dizin: /Users/ali/Work/NTerminal");
  });

  it("kutu, liste ve sekmeler birbirine bağlı (combobox, listbox, tabpanel)", async () => {
    seed("files", "a");
    vi.spyOn(api, "listFiles").mockResolvedValue(["a.ts", "b/a.md"]);
    const { container } = render(<FilePalette />);
    await waitFor(() => expect(container.querySelectorAll('[role="option"]')).toHaveLength(2));

    const kutu = input(container);
    expect(kutu.getAttribute("role")).toBe("combobox");
    expect(kutu.getAttribute("aria-label")).toBe("Dosya ara");
    const liste = container.querySelector('[role="listbox"]')!;
    expect(kutu.getAttribute("aria-controls")).toBe(liste.id);

    // Odak kutuda kalıyor; seçili satırı `aria-activedescendant` gösteriyor.
    const secili = () => document.getElementById(kutu.getAttribute("aria-activedescendant")!);
    expect(secili()).toBe(container.querySelector(".file-row.on"));
    expect(secili()?.getAttribute("aria-selected")).toBe("true");
    await act(async () => {
      fireEvent.keyDown(kutu, { key: "ArrowDown" });
    });
    expect(secili()?.getAttribute("title")).toBe("/depo/b/a.md");
    expect(document.activeElement).toBe(kutu);

    // Etkin sekme ile panel karşılıklı.
    const panel = container.querySelector('[role="tabpanel"]')!;
    const etkin = container.querySelector('[role="tab"][aria-selected="true"]')!;
    expect(etkin.getAttribute("aria-controls")).toBe(panel.id);
    expect(panel.getAttribute("aria-labelledby")).toBe(etkin.id);
    expect(panel.contains(liste)).toBe(true);
  });
});
