import type { LanguageRegistration } from "@shikijs/primitive";

/**
 * Gramerlerin yükleyicileri — yalnızca renklendiricinin iş parçacığı
 * (`syntax.worker.ts`) ve testler içe aktarıyor.
 *
 * Her gramer AYRI bir parça ve yalnızca o dilde bir dosya açılınca diskten
 * yükleniyor: TypeScript'inki tek başına ~190 KB, C++'ınki ~840 KB. Hepsini
 * baştan yüklemek her açılışı bunlarla ödetirdi. İçe aktarmalar tek tek
 * YAZILI: Vite bir paketin içinden parçayı ancak sabit yazılmış yolu görünce
 * ayırabiliyor, değişkenli bir yolu (`@shikijs/langs/${dil}`) çözemiyor.
 *
 * Anahtarlar `syntaxLanguages.ts`in döndürdüğü kimliklerle birebir; ikisinin
 * ayrışmadığı `syntax.test.ts`te bağlı.
 */
type Loader = () => Promise<{ default: LanguageRegistration[] }>;

export const GRAMMARS: Record<string, Loader> = {
  apache: () => import("@shikijs/langs/apache"),
  astro: () => import("@shikijs/langs/astro"),
  bat: () => import("@shikijs/langs/bat"),
  bibtex: () => import("@shikijs/langs/bibtex"),
  c: () => import("@shikijs/langs/c"),
  clojure: () => import("@shikijs/langs/clojure"),
  cmake: () => import("@shikijs/langs/cmake"),
  codeowners: () => import("@shikijs/langs/codeowners"),
  cpp: () => import("@shikijs/langs/cpp"),
  csharp: () => import("@shikijs/langs/csharp"),
  css: () => import("@shikijs/langs/css"),
  csv: () => import("@shikijs/langs/csv"),
  dart: () => import("@shikijs/langs/dart"),
  diff: () => import("@shikijs/langs/diff"),
  docker: () => import("@shikijs/langs/docker"),
  dotenv: () => import("@shikijs/langs/dotenv"),
  elixir: () => import("@shikijs/langs/elixir"),
  erlang: () => import("@shikijs/langs/erlang"),
  fish: () => import("@shikijs/langs/fish"),
  fsharp: () => import("@shikijs/langs/fsharp"),
  go: () => import("@shikijs/langs/go"),
  graphql: () => import("@shikijs/langs/graphql"),
  groovy: () => import("@shikijs/langs/groovy"),
  haskell: () => import("@shikijs/langs/haskell"),
  hcl: () => import("@shikijs/langs/hcl"),
  html: () => import("@shikijs/langs/html"),
  http: () => import("@shikijs/langs/http"),
  ini: () => import("@shikijs/langs/ini"),
  java: () => import("@shikijs/langs/java"),
  javascript: () => import("@shikijs/langs/javascript"),
  json: () => import("@shikijs/langs/json"),
  json5: () => import("@shikijs/langs/json5"),
  jsonc: () => import("@shikijs/langs/jsonc"),
  jsonl: () => import("@shikijs/langs/jsonl"),
  jsx: () => import("@shikijs/langs/jsx"),
  julia: () => import("@shikijs/langs/julia"),
  kotlin: () => import("@shikijs/langs/kotlin"),
  latex: () => import("@shikijs/langs/latex"),
  less: () => import("@shikijs/langs/less"),
  log: () => import("@shikijs/langs/log"),
  lua: () => import("@shikijs/langs/lua"),
  make: () => import("@shikijs/langs/make"),
  markdown: () => import("@shikijs/langs/markdown"),
  mdx: () => import("@shikijs/langs/mdx"),
  nginx: () => import("@shikijs/langs/nginx"),
  nix: () => import("@shikijs/langs/nix"),
  "objective-c": () => import("@shikijs/langs/objective-c"),
  "objective-cpp": () => import("@shikijs/langs/objective-cpp"),
  perl: () => import("@shikijs/langs/perl"),
  php: () => import("@shikijs/langs/php"),
  powershell: () => import("@shikijs/langs/powershell"),
  prisma: () => import("@shikijs/langs/prisma"),
  properties: () => import("@shikijs/langs/properties"),
  proto: () => import("@shikijs/langs/proto"),
  python: () => import("@shikijs/langs/python"),
  r: () => import("@shikijs/langs/r"),
  razor: () => import("@shikijs/langs/razor"),
  reg: () => import("@shikijs/langs/reg"),
  ruby: () => import("@shikijs/langs/ruby"),
  rust: () => import("@shikijs/langs/rust"),
  sass: () => import("@shikijs/langs/sass"),
  scala: () => import("@shikijs/langs/scala"),
  scss: () => import("@shikijs/langs/scss"),
  shellscript: () => import("@shikijs/langs/shellscript"),
  sql: () => import("@shikijs/langs/sql"),
  svelte: () => import("@shikijs/langs/svelte"),
  swift: () => import("@shikijs/langs/swift"),
  terraform: () => import("@shikijs/langs/terraform"),
  toml: () => import("@shikijs/langs/toml"),
  tsv: () => import("@shikijs/langs/tsv"),
  tsx: () => import("@shikijs/langs/tsx"),
  typescript: () => import("@shikijs/langs/typescript"),
  vb: () => import("@shikijs/langs/vb"),
  viml: () => import("@shikijs/langs/viml"),
  vue: () => import("@shikijs/langs/vue"),
  xml: () => import("@shikijs/langs/xml"),
  xsl: () => import("@shikijs/langs/xsl"),
  yaml: () => import("@shikijs/langs/yaml"),
  zig: () => import("@shikijs/langs/zig"),
};
