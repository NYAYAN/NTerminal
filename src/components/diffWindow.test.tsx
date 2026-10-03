// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  setTitle: vi.fn(async (_title: string) => {}),
  close: vi.fn(async () => {}),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ setTitle: h.setTitle, close: h.close }),
}));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => {}) }));

import { setLanguage } from "../lib/i18n";
import { api } from "../lib/ipc";
import { setPlatform } from "../lib/platform";
import type { Bootstrap, DiffSides, FileText, GitInfo, Settings } from "../types";
import { DiffWindow } from "./DiffWindow";

/**
 * Fark penceresi — Değişiklikler panelindeki "Farkı yeni pencerede göster".
 *
 * İSTEK: "yeni pencerede göster dediğimde IntelliJ / WebStorm'daki gibi yeni
 * bir pencere açılmalı; solda eskisi sağda yenisi." Davranışlar IntelliJ'in
 * kaynağından alındı; buradaki testler o davranışların kaybolmamasını
 * bağlıyor: F7'nin bir sonraki farka, son farkta ise ("yeniden basın"
 * ipucundan sonra) bir sonraki dosyaya gitmesi, `»`ün bloğu HEAD'e döndürmesi
 * ve geri alınabilmesi, Esc'nin pencereyi kapatması.
 *
 * `»` dosyaya YAZIYOR. En önemli test "dosya arada değiştiyse yazmıyor"
 * zincirinin arayüz yarısı: Rust `changed` dönünce kullanıcı bunu duymalı ve
 * fark tazelenmeli (Rust yarısı `git_tests.rs`te).
 */

const ROOT = "/depo";

function text(t: string): FileText {
  return { text: t, binary: false, truncated: false, size: t.length };
}

const SIDES: Record<string, DiffSides> = {
  "a.ts": { base: text("a\nb\nc\nd\ne\n"), current: text("a\nB\nc\nd\nE\n"), head: "1a2b3c4d" },
  "b.ts": { base: null, current: text("yeni\n"), head: "1a2b3c4d" },
  "uzun.ts": {
    base: text(Array.from({ length: 40 }, (_, i) => `l${i}`).join("\n")),
    current: text(Array.from({ length: 40 }, (_, i) => (i === 20 ? "değişti" : `l${i}`)).join("\n")),
    head: "1a2b3c4d",
  },
  "ayni.ts": { base: text("x\ny\n"), current: text("x\ny\n"), head: "1a2b3c4d" },
  "crlf.ts": { base: text("x\ny\n"), current: text("x\r\ny\r\n"), head: "1a2b3c4d" },
};

