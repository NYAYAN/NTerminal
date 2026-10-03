import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Yayın etiketi ve uygulamanın sürümü.
 *
 * Yayın etiketini artık GitHub Actions oluşturuyor (`build.yml` › `yayin`):
 * main'deki `package.json` sürümünün `v<sürüm>` etiketi yoksa, testler ve
 * paketler geçtikten sonra etiket o commit'te açılıyor ve paketler ona
 * bağlanıyor. ÖLÇÜLEN SEBEP: eskiden etiket elle itiliyordu ve unutuluyordu —
 * 0.2.1 numarası 2 Eylül'de yazıldı, bir ay etiketsiz kaldı, Release çıkmadı.
 *
 * Sürüm ÜÇ dosyada ve aynı olmak zorunda. Etiket `package.json`dan türüyor,
 * uygulama ise kendi sürümünü Cargo'dan okuyup (`CARGO_PKG_VERSION`) son
 * Release'in etiketiyle karşılaştırıyor (`update.rs`). Biri ayrışırsa paket
 * kendini hep eski sanır ve her açılışta "yeni sürüm var" der; kurucunun adı
 * da (`tauri.conf.json`) başka bir sürüm yazar. Bu test arayüz işinde koşuyor,
 * yani CI'da yayından ÖNCE düşüyor.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("yayın sürümü", () => {
  const pkg = (JSON.parse(read("package.json")) as { version: string }).version;

  it("sürüm Cargo.toml, package.json, package-lock.json ve tauri.conf.json'da aynı", () => {
    const cargo = read("src-tauri/Cargo.toml").match(/^version\s*=\s*"([^"]+)"/m)?.[1];
    const tauri = (JSON.parse(read("src-tauri/tauri.conf.json")) as { version: string }).version;
    const lock = JSON.parse(read("package-lock.json")) as {
      version: string;
      packages: Record<string, { version?: string }>;
    };
    expect({ cargo, tauri, lock: lock.version, lockRoot: lock.packages[""]?.version }).toEqual({
      cargo: pkg,
      tauri: pkg,
      lock: pkg,
      lockRoot: pkg,
    });
  });

  it("iş akışı etiketi main'de package.json sürümünden kuruyor", () => {
    const wf = read(".github/workflows/build.yml");
    const at = wf.indexOf("\n  yayin:");
    expect(at, "yayın işi bulunamadı").toBeGreaterThan(-1);
    const job = wf.slice(at);
    expect(job, "yayın main'de koşmuyor").toContain("github.ref == 'refs/heads/main'");
    expect(job, "etiket package.json'dan türemiyor").toContain(`require('./package.json').version`);
    expect(job, "etiket biçimi değişmiş").toContain('etiket="v$surum"');
    // Etiket yoksa Release onu bu commit'te oluşturmalı; `--verify-tag` bunu
    // engellerdi (etiketin önceden var olmasını istiyor).
    expect(job).toContain('--target "$GITHUB_SHA"');
    expect(job).not.toContain("--verify-tag");
  });

  it("uygulama etiketin baştaki v'sini atıyor", () => {
    // `v0.2.1` etiketi ile `0.2.1` sürümü aynı şey sayılmalı; yoksa kurulu en
    // yeni sürüm bile kendini eski sanır.
    expect(read("src-tauri/src/update.rs")).toContain("trim_start_matches(['v', 'V'])");
  });
});
