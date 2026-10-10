// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Design } from "../lib/design";
import { setLanguage } from "../lib/i18n";
import { useStore } from "../store/useStore";
import type { Group, TabState } from "../types";
import { GroupRail } from "./GroupRail";
import { GroupSidebar } from "./GroupSidebar";

/**
 * Kokpit'in grup rayında sağ tık ve sürükle-bırak.
 *
 * İSTEKLER: "kokpit yapısında solda gruplar yer alıyor, sağ tıklama ile
 * işlemler yapabilmeliyim" ve "kokpit yapısında projeleri sürükle bırak ile
 * yer değiştirmek önemli". Ray yalnızca tıklayınca grup değiştiriyordu; sağ
 * tık hiçbir şey açmıyordu, sıralamanın yolu da yoktu.
 */

function tab(id: string): TabState {
  return {
    id,
    title: id,
    customTitle: null,
    profileId: "p1",
    cwd: null,
    createdAt: 0,
    lastActiveAt: 0,
    hasScrollback: false,
    lastCommand: null,
    locked: false,
  };
}

function group(id: string, patch: Partial<Group> = {}): Group {
  const tabs = [tab(`${id}-t`)];
  return {
    id,
    name: id,
    color: null,
    icon: null,
    collapsed: false,
    favorite: false,
    ungrouped: false,
    defaultProfileId: null,
    defaultCwd: null,
    env: {},
    activeTabId: tabs[0].id,
    tabs,
    ...patch,
  };
}

const loose = () => group("loose", { ungrouped: true, name: "" });

const initial = useStore.getState();

function seed(groups: Group[], design: Design = "kokpit", railExpanded = false) {
  const s = initial.settings;
  useStore.setState({
    groups,
    activeGroupId: groups.find((g) => !g.ungrouped)?.id ?? null,
    settings: { ...s, appearance: { ...s.appearance, design, railExpanded } },
    ui: { ...initial.ui, settingsOpen: false, editingGroupId: null },
  });
}

const order = () =>
  useStore
    .getState()
    .groups.map((g) => g.id)
    .join(",");
const byId = (id: string) => useStore.getState().groups.find((g) => g.id === id)!;
const tiles = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>(".grail-item")];
const menuLabels = () =>
  [...document.querySelectorAll(".ctx-menu .ctx-label")].map((el) => el.textContent);
const menuItem = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>(".ctx-menu button.ctx-item")].find(
    (el) => el.querySelector(".ctx-label")?.textContent === label,
  )!;
const popover = () => document.querySelector<HTMLElement>(".grail-pop");
const tip = () => document.querySelector<HTMLElement>(".grail-tip");
/** Ad kutusunu tek yoldan, sağ tık menüsünden açar (çift tık açmıyor). */
function openRename(c: HTMLElement, index: number) {
  fireEvent.contextMenu(tiles(c)[index]);
  fireEvent.click(menuItem("Adı değiştir…"));
}
const renameBox = () => document.querySelector<HTMLInputElement>(".grail-pop input.rename-input");

/** jsdom ölçü yapmıyor: karoları 40px yükseklik, 10px aralıkla diziyoruz. */
function layOut(c: HTMLElement) {
  tiles(c).forEach((el, i) => {
    const top = 12 + i * 50;
    el.getBoundingClientRect = () =>
      ({ left: 10, top, width: 40, height: 40, right: 50, bottom: top + 40, x: 10, y: top }) as DOMRect;
  });
}

/** HTML5 sürükleme olayları `dataTransfer` bekliyor; jsdom'da yok. */
function dataTransfer() {
  const data = new Map<string, string>();
  return {
    effectAllowed: "none",
    dropEffect: "none",
    setData: (format: string, value: string) => void data.set(format, value),
    getData: (format: string) => data.get(format) ?? "",
    setDragImage: () => {},
    types: [] as string[],
    items: [] as unknown[],
    files: [] as unknown[],
    clearData: () => void data.clear(),
  };
}

