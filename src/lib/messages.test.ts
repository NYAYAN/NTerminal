import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { MESSAGES, type MsgKey } from "./messages";

/**
 * Sözlük hijyeni.
 *
 * İki yönlü bir tehlike var:
 *  - **Kullanılmayan anahtar** — kaldırılan bir metnin çevirisi dosyada kalıyor.
 *    Tek başına zararsız görünüyor ama zamanla sözlük gerçeği yansıtmayı
 *    bırakıyor: iki dili güncellerken artık hangi metnin ekranda olduğu belli
 *    olmuyor. (Bu test yazıldığında `window.confirm` yerine kendi onay
 *    penceremiz geldiği için sekiz anahtar boşta kalmıştı.)
 *  - **Var olmayan anahtar** — `MsgKey` tipi bunu derlemede yakalıyor, o yüzden
 *    burada tekrar test etmiyoruz.
 */
const SRC = join(process.cwd(), "src");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      out.push(...sourceFiles(path));
      continue;
    }
    if (!/\.tsx?$/.test(name)) continue;
    // Sözlüğün kendisi ve testler sayılmıyor: anahtarın "kullanıldığı" yer
    // arayüz olmalı, tanımı ya da testi değil.
    if (name === "messages.ts" || /\.test\.tsx?$/.test(name)) continue;
    out.push(path);
  }
  return out;
}

const HAYSTACK = sourceFiles(SRC)
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");

const KEYS = Object.keys(MESSAGES) as MsgKey[];

/**
 * Anahtar kaynakta geçiyor mu?
 *
 * `.one` / `.other` çiftleri `tp()` ile KÖKÜ üzerinden çağrılıyor
 * (`tp("status.tabs", n)`), tam anahtar hiçbir yerde yazmıyor — kökü aramak
 * gerekiyor.
 */
function isUsed(key: MsgKey): boolean {
  const base = key.replace(/\.(one|other)$/, "");
  return HAYSTACK.includes(`"${key}"`) || HAYSTACK.includes(`"${base}"`);
}

describe("sözlük hijyeni", () => {
  it("kaynak dosyalar taranabildi", () => {
    // Tarama boş dönerse aşağıdaki test her şeyi "kullanılmıyor" sanır ya da
    // (tersine) hiçbir şey doğrulamaz.
    expect(sourceFiles(SRC).length).toBeGreaterThan(20);
    expect(HAYSTACK.length).toBeGreaterThan(50_000);
  });

  it("kullanılmayan anahtar yok", () => {
    const unused = KEYS.filter((key) => !isUsed(key));
    expect(unused, `sözlükte kullanılmayan anahtar:\n${unused.join("\n")}`).toEqual([]);
  });

  it("çoğul kökleri gerçekten tp() ile çağrılıyor", () => {
    // `.one`/`.other` çifti tanımlanmış ama `tp()` yerine `t()` ile tam anahtar
    // çağrılıyorsa çoğul kuralı hiç işlemiyor demektir.
    const bases = [...new Set(KEYS.filter((k) => k.endsWith(".one")).map((k) => k.slice(0, -4)))];
    const bad = bases.filter((base) => !HAYSTACK.includes(`tp("${base}"`));
    expect(bad, `çoğul kökü tp() ile çağrılmıyor:\n${bad.join("\n")}`).toEqual([]);
  });
});
