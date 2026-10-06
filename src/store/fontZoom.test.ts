// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Terminal yazısının kısayolla yakınlaştırılması ve ayar sınırları.
 *
 * ÖLÇÜLEN: ⌘= / ⌘- ayarın KENDİSİNİ değiştiriyor, ⌘0 sabit 14'e dönüyordu —
 * Ayarlar'da 10 px seçmiş kullanıcı ⌘0'la 14'e atılıyordu. Kaydırıcı 28'de,
 * kısayol 32'de duruyordu. Şimdi yakınlaştırma ayrı bir fark (`fontZoom`),
 * ⌘0 farkı sıfırlıyor ve sınır tek yerden geliyor.
 */

const saveSettings = vi.fn(async () => {});
vi.mock("../lib/ipc", () => ({
  api: new Proxy({ saveSettings } as Record<string, unknown>, {
    get: (target, prop) => target[prop as string] ?? (async () => undefined),
  }),
  onPtyData: async () => () => {},
  onPtyExit: async () => () => {},
}));

const { useStore } = await import("./useStore");
const { setSystemDark } = await import("../lib/themes");

function appearance() {
  return useStore.getState().settings.appearance;
}

beforeEach(() => {
  const s = useStore.getState().settings;
  useStore.setState({
    settings: { ...s, appearance: { ...s.appearance, fontSize: 10, fontZoom: 0, theme: "nterminal-dark" } },
  });
});

describe("yakınlaştırma", () => {
  it("büyütmek ayardaki boyuta dokunmuyor", async () => {
    await useStore.getState().zoomTerminalFont(1);
    await useStore.getState().zoomTerminalFont(1);
    expect(appearance().fontSize).toBe(10);
    expect(appearance().fontZoom).toBe(2);
  });

  it("sıfırlamak Ayarlar'daki boyuta dönüyor, sabit 14'e değil", async () => {
    await useStore.getState().zoomTerminalFont(1);
    await useStore.getState().zoomTerminalFont(0);
    expect(appearance().fontZoom).toBe(0);
    expect(appearance().fontSize).toBe(10);
  });

  it("sınırda durup boşuna yazmıyor", async () => {
    const s = useStore.getState().settings;
    useStore.setState({ settings: { ...s, appearance: { ...s.appearance, fontSize: 32 } } });
    const before = useStore.getState().settings;
    await useStore.getState().zoomTerminalFont(1);
    expect(useStore.getState().settings, "sınırda ayar yine yazıldı").toBe(before);
  });
});

describe("ayar kapısı", () => {
  it("her yazım sınırlardan geçiyor", async () => {
    // Kutu boşaltılınca 0 olan tampon diske 0 olarak yazılıyordu.
    await useStore.getState().patchAppearance({ scrollback: 0, lineHeight: 0.5 });
    expect(appearance().scrollback).toBe(500);
    expect(appearance().lineHeight).toBe(1);
  });
});

/**
 * "Sistemi izle": ayar değişmeden çizilen tema değişiyor. Temayı çizim
 * sırasında okuyan bileşenler (`TerminalFind`) sayaca abone.
 */
describe("sistem görünümü", () => {
  it("tema 'system' ise sayaç artıyor", () => {
    const s = useStore.getState().settings;
    useStore.setState({ settings: { ...s, appearance: { ...s.appearance, theme: "system" } } });
    const before = useStore.getState().themeEpoch;
    useStore.getState().setSystemDark(false);
    expect(useStore.getState().themeEpoch).toBe(before + 1);
    setSystemDark(true);
  });

  it("belirli bir temada sistem değişimi hiçbir şeyi yeniden çizmiyor", () => {
    const before = useStore.getState().themeEpoch;
    useStore.getState().setSystemDark(false);
    expect(useStore.getState().themeEpoch).toBe(before);
    setSystemDark(true);
  });
});
