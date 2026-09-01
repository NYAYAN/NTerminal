//! settings.json / workspace.json ve sekme scrollback dosyalarinin kaliciligi.
//!
//! Yazma her zaman "gecici dosyaya yaz + yerine tasi" seklinde yapiliyor:
//! uygulama kapanirken veya cokerken yarim yazilmis bir settings.json
//! kullanicinin tum yapilandirmasini kaybettirmesin.

use crate::model::{Group, Profile, Settings, ShellKind, TabState, Workspace};
use crate::paths::DataPaths;
use crate::shells;
use anyhow::{Context, Result};
use std::fs;
use std::io::Write;
use std::path::Path;

pub fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

pub fn new_id(prefix: &str) -> String {
    format!("{}-{}", prefix, uuid::Uuid::new_v4().simple())
}

/// Atomik yazma. Ayni klasorde .tmp dosyasi olusturup rename ediyoruz;
/// Windows'ta ayni surucu icindeki rename atomiktir.
pub fn write_atomic(path: &Path, contents: &str) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("klasor olusturulamadi: {}", parent.display()))?;
    }
    let tmp = path.with_extension(format!(
        "{}.tmp",
        path.extension().and_then(|e| e.to_str()).unwrap_or("dat")
    ));
    {
        let mut f = fs::File::create(&tmp)
            .with_context(|| format!("gecici dosya olusturulamadi: {}", tmp.display()))?;
        f.write_all(contents.as_bytes())?;
        f.flush()?;
        f.sync_all()?;
    }
    // Windows'ta hedef varsa rename hata verir; once siliyoruz.
    if path.exists() {
        let _ = fs::remove_file(path);
    }
    fs::rename(&tmp, path).with_context(|| format!("dosya tasinamadi: {}", path.display()))?;
    Ok(())
}

// ------------------------------------------------------------------ ayarlar

pub fn load_settings(paths: &DataPaths) -> Settings {
    let file = paths.settings_file();
    let existed = file.exists();
    let mut settings = match fs::read_to_string(&file) {
        Ok(text) => serde_json::from_str::<Settings>(&text).unwrap_or_else(|err| {
            // Bozuk dosyayi silmiyoruz, yedekliyoruz: kullanici elle kurtarabilsin.
            let backup = file.with_extension("json.bozuk");
            let _ = fs::copy(&file, &backup);
            eprintln!(
                "[nterminal] settings.json okunamadi ({err}); yedek: {}",
                backup.display()
            );
            Settings::default()
        }),
        Err(_) => Settings::default(),
    };

    // Yuklerken tamamladigimiz her sey `changed` isaretini kaldiriyor; sonunda
    // dosyayi bir kez yazip guncel tutuyoruz.
    let mut changed = !existed;

    /*
     * Surum 2: gecmiste tekrarlari gizle ACIK.
     *
     * Varsayilani degistirmek YETMIYOR ve bu olculdu: kullanici ayari istedi,
     * kod degisti, ama onun dosyasinda alan zaten `false` yaziliyken duruyordu
     * ve arayuzde hala tiksiz geliyordu. Varsayilan yalnizca YENI kurulumlari
     * etkiliyor.
     *
     * Tasima BIR KEZ kosuyor (surum damgasiyla): kullanici bundan sonra kapatmak
     * isterse kapatabilsin, her acilista karari geri alinmasin.
     */
    if settings.version < 2 {
        settings.behavior.history_dedupe = true;
        settings.version = crate::model::SETTINGS_VERSION;
        changed = true;
    }

    // Profil listesi bossa (ilk acilis) makinede kurulu kabuklari tara.
    if settings.profiles.is_empty() {
        settings.profiles = shells::detect_profiles();
        changed = true;
    }
    // Eksik kisayollari varsayilanlarla tamamla; kullanicinin ezdikleri korunur.
    for (action, combo) in crate::model::default_keybindings() {
        if let std::collections::btree_map::Entry::Vacant(slot) =
            settings.keybindings.entry(action)
        {
            slot.insert(combo);
            changed = true;
        }
    }
    if settings.default_profile_id.is_empty()
        || !settings
            .profiles
            .iter()
            .any(|p| p.id == settings.default_profile_id)
    {
        settings.default_profile_id = settings
            .profiles
            .first()
            .map(|p| p.id.clone())
            .unwrap_or_default();
        changed = true;
    }

    // Tamamlanan degerleri hemen diske yaziyoruz. Iki nedenle:
    //
    //  * Otomatik uretilen profiller yazilmazsa her acilista yeniden taranir ve
    //    yeni kimlikler alir; sekmeler profile kimlikle bagli oldugu icin
    //    "bu sekme Git Bash olsun" bilgisi sessizce kaybolur.
    //  * Yeni bir surumde eklenen alanlar (kisayol, gorunum alani) yazilmazsa
    //    dosya kalici olarak eski kalir; kullanici dosyaya bakip "bu ayar yok"
    //    diye dusunur.
    if changed {
        if let Err(err) = save_settings(paths, &settings) {
            eprintln!("[nterminal] ayar dosyasi yazilamadi: {err}");
        }
    }

    settings
}

