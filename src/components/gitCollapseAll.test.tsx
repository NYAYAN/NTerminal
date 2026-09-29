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
 * Satırlar KAPALI geliyor (istek: "Değişiklikler default olarak hepsi kapalı
 * gelsin"); çok dosya değiştiğinde her satırı tek tek açmak aynı işi dosya
 * sayısı kadar yapmak demek. Tek bir düğme: hepsini aç, bakıp bitince hepsini
 * topla.
 *
 * Düğme panelin BAŞLIĞINDA, kapatma çarpısının solunda — yani `SidePanel`in
 * içinde, liste ise `GitChanges`te. Testin `SidePanel` çizmesinin sebebi bu:
 * ölçülecek şey ikisinin AYNI gerçeği görmesi. Durum bu yüzden depoda
 * (`ui.gitExpanded`), bileşenin yerel durumunda değil.
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
    ui: { ...state.ui, historyOpen: true, panelMode: "git", gitExpanded: [] },
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
    const katla = buttons.indexOf(toggleButton(container)!);
    const kapat = buttons.findIndex((el) => el.getAttribute("title") === "Paneli kapat");
    expect(katla, "katlama düğmesi yok").toBeGreaterThan(-1);
    expect(kapat, "kapatma düğmesi yok").toBeGreaterThan(-1);
    expect(katla, "katlama düğmesi çarpının sağında").toBeLessThan(kapat);
  });

  it("satırlar KAPALI geliyor ve düğme AÇAN düğme", () => {
    // Hiçbiri açık değil: yön "aç".
    seed([
      { status: " M", path: "a.ts" },
      { status: "A ", path: "b.ts" },
    ]);
    const { container } = render(<SidePanel />);

    expect(container.querySelectorAll(".git-item.open"), "satırlar açık geliyor").toHaveLength(0);
    expect(toggleButton(container)!.getAttribute("title")).toBe("Dosyaları aç");
  });

  it("tek basışta hepsini açıyor", () => {
    seed([
      { status: " M", path: "a.ts" },
      { status: "A ", path: "b.ts" },
      { status: "??", path: "c.ts" },
    ]);
    const { container } = render(<SidePanel />);

    fireEvent.click(toggleButton(container)!);

    expect(container.querySelectorAll(".git-item.open"), "hepsi açılmadı").toHaveLength(3);
    expect([...useStore.getState().ui.gitExpanded].sort()).toEqual(["a.ts", "b.ts", "c.ts"]);
  });

  it("hepsi açıkken aynı düğme geri topluyor", () => {
    seed([
      { status: " M", path: "a.ts" },
      { status: "A ", path: "b.ts" },
    ]);
    const { container } = render(<SidePanel />);

    fireEvent.click(toggleButton(container)!);
    // Yön durumdan okunuyor: biri bile açıksa düğme artık DARALTAN düğme.
    expect(toggleButton(container)!.getAttribute("title")).toBe("Dosyaları daralt");

    fireEvent.click(toggleButton(container)!);
    expect(container.querySelectorAll(".git-item.open"), "toplanmadı").toHaveLength(0);
    expect(useStore.getState().ui.gitExpanded).toEqual([]);
    expect(toggleButton(container)!.getAttribute("title")).toBe("Dosyaları aç");
  });

  it("elle açılan tek satır düğmeyi DARALTAN yapıyor", () => {
    // Biri açık, biri kapalıyken "hepsi kapalı" değil: düğme toplamalı. Yoksa
    // tek satır açan kullanıcı düğmeye basınca listenin kalanını da açardı ve
    // ilk beklediği "topla" olurdu.
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

  it("listede olmayan eski bir yol yönü bozmuyor", () => {
    // Bir dosya açıkken commit'lendi: yolu kümede kalıyor ama satırı yok. Yalnızca
    // GÜNCEL satırlara bakılmalı; yoksa hiç açık satır yokken düğme "daralt" derdi.
    seed([{ status: " M", path: "a.ts" }]);
    useStore.setState({ ui: { ...useStore.getState().ui, gitExpanded: ["gitti.ts"] } });
    const { container } = render(<SidePanel />);

    expect(container.querySelectorAll(".git-item.open")).toHaveLength(0);
    expect(toggleButton(container)!.getAttribute("title")).toBe("Dosyaları aç");
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
