#!/usr/bin/env node
// NTerminal - platformdan bagimsiz betik dagitici.
//
// `npm start`, `npm run bundle` ve `npm test` iki platformda da AYNI komut
// olmali. Windows tarafinda kazanilmis bir bilgi var (bkz. win-env.ps1: bu
// makinede iki Visual Studio kurulu ve rustc calismayan toolset'i seciyor);
// onu kaybetmemek icin Windows'ta hala PowerShell betikleri kosuyor.
//
// macOS ve Linux'ta ortam kurulumu gerekmiyor: xcrun / cc zaten PATH'te.
// Orada komutlar dogrudan cagriliyor.

import { spawn, spawnSync } from "node:child_process";
import { closeSync, existsSync, openSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const WINDOWS = process.platform === "win32";

const TASKS = {
  dev: { ps: "dev.ps1" },
  build: { ps: "build.ps1" },
  test: { ps: "test.ps1" },
};

const task = process.argv[2];
const rest = process.argv.slice(3);

if (!task || !(task in TASKS)) {
  console.error(`kullanim: node scripts/run.mjs <${Object.keys(TASKS).join("|")}> [...]`);
  process.exit(2);
}

/** Komutu kosar, cikis kodunu doner. Kabuk ARAYA GIRMIYOR (shell: false). */
function run(command, args, options = {}) {
  const res = spawnSync(command, args, {
    cwd: ROOT,
    stdio: "inherit",
    // Windows'ta `npx` bir .cmd; shell olmadan bulunamiyor.
    shell: WINDOWS,
    ...options,
  });
  if (res.error) {
    console.error(`calistirilamadi: ${command} — ${res.error.message}`);
    return 1;
  }
  return res.status ?? 1;
}

function ensureDeps() {
  if (existsSync(join(ROOT, "node_modules"))) return 0;
  console.log("node_modules yok, npm install kosuluyor...");
  return run("npm", ["install", "--no-audit", "--no-fund"]);
}

/**
 * Uygulama calisiyor mu?
 *
 * Cargo, baglama adiminda eski ikiliyi SILIYOR; calisan bir surec onu
 * kilitledigi icin `Access is denied (os error 5)` ile dusuyor. Sorun surenin
 * neresinde ciktigi: bu hata ON YUZ DERLENDIKTEN sonra, iki dakika sonra
 * geliyor ve iletisi sebebi soylemiyor.
 *
 * Burada bastan bakiyoruz. Yontem: ikiliyi YAZMA icin acmayi denemek. Windows
 * calisan bir exe'yi yazmaya kapatiyor (EBUSY/EPERM); dosya yoksa ya da
 * acilabiliyorsa sorun yok.
 */
function kilitliIkili() {
  const targetDir = process.env.CARGO_TARGET_DIR
    ? resolve(process.env.CARGO_TARGET_DIR)
    : join(ROOT, "src-tauri", "target");
  const profile = task === "build" ? "release" : "debug";
  const ad = WINDOWS ? "nterminal.exe" : "nterminal";

  // IKI dosya da denetleniyor. Cargo ikiliyi once `deps/` altinda uretiyor,
  // sonra profil klasorune kopyaliyor; calisan surec `deps/` altindakini
  // kilitliyor. Yalnizca disttakine bakmak yaniltiyor - o silinmis olabilir
  // ama derleme yine `LNK1104 ... deps\nterminal.exe` ile duser.
  for (const exe of [join(targetDir, profile, ad), join(targetDir, profile, "deps", ad)]) {
    if (!existsSync(exe)) continue;
    try {
      closeSync(openSync(exe, "r+"));
    } catch (err) {
      // Yalnizca "mesgul/izin yok" kilit demek; baska hatalar bizi
      // ilgilendirmiyor ve derlemeyi durdurmamali.
      const code = /** @type {{ code?: string }} */ (err).code;
      if (code === "EBUSY" || code === "EPERM" || code === "EACCES") return exe;
    }
  }
  return null;
}

const kilitli = kilitliIkili();
if (kilitli) {
  console.error("");
  console.error("NTerminal su anda calisiyor; derleme onun uzerine yazamaz.");
  console.error(`  kilitli dosya: ${kilitli}`);
  console.error("");
  console.error("Uygulamayi kapatip yeniden deneyin.");
  console.error("Acik kalmasi gerekiyorsa ayri bir hedef dizine derleyebilirsiniz:");
  console.error(
    WINDOWS
      // Ters eğik çizgi kaçışlı: kaynakta `\\`, çıktıda tek `\`. Tek `\n`
      // yazmak burada satır sonu üretiyordu.
      ? '  set "CARGO_TARGET_DIR=%TEMP%\\nterm-build" && npm run bundle'
      : "  CARGO_TARGET_DIR=/tmp/nterm-build npm run bundle",
  );
  console.error("");
  process.exit(1);
}

// --------------------------------------------------------------- Windows

if (WINDOWS) {
  const script = join(HERE, TASKS[task].ps);
  const child = spawn(
    "powershell",
    ["-ExecutionPolicy", "Bypass", "-NoProfile", "-File", script, ...rest],
    { cwd: ROOT, stdio: "inherit" },
  );
  child.on("exit", (code) => process.exit(code ?? 1));
  child.on("error", (err) => {
    console.error(`powershell calistirilamadi: ${err.message}`);
    process.exit(1);
  });
} else {
  // ------------------------------------------------------- macOS / Linux
  process.exit(runPosix());
}

function runPosix() {
  if (task === "dev") {
    const deps = ensureDeps();
    if (deps !== 0) return deps;
    return run("npx", ["tauri", "dev", ...rest]);
  }

  if (task === "build") {
    const deps = ensureDeps();
    if (deps !== 0) return deps;
    const code = run("npx", ["tauri", "build", ...rest]);
    if (code === 0) listBundles();
    return code;
  }

  // test: uc asama, hepsi kossun ki tek kosuda butun sorunlar gorulsun.
  let failed = 0;

  console.log("\n== TypeScript tip denetimi ==");
  if (run("npx", ["tsc", "--noEmit"]) !== 0) failed = 1;

  console.log("\n== Arayuz testleri (vitest) ==");
  if (run("npx", ["vitest", "run"]) !== 0) failed = 1;

  console.log("\n== Rust testleri ==");
  // Entegrasyon testleri gercek kabuk sureci baslattigi icin sirali kosuyor.
  if (run("cargo", ["test", "--", "--test-threads=1"], { cwd: join(ROOT, "src-tauri") }) !== 0) {
    failed = 1;
  }

  console.log("");
  console.log(failed === 0 ? "Tum testler gecti." : "Basarisiz testler var.");
  return failed;
}

/** Uretilen .app / .dmg dosyalarini yazar. */
function listBundles() {
  const dir = join(ROOT, "src-tauri", "target", "release", "bundle");
  if (!existsSync(dir)) return;
  console.log("\nYapi tamamlandi:");
  const walk = (path, depth = 0) => {
    // .app bir KLASOR; icine inmiyoruz, adini yazip geciyoruz.
    for (const name of readdirSync(path)) {
      const full = join(path, name);
      if (name.endsWith(".app") || name.endsWith(".dmg")) {
        console.log(`  ${full}`);
        continue;
      }
      if (depth < 3 && statSync(full).isDirectory()) walk(full, depth + 1);
    }
  };
  walk(dir);
}
