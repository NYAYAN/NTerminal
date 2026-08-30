/**
 * Durum çubuğunda neyin gizleneceğini bulan hesap.
 *
 * ## Neden sabit eşik değil
 *
 * İlk sürüm bunu CSS'e bırakıyordu: `@container` ile ölçülmüş genişlik
 * eşikleri. Ölçüm o eşiklerin çalışamayacağını gösterdi — çubuğun içeriği
 * duruma göre 200px'den fazla değişiyor:
 *
 *   tr / sağlıklı, komut çalışmıyor   →  en dar hâl
 *   en / uyarı,    komut çalışıyor    →  +200px (ölçülen: 1084'e karşı ~880)
 *
 * Sebebi metin: "Command suggestions unsupported" 206px, Türkçe karşılığı
 * 171px, sağlıklı hâli ("Komut önerisi açık") 112px. Tek bir eşik ikisini
 * birden doğru yapamıyor — en kötü hâle göre kurulursa çubuk sıradan bir
 * pencerede boş yere boşalıyor, ortalamaya göre kurulursa en kötü hâlde taşıp
 * sağdaki düğmeleri kırpıyor.
 *
 * Bu yüzden karar ölçüme dayanıyor. Buradaki işlev saf: genişlikleri alıyor,
 * hangi önceliğe kadar gizleneceğini söylüyor. DOM'a dokunmadığı için testi de
 * gerçek bir tarayıcı gerektirmiyor.
 */

export interface FitPart {
  /** `data-drop` önceliği. 0 = hiç gizlenmez (düğmeler). */
  level: number;
  /**
   * Öğenin sığması için gereken genişlik (px).
   *
   * Çubuktaki hiçbir öğe sıkışmadığı için (hepsi `flex: none`) bu değer aynı
   * zamanda ölçülen genişlik. Sıkışabilen tek bir öğe bile olsa hesap iyimser
   * çıkardı — "sığıyor" derken üç harfe inmiş bir yolu da sığmış sayardı.
   */
  width: number;
}

export interface FitInput {
  parts: FitPart[];
  /** "⋯" düğmesinin genişliği. Yalnızca bir şey gizlendiğinde yer kaplıyor. */
  moreWidth: number;
  /** Öğeler arası boşluk (`gap`). */
  gap: number;
  /** Çubuğun iç genişliği (dolgu çıkarılmış). */
  available: number;
  /** En büyük öncelik numarası. */
  maxLevel: number;
}

/**
 * Boşluk payı da dahil, verilen gizleme düzeyinde gereken genişlik.
 *
 * Esnek boşluk (`.spacer`) genişliği sıfır ama ARADA duruyor, yani bir `gap`
 * üretiyor; bu yüzden öğe sayısına dahil. Unutulduğunda hesap her seferinde
 * bir boşluk kadar iyimser çıkıyor.
 */
function widthAt(input: FitInput, dropThrough: number): number {
  const visible = input.parts.filter((p) => p.level === 0 || p.level > dropThrough);
  const sum = visible.reduce((total, p) => total + p.width, 0);
  const count = visible.length + 1 + (dropThrough > 0 ? 1 : 0);
  return sum + (dropThrough > 0 ? input.moreWidth : 0) + input.gap * Math.max(0, count - 1);
}

/**
 * Hangi önceliğe kadar gizlenmeli?
 *
 * 0 = hiçbir şey gizlenmiyor. k = 1..maxLevel arası öncelikler gizli.
 *
 * Sığmıyorsa en düşük öncelikten başlayarak teker teker gizliyor; sığdığı ilk
 * düzeyde duruyor, yani gereğinden fazlasını saklamıyor.
 */
export function fitDropLevel(input: FitInput): number {
  let level = 0;
  while (level < input.maxLevel && widthAt(input, level) > input.available) level++;
  return level;
}
