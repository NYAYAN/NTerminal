// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLanguage } from "../lib/i18n";
import { api } from "../lib/ipc";
import { setPlatform } from "../lib/platform";
import { useStore } from "../store/useStore";
import type { Group, TabState } from "../types";
import { GitChanges } from "./GitChanges";

/**
 * Değişiklik listesindeki durum göstergesi.
 *
 * ÖNCEKİ HÂLİ metindi: "DEĞİŞTİ", "EKLENDİ", "YENİDEN ADLANDIRILDI". Sabit
 * 88px'lik bir sütun tutuyordu ve o sütun dosya YOLUNDAN çıkıyordu — dar
 * panelde asıl aranan bilgi kırpılırken yerinde her satırda tekrarlanan aynı
 * kelime duruyordu.
 *
 * Bugün simge: aynı hizalama, üçte bir yer. Bilginin kaybolmaması şartı
 * buradaki testlerin asıl konusu — metin `title` (fare ipucu) ve `aria-label`
 * (ekran okuyucu) içinde duruyor, renk de durumu ikinci bir kanaldan
 * söylüyor.
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

function seed(changes: { status: string; path: string }[], root = CWD) {
  useStore.setState({
    ready: true,
    groups: [group()],
    activeGroupId: "g1",
    gitInfo: {
      [CWD]: { branch: "main", detached: false, ahead: 0, behind: 0, upstream: "origin/main", unborn: false, staged: 0, stashCount: 0, changes, root },
    },
    // Satırlar KAPALI geliyor. Açık satırlar depoda tutulduğu için bir önceki
    // testin açtığı yol (aynı adlar tekrar tekrar kullanılıyor) buraya sızmasın.
    ui: { ...useStore.getState().ui, gitExpanded: [] },
  });
}

/** Bütün satırlar AÇIK: farkı ve sayacı görmek isteyen testler için. */
function seedOpen(changes: { status: string; path: string }[], root = CWD) {
  seed(changes, root);
  useStore.setState({
    ui: { ...useStore.getState().ui, gitExpanded: changes.map((c) => c.path) },
  });
}

beforeEach(() => {
  setLanguage("tr");
  setPlatform("windows");
});

afterEach(() => {
  cleanup();
  // Casus (`spyOn`) çağrı sayıları testler arasında BİRİKİYORDU: "kapalı satır için
  // fark istenmiyor" gibi "hiç çağrılmadı" denetimleri önceki testin çağrısını görürdü.
  vi.restoreAllMocks();
});

