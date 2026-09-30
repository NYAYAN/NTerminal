import { describe, expect, it } from "vitest";

import {
  checkoutCommand,
  filterBranches,
  isNavigable,
  pickerRows,
  SECTION_ROW_LIMIT,
  type PickerRow,
} from "./branches";
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

  /**
   * Satırları okunur bir dizeye çevirir: dal adı, ▸ = başlık, — = düz etiket,
   * + = tavanın ötesinde kalan dal sayısı, … = uzaklar henüz okunuyor.
   */
  const ozet = (rows: readonly PickerRow[]) =>
    rows.map((r) => {
      if (r.kind === "branch") return r.branch.remote ? `${r.branch.remote}/${r.branch.name}` : r.branch.name;
      if (r.kind === "remote-toggle") return `▸${r.count}${r.open ? " açık" : " kapalı"}`;
      if (r.kind === "more") return `+${r.hidden}`;
      if (r.kind === "remote-pending") return "…";
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

  it("uzaklar okunurken yerel dallar hemen, bölümün yerinde sayısız etiket", () => {
    // Tam liste gecikince seçici önce yerelleri çiziyor (bkz. `REMOTES_GRACE_MS`).
    expect(ozet(pickerRows([yerel("main"), yerel("dev")], "", false, true))).toEqual([
      "main",
      "dev",
      "…",
    ]);
  });

  it("okunurken arama boş dönse de etiket duruyor: 'uzakta yok' denmiyor", () => {
    // Henüz bilmiyoruz; boş liste "Dal bulunamadı" diye okunurdu.
    expect(ozet(pickerRows([yerel("main")], "yeni", false, true))).toEqual(["…"]);
  });

  it("okunurken bölümün açık/kapalı hâli etkisiz ve etiket gezilemiyor", () => {
    const rows = pickerRows([yerel("main")], "", true, true);
    expect(ozet(rows)).toEqual(["main", "…"]);
    expect(rows.map(isNavigable)).toEqual([true, false]);
  });

  it("okunurken listedeki uzak girdiler yok sayılıyor", () => {
    // `remotes`'u tanımayan eski ikili yerel çağrıya da her şeyi dönüyor
    // (geliştirmede, Rust yeniden başlatılmadan önce).
    expect(ozet(pickerRows(liste, "", true, true))).toEqual(["main", "dev", "…"]);
  });
});

/**
 * Çizim tavanı.
 *
 * ÖLÇÜLDÜ (10 bin uzak dal, üretim derlemesi): bölümü açmak 510 ms, aramada
 * ilk harf 402 ms, her ok tuşu 45 ms sürüyordu; bedel binlerce satırı çizmekte,
 * süzmekte değil (0,6 ms). Bölüm artık en fazla `SECTION_ROW_LIMIT` dal
 * çiziyor, kalanı tek bir satırda sayılıyor. Sınanan iki sınır: tavanın SAYIYI
 * küçültmemesi (başlık yine tamamını söylüyor, arama yalan söylemiyor) ve
 * "daha" satırının gezilememesi.
 */
describe("çizim tavanı", () => {
  const uzaklar = (n: number) => Array.from({ length: n }, (_, i) => uzak(`dal-${i}`));
  const dalAdlari = (rows: readonly PickerRow[]) =>
    rows.flatMap((r) => (r.kind === "branch" ? [r.branch.name] : []));

  it("açık bölüm en fazla tavan kadar dal çiziyor, kalanını tek satırda sayıyor", () => {
    const rows = pickerRows([yerel("main"), ...uzaklar(SECTION_ROW_LIMIT + 50)], "", true);

    expect(dalAdlari(rows)).toHaveLength(1 + SECTION_ROW_LIMIT);
    expect(rows.at(-1)).toEqual({ kind: "more", hidden: 50, remote: true });
  });

  it("çizilenler listenin BAŞI: Rust'tan gelen en-son-commit sırası korunuyor", () => {
    // Tavan rastgele bir dilim değil; en taze dallar görünmeli.
    const rows = pickerRows(uzaklar(SECTION_ROW_LIMIT + 1), "", false);
    const adlar = dalAdlari(rows);
    expect(adlar[0]).toBe("dal-0");
    expect(adlar.at(-1)).toBe(`dal-${SECTION_ROW_LIMIT - 1}`);
  });

  it("başlıktaki sayı tavandan etkilenmiyor", () => {
    const rows = pickerRows([yerel("main"), ...uzaklar(1000)], "", false);
    expect(rows.at(-1)).toEqual({ kind: "remote-toggle", count: 1000, open: false });
  });

  it("aramada da tavan: eşleşen sayısı gerçek, fazlası tek satırda", () => {
    const rows = pickerRows(uzaklar(500), "dal-", false);

    expect(rows[0]).toEqual({ kind: "remote-label", count: 500 });
    expect(dalAdlari(rows)).toHaveLength(SECTION_ROW_LIMIT);
    expect(rows.at(-1)).toEqual({ kind: "more", hidden: 300, remote: true });
  });

  it("tam tavan kadar dalda 'daha' satırı yok", () => {
    const rows = pickerRows(uzaklar(SECTION_ROW_LIMIT), "", false);
    expect(rows.some((r) => r.kind === "more")).toBe(false);
  });

  it("yerel bölüm de tavanlı; uzak başlığı 'daha' satırından SONRA geliyor", () => {
    // Binlerce yerel dal nadir ama aynı bedel; tavan iki bölümde de aynı kural.
    const yereller = Array.from({ length: SECTION_ROW_LIMIT + 3 }, (_, i) => yerel(`y-${i}`));
    const rows = pickerRows([...yereller, uzak("x")], "", false);

    expect(rows.slice(-2)).toEqual([
      { kind: "more", hidden: 3, remote: false },
      { kind: "remote-toggle", count: 1, open: false },
    ]);
  });

  it("'daha' satırı gezilemiyor", () => {
    // Bir dal değil: Enter'ın gönderecek komutu yok.
    const rows = pickerRows(uzaklar(SECTION_ROW_LIMIT + 1), "", false);
    expect(rows.filter((r) => !isNavigable(r)).map((r) => r.kind)).toEqual(["remote-label", "more"]);
  });
});
