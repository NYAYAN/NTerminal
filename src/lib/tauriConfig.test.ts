import { existsSync, readFileSync } from "node:fs";
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
  bundle: {
    targets: string | string[];
    icon: string[];
    macOS?: { minimumSystemVersion?: string };
  };
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

  it("macOS paket hedefleri tanımlı", () => {
    // Hedef listesinde `app`/`dmg` yoksa mac'te kurulabilir bir çıktı HİÇ
    // üretilmiyor: derleme sorunsuz geçiyor, sonunda elde bir şey olmuyor.
    // Bu ancak mac'te paketlemeye çalışınca görülür.
    const targets = CONFIG.bundle.targets;
    const list = Array.isArray(targets) ? targets : [targets];
    if (list.includes("all")) return; // "all" ana platformun her hedefini kapsıyor
    expect(list, "macOS uygulama paketi hedefi yok").toContain("app");
    expect(list, "macOS dmg hedefi yok").toContain("dmg");
    expect(list, "Windows kurulum hedefi kaybolmuş").toContain("nsis");
  });

  it("macOS ikonu paket listesinde", () => {
    // .icns olmadan mac paketi jenerik bir ikonla çıkıyor; .ico mac'te
    // kullanılmıyor, dolayısıyla ikisi birden gerekiyor.
    expect(CONFIG.bundle.icon.some((i) => i.endsWith(".icns")), "icon.icns yok").toBe(true);
    expect(CONFIG.bundle.icon.some((i) => i.endsWith(".ico")), "icon.ico yok").toBe(true);
  });

  it("macOS asgari sürümü belirtilmiş", () => {
    // Tauri'nin varsayılanı 10.13 (2017). WKWebView'ün o sürümdeki hâli
    // denenmedi; desteklediğimizi söylemek yanlış olur.
    const min = CONFIG.bundle.macOS?.minimumSystemVersion;
    expect(min, "minimumSystemVersion yazılmamış").toBeTruthy();
    expect(Number.parseFloat(min!)).toBeGreaterThanOrEqual(11);
  });

  it("CSP script-src 'self' ile sınırlı", () => {
    // Terminal çıktısı güvenilir bir kaynak değil; uzaktan betik yüklenmesine
    // izin veren bir CSP, çıktıdaki bir metnin kod çalıştırmasına yol açabilir.
    const csp = CONFIG.app.security.csp;
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain("unsafe-eval");
  });
});

/**
 * Yapı betiklerinin platformdan bağımsızlığı.
 *
 * `npm start` / `npm run bundle` / `npm test` iki platformda da AYNI komut
 * olmalı. Eskiden doğrudan `powershell -File scripts/x.ps1` çağırıyorlardı;
 * mac'te bu komutların hiçbiri çalışmıyordu — hata da anlaşılır değil,
 * "powershell: command not found" diyor ve sorunun projede olduğu anlaşılmıyor.
 */
describe("yapı betikleri", () => {
  const pkg = JSON.parse(
    readFileSync(join(process.cwd(), "package.json"), "utf8"),
  ) as { scripts: Record<string, string> };

  it("kullanıcıya dönük betikler doğrudan powershell çağırmıyor", () => {
    const bad = ["start", "bundle", "test"].filter((name) =>
      /powershell|pwsh/i.test(pkg.scripts[name] ?? ""),
    );
    expect(bad, `platforma bağlı betik: ${bad.join(", ")}`).toEqual([]);
  });

  it("hepsi ortak dağıtıcıdan geçiyor", () => {
    for (const name of ["start", "bundle", "test"]) {
      expect(pkg.scripts[name], `${name} tanımsız`).toBeTruthy();
      expect(pkg.scripts[name], `${name} dağıtıcıyı çağırmıyor`).toContain("scripts/run.mjs");
    }
  });

  it("dağıtıcı dosyası var", () => {
    expect(existsSync(join(process.cwd(), "scripts/run.mjs"))).toBe(true);
  });

  it("Windows tarafındaki PowerShell betikleri korunmuş", () => {
    // MSVC toolset seçimi orada çözülüyor; dağıtıcı Windows'ta onlara
    // devrediyor. Silinirlerse Windows yapısı bozulur.
    for (const f of ["dev.ps1", "build.ps1", "test.ps1", "win-env.ps1"]) {
      expect(existsSync(join(process.cwd(), "scripts", f)), `${f} yok`).toBe(true);
    }
  });
});
