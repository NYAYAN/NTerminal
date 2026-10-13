// @vitest-environment jsdom
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLanguage } from "../lib/i18n";
import { api } from "../lib/ipc";
import { setPlatform } from "../lib/platform";
import { useStore } from "../store/useStore";
import type { DirEntry, GitInfo, Group, TabState } from "../types";
import { FileTree } from "./FileTree";

/*
 * Dosya ağacında değişen dosyalar.
 *
 * İSTEK: "Dosyalar kısmında değişiklik olan dosyaları da anlamalıyım." Değişen
 * dosyanın adı Değişiklikler listesinin renginde ve sağında onun simgesi
 * (aynı `git-icon` sınıfları, aynı metinler); içinde değişiklik olan
 * klasörün sağında bir nokta. Kapalı klasörde de görünmeli: içine bakmadan
 * "burada bir şey var" demesi işaretin asıl işi.
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

const AGAC: Record<string, DirEntry[]> = {
  [CWD]: [
    { name: "src", dir: true },
    { name: "yeni", dir: true },
    { name: "temiz", dir: true },
    { name: "README.md", dir: false },
    { name: "notlar.txt", dir: false },
  ],
  [`${CWD}/src`]: [
    { name: "a.ts", dir: false },
    { name: "b.ts", dir: false },
  ],
};

function info(changes: GitInfo["changes"]): GitInfo {
  return {
    branch: "main",
    detached: false,
    ahead: 0,
    behind: 0,
    upstream: null,
    unborn: false,
    staged: 0,
    stashCount: 0,
    root: CWD,
    changes,
  } as GitInfo;
}

function seed(changes: GitInfo["changes"], expanded: string[] = []) {
  const state = useStore.getState();
  useStore.setState({
    ready: true,
    groups: [group()],
    activeGroupId: "g1",
    gitInfo: { [CWD]: info(changes) },
    ui: { ...state.ui, treeOpen: true, viewerPath: null, treeExpanded: expanded },
  });
}

/** Ağaçtaki bir satırı ada göre bul. */
function satir(container: HTMLElement, ad: string): HTMLElement | undefined {
  return [...container.querySelectorAll<HTMLElement>(".tree-row")].find(
    (el) => el.querySelector(".tree-name")?.textContent === ad,
  );
}

beforeEach(() => {
  setLanguage("tr");
  setPlatform("windows");
  vi.spyOn(api, "listEntries").mockImplementation(async (p: string) => AGAC[p.replace(/\\/g, "/")] ?? []);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("dosya ağacında değişen dosyalar", () => {
  it("değişen ve takip edilmeyen dosya kendi renginde ve simgesiyle; değişmeyen düz", async () => {
    seed([change(" M", "README.md"), change("??", "notlar.txt")]);
    const { container } = render(<FileTree />);
    await waitFor(() => expect(satir(container, "README.md")).not.toBe(undefined));
    const readme = satir(container, "README.md")!;
    expect(readme.className).toContain("git-mod");
    expect(readme.querySelector(".git-icon.mod")?.getAttribute("aria-label")).toBe("Değişti");
    const notlar = satir(container, "notlar.txt")!;
    expect(notlar.className).toContain("git-untracked");
    expect(notlar.querySelector(".git-icon.untracked")).not.toBe(null);
    expect(satir(container, "temiz")!.className).not.toContain("git-");
    expect(satir(container, "temiz")!.querySelector(".tree-dot")).toBe(null);
  });

  it("KAPALI klasör içindeki değişikliği noktayla söylüyor; yalnızca yeni dosya varsa yeşil", async () => {
    seed([change(" M", "src/a.ts"), change("??", "yeni/x.ts")]);
    const { container } = render(<FileTree />);
    await waitFor(() => expect(satir(container, "src")).not.toBe(undefined));
    const src = satir(container, "src")!;
    expect(src.className).toContain("git-mod");
    expect(src.querySelector(".tree-dot.mod")?.getAttribute("title")).toBe("İçinde değişiklik var");
    expect(satir(container, "yeni")!.querySelector(".tree-dot.new")).not.toBe(null);
  });

  it("açık klasörün içinde yalnızca değişen dosya işaretli", async () => {
    seed([change(" M", "src/a.ts")], [`${CWD}/src`]);
    const { container } = render(<FileTree />);
    await waitFor(() => expect(satir(container, "a.ts")).not.toBe(undefined));
    expect(satir(container, "a.ts")!.className).toContain("git-mod");
    expect(satir(container, "b.ts")!.className).not.toContain("git-");
  });

  it("git durumu değişince işaretler de değişiyor (commit sonrası temiz)", async () => {
    seed([change(" M", "README.md")]);
    const { container } = render(<FileTree />);
    await waitFor(() => expect(satir(container, "README.md")?.className).toContain("git-mod"));
    useStore.setState({ gitInfo: { [CWD]: info([]) } });
    await waitFor(() => expect(satir(container, "README.md")?.className).not.toContain("git-"));
  });
});

function change(status: string, path: string) {
  return { status, path };
}
