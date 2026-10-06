// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLanguage } from "../lib/i18n";
import { api } from "../lib/ipc";
import { setPlatform } from "../lib/platform";
import { sessions, useStore } from "../store/useStore";
import type { Group, TabState } from "../types";
import { FilePanel } from "./FilePanel";

/**
 * Dosya sütununun kendi arama kutusu.
 *
 * ## Neden ağaç süzülmüyor
 *
 * Ağaç TEMBEL yükleniyor: her klasör yalnızca açıldığında okunuyor. Süzme
 * yalnızca yüklenmiş dalları görebilirdi, yani kullanıcı elle açmadığı bir
 * klasördeki dosya aramada hiç çıkmazdı — sessiz ve yanıltıcı. Bu yüzden
 * arama ayrı bir kaynağa bakıyor: `listFiles` özyineli düz liste veriyor
 * (Ctrl+P paletinin de kullandığı yol).
 *
 * Buradaki testler o kararın gözlenebilir sonuçlarını tutuyor: liste bir kez
 * okunuyor, sıralama en iyi eşleşmeyi öne alıyor ve kutu boşalınca sütun eski
 * hâline dönüyor.
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

function seed() {
  const state = useStore.getState();
  useStore.setState({
    ready: true,
    groups: [group()],
    activeGroupId: "g1",
    ui: { ...state.ui, treeOpen: true, viewerPath: null },
  });
}

/**
 * Ağaç GÖRÜNÜR mü.
 *
 * Ağaç artık koşullu daldan düşmüyor — sökülmüyor, gizleniyor (gerekçesi
 * `FilePanel`da: sökülünce açılmış dizinler kapanıyordu). Dolayısıyla ölçüt
 * "DOM'da var mı" değil, "görünür mü".
 */
function agacGorunur(container: HTMLElement): boolean {
  const wrap = container.querySelector(".file-tree-keep");
  return !!wrap && wrap.getAttribute("data-hidden") === "false";
}

/** Başlıktaki büyüteç: arama kutusunu açıp kapatan düğme. */
function buyutec(container: HTMLElement): HTMLButtonElement {
  const head = container.querySelector(".file-panel-head")!;
  return [...head.querySelectorAll("button")].find((el) => {
    const title = el.getAttribute("title") ?? "";
    return title === "Dosyalarda ara" || title === "Aramayı kapat";
  })! as HTMLButtonElement;
}

/** Arama kutusu; kapalıysa null. */
function kutu(container: HTMLElement): HTMLInputElement | null {
  return container.querySelector<HTMLInputElement>(".panel-controls input");
}

/**
 * Kutuya yazmak. Kutu artık sürekli durmuyor, o yüzden kapalıysa AÇIYOR —
 * testlerin her biri "büyütece bas, sonra yaz" adımını tekrar etmesin.
 *
 * `act`i KENDİSİ sarıyor ve bu şart: açma tıklaması çağıranın `act`i içinde
 * kalırsa React o geri çağırma dönene kadar akıtmıyor, dolayısıyla hemen
 * ardından kutuyu aramak `null` veriyordu. İki adım iki ayrı `act`.
 */
async function ara(container: HTMLElement, text: string) {
  if (!kutu(container)) {
    await act(async () => {
      fireEvent.click(buyutec(container));
    });
  }
  await act(async () => {
    fireEvent.change(kutu(container)!, { target: { value: text } });
  });
  return kutu(container)!;
}

/*
 * Depo EYLEMLERİ testler arasında geri yükleniyor.
 *
 * Aşağıdaki testlerden biri `openFile`/`insertPath`i sahtesiyle değiştiriyor
 * (`useStore.setState`). Depo modül düzeyinde yaşadığı için o değişiklik
 * dosyanın geri kalanına sızıyordu: gerçek `openFile`a ihtiyaç duyan bir test,
 * sıraya göre geçip geçmiyordu. Sahte eylem `vi.restoreAllMocks` kapsamında
 * DEĞİL — o yalnızca `vi.spyOn` ile kurulanları geri alıyor.
 */
