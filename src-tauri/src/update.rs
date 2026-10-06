//! Yeni surum denetimi ve uygulama icinden guncelleme.
//!
//! ## Iki katman
//!
//! 1. HABER (her zaman): GitHub'daki son yayini okuyup surumu karsilastiriyor;
//!    yenisi varsa durum cubugunda rozet ve Ayarlar › Hakkinda'da surum notlari.
//! 2. KURULUM (yayin imzaliysa): "Guncelle ve yeniden baslat" paketi indiriyor,
//!    imzasini dogruluyor, kuruyor ve uygulamayi yeniden aciyor
//!    (`tauri-plugin-updater`). Olmazsa 1. katmanin indirme sayfasi yerinde.
//!
//! Ikinci katman uc seye bagli: CI'da imza anahtari (`TAURI_SIGNING_PRIVATE_KEY`
//! sirri), onunla imzalanan paketler ve yayina eklenen `latest.json`. Biri
//! eksikse kurulum dugmesi CIKMIYOR, haber yine calisiyor — ayrimin sebebi bu.
//!
//! Neden kurulum da: imzasiz paket tarayicidan indirilince macOS onu karantinaya
//! aliyor ("hasarli" diyalogu, elle `xattr`), Windows'ta SmartScreen uyariyor;
//! ikisi de HER surumde tekrar ediyordu. Uygulamanin kendi indirdigi pakette
//! bu isaret yok. Paketin bize ait oldugunu imza kanitliyor: acik anahtar
//! `tauri.conf.json`da, ozeli yalnizca CI'da.
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
//!
//! Kurulum katmani ise `curl` DEGIL eklentinin `reqwest`ini kullaniyor (indirme,
//! imza ve kurucu ayni pakette). Ayni kurumsal ag kaygisi icin `native-tls` ile
//! derleniyor: guven deposu yine isletim sisteminin, vekil sunucu ayari da
//! (`system-proxy`) sistemden okunuyor — bkz. Cargo.toml.

use std::path::{Component, Path};

use crate::platform::quiet_command;
use serde::Serialize;
use tauri::{AppHandle, Runtime};
use tauri_plugin_updater::{Update, UpdaterExt};

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
    /// Uygulama bu surumu KENDISI kurabilir mi ("Guncelle ve yeniden baslat").
    ///
    /// `false` ise arayuz yalnizca indirme sayfasini sunuyor. Yanitta degil
    /// denetimde belirleniyor (bkz. `installable`); ayristirma hep `false`.
    pub installable: bool,
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
        installable: false,
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

/// Ayni surum mu? `0.2` ile `0.2.0`, `v0.2.0` ile `0.2.0` ayni.
///
/// Haber (GitHub API) ile kurulum (`latest.json`) iki ayri kaynak; dugme ancak
/// ikisi AYNI surumu soyluyorsa cikiyor. "Su surum hazir" yazip baska bir
/// surumu kurmak kullaniciya yalan soylemek olurdu.
pub fn same_version(a: &str, b: &str) -> bool {
    !is_newer(a, b) && !is_newer(b, a)
}

// ------------------------------------------------------------------ kurulum

/// `latest.json` istegi icin sure siniri. Haberdeki `curl`la ayni gerekce
/// (`TIMEOUT_SECONDS`): denetim arka planda, ama "Denetleniyor…" yazan dugme
/// sonsuza kadar beklememeli.
const CHECK_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(8);

/// Indirme icin baglanti ve DURMA siniri — toplam sure degil.
///
/// Paket birkac MB; yavas bir kurumsal vekilde dakikalar surebilir ve bu
/// normal. Kesilmesi gereken sey ilerlemeyen indirme: otuz saniye tek bayt
/// gelmezse baglanti olmus sayiliyor. Eklentide indirmenin varsayilan bir siniri
/// yok; olmadan dusen bir baglanti "Indiriliyor %40"ta sonsuza kadar asili kalir.
const CONNECT_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(15);
const STALL_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(30);

/// Calisan ikili bir macOS uygulama paketinin icinde mi
/// (`…/N-Terminal.app/Contents/MacOS/nterminal`)?
///
/// ## Neden gerekli
///
/// Eklenti macOS'ta paketsiz ikiliyi de `app` turunde sayiyor
/// (`tauri::utils::platform::bundle_type` macOS'ta tanimsizi `App`
/// donduruyor). Kurulum ise ikilinin bulundugu klasoru "uygulama" sayip YERINE
/// yenisini koyuyor: `npm start`taki `target/debug/nterminal` icin bu,
/// `target/debug` klasorunu kaldirip yerine paketin icerigini acmak demek.
/// Gelistirme kopyasinda dugme bu yuzden hic cikmiyor.
pub fn in_app_bundle(exe: &Path) -> bool {
    let mut up = exe.components().rev().skip(1);
    let named = |part: Option<Component>, name: &str| {
        matches!(part, Some(Component::Normal(n)) if n == name)
    };
    let (macos, contents, bundle) = (up.next(), up.next(), up.next());
    named(macos, "MacOS")
        && named(contents, "Contents")
        && matches!(bundle, Some(Component::Normal(n))
            if Path::new(n).extension().is_some_and(|ext| ext == "app"))
}

