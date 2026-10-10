// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { setLanguage } from "../lib/i18n";
import { useStore } from "../store/useStore";
import type { Group, TabState } from "../types";
import { TabBar } from "./TabBar";

/**
 * Sekme adlandırma kutusu, adlandırma HANGİ yoldan başlarsa başlasın sekmenin
 * o anki adıyla açılmalı.
 *
 * ## Ölçülen hata
 *
 * Kutunun metnini (`TabBar`'daki taslak) yalnızca çift tıklama ve sağ tık
 * menüsü dolduruyordu. Kısayol (`App`, `keys.renameTab`) ve paletteki
 * "Sekmeyi yeniden adlandır" yalnızca `renamingTabId` yazıyor; kutu bir önceki
 * adlandırmadan kalan metinle açılıyordu:
 *
 * - A'yı ("api") çift tıklayıp Esc ile vazgeçtikten sonra B'de ("web")
 *   kısayola basınca kutuda "api" çıkıyor, odak kaçınca "api" B'ye
 *   yazılıyordu.
 * - Uygulama yeni açıldığında kutu boş geliyor, odak kaçınca B'nin özel adı
 *   siliniyordu (boş metin "özel adı kaldır" demek).
 */

function tab(id: string, patch: Partial<TabState> = {}): TabState {
  return {
    id,
    title: "zsh",
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

function seed(tabs: TabState[], activeTabId: string) {
  const g: Group = {
    id: "g1",
    name: "g1",
    color: null,
    icon: null,
    collapsed: false,
    favorite: false,
    ungrouped: false,
    defaultProfileId: null,
    defaultCwd: null,
    env: {},
    activeTabId,
    tabs,
  };
  // Şerit: Premium/Klasik yerleşimi. Kokpit'teki yol aynı taslağı paylaşıyor;
  // onun kutusu `kokpit.test.tsx` içinde.
  const settings = useStore.getState().settings;
  useStore.setState({
    groups: [g],
    activeGroupId: g.id,
    settings: { ...settings, appearance: { ...settings.appearance, design: "premium" } },
  });
}

const twoTabs = () => [tab("a", { customTitle: "api" }), tab("b", { customTitle: "web" })];

/** Kısayolun ve paletteki eylemin yaptığının aynısı: yalnızca kimliği yazmak. */
function renameActiveTabByShortcut() {
  act(() => {
    const store = useStore.getState();
    const active = store.activeTab();
    if (active) store.setUi({ renamingTabId: active.tab.id });
  });
}

const tabEls = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>(".tab")];
const renameBox = (c: HTMLElement) => c.querySelector<HTMLInputElement>("input.tab-rename");
const customTitle = (id: string) =>
  useStore
    .getState()
    .groups.flatMap((g) => g.tabs)
    .find((t) => t.id === id)?.customTitle;

/** A'yı çift tıklayıp (tıklamalar onu etkin de yapıyor) Esc ile vazgeçer, sonra B'yi seçer. */
function cancelOnAThenSelectB(c: HTMLElement) {
  const [a, b] = tabEls(c);
  fireEvent.click(a);
  fireEvent.doubleClick(a);
  expect(renameBox(c)?.value).toBe("api");
  fireEvent.keyDown(renameBox(c)!, { key: "Escape" });
  expect(renameBox(c), "Esc kutuyu kapatmalı").toBe(null);
  fireEvent.click(b);
}

beforeEach(() => {
  setLanguage("tr");
});

afterEach(() => {
  cleanup();
  useStore.setState({
    groups: [],
    activeGroupId: null,
    ui: { ...useStore.getState().ui, renamingTabId: null },
  });
});

describe("sekme adlandırma kutusunun ilk metni", () => {
  it("ilk açılışta kısayol kutuyu sekmenin kendi adıyla açıyor", () => {
    seed(twoTabs(), "b");
    const { container } = render(<TabBar />);

    renameActiveTabByShortcut();

    expect(renameBox(container)?.value).toBe("web");
  });

  it("A'da vazgeçtikten sonra B'de kısayol B'nin adını gösteriyor", () => {
    seed(twoTabs(), "a");
    const { container } = render(<TabBar />);
    cancelOnAThenSelectB(container);

    renameActiveTabByShortcut();

    expect(renameBox(container)?.value).toBe("web");
  });

  it.each([
    ["ilk açılışta", false],
    ["A'da vazgeçtikten sonra", true],
  ])("%s hiçbir şey yazmadan odak kaçınca B'nin adı değişmiyor", (_, afterCancel) => {
    seed(twoTabs(), afterCancel ? "a" : "b");
    const { container } = render(<TabBar />);
    if (afterCancel) cancelOnAThenSelectB(container);

    renameActiveTabByShortcut();
    fireEvent.blur(renameBox(container)!);

    expect(renameBox(container)).toBe(null);
    expect(customTitle("b")).toBe("web");
    expect(customTitle("a")).toBe("api");
  });

  it("çift tıklamada yazılan metin, adlandırma sürerken sekme adı değişse de korunuyor", () => {
    // Taslak yalnızca adlandırma BAŞLARKEN dolmalı: kabuk her istemde klasörü
    // bildiriyor ve adı klasörden gelen sekmenin etiketi kutu açıkken değişiyor.
    seed([tab("a", { cwd: "/Users/n/proje" })], "a");
    const { container } = render(<TabBar />);

    fireEvent.doubleClick(tabEls(container)[0]);
    expect(renameBox(container)?.value).toBe("proje");

    fireEvent.change(renameBox(container)!, { target: { value: "yeni ad" } });
    act(() => useStore.getState().updateTab("a", { cwd: "/Users/n/baska" }));
    expect(renameBox(container)?.value).toBe("yeni ad");

    fireEvent.keyDown(renameBox(container)!, { key: "Enter" });
    expect(customTitle("a")).toBe("yeni ad");
  });
});
