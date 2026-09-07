/**
 * Sekme şeridinde kaç sekmenin GİZLİ kaldığı.
 *
 * ## Ölçülen hata
 *
 * BİLDİRİLEN: "çok fazla sekme ekleyince sığmayınca bir ok işaretiyle
 * görünmeyen sekmeleri görüntüleyebilmeliyim."
 *
 * Şerit `overflow-x: auto` ama kaydırma çubuğu bilinçli olarak gizli
 * (`global.css` içinde `.tabbar-strip`). Sonuç: taşan sekmelere yalnızca fare
 * tekerleğiyle ulaşılıyordu ve ekranda daha sekme olduğuna dair HİÇBİR işaret
 * yoktu — kullanıcı için o sekmeler yok demekti.
 *
 * ## Neden ölçüm, neden hesap değil
 *
 * "Kaç sekme sığar" sorusunun formülü yok: sekme genişliği başlığın
 * uzunluğuna, kabuk rozetine, kilit simgesine, çalışıyor noktasına ve
 * yeniden adlandırma kutusuna göre değişiyor. İlk uzun başlıkta formül yanlış
 * cevap verir. Bu yüzden karar gerçek dikdörtgenlerle veriliyor; burada
 * yalnızca KURAL duruyor ve saf olduğu için testi doğrudan.
 */

export interface Aralik {
  left: number;
  right: number;
}

/**
 * Sekme yarıdan fazlası dışarıdaysa "gizli" sayılıyor.
 *
 * Eşik neden yarı: kenarda birkaç piksel kırpılan sekme kullanıcı için
 * ORADA — onu saymak "1 sekme daha var" diye yanıltıcı bir sayı üretirdi.
 * Tersten, dörtte biri görünen bir sekmeden başlık okunamıyor; o gerçekten
 * gizli.
 */
export function isHidden(strip: Aralik, tab: Aralik): boolean {
  const genislik = tab.right - tab.left;
  if (genislik <= 0) return false; // ölçülemedi (çizilmemiş): gizli sayma
  const gorunen = Math.min(tab.right, strip.right) - Math.max(tab.left, strip.left);
  return gorunen < genislik / 2;
}

/** Şeride sığmayan sekme sayısı. */
export function hiddenCount(strip: Aralik, tabs: readonly Aralik[]): number {
  return tabs.reduce((n, tab) => n + (isHidden(strip, tab) ? 1 : 0), 0);
}
