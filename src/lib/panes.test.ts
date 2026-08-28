import { describe, expect, it } from "vitest";

import {
  activeTabIdOf,
  nextViewMode,
  normalizeViewMode,
  paneGrid,
  visibleTabIds,
} from "./panes";
import type { Group, TabState } from "../types";

function tab(id: string): TabState {
  return {
    id,
    title: "",
    customTitle: null,
    profileId: "p1",
    cwd: null,
    createdAt: 0,
    lastActiveAt: 0,
    hasScrollback: false,
    lastCommand: null,
    locked: false,
  };
}

function group(tabs: TabState[], activeTabId: string | null = null): Group {
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
    activeTabId,
    tabs,
  };
}

describe("bolme izgarasi", () => {
  it("sutun sayisi karekokten yukari yuvarlanir", () => {
    expect(paneGrid(1)).toEqual({ cols: 1, rows: 1, lastSpan: 1 });
    expect(paneGrid(2)).toMatchObject({ cols: 2, rows: 1 });
    expect(paneGrid(3)).toMatchObject({ cols: 2, rows: 2 });
    expect(paneGrid(4)).toMatchObject({ cols: 2, rows: 2 });
    expect(paneGrid(5)).toMatchObject({ cols: 3, rows: 2 });
    expect(paneGrid(6)).toMatchObject({ cols: 3, rows: 2 });
    expect(paneGrid(7)).toMatchObject({ cols: 3, rows: 3 });
    expect(paneGrid(9)).toMatchObject({ cols: 3, rows: 3 });
    expect(paneGrid(10)).toMatchObject({ cols: 4, rows: 3 });
  });

  it("izgara her zaman butun bolmeleri alir", () => {
    // Bir bolme izgaraya sigmazsa ekranda gorunmez; sessiz veri kaybi olur.
    for (let n = 1; n <= 40; n++) {
      const { cols, rows } = paneGrid(n);
      expect(cols * rows, `${n} bolme ${cols}x${rows} izgaraya sigmiyor`).toBeGreaterThanOrEqual(n);
    }
  });

  it("son bolme bos hucreleri kapatir", () => {
    // lastSpan = bos hucre sayisi + 1. Bos hucre kalmiyorsa 1.
    for (let n = 1; n <= 40; n++) {
      const { cols, rows, lastSpan } = paneGrid(n);
      expect(lastSpan).toBe(cols * rows - n + 1);
      expect(lastSpan).toBeGreaterThanOrEqual(1);
      // Yayilma tek satiri asmamali, yoksa izgara bir satir asagi kayar.
      expect(lastSpan, `${n} bolmede yayilma sutun sayisini asiyor`).toBeLessThanOrEqual(cols);
    }
  });

  it("sifir bolme cokmez", () => {
    expect(paneGrid(0)).toEqual({ cols: 1, rows: 1, lastSpan: 1 });
  });
});

describe("gorunum kipi", () => {
  it("bilinmeyen deger sekme kipine duser", () => {
    // Eski settings.json'da alan yok; "panes" degilse sekme kipi.
    expect(normalizeViewMode(undefined)).toBe("tabs");
    expect(normalizeViewMode(null)).toBe("tabs");
    expect(normalizeViewMode("")).toBe("tabs");
    expect(normalizeViewMode("bolme")).toBe("tabs");
    expect(normalizeViewMode("panes")).toBe("panes");
    expect(normalizeViewMode("tabs")).toBe("tabs");
  });

  it("kip degistirme iki yonlu", () => {
    expect(nextViewMode("tabs")).toBe("panes");
    expect(nextViewMode("panes")).toBe("tabs");
  });
});

describe("gorunur sekmeler", () => {
  it("sekme kipinde yalnizca etkin sekme", () => {
    const g = group([tab("a"), tab("b"), tab("c")], "b");
    expect(visibleTabIds(g, "tabs")).toEqual(["b"]);
  });

  it("bolme kipinde grubun tum sekmeleri", () => {
    const g = group([tab("a"), tab("b"), tab("c")], "b");
    expect(visibleTabIds(g, "panes")).toEqual(["a", "b", "c"]);
  });

  it("bos grup ve grup yoklugu bos dizi", () => {
    expect(visibleTabIds(group([]), "panes")).toEqual([]);
    expect(visibleTabIds(undefined, "panes")).toEqual([]);
    expect(visibleTabIds(group([]), "tabs")).toEqual([]);
  });

  it("kayitli etkin sekme silinmisse ilk sekmeye duser", () => {
    // workspace.json'da duran activeTabId, sekme kapatildiktan sonra da
    // dosyada kalabiliyor; o kimlige bakip null donmek ekrani bos birakirdi.
    const g = group([tab("a"), tab("b")], "silinmis");
    expect(activeTabIdOf(g)).toBe("a");
    expect(visibleTabIds(g, "tabs")).toEqual(["a"]);
  });

  it("etkin sekme kayitli degilse ilk sekme", () => {
    expect(activeTabIdOf(group([tab("a"), tab("b")], null))).toBe("a");
    expect(activeTabIdOf(group([]))).toBe(null);
    expect(activeTabIdOf(undefined)).toBe(null);
  });
});
