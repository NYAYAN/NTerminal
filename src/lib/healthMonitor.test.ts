// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ACTIVE_WINDOW_MS,
  FrameMonitor,
  IDLE_INTERVAL,
  JANK_MS,
  TASK_INTERVAL,
  decideMode,
} from "./health";

/**
 * Teşhis sondasının MALİYETİ.
 *
 * ÖLÇÜLEN: sonda uygulama ömrü boyunca sürekli çalışıyordu (16 ms zamanlayıcı
 * + her karede rAF) ve uygulama BOŞTAYKEN bile toplam CPU'nun yarısından
 * fazlasını yiyordu: Rust ana süreci %6, WebContent %5,6, GPU %1,2 — sonda
 * durdurulunca 12,9 → 6,0. rAF'in sürekli istenmesi macOS'ta arayüz sürecini
 * de saniyede 60 kez uyandırıyor.
 *
 * Bu testler iki şeyi birlikte bağlıyor: boştayken ve gizliyken SESSİZ
 * kalıyor (maliyet), ama gerçek bir takılmayı yine de KAYDEDİYOR (sondanın
 * varlık sebebi). İkincisi olmadan birincisi "sonda kapalı" demek olurdu.
 */

describe("kip kararı", () => {
  it("gizli pencerede duraklıyor", () => {
    // Ölçülecek bir kullanıcı yok; zamanlayıcılar zaten saniyede bire iniyor.
    expect(decideMode(true, 0)).toBe("paused");
    expect(decideMode(true, 60_000)).toBe("paused");
  });

  it("etkinlikten sonra ACTIVE_WINDOW_MS boyunca sık", () => {
    expect(decideMode(false, 0)).toBe("fast");
    expect(decideMode(false, ACTIVE_WINDOW_MS)).toBe("fast");
    expect(decideMode(false, ACTIVE_WINDOW_MS + 1)).toBe("slow");
  });

  it("seyrek yoklama takılma eşiğinden büyük olamaz", () => {
    // Aralık eşikten büyük olursa bir takılma iki yoklama arasında kalıp hiç
    // görülmeyebilir: sonda "her şey temiz" derdi.
    expect(IDLE_INTERVAL).toBeLessThanOrEqual(JANK_MS);
  });

  it("sık örnekleme kare ölçeğinde kalıyor", () => {
    // Yan yana okunan iki sonda aynı zaman ölçeğinde olmalı (bkz. health.test).
    expect(TASK_INTERVAL).toBeLessThanOrEqual(20);
  });
});

