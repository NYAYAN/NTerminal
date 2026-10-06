// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLanguage } from "../lib/i18n";
import { api } from "../lib/ipc";
import { setPlatform } from "../lib/platform";
import { useStore } from "../store/useStore";
import type { GitChange, GitInfo, Group, TabState } from "../types";
import { GitChanges } from "./GitChanges";

/**
 * Değişiklikler panelinde commit ve push.
 *
 * İSTEK: "proje içerisinde git repoda bir değişiklik varsa değişiklikleri
 * gösterdiğimiz bir yapı var N-Terminal içerisinde. Bu yapıda dosyaları commit
 * ve push edebileceğimiz bir yapı istiyorum."
 *
 * Git'in KENDİSİ Rust testlerinde gerçek depolarla sınanıyor (`git_tests.rs`).
 * Burada bağlanan şey arayüzün payı: kutuların doğru hâli, doğru yolların
 * gönderilmesi, hatanın kalıcı gösterilmesi ve — en çok — kullanıcının emeğini
 * koruyan sınırlar (yarım ileti, klavye odağı, satır kimliği).
 *
 * Git'in cevabı `api.gitInfo` sahtesiyle kuruluyor: her yazma işleminden sonra
 * `refreshGit` gerçek yolundan geçiyor ve arayüz "git ne dedi"yi oradan okuyor.
 */

const CWD = "C:/depo";

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

const c = (status: string, path: string, origPath?: string): GitChange =>
  origPath ? { status, path, origPath } : { status, path };

/** Git'in bildireceği depo durumu; sayaçlar satırlardan türüyor. */
function repo(changes: GitChange[], patch: Partial<GitInfo> = {}): GitInfo {
  const staged = changes.filter((x) => x.status[0] !== " " && x.status !== "??").length;
  return {
    branch: "main",
    detached: false,
    ahead: 0,
    behind: 0,
    upstream: "origin/main",
    unborn: false,
    staged,
    stashCount: 0,
    changes,
    root: CWD,
    ...patch,
  };
}

function seed(info: GitInfo) {
  useStore.setState({
    ready: true,
    groups: [group()],
    activeGroupId: "g1",
    gitInfo: { [CWD]: info },
  });
}

/** Satırlar KAPALI geliyor; açık satır isteyen testler yolunu buradan açıyor. */
function satiriAc(...paths: string[]) {
  useStore.setState({ ui: { ...useStore.getState().ui, gitExpanded: paths } });
}

/** Sonraki her `refreshGit` bu durumu okuyacak. */
function gitSays(info: GitInfo) {
  vi.spyOn(api, "gitInfo").mockResolvedValue(info);
  vi.spyOn(api, "gitFingerprint").mockResolvedValue("imza");
}

const toast = vi.fn();

beforeEach(() => {
  setLanguage("tr");
  setPlatform("windows");
  toast.mockReset();
  useStore.setState({
    toast,
    ui: { ...useStore.getState().ui, gitDrafts: {}, gitExpanded: [] },
  });
  // Fark istekleri bu dosyanın konusu değil.
  vi.spyOn(api, "gitDiff").mockResolvedValue("");
  vi.spyOn(api, "readTextFile").mockResolvedValue(null);
  // Gönderilecek commit'ler bölümü de (commit'ten sonra `ahead` > 0); konusu
  // `outgoingSection.test.tsx`. Taklit edilmezse jsdom'da IPC düşüyor ve
  // bölümün kendi hata kutusu commit kutusunun hatası sanılıyor.
  vi.spyOn(api, "gitOutgoing").mockResolvedValue({ commits: [], total: 0 });
});

afterEach(async () => {
  acik.splice(0).forEach((coz) => coz());
  await act(async () => {});
  cleanup();
  vi.restoreAllMocks();
});

const box = (v: HTMLElement) => v.querySelector<HTMLElement>(".git-commit");
const area = (v: HTMLElement) => v.querySelector<HTMLTextAreaElement>(".git-commit-msg")!;
const commitBtn = (v: HTMLElement) => v.querySelector<HTMLButtonElement>(".git-commit-btn")!;
const pushBtn = (v: HTMLElement) => v.querySelector<HTMLButtonElement>(".git-push")!;
/**
 * Push iki adım: düğme onay panelini açıyor, gönderen paneldeki düğme (bkz.
 * `PushReview`; panelin kendi davranışı `pushReview.test.tsx`te).
 */
const pushla = (v: HTMLElement) => {
  fireEvent.click(pushBtn(v));
  fireEvent.click(v.querySelector<HTMLButtonElement>(".push-review-go")!);
};
/** Toplu kutu: dosya listesinin tablo başlığında (bkz. `ChangesHeader`). */
const master = (v: HTMLElement) => v.querySelector<HTMLInputElement>(".git-table-head input")!;
const tableHead = (v: HTMLElement) => v.querySelector<HTMLElement>(".git-table-head");
/** Satırların kutuları; başlıktaki toplu kutu da `.git-check` taşıyor ama satır değil. */
const checks = (v: HTMLElement) => [...v.querySelectorAll<HTMLInputElement>(".git-head .git-check")];
const errorBox = (v: HTMLElement) => v.querySelector<HTMLElement>(".git-commit-error");
const yaz = (v: HTMLElement, value: string) =>
  fireEvent.change(area(v), { target: { value } });
const flush = () => act(async () => {});

/**
 * Elle çözülen söz; testin sonunda ÇÖZÜLMEMİŞSE çözülüyor.
 *
 * Git yazma işlemleri MODÜL düzeyindeki tek bir kuyruktan geçiyor (bkz.
 * `gitWrite`). Bir testin çözülmemiş bıraktığı söz kuyruğu kilitliyor ve
 * SONRAKİ her testin yazma işlemi sonsuza dek bekliyor: hata, kırılan testte
 * değil ilgisiz bir testte görünüyordu (mutasyon denetiminde ölçüldü).
 */
const acik: Array<() => void> = [];
function bekleyen<T = void>() {
  let coz!: (value: T) => void;
  const soz = new Promise<T>((resolve) => {
    coz = resolve;
  });
  acik.push(() => coz(undefined as T));
  return { soz, coz };
}

// ------------------------------------------------------------ kutu görünürlüğü

