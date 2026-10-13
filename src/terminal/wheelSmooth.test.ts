// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tekerlek kaydırmasını oturum mu, xterm mi yapıyor.
 *
 * Oturum ana tamponda tekerleği yakalayıp karelere yayıyor (gerekçe ve ölçüm
 * `lib/wheelScroll.ts` başında). Yanlış yerde yakalamak sessiz bir gerileme
 * olurdu: vim/less'te tekerlek ok tuşuna çevrilmez, fareyi isteyen programa
 * tekerlek gitmez, Ctrl+tekerlek kaydırırdı. Bu testler devralmanın YALNIZCA
 * ana tamponda ve sade tekerlekte olduğunu, bekleyen hareketin de "en alta
 * in" ve yazıyla kesildiğini bağlıyor.
 *
 * jsdom'da xterm görünümü gerçekten kaydıramıyor (hücre yüksekliği 0);
 * `scrollLines` taklit ediliyor ve oturumun ondan İSTEDİĞİ satırlar sayılıyor.
 *
 * KARELERİ TEST SÜRÜYOR. KIRILGANDI (2026-10-13 ölçüldü): "çentik ilk karede
 * başlıyor…" tam takımda 3 koşunun 2'sinde "bir karede birden fazla satır
 * atladı: expected -2 to be -1" ile düşüyordu. Kareler jsdom'un gerçek
 * `requestAnimationFrame`'inden geliyordu — Node'da 16,7 ms'lik bir
 * `setInterval` — ve oturum adımı GEÇEN SÜREYE göre atıyor: geciken kare
 * aradaki mesafeyi bir seferde kapatıyor (bkz. `WheelScroller.step`). İzle
 * ölçülen 18 koşu (11 tek başına, 7 tam takım): kare aralığı p50 25 ms, p90
 * 35 ms, en çok 74 ms. Düşen koşuda (iki tam takım aynı anda) olaydan sonraki
 * 2. kare öncekinden 73,9 ms sonra geldi ve iki satır kaydırdı: adımlar
 * [-1, 0, -2]. Eşik 2. karede 53,4 ms, 3. karede 35,9 ms (bir koşuda 35,7 ms
 * ölçüldü); sahte karelerle aynı ileti birebir çıktı, eşiğin 0,1 ms altı
 * geçiyor.
 *
 * Bir tuhaflık daha: jsdom'da rAF'ın zaman damgası pencerenin açıldığı andan,
 * oturumun `performance.now()`u sürecin başından sayıyor; ilk karenin süresi
 * eksi çıkıyor (-570…-11.600 ms) ve 4 ms'ye kırpılıyordu. Tarayıcıda ikisi
 * aynı saat.
 *
 * Şimdi kareler 1000/60 ms arayla, `performance.now()` ile AYNI sahte saatten
 * geliyor ve yalnızca test ilerletince akıyor: her koşu aynı adımları izliyor,
 * sonuç makinenin yüküne bağlı değil.
 */

const h = vi.hoisted(() => {
  const handlers = new Map<string, (bytes: Uint8Array) => void>();
  return {
    handlers,
    emit(id: string, text: string) {
      handlers.get(id)?.(new TextEncoder().encode(text));
    },
  };
});

vi.mock("../lib/ipc", () => ({
  api: new Proxy({} as Record<string, unknown>, {
    get: (_target, prop: string) =>
      prop === "ptySpawn"
        ? vi.fn(async (spec: { id: string }, onData: (bytes: Uint8Array) => void) => {
            h.handlers.set(spec.id, onData);
            return { pid: 1, shell: "powershell", integration: true, cwd: "C:/x" };
          })
        : vi.fn(async () => null),
  }),
  onPtyExit: async () => () => {},
}));

const { useStore } = await import("../store/useStore");
const { TerminalSession } = await import("./TerminalSession");

/** jsdom'da xterm'i açmak için gereken iki eksik (bkz. `hiddenTabWork.test.ts`). */
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

