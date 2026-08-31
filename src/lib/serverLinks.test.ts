import { describe, expect, it } from "vitest";

import { extractServerUrls, shortUrl } from "./serverLinks";

describe("sunucu adresi yakalama", () => {
  it("yaygın başlangıç satırlarını yakalıyor", () => {
    const ornekler: [string, string][] = [
      ["Now listening on: http://localhost:5000", "http://localhost:5000"],
      ["  ➜  Local:   http://localhost:5173/", "http://localhost:5173/"],
      ["Serving at https://127.0.0.1:8443", "https://127.0.0.1:8443"],
      ["** Angular Live Development Server is listening on localhost:4200, open http://localhost:4200/ **", "http://localhost:4200/"],
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
