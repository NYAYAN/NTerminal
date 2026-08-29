//! Kabuk entegrasyon betiklerinin kuruluma acilmasi.
//!
//! Betikler `include_str!` ile exe'nin icine gomulu; uygulama her acilista
//! veri klasorune yaziyor. Boylece tek dosyalik dagitim bozulmuyor ve
//! uygulama guncellendiginde betikler de kendiliginden guncelleniyor.
//!
//! Yalnizca o platformda ise yarayan betikler yaziliyor. Klasor kullaniciya
//! gorunuyor (Ayarlar > Klasorler): mac'te `nterminal.cmd`, Windows'ta bir
//! `zdotdir/` gormek karisiklik yaratir.

use crate::paths::DataPaths;
use anyhow::Result;
use std::fs;
use std::path::PathBuf;

/// PowerShell iki platformda da var (pwsh mac'te Homebrew ile kuruluyor).
const PS1: &str = include_str!("../shell-integration/nterminal.ps1");
/// bash iki platformda da var: Windows'ta Git Bash, mac'te /bin/bash.
const SH: &str = include_str!("../shell-integration/nterminal.sh");
#[cfg(windows)]
const CMD: &str = include_str!("../shell-integration/nterminal.cmd");

// zsh yalnizca POSIX. Dort kopru dosyasi da sart: ZDOTDIR devreye girdiginde
// kullanicinin baslangic dosyalarinin HEPSI atlanir, her birini geri yukleyen
// bir kopru olmali (bkz. zdotdir/.zshenv).
#[cfg(unix)]
const ZSH: &str = include_str!("../shell-integration/nterminal.zsh");
#[cfg(unix)]
const ZSHENV: &str = include_str!("../shell-integration/zdotdir/.zshenv");
#[cfg(unix)]
const ZPROFILE: &str = include_str!("../shell-integration/zdotdir/.zprofile");
#[cfg(unix)]
const ZSHRC: &str = include_str!("../shell-integration/zdotdir/.zshrc");
#[cfg(unix)]
const ZLOGIN: &str = include_str!("../shell-integration/zdotdir/.zlogin");

pub struct Installed {
    pub dir: PathBuf,
}

pub fn install(paths: &DataPaths) -> Result<Installed> {
    let dir = paths.integration_dir();
    fs::create_dir_all(&dir)?;

    // bash ve zsh CRLF satir sonlarinda `\r`i komut adinin parcasi sayar;
    // LF'e zorluyoruz. (Depo Windows'ta tutuluyor, git core.autocrlf CRLF
    // yazabilir.)
    write_posix(&dir.join("nterminal.sh"), SH)?;
    // PowerShell her iki bicimi de kabul ediyor; oldugu gibi yaziyoruz.
    write_if_changed(&dir.join("nterminal.ps1"), PS1)?;

    #[cfg(windows)]
    write_if_changed(&dir.join("nterminal.cmd"), CMD)?;

    #[cfg(unix)]
    {
        write_posix(&dir.join("nterminal.zsh"), ZSH)?;
        let zdotdir = dir.join("zdotdir");
        fs::create_dir_all(&zdotdir)?;
        write_posix(&zdotdir.join(".zshenv"), ZSHENV)?;
        write_posix(&zdotdir.join(".zprofile"), ZPROFILE)?;
        write_posix(&zdotdir.join(".zshrc"), ZSHRC)?;
        write_posix(&zdotdir.join(".zlogin"), ZLOGIN)?;
    }

    Ok(Installed { dir })
}

/// POSIX kabuklari icin: satir sonlarini LF'e zorlayarak yazar.
fn write_posix(path: &std::path::Path, contents: &str) -> Result<()> {
    write_if_changed(path, &contents.replace("\r\n", "\n"))
}

fn write_if_changed(path: &std::path::Path, contents: &str) -> Result<()> {
    if let Ok(existing) = fs::read_to_string(path) {
        if existing == contents {
            return Ok(());
        }
    }
    crate::store::write_atomic(path, contents)
}

#[cfg(test)]
#[path = "shellint_tests.rs"]
mod tests;
