// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLanguage } from "../lib/i18n";
import { setPlatform } from "../lib/platform";
import { useStore } from "../store/useStore";
import type { Favorite } from "../types";
import { FavoritesPanel } from "./FavoritesPanel";

/**
 * Favorilerin klasörlenmesi — panel tarafı.
 *
 * Sıra ve klasör matematiği `lib/favoriteGroups.ts` içinde ve orada ayrıca
 * test ediliyor. Burada ölçülen şey BAĞLANTI: başlıklar çiziliyor mu, sürükle
 * bırak doğru hedefi bildiriyor mu. Saf mantığın doğru olması, arayüzün onu
 * çağırdığı anlamına gelmiyor — bu depoda sürükle-bırak bir kez tam olarak
 * böyle sessizce çalışmamıştı (bkz. `dnd.test.tsx`).
 */

function fav(id: string, folder: string | null, command = `cmd-${id}`): Favorite {
  return {
    id,
    command,
    label: null,
    note: null,
    groupId: null,
    folder,
    cwd: null,
    alias: null,
    createdAt: 0,
    usedCount: 0,
    lastUsedAt: null,
  };
}

const LIST = [fav("a", "Yayın"), fav("b", "Yayın"), fav("c", null)];

function seed(favorites: Favorite[] = LIST) {
  useStore.setState({ ready: true, favorites, groups: [], activeGroupId: null });
}

/** Sürüklemenin gerektirdiği asgari `dataTransfer`. */
const transfer = { effectAllowed: "", setData: () => {}, getData: () => "" };

beforeEach(() => {
  setLanguage("tr");
  setPlatform("windows");
});

afterEach(() => {
  cleanup();
  useStore.setState({ favorites: [] });
});

describe("klasör başlıkları", () => {
  it("her klasör kendi başlığıyla çiziliyor", () => {
    seed();
    const { container } = render(<FavoritesPanel />);
    const adlar = [...container.querySelectorAll(".fav-folder-name")].map((e) =>
      e.textContent?.trim(),
    );
    expect(adlar).toEqual(["Yayın", "Gruplanmamış"]);
  });

  it("başlıkta o klasördeki sayı yazıyor", () => {
    seed();
    const { container } = render(<FavoritesPanel />);
    const sayilar = [...container.querySelectorAll(".fav-folder-count")].map((e) =>
      e.textContent?.trim(),
    );
    expect(sayilar).toEqual(["2", "1"]);
  });

  it("klasör yoksa tek başlık kalıyor", () => {
    // Liste düz de kullanılabilmeli; klasör bir zorunluluk değil.
    seed([fav("a", null), fav("b", null)]);
    const { container } = render(<FavoritesPanel />);
    expect(container.querySelectorAll(".fav-folder-name")).toHaveLength(1);
  });
});

describe("sürükleyerek taşıma", () => {
  it("satıra bırakmak 'bunun önüne' diyor", () => {
    seed();
    const moveFavoriteTo = vi.fn();
    useStore.setState({ moveFavoriteTo });

    const { container } = render(<FavoritesPanel />);
    const rows = [...container.querySelectorAll(".fav-item")];
    fireEvent.dragStart(rows[2], { dataTransfer: transfer });
    fireEvent.dragOver(rows[0], { dataTransfer: transfer });
    fireEvent.drop(rows[0], { dataTransfer: transfer });

    expect(moveFavoriteTo).toHaveBeenCalledWith("c", { folder: "Yayın", beforeId: "a" });
  });

  it("başlığa bırakmak klasörün sonuna diyor", () => {
    // Boş bir klasöre ya da bir bölümün sonuna taşımanın tek yolu bu.
    seed();
    const moveFavoriteTo = vi.fn();
    useStore.setState({ moveFavoriteTo });

    const { container } = render(<FavoritesPanel />);
    const rows = [...container.querySelectorAll(".fav-item")];
    const bolumler = [...container.querySelectorAll(".fav-section")];
    fireEvent.dragStart(rows[0], { dataTransfer: transfer });
    fireEvent.dragOver(bolumler[1], { dataTransfer: transfer });
    fireEvent.drop(bolumler[1], { dataTransfer: transfer });

    expect(moveFavoriteTo).toHaveBeenCalledWith("a", { folder: null, beforeId: null });
  });

  it("sürükleme başlamadan bırakma işlemiyor", () => {
    // Panelin dışından gelen bir sürükleme (dosya, metin) favorileri
    // karıştırmamalı.
    seed();
    const moveFavoriteTo = vi.fn();
    useStore.setState({ moveFavoriteTo });

    const { container } = render(<FavoritesPanel />);
    fireEvent.drop(container.querySelector(".fav-item")!, { dataTransfer: transfer });

    expect(moveFavoriteTo).not.toHaveBeenCalled();
  });

  it("sürüklenen satır işaretleniyor", () => {
    // Görsel geri bildirim olmadan kullanıcı sürüklemenin başladığını
    // anlamıyor ve tıklama sanıp bırakıyor.
    seed();
    const { container } = render(<FavoritesPanel />);
    const rows = [...container.querySelectorAll(".fav-item")];
    fireEvent.dragStart(rows[0], { dataTransfer: transfer });
    expect(rows[0].className).toContain("dragging");
  });
});

/**
 * Grupları daraltma.
 *
 * Durum AYARDA tutuluyor, bileşen durumunda değil: paneli kapatıp açmak ya da
 * uygulamayı yeniden başlatmak daraltılanları geri getirmemeli. Sekme
 * gruplarının daraltma durumu da aynı sebeple kalıcı.
 */