/** `dragover`ı koordinatıyla gönderir (jsdom `DragEvent`te `clientY`yi kaybediyor). */
function dragOverAt(el: Element, dt: ReturnType<typeof dataTransfer>, clientY: number) {
  const event = new MouseEvent("dragover", { bubbles: true, cancelable: true, clientX: 30, clientY });
  Object.defineProperty(event, "dataTransfer", { value: dt });
  return fireEvent(el, event);
}

beforeEach(() => {
  setLanguage("tr");
});

afterEach(() => {
  cleanup();
  useStore.setState({
    groups: [],
    activeGroupId: null,
    settings: initial.settings,
    ui: initial.ui,
    addTab: initial.addTab,
    addLooseTab: initial.addLooseTab,
    deleteGroup: initial.deleteGroup,
    patchAppearance: initial.patchAppearance,
  });
});

// -------------------------------------------------------------- sağ tık

describe("Kokpit rayı: sağ tık menüsü", () => {
  it("karoda grubun menüsü açılıyor; katlama satırları yok", () => {
    seed([group("g1"), group("g2")]);
    const { container } = render(<GroupRail />);
    fireEvent.contextMenu(tiles(container)[0]);

    expect(menuLabels()).toEqual([
      "Adı değiştir…",
      "Favori gruba ekle",
      "Rengi değiştir",
      "Grup ayarları…",
      "Bu gruba yeni sekme",
      "Yukarı taşı",
      "Aşağı taşı",
      "Grubu sil",
    ]);
    // Sağ tık grubu değiştirmiyor; menü yalnızca o karoya ait.
    expect(useStore.getState().activeGroupId).toBe("g1");
    // Rayda çift tık adı değiştirmiyor; menü bunu söz vermemeli.
    expect(menuItem("Adı değiştir…").querySelector(".ctx-hint")).toBeNull();
  });

  it("eylemler sağ tıklanan gruba uygulanıyor", () => {
    const addTab = vi.fn();
    const deleteGroup = vi.fn();
    seed([group("g1"), group("g2"), group("g3")]);
    useStore.setState({ addTab, deleteGroup } as never);
    const { container } = render(<GroupRail />);
    const open = () => fireEvent.contextMenu(tiles(container)[1]);

    open();
    fireEvent.click(menuItem("Bu gruba yeni sekme"));
    expect(addTab).toHaveBeenCalledWith({ groupId: "g2" });

    open();
    fireEvent.click(menuItem("Favori gruba ekle"));
    expect(byId("g2").favorite).toBe(true);

    open();
    fireEvent.click(menuItem("Aşağı taşı"));
    expect(order()).toBe("g1,g3,g2");

    open(); // g3 artık ikinci sırada
    fireEvent.click(menuItem("Grubu sil"));
    expect(deleteGroup).toHaveBeenCalledWith("g3");

    open();
    fireEvent.click(menuItem("Grup ayarları…"));
    expect(useStore.getState().ui.settingsOpen).toBe(true);
    expect(useStore.getState().ui.editingGroupId).toBe("g3");
  });

  it("kovanın hemen altındaki grup yukarı taşınamıyor", () => {
    // Kova hep en üstte (`moveGroupTo`); satır açık kalsa hiçbir şey yapmazdı.
    seed([loose(), group("g1"), group("g2")]);
    const { container } = render(<GroupRail />);
    fireEvent.contextMenu(tiles(container)[1]);
    expect(menuItem("Yukarı taşı").disabled).toBe(true);
    expect(menuItem("Aşağı taşı").disabled).toBe(false);
  });

  it("gruplanmamış kovanın menüsünde yalnızca yeni sekme var", () => {
    const addLooseTab = vi.fn();
    seed([loose(), group("g1")]);
    useStore.setState({ addLooseTab } as never);
    const { container } = render(<GroupRail />);

    fireEvent.contextMenu(tiles(container)[0]);
    expect(menuLabels()).toEqual(["Yeni sekme"]);
    fireEvent.click(menuItem("Yeni sekme"));
    expect(addLooseTab).toHaveBeenCalledTimes(1);

    fireEvent.doubleClick(tiles(container)[0]);
    expect(popover()).toBeNull();
  });
});

