/**
 * Renkli istemin renkleri: ayardan kabuğa giden hâl.
 *
 * Kullanıcı Ayarlar'dan `#rrggbb` seçiyor (kullanıcı@makine ve klasör için ayrı
 * ayrı); kabuk betikleri (`nterminal.zsh`, `nterminal.sh`) bunu `R;G;B` olarak
 * alıp istemin içine ham SGR (`38;2;R;G;B`) yazıyor. Boş değer "seçilmedi"
 * demek: betik temanın paletini (yeşil / mavi) kullanmaya devam ediyor.
 *
 * ## Neden düzeltiliyor
 *
 * Seçilen renk terminalin ZEMİNİNE karşı okunmayabilir (koyu temada koyu mavi,
 * açık temada açık sarı). Palet renkleri bu güvenceden zaten geçiyor
 * (`contrast.ts`, `harmonizeTheme`); truecolor bir SGR ise geçmez, xterm'e
 * olduğu gibi gider. Aynı eşik (`MIN_PALETTE_CONTRAST`) burada uygulanıyor:
 * ton korunuyor, yalnızca okunacak kadar açılıyor ya da koyulaşıyor, yani
 * "seçtiğim mavi" mavi kalıyor. Kullanıcının seçtiği renkleri metin olarak
 * kullanmadan önce süzmek bu depoda genel kural (bkz. `readableAccent`).
 *
 * Renk kabuk başlarken sabitleniyor: tema sonradan değişirse açık sekmeler
 * eski rengi tutar, yeni sekmeler yenisini alır (istemin kendisi de öyle).
 */

import { MIN_PALETTE_CONTRAST, ensureContrast, parseHex } from "./contrast";
import { getTheme } from "./themes";

/** Renk seçici (`ColorPanel`) her zaman bu biçimi veriyor; başka her şey geçersiz sayılıyor. */
const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * Seçilen rengin kabuğa gidecek `R;G;B` (ondalık) hâli; seçilmemiş ya da
 * geçersizse `""` — betik o zaman palet rengine düşüyor.
 *
 * Kabuk betiği değeri bir kaçış dizisinin İÇİNE yazıyor ve yalnızca rakam ile `;`
 * kabul ediyor (bkz. betikler). Buradan başka bir şey çıkması zaten mümkün değil.
 */
export function promptRgb(color: string | null | undefined, themeId: string): string {
  const picked = color?.trim();
  if (!picked || !HEX.test(picked)) return "";
  const background = getTheme(themeId).xterm.background ?? "#000000";
  const rgb = parseHex(ensureContrast(picked, background, MIN_PALETTE_CONTRAST));
  return rgb ? `${rgb.r};${rgb.g};${rgb.b}` : "";
}

/**
 * Renk seçilmemişken istemin GERÇEKTE göründüğü renkler (ayar penceresindeki
 * örnek kutusu için).
 *
 * İstem kalın yeşil / mavi yazılıyor ve xterm kalın + palet rengini (0-7) PARLAK
 * karşılığıyla çiziyor (`drawBoldTextInBrightColors` varsayılan açık), yani
 * ekranda görünen `green` değil `brightGreen`.
 */
export function defaultPromptColors(themeId: string): { user: string; dir: string } {
  const palette = getTheme(themeId).xterm;
  return {
    user: palette.brightGreen ?? palette.green ?? "#3fb950",
    dir: palette.brightBlue ?? palette.blue ?? "#58a6ff",
  };
}
