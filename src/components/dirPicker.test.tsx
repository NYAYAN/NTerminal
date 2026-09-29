// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLanguage } from "../lib/i18n";
import { api } from "../lib/ipc";
import { sessions, useStore } from "../store/useStore";
import { CommandInput } from "./CommandInput";
import { DirPicker } from "./DirPicker";
import type { Group, TabState } from "../types";

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

/*
 * `cd` OTURUMDAN gidiyor, depo eyleminden değil.
 *
 * Seçici komutu artık kendisi kurmuyor: yol `changeDir` üzerinden geçiyor —
 * klasör değiştirmenin tek yolu orası ve kilitli sekmede reddeden de o. O da
 * tırnaklamayı `quoteForShell` ile yapıp etkin OTURUMUN `insertCommand`ına
 * yazıyor, dolayısıyla casus orada duruyor.
 *
 * Beklenen komut bu yüzden TIRNAKSIZ: boşluksuz bir yolu tırnaklamak
 * gereksiz, gerekçesi `store/lockedCwd.test.ts` içinde.
 */
const insertCommand = vi.fn();
const onClose = vi.fn<() => void>();

/** `changeDir` etkin sekmeyi VE oturumu arıyor; ikisi de kurulmalı. */
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
    name: "g1",
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
  sessions.clear();
  // `focus`: seçici kapanırken odak komut satırına (kutu yoksa terminale) dönüyor.
  sessions.set("t1", { insertCommand, cwd: CWD, focus: () => {} } as never);
  const state = useStore.getState();
  useStore.setState({
    groups: [group()],
    activeGroupId: "g1",
    ui: { ...state.ui, dirPicker: CWD },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  sessions.clear();
  const state = useStore.getState();
  useStore.setState({ groups: [], activeGroupId: null, ui: { ...state.ui, dirPicker: null } });
});

describe("dizin seçici", () => {
  it("üst klasör: cd gidiyor ama pencere KAPANMIYOR", async () => {
    const { container } = await ac();

    await act(async () => {
      fireEvent.click(satir(container, "Üst klasör"));
    });

    expect(insertCommand).toHaveBeenCalledWith(`cd ${UST}`, true);
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

    expect(insertCommand).toHaveBeenCalledWith(`cd ${CWD}/src`, true);
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

    expect(insertCommand).toHaveBeenCalledWith(`cd ${UST}`, true);
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

/*
 * Klavyeyle gezinme SÜRÜYOR.
 *
 * BİLDİRİLEN HATA: "Komut yazın üstündeki klasör dizini alanına tıklayıp
 * klavyeden yön tuşları ile klasör seçip enter basınca o klasör dizinine
 * gidiyor, sonrasında yön tuşları ile seçim yapmaya devam edemiyorum. Mouse
 * ile tıklamak gerekiyor."
 *
 * Seçici açık kalıyor ama `cd` gerçek bir komut: kabuk istemden çıkıyor, komut
 * kutusu kapanıyor, istem dönünce yeniden açılıyor. Kutunun odak etkisi bu iki
 * geçişte odağı koşulsuz taşıyordu — önce terminale, sonra kutuya; arama kutusu
 * odağı kaybediyor, ok tuşları komut kutusuna gidiyordu. Testler bu yüzden İKİ
 * bileşeni birlikte çiziyor: hata ikisinin arasında.
 */
describe("dizin seçici ve komut kutusu", () => {
  const focus = vi.fn();
  let signals = { atPrompt: true, altScreen: false, integration: true };

  /** Kabuğun durumu: istemde mi, komut çalışıyor mu. */
  function shell(atPrompt: boolean, running: boolean) {
    signals = { atPrompt, altScreen: false, integration: true };
    useStore.setState({ inputSignals: { t1: signals }, running: { t1: running } });
  }

  function birlikte() {
    return (
      <>
        <CommandInput />
        <DirPicker cwd={CWD} onClose={onClose} />
      </>
    );
  }

  beforeEach(() => {
    focus.mockClear();
    sessions.set("t1", {
      insertCommand,
      cwd: CWD,
      focus,
      setAppInput: () => {},
      inputSignals: () => signals,
    } as never);
    const state = useStore.getState();
    useStore.setState({
      settings: { ...state.settings, behavior: { ...state.settings.behavior, appInput: true } },
    });
    shell(true, false);
  });

  afterEach(() => {
    useStore.setState({ inputSignals: {}, running: {} });
  });

  it("Enter'dan sonra cd başlayıp bitse de odak arama kutusunda kalıyor", async () => {
    const { container } = render(birlikte());
    await waitFor(() => expect(satirlar(container)).toContain("src"));
    const kutu = container.querySelector<HTMLInputElement>(".pop-search")!;
    expect(document.activeElement, "açılışta odak aramada değil").toBe(kutu);

    await act(async () => {
      fireEvent.keyDown(kutu, { key: "ArrowDown" });
    });
    await act(async () => {
      fireEvent.keyDown(kutu, { key: "Enter" });
    });
    expect(insertCommand).toHaveBeenCalledWith(`cd ${CWD}/src`, true);

    // Kabuk `cd`yi çalıştırıyor, sonra istem dönüyor.
    act(() => shell(false, true));
    act(() => shell(true, false));

    expect(focus, "odak terminale alındı").not.toHaveBeenCalled();
    expect(document.activeElement, "odak arama kutusundan alındı").toBe(kutu);
    expect(container.querySelector(".command-input-field"), "kutu geri gelmedi").not.toBe(null);
  });

  it("kapanınca odak komut kutusuna dönüyor", async () => {
    // Escape ile kapanan seçici odağı boşa düşürseydi bir sonraki komut için
    // yine fareyle kutuya tıklamak gerekirdi.
    const { container, rerender } = render(birlikte());
    await waitFor(() => expect(satirlar(container).length).toBeGreaterThan(0));

    // Gerçekte seçiciyi `App` kaldırıyor; testte ağaç seçicisiz yeniden çiziliyor.
    rerender(<CommandInput />);

    expect(document.activeElement).toBe(container.querySelector(".command-input-field"));
  });

  it("kapanırken başka bir metin kutusuna geçildiyse odağa dokunmuyor", async () => {
    const baska = document.createElement("input");
    document.body.appendChild(baska);
    const { container, rerender } = render(birlikte());
    await waitFor(() => expect(satirlar(container).length).toBeGreaterThan(0));

    baska.focus();
    rerender(<CommandInput />);

    expect(document.activeElement).toBe(baska);
    baska.remove();
  });
});
