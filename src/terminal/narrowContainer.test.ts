// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Kap PTY'nin alt sınırının altına daraldığında terminal boyutlandırılmıyor.
 *
 * BİLDİRİLEN BELİRTİ: istem ikişer harflik parçalara bölünüp ekranda
 * kalıyordu. Kural `lib/ptySize.ts`de ve orada test ediliyor; bu dosya
 * `safeFit`in o kurala gerçekten uyduğunu bağlıyor — xterm de PTY de son
 * geçerli ölçüde kalmalı. Biri yalnızca birini atlarsa (ör. xterm'i
 * boyutlandırıp PTY'ye haber vermezse) iki taraf yine ayrışır.
 */

const { ptyResize } = vi.hoisted(() => ({ ptyResize: vi.fn(async () => {}) }));

vi.mock("../lib/ipc", () => ({
  api: new Proxy({} as Record<string, unknown>, {
    get: (_target, key) => (key === "ptyResize" ? ptyResize : vi.fn(async () => null)),
  }),
  onPtyData: async () => () => {},
  onPtyExit: async () => () => {},
}));

const { useStore } = await import("../store/useStore");
const { TerminalSession } = await import("./TerminalSession");

type Inside = {
  term: { cols: number; rows: number; resize(cols: number, rows: number): void };
  fit: { proposeDimensions(): { cols: number; rows: number } | undefined; fit(): void };
  spawned: boolean;
  onContainerResize(): void;
};

/** jsdom'da xterm'in `open()` çağrısı için gereken iki eksik. */
function jsdomEksikleri() {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  (window as unknown as { matchMedia: unknown }).matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

/**
 * Kabuğu çalışan, kabı ölçülebilir bir oturum.
 *
 * jsdom kabın ölçüsünü sıfır veriyor ve `safeFit` o durumda en baştan dönüyor;
 * burada kap ölçülü olmalı ki karar FitAddon'ın önerisine kalsın. Öneri de
 * elle veriliyor: jsdom'da hücre ölçüsü yok.
 */
function oturum(onerilen: { cols: number; rows: number }) {
  const s = new TerminalSession({
    tabId: "t1",
    groupId: "g1",
    profileId: "p1",
    cwd: null,
    env: {},
    settings: useStore.getState().settings,
    windowsBuild: 22000,
    restoreScrollback: false,
  });
  const host = document.createElement("div");
  Object.defineProperty(host, "clientWidth", { value: 40 });
  Object.defineProperty(host, "clientHeight", { value: 600 });
  document.body.appendChild(host);
  try {
    s.attach(host);
  } catch {
    // jsdom canvas bağlamı vermiyor; `attach` yine de `this.container`ı kuruyor.
  }
  const ic = s as unknown as Inside;
  ic.spawned = true;
  ic.fit.proposeDimensions = () => onerilen;
  ic.fit.fit = vi.fn(() => ic.term.resize(onerilen.cols, onerilen.rows));
  return { s, ic };
}

beforeEach(() => {
  jsdomEksikleri();
  ptyResize.mockClear();
});

describe("dar kapta boyutlandırma", () => {
  it("2 sütunluk öneride ne xterm ne PTY değişiyor", () => {
    // Hatanın ölçüsü: FitAddon'ın tabanı 2 sütun, Rust'unki 10.
    const { s, ic } = oturum({ cols: 2, rows: 30 });
    const once = { cols: ic.term.cols, rows: ic.term.rows };

    ic.onContainerResize();

    expect(ic.fit.fit).not.toHaveBeenCalled();
    expect(ptyResize).not.toHaveBeenCalled();
    expect({ cols: ic.term.cols, rows: ic.term.rows }).toEqual(once);
    void s.dispose(false);
  });

  it("geçerli öneride ikisi de aynı ölçüye geçiyor", () => {
    const { s, ic } = oturum({ cols: 120, rows: 30 });

    ic.onContainerResize();

    expect(ic.fit.fit).toHaveBeenCalledTimes(1);
    expect(ptyResize).toHaveBeenCalledWith("t1", 120, 30);
    void s.dispose(false);
  });
});