/** Hücre yüksekliği ölçülebilsin: ekran 400 px. */
const gercekRect = Element.prototype.getBoundingClientRect;
function olcuVer() {
  Element.prototype.getBoundingClientRect = function () {
    return {
      top: 0,
      left: 0,
      right: 800,
      bottom: 400,
      width: 800,
      height: 400,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect;
  };
}

const flush = (s: { term: { write: (data: string, cb: () => void) => void } }) =>
  new Promise<void>((resolve) => s.term.write("", () => resolve()));

/*
 * Sahte kareler (gerekçe dosya başında). Oturum kurulmadan ÖNCE devreye
 * giriyor, xterm'in kendi çizim istekleri de bu kuyruğa düşüyor. Kurulumdan
 * sonra devreye sokulduğunda xterm'in açılışta gerçek rAF'a bıraktığı istek
 * oturum kapandıktan sonra ateşlenip "Cannot read properties of undefined
 * (reading 'dimensions')" atıyordu: xterm kapanırken onu iptal ediyor ama
 * `cancelAnimationFrame` artık sahteydi.
 */
let saat = 0;
let sonKare = 0;
const bekleyenKareler = new Map<number, FrameRequestCallback>();

function kareleriSahtele() {
  // Sıfır değil: oturum farkı (`now - wheelAt`) değil zamanın kendisini
  // kullansaydı 0'dan başlayan saatte ilk kare yine 16,7 ms görünürdü.
  saat = 1000;
  bekleyenKareler.clear();
  vi.spyOn(performance, "now").mockImplementation(() => saat);
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    bekleyenKareler.set(++sonKare, cb);
    return sonKare;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    bekleyenKareler.delete(id);
  });
}

/**
 * Bir kare: saat `ms` ilerliyor (varsayılan 60 Hz), o ana kadar istenen geri
 * çağrılar koşuyor. Kare içinde istenen bir sonraki kareye kalıyor
 * (tarayıcıdaki gibi).
 */
function kare(ms = 1000 / 60) {
  saat += ms;
  const sira = [...bekleyenKareler.values()];
  bekleyenKareler.clear();
  for (const cb of sira) cb(saat);
}
function kareler(n: number) {
  for (let i = 0; i < n; i++) kare();
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
    // jsdom canvas bağlamı vermiyor; DOM ve dinleyiciler bu noktada kurulu.
  }
  await s.start(null);
  // Kaydırılacak geçmiş olsun.
  h.emit(tabId, "satır\r\n".repeat(200));
  await flush(s);
  const kaydir = vi.spyOn(s.term, "scrollLines").mockImplementation(() => {});
  return { s, kaydir };
}

