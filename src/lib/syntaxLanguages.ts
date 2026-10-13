/**
 * Dosyanın KOD DİLİ: sözdizimi renklendirmesinin hangi grameri kullanacağı.
 *
 * Adlar Shiki'nin dil kimlikleri; gramerler VS Code'un kendi TextMate
 * gramerleri (bkz. `syntax.ts`). Eşleme `fileTypes.ts`teki simge tablosuyla
 * aynı yoldan gidiyor: önce tam ad (`Dockerfile`, `.bashrc`), sonra uzantı.
 *
 * Tanınmayan dosya DÜZ METİN kalıyor. Yanlış bir gramerle boyamak renksiz
 * bırakmaktan kötü: `.conf` gibi her biçimi taşıyabilen uzantılar bu yüzden
 * listede yok.
 *
 * Bu modül ana pencerede yükleniyor ve gramer İÇERMİYOR; gramerler
 * renklendiricinin kendi iş parçacığında (`syntaxGrammars.ts`).
 */

/** Uzantıya göre (küçük harf, noktasız). */
const BY_EXT: Record<string, string> = {
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "tsx",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "jsx",
  json: "json",
  jsonc: "jsonc",
  json5: "json5",
  jsonl: "jsonl",
  md: "markdown",
  markdown: "markdown",
  mdx: "mdx",
  rs: "rust",
  go: "go",
  py: "python",
  pyw: "python",
  pyi: "python",
  rb: "ruby",
  php: "php",
  java: "java",
  kt: "kotlin",
  kts: "kotlin",
  swift: "swift",
  scala: "scala",
  groovy: "groovy",
  gradle: "groovy",
  dart: "dart",
  lua: "lua",
  r: "r",
  pl: "perl",
  pm: "perl",
  ex: "elixir",
  exs: "elixir",
  erl: "erlang",
  hs: "haskell",
  clj: "clojure",
  cljs: "clojure",
  fs: "fsharp",
  fsx: "fsharp",
  vb: "vb",
  zig: "zig",
  jl: "julia",
  c: "c",
  // `.h` C ile açılıyor: başlıkların çoğu iki dilde de geçerli ve C++
  // grameri (yaklaşık 840 KB) C'ninkinin on katı.
  h: "c",
  cc: "cpp",
  cpp: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  hh: "cpp",
  hxx: "cpp",
  ino: "cpp",
  cs: "csharp",
  csx: "csharp",
  m: "objective-c",
  mm: "objective-cpp",
  sql: "sql",
  graphql: "graphql",
  gql: "graphql",
  proto: "proto",
  prisma: "prisma",
  sh: "shellscript",
  bash: "shellscript",
  zsh: "shellscript",
  ksh: "shellscript",
  fish: "fish",
  ps1: "powershell",
  psm1: "powershell",
  psd1: "powershell",
  bat: "bat",
  cmd: "bat",
  html: "html",
  htm: "html",
  xhtml: "html",
  cshtml: "razor",
  razor: "razor",
  css: "css",
  scss: "scss",
  sass: "sass",
  less: "less",
  vue: "vue",
  svelte: "svelte",
  astro: "astro",
  yml: "yaml",
  yaml: "yaml",
  toml: "toml",
  ini: "ini",
  properties: "properties",
  xml: "xml",
  xsd: "xml",
  xaml: "xml",
  plist: "xml",
  svg: "xml",
  csproj: "xml",
  fsproj: "xml",
  vbproj: "xml",
  props: "xml",
  targets: "xml",
  resx: "xml",
  nuspec: "xml",
  xsl: "xsl",
  xslt: "xsl",
  diff: "diff",
  patch: "diff",
  log: "log",
  csv: "csv",
  tsv: "tsv",
  tf: "terraform",
  tfvars: "terraform",
  hcl: "hcl",
  tex: "latex",
  bib: "bibtex",
  vim: "viml",
  nix: "nix",
  reg: "reg",
  http: "http",
  dockerfile: "docker",
  mk: "make",
  cmake: "cmake",
};

/** Tam ada göre (küçük harf): uzantısı ya yok ya da dili söylemiyor. */
const BY_NAME: Record<string, string> = {
  dockerfile: "docker",
  containerfile: "docker",
  makefile: "make",
  gnumakefile: "make",
  "cmakelists.txt": "cmake",
  ".bashrc": "shellscript",
  ".bash_profile": "shellscript",
  ".bash_aliases": "shellscript",
  ".zshrc": "shellscript",
  ".zprofile": "shellscript",
  ".zshenv": "shellscript",
  ".profile": "shellscript",
  ".npmrc": "ini",
  ".editorconfig": "ini",
  ".gitconfig": "ini",
  ".babelrc": "json",
  ".eslintrc": "json",
  gemfile: "ruby",
  rakefile: "ruby",
  podfile: "ruby",
  vagrantfile: "ruby",
  jenkinsfile: "groovy",
  codeowners: "codeowners",
  "nginx.conf": "nginx",
  ".htaccess": "apache",
  "cargo.lock": "toml",
  "poetry.lock": "toml",
};

/** Yolun son parçası. */
function baseName(path: string): string {
  return path.slice(Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1);
}

/** Dosyanın gramer kimliği; tanınmıyorsa `null` (düz metin). */
export function syntaxLanguage(path: string): string | null {
  const name = baseName(path).toLowerCase();
  const byName = BY_NAME[name];
  if (byName) return byName;
  // `.env`, `.env.local`, `.env.production`: hepsi ortam dosyası.
  if (name === ".env" || name.startsWith(".env.")) return "dotenv";
  if (name.startsWith("dockerfile.")) return "docker";
  const dot = name.lastIndexOf(".");
  // `.bashrc` gibi noktayla başlayan adın "uzantısı" yok.
  if (dot <= 0) return null;
  return BY_EXT[name.slice(dot + 1)] ?? null;
}
