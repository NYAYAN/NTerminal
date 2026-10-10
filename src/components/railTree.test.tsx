// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { railTree } from "../lib/design";
import { setLanguage } from "../lib/i18n";
import { sessions, useStore } from "../store/useStore";
import type { Appearance, Group, TabState } from "../types";
import { GroupRail } from "./GroupRail";
import { GroupSidebar } from "./GroupSidebar";

/**
 * Kokpit rayının sekme ağacı.
 *
 * İSTEKLER: "genişlet dersem o zaman bir buton çıksın, bu buton ile sekmeleri
 * grupta göster diyeyim", "kişi başka grupları açık yaptıysa açık kalmalı" ve
 * "Gruplar başlığı gelecek ve yanında icon yeterli. Yazı çok yer kaplıyor
 * çünkü. tooltip olarak gösterirsin."
 *
 * Ağaç açıkken kart sütunu çizilmiyor (`App`, kaynağı `titlebar.test.tsx`
 * bağlıyor); yani sekme satırı kartın işini görmek zorunda: geçiş, menü,
 * kapatma, sürükleyerek sıralama ve gruptan gruba taşıma.
 */

function tab(id: string, patch: Partial<TabState> = {}): TabState {
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
    ...patch,
  };
}

function group(id: string, tabs: TabState[], patch: Partial<Group> = {}): Group {
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
    activeTabId: tabs[0]?.id ?? null,
    tabs,
    ...patch,
  };
}

const initial = useStore.getState();

/** Varsayılan: ağaç açık (Kokpit, geniş ray, sekmeler grupların altında). */
function seed(
  groups: Group[],
  options: {
    appearance?: Partial<Appearance>;
    onlyFavorites?: boolean;
    running?: Record<string, boolean>;
  } = {},
) {
  const s = initial.settings;
  useStore.setState({
    groups,
    activeGroupId: groups[0]?.id ?? null,
    running: options.running ?? {},
    exited: {},
    runLinks: {},
    settings: {
      ...s,
      appearance: {
        ...s.appearance,
        design: "kokpit",
        railExpanded: true,
        railTabs: true,
        sidebarCollapsed: false,
        ...options.appearance,
      },
      behavior: { ...s.behavior, showOnlyFavoriteGroups: options.onlyFavorites ?? false },
    },
    ui: { ...initial.ui, settingsOpen: false, editingGroupId: null },
  });
}

const state = () => useStore.getState();
const byId = (id: string) => state().groups.find((g) => g.id === id)!;
const tabIds = (groupId: string) => byId(groupId).tabs.map((x) => x.id).join(",");
const tabsOf = (id: string) => state().groups.flatMap((g) => g.tabs).find((x) => x.id === id)!;

const nodes = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>(".grail-node")];
const tiles = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>(".grail-item")];
const rows = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>(".grail-tab")];
const row = (c: HTMLElement, name: string) =>
  rows(c).find((el) => el.querySelector(".grail-tab-name")?.textContent === name)!;
/** Her grubun altındaki sekme adları; kapalı grubunki boş. */
const tree = (c: HTMLElement) =>
  nodes(c).map((node) =>
    [...node.querySelectorAll(".grail-tab-name")].map((el) => el.textContent).join(","),
  );
const caret = (c: HTMLElement, index: number) =>
  nodes(c)[index].querySelector<HTMLButtonElement>(".grail-caret")!;
const collapsedState = () =>
  state()
    .groups.map((g) => `${g.id}:${g.collapsed ? "kapalı" : "açık"}`)
    .join(" ");
const menuLabels = () =>
  [...document.querySelectorAll(".ctx-menu .ctx-label")].map((el) => el.textContent);
const menuItem = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>(".ctx-menu button.ctx-item")].find(
    (el) => el.querySelector(".ctx-label")?.textContent === label,
  )!;
const tip = () => document.querySelector<HTMLElement>(".grail-tip");
const renameBox = () => document.querySelector<HTMLInputElement>(".grail-pop input.rename-input");