const GERCEK = {
  openFile: useStore.getState().openFile,
  insertPath: useStore.getState().insertPath,
};

beforeEach(() => {
  setLanguage("tr");
  setPlatform("windows");
  useStore.setState({ ...GERCEK });
  // Ağaç da kendi çağrısını yapıyor; ikisi ayrı uçlar.
  vi.spyOn(api, "listEntries").mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  sessions.clear();
  vi.restoreAllMocks();
});

describe("dosya sütununda arama", () => {
  it("kutu kapalı başlıyor, düğmeyle açılıyor", async () => {
    // Kutu sürekli durduğunda ağaçtan bir satır yer çalıyordu; sütunun asıl
    // işi ağaç.
    seed();
    const { container } = render(<FilePanel />);
    expect(kutu(container), "kutu açık başlıyor").toBe(null);

    await act(async () => {
      fireEvent.click(buyutec(container));
    });

    const input = kutu(container);
    expect(input, "düğme kutuyu açmıyor").not.toBe(null);
    expect(input!.placeholder).toBe("Dosyalarda ara…");
    // Açan kullanıcı yazmak istiyor: odak kutuda olmalı, fareyi taşımasın.
    expect(document.activeElement, "odak kutuya gelmedi").toBe(input);

    // Başlığın ALTINDA: sütunun ilk denetimi.
    const head = container.querySelector(".file-panel-head")!;
    const controls = container.querySelector(".panel-controls")!;
    expect(
      head.compareDocumentPosition(controls) & Node.DOCUMENT_POSITION_FOLLOWING,
      "arama kutusu başlıktan önce",
    ).toBeTruthy();
  });

  it("büyüteç başlığın hemen yanında", () => {
    // İstenen yer bu: "DOSYALAR" yazısıyla birlikte okunuyor. Sütun eylemleri
    // (katlama, kapatma) esneyen boşluğun sağında kalıyor.
    seed();
    const { container } = render(<FilePanel />);
    const head = container.querySelector(".file-panel-head")!;
    const cocuklar = [...head.children];
    const baslik = cocuklar.findIndex((el) => el.classList.contains("file-panel-title"));
    const btn = cocuklar.indexOf(buyutec(container));
    const bosluk = cocuklar.findIndex((el) => el.classList.contains("file-panel-spacer"));
    expect(btn, "büyüteç başlıktan önce").toBeGreaterThan(baslik);
    expect(btn, "büyüteç esneyen boşluğun sağında").toBeLessThan(bosluk);
  });

  it("düğme ikinci basışta aramayı kapatıyor", async () => {
    seed();
    vi.spyOn(api, "listFiles").mockResolvedValue(["a/target.ts"]);
    const { container } = render(<FilePanel />);

    await ara(container, "target");
    await waitFor(() => expect(container.querySelector(".file-results")).not.toBe(null));

    await act(async () => {
      fireEvent.click(buyutec(container));
    });

    expect(kutu(container), "kutu kapanmadı").toBe(null);
    expect(container.querySelector(".file-results"), "sonuçlar duruyor").toBe(null);
    expect(agacGorunur(container), "ağaç geri gelmedi").toBe(true);
  });

  it("boşken ağaç duruyor, arama listesi yok", () => {
    seed();
    const { container } = render(<FilePanel />);
    expect(agacGorunur(container), "ağaç görünmüyor").toBe(true);
    expect(container.querySelector(".file-results"), "boş sorguda sonuç listesi var").toBe(null);
  });

  it("eşleşmeler en iyi ÖNCE sıralanıyor", async () => {
    seed();
    vi.spyOn(api, "listFiles").mockResolvedValue([
      "node_modules/e/n/v/i/r/o/n/m/e/n/t/x.js",
      "src/environments/environment.ts",
    ]);

    const { container } = render(<FilePanel />);
    await ara(container, "environment");

    await waitFor(() => expect(container.querySelector(".file-results")).not.toBe(null));
    const rows = [...container.querySelectorAll(".file-result")];
    // Tam alt dizi eşleşmesi ilk satırda; ters sıralama hatası burada yakalanır.
    expect(rows[0].getAttribute("title")).toContain("environments/environment.ts");
    // Ağaç bu sırada GİZLİ: sonuçlar onun yerini alıyor ama ağaç sökülmüyor.
    expect(agacGorunur(container), "arama sırasında ağaç görünür kaldı").toBe(false);
  });

  it("liste bir KEZ okunuyor, her tuşta değil", async () => {
    seed();
    const listFiles = vi.spyOn(api, "listFiles").mockResolvedValue(["a/target.ts", "b.ts"]);

    const { container } = render(<FilePanel />);
    await ara(container, "tar");
    await waitFor(() => expect(container.querySelector(".file-results")).not.toBe(null));

    // Yazmaya devam etmek diski yeniden gezmemeli.
    await ara(container, "targ");
    await ara(container, "target");
    expect(listFiles.mock.calls.length, "her tuşta dizin yeniden okunuyor").toBe(1);
  });

  it("eşleşme yoksa söylüyor", async () => {
    seed();
    vi.spyOn(api, "listFiles").mockResolvedValue(["a.ts", "b.ts"]);

    const { container } = render(<FilePanel />);
    await ara(container, "zzzq");

    await waitFor(() =>
      expect(container.textContent, "boş sonuç bildirilmiyor").toContain("Eşleşen dosya yok"),
    );
  });

  it("Escape aramayı kapatıyor ve ağaç geri geliyor", async () => {
    seed();
    vi.spyOn(api, "listFiles").mockResolvedValue(["a/target.ts"]);

    const { container } = render(<FilePanel />);
    await ara(container, "target");
    await waitFor(() => expect(container.querySelector(".file-results")).not.toBe(null));

    await act(async () => {
      fireEvent.keyDown(kutu(container)!, { key: "Escape" });
    });

    // Escape sorguyu boşaltmakla kalmıyor, kutuyu da kapatıyor: yarım kalmış
    // boş bir kutu bırakmak çıkışı tamamlamamak olurdu.
    expect(kutu(container), "kutu açık kaldı").toBe(null);
    expect(agacGorunur(container), "ağaç geri gelmedi").toBe(true);
  });

  /**
   * Doğru eylemin çağrıldığı: düz tıklama açıyor, Shift yolu ekliyor.
   *
   * İki tıklama AYRI çizimlerde. Bir arada denenmişti ve yanlıştı: düz
   * tıklama aramayı bitirdiği için liste kapanıyor, satır DOM'dan çıkıyor ve
   * ardından gelen Shift tıklaması hiçbir şeye ulaşmıyordu. Test o zaman
   * ürünü değil kendi kurgusunu ölçüyordu.
   */
  it.each([
    { ad: "düz tıklama dosyayı açıyor", shift: false, beklenen: "openFile" as const },
    { ad: "Shift yolu komut satırına ekliyor", shift: true, beklenen: "insertPath" as const },
  ])("$ad", async ({ shift, beklenen }) => {
    seed();
    vi.spyOn(api, "listFiles").mockResolvedValue(["src/target.ts"]);
    const openFile = vi.fn();
    const insertPath = vi.fn();
    useStore.setState({ openFile, insertPath });

    const { container } = render(<FilePanel />);
    await ara(container, "target");
    await waitFor(() => expect(container.querySelector(".file-result")).not.toBe(null));

    await act(async () => {
      fireEvent.click(container.querySelector<HTMLElement>(".file-result")!, { shiftKey: shift });
    });

    const cagrilan = beklenen === "openFile" ? openFile : insertPath;
    const otekisi = beklenen === "openFile" ? insertPath : openFile;
    expect(cagrilan, `${beklenen} çağrılmadı`).toHaveBeenCalledTimes(1);
    expect(cagrilan.mock.calls[0][0]).toContain("target.ts");
    expect(otekisi, "yanlış eylem çağrıldı").not.toHaveBeenCalled();
  });

  it("sonuca tıklamak DETAYI yanında açıyor, liste yerinde kalıyor", async () => {
    /*
     * BİLDİRİLEN HATA: "aradığım dosyaya tıklıyorum, detayı açılmıyor."
     *
     * Sebep sütunun çizim sırasıydı: görüntüleyici ve sonuç listesi AYNI yeri
     * paylaşıyordu ve sorgu doluyken liste kazanıyordu. O zamanki çözüm seçimde
     * aramayı kapatmaktı.
     *
     * Görüntüleyici artık sütunun YANINDA açılıyor; yer paylaşımı yok, seçim
     * aramayı kapatmak zorunda değil. Liste kalıyor ki adaylar arasında
     * tıklayarak gezilebilsin; açık olanın satırı işaretli.
     *
     * Bu test bir üsttekinin YAKALAYAMADIĞI şeyi ölçüyor: orada `openFile`
     * sahtesiyle değiştirildiği için depo hiç güncellenmiyor ve ekranda ne
     * olduğu görülmüyor. Burada GERÇEK eylem koşuyor ve iddia çizilen şey.
     */
    seed();
    vi.spyOn(api, "listFiles").mockResolvedValue(["src/target.ts", "src/other.ts"]);
    // Görüntüleyici içeriği okumaya çalışacak; okunamayan dosya da görüntüleyici
    // kabuğunu çizdiriyor, ölçtüğümüz şey o.
    vi.spyOn(api, "readTextFile").mockResolvedValue(null);

    const { container } = render(<FilePanel />);
    await ara(container, "target");
    await waitFor(() => expect(container.querySelector(".file-result")).not.toBe(null));

    await act(async () => {
      fireEvent.click(container.querySelector<HTMLElement>(".file-result")!);
    });

    expect(useStore.getState().ui.viewerPath, "dosya yolu ayarlanmadı").toContain("target.ts");
    await waitFor(() =>
      expect(container.querySelector(".file-viewer-pane .viewer"), "detay açılmadı").not.toBe(null),
    );
    // Görüntüleyici sütunun İÇİNDE değil, yanında.
    expect(container.querySelector(".file-panel .viewer"), "görüntüleyici sütunun içinde").toBe(null);
    expect(kutu(container)?.value, "arama kapanmış").toBe("target");
    const row = container.querySelector(".file-result");
    expect(row?.getAttribute("aria-current"), "açık dosyanın satırı işaretli değil").toBe("true");
  });

  it("Shift ile eklemek aramayı KAPATMIYOR", async () => {
    // Arka arkaya birkaç yol eklemek isteyen kullanıcıyı her seferinde yeniden
    // aramaya zorlamamak için: Shift yol ekliyor, liste yerinde kalıyor.
    seed();
    vi.spyOn(api, "listFiles").mockResolvedValue(["src/target.ts"]);

    const { container } = render(<FilePanel />);
    await ara(container, "target");
    await waitFor(() => expect(container.querySelector(".file-result")).not.toBe(null));

    await act(async () => {
      fireEvent.click(container.querySelector<HTMLElement>(".file-result")!, { shiftKey: true });
    });

    expect(kutu(container)!.value, "sorgu kaybolmuş").toBe("target");
    expect(container.querySelector(".file-results"), "liste kapanmış").not.toBe(null);
  });

  it("tuşlar genel kısayol yakalayıcısına SIZMIYOR", () => {
    /*
     * Uygulamanın kısayolları pencere düzeyinde dinleniyor (bkz. `App.tsx`).
     * Kutuya yazılan harfler oraya ulaşırsa "n" yeni sekme açar, "t" başka bir
     * şey yapar — kutu kullanılamaz hâle gelir. Olay kutuda durdurulmalı.
     */
    seed();
    const { container } = render(<FilePanel />);
    fireEvent.click(buyutec(container));
    const input = kutu(container)!;

    const pencereye = vi.fn();
    window.addEventListener("keydown", pencereye);
    fireEvent.keyDown(input, { key: "n" });
    window.removeEventListener("keydown", pencereye);

    expect(pencereye, "tuş pencereye sızdı").not.toHaveBeenCalled();
  });
});
