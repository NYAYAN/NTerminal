//! NTerminal - Tauri komut yuzeyi ve uygulama durumu.

mod favorites;
mod history;
mod model;
mod osinfo;
mod paths;
mod platform;
pub mod pty;
mod shellint;
mod shells;
mod store;
mod transfer;

use base64::Engine;
use favorites::{Favorite, FavoritePatch, FavoriteStore, NewFavorite};
use history::{HistoryFilter, HistoryPage, HistoryStats, HistoryStore, NewHistoryEntry};
use model::{HistoryEntry, Profile, Settings, Workspace};
use parking_lot::Mutex;
use paths::DataPaths;
use pty::{PtyManager, SpawnResult, SpawnSpec};
use serde::Serialize;
use std::path::PathBuf;
use tauri::{Manager, State};
use transfer::{
    BundleInfo, ExportOptions, ExportSummary, ImportMode, ImportNote, ImportOptions, ImportResult,
};

/// Tauri komutlari `Result<T, String>` donuyor: hata metni dogrudan arayuzde
/// gosterilebilecek Turkce bir cumle oluyor.
type CmdResult<T> = Result<T, String>;

fn fail<E: std::fmt::Display>(err: E) -> String {
    err.to_string()
}

pub struct AppState {
    paths: DataPaths,
    settings: Mutex<Settings>,
    workspace: Mutex<Workspace>,
    history: HistoryStore,
    favorites: FavoriteStore,
    pty: PtyManager,
    integration_dir: PathBuf,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PathsInfo {
    pub root: String,
    pub settings_file: String,
    pub workspace_file: String,
    pub history_file: String,
    pub scrollback_dir: String,
    pub integration_dir: String,
    /// Veri klasoru exe'nin yaninda mi (tasinabilir kurulum)?
    pub portable: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Bootstrap {
    pub settings: Settings,
    pub workspace: Workspace,
    pub paths: PathsInfo,
    pub app_version: String,
    /// Onceki oturum kaydedilmis mi (kaldigi yerden devam edilebilir mi)?
    pub restored: bool,
    /// Windows yapi numarasi. xterm.js ConPTY satir akisi davranisini buna
    /// gore seciyor; bkz. osinfo.rs.
    pub windows_build: u32,
    /// Uygulamanin uzerinde kostugu platform. Arayuz buna bakarak Cmd/Ctrl
    /// seciyor, `windowsPty` verip vermeyecegine karar veriyor ve yazi tipi
    /// ontanimini belirliyor.
    pub platform: platform::Platform,
    /// Dosya yoneticisinin adi ("Gezgin" / "Finder"). Arayuz metinlerine
    /// `{fm}` olarak giriyor; iki dil icin ayri.
    pub file_manager: String,
    pub file_manager_en: String,
}

fn paths_info(state: &AppState) -> PathsInfo {
    let p = &state.paths;
    PathsInfo {
        root: p.root.to_string_lossy().to_string(),
        settings_file: p.settings_file().to_string_lossy().to_string(),
        workspace_file: p.workspace_file().to_string_lossy().to_string(),
        history_file: p.history_file().to_string_lossy().to_string(),
        scrollback_dir: p.scrollback_dir().to_string_lossy().to_string(),
        integration_dir: state.integration_dir.to_string_lossy().to_string(),
        portable: p.portable,
    }
}

// ----------------------------------------------------------- baslangic

#[tauri::command]
fn app_bootstrap(state: State<AppState>) -> Bootstrap {
    let settings = state.settings.lock().clone();
    let workspace = state.workspace.lock().clone();
    let restored = workspace.saved_at > 0;
    Bootstrap {
        settings,
        workspace,
        paths: paths_info(&state),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        restored,
        windows_build: osinfo::build_number(),
        platform: platform::Platform::current(),
        file_manager: platform::file_manager_name().to_string(),
        file_manager_en: platform::file_manager_name_en().to_string(),
    }
}

#[tauri::command]
fn paths_get(state: State<AppState>) -> PathsInfo {
    paths_info(&state)
}

// -------------------------------------------------------------- ayarlar

#[tauri::command]
fn settings_save(state: State<AppState>, settings: Settings) -> CmdResult<()> {
    state.history.set_limit(settings.behavior.history_limit);
    store::save_settings(&state.paths, &settings).map_err(fail)?;
    *state.settings.lock() = settings;
    Ok(())
}

#[tauri::command]
fn settings_reset(state: State<AppState>) -> CmdResult<Settings> {
    let mut fresh = Settings::default();
    fresh.profiles = shells::detect_profiles();
    fresh.default_profile_id = fresh
        .profiles
        .first()
        .map(|p| p.id.clone())
        .unwrap_or_default();
    store::save_settings(&state.paths, &fresh).map_err(fail)?;
    *state.settings.lock() = fresh.clone();
    Ok(fresh)
}

/// Makinedeki kabuklari yeniden tarar. Arayuz bunu mevcut profillerle
/// karsilastirip kullaniciya "su profiller eklenebilir" diyor.
#[tauri::command]
fn profiles_detect() -> Vec<Profile> {
    shells::detect_profiles()
}

// ------------------------------------------------------- calisma alani

#[tauri::command]
fn workspace_save(state: State<AppState>, workspace: Workspace) -> CmdResult<()> {
    store::save_workspace(&state.paths, &workspace).map_err(fail)?;
    *state.workspace.lock() = workspace;
    Ok(())
}

// ------------------------------------------------------------------ pty

#[tauri::command]
fn pty_spawn(
    app: tauri::AppHandle,
    state: State<AppState>,
    spec: SpawnSpec,
) -> CmdResult<SpawnResult> {
    let settings = state.settings.lock().clone();
    state
        .pty
        .spawn(&app, spec, &settings, &state.integration_dir)
        .map_err(fail)
}

#[tauri::command]
fn pty_write(state: State<AppState>, id: String, data: String) -> CmdResult<()> {
    state.pty.write(&id, data.as_bytes()).map_err(fail)
}

/// Arayuzun ham bayt gondermesi gereken durumlar icin (ornek: pano icerigi
/// gecerli UTF-8 olmayan bir baytla geldiyse) base64 kabul eden yazma.
#[tauri::command]
fn pty_write_bytes(state: State<AppState>, id: String, base64_data: String) -> CmdResult<()> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(base64_data.as_bytes())
        .map_err(fail)?;
    state.pty.write(&id, &bytes).map_err(fail)
}

#[tauri::command]
fn pty_resize(state: State<AppState>, id: String, cols: u16, rows: u16) -> CmdResult<()> {
    state.pty.resize(&id, cols, rows).map_err(fail)
}

#[tauri::command]
fn pty_kill(state: State<AppState>, id: String) -> bool {
    state.pty.kill(&id)
}

#[tauri::command]
fn pty_alive(state: State<AppState>, id: String) -> bool {
    state.pty.alive(&id)
}

#[tauri::command]
fn pty_pid(state: State<AppState>, id: String) -> Option<u32> {
    state.pty.pid(&id)
}

#[tauri::command]
fn pty_list(state: State<AppState>) -> Vec<String> {
    state.pty.list()
}

// ------------------------------------------------------------ scrollback

#[tauri::command]
fn scrollback_save(state: State<AppState>, tab_id: String, data: String) -> CmdResult<()> {
    store::save_scrollback(&state.paths, &tab_id, &data).map_err(fail)
}

#[tauri::command]
fn scrollback_load(state: State<AppState>, tab_id: String) -> Option<String> {
    store::load_scrollback(&state.paths, &tab_id)
}

#[tauri::command]
fn scrollback_delete(state: State<AppState>, tab_id: String) {
    store::delete_scrollback(&state.paths, &tab_id);
}

#[tauri::command]
fn scrollback_prune(state: State<AppState>, keep: Vec<String>) -> usize {
    store::prune_scrollback(&state.paths, &keep)
}

// --------------------------------------------------------------- gecmis

#[tauri::command]
fn history_add(state: State<AppState>, entry: NewHistoryEntry) -> CmdResult<HistoryEntry> {
    state.history.add(entry).map_err(fail)
}

#[tauri::command]
fn history_finish(
    state: State<AppState>,
    id: String,
    exit_code: Option<i32>,
    duration_ms: Option<u64>,
) -> CmdResult<()> {
    state.history.finish(&id, exit_code, duration_ms).map_err(fail)
}

#[tauri::command]
fn history_query(state: State<AppState>, filter: HistoryFilter) -> HistoryPage {
    state.history.query(&filter)
}

#[tauri::command]
fn history_delete(state: State<AppState>, ids: Vec<String>) -> CmdResult<usize> {
    state.history.delete(&ids).map_err(fail)
}

#[tauri::command]
fn history_clear(state: State<AppState>, filter: HistoryFilter) -> CmdResult<usize> {
    state.history.clear(&filter).map_err(fail)
}

#[tauri::command]
fn history_stats(state: State<AppState>) -> HistoryStats {
    state.history.stats()
}

// ------------------------------------------------------------- favoriler

#[tauri::command]
fn favorites_list(state: State<AppState>) -> Vec<Favorite> {
    state.favorites.list()
}

#[tauri::command]
fn favorites_add(state: State<AppState>, favorite: NewFavorite) -> CmdResult<Favorite> {
    state.favorites.add(favorite).map_err(fail)
}

#[tauri::command]
fn favorites_update(
    state: State<AppState>,
    id: String,
    patch: FavoritePatch,
) -> CmdResult<Option<Favorite>> {
    state.favorites.update(&id, patch).map_err(fail)
}

#[tauri::command]
fn favorites_remove(state: State<AppState>, ids: Vec<String>) -> CmdResult<usize> {
    state.favorites.remove(&ids).map_err(fail)
}

/// Gecmis listesindeki yildiza tekrar basildiginda kullaniliyor: kaydin
/// kimligini bilmeden komut metniyle kaldirmak gerekiyor.
#[tauri::command]
fn favorites_remove_by_command(state: State<AppState>, command: String) -> CmdResult<usize> {
    state.favorites.remove_by_command(&command).map_err(fail)
}

#[tauri::command]
fn favorites_reorder(state: State<AppState>, ids: Vec<String>) -> CmdResult<()> {
    state.favorites.reorder(&ids).map_err(fail)
}

#[tauri::command]
fn favorites_mark_used(state: State<AppState>, id: String) -> CmdResult<()> {
    state.favorites.mark_used(&id).map_err(fail)
}

// -------------------------------------------------------- import/export

#[tauri::command]
fn config_export(
    state: State<AppState>,
    path: String,
    options: ExportOptions,
) -> CmdResult<ExportSummary> {
    let settings = state.settings.lock().clone();
    let workspace = state.workspace.lock().clone();
    let bundle = transfer::build_bundle(
        &state.paths,
        &settings,
        &workspace,
        &state.history,
        &state.favorites,
        &options,
    );
    transfer::export_to_file(&bundle, std::path::Path::new(&path)).map_err(fail)
}

/// Dosyayi okur, bu makineye gore normalize eder ve ne olacagini anlatan bir
/// ozet doner. Hicbir sey yazilmaz - kullanici onaylamadan once gormeli.
#[tauri::command]
fn config_import_preview(path: String) -> CmdResult<BundleInfo> {
    let p = std::path::Path::new(&path);
    let mut bundle = transfer::read_bundle(p).map_err(fail)?;
    let notes = transfer::normalize_for_this_machine(&mut bundle);
    Ok(transfer::describe(p, &bundle, notes))
}

#[tauri::command]
fn config_import_apply(
    state: State<AppState>,
    path: String,
    options: ImportOptions,
) -> CmdResult<ImportResult> {
    let p = std::path::Path::new(&path);
    let mut bundle = transfer::read_bundle(p).map_err(fail)?;
    let notes = transfer::normalize_for_this_machine(&mut bundle);

    let mut result = ImportResult {
        settings_applied: false,
        workspace_applied: false,
        profiles_added: 0,
        groups_added: 0,
        history_added: 0,
        favorites_added: 0,
        scrollback_added: 0,
        notes,
    };

    // --- ayarlar
    if let Some(incoming) = bundle.settings.clone() {
        match options.settings {
            ImportMode::Skip => {}
            ImportMode::Replace => {
                let before = state.settings.lock().profiles.len();
                store::save_settings(&state.paths, &incoming).map_err(fail)?;
                state.history.set_limit(incoming.behavior.history_limit);
                result.profiles_added = incoming.profiles.len().saturating_sub(before);
                *state.settings.lock() = incoming;
                result.settings_applied = true;
            }
            ImportMode::Merge => {
                let local = state.settings.lock().clone();
                let merged = transfer::merge_settings(&local, &incoming);
                result.profiles_added = merged.profiles.len().saturating_sub(local.profiles.len());
                store::save_settings(&state.paths, &merged).map_err(fail)?;
                state.history.set_limit(merged.behavior.history_limit);
                *state.settings.lock() = merged;
                result.settings_applied = true;
            }
        }
    }

    // --- calisma alani (gruplar ve sekmeler)
    if let Some(incoming) = bundle.workspace.clone() {
        match options.workspace {
            ImportMode::Skip => {}
            ImportMode::Replace => {
                result.groups_added = incoming.groups.len();
                store::save_workspace(&state.paths, &incoming).map_err(fail)?;
                *state.workspace.lock() = incoming;
                result.workspace_applied = true;
            }
            ImportMode::Merge => {
                let local = state.workspace.lock().clone();
                let (merged, added) = transfer::merge_workspace(&local, &incoming);
                result.groups_added = added;
                store::save_workspace(&state.paths, &merged).map_err(fail)?;
                *state.workspace.lock() = merged;
                result.workspace_applied = true;
            }
        }
    }

    // --- gecmis
    if let Some(entries) = bundle.history.clone() {
        match options.history {
            ImportMode::Skip => {}
            ImportMode::Replace => {
                result.history_added = state.history.ingest(entries, true).map_err(fail)?;
            }
            ImportMode::Merge => {
                result.history_added = state.history.ingest(entries, false).map_err(fail)?;
            }
        }
    }

    // --- favoriler
    if let Some(items) = bundle.favorites.clone() {
        match options.favorites {
            ImportMode::Skip => {}
            ImportMode::Replace => {
                result.favorites_added = state.favorites.ingest(items, true).map_err(fail)?;
            }
            ImportMode::Merge => {
                result.favorites_added = state.favorites.ingest(items, false).map_err(fail)?;
            }
        }
    }

    // --- ekran ciktilari
    if options.scrollback {
        if let Some(map) = &bundle.scrollback {
            for (tab_id, data) in map {
                if store::save_scrollback(&state.paths, tab_id, data).is_ok() {
                    result.scrollback_added += 1;
                }
            }
            // Ice alinan sekmelerde "scrollback var" isaretini geri ac.
            let mut ws = state.workspace.lock();
            for group in &mut ws.groups {
                for tab in &mut group.tabs {
                    if map.contains_key(&tab.id) {
                        tab.has_scrollback = true;
                    }
                }
            }
            let snapshot = ws.clone();
            drop(ws);
            store::save_workspace(&state.paths, &snapshot).map_err(fail)?;
        }
    }

    Ok(result)
}

/// Disa aktarma dosyasi icin varsayilan ad: makine adi + tarih.
#[tauri::command]
fn config_export_default_name() -> String {
    let machine = std::env::var("COMPUTERNAME").unwrap_or_else(|_| "pc".into());
    let ms = store::now_ms();
    // Tarihi kucuk bir hesapla uretiyoruz; sadece dosya adi icin gerekli,
    // tam takvim dogrulugu aranmiyor.
    let days = ms / 86_400_000;
    let secs_of_day = (ms % 86_400_000) / 1000;
    let (y, m, d) = civil_from_days(days);
    format!(
        "nterminal-{}-{:04}{:02}{:02}-{:02}{:02}.nterminal.json",
        machine.to_lowercase(),
        y,
        m,
        d,
        secs_of_day / 3600,
        (secs_of_day % 3600) / 60
    )
}

/// Howard Hinnant'in days-from-civil algoritmasinin tersi.
fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as i64;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

/// Terminalde tiklanan baglantiyi isletim sisteminin varsayilan tarayicisinda
/// acar.
///
/// Bunun var olmasi sart: xterm'in WebLinksAddon'i varsayilan olarak
/// `window.open` cagiriyor, Tauri webview'unde ise bu hicbir sey yapmiyor -
/// linke tiklamak sessizce isleve yaramiyordu.
///
/// Isletim sistemine nasil verildigi platforma gore degisiyor; ikisi de kabugu
/// ARAYA SOKMUYOR (bkz. platform.rs). Url terminal ciktisindan geliyor, yani
/// guvenilmez bir kaynak: kabuktan gecerse icindeki `&`, `|`, `;` karakterleri
/// komut ayiricisina donusur - `?a=1&b=2` gibi siradan bir sorgu dizesi bile
/// yeter.
///
/// Sema beyaz listeli: yalnizca http/https. `file:`, `ms-msdt:` gibi semalar
/// terminal ciktisindaki rastgele bir metnin yerel bir seyi calistirmasina yol
/// acabilir.
#[tauri::command]
fn open_external(url: String) -> CmdResult<()> {
    let lower = url.to_ascii_lowercase();
    if !(lower.starts_with("http://") || lower.starts_with("https://")) {
        return Err(format!("yalnizca http/https acilabilir: {url}"));
    }
    // Satir sonu / bosluk enjeksiyonuna karsi: url tek satir olmali.
    if url.chars().any(|c| c.is_control()) {
        return Err("baglantida denetim karakteri var".into());
    }
    platform::open_url(&url).map_err(fail)?;
    Ok(())
}

/// Verilen klasoru sistemin dosya yoneticisinde acar (Gezgin / Finder).
#[tauri::command]
fn reveal_in_explorer(path: String) -> CmdResult<()> {
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Err(format!("yol bulunamadi: {path}"));
    }
    // Dizin olmasi sart: `open` / `explorer` bir DOSYAYA verildiginde onu
    // varsayilan uygulamayla CALISTIRIR. Cagiran yerlerin hepsi dizin veriyor
    // ama denetim burada, cagiranin disiplinine guvenmiyoruz.
    if !p.is_dir() {
        return Err(format!("klasor degil: {path}"));
    }
    platform::reveal_path(p).map_err(fail)?;
    Ok(())
}

