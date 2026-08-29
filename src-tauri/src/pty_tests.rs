//! Kabuk baslatma argumanlarinin, ortam degiskenlerinin ve yol cevrimlerinin
//! testleri.

use super::*;

#[test]
#[cfg(windows)]
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
#[cfg(windows)]
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
///
/// zsh koprusu ALT KLASORDE (`zdotdir/`) duruyor - ZDOTDIR o klasoru
/// gosterecek ve zsh orada yalnizca kendi nokta dosyalarini gormeli.
fn fixture_dir(name: &str) -> std::path::PathBuf {
    let dir = std::env::temp_dir().join(format!("nterminal-int-{name}-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    for file in ["nterminal.ps1", "nterminal.sh", "nterminal.cmd", "nterminal.zsh"] {
        std::fs::write(dir.join(file), "# test").unwrap();
    }
    let zdotdir = dir.join("zdotdir");
    std::fs::create_dir_all(&zdotdir).unwrap();
    for file in [".zshenv", ".zprofile", ".zshrc", ".zlogin"] {
        std::fs::write(zdotdir.join(file), "# test").unwrap();
    }
    dir
}

/// `apply_integration`i env toplayarak cagirir.
fn integrate(
    kind: ShellKind,
    args: &mut Vec<String>,
    dir: &std::path::Path,
) -> (bool, Vec<(String, String)>) {
    let mut env = Vec::new();
    let ok = apply_integration(kind, args, &mut env, dir, None);
    (ok, env)
}

/// Ortam degiskeni listesinde bir anahtari arar.
fn env_get<'a>(env: &'a [(String, String)], key: &str) -> Option<&'a str> {
    env.iter().find(|(k, _)| k == key).map(|(_, v)| v.as_str())
}

