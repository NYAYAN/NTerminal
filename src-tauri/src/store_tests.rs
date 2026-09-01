//! Ayar dosyasi goc (migration) testleri.

use super::*;
use crate::model::{Behavior, Settings};
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
/// Kapatma davranisi ayari arayuze DOGRU ADLA gidiyor ve geri donuyor.
///
/// Sessiz hata riski serde adlandirmasinda: alan Rust'ta `close_action`,
/// arayuzde `closeAction`. Ad tutmazsa Rust varsayilana dusuyor, kullanicinin
/// "arka planda kal" secimi hicbir sey yapmiyor ve hata gorunmuyor - pencere
/// kapaniyor, uygulama cikiyor, kimse serde'yi suclamiyor.
#[test]
fn kapatma_davranisi_ayari_gidip_geliyor() {
    let varsayilan = Behavior::default();
    assert_eq!(varsayilan.close_action, "background", "varsayilan degisti");

    let json = serde_json::to_string(&varsayilan).unwrap();
    assert!(json.contains("\"closeAction\""), "arayuzun bekledigi ad yok: {json}");

    let mut arka = Behavior::default();
    arka.close_action = "background".into();
    let geri: Behavior = serde_json::from_str(&serde_json::to_string(&arka).unwrap()).unwrap();
    assert_eq!(geri.close_action, "background");

    // Alani hic bilmeyen eski bir dosya varsayilana dusmeli, hata vermemeli.
    let eski: Behavior = serde_json::from_str("{}").unwrap();
    assert_eq!(eski.close_action, "background");
}

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
    assert!(settings.appearance.highlight_links);
    assert!(settings.behavior.history_dedupe);
    assert_eq!(
        settings.version,
        crate::model::SETTINGS_VERSION,
        "tasima kostuysa surum damgasi da guncellenmeli"
    );

    // Kaldirilan alan (pasteOnRightClick) yoksayilmali; yerine gelen alanlar
    // varsayilanini almali. Sag tik artik menu aciyor.
    assert_eq!(settings.behavior.right_click_action, "menu");
    assert!(settings.behavior.ctrl_c_copies_selection);
    assert_eq!(settings.behavior.confirm_close_tab, "always");
    assert_eq!(settings.behavior.shell_prediction, "inline");
    assert!(settings.behavior.prompt_at_bottom);
    assert!(settings.behavior.app_input);
    assert!(settings.behavior.command_blocks);
    assert!(settings.behavior.block_headers);
    assert!(settings.behavior.app_suggestions);

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
/// Duzen kaybi geri getirilebilir olmali.
///
/// YASANMIS KAYIP: bes gruplu, dokuz sekmeli bir duzenin uzerine tek gruplu
/// bos bir duzen yazildi. Geri donus yolu yoktu; duzen komut gecmisinden elle
/// yeniden kuruldu ve grup adlari orada olmadigi icin tam kurtarilamadi.
#[test]
fn tekrarlari_gizle_tasimasi_bir_kez_kosuyor() {
    // Kullanici tasimadan SONRA kapatabilmeli; her acilista karari geri almak
    // ayari kullanilamaz yapardi. Surum damgasi bunu bagliyor.
    let paths = temp_paths("dedupe-once");
    let dosya = format!(
        r#"{{ "version": {}, "behavior": {{ "historyDedupe": false }} }}"#,
        crate::model::SETTINGS_VERSION
    );
    std::fs::write(paths.settings_file(), dosya).unwrap();

    let settings = load_settings(&paths);
    assert!(
        !settings.behavior.history_dedupe,
        "guncel surumde kullanicinin kapatmasi korunmali"
    );
    let _ = std::fs::remove_dir_all(&paths.root);
}

#[test]
fn duzen_sicramali_kucullurse_onceki_hal_saklaniyor() {
    let paths = temp_paths("shrink");
    let settings = Settings::default();

    // Dolu bir duzen: iki grup, dort sekme.
    let mut dolu = load_workspace(&paths, &settings);
    let sablon = dolu.groups[0].clone();
    dolu.groups[0].tabs = vec![
        dolu.groups[0].tabs[0].clone(),
        dolu.groups[0].tabs[0].clone(),
    ];
    let mut ikinci = sablon.clone();
    ikinci.id = "grp-ikinci".into();
    dolu.groups.push(ikinci);
    save_workspace(&paths, &dolu).unwrap();
    // Sabit sayi yazmiyoruz: kurulum degisirse test sessizce yanlis seyi
    // olcmesin.
    let dolu_sekme: usize = dolu.groups.iter().map(|g| g.tabs.len()).sum();
    assert!(dolu_sekme >= 3, "kurulum yeterince dolu degil: {dolu_sekme}");

    let onceki = paths.workspace_file().with_extension("json.onceki");
    assert!(!onceki.exists(), "buyume yedek uretmemeli");

    // Uzerine neredeyse bos bir duzen yaziliyor - kaybin imzasi.
    let mut bos = dolu.clone();
    bos.groups.truncate(1);
    bos.groups[0].tabs.truncate(1);
    save_workspace(&paths, &bos).unwrap();

    assert!(onceki.is_file(), "kayip oncesi hal saklanmadi");
    let kurtarilan: Workspace =
        serde_json::from_str(&std::fs::read_to_string(&onceki).unwrap()).unwrap();
    let sekme: usize = kurtarilan.groups.iter().map(|g| g.tabs.len()).sum();
    assert_eq!(sekme, dolu_sekme, "yedek eksik duzeni saklamis");

    let _ = std::fs::remove_dir_all(&paths.root);
}

