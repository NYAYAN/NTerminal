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

/** Dizini bilinmeyen kayıtlar. */
const gecmis = (...komutlar: string[]) => komutlar.map((command) => ({ command, cwd: null }));

const HISTORY = gecmis(
  "npm run bundle",
  "npm test",
  "git status",
  "npm run dev",
  "git commit -m x",
  "npm test",
  "dotnet run",
);

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
    expect(rankSuggestions(gecmis("Git Status"), "git")).toEqual(["Git Status"]);
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
    expect(rankSuggestions(gecmis("git commit"), "commit")).toEqual([]);
  });

  it("boş ve boşluklu kayıtlar atlanıyor", () => {
    expect(rankSuggestions(gecmis("", "   ", "npm test"), "npm")).toEqual(["npm test"]);
  });

  it("kayıtların baş/son boşlukları kırpılıyor", () => {
    expect(rankSuggestions(gecmis("  npm test  "), "npm")).toEqual(["npm test"]);
  });

  it("sınır uygulanıyor", () => {
    const many = gecmis(...Array.from({ length: 50 }, (_, i) => `npm run task-${i}`));
    expect(rankSuggestions(many, "npm")).toHaveLength(MAX_SUGGESTIONS);
    expect(rankSuggestions(many, "npm", null, 3)).toHaveLength(3);
  });
});

describe("dizine göre öncelik", () => {
  /**
   * Bildirilen belirti: `.../src-tauri/target` içinde `cd t` yazınca liste
   * `cd NTerminal` öneriyordu — o klasör orada YOK, yani öneri kabul edilse
   * komut hata verirdi. Yol içeren komutlar bulundukları dizine bağlı ama
   * geçmiş tek bir havuz.
   */
  const KARISIK = [
    { command: "cd NTerminal", cwd: "/repo" },
    { command: "cd ..", cwd: "/repo/src-tauri/target" },
    { command: "cd src-tauri", cwd: "/repo" },
    { command: "cd target", cwd: "/repo/src-tauri/target" },
  ];

  it("aynı dizinde çalıştırılanlar önce geliyor", () => {
    const out = rankSuggestions(KARISIK, "cd", "/repo/src-tauri/target");
    expect(out.slice(0, 2), "bu dizinin komutları üstte değil").toEqual(["cd ..", "cd target"]);
  });

  it("başka dizindekiler atılmıyor, altta kalıyor", () => {
    // Süzmek kullanıcıdan bir şey götürürdü: `npm test` her yerde geçerli.
    const out = rankSuggestions(KARISIK, "cd", "/repo/src-tauri/target");
    expect(out).toHaveLength(4);
    expect(out.slice(2)).toEqual(["cd NTerminal", "cd src-tauri"]);
  });

  it("dizin bilinmiyorsa eski sıra korunuyor", () => {
    // Geçmişten gelen eski kayıtların dizini boş olabilir.
    expect(rankSuggestions(KARISIK, "cd", null)).toEqual([
      "cd NTerminal",
      "cd ..",
      "cd src-tauri",
      "cd target",
    ]);
  });

  it("aynı dizin kotayı doldurursa diğerleri hiç girmiyor", () => {
    const cok = Array.from({ length: 8 }, (_, i) => ({ command: `cd k${i}`, cwd: "/burada" }));
    const out = rankSuggestions([...cok, { command: "cd baska", cwd: "/orada" }], "cd", "/burada");
    expect(out).toHaveLength(MAX_SUGGESTIONS);
    expect(out.includes("cd baska"), "başka dizinin komutu üste çıkmış").toBe(false);
  });
});

describe("öneriyi kabul etme dizisi", () => {
  it("devam ediyorsa yalnızca kalanı yazıyor", () => {
    // Hiçbir şey silinmiyor: kabuğun satır düzenleyicisiyle en az temas.
    expect(acceptKeys("npm t", "npm test")).toBe("est");
  });

  it("satır okunamadığında hiçbir şey yazmıyor", () => {
    // ÖLÇÜLEN HATA — ve bu testin ilk hâli tam tersini bağlıyordu
    // (`acceptKeys("", "npm test")` → `"npm test"`), yani hatayı korumuş.
    //
    // Boş `current` "satır boş" demek DEĞİL, "satırı okuyamadım" demek: istem
    // işareti yoksa ya da komut çalışıyorsa okuma boş dönüyor. O durumda
    // önerinin tamamını yazmak, satırda zaten yazılı olanın üstüne ikinci bir
    // kopya gönderiyor. Kullanıcının geçmişine böyle bir kayıt düştü:
    // `yarn start:devyarn start:dev`.
    expect(acceptKeys("", "npm test")).toBe("");
  });

  it("aynı komutu ikinci kez yazmıyor", () => {
    const yazilan = "yarn start:dev";
    for (const current of ["", "y", "yarn", "yarn start:de", yazilan]) {
      const keys = acceptKeys(current, yazilan);
      expect(current + keys, `current=${JSON.stringify(current)}`).not.toContain(
        yazilan + yazilan,
      );
    }
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

  it("kabuğun hayalet önerisi satırın parçası sayılmıyor", () => {
    // ÖLÇÜLEN BELİRTİ: geçmişte hem `yarn start:dev` hem `yarn start:prod`
    // varken `yarn` yazınca liste hiç açılmıyordu. Sebep zsh-autosuggestions'ın
    // imlecin sağına çizdiği soluk `start:dev`: ekrandan okununca satırın
    // parçası görünüyor ve "imleç ortada" sanılıyordu. Yani kabuk öneri
    // verebildiği HER AN bizim listemiz susuyordu — oysa listenin bütün değeri
    // birden çok seçeneği yan yana göstermesi.
    expect(canSuggest("yarn", "yarn start:dev"), "hayalet metin listeyi kapatıyor").toBe(false);
    expect(canSuggest("yarn", "yarn start:dev", true), "hayalet metin ayırt edilmiyor").toBe(true);
  });

  it("hayalet bayrağı imleci satır ortasına taşımıyor", () => {
    // Bayrak yalnızca SAĞDAKİ metni yok sayıyor. Önek satırın başında değilse
    // durum yine "imleç ortada" ve öneri gösterilmemeli.
    expect(canSuggest("start", "yarn start:dev", true)).toBe(false);
  });
});