describe("FrameMonitor maliyeti", () => {
  /** Bekleyen rAF geri çağrıları: tarayıcı gibi biz sürüyoruz. */
  let rafs: Map<number, FrameRequestCallback>;
  let rafId: number;
  let timeouts: number;
  let rafCalls: number;
  let frameClock: number;
  let monitor: FrameMonitor;

  /** `ms` boyunca 4 ms adımlarla zaman ilerletir; her ~16 ms'de bekleyen kareleri çizer. */
  function step(ms: number) {
    const end = performance.now() + ms;
    while (performance.now() < end) {
      vi.advanceTimersByTime(4);
      frameClock += 4;
      if (frameClock >= 16) {
        frameClock = 0;
        const due = [...rafs.entries()];
        rafs.clear();
        for (const [, cb] of due) cb(performance.now());
      }
    }
  }

  /** Kareleri ÇİZMEDEN zaman ilerletir (bloklanmış çizim hattı). */
  function stallDraw(ms: number) {
    vi.advanceTimersByTime(ms);
  }

  function drawNow() {
    const due = [...rafs.entries()];
    rafs.clear();
    for (const [, cb] of due) cb(performance.now());
  }

  function reset() {
    timeouts = 0;
    rafCalls = 0;
  }

  function gizli(value: boolean) {
    if (value) Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    else Reflect.deleteProperty(document, "hidden");
    document.dispatchEvent(new Event("visibilitychange"));
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance", "Date"] });
    rafs = new Map();
    rafId = 0;
    timeouts = 0;
    rafCalls = 0;
    frameClock = 0;
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      rafCalls++;
      rafs.set(++rafId, cb);
      return rafId;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      rafs.delete(id);
    });
    const orijinal = window.setTimeout.bind(window);
    vi.spyOn(window, "setTimeout").mockImplementation(((...args: Parameters<typeof setTimeout>) => {
      timeouts++;
      return orijinal(...args);
    }) as typeof window.setTimeout);
    monitor = new FrameMonitor();
  });

  afterEach(() => {
    monitor.stop();
    gizli(false);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("etkinlik sırasında kare ölçeğinde sürekli örnekliyor", () => {
    monitor.start();
    reset();
    step(1000);
    // ~62 zamanlayıcı ve ~60 kare: eski davranış, etkinken KORUNMALI (donmayı
    // yakalamanın tek yolu).
    expect(timeouts).toBeGreaterThan(50);
    expect(rafCalls).toBeGreaterThan(50);
  });

  it("boştayken saniyede yalnızca birkaç uyanma", () => {
    monitor.start();
    step(ACTIVE_WINDOW_MS + 1000); // etkinlik yok → seyrek kipe iner
    reset();
    step(2000);
    const tavan = Math.ceil(2000 / IDLE_INTERVAL) + 2;
    expect(timeouts, `boşta ${timeouts} zamanlayıcı (tavan ${tavan})`).toBeLessThanOrEqual(tavan);
    expect(rafCalls, `boşta ${rafCalls} rAF (tavan ${tavan})`).toBeLessThanOrEqual(tavan);
  });

  it("boşta uyanma sayısı sık kipin en az on katı az", () => {
    monitor.start();
    reset();
    step(1000);
    const sik = timeouts + rafCalls;
    step(ACTIVE_WINDOW_MS + 1000);
    reset();
    step(1000);
    const seyrek = timeouts + rafCalls;
    expect(seyrek * 10, `sık ${sik}, seyrek ${seyrek}`).toBeLessThanOrEqual(sik);
  });

  it("kullanıcı etkinliği sık örneklemeye döndürüyor", () => {
    monitor.start();
    step(ACTIVE_WINDOW_MS + 1000);
    reset();
    step(500);
    const boşta = timeouts;

    window.dispatchEvent(new Event("keydown"));
    reset();
    step(500);
    expect(timeouts, "tuşa basınca örnekleme hızlanmadı").toBeGreaterThan(boşta * 5);
  });

  it("gizli pencerede HİÇBİR ŞEY çalışmıyor", () => {
    monitor.start();
    step(100);
    gizli(true);
    reset();
    step(3000);
    expect(timeouts, "gizli pencerede zamanlayıcı çalıştı").toBe(0);
    expect(rafCalls, "gizli pencerede rAF istendi").toBe(0);
  });

  it("gizlilikten dönünce aradaki süre takılma sayılmıyor", () => {
    // Gizliyken saatler geçti; dönüşteki ilk kare "3 saniye gecikti" demesin.
    monitor.start();
    step(100);
    gizli(true);
    stallDraw(3000);
    gizli(false);
    step(500);
    expect(monitor.snapshot().takilmalar, "gizli süre takılma diye kaydedildi").toHaveLength(0);
    expect(monitor.snapshot().calisiyor).toBe(true);
  });

  it("boştayken GERÇEK bir takılma yine de kaydediliyor", () => {
    // Maliyet düşerken sondanın varlık sebebi bozulmamalı: çizim hattı 900 ms
    // tıkanırsa seyrek kipte de görülmeli.
    monitor.start();
    step(ACTIVE_WINDOW_MS + 1000); // seyrek kip
    step(IDLE_INTERVAL * 2); // bir çizim isteği açık
    stallDraw(900); // kareler ÇİZİLMİYOR
    drawNow();
    const takilmalar = monitor.snapshot().takilmalar;
    expect(takilmalar.length, "900 ms'lik çizim tıkanması kaydedilmedi").toBeGreaterThanOrEqual(1);
    expect(takilmalar[takilmalar.length - 1].gapMs).toBeGreaterThanOrEqual(JANK_MS);
  });

  it("etkinken de gerçek takılma kaydediliyor (eski davranış korunuyor)", () => {
    monitor.start();
    step(200);
    stallDraw(900);
    drawNow();
    const takilmalar = monitor.snapshot().takilmalar;
    expect(takilmalar.length).toBeGreaterThanOrEqual(1);
    expect(takilmalar[takilmalar.length - 1].gapMs).toBeGreaterThanOrEqual(800);
  });

  it("yüzdelik penceresi yalnız sık kipte doluyor", () => {
    // Seyrek kipin örnekleri ("istek ne kadar sonra karşılandı") sık kipin
    // örnekleriyle ("iki kare arası") aynı dağılım değil; karışırsa ortanca
    // anlamsızlaşır.
    monitor.start();
    step(500);
    const sikOlcum = monitor.snapshot().cizim?.olcum ?? 0;
    step(ACTIVE_WINDOW_MS + 1000); // hızlıdan seyreğe iniş dahil
    const once = monitor.snapshot().cizim?.olcum ?? 0;
    step(5000); // tamamen seyrek
    const sonra = monitor.snapshot().cizim?.olcum ?? 0;
    expect(sikOlcum).toBeGreaterThan(10);
    expect(sonra, "seyrek kipte kare penceresi doldu").toBe(once);
  });

  it("stop her şeyi durduruyor ve dinleyicileri kaldırıyor", () => {
    monitor.start();
    step(100);
    monitor.stop();
    reset();
    step(1000);
    window.dispatchEvent(new Event("keydown"));
    step(1000);
    expect(timeouts, "durdurulmuş sonda zamanlayıcı kurdu").toBe(0);
    expect(rafCalls, "durdurulmuş sonda rAF istedi").toBe(0);
    expect(monitor.snapshot().calisiyor).toBe(false);
  });

  it("start iki kez çağrılınca çift döngü kurmuyor", () => {
    monitor.start();
    monitor.start();
    reset();
    step(1000);
    // Çift döngü ~124 zamanlayıcı olurdu.
    expect(timeouts).toBeLessThan(90);
  });
});
