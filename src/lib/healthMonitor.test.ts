// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ACTIVE_WINDOW_MS,
  FrameMonitor,
  IDLE_INTERVAL,
  JANK_MS,
  JANK_SETTLE_MS,
  TASK_INTERVAL,
  decideMode,
} from "./health";

/**
 * Teşhis sondasının MALİYETİ ve TAKILMAYI YAKALAMASI.
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
 *
 * ## Neden elle sürülen zamanlayıcı
 *
 * İlk sürümde sahte saat (`vi.useFakeTimers`) vardı ve ŞUNU YANLIŞ YEŞİL
 * VERDİ: "boştayken takılma yakalanıyor" testi yalnızca ÇİZİM hattının
 * tıkanmasını (rAF bekliyor, zamanlayıcılar akıyor) benzetiyordu; ana iş
 * parçacığının DONMASINI (zamanlayıcı da rAF da geç geliyor) hiç sınamıyordu.
 * Sahte saat zamanlayıcıları HER ZAMAN zamanında ateşler, geç ateşletemez.
 * Burada zamanı biz ilerletiyoruz ve gecikmiş geri çağrıları istediğimiz
 * sırayla koşturuyoruz (`block`).
 */

describe("kip kararı", () => {
  it("gizli pencerede duraklıyor", () => {
    expect(decideMode(true, 0)).toBe("paused");
    expect(decideMode(true, 60_000)).toBe("paused");
  });

  it("etkinlikten sonra ACTIVE_WINDOW_MS boyunca sık", () => {
    expect(decideMode(false, 0)).toBe("fast");
    expect(decideMode(false, ACTIVE_WINDOW_MS)).toBe("fast");
    expect(decideMode(false, ACTIVE_WINDOW_MS + 1)).toBe("slow");
  });

  it("seyrek yoklama takılma eşiğinden büyük olamaz", () => {
    expect(IDLE_INTERVAL).toBeLessThanOrEqual(JANK_MS);
  });

  it("sık örnekleme kare ölçeğinde kalıyor", () => {
    expect(TASK_INTERVAL).toBeLessThanOrEqual(20);
  });
});

