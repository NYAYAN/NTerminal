import type { ITheme } from "@xterm/xterm";

import { ensureContrast, filledColors, harmonizeTheme, luminance } from "./contrast";
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
  /*
   * N-Terminal Koyu'nun açık eşi — "Sistemi izle"nin açık yarısı.
   *
   * Tek açık tema Solarized'dı ve onun kremsi zemini, sistemin açık görünümünün
   * beyaz pencereleri arasında yabancı duruyordu. Palet GitHub'ın açık
   * temasından (Koyu'nunki de GitHub'ın koyusundan); okunabilirlik yine
   * `harmonizeTheme`den geçiyor.
   */
  {
    id: "nterminal-light",
    nameKey: "theme.nterminalLight",
    ui: {
      surface: "#ffffff",
      surfaceAlt: "#f6f8fa",
      border: "#d0d7de",
      text: "#1f2328",
      textDim: "#59636e",
      accent: "#0969da",
    },
    xterm: {
      background: "#ffffff",
      foreground: "#1f2328",
      cursor: "#0969da",
      cursorAccent: "#ffffff",
      selectionBackground: "#c8e1ff",
      black: "#24292f",
      red: "#cf222e",
      green: "#116329",
      yellow: "#4d2d00",
      blue: "#0969da",
      magenta: "#8250df",
      cyan: "#1b7c83",
      white: "#6e7781",
      brightBlack: "#57606a",
      brightRed: "#a40e26",
      brightGreen: "#1a7f37",
      brightYellow: "#633c01",
      brightBlue: "#218bff",
      brightMagenta: "#a475f9",
      brightCyan: "#3192aa",
      brightWhite: "#8c959f",
    },
  },
];

/**
 * "Sistemi izle": bir tema değil, iki tema arasında seçim.
 *
 * Ayarda bu kimlik duruyor; çizen herkes `getTheme` üzerinden geçtiği için
 * çözümleme tek yerde. Sistemin görünümünü `App` izliyor ve değişince
 * `setSystemDark` ile buraya bildiriyor.
 */
export const SYSTEM_THEME = "system";

/** "Sistemi izle"nin iki yarısı; ayarlar penceresi örneğini de bunlardan çiziyor. */
export const SYSTEM_PAIR = { dark: "nterminal-dark", light: "nterminal-light" } as const;

let systemDark =
  typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)").matches : true;

/** Sistemin görünümü değişti (`App` içindeki dinleyici). */
export function setSystemDark(dark: boolean): void {
  systemDark = dark;
}

export function systemPrefersDark(): boolean {
  return systemDark;
}

/** Ayardaki tema kimliğinin ŞU AN çizilen temaya çözümü. */
export function resolveThemeId(id: string): string {
  if (id !== SYSTEM_THEME) return id;
  return systemDark ? SYSTEM_PAIR.dark : SYSTEM_PAIR.light;
}

/**
 * Tema açık mı? Zeminin parlaklığından — adından DEĞİL.
 *
 * Önceki kural `id.includes("light")`tı: "solarized-light" için doğru, ama
 * adında "light" geçmeyen her yeni açık tema koyu sayılıp arayüzün gölge ve
 * metin tonlarını ters çevirirdi.
 */
export function isLightTheme(theme: TerminalTheme): boolean {
  return luminance(theme.xterm.background ?? theme.ui.surface) > 0.4;
}

/**
 * Uyumlandirilmis temalar onbellegi. harmonizeTheme her renk icin karsitlik
 * hesabi yapiyor; tema her sekme olusturmada ve her ayar degisiminde
 * istendigi icin bir kez hesaplayip saklamak yeterli.
 */
const harmonized = new Map<string, TerminalTheme>();

export function getTheme(id: string): TerminalTheme {
  const resolved = resolveThemeId(id);
  const cached = harmonized.get(resolved);
  if (cached) return cached;

  const base = THEMES.find((t) => t.id === resolved) ?? THEMES[0];
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
   * Degisiklikler listesinde DEGISTIRILMIS dosyanin rengi (`.git-icon.mod`).
   * Yesil "yeni", kirmizi "gitti" demek; degisiklik ikisi de degil ve VS Code
   * ile GitHub bunu sariyla soyluyor. Uc durum uc renk: renk ancak
   * paylasilmadiginda bilgi tasiyor.
   *
   * NOT: `.statusbar .pill.warn` bu degiskeni KULLANMIYOR, `--err`i
   * kullaniyor. Orasi bilincli kirmizi (kullanicidan bir sey isteyen bir
   * eksik); buradaki sari "bilgi" tonu.
   */
  root.style.setProperty(
    "--warn",
    ensureContrast(theme.xterm.yellow ?? "#d29922", surface, MIN_UI_TEXT_CONTRAST),
  );
  /*
   * Dolgulu dugmelerin zemini ve metni: CSS karsitlik hesabi yapamiyor, biz
   * yapiyoruz (bkz. `filledColors`). Metin BEYAZ, zemin beyaza 4.5 karsitlik verecek
   * kadar koyulastirilmis vurgu; `--accent` / `--err` ise METIN ve gosterge olarak
   * yuzeyde kaliyor (acik, yuzeye gore duzeltilmis). Iki ayri renk: ayni renk hem
   * koyu yuzeyde metin olarak okunacak kadar acik hem beyaz yaziya zemin olacak kadar
   * koyu olamaz.
   */
  const accentFilled = filledColors(accent);
  const errFilled = filledColors(err);
  root.style.setProperty("--accent-solid", accentFilled.fill);
  root.style.setProperty("--accent-fg", accentFilled.text);
  root.style.setProperty("--accent-chip", accentFilled.chip);
  root.style.setProperty("--err-solid", errFilled.fill);
  root.style.setProperty("--err-fg", errFilled.text);

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
  root.dataset.tone = isLightTheme(theme) ? "light" : "dark";
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