describe("grupları daraltma", () => {
  function seedCollapsed(folders: string[]) {
    const state = useStore.getState();
    useStore.setState({
      ready: true,
      favorites: LIST,
      groups: [],
      activeGroupId: null,
      settings: {
        ...state.settings,
        appearance: { ...state.settings.appearance, collapsedFavoriteFolders: folders },
      },
    });
  }

  it("daraltılan grubun kayıtları çizilmiyor", () => {
    seedCollapsed(["Yayın"]);
    const { container } = render(<FavoritesPanel />);
    // "Yayın" iki kayıt taşıyordu; geriye yalnızca gruplanmamıştaki bir tane.
    expect(container.querySelectorAll(".fav-item")).toHaveLength(1);
    // Başlık ve sayaç DURUYOR: kaç kayıt olduğu daraltılmışken de görünmeli.
    expect(container.querySelectorAll(".fav-folder-name")).toHaveLength(2);
  });

  it("gruplanmamış bölüm de daraltılabiliyor", () => {
    // Boş dize o bölümün anahtarı; gerçek bir grup adı asla boş olamıyor.
    seedCollapsed([""]);
    const { container } = render(<FavoritesPanel />);
    expect(container.querySelectorAll(".fav-item")).toHaveLength(2);
  });

  it("başlığa tıklamak durumu AYARA yazıyor", () => {
    seedCollapsed([]);
    const patchAppearance = vi.fn();
    useStore.setState({ patchAppearance });

    const { container } = render(<FavoritesPanel />);
    fireEvent.click(container.querySelector(".fav-folder")!);

    expect(patchAppearance).toHaveBeenCalledWith({ collapsedFavoriteFolders: ["Yayın"] });
  });

  it("ikinci tık daraltmayı kaldırıyor", () => {
    seedCollapsed(["Yayın"]);
    const patchAppearance = vi.fn();
    useStore.setState({ patchAppearance });

    const { container } = render(<FavoritesPanel />);
    fireEvent.click(container.querySelector(".fav-folder")!);

    expect(patchAppearance).toHaveBeenCalledWith({ collapsedFavoriteFolders: [] });
  });

  it("ARAMA sırasında daraltma yok sayılıyor", () => {
    /*
     * Aranan komut daraltılmış bir gruptaysa liste boş görünürdü ve arama
     * bozuk sanılırdı. Daraltma silinmiyor, yalnızca arama sürerken yok
     * sayılıyor.
     */
    seedCollapsed(["Yayın"]);
    const { container } = render(<FavoritesPanel />);
    expect(container.querySelectorAll(".fav-item")).toHaveLength(1);

    fireEvent.change(container.querySelector(".panel-controls input")!, {
      target: { value: "cmd" },
    });
    expect(container.querySelectorAll(".fav-item").length).toBeGreaterThan(1);
  });
});

/**
 * Hepsini daralt / hepsini aç.
 *
 * Karar TÜM gruplara göre veriliyor, ekranda görünenlere göre değil: süzgeç
 * ya da arama bazı bölümleri gizlemiş olabilir ve gizli olanların açık
 * kalması, süzgeç kalkınca beklenmedik bir liste açardı.
 */
describe("hepsini daralt", () => {
  function seedAll(folders: string[]) {
    const state = useStore.getState();
    useStore.setState({
      ready: true,
      favorites: LIST,
      groups: [],
      activeGroupId: null,
      settings: {
        ...state.settings,
        appearance: { ...state.settings.appearance, collapsedFavoriteFolders: folders },
      },
    });
  }

  /** Başlıklar da düğme olduğu için "hepsini daralt" onlardan ayrılmalı. */
  const toggleAll = (c: HTMLElement) =>
    c.querySelector<HTMLElement>(".panel-controls .icon-btn")!;

  it("biri bile açıksa hepsini kapatıyor", () => {
    seedAll(["Yayın"]);
    const patchAppearance = vi.fn();
    useStore.setState({ patchAppearance });

    const { container } = render(<FavoritesPanel />);
    fireEvent.click(toggleAll(container));

    // Gruplanmamış bölüm de kapanıyor; anahtarı boş dize.
    expect(patchAppearance).toHaveBeenCalledWith({
      collapsedFavoriteFolders: ["Yayın", ""],
    });
  });

  it("hepsi kapalıysa hepsini açıyor", () => {
    seedAll(["Yayın", ""]);
    const patchAppearance = vi.fn();
    useStore.setState({ patchAppearance });

    const { container } = render(<FavoritesPanel />);
    fireEvent.click(toggleAll(container));

    expect(patchAppearance).toHaveBeenCalledWith({ collapsedFavoriteFolders: [] });
  });

  it("tek bölüm varken düğme çizilmiyor", () => {
    // Yapacağı bir iş yok; her zaman duran bir düğme gürültü olurdu.
    const state = useStore.getState();
    useStore.setState({
      ready: true,
      favorites: [fav("a", null), fav("b", null)],
      groups: [],
      activeGroupId: null,
      settings: {
        ...state.settings,
        appearance: { ...state.settings.appearance, collapsedFavoriteFolders: [] },
      },
    });
    const { container } = render(<FavoritesPanel />);
    expect(container.querySelector(".panel-controls .icon-btn")).toBe(null);
  });
});
