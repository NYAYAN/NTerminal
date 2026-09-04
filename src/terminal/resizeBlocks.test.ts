// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Kap yeniden boyutlandığında blok katmanı KOŞULSUZ tazeleniyor.
 *
 * ## Ölçülen hata
 *
 * Sağ panel açılıp kapanınca terminalin son satırlarında eski blok başlıkları
 * (dizin rozeti, süre rozeti) yanlış satıra çizili kalıyor ve `ls` gibi statik
 * bir çıktının üstüne biniyordu. Kaydırınca düzeliyordu — yani veri değil,
 * katmanın SON çizimi eskiydi.
 *
 * ## Kök neden
 *
 * Katman kendini xterm'in `onRender`ına bağlı tazeliyor. Panel aç-kapa net
 * boyut değişimini sıfıra indirdiğinde `safeFit` satır/sütun aynı kaldığı için
 * erken dönüyor: `fit` yok, `onRender` yok, katmanı yeniden çizen kimse yok.
 * Ama genişlik değişti ve geometri önbelleği düştü, dolayısıyla katman eski
 * geometriyle ekranda kalıyor.
 *
 * Bu test tam o durumu kuruyor: jsdom'da kabın ölçüsü sıfır olduğu için
 * `safeFit` ETKİSİZ (erken dönüyor). Yine de `onContainerResize` blok
 * dinleyicisini çağırmalı. Çağırmazsa hata geri gelmiş demektir.
 */

vi.mock("../lib/ipc", () => ({
  api: new Proxy({} as Record<string, unknown>, {
    get: () => vi.fn(async () => null),
  }),
  onPtyData: async () => () => {},
  onPtyExit: async () => () => {},
}));

const { useStore } = await import("../store/useStore");
const { TerminalSession } = await import("./TerminalSession");

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

function oturum() {
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
  document.body.appendChild(host);
  try {
    s.attach(host);
  } catch {
    // jsdom canvas bağlamı vermiyor ("Ctx cannot be null"); `attach` yine de
    // `this.container`ı kuruyor ve testin ölçtüğü yeniden boyutlandırma yolu
    // ona dayanıyor.
  }
  return s;
}

beforeEach(() => {
  jsdomEksikleri();
});

describe("yeniden boyutlandırmada blok katmanı", () => {
  it("fit ETKİSİZ olsa da katmanı yeniden çizdiriyor", () => {
    const s = oturum();
    const redraw = vi.fn();
    s.setBlockListener(redraw);

    // jsdom kabının ölçüsü sıfır → `safeFit` erken dönüyor (hatanın çıktığı
    // koşulun ta kendisi). Yine de katman haberdar edilmeli.
    (s as unknown as { onContainerResize(): void }).onContainerResize();

    expect(redraw, "yeniden boyutlandırma katmanı tazelemedi").toHaveBeenCalled();
    void s.dispose(false);
  });

  it("dinleyici kaldırıldıysa sessizce geçiyor", () => {
    // Katman sökülünce (sekme kapanınca) dinleyici null; yeniden boyutlandırma
    // patlamamalı.
    const s = oturum();
    s.setBlockListener(null);
    expect(() =>
      (s as unknown as { onContainerResize(): void }).onContainerResize(),
    ).not.toThrow();
    void s.dispose(false);
  });
});
