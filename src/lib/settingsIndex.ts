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
  | "backup"
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
  // Yedekleme: içe / dışa aktarım. Önceden Ayarlar'ın alt çubuğundan açılan
  // ayrı bir pencereydi (gerekçe `BackupPanel` başında).
  { id: "backup", key: "settings.backup" },
  { id: "about", key: "settings.about" },
];

export interface SettingEntry {
  section: Section;
  /**
   * Ayarın altında durduğu başlık (`<h3>`); sonuçta bölümün yanında.
   *
   * Aynı etiket iki yerde olabiliyor ve bu bilinçli: terminal ile arayüz yazı
   * tipinin ikisinde de "Yazı tipi ailesi" / "Boyut" var, hangisi olduğunu
   * başlık söylüyor. Sonuç listesi başlığı göstermeseydi iki "Boyut"
   * ayırt edilemezdi. İki panelli bölümlerde (profiller, gruplar, kısayollar)
   * yok. Test kaynakla karşılaştırıyor.
   */
  group?: MsgKey;
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
  {
    section: "general",
    group: "settings.language",
    key: "settings.languageLabel",
    hint: "settings.languageHint",
  },
  { section: "general", group: "view.heading", key: "view.label", hint: "view.panesHint" },

  // ---------------------------------------------------------------- görünüm
  {
    section: "appearance",
    group: "settings.design",
    key: "settings.designLabel",
    hint: "settings.designHint",
  },
  {
    section: "appearance",
    group: "settings.theme",
    key: "settings.colorTheme",
    hint: "settings.themeSystemHint",
  },
  { section: "appearance", group: "settings.font", key: "settings.fontFamily" },
  { section: "appearance", group: "settings.font", key: "settings.fontSize" },
  { section: "appearance", group: "settings.font", key: "settings.lineHeightLabel" },
  { section: "appearance", group: "settings.font", key: "settings.letterSpacingLabel" },
  {
    section: "appearance",
    group: "settings.uiFont",
    key: "settings.uiFontFamily",
    hint: "settings.uiFontHint",
  },
  {
    section: "appearance",
    group: "settings.uiFont",
    key: "settings.uiFontSize",
    hint: "settings.uiFontHint",
  },
  { section: "appearance", group: "settings.cursorScroll", key: "settings.cursorStyle" },
  { section: "appearance", group: "settings.cursorScroll", key: "settings.cursorBlink" },
  {
    section: "appearance",
    group: "settings.tabsHeading",
    key: "settings.shellBadge",
    hint: "settings.shellBadgeHint",
    hintMac: "settings.shellBadgeHintMac",
  },

  // --------------------------------------------------------------- terminal
  { section: "terminal", group: "settings.copyPaste", key: "settings.copyOnSelect" },
  {
    section: "terminal",
    group: "settings.copyPaste",
    key: "settings.rightClick",
    hint: "settings.rightClickMenu",
  },
  // macOS'ta kopyalama Cmd+C; Ctrl+C ile çakışma olmadığı için ayarın işlevi yok.
  {
    section: "terminal",
    group: "settings.copyPaste",
    key: "settings.ctrlCCopies",
    hint: "settings.ctrlCHint",
    only: ["windows", "linux"],
  },
  {
    section: "terminal",
    group: "settings.links",
    key: "settings.highlightLinks",
    hint: "settings.highlightLinksHint",
  },
  {
    section: "terminal",
    group: "settings.commandLine",
    key: "settings.commandBlocks",
    hint: "settings.commandBlocksHint",
  },
  {
    section: "terminal",
    group: "settings.commandLine",
    key: "settings.blockHeaders",
    hint: "settings.blockHeadersHint",
  },
  {
    section: "terminal",
    group: "settings.commandLine",
    key: "settings.appInput",
    hint: "settings.appInputHint",
  },
  {
    section: "terminal",
    group: "settings.commandLine",
    key: "settings.promptAtBottom",
    hint: "settings.promptAtBottomHint",
  },
  {
    section: "terminal",
    group: "settings.prediction",
    key: "settings.appSuggestions",
    hint: "settings.appSuggestionsHint",
  },
  {
    section: "terminal",
    group: "settings.prediction",
    key: "settings.predictionShell",
    hint: "settings.predictionHint",
    hintMac: "settings.predictionHintMac",
  },
  {
    section: "terminal",
    group: "settings.keyboard",
    key: "settings.macOptionIsMeta",
    hint: "settings.macOptionIsMetaHint",
    only: ["macos"],
  },

  // ----------------------------------------------------------------- oturum
  { section: "session", group: "settings.sessionRestore", key: "settings.restoreSessionLabel" },
  // Kaydırma tamponu Görünüm'den buraya taşındı: diske yazılan satır sayısı
  // onu geçemiyor, ikisi yan yana duruyor.
  {
    section: "session",
    group: "settings.screenOutput",
    key: "settings.scrollbackLines",
    hint: "settings.scrollbackHint",
  },
  { section: "session", group: "settings.screenOutput", key: "settings.restoreScrollbackLabel" },
  {
    section: "session",
    group: "settings.screenOutput",
    key: "settings.scrollbackPerTab",
    hint: "settings.scrollbackPerTabHint",
  },
  { section: "session", group: "settings.newTabs", key: "settings.inheritCwd" },
  {
    section: "session",
    group: "settings.closeTabSection",
    key: "settings.confirmCloseTab",
    hint: "settings.confirmCloseTabHint",
  },
  {
    section: "session",
    group: "settings.closeTabSection",
    key: "settings.closeAction",
    hint: "settings.closeActionHint",
  },