pub fn save_settings(paths: &DataPaths, settings: &Settings) -> Result<()> {
    let text = serde_json::to_string_pretty(settings)?;
    write_atomic(&paths.settings_file(), &text)
}

// -------------------------------------------------------- calisma alani

pub fn load_workspace(paths: &DataPaths, settings: &Settings) -> Workspace {
    let file = paths.workspace_file();
    let mut ws = match fs::read_to_string(&file) {
        Ok(text) => serde_json::from_str::<Workspace>(&text).unwrap_or_else(|err| {
            // Bozuk dosyayi YEDEKLIYORUZ, ayarlarda oldugu gibi. Eskiden
            // yalnizca stderr'e yazip bos duzenle basliyorduk - ve bos duzen
            // ilk kayitta gercek dosyanin uzerine yaziliyordu. Yani tek bir
            // okuma sorunu butun grup/sekme duzenini kalici olarak siliyordu;
            // kullanicinin elinde hicbir kurtarma yolu kalmiyordu.
            let backup = file.with_extension("json.bozuk");
            let _ = fs::copy(&file, &backup);
            eprintln!(
                "[nterminal] workspace.json okunamadi ({err}); yedek: {}",
                backup.display()
            );
            Workspace::default()
        }),
        Err(_) => Workspace::default(),
    };

    if !settings.behavior.restore_session {
        ws = Workspace::default();
    }

    if ws.groups.is_empty() {
        ws.groups.push(default_group(settings));
    }

    /*
     * Ayni sekme kimliginin iki kez gecmesini onar.
     *
     * BILDIRILEN HATA: birlestirmeli ice almadan sonra "GurselAPP" ve
     * "GurselAPP (gelen)" gruplari yan yana duruyordu ve gelen gruptaki bir
     * sekmeye tiklamak DIGER gruptaki sekmeyi etkinlestiriyordu. Sebep
     * `transfer::merge_workspace` idi (orada duzeltildi): grup kimligi
     * yenileniyor ama icindeki sekmelerinki yenilenmiyordu.
     *
     * Onarim BURADA da gerekiyor cunku birlestirmeyi duzeltmek DISKTE
     * ZATEN DURAN bozuk dosyayi duzeltmiyor. Arayuz sekmeyi kimlikle ariyor
     * ve arama ilk eslesmede duruyor: ikinci kopya erisilemez, birincisi iki
     * yerden yonetiliyor. Yukleme aninda yeni kimlik vermek bunu sessizce
     * ve tek seferde kapatiyor.
     *
     * `has_scrollback` dusuruluyor: kaydedilmis cikti eski kimligin
     * dosyasinda; yeni kimlikte oyle bir dosya yok.
     */
    {
        let mut gorulen: std::collections::HashSet<String> = std::collections::HashSet::new();
        for group in &mut ws.groups {
            for tab in &mut group.tabs {
                if gorulen.insert(tab.id.clone()) {
                    continue;
                }
                let yeni = new_id("tab");
                if group.active_tab_id.as_deref() == Some(tab.id.as_str()) {
                    group.active_tab_id = Some(yeni.clone());
                }
                eprintln!(
                    "[nterminal] yinelenen sekme kimligi onarildi: {} -> {}",
                    tab.id, yeni
                );
                tab.id = yeni.clone();
                tab.has_scrollback = false;
                gorulen.insert(yeni);
            }
        }
    }

    // Diskte scrollback dosyasi kalmamis sekmelerin isaretini duzelt; yoksa
    // arayuz "gecmis var" der ama bos icerik yukler.
    for group in &mut ws.groups {
        for tab in &mut group.tabs {
            if tab.has_scrollback && !paths.scrollback_file(&tab.id).exists() {
                tab.has_scrollback = false;
            }
        }
        if group
            .active_tab_id
            .as_ref()
            .map(|id| !group.tabs.iter().any(|t| &t.id == id))
            .unwrap_or(false)
        {
            group.active_tab_id = group.tabs.first().map(|t| t.id.clone());
        }
    }

    let group_exists = ws
        .active_group_id
        .as_ref()
        .map(|id| ws.groups.iter().any(|g| &g.id == id))
        .unwrap_or(false);
    if !group_exists {
        ws.active_group_id = ws.groups.first().map(|g| g.id.clone());
    }
    ws
}

