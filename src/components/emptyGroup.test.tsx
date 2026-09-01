// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLanguage } from "../lib/i18n";
import { setPlatform } from "../lib/platform";
import { sessions, useStore } from "../store/useStore";
import type { Group, TabState } from "../types";
import { TerminalArea } from "./TerminalArea";

/**
 * Sekmesiz grup, BAĞLI TERMİNALLERİ SÖKMEMELİ.
 *
 * ## Ölçülen hata
 *
 * İlk grupta `ng serve` çalışırken yeni bir grup açmak, ilk grubun terminalini
 * boşaltıyordu. Yeni grup bir çizim boyunca sekmesiz (sekmeyi `App` bir etkide
 * ekliyor) ve `TerminalArea` o çizimde "hiç sekme yok" kutusunu ALANIN YERİNE
 * döndürüyordu — yani yalnızca yeni grubun değil, bağlı HER sekmenin
 * barındırıcısı ağaçtan çıkıyordu.
 *
 * Bedeli DOM düğümünün kaybı değil, xterm'in ikinci `open()` çağrısını yok
 * sayması: terminal kopmuş eski kabın içinde kalıyor, yeni kap boş duruyordu
 * (gerekçesi `TerminalSession.attach` ve `terminal/reattach.test.ts` içinde).
 *
 * Bu yüzden testin baktığı şey DÜĞÜM KİMLİĞİ: kutunun görünmesi değil, altında
 * barındırıcının aynı düğüm olarak DURMASI.
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

/** Çizim yolunun oturumdan çağırdığı yüzey; gerçek xterm jsdom'da kurulamıyor. */
function sahteOturum() {
  return {
    scrollToBottom: vi.fn(),
    setDisplay: vi.fn(),
    setBlockListener: vi.fn(),
    blockGeometry: () => null,
  } as never;
}

function seed() {
  const state = useStore.getState();
  useStore.setState({
    ready: true,
    // Blok katmanı oturumdan geometri istiyor; buradaki soru bağlanma, çizim
    // değil.
    settings: {
      ...state.settings,
      behavior: { ...state.settings.behavior, commandBlocks: false, blockHeaders: false },
    },
    groups: [group("g1", [tab("t1")])],
    activeGroupId: "g1",
    ensureSession: async () => null,
  });
  sessions.set("t1", sahteOturum());
}

beforeEach(() => {
  setLanguage("tr");
  setPlatform("windows");
});

afterEach(() => {
  cleanup();
  sessions.clear();
});

describe("sekmesiz gruba geçmek", () => {
  it("önceki grubun barındırıcısı AYNI düğüm olarak kalıyor", async () => {
    seed();
    const { container } = render(<TerminalArea />);
    const once = container.querySelector('[data-tab-id="t1"]');
    expect(once, "terminal barındırıcısı hiç çizilmemiş").not.toBe(null);

    // Yeni grup: bir çizim boyunca sekmesiz. Hatanın doğduğu an tam olarak bu.
    await act(async () => {
      useStore.setState({
        groups: [group("g1", [tab("t1")]), group("g2", [])],
        activeGroupId: "g2",
      });
    });

    expect(container.querySelector('[data-tab-id="t1"]'), "barındırıcı yeniden kuruldu").toBe(
      once,
    );
  });

  it("kutu çiziliyor ama alanın YERİNE geçmiyor", () => {
    // Kutunun kendisi kaybolmamalı: sekmesi olmayan bir grupta kullanıcıya
    // "Ctrl+T" demek gerekiyor.
    seed();
    useStore.setState({ groups: [group("g1", [])], activeGroupId: "g1" });
    const { container } = render(<TerminalArea />);

    expect(container.querySelector(".empty-state"), "kutu hiç çizilmiyor").not.toBe(null);
    expect(
      container.querySelector(".terminal-area .empty-state"),
      "kutu terminal alanının dışında",
    ).not.toBe(null);
  });
});