describe("FrameMonitor", () => {
  /** performance.now() */
  let now: number;
  let timers: Map<number, { cb: () => void; at: number }>;
  let rafs: Map<number, FrameRequestCallback>;
  let nextId: number;
  let timeouts: number;
  let rafCalls: number;
  let frameClock: number;
  let monitor: FrameMonitor;

  /** Vadesi gelen zamanlayıcıları (en eskiden başlayarak), sonra bekleyen kareleri koşturur. */
  function runDue() {
    for (;;) {
      const due = [...timers.entries()].filter(([, t]) => t.at <= now).sort((a, b) => a[1].at - b[1].at);
      if (due.length === 0) break;
      const [id, t] = due[0];
      timers.delete(id);
      t.cb();
    }
    const kareler = [...rafs.entries()];
    rafs.clear();
    for (const [, cb] of kareler) cb(now);
  }

  /** `ms` boyunca zamanı 4 ms adımlarla ilerletir; her ~16 ms'de bekleyen kareleri çizer. */
  function advance(ms: number) {
    const end = now + ms;
    while (now < end) {
      now += 4;
      frameClock += 4;
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= now).sort((a, b) => a[1].at - b[1].at);
        if (due.length === 0) break;
        const [id, t] = due[0];
        timers.delete(id);
        t.cb();
      }
      if (frameClock >= 16) {
        frameClock = 0;
        const kareler = [...rafs.entries()];
        rafs.clear();
        for (const [, cb] of kareler) cb(now);
      }
    }
  }

  /**
   * Ana iş parçacığı `ms` boyunca DONUYOR: hiçbir geri çağrı koşmuyor, zaman
   * akıyor; sonunda vadesi gelmiş her şey GEÇ koşuyor.
   */
  function block(ms: number) {
    now += ms;
    runDue();
  }

  /**
   * `block` ile aynı donma, ama bitince ÇİZİM geri çağrısı zamanlayıcıdan ÖNCE
   * koşuyor. Gerçek motorlarda sıra garanti değil; ikisi de denenmeli.
   */
  function blockFrameFirst(ms: number) {
    now += ms;
    const kareler = [...rafs.entries()];
    rafs.clear();
    for (const [, cb] of kareler) cb(now);
    runDue();
  }

  /**
   * Seyrek kipte bir yoklamadan HEMEN sonrasına ilerler: çizim isteği açık,
   * henüz karşılanmadı. Donma bu anda başlarsa iki yol da (zamanlayıcı ve rAF)
   * onu görür.
   */
  function bekleyenCizimIsteginiYakala() {
    for (let i = 0; i < 400 && rafs.size === 0; i++) advance(4);
    expect(rafs.size, "bekleyen çizim isteği yakalanamadı").toBeGreaterThan(0);
  }

  const reset = () => {
    timeouts = 0;
    rafCalls = 0;
  };

  function gizli(value: boolean) {
    if (value) Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    else Reflect.deleteProperty(document, "hidden");
    document.dispatchEvent(new Event("visibilitychange"));
  }

  beforeEach(() => {
    now = 1000;
    timers = new Map();
    rafs = new Map();
    nextId = 0;
    timeouts = 0;
    rafCalls = 0;
    frameClock = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      rafCalls++;
      rafs.set(++nextId, cb);
      return nextId;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      rafs.delete(id);
    });
    vi.spyOn(window, "setTimeout").mockImplementation(((cb: () => void, ms?: number) => {
      timeouts++;
      timers.set(++nextId, { cb, at: now + (ms ?? 0) });
      return nextId;
    }) as unknown as typeof window.setTimeout);
    vi.spyOn(window, "clearTimeout").mockImplementation(((id?: number) => {
      if (id !== undefined) timers.delete(id);
    }) as unknown as typeof window.clearTimeout);
    monitor = new FrameMonitor();
  });

  afterEach(() => {
    monitor.stop();
    gizli(false);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // ---------------------------------------------------------------- maliyet

  it("etkinlik sırasında kare ölçeğinde sürekli örnekliyor", () => {
    monitor.start();
    reset();
    advance(1000);
    // ~62 zamanlayıcı ve ~60 kare: eski davranış, etkinken KORUNMALI.
    expect(timeouts).toBeGreaterThan(50);
    expect(rafCalls).toBeGreaterThan(50);
  });

  it("boştayken saniyede yalnızca birkaç uyanma", () => {
    monitor.start();
    advance(ACTIVE_WINDOW_MS + 1000);
    reset();
    advance(2000);
    const tavan = Math.ceil(2000 / IDLE_INTERVAL) + 2;
    expect(timeouts, `boşta ${timeouts} zamanlayıcı (tavan ${tavan})`).toBeLessThanOrEqual(tavan);
    expect(rafCalls, `boşta ${rafCalls} rAF (tavan ${tavan})`).toBeLessThanOrEqual(tavan);
  });

  it("boşta uyanma sayısı sık kipin en az on katı az", () => {
    monitor.start();
    reset();
    advance(1000);
    const sik = timeouts + rafCalls;
    advance(ACTIVE_WINDOW_MS + 1000);
    reset();
    advance(1000);
    const seyrek = timeouts + rafCalls;
    expect(seyrek * 10, `sık ${sik}, seyrek ${seyrek}`).toBeLessThanOrEqual(sik);
  });

  it("kullanıcı etkinliği sık örneklemeye döndürüyor", () => {
    monitor.start();
    advance(ACTIVE_WINDOW_MS + 1000);
    reset();
    advance(500);
    const bosta = timeouts;

    window.dispatchEvent(new Event("keydown"));
    reset();
    advance(500);
    expect(timeouts, "tuşa basınca örnekleme hızlanmadı").toBeGreaterThan(bosta * 5);
  });

  it("gizli pencerede HİÇBİR ŞEY çalışmıyor", () => {
    monitor.start();
    advance(100);
    gizli(true);
    reset();
    advance(3000);
    expect(timeouts, "gizli pencerede zamanlayıcı çalıştı").toBe(0);
    expect(rafCalls, "gizli pencerede rAF istendi").toBe(0);
  });

  it("gizlilikten dönünce aradaki süre takılma sayılmıyor", () => {
    monitor.start();
    advance(100);
    gizli(true);
    now += 3000;
    gizli(false);
    advance(500);
    expect(monitor.snapshot().takilmalar, "gizli süre takılma diye kaydedildi").toHaveLength(0);
    expect(monitor.snapshot().calisiyor).toBe(true);
  });

  it("yüzdelik penceresi yalnız sık kipte doluyor", () => {
    monitor.start();
    advance(500);
    const sikOlcum = monitor.snapshot().cizim?.olcum ?? 0;
    advance(ACTIVE_WINDOW_MS + 1000);
    const once = monitor.snapshot().cizim?.olcum ?? 0;
    advance(5000);
    const sonra = monitor.snapshot().cizim?.olcum ?? 0;
    expect(sikOlcum).toBeGreaterThan(10);
    expect(sonra, "seyrek kipte kare penceresi doldu").toBe(once);
  });

  it("stop her şeyi durduruyor ve dinleyicileri kaldırıyor", () => {
    monitor.start();
    advance(100);
    monitor.stop();
    reset();
    advance(1000);
    window.dispatchEvent(new Event("keydown"));
    advance(1000);
    expect(timeouts, "durdurulmuş sonda zamanlayıcı kurdu").toBe(0);
    expect(rafCalls, "durdurulmuş sonda rAF istedi").toBe(0);
    expect(monitor.snapshot().calisiyor).toBe(false);
  });

  it("start iki kez çağrılınca çift döngü kurmuyor", () => {
    monitor.start();
    monitor.start();
    reset();
    advance(1000);
    expect(timeouts).toBeLessThan(90);
  });

  // ---------------------------------------------------- takılmayı yakalama

  it("etkinken ana iş parçacığı DONMASI kaydediliyor (eski davranış korunuyor)", () => {
    monitor.start();
    advance(200);
    block(900);
    const t = monitor.snapshot().takilmalar;
    expect(t.length, "sık kipte 900 ms'lik donma kaydedilmedi").toBeGreaterThanOrEqual(1);
    expect(t[t.length - 1].gapMs).toBeGreaterThanOrEqual(800);
  });

  it("BOŞTAYKEN ana iş parçacığı DONMASI kaydediliyor", () => {
    // GERİLEME (inceleme bulgusu): seyrek kipte rAF her 250 ms'lik yoklamada
    // ~bir kare boyunca açık; takılma kaydı YALNIZCA `onFrame`de üretiliyordu.
    // Ana iş parçacığı donarken zamanlayıcı geç ateşliyor ve rAF donma BİTTİKTEN
    // sonra isteniyor: gecikmesi ~8 ms, "gap" eşiği aşmıyor. 50 evreden
    // yalnızca 2'sinde kaydedildi; panel "kayda geçen takılma yok" dedi — ve
    // modülün kendi okuma tablosuna göre bu "donma arayüzde değil" anlamına
    // gelir: yanıltıcı teşhis. Zamanlayıcının GEÇ kalması (sapma) tek başına
    // bir donma kanıtı.
    monitor.start();
    advance(ACTIVE_WINDOW_MS + 1000); // seyrek kip
    // Yoklamanın hangi evresinde donulduğu belirsiz: birkaç evre denenir.
    for (const gecikme of [10, 60, 130, 200, 240]) {
      const once = monitor.snapshot().takilmalar.length;
      advance(gecikme);
      block(900);
      advance(600); // yeniden seyrek ritme otursun
      expect(
        monitor.snapshot().takilmalar.length,
        `evre +${gecikme} ms: 900 ms'lik donma kaydedilmedi`,
      ).toBeGreaterThan(once);
    }
  });

  it("donma sırasında kuyruğa giren kullanıcı girdisi ölçümü SİLMİYOR", () => {
    // GERİLEME (inceleme bulgusu): `enter("fast")` bekleyen zamanlayıcı ve rAF'i
    // koşulsuz iptal ediyordu. Donma sırasında kuyruğa giren bir tuş ya da
    // işaretçi olayı, donma BİTİNCE zamanlayıcıdan ÖNCE koşarsa `poke` ölçümü
    // siliyor ve takılma kaydedilmiyordu. (Chromium/WebKit'te işaretçi olayları
    // kareye hizalı ve rAF'ten önce işleniyor: bu sıra gerçekçi.)
    monitor.start();
    advance(ACTIVE_WINDOW_MS + 1000); // seyrek kip
    advance(100);
    const once = monitor.snapshot().takilmalar.length;
    now += 900; // ana iş parçacığı donuyor…
    window.dispatchEvent(new Event("keydown")); // …donma biter bitmez GİRDİ önce koşuyor
    runDue(); // sonra gecikmiş zamanlayıcı/kare
    expect(monitor.snapshot().takilmalar.length, "girdi önce koşunca donma kayboldu").toBeGreaterThan(once);

    // Kuyruk sapması da korunmalı: zamanlayıcı İPTAL edildi, örneği hiç
    // gelmeyecek. Kuyruğu sonradan dolduran adım (`JANK_SETTLE_MS`) bu değeri
    // örneksiz diye SIFIRA ezmemeli — panel "kuyruk 0 ms" derse sebebi JavaScript
    // olan donma "çizim tıkandı" diye okunur.
    advance(JANK_SETTLE_MS + 100);
    const kayitlar = monitor.snapshot().takilmalar;
    expect(kayitlar.length).toBe(once + 1);
    expect(kayitlar[kayitlar.length - 1].taskMs, "kuyruk sapması sıfıra ezildi").toBeGreaterThanOrEqual(600);
  });

  it("sık→seyrek sınırına denk gelen donma da kaydediliyor", () => {
    // Etkinlik penceresi biterken (fast → slow) geç ateşleyen zamanlayıcı
    // `enter("slow")` ile bekleyen ölçümü iptal ediyordu.
    monitor.start();
    advance(ACTIVE_WINDOW_MS - 300); // pencerenin bitmesine az kaldı
    const once = monitor.snapshot().takilmalar.length;
    block(900); // donma pencerenin bittiği anı kapsıyor
    expect(monitor.snapshot().takilmalar.length, "sınırdaki donma kaydedilmedi").toBeGreaterThan(once);
  });

  it("çizim hattı tıkanınca (zamanlayıcılar akarken) seyrek kipte de kaydediliyor", () => {
    // Ayrı bir sınıf: yalnızca ÇİZİM tıkalı, JS serbest. Seyrek kipteki rAF
    // isteği donuk kalır ve geç karşılanınca gecikmesi eşiği aşar.
    monitor.start();
    advance(ACTIVE_WINDOW_MS + 1000);
    advance(IDLE_INTERVAL * 2); // bir çizim isteği açık
    const once = monitor.snapshot().takilmalar.length;
    const bekleyen = [...rafs.entries()];
    rafs.clear();
    // 900 ms boyunca zamanlayıcılar akıyor ama kareler ÇİZİLMİYOR.
    const end = now + 900;
    while (now < end) {
      now += 4;
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= now);
        if (due.length === 0) break;
        const [id, t] = due[0];
        timers.delete(id);
        t.cb();
      }
    }
    for (const [, cb] of [...bekleyen, ...rafs.entries()]) cb(now);
    expect(monitor.snapshot().takilmalar.length).toBeGreaterThan(once);
  });

  it("donma bitince ÇİZİM geri çağrısı önce koşsa da kuyruk sapması yazılıyor", () => {
    // Sıra tersine: rAF kaydı açıyor (kuyruk değeri henüz bilinmiyor), zamanlayıcı
    // sonra geliyor ve kaydı BİRLEŞTİRİYOR. Aksi hâlde panel "çizim 900 · kuyruk 0"
    // der, yani sebebi JavaScript olan donmayı "çizim tıkandı" diye gösterir.
    monitor.start();
    advance(ACTIVE_WINDOW_MS + 1000);
    advance(50);
    blockFrameFirst(900);
    const t = monitor.snapshot().takilmalar;
    expect(t.length).toBeGreaterThanOrEqual(1);
    expect(t[t.length - 1].taskMs).toBeGreaterThanOrEqual(600);
  });

  it("aynı donmayı iki yol da görse TEK kayıt (her iki koşma sırasında)", () => {
    // Ana iş parçacığı donunca rAF da zamanlayıcı da geç geliyor; ikisi de eşiği
    // aşıyor. Birleştirme olmazsa her donma iki satır olur ve 20'lik halka
    // yarı ömürle dolar. Donma, çizim isteği AÇIKKEN başlıyor: yoksa yalnız
    // zamanlayıcı görür ve test hiçbir şeyi sınamaz.
    for (const kos of [block, blockFrameFirst]) {
      monitor.stop();
      monitor = new FrameMonitor();
      monitor.start();
      advance(ACTIVE_WINDOW_MS + 1000);
      bekleyenCizimIsteginiYakala();
      kos(900);
      advance(600);
      expect(monitor.snapshot().takilmalar, `${kos.name}: tek donma birden çok kayıt`).toHaveLength(1);
    }
  });

  it("birleşen kayıtta çizim boşluğu iki ölçümün büyüğü (her koşma sırasında)", () => {
    // Zamanlayıcı yolu yalnızca ALT SINIRI (sapmayı) biliyor: vadesi donmanın
    // içine düşünce donmanın başlangıcı ile vade arasındaki kısmı göremiyor. Çizim
    // yolu asıl boşluğu biliyor, ama YALNIZCA donma anında bekleyen bir rAF varsa
    // (istek yoklamada açılıp ~bir kare içinde karşılanıyor). İkisi de gördüğünde
    // kayıt hangisi önce gelirse gelsin büyüğünü taşımalı.
    for (const kos of [block, blockFrameFirst]) {
      monitor.stop();
      monitor = new FrameMonitor();
      monitor.start();
      advance(ACTIVE_WINDOW_MS + 1000);
      bekleyenCizimIsteginiYakala();
      kos(900);
      const kayitlar = monitor.snapshot().takilmalar;
      expect(kayitlar, `${kos.name}: tek donma birden çok kayıt`).toHaveLength(1);
      const son = kayitlar[0];
      expect(son.gapMs, `${kos.name}: çizim boşluğu asıl süreyi taşımıyor`).toBeGreaterThanOrEqual(880);
      expect(son.gapMs).toBeGreaterThanOrEqual(son.taskMs);
      expect(son.taskMs, `${kos.name}: kuyruk sapması yazılmadı`).toBeGreaterThanOrEqual(600);
    }
  });

  it("YALNIZ zamanlayıcı gördüğünde çizim boşluğu sapmanın alt sınırı", () => {
    // Donma yoklamalar arasına düştü, bekleyen çizim isteği yok: kanıt yalnızca
    // zamanlayıcının geç ateşlemesi. Kayıt uydurma bir süre yazmıyor; ölçülebilen
    // alt sınırı yazıyor ve eşiğin altında kalmıyor.
    monitor.start();
    advance(ACTIVE_WINDOW_MS + 1000);
    for (let i = 0; i < 400 && rafs.size > 0; i++) advance(4); // çizim isteği yok
    block(900);
    const [son] = monitor.snapshot().takilmalar;
    expect(son.gapMs).toBeGreaterThanOrEqual(JANK_MS);
    expect(son.gapMs).toBeLessThanOrEqual(900);
    expect(son.gapMs).toBe(son.taskMs);
  });

  it("iki AYRI donma iki kayıt: birleştirme fazla hevesli değil", () => {
    monitor.start();
    advance(ACTIVE_WINDOW_MS + 1000);
    block(900);
    advance(1500); // araya sağlıklı yoklamalar giriyor
    block(900);
    expect(monitor.snapshot().takilmalar).toHaveLength(2);
  });

  it("eşik altı donma HİÇBİR kipte kayda geçmiyor", () => {
    // 200 ms < JANK_MS. Sık kipte de seyrek kipte de "takılma" sayılmaz:
    // aksi hâlde panel her büyük çıktı diliminde kırmızı yanardı.
    monitor.start();
    advance(200);
    block(200);
    advance(ACTIVE_WINDOW_MS + 1000);
    for (const evre of [0, 50, 100, 150, 200]) {
      advance(evre);
      block(200);
      advance(600);
    }
    expect(monitor.snapshot().takilmalar).toHaveLength(0);
  });

  it("sağlıklı çalışmada uzun süre HİÇ takılma kaydı yok", () => {
    // Yanlış pozitif sınırı: zamanlayıcı ve kareler zamanında geliyorken hiçbir
    // yoldan kayıt üretilmemeli (sık + seyrek + etkinlikle kip değişimleri dahil).
    monitor.start();
    for (let i = 0; i < 6; i++) {
      advance(3000);
      window.dispatchEvent(new Event("pointermove"));
      advance(ACTIVE_WINDOW_MS + 500);
    }
    expect(monitor.snapshot().takilmalar).toHaveLength(0);
  });

  it("JANK_MS + IDLE_INTERVAL ve üstü her donma, yoklamanın HER evresinde kaydediliyor", () => {
    // Dosya başlığındaki garanti: D ms'lik donma vadesi içine düşen zamanlayıcıyı
    // D - (0..aralık) ms geç ateşletir. Sapma eşiğe ulaşmak zorunda olduğundan
    // 500 ms ve üstü için evre önemsiz. Eskiden (yalnızca rAF) 50 evrede 2 kayıt.
    //
    // Her evre TAZE sondayla: halka tampon 20 kayıtla sınırlı, tek sondada sayaç
    // doyunca "bir artmadı" diye yanlış hata verirdi.
    const donma = JANK_MS + IDLE_INTERVAL + 20;
    for (let evre = 0; evre < IDLE_INTERVAL; evre += 12) {
      monitor.stop();
      monitor = new FrameMonitor();
      monitor.start();
      advance(ACTIVE_WINDOW_MS + 1000);
      advance(evre);
      block(donma);
      advance(600);
      expect(
        monitor.snapshot().takilmalar,
        `evre +${evre} ms: ${donma} ms'lik donma tam bir kez kaydedilmedi`,
      ).toHaveLength(1);
    }
  });

  it("pencere gizlenirken gecikmiş zamanlayıcı takılma sayılmıyor", () => {
    // Gizlenen pencerede zamanlayıcılar kısılıyor; gecikmenin donma olduğunu
    // bilemeyiz. `paused`a girerken bekleyen ölçüm DEĞERLENDİRİLMİYOR.
    monitor.start();
    advance(ACTIVE_WINDOW_MS + 1000);
    advance(40);
    now += 5000;
    gizli(true);
    expect(monitor.snapshot().takilmalar, "gizlenirken gecikme takılma diye yazıldı").toHaveLength(0);
  });

  it("donma kaydında görev kuyruğu sapması da yazılıyor", () => {
    // Panelin okuma tablosu: "çizim boşluğu" ile "görev kuyruğu sapması"
    // birlikte okunuyor. Seyrek kipte sapma zamanlayıcıdan geliyor.
    monitor.start();
    advance(ACTIVE_WINDOW_MS + 1000);
    advance(50);
    block(900);
    const t = monitor.snapshot().takilmalar;
    const son = t[t.length - 1];
    expect(son.taskMs, "kuyruk sapması sıfır: 'yalnız çizim takıldı' diye yanlış teşhis").toBeGreaterThanOrEqual(600);
  });
});
