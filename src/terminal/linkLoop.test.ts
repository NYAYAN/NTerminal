// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Bağlantı renklendirmesi KENDİNİ beslememeli.
 *
 * ## Ölçülen belirti
 *
 * Ekranda tek bir adres duran bir sekme, hiç çıktı gelmezken bile bir
 * çekirdeği doldurmaya yetiyordu: WebContent süreci %100, dokuz saatlik
 * oturumda 6,5 dakika CPU. Pencere örtülünce yük anında sıfıra iniyordu —
 * yani iş çizime bağlıydı, veriye değil.
 *
 * ## Kök neden
 *
 * xterm dekorasyon EKLENİNCE ve SİLİNİNCE tam yenileme yapıyor
 * (`RenderService`: `onDecorationRegistered` / `onDecorationRemoved` →
 * `_fullRefresh`). `refreshLinkHighlight` ise her turda önce hepsini silip
 * yeniden kuruyordu. Zincir kapanıyor:
 *
 *     onRender → 90 ms → sil + kur → tam yenileme → onRender → …
 *
 * Ekranda bir adres olduğu sürece durmuyor; ölçülen hız saniyede ~9 tur. Her
 * turun bedeli taramadan ibaret değil: WebGL tam kare çiziyor, dekorasyon
 * DOM'u yıkılıp kuruluyor ve WebKit bileşik katman ağacını yeniden kuruyor.
 *
 * ## Bu testlerin bağladığı şey
 *
 * Sayaç `registerMarker`: aday satır başına turda bir kez çağrılıyor, yani
 * tek adresli bir ekranda "kaç kez yeniden boyandı" demek. Döngü varken bu
 * sayı zamanla büyüyor; imza kapısıyla ilk boyamada sabitleniyor.
 *
 * İkinci ve üçüncü test kapının yanlış tarafa kapanmadığını bağlıyor: içerik
 * değişince yeniden boyanmalı, ayar değişince de — yoksa belirti sessizce
 * tersine döner ve bağlantılar kalıcı olarak sönük kalır.
 *
 * ## Neden sahte saat
 *
 * Testler gerçek saatle 150 ms bekliyordu ve tam takımda 3 koşunun 1'inde
 * düşüyordu: "içerik değişti ama yeniden boyanmadı: expected 1 to be greater
 * than 1". Boyayı yazmadan sonraki ilk kare (`onRender`) 90 ms'lik
 * zamanlayıcıyla kuruyor; kare yazmadan 60 ms ya da daha geç gelirse
 * zamanlayıcının vadesi beklemenin vadesini geçiyor ve kontrol boyadan önce
 * koşuyor. ÖLÇÜLDÜ (2026-10-13):
 *
 * - Yeniden üretim: yazmanın ardından olay döngüsünü 60 ya da 70 ms tıkamak
 *   iki iletiyi de her koşuda verdi — ikinci pencerede yukarıdaki, birinci
 *   pencerede "ilk adres boyanmadı: expected 0 to be greater than 0"; 40–55
 *   ms tıkamada hiç düşmedi. Eşik tam olarak 150 − 90.
 * - Tam takımda (3 koşu, makine %100 dolu) yazmadan sonraki kare 3–121 ms
 *   sonra geldi, 150 ms'lik bekleme gerçekte 150–249 ms sürdü. Bir koşuda
 *   kare 70 ms gecikti; boya kontrolden 1,1 ms sonra geldi ve test "ilk adres
 *   boyanmadı" diye düştü. Tek başına bile, makine %93–100 doluyken, boyadan
 *   sonra kalan pay 42 ms'ye indi.
 *
 * Artık saat sahte (zamanlayıcılar, `requestAnimationFrame`, `Date`,
 * `performance`): xterm'in yazma kuyruğu, çizim karesi ve erteleme penceresi
 * yalnızca test ilerletince akıyor, her koşuda aynı sırayla. 150 ms
 * gerçekten 150 ms; her yazmanın ardından 70 ms tıkama artık hiçbir testi
 * düşürmüyor. İlk test de keskinleşti: imza kapısı kaldırılınca sayaç 600 ms'de
 * her koşuda tam 6 artıyor; gerçek saatte tur sayısı makinenin hızına
 * bağlıydı (tek başına 5).
 *
 * Kalan tek gerçek süre vitest'in test başına sınırı ve içinde artık yalnızca
 * işlemci işi var (ilk testte xterm'in soğuk kurulumu). İki tam takım aynı
 * anda koşarken ilk test 631–3218 ms sürdü, tek başına ~150 ms. Eski sürüm
 * (750 ms gerçek bekleme dahil) tek tam takımda 4324 ms'ye çıkıyor, iki
 * eşzamanlı takımda 2 koşunun 2'sinde 5 sn'yi aşıyordu. Sınır bu yüzden 30 sn.
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
            return ({ pid: 1, shell: "zsh", integration: true, cwd: "/tmp" });
          })
        : vi.fn(async () => null),
  }),
  onPtyExit: async () => () => {},
}));

const { useStore } = await import("../store/useStore");
const { TerminalSession } = await import("./TerminalSession");

