// Rust komutlarının tek geçiş noktası. Tauri `invoke` çağrılarını burada
// topluyoruz ki bileşenler string komut adları taşımasın ve tipler tek yerde
// dursun.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
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

  revealInExplorer: (path: string) => invoke<void>("reveal_in_explorer", { path }),
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

const B64_LOOKUP = (() => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const table = new Uint8Array(256).fill(255);
  for (let i = 0; i < chars.length; i++) table[chars.charCodeAt(i)] = i;
  return table;
})();

/** atob + charCodeAt döngüsünden belirgin şekilde hızlı; sıcak yol burası. */
export function base64ToBytes(input: string): Uint8Array {
  let length = input.length;
  while (length > 0 && input.charCodeAt(length - 1) === 61 /* '=' */) length--;
  const outLength = (length * 3) >> 2;
  const out = new Uint8Array(outLength);
  let o = 0;
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < length; i++) {
    const value = B64_LOOKUP[input.charCodeAt(i)];
    if (value === 255) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (buffer >> bits) & 0xff;
    }
  }
  return o === outLength ? out : out.subarray(0, o);
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
