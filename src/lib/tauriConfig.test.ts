import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Arayüzün bağlı olduğu Tauri yapılandırma değişmezleri.
 *
 * Bu testin sebebi gerçek bir hata: sekme sürükle-bırak kodu doğruydu, indeks
 * matematiğinin testleri de geçiyordu, ama paketlenmiş uygulamada sürükleme
 * hiç çalışmıyordu. Sebep koddan bağımsızdı — Tauri'nin `dragDropEnabled`
 * ayarı varsayılan olarak açık ve açıkken webview'e işletim sistemi düzeyinde
 * bir dosya-bırakma yakalayıcısı takıyor; o yakalayıcı sayfa içindeki HTML5
 * sürükleme olaylarını yutuyor. Tauri şemasının kendi ifadesi:
 *
 *   "Disabling it is required to use HTML5 drag and drop on the frontend on
 *    Windows."
 *
 * Kod tarafında hiçbir belirti yok: derleme geçiyor, testler geçiyor, hata
 * çıkmıyor — yalnızca özellik çalışmıyor. O yüzden yapılandırmayı testle
 * bağlıyoruz.
 */
const CONFIG = JSON.parse(
  readFileSync(join(process.cwd(), "src-tauri/tauri.conf.json"), "utf8"),
) as {
  app: { windows: { label: string; dragDropEnabled?: boolean }[]; security: { csp: string } };
};

describe("tauri yapılandırması", () => {
  it("ana pencere tanımlı", () => {
    const main = CONFIG.app.windows.find((w) => w.label === "main");
    expect(main, "main etiketli pencere bulunamadı").toBeTruthy();
  });

  it("dragDropEnabled kapalı — HTML5 sürükle-bırak için şart", () => {
    for (const window of CONFIG.app.windows) {
      expect(
        window.dragDropEnabled,
        `${window.label}: dragDropEnabled açıkken sekme ve grup sürüklemesi çalışmaz`,
      ).toBe(false);
    }
  });

  it("CSP script-src 'self' ile sınırlı", () => {
    // Terminal çıktısı güvenilir bir kaynak değil; uzaktan betik yüklenmesine
    // izin veren bir CSP, çıktıdaki bir metnin kod çalıştırmasına yol açabilir.
    const csp = CONFIG.app.security.csp;
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain("unsafe-eval");
  });
});
