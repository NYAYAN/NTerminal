// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Group, TabState } from "../types";

/**
 * Komut paleti (⇧⌘P): eylemler, grup/sekme/profil geçişleri tek listede.
 *
 * Palet uygulamanın "her şeyi buradan bul" kapısı; yanlış eylemi çalıştırmak
 * (Enter'ın seçili satıra değil ilk satıra gitmesi) ya da süzgecin bir girdiyi
 * yutması sessiz bir hata. Doğrudan testi yoktu; davranış yalnızca `App`
 * üzerinden dolaylı görülüyordu.
 */

vi.mock("../lib/ipc", () => ({
  api: new Proxy({} as Record<string, unknown>, {
    get: (target, prop) => target[prop as string] ?? (async () => undefined),
  }),
  onPtyData: async () => () => {},
  onPtyExit: async () => () => {},
}));

const { useStore } = await import("../store/useStore");
const { setLanguage } = await import("../lib/i18n");
const { CommandPalette } = await import("./CommandPalette");

function tab(id: string, title: string): TabState {
  return {
    id,
    title,
    customTitle: null,
    profileId: "p1",
    cwd: "/tmp",
    createdAt: 0,
    lastActiveAt: 0,
    hasScrollback: false,
    lastCommand: null,
    locked: false,
  };
}

function group(id: string, name: string, tabs: TabState[]): Group {
  return {
    id,
    name,
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
  };
}

const rows = (c: HTMLElement) => [...c.querySelectorAll(".palette-row .txt")].map((el) => el.textContent);
const input = (c: HTMLElement) => c.querySelector<HTMLInputElement>(".palette input")!;

beforeEach(() => {
  setLanguage("tr");
  const s = useStore.getState();
  useStore.setState({
    groups: [group("g1", "Yayın", [tab("t1", "build")]), group("g2", "Geliştirme", [])],
    activeGroupId: "g1",
    favorites: [],
    settings: {
      ...s.settings,
      profiles: [
        { ...s.settings.profiles[0], id: "p1", name: "Zsh", kind: "zsh", shell: "/bin/zsh", args: [], cwd: null, env: {}, shellIntegration: true, color: null, icon: null, unavailable: false },
        { ...s.settings.profiles[0], id: "p2", name: "Pwsh", kind: "pwsh", shell: "pwsh.exe", args: [], cwd: null, env: {}, shellIntegration: true, color: null, icon: null, unavailable: true },
      ],
    },
    ui: { ...s.ui, paletteOpen: true, settingsOpen: false, toast: null } as typeof s.ui,
  });
});

afterEach(cleanup);

describe("komut paleti", () => {
  it("eylemler, gruplar, sekmeler ve profiller listede", () => {
    const { container } = render(<CommandPalette />);
    const list = rows(container);
    expect(list).toContain("Ayarlar");
    expect(list).toContain("Gruba geç: Yayın");
    expect(list).toContain("Sekmeye geç: build");
    expect(list).toContain("Yeni sekme: Pwsh");
    // Bu makinede olmayan profil ipucuyla işaretli.
    const pwsh = [...container.querySelectorAll(".palette-row")].find((r) => r.textContent?.includes("Yeni sekme: Pwsh"))!;
    expect(pwsh.textContent).toContain("Bu makinede yok");
  });

  it("yazınca süzüyor, hiç eşleşme yoksa söylüyor", () => {
    const { container } = render(<CommandPalette />);
    fireEvent.change(input(container), { target: { value: "ayarlar" } });
    // Bulanık eşleşme başka satırları da getirebilir; tam ad en üstte.
    expect(rows(container)[0]).toBe("Ayarlar");
    expect(rows(container)).not.toContain("Gruba geç: Yayın");
    fireEvent.change(input(container), { target: { value: "böyle bir şey yok xq" } });
    expect(rows(container)).toEqual([]);
    expect(container.querySelector(".palette-list .hint")?.textContent).toBe("Eşleşen eylem yok.");
  });

  it("ok tuşları seçimi taşıyor, Enter SEÇİLİ satırı çalıştırıyor", () => {
    const { container } = render(<CommandPalette />);
    fireEvent.change(input(container), { target: { value: "Gruba geç" } });
    expect(rows(container)).toEqual(["Gruba geç: Yayın", "Gruba geç: Geliştirme"]);
    fireEvent.keyDown(input(container), { key: "ArrowDown" });
    expect(container.querySelectorAll(".palette-row")[1].className).toContain("on");
    fireEvent.keyDown(input(container), { key: "Enter" });
    expect(useStore.getState().activeGroupId, "ikinci satır (Geliştirme) seçilmeliydi").toBe("g2");
    expect(useStore.getState().ui.paletteOpen, "eylemden sonra palet kapanmalı").toBe(false);
  });

  it("tıklamak eylemi çalıştırıyor: Ayarlar açılıyor", () => {
    const { container } = render(<CommandPalette />);
    fireEvent.change(input(container), { target: { value: "ayarlar" } });
    fireEvent.click(container.querySelector(".palette-row")!);
    expect(useStore.getState().ui.settingsOpen).toBe(true);
    expect(useStore.getState().ui.paletteOpen).toBe(false);
  });

  it("Esc ve örtüye tıklamak kapatıyor, hiçbir eylem çalışmıyor", () => {
    const { container } = render(<CommandPalette />);
    fireEvent.keyDown(input(container), { key: "Escape" });
    expect(useStore.getState().ui.paletteOpen).toBe(false);
    useStore.setState({ ui: { ...useStore.getState().ui, paletteOpen: true } });
    fireEvent.mouseDown(container.querySelector(".overlay")!);
    expect(useStore.getState().ui.paletteOpen).toBe(false);
    expect(useStore.getState().activeGroupId).toBe("g1");
    expect(useStore.getState().ui.settingsOpen).toBe(false);
  });

  it("olmayan profille sekme açmak yerine uyarıyor", () => {
    const { container } = render(<CommandPalette />);
    const before = useStore.getState().groups.flatMap((g) => g.tabs).length;
    fireEvent.change(input(container), { target: { value: "Pwsh" } });
    fireEvent.keyDown(input(container), { key: "Enter" });
    expect(useStore.getState().groups.flatMap((g) => g.tabs).length, "sekme açılmamalı").toBe(before);
    expect(useStore.getState().ui.toast?.tone).toBe("err");
  });
});
