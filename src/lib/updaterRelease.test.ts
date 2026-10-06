import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

/**
 * Uygulama içinden güncellemenin yayın zinciri.
 *
 * Zincirin her halkası ayrı bir dosyada ve hiçbiri derleyicinin gördüğü bir
 * şey değil: uygulamanın okuduğu adres (`tauri.conf.json`), o adrese konan
 * dosya (`scripts/release-files.mjs`), dosyayı üreten iş (`build.yml`) ve
 * imzayı doğrulayan açık anahtar. Biri kayarsa belirti tek: kurulu
 * uygulamalarda "Güncelle" düğmesi hiç çıkmıyor — ve bu ancak bir sonraki
 * yayında, kullanıcıların makinesinde görülür.
 *
 * ÖLÇÜLEN HATA (Ekim 2026): yayın işi `gh release create … paketler/*`
 * diyordu; paketler `nsis/` ve `msi/` klasörlerinde geldiği için `gh`
 * klasörü dosya sanıp düştü ve 0.2.1 hiç yayımlanmadı. "Yeni sürüm var"
 * bildirimi bu yüzden bir ay boyunca kimseye gitmedi.
 */

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const CONFIG = JSON.parse(read("src-tauri/tauri.conf.json")) as {
  bundle: { createUpdaterArtifacts?: unknown };
  plugins?: { updater?: { pubkey: string; endpoints: string[]; windows?: { installMode?: string } } };
};
const WORKFLOW = read(".github/workflows/build.yml");
const REPO = read("src-tauri/src/update.rs").match(/const REPO: &str = "([^"]+)";/)?.[1];

