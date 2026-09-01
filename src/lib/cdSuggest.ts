import { filterDirs, joinDir, separatorOf } from "./dirs";
import { MAX_SUGGESTIONS } from "./suggest";

/**
 * `cd` yazarken bulunulan dizinin klasörlerini önermek.
 *
 * ## Neden geçmiş burada yanlış cevap
 *
 * Uygulamanın önerisi komut geçmişinden geliyor ve çoğu komut için doğru olan
 * bu: `npm run build` bir kez yazılır, sonra hatırlanır. `cd` ise tam tersi —
 * cevabı geçmişte değil, DİSKTE. Kullanıcının bildirdiği belirti buydu:
 * "cd yazmaya başlıyorsam bulunduğum konumun altındaki klasörleri getirsin,
 * eski kullandığım cd komutlarını değil". Eski bir `cd` başka bir makinede,
 * başka bir projede yazılmış olabiliyor ve o yolun burada karşılığı yok.
 *
 * ## Neden ayrı ve saf bir modül
 *
 * Ayrıştırmanın tamamı metin işi: nerede biter komut, nerede başlar yol, hangi
 * parça süzgeç. Dosya sistemine hiç dokunmadan test edilebiliyor; depodaki
 * `dirs.ts` de aynı sebeple ayrı duruyor ve yol matematiğini oradan alıyoruz.
 */

export interface CdQuery {
  /** Listelenecek dizinin tam yolu. */
  dir: string;
  /** Yazılmakta olan son parça — süzgeç. */
  leaf: string;
  /** Tamamlanan adın önüne yazılacak, kullanıcının çoktan yazdığı bölüm. */
  base: string;
}

/**
 * Girdi bir `cd` çağrısı mı; öyleyse hangi dizin listelenecek.
 *
 * `null` dönmesi "bu bir dizin sorusu değil" demek ve çağıran taraf geçmişe
 * dönüyor. Bilerek `null` döndüğümüz durumlar:
 *
 *   * `cd` henüz yazılıyor (boşluk yok) — kullanıcı `cdk` yazıyor olabilir.
 *   * Argümanda boru/zincir var (`cd x && ls`) — artık tek bir `cd` değil.
 *   * Yol MUTLAK (`C:\`, `/`, `~`) — o zaman bulunulan dizinin bir anlamı
 *     yok; kabuğun kendi tamamlaması bu işi zaten yapıyor.
 */
export function cdQuery(prefix: string, cwd: string | null): CdQuery | null {
  if (!cwd) return null;
  const match = /^\s*cd\s+(.*)$/i.exec(prefix);
  if (!match) return null;

  // Açılmış tırnak: boşluk içeren bir klasör yazılıyor ("Program Fi…).
  const arg = match[1].replace(/^["']/, "");
  if (/[|&;<>]/.test(arg)) return null;
  if (/^([a-zA-Z]:[\\/]|[\\/]|~)/.test(arg)) return null;

  const at = Math.max(arg.lastIndexOf("/"), arg.lastIndexOf("\\"));
  if (at < 0) return { dir: cwd, leaf: arg, base: "" };

  const base = arg.slice(0, at + 1);
  const leaf = arg.slice(at + 1);
  // Yazılan ara klasörler tek tek iniliyor: `src/components/` → cwd/src/components.
  const dir = base
    .split(/[\\/]+/)
    .filter(Boolean)
    .reduce((acc, part) => joinDir(acc, part), cwd);
  return { dir, leaf, base };
}

/**
 * Dizin adlarını öneri satırlarına çevirir.
 *
 * Satır TAM KOMUT: `cd src/components`. Öneri listesi kabul edildiğinde
 * yazılanı bununla değiştiriyor, yani satırın çalıştırılabilir olması gerek.
 *
 * Ad boşluk içeriyorsa alıntılanıyor — `cd Program Files` kabuğa iki argüman
 * gibi görünürdü.
 */
export function cdSuggestions(
  query: CdQuery,
  names: readonly string[],
  quote: (path: string) => string,
  limit = MAX_SUGGESTIONS,
): string[] {
  const sep = separatorOf(query.dir);
  /*
   * ÖN EKLE başlayanlar önce.
   *
   * Süzgeç `filterDirs` ile aynı kuralı kullanıyor (İÇEREN eşleşme) ve bu
   * bilinçli: `Presentation` içindeki `WebAPI`yi aramak için "web" yazmak
   * yetmeli. Ama sıralama sadece süzgece bırakılınca `cd s` yazana ilk sırada
   * `node_modules` çıkıyordu — "s" onun içinde de geçiyor. Kullanıcının
   * yazdığı harflerle BAŞLAYAN klasör neredeyse her zaman kastettiği şey;
   * içeren eşleşme bir kaçış kapısı, varsayılan değil.
   */
  const leaf = query.leaf.trim().toLowerCase();
  const eslesen = filterDirs(names, query.leaf);
  const onEk = eslesen.filter((n) => n.toLowerCase().startsWith(leaf));
  const iceren = eslesen.filter((n) => !n.toLowerCase().startsWith(leaf));

  return [...onEk, ...iceren]
    .slice(0, limit)
    .map((name) => {
      // Kullanıcının yazdığı ayırıcı korunuyor: `src/` yazana `src\` dönmek
      // yazdığı metni sebepsiz değiştirmek olurdu.
      const yol = `${query.base}${name}`;
      const normal = query.base ? yol : yol.replace(/[\\/]/g, sep);
      return `cd ${quote(normal)}`;
    });
}
