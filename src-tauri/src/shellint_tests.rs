//! Entegrasyon betiklerinin kuruluma acilmasi.
//!
//! Betikler exe'nin icinde gomulu ve her acilista veri klasorune yaziliyor. Iki
//! sey sessizce bozulabiliyor:
//!
//!  * **Satir sonu.** Depo Windows'ta tutuluyor ve git CRLF yazabiliyor. bash ve
//!    zsh CRLF'te `\r`i komut adinin parcasi sayiyor: `__nterm_osc\r: command
//!    not found`. Betik yuklenir gibi gorunup her satirda hata veriyor.
//!  * **Eksik dosya.** zsh koprusunden biri yazilmazsa kullanicinin PATH'i ve
//!    alias'lari kayboluyor - uygulama yine aciliyor.

use super::*;
use crate::paths::DataPaths;

fn temp_paths(name: &str) -> DataPaths {
    let root = std::env::temp_dir().join(format!(
        "nterminal-shellint-{name}-{}-{:?}",
        std::process::id(),
        std::thread::current().id()
    ));
    let _ = std::fs::remove_dir_all(&root);
    std::fs::create_dir_all(&root).unwrap();
    DataPaths { root, portable: true }
}

#[test]
fn her_platformda_ortak_betikler_yaziliyor() {
    let paths = temp_paths("ortak");
    let installed = install(&paths).unwrap();

    // bash iki platformda da var (Windows'ta Git Bash, mac'te /bin/bash),
    // pwsh de oyle (mac'te Homebrew ile kuruluyor).
    assert!(installed.dir.join("nterminal.sh").is_file(), "nterminal.sh yazilmadi");
    assert!(installed.dir.join("nterminal.ps1").is_file(), "nterminal.ps1 yazilmadi");

    let _ = std::fs::remove_dir_all(&paths.root);
}

#[test]
fn posix_betikleri_lf_satir_sonu_kullaniyor() {
    let paths = temp_paths("lf");
    let installed = install(&paths).unwrap();

    // CRLF ile bash `__nterm_osc\r` diye bir komut ariyor ve her istemde hata
    // basiyor. Betik "yuklendi" gorunur, entegrasyon calismaz.
    let mut checked = 0;
    let mut posix: Vec<std::path::PathBuf> = vec![installed.dir.join("nterminal.sh")];
    #[cfg(unix)]
    {
        posix.push(installed.dir.join("nterminal.zsh"));
        for f in [".zshenv", ".zprofile", ".zshrc", ".zlogin"] {
            posix.push(installed.dir.join("zdotdir").join(f));
        }
    }
    for path in posix {
        let bytes = std::fs::read(&path).unwrap();
        assert!(
            !bytes.windows(2).any(|w| w == b"\r\n"),
            "{} CRLF iceriyor",
            path.display()
        );
        checked += 1;
    }
    // Tarama bos donerse test hicbir sey dogrulamaz.
    assert!(checked >= 1, "hic dosya denetlenmedi");

    let _ = std::fs::remove_dir_all(&paths.root);
}

#[test]
#[cfg(windows)]
fn windowsta_cmd_yaziliyor_zdotdir_yazilmiyor() {
    let paths = temp_paths("win");
    let installed = install(&paths).unwrap();

    assert!(installed.dir.join("nterminal.cmd").is_file(), "nterminal.cmd yazilmadi");
    // zsh Windows'ta yok; klasoru yazmak kullaniciya gorunen veri klasorunde
    // anlamsiz bir kalinti birakirdi.
    assert!(
        !installed.dir.join("zdotdir").exists(),
        "Windows'ta zdotdir yazilmamali"
    );
    assert!(!installed.dir.join("nterminal.zsh").exists());

    let _ = std::fs::remove_dir_all(&paths.root);
}

#[test]
#[cfg(unix)]
fn unixte_zsh_koprusu_tam_yaziliyor() {
    let paths = temp_paths("unix");
    let installed = install(&paths).unwrap();

    assert!(installed.dir.join("nterminal.zsh").is_file(), "nterminal.zsh yazilmadi");
    let zdotdir = installed.dir.join("zdotdir");
    // Dordu de sart: ZDOTDIR devreye girdiginde kullanicinin butun baslangic
    // dosyalari atlaniyor, her biri icin bir kopru olmali.
    for f in [".zshenv", ".zprofile", ".zshrc", ".zlogin"] {
        assert!(zdotdir.join(f).is_file(), "{f} koprusu yazilmadi");
    }
    // cmd POSIX'te anlamsiz.
    assert!(!installed.dir.join("nterminal.cmd").exists());

    let _ = std::fs::remove_dir_all(&paths.root);
}

#[test]
fn ikinci_kurulum_icerigi_bozmuyor() {
    // Her acilista cagriliyor; ikinci cagri ayni sonucu vermeli.
    let paths = temp_paths("tekrar");
    install(&paths).unwrap();
    let first = std::fs::read(paths.integration_dir().join("nterminal.sh")).unwrap();
    let installed = install(&paths).unwrap();
    let second = std::fs::read(installed.dir.join("nterminal.sh")).unwrap();
    assert_eq!(first, second, "ikinci kurulum icerigi degistirdi");

    let _ = std::fs::remove_dir_all(&paths.root);
}

#[test]
fn elle_degistirilen_betik_geri_yaziliyor() {
    // Betikler uygulamaya ait; kullanici duzenlerse guncelleme sirasinda eski
    // surumde kalirdi. write_if_changed bunu geri aliyor.
    let paths = temp_paths("geriyaz");
    install(&paths).unwrap();
    let target = paths.integration_dir().join("nterminal.sh");
    std::fs::write(&target, "# bozuldu").unwrap();

    install(&paths).unwrap();
    let text = std::fs::read_to_string(&target).unwrap();
    assert!(text.len() > 100, "betik geri yazilmadi");
    assert!(text.contains("__nterm_osc"), "beklenen icerik yok");

    let _ = std::fs::remove_dir_all(&paths.root);
}
