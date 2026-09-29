import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../lib/ipc";
import { useStore } from "./useStore";

/**
 * Git yazma işlemleri (stage, unstage, commit, push) tek bir sırada koşuyor.
 *
 * Rust tarafındaki `INDEX_LOCK` iki `git add`in `index.lock` yüzünden
 * çakışmasını önlüyor ama SIRA GARANTİSİ vermiyor: aynı dosyaya art arda "ekle"
 * ve "çıkar" gönderen bir kullanıcı (kutuya iki kez bastı) işlemlerin ters
 * sırada koşmasıyla karşılaşabilirdi ve son durum bastığının tersi olurdu.
 *
 * Testler SÜREYE bakmıyor (makineye bağlı olurdu), ÇAĞRI SIRASINA bakıyor.
 */

const CWD = "/depo";

/** Elle çözülebilen söz. */
function bekleyen<T = void>() {
  let coz!: (value: T) => void;
  let reddet!: (reason: unknown) => void;
  const soz = new Promise<T>((resolve, reject) => {
    coz = resolve;
    reddet = reject;
  });
  return { soz, coz, reddet };
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

beforeEach(() => {
  vi.spyOn(api, "gitInfo").mockResolvedValue(null);
  vi.spyOn(api, "gitFingerprint").mockResolvedValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
  useStore.setState({ gitInfo: {} });
});

describe("git yazma sırası", () => {
  it("işlemler basıldıkları sırayla ARKA ARKAYA koşuyor", async () => {
    const olaylar: string[] = [];
    const ilk = bekleyen();
    vi.spyOn(api, "gitStage").mockImplementation(async () => {
      olaylar.push("ekle:başladı");
      await ilk.soz;
      olaylar.push("ekle:bitti");
    });
    vi.spyOn(api, "gitUnstage").mockImplementation(async () => {
      olaylar.push("çıkar");
    });

    const a = useStore.getState().stageFiles(CWD, ["a.ts"]);
    const b = useStore.getState().unstageFiles(CWD, ["a.ts"]);
    await tick();
    // İlki hâlâ sürüyor: ikincisi BAŞLAMAMIŞ olmalı.
    expect(olaylar).toEqual(["ekle:başladı"]);

    ilk.coz();
    await Promise.all([a, b]);

    expect(olaylar).toEqual(["ekle:başladı", "ekle:bitti", "çıkar"]);
  });

  it("farklı türde işlemler de aynı sırada", async () => {
    // Commit, push ve stage aynı kuyrukta: commit sürerken basılan "çıkar"
    // commit'in İÇİNE girmemeli, ondan SONRA koşmalı.
    const olaylar: string[] = [];
    const commit = bekleyen<string>();
    vi.spyOn(api, "gitCommit").mockImplementation(async () => {
      olaylar.push("commit:başladı");
      const kimlik = await commit.soz;
      olaylar.push("commit:bitti");
      return kimlik;
    });
    vi.spyOn(api, "gitUnstage").mockImplementation(async () => {
      olaylar.push("çıkar");
    });

    const a = useStore.getState().commitStaged(CWD, "ileti");
    const b = useStore.getState().unstageFiles(CWD, ["b.ts"]);
    await tick();
    commit.coz("abc1234");
    await Promise.all([a, b]);

    expect(olaylar).toEqual(["commit:başladı", "commit:bitti", "çıkar"]);
  });

  it("bir işlemin hatası sıradakini DURDURMUYOR", async () => {
    vi.spyOn(api, "gitStage").mockRejectedValue("kilit");
    const unstage = vi.spyOn(api, "gitUnstage").mockResolvedValue(undefined);

    const a = useStore.getState().stageFiles(CWD, ["a.ts"]);
    const b = useStore.getState().unstageFiles(CWD, ["b.ts"]);

    // Hatayı yalnızca ÇAĞIRAN görüyor.
    await expect(a).rejects.toBe("kilit");
    await expect(b).resolves.toBeUndefined();
    expect(unstage).toHaveBeenCalledWith(CWD, ["b.ts"]);
  });

  it("hata sonrası gelen yeni işlem de koşuyor", async () => {
    vi.spyOn(api, "gitStage").mockRejectedValueOnce("ilk hata").mockResolvedValueOnce(undefined);

    await expect(useStore.getState().stageFiles(CWD, ["a.ts"])).rejects.toBe("ilk hata");
    await expect(useStore.getState().stageFiles(CWD, ["a.ts"])).resolves.toBeUndefined();
  });
});

describe("işlem sonrası tazeleme", () => {
  it("her başarılı işlemden sonra depo tazeleniyor", async () => {
    vi.spyOn(api, "gitStage").mockResolvedValue(undefined);
    vi.spyOn(api, "gitUnstage").mockResolvedValue(undefined);

    await useStore.getState().stageFiles(CWD, ["a.ts"]);
    await useStore.getState().unstageFiles(CWD, ["a.ts"]);

    expect(api.gitInfo).toHaveBeenCalledTimes(2);
    expect(api.gitInfo).toHaveBeenCalledWith(CWD);
  });

  it("HATA olsa da tazeleniyor", async () => {
    // İşlem yarıda kalmış olabilir (üç dosyadan ikisi eklendi) ve liste
    // gerçeği göstermeli.
    vi.spyOn(api, "gitStage").mockRejectedValue("yarıda kaldı");

    await expect(useStore.getState().stageFiles(CWD, ["a", "b", "c"])).rejects.toBe("yarıda kaldı");

    expect(api.gitInfo).toHaveBeenCalledTimes(1);
  });

  it("tazeleme BEKLENİYOR: çağıran döndüğünde liste güncel", async () => {
    // Beklenmeseydi kutu bir an eski durumda kalıp geri zıplardı.
    vi.spyOn(api, "gitStage").mockResolvedValue(undefined);
    const tazele = bekleyen<null>();
    vi.mocked(api.gitInfo).mockImplementation(() => tazele.soz);

    let bitti = false;
    const is = useStore
      .getState()
      .stageFiles(CWD, ["a.ts"])
      .then(() => {
        bitti = true;
      });
    await tick();
    expect(bitti, "tazeleme bitmeden çağıran döndü").toBe(false);

    tazele.coz(null);
    await is;
    expect(bitti).toBe(true);
  });
});

describe("dönüş değerleri ve argümanlar", () => {
  it("stage ve unstage yolları olduğu gibi Rust'a geçiriyor", async () => {
    const stage = vi.spyOn(api, "gitStage").mockResolvedValue(undefined);
    const unstage = vi.spyOn(api, "gitUnstage").mockResolvedValue(undefined);

    await useStore.getState().stageFiles(CWD, ["a.ts", "b.ts"]);
    await useStore.getState().unstageFiles(CWD, ["eski.ts", "yeni.ts"]);

    expect(stage).toHaveBeenCalledWith(CWD, ["a.ts", "b.ts"]);
    expect(unstage).toHaveBeenCalledWith(CWD, ["eski.ts", "yeni.ts"]);
  });

  it("commit kısa kimliği döndürüyor", async () => {
    const commit = vi.spyOn(api, "gitCommit").mockResolvedValue("abc1234");
    await expect(useStore.getState().commitStaged(CWD, "ileti")).resolves.toBe("abc1234");
    expect(commit).toHaveBeenCalledWith(CWD, "ileti");
  });

  it("push hedefi döndürüyor", async () => {
    vi.spyOn(api, "gitPush").mockResolvedValue("origin/main");
    await expect(useStore.getState().pushBranch(CWD)).resolves.toBe("origin/main");
  });

  it("commit hatası git'in metniyle fırlıyor", async () => {
    vi.spyOn(api, "gitCommit").mockRejectedValue("nothing to commit");
    await expect(useStore.getState().commitStaged(CWD, "x")).rejects.toBe("nothing to commit");
  });
});

/**
 * Stash işlemleri de aynı kuyrukta.
 *
 * `stash push` ve `stash apply` indeksi ve çalışma ağacını yeniden yazıyor;
 * art arda basılan bir "ekle" ile iç içe geçerlerse `index.lock` yarışı ya da
 * yarım bir durum çıkar. Sıra garantisi aynı sebeple şart: "stash'e at" ile
 * hemen ardından "geri getir" ters sırada koşarsa hiçbir şey olmamış gibi olur.
 */
describe("stash işlemleri", () => {
  it("stash'e atma ve uygulama basıldıkları sırayla koşuyor", async () => {
    const olaylar: string[] = [];
    const ilk = bekleyen<string>();
    vi.spyOn(api, "gitStashPush").mockImplementation(async () => {
      olaylar.push("at:başladı");
      const id = await ilk.soz;
      olaylar.push("at:bitti");
      return id;
    });
    vi.spyOn(api, "gitStashApply").mockImplementation(async () => {
      olaylar.push("uygula");
    });

    const a = useStore.getState().stashChanges(CWD, "ad", ["a.ts"], false);
    const b = useStore.getState().applyStash(CWD, "x".repeat(40), { pop: true, index: false });
    await tick();
    // İlki sürüyor: ikincisi BAŞLAMAMIŞ olmalı.
    expect(olaylar).toEqual(["at:başladı"]);

    ilk.coz("y".repeat(40));
    await Promise.all([a, b]);

    expect(olaylar).toEqual(["at:başladı", "at:bitti", "uygula"]);
  });

  it("stash ve stage işlemleri aynı kuyrukta", async () => {
    const olaylar: string[] = [];
    const ilk = bekleyen<string>();
    vi.spyOn(api, "gitStashPush").mockImplementation(async () => {
      olaylar.push("stash");
      return ilk.soz;
    });
    vi.spyOn(api, "gitStage").mockImplementation(async () => {
      olaylar.push("stage");
    });

    const a = useStore.getState().stashChanges(CWD, "", ["a.ts"], false);
    const b = useStore.getState().stageFiles(CWD, ["b.ts"]);
    await tick();
    expect(olaylar).toEqual(["stash"]);
    ilk.coz("z".repeat(40));
    await Promise.all([a, b]);
    expect(olaylar).toEqual(["stash", "stage"]);
  });

  it("argümanlar olduğu gibi geçiyor ve yeni stash'in kimliği dönüyor", async () => {
    const push = vi.spyOn(api, "gitStashPush").mockResolvedValue("c".repeat(40));
    const apply = vi.spyOn(api, "gitStashApply").mockResolvedValue(undefined);
    const drop = vi.spyOn(api, "gitStashDrop").mockResolvedValue(undefined);

    await expect(
      useStore.getState().stashChanges(CWD, "ad", ["a.ts", "eski.ts"], true),
    ).resolves.toBe("c".repeat(40));
    await useStore.getState().applyStash(CWD, "d".repeat(40), { pop: true, index: true });
    await useStore.getState().dropStash(CWD, "e".repeat(40));

    expect(push).toHaveBeenCalledWith(CWD, "ad", ["a.ts", "eski.ts"], true);
    expect(apply).toHaveBeenCalledWith(CWD, "d".repeat(40), true, true);
    expect(drop).toHaveBeenCalledWith(CWD, "e".repeat(40));
  });

  it("her stash işleminden sonra (hata da olsa) depo tazeleniyor", async () => {
    vi.spyOn(api, "gitStashPush").mockResolvedValue("c".repeat(40));
    vi.spyOn(api, "gitStashApply").mockRejectedValue("cakisma");
    vi.spyOn(api, "gitStashDrop").mockResolvedValue(undefined);

    await useStore.getState().stashChanges(CWD, "", ["a.ts"], false);
    await expect(
      useStore.getState().applyStash(CWD, "d".repeat(40), { pop: false, index: false }),
    ).rejects.toBe("cakisma");
    await useStore.getState().dropStash(CWD, "e".repeat(40));

    // Çakışmada da tazeleniyor: çalışma ağacı `UU` ile değişti ve liste gerçeği
    // göstermeli.
    expect(api.gitInfo).toHaveBeenCalledTimes(3);
  });

  it("hata sıradaki stash işlemini durdurmuyor", async () => {
    vi.spyOn(api, "gitStashApply").mockRejectedValueOnce("ilk hata").mockResolvedValueOnce(undefined);
    const a = useStore.getState().applyStash(CWD, "a".repeat(40), { pop: false, index: false });
    const b = useStore.getState().applyStash(CWD, "b".repeat(40), { pop: false, index: false });
    await expect(a).rejects.toBe("ilk hata");
    await expect(b).resolves.toBeUndefined();
  });
});
