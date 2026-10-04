// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLanguage } from "../lib/i18n";
import { api } from "../lib/ipc";
import { setPlatform } from "../lib/platform";
import { useStore } from "../store/useStore";
import type { GitChange, GitInfo, GitStash, Group, StashFile, TabState } from "../types";
import { GitChanges } from "./GitChanges";
import { SidePanel } from "./SidePanel";
import { StashSection } from "./StashSection";

/**
 * Stash bölümü ("Değişiklikler" sekmesinin içinde açılıp kapanan başlık).
 *
 * İSTEK: "stash yapısı, IntelliJ / WebStorm'daki gibi: kişi istediklerini stash
 * atsın, isimlendirebilsin, stash'ı açsın."
 *
 * Dördüncü bir sekme olarak yazılmıştı ve panelin başlığına sığmadığı için bölüme
 * çevrildi (bkz. `StashSection`). Bu yüzden sondaki grup, bölümün Değişiklikler'in
 * içinde durduğunu ve panelde dördüncü sekme olmadığını sınıyor.
 *
 * Git'in kendisi Rust testlerinde gerçek depolarla sınanıyor. Burada bağlanan şey
 * arayüzün payı: doğru işleme doğru seçeneklerin gitmesi (pop, index), silmenin
 * ONAYSIZ olmaması ve vazgeçilince gerçekten olmaması, hataların kalıcı
 * gösterilmesi ve içeriğin YALNIZCA açılınca istenmesi.
 */

const CWD = "/depo";

function tab(): TabState {
  return {
    id: "t1",
    title: "t1",
    customTitle: null,
    profileId: "p1",
    cwd: CWD,
    createdAt: 0,
    lastActiveAt: 0,
    hasScrollback: false,
    lastCommand: null,
    locked: false,
  };
}

function group(): Group {
  return {
    id: "g1",
    name: "Grup",
    color: null,
    icon: null,
    collapsed: false,
    favorite: false,
    ungrouped: false,
    defaultProfileId: null,
    defaultCwd: null,
    env: {},
    activeTabId: "t1",
    tabs: [tab()],
  };
}

const c = (status: string, path: string): GitChange => ({ status, path });

function repo(patch: Partial<GitInfo> = {}): GitInfo {
  return {
    branch: "main",
    detached: false,
    ahead: 0,
    behind: 0,
    upstream: "origin/main",
    unborn: false,
    staged: 0,
    stashCount: 0,
    changes: [c(" M", "a.ts")],
    root: CWD,
    ...patch,
  };
}

const S1: GitStash = {
  id: "a".repeat(40),
  name: "ayar denemesi",
  branch: "main",
  time: 1790709222,
  named: true,
};
const S2: GitStash = {
  id: "b".repeat(40),
  name: "1a2b3c4 Son commit konusu",
  branch: "feature/x",
  time: 1790600000,
  named: false,
};

/** `open`: bölüm açık mı (liste testlerinin çoğu açık bölümle başlıyor). */
function seed(info: GitInfo | null = repo(), open = true) {
  useStore.setState({
    ready: true,
    groups: [group()],
    activeGroupId: "g1",
    gitInfo: info ? { [CWD]: info } : {},
    ui: {
      ...useStore.getState().ui,
      stashPop: false,
      stashIndex: false,
      stashDialog: null,
      stashOpen: open,
      gitExpanded: [],
      panelMode: "git",
    },
  });
}

/** Sonraki her `refreshGit` bu durumu okuyacak. */
function gitSays(info: GitInfo = repo()) {
  vi.spyOn(api, "gitInfo").mockResolvedValue(info);
  vi.spyOn(api, "gitFingerprint").mockResolvedValue("imza");
}

const toast = vi.fn();
let sorulan: { title: string; message: string; detail?: string; confirmLabel?: string; danger?: boolean }[] = [];

function onayCevabi(cevap: boolean) {
  sorulan = [];
  useStore.setState({
    askConfirm: async (r) => {
      sorulan.push(r);
      return cevap;
    },
  });
}

/** Elle çözülen söz; testin sonunda ÇÖZÜLMEMİŞSE çözülüyor (bkz. `gitCommit.test.tsx`). */
const acik: Array<() => void> = [];
function bekleyen<T = void>() {
  let coz!: (value: T) => void;
  const soz = new Promise<T>((resolve) => {
    coz = resolve;
  });
  acik.push(() => coz(undefined as T));
  return { soz, coz };
}

beforeEach(() => {
  setLanguage("tr");
  setPlatform("windows");
  toast.mockReset();
  useStore.setState({ toast });
  gitSays();
  vi.spyOn(api, "gitStashes").mockResolvedValue([S1, S2]);
  onayCevabi(true);
});

afterEach(async () => {
  acik.splice(0).forEach((coz) => coz());
  await act(async () => {});
  cleanup();
  vi.restoreAllMocks();
});

const flush = () => act(async () => {});

async function ac(info: GitInfo | null = repo()) {
  seed(info);
  const view = render(<StashSection />);
  await flush();
  return view;
}

const satirlar = (v: HTMLElement) => [...v.querySelectorAll<HTMLElement>(".git-item")];
const baslik = (satir: HTMLElement) => satir.querySelector<HTMLButtonElement>(".git-head .git-row")!;
const uygula = (satir: HTMLElement) => satir.querySelectorAll<HTMLButtonElement>(".git-actions button")[0];
const sil = (satir: HTMLElement) => satir.querySelectorAll<HTMLButtonElement>(".git-actions button")[1];
/** Ayar simgesi (başlıkta, sayacın solunda). */
const ayarDugmesi = (v: HTMLElement) => v.querySelector<HTMLButtonElement>(".stash-settings button");
const ayarPenceresi = (v: HTMLElement) => v.querySelector<HTMLElement>(".stash-settings-pop");
/**
 * Ayar penceresindeki iki kutu: uyguladıktan sonra sil, indeksi geri yükle.
 * Kapalıysa ÖNCE açıyor (kutular yalnızca simgeye basınca çıkıyor); açıksa olduğu gibi.
 */