describe("güncelleme yapılandırması", () => {
  const updater = CONFIG.plugins?.updater;

  it("uygulama son yayının latest.json'ını okuyor — haberle aynı depodan", () => {
    // Haber (`update.rs`, GitHub API) ile kurulum (`latest.json`) ayrı
    // depolara bakarsa düğme başka bir sürümü kurmaya kalkar.
    expect(REPO, "update.rs'de REPO bulunamadı").toBeTruthy();
    expect(updater?.endpoints).toEqual([
      `https://github.com/${REPO}/releases/latest/download/latest.json`,
    ]);
  });

  it("açık anahtar gerçek bir minisign anahtarı", () => {
    // Yer tutucu ya da bozuk bir değer derlemede değil, ilk güncellemede
    // "imza doğrulanamadı" diye düşer.
    const decoded = Buffer.from(updater?.pubkey ?? "", "base64").toString("utf8");
    expect(decoded).toMatch(/^untrusted comment: minisign public key: [0-9A-F]{16}\n\S{56}\n?$/);
  });

  it("güncelleme paketleri yapılandırmada AÇIK DEĞİL", () => {
    // Açık olsaydı imza anahtarı olmayan her yerel `npm run bundle` düşerdi;
    // CI onu yalnızca anahtar varken `--config` ile açıyor.
    expect(CONFIG.bundle.createUpdaterArtifacts ?? false).toBe(false);
  });

  it("Windows kurucusu soru sormadan çalışıyor", () => {
    // `basicUi` kurulum sihirbazını gösterir; düğmeye basan kullanıcı ikinci
    // kez "İleri" demeye çağrılmamalı. `passive` ilerleme çubuğu gösteriyor.
    expect(updater?.windows?.installMode).toBe("passive");
  });

  it("arayüze güncelleme izni verilmiyor", () => {
    // Eklenti yalnızca Rust'tan kullanılıyor (`update_download`/`update_apply`
    // onay ve durum kaydıyla sarılı). Web görünümüne `updater:` izni vermek,
    // sayfada çalışan herhangi bir kodun o adımları atlayıp doğrudan
    // kurmasına kapı açardı.
    const caps = read("src-tauri/capabilities/default.json");
    expect(caps).not.toMatch(/"updater:/);
  });
});

describe("yayın işi", () => {
  const paket = WORKFLOW.slice(WORKFLOW.indexOf("\n  paket:"), WORKFLOW.indexOf("\n  yayin:"));
  const yayin = WORKFLOW.slice(WORKFLOW.indexOf("\n  yayin:"));

  it("imza anahtarı sırdan geliyor ve güncelleme paketlerini yalnızca o açıyor", () => {
    expect(paket).toContain("TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}");
    expect(paket).toContain(
      "TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}",
    );
    expect(paket).toContain(`--config '{"bundle":{"createUpdaterArtifacts":true}}'`);
  });

  it("imzalar ve macOS güncelleme paketi de yükleniyor", () => {
    for (const path of ["nsis/*.exe.sig", "msi/*.msi.sig", "macos/*.app.tar.gz", "macos/*.app.tar.gz.sig"]) {
      expect(paket, `${path} yüklenmiyor`).toContain(`src-tauri/target/release/bundle/${path}`);
    }
  });

  it("Release'e indirilen klasör değil betiğin düz klasörü gidiyor", () => {
    const prepare = yayin.indexOf("node scripts/release-files.mjs indirilen paketler");
    const create = yayin.indexOf("gh release create");
    expect(prepare, "yayın dosyaları hazırlanmıyor").toBeGreaterThan(-1);
    expect(create).toBeGreaterThan(prepare);
    // İndirme betiğin GİRDİSİNE yapılıyor; Release'e giden `paketler/`i
    // yalnızca betik dolduruyor.
    expect(yayin).toMatch(/download-artifact@v\d+\s+with:\s+pattern: nterminal-\*\s+path: indirilen/);
  });
});

/**
 * İlk kurulum: kullanıcı paketi Release sayfasından indirip açabiliyor mu.
 *
 * ÖLÇÜLEN (macOS 27, aynı kodun karantinalı iki kopyası): yalnızca bağlayıcı
 * imzalı paket "hasarlı, Çöp'e taşıyın" diyor ve Sistem Ayarları'nda "Yine de
 * Aç" HİÇ çıkmıyor — açmanın tek yolu Terminal'de `xattr`, sıradan kullanıcıdan
 * beklenemeyecek bir şey. Ad-hoc mühürlü pakette uyarı "Apple doğrulayamadı"ya
 * dönüyor ve "Yine de Aç" çıkıyor. İki paketi ayıran TEK şey iş akışındaki
 * `APPLE_SIGNING_IDENTITY: "-"`; satır kaybolursa belirti yalnızca bir sonraki
 * yayını indiren kullanıcının ekranında görülür.
 */
describe("ilk kurulum", () => {
  const paket = WORKFLOW.slice(WORKFLOW.indexOf("\n  paket:"), WORKFLOW.indexOf("\n  yayin:"));
  const yayin = WORKFLOW.slice(WORKFLOW.indexOf("\n  yayin:"));
  const README = read("README.md");

  /** GitHub'ın başlık bağlantısı: küçük harf, noktalama yok, boşluk → tire. */
  const slug = (heading: string) =>
    heading
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "")
      .replace(/ /g, "-");
  const anchors = new Set(
    [...README.matchAll(/^#{1,6} (.+)$/gm)].map((m) => slug(m[1])),
  );

  it("macOS paketi ad-hoc mühürleniyor", () => {
    expect(paket).toMatch(/\n\s+APPLE_SIGNING_IDENTITY: "-"\n/);
  });

  it("Release notu README'nin kurulum bölümüne gidiyor ve bölüm var", () => {
    const link = yayin.match(/--notes "[^"]*#([^"\s]+)"/)?.[1];
    expect(link, "Release notunda kurulum bağlantısı yok").toBe("paketi-indirip-kurmak");
    expect(anchors.has(link!), `README'de #${link} başlığı yok`).toBe(true);
  });

  it("kurulum bölümü Terminal komutu istemiyor", () => {
    // Bölüm sıradan kullanıcı için: "Yine de Aç" ve SmartScreen yolu tıklamayla.
    const start = README.indexOf("## Paketi indirip kurmak");
    const section = README.slice(start, README.indexOf("\n## ", start + 1));
    expect(section).toContain("Yine de Aç");
    expect(section).not.toContain("xattr");
    expect(section).not.toContain("```");
  });

  it("README'deki kurulum bağlantıları başlıklara gidiyor", () => {
    for (const target of ["paketi-indirip-kurmak", "macos-ilk-açılış"]) {
      expect(README, `#${target} bağlantısı kullanılmıyor`).toContain(`](#${target})`);
      expect(anchors.has(target), `#${target} başlığı yok`).toBe(true);
    }
  });
});

describe("release-files.mjs", () => {
  let dir = "";

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = "";
  });

  /** Actions'ın indirdiği klasör düzeni: platform klasörleri, isteğe bağlı imzalar. */
  function artifacts(files: Record<string, string>) {
    dir = mkdtempSync(join(tmpdir(), "nterminal-release-"));
    for (const [path, content] of Object.entries(files)) {
      const full = join(dir, "indirilen", path);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, content);
    }
  }

  function run(tag = "v0.3.0") {
    const result = spawnSync(
      process.execPath,
      [join(ROOT, "scripts/release-files.mjs"), join(dir, "indirilen"), join(dir, "paketler"), tag],
      { encoding: "utf8", env: { ...process.env, GITHUB_REPOSITORY: "NYAYAN/NTerminal" } },
    );
    const out = join(dir, "paketler");
    return {
      code: result.status,
      output: result.stdout + result.stderr,
      files: existsSync(out) ? readdirSync(out).sort() : [],
      manifest: () => JSON.parse(readFileSync(join(out, "latest.json"), "utf8")),
    };
  }

  const PAKETLER = {
    "nsis/N-Terminal_0.3.0_x64-setup.exe": "exe",
    "msi/N-Terminal_0.3.0_x64_en-US.msi": "msi",
    "N-Terminal_0.3.0_aarch64.dmg": "dmg",
  };
  const IMZALI = {
    ...PAKETLER,
    "nsis/N-Terminal_0.3.0_x64-setup.exe.sig": "SIG-NSIS\n",
    "msi/N-Terminal_0.3.0_x64_en-US.msi.sig": "SIG-MSI\n",
    "macos/N-Terminal.app.tar.gz": "tgz",
    "macos/N-Terminal.app.tar.gz.sig": "SIG-APP\n",
  };

  it("klasörleri düzleştiriyor: Release'e yalnızca dosya gidiyor", () => {
    artifacts(PAKETLER);
    const r = run();
    expect(r.code, r.output).toBe(0);
    expect(r.files).toEqual([
      "N-Terminal_0.3.0_aarch64.dmg",
      "N-Terminal_0.3.0_x64-setup.exe",
      "N-Terminal_0.3.0_x64_en-US.msi",
    ]);
  });

  it("imzasız yayında latest.json yok: uygulama yalnızca haber veriyor", () => {
    artifacts(PAKETLER);
    const r = run();
    expect(r.files).not.toContain("latest.json");
    expect(r.output).toContain("TAURI_SIGNING_PRIVATE_KEY");
  });

  it("imzalı yayında latest.json kurucu türüne göre adresleri ve imzaları taşıyor", () => {
    artifacts(IMZALI);
    const r = run();
    expect(r.code, r.output).toBe(0);
    expect(r.files).toContain("latest.json");
    expect(r.files).toContain("N-Terminal_0.3.0_aarch64.app.tar.gz");

    const m = r.manifest();
    expect(m.version).toBe("0.3.0");
    expect(Number.isNaN(Date.parse(m.pub_date))).toBe(false);
    const base = "https://github.com/NYAYAN/NTerminal/releases/download/v0.3.0";
    expect(m.platforms).toEqual({
      "windows-x86_64-nsis": { signature: "SIG-NSIS", url: `${base}/N-Terminal_0.3.0_x64-setup.exe` },
      "windows-x86_64-msi": { signature: "SIG-MSI", url: `${base}/N-Terminal_0.3.0_x64_en-US.msi` },
      "darwin-aarch64-app": { signature: "SIG-APP", url: `${base}/N-Terminal_0.3.0_aarch64.app.tar.gz` },
    });
  });

  it("kurucu türü olmayan genel anahtar YOK", () => {
    // `windows-x86_64` gibi bir anahtar, türü bilinmeyen kopyayı (kurulumsuz
    // exe) NSIS ile "güncelleyip" kullanıcı klasörüne ikinci bir kurulum
    // yapardı. Eklenti önce `…-nsis`/`…-msi`yi, sonra genel anahtarı arıyor.
    artifacts(IMZALI);
    const keys = Object.keys(run().manifest().platforms);
    expect(keys.every((k) => /-(nsis|msi|app)$/.test(k)), keys.join(", ")).toBe(true);
  });

  it("eksik paket yayını durduruyor", () => {
    // Yol kayması (Tauri çıktı klasörünü değiştirdi) sessizce yarım bir
    // Release yayımlamamalı.
    const { ["msi/N-Terminal_0.3.0_x64_en-US.msi"]: _msi, ...eksik } = PAKETLER;
    artifacts(eksik);
    const r = run();
    expect(r.code).toBe(1);
    expect(r.output).toContain("msi paketi yok");
    expect(r.files).toEqual([]);
  });

  it("yarım imza yayını durduruyor", () => {
    // Anahtar tek bir sır; iki platformda birden ya var ya yok. Yarım imza
    // bir platformu sessizce güncellemesiz bırakırdı.
    const { ["msi/N-Terminal_0.3.0_x64_en-US.msi.sig"]: _sig, ...yarim } = IMZALI;
    artifacts(yarim);
    const r = run();
    expect(r.code).toBe(1);
    expect(r.output).toContain("imzasi yok: N-Terminal_0.3.0_x64_en-US.msi");
  });
});
