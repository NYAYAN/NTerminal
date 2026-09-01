import { describe, expect, it } from "vitest";

import { extractServerUrls, shortUrl } from "./serverLinks";

describe("sunucu adresi yakalama", () => {
  it("yaygın başlangıç satırlarını yakalıyor", () => {
    const ornekler: [string, string][] = [
      ["Now listening on: http://localhost:5000", "http://localhost:5000"],
      ["  ➜  Local:   http://localhost:5173/", "http://localhost:5173"],
      ["Serving at https://127.0.0.1:8443", "https://127.0.0.1:8443"],
      ["** Angular Live Development Server is listening on localhost:4200, open http://localhost:4200/ **", "http://localhost:4200"],
    ];
    for (const [satir, beklenen] of ornekler) {
      expect(extractServerUrls(satir), satir).toEqual([beklenen]);
    }
  });

  it("uzak adresleri ELEMİYOR olsaydı liste gürültüye boğulurdu", () => {
    // Loglar paket kayıtları, belgeler ve hata izlerindeki bağlantılarla dolu.
    // Aranan şey bu makinede açılan port.
    const log = [
      "npm notice see https://github.com/npm/cli/releases",
      "Now listening on: http://localhost:5000",
      "docs at https://angular.dev/guide",
    ].join("\n");
    expect(extractServerUrls(log)).toEqual(["http://localhost:5000"]);
  });

  it("ANSI renkleri adresi bölmüyor", () => {
    // Çıktı renkli geliyor ve kaçış dizileri adresin ortasına giriyor;
    // temizlemeden eşleşme adresin sonunu kaçırıyor.
    const renkli = "\u001b[32mListening\u001b[0m on \u001b[36mhttp://localhost:3000\u001b[0m";
    expect(extractServerUrls(renkli)).toEqual(["http://localhost:3000"]);
  });

  it("tekrarları teke indiriyor, sırayı koruyor", () => {
    const log = [
      "http://localhost:4200",
      "http://127.0.0.1:9229",
      "http://localhost:4200",
    ].join("\n");
    expect(extractServerUrls(log)).toEqual(["http://localhost:4200", "http://127.0.0.1:9229"]);
  });

  it("aynı sunucunun farklı yolları TEK rozet", () => {
    /*
     * BİLDİRİLEN HATA. `dotnet run` ile açılan sunucuda tarayıcıdan uç
     * noktalara istek attıkça şerit doluyordu: her istek günlüğü yeni bir
     * adres sayılıyor ve dört rozetlik yer aynı sunucunun rastgele
     * yollarıyla kapanıyordu. Şeridin cevapladığı soru "sunucu hangi
     * adreste", "hangi istekler geldi" değil.
     */
    const log = [
      "Now listening on: http://localhost:1453",
      "Request starting HTTP/1.1 GET http://localhost:1453/portal/VehicleList - -",
      "Request starting HTTP/1.1 GET http://localhost:1453/portal/VehicleAccidentList - -",
      "Request finished HTTP/1.1 GET http://localhost:1453/port",
    ].join("\n");
    expect(extractServerUrls(log)).toEqual(["http://localhost:1453"]);
  });

  it("farklı portlar ayrı rozet kalıyor", () => {
    // Teklileştirme kökene göre: aynı makinede iki sunucu iki ayrı adres.
    // Bunları da birleştirmek asıl bilgiyi yok ederdi.
    const log = [
      "API:   http://localhost:1453/swagger",
      "Web:   http://localhost:4200/",
    ].join("\n");
    expect(extractServerUrls(log)).toEqual([
      "http://localhost:1453",
      "http://localhost:4200",
    ]);
  });

  it("şema ayrımı korunuyor", () => {
    // http ve https aynı portta farklı köken; ikisi de gerçekten çalışıyor
    // olabilir ve tıklanan adresin doğru şemayı taşıması gerekiyor.
    const log = ["http://localhost:5000", "https://localhost:5001"].join("\n");
    expect(extractServerUrls(log)).toEqual(["http://localhost:5000", "https://localhost:5001"]);
  });

  it("ASP.NET'in dinleme satırı yakalanıyor", () => {
    /*
     * BILDIRILEN HATA: Angular tarafında sunucu şeridi çıkıyordu, .NET arka
     * ucunda hiç çıkmıyordu. Sebep IPv6 yazımı: `new URL(...).hostname` bir
     * IPv6 adresi için KÖŞELİ PARANTEZLİ biçim veriyor (`[::]`), yerel adres
     * listesinde ise parantezsiz `::` duruyordu — yani hiç eşleşmiyordu.
     *
     * Joker adres `localhost`a çevriliyor: `http://[::]:1452` tarayıcıya
     * yazılabilecek bir adres değil, kullanıcının aradığı cevap ise
     * "bu porta nasıl erişirim".
     */
    const log = "[17:03:55 INF] Now listening on: http://[::]:1452 {\"EventId\": 14}";
    expect(extractServerUrls(log)).toEqual(["http://localhost:1452"]);
  });

  it("0.0.0.0 da localhost olarak gösteriliyor", () => {
    // Aynı sebep: tıklanabilir olması gerekiyor.
    expect(extractServerUrls("Now listening on: http://0.0.0.0:5000")).toEqual([
      "http://localhost:5000",
    ]);
  });

  it("gerçek IPv6 geri döngü adresi korunuyor", () => {
    // `[::1]` joker DEĞİL, gerçek bir adres ve tarayıcıda çalışıyor.
    expect(extractServerUrls("Serving at http://[::1]:8080")).toEqual(["http://[::1]:8080"]);
  });

  it("joker ve localhost aynı porta işaret ediyorsa tek rozet", () => {
    // Kestrel iki satır yazabiliyor; ikisi de aynı sunucu.
    const log = [
      "Now listening on: http://[::]:1452",
      "Now listening on: http://localhost:1452",
    ].join("\n");
    expect(extractServerUrls(log)).toEqual(["http://localhost:1452"]);
  });

  it("sınır sayısını aşmıyor", () => {
    const log = Array.from({ length: 20 }, (_, i) => `http://localhost:${4000 + i}`).join("\n");
    expect(extractServerUrls(log, 3)).toHaveLength(3);
  });

  it("sondaki noktalama adresin parçası sayılmıyor", () => {
    expect(extractServerUrls("Ready at http://localhost:8080.")).toEqual([
      "http://localhost:8080",
    ]);
  });

  it("adres yoksa boş liste", () => {
    expect(extractServerUrls("Build succeeded in 36,5s")).toEqual([]);
  });

  it("rozet metni kısa", () => {
    // Rozet dar bir yer ve `http://` her adreste aynı - ayırt etmiyor.
    expect(shortUrl("http://localhost:5173/")).toBe("localhost:5173");
    expect(shortUrl("https://127.0.0.1:8443")).toBe("127.0.0.1:8443");
  });
});