describe("commit kutusu ne zaman görünüyor", () => {
  it("değişiklik varken ileti alanı, Commit ve Push var", () => {
    seed(repo([c(" M", "a.ts")]));
    const { container } = render(<GitChanges />);
    expect(area(container), "ileti alanı yok").not.toBe(null);
    expect(commitBtn(container).textContent).toContain("Commit");
    expect(pushBtn(container).textContent).toContain("Push");
  });

  it("değişiklik yok ve gönderilecek bir şey yoksa HİÇBİR ŞEY çizilmiyor", () => {
    // Boş bir kutu gürültü; "Değişiklik yok" mesajı yeterli.
    seed(repo([], { ahead: 0, upstream: "origin/main" }));
    const { container } = render(<GitChanges />);
    expect(box(container)).toBe(null);
    expect(container.querySelector(".pop-empty")!.textContent).toBe("Değişiklik yok");
  });

  it("değişiklik yok ama gönderilmemiş commit var: yalnızca gönder satırı", () => {
    // Kullanıcı tam da "commit'leri push edeyim" diye buraya bakıyor; liste
    // boşaldı diye o commit'ler görünmez olmamalı.
    seed(repo([], { ahead: 2 }));
    const { container } = render(<GitChanges />);
    expect(box(container)!.className).toContain("compact");
    expect(box(container)!.textContent).toContain("2 commit gönderilmedi");
    expect(area(container), "değişiklik yokken ileti alanı çizilmiş").toBe(null);
    expect(pushBtn(container).disabled).toBe(false);
    expect(pushBtn(container).querySelector(".pill-count")!.textContent).toBe("2");
  });

  it("yukarı akışı olmayan dalda Yayınla diyor", () => {
    seed(repo([], { upstream: null }));
    const { container } = render(<GitChanges />);
    expect(box(container)!.textContent).toContain("Bu dal uzakta yok");
    expect(pushBtn(container).textContent).toContain("Yayınla");
    expect(pushBtn(container).disabled).toBe(false);
  });

  it("hiç commit yoksa gönder satırı da yok", () => {
    // "Yayınla" demek boş bir depoda yalnızca hata üretirdi.
    seed(repo([], { upstream: null, unborn: true }));
    const { container } = render(<GitChanges />);
    expect(box(container)).toBe(null);
  });

  it("hiç commit yokken ilk commit ATILABİLİYOR, gönder kapalı", () => {
    seed(repo([c("A ", "a.ts")], { upstream: null, unborn: true }));
    const { container } = render(<GitChanges />);
    yaz(container, "ilk");
    expect(commitBtn(container).disabled).toBe(false);
    expect(pushBtn(container).disabled).toBe(true);
  });

  it("ayrık HEAD'de gönder kapalı, ipucu nedenini söylüyor", () => {
    seed(repo([c(" M", "a.ts")], { detached: true, upstream: null }));
    const { container } = render(<GitChanges />);
    expect(pushBtn(container).disabled).toBe(true);
    expect(pushBtn(container).title).toContain("HEAD bir dala bağlı değil");
  });

  it("depo değilse kutu yok", () => {
    useStore.setState({ ready: true, groups: [group()], activeGroupId: "g1", gitInfo: {} });
    const { container } = render(<GitChanges />);
    expect(box(container)).toBe(null);
  });
});

// ------------------------------------------------------------- satır kutusu

