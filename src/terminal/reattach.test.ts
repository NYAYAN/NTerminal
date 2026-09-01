// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Terminal ikinci kez bağlanabilmeli.
 *
 * ## Ölçülen hata
 *
 * İlk grupta `ng serve` çalışırken yeni bir grup açmak, ilk grubun terminalini
 * BOŞALTIYORDU: yazılanlar da, çalışan komutun çıktısı da ekrandan gidiyordu.
 * Kabuk arkada yaşamaya devam ettiği için "silinmiş" gibi görünüyordu, oysa
 * hiçbir şey silinmemişti — ekran taşınmamıştı.
 *
 * Zincir: yeni grubun bir çizim boyunca sekmesi yok → `TerminalArea` "hiç
 * sekme yok" kutusuna dönüp BÜTÜN barındırıcıları söküyor → React yenilerini
 * kurunca `attach` yeniden çağrılıyor → eskiden orada `term.open()` vardı ve
 * xterm ikinci çağrıda hiçbir şey yapmıyor:
 *
 *     open(e) { …; if (this.element?.ownerDocument.defaultView && this._coreBrowserService) return; … }
 *
 * Sonuç: terminalin düğümü ağaçtan kopmuş eski kabın içinde kalıyor, yeni kap
 * boş duruyordu.
 *
 * İki yerden birden bağlandı: `TerminalArea` artık alanı sökmüyor (o testi
 * `components/emptyGroup.test.tsx` tutuyor) ve `attach` düğümü TAŞIYOR. İkinci
 * savunma bilinçli: barındırıcıyı yeniden kuran başka bir yol çıkarsa belirti
 * yine sessiz bir boş ekran olurdu.
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

function kap() {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
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
  const host = kap();
  try {
    s.attach(host);
  } catch {
    // jsdom canvas bağlamı vermiyor ("Ctx cannot be null"); xterm'in DOM'u bu
    // noktada kurulmuş oluyor ve testin baktığı şey o.
  }
  return { s, host };
}

beforeEach(() => {
  jsdomEksikleri();
});

describe("terminalin yeniden bağlanması", () => {
  it("ilk bağlamada terminal kabın içinde", () => {
    const { s, host } = oturum();
    expect(s.term.element, "xterm hiç açılmamış").not.toBe(undefined);
    expect(host.contains(s.term.element!), "terminal ilk kapta değil").toBe(true);
    void s.dispose(false);
  });

  it("ikinci kapa TAŞINIYOR, yeniden açılmıyor", () => {
    const { s } = oturum();
    const el = s.term.element!;

    const yeni = kap();
    s.attach(yeni);

    // Asıl iddia: aynı düğüm, yeni kapta. Yeni bir düğüm kurulsaydı tampon ve
    // kaydırma konumu eskisinde kalır, kullanıcı boş bir terminal görürdü.
    expect(s.term.element, "yeni bir terminal düğümü kuruldu").toBe(el);
    expect(yeni.contains(el), "terminal yeni kaba taşınmadı").toBe(true);
    void s.dispose(false);
  });

  it("aynı kapla ikinci çağrı hiçbir şey yapmıyor", () => {
    // React her çizimde `attach` çağırabilir; kap değişmediyse düğümü yerinden
    // oynatmak boşuna DOM işi ve odağı düşürüyor.
    const { s, host } = oturum();
    const el = s.term.element!;
    s.attach(host);
    expect(s.term.element).toBe(el);
    expect(host.contains(el)).toBe(true);
    void s.dispose(false);
  });
});
