import { describe, expect, it } from "vitest";

import { fileScore, fuzzyScore, rankFiles } from "./format";

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
