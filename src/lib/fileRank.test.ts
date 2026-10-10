import { describe, expect, it } from "vitest";

import { fileMatch, fileScore, fuzzyScore, rankFiles } from "./format";

/**
 * Ctrl+P dosya aramasının sıralaması.
 *
 * BİLDİRİLEN HATA: kutuya "environment" yazınca eşleşen dosya listenin EN
 * SONUNDA kalıyordu; beklenen ise eşleşenlerin en üstte olması.
 *
 * Sebep sıralamanın ters yazılmasıydı. `fuzzyScore` KÜÇÜK puanı iyi sayıyor —
 * tam alt dizi eşleşmesinde harfin bulunduğu KONUMU döndürüyor, yani 0 en iyi.
 * Azalan sıralama (`b.score - a.score`) listeyi baş aşağı çeviriyor: zayıf
 * bulanık eşleşmeler başa, tam eşleşme sona gidiyor.
 *
 * İkinci ve daha sinsi sonucu sınırdı: kesme sıralamadan SONRA yapıldığı için
 * iki yüzden fazla eşleşmesi olan bir depoda aranan dosya listeye HİÇ
 * girmiyordu. Aşağıdaki son test tam olarak onu tutuyor.
 */

describe("dosya sıralaması", () => {
  it("tam eşleşme en üstte", () => {
    const files = [
      "src/app/core/services/authentication.service.ts",
      "src/environments/environment.ts",
      "node_modules/e/n/v/i/r/o/n/m/e/n/t/other.js",
    ];
    expect(rankFiles(files, "environment", 200)[0]).toBe("src/environments/environment.ts");
  });

  it("puanı küçük olan önce geliyor", () => {
    // Kuralın kendisi: sıra `fuzzyScore`un artan sırası olmalı.
    const files = ["zzz/aaa/target.ts", "target.ts"];
    const sirali = rankFiles(files, "target", 200);
    expect(fuzzyScore(sirali[0], "target")!).toBeLessThanOrEqual(
      fuzzyScore(sirali[1], "target")!,
    );
    // Kökteki dosya alt klasördekinden önce: konum daha küçük.
    expect(sirali[0]).toBe("target.ts");
  });

  it("eşleşmeyen dosya listede yok", () => {
    expect(rankFiles(["a.ts", "b.ts"], "zzzq", 200)).toEqual([]);
  });

  it("boş sorguda liste olduğu gibi kırpılıyor", () => {
    // Sorgu yokken sıralanacak bir şey de yok; listenin kendi sırası kalıyor.
    expect(rankFiles(["a", "b", "c"], "  ", 2)).toEqual(["a", "b"]);
  });

  it("sınır EN İYİLERİ kesiyor, en kötüleri değil", () => {
    /*
     * Ters sıralamanın en sinsi sonucu buydu ve yalnızca büyük depolarda
     * görünüyordu: eşleşme sayısı sınırı aşınca aranan dosya listeye hiç
     * girmiyordu.
     *
     * Kurulum: bir tam eşleşme ve onu sınırın dışına itmeye yetecek kadar
     * zayıf bulanık eşleşme. Zayıflar "environment" harflerini sırayla
     * taşıyor ama alt dizi olarak DEĞİL, yani `fuzzyScore` onlara 1000+ puan
     * veriyor.
     */
    const zayif = Array.from({ length: 50 }, (_, i) => `e/n/v/i/r/o/n/m/e/n/t/${i}.js`);
    const files = [...zayif, "src/environments/environment.ts"];

    const ilkOn = rankFiles(files, "environment", 10);
    expect(ilkOn, "tam eşleşme sınırın dışında kaldı").toContain(
      "src/environments/environment.ts",
    );
    expect(ilkOn[0]).toBe("src/environments/environment.ts");
  });
});

/**
 * Dağınık eşleşmenin SINIRI.
 *
 * BİLDİRİLEN HATA: "README.md" yazınca listeye
 * `…/PSReadLine/System.Runtime.InteropServices.RuntimeInformation.dll` de
 * geliyordu. `fuzzyScore`un ikinci aşaması harflerin sırayla geçmesini yeterli
 * sayıyor ve ne kadar dağıldıklarına bakmıyordu; ölçülen iz dokuz harfin 97
 * karaktere yayıldığını gösterdi.
 *
 * Sıralama zaten doğruydu (gerçek dosya ilk), sorun sonucun listede YER
 * ALMASIYDI — o yüzden testler "ilk mi" değil "listede yok mu" diye soruyor.
 */
