import type { GitChange } from "../types";
import { joinDir, relativePath } from "./dirs";
import { pathKey } from "./fileSections";

/**
 * Dosya ağacının git işaretleri: hangi dosya değişti, hangi klasörün içinde
 * değişiklik var.
 *
 * İSTEK: "Dosyalar kısmında değişiklik olan dosyaları da anlamalıyım." VS
 * Code'un gezgini ve IntelliJ'in proje ağacı değişen dosyanın adını durum
 * renginde gösteriyor, içinde değişiklik olan klasörü de işaretliyor; burada
 * renkler ve simgeler Değişiklikler listesininki (`useLabel`).
 *
 * Git yolları depo KÖKÜNE göre (`GitInfo.root`), ağaç ise etkin sekmenin
 * dizininden başlıyor (bkz. `changedInDir`): yol önce köke eklenip ağacın
 * köküne göre çözülüyor, ağacın dışında kalan değişiklik düşüyor.
 *
 * Silinen dosya ağaçta yok (diskte değil) ama klasörü değişmiş sayılıyor:
 * "bu klasörde bir şey eksildi" de bir değişiklik.
 */

/** Klasörün işareti: yalnızca yeni dosyalar varsa `new` (yeşil), başka her şeyde `mod`. */
export type DirMark = "mod" | "new";

export interface TreeMarks {
  /** Ağacın köküne göre yol (`/` ile) → porcelain durumu (`" M"`, `"??"`…). */
  files: ReadonlyMap<string, string>;
  /** İçinde değişiklik olan klasörler, ağacın köküne göre. */
  dirs: ReadonlyMap<string, DirMark>;
}

export const NO_MARKS: TreeMarks = { files: new Map(), dirs: new Map() };

export function treeMarks(changes: readonly GitChange[], root: string, cwd: string): TreeMarks {
  const files = new Map<string, string>();
  const dirs = new Map<string, DirMark>();
  for (const change of changes) {
    const rel = relativePath(cwd, joinDir(root, change.path));
    if (rel === null) continue;
    const key = pathKey(rel);
    const deleted = change.status.includes("D");
    if (!deleted) files.set(key, change.status);
    const code = change.status.trim();
    const fresh = !deleted && (code === "??" || code[0] === "A" || code[0] === "R");
    const mark: DirMark = fresh ? "new" : "mod";
    for (let at = key.indexOf("/"); at > 0; at = key.indexOf("/", at + 1)) {
      const dir = key.slice(0, at);
      // "Değişti" baskın: yeşil ancak klasörde yalnızca yeni dosyalar varsa.
      if (dirs.get(dir) !== "mod") dirs.set(dir, mark);
    }
  }
  return { files, dirs };
}
