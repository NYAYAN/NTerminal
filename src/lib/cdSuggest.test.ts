import { describe, expect, it } from "vitest";

import { MAX_CD_SUGGESTIONS, cdQuery, cdSuggestions, descend, exactDir } from "./cdSuggest";

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

  it("varsayılan sınır geçmişinki (beş) değil: klasörün tamamı geliyor", () => {
    // BİLDİRİLEN HATA: "cd Desktop\Work\ dediğimde 5 öneri geliyor, oysa o
    // klasörün altında ne varsa ok tuşlarıyla seçebilmem gerek; NYAYAN
    // gelmiyor." On iki klasörün alfabetik ilk beşi gösteriliyordu.
    const q = cdQuery("cd Desktop\\Work\\", CWD)!;
    const klasorler = [
      "Aday Görüşme",
      "Docs",
      "Examples",
      "Github",
      "NYAYAN",
      "Old-Portal",
      "Other",
      "Publish",
      "SAP Connectors",
      "apache-jmeter",
      "metronic",
      "x",
    ];
    const out = cdSuggestions(q, klasorler, alıntı);
    expect(out).toHaveLength(12);
    expect(out).toContain("cd Desktop\\Work\\NYAYAN");

    // Uç durum: binlerce girdili klasör satır satır çizilmiyor.
    const cok = Array.from({ length: 1000 }, (_, i) => `k${i}`);
    expect(cdSuggestions(q, cok, alıntı)).toHaveLength(MAX_CD_SUGGESTIONS);
  });

  /*
   * BİLDİRİLEN HATA: "cd NYAYAN yazdığımda NYAYAN altındaki dizinler için
   * tamamlama yok." Canlıda ölçülen: panel 1/1 açılıyor, tek satırı
   * `cd NYAYAN` — kullanıcının zaten yazdığı şey. Yeni bir şey söylemeyen
   * satır öneri değil; kullanıcı onu "öneri yok" diye okuyor.
   */
  it("yazılanla birebir aynı ad listede YOK", () => {
    const q = cdQuery("cd src", CWD)!;
    // `srcgen` "src" ile başlıyor ve kalıyor; `src`nin kendisi düşüyor.
    expect(cdSuggestions(q, ["src", "srcgen"], alıntı)).toEqual(["cd srcgen"]);
  });

  it("tam eşleşme büyük/küçük harf gözetmiyor, diskteki ad dönüyor", () => {
    // Windows dosya sistemi gözetmiyor; kullanıcı `nyayan` yazsa da klasör
    // `NYAYAN` ve üretilen komut diskteki adla yazılmalı.
    const q = cdQuery("cd nyayan", CWD)!;
    expect(exactDir(q, ["NYAYAN", "NTerminal"])).toBe("NYAYAN");
    expect(cdSuggestions(q, ["NYAYAN", "NTerminal"], alıntı)).toEqual([]);
  });

  it("boş parça hiçbir şeyle eşleşmiyor", () => {
    expect(exactDir(cdQuery("cd ", CWD)!, ["a"])).toBe(null);
  });
});

describe("tam eşleşen klasöre inme", () => {
  /*
   * BİLDİRİLEN HATA'nın ikinci yarısı: `cd NYAYAN` yazan (ya da listeden
   * kabul eden) kişi NYAYAN'ın altındaki klasörleri bekliyor — kabuğun sekme
   * tamamlaması gibi. Eski hâlde bir de ayırıcı yazmak gerekiyordu.
   */
  it("inen sorgu `cd NYAYAN\\` yazılmış gibi", () => {
    const q = cdQuery("cd NYAYAN", CWD)!;
    expect(descend(q, "NYAYAN")).toEqual({
      dir: "C:\\Users\\nyayan\\proje\\NYAYAN",
      leaf: "",
      base: "NYAYAN\\",
    });
  });

  it("inen sorgunun çocukları tam komut oluyor", () => {
    const q = descend(cdQuery("cd NYAYAN", CWD)!, "NYAYAN");
    expect(cdSuggestions(q, ["NTerminal", "Publish"], alıntı)).toEqual([
      "cd NYAYAN\\NTerminal",
      "cd NYAYAN\\Publish",
    ]);
  });

  it("kullanıcının ayırıcısı korunuyor", () => {
    // `src/` yazana `\` ile devam etmek yazdığını sebepsiz değiştirmek olurdu.
    const q = cdQuery("cd src/components", CWD)!;
    expect(descend(q, "components").base).toBe("src/components/");
  });

  it("diskteki ad kullanılıyor, yazılan değil", () => {
    const q = cdQuery("cd nyayan", CWD)!;
    expect(descend(q, "NYAYAN").base).toBe("NYAYAN\\");
  });
});