/// Toplam sekme sayisi.
fn tab_count(ws: &Workspace) -> usize {
    ws.groups.iter().map(|g| g.tabs.len()).sum()
}

/// Duzen SICRAMALI kuculuyorsa uzerine yazmadan once bir kopya birak.
///
/// Yasanmis bir kayiptan geliyor: bes gruplu, dokuz sekmeli bir duzenin
/// uzerine tek gruplu bos bir duzen yazildi ve geri donus yolu kalmadi.
/// Duzeni geri getirmek komut gecmisinden elle yeniden kurmayi gerektirdi -
/// grup adlari da oradan gelmedigi icin tam kurtarilamadi.
///
/// Yazma zaten atomik (`write_atomic`), yani dosya yarim kalmiyor; korunan sey
/// dosyanin BUTUNLUGU degil ICERIGI. Bos bir duzen de gecerli bir duzen, o
/// yuzden hicbir dogrulama onu durdurmaz - tek savunma bir onceki hali
/// saklamak.
///
/// Her kayitta degil yalnizca sicramali kucullmede: sekme kapatmak siradan bir
/// is ve her seferinde yedeklemek yedegi de kisa surede ayni kayba ugratirdi.
/// Esik "sekmelerin yarisindan cogu gitti" - normal duzenlemede olmayan,
/// kaybin imzasi olan bicim.
fn snapshot_if_shrinking(paths: &DataPaths, incoming: &Workspace) {
    let file = paths.workspace_file();
    let Ok(text) = fs::read_to_string(&file) else {
        return;
    };
    let Ok(current) = serde_json::from_str::<Workspace>(&text) else {
        return;
    };

    let before = tab_count(&current);
    let after = tab_count(incoming);
    if before >= 2 && after * 2 < before {
        let backup = file.with_extension("json.onceki");
        let _ = fs::copy(&file, &backup);
        eprintln!(
            "[nterminal] duzen {before} sekmeden {after} sekmeye dustu; onceki hal: {}",
            backup.display()
        );
    }
}

pub fn save_workspace(paths: &DataPaths, workspace: &Workspace) -> Result<()> {
    snapshot_if_shrinking(paths, workspace);
    let mut ws = workspace.clone();
    ws.saved_at = now_ms();
    let text = serde_json::to_string_pretty(&ws)?;
    write_atomic(&paths.workspace_file(), &text)
}

fn default_group(settings: &Settings) -> Group {
    let profile_id = settings.default_profile_id.clone();
    let tab = TabState {
        id: new_id("tab"),
        title: String::new(),
        custom_title: None,
        profile_id: profile_id.clone(),
        cwd: dirs::home_dir().map(|p| p.to_string_lossy().to_string()),
        created_at: now_ms(),
        last_active_at: now_ms(),
        has_scrollback: false,
        last_command: None,
        locked: false,
    };
    Group {
        id: new_id("grp"),
        name: "Genel".into(),
        color: Some("#4f8cc9".into()),
        icon: Some("terminal".into()),
        collapsed: false,
        favorite: false,
        default_profile_id: if profile_id.is_empty() { None } else { Some(profile_id) },
        default_cwd: None,
        env: Default::default(),
        active_tab_id: Some(tab.id.clone()),
        tabs: vec![tab],
    }
}

