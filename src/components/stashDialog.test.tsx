// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLanguage } from "../lib/i18n";
import { api } from "../lib/ipc";
import { setPlatform } from "../lib/platform";
import { useStore } from "../store/useStore";
import type { GitChange, GitInfo } from "../types";
import { StashDialog } from "./StashDialog";

/**
 * "Stash'e at" penceresi.
 *
 * İSTEK: "stash yapısı, IntelliJ / WebStorm'daki gibi: kişi istediklerini stash
 * atsın, isimlendirebilsin." Ardından: "Değişiklikler listesinde neler seçiliyse
 * Stash'a bastığımda onlar seçili gelsin, kişi isterse değiştirsin. Ayrıca burada
 * da dosya path'i gizli gelsin, checkbox ile isterse kişi açsın."
 *
 * Git'in kendisi Rust testlerinde gerçek depolarla sınanıyor (`git_tests.rs`).
 * Burada bağlanan şey arayüzün payı: pencerenin listedeki işaretli dosyalarla
 * açılması, DOĞRU yolların gitmesi (seçilmeyen hiç, yeniden adlandırmada eski ad
 * da), takipsiz dosya seçilince `--include-untracked`, klasör yollarının gizli
 * gelmesi ve kullanıcının emeğini koruyan sınırlar (hata sonrası seçim ve ad).
 *
 * `CHANGES` bilerek karışık: `M ` ve `R ` indekste (listede işaretli), ötekiler
 * değil. Böylece "listeden gelen seçim" ile "hepsi" birbirinden ayrışıyor.
 */

const CWD = "/depo";

const c = (status: string, path: string, origPath?: string): GitChange =>
  origPath ? { status, path, origPath } : { status, path };

const CHANGES = [
  c(" M", "src/App.tsx"),
  c("M ", "src/lib/a.ts"),
  c("??", "notlar.md"),
  c("R ", "docs/yeni.md", "docs/eski.md"),
  c(" D", "silinen.txt"),
];

function repo(changes: GitChange[] = CHANGES): GitInfo {
  return {
    branch: "main",
    detached: false,
    ahead: 0,
    behind: 0,
    upstream: "origin/main",
    unborn: false,
    staged: 0,
    stashCount: 0,
    changes,
    root: CWD,
  };
}

/** Sonraki her `refreshGit` bu durumu okuyacak. */
function gitSays(info: GitInfo) {
  vi.spyOn(api, "gitInfo").mockResolvedValue(info);
  vi.spyOn(api, "gitFingerprint").mockResolvedValue("imza");
}

function seed(changes: GitChange[] = CHANGES) {
  useStore.setState({
    gitInfo: { [CWD]: repo(changes) },
    ui: { ...useStore.getState().ui, stashDialog: { cwd: CWD } },
  });
}

const toast = vi.fn();

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
  // Klasör yolları ortak ayar (`ui.gitShowPaths`): testler birbirine sızmasın.
  useStore.setState({ toast, ui: { ...useStore.getState().ui, gitShowPaths: false } });
  gitSays(repo());
});

afterEach(async () => {
  acik.splice(0).forEach((coz) => coz());
  await act(async () => {});
  cleanup();
  vi.restoreAllMocks();
});

const flush = () => act(async () => {});

function ac(changes?: GitChange[]) {
  seed(changes);
  return render(<StashDialog cwd={CWD} />);
}

/**
 * Pencere açılıp "Tüm dosyaları seç"e basılmış hâli: seçimi tek tek daraltan
 * testlerin çıkış noktası. Açılıştaki seçim listeden geliyor (bkz. `açılış`).
 */
function acHepsi(changes?: GitChange[]) {
  const view = ac(changes);
  if (!master(view.container).checked) fireEvent.click(master(view.container));
  return view;
}

