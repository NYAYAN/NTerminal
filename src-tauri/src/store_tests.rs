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

/// Atomik yazma var olan dosyanin uzerine tek adimda yaziyor.
///
/// Eski kod hedefi `rename`den once siliyordu ("Windows'ta rename hata
/// verir" diye - yanlis, `MoveFileExW` REPLACE_EXISTING ile cagriliyor).
/// Silme ile tasima arasindaki cokme ayar dosyasini busbutun yok ediyordu.
/// Burada: ustune yazma iki platformda da calisiyor, gecici dosya kalmiyor ve
/// kaynak `rename`den once `remove_file(path)` cagirmiyor.
#[test]
fn atomik_yazma_hedefi_silmeden_ustune_yaziyor() {
    let paths = temp_paths("atomik");
    let dosya = paths.root.join("ayar.json");
    write_atomic(&dosya, "eski").unwrap();
    write_atomic(&dosya, "yeni").unwrap();
    assert_eq!(std::fs::read_to_string(&dosya).unwrap(), "yeni");
    assert!(!dosya.with_extension("json.tmp").exists(), "gecici dosya kaldi");

    let kaynak = include_str!("store.rs");
    let govde = kaynak
        .split("pub fn write_atomic")
        .nth(1)
        .and_then(|s| s.split("\n}\n").next())
        .expect("write_atomic bulunamadi");
    assert!(
        !govde.contains("remove_file(path)"),
        "write_atomic hedefi rename'den once siliyor: cokmede dosya busbutun gider"
    );
    let _ = std::fs::remove_dir_all(&paths.root);
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
    assert!(settings.behavior.color_prompt, "eski dosyada renkli istem acik gelmeli");
    assert_eq!(settings.behavior.prompt_user_color, "", "eski dosyada istem rengi secilmemis gelmeli");
    assert_eq!(settings.behavior.prompt_dir_color, "");
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
    assert!(settings.behavior.color_prompt, "bos behavior'da renkli istem acik gelmeli");
    assert_eq!(settings.behavior.prompt_user_color, "");
    assert_eq!(settings.behavior.prompt_dir_color, "");
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

/// Sinir disi degerler yuklemede duzeltiliyor ve dosyaya geri yaziliyor.
///
/// Arayuz denetimleri sinirli ama elle duzenlenen ya da eski bir surumun
/// yazdigi dosya arayuzden gecmeden xterm'e ve gecmis sinirina ulasiyordu:
/// xterm 1'in altindaki satir yuksekliginde hata firlatiyor, 0'lik tampon
/// ciktiyi siliyor, 1'lik gecmis siniri gecmisi kayit aninda kirpiyor.
/// Sinirlar `src/lib/settingsLimits.ts` ile AYNI (arayuz testi karsilastiriyor).
#[test]
fn sinir_disi_ayarlar_yuklemede_duzeltiliyor() {
    let paths = temp_paths("sinir");
    let json = r#"{
        "version": 2,
        "appearance": {
            "fontSize": 100, "fontZoom": 50, "lineHeight": 0.5, "letterSpacing": 0.5,
            "uiFontSize": 3, "scrollback": 0, "cursorStyle": "kutu"
        },
        "behavior": { "historyLimit": 1, "scrollbackSaveLines": 999999 }
    }"#;
    std::fs::write(paths.settings_file(), json).unwrap();

    let s = load_settings(&paths);
    assert_eq!(s.appearance.font_size, 32);
    assert_eq!(s.appearance.font_zoom, 0, "fark boyutu sinirin disina tasiyor");
    assert_eq!(s.appearance.line_height, 1.0);
    assert_eq!(s.appearance.letter_spacing, 1.0);
    assert_eq!(s.appearance.ui_font_size, 11);
    assert_eq!(s.appearance.scrollback, 500);
    assert_eq!(s.appearance.cursor_style, "bar");
    assert_eq!(s.behavior.history_limit, 100);
    assert_eq!(s.behavior.scrollback_save_lines, 20_000);

    // Duzeltilen deger diske de gitti: dosyada eski hali kalmiyor.
    let disk: Settings =
        serde_json::from_str(&std::fs::read_to_string(paths.settings_file()).unwrap()).unwrap();
    assert_eq!(disk.appearance.scrollback, 500);
}

/// Gecerli ayarlara dokunulmuyor; "degisti" isareti yanlis yere yazdirmasin.
#[test]
fn gecerli_ayarlar_temizlemede_degismiyor() {
    let mut s = Settings::default();
    assert!(!s.sanitize(), "varsayilanlar sinirlarin disinda");
    let mut yarim = Settings::default();
    yarim.appearance.line_height = 1.55;
    yarim.appearance.letter_spacing = -1.0;
    assert!(!yarim.sanitize(), "gecerli ondalik kayan nokta yuzunden degisti sayildi");
}

/// Eski mac varsayilan yazi tipi yenisine tasiniyor.
///
/// OLCULEN: "SF Mono, Menlo, ..." yigininda WebKit SF Mono'yu adiyla vermiyor
/// ve hucre Menlo'nunkiyle ayni cikiyordu; ayarlar penceresinde de "Ozel..."
/// olarak gorunuyordu (menude yoktu).
#[test]
fn eski_mac_yazi_tipi_varsayilani_tasiniyor() {
    let mut s = Settings::default();
    s.appearance.font_family = "SF Mono, Menlo, Monaco, Courier New, monospace".into();
    assert!(s.sanitize());
    assert_eq!(s.appearance.font_family, crate::model::default_font_family());

    // Kullanicinin sectigi bir yigina dokunulmuyor.
    let mut secilmis = Settings::default();
    secilmis.appearance.font_family = "Monaco, Menlo, Consolas, monospace".into();
    assert!(!secilmis.sanitize());
}

/// Yakinlastirma alani eski dosyada yok: 0 olarak okunuyor.
#[test]
fn yakinlastirma_alani_eski_dosyada_sifir() {
    let s: Settings = serde_json::from_str(r#"{ "appearance": { "fontSize": 12 } }"#).unwrap();
    assert_eq!(s.appearance.font_zoom, 0);
    assert_eq!(s.appearance.font_size, 12);
}

/// Kullanicinin sectigi istem renkleri diske yazilip geri okununca KORUNMALI.
///
/// Alanlar `Behavior`a eklenmeden once arayuzden gelen bilinmeyen alanlar
/// yuklemede sessizce dusuyordu: ayar ekranda dururdu ama bir sonraki acilista
/// kaybolurdu. Camel case adlar arayuzle (`promptUserColor`) eslesmeli.
#[test]
fn istem_renkleri_diske_yazilip_okununca_korunuyor() {
    let mut settings = Settings::default();
    settings.behavior.prompt_user_color = "#ff8c00".into();
    settings.behavior.prompt_dir_color = "#00aaff".into();

    let json = serde_json::to_string(&settings).expect("serilestirilemedi");
    assert!(json.contains("\"promptUserColor\":\"#ff8c00\""), "arayuzun bekledigi ad: {json}");
    assert!(json.contains("\"promptDirColor\":\"#00aaff\""), "arayuzun bekledigi ad: {json}");

    let geri: Settings = serde_json::from_str(&json).expect("okunamadi");
    assert_eq!(geri.behavior.prompt_user_color, "#ff8c00");
    assert_eq!(geri.behavior.prompt_dir_color, "#00aaff");
}
