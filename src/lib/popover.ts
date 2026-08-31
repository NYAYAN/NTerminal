/**
 * Açılır pencerelerin dayanağa göre yerleşimi.
 *
 * Warp'ta yol ve dal rozetlerine tıklayınca liste ROZETİN HEMEN ÜSTÜNDE
 * açılıyor. Ekranın bir köşesinde açılan pencere aynı işi yapıyor ama gözü
 * tıkladığı yerden koparıyor: "bu liste neye ait" sorusu doğuyor.
 *
 * Ölçüm DOM'dan okunuyor ve depoya kopyalanmıyor: rozetin yeri her karede
 * değişebiliyor (terminal kayıyor, pencere ölçüsü değişiyor) ve depoda tutulan
 * bir kopya senkron tutulması gereken ikinci bir gerçek olurdu.
 */

/** Kenarlardan bırakılan en az boşluk (px). */
const KENAR = 8;

/** Dayanak ile pencere arasındaki boşluk (px). */
const ARALIK = 6;

/**
 * Pencereyi `selector` ile bulunan ögenin ÜSTÜNE yerleştirir.
 *
 * Dayanak yoksa hiçbir şey yapmıyor: pencere CSS'teki yerinde kalıyor.
 * Ekrandan taşma iki uçtan da içeri çekiliyor — dar pencerede liste
 * yarısı görünmez hâlde kalırdı.
 */
export function anchorAbove(panel: HTMLElement | null, selector: string): void {
  if (!panel) return;
  const anchor = document.querySelector<HTMLElement>(selector);
  if (!anchor) return;

  const a = anchor.getBoundingClientRect();
  const p = panel.getBoundingClientRect();

  const top = Math.max(KENAR, a.top - ARALIK - p.height);
  const left = Math.max(KENAR, Math.min(a.left, window.innerWidth - p.width - KENAR));

  panel.style.top = `${top}px`;
  panel.style.left = `${left}px`;
}
