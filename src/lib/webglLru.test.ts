import { describe, expect, it } from "vitest";

import { MAX_WEBGL, demote, drop, evictions, touch } from "./webglLru";

/**
 * WebGL bağlamı sırasının kuralları.
 *
 * ## Ne bağlıyor
 *
 * BİLDİRİLEN BELİRTİ: "sekmeler arası geçişte yavaşlıyor, `ng build`
 * `dotnet run` gibi komutları çalıştırınca." Ölçülen: altı sekme, dördünde
 * kesintisiz çıktı akarken geçiş 50-84 ms, geçiş başına en büyük kare boşluğu
 * 70 ms. Örnekleme profili sebebi isimle verdi — bağlam odakla birlikte alınıp
 * verildiği için her geçiş İKİ oluşturucu kurulumu ödüyordu (ayrıntı
 * `webglLru.ts` başında).
 *
 * Bu testler düzeltmenin üç kuralını bağlıyor. Üçü de sessizce bozulabilir:
 * yanlış sıralama gözle görünmez, yalnızca geçiş yine yavaşlar.
 */

type Sekme = { ad: string; gorunur: boolean };
const s = (ad: string, gorunur = false): Sekme => ({ ad, gorunur });
const adlar = (l: readonly Sekme[]) => l.map((x) => x.ad);

describe("sıraya alma", () => {
  it("yeni öğe sonda", () => {
    const a = s("a");
    const b = s("b");
    expect(adlar(touch(touch([], a), b))).toEqual(["a", "b"]);
  });

  it("var olan öğe sona taşınıyor, kopyalanmıyor", () => {
    // Kopyalanması tavanı yanlış saydırır: aynı oturum iki kez sayılıp
    // bağlamı olan başka bir terminal boşuna düşürülürdü.
    const a = s("a");
    const b = s("b");
    const c = s("c");
    const lru = [a, b, c];
    expect(adlar(touch(lru, a))).toEqual(["b", "c", "a"]);
  });

  it("girdiyi değiştirmiyor", () => {
    const a = s("a");
    const lru = [a, s("b")];
    touch(lru, a);
    expect(adlar(lru)).toEqual(["a", "b"]);
  });
});

describe("geriye atma", () => {
  it("görünmez olan ilk kurban sırasına geçiyor", () => {
    /*
     * Bağlam görünmez olunca BIRAKILMIYOR — geri dönülürse kurulum bedeli
     * ödenmesin, düzeltmenin tamamı bu. Ama yeni bir istek geldiğinde ilk
     * düşecek o olmalı, yoksa tavan ekrandaki bir terminali düşürür.
     */
    const a = s("a");
    const b = s("b");
    const c = s("c");
    expect(adlar(demote([a, b, c], c))).toEqual(["c", "a", "b"]);
  });

  it("listede olmayan öğe eklenmiyor", () => {
    // Bağlamı olmayan bir terminali sıraya sokmak onu var sayardı ve tavan
    // dolmuş gibi görünürdü.
    const a = s("a");
    const yabanci = s("yok");
    expect(adlar(demote([a], yabanci))).toEqual(["a"]);
  });
});

describe("düşürme", () => {
  it("öğeyi çıkarıyor", () => {
    const a = s("a");
    const b = s("b");
    expect(adlar(drop([a, b], a))).toEqual(["b"]);
  });

  it("olmayan öğede liste aynı kalıyor", () => {
    const a = s("a");
    expect(adlar(drop([a], s("yok")))).toEqual(["a"]);
  });
});

describe("tavan aşılınca kim düşer", () => {
  it("tavanın altında kimse düşmüyor", () => {
    const lru = [s("a"), s("b")];
    expect(evictions(lru, 4, lru[1], (x) => x.gorunur)).toEqual([]);
  });

  it("önce GÖRÜNMEYEN, en eskiden başlayarak", () => {
    // Görünen bir terminalin bağlamını almak, ekranda o an duran bir şeyi DOM
    // oluşturucuya düşürmek demek — bölme kipinde doğrudan görünür bir kayıp.
    const eskiGizli = s("eski-gizli");
    const gorunen = s("gorunen", true);
    const yeniGizli = s("yeni-gizli");
    const istekte = s("istekte", true);
    const lru = [eskiGizli, gorunen, yeniGizli, istekte];
    expect(adlar(evictions(lru, 3, istekte, (x) => x.gorunur))).toEqual(["eski-gizli"]);
  });

  it("istek yapan asla düşmüyor", () => {
    /*
     * Kendini düşürmek sonsuz döngü olurdu: istek bağlam kuruyor, tavan onu
     * hemen geri alıyor, sonraki karede yine kuruluyor. Sekme geçişi
     * yavaşlamaz — tümüyle kilitlenirdi.
     */
    const istekte = s("istekte", true);
    const lru = [istekte, s("b", true), s("c", true), s("d", true), s("e", true)];
    const dusen = evictions(lru, 2, istekte, (x) => x.gorunur);
    expect(dusen).not.toContain(istekte);
    expect(dusen.length).toBe(3);
  });

  it("hepsi görünürse en eski görünen düşüyor", () => {
    // Tavan bir kalite tercihi değil motorun sınırı: görünmez kalmadıysa
    // birinin düşmesi gerekiyor.
    const a = s("a", true);
    const b = s("b", true);
    const c = s("c", true);
    expect(adlar(evictions([a, b, c], 2, c, (x) => x.gorunur))).toEqual(["a"]);
  });

  it("birden fazla fazlalıkta hepsi seçiliyor", () => {
    const lru = [s("a"), s("b"), s("c"), s("d"), s("e", true)];
    expect(adlar(evictions(lru, 2, lru[4], (x) => x.gorunur))).toEqual(["a", "b", "c"]);
  });
});

describe("tavan", () => {
  it("motorun sınırının çok altında", () => {
    // Chromium canlı bağlam sayısını ~16 ile sınırlıyor ve aşılınca EN ESKİYİ
    // kaybediyor: o terminalde gözle görülür bir sıçrama oluyor. Dört, tipik
    // kullanımı (bir-iki sekme arasında gezinmek) karşılıyor ve sınıra
    // yaklaşmıyor.
    expect(MAX_WEBGL).toBeGreaterThanOrEqual(2);
    expect(MAX_WEBGL).toBeLessThanOrEqual(8);
  });
});
