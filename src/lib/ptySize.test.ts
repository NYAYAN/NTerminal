import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { MIN_PTY_COLS, MIN_PTY_ROWS, shouldResize } from "./ptySize";

/**
 * Terminal ölçüsünün PTY'ye gidebilecek alt sınırı.
 *
 * BİLDİRİLEN BELİRTİ: istem ikişer harflik parçalara bölünüp ekranda
 * kalıyordu (`ny---…an---…`). Sebep xterm'in 2, kabuğun 10 sütun sanmasıydı:
 * FitAddon dar kapta 2 sütuna iniyor, Rust ise PTY'yi en az 10 sütun yapıyor
 * (ayrıntı `ptySize.ts` başında).
 *
 * Bu testler iki şeyi bağlıyor: dar kapta boyutlandırma HİÇ yapılmıyor, ve
 * alt sınır Rust'takiyle aynı. İkincisi sessizce bozulabilir — biri Rust'taki
 * sınırı yükseltirse iki taraf yine ayrışır ve belirti yalnızca dar bir
 * terminalde, ara sıra görünür.
 */

const now = { cols: 80, rows: 24 };

describe("shouldResize", () => {
  it("PTY'nin alt sınırının altındaki ölçüye inmiyor", () => {
    // Hatanın ölçüsü: FitAddon'ın tabanı 2 sütun.
    expect(shouldResize({ cols: 2, rows: 30 }, now)).toBe(false);
    expect(shouldResize({ cols: MIN_PTY_COLS - 1, rows: 30 }, now)).toBe(false);
    expect(shouldResize({ cols: 120, rows: 1 }, now)).toBe(false);
  });

  it("alt sınırın kendisi geçerli", () => {
    expect(shouldResize({ cols: MIN_PTY_COLS, rows: MIN_PTY_ROWS }, now)).toBe(true);
  });

  it("ölçü değiştiyse boyutlandırıyor", () => {
    expect(shouldResize({ cols: 120, rows: 24 }, now)).toBe(true);
    expect(shouldResize({ cols: 80, rows: 40 }, now)).toBe(true);
  });

  it("ölçü aynıysa boyutlandırmıyor", () => {
    expect(shouldResize({ cols: 80, rows: 24 }, now)).toBe(false);
  });

  it("öneri yoksa ya da sayı değilse boyutlandırmıyor", () => {
    // Kap henüz düzenlenmemişken FitAddon `undefined` ya da NaN veriyor.
    expect(shouldResize(undefined, now)).toBe(false);
    expect(shouldResize({ cols: Number.NaN, rows: 24 }, now)).toBe(false);
    expect(shouldResize({ cols: 80, rows: Number.POSITIVE_INFINITY }, now)).toBe(false);
  });
});

describe("Rust'taki alt sınırla aynı", () => {
  const pty = readFileSync(join(process.cwd(), "src-tauri/src/pty.rs"), "utf8");
  const floors = (field: "cols" | "rows") =>
    [...pty.matchAll(new RegExp(`\\b${field}\\.max\\((\\d+)\\)`, "g"))].map((m) => Number(m[1]));

  it("sütun", () => {
    // Doğurma ve yeniden boyutlandırma: ikisi de aynı sınırı uygulamalı.
    const found = floors("cols");
    expect(found.length).toBeGreaterThanOrEqual(2);
    for (const n of found) expect(n).toBe(MIN_PTY_COLS);
  });

  it("satır", () => {
    const found = floors("rows");
    expect(found.length).toBeGreaterThanOrEqual(2);
    for (const n of found) expect(n).toBe(MIN_PTY_ROWS);
  });
});