describe("durum göstergesi", () => {
  it("metin etiketi yerine simge çiziliyor", () => {
    seed([{ status: " M", path: "src/app.ts" }]);
    const { container } = render(<GitChanges />);

    const icon = container.querySelector(".git-icon");
    expect(icon, "durum simgesi yok").not.toBe(null);
    expect(icon!.querySelector("svg"), "simge bir SVG olmalı").not.toBe(null);
    // Eski metin sütunu geri gelmiş olmasın.
    expect(container.querySelector(".git-tag"), "metin etiketi geri gelmiş").toBe(null);
    expect(container.textContent, "durum yazısı satırda duruyor").not.toContain("Değişti");
  });

  it("metin ipucunda ve ekran okuyucuda duruyor", () => {
    // Simgeye geçmek bilgiyi ATMAK değil, yerini değiştirmek.
    seed([{ status: " M", path: "src/app.ts" }]);
    const { container } = render(<GitChanges />);
    const icon = container.querySelector(".git-icon")!;
    expect(icon.getAttribute("title")).toBe("Değişti");
    expect(icon.getAttribute("aria-label")).toBe("Değişti");
  });

  it("satırın kendi ipucu yol olarak kalıyor", () => {
    // İki ayrı ipucu: simgede durum, satırın geri kalanında yol.
    seed([{ status: " M", path: "src/app.ts" }]);
    const { container } = render(<GitChanges />);
    expect(container.querySelector(".git-row")!.getAttribute("title")).toBe("src/app.ts");
  });

  it("her durum kendi tonunu ve metnini alıyor", () => {
    seed([
      { status: " M", path: "a.ts" },
      { status: "A ", path: "b.ts" },
      { status: " D", path: "c.ts" },
      { status: "R ", path: "d.ts" },
      { status: "??", path: "e.ts" },
    ]);
    const { container } = render(<GitChanges />);
    const icons = [...container.querySelectorAll(".git-icon")];
    expect(icons).toHaveLength(5);

    const seen = icons.map((el) => [el.className, el.getAttribute("title")]);
    expect(seen).toEqual([
      ["git-icon mod", "Değişti"],
      ["git-icon new", "Eklendi"],
      ["git-icon del", "Silindi"],
      ["git-icon ren", "Yeniden adlandırıldı"],
      ["git-icon untracked", "Takip edilmiyor — henüz git add yapılmamış"],
    ]);
  });

  /*
   * Renk şeması VS CODE / GITHUB YERLEŞİĞİ ve testle bağlı.
   *
   * yeşil = dosya YENİ (eklendi, takip edilmiyor, yeniden adlandırıldı)
   * sarı  = dosya DEĞİŞTİ
   * kırmızı = dosya GİTTİ
   *
   * Önceki hâli değiştirileni MAVİ, takip edilmeyeni SARI yapıyordu. Mavi
   * hiçbir yerleşikte "değişti" demiyor; sarı ise yerleşikte tam olarak o
   * demek — iki renk de başkasının işini yapıyordu.
   */
  it("tonlar VS Code / GitHub renk şemasına bağlı", () => {
    const css = readFileSync(join(process.cwd(), "src/styles/global.css"), "utf8");
    const kural = (secici: string) => {
      const at = css.indexOf(secici);
      expect(at, `\`${secici}\` kuralı yok`).toBeGreaterThan(-1);
      return css.slice(at, css.indexOf("}", at));
    };

    // Üç "yeni" durumu tek kuralda, tek yeşilde.
    const yesil = kural(".git-icon.new,");
    for (const ton of [".git-icon.untracked", ".git-icon.ren"]) {
      expect(yesil, `${ton} yeşil kuralında değil`).toContain(ton);
    }
    expect(yesil, "yeni durumlar yeşil değil").toContain("var(--ok)");

    expect(kural(".git-icon.mod {"), "değiştirilen sarı değil").toContain("var(--warn)");
    expect(kural(".git-icon.del {"), "silinen kırmızı değil").toContain("var(--err)");
    // Mavi geri gelmiş olmasın: durum renkleri arasında bir anlamı yok.
    expect(css.slice(css.indexOf(".git-icon {"), css.indexOf(".git-icon.del")))
      .not.toContain("var(--accent)");
  });

  it("eklenen ile takip edilmeyen SİMGEDE ayrışıyor", () => {
    /*
     * İkisi artık aynı yeşilde (yerleşik böyle: VS Code'da U ve A aynı renk),
     * yani ayrımın tamamını simge taşıyor: eklenen dosya içi ARTILI dolu
     * çember, takip edilmeyen KESİK ÇİZGİLİ boş çember.
     *
     * Ayrım gerçek bir şeyi söylüyor ve kaybolmamalı: eklenen dosya indekste,
     * takip edilmeyen hiçbir yerde — commit'e girmesi için önce `git add`
     * gerekiyor. Metin de `title`/`aria-label` içinde duruyor.
     */
    seed([
      { status: "A ", path: "b.ts" },
      { status: "??", path: "e.ts" },
    ]);
    const { container } = render(<GitChanges />);
    const icons = [...container.querySelectorAll(".git-icon")];
    expect(icons[0].className).toBe("git-icon new");
    expect(icons[1].className).toBe("git-icon untracked");
    const [added, untracked] = icons.map((el) => el.querySelector("svg")!);
    expect(added.innerHTML, "simgeler de aynıysa iki durum ayırt edilemez").not.toBe(
      untracked.innerHTML,
    );
  });

  it("bileşik durumda indeks harfi belirleyici", () => {
    // `AM` = indekste eklendi, ağaçta değiştirildi. Commit'e girecek olan
    // indeks tarafı.
    seed([{ status: "AM", path: "b.ts" }]);
    const { container } = render(<GitChanges />);
    expect(container.querySelector(".git-icon")!.getAttribute("title")).toBe("Eklendi");
  });
});

/**
 * Satır eylemleri: yolu kopyala, değişiklikleri geri al, dosyayı aç.
 *
 * Geri alma YIKICI ve iki farklı iş yapıyor: takip edilen dosya son
 * commit'teki hâline dönüyor (geri getirilebilir), takipsiz dosya SİLİNİYOR
 * ve git'te kaydı olmadığı için geri getirilemiyor. Testlerin asıl konusu bu
 * ayrımın kaybolmaması — aynı soruyu iki duruma da sormak, ikincisini
 * olduğundan masum gösterirdi.
 */
