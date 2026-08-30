/**
 * Uygulamayla birlikte gelen yazı tipleri.
 *
 * Yazı tipi ayarı serbest metin ve öyle kalmalı — kullanıcının sistemindeki
 * herhangi bir yazı tipini yazabilmesi gerekiyor. Ama serbest metin tek başına
 * gömülü aileleri GÖRÜNMEZ kılıyor: kullanıcı "JetBrains Mono" yazabileceğini
 * bilmiyorsa o dosyalar boşuna paketlenmiş oluyor. Ayarlardaki alan bu yüzden
 * bir öneri listesi (`<datalist>`) gösteriyor; yazmayı engellemiyor, yalnızca
 * neyin hazır olduğunu söylüyor.
 *
 * Buradaki adlar `styles/fonts.css` içindeki `@font-face` aileleriyle birebir
 * aynı olmak zorunda; ayrılırlarsa liste var olmayan bir yazı tipi öneriyor ve
 * seçen kullanıcı sessizce jenerik `monospace`e düşüyor. Test bağlıyor.
 */

export interface BundledFont {
  /** `@font-face` ailesinin adı. */
  family: string;
  /** Ayara yazılan tam yığın: aile + geri düşüş. */
  stack: string;
}

export const BUNDLED_FONTS: BundledFont[] = [
  {
    family: "JetBrains Mono",
    stack: "JetBrains Mono, Menlo, Consolas, monospace",
  },
  {
    family: "IBM Plex Mono",
    stack: "IBM Plex Mono, Menlo, Consolas, monospace",
  },
];
