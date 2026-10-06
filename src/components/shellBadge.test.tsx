// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLanguage } from "../lib/i18n";
import { setPlatform } from "../lib/platform";
import { sessions, useStore } from "../store/useStore";
import type { Group, Profile, TabState } from "../types";
import { GroupSidebar } from "./GroupSidebar";
import { TabBar } from "./TabBar";
import { TerminalArea } from "./TerminalArea";

/**
 * Sekmenin solundaki kabuk rozeti.
 *
 * İki ayrı iş burada bağlanıyor, ikisi de aynı öğeye dokunduğu için:
 *
 *  1. **Rozet kapatılabilir.** Tek profille çalışan kullanıcıda her satırda
 *     aynı "PS" tekrarlanıyor ve dar kenar çubuğunda sekme adına ayrılan yeri
 *     yiyor.
 *  2. **Rozet artık `?` göstermiyor.** Bildirilen hataydı: sekmenin profil
 *     kimliği boşa düşünce (profil silindi ya da ayarlar sıfırlandı) arayüz
 *     tam eşleşme arayıp bulamıyor, `?` çiziyordu — oysa sekme çalışıyor,
 *     çünkü Rust tarafı açarken varsayılan profile düşüyor. Rozetin sekmenin
 *     GERÇEKTE çalıştırdığı kabuğu göstermesi gerekiyor.
 */

const PWSH: Profile = {
  id: "p1",
  name: "PowerShell 7",
  kind: "pwsh",
  shell: "pwsh.exe",
  args: [],
  cwd: null,
  env: {},
  shellIntegration: true,
  color: "#58a6ff",
  icon: null,
  unavailable: false,
};

const CMD: Profile = { ...PWSH, id: "p2", name: "Komut İstemi", kind: "cmd", shell: "cmd.exe" };