describe("satırdaki kutu", () => {
  it("durumuna göre işaretli, işaretsiz ya da ara hâlde", () => {
    seed(repo([c("M ", "tam.ts"), c(" M", "hic.ts"), c("MM", "kismen.ts")]));
    const [tam, hic, kismen] = checks(render(<GitChanges />).container);

    expect([tam.checked, tam.indeterminate]).toEqual([true, false]);
    expect([hic.checked, hic.indeterminate]).toEqual([false, false]);
    // Kısmen: işaretli DEĞİL ama ara hâl. Kullanıcı "tamamı gidiyor" sanmasın.
    expect([kismen.checked, kismen.indeterminate]).toEqual([false, true]);
  });

  it("işaretsiz dosyaya basmak onu commit'e ekliyor", async () => {
    seed(repo([c(" M", "a.ts")]));
    gitSays(repo([c("M ", "a.ts")]));
    const stage = vi.spyOn(api, "gitStage").mockResolvedValue(undefined);
    const { container } = render(<GitChanges />);

    fireEvent.click(checks(container)[0]);
    await flush();

    expect(stage).toHaveBeenCalledWith(CWD, ["a.ts"]);
    expect(checks(container)[0].checked).toBe(true);
  });

  it("tam eklenmiş dosyaya basmak onu commit'ten çıkarıyor", async () => {
    seed(repo([c("M ", "a.ts")]));
    gitSays(repo([c(" M", "a.ts")]));
    const unstage = vi.spyOn(api, "gitUnstage").mockResolvedValue(undefined);
    const { container } = render(<GitChanges />);

    fireEvent.click(checks(container)[0]);
    await flush();

    expect(unstage).toHaveBeenCalledWith(CWD, ["a.ts"]);
    expect(checks(container)[0].checked).toBe(false);
  });

  it("KISMEN eklenmiş dosyaya basmak geri kalanı da EKLİYOR", async () => {
    // Ara hâlde basış "hepsini al" demek; çıkarmak kullanıcının bastığının tersi.
    seed(repo([c("MM", "a.ts")]));
    gitSays(repo([c("M ", "a.ts")]));
    const stage = vi.spyOn(api, "gitStage").mockResolvedValue(undefined);
    const unstage = vi.spyOn(api, "gitUnstage").mockResolvedValue(undefined);
    const { container } = render(<GitChanges />);

    fireEvent.click(checks(container)[0]);
    await flush();

    expect(stage).toHaveBeenCalledWith(CWD, ["a.ts"]);
    expect(unstage).not.toHaveBeenCalled();
  });

  it("yeniden adlandırmayı çıkarırken ESKİ ad da gidiyor", async () => {
    // Yalnızca yeni ad gitseydi eski adın "silindi" kaydı indekste kalırdı.
    seed(repo([c("R ", "yeni.ts", "eski.ts")]));
    gitSays(repo([c(" D", "eski.ts"), c("??", "yeni.ts")]));
    const unstage = vi.spyOn(api, "gitUnstage").mockResolvedValue(undefined);
    const { container } = render(<GitChanges />);

    fireEvent.click(checks(container)[0]);
    await flush();

    expect(unstage).toHaveBeenCalledWith(CWD, ["eski.ts", "yeni.ts"]);
  });

  it("kutuya basmak satırı KATLAMIYOR", async () => {
    // Kutu katlama düğmesinin DIŞINDA: satırın kendisi bir düğme ve iç içe
    // etkileşimli öge tıklamaları karıştırıyordu.
    seed(repo([c(" M", "a.ts")]));
    satiriAc("a.ts");
    gitSays(repo([c("M ", "a.ts")]));
    vi.spyOn(api, "gitStage").mockResolvedValue(undefined);
    const { container } = render(<GitChanges />);
    expect(container.querySelector(".git-item")!.className).toContain("open");

    fireEvent.click(checks(container)[0]);
    await flush();

    expect(container.querySelector(".git-item")!.className).toContain("open");
    expect(container.querySelector(".git-row .git-check"), "kutu satır düğmesinin içinde").toBe(null);
  });

  it("işlem sürerken kutu HEDEF durumu gösteriyor", async () => {
    // `git add` + tazeleme yüzlerce ms sürebiliyor; kutu eski durumda kalırsa
    // basış işlemedi sanılıp ikinci kez basılıyor ve o ilkini geri alıyor.
    seed(repo([c(" M", "a.ts")]));
    gitSays(repo([c("M ", "a.ts")]));
    const is = bekleyen();
    vi.spyOn(api, "gitStage").mockImplementation(() => is.soz);
    const { container } = render(<GitChanges />);

    fireEvent.click(checks(container)[0]);
    await flush();
    expect(checks(container)[0].checked, "işlem sürerken eski durumda kaldı").toBe(true);

    is.coz();
    await flush();
    expect(checks(container)[0].checked).toBe(true);
  });

  it("işlem sürerken ikinci basış yok sayılıyor", async () => {
    seed(repo([c(" M", "a.ts")]));
    gitSays(repo([c("M ", "a.ts")]));
    const is = bekleyen();
    const stage = vi.spyOn(api, "gitStage").mockImplementation(() => is.soz);
    const unstage = vi.spyOn(api, "gitUnstage").mockResolvedValue(undefined);
    const { container } = render(<GitChanges />);

    fireEvent.click(checks(container)[0]);
    await flush();
    fireEvent.click(checks(container)[0]);
    await flush();

    /*
     * İlk işlem SÜRERKEN saymak yetmez: koruma kalksa bile ikinci işlem
     * kuyrukta ilkinin ARDINDA bekler (`gitWrite`) ve sayı 1 görünürdü. Farkı
     * görmek için ilkini bitirip kuyruğun boşalmasını bekliyoruz. (Mutasyonla
     * ölçüldü: bu bekleme olmadan koruma kaldırılınca test geçiyordu.)
     */
    is.coz();
    await flush();
    expect(stage, "ikinci basış fazladan bir işlem kuyruğa soktu").toHaveBeenCalledTimes(1);
    expect(unstage).not.toHaveBeenCalled();
  });

  it("hata olursa bildirim veriyor ve kutu eski hâline dönüyor", async () => {
    seed(repo([c(" M", "a.ts")]));
    gitSays(repo([c(" M", "a.ts")]));
    vi.spyOn(api, "gitStage").mockRejectedValue("Unable to create '.git/index.lock'");
    const { container } = render(<GitChanges />);

    fireEvent.click(checks(container)[0]);
    await flush();

    expect(toast).toHaveBeenCalledWith("Unable to create '.git/index.lock'", "err");
    expect(checks(container)[0].checked, "hata sonrası kutu işaretli kaldı").toBe(false);
  });

  it("basınca satır SÖKÜLMÜYOR: aynı öğe, odak yerinde", async () => {
    /*
     * Satır anahtarı eskiden `durum + yol` idi. Kutuya basmak durumu
     * değiştiriyor (` M` → `M `), yani satır sökülüp yeniden kuruluyordu: açılmış
     * bağlam kayboluyor, fark yeniden isteniyor ve klavyeyle Boşluk'a basanın
     * odağı yok oluyordu.
     */
    seed(repo([c(" M", "a.ts")]));
    gitSays(repo([c("M ", "a.ts")]));
    vi.spyOn(api, "gitStage").mockResolvedValue(undefined);
    const { container } = render(<GitChanges />);
    const item = container.querySelector(".git-item");
    const kutu = checks(container)[0];
    kutu.focus();
    expect(document.activeElement).toBe(kutu);

    fireEvent.click(kutu);
    await flush();

    expect(container.querySelector(".git-item"), "satır yeniden kuruldu").toBe(item);
    expect(checks(container)[0], "kutu yeniden kuruldu").toBe(kutu);
    expect(document.activeElement, "odak kayboldu").toBe(kutu);
  });

  it("kutuya basmak farkı YENİDEN İSTEMİYOR", async () => {
    // Fark HEAD'e karşı alınıyor: sahnelemek içeriği değiştirmiyor. Ham duruma
    // bağlı olsaydı her basışta bir `git diff` daha koşardı.
    seed(repo([c(" M", "a.ts")]));
    satiriAc("a.ts");
    gitSays(repo([c("M ", "a.ts")]));
    const diff = vi.spyOn(api, "gitDiff").mockResolvedValue("");
    vi.spyOn(api, "gitStage").mockResolvedValue(undefined);
    const { container } = render(<GitChanges />);
    await flush();
    const once = diff.mock.calls.length;
    expect(once).toBe(1);

    fireEvent.click(checks(container)[0]);
    await flush();

    expect(diff.mock.calls.length, "kutuya basmak fark isteğini tekrarladı").toBe(once);
  });
});

// ---------------------------------------------------------------- toplu kutu

