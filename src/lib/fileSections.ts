import { joinDir, relativePath } from "./dirs";
import { fileMatch, type FileMatch } from "./format";
import type { GitChange } from "../types";

/**
 * Ctrl+P dosya listesinin BÖLÜMLERİ.
 *
 * Saf tutuluyor: hangi dosyanın hangi bölüme düştüğü, git'in ve görüntüleyicinin
 * yollarının dizine göre çözülmesi ve bir dosyanın iki bölümde birden
 * görünmemesi burada; bileşen yalnızca çiziyor.
 */

/** Bölümün kimliği; başlığı bileşende. `match` başlıksız: sorgunun birebir eşleşmeleri. */
export type SectionId = "changed" | "recent" | "all" | "match" | "near";

export interface PaletteRow {
  /** Dizine göre yol, dosya listesinin KENDİ yazımıyla (Windows'ta `\`). */
  path: string;
  /** Sorgu varken eşleşen harfler; başlangıç listesinde `null`. */
  match: FileMatch | null;
}

export interface PaletteSection {
  id: SectionId;
  rows: PaletteRow[];
}

/**
 * Başlangıç listesinde "Değişenler" ve "Son açılanlar"ın tavanı.
 *
 * Kısa tutuluyor: bölümler bir kısayol, ikisi birlikte ilk ekranı doldurursa
 * "Tüm dosyalar" kaydırmadan görünmez olur. Elli değişikliği olan biri
 * dosyasını zaten yazarak arıyor.
 */
export const START_SECTION_MAX = 10;

/**
 * Yolun karşılaştırma anahtarı.
 *
 * Git eğik çizgiyle veriyor, Rust'ın Windows listesi ters bölüyle
 * (`to_string_lossy`); aynı dosya iki yazımla iki kez sayılmasın.
 */
export function pathKey(path: string): string {
  return path.replace(/\\/g, "/");
}

/**
 * Git'in değişen dosyaları, BULUNULAN DİZİNE göre.
 *
 * Git yolları depo KÖKÜNE göre veriyor (bkz. `GitInfo.root`), palet ise
 * kabuğun dizinine göre listeliyor: kabuk `src/` altındayken git `src/a.ts`,
 * liste `a.ts` diyor. Yol önce köke eklenip dizine göre çözülüyor; dizinin
 * DIŞINDA kalan değişiklik bu paletin konusu değil.
 *
 * Silinen dosya (durumunda `D`) atlanıyor: diskte yok, açılamaz.
 */
export function changedInDir(
  changes: readonly GitChange[],
  root: string,
  cwd: string,
): { path: string; status: string }[] {
  const out: { path: string; status: string }[] = [];
  for (const change of changes) {
    if (change.status.includes("D")) continue;
    const rel = relativePath(cwd, joinDir(root, change.path));
    if (rel !== null) out.push({ path: rel, status: change.status });
  }
  return out;
}

/** Mutlak yollar dizine göre; dizinin dışındakiler düşüyor. */
export function relativeToDir(paths: readonly string[], cwd: string): string[] {
  const out: string[] = [];
  for (const path of paths) {
    const rel = relativePath(cwd, path);
    if (rel !== null) out.push(rel);
  }
  return out;
}

/**
 * Sorgu BOŞKEN gösterilen liste: Değişenler, Son açılanlar, Tüm dosyalar.
 *
 * Boş sorgunun eski hâli dizin yürüyüşünün ham sırasıydı: kök dosyaları ve
 * `.DS_Store`; aranan dosya neredeyse hiç orada değildi. Üzerinde çalışılan
 * dosyalar (değişenler) ve az önce bakılanlar önce geliyor.
 *
 * Bir dosya YALNIZCA ilk bölümünde: ok tuşları aynı satıra iki kez uğramasın.
 * Değişen ve son açılan dosyalar dosya LİSTESİNDE de olmalı — diskten silinmiş
 * ya da listenin sınırları dışında kalmış (derinlik, `node_modules`) bir yol
 * açılamayan bir satır olurdu. Yazım listeninki: açarken `joinDir` aynı yolu
 * kursun.
 */
export function startSections(
  files: readonly string[],
  changed: readonly string[],
  recent: readonly string[],
  limit: number,
): PaletteSection[] {
  const own = new Map(files.map((path) => [pathKey(path), path]));
  const seen = new Set<string>();
  const take = (list: readonly string[], cap: number): PaletteRow[] => {
    const rows: PaletteRow[] = [];
    for (const candidate of list) {
      if (rows.length >= cap) break;
      const key = pathKey(candidate);
      const path = own.get(key);
      if (path === undefined || seen.has(key)) continue;
      seen.add(key);
      rows.push({ path, match: null });
    }
    return rows;
  };

  const sections: PaletteSection[] = [
    { id: "changed", rows: take(changed, START_SECTION_MAX) },
    { id: "recent", rows: take(recent, START_SECTION_MAX) },
    { id: "all", rows: take(files, limit) },
  ];
  return sections.filter((section) => section.rows.length > 0);
}

/**
 * Sorgu VARKEN: birebir eşleşmeler önde, dağınık olanlar "Yakın eşleşmeler"
 * başlığının altında.
 *
 * Sıra `rankFiles`ınki; bantlar zaten dağınıkları sona atıyor. Yine de ikiye
 * AYRILIYOR, sırayla değil: başlığın altındaki her satır gerçekten dağınık
 * olmalı — ayraç "bunlar yakın, aynısı değil" diyor.
 */
export function matchSections(ranked: readonly string[], query: string): PaletteSection[] {
  const exact: PaletteRow[] = [];
  const near: PaletteRow[] = [];
  for (const path of ranked) {
    const match = fileMatch(path, query);
    (match?.scattered ? near : exact).push({ path, match });
  }
  const sections: PaletteSection[] = [
    { id: "match", rows: exact },
    { id: "near", rows: near },
  ];
  return sections.filter((section) => section.rows.length > 0);
}

/**
 * ⌥↑ / ⌥↓: önceki / sonraki grubun İLK satırı.
 *
 * `starts` grupların ilk satırlarının düz sıradaki yerleri (artan): içerik
 * sekmesinde dosyalar, ad sekmesinde bölümler. Uçlarda başa ya da sona
 * dönüyor — oklar da öyle dönüyor.
 */
export function groupJump(starts: readonly number[], index: number, dir: 1 | -1): number {
  if (starts.length === 0) return index;
  let group = 0;
  for (let g = 0; g < starts.length; g++) if (starts[g] <= index) group = g;
  return starts[(group + dir + starts.length) % starts.length];
}
