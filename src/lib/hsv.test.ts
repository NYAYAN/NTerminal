import { describe, expect, it } from "vitest";

import { hexToHsv, hsvToHex, normalizeHex } from "./hsv";

/**
 * Renk seçicinin hesabı. Seçici kodu her sürüklemede HSV'den yeniden
 * üretiyor; gidiş-dönüşte tek bir hane kayarsa kutuya yazılan renkle grubun
 * rengi ayrışır.
 */

describe("normalizeHex", () => {
  it.each([
    ["#58A6FF", "#58a6ff"],
    ["58a6ff", "#58a6ff"],
    [" #58a6ff ", "#58a6ff"],
    ["#abc", "#aabbcc"],
    ["ABC", "#aabbcc"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeHex(input)).toBe(expected);
  });

  it.each(["", "#", "#58a6f", "#58a6ff0", "zzz", "#12345g", "#ab"])("%j geçersiz", (input) => {
    expect(normalizeHex(input)).toBeNull();
  });
});

describe("HSV ↔ kod", () => {
  it.each(["#58a6ff", "#3fb950", "#d29922", "#bc8cff", "#ff7b72", "#000000", "#ffffff", "#808080"])(
    "%s gidip dönünce aynı",
    (hex) => {
      expect(hsvToHex(hexToHsv(hex)!)).toBe(hex);
    },
  );

  it("ana renkler ve tonun sarması", () => {
    expect(hsvToHex({ h: 0, s: 1, v: 1 })).toBe("#ff0000");
    expect(hsvToHex({ h: 120, s: 1, v: 1 })).toBe("#00ff00");
    expect(hsvToHex({ h: 240, s: 1, v: 1 })).toBe("#0000ff");
    expect(hsvToHex({ h: 360, s: 1, v: 1 })).toBe("#ff0000");
    expect(hsvToHex({ h: 200, s: 0, v: 0.5 })).toBe("#808080");
    expect(hsvToHex({ h: 200, s: 1, v: 0 })).toBe("#000000");
  });

  it("gri renkte ton yok, doygunluk sıfır", () => {
    expect(hexToHsv("#808080")).toEqual({ h: 0, s: 0, v: 128 / 255 });
    expect(hexToHsv("nope")).toBeNull();
  });
});
