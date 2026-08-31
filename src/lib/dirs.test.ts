import { describe, expect, it } from "vitest";

import { filterDirs, joinDir, parentDir, separatorOf } from "./dirs";

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
