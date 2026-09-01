// Rust komutlarının tek geçiş noktası. Tauri `invoke` çağrılarını burada
// topluyoruz ki bileşenler string komut adları taşımasın ve tipler tek yerde
// dursun.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  DirEntry,
  FileText,
  GitInfo,
  Bootstrap,
  BundleInfo,
  ExportOptions,
  ExportSummary,
  Favorite,
  FavoritePatch,
  HistoryEntry,
  HistoryFilter,
  HistoryPage,
  HistoryStats,
  ImportOptions,
  ImportResult,
  NewFavorite,
  NewHistoryEntry,
  PathsInfo,
  Profile,
  ReleaseInfo,
  Settings,
  SpawnResult,
  SpawnSpec,
  Workspace,
} from "../types";

export const api = {
  bootstrap: () => invoke<Bootstrap>("app_bootstrap"),
  paths: () => invoke<PathsInfo>("paths_get"),

  saveSettings: (settings: Settings) => invoke<void>("settings_save", { settings }),
  resetSettings: () => invoke<Settings>("settings_reset"),
  detectProfiles: () => invoke<Profile[]>("profiles_detect"),

  saveWorkspace: (workspace: Workspace) => invoke<void>("workspace_save", { workspace }),

  ptySpawn: (spec: SpawnSpec) => invoke<SpawnResult>("pty_spawn", { spec }),
  ptyWrite: (id: string, data: string) => invoke<void>("pty_write", { id, data }),
  ptyResize: (id: string, cols: number, rows: number) =>
    invoke<void>("pty_resize", { id, cols, rows }),
  ptyKill: (id: string) => invoke<boolean>("pty_kill", { id }),
  ptyAlive: (id: string) => invoke<boolean>("pty_alive", { id }),
  ptyPid: (id: string) => invoke<number | null>("pty_pid", { id }),
  ptyList: () => invoke<string[]>("pty_list"),

  scrollbackSave: (tabId: string, data: string) =>
    invoke<void>("scrollback_save", { tabId, data }),
  scrollbackLoad: (tabId: string) => invoke<string | null>("scrollback_load", { tabId }),
  scrollbackDelete: (tabId: string) => invoke<void>("scrollback_delete", { tabId }),
  scrollbackPrune: (keep: string[]) => invoke<number>("scrollback_prune", { keep }),

  historyAdd: (entry: NewHistoryEntry) => invoke<HistoryEntry>("history_add", { entry }),
  historyFinish: (id: string, exitCode: number | null, durationMs: number | null) =>
    invoke<void>("history_finish", { id, exitCode, durationMs }),
  historyQuery: (filter: HistoryFilter) => invoke<HistoryPage>("history_query", { filter }),
  historyDelete: (ids: string[]) => invoke<number>("history_delete", { ids }),
  historyClear: (filter: HistoryFilter) => invoke<number>("history_clear", { filter }),
  historyStats: () => invoke<HistoryStats>("history_stats"),

  favoritesList: () => invoke<Favorite[]>("favorites_list"),
  favoritesAdd: (favorite: NewFavorite) => invoke<Favorite>("favorites_add", { favorite }),
  favoritesUpdate: (id: string, patch: FavoritePatch) =>
    invoke<Favorite | null>("favorites_update", { id, patch }),
  favoritesRemove: (ids: string[]) => invoke<number>("favorites_remove", { ids }),
  favoritesRemoveByCommand: (command: string) =>
    invoke<number>("favorites_remove_by_command", { command }),
  favoritesReorder: (ids: string[]) => invoke<void>("favorites_reorder", { ids }),
  favoritesMarkUsed: (id: string) => invoke<void>("favorites_mark_used", { id }),

  configExport: (path: string, options: ExportOptions) =>
    invoke<ExportSummary>("config_export", { path, options }),
  configExportDefaultName: () => invoke<string>("config_export_default_name"),
  configImportPreview: (path: string) => invoke<BundleInfo>("config_import_preview", { path }),
  configImportApply: (path: string, options: ImportOptions) =>
    invoke<ImportResult>("config_import_apply", { path, options }),

  /**
   * Klasörü sistemin dosya yöneticisinde açar.
   *
   * Ad Windows'tan kalma ama işlev platforma göre: Windows'ta Gezgin, macOS'ta
   * Finder (bkz. `src-tauri/src/platform.rs`). Arayüzdeki metin `{fm}` yer
   * tutucusuyla doğru adı yazıyor.
   */
  revealInExplorer: (path: string) => invoke<void>("reveal_in_explorer", { path }),
  /** Terminalde tıklanan bağlantıyı varsayılan tarayıcıda açar. */
  openExternal: (url: string) => invoke<void>("open_external", { url }),
  listDirs: (path: string) => invoke<string[]>("list_dirs", { path }),
  listFiles: (path: string) => invoke<string[]>("list_files", { path }),
  listEntries: (path: string) => invoke<DirEntry[]>("list_entries", { path }),
  readTextFile: (path: string) => invoke<FileText | null>("read_text_file", { path }),
  gitInfo: (path: string) => invoke<GitInfo | null>("git_info", { path }),
  gitBranches: (path: string) => invoke<string[]>("git_branches", { path }),
  /**
   * Bir dosyadaki değişiklikleri geri alır. YIKICI: takip edilen dosya HEAD'e
   * dönüyor, takipsiz dosya siliniyor. Onay çağıran tarafta soruluyor.
   */
  gitRevert: (path: string, file: string, untracked: boolean) =>
    invoke<void>("git_revert", { path, file, untracked }),
  gitFingerprint: (path: string) => invoke<string | null>("git_fingerprint", { path }),
  gitDiff: (path: string, file: string, untracked: boolean) =>
    invoke<string | null>("git_diff", { path, file, untracked }),
  /**
   * Menü çubuğu / bildirim alanı simgesinin menü metinleri.
   *
   * Menüyü işletim sistemi çiziyor, yani sözlüğe erişimi yok; dil değişince
   * metinleri buradan geçiriyoruz.
   */
  trayLabels: (show: string, quit: string) => invoke<void>("tray_labels", { show, quit }),

  /**
   * GitHub'daki son yayın; yenisi yoksa `null`.
   *
   * Karşılaştırma Rust tarafında: "hangisi yeni" sorusunun tek bir doğru
   * yanıtı var ve iki yerde ayrı yazılırsa biri güncellenip öteki
   * unutulduğunda ya bildirim hiç çıkmıyor ya da her açılışta çıkıyor.
   */
  checkUpdate: (current: string) => invoke<ReleaseInfo | null>("update_check", { current }),
};

