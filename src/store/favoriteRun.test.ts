// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setPlatform } from "../lib/platform";
import { sessions, useStore } from "../store/useStore";
import type { Favorite, Group, TabState } from "../types";

/**
 * Favoriyi listeden kullanmak: tek tık YAZAR, çalıştırmak klasörüne GEÇER.
 *
 * BİLDİRİLEN: "Favorilerden bir komuta bir kere click yaptığımda komut yazın
 * kısmına komutu yazıyor ama hangi path'deysem o path'i de değiştiriyor. Path
 * değiştirmemeli. Çalıştır dersem yola gidip komutu çalıştırmalı."
 *
 * İkisi aynı yoldan geçiyor (`runFavorite(id, execute)`); fark yalnızca
 * `execute`. Klasör değişimi `changeDir`den (kilit kararı orada).
 */

function tab(locked = false): TabState {
  return {
    id: "t1",
    title: "t1",
    customTitle: null,
    profileId: "p1",
    cwd: "/Users/n/burada",
    createdAt: 0,
    lastActiveAt: 0,
    hasScrollback: false,
    lastCommand: null,
    locked,
  };
}

function group(t: TabState): Group {
  return {
    id: "g1",
    name: "g1",
    color: null,
    icon: null,
    collapsed: false,
    favorite: false,
    ungrouped: false,
    defaultProfileId: null,
    defaultCwd: null,
    env: {},
    activeTabId: t.id,
    tabs: [t],
  };
}

const FAV: Favorite = {
  id: "f1",
  command: "yarn start:dev",
  label: null,
  note: null,
  groupId: null,
  folder: null,
  cwd: "/Users/n/proje",
  alias: "yysd",
  createdAt: 0,
  usedCount: 0,
  lastUsedAt: null,
};

const initial = useStore.getState();

/** Oturum: kabuğa giden satırları sırasıyla topluyor. */
function seed(locked = false) {
  const insertCommand = vi.fn();
  sessions.clear();
  sessions.set("t1", { insertCommand, cwd: "/Users/n/burada" } as never);
  useStore.setState({
    ready: true,
    groups: [group(tab(locked))],
    activeGroupId: "g1",
    favorites: [FAV],
    appInputSink: null,
    markFavoriteUsed: vi.fn(async () => {}),
  } as never);
  return insertCommand;
}

beforeEach(() => {
  // `cd`nin tırnaklaması kabuğa göre; sahte oturumun profili yok.
  setPlatform("macos");
});

afterEach(() => {
  sessions.clear();
  useStore.setState({
    groups: [],
    activeGroupId: null,
    favorites: [],
    appInputSink: initial.appInputSink,
    markFavoriteUsed: initial.markFavoriteUsed,
    ui: initial.ui,
  });
});

describe("favoriyi listeden kullanmak", () => {
  it("tek tık komutu yalnızca yazıyor: klasör değişmiyor", async () => {
    const insertCommand = seed();
    await useStore.getState().runFavorite("f1", false);
    expect(insertCommand.mock.calls).toEqual([["yarn start:dev", false]]);
  });

  it("çalıştırmak önce favorinin klasörüne geçiyor, sonra çalıştırıyor", async () => {
    const insertCommand = seed();
    await useStore.getState().runFavorite("f1", true);
    expect(insertCommand.mock.calls).toEqual([
      ["cd /Users/n/proje", true],
      ["yarn start:dev", true],
    ]);
  });

  it("kilitli sekmede çalıştırmıyor (yanlış klasörde çalışırdı), yazmak yine serbest", async () => {
    const insertCommand = seed(true);
    await useStore.getState().runFavorite("f1", true);
    expect(insertCommand).not.toHaveBeenCalled();

    await useStore.getState().runFavorite("f1", false);
    expect(insertCommand.mock.calls).toEqual([["yarn start:dev", false]]);
  });
});
