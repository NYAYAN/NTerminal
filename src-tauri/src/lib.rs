//! NTerminal - Tauri komut yuzeyi ve uygulama durumu.

mod favorites;
mod files;
mod git;
mod history;
mod instance;
mod model;
mod nodever;
mod osinfo;
mod paths;
mod platform;
pub mod pty;
mod search;
mod session_end;
mod shellint;
mod shells;
mod store;
mod transfer;
mod update;
mod tray;

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
fn settings_save(app: tauri::AppHandle, state: State<AppState>, settings: Settings) -> CmdResult<()> {
    use tauri::Emitter;
    // Arayuz zaten sinirliyor (`sanitizeSettings`); bu kapi baska bir yoldan
    // (eski bir arayuz, elle cagri) gelen sinir disi degeri diske ve gecmis
    // sinirina ulastirmamak icin.
    let mut settings = settings;
    settings.sanitize();
    state.history.set_limit(settings.behavior.history_limit);
    store::save_settings(&state.paths, &settings).map_err(fail)?;
    // Acik fark pencereleri temayi, dili ve yazi tipini ana pencereyle ayni
    // tutsun. Gonderilemezse ayar yine kaydedildi; pencereler bir sonraki
    // acilista dogru temayla gelir.
    let _ = app.emit(SETTINGS_EVENT, &settings);
    *state.settings.lock() = settings;
    Ok(())
}

