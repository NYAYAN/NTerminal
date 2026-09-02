//! nvm klasor okumasinin saf parcalari: surum siralamasi, bag hedefi,
//! `settings.txt` ve nvm.sh takma ad zinciri.
//!
//! Gercek bir nvm kurulumu makineye bagli (kurulu olmayabilir, tek surum
//! olabilir); saf islevler uzerinden test edilince hem hizli hem her makinede
//! ayni.

use super::*;
use std::collections::HashMap;

fn liste(items: &[&str]) -> Vec<String> {
    items.iter().map(|s| s.to_string()).collect()
}

#[test]
fn surumler_sayisal_ve_yeni_once() {
    // Metin siralamasi `24.9.0`u `24.18.0`un ustune koyar; sayisal olmali.
    let out = sort_versions(liste(&["v24.9.0", "v24.18.0", "v18.20.4", "v24.11.1"]));
    assert_eq!(out, liste(&["24.18.0", "24.11.1", "24.9.0", "18.20.4"]));
}

#[test]
fn surum_olmayan_klasorler_listeye_girmiyor() {
    // nvm-windows kokunde `nvm.exe`, simgeler ve `temp` de duruyor.
    let out = sort_versions(liste(&["temp", "v24.18.0", ".cache", "v24", "nodejs", "v1.2.3.4"]));
    assert_eq!(out, liste(&["24.18.0"]));
}

#[test]
fn bag_hedefinden_surum() {
    assert_eq!(
        version_of_dir(Path::new(r"C:\Users\ben\AppData\Local\nvm\v24.18.0")),
        Some("24.18.0".to_string())
    );
    // Sondaki ayirac yutuluyor.
    assert_eq!(
        version_of_dir(Path::new("/home/ben/.nvm/versions/node/v22.11.0/")),
        Some("22.11.0".to_string())
    );
    // Surum klasoru degil.
    assert_eq!(version_of_dir(Path::new(r"C:\nvm4w\nodejs")), None);
}

#[test]
fn settings_txt_bag_yolu() {
    let text = "root: C:\\Users\\ben\\AppData\\Local\\nvm\r\npath: C:\\nvm4w\\nodejs\r\narch: 64\r\n";
    assert_eq!(settings_symlink(text), Some(r"C:\nvm4w\nodejs".to_string()));
    assert_eq!(settings_symlink("root: C:\\nvm\n"), None);
    assert_eq!(settings_symlink("path:   \n"), None);
}

fn okuyucu(map: &[(&str, &str)]) -> impl Fn(&str) -> Option<String> {
    let map: HashMap<String, String> = map
        .iter()
        .map(|(k, v)| (k.to_string(), format!("{v}\n")))
        .collect();
    move |name: &str| map.get(name).cloned()
}

#[test]
fn takma_ad_zinciri_cozuluyor() {
    // nvm.sh'in gercek zinciri: default → lts/* → lts/jod → v22.11.0
    let kurulu = liste(&["24.18.0", "22.11.0", "20.19.0"]);
    let oku = okuyucu(&[("default", "lts/*"), ("lts/*", "lts/jod"), ("lts/jod", "v22.11.0")]);
    assert_eq!(
        resolve_alias("default", &kurulu, &oku, 0),
        Some("22.11.0".to_string())
    );
}

#[test]
fn yarim_surum_en_yenisine_gidiyor() {
    // `nvm alias default 22` yazan biri 22 dizisinin en yenisini bekliyor.
    let kurulu = liste(&["24.18.0", "22.11.0", "22.3.0", "20.19.0"]);
    let oku = okuyucu(&[("default", "22")]);
    assert_eq!(resolve_alias("default", &kurulu, &oku, 0), Some("22.11.0".to_string()));
    // `2` yazmak `22`yi ya da `20`yi ESLEMEMELI — parca butun olarak karsilastiriliyor.
    let oku2 = okuyucu(&[("default", "2")]);
    assert_eq!(resolve_alias("default", &kurulu, &oku2, 0), None);
}

#[test]
fn node_takma_adi_en_yeni() {
    let kurulu = liste(&["24.18.0", "22.11.0"]);
    let oku = okuyucu(&[("default", "node")]);
    assert_eq!(resolve_alias("default", &kurulu, &oku, 0), Some("24.18.0".to_string()));
}

#[test]
fn kurulu_olmayan_ve_kendine_donen_takma_ad() {
    let kurulu = liste(&["24.18.0"]);
    // Dosya yok.
    assert_eq!(resolve_alias("default", &kurulu, &okuyucu(&[]), 0), None);
    // Kurulu olmayan surum.
    let oku = okuyucu(&[("default", "v18.0.0")]);
    assert_eq!(resolve_alias("default", &kurulu, &oku, 0), None);
    // Kendine isaret eden takma ad: derinlik siniri donguyu kesiyor.
    let dongu = okuyucu(&[("default", "a"), ("a", "b"), ("b", "a")]);
    assert_eq!(resolve_alias("default", &kurulu, &dongu, 0), None);
}
