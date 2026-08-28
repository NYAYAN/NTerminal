//! Disa/ice aktarim testleri.
//!
//! Buradaki asil risk yol tasinabilirligi: bir makinede uretilen dosya baska
//! makinede acildiginda `C:\Users\ali\...` yollari o makinenin kullanicisina
//! cevrilmeli. Ters yonde de kayipsiz olmali (roundtrip).

use super::*;
use crate::model::{Group, Profile, ShellKind, TabState};
use std::collections::BTreeMap;

fn tokens_fixture() -> Vec<(&'static str, String)> {
    // Gercek ortamdan bagimsiz, deterministik bir belirtec kumesi.
    let mut tokens = vec![
        ("${LOCALAPPDATA}", "C:\\Users\\ali\\AppData\\Local".to_string()),
        ("${HOME}", "C:\\Users\\ali".to_string()),
        ("${PROGRAMFILES}", "C:\\Program Files".to_string()),
    ];
    tokens.sort_by_key(|(_, v)| std::cmp::Reverse(v.len()));
    tokens
}

#[test]
fn uzun_yol_kisa_yoldan_once_eslesir() {
    let tokens = tokens_fixture();
    // LOCALAPPDATA, HOME'un altinda; yanlislikla ${HOME}\AppData\Local yazmamali.
    assert_eq!(
        tokenize("C:\\Users\\ali\\AppData\\Local\\Programs\\Git\\bin\\bash.exe", &tokens),
        "${LOCALAPPDATA}\\Programs\\Git\\bin\\bash.exe"
    );
    assert_eq!(
        tokenize("C:\\Users\\ali\\Desktop\\proje", &tokens),
        "${HOME}\\Desktop\\proje"
    );
}

#[test]
fn buyuk_kucuk_harf_farki_engellemez() {
    let tokens = tokens_fixture();
    // Windows yollari harf duyarsiz; kabuklar da farkli yaziyor.
    assert_eq!(
        tokenize("c:\\users\\ALI\\Desktop", &tokens),
        "${HOME}\\Desktop"
    );
}

#[test]
fn eslesmeyen_yol_oldugu_gibi_kalir() {
    let tokens = tokens_fixture();
    assert_eq!(tokenize("D:\\depo\\kod", &tokens), "D:\\depo\\kod");
    assert_eq!(tokenize("", &tokens), "");
}

#[test]
fn belirtec_karsi_makinede_acilir() {
    let mut hedef = vec![("${HOME}", "C:\\Users\\veli".to_string())];
    hedef.sort_by_key(|(_, v)| std::cmp::Reverse(v.len()));
    assert_eq!(
        expand("${HOME}\\Desktop\\proje", &hedef),
        "C:\\Users\\veli\\Desktop\\proje"
    );
}

#[test]
fn tokenize_expand_gidis_donus_kayipsiz() {
    let tokens = tokens_fixture();
    for original in [
        "C:\\Users\\ali\\Desktop\\proje",
        "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
        "D:\\baska\\yol",
    ] {
        let round = expand(&tokenize(original, &tokens), &tokens);
        assert_eq!(round, original, "gidis-donus bozuldu: {original}");
    }
}

fn profile(name: &str, shell: &str) -> Profile {
    Profile {
        id: format!("prof-{name}"),
        name: name.into(),
        kind: ShellKind::Pwsh,
        shell: shell.into(),
        args: vec![],
        cwd: None,
        env: BTreeMap::new(),
        shell_integration: true,
        color: None,
        icon: None,
        unavailable: false,
    }
}

