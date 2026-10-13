// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    setTitle: async () => {},
    close: async () => {},
    onCloseRequested: async () => () => {},
  }),
}));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => {}) }));

import { setLanguage } from "../lib/i18n";
import { api } from "../lib/ipc";
import { setPlatform } from "../lib/platform";
import { setSyntaxHost, type SyntaxHost } from "../lib/syntax";
import { createSyntaxService, type SyntaxReply } from "../lib/syntaxService";
import type { Bootstrap, DiffSides, FileText, GitInfo, Settings } from "../types";
import { DiffWindow } from "./DiffWindow";

/*
 * Fark penceresinde sözdizimi renklendirmesi.
 *
 * İSTEK: "fark penceresine de renklendirmeyi ekle." İki taraf iki ayrı belge
 * (eski sürüm, güncel); değişen sözcüğün zemini (`dw-frag`) renkli harflerin
 * ALTINDA kalmalı — biri öbürünü silerse ya fark ya renk kaybolur. Düzenlerken
 * harfleri renkli satırlar çiziyor, yazı alanı saydam (`.syntax`).
 *
 * Kurulum `diffWindow.test.tsx`inkiyle aynı; renklendirici süreç içinde.
 */

const ROOT = "/depo";

function text(t: string): FileText {
  return { text: t, binary: false, truncated: false, size: t.length };
}

const SIDES: Record<string, DiffSides> = {
  "a.ts": {
    base: text('const ad = "x";\nexport function f() {}\n'),
    current: text('const isim = "x";\nexport function f() {}\n'),
    head: "1a2b3c4d",
  },
  "yeni.ts": { base: null, current: text("let x = 1;\n"), head: "1a2b3c4d" },
  "notlar.txt": { base: text("const a\n"), current: text("const b\n"), head: "1a2b3c4d" },
};

function info(): GitInfo {
  return {
    branch: "main",
    detached: false,
    ahead: 0,
    behind: 0,
    upstream: "origin/main",
    unborn: false,
    staged: 0,
    stashCount: 0,
    root: ROOT,
    changes: Object.keys(SIDES).map((path) => ({ status: SIDES[path].base ? " M" : "??", path })),
  };
}

function boot(): Bootstrap {
  return {
    settings: {
      language: "tr",
      appearance: { theme: "nterminal-dark", fontSize: 14, uiFontFamily: "", uiFontSize: 13 },
    } as unknown as Settings,
    workspace: { version: 1, activeGroupId: "", groups: [], savedAt: 0 },
    paths: {} as Bootstrap["paths"],
    appVersion: "0.0.0",
    restored: false,
    windowsBuild: 0,
    platform: "windows",
    fileManager: "Gezgin",
    fileManagerEn: "Explorer",
  } as Bootstrap;
}

function inProcessHost(): SyntaxHost {
  let receive: (reply: SyntaxReply) => void = () => {};
  const handle = createSyntaxService((reply) => setTimeout(() => receive(structuredClone(reply)), 0));
  return { post: (request) => handle(structuredClone(request)), listen: (fn) => (receive = fn) };
}

beforeEach(() => {
  setLanguage("tr");
  setPlatform("windows");
  try {
    window.localStorage.clear();
  } catch {
    // jsdom'da depo her zaman var.
  }
  setSyntaxHost(inProcessHost());
  vi.spyOn(api, "bootstrap").mockResolvedValue(boot());
  vi.spyOn(api, "gitInfo").mockImplementation(async () => info());
  vi.spyOn(api, "gitDiffSides").mockImplementation(async (_root, file) => SIDES[file]);
  vi.spyOn(api, "gitFingerprint").mockResolvedValue("imza");
  vi.spyOn(api, "readTextFile").mockImplementation(async (full) => SIDES[full.slice(ROOT.length + 1)]?.current ?? null);
  vi.spyOn(api, "diffWindowReady").mockResolvedValue(null);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  setSyntaxHost(undefined);
});

