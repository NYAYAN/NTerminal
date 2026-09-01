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
 * Suzgec acikken YALNIZCA favoriler listeleniyor. Istisna yok.
 *
 * Eskiden etkin grup favori olmasa da listede kaliyordu; gerekcesi "kullanici
 * calistigi yeri gozden kaybetmesin"di. Kullanici bunun tersini istedi ve
 * hakli: suzgec "favoriler" diyorsa listede favori olmayan bir satir gormek
 * suzgecin ne yaptigini belirsiz kiliyor - hangi grubun neden orada oldugu
 * anlasilmiyor.
 *
 * Kaybedilen sey sinirli: etkin grubun sekmeleri USTTEKI sekme cubugunda
 * duruyor, yani calisilan yere erisim kapanmiyor. Yalnizca kenar cubugundaki
 * satiri gitmis oluyor.
 */
export function visibleGroups<T extends { favorite?: boolean; ungrouped?: boolean }>(
  groups: T[],
  onlyFavorites: boolean,
): T[] {
  if (!onlyFavorites) return groups;
  /*
   * Gruplanmamış kova süzgeçten MUAF.
   *
   * Süzgeç "hangi gruplarla çalışıyorum" sorusunun cevabı; kova ise bir grup
   * değil, grubu olmayan sekmelerin durduğu yer. Favori işaretlenemediği için
   * (başlığı, dolayısıyla yıldızı yok) süzgeç açıkken kalıcı olarak
   * kaybolurdu — kullanıcı sekmelerini bir daha bulamazdı.
   */
  return groups.filter((g) => g.favorite === true || g.ungrouped === true);
}

// ------------------------------------------------------------ profil bagi

/**
 * Boşa düşmüş profil bağlarını onarır.
 *
 * ## Neden gerekiyor
 *
 * Sekme kabuğunu bir profil KİMLİĞİ ile tutuyor, profilin kendisiyle değil.
 * Kimlik iki yoldan boşa düşüyor:
 *
 *   * Ayarlar › Profiller › Sil — o profile bağlı sekmeler olduğu gibi kalıyor.
 *   * "Ayarları varsayılanlara döndür" — profiller yeniden taranıyor ve
 *     hepsine YENİ kimlik veriliyor, yani listedeki her sekmenin bağı aynı
 *     anda kopuyor.
 *
 * Görünen belirti kenar çubuğundaki `?` rozetiydi. Sekme aslında çalışıyordu:
 * Rust tarafı açarken varsayılana düşüyor (`store::resolve_profile`). Yani
 * yalnızca bir çizim sorunu gibi görünüyor ama değil — sekmenin ne olduğu
 * bilgisi diskte de bozuk duruyor ve her açılışta yeniden aynı yere düşmek
 * zorunda kalıyor.
 *
 * Burası bağı DÜZELTİYOR: kimliği artık geçmeyen sekme, kabuğun gerçekte
 * düştüğü profile bağlanıyor. Düşüş sırası Rust'takiyle aynı: varsayılan
 * profil, o da yoksa listenin ilki.
 *
 * Profil listesi boşsa hiçbir şey yapılmıyor — bağlanacak bir şey yok ve
 * sekmenin kimliğini silmek bilgiyi tümden atmak olurdu.
 */
export function healTabProfiles(
  groups: Group[],
  profiles: { id: string }[],
  defaultProfileId: string,
): Group[] {
  if (profiles.length === 0) return groups;
  const known = new Set(profiles.map((p) => p.id));
  const fallback = known.has(defaultProfileId) ? defaultProfileId : profiles[0].id;

  let touched = false;
  const next = groups.map((group) => {
    let groupTouched = false;
    const tabs = group.tabs.map((tab) => {
      if (known.has(tab.profileId)) return tab;
      groupTouched = true;
      return { ...tab, profileId: fallback };
    });
    // Grubun varsayılan profili de boşa düşebiliyor; sonraki sekme onunla
    // açılacağı için o da onarılıyor. `null` bilinçli olarak korunuyor:
    // "varsayılanı kullan" demek ve bir kopuk bağ değil.
    const defaults =
      group.defaultProfileId !== null && !known.has(group.defaultProfileId)
        ? { defaultProfileId: fallback }
        : null;
    if (!groupTouched && !defaults) return group;
    touched = true;
    return { ...group, tabs, ...defaults };
  });

  // Kimlik korunuyor: değişiklik yoksa çağıran taraf yeniden çizmesin.
  return touched ? next : groups;
}