describe("satır eylemleri", () => {
  it("üç eylem de satırda duruyor", () => {
    seed([{ status: " M", path: "src/app.ts" }]);
    const { container } = render(<GitChanges />);
    const titles = [...container.querySelectorAll(".git-actions button")].map((b) =>
      b.getAttribute("title"),
    );
    expect(titles).toEqual(["Dosya yolunu kopyala", "Değişiklikleri geri al", "Dosyayı aç"]);
  });

  it("eylemler HER ZAMAN görünüyor", () => {
    // İSTEK: "hover olmadan gözüksün." Gizli bir eylem, bir kez keşfedilene
    // kadar yok demek. Ağırlığı düşük (CSS `opacity`), ama DOM'da koşulsuz.
    seed([{ status: " M", path: "src/app.ts" }]);
    const { container } = render(<GitChanges />);
    const actions = container.querySelector(".git-actions")!;
    expect(actions, "eylemler çizilmiyor").not.toBe(null);
    // `display: none` ile gizlenen bir blok jsdom'da da gizli sayılıyor.
    expect(getComputedStyle(actions).display).not.toBe("none");
  });

  it("sayaç dosya adının YANINDA, eylemlerden önce", async () => {
    // İSTEK: "+15 -1 dosya isminin yanına gelsin, eylemler onun yerine."
    // Sayaç ancak fark gelince çiziliyor, fark da satır AÇILINCA isteniyor.
    seedOpen([{ status: " M", path: "src/app.ts" }]);
    vi.spyOn(api, "gitDiff").mockResolvedValue(
      ["@@ -1,1 +1,2 @@", " bir", "+iki"].join("\n"),
    );
    vi.spyOn(api, "readTextFile").mockResolvedValue(null);
    const { container } = render(<GitChanges />);
    await act(async () => {});
    const row = container.querySelector(".git-row")!;
    const actions = container.querySelector(".git-actions")!;
    // Sayaç satırın (katlama düğmesinin) İÇİNDE: adın yanında demek bu.
    expect(row.querySelector(".git-stat"), "sayaç satırın dışına çıkmış").not.toBe(null);
    // Eylemler satırdan SONRA: sağ uç onların.
    expect(
      row.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING,
      "eylemler satırdan önce geliyor",
    ).toBeTruthy();
  });

  it("eylemler katlama düğmesinin İÇİNDE değil", () => {
    // İç içe düğme geçersiz işaretleme; tıklamalar da karışıyor (eyleme
    // basmak satırı katlıyordu).
    seed([{ status: " M", path: "src/app.ts" }]);
    const { container } = render(<GitChanges />);
    expect(container.querySelector(".git-row .git-actions"), "eylemler satır düğmesinin içinde")
      .toBe(null);
  });

  it("geri alma ONAY olmadan çalışmıyor", async () => {
    seed([{ status: " M", path: "src/app.ts" }]);
    const gitRevert = vi.spyOn(api, "gitRevert").mockResolvedValue(undefined);
    useStore.setState({ askConfirm: async () => false });

    const { container } = render(<GitChanges />);
    fireEvent.click(container.querySelectorAll(".git-actions button")[1]);
    await act(async () => {});

    expect(gitRevert, "onay reddedildiği hâlde geri alındı").not.toHaveBeenCalled();
  });

  it("onay verilince doğru dosya geri alınıyor", async () => {
    seed([{ status: " M", path: "src/app.ts" }]);
    const gitRevert = vi.spyOn(api, "gitRevert").mockResolvedValue(undefined);
    useStore.setState({ askConfirm: async () => true, refreshGit: async () => {} });

    const { container } = render(<GitChanges />);
    fireEvent.click(container.querySelectorAll(".git-actions button")[1]);
    await act(async () => {});

    expect(gitRevert).toHaveBeenCalledWith(CWD, "src/app.ts", false);
  });

  it("takipsiz dosyada SİLME dili kullanılıyor", async () => {
    // "Geri al" demek yanıltıcı olurdu: geri alınacak bir değişiklik yok,
    // dosyanın kendisi değişiklik ve silinmesi geri alınamaz.
    seed([{ status: "??", path: "yeni.ts" }]);
    let istek: { title?: string; detail?: string; confirmLabel?: string } = {};
    vi.spyOn(api, "gitRevert").mockResolvedValue(undefined);
    useStore.setState({
      askConfirm: async (r) => {
        istek = r;
        return true;
      },
      refreshGit: async () => {},
    });

    const { container } = render(<GitChanges />);
    fireEvent.click(container.querySelectorAll(".git-actions button")[1]);
    await act(async () => {});

    expect(istek.title).toBe("Dosyayı sil");
    expect(istek.confirmLabel).toBe("Sil");
    expect(istek.detail, "geri getirilemeyeceği söylenmiyor").toContain("geri getirilemez");
  });

  it("takipsiz bayrağı Rust tarafına geçiyor", async () => {
    // Silme ile HEAD'e dönüş tamamen farklı iki iş; bayrak kaybolursa yanlış
    // olan çalışır.
    seed([{ status: "??", path: "yeni.ts" }]);
    const gitRevert = vi.spyOn(api, "gitRevert").mockResolvedValue(undefined);
    useStore.setState({ askConfirm: async () => true, refreshGit: async () => {} });

    const { container } = render(<GitChanges />);
    fireEvent.click(container.querySelectorAll(".git-actions button")[1]);
    await act(async () => {});

    expect(gitRevert).toHaveBeenCalledWith(CWD, "yeni.ts", true);
  });
});

