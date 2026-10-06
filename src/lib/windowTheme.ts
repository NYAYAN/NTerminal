import { getCurrentWindow } from "@tauri-apps/api/window";

import { SYSTEM_THEME, getTheme, isLightTheme } from "./themes";

/**
 * Pencerenin görünümünü temaya uydurur: açık temada açık, koyuda koyu,
 * "Sistemi izle"de sisteme bırakır (`null`).
 *
 * Pencere `tauri.conf.json`da KOYU açılıyor (açılış karesinde beyaz parlama
 * olmasın). Öyle kalsaydı medya sorgusu hep "koyu" derdi ve "Sistemi izle"
 * sistemin görünümünü hiç göremezdi; açık temalarda da yerel denetimler
 * (açılır menü listesi, renk seçici) koyu çiziliyordu. İzin:
 * `core:window:allow-set-theme`.
 *
 * ## Uygulama geneli
 *
 * macOS'ta Tauri bunu PENCERE değil UYGULAMA düzeyinde yapıyor (tao
 * `set_ns_theme` → `NSApp.setAppearance`). Fark penceresi açılırken verdiği
 * tema (`diff_window_open`, `dark`) ana pencereyi de o tona kilitliyor;
 * "Sistemi izle"de sistem değişince artık izlenmezdi. Fark penceresi açıldıktan
 * sonra `reapplyWindowTheme` son kararı yeniden veriyor.
 */
let lastSetting: string | null = null;

export function windowTone(themeSetting: string): "light" | "dark" | null {
  if (themeSetting === SYSTEM_THEME) return null;
  return isLightTheme(getTheme(themeSetting)) ? "light" : "dark";
}

export function applyWindowTheme(themeSetting: string): void {
  lastSetting = themeSetting;
  try {
    void getCurrentWindow()
      .setTheme(windowTone(themeSetting))
      .catch(() => {});
  } catch {
    // Tauri dışında (testler) pencere yok.
  }
}

/** Başka bir pencerenin değiştirdiği uygulama görünümünü geri alır. */
export function reapplyWindowTheme(): void {
  if (lastSetting !== null) applyWindowTheme(lastSetting);
}
