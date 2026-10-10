// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { act } from "react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/ipc", () => ({
  api: new Proxy({} as Record<string, unknown>, { get: () => async () => undefined }),
  onPtyData: async () => () => {},
  onPtyExit: async () => () => {},
}));

import { setLanguage } from "../lib/i18n";
import { platform, setPlatform } from "../lib/platform";
import { defaultPromptColors } from "../lib/promptColors";
import { useStore } from "../store/useStore";
import { SettingsDialog } from "./SettingsDialog";

/**
 * Ayarlar > Terminal > renkli istemin renkleri.
 *
 * İSTEK (kullanıcıdan): "kullanıcı@makine kısmını renklendirdiğini gördüm,
 * bunun rengini ayarlardan belirleyebilir miyim". İki renk (kullanıcı@makine ve
 * klasör) uygulamanın kendi renk seçicisiyle (`ColorButton`) seçiliyor —
 * yerel renk girdisinin macOS'taki seçicisi ekranın köşesinde açılıyordu
 * (bkz. `ColorPanel`); seçilmemiş hâl BOŞ dize ve
 * temanın paletine düşüyor. Renk yalnızca macOS'ta ve "renkli istem" açıkken
 * anlamlı: kabuk betiği kapalıyken hiçbirini okumuyor, Windows'ta betikler
 * (Git Bash/WSL) rengi zaten uygulamıyor.
 */

let onceki = platform();
beforeAll(() => {
  onceki = platform();
});
afterAll(() => setPlatform(onceki));

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
}

beforeEach(() => {
  setLanguage("tr");
  setPlatform("macos");
  const state = useStore.getState();
  useStore.setState({
    ui: { ...state.ui, settingsOpen: true, editingGroupId: null, settingsSection: null },
    settings: {
      ...state.settings,
      behavior: { ...state.settings.behavior, colorPrompt: true, promptUserColor: "", promptDirColor: "" },
    },
  });
});

afterEach(() => {
  cleanup();
  const ui = useStore.getState().ui;
  useStore.setState({ ui: { ...ui, settingsOpen: false } });
});

async function terminalBolumu() {
  const r = render(<SettingsDialog />);
  const dugmeler = [...r.container.querySelectorAll(".settings-nav button")];
  const terminal = dugmeler.find((b) => b.textContent!.trim() === "Terminal")!;
  fireEvent.click(terminal);
  await settle();
  return r;
}

/** Satırın renk düğmesi (`ColorButton`). */
const kutu = (c: HTMLElement, id: "promptUserColor" | "promptDirColor") =>
  c.querySelector(`[data-setting="settings.${id}"] .color-well`) as HTMLButtonElement | null;

/** Satırın seçicisini açıp renk kodu kutusunu verir. */
async function kod(c: HTMLElement, id: "promptUserColor" | "promptDirColor") {
  const satir = c.querySelector(`[data-setting="settings.${id}"]`)!;
  if (!satir.querySelector(".color-hex")) {
    fireEvent.click(kutu(c, id)!);
    await settle();
  }
  return satir.querySelector(".color-hex") as HTMLInputElement;
}

const sifirla = (c: HTMLElement, satir: string) =>
  [...c.querySelectorAll(`[data-setting="${satir}"] button`)].find(
    (b) => b.textContent!.trim() === "Varsayılana dön",
  ) as HTMLButtonElement | undefined;

