import { describe, expect, it } from "vitest";

import {
  canCloseTab,
  dropIndex,
  nextCollapsedAll,
  reorder,
  visibleGroups,
  canDeleteGroup,
  closableOthers,
  isLocked,
  lockedTabNames,
  lockedTabs,
} from "./tabs";
import { tabLabel } from "./labels";
import type { Group, TabState } from "../types";

function tab(id: string, patch: Partial<TabState> = {}): TabState {
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
    ...patch,
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

/**
 * Kilit birden fazla kapatma yolundan geçiyor (düğme, orta tuş, Ctrl+W,
 * "diğerlerini kapat", grup silme). Kararın tek yerde ve tutarlı olması
 * gerekiyor; testler o tek yeri bağlıyor.
 */
describe("sekme kilidi", () => {
  it("kilitli sekme kapatılamaz", () => {
    expect(canCloseTab(tab("a"))).toBe(true);
    expect(canCloseTab(tab("a", { locked: true }))).toBe(false);
  });

  it("locked alanı yoksa kilitsiz sayılır", () => {
    // Eski bir workspace.json bu alanı içermiyor; kilitsiz kabul edilmeli.
    const legacy = { ...tab("a") } as TabState;
    delete (legacy as Partial<TabState>).locked;
    expect(isLocked(legacy)).toBe(false);
    expect(canCloseTab(legacy)).toBe(true);
  });

  it("kilitli sekmeler listelenir", () => {
    const tabs = [tab("a"), tab("b", { locked: true }), tab("c", { locked: true })];
    expect(lockedTabs(tabs).map((t) => t.id)).toEqual(["b", "c"]);
  });

  it("diğerlerini kapat kilitlileri atlar", () => {
    const tabs = [tab("a"), tab("b", { locked: true }), tab("c"), tab("d")];
    // "a" korunuyor, "b" kilitli -> yalnızca c ve d kapatılabilir.
    expect(closableOthers(tabs, "a").map((t) => t.id)).toEqual(["c", "d"]);
  });

  it("diğerlerini kapat tek sekmede boş döner", () => {
    expect(closableOthers([tab("a")], "a")).toEqual([]);
  });

  it("hepsi kilitliyse kapatılacak sekme kalmaz", () => {
    const tabs = [tab("a"), tab("b", { locked: true }), tab("c", { locked: true })];
    expect(closableOthers(tabs, "a")).toEqual([]);
  });

  it("kilitli sekme içeren grup silinemez", () => {
    expect(canDeleteGroup(group([tab("a"), tab("b")]))).toBe(true);
    expect(canDeleteGroup(group([tab("a"), tab("b", { locked: true })]))).toBe(false);
  });

  it("boş grup silinebilir", () => {
    expect(canDeleteGroup(group([]))).toBe(true);
  });

  it("kilitli sekme adları kullanıcıya gösterilebilir", () => {
    const tabs = [
      tab("a"),
      tab("b", { locked: true, customTitle: "Yayın" }),
      tab("c", { locked: true, cwd: "C:\\Users\\ali\\proje" }),
    ];
    expect(lockedTabNames(tabs, tabLabel)).toEqual(["Yayın", "proje"]);
  });
});

describe("siralama ve surukle-birak", () => {
  const ids = (items: { id: string }[]) => items.map((i) => i.id);

  it("ogeyi ileri tasirken cikarma kaymasini duzeltir", () => {
    const items = [tab("a"), tab("b"), tab("c"), tab("d")];
    // "a"yi "c" ile "d" arasina tasi: ekranda gorulen hedef indeks 3.
    expect(ids(reorder(items, 0, 3))).toEqual(["b", "c", "a", "d"]);
  });

  it("ogeyi geriye tasirken indeks kaymaz", () => {
    const items = [tab("a"), tab("b"), tab("c"), tab("d")];
    expect(ids(reorder(items, 2, 0))).toEqual(["c", "a", "b", "d"]);
  });

  it("sona tasima", () => {
    const items = [tab("a"), tab("b"), tab("c")];
    expect(ids(reorder(items, 0, 3))).toEqual(["b", "c", "a"]);
  });

  it("ayni yere tasima diziyi bozmaz", () => {
    const items = [tab("a"), tab("b"), tab("c")];
    expect(ids(reorder(items, 1, 1))).toEqual(["a", "b", "c"]);
    expect(ids(reorder(items, 1, 2))).toEqual(["a", "b", "c"]);
  });

  it("gecersiz kaynak indeks diziyi degistirmez", () => {
    const items = [tab("a"), tab("b")];
    expect(reorder(items, 5, 0)).toBe(items);
    expect(reorder(items, -1, 0)).toBe(items);
  });

  it("tasma indeksleri kirpilir", () => {
    const items = [tab("a"), tab("b"), tab("c")];
    expect(ids(reorder(items, 0, 99))).toEqual(["b", "c", "a"]);
  });

  it("birakma indeksi imlecin yarisina gore", () => {
    expect(dropIndex(2, false)).toBe(2);
    expect(dropIndex(2, true)).toBe(3);
  });
});

describe("grup gorunumu", () => {
  const g = (id: string, patch: Partial<Group> = {}) => ({ ...group([]), id, ...patch });

  it("tumunu ac/kapat: biri acıksa hepsi kapanir", () => {
    expect(nextCollapsedAll([{ collapsed: false }, { collapsed: true }])).toBe(true);
    expect(nextCollapsedAll([{ collapsed: true }, { collapsed: true }])).toBe(false);
    expect(nextCollapsedAll([])).toBe(false);
  });

  it("suzgec kapaliyken tum gruplar gorunur", () => {
    const list = [g("a"), g("b", { favorite: true })];
    expect(visibleGroups(list, false).map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("suzgec acikken yalnizca favoriler gorunur", () => {
    const list = [g("a"), g("b", { favorite: true }), g("c", { favorite: true })];
    expect(visibleGroups(list, true).map((x) => x.id)).toEqual(["b", "c"]);
  });

  it("gruplanmamis kova suzgecten muaf", () => {
    // Kova favori isaretlenemiyor: basligi, dolayisiyla yildizi yok. Suzgec
    // onu da eleseydi kullanici gruba ait olmayan sekmelerini bir daha
    // bulamazdi - hicbir yerden geri getirilemeyen bir kayip.
    const list = [g("kova", { ungrouped: true }), g("a"), g("b", { favorite: true })];
    expect(visibleGroups(list, true).map((x) => x.id)).toEqual(["kova", "b"]);
  });

  it("etkin grup da favori degilse listede yok", () => {
    // Eskiden istisna vardi ("calistigi yeri gozden kaybetmesin"). Suzgec
    // "favoriler" diyorsa listede favori olmayan bir satir gormek suzgecin ne
    // yaptigini belirsiz kiliyordu. Etkin grubun sekmeleri ustteki sekme
    // cubugunda duruyor, yani erisim kapanmiyor.
    const list = [g("a"), g("b", { favorite: true })];
    expect(visibleGroups(list, true).map((x) => x.id)).toEqual(["b"]);
  });

  it("hic favori yoksa liste bos", () => {
    // Kenar cubugu bu durumda "favori yok" ipucunu gosteriyor.
    expect(visibleGroups([g("a"), g("b")], true)).toEqual([]);
  });
});