describe("dağınık eşleşme sınırı", () => {
  const DLL =
    "src-tauri/shell-integration/modules/PSReadLine/System.Runtime.InteropServices.RuntimeInformation.dll";

  it("bildirilen dosya artık eşleşmiyor", () => {
    expect(fileScore(DLL, "README.md"), "dağınık eşleşme hâlâ kabul ediliyor").toBe(null);
    expect(rankFiles(["README.md", DLL], "README.md", 200)).toEqual(["README.md"]);
  });

  it("SIKIŞIK dağınık eşleşme korunuyor", () => {
    // `compgit` → `src/components/GitChanges.tsx`: yedi harf on altı karaktere
    // yayılıyor (2.3x) ve bu gerçek bir kullanım — sınır bunu kesmemeli.
    const yol = "src/components/GitChanges.tsx";
    expect(fileScore(yol, "compgit"), "sıkışık eşleşme de kesilmiş").not.toBe(null);
    expect(rankFiles([yol], "compgit", 200)).toEqual([yol]);
  });

  it("bantlar: ad > yol > addaki dağınık", () => {
    // Kullanıcının yazdığına en yakın olan önce. Bantlar arası boşluk, alt
    // banttaki iyi bir eşleşmenin üst bantta kötü birini geçmesini engelliyor.
    const adda = fileScore("src/README.md", "readme")!;
    const yolda = fileScore("readme/notlar.txt", "readme/no")!;
    const dagenik = fileScore("src/GitChanges.tsx", "gtchngs")!;
    expect(adda).toBeLessThan(yolda);
    expect(yolda).toBeLessThan(dagenik);
  });

  it("yolda birebir eşleşme çalışıyor", () => {
    // Klasöre göre süzmenin yolu bu: `src/lib` yazmak.
    expect(fileScore("src/lib/format.ts", "src/lib")).not.toBe(null);
    expect(rankFiles(["a/b.ts", "src/lib/format.ts"], "src/lib", 200)).toEqual([
      "src/lib/format.ts",
    ]);
  });

  it("eşitlikte köke yakın olan önce", () => {
    // İkisi de adın başında eşleşiyor, yani puanları aynı; aranan neredeyse
    // her zaman köke yakın olan.
    expect(rankFiles(["zzz/aaa/target.ts", "target.ts"], "target", 200)).toEqual([
      "target.ts",
      "zzz/aaa/target.ts",
    ]);
  });

  it("`fuzzyScore` DEĞİŞMEDİ", () => {
    // Komut paleti, favoriler ve geçmiş onu kullanıyor ve orada dağınık
    // eşleşme işe yarıyor. Dosya kuralı ayrı bir işlevde durmalı.
    expect(fuzzyScore("git checkout main", "cm"), "komut aramasında dağınık eşleşme kalkmış")
      .not.toBe(null);
    expect(fuzzyScore("git commit", "commit")).toBe(4);
  });
});

/**
 * Eşleşen harflerin YERLERİ (`fileMatch`): Ctrl+P satırındaki vurgu ve
 * "Yakın eşleşmeler" ayracı bunlara bakıyor.
 *
 * Vurgu sıralamayla AYNI kararı vermeli: başka harfleri gösterirse kullanıcı
 * bir dosyanın neden o sırada olduğunu yanlış okur.
 */
describe("eşleşen harfler", () => {
  const harfler = (yol: string, q: string) =>
    fileMatch(yol, q)!
      .positions.map((i) => yol[i])
      .join("");

  it("adda birebir: adın içindeki harfler", () => {
    expect(fileMatch("src/components/FilePalette.tsx", "palet")).toEqual({
      positions: [19, 20, 21, 22, 23],
      scattered: false,
    });
  });

  it("yolda birebir: klasördeki harfler", () => {
    expect(harfler("src/lib/format.ts", "src/lib")).toBe("src/lib");
    expect(fileMatch("src/lib/format.ts", "src/lib")!.scattered).toBe(false);
  });

  it("adda dağınık: harf harf ve 'dağınık' işaretli", () => {
    // u-P-d-A-terRe-LE-ase.-T-est.ts
    expect(fileMatch("src/lib/updaterRelease.test.ts", "palet")).toEqual({
      positions: [9, 11, 17, 18, 23],
      scattered: true,
    });
  });

  it("yolda dağınık: klasöre taşan harfler klasörde işaretli", () => {
    // `default.json`da "p" yok; ilk dört harf `capabilities` klasöründen.
    expect(fileMatch("src-tauri/capabilities/default.json", "palet")).toEqual({
      positions: [12, 13, 16, 20, 29],
      scattered: true,
    });
  });

  it("Türkçe büyük İ vurguyu kaydırmıyor", () => {
    // "İ" küçülünce İKİ birim ("i" + birleşen nokta). Küçük metindeki konumu
    // olduğu gibi taşımak vurguyu bir harf sağa kaydırırdı: "çer" → "eri".
    expect(harfler("docs/İçerik.md", "çer")).toBe("çer");
    expect(harfler("docs/İçerik.md", "rik")).toBe("rik");
  });

  it("iki birimlik karakter bütün işaretleniyor", () => {
    expect(harfler("a/😀b.ts", "😀")).toBe("😀");
  });

  it("karar `fileScore`la aynı: eşleşme var/yok ve dağınık = 1000+", () => {
    const ornekler: [string, string][] = [
      ["src/README.md", "readme"],
      ["readme/notlar.txt", "readme/no"],
      ["src/GitChanges.tsx", "gtchngs"],
      ["src/components/GitChanges.tsx", "compgit"],
      ["src-tauri/shell-integration/modules/PSReadLine/System.Runtime.InteropServices.RuntimeInformation.dll", "README.md"],
      ["a.ts", "zzzq"],
      ["docs/İçerik.md", "içerik"],
    ];
    for (const [yol, q] of ornekler) {
      const puan = fileScore(yol, q);
      const eslesme = fileMatch(yol, q);
      expect(eslesme === null, `${yol} / ${q}`).toBe(puan === null);
      if (puan !== null) expect(eslesme!.scattered, `${yol} / ${q}`).toBe(puan >= 1000);
    }
  });

  it("boş sorguda işaret yok", () => {
    expect(fileMatch("a.ts", "  ")).toEqual({ positions: [], scattered: false });
  });
});
