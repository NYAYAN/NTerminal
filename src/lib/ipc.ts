// Rust komutlarının tek geçiş noktası. Tauri `invoke` çağrılarını burada
// topluyoruz ki bileşenler string komut adları taşımasın ve tipler tek yerde
// dursun.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  DiffSides,
  DirEntry,
  FileText,
  GitBranch,
  GitInfo,
  GitOutgoing,
  GitStash,
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
  NodeEnv,
  PathsInfo,
  Profile,
  ReleaseInfo,
  Settings,
  SpawnResult,
  SpawnSpec,
  StashFiles,
  Workspace,
} from "../types";

export const api = {
  bootstrap: () => invoke<Bootstrap>("app_bootstrap"),
  paths: () => invoke<PathsInfo>("paths_get"),

  saveSettings: (settings: Settings) => invoke<void>("settings_save", { settings }),
  resetSettings: () => invoke<Settings>("settings_reset"),
  detectProfiles: () => invoke<Profile[]>("profiles_detect"),

  saveWorkspace: (workspace: Workspace) => invoke<void>("workspace_save", { workspace }),
  /** Oturum sonu için istenen son kayıt bitti (bkz. `onSessionEnd`). */
  sessionEndFlushed: () => invoke<void>("session_end_flushed"),

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
  /**
   * Depodaki dallar, en son commit alan başta. `remotes: false` yalnızca yerel
   * dallar: uzak dal sayısından bağımsız ve hızlı, seçici önce onu çiziyor.
   */
  gitBranches: (path: string, remotes: boolean) =>
    invoke<GitBranch[]>("git_branches", { path, remotes }),
  /**
   * Bir dosyadaki değişiklikleri geri alır. YIKICI: takip edilen dosya HEAD'e
   * dönüyor, takipsiz dosya siliniyor. Onay çağıran tarafta soruluyor.
   */
  gitRevert: (path: string, file: string, untracked: boolean) =>
    invoke<void>("git_revert", { path, file, untracked }),
  /**
   * Yolları indekse ekler (`git add`). Yollar depo köküne göre; `[`, `*` gibi
   * karakterler desen değil dosya adı sayılıyor (Rust tarafında ölçüldü).
   */
  gitStage: (path: string, files: string[]) => invoke<void>("git_stage", { path, files }),
  /**
   * Yolları indeksten çıkarır; dosyalara DOKUNMAZ. Yeniden adlandırmada eski ve
   * yeni yol birlikte verilmeli.
   */
  gitUnstage: (path: string, files: string[]) => invoke<void>("git_unstage", { path, files }),
  /**
   * İndeksi commit'ler; başarıda KISA nesne kimliğini döner. Hata metni git'in
   * kendi cümlesi (kanca çıktısı dâhil), olduğu gibi gösterilmeli.
   */
  gitCommit: (path: string, message: string) => invoke<string>("git_commit", { path, message }),
  /**
   * Son commit'i geri alır (`reset --soft`; içerik eklenmiş kalıyor) ve tam
   * iletisini döner. `id` HEAD değilse ya da commit uzaktaysa reddediyor.
   */
  gitUndoCommit: (path: string, id: string) => invoke<string>("git_undo_commit", { path, id }),
  /**
   * Geçerli dalı uzağa gönderir; başarıda hedefi (`origin/main`) döner. Etiket
   * ve zorla itme YOK. Yukarı akışı olmayan dal yayınlanır (`-u`).
   */
  gitPush: (path: string) => invoke<string>("git_push", { path }),
  /** Deponun stash'leri, en yeni başta; depo değilse boş liste. */
  gitStashes: (path: string) => invoke<GitStash[]>("git_stashes", { path }),
  /** Bir stash'in dosyaları (takipli + takipsiz) ve toplam dosya sayısı. */
  gitStashFiles: (path: string, id: string) =>
    invoke<StashFiles>("git_stash_files", { path, id }),
  /**
   * Stash'teki tek dosyanın farkı; okunamazsa `null`. Yeniden adlandırmada eski
   * yol da verilmeli, yoksa git eşleşmeyi göremiyor.
   */
  gitStashDiff: (
    path: string,
    id: string,
    file: string,
    origPath: string | undefined,
    untracked: boolean,
  ) => invoke<string | null>("git_stash_diff", { path, id, file, origPath, untracked }),
  /**
   * Push'un göndereceği commit'ler: yukarı akış varsa `@{upstream}..HEAD`, yoksa
   * hiçbir uzakta olmayanlar ("yayınla"). Ayrık HEAD'de ve boş depoda boş.
   */
  gitOutgoing: (path: string) => invoke<GitOutgoing>("git_outgoing", { path }),
  /** Bir commit'in dosyaları (birleştirmede ilk ebeveynine göre) ve toplam sayı. */
  gitCommitFiles: (path: string, id: string) =>
    invoke<StashFiles>("git_commit_files", { path, id }),
  /** Commit'teki tek dosyanın farkı; okunamazsa `null`. */
  gitCommitDiff: (path: string, id: string, file: string, origPath: string | undefined) =>
    invoke<string | null>("git_commit_diff", { path, id, file, origPath }),
  /**
   * Yolları stash'e atar; başarıda yeni stash'in kimliğini döner. Seçimde takipsiz
   * dosya varsa `includeUntracked` şart (git onsuz yolu bulamıyor). Hiçbir şey
   * stash'lenmediyse hata: git bu durumda çıkış kodu 0 veriyor, Rust tarafı
   * `refs/stash`in değişip değişmediğine bakıyor.
   */
  gitStashPush: (path: string, message: string, files: string[], includeUntracked: boolean) =>
    invoke<string>("git_stash_push", { path, message, files, includeUntracked }),
  /**
   * Bir stash'i uygular; `pop` başarıda siler. `index`: stash'e atılırken
   * sahnelenmiş olanlar sahnelenmiş olarak geri gelsin (`--index`).
   */
  gitStashApply: (path: string, id: string, pop: boolean, index: boolean) =>
    invoke<void>("git_stash_apply", { path, id, pop, index }),
  /** Bir stash'i siler; geri alınamaz, onay çağıran tarafta soruluyor. */
  gitStashDrop: (path: string, id: string) => invoke<void>("git_stash_drop", { path, id }),
  gitFingerprint: (path: string) => invoke<string | null>("git_fingerprint", { path }),
  /** nvm ile kurulu Node sürümleri; nvm yoksa `null`. Süreç başlatmıyor. */
  nodeEnv: () => invoke<NodeEnv | null>("node_env"),
  gitDiff: (path: string, file: string, untracked: boolean) =>
    invoke<string | null>("git_diff", { path, file, untracked }),
  /**
   * Fark penceresinin iki tarafı: dosyanın HEAD'deki ve çalışma ağacındaki
   * hâli. Taraf yoksa (yeni ya da silinmiş dosya) `null`. Yeniden adlandırmada
   * HEAD'deki hâl eski yoldan okunuyor.
   */
  gitDiffSides: (path: string, file: string, origPath: string | undefined, untracked: boolean) =>
    invoke<DiffSides>("git_diff_sides", { path, file, origPath, untracked }),
  /**
   * Fark penceresindeki `»`: çalışma ağacındaki dosyayı yeni içerikle yazar.
   * Dosya `expected`ten ayrılmışsa (arada kaydedildi) yazmaz ve `"changed"`
   * hatası döner; UTF-8 olmayan dosyada `"not-text"`.
   */
  gitWriteFile: (path: string, file: string, expected: string, text: string) =>
    invoke<void>("git_write_file", { path, file, expected, text }),
  /**
   * Dosya görüntüleyicisindeki Kaydet: mutlak yoldaki dosyayı yazar. Dosya
   * `expected`ten ayrılmışsa (başka yerde kaydedildi) yazmaz ve `"changed"`;
   * UTF-8 olmayan dosyada `"not-text"`.
   */
  writeTextFile: (path: string, expected: string, text: string) =>
    invoke<void>("write_text_file", { path, expected, text }),
  /**
   * Fark penceresini ayrı bir işletim sistemi penceresi olarak açar. `query`
   * pencerenin sayfa sorgusu (`index.html?…`), `dark` başlık çubuğunun tonu.
   */
  diffWindowOpen: (query: string, title: string, dark: boolean) =>
    invoke<void>("diff_window_open", { query, title, dark }),
  /**
   * Fark penceresi hedef dinleyicisini kurdu; o ana kadar bekleyen hedefin
   * sorgusu (yoksa `null`). Bkz. `onDiffTarget`.
   */
  diffWindowReady: () => invoke<string | null>("diff_window_ready"),
  /** Ana pencereyi öne getirip dosyayı görüntüleyicide açar ("Jump to Source"). */
  mainWindowOpenFile: (path: string) => invoke<void>("main_window_open_file", { path }),
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

/** Rust'taki `OPEN_FILE_EVENT` ile aynı: fark penceresi ana pencereye dosya açtırıyor. */
export const OPEN_FILE_EVENT = "app:open-file";

/** Ana pencere bir dosyanın görüntüleyicide açılmasını dinler (bkz. `mainWindowOpenFile`). */
export function onOpenFile(handler: (path: string) => void): Promise<UnlistenFn> {
  return listen<string>(OPEN_FILE_EVENT, (event) => handler(event.payload));
}

/** Rust'taki `DIFF_TARGET_EVENT` ile aynı: açık fark penceresi başka bir dosyaya geçiyor. */
export const DIFF_TARGET_EVENT = "app:diff-target";

/**
 * Fark penceresi yeni hedefini dinler (sorgu dizesi, `diffQuery` biçiminde).
 *
 * Değişiklikler panelinde başka bir dosyaya tıklanınca ikinci pencere
 * açılmıyor; açık pencere bu olayla o dosyaya geçiyor.
 */
export function onDiffTarget(handler: (query: string) => void): Promise<UnlistenFn> {
  return listen<string>(DIFF_TARGET_EVENT, (event) => handler(event.payload));
}

/** Rust'taki `SETTINGS_EVENT` ile aynı: kaydedilen ayarlar açık pencerelere yayılıyor. */
export const SETTINGS_EVENT = "app:settings";

/**
 * Ayarlar değişti (ana pencere kaydetti). Fark pencereleri tema, dil ve yazı
 * tipini buradan alıyor; ana pencerenin deposunu paylaşmıyorlar.
 */
export function onSettingsChanged(handler: (settings: Settings) => void): Promise<UnlistenFn> {
  return listen<Settings>(SETTINGS_EVENT, (event) => handler(event.payload));
}

/** Rust'taki `session_end::EVENT` ile aynı; `sessionEnd.test.ts` ikisini bağlıyor. */
export const SESSION_END_EVENT = "app:session-end";

/**
 * Oturum sonu: Windows Installer (Restart Manager), oturum kapatma ya da
 * yeniden başlatma uygulamayı kapatıyor.
 *
 * Rust tarafı olayı kapanış sorulduğunda (`WM_QUERYENDSESSION`) gönderiyor,
 * kapanışta (`WM_ENDSESSION`) onayı bekliyor (süre sınırlı) ve süreci kendisi
 * bitiriyor; bkz. `session_end.rs`.
 * Kapatma düğmesinden farklı olarak burada karar yok: sistem kapatıyor,
 * "arka planda kal" geçerli değil.
 *
 * Kayıt düşse de haber veriliyor: Rust boşuna süre sonuna kadar beklemesin.
 */
export function onSessionEnd(flush: () => Promise<void>): Promise<UnlistenFn> {
  return listen(SESSION_END_EVENT, async () => {
    await flush().catch(() => {});
    await api.sessionEndFlushed().catch(() => {});
  });
}
