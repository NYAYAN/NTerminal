/**
 * Durum çubuğunda neyin gizleneceğini bulan hesap.
 *
 * ## Neden sabit eşik değil
 *
 * İlk sürüm bunu CSS'e bırakıyordu: `@container` ile ölçülmüş genişlik
 * eşikleri. Ölçüm o eşiklerin çalışamayacağını gösterdi — çubuğun içeriği
 * duruma göre 200px'den fazla değişiyordu (o zamanki rozetler: "Command
 * suggestions unsupported" 206px, Türkçe karşılığı 171px, sağlıklı hâli
 * 112px). Tek bir eşik iki ucu birden doğru yapamıyor: en kötü hâle göre
 * kurulursa çubuk sıradan bir pencerede boş yere boşalıyor, ortalamaya göre
 * kurulursa en kötü hâlde taşıp sağdaki düğmeleri kırpıyor.
 *
 * Rozetler o zamandan beri "⋯" menüsüne taşındı, profil adı da tamamen kalktı
 * (gerekçesi `StatusBar.tsx`) — ama gerekçe DURUYOR ve taşıyanı değişti:
 * çubukta kalan iki öğenin birini KULLANICI adlandırıyor (grup adı), ötekisi
 * de bulunulan dizin. İkisi de ölçülemeyecek kadar değişken; sabit bir eşik
 * yine iki ucu birden doğru yapamaz.
 *
 * Buradaki işlev saf: genişlikleri alıyor, hangi önceliğe kadar gizleneceğini
 * söylüyor. DOM'a dokunmadığı için testi de gerçek bir tarayıcı
 * gerektirmiyor.
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
  /**
   * "⋯" düğmesinin genişliği. HER DÜZEYDE hesaba giriyor.
   *
   * Bir zamanlar yalnızca bir şey gizlendiğinde yer kaplıyordu: düğme
   * sığmayanların kapısıydı, sığmayan yoksa çizilmiyordu. Bugün durum
   * okumalarının TAMAMI menüde (gerekçesi `StatusBar.tsx`), yani düğme
   * çubuğun kalıcı bir parçası — koşullu saymak çubuğu düğmenin genişliği
   * kadar geniş sanmak olurdu.
   */
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
  // Görünen öğeler + "⋯" düğmesi + esnek boşluk. Boşluğun genişliği sıfır ama
  // ARADA duruyor, yani bir `gap` üretiyor; unutulduğunda hesap her seferinde
  // bir boşluk kadar iyimser çıkıyor.
  const count = visible.length + 2;
  return sum + input.moreWidth + input.gap * Math.max(0, count - 1);
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