/// Bu kopya KURULU bir paket mi — kendini guncelleyebilir mi?
///
/// Windows'ta kurucu (NSIS ya da MSI) ikiliye kendi turunu isliyor; isaretsiz
/// ikili (`npm start`, kurulumsuz kopyalanmis `nterminal.exe`) hangi kurucuyla
/// guncellenecegini bilmiyor ve guncellenmemeli: tasinabilir kopyayi NSIS ile
/// "guncellemek" kullanici klasorune ikinci bir kurulum yapmak olurdu.
fn bundled() -> bool {
    #[cfg(target_os = "macos")]
    {
        std::env::current_exe().is_ok_and(|exe| in_app_bundle(&exe))
    }
    #[cfg(windows)]
    {
        use tauri::utils::{config::BundleType, platform::bundle_type};
        matches!(bundle_type(), Some(BundleType::Nsis | BundleType::Msi))
    }
    #[cfg(not(any(target_os = "macos", windows)))]
    {
        false
    }
}

/// Eklentinin HTTP istemcisine sure sinirlari (bkz. `CONNECT_TIMEOUT`).
fn with_timeouts(
    builder: tauri_plugin_updater::UpdaterBuilder,
) -> tauri_plugin_updater::UpdaterBuilder {
    builder.configure_client(|client| {
        client
            .connect_timeout(CONNECT_TIMEOUT)
            .read_timeout(STALL_TIMEOUT)
    })
}

/// Son yayini uygulama kendisi kurabilir mi?
///
/// Uc kosul: kurulu bir paket (`bundled`), yayinda bu platform ve kurucu turu
/// icin imzali bir paket (`latest.json`; eklentinin `check`i bulamazsa hata)
/// ve onun surumunun haberdekiyle ayni olmasi. Biri tutmazsa `false`: dugme
/// cikmiyor, indirme sayfasi kaliyor. Hata da `false` ve bu bilincli — yayin
/// imzasiz cikmis (404) ya da ag dusmus olabilir, ikisinde de dogru davranis
/// ayni ve bir guncelleme denetimi hata penceresi acmamali.
pub async fn installable<R: Runtime>(app: &AppHandle<R>, version: &str) -> bool {
    if !bundled() {
        return false;
    }
    let Ok(updater) = with_timeouts(app.updater_builder()).timeout(CHECK_TIMEOUT).build() else {
        return false;
    };
    match updater.check().await {
        Ok(Some(update)) => same_version(&update.version, version),
        _ => false,
    }
}

/// Kurulumun kapanis temizligi (`download`in `before_exit`i) basladi mi?
///
/// Yalnizca Windows'ta dolabiliyor; ardindan kurulum yine de duserse surec
/// yarim kapanmis durumda kalmasin diye `update_apply` buna bakiyor.
pub static EXIT_STARTED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// Indirilmis, imzasi dogrulanmis ve kurulmayi bekleyen guncelleme.
///
/// Indirme ile kurulum AYRI adimlar: arada arayuz son durumu (sekmeler, ekran
/// ciktilari) diske yaziyor. Indirme yavas bir agda dakikalar surebiliyor ve
/// kullanici o sirada calismaya devam ediyor; durumu indirmeden ONCE yazmak
/// aradaki ciktiyi kaybederdi.
#[derive(Default)]
pub struct Pending(parking_lot::Mutex<Option<(Update, Vec<u8>)>>);

impl Pending {
    pub fn put(&self, update: Update, bytes: Vec<u8>) {
        *self.0.lock() = Some((update, bytes));
    }

    pub fn take(&self) -> Option<(Update, Vec<u8>)> {
        self.0.lock().take()
    }
}

/// Son surumu indirir ve imzasini dogrular; KURMAZ. Surumu dondurur.
///
/// `on_progress(alinan, toplam)`: toplami sunucu bildirmezse `None`.
///
/// `before_exit` yalnizca Windows'ta ve kurulumda calisiyor: eklenti orada
/// kurucuyu baslatip sureci `exit(0)` ile bitiriyor, yani pencere kapanma
/// olaylari hic gelmiyor. Kabuklari kapatmak gibi son isler oraya.
pub async fn download<R: Runtime>(
    app: &AppHandle<R>,
    before_exit: impl Fn() + Send + Sync + 'static,
    mut on_progress: impl FnMut(u64, Option<u64>),
) -> Result<(Update, Vec<u8>), String> {
    if !bundled() {
        return Err("bu kopya kurulu bir paket degil".into());
    }
    let updater = with_timeouts(app.updater_builder())
        .timeout(CHECK_TIMEOUT)
        .on_before_exit(before_exit)
        .build()
        .map_err(|e| e.to_string())?;
    let update = updater
        .check()
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "yeni surum bulunamadi".to_string())?;
    let mut received = 0u64;
    let bytes = update
        .download(
            |chunk, total| {
                received += chunk as u64;
                on_progress(received, total);
            },
            || {},
        )
        .await
        .map_err(|e| e.to_string())?;
    Ok((update, bytes))
}

/// Ilerleme olaylarinin araligi (bayt): paketin yuzde biri, en az 64 KB.
///
/// Ag parcalari birkac KB; parca basina olay birkac MB'lik pakette binlerce IPC
/// mesaji ve her biri bir React cizimi demek. Arayuz yuzdeyi tam sayi olarak
/// yaziyor — yuzde birden sik haber gozle gorulmuyor.
pub fn progress_step(total: Option<u64>) -> u64 {
    const MIN: u64 = 64 * 1024;
    total.map_or(MIN, |t| (t / 100).max(MIN))
}

#[cfg(test)]
#[path = "update_tests.rs"]
mod update_tests;
