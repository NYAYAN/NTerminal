// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Design } from "../lib/design";
import { setLanguage } from "../lib/i18n";
import { sessions, useStore } from "../store/useStore";
import type { Appearance, Behavior, Group, TabState } from "../types";
import { groupInitials } from "../lib/labels";
import { portLabel } from "../lib/serverLinks";
import { GroupRail } from "./GroupRail";
import { GroupSidebar } from "./GroupSidebar";
import { TabBar } from "./TabBar";

/**
 * Kokpit yerleşimi: solda grup rayı, yanında yalnızca etkin grubun sekme
 * kartları, sekme şeridinin yerinde "grup › sekme" yolu.
 *
 * Görünüş CSS'te (`styles/kokpit.css`, kapsamı `premium.test.ts` bağlıyor);
 * burada bağlanan şey DAVRANIŞ: hangi grubun gösterildiği, gruplar arası
 * geçişin raydan yapılması, panel düğmelerinin aç/kapa mantığı ve Kokpit
 * dışındaki tasarımların hiç etkilenmemesi.
 */

/** Özel adsız sekme: ad kabuk başlığından (`id`) ya da klasörden geliyor. */
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

function seed(
  groups: Group[],
  options: {
    design?: Design;
    activeGroupId?: string | null;
    appearance?: Partial<Appearance>;
    behavior?: Partial<Behavior>;
    running?: Record<string, boolean>;
  } = {},
) {
  const s = initial.settings;
  useStore.setState({
    ready: true,
    groups,
    activeGroupId: options.activeGroupId === undefined ? (groups[0]?.id ?? null) : options.activeGroupId,
    running: options.running ?? {},
    exited: {},
    runLinks: {},
    settings: {
      ...s,
      appearance: { ...s.appearance, design: options.design ?? "kokpit", ...options.appearance },
      behavior: { ...s.behavior, ...options.behavior },
    },
    ui: { ...initial.ui, historyOpen: false, panelMode: "history", settingsOpen: false, renamingTabId: null },
  });
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
    runLinks: {},
    settings: initial.settings,
    ui: initial.ui,
    addGroup: initial.addGroup,
  });
});

// ------------------------------------------------------------------ ray

