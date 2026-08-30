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

// PSReadLine 2.3.6, uygulamayla birlikte tasiniyor (BSD-2-Clause).
//
// Neden: satir ici oneriyi PowerShell'de PSReadLine ciziyor ve bunun icin 2.2+
// gerekiyor. Windows PowerShell 5.1 - stok bir Windows'ta VARSAYILAN kabuk -
// 2.0 ile geliyor ve hicbir zaman guncellenmiyor. Eskiden durum cubugu
// "desteklenmiyor" diyor, ipucu da kullaniciya `Install-Module` calistirmasini
// soyluyordu.
//
// zsh tarafindaki zsh-autosuggestions ile ayni yaklasim: KURULUM DEGIL. Modul
// yalnizca NTerminal'in kendi oturumunda, `PSModulePath`in basina eklenen
// klasorden yukleniyor (bkz. pty.rs). Kullanicinin profili, modul klasorleri ve
// baska terminalleri etkilenmiyor.
//
// `include_bytes!`: dosyalarin bir kismi DLL. Metin olarak okunup yeniden
// yazilmalari onlari bozar.
#[cfg(windows)]
const PSRL_FILES: &[(&str, &[u8])] = &[
    ("PSReadLine.psd1", include_bytes!("../shell-integration/modules/PSReadLine/PSReadLine.psd1")),
    ("PSReadLine.psm1", include_bytes!("../shell-integration/modules/PSReadLine/PSReadLine.psm1")),
    (
        "PSReadLine.format.ps1xml",
        include_bytes!("../shell-integration/modules/PSReadLine/PSReadLine.format.ps1xml"),
    ),
    (
        "Microsoft.PowerShell.PSReadLine2.dll",
        include_bytes!("../shell-integration/modules/PSReadLine/Microsoft.PowerShell.PSReadLine2.dll"),
    ),
    (
        "Microsoft.PowerShell.Pager.dll",
        include_bytes!("../shell-integration/modules/PSReadLine/Microsoft.PowerShell.Pager.dll"),
    ),
    (
        "System.Runtime.InteropServices.RuntimeInformation.dll",
        include_bytes!(
            "../shell-integration/modules/PSReadLine/System.Runtime.InteropServices.RuntimeInformation.dll"
        ),
    ),
    ("License.txt", include_bytes!("../shell-integration/modules/PSReadLine/License.txt")),
    (
        "net462/Microsoft.PowerShell.PSReadLine.Polyfiller.dll",
        include_bytes!(
            "../shell-integration/modules/PSReadLine/net462/Microsoft.PowerShell.PSReadLine.Polyfiller.dll"
        ),
    ),
    (
        "net6plus/Microsoft.PowerShell.PSReadLine.Polyfiller.dll",
        include_bytes!(
            "../shell-integration/modules/PSReadLine/net6plus/Microsoft.PowerShell.PSReadLine.Polyfiller.dll"
        ),
    ),
];

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

// zsh-autosuggestions, uygulamayla birlikte tasiniyor (v0.7.1, MIT).
//
// Neden: zsh'te satir ici oneriyi bu eklenti ciziyor ve macOS'ta kurulu
// gelmiyor. Eskiden yoklugunda durum cubugu "Komut onerisi desteklenmiyor"
// diyor, ipucu da `brew install zsh-autosuggestions` oneriyordu - yani
// kullanicinin once Homebrew kurmasi gerekiyordu. Ozelligin calismasi icin
// kullanicidan paket yoneticisi kurmasini istemek makul degil.
//
// Bu KURULUM DEGIL: dosya yalnizca NTerminal'in kendi ZDOTDIR koprusunde
// yukleniyor (bkz. nterminal.zsh, 4. bolum). Kullanicinin .zshrc'si ve baska
// terminalleri etkilenmiyor; kendi kurulumu varsa onunki kazaniyor.
//
// Lisans metni yaninda: zsh-autosuggestions-LICENSE.txt.
#[cfg(unix)]
const AUTOSUGGEST: &str = include_str!("../shell-integration/zsh-autosuggestions.zsh");
#[cfg(unix)]
const AUTOSUGGEST_LICENSE: &str =
    include_str!("../shell-integration/zsh-autosuggestions-LICENSE.txt");

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
    {
        write_if_changed(&dir.join("nterminal.cmd"), CMD)?;

        // `PSModulePath` girdisi bir modul KLASORU bekliyor: <modules>/PSReadLine/...
        let psrl = dir.join("modules").join("PSReadLine");
        for (name, bytes) in PSRL_FILES {
            let target = psrl.join(name);
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent)?;
            }
            write_bytes_if_changed(&target, bytes)?;
        }
    }

    #[cfg(unix)]
    {
        write_posix(&dir.join("nterminal.zsh"), ZSH)?;
        let zdotdir = dir.join("zdotdir");
        fs::create_dir_all(&zdotdir)?;
        write_posix(&zdotdir.join(".zshenv"), ZSHENV)?;
        write_posix(&zdotdir.join(".zprofile"), ZPROFILE)?;
        write_posix(&zdotdir.join(".zshrc"), ZSHRC)?;
        write_posix(&zdotdir.join(".zlogin"), ZLOGIN)?;
        write_posix(&dir.join("zsh-autosuggestions.zsh"), AUTOSUGGEST)?;
        write_if_changed(&dir.join("zsh-autosuggestions-LICENSE.txt"), AUTOSUGGEST_LICENSE)?;
    }

    Ok(Installed { dir })
}

/// Ikili dosyalar icin: icerik aynıysa dokunmuyor.
///
/// Dokunmamak onemli: modul dosyalari her acilista yeniden yazilsaydi, o sirada
/// acik bir PowerShell oturumu DLL'i kilitlemis olabilir ve yazma hata verirdi.
#[cfg(windows)]
fn write_bytes_if_changed(path: &std::path::Path, contents: &[u8]) -> Result<()> {
    if let Ok(existing) = fs::read(path) {
        if existing == contents {
            return Ok(());
        }
    }
    fs::write(path, contents)?;
    Ok(())
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
