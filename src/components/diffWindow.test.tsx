// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  setTitle: vi.fn(async (_title: string) => {}),
  close: vi.fn(async () => {}),
  /** Pencerenin kapanma isteği işleyicisi (Esc, ⌘W, pencere düğmesi). */
  closeRequested: null as null | (() => Promise<void>),
  /** Kurulan olay dinleyicileri: testler Rust'ın olaylarını bunlarla gönderiyor. */
  listeners: new Map<string, (event: { payload: unknown }) => void>(),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    setTitle: h.setTitle,
    close: h.close,
    onCloseRequested: async (fn: () => Promise<void>) => {
      h.closeRequested = fn;
      return () => {};
    },
  }),
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (name: string, fn: (event: { payload: unknown }) => void) => {
    h.listeners.set(name, fn);
    return () => h.listeners.delete(name);
  }),
}));

import { diffQuery } from "../lib/diffWindow";
import { setLanguage } from "../lib/i18n";
import { api, DIFF_TARGET_EVENT } from "../lib/ipc";
import { setPlatform } from "../lib/platform";
import type { Bootstrap, DiffSides, FileText, GitInfo, Settings } from "../types";
import { DiffWindow } from "./DiffWindow";

/**
 * Fark penceresi — Değişiklikler panelindeki "Farkı yeni pencerede göster".
 *
 * İSTEK: "yeni pencerede göster dediğimde IntelliJ / WebStorm'daki gibi yeni
 * bir pencere açılmalı; solda eskisi sağda yenisi." Davranışlar IntelliJ'in
 * kaynağından alındı; buradaki testler o davranışların kaybolmamasını
 * bağlıyor: F7'nin bir sonraki farka, son farkta ise doğrudan bir sonraki
 * dosyaya gitmesi, `»`ün bloğu HEAD'e döndürmesi
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
  // Üç ayrı fark, her biri yalnızca BİR boşluk kipinin yok saydığı türden:
  // satır başı boşluğu (trim), satır içi boşluk (whitespace), boş satır (blankLines).
  "bosluk.ts": {
    base: text("a\n  b\nc\nd  e\nf\ng\n"),
    current: text("a\nb\nc\nd e\nf\n\ng\n"),
    head: "1a2b3c4d",
  },
  "bolunmus.ts": { base: text("A\nB\n"), current: text("A X\nB X\n"), head: "1a2b3c4d" },
  "harf.ts": { base: text("color\n"), current: text("colour\n"), head: "1a2b3c4d" },
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
  // Canlı tazelemenin yoklaması: varsayılan olarak hiçbir şey değişmiyor.
  vi.spyOn(api, "gitFingerprint").mockResolvedValue("imza");
  vi.spyOn(api, "readTextFile").mockImplementation(
    async (full) => SIDES[full.slice(ROOT.length + 1)]?.current ?? null,
  );
  // Sayfa yüklenirken bekleyen bir tıklama yok.
  vi.spyOn(api, "diffWindowReady").mockResolvedValue(null);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  h.setTitle.mockClear();
  h.close.mockClear();
  h.listeners.clear();
  h.closeRequested = null;
});

/** Zincirli sözler (açılış → liste → iki taraf) çözülsün. */
async function settle() {
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

/**
 * Koşul gerçekleşene kadar bekler: kayıt 400 ms sonra, yoklama 500 ms'de bir;
 * sabit bir süre beklemek tam takım yük altındayken oynuyordu. Her adım ayrı
 * bir `act`: tek bir uzun `act` React'in güncellemelerini sonuna kadar tutardı.
 */
async function until(check: () => void, timeout = 2000) {
  const end = Date.now() + timeout;
  for (;;) {
    try {
      check();
      return;
    } catch (err) {
      if (Date.now() > end) throw err;
    }
    await act(async () => {
      await new Promise((r) => setTimeout(r, 25));
    });
  }
}

function key(init: KeyboardEventInit) {
  fireEvent.keyDown(window, init);
}

const pencil = (c: HTMLElement) => c.querySelector('button[data-tool="edit"]') as HTMLButtonElement;
const tool = (c: HTMLElement, name: string) => c.querySelector(`button[data-tool="${name}"]`) as HTMLButtonElement;

/**
 * Kalemle düzenlemeyi açar (varsayılan salt okunur). Odak yazı alanından
 * alınıyor: testler yazı alanı odakta DEĞİLKEN başlasın, odaklanan kendisi
 * odaklasın.
 */
async function startEditing(c: HTMLElement) {
  fireEvent.click(pencil(c));
  await settle();
  (c.querySelector(".dw-editor") as HTMLTextAreaElement).blur();
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
  it("F7 sonraki farka, son farkta DOĞRUDAN sonraki dosyaya", async () => {
    // IntelliJ'in "Press again to go to the next file" ara adımı yok — İSTEK:
    // "o yazıyı kaldıralım, basınca geçer zaten."
    const { container } = render(<DiffWindow target={{ root: ROOT, path: "a.ts" }} />);
    await settle();
    key({ key: "F7" });
    await settle();
    expect(caretRight(container)).toBe("5");

    key({ key: "F7" });
    await settle();
    expect(h.setTitle).toHaveBeenLastCalledWith("b.ts (/depo)");
  });

  /*
   * BİLDİRİLEN (ipucu kaldırılmadan önce): "Sonraki dosyaya geçmek için yeniden
   * basın diyor, basıyorum ama olmuyor." İkinci basıştan ÖNCE gelen bir olay
   * (düğmenin `mousedown`u, Shift'in kendi keydown'u) ipucunu siliyordu.
   * Testler bu yüzden tarayıcının GERÇEK olay sırasını gönderiyor.
   */
  it("araç çubuğundaki düğme son farktan sonraki dosyaya geçiyor", async () => {
    const { container } = render(<DiffWindow target={{ root: ROOT, path: "a.ts" }} />);
    await settle();
    const next = () => container.querySelector('button[title="Sonraki fark (F7)"]')!;
    const press = async () => {
      fireEvent.mouseDown(next(), { button: 0 });
      fireEvent.click(next());
      await settle();
    };
    await press(); // son farka
    await press(); // sonraki dosya
    expect(h.setTitle).toHaveBeenLastCalledWith("b.ts (/depo)");
  });

  it("Shift+F7 ilk farkta önceki dosyaya geçiyor", async () => {
    render(<DiffWindow target={{ root: ROOT, path: "b.ts" }} />);
    await settle();
    key({ key: "Shift", code: "ShiftLeft", shiftKey: true });
    key({ key: "F7", code: "F7", shiftKey: true });
    await settle();
    expect(h.setTitle).toHaveBeenLastCalledWith("a.ts (/depo)");
  });

  it("Esc pencereyi kapatıyor", async () => {
    render(<DiffWindow target={{ root: ROOT, path: "a.ts" }} />);
    await settle();
    key({ key: "Escape" });
    expect(h.close).toHaveBeenCalled();
  });
});

