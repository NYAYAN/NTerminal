// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { setLanguage } from "../lib/i18n";
import { setPlatform } from "../lib/platform";
import { useStore } from "../store/useStore";
import type { Group, Profile, TabState } from "../types";
import { TabBar } from "./TabBar";

/**
 * Sekme çubuğundaki "+" yanındaki profil menüsü.
 *
 * BİLDİRİLEN HATA: menüdeki "Profilleri düzenle…" ayarlar penceresini
 * açıyordu ama pencere "Genel" bölümünde kalıyordu — oysa öğenin sözü tam
 * olarak profilleri düzenlemek. Kullanıcı açılan pencerede aradığını bulamayıp
 * kenar çubuğunda aramak zorundaydı.
 *
 * Menü bölümü ADLANDIRIYOR; pencerenin o isteği okuyup tükettiği ise
 * `SettingsDialog.test.tsx` içinde bağlı.
 */

const ZSH: Profile = {
  id: "p1",
  name: "Zsh",
  kind: "custom",
  shell: "/bin/zsh",
  args: [],
  cwd: null,
  env: {},
  shellIntegration: true,
  color: "#58a6ff",
  icon: null,
  unavailable: false,
};

const BASH: Profile = { ...ZSH, id: "p2", name: "Bash", shell: "/bin/bash" };

function tab(): TabState {
  return {
    id: "t1",
    title: "t1",
    customTitle: "t1",
    profileId: "p1",
    cwd: null,
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

/** "+"nın yanındaki, profil menüsünü açan düğme. */
function menuButton(c: HTMLElement): HTMLButtonElement {
  const found = [...c.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => (b.getAttribute("title") ?? "") === "Profil seçerek yeni sekme",
  );
  expect(found, "profil menüsü düğmesi bulunamadı").toBeTruthy();
  return found!;
}

/** Açık menüdeki bir öğe. */
function menuItem(c: HTMLElement, label: string): HTMLButtonElement {
  const found = [...c.querySelectorAll<HTMLButtonElement>("button")].find((b) =>
    (b.textContent ?? "").includes(label),
  );
  expect(found, `"${label}" menü öğesi yok`).toBeTruthy();
  return found!;
}

beforeEach(() => {
  setLanguage("tr");
  setPlatform("macos");
  const state = useStore.getState();
  useStore.setState({
    ready: true,
    groups: [group()],
    activeGroupId: "g1",
    ui: { ...state.ui, settingsOpen: false, settingsSection: null },
    settings: {
      ...state.settings,
      profiles: [ZSH, BASH],
      defaultProfileId: "p1",
    },
  });
});

afterEach(() => {
  cleanup();
  const ui = useStore.getState().ui;
  useStore.setState({ ui: { ...ui, settingsOpen: false, settingsSection: null } });
});

describe("profil menüsü", () => {
  it("profiller ve düzenleme öğesi listeleniyor", async () => {
    const { container } = render(<TabBar />);
    await act(async () => {
      fireEvent.click(menuButton(container));
    });

    const labels = [...container.querySelectorAll(".ctx-menu .ctx-label")].map((b) =>
      (b.textContent ?? "").trim(),
    );
    expect(labels).toContain("Zsh");
    expect(labels).toContain("Bash");
    expect(labels.some((l) => l.startsWith("Profilleri düzenle"))).toBe(true);
  });

  it("'Profilleri düzenle' ayarları PROFİLLER bölümünde açıyor", async () => {
    const { container } = render(<TabBar />);
    await act(async () => {
      fireEvent.click(menuButton(container));
    });
    await act(async () => {
      fireEvent.click(menuItem(container, "Profilleri düzenle"));
    });

    const ui = useStore.getState().ui;
    expect(ui.settingsOpen, "ayarlar açılmadı").toBe(true);
    expect(ui.settingsSection, "bölüm istenmemiş — pencere Genel'de kalır").toBe("profiles");
  });
});
