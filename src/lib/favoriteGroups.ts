import type { Favorite } from "../types";

/**
 * Favorilerin klasörlere bölünmesi ve sürükleyerek yeniden sıralanması.
 *
 * ## Neden klasör ayrı bir varlık değil
 *
 * Klasör, favorinin üzerinde duran serbest bir metin; liste ondan TÜRETİLİYOR.
 * Böylece "klasör oluştur", "klasör sil", "boş klasör" diye üç ayrı durum
 * doğmuyor: ad yazmak klasörü var ediyor, son favori taşınınca kendiliğinden
 * kayboluyor. Bir favori tek bir klasörde — etiket değil, klasör.
 *
 * ## Neden sıra ayrı tutulmuyor
 *
 * Ana sıra favoriler dizisinin KENDİSİ (Rust tarafı da böyle saklıyor).
 * Klasörleme bir GÖRÜNÜM: bölümler, her klasörün ilk göründüğü yere göre
 * sıralanıyor. Klasör başına ayrı bir sıra tutmak aynı bilgiyi iki yerde
 * tutmak olurdu ve ikisi kaçınılmaz olarak ayrışırdı.
 */

export interface FavoriteSection {
  /** Klasör adı; `null` = gruplanmamış. */
  folder: string | null;
  items: Favorite[];
}

/** Favorinin klasörü — boş metin `null` sayılıyor. */
function folderOf(favorite: Favorite): string | null {
  const value = favorite.folder?.trim();
  return value ? value : null;
}

/**
 * Listeyi klasörlere böler.
 *
 * Bölümlerin sırası klasörün İLK göründüğü yere göre: kullanıcı sırayı
 * sürükleyerek belirliyor ve bölümlerin de o sırayı izlemesi gerekiyor.
 * Alfabetik sıralamak, taşıdığı favoriyi bambaşka bir yerde bulmasına yol
 * açardı.
 */
export function sectionsOf(favorites: readonly Favorite[]): FavoriteSection[] {
  const out: FavoriteSection[] = [];
  const index = new Map<string, number>();
  // Gruplanmamis bolum AYRI tutuluyor, haritada bir nobetci deger yok:
  // "hicbir klasor adinin denk gelemeyecegi bir dize" secmek zorunda kalmak,
  // sessizce cakisan bir klasor adina kapi aciyor.
  let ungrouped = -1;

  for (const favorite of favorites) {
    const folder = folderOf(favorite);
    const at = folder === null ? ungrouped : (index.get(folder) ?? -1);
    if (at === -1) {
      if (folder === null) ungrouped = out.length;
      else index.set(folder, out.length);
      out.push({ folder, items: [favorite] });
    } else {
      out[at].items.push(favorite);
    }
  }
  return out;
}

/** Var olan klasör adları — yeni favoriye klasör seçerken öneri listesi. */
export function folderNames(favorites: readonly Favorite[]): string[] {
  const seen = new Set<string>();
  for (const favorite of favorites) {
    const folder = folderOf(favorite);
    if (folder) seen.add(folder);
  }
  return [...seen];
}

export interface DropTarget {
  /** Hedef klasör; `null` = gruplanmamış bölüm. */
  folder: string | null;
  /**
   * Hangi favorinin ÖNÜNE bırakılıyor. `null` = bölümün sonuna.
   *
   * Satır yerine bölüm başlığına bırakmak da bu: hedef satır yok, klasör var.
   */
  beforeId: string | null;
}

export interface DropResult {
  /** Yeni tam sıra — Rust tarafına gidecek kimlik dizisi. */
  ids: string[];
  /** Sürüklenen favorinin yeni klasörü. */
  folder: string | null;
}

/**
 * Sürüklenen favoriyi hedefe taşır ve YENİ TAM SIRAYI döndürür.
 *
 * Sıra tek bir dizide tutulduğu için taşıma iki işi birden yapıyor: kimliği
 * yeni yerine koymak ve klasörünü hedefinkine çevirmek. İkisini ayrı ayrı
 * yapmak, arada listeyi tutarsız bir hâlde bırakırdı — favori yeni klasörde
 * ama eski sırasında.
 *
 * Hedef bölümün SONUNA bırakma (`beforeId: null`) o klasörün son öğesinden
 * hemen sonrasına denk geliyor; klasör boşsa (yalnızca başlığa bırakıldıysa)
 * listenin sonuna.
 */
export function applyDrop(
  favorites: readonly Favorite[],
  dragId: string,
  target: DropTarget,
): DropResult | null {
  if (!favorites.some((f) => f.id === dragId)) return null;
  // Kendi üstüne bırakmak bir işlem değil; çağıran tarafı yazmaya zorlamamak
  // için burada karşılanıyor.
  if (target.beforeId === dragId) return null;

  const kalan = favorites.filter((f) => f.id !== dragId);

  let at: number;
  if (target.beforeId) {
    const found = kalan.findIndex((f) => f.id === target.beforeId);
    // Hedef bu arada silinmiş olabilir; listenin sonuna koymak veri
    // kaybetmeyen tek davranış.
    at = found === -1 ? kalan.length : found;
  } else {
    // Bölümün sonu: aynı klasördeki SON öğeden sonrası.
    const sonuncu = kalan.map((f) => folderOf(f)).lastIndexOf(target.folder);
    at = sonuncu === -1 ? kalan.length : sonuncu + 1;
  }

  const ids = kalan.map((f) => f.id);
  ids.splice(at, 0, dragId);
  return { ids, folder: target.folder };
}
