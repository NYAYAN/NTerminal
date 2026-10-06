import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  LIMITS,
  clampInt,
  clampTo,
  sanitizeSettings,
  terminalFontSize,
  terminalSettings,
} from "./settingsLimits";
import type { Settings } from "../types";

/**
 * Ayar sınırları.
 *
 * ÖLÇÜLEN HATALAR, hepsi aynı sınıftan — sınır yalnızca denetimin okundaydı,
 * değerin kendisinde değil:
 *
 *  - "Kaydırma tamponu" kutusu boşaltılınca ayar 0 oldu ve 0 diske yazıldı.
 *  - Yazı boyutu kaydırıcısı 28'de, ⌘= 32'de duruyordu; 30 px'te kaydırıcı
 *    "28" gösterip etiket "30" yazıyordu.
 *  - Harf aralığı 0,5 adımlıydı ama xterm tam piksele yuvarlıyor: yarım
 *    adımların yarısı hiçbir şey değiştirmiyordu.
 */

function settings(patch: Partial<Settings["appearance"]> = {}, behavior = {}): Settings {
  return {
    version: 2,
    appearance: {
      fontFamily: "Menlo, monospace",
      fontSize: 14,
      fontZoom: 0,
      lineHeight: 1.5,
      letterSpacing: 0,
      uiFontFamily: "",
      uiFontSize: 14,
      theme: "nterminal-dark",
      cursorStyle: "bar",
      cursorBlink: true,
      scrollback: 10_000,
      sidebarWidth: 240,
      panelWidth: 390,
      filesWidth: 320,
      highlightLinks: true,
      viewMode: "tabs",
      showShellBadge: false,
      sidebarCollapsed: false,
      collapsedFavoriteFolders: [],
      ...patch,
    },
    behavior: {
      restoreSession: true,
      restoreScrollback: true,
      scrollbackSaveLines: 2000,
      confirmCloseTab: "always",
      copyOnSelect: true,
      rightClickAction: "menu",
      ctrlCCopiesSelection: true,
      inheritCwd: true,
      historyLimit: 50_000,
      historyDedupe: true,
      showOnlyFavoriteGroups: false,
      appSuggestions: true,
      shellPrediction: "inline",
      promptAtBottom: true,
      appInput: true,
      commandBlocks: true,
      blockHeaders: true,
      macOptionIsMeta: false,
      closeAction: "background",
      checkUpdates: true,
      ...behavior,
    },
    profiles: [],
    defaultProfileId: "",
    keybindings: {},
    language: "tr",
  };
}

describe("sınıra çekme", () => {
  it("aralığın dışını uca çekiyor", () => {
    expect(clampTo(0, LIMITS.scrollback)).toBe(500);
    expect(clampTo(9_999_999, LIMITS.scrollback)).toBe(200_000);
    expect(clampTo(0.8, LIMITS.lineHeight)).toBe(1);
  });

  it("sayı olmayanı varsayılana çeviriyor, uca DEĞİL", () => {
    // Bozuk bir değer için 8 px'lik yazı ya da 500 satırlık tampon yanlış
    // bir "onarım" olurdu; model.rs varsayılanı doğru olan.
    expect(clampTo(Number.NaN, LIMITS.fontSize)).toBe(14);
    expect(clampTo("12" as unknown, LIMITS.fontSize)).toBe(14);
    expect(clampTo(undefined, LIMITS.historyLimit)).toBe(50_000);
  });

  it("tam sayılı ayarlar yuvarlanıyor", () => {
    expect(clampInt(0.5, LIMITS.letterSpacing)).toBe(1);
    expect(clampInt(14.4, LIMITS.fontSize)).toBe(14);
  });
});

