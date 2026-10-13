import { describe, expect, it } from "vitest";

import { WheelScroller, wheelLines } from "./wheelScroll";

/**
 * Tekerlek kaydırmasının mesafesi ve zamanlaması.
 *
 * Ölçülen belirti (bkz. `wheelScroll.ts` başı): xterm 6 her çentikte görünümü
 * tek karede ~3 satır atlatıp 5-6 kare duruyordu; saniyede 10 çentikte 40
 * çentik = 38 sıçrama + 195 boş kare. Bu testler iki şeyi bağlıyor: mesafe
 * xterm'inkiyle AYNI kalıyor (kullanıcının alıştığı hız değişmiyor) ve
 * hareket karelere yayılıyor (sıçrama yok, düzenli aralık).
 */

/** 13 px yazı, 1,15 satır aralığı: bu makinedeki terminalin ölçülen hücresi. */
const CELL = 17;

/** Chromium'un (WebView2) bir tekerlek çentiği: aşağı. */
const CENTIK_ASAGI = { deltaY: 100, deltaMode: 0, wheelDeltaY: -120, altKey: false };
const CENTIK_YUKARI = { deltaY: -100, deltaMode: 0, wheelDeltaY: 120, altKey: false };

const FRAME = 1000 / 60;

/** Bir hareketi bitene kadar karelerle sürer; kare başına uygulanan satırlar. */
function sur(s: WheelScroller, dt = FRAME, sinir = 200): number[] {
  const out: number[] = [];
  for (let i = 0; i < sinir && !s.idle; i++) out.push(s.step(dt));
  return out;
}

const topla = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("çentiğin mesafesi xterm'inkiyle aynı", () => {
  it("bir çentik 50 piksel: 17 px hücrede ~2,94 satır", () => {
    // xterm 6 / VS Code: wheelDeltaY / 120 * 50 piksel. Canlıda ölçülen: 150
    // çentik 441 satır kaydırdı (2,94).
    expect(wheelLines(CENTIK_ASAGI, CELL)).toBeCloseTo(50 / 17, 5);
    expect(wheelLines(CENTIK_YUKARI, CELL)).toBeCloseTo(-50 / 17, 5);
  });

  it("Alt basılıyken hızlı kaydırma çarpanı uygulanıyor", () => {
    expect(wheelLines({ ...CENTIK_YUKARI, altKey: true }, CELL)).toBeCloseTo((-50 * 5) / 17, 5);
    expect(wheelLines({ ...CENTIK_YUKARI, altKey: true }, CELL, 1, 2)).toBeCloseTo((-50 * 2) / 17, 5);
  });

  it("`wheelDeltaY` yoksa satır ve piksel kipleri VS Code gibi çevriliyor", () => {
    // DOM_DELTA_LINE: deltaY doğrudan çentik sayısı.
    expect(wheelLines({ deltaY: 3, deltaMode: 1, altKey: false }, CELL)).toBeCloseTo((50 * 3) / 17, 5);
    // DOM_DELTA_PIXEL: 40 piksel bir çentik.
    expect(wheelLines({ deltaY: -40, deltaMode: 0, altKey: false }, CELL)).toBeCloseTo(-50 / 17, 5);
  });

  it("çok küçük hareket en az bir piksele yuvarlanıyor", () => {
    // Yavaş bir dokunmatik yüzey hareketi: 1/120 çentik = 0,42 piksel. Sıfıra
    // yuvarlansaydı yavaş kaydırma hiç ilerlemezdi.
    expect(wheelLines({ deltaY: 1, deltaMode: 0, wheelDeltaY: -1, altKey: false }, CELL)).toBeCloseTo(1 / 17, 5);
  });

  it("hücre ölçülmemişse sıfır: olay xterm'e bırakılmalı", () => {
    expect(wheelLines(CENTIK_ASAGI, 0)).toBe(0);
    expect(wheelLines(CENTIK_ASAGI, Number.NaN)).toBe(0);
  });
});

