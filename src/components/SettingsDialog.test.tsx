// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { setLanguage } from "../lib/i18n";
import { useStore } from "../store/useStore";
import { SettingsDialog } from "./SettingsDialog";

/**
 * Ayarlar penceresinin yapısı.
 *
 * Pencere bu oturumda hızla büyüdü (dil, görünüm kipi, sağ tık, kapatma onayı,
 * bağlantı rengi, komut önerisi…) ve iki somut kusur oluştu:
 *
 *  - "Terminal" başlığı İKİ ayrı bölümde geçiyordu; kullanıcı bir ayarı
 *    hangisinde arayacağını bilemiyordu.
 *  - Tek bir bölümün içeriği 776px, görünür alan 461px — her şey kaydırma
 *    içinde kalmıştı.
 *
 * Bu testler yapıyı bağlıyor: bölüm sayısı, gezinmenin çalışması ve **aynı
 * başlığın iki bölümde geçmemesi**.
 */

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
}

beforeEach(() => {
  setLanguage("tr");
  const state = useStore.getState();
  // Profiller ve Gruplar iki panelli: sag taraftaki form ancak bir kayit
  // seciliyken ciziliyor. Bos depoyla olcmek o bolumleri "bos" gosterir.
  useStore.setState({
    ui: { ...state.ui, settingsOpen: true, editingGroupId: null },
    appVersion: "0.1.0",
    settings: {
      ...state.settings,
      profiles: [
        {
          id: "p1",
          name: "PowerShell 7",
          kind: "pwsh",
          shell: "pwsh.exe",
          args: [],
          cwd: null,
          env: {},
          shellIntegration: true,
          color: "#58a6ff",
          icon: null,
          unavailable: false,
        },
      ],
      defaultProfileId: "p1",
    },
    groups: [
      {
        id: "g1",
        name: "Yayın",
        color: "#58a6ff",
        icon: null,
        collapsed: false,
        favorite: false,
        defaultProfileId: null,
        defaultCwd: null,
        env: {},
        activeTabId: null,
        tabs: [],
      },
    ],
    activeGroupId: "g1",
  });
});

afterEach(() => {
  cleanup();
  const ui = useStore.getState().ui;
  useStore.setState({ ui: { ...ui, settingsOpen: false } });
});

const navLabels = (c: HTMLElement) =>
  [...c.querySelectorAll(".settings-nav button")].map((b) => b.textContent!.trim());

const headings = (c: HTMLElement) =>
  [...c.querySelectorAll(".modal-body h3")].map((h) => h.textContent!.trim());

describe("ayarlar penceresi", () => {
  it("dikey gezinme var, yatay şerit yok", () => {
    // Dokuz bölüm yatay bir şeride sığmıyor; her yeni ayar şeridi daraltıyordu.
    const { container } = render(<SettingsDialog />);
    expect(container.querySelector(".settings-nav"), "dikey gezinme yok").not.toBe(null);
    expect(container.querySelector(".tabs-strip"), "yatay şerit kalmış").toBe(null);
  });

  it("dokuz bölüm listeleniyor", () => {
    const { container } = render(<SettingsDialog />);
    expect(navLabels(container)).toEqual([
      "Genel",
      "Görünüm",
      "Terminal",
      "Oturum",
      "Geçmiş",
      "Profiller",
      "Gruplar",
      "Kısayollar",
      "Hakkında",
    ]);
  });

  it("açılışta Genel bölümü seçili", () => {
    const { container } = render(<SettingsDialog />);
    const on = container.querySelector(".settings-nav button.on");
    expect(on!.textContent!.trim()).toBe("Genel");
    expect(on!.getAttribute("aria-current")).toBe("true");
  });

  it("bölüm değiştirmek içeriği değiştiriyor", async () => {
    const { container } = render(<SettingsDialog />);
    expect(headings(container)).toEqual(["Dil", "Görünüm biçimi"]);

    fireEvent.click([...container.querySelectorAll(".settings-nav button")][1]);
    await settle();
    expect(headings(container)).toEqual(["Tema", "Yazı tipi", "İmleç ve kaydırma"]);

    fireEvent.click([...container.querySelectorAll(".settings-nav button")][2]);
    await settle();
    expect(headings(container)).toEqual(["Kopyala ve yapıştır", "Bağlantılar", "Komut önerisi"]);
  });

  it("aynı başlık iki bölümde geçmiyor", async () => {
    // Somut kusur: "Terminal" başlığı hem Görünüm hem Davranış bölümündeydi.
    // Bir ayarı hangi bölümde arayacağınız belirsizdi.
    const { container } = render(<SettingsDialog />);
    const buttons = [...container.querySelectorAll(".settings-nav button")];
    const seen = new Map<string, string>();
    const clashes: string[] = [];

    for (const button of buttons) {
      const section = button.textContent!.trim();
      fireEvent.click(button);
      await settle();
      for (const heading of headings(container)) {
        const previous = seen.get(heading);
        if (previous && previous !== section) clashes.push(`"${heading}": ${previous} + ${section}`);
        else seen.set(heading, section);
      }
    }

    expect(clashes, `birden çok bölümde geçen başlık:\n${clashes.join("\n")}`).toEqual([]);
  });

  it("her bölümün en az bir başlığı var", async () => {
    // Boş bir bölüm gezinmede yer alıp hiçbir şey göstermemeli.
    const { container } = render(<SettingsDialog />);
    const empty: string[] = [];
    for (const button of [...container.querySelectorAll(".settings-nav button")]) {
      fireEvent.click(button);
      await settle();
      if (headings(container).length === 0) empty.push(button.textContent!.trim());
    }
    expect(empty, `başlıksız bölüm: ${empty.join(", ")}`).toEqual([]);
  });

  it("dil seçici Genel bölümünde ve iki dil sunuyor", () => {
    const { container } = render(<SettingsDialog />);
    const select = container.querySelector(".modal-body select") as HTMLSelectElement;
    const options = [...select.options].map((o) => o.value);
    expect(options).toEqual(["tr", "en"]);
    expect(select.value).toBe("tr");
  });

  it("dil değişince bölüm adları da değişiyor", async () => {
    const { container } = render(<SettingsDialog />);
    await act(async () => {
      setLanguage("en");
    });
    expect(navLabels(container).slice(0, 5)).toEqual([
      "General",
      "Appearance",
      "Terminal",
      "Session",
      "History",
    ]);
  });

  it("grup düzenlemeyle açılınca Gruplar bölümü seçili", () => {
    // Kenar çubuğundan "Grup ayarları…" bu yolla açılıyor; Genel bölümüne
    // düşmek kullanıcıyı yanlış yere bırakır.
    const ui = useStore.getState().ui;
    useStore.setState({ ui: { ...ui, editingGroupId: "g1" } });
    const { container } = render(<SettingsDialog />);
    expect(container.querySelector(".settings-nav button.on")!.textContent!.trim()).toBe("Gruplar");
  });
});