describe("istem renkleri ayarı", () => {
  it("macOS'ta renkli istemin altında iki renk seçici var", async () => {
    const { container } = await terminalBolumu();
    expect(kutu(container, "promptUserColor")).not.toBe(null);
    expect(kutu(container, "promptDirColor")).not.toBe(null);
    // Yerel renk girdisi yok (macOS'ta seçicisi ekranın köşesinde açılıyordu).
    expect(container.querySelector('input[type="color"]')).toBe(null);
    // Doğru sırada: renkli istem onay kutusu, sonra iki renk.
    const html = container.innerHTML;
    const kullanici = html.indexOf('data-setting="settings.promptUserColor"');
    expect(html.indexOf('id="colorPrompt"')).toBeLessThan(kullanici);
    expect(kullanici).toBeLessThan(html.indexOf('data-setting="settings.promptDirColor"'));
  });

  it("Windows'ta renk seçiciler çizilmiyor", async () => {
    setPlatform("windows");
    const { container } = await terminalBolumu();
    expect(kutu(container, "promptUserColor")).toBe(null);
    expect(kutu(container, "promptDirColor")).toBe(null);
  });

  it("seçilmemişken istemin GERÇEKTE göründüğü rengi (parlak yeşil/mavi) gösteriyor", async () => {
    // Boş değer bir renk seçicide geçersiz; kutu boş ya da siyah görünmemeli.
    const { container } = await terminalBolumu();
    const tema = useStore.getState().settings.appearance.theme;
    const beklenen = defaultPromptColors(tema);
    expect((await kod(container, "promptUserColor")).value).toBe(beklenen.user.toLowerCase());
    expect((await kod(container, "promptDirColor")).value).toBe(beklenen.dir.toLowerCase());
  });

  it("renk seçilince ayara yazılıyor, öteki renk etkilenmiyor", async () => {
    const { container } = await terminalBolumu();
    fireEvent.change(await kod(container, "promptUserColor"), { target: { value: "#ff8c00" } });
    await settle();
    const b = useStore.getState().settings.behavior;
    expect(b.promptUserColor).toBe("#ff8c00");
    expect(b.promptDirColor, "klasör rengi kendiliğinden değişti").toBe("");

    fireEvent.change(await kod(container, "promptDirColor"), { target: { value: "#00aaff" } });
    await settle();
    expect(useStore.getState().settings.behavior.promptDirColor).toBe("#00aaff");
    expect(useStore.getState().settings.behavior.promptUserColor).toBe("#ff8c00");
  });

  it("seçilen renk kutuda görünüyor", async () => {
    const ayarlar = useStore.getState().settings;
    useStore.setState({ settings: { ...ayarlar, behavior: { ...ayarlar.behavior, promptUserColor: "#ff8c00" } } });
    const { container } = await terminalBolumu();
    expect((await kod(container, "promptUserColor")).value).toBe("#ff8c00");
  });

  it("Varsayılana dön seçimi siliyor ve seçim yokken devre dışı", async () => {
    const ayarlar = useStore.getState().settings;
    useStore.setState({ settings: { ...ayarlar, behavior: { ...ayarlar.behavior, promptUserColor: "#ff8c00" } } });
    const { container } = await terminalBolumu();

    expect(sifirla(container, "settings.promptDirColor")!.disabled, "seçim yokken sıfırlanabiliyor").toBe(true);
    const dugme = sifirla(container, "settings.promptUserColor")!;
    expect(dugme.disabled).toBe(false);

    fireEvent.click(dugme);
    await settle();
    expect(useStore.getState().settings.behavior.promptUserColor).toBe("");
    expect(sifirla(container, "settings.promptUserColor")!.disabled).toBe(true);
  });

  it("renkli istem kapalıyken renk seçiciler devre dışı", async () => {
    // Kapalıyken kabuk hiçbir renk değişkenini okumuyor: seçilebilir bırakmak
    // "seçtim ama olmadı" dedirtir.
    const ayarlar = useStore.getState().settings;
    useStore.setState({
      settings: {
        ...ayarlar,
        behavior: { ...ayarlar.behavior, colorPrompt: false, promptUserColor: "#ff8c00" },
      },
    });
    const { container } = await terminalBolumu();
    expect(kutu(container, "promptUserColor")!.disabled).toBe(true);
    expect(kutu(container, "promptDirColor")!.disabled).toBe(true);
    expect(sifirla(container, "settings.promptUserColor")!.disabled).toBe(true);
  });

  it("her renk satırının açıklama düğmesi KENDİ satırında ve kendi metniyle", async () => {
    // İzgarada bilgi sütunu olan öğe kendinden öncekinin satırına yerleşiyor: düğme
    // satırların DIŞINA konunca iki satırın altında boş bir satıra düşüyordu
    // (ekran görüntüsünde tek başına duran bir "i" simgesi).
    const { container } = await terminalBolumu();
    for (const [satir, anahtar] of [
      ["settings.promptUserColor", "kullanıcı@makine"],
      ["settings.promptDirColor", "klasör"],
    ] as const) {
      const kutuSatiri = container.querySelector(`[data-setting="${satir}"]`)!;
      const dugme = kutuSatiri.querySelector(".info-btn") as HTMLButtonElement | null;
      expect(dugme, `${satir}: açıklama düğmesi satırın içinde değil`).not.toBe(null);
      fireEvent.click(dugme!);
      await settle();
      expect(kutuSatiri.querySelector(".info-pop")?.textContent, `${satir}: açıklama metni`).toContain(anahtar);
      fireEvent.click(dugme!); // kapat: ikisi birden açık kalmasın
      await settle();
    }
  });

  it("ayar aranınca renk satırları bulunuyor (macOS)", async () => {
    const { searchSettings } = await import("../lib/settingsIndex");
    const { t } = await import("../lib/i18n");
    const anahtarlar = searchSettings("istem rengi", t).map((h) => h.key);
    expect(anahtarlar).toContain("settings.promptUserColor");
    expect(anahtarlar).toContain("settings.promptDirColor");
  });
});
