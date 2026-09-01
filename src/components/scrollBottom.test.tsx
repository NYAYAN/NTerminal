// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLanguage } from "../lib/i18n";
import { setPlatform } from "../lib/platform";
import { sessions, useStore } from "../store/useStore";
import type { Group, TabState } from "../types";
import { TerminalArea } from "./TerminalArea";

/**
 * "En alta in" düğmesi.
 *
 * Geçmişe kaydırıldığında canlı çıktıya dönmenin görünür bir yolu yoktu: `End`
 * tuşunu bilmek ya da elle en dibe kaydırmak gerekiyordu.
 *
 * Düğmenin KOŞULLU olması özelliğin yarısı: en alttayken hiçbir şey yapmayan
 * bir düğme, terminalin üstünde sürekli duran bir gürültü olurdu. Bu yüzden
 * "ne zaman görünmediği" de test ediliyor.
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
    defaultProfileId: null,
    defaultCwd: null,
    env: {},
    activeTabId: tabs[0]?.id ?? null,
    tabs,
  };
}

/**
 * Terminal alanının oturumdan çağırdığı yüzey.
 *
 * Gerçek `TerminalSession` jsdom'da kurulamıyor (xterm `open()` canvas
 * istiyor). Sahte nesne yalnızca ÇİZİM yolunun dokunduğu yöntemleri
 * karşılıyor; eksik biri kalırsa test `is not a function` ile düşüyor, yani
 * sessizce yanlış bir şey ölçmüyor.
 */
function sahteOturum(scrollToBottom = vi.fn()) {
  return {
    scrollToBottom,
    setDisplay: vi.fn(),
    setBlockListener: vi.fn(),
    blockGeometry: () => null,
  } as never;
}

function seed(scrollAtBottom: Record<string, boolean>) {
  const state = useStore.getState();
  useStore.setState({
    ready: true,
    // Komut blokları kapalı: blok katmanı oturumdan geometri istiyor ve
    // buradaki soru düğmenin görünürlüğü, blokların çizimi değil.
    settings: {
      ...state.settings,
      behavior: { ...state.settings.behavior, commandBlocks: false, blockHeaders: false },
    },
    groups: [group([tab("t1")])],
    activeGroupId: "g1",
    scrollAtBottom,
    // Gerçek oturum kurulmuyor: xterm `open()` jsdom'da canvas istiyor ve
    // düşüyor. Buradaki soru düğmenin ne zaman çizildiği, terminalin
    // kendisi değil.
    ensureSession: async () => null,
  });
}

beforeEach(() => {
  setLanguage("tr");
  setPlatform("windows");
});

afterEach(() => {
  cleanup();
  sessions.clear();
  useStore.setState({ scrollAtBottom: {} });
});

describe("en alta in düğmesi", () => {
  it("geriye kaydırılmışken görünüyor", () => {
    seed({ t1: false });
    const { container } = render(<TerminalArea />);
    const btn = container.querySelector(".scroll-bottom");
    expect(btn, "düğme yok").not.toBe(null);
    expect(btn!.getAttribute("title")).toBe("En alta in");
  });

  it("en alttayken çizilmiyor", () => {
    seed({ t1: true });
    const { container } = render(<TerminalArea />);
    expect(container.querySelector(".scroll-bottom")).toBe(null);
  });

  it("durum hiç bildirilmemişse çizilmiyor", () => {
    // Yeni açılan sekme canlı çıktıya bakıyor; `undefined` "en altta" demek.
    // Aksi hâlde her yeni sekmede düğme bir an için görünürdü.
    seed({});
    const { container } = render(<TerminalArea />);
    expect(container.querySelector(".scroll-bottom")).toBe(null);
  });

  it("tıklamak oturumu en alta indiriyor", () => {
    seed({ t1: false });
    const scrollToBottom = vi.fn();
    // Oturum nesnesi React durumunda değil; düğme onu doğrudan çağırıyor.
    // `setDisplay` de gerekiyor: TerminalArea görünürlüğü her oturuma
    // dağıtıyor ve sahte nesne onu da karşılamalı.
    sessions.set("t1", sahteOturum(scrollToBottom));

    const { container } = render(<TerminalArea />);
    fireEvent.click(container.querySelector(".scroll-bottom")!);

    expect(scrollToBottom).toHaveBeenCalledTimes(1);
  });

  it("tıklama sekmeyi değiştirmiyor", () => {
    // Düğme bölmenin İÇİNDE ve bölmeye tıklamak etkin sekmeyi değiştiriyor.
    // Olay durdurulmazsa "aşağı in" aynı zamanda odak değiştiren bir tıklama
    // olurdu — bölme kipinde yanlış sekmeye yazmaya yol açar.
    seed({ t1: false });
    sessions.set("t1", sahteOturum());
    const setActiveTab = vi.fn();
    useStore.setState({ setActiveTab });

    const { container } = render(<TerminalArea />);
    fireEvent.mouseDown(container.querySelector(".scroll-bottom")!);

    expect(setActiveTab).not.toHaveBeenCalled();
  });
});