/// Menu cubugu / bildirim alani simgesinin menu metinleri.
///
/// Arayuz dilinden geliyor: simge acilista Rust tarafindaki metinlerle
/// kuruluyor (o an sozluk yuklenmemis oluyor), dil degisince arayuz burayi
/// cagirip guncelliyor. Aksi halde menu eski dilde kalirdi.
#[tauri::command]
fn tray_labels(app: tauri::AppHandle, show: String, quit: String) -> CmdResult<()> {
    tray::set_labels(&app, &show, &quit).map_err(fail)
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

/// Fabrika kisayollari (platforma gore: mac'te Cmd).
///
/// Ayarlar > Kisayollar'daki "Kisayollari varsayilana dondur" icin: tum
/// ayarlari sifirlamadan yalnizca kisayollari geri almanin yolu. Satir basina
/// "varsayilana don" DEGIL - kullanicinin kurali: satirdaki geri al yalnizca bu
/// oturumdaki degisiklik icin, eski hale donus toplu dugmeyle.
#[tauri::command]
fn settings_default_keybindings() -> std::collections::BTreeMap<String, String> {
    model::default_keybindings()
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

/// Arayuz, oturum sonu icin istenen son kaydi bitirdi.
///
/// Rust tarafi `WM_ENDSESSION`in icinde bunu bekliyor, sonra sureci bitiriyor
/// (bkz. session_end.rs). Es zamanli olmasi bilincli: bekleyen dongu ana is
/// parcaciginda, yanit da orada islenmeli.
#[tauri::command]
fn session_end_flushed() {
    session_end::mark_flushed();
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

/// Kabuga yazma.
///
/// `async` + `spawn_blocking`: PTY master'a yazmak on plandaki program girdiyi
/// okumuyorsa (takilmis `ssh`, yanit vermeyen TUI) kuyruk bosalana kadar
/// bloklar. Es zamanli komut ana is parcaciginda kosar ve buyuk bir
/// yapistirma pencereyi dondururdu; tutamac (`pty::Writer`) global kilitten
/// bagimsiz oldugu icin bu arada `kill` ve `resize` calismaya devam ediyor.
#[tauri::command]
async fn pty_write(state: State<'_, AppState>, id: String, data: String) -> CmdResult<()> {
    let writer = state.pty.writer(&id).map_err(fail)?;
    tauri::async_runtime::spawn_blocking(move || pty::write_to(&writer, data.as_bytes()))
        .await
        .map_err(fail)?
        .map_err(fail)
}

/// Arayuzun ham bayt gondermesi gereken durumlar icin (ornek: pano icerigi
/// gecerli UTF-8 olmayan bir baytla geldiyse) base64 kabul eden yazma.
#[tauri::command]
async fn pty_write_bytes(
    state: State<'_, AppState>,
    id: String,
    base64_data: String,
) -> CmdResult<()> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(base64_data.as_bytes())
        .map_err(fail)?;
    let writer = state.pty.writer(&id).map_err(fail)?;
    tauri::async_runtime::spawn_blocking(move || pty::write_to(&writer, &bytes))
        .await
        .map_err(fail)?
        .map_err(fail)
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
    if let Some(mut incoming) = bundle.settings.clone() {
        // Ice aktarilan dosya arayuzden gecmiyor: sinirlar burada (birlestirme
        // de bu kopyadan uretiliyor).
        incoming.sanitize();
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

/// Verilen dizinin git durumu; depo degilse `None`.
///
/// Cagri SEYREK olmali (dizin degisimi, komut sonu): her cagri bir `git`
/// sureci baslatiyor.
///
/// `async` + `spawn_blocking`. BILDIRILEN: "Degisikliklerin hepsini sec
/// yapinca ufak bir takilma oluyor." OLCULDU (macOS, gercek uygulama, 30
/// dosyalik bir degisiklik): `git add` bitip liste tazelenirken ana is
/// parcacigi 21-28 ms, bir seferinde 66 ms cevap vermiyordu - bu komut
/// `git status` ve `git rev-parse`i ana is parcaciginda kosturuyordu (es
/// zamanli komutlar orada kosuyor, bkz. `update_check`). Buyuk bir depoda bu
/// sure `git status` kadar uzar. Asagidaki okuma komutlari da (fark, stash)
/// ayni sebeple ayni bicimde.
#[tauri::command]
async fn git_info(path: String) -> CmdResult<Option<git::GitInfo>> {
    tauri::async_runtime::spawn_blocking(move || git::read(&path))
        .await
        .map_err(fail)
}

/// Bir metin dosyasinin icerigi - goruntuleyici icin.
///
/// Sinirlar ve ikili sezgisi `files` modulunde belgelenmis.
/// GitHub'daki son yayin; yenisi yoksa ya da okunamazsa `None`.
///
/// `async` ve `spawn_blocking`: cagri bir ag istegi ve saniyeler surebiliyor.
/// Es zamansiz olmayan bir komut Tauri'de ANA IS PARCACIGINDA kosuyor —
/// acilista yapilan bu denetim pencereyi o sure boyunca dondururdu.
///
/// Karsilastirma da BURADA, arayuzde degil: "hangisi yeni" sorusunun tek bir
/// dogru yaniti var ve iki yerde ayri yazilirsa biri guncellenip oteki
/// unutuldugunda ya bildirim hic cikmiyor ya da her acilista cikiyor.
///
/// Yenisi varsa uygulamanin onu kendisi kurup kuramayacagi da burada
/// belirleniyor (`installable`); gerekcesi `update::installable`.
#[tauri::command]
async fn update_check(
    app: tauri::AppHandle,
    current: String,
) -> CmdResult<Option<update::ReleaseInfo>> {
    let found = tauri::async_runtime::spawn_blocking(update::latest)
        .await
        .map_err(fail)?;
    let Some(mut release) = found.filter(|r| update::is_newer(&current, &r.version)) else {
        return Ok(None);
    };
    release.installable = update::installable(&app, &release.version).await;
    Ok(Some(release))
}

/// Yeni surumu indirir ve imzasini dogrular; KURMAZ. Indirilen surumu dondurur.
///
/// Ilerleme `on_progress` kanaliyla geliyor. Kurulum ayri bir adim
/// (`update_apply`): arada arayuz son durumu diske yaziyor — gerekcesi
/// `update::Pending`.
#[tauri::command]
async fn update_download(
    app: tauri::AppHandle,
    pending: State<'_, update::Pending>,
    on_progress: tauri::ipc::Channel<UpdateProgress>,
) -> CmdResult<String> {
    // Windows'ta kurucu baslarken surec `exit(0)` ile bitiyor ve pencere
    // olaylari (`Destroyed` -> `kill_all`) hic gelmiyor; kabuklar sahipsiz
    // kalmasin. Tauri'nin kendi temizligi de eklentinin varsayilaniydi.
    let handle = app.clone();
    let before_exit = move || {
        update::EXIT_STARTED.store(true, std::sync::atomic::Ordering::SeqCst);
        if let Some(state) = handle.try_state::<AppState>() {
            state.pty.kill_all();
        }
        handle.cleanup_before_exit();
    };

    let mut sent = 0u64;
    let progress = |received: u64, total: Option<u64>| {
        let done = total.is_some_and(|t| received >= t);
        if done || received - sent >= update::progress_step(total) {
            sent = received;
            let _ = on_progress.send(UpdateProgress { received, total });
        }
    };

    let (found, bytes) = update::download(&app, before_exit, progress).await?;
    let version = found.version.clone();
    pending.put(found, bytes);
    Ok(version)
}

/// Indirilen guncellemeyi kurar ve uygulamayi yeniden baslatir.
///
/// Arayuz durumu diske yazdiktan SONRA cagiriyor. Platforma gore:
///
/// - Windows: eklenti kurucuyu (NSIS ya da MSI, sessiz) baslatip sureci
///   bitiriyor; uygulamayi kurucu yeniden aciyor. Bu cagri basariyla DONMUYOR.
/// - macOS: paket yerinde degistiriliyor, sonra yeniden baslatma ISTENIYOR.
///   `request_restart` kapanis olaylarini sirasiyla isletiyor (`restart`
///   ise ana is parcaciginda onlari atliyor).
///
/// `async` olmak ZORUNDA: macOS'ta paket yonetici izni isterse eklenti parola
/// istemini ana is parcaciginda acip sonucunu bekliyor. Komut ana is
/// parcaciginda kossaydi kendi kendini bekleyip kilitlenirdi.
#[tauri::command]
async fn update_apply(app: tauri::AppHandle, pending: State<'_, update::Pending>) -> CmdResult<()> {
    let (found, bytes) = pending
        .take()
        .ok_or_else(|| "indirilmis guncelleme yok".to_string())?;
    if let Err(err) = found.install(bytes) {
        // Windows: kurucu baslatilamadiysa (ornegin bir guvenlik yazilimi
        // engelledi) kapanis temizligi COKTAN yapilmis olabilir — kabuklar
        // kapali, pencereler gizli, tepsi simgesi yok. O yarim durumda kalmak
        // yerine ayni surumu yeniden ac: durum diskte, sekmeler geri geliyor.
        if update::EXIT_STARTED.load(std::sync::atomic::Ordering::SeqCst) {
            app.request_restart();
        }
        return Err(fail(err));
    }
    app.request_restart();
    Ok(())
}

/// Indirme ilerlemesi; `types.ts`teki `UpdateProgress`.
#[derive(Clone, Serialize)]
struct UpdateProgress {
    received: u64,
    total: Option<u64>,
}

#[tauri::command]
fn read_text_file(path: String) -> CmdResult<Option<files::FileText>> {
    Ok(files::read_text(std::path::Path::new(&path)))
}

/// Bir gorselin icerigi (base64) - goruntuleyicinin resim onizlemesi.
///
/// `async` + `spawn_blocking`: yirmi megabayta kadar okuma ve kodlama; ana is
/// parcaciginda pencereyi dondururdu. Sinir ve neden base64 `files` modulunde.
#[tauri::command]
async fn read_image_file(path: String) -> CmdResult<files::ImageData> {
    tauri::async_runtime::spawn_blocking(move || files::read_image(std::path::Path::new(&path)))
        .await
        .map_err(fail)?
}

/// Dosya goruntuleyicisindeki Kaydet: dosyayi yeni icerikle yazar.
///
/// Dosya okundugu halden ayrilmissa yazmiyor (`changed`); gerekcesi
/// `files::write_checked` icinde.
#[tauri::command]
async fn write_text_file(path: String, expected: String, text: String) -> CmdResult<()> {
    tauri::async_runtime::spawn_blocking(move || {
        files::write_text(std::path::Path::new(&path), &expected, &text)
    })
    .await
    .map_err(fail)?
}

/// Bir dizinin girdileri, tur bilgisiyle - dosya agaci icin.
///
/// Klasorler ONCE, sonra dosyalar; her grup buyuk/kucuk harf gozetmeden
/// siralanmis. Karisik siralama agaci taramayi zorlastiriyor: goz once
/// klasorleri arayip iciyor.
///
/// `list_files` ile ayri isler: o TUM agaci duz bir liste olarak veriyor
/// (arama icin), bu ise TEK bir seviyeyi (agaci tembel acmak icin). Derin bir
/// agacta hepsini onden okumak gereksiz.
#[tauri::command]
fn list_entries(path: String) -> CmdResult<Vec<files::Entry>> {
    let p = std::path::Path::new(&path);
    if !p.is_dir() {
        return Err(format!("klasor degil: {path}"));
    }
    Ok(files::entries(p))
}

/// Dizin altindaki dosyalar (goreli yollar) - Ctrl+P dosya arama icin.
///
/// Sinirli: atlanan klasorler ve azami sayi/derinlik `files` modulunde
/// belgelenmis. Eksik liste, donmus bir arayuzden iyi.
#[tauri::command]
fn list_files(path: String) -> CmdResult<Vec<String>> {
    let p = std::path::Path::new(&path);
    if !p.is_dir() {
        return Err(format!("klasor degil: {path}"));
    }
    Ok(files::list(p))
}

/// Dosyalarin ICINDE arama - paletin "Dosya icerigi" sekmesi ve dosya sutunu.
///
/// `async` + `spawn_blocking`: bir git sureci ve binlerce dosya okumasi; ana
/// is parcaciginda pencereyi dondururdu. `id` arayuzun verdigi kimlik: yeni
/// bir aramaya gecince eskisi `search_text_cancel` ile durduruluyor. Sinirlar,
/// iptal ve hangi dosyalara bakildigi `search` modulunde belgelenmis.
#[tauri::command]
async fn search_text(
    id: u64,
    path: String,
    query: String,
    options: search::SearchOptions,
) -> CmdResult<search::SearchResult> {
    tauri::async_runtime::spawn_blocking(move || {
        search::run(id, std::path::Path::new(&path), &query, &options)
    })
    .await
    .map_err(fail)?
}

/// Suren (ya da henuz baslamamis) bir aramayi durdurur.
#[tauri::command]
fn search_text_cancel(id: u64) -> CmdResult<()> {
    search::cancel(id);
    Ok(())
}

/// Deponun ucuz durum imzasi; degistiyse tam sorgu gerekiyor.
///
/// Yoklama icin: her yoklamada `git status` kosturmak buyuk bir depoda saniye
/// mertebesinde bir surec demek. Imza iki dosya okumasi.
#[tauri::command]
fn git_fingerprint(path: String) -> CmdResult<Option<String>> {
    Ok(git::fingerprint(&path))
}

/// Tek bir dosyanin farki; okunamazsa `None`. `async`: bir `git` sureci
/// (bkz. `git_info`).
#[tauri::command]
async fn git_diff(path: String, file: String, untracked: bool) -> CmdResult<Option<String>> {
    tauri::async_runtime::spawn_blocking(move || git::diff(&path, &file, untracked))
        .await
        .map_err(fail)
}

/// Bir dosyadaki degisiklikleri geri alir. Yikici; onay ARAYUZDE soruluyor.
/// `async`: `git checkout` / dosya silme (bkz. `git_info`).
#[tauri::command]
async fn git_revert(path: String, file: String, untracked: bool) -> CmdResult<()> {
    tauri::async_runtime::spawn_blocking(move || git::revert(&path, &file, untracked))
        .await
        .map_err(fail)?
}

/// Fark penceresinin iki tarafi: dosyanin HEAD'deki ve calisma agacindaki hali.
///
/// `async` + `spawn_blocking`: iki `git` sureci ve dort megabayta kadar okuma;
/// ana is parcaciginda kossa pencereler o sure donardi (bkz. `update_check`).
#[tauri::command]
async fn git_diff_sides(
    path: String,
    file: String,
    orig_path: Option<String>,
    untracked: bool,
) -> CmdResult<git::DiffSides> {
    tauri::async_runtime::spawn_blocking(move || {
        git::diff_sides(&path, &file, orig_path.as_deref(), untracked)
    })
    .await
    .map_err(fail)?
}

/// Fark penceresindeki `»`: calisma agacindaki dosyayi yeni icerikle yazar.
///
/// Dosya farkin alindigi halden ayrilmissa yazmiyor; gerekcesi
/// `git::write_worktree_file` icinde.
#[tauri::command]
async fn git_write_file(
    path: String,
    file: String,
    expected: String,
    text: String,
) -> CmdResult<()> {
    tauri::async_runtime::spawn_blocking(move || {
        git::write_worktree_file(&path, &file, &expected, &text)
    })
    .await
    .map_err(fail)?
}

/// Fark penceresinin sirasi; pencere `diff-<n>` etiketini aliyor (yeni bir
/// pencere oncekinin kapanirken hala kayitli olabilecek etiketine carpmasin).
static DIFF_WINDOW_SEQ: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(1);

/// Acik fark penceresi hedef dinleyicisini kurdu mu; kurana kadar gelen son hedef.
///
/// Yeni acilan pencerenin sayfasi yuklenip `DIFF_TARGET_EVENT` dinleyicisini
/// kurana kadar gonderilen olay kaybolurdu: o arada baska bir dosyaya
/// tiklanirsa pencere ilk dosyada kalirdi. Hedef o zaman burada bekliyor ve
/// pencere `diff_window_ready` ile aliyor.
struct DiffWindowState {
    ready: bool,
    pending: Option<String>,
}

static DIFF_WINDOW: Mutex<DiffWindowState> = Mutex::new(DiffWindowState { ready: false, pending: None });

/// Acik fark penceresi (en fazla bir tane; eski surumden kalmis birkac tane
/// varsa en son acilani).
fn diff_window(app: &tauri::AppHandle) -> Option<tauri::WebviewWindow> {
    app.webview_windows()
        .into_iter()
        .filter_map(|(label, window)| {
            let n: u32 = label.strip_prefix("diff-")?.parse().ok()?;
            Some((n, window))
        })
        .max_by_key(|(n, _)| *n)
        .map(|(_, window)| window)
}

/// Farki fark penceresinde gosterir - IntelliJ'deki gibi ayri bir isletim
/// sistemi penceresi.
///
/// TEK pencere: acik bir fark penceresi varsa one geliyor ve yeni dosyaya
/// geciyor (`DIFF_TARGET_EVENT`), ikinci bir pencere acilmiyor. BILDIRILEN:
/// "farkli bir dosya icin bastim, yeni bir tane acildi; her tikladigimda
/// mevcut acik ekran guncellenmeli."
///
/// `query` arayuzun kurdugu sorgu dizesi (`URLSearchParams`); pencere
/// uygulamanin KENDI sayfasini (`index.html`) bu sorguyla aciyor ve `main.tsx`
/// sorguya bakip ana arayuz yerine fark gorunumunu ciziyor. Karakterler beyaz
/// listeden geciyor: yol ayiricisi ya da `#` sayfa adresini degistirebilirdi,
/// `URLSearchParams` ise bunlari zaten `%2F` / `%23` olarak yaziyor.
///
/// `async`: Tauri'de pencere yaratan es zamanli bir komut Windows'ta kilitleniyor
/// (Tauri belgesindeki uyari); es zamansiz komut olay dongusunu bekletmiyor.
///
/// Boyut ana pencereden: ekranina sigan bir pencere zaten var ve fark onun
/// biraz kucugu olarak acilinca hicbir ekranda tasmiyor. Sabit bir olcu kucuk
/// ekranda pencereyi ekranin disina tasirdi.
#[tauri::command]
async fn diff_window_open(
    app: tauri::AppHandle,
    query: String,
    title: String,
    dark: bool,
) -> CmdResult<()> {
    let ok = query
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || "%=&._-*+~".contains(c));
    if !ok {
        return Err("gecersiz pencere sorgusu".into());
    }

    {
        let mut state = DIFF_WINDOW.lock();
        if let Some(window) = diff_window(&app) {
            use tauri::Emitter;
            let _ = window.set_title(&title);
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
            if state.ready {
                app.emit_to(window.label(), DIFF_TARGET_EVENT, &query).map_err(fail)?;
            } else {
                state.pending = Some(query);
            }
            return Ok(());
        }
        *state = DiffWindowState { ready: false, pending: None };
    }

    let (width, height) = app
        .get_webview_window("main")
        .and_then(|main| {
            let scale = main.scale_factor().ok()?;
            let size = main.inner_size().ok()?.to_logical::<f64>(scale);
            Some((size.width * 0.9, size.height * 0.9))
        })
        .unwrap_or((1200.0, 780.0));

    let label = format!(
        "diff-{}",
        DIFF_WINDOW_SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
    );
    let url = tauri::WebviewUrl::App(format!("index.html?{query}").into());
    tauri::WebviewWindowBuilder::new(&app, label, url)
        .title(title)
        .inner_size(width.max(640.0), height.max(420.0))
        .min_inner_size(640.0, 420.0)
        .center()
        .disable_drag_drop_handler()
        .theme(Some(if dark { tauri::Theme::Dark } else { tauri::Theme::Light }))
        .build()
        .map_err(fail)?;
    Ok(())
}

/// Fark penceresi hedef dinleyicisini kurdu; o ana kadar bekleyen hedef
/// (yoksa `None`: pencere kendi sorgusundaki dosyayi gosteriyor).
#[tauri::command]
fn diff_window_ready() -> Option<String> {
    let mut state = DIFF_WINDOW.lock();
    state.ready = true;
    state.pending.take()
}

/// Fark penceresindeki "Jump to Source": dosyayi ana pencerenin goruntuleyicisinde acar.
///
/// Ana pencere one geliyor (gizliyse gorunur oluyor); hangi dosyanin acilacagini
/// ona bir olayla soyluyoruz - goruntuleyicinin durumu ana pencerenin
/// deposunda ve baska bir pencereden ona dokunulamiyor.
#[tauri::command]
fn main_window_open_file(app: tauri::AppHandle, path: String) -> CmdResult<()> {
    use tauri::Emitter;
    tray::show_main(&app);
    app.emit_to("main", OPEN_FILE_EVENT, path).map_err(fail)
}

/// Acik fark penceresine yeni hedefin sorgusu; `ipc.ts` ile ayni ad.
const DIFF_TARGET_EVENT: &str = "app:diff-target";

/// Ana pencerenin dinledigi "su dosyayi ac" olayi; `ipc.ts` ile ayni ad.
const OPEN_FILE_EVENT: &str = "app:open-file";

/// Ayarlar degisti; acik fark pencereleri temayi ve yazi tipini buradan aliyor.
pub const SETTINGS_EVENT: &str = "app:settings";

/// Depodaki yerel ve uzak dallar; depo degilse bos liste.
///
/// `async` + `spawn_blocking`: `for-each-ref` her ref'i okuyor ve suresi dal
/// sayisiyla buyuyor. OLCULDU (macOS, sicak onbellek): 10 bin uzak dal
/// paketliyken 51 ms, `git fetch` sonrasi her ref ayri dosyayken 356 ms; 50 bin
/// dalda 634 ms / 8 sn. Es zamanli bir komut ana is parcaciginda kosuyor
/// (asagidaki nota bakin) ve o sure boyunca pencere cevap vermezdi.
///
/// `remotes: false` yalnizca yerel dallar: secici once onlari ciziyor, uzaklari
/// ikinci bir cagriyla arkadan bekliyor (bkz. `git::branches`).
#[tauri::command]
async fn git_branches(path: String, remotes: bool) -> CmdResult<Vec<git::GitBranch>> {
    tauri::async_runtime::spawn_blocking(move || git::branches(&path, remotes))
        .await
        .map_err(fail)
}

// Asagidaki dort komut (stage / unstage / commit / push) hep `async` +
// `spawn_blocking`. Es zamansiz olmayan bir komut Tauri'de ANA IS PARCACIGINDA
// kosuyor (bkz. `update_check`): `push` bir ag istegi, `commit` kullanicinin
// kancalarini (lint, test) kosturuyor, `add` buyuk bir klasorde saniyeler
// suruyor. Hicbiri pencereyi dondurmamali.

/// Verilen yollari indekse ekler (`git add`).
#[tauri::command]
async fn git_stage(path: String, files: Vec<String>) -> CmdResult<()> {
    tauri::async_runtime::spawn_blocking(move || git::stage(&path, &files))
        .await
        .map_err(fail)?
}

/// Verilen yollari indeksten cikarir; dosyalara dokunmaz.
#[tauri::command]
async fn git_unstage(path: String, files: Vec<String>) -> CmdResult<()> {
    tauri::async_runtime::spawn_blocking(move || git::unstage(&path, &files))
        .await
        .map_err(fail)?
}

/// Indeksi commit'ler; basarida kisa nesne kimligini doner.
#[tauri::command]
async fn git_commit(path: String, message: String) -> CmdResult<String> {
    tauri::async_runtime::spawn_blocking(move || git::commit(&path, &message))
        .await
        .map_err(fail)?
}

/// Push panelindeki "Commit'i geri al": son commit'i `reset --soft` ile
/// kaldirir, iletisini doner (gerekce `git::undo_last_commit`).
#[tauri::command]
async fn git_undo_commit(path: String, id: String) -> CmdResult<String> {
    tauri::async_runtime::spawn_blocking(move || git::undo_last_commit(&path, &id))
        .await
        .map_err(fail)?
}

/// Gecerli dali uzaga gonderir; basarida hedefi (`origin/main`) doner.
#[tauri::command]
async fn git_push(path: String) -> CmdResult<String> {
    tauri::async_runtime::spawn_blocking(move || git::push(&path))
        .await
        .map_err(fail)?
}

/// Gonderilecek commit'ler (bkz. `git::outgoing`).
///
/// Bu uc okuma `async` + `spawn_blocking`: uzagi olmayan bir depoda "yayinla"
/// listesi butun gecmisi sayiyor, buyuk bir commit'in farki da buyuk.
#[tauri::command]
async fn git_outgoing(path: String) -> CmdResult<git::GitOutgoing> {
    tauri::async_runtime::spawn_blocking(move || git::outgoing(&path))
        .await
        .map_err(fail)?
}

/// Bir commit'in dosyalari ve toplam dosya sayisi.
#[tauri::command]
async fn git_commit_files(path: String, id: String) -> CmdResult<git::StashFiles> {
    tauri::async_runtime::spawn_blocking(move || git::commit_files(&path, &id))
        .await
        .map_err(fail)?
}

/// Bir commit'teki tek dosyanin farki; okunamazsa `None`.
#[tauri::command]
async fn git_commit_diff(
    path: String,
    id: String,
    file: String,
    orig_path: Option<String>,
) -> CmdResult<Option<String>> {
    tauri::async_runtime::spawn_blocking(move || {
        git::commit_diff(&path, &id, &file, orig_path.as_deref())
    })
    .await
    .map_err(fail)
}

/// Deponun stash'leri, en yeni basta; depo degilse bos liste.
///
/// `async` (bkz. `git_info`): acik Stash bolumu listeyi depo durumu her
/// degistiginde yeniden okuyor - "hepsini sec"ten sonra da.
#[tauri::command]
async fn git_stashes(path: String) -> CmdResult<Vec<git::GitStash>> {
    tauri::async_runtime::spawn_blocking(move || git::stashes(&path))
        .await
        .map_err(fail)
}

/// Bir stash'in dosyalari (takipli + takipsiz) ve toplam dosya sayisi.
#[tauri::command]
async fn git_stash_files(path: String, id: String) -> CmdResult<git::StashFiles> {
    tauri::async_runtime::spawn_blocking(move || git::stash_files(&path, &id))
        .await
        .map_err(fail)?
}

/// Bir stash'teki tek dosyanin farki; okunamazsa `None`.
#[tauri::command]
async fn git_stash_diff(
    path: String,
    id: String,
    file: String,
    orig_path: Option<String>,
    untracked: bool,
) -> CmdResult<Option<String>> {
    tauri::async_runtime::spawn_blocking(move || {
        git::stash_diff(&path, &id, &file, orig_path.as_deref(), untracked)
    })
    .await
    .map_err(fail)
}

// Stash'in uc yazma komutu da `async` + `spawn_blocking` (bkz. yukaridaki not):
// `stash push` ve `stash apply` calisma agacini ve indeksi yeniden yaziyor,
// buyuk bir depoda saniyeler surebiliyor.

/// Yollari stash'e atar; basarida yeni stash'in kimligini doner.
#[tauri::command]
async fn git_stash_push(
    path: String,
    message: String,
    files: Vec<String>,
    include_untracked: bool,
) -> CmdResult<String> {
    tauri::async_runtime::spawn_blocking(move || {
        git::stash_push(&path, &message, &files, include_untracked)
    })
    .await
    .map_err(fail)?
}

/// Bir stash'i uygular; `pop` ise basarida siler.
#[tauri::command]
async fn git_stash_apply(path: String, id: String, pop: bool, index: bool) -> CmdResult<()> {
    tauri::async_runtime::spawn_blocking(move || git::stash_apply(&path, &id, pop, index))
        .await
        .map_err(fail)?
}

/// Bir stash'i siler.
#[tauri::command]
async fn git_stash_drop(path: String, id: String) -> CmdResult<()> {
    tauri::async_runtime::spawn_blocking(move || git::stash_drop(&path, &id))
        .await
        .map_err(fail)?
}

/// nvm ile kurulu Node surumleri ve kullanilan surum; nvm yoksa `None`.
///
/// Surec baslatmiyor, birkac klasor okuyor — her komut sonunda cagrilabilir.
#[tauri::command]
fn node_env() -> CmdResult<Option<nodever::NodeEnv>> {
    Ok(nodever::read())
}

/// Bir dizinin ALT DIZINLERI - dizin secici icin.
///
/// Yalnizca klasorler donuyor: secici bir dizine gecmek icin var, dosya
/// gostermek listeyi uzatip aranani zorlastirirdi.
///
/// Gizli klasorler DAHIL. Terminalde `.config`, `.git`, `.vscode` gunluk
/// kullanimda; onlari gizlemek dosya yoneticisi aliskanligi, kabuk aliskanligi
/// degil.
///
/// Okunamayan girisler sessizce atlaniyor: izin verilmeyen tek bir alt klasor
/// yuzunden butun listeyi kaybetmek kotu takas.
#[tauri::command]
fn list_dirs(path: String) -> CmdResult<Vec<String>> {
    let p = std::path::Path::new(&path);
    if !p.is_dir() {
        return Err(format!("klasor degil: {path}"));
    }

    let mut out: Vec<String> = Vec::new();
    for entry in std::fs::read_dir(p).map_err(fail)? {
        let Ok(entry) = entry else { continue };
        // `file_type()` sembolik baglantiyi IZLEMIYOR; klasore isaret eden bir
        // baglanti da secilebilmeli, o yuzden `is_dir()` ile dogruluyoruz.
        if !entry.path().is_dir() {
            continue;
        }
        if let Some(name) = entry.file_name().to_str() {
            out.push(name.to_string());
        }
    }
    // Buyuk/kucuk harf gozetmeden: `Docs` ile `bin` yan yana dururken ASCII
    // siralamasi butun buyuk harfleri one atiyor ve liste karisik gorunuyor.
    out.sort_by_key(|a| a.to_lowercase());
    Ok(out)
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

    // Ayni veri klasoruyle calisan bir N-Terminal varsa ikinci kopya acilmiyor:
    // oradaki pencere (arka planda gizli olabilir) one geliyor. Kabuk
    // entegrasyonuna, calisma alanina ve ekran ciktilarina dokunmadan once;
    // gerekcesi instance.rs'de.
    let Some(instance) = instance::acquire(&data_paths.root) else {
        eprintln!(
            "[nterminal] {} klasoruyle calisan bir N-Terminal var; penceresi one getirildi",
            data_paths.root.display()
        );
        return;
    };

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

    // Simge ve kapatma davranisi ayarlardan geliyor; `state` tasinmadan once
    // okuyoruz.
    let lang = state.settings.lock().language.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        // Yalnizca Rust tarafindan kullaniliyor (update.rs); arayuze izin
        // verilmiyor, `capabilities/default.json`da `updater:*` yok.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(state)
        .manage(update::Pending::default())
        .setup(move |app| {
            tray::setup(app.handle(), &lang)?;
            // Uygulama yeniden acildiginda gelen haber (bkz. instance.rs).
            let handle = app.handle().clone();
            instance.on_activate(move || tray::show_main(&handle));
            // Windows Installer / oturum kapatma istegi: tao'ya ulasmadan
            // yakalaniyor ve duzgun kapaniliyor (bkz. session_end.rs).
            session_end::install(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_bootstrap,
            paths_get,
            settings_save,
            settings_reset,
            settings_default_keybindings,
            profiles_detect,
            workspace_save,
            session_end_flushed,
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
            list_dirs,
            list_files,
            search_text,
            search_text_cancel,
            list_entries,
            read_text_file,
            read_image_file,
            write_text_file,
            update_check,
            update_download,
            update_apply,
            git_info,
            git_branches,
            git_diff,
            git_diff_sides,
            git_write_file,
            diff_window_open,
            diff_window_ready,
            main_window_open_file,
            git_revert,
            git_stage,
            git_unstage,
            git_commit,
            git_undo_commit,
            git_push,
            git_outgoing,
            git_commit_files,
            git_commit_diff,
            git_stashes,
            git_stash_files,
            git_stash_diff,
            git_stash_push,
            git_stash_apply,
            git_stash_drop,
            git_fingerprint,
            node_env,
            tray_labels,
        ])
        .on_window_event(|window, event| {
            // Kapatma KARARI burada DEGIL: arayuz `onCloseRequested`i yakalayip
            // durumu diske yaziyor ve ardindan `destroy()` cagiriyor. `destroy`
            // kapatma istegini tumden atladigi icin buraya konulacak bir
            // `prevent_close()` hicbir zaman is gormuyor - denendi, "arka planda
            // kal" ayari calismadi. Karar tek yerde: `App.tsx`.
            //
            // Burada yalnizca yikim sonrasi temizlik var: pencere yok olurken
            // kabuk sureclerini birakmiyoruz, aksi halde arkada sahipsiz
            // conhost/powershell surecleri kalir.
            //
            // YALNIZCA ana pencere. Fark pencereleri de bu kancaya dusuyor ve
            // etiket denetimi olmadan bir fark penceresini kapatmak butun
            // sekmelerin kabuklarini oldururdu.
            if let tauri::WindowEvent::Destroyed = event {
                if window.label() != "main" {
                    return;
                }
                if let Some(state) = window.app_handle().try_state::<AppState>() {
                    state.pty.kill_all();
                }
                // Ana pencere gitti (tamamen cikis): acik fark pencereleri de
                // kapanmali. Kalsalar surec onlarla birlikte yasamaya devam eder
                // - kabuklari olmus, simgesi duran ama ana penceresi olmayan bir
                // uygulama.
                for (label, other) in window.app_handle().webview_windows() {
                    if label != "main" {
                        let _ = other.destroy();
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("NTerminal baslatilamadi");
}

// Kullanilmayan ithal uyarilarini onlemek icin: ImportNote yalnizca donus
// turlerinde geciyor ama modul disina acik olmasi gerekiyor.
const _: fn() -> Option<ImportNote> = || None;
