import { describe, expect, it } from "vitest";

import { MAX_SUGGESTIONS, MIN_PREFIX, acceptKeys, canSuggest, cycleIndex, rankSuggestions } from "./suggest";

/**
 * Komut önerisinin saf mantığı.
 *
 * Bu kodun yanlış çalışması iki farklı biçimde zarar veriyor:
 *  - Yanlış sıralama: öneri işe yaramaz olur, kullanıcı görmezden gelmeye başlar.
 *  - Yanlış kabul dizisi: kabuğa fazladan silme gönderilir ve kullanıcının
 *    yazdığı metin BOZULUR. İkincisi geri alınamaz bir hata; testlerin çoğu
 *    orada.
 */

const HISTORY = [
  "npm run bundle",
  "npm test",
  "git status",
  "npm run dev",
  "git commit -m x",
  "npm test",
  "dotnet run",
];

describe("öneri sıralaması", () => {
  it("ön eke uyanları en yeniden eskiye veriyor", () => {
    expect(rankSuggestions(HISTORY, "npm")).toEqual([
      "npm run bundle",
      "npm test",
      "npm run dev",
    ]);
  });

  it("yinelenenleri en yeni konumunda tutuyor", () => {
    // "npm test" iki kez var; iki kez listelenmemeli ve ilk (yeni) yerinde
    // kalmalı.
    const out = rankSuggestions(HISTORY, "npm");
    expect(out.filter((c) => c === "npm test")).toHaveLength(1);
    expect(out.indexOf("npm test")).toBe(1);
  });

  it("büyük/küçük harf ayrımı yapmıyor", () => {
    expect(rankSuggestions(HISTORY, "NPM TE")).toEqual(["npm test"]);
    expect(rankSuggestions(["Git Status"], "git")).toEqual(["Git Status"]);
  });

  it("yazılanın aynısını önermiyor", () => {
    // Kabul etmek hiçbir şey değiştirmeyeceği için gürültü.
    expect(rankSuggestions(HISTORY, "git status")).toEqual([]);
    expect(rankSuggestions(HISTORY, "npm test")).toEqual([]);
  });

  it("kısa ön ekte öneri yok", () => {
    // Tek harfte neredeyse her şey eşleşir; liste yararsız olur.
    expect(MIN_PREFIX).toBe(2);
    expect(rankSuggestions(HISTORY, "")).toEqual([]);
    expect(rankSuggestions(HISTORY, "n")).toEqual([]);
    expect(rankSuggestions(HISTORY, "np").length).toBeGreaterThan(0);
  });

  it("eşleşme yoksa boş", () => {
    expect(rankSuggestions(HISTORY, "kubectl")).toEqual([]);
    expect(rankSuggestions([], "npm")).toEqual([]);
  });

  it("ortada geçen metin ön ek sayılmıyor", () => {
    // Bulanık/altdizi eşleşmesi bilinçli olarak yok: öneri yazılanın devamı.
    expect(rankSuggestions(["git commit"], "commit")).toEqual([]);
  });

  it("boş ve boşluklu kayıtlar atlanıyor", () => {
    expect(rankSuggestions(["", "   ", "npm test"], "npm")).toEqual(["npm test"]);
  });

  it("kayıtların baş/son boşlukları kırpılıyor", () => {
    expect(rankSuggestions(["  npm test  "], "npm")).toEqual(["npm test"]);
  });

  it("sınır uygulanıyor", () => {
    const many = Array.from({ length: 50 }, (_, i) => `npm run task-${i}`);
    expect(rankSuggestions(many, "npm")).toHaveLength(MAX_SUGGESTIONS);
    expect(rankSuggestions(many, "npm", 3)).toHaveLength(3);
  });
});

describe("öneriyi kabul etme dizisi", () => {
  it("devam ediyorsa yalnızca kalanı yazıyor", () => {
    // Hiçbir şey silinmiyor: kabuğun satır düzenleyicisiyle en az temas.
    expect(acceptKeys("npm t", "npm test")).toBe("est");
    expect(acceptKeys("", "npm test")).toBe("npm test");
  });

  it("büyük/küçük harf farkında yazılanı geri siliyor", () => {
    // "NPM t" yazılmış, öneri "npm test": kalanı eklemek "NPM test" verirdi.
    expect(acceptKeys("NPM t", "npm test")).toBe("\x7f\x7f\x7f\x7f\x7fnpm test");
  });

  it("silme sayısı yazılan karakter sayısıyla birebir", () => {
    const current = "gitt sta";
    const keys = acceptKeys(current, "git status");
    const deletes = keys.split("").filter((c) => c === "\x7f").length;
    expect(deletes, "fazla silme kullanıcının yazdığını bozar").toBe(current.length);
    expect(keys.slice(deletes)).toBe("git status");
  });

  it("aynıysa hiçbir şey göndermiyor", () => {
    expect(acceptKeys("npm test", "npm test")).toBe("");
  });

  it("DEL kullanılıyor, backspace değil", () => {
    // \b bazı kabuklarda yalnızca imleci kaydırıyor, metni silmiyor.
    const keys = acceptKeys("ab", "xy");
    expect(keys.startsWith("\x7f\x7f")).toBe(true);
    expect(keys).not.toContain("\b");
  });

  it("çok baytlı karakterlerde silme sayısı JS karakteri başına", () => {
    // Terminal satır düzenleyicisi kod noktası başına siliyor; ölçüyü
    // dizgenin kendi uzunluğundan alıyoruz.
    const current = "ça";
    expect(acceptKeys(current, "xyz")).toBe("\x7f\x7fxyz");
  });
});

describe("liste dolanması", () => {
  it("ileri ve geri dolanıyor", () => {
    expect(cycleIndex(0, 3, 1)).toBe(1);
    expect(cycleIndex(2, 3, 1)).toBe(0);
    expect(cycleIndex(0, 3, -1)).toBe(2);
    expect(cycleIndex(1, 3, -1)).toBe(0);
  });

  it("tek öğede yerinde kalıyor", () => {
    expect(cycleIndex(0, 1, 1)).toBe(0);
    expect(cycleIndex(0, 1, -1)).toBe(0);
  });

  it("boş listede çökmüyor", () => {
    expect(cycleIndex(0, 0, 1)).toBe(0);
    expect(cycleIndex(5, 0, -1)).toBe(0);
  });
});

describe("öneri gösterme koşulu", () => {
  it("imleç satır sonundayken gösteriyor", () => {
    expect(canSuggest("npm t", "npm t")).toBe(true);
  });

  it("imleç ortadayken göstermiyor", () => {
    // Kabul etmek imlecin sağındaki metni yok sayardı.
    expect(canSuggest("npm", "npm test")).toBe(false);
  });

  it("kısa ya da boş ön ekte göstermiyor", () => {
    expect(canSuggest("n", "n")).toBe(false);
    expect(canSuggest("", "")).toBe(false);
    expect(canSuggest("  ", "  ")).toBe(false);
  });
});
