import type { Translate } from "./i18n";
import type { MsgKey } from "./messages";
import { isMac, platform, type Platform } from "./platform";

/**
 * Ayar bölümleri.
 *
 * `SettingsDialog` yerine burada: arama indeksi bölüm kimliklerini kullanıyor
 * ve tipin iki yerde tanımlı olması kaçınılmaz olarak birbirinden ayrılıyor.
 */
export type Section =
  | "general"
  | "appearance"
  | "terminal"
  | "session"
  | "history"
  | "profiles"
  | "groups"
  | "keys"
  | "about";

export const SECTIONS: { id: Section; key: MsgKey }[] = [
  { id: "general", key: "settings.general" },
  { id: "appearance", key: "settings.appearance" },
  { id: "terminal", key: "settings.navTerminal" },
  { id: "session", key: "settings.session" },
  { id: "history", key: "settings.navHistory" },
  { id: "profiles", key: "settings.profiles" },
  { id: "groups", key: "settings.groups" },
  { id: "keys", key: "settings.keys" },
  { id: "about", key: "settings.about" },
];

export interface SettingEntry {
  section: Section;
  /** Ayarın etiketi; aramada ve sonuç listesinde gösterilen metin. */
  key: MsgKey;
  /** Açıklama satırı — aramaya dahil, çünkü kullanıcı ne yaptığını arıyor. */
  hint?: MsgKey;
  /**
   * macOS'ta gösterilen açıklama, farklıysa.
   *
   * Arama GÖRÜNEN metne göre çalışmalı: mac'te "PSReadLine" yazan bir ipucu
   * ekranda yok, onu aramada eşleştirmek yanlış sonuç verir; "zsh-autosuggestions"
   * ise ekranda var ve eşleşmeli.
   */
  hintMac?: MsgKey;
  /**
   * Ayarın var olduğu platformlar. Yazılmazsa her platformda var.
   *
   * Bazı ayarlar arayüzde koşullu çiziliyor (Option/Meta yalnızca mac'te,
   * Ctrl+C kopyalama yalnızca Windows'ta). O ayarların diğer platformlarda
   * arama sonucunda GÖRÜNMEMESİ gerekiyor: tıklayan kullanıcı hiçbir yere
   * gitmiyor, sonuç var ama satır yok.
   */
  only?: Platform[];
}

/**
 * Aranabilir ayarlar.
 *
 * Elle tutulan bir liste ama **sürüklenemez**: `settingsIndex.test.ts`
 * `SettingsDialog.tsx` kaynağını tarayıp her bölümde kullanılan etiket
 * anahtarlarını buradaki listeyle karşılaştırıyor. Yeni bir ayar eklenip
 * buraya yazılmazsa test düşüyor.
 */
export const SETTINGS_INDEX: SettingEntry[] = [
  // ------------------------------------------------------------------ genel
  { section: "general", key: "settings.languageLabel", hint: "settings.languageHint" },
  { section: "general", key: "view.label", hint: "view.panesHint" },

  // ---------------------------------------------------------------- görünüm
  { section: "appearance", key: "settings.colorTheme" },
  { section: "appearance", key: "settings.fontFamily" },
  { section: "appearance", key: "settings.fontSize" },
  { section: "appearance", key: "settings.lineHeightLabel" },
  { section: "appearance", key: "settings.letterSpacingLabel" },
  { section: "appearance", key: "settings.cursorStyle" },
  { section: "appearance", key: "settings.cursorBlink" },
  { section: "appearance", key: "settings.scrollbackLines", hint: "settings.scrollbackHint" },
  { section: "appearance", key: "settings.shellBadge", hint: "settings.shellBadgeHint" },

  // --------------------------------------------------------------- terminal
  { section: "terminal", key: "settings.copyOnSelect" },
  { section: "terminal", key: "settings.rightClick", hint: "settings.rightClickMenu" },
  // macOS'ta kopyalama Cmd+C; Ctrl+C ile çakışma olmadığı için ayarın işlevi yok.
  {
    section: "terminal",
    key: "settings.ctrlCCopies",
    hint: "settings.ctrlCHint",
    only: ["windows", "linux"],
  },
  { section: "terminal", key: "settings.highlightLinks", hint: "settings.highlightLinksHint" },
  { section: "terminal", key: "settings.commandBlocks", hint: "settings.commandBlocksHint" },
  { section: "terminal", key: "settings.blockHeaders", hint: "settings.blockHeadersHint" },
  { section: "terminal", key: "settings.appInput", hint: "settings.appInputHint" },
  { section: "terminal", key: "settings.promptAtBottom", hint: "settings.promptAtBottomHint" },
  { section: "terminal", key: "settings.appSuggestions", hint: "settings.appSuggestionsHint" },
  { section: "terminal", key: "settings.predictionShell", hint: "settings.predictionHint", hintMac: "settings.predictionHintMac" },
  {
    section: "terminal",
    key: "settings.macOptionIsMeta",
    hint: "settings.macOptionIsMetaHint",
    only: ["macos"],
  },

  // ----------------------------------------------------------------- oturum
  { section: "session", key: "settings.restoreSessionLabel" },
  { section: "session", key: "settings.restoreScrollbackLabel" },
  { section: "session", key: "settings.scrollbackPerTab", hint: "settings.scrollbackPerTabHint" },
  { section: "session", key: "settings.inheritCwd" },
  { section: "session", key: "settings.confirmCloseTab", hint: "settings.confirmCloseTabHint" },
  { section: "session", key: "settings.closeAction", hint: "settings.closeActionHint" },

  // ----------------------------------------------------------------- geçmiş
  { section: "history", key: "settings.historyLimit", hint: "settings.historyLimitHint" },
  { section: "history", key: "settings.historyDedupeDefault" },

  // -------------------------------------------------------------- profiller
  { section: "profiles", key: "common.name" },
  { section: "profiles", key: "settings.shellKind" },
  { section: "profiles", key: "settings.executable" },
  { section: "profiles", key: "settings.args" },
  { section: "profiles", key: "settings.startFolder" },
  { section: "profiles", key: "common.color" },
  { section: "profiles", key: "settings.shellIntegrationLoad" },
  { section: "profiles", key: "settings.defaultProfile" },
  { section: "profiles", key: "settings.envVars" },

  // ---------------------------------------------------------------- gruplar
  { section: "groups", key: "settings.groupName" },
  { section: "groups", key: "settings.groupDefaultProfile", hint: "settings.groupProfileHint" },
  { section: "groups", key: "settings.groupEnvVars" },

  // ------------------------------------------------------------- kısayollar
  { section: "keys", key: "settings.keysHeading", hint: "settings.keysHint" },

  // --------------------------------------------------------------- hakkında
  { section: "about", key: "settings.developerLabel" },
  { section: "about", key: "settings.sourceCode" },
  { section: "about", key: "settings.licenseLabel" },
  { section: "about", key: "settings.dataFolder" },
  { section: "about", key: "settings.workspaceFile" },
  { section: "about", key: "settings.integrationDir" },
];

