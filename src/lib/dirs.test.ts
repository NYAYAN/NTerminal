import { describe, expect, it } from "vitest";

import { ancestorDirs, filterDirs, joinDir, parentDir, relativePath, sameDir, separatorOf } from "./dirs";

describe("yol ayırıcısı", () => {
  it("ters eğik çizgi varsa Windows", () => {
    expect(separatorOf("C:\\Users\\ali")).toBe("\\");
    expect(separatorOf("/home/ali")).toBe("/");
  });
});

describe("alt dizine inme", () => {
  it("iki platformda da tek ayırıcı", () => {
    expect(joinDir("C:\\Users", "Docs")).toBe("C:\\Users\\Docs");
    expect(joinDir("/home/ali", "kod")).toBe("/home/ali/kod");
  });

  it("sondaki ayırıcı tekrarlanmıyor", () => {
    // Fazladan ayırıcı çoğu kabukta çalışıyor ama geçmişte çirkin bir kayıt
    // bırakıyor.
    expect(joinDir("C:\\Users\\", "Docs")).toBe("C:\\Users\\Docs");
    expect(joinDir("/home/", "ali")).toBe("/home/ali");
  });
});

describe("üst dizin", () => {
  it("bir seviye yukarı", () => {
    expect(parentDir("C:\\Users\\ali\\kod")).toBe("C:\\Users\\ali");
    expect(parentDir("/home/ali/kod")).toBe("/home/ali");
  });

  it("sondaki ayırıcıyı yok sayıyor", () => {
    expect(parentDir("C:\\Users\\ali\\")).toBe("C:\\Users");
  });

  it("Windows sürücü kökü ayırıcıyla bitiyor", () => {
    // `C:` tek başına dizin değil; kabuk onu "sürücünün geçerli dizini" diye
    // yorumluyor ve `cd C:` beklenmedik bir yere götürüyor.
    expect(parentDir("C:\\Users")).toBe("C:\\");
  });

  it("POSIX kökünde ayırıcı korunuyor", () => {
    expect(parentDir("/home")).toBe("/");
  });

  it("kökün üstü yok", () => {
    // Seçici "üst dizin" satırını buna bakarak gizliyor; göstermek tıklanınca
    // hiçbir şey yapmayan bir düğme demekti.
    expect(parentDir("/")).toBe(null);
    expect(parentDir("C:\\")).toBe(null);
  });
});

describe("süzme", () => {
  const liste = ["Controllers", "DevTools", "Docs", "GurselAPP.WebAPI"];

  it("boş sorgu hepsini veriyor", () => {
    expect(filterDirs(liste, "  ")).toEqual(liste);
  });

  it("içeren eşleşme, harf gözetmiyor", () => {
    // Adın BAŞINI hatırlamak zorunda kalmamak gerekiyor.
    expect(filterDirs(liste, "web")).toEqual(["GurselAPP.WebAPI"]);
    expect(filterDirs(liste, "DOC")).toEqual(["Docs"]);
  });

  it("eşleşme yoksa boş", () => {
    expect(filterDirs(liste, "zzz")).toEqual([]);
  });
});

describe("aynı klasör mü", () => {
  /*
   * Kilitli sekmenin klasörünü koruyan denetim buna bakıyor: yanlış "değişti"
   * kararı sekmenin kendini boşuna geri çağırması demek, yanlış "aynı" kararı
   * ise kilidin sessizce açık kalması.
   */
  it("sondaki ayırıcı fark etmiyor", () => {
    expect(sameDir("C:\\proje", "C:\\proje\\")).toBe(true);
    expect(sameDir("/home/ali/", "/home/ali")).toBe(true);
  });

  it("ayırıcı yönü fark etmiyor", () => {
    // OSC 7 `file://` yolunu eğik bölüyle veriyor, `cd` ters bölüyle dönüyor.
    expect(sameDir("C:/proje/alt", "C:\\proje\\alt")).toBe(true);
  });

  it("Windows yolunda harf gözetmiyor", () => {
    // PowerShell `C:\Proje`, cmd `c:\proje` yazabiliyor — aynı dizin.
    expect(sameDir("C:\\Proje", "c:\\proje")).toBe(true);
  });

  it("POSIX yolunda harf gözetiyor", () => {
    // Orada GERÇEKTEN iki ayrı dizin; eşit saymak kilidi yanlış klasörde
    // açık bırakırdı.
    expect(sameDir("/home/Ali", "/home/ali")).toBe(false);
  });

  it("sürücü kökü kendisiyle eşit", () => {
    // `C:` tek başına dizin değil; kırpma onu boş dizeye indirmemeli.
    expect(sameDir("C:\\", "C:/")).toBe(true);
    expect(sameDir("/", "/")).toBe(true);
  });

  it("ayrı klasörler ayrı", () => {
    expect(sameDir("C:\\proje", "C:\\proje2")).toBe(false);
    expect(sameDir("C:\\proje", "C:\\proje\\alt")).toBe(false);
  });
});

/**
 * Açılan dosyanın ağaçtaki yeri.
 *
 * Görüntüleyici ağacın yanında açılıyor; aramadan ya da paletten açılan
 * dosyanın dalları ağaçta açılıyor (`openFile`). Ağaç anahtarlarını kökten
 * `joinDir` ile kuruyor, yani üretilen yollar KÖKÜN yazımında olmalı — dosya
 * yolu başka biçimde gelse bile. Yanlış yazım sessiz bir hata: dal açılmış
 * sayılır ama ağaç onu tanımaz.
 */
describe("dosyanın ağaçtaki dalları", () => {
  it("kökle dosya arasındaki klasörler, kökün yazımıyla", () => {
    expect(ancestorDirs("/home/ali/proje", "/home/ali/proje/src/lib/a.ts")).toEqual([
      "/home/ali/proje/src",
      "/home/ali/proje/src/lib",
    ]);
    // Fark penceresi git'in eğik çizgisini veriyor, PowerShell sürücü harfini
    // küçük yazabiliyor: anahtarlar yine kökün biçiminde.
    expect(ancestorDirs("C:\\Proje", "c:/proje/src/a.ts")).toEqual(["C:\\Proje\\src"]);
  });

  it("kökün hemen altındaki dosyada açılacak dal yok", () => {
    expect(ancestorDirs("/p", "/p/a.ts")).toEqual([]);
  });

  it("kökün altında değilse dokunmuyor", () => {
    expect(ancestorDirs("/home/ali/proje", "/home/ali/proje2/a.ts")).toBe(null);
    expect(ancestorDirs("/home/ali/proje", "/home/ali/proje")).toBe(null);
    // POSIX'te harf gözetiliyor: başka bir klasör.
    expect(ancestorDirs("/home/Ali", "/home/ali/a.ts")).toBe(null);
  });

  it("kök sondaki ayırıcıyla ya da sürücü kökü olarak da çalışıyor", () => {
    expect(ancestorDirs("/p/", "/p/x/a.ts")).toEqual(["/p/x"]);
    expect(ancestorDirs("/", "/etc/hosts")).toEqual(["/etc"]);
    expect(ancestorDirs("C:\\", "C:\\src\\a.ts")).toEqual(["C:\\src"]);
  });

  it("göreli yol dosyanın kendi ayırıcısıyla", () => {
    expect(relativePath("C:\\Proje", "C:\\Proje\\src\\a.ts")).toBe("src\\a.ts");
    expect(relativePath("/p", "/p/src/a.ts")).toBe("src/a.ts");
    expect(relativePath("/p", "/q/a.ts")).toBe(null);
  });
});