async function until(check: () => unknown, ms = 15_000) {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error("zaman aşımı");
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
  }
}

const left = (c: HTMLElement) => c.querySelector(".dw-pane.mirror")!;
const right = (c: HTMLElement) => c.querySelector(".dw-pane:not(.mirror)")!;
/** Bölme henüz yoksa (yükleniyor) boş liste. */
const spans = (el: Element | null, cls: string) =>
  el ? [...el.querySelectorAll(`.dw-line .syn-${cls}`)].map((e) => e.textContent) : [];

describe("fark penceresinde sözdizimi renkleri", () => {
  it("yan yana: iki taraf kendi belirteçleriyle, değişen sözcüğün zemini renkli harflerin altında", async () => {
    const { container } = render(<DiffWindow target={{ root: ROOT, path: "a.ts" }} />);
    await until(() => spans(left(container), "keyword").length && spans(right(container), "function").length);
    expect(spans(left(container), "keyword")).toContain("const");
    expect(spans(right(container), "keyword")).toEqual(expect.arrayContaining(["const", "function"]));
    expect(spans(right(container), "function")).toContain("f");
    // Değişen sözcük: zemin dışta (`dw-frag`), renk içte.
    const frag = right(container).querySelector(".dw-frag.mod");
    expect(frag?.textContent).toBe("isim");
    expect(frag?.querySelector("[class^='syn-']"), "değişen sözcük renksiz kaldı").not.toBe(null);
    // Satırın metni eksiksiz.
    const firstRight = right(container).querySelector(".dw-line.mod");
    expect(firstRight?.textContent).toBe('const isim = "x";');
  });

  it("birleşik görünüm: eski satır soldakinin, yeni satır sağdakinin belirteçleriyle", async () => {
    window.localStorage.setItem("nterminal.diffWindow", JSON.stringify({ viewer: "unified", ignore: "none", highlight: "words" }));
    const { container } = render(<DiffWindow target={{ root: ROOT, path: "a.ts" }} />);
    await until(() => container.querySelector(".dw-line.del .syn-keyword") && container.querySelector(".dw-line.ins .syn-keyword"));
    expect(container.querySelector(".dw-line.del")?.textContent).toBe('const ad = "x";');
    expect(container.querySelector(".dw-line.ins")?.textContent).toBe('const isim = "x";');
  });

  it("yeni dosyada düzenlerken harfleri renkli satırlar çiziyor, yazı alanı saydam", async () => {
    const { container } = render(<DiffWindow target={{ root: ROOT, path: "yeni.ts" }} />);
    await until(() => container.querySelector(".dw-line .syn-keyword"));
    fireEvent.click(container.querySelector('button[data-tool="edit"]')!);
    await until(() => container.querySelector(".dw-editor"));
    expect(container.querySelector(".dw-pane")?.className).toContain("editable syntax");
    // Yazılan satır renklendiricinin yanıtını beklemeden satırlarda.
    const area = container.querySelector(".dw-editor") as HTMLTextAreaElement;
    fireEvent.input(area, { target: { value: "let xy = 1;\n" } });
    expect(container.querySelector(".dw-line")?.textContent).toBe("let xy = 1;");
    await until(() => spans(container, "keyword").includes("let"));
  });

  it("tanınmayan dosyada renk yok; düzenlerken harfleri yine yazı alanı çiziyor", async () => {
    const { container } = render(<DiffWindow target={{ root: ROOT, path: "notlar.txt" }} />);
    await until(() => container.querySelector(".dw-line.mod"));
    expect(container.querySelector("[class^='syn-']")).toBe(null);
    fireEvent.click(container.querySelector('button[data-tool="edit"]')!);
    await until(() => container.querySelector(".dw-editor"));
    expect(right(container).className).toContain("editable");
    expect(right(container).className).not.toContain("syntax");
  });
});
