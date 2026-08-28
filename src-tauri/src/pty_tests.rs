//! Kabuk baslatma argumanlarinin ve yol cevrimlerinin testleri.

use super::*;

#[test]
fn msys_yol_cevrimi() {
    assert_eq!(
        unix_style_path(std::path::Path::new("C:\\Users\\ali\\nterminal.sh")),
        "/c/Users/ali/nterminal.sh"
    );
    // Zaten unix bicimindeyse dokunmuyoruz.
    assert_eq!(
        unix_style_path(std::path::Path::new("/home/ali/x.sh")),
        "/home/ali/x.sh"
    );
}

#[test]
fn wsl_yol_cevrimi() {
    assert_eq!(
        wsl_mount_path(std::path::Path::new("D:\\veri\\nterminal.sh")).as_deref(),
        Some("/mnt/d/veri/nterminal.sh")
    );
    // Surucu harfi yoksa cevrim yapilamaz; entegrasyon devre disi kalmali.
    assert_eq!(wsl_mount_path(std::path::Path::new("\\\\sunucu\\pay\\x.sh")), None);
}

/// Entegrasyon argumanlarini gercek betik dosyalariyla sinamak icin
/// gecici bir klasore bos betikler yaziyoruz: `apply_integration` dosyanin
/// varligini kontrol ediyor.
fn fixture_dir(name: &str) -> std::path::PathBuf {
    let dir = std::env::temp_dir().join(format!("nterminal-int-{name}-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    for file in ["nterminal.ps1", "nterminal.sh", "nterminal.cmd"] {
        std::fs::write(dir.join(file), "# test").unwrap();
    }
    dir
}

#[test]
fn powershell_argumanlari() {
    let dir = fixture_dir("ps");
    let mut args = vec!["-NoLogo".to_string()];
    assert!(apply_integration(ShellKind::Pwsh, &mut args, &dir));

    // Kullanicinin argumanlari basta kalmali, sonra -NoExit -File <betik>.
    assert_eq!(args[0], "-NoLogo");
    assert_eq!(args[1], "-NoExit");
    assert_eq!(args[2], "-File");
    assert!(args[3].ends_with("nterminal.ps1"));
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn cmd_argumanlari() {
    let dir = fixture_dir("cmd");
    let mut args = Vec::new();
    assert!(apply_integration(ShellKind::Cmd, &mut args, &dir));
    assert_eq!(args[0], "/K");
    assert!(args[1].ends_with("nterminal.cmd"));
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn bash_login_argumani_kaldirilir() {
    let dir = fixture_dir("bash");
    // Git Bash profilinin varsayilani `--login -i`. --init-file kullanici rc
    // dosyalarini betigin kendisi yukledigi icin --login anlamsiz kaliyor.
    let mut args = vec!["--login".to_string(), "-i".to_string()];
    assert!(apply_integration(ShellKind::Bash, &mut args, &dir));

    assert!(!args.contains(&"--login".to_string()), "--login kaldirilmali");
    let pos = args.iter().position(|a| a == "--init-file").expect("--init-file yok");
    assert!(args[pos + 1].starts_with("/"), "betik yolu msys bicimine cevrilmeli");
    assert_eq!(args.iter().filter(|a| *a == "-i").count(), 1, "-i tekrarlanmamali");
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn wsl_argumanlari() {
    let dir = fixture_dir("wsl");
    let mut args = vec!["-d".to_string(), "Ubuntu".to_string()];
    assert!(apply_integration(ShellKind::Wsl, &mut args, &dir));

    let sep = args.iter().position(|a| a == "--").expect("-- ayirici yok");
    assert_eq!(args[sep + 1], "bash");
    assert_eq!(args[sep + 2], "--init-file");
    assert!(args[sep + 3].starts_with("/mnt/"), "WSL yolu bekleniyordu: {}", args[sep + 3]);
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn ozel_profil_entegrasyon_almaz() {
    let dir = fixture_dir("custom");
    let mut args = Vec::new();
    // Custom: hangi kabuk oldugunu bilmiyoruz, betik yuklemek riskli.
    assert!(!apply_integration(ShellKind::Custom, &mut args, &dir));
    assert!(args.is_empty());
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn betik_yoksa_entegrasyon_kapali_kalir() {
    let bos = std::env::temp_dir().join(format!("nterminal-bos-{}", std::process::id()));
    std::fs::create_dir_all(&bos).unwrap();
    let mut args = Vec::new();
    // Betik dosyasi yok: sessizce entegrasyonsuz devam edilmeli, hata degil.
    assert!(!apply_integration(ShellKind::Pwsh, &mut args, &bos));
    assert!(args.is_empty(), "yarim arguman birakilmamali");
    let _ = std::fs::remove_dir_all(bos);
}
