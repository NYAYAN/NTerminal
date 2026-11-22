// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { openViewerFind, viewerFindAvailable } from "../lib/fileFind";
import { escapeOwnedBy } from "../lib/focus";
import { setLanguage } from "../lib/i18n";
import { api } from "../lib/ipc";
import { setPlatform } from "../lib/platform";
import { DEFAULT_FLAGS } from "../lib/textSearch";
import { sessions, useStore } from "../store/useStore";
import type { TerminalSession } from "../terminal/TerminalSession";
import type { FileText, Group, SearchFlags, TabState } from "../types";
import { FilePanel } from "./FilePanel";
import { FileViewer } from "./FileViewer";

/*
 * Açık dosyada arama.
 *
 * BİLDİRİLEN: "bir dosya açıkken arama için Cmd+F yapınca gidip terminalden
 * search ediyor, dosyadan değil." Görüntüleyicinin kendi araması yoktu; kısayol
 * paneli kapatıp terminalde arıyordu. Artık kısayol görüntüleyicinin çubuğunu
 * açıyor: bütün eşleşmeler işaretli, Enter / Shift+Enter aralarında geziyor.
 */

const PATH = "/depo/src/a.ts";
const TEXT = "foo bar\nbar Foo foo\nbaz\n";

function file(text: string): FileText {
  return { text, binary: false, truncated: false, size: text.length };
}

let disk: FileText = file(TEXT);

