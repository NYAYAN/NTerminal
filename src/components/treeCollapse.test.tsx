// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLanguage } from "../lib/i18n";
import { api } from "../lib/ipc";
import { setPlatform } from "../lib/platform";
import { useStore } from "../store/useStore";
import type { DirEntry, Group, TabState } from "../types";
import { FilePanel } from "./FilePanel";

/**
 * Ağacın açılma durumu ve toplu katlama.
 *
 * ## İki bildirilen hata bir arada
 *
 * 1. "Dizinleri aça aça en alta indim, bir dosyaya tıkladım, geri bastığımda
 *    açtığım dizinler kapanmış oluyor." Durum her `Level` bileşeninin yerel
 *    `useState`inde yaşıyordu; görüntüleyici çizilirken ağaç sökülüyor ve o
 *    durumun tamamı gidiyordu.
 * 2. "Değişikliklerde olan tümünü daralt düğmesini dosyalara da ekleyelim."
 *    Böyle bir düğme ağacın TAMAMINI görmek zorunda, yani durum bileşenlerin
 *    dışında olmalı.
 *
 * İkisinin de çözümü aynı: açık klasörler `ui.treeExpanded` içinde, mutlak
 * yollarla.
 *
 * ## "Tümünü genişlet" neden yok
 *
 * Ağaç tembel yükleniyor; "tümü" tüm dizin ağacını diskten yürümek demek.
 * Düğmenin ikinci durumu bu yüzden "geri aç": daraltmadan önceki hâli
 * getiriyor.
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

function seed(expanded: string[] = []) {
  const state = useStore.getState();
  useStore.setState({
    ready: true,
    groups: [group()],
    activeGroupId: "g1",
    ui: { ...state.ui, treeOpen: true, viewerPath: null, treeExpanded: expanded },
  });
}

/**
 * Sahte dizin ağacı: `src/` içinde `lib/`, onun içinde bir dosya.
 *
 * İki kademe şart: hatanın kendisi DERİN bir dalda görünüyordu ve tek
 * kademeli bir ağaç iç içe `Level`lerin durumunu hiç sınamıyor.
 */
const AGAC: Record<string, DirEntry[]> = {
  [CWD]: [{ name: "src", dir: true }],
  [`${CWD}/src`]: [{ name: "lib", dir: true }],
  [`${CWD}/src/lib`]: [{ name: "format.ts", dir: false }],
};

/** Katlama düğmesi; yoksa null. */
function katlaButonu(container: HTMLElement): HTMLButtonElement | null {
  const head = container.querySelector(".file-panel-head")!;
  return (
    [...head.querySelectorAll("button")].find((el) => {
      const title = el.getAttribute("title") ?? "";
      return title === "Tüm klasörleri daralt" || title === "Klasörleri geri aç";
    }) ?? null
  );
}

/** Ağaçtaki bir satırı ada göre bul. */
function satir(container: HTMLElement, ad: string): HTMLElement | undefined {
  return [...container.querySelectorAll<HTMLElement>(".tree-row")].find(
    (el) => el.textContent?.trim() === ad,
  );
}