describe("toplu kutu", () => {
  /*
   * İSTEK: "0 dosya seçildi checkbox'ını dosyaların üstüne alalım. Dosyaların
   * üstüne bir header ekleyelim. Table gibi olsun."
   */
  it("commit kutusunda değil, dosyaların üstündeki tablo başlığında", () => {
    seed(repo([c("M ", "a"), c(" M", "b")]));
    const { container } = render(<GitChanges />);
    const head = tableHead(container)!;
    expect(box(container)!.contains(master(container)), "kutu hâlâ commit kutusunda").toBe(false);
    expect(head.closest(".git-list"), "başlık listenin içinde değil").not.toBe(null);
    const ilkSatir = container.querySelector(".git-item")!;
    expect(
      head.compareDocumentPosition(ilkSatir) & Node.DOCUMENT_POSITION_FOLLOWING,
      "başlık dosya satırlarının üstünde değil",
    ).toBeTruthy();
    // Satır kutularıyla aynı sütun: aynı sınıf, dolayısıyla aynı sol boşluk.
    expect(master(container).classList.contains("git-check")).toBe(true);
    expect(head.querySelector(".git-table-col")!.textContent).toBe("Dosya");
  });

  it("değişiklik yokken başlık yok", () => {
    seed(repo([], { ahead: 1 }));
    const { container } = render(<GitChanges />);
    expect(tableHead(container)).toBe(null);
  });

  it("kaç dosyanın commit'e gireceğini ve listede toplam kaç dosya olduğunu yazıyor", () => {
    seed(repo([c("M ", "a"), c(" M", "b"), c("A ", "c")]));
    const { container } = render(<GitChanges />);
    expect(container.querySelector(".git-table-count")!.textContent).toBe("2/3 dosya seçili");
  });

  it("toplam Rust'ın kesilmemiş sayısı (liste 200'de kesiliyor)", () => {
    seed({ ...repo([c("M ", "a"), c(" M", "b")]), changeCount: 250 });
    const { container } = render(<GitChanges />);
    expect(container.querySelector(".git-table-count")!.textContent).toBe("1/250 dosya seçili");
  });

  it("tekil sayıda çoğul eki yok", () => {
    seed(repo([c("M ", "a")], { staged: 1 }));
    const { container } = render(<GitChanges />);
    expect(container.querySelector(".git-table-count")!.textContent).toBe("1/1 dosya seçili");
  });

  /*
   * BİLDİRİLEN: "Değişikliklerin hepsini seç yapınca ufak bir takılma oluyor."
   * ÖLÇÜLDÜ (gerçek uygulama, 30 dosya): kutular basıştan 79-172 ms sonra
   * değişiyordu. Toplu kutu da satırın kutusu gibi HEMEN hedef durumu
   * gösteriyor; gerçek durum işlem bitince.
   */
  const sayac = (v: HTMLElement) => v.querySelector(".git-table-count")!.textContent;

  it("basar basmaz bütün kutular ve sayaç hedef durumu gösteriyor — git add bitmeden", async () => {
    seed(repo([c(" M", "a.ts"), c("??", "b.ts"), c("M ", "c.ts")]));
    gitSays(repo([c("M ", "a.ts"), c("A ", "b.ts"), c("M ", "c.ts")]));
    const is = bekleyen();
    vi.spyOn(api, "gitStage").mockImplementation(() => is.soz);
    const { container } = render(<GitChanges />);
    expect(master(container).indeterminate).toBe(true);
    expect(sayac(container)).toBe("1/3 dosya seçili");

    fireEvent.click(master(container));
    await flush();
    expect(master(container).checked, "toplu kutu beklemede").toBe(true);
    expect(master(container).indeterminate).toBe(false);
    expect(checks(container).map((x) => x.checked), "satırlar beklemede").toEqual([true, true, true]);
    expect(sayac(container)).toBe("3/3 dosya seçili");

    is.coz();
    await flush();
    expect(checks(container).map((x) => x.checked)).toEqual([true, true, true]);
    expect(sayac(container)).toBe("3/3 dosya seçili");
  });

  it("seçimi kaldırırken de hemen hepsi boş", async () => {
    seed(repo([c("M ", "a.ts"), c("A ", "b.ts")]));
    gitSays(repo([c(" M", "a.ts"), c("??", "b.ts")]));
    const is = bekleyen();
    vi.spyOn(api, "gitUnstage").mockImplementation(() => is.soz);
    const { container } = render(<GitChanges />);

    fireEvent.click(master(container));
    await flush();
    expect(master(container).checked).toBe(false);
    expect(checks(container).map((x) => x.checked)).toEqual([false, false]);
    expect(sayac(container)).toBe("0/2 dosya seçili");
    is.coz();
  });

  it("toplu işlem sürerken satır kutusu ve ikinci toplu basış bir şey yapmıyor", async () => {
    seed(repo([c(" M", "a.ts"), c(" M", "b.ts")]));
    gitSays(repo([c("M ", "a.ts"), c("M ", "b.ts")]));
    const is = bekleyen();
    const stage = vi.spyOn(api, "gitStage").mockImplementation(() => is.soz);
    const unstage = vi.spyOn(api, "gitUnstage").mockResolvedValue(undefined);
    const { container } = render(<GitChanges />);

    fireEvent.click(master(container));
    await flush();
    fireEvent.click(checks(container)[0]);
    fireEvent.click(master(container));
    await flush();

    // Kuyruk boşalana kadar bekle: koruma yoksa ikinci işlem ilkinin ardında
    // bekliyor olurdu ve sürerken saymak onu göremezdi.
    is.coz();
    await flush();
    expect(stage).toHaveBeenCalledTimes(1);
    expect(unstage).not.toHaveBeenCalled();
  });

  it("hata olursa kutular gerçek duruma dönüyor ve hata gösteriliyor", async () => {
    seed(repo([c(" M", "a.ts"), c(" M", "b.ts")]));
    gitSays(repo([c(" M", "a.ts"), c(" M", "b.ts")]));
    let reddet!: (err: unknown) => void;
    vi.spyOn(api, "gitStage").mockImplementation(
      () =>
        new Promise((_, reject) => {
          reddet = reject;
        }),
    );
    const { container } = render(<GitChanges />);

    fireEvent.click(master(container));
    await flush();
    expect(checks(container).map((x) => x.checked)).toEqual([true, true]);

    await act(async () => reddet("kilit"));
    await flush();
    expect(master(container).checked).toBe(false);
    expect(checks(container).map((x) => x.checked)).toEqual([false, false]);
    expect(sayac(container)).toBe("0/2 dosya seçili");
    expect(errorBox(container)!.textContent).toContain("kilit");
  });

  it("hepsi seçili değilken basmak seçilmemiş OLANLARI ekliyor", async () => {
    seed(repo([c("M ", "a.ts"), c(" M", "b.ts"), c("??", "c.ts"), c("MM", "d.ts")]));
    gitSays(repo([c("M ", "a.ts")]));
    const stage = vi.spyOn(api, "gitStage").mockResolvedValue(undefined);
    const { container } = render(<GitChanges />);

    fireEvent.click(master(container));
    await flush();

    // Zaten tam eklenmiş olan `a.ts` gönderilmiyor.
    expect(stage).toHaveBeenCalledWith(CWD, ["b.ts", "c.ts", "d.ts"]);
  });

  it("hepsi seçiliyken basmak hepsini çıkarıyor", async () => {
    seed(repo([c("M ", "a.ts"), c("R ", "y.ts", "e.ts")]));
    gitSays(repo([c(" M", "a.ts")]));
    const unstage = vi.spyOn(api, "gitUnstage").mockResolvedValue(undefined);
    const { container } = render(<GitChanges />);
    expect(master(container).checked).toBe(true);

    fireEvent.click(master(container));
    await flush();

    // Yeniden adlandırmanın eski adı da gidiyor.
    expect(unstage).toHaveBeenCalledWith(CWD, ["a.ts", "e.ts", "y.ts"]);
  });

  it("karışıkken ara hâlde", () => {
    seed(repo([c("M ", "a.ts"), c(" M", "b.ts")]));
    const { container } = render(<GitChanges />);
    expect(master(container).checked).toBe(false);
    expect(master(container).indeterminate).toBe(true);
  });

  it("hata olursa satır içi, kalıcı kutuda gösteriliyor", async () => {
    seed(repo([c(" M", "a.ts")]));
    gitSays(repo([c(" M", "a.ts")]));
    vi.spyOn(api, "gitStage").mockRejectedValue("kilit");
    const { container } = render(<GitChanges />);

    fireEvent.click(master(container));
    await flush();

    expect(errorBox(container)!.textContent).toContain("Dosya seçimi değiştirilemedi");
    expect(errorBox(container)!.textContent).toContain("kilit");
  });

  it("sonraki basış eski hatayı siliyor", async () => {
    // Gerçek örnek: git izlenen bir dosyayı eklerken bile "yok sayılan yol" uyarısıyla 1 döndü;
    // kullanıcı kutuya bir daha basıp seçimi geri aldı ama hata kutusu ekranda kaldı.
    seed(repo([c(" M", "a.ts")]));
    gitSays(repo([c(" M", "a.ts")]));
    vi.spyOn(api, "gitStage").mockRejectedValueOnce("kilit").mockResolvedValue(undefined);
    const { container } = render(<GitChanges />);

    fireEvent.click(master(container));
    await flush();
    expect(errorBox(container), "ilk basışta hata görünmeli").not.toBe(null);

    fireEvent.click(master(container));
    await flush();
    expect(errorBox(container), "başarılı basıştan sonra eski hata kaldı").toBe(null);
  });
});

