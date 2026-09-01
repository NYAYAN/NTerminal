// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { setLanguage } from "../lib/i18n";
import { setPlatform } from "../lib/platform";
import { useStore } from "../store/useStore";
import type { Group, Profile, TabState } from "../types";
import { GroupSidebar } from "./GroupSidebar";
import { TabBar } from "./TabBar";

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
