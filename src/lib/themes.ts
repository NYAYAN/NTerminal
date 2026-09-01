import type { ITheme } from "@xterm/xterm";

import { ensureContrast, harmonizeTheme, onColor } from "./contrast";
import type { MsgKey } from "./messages";

export interface TerminalTheme {
  id: string;
  /** Tema adi da ceviriden geliyor: "Koyu"/"Acik" gibi sifatlar dile bagli. */
  nameKey: MsgKey;
  /** Arayüzün de bu temaya uyması için gereken kabuk renkleri. */
  ui: {
    surface: string;
    surfaceAlt: string;
    border: string;
    text: string;
    textDim: string;
    accent: string;
  };
  xterm: ITheme;
}

export const THEMES: TerminalTheme[] = [
  {
    id: "nterminal-dark",
    nameKey: "theme.nterminalDark",
    ui: {
      surface: "#0d1117",
      surfaceAlt: "#161b22",
      border: "#232b36",
      text: "#e6edf3",
      textDim: "#8b949e",
      accent: "#58a6ff",
    },
    xterm: {
      background: "#0d1117",
      foreground: "#e6edf3",
      cursor: "#58a6ff",
      cursorAccent: "#0d1117",
      selectionBackground: "#264f78",
      black: "#484f58",
      red: "#ff7b72",
      green: "#3fb950",
      yellow: "#d29922",
      blue: "#58a6ff",
      magenta: "#bc8cff",
      cyan: "#39c5cf",
      white: "#b1bac4",
      brightBlack: "#6e7681",
      brightRed: "#ffa198",
      brightGreen: "#56d364",
      brightYellow: "#e3b341",
      brightBlue: "#79c0ff",
      brightMagenta: "#d2a8ff",
      brightCyan: "#56d4dd",
      brightWhite: "#f0f6fc",
    },
  },
  {
    id: "windows-terminal",
    nameKey: "theme.windowsTerminal",
    ui: {
      surface: "#0c0c0c",
      surfaceAlt: "#1a1a1a",
      border: "#2b2b2b",
      text: "#cccccc",
      textDim: "#8a8a8a",
      accent: "#3b78ff",
    },
    xterm: {
      background: "#0c0c0c",
      foreground: "#cccccc",
      cursor: "#ffffff",
      selectionBackground: "#264f78",
      black: "#0c0c0c",
      red: "#c50f1f",
      green: "#13a10e",
      yellow: "#c19c00",
      blue: "#0037da",
      magenta: "#881798",
      cyan: "#3a96dd",
      white: "#cccccc",
      brightBlack: "#767676",
      brightRed: "#e74856",
      brightGreen: "#16c60c",
      brightYellow: "#f9f1a5",
      brightBlue: "#3b78ff",
      brightMagenta: "#b4009e",
      brightCyan: "#61d6d6",
      brightWhite: "#f2f2f2",
    },
  },
  {
    id: "one-half-dark",
    nameKey: "theme.oneHalfDark",
    ui: {
      surface: "#282c34",
      surfaceAlt: "#31363f",
      border: "#3e444e",
      text: "#dcdfe4",
      textDim: "#9aa0aa",
      accent: "#61afef",
    },
    xterm: {
      background: "#282c34",
      foreground: "#dcdfe4",
      cursor: "#a3b3cc",
      selectionBackground: "#474e5d",
      black: "#282c34",
      red: "#e06c75",
      green: "#98c379",
      yellow: "#e5c07b",
      blue: "#61afef",
      magenta: "#c678dd",
      cyan: "#56b6c2",
      white: "#dcdfe4",
      brightBlack: "#5a6374",
      brightRed: "#e06c75",
      brightGreen: "#98c379",
      brightYellow: "#e5c07b",
      brightBlue: "#61afef",
      brightMagenta: "#c678dd",
      brightCyan: "#56b6c2",
      brightWhite: "#ffffff",
    },
  },
  {
    id: "solarized-light",
    nameKey: "theme.solarizedLight",
    ui: {
      surface: "#fdf6e3",
      surfaceAlt: "#eee8d5",
      border: "#d9d2c0",
      text: "#073642",
      textDim: "#657b83",
      accent: "#268bd2",
    },
    xterm: {
      background: "#fdf6e3",
      foreground: "#586e75",
      cursor: "#657b83",
      selectionBackground: "#eee8d5",
      black: "#073642",
      red: "#dc322f",
      green: "#859900",
      yellow: "#b58900",
      blue: "#268bd2",
      magenta: "#d33682",
      cyan: "#2aa198",
      white: "#eee8d5",
      brightBlack: "#002b36",
      brightRed: "#cb4b16",
      brightGreen: "#586e75",
      brightYellow: "#657b83",
      brightBlue: "#839496",
      brightMagenta: "#6c71c4",
      brightCyan: "#93a1a1",
      brightWhite: "#fdf6e3",
    },
  },
];

