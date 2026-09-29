// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { REMOTES_GRACE_MS, SECTION_ROW_LIMIT } from "../lib/branches";
import { setLanguage } from "../lib/i18n";
import { api } from "../lib/ipc";
import { anchorAbove } from "../lib/popover";
import { useStore } from "../store/useStore";
import type { GitBranch } from "../types";
import { BranchPicker } from "./BranchPicker";

// Yerleşimi jsdom ölçemiyor (her ölçü 0); burada yalnızca NE ZAMAN çağrıldığı
// sınanıyor. Konumun kendisi `popover.test.ts` içinde.
vi.mock("../lib/popover", () => ({ anchorAbove: vi.fn() }));

/**
 * Dal seçicide yerel ve uzak dalların ayrılması.
 *
 * BİLDİRİLEN SORUN: "branch'leri gösteriyoruz, bu gösterdiğimiz yerde remote
 * origin'ler de geliyor. Bu da karışıklığa sebebiyet veriyor. Yerel olanlar
 * gözüksün, bir de collapse gibi bir şey olsun, remote göstermesi için kişi
 * açmak isterse gelsin."
 *
 * Kuralların kendisi `lib/branches.test.ts` içinde; burada bağlanan şey
 * arayüzün payı: başlığın gerçekten çizilmesi, basınca açılması, durumun
 * hatırlanması ve klavyenin başlığı tanıması.
 */

const LISTE: GitBranch[] = [
  { name: "main", remote: null },
  { name: "yeni-ozellik", remote: "origin" },
  { name: "dev", remote: null },
  { name: "eski-dal", remote: "origin" },
];

function remotesOpen(open: boolean) {
  useStore.setState({ ui: { ...useStore.getState().ui, branchRemotesOpen: open } });
}

async function ac(list: GitBranch[] = LISTE) {
  vi.spyOn(api, "gitBranches").mockResolvedValue(list);
  const onClose = vi.fn();
  const view = render(<BranchPicker cwd="/depo" current="main" onClose={onClose} />);
  await act(async () => {});
  return { ...view, onClose };
}

/** Satırın dal adı: düğmenin doğrudan metin düğümü (etiketler hariç). */
function adi(el: Element): string {
  const text = [...el.childNodes].find((n) => n.nodeType === Node.TEXT_NODE);
  return text?.textContent ?? "";
}

const adlar = (c: HTMLElement) => [...c.querySelectorAll(".pop-row")].map(adi);
const baslik = (c: HTMLElement) => c.querySelector<HTMLElement>("button.pop-group");