/*
 * "Sifirlama" ARTIK BURADA DEGIL.
 *
 * Genel sifirlama Hakkinda bolumunun dibinden pencere altligina tasindi
 * (gerekce `SettingsDialog` icinde). Indekste kalmasi, aramada cikan bir
 * sonucun kullaniciyi Hakkinda bolumune goturup orada hicbir sey
 * bulamamasi demekti - bagli olmayan bir arama sonucu, sonuc yokluğundan
 * kotu. Altliktaki dugme her bolumde gorunuyor, aramaya ihtiyaci yok.
 */

/**
 * Arama için metin normalleştirme.
 *
 * Türkçe harfler sadeleştiriliyor: kullanıcı "gorunum" yazdığında "Görünüm"
 * bulunmalı — aksanlı harfe basmak zorunda kalmak arama kutusunu kullanılmaz
 * hâle getiriyor. `toLocaleLowerCase("tr")` ayrıca I/İ ayrımını doğru yapıyor.
 */
export function fold(text: string): string {
  return text
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/â/g, "a")
    .replace(/î/g, "i")
    .replace(/û/g, "u");
}

export interface SettingHit extends SettingEntry {
  /** Gösterilecek etiket metni (çevrilmiş). */
  label: string;
  /** Bölüm adı (çevrilmiş). */
  sectionLabel: string;
}

/**
 * Ayarlarda arama.
 *
 * Etiket eşleşmesi açıklama eşleşmesinden önce geliyor: kullanıcı bir ayarın
 * ADINI yazdığında onu en üstte görmeli, açıklamasında o kelime geçen başka
 * ayarlar altta.
 */
export function searchSettings(query: string, t: Translate): SettingHit[] {
  const needle = fold(query.trim());
  if (!needle) return [];

  const sectionLabel = new Map<Section, string>(
    SECTIONS.map((s) => [s.id, t(s.key)] as const),
  );

  const byLabel: SettingHit[] = [];
  const byHint: SettingHit[] = [];

  const mac = isMac();
  const here = platform();

  for (const entry of SETTINGS_INDEX) {
    // Bu platformda çizilmeyen ayar aramada da çıkmamalı.
    if (entry.only && !entry.only.includes(here)) continue;

    const label = t(entry.key);
    const hit: SettingHit = {
      ...entry,
      label,
      sectionLabel: sectionLabel.get(entry.section) ?? entry.section,
    };

    if (fold(label).includes(needle) || fold(hit.sectionLabel).includes(needle)) {
      byLabel.push(hit);
      continue;
    }
    // Ekranda hangi ipucu duruyorsa onda arıyoruz.
    const hint = mac && entry.hintMac ? entry.hintMac : entry.hint;
    if (hint && fold(t(hint)).includes(needle)) byHint.push(hit);
  }

  return [...byLabel, ...byHint];
}
