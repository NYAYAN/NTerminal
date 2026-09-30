import { describe, expect, it } from "vitest";

import {
  commitBlock,
  diffKind,
  isUnmerged,
  pushPlan,
  stagePaths,
  stageState,
  stageSummary,
  unstagePaths,
} from "./gitStage";
import type { GitChange, GitInfo } from "../types";

const c = (status: string, path: string, origPath?: string): GitChange =>
  origPath ? { status, path, origPath } : { status, path };

const info = (patch: Partial<GitInfo> = {}): GitInfo => ({
  branch: "main",
  detached: false,
  ahead: 0,
  behind: 0,
  upstream: "origin/main",
  unborn: false,
  staged: 0,
  stashCount: 0,
  changes: [],
  root: "/depo",
  ...patch,
});

/**
 * Commit'e girme durumu — satırdaki kutunun üç hâli.
 *
 * Harfler gerçek porcelain çıktısı: ilki İNDEKS, ikincisi çalışma ağacı. Kutu
 * bunlardan türüyor ve yanlış bir hâl kullanıcıya yalan söylüyor: "işaretli"
 * görünen bir dosya commit'e girmiyorsa (ya da tersi) hata sessiz kalıyor.
 */
describe("commit'e girme durumu", () => {
  it("indeksteki her şey tam sahnelenmiş", () => {
    for (const status of ["M ", "A ", "D ", "R ", "C ", "T "]) {
      expect(stageState(status), status).toBe("staged");
    }
  });

  it("indekste hiçbir şey yoksa işaretsiz", () => {
    for (const status of [" M", " D", " T", "??"]) {
      expect(stageState(status), status).toBe("none");
    }
  });

  it("indekste de ağaçta da değişiklik varsa KISMEN", () => {
    // Commit'e yalnızca indeksteki kısım girer; kutu bunu ara hâlle söylüyor.
    for (const status of ["MM", "AM", "RM", "MD", "AD"]) {
      expect(stageState(status), status).toBe("partial");
    }
  });

  it("çakışma işaretsiz: çözülmeden commit'e giremez", () => {
    // Her iki harf de dolu olduğu için "kısmen" sanılmasın: git çakışma varken
    // commit'i reddediyor, yani bu dosyalar HAZIR değil.
    for (const status of ["UU", "AA", "DD", "AU", "UA", "DU", "UD"]) {
      expect(isUnmerged(status), status).toBe(true);
      expect(stageState(status), status).toBe("none");
    }
    expect(isUnmerged("MM")).toBe(false);
  });

  it("bozuk girdi çökmüyor", () => {
    expect(stageState("")).toBe("none");
    expect(stageState(" ")).toBe("none");
  });
});

/**
 * Fark sınıfı: sahnelemeden BAĞIMSIZ.
 *
 * Satırın fark isteği bu sınıfa bağlı. Fark HEAD'e karşı alındığı için kutuya
 * basmak içeriği değiştirmiyor; ham duruma bağlı olsaydı her basışta `git diff`
 * yeniden koşar ve satırdaki açılmış bağlam kaybolurdu.
 */
describe("fark sınıfı", () => {
  it("her durum kendi sınıfında", () => {
    expect(diffKind("??")).toBe("untracked");
    expect(diffKind(" M")).toBe("modified");
    expect(diffKind("MM")).toBe("modified");
    expect(diffKind("A ")).toBe("added");
    expect(diffKind("AM")).toBe("added");
    expect(diffKind(" D")).toBe("deleted");
    expect(diffKind("MD")).toBe("deleted");
    expect(diffKind("R ")).toBe("renamed");
    expect(diffKind("C ")).toBe("renamed");
  });

  it("kutuya basmak sınıfı DEĞİŞTİRMİYOR", () => {
    // Bu testin asıl konusu: sahnelenmiş ile sahnelenmemiş aynı dosya.
    expect(diffKind("M ")).toBe(diffKind(" M"));
    expect(diffKind("D ")).toBe(diffKind(" D"));
    expect(diffKind("MM")).toBe(diffKind(" M"));
  });

  it("takipsiz dosya ayrı: fark başka yoldan (--no-index) alınıyor", () => {
    // `A ` ile `??` arasında geçiş gerçekten farklı bir istek demek.
    expect(diffKind("A ")).not.toBe(diffKind("??"));
  });
});

describe("indeksten çıkarılacak yollar", () => {
  it("düz değişiklikte yalnızca kendi yolu", () => {
    expect(unstagePaths([c("M ", "a.ts")])).toEqual(["a.ts"]);
  });

  it("yeniden adlandırmada ESKİ ad da gidiyor", () => {
    // Yalnızca yeni adı çıkarmak eski adın "silindi" kaydını indekste bırakıyor
    // (Rust tarafında ölçüldü): kutuyu kaldıran kişinin commit'ine silme girerdi.
    expect(unstagePaths([c("R ", "yeni.ts", "eski.ts")])).toEqual(["eski.ts", "yeni.ts"]);
  });

  it("karışık listede sıra korunuyor", () => {
    const yollar = unstagePaths([c("M ", "a.ts"), c("R ", "y.ts", "e.ts"), c("A ", "b.ts")]);
    expect(yollar).toEqual(["a.ts", "e.ts", "y.ts", "b.ts"]);
  });
});

