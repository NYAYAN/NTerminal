/**
 * Yüzen öneri listesinin dikey yerleşimi.
 *
 * Ayrı bir işlev çünkü asıl hata riski burada: liste nereye açılacak ve imleç
 * satırını örtmeyecek. Bunlar ancak gerçek bir terminalde, doğru anda, doğru
 * imleç konumunda görülüyor — yani gözle denetlemesi zor. Saf işlev olarak
 * testi kolay.
 *
 * ## Kural
 *
 * Liste HER ZAMAN terminalin altında, alt kenara YAPIŞIK duruyor. Sabit bir
 * yer, kayan bir yer değil: imlece yapışıp her satırda yukarı aşağı zıplayan
 * bir kutu, gözün aradığı yeri sürekli değiştiriyor.
 *
 * Boşluksuz olması istendi (Warp'ın geçmiş paneli gibi): terminalin dibinde
 * duran ama 4px havada yüzen bir kutu "buraya mı ait, oraya mı" diye
 * duraksatıyor. Alt kenara yapıştığında durum çubuğunun devamı gibi okunuyor
 * ve panelin sınırı ekranın sınırı oluyor.
 *
 * Tek istisna imleç satırı. Liste yazdığınız satırı ASLA örtmüyor; imleç
 * dibe yaklaşıp altta yer kalmadığında listenin üstüne çıkıyor.
 *
 * (İlk sürüm bunun tersini yapıyordu — her durumda imlecin üstüne açılıyordu —
 * ve istem satırının hemen üstündeki taze çıktıyı örtüyordu.)
 */

export interface PlaceInput {
  /** İmleç satırının üst kenarı (görünüm koordinatı). */
  anchorTop: number;
  /** Bir terminal satırının yüksekliği. */
  cellHeight: number;
  /** Terminal alanının alt kenarı (görünüm koordinatı). */
  areaBottom: number;
  /** Panelin yüksekliği. */
  height: number;
  /** Görünüm yüksekliği. */
  viewportHeight: number;
  /**
   * İmleç satırından ve görünümün ÜST kenarından bırakılan boşluk.
   *
   * Alt kenarda kullanılmıyor: panel oraya yapışık duruyor.
   */
  gap: number;
}

/** Panelin üst kenarını verir. */
export function placeSuggestions(input: PlaceInput): number {
  const { anchorTop, cellHeight, areaBottom, height, viewportHeight, gap } = input;

  // Tercih edilen yer: terminalin dibine yapışık.
  const dipte = areaBottom - height;
  // İmleç satırının altı: liste buradan aşağıda başlıyorsa satırı örtmüyor.
  const imlecAlti = anchorTop + cellHeight + gap;

  const top = dipte >= imlecAlti ? dipte : anchorTop - gap - height;

  // Görünümün dışına taşma: üstte boşluk bırakarak, altta yapışık kalarak.
  return Math.max(gap, Math.min(top, viewportHeight - height));
}