const adAlani = (v: HTMLElement) => v.querySelector<HTMLInputElement>("#stash-name")!;
const satirlar = (v: HTMLElement) => [...v.querySelectorAll<HTMLElement>(".stash-pick")];
const kutu = (satir: HTMLElement) => satir.querySelector<HTMLInputElement>("input")!;
const master = (v: HTMLElement) => v.querySelector<HTMLInputElement>(".stash-files-head input")!;
const onay = (v: HTMLElement) => v.querySelector<HTMLButtonElement>(".modal-foot .primary")!;
const vazgec = (v: HTMLElement) => v.querySelector<HTMLButtonElement>(".modal-foot .outline")!;
const hata = (v: HTMLElement) => v.querySelector<HTMLElement>(".git-commit-error");
const acikMi = () => useStore.getState().ui.stashDialog !== null;
const yaz = (v: HTMLElement, value: string) =>
  fireEvent.change(adAlani(v), { target: { value } });
/** Satırın dosya yolu: `title`daki tam yol (yeniden adlandırmada `eski → yeni`). */
const yol = (satir: HTMLElement) => satir.title;
/** "Klasör yollarını göster" kutusu. */
const yollar = (v: HTMLElement) => v.querySelector<HTMLInputElement>(".stash-paths input")!;
const secili = (v: HTMLElement) => satirlar(v).map((s) => kutu(s).checked);

describe("açılış", () => {
  it("Değişiklikler listesinde işaretli dosyalar seçili açılıyor", () => {
    // İSTEK: "listede neler seçiliyse Stash'a bastığımda onlar seçili gelsin."
    // Listedeki kutu "commit'e ekle" demek: `M ` (a.ts) ve `R ` (yeni.md) indekste.
    const { container } = ac();
    expect(satirlar(container)).toHaveLength(5);
    expect(secili(container)).toEqual([false, true, false, true, false]);
    expect(container.querySelector(".stash-files-head")!.textContent).toContain("2 dosya seçili");
    // Bir kısmı seçili: toplu kutu ara hâlde.
    expect(master(container).checked).toBe(false);
    expect(master(container).indeterminate).toBe(true);
  });

  it("kısmen eklenmiş dosya da seçili", () => {
    // `MM`: kutusu yarım işaretli; stash dosya düzeyinde çalışıyor.
    const { container } = ac([c("MM", "a.ts"), c("AM", "b.ts"), c(" M", "c.ts")]);
    expect(secili(container)).toEqual([true, true, false]);
  });

  it("hepsi işaretliyse hepsi seçili, toplu kutu işaretli", () => {
    const { container } = ac([c("M ", "a.ts"), c("A ", "b.ts")]);
    expect(secili(container)).toEqual([true, true]);
    expect(master(container).checked).toBe(true);
    expect(master(container).indeterminate).toBe(false);
  });

  it("hiçbiri işaretli değilse seçim BOŞ: hepsini varsaymıyor", () => {
    // Boş bir seçim bir tık ("Tüm dosyaları seç"); yanlışlıkla her şeyi kenara
    // atmak ise ilk Enter'da oluyor.
    const { container } = ac([c(" M", "a.ts"), c("??", "b.md")]);
    expect(secili(container)).toEqual([false, false]);
    expect(master(container).checked).toBe(false);
    expect(master(container).indeterminate).toBe(false);
    expect(onay(container).disabled).toBe(true);
    expect(container.querySelector(".stash-files-head")!.textContent).toContain("0 dosya seçili");
  });

  it("çakışmalı dosya kendiliğinden seçilmiyor", () => {
    // `UU`: indekste değil, çözülene kadar git stash'i de reddeder.
    const { container } = ac([c("UU", "x.ts"), c("M ", "a.ts")]);
    expect(secili(container)).toEqual([false, true]);
  });

  it("açılıştaki seçim hemen basılınca OLDUĞU GİBİ git'e gidiyor", async () => {
    // Listede işaretli olan ikisi (yeniden adlandırmada eski ad da); takipsiz yok.
    const push = vi.spyOn(api, "gitStashPush").mockResolvedValue("abc1234");
    const { container } = ac();

    fireEvent.click(onay(container));
    await flush();

    expect(push).toHaveBeenCalledWith(
      CWD,
      "",
      ["src/lib/a.ts", "docs/eski.md", "docs/yeni.md"],
      false,
    );
  });

  it("pencerede seçimi değiştirmek listedeki kutulara dokunmuyor", async () => {
    // Listedeki kutu `git add`; stash seçimi ondan BAĞIMSIZ bir kopya. Buradaki
    // tık indeksi değiştirirse kullanıcı stash'i düşünürken commit'ini bozar.
    const stage = vi.spyOn(api, "gitStage").mockResolvedValue(undefined);
    const unstage = vi.spyOn(api, "gitUnstage").mockResolvedValue(undefined);
    const { container } = ac();

    fireEvent.click(kutu(satirlar(container)[0]));
    fireEvent.click(kutu(satirlar(container)[1]));
    fireEvent.click(master(container));
    await flush();

    expect(stage).not.toHaveBeenCalled();
    expect(unstage).not.toHaveBeenCalled();
    expect(useStore.getState().gitInfo[CWD]!.changes).toEqual(CHANGES);
  });

  it("ad alanı odakta: yazmaya hemen başlanabiliyor", () => {
    const { container } = ac();
    expect(document.activeElement).toBe(adAlani(container));
  });

  it("satırlar durum simgesi, klasör ve dosya adını taşıyor", () => {
    // Klasör ön eki varsayılan olarak gizli (bkz. `klasör yolları`); burada açık.
    useStore.setState({ ui: { ...useStore.getState().ui, gitShowPaths: true } });
    const { container } = ac();
    const ilk = satirlar(container)[0];
    expect(ilk.querySelector(".git-icon")!.getAttribute("title")).toBe("Değişti");
    // `dirName` sondaki eğik çizgiyi koruyor: "src/" — dosya adı hemen ardından geliyor.
    expect(ilk.querySelector(".git-dir")!.textContent).toBe("src/");
    expect(ilk.querySelector(".git-path")!.textContent).toBe("App.tsx");
    // Kökteki dosyada klasör öneki hiç çizilmiyor.
    expect(satirlar(container)[2].querySelector(".git-dir")).toBe(null);
  });

  it("yeniden adlandırmanın ipucu eski adı da gösteriyor", () => {
    const { container } = ac();
    expect(yol(satirlar(container)[3])).toBe("docs/eski.md → docs/yeni.md");
  });

  it("değişiklik yoksa liste boş, Stash düğmesi kapalı", () => {
    const { container } = ac([]);
    expect(satirlar(container)).toHaveLength(0);
    expect(onay(container).disabled).toBe(true);
    expect(container.querySelector(".stash-files-head")!.textContent).toContain("0 dosya seçili");
  });
});

