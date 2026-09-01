// @vitest-environment jsdom
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
      [CWD]: { branch: "main", detached: false, ahead: 0, behind: 0, changes, root },
    },
  });
}

beforeEach(() => {
  setLanguage("tr");
  setPlatform("windows");
});

afterEach(cleanup);

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

  it("her durum kendi rengini ve metnini alıyor", () => {
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
      ["git-icon mod", "Yeniden adlandırıldı"],
      // Takip edilmeyen dosya EKLENENLE AYNI RENKTE DEĞİL: ikisi de yeşil
      // olunca "yeni dosya eklendi" diye okunuyordu, oysa eklenen dosya
      // indekste, takip edilmeyen hiçbir yerde.
      ["git-icon untracked", "Takip edilmiyor — henüz git add yapılmamış"],
    ]);
  });

  it("eklenen ile takip edilmeyen hem renkte hem simgede ayrışıyor", () => {
    // Renk ilk ayrım (yeşil / sarı), simge ikincisi: renk körlüğünde ya da
    // düşük parlaklıkta tek bir kanal yetmiyor.
    seed([
      { status: "A ", path: "b.ts" },
      { status: "??", path: "e.ts" },
    ]);
    const { container } = render(<GitChanges />);
    const icons = [...container.querySelectorAll(".git-icon")];
    expect(icons[0].className).toBe("git-icon new");
    expect(icons[1].className).toBe("git-icon untracked");
    const [added, untracked] = icons.map((el) => el.querySelector("svg")!);
    expect(added.innerHTML).not.toBe(untracked.innerHTML);
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
    seed([{ status: " M", path: "src/app.ts" }]);
    // Sayaç ancak fark gelince çiziliyor.
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
 * ÖNCEKİ HÂLİ akordeondu: satırlar kapalı geliyor, biri açılınca öteki
 * kapanıyordu. "Neler değişmiş" sorusunun yanıtı ise listenin TAMAMI — her
 * dosyayı tek tek açmak aynı soruyu dosya sayısı kadar sormak demekti.
 *
 * Testlerin asıl konusu iki şey: varsayılanın AÇIK olması ve kapatmanın
 * yalnızca kendi satırını etkilemesi (akordeonun geri gelmemesi).
 */
describe("katlama", () => {
  beforeEach(() => {
    // Fark isteği kuyruktan geçiyor ve gerçek IPC burada yok; boş fark
    // yeterli, sorulan şey satırın açık olup olmadığı.
    vi.spyOn(api, "gitDiff").mockResolvedValue("");
  });

  it("satırlar AÇIK geliyor", () => {
    seed([
      { status: " M", path: "a.ts" },
      { status: " M", path: "b.ts" },
    ]);
    const { container } = render(<GitChanges />);
    expect(container.querySelectorAll(".git-item.open")).toHaveLength(2);
  });

  it("tıklamak yalnızca o satırı kapatıyor", () => {
    // Akordeonun geri gelmemesi: ikinciyi kapatmak birinciyi açık bırakmalı.
    seed([
      { status: " M", path: "a.ts" },
      { status: " M", path: "b.ts" },
    ]);
    const { container } = render(<GitChanges />);
    fireEvent.click(container.querySelectorAll(".git-row")[1]);

    const items = [...container.querySelectorAll(".git-item")];
    expect(items[0].className, "ilk satır da kapandı").toContain("open");
    expect(items[1].className, "ikinci satır kapanmadı").not.toContain("open");
  });

  it("kapatılan satır yeniden açılabiliyor", () => {
    seed([{ status: " M", path: "a.ts" }]);
    const { container } = render(<GitChanges />);
    const row = container.querySelector(".git-row")!;
    fireEvent.click(row);
    fireEvent.click(row);
    expect(container.querySelector(".git-item")!.className).toContain("open");
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
    seed([{ status: " M", path: "a.ts" }]);
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
    seed([{ status: " M", path: "a.ts" }]);
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
    seed([{ status: " M", path: "a.ts" }]);
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