beforeEach(() => {
  setLanguage("tr");
  remotesOpen(false);
  useStore.setState({ insertCommand: vi.fn() });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("varsayılan görünüm", () => {
  it("uygulama açılışında bölüm KAPALI", () => {
    // Diğer testler durumu kendileri kuruyor (`beforeEach`), yani gerçek
    // başlangıç değerini yalnızca burada sınıyoruz. Mutasyonla ölçüldü:
    // varsayılan `true` yapıldığında bu test olmadan hiçbiri düşmüyordu.
    expect(useStore.getInitialState().ui.branchRemotesOpen).toBe(false);
  });

  it("yerel dallar görünüyor, uzaklar görünmüyor", async () => {
    const { container } = await ac();
    expect(adlar(container)).toEqual(["main", "dev"]);
  });

  it("uzak dallar sayıyla birlikte bir başlığın ARKASINDA", async () => {
    const { container } = await ac();
    const b = baslik(container)!;
    expect(b, "başlık çizilmemiş").not.toBe(null);
    expect(b.textContent).toContain("Uzak dallar");
    // Sayı, açmadan "orada bir şey var mı" sorusunu yanıtlıyor.
    expect(b.querySelector(".pill-count")!.textContent).toBe("2");
    expect(b.getAttribute("aria-expanded")).toBe("false");
  });

  it("bulunulan dal işaretli", async () => {
    const { container } = await ac();
    expect(container.querySelector(".pop-row .pop-tag")!.textContent).toBe("burada");
  });

  it("uzak dal yoksa başlık çizilmiyor", async () => {
    // Boş bir başlık gürültü: içinde açılacak bir şey yok.
    const { container } = await ac([
      { name: "main", remote: null },
      { name: "dev", remote: null },
    ]);
    expect(container.querySelector(".pop-group")).toBe(null);
    expect(adlar(container)).toEqual(["main", "dev"]);
  });

  it("hiç dal yoksa boş mesaj", async () => {
    const { container } = await ac([]);
    expect(container.querySelector(".pop-empty")!.textContent).toBe("Dal bulunamadı");
  });
});

describe("bölümü açma", () => {
  it("başlığa basınca uzak dallar başlığın altında geliyor", async () => {
    const { container } = await ac();
    fireEvent.click(baslik(container)!);

    expect(adlar(container)).toEqual(["main", "dev", "yeni-ozellik", "eski-dal"]);
    expect(baslik(container)!.getAttribute("aria-expanded")).toBe("true");
    // Uzak satırlar başlığın ALTINDA: sıra DOM'da da öyle.
    const b = baslik(container)!;
    const ilkUzak = container.querySelectorAll(".pop-row")[2];
    expect(b.compareDocumentPosition(ilkUzak) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Uzak satırlar girintili ve uzağın adını taşıyor.
    expect(ilkUzak.className).toContain("nested");
    expect(ilkUzak.querySelector(".pop-tag.remote")!.textContent).toBe("origin");
  });

  it("tekrar basınca kapanıyor", async () => {
    const { container } = await ac();
    fireEvent.click(baslik(container)!);
    fireEvent.click(baslik(container)!);
    expect(adlar(container)).toEqual(["main", "dev"]);
  });

  it("durum DEPODA: seçici kapanıp açılınca hatırlanıyor", async () => {
    // Seçici her kapanışta sökülüyor; durum yerel olsaydı uzak dallara bakan
    // biri her açışta bölümü yeniden açmak zorunda kalırdı.
    const ilk = await ac();
    fireEvent.click(baslik(ilk.container)!);
    expect(useStore.getState().ui.branchRemotesOpen).toBe(true);
    ilk.unmount();

    const ikinci = await ac();
    expect(adlar(ikinci.container)).toEqual(["main", "dev", "yeni-ozellik", "eski-dal"]);
  });

  it("uzak satırı seçmek izleme dalı kuran komutu gönderiyor", async () => {
    remotesOpen(true);
    const { container, onClose } = await ac();
    const satir = [...container.querySelectorAll(".pop-row")].find(
      (el) => adi(el) === "yeni-ozellik",
    )!;
    fireEvent.click(satir);

    expect(useStore.getState().insertCommand).toHaveBeenCalledWith(
      "git checkout --track origin/yeni-ozellik",
      true,
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("yerel dalı seçmek düz checkout gönderiyor", async () => {
    const { container } = await ac();
    const satir = [...container.querySelectorAll(".pop-row")].find((el) => adi(el) === "dev")!;
    fireEvent.click(satir);

    expect(useStore.getState().insertCommand).toHaveBeenCalledWith("git checkout dev", true);
  });

  it("başlığa basmak komut GÖNDERMİYOR", async () => {
    // Başlık bir dal değil, bir bölüm; basınca kabuğa `git checkout` gitmemeli.
    const { container, onClose } = await ac();
    fireEvent.click(baslik(container)!);

    expect(useStore.getState().insertCommand).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("yerleşim", () => {
  const yaz = (c: HTMLElement, value: string) =>
    fireEvent.change(c.querySelector(".pop-search")!, { target: { value } });

  it("bölüm açılınca panel rozetin üstüne YENİDEN yerleşiyor", async () => {
    /*
     * Panelin konumu YÜKSEKLİĞİNDEN hesaplanıyor. "Uzak dallar" açılınca panel
     * 120px'ten 340px'e büyüyor; yeniden hesaplanmazsa üst kenar yerinde kalıp
     * alt kenar aşağı iniyor ve panel rozetin üstüne binip ekran dışına
     * taşıyordu (gözle görüldü).
     */
    const { container } = await ac();
    vi.mocked(anchorAbove).mockClear();

    fireEvent.click(baslik(container)!);

    expect(anchorAbove, "açılınca yeniden yerleşmedi").toHaveBeenCalled();
    expect(vi.mocked(anchorAbove).mock.calls[0][1]).toBe(".ctx-chip.branch");
  });

  it("bölüm kapanınca da yeniden yerleşiyor", async () => {
    remotesOpen(true);
    const { container } = await ac();
    vi.mocked(anchorAbove).mockClear();

    fireEvent.click(baslik(container)!);

    expect(anchorAbove, "kapanınca panel rozetten uzakta asılı kaldı").toHaveBeenCalled();
  });

  it("arama listeyi kısaltınca yeniden yerleşiyor", async () => {
    const { container } = await ac();
    vi.mocked(anchorAbove).mockClear();

    yaz(container, "dev");

    expect(anchorAbove).toHaveBeenCalled();
  });

  it("satır sayısı DEĞİŞMEDİKÇE gereksiz yere yerleşmiyor", async () => {
    // Fare satırlar üzerinde gezerken (vurgu değişiyor) konum hesabı koşmamalı.
    const { container } = await ac();
    vi.mocked(anchorAbove).mockClear();

    fireEvent.mouseEnter(container.querySelectorAll(".pop-row")[1]);

    expect(anchorAbove).not.toHaveBeenCalled();
  });
});

describe("klavye", () => {
  const tus = (c: HTMLElement, key: string) =>
    fireEvent.keyDown(c.querySelector(".pop-search")!, { key });

  it("alt ok başlığa iniyor, Enter bölümü açıyor", async () => {
    const { container } = await ac();
    // main → dev → başlık
    tus(container, "ArrowDown");
    tus(container, "ArrowDown");
    expect(baslik(container)!.className).toContain("on");

    tus(container, "Enter");

    expect(adlar(container)).toContain("yeni-ozellik");
    expect(useStore.getState().insertCommand, "başlıkta Enter komut gönderdi").not.toHaveBeenCalled();
  });

  it("vurgu açıldıktan sonra başlıkta kalıyor, alt ok uzak satırlara iniyor", async () => {
    const { container } = await ac();
    tus(container, "ArrowDown");
    tus(container, "ArrowDown");
    tus(container, "Enter");
    expect(baslik(container)!.className).toContain("on");

    tus(container, "ArrowDown");
    const on = container.querySelector(".pop-row.on")!;
    expect(adi(on)).toBe("yeni-ozellik");

    tus(container, "Enter");
    expect(useStore.getState().insertCommand).toHaveBeenCalledWith(
      "git checkout --track origin/yeni-ozellik",
      true,
    );
  });

  it("Enter yerel dalda geçiş komutunu gönderiyor", async () => {
    const { container, onClose } = await ac();
    tus(container, "ArrowDown"); // main → dev
    tus(container, "Enter");

    expect(useStore.getState().insertCommand).toHaveBeenCalledWith("git checkout dev", true);
    expect(onClose).toHaveBeenCalled();
  });

  it("liste başa sarıyor", async () => {
    // main, dev, başlık: üç gezilebilir satır. Yukarı ok ilk satırdan sona atlıyor.
    const { container } = await ac();
    tus(container, "ArrowUp");
    expect(baslik(container)!.className).toContain("on");
  });

  it("Escape seçiciyi kapatıyor", async () => {
    const { container, onClose } = await ac();
    tus(container, "Escape");
    expect(onClose).toHaveBeenCalled();
  });
});

describe("arama", () => {
  const yaz = (c: HTMLElement, value: string) =>
    fireEvent.change(c.querySelector(".pop-search")!, { target: { value } });

  it("KAPALI bölümdeki eşleşme de bulunuyor", async () => {
    // Uzak dallar `git fetch` sonrası bir dalı bulabilmek için listeleniyor;
    // kapalı bir bölüm aramayı gizlerse "yok" der, oysa var.
    const { container } = await ac();
    expect(useStore.getState().ui.branchRemotesOpen).toBe(false);

    yaz(container, "yeni");

    expect(adlar(container)).toEqual(["yeni-ozellik"]);
  });

  it("aramada başlık düz bir etiket: basılamıyor, katlamayı değiştirmiyor", async () => {
    const { container } = await ac();
    yaz(container, "yeni");

    expect(baslik(container), "aramada basılabilir başlık kalmış").toBe(null);
    const etiket = container.querySelector(".pop-group.static")!;
    expect(etiket.textContent).toContain("Uzak dallar");
    expect(etiket.querySelector(".pill-count")!.textContent).toBe("1");
    expect(useStore.getState().ui.branchRemotesOpen).toBe(false);
  });

  it("aramada ok tuşları düz etiketi ATLIYOR", async () => {
    // Etiket gezilebilir olsaydı ilk satır o olurdu ve Enter hiçbir şey yapmazdı.
    const { container } = await ac();
    yaz(container, "yeni");
    fireEvent.keyDown(container.querySelector(".pop-search")!, { key: "Enter" });

    expect(useStore.getState().insertCommand).toHaveBeenCalledWith(
      "git checkout --track origin/yeni-ozellik",
      true,
    );
  });

  it("arama temizlenince bölüm kullanıcının bıraktığı hâle dönüyor", async () => {
    const { container } = await ac();
    yaz(container, "yeni");
    yaz(container, "");

    expect(adlar(container)).toEqual(["main", "dev"]);
    expect(baslik(container)!.getAttribute("aria-expanded")).toBe("false");
  });

  it("yerel eşleşme önde, uzak eşleşmeler etiketin altında", async () => {
    const { container } = await ac([
      { name: "api-yerel", remote: null },
      { name: "api-uzak", remote: "origin" },
    ]);
    yaz(container, "api");

    expect(adlar(container)).toEqual(["api-yerel", "api-uzak"]);
    const etiket = container.querySelector(".pop-group.static")!;
    const uzak = container.querySelectorAll(".pop-row")[1];
    expect(etiket.compareDocumentPosition(uzak) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

/**
 * Binlerce uzak dalda seçici.
 *
 * ÖLÇÜLDÜ (10 bin uzak dal): bölümü açmak 510 ms, her ok tuşu 45 ms — 90 bin
 * DOM öğesi. Kuralın kendisi (tavan, sayı, gezilemezlik) `lib/branches.test.ts`
 * içinde; burada bağlanan arayüzün payı: DOM'a gerçekten en fazla tavan kadar
 * satır girmesi, "daha" satırının metni ve ok tuşlarının onu atlaması.
 */
describe("çok sayıda dal", () => {
  const cok = (n: number): GitBranch[] => [
    { name: "main", remote: null },
    ...Array.from({ length: n }, (_, i) => ({ name: `dal-${i}`, remote: "origin" })),
  ];

  it("açılan bölüm DOM'a en fazla tavan kadar satır koyuyor, kalanı sayıyor", async () => {
    remotesOpen(true);
    const { container } = await ac(cok(SECTION_ROW_LIMIT + 5));

    expect(container.querySelectorAll(".pop-row.nested")).toHaveLength(SECTION_ROW_LIMIT);
    expect(container.querySelector(".pop-more.nested")!.textContent).toBe(
      "5 dal daha — aramayı daraltın",
    );
    // Başlık yine TAMAMINI sayıyor: tavan yalnızca çizileni küçültüyor.
    expect(baslik(container)!.querySelector(".pill-count")!.textContent).toBe(
      String(SECTION_ROW_LIMIT + 5),
    );
  });

  it("aramada da tavan; tekil ve çoğul İngilizcede ayrışıyor", async () => {
    const { container } = await ac(cok(SECTION_ROW_LIMIT + 1));
    fireEvent.change(container.querySelector(".pop-search")!, { target: { value: "dal-" } });

    expect(container.querySelectorAll(".pop-row")).toHaveLength(SECTION_ROW_LIMIT);
    expect(container.querySelector(".pop-more")!.textContent).toBe("1 dal daha — aramayı daraltın");

    act(() => setLanguage("en"));
    expect(container.querySelector(".pop-more")!.textContent).toBe(
      "1 more branch — narrow the search",
    );
  });

  it("ok tuşları 'daha' satırını atlıyor: yukarı ok son DALA iniyor", async () => {
    // "Daha" satırı gezilebilir olsaydı listenin sonu o olurdu ve Enter hiçbir
    // şey yapmazdı.
    remotesOpen(true);
    const { container } = await ac(cok(SECTION_ROW_LIMIT + 5));
    fireEvent.keyDown(container.querySelector(".pop-search")!, { key: "ArrowUp" });

    const satirlar = container.querySelectorAll(".pop-row");
    expect(satirlar[satirlar.length - 1].className).toContain("on");
    expect(container.querySelector(".pop-more")!.className).not.toContain("on");
  });
});

/**
 * Uzaklar yavaşken seçici önce yerel dalları çiziyor.
 *
 * ÖLÇÜLDÜ (50 bin uzak dal): tam liste 634 ms (paketli ref) ile 8 sn (`git
 * fetch` sonrası, her ref ayrı dosya); yalnızca yerel dallar 29-56 ms. Tam
 * listeyi beklemek, her gün geçilen birkaç yerel dal için saniyelerce
 * "Yükleniyor…" demekti. Öbür yandan çoğu depoda iki okuma da hızlı ve orada
 * iki aşamalı çizim yalnızca titreme olurdu. Sınanan bu iki sınır.
 */
describe("iki aşamalı yükleme", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  /**
   * Yerel liste hemen, tam liste elle çözülen bir sözle geliyor. `eskiIkili`:
   * `remotes`'u tanımayan bir Rust ikilisi gibi yerel çağrıya da HER ŞEYİ dön.
   */
  function yavasTam({ eskiIkili = false } = {}) {
    let coz!: (l: GitBranch[]) => void;
    const tam = new Promise<GitBranch[]>((resolve) => (coz = resolve));
    vi.spyOn(api, "gitBranches").mockImplementation((_path, remotes) =>
      remotes ? tam : Promise.resolve(eskiIkili ? LISTE : LISTE.filter((b) => !b.remote)),
    );
    const view = render(<BranchPicker cwd="/depo" current="main" onClose={vi.fn()} />);
    return { ...view, bitir: (l: GitBranch[]) => act(async () => coz(l)) };
  }

  const sure = (ms: number) =>
    act(async () => {
      vi.advanceTimersByTime(ms);
    });
  const okunuyor = (c: HTMLElement) => c.querySelector<HTMLElement>(".pop-group.static[aria-busy]");

  it("tam liste gecikirse süre dolunca yerel dallar, uzak başlığı '…'", async () => {
    const { container, bitir } = yavasTam();
    await sure(REMOTES_GRACE_MS - 1);
    // Süre dolmadan: tek seferde çizme şansı hâlâ var, liste henüz yok.
    expect(container.querySelector(".pop-empty")!.textContent).toBe("Yükleniyor…");

    await sure(1);
    expect(adlar(container)).toEqual(["main", "dev"]);
    expect(okunuyor(container)!.querySelector(".pill-count")!.textContent).toBe("…");
    expect(baslik(container), "okunurken basılabilir başlık olmamalı").toBe(null);

    await bitir(LISTE);
    expect(okunuyor(container)).toBe(null);
    expect(baslik(container)!.querySelector(".pill-count")!.textContent).toBe("2");
  });

  it("tam liste süre içinde gelirse tek seferde: '…' hiç görünmüyor", async () => {
    // Çoğu depo böyle; iki aşama burada bir kare "…" gösterip sayıya dönerdi.
    const { container, bitir } = yavasTam();
    await sure(REMOTES_GRACE_MS - 50);
    // Yerel liste çoktan geldi ama çizilmedi: tam liste hâlâ bekleniyor.
    expect(okunuyor(container)).toBe(null);
    expect(container.querySelector(".pop-empty")!.textContent).toBe("Yükleniyor…");
    await bitir(LISTE);
    expect(baslik(container)!.querySelector(".pill-count")!.textContent).toBe("2");

    // Süre sonradan dolsa da yerel listeye geri dönülmüyor.
    await sure(100);
    expect(okunuyor(container)).toBe(null);
    expect(baslik(container)).not.toBe(null);
  });

  it("okunurken arama boş dönse de 'Dal bulunamadı' demiyor", async () => {
    const { container, bitir } = yavasTam();
    await sure(REMOTES_GRACE_MS);
    fireEvent.change(container.querySelector(".pop-search")!, { target: { value: "yeni" } });

    expect(container.querySelector(".pop-empty"), "henüz bilmiyoruz, 'yok' denmemeli").toBe(null);
    expect(okunuyor(container)).not.toBe(null);

    await bitir(LISTE);
    expect(adlar(container)).toEqual(["yeni-ozellik"]);
  });

  it("tam okuma düşerse gelmiş yerel liste korunuyor", async () => {
    // Boş listeyle ezmek, elde olan dalları "Dal bulunamadı" diye gizlerdi.
    vi.spyOn(api, "gitBranches").mockImplementation((_path, remotes) =>
      remotes
        ? new Promise<GitBranch[]>((_, reject) =>
            setTimeout(() => reject(new Error("git yok")), REMOTES_GRACE_MS * 2),
          )
        : Promise.resolve(LISTE.filter((b) => !b.remote)),
    );
    const { container } = render(<BranchPicker cwd="/depo" current="main" onClose={vi.fn()} />);
    await sure(REMOTES_GRACE_MS * 2);

    expect(adlar(container)).toEqual(["main", "dev"]);
    expect(okunuyor(container), "düşen okuma hâlâ 'okunuyor' gösteriyor").toBe(null);
    expect(container.querySelector(".pop-empty")).toBe(null);
  });

  it("eski ikili yerel çağrıya her şeyi dönse de ilk aşama yalnızca yerel", async () => {
    // Geliştirmede arayüz HMR'la yenileniyor, Rust ancak uygulama yeniden
    // başlatılınca: yeni arayüz eski ikiliyle bir süre birlikte çalışıyor.
    const { container } = yavasTam({ eskiIkili: true });
    await sure(REMOTES_GRACE_MS);

    expect(adlar(container)).toEqual(["main", "dev"]);
    expect(okunuyor(container)).not.toBe(null);
  });
});