/**
 * Katlama.
 *
 * Satırlar KAPALI geliyor (istek: "Değişiklikler default olarak hepsi kapalı
 * gelsin"). Önceki hâli tersiydi ve ondan da önce akordeondu: biri açılınca
 * öteki kapanıyordu.
 *
 * Testlerin asıl konusu üç şey: varsayılanın KAPALI olması, kapalı satır için
 * fark İSTENMEMESİ (kapalı gelmenin asıl kazancı bu) ve açmanın yalnızca kendi
 * satırını etkilemesi (akordeonun geri gelmemesi).
 */
describe("katlama", () => {
  beforeEach(() => {
    // Fark isteği kuyruktan geçiyor ve gerçek IPC burada yok; boş fark
    // yeterli, sorulan şey satırın açık olup olmadığı.
    vi.spyOn(api, "gitDiff").mockResolvedValue("");
  });

  it("açık satır kümesi BOŞ başlıyor", () => {
    // `seed` kümeyi açıkça sıfırlıyor; varsayılanın kendisi burada sınanıyor.
    expect(useStore.getInitialState().ui.gitExpanded).toEqual([]);
  });

  it("satırlar KAPALI geliyor", () => {
    seed([
      { status: " M", path: "a.ts" },
      { status: " M", path: "b.ts" },
    ]);
    const { container } = render(<GitChanges />);
    expect(container.querySelectorAll(".git-item")).toHaveLength(2);
    expect(container.querySelectorAll(".git-item.open"), "satırlar açık geliyor").toHaveLength(0);
    expect(container.querySelector(".git-diff"), "kapalı satırın farkı çizilmiş").toBe(null);
  });

  it("kapalı satır için fark İSTENMİYOR", async () => {
    // Kapalı gelmenin asıl kazancı: elli dosyalık değişiklik elli `git diff` ile
    // başlamıyor. Fark yalnızca satır açılınca isteniyor.
    const gitDiff = vi.spyOn(api, "gitDiff").mockResolvedValue("");
    seed([
      { status: " M", path: "a.ts" },
      { status: " M", path: "b.ts" },
    ]);
    render(<GitChanges />);
    await act(async () => {});
    expect(gitDiff, "kapalı satırlar için fark istendi").not.toHaveBeenCalled();
  });

  it("satırı açınca farkı istiyor", async () => {
    const gitDiff = vi.spyOn(api, "gitDiff").mockResolvedValue("");
    seed([
      { status: " M", path: "a.ts" },
      { status: " M", path: "b.ts" },
    ]);
    const { container } = render(<GitChanges />);
    fireEvent.click(container.querySelectorAll(".git-row")[1]);
    await act(async () => {});

    expect(gitDiff).toHaveBeenCalledTimes(1);
    expect(gitDiff).toHaveBeenCalledWith(CWD, "b.ts", false);
  });

  it("tıklamak yalnızca o satırı açıyor", () => {
    // Akordeonun geri gelmemesi: ikinciyi açmak birinciyi etkilememeli, üçüncüyü
    // de açmamalı.
    seed([
      { status: " M", path: "a.ts" },
      { status: " M", path: "b.ts" },
      { status: " M", path: "c.ts" },
    ]);
    const { container } = render(<GitChanges />);
    fireEvent.click(container.querySelectorAll(".git-row")[1]);

    const items = [...container.querySelectorAll(".git-item")];
    expect(items[0].className, "ilk satır açıldı").not.toContain("open");
    expect(items[1].className, "ikinci satır açılmadı").toContain("open");
    expect(items[2].className, "üçüncü satır açıldı").not.toContain("open");
  });

  it("iki satır aynı anda açık kalabiliyor", () => {
    // Akordeon olsaydı ikincisini açmak birincisini kapatırdı.
    seed([
      { status: " M", path: "a.ts" },
      { status: " M", path: "b.ts" },
    ]);
    const { container } = render(<GitChanges />);
    fireEvent.click(container.querySelectorAll(".git-row")[0]);
    fireEvent.click(container.querySelectorAll(".git-row")[1]);
    expect(container.querySelectorAll(".git-item.open")).toHaveLength(2);
  });

  it("açılan satır yeniden kapanabiliyor", () => {
    seed([{ status: " M", path: "a.ts" }]);
    const { container } = render(<GitChanges />);
    const row = container.querySelector(".git-row")!;
    fireEvent.click(row);
    expect(container.querySelector(".git-item")!.className).toContain("open");
    fireEvent.click(row);
    expect(container.querySelector(".git-item")!.className).not.toContain("open");
  });

  it("listeye sonradan giren dosya da kapalı geliyor", () => {
    // Liste git yoklamasıyla kendiliğinden değişiyor: yeni beliren dosya, başka
    // bir satır açıkken bile kapalı gelmeli.
    seed([{ status: " M", path: "a.ts" }]);
    const { container } = render(<GitChanges />);
    fireEvent.click(container.querySelector(".git-row")!);

    act(() => {
      const info = useStore.getState().gitInfo[CWD]!;
      useStore.setState({
        gitInfo: { [CWD]: { ...info, changes: [...info.changes, { status: "??", path: "yeni.ts" }] } },
      });
    });

    const items = [...container.querySelectorAll(".git-item")];
    expect(items).toHaveLength(2);
    expect(items[0].className).toContain("open");
    expect(items[1].className, "yeni dosya açık geldi").not.toContain("open");
  });
});

