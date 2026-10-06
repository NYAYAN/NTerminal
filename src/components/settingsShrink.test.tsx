// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Silen iki ayar: kaydırma tamponu ve geçmiş sınırı.
 *
 * İkisi de KÜÇÜLTÜLÜNCE veri siliyor: xterm sığmayan en eski satırları hemen
 * atıyor (ÖLÇÜLEN: 3001 satırlık sekme ilk tuşta 58 satıra düştü), Rust
 * tarafı sınırın altındaki geçmiş kayıtlarını bellekten ve sıkıştırmada
 * dosyadan çıkarıyor. Kullanıcının kuralı "silme her zaman sorar"
 * (`deleteConfirm.test.ts`): (1) soruluyor mu, (2) VAZGEÇ denince silme
 * gerçekten olmuyor mu. Geri al düğmesi de küçültebilir; o da aynı yoldan.
 */

vi.mock("../lib/ipc", () => ({
  api: new Proxy(
    {
      historyStats: async () => ({ total: 40_000, fileBytes: 1_000_000 }),
    } as Record<string, unknown>,
    { get: (target, prop) => target[prop as string] ?? (async () => undefined) },
  ),
  onPtyData: async () => () => {},
  onPtyExit: async () => () => {},
}));

const { sessions, useStore } = await import("../store/useStore");
const { SettingsDialog } = await import("./SettingsDialog");

let asked: string[] = [];
function answer(ok: boolean) {
  asked = [];
  useStore.setState({
    askConfirm: async (request) => {
      asked.push(request.message);
      return ok;
    },
  });
}

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
}

async function open(section: number) {
  const view = render(<SettingsDialog />);
  fireEvent.click([...view.container.querySelectorAll(".settings-nav button")][section]);
  await settle();
  return view;
}

function commit(input: HTMLInputElement, value: string) {
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
}

beforeEach(() => {
  const s = useStore.getState();
  useStore.setState({
    ui: { ...s.ui, settingsOpen: true, editingGroupId: null, settingsSection: null },
    settings: {
      ...s.settings,
      appearance: { ...s.settings.appearance, scrollback: 10_000 },
      behavior: { ...s.settings.behavior, historyLimit: 50_000 },
    },
  });
  // Tamponunda 5000 satır olan açık bir sekme.
  sessions.set("dolu", {
    scrollbackLines: () => 5_000,
    applySettings: () => {},
  } as never);
});

afterEach(() => {
  cleanup();
  sessions.delete("dolu");
});

describe("kaydırma tamponunu küçültmek", () => {
  const field = (c: HTMLElement) =>
    c.querySelector('[data-setting="settings.scrollbackLines"] input') as HTMLInputElement;

  it("satır silinecekse soruyor; vazgeçince değişmiyor", async () => {
    answer(false);
    const { container } = await open(3); // Oturum
    commit(field(container), "2000");
    await settle();
    expect(asked).toHaveLength(1);
    expect(asked[0]).toContain("3.000");
    expect(useStore.getState().settings.appearance.scrollback).toBe(10_000);
  });

  it("onaylanınca kaydediyor", async () => {
    answer(true);
    const { container } = await open(3);
    commit(field(container), "2000");
    await settle();
    expect(useStore.getState().settings.appearance.scrollback).toBe(2_000);
  });

  it("hiçbir satır gitmiyorsa sormuyor", async () => {
    // 6000 > 5000 satır: küçülme var ama silinen yok.
    answer(false);
    const { container } = await open(3);
    commit(field(container), "6000");
    await settle();
    expect(asked).toEqual([]);
    expect(useStore.getState().settings.appearance.scrollback).toBe(6_000);
  });
});

describe("geçmiş sınırını küçültmek", () => {
  const field = (c: HTMLElement) =>
    c.querySelector('[data-setting="settings.historyLimit"] input') as HTMLInputElement;

  it("kayıt silinecekse soruyor; vazgeçince değişmiyor", async () => {
    answer(false);
    const { container } = await open(4); // Geçmiş
    await settle(); // kayıt sayısı gelsin
    commit(field(container), "1000");
    await settle();
    expect(asked).toHaveLength(1);
    expect(asked[0]).toContain("39.000");
    expect(useStore.getState().settings.behavior.historyLimit).toBe(50_000);
  });

  it("kayıt sayısının altına inmiyorsa sormuyor", async () => {
    answer(false);
    const { container } = await open(4);
    await settle();
    commit(field(container), "45000");
    await settle();
    expect(asked).toEqual([]);
    expect(useStore.getState().settings.behavior.historyLimit).toBe(45_000);
  });
});
