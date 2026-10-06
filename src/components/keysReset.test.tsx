// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Kısayolları varsayılana döndürmek.
 *
 * Önceden bunun tek yolu BÜTÜN ayarları sıfırlamaktı (tema, profiller, dil
 * dahil). Satır başına "varsayılana dön" bilinçli olarak yok — satırdaki geri
 * al bu oturumdaki değişiklik için (`SettingUndo`); fabrika ayarına dönüş
 * toplu ve onaylı.
 */

const defaultKeybindings = vi.fn(async () => ({ newTab: "Cmd+T", closeTab: "Cmd+W" }));
vi.mock("../lib/ipc", () => ({
  api: new Proxy({ defaultKeybindings } as Record<string, unknown>, {
    get: (target, prop) => target[prop as string] ?? (async () => undefined),
  }),
  onPtyData: async () => () => {},
  onPtyExit: async () => () => {},
}));

const { useStore } = await import("../store/useStore");
const { SettingsDialog } = await import("./SettingsDialog");

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
}

let asked = 0;
function answer(ok: boolean) {
  asked = 0;
  useStore.setState({
    askConfirm: async () => {
      asked++;
      return ok;
    },
  });
}

beforeEach(() => {
  const s = useStore.getState();
  useStore.setState({
    ui: { ...s.ui, settingsOpen: true, editingGroupId: null, settingsSection: "keys" },
    settings: {
      ...s.settings,
      keybindings: { newTab: "Ctrl+Alt+T", closeTab: "Cmd+W", eskiEylem: "Cmd+J" },
    },
  });
});

afterEach(cleanup);

describe("kısayolları varsayılana döndürmek", () => {
  it("soruyor; vazgeçince hiçbir şey değişmiyor", async () => {
    answer(false);
    const { container } = render(<SettingsDialog />);
    await settle();
    fireEvent.click(container.querySelector(".keys-reset")!);
    await settle();
    expect(asked).toBe(1);
    expect(useStore.getState().settings.keybindings.newTab).toBe("Ctrl+Alt+T");
  });

  it("onaylanınca yalnızca kısayollar dönüyor, tanınmayan eylem kalıyor", async () => {
    answer(true);
    const theme = useStore.getState().settings.appearance.theme;
    const { container } = render(<SettingsDialog />);
    await settle();
    fireEvent.click(container.querySelector(".keys-reset")!);
    await settle();
    const kb = useStore.getState().settings.keybindings;
    expect(kb.newTab).toBe("Cmd+T");
    // Başka bir sürümden gelen eylem silinmiyor.
    expect(kb.eskiEylem).toBe("Cmd+J");
    // Öteki ayarlara dokunulmuyor.
    expect(useStore.getState().settings.appearance.theme).toBe(theme);
  });
});