describe("stash'e atma", () => {
  it("ad ve TÜM yollar gidiyor; takipsiz dosya olduğu için includeUntracked açık", async () => {
    const push = vi.spyOn(api, "gitStashPush").mockResolvedValue("abc1234");
    const { container } = acHepsi();
    yaz(container, "ayar denemesi");

    fireEvent.click(onay(container));
    await flush();

    // Yeniden adlandırmada ESKİ ad önce; sıra listenin sırası.
    expect(push).toHaveBeenCalledWith(
      CWD,
      "ayar denemesi",
      ["src/App.tsx", "src/lib/a.ts", "notlar.md", "docs/eski.md", "docs/yeni.md", "silinen.txt"],
      true,
    );
    expect(toast).toHaveBeenCalledWith("Stash'e atıldı: ayar denemesi", "ok");
    expect(acikMi(), "başarıdan sonra pencere kapanmadı").toBe(false);
  });

  it("ad boşsa git'in varsayılanı: boş ileti gidiyor, bildirim adsız", async () => {
    const push = vi.spyOn(api, "gitStashPush").mockResolvedValue("abc1234");
    const { container } = ac();

    fireEvent.click(onay(container));
    await flush();

    expect(push.mock.calls[0][1]).toBe("");
    expect(toast).toHaveBeenCalledWith("Stash'e atıldı", "ok");
  });

  it("adın bas ve sonundaki boşluk atılıyor", async () => {
    const push = vi.spyOn(api, "gitStashPush").mockResolvedValue("abc1234");
    const { container } = ac();
    yaz(container, "  ad  ");

    fireEvent.click(onay(container));
    await flush();

    expect(push.mock.calls[0][1]).toBe("ad");
  });

  it("yalnızca SEÇİLİ dosyalar gidiyor", async () => {
    const push = vi.spyOn(api, "gitStashPush").mockResolvedValue("abc1234");
    const { container } = acHepsi();
    // Yalnızca ilk iki satır kalsın.
    for (const satir of satirlar(container).slice(2)) fireEvent.click(kutu(satir));

    fireEvent.click(onay(container));
    await flush();

    expect(push.mock.calls[0][2]).toEqual(["src/App.tsx", "src/lib/a.ts"]);
    expect(container.querySelector(".stash-files-head")!.textContent).toContain("2 dosya seçili");
  });

  it("takipsiz dosya SEÇİLMEMİŞSE includeUntracked kapalı ve ipucu yok", async () => {
    const push = vi.spyOn(api, "gitStashPush").mockResolvedValue("abc1234");
    // Takipsiz dosya listede işaretli değil, yani seçili gelmiyor.
    const { container } = ac();
    expect(kutu(satirlar(container)[2]).checked).toBe(false); // notlar.md

    expect(container.querySelector(".hintline"), "takipsiz seçili değilken ipucu var").toBe(null);
    fireEvent.click(onay(container));
    await flush();

    expect(push.mock.calls[0][3]).toBe(false);
  });

  it("takipsiz dosya seçiliyken kullanıcıya sorulmadan bilgi veriliyor", () => {
    // `-u` ayrı bir kutu değil: takipsiz dosyayı seçmek onu stash'e almak istemek.
    const { container } = ac();
    expect(container.querySelector(".hintline"), "seçmeden ipucu var").toBe(null);
    fireEvent.click(kutu(satirlar(container)[2])); // notlar.md
    expect(container.querySelector(".hintline")!.textContent).toBe(
      "Takipsiz dosyalar da stash'e alınır (git stash -u)",
    );
  });

  it("Enter ad alanında stash'e atıyor", async () => {
    const push = vi.spyOn(api, "gitStashPush").mockResolvedValue("abc1234");
    const { container } = ac();
    yaz(container, "klavyeden");

    fireEvent.keyDown(adAlani(container), { key: "Enter" });
    await flush();

    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0][1]).toBe("klavyeden");
  });

  it("hiç dosya seçili değilse kapalı; Enter de göndermiyor", async () => {
    const push = vi.spyOn(api, "gitStashPush").mockResolvedValue("abc1234");
    const { container } = acHepsi();
    fireEvent.click(master(container)); // hepsini bırak
    expect(onay(container).disabled).toBe(true);
    expect(onay(container).title).toBe("Önce en az bir dosya seç");

    fireEvent.keyDown(adAlani(container), { key: "Enter" });
    await flush();

    expect(push).not.toHaveBeenCalled();
  });

  it("stash işlemi kuyruktan geçiyor ve sonunda depo tazeleniyor", async () => {
    vi.spyOn(api, "gitStashPush").mockResolvedValue("abc1234");
    const { container } = ac();
    fireEvent.click(onay(container));
    await flush();
    expect(api.gitInfo).toHaveBeenCalledWith(CWD);
  });
});

