// Rust tarafındaki model.rs / transfer.rs ile birebir eşleşen tipler.
// serde `rename_all = "camelCase"` kullanıyor, o yüzden alanlar camelCase.

export type ShellKind = "power-shell" | "pwsh" | "cmd" | "bash" | "wsl" | "custom";

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
  theme: string;
  cursorStyle: "block" | "bar" | "underline";
  cursorBlink: boolean;
  scrollback: number;
  sidebarWidth: number;
  /** Sağ panelin (geçmiş / favoriler) genişliği. */
  panelWidth: number;
}

export interface Behavior {
  restoreSession: boolean;
  restoreScrollback: boolean;
  scrollbackSaveLines: number;
  confirmCloseRunning: boolean;
  copyOnSelect: boolean;
  pasteOnRightClick: boolean;
  inheritCwd: boolean;
  historyLimit: number;
  historyDedupe: boolean;
  /** Kenar çubuğunda yalnızca favori grupları göster. */
  showOnlyFavoriteGroups: boolean;
}

export interface Settings {
  version: number;
  appearance: Appearance;
  behavior: Behavior;
  profiles: Profile[];
  defaultProfileId: string;
  keybindings: Record<string, string>;
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
  /** Yalnızca bu grupta gösterilsin. null = her yerde. */
  groupId: string | null;
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
