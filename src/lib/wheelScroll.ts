/**
 * Terminalde tekerlekle kaydırmayı karelere yayan sayaç.
 *
 * ## Ölçülen belirti
 *
 * "Çok geçmiş varken geriye kaydırınca takılıyor, akıcı değil." Ölçüm
 * (10.000 satırlık tampon, 60 Hz, CDP'den sürülen tekerlek): ana iş parçacığı
 * kaydırma boyunca yetişiyordu — kare p99 17 ms, uzun görev yok. Takılan şey
 * HAREKETİN BİÇİMİYDİ: xterm 6 her çentikte görünümü TEK KAREDE ~3 satır
 * atlatıyor, ardından 5-6 kare hiç kıpırdatmıyor. Saniyede 10 çentikte 40
 * çentik = 38 kare üç satırlık sıçrama + 195 boş kare. Göz bunu kesik kesik
 * ilerleyen, takılan bir görüntü olarak okuyor.
 *
 * ## Neden xterm'in kendi yumuşak kaydırması (`smoothScrollDuration`) DEĞİL
 *
 * Denendi, ölçüldü, iki yerde bozuk:
 *
 *  - Tampon DOLUYKEN (kaydırma geçmişi sınırda) çıktı akarsa xterm her yeni
 *    satırda görünümü bir satır geri çekip kaydırma öğesini ANINDA o konuma
 *    yazıyor (`Viewport._sync`) ve bu süren animasyonu iptal ediyor. 40 çentik
 *    (beklenen ~120 satır) yalnızca ~53 satır kaydırdı; kullanıcının
 *    tekerleğinin yarısından fazlası kayboluyordu.
 *  - Aynı yoldan "Aşağı in" de (`scrollToBottom`, animasyonlu) en alta
 *    VARAMADI: animasyon yolda iptal edilip yarıda kaldı.
 *
 * Buradaki sayaç konumu değil KALAN SATIR SAYISINI tutuyor ve her karede o
 * anki görünüme göre uyguluyor; çıktı görünümü kaydırsa da kalan hareket
 * kaybolmuyor. xterm'in kendi kaydırması anlık kalıyor (`smoothScrollDuration`
 * 0) ki iki animasyon birbirini ezmesin.
 *
 * ## Mesafe xterm'inkiyle AYNI
 *
 * Değişen yalnızca ZAMANLAMA: bir çentik eskisi kadar satır kaydırıyor, ama
 * tek karede değil birkaç kareye yayılarak. Mesafe hesabı VS Code'un kaydırma
 * öğesinden (xterm 6 onu kullanıyor) birebir alındı; kullanıcının alıştığı hız
 * değişmesin.
 */

/** Tekerlek olayının kullanılan kısmı; testte düz nesneyle kurulabilsin. */
export interface WheelLike {
  deltaY: number;
  deltaMode: number;
  /**
   * Eski, standart dışı alan: Chromium ve WebKit dolduruyor, çentik başına
   * 120. VS Code mesafeyi buradan hesaplıyor; aynısını yapmak hızın değişmemesi
   * için şart.
   */
  wheelDeltaY?: number;
  altKey: boolean;
}

/** Bir çentiğin kaydırdığı piksel (VS Code `SCROLL_WHEEL_SENSITIVITY`). */
const PX_PER_NOTCH = 50;

/** `WheelEvent.DOM_DELTA_LINE`; jsdom'da sınıf sabiti olmayabilir. */
const DOM_DELTA_LINE = 1;

/**
 * Tekerlek olayının karşılığı kaç SATIR (kesirli). Eksi = yukarı, eskiye doğru.
 *
 * `fastSensitivity` Alt basılıyken çarpan (xterm'in `fastScrollSensitivity`
 * seçeneği, varsayılan 5). Hücre yüksekliği bilinmiyorsa 0: ölçülmemiş bir
 * terminalde satır hesabı yapılamaz, çağıran olayı xterm'e bırakmalı.
 */
export function wheelLines(
  e: WheelLike,
  cellHeight: number,
  sensitivity = 1,
  fastSensitivity = 5,
): number {
  if (!(cellHeight > 0)) return 0;
  // VS Code `StandardWheelEvent`: artı = yukarı.
  let notches: number;
  if (typeof e.wheelDeltaY === "number") notches = e.wheelDeltaY / 120;
  else if (e.deltaMode === DOM_DELTA_LINE) notches = -e.deltaY;
  else notches = -e.deltaY / 40;

  let px = PX_PER_NOTCH * notches * sensitivity;
  if (e.altKey) px *= fastSensitivity;
  // VS Code -0,3'ü -1'e, 0,3'ü 1'e yuvarlıyor: yavaş bir dokunmatik yüzey
  // hareketi yoksa hiç kaydırmazdı.
  px = px < 0 ? Math.floor(px) : Math.ceil(px);
  return -px / cellHeight;
}

