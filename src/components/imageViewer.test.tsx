// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { act, cleanup, configure, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLanguage } from "../lib/i18n";
import { api } from "../lib/ipc";
import { setPlatform } from "../lib/platform";
import { sessions, useStore } from "../store/useStore";
import type { DirEntry, Group, TabState } from "../types";
import { FilePanel } from "./FilePanel";
import { ImageViewer } from "./ImageViewer";

/**
 * Görsel önizlemesi.
 *
 * İSTEK: "dosyalardan png tıkladığımda görsel olarak göremiyorum."
 * Görüntüleyici her dosyayı metin olarak okuyup PNG'ye "ikili dosya" diyordu.
 * Buradaki testler kullanıcının gördüğünü bağlıyor: görsel `data:` adresiyle
 * çiziliyor (CSP `blob:` tanımıyor), büyük görsel sığdırılıyor ama küçük
 * BÜYÜTÜLMÜYOR, ölçek başlıkta yazılı, sınırlar ve hatalar söyleniyor.
 */

configure({ asyncUtilTimeout: 3000 });

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

function seed(ui: Partial<ReturnType<typeof useStore.getState>["ui"]> = {}) {
  const state = useStore.getState();
  useStore.setState({
    ready: true,
    groups: [group()],
    activeGroupId: "g1",
    ui: { ...state.ui, treeOpen: true, viewerPath: null, viewerReveal: null, treeExpanded: [], ...ui },
  });
}

const AGAC: Record<string, DirEntry[]> = {
  [CWD]: [
    { name: "logo.png", dir: false },
    { name: "icon.svg", dir: false },
    { name: "a.ts", dir: false },
  ],
};

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>';

/** Görselin ölçüsünü ve alanın ölçüsünü ver, `load`u ateşle (jsdom resim çözmüyor). */
async function yukle(container: HTMLElement, w: number, h: number, area: [number, number] = [0, 0]) {
  const body = container.querySelector<HTMLElement>(".image-body")!;
  Object.defineProperty(body, "clientWidth", { value: area[0], configurable: true });
  Object.defineProperty(body, "clientHeight", { value: area[1], configurable: true });
  const img = await waitFor(() => {
    const el = container.querySelector<HTMLImageElement>(".image-stage img");
    expect(el).not.toBe(null);
    return el!;
  });
  Object.defineProperty(img, "naturalWidth", { value: w, configurable: true });
  Object.defineProperty(img, "naturalHeight", { value: h, configurable: true });
  await act(async () => {
    fireEvent.load(img);
  });
  return img;
}

const info = (c: HTMLElement, name: string) => c.querySelector(`.viewer-size[data-info="${name}"]`)?.textContent;
const zoom = (c: HTMLElement) => c.querySelector<HTMLButtonElement>('button[data-tool="zoom"]');

beforeEach(() => {
  setLanguage("tr");
  setPlatform("windows");
});

afterEach(() => {
  cleanup();
  sessions.clear();
  vi.restoreAllMocks();
});

