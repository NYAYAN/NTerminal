//! Ayar dosyasi goc (migration) testleri.

use super::*;
use crate::model::Settings;
use std::sync::atomic::{AtomicU32, Ordering};

static COUNTER: AtomicU32 = AtomicU32::new(0);

fn temp_paths(name: &str) -> DataPaths {
    let n = COUNTER.fetch_add(1, Ordering::SeqCst);
    let root = std::env::temp_dir().join(format!("nterminal-store-{name}-{}-{n}", std::process::id()));
    let _ = std::fs::remove_dir_all(&root);
    let paths = DataPaths { root, portable: true };
    paths.ensure().unwrap();
    paths
}

/// Yeni bir alan eklendiginde eski settings.json okunmaya devam etmeli.
///
/// Bu testin sebebi gercek bir hata: `panelWidth` alani eklendiginde
/// `Appearance` alan bazinda varsayilan tasimadigi icin eski dosya
/// ayristirilamiyor, load_settings dosyayi bozuk sayip tum ayarlari
/// varsayilanlara donduruyordu.
#[test]
fn eski_ayar_dosyasi_eksik_alanlarla_okunabilir() {
    let paths = temp_paths("migrate");

    // Icinde panelWidth ve historyDedupe olmayan, eski surumden kalma bir dosya.
    let old = r#"{
      "version": 1,
      "appearance": {
        "fontFamily": "Consolas",
        "fontSize": 17,
        "lineHeight": 1.4,
        "letterSpacing": 0.5,
        "theme": "solarized-light",
        "cursorStyle": "block",
        "cursorBlink": false,
        "scrollback": 4321,
        "sidebarWidth": 275
      },
      "behavior": {
        "restoreSession": false,
        "restoreScrollback": false,
        "scrollbackSaveLines": 111,
        "confirmCloseRunning": false,
        "copyOnSelect": false,
        "pasteOnRightClick": false,
        "inheritCwd": false,
        "historyLimit": 1234
      },
      "profiles": [],
      "defaultProfileId": "",
      "keybindings": { "newTab": "Ctrl+Y" }
    }"#;
    std::fs::write(paths.settings_file(), old).unwrap();

    let settings = load_settings(&paths);

    // Kullanicinin degerleri korunmus olmali.
    assert_eq!(settings.appearance.font_size, 17, "kullanici ayarlari kaybedilmis");
    assert_eq!(settings.appearance.theme, "solarized-light");
    assert_eq!(settings.appearance.sidebar_width, 275);
    assert_eq!(settings.behavior.history_limit, 1234);
    assert!(!settings.behavior.restore_session);
    assert_eq!(settings.keybindings.get("newTab").map(String::as_str), Some("Ctrl+Y"));

    // Yeni alanlar varsayilanla dolmus olmali.
    assert_eq!(settings.appearance.panel_width, 390);
    assert_eq!(settings.appearance.view_mode, "tabs");
    assert!(!settings.behavior.history_dedupe);

    // Kaldirilan alan (pasteOnRightClick) yoksayilmali; yerine gelen alanlar
    // varsayilanini almali. Sag tik artik menu aciyor.
    assert_eq!(settings.behavior.right_click_action, "menu");
    assert!(settings.behavior.ctrl_c_copies_selection);
    assert_eq!(settings.behavior.confirm_close_tab, "always");
    assert_eq!(settings.behavior.shell_prediction, "list");

    // Eksik kisayollar da tamamlanmali.
    assert!(settings.keybindings.contains_key("favorites"));

    // Bozuk dosya yedegi olusmamis olmali: dosya bozuk degildi.
    assert!(
        !paths.settings_file().with_extension("json.bozuk").exists(),
        "gecerli dosya bozuk sayilmis"
    );

    // Tamamlanan degerler diske de yazilmis olmali: dosya kalici olarak eski
    // kalmamali, yoksa kullanici dosyaya bakip yeni ayarlari goremez.
    let on_disk = std::fs::read_to_string(paths.settings_file()).unwrap();
    assert!(on_disk.contains("panelWidth"), "yeni alan diske yazilmamis");
    assert!(on_disk.contains("favorites"), "yeni kisayol diske yazilmamis");
    // Ve yeniden okundugunda kullanici degerleri hala yerinde olmali.
    let again = load_settings(&paths);
    assert_eq!(again.appearance.font_size, 17);
    assert_eq!(again.keybindings.get("newTab").map(String::as_str), Some("Ctrl+Y"));
}

/// Gercekten bozuk bir dosya yedeklenip varsayilanlara donulmeli.
#[test]
fn bozuk_ayar_dosyasi_yedeklenir() {
    let paths = temp_paths("corrupt");
    std::fs::write(paths.settings_file(), "{ bu json degil").unwrap();

    let settings = load_settings(&paths);
    assert_eq!(settings.appearance.font_size, Settings::default().appearance.font_size);
    assert!(
        paths.settings_file().with_extension("json.bozuk").exists(),
        "bozuk dosya yedeklenmeli"
    );
}

/// Bos gorunum/davranis nesneleri de kabul edilmeli.
#[test]
fn bos_bolumler_varsayilanla_dolar() {
    let paths = temp_paths("empty-sections");
    std::fs::write(
        paths.settings_file(),
        r#"{ "appearance": {}, "behavior": {} }"#,
    )
    .unwrap();

    let settings = load_settings(&paths);
    assert_eq!(settings.appearance.font_size, 14);
    assert_eq!(settings.appearance.panel_width, 390);
    assert_eq!(settings.appearance.view_mode, "tabs");
    assert!(settings.behavior.restore_session);
    assert_eq!(settings.behavior.right_click_action, "menu");
    assert!(settings.behavior.ctrl_c_copies_selection);
    assert_eq!(settings.behavior.confirm_close_tab, "always");
    assert_eq!(settings.behavior.shell_prediction, "list");
}
