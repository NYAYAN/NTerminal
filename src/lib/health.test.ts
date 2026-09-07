import { describe, expect, it } from "vitest";

import {
  FRAME_WINDOW,
  JANK_LIMIT,
  JANK_MS,
  JANK_SETTLE_MS,
  TASK_INTERVAL,
  TASK_SAMPLE_WINDOW,
  frameStats,
  maxDriftIn,
  pushJank,
  type JankEvent,
} from "./health";

/**
 * Teşhis sondasının saf mantığı.
 *
 * Bu sayılar bir hata AVI için var: "uygulama arada yanıt vermiyor"
 * bildiriminde üç iş yükü hipotezi canlı ölçümle elendi (gerekçeler
 * `health.ts` başında) ve arama biriken duruma kaldı. Panelin değeri
 * sayıların DOĞRU olmasına bağlı — yanlış bir p95, sağlıklı görünen bir panel
 * üretir ve aramayı yanlış yere gönderir.
 */
describe("kare istatistikleri", () => {
  it("ölçüm yokken null döner", () => {
    // "Ölçüm yok" ile "sıfır ms" ayrı şeyler. Sıfır dönmek, sonda hiç
    // koşmamışken paneli sağlıklı gösterirdi.
    expect(frameStats([])).toBe(null);
  });

  it("ortanca, p95 ve en büyüğü veriyor", () => {
    // 100 kare: doksan dokuzu 16 ms, biri 900 ms. Ortalama bu takılmayı
    // eritirdi (25 ms), yüzdelikler saklamıyor.
    const gaps = [...Array(99).fill(16), 900];
    const s = frameStats(gaps)!;
    expect(s.ortanca).toBe(16);
    expect(s.enBuyuk).toBe(900);
    expect(s.olcum).toBe(100);
  });

  it("p95 tek bir sıçramayı yutmuyor ama ortancayı da bozmuyor", () => {
    // Yüzde onu 400 ms olan bir dizi: p95 sıçramayı göstermeli, ortanca
    // sağlıklı kalmalı. İkisi birlikte "arada takılıyor" tablosunu veriyor.
    const gaps = [...Array(90).fill(17), ...Array(10).fill(400)];
    const s = frameStats(gaps)!;
    expect(s.ortanca).toBe(17);
    expect(s.p95).toBe(400);
  });

  it("girdi dizisini değiştirmiyor", () => {
    // Sıralama yerinde yapılsaydı ölçüm tamponunun sırası bozulurdu ve
    // pencereden düşen kare en eski değil rastgele biri olurdu.
    const gaps = [30, 10, 20];
    frameStats(gaps);
    expect(gaps).toEqual([30, 10, 20]);
  });

  it("tek ölçümde de çalışıyor", () => {
    const s = frameStats([42])!;
    expect(s.ortanca).toBe(42);
    expect(s.p95).toBe(42);
    expect(s.enBuyuk).toBe(42);
  });
});

describe("takılma halka tamponu", () => {
  const olay = (at: number): JankEvent => ({ at, gapMs: 500, taskMs: 0 });

  it("sınıra kadar biriktiriyor", () => {
    let list: JankEvent[] = [];
    for (let i = 0; i < 5; i++) list = pushJank(list, olay(i), 5);
    expect(list.map((j) => j.at)).toEqual([0, 1, 2, 3, 4]);
  });

  it("sınır aşılınca en ESKİYİ düşürüyor", () => {
    // Yeniyi düşürmek en son donmayı — yani kullanıcının sorduğu şeyi —
    // kaybetmek olurdu.
    let list: JankEvent[] = [];
    for (let i = 0; i < 7; i++) list = pushJank(list, olay(i), 5);
    expect(list.map((j) => j.at)).toEqual([2, 3, 4, 5, 6]);
  });

  it("varsayılan sınır JANK_LIMIT", () => {
    let list: JankEvent[] = [];
    for (let i = 0; i < JANK_LIMIT + 10; i++) list = pushJank(list, olay(i));
    expect(list.length).toBe(JANK_LIMIT);
  });
});