describe("toplu kutu", () => {
  it("hepsi seçiliyken basınca hiçbiri, tekrar basınca hepsi", () => {
    const { container } = acHepsi();
    fireEvent.click(master(container));
    expect(satirlar(container).every((s) => !kutu(s).checked)).toBe(true);
    fireEvent.click(master(container));
    expect(satirlar(container).every((s) => kutu(s).checked)).toBe(true);
  });

  it("kısmen seçiliyken ara hâlde; basınca hepsi seçiliyor", () => {
    // Açılıştaki seçim zaten kısmi (listede iki dosya işaretli).
    const { container } = ac();
    expect(master(container).checked).toBe(false);
    expect(master(container).indeterminate).toBe(true);

    fireEvent.click(master(container));

    expect(satirlar(container).every((s) => kutu(s).checked)).toBe(true);
  });

  it("hiçbiri seçili değilken basınca hepsi seçiliyor", () => {
    const { container } = ac([c(" M", "a.ts"), c("??", "b.md")]);
    fireEvent.click(master(container));
    expect(secili(container)).toEqual([true, true]);
    expect(onay(container).disabled).toBe(false);
  });
});

describe("hata", () => {
  it("pencere AÇIK kalıyor, ad ve seçim korunuyor, git'in metni kalıcı kutuda", async () => {
    /*
     * Hata sonrası kullanıcı yeniden yazmak ve yeniden seçmek zorunda kalırsa
     * hata, hatanın kendisinden pahalıya geliyor.
     */
    const metin = "error: pathspec 'x' did not match any file(s) known to git";
    vi.spyOn(api, "gitStashPush").mockRejectedValue(metin);
    const { container } = acHepsi();
    yaz(container, "kayboldu mu");
    fireEvent.click(kutu(satirlar(container)[4])); // silinen.txt'i bırak

    fireEvent.click(onay(container));
    await flush();

    expect(acikMi(), "hata sonrası pencere kapandı").toBe(true);
    expect(adAlani(container).value).toBe("kayboldu mu");
    expect(kutu(satirlar(container)[4]).checked).toBe(false);
    expect(hata(container)!.textContent).toContain("Stash'e atılamadı");
    expect(hata(container)!.querySelector("pre")!.textContent).toBe(metin);
    // Düğme yeniden basılabilir.
    expect(onay(container).disabled).toBe(false);
    expect(toast).not.toHaveBeenCalled();
  });

  it("hata kutusu kapatılabiliyor", async () => {
    vi.spyOn(api, "gitStashPush").mockRejectedValue("hata");
    const { container } = ac();
    fireEvent.click(onay(container));
    await flush();

    fireEvent.click(hata(container)!.querySelector("button")!);

    expect(hata(container)).toBe(null);
  });

  it("yeniden deneme eski hatayı temizliyor", async () => {
    const push = vi.spyOn(api, "gitStashPush").mockRejectedValueOnce("ilk hata");
    const { container } = ac();
    fireEvent.click(onay(container));
    await flush();
    expect(hata(container)).not.toBe(null);

    push.mockResolvedValueOnce("abc1234");
    fireEvent.click(onay(container));
    await flush();

    expect(hata(container)).toBe(null);
    expect(acikMi()).toBe(false);
  });
});

