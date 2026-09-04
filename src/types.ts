// Rust tarafındaki model.rs / transfer.rs ile birebir eşleşen tipler.
// serde `rename_all = "camelCase"` kullanıyor, o yüzden alanlar camelCase.

import type { Platform } from "./lib/platform";

export type { Platform };

export type ShellKind =
  | "power-shell"
  | "pwsh"
  | "cmd"
  | "bash"
  | "wsl"
  | "zsh"
  | "fish"
  | "custom";

export type RightClickAction = "menu" | "paste" | "copyPaste";

/** Sekme kapatılırken onay sorulsun mu. */
export type ConfirmCloseTab = "always" | "running" | "never";

/** Kabuğun komut önerisi (PSReadLine tahmini) görünümü. */
export type ShellPrediction = "off" | "inline" | "list";

/**
 * Pencere kapatılınca ne olsun.
 *
 * "background": pencere gizlenir, uygulama menü çubuğu (macOS) / bildirim
 * alanı (Windows) simgesinde yaşamaya devam eder — çalışan komutlar kesilmez.
 */
export type CloseAction = "quit" | "background";

export type ViewMode = "tabs" | "panes";

/** Arayüz dili. */
export type Lang = "tr" | "en";

export interface Profile {
  id: string;
  name: string;
  kind: ShellKind;
  shell: string;
  args: string[];
  cwd: string | null;
  env: Record<string, string>;
  shellIntegration: boolean;
  color: string | null;
  icon: string | null;
  unavailable: boolean;
}

export interface Appearance {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  /**
   * Arayüz yazı tipi. Boş dize = sistemin kendi arayüz ailesi.
   *
   * Terminalinkinden AYRI ve bu bilinçli: terminal eş aralıklı olmak zorunda
   * (sütun hizası ondan geliyor), arayüz değil. Tek ayara bağlamak, arayüzü
   * okunaklı bir metin yazı tipine geçirmek isteyen kişiye terminalini
   * bozdururdu.
   */
  uiFontFamily: string;
  /**
   * Arayüz yazı tipi ölçüsü (px).
   *
   * Arayüzün bütün ölçüleri buna göre (`--ui-font-size`, `styles/global.css`
   * içinde `rem`). Terminal etkilenmiyor: onun ölçüsü `fontSize` ve kaç sütun
   * sığdığını o belirliyor.
   */
  uiFontSize: number;
  theme: string;
  cursorStyle: "block" | "bar" | "underline";
  cursorBlink: boolean;
  scrollback: number;
  sidebarWidth: number;
  /** Sağ panelin (geçmiş / favoriler) genişliği. */
  panelWidth: number;
  /**
   * Dosya sütununun (grupların sağındaki ağaç / görüntüleyici) genişliği.
   *
   * Kenar çubuğundan AYRI bir ölçü: o sekme adlarını gösteriyor, burası dosya
   * İÇERİĞİNİ de gösteriyor ve kod okumak için daha fazla yer istiyor.
   */
  filesWidth: number;
  /** Çıktıdaki bağlantıları renkli göster. */
  highlightLinks: boolean;
  /** Terminal alanı: tek sekme mi, grubun tüm sekmeleri döşenmiş mi. */
  viewMode: ViewMode;
  /**
   * Sekmenin solundaki kabuk rozeti ("PS", "CMD", "WSL") görünsün mü.
   *
   * Kapatılabilir: tek profille çalışan kullanıcıda rozet her satırda aynı
   * şeyi tekrar ediyor ve dar kenar çubuğunda sekme adına ayrılan yeri yiyor.
   */
  showShellBadge: boolean;
  /**
   * Grup kenar çubuğu daraltılmış mı.
   *
   * Geçici arayüz durumu değil ayar: kullanıcı çubuğu kapattıysa uygulamayı
   * yeniden açtığında da kapalı bekliyor.
   */
  sidebarCollapsed: boolean;
  /**
   * Favoriler panelinde DARALTILMIŞ grup adları.
   *
   * Neden liste: favori grubu ayrı bir varlık değil, favorinin üzerinde duran
   * serbest bir metin. Üzerine "daraltıldı" yazacak bir kayıt yok.
   *
   * Boş dize GRUPLANMAMIŞ bölümü demek — güvenli bir nöbetçi, çünkü grup
   * adları kaydedilirken kırpılıyor ve boş olanlar gruplanmamış sayılıyor:
   * gerçek bir grup asla `""` olamıyor.
   */
  collapsedFavoriteFolders: string[];
}

