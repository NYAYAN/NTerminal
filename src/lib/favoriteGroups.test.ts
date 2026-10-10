import { describe, expect, it } from "vitest";

import { applyDrop, folderNames, sectionsOf } from "./favoriteGroups";
import type { Favorite } from "../types";

/**
 * Favorilerin klasörlenmesi ve sürükleyerek sıralanması.
 *
 * İSTEK: "favorilerde gruplama olsun, istediğim favorileri gruplara
 * ekleyebilmeliyim; yer değiştirme sıralama da olsun".
 *
 * Buradaki testlerin asıl konusu SIRANIN TEK KAYNAKTAN gelmesi. Sıra
 * favoriler dizisinin kendisi; klasörleme onun üzerine bir görünüm. Klasör
 * başına ayrı bir sıra tutmak aynı bilgiyi iki yerde tutmak olurdu ve ikisi
 * kaçınılmaz olarak ayrışırdı — taşınan favori bir yerde yeni, öbür yerde
 * eski sırasında görünürdü.
 */

function fav(id: string, folder: string | null = null): Favorite {
  return {
    id,
    command: `cmd-${id}`,
    label: null,
    note: null,
    groupId: null,
    folder,
    cwd: null,
    alias: null,
    createdAt: 0,
    usedCount: 0,
    lastUsedAt: null,
  };
}

/** Kısa okuma: bölümleri `klasör:kimlikler` biçiminde yazar. */
function oku(favorites: Favorite[]): string[] {
  return sectionsOf(favorites).map(
    (s) => `${s.folder ?? "-"}:${s.items.map((i) => i.id).join(",")}`,
  );
}

describe("klasörlere bölme", () => {
  it("aynı klasördekiler bir arada", () => {
    const list = [fav("a", "Yayın"), fav("b", "Yayın"), fav("c", "Test")];
    expect(oku(list)).toEqual(["Yayın:a,b", "Test:c"]);
  });

  it("bölüm sırası İLK görünme sırası", () => {
    // Alfabetik sıralamak, kullanıcının sürükleyerek koyduğu favoriyi
    // bambaşka bir yerde bulmasına yol açardı.
    const list = [fav("a", "Zed"), fav("b", "Alfa"), fav("c", "Zed")];
    expect(oku(list)).toEqual(["Zed:a,c", "Alfa:b"]);
  });

  it("klasörsüzler kendi bölümünde ve yerini koruyor", () => {
    const list = [fav("a"), fav("b", "Yayın"), fav("c")];
    expect(oku(list)).toEqual(["-:a,c", "Yayın:b"]);
  });

  it("boş metin klasör sayılmıyor", () => {
    // Kullanıcı alanı boşaltıp kaydettiğinde "   " diye bir klasör doğmamalı.
    expect(oku([fav("a", "   ")])).toEqual(["-:a"]);
  });

  it("klasör adları tekilleniyor", () => {
    const list = [fav("a", "Yayın"), fav("b", "Yayın"), fav("c"), fav("d", "Test")];
    expect(folderNames(list)).toEqual(["Yayın", "Test"]);
  });
});

describe("sürükleyerek taşıma", () => {
  const list = [fav("a", "Yayın"), fav("b", "Yayın"), fav("c", "Test"), fav("d")];

  it("aynı klasörde sıra değişiyor", () => {
    const out = applyDrop(list, "b", { folder: "Yayın", beforeId: "a" })!;
    expect(out.ids).toEqual(["b", "a", "c", "d"]);
    expect(out.folder).toBe("Yayın");
  });

  it("başka klasöre taşımak klasörü de değiştiriyor", () => {
    // Sıra ve klasör TEK işlemde: ayrı ayrı yapmak listeyi arada tutarsız
    // bırakırdı (yeni klasörde ama eski sırasında).
    const out = applyDrop(list, "a", { folder: "Test", beforeId: "c" })!;
    expect(out.folder).toBe("Test");
    expect(out.ids).toEqual(["b", "a", "c", "d"]);
  });

  it("bölümün sonuna bırakma o klasörün ardına koyuyor", () => {
    // Başlığa bırakmak bu: hedef satır yok, klasör var.
    const out = applyDrop(list, "d", { folder: "Yayın", beforeId: null })!;
    expect(out.ids).toEqual(["a", "b", "d", "c"]);
    expect(out.folder).toBe("Yayın");
  });

  it("gruplanmamışa geri taşınabiliyor", () => {
    const out = applyDrop(list, "c", { folder: null, beforeId: null })!;
    expect(out.folder).toBe(null);
    expect(out.ids).toEqual(["a", "b", "d", "c"]);
  });

  it("boş klasöre bırakmak listenin sonuna koyuyor", () => {
    // Klasörde hiç öğe yoksa "son öğeden sonrası" diye bir yer yok.
    const out = applyDrop(list, "a", { folder: "Yeni", beforeId: null })!;
    expect(out.ids).toEqual(["b", "c", "d", "a"]);
    expect(out.folder).toBe("Yeni");
  });

  it("kendi üstüne bırakmak işlem değil", () => {
    expect(applyDrop(list, "a", { folder: "Yayın", beforeId: "a" })).toBe(null);
  });

  it("bilinmeyen favori taşınmıyor", () => {
    expect(applyDrop(list, "yok", { folder: null, beforeId: null })).toBe(null);
  });

  it("hedef silinmişse veri kaybolmuyor", () => {
    // Yarışta hedef gitmiş olabilir; listenin sonuna koymak kaybetmeyen tek
    // davranış.
    const out = applyDrop(list, "a", { folder: "Test", beforeId: "silinmis" })!;
    expect(out.ids).toHaveLength(4);
    expect(out.ids).toContain("a");
  });

  it("hiçbir kimlik kaybolmuyor ya da tekrarlanmıyor", () => {
    // Sıra Rust tarafına kimlik dizisi olarak gidiyor; eksik bir kimlik
    // favoriyi listenin dışına atardı.
    for (const hedef of [
      { folder: "Test", beforeId: "c" },
      { folder: null, beforeId: null },
      { folder: "Yayın", beforeId: "b" },
    ]) {
      const out = applyDrop(list, "a", hedef)!;
      expect([...out.ids].sort()).toEqual(["a", "b", "c", "d"]);
    }
  });
});
