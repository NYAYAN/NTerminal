// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { setLanguage } from "../lib/i18n";
import { useStore } from "../store/useStore";
import type { Group, TabState } from "../types";
import { GroupSidebar } from "./GroupSidebar";
import { TabBar } from "./TabBar";

/**
 * Sürükle-bırak davranışı, gerçek DOM olaylarıyla.
 *
 * Neden bu test var: sıralama matematiğinin (lib/tabs.ts `reorder`, `dropIndex`)
 * kendi testleri zaten geçiyordu ama sürükleme uygulamada hiç çalışmıyordu —
 * hata bambaşka bir katmandaydı (Tauri `dragDropEnabled`, bkz.
 * lib/tauriConfig.test.ts). Saf mantığı test etmek yetmiyor: olayların gerçekten
 * bağlı olduğunu, `preventDefault` çağrıldığını (yoksa tarayıcı bırakmayı
 * reddeder) ve doğru deponun güncellendiğini de doğrulamak gerekiyor.
 */

function tab(id: string, patch: Partial<TabState> = {}): TabState {
  return {
    id,
    title: id,
    customTitle: id,
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

function seed(groups: Group[], activeGroupId = groups[0]?.id ?? null) {
  useStore.setState({ groups, activeGroupId, ready: true });
}

/**
 * jsdom `getBoundingClientRect` her zaman sıfır döndürüyor; "imlecin öğenin
 * hangi yarısında olduğu" kararı ölçüye dayandığı için ölçüyü kendimiz
 * veriyoruz. Aksi halde her bırakma "önüne" sayılır ve testler yalnızca yarım
 * davranışı görür.
 */
function withRect(el: Element, rect: { left?: number; top?: number; width: number; height: number }) {
  const full = { left: rect.left ?? 0, top: rect.top ?? 0, width: rect.width, height: rect.height };
  el.getBoundingClientRect = () =>
    ({
      ...full,
      right: full.left + full.width,
      bottom: full.top + full.height,
      x: full.left,
      y: full.top,
      toJSON: () => full,
    }) as DOMRect;
}

/** HTML5 sürükleme olayları `dataTransfer` bekliyor; jsdom'da yok. */
function dataTransfer() {
  const store = new Map<string, string>();
  return {
    effectAllowed: "none",
    dropEffect: "none",
    setData: (format: string, value: string) => void store.set(format, value),
    getData: (format: string) => store.get(format) ?? "",
    setDragImage: () => {},
    types: [] as string[],
    items: [] as unknown[],
    files: [] as unknown[],
    clearData: () => void store.clear(),
  };
}

/**
 * `dragover` olayını koordinatlarıyla gönderir.
 *
 * jsdom `DragEvent`i uygulamıyor; Testing Library bu yüzden generic `Event`e
 * düşüyor ve `clientX`/`clientY` kayboluyor (0 geliyor). "İmleç öğenin hangi
 * yarısında" kararı tam olarak bu iki değere dayandığı için olayı `MouseEvent`
 * olarak kendimiz kuruyoruz.
 *
 * Bu yamayı yazana kadar "önüne bırak" testleri geçiyordu ama YANLIŞ SEBEPLE:
 * koordinat 0 geldiği için karar her zaman "önüne" çıkıyordu.
 */
function dragOverAt(
  el: Element,
  dt: ReturnType<typeof dataTransfer>,
  clientX: number,
  clientY: number,
) {
  const event = new MouseEvent("dragover", {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
  });
  Object.defineProperty(event, "dataTransfer", { value: dt });
  fireEvent(el, event);
}

const tabIds = () =>
  useStore
    .getState()
    .groups.map((g) => `${g.id}:${g.tabs.map((t) => t.id).join(",")}`)
    .join(" | ");

const groupIds = () =>
  useStore
    .getState()
    .groups.map((g) => g.id)
    .join(",");

beforeEach(() => {
  setLanguage("tr");
});

afterEach(() => {
  cleanup();
  useStore.setState({ groups: [], activeGroupId: null });
});

// --------------------------------------------------------------- sekmeler

describe("sekme sürükle-bırak (sekme çubuğu)", () => {
  it("sekmeler draggable", () => {
    seed([group("g1", [tab("a"), tab("b"), tab("c")])]);
    const { container } = render(<TabBar />);
    const tabs = [...container.querySelectorAll(".tab")];
    expect(tabs).toHaveLength(3);
    for (const el of tabs) {
      expect(el.getAttribute("draggable"), "sekme sürüklenebilir olmalı").toBe("true");
    }
  });

  it("sekmeyi başa taşıyor", () => {
    seed([group("g1", [tab("a"), tab("b"), tab("c")])]);
    const { container } = render(<TabBar />);
    const tabs = [...container.querySelectorAll(".tab")];

    const dt = dataTransfer();
    fireEvent.dragStart(tabs[1], { dataTransfer: dt });
    expect(dt.getData("text/plain"), "sürüklenen sekmenin kimliği taşınmalı").toBe("b");

    withRect(tabs[0], { width: 100, height: 30 });
    dragOverAt(tabs[0], dt, 10, 15);
    fireEvent.drop(tabs[0], { dataTransfer: dt });

    expect(tabIds()).toBe("g1:b,a,c");
  });

  it("imleç sağ yarıdaysa sekmenin arkasına bırakıyor", () => {
    seed([group("g1", [tab("a"), tab("b"), tab("c")])]);
    const { container } = render(<TabBar />);
    const tabs = [...container.querySelectorAll(".tab")];

    const dt = dataTransfer();
    fireEvent.dragStart(tabs[0], { dataTransfer: dt });
    withRect(tabs[2], { left: 200, width: 100, height: 30 });
    dragOverAt(tabs[2], dt, 280, 15);
    fireEvent.drop(tabs[2], { dataTransfer: dt });

    expect(tabIds()).toBe("g1:b,c,a");
  });

  it("bırakma yeri çizgiyle gösteriliyor", () => {
    seed([group("g1", [tab("a"), tab("b")])]);
    const { container } = render(<TabBar />);
    const tabs = [...container.querySelectorAll(".tab")];

    const dt = dataTransfer();
    fireEvent.dragStart(tabs[1], { dataTransfer: dt });
    withRect(tabs[0], { width: 100, height: 30 });
    dragOverAt(tabs[0], dt, 10, 15);

    const marked = container.querySelector("[data-drop]");
    expect(marked, "bırakma göstergesi görünmeli").not.toBe(null);
    expect(marked!.getAttribute("data-drop")).toBe("before");
  });

  it("sürükleme bitince gösterge kalkıyor", () => {
    seed([group("g1", [tab("a"), tab("b")])]);
    const { container } = render(<TabBar />);
    const tabs = [...container.querySelectorAll(".tab")];

    const dt = dataTransfer();
    fireEvent.dragStart(tabs[1], { dataTransfer: dt });
    withRect(tabs[0], { width: 100, height: 30 });
    dragOverAt(tabs[0], dt, 10, 15);
    fireEvent.dragEnd(tabs[1], { dataTransfer: dt });

    expect(container.querySelector("[data-drop]")).toBe(null);
    expect(container.querySelector(".tab.dragging")).toBe(null);
  });

  it("bırakma çizgisi yalnızca işaretli sekmelerde, sürükleme bitince kalkıyor", () => {
    // Çizgi ayrı bir öğe (`.tab-drop-line`): etkin sekmenin sözde öğeleri
    // şeridi ve ayırıcı örtüsünü çiziyor (gerekçe global.css'te).
    seed([group("g1", [tab("a"), tab("b"), tab("c")])]);
    const { container } = render(<TabBar />);
    const tabs = [...container.querySelectorAll(".tab")];

    const dt = dataTransfer();
    fireEvent.dragStart(tabs[2], { dataTransfer: dt });
    withRect(tabs[0], { width: 100, height: 30 });
    dragOverAt(tabs[0], dt, 80, 15); // a'nın sağ yarısı: a ile b'nin arası

    const lines = [...container.querySelectorAll(".tab-drop-line")];
    expect(lines.map((l) => l.parentElement!.getAttribute("data-drop"))).toEqual([
      "after",
      "before",
    ]);

    fireEvent.dragEnd(tabs[2], { dataTransfer: dt });
    expect(container.querySelector(".tab-drop-line")).toBe(null);
  });

  it("aynı yere bırakmak sırayı bozmuyor", () => {
    seed([group("g1", [tab("a"), tab("b"), tab("c")])]);
    const { container } = render(<TabBar />);
    const tabs = [...container.querySelectorAll(".tab")];

    const dt = dataTransfer();
    fireEvent.dragStart(tabs[1], { dataTransfer: dt });
    withRect(tabs[1], { left: 100, width: 100, height: 30 });
    dragOverAt(tabs[1], dt, 110, 15);
    fireEvent.drop(tabs[1], { dataTransfer: dt });

    expect(tabIds()).toBe("g1:a,b,c");
  });

  it("adlandırma sırasında sürükleme kapalı", () => {
    // Metin seçmek isteyen kullanıcı sekmeyi taşımasın.
    seed([group("g1", [tab("a"), tab("b")])]);
    const ui = useStore.getState().ui;
    useStore.setState({ ui: { ...ui, renamingTabId: "a" } });

    const { container } = render(<TabBar />);
    const renaming = container.querySelector(".tab.renaming");
    expect(renaming, "adlandırılan sekme bulunamadı").not.toBe(null);
    expect(renaming!.getAttribute("draggable")).toBe("false");

    useStore.setState({ ui: { ...useStore.getState().ui, renamingTabId: null } });
  });
});

// ----------------------------------------------------------------- gruplar

describe("grup sürükle-bırak (kenar çubuğu)", () => {
  it("grup başlıkları draggable", () => {
    seed([group("g1", [tab("a")]), group("g2", [tab("b")])]);
    const { container } = render(<GroupSidebar />);
    const rows = [...container.querySelectorAll(".group-row")];
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.getAttribute("draggable")).toBe("true");
    }
  });

  it("grubu yukarı taşıyor", () => {
    seed([group("g1", [tab("a")]), group("g2", [tab("b")]), group("g3", [tab("c")])]);
    const { container } = render(<GroupSidebar />);
    const sections = [...container.querySelectorAll(".group")];
    const rows = [...container.querySelectorAll(".group-row")];

    const dt = dataTransfer();
    fireEvent.dragStart(rows[2], { dataTransfer: dt });
    expect(dt.getData("text/plain")).toBe("g3");

    withRect(rows[0], { top: 0, width: 240, height: 30 });
    dragOverAt(rows[0], dt, 20, 5);
    fireEvent.drop(sections[0], { dataTransfer: dt });

    expect(groupIds()).toBe("g3,g1,g2");
  });

  it("grubu aşağı taşıyor", () => {
    seed([group("g1", [tab("a")]), group("g2", [tab("b")]), group("g3", [tab("c")])]);
    const { container } = render(<GroupSidebar />);
    const sections = [...container.querySelectorAll(".group")];
    const rows = [...container.querySelectorAll(".group-row")];

    const dt = dataTransfer();
    fireEvent.dragStart(rows[0], { dataTransfer: dt });
    withRect(rows[2], { top: 100, width: 240, height: 30 });
    dragOverAt(rows[2], dt, 20, 125);
    fireEvent.drop(sections[2], { dataTransfer: dt });

    expect(groupIds()).toBe("g2,g3,g1");
  });

  it("grubu kendi üzerine bırakmak sırayı bozmuyor", () => {
    seed([group("g1", [tab("a")]), group("g2", [tab("b")])]);
    const { container } = render(<GroupSidebar />);
    const sections = [...container.querySelectorAll(".group")];
    const rows = [...container.querySelectorAll(".group-row")];

    const dt = dataTransfer();
    fireEvent.dragStart(rows[0], { dataTransfer: dt });
    withRect(rows[0], { top: 0, width: 240, height: 30 });
    dragOverAt(rows[0], dt, 20, 5);
    fireEvent.drop(sections[0], { dataTransfer: dt });

    expect(groupIds()).toBe("g1,g2");
  });

  it("bırakma yeri çizgiyle gösteriliyor", () => {
    seed([group("g1", [tab("a")]), group("g2", [tab("b")])]);
    const { container } = render(<GroupSidebar />);
    const rows = [...container.querySelectorAll(".group-row")];

    const dt = dataTransfer();
    fireEvent.dragStart(rows[1], { dataTransfer: dt });
    withRect(rows[0], { top: 0, width: 240, height: 30 });
    dragOverAt(rows[0], dt, 20, 5);

    const marked = container.querySelector("[data-group-drop]");
    expect(marked, "grup bırakma göstergesi görünmeli").not.toBe(null);
    expect(marked!.getAttribute("data-group-drop")).toBe("before");
  });

  it("favori süzgeci açıkken sıralama tüm listeye göre", () => {
    // Ekranda görünen indeksle taşımak, süzgeç yüzünden kısalan listede
    // grupları yanlış yere koyuyordu.
    seed([
      group("g1", [tab("a")]),
      group("g2", [tab("b")], { favorite: true }),
      group("g3", [tab("c")], { favorite: true }),
    ]);
    const behavior = useStore.getState().settings.behavior;
    useStore.setState({
      settings: {
        ...useStore.getState().settings,
        behavior: { ...behavior, showOnlyFavoriteGroups: true },
      },
      activeGroupId: "g2",
    });

    const { container } = render(<GroupSidebar />);
    const sections = [...container.querySelectorAll(".group")];
    const rows = [...container.querySelectorAll(".group-row")];
    // Süzgeç açık: yalnızca g2 ve g3 görünüyor.
    expect(rows).toHaveLength(2);

    const dt = dataTransfer();
    fireEvent.dragStart(rows[1], { dataTransfer: dt }); // g3
    withRect(rows[0], { top: 0, width: 240, height: 30 });
    dragOverAt(rows[0], dt, 20, 5); // g2'nin önüne
    fireEvent.drop(sections[0], { dataTransfer: dt });

    // g3, g2'nin önüne geçmeli; g1 yerinde kalmalı.
    expect(groupIds()).toBe("g1,g3,g2");

    useStore.setState({
      settings: {
        ...useStore.getState().settings,
        behavior: { ...behavior, showOnlyFavoriteGroups: false },
      },
    });
  });

  it("sekme sürüklenirken grup sıralaması tetiklenmiyor", () => {
    // İki sürükleme türü aynı hedefe geliyor; karışmamaları gerekiyor.
    seed([group("g1", [tab("a"), tab("b")]), group("g2", [tab("c")])]);
    const { container } = render(<GroupSidebar />);
    const rows = [...container.querySelectorAll(".group-row")];
    const tabRows = [...container.querySelectorAll(".tab-row")];

    const dt = dataTransfer();
    fireEvent.dragStart(tabRows[0], { dataTransfer: dt }); // sekme "a"
    withRect(rows[1], { top: 100, width: 240, height: 30 });
    dragOverAt(rows[1], dt, 20, 125);

    // Grup göstergesi çıkmamalı.
    expect(container.querySelector("[data-group-drop]")).toBe(null);

    fireEvent.drop(rows[1], { dataTransfer: dt });
    // Sekme g2'ye taşınmalı, grup sırası değişmemeli.
    expect(groupIds()).toBe("g1,g2");
    expect(tabIds()).toBe("g1:b | g2:c,a");
  });

  it("sekme grup içinde yeniden sıralanıyor", () => {
    seed([group("g1", [tab("a"), tab("b"), tab("c")])]);
    const { container } = render(<GroupSidebar />);
    const tabRows = [...container.querySelectorAll(".tab-row")];

    const dt = dataTransfer();
    fireEvent.dragStart(tabRows[2], { dataTransfer: dt }); // "c"
    withRect(tabRows[0], { top: 0, width: 240, height: 24 });
    dragOverAt(tabRows[0], dt, 20, 4);
    fireEvent.drop(tabRows[0], { dataTransfer: dt });

    expect(tabIds()).toBe("g1:c,a,b");
  });

  it("sekme sürüklemesi kenar çubuğuna öğe eklemiyor", () => {
    // Sürüklenirken eklenen her öğe alttaki satırları kaydırıyordu: tutulup
    // yerinde bırakılan sekme başka bir yere düşüyordu, WebKit (macOS) de fare
    // basılan noktadan kayan öğenin sürüklemesini hiç başlatmıyordu. jsdom
    // yerleşim yapmadığı için ölçülen şey sebebin kendisi: öğe sayısı.
    seed([group("g1", [tab("a")]), group("g2", [tab("b")]), group("g3", [tab("c")])]);
    const { container } = render(<GroupSidebar />);
    const count = () => container.querySelectorAll("*").length;
    const before = count();
    const tabRows = [...container.querySelectorAll(".tab-row")];

    const dt = dataTransfer();
    fireEvent.dragStart(tabRows[2], { dataTransfer: dt }); // "c", üçüncü grupta
    expect(count(), "dragstart'ta öğe eklendi").toBe(before);
    withRect(tabRows[2], { top: 200, width: 240, height: 24 });
    dragOverAt(tabRows[2], dt, 20, 204);
    expect(count(), "dragover'da öğe eklendi").toBe(before);
  });

  it("listenin sonu 'Sekme ekle' satırı", () => {
    seed([group("g1", [tab("a"), tab("b")]), group("g2", [tab("c")])]);
    const { container } = render(<GroupSidebar />);
    const tabRows = [...container.querySelectorAll(".tab-row")];
    const addTab = container.querySelectorAll(".add-tab")[0];

    const dt = dataTransfer();
    fireEvent.dragStart(tabRows[2], { dataTransfer: dt }); // "c"
    dragOverAt(addTab, dt, 20, 0);
    // Gösterge son satırın altındaki çizgi.
    expect(tabRows[1].getAttribute("data-drop")).toBe("after");
    fireEvent.drop(addTab, { dataTransfer: dt });

    expect(tabIds()).toBe("g1:a,b,c | g2:");
  });

  it("boş gruba 'Sekme ekle' satırından bırakılıyor", () => {
    seed([group("g1", [tab("a"), tab("b")]), group("g2", [])]);
    const { container } = render(<GroupSidebar />);
    const tabRows = [...container.querySelectorAll(".tab-row")];
    const addTab = container.querySelectorAll(".add-tab")[1];

    const dt = dataTransfer();
    fireEvent.dragStart(tabRows[0], { dataTransfer: dt }); // "a"
    dragOverAt(addTab, dt, 20, 0);
    fireEvent.drop(addTab, { dataTransfer: dt });

    expect(tabIds()).toBe("g1:b | g2:a");
  });
});
