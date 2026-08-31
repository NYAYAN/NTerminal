// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLanguage } from "../lib/i18n";
import { sessions, useStore } from "../store/useStore";
import type { Group, TabState } from "../types";
import { CommandInput } from "./CommandInput";

/**
 * Uygulamanın kendi komut satırı.
 *
 * En riskli parça bu: bütün tuş vuruşları buradan geçiyor. Bir hata "yazamıyorum"
 * ya da daha kötüsü "vim'de kilitlendim" demek. Bu yüzden testler iki şeyi
 * bağlıyor — kutunun NE ZAMAN açıldığı ve tuşların NEREYE gittiği.
 *
 * Kip kararının kendisi `lib/inputMode.test.ts` içinde; burada o kararın
 * arayüze doğru yansıdığı test ediliyor.
 */

const TAB = "t1";

function tab(id: string): TabState {
  return {
    id,
    title: id,
    customTitle: id,
    profileId: "p1",
    cwd: null,
    createdAt: 0,
    lastActiveAt: 0,
    hasScrollback: false,
    lastCommand: null,
    locked: false,
  };
}

function group(tabs: TabState[]): Group {
  return {
    id: "g1",
    name: "g1",
    color: null,
    icon: null,
    collapsed: false,
    favorite: false,
    defaultProfileId: null,
    defaultCwd: null,
    env: {},
    activeTabId: tabs[0]?.id ?? null,
    tabs,
  };
}

const sendKeys = vi.fn();
const focus = vi.fn();
const setAppInput = vi.fn();
/** Seçim varken Ctrl+C kopyalamalı; kararı oturum veriyor. */
const wantsCtrlCCopy = vi.fn(() => false);
/** Blok başlığı varken kutu kendi dizin rozetini çizmiyor. */
const hasBlockHeaders = vi.fn(() => false);

/** Kabuğun bildirdiği sinyaller; varsayılan "istemde bekliyor". */
function seed(signals: Partial<{ atPrompt: boolean; altScreen: boolean; integration: boolean }> = {}) {
  const state = useStore.getState();
  useStore.setState({
    groups: [group([tab(TAB)])],
    activeGroupId: "g1",
    ready: true,
    inputSignals: {
      [TAB]: { atPrompt: true, altScreen: false, integration: true, ...signals },
    },
    settings: {
      ...state.settings,
      behavior: { ...state.settings.behavior, appInput: true },
    },
    ui: { ...state.ui, suggest: null },
  });
}

const field = (c: HTMLElement) => c.querySelector<HTMLTextAreaElement>(".command-input-field");

beforeEach(() => {
  setLanguage("tr");
  sendKeys.mockClear();
  focus.mockClear();
  setAppInput.mockClear();
  wantsCtrlCCopy.mockReturnValue(false);
  hasBlockHeaders.mockReturnValue(false);
  sessions.set(TAB, {
    sendKeys,
    focus,
    setAppInput,
    wantsCtrlCCopy,
    hasBlockHeaders,
  } as never);
  seed();
});

afterEach(() => {
  cleanup();
  sessions.delete(TAB);
  useStore.setState({ groups: [], activeGroupId: null, inputSignals: {}, appInputSink: null });
});

