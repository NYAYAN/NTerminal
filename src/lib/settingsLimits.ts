import type { Appearance, Behavior, Settings } from "../types";

/**
 * Sayısal ayarların sınırları — TEK yerden.
 *
 * Önceki hâlinde sınırlar üç yere dağılmıştı ve birbirini tutmuyordu: yazı
 * boyutu kaydırıcısı 8–28, ⌘= ise 32'ye kadar çıkıyordu; sayı kutularının
 * `min`/`max`ı yalnızca artır/azalt oklarına bakıyor, elle yazılan değeri hiç
 * sınırlamıyordu. ÖLÇÜLEN: "Kaydırma tamponu" kutusu boşaltılınca ayar 0 oldu
 * ve 0 diske yazıldı.
 *
 * Ayarlar penceresinin denetimleri, kısayollar ve `sanitizeSettings` buradan
 * okuyor. Rust tarafı aynı sınırları `model.rs` içinde (`Settings::sanitize`)
 * uyguluyor: elle düzenlenen ya da içe aktarılan dosya oradan geçiyor.
 *
 * `fallback`: değer sayı DEĞİLSE (bozuk dosya, eski bir sürümün yazdığı alan)
 * yerine konan değer — `model.rs` varsayılanlarıyla aynı.
 */
export interface Limit {
  min: number;
  max: number;
  fallback: number;
}

export const LIMITS = {
  fontSize: { min: 8, max: 32, fallback: 14 },
  lineHeight: { min: 1, max: 2, fallback: 1.5 },
  /*
   * Tam sayı ve bu bilinçli: xterm harf aralığını CİHAZ pikselinde tam
   * sayıya yuvarlıyor. ÖLÇÜLEN (Retina): 0 ile −0,5 aynı hücre genişliğini
   * (8,0 px), 0,5 ile 1 de aynısını (8,5 px) veriyordu — kaydırıcının
   * yarım adımlarının yarısı hiçbir şey değiştirmiyordu.
   */
  letterSpacing: { min: -1, max: 3, fallback: 0 },
  uiFontSize: { min: 11, max: 20, fallback: 14 },
  scrollback: { min: 500, max: 200_000, fallback: 10_000 },
  scrollbackSaveLines: { min: 0, max: 20_000, fallback: 2_000 },
  historyLimit: { min: 100, max: 500_000, fallback: 50_000 },
} as const satisfies Record<string, Limit>;

/** Sayıyı aralığa çeker; sayı değilse `fallback`. */
export function clampTo(value: unknown, limit: Limit): number {
  const n = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(n)) return limit.fallback;
  return Math.min(limit.max, Math.max(limit.min, n));
}

/** Tam sayıya yuvarlayıp aralığa çeker. */
export function clampInt(value: unknown, limit: Limit): number {
  const n = typeof value === "number" ? value : Number.NaN;
  return clampTo(Number.isFinite(n) ? Math.round(n) : n, limit);
}

const CURSOR_STYLES: readonly Appearance["cursorStyle"][] = ["block", "bar", "underline"];

/**
 * Yakınlaştırma farkını, etkin boyut sınırın içinde kalacak şekilde keser.
 *
 * Fark tek başına değil boyutla BİRLİKTE anlamlı: 30 px'lik ayarda +4 yazı
 * boyutunu 34'e çıkarırdı.
 */
function clampZoom(zoom: unknown, fontSize: number): number {
  const z = typeof zoom === "number" && Number.isFinite(zoom) ? Math.round(zoom) : 0;
  return Math.min(LIMITS.fontSize.max - fontSize, Math.max(LIMITS.fontSize.min - fontSize, z));
}

export function sanitizeAppearance(a: Appearance): Appearance {
  const fontSize = clampInt(a.fontSize, LIMITS.fontSize);
  const next: Appearance = {
    ...a,
    fontSize,
    // İki ondalık: kaydırıcı 0,05 adımlı ve kayan nokta artığı (1.5000000002)
    // ayar dosyasına ve "geri al" karşılaştırmasına sızmasın.
    lineHeight: Math.round(clampTo(a.lineHeight, LIMITS.lineHeight) * 100) / 100,
    letterSpacing: clampInt(a.letterSpacing, LIMITS.letterSpacing),
    uiFontSize: clampInt(a.uiFontSize, LIMITS.uiFontSize),
    scrollback: clampInt(a.scrollback, LIMITS.scrollback),
    fontZoom: clampZoom(a.fontZoom, fontSize),
    cursorStyle: CURSOR_STYLES.includes(a.cursorStyle) ? a.cursorStyle : "bar",
  };
  return sameFields(a, next) ? a : next;
}

export function sanitizeBehavior(b: Behavior): Behavior {
  const next: Behavior = {
    ...b,
    scrollbackSaveLines: clampInt(b.scrollbackSaveLines, LIMITS.scrollbackSaveLines),
    historyLimit: clampInt(b.historyLimit, LIMITS.historyLimit),
  };
  return sameFields(b, next) ? b : next;
}

/**
 * Ayarları sınırların içine çeker.
 *
 * Hiçbir şey değişmediyse AYNI nesneyi döndürüyor: depo ayar nesnesini
 * başvuruyla karşılaştırıyor ve "geri al" düğmesi açılıştaki nesneyle
 * kıyaslıyor; gereksiz bir kopya ikisini de yanıltırdı.
 */
export function sanitizeSettings(s: Settings): Settings {
  const appearance = sanitizeAppearance(s.appearance);
  const behavior = sanitizeBehavior(s.behavior);
  if (appearance === s.appearance && behavior === s.behavior) return s;
  return { ...s, appearance, behavior };
}

/**
 * Terminalin GERÇEKTE kullandığı yazı boyutu: ayardaki boyut + kısayolla
 * yapılan yakınlaştırma.
 *
 * İki ayrı sayı ve bu bilinçli. Önceden ⌘= / ⌘- doğrudan ayarı değiştiriyor,
 * ⌘0 ise sabit 14'e dönüyordu — 10 px seçmiş kullanıcıyı 14'e atıyordu.
 * Şimdi ⌘0 farkı sıfırlıyor, yani Ayarlar'da seçilen boyuta dönüyor.
 */
export function terminalFontSize(a: Pick<Appearance, "fontSize" | "fontZoom">): number {
  return clampInt(a.fontSize + (a.fontZoom ?? 0), LIMITS.fontSize);
}

/**
 * Terminallere verilecek ayarlar: yazı boyutu yakınlaştırmayla birlikte.
 *
 * `TerminalSession` farkı bilmiyor, yalnızca tek bir boyut görüyor; fark
 * sıfırsa aynı nesne geçiyor.
 */
export function terminalSettings(s: Settings): Settings {
  const size = terminalFontSize(s.appearance);
  if (size === s.appearance.fontSize && !s.appearance.fontZoom) return s;
  return { ...s, appearance: { ...s.appearance, fontSize: size, fontZoom: 0 } };
}

function sameFields<T extends object>(a: T, b: T): boolean {
  for (const key of Object.keys(b) as (keyof T)[]) {
    if (!Object.is(a[key], b[key])) return false;
  }
  return true;
}
