import { describe, expect, it } from "vitest";

import { MIN_PALETTE_CONTRAST, contrastRatio, parseHex } from "./contrast";
import { defaultPromptColors, promptRgb } from "./promptColors";
import { THEMES, getTheme } from "./themes";

/**
 * Ayardan seçilen istem renginin kabuğa giden hâli.
 *
 * Seçilen renk terminal zeminine karşı okunmayabilir ve truecolor SGR palet
 * süzgecinden geçmez; bu testler süzgecin (ton korunarak okunur hâle getirme)
 * ve geçersiz girdinin palet rengine düşmesinin bağlandığı yer.
 */

const DARK = "nterminal-dark";
const light = THEMES.find((t) => t.id.includes("light"))?.id ?? DARK;

const rgbHex = (triple: string) => {
  const [r, g, b] = triple.split(";").map(Number);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
};

describe("promptRgb", () => {
  it("seçilmemiş ya da boş renk palet rengine bırakıyor", () => {
    expect(promptRgb("", DARK)).toBe("");
    expect(promptRgb(undefined, DARK)).toBe("");
    expect(promptRgb(null, DARK)).toBe("");
    expect(promptRgb("   ", DARK)).toBe("");
  });

  it("yeterince okunur bir renk OLDUĞU GİBİ gidiyor", () => {
    expect(promptRgb("#ff8c00", DARK)).toBe("255;140;0");
  });

  it("koyu temada okunmayan koyu renk açılıyor ama tonu (mavi) kalıyor", () => {
    // Bu depoda bir kez ödenmiş hata: `#0e4d92` koyu temada 1,4:1 (bkz. readableAccent).
    const cikan = promptRgb("#0e4d92", DARK);
    expect(cikan).not.toBe("14;77;146");
    const zemin = getTheme(DARK).xterm.background ?? "";
    expect(contrastRatio(rgbHex(cikan), zemin)).toBeGreaterThanOrEqual(MIN_PALETTE_CONTRAST);
    const [r, g, b] = cikan.split(";").map(Number);
    expect(b, "ton kayboldu: mavi artık baskın değil").toBeGreaterThan(r);
    expect(b).toBeGreaterThan(g);
  });

  it("açık temada okunmayan açık renk koyulaşıyor", () => {
    const cikan = promptRgb("#ffee88", light);
    const zemin = getTheme(light).xterm.background ?? "";
    expect(contrastRatio(rgbHex(cikan), zemin)).toBeGreaterThanOrEqual(MIN_PALETTE_CONTRAST);
    // Açık zeminde koyulaşmış olmalı: bütün bileşenler eskisinden küçük ya da eşit.
    const [r, g, b] = cikan.split(";").map(Number);
    const once = parseHex("#ffee88");
    expect(r).toBeLessThanOrEqual(once?.r ?? 255);
    expect(g).toBeLessThanOrEqual(once?.g ?? 255);
    expect(b).toBeLessThanOrEqual(once?.b ?? 255);
  });

  it("aynı renk temaya göre farklı düzeltiliyor", () => {
    if (light === DARK) return; // açık tema yoksa anlamsız
    expect(promptRgb("#ffee88", DARK)).toBe("255;238;136"); // koyuda zaten okunur
    expect(promptRgb("#ffee88", light)).not.toBe("255;238;136");
  });

  it("geçersiz girdi palet rengine düşüyor (kabuğa hiçbir şey gitmiyor)", () => {
    // `<input type="color">` yalnızca #rrggbb verir; el ile bozulmuş bir ayar
    // dosyasından başka bir şey gelirse kaçış dizisine ASLA yazılmamalı.
    for (const kotu of [
      "red",
      "#12",
      "#12345",
      "#1234567",
      "#gggggg",
      "ff8c00",
      "#ff8c00; rm -rf ~",
      "$(reboot)",
      "38;2;1;2;3",
      "\u001b[31m",
    ]) {
      expect(promptRgb(kotu, DARK), `kabul edildi: ${JSON.stringify(kotu)}`).toBe("");
    }
  });

  it("çıktı yalnızca rakam ve noktalı virgül içeriyor", () => {
    for (const renk of ["#000000", "#ffffff", "#0e4d92", "#ff00ff", "#123456"]) {
      for (const tema of THEMES.map((t) => t.id)) {
        expect(promptRgb(renk, tema)).toMatch(/^\d{1,3};\d{1,3};\d{1,3}$/);
      }
    }
  });

  it("bilinmeyen tema kimliği çökmüyor (ilk temaya düşüyor)", () => {
    expect(promptRgb("#ff8c00", "yok-boyle-bir-tema")).toBe("255;140;0");
  });
});

describe("defaultPromptColors", () => {
  it("kalın palet rengi PARLAK karşılığıyla çizildiği için parlak yeşil/mavi", () => {
    const palet = getTheme(DARK).xterm;
    const r = defaultPromptColors(DARK);
    expect(r.user).toBe(palet.brightGreen);
    expect(r.dir).toBe(palet.brightBlue);
  });

  it("her temada geçerli #rrggbb veriyor (renk seçici geçerli değer ister)", () => {
    for (const t of THEMES) {
      const r = defaultPromptColors(t.id);
      expect(r.user, t.id).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(r.dir, t.id).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});