describe("iş sürerken", () => {
  it("düğmeler kapalı, ne yaptığını söylüyor", async () => {
    const is = bekleyen<string>();
    vi.spyOn(api, "gitStashPush").mockImplementation(() => is.soz);
    const { container } = ac();

    fireEvent.click(onay(container));
    await flush();

    expect(onay(container).disabled).toBe(true);
    expect(onay(container).textContent).toContain("Stash'e atılıyor…");
    expect(vazgec(container).disabled).toBe(true);
    is.coz("abc1234");
    await flush();
  });

  it("Esc ve dışarı tıklama KAPATMIYOR", async () => {
    // Kapansa sonucu (ve hatayı) gösterecek yer kalmaz.
    const is = bekleyen<string>();
    vi.spyOn(api, "gitStashPush").mockImplementation(() => is.soz);
    const { container } = ac();
    fireEvent.click(onay(container));
    await flush();

    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.mouseDown(container.querySelector(".overlay")!);

    expect(acikMi(), "iş sürerken pencere kapandı").toBe(true);
    is.coz("abc1234");
    await flush();
  });

  it("ikinci tetikleme ikinci bir stash açmıyor", async () => {
    const is = bekleyen<string>();
    const push = vi.spyOn(api, "gitStashPush").mockImplementation(() => is.soz);
    const { container } = ac();
    yaz(container, "x");

    fireEvent.keyDown(adAlani(container), { key: "Enter" });
    await flush();
    fireEvent.keyDown(adAlani(container), { key: "Enter" });
    await flush();

    // İlkini bitirip kuyruğun boşalmasını bekliyoruz: koruma kalksa bile ikinci
    // istek kuyrukta ilkinin ARDINDA bekler ve sürerken sayı 1 görünürdü.
    is.coz("abc1234");
    await flush();
    expect(push, "ikinci tetikleme ikinci bir stash kuyruğa soktu").toHaveBeenCalledTimes(1);
  });
});

