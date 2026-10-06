//! Kabuk tespiti testleri.

/// `/etc/shells`ten gelen `/bin/sh` ikinci bir "Bash" profili olmuyor.
///
/// BILDIRILEN DURUM (kullanicinin ayar dosyasinda): profil listesinde iki
/// "Bash" vardi, biri `/bin/bash`, oteki `/bin/sh`. Sabit aday listesi `sh`yi
/// bilerek atliyordu ama `/etc/shells` adimi onu yine getiriyordu.
#[cfg(unix)]
#[test]
fn etc_shells_sh_satirini_atliyor() {
    use std::path::PathBuf;
    let listed = super::nix::shells_listed(
        "# yorum satiri\n/bin/bash\n/bin/sh\n  /bin/zsh  \n\n/opt/homebrew/bin/fish\n",
    );
    assert_eq!(
        listed,
        vec![
            PathBuf::from("/bin/bash"),
            PathBuf::from("/bin/zsh"),
            PathBuf::from("/opt/homebrew/bin/fish"),
        ]
    );
}