beforeEach(() => {
  setLanguage("tr");
  setPlatform("windows");
  disk = file(TEXT);
  vi.spyOn(api, "readTextFile").mockImplementation(async () => disk);
  const state = useStore.getState();
  useStore.setState({
    settings: { ...state.settings, keybindings: { findInTerminal: "Ctrl+Shift+F" } },
    ui: { ...state.ui, searchFlags: DEFAULT_FLAGS },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function settle() {
  for (let i = 0; i < 3; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

const bar = (c: HTMLElement) => c.querySelector<HTMLElement>(".viewer-find");
const input = (c: HTMLElement) => c.querySelector<HTMLInputElement>(".viewer-find input")!;
const count = (c: HTMLElement) => c.querySelector(".viewer-find .count")?.textContent;
const hits = (c: HTMLElement) => [...c.querySelectorAll(".viewer-find-hit")];
/** Etkin eşleşmenin satırı (1'den) ve metni: "2:Foo". */
function activeHit(c: HTMLElement): string | null {
  const mark = c.querySelector(".viewer-find-hit.on");
  if (!mark) return null;
  const row = mark.closest(".viewer-line");
  return `${row?.querySelector(".viewer-no")?.textContent}:${mark.textContent}`;
}
const editor = (c: HTMLElement) => c.querySelector<HTMLTextAreaElement>(".viewer-editor")!;
const tool = (c: HTMLElement, name: string) => c.querySelector<HTMLButtonElement>(`button[data-tool="${name}"]`)!;

async function search(c: HTMLElement, query: string) {
  fireEvent.change(input(c), { target: { value: query } });
  await settle();
}

async function press(target: Element, init: KeyboardEventInit) {
  fireEvent.keyDown(target, init);
  await settle();
}

function setFlags(more: Partial<SearchFlags>) {
  const state = useStore.getState();
  useStore.setState({ ui: { ...state.ui, searchFlags: { ...DEFAULT_FLAGS, ...more } } });
}

describe("aramayı açmak", () => {
  it("görüntüleyicide arama kısayolu ve Windows'ta Ctrl+F çubuğu açıyor; kutu odakta", async () => {
    const { container } = render(<FileViewer path={PATH} />);
    await settle();
    expect(bar(container)).toBe(null);

    await press(container.querySelector(".viewer-body")!, { key: "F", code: "KeyF", ctrlKey: true, shiftKey: true });
    expect(bar(container)).not.toBe(null);
    expect(document.activeElement).toBe(input(container));

    fireEvent.click(container.querySelector(".viewer-find button[title='Kapat (Esc)']")!);
    await settle();
    expect(bar(container)).toBe(null);

    // Görüntüleyicinin içindeyken platformun kendi "bul" tuşu da.
    await press(container.querySelector(".viewer-body")!, { key: "f", code: "KeyF", ctrlKey: true });
    expect(bar(container)).not.toBe(null);
  });

  it("genel kısayol dinleyicisi (App.tsx) görüntüleyicinin kaydından açıyor; kayıt dosyayla gidiyor", async () => {
    const { container, unmount } = render(<FileViewer path={PATH} />);
    await settle();
    expect(viewerFindAvailable()).toBe(true);
    await act(async () => openViewerFind());
    await settle();
    expect(bar(container)).not.toBe(null);
    expect(document.activeElement).toBe(input(container));
    unmount();
    expect(viewerFindAvailable(), "kapanan görüntüleyici hâlâ kayıtlı").toBe(false);
  });
});

describe("eşleşmeler ve gezinme", () => {
  it("bütün eşleşmeler işaretli; Enter / Shift+Enter / F3 geziyor ve başa dönüyor", async () => {
    const { container } = render(<FileViewer path={PATH} />);
    await settle();
    await act(async () => openViewerFind());
    await search(container, "foo");

    // Büyük/küçük harf varsayılan olarak gözetilmiyor: "Foo" da eşleşiyor.
    expect(hits(container).map((m) => m.textContent)).toEqual(["foo", "Foo", "foo"]);
    expect(count(container)).toBe("1/3");
    expect(activeHit(container)).toBe("1:foo");

    await press(input(container), { key: "Enter" });
    expect(count(container)).toBe("2/3");
    expect(activeHit(container)).toBe("2:Foo");
    await press(input(container), { key: "F3" });
    expect(count(container)).toBe("3/3");
    await press(input(container), { key: "Enter" });
    expect(count(container), "sondan başa dönmedi").toBe("1/3");
    await press(input(container), { key: "Enter", shiftKey: true });
    expect(count(container), "baştan sona dönmedi").toBe("3/3");

    // Düğmeler de.
    fireEvent.click(container.querySelector(".viewer-find button[title='Önceki (Shift+Enter)']")!);
    await settle();
    expect(count(container)).toBe("2/3");
    fireEvent.click(container.querySelector(".viewer-find button[title='Sonraki (Enter)']")!);
    await settle();
    expect(count(container)).toBe("3/3");
  });

  it("tek eşleşmede Enter onu yeniden seçiyor (düzenlerken imleç taşındıysa)", async () => {
    vi.spyOn(api, "writeTextFile").mockResolvedValue(undefined);
    disk = file("bir\niki\n");
    const { container } = render(<FileViewer path={PATH} />);
    await settle();
    fireEvent.click(tool(container, "edit"));
    await settle();
    await act(async () => openViewerFind());
    await search(container, "iki");
    const area = editor(container);
    expect([area.selectionStart, area.selectionEnd]).toEqual([4, 7]);
    area.setSelectionRange(0, 0);
    await press(input(container), { key: "Enter" });
    expect(count(container)).toBe("1/1");
    expect([area.selectionStart, area.selectionEnd], "aynı eşleşme yeniden seçilmedi").toEqual([4, 7]);
  });

  it("yazdıkça daralan aramada etkin eşleşme yerinde kalıyor", async () => {
    // "fo" yazarken ikinci satırdaysanız "foo"ya geçince dosyanın başına
    // sıçramamalı.
    const { container } = render(<FileViewer path={PATH} />);
    await settle();
    await act(async () => openViewerFind());
    await search(container, "fo");
    await press(input(container), { key: "Enter" });
    expect(activeHit(container)).toBe("2:Fo");
    await search(container, "foo");
    expect(activeHit(container)).toBe("2:Foo");
  });

  it("eşleşme yoksa 0/0 ve uyarı rengi; bozuk düzenli ifadede '!' ve nedeni", async () => {
    const { container } = render(<FileViewer path={PATH} />);
    await settle();
    await act(async () => openViewerFind());
    await search(container, "yok");
    expect(count(container)).toBe("0/0");
    expect(bar(container)!.className).toContain("none");
    expect(hits(container)).toHaveLength(0);

    setFlags({ regex: true });
    await search(container, "a(");
    expect(count(container)).toBe("!");
    expect(input(container).title).toMatch(/^Geçersiz düzenli ifade: /);
    expect(input(container).getAttribute("aria-invalid")).toBe("true");
    expect(container.querySelector(".viewer-find .search-field.bad")).not.toBe(null);
  });

  it("seçenekler içerik aramasıyla paylaşılıyor: Aa açılınca büyük/küçük harf gözetiliyor", async () => {
    const { container } = render(<FileViewer path={PATH} />);
    await settle();
    await act(async () => openViewerFind());
    await search(container, "Foo");
    expect(count(container)).toBe("1/3");
    fireEvent.click(container.querySelector(".viewer-find [data-flag='caseSensitive']")!);
    await settle();
    expect(useStore.getState().ui.searchFlags.caseSensitive).toBe(true);
    expect(hits(container).map((m) => m.textContent)).toEqual(["Foo"]);
    expect(count(container)).toBe("1/1");
  });

  it("içerik aramasından gelinen işaret, arama eşleşmesi varken çizilmiyor", async () => {
    const reveal = { line: 3, col: 0, len: 3, seq: 1 };
    const { container } = render(<FileViewer path={PATH} reveal={reveal} />);
    await settle();
    expect(container.querySelector(".viewer-mark")).not.toBe(null);
    await act(async () => openViewerFind());
    await search(container, "foo");
    expect(container.querySelector(".viewer-mark"), "iki ayrı sarı işaret").toBe(null);
    expect(hits(container)).toHaveLength(3);
    // Eşleşme kalmayınca geri geliyor.
    await search(container, "yok");
    expect(container.querySelector(".viewer-mark")).not.toBe(null);
  });
});

describe("kapatmak", () => {
  it("Esc çubuğu kapatıyor, işaretler gidiyor; Esc dışarı sızmıyor", async () => {
    // Dışarıdaki dinleyici dosya panelinin Esc'si: çubuk kapanırken panel de
    // kapanırdı. Uygulamanın genel dinleyicisi de (önce koşuyor) Esc'yi
    // çubuğa bırakmalı (`data-owns-escape`).
    const outside = vi.fn();
    const { container } = render(
      <div onKeyDown={(e) => e.key === "Escape" && outside()}>
        <FileViewer path={PATH} />
      </div>,
    );
    await settle();
    await act(async () => openViewerFind());
    await search(container, "foo");
    expect(escapeOwnedBy(input(container))).toBe(true);

    await press(input(container), { key: "Escape" });
    expect(bar(container)).toBe(null);
    expect(hits(container)).toHaveLength(0);
    expect(outside).not.toHaveBeenCalled();
  });

  it("açılmadan önceki odağa dönüyor; yeniden açınca son aranan seçili duruyor", async () => {
    const { container } = render(
      <>
        <button type="button" id="once">önce</button>
        <FileViewer path={PATH} />
      </>,
    );
    await settle();
    const before = container.querySelector<HTMLButtonElement>("#once")!;
    before.focus();
    await act(async () => openViewerFind());
    await search(container, "bar");
    await press(input(container), { key: "Escape" });
    expect(document.activeElement).toBe(before);

    await act(async () => openViewerFind());
    await settle();
    expect(input(container).value).toBe("bar");
    expect([input(container).selectionStart, input(container).selectionEnd]).toEqual([0, 3]);
    expect(count(container)).toBe("1/2");
  });

  it("başka bir dosyada arama açılınca kutuda son aranan duruyor", async () => {
    const { container, rerender } = render(<FileViewer key="a" path={PATH} />);
    await settle();
    await act(async () => openViewerFind());
    await search(container, "baz");
    disk = file("baz qux baz\n");
    rerender(<FileViewer key="b" path="/depo/b.ts" />);
    await settle();
    expect(bar(container), "yeni dosyada arama kendiliğinden açıldı").toBe(null);
    await act(async () => openViewerFind());
    await settle();
    expect(input(container).value).toBe("baz");
    expect(count(container)).toBe("1/2");
  });
});

describe("seçili metin", () => {
  it("okurken seçilen metin kutuya geliyor ve etkin eşleşme o oluyor", async () => {
    const { container } = render(<FileViewer path={PATH} />);
    await settle();
    // İkinci satırın SON "foo"su seçili.
    const cell = container.querySelectorAll(".viewer-text")[1];
    const text = cell.firstChild!;
    expect(text.textContent).toBe("bar Foo foo");
    const range = document.createRange();
    range.setStart(text, 8);
    range.setEnd(text, 11);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);

    await act(async () => openViewerFind());
    await settle();
    expect(input(container).value).toBe("foo");
    expect(count(container)).toBe("3/3");
    window.getSelection()!.removeAllRanges();
  });

  it("düzenli ifade kipinde seçim harfi harfine aranıyor", async () => {
    disk = file("a.b axb\n");
    setFlags({ regex: true });
    const { container } = render(<FileViewer path={PATH} />);
    await settle();
    const text = container.querySelector(".viewer-text")!.firstChild!;
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 3);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    await act(async () => openViewerFind());
    await settle();
    expect(input(container).value).toBe("a\\.b");
    expect(count(container), "a.b axb'yi de buldu").toBe("1/1");
    window.getSelection()!.removeAllRanges();
  });

  it("birden çok satıra yayılan seçim kutuya gelmiyor", async () => {
    const { container } = render(<FileViewer path={PATH} />);
    await settle();
    await act(async () => openViewerFind());
    await search(container, "baz");
    await press(input(container), { key: "Escape" });
    const cells = container.querySelectorAll(".viewer-text");
    const range = document.createRange();
    range.setStart(cells[0].firstChild!, 0);
    range.setEnd(cells[1].firstChild!, 3);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    await act(async () => openViewerFind());
    await settle();
    expect(input(container).value).toBe("baz");
    window.getSelection()!.removeAllRanges();
  });
});

describe("düzenlerken", () => {
  it("seçili metin kutuya geliyor; etkin eşleşme yazı alanında SEÇİLİYOR; Esc'de odak yazı alanında", async () => {
    vi.spyOn(api, "writeTextFile").mockResolvedValue(undefined);
    disk = file("bir\niki bir\n");
    const { container } = render(<FileViewer path={PATH} />);
    await settle();
    fireEvent.click(tool(container, "edit"));
    await settle();
    const area = editor(container);
    // İkinci satırdaki "bir" seçili; Ctrl+F yazı alanında (genel dinleyici metin
    // kutusunda kısayolu bırakıyor, görüntüleyici karşılıyor).
    area.setSelectionRange(8, 11);
    await press(area, { key: "f", code: "KeyF", ctrlKey: true });
    expect(input(container).value).toBe("bir");
    expect(count(container)).toBe("2/2");
    expect([area.selectionStart, area.selectionEnd]).toEqual([8, 11]);

    // İşaretler yazı alanının altındaki katmanda, kendi satırlarında.
    const rows = [...container.querySelectorAll<HTMLElement>(".viewer-find-layer .viewer-find-row")];
    expect(rows.map((r) => r.style.getPropertyValue("--row"))).toEqual(["0", "1"]);
    expect(container.querySelector(".viewer-find-layer .viewer-find-hit.on")?.textContent).toBe("bir");

    await press(input(container), { key: "Enter" });
    expect(count(container)).toBe("1/2");
    expect([area.selectionStart, area.selectionEnd], "etkin eşleşme seçilmedi").toEqual([0, 3]);

    await press(input(container), { key: "Escape" });
    expect(document.activeElement).toBe(area);
    expect([area.selectionStart, area.selectionEnd]).toEqual([0, 3]);
  });

  it("mac'te yazı alanında ⌘F aramayı açıyor (genel dinleyici metin kutusunda kısayolu bırakıyor)", async () => {
    setPlatform("macos");
    const state = useStore.getState();
    useStore.setState({ settings: { ...state.settings, keybindings: { findInTerminal: "Cmd+F" } } });
    vi.spyOn(api, "writeTextFile").mockResolvedValue(undefined);
    const { container } = render(<FileViewer path={PATH} />);
    await settle();
    fireEvent.click(tool(container, "edit"));
    await settle();
    await press(editor(container), { key: "f", code: "KeyF", metaKey: true });
    expect(bar(container)).not.toBe(null);
    expect(document.activeElement).toBe(input(container));
    // mac'te ⌘G sonraki, ⇧⌘G önceki.
    await search(container, "foo");
    expect(count(container)).toBe("1/3");
    await press(input(container), { key: "g", code: "KeyG", metaKey: true });
    expect(count(container)).toBe("2/3");
    await press(input(container), { key: "G", code: "KeyG", metaKey: true, shiftKey: true });
    expect(count(container)).toBe("1/3");
  });

  it("yazarken işaretler güncelleniyor ama seçim ve imleç yerinde kalıyor", async () => {
    vi.spyOn(api, "writeTextFile").mockResolvedValue(undefined);
    disk = file("bir\niki\n");
    const { container } = render(<FileViewer path={PATH} />);
    await settle();
    fireEvent.click(tool(container, "edit"));
    await settle();
    await act(async () => openViewerFind());
    await search(container, "bir");
    expect(container.querySelectorAll(".viewer-find-layer .viewer-find-hit")).toHaveLength(1);

    const area = editor(container);
    area.focus();
    area.setSelectionRange(4, 4);
    fireEvent.input(area, { target: { value: "bir\nbir iki\n" } });
    await settle();
    expect(container.querySelectorAll(".viewer-find-layer .viewer-find-hit")).toHaveLength(2);
    expect(count(container)).toBe("1/2");
    expect(document.activeElement, "yazarken odak çubuğa kaçtı").toBe(area);
  });
});

/*
 * Dosya panelinin içinde: Esc çubuğu kapatıyor, paneli değil; ikinci Esc
 * paneli kapatıyor (katman katman, bkz. `FilePanel`). Görsel açıkken
 * görüntüleyici kaydolmuyor — kısayol orada eskisi gibi terminalde arıyor.
 */
describe("dosya panelinde", () => {
  const tab: TabState = {
    id: "t1",
    title: "t1",
    customTitle: null,
    profileId: "p1",
    cwd: "/depo",
    createdAt: 0,
    lastActiveAt: 0,
    hasScrollback: false,
    lastCommand: null,
    locked: false,
  };
  const group: Group = {
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
    tabs: [tab],
  };

  function seed(viewerPath: string) {
    const state = useStore.getState();
    useStore.setState({
      ready: true,
      groups: [group],
      activeGroupId: "g1",
      ui: { ...state.ui, treeOpen: true, viewerPath, viewerReveal: null, treeExpanded: [], searchFlags: DEFAULT_FLAGS },
    });
  }

  beforeEach(() => {
    vi.spyOn(api, "listEntries").mockResolvedValue([]);
    sessions.set("t1", { focus: vi.fn(), cwd: "/depo" } as unknown as TerminalSession);
  });

  afterEach(() => {
    sessions.clear();
    const state = useStore.getState();
    useStore.setState({ ui: { ...state.ui, treeOpen: false, viewerPath: null } });
  });

  it("çubuğun Esc'si paneli kapatmıyor; ikinci Esc kapatıyor", async () => {
    seed(PATH);
    const { container } = render(<FilePanel />);
    await settle();
    await act(async () => openViewerFind());
    await settle();
    await press(input(container), { key: "Escape" });
    expect(bar(container)).toBe(null);
    expect(useStore.getState().ui.treeOpen, "çubukla birlikte panel de kapandı").toBe(true);
  });

  it("görsel açıkken görüntüleyici kaydolmuyor", async () => {
    seed("/depo/logo.png");
    vi.spyOn(api, "readImageFile").mockResolvedValue({ mime: "image/png", data: "" } as never);
    render(<FilePanel />);
    await settle();
    expect(viewerFindAvailable()).toBe(false);
  });
});
