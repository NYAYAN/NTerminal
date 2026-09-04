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
 * "Değişiklikler" listesinde toplu aç/kapa.
 *
 * BİLDİRİLEN İHTİYAÇ: dosyalar AÇIK geliyor (bilinçli — "neler değişmiş"
 * sorusunun yanıtı listenin tamamı), ama çok dosya değiştiğinde liste
 * uzuyor ve her satırı tek tek kapatmak aynı işi dosya sayısı kadar yapmak
 * demek. İstenen tek bir düğme: hepsini topla, gerekirse hepsini geri aç.
 *
 * Düğme panelin BAŞLIĞINDA, kapatma çarpısının solunda — yani `SidePanel`in
 * içinde, liste ise `GitChanges`te. Testin `SidePanel` çizmesinin sebebi bu:
 * ölçülecek şey ikisinin AYNI gerçeği görmesi. Durum bu yüzden depoda
 * (`ui.gitCollapsed`), bileşenin yerel durumunda değil.
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
      [CWD]: { branch: "main", detached: false, ahead: 0, behind: 0, changes, root: CWD },
    },
    ui: { ...state.ui, historyOpen: true, panelMode: "git", gitCollapsed: [] },
  });
}

/** Başlıktaki toplu katlama düğmesi; yoksa null. */
function toggleButton(container: HTMLElement): HTMLButtonElement | null {
  const head = container.querySelector(".panel-head")!;
  return (
    [...head.querySelectorAll("button")].find((el) => {
      const title = el.getAttribute("title") ?? "";
      return title === "Dosyaları daralt" || title === "Dosyaları aç";
    }) ?? null
  );
}

beforeEach(() => {
  setLanguage("tr");
  setPlatform("windows");
  // Satır açıkken fark isteniyor; gerçek IPC yok.
  vi.spyOn(api, "gitDiff").mockResolvedValue("");
  vi.spyOn(api, "readTextFile").mockResolvedValue(null);
});

afterEach(cleanup);

describe("değişikliklerde toplu aç/kapa", () => {
  it("düğme kapatma çarpısının SOLUNDA", () => {
    // İstenen yer bu: çarpı paneli kapatıyor, bu düğme içeriği katlıyor —
    // ikisi komşu ama biri ötekinin yerine basılmamalı, sıra bu yüzden sabit.
    seed([{ status: " M", path: "a.ts" }]);
    const { container } = render(<SidePanel />);

    const buttons = [...container.querySelector(".panel-head")!.querySelectorAll("button")];
    const katla = buttons.findIndex((el) => el.getAttribute("title") === "Dosyaları daralt");
    const kapat = buttons.findIndex((el) => el.getAttribute("title") === "Paneli kapat");
    expect(katla, "katlama düğmesi yok").toBeGreaterThan(-1);
    expect(kapat, "kapatma düğmesi yok").toBeGreaterThan(-1);
    expect(katla, "katlama düğmesi çarpının sağında").toBeLessThan(kapat);
  });

  it("tek basışta hepsini daraltıyor", () => {
    seed([
      { status: " M", path: "a.ts" },
      { status: "A ", path: "b.ts" },
      { status: "??", path: "c.ts" },
    ]);
    const { container } = render(<SidePanel />);
    expect(container.querySelectorAll(".git-item.open"), "satırlar açık gelmiyor").toHaveLength(3);

    fireEvent.click(toggleButton(container)!);

    expect(container.querySelectorAll(".git-item.open"), "açık satır kaldı").toHaveLength(0);
    expect([...useStore.getState().ui.gitCollapsed].sort()).toEqual(["a.ts", "b.ts", "c.ts"]);
  });

  it("hepsi kapalıyken aynı düğme geri açıyor", () => {
    seed([
      { status: " M", path: "a.ts" },
      { status: "A ", path: "b.ts" },
    ]);
    const { container } = render(<SidePanel />);

    fireEvent.click(toggleButton(container)!);
    // Yön durumdan okunuyor: hepsi kapalıysa düğme artık AÇAN düğme.
    expect(toggleButton(container)!.getAttribute("title")).toBe("Dosyaları aç");

    fireEvent.click(toggleButton(container)!);
    expect(container.querySelectorAll(".git-item.open"), "geri açılmadı").toHaveLength(2);
    expect(useStore.getState().ui.gitCollapsed).toEqual([]);
  });

  it("elle kapatılan tek satır düğmenin yönünü değiştirmiyor", () => {
    // Biri kapalı, biri açıkken "hepsi kapalı" değil: düğme hâlâ daraltmalı,
    // yoksa tek satır kapatan kullanıcı düğmeye basınca listeyi açıyordu.
    seed([
      { status: " M", path: "a.ts" },
      { status: "A ", path: "b.ts" },
    ]);
    const { container } = render(<SidePanel />);

    fireEvent.click(container.querySelectorAll<HTMLElement>(".git-row")[0]);
    expect(container.querySelectorAll(".git-item.open")).toHaveLength(1);
    expect(toggleButton(container)!.getAttribute("title")).toBe("Dosyaları daralt");

    fireEvent.click(toggleButton(container)!);
    expect(container.querySelectorAll(".git-item.open")).toHaveLength(0);
  });

  it("değişiklik yokken düğme çizilmiyor", () => {
    // Yapacağı iş olmayan düğme gürültü (favoriler panelinde de aynı kural).
    seed([]);
    const { container } = render(<SidePanel />);
    expect(toggleButton(container), "boş listede düğme duruyor").toBe(null);
  });

  it("başka sekmelerde düğme çizilmiyor", () => {
    // Düğme "Değişiklikler"e ait; geçmişte katlanacak bir dosya yok.
    seed([{ status: " M", path: "a.ts" }]);
    const state = useStore.getState();
    useStore.setState({ ui: { ...state.ui, panelMode: "history" } });
    const { container } = render(<SidePanel />);
    expect(toggleButton(container), "geçmiş sekmesinde düğme duruyor").toBe(null);
  });
});