describe("hareket karelere yayılıyor", () => {
  it("tek çentik: ilk karede başlıyor, hiçbir karede birden fazla satır atlamıyor", () => {
    const s = new WheelScroller(() => 40);
    s.add(wheelLines(CENTIK_YUKARI, CELL));
    const adimlar = sur(s);

    expect(adimlar[0], "ilk kare kıpırdamadı: tekerlek gecikmeli hissettirir").toBe(-1);
    expect(Math.min(...adimlar), "bir karede birden fazla satır sıçradı").toBe(-1);
    expect(topla(adimlar), "çentik eskisi kadar kaydırmadı").toBe(-3);
    // 100 ms: VS Code'un terminalde kullandığı 125 ms'den kısa, tek karelik
    // sıçramadan uzun.
    expect(adimlar.length).toBeLessThanOrEqual(6);
  });

  it("tek çentiğin satırları düzenli aralıkla geliyor (1., 3., 5. kare)", () => {
    // Düzensiz aralık ("üç kare kayıp üç kare durmak") gözde yine takılma
    // olarak okunuyor; ölçülen belirtinin ta kendisi.
    const s = new WheelScroller(() => 40);
    s.add(wheelLines(CENTIK_ASAGI, CELL));
    const adimlar = sur(s);
    const kayan = adimlar.flatMap((x, i) => (x !== 0 ? [i] : []));
    expect(kayan).toEqual([0, 2, 4]);
  });

  it("art arda çentiklerde toplam, kesirler birikerek doğru kalıyor", () => {
    // 2,94 satırlık çentikler tek tek yuvarlansaydı hep 3 (ya da hep 2)
    // olurdu; kesir taşındığı için 17 çentikte 50 satır, xterm'deki gibi.
    const s = new WheelScroller(() => 40);
    let toplam = 0;
    for (let i = 0; i < 17; i++) {
      s.add(wheelLines(CENTIK_ASAGI, CELL));
      toplam += topla(sur(s));
    }
    expect(toplam).toBe(Math.round((17 * 50) / 17));
  });

  it("saniyede 25 çentik: görünüm durmadan ilerliyor, en fazla iki satır", () => {
    // Sürekli dönen tekerlek: önceki hâlde 75 karede 3 satırlık sıçrama ve
    // arada 104 boş kare ölçülmüştü.
    //
    // Tek tük boş kare kalabiliyor (yuvarlama: 2 satırlık bir kareden sonra
    // kesir yarımın altında kalıyor) ama ART ARDA iki boş kare, yani gözün
    // "durdu" diye okuyacağı bir duraklama olmamalı.
    const s = new WheelScroller(() => 40);
    const adimlar: number[] = [];
    let siradaki = 0;
    for (let kare = 0; kare < 120; kare++) {
      const t = kare * FRAME;
      while (siradaki <= t) {
        s.add(wheelLines(CENTIK_ASAGI, CELL));
        siradaki += 40;
      }
      adimlar.push(s.step(FRAME));
    }
    // Isınmadan sonraki kareler (ilk 10 kare hızlanma).
    const kararli = adimlar.slice(10);
    expect(kararli.join(""), "sürekli kaydırmada görünüm iki kare durdu").not.toContain("00");
    expect(kararli.filter((x) => x === 0).length).toBeLessThanOrEqual(kararli.length * 0.05);
    expect(Math.max(...kararli)).toBeLessThanOrEqual(2);
  });

  it("144 Hz ekranda da tek çentik satır satır ve ~110 ms içinde bitiyor", () => {
    const s = new WheelScroller(() => 40);
    s.add(wheelLines(CENTIK_ASAGI, CELL));
    const adimlar = sur(s, 1000 / 144);
    expect(Math.max(...adimlar)).toBe(1);
    expect(topla(adimlar)).toBe(3);
    expect(adimlar.length * (1000 / 144)).toBeLessThanOrEqual(110);
  });

  it("dokunmatik yüzeyin küçük adımı bekletilmeden uygulanıyor ve birikiyor", () => {
    // Yüzey olayları zaten sık ve küçük; onları karelere yaymak yalnızca
    // gecikme eklerdi.
    const s = new WheelScroller(() => 40);
    let toplam = 0;
    for (let i = 0; i < 10; i++) {
      s.add(0.3);
      toplam += s.step(FRAME);
      expect(s.idle, "küçük adım bir sonraki kareye kaldı").toBe(true);
    }
    expect(toplam).toBe(3);
  });
});

describe("yön, tavan ve sıfırlama", () => {
  it("yön değişince eski yönün kalanı atılıyor", () => {
    const s = new WheelScroller(() => 40);
    s.add(10);
    s.step(FRAME);
    s.add(-3);
    const adimlar = sur(s);
    expect(adimlar.every((x) => x <= 0), "ters çevrilen tekerlek önce eski yönü bitirdi").toBe(true);
    expect(topla(adimlar)).toBe(-3);
  });

  it("bekleyen hareket üç ekranla sınırlı", () => {
    // Serbest dönen tekerlek: bırakıldıktan sonra görünüm sonsuza kadar kaymasın.
    const s = new WheelScroller(() => 40);
    for (let i = 0; i < 1000; i++) s.add(wheelLines(CENTIK_YUKARI, CELL));
    expect(topla(sur(s))).toBe(-120);
  });

  it("sıfırlanınca hiçbir şey kalmıyor", () => {
    const s = new WheelScroller(() => 40);
    s.add(7.5);
    s.step(FRAME);
    s.reset();
    expect(s.idle).toBe(true);
    expect(s.step(FRAME)).toBe(0);
  });

  it("sayı olmayan girdi yok sayılıyor", () => {
    const s = new WheelScroller(() => 40);
    s.add(Number.NaN);
    s.add(Number.POSITIVE_INFINITY);
    expect(s.idle).toBe(true);
  });
});
