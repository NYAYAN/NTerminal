// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Görünmeyen sekme kare başına iş yapmamalı.
 *
 * ## Ölçülen tasarım sonucu
 *
 * Gizli sekmeler düzenden çıkarılmıyor — `visibility: hidden`, gerekçesi
 * `TerminalArea`da: `display: none` xterm'in ölçüm hesabını sıfırlıyor ve
 * sekmeye dönüldüğünde satırlar kayıyor. Bedeli sessizce iki yere biniyordu:
 *
 *  - `onRender` her çıktı parçasında tetikleniyor ve blok katmanını kare
 *    başına bir kez yeniden çizdiriyordu (React güncellemesi + `blockGeometry`
 *    içinde iki `getBoundingClientRect`, yani zorlanmış yerleşim).
 *  - Bağlantı renklendirmesi 90 ms'de bir görünür satır sayısı kadar
 *    `translateToString` çağırıp dekorasyonları yıkıp yeniden kuruyordu.
 *
 * İkisi de ekranda olmayan bir terminal için. On sekmeli bir pencerede maliyet
 * sekme sayısıyla çarpılıyordu.
 *
 * Bu testler işin GERÇEKTEN kesildiğini ve sekme görünür olunca katmanın bir
 * kez tazelendiğini bağlıyor — tazeleme olmasa bloklar bir sonraki çıktıya
 * kadar eski yerinde kalırdı, sessiz bir sekmede belki hiç.
 */

const h = vi.hoisted(() => {
  const handlers = new Map<string, (bytes: Uint8Array) => void>();
  return {
    handlers,
    emit(id: string, text: string) {
      handlers.get(id)?.(new TextEncoder().encode(text));
    },
    reset() {
      handlers.clear();
    },
  };
});

vi.mock("../lib/ipc", () => ({
  api: new Proxy({} as Record<string, unknown>, {
    get: (_target, prop: string) =>
      prop === "ptySpawn"
        ? vi.fn(async (spec: { id: string }, onData: (bytes: Uint8Array) => void) => {
            h.handlers.set(spec.id, onData);
            return ({
            pid: 1,
            shell: "powershell",
            integration: true,
            cwd: "C:/x",
          });
          })
        : vi.fn(async () => null),
  }),
  onPtyExit: async () => () => {},
}));

const { useStore } = await import("../store/useStore");
const { TerminalSession } = await import("./TerminalSession");

/**
 * jsdom'da xterm'i AÇMAK için gereken iki eksik: `matchMedia` (xterm renk
 * şemasını ondan okuyor) ve `ResizeObserver`. İkisi olmadan `open()` düşüyor,
 * `.xterm-screen` hiç kurulmuyor, `onRender` de hiç tetiklenmiyor — test
 * yanlış yere "geçti" derdi.
 */
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

