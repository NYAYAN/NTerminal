// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLanguage } from "../lib/i18n";
import { setPlatform } from "../lib/platform";
import { sessions, useStore } from "../store/useStore";
import { TerminalBlocks } from "./TerminalBlocks";

/**
 * "Önceki oturum burada bitti" ayıracı.
 *
 * BİLDİRİLEN HATA: satır yazıldığı andaki genişliğe donuyordu — sağdaki
 * çekmece açılıp terminal daralınca taşıp alt satıra sarkıyor, pencere
 * genişleyince de eski dar genişliğinde kalıp ortalanmış değil SOLA YAPIŞIK
 * görünüyordu.
 *
 * Sebep yapısaldı: terminale metin olarak yazılan bir satır artık sabit bir
 * metin, yeniden ölçülendirmede kendini ortalayamaz. Çözüm onu DOM'da çizmek;
 * ortalama işini düzen yapıyor ve her genişlikte kendiliğinden doğru oluyor.
 *
 * Buradaki testler o çizimin YERİNİ ve GÖRÜNÜRLÜK koşullarını bağlıyor —
 * genişlik hesabı artık kodda değil CSS'te olduğu için ölçülecek şey bu.
 */

const CELL = 17;

/** Katmanın oturumdan çağırdığı yüzey; gerçek oturum jsdom'da kurulamıyor. */
function sahteOturum(dividerLine: number | null, viewportTop = 0) {
  return {
    setBlockListener: vi.fn(),
    snapshotBlocks: () => [],
    hasBlockHeaders: () => false,
    blockHasContent: () => true,
    restoreDividerLine: () => dividerLine,
    blockGeometry: () => ({
      top: 0,
      left: 0,
      width: 800,
      cellHeight: CELL,
      viewportTop,
      rows: 24,
    }),
  } as never;
}

function seed(commandBlocks: boolean) {
  const state = useStore.getState();
  useStore.setState({
    settings: {
      ...state.settings,
      behavior: { ...state.settings.behavior, commandBlocks },
    },
  });
}

beforeEach(() => {
  setLanguage("tr");
  setPlatform("windows");
});

afterEach(() => {
  cleanup();
  sessions.clear();
});

describe("geri yükleme ayıracı", () => {
  it("işaretli satırın üstüne çiziliyor", () => {
    seed(true);
    // Görünümün üstü 100. satır, ayıraç 105. satırda → ekranda beşinci satır.
    sessions.set("t1", sahteOturum(105, 100));
    const { container } = render(<TerminalBlocks tabId="t1" />);

    const el = container.querySelector<HTMLElement>(".restore-divider");
    expect(el, "ayıraç çizilmedi").not.toBe(null);
    expect(el!.style.top).toBe(`${5 * CELL}px`);
    expect(el!.textContent).toContain("Önceki oturum burada bitti");
  });

  it("komut blokları KAPALIYKEN de çiziliyor", () => {
    // Ayıraç bir blok değil ve kapatılabilir bir özellik de değil. Katmanın
    // geometrisi bu yüzden ayardan bağımsız okunuyor.
    seed(false);
    sessions.set("t1", sahteOturum(3, 0));
    const { container } = render(<TerminalBlocks tabId="t1" />);
    expect(container.querySelector(".restore-divider")).not.toBe(null);
  });

  it("görünümün dışında kalınca çizilmiyor", () => {
    // Yukarı kaydırıldığında işaretçi ekranın dışına çıkıyor; katman
    // kırpmıyor, hiç çizmiyor.
    seed(true);
    sessions.set("t1", sahteOturum(5, 100));
    const { container } = render(<TerminalBlocks tabId="t1" />);
    expect(container.querySelector(".restore-divider")).toBe(null);
  });

  it("son satırın altına taşmıyor", () => {
    // 24 satırlık görünümde 24. satır zaten dışarısı.
    seed(true);
    sessions.set("t1", sahteOturum(24, 0));
    const { container } = render(<TerminalBlocks tabId="t1" />);
    expect(container.querySelector(".restore-divider")).toBe(null);
  });

  it("geri yükleme yoksa ayıraç yok", () => {
    // Yeni açılan sekmede işaretçi hiç kurulmuyor; `clear` sonrası da xterm
    // işaretçiyi düşürüyor ve satır `null` oluyor.
    seed(true);
    sessions.set("t1", sahteOturum(null));
    const { container } = render(<TerminalBlocks tabId="t1" />);
    expect(container.querySelector(".restore-divider")).toBe(null);
  });

  it("çizgiler metinden değil düzenden geliyor", () => {
    // Genişlik hesabı koda geri dönerse aynı hata da geri döner: metnin
    // içinde çizgi karakteri OLMAMALI.
    seed(true);
    sessions.set("t1", sahteOturum(2, 0));
    const { container } = render(<TerminalBlocks tabId="t1" />);
    const el = container.querySelector(".restore-divider")!;
    expect(el.textContent, "çizgi metne geri gömülmüş").not.toContain("─");
  });
});