#[test]
fn ayar_birlestirme_yerel_profilleri_korur() {
    let mut local = Settings::default();
    local.profiles = vec![profile("Yerel Kabuk", "C:\\yerel.exe"), profile("Ortak", "C:\\a.exe")];
    local.appearance.font_size = 20;

    let mut incoming = Settings::default();
    incoming.profiles = vec![profile("Ortak", "C:\\b.exe"), profile("Gelen Kabuk", "C:\\gelen.exe")];
    incoming.appearance.font_size = 12;
    incoming.default_profile_id = incoming.profiles[0].id.clone();

    let merged = merge_settings(&local, &incoming);

    // Gelen tercihler kazanir.
    assert_eq!(merged.appearance.font_size, 12);
    // Gelende olmayan yerel profil korunur.
    assert!(merged.profiles.iter().any(|p| p.name == "Yerel Kabuk"));
    // Ad cakismasinda gelen kazanir (tek kayit kalir).
    let ortak: Vec<&Profile> = merged.profiles.iter().filter(|p| p.name == "Ortak").collect();
    assert_eq!(ortak.len(), 1);
    assert_eq!(ortak[0].shell, "C:\\b.exe");
    assert!(merged.profiles.iter().any(|p| p.name == "Gelen Kabuk"));
}

#[test]
fn ayar_birlestirme_gecersiz_varsayilani_duzeltir() {
    let local = Settings::default();
    let mut incoming = Settings::default();
    incoming.profiles = vec![profile("A", "C:\\a.exe")];
    // Var olmayan bir profile isaret ediyor.
    incoming.default_profile_id = "yok".into();

    let merged = merge_settings(&local, &incoming);
    assert!(
        merged.profiles.iter().any(|p| p.id == merged.default_profile_id),
        "varsayilan profil listede olmali"
    );
}

fn group(id: &str, name: &str) -> Group {
    Group {
        id: id.into(),
        name: name.into(),
        color: None,
        icon: None,
        collapsed: false,
        favorite: false,
        default_profile_id: None,
        default_cwd: None,
        env: BTreeMap::new(),
        active_tab_id: None,
        tabs: vec![TabState {
            id: format!("{id}-tab"),
            title: String::new(),
            custom_title: None,
            profile_id: "p".into(),
            cwd: None,
            created_at: 0,
            last_active_at: 0,
            has_scrollback: false,
            last_command: None,
            locked: false,
        }],
    }
}

#[test]
fn calisma_alani_birlestirme_mevcut_duzeni_bozmaz() {
    let mut local = Workspace::default();
    local.groups = vec![group("g1", "Proje A"), group("g2", "Proje B")];

    let mut incoming = Workspace::default();
    incoming.groups = vec![group("g9", "Proje C"), group("g1", "Proje A")];

    let (merged, added) = merge_workspace(&local, &incoming);

    assert_eq!(added, 2);
    assert_eq!(merged.groups.len(), 4);
    // Yerel gruplar oldugu gibi basta durmali.
    assert_eq!(merged.groups[0].name, "Proje A");
    assert_eq!(merged.groups[1].name, "Proje B");
    // Ad cakismasi isaretlenmis olmali.
    assert!(merged.groups.iter().any(|g| g.name == "Proje A (gelen)"));
    // Kimlik cakismasi cozulmus olmali: ayni id iki kez gecmemeli.
    let mut ids: Vec<&String> = merged.groups.iter().map(|g| &g.id).collect();
    ids.sort();
    let before = ids.len();
    ids.dedup();
    assert_eq!(ids.len(), before, "grup kimlikleri tekil olmali");
}