/** jsdom eksikleri; gerekçesi `hiddenTabWork.test.ts` içinde. */
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
    // jsdom canvas bağlamı vermiyor; DOM bu noktada kurulmuş oluyor.
  }
  await s.start(null);
  s.setDisplay(true, true);
  return s;
}

/**
 * Yazma kuyruğu boşalsın. xterm ayrıştırmayı bir zamanlayıcıya bırakıyor;
 * sahte saatte o da ancak saat ilerleyince koşuyor. Ayrıştırma sahte saatte
 * süre tüketmiyor, yani 0 ms yetiyor.
 */
async function flush(s: { term: { write: (data: string, cb: () => void) => void } }) {
  let bitti = false;
  s.term.write("", () => {
    bitti = true;
  });
  await vi.advanceTimersByTimeAsync(0);
  expect(bitti, "yazma kuyruğu boşalmadı").toBe(true);
}

/** Saat `ms` ilerlesin: vadesi gelen kareler ve zamanlayıcılar sırayla ateşleniyor. */
const bekle = (ms: number) => vi.advanceTimersByTimeAsync(ms);

/** Erteleme penceresi 90 ms; birkaç turun sığacağı kadar bekliyoruz. */
const TURLAR = 600;

beforeEach(() => {
  h.reset();
  jsdomEksikleri();
  // Oturum kurulmadan önce: xterm'in kurulumda istediği kare de sahte saatte
  // olmalı. `performance` da sahte, çünkü xterm yazma kuyruğunu
  // `performance.now()` ile 12 ms'lik dilimlere bölüyor. Gerçek kalınca
  // soğuk ilk ayrıştırma dilimi aşıp kalanı bir zamanlayıcıya bırakıyordu;
  // 0 ms ilerletme onu kaçırdı ("yazma kuyruğu boşalmadı", 6 koşuda 1).
  vi.useFakeTimers({
    toFake: [
      "setTimeout",
      "clearTimeout",
      "setInterval",
      "clearInterval",
      "requestAnimationFrame",
      "cancelAnimationFrame",
      "Date",
      "performance",
    ],
  });
});

afterEach(() => {
  vi.useRealTimers();
});

// Süre sınırının gerekçesi başlıkta: "Neden sahte saat"in son paragrafı.
describe("bağlantı renklendirme döngüsü", { timeout: 30_000 }, () => {
  it("ekranda adres dururken kendini yeniden tetiklemiyor", async () => {
    const s = await oturum("l1");
    const marker = vi.spyOn(s.term, "registerMarker");

    h.emit("l1", "sunucu http://localhost:4200/ adresinde\r\n");
    await flush(s);
    await bekle(150);
    const ilkBoyama = marker.mock.calls.length;

    // Buradan sonra HİÇ çıktı yok. Tek başına geçen zaman yeni boyama
    // üretmemeli; üretiyorsa döngü geri gelmiş demektir.
    await bekle(TURLAR);
    const sonra = marker.mock.calls.length;

    expect(ilkBoyama, "adres hiç boyanmadı: test kurulumu tutmuyor").toBeGreaterThan(0);
    expect(
      sonra - ilkBoyama,
      "çıktı yokken yeniden boyandı: sil+kur → tam yenileme → onRender döngüsü geri geldi",
    ).toBe(0);
    void s.dispose(true);
  });

  it("yeni adres gelince yeniden boyanıyor", async () => {
    const s = await oturum("l2");
    const marker = vi.spyOn(s.term, "registerMarker");

    h.emit("l2", "birinci http://localhost:4200/\r\n");
    await flush(s);
    await bekle(150);
    const once = marker.mock.calls.length;

    h.emit("l2", "ikinci http://localhost:4300/\r\n");
    await flush(s);
    await bekle(150);

    expect(once, "ilk adres boyanmadı").toBeGreaterThan(0);
    expect(
      marker.mock.calls.length,
      "içerik değişti ama yeniden boyanmadı: imza kapısı fazla geniş",
    ).toBeGreaterThan(once);
    void s.dispose(true);
  });

  it("ayar değişimi boyayı geri getiriyor", async () => {
    // `applySettings` dekorasyonları söküyor (tema rengi değişmiş olabilir).
    // İmza onunla birlikte düşmezse tazeleme "zaten boyalı" deyip atlar ve
    // bağlantılar kalıcı olarak sönük kalırdı.
    const s = await oturum("l3");
    h.emit("l3", "sunucu http://localhost:4200/ adresinde\r\n");
    await flush(s);
    await bekle(150);

    const marker = vi.spyOn(s.term, "registerMarker");
    // Tema GERÇEKTEN değişiyor: `applySettings` yalnızca değişen kısmı
    // uyguluyor, aynı ayarla çağrı boyaya dokunmuyor.
    const settings = useStore.getState().settings;
    s.applySettings({
      ...settings,
      appearance: { ...settings.appearance, theme: "solarized-light" },
    });
    await bekle(150);

    expect(
      marker.mock.calls.length,
      "ayar sonrası boya geri gelmedi: imza dekorasyonlarla birlikte düşmüyor",
    ).toBeGreaterThan(0);
    void s.dispose(true);
  });
});