describe("komut satırı kutusu", () => {
  it("kabuk istemde beklerken açılıyor", () => {
    const { container } = render(<CommandInput />);
    expect(field(container)).not.toBe(null);
  });

  it("komut çalışırken kapalı", () => {
    // Çalışan komut tuşları o an isteyebilir (parola, y/n). Kutu burada
    // açık kalsaydı kullanıcı ona cevap veremezdi.
    seed({ atPrompt: false });
    const { container } = render(<CommandInput />);
    expect(container.innerHTML).toBe("");
  });

  it("tam ekran programda kapalı", () => {
    seed({ altScreen: true });
    const { container } = render(<CommandInput />);
    expect(container.innerHTML).toBe("");
  });

  it("kabuk entegrasyonu yoksa kapalı", () => {
    seed({ integration: false });
    const { container } = render(<CommandInput />);
    expect(container.innerHTML).toBe("");
  });

  it("ayar kapalıyken kapalı", () => {
    const state = useStore.getState();
    useStore.setState({
      settings: { ...state.settings, behavior: { ...state.settings.behavior, appInput: false } },
    });
    const { container } = render(<CommandInput />);
    expect(container.innerHTML).toBe("");
  });

  it("kip açıkken terminalin stdin'i kapanıyor", () => {
    // Odağın kutuda olduğunu varsaymak yetmiyor: kullanıcı seçim için
    // terminale tıklarsa yazdığı her şey İKİ yoldan birden kabuğa giderdi.
    render(<CommandInput />);
    expect(setAppInput).toHaveBeenCalledWith(true);
  });

  it("terminale tıklamak odağı kutudan almıyor", () => {
    // ÖLÇÜLEN BELİRTİ: çıktının içine tıklayınca odak xterm'e geçiyor ve o
    // andan sonra yazılan hiçbir şey hiçbir yere gitmiyordu — kutu odağı
    // kaybetmiş, terminalin stdin'i zaten kapalı.
    const host = document.createElement("div");
    host.className = "term-wrap";
    document.body.appendChild(host);

    const { container } = render(<CommandInput />);
    const el = field(container)!;
    el.blur();
    expect(document.activeElement).not.toBe(el);

    fireEvent.mouseUp(host);
    expect(document.activeElement, "odak kutuya dönmeli").toBe(el);

    host.remove();
  });

  it("kutu kapanınca terminalin stdin'i geri açılıyor", () => {
    // Bölme kipinde görünür bir kilitlenmeydi: yan bölmeye tıklıyorsunuz,
    // kutu ona ait değil, yazdığınız da hiçbir yere gitmiyor.
    const { unmount } = render(<CommandInput />);
    setAppInput.mockClear();
    unmount();
    expect(setAppInput).toHaveBeenCalledWith(false);
  });

  it("blok başlığı varken kutu dizin rozetini tekrarlamıyor", () => {
    // Başlık açıkken kabuğun bekleyen istem satırı kutunun HEMEN üstünde ve
    // orada aynı rozet duruyor; ikisini birden çizmek aynı bilgiyi iki satır
    // üst üste tekrarlamak olurdu.
    const state = useStore.getState();
    useStore.setState({
      groups: [{ ...state.groups[0], tabs: [{ ...state.groups[0].tabs[0], cwd: "/repo" }] }],
    });

    hasBlockHeaders.mockReturnValue(false);
    const { container, unmount } = render(<CommandInput />);
    expect(container.querySelector(".ci-chip"), "başlık yokken rozet olmalı").not.toBe(null);
    unmount();

    hasBlockHeaders.mockReturnValue(true);
    const ikinci = render(<CommandInput />);
    expect(ikinci.container.querySelector(".ci-chip"), "başlık varken rozet olmamalı").toBe(null);
  });

  it("Enter komutu kabuğa gönderiyor ve kutuyu boşaltıyor", () => {
    const { container } = render(<CommandInput />);
    const el = field(container)!;
    fireEvent.change(el, { target: { value: "npm test" } });
    fireEvent.keyDown(el, { key: "Enter" });
    expect(sendKeys).toHaveBeenCalledWith("npm test\r");
    expect(el.value).toBe("");
  });

  it("Shift+Enter göndermiyor: çok satırlı komut yazılabilmeli", () => {
    const { container } = render(<CommandInput />);
    const el = field(container)!;
    fireEvent.change(el, { target: { value: "for x in 1 2 3" } });
    fireEvent.keyDown(el, { key: "Enter", shiftKey: true });
    expect(sendKeys).not.toHaveBeenCalled();
  });

  it("Ctrl+C kutu boşken bile kabuğa gidiyor", () => {
    // Yoksa çalışan bir şeyi durdurmanın yolu kalmıyor.
    const { container } = render(<CommandInput />);
    fireEvent.keyDown(field(container)!, { key: "c", ctrlKey: true });
    expect(sendKeys).toHaveBeenCalledWith("\x03");
  });

  it("seçim varken Ctrl+C kabuğu durdurmuyor", () => {
    // Yukarıdan metin seçip Ctrl+C'ye basan biri kopyalamak istiyor. Kararı
    // oturum veriyor; kutu onu bozmamalı.
    wantsCtrlCCopy.mockReturnValue(true);
    const { container } = render(<CommandInput />);
    fireEvent.keyDown(field(container)!, { key: "c", ctrlKey: true });
    expect(sendKeys, "seçim varken SIGINT gitmemeli").not.toHaveBeenCalled();
  });

  it("Tab satırı kabuğa devredip kutuyu kapatıyor", () => {
    // Sekme tamamlaması kabuğun işi ve kutudaki metni göremiyor. Devir
    // olmadan Tab hiçbir şey yapmazdı.
    const { container } = render(<CommandInput />);
    const el = field(container)!;
    fireEvent.change(el, { target: { value: "cd src" } });
    fireEvent.keyDown(el, { key: "Tab" });
    expect(sendKeys).toHaveBeenCalledWith("cd src\t");
    expect(field(container), "devirden sonra kutu kapanmalı").toBe(null);
  });

  it("kabul edilen öneri kutuya yazılıyor, kabuğa değil", () => {
    // Ham kipte öneri kabuğa DEL tuşlarıyla yazılıyor; burada kabuğun satırı
    // zaten boş, o yol satırı bozardı.
    const { container } = render(<CommandInput />);
    act(() => {
      const ui = useStore.getState().ui;
      useStore.setState({
        ui: { ...ui, suggest: { items: ["npm run build"], index: 0, input: "npm" } },
      });
    });
    act(() => useStore.getState().acceptSuggestion());
    expect(field(container)!.value).toBe("npm run build");
    expect(sendKeys, "öneri kabuğa gitmemeli").not.toHaveBeenCalled();
  });
});