/**
 * Uyumlandirilmis temalar onbellegi. harmonizeTheme her renk icin karsitlik
 * hesabi yapiyor; tema her sekme olusturmada ve her ayar degisiminde
 * istendigi icin bir kez hesaplayip saklamak yeterli.
 */
const harmonized = new Map<string, TerminalTheme>();

export function getTheme(id: string): TerminalTheme {
  const cached = harmonized.get(id);
  if (cached) return cached;

  const base = THEMES.find((t) => t.id === id) ?? THEMES[0];
  // Palet okunabilirlik guvencesinden geciyor: acik zeminli temalarda arka
  // planla karisan renkler (Solarized Light'ta brightWhite arka planin
  // aynisidir) koyulastiriliyor. Bkz. contrast.ts.
  const xterm = harmonizeTheme(base.xterm);
  /*
   * Genel bakış sütununun ÇERÇEVESİ terminal zeminiyle aynı — yani görünmez.
   *
   * BİLDİRİLEN HATA: "scroll'un hemen sağında beyaz çizgi var, o neden var".
   * Kaydırma çubuğunu 14px'ten 9px'e indirmenin tek yolu `overviewRuler.width`
   * vermek (bkz. TerminalSession'daki gerekçe) ve xterm sütunu çizerken
   * `_renderRulerOutline()` ile sol kenarına KOŞULSUZ 1px'lik dikey bir çizgi
   * atıyor. Yani çizgi bir hata değil, sütunu açmanın bedeliydi.
   *
   * Sütunu buraya bir "ayrı bölge" olarak göstermek istemiyoruz: orası
   * kaydırma çubuğunun kendisi ve arama işaretleri. Çerçeveyi zemine
   * eşitlemek onu görünmez yapıyor, işaretler ise kendi renklerinde kalıyor.
   */
  xterm.overviewRulerBorder = xterm.background ?? base.ui.surface;
  const fixed: TerminalTheme = { ...base, xterm };
  harmonized.set(base.id, fixed);
  return fixed;
}

/** Tema renklerini CSS değişkenlerine yazar; arayüz ve terminal aynı paleti kullanır. */
/**
 * Arayuz metni icin en az karsitlik.
 *
 * 4.5 = WCAG AA (normal boy metin). Durum renkleri hem metin hem dolgu olarak
 * kullaniliyor; metin olarak kullanildigi yer belirleyici oldugu icin sinir
 * oradan aliniyor.
 */
const MIN_UI_TEXT_CONTRAST = 4.5;

