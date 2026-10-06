import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Arayüzün çağırdığı her Rust komutu var ve argüman adları tutuyor.
 *
 * ÖLÇÜLEN RİSK: `invoke("git_stage", { path, files })` bir DİZE ile bir nesne
 * anahtarı; derleyici ikisini de denetlemiyor. Komut adında bir yazım hatası ya
 * da `generate_handler!` listesine eklenmemiş bir komut testlerin hiçbirinde
 * görünmüyor (arayüz testleri IPC'yi taklit ediyor, Rust testleri arayüzü
 * bilmiyor) — tek belirtisi gerçek uygulamada "tıklıyorum, bir şey olmuyor".
 * Argüman adı da aynı sınıftan: Tauri camelCase'i snake_case'e çeviriyor ve
 * eşleşmeyen bir ad Rust'ta "missing required key" olarak düşüyor.
 *
 * Bu test ikisini de kaynaktan okuyor: `ipc.ts`deki her çağrı için (1) komut
 * `generate_handler!` içinde kayıtlı mı, (2) argüman anahtarları Rust işlevinin
 * parametreleriyle (camelCase → snake_case) aynı mı.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/** Yorumları atar: yorum içindeki `invoke("...")` örnekleri çağrı sayılmasın. */
const strip = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const IPC = strip(read("src/lib/ipc.ts"));
const RUST = read("src-tauri/src/lib.rs");

interface Call {
  command: string;
  args: string[];
}

/** `invoke<T>("komut", { a, b })` çağrıları. */
function calls(src: string): Call[] {
  const out: Call[] = [];
  const re = /invoke(?:<[^(]*?>)?\(\s*"([a-z_]+)"\s*(?:,\s*\{([^}]*)\})?\s*\)/g;
  for (const m of src.matchAll(re)) {
    const args = (m[2] ?? "")
      .split(",")
      .map((a) => a.trim().split(":")[0].trim())
      .filter(Boolean);
    out.push({ command: m[1], args });
  }
  return out;
}

