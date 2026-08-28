/**
 * Tema paletlerinin okunabilirlik güvencesi.
 *
 * Neden gerekli: geleneksel terminal paletleri açık zeminde okunamayan renkler
 * içeriyor. Resmî Solarized Light şemasında `brightWhite` doğrudan arka planla
 * aynı (`#fdf6e3`), `white` ise bir tık farkı olan `#eee8d5`. Kabuklar bu
 * renkleri bolca kullandığı için (PSReadLine sayıları "White" ile boyuyor,
 * pek çok araç vurgu için "bright white" veriyor) yazılan metin görünmez
 * oluyor.
 *
 * Çözüm tek tek renk düzeltmek değil: paletteki her rengi arka plana karşı
 * ölçüp, gereken en düşük karşıtlığı sağlayana kadar açıklığını kaydırıyoruz.
 * Böylece bundan sonra eklenecek temalar da kendiliğinden güvenli oluyor.
 */

import type { ITheme } from "@xterm/xterm";

/** Normal palet renkleri için en düşük karşıtlık (WCAG AA - büyük metin/arayüz ögesi). */
export const MIN_PALETTE_CONTRAST = 3.2;
/** Varsayılan metin rengi için en düşük karşıtlık (WCAG AA - normal metin). */
export const MIN_FOREGROUND_CONTRAST = 4.5;

interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function parseHex(hex: string): Rgb | null {
  const clean = hex.trim().replace(/^#/, "");
  if (clean.length === 3) {
    const [r, g, b] = clean.split("");
    return {
      r: parseInt(r + r, 16),
      g: parseInt(g + g, 16),
      b: parseInt(b + b, 16),
    };
  }
  if (clean.length === 6 || clean.length === 8) {
    const value = clean.slice(0, 6);
    if (!/^[0-9a-fA-F]{6}$/.test(value)) return null;
    return {
      r: parseInt(value.slice(0, 2), 16),
      g: parseInt(value.slice(2, 4), 16),
      b: parseInt(value.slice(4, 6), 16),
    };
  }
  return null;
}

function toHex({ r, g, b }: Rgb): string {
  const part = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** WCAG bağıl parlaklık. */
export function luminance(color: string): number {
  const rgb = parseHex(color);
  if (!rgb) return 0;
  const channel = (raw: number) => {
    const v = raw / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

/** WCAG karşıtlık oranı: 1 (aynı renk) ile 21 (siyah/beyaz) arası. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

function mix(color: Rgb, target: Rgb, amount: number): Rgb {
  return {
    r: color.r + (target.r - color.r) * amount,
    g: color.g + (target.g - color.g) * amount,
    b: color.b + (target.b - color.b) * amount,
  };
}

/**
 * Rengi arka plandan uzaklaştırarak istenen karşıtlığa çıkarır.
 *
 * Ton (hue) korunuyor: rengi siyaha ya da beyaza doğru karıştırıyoruz, hangi
 * yön arka plandan uzaklaşıyorsa. Açık zeminde koyulaşır, koyu zeminde açılır -
 * yani rengin kimliği kalır, sadece okunur hâle gelir.
 */
/**
 * Dolgu renginin üzerine yazılacak metin rengi: siyah mı beyaz mı.
 *
 * Vurgu rengi temaya göre değişiyor (açık mavi, koyu mavi, mor…) ve dolgulu
 * bir düğmenin metnini sabit bir renge bağlamak bazı temalarda okunmaz
 * bırakıyor. Hangisi daha yüksek karşıtlık veriyorsa o seçiliyor — CSS bu
 * hesabı yapamadığı için tema uygulanırken bir değişkene yazılıyor.
 */
export function onColor(background: string): string {
  const black = "#0b0f14";
  const white = "#ffffff";
  return contrastRatio(white, background) >= contrastRatio(black, background) ? white : black;
}

export function ensureContrast(color: string, background: string, minRatio: number): string {
  const rgb = parseHex(color);
  if (!rgb) return color;
  if (contrastRatio(color, background) >= minRatio) return color;

  // Arka plan açıksa koyulaştır, koyuysa açtır.
  const bgLuminance = luminance(background);
  const target: Rgb = bgLuminance > 0.5 ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 };

  // İkili arama yerine kaba adım: 20 adım yeterli hassasiyet veriyor ve
  // sonucun yuvarlanmış hex değeri belirleyici (deterministik) oluyor.
  for (let step = 1; step <= 20; step++) {
    const candidate = toHex(mix(rgb, target, step / 20));
    if (contrastRatio(candidate, background) >= minRatio) return candidate;
  }
  // Uç durum: hiç yetmediyse tam kontrast rengini ver.
  return toHex(target);
}

/** xterm paletinde metin olarak çizilen alanlar. Arka plan/seçim rengi hariç. */
const TEXT_KEYS = [
  "black",
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "white",
  "brightBlack",
  "brightRed",
  "brightGreen",
  "brightYellow",
  "brightBlue",
  "brightMagenta",
  "brightCyan",
  "brightWhite",
] as const satisfies readonly (keyof ITheme)[];

/**
 * Temayı okunabilir hâle getirir: arka planla karışan hiçbir renk kalmaz.
 * Zaten yeterli karşıtlığa sahip renklere dokunulmaz, dolayısıyla koyu
 * temalar (paletleri bu açıdan sağlam) olduğu gibi kalıyor.
 */
export function harmonizeTheme(theme: ITheme): ITheme {
  const background = theme.background;
  if (!background) return theme;

  const out: ITheme = { ...theme };

  if (out.foreground) {
    out.foreground = ensureContrast(out.foreground, background, MIN_FOREGROUND_CONTRAST);
  }
  for (const key of TEXT_KEYS) {
    const value = out[key];
    if (typeof value === "string") {
      out[key] = ensureContrast(value, background, MIN_PALETTE_CONTRAST);
    }
  }
  // İmleç arka planda kaybolmasın; onu da metin gibi ele alıyoruz.
  if (out.cursor) {
    out.cursor = ensureContrast(out.cursor, background, MIN_PALETTE_CONTRAST);
  }
  return out;
}
