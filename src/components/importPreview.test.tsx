// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BundleInfo } from "../types";

/**
 * İçe aktarma ön izlemesi, dosyanın kabukta ÇALIŞTIRACAĞI her şeyi gösteriyor.
 *
 * AÇIK: ön izleme profillerin komutunu ve ortam anahtarlarını gösteriyordu ama
 * grupların ortam değişkenleri hiç yoktu. Grup env'i gruptaki her sekmenin
 * kabuğuna yazılıyor ve profilinkinin üstüne biniyor (`pty::spawn`); profilleri
 * temiz görünen paylaşılan bir dosya, `PROMPT_COMMAND` ya da `BASH_ENV` taşıyan
 * bir grupla sekme açılır açılmaz komut çalıştırabiliyordu — "2 grup" yazan bir
 * sayının ardında.
 *
 * Rust tarafı listeyi kuruyor (`transfer_tests.rs`,
 * `on_izleme_grup_ortam_degiskenlerini_tasiyor`); bu test listenin EKRANA
 * çıktığını bağlıyor.
 */

let preview: BundleInfo;

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: async () => "/yedek/nterminal.json",
  save: async () => null,
}));

vi.mock("../lib/ipc", () => ({
  api: new Proxy(
    { configImportPreview: async (): Promise<BundleInfo> => preview } as Record<string, unknown>,
    { get: (target, prop) => target[prop as string] ?? (async () => undefined) },
  ),
  onPtyData: async () => () => {},
  onPtyExit: async () => () => {},
}));

const { BackupPanel } = await import("./BackupPanel");
const { setLanguage } = await import("../lib/i18n");

function bundle(extra: Partial<BundleInfo>): BundleInfo {
  return {
    path: "/yedek/nterminal.json",
    version: 1,
    exportedAt: 0,
    appVersion: "0.4.9",
    machine: "",
    portablePaths: true,
    hasSettings: false,
    hasWorkspace: true,
    profiles: 0,
    groups: 2,
    tabs: 2,
    history: 0,
    favorites: 0,
    scrollback: 0,
    notes: [],
    profileList: [],
    groupEnvList: [],
    ...extra,
  };
}

async function open() {
  const view = render(<BackupPanel />);
  fireEvent.click(view.getByText("İçe al"));
  fireEvent.click(view.getByText("Dosya seç…"));
  // Ön izleme geldi: uygulama kipleri çizildi.
  await view.findByText("Nasıl uygulanacak?");
  return view;
}

beforeEach(() => setLanguage("tr"));
afterEach(cleanup);

describe("içe aktarma ön izlemesi", () => {
  it("grupların ortam değişkenleri adlarıyla listeleniyor", async () => {
    preview = bundle({
      groupEnvList: [{ name: "Proje", envKeys: ["API_TOKEN", "PROMPT_COMMAND"] }],
    });
    const { getByText } = await open();

    const baslik = getByText("Dosyadaki grupların ortam değişkenleri");
    const bolum = baslik.closest(".section")!;
    expect(bolum.textContent).toContain("Proje");
    expect(bolum.textContent).toContain("API_TOKEN, PROMPT_COMMAND");
    // Kullanıcı neye baktığını bilmeli: bu değişkenler komut çalıştırabilir.
    expect(bolum.textContent).toContain("komut çalıştırır");
  });

  it("ortam değişkeni taşıyan grup yoksa bölüm çizilmiyor", async () => {
    preview = bundle({ groupEnvList: [] });
    const { queryByText } = await open();
    expect(queryByText("Dosyadaki grupların ortam değişkenleri")).toBe(null);
  });
});