/**
 * Tam yol deponun KÖKÜNDEN kuruluyor, kabuğun dizininden değil.
 *
 * BİLDİRİLEN HATA: "Değişiklikler kısmına gittiğimde 'Gösterilecek fark yok'
 * diyor, oysaki var." Kök neden iki git kuralının ayrışması — `status
 * --porcelain` yolları her zaman depo KÖKÜNE göre veriyor, `diff -- <yol>` ise
 * bulunulan dizine göre çözüyor. Kabuk bir alt klasördeyken ikisi tutmuyordu.
 *
 * Rust tarafı artık komutları kökten koşuyor (`git.rs` `work_dir`, testi
 * `git_tests.rs`); burada bağlanan şey arayüzün payı: "dosyayı aç" da aynı
 * ayrışmadan etkileniyordu ve var olmayan bir yol üretiyordu.
 */
describe("tam yol", () => {
  it("depo kökünden kuruluyor", () => {
    const KOK = "C:/depo";
    // Kabuk iki klasör aşağıda; porcelain yolu yine köke göre veriyor.
    seed([{ status: " M", path: "src/app.ts" }], KOK);
    const openFile = vi.fn();
    useStore.setState({ openFile });

    const { container } = render(<GitChanges />);
    fireEvent.click(container.querySelectorAll(".git-actions button")[2]);

    expect(openFile).toHaveBeenCalledWith("C:/depo/src/app.ts");
  });

  it("kök bildirilmemişse kabuğun dizinine düşüyor", () => {
    // Eski bir sürümden gelen ya da okunamamış bir kök arayüzü kilitlemesin.
    seed([{ status: " M", path: "src/app.ts" }], "");
    const openFile = vi.fn();
    useStore.setState({ openFile });

    const { container } = render(<GitChanges />);
    fireEvent.click(container.querySelectorAll(".git-actions button")[2]);

    expect(openFile).toHaveBeenCalledWith(`${CWD}/src/app.ts`);
  });
});