/** 60 Hz'de bir karenin süresi; adımlar bu birime göre ölçekleniyor. */
const FRAME_MS = 1000 / 60;

/**
 * Kare başına kalan mesafenin ne kadarı kat ediliyor.
 *
 * 0,25 ve aşağıdaki en düşük hız birlikte bir çentiği (~3 satır) altı kareye
 * (100 ms) yayıyor ve satırlar 1., 3. ve 5. karede birer birer kayıyor —
 * düzenli aralık, sıçrama yok. Saniyede 25 çentikte kalan mesafe ~5 satırda
 * dengeleniyor ve görünüm her karede 1-2 satır ilerliyor. Kalanın %90'ı sekiz
 * karede (~130 ms) kat ediliyor; VS Code'un terminalde kullandığı 125 ms ile
 * aynı mertebe.
 */
const CHASE_PER_FRAME = 0.25;

/**
 * Kare başına en az kaç satır.
 *
 * Yalnızca oranla ilerlemek kuyruğu uzatıyor: son satırlar bir çentikten
 * sonra 200 ms'den fazla sürünerek geliyordu. Yarım satır hem kuyruğu
 * kesiyor hem de tek çentiği iki karede bir satıra oturtuyor.
 */
const MIN_LINES_PER_FRAME = 0.5;

/**
 * Bekleyen hareketin tavanı (satır).
 *
 * Serbest dönen tekerlekler saniyede yüzlerce çentik üretebiliyor; tavan
 * olmazsa kullanıcı tekerleği bıraktıktan sonra görünüm uzun süre kaymaya
 * devam eder. Üç ekran, tekerlek bırakıldığında ~250 ms'de bitiyor.
 */
const MAX_PENDING_SCREENS = 3;

/**
 * Bekleyen kaydırma. Saf: zaman dışarıdan veriliyor, xterm'e dokunmuyor.
 *
 * Satırlar KESİRLİ birikiyor ve uygulanan tam sayı yuvarlanarak çıkıyor —
 * VS Code'un "konum = round(scrollTop / hücre)" kuralının karşılığı. Kesir
 * atılsaydı dokunmatik yüzeyin küçük adımları hiç birikmez, çentik başına 2,94
 * satır da hep 2'ye inerdi.
 */
export class WheelScroller {
  /** Henüz kat edilmemiş mesafe (satır, işaretli). */
  private pending = 0;
  /** Hareketin başından beri kat edilen mesafe (kesirli). */
  private pos = 0;
  /** Hareketin başından beri UYGULANAN tam satır. */
  private applied = 0;

  constructor(private readonly rows: () => number = () => 24) {}

  /** Bekleyen hareket var mı. */
  get idle(): boolean {
    return this.pending === 0;
  }

  /**
   * Yeni tekerlek hareketi ekler.
   *
   * Yön değişince kalan eski hareket ATILIYOR: aşağı kayarken tekerleği yukarı
   * çeviren kullanıcı önce eski yönün bitmesini beklememeli.
   */
  add(lines: number): void {
    if (!Number.isFinite(lines) || lines === 0) return;
    if (this.pending !== 0 && Math.sign(lines) !== Math.sign(this.pending)) {
      this.pending = 0;
      this.pos = this.applied;
    }
    const max = MAX_PENDING_SCREENS * Math.max(1, this.rows());
    this.pending = Math.max(-max, Math.min(max, this.pending + lines));
  }

  /**
   * Bir kare ilerletir; bu karede kaydırılacak TAM satır sayısını döndürür.
   *
   * `dtMs` önceki adımdan bu yana geçen süre: 120/144 Hz ekranda kareler
   * kısa, adımlar da o oranda küçük. Uzun bir kare (sekme meşgul) aradaki
   * mesafeyi bir seferde kapatıyor, hareket gecikip birikmiyor.
   */
  step(dtMs = FRAME_MS): number {
    if (this.pending === 0) return 0;
    const frames = Math.max(4, Math.min(100, dtMs)) / FRAME_MS;
    const left = Math.abs(this.pending);
    const chase = left * (1 - Math.pow(1 - CHASE_PER_FRAME, frames));
    const move = Math.sign(this.pending) * Math.min(left, Math.max(chase, MIN_LINES_PER_FRAME * frames));

    this.pending -= move;
    if (Math.abs(this.pending) < 1e-6) this.pending = 0;
    this.pos += move;

    const target = Math.round(this.pos);
    const out = target - this.applied;
    this.applied = target;
    if (this.pending === 0) {
      // Hareket bitti: yalnızca kesir kalıyor (-0,5..0,5), sayılar büyümüyor.
      this.pos -= this.applied;
      this.applied = 0;
    }
    return out;
  }

  /**
   * Bekleyeni bırakır: görünüm başka bir yoldan kaydı (en alta in, yazı,
   * kaydırma çubuğunu sürükleme) ya da kenara dayandı.
   */
  reset(): void {
    this.pending = 0;
    this.pos = 0;
    this.applied = 0;
  }
}