// -------------------------------------------------------------- scrollback

pub fn save_scrollback(paths: &DataPaths, tab_id: &str, data: &str) -> Result<()> {
    let file = paths.scrollback_file(tab_id);
    if data.trim().is_empty() {
        let _ = fs::remove_file(&file);
        return Ok(());
    }
    write_atomic(&file, data)
}

pub fn load_scrollback(paths: &DataPaths, tab_id: &str) -> Option<String> {
    fs::read_to_string(paths.scrollback_file(tab_id)).ok()
}

pub fn delete_scrollback(paths: &DataPaths, tab_id: &str) {
    let _ = fs::remove_file(paths.scrollback_file(tab_id));
}

/// Artik var olmayan sekmelerin scrollback dosyalarini temizler. Uygulama
/// acilisinda cagriliyor, aksi halde klasor sinirsiz buyur.
pub fn prune_scrollback(paths: &DataPaths, keep: &[String]) -> usize {
    let keep: std::collections::HashSet<String> =
        keep.iter().map(|id| crate::paths::sanitize(id)).collect();
    let mut removed = 0;
    if let Ok(entries) = fs::read_dir(paths.scrollback_dir()) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("ansi") {
                continue;
            }
            let stem = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or_default()
                .to_string();
            if !keep.contains(&stem) && fs::remove_file(&path).is_ok() {
                removed += 1;
            }
        }
    }
    removed
}

/// Profil kimliginden calistirilabilir komutu cozer.
pub fn resolve_profile<'a>(settings: &'a Settings, profile_id: &str) -> Option<&'a Profile> {
    settings
        .profiles
        .iter()
        .find(|p| p.id == profile_id)
        .or_else(|| {
            settings
                .profiles
                .iter()
                .find(|p| p.id == settings.default_profile_id)
        })
        .or_else(|| settings.profiles.first())
}

/// Profilde exe yazmamissa turden varsayilani uretir.
///
/// Platforma gore ayri: `.exe` uzantisi ve `cmd`/`wsl` yalnizca Windows'ta
/// anlamli, mac'te mutlak yol vermek gerekiyor cunku bir profil PATH'i
/// degistirmis bir ortamda da acilabiliyor.
#[cfg(windows)]
pub fn profile_executable(profile: &Profile) -> String {
    if !profile.shell.trim().is_empty() {
        return profile.shell.clone();
    }
    match profile.kind {
        ShellKind::PowerShell => "powershell.exe".into(),
        ShellKind::Pwsh => "pwsh.exe".into(),
        ShellKind::Cmd => "cmd.exe".into(),
        ShellKind::Bash => "bash.exe".into(),
        ShellKind::Wsl => "wsl.exe".into(),
        ShellKind::Zsh => "zsh.exe".into(),
        ShellKind::Fish => "fish.exe".into(),
        ShellKind::Custom => "cmd.exe".into(),
    }
}

#[cfg(not(windows))]
pub fn profile_executable(profile: &Profile) -> String {
    if !profile.shell.trim().is_empty() {
        return profile.shell.clone();
    }
    match profile.kind {
        ShellKind::Zsh => "/bin/zsh".into(),
        ShellKind::Bash => "/bin/bash".into(),
        ShellKind::Fish => "fish".into(),
        ShellKind::Pwsh => "pwsh".into(),
        // Windows'a ozgu turler mac'te yok. Ice alinan (import) bir
        // yapilandirmadan gelebiliyorlar; kullanilabilir tek kabuga dusuyoruz
        // ki profil "acilmiyor" yerine "beklenenden farkli kabuk" olsun.
        ShellKind::PowerShell | ShellKind::Cmd | ShellKind::Wsl | ShellKind::Custom => {
            "/bin/zsh".into()
        }
    }
}

#[cfg(test)]
#[path = "store_tests.rs"]
mod tests;
