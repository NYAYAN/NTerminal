import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { OPEN_FILE_EVENT, SETTINGS_EVENT } from "./ipc";

/**
 * Fark penceresinin Rust tarafı ve yapılandırmayla bağları.
 *
 * Hepsi derleyicinin ve arayüz testlerinin GÖREMEDİĞİ türden: bir olay adı iki
 * tarafta ayrışırsa olay sessizce kaybolur; izin listesinde pencere yoksa her
 * IPC çağrısı reddedilir ve pencere "Yükleniyor…"da kalır; Rust'taki pencere
 * kapanış kancası etiketine bakmazsa bir FARK penceresini kapatmak bütün
 * sekmelerin kabuklarını öldürür — en kötüsü bu ve gerçek uygulamada
 * denenmeden görülmez.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const RUST = read("src-tauri/src/lib.rs");

describe("fark penceresi kaynak kuralları", () => {
  it("olay adları Rust'taki sabitlerle aynı", () => {
    expect(RUST).toContain(`const OPEN_FILE_EVENT: &str = "${OPEN_FILE_EVENT}";`);
    expect(RUST).toContain(`pub const SETTINGS_EVENT: &str = "${SETTINGS_EVENT}";`);
  });

  it("fark pencereleri izin listesinde (diff-<n> etiketi)", () => {
    const caps = JSON.parse(read("src-tauri/capabilities/default.json")) as { windows: string[] };
    const glob = (pattern: string, label: string) =>
      new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`).test(label);
    expect(caps.windows.some((w) => glob(w, "diff-1")), "diff-* izinli değil").toBe(true);
    expect(RUST, "pencere etiketi değişmiş").toContain('"diff-{}"');
  });

  it("pencere yıkım kancası YALNIZCA ana pencerede kabukları öldürüyor", () => {
    // ÖLÇÜLEN RİSK: kanca her pencerenin `Destroyed` olayında koşuyor. Etiket
    // denetimi `kill_all`dan ÖNCE olmalı.
    const at = RUST.indexOf("tauri::WindowEvent::Destroyed = event");
    expect(at, "yıkım kancası bulunamadı").toBeGreaterThan(-1);
    const body = RUST.slice(at, at + 1200);
    const guard = body.indexOf('window.label() != "main"');
    const kill = body.indexOf("kill_all()");
    expect(guard, "etiket denetimi yok").toBeGreaterThan(-1);
    expect(kill).toBeGreaterThan(guard);
  });

  it("fark penceresi ana arayüzün deposunu ve terminal modüllerini yüklemiyor", () => {
    // `main.tsx` fark penceresini DİNAMİK içe aktarıyor ki depo, kabuk
    // başlatma ve xterm o pencerede hiç koşmasın. Bir yardımcıyı yanlış
    // dosyadan almak (`gitShared` depoyu içe aktarıyor) bu ayrımı sessizce
    // bozardı; içe aktarma ağacı burada yürünüyor.
    const seen = new Set<string>();
    const queue = [resolve("src/components/DiffWindow.tsx")];
    const bad: string[] = [];
    while (queue.length > 0) {
      const file = queue.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/(?:import|export)[^"']*?from\s+["'](\.[^"']+)["']/g)) {
        const base = resolve(dirname(file), m[1]);
        const target = [`${base}.ts`, `${base}.tsx`, base].find((p) => existsSync(p) && !p.endsWith(".css"));
        if (!target) continue;
        if (/store[\\/]useStore|[\\/]terminal[\\/]/.test(target)) bad.push(`${file} → ${target}`);
        queue.push(target);
      }
    }
    expect(seen.size, "ağaç yürünemedi").toBeGreaterThan(5);
    expect(bad).toEqual([]);
  });
});