// ------------------------------------------------------------- adlandırma

describe("Kokpit rayı: karonun yanında ad ve renk", () => {
  it("menüden adlandırma: kutu grubun adıyla ve ODAKLI açılıyor, Enter kaydediyor", () => {
    seed([group("g1", { name: "NTerminal" }), group("g2", { name: "CopyBoard" })]);
    const { container } = render(<GroupRail />);
    const tile = tiles(container)[1];
    // Menü kapanırken odağı açıldığı yere (karoya) geri veriyor; kutu o
    // odağa yenilirse "odak kaçtı" sayılıp hemen kapanıyordu.
    tile.focus();
    fireEvent.contextMenu(tile);
    fireEvent.click(menuItem("Adı değiştir…"));

    expect(renameBox()?.value).toBe("CopyBoard");
    expect(document.activeElement, "odak kutuda değil").toBe(renameBox());
    expect(tile.classList.contains("editing")).toBe(true);

    fireEvent.change(renameBox()!, { target: { value: "  Pano  " } });
    fireEvent.keyDown(renameBox()!, { key: "Enter" });
    expect(byId("g2").name).toBe("Pano");
    expect(popover()).toBeNull();
    // Adlandırmak grubu değiştirmiyor.
    expect(useStore.getState().activeGroupId).toBe("g1");
  });

  it("Esc vazgeçiyor; kutu sökülürken gelen odak kaybı kaydetmiyor", () => {
    seed([group("g1", { name: "NTerminal" })]);
    const { container } = render(<GroupRail />);
    openRename(container, 0);
    const box = renameBox()!;
    fireEvent.change(box, { target: { value: "yarım" } });
    // Odaklı kutu sökülürken tarayıcı odak kaybı bildirebiliyor; o an kutu
    // henüz ağaçta. Aynı `act` içinde: Esc'nin kapatması çizilmeden önce.
    act(() => {
      fireEvent.keyDown(box, { key: "Escape" });
      fireEvent.blur(box);
    });
    expect(byId("g1").name).toBe("NTerminal");
    expect(popover()).toBeNull();
  });

  it("odak kaybı kaydediyor; boş ad yok sayılıyor", () => {
    seed([group("g1", { name: "NTerminal" })]);
    const { container } = render(<GroupRail />);

    openRename(container, 0);
    fireEvent.change(renameBox()!, { target: { value: "Terminal" } });
    fireEvent.blur(renameBox()!);
    expect(byId("g1").name).toBe("Terminal");

    openRename(container, 0);
    fireEvent.change(renameBox()!, { target: { value: "   " } });
    fireEvent.blur(renameBox()!);
    expect(byId("g1").name).toBe("Terminal");
  });

  it("renk: seçmek kapatmıyor, dışarı tıklamak ve Esc kapatıyor", () => {
    seed([group("g1"), group("g2")]);
    const { container } = render(<GroupRail />);
    const openColor = () => {
      fireEvent.contextMenu(tiles(container)[1]);
      fireEvent.click(menuItem("Rengi değiştir"));
    };

    openColor();
    const swatches = [...popover()!.querySelectorAll<HTMLButtonElement>(".swatch:not(.clear)")];
    fireEvent.click(swatches[1]);
    expect(byId("g2").color).toBe("#3fb950");
    expect(popover(), "renk seçmek kutuyu kapattı").not.toBeNull();
    fireEvent.mouseDown(popover()!.querySelector(".swatch")!);
    expect(popover(), "kutunun içine basmak onu kapattı").not.toBeNull();

    fireEvent.mouseDown(document.body);
    expect(popover()).toBeNull();

    openColor();
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(popover()).toBeNull();
  });
});

