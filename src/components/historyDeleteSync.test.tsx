// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { HistoryEntry, HistoryFilter } from "../types";

/**
 * Geçmiş panelinden silinen komut yukarı okun listesinden de düşmeli.
 *
 * Yukarı okun açtığı panel ve yazarken gelen öneriler bellekteki kaynaktan
 * (`suggestHistory`) okuyor; o kaynak açılışta bir kez yükleniyordu. Yan
 * paneldeki Sil düğmesi yalnızca diski siliyordu: silinen komut, uygulama
 * yeniden açılana kadar yukarı okta görünmeye devam ederdi — "istemediklerimi
 * kaldırabilmeliyim" isteğinin öbür yolu sessizce yarım kalırdı.
 */

let disk: HistoryEntry[] = [];

vi.mock("../lib/ipc", () => ({
  api: new Proxy(
    {
      historyQuery: async (filter: HistoryFilter) => {
        const entries = disk.filter((e) => !filter.tabId || e.tabId === filter.tabId);
        return { entries, total: entries.length, grandTotal: disk.length };
      },
      historyDelete: async (ids: string[]) => {
        const before = disk.length;
        disk = disk.filter((e) => !ids.includes(e.id));
        return before - disk.length;
      },
      favoritesList: async () => [],
      saveSettings: async () => {},
    } as Record<string, unknown>,
    { get: (target, prop) => target[prop as string] ?? (async () => undefined) },
  ),
  onPtyData: async () => () => {},
  onPtyExit: async () => () => {},
}));

const { useStore } = await import("../store/useStore");
const { HistoryPanel } = await import("./HistoryPanel");
const { setLanguage } = await import("../lib/i18n");

function record(id: string, command: string): HistoryEntry {
  return {
    id,
    command,
    tabId: "t1",
    groupId: "g1",
    profileId: "p1",
    cwd: null,
    startedAt: 1,
    durationMs: 5,
    exitCode: 0,
    source: "integration",
  };
}

beforeEach(() => {
  setLanguage("tr");
  disk = [record("h1", "gti status"), record("h2", "git status")];
  const ui = useStore.getState().ui;
  useStore.setState({
    ui: { ...ui, historyScope: "all" },
    suggestHistory: [
      { command: "git status", cwd: null, tabId: "t1" },
      { command: "gti status", cwd: null, tabId: "t1" },
    ],
    askConfirm: async () => true,
  });
});

afterEach(cleanup);

const remembered = () => useStore.getState().suggestHistory.map((e) => e.command);

describe("geçmiş panelinden silme", () => {
  it("seçili kaydı silmek yukarı okun kaynağını da tazeliyor", async () => {
    const { container, findByText } = render(<HistoryPanel />);
    fireEvent.click(await findByText("gti status"));
    const sil = [...container.querySelectorAll<HTMLButtonElement>(".panel-foot button")].find(
      (b) => b.textContent === "Sil",
    )!;
    fireEvent.click(sil);

    await waitFor(() => expect(remembered()).toEqual(["git status"]));
  });

  it("kapsamı temizlemek de tazeliyor", async () => {
    const { container, findByText } = render(<HistoryPanel />);
    await findByText("gti status");
    const temizle = [...container.querySelectorAll<HTMLButtonElement>(".panel-foot button")].at(-1)!;
    // `historyClear` sahtede yok: temizlenmiş diski doğrudan kuruyoruz, test
    // edilen şey panelin kaynağı yeniden okuması.
    disk = [];
    fireEvent.click(temizle);

    await waitFor(() => expect(remembered()).toEqual([]));
  });
});