// PTY çıktısı base64 geliyor: terminal akışı geçerli UTF-8 olmak zorunda değil
// (çok baytlı bir karakter iki okuma arasında bölünebilir), o yüzden ham bayt
// taşıyıp xterm'e Uint8Array veriyoruz - xterm kendi içinde parçalı UTF-8'i
// doğru birleştiriyor.
export interface PtyDataEvent {
  id: string;
  data: string;
}

export interface PtyExitEvent {
  id: string;
  code: number | null;
}

/**
 * base64 -> bayt. Sıcak yol: her PTY parçası buradan geçiyor.
 *
 * `atob` + `charCodeAt` döngüsü, elle yazılmış altı-bitlik çözücüden HIZLI.
 * Bunun tersi yazılıydı ve ölçüm yanlışladı (Chromium, aynı motor WebView2'de;
 * parça başına en iyi üç turun en iyisi):
 *
 *   |  parça | elle | atob |
 *   |    1KB |  5µs |  3µs |
 *   |    8KB | 65µs | 32µs |
 *   |   32KB |153µs | 89µs |
 *   |  128KB |555µs |300µs |
 *
 * Sebebi tahmin edilebilir: `atob` motorun içinde, döngü de tek bir tipli
 * dizi yazımı; elle çözücü karakter başına maske, kaydırma ve dal içeriyor.
 * Çıktı bayt bayt AYNI (padli, padsiz ve yüksek baytlı girdide doğrulandı).
 *
 * Girdi Rust tarafının ürettiği standart base64; `atob` gerçekten geçersiz
 * bir karakterde atıyor. Sessizce atlayıp bozuk bayt üretmektense bunu
 * duymak doğru: kaynak makineyse hata gerçek bir hatadır.
 */
export function base64ToBytes(input: string): Uint8Array {
  const binary = atob(input);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function onPtyData(
  id: string,
  handler: (bytes: Uint8Array) => void,
): Promise<UnlistenFn> {
  return listen<PtyDataEvent>(`pty:data:${id}`, (event) => {
    handler(base64ToBytes(event.payload.data));
  });
}

export function onPtyExit(
  id: string,
  handler: (code: number | null) => void,
): Promise<UnlistenFn> {
  return listen<PtyExitEvent>(`pty:exit:${id}`, (event) => {
    handler(event.payload.code);
  });
}
