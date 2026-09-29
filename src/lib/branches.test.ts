import { describe, expect, it } from "vitest";

import { checkoutCommand, filterBranches, isNavigable, pickerRows, type PickerRow } from "./branches";
import type { GitBranch } from "../types";

const yerel = (name: string): GitBranch => ({ name, remote: null });
const uzak = (name: string, remote = "origin"): GitBranch => ({ name, remote });

describe("dal geçiş komutu", () => {
  it("yerel dal düz checkout", () => {
    expect(checkoutCommand(yerel("main"))).toBe("git checkout main");
  });

  it("uzak dal izleme dalı kurarak geçiyor", () => {
    // Bildirilen hata: fetch ile gelen dal listede yoktu. Şimdi var ve
    // seçilince ne olduğu komutun kendisinde okunuyor.
    expect(checkoutCommand(uzak("yeni-ozellik"))).toBe(
      "git checkout --track origin/yeni-ozellik",
    );
    expect(checkoutCommand(uzak("dev", "upstream"))).toBe("git checkout --track upstream/dev");
  });
});

describe("dal araması", () => {
  const liste = [yerel("main"), uzak("feature/api-v2"), yerel("Fix-Login")];

  it("boş aramada hepsi, sıra korunuyor", () => {
    expect(filterBranches(liste, "  ")).toEqual(liste);
  });

  it("ada göre, büyük/küçük harf gözetmeden, içeren eşleşme", () => {
    expect(filterBranches(liste, "API")).toEqual([uzak("feature/api-v2")]);
    expect(filterBranches(liste, "login")).toEqual([yerel("Fix-Login")]);
  });

  it("uzağın adıyla da bulunuyor", () => {
    expect(filterBranches(liste, "origin")).toEqual([uzak("feature/api-v2")]);
  });
});

/**
 * Seçicideki bölümleme.
 *
 * BİLDİRİLEN SORUN: "yerel dallarla uzak dallar karışık geliyor, karışıklığa
 * sebep oluyor." Yerel dallar üstte ve başlıksız, uzaklar sayıyla birlikte
 * açılıp kapanan bir bölümde ve varsayılan KAPALI. Testlerin asıl konusu iki
 * sınır: kapalı bölümün aramayı GİZLEMEMESİ ve düz etiketin klavyeyle
 * gezilememesi.
 */
describe("dal seçici satırları", () => {
  const liste = [yerel("main"), uzak("yeni-ozellik"), yerel("dev"), uzak("api-v2", "upstream")];

  /** Satırları okunur bir dizeye çevirir: dal adı, ▸ = başlık, — = düz etiket. */
  const ozet = (rows: readonly PickerRow[]) =>
    rows.map((r) => {
      if (r.kind === "branch") return r.branch.remote ? `${r.branch.remote}/${r.branch.name}` : r.branch.name;
      if (r.kind === "remote-toggle") return `▸${r.count}${r.open ? " açık" : " kapalı"}`;
      return `—${r.count}`;
    });

  it("yerel dallar üstte, uzaklar KAPALI bölümde", () => {
    expect(ozet(pickerRows(liste, "", false))).toEqual(["main", "dev", "▸2 kapalı"]);
  });

  it("bölüm açılınca uzak dallar başlığın altında, sıra korunarak", () => {
    expect(ozet(pickerRows(liste, "", true))).toEqual([
      "main",
      "dev",
      "▸2 açık",
      "origin/yeni-ozellik",
      "upstream/api-v2",
    ]);
  });

  it("uzak dal yoksa bölüm de yok", () => {
    // Boş bir başlık gürültü: içinde açılacak bir şey yok.
    expect(ozet(pickerRows([yerel("main"), yerel("dev")], "", false))).toEqual(["main", "dev"]);
    expect(pickerRows([], "", false)).toEqual([]);
  });

  it("ARAMA kapalı bölümü eziyor: eşleşen uzak dal gizlenmiyor", () => {
    /*
     * Uzak dallar zaten `git fetch` sonrası bir dalı bulabilmek için
     * listeleniyor. Kapalı bir bölümün içindeki eşleşmeyi göstermemek aramanın
     * yalan söylemesi demek: "yok" diyor, oysa var.
     */
    expect(ozet(pickerRows(liste, "api", false))).toEqual(["—1", "upstream/api-v2"]);
  });

  it("aramada yerel eşleşme önde, uzak eşleşmeler düz başlığın altında", () => {
    const l = [yerel("api-yerel"), uzak("api-uzak")];
    expect(ozet(pickerRows(l, "api", false))).toEqual(["api-yerel", "—1", "origin/api-uzak"]);
  });

  it("aramada sayı yalnızca EŞLEŞENLERİ sayıyor", () => {
    const l = [uzak("yeni-a"), uzak("yeni-b"), uzak("eski")];
    expect(ozet(pickerRows(l, "yeni", false))).toEqual(["—2", "origin/yeni-a", "origin/yeni-b"]);
  });

  it("aramada uzak eşleşme yoksa bölüm de yok", () => {
    expect(ozet(pickerRows(liste, "main", false))).toEqual(["main"]);
  });

  it("gösterilecek yerel dal yoksa bölüm açık ve düz", () => {
    // Katlayacak başka bir şey olmadığı için kapatmanın anlamı yok.
    const l = [uzak("a"), uzak("b")];
    expect(ozet(pickerRows(l, "", false))).toEqual(["—2", "origin/a", "origin/b"]);
  });

  it("uzağın adıyla arama uzak dalları getiriyor", () => {
    // "origin" yazan kişi fetch ile yeni gelenleri arıyor.
    expect(ozet(pickerRows(liste, "origin", false))).toEqual(["—1", "origin/yeni-ozellik"]);
  });

  it("düz etiket gezilemiyor, başlık ve dallar gezilebiliyor", () => {
    // Ok tuşları etiketin üstüne inerse Enter'ın yapacağı bir şey olmaz.
    const rows = pickerRows(liste, "api", false);
    expect(rows.map(isNavigable)).toEqual([false, true]);
    const kapali = pickerRows(liste, "", false);
    expect(kapali.every(isNavigable)).toBe(true);
  });
});
