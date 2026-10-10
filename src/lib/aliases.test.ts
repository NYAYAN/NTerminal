import { describe, expect, it } from "vitest";

import type { Favorite } from "../types";
import { aliasProblem, expandAlias } from "./aliases";

/**
 * Favori kısaltmaları: hangi satır açılıyor, hangisi açılmıyor.
 *
 * İSTEK: "npm run build --configuration için nrb dediğimde çalışsın". Açılım
 * kabuğa giden satırı DEĞİŞTİRİYOR; yanlış bir eşleşme kullanıcının yazdığı
 * komut yerine başka bir komut çalıştırmak demek. O yüzden "açılmamalı"
 * durumları "açılmalı" kadar önemli.
 */

function fav(id: string, command: string, alias: string | null, groupId: string | null = null): Favorite {
  return {
    id,
    command,
    label: null,
    note: null,
    groupId,
    folder: null,
    cwd: null,
    alias,
    createdAt: 0,
    usedCount: 0,
    lastUsedAt: null,
  };
}

const LIST = [
  fav("f1", "npm run build --configuration", "nrb"),
  fav("f2", "yarn start:dev", "ysd"),
  fav("f3", "make deploy", "dep", "g2"),
  fav("f4", "ls -la", null),
];

describe("kısaltma açılımı", () => {
  it("ilk sözcük kısaltmaysa favorinin komutu gidiyor", () => {
    expect(expandAlias("nrb", LIST, "g1")?.text).toBe("npm run build --configuration");
    expect(expandAlias("ysd", LIST, "g1")?.favorite.id).toBe("f2");
  });

  it("arkasına yazılanlar komutun sonuna ekleniyor", () => {
    expect(expandAlias("nrb --watch production", LIST, "g1")?.text).toBe(
      "npm run build --configuration --watch production",
    );
  });

  it("yalnızca satırın İLK sözcüğü: ortada geçen ya da boşlukla başlayan açılmıyor", () => {
    expect(expandAlias("echo nrb", LIST, "g1")).toBeNull();
    expect(expandAlias(" nrb", LIST, "g1")).toBeNull();
  });

  it("sözcüğün tamamı eşleşmeli: ön eki ya da devamı açılmıyor", () => {
    expect(expandAlias("nr", LIST, "g1")).toBeNull();
    expect(expandAlias("nrbx", LIST, "g1")).toBeNull();
  });

  it("büyük-küçük harf ayırt ediliyor (komut adları da öyle)", () => {
    expect(expandAlias("NRB", LIST, "g1")).toBeNull();
  });

  it("ters bölü kısaltmayı atlıyor — kabuktaki alışkanlık", () => {
    expect(expandAlias("\\nrb", LIST, "g1")).toBeNull();
  });

  it("bir gruba bağlı favorinin kısaltması yalnızca o grupta çalışıyor", () => {
    expect(expandAlias("dep", LIST, "g1")).toBeNull();
    expect(expandAlias("dep", LIST, "g2")?.text).toBe("make deploy");
  });

  it("boş satır açılmıyor", () => {
    expect(expandAlias("", LIST, "g1")).toBeNull();
  });
});

describe("kısaltma denetimi", () => {
  it("boş kısaltma geçerli: kısaltma yok demek", () => {
    expect(aliasProblem("", LIST, null)).toBeNull();
    expect(aliasProblem("   ", LIST, null)).toBeNull();
  });

  it("boşluk içeren kısaltma reddediliyor: ilk sözcük olarak hiç eşleşmezdi", () => {
    expect(aliasProblem("n rb", LIST, null)).toEqual({ kind: "space" });
  });

  it("başka favorinin kısaltması reddediliyor, sahibi söyleniyor", () => {
    const problem = aliasProblem("  nrb  ", LIST, null);
    expect(problem?.kind).toBe("taken");
    expect(problem?.kind === "taken" && problem.favorite.id).toBe("f1");
  });

  it("favorinin kendi kısaltmasını yeniden yazması çakışma değil", () => {
    expect(aliasProblem("nrb", LIST, "f1")).toBeNull();
  });
});
