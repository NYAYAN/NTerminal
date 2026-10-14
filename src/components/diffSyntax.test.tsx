// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, vi } from "vitest";

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
import { GRAMMARS } from "../lib/syntaxGrammars";
import { createSyntaxService, type SyntaxReply } from "../lib/syntaxService";
import { zincirKorumasi } from "../test/timeoutChain";
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
 *
 * ## Saat sahte, süre sınırı 30 sn, zincir koruması
 *
 * KIRILGANDI (2026-10-13): iki tam takım + 16 dönen iş parçacığı koşarken
 * (147 sn'lik ağır tur, makine %100) dört testin dördü iki takımda da "Test
 * timed out in 5000ms" ile düştü. Yalnızca ilki gerçekten yavaştı (6218 ve
 * 5901 ms); öteki üçü 5017–5073 ms'de bırakılan ilk testin yüzünden düştü:
 * vitest zaman aşımında testi durdurmuyor, `until`i 15 sn'lik kendi sınırına
 * kadar act'le yoklamayı sürdürüp sökümün ve sonraki testlerin act'leriyle
 * çakıştı (iki takımın çıktısında bu dosyadan 1288 ve 1185 "overlapping act"
 * uyarısı). ÖLÇÜLDÜ (2026-10-14, 16 mantıksal çekirdek; adım adım duvar saati,
 * sürecin işlemci süresi ve olay döngüsünün boşta geçen süresi test içinden):
 *
 * - Süre çoğunlukla işlemci işi: her test kendi renklendiricisini (soğuk
 *   motor) kuruyor, ilk test ayrıca ilk çizimi ve gramerin içe aktarılmasını
 *   ödüyor. İlk test tek başına 208–228 ms; aynı tarifle iki ağır turda
 *   (157'şer sn, makine %99–100) 3314–4869 ms duvar / 812–891 ms işlemci,
 *   renklendiricinin dilimleri 1840–2791 ms duvar.
 * - Gerisi gerçek bekleme: `until`in 10 ms'lik yoklaması ve renklendiricinin
 *   sıfır gecikmeli zamanlayıcıları. Olay döngüsü tek başınayken 22–45 ms,
 *   ağır turlarda 0–146 ms boşta (üçüncü testte 187–224 ms). Yükte testler
 *   saniyelerce sürünce pencerenin kendi saatleri de (400 ms'lik kayıt, 500
 *   ms'lik canlı yoklama) test ortasında çalışabiliyordu.
 *
 * Bu yüzden saat sahte (setTimeout/setInterval, Date; React'in kullandığı
 * setImmediate gerçek) ve çizimden önce kuruluyor: renklendiricinin dilimleri
 * ve yanıtları yalnızca `until` ilerletince akıyor, `until`in sınırı da sahte
 * zamanda. Sahte zamanın süremediği tek bekleme gramer modülünün ilk içe
 * aktarılması (gerçek G/Ç; ağır turlarda 36–302 ms): `until`in sahte 15 sn'si
 * gerçekte 0,1–0,5 sn sürdüğü için ona yetmeyebilirdi, modül bu yüzden saat
 * kurulmadan önce `beforeAll`da yükleniyor. Kalan işlemci işine sınır 30 sn,
 * ölçülen en kötünün (6218 ms) ~5 katı. Testler `zincirKorumasi`nın `it`inden
 * geçiyor: zaman aşımına düşen test bir sonraki `adim`da duruyor, söküm onu
 * bekliyor. Kasıtlı üretildi: ilk teste 50 ms'lik sınır verilince korumasız
 * dosyada üç koşunun üçünde 4/4 test düştü, korumalı dosyada 1/4. Sahte saatle
 * ilk test tek başına 176–181 ms ve olay döngüsü hiç boşta değil; ağır turda
 * 3938–3985 ms.
 */

/** Gerekçe başlıkta: "Saat sahte, süre sınırı 30 sn, zincir koruması". */
const { it, adim, birakilaniBekle } = zincirKorumasi(30_000);

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

/**
 * Süreç içi renklendirici. Her test kendi hizmetini, yani soğuk bir motor
 * kuruyor: ilk satır, ifadeler derlenirken renkleniyor. Satırın süre sınırı
 * yok (son argüman 0, bkz. `syntaxDocument.ts`): sınır gerçek saate bakıyor.
 * ÖLÇÜLDÜ (2026-10-13, tam takım ×3): "yan yana"nın ilk satırı üç koşunun
 * üçünde ilk denemede kesildi (531–544 ms), birinde 2 belirteçte. Satır öyle
 * kalsa değişen sözcük `isim` renksiz olur, "değişen sözcük renksiz kaldı"
 * düşerdi; o koşuda ikinci deneme bitirdi. Tek başına en çok 352 ms.
 */
function inProcessHost(): SyntaxHost {
  let receive: (reply: SyntaxReply) => void = () => {};
  const handle = createSyntaxService(
    (reply) => setTimeout(() => receive(structuredClone(reply)), 0),
    undefined,
    0, // satırın süre sınırı yok
  );
  return { post: (request) => handle(structuredClone(request)), listen: (fn) => (receive = fn) };
}

// Gramerin modülü gerçek saatle, bir kez (bkz. başlık).
beforeAll(async () => {
  await GRAMMARS.typescript();
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
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

afterEach(async () => {
  await birakilaniBekle();
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  setSyntaxHost(undefined);
});

/** Koşul sağlanana kadar sahte saati ilerletir; sınır da sahte zamanda. */
async function until(check: () => unknown, ms = 15_000) {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error("zaman aşımı");
    await adim(() => vi.advanceTimersByTimeAsync(10));
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
