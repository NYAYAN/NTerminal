import type { Group, TabState } from "../types";

/**
 * Sekme kilidi kuralları.
 *
 * Kilit, yanlışlıkla kapatmaya karşı bir koruma — bir onay penceresi değil.
 * Tek tıkla aşılabilen bir kilit, kilidin amacını ortadan kaldırır: kullanıcı
 * "bu sekme sürekli açık kalmalı" dediğinde kapatma yolları kapanmalı,
 * açmak için kilidi kaldırmak gerekmeli.
 *
 * Mantık burada saf fonksiyonlar hâlinde: kapatma yolları birkaç yerden
 * geçiyor (düğme, orta tuş, Ctrl+W, "diğerlerini kapat", grup silme) ve
 * hepsinin aynı kararı vermesi gerekiyor.
 */

export function isLocked(tab: TabState): boolean {
  return tab.locked === true;
}

export function canCloseTab(tab: TabState): boolean {
  return !isLocked(tab);
}

export function lockedTabs(tabs: TabState[]): TabState[] {
  return tabs.filter(isLocked);
}

/**
 * "Diğerlerini kapat" için: verilen sekme dışındaki kapatılabilir sekmeler.
 * Kilitli olanlar listeye girmiyor.
 */
export function closableOthers(tabs: TabState[], keepId: string): TabState[] {
  return tabs.filter((tab) => tab.id !== keepId && canCloseTab(tab));
}

/** Grup silinebilir mi? Kilitli sekme varsa hayır. */
export function canDeleteGroup(group: Group): boolean {
  return lockedTabs(group.tabs).length === 0;
}

/** Kullanıcıya gösterilecek kilitli sekme adları. */
export function lockedTabNames(tabs: TabState[], label: (tab: TabState) => string): string[] {
  return lockedTabs(tabs).map(label);
}

// ------------------------------------------------- siralama / surukle-birak

/**
 * Diziyi yeniden sirala: `fromIndex`teki ogeyi cikarip `toIndex`e koyar.
 *
 * `toIndex` CIKARMADAN ONCEKI dizine gore veriliyor - surukle-birak arayuzu
 * hedefi ekranda gordugu siraya gore hesapliyor. Cikarma indeksleri kaydirdigi
 * icin duzeltme burada yapiliyor; cagiran tarafta yapilmaya kalkilinca ayni
 * hata iki yerde tekrarlaniyor.
 */
export function reorder<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex < 0 || fromIndex >= items.length) return items;
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  // Oge kendinden sonraki bir konuma tasiniyorsa cikarma yuzunden bir kayiyor.
  const target = toIndex > fromIndex ? toIndex - 1 : toIndex;
  next.splice(Math.max(0, Math.min(next.length, target)), 0, moved);
  return next;
}

/**
 * Surukleme sirasinda imlec bir ogenin ust/sol yarisindaysa oradan once,
 * alt/sag yarisindaysa sonra birakilir.
 */
export function dropIndex(overIndex: number, after: boolean): number {
  return after ? overIndex + 1 : overIndex;
}

/**
 * "Tumunu ac/kapat" dugmesinin uygulayacagi durum: bir tanesi bile acıksa
 * hepsini kapatiyoruz, hepsi kapaliysa hepsini aciyoruz. Boylece dugme her
 * zaman gorunur bir is yapiyor.
 */
export function nextCollapsedAll(groups: { collapsed: boolean }[]): boolean {
  if (groups.length === 0) return false;
  return groups.some((g) => !g.collapsed);
}

/**
 * Kenar cubugunda gosterilecek gruplar.
 *
 * Suzgec acikken yalnizca favoriler listelenir; etkin grup favori olmasa da
 * listede kalir - aksi halde kullanici calistigi yeri gozden kaybediyor.
 */
export function visibleGroups<T extends { id: string; favorite?: boolean }>(
  groups: T[],
  onlyFavorites: boolean,
  activeGroupId: string | null,
): T[] {
  if (!onlyFavorites) return groups;
  return groups.filter((g) => g.favorite === true || g.id === activeGroupId);
}