/** jsdom ölçü yapmıyor: her öğeye üst üste dizilmiş bir dikdörtgen verir. */
function layOut(els: HTMLElement[], height: number, gap = 0) {
  els.forEach((el, i) => {
    const top = i * (height + gap);
    el.getBoundingClientRect = () =>
      ({ left: 0, top, width: 200, height, right: 200, bottom: top + height, x: 0, y: top }) as DOMRect;
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
  sessions.clear();
  useStore.setState({
    groups: [],
    activeGroupId: null,
    running: {},
    exited: {},
    runLinks: {},
    settings: initial.settings,
    ui: initial.ui,
    addTab: initial.addTab,
    addLooseTab: initial.addLooseTab,
    closeTab: initial.closeTab,
    patchAppearance: initial.patchAppearance,
    patchBehavior: initial.patchBehavior,
  });
});

// ------------------------------------------------------- başlık ve düğme

describe("geniş rayın başlığı", () => {
  it("dar rayda başlık da ağaç düğmesi de yok", () => {
    seed([group("g1", [tab("a")])], { appearance: { railExpanded: false } });
    const { container, queryByLabelText } = render(<GroupRail />);
    expect(container.querySelector(".grail-head")).toBeNull();
    expect(queryByLabelText("Sekmeleri grupların altında göster")).toBeNull();
    expect(container.querySelector(".grail-tab")).toBeNull();
  });

  it("genişleyince 'Gruplar' ve yanında YALNIZCA simge; adı anında çıkan ipucunda", () => {
    seed([group("g1", [tab("a")])], { appearance: { railTabs: false } });
    const { container, getByLabelText } = render(<GroupRail />);
    expect(container.querySelector(".grail-caption")?.textContent).toBe("Gruplar");

    const button = getByLabelText("Sekmeleri grupların altında göster");
    expect(button.closest(".grail-head")).not.toBeNull();
    expect(button.textContent, "düğmede yazı var").toBe("");
    expect(button.querySelector("svg")).not.toBeNull();
    expect(button.hasAttribute("title"), "yerel ipucu geç çıkıyor").toBe(false);
    expect(button.getAttribute("aria-pressed")).toBe("false");

    fireEvent.mouseEnter(button);
    expect(tip()?.textContent).toBe("Sekmeleri grupların altında göster");
  });

  it("ağaç kapalıyken sekmeler rayda yok (kartlarda)", () => {
    seed([group("g1", [tab("a")])], { appearance: { railTabs: false } });
    const { container } = render(<GroupRail />);
    expect(container.querySelector(".grail-node")).toBeNull();
    expect(container.querySelector(".grail-tab")).toBeNull();
  });

  it("basınca ağaç açılıyor ve ayara yazılıyor; kapatılmış sekme listesini de açıyor", () => {
    const patchAppearance = vi.fn(async () => {});
    // Başlık çubuğunda "Grupları daralt" ile liste kapatılmış: düğme basılı
    // görünmüyor ve basınca sekmeler görünmeli.
    seed([group("g1", [tab("a")])], { appearance: { railTabs: true, sidebarCollapsed: true } });
    useStore.setState({ patchAppearance } as never);
    const { getByLabelText } = render(<GroupRail />);

    const button = getByLabelText("Sekmeleri grupların altında göster");
    expect(button.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(button);
    expect(patchAppearance).toHaveBeenCalledWith({ railTabs: true, sidebarCollapsed: false });
  });

  it("ağaç açıkken düğme basılı ve kartlara dönüşü söylüyor", () => {
    const patchAppearance = vi.fn(async () => {});
    seed([group("g1", [tab("a")])]);
    useStore.setState({ patchAppearance } as never);
    const { getByLabelText } = render(<GroupRail />);

    const button = getByLabelText("Sekmeleri kartlarda göster");
    expect(button.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(button);
    expect(patchAppearance).toHaveBeenCalledWith({ railTabs: false });
  });
});

describe("railTree: ağaç ne zaman ekranda", () => {
  const on: Pick<Appearance, "design" | "railExpanded" | "railTabs" | "sidebarCollapsed"> = {
    design: "kokpit",
    railExpanded: true,
    railTabs: true,
    sidebarCollapsed: false,
  };

  it.each([
    ["Kokpit, geniş ray, düğme basılı", {}, true],
    ["Premium'da ray yok", { design: "premium" as const }, false],
    ["dar rayda ad sığmıyor", { railExpanded: false }, false],
    ["düğme basılı değil: kartlar", { railTabs: false }, false],
    ["başlık çubuğunda liste kapatılmış", { sidebarCollapsed: true }, false],
  ])("%s → %s", (_, patch, expected) => {
    expect(railTree({ ...on, ...patch })).toBe(expected);
  });
});

// -------------------------------------------------------------------- ağaç

describe("sekme ağacı", () => {
  it("sekmeler kendi grubunun altında, sırasıyla; her grubun dibinde 'Sekme ekle'", () => {
    seed([
      group("g1", [tab("arayüz"), tab("rust"), tab("sunucu")], { name: "NTerminal" }),
      group("g2", [tab("dev")], { name: "CopyBoard" }),
    ]);
    const { container } = render(<GroupRail />);
    expect(tree(container)).toEqual(["arayüz,rust,sunucu", "dev"]);
    expect(nodes(container).map((n) => n.querySelector(".grail-tab-add")?.textContent)).toEqual([
      "Sekme ekle",
      "Sekme ekle",
    ]);
    // Karo ağaçta da aynı karo: adı yazılı, ipucu yok.
    expect(nodes(container).map((n) => n.querySelector(".grail-item .grail-name")?.textContent)).toEqual([
      "NTerminal",
      "CopyBoard",
    ]);
  });

  it("kapalı grubun sekmeleri çizilmiyor; karoda sayısı, okta 'Grubu aç'", () => {
    seed([group("g1", [tab("a")]), group("g2", [tab("b1"), tab("b2")], { collapsed: true })]);
    const { container } = render(<GroupRail />);
    expect(tree(container)).toEqual(["a", ""]);
    expect(nodes(container)[1].querySelector(".grail-tab-add")).toBeNull();
    expect(nodes(container)[1].querySelector(".grail-count")?.textContent).toBe("2");
    // Açık grupta sayı yok: sekmeler zaten görünüyor.
    expect(nodes(container)[0].querySelector(".grail-count")).toBeNull();
    expect(caret(container, 1).getAttribute("aria-expanded")).toBe("false");
    expect(caret(container, 1).getAttribute("aria-label")).toBe("Grubu aç");
    expect(caret(container, 0).getAttribute("aria-label")).toBe("Grubu daralt");
  });

  it("ok yalnızca kendi grubunu açıp kapatıyor, grubu değiştirmiyor", () => {
    seed([group("g1", [tab("a")]), group("g2", [tab("b")]), group("g3", [tab("c")])]);
    const { container } = render(<GroupRail />);

    fireEvent.click(caret(container, 1));
    expect(collapsedState()).toBe("g1:açık g2:kapalı g3:açık");
    expect(tree(container)).toEqual(["a", "", "c"]);
    expect(state().activeGroupId, "ok grubu etkinleştirdi").toBe("g1");

    fireEvent.click(caret(container, 1));
    expect(collapsedState()).toBe("g1:açık g2:açık g3:açık");
  });

  it("etkin grup değişince açık bıraktığın gruplar açık, kapattığın kapalı kalıyor", () => {
    // İSTEK: "kişi başka grupları açık yaptıysa açık kalmalı". Akordeon gibi
    // yalnızca etkin grubu açık tutmak YOK.
    seed([
      group("g1", [tab("a")]),
      group("g2", [tab("b")]),
      group("g3", [tab("c")], { collapsed: true }),
    ]);
    const { container } = render(<GroupRail />);

    fireEvent.click(tiles(container)[1]);
    expect(state().activeGroupId).toBe("g2");
    expect(collapsedState()).toBe("g1:açık g2:açık g3:kapalı");

    fireEvent.click(tiles(container)[2]);
    expect(state().activeGroupId).toBe("g3");
    expect(collapsedState(), "etkin olan kapalı grup kendiliğinden açıldı").toBe(
      "g1:açık g2:açık g3:kapalı",
    );

    fireEvent.click(row(container, "a"));
    expect(state().activeGroupId).toBe("g1");
    expect(tree(container)).toEqual(["a", "b", ""]);
  });

  it("satıra tıklamak o sekmeye ve grubuna geçiyor; etkin satır işaretli", () => {
    seed([group("g1", [tab("a")]), group("g2", [tab("b1"), tab("b2")])]);
    const { container } = render(<GroupRail />);
    expect(row(container, "a").classList.contains("on")).toBe(true);

    fireEvent.click(row(container, "b2"));
    expect(state().activeGroupId).toBe("g2");
    expect(byId("g2").activeTabId).toBe("b2");
    expect(rows(container).filter((el) => el.classList.contains("on")).map((el) => el.textContent)).toEqual([
      "b2",
    ]);
    expect(row(container, "b2").getAttribute("aria-current")).toBe("true");
    // Etkin olmayan grubun hatırlanan sekmesi işaretli değil.
    expect(row(container, "b1").classList.contains("on")).toBe(false);
  });

  it("çift tık bir şey yapmıyor", () => {
    seed([group("g1", [tab("a", { customTitle: "api" })])]);
    const { container } = render(<GroupRail />);
    fireEvent.doubleClick(row(container, "api"));
    expect(renameBox()).toBeNull();
    expect(tabsOf("a").customTitle).toBe("api");
  });

  it("satırın ipucu ek bilgiyi veriyor, çift tıkı önermiyor", () => {
    seed([group("g1", [tab("a", { cwd: "/Users/n/proje", lastCommand: "npm test" })])]);
    const { container } = render(<GroupRail />);
    const title = rows(container)[0].getAttribute("title") ?? "";
    expect(title).toContain("/Users/n/proje");
    expect(title).toContain("npm test");
    expect(title).not.toContain("Çift tık");
  });
});

// ----------------------------------------------------- sağ tık ve adlandırma

describe("ağaçta sekmenin sağ tık menüsü", () => {
  it("kartın menüsüyle aynı liste; ad satırının ipucu çift tık değil", () => {
    const g = () => [
      group("g1", [tab("a", { cwd: "/tmp" }), tab("b")]),
      group("g2", [tab("c")]),
    ];
    seed(g(), { appearance: { railTabs: false } });
    const card = render(<GroupSidebar />);
    fireEvent.contextMenu(card.container.querySelector(".tab-row")!);
    const cardLabels = menuLabels();
    fireEvent.keyDown(window, { key: "Escape" });
    card.unmount();

    seed(g());
    const { container } = render(<GroupRail />);
    fireEvent.contextMenu(rows(container)[0]);
    expect(menuLabels()).toEqual(cardLabels);
    expect(menuLabels()).toContain("Klasörü aç");
    expect(menuItem("Adı değiştir…").querySelector(".ctx-hint")).toBeNull();
    // Sağ tık sekmeyi değiştirmiyor.
    expect(byId("g1").activeTabId).toBe("a");
  });

  it("ad satırın yanındaki kutuda; Enter kaydediyor, Esc vazgeçiyor", () => {
    seed([group("g1", [tab("a", { customTitle: "api" }), tab("b")])]);
    const { container } = render(<GroupRail />);

    fireEvent.contextMenu(row(container, "api"));
    fireEvent.click(menuItem("Adı değiştir…"));
    expect(renameBox()?.value).toBe("api");
    expect(document.activeElement).toBe(renameBox());
    expect(row(container, "api").classList.contains("editing")).toBe(true);
    fireEvent.change(renameBox()!, { target: { value: "  web  " } });
    fireEvent.keyDown(renameBox()!, { key: "Enter" });
    expect(tabsOf("a").customTitle).toBe("web");
    expect(renameBox()).toBeNull();

    fireEvent.contextMenu(row(container, "web"));
    fireEvent.click(menuItem("Adı değiştir…"));
    fireEvent.change(renameBox()!, { target: { value: "başka" } });
    act(() => {
      // Chromium sökülen odaklı kutuya blur yolluyor; Esc vazgeçmeyi
      // kaydetmeye çevirmemeli.
      fireEvent.keyDown(renameBox()!, { key: "Escape" });
      fireEvent.blur(renameBox()!);
    });
    expect(tabsOf("a").customTitle).toBe("web");
  });

  it("değiştirmeden kapanan kutu özel ad yazmıyor; boş ad özel adı kaldırıyor", () => {
    // Adı klasörden gelen sekmede o ad özel ada dönüşüp sabitlenirdi.
    seed([group("g1", [tab("a", { cwd: "/Users/n/proje" }), tab("b", { customTitle: "api" })])]);
    const { container } = render(<GroupRail />);

    fireEvent.contextMenu(row(container, "proje"));
    fireEvent.click(menuItem("Adı değiştir…"));
    expect(renameBox()?.value).toBe("proje");
    fireEvent.blur(renameBox()!);
    expect(tabsOf("a").customTitle).toBeNull();

    fireEvent.contextMenu(row(container, "api"));
    fireEvent.click(menuItem("Adı değiştir…"));
    fireEvent.change(renameBox()!, { target: { value: "" } });
    fireEvent.keyDown(renameBox()!, { key: "Enter" });
    expect(tabsOf("b").customTitle).toBeNull();
  });
});

// ------------------------------------------------------------- göstergeler

describe("ağaçtaki sekmenin göstergeleri", () => {
  it("çalışan sekmede nabız ve sunucunun portu; biten sekmede port yok", () => {
    seed([group("g1", [tab("a", { lastCommand: "npm start" }), tab("b")])], { running: { a: true } });
    sessions.set("a", { runUrls: () => ["http://localhost:5273/"] } as never);
    sessions.set("b", { runUrls: () => ["http://localhost:9999/"], pid: 42 } as never);
    const { container } = render(<GroupRail />);

    expect(row(container, "a").querySelector(".tab-dot.busy")).not.toBeNull();
    expect(row(container, "a").querySelector(".grail-tab-port")?.textContent).toBe(":5273");
    expect(row(container, "b").querySelector(".tab-dot.busy")).toBeNull();
    expect(row(container, "b").querySelector(".grail-tab-port")).toBeNull();
  });

  it("Claude Code çalışırken satırın başında onun simgesi", () => {
    seed([group("g1", [tab("a", { lastCommand: "claude" })])], { running: { a: true } });
    const { container } = render(<GroupRail />);
    expect(row(container, "a").querySelector(".grail-tab-claude svg")).not.toBeNull();
    expect(row(container, "a").querySelector(".tab-dot.busy")).toBeNull();
  });

  it("açılmamış sekme halka, kapanmış sekme kırmızı nokta", () => {
    seed([group("g1", [tab("a"), tab("b")])]);
    useStore.setState({ exited: { b: true } });
    const { container } = render(<GroupRail />);
    expect(row(container, "a").querySelector(".tab-row-idle")).not.toBeNull();
    expect(row(container, "b").querySelector(".tab-dot.dead")).not.toBeNull();
  });

  it("kilitli sekmede kapatma düğmesi yok, kilit var; orta tık da kapatmıyor", () => {
    const closeTab = vi.fn(async () => {});
    seed([group("g1", [tab("a"), tab("b", { locked: true })]), group("g2", [tab("c")])]);
    useStore.setState({ closeTab, activeGroupId: "g2" } as never);
    const { container } = render(<GroupRail />);

    expect(row(container, "b").querySelector(".grail-tab-close")).toBeNull();
    expect(row(container, "b").querySelector(".grail-tab-lock")).not.toBeNull();
    fireEvent(row(container, "b"), new MouseEvent("auxclick", { bubbles: true, button: 1 }));
    expect(closeTab).not.toHaveBeenCalled();

    fireEvent(row(container, "a"), new MouseEvent("auxclick", { bubbles: true, button: 1 }));
    expect(closeTab).toHaveBeenCalledWith("a");
    fireEvent.click(row(container, "a").querySelector(".grail-tab-close")!);
    expect(closeTab).toHaveBeenCalledTimes(2);
    expect(state().activeGroupId, "kapatma satıra tıklamış sayıldı").toBe("g2");
  });

  it("'Sekme ekle' o gruba açıyor; gruplanmamış kovada kovaya", () => {
    const addTab = vi.fn();
    const addLooseTab = vi.fn();
    seed([
      group("loose", [tab("x")], { ungrouped: true, name: "" }),
      group("g1", [tab("a")]),
    ]);
    useStore.setState({ addTab, addLooseTab } as never);
    const { container } = render(<GroupRail />);

    fireEvent.click(nodes(container)[1].querySelector(".grail-tab-add")!);
    expect(addTab).toHaveBeenCalledWith({ groupId: "g1" });
    fireEvent.click(nodes(container)[0].querySelector(".grail-tab-add")!);
    expect(addLooseTab).toHaveBeenCalled();
  });
});

// -------------------------------------------------------- sürükle-bırak

describe("ağaçta sürükle-bırak", () => {
  it("sekme aynı grupta sıralanıyor", () => {
    seed([group("g1", [tab("a"), tab("b"), tab("c")])]);
    const { container } = render(<GroupRail />);
    layOut(rows(container), 30);
    const dt = dataTransfer();

    fireEvent.dragStart(row(container, "c"), { dataTransfer: dt });
    expect(dt.getData("text/plain")).toBe("c");
    expect(row(container, "c").classList.contains("dragging")).toBe(true);
    dragOverAt(row(container, "a"), dt, 5); // a'nın üst yarısı
    expect(row(container, "a").getAttribute("data-drop")).toBe("before");
    fireEvent.drop(row(container, "a"), { dataTransfer: dt });

    expect(tabIds("g1")).toBe("c,a,b");
  });

  it("başka grubun satırına bırakılan sekme oraya taşınıyor", () => {
    seed([group("g1", [tab("a"), tab("b")]), group("g2", [tab("c"), tab("d")])]);
    const { container } = render(<GroupRail />);
    layOut(rows(container), 30);
    const dt = dataTransfer();

    fireEvent.dragStart(row(container, "a"), { dataTransfer: dt });
    dragOverAt(row(container, "c"), dt, 80); // c (60-90) alt yarısı: c'den sonra
    expect(row(container, "d").getAttribute("data-drop")).toBe("before");
    fireEvent.drop(row(container, "c"), { dataTransfer: dt });

    expect(tabIds("g1")).toBe("b");
    expect(tabIds("g2")).toBe("c,a,d");
    expect(state().activeGroupId).toBe("g2");
  });

  it("karoya ya da 'Sekme ekle'ye bırakılan sekme grubun sonuna; kapalı grupta karo halkalı", () => {
    seed([
      group("g1", [tab("a"), tab("b")]),
      group("g2", [tab("c")], { collapsed: true }),
      group("g3", [tab("d")]),
    ]);
    const { container } = render(<GroupRail />);
    const dt = dataTransfer();

    fireEvent.dragStart(row(container, "a"), { dataTransfer: dt });
    expect(dragOverAt(tiles(container)[1], dt, 0), "karo bırakmayı kabul etmedi").toBe(false);
    expect(tiles(container)[1].hasAttribute("data-into")).toBe(true);
    fireEvent.drop(tiles(container)[1], { dataTransfer: dt });
    expect(tabIds("g2")).toBe("c,a");
    expect(container.querySelector("[data-into]")).toBeNull();

    // Açık grubun sonu: son satırın altında çizgi.
    fireEvent.dragStart(row(container, "b"), { dataTransfer: dt });
    const add = nodes(container)[2].querySelector(".grail-tab-add")!;
    dragOverAt(add, dt, 0);
    expect(row(container, "d").getAttribute("data-drop")).toBe("after");
    fireEvent.drop(add, { dataTransfer: dt });
    expect(tabIds("g3")).toBe("d,b");
  });

  it("kendi yerinin iki yanında çizgi yok; sürüklerken öğe eklenmiyor; bitince kalkıyor", () => {
    seed([group("g1", [tab("a"), tab("b"), tab("c")])]);
    const { container } = render(<GroupRail />);
    layOut(rows(container), 30);
    const count = () => container.querySelectorAll("*").length;
    const before = count();
    const marks = () => rows(container).map((el) => el.getAttribute("data-drop"));
    const dt = dataTransfer();

    fireEvent.dragStart(row(container, "b"), { dataTransfer: dt });
    dragOverAt(row(container, "b"), dt, 35); // kendi üst yarısı
    expect(marks()).toEqual([null, null, null]);
    dragOverAt(row(container, "a"), dt, 25); // a'nın alt yarısı = b'nin yeri
    expect(marks()).toEqual([null, null, null]);
    dragOverAt(row(container, "c"), dt, 85); // c'nin alt yarısı: en sona
    expect(marks()).toEqual([null, null, "after"]);
    expect(count(), "sürüklerken öğe eklendi").toBe(before);

    fireEvent.dragEnd(row(container, "b"), { dataTransfer: dt });
    expect(marks()).toEqual([null, null, null]);
    expect(container.querySelector(".dragging")).toBeNull();
    expect(tabIds("g1")).toBe("a,b,c");
  });

  it("grup sürüklemesi ağaçta grubun bütününe göre; çizgi grubun dışında", () => {
    seed([
      group("g1", [tab("a"), tab("b"), tab("c")]),
      group("g2", [tab("d")]),
      group("g3", [tab("e")]),
    ]);
    const { container } = render(<GroupRail />);
    // g1 uzun (sekmeleriyle 160px), ötekiler kısa.
    const heights = [160, 80, 80];
    let top = 0;
    nodes(container).forEach((el, i) => {
      const at = top;
      el.getBoundingClientRect = () =>
        ({ left: 0, top: at, width: 200, height: heights[i], right: 200, bottom: at + heights[i], x: 0, y: at }) as DOMRect;
      top += heights[i] + 10;
    });
    const strip = container.querySelector(".grail-groups")!;
    const marks = () => nodes(container).map((el) => el.getAttribute("data-drop"));
    const dt = dataTransfer();

    fireEvent.dragStart(tiles(container)[2], { dataTransfer: dt });
    expect(nodes(container)[2].classList.contains("dragging")).toBe(true);
    expect(tiles(container)[2].classList.contains("dragging"), "soluklaşma iki kat").toBe(false);
    // g1'in karosunun altı ama grubun ortasının üstü (karo 0-40, orta 80).
    dragOverAt(strip, dt, 60);
    expect(marks()).toEqual(["before", null, null]);
    expect(tiles(container).some((el) => el.hasAttribute("data-drop")), "çizgi karoda").toBe(false);
    fireEvent.drop(strip, { dataTransfer: dt });
    expect(state().groups.map((g) => g.id).join(",")).toBe("g3,g1,g2");

    // Sona: son grubun altına.
    fireEvent.dragStart(tiles(container)[0], { dataTransfer: dt });
    dragOverAt(strip, dt, 500);
    expect(marks()).toEqual([null, null, "after"]);
    fireEvent.drop(strip, { dataTransfer: dt });
    expect(state().groups.map((g) => g.id).join(",")).toBe("g1,g2,g3");
  });
});

// ------------------------------------------------------ favori grup süzgeci

describe("rayda favori grup süzgeci", () => {
  /*
   * İSTEK: "Favoriye ekli grupları listelemek istediğimde listeleme
   * yapamıyorum. Sekmeleri grup altında göster butonu solunda favori kısmını
   * ekleyelim." Ayar Premium ve Klasik'teki süzgecin aynısı
   * (`showOnlyFavoriteGroups`, `visibleGroups`).
   */
  const three = () => [
    group("g1", [tab("a")], { favorite: true }),
    group("g2", [tab("b")]),
    group("g3", [tab("c")], { favorite: true }),
  ];
  const names = (c: HTMLElement) => tiles(c).map((el) => el.getAttribute("aria-label"));

  it("yıldız başlıkta, ağaç düğmesinin SOLUNDA; adı ve sayısı anında çıkan ipucunda", () => {
    const patchBehavior = vi.fn(async () => {});
    seed(three(), { appearance: { railTabs: false } });
    useStore.setState({ patchBehavior } as never);
    const { container } = render(<GroupRail />);

    const buttons = [...container.querySelectorAll<HTMLElement>(".grail-head-actions > button")];
    expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual([
      "Yalnızca favori grupları göster (2)",
      "Sekmeleri grupların altında göster",
    ]);
    const star = buttons[0];
    expect(star.getAttribute("aria-pressed")).toBe("false");
    expect(star.textContent, "düğmede yazı var").toBe("");
    fireEvent.mouseEnter(star);
    expect(tip()?.textContent).toBe("Yalnızca favori grupları göster (2)");

    fireEvent.click(star);
    expect(patchBehavior).toHaveBeenCalledWith({ showOnlyFavoriteGroups: true });
  });

  it("açıkken rayda yalnız favoriler (ve gruplanmamış kova); basmak hepsini geri getiriyor", () => {
    const patchBehavior = vi.fn(async () => {});
    seed([group("loose", [tab("x")], { ungrouped: true, name: "" }), ...three()], {
      onlyFavorites: true,
    });
    useStore.setState({ patchBehavior } as never);
    const { container, getByLabelText } = render(<GroupRail />);

    expect(names(container)).toEqual(["Gruplanmamış", "g1", "g3"]);
    // Ağaçta da: gizli grubun sekmeleri yok.
    expect(rows(container).map((el) => el.textContent)).not.toContain("b");
    const star = getByLabelText("Tüm grupları göster (4)");
    expect(star.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(star);
    expect(patchBehavior).toHaveBeenCalledWith({ showOnlyFavoriteGroups: false });
  });

  it("dar rayda süzgeç açıkken başlığın yerinde yalnızca basılı yıldız; kapalıyken başlık yok", () => {
    seed(three(), { appearance: { railExpanded: false }, onlyFavorites: true });
    const { container, unmount } = render(<GroupRail />);
    expect(names(container)).toEqual(["g1", "g3"]);
    const head = container.querySelector(".grail-head")!;
    expect([...head.querySelectorAll("button")].map((b) => b.getAttribute("aria-pressed"))).toEqual([
      "true",
    ]);
    unmount();

    seed(three(), { appearance: { railExpanded: false } });
    const off = render(<GroupRail />);
    expect(off.container.querySelector(".grail-head")).toBeNull();
    expect(names(off.container)).toEqual(["g1", "g2", "g3"]);
  });

  it("geniş rayda favori grubun adının yanında yıldız", () => {
    seed(three(), { appearance: { railTabs: false } });
    const { container } = render(<GroupRail />);
    expect(tiles(container).map((el) => !!el.querySelector(".grail-fav"))).toEqual([true, false, true]);
  });

  it("favori grup yokken süzgeç ne yapılacağını söylüyor", () => {
    seed([group("g1", [tab("a")])], { onlyFavorites: true });
    const { container } = render(<GroupRail />);
    expect(container.querySelector(".grail-empty")?.textContent).toContain("Favori grup yok.");
  });

  it("süzgeç açıkken sıralama bütün listedeki yere gidiyor", () => {
    // Görünen sırayla taşımak grubu gizli grupların arasında yanlış yere
    // koyardı (kenar çubuğundaki aynı gerekçe). İki durumda da gizli g2
    // görünen iki grubun ARASINDA.
    const star = { favorite: true };
    seed(
      [group("g1", [tab("a")], star), group("g2", [tab("b")]), group("g3", [tab("c")], star), group("g4", [tab("d")], star)],
      { appearance: { railTabs: false }, onlyFavorites: true },
    );
    const view = render(<GroupRail />);
    layOut(tiles(view.container), 40, 10); // g1 0-40, g3 50-90, g4 100-140
    let strip = view.container.querySelector(".grail-groups")!;
    const dt = dataTransfer();

    fireEvent.dragStart(tiles(view.container)[2], { dataTransfer: dt }); // g4
    dragOverAt(strip, dt, 55); // g3'ün üst yarısı: g3'ten önce
    expect(tiles(view.container)[1].getAttribute("data-drop")).toBe("before");
    fireEvent.drop(strip, { dataTransfer: dt });
    // Görünen sırayla (1) taşınsa g4 gizli g2'nin önüne düşerdi: g1,g4,g2,g3.
    expect(state().groups.map((g) => g.id).join(",")).toBe("g1,g2,g4,g3");
    view.unmount();

    // Sona: son GÖRÜNEN grubun hemen arkasına, gizli olanların değil.
    seed(
      [group("g1", [tab("a")], star), group("g2", [tab("b")]), group("g3", [tab("c")], star), group("g4", [tab("d")])],
      { appearance: { railTabs: false }, onlyFavorites: true },
    );
    const { container } = render(<GroupRail />);
    layOut(tiles(container), 40, 10); // g1 0-40, g3 50-90
    strip = container.querySelector(".grail-groups")!;
    fireEvent.dragStart(tiles(container)[0], { dataTransfer: dt }); // g1
    dragOverAt(strip, dt, 200);
    fireEvent.drop(strip, { dataTransfer: dt });
    // Görünen sırayla (2) taşınsa g1 hâlâ g3'ün önünde kalırdı: g2,g1,g3,g4.
    expect(state().groups.map((g) => g.id).join(",")).toBe("g2,g3,g1,g4");
  });
});

// ----------------------------------------------------------------- aralık

describe("ağaçta ilk sekmenin karoya uzaklığı", () => {
  it("ilk sekme karonun halkasından açıkça ayrı", () => {
    // BİLDİRİLEN: "grup altındaki ilk sekme gruba çok yakın, arasında boşluk
    // olmalı." Etkin karonun halkası 4px dışarı taşıyor; 4px'lik pay ilk
    // satırın kenarını halkaya değdiriyordu.
    const css = readFileSync(join(process.cwd(), "src/styles/kokpit.css"), "utf8");
    const rule = /\.grail-tabs \{([^}]*)\}/.exec(css)?.[1] ?? "";
    const margin = /margin-top:\s*(\d+)px/.exec(rule);
    expect(margin, "pay tanımsız").not.toBeNull();
    expect(Number(margin![1]), "halka (4px) ile satır arasında boşluk yok").toBeGreaterThanOrEqual(8);
  });
});
