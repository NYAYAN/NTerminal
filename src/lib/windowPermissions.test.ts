import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Arayüzden çağrılan her pencere işleminin Tauri izni olmalı.
 *
 * ÖLÇÜLEN HATA: kapatma düğmesi "arka planda kal" ayarıyla hiçbir şey
 * yapmıyordu. Sebep koddaki bir mantık hatası değildi — `window.hide()`
 * çağrısı vardı, doğru yerdeydi, tipler tutuyordu. Eksik olan
 * `core:window:allow-hide` izniydi: Tauri çağrıyı reddediyor, dönen söz
 * sessizce düşüyor ve düğme ölü görünüyordu.
 *
 * Bu hata sınıfı derleyiciye görünmez ve testler geçmeye devam eder; tek
 * belirtisi "tıklıyorum bir şey olmuyor". O yüzden burada bağlı.
 */

const SRC = join(process.cwd(), "src");
const CAPS = join(process.cwd(), "src-tauri/capabilities/default.json");

/** Kullanılan yöntem adı -> gereken izin. */
const IZIN: Record<string, string> = {
  hide: "core:window:allow-hide",
  show: "core:window:allow-show",
  close: "core:window:allow-close",
  destroy: "core:window:allow-destroy",
  minimize: "core:window:allow-minimize",
  unminimize: "core:window:allow-unminimize",
  maximize: "core:window:allow-maximize",
  toggleMaximize: "core:window:allow-toggle-maximize",
  isMaximized: "core:window:allow-is-maximized",
  setTitle: "core:window:allow-set-title",
  setFocus: "core:window:allow-set-focus",
  startDragging: "core:window:allow-start-dragging",
  // Pencerenin görünümü temaya uyuyor ("Sistemi izle"de sisteme bırakılıyor).
  setTheme: "core:window:allow-set-theme",
};

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...tsFiles(full));
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

/**
 * Pencere yöntemi çağıran dosyaları tarar.
 *
 * Yalnızca `getCurrentWindow`u içe aktaran dosyalara bakıyoruz: `.close()`
 * gibi adlar başka nesnelerde de geçiyor (menü, oturum), hepsini pencere
 * çağrısı saymak testi gürültüye boğardı.
 */
function kullanilanlar(): Map<string, string[]> {
  const bulunan = new Map<string, string[]>();
  for (const file of tsFiles(SRC)) {
    const text = readFileSync(file, "utf8");
    if (!text.includes("getCurrentWindow")) continue;
    for (const method of Object.keys(IZIN)) {
      // `window_.hide()` / `windowHandle()?.close()` gibi çağrılar.
      if (new RegExp(`\\.${method}\\(`).test(text)) {
        const liste = bulunan.get(method) ?? [];
        liste.push(relative(process.cwd(), file));
        bulunan.set(method, liste);
      }
    }
  }
  return bulunan;
}

describe("pencere izinleri", () => {
  const izinler: string[] = JSON.parse(readFileSync(CAPS, "utf8")).permissions;

  it("tarama çalışıyor", () => {
    // Tarama boş dönerse aşağıdaki test hiçbir şey doğrulamaz.
    expect(kullanilanlar().size, "hiç pencere çağrısı bulunamadı").toBeGreaterThan(0);
  });

  it("çağrılan her yöntemin izni var", () => {
    const eksik: string[] = [];
    for (const [method, files] of kullanilanlar()) {
      if (!izinler.includes(IZIN[method])) {
        eksik.push(`${IZIN[method]} eksik — ${method}() çağrısı: ${files.join(", ")}`);
      }
    }
    expect(eksik, `izin listesi eksik:\n${eksik.join("\n")}`).toEqual([]);
  });

  it("kapatma düğmesinin iki yolu da izinli", () => {
    // Ayara göre biri ya da öteki çalışıyor; biri eksikse o ayar ölü kalır.
    expect(izinler, "arka planda kalma yolu izinsiz").toContain("core:window:allow-hide");
    expect(izinler, "tamamen çıkma yolu izinsiz").toContain("core:window:allow-destroy");
  });
});
