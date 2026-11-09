import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * CI'daki eylemler etikete değil COMMIT'e sabitli.
 *
 * `uses: actions/checkout@v7` ya da `dtolnay/rust-toolchain@stable` hareketli
 * bir işaretçi: sahibi (ya da hesabını ele geçiren biri) onu sonradan başka bir
 * koda çevirebilir ve bir sonraki koşu o kodu çalıştırır. Paket işi güncelleme
 * imza anahtarını kullanıyor (`TAURI_SIGNING_PRIVATE_KEY`); orada çalışan
 * yabancı kod derlemeyi değiştirip İMZALI bir güncelleme olarak dağıtabilir.
 * 40 haneli SHA değişmez.
 *
 * Sürüm yorumu (`# v7.0.1`) da şart: Dependabot SHA'yı ancak yanındaki sürümden
 * tanıyıp güncelliyor; yorumsuz bir SHA sonsuza kadar eski kalır.
 */
const DIR = join(process.cwd(), ".github/workflows");

function uses(): { file: string; line: number; ref: string; comment: string }[] {
  const out = [];
  for (const file of readdirSync(DIR).filter((f) => /\.ya?ml$/.test(f))) {
    const lines = readFileSync(join(DIR, file), "utf8").split(/\r?\n/);
    for (const [i, text] of lines.entries()) {
      const m = /^\s*(?:-\s*)?uses:\s*(\S+)\s*(?:#\s*(.*))?$/.exec(text);
      if (m) out.push({ file, line: i + 1, ref: m[1], comment: (m[2] ?? "").trim() });
    }
  }
  return out;
}

describe("CI eylemleri", () => {
  const all = uses();

  it("iş akışlarından eylem okunabildi", () => {
    // Tarama boş dönerse aşağıdaki testler hiçbir şey doğrulamaz.
    expect(all.length).toBeGreaterThanOrEqual(6);
  });

  it("her eylem 40 haneli commit SHA'sına sabitli", () => {
    const bad = all
      // Depodaki kendi eylemleri (`./…`) zaten bu commit'in parçası.
      .filter((u) => !u.ref.startsWith("./"))
      .filter((u) => !/^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/.test(u.ref))
      .map((u) => `${u.file}:${u.line} ${u.ref}`);
    expect(bad, `etikete ya da dala sabitli eylem:\n${bad.join("\n")}`).toEqual([]);
  });

  it("her SHA'nın yanında sürüm yorumu var", () => {
    const bad = all
      .filter((u) => !u.ref.startsWith("./"))
      .filter((u) => u.comment === "")
      .map((u) => `${u.file}:${u.line} ${u.ref}`);
    expect(bad, `sürüm yorumu yok:\n${bad.join("\n")}`).toEqual([]);
  });

  it("commit'e sabitli rust-toolchain araç zincirini açıkça alıyor", () => {
    // `@stable` dalında araç zinciri dalın adından geliyordu; SHA'da o bilgi
    // yok ve eylem `toolchain` girdisi olmadan düşüyor.
    const text = readFileSync(join(DIR, "build.yml"), "utf8");
    const at = text.indexOf("dtolnay/rust-toolchain@");
    expect(at).toBeGreaterThan(-1);
    expect(text.slice(at, at + 300)).toMatch(/with:\s*\n\s*toolchain: stable/);
  });
});
