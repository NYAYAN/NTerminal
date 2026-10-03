import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
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
    windows?: { wix?: { template?: string } };
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
 * MSI kısayolları ve görev çubuğu simgesi.
 *
 * BİLDİRİLEN: "uygulamayı kurduktan sonra taskbar üzerinde bir süre sonra
 * iconu gidiyor" — sabitlenmiş düğme duruyor, resmi boşalıyor.
 *
 * ÖLÇÜLEN: sabitlenmiş kısayolun simgesi
 * `C:\Windows\Installer\{A34D7293-…}\ProductIcon` idi ve dosya yoktu. Tauri'nin
 * MSI şablonu Başlat menüsü kısayoluna `Icon="ProductIcon"` veriyor; o simge
 * ürün koduna bağlı klasörde duruyor, ürün kodu her derlemede değişiyor ve
 * güncelleme eski klasörü siliyor. Kısayoldan sabitlenen düğme yolu kopyaladığı
 * için HER güncellemeden sonra boşalıyordu. Tam gerekçe şablonun başında.
 *
 * Kod tarafında hiçbir belirti yok: MSI kuruluyor, uygulama açılıyor, simge
 * günler sonra kayboluyor. O yüzden şablon testle bağlı.
 */
describe("MSI kısayolları", () => {
  const TEMPLATE = join(process.cwd(), "src-tauri", "wix", "main.wxs");
  const scope = join(process.cwd(), "node_modules", "@tauri-apps");
  // Şablon kurulu CLI'nin ikilisinden okunuyor; CLI'nin yerel paketi her
  // platformda farklı adla geliyor.
  const cliKurulu =
    existsSync(scope) && readdirSync(scope).some((name) => name.startsWith("cli-"));
  // `wix-template.mjs`in "kurulu CLI Windows derlemesi değil" çıkışı
  // (betikte `NOT_APPLICABLE`); kaymanın kodu 1.
  const UYGULANAMAZ = 3;

  it("yapılandırma projenin WiX şablonunu kullanıyor", () => {
    expect(CONFIG.bundle.windows?.wix?.template, "şablon bağlanmamış").toBe("wix/main.wxs");
    expect(existsSync(TEMPLATE), "src-tauri/wix/main.wxs yok").toBe(true);
  });

  it("Başlat menüsü kısayolu MSI önbelleğindeki simgeyi kullanmıyor", () => {
    const text = readFileSync(TEMPLATE, "utf8");
    const start = text.indexOf('<Shortcut Id="ApplicationStartMenuShortcut"');
    expect(start, "Başlat menüsü kısayolu bulunamadı").toBeGreaterThan(-1);
    const element = text.slice(start, text.indexOf("</Shortcut>", start));
    expect(element, "kısayol yine ürün koduna bağlı simgeyi gösteriyor").not.toMatch(/\bIcon=/);
    // Kimlik düşerse sabitlenen düğme çalışan pencereyle aynı gruba girmez.
    expect(element, "AppUserModelID kaybolmuş").toContain('Key="System.AppUserModel.ID"');
  });

  it.skipIf(!cliKurulu)("şablon kurulu Tauri CLI'nin şablonundan kaymamış", (ctx) => {
    // Elle kopyalanmış şablon Tauri güncellenince sessizce eskir. Düşerse:
    // `node scripts/wix-template.mjs` şablonu yeniden üretiyor.
    const run = spawnSync(process.execPath, ["scripts/wix-template.mjs", "--check"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    // WiX şablonu yalnızca CLI'nin Windows derlemesinde var. macOS'ta bu test
    // her koşuda düşüyordu (Linux'ta da düşer; CI'daki vitest işi orada):
    // betik şablonu mac ikilisinde arayıp "biçim değişmiş olabilir" diyordu —
    // yanlış alarm, şablon orada hiç yok (gerekçe betikte, `isWindowsBuild`).
    // Artık kaymadan ayrı bir kodla "uygulanamaz" diyor ve test atlanıyor.
    //
    // Windows'ta bu yanıt KABUL EDİLMİYOR: npm orada hep `cli-win32-*`
    // kuruyor. Betik yine de "uygulanamaz" diyorsa Windows derlemesini
    // tanıyamıyor demektir (ör. paket adı değişmiş); atlamak, denetimi tam
    // çalışması gereken yerde sessizce kapatırdı.
    ctx.skip(run.status === UYGULANAMAZ && process.platform !== "win32", run.stderr.trim());
    expect(run.status, `${run.stdout}${run.stderr}`).toBe(0);
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

/**
 * Çalışan uygulama denetimi.
 *
 * Cargo, bağlama adımında eski ikiliyi siliyor; uygulama açıksa Windows onu
 * kilitliyor ve derleme `Access is denied (os error 5)` ile düşüyor. İletinin
 * sebebi söylemediği yetmezmiş gibi, hata ÖN YÜZ DERLENDİKTEN sonra — iki
 * dakika sonra — geliyor.
 *
 * Üç kez yaşandı; artık dağıtıcı en başta bakıyor. `openSync(exe, "r+")`
 * çalışan bir exe'de EBUSY veriyor (ölçüldü).
 */
describe("çalışan uygulama denetimi", () => {
  const runner = readFileSync(join(process.cwd(), "scripts/run.mjs"), "utf8");

  it("ikiliyi yazma için açmayı deniyor", () => {
    expect(runner, "kilit denetimi yok").toMatch(/openSync\([^)]*"r\+"\)/);
  });

  it("kilit hata kodlarını tanıyor", () => {
    // Windows EBUSY veriyor; EPERM/EACCES başka kilit senaryolarında çıkıyor.
    for (const code of ["EBUSY", "EPERM", "EACCES"]) {
      expect(runner, `${code} tanınmıyor`).toContain(code);
    }
  });

  it("denetim platform dağıtımından ÖNCE", () => {
    // Sonra kalırsa ileti yine iki dakika sonra gelir — düzeltmenin bütün
    // anlamı erken çıkmasıydı.
    const denetim = runner.indexOf("kilitliIkili()");
    const dagitim = runner.indexOf("if (WINDOWS) {");
    expect(denetim, "denetim çağrılmıyor").toBeGreaterThan(-1);
    expect(dagitim, "platform dağıtımı yok").toBeGreaterThan(-1);
    expect(denetim, "denetim dağıtımdan sonra kalmış").toBeLessThan(dagitim);
  });

  it("deps/ altındaki ikiliye de bakıyor", () => {
    // Asıl kilit ORADA: cargo ikiliyi önce `deps/` altında üretip profil
    // klasörüne kopyalıyor, çalışan süreç `deps/` altındakini tutuyor.
    // Yalnızca profil klasörüne bakan bir denetim yanılıyor — ölçüldü:
    // `release/nterminal.exe` silinmişken bile derleme, deps altındaki
    // ikiliyi açamadığı için LNK1104 ile düşüyor.
    expect(runner, "deps/ denetlenmiyor").toContain('"deps"');
  });

  it("CARGO_TARGET_DIR ayarını dikkate alıyor", () => {
    // Ayrı hedef dizin, uygulamayı kapatmadan derlemenin yolu; denetim oraya
    // bakmalı, yoksa yanlış dosyayı yoklar.
    expect(runner).toContain("CARGO_TARGET_DIR");
  });
});
