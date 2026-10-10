// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLanguage } from "../lib/i18n";
import { promptedTabs } from "../lib/promptSeen";
import { sessions, useStore } from "../store/useStore";
import type { Favorite, Group, TabState } from "../types";
import { CommandInput } from "./CommandInput";

/**
 * Komut kutusunda favori kısaltması: Enter'da ne gidiyor, Enter'dan önce ne
 * görünüyor.
 *
 * İSTEK: "nrb dediğimde çalışsın ... terminalde hangi klasör dizinindeyse
 * orada çalışmalı." Açılımın kuralı `lib/aliases.test.ts` içinde; burada
 * kutunun onu doğru yerde uyguladığı bağlanıyor — kabuğa giden baytlar,
 * kullanım sayacı ve çalışan programa giden yanıtın açılMAMASI.
 */

const TAB = "t1";

function tab(id: string): TabState {
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
  };
}

function group(id: string, tabs: TabState[]): Group {
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
  };
}

function fav(id: string, command: string, alias: string, groupId: string | null = null): Favorite {
  return {
    id,
    command,
    label: null,
    note: null,
    groupId,
    folder: null,
    // Favorinin kendi klasörü var ama kısaltma ona GEÇMİYOR.
    cwd: "/baska/klasor",
    alias,
    createdAt: 0,
    usedCount: 0,
    lastUsedAt: null,
  };
}

const sendKeys = vi.fn();
const markFavoriteUsed = vi.fn(async () => {});
const changeDir = vi.fn(() => true);
const inputSignals = vi.fn(() => ({ atPrompt: true, altScreen: false, integration: true }));
const initial = useStore.getState();

function seed(running = false) {
  const signals = { atPrompt: !running, altScreen: false, integration: true };
  inputSignals.mockReturnValue(signals);
  useStore.setState({
    groups: [group("g1", [tab(TAB)]), group("g2", [tab("t2")])],
    activeGroupId: "g1",
    ready: true,
    inputSignals: { [TAB]: signals },
    running: running ? { [TAB]: true } : {},
    favorites: [
      fav("f1", "npm run build --configuration", "nrb"),
      fav("f2", "make deploy", "dep", "g2"),
    ],
    markFavoriteUsed,
    changeDir,
    settings: { ...initial.settings, behavior: { ...initial.settings.behavior, appInput: true } },
    ui: { ...initial.ui, suggest: null },
  } as never);
}

const field = (c: HTMLElement) => c.querySelector<HTMLTextAreaElement>(".command-input-field")!;
const hint = (c: HTMLElement) => c.querySelector(".alias-hint .alias-hint-cmd")?.textContent ?? null;

function typeAndEnter(c: HTMLElement, text: string) {
  fireEvent.change(field(c), { target: { value: text } });
  fireEvent.keyDown(field(c), { key: "Enter" });
}

beforeEach(() => {
  setLanguage("tr");
  promptedTabs.clear();
  sendKeys.mockClear();
  markFavoriteUsed.mockClear();
  changeDir.mockClear();
  sessions.set(TAB, {
    sendKeys,
    focus: vi.fn(),
    setAppInput: vi.fn(),
    inputSignals,
    applicationCursorKeys: () => false,
    secretPrompt: () => false,
  } as never);
  seed();
});

afterEach(() => {
  cleanup();
  sessions.delete(TAB);
  useStore.setState({
    groups: [],
    activeGroupId: null,
    inputSignals: {},
    running: {},
    favorites: [],
    markFavoriteUsed: initial.markFavoriteUsed,
    changeDir: initial.changeDir,
  });
});

describe("komut kutusunda kısaltma", () => {
  it("Enter favorinin komutunu gönderiyor, arkasına yazılanlar sonda", () => {
    const { container } = render(<CommandInput />);
    typeAndEnter(container, "nrb --watch");
    expect(sendKeys).toHaveBeenCalledWith("npm run build --configuration --watch\r");
    expect(markFavoriteUsed).toHaveBeenCalledWith("f1");
  });

  it("bulunulan klasörde çalışıyor: favorinin klasörüne geçilmiyor", () => {
    const { container } = render(<CommandInput />);
    typeAndEnter(container, "nrb");
    expect(changeDir).not.toHaveBeenCalled();
    expect(sendKeys).toHaveBeenCalledTimes(1);
    expect(sendKeys).toHaveBeenCalledWith("npm run build --configuration\r");
  });

  it("Enter'dan önce açılım kutunun yanında görünüyor", () => {
    const { container } = render(<CommandInput />);
    fireEvent.change(field(container), { target: { value: "nrb" } });
    expect(hint(container)).toBe("npm run build --configuration");
    fireEvent.change(field(container), { target: { value: "npm test" } });
    expect(hint(container)).toBeNull();
  });

  it("kısaltma olmayan satır olduğu gibi gidiyor", () => {
    const { container } = render(<CommandInput />);
    typeAndEnter(container, "nrbx");
    expect(sendKeys).toHaveBeenCalledWith("nrbx\r");
    expect(markFavoriteUsed).not.toHaveBeenCalled();
  });

  it("başka gruba bağlı favorinin kısaltması bu grupta açılmıyor", () => {
    const { container } = render(<CommandInput />);
    fireEvent.change(field(container), { target: { value: "dep" } });
    expect(hint(container)).toBeNull();
    fireEvent.keyDown(field(container), { key: "Enter" });
    expect(sendKeys).toHaveBeenCalledWith("dep\r");
  });

  it("çalışan programa giden yanıt açılmıyor", () => {
    // Komut çalışırken kutu programın sorusuna yanıt topluyor; "nrb" orada
    // bir komut değil, programın beklediği metin.
    seed(true);
    const { container } = render(<CommandInput />);
    fireEvent.change(field(container), { target: { value: "nrb" } });
    expect(hint(container)).toBeNull();
    fireEvent.keyDown(field(container), { key: "Enter" });
    expect(sendKeys).toHaveBeenCalledWith("nrb\r");
    expect(markFavoriteUsed).not.toHaveBeenCalled();
  });
});
