//! Platform kimliği ve işletim sistemine yapılan küçük çağrılar.
//!
//! Neden tek dosya: `#[cfg(...)]` kapıları koda dağıldığında bir platformu
//! bozduğunuzu ancak o platformda derleyerek anlıyorsunuz. Buradaki kural şu —
//! "işletim sisteminden bir şey istemek" tek yerde toplanır, geri kalan modüller
//! platformdan habersiz kalır. `lib.rs` içindeki komutlar bu fonksiyonları
//! çağırıyor, kendileri kapı içermiyor.
//!
//! Birincil hedefler Windows ve macOS. Linux dalları POSIX kodunu paylaştığı
//! yerde bedavaya geliyor ama denenmedi; `Platform::Linux` bu yüzden var, bir
//! destek beyanı değil.

use std::path::Path;

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Platform {
    Windows,
    Macos,
    Linux,
}

impl Platform {
    /// Arayüze gönderilen değer. Ön yüz buna bakarak Cmd/Ctrl seçiyor,
    /// `windowsPty` veriyor ve yazı tipi öntanımını belirliyor.
    pub fn current() -> Self {
        #[cfg(windows)]
        return Platform::Windows;
        #[cfg(target_os = "macos")]
        return Platform::Macos;
        #[cfg(all(unix, not(target_os = "macos")))]
        return Platform::Linux;
    }
}

/// Bağlantıyı işletim sisteminin varsayılan tarayıcısında açar.
///
/// Kabuk ARAYA GİRMEMELİ. Url terminal çıktısından geliyor, yani güvenilmez bir
/// kaynak: `cmd /c start` ya da `sh -c` kullanılırsa `&`, `|`, `;` gibi
/// karakterler komut ayırıcıya dönüşür — `?a=1&b=2` gibi sıradan bir sorgu
/// dizesi bile yeter. Her iki platformda da url tek bir argüman olarak
/// veriliyor.
///
/// Şema denetimi çağıran tarafta (`lib.rs`): yalnızca http/https.
pub fn open_url(url: &str) -> std::io::Result<()> {
    #[cfg(windows)]
    {
        // `rundll32 url.dll,FileProtocolHandler` url'i tek argüman alır.
        std::process::Command::new("rundll32.exe")
            .arg("url.dll,FileProtocolHandler")
            .arg(url)
            .spawn()?;
    }
    #[cfg(target_os = "macos")]
    {
        // `open` argümanı kabuğa vermez. `--` şart: url `-` ile başlarsa
        // (şema denetimi bunu engelliyor ama savunma katmanı ucuz) seçenek
        // sanılmasın.
        std::process::Command::new("/usr/bin/open").arg("--").arg(url).spawn()?;
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open").arg(url).spawn()?;
    }
    Ok(())
}

/// Verilen klasörü sistemin dosya yöneticisinde açar.
///
/// Çağıran yerlerin hepsi bir DİZİN veriyor (sekmenin cwd'si ya da veri
/// klasörü), dosya değil. Bu önemli: `open`/`explorer` bir dosyaya verildiğinde
/// onu varsayılan uygulamayla ÇALIŞTIRIR. Yolun dizin olduğu denetimi çağıran
/// komutta (`lib.rs`) yapılıyor — hata metnini kullanıcıya döndüren taraf orası.
pub fn reveal_path(path: &Path) -> std::io::Result<()> {
    #[cfg(windows)]
    {
        std::process::Command::new("explorer.exe").arg(path).spawn()?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("/usr/bin/open").arg("--").arg(path).spawn()?;
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open").arg(path).spawn()?;
    }
    Ok(())
}

/// Dosya yöneticisinin adı. Arayüz metinlerine `{fm}` olarak giriyor:
/// "Klasörü Gezgin'de aç" / "Klasörü Finder'de aç".
pub fn file_manager_name() -> &'static str {
    #[cfg(windows)]
    return "Gezgin";
    #[cfg(target_os = "macos")]
    return "Finder";
    #[cfg(all(unix, not(target_os = "macos")))]
    return "Dosya Yöneticisi";
}

/// Dosya yöneticisinin İngilizce adı.
pub fn file_manager_name_en() -> &'static str {
    #[cfg(windows)]
    return "Explorer";
    #[cfg(target_os = "macos")]
    return "Finder";
    #[cfg(all(unix, not(target_os = "macos")))]
    return "Files";
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn platform_derlendigi_hedefi_bildiriyor() {
        let p = Platform::current();
        #[cfg(windows)]
        assert_eq!(p, Platform::Windows);
        #[cfg(target_os = "macos")]
        assert_eq!(p, Platform::Macos);
        #[cfg(all(unix, not(target_os = "macos")))]
        assert_eq!(p, Platform::Linux);
        // Kullanılmayan değişken uyarısını platformdan bağımsız susturur.
        let _ = p;
    }

    #[test]
    fn platform_json_kucuk_harf() {
        // Ön yüz bu dizeyle karşılaştırma yapıyor; biçim değişirse Cmd/Ctrl
        // seçimi sessizce Windows'a düşer.
        let json = serde_json::to_string(&Platform::Macos).unwrap();
        assert_eq!(json, "\"macos\"");
        let json = serde_json::to_string(&Platform::Windows).unwrap();
        assert_eq!(json, "\"windows\"");
    }

    #[test]
    fn dosya_yoneticisi_adi_bos_degil() {
        assert!(!file_manager_name().is_empty());
        assert!(!file_manager_name_en().is_empty());
    }
}

/// Konsol penceresi ACMADAN surec baslatan komut.
///
/// ## Neden gerekli
///
/// OLCULEN BELIRTI: kurulu surumde uygulama acilirken ve dizin degistikce
/// "terminal gibi bir sey acilip kapaniyor" — ekranda bir an siyah konsol
/// penceresi cakiyor.
///
/// Sebep: gelistirme kipinde uygulamanin bir konsolu var ve baslatilan alt
/// surecler onu paylasiyor. Kurulu surum pencere altsistemiyle derleniyor
/// (`windows_subsystem = "windows"`), konsolu yok; bu yuzden konsol gerektiren
/// her alt surec KENDINE bir pencere aciyor. `git status` gibi arka planda
/// siklikla kosan bir komut boylece gorunur bir cakmaya donusuyor.
///
/// `CREATE_NO_WINDOW` (0x0800_0000) tam bunu kapatiyor. Diger platformlarda
/// karsiligi yok ve gerekmiyor.
///
/// Kullanici EYLEMIYLE acilan pencereler (dosya yoneticisi, tarayici) bu
/// yardimciyi kullanmiyor: orada pencere zaten istenen sey.
pub fn quiet_command(program: &str) -> std::process::Command {
    let mut cmd = std::process::Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    cmd
}
