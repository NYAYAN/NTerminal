#!/usr/bin/env node
// NTerminal - Tauri'nin MSI (WiX) sablonunu kurulu CLI'den cikarip tek
// degisiklikle `src-tauri/wix/main.wxs` dosyasina yazar.
//
// NEDEN URETILIYOR, ELLE YAZILMIYOR: sablon Tauri'nin. Tek satirini
// degistirmek icin butununu projeye almak gerekiyor - `tauri.conf.json`
// yalnizca "sablonun yerine sunu kullan" diyebiliyor. Elle kopyalanmis bir
// sablon Tauri guncellendiginde sessizce eskir: yeni surumun duzeltmeleri MSI'a
// hic girmez. Bu betik sablonu HER ZAMAN kurulu CLI'nin kendisinden aliyor,
// `tauriConfig.test.ts` de kayitli dosyanin CLI'dekiyle ayni kaldigini
// denetliyor.
//
// Degisikligin gerekcesi uretilen dosyanin basinda (`HEADER`).
//
// Kullanim:
//   node scripts/wix-template.mjs           sablonu yeniden uret
//   node scripts/wix-template.mjs --check   kayitli dosya guncel mi (degilse cikis 1)

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "src-tauri", "wix", "main.wxs");

// ASCII: WiX derleyicisi dosyayi bildirim satiri olmadan okuyor; kodlamaya
// bel baglamamak icin yorum da depodaki Rust/PowerShell yorumlari gibi ASCII.
const HEADER = `<!--
  NTerminal: Tauri'nin MSI sablonu, TEK degisiklikle.

  ELLE DUZENLENMIYOR. Kurulu Tauri CLI'nin kendi sablonundan uretiliyor:
      node scripts/wix-template.mjs
  Tauri guncellenince ayni komut yeniden kosuluyor; tauriConfig.test.ts bu
  dosyanin CLI'deki sablondan kaydigini yakaliyor.

  Degisiklik: Baslat menusu kisayolunda Icon="ProductIcon" YOK.

  BILDIRILEN: "uygulamayi kurduktan sonra taskbar uzerinde bir sure sonra
  iconu gidiyor" - dugme duruyor, resmi bosaliyor.

  KOK NEDEN: Windows Installer Icon tablosundaki simgeyi urun koduna bagli bir
  klasore koyuyor (C:\\Windows\\Installer\\{UrunKodu}\\ProductIcon) ve kisayol
  oraya isaret ediyor. Tauri her derlemede yeni bir urun kodu uretiyor;
  guncelleme eski urunu kaldirirken o klasoru siliyor. Kisayoldan gorev
  cubuguna sabitlenen dugme yolu kopyaliyor ve bir sonraki guncellemede
  silinmis bir dosyayi gosteriyor. Simge onbellegi eski resmi bir sure tuttugu
  icin belirti "bir sure sonra" geliyor. Olculdu: sabitlenmis kisayol 16 Eylul
  kurulumunun urun koduna isaret ediyordu, dosya yoktu.

  Simgesiz kisayol hedefin, yani nterminal.exe'nin simgesini gosteriyor; yolu
  guncellemeler boyunca sabit. Masaustu kisayolu ve NSIS kurucusu zaten boyle.
-->
`;

/** Kurulu Tauri CLI'nin yerel ikilisi (paket adi platforma gore degisiyor). */
export function findCliBinary(root = ROOT) {
  const scope = join(root, "node_modules", "@tauri-apps");
  if (!existsSync(scope)) return null;
  for (const name of readdirSync(scope)) {
    if (!name.startsWith("cli-")) continue;
    const dir = join(scope, name);
    const file = readdirSync(dir).find((f) => f.endsWith(".node"));
    if (file) return join(dir, file);
  }
  return null;
}

/** CLI ikilisine gomulu WiX sablonunu cikarir (satir sonlari LF). */
export function extractTemplate(binary) {
  const data = readFileSync(binary);
  const anchor = data.indexOf("ApplicationStartMenuShortcut");
  const start = anchor < 0 ? -1 : data.lastIndexOf("<?if $(sys.BUILDARCH)", anchor);
  const endTag = "</Wix>";
  const end = anchor < 0 ? -1 : data.indexOf(endTag, anchor);
  if (anchor < 0 || start < 0 || end < 0) {
    throw new Error(`WiX sablonu ${binary} icinde bulunamadi; Tauri CLI'nin bicimi degismis olabilir`);
  }
  const text = data.subarray(start, end + endTag.length).toString("utf8");
  if (!text.includes("{{product_name}}") || !text.includes("<Wix ")) {
    throw new Error("Bulunan metin bir WiX sablonuna benzemiyor");
  }
  return text.replace(/\r\n/g, "\n");
}

/** Sablona NTerminal'in degisikligini uygular. */
export function patchTemplate(template) {
  const line = /^[ \t]*Icon="ProductIcon"\n/gm;
  const hits = template.match(line) ?? [];
  // Tam olarak BIR kez: sifirsa Tauri sablonu degistirmis ve duzeltmenin
  // yeri kaymis, birden fazlaysa hangi kisayola dokunulacagi belirsiz.
  if (hits.length !== 1) {
    throw new Error(
      `Baslat menusu kisayolundaki Icon="ProductIcon" satiri ${hits.length} kez bulundu (1 bekleniyordu); sablon degismis`,
    );
  }
  return HEADER + template.replace(line, "") + "\n";
}

function cliVersion() {
  try {
    const pkg = join(ROOT, "node_modules", "@tauri-apps", "cli", "package.json");
    return JSON.parse(readFileSync(pkg, "utf8")).version;
  } catch {
    return "?";
  }
}

function main() {
  const check = process.argv.includes("--check");
  const binary = findCliBinary();
  if (!binary) {
    console.error("Tauri CLI ikilisi bulunamadi (node_modules/@tauri-apps/cli-*). Once npm install.");
    process.exit(2);
  }
  const wanted = patchTemplate(extractTemplate(binary));

  if (check) {
    const current = existsSync(OUT) ? readFileSync(OUT, "utf8").replace(/\r\n/g, "\n") : null;
    if (current === wanted) {
      console.log(`src-tauri/wix/main.wxs guncel (Tauri CLI ${cliVersion()})`);
      return;
    }
    console.error(
      `src-tauri/wix/main.wxs kurulu Tauri CLI ${cliVersion()} sablonundan farkli. ` +
        "Yeniden uret: node scripts/wix-template.mjs",
    );
    process.exit(1);
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, wanted);
  console.log(`yazildi: src-tauri/wix/main.wxs (Tauri CLI ${cliVersion()})`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