async function oturum(tabId: string) {
  const s = new TerminalSession({
    tabId,
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
    // jsdom canvas bağlamı vermiyor ("Ctx cannot be null"); DOM bu noktada
    // kurulmuş oluyor, testin ihtiyacı olan da bu.
  }
  await s.start(null);
  return { s, host };
}

/** xterm yazmayı kuyruğa alıyor; ayrıştırma bitince geri çağırıyor. */
const flush = (s: { term: { write: (data: string, cb: () => void) => void } }) =>
  new Promise<void>((resolve) => s.term.write("", () => resolve()));

const kare = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const bekle = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

beforeEach(() => {
  h.reset();
  jsdomEksikleri();
});

describe("gizli sekmede kare başına iş", () => {
  it("gizliyken blok katmanı yeniden çizilmiyor", async () => {
    const { s } = await oturum("t1");
    let cizim = 0;
    s.setBlockListener(() => cizim++);

    s.setDisplay(false, false);
    h.emit("t1", "gizli sekmenin çıktısı\r\n");
    await flush(s);
    await kare();
    await kare();

    expect(cizim, "gizli sekme için katman yine çiziliyor").toBe(0);
    void s.dispose(true);
  });

  it("görünür sekmede çiziliyor", async () => {
    // Kontrol grubu: kapı tümden kapanmış değil, yalnızca gizliyken kapalı.
    const { s } = await oturum("t2");
    let cizim = 0;
    s.setBlockListener(() => cizim++);

    s.setDisplay(true, true);
    cizim = 0;
    h.emit("t2", "görünür sekmenin çıktısı\r\n");
    await flush(s);
    await kare();
    await kare();

    expect(cizim, "görünür sekmede katman hiç çizilmedi").toBeGreaterThan(0);
    void s.dispose(true);
  });

  it("sekme görünür olunca katman bir kez tazeleniyor", async () => {
    const { s } = await oturum("t3");
    s.setDisplay(false, false);
    h.emit("t3", "arka planda biriken çıktı\r\n");
    await flush(s);
    await kare();

    let cizim = 0;
    s.setBlockListener(() => cizim++);
    s.setDisplay(true, true);

    expect(cizim, "sekmeye dönüldü, bloklar eski yerinde kaldı").toBeGreaterThan(0);
    void s.dispose(true);
  });

  it("gizliyken bağlantı dekorasyonu üretilmiyor", async () => {
    const { s } = await oturum("t4");
    const marker = vi.spyOn(s.term, "registerMarker");

    s.setDisplay(false, false);
    h.emit("t4", "sunucu http://localhost:4200/ adresinde\r\n");
    await flush(s);
    await bekle(150);
    const gizliCagri = marker.mock.calls.length;

    s.setDisplay(true, true);
    h.emit("t4", "ikinci satır http://localhost:4300/\r\n");
    await flush(s);
    await bekle(150);

    expect(gizliCagri, "gizli terminalde dekorasyon üretildi").toBe(0);
    expect(
      marker.mock.calls.length,
      "görünür terminalde de üretilmiyor: kapı yanlış yerde kapalı",
    ).toBeGreaterThan(0);
    void s.dispose(true);
  });
});

/**
 * Blok geometrisi yalnızca ÖLÇÜ değişince okunuyor.
 *
 * `getBoundingClientRect` bekleyen DOM değişiklikleri varsa yerleşimi hemen
 * hesaplatıyor ve bu değer kare başına iki kez okunuyordu. Oysa yalnızca
 * yeniden boyutlandırma, `fit` ve yazı tipi/boyut değişimiyle değişiyor.
 */
describe("blok geometrisi", () => {
  it("ölçü değişmedikçe yeniden okunmuyor", async () => {
    const { s } = await oturum("t5");
    const gercek = Element.prototype.getBoundingClientRect;
    let okuma = 0;
    Element.prototype.getBoundingClientRect = function () {
      okuma++;
      return {
        top: 10,
        left: 0,
        right: 800,
        bottom: 410,
        width: 800,
        height: 400,
        x: 0,
        y: 10,
        toJSON: () => ({}),
      } as DOMRect;
    };
    try {
      const baslangic = okuma;
      const ilk = s.blockGeometry();
      const ilkOkuma = okuma - baslangic;
      const ikinci = s.blockGeometry();
      const ikinciOkuma = okuma - baslangic - ilkOkuma;

      expect(ilk, "geometri okunamadı: taklit dikdörtgen tutmuyor").not.toBe(null);
      expect(ilkOkuma, "ilk okuma kapsayıcı + ekran = iki dikdörtgen").toBe(2);
      expect(ikinciOkuma, "ikinci çağrı yerleşimi yine zorluyor").toBe(0);
      expect(ikinci).toEqual(ilk);

      // Yazı tipi/boyut değişimi ölçüyü geçersiz kılıyor. Değişiklik GERÇEK
      // olmalı: `applySettings` artık yalnızca değişen kısmı uyguluyor ve aynı
      // ayarla çağrı ölçüye dokunmuyor (aşağıdaki "ilgisiz ayar" testi).
      const settings = useStore.getState().settings;
      s.applySettings({
        ...settings,
        appearance: { ...settings.appearance, fontSize: settings.appearance.fontSize + 1 },
      });
      const oncekiOkuma = okuma;
      s.blockGeometry();
      expect(
        okuma - oncekiOkuma,
        "ayar değişti, geometri hâlâ eski önbellekten geliyor",
      ).toBeGreaterThan(0);
    } finally {
      Element.prototype.getBoundingClientRect = gercek;
    }
    void s.dispose(true);
  });

  /*
   * İlgisiz ayar terminale iş çıkarmıyor.
   *
   * Depo HER ayar değişikliğinde bütün oturumlara `applySettings` çağırıyor:
   * profil adına yazılan tek bir harf de dahil. Önceki hâli her çağrıda ölçüyü
   * sıfırlayıp yeniden sığdırıyor, bağlantı boyasını söküp yeniden tarıyor ve
   * sekmenin çıktısını "kaydedilmedi" işaretliyordu — bir sonraki kayıtta
   * BÜTÜN sekmelerin çıktısı yeniden diske yazılıyordu.
   */
  it("ilgisiz bir ayar ölçüye ve kayıt işaretine dokunmuyor", async () => {
    const { s } = await oturum("t5b");
    const settings = useStore.getState().settings;
    s.applySettings({
      ...settings,
      behavior: { ...settings.behavior, checkUpdates: !settings.behavior.checkUpdates },
    });
    s.markOutputSaved();
    const gercek = Element.prototype.getBoundingClientRect;
    let okuma = 0;
    Element.prototype.getBoundingClientRect = function () {
      okuma++;
      return {
        top: 10,
        left: 0,
        right: 800,
        bottom: 410,
        width: 800,
        height: 400,
        x: 0,
        y: 10,
        toJSON: () => ({}),
      } as DOMRect;
    };
    try {
      s.blockGeometry();
      const once = okuma;
      // Profil adı gibi: terminalin hiçbir şeyini değiştirmeyen bir ayar.
      s.applySettings({ ...settings, defaultProfileId: "baska" });
      s.blockGeometry();
      expect(okuma - once, "ilgisiz ayar ölçüyü geçersiz kıldı").toBe(0);
      expect(s.hasUnsavedOutput(), "ilgisiz ayar çıktıyı kaydedilmemiş işaretledi").toBe(false);
    } finally {
      Element.prototype.getBoundingClientRect = gercek;
    }
    void s.dispose(true);
  });
});

/**
 * Ekran çıktısı yalnızca DEĞİŞTİYSE diske yazılıyor.
 *
 * `flushAllState` iki dakikada bir de koşuyor ve her sekme için `serialize()`
 * çağırmak on sekmede on kez 2000 satırın metne çevrilmesi demek.
 */
describe("kaydedilecek çıktı işareti", () => {
  it("yeni çıktı gelmeden kaydedilecek bir şey yok", async () => {
    const { s } = await oturum("t6");
    s.markOutputSaved();
    expect(s.hasUnsavedOutput()).toBe(false);

    h.emit("t6", "yeni çıktı\r\n");
    await flush(s);
    expect(s.hasUnsavedOutput(), "çıktı geldi, işaret kalkmadı").toBe(true);

    s.markOutputSaved();
    expect(s.hasUnsavedOutput()).toBe(false);
    void s.dispose(true);
  });
});
