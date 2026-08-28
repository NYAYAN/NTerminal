import { describe, expect, it } from "vitest";

import {
  MIN_FOREGROUND_CONTRAST,
  MIN_PALETTE_CONTRAST,
  contrastRatio,
  ensureContrast,
  harmonizeTheme,
  luminance,
  parseHex,
} from "./contrast";
import { THEMES, getTheme } from "./themes";
import { hasCustomTitle, shellBadge, tabLabel, tabSubtitle } from "./labels";
import type { Profile, TabState } from "../types";

describe("renk yardımcıları", () => {
  it("hex ayrıştırır", () => {
    expect(parseHex("#fdf6e3")).toEqual({ r: 253, g: 246, b: 227 });
    expect(parseHex("fff")).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseHex("bozuk")).toBe(null);
  });

  it("parlaklık uçlarını bilir", () => {
    expect(luminance("#000000")).toBeCloseTo(0, 5);
    expect(luminance("#ffffff")).toBeCloseTo(1, 5);
  });

  it("karşıtlık oranı simetrik ve doğru", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 1);
    // Aynı renk: en düşük oran.
    expect(contrastRatio("#fdf6e3", "#fdf6e3")).toBeCloseTo(1, 5);
  });
});

describe("karşıtlık düzeltmesi", () => {
  it("açık zeminde rengi koyulaştırır", () => {
    const fixed = ensureContrast("#fdf6e3", "#fdf6e3", 3.2);
    expect(contrastRatio(fixed, "#fdf6e3")).toBeGreaterThanOrEqual(3.2);
    // Koyulaşmış olmalı, açılmamış.
    expect(luminance(fixed)).toBeLessThan(luminance("#fdf6e3"));
  });

  it("koyu zeminde rengi açar", () => {
    const fixed = ensureContrast("#101418", "#0d1117", 3.2);
    expect(contrastRatio(fixed, "#0d1117")).toBeGreaterThanOrEqual(3.2);
    expect(luminance(fixed)).toBeGreaterThan(luminance("#101418"));
  });

  it("yeterli karşıtlığı olan renge dokunmaz", () => {
    const original = "#dc322f";
    expect(ensureContrast(original, "#fdf6e3", 3.2)).toBe(original);
  });

  it("geçersiz rengi olduğu gibi bırakır", () => {
    expect(ensureContrast("bozuk", "#fdf6e3", 3.2)).toBe("bozuk");
  });
});

/**
 * Asıl güvence bu: hiçbir temada arka planla karışan renk kalmamalı.
 *
 * Bu testin sebebi gerçek bir hata: resmî Solarized Light şemasında
 * `brightWhite` doğrudan arka planın aynısı (`#fdf6e3`), `white` ise bir tık
 * farkı. Kabuklar bu renkleri kullandığı için yazılan metin görünmez oluyordu.
 */