export function applyThemeToDocument(theme: TerminalTheme) {
  const root = document.documentElement;
  root.style.setProperty("--surface", theme.ui.surface);
  root.style.setProperty("--surface-alt", theme.ui.surfaceAlt);
  root.style.setProperty("--border", theme.ui.border);
  root.style.setProperty("--text", theme.ui.text);
  root.style.setProperty("--text-dim", theme.ui.textDim);
  root.style.setProperty("--term-bg", theme.xterm.background ?? theme.ui.surface);
  /*
   * Durum renkleri terminal paletinden geliyor ama ARAYUZ yuzeylerinde
   * kullaniliyor (kirmizi metinli "Sil" dugmesi, yesil "entegrasyon" rozeti).
   * Palet, terminal arka planina gore duzeltiliyor (harmonizeTheme); arayuz
   * yuzeyi ise baska bir renk. Olculen sonuc: Windows Terminal temasinda
   * kirmizi metin dugmesi 2.87 karsitlik - okunmuyordu.
   *
   * Burada ayni renkleri ARAYUZ yuzeyine gore de duzeltiyoruz. ensureContrast
   * rengi tonunu koruyarak yalnizca gerektigi kadar itiyor.
   */
  const surface = theme.ui.surfaceAlt;
  const ok = ensureContrast(theme.xterm.green ?? "#3fb950", surface, MIN_UI_TEXT_CONTRAST);
  const err = ensureContrast(theme.xterm.red ?? "#ff7b72", surface, MIN_UI_TEXT_CONTRAST);
  const accent = ensureContrast(theme.ui.accent, surface, MIN_UI_TEXT_CONTRAST);
  root.style.setProperty("--accent", accent);
  root.style.setProperty("--ok", ok);
  root.style.setProperty("--err", err);
  /*
   * Ucuncu bir durum rengi: "dikkat", "yesil degil ama kirmizi da degil".
   *
   * Git'te takip edilmeyen dosya bunu gerektirdi. Once eklenen dosyayla ayni
   * yesildeydi ve "yeni dosya eklendi" diye okunuyordu - oysa eklenen dosya
   * indekste, takip edilmeyen hicbir yerde. Iki farkli durum ayni rengi
   * paylasinca renk bilgi tasimiyor.
   *
   * NOT: `.statusbar .pill.warn` bu degiskeni KULLANMIYOR, `--err`i
   * kullaniyor. Orasi bilincli kirmizi (kullanicidan bir sey isteyen bir
   * eksik); buradaki sari "bilgi" tonu.
   */
  root.style.setProperty(
    "--warn",
    ensureContrast(theme.xterm.yellow ?? "#d29922", surface, MIN_UI_TEXT_CONTRAST),
  );
  // Dolgulu dugmelerin metin rengi: CSS karsitlik hesabi yapamiyor, biz
  // yapiyoruz. Aksi halde koyu vurgu renginde koyu metin cikiyor.
  root.style.setProperty("--accent-fg", onColor(accent));
  root.style.setProperty("--err-fg", onColor(err));

  /*
   * Komut satırının sözdizimi renkleri.
   *
   * Ayrı türetiliyorlar çünkü ayrı bir ZEMİN üzerindeler: kutunun arka planı
   * `--term-bg`, yukarıdaki `--ok`/`--err`/`--accent` ise arayüz yüzeyine
   * (`surfaceAlt`) göre düzeltilmiş. İki yüzey her temada aynı değil —
   * NTerminal Koyu'da terminal yüzeyden daha koyu, açık temalarda tersi
   * olabiliyor. Yüzeye göre düzeltilmiş bir rengi başka bir zeminde kullanmak
   * karşıtlık güvencesini sessizce kaybettirir.
   *
   * Renk seçimi terminal paletinden: kullanıcı zaten `ls` çıktısında bu
   * renkleri görüyor, komut satırı da aynı dili konuşsun.
   */
  const termBg = theme.xterm.background ?? theme.ui.surface;
  root.style.setProperty(
    "--tok-cmd",
    ensureContrast(theme.ui.accent, termBg, MIN_UI_TEXT_CONTRAST),
  );
  root.style.setProperty(
    "--tok-flag",
    ensureContrast(theme.xterm.green ?? "#3fb950", termBg, MIN_UI_TEXT_CONTRAST),
  );
  root.style.setProperty(
    "--tok-str",
    ensureContrast(theme.xterm.yellow ?? "#d29922", termBg, MIN_UI_TEXT_CONTRAST),
  );
  root.dataset.theme = theme.id;
  // Açık temalarda arayüz metin/gölge tonlarının ters çevrilmesi gerekiyor.
  const isLight = theme.id.includes("light");
  root.dataset.tone = isLight ? "light" : "dark";
}

/**
 * Kullanıcının seçtiği bir rengin (profil rengi, grup rengi) METİN olarak
 * okunabilir hâli.
 *
 * ÖLÇÜLEN HATA: kenar çubuğundaki kabuk rozeti ekranda hiç görünmüyordu.
 * Rozet çiziliyordu; rengi profilden geliyor ve Windows PowerShell profilinin
 * rengi `#0e4d92` — koyu lacivert. Koyu tema yüzeyinde karşıtlık 1.4:1, yani
 * 9px kalın bir metin için tümüyle okunmaz. Aynı sorun sekme çubuğundaki
 * rozette ve etkin sekmenin vurgu şeridinde de vardı.
 *
 * Renk bir DOLGU olarak sorun değil (rozet zemini %18 karışımla kullanıyor);
 * metin olarak sorun. `ensureContrast` tonu koruyup yalnızca gerektiği kadar
 * itiyor, yani "PowerShell mavisi" mavi kalıyor — sadece görünür oluyor.
 *
 * Tema uygulanırken yazılan `--accent` / `--ok` / `--err` de aynı hesaptan
 * geçiyor (yukarıda); bu, kullanıcının kendi seçtiği renkler için karşılığı.
 */
export function readableAccent(
  color: string | null | undefined,
  themeId: string,
): string | undefined {
  if (!color) return undefined;
  return ensureContrast(color, getTheme(themeId).ui.surfaceAlt, MIN_UI_TEXT_CONTRAST);
}
