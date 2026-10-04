// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLanguage } from "../lib/i18n";
import { setPlatform } from "../lib/platform";
import { useStore } from "../store/useStore";
import type { GitInfo, Group, TabState } from "../types";
import { ContextBar } from "./ContextBar";
import { GitChanges } from "./GitChanges";

/**
 * Git durumu henüz bilinmeyen dizin "depo değil" diye gösterilmiyor.
 *
 * BİLDİRİLEN: "Bir sekmeden başka bir sekmeye (klasör dizini de değişiyor)
 * geçince 'Bu klasör repo dizini yok' gibi bir şey çıkıyor. Burada henüz
 * hesaplamada olmadıysa loading çıkması doğru olur."
 *
 * KÖK NEDEN: depo iki durumu ayrı tutuyor — hiç bakılmamış dizinin anahtarı
 * yok, depo olmayan dizin `null` (bkz. `gitInfo`) — ama panelin kancası
 * (`useActiveGit`) `?? null` ile ikisini birleştiriyordu. Üstüne, geçilen
 * sekmenin dizinine ancak kabuk dizini bildirince ya da 5 sn'lik ilk
 * yoklamada bakılıyordu; "depo değil" yazısı o kadar ekranda kalıyordu.
 */

function tab(id: string, cwd: string | null): TabState {
  return {
    id,
    title: id,
    customTitle: null,
    profileId: "p1",
    cwd,
    createdAt: 0,
    lastActiveAt: 0,
    hasScrollback: false,
    lastCommand: null,
    locked: false,
  };
}

function group(tabs: TabState[], active: string): Group {
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
    activeTabId: active,
    tabs,
  };
}

function repo(root: string): GitInfo {
  return {
    branch: "main",
    detached: false,
    ahead: 0,
    behind: 0,
    upstream: "origin/main",
    unborn: false,
    staged: 0,
    stashCount: 0,
    changes: [],
    root,
  };
}

const refreshGit = vi.fn(async () => {});

function seed(tabs: TabState[], active: string, gitInfo: Record<string, GitInfo | null>) {
  useStore.setState({
    ready: true,
    groups: [group(tabs, active)],
    activeGroupId: "g1",
    gitInfo,
    ui: { ...useStore.getState().ui, stashOpen: false, gitExpanded: [] },
  });
}

beforeEach(() => {
  setLanguage("tr");
  setPlatform("windows");
  refreshGit.mockClear();
  useStore.setState({
    refreshGit,
    pollGit: vi.fn(async () => {}),
    refreshNode: vi.fn(async () => {}),
  });
});

afterEach(async () => {
  await act(async () => {});
  cleanup();
  vi.restoreAllMocks();
});

const flush = () => act(async () => {});

describe("Değişiklikler paneli", () => {
  it("bakılmamış dizinde 'Yükleniyor…', 'depo değil' DEĞİL", async () => {
    seed([tab("t1", "/yeni")], "t1", {});
    const { container } = render(<GitChanges />);
    await flush();
    expect(container.textContent).toContain("Yükleniyor…");
    expect(container.textContent).not.toContain("git deposu değil");
  });

  it("bakılmış ve depo olmayan dizinde 'depo değil'", async () => {
    seed([tab("t1", "/duz")], "t1", { "/duz": null });
    const { container } = render(<GitChanges />);
    await flush();
    expect(container.textContent).toContain("Bu klasör bir git deposu değil");
    expect(container.textContent).not.toContain("Yükleniyor…");
  });

  it("dizini henüz bilinmeyen yeni sekmede de 'Yükleniyor…'", async () => {
    // Kabuk doğana kadar `cwd` boş; doğunca `pty_spawn` sonucuyla geliyor.
    seed([tab("t1", null)], "t1", {});
    const { container } = render(<GitChanges />);
    await flush();
    expect(container.textContent).toContain("Yükleniyor…");
    expect(container.textContent).not.toContain("git deposu değil");
  });

  it("sonuç gelince yükleniyor yazısı gidiyor", async () => {
    seed([tab("t1", "/depo")], "t1", {});
    const { container } = render(<GitChanges />);
    await flush();
    await act(async () => {
      useStore.setState({ gitInfo: { "/depo": repo("/depo") } });
    });
    expect(container.textContent).not.toContain("Yükleniyor…");
    expect(container.textContent).toContain("Değişiklik yok");
  });

  it("sekme değişince yeni dizin bilinene kadar yükleniyor", async () => {
    // Bildirilen yolun kendisi: ilk sekmenin deposu biliniyor, ikincininki değil.
    seed([tab("t1", "/a"), tab("t2", "/b")], "t1", { "/a": repo("/a") });
    const { container } = render(<GitChanges />);
    await flush();
    expect(container.textContent).toContain("Değişiklik yok");

    act(() => useStore.getState().setActiveTab("t2"));
    expect(container.textContent).toContain("Yükleniyor…");
    expect(container.textContent).not.toContain("git deposu değil");
  });
});

describe("bağlam şeridi", () => {
  it("bakılmamış dizine geçilince sorgu HEMEN başlıyor", async () => {
    seed([tab("t1", "/a"), tab("t2", "/b")], "t1", { "/a": repo("/a") });
    render(<ContextBar />);
    await flush();
    expect(refreshGit, "bilinen dizin yeniden sorulmamalı").not.toHaveBeenCalled();

    act(() => useStore.getState().setActiveTab("t2"));
    await flush();
    expect(refreshGit).toHaveBeenCalledWith("/b");
  });

  it("depo olmadığı bilinen dizinde yeniden sormuyor", async () => {
    // `null` da bir cevap: her sekme geçişinde `git` çalıştırmanın anlamı yok.
    seed([tab("t1", "/duz")], "t1", { "/duz": null });
    render(<ContextBar />);
    await flush();
    expect(refreshGit).not.toHaveBeenCalled();
  });
});