describe("görsel görüntüleyici", () => {
  it("PNG `data:` adresiyle çiziliyor, düzenleme araçları yok", async () => {
    // CSP görsellere `'self'`, `asset:` ve `data:` dışında kaynak tanımıyor:
    // `blob:` geliştirmede çalışıp üretimde boş çıkardı.
    vi.spyOn(api, "readImageFile").mockResolvedValue({ data: "iVBORw0K", size: 2048 });
    const { container } = render(<ImageViewer path={`${CWD}/img/logo.png`} root={CWD} />);
    const img = await yukle(container, 1200, 800);
    expect(img.getAttribute("src")).toBe("data:image/png;base64,iVBORw0K");
    expect(container.querySelector(".viewer-name")?.textContent).toBe("logo.png");
    expect(container.querySelector(".viewer-dir")?.textContent).toBe("img");
    expect(info(container, "dims")).toBe("1200 × 800");
    expect(container.textContent).toContain("2.0 KB");
    // Metin görüntüleyicisinin kalemi, geri alması ve kaydı burada anlamsız.
    expect(container.querySelector('[data-tool="edit"], [data-tool="save"]')).toBe(null);
  });

  it("büyük görsel sığdırılıyor, ölçek başlıkta; tıklayınca gerçek boyut", async () => {
    vi.spyOn(api, "readImageFile").mockResolvedValue({ data: "AA==", size: 1 });
    const { container } = render(<ImageViewer path={`${CWD}/big.png`} />);
    // Alan 632×432, dolgu 16: kullanılabilir 600×400 → 1200×800 görsel %50.
    const img = await yukle(container, 1200, 800, [632, 432]);
    expect(info(container, "zoom")).toBe("%50");
    expect(container.querySelector(".image-stage.fit")).not.toBe(null);
    expect(img.dataset.zoom).toBe("in");
    expect(zoom(container)?.title).toBe("Gerçek boyut");

    await act(async () => {
      fireEvent.click(img);
    });
    expect(container.querySelector(".image-stage.actual")).not.toBe(null);
    expect(info(container, "zoom")).toBe("%100");
    expect(zoom(container)?.title).toBe("Sığdır");

    await act(async () => {
      fireEvent.click(zoom(container)!);
    });
    expect(container.querySelector(".image-stage.fit")).not.toBe(null);
  });

  it("küçük görsel BÜYÜTÜLMÜYOR ve geçiş düğmesi yok", async () => {
    // 16 piksellik bir simgeyi alanı dolduracak kadar büyütmek onu bulanık
    // bir lekeye çevirirdi; basınca bir şey değiştirmeyecek düğme de gürültü.
    vi.spyOn(api, "readImageFile").mockResolvedValue({ data: "AA==", size: 1 });
    const { container } = render(<ImageViewer path={`${CWD}/favicon.ico`} />);
    const img = await yukle(container, 16, 16, [632, 432]);
    expect(info(container, "zoom")).toBe("%100");
    expect(zoom(container)).toBe(null);
    expect(img.dataset.zoom).toBe(undefined);
    await act(async () => {
      fireEvent.click(img);
    });
    expect(container.querySelector(".image-stage.fit"), "küçük görselde tıklama kipi değiştirdi").not.toBe(null);
  });

  it("çok büyük görsel boyutuyla SÖYLENİYOR", async () => {
    vi.spyOn(api, "readImageFile").mockRejectedValue("too-large:31457280");
    const { container } = render(<ImageViewer path={`${CWD}/scan.tiff`} />);
    await waitFor(() =>
      expect(container.querySelector('[role="alert"]')?.textContent).toBe(
        "Görsel çok büyük (30.0 MB) — 20 MB'a kadar olanlar önizleniyor",
      ),
    );
  });

  it("çizilemeyen biçim sessizce boş kalmıyor", async () => {
    // Örnek: Windows'ta (WebView2) HEIC, ya da adı `.png` olup içi bozuk dosya.
    vi.spyOn(api, "readImageFile").mockResolvedValue({ data: "bozuk", size: 5 });
    const { container } = render(<ImageViewer path={`${CWD}/photo.heic`} />);
    const img = await waitFor(() => {
      const el = container.querySelector<HTMLImageElement>(".image-stage img");
      expect(el).not.toBe(null);
      return el!;
    });
    await act(async () => {
      fireEvent.error(img);
    });
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "Görsel gösterilemedi — biçimi burada desteklenmiyor olabilir",
    );
  });

  it("× yalnızca dosyayı kapatıyor", async () => {
    seed({ viewerPath: `${CWD}/logo.png` });
    vi.spyOn(api, "readImageFile").mockResolvedValue({ data: "AA==", size: 1 });
    const { container } = render(<ImageViewer path={`${CWD}/logo.png`} />);
    fireEvent.click(container.querySelector(".viewer-close")!);
    expect(useStore.getState().ui.viewerPath).toBe(null);
    expect(useStore.getState().ui.treeOpen).toBe(true);
  });
});