/// Siradan duzenleme yedek uretmemeli: her seferinde yedeklersek yedek de
/// kisa surede ayni kayba ugrar.
#[test]
fn tek_sekme_kapatmak_yedek_uretmiyor() {
    let paths = temp_paths("shrink-small");
    let settings = Settings::default();

    let mut ws = load_workspace(&paths, &settings);
    let tab = ws.groups[0].tabs[0].clone();
    ws.groups[0].tabs = vec![tab.clone(), tab.clone(), tab.clone(), tab];
    save_workspace(&paths, &ws).unwrap();

    ws.groups[0].tabs.truncate(3);
    save_workspace(&paths, &ws).unwrap();

    let onceki = paths.workspace_file().with_extension("json.onceki");
    assert!(!onceki.exists(), "siradan kapatma yedek uretti");

    let _ = std::fs::remove_dir_all(&paths.root);
}

/// Okunamayan duzen dosyasi SILINMEMELI, yedeklenmeli.
///
/// Eskiden yalnizca stderr'e yaziliyordu ve bos duzen ilk kayitta gercek
/// dosyanin uzerine geciyordu - tek bir okuma sorunu kalici kayip demekti.
#[test]
fn bozuk_duzen_dosyasi_yedekleniyor() {
    let paths = temp_paths("ws-bozuk");
    std::fs::create_dir_all(&paths.root).unwrap();
    std::fs::write(paths.workspace_file(), "{ bu json degil").unwrap();

    let ws = load_workspace(&paths, &Settings::default());
    assert!(!ws.groups.is_empty(), "bos duzen donmeli ama grup uretilmeli");

    let yedek = paths.workspace_file().with_extension("json.bozuk");
    assert!(yedek.is_file(), "bozuk dosya yedeklenmedi");
    assert!(
        std::fs::read_to_string(&yedek).unwrap().contains("bu json degil"),
        "yedek icerigi bozuk dosya degil"
    );

    let _ = std::fs::remove_dir_all(&paths.root);
}

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
    assert!(settings.appearance.highlight_links);
    assert!(settings.behavior.restore_session);
    assert_eq!(settings.behavior.right_click_action, "menu");
    assert!(settings.behavior.ctrl_c_copies_selection);
    assert_eq!(settings.behavior.confirm_close_tab, "always");
    assert_eq!(settings.behavior.shell_prediction, "inline");
    assert!(settings.behavior.prompt_at_bottom);
    assert!(settings.behavior.app_input);
    assert!(settings.behavior.command_blocks);
    assert!(settings.behavior.block_headers);
    assert!(settings.behavior.app_suggestions);
}

/// Diskte duran YINELENEN sekme kimlikleri yuklemede onarilmali.
///
/// Birlestirmeli ice alma bir surum boyunca ayni kimligi iki kez ekledi
/// (`transfer::merge_workspace`, orada duzeltildi). Kaynagi kapatmak DISKTE
/// ZATEN DURAN dosyayi duzeltmiyor: arayuz sekmeyi kimlikle ariyor ve arama
/// ilk eslesmede duruyor, yani ikinci kopya erisilemez kaliyor.
#[test]
fn yinelenen_sekme_kimlikleri_yuklemede_onariliyor() {
    let paths = temp_paths("dupe");

    let ws = serde_json::json!({
        "version": 1,
        "activeGroupId": "g1",
        "savedAt": 0,
        "groups": [
            {
                "id": "g1", "name": "GurselAPP", "color": null, "icon": null,
                "collapsed": false, "favorite": false, "defaultProfileId": null,
                "defaultCwd": null, "env": {}, "activeTabId": "t1",
                "tabs": [{
                    "id": "t1", "title": "", "customTitle": null, "profileId": "p",
                    "cwd": null, "createdAt": 0, "lastActiveAt": 0,
                    "hasScrollback": false, "lastCommand": null, "locked": false
                }]
            },
            {
                "id": "g2", "name": "GurselAPP (gelen)", "color": null, "icon": null,
                "collapsed": false, "favorite": false, "defaultProfileId": null,
                "defaultCwd": null, "env": {}, "activeTabId": "t1",
                "tabs": [{
                    "id": "t1", "title": "", "customTitle": null, "profileId": "p",
                    "cwd": null, "createdAt": 0, "lastActiveAt": 0,
                    "hasScrollback": false, "lastCommand": null, "locked": false
                }]
            }
        ]
    });
    std::fs::write(paths.workspace_file(), serde_json::to_string(&ws).unwrap()).unwrap();

    let mut settings = Settings::default();
    settings.behavior.restore_session = true;
    let loaded = load_workspace(&paths, &settings);

    let kimlikler: Vec<String> = loaded
        .groups
        .iter()
        .flat_map(|g| g.tabs.iter().map(|t| t.id.clone()))
        .collect();
    let mut tekil = kimlikler.clone();
    tekil.sort();
    tekil.dedup();
    assert_eq!(
        kimlikler.len(),
        tekil.len(),
        "yinelenen kimlik onarilmadi: {kimlikler:?}"
    );
    // Ilk gorulen korunuyor; ikincisi yenileniyor.
    assert_eq!(loaded.groups[0].tabs[0].id, "t1");
    assert_ne!(loaded.groups[1].tabs[0].id, "t1");
    // Etkin isaret de yeni kimlige tasinmis olmali.
    assert_eq!(
        loaded.groups[1].active_tab_id.as_deref(),
        Some(loaded.groups[1].tabs[0].id.as_str())
    );

}