#[test]
fn powershell_argumanlari() {
    let dir = fixture_dir("ps");
    let mut args = vec!["-NoLogo".to_string()];
    let (ok, env) = integrate(ShellKind::Pwsh, &mut args, &dir);
    assert!(ok);

    // Kullanicinin argumanlari basta kalmali, sonra -NoExit -File <betik>.
    assert_eq!(args[0], "-NoLogo");
    assert_eq!(args[1], "-NoExit");
    assert_eq!(args[2], "-File");
    assert!(args[3].ends_with("nterminal.ps1"));
    assert!(env.is_empty(), "PowerShell ortam degiskeni gerektirmiyor");
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn cmd_argumanlari() {
    let dir = fixture_dir("cmd");
    let mut args = Vec::new();
    let (ok, _) = integrate(ShellKind::Cmd, &mut args, &dir);
    assert!(ok);
    assert_eq!(args[0], "/K");
    assert!(args[1].ends_with("nterminal.cmd"));
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn bash_login_argumani_kaldirilir() {
    let dir = fixture_dir("bash");
    // Profilin varsayilani `--login -i` (Git Bash) ya da `-l` (mac).
    //
    // --login CIKARILMAK ZORUNDA: bash `--init-file`i yalnizca login OLMAYAN
    // etkilesimli kabukta okuyor. Birakilsaydi betik hic yuklenmez ve
    // entegrasyon sessizce olurdu - komut gecmisi bos kalirdi.
    let mut args = vec!["--login".to_string(), "-i".to_string()];
    let (ok, _) = integrate(ShellKind::Bash, &mut args, &dir);
    assert!(ok);

    assert!(!args.contains(&"--login".to_string()), "--login kaldirilmali");
    assert!(!args.contains(&"-l".to_string()), "-l de kaldirilmali");
    let pos = args.iter().position(|a| a == "--init-file").expect("--init-file yok");
    assert!(args[pos + 1].starts_with("/"), "betik yolu POSIX bicimde olmali");
    assert_eq!(args.iter().filter(|a| *a == "-i").count(), 1, "-i tekrarlanmamali");
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn bash_kisa_login_argumani_da_kaldirilir() {
    // mac profilinin varsayilani `-l` (uzun bicim degil).
    let dir = fixture_dir("bash-l");
    let mut args = vec!["-l".to_string()];
    let (ok, _) = integrate(ShellKind::Bash, &mut args, &dir);
    assert!(ok);
    assert!(!args.contains(&"-l".to_string()), "-l kaldirilmali");
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
#[cfg(windows)]
fn bash_yolu_windowsta_msys_bicimine_cevrilir() {
    let dir = fixture_dir("bash-msys");
    let mut args = Vec::new();
    let (ok, _) = integrate(ShellKind::Bash, &mut args, &dir);
    assert!(ok);
    let pos = args.iter().position(|a| a == "--init-file").unwrap();
    // Git Bash `C:\...` anlamiyor; `/c/...` bekliyor.
    assert!(
        args[pos + 1].starts_with('/') && !args[pos + 1].contains('\\'),
        "MSYS bicimi bekleniyordu: {}",
        args[pos + 1]
    );
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
#[cfg(windows)]
fn wsl_argumanlari() {
    let dir = fixture_dir("wsl");
    let mut args = vec!["-d".to_string(), "Ubuntu".to_string()];
    let (ok, _) = integrate(ShellKind::Wsl, &mut args, &dir);
    assert!(ok);

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
    let (ok, env) = integrate(ShellKind::Custom, &mut args, &dir);
    assert!(!ok);
    assert!(args.is_empty());
    assert!(env.is_empty());
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn fish_entegrasyon_almaz() {
    let dir = fixture_dir("fish");
    let mut args = Vec::new();
    // fish bash/zsh soz dizimini paylasmiyor. Entegrasyonu "acik" saymak
    // kullaniciya calisiyor izlenimi verirdi ama gecmis, oneri ve cikis kodu
    // hic gelmezdi - sessiz bir yarim durum.
    let (ok, env) = integrate(ShellKind::Fish, &mut args, &dir);
    assert!(!ok, "fish icin entegrasyon bildirilmemeli");
    assert!(args.is_empty(), "yarim arguman birakilmamali");
    assert!(env.is_empty());
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn fish_desteklenmiyor_olarak_isaretli() {
    // apply_integration'a hic gelmemesi gerekiyor; iki yer de ayni seyi
    // soylemeli.
    assert!(!ShellKind::Fish.supports_integration());
    assert!(!ShellKind::Custom.supports_integration());
    assert!(ShellKind::Zsh.supports_integration());
    assert!(ShellKind::Bash.supports_integration());
}

#[test]
fn betik_yoksa_entegrasyon_kapali_kalir() {
    let bos = std::env::temp_dir().join(format!("nterminal-bos-{}", std::process::id()));
    std::fs::create_dir_all(&bos).unwrap();
    let mut args = Vec::new();
    // Betik dosyasi yok: sessizce entegrasyonsuz devam edilmeli, hata degil.
    let (ok, _) = integrate(ShellKind::Pwsh, &mut args, &bos);
    assert!(!ok);
    assert!(args.is_empty(), "yarim arguman birakilmamali");
    let _ = std::fs::remove_dir_all(bos);
}

// ------------------------------------------------------------------- zsh

#[test]
fn zsh_zdotdir_ile_yukleniyor() {
    let dir = fixture_dir("zsh");
    let mut args = vec!["-l".to_string()];
    let (ok, env) = integrate(ShellKind::Zsh, &mut args, &dir);
    assert!(ok);

    // zsh'in `--init-file` karsiligi YOK: yukleme yalnizca ZDOTDIR ile
    // olabiliyor. Arguman eklenmemeli - eklenirse zsh onu dosya adi sanip
    // etkilesimli kabuk yerine betik kosturur.
    assert_eq!(args, vec!["-l".to_string()], "argumanlar degismemeli");

    let zdotdir = env_get(&env, "ZDOTDIR").expect("ZDOTDIR yazilmamis");
    assert!(
        zdotdir.ends_with("zdotdir"),
        "ZDOTDIR kopru klasorunu gostermeli: {zdotdir}"
    );
    assert!(
        std::path::Path::new(zdotdir).join(".zshrc").is_file(),
        "ZDOTDIR icinde .zshrc olmali"
    );
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn zsh_login_argumani_korunuyor() {
    // bash'in tersine: zsh `-l` ile de ZDOTDIR'i okuyor, dolayisiyla login
    // kabugunu bozmak gerekmiyor. mac'te `-l` SART - PATH'i /etc/zprofile
    // icindeki path_helper kuruyor.
    let dir = fixture_dir("zsh-l");
    let mut args = vec!["-l".to_string()];
    let (ok, _) = integrate(ShellKind::Zsh, &mut args, &dir);
    assert!(ok);
    assert!(args.contains(&"-l".to_string()), "-l korunmali");
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn zsh_kopru_yoksa_entegrasyon_kapali() {
    // nterminal.zsh var ama kopru dosyalari yok: ZDOTDIR'i yonlendirmek
    // kullanicinin TUM baslangic dosyalarini atlatirdi - PATH'i, alias'lari ve
    // temasi giderdi. Entegrasyonsuz devam etmek buna yegdir.
    let dir = std::env::temp_dir().join(format!("nterminal-zsh-bos-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("nterminal.zsh"), "# test").unwrap();
    let mut args = Vec::new();
    let (ok, env) = integrate(ShellKind::Zsh, &mut args, &dir);
    assert!(!ok, "kopru yoksa entegrasyon bildirilmemeli");
    assert!(env.is_empty(), "yarim ZDOTDIR birakilmamali");
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn zsh_kullanici_zdotdiri_kopruye_gecirilir() {
    let dir = fixture_dir("zsh-user");
    let mut args = Vec::new();
    let mut env = Vec::new();
    let ok = apply_integration(
        ShellKind::Zsh,
        &mut args,
        &mut env,
        &dir,
        Some("/Users/ali/.config/zsh"),
    );
    assert!(ok);
    // Kopru dosyalari kullanicinin gercek dosyalarini bu degerle buluyor.
    // Gecirilmezse $HOME'a duser ve ozel bir ZDOTDIR kullanan kullanicinin
    // hicbir ayari yuklenmez.
    assert_eq!(
        env_get(&env, "NTERMINAL_ZDOTDIR"),
        Some("/Users/ali/.config/zsh")
    );
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn zsh_kendi_klasorunu_kullanici_zdotdiri_sanmiyor() {
    // Uygulama bir NTerminal sekmesinden baslatildiginda ZDOTDIR zaten bizim
    // kopruyu gosteriyor. Onu "kullanicinin ZDOTDIR'i" diye geri verirsek
    // kopru kendi kendini yuklemeye calisir ve kullanicinin hicbir dosyasi
    // okunmaz - sessiz ve teshisi zor.
    let dir = fixture_dir("zsh-self");
    let own = dir.join("zdotdir").to_string_lossy().to_string();
    let mut args = Vec::new();
    let mut env = Vec::new();
    let ok = apply_integration(ShellKind::Zsh, &mut args, &mut env, &dir, Some(&own));
    assert!(ok);
    assert_eq!(
        env_get(&env, "NTERMINAL_ZDOTDIR"),
        None,
        "kendi klasorumuz kullanici klasoru olarak gecirilmemeli"
    );
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn zsh_bos_kullanici_zdotdiri_yazilmiyor() {
    // Bos dize gecirilirse kopru `${NTERMINAL_ZDOTDIR:-$HOME}` ile $HOME'a
    // dusuyor; degiskeni bos yazmak yerine hic yazmamak ayni sonucu veriyor ve
    // ortami temiz tutuyor.
    let dir = fixture_dir("zsh-empty");
    let mut args = Vec::new();
    let mut env = Vec::new();
    assert!(apply_integration(ShellKind::Zsh, &mut args, &mut env, &dir, Some("   ")));
    assert_eq!(env_get(&env, "NTERMINAL_ZDOTDIR"), None);
    let _ = std::fs::remove_dir_all(dir);
}
