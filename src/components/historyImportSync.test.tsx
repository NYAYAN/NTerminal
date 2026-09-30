// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Bootstrap, BundleInfo, HistoryEntry, ImportOptions, ImportResult } from "../types";

/**
 * İçe alınan geçmiş yukarı okun listesine de yansımalı.
 *
 * Yukarı okun açtığı panel ve yazarken gelen öneriler bellekteki kaynaktan
 * (`suggestHistory`) okuyor; o kaynak diskten açılışta bir kez yükleniyor.
 * İçe alma ise diski değiştiriyor: "Üzerine ekle" başka makinenin komutlarını
 * getiriyor, "Üzerine yaz" buradakileri siliyor. Kaynak tazelenmezse
 * getirilen komutlar yukarı okta görünmez, silinenler de uygulama yeniden
 * açılana kadar önerilmeye devam eder.
 */

/** Rust tarafındaki geçmiş deposu. */
let disk: HistoryEntry[] = [];
/** Seçilen yedek dosyasındaki geçmiş. */
let file: HistoryEntry[] = [];
let boot: Bootstrap;

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: async () => "/yedek/nterminal.json",
  save: async () => null,
}));

vi.mock("../lib/ipc", () => ({
  api: new Proxy(
    {
      // Rust'taki gibi en yeni önce.
      historyQuery: async () => {
        const entries = [...disk].sort((a, b) => b.startedAt - a.startedAt);
        return { entries, total: entries.length, grandTotal: disk.length };
      },
      configImportPreview: async (path: string): Promise<BundleInfo> => ({
        path,
        version: 1,
        exportedAt: 0,
        appVersion: "0.1.0",
        machine: "",
        portablePaths: true,
        // Dosyada yalnızca geçmiş var; öbür bölümler kendiliğinden Atla'ya düşüyor.
        hasSettings: false,
        hasWorkspace: false,
        profiles: 0,
        groups: 0,
        tabs: 0,
        history: file.length,
        favorites: 0,
        scrollback: 0,
        notes: [],
      }),
      configImportApply: async (_path: string, options: ImportOptions): Promise<ImportResult> => {
        // `HistoryStore::ingest` gibi: üzerine yazmak önce siliyor, aynı
        // kimlik ikinci kez girmiyor.
        if (options.history === "replace") disk = [];
        const added =
          options.history === "skip" ? [] : file.filter((e) => !disk.some((d) => d.id === e.id));
        disk = [...disk, ...added];
        return {
          settingsApplied: false,
          workspaceApplied: false,
          profilesAdded: 0,
          groupsAdded: 0,
          historyAdded: added.length,
          favoritesAdded: 0,
          scrollbackAdded: 0,
          notes: [],
        };
      },
      // İçe almadan sonraki `bootstrap()` gerçek yoldan geçsin: sahte boş
      // dönseydi açılış hata verip yarıda kalırdı ve test üründe olmayan bir
      // durumu ölçerdi.
      bootstrap: async () => boot,
      favoritesList: async () => [],
    } as Record<string, unknown>,
    { get: (target, prop) => target[prop as string] ?? (async () => undefined) },
  ),
  onPtyData: async () => () => {},
  onPtyExit: async () => () => {},
}));

const { useStore } = await import("../store/useStore");
const { TransferDialog } = await import("./TransferDialog");
const { setLanguage } = await import("../lib/i18n");

function record(id: string, command: string, startedAt: number): HistoryEntry {
  return {
    id,
    command,
    tabId: "t1",
    groupId: "g1",
    profileId: "p1",
    cwd: null,
    startedAt,
    durationMs: 5,
    exitCode: 0,
    source: "integration",
  };
}

beforeEach(() => {
  setLanguage("tr");
  boot = {
    settings: useStore.getState().settings,
    workspace: { version: 1, activeGroupId: null, groups: [], savedAt: 0 },
    paths: {
      root: "",
      settingsFile: "",
      workspaceFile: "",
      historyFile: "",
      scrollbackDir: "",
      integrationDir: "",
      portable: false,
    },
    appVersion: "0.1.0",
    restored: false,
    windowsBuild: 22631,
    platform: "windows",
    fileManager: "Gezgin",
    fileManagerEn: "Explorer",
  };
});

afterEach(cleanup);

const remembered = () => useStore.getState().suggestHistory.map((e) => e.command);

/** Açılıştaki hâl: kaynak diskten bir kez yüklenmiş. */
async function startWith(local: HistoryEntry[], incoming: HistoryEntry[]) {
  disk = local;
  file = incoming;
  await useStore.getState().loadSuggestHistory();
}

/** Yedek dosyasını seçip yalnızca geçmişi verilen kiple uygular. */
async function importHistory(mode: "Üzerine ekle" | "Üzerine yaz") {
  const { getByText, findByText } = render(<TransferDialog />);
  fireEvent.click(getByText("İçe al"));
  fireEvent.click(getByText("Dosya seç…"));
  const field = (await findByText("Komut geçmişi")).closest(".field")!;
  fireEvent.click([...field.querySelectorAll("button")].find((b) => b.textContent === mode)!);
  fireEvent.click(getByText("Uygula"));
}

describe("içe almadan sonra öneri kaynağı", () => {
  it("üzerine eklenen komutlar yukarı okun kaynağına giriyor", async () => {
    await startWith([record("h1", "git status", 1)], [record("x1", "npm run build", 2)]);
    expect(remembered()).toEqual(["git status"]);

    await importHistory("Üzerine ekle");

    await waitFor(() => expect(remembered()).toEqual(["npm run build", "git status"]));
  });

  it("üzerine yazınca silinen komutlar artık önerilmiyor", async () => {
    await startWith([record("h1", "gti status", 1)], [record("x1", "git status", 2)]);
    expect(remembered()).toEqual(["gti status"]);

    await importHistory("Üzerine yaz");

    await waitFor(() => expect(remembered()).toEqual(["git status"]));
  });
});
