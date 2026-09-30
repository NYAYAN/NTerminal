// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLanguage } from "../lib/i18n";
import { api } from "../lib/ipc";
import { setPlatform } from "../lib/platform";
import { useStore } from "../store/useStore";
import type { Group, TabState } from "../types";
import { SidePanel } from "./SidePanel";

/**
 * "Değişiklikler" satırlarında yol yerine DOSYA ADI.
 *
 * BİLDİRİLEN İHTİYAÇ: satırda tam yol duruyordu; istenen yalnızca dosya adı ve
 * yolu bir düğmeyle açıp kapatmak.
 *
 * Gerekçe listenin nasıl okunduğuyla ilgili: dikey taranıyor ve aranan şey
 * "hangi dosya değişmiş". Klasör zinciri her satırda tekrarlanan, çoğu zaman
 * aynı olan bir ön ekti ve dar panelde asıl ayırt edici bilgiyi — adı —
 * kırpıyordu.
 *
 * Bilgi KAYBOLMUYOR ve buradaki testlerin asıl konusu bu: yol düğmeyle geri
 * geliyor ve satırın `title` ipucunda her durumda tam hâliyle duruyor.
 */

const CWD = "C:/depo";

function tab(): TabState {
  return {
    id: "t1",
    title: "t1",
    customTitle: null,
    profileId: "p1",
    cwd: CWD,
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

function seed(changes: { status: string; path: string }[]) {
  const state = useStore.getState();
  useStore.setState({
    ready: true,
    groups: [group()],
    activeGroupId: "g1",
    gitInfo: {
      [CWD]: { branch: "main", detached: false, ahead: 0, behind: 0, upstream: "origin/main", unborn: false, staged: 0, stashCount: 0, changes, root: CWD },
    },
    ui: { ...state.ui, historyOpen: true, panelMode: "git", gitExpanded: [], gitShowPaths: false },
  });
}

/** Başlıktaki yol göster/gizle düğmesi; yoksa null. */
function pathButton(container: HTMLElement): HTMLButtonElement | null {
  const head = container.querySelector(".panel-head")!;
  return (
    [...head.querySelectorAll("button")].find((el) => {
      const title = el.getAttribute("title") ?? "";
      return title === "Klasör yollarını göster" || title === "Klasör yollarını gizle";
    }) ?? null
  );
}

beforeEach(() => {
  setLanguage("tr");
  setPlatform("windows");
  vi.spyOn(api, "gitDiff").mockResolvedValue("");
  vi.spyOn(api, "readTextFile").mockResolvedValue(null);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("değişikliklerde dosya adı ve yol", () => {
  it("varsayılan: yalnızca dosya adı", () => {
    seed([{ status: " M", path: "src/components/GitChanges.tsx" }]);
    const { container } = render(<SidePanel />);

    expect(container.querySelector(".git-path")!.textContent).toBe("GitChanges.tsx");
    expect(container.querySelector(".git-dir"), "klasör ön eki kapalıyken çizilmiş").toBe(null);
  });

  it("tam yol her durumda ipucunda", () => {
    // Ad yeterli olmadığında (aynı adlı iki dosya) yolu görmenin en kısa yolu
    // fareyi satırın üstünde tutmak; düğmeye basmak gerekmemeli.
    seed([{ status: " M", path: "src/components/GitChanges.tsx" }]);
    const { container } = render(<SidePanel />);
    expect(container.querySelector(".git-row")!.getAttribute("title")).toBe(
      "src/components/GitChanges.tsx",
    );
  });

  it("düğme klasör ön ekini getiriyor ve geri alıyor", () => {
    seed([{ status: " M", path: "src/components/GitChanges.tsx" }]);
    const { container } = render(<SidePanel />);

    fireEvent.click(pathButton(container)!);
    const dir = container.querySelector(".git-dir");
    expect(dir, "yol açıldığında klasör ön eki yok").not.toBe(null);
    expect(dir!.textContent).toBe("src/components/");
    // Ad ön ekin İÇİNE girmiyor; iki ayrı öge kalıyor.
    expect(container.querySelector(".git-path")!.textContent).toBe("GitChanges.tsx");
    expect(pathButton(container)!.getAttribute("title")).toBe("Klasör yollarını gizle");

    fireEvent.click(pathButton(container)!);
    expect(container.querySelector(".git-dir"), "yol gizlenmedi").toBe(null);
  });

  it("kökteki dosyada ön ek çizilmiyor", () => {
    // `dirName` null dönüyor; boş bir ön ek satırda anlamsız bir boşluk olurdu.
    seed([{ status: " M", path: "README.md" }]);
    const { container } = render(<SidePanel />);

    fireEvent.click(pathButton(container)!);
    expect(container.querySelector(".git-path")!.textContent).toBe("README.md");
    expect(container.querySelector(".git-dir"), "kökteki dosyaya ön ek eklenmiş").toBe(null);
  });

  it("durum bütün satırlar için ORTAK", () => {
    // Düğme panelin başlığında ve listenin tamamını yönetiyor; satır başına
    // ayrı bir durum olsaydı düğme "hangi satır" sorusunu yanıtlayamazdı.
    seed([
      { status: " M", path: "src/a.ts" },
      { status: "A ", path: "lib/deep/b.ts" },
    ]);
    const { container } = render(<SidePanel />);

    fireEvent.click(pathButton(container)!);
    const dirs = [...container.querySelectorAll(".git-dir")].map((el) => el.textContent);
    expect(dirs).toEqual(["src/", "lib/deep/"]);
  });

  it("değişiklik yokken düğme çizilmiyor", () => {
    seed([]);
    const { container } = render(<SidePanel />);
    expect(pathButton(container), "boş listede düğme duruyor").toBe(null);
  });
});