describe("tema okunabilirliği", () => {
  const PALETTE_KEYS = [
    "black",
    "red",
    "green",
    "yellow",
    "blue",
    "magenta",
    "cyan",
    "white",
    "brightBlack",
    "brightRed",
    "brightGreen",
    "brightYellow",
    "brightBlue",
    "brightMagenta",
    "brightCyan",
    "brightWhite",
  ] as const;

  for (const theme of THEMES) {
    it(`${theme.name}: tüm palet renkleri okunabilir`, () => {
      const fixed = getTheme(theme.id);
      const background = fixed.xterm.background!;

      expect(contrastRatio(fixed.xterm.foreground!, background)).toBeGreaterThanOrEqual(
        MIN_FOREGROUND_CONTRAST - 0.01,
      );

      for (const key of PALETTE_KEYS) {
        const color = fixed.xterm[key]!;
        const ratio = contrastRatio(color, background);
        expect(
          ratio,
          `${theme.name} / ${key} = ${color}, karşıtlık ${ratio.toFixed(2)}`,
        ).toBeGreaterThanOrEqual(MIN_PALETTE_CONTRAST - 0.01);
      }
    });
  }

  it("Solarized Açık'ta brightWhite artık arka planla aynı değil", () => {
    const raw = THEMES.find((t) => t.id === "solarized-light")!;
    // Ham şemada gerçekten aynı — hatanın kaynağı buydu.
    expect(raw.xterm.brightWhite).toBe(raw.xterm.background);

    const fixed = getTheme("solarized-light");
    expect(fixed.xterm.brightWhite).not.toBe(fixed.xterm.background);
    expect(contrastRatio(fixed.xterm.brightWhite!, fixed.xterm.background!)).toBeGreaterThan(3);
  });

  it("koyu temaların paleti değişmeden geçer", () => {
    // Koyu temalar bu açıdan zaten sağlam; düzeltme onları bozmamalı.
    const raw = THEMES.find((t) => t.id === "nterminal-dark")!;
    const fixed = getTheme("nterminal-dark");
    expect(fixed.xterm.brightWhite).toBe(raw.xterm.brightWhite);
    expect(fixed.xterm.foreground).toBe(raw.xterm.foreground);
  });

  it("harmonizeTheme arka planı olmayan temayı değiştirmez", () => {
    const input = { foreground: "#000000" };
    expect(harmonizeTheme(input)).toBe(input);
  });
});

// -------------------------------------------------------------- etiketler

function tab(patch: Partial<TabState> = {}): TabState {
  return {
    id: "t1",
    title: "",
    customTitle: null,
    profileId: "p1",
    cwd: null,
    createdAt: 0,
    lastActiveAt: 0,
    hasScrollback: false,
    lastCommand: null,
    locked: false,
    ...patch,
  };
}

function profile(patch: Partial<Profile> = {}): Profile {
  return {
    id: "p1",
    name: "PowerShell",
    kind: "pwsh",
    shell: "pwsh.exe",
    args: [],
    cwd: null,
    env: {},
    shellIntegration: true,
    color: null,
    icon: null,
    unavailable: false,
    ...patch,
  };
}

describe("sekme etiketleri", () => {
  it("kullanıcının verdiği ad her şeyin önünde", () => {
    const t = tab({ customTitle: "Yayın", cwd: "C:\\proje", title: "powershell" });
    expect(tabLabel(t)).toBe("Yayın");
    expect(hasCustomTitle(t)).toBe(true);
  });

  it("ad yoksa klasör adı kullanılır", () => {
    expect(tabLabel(tab({ cwd: "C:\\Users\\ali\\NTerminal" }))).toBe("NTerminal");
  });

  it("kabuk başlığı tam yol geldiyse sadece dosya adı gösterilir", () => {
    // PowerShell başlık olarak exe'nin tam yolunu veriyor; sekmede bu okunmaz.
    expect(
      tabLabel(tab({ title: "C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" })),
    ).toBe("powershell.exe");
  });

  it("hiçbir bilgi yoksa yedek etiket", () => {
    expect(tabLabel(tab())).toBe("sekme");
    expect(hasCustomTitle(tab({ customTitle: "   " }))).toBe(false);
  });

  it("ikincil satır: elle adlandırılmışsa klasör, değilse son komut", () => {
    expect(tabSubtitle(tab({ customTitle: "Yayın", cwd: "C:\\a\\b\\c", lastCommand: "git push" })))
      .toContain("b");
    expect(tabSubtitle(tab({ cwd: "C:\\a\\b\\c", lastCommand: "git push" }))).toBe("git push");
  });

  it("kabuk türü kısa kodu", () => {
    expect(shellBadge(profile({ kind: "pwsh" }))).toBe("PS7");
    expect(shellBadge(profile({ kind: "power-shell" }))).toBe("PS");
    expect(shellBadge(profile({ kind: "cmd" }))).toBe("CMD");
    expect(shellBadge(profile({ kind: "bash" }))).toBe("SH");
    expect(shellBadge(profile({ kind: "wsl" }))).toBe("WSL");
    expect(shellBadge(profile({ kind: "custom" }))).toBe("EXE");
    expect(shellBadge(undefined)).toBe("?");
  });
});