function tab(id: string, profileId: string): TabState {
  return {
    id,
    title: id,
    customTitle: id,
    profileId,
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

/** Depoyu kur: profiller, sekmeler ve rozet ayarı. */
function seed(tabs: TabState[], showShellBadge = true, defaultProfileId = "p1") {
  const state = useStore.getState();
  useStore.setState({
    ready: true,
    settings: {
      ...state.settings,
      profiles: [PWSH, CMD],
      defaultProfileId,
      appearance: { ...state.settings.appearance, showShellBadge },
    },
    groups: [group(tabs)],
    activeGroupId: "g1",
  });
}

beforeEach(() => {
  setLanguage("tr");
  setPlatform("windows");
});

afterEach(cleanup);

describe("rozet ayarı", () => {
  it("açıkken sekme çubuğunda ve kenar çubuğunda rozet var", () => {
    seed([tab("t1", "p1")]);
    const bar = render(<TabBar />);
    expect(bar.container.querySelector(".tab-badge")?.textContent).toBe("PS7");

    const side = render(<GroupSidebar />);
    expect(side.container.querySelector(".tab-row-badge")?.textContent).toBe("PS7");
  });

  it("kapalıyken iki yerde de rozet çizilmiyor", () => {
    seed([tab("t1", "p1")], false);
    const bar = render(<TabBar />);
    expect(bar.container.querySelector(".tab-badge")).toBe(null);

    const side = render(<GroupSidebar />);
    expect(side.container.querySelector(".tab-row-badge")).toBe(null);

    // Sekme adı yerinde kalıyor: kapatılan yalnızca rozet.
    expect(bar.container.querySelector(".tab-label")?.textContent).toContain("t1");
  });
});

describe("boşa düşmüş profil kimliği", () => {
  it("silinmiş profile bağlı sekme ? yerine varsayılanı gösteriyor", () => {
    // Sekme "p9"a bağlı, öyle bir profil yok. Kabuk varsayılanla (cmd)
    // açılıyor; rozet de onu göstermeli.
    seed([tab("t1", "p9")], true, "p2");
    const bar = render(<TabBar />);
    expect(bar.container.querySelector(".tab-badge")?.textContent).toBe("CMD");

    const side = render(<GroupSidebar />);
    expect(side.container.querySelector(".tab-row-badge")?.textContent).toBe("CMD");
  });

  it("varsayılan da geçersizse listenin ilkine düşüyor", () => {
    seed([tab("t1", "p9")], true, "yok");
    const { container } = render(<TabBar />);
    expect(container.querySelector(".tab-badge")?.textContent).toBe("PS7");
  });

  it("ipucu da düşülen profilin adını veriyor", () => {
    // Rozet ile ipucu ayrışırsa kullanıcı iki farklı cevap görür.
    seed([tab("t1", "p9")], true, "p2");
    const { container } = render(<TabBar />);
    expect(container.querySelector(".tab-badge")?.getAttribute("title")).toBe("Komut İstemi");
  });
});

/**
 * Sekmede Claude Code çalışırken rozetin yerinde Claude'un resmi.
 *
 * İSTEK: `claude` açılınca terminalde çıkan resim, sol taraftaki sekmede de
 * görünsün. Karar `running` (kabuk "komut sürüyor" dedi) ile `lastCommand`ın
 * (o komutun metni) birleşimi; resim kabuk türü değil sekmenin o anki işi
 * olduğu için rozet ayarı kapalıyken de çiziliyor.
 */
describe("Claude Code çalışırken", () => {
  function claudeTab(id: string, lastCommand: string | null): TabState {
    return { ...tab(id, "p1"), lastCommand };
  }

  const { ensureSession } = useStore.getState();
  afterEach(() => {
    useStore.setState({ running: {}, ensureSession });
    sessions.clear();
  });

  it("kenar çubuğunda ve sekme çubuğunda kabuk kodunun yerine resim", () => {
    seed([claudeTab("t1", "claude --continue")]);
    useStore.setState({ running: { t1: true } });

    const side = render(<GroupSidebar />);
    const rozet = side.container.querySelector(".tab-row-badge");
    expect(rozet?.classList.contains("claude")).toBe(true);
    expect(rozet?.querySelector("svg"), "resim çizilmemiş").not.toBe(null);
    expect(rozet?.textContent, "kabuk kodu da kalmış").toBe("");
    expect(rozet?.getAttribute("title")).toBe("Claude Code çalışıyor");

    const bar = render(<TabBar />);
    expect(bar.container.querySelector(".tab-badge.claude svg")).not.toBe(null);
  });

  it("bölme başlığında da", () => {
    seed([claudeTab("t1", "claude")]);
    useStore.setState({
      running: { t1: true },
      ensureSession: async () => null,
      settings: {
        ...useStore.getState().settings,
        behavior: {
          ...useStore.getState().settings.behavior,
          commandBlocks: false,
          blockHeaders: false,
        },
      },
    });
    // Gerçek xterm jsdom'da kurulamıyor; çizim yolunun istediği yüzey yeter.
    sessions.set("t1", {
      scrollToBottom: vi.fn(),
      setDisplay: vi.fn(),
      setBlockListener: vi.fn(),
      blockGeometry: () => null,
    } as never);

    const { container } = render(<TerminalArea />);
    expect(container.querySelector(".pane-badge.claude svg")).not.toBe(null);
  });

  it("Claude kapanınca kabuk rozeti geri geliyor", () => {
    // `lastCommand` komut bitince silinmiyor; belirleyici `running`.
    seed([claudeTab("t1", "claude")]);
    useStore.setState({ running: { t1: false } });

    const { container } = render(<GroupSidebar />);
    expect(container.querySelector(".claude")).toBe(null);
    expect(container.querySelector(".tab-row-badge")?.textContent).toBe("PS7");
  });

  it("başka bir komut sürerken kabuk rozeti kalıyor", () => {
    seed([claudeTab("t1", "npm test")]);
    useStore.setState({ running: { t1: true } });

    const { container } = render(<TabBar />);
    expect(container.querySelector(".claude")).toBe(null);
    expect(container.querySelector(".tab-badge")?.textContent).toBe("PS7");
  });

  it("rozet ayarı kapalıyken yalnızca Claude'lu sekmede resim var", () => {
    seed([claudeTab("t1", "claude"), claudeTab("t2", "npm test")], false);
    useStore.setState({ running: { t1: true, t2: true } });

    const side = render(<GroupSidebar />);
    expect(side.container.querySelectorAll(".tab-row-badge").length).toBe(1);
    expect(side.container.querySelector(".tab-row-badge.claude")).not.toBe(null);

    const bar = render(<TabBar />);
    expect(bar.container.querySelectorAll(".tab-badge").length).toBe(1);
    expect(bar.container.querySelector(".tab-badge.claude")).not.toBe(null);
  });
});
