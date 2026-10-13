// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLanguage } from "../lib/i18n";
import { setPlatform } from "../lib/platform";
import { sessions, useStore } from "../store/useStore";
import type { Group, RightClickAction, TabState } from "../types";
import { TerminalArea } from "./TerminalArea";

/**
 * Terminalde sağ tıkla yapıştırma.
 *
 * BİLDİRİLEN HATA: "Bir şeyi kopyalayıp yapıştır dediğimde komut satırında
 * 'paste' diye bir şey çıkıyor; buna gerek yok, doğrudan yapıştırabilmeliyim."
 * Menüdeki "Yapıştır" panoyu `navigator.clipboard.readText()` ile okuyordu ve
 * macOS'ta WebKit her seferinde kendi "Paste" onay düğmesini çiziyordu.
 *
 * Her yol `pasteClipboard`dan geçmeli: panoyu Rust okuyor, metnin kutuya mı
 * terminale mi gideceğine o karar veriyor (testleri `pasteClipboard.test.ts`).
 * Burada bağlanan, sağ tıkın üç biçiminin de oraya ulaşması.
 */

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

function group(tabs: TabState[]): Group {
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
    activeTabId: tabs[0]?.id ?? null,
    tabs,
  };
}

const initial = useStore.getState();
const pasteClipboard = vi.fn(async () => {});
const copySelection = vi.fn(async () => true);

/** Çizim yolunun ve sağ tık menüsünün dokunduğu yüzey (bkz. `scrollBottom.test.tsx`). */
function sahteOturum(selection: boolean) {
  return {
    setDisplay: vi.fn(),
    setBlockListener: vi.fn(),
    blockGeometry: () => null,
    hasSelection: () => selection,
    copySelection,
    clearSelection: vi.fn(),
  } as never;
}

function seed(rightClickAction: RightClickAction, selection = false) {
  const state = useStore.getState();
  sessions.set("t1", sahteOturum(selection));
  useStore.setState({
    ready: true,
    settings: {
      ...state.settings,
      behavior: {
        ...state.settings.behavior,
        rightClickAction,
        commandBlocks: false,
        blockHeaders: false,
      },
    },
    groups: [group([tab("t1")])],
    activeGroupId: "g1",
    // Gerçek oturum kurulmuyor: xterm `open()` jsdom'da canvas istiyor.
    ensureSession: async () => null,
    pasteClipboard,
  });
}

const sagTik = (c: HTMLElement) => fireEvent.contextMenu(c.querySelector(".term-host")!);

beforeEach(() => {
  setLanguage("tr");
  setPlatform("macos");
  pasteClipboard.mockClear();
  copySelection.mockClear();
});

afterEach(() => {
  cleanup();
  sessions.clear();
  useStore.setState({
    groups: [],
    activeGroupId: null,
    pasteClipboard: initial.pasteClipboard,
    ensureSession: initial.ensureSession,
  });
});

describe("terminalde sağ tıkla yapıştırma", () => {
  it("menüdeki Yapıştır panoyu pasteClipboard'dan okuyor", () => {
    seed("menu");
    const { container } = render(<TerminalArea />);
    sagTik(container);
    fireEvent.click(screen.getByText("Yapıştır"));
    expect(pasteClipboard).toHaveBeenCalledWith("t1");
  });

  it("'her zaman yapıştır' ayarı menüsüz aynı yoldan geçiyor", () => {
    seed("paste");
    const { container } = render(<TerminalArea />);
    sagTik(container);
    expect(pasteClipboard).toHaveBeenCalledWith("t1");
    expect(screen.queryByText("Yapıştır"), "menü açıldı").toBe(null);
  });

  it("'seçim varsa kopyala' ayarı seçim yokken yapıştırıyor", () => {
    seed("copyPaste");
    const { container } = render(<TerminalArea />);
    sagTik(container);
    expect(pasteClipboard).toHaveBeenCalledWith("t1");
  });

  it("'seçim varsa kopyala' ayarı seçim varken YAPIŞTIRMIYOR", () => {
    // Windows Terminal davranışı: seçimi kopyalamak isteyenin panosu istem
    // satırına dökülmemeli.
    seed("copyPaste", true);
    const { container } = render(<TerminalArea />);
    sagTik(container);
    expect(copySelection).toHaveBeenCalled();
    expect(pasteClipboard).not.toHaveBeenCalled();
  });
});
