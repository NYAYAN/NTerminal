/**
 * Fark penceresinin adresi: hangi deponun hangi dosyası.
 *
 * Pencere uygulamanın KENDİ sayfasını (`index.html`) bir sorguyla açıyor ve
 * `main.tsx` sorguya bakıp ana arayüz yerine fark görünümünü çiziyor. Sorgu
 * tek bilgi taşıyıcısı: pencere ana pencerenin deposunu paylaşmıyor (ayrı bir
 * sayfa, ayrı bir JS dünyası), o yüzden ihtiyacı olan her şeyi ya buradan ya
 * da Rust'tan kendisi okuyor.
 *
 * Yollar `URLSearchParams` ile kodlanıyor: `/`, `#`, `?` ve boşluk sayfa
 * adresini bozamıyor; Rust tarafı da yalnızca bu kodlamanın üretebileceği
 * karakterleri kabul ediyor (`diff_window_open`).
 */

import { baseName, dirName } from "./format";
import { api } from "./ipc";

/** Sayfayı fark penceresi olarak çizdiren sorgu değeri. */
export const DIFF_VIEW = "diff";

export interface DiffTarget {
  /** Deponun kökü (mutlak yol). */
  root: string;
  /** Köke göre dosya yolu (porcelain'in verdiği gibi). */
  path: string;
}

export function diffQuery(target: DiffTarget): string {
  return new URLSearchParams({ view: DIFF_VIEW, root: target.root, path: target.path }).toString();
}

/** Sayfanın sorgusu bir fark penceresini mi tarif ediyor; ediyorsa hedefi. */
export function parseDiffQuery(search: string): DiffTarget | null {
  const params = new URLSearchParams(search);
  if (params.get("view") !== DIFF_VIEW) return null;
  const root = params.get("root");
  const path = params.get("path");
  return root && path ? { root, path } : null;
}

/**
 * IntelliJ'in fark penceresi başlığı: `GitChanges.tsx (/…/src/components)`.
 *
 * `DiffRequestFactoryImpl.getTitle`ın biçimi birebir: ad önde, klasör parantez
 * içinde TAM yol — aynı adlı iki dosyanın (iki ayrı `index.ts`) pencereleri
 * görev çubuğunda ancak klasörle ayırt ediliyor. Yeniden adlandırma ve taşıma
 * ASCII okla (`" -> "`): `eski.ts -> yeni.ts (/…)`, `a.ts (/eski -> /yeni)`.
 */
export function diffWindowTitle(root: string, path: string, origPath?: string): string {
  // `dirName` ayırıcıyı da veriyor (`src/`); başlıkta sondaki ayırıcı yok.
  const folder = (p: string) => {
    const dir = dirName(p)?.replace(/[\\/]+$/, "");
    return dir ? `${root}/${dir}` : root;
  };
  const before = origPath ?? path;
  const name =
    baseName(before) === baseName(path) ? baseName(path) : `${baseName(before)} -> ${baseName(path)}`;
  const dir = folder(before) === folder(path) ? folder(path) : `${folder(before)} -> ${folder(path)}`;
  return `${name} (${dir})`;
}

/**
 * Farkı yeni bir pencerede açar.
 *
 * Her çağrı YENİ bir pencere: IntelliJ'de de "Show Diff" ayrı pencere kipinde her
 * seferinde yeni bir çerçeve açıyor ve iki dosyayı yan yana iki pencerede
 * karşılaştırmak bu sayede mümkün.
 */
export function openDiffWindow(target: DiffTarget, origPath?: string): Promise<void> {
  const dark = document.documentElement.dataset.tone !== "light";
  return api.diffWindowOpen(diffQuery(target), diffWindowTitle(target.root, target.path, origPath), dark);
}