const kutular = (v: HTMLElement) => {
  if (!ayarPenceresi(v)) fireEvent.click(ayarDugmesi(v)!);
  return [...v.querySelectorAll<HTMLInputElement>(".stash-settings-pop input")];
};
/** Açıp kapatan GERÇEK düğme (aria-expanded onda); satırın kendisi düğme değil. */
const baslikDugmesi = (v: HTMLElement) => v.querySelector<HTMLButtonElement>(".stash-toggle");
const baslikSatiri = (v: HTMLElement) => v.querySelector<HTMLElement>(".stash-section-head");
const sayac = (v: HTMLElement) => v.querySelector<HTMLElement>(".stash-section-head .pill-count");
const hata = (v: HTMLElement) => v.querySelector<HTMLElement>(".git-commit-error");

// ---------------------------------------------------------------------- liste

describe("liste", () => {
  it("adlı ve adsız stash'ler", async () => {
    const { container } = await ac();
    const l = satirlar(container);
    expect(l).toHaveLength(2);

    expect(l[0].querySelector(".stash-name")!.textContent).toBe("ayar denemesi");
    expect(l[0].querySelector(".stash-wip"), "adlı stash'e 'Adsız' rozeti").toBe(null);

    // Adsız: git'in varsayılanı (`1a2b3c4 son commit konusu`) ve bir rozet.
    expect(l[1].querySelector(".stash-name")!.textContent).toBe("1a2b3c4 Son commit konusu");
    expect(l[1].querySelector(".stash-wip")!.textContent).toBe("Adsız");
  });

  it("dal ve zaman satırda", async () => {
    const { container } = await ac();
    const meta = satirlar(container).map((s) => s.querySelector(".stash-meta")!.textContent!);
    expect(meta[0].startsWith("main · ")).toBe(true);
    expect(meta[1].startsWith("feature/x · ")).toBe(true);
  });

  it("dal bilinmiyorsa yalnızca zaman, başta ayırıcı yok", async () => {
    vi.spyOn(api, "gitStashes").mockResolvedValue([{ ...S1, branch: "" }]);
    const { container } = await ac();
    expect(satirlar(container)[0].querySelector(".stash-meta")!.textContent!.startsWith("·")).toBe(false);
  });

  it("stash yoksa açıklayıcı boş durum", async () => {
    vi.spyOn(api, "gitStashes").mockResolvedValue([]);
    const { container } = await ac();
    expect(satirlar(container)).toHaveLength(0);
    const bos = container.querySelector(".stash-empty")!;
    expect(bos.textContent).toContain("Stash yok");
    // Boş durum kullanıcıyı gerçek düğmeye yolluyor: commit kutusundaki "Stash".
    expect(bos.textContent).toContain("Stash düğmesini");
  });

  it("liste OKUNAMAZSA hata gösteriliyor, 'Stash yok' denmiyor", async () => {
    /*
     * Eskiden okuma hatası yutulup boş liste çiziliyordu: kullanıcı stash'lerinin
     * kaybolduğunu sanırdı. Gerçek örnek: uygulamanın Rust tarafı eski bir derlemeydi
     * ve komut yoktu ("Command git_stashes not found").
     */
    vi.spyOn(api, "gitStashes").mockRejectedValue("Command git_stashes not found");
    const { container } = await ac();

    expect(hata(container)!.textContent).toContain("Stash listesi okunamadı");
    expect(hata(container)!.querySelector("pre")!.textContent).toBe("Command git_stashes not found");
    expect(container.querySelector(".stash-empty"), "hata boş liste gibi gösterildi").toBe(null);
    expect(container.textContent).not.toContain("Stash yok");
    expect(satirlar(container)).toHaveLength(0);
  });

  it("liste sonradan okunabilirse hata kalkıyor", async () => {
    const istek = vi
      .spyOn(api, "gitStashes")
      .mockRejectedValueOnce("geçici hata")
      .mockResolvedValue([S1]);
    const { container } = await ac();
    expect(hata(container)).not.toBe(null);

    // Durum tazelenince (örn. bir sonraki yoklama) liste yeniden okunuyor.
    await act(async () => {
      useStore.setState({ gitInfo: { [CWD]: repo({ stashCount: 1 }) } });
    });

    expect(istek).toHaveBeenCalledTimes(2);
    expect(hata(container)).toBe(null);
    expect(satirlar(container)).toHaveLength(1);
  });

  it("liste gelene kadar yükleniyor yazıyor", async () => {
    const is = bekleyen<GitStash[]>();
    vi.spyOn(api, "gitStashes").mockImplementation(() => is.soz);
    seed();
    const { container } = render(<StashSection />);
    await flush();
    expect(container.querySelector(".pop-empty")!.textContent).toBe("Yükleniyor…");
    is.coz([S1]);
    await flush();
    expect(satirlar(container)).toHaveLength(1);
  });

  it("depo değilse bölüm hiçbir şey çizmiyor, liste istenmiyor", async () => {
    // "Bu klasör bir git deposu değil" yazısı Değişiklikler'in (bkz. sondaki grup).
    const istek = vi.spyOn(api, "gitStashes");
    const { container } = await ac(null);
    expect(container.querySelector(".stash-section")).toBe(null);
    expect(istek).not.toHaveBeenCalled();
  });

  it("git durumu tazelenince liste yeniden okunuyor", async () => {
    /*
     * Tazelemeyi zaten tetikleyen her şey listeyi de tazeliyor: kendi
     * işlemlerimiz, komut sonu ve terminalden atılan bir `git stash` (imza stash
     * günlüğünü de izliyor). Ayrı bir yoklama ya da depoda ikinci bir liste
     * kopyası yok.
     */
    const istek = vi.spyOn(api, "gitStashes").mockResolvedValue([S1]);
    const { container } = await ac();
    expect(istek).toHaveBeenCalledTimes(1);
    expect(satirlar(container)).toHaveLength(1);

    istek.mockResolvedValue([S1, S2]);
    await act(async () => {
      useStore.setState({ gitInfo: { [CWD]: repo({ stashCount: 2 }) } });
    });

    expect(istek).toHaveBeenCalledTimes(2);
    expect(satirlar(container)).toHaveLength(2);
  });

  it("satır başlığı genişleme durumunu söylüyor", async () => {
    const { container } = await ac();
    const b = baslik(satirlar(container)[0]);
    expect(b.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(b);
    expect(b.getAttribute("aria-expanded")).toBe("true");
  });
});

// -------------------------------------------------------------------- uygulama

describe("uygulama", () => {
  it("varsayılan: uygula ve KORU", async () => {
    const apply = vi.spyOn(api, "gitStashApply").mockResolvedValue(undefined);
    const { container } = await ac();

    fireEvent.click(uygula(satirlar(container)[0]));
    await flush();

    expect(apply).toHaveBeenCalledWith(CWD, S1.id, false, false);
    expect(toast).toHaveBeenCalledWith("Uygulandı: ayar denemesi", "ok");
  });

  it("pop kutusu açıkken uygula ve SİL", async () => {
    const apply = vi.spyOn(api, "gitStashApply").mockResolvedValue(undefined);
    const { container } = await ac();
    fireEvent.click(kutular(container)[0]);
    expect(useStore.getState().ui.stashPop).toBe(true);

    fireEvent.click(uygula(satirlar(container)[0]));
    await flush();

    expect(apply).toHaveBeenCalledWith(CWD, S1.id, true, false);
    expect(toast).toHaveBeenCalledWith("Uygulandı ve silindi: ayar denemesi", "ok");
  });

  it("indeksi geri yükle kutusu açıkken --index gidiyor", async () => {
    const apply = vi.spyOn(api, "gitStashApply").mockResolvedValue(undefined);
    const { container } = await ac();
    fireEvent.click(kutular(container)[1]);
    expect(useStore.getState().ui.stashIndex).toBe(true);

    fireEvent.click(uygula(satirlar(container)[1]));
    await flush();

    expect(apply).toHaveBeenCalledWith(CWD, S2.id, false, true);
  });

  it("iki kutu birlikte işaretlenebiliyor", async () => {
    const apply = vi.spyOn(api, "gitStashApply").mockResolvedValue(undefined);
    const { container } = await ac();
    fireEvent.click(kutular(container)[0]);
    fireEvent.click(kutular(container)[1]);

    fireEvent.click(uygula(satirlar(container)[0]));
    await flush();

    expect(apply).toHaveBeenCalledWith(CWD, S1.id, true, true);
  });

  it("kutuların durumu panel sökülüp kurulunca korunuyor", async () => {
    // Durum bileşende değil depoda: panel sekme değişince sökülüyor ve seçim
    // kaybolsaydı kullanıcı her seferinde yeniden işaretlerdi.
    const ilk = await ac();
    fireEvent.click(kutular(ilk.container)[0]);
    ilk.unmount();

    const ikinci = render(<StashSection />);
    await flush();
    expect(kutular(ikinci.container)[0].checked).toBe(true);
    expect(kutular(ikinci.container)[1].checked).toBe(false);
  });

  it("kutular varsayılan olarak KAPALI", async () => {
    // Silmek geri dönüşü olmayan taraf: kullanıcı bunu bilerek açmalı.
    expect(useStore.getInitialState().ui.stashPop).toBe(false);
    expect(useStore.getInitialState().ui.stashIndex).toBe(false);
    const { container } = await ac();
    expect(kutular(container).every((k) => !k.checked)).toBe(true);
  });

  it("uygula düğmesinin ipucu pop durumuna göre değişiyor", async () => {
    // Aynı simge "koru" da diyebilir "sil" de; hangisinin olacağı basmadan okunmalı.
    const { container } = await ac();
    expect(uygula(satirlar(container)[0]).title).toBe("Uygula (stash listede kalır)");
    fireEvent.click(kutular(container)[0]);
    expect(uygula(satirlar(container)[0]).title).toBe("Uygula ve sil");
  });

  it("adsız stash'te bildirim git'in metnini adı olarak kullanıyor", async () => {
    vi.spyOn(api, "gitStashApply").mockResolvedValue(undefined);
    const { container } = await ac();

    fireEvent.click(uygula(satirlar(container)[1]));
    await flush();

    expect(toast).toHaveBeenCalledWith("Uygulandı: 1a2b3c4 Son commit konusu", "ok");
  });

  it("uygulama sonrası liste tazeleniyor", async () => {
    const liste = vi.spyOn(api, "gitStashes").mockResolvedValue([S1, S2]);
    vi.spyOn(api, "gitStashApply").mockResolvedValue(undefined);
    const { container } = await ac();
    const once = liste.mock.calls.length;

    // Uygulanan stash `pop` ile silindi: git artık yalnızca birini bildiriyor.
    liste.mockResolvedValue([S2]);
    fireEvent.click(uygula(satirlar(container)[0]));
    await flush();

    expect(liste.mock.calls.length).toBeGreaterThan(once);
    expect(satirlar(container)).toHaveLength(1);
  });

  it("hata: git'in metni KALICI kutuda, stash listede duruyor", async () => {
    /*
     * Çakışmada git dosyaları `UU` bırakıyor ve stash'i SİLMİYOR; metin nedenini
     * söylüyor. Üç saniyelik bir bildirimde okunmaz.
     */
    const metin = "Auto-merging a.txt\nCONFLICT (content): Merge conflict in a.txt";
    vi.spyOn(api, "gitStashApply").mockRejectedValue(metin);
    const { container } = await ac();

    fireEvent.click(uygula(satirlar(container)[0]));
    await flush();

    expect(hata(container)!.textContent).toContain("Stash uygulanamadı");
    expect(hata(container)!.querySelector("pre")!.textContent).toBe(metin);
    expect(satirlar(container)).toHaveLength(2);
    expect(toast).not.toHaveBeenCalled();
  });

  it("hata kutusu kapatılabiliyor ve başarılı deneme onu temizliyor", async () => {
    const apply = vi.spyOn(api, "gitStashApply").mockRejectedValueOnce("hata");
    const { container } = await ac();
    fireEvent.click(uygula(satirlar(container)[0]));
    await flush();
    fireEvent.click(hata(container)!.querySelector("button")!);
    expect(hata(container)).toBe(null);

    apply.mockRejectedValueOnce("yine hata");
    fireEvent.click(uygula(satirlar(container)[0]));
    await flush();
    expect(hata(container)).not.toBe(null);

    apply.mockResolvedValueOnce(undefined);
    fireEvent.click(uygula(satirlar(container)[0]));
    await flush();
    expect(hata(container), "başarılı denemeden sonra eski hata kaldı").toBe(null);
  });

  it("işlem sürerken başka eylemler kapalı, ikinci işlem başlamıyor", async () => {
    const is = bekleyen();
    const apply = vi.spyOn(api, "gitStashApply").mockImplementation(() => is.soz);
    const { container } = await ac();

    fireEvent.click(uygula(satirlar(container)[0]));
    await flush();

    // Hem kendi satırının hem DİĞER satırın eylemleri kapalı.
    expect(uygula(satirlar(container)[1]).disabled).toBe(true);
    expect(sil(satirlar(container)[1]).disabled).toBe(true);
    fireEvent.click(uygula(satirlar(container)[1]));
    // İlkini bitirip kuyruğun boşalmasını bekliyoruz: koruma kalksa bile ikinci
    // işlem kuyrukta ilkinin ARDINDA bekler ve sürerken sayı 1 görünürdü.
    is.coz();
    await flush();
    expect(apply, "ikinci işlem kuyruğa girdi").toHaveBeenCalledTimes(1);
  });
});

// ----------------------------------------------------------------------- silme

describe("silme", () => {
  it("ONAY soruluyor: geri alınamaz ve çıkış yolu yazıyor", async () => {
    vi.spyOn(api, "gitStashDrop").mockResolvedValue(undefined);
    const { container } = await ac();

    fireEvent.click(sil(satirlar(container)[0]));
    await flush();

    expect(sorulan).toHaveLength(1);
    expect(sorulan[0].title).toBe("Stash'i sil");
    expect(sorulan[0].message).toBe("“ayar denemesi” stash'i silinsin mi?");
    expect(sorulan[0].detail).toContain("geri getirilemez");
    expect(sorulan[0].detail).toContain("Uygula");
    expect(sorulan[0].confirmLabel).toBe("Sil");
    expect(sorulan[0].danger).toBe(true);
  });

  it("VAZGEÇİLİNCE gerçekten silinmiyor", async () => {
    // Onayı gösterip cevabı yok saymak en kötü durum (bkz. `deleteConfirm.test.ts`).
    onayCevabi(false);
    const drop = vi.spyOn(api, "gitStashDrop").mockResolvedValue(undefined);
    const { container } = await ac();

    fireEvent.click(sil(satirlar(container)[0]));
    await flush();

    expect(sorulan).toHaveLength(1);
    expect(drop, "vazgeçildi ama stash silindi").not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it("onaylanınca doğru stash siliniyor", async () => {
    const drop = vi.spyOn(api, "gitStashDrop").mockResolvedValue(undefined);
    const { container } = await ac();

    fireEvent.click(sil(satirlar(container)[1]));
    await flush();

    expect(drop).toHaveBeenCalledWith(CWD, S2.id);
    expect(toast).toHaveBeenCalledWith("Silindi: 1a2b3c4 Son commit konusu", "ok");
  });

  it("silme sonrası liste tazeleniyor", async () => {
    const liste = vi.spyOn(api, "gitStashes").mockResolvedValue([S1, S2]);
    vi.spyOn(api, "gitStashDrop").mockResolvedValue(undefined);
    const { container } = await ac();

    liste.mockResolvedValue([S2]);
    fireEvent.click(sil(satirlar(container)[0]));
    await flush();

    expect(satirlar(container)).toHaveLength(1);
    expect(satirlar(container)[0].querySelector(".stash-name")!.textContent).toBe(S2.name);
  });

  it("hata kalıcı kutuda gösteriliyor", async () => {
    vi.spyOn(api, "gitStashDrop").mockRejectedValue("stash bulunamadi; liste degismis olabilir");
    const { container } = await ac();

    fireEvent.click(sil(satirlar(container)[0]));
    await flush();

    expect(hata(container)!.textContent).toContain("Stash silinemedi");
    expect(hata(container)!.querySelector("pre")!.textContent).toBe(
      "stash bulunamadi; liste degismis olabilir",
    );
  });
});

// ---------------------------------------------------------------------- içerik

const DOSYALAR: StashFile[] = [
  { status: "M ", path: "src/a.ts", untracked: false },
  { status: "R ", path: "docs/yeni.md", untracked: false, origPath: "docs/eski.md" },
  { status: "??", path: "notlar.md", untracked: true },
];

const FARK = [
  "diff --git a/src/a.ts b/src/a.ts",
  "--- a/src/a.ts",
  "+++ b/src/a.ts",
  "@@ -1,2 +1,2 @@",
  "-eski satir",
  "+yeni satir",
  " ayni satir",
].join("\n");

describe("içerik", () => {
  it("dosyalar YALNIZCA satır açılınca isteniyor", async () => {
    // Yüz stash'lik bir listede hepsinin dosyalarını önden istemek yüzlerce süreç.
    const dosyalar = vi.spyOn(api, "gitStashFiles").mockResolvedValue({ files: DOSYALAR, total: 3 });
    const { container } = await ac();
    expect(dosyalar).not.toHaveBeenCalled();

    fireEvent.click(baslik(satirlar(container)[0]));
    await flush();

    expect(dosyalar).toHaveBeenCalledWith(CWD, S1.id);
    const adlar = [...container.querySelectorAll(".stash-file .git-path")].map((e) => e.textContent);
    expect(adlar).toEqual(["a.ts", "yeni.md", "notlar.md"]);
  });

  /*
   * İSTEK: "Klasör yollarını göster etkisi Stash'te de olmalı." Değişiklikler
   * listesiyle aynı ayar (`ui.gitShowPaths`); varsayılan gizli.
   */
  it("klasör ön eki 'Klasör yollarını göster' ayarına uyuyor", async () => {
    vi.spyOn(api, "gitStashFiles").mockResolvedValue({
      files: [{ status: "M ", path: "src/lib/a.ts", untracked: false }],
      total: 1,
    });
    useStore.setState({ ui: { ...useStore.getState().ui, gitShowPaths: false } });
    const { container } = await ac();
    fireEvent.click(baslik(satirlar(container)[0]));
    await flush();
    expect(container.querySelector(".stash-file .git-dir"), "kapalıyken çizilmiş").toBe(null);
    expect(container.querySelector(".stash-file .git-path")!.textContent).toBe("a.ts");

    act(() => useStore.getState().setUi({ gitShowPaths: true }));
    expect(container.querySelector(".stash-file .git-dir")!.textContent).toBe("src/lib/");
  });

  it("her dosya durum simgesini taşıyor", async () => {
    vi.spyOn(api, "gitStashFiles").mockResolvedValue({ files: DOSYALAR, total: 3 });
    const { container } = await ac();
    fireEvent.click(baslik(satirlar(container)[0]));
    await flush();

    const simgeler = [...container.querySelectorAll(".stash-file .git-icon")].map((e) => e.className);
    expect(simgeler).toEqual(["git-icon mod", "git-icon ren", "git-icon untracked"]);
  });

  it("kesik liste 've N dosya daha' diyor", async () => {
    // Sessizce kesmek "dosyam nerede" diye sordururdu.
    vi.spyOn(api, "gitStashFiles").mockResolvedValue({ files: DOSYALAR, total: 250 });
    const { container } = await ac();
    fireEvent.click(baslik(satirlar(container)[0]));
    await flush();

    expect(container.querySelector(".stash-files")!.textContent).toContain("… ve 247 dosya daha");
  });

  it("kesilmemiş listede 'daha' satırı yok", async () => {
    vi.spyOn(api, "gitStashFiles").mockResolvedValue({ files: DOSYALAR, total: 3 });
    const { container } = await ac();
    fireEvent.click(baslik(satirlar(container)[0]));
    await flush();

    expect(container.querySelector(".stash-files")!.textContent).not.toContain("daha");
  });

  it("dosyası olmayan stash açıklıyor", async () => {
    vi.spyOn(api, "gitStashFiles").mockResolvedValue({ files: [], total: 0 });
    const { container } = await ac();
    fireEvent.click(baslik(satirlar(container)[0]));
    await flush();

    expect(container.querySelector(".git-item .pop-empty")!.textContent).toBe(
      "Bu stash'te dosya bulunamadı",
    );
  });

  it("dosyalar okunamazsa git'in metni gösteriliyor", async () => {
    vi.spyOn(api, "gitStashFiles").mockRejectedValue("stash bulunamadi; liste degismis olabilir");
    const { container } = await ac();
    fireEvent.click(baslik(satirlar(container)[0]));
    await flush();

    expect(container.querySelector(".git-item .pop-empty")!.textContent).toBe(
      "stash bulunamadi; liste degismis olabilir",
    );
  });

  it("satır kapatılıp açılınca içerik yine görünüyor", async () => {
    const dosyalar = vi.spyOn(api, "gitStashFiles").mockResolvedValue({ files: DOSYALAR, total: 3 });
    const { container } = await ac();
    const b = baslik(satirlar(container)[0]);

    fireEvent.click(b);
    await flush();
    fireEvent.click(b);
    expect(container.querySelector(".stash-files")).toBe(null);
    fireEvent.click(b);
    await flush();

    // Bileşen sökülüp yeniden kuruluyor: içerik taze isteniyor (stash'in içeriği
    // değişmez ama liste tazelenmiş olabilir); dosyalar yine de görünüyor.
    expect(container.querySelectorAll(".stash-file")).toHaveLength(3);
    expect(dosyalar.mock.calls.length).toBeGreaterThanOrEqual(1);
  });
});

describe("dosya farkı", () => {
  async function dosyaAc() {
    vi.spyOn(api, "gitStashFiles").mockResolvedValue({ files: DOSYALAR, total: 3 });
    const view = await ac();
    fireEvent.click(baslik(satirlar(view.container)[0]));
    await flush();
    return view;
  }
  const dosyaBasligi = (v: HTMLElement, n: number) =>
    v.querySelectorAll<HTMLButtonElement>(".stash-file > .git-row")[n];

  it("fark YALNIZCA dosyaya tıklanınca isteniyor", async () => {
    const fark = vi.spyOn(api, "gitStashDiff").mockResolvedValue(FARK);
    await dosyaAc();
    expect(fark).not.toHaveBeenCalled();
  });

  it("tıklayınca doğru argümanlarla isteniyor ve satırlar çiziliyor", async () => {
    const fark = vi.spyOn(api, "gitStashDiff").mockResolvedValue(FARK);
    const { container } = await dosyaAc();

    fireEvent.click(dosyaBasligi(container, 0));
    await flush();

    expect(fark).toHaveBeenCalledWith(CWD, S1.id, "src/a.ts", undefined, false);
    expect(container.querySelectorAll(".diff-line.del")).toHaveLength(1);
    expect(container.querySelectorAll(".diff-line.add")).toHaveLength(1);
    expect(container.querySelector(".diff-line.del .diff-text")!.textContent).toBe("-eski satir");
  });

  it("yeniden adlandırmada ESKİ yol da gidiyor", async () => {
    // Yalnızca yeni ad verilince git eşleşmeyi göremiyor ve dosyayı "yeni eklendi"
    // diye gösteriyor (Rust tarafında ölçüldü).
    const fark = vi.spyOn(api, "gitStashDiff").mockResolvedValue(FARK);
    const { container } = await dosyaAc();

    fireEvent.click(dosyaBasligi(container, 1));
    await flush();

    expect(fark).toHaveBeenCalledWith(CWD, S1.id, "docs/yeni.md", "docs/eski.md", false);
  });

  it("takipsiz dosyada untracked bayrağı gidiyor", async () => {
    const fark = vi.spyOn(api, "gitStashDiff").mockResolvedValue(FARK);
    const { container } = await dosyaAc();

    fireEvent.click(dosyaBasligi(container, 2));
    await flush();

    expect(fark).toHaveBeenCalledWith(CWD, S1.id, "notlar.md", undefined, true);
  });

  it("boş ya da okunamayan fark 'gösterilecek fark yok' diyor", async () => {
    const fark = vi.spyOn(api, "gitStashDiff").mockResolvedValue("");
    const { container } = await dosyaAc();
    fireEvent.click(dosyaBasligi(container, 0));
    await flush();
    expect(container.querySelector(".stash-file .pop-empty")!.textContent).toBe("Gösterilecek fark yok");

    fark.mockResolvedValue(null);
    fireEvent.click(dosyaBasligi(container, 1));
    await flush();
    expect(container.querySelectorAll(".stash-file .pop-empty")).toHaveLength(2);
  });

  it("fark isteği düşerse çökmüyor", async () => {
    vi.spyOn(api, "gitStashDiff").mockRejectedValue("hata");
    const { container } = await dosyaAc();
    fireEvent.click(dosyaBasligi(container, 0));
    await flush();
    expect(container.querySelector(".stash-file .pop-empty")!.textContent).toBe("Gösterilecek fark yok");
  });

  it("gelen fark saklanıyor: kapatıp açmak yeni istek üretmiyor", async () => {
    const fark = vi.spyOn(api, "gitStashDiff").mockResolvedValue(FARK);
    const { container } = await dosyaAc();
    const b = dosyaBasligi(container, 0);

    fireEvent.click(b);
    await flush();
    fireEvent.click(b);
    fireEvent.click(b);
    await flush();

    expect(fark).toHaveBeenCalledTimes(1);
    expect(container.querySelectorAll(".diff-line.add")).toHaveLength(1);
  });

  it("fark yalnızca OKUNUR: bağlam açıcısı çizilmiyor", async () => {
    // Açıcılar dosyanın ÇALIŞMA AĞACINDAKİ hâlinden okur; stash'in dosyası orada
    // yok ya da başka bir hâlde. Çizmek, basınca yanlış satırları açan bir düğme olurdu.
    const uzun = [
      "diff --git a/a b/a", "--- a/a", "+++ b/a",
      "@@ -10,2 +10,2 @@ ozet()", "-x", "+y", "@@ -40,1 +40,1 @@ diger()", "-p", "+q",
    ].join("\n");
    vi.spyOn(api, "gitStashDiff").mockResolvedValue(uzun);
    const { container } = await dosyaAc();
    fireEvent.click(dosyaBasligi(container, 0));
    await flush();

    expect(container.querySelectorAll(".diff-gap").length).toBeGreaterThan(0);
    expect(container.querySelectorAll(".diff-gap-actions button")).toHaveLength(0);
    expect(container.querySelector(".diff-gap-count")!.textContent).toBe("9 değişmemiş satır");
  });
});

// ------------------------------------------------------- Değişiklikler'in içinde

describe("Değişiklikler'in içinde bölüm", () => {
  it("varsayılan KAPALI", () => {
    // `seed` durumu açıkça kuruyor; asıl varsayılan burada sınanıyor. Açık gelseydi
    // her depoda değişiklik listesinin üstünü stash'ler işgal ederdi.
    expect(useStore.getInitialState().ui.stashOpen).toBe(false);
  });

  /** Bölüm KAPALI başlıyor (varsayılan) ve Değişiklikler listesinin içinde çiziliyor. */
  function degisiklikler(info: GitInfo | null = repo(), open = false) {
    seed(info, open);
    return render(<GitChanges />);
  }

  it("başlık depo varken çiziliyor: varsayılan KAPALI, liste istenmiyor", async () => {
    const istek = vi.spyOn(api, "gitStashes");
    const { container } = degisiklikler();
    await flush();

    const b = baslikDugmesi(container)!;
    expect(b.textContent).toContain("Stash");
    expect(b.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector(".stash-body"), "kapalıyken gövde çizilmiş").toBe(null);
    expect(istek, "kapalıyken liste istendi").not.toHaveBeenCalled();
  });

  it("başlığa basınca açılıyor ve liste istenmeye başlıyor", async () => {
    const istek = vi.spyOn(api, "gitStashes").mockResolvedValue([S1, S2]);
    const { container } = degisiklikler();
    await flush();

    fireEvent.click(baslikDugmesi(container)!);
    await flush();

    expect(useStore.getState().ui.stashOpen).toBe(true);
    expect(baslikDugmesi(container)!.getAttribute("aria-expanded")).toBe("true");
    expect(istek).toHaveBeenCalledWith(CWD);
    expect(satirlar(container).filter((el) => el.querySelector(".stash-name"))).toHaveLength(2);
  });

  it("tekrar basınca kapanıyor", async () => {
    const { container } = degisiklikler(repo(), true);
    await flush();
    expect(container.querySelector(".stash-body")).not.toBe(null);

    fireEvent.click(baslikDugmesi(container)!);

    expect(useStore.getState().ui.stashOpen).toBe(false);
    expect(container.querySelector(".stash-body")).toBe(null);
  });

  it("açık durumu depoda: bölüm sökülüp kurulunca açık kalıyor", async () => {
    // Panelin sekmesi değişince liste sökülüyor; yerel durum olsaydı açık bölüm her
    // dönüşte kapanırdı.
    const ilk = degisiklikler();
    await flush();
    fireEvent.click(baslikDugmesi(ilk.container)!);
    ilk.unmount();

    const ikinci = render(<GitChanges />);
    await flush();
    expect(baslikDugmesi(ikinci.container)!.getAttribute("aria-expanded")).toBe("true");
  });

  it("stash sayısı başlıkta, liste hiç açılmadan", async () => {
    // Sayı durum okumasıyla geliyor: unutulmuş stash'ler bölüm açılmadan görünüyor.
    const istek = vi.spyOn(api, "gitStashes");
    const { container } = degisiklikler(repo({ stashCount: 3 }));
    await flush();
    expect(sayac(container)!.textContent).toBe("3");
    expect(istek).not.toHaveBeenCalled();
  });

  it("stash yoksa rozet yok, başlık yine duruyor", async () => {
    const { container } = degisiklikler(repo({ stashCount: 0 }));
    await flush();
    expect(baslikDugmesi(container)).not.toBe(null);
    expect(sayac(container)).toBe(null);
  });

  it("temiz çalışma ağacında da bölüm duruyor", async () => {
    // Stash'i uygulamak için en sık an bu: değişiklik yok ve liste başka bir şey
    // göstermiyor. Bölüm olmasa stash'e ulaşılamazdı.
    const { container } = degisiklikler(repo({ changes: [], stashCount: 2 }));
    await flush();
    expect(container.textContent).toContain("Değişiklik yok");
    expect(baslikDugmesi(container)).not.toBe(null);
  });

  it("temiz ağaçta açılıp stash uygulanabiliyor", async () => {
    const apply = vi.spyOn(api, "gitStashApply").mockResolvedValue(undefined);
    const { container } = degisiklikler(repo({ changes: [], stashCount: 2 }), true);
    await flush();

    fireEvent.click(uygula(satirlar(container)[0]));
    await flush();

    expect(apply).toHaveBeenCalledWith(CWD, S1.id, false, false);
  });

  it("depo değilse bölüm çizilmiyor, açıklama Değişiklikler'in", async () => {
    const { container } = degisiklikler(null);
    await flush();
    expect(container.querySelector(".stash-section")).toBe(null);
    expect(container.textContent).toContain("Bu klasör bir git deposu değil");
  });

  it("bölüm dosya listesinin ÜSTÜNDE", async () => {
    const { container } = degisiklikler();
    await flush();
    const bolum = container.querySelector(".stash-section")!;
    const ilkDosya = container.querySelector(".git-check")!;
    expect(
      bolum.compareDocumentPosition(ilkDosya) & Node.DOCUMENT_POSITION_FOLLOWING,
      "bölüm dosya satırlarından sonra geliyor",
    ).toBeTruthy();
  });

  it("panelde dördüncü sekme YOK", async () => {
    // Dört sekme başlığa sığmıyordu: varsayılan genişlikte etiketler kırpılıyordu.
    seed();
    useStore.setState({ ui: { ...useStore.getState().ui, historyOpen: true } });
    const { container } = render(<SidePanel />);
    await flush();
    const sekmeler = [...container.querySelectorAll<HTMLButtonElement>(".panel-tabs button")];
    expect(sekmeler.map((b) => b.childNodes[0].textContent)).toEqual([
      "Geçmiş",
      "Favoriler",
      "Değişiklikler",
    ]);
  });

  it("panel sekmesi Değişiklikler'deyken bölüm orada, başlık düğmeleri yerinde", async () => {
    seed();
    useStore.setState({ ui: { ...useStore.getState().ui, historyOpen: true } });
    const { container } = render(<SidePanel />);
    await flush();
    expect(container.querySelector(".stash-section")).not.toBe(null);
    // Klasör yolu, toplu katlama ve kapatma: üç düğme.
    expect(container.querySelectorAll(".panel-head .icon-btn")).toHaveLength(3);
  });

  it("Geçmiş sekmesinde bölüm çizilmiyor", async () => {
    seed();
    useStore.setState({
      ui: { ...useStore.getState().ui, historyOpen: true, panelMode: "history" },
    });
    const { container } = render(<SidePanel />);
    await flush();
    expect(container.querySelector(".stash-section")).toBe(null);
  });
});

// ----------------------------------------------------------------- ayar simgesi

/**
 * Başlıktaki ayar simgesi.
 *
 * İSTEK: "Stash altında 2 checkbox var; sayacın soluna ayar ikonu koyalım, basınca
 * küçük bir tooltip gibi bir şey içinde bunlar çıksın." Kutular önce açık bölümün
 * üstünde duruyordu; artık simgenin küçük penceresinde.
 */
describe("ayar simgesi", () => {
  function baslik(info: GitInfo | null = repo({ stashCount: 2 }), open = false) {
    seed(info, open);
    return render(<GitChanges />);
  }

  it("başlıkta: yazının ve sayacın arasında (sayacın SOLUNDA)", async () => {
    const { container } = baslik();
    await flush();

    const satir = baslikSatiri(container)!;
    const dugme = ayarDugmesi(container)!;
    expect(dugme, "ayar simgesi yok").not.toBe(null);
    expect(dugme.title).toBe("Stash seçenekleri");
    // Sıra: açıp kapatan düğme (yazı) → ayar simgesi → sayaç.
    const sira = [...satir.querySelectorAll("button, .pill-count")];
    expect(sira.map((el) => el.className.split(" ")[0])).toEqual(["stash-toggle", "icon-btn", "pill-count"]);
    expect(satir.contains(dugme)).toBe(true);
  });

  it("simge sayaç yokken de duruyor", async () => {
    const { container } = baslik(repo({ stashCount: 0 }));
    await flush();
    expect(ayarDugmesi(container)).not.toBe(null);
    expect(sayac(container)).toBe(null);
  });

  it("kutular varsayılan olarak GÖRÜNMÜYOR: ne başlıkta ne açık bölümün altında", async () => {
    // Önceki hâli: açık bölümün üstünde her seferinde yer kaplıyordu.
    const { container } = baslik(repo({ stashCount: 2 }), true);
    await flush();
    expect(ayarPenceresi(container)).toBe(null);
    expect(container.querySelector(".stash-options"), "kutular eski yerinde").toBe(null);
    expect(container.querySelector('.stash-body input[type="checkbox"]')).toBe(null);
  });

  it("basınca küçük pencere açılıyor: iki kutu, etiketleriyle", async () => {
    const { container } = baslik();
    await flush();

    fireEvent.click(ayarDugmesi(container)!);

    const pencere = ayarPenceresi(container)!;
    expect(pencere, "pencere açılmadı").not.toBe(null);
    expect(ayarDugmesi(container)!.getAttribute("aria-expanded")).toBe("true");
    const etiketler = [...pencere.querySelectorAll("label")].map((l) => l.textContent);
    expect(etiketler).toEqual(["Uyguladıktan sonra sil (pop)", "İndeksi geri yükle"]);
    expect(pencere.querySelectorAll('input[type="checkbox"]')).toHaveLength(2);
  });

  it("tekrar basınca kapanıyor", async () => {
    const { container } = baslik();
    await flush();
    fireEvent.click(ayarDugmesi(container)!);
    fireEvent.click(ayarDugmesi(container)!);
    expect(ayarPenceresi(container)).toBe(null);
    expect(ayarDugmesi(container)!.getAttribute("aria-expanded")).toBe("false");
  });

  it("bölüm KAPALIYKEN de açılıyor", async () => {
    // Seçenekler kalıcı ayar: liste kapalıyken de değiştirilebilmeli.
    const { container } = baslik(repo({ stashCount: 2 }), false);
    await flush();
    fireEvent.click(ayarDugmesi(container)!);
    expect(ayarPenceresi(container)).not.toBe(null);
    expect(container.querySelector(".stash-body")).toBe(null);
  });

  it("simgeye basmak bölümü AÇIP KAPATMIYOR", async () => {
    // Satırın kendisi açıp kapatıyor; simge kabarcığı kesmeli.
    const { container } = baslik();
    await flush();
    fireEvent.click(ayarDugmesi(container)!);
    fireEvent.click(ayarDugmesi(container)!);
    expect(useStore.getState().ui.stashOpen, "simge bölümü açtı").toBe(false);
    expect(container.querySelector(".stash-body")).toBe(null);
  });

  it("penceredeki kutuya basmak bölümü açıp kapatmıyor, ayarı depoya yazıyor", async () => {
    const { container } = baslik();
    await flush();

    const [pop, index] = kutular(container);
    fireEvent.click(pop);
    fireEvent.click(index);

    expect(useStore.getState().ui.stashPop).toBe(true);
    expect(useStore.getState().ui.stashIndex).toBe(true);
    expect(useStore.getState().ui.stashOpen, "kutu bölümü açtı").toBe(false);
    // Pencere kutuya basınca kapanmıyor: iki kutu art arda işaretlenebiliyor.
    expect(ayarPenceresi(container)).not.toBe(null);
  });

  it("pencerenin boşluğuna ve etiketine basmak da bölümü etkilemiyor", async () => {
    const { container } = baslik();
    await flush();
    fireEvent.click(ayarDugmesi(container)!);

    fireEvent.click(ayarPenceresi(container)!);
    fireEvent.click(ayarPenceresi(container)!.querySelector("label span")!);

    expect(useStore.getState().ui.stashOpen).toBe(false);
  });

  it("odak açılınca ilk kutuya geçiyor", async () => {
    // Klavyeyle açan kişi hemen kullanabilsin.
    const { container } = baslik();
    await flush();
    fireEvent.click(ayarDugmesi(container)!);
    expect(document.activeElement).toBe(ayarPenceresi(container)!.querySelector("input"));
  });

  it("dışarı basınca kapanıyor", async () => {
    const { container } = baslik();
    await flush();
    fireEvent.click(ayarDugmesi(container)!);

    fireEvent.mouseDown(document.body);

    expect(ayarPenceresi(container)).toBe(null);
  });

  it("pencerenin İÇİNE ya da simgeye basmak dışarı basmak sayılmıyor", async () => {
    const { container } = baslik();
    await flush();
    fireEvent.click(ayarDugmesi(container)!);

    fireEvent.mouseDown(ayarPenceresi(container)!);
    fireEvent.mouseDown(ayarDugmesi(container)!);

    expect(ayarPenceresi(container), "içeri basınca kapandı").not.toBe(null);
  });

  it("başlığa basmak pencereyi kapatıyor ve bölümü açıyor", async () => {
    const { container } = baslik();
    await flush();
    fireEvent.click(ayarDugmesi(container)!);

    const dugme = baslikDugmesi(container)!;
    fireEvent.mouseDown(dugme);
    fireEvent.click(dugme);

    expect(ayarPenceresi(container)).toBe(null);
    expect(useStore.getState().ui.stashOpen).toBe(true);
  });

  it("Esc kapatıyor ve odağı simgeye geri veriyor", async () => {
    const { container } = baslik();
    await flush();
    fireEvent.click(ayarDugmesi(container)!);

    fireEvent.keyDown(window, { key: "Escape" });

    expect(ayarPenceresi(container)).toBe(null);
    expect(document.activeElement).toBe(ayarDugmesi(container));
  });

  it("Esc pencere kapalıyken hiçbir şeye karışmıyor", async () => {
    // Dinleyici yalnızca açıkken kurulu: kapalıyken Esc uygulamanın genel kısayoluna gitmeli.
    const { container } = baslik();
    await flush();
    const olay = new KeyboardEvent("keydown", { key: "Escape", cancelable: true, bubbles: true });
    window.dispatchEvent(olay);
    expect(olay.defaultPrevented).toBe(false);
    expect(ayarPenceresi(container)).toBe(null);
  });

  it("Esc açıkken olayı YAKALIYOR: genel kısayola gitmiyor", async () => {
    // Yoksa uygulamanın Esc kısayolu başka bir örtüyü ya da paneli kapatırdı.
    const { container } = baslik();
    await flush();
    fireEvent.click(ayarDugmesi(container)!);
    const genel = vi.fn();
    window.addEventListener("keydown", genel);

    fireEvent.keyDown(window, { key: "Escape" });

    window.removeEventListener("keydown", genel);
    expect(genel, "Esc genel dinleyiciye ulaştı").not.toHaveBeenCalled();
  });

  it("bir seçenek AÇIKKEN simge vurgulu: kutular gizli olsa da durum belli", async () => {
    // "Uyguladıktan sonra sil" geri dönüşü olmayan taraf; gizli bir kutu sessizce
    // etkin kalmamalı.
    const { container } = baslik();
    await flush();
    expect(ayarDugmesi(container)!.className).toBe("icon-btn");

    const [pop, index] = kutular(container);
    fireEvent.click(pop);
    expect(ayarDugmesi(container)!.className).toBe("icon-btn on");
    fireEvent.click(pop);
    expect(ayarDugmesi(container)!.className).toBe("icon-btn");
    fireEvent.click(index);
    expect(ayarDugmesi(container)!.className).toBe("icon-btn on");
  });

  it("vurgu pencere kapalıyken de duruyor", async () => {
    seed(repo({ stashCount: 2 }), false);
    useStore.setState({ ui: { ...useStore.getState().ui, stashPop: true } });
    const { container } = render(<GitChanges />);
    await flush();
    expect(ayarPenceresi(container)).toBe(null);
    expect(ayarDugmesi(container)!.className).toBe("icon-btn on");
  });

  it("satırdaki uygula ipucu açık seçeneği söylüyor (kutular gizli olsa da)", async () => {
    vi.spyOn(api, "gitStashes").mockResolvedValue([S1]);
    const { container } = baslik(repo({ stashCount: 1 }), true);
    await flush();
    expect(uygula(satirlar(container)[0]).title).toBe("Uygula (stash listede kalır)");

    fireEvent.click(kutular(container)[0]);
    expect(uygula(satirlar(container)[0]).title).toBe("Uygula ve sil");
  });
});

describe("başlık satırı", () => {
  function baslik(open = false) {
    seed(repo({ stashCount: 2 }), open);
    return render(<GitChanges />);
  }

  it("açıp kapatan düğme tek tıkta YALNIZCA BİR KEZ çevirir", async () => {
    // Satır işleyici tek; düğmede ayrı bir işleyici olsaydı iki kez çevirip yerinde bırakırdı.
    const { container } = baslik();
    await flush();
    fireEvent.click(baslikDugmesi(container)!);
    expect(useStore.getState().ui.stashOpen).toBe(true);
    fireEvent.click(baslikDugmesi(container)!);
    expect(useStore.getState().ui.stashOpen).toBe(false);
  });

  it("satırın boşluğuna ve sayaca basmak da açıp kapatıyor", async () => {
    const { container } = baslik();
    await flush();
    fireEvent.click(baslikSatiri(container)!);
    expect(useStore.getState().ui.stashOpen).toBe(true);
    fireEvent.click(sayac(container)!);
    expect(useStore.getState().ui.stashOpen).toBe(false);
  });

  it("satırın kendisi düğme değil: içinde ayar düğmesi var, iç içe düğme yok", async () => {
    const { container } = baslik();
    await flush();
    expect(baslikSatiri(container)!.tagName).toBe("DIV");
    expect(container.querySelector("button button"), "iç içe düğme").toBe(null);
  });
});
