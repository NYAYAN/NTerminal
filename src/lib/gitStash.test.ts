import { describe, expect, it } from "vitest";

import {
  allChangePaths,
  hiddenFileCount,
  initialSelection,
  needsUntracked,
  pruneSelection,
  selectionState,
  stashPaths,
  toggleAll,
  toggleOne,
} from "./gitStash";
import type { GitChange } from "../types";

const c = (status: string, path: string, origPath?: string): GitChange =>
  origPath ? { status, path, origPath } : { status, path };

/**
 * Stash penceresinin kararları.
 *
 * Testlerin asıl konusu iki sınır: git'e giden yolların DOĞRU olması (yeniden
 * adlandırmada eski ad da, seçilmeyen hiç) ve takipsiz dosya seçildiğinde
 * `--include-untracked`in unutulmaması — ikincisi unutulunca git tüm seçimi
 * "pathspec did not match" ile düşürüyor.
 */

const liste = [
  c(" M", "a.ts"),
  c("M ", "b.ts"),
  c("??", "yeni.ts"),
  c("R ", "yeniad.ts", "eskiad.ts"),
  c(" D", "silinen.ts"),
];

describe("stash'e gidecek yollar", () => {
  it("yalnızca seçili satırların yolları", () => {
    expect(stashPaths(liste, new Set(["a.ts", "silinen.ts"]))).toEqual(["a.ts", "silinen.ts"]);
  });

  it("hiçbiri seçili değilse boş", () => {
    expect(stashPaths(liste, new Set())).toEqual([]);
  });

  it("yeniden adlandırmada ESKİ ad da gidiyor", () => {
    // Yalnızca yeni ad stash'lenirse eski adın "silindi" kaydı indekste kalır.
    expect(stashPaths(liste, new Set(["yeniad.ts"]))).toEqual(["eskiad.ts", "yeniad.ts"]);
  });

  it("sıra listenin sırası, seçimin ekleme sırası değil", () => {
    // Kullanıcı bir dosyayı bırakıp geri seçince komut değişmesin.
    const ters = new Set(["silinen.ts", "b.ts", "a.ts"]);
    expect(stashPaths(liste, ters)).toEqual(["a.ts", "b.ts", "silinen.ts"]);
  });

  it("listede olmayan seçilmiş yol gitmiyor", () => {
    expect(stashPaths(liste, new Set(["a.ts", "hayalet.ts"]))).toEqual(["a.ts"]);
  });
});

describe("takipsiz dosya gereksinimi", () => {
  it("seçimde takipsiz dosya varsa gerekli", () => {
    expect(needsUntracked(liste, new Set(["a.ts", "yeni.ts"]))).toBe(true);
  });

  it("takipsiz dosya SEÇİLMEMİŞSE gerekli değil", () => {
    // Listede var ama seçilmedi: `-u` gereksiz ve diğer takipsizleri de kapsardı.
    expect(needsUntracked(liste, new Set(["a.ts", "b.ts"]))).toBe(false);
  });

  it("yalnızca takipli dosyalarda gerekli değil", () => {
    expect(needsUntracked(liste, new Set(["a.ts", "silinen.ts", "yeniad.ts"]))).toBe(false);
  });

  it("boş seçimde gerekli değil", () => {
    expect(needsUntracked(liste, new Set())).toBe(false);
  });
});

describe("açılıştaki seçim", () => {
  // İSTEK: "Değişiklikler listesinde neler seçiliyse Stash'a bastığımda onlar
  // seçili gelsin." Listedeki kutu = indekste bir şeyi olan dosya.
  it("listede işaretli (indekste olan) dosyalar", () => {
    expect([...initialSelection(liste)]).toEqual(["b.ts", "yeniad.ts"]);
  });

  it("kısmen eklenmiş dosya da seçili", () => {
    expect([...initialSelection([c("MM", "a.ts"), c("AM", "b.ts"), c(" M", "c.ts")])]).toEqual([
      "a.ts",
      "b.ts",
    ]);
  });

  it("takipsiz, eklenmemiş ve çakışmalı dosya seçili gelmiyor", () => {
    expect(initialSelection([c("??", "a"), c(" M", "b"), c(" D", "c"), c("UU", "d")]).size).toBe(0);
  });

  it("hiçbiri işaretli değilse BOŞ: hepsini varsaymıyor", () => {
    // Boş seçim bir tık; yanlışlıkla her şeyi kenara atmak ilk Enter.
    expect(initialSelection([c(" M", "a"), c("??", "b")]).size).toBe(0);
    expect(initialSelection([]).size).toBe(0);
  });

  it("hepsi işaretliyse hepsi", () => {
    const hepsi = [c("M ", "a"), c("A ", "b"), c("D ", "c")];
    expect(selectionState(hepsi, initialSelection(hepsi))).toBe("all");
  });

  it("silinmiş ve yeniden adlandırılmış dosya da (indekste) seçili", () => {
    expect([...initialSelection([c("D ", "sil"), c("R ", "yeni", "eski")])]).toEqual(["sil", "yeni"]);
  });
});

describe("seçim", () => {
  it("tümünü seç kutusu HER dosyayı seçiyor", () => {
    expect(allChangePaths(liste).size).toBe(5);
    expect(selectionState(liste, allChangePaths(liste))).toBe("all");
  });

  it("hâller: hepsi, bir kısmı, hiçbiri", () => {
    expect(selectionState(liste, new Set(["a.ts"]))).toBe("some");
    expect(selectionState(liste, new Set())).toBe("none");
  });

  it("boş listede hiçbiri", () => {
    expect(selectionState([], new Set())).toBe("none");
  });

  it("toplu kutu: hepsi seçiliyse hiçbiri, değilse hepsi", () => {
    expect(toggleAll(liste, allChangePaths(liste)).size).toBe(0);
    expect(toggleAll(liste, new Set()).size).toBe(5);
    // "Kısmen"de hepsini seçmek doğru yön.
    expect(toggleAll(liste, new Set(["a.ts"])).size).toBe(5);
  });

  it("bir satırı tersine çevirmek girdiyi DEĞİŞTİRMİYOR", () => {
    const once = new Set(["a.ts"]);
    const sonra = toggleOne(once, "b.ts");
    expect([...once]).toEqual(["a.ts"]);
    expect([...sonra].sort()).toEqual(["a.ts", "b.ts"]);
    expect([...toggleOne(sonra, "a.ts")]).toEqual(["b.ts"]);
  });
});

describe("seçimi listeye göre ayıklama", () => {
  it("listeden düşmüş yolları atıyor", () => {
    /*
     * Pencere açıkken git durumu tazelenebiliyor (bir dosya terminalden
     * commit'lendi). Listede olmayan bir yol seçili kalırsa git'e gider ve
     * "pathspec did not match" ile TÜM stash'i düşürür.
     */
    const kalan = pruneSelection(liste, new Set(["a.ts", "commitlenmis.ts"]));
    expect([...kalan]).toEqual(["a.ts"]);
  });

  it("listede olanlara dokunmuyor", () => {
    const secili = new Set(["a.ts", "b.ts"]);
    expect([...pruneSelection(liste, secili)]).toEqual(["a.ts", "b.ts"]);
  });
});

describe("kesilmiş dosya listesi", () => {
  it("gösterilmeyen dosya sayısı", () => {
    expect(hiddenFileCount(250, 200)).toBe(50);
  });

  it("kesilmediyse sıfır, negatife düşmüyor", () => {
    expect(hiddenFileCount(10, 10)).toBe(0);
    expect(hiddenFileCount(5, 10)).toBe(0);
  });
});
