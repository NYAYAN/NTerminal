import { describe, expect, it } from "vitest";

import { cdQuery, cdSuggestions } from "./cdSuggest";

/**
 * `cd` yazarken dizin önerisi.
 *
 * BİLDİRİLEN İSTEK: "cd ile yazmaya başlıyorsam bulunduğum konum altında
 * klasörleri öneri olarak getirsin, eski kullandığım cd komutlarını değil".
 *
 * Geçmiş çoğu komut için doğru kaynak ama `cd` için değil: cevabı diskte.
 * Eski bir `cd` başka bir projede yazılmış olabiliyor ve o yolun burada
 * karşılığı yok.
 *
 * Buradaki testlerin asıl konusu NEREDE DURULACAĞI: hangi girdi bir dizin
 * sorusu, hangisi değil. Yanlış tarafa geçmek iki yönde de zarar — geçmişi
 * gereksiz yere susturmak ya da dizin sorusunu geçmişe göndermek.
 */

const CWD = "C:\\Users\\nyayan\\proje";
const alıntı = (p: string) => (/\s/.test(p) ? `"${p}"` : p);

describe("cd sorgusu", () => {
  it("boşluktan sonra dizin sorusu başlıyor", () => {
    expect(cdQuery("cd ", CWD)).toEqual({ dir: CWD, leaf: "", base: "" });
  });

  it("yazılan parça süzgeç oluyor", () => {
    expect(cdQuery("cd src", CWD)).toEqual({ dir: CWD, leaf: "src", base: "" });
  });

  it("ara klasörlere iniyor", () => {
    // `cd src/comp` yazan kişi `src` içindekileri soruyor, cwd'dekileri değil.
    expect(cdQuery("cd src/comp", CWD)).toEqual({
      dir: "C:\\Users\\nyayan\\proje\\src",
      leaf: "comp",
      base: "src/",
    });
  });

  it("ters bölü de ayırıcı sayılıyor", () => {
    expect(cdQuery("cd src\\comp", CWD)?.dir).toBe("C:\\Users\\nyayan\\proje\\src");
  });

  it("açılmış tırnak yol sayılmıyor", () => {
    // Boşluklu klasör yazılırken tırnak açılıyor; süzgeç tırnağın içindeki.
    expect(cdQuery('cd "Program', CWD)?.leaf).toBe("Program");
  });

  it("boşluk yazılmadan dizin sorusu SAYILMIYOR", () => {
    // `cdk`, `cd` ile başlayan başka bir komut olabilir; erken davranmak
    // geçmişten gelecek doğru öneriyi susturur.
    expect(cdQuery("cd", CWD)).toBe(null);
    expect(cdQuery("cdk deploy", CWD)).toBe(null);
  });

  it("zincirlenmiş komut dizin sorusu değil", () => {
    // `cd x && npm i` artık tek bir `cd` değil; süzgeç olarak `x && npm i`
    // almak anlamsız bir liste üretirdi.
    expect(cdQuery("cd x && npm i", CWD)).toBe(null);
    expect(cdQuery("cd x | more", CWD)).toBe(null);
  });

  it("mutlak yol geçmişe bırakılıyor", () => {
    // Bulunulan dizinin bir anlamı kalmıyor; kabuğun kendi tamamlaması
    // bu işi zaten yapıyor.
    expect(cdQuery("cd C:\\Windows", CWD)).toBe(null);
    expect(cdQuery("cd /usr", CWD)).toBe(null);
    expect(cdQuery("cd ~/proje", CWD)).toBe(null);
  });

  it("dizin bilinmiyorsa soru sorulmuyor", () => {
    // Kabuk entegrasyonu olmayan bir sekmede cwd null olabiliyor.
    expect(cdQuery("cd src", null)).toBe(null);
  });
});

describe("cd önerileri", () => {
  const isimler = ["src", "scripts", "node_modules", "Program Files", "dist"];

  it("çalıştırılabilir tam komut üretiyor", () => {
    const q = cdQuery("cd s", CWD)!;
    expect(cdSuggestions(q, isimler, alıntı).slice(0, 2)).toEqual(["cd src", "cd scripts"]);
  });

  it("ön ekle başlayanlar önce geliyor", () => {
    // Süzgeç İÇEREN eşleşme kullanıyor (aşağıda), ama sıralamayı ona
    // bırakmak `cd s` yazana ilk sırada `node_modules` gösteriyordu — "s"
    // onun içinde de geçiyor. Yazılan harflerle başlayan klasör neredeyse
    // her zaman kastedilen şey.
    const q = cdQuery("cd s", CWD)!;
    const hepsi = cdSuggestions(q, isimler, alıntı);
    expect(hepsi[0]).toBe("cd src");
    expect(hepsi[1]).toBe("cd scripts");
    expect(hepsi).toContain("cd node_modules");
    expect(hepsi.indexOf("cd node_modules")).toBeGreaterThan(1);
  });

  it("boşluklu klasör alıntılanıyor", () => {
    // Alıntılanmazsa kabuk iki argüman görüyor ve `cd` düşüyor.
    const q = cdQuery("cd Prog", CWD)!;
    expect(cdSuggestions(q, isimler, alıntı)).toEqual(['cd "Program Files"']);
  });

  it("yazılan ara yol korunuyor", () => {
    const q = cdQuery("cd src/comp", CWD)!;
    expect(cdSuggestions(q, ["components", "compat"], alıntı)).toEqual([
      "cd src/components",
      "cd src/compat",
    ]);
  });

  it("süzgeç İÇEREN eşleşme", () => {
    // `dirs.filterDirs` ile aynı kural: `Presentation` içindeki `WebAPI`yi
    // aramak için "web" yazmak yetmeli, adın başını hatırlamak gerekmemeli.
    const q = cdQuery("cd modul", CWD)!;
    expect(cdSuggestions(q, isimler, alıntı)).toEqual(["cd node_modules"]);
  });

  it("boş süzgeçte hepsi geliyor", () => {
    const q = cdQuery("cd ", CWD)!;
    expect(cdSuggestions(q, ["a", "b"], alıntı)).toEqual(["cd a", "cd b"]);
  });

  it("sınırı aşmıyor", () => {
    const q = cdQuery("cd ", CWD)!;
    const cok = Array.from({ length: 20 }, (_, i) => `k${i}`);
    expect(cdSuggestions(q, cok, alıntı, 3)).toHaveLength(3);
  });
});
