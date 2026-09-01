use super::*;

/*
 * Surum karsilastirmasi.
 *
 * Yanlis calismasi iki yonde de kotu: yeni surumu kacirmak sessiz bir kayip,
 * her acilista "yeni surum var" demek ise kullaniciyi yormanin en hizli yolu.
 * Ikisi de ancak gercek bir yayin cikinca fark edilirdi, o yuzden burada.
 */

#[test]
fn buyuk_surum_yeni() {
    assert!(is_newer("0.1.0", "0.2.0"));
    assert!(is_newer("0.9.9", "1.0.0"));
    assert!(is_newer("1.2.3", "1.2.4"));
}

#[test]
fn ayni_surum_yeni_degil() {
    assert!(!is_newer("0.1.0", "0.1.0"));
    // Etiket oneki karsilastirmayi etkilemiyor: depolar `v` ile de etiketliyor.
    assert!(!is_newer("0.1.0", "v0.1.0"));
    assert!(is_newer("v0.1.0", "0.2.0"));
}

#[test]
fn eski_surum_yeni_degil() {
    assert!(!is_newer("1.0.0", "0.9.9"));
    assert!(!is_newer("0.2.0", "0.1.9"));
}

#[test]
fn eksik_parca_sifir_sayiliyor() {
    // `0.2` ile `0.2.0` ayni surum; biri "yeni" sayilirsa her acilista
    // bildirim cikardi.
    assert!(!is_newer("0.2", "0.2.0"));
    assert!(!is_newer("0.2.0", "0.2"));
    assert!(is_newer("0.2", "0.2.1"));
}

#[test]
fn on_yayin_kararlidan_eski() {
    // Semver kurali: `0.2.0-beta` < `0.2.0`.
    assert!(is_newer("0.2.0-beta", "0.2.0"));
    assert!(!is_newer("0.2.0", "0.2.0-beta"));
    // Sayilar farkliysa ek onemsiz.
    assert!(is_newer("0.1.0", "0.2.0-beta"));
}

#[test]
fn yapi_eki_yok_sayiliyor() {
    assert!(!is_newer("0.2.0", "0.2.0+20260102"));
}

#[test]
fn bozuk_surum_cokmuyor() {
    // Beklenmedik bir etiket bildirim uretmemeli ama uygulamayi da
    // dusurmemeli.
    assert!(!is_newer("0.1.0", ""));
    assert!(!is_newer("0.1.0", "surum-yok"));
    assert!(!is_newer("", ""));
}

// ------------------------------------------------------------- yanit ayristirma

const YANIT: &str = r#"{
  "tag_name": "v0.2.0",
  "html_url": "https://github.com/NYAYAN/NTerminal/releases/tag/v0.2.0",
  "body": "  Yeni: gruplanmamis sekmeler.  ",
  "draft": false,
  "prerelease": false
}"#;

#[test]
fn yayin_okunuyor() {
    let r = parse_release(YANIT).expect("ayristirilamadi");
    assert_eq!(r.version, "0.2.0");
    assert_eq!(r.url, "https://github.com/NYAYAN/NTerminal/releases/tag/v0.2.0");
    assert_eq!(r.notes, "Yeni: gruplanmamis sekmeler.");
}

#[test]
fn taslak_ve_on_yayin_atlaniyor() {
    // "En son surum" derken kastedilen sey yayimlanmis olan.
    let taslak = YANIT.replace("\"draft\": false", "\"draft\": true");
    assert_eq!(parse_release(&taslak), None);
    let on = YANIT.replace("\"prerelease\": false", "\"prerelease\": true");
    assert_eq!(parse_release(&on), None);
}

#[test]
fn etiketsiz_yanit_atlaniyor() {
    assert_eq!(parse_release(r#"{"html_url": "x"}"#), None);
    assert_eq!(parse_release(r#"{"tag_name": "  "}"#), None);
}

#[test]
fn bozuk_json_cokmuyor() {
    // Hiz siniri asilinca GitHub JSON degil bir hata govdesi doniyor.
    assert_eq!(parse_release("<html>rate limited</html>"), None);
    assert_eq!(parse_release(""), None);
}

#[test]
fn not_alani_eksikse_bos() {
    let r = parse_release(r#"{"tag_name": "1.0.0", "html_url": "u"}"#).expect("ayristirilamadi");
    assert_eq!(r.notes, "");
}
