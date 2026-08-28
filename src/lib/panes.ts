import type { Group } from "../types";

/**
 * Görünüm kipi: sekmeler mi, bölmeler mi.
 *
 * `tabs` — aynı anda tek terminal görünür, ötekiler düzende ama gizli.
 * `panes` — etkin grubun bütün sekmeleri döşenerek aynı ekranda durur.
 */
export type ViewMode = "tabs" | "panes";

export function normalizeViewMode(value: string | null | undefined): ViewMode {
  return value === "panes" ? "panes" : "tabs";
}

export function nextViewMode(mode: ViewMode): ViewMode {
  return mode === "tabs" ? "panes" : "tabs";
}

export interface PaneGrid {
  cols: number;
  rows: number;
  /**
   * Son bölmenin kaç sütuna yayılacağı.
   *
   * Kare ızgara sayı tam kare değilken boş hücre bırakıyor (3 bölme → 2×2, bir
   * hücre boş). Boş hücre "bir şey eksik" gibi duruyor; onun yerine son bölmeyi
   * kalan sütunlara yayıyoruz: 3 bölmede üstte iki, altta bir geniş bölme.
   */
  lastSpan: number;
}

/**
 * Bölme sayısından ızgara ölçüsü.
 *
 * Sütun sayısı `ceil(sqrt(n))`: 2 bölme yan yana, 3-4 bölme 2×2, 5-6 bölme
 * 3×2, 7-9 bölme 3×3. Geniş ekranda yatay bölünme dikeyden okunaklı çıkıyor
 * (terminal satırları uzun), o yüzden sütun önce doluyor.
 */
export function paneGrid(count: number): PaneGrid {
  if (count <= 1) return { cols: 1, rows: 1, lastSpan: 1 };
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  return { cols, rows, lastSpan: cols * rows - count + 1 };
}

/**
 * Bu kipte hangi sekmelerin görünür olması gerekiyor.
 *
 * Bölme kipinde grubun TÜM sekmeleri görünür — dolayısıyla hepsinin kabuğu
 * başlar. Bu bilinçli: "hepsini yan yana göster" istemenin karşılığı bu.
 * Grubu küçük tutmak kullanıcının elinde.
 */
export function visibleTabIds(group: Group | undefined, mode: ViewMode): string[] {
  if (!group || group.tabs.length === 0) return [];
  if (mode === "panes") return group.tabs.map((t) => t.id);
  return [activeTabIdOf(group)!];
}

/** Grubun etkin sekmesi; kayıtlı kimlik artık yoksa ilk sekme. */
export function activeTabIdOf(group: Group | undefined): string | null {
  if (!group || group.tabs.length === 0) return null;
  const stored = group.activeTabId;
  if (stored && group.tabs.some((t) => t.id === stored)) return stored;
  return group.tabs[0].id;
}