// ----------------------------------------------------------------- kurulum

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let data_paths = DataPaths::resolve();
    if let Err(err) = data_paths.ensure() {
        eprintln!(
            "[nterminal] veri klasoru olusturulamadi ({}): {err}",
            data_paths.root.display()
        );
    }

    let integration = match shellint::install(&data_paths) {
        Ok(installed) => installed.dir,
        Err(err) => {
            eprintln!("[nterminal] kabuk entegrasyonu kurulamadi: {err}");
            data_paths.integration_dir()
        }
    };

    let settings = store::load_settings(&data_paths);
    let workspace = store::load_workspace(&data_paths, &settings);

    // Artik var olmayan sekmelerin ekran ciktilarini temizle.
    let live_tabs: Vec<String> = workspace
        .groups
        .iter()
        .flat_map(|g| g.tabs.iter().map(|t| t.id.clone()))
        .collect();
    store::prune_scrollback(&data_paths, &live_tabs);

    let history = HistoryStore::load(data_paths.clone(), settings.behavior.history_limit);

    let favorites = FavoriteStore::load(data_paths.clone());

    let state = AppState {
        paths: data_paths,
        settings: Mutex::new(settings),
        workspace: Mutex::new(workspace),
        history,
        favorites,
        pty: PtyManager::default(),
        integration_dir: integration,
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            app_bootstrap,
            paths_get,
            settings_save,
            settings_reset,
            profiles_detect,
            workspace_save,
            pty_spawn,
            pty_write,
            pty_write_bytes,
            pty_resize,
            pty_kill,
            pty_alive,
            pty_pid,
            pty_list,
            scrollback_save,
            scrollback_load,
            scrollback_delete,
            scrollback_prune,
            history_add,
            history_finish,
            history_query,
            history_delete,
            history_clear,
            history_stats,
            favorites_list,
            favorites_add,
            favorites_update,
            favorites_remove,
            favorites_remove_by_command,
            favorites_reorder,
            favorites_mark_used,
            config_export,
            config_export_default_name,
            config_import_preview,
            config_import_apply,
            reveal_in_explorer,
            open_external,
        ])
        .on_window_event(|window, event| {
            // Pencere yok olurken kabuk sureclerini birakmiyoruz: aksi halde
            // arkada sahipsiz conhost/powershell surecleri kalir.
            if let tauri::WindowEvent::Destroyed = event {
                if let Some(state) = window.app_handle().try_state::<AppState>() {
                    state.pty.kill_all();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("NTerminal baslatilamadi");
}

// Kullanilmayan ithal uyarilarini onlemek icin: ImportNote yalnizca donus
// turlerinde geciyor ama modul disina acik olmasi gerekiyor.
const _: fn() -> Option<ImportNote> = || None;