describe("sahnelenecek yollar", () => {
  it("tam sahnelenmiş satırlar dışarıda", () => {
    const yollar = stagePaths([c(" M", "a.ts"), c("M ", "b.ts"), c("??", "c.ts")]);
    expect(yollar).toEqual(["a.ts", "c.ts"]);
  });

  it("kısmen sahnelenmiş satır DAHİL", () => {
    // Yeniden eklemek geri kalan düzenlemeleri de indekse alıyor: kutunun "seç"
    // demesi dosyanın TAMAMINI seçiyor.
    expect(stagePaths([c("MM", "a.ts")])).toEqual(["a.ts"]);
  });

  it("çakışma dâhil: eklemek çözüldü demek", () => {
    expect(stagePaths([c("UU", "a.ts")])).toEqual(["a.ts"]);
  });
});

describe("toplu kutu", () => {
  it("boş listede işaretsiz", () => {
    // Seçilecek bir şey yokken "hepsi seçili" demek yanlış olurdu.
    expect(stageSummary([]).state).toBe("none");
  });

  it("hepsi tam sahnelenmişse işaretli", () => {
    expect(stageSummary([c("M ", "a"), c("A ", "b")]).state).toBe("staged");
  });

  it("hiçbirinde indeks yoksa işaretsiz", () => {
    expect(stageSummary([c(" M", "a"), c("??", "b")]).state).toBe("none");
  });

  it("karışıksa ara hâl", () => {
    expect(stageSummary([c("M ", "a"), c(" M", "b")]).state).toBe("partial");
  });

  it("yalnızca kısmen sahnelenmiş satırlar da ara hâl", () => {
    // Hepsinde indeks var ama hiçbiri TAM değil.
    expect(stageSummary([c("MM", "a"), c("AM", "b")]).state).toBe("partial");
  });

  it("sayılar: toplam ve en az kısmen sahnelenen", () => {
    const s = stageSummary([c("M ", "a"), c("MM", "b"), c(" M", "c")]);
    expect(s.total).toBe(3);
    expect(s.any).toBe(2);
  });
});

describe("commit atılabilir mi", () => {
  it("dosya yoksa kapalı, ileti olsa bile", () => {
    expect(commitBlock(0, "bir ileti")).toBe("noFiles");
  });

  it("dosya var ama ileti boşsa kapalı", () => {
    expect(commitBlock(2, "")).toBe("noMessage");
    // Yalnızca boşluk da boş: git bu iletiyi reddederdi.
    expect(commitBlock(2, "  \n\t ")).toBe("noMessage");
  });

  it("ikisi de varsa hazır", () => {
    expect(commitBlock(1, "düzeltme")).toBe(null);
  });

  it("önce DOSYA sorulur: ikisi de eksikse ipucu ilk eksiği söylüyor", () => {
    expect(commitBlock(0, "")).toBe("noFiles");
  });
});

/**
 * Gönder düğmesinin planı.
 *
 * Testlerin asıl konusu iki sınır: yukarı akışı olmayan dalın "yayınla" olması
 * (silinmiş uzak dâhil) ve hiç commit atılmamış depoda düğmenin kapalı olması.
 */
describe("gönderme planı", () => {
  it("yukarı akış var ve ileride commit var → push", () => {
    const plan = pushPlan(info({ ahead: 3, behind: 1, upstream: "origin/main" }));
    expect(plan).toEqual({ kind: "push", ahead: 3, behind: 1, upstream: "origin/main" });
  });

  it("yukarı akış var ve ileride commit yok → gönderilecek bir şey yok", () => {
    expect(pushPlan(info({ ahead: 0 })).kind).toBe("none");
  });

  it("yalnızca GERİDE olmak gönderilecek bir şey değil", () => {
    // Uzak ilerlemiş, bizde yeni commit yok: push edilecek bir şey yok, pull
    // gerekiyor.
    expect(pushPlan(info({ ahead: 0, behind: 4 })).kind).toBe("none");
  });

  it("yukarı akış yoksa yayınla", () => {
    // Yeni dal ya da uzaktan silinmiş dal (`[gone]` Rust'ta `null` oluyor).
    expect(pushPlan(info({ upstream: null })).kind).toBe("publish");
  });

  it("ayrık HEAD'de gönderilemez", () => {
    expect(pushPlan(info({ detached: true, upstream: null })).kind).toBe("detached");
  });

  it("hiç commit yoksa gönderilecek bir şey yok, yayınla da değil", () => {
    // "Yayınla" demek boş bir depoda yalnızca hata üretirdi.
    expect(pushPlan(info({ unborn: true, upstream: null })).kind).toBe("none");
  });
});