describe("Kokpit: grup rayı", () => {
  it("her grup bir karo; etkin olan işaretli, tıklamak grubu değiştiriyor", () => {
    seed([
      group("g1", [tab("a")], { name: "NTerminal", color: "#58a6ff" }),
      group("g2", [tab("b")], { name: "CopyBoard" }),
    ]);
    const { container } = render(<GroupRail />);
    const items = () => [...container.querySelectorAll(".grail-item")] as HTMLElement[];
    expect(items().map((el) => el.textContent)).toEqual(["NT", "CB"]);
    expect(items().map((el) => el.getAttribute("aria-label"))).toEqual(["NTerminal", "CopyBoard"]);
    expect(items()[0].getAttribute("aria-current")).toBe("true");
    expect(items()[1].getAttribute("aria-current")).toBeNull();

    fireEvent.click(items()[1]);
    expect(useStore.getState().activeGroupId).toBe("g2");
    expect(items()[1].getAttribute("aria-current")).toBe("true");
    expect(items()[0].getAttribute("aria-current")).toBeNull();
  });

  it("komut çalışan grubun karosunda meşgul noktası var", () => {
    seed([group("g1", [tab("a")]), group("g2", [tab("b")])], { running: { b: true } });
    const { container } = render(<GroupRail />);
    const items = [...container.querySelectorAll(".grail-item")];
    expect(items[0].querySelector(".grail-busy")).toBeNull();
    expect(items[1].querySelector(".grail-busy")).not.toBeNull();
  });

  /*
   * Favori süzgeci rayda da geçerli. İSTEK: "Favoriye ekli grupları
   * listelemek istediğimde listeleme yapamıyorum." Ray eskiden süzgeci yok
   * sayıyordu (bir grubu gizlemek ona ulaşmanın tek yolunu kapatırdı); artık
   * süzgecin düğmesi rayın kendisinde ve dar rayda da açıkken görünüyor.
   * Ayrıntılar `railTree.test.tsx` içinde.
   */
  it("favori süzgeci açıkken rayda yalnız favoriler; dar rayda kapatma düğmesi duruyor", () => {
    seed([group("g1", [tab("a")], { favorite: true }), group("g2", [tab("b")])], {
      behavior: { showOnlyFavoriteGroups: true },
    });
    const { container } = render(<GroupRail />);
    const labels = [...container.querySelectorAll(".grail-item")].map((el) => el.getAttribute("aria-label"));
    expect(labels).toEqual(["g1"]);
    expect(container.querySelector(".grail-head .grail-favorites")?.getAttribute("aria-pressed")).toBe("true");
  });

  it("gruplanmamış kova adıyla ve simgeyle duruyor", () => {
    seed([group("loose", [tab("a")], { ungrouped: true, name: "" }), group("g1", [tab("b")])]);
    const { container } = render(<GroupRail />);
    const first = container.querySelector(".grail-item")!;
    expect(first.getAttribute("aria-label")).toBe("Gruplanmamış");
    expect(first.querySelector("svg")).not.toBeNull();
  });

  it("artı düğmesi yeni grup açıyor", () => {
    const addGroup = vi.fn();
    seed([group("g1", [tab("a")])]);
    useStore.setState({ addGroup } as never);
    const { container } = render(<GroupRail />);
    fireEvent.click(container.querySelector(".grail-add")!);
    expect(addGroup).toHaveBeenCalledTimes(1);
  });

  /*
   * İSTEK: "git iconu ekleyelim, basınca değişiklikler sekmesi açılır olsun".
   * Üç panel düğmesi durum çubuğundakilerle aynı mantıkta: kapalıysa o kipte
   * açıyor, başka kip açıksa ona geçiyor, aynı kip açıksa kapatıyor.
   */
  it("geçmiş, favoriler ve değişiklikler paneli açıp kapatıyor", () => {
    seed([group("g1", [tab("a")])]);
    const { getByLabelText } = render(<GroupRail />);
    const ui = () => useStore.getState().ui;
    const changes = getByLabelText("Değişiklikler");

    fireEvent.click(changes);
    expect(ui().historyOpen).toBe(true);
    expect(ui().panelMode).toBe("git");
    expect(changes.getAttribute("aria-pressed")).toBe("true");

    const history = getByLabelText(/^Komut geçmişi/);
    fireEvent.click(history);
    expect(ui().historyOpen).toBe(true);
    expect(ui().panelMode).toBe("history");
    expect(changes.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(history);
    expect(ui().historyOpen).toBe(false);

    fireEvent.click(getByLabelText(/^Favori komutlar/));
    expect(ui().historyOpen).toBe(true);
    expect(ui().panelMode).toBe("favorites");
  });

  it("dişli Ayarlar'ı açıyor", () => {
    seed([group("g1", [tab("a")])]);
    const { getByLabelText } = render(<GroupRail />);
    fireEvent.click(getByLabelText(/^Ayarlar/));
    expect(useStore.getState().ui.settingsOpen).toBe(true);
  });
});

describe("grup baş harfleri", () => {
  it.each([
    ["NTerminal", "NT"],
    ["CopyBoard", "CB"],
    ["Yeni grup", "YG"],
    ["api-gateway", "AG"],
    ["sunucular", "Su"],
    // Türkçe büyük harf: i → İ.
    ["istemci", "İs"],
    ["x", "X"],
    ["   ", "·"],
  ])("%s → %s", (name, expected) => {
    expect(groupInitials({ name })).toBe(expected);
  });
});

// --------------------------------------------------------- sekme sütunu

describe("Kokpit: sekme sütunu", () => {
  const titles = (root: HTMLElement) =>
    [...root.querySelectorAll(".tab-row-title")].map((el) => el.textContent);

  it("yalnızca etkin grubun sekmeleri, grup katlanmış olsa da", () => {
    seed(
      [group("g1", [tab("a"), tab("b")], { collapsed: true }), group("g2", [tab("c")])],
      { activeGroupId: "g1" },
    );
    const { container } = render(<GroupSidebar />);
    expect(container.querySelectorAll("section.group")).toHaveLength(1);
    expect(titles(container)).toEqual(["a", "b"]);

    act(() => useStore.getState().setActiveGroup("g2"));
    expect(titles(container)).toEqual(["c"]);
  });

  it("favori süzgeci sütunu boşaltmıyor", () => {
    seed([group("g1", [tab("a")])], { behavior: { showOnlyFavoriteGroups: true } });
    const { container } = render(<GroupSidebar />);
    expect(titles(container)).toEqual(["a"]);
    expect(container.querySelector(".sidebar-scroll > .hint")).toBeNull();
  });

  it("kart: klasör, son komut ve komut sürerken sunucunun portu", () => {
    seed(
      [
        group("g1", [
          tab("a", { cwd: "/Users/x/Work/NTerminal/src", lastCommand: "npm start" }),
          tab("b", { cwd: "/Users/x/Work", lastCommand: "git status" }),
        ]),
      ],
      { running: { a: true } },
    );
    sessions.set("a", { runUrls: () => ["http://localhost:5273/"] } as never);
    sessions.set("b", { runUrls: () => ["http://localhost:9999/"] } as never);
    const { container } = render(<GroupSidebar />);
    const [a, b] = [...container.querySelectorAll(".tab-row")];

    expect(a.querySelector(".tab-row-path")!.textContent).toBe("…/Work/NTerminal/src");
    expect(a.querySelector(".tab-row-last")!.classList.contains("running")).toBe(true);
    expect(a.querySelector(".tab-row-cmd")!.textContent).toBe("npm start");
    expect(a.querySelector(".tab-row-port")!.textContent).toBe(":5273");

    // Komut bitmiş sekmede port YOK: ölü bir porta işaret etmek yanıltır.
    expect(b.querySelector(".tab-row-last")!.classList.contains("running")).toBe(false);
    expect(b.querySelector(".tab-row-port")).toBeNull();
    // Kart satırları eski alt satırın yerini alıyor; ikisi birden çizilmiyor.
    expect(container.querySelector(".tab-row-sub")).toBeNull();
  });

  it("gruplanmamış kovanın da başlığı var", () => {
    seed([group("loose", [tab("a")], { ungrouped: true, name: "" })]);
    const { container } = render(<GroupSidebar />);
    expect(container.querySelector(".loose-head .group-name")!.textContent).toBe("Gruplanmamış");
  });

  it("grup başlığı sürüklenmiyor (sütunda sıralanacak başka grup yok)", () => {
    seed([group("g1", [tab("a")])]);
    const { container } = render(<GroupSidebar />);
    expect(container.querySelector(".group-row")!.getAttribute("draggable")).toBe("false");
  });

  it("Kokpit dışında kenar çubuğu eskisi gibi", () => {
    seed([group("g1", [tab("a", { lastCommand: "ls" })]), group("g2", [tab("b")])], {
      design: "premium",
    });
    const { container } = render(<GroupSidebar />);
    expect(container.querySelectorAll("section.group")).toHaveLength(2);
    expect(container.querySelector(".tab-row-sub")!.textContent).toBe("ls");
    expect(container.querySelector(".tab-row-path")).toBeNull();
    expect(container.querySelector(".group-row")!.getAttribute("draggable")).toBe("true");
  });
});

describe("port etiketi", () => {
  it.each([
    ["http://localhost:5273/", ":5273"],
    ["https://127.0.0.1:8443/app", ":8443"],
    ["http://intranet.local/", "intranet.local"],
  ])("%s → %s", (url, expected) => {
    expect(portLabel(url)).toBe(expected);
  });
});

// --------------------------------------------------------- sekme çubuğu

describe("Kokpit: sekme çubuğu", () => {
  it("şeridin yerinde grup › sekme yolu", () => {
    seed([group("g1", [tab("a"), tab("b")], { name: "NTerminal", activeTabId: "b" })]);
    const { container } = render(<TabBar />);
    expect(container.querySelector(".tabbar-strip")).toBeNull();
    expect(container.querySelector(".crumb-group")!.textContent).toBe("NTerminal");
    expect(container.querySelector(".crumb-tab")!.textContent).toBe("b");
  });

  /*
   * Sekme sütunu kapatılınca sekmelere ulaşmanın başka yolu kalmıyor: şerit
   * geri geliyor.
   */
  it("kenar çubuğu kapalıyken şerit geri geliyor", () => {
    seed([group("g1", [tab("a"), tab("b")])], { appearance: { sidebarCollapsed: true } });
    const { container } = render(<TabBar />);
    expect(container.querySelector(".tabbar-crumb")).toBeNull();
    expect(container.querySelectorAll(".tabbar-strip .tab")).toHaveLength(2);
  });

  it("yeniden adlandırma kutusu yolda açılıyor", () => {
    seed([group("g1", [tab("a"), tab("b")], { activeTabId: "b" })]);
    const { container } = render(<TabBar />);
    act(() => useStore.getState().setUi({ renamingTabId: "b" }));
    const input = container.querySelector(".tabbar-crumb input.tab-rename") as HTMLInputElement;
    expect(input).not.toBeNull();
    fireEvent.change(input, { target: { value: "sunucu" } });
    fireEvent.keyDown(input, { key: "Enter" });
    const b = useStore.getState().groups[0].tabs.find((x) => x.id === "b")!;
    expect(b.customTitle).toBe("sunucu");
    expect(useStore.getState().ui.renamingTabId).toBeNull();
  });

  it("Kokpit dışında yol yok, şerit var", () => {
    seed([group("g1", [tab("a")])], { design: "premium" });
    const { container } = render(<TabBar />);
    expect(container.querySelector(".tabbar-crumb")).toBeNull();
    expect(container.querySelector(".tabbar-strip")).not.toBeNull();
  });
});
