// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * "Tekrarları gizle" süzgeci kalıcı olmalı.
 *
 * ÖLÇÜLEN BELİRTİ: kutucuk işaretleniyor, panel kapanıp açılınca yeniden boş
 * geliyordu. Değer hiçbir yere kaydedilmiyor, panel her açılışta ayarın
 * değeriyle sıfırdan doğuyordu.
 *
 * Bir süzgecin kullanıcının kurduğu gibi kalması gerekiyor; her seferinde
 * yeniden kurmak zorunda kalmak onu kullanılmaz yapıyor.
 */

const saveSettings = vi.fn(async () => {});

vi.mock("../lib/ipc", () => ({
  api: new Proxy(
    {
      historyQuery: async () => ({ entries: [], total: 0, grandTotal: 0 }),
      favoritesList: async () => [],
      saveSettings: (...a: unknown[]) => saveSettings(...(a as [])),
    } as Record<string, unknown>,
    { get: (target, prop) => target[prop as string] ?? (async () => undefined) },
  ),
  onPtyData: async () => () => {},
  onPtyExit: async () => () => {},
}));

const { useStore } = await import("../store/useStore");
const { HistoryPanel } = await import("./HistoryPanel");
const { setLanguage } = await import("../lib/i18n");

const box = (c: HTMLElement) =>
  c.querySelector<HTMLInputElement>(".panel-filters input[type=checkbox]") ??
  c.querySelector<HTMLInputElement>("input[type=checkbox]");

beforeEach(() => {
  setLanguage("tr");
  saveSettings.mockClear();
  // Testler ayarı DEĞİŞTİRİYOR ve depo testler arasında paylaşılıyor;
  // sıfırlamazsak ikinci test üçüncüsünün başlangıcını bozuyor.
  const state = useStore.getState();
  useStore.setState({
    settings: { ...state.settings, behavior: { ...state.settings.behavior, historyDedupe: true } },
  });
});

afterEach(cleanup);

describe("geçmişte tekrarları gizle", () => {
  it("varsayılan olarak işaretli geliyor", () => {
    // Günde yirmi kez `npm test` çalıştıran biri için panelin tamamı aynı
    // satırın tekrarı oluyor ve arama işe yaramıyor.
    expect(useStore.getState().settings.behavior.historyDedupe).toBe(true);
    const { container } = render(<HistoryPanel />);
    expect(box(container)!.checked).toBe(true);
  });

  it("kutucuk ayara yazılıyor", async () => {
    const { container } = render(<HistoryPanel />);
    fireEvent.click(box(container)!);
    await waitFor(() =>
      expect(useStore.getState().settings.behavior.historyDedupe).toBe(false),
    );
    // Diske de gitmeli; yalnızca bellekte kalsa uygulama kapanınca kaybolur.
    await waitFor(() => expect(saveSettings).toHaveBeenCalled());
  });

  it("panel yeniden açıldığında ayarı izliyor", async () => {
    // Asıl şikâyet buydu: işaretleyip kapatınca geri eski hâline dönüyordu.
    const { container, unmount } = render(<HistoryPanel />);
    fireEvent.click(box(container)!);
    // Kayıt eşzamansız; okumadan önce oturması gerekiyor.
    await waitFor(() =>
      expect(useStore.getState().settings.behavior.historyDedupe).toBe(false),
    );
    unmount();

    const yeniden = render(<HistoryPanel />);
    expect(box(yeniden.container)!.checked).toBe(false);
  });
});
