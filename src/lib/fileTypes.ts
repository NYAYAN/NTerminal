/**
 * Dosyanın TÜRÜNE göre simgesi: kısa bir etiket ve türün rengi.
 *
 * İSTEK: "her dosyanın türüne göre iconları göstermiyorsak göstermek doğru
 * olur." Önceki simgeler yalnızca üç ayrım yapıyordu (görsel, kod, belge;
 * bkz. `fileKind`): `App.tsx`, `main.rs` ve `package.json` aynı simgeyle
 * duruyordu. Burada her yaygın tür kendi etiketiyle (TS, RS, {}) ve
 * dilin bilinen renginde (TypeScript mavisi, Rust turuncusu) — editörlerin
 * simge temalarındaki gibi.
 *
 * Etiket SVG değil, harf: onlarca tür için onlarca çizim yerine tek bileşen
 * (`FileKindIcon`). Yalnızca Latin harfleri ve ASCII işaretleri kullanılıyor;
 * `⌄` gibi özel karakterlerin yazı tipine göre boyu ve hizası değişiyordu
 * (gerekçe `Icons.tsx` başında), harflerinki değişmiyor.
 *
 * Bilinmeyen tür etiketsiz: simgesi `fileKind`in genel kod/belge çizimi.
 * Görseller de burada değil — onların resim simgesi zaten türü söylüyor.
 */
export interface FileType {
  /** Simgedeki kısa ad: en çok üç karakter. */
  label: string;
  /** Türün rengi; metne karıştırılarak çiziliyor (koyu ve açık temada okunsun). */
  color: string;
}

const t = (label: string, color: string): FileType => ({ label, color });

const TS = t("TS", "#3178c6");
const JS = t("JS", "#e8c547");
const JSON_ = t("{}", "#d4b13f");
const MD = t("MD", "#519aba");
const SH = t("SH", "#89e051");
const PS = t("PS", "#5391fe");
const YML = t("YML", "#cb4b4b");
const XML = t("XML", "#3e8ed0");
const C = t("C", "#7d97b8");
const CPP = t("C++", "#f34b7d");
const H = t("H", "#a074c4");
const LOCK = t("LCK", "#8b949e");
const GIT = t("GIT", "#f05032");
const ENV = t("ENV", "#d8b13a");

/** Uzantıya göre (küçük harf, noktasız). */
const BY_EXT: Record<string, FileType> = {
  ts: TS,
  mts: TS,
  cts: TS,
  tsx: t("TSX", "#3178c6"),
  js: JS,
  mjs: JS,
  cjs: JS,
  jsx: t("JSX", "#e8c547"),
  json: JSON_,
  jsonc: JSON_,
  json5: JSON_,
  md: MD,
  mdx: MD,
  markdown: MD,
  rs: t("RS", "#dea584"),
  go: t("GO", "#00add8"),
  py: t("PY", "#3572a5"),
  rb: t("RB", "#cc342d"),
  php: t("PHP", "#777bb4"),
  java: t("JV", "#b07219"),
  kt: t("KT", "#a97bff"),
  kts: t("KT", "#a97bff"),
  swift: t("SW", "#f05138"),
  c: C,
  h: H,
  hpp: H,
  cc: CPP,
  cpp: CPP,
  cxx: CPP,
  cs: t("C#", "#178600"),
  m: t("OC", "#438eff"),
  mm: t("OC", "#438eff"),
  lua: t("LUA", "#6a8fdb"),
  sql: t("SQL", "#e38c00"),
  sh: SH,
  bash: SH,
  zsh: SH,
  fish: SH,
  ps1: PS,
  psm1: PS,
  psd1: PS,
  ps1xml: PS,
  bat: t("BAT", "#77b300"),
  cmd: t("CMD", "#77b300"),
  html: t("<>", "#e34c26"),
  htm: t("<>", "#e34c26"),
  css: t("#", "#7a5ccf"),
  scss: t("S", "#c6538c"),
  sass: t("S", "#c6538c"),
  less: t("L", "#4a74c9"),
  vue: t("V", "#41b883"),
  svelte: t("SV", "#ff3e00"),
  yml: YML,
  yaml: YML,
  toml: t("TML", "#9c4221"),
  ini: t("INI", "#8b949e"),
  cfg: t("CFG", "#8b949e"),
  conf: t("CFG", "#8b949e"),
  xml: XML,
  plist: XML,
  gradle: t("GR", "#4a9fb5"),
  lock: LOCK,
  log: t("LOG", "#8b949e"),
  csv: t("CSV", "#3fb950"),
  tsv: t("TSV", "#3fb950"),
  pdf: t("PDF", "#e5252a"),
  zip: t("ZIP", "#b5a642"),
  gz: t("ZIP", "#b5a642"),
  tgz: t("ZIP", "#b5a642"),
  tar: t("ZIP", "#b5a642"),
  "7z": t("ZIP", "#b5a642"),
  ttf: t("Aa", "#8b949e"),
  otf: t("Aa", "#8b949e"),
  woff: t("Aa", "#8b949e"),
  woff2: t("Aa", "#8b949e"),
  wasm: t("WA", "#654ff0"),
  diff: t("+-", "#3fb950"),
  patch: t("+-", "#3fb950"),
};

/** Tam ada göre (küçük harf): uzantısı ya yok ya da türünü söylemiyor. */
const BY_NAME: Record<string, FileType> = {
  dockerfile: t("DK", "#2496ed"),
  makefile: t("MK", "#427819"),
  ".gitignore": GIT,
  ".gitattributes": GIT,
  ".gitmodules": GIT,
  ".gitkeep": GIT,
  ".npmrc": t("NPM", "#cb3837"),
  ".editorconfig": t("EC", "#8b949e"),
  ".prettierrc": t("PR", "#c596c7"),
  "package-lock.json": LOCK,
  "pnpm-lock.yaml": LOCK,
  "yarn.lock": LOCK,
  "cargo.lock": LOCK,
};

/** Yolun son parçası. */
function baseName(path: string): string {
  return path.slice(Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1);
}

/** Dosyanın türü; tanınmıyorsa `null` (genel simge çiziliyor). */
export function fileType(path: string): FileType | null {
  const name = baseName(path).toLowerCase();
  const byName = BY_NAME[name];
  if (byName) return byName;
  // `.env`, `.env.local`, `.env.production`: hepsi ortam dosyası.
  if (name === ".env" || name.startsWith(".env.")) return ENV;
  if (name.startsWith("dockerfile.")) return BY_NAME.dockerfile;
  const dot = name.lastIndexOf(".");
  // `.bashrc` gibi noktayla başlayan adın "uzantısı" yok.
  if (dot <= 0) return null;
  return BY_EXT[name.slice(dot + 1)] ?? null;
}