export interface Behavior {
  restoreSession: boolean;
  restoreScrollback: boolean;
  scrollbackSaveLines: number;
  /** Sekme kapatma onayı: her zaman / yalnızca komut çalışıyorsa / hiç. */
  confirmCloseTab: ConfirmCloseTab;
  copyOnSelect: boolean;
  /** Terminalde sağ tık: menü aç / yapıştır / seçim varsa kopyala yoksa yapıştır. */
  rightClickAction: RightClickAction;
  /** Ctrl+C seçim varken kopyalasın; seçim yoksa kabuğa SIGINT olarak gider. */
  ctrlCCopiesSelection: boolean;
  inheritCwd: boolean;
  historyLimit: number;
  historyDedupe: boolean;
  /** Kenar çubuğunda yalnızca favori grupları göster. */
  showOnlyFavoriteGroups: boolean;
  /** Uygulama tarafı komut önerisi (uygulamanın kendi geçmişinden). */
  appSuggestions: boolean;
  /** Kabukta komut önerisi: kapalı / satır içi hayalet metin / liste. */
  shellPrediction: ShellPrediction;
  /**
   * Komut satırı her zaman pencerenin dibinde dursun.
   *
   * Kabuk entegrasyonu istemi çizmeden önce imleci son satıra indiriyor;
   * üstte kalan boşluğa çıktılar ve öneri paneli yerleşiyor (Warp düzeni).
   */
  promptAtBottom: boolean;
  /**
   * Komut satırını uygulama çizsin (terminalin ızgarasının dışında).
   *
   * Açıkken yazdıklarınız pencerenin dibindeki kutuda toplanıyor ve kabuğa
   * Enter'da gidiyor; kaydırma satırı oynatmıyor. Yalnızca kabuk istemde
   * beklerken geçerli — komut çalışırken, tam ekran programlarda ve kabuk
   * entegrasyonu olmayan profillerde tuşlar doğrudan terminale gidiyor
   * (bkz. `lib/inputMode.ts`).
   */
  appInput: boolean;
  /**
   * Komut blokları: her komut ve çıktısı görsel olarak ayrı bir birim.
   *
   * Sınırlar kabuk entegrasyonundan (OSC 133) geliyor; entegrasyonu olmayan
   * profillerde hiçbir şey çizilmiyor.
   */
  commandBlocks: boolean;
  /**
   * Kabugun istemi yerine blogun kendi basligi.
   *
   * Acikken kabuk gorunur bir istem yazmiyor (yalnizca isaretler ve bir bos
   * satir); dizin, sure ve cikis durumu o bos satira uygulama tarafindan
   * ciziliyor. `PS C:\\Users\\...>` ekrandan kalkiyor.
   *
   * Simdilik yalnizca PowerShell. Kabuk kipe girdigini BILDIRIYOR ve arayuz
   * yalnizca bildirenlerde baslik ciziyor: bildirmeyen bir kabukta bos satir
   * olmaz ve baslik ciktinin ustunu orterdi.
   */
  blockHeaders: boolean;
  /**
   * YALNIZCA macOS: Option tuşu Meta gibi davransın.
   *
   * Açıkken Option+B / Option+F / Option+Backspace kabuğa ESC dizisi olarak
   * gidiyor — Windows'ta Alt'ın yaptığı iş. Varsayılan kapalı: Türkçe Mac
   * klavyesinde `@` = Option+Q, açık olsa `@` yazılamazdı.
   */
  macOptionIsMeta: boolean;
  /** Kapatma düğmesi: tamamen çık ya da arka planda kal. */
  closeAction: CloseAction;
  /**
   * Açılışta yeni sürüm var mı diye baksın mı.
   *
   * Kapatılabilir olması şart: bu bir AĞ İSTEĞİ ve kullanıcının haberi olmadan
   * yapılan bir istek olmamalı.
   */
  checkUpdates: boolean;
}

export interface Settings {
  version: number;
  appearance: Appearance;
  behavior: Behavior;
  profiles: Profile[];
  defaultProfileId: string;
  keybindings: Record<string, string>;
  /** Arayüz dili. */
  language: Lang;
}

export interface TabState {
  id: string;
  title: string;
  customTitle: string | null;
  profileId: string;
  cwd: string | null;
  createdAt: number;
  lastActiveAt: number;
  hasScrollback: boolean;
  lastCommand: string | null;
  /** Kilitli sekme kapatılamaz — yanlışlıkla kapatmaya karşı koruma. */
  locked: boolean;
}