describe("kapatma", () => {
  it("Vazgeç kapatıyor ve hiçbir şey göndermiyor", async () => {
    const push = vi.spyOn(api, "gitStashPush").mockResolvedValue("abc1234");
    const { container } = ac();

    fireEvent.click(vazgec(container));
    await flush();

    expect(acikMi()).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });

  it("Esc kapatıyor", () => {
    ac();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(acikMi()).toBe(false);
  });

  it("pencerenin dışına tıklamak kapatıyor, içine tıklamak kapatmıyor", () => {
    const { container } = ac();
    fireEvent.mouseDown(container.querySelector(".stash-dialog")!);
    expect(acikMi()).toBe(true);
    fireEvent.mouseDown(container.querySelector(".overlay")!);
    expect(acikMi()).toBe(false);
  });

  it("× düğmesi kapatıyor", () => {
    const { container } = ac();
    fireEvent.click(container.querySelector(".modal-head button")!);
    expect(acikMi()).toBe(false);
  });
});

describe("git durumu pencere açıkken değişirse", () => {
  it("listeden düşmüş dosya git'e GİTMİYOR", async () => {
    /*
     * Pencere açıkken bir dosya terminalden commit'lendi. Listede olmayan bir yol
     * seçili kalırsa git'e gider ve "pathspec did not match" ile TÜM stash'i düşürür.
     */
    const push = vi.spyOn(api, "gitStashPush").mockResolvedValue("abc1234");
    const { container } = acHepsi();

    await act(async () => {
      useStore.setState({
        gitInfo: { [CWD]: repo([c(" M", "src/App.tsx"), c("??", "notlar.md")]) },
      });
    });
    // Liste pencere açıkken gerçekten güncellendi (üç dosya düştü).
    expect(satirlar(container)).toHaveLength(2);
    fireEvent.click(onay(container));
    await flush();

    expect(push.mock.calls[0][2]).toEqual(["src/App.tsx", "notlar.md"]);
  });
});

describe("klasör yolları", () => {
  it("varsayılan: yalnızca dosya adı, kutu işaretsiz", () => {
    // İSTEK: "burada da dosya path'i gizli gelsin." Listedeki kuralın aynısı.
    const { container } = ac();
    expect(container.querySelector(".git-dir"), "klasör ön eki gizli değil").toBe(null);
    expect(satirlar(container)[0].querySelector(".git-path")!.textContent).toBe("App.tsx");
    expect(yollar(container).checked).toBe(false);
  });

  it("tam yol her durumda ipucunda", () => {
    // Ad yeterli olmadığında yolu görmenin en kısa yolu fareyi satırda tutmak.
    const { container } = ac();
    expect(yol(satirlar(container)[0])).toBe("src/App.tsx");
    expect(yol(satirlar(container)[1])).toBe("src/lib/a.ts");
  });

  it("kutu klasör ön ekini getiriyor ve geri alıyor", () => {
    const { container } = ac();

    fireEvent.click(yollar(container));
    const oneklar = [...container.querySelectorAll(".git-dir")].map((el) => el.textContent);
    // Kökteki dosyalarda (notlar.md, silinen.txt) ön ek yok.
    expect(oneklar).toEqual(["src/", "src/lib/", "docs/"]);
    // Ad ön ekin İÇİNE girmiyor; iki ayrı öge.
    expect(satirlar(container)[0].querySelector(".git-path")!.textContent).toBe("App.tsx");
    expect(yollar(container).checked).toBe(true);

    fireEvent.click(yollar(container));
    expect(container.querySelector(".git-dir"), "yol gizlenmedi").toBe(null);
  });

  it("kutuya basmak seçimi değiştirmiyor", () => {
    const { container } = ac();
    const once = secili(container);
    fireEvent.click(yollar(container));
    expect(secili(container)).toEqual(once);
  });

  it("ayar Değişiklikler listesiyle ORTAK", () => {
    // Listedeki klasör düğmesiyle aynı ayar: bir yerde açılan öbüründe de açık.
    useStore.setState({ ui: { ...useStore.getState().ui, gitShowPaths: true } });
    const { container } = ac();
    expect(yollar(container).checked).toBe(true);
    expect(container.querySelector(".git-dir")).not.toBe(null);

    fireEvent.click(yollar(container));
    expect(useStore.getState().ui.gitShowPaths).toBe(false);
  });
});
