import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Pencere görünümü ve "Sistemi izle".
 *
 * Pencere koyu açılıyor; görünüm sisteme BIRAKILMAZSA medya sorgusu hep
 * "koyu" der ve "Sistemi izle" sistemi hiç göremez. macOS'ta görünüm uygulama
 * genelinde: fark penceresi açılırken verilen tema ana pencereyi de kilitliyor,
 * bu yüzden son karar yeniden veriliyor.
 */

const setTheme = vi.fn(async (_theme: string | null) => {});
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ setTheme }),
}));

const { applyWindowTheme, reapplyWindowTheme, windowTone } = await import("./windowTheme");

afterEach(() => setTheme.mockClear());

describe("pencere görünümü", () => {
  it("tema tonuna göre; 'Sistemi izle'de sisteme bırakılıyor", () => {
    expect(windowTone("nterminal-dark")).toBe("dark");
    expect(windowTone("solarized-light")).toBe("light");
    expect(windowTone("nterminal-light")).toBe("light");
    expect(windowTone("system")).toBe(null);
  });

  it("fark penceresinden sonra son karar yeniden veriliyor", () => {
    applyWindowTheme("system");
    setTheme.mockClear();
    reapplyWindowTheme();
    expect(setTheme).toHaveBeenCalledWith(null);
  });
});