describe("ayarları temizleme", () => {
  it("geçerli ayarlar için AYNI nesneyi döndürüyor", () => {
    // Depo ve "geri al" düğmesi başvuruyla karşılaştırıyor; gereksiz bir kopya
    // her ayarı "değişmiş" gösterirdi.
    const s = settings();
    expect(sanitizeSettings(s)).toBe(s);
  });

  it("ölçülen hatalı değerleri düzeltiyor", () => {
    const fixed = sanitizeSettings(
      settings({ scrollback: 0, lineHeight: 0.5, letterSpacing: 0.5, fontSize: 40 }, {
        historyLimit: 1,
      }),
    );
    expect(fixed.appearance.scrollback).toBe(500);
    // xterm 1'in altındaki satır yüksekliğinde HATA fırlatıyor.
    expect(fixed.appearance.lineHeight).toBe(1);
    expect(fixed.appearance.letterSpacing).toBe(1);
    expect(fixed.appearance.fontSize).toBe(32);
    expect(fixed.behavior.historyLimit).toBe(100);
  });

  it("eski sürümden gelen eksik yakınlaştırmayı 0'a tamamlıyor", () => {
    const s = settings();
    const eski = { ...s, appearance: { ...s.appearance, fontZoom: undefined } } as unknown as Settings;
    expect(sanitizeSettings(eski).appearance.fontZoom).toBe(0);
  });

  it("bilinmeyen imleç biçimi çizgiye dönüyor", () => {
    const s = settings({ cursorStyle: "kutu" as never });
    expect(sanitizeSettings(s).appearance.cursorStyle).toBe("bar");
  });

  it("yakınlaştırma etkin boyutu sınırın dışına taşıyamıyor", () => {
    // 30 px'lik ayarda +5 yazıyı 35'e çıkarırdı.
    expect(sanitizeSettings(settings({ fontSize: 30, fontZoom: 5 })).appearance.fontZoom).toBe(2);
    expect(sanitizeSettings(settings({ fontSize: 9, fontZoom: -5 })).appearance.fontZoom).toBe(-1);
  });
});

describe("terminalin gerçek yazı boyutu", () => {
  it("ayardaki boyut + yakınlaştırma", () => {
    expect(terminalFontSize({ fontSize: 10, fontZoom: 3 })).toBe(13);
    expect(terminalFontSize({ fontSize: 10, fontZoom: 0 })).toBe(10);
  });

  it("terminallere giden ayar yakınlaştırılmış boyutu taşıyor", () => {
    const s = settings({ fontSize: 10, fontZoom: 2 });
    const forTerminals = terminalSettings(s);
    expect(forTerminals.appearance.fontSize).toBe(12);
    // Fark ikinci kez eklenmesin.
    expect(forTerminals.appearance.fontZoom).toBe(0);
    // Ayarın kendisi değişmiyor.
    expect(s.appearance.fontSize).toBe(10);
  });

  it("yakınlaştırma yoksa aynı nesne", () => {
    // `TerminalSession.applySettings` değişeni karşılaştırıyor; her seferinde
    // yeni bir nesne vermek gereksiz değil ama yanıltıcı olurdu.
    const s = settings();
    expect(terminalSettings(s)).toBe(s);
  });
});

/**
 * İki dil, tek sınır.
 *
 * Sınırlar iki yerde: burada (arayüz denetimleri, kısayollar, depo kapısı) ve
 * Rust'ta (`model.rs` → `limits`; yükleme, kaydetme, içe aktarma). Ayrışırlarsa
 * arayüzün kabul ettiği bir değeri Rust bir sonraki açılışta sessizce
 * değiştirir — ya da tersi.
 */
describe("Rust sınırlarıyla aynı", () => {
  const rust = readFileSync(join(process.cwd(), "src-tauri/src/model.rs"), "utf8");
  const block = rust.slice(rust.indexOf("pub mod limits"));

  const pairs: [keyof typeof LIMITS, string][] = [
    ["fontSize", "FONT_SIZE"],
    ["lineHeight", "LINE_HEIGHT"],
    ["letterSpacing", "LETTER_SPACING"],
    ["uiFontSize", "UI_FONT_SIZE"],
    ["scrollback", "SCROLLBACK"],
    ["scrollbackSaveLines", "SCROLLBACK_SAVE_LINES"],
    ["historyLimit", "HISTORY_LIMIT"],
  ];

  for (const [ts, rs] of pairs) {
    it(`${ts} = ${rs}`, () => {
      const m = new RegExp(`const ${rs}: \\([^)]*\\) = \\(([-\\d._]+), ([-\\d._]+)\\)`).exec(block);
      expect(m, `${rs} model.rs'te okunamadı`).toBeTruthy();
      const num = (s: string) => Number(s.replace(/_/g, ""));
      expect([num(m![1]), num(m![2])]).toEqual([LIMITS[ts].min, LIMITS[ts].max]);
    });
  }
});
