#!/usr/bin/env node
// NTerminal - Actions'in indirdigi paketlerden GitHub Release'e yuklenecek
// dosyalari hazirlar: duz bir klasor + (imzaliysa) `latest.json`.
//
// NEDEN DUZ KLASOR: Windows isinin paketleri `nsis/` ve `msi/` alt
// klasorlerinde geliyor (upload-artifact birden cok yolu ortak atalarina gore
// sakliyor). Eskiden `gh release create ... paketler/*` bu klasorleri dosya
// sanip yuklemeye calisti, taslak Release'i silip cikti: v0.2.1 hic
// yayimlanmadi, kurulu uygulamalar hicbir sey duymadi. Burada yalnizca DOSYA
// kopyalaniyor ve beklenen her paket yerinde mi denetleniyor.
//
// NEDEN `latest.json`: uygulamanin icinden guncelleme (tauri-plugin-updater)
// bu dosyayi okuyor (`tauri.conf.json` > plugins.updater.endpoints): surum,
// her platform + kurucu turu icin paketin adresi ve imzasi. Imzalar paketle
// birlikte CI'da uretiliyor (`TAURI_SIGNING_PRIVATE_KEY`); imza yoksa dosya
// YAZILMIYOR ve uygulama yalnizca "yeni surum var, indirme sayfasi" diyor.
//
// Anahtarlar YALNIZCA kurucu turuyle (`windows-x86_64-nsis`, `-msi`,
// `darwin-aarch64-app`): turu bilinmeyen kopya (kurulumsuz exe, gelistirme
// ikilisi) genel `windows-x86_64` anahtarina dusup yanlis kurucuyla
// "guncellenmesin" - o anahtar bilerek yok.
//
// Kullanim:
//   node scripts/release-files.mjs <indirilen> <cikis> <etiket>
//   (depo adi GITHUB_REPOSITORY'den; yoksa NYAYAN/NTerminal)

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const [source, out, tag] = process.argv.slice(2);
if (!source || !out || !tag) {
  console.error("kullanim: node scripts/release-files.mjs <indirilen> <cikis> <etiket>");
  process.exit(2);
}
const repo = process.env.GITHUB_REPOSITORY || "NYAYAN/NTerminal";
const version = tag.replace(/^v/i, "");

/** Klasordeki butun dosyalar, alt klasorler dahil. */
function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

/** Paket adindaki mimari -> updater'in adi (`x64` -> `x86_64`). */
function archOf(name) {
  if (/_universal\.dmg$/.test(name)) return ["x86_64", "aarch64"];
  if (/_(aarch64|arm64)[-_.]/.test(name)) return ["aarch64"];
  if (/_(x64|x86_64)[-_.]/.test(name)) return ["x86_64"];
  if (/_x86[-_.]/.test(name)) return ["i686"];
  return null;
}

const files = existsSync(source) ? walk(source) : [];
const pick = (test) => files.filter((f) => test(basename(f)));
const kinds = {
  nsis: pick((n) => n.endsWith("-setup.exe")),
  msi: pick((n) => n.endsWith(".msi")),
  dmg: pick((n) => n.endsWith(".dmg")),
  app: pick((n) => n.endsWith(".app.tar.gz")),
};

const problems = [];
for (const kind of ["nsis", "msi", "dmg"]) {
  if (kinds[kind].length === 0) problems.push(`${kind} paketi yok`);
}
for (const [kind, list] of Object.entries(kinds)) {
  if (list.length > 1) problems.push(`birden cok ${kind} paketi: ${list.map((f) => basename(f)).join(", ")}`);
}

const signatureOf = (file) => (existsSync(`${file}.sig`) ? readFileSync(`${file}.sig`, "utf8").trim() : null);
const updaterFiles = [kinds.nsis[0], kinds.msi[0], kinds.app[0]].filter(Boolean);
const signed = updaterFiles.filter((f) => signatureOf(f));
// Imzanin hepsi ya da hicbiri: anahtar ayni sir, iki platformda ayni anda var
// ya da yok. Yarim imza bir yol kaymasi demek (Tauri cikti klasorunu
// degistirdi) ve sessizce yarim bir latest.json yayimlamak bir platformu
// guncellemesiz birakirdi.
const withUpdater = signed.length > 0;
if (withUpdater) {
  if (!kinds.app[0]) problems.push("imzali paketler var ama macOS guncelleme paketi (.app.tar.gz) yok");
  for (const file of updaterFiles) {
    if (!signatureOf(file)) problems.push(`imzasi yok: ${basename(file)}`);
  }
}

const dmgArch = kinds.dmg[0] ? archOf(basename(kinds.dmg[0])) : null;
if (withUpdater && !dmgArch) problems.push(`macOS mimarisi okunamadi: ${basename(kinds.dmg[0] ?? "")}`);

if (problems.length > 0) {
  for (const p of problems) console.error(`::error::${p}`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
const published = [];
const publish = (file, name = basename(file)) => {
  copyFileSync(file, join(out, name));
  published.push(name);
  return `https://github.com/${repo}/releases/download/${tag}/${encodeURIComponent(name)}`;
};

const nsisUrl = publish(kinds.nsis[0]);
const msiUrl = publish(kinds.msi[0]);
publish(kinds.dmg[0]);

if (withUpdater) {
  // Tauri macOS paketini surumsuz adlandiriyor (`N-Terminal.app.tar.gz`);
  // Release sayfasinda DMG'nin yaninda neyin ne oldugu okunsun.
  const appName = basename(kinds.app[0]).replace(/\.app\.tar\.gz$/, `_${version}_${dmgArch.join("-")}.app.tar.gz`);
  const appUrl = publish(kinds.app[0], appName);

  const platforms = {};
  const entry = (file, url) => ({ signature: signatureOf(file), url });
  for (const arch of archOf(basename(kinds.nsis[0])) ?? ["x86_64"]) {
    platforms[`windows-${arch}-nsis`] = entry(kinds.nsis[0], nsisUrl);
  }
  for (const arch of archOf(basename(kinds.msi[0])) ?? ["x86_64"]) {
    platforms[`windows-${arch}-msi`] = entry(kinds.msi[0], msiUrl);
  }
  for (const arch of dmgArch) {
    platforms[`darwin-${arch}-app`] = entry(kinds.app[0], appUrl);
  }
  const manifest = { version, pub_date: new Date().toISOString(), platforms };
  writeFileSync(join(out, "latest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  published.push("latest.json");
  console.log(`latest.json: ${Object.keys(platforms).join(", ")}`);
} else {
  console.log(
    "::warning::Paketler imzasiz (TAURI_SIGNING_PRIVATE_KEY tanimli degil): latest.json yazilmadi, " +
      "uygulama bu surumu yalnizca haber verecek, kendisi kuramayacak.",
  );
}

console.log(`Release dosyalari (${published.length}): ${published.join(", ")}`);