beforeEach(() => {
  setLanguage("tr");
  setPlatform("windows");
  vi.spyOn(api, "listEntries").mockImplementation(async (p: string) => AGAC[p] ?? []);
  vi.spyOn(api, "readTextFile").mockResolvedValue(null);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ağacın açılma durumu", () => {
  it("mutlak yolla tutuluyor", async () => {
    // Ada göre tutulduğunda aynı adlı iki alt klasör (`src/lib`, `test/lib`)
    // birbirini açıyordu.
    seed();
    const { container } = render(<FilePanel />);
    await waitFor(() => expect(satir(container, "src")).not.toBe(undefined));

    await act(async () => {
      fireEvent.click(satir(container, "src")!);
    });
    expect(useStore.getState().ui.treeExpanded).toEqual([`${CWD}/src`]);
  });

  it("dosya açıp geri dönünce açık kalıyor", async () => {
    /*
     * BİLDİRİLEN HATA tam olarak bu akış. Ölçüt ekranda: geri döndükten sonra
     * DERİN satır (`format.ts`) hâlâ çizili olmalı — yani `src` ve `src/lib`
     * açık kalmış olmalı.
     */
    seed([`${CWD}/src`, `${CWD}/src/lib`]);
    const { container } = render(<FilePanel />);
    await waitFor(() => expect(satir(container, "format.ts")).not.toBe(undefined));

    // Dosyaya tıkla → görüntüleyici.
    await act(async () => {
      fireEvent.click(satir(container, "format.ts")!);
    });
    await waitFor(() => expect(container.querySelector(".viewer")).not.toBe(null));

    // Geri → ağaç, açık hâliyle.
    await act(async () => {
      fireEvent.click(container.querySelector<HTMLElement>(".viewer-back")!);
    });

    expect(useStore.getState().ui.treeExpanded, "açık klasörler kaybolmuş").toEqual([
      `${CWD}/src`,
      `${CWD}/src/lib`,
    ]);
    await waitFor(() =>
      expect(satir(container, "format.ts"), "derin satır geri gelmedi").not.toBe(undefined),
    );
  });
});

describe("toplu katlama düğmesi", () => {
  it("açık klasör yokken çizilmiyor", () => {
    // Yapacağı iş olmayan düğme gürültü — öteki panellerde de aynı kural.
    seed();
    const { container } = render(<FilePanel />);
    expect(katlaButonu(container), "boş ağaçta düğme duruyor").toBe(null);
  });

  it("tek basışta hepsini daraltıyor", async () => {
    seed([`${CWD}/src`, `${CWD}/src/lib`]);
    const { container } = render(<FilePanel />);
    await waitFor(() => expect(satir(container, "format.ts")).not.toBe(undefined));

    await act(async () => {
      fireEvent.click(katlaButonu(container)!);
    });

    expect(useStore.getState().ui.treeExpanded).toEqual([]);
    expect(satir(container, "src"), "kök satırı da gitmiş").not.toBe(undefined);
    expect(satir(container, "format.ts"), "derin satır hâlâ çizili").toBe(undefined);
  });

  it("ikinci basış daraltmadan ÖNCEKİ hâli geri açıyor", async () => {
    // "Tümünü genişlet" değil: tembel ağaçta "tümü" diye bir sınır yok.
    // Kullanıcının istediği iş toplayıp kaldığı yere dönmek.
    seed([`${CWD}/src`, `${CWD}/src/lib`]);
    const { container } = render(<FilePanel />);
    await waitFor(() => expect(satir(container, "format.ts")).not.toBe(undefined));

    await act(async () => {
      fireEvent.click(katlaButonu(container)!);
    });
    expect(katlaButonu(container)!.getAttribute("title")).toBe("Klasörleri geri aç");

    await act(async () => {
      fireEvent.click(katlaButonu(container)!);
    });

    expect(useStore.getState().ui.treeExpanded).toEqual([`${CWD}/src`, `${CWD}/src/lib`]);
    await waitFor(() =>
      expect(satir(container, "format.ts"), "derin satır geri açılmadı").not.toBe(undefined),
    );
  });

  it("ağaç görünmüyorken çizilmiyor", async () => {
    // Görüntüleyici açıkken katlanacak bir şey ekranda yok.
    seed([`${CWD}/src`]);
    useStore.setState({
      ui: { ...useStore.getState().ui, viewerPath: `${CWD}/src/lib/format.ts` },
    });
    const { container } = render(<FilePanel />);
    await waitFor(() => expect(container.querySelector(".viewer")).not.toBe(null));
    expect(katlaButonu(container), "görüntüleyicide düğme duruyor").toBe(null);
  });
});