/*
 * BİLDİRİLEN: "Farkı yeni pencerede göster'e bir dosya için bastım, ekran
 * açıldı; farklı bir dosya için de bastım, yeni bir tane açıldı. Her
 * tıkladığımda mevcut açık ekran güncellenmeli." Rust açık pencereyi öne
 * getirip ona `app:diff-target` gönderiyor; pencerenin yarısı burada.
 */
describe("tek fark penceresi", () => {
  const send = async (target: { root: string; path: string }) => {
    await act(async () => h.listeners.get(DIFF_TARGET_EVENT)?.({ payload: diffQuery(target) }));
    await settle();
  };

  it("başka bir dosyaya tıklanınca açık pencere o dosyaya geçiyor", async () => {
    const { container } = render(<DiffWindow target={{ root: ROOT, path: "a.ts" }} />);
    await settle();
    await send({ root: ROOT, path: "uzun.ts" });
    expect(h.setTitle).toHaveBeenLastCalledWith("uzun.ts (/depo)");
    expect(caretRight(container), "yeni dosyanın ilk farkında").toBe("21");
    // Yeniden yüklenen sayfa da gösterilen dosyayla açılır.
    expect(new URLSearchParams(window.location.search).get("path")).toBe("uzun.ts");
  });

  it("aynı dosyaya yeniden tıklamak pencereyi yerinde bırakıyor", async () => {
    let disk = "a\nB\nc\nd\nE\n";
    vi.mocked(api.readTextFile).mockImplementation(async () => text(disk));
    vi.mocked(api.gitDiffSides).mockImplementation(async () => ({ ...SIDES["a.ts"], current: text(disk) }));
    const { container } = render(<DiffWindow target={{ root: ROOT, path: "a.ts" }} />);
    await settle();
    key({ key: "F7" });
    await settle();
    fireEvent.click(container.querySelector('button[title="Ayarlar (Ctrl+Shift+D)"]')!);
    expect(caretRight(container)).toBe("5");
    const loads = vi.mocked(api.gitDiffSides).mock.calls.length;

    await send({ root: ROOT, path: "a.ts" });
    expect(caretRight(container), "imleç ilk farka sıçramadı").toBe("5");
    expect(container.querySelector(".dw-menu"), "açık menü kapanmadı").not.toBe(null);
    expect(vi.mocked(api.gitDiffSides).mock.calls.length).toBe(loads);

    // Bekleyen bir "ilk farka git" de kalmadı: dosya değişip fark tazelenince imleç yerinde.
    disk = "a\nB\nc\nd\nE\nf\n";
    await act(async () => {
      await new Promise((r) => setTimeout(r, 700));
    });
    await settle();
    expect(vi.mocked(api.gitDiffSides).mock.calls.length).toBeGreaterThan(loads);
    expect(caretRight(container)).toBe("5");
  });

  it("başka bir deponun dosyası o deponun iki tarafıyla geliyor", async () => {
    const other = { base: text("x\n"), current: text("y\n"), head: "99887766" };
    let release = () => {};
    vi.mocked(api.gitDiffSides).mockImplementation((root, file) =>
      root === "/baska"
        ? new Promise((resolve) => (release = () => resolve(other)))
        : Promise.resolve(SIDES[file]),
    );
    const { container } = render(<DiffWindow target={{ root: ROOT, path: "a.ts" }} />);
    await settle();
    await send({ root: "/baska", path: "a.ts" });
    // Yol aynı (`a.ts`) ama depo başka: yüklenirken eski deponun farkı gösterilmiyor.
    expect(container.querySelector(".dw-title"), "eski deponun farkı").toBe(null);
    await act(async () => release());
    await settle();
    expect(vi.mocked(api.gitInfo)).toHaveBeenLastCalledWith("/baska");
    expect(h.setTitle).toHaveBeenLastCalledWith("a.ts (/baska)");
    expect(container.querySelector(".dw-title")?.textContent).toBe("99887766a.ts");
  });

  it("pencere yüklenirken gelen tıklama kaybolmuyor", async () => {
    // Olay dinleyici kurulmadan gönderildi; Rust onu bekletti ve hazır olunca verdi.
    vi.mocked(api.diffWindowReady).mockResolvedValue(diffQuery({ root: ROOT, path: "b.ts" }));
    render(<DiffWindow target={{ root: ROOT, path: "a.ts" }} />);
    await settle();
    expect(h.setTitle).toHaveBeenLastCalledWith("b.ts (/depo)");
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

  /*
   * Dosya, farkın alındığı hâlden ayrılmışsa (bir düzenleyicide kaydedildi)
   * Rust yazmıyor. Üzerine yazmak yok: kullanıcı IntelliJ'deki gibi seçiyor —
   * "Diskteki hâli yükle" ya da "Benimkini kaydet".
   */
  it("dosya arada değiştiyse üzerine yazmıyor; diskteki ya da buradaki diye soruyor", async () => {
    const write = vi.spyOn(api, "gitWriteFile").mockRejectedValueOnce("changed");
    const { container, getByText } = render(<DiffWindow target={{ root: ROOT, path: "a.ts" }} />);
    await settle();
    fireEvent.click(container.querySelector(".dw-arrow")!);
    await settle();
    expect(container.querySelector(".dw-banner.warn span")?.textContent).toBe(
      "Dosya diskte değişti; buradaki değişiklikleriniz kaydedilmedi",
    );
    // Çakışma çözülene kadar yeni bir değişiklik de yazılmıyor.
    key({ key: "z", code: "KeyZ", ctrlKey: true });
    await settle();
    expect(write).toHaveBeenCalledTimes(1);

    // Diskte artık başka bir içerik var; "Benimkini kaydet" ONUN üzerine yazıyor.
    vi.mocked(api.gitDiffSides).mockResolvedValue({ ...SIDES["a.ts"], current: text("a\nDISK\nc\nd\nE\n") });
    write.mockResolvedValue(undefined);
    key({ key: "z", code: "KeyZ", ctrlKey: true, shiftKey: true }); // yeniden »'ün hâline
    await settle();
    fireEvent.click(getByText("Benimkini kaydet"));
    await settle();
    expect(write).toHaveBeenLastCalledWith(ROOT, "a.ts", "a\nDISK\nc\nd\nE\n", "a\nb\nc\nd\nE\n");
    expect(container.querySelector(".dw-banner.warn")).toBe(null);
  });

  it("'Diskteki hâli yükle' buradaki değişikliği bırakıyor", async () => {
    vi.spyOn(api, "gitWriteFile").mockRejectedValueOnce("changed");
    const { container, getByText } = render(<DiffWindow target={{ root: ROOT, path: "a.ts" }} />);
    await settle();
    await startEditing(container);
    fireEvent.click(container.querySelector(".dw-arrow")!);
    await settle();
    vi.mocked(api.gitDiffSides).mockResolvedValue({ ...SIDES["a.ts"], current: text("a\nDISK\nc\nd\nE\n") });
    fireEvent.click(getByText("Diskteki hâli yükle"));
    await settle();
    expect(container.querySelector(".dw-banner.warn")).toBe(null);
    expect((container.querySelector(".dw-editor") as HTMLTextAreaElement).value).toBe("a\nDISK\nc\nd\nE\n");
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
    const folds = () => [...container.querySelectorAll(".dw-pane.mirror .dw-line.fold")];
    expect(folds().map((f) => f.getAttribute("title"))).toEqual(["16 değişmemiş satır", "15 değişmemiş satır"]);
    expect(folds()[0].textContent, "IntelliJ'de katlamada yazı yok").toBe("");
    fireEvent.mouseDown(folds()[0], { button: 0 });
    await settle();
    expect(folds().map((f) => f.getAttribute("title"))).toEqual(["12 değişmemiş satır", "15 değişmemiş satır"]);
  });

  /*
   * BİLDİRİLEN: "Değişmemiş parçaları daralt doğru bir şekilde çalışmıyor.
   * Birde tıklayınca icon değişmiyor. Default daraltılmış gelmeli."
   */
  const collapseBtn = (c: HTMLElement) => c.querySelector<HTMLButtonElement>('[data-tool="collapse"]')!;
  const foldCount = (c: HTMLElement) => c.querySelectorAll(".dw-pane.mirror .dw-line.fold").length;

  it("varsayılan DARALTILMIŞ; düğme açıp kapatıyor, simgesi ve ipucu değişiyor", async () => {
    files = ["uzun.ts"];
    const { container } = render(<DiffWindow target={{ root: ROOT, path: "uzun.ts" }} />);
    await settle();
    expect(foldCount(container), "varsayılan daraltılmış değil").toBe(2);
    // Simge ve ipucu basınca ne olacağını söylüyor; durum aria-pressed'de.
    expect(collapseBtn(container).title).toBe("Değişmemiş parçaları aç");
    expect(collapseBtn(container).getAttribute("aria-pressed")).toBe("true");
    const daraltilmis = collapseBtn(container).innerHTML;

    fireEvent.click(collapseBtn(container));
    await settle();
    expect(foldCount(container)).toBe(0);
    expect(collapseBtn(container).title).toBe("Değişmemiş parçaları daralt");
    expect(collapseBtn(container).getAttribute("aria-pressed")).toBe("false");
    expect(collapseBtn(container).innerHTML, "tıklayınca simge değişmedi").not.toBe(daraltilmis);

    fireEvent.click(collapseBtn(container));
    await settle();
    expect(foldCount(container)).toBe(2);
    expect(collapseBtn(container).innerHTML).toBe(daraltilmis);
  });

  it("eski kalıcı tercih (açık) varsayılanı ezmiyor", async () => {
    // Seçim tarayıcı deposunda kalıcıydı: bir kez açan kullanıcının sonraki
    // bütün pencereleri açık geliyordu. Depoda kalan eski değer artık okunmuyor.
    window.localStorage.setItem(
      "nterminal.diffWindow",
      JSON.stringify({ viewer: "side", ignore: "none", highlight: "words", collapse: false }),
    );
    files = ["uzun.ts"];
    const { container } = render(<DiffWindow target={{ root: ROOT, path: "uzun.ts" }} />);
    await settle();
    expect(foldCount(container)).toBe(2);
  });

  it("ana pencereden gelen yeni dosya yeniden daraltılmış açılıyor", async () => {
    files = ["uzun.ts", "a.ts"];
    const { container } = render(<DiffWindow target={{ root: ROOT, path: "a.ts" }} />);
    await settle();
    fireEvent.click(collapseBtn(container));
    await settle();
    expect(collapseBtn(container).getAttribute("aria-pressed")).toBe("false");

    await act(async () =>
      h.listeners.get(DIFF_TARGET_EVENT)?.({ payload: diffQuery({ root: ROOT, path: "uzun.ts" }) }),
    );
    await settle();
    expect(foldCount(container), "yeni açılış daraltılmış değil").toBe(2);
  });

  /** Satır yüksekliği (px): pencerenin kendi CSS değişkeni. */
  const lineHeightOf = (c: HTMLElement) =>
    parseInt(
      c.querySelector<HTMLElement>('[style*="--dw-line-height"]')!.style.getPropertyValue("--dw-line-height"),
      10,
    );

  /**
   * Okuma noktası (bkz. `anchorOf`): görünümün üçte biri, en az iki satır.
   * jsdom görünümü ölçemiyor; bölmeler 600px varsayıyor → 200px.
   */
  const anchorPx = (lh: number) => Math.max(2 * lh, 200);

  it("katlama değişince okunan satır yerinde kalıyor (yan yana)", async () => {
    /*
     * ÖLÇÜLDÜ (200 satır): katlamaya basınca içerik ~22 satıra indi ama kaydırma
     * konumu eski yerinde kaldı; görünen alan içeriğin sonundaki boşluğa düştü.
     * Kural: okuma noktasındaki satır katlamadan sonra da okuma noktasında.
     * Gidiş-dönüş: açıp yeniden daraltınca aynı konuma dönülüyor. Yalnızca
     * imlecin bölmesi ölçülüyor: karşı bölmeyi `follow` hizalıyor ve jsdom'da
     * `scrollHeight` 0 olduğu için orada sıfıra kırpılıyor.
     */
    files = ["uzun.ts"];
    const { container } = render(<DiffWindow target={{ root: ROOT, path: "uzun.ts" }} />);
    await settle();
    const lh = lineHeightOf(container);
    const a = anchorPx(lh);
    const pane = () => container.querySelectorAll<HTMLElement>(".dw-sbs .dw-scroll")[1];
    // Daraltılmış sıralar: katlama (0-15), 16-19, fark (20), 21-24, katlama (25-39).
    // Okuma noktası son katlamaya (10. sıra) gelsin.
    pane().scrollTop = 10 * lh - a;
    fireEvent.scroll(pane());
    await settle();

    fireEvent.click(collapseBtn(container));
    await settle();
    expect(pane().scrollTop, "açınca okunan satır kaydı").toBe(25 * lh - a);

    fireEvent.click(collapseBtn(container));
    await settle();
    expect(pane().scrollTop, "daraltınca okunan satır kaydı").toBe(10 * lh - a);
  });

  it("katlama değişince okunan satır yerinde kalıyor (birleşik görünüm)", async () => {
    files = ["uzun.ts"];
    const { container, getByTitle } = render(<DiffWindow target={{ root: ROOT, path: "uzun.ts" }} />);
    await settle();
    fireEvent.click(getByTitle("Birleşik görünüm"));
    await settle();
    const lh = lineHeightOf(container);
    const a = anchorPx(lh);
    const pane = () => container.querySelector<HTMLElement>(".dw-scroll")!;
    // Daraltılmış sıralar: katlama, 16-19, eski 20, yeni 20, 21-24, katlama (25-39) → 11.
    pane().scrollTop = 11 * lh - a;
    fireEvent.scroll(pane());
    await settle();

    fireEvent.click(collapseBtn(container));
    await settle();
    // Açık: 0-19, eski 20, yeni 20, 21… → 25. satır 26. sırada.
    expect(pane().scrollTop, "açınca okunan satır kaydı").toBe(26 * lh - a);

    fireEvent.click(collapseBtn(container));
    await settle();
    expect(pane().scrollTop, "daraltınca okunan satır kaydı").toBe(11 * lh - a);
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

/**
 * Dişli menüsündeki seçenekler — her biri EKRANDA bir şeyi değiştiriyor mu?
 *
 * SORULAN: "yok sayılan farklar, farkları vurgulama — bunlardan hangileri
 * gerçekten çalışıyor?" Motorun testleri (`textDiff.test.ts`) her kipin
 * hesabını sınıyor; bunlar seçeneğin MENÜDEN seçilince pencereye ulaştığını.
 * Örnek dosyalar her kipin yalnızca kendi türünü yok saydığı farklar taşıyor,
 * yani bir kip çalışmazsa sayı değişmez ve test düşer.
 */
describe("dişli menüsündeki seçenekler", () => {
  function choose(container: HTMLElement, getByText: (t: string) => HTMLElement, menu: string, item: string) {
    // Menü seçimden sonra açık kalıyor; kapalıysa aç (dişliye basmak açıkken kapatır).
    if (!container.querySelector(".dw-menu")) {
      fireEvent.click(container.querySelector('button[title="Ayarlar (Ctrl+Shift+D)"]')!);
    }
    fireEvent.mouseEnter(getByText(menu).closest(".dw-menu-sub")!);
    fireEvent.click(getByText(item));
  }
  const status = (container: HTMLElement) => container.querySelector(".dw-status")?.textContent;

  it("yok sayılan farklar: hiçbiri 3, baştaki/sondaki 2, bütün boşluklar 1, boş satırlar da 0", async () => {
    files = ["bosluk.ts"];
    const { container, getByText } = render(<DiffWindow target={{ root: ROOT, path: "bosluk.ts" }} />);
    await settle();
    expect(status(container)).toBe("3 fark");
    choose(container, getByText, "Yok sayılan farklar", "Baştaki ve sondaki boşluklar");
    await settle();
    expect(status(container)).toBe("2 fark");
    choose(container, getByText, "Yok sayılan farklar", "Bütün boşluklar");
    await settle();
    expect(status(container)).toBe("1 fark");
    choose(container, getByText, "Yok sayılan farklar", "Boşluklar ve boş satırlar");
    await settle();
    // Metinler farklı ama hepsi yok sayıldı: IntelliJ'in "Differences ignored"ı.
    expect(status(container)).toBe("Farklar yok sayıldı");
    choose(container, getByText, "Yok sayılan farklar", "Hiçbiri");
    await settle();
    expect(status(container)).toBe("3 fark");
  });

  it("vurgulama: sözcükler değişen sözcüğü, satırlar yalnızca satırı boyuyor", async () => {
    const { container, getByText } = render(<DiffWindow target={{ root: ROOT, path: "a.ts" }} />);
    await settle();
    expect(container.querySelector(".dw-pane.mirror .dw-frag.mod")?.textContent).toBe("b");
    expect(container.querySelector(".dw-pane:not(.mirror) .dw-frag.mod")?.textContent).toBe("B");
    expect(container.querySelector(".dw-line.mod.soft")).not.toBe(null);
    choose(container, getByText, "Farkları vurgulama", "Satırlar");
    await settle();
    expect(container.querySelector(".dw-frag")).toBe(null);
    expect(container.querySelector(".dw-line.mod:not(.soft)")).not.toBe(null);
  });

  it("vurgulama: karakterler sözcüğün içindeki harfi buluyor", async () => {
    files = ["harf.ts"];
    const { container, getByText } = render(<DiffWindow target={{ root: ROOT, path: "harf.ts" }} />);
    await settle();
    // Sözcük kipinde bütün sözcük değişmiş sayılıyor.
    expect(container.querySelector(".dw-pane:not(.mirror) .dw-frag")?.textContent).toBe("colour");
    choose(container, getByText, "Farkları vurgulama", "Karakterler");
    await settle();
    expect(container.querySelector(".dw-pane:not(.mirror) .dw-frag")?.textContent).toBe("u");
  });

  it("vurgulama: bölünmüş değişiklikler bir bloğu ikiye ayırıyor", async () => {
    files = ["bolunmus.ts"];
    const { container, getByText } = render(<DiffWindow target={{ root: ROOT, path: "bolunmus.ts" }} />);
    await settle();
    expect(status(container)).toBe("1 fark");
    choose(container, getByText, "Farkları vurgulama", "Bölünmüş değişiklikler");
    await settle();
    expect(status(container)).toBe("2 fark");
  });

  it("seçim menüyü kapatmıyor; onay işareti yeni seçeneğe geçiyor", async () => {
    // İSTEK: "her seçim yaptığımda kapanıyor, yeniden açmak durumunda kalıyorum."
    const { container, getByText } = render(<DiffWindow target={{ root: ROOT, path: "a.ts" }} />);
    await settle();
    choose(container, getByText, "Farkları vurgulama", "Satırlar");
    await settle();
    const checked = () =>
      [...container.querySelectorAll('.dw-submenu [aria-checked="true"]')].map((e) => e.textContent);
    expect(container.querySelector(".dw-menu"), "menü kapandı").not.toBe(null);
    expect(checked()).toEqual(["Satırlar"]);
    fireEvent.click(getByText("Karakterler"));
    await settle();
    expect(checked()).toEqual(["Karakterler"]);
    // Esc kapatıyor (pencereyi değil, önce menüyü).
    key({ key: "Escape" });
    await settle();
    expect(container.querySelector(".dw-menu")).toBe(null);
    expect(h.close).not.toHaveBeenCalled();
  });

  it("vurgulama: hiçbiri hiçbir şeyi boyamıyor ve bunu söylüyor", async () => {
    const { container, getByText } = render(<DiffWindow target={{ root: ROOT, path: "a.ts" }} />);
    await settle();
    choose(container, getByText, "Farkları vurgulama", "Hiçbiri");
    await settle();
    expect(status(container)).toBe("Fark vurgulama kapalı");
    expect(container.querySelector(".dw-line.mod, .dw-line.ins, .dw-line.del")).toBe(null);
    expect(container.querySelector(".dw-divider path")).toBe(null);
    expect(container.querySelector(".dw-arrow")).toBe(null);
  });
});

/**
 * Canlı tazeleme.
 *
 * BİLDİRİLEN: "değişiklik yapınca açık pencereye anlık yansımıyor." Fark
 * yalnızca odak geri gelince tazeleniyordu; fark penceresi ise çoğu zaman
 * düzenleyicinin yanında duruyor ve ona tıklanmadan bakılıyor.
 */
describe("canlı tazeleme", () => {
  const wait = (ms: number) =>
    act(async () => {
      await new Promise((r) => setTimeout(r, ms));
    });

  it("dosya diskte değişince pencere kendiliğinden yeni farkı gösteriyor", async () => {
    let disk = "a\nB\nc\nd\nE\n";
    vi.spyOn(api, "readTextFile").mockImplementation(async () => text(disk));
    vi.spyOn(api, "gitDiffSides").mockImplementation(async () => ({ ...SIDES["a.ts"], current: text(disk) }));
    const { container } = render(<DiffWindow target={{ root: ROOT, path: "a.ts" }} />);
    await settle();
    expect(container.querySelector(".dw-status")?.textContent).toBe("2 fark");

    disk = "a\nb\nc\nd\nE\n"; // düzenleyicide bir blok geri alındı
    await wait(700);
    await settle();
    expect(container.querySelector(".dw-status")?.textContent).toBe("1 fark");
  });

  it("commit atılınca (depo imzası değişince) sol taraf da tazeleniyor", async () => {
    let base = "a\nb\nc\nd\ne\n";
    let print = "once";
    vi.spyOn(api, "gitFingerprint").mockImplementation(async () => print);
    vi.spyOn(api, "gitDiffSides").mockImplementation(async () => ({ ...SIDES["a.ts"], base: text(base) }));
    const { container } = render(<DiffWindow target={{ root: ROOT, path: "a.ts" }} />);
    await settle();
    await wait(600); // ilk yoklama imzayı öğreniyor
    expect(container.querySelector(".dw-status")?.textContent).toBe("2 fark");

    base = "a\nB\nc\nd\nE\n"; // her şey commit'lendi
    print = "sonra";
    await wait(700);
    await settle();
    expect(container.querySelector(".dw-status")?.textContent).toBe("Fark yok");
  });

  it("hiçbir şey değişmezken yeniden yüklemiyor", async () => {
    const sides = vi.spyOn(api, "gitDiffSides");
    render(<DiffWindow target={{ root: ROOT, path: "a.ts" }} />);
    await settle();
    const before = sides.mock.calls.length;
    await wait(1200);
    // Yoklama iki kez koştu ama `git` süreci başlatan okuma hiç tekrarlanmadı.
    expect(sides.mock.calls.length).toBe(before);
  });
});

/**
 * Kalem ("Kaynağa git").
 *
 * BİLDİRİLEN: "Düzenle butonuna basınca dosya açılıyor fakat düzenleme
 * yapamıyorum." Dosya ana pencerenin salt okunur görüntüleyicisinde
 * açılıyordu; artık Ayarlar › Düzenleyici'deki dış düzenleyicide, imlecin
 * satırında.
 */
/*
 * İSTEK: "Düzenle de bizim terminalimizde olmalı" → "fark penceresinin sağ
 * tarafında": IntelliJ'deki gibi sağ taraf doğrudan yazılabilir, yazdıkça
 * fark güncelleniyor, dosyaya kendiliğinden kaydediliyor.
 */
describe("sağ tarafta yazmak", () => {
  const editor = (c: HTMLElement) => c.querySelector(".dw-editor") as HTMLTextAreaElement;
  const type = (c: HTMLElement, value: string) => fireEvent.input(editor(c), { target: { value } });
  const wait = (ms: number) =>
    act(async () => {
      await new Promise((r) => setTimeout(r, ms));
    });

  it("yazınca fark hemen güncelleniyor, duraksayınca dosyaya yazılıyor", async () => {
    const write = vi.spyOn(api, "gitWriteFile").mockResolvedValue(undefined);
    const { container } = render(<DiffWindow target={{ root: ROOT, path: "a.ts" }} />);
    await settle();
    await startEditing(container);
    expect(editor(container).value).toBe("a\nB\nc\nd\nE\n");
    expect(editor(container).getAttribute("aria-label")).toBe("Güncel sürüm");

    type(container, "a\nb\nc\nd\nE\n");
    await settle();
    expect(container.querySelector(".dw-status")?.textContent).toBe("1 fark");
    expect(write, "her tuşta yazmıyor").not.toHaveBeenCalled();

    await until(() => expect(write).toHaveBeenCalledWith(ROOT, "a.ts", "a\nB\nc\nd\nE\n", "a\nb\nc\nd\nE\n"));
  });

  it("art arda yazılan harfler tek Ctrl+Z ile gidiyor", async () => {
    const write = vi.spyOn(api, "gitWriteFile").mockResolvedValue(undefined);
    const { container } = render(<DiffWindow target={{ root: ROOT, path: "a.ts" }} />);
    await settle();
    await startEditing(container);
    type(container, "a\nBx\nc\nd\nE\n");
    type(container, "a\nBxy\nc\nd\nE\n");
    await settle();
    editor(container).focus();
    key({ key: "z", code: "KeyZ", ctrlKey: true });
    await settle();
    expect(editor(container).value).toBe("a\nB\nc\nd\nE\n");
    expect(editor(container).selectionStart, "imleç yazmadan önceki yerde").toBe(3);
    // Geri alma beklemeden yazıyor; dosya en baştaki hâline döndü, yazacak bir şey yok.
    expect(write).not.toHaveBeenCalled();
    key({ key: "z", code: "KeyZ", ctrlKey: true, shiftKey: true });
    await settle();
    expect(editor(container).value).toBe("a\nBxy\nc\nd\nE\n");
    expect(write).toHaveBeenLastCalledWith(ROOT, "a.ts", "a\nB\nc\nd\nE\n", "a\nBxy\nc\nd\nE\n");
  });

  it("CRLF dosyada satır sonları korunuyor", async () => {
    files = ["crlf.ts"];
    const write = vi.spyOn(api, "gitWriteFile").mockResolvedValue(undefined);
    const { container } = render(<DiffWindow target={{ root: ROOT, path: "crlf.ts" }} />);
    await settle();
    await startEditing(container);
    expect(editor(container).value).toBe("x\ny\n");
    type(container, "x\nyz\n");
    await until(() => expect(write).toHaveBeenCalledWith(ROOT, "crlf.ts", "x\r\ny\r\n", "x\r\nyz\r\n"));
  });

  it("karışık satır sonlu dosyada yazı alanı yok (geri yazmak satırları bozardı), » var", async () => {
    vi.mocked(api.gitDiffSides).mockResolvedValue({ base: text("a\nb\n"), current: text("a\r\nB\n"), head: "1a2b3c4d" });
    const { container } = render(<DiffWindow target={{ root: ROOT, path: "a.ts" }} />);
    await settle();
    expect(editor(container)).toBe(null);
    expect(container.querySelector(".dw-arrow")).not.toBe(null);
  });

  it("yeni (takipsiz) dosya da yazılabilir", async () => {
    const write = vi.spyOn(api, "gitWriteFile").mockResolvedValue(undefined);
    const { container } = render(<DiffWindow target={{ root: ROOT, path: "b.ts" }} />);
    await settle();
    await startEditing(container);
    type(container, "yeni\nsatır\n");
    await until(() => expect(write).toHaveBeenCalledWith(ROOT, "b.ts", "yeni\n", "yeni\nsatır\n"));
    await settle();
    expect(container.querySelectorAll(".dw-line.ins")).toHaveLength(3);
  });

  it("Enter girintiyi koruyor, Sekme bir birim ekliyor", async () => {
    vi.mocked(api.gitDiffSides).mockResolvedValue({
      base: text("f {\n  a\n}\n"),
      current: text("f {\n  a\n}\n"),
      head: "1a2b3c4d",
    });
    const { container } = render(<DiffWindow target={{ root: ROOT, path: "a.ts" }} />);
    await settle();
    await startEditing(container);
    const el = editor(container);
    el.focus();
    el.setSelectionRange(7, 7); // "  a" satırının sonu
    fireEvent.keyDown(el, { key: "Enter" });
    expect(el.value).toBe("f {\n  a\n  \n}\n");
    fireEvent.keyDown(el, { key: "Tab" });
    await settle();
    expect(el.value).toBe("f {\n  a\n    \n}\n");
    expect(el.selectionStart).toBe(12);
  });

  it("yazılmamış değişiklik varken dosya diskte değişirse üzerine yazmıyor", async () => {
    const write = vi.spyOn(api, "gitWriteFile").mockResolvedValue(undefined);
    let disk = "a\nB\nc\nd\nE\n";
    vi.mocked(api.readTextFile).mockImplementation(async () => text(disk));
    vi.mocked(api.gitDiffSides).mockImplementation(async () => ({ ...SIDES["a.ts"], current: text(disk) }));
    const { container } = render(<DiffWindow target={{ root: ROOT, path: "a.ts" }} />);
    await settle();
    await startEditing(container);
    type(container, "a\nB\nc\nd\nE\nburada\n");
    disk = "a\nB\nc\nd\nE\nbaşka bir düzenleyicide\n";
    // Yoklama (500 ms) diski kayıttan (400 ms) önce görsün diye kayıt ertelendi:
    // yazmaya devam ediliyor.
    await wait(300);
    type(container, "a\nB\nc\nd\nE\nburada!\n");
    await wait(350);
    await settle();
    expect(container.querySelector(".dw-banner.warn"), "çakışma bandı").not.toBe(null);
    await wait(500);
    expect(write).not.toHaveBeenCalled();
    expect(editor(container).value, "yazılan kaybolmadı").toBe("a\nB\nc\nd\nE\nburada!\n");
  });

  it("kaydedilmiş hâldeyken dosya diskte değişirse sağ taraf diskteki oluyor", async () => {
    let disk = "a\nB\nc\nd\nE\n";
    vi.mocked(api.readTextFile).mockImplementation(async () => text(disk));
    vi.mocked(api.gitDiffSides).mockImplementation(async () => ({ ...SIDES["a.ts"], current: text(disk) }));
    vi.spyOn(api, "gitWriteFile").mockImplementation(async (_r, _p, _e, next) => {
      disk = next;
    });
    const { container } = render(<DiffWindow target={{ root: ROOT, path: "a.ts" }} />);
    await settle();
    await startEditing(container);
    type(container, "a\nB\nc\nd\nE\nf\n");
    await until(() => expect(disk).toBe("a\nB\nc\nd\nE\nf\n"));
    await settle();
    disk = "dışarıdan\n";
    await until(() => expect(editor(container).value).toBe("dışarıdan\n"));
    expect(container.querySelector(".dw-banner.warn")).toBe(null);
  });

  it("pencere kapanırken ve başka dosyaya geçerken bekleyen kayıt yazılıyor", async () => {
    const write = vi.spyOn(api, "gitWriteFile").mockResolvedValue(undefined);
    const { container } = render(<DiffWindow target={{ root: ROOT, path: "a.ts" }} />);
    await settle();
    await startEditing(container);
    type(container, "a\nB\nc\nd\nE\n1\n");
    await act(async () => h.closeRequested?.());
    expect(write).toHaveBeenCalledWith(ROOT, "a.ts", "a\nB\nc\nd\nE\n", "a\nB\nc\nd\nE\n1\n");

    type(container, "a\nB\nc\nd\nE\n12\n");
    key({ key: "ArrowRight", code: "ArrowRight", altKey: true, shiftKey: true }); // sonraki dosya
    await settle();
    expect(h.setTitle).toHaveBeenLastCalledWith("b.ts (/depo)");
    expect(write).toHaveBeenLastCalledWith(ROOT, "a.ts", "a\nB\nc\nd\nE\n1\n", "a\nB\nc\nd\nE\n12\n");
  });

  it("yazarken F7 imleci de sonraki farka taşıyor", async () => {
    const { container } = render(<DiffWindow target={{ root: ROOT, path: "a.ts" }} />);
    await settle();
    await startEditing(container);
    const el = editor(container);
    el.focus();
    el.setSelectionRange(0, 0);
    fireEvent.keyUp(el, { key: "ArrowUp" }); // ilk satıra çıkıldı
    expect(caretRight(container)).toBe("1");
    key({ key: "F7" });
    await settle();
    // İlk fark 2. satırda (konum 2), sonraki 5. satırda (konum 8).
    expect(el.selectionStart).toBe(2);
    key({ key: "F7" });
    await settle();
    expect(el.selectionStart).toBe(8);
    expect(caretRight(container)).toBe("5");
  });

  it("odakta olmayan yazı alanı F7'nin koyduğu imleci ezmiyor", async () => {
    vi.spyOn(api, "gitWriteFile").mockResolvedValue(undefined);
    const { container } = render(<DiffWindow target={{ root: ROOT, path: "a.ts" }} />);
    await settle();
    await startEditing(container);
    key({ key: "F7" });
    await settle();
    expect(caretRight(container)).toBe("5");
    // Metin dışarıdan değişiyor (» ilk bloğu geri aldı); yazı alanının kendi
    // seçimi (en baş) imleç satırına yazılmamalı.
    fireEvent.click(container.querySelector(".dw-arrow")!);
    await settle();
    expect(caretRight(container)).toBe("5");
  });

  it("en uzun satıra yazarken metin alanının genişliği her tuşta değişmiyor", async () => {
    const { container } = render(<DiffWindow target={{ root: ROOT, path: "a.ts" }} />);
    await settle();
    await startEditing(container);
    const width = () => (container.querySelector(".dw-pane:not(.mirror) .dw-canvas") as HTMLElement).style.width;
    const before = width();
    type(container, "a\nBBB\nc\nd\nE\n");
    await settle();
    expect(width()).toBe(before);
  });

  it("yazı alanındayken mac'te ⌘↓ tarayıcının (metnin sonuna gidiyor)", async () => {
    vi.mocked(api.bootstrap).mockResolvedValue({ ...boot(), platform: "macos" } as Bootstrap);
    const { container } = render(<DiffWindow target={{ root: ROOT, path: "a.ts" }} />);
    await settle();
    expect(pencil(container).title).toBe("Düzenle (⌘↓)");
    fireEvent.click(pencil(container));
    await settle();
    const el = editor(container);
    el.setSelectionRange(5, 5);
    key({ key: "ArrowDown", code: "ArrowDown", metaKey: true });
    await settle();
    expect(editor(container), "düzenleme kapanmadı").toBe(el);
    expect(el.selectionStart).toBe(5);
  });

  describe("kalem (Düzenle)", () => {
    /*
     * BİLDİRİLEN: "kaleme basınca düzenleme açılıyor fakat tekrar basınca
     * kapanmıyor." Kalem aç/kapa: varsayılan salt okunur, basılıyken yazılabilir.
     */
    it("varsayılan salt okunur; kalem açıp kapatıyor, kapatınca bekleyen kayıt hemen yazılıyor", async () => {
      const write = vi.spyOn(api, "gitWriteFile").mockResolvedValue(undefined);
      const { container } = render(<DiffWindow target={{ root: ROOT, path: "a.ts" }} />);
      await settle();
      expect(editor(container)).toBe(null);
      expect(pencil(container).getAttribute("aria-pressed")).toBe("false");

      fireEvent.click(pencil(container));
      await settle();
      expect(editor(container)).not.toBe(null);
      expect(pencil(container).getAttribute("aria-pressed")).toBe("true");
      type(container, "a\nB\nc\nd\nE\nson\n");

      fireEvent.click(pencil(container));
      await settle();
      expect(editor(container)).toBe(null);
      expect(pencil(container).getAttribute("aria-pressed")).toBe("false");
      expect(write, "beklemeden").toHaveBeenCalledWith(ROOT, "a.ts", "a\nB\nc\nd\nE\n", "a\nB\nc\nd\nE\nson\n");
      // Salt okunurken harfleri yine satırlar çiziyor.
      expect(container.querySelector(".dw-pane.editable")).toBe(null);
    });

    /*
     * İSTEK: "kalem açık kapalı özelliği ekledik ama kullanıcının da anlaması
     * gerek." Açıkken kalem vurgu renginde, sağ başlıkta "Düzenleniyor";
     * kapalıyken sağ başlıkta kilit ve nasıl açılacağı.
     */
    it("açık / kapalı hâl görünüyor: kalemin rengi, başlığı, sağdaki kilit ve 'Düzenleniyor'", async () => {
      const { container } = render(<DiffWindow target={{ root: ROOT, path: "a.ts" }} />);
      await settle();
      const right = () => container.querySelectorAll(".dw-title")[1] as HTMLElement;
      expect(pencil(container).className).not.toContain("accent");
      expect(pencil(container).title).toBe("Düzenle (F4)");
      expect(right().querySelector(".dw-lock")?.getAttribute("title")).toBe(
        "Salt okunur — düzenlemek için kaleme basın (F4)",
      );
      expect(right().querySelector(".dw-editing")).toBe(null);

      fireEvent.click(pencil(container));
      await settle();
      expect(pencil(container).className).toContain("on accent");
      expect(pencil(container).title).toBe("Düzenlemeyi kapat (F4)");
      expect(right().querySelector(".dw-lock")).toBe(null);
      expect(right().className).toContain("editing");
      expect(right().querySelector(".dw-editing")?.textContent).toBe("Düzenleniyor");
    });

    it("araç çubuğunda Geri al / İleri al / Kaydet", async () => {
      const write = vi.spyOn(api, "gitWriteFile").mockResolvedValue(undefined);
      const { container } = render(<DiffWindow target={{ root: ROOT, path: "a.ts" }} />);
      await settle();
      expect(tool(container, "undo").disabled).toBe(true);
      expect(tool(container, "redo").disabled).toBe(true);
      expect(tool(container, "save").disabled).toBe(true);
      expect(tool(container, "undo").title).toBe("Geri al (Ctrl+Z)");
      expect(tool(container, "redo").title).toBe("İleri al (Ctrl+Y)");
      expect(tool(container, "save").title).toBe("Kaydet (Ctrl+S)");

      await startEditing(container);
      type(container, "a\nB\nc\nd\nE\nyeni\n");
      await settle();
      expect(tool(container, "save").disabled, "kaydedilmemiş var").toBe(false);
      fireEvent.click(tool(container, "save"));
      await settle();
      expect(write, "beklemeden").toHaveBeenCalledWith(ROOT, "a.ts", "a\nB\nc\nd\nE\n", "a\nB\nc\nd\nE\nyeni\n");
      expect(tool(container, "save").disabled).toBe(true);

      fireEvent.click(tool(container, "undo"));
      await settle();
      expect(editor(container).value).toBe("a\nB\nc\nd\nE\n");
      expect(tool(container, "redo").disabled).toBe(false);
      fireEvent.click(tool(container, "redo"));
      await settle();
      expect(editor(container).value).toBe("a\nB\nc\nd\nE\nyeni\n");
    });

    it("F4 yazı alanındayken de kapatıyor; Esc önce düzenlemeyi, sonra pencereyi kapatıyor", async () => {
      const { container } = render(<DiffWindow target={{ root: ROOT, path: "a.ts" }} />);
      await settle();
      key({ key: "F4" });
      await settle();
      expect(document.activeElement).toBe(editor(container));
      key({ key: "F4" });
      await settle();
      expect(editor(container)).toBe(null);

      key({ key: "F4" });
      await settle();
      key({ key: "Escape" });
      await settle();
      expect(editor(container)).toBe(null);
      expect(h.close).not.toHaveBeenCalled();
      key({ key: "Escape" });
      expect(h.close).toHaveBeenCalled();
    });

    it("yazı alanına, imlecin SAĞDAKİ satırına odaklanıyor", async () => {
      const viewer = vi.spyOn(api, "mainWindowOpenFile").mockResolvedValue(undefined);
      const { container } = render(<DiffWindow target={{ root: ROOT, path: "a.ts" }} />);
      await settle();
      key({ key: "F7" }); // imleç 5. satırda
      await settle();
      fireEvent.click(pencil(container));
      await settle();
      expect(document.activeElement).toBe(editor(container));
      expect(editor(container).selectionStart).toBe(8);
      expect(viewer).not.toHaveBeenCalled();
    });

    it("birleşik görünümde ve katlanmışken önce yazılabilir görünüme geçiyor", async () => {
      files = ["uzun.ts"];
      const { container, getByTitle } = render(<DiffWindow target={{ root: ROOT, path: "uzun.ts" }} />);
      await settle();
      // Varsayılan zaten daraltılmış.
      expect(container.querySelector(".dw-line.fold")).not.toBe(null);
      fireEvent.click(getByTitle("Birleşik görünüm"));
      await settle();
      expect(editor(container)).toBe(null);
      key({ key: "F4" });
      await settle();
      expect(container.querySelector(".dw-sbs")).not.toBe(null);
      expect(document.activeElement).toBe(editor(container));
      expect(editor(container).selectionStart).toBe(editor(container).value.indexOf("değişti"));
    });

    it("burada yazılamayan dosyayı (çok büyük) ana pencerenin görüntüleyicisinde açıyor", async () => {
      const viewer = vi.spyOn(api, "mainWindowOpenFile").mockResolvedValue(undefined);
      vi.mocked(api.gitDiffSides).mockResolvedValue({
        base: text("a\n"),
        current: { ...text("b\n"), truncated: true },
        head: "1a2b3c4d",
      });
      const { container } = render(<DiffWindow target={{ root: ROOT, path: "a.ts" }} />);
      await settle();
      expect(editor(container)).toBe(null);
      fireEvent.click(pencil(container));
      await settle();
      expect(viewer).toHaveBeenCalledWith("/depo/a.ts");
    });
  });
});