// -------------------------------------------------------------------- commit

// --------------------------------------------------------------- dal adı

/*
 * İSTEK: "Stash commit push butonlarının en soluna (0 dosya seçildi yerine)
 * hangi branchteysek o görünsün."
 */
describe("dal adı", () => {
  const branch = (v: HTMLElement) => v.querySelector<HTMLElement>(".git-commit .git-commit-branch");

  it("düğmelerin solunda, toplu kutunun eski yerinde", () => {
    seed(repo([c(" M", "a.ts")], { branch: "feature/gecmis" }));
    const { container } = render(<GitChanges />);
    const b = branch(container)!;
    expect(b.textContent).toBe("feature/gecmis");
    const row = b.closest(".git-commit-row")!;
    expect(row.firstElementChild, "satırın en solunda değil").toBe(b);
    expect(
      b.compareDocumentPosition(row.querySelector(".git-commit-buttons")!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("ipucu Push'un hedefini söylüyor; yukarı akış yoksa yalnızca dal", () => {
    seed(repo([c(" M", "a.ts")]));
    const { container, unmount } = render(<GitChanges />);
    expect(branch(container)!.title).toBe("main → origin/main");
    unmount();

    seed(repo([c(" M", "a.ts")], { branch: "yeni", upstream: null }));
    const v = render(<GitChanges />);
    expect(branch(v.container)!.title).toBe("yeni");
  });

  it("değişiklik yokken küçük kutuda da var", () => {
    // Commit'ten sonra: yalnızca "N commit gönderilmedi" + Push.
    seed(repo([], { ahead: 2 }));
    const { container } = render(<GitChanges />);
    expect(box(container)!.classList.contains("compact")).toBe(true);
    expect(branch(container)!.textContent).toBe("main");
  });
});

describe("commit", () => {
  it("dosya seçilmemişse kapalı ve ipucu ilk eksiği söylüyor", () => {
    seed(repo([c(" M", "a.ts")]));
    const { container } = render(<GitChanges />);
    yaz(container, "iletiyi yazdım");
    expect(commitBtn(container).disabled).toBe(true);
    expect(commitBtn(container).title).toBe("Önce commit'e girecek dosyaları seç");
  });

  it("dosya var ama ileti yoksa kapalı", () => {
    seed(repo([c("M ", "a.ts")]));
    const { container } = render(<GitChanges />);
    expect(commitBtn(container).disabled).toBe(true);
    expect(commitBtn(container).title).toBe("Commit iletisi yaz");
    yaz(container, "   ");
    expect(commitBtn(container).disabled, "yalnızca boşluk ileti sayıldı").toBe(true);
  });

  it("ikisi de varsa açık, ipucu kısayolu söylüyor", () => {
    seed(repo([c("M ", "a.ts")]));
    const { container } = render(<GitChanges />);
    yaz(container, "düzeltme");
    expect(commitBtn(container).disabled).toBe(false);
    expect(commitBtn(container).title).toBe("Seçili dosyaları commit'le (Ctrl+Enter)");
    // Düğmede kaç dosyanın gireceği de yazıyor.
    expect(commitBtn(container).querySelector(".pill-count")!.textContent).toBe("1");
  });

  it("commit iletiyi ve deponun yolunu gönderiyor, başarıda taslağı siliyor", async () => {
    seed(repo([c("M ", "a.ts")]));
    gitSays(repo([], { ahead: 1 }));
    const commit = vi.spyOn(api, "gitCommit").mockResolvedValue("abc1234");
    const { container } = render(<GitChanges />);
    yaz(container, "düzeltme\n\ngövde");

    fireEvent.click(commitBtn(container));
    await flush();

    expect(commit).toHaveBeenCalledWith(CWD, "düzeltme\n\ngövde");
    expect(toast).toHaveBeenCalledWith("Commit atıldı: abc1234", "ok");
    // Liste boşaldı, gönderilecek bir commit çıktı: kutu gönder satırına döndü.
    expect(box(container)!.className).toContain("compact");
    expect(useStore.getState().ui.gitDrafts[CWD], "taslak silinmedi").toBeUndefined();
  });

  it("Ctrl+Enter de commit atıyor", async () => {
    seed(repo([c("M ", "a.ts")]));
    gitSays(repo([], { ahead: 1 }));
    const commit = vi.spyOn(api, "gitCommit").mockResolvedValue("abc1234");
    const { container } = render(<GitChanges />);
    yaz(container, "klavyeden");

    fireEvent.keyDown(area(container), { key: "Enter", ctrlKey: true });
    await flush();

    expect(commit).toHaveBeenCalledWith(CWD, "klavyeden");
  });

  it("Cmd+Enter de commit atıyor (macOS)", async () => {
    seed(repo([c("M ", "a.ts")]));
    gitSays(repo([], { ahead: 1 }));
    const commit = vi.spyOn(api, "gitCommit").mockResolvedValue("abc1234");
    const { container } = render(<GitChanges />);
    yaz(container, "cmd ile");

    fireEvent.keyDown(area(container), { key: "Enter", metaKey: true });
    await flush();

    expect(commit).toHaveBeenCalledWith(CWD, "cmd ile");
  });

  it("düz Enter commit ATMIYOR", async () => {
    // Çok satırlı ileti yazan kişi Enter'a yeni satır için basıyor.
    //
    // `await flush()` ŞART: commit mikro-görev kuyruğunda `api.gitCommit`e gidiyor
    // (bkz. `gitWrite`), yani eşzamanlı bir `expect` çağrıdan ÖNCE çalışıp
    // koruma kalksa bile geçerdi. Mutasyonla ölçüldü.
    seed(repo([c("M ", "a.ts")]));
    gitSays(repo([c("M ", "a.ts")]));
    const commit = vi.spyOn(api, "gitCommit").mockResolvedValue("abc1234");
    const { container } = render(<GitChanges />);
    yaz(container, "satır");

    fireEvent.keyDown(area(container), { key: "Enter" });
    await flush();

    expect(commit).not.toHaveBeenCalled();
  });

  it("Ctrl+Enter koşullar sağlanmıyorsa commit ATMIYOR", async () => {
    // Kısayol düğmenin kapalı olma kurallarını atlamamalı. Bekleme şart: yukarıdaki
    // teste bakın.
    seed(repo([c(" M", "a.ts")]));
    gitSays(repo([c(" M", "a.ts")]));
    const commit = vi.spyOn(api, "gitCommit").mockResolvedValue("abc1234");
    const { container } = render(<GitChanges />);
    yaz(container, "dosya seçilmemiş");

    fireEvent.keyDown(area(container), { key: "Enter", ctrlKey: true });
    await flush();

    expect(commit).not.toHaveBeenCalled();
  });

  it("Ctrl+Enter iletisiz commit ATMIYOR", async () => {
    seed(repo([c("M ", "a.ts")]));
    gitSays(repo([c("M ", "a.ts")]));
    const commit = vi.spyOn(api, "gitCommit").mockResolvedValue("abc1234");
    const { container } = render(<GitChanges />);

    fireEvent.keyDown(area(container), { key: "Enter", ctrlKey: true });
    await flush();

    expect(commit).not.toHaveBeenCalled();
  });

  it("başarısız commit: git'in metni KALICI kutuda, ileti KORUNUYOR", async () => {
    /*
     * Bir commit kancası (lint, test) reddedince kullanıcının bilmesi gereken
     * kancanın yazdığı cümle ve o üç saniyede okunmaz: bildirim değil kalıcı
     * kutu. İleti silinmemeli — yeniden yazmak zorunda kalmak, hata kadar
     * sinir bozucu.
     */
    seed(repo([c("M ", "a.ts")]));
    gitSays(repo([c("M ", "a.ts")]));
    const metin = "husky - pre-commit hook exited with code 1\nlint: 3 hata";
    vi.spyOn(api, "gitCommit").mockRejectedValue(metin);
    const { container } = render(<GitChanges />);
    yaz(container, "kancalı");

    fireEvent.click(commitBtn(container));
    await flush();

    expect(errorBox(container)!.textContent).toContain("Commit atılamadı");
    // Satır sonları anlam taşıyor: metin olduğu gibi, `pre` içinde.
    expect(errorBox(container)!.querySelector("pre")!.textContent).toBe(metin);
    expect(area(container).value, "ileti silindi").toBe("kancalı");
    expect(toast).not.toHaveBeenCalled();
    expect(commitBtn(container).disabled, "hata sonrası düğme kapalı kaldı").toBe(false);
  });

  it("hata kutusu kapatılabiliyor", async () => {
    seed(repo([c("M ", "a.ts")]));
    gitSays(repo([c("M ", "a.ts")]));
    vi.spyOn(api, "gitCommit").mockRejectedValue("hata");
    const { container } = render(<GitChanges />);
    yaz(container, "x");
    fireEvent.click(commitBtn(container));
    await flush();
    expect(errorBox(container)).not.toBe(null);

    fireEvent.click(errorBox(container)!.querySelector("button")!);

    expect(errorBox(container)).toBe(null);
  });

  it("yeni bir deneme eski hatayı temizliyor", async () => {
    seed(repo([c("M ", "a.ts")]));
    gitSays(repo([c("M ", "a.ts")]));
    const commit = vi.spyOn(api, "gitCommit").mockRejectedValueOnce("ilk hata");
    const { container } = render(<GitChanges />);
    yaz(container, "x");
    fireEvent.click(commitBtn(container));
    await flush();
    expect(errorBox(container)).not.toBe(null);

    commit.mockResolvedValueOnce("abc1234");
    gitSays(repo([], { ahead: 1 }));
    fireEvent.click(commitBtn(container));
    await flush();

    expect(errorBox(container), "başarılı denemeden sonra eski hata kaldı").toBe(null);
  });

  it("commit sürerken iletiler kilitli, düğmeler kapalı", async () => {
    // Bitince taslak silinecek: bu arada yazılan metin de onunla giderdi.
    seed(repo([c("M ", "a.ts")]));
    gitSays(repo([c("M ", "a.ts")]));
    const is = bekleyen<string>();
    vi.spyOn(api, "gitCommit").mockImplementation(() => is.soz);
    const { container } = render(<GitChanges />);
    yaz(container, "uzun süren");

    fireEvent.click(commitBtn(container));
    await flush();

    expect(area(container).readOnly).toBe(true);
    expect(commitBtn(container).disabled).toBe(true);
    // İSTEK: yazı yerine çark — düğmenin yazısı ve genişliği aynı kalıyor,
    // ne yaptığı ipucunda ve `aria-busy`de.
    expect(commitBtn(container).querySelector(".spinner"), "çark yok").not.toBe(null);
    expect(commitBtn(container).textContent).toBe("Commit");
    expect(commitBtn(container).title).toBe("Commit atılıyor…");
    expect(commitBtn(container).getAttribute("aria-busy")).toBe("true");
    expect(pushBtn(container).disabled, "commit sürerken push açık").toBe(true);

    gitSays(repo([], { ahead: 1 }));
    is.coz("abc1234");
    await flush();
  });

  it("commit sürerken ikinci tetikleme yok sayılıyor", async () => {
    seed(repo([c("M ", "a.ts")]));
    gitSays(repo([c("M ", "a.ts")]));
    const is = bekleyen<string>();
    const commit = vi.spyOn(api, "gitCommit").mockImplementation(() => is.soz);
    const { container } = render(<GitChanges />);
    yaz(container, "x");

    fireEvent.keyDown(area(container), { key: "Enter", ctrlKey: true });
    await flush();
    fireEvent.keyDown(area(container), { key: "Enter", ctrlKey: true });
    await flush();

    // İlkini bitirip kuyruğun boşalmasını bekliyoruz: koruma kalksa bile ikinci
    // commit ilkinin ARDINDA bekler ve sürerken sayı 1 görünürdü.
    gitSays(repo([], { ahead: 1 }));
    is.coz("abc1234");
    await flush();
    expect(commit, "ikinci tetikleme ikinci bir commit kuyruğa soktu").toHaveBeenCalledTimes(1);
  });
});

// -------------------------------------------------------------------- taslak

describe("yarım kalmış ileti", () => {
  it("uygulama açılışında taslak yok", () => {
    // Diğer testler durumu kendileri kuruyor (`beforeEach`), yani gerçek
    // başlangıç değerini yalnızca burada sınıyoruz. Mutasyonla ölçüldü: başlangıç
    // değeri dolu yapıldığında bu test olmadan hiçbiri düşmüyordu.
    expect(useStore.getInitialState().ui.gitDrafts).toEqual({});
  });

  it("panel sökülüp kurulunca KORUNUYOR", () => {
    // Geçmiş sekmesine bakıp dönmek panelin bileşenini sökerdi; yerel durum
    // olsaydı yarım ileti kaybolurdu.
    seed(repo([c("M ", "a.ts")]));
    const ilk = render(<GitChanges />);
    yaz(ilk.container, "yarım kalan ileti");
    ilk.unmount();

    const ikinci = render(<GitChanges />);
    expect(area(ikinci.container).value).toBe("yarım kalan ileti");
  });

  it("depoya özgü: başka bir depoda görünmüyor", () => {
    seed(repo([c("M ", "a.ts")], { root: "C:/depo-a" }));
    const a = render(<GitChanges />);
    yaz(a.container, "a deposunun iletisi");
    a.unmount();

    seed(repo([c("M ", "a.ts")], { root: "C:/depo-b" }));
    const b = render(<GitChanges />);
    expect(area(b.container).value, "iletiler depolar arasında karıştı").toBe("");
  });

  it("aynı depoya bakan başka bir dizin aynı iletiyi görüyor", () => {
    // Anahtar deponun KÖKÜ, kabuğun bulunduğu alt klasör değil.
    seed(repo([c("M ", "a.ts")], { root: "C:/depo" }));
    const ilk = render(<GitChanges />);
    yaz(ilk.container, "ortak");
    ilk.unmount();
    useStore.setState({
      gitInfo: { [CWD]: repo([c("M ", "a.ts")], { root: "C:/depo" }) },
    });

    expect(area(render(<GitChanges />).container).value).toBe("ortak");
  });
});

// --------------------------------------------------------------------- push

describe("push", () => {
  it("hedefi bildirerek gönderiyor", async () => {
    seed(repo([], { ahead: 2 }));
    gitSays(repo([], { ahead: 0 }));
    const push = vi.spyOn(api, "gitPush").mockResolvedValue("origin/main");
    const { container } = render(<GitChanges />);

    pushla(container);
    await flush();

    expect(push).toHaveBeenCalledWith(CWD);
    expect(toast).toHaveBeenCalledWith("Gönderildi: origin/main", "ok");
    // Gönderildi, her şey eşit: kutu çekiliyor.
    expect(box(container), "gönderildikten sonra kutu kaldı").toBe(null);
  });

  it("ipucu kaç commit'in nereye gideceğini söylüyor", () => {
    seed(repo([], { ahead: 3, upstream: "origin/ozellik" }));
    const { container } = render(<GitChanges />);
    expect(pushBtn(container).title).toBe("3 commit gönderilecek → origin/ozellik");
    // Boştayken çark yok: dönen bir simge "bir şey sürüyor" der.
    expect(pushBtn(container).querySelector(".spinner")).toBe(null);
    expect(pushBtn(container).getAttribute("aria-busy")).toBe("false");
  });

  it("Yayınla: yukarı akış yokken gönderiyor", async () => {
    seed(repo([], { upstream: null }));
    gitSays(repo([], { upstream: "origin/main" }));
    const push = vi.spyOn(api, "gitPush").mockResolvedValue("origin/main");
    const { container } = render(<GitChanges />);
    expect(pushBtn(container).title).toContain("yayınlanacak");

    pushla(container);
    await flush();

    expect(push).toHaveBeenCalledWith(CWD);
  });

  it("uzak ilerideyse push'tan ÖNCE uyarıyor", () => {
    // Reddedilme metnini okumaktan, düğmeye basmadan bilmek iyi.
    seed(repo([], { ahead: 1, behind: 2 }));
    const { container } = render(<GitChanges />);
    expect(container.querySelector(".git-commit-hint")!.textContent).toBe(
      "Uzakta 2 yeni commit var; push reddedilebilir",
    );
  });

  it("uzak ilerideyse push'un kendisi ENGELLENMİYOR", () => {
    // Karar git'in: bazen fetch edilmemiş bir uzak gerçekte ilerde değildir.
    seed(repo([], { ahead: 1, behind: 2 }));
    const { container } = render(<GitChanges />);
    expect(pushBtn(container).disabled).toBe(false);
  });

  it("reddedilen push: git'in metni KALICI kutuda", async () => {
    seed(repo([], { ahead: 1 }));
    gitSays(repo([], { ahead: 1 }));
    const metin =
      "To github.com:x/y.git\n ! [rejected]        main -> main (fetch first)\nhint: git pull";
    vi.spyOn(api, "gitPush").mockRejectedValue(metin);
    const { container } = render(<GitChanges />);

    pushla(container);
    await flush();

    expect(errorBox(container)!.textContent).toContain("Gönderilemedi");
    expect(errorBox(container)!.querySelector("pre")!.textContent).toBe(metin);
    expect(toast).not.toHaveBeenCalled();
    expect(pushBtn(container).disabled, "hata sonrası push kapalı kaldı").toBe(false);
  });

  it("push sürerken düğme kapalı ve ne yaptığını söylüyor", async () => {
    seed(repo([], { ahead: 1 }));
    gitSays(repo([], { ahead: 1 }));
    const is = bekleyen<string>();
    vi.spyOn(api, "gitPush").mockImplementation(() => is.soz);
    const { container } = render(<GitChanges />);

    pushla(container);
    await flush();

    expect(pushBtn(container).disabled).toBe(true);
    // İSTEK: "spinner olsa daha iyi olmaz mı, profesyonel görünür" — ok
    // simgesinin yerinde çark, yazı aynı; ne yaptığı ipucunda ve `aria-busy`de.
    expect(pushBtn(container).querySelector(".spinner"), "çark yok").not.toBe(null);
    expect(pushBtn(container).textContent).toBe("Push1");
    expect(pushBtn(container).title).toBe("Gönderiliyor…");
    expect(pushBtn(container).getAttribute("aria-busy")).toBe("true");
    gitSays(repo([], { ahead: 0 }));
    is.coz("origin/main");
    await flush();
  });

  it("gönderilecek bir şey yokken (değişiklik varken) kapalı", () => {
    seed(repo([c(" M", "a.ts")], { ahead: 0 }));
    const { container } = render(<GitChanges />);
    expect(pushBtn(container).disabled).toBe(true);
    expect(pushBtn(container).title).toBe("Gönderilecek commit yok");
  });
});

// ---------------------------------------------------------------- Stash düğmesi

describe("Stash düğmesi", () => {
  const stashDugmesi = (v: HTMLElement) => v.querySelector<HTMLButtonElement>(".git-stash-btn");

  it("değişiklik varken commit kutusunda duruyor ve pencereyi bu depo için açıyor", () => {
    seed(repo([c(" M", "a.ts")]));
    const { container } = render(<GitChanges />);
    expect(useStore.getState().ui.stashDialog).toBe(null);

    fireEvent.click(stashDugmesi(container)!);

    expect(useStore.getState().ui.stashDialog).toEqual({ cwd: CWD });
  });

  it("değişiklik yokken (yalnızca gönder satırı) yok", () => {
    // Stash'lenecek bir şey yok; düğme orada gürültü olurdu.
    seed(repo([], { ahead: 1 }));
    const { container } = render(<GitChanges />);
    expect(stashDugmesi(container)).toBe(null);
  });

  it("ilk commit atılmamış depoda kapalı ve nedenini söylüyor", () => {
    seed(repo([c("A ", "a.ts")], { unborn: true, upstream: null }));
    const { container } = render(<GitChanges />);
    expect(stashDugmesi(container)!.disabled).toBe(true);
    expect(stashDugmesi(container)!.title).toBe("İlk commit atılmadan stash kullanılamaz");
  });

  it("ipucu ne yaptığını söylüyor", () => {
    seed(repo([c(" M", "a.ts")]));
    const { container } = render(<GitChanges />);
    expect(stashDugmesi(container)!.title).toBe(
      "Seçtiğin değişiklikleri geçici olarak kenara al (git stash)",
    );
  });

  it("DOLGULU düğme yine yalnızca Commit", () => {
    // Bir kutuda tek dolgulu düğme: dolgu "burada devam et" demek, ikisi olunca
    // hiçbiri demiyor. Stash da Push da ikincil (outline).
    seed(repo([c("M ", "a.ts")]));
    const { container } = render(<GitChanges />);
    const dolgular = container.querySelectorAll(".git-commit button.primary");
    expect(dolgular).toHaveLength(1);
    expect(dolgular[0].className).toContain("git-commit-btn");
  });

  it("stash düğmesi seçilen dosyaları DEĞİŞTİRMİYOR", () => {
    // Satırlardaki kutular "commit'e ekle" diyor; stash başka bir soru ve kendi
    // penceresinde kendi seçimini taşıyor. Düğmeye basmak indeksi kurcalamamalı.
    const stage = vi.spyOn(api, "gitStage").mockResolvedValue(undefined);
    const unstage = vi.spyOn(api, "gitUnstage").mockResolvedValue(undefined);
    seed(repo([c("M ", "a.ts"), c(" M", "b.ts")]));
    const { container } = render(<GitChanges />);

    fireEvent.click(stashDugmesi(container)!);

    expect(stage).not.toHaveBeenCalled();
    expect(unstage).not.toHaveBeenCalled();
    expect(checks(container).map((k) => k.checked)).toEqual([true, false]);
  });
});
