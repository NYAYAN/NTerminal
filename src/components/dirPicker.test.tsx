// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLanguage } from "../lib/i18n";
import { api } from "../lib/ipc";
import { useStore } from "../store/useStore";
import { DirPicker } from "./DirPicker";

/**
 * Dizin seçici — yol rozetine tıklayınca açılan liste.
 *
 * ## Satırlar GEZİNİYOR, kapatmıyor
 *
 * BİLDİRİLEN İSTEK: "üst klasör dediğimde kapanmamalı", ardından "klasör
 * seçtikçe de kapanmasın, boşluğa tıklayınca kapanıyor zaten."
 *
 * Önceki hâlinde her satır aynı işi yapıyordu: `cd` gönder, kapat. Oysa dizin
 * gezinmek adım adım bir iş — iki basamak yukarı çıkıp komşu dalın içine inmek
 * "rozete tıkla → satır → rozete tıkla → satır" diye tekrarlanıyordu.
 *
 * `cd` yine gönderiliyor (çalışma dizini kabuğun süreç durumu; rozet, istem ve
 * dosya sütunu ondan besleniyor), yalnızca pencere açık kalıyor. Kapatma
 * yalnızca kullanıcının kendi kararıyla: boşluğa tıklamak ya da Escape.
 */

const CWD = "/home/ali/projeler/nterminal";
const UST = "/home/ali/projeler";

const listDirs = vi.fn(async (path: string) => {
  if (path === CWD) return ["src", "docs"];
  if (path === UST) return ["nterminal", "baska-proje"];
  return [];
});

const insertCommand = vi.fn();
const onClose = vi.fn<() => void>();
/** Depo eylemleri testler arasında geri yükleniyor. */
const gercekInsert = useStore.getState().insertCommand;

/** Listedeki satır etiketleri, ekrandaki sırasıyla. */
function satirlar(container: HTMLElement): string[] {
  return [...container.querySelectorAll(".pop-row")].map((el) => el.textContent?.trim() ?? "");
}

function satir(container: HTMLElement, label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll<HTMLButtonElement>(".pop-row")].find((el) =>
    (el.textContent ?? "").includes(label),
  );
  expect(found, `"${label}" satırı yok — ekranda: ${satirlar(container).join(" | ")}`).toBeTruthy();
  return found!;
}

/** Seçiciyi açıp ilk listenin gelmesini bekler. */
async function ac() {
  const utils = render(<DirPicker cwd={useStore.getState().ui.dirPicker!} onClose={onClose} />);
  await waitFor(() => expect(satirlar(utils.container).length).toBeGreaterThan(0));
  return utils;
}

beforeEach(() => {
  setLanguage("tr");
  listDirs.mockClear();
  insertCommand.mockClear();
  onClose.mockClear();
  vi.spyOn(api, "listDirs").mockImplementation(listDirs);
  const state = useStore.getState();
  useStore.setState({
    insertCommand,
    ui: { ...state.ui, dirPicker: CWD },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  const state = useStore.getState();
  useStore.setState({ insertCommand: gercekInsert, ui: { ...state.ui, dirPicker: null } });
});

describe("dizin seçici", () => {
  it("üst klasör: cd gidiyor ama pencere KAPANMIYOR", async () => {
    const { container } = await ac();

    await act(async () => {
      fireEvent.click(satir(container, "Üst klasör"));
    });

    expect(insertCommand).toHaveBeenCalledWith(`cd "${UST}"`, true);
    expect(onClose, "üst klasör pencereyi kapatmamalı").not.toHaveBeenCalled();
    expect(useStore.getState().ui.dirPicker, "seçici üst dizine taşınmalı").toBe(UST);
  });

  it("üst klasörden sonra liste YENİ dizinin içeriği", async () => {
    // Eski adlar ekranda kalsaydı satırların yolu `joinDir(YENİ cwd, ESKİ ad)`
    // olurdu: tıklanan satır var olmayan bir dizine `cd` etmeye çalışırdı.
    const { container, rerender } = await ac();

    await act(async () => {
      fireEvent.click(satir(container, "Üst klasör"));
    });
    // Gerçekte propu `App` veriyor; testte depodaki yeni değeri elle geçiyoruz.
    rerender(<DirPicker cwd={useStore.getState().ui.dirPicker!} onClose={onClose} />);
    await waitFor(() => expect(satirlar(container)).toContain("baska-proje"));

    expect(satirlar(container), "eski dizinin adları duruyor").not.toContain("docs");
    expect(listDirs).toHaveBeenCalledWith(UST);
  });

  it("klasöre inmek de kapatmıyor", async () => {
    const { container, rerender } = await ac();

    await act(async () => {
      fireEvent.click(satir(container, "src"));
    });

    expect(insertCommand).toHaveBeenCalledWith(`cd "${CWD}/src"`, true);
    expect(onClose, "klasör seçimi pencereyi kapatmamalı").not.toHaveBeenCalled();
    expect(useStore.getState().ui.dirPicker).toBe(`${CWD}/src`);

    // Ve gezinme sürüyor: yeni dizin okunuyor.
    rerender(<DirPicker cwd={useStore.getState().ui.dirPicker!} onClose={onClose} />);
    await waitFor(() => expect(listDirs).toHaveBeenCalledWith(`${CWD}/src`));
  });

  it("klasöre inince arama kutusu boşalıyor", async () => {
    /*
     * Sorgu bir ÖNCEKİ listeye aitti. Taşınsaydı yeni dizin eski metinle
     * süzülürdü — çoğu zaman boş bir liste, üstelik sorgu doluyken üst dizin
     * satırı da çizilmiyor: geri dönüş yolu olmayan bir pencere.
     */
    const { container, rerender } = await ac();
    const kutu = container.querySelector<HTMLInputElement>(".pop-search")!;

    await act(async () => {
      fireEvent.change(kutu, { target: { value: "src" } });
    });
    expect(satirlar(container), "süzme çalışmıyor").toEqual(["src"]);

    await act(async () => {
      fireEvent.click(satir(container, "src"));
    });
    rerender(<DirPicker cwd={useStore.getState().ui.dirPicker!} onClose={onClose} />);

    expect(container.querySelector<HTMLInputElement>(".pop-search")!.value).toBe("");
  });

  it("Enter da aynı ayrımı yapıyor", async () => {
    // Üst klasör listenin BAŞINDA ve açılışta seçili satır o; Enter fare
    // yolundan farklı davranmamalı.
    const { container } = await ac();
    const panel = container.querySelector(".pop-panel")!;

    await act(async () => {
      fireEvent.keyDown(panel, { key: "Enter" });
    });

    expect(insertCommand).toHaveBeenCalledWith(`cd "${UST}"`, true);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Escape kapatıyor", async () => {
    // Üst klasör kapatmayı bıraktığına göre çıkış yolunun sağlam olması şart.
    const { container } = await ac();
    const panel = container.querySelector(".pop-panel")!;

    await act(async () => {
      fireEvent.keyDown(panel, { key: "Escape" });
    });

    expect(onClose).toHaveBeenCalled();
  });
});
