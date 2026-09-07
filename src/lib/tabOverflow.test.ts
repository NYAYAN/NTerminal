import { describe, expect, it } from "vitest";

import { hiddenCount, isHidden } from "./tabOverflow";

/**
 * Taşma sayacının kuralları.
 *
 * Sayı yalnızca bir rakam değil, bir DENETİMİN VARLIK KOŞULU: sıfırsa taşma
 * düğmesi hiç çizilmiyor. Yanlış hesap iki yönde de sessizce zarar veriyor —
 * fazla sayarsa sekmeler sığarken düğme duruyor ("hiçbir şey yapmayan
 * denetim"), az sayarsa kullanıcı yine ulaşamadığı sekmelerle kalıyor ki
 * bildirilen hatanın kendisi bu.
 */

const s = (left: number, right: number) => ({ left, right });

describe("bir sekme gizli mi", () => {
  const serit = s(0, 300);

  it("tümüyle içeride olan görünür", () => {
    expect(isHidden(serit, s(10, 120))).toBe(false);
  });

  it("tümüyle dışarıda olan gizli", () => {
    expect(isHidden(serit, s(320, 430))).toBe(true);
  });

  it("kenarda az kırpılan GÖRÜNÜR sayılıyor", () => {
    // 100px'lik sekmenin 90px'i içeride: kullanıcı için orada duruyor.
    // Gizli saymak "1 sekme daha var" diye yanıltıcı bir sayı üretirdi.
    expect(isHidden(serit, s(210, 310))).toBe(false);
  });

  it("yarıdan fazlası kırpılan gizli sayılıyor", () => {
    // 100px'lik sekmenin yalnızca 30px'i içeride: başlık okunamıyor.
    expect(isHidden(serit, s(270, 370))).toBe(true);
  });

  it("tam yarısı görünen gizli sayılıyor", () => {
    // Sınır kararı: eşik `< genişlik / 2` olduğu için tam yarı gizli
    // DEĞİL. Testin işi bu sınırı sabitlemek — kayarsa sayaç bir oynar.
    expect(isHidden(serit, s(250, 350))).toBe(false);
  });

  it("sol kenardan kırpılan da gizli", () => {
    // Şerit ortada kaydırılmışsa sekmeler İKİ yanda da kırpılıyor; sağ
    // kenara bakan bir hesap soldakileri hiç görmezdi.
    expect(isHidden(serit, s(-90, 10))).toBe(true);
  });

  it("ölçülemeyen sekme gizli sayılmıyor", () => {
    // Sıfır genişlik = henüz çizilmemiş (ilk kare, jsdom, gizli kap).
    // Gizli saymak, açılışta bir anlık yanlış sayı gösterirdi.
    expect(isHidden(serit, s(0, 0))).toBe(false);
  });
});

describe("gizli sekme sayısı", () => {
  it("hepsi sığıyorsa sıfır", () => {
    // Sıfır düğmenin hiç çizilmemesi demek.
    const tabs = [s(0, 90), s(90, 180), s(180, 270)];
    expect(hiddenCount(s(0, 300), tabs)).toBe(0);
  });

  it("iki yandaki kırpılmışları birlikte sayıyor", () => {
    const tabs = [s(-100, 0), s(0, 100), s(100, 200), s(200, 300), s(300, 400)];
    expect(hiddenCount(s(0, 300), tabs)).toBe(2);
  });

  it("boş listede sıfır", () => {
    expect(hiddenCount(s(0, 300), [])).toBe(0);
  });
});