describe("Kokpit rayı: çift tık, ipucu ve geniş ray", () => {
  it("çift tık ad kutusu AÇMIYOR, yalnızca grubu seçiyor", () => {
    // İSTEK: "çift tık yaptığımda grubun adını değiştirme geliyor, gelmesin."
    seed([group("g1"), group("g2")]);
    const { container } = render(<GroupRail />);
    fireEvent.click(tiles(container)[1]);
    fireEvent.click(tiles(container)[1]);
    fireEvent.doubleClick(tiles(container)[1]);
    expect(popover()).toBeNull();
    expect(useStore.getState().activeGroupId).toBe("g2");
  });

  it("ad ipucu üzerine gelir gelmez çıkıyor, ayrılınca kalkıyor", () => {
    // İSTEK: "grubun adı tooltip olarak geliyor ama geç görünüyor." Yerel
    // `title` yok: onun gecikmesi değiştirilemiyor ve ikisi üst üste çıkardı.
    seed([group("g1", { name: "NTerminal" }), group("g2", { name: "CopyBoard" })]);
    const { container } = render(<GroupRail />);
    const tile = tiles(container)[1];
    expect(tile.hasAttribute("title")).toBe(false);
    expect(tile.getAttribute("aria-label")).toBe("CopyBoard");

    fireEvent.mouseEnter(tile);
    expect(tip()?.textContent).toBe("CopyBoard");
    fireEvent.mouseLeave(tile);
    expect(tip()).toBeNull();

    // Klavyeyle gelen de görüyor.
    fireEvent.focus(tiles(container)[0]);
    expect(tip()?.textContent).toBe("NTerminal");
    fireEvent.blur(tiles(container)[0]);
    expect(tip()).toBeNull();
  });

  it("sağ tık ve sürükleme ipucunu kaldırıyor", () => {
    seed([group("g1"), group("g2")]);
    const { container } = render(<GroupRail />);
    fireEvent.mouseEnter(tiles(container)[0]);
    fireEvent.contextMenu(tiles(container)[0]);
    expect(tip()).toBeNull();

    fireEvent.mouseEnter(tiles(container)[1]);
    fireEvent.dragStart(tiles(container)[1], { dataTransfer: dataTransfer() });
    expect(tip()).toBeNull();
  });

  it("araç düğmelerinin de ipucu anında", () => {
    seed([group("g1")]);
    const { container, getByLabelText } = render(<GroupRail />);
    const changes = getByLabelText("Değişiklikler");
    expect(changes.hasAttribute("title")).toBe(false);
    fireEvent.mouseEnter(changes);
    expect(tip()?.textContent).toBe("Değişiklikler");
    expect(container.querySelector(".grail.expanded")).toBeNull();
  });

  it("geniş rayda adlar karonun yanında; ipucu yok", () => {
    // İSTEK: "grubu genişlet daralt da yapabilir miyiz? (bu sayede grup
    // isimlerini tam görme de olmuş olur)".
    seed([loose(), group("g1", { name: "NTerminal" }), group("g2", { name: "CopyBoard" })], "kokpit", true);
    const { container } = render(<GroupRail />);
    expect(container.querySelector(".grail.expanded")).not.toBeNull();
    const names = [...container.querySelectorAll(".grail-item .grail-name")].map((e) => e.textContent);
    expect(names).toEqual(["Gruplanmamış", "NTerminal", "CopyBoard"]);
    expect(container.querySelector(".grail-add .grail-name")?.textContent).toBe("Yeni grup");

    fireEvent.mouseEnter(tiles(container)[1]);
    expect(tip(), "ad yazılıyken ipucu tekrar ediyor").toBeNull();
  });

  it("daraltılmış rayda ad yazılmıyor: karoda yalnızca baş harfler", () => {
    seed([group("g1", { name: "NTerminal" })]);
    const { container } = render(<GroupRail />);
    expect(container.querySelector(".grail-name")).toBeNull();
    expect(tiles(container)[0].textContent).toBe("NT");
  });

  it("dipteki düğme rayı genişletip daraltıyor ve bunu ayara yazıyor", () => {
    const patchAppearance = vi.fn(async () => {});
    seed([group("g1")]);
    useStore.setState({ patchAppearance } as never);
    const { getByLabelText } = render(<GroupRail />);

    const toggle = getByLabelText("Grup adlarını göster");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(toggle);
    expect(patchAppearance).toHaveBeenCalledWith({ railExpanded: true });
  });

  it("genişken düğme daraltmayı söylüyor", () => {
    const patchAppearance = vi.fn(async () => {});
    seed([group("g1")], "kokpit", true);
    useStore.setState({ patchAppearance } as never);
    const { getByLabelText } = render(<GroupRail />);
    const toggle = getByLabelText("Grup adlarını gizle");
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(toggle);
    expect(patchAppearance).toHaveBeenCalledWith({ railExpanded: false });
  });
});