function info(paths: string[]): GitInfo {
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
    changes: paths.map((path) => ({ status: path === "b.ts" ? "??" : " M", path })),
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

let files = ["a.ts", "b.ts"];

beforeEach(() => {
  setLanguage("tr");
  setPlatform("windows");
  files = ["a.ts", "b.ts"];
  try {
    window.localStorage.clear();
  } catch {
    // jsdom'da depo her zaman var; temizlenemezse testler yine bağımsız.
  }
  vi.spyOn(api, "bootstrap").mockResolvedValue(boot());
  vi.spyOn(api, "gitInfo").mockImplementation(async () => info(files));
  vi.spyOn(api, "gitDiffSides").mockImplementation(async (_root, file) => SIDES[file]);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  h.setTitle.mockClear();
  h.close.mockClear();
});

/** Zincirli sözler (açılış → liste → iki taraf) çözülsün. */
async function settle() {
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

function key(init: KeyboardEventInit) {
  fireEvent.keyDown(window, init);
}

/** İmlecin bulunduğu satırın numarası (sağ bölme). */
function caretRight(container: HTMLElement): string | null {
  return container.querySelector(".dw-pane:not(.mirror) .dw-gutter-row.caret .dw-num")?.textContent ?? null;
}

describe("açılış", () => {
  it("başlıklar IntelliJ'deki gibi: kilit + HEAD kimliği + yol | Güncel sürüm", async () => {
    const { container } = render(<DiffWindow target={{ root: ROOT, path: "a.ts" }} />);
    await settle();
    const titles = [...container.querySelectorAll(".dw-title")].map((e) => e.textContent);
    expect(titles).toEqual(["1a2b3c4da.ts", "Güncel sürüm"]);
    expect(container.querySelector(".dw-title .dw-lock"), "sol taraf salt okunur değil").not.toBe(null);
    expect(container.querySelector(".dw-status")?.textContent).toBe("2 fark");
    // Pencere başlığı: `ad (klasör)`.
    expect(h.setTitle).toHaveBeenLastCalledWith("a.ts (/depo)");
  });

  it("sayaç değişen dosyalar arasında yeri söylüyor", async () => {
    const { container } = render(<DiffWindow target={{ root: ROOT, path: "a.ts" }} />);
    await settle();
    expect(container.querySelector(".dw-files")?.textContent).toBe("1/2 dosya");
  });

  it("ilk farka gidiyor", async () => {
    const { container } = render(<DiffWindow target={{ root: ROOT, path: "a.ts" }} />);
    await settle();
    expect(caretRight(container)).toBe("2");
  });

  it("yeni dosyada tek editör, bütün satırlar eklenen renginde, sayı yok", async () => {
    const { container } = render(<DiffWindow target={{ root: ROOT, path: "b.ts" }} />);
    await settle();
    expect([...container.querySelectorAll(".dw-title")].map((e) => e.textContent)).toEqual(["Güncel sürümb.ts"]);
    expect(container.querySelectorAll(".dw-pane")).toHaveLength(1);
    expect(container.querySelector(".dw-line")?.className).toContain("ins");
    expect(container.querySelector(".dw-status")?.textContent).toBe("");
  });
});

describe("gezinme", () => {
  it("F7 sonraki farka, son farkta 'yeniden basın', ikinci basışta sonraki dosyaya", async () => {
    const { container } = render(<DiffWindow target={{ root: ROOT, path: "a.ts" }} />);
    await settle();
    key({ key: "F7" });
    await settle();
    expect(caretRight(container)).toBe("5");

    key({ key: "F7" });
    await settle();
    expect(container.querySelector(".dw-hint")?.textContent).toBe("Sonraki dosyaya geçmek için yeniden basın");
    expect(h.setTitle).not.toHaveBeenCalledWith("b.ts (/depo)");

    key({ key: "F7" });
    await settle();
    expect(h.setTitle).toHaveBeenLastCalledWith("b.ts (/depo)");
    expect(container.querySelector(".dw-hint")).toBe(null);
  });

  it("başka bir tuş ipucunu kapatıyor ve dosya değişmiyor", async () => {
    const { container } = render(<DiffWindow target={{ root: ROOT, path: "a.ts" }} />);
    await settle();
    key({ key: "F7" });
    key({ key: "F7" });
    await settle();
    expect(container.querySelector(".dw-hint")).not.toBe(null);
    key({ key: "ArrowDown" });
    await settle();
    expect(container.querySelector(".dw-hint")).toBe(null);
    key({ key: "F7" });
    await settle();
    // İpucu yeniden çıktı; dosya hâlâ aynı.
    expect(container.querySelector(".dw-hint")).not.toBe(null);
    expect(h.setTitle).not.toHaveBeenCalledWith("b.ts (/depo)");
  });

  it("Esc pencereyi kapatıyor", async () => {
    render(<DiffWindow target={{ root: ROOT, path: "a.ts" }} />);
    await settle();
    key({ key: "Escape" });
    expect(h.close).toHaveBeenCalled();
  });
});

describe("» ile bloğu geri almak", () => {
  it("sağ dosyada YALNIZCA o bloğu HEAD'deki hâline çeviriyor", async () => {
    const write = vi.spyOn(api, "gitWriteFile").mockResolvedValue(undefined);
    const { container } = render(<DiffWindow target={{ root: ROOT, path: "a.ts" }} />);
    await settle();
    fireEvent.click(container.querySelector(".dw-arrow")!);
    await settle();
    // Beklenen içerik farkın ALINDIĞI hâl; Rust dosya ondan ayrılmışsa yazmıyor.
    expect(write).toHaveBeenCalledWith(ROOT, "a.ts", "a\nB\nc\nd\nE\n", "a\nb\nc\nd\nE\n");
  });

  it("Ctrl+Z geri alıyor", async () => {
    const write = vi.spyOn(api, "gitWriteFile").mockResolvedValue(undefined);
    const { container } = render(<DiffWindow target={{ root: ROOT, path: "a.ts" }} />);
    await settle();
    fireEvent.click(container.querySelector(".dw-arrow")!);
    await settle();
    key({ key: "z", code: "KeyZ", ctrlKey: true });
    await settle();
    expect(write).toHaveBeenLastCalledWith(ROOT, "a.ts", "a\nb\nc\nd\nE\n", "a\nB\nc\nd\nE\n");
  });

  it("reddedilen Ctrl+Z kaydı kaybettirmiyor: ikinci deneme yine geri alıyor", async () => {
    // Dosya arada değiştiği için Rust yazmayı reddederse geri alma kaydı
    // yığından düşmemeli; düşerse o değişiklik bir daha geri alınamazdı.
    const write = vi.spyOn(api, "gitWriteFile").mockResolvedValueOnce(undefined);
    const { container } = render(<DiffWindow target={{ root: ROOT, path: "a.ts" }} />);
    await settle();
    fireEvent.click(container.querySelector(".dw-arrow")!);
    await settle();
    write.mockRejectedValueOnce("changed");
    key({ key: "z", code: "KeyZ", ctrlKey: true });
    await settle();
    write.mockResolvedValueOnce(undefined);
    key({ key: "z", code: "KeyZ", ctrlKey: true });
    await settle();
    expect(write).toHaveBeenCalledTimes(3);
    expect(write).toHaveBeenLastCalledWith(ROOT, "a.ts", "a\nb\nc\nd\nE\n", "a\nB\nc\nd\nE\n");
  });

  it("dosya arada değiştiyse kullanıcıya söylüyor", async () => {
    vi.spyOn(api, "gitWriteFile").mockRejectedValue("changed");
    const { container } = render(<DiffWindow target={{ root: ROOT, path: "a.ts" }} />);
    await settle();
    fireEvent.click(container.querySelector(".dw-arrow")!);
    await settle();
    expect(container.querySelector(".toast")?.textContent).toBe(
      "Dosya bu arada değişti; fark yenilendi, yeniden deneyin",
    );
  });

  it("ipucu IntelliJ'deki gibi 'Geri al' ve kısayolu", async () => {
    const { container } = render(<DiffWindow target={{ root: ROOT, path: "a.ts" }} />);
    await settle();
    expect(container.querySelector(".dw-arrow")?.getAttribute("title")).toBe("Geri al (Ctrl+Alt+R)");
  });
});

describe("görünüm", () => {
  it("katlama dalgası yazısız; tıklayınca bir kademe açılıyor (4 → 8 satır bağlam)", async () => {
    files = ["uzun.ts"];
    const { container } = render(<DiffWindow target={{ root: ROOT, path: "uzun.ts" }} />);
    await settle();
    expect(container.querySelector(".dw-line.fold"), "varsayılan KAPALI olmalı").toBe(null);
    fireEvent.click(container.querySelector('button[title="Değişmemiş parçaları daralt"]')!);
    await settle();
    const folds = () => [...container.querySelectorAll(".dw-pane.mirror .dw-line.fold")];
    expect(folds().map((f) => f.getAttribute("title"))).toEqual(["16 değişmemiş satır", "15 değişmemiş satır"]);
    expect(folds()[0].textContent, "IntelliJ'de katlamada yazı yok").toBe("");
    fireEvent.mouseDown(folds()[0], { button: 0 });
    await settle();
    expect(folds().map((f) => f.getAttribute("title"))).toEqual(["12 değişmemiş satır", "15 değişmemiş satır"]);
  });

  it("aynı içerikte bilgi bandı ve 'Gizle'", async () => {
    files = ["ayni.ts"];
    const { container, getByText } = render(<DiffWindow target={{ root: ROOT, path: "ayni.ts" }} />);
    await settle();
    expect(container.querySelector(".dw-banner")?.textContent).toContain("İçerikler aynı");
    expect(container.querySelector(".dw-status")?.textContent).toBe("Fark yok");
    fireEvent.click(getByText("Gizle"));
    expect(container.querySelector(".dw-banner")).toBe(null);
  });

  it("yalnızca satır sonu farkı: bant ve başlıklarda LF / CRLF", async () => {
    files = ["crlf.ts"];
    const { container } = render(<DiffWindow target={{ root: ROOT, path: "crlf.ts" }} />);
    await settle();
    expect(container.querySelector(".dw-banner")?.textContent).toContain(
      "İçerikler yalnızca satır sonlarında farklı",
    );
    expect([...container.querySelectorAll(".dw-sep-label")].map((e) => e.textContent)).toEqual(["LF", "CRLF"]);
  });

  it("vurgulama 'Satırlar' iken satırın içi boyanmıyor", async () => {
    const { container, getByText } = render(<DiffWindow target={{ root: ROOT, path: "a.ts" }} />);
    await settle();
    expect(container.querySelector(".dw-frag"), "sözcük kipinde parça yok").not.toBe(null);
    fireEvent.click(container.querySelector('button[title="Ayarlar (Ctrl+Shift+D)"]')!);
    fireEvent.mouseEnter(getByText("Farkları vurgulama").closest(".dw-menu-sub")!);
    fireEvent.click(getByText("Satırlar"));
    await settle();
    expect(container.querySelector(".dw-frag")).toBe(null);
    expect(container.querySelector(".dw-line.mod:not(.soft)")).not.toBe(null);
  });
});
