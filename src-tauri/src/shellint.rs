//! Kabuk entegrasyon betiklerinin kuruluma acilmasi.
//!
//! Betikler `include_str!` ile exe'nin icine gomulu; uygulama her acilista
//! veri klasorune yaziyor. Boylece tek dosyalik dagitim bozulmuyor ve
//! uygulama guncellendiginde betikler de kendiliginden guncelleniyor.

use crate::paths::DataPaths;
use anyhow::Result;
use std::fs;
use std::path::PathBuf;

const PS1: &str = include_str!("../shell-integration/nterminal.ps1");
const SH: &str = include_str!("../shell-integration/nterminal.sh");
const CMD: &str = include_str!("../shell-integration/nterminal.cmd");

pub struct Installed {
    pub dir: PathBuf,
}

pub fn install(paths: &DataPaths) -> Result<Installed> {
    let dir = paths.integration_dir();
    fs::create_dir_all(&dir)?;

    // bash CRLF satir sonlarinda `\r`i komut adinin parcasi sayar; LF'e zorluyoruz.
    write_if_changed(&dir.join("nterminal.sh"), &SH.replace("\r\n", "\n"))?;
    // PowerShell ve cmd her iki bicimi de kabul ediyor; oldugu gibi yaziyoruz.
    write_if_changed(&dir.join("nterminal.ps1"), PS1)?;
    write_if_changed(&dir.join("nterminal.cmd"), CMD)?;

    Ok(Installed { dir })
}

fn write_if_changed(path: &std::path::Path, contents: &str) -> Result<()> {
    if let Ok(existing) = fs::read_to_string(path) {
        if existing == contents {
            return Ok(());
        }
    }
    crate::store::write_atomic(path, contents)
}