/**
 * Bağlam açıcıları.
 *
 * İSTEK: "Değişiklik olmayan satırları göster için yukarıda ve aşağıda 50
 * satırlık kod açma butonları olsun, bastıkça açılsın."
 *
 * Boşluğun nerede olduğu `lib/diff.ts` içinde hesaplanıyor ve orada test
 * ediliyor; burada bağlanan şey arayüzün payı — düğmelerin ne zaman çizildiği
 * ve basınca GERÇEKTEN dosyadan satır açıp açmadığı.
 */
describe("bağlam açıcıları", () => {
  const DIFF = [
    "diff --git a/a.ts b/a.ts",
    "--- a/a.ts",
    "+++ b/a.ts",
    "@@ -60,1 +60,2 @@ export function bir()",
    " satir60",
    "+yeni",
  ].join("\n");

  /** 200 satırlık bir dosya: `satir1` … `satir200`. */
  const DOSYA = Array.from({ length: 200 }, (_, i) => `satir${i + 1}`).join("\n");

  async function ciz() {
    seedOpen([{ status: " M", path: "a.ts" }]);
    vi.spyOn(api, "gitDiff").mockResolvedValue(DIFF);
    vi.spyOn(api, "readTextFile").mockResolvedValue({
      text: DOSYA,
      truncated: false,
      binary: false,
      size: DOSYA.length,
    });
    const view = render(<GitChanges />);
    await act(async () => {});
    return view;
  }

  it("gizli satır sayısını yazıyor", async () => {
    const { container } = await ciz();
    // İlk hunk 60'ta başlıyor: 1..59 gizli.
    expect(container.querySelector(".diff-gap-count")!.textContent).toBe("59 değişmemiş satır");
  });

  it("kapsayan işlevin adı boşluk satırında duruyor", async () => {
    // Hunk başlığının tek özgün parçası bu; başlığın kendisi artık çizilmiyor.
    const { container } = await ciz();
    expect(container.querySelector(".diff-gap-context")!.textContent).toBe(
      "export function bir()",
    );
  });

  /** Baştaki boşluk (1..59) — dosyanın sonundaki ayrı bir boşluk. */
  const bas = (c: HTMLElement) => c.querySelectorAll<HTMLElement>(".diff-gap")[0];
  /** Açılan bağlam satırları; `meta` başlıkları saymıyor. */
  const acilan = (c: HTMLElement) =>
    [...c.querySelectorAll(".diff-line.same")].filter((el) => el.textContent?.includes("satir"));

  it("iki yön de açılabiliyor", async () => {
    const { container } = await ciz();
    const titles = [...bas(container).querySelectorAll(".diff-gap-actions button")].map((b) =>
      b.getAttribute("title"),
    );
    expect(titles).toEqual(["Yukarıdan 50 satır aç", "Aşağıdan 50 satır aç"]);
  });

  it("yukarı ok satırları açıcının ÜSTÜNDE açıyor", async () => {
    const { container } = await ciz();
    const gap = bas(container);
    fireEvent.click(gap.querySelectorAll(".diff-gap-actions button")[0]);

    const ustte = acilan(container).filter(
      (el) => el.compareDocumentPosition(bas(container)) & Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(ustte, "satırlar açıcının üstünde çizilmedi").toHaveLength(50);
    // Üstten açma dosyanın başından geliyor: 1..50.
    expect(ustte[0].textContent).toContain("satir1");
    expect(bas(container).querySelector(".diff-gap-count")!.textContent).toBe(
      "9 değişmemiş satır",
    );
  });

  it("aşağı ok satırları açıcının ALTINDA açıyor", async () => {
    const { container } = await ciz();
    fireEvent.click(bas(container).querySelectorAll(".diff-gap-actions button")[1]);

    const altta = acilan(container).filter(
      (el) => el.compareDocumentPosition(bas(container)) & Node.DOCUMENT_POSITION_PRECEDING,
    );
    // Alttan açılan aralık hunk'a en YAKIN 50 satır: 10..59.
    expect(altta[0].textContent).toContain("satir10");
    expect(altta[49].textContent).toContain("satir59");
  });

  it("kalan az olduğunda tek düğme kalıyor", async () => {
    // İki yön de aynı sonucu verirken iki düğme göstermek seçim varmış gibi
    // yapardı.
    const { container } = await ciz();
    fireEvent.click(bas(container).querySelectorAll(".diff-gap-actions button")[0]);
    // Tek düğme kalıyor ve simgesi iki yana açılan ok: yön diye bir şey yok.
    const kalan = bas(container).querySelectorAll(".diff-gap-actions button");
    expect(kalan).toHaveLength(1);
    expect(kalan[0].getAttribute("title")).toBe("Kalan satırları aç");
  });

  it("tümü açılınca o boşluğun açıcısı kayboluyor", async () => {
    const { container } = await ciz();
    fireEvent.click(bas(container).querySelectorAll(".diff-gap-actions button")[0]);
    fireEvent.click(bas(container).querySelectorAll(".diff-gap-actions button")[0]);

    // Geriye yalnızca dosyanın SONUNDAKİ boşluk kalıyor.
    const acik = [...container.querySelectorAll(".diff-gap-count")].map((el) => el.textContent);
    expect(acik, "açacak bir şey yokken açıcı duruyor").toEqual(["139 değişmemiş satır"]);
  });

  it("dosyanın SONUNDAKİ satırlar da açılabiliyor", async () => {
    // Son hunk 61'de bitiyor, dosya 200 satır: 62..200 gizli.
    const { container } = await ciz();
    const counts = [...container.querySelectorAll(".diff-gap-count")].map((el) => el.textContent);
    expect(counts).toEqual(["59 değişmemiş satır", "139 değişmemiş satır"]);
  });

  it("dosya okunamazsa düğme KAPALI, ama duruyor", async () => {
    // Hiç düğme çizmemek "burada açacak bir şey yok" diye okunuyordu; oysa
    // var — okunamayan bir dosya var. İkisi ayrı şey ve ipucu hangisi
    // olduğunu söylüyor.
    seedOpen([{ status: " M", path: "a.ts" }]);
    vi.spyOn(api, "gitDiff").mockResolvedValue(DIFF);
    vi.spyOn(api, "readTextFile").mockResolvedValue(null);
    const { container } = render(<GitChanges />);
    await act(async () => {});

    const btn = container.querySelector<HTMLButtonElement>(".diff-gap-actions button")!;
    expect(btn, "düğme hiç çizilmemiş").not.toBe(null);
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute("title")).toContain("dosya okunamadı");
    // Boşluğun kendisi yine yazıyor: kopukluk gerçek, yalnızca açılamıyor.
    // Dosya okunamadığı için dosya SONUNDAKİ boşluk hiç üretilmiyor.
    const sayaclar = [...container.querySelectorAll(".diff-gap-count")].map((el) => el.textContent);
    expect(sayaclar).toEqual(["59 değişmemiş satır"]);
  });

  it("dosya okuması GECİKSE bile açıcı çalışıyor", async () => {
    /*
     * BİLDİRİLEN HATA: "'Bu satırlar açılamıyor — dosya okunamadı' yazıyor ama
     * dosya var."
     *
     * Sebep bir YARIŞTI ve yalnızca gerçek IPC gecikmesinde görünüyordu.
     * Fark ile dosya tek bir etkide arka arkaya isteniyordu ve etkinin
     * bağımlılıkları arasında `lines` vardı: `setLines` bir yeniden çizim
     * tetikliyor, React o çizimde etkinin TEMİZLİĞİNİ koşuyor, temizlik de
     * `cancelled = true` diyordu. Dosya okuması henüz dönmemişse sonucu
     * atılıyor ve `fileLines` sonsuza kadar boş kalıyordu.
     *
     * Sahte IPC anında çözüldüğü için eski testler bunu YAKALAMIYORDU: dosya,
     * React yeniden çizmeye fırsat bulamadan geliyordu. Bu test okumayı bir
     * sonraki döngüye atarak gerçek sırayı kuruyor.
     */
    seedOpen([{ status: " M", path: "a.ts" }]);
    vi.spyOn(api, "gitDiff").mockResolvedValue(DIFF);
    vi.spyOn(api, "readTextFile").mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ text: DOSYA, truncated: false, binary: false, size: 1 }), 0),
        ),
    );

    const { container } = render(<GitChanges />);
    // ÖNCE yalnızca farkın gelmesine ve React'in yeniden çizmesine izin ver:
    // hatanın doğduğu an tam olarak burası.
    await act(async () => {});
    // SONRA dosya okuması dönsün.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });

    const btn = container.querySelector<HTMLButtonElement>(".diff-gap-actions button")!;
    expect(btn.disabled, "dosya geldiği hâlde düğme kapalı kaldı").toBe(false);
  });
});