describe("takılmanın kuyruk değeri", () => {
  /*
   * ÖLÇÜLEN YANLIŞ TEŞHİS: ana iş parçacığı bilerek 900 ms bloke edildiğinde
   * panel "çizim 915 ms · kuyruk 0 ms" yazıyordu — yani sebebi tümüyle
   * JavaScript olan bir donmayı çizim tarafına yıkıyordu. Sebep sıralama:
   * bloklanma bitince gecikmiş rAF ile gecikmiş `setTimeout` birlikte kuyruğa
   * giriyor ve rAF önce koşarsa büyük sapma örneği henüz yok.
   *
   * Doğru cevap aralığı geriye okumak; bu testler o okumanın kurallarını
   * bağlıyor.
   */
  const ornekler = [
    { at: 100, drift: 1 },
    { at: 200, drift: 2 },
    { at: 1100, drift: 895 },
    { at: 1120, drift: 0 },
  ];

  it("aralıktaki en büyük sapmayı buluyor", () => {
    expect(maxDriftIn(ornekler, 190, 1200)).toBe(895);
  });

  it("aralık dışındaki sapmayı almıyor", () => {
    // Başka bir zamandaki donmanın sapmasını bu takılmaya yazmak, iki ayrı
    // olayı birbirine karıştırmak olurdu.
    expect(maxDriftIn(ornekler, 50, 300)).toBe(2);
  });

  it("geç kalan örnek de sayılıyor", () => {
    /*
     * Kritik durum: takılma 200'de kaydedildi, büyük sapma örneği 1100'de
     * geldi. Üst sınır "şimdi"ye kadar açık olduğu için yakalanıyor — bu
     * kapanmasa hatanın kendisi geri gelirdi.
     */
    expect(maxDriftIn(ornekler, 150, 1150)).toBe(895);
  });

  it("örnek yoksa sıfır", () => {
    // Sonda henüz ısınmamış olabilir. Sıfır burada doğru: "bu aralıkta
    // ölçülmüş bir sapma yok".
    expect(maxDriftIn([], 0, 1000)).toBe(0);
  });

  it("doldurma gecikmesi kullanıcının panelinden kısa", () => {
    // Panel saniyede bir örnekliyor; değer o örnekten ÖNCE dolmalı, yoksa
    // kullanıcı bir tur boyunca sıfır görür.
    expect(JANK_SETTLE_MS).toBeLessThan(1000);
  });

  it("örnek penceresi en uzun takılmayı kapsıyor", () => {
    // Pencere takılma eşiğinden kısa olsaydı uzun bir donmanın sapması
    // aralık okunmadan düşerdi.
    expect(TASK_SAMPLE_WINDOW).toBeGreaterThan(JANK_MS * 4);
  });
});

describe("eşikler", () => {
  it("takılma eşiği göze görünen bir gecikmede", () => {
    // 250 ms: 60 fps'de on beş kare. Bunun altı "kekeleme", üstü kullanıcının
    // "takıldı" dediği şey. Eşiği 100 ms'ye indirmek her kaydırmayı takılma
    // sayardı ve halka tampon gürültüyle dolup gerçek donmayı düşürürdü.
    expect(JANK_MS).toBe(250);
  });

  it("görev kuyruğu aralığı kare süresiyle aynı ölçekte", () => {
    /*
     * İki sonda YAN YANA okunuyor ("çizim 900 ms, kuyruk 4 ms"). Aralıklar
     * farklı ölçekte olsaydı bu karşılaştırma anlamsızlaşırdı: 500 ms'de bir
     * örneklenen bir kuyruk sondası, 200 ms'lik bir bloklanmayı çoğu zaman
     * hiç görmezdi ve panel "yalnızca çizim takıldı" derdi — tam olarak
     * yanlış teşhis.
     */
    expect(TASK_INTERVAL).toBeLessThanOrEqual(20);
  });

  it("kare penceresi yaklaşık bir dakika", () => {
    // Kullanıcı donmadan SONRA Ayarlar'ı açıyor; pencere o yolculuğu
    // atlatacak kadar uzun olmalı.
    expect(FRAME_WINDOW / 60).toBeGreaterThanOrEqual(50);
  });
});
