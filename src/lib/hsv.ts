/**
 * Renk seçicinin (`ColorPanel`) hesabı: onaltılık renk kodu ↔ HSV.
 *
 * HSV çünkü seçicinin iki parçası doğrudan onun eksenleri: ton çubuğu `h`,
 * alanın yatayı doygunluk `s`, dikeyi parlaklık `v`.
 */

/** Ton 0-360, doygunluk ve parlaklık 0-1. */
export interface Hsv {
  h: number;
  s: number;
  v: number;
}

/**
 * Kullanıcının yazdığı kodu `#rrggbb` biçimine getirir; geçersizse `null`.
 * `#` isteğe bağlı, üç haneli kısa yazım (`#abc`) açılıyor, harfler küçülüyor.
 */
export function normalizeHex(input: string): string | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(input.trim());
  if (!match) return null;
  const digits =
    match[1].length === 3
      ? [...match[1]].map((c) => c + c).join("")
      : match[1];
  return `#${digits.toLowerCase()}`;
}

export function hexToHsv(hex: string): Hsv | null {
  const clean = normalizeHex(hex);
  if (!clean) return null;
  const r = parseInt(clean.slice(1, 3), 16) / 255;
  const g = parseInt(clean.slice(3, 5), 16) / 255;
  const b = parseInt(clean.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

export function hsvToHex({ h, s, v }: Hsv): string {
  const c = v * s;
  const sector = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((sector % 2) - 1));
  const [r, g, b] =
    sector < 1
      ? [c, x, 0]
      : sector < 2
        ? [x, c, 0]
        : sector < 3
          ? [0, c, x]
          : sector < 4
            ? [0, x, c]
            : sector < 5
              ? [x, 0, c]
              : [c, 0, x];
  const m = v - c;
  const part = (n: number) =>
    Math.round(Math.min(1, Math.max(0, n + m)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}
