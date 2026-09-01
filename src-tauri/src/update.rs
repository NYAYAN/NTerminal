//! Yeni surum denetimi.
//!
//! ## Ne yapiyor, ne YAPMIYOR
//!
//! Yalnizca haber veriyor: GitHub'daki son yayini okuyup surumu karsilastiriyor.
//! Indirme ve kurma kullanicinin isi — indirme sayfasi tarayicida aciliyor.
//!
//! Kendi kendine guncelleyen bir uygulama (Tauri updater) bunun yerine
//! gecebilirdi ama uc sey gerektiriyor: bir imza anahtar cifti, imzali paketler
//! ureten bir CI ve yayinlanan bir `latest.json`. Ucu de kurulmadan updater
//! calismaz; bildirim ise bugun calisiyor ve hicbir kuruluma bagli degil.
//!
//! ## Neden `curl`, neden bir HTTP kutuphanesi degil
//!
//! Sebep KURUMSAL AGLAR. `ureq`/`reqwest` + rustls kendi kok sertifika listesini
//! tasiyor ve sistemin guven deposunu YOK SAYIYOR; araya giren bir kurumsal
//! TLS proxy'si oldugunda istek dogrulanamiyor ve denetim hep basarisiz
//! doniyor. Vekil sunucu ayarlarini da ayrica beslemek gerekiyor.
//!
//! `curl` ikisini de isletim sisteminden aliyor: Windows'ta Schannel ve sistem
//! sertifika deposu, macOS'ta sistem anahtarligi; `HTTP(S)_PROXY` degiskenleri
//! de kendiliginden geciyor. Ustelik yeni bir bagimlilik yok — bir GET istegi
//! icin on bes kasa eklemek bu depoya agir gelirdi.
//!
//! Bulunmama riski dusuk ve sonucu ZARARSIZ: `curl` Windows 10 1803'ten beri
//! sistemde, macOS'ta her zaman var; yoksa denetim sessizce basarisiz oluyor ve
//! uygulama bildirim gostermiyor.

use crate::platform::quiet_command;
use serde::Serialize;

/// Yayinlarin okundugu depo.
const REPO: &str = "NYAYAN/NTerminal";

/// Istegin en fazla suresi (saniye).
///
/// Sekiz: acilista kosuyor ve arka planda; agi olmayan bir makinede kullaniciyi
/// bekletmiyor (cagri zaten ayri bir is parcaciginda), ama yavas bir baglantiya
/// da sansini veriyor.
const TIMEOUT_SECONDS: &str = "8";

/// Son yayin hakkinda arayuze tasinan bilgiler.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseInfo {
    /// Etiketten arindirilmis surum: `v0.2.0` -> `0.2.0`.
    pub version: String,
    /// Yayin sayfasinin adresi; kullanici indirmeye buradan gidiyor.
    pub url: String,
    /// Surum notlari (markdown, oldugu gibi). Bos olabilir.
    pub notes: String,
}

/// GitHub'daki son yayin; okunamazsa `None`.
///
/// Hata YUTULUYOR ve bu bilincli: ag yok, depo gorunmuyor, hiz siniri asilmis,
/// `curl` bulunamamis — dordunun de dogru karsiligi ayni, bildirim
/// gosterilmemesi. Bir guncelleme denetimi kullaniciya hata penceresi
/// acmamali; istedigi bir sey degildi, bir kolayliktir.
pub fn latest() -> Option<ReleaseInfo> {
    let url = format!("https://api.github.com/repos/{REPO}/releases/latest");
    let out = quiet_command("curl")
        .args([
            "-fsSL",
            "--max-time",
            TIMEOUT_SECONDS,
            // GitHub API'si User-Agent olmadan 403 doniyor.
            "-H",
            "User-Agent: NTerminal",
            "-H",
            "Accept: application/vnd.github+json",
            &url,
        ])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    parse_release(&String::from_utf8_lossy(&out.stdout))
}

/// GitHub yanitindan ilgilendigimiz alanlar.
///
/// Ayri ve saf: yanit bicimi degisirse ya da beklenmedik bir sey gelirse
/// (taslak yayin, etiketi olmayan kayit) davranisi gercek bir ag istegi
/// olmadan denemek gerekiyor.
pub fn parse_release(body: &str) -> Option<ReleaseInfo> {
    let json: serde_json::Value = serde_json::from_str(body).ok()?;
    // Taslak ve on-yayinlar atlaniyor: "en son surum" derken kastedilen sey
    // yayimlanmis olan.
    if json.get("draft").and_then(serde_json::Value::as_bool) == Some(true)
        || json.get("prerelease").and_then(serde_json::Value::as_bool) == Some(true)
    {
        return None;
    }
    let tag = json.get("tag_name")?.as_str()?.trim();
    if tag.is_empty() {
        return None;
    }
    Some(ReleaseInfo {
        version: strip_tag(tag),
        url: json
            .get("html_url")
            .and_then(serde_json::Value::as_str)
            .unwrap_or(&format!("https://github.com/{REPO}/releases"))
            .to_string(),
        notes: json
            .get("body")
            .and_then(serde_json::Value::as_str)
            .unwrap_or_default()
            .trim()
            .to_string(),
    })
}

/// `v0.2.0` -> `0.2.0`. Etiket bicimi depodan depoya degisiyor.
pub fn strip_tag(tag: &str) -> String {
    tag.trim().trim_start_matches(['v', 'V']).trim().to_string()
}

/// `candidate`, `current`ten YENI mi?
///
/// ## Neden elle karsilastirma
///
/// Bir semver kasasi eklemek bir GET istegi icin agir; ustelik burada tam semver
/// de gerekmiyor — karsilastirilan iki sey de kendi urettigimiz surumler.
///
/// Kural: noktayla ayrilmis parcalarin SAYISAL onekleri sirayla karsilastiriliyor,
/// eksik parca sifir sayiliyor (`0.2` ile `0.2.0` esit). Sayilar esitse ON-YAYIN
/// ekiyle (`0.2.0-beta`) gelen DAHA ESKI: semver de boyle diyor ve etiketi
/// olmayan yayin kararli olan.
pub fn is_newer(current: &str, candidate: &str) -> bool {
    let (a, a_pre) = split_version(current);
    let (b, b_pre) = split_version(candidate);

    let len = a.len().max(b.len());
    for i in 0..len {
        let x = a.get(i).copied().unwrap_or(0);
        let y = b.get(i).copied().unwrap_or(0);
        if x != y {
            return y > x;
        }
    }
    // Sayilar esit: on-yayin eki olan daha eski.
    a_pre && !b_pre
}

/// Surumu sayisal parcalarina ve "on-yayin mi" bilgisine ayirir.
fn split_version(text: &str) -> (Vec<u64>, bool) {
    let clean = strip_tag(text);
    // Yapi eki (`+build`) surumu etkilemiyor; on-yayin eki (`-beta`) etkiliyor.
    let core = clean.split('+').next().unwrap_or("");
    let (core, pre) = match core.split_once('-') {
        Some((c, _)) => (c, true),
        None => (core, false),
    };
    let parts = core
        .split('.')
        .map(|p| {
            let digits: String = p.chars().take_while(char::is_ascii_digit).collect();
            digits.parse::<u64>().unwrap_or(0)
        })
        .collect();
    (parts, pre)
}

#[cfg(test)]
#[path = "update_tests.rs"]
mod update_tests;
