// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Satır başına "değişikliği geri al".
 *
 * Kullanıcının ölçütü: "ben anlık olarak değişiklik yaptıysam satır bazlı geri
 * al gelmeli. çıkış yapıp giriş yaptıysam artık görmemeliyim. genel sıfırla ile
 * eski haline çevirebilirim".
 *
 * Yani karşılaştırma FABRİKA VARSAYILANI DEĞİL, pencerenin açıldığı andaki
 * değer. İlk sürüm varsayılanla karşılaştırıyordu ve kullanıcının aylar önce
 * kurduğu her ayar "değişmiş" sayıldığı için neredeyse her satırda bir düğme
 * duruyordu — düğme hiçbir şey söylemiyordu. Bu testler o ayrımı bağlıyor.
 */

vi.mock("../lib/ipc", () => ({
  api: new Proxy({} as Record<string, unknown>, {
    get: () => async () => undefined,
  }),
  onPtyData: async () => () => {},
  onPtyExit: async () => () => {},
}));

const { useStore } = await import("../store/useStore");
const { SettingsDialog } = await import("./SettingsDialog");
const { setLanguage } = await import("../lib/i18n");

const undoButtons = (c: HTMLElement) => [...c.querySelectorAll(".undo-btn")];

/** Bölüme geç: gezinme düğmelerinin sırası `SECTIONS` ile aynı. */
function goto(container: HTMLElement, index: number) {
  fireEvent.click([...container.querySelectorAll(".settings-nav button")][index]);
}

/** Ayarı kullanıcının yaptığı gibi değiştir: pencerenin kullandığı eylem. */
async function change(patch: Record<string, unknown>) {
  await act(async () => {
    await useStore.getState().patchAppearance(patch);
  });
}

beforeEach(() => {
  setLanguage("tr");
  const state = useStore.getState();
  useStore.setState({
    ui: { ...state.ui, settingsOpen: true, editingGroupId: null },
    settings: {
      ...state.settings,
      appearance: { ...state.settings.appearance, fontSize: 14, lineHeight: 1.2 },
    },
  });
});

afterEach(() => {
  cleanup();
  const ui = useStore.getState().ui;
  useStore.setState({ ui: { ...ui, settingsOpen: false } });
});

describe("ayar değişikliğini geri alma", () => {
  it("açılışta hiçbir satırda geri al yok — varsayılandan farklı olsa bile", async () => {
    // Kullanıcının ÖNCEDEN kurduğu bir değer: fabrika varsayılanı 14, kayıtlı
    // değer 22. Pencere bunu "değişiklik" saymamalı.
    const state = useStore.getState();
    useStore.setState({
      settings: {
        ...state.settings,
        appearance: { ...state.settings.appearance, fontSize: 22 },
      },
    });

    const { container } = render(<SettingsDialog />);
    goto(container, 1); // Görünüm
    await waitFor(() => {
      expect(container.querySelector(".field"), "bölüm çizilmedi").not.toBe(null);
    });
    expect(undoButtons(container).length, "eski ayar 'değişmiş' sayıldı").toBe(0);
  });

  it("bu oturumda değişen ayarda çıkıyor ve tek tıkla eski değer geliyor", async () => {
    const { container } = render(<SettingsDialog />);
    goto(container, 1);

    await change({ fontSize: 22 });
    await waitFor(() => {
      expect(undoButtons(container).length, "geri al çıkmadı").toBe(1);
    });

    fireEvent.click(undoButtons(container)[0]);
    await waitFor(() => {
      expect(useStore.getState().settings.appearance.fontSize).toBe(14);
    });
    expect(undoButtons(container).length, "eski değere dönüldü, düğme kalmış").toBe(0);
  });

  it("iki ayar değişince iki düğme, biri ötekini geri almıyor", async () => {
    const { container } = render(<SettingsDialog />);
    goto(container, 1);

    await change({ fontSize: 22, lineHeight: 1.8 });
    await waitFor(() => {
      expect(undoButtons(container).length).toBe(2);
    });

    fireEvent.click(undoButtons(container)[0]);
    await waitFor(() => {
      expect(useStore.getState().settings.appearance.fontSize).toBe(14);
    });
    // Öteki değişiklik DURUYOR: düğme tek ayarı geri alıyor, bölümü değil.
    expect(useStore.getState().settings.appearance.lineHeight).toBe(1.8);
    expect(undoButtons(container).length).toBe(1);
  });

  it("pencere kapanıp açılınca geri al kayboluyor", async () => {
    // "çıkış yapıp giriş yaptıysam artık görmemeliyim": ölçüt pencere her
    // açılışında yenileniyor, çünkü anlık görüntü bileşenin ilk çiziminde
    // alınıyor.
    const first = render(<SettingsDialog />);
    goto(first.container, 1);
    await change({ fontSize: 22 });
    await waitFor(() => {
      expect(undoButtons(first.container).length).toBe(1);
    });

    cleanup();

    const second = render(<SettingsDialog />);
    goto(second.container, 1);
    await waitFor(() => {
      expect(second.container.querySelector(".field")).not.toBe(null);
    });
    expect(undoButtons(second.container).length, "yeni pencerede düğme kalmış").toBe(0);
  });

  it("genel sıfırlama altlıkta, her bölümden görünüyor", () => {
    // Önceki yeri Hakkında bölümünün dibiydi: ayarı değiştiren kullanıcının
    // bulunduğu yerden dört tık uzakta.
    const { container } = render(<SettingsDialog />);
    expect(
      container.querySelector(".modal-foot")!.textContent,
      "altlıkta sıfırlama yok",
    ).toContain("Ayarları sıfırla");

    goto(container, 8); // Hakkında
    expect(
      container.querySelector(".modal-body")!.textContent,
      "aynı iş iki yerde duruyor",
    ).not.toContain("Ayarları sıfırla");
  });
});