export interface Group {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  collapsed: boolean;
  /**
   * GRUPLANMAMIŞ sekmelerin kovası.
   *
   * Sekmeler veri modelinde her zaman bir grubun içinde duruyor ve bu
   * değişmedi — değiştirmek "sekme nerede yaşıyor" sorusunu her yerde ikiye
   * bölerdi (geçmiş kaydı, favori süzgeci, bölme kipi, aktarım). Bunun yerine
   * TEK bir grup "gruplanmamış" olarak işaretleniyor ve kenar çubuğunda
   * başlıksız, düz bir liste olarak çiziliyor.
   *
   * Kullanıcı açısından sonuç istenen şey: bir sekme açmak için grup seçmek
   * ya da grup oluşturmak gerekmiyor. Uygulama açısından ise hiçbir yer
   * "grubu olmayan sekme" durumunu ayrıca ele almak zorunda değil.
   *
   * En fazla bir tane var; talep üzerine kuruluyor (bkz. `addLooseTab`).
   */
  ungrouped: boolean;
  /** Favori grup — kenar çubuğunda süzgeç açıkken yalnızca bunlar listelenir. */
  favorite: boolean;
  defaultProfileId: string | null;
  defaultCwd: string | null;
  env: Record<string, string>;
  activeTabId: string | null;
  tabs: TabState[];
}

export interface Workspace {
  version: number;
  activeGroupId: string | null;
  groups: Group[];
  savedAt: number;
}

export interface PathsInfo {
  root: string;
  settingsFile: string;
  workspaceFile: string;
  historyFile: string;
  scrollbackDir: string;
  integrationDir: string;
  portable: boolean;
}

export interface Bootstrap {
  settings: Settings;
  workspace: Workspace;
  paths: PathsInfo;
  appVersion: string;
  restored: boolean;
  /** Windows yapı numarası; xterm'in ConPTY uyumluluk kipini seçmek için. */
  windowsBuild: number;
  /** Uygulamanın koştuğu platform. Cmd/Ctrl seçimi ve `windowsPty` buna bağlı. */
  platform: Platform;
  /** Dosya yöneticisinin adı; arayüz metinlerinde `{fm}` yerine geçiyor. */
  fileManager: string;
  fileManagerEn: string;
}

export interface SpawnSpec {
  id: string;
  profileId: string;
  cwd?: string | null;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
}

export interface SpawnResult {
  id: string;
  pid: number | null;
  shell: string;
  args: string[];
  cwd: string | null;
  integration: boolean;
}

// -------------------------------------------------------------- dosya agaci

export interface DirEntry {
  name: string;
  /** Klasör mü? Sembolik bağlantılar izlenerek belirleniyor. */
  dir: boolean;
}

export interface FileText {
  text: string;
  /** Sınıra takıldı mı; görüntüleyici bunu söylemek zorunda. */
  truncated: boolean;
  /** İkili sezildi mi; içerik boş gelir. */
  binary: boolean;
  /** Dosyanın gerçek boyutu (bayt). */
  size: number;
}

// ------------------------------------------------------------- güncelleme

/**
 * GitHub'daki son yayın.
 *
 * Yalnızca yeni bir sürüm VARSA geliyor: karşılaştırmayı Rust yapıyor
 * (bkz. `update.rs`), arayüz "hangisi yeni" sorusunu ikinci kez sormuyor.
 */
export interface ReleaseInfo {
  /** Etiketten arındırılmış sürüm: `v0.2.0` → `0.2.0`. */
  version: string;
  /** Yayın sayfasının adresi. */
  url: string;
  /** Sürüm notları (markdown, olduğu gibi). Boş olabilir. */
  notes: string;
}

// --------------------------------------------------------------------- git

export interface GitChange {
  /** Porcelain durum harfleri, iki karakter: `" M"`, `"A "`, `"??"`. */
  status: string;
  /** Depo köküne göre yol. */
  path: string;
}

/**
 * nvm ile kurulu Node sürümleri — komut satırının üstündeki Node rozeti için.
 *
 * `manager` komutu belirliyor: nvm-windows'ta `nvm use` makine genelinde
 * geçerli; nvm.sh'te ise kabuğa özel, kalıcı olan `alias default`.
 */
export interface NodeEnv {
  manager: "nvm-windows" | "nvm";
  /** Kullanılan sürüm, `v` ön eki YOK (`"24.18.0"`); seçili sürüm yoksa null. */
  current: string | null;
  /** Kurulu sürümler, yeni olan başta. */
  installed: string[];
}

/** Dal seçicideki tek satır. */
export interface GitBranch {
  /** Dal adı; uzak dalda `origin/` ön eki YOK. */
  name: string;
  /** Yalnızca uzakta var olan dal için uzağın adı (`origin`); yerel dalda yok. */
  remote: string | null;
}