#[test]
fn paket_turu_dogrulanir() {
    let dir = std::env::temp_dir().join(format!("nterminal-bundle-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();

    // Yanlis tur
    let wrong = dir.join("yanlis.json");
    std::fs::write(&wrong, r#"{"kind":"baska-uygulama","version":1}"#).unwrap();
    assert!(read_bundle(&wrong).is_err(), "yabanci dosya kabul edilmemeli");

    // Cok yeni surum
    let future = dir.join("gelecek.json");
    std::fs::write(
        &future,
        format!(r#"{{"kind":"{BUNDLE_KIND}","version":{}}}"#, BUNDLE_VERSION + 1),
    )
    .unwrap();
    let err = read_bundle(&future).unwrap_err().to_string();
    assert!(err.contains("guncelleyin"), "surum uyarisi bekleniyordu: {err}");

    // Gecerli, en yalin hali
    let ok = dir.join("gecerli.json");
    std::fs::write(
        &ok,
        format!(r#"{{"kind":"{BUNDLE_KIND}","version":{BUNDLE_VERSION}}}"#),
    )
    .unwrap();
    let bundle = read_bundle(&ok).unwrap();
    assert!(bundle.settings.is_none());
    assert!(bundle.workspace.is_none());

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn normalize_var_olmayan_klasoru_temizler() {
    let mut bundle = Bundle {
        kind: BUNDLE_KIND.into(),
        version: BUNDLE_VERSION,
        exported_at: 0,
        app_version: "0.1.0".into(),
        machine: "PC1".into(),
        portable_paths: false,
        settings: None,
        workspace: Some({
            let mut ws = Workspace::default();
            let mut g = group("g1", "Proje");
            g.default_cwd = Some("Z:\\kesinlikle\\olmayan\\klasor".into());
            g.tabs[0].cwd = Some("Z:\\kesinlikle\\olmayan\\klasor".into());
            g.tabs[0].has_scrollback = true;
            ws.groups = vec![g];
            ws
        }),
        history: None,
        favorites: None,
        scrollback: None,
    };

    let notes = normalize_for_this_machine(&mut bundle);
    let ws = bundle.workspace.unwrap();
    assert!(ws.groups[0].default_cwd.is_none(), "olmayan klasor temizlenmeli");
    assert!(
        !ws.groups[0].tabs[0].has_scrollback,
        "gelen dosyada ekran ciktisi yoksa isaret kapatilmali"
    );
    assert!(
        notes.iter().any(|n| n.level == "warn"),
        "kullaniciya uyari verilmeli"
    );
}

/// Dosyaya yaz -> baska makine gibi oku -> uygula zincirinin tamami.
///
/// Kullanicinin bu ozellikten bekledigi tek sey bu: bir makinede alinan dosya
/// otekinde ayni yapilandirmayi kursun. Parcalarin ayri ayri dogru olmasi
/// yetmiyor, zincirin butunu test edilmeli.
#[test]
fn disa_aktar_ice_al_zinciri() {
    let dir = std::env::temp_dir().join(format!("nterminal-rt-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    let paths = crate::paths::DataPaths { root: dir.clone(), portable: true };
    paths.ensure().unwrap();
    let history = crate::history::HistoryStore::load(paths.clone(), 1000);
    let favorites = crate::favorites::FavoriteStore::load(paths.clone());
    favorites
        .add(crate::favorites::NewFavorite {
            command: "npm run deploy".into(),
            label: Some("Yayina al".into()),
            note: None,
            group_id: None,
            cwd: dirs::home_dir().map(|p| p.to_string_lossy().to_string()),
        })
        .unwrap();
    history
        .add(crate::history::NewHistoryEntry {
            command: "cargo build".into(),
            tab_id: "t1".into(),
            group_id: "g1".into(),
            profile_id: "prof-A".into(),
            cwd: dirs::home_dir().map(|p| p.join("proje").to_string_lossy().to_string()),
            source: None,
        })
        .unwrap();

    // Kaynak makinenin yapilandirmasi: ev dizini altinda bir klasor kullaniyor.
    let home = dirs::home_dir().unwrap();
    let mut settings = Settings::default();
    let mut p = profile("A", "C:\\kesinlikle\\olmayan\\kabuk.exe");
    p.cwd = Some(home.to_string_lossy().to_string());
    settings.profiles = vec![p];
    settings.default_profile_id = settings.profiles[0].id.clone();
    settings.appearance.font_size = 17;

    let mut workspace = Workspace::default();
    let mut g = group("g1", "Proje");
    g.default_cwd = Some(home.to_string_lossy().to_string());
    g.tabs[0].cwd = Some(home.to_string_lossy().to_string());
    workspace.groups = vec![g];

    // --- disa aktar
    let options = ExportOptions {
        include_settings: true,
        include_workspace: true,
        include_history: true,
        include_favorites: true,
        include_scrollback: false,
        portable_paths: true,
    };
    let bundle = build_bundle(&paths, &settings, &workspace, &history, &favorites, &options);

    // Tasinabilir yollar: ev dizini belirtece cevrilmis olmali.
    let as_json = serde_json::to_string(&bundle).unwrap();
    assert!(
        as_json.contains("${HOME}"),
        "yollar belirtece cevrilmemis: {as_json}"
    );
    // JSON metninde ters egik cizgiler kacisli duruyor; mutlak yolun
    // kalmadigini dogrulamak icin ayni bicime cevirip ariyoruz.
    let home_escaped = home.to_string_lossy().replace('\\', "\\\\");
    assert!(
        !as_json.contains(&home_escaped),
        "mutlak ev dizini dosyada kalmis: {home_escaped}"
    );

    let file = dir.join("aktarim.nterminal.json");
    let summary = export_to_file(&bundle, &file).unwrap();
    assert_eq!(summary.profiles, 1);
    assert_eq!(summary.groups, 1);
    assert_eq!(summary.history, 1);
    assert_eq!(summary.favorites, 1);
    assert!(summary.bytes > 0);

    // --- karsi makine gibi oku
    let mut incoming = read_bundle(&file).unwrap();
    let notes = normalize_for_this_machine(&mut incoming);

    let in_settings = incoming.settings.clone().unwrap();
    // Belirtec bu makinenin gercek yoluna acilmis olmali.
    assert_eq!(
        in_settings.profiles[0].cwd.as_deref(),
        Some(home.to_string_lossy().to_string().as_str())
    );
    // Kabuk bu makinede yok: ya duzeltilmis ya devre disi birakilmis olmali,
    // her iki durumda da kullaniciya rapor edilmis olmali.
    assert!(
        notes.iter().any(|n| n.subject == "A"),
        "eksik kabuk raporlanmamis: {notes:?}"
    );
    let fixed_or_disabled =
        in_settings.profiles[0].unavailable || in_settings.profiles[0].shell != "C:\\kesinlikle\\olmayan\\kabuk.exe";
    assert!(fixed_or_disabled, "eksik kabuk sessizce gecilmis");

    // Tercihler tasinmis olmali.
    assert_eq!(in_settings.appearance.font_size, 17);

    let in_workspace = incoming.workspace.clone().unwrap();
    assert_eq!(in_workspace.groups.len(), 1);
    assert_eq!(in_workspace.groups[0].name, "Proje");
    assert_eq!(
        in_workspace.groups[0].tabs[0].cwd.as_deref(),
        Some(home.to_string_lossy().to_string().as_str())
    );

    // --- karsi makinede uygula (birlestirme kipi)
    let local_settings = Settings::default();
    let merged_settings = merge_settings(&local_settings, &in_settings);
    assert_eq!(merged_settings.appearance.font_size, 17);
    assert!(merged_settings.profiles.iter().any(|p| p.name == "A"));

    let mut local_ws = Workspace::default();
    local_ws.groups = vec![group("yerel", "Yerel Grup")];
    let (merged_ws, added) = merge_workspace(&local_ws, &in_workspace);
    assert_eq!(added, 1);
    assert_eq!(merged_ws.groups.len(), 2);
    assert_eq!(merged_ws.groups[0].name, "Yerel Grup", "yerel duzen basta kalmali");

    // --- gecmis de tasinmis olmali
    let in_history = incoming.history.clone().unwrap();
    assert_eq!(in_history.len(), 1);
    assert_eq!(in_history[0].command, "cargo build");
    assert_eq!(
        in_history[0].cwd.as_deref(),
        Some(home.join("proje").to_string_lossy().to_string().as_str()),
        "gecmis kaydinin dizini de acilmali"
    );

    // --- favoriler de tasinmis, yollari acilmis olmali
    let in_favorites = incoming.favorites.clone().unwrap();
    assert_eq!(in_favorites.len(), 1);
    assert_eq!(in_favorites[0].label.as_deref(), Some("Yayina al"));
    assert_eq!(
        in_favorites[0].command, "npm run deploy",
        "favori komutu bozulmamali"
    );
    assert_eq!(
        in_favorites[0].cwd.as_deref(),
        Some(home.to_string_lossy().to_string().as_str()),
        "favorinin klasoru de belirtecden acilmali"
    );

    let _ = std::fs::remove_dir_all(&dir);
}
