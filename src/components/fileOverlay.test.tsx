// @vitest-environment jsdom
import { act, cleanup, configure, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLanguage } from "../lib/i18n";
import { api } from "../lib/ipc";
import { setPlatform } from "../lib/platform";
import { DEFAULT_FLAGS } from "../lib/textSearch";
import { sessions, useStore } from "../store/useStore";
import type { TerminalSession } from "../terminal/TerminalSession";
import type { DirEntry, Group, TabState, TextSearchResult } from "../types";
import { FilePanel } from "./FilePanel";

/*
 * Arama 200 ms bekleyip koşuyor (`SEARCH_DEBOUNCE_MS`). `waitFor`un 1 sn'lik
 * varsayılanı tek başına yetiyor, ama bütün paket paralel koşarken bir kez
 * aşıldı (ölçüldü: mutasyon denetimi sırasında). Bekleme sonucu değil, makinenin
 * yükünü ölçmesin.
 */
configure({ asyncUtilTimeout: 3000 });

/**
 * Dosya paneli terminalin ÜSTÜNDE; dosya seçilince görüntüleyici YANINDA.
 *
 * İSTEK: "klasörleri göster'e basınca açılıyor ve terminali sıkıştırıyor;
 * üstüne açılacak şekilde yapalım. Bir dosyayı da seçersem yanına full width
 * olarak açılsın." Izgara/CSS tarafı `titlebar.test.tsx`te; burada panelin
 * kendi davranışı: neyin nerede açıldığı, neyin neyi kapattığı ve kapanınca
 * odağın nereye döndüğü.
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

const AGAC: Record<string, DirEntry[]> = {
  [CWD]: [
    { name: "src", dir: true },
    { name: "README.md", dir: false },
  ],
  [`${CWD}/src`]: [{ name: "a.ts", dir: false }],
};

const GERCEK = {
  openFile: useStore.getState().openFile,
  insertPath: useStore.getState().insertPath,
};

function seed(ui: Partial<ReturnType<typeof useStore.getState>["ui"]> = {}) {
  const state = useStore.getState();
  useStore.setState({
    ...GERCEK,
    ready: true,
    groups: [group()],
    activeGroupId: "g1",
    ui: {
      ...state.ui,
      treeOpen: true,
      viewerPath: null,
      viewerReveal: null,
      treeExpanded: [],
      searchFlags: DEFAULT_FLAGS,
      ...ui,
    },
  });
}

function satir(container: HTMLElement, ad: string): HTMLElement | undefined {
  return [...container.querySelectorAll<HTMLElement>(".tree-row")].find((el) => el.textContent?.trim() === ad);
}

const buyutec = (c: HTMLElement) =>
  [...c.querySelectorAll<HTMLButtonElement>(".file-panel-head button")].find(
    (b) => b.title === "Dosyalarda ara" || b.title === "Aramayı kapat",
  )!;

let focusTerminal: ReturnType<typeof vi.fn>;

beforeEach(() => {
  setLanguage("tr");
  setPlatform("windows");
  vi.spyOn(api, "listEntries").mockImplementation(async (p: string) => AGAC[p] ?? []);
  vi.spyOn(api, "readTextFile").mockResolvedValue({ text: "bir\niki foo\nüç\n", binary: false, truncated: false, size: 16 });
  focusTerminal = vi.fn();
  sessions.set("t1", { focus: focusTerminal, cwd: CWD } as unknown as TerminalSession);
});

afterEach(() => {
  cleanup();
  sessions.clear();
  vi.restoreAllMocks();
});

describe("görüntüleyici ağacın yanında", () => {
  it("dosya seçilince ayrı bölmede, ağaç yerinde açılıyor", async () => {
    seed();
    const { container } = render(<FilePanel />);
    await waitFor(() => expect(satir(container, "README.md")).not.toBe(undefined));
    expect(container.querySelector(".files-overlay.with-viewer"), "dosya yokken görüntüleyici bölmesi var").toBe(null);

    await act(async () => {
      fireEvent.click(satir(container, "README.md")!);
    });
    expect(container.querySelector(".files-overlay.with-viewer")).not.toBe(null);
    expect(container.querySelector(".file-viewer-pane .viewer"), "görüntüleyici yanda değil").not.toBe(null);
    expect(container.querySelector(".file-panel .viewer"), "görüntüleyici sütunun içinde").toBe(null);
    expect(satir(container, "README.md"), "ağaç gitti").not.toBe(undefined);
  });

  it("başka dosyaya tıklamak görüntüleyiciyi değiştiriyor; geri-ileri yok", async () => {
    seed({ treeExpanded: [`${CWD}/src`] });
    const { container } = render(<FilePanel />);
    await waitFor(() => expect(satir(container, "a.ts")).not.toBe(undefined));
    await act(async () => {
      fireEvent.click(satir(container, "README.md")!);
    });
    await act(async () => {
      fireEvent.click(satir(container, "a.ts")!);
    });
    expect(useStore.getState().ui.viewerPath).toBe(`${CWD}/src/a.ts`);
    expect(container.querySelector(".viewer-name")?.textContent).toBe("a.ts");
    // Başlıkta ağacın köküne göre klasör.
    expect(container.querySelector(".viewer-dir")?.textContent).toBe("src");
    expect(container.querySelector(".viewer-back"), "eski geri düğmesi duruyor").toBe(null);
  });

  it("görüntüleyicinin × düğmesi yalnızca DOSYAYI kapatıyor", async () => {
    seed({ viewerPath: `${CWD}/README.md` });
    const { container } = render(<FilePanel />);
    await waitFor(() => expect(container.querySelector(".viewer-close")).not.toBe(null));
    await act(async () => {
      fireEvent.click(container.querySelector(".viewer-close")!);
    });
    expect(useStore.getState().ui.viewerPath).toBe(null);
    expect(useStore.getState().ui.treeOpen, "panel de kapandı").toBe(true);
    expect(container.querySelector(".file-viewer-pane")).toBe(null);
  });

  it("panelin × düğmesi dosyayla birlikte paneli kapatıyor", async () => {
    seed({ viewerPath: `${CWD}/README.md` });
    const { container } = render(<FilePanel />);
    const close = [...container.querySelectorAll<HTMLButtonElement>(".file-panel-head button")].find(
      (b) => b.title === "Dosya ağacını kapat",
    )!;
    await act(async () => {
      fireEvent.click(close);
    });
    expect(useStore.getState().ui.treeOpen).toBe(false);
  });
});

describe("Esc ve odak", () => {
  it("panelin içindeyken Esc paneli kapatıyor, odak terminale dönüyor", async () => {
    // Sökülen bir düğmede kalan odak `body`ye düşüyor ve yazılan hiçbir yere
    // gitmiyordu; panel kapanınca çalışılan yere dönülmeli.
    seed();
    const { container } = render(<FilePanel />);
    await waitFor(() => expect(satir(container, "README.md")).not.toBe(undefined));
    satir(container, "README.md")!.focus();
    await act(async () => {
      fireEvent.keyDown(satir(container, "README.md")!, { key: "Escape" });
    });
    expect(useStore.getState().ui.treeOpen).toBe(false);
    expect(focusTerminal, "odak terminale dönmedi").toHaveBeenCalled();
  });

  it("odak panelde değilse Esc ile kapanırken odağa dokunmuyor", async () => {
    seed();
    const { container } = render(<FilePanel />);
    const close = [...container.querySelectorAll<HTMLButtonElement>(".file-panel-head button")].find(
      (b) => b.title === "Dosya ağacını kapat",
    )!;
    // Fareyle × — odak paneldeki düğmede değil (jsdom tıklamada odaklamıyor).
    await act(async () => {
      fireEvent.click(close);
    });
    expect(useStore.getState().ui.treeOpen).toBe(false);
    expect(focusTerminal).not.toHaveBeenCalled();
  });

  it("düzenleme yazı alanındaki Esc paneli KAPATMIYOR", async () => {
    // Esc yazı alanının; dosyayı düzenlerken refleksle basılan Esc paneli
    // kapatıp kullanıcıyı terminale atmamalı.
    seed({ viewerPath: `${CWD}/README.md` });
    const { container } = render(<FilePanel />);
    await waitFor(() => expect(container.querySelector('button[data-tool="edit"]:not(:disabled)')).not.toBe(null));
    await act(async () => {
      fireEvent.click(container.querySelector('button[data-tool="edit"]')!);
    });
    const editor = container.querySelector<HTMLTextAreaElement>(".viewer-editor")!;
    expect(editor).not.toBe(null);
    await act(async () => {
      fireEvent.keyDown(editor, { key: "Escape" });
    });
    expect(useStore.getState().ui.treeOpen).toBe(true);
  });

  it("Esc katman katman: önce arama, sonra panel", async () => {
    seed();
    vi.spyOn(api, "listFiles").mockResolvedValue(["src/a.ts"]);
    const { container } = render(<FilePanel />);
    await act(async () => {
      fireEvent.click(buyutec(container));
    });
    await act(async () => {
      fireEvent.change(container.querySelector(".panel-controls input")!, { target: { value: "a" } });
    });
    await waitFor(() => expect(container.querySelector(".file-result")).not.toBe(null));

    // Aşağı ok kutudan sonuçlara iniyor.
    await act(async () => {
      fireEvent.keyDown(container.querySelector(".panel-controls input")!, { key: "ArrowDown" });
    });
    expect(document.activeElement).toBe(container.querySelector(".file-result"));

    // Sonuçtayken Esc aramayı kapatıyor, panel açık; odak büyüteçte.
    await act(async () => {
      fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    });
    expect(container.querySelector(".panel-controls"), "arama kapanmadı").toBe(null);
    expect(useStore.getState().ui.treeOpen).toBe(true);
    expect(document.activeElement).toBe(buyutec(container));

    // İkinci Esc paneli kapatıyor.
    await act(async () => {
      fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    });
    expect(useStore.getState().ui.treeOpen).toBe(false);
  });
});

describe("sütunda içerik araması", () => {
  const HITS: TextSearchResult = {
    files: [
      {
        path: "src/a.ts",
        matches: 2,
        lines: [
          { line: 2, text: "iki foo", ranges: [[4, 7]], col: 4, len: 3 },
          { line: 7, text: "foo", ranges: [[0, 3]], col: 0, len: 3 },
        ],
      },
    ],
    matches: 2,
    lines: 2,
    searched: 3,
    truncated: false,
    filesCapped: false,
    skippedLarge: 0,
    git: false,
    cancelled: false,
  };

  async function icerikAra(container: HTMLElement, query: string) {
    await act(async () => {
      fireEvent.click(buyutec(container));
    });
    const icerik = [...container.querySelectorAll<HTMLButtonElement>('.file-search-box [role="tab"]')].find(
      (b) => b.textContent === "İçerik",
    )!;
    await act(async () => {
      fireEvent.click(icerik);
    });
    await act(async () => {
      fireEvent.change(container.querySelector(".panel-controls input")!, { target: { value: query } });
    });
  }

  it("seçim listeyi KAPATMIYOR; dosya o satırda açılıyor, satır işaretli", async () => {
    // Bu kipin asıl işi: eşleşmeler solda dururken her birine tıklayıp sağda
    // o satırı görmek (VS Code'un arama görünümüyle editörü gibi).
    seed();
    const searchText = vi.spyOn(api, "searchText").mockResolvedValue(HITS);
    const { container } = render(<FilePanel />);
    await icerikAra(container, "foo");
    expect(container.querySelector(".panel-controls input")!.getAttribute("placeholder")).toBe(
      "Dosyaların içinde ara…",
    );
    await waitFor(() => expect(container.querySelectorAll(".hit-line")).toHaveLength(2));
    expect(searchText).toHaveBeenCalledWith(expect.any(Number), CWD, "foo", DEFAULT_FLAGS);

    await act(async () => {
      fireEvent.click(container.querySelectorAll(".hit-line")[1]);
    });
    const ui = useStore.getState().ui;
    expect(ui.viewerPath).toBe(`${CWD}/src/a.ts`);
    expect(ui.viewerReveal).toMatchObject({ line: 7, col: 0, len: 3 });
    expect(container.querySelectorAll(".hit-line"), "liste kapandı").toHaveLength(2);
    expect(container.querySelectorAll(".hit-line")[1].getAttribute("aria-current")).toBe("true");
    // Ağaç gizli kalıyor: sonuçlar onun yerinde.
    expect(container.querySelector(".file-tree-keep")?.getAttribute("data-hidden")).toBe("true");
  });

  it("dosya grupları katlanabiliyor", async () => {
    seed();
    vi.spyOn(api, "searchText").mockResolvedValue(HITS);
    const { container } = render(<FilePanel />);
    await icerikAra(container, "foo");
    await waitFor(() => expect(container.querySelectorAll(".hit-line")).toHaveLength(2));
    const head = container.querySelector<HTMLButtonElement>("button.hit-head")!;
    await act(async () => {
      fireEvent.click(head);
    });
    expect(head.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelectorAll(".hit-line")).toHaveLength(0);
  });
});

describe("openFile", () => {
  it("her gidiş yeni bir sıra alıyor: aynı satıra ikinci tıklama da kaydırıyor", () => {
    seed();
    useStore.getState().openFile(`${CWD}/src/a.ts`, { line: 3, col: 1, len: 2 });
    const first = useStore.getState().ui.viewerReveal!;
    useStore.getState().openFile(`${CWD}/src/a.ts`, { line: 3, col: 1, len: 2 });
    expect(useStore.getState().ui.viewerReveal!.seq).toBeGreaterThan(first.seq);
    // Ağaçtan açılan dosyada gidilecek satır yok.
    useStore.getState().openFile(`${CWD}/README.md`);
    expect(useStore.getState().ui.viewerReveal).toBe(null);
  });

  it("açık dallar zaten açıksa AYNI dizi kalıyor", () => {
    // Yeni bir dizi ağacı boşuna yeniden çizdirirdi.
    seed({ treeExpanded: [`${CWD}/src`] });
    const before = useStore.getState().ui.treeExpanded;
    useStore.getState().openFile(`${CWD}/src/a.ts`);
    expect(useStore.getState().ui.treeExpanded).toBe(before);
  });

  it("kökün dışındaki dosya ağaca dokunmuyor", () => {
    seed();
    useStore.getState().openFile("/baska/yer/x.ts");
    expect(useStore.getState().ui.treeExpanded).toEqual([]);
    expect(useStore.getState().ui.viewerPath).toBe("/baska/yer/x.ts");
  });
});