// ----------------------------------------------------------- sürükle-bırak

describe("Kokpit rayı: sürükle-bırak", () => {
  it("gruplar sürüklenebilir, kova sürüklenemez", () => {
    seed([loose(), group("g1"), group("g2")]);
    const { container } = render(<GroupRail />);
    expect(tiles(container).map((el) => el.getAttribute("draggable"))).toEqual([
      "false",
      "true",
      "true",
    ]);
  });

  it("karoyu bir üstteki karonun üst yarısına bırakmak onu öne alıyor", () => {
    seed([group("g1"), group("g2"), group("g3")]);
    const { container } = render(<GroupRail />);
    layOut(container);
    const dt = dataTransfer();

    fireEvent.dragStart(tiles(container)[2], { dataTransfer: dt });
    expect(dt.getData("text/plain")).toBe("g3");
    dragOverAt(tiles(container)[0], dt, 20); // g1'in üst yarısı
    fireEvent.drop(tiles(container)[0], { dataTransfer: dt });

    expect(order()).toBe("g3,g1,g2");
  });

  it("aradaki boşluğa bırakmak da çalışıyor ve sona bırakılabiliyor", () => {
    seed([group("g1"), group("g2"), group("g3")]);
    const { container } = render(<GroupRail />);
    layOut(container);
    const strip = container.querySelector(".grail-groups")!;
    const dt = dataTransfer();

    // g1 ile g2 arasındaki boşluk (52-62): hedef karo değil, kabın kendisi.
    fireEvent.dragStart(tiles(container)[2], { dataTransfer: dt });
    expect(dragOverAt(strip, dt, 57), "boşlukta bırakmaya izin yok").toBe(false);
    fireEvent.drop(strip, { dataTransfer: dt });
    expect(order()).toBe("g1,g3,g2");

    // Son karonun altı ("+" düğmesi dahil): en sona.
    fireEvent.dragStart(tiles(container)[0], { dataTransfer: dt });
    dragOverAt(container.querySelector(".grail-add")!, dt, 170);
    fireEvent.drop(container.querySelector(".grail-add")!, { dataTransfer: dt });
    expect(order()).toBe("g3,g2,g1");
  });

  it("kovanın önüne bırakılan grup kovanın arkasına düşüyor", () => {
    seed([loose(), group("g1"), group("g2")]);
    const { container } = render(<GroupRail />);
    layOut(container);
    const dt = dataTransfer();

    fireEvent.dragStart(tiles(container)[2], { dataTransfer: dt });
    dragOverAt(tiles(container)[0], dt, 15);
    // Çizgi kovanın üstünde değil, kova ile ilk grup arasında.
    expect(tiles(container)[0].hasAttribute("data-drop")).toBe(false);
    expect(tiles(container)[1].getAttribute("data-drop")).toBe("before");
    fireEvent.drop(tiles(container)[0], { dataTransfer: dt });

    expect(order()).toBe("loose,g2,g1");
  });

  it("bırakma çizgisi: yalnızca sırayı değiştiren yerde, öğe eklemeden, bitince kalkıyor", () => {
    seed([group("g1"), group("g2"), group("g3")]);
    const { container } = render(<GroupRail />);
    layOut(container);
    const count = () => container.querySelectorAll("*").length;
    const before = count();
    const marks = () => tiles(container).map((el) => el.getAttribute("data-drop"));
    const dt = dataTransfer();

    fireEvent.dragStart(tiles(container)[1], { dataTransfer: dt });
    expect(tiles(container)[1].classList.contains("dragging")).toBe(true);
    // Kendi yerinin iki yanı: bırakmak bir şey değiştirmez, çizgi yok.
    dragOverAt(tiles(container)[1], dt, 70);
    expect(marks()).toEqual([null, null, null]);
    dragOverAt(tiles(container)[2], dt, 160); // g3'ün alt yarısı: en sona
    expect(marks()).toEqual([null, null, "after"]);
    dragOverAt(tiles(container)[0], dt, 20);
    expect(marks()).toEqual(["before", null, null]);
    expect(count(), "sürüklerken öğe eklendi").toBe(before);

    fireEvent.dragEnd(tiles(container)[1], { dataTransfer: dt });
    expect(marks()).toEqual([null, null, null]);
    expect(container.querySelector(".dragging")).toBeNull();
    expect(order()).toBe("g1,g2,g3");
  });

  it("sekme sürüklemesine karışmıyor", () => {
    // Sekme kartından gelen sürüklemede `dragGroupId` yok: ray bırakmayı
    // kabul etmemeli, sıra değişmemeli.
    seed([group("g1"), group("g2")]);
    const { container } = render(<GroupRail />);
    layOut(container);
    const dt = dataTransfer();
    expect(dragOverAt(tiles(container)[0], dt, 20)).toBe(true);
    fireEvent.drop(tiles(container)[0], { dataTransfer: dt });
    expect(order()).toBe("g1,g2");
  });
});

