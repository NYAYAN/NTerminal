//! Yapilandirmanin disa/ice aktarimi (export / import).
//!
//! Amac: ayni yapilandirmayi baska bir bilgisayarda kullanabilmek. Iki yer
//! makineye bagimli oldugu icin ozel is goruyor:
//!
//! 1. Yollar. `C:\Users\ali\...` ikinci makinede yoktur. Disa aktarirken bilinen
//!    on ekleri `${HOME}` gibi belirteclere ceviriyoruz, ice alirken geri aciyoruz.
//! 2. Kabuk konumlari. PowerShell 7 bir makinede Program Files'ta, otekinde
//!    WindowsApps'ta olabilir. Ice alirken exe bulunamazsa ayni turden kurulu
//!    bir kabuk aranip yol duzeltiliyor; bulunamazsa profil "kullanilamaz"
//!    isaretlenip rapora yaziliyor - sessizce bozuk profil birakmiyoruz.

use crate::favorites::{Favorite, FavoriteStore};
use crate::history::HistoryStore;
use crate::model::{
    Group, HistoryEntry, Profile, Settings, Workspace, BUNDLE_VERSION,
};
use crate::paths::DataPaths;
use crate::shells;
use crate::store;
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::Path;

pub const BUNDLE_KIND: &str = "nterminal-config";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Bundle {
    pub kind: String,
    pub version: u32,
    #[serde(default)]
    pub exported_at: i64,
    #[serde(default)]
    pub app_version: String,
    /// Bilgi amacli: dosyanin hangi makineden geldigi.
    #[serde(default)]
    pub machine: String,
    /// Yollar belirtece cevrilmis mi?
    #[serde(default)]
    pub portable_paths: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub settings: Option<Settings>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace: Option<Workspace>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub history: Option<Vec<HistoryEntry>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub favorites: Option<Vec<Favorite>>,
    /// sekmeKimligi -> ANSI ekran ciktisi
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scrollback: Option<BTreeMap<String, String>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportOptions {
    #[serde(default = "yes")]
    pub include_settings: bool,
    #[serde(default = "yes")]
    pub include_workspace: bool,
    #[serde(default)]
    pub include_history: bool,
    /// Favori komutlar. Ayarlarla birlikte tasinmasi beklenen bir sey oldugu
    /// icin varsayilan olarak acik.
    #[serde(default = "yes")]
    pub include_favorites: bool,
    #[serde(default)]
    pub include_scrollback: bool,
    /// Yollari `${HOME}` gibi belirteclere cevir.
    #[serde(default = "yes")]
    pub portable_paths: bool,
}

fn yes() -> bool {
    true
}

impl Default for ExportOptions {
    fn default() -> Self {
        Self {
            include_settings: true,
            include_workspace: true,
            include_history: false,
            include_favorites: true,
            include_scrollback: false,
            portable_paths: true,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ImportMode {
    /// Dokunma.
    Skip,
    /// Mevcut olani tamamen degistir.
    Replace,
    /// Birlestir: gelen kazanir, yerelde olup gelende olmayan korunur.
    Merge,
}

impl Default for ImportMode {
    fn default() -> Self {
        ImportMode::Replace
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportOptions {
    #[serde(default)]
    pub settings: ImportMode,
    #[serde(default)]
    pub workspace: ImportMode,
    #[serde(default = "skip_mode")]
    pub history: ImportMode,
    #[serde(default)]
    pub favorites: ImportMode,
    #[serde(default)]
    pub scrollback: bool,
}

fn skip_mode() -> ImportMode {
    ImportMode::Skip
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportSummary {
    pub path: String,
    pub bytes: u64,
    pub profiles: usize,
    pub groups: usize,
    pub tabs: usize,
    pub history: usize,
    pub favorites: usize,
    pub scrollback: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BundleInfo {
    pub path: String,
    pub version: u32,
    pub exported_at: i64,
    pub app_version: String,
    pub machine: String,
    pub portable_paths: bool,
    pub has_settings: bool,
    pub has_workspace: bool,
    pub profiles: usize,
    pub groups: usize,
    pub tabs: usize,
    pub history: usize,
    pub favorites: usize,
    pub scrollback: usize,
    /// Profil bazinda uyari/duzeltme raporu.
    pub notes: Vec<ImportNote>,
    /// Dosyadaki profillerin CALISTIRDIGI komutlar - on izlemede gosteriliyor.
    ///
    /// Ice alinan profil ilk sekmede oldugu gibi calisiyor (`pty::spawn`):
    /// `shell: /bin/sh, args: ["-c", "curl … | sh"]` yazan bir dosya, sayiyi
    /// gorup "3 profil" diyen biri icin keyfi komut demek. Ad, tur, kabuk ve
    /// argumanlar goz onunde olunca paylasilan dosyaya bakmadan onaylanmiyor.
    pub profile_list: Vec<ProfilePreview>,
}

/// On izlemede bir profilin kimligi: ne calistiriyor, hangi ortam anahtarlari.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProfilePreview {
    pub name: String,
    pub kind: crate::model::ShellKind,
    pub shell: String,
    pub args: Vec<String>,
    /// Yalnizca anahtarlar: degerler sir olabilir ve ekranda isi yok.
    pub env_keys: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportNote {
    pub level: String,
    pub subject: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub settings_applied: bool,
    pub workspace_applied: bool,
    pub profiles_added: usize,
    pub groups_added: usize,
    pub history_added: usize,
    pub favorites_added: usize,
    pub scrollback_added: usize,
    pub notes: Vec<ImportNote>,
}

// ------------------------------------------------------- yol belirtecleri

/// (belirtec, bu makinedeki karsilik) listesi. Uzun yollar once denenir ki
/// `${LOCALAPPDATA}` yerine yanlislikla `${HOME}` yazilmasin.
fn path_tokens() -> Vec<(&'static str, String)> {
    let mut tokens: Vec<(&'static str, String)> = Vec::new();
    let mut push = |token: &'static str, value: Option<String>| {
        if let Some(v) = value {
            let v = v.trim_end_matches(['\\', '/']).to_string();
            if !v.is_empty() {
                tokens.push((token, v));
            }
        }
    };
    push("${LOCALAPPDATA}", std::env::var("LOCALAPPDATA").ok());
    push("${APPDATA}", std::env::var("APPDATA").ok());
    push(
        "${HOME}",
        dirs::home_dir().map(|p| p.to_string_lossy().to_string()),
    );
    push("${PROGRAMFILES86}", std::env::var("ProgramFiles(x86)").ok());
    push("${PROGRAMFILES}", std::env::var("ProgramFiles").ok());
    push("${PROGRAMDATA}", std::env::var("ProgramData").ok());
    push("${SYSTEMROOT}", std::env::var("SystemRoot").ok());
    tokens.sort_by_key(|(_, v)| std::cmp::Reverse(v.len()));
    tokens
}

/// `haystack` `needle` ile (ASCII buyuk/kucuk harf gozetmeden) basliyor mu?
///
/// `get(..n)`, dilimleme DEGIL. Dilim `[..n]` bir cok baytli karakterin
/// ortasina denk gelirse panikler ve surum yapisinda (`panic = "abort"`)
/// uygulama butun kabuklariyla kapanir. Ornegi gercek: ev dizini
/// `/Users/ali` (10 bayt) iken bir sekmenin klasoru `/Users/alı/x` -
/// `ı` iki bayt ve 10. bayt onun ortasi. `get` sinirda degilse `None`
/// donuyor; sinirda degilse zaten eslesme de yok.
fn starts_with_ci(haystack: &str, needle: &str) -> bool {
    haystack
        .get(..needle.len())
        .is_some_and(|head| head.eq_ignore_ascii_case(needle))
}

/// Makineye ozel yolu belirtece cevirir.
fn tokenize(value: &str, tokens: &[(&'static str, String)]) -> String {
    for (token, concrete) in tokens {
        if starts_with_ci(value, concrete) {
            return format!("{}{}", token, &value[concrete.len()..]);
        }
    }
    value.to_string()
}

/// Belirteci bu makinedeki gercek yola cevirir.
fn expand(value: &str, tokens: &[(&'static str, String)]) -> String {
    let mut out = value.to_string();
    for (token, concrete) in tokens {
        if out.contains(token) {
            out = out.replace(token, concrete);
        }
    }
    out
}

fn map_profile_paths(profile: &mut Profile, f: &dyn Fn(&str) -> String) {
    if !profile.shell.trim().is_empty() {
        profile.shell = f(&profile.shell);
    }
    if let Some(cwd) = &profile.cwd {
        profile.cwd = Some(f(cwd));
    }
    // Env degerleri de yol icerebilir (ornek: JAVA_HOME).
    let mapped: BTreeMap<String, String> = profile
        .env
        .iter()
        .map(|(k, v)| (k.clone(), f(v)))
        .collect();
    profile.env = mapped;
}

fn map_bundle_paths(bundle: &mut Bundle, f: &dyn Fn(&str) -> String) {
    if let Some(settings) = &mut bundle.settings {
        for profile in &mut settings.profiles {
            map_profile_paths(profile, f);
        }
    }
    if let Some(workspace) = &mut bundle.workspace {
        for group in &mut workspace.groups {
            if let Some(cwd) = &group.default_cwd {
                group.default_cwd = Some(f(cwd));
            }
            let mapped: BTreeMap<String, String> =
                group.env.iter().map(|(k, v)| (k.clone(), f(v))).collect();
            group.env = mapped;
            for tab in &mut group.tabs {
                if let Some(cwd) = &tab.cwd {
                    tab.cwd = Some(f(cwd));
                }
            }
        }
    }
    if let Some(history) = &mut bundle.history {
        for entry in history {
            if let Some(cwd) = &entry.cwd {
                entry.cwd = Some(f(cwd));
            }
        }
    }
    if let Some(favorites) = &mut bundle.favorites {
        for favorite in favorites {
            if let Some(cwd) = &favorite.cwd {
                favorite.cwd = Some(f(cwd));
            }
        }
    }
}

// -------------------------------------------------------------- disa aktar

pub fn build_bundle(
    paths: &DataPaths,
    settings: &Settings,
    workspace: &Workspace,
    history: &HistoryStore,
    favorites: &FavoriteStore,
    options: &ExportOptions,
) -> Bundle {
    let mut bundle = Bundle {
        kind: BUNDLE_KIND.into(),
        version: BUNDLE_VERSION,
        exported_at: store::now_ms(),
        app_version: env!("CARGO_PKG_VERSION").into(),
        machine: std::env::var("COMPUTERNAME").unwrap_or_default(),
        portable_paths: options.portable_paths,
        settings: options.include_settings.then(|| settings.clone()),
        workspace: options.include_workspace.then(|| workspace.clone()),
        history: options.include_history.then(|| history.snapshot()),
        favorites: options.include_favorites.then(|| favorites.snapshot()),
        scrollback: None,
    };

    if options.include_scrollback && options.include_workspace {
        let mut map = BTreeMap::new();
        for group in &workspace.groups {
            for tab in &group.tabs {
                if let Some(data) = store::load_scrollback(paths, &tab.id) {
                    map.insert(tab.id.clone(), data);
                }
            }
        }
        if !map.is_empty() {
            bundle.scrollback = Some(map);
        }
    }

    if options.portable_paths {
        let tokens = path_tokens();
        let f = move |v: &str| tokenize(v, &tokens);
        map_bundle_paths(&mut bundle, &f);
    }

    bundle
}

pub fn export_to_file(bundle: &Bundle, target: &Path) -> Result<ExportSummary> {
    let text = serde_json::to_string_pretty(bundle)?;
    store::write_atomic(target, &text)
        .with_context(|| format!("dosya yazilamadi: {}", target.display()))?;
    Ok(ExportSummary {
        path: target.to_string_lossy().to_string(),
        bytes: text.len() as u64,
        profiles: bundle.settings.as_ref().map(|s| s.profiles.len()).unwrap_or(0),
        groups: bundle.workspace.as_ref().map(|w| w.groups.len()).unwrap_or(0),
        tabs: bundle
            .workspace
            .as_ref()
            .map(|w| w.groups.iter().map(|g| g.tabs.len()).sum())
            .unwrap_or(0),
        history: bundle.history.as_ref().map(|h| h.len()).unwrap_or(0),
        favorites: bundle.favorites.as_ref().map(|f| f.len()).unwrap_or(0),
        scrollback: bundle.scrollback.as_ref().map(|s| s.len()).unwrap_or(0),
    })
}

// --------------------------------------------------------------- ice al

pub fn read_bundle(path: &Path) -> Result<Bundle> {
    let text = std::fs::read_to_string(path)
        .with_context(|| format!("dosya okunamadi: {}", path.display()))?;
    let bundle: Bundle = serde_json::from_str(&text)
        .context("dosya bir NTerminal yapilandirma dosyasi gibi gorunmuyor")?;
    if bundle.kind != BUNDLE_KIND {
        anyhow::bail!("beklenmeyen dosya turu: {}", bundle.kind);
    }
    if bundle.version > BUNDLE_VERSION {
        anyhow::bail!(
            "dosya daha yeni bir NTerminal surumune ait (v{}); uygulamayi guncelleyin",
            bundle.version
        );
    }
    Ok(bundle)
}

/// Yollari acar, kabuk konumlarini bu makineye gore duzeltir ve rapor uretir.
/// Hem on izleme hem de uygulama adiminda ayni kod calisiyor: kullaniciya
/// gosterilen rapor ile gercekte olan is birebir ayni olsun.
pub fn normalize_for_this_machine(bundle: &mut Bundle) -> Vec<ImportNote> {
    let mut notes = Vec::new();
    let tokens = path_tokens();

    if bundle.portable_paths {
        let f = |v: &str| expand(v, &tokens);
        map_bundle_paths(bundle, &f);
    }

    let detected = shells::detect_profiles();

    if let Some(settings) = &mut bundle.settings {
        for profile in &mut settings.profiles {
            let exe = store::profile_executable(profile);
            if shells::executable_available(&exe) {
                profile.unavailable = false;
                continue;
            }
            // Ayni turden kurulu bir kabuk var mi?
            match detected.iter().find(|d| d.kind == profile.kind) {
                Some(replacement) => {
                    notes.push(ImportNote {
                        level: "fixed".into(),
                        subject: profile.name.clone(),
                        message: format!(
                            "{} bulunamadi, bu makinedeki {} kullanilacak",
                            exe, replacement.shell
                        ),
                    });
                    profile.shell = replacement.shell.clone();
                    profile.unavailable = false;
                }
                None => {
                    notes.push(ImportNote {
                        level: "warn".into(),
                        subject: profile.name.clone(),
                        message: format!("{} bu makinede yok; profil devre disi", exe),
                    });
                    profile.unavailable = true;
                }
            }
        }
    }

    if let Some(workspace) = &mut bundle.workspace {
        let home = dirs::home_dir().map(|p| p.to_string_lossy().to_string());
        for group in &mut workspace.groups {
            if let Some(cwd) = group.default_cwd.clone() {
                if !Path::new(&cwd).is_dir() {
                    notes.push(ImportNote {
                        level: "warn".into(),
                        subject: format!("Grup: {}", group.name),
                        message: format!("{} klasoru yok; ev dizini kullanilacak", cwd),
                    });
                    group.default_cwd = None;
                }
            }
            for tab in &mut group.tabs {
                if let Some(cwd) = tab.cwd.clone() {
                    if !Path::new(&cwd).is_dir() {
                        tab.cwd = home.clone();
                    }
                }
                // Baska makinenin scrollback dosyalari bizde yok.
                if bundle.scrollback.as_ref().map(|s| s.contains_key(&tab.id)) != Some(true) {
                    tab.has_scrollback = false;
                }
            }
        }
    }

    if let Some(favorites) = &mut bundle.favorites {
        for favorite in favorites {
            if let Some(cwd) = favorite.cwd.clone() {
                if !Path::new(&cwd).is_dir() {
                    notes.push(ImportNote {
                        level: "warn".into(),
                        subject: format!("Favori: {}", favorite.label.as_deref().unwrap_or(&favorite.command)),
                        message: format!("{cwd} klasoru yok; aktif sekmenin klasorunde calisacak"),
                    });
                    favorite.cwd = None;
                }
            }
        }
    }

    notes
}

pub fn describe(path: &Path, bundle: &Bundle, notes: Vec<ImportNote>) -> BundleInfo {
    BundleInfo {
        path: path.to_string_lossy().to_string(),
        version: bundle.version,
        exported_at: bundle.exported_at,
        app_version: bundle.app_version.clone(),
        machine: bundle.machine.clone(),
        portable_paths: bundle.portable_paths,
        has_settings: bundle.settings.is_some(),
        has_workspace: bundle.workspace.is_some(),
        profiles: bundle.settings.as_ref().map(|s| s.profiles.len()).unwrap_or(0),
        groups: bundle.workspace.as_ref().map(|w| w.groups.len()).unwrap_or(0),
        tabs: bundle
            .workspace
            .as_ref()
            .map(|w| w.groups.iter().map(|g| g.tabs.len()).sum())
            .unwrap_or(0),
        history: bundle.history.as_ref().map(|h| h.len()).unwrap_or(0),
        favorites: bundle.favorites.as_ref().map(|f| f.len()).unwrap_or(0),
        scrollback: bundle.scrollback.as_ref().map(|s| s.len()).unwrap_or(0),
        notes,
        profile_list: bundle
            .settings
            .as_ref()
            .map(|s| {
                s.profiles
                    .iter()
                    .map(|p| ProfilePreview {
                        name: p.name.clone(),
                        kind: p.kind,
                        shell: p.shell.clone(),
                        args: p.args.clone(),
                        env_keys: p.env.keys().cloned().collect(),
                    })
                    .collect()
            })
            .unwrap_or_default(),
    }
}

/// Ayarlari birlestirir: gelen tercihler kazanir, yerelde olup gelende olmayan
/// profiller (ada gore) korunur.
pub fn merge_settings(local: &Settings, incoming: &Settings) -> Settings {
    let mut merged = incoming.clone();
    for local_profile in &local.profiles {
        let exists = merged
            .profiles
            .iter()
            .any(|p| p.name.eq_ignore_ascii_case(&local_profile.name));
        if !exists {
            merged.profiles.push(local_profile.clone());
        }
    }
    for (action, combo) in &local.keybindings {
        merged.keybindings.entry(action.clone()).or_insert(combo.clone());
    }
    if !merged
        .profiles
        .iter()
        .any(|p| p.id == merged.default_profile_id)
    {
        merged.default_profile_id = merged
            .profiles
            .first()
            .map(|p| p.id.clone())
            .unwrap_or_default();
    }
    merged
}

/// Calisma alanini birlestirir: gelen gruplar eklenir, ada gore cakisanlar
/// "<ad> (gelen)" olarak yeniden adlandirilir - kullanicinin mevcut duzeni bozulmaz.
///
/// SEKME kimlikleri de cakismaya karsi yenileniyor; gerekcesi
/// `ensure_unique_tab_ids` icinde.
pub fn merge_workspace(local: &Workspace, incoming: &Workspace) -> (Workspace, usize) {
    let mut merged = local.clone();
    let mut added = 0;

    // Mevcut TUM sekme kimlikleri. Cakisma grupla sinirli degil: ayni makinede
    // alinmis bir paket geri alindiginda gelen sekmeler yerel olanlarla birebir
    // ayni kimligi tasiyor, gruplarin adlari farkli olsa bile.
    let mut tab_ids: std::collections::HashSet<String> = merged
        .groups
        .iter()
        .flat_map(|g| g.tabs.iter().map(|t| t.id.clone()))
        .collect();

    for group in &incoming.groups {
        let clash = merged
            .groups
            .iter()
            .any(|g| g.name.eq_ignore_ascii_case(&group.name));
        let mut copy = group.clone();
        if clash {
            copy.name = format!("{} (gelen)", group.name);
        }
        // Kimlik cakismasini onle: ayni id iki grupta olamaz.
        if merged.groups.iter().any(|g| g.id == copy.id) {
            copy.id = store::new_id("grp");
        }
        ensure_unique_tab_ids(&mut copy, &mut tab_ids);
        merged.groups.push(copy);
        added += 1;
    }
    (merged, added)
}

/// Gruptaki sekmelerden kimligi ZATEN KULLANILANLARA yeni kimlik verir.
///
/// ## Neden gerekiyor
///
/// BILDIRILEN HATA: birlestirmeli ice almadan sonra "GurselAPP" ve
/// "GurselAPP (gelen)" gruplari yan yana duruyordu ve gelen gruptaki bir
/// sekmeye tiklamak DIGER gruptaki sekmeyi etkinlestiriyordu.
///
/// Sebep: grup adi ve grup kimligi yenileniyordu ama icindeki sekmeler ayni
/// kimlikle iki kez listeye giriyordu. Arayuz sekmeyi kimlikle ariyor
/// (`setActiveTab`, `closeTab`, terminal oturumlari, scrollback dosyasi) ve
/// arama ILK eslesmede duruyor - yani ikinci kopya erisilemez, birincisi ise
/// iki yerden yonetiliyor. Tiklamanin yanlis sekmeyi secmesi bunun en gorunur
/// belirtisiydi; sekme kapatmak ve terminal ciktisinin karismasi da ayni
/// kokten geliyor.
///
/// Yenilenen sekmenin `has_scrollback` isareti dusuruluyor: kaydedilmis ekran
/// ciktisi ESKI kimligin dosyasinda duruyor, yeni kimlikte oyle bir dosya yok.
/// Isareti birakmak arayuze var olmayan bir gecmisi vaat ettirirdi.
fn ensure_unique_tab_ids(group: &mut Group, taken: &mut std::collections::HashSet<String>) {
    for tab in group.tabs.iter_mut() {
        if taken.insert(tab.id.clone()) {
            continue;
        }
        let fresh = store::new_id("tab");
        if group.active_tab_id.as_deref() == Some(tab.id.as_str()) {
            group.active_tab_id = Some(fresh.clone());
        }
        tab.id = fresh.clone();
        tab.has_scrollback = false;
        taken.insert(fresh);
    }
}

#[cfg(test)]
#[path = "transfer_tests.rs"]
mod tests;