describe("dosya panelinde görseller", () => {
  beforeEach(() => {
    vi.spyOn(api, "listEntries").mockImplementation(async (p: string) => AGAC[p] ?? []);
    vi.spyOn(api, "readImageFile").mockResolvedValue({ data: "AA==", size: 1 });
    vi.spyOn(api, "readTextFile").mockImplementation(async (p: string) =>
      p.endsWith(".svg") ? { text: SVG, binary: false, truncated: false, size: SVG.length } : null,
    );
  });

  const satir = (c: HTMLElement, ad: string) =>
    [...c.querySelectorAll<HTMLElement>(".tree-row")].find((el) => el.textContent?.trim() === ad);

  it("ağaçta PNG'ye tıklamak görseli açıyor, metin olarak okumuyor", async () => {
    seed();
    const { container } = render(<FilePanel />);
    await waitFor(() => expect(satir(container, "logo.png")).not.toBe(undefined));
    await act(async () => {
      fireEvent.click(satir(container, "logo.png")!);
    });
    await waitFor(() => expect(container.querySelector(".file-viewer-pane .image-stage img")).not.toBe(null));
    expect(api.readImageFile).toHaveBeenCalledWith(`${CWD}/logo.png`);
    expect(api.readTextFile, "görsel metin olarak okundu").not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("İkili dosya");
  });

  it("SVG önizlemeyle açılıyor; kaynak ile önizleme arasında geçiliyor", async () => {
    seed({ viewerPath: `${CWD}/icon.svg` });
    const { container } = render(<FilePanel />);
    await waitFor(() => expect(container.querySelector(".image-stage img")).not.toBe(null));
    expect(container.querySelector(".image-stage img")?.getAttribute("src")).toMatch(/^data:image\/svg\+xml;base64,/);

    await act(async () => {
      fireEvent.click(container.querySelector('button[data-tool="source"]')!);
    });
    await waitFor(() => expect(container.querySelector(".viewer-code")).not.toBe(null));
    expect(container.querySelector(".viewer-code")?.textContent).toContain("<svg");
    // Kaynak metin: düzenlenebiliyor.
    expect(container.querySelector('button[data-tool="edit"]')).not.toBe(null);

    await act(async () => {
      fireEvent.click(container.querySelector('button[data-tool="preview"]')!);
    });
    await waitFor(() => expect(container.querySelector(".image-stage img")).not.toBe(null));
  });

  it("içerik aramasından açılan SVG doğrudan KAYNAKTA (eşleşme bir satırda)", async () => {
    seed();
    const { container } = render(<FilePanel />);
    await act(async () => {
      useStore.getState().openFile(`${CWD}/icon.svg`, { line: 1, col: 1, len: 3 });
    });
    await waitFor(() => expect(container.querySelector(".viewer-line.hit .viewer-mark")).not.toBe(null));
    expect(container.querySelector(".image-stage")).toBe(null);
    // Önizlemeye geçilebiliyor; aynı dosyada yeni bir eşleşme yine kaynağı açıyor.
    await act(async () => {
      fireEvent.click(container.querySelector('button[data-tool="preview"]')!);
    });
    await waitFor(() => expect(container.querySelector(".image-stage img")).not.toBe(null));
    await act(async () => {
      useStore.getState().openFile(`${CWD}/icon.svg`, { line: 1, col: 5, len: 3 });
    });
    await waitFor(() => expect(container.querySelector(".viewer-code")).not.toBe(null));
  });
});

describe("kaynaktaki kurallar", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

  it("CSP `data:` görsellerine izin veriyor", () => {
    /*
     * Önizleme görseli `data:` adresiyle çiziyor (bkz. `ImageViewer`). Bu izin
     * CSP'den düşerse geliştirmede (Vite, CSP yok) her şey çalışır, ÜRETİM
     * derlemesinde görseller sessizce boş kalırdı — yalnızca kurulu sürümde
     * görülen bir hata.
     */
    const conf = JSON.parse(read("src-tauri/tauri.conf.json"));
    const csp: string = conf.app.security.csp;
    const img = csp.split(";").map((d) => d.trim()).find((d) => d.startsWith("img-src"));
    expect(img, "CSP'de img-src yok").toBeDefined();
    expect(img!.split(/\s+/), "img-src data: içermiyor").toContain("data:");
  });

  it("sığdırma küçük görseli BÜYÜTMÜYOR", () => {
    // `max-*` ile: alandan büyük görsel küçülüyor, küçüğü kendi boyunda
    // kalıyor. `width: 100%` ya da `object-fit` bir simgeyi bulanık bir lekeye
    // büyütürdü (jsdom CSS uygulamadığı için kural kaynaktan).
    const css = read("src/styles/global.css");
    const at = css.indexOf(".image-stage.fit img {");
    expect(at, "sığdırma kuralı yok").toBeGreaterThan(-1);
    const body = css.slice(at, css.indexOf("}", at));
    expect(body).toMatch(/max-width:\s*100%/);
    expect(body).toMatch(/max-height:\s*100%/);
    expect(body, "sığdırma görseli büyütüyor").not.toMatch(/(^|[^-])width:|object-fit/);
  });
});