// ------------------------------------------------- kenar çubuğu, aynı liste

describe("Kokpit'te sekme sütununun boş yerine sağ tık", () => {
  /*
   * BİLDİRİLEN: "kokpit görünümde grupları daralt, yalnızca favori gruplar
   * sağ tıklayınca geliyor. Bunlara tıklayınca da bir şey yapmıyor." Sütun
   * yalnızca etkin grubu gösteriyor; katlama da süzgeç de orada işlemiyor.
   */
  it("Kokpit'te yalnızca çalışan eylemler: yeni sekme, yeni grup", () => {
    seed([group("g1"), group("g2")], "kokpit");
    const { container } = render(<GroupSidebar />);
    fireEvent.contextMenu(container.querySelector(".sidebar")!);
    expect(menuLabels()).toEqual(["Yeni sekme", "Yeni grup"]);
  });

  it("öbür tasarımlarda katlama ve favori süzgeci duruyor", () => {
    seed([group("g1"), group("g2")], "premium");
    const { container } = render(<GroupSidebar />);
    fireEvent.contextMenu(container.querySelector(".sidebar")!);
    expect(menuLabels()).toEqual(["Yeni sekme", "Yeni grup", "Grupları daralt", "Yalnızca favori gruplar"]);
  });
});


describe("kenar çubuğundaki grup menüsü", () => {
  it("rayla aynı liste; katlama satırları Kokpit dışında duruyor", () => {
    seed([group("g1"), group("g2")], "premium");
    const { container, unmount } = render(<GroupSidebar />);
    fireEvent.contextMenu(container.querySelector(".group-row")!);
    // Kenar çubuğunda çift tık adı değiştirmeye devam ediyor.
    expect(menuItem("Adı değiştir…").querySelector(".ctx-hint")?.textContent).toBe("Çift tık");
    expect(menuLabels()).toContain("Grubu daralt");
    expect(menuLabels()).toContain("Grupları daralt");
    unmount();

    seed([group("g1"), group("g2")], "kokpit");
    const kokpit = render(<GroupSidebar />);
    fireEvent.contextMenu(kokpit.container.querySelector(".group-row")!);
    expect(menuLabels()).not.toContain("Grubu daralt");
    expect(menuLabels()).not.toContain("Grupları daralt");
    expect(menuLabels()).toContain("Adı değiştir…");
  });
});