/** `generate_handler![ ... ]` içindeki komut adları. */
function registered(src: string): Set<string> {
  const m = src.match(/generate_handler!\[([\s\S]*?)\]/);
  if (!m) throw new Error("generate_handler! bulunamadı");
  return new Set(
    m[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/** Üst düzeyde virgülle böler: `HashMap<String, String>` tek parça. */
function splitTop(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of list) {
    if ("<([".includes(ch)) depth += 1;
    if (">)]".includes(ch)) depth -= 1;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

/** Komutun Rust parametre adları; Tauri'nin kendi enjekte ettikleri hariç. */
function rustParams(src: string, command: string): string[] | null {
  const re = new RegExp(`#\\[tauri::command[^\\]]*\\][\\s\\S]*?fn\\s+${command}\\s*\\(([^)]*)\\)`);
  const m = src.match(re);
  if (!m) return null;
  return splitTop(m[1])
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => !/:\s*(?:tauri::)?(State|AppHandle|Window|WebviewWindow)\b/.test(p))
    .map((p) => p.split(":")[0].trim());
}

const snake = (s: string) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

describe("IPC sözleşmesi", () => {
  const cagrilar = calls(IPC);
  const kayitli = registered(RUST);

  it("kaynaklar okunabildi", () => {
    // Boş okuma aşağıdaki testleri anlamsızca geçirirdi.
    expect(cagrilar.length).toBeGreaterThan(40);
    expect(kayitli.size).toBeGreaterThan(40);
  });

  it("git komutları taranıyor (yeni komutlar sözleşmenin içinde)", () => {
    const adlar = cagrilar.map((c) => c.command);
    for (const ad of ["git_stage", "git_unstage", "git_commit", "git_push", "git_diff"]) {
      expect(adlar, `${ad} taranmıyor`).toContain(ad);
    }
  });

  it("arayüzün çağırdığı her komut generate_handler! içinde kayıtlı", () => {
    const eksik = cagrilar.filter((c) => !kayitli.has(c.command)).map((c) => c.command);
    expect(eksik, `Rust'ta kayıtlı olmayan komut:\n${eksik.join("\n")}`).toEqual([]);
  });

  it("her kayıtlı komutun #[tauri::command] işlevi var", () => {
    const yok = [...kayitli].filter((ad) => rustParams(RUST, ad) === null);
    expect(yok, `işlevi bulunamayan komut:\n${yok.join("\n")}`).toEqual([]);
  });

  it("argüman adları Rust parametreleriyle aynı (camelCase → snake_case)", () => {
    const uyusmayan: string[] = [];
    for (const c of cagrilar) {
      const rust = rustParams(RUST, c.command);
      if (!rust) continue;
      const beklenen = [...rust].sort();
      const gelen = c.args.map(snake).sort();
      if (JSON.stringify(beklenen) !== JSON.stringify(gelen)) {
        uyusmayan.push(`${c.command}: arayüz {${gelen.join(", ")}} ≠ Rust (${beklenen.join(", ")})`);
      }
    }
    expect(uyusmayan, `argüman adları tutmuyor:\n${uyusmayan.join("\n")}`).toEqual([]);
  });

  /*
   * Git süreci başlatan komut ANA İŞ PARÇACIĞINDA koşmamalı.
   *
   * Tauri'de `async` olmayan komut ana iş parçacığında koşuyor ve o sürede
   * pencere cevap vermiyor. BİLDİRİLEN: "Değişikliklerin hepsini seç yapınca
   * ufak bir takılma oluyor." ÖLÇÜLDÜ (gerçek uygulama, 30 dosya): liste
   * tazelenirken `git_info` ana iş parçacığını 21-66 ms tutuyordu; `async` +
   * `spawn_blocking` ile 1-5 ms. Kural kaynaktan: `git::` çağıran her komut
   * `async`. İstisna yalnızca süreç BAŞLATMAYAN `git_fingerprint` (iki dosya
   * okuması, 5 sn'de bir yoklamada).
   */
  it("git süreci başlatan komutlar ana iş parçacığında koşmuyor (async)", () => {
    const SUREC_YOK = new Set(["git_fingerprint"]);
    const komutlar = [...RUST.matchAll(/#\[tauri::command[^\]]*\]\s*(async\s+)?fn\s+([a-z_0-9]+)\s*\(/g)].map((m) => {
      const bas = m.index!;
      const son = RUST.indexOf("\n}\n", bas);
      return { ad: m[2], async: !!m[1], govde: RUST.slice(bas, son) };
    });
    const gitli = komutlar.filter((k) => /\bgit::/.test(k.govde));
    // Boş tarama testi anlamsızca geçirirdi.
    expect(gitli.map((k) => k.ad)).toEqual(expect.arrayContaining(["git_info", "git_stage", "git_diff"]));
    const esZamanli = gitli.filter((k) => !k.async && !SUREC_YOK.has(k.ad)).map((k) => k.ad);
    expect(esZamanli, `ana iş parçacığında git süreci başlatan komut:\n${esZamanli.join("\n")}`).toEqual([]);
  });

  describe("tarayıcı gerçekten çalışıyor", () => {
    // Yukarıdaki testler "hiçbir şey bulunamadı" ile de geçer; bilinen örneklerle
    // ayrıştırıcının işlediğini doğruluyoruz.
    it("çağrıyı ve argümanlarını ayıklıyor", () => {
      const ornek = `
        a: (p: string) => invoke<void>("git_stage", { path, files }),
        b: () => invoke<Bootstrap>("app_bootstrap"),
        c: (t: string) => invoke<string | null>("scrollback_load", { tabId }),
      `;
      expect(calls(ornek)).toEqual([
        { command: "git_stage", args: ["path", "files"] },
        { command: "app_bootstrap", args: [] },
        { command: "scrollback_load", args: ["tabId"] },
      ]);
    });

    it("yorumdaki çağrı örneğini saymıyor", () => {
      const ornek = strip(`// invoke("hayali", { x })\nreal: invoke("gercek")`);
      expect(calls(ornek).map((c) => c.command)).toEqual(["gercek"]);
    });

    it("Rust parametrelerini ayıklıyor, enjekte edilenleri atıyor", () => {
      const rust = `
        #[tauri::command]
        fn git_stage(path: String, files: Vec<String>) -> CmdResult<()> { Ok(()) }
        #[tauri::command]
        fn settings_save(state: State<AppState>, settings: Settings) -> CmdResult<()> { Ok(()) }
        #[tauri::command]
        fn tray_labels(app: tauri::AppHandle, show: String, quit: String) -> CmdResult<()> { Ok(()) }
      `;
      expect(rustParams(rust, "git_stage")).toEqual(["path", "files"]);
      expect(rustParams(rust, "settings_save")).toEqual(["settings"]);
      expect(rustParams(rust, "tray_labels")).toEqual(["show", "quit"]);
      expect(rustParams(rust, "yok")).toBe(null);
    });

    it("üst düzey virgülü jeneriklerin içinden ayırıyor", () => {
      expect(splitTop("a: HashMap<String, String>, b: u32")).toEqual([
        "a: HashMap<String, String>",
        " b: u32",
      ]);
    });

    it("uyumsuz argüman adını YAKALIYOR", () => {
      // Sözleşme testinin kendisi bir uyuşmazlığı görebiliyor mu?
      const rust = `#[tauri::command]\nfn git_stage(path: String, files: Vec<String>) -> CmdResult<()> {}`;
      const bozuk = calls(`x: invoke<void>("git_stage", { path, file })`)[0];
      const rustAdlar = rustParams(rust, "git_stage")!.sort();
      expect(bozuk.args.map(snake).sort()).not.toEqual(rustAdlar);
    });
  });
});