  // ----------------------------------------------------------------- geçmiş
  {
    section: "history",
    group: "settings.history",
    key: "settings.historyLimit",
    hint: "settings.historyLimitHint",
  },
  { section: "history", group: "settings.history", key: "settings.historyDedupeDefault" },

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

  // -------------------------------------------------------------- yedekleme
  // İki kip düğmesi `BackupPanel` içinde `data-setting` taşıyor; aramada
  // "Dışa aktar" / "İçe al" seçilince o düğme vurgulanıyor.
  { section: "backup", key: "transfer.export" },
  { section: "backup", key: "transfer.import" },

  // --------------------------------------------------------------- hakkında
  // Satırın etiketi "Yüklü sürüm" ama aranan şey düğmenin işi: sonuç
  // "Güncellemeleri denetle" diyor, vurgulanan satırda o düğme duruyor.
  { section: "about", group: "update.heading", key: "update.check" },
  { section: "about", group: "update.heading", key: "update.newVersion" },
  { section: "about", group: "update.heading", key: "update.notes" },
  {
    section: "about",
    group: "update.heading",
    key: "update.autoCheck",
    hint: "update.autoCheckHint",
  },
  { section: "about", group: "settings.developerHeading", key: "settings.developerLabel" },
  { section: "about", group: "settings.developerHeading", key: "settings.sourceCode" },
  { section: "about", group: "settings.developerHeading", key: "settings.licenseLabel" },
  { section: "about", group: "settings.fileLocations", key: "settings.dataFolder" },
  { section: "about", group: "settings.fileLocations", key: "settings.workspaceFile" },
  { section: "about", group: "settings.fileLocations", key: "settings.integrationDir" },
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
  /** Gösterilecek etiket metni (çevrilmiş, yer tutucusuz). */
  label: string;
  /** Bölüm adı (çevrilmiş). */
  sectionLabel: string;
  /** Başlık (çevrilmiş); iki panelli bölümlerde yok. */
  groupLabel?: string;
}

/**
 * Etiketin aramada gösterilecek hâli: doldurulmamış yer tutucu olmadan.
 *
 * ÖLÇÜLEN: "boyut" araması "Boyut ({n} px)" ve "Arayüz boyutu ({n} px)"
 * gösteriyordu — etiket ekranda değerle dolduruluyor ("Boyut (14 px)"), aramada
 * değer yok. Yer tutucu taşıyan parantez bütünüyle düşüyor.
 */
export function settingLabel(text: string): string {
  return text
    .replace(/\s*\([^()]*\{\w+\}[^()]*\)/g, "")
    .replace(/\{\w+\}/g, "")
    .trim();
}

/**
 * Türkçe ünsüz yumuşaması için sorgunun kısa hâli; uymuyorsa `null`.
 *
 * "aralık" yazan "Harf aralığı"nı bulamıyordu: k ek alınca ğ oluyor ve
 * sadeleştirilmiş hâlleri de ayrışıyor (aralik / araligi). Aynısı ç, p, t
 * için (ağaç → ağacı, kitap → kitabı). Son harf atılmış sorgu da deneniyor —
 * yalnızca son sözcük harflerden oluşuyor ve yumuşayan bir harfle bitiyorsa;
 * kısa sözcükte değil, "ip" gibi bir sorgu her şeyi eşlerdi.
 */
export function softened(needle: string): string | null {
  return /[a-z]{3}[kcpt]$/.test(needle) ? needle.slice(0, -1) : null;
}

/**
 * Ayarlarda arama.
 *
 * Etiket eşleşmesi açıklama eşleşmesinden önce geliyor: kullanıcı bir ayarın
 * ADINI yazdığında onu en üstte görmeli, açıklamasında o kelime geçen başka
 * ayarlar altta. Başlık da etiket gibi sayılıyor: "arayüz" yazan, "Arayüz
 * yazı tipi" başlığının altındaki iki ayarı bulmalı.
 */
export function searchSettings(query: string, t: Translate): SettingHit[] {
  const needle = fold(query.trim());
  if (!needle) return [];
  const short = softened(needle);
  const has = (text: string) => {
    const folded = fold(text);
    return folded.includes(needle) || (short !== null && folded.includes(short));
  };

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

    const label = settingLabel(t(entry.key));
    const groupLabel = entry.group ? t(entry.group) : undefined;
    const hit: SettingHit = {
      ...entry,
      label,
      sectionLabel: sectionLabel.get(entry.section) ?? entry.section,
      groupLabel,
    };

    if (has(label) || has(hit.sectionLabel) || (groupLabel !== undefined && has(groupLabel))) {
      byLabel.push(hit);
      continue;
    }
    // Ekranda hangi ipucu duruyorsa onda arıyoruz.
    const hint = mac && entry.hintMac ? entry.hintMac : entry.hint;
    if (hint && has(t(hint))) byHint.push(hit);
  }

  return [...byLabel, ...byHint];
}