export interface GitInfo {
  /** Dal adı; ayrık HEAD'de `"HEAD"`. */
  branch: string;
  detached: boolean;
  ahead: number;
  behind: number;
  changes: GitChange[];
  /**
   * Çalışma ağacının kökü (mutlak yol).
   *
   * `changes` içindeki yollar KÖKE göre; "dosyayı aç" tam yol istiyor. Kabuğun
   * bulunduğu dizinle birleştirmek, kabuk bir alt klasördeyse var olmayan bir
   * yol üretiyordu.
   */
  root: string;
}

// ------------------------------------------------------------------ geçmiş

export interface HistoryEntry {
  id: string;
  command: string;
  tabId: string;
  groupId: string;
  profileId: string;
  cwd: string | null;
  startedAt: number;
  durationMs: number | null;
  exitCode: number | null;
  source: string;
}

export interface HistoryFilter {
  tabId?: string | null;
  groupId?: string | null;
  query?: string | null;
  onlySucceeded?: boolean | null;
  dedupe?: boolean;
  limit?: number;
  offset?: number;
}

export interface HistoryPage {
  entries: HistoryEntry[];
  total: number;
  grandTotal: number;
}

export interface HistoryStats {
  total: number;
  succeeded: number;
  failed: number;
  running: number;
  fileBytes: number;
  oldestAt: number | null;
}

export interface NewHistoryEntry {
  command: string;
  tabId: string;
  groupId: string;
  profileId: string;
  cwd?: string | null;
  source?: string;
}

// --------------------------------------------------------------- favoriler

export interface Favorite {
  id: string;
  command: string;
  label: string | null;
  note: string | null;
  /**
   * Yalnızca bu SEKME grubunda gösterilsin. null = her yerde.
   *
   * `folder` ile karıştırmayın: bu bir SÜZGEÇ (nerede görünsün), öteki bir
   * DÜZEN (listede hangi başlık altında).
   */
  groupId: string | null;
  /**
   * Favorinin klasörü; liste bu başlıkla gruplanıyor. null = gruplanmamış.
   *
   * Serbest metin ve ayrı bir varlık değil — klasör listesi favorilerden
   * türetiliyor (bkz. `lib/favoriteGroups.ts`).
   */
  folder: string | null;
  /** Bu klasörde çalıştırılsın. null = aktif sekmenin klasörü. */
  cwd: string | null;
  createdAt: number;
  usedCount: number;
  lastUsedAt: number | null;
}

export interface NewFavorite {
  command: string;
  label?: string | null;
  note?: string | null;
  groupId?: string | null;
  folder?: string | null;
  cwd?: string | null;
}

/**
 * Düzenlenebilir alanlar. Alanın yokluğu "dokunma", `null` değeri ise
 * "temizle" anlamına geliyor — Rust tarafındaki `Option<Option<T>>` ile eşleşir.
 */
export interface FavoritePatch {
  command?: string;
  label?: string | null;
  note?: string | null;
  groupId?: string | null;
  folder?: string | null;
  cwd?: string | null;
}

// ----------------------------------------------------------- import/export

export interface ExportOptions {
  includeSettings: boolean;
  includeWorkspace: boolean;
  includeHistory: boolean;
  includeFavorites: boolean;
  includeScrollback: boolean;
  portablePaths: boolean;
}

export interface ExportSummary {
  path: string;
  bytes: number;
  profiles: number;
  groups: number;
  tabs: number;
  history: number;
  favorites: number;
  scrollback: number;
}

export type ImportMode = "skip" | "replace" | "merge";

export interface ImportOptions {
  settings: ImportMode;
  workspace: ImportMode;
  history: ImportMode;
  favorites: ImportMode;
  scrollback: boolean;
}

export interface ImportNote {
  level: "fixed" | "warn" | string;
  subject: string;
  message: string;
}

export interface BundleInfo {
  path: string;
  version: number;
  exportedAt: number;
  appVersion: string;
  machine: string;
  portablePaths: boolean;
  hasSettings: boolean;
  hasWorkspace: boolean;
  profiles: number;
  groups: number;
  tabs: number;
  history: number;
  favorites: number;
  scrollback: number;
  notes: ImportNote[];
}

export interface ImportResult {
  settingsApplied: boolean;
  workspaceApplied: boolean;
  profilesAdded: number;
  groupsAdded: number;
  historyAdded: number;
  favoritesAdded: number;
  scrollbackAdded: number;
  notes: ImportNote[];
}
