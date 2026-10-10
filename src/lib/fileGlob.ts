/**
 * Dosya aramasında KALIP: `*.tsx`, `*.{ts,tsx}`, `src/**\/*.test.ts`.
 *
 * İSTEK: "aramalarda *.tsx dersem bunların da çalışması gerekir." Dosya
 * araması (Ctrl+P ve dosya sütunundaki arama) sorguyu harf harf arıyordu;
 * `*` hiçbir dosya adında geçmediği için `*.tsx` hiç sonuç vermiyordu.
 *
 * ## Sorgu nasıl bölünüyor
 *
 * Boşlukla ayrılan parçalardan kalıp karakteri (`* ? [ ] { }`) taşıyanlar
 * KALIP, kalanlar her zamanki bulanık arama: `rail *.tsx` → adı ya da yolu
 * "rail"e uyan `.tsx` dosyaları. Kalıp yoksa sorgu olduğu gibi kalıyor
 * (boşluklu bir dosya adı aranabilsin).
 *
 * ## Kalıp neye uyuyor
 *
 * - Eğik çizgisizse dosyanın ADINA (`*.tsx`, `use*`).
 * - Eğik çizgiliyse göreli YOLA, herhangi bir klasör sınırından başlayarak
 *   (`components/*.tsx` → `src/components/App.tsx`); `/` ile başlıyorsa
 *   kökten (`/src/*.ts`).
 * - `*` klasör sınırını geçmiyor, `**` geçiyor (`**\/` hiç klasör de olabilir);
 *   `?` tek karakter; `[abc]`, `[!abc]` karakter kümesi; `{ts,tsx}` seçenekler.
 * - Büyük-küçük harf ayrımı yok (bulanık aramadaki gibi). Windows yolundaki
 *   ters bölü eğik çizgi sayılıyor.
 *
 * Kalıbın DÜZ parçaları (`.tsx`) satırda vurgulanıyor: düzenli ifadede her
 * düz parça bir yakalama grubu ve yerleri `d` bayrağıyla okunuyor.
 */

/** Bir parçayı kalıp yapan karakterler. */
const META = /[*?[\]{}]/;

export interface FileGlob {
  /** Göreli yola mı (eğik çizgi var) yoksa yalnız ada mı uyuyor. */
  path: boolean;
  regex: RegExp;
}

export interface FileQuery {
  /** Kalıp olmayan kısım: bulanık arama bununla. Boş olabilir. */
  text: string;
  globs: FileGlob[];
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/** Kalıbı derler; derlenemiyorsa (`[z-a]` gibi) `null` — parça düz metin sayılıyor. */
export function compileGlob(pattern: string): FileGlob | null {
  let p = pattern.replace(/\\/g, "/");
  const path = p.includes("/");
  const rooted = path && p.startsWith("/");
  if (rooted) p = p.replace(/^\/+/, "");

  let src = "";
  let literal = "";
  const flush = () => {
    if (literal) src += `(${escape(literal)})`;
    literal = "";
  };
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === "*") {
      flush();
      if (p[i + 1] === "*") {
        i++;
        if (p[i + 1] === "/") {
          i++;
          src += "(?:.*/)?";
        } else {
          src += ".*";
        }
      } else {
        src += "[^/]*";
      }
    } else if (c === "?") {
      flush();
      src += "[^/]";
    } else if (c === "[" && p.indexOf("]", i + 2) !== -1) {
      flush();
      const end = p.indexOf("]", i + 2);
      const body = p.slice(i + 1, end);
      src += `[${body.startsWith("!") ? `^${body.slice(1)}` : body}]`;
      i = end;
    } else if (c === "{" && p.indexOf("}", i + 1) !== -1) {
      flush();
      const end = p.indexOf("}", i + 1);
      src += `(?:${p.slice(i + 1, end).split(",").map(escape).join("|")})`;
      i = end;
    } else {
      literal += c;
    }
  }
  flush();

  const head = path && !rooted ? "^(?:.*/)?" : "^";
  try {
    return { path, regex: new RegExp(`${head}${src}$`, "di") };
  } catch {
    return null;
  }
}

/** Sorguyu kalıplara ve bulanık aranacak metne ayırır. */
export function parseFileQuery(query: string): FileQuery {
  const tokens = query.trim().split(/\s+/);
  if (!tokens.some((token) => META.test(token))) return { text: query, globs: [] };
  const globs: FileGlob[] = [];
  const rest: string[] = [];
  for (const token of tokens) {
    const glob = META.test(token) ? compileGlob(token) : null;
    if (glob) globs.push(glob);
    else if (token) rest.push(token);
  }
  return { text: rest.join(" "), globs };
}

/** Kalıbın uyduğu bölüm: yol kalıbında bütün yol, ad kalıbında ad. */
function subject(glob: FileGlob, path: string): { text: string; from: number } {
  const normal = path.replace(/\\/g, "/");
  const from = glob.path ? 0 : normal.lastIndexOf("/") + 1;
  return { text: normal.slice(from), from };
}

/** Yol kalıba uyuyor mu — sıralamanın sıcak yolu, konum dizisi kurmuyor. */
export function globTest(glob: FileGlob, path: string): boolean {
  return glob.regex.test(subject(glob, path).text);
}

/** Kalıbın düz parçalarının yoldaki yerleri; uymuyorsa `null`. */
export function globPositions(glob: FileGlob, path: string): number[] | null {
  const { text, from } = subject(glob, path);
  const match = glob.regex.exec(text);
  if (!match) return null;
  const out: number[] = [];
  const indices = (match as RegExpExecArray & { indices?: ([number, number] | undefined)[] }).indices;
  for (let g = 1; g < (indices?.length ?? 0); g++) {
    const span = indices![g];
    if (!span) continue;
    for (let k = span[0]; k < span[1]; k++) out.push(from + k);
  }
  return out;
}