/** Bir tekerlek çentiği (yukarı); jsdom'un olayında `wheelDeltaY` yok, piksel kipi. */
function tekerlek(s: InstanceType<typeof TerminalSession>, init: WheelEventInit = {}) {
  const ev = new WheelEvent("wheel", {
    deltaY: -40,
    deltaMode: 0,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  const hedef = s.term.element?.querySelector(".xterm-screen") ?? s.term.element!;
  hedef.dispatchEvent(ev);
  return ev;
}

const istenen = (kaydir: { mock: { calls: unknown[][] } }) =>
  kaydir.mock.calls.reduce((a, c) => a + (c[0] as number), 0);

beforeEach(() => {
  jsdomEksikleri();
  olcuVer();
  kareleriSahtele();
});

afterEach(() => {
  Element.prototype.getBoundingClientRect = gercekRect;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ana tamponda tekerleği oturum kaydırıyor", () => {
  it("çentik ilk karede başlıyor, karelere yayılıyor ve tamamı uygulanıyor", async () => {
    const { s, kaydir } = await oturum("w1");
    const ev = tekerlek(s);

    expect(ev.defaultPrevented, "olay xterm'in kaydırma öğesine de gitti: çift kaydırma").toBe(true);
    expect(kaydir.mock.calls.length, "ilk adım bir kare gecikti").toBe(1);
    expect(kaydir.mock.calls[0][0] as number).toBeLessThan(0);

    kareler(12);
    const cagri = kaydir.mock.calls.map((c) => c[0] as number);
    // 40 piksel = bir çentik = 50 px; 400 px / 24 satır = 16,67 px hücre → 3 satır.
    expect(istenen(kaydir)).toBe(-3);
    expect(Math.min(...cagri), "bir karede birden fazla satır atladı").toBe(-1);
    expect(cagri.length, "hareket karelere yayılmadı").toBeGreaterThan(1);
    void s.dispose(true);
  });

  /*
   * KARAR (2026-10-13, kullanıcı): adım kare sayısına değil GEÇEN SÜREYE göre
   * atılıyor, geciken kare aradaki mesafeyi kapatıyor (bkz.
   * `WheelScroller.step`). Bedeli bilerek kabul edildi: takılan bir karede
   * tek çentik iki satır kayabiliyor. 17 px hücrede bu, olaydan sonraki 1.
   * kare olaydan ≥58,9 ms ya da 2. kare öncekinden ≥40,5 ms sonra gelirse
   * oluyor; 60 ve 144 Hz'de hiç olmuyor, uygulamada kare p99 16,9 ms (NOTLAR
   * §1.32). Seçilmeyen yol, geciken kareyi tek kare saymak, gerçek
   * `WheelScroller`la hesaplandı (17 px hücre): çentik 30 Hz'de 167 ms,
   * 10 Hz'de 500 ms sürerdi; saniyede 25 çentikle dönen tekerlek bırakılınca
   * 30 Hz'de 0,27 sn, 10 Hz'de 1,3 sn daha kayardı (bugünkü: 0,1 sn).
   *
   * Oturumun kare süresini kaydırıcıya geçirdiğini de yalnızca bu test
   * bağlıyor: 60 Hz'de fark görünmüyor, geçirilmezse son satır 30 Hz'de
   * 133 ms'de, 10 Hz'de 400 ms'de geliyor.
   */
  it.each([60, 30, 10])("%i Hz'de de çentik 100 ms içinde kayıyor: adım kareye değil süreye bağlı", async (hz) => {
    const { s, kaydir } = await oturum(`w1-${hz}`);
    tekerlek(s);
    for (let i = 0; i < hz / 10; i++) kare(1000 / hz);
    expect(istenen(kaydir), "seyrek karede çentik yavaşladı").toBe(-3);
    void s.dispose(true);
  });
});

describe("xterm'e bırakılanlar", () => {
  it("ikincil ekranda (vim, less) tekerlek xterm'e kalıyor", async () => {
    const { s, kaydir } = await oturum("w2");
    h.emit("w2", "\x1b[?1049h");
    await flush(s);
    // `defaultPrevented` asıl kanıt: ikincil ekranın kaydırma geçmişi yok,
    // kenar kırpması `scrollLines`ı zaten engellerdi. Olayı yakalayıp
    // engellemek ise xterm'in ok tuşu çevirisini öldürürdü (jsdom'da xterm'in
    // kendi dinleyicisi kurulmuyor, yani olayı engelleyen ancak oturum olur).
    const ev = tekerlek(s);
    kareler(3);
    expect(ev.defaultPrevented, "ikincil ekranda tekerleği oturum yuttu").toBe(false);
    expect(kaydir, "ikincil ekranda oturum kaydırdı; ok tuşuna çevrilmedi").not.toHaveBeenCalled();
    void s.dispose(true);
  });

  it("fareyi isteyen programda tekerlek programa gidiyor", async () => {
    const { s, kaydir } = await oturum("w3");
    h.emit("w3", "\x1b[?1000h");
    await flush(s);
    expect(s.term.modes.mouseTrackingMode).not.toBe("none");
    const ev = tekerlek(s);
    kareler(3);
    expect(ev.defaultPrevented, "tekerlek programa gitmedi, oturum yuttu").toBe(false);
    expect(kaydir).not.toHaveBeenCalled();
    void s.dispose(true);
  });

  it("Ctrl ve Shift ile tekerlek kaydırılmıyor", async () => {
    const { s, kaydir } = await oturum("w4");
    expect(tekerlek(s, { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(tekerlek(s, { shiftKey: true }).defaultPrevented).toBe(false);
    kareler(3);
    expect(kaydir).not.toHaveBeenCalled();
    void s.dispose(true);
  });
});

describe("bekleyen hareket kesiliyor", () => {
  it("'Aşağı in' sonrası kalan yukarı hareket görünümü geri çekmiyor", async () => {
    const { s, kaydir } = await oturum("w5");
    tekerlek(s, { deltaY: -400 });
    s.scrollToBottom();
    const once = kaydir.mock.calls.length;
    kareler(6);
    expect(kaydir.mock.calls.length, "en alta inildi, tekerlek hâlâ yukarı itiyor").toBe(once);
    void s.dispose(true);
  });

  it("terminale yazmak bekleyen hareketi bırakıyor", async () => {
    // xterm yazınca en alta iniyor (`scrollOnUserInput`); kalan yukarı hareket
    // o inişi geri alırdı.
    const { s, kaydir } = await oturum("w6");
    tekerlek(s, { deltaY: -400 });
    s.term.input("a", true);
    const once = kaydir.mock.calls.length;
    kareler(6);
    expect(kaydir.mock.calls.length).toBe(once);
    void s.dispose(true);
  });
});
