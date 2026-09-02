//! Node surum yoneticisi (nvm) durumu — komut satirinin ustundeki Node rozeti.
//!
//! ## Neden `nvm` cagirilmiyor, klasor okunuyor
//!
//! `nvm list` iki ayri programa cikiyor: Windows'ta bir exe (nvm-windows),
//! Unix'te bir kabuk ISLEVI (nvm.sh) — ikincisi surec olarak hic baslatilamaz,
//! kabugun icine kaynak edilmis olmasi gerekir. Iki yoneticinin cikti bicimi
//! de farkli. Oysa ikisi de surumleri birer KLASOR olarak tutuyor ve
//! kullanilan surumu tek bir yerden isaret ediyor:
//!
//!  * nvm-windows: `%NVM_HOME%\v24.18.0\`, kullanilan surum `%NVM_SYMLINK%`
//!    sembolik baginin hedefi (bag makine geneli; `nvm use` bagi degistiriyor).
//!  * nvm.sh: `$NVM_DIR/versions/node/v24.18.0/`, kullanilan surum
//!    kabuga gore degisiyor; kalici olan `alias/default` dosyasi.
//!
//! Klasor okumak iki-uc dosya sistemi cagrisi ve hicbir surec baslatmiyor; bu
//! yuzden her komut sonunda tazelemek bedava.
//!
//! ## Hata YUTULUYOR
//!
//! nvm kurulu olmayabilir, klasor tasinmis olabilir, bag kirik olabilir.
//! Uclunun de dogru karsiligi ayni: rozet gosterilmez. Git rozetiyle ayni
//! karar (bkz. `git.rs`).

use serde::Serialize;
use std::path::{Path, PathBuf};

/// nvm-windows'un tanimlayici adi; arayuz `use` komutunu buna gore kuruyor.
pub const NVM_WINDOWS: &str = "nvm-windows";
/// nvm.sh (Unix) tanimlayici adi.
pub const NVM_SH: &str = "nvm";

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NodeEnv {
    /// Yonetici: [`NVM_WINDOWS`] ya da [`NVM_SH`].
    pub manager: String,
    /// Kullanilan surum, `v` on eki YOK (`"24.18.0"`); secili surum yoksa `None`.
    pub current: Option<String>,
    /// Kurulu surumler, yeni olan basta. `v` on eki yok.
    pub installed: Vec<String>,
}

/// Makinedeki nvm kurulumunun durumu; nvm yoksa `None`.
///
/// Once nvm-windows deneniyor: `NVM_HOME` ortam degiskeni yalnizca o kurulumda
/// var. Bulunmazsa nvm.sh'in klasoru araniyor.
pub fn read() -> Option<NodeEnv> {
    read_nvm_windows().or_else(read_nvm_sh)
}

// ---------------------------------------------------------------- nvm-windows

/// nvm-windows kurulumu.
///
/// Kok `NVM_HOME` ortam degiskeninden; yoksa yukleyicinin varsayilan yerleri
/// (1.2.x `%LOCALAPPDATA%\nvm`, oncesi `%APPDATA%\nvm`) `settings.txt` ile
/// dogrulanarak deneniyor. Bag `NVM_SYMLINK`ten, yoksa `settings.txt`
/// icindeki `path:` satirindan.
fn read_nvm_windows() -> Option<NodeEnv> {
    let root = std::env::var_os("NVM_HOME")
        .map(PathBuf::from)
        .filter(|p| p.is_dir())
        .or_else(|| {
            [dirs::data_local_dir(), dirs::config_dir()]
                .into_iter()
                .flatten()
                .map(|d| d.join("nvm"))
                .find(|d| d.join("settings.txt").is_file())
        })?;

    let symlink = std::env::var_os("NVM_SYMLINK")
        .map(PathBuf::from)
        .or_else(|| {
            let text = std::fs::read_to_string(root.join("settings.txt")).ok()?;
            settings_symlink(&text).map(PathBuf::from)
        });

    let installed = installed_in(&root);
    // Bag kirik ya da hic yoksa `read_link` hata veriyor: secili surum yok.
    let current = symlink
        .and_then(|link| std::fs::read_link(link).ok())
        .and_then(|target| version_of_dir(&target));

    Some(NodeEnv {
        manager: NVM_WINDOWS.to_string(),
        current,
        installed,
    })
}

/// `settings.txt` icindeki `path: C:\nvm4w\nodejs` satirinin degeri.
pub fn settings_symlink(text: &str) -> Option<String> {
    text.lines().find_map(|line| {
        let (key, value) = line.split_once(':')?;
        (key.trim().eq_ignore_ascii_case("path"))
            .then(|| value.trim())
            .filter(|v| !v.is_empty())
            .map(str::to_string)
    })
}

// --------------------------------------------------------------------- nvm.sh

/// nvm.sh kurulumu: `$NVM_DIR` ya da `~/.nvm`, icinde `versions/node`.
///
/// "Kullanilan" surum burada `alias/default`: nvm.sh'te secim KABUGA OZEL ve
/// disaridan okunamiyor; yeni acilan her kabugun aldigi surum ise bu dosyada.
/// Rozet o yuzden varsayilani gosteriyor ve secici de varsayilani degistiriyor
/// (bkz. arayuzdeki `useNodeCommand`).
fn read_nvm_sh() -> Option<NodeEnv> {
    let root = std::env::var_os("NVM_DIR")
        .map(PathBuf::from)
        .or_else(|| dirs::home_dir().map(|h| h.join(".nvm")))?;
    let versions = root.join("versions").join("node");
    if !versions.is_dir() {
        return None;
    }

    let installed = installed_in(&versions);
    let alias_dir = root.join("alias");
    let read_alias = |name: &str| std::fs::read_to_string(alias_dir.join(name)).ok();
    let current = resolve_alias("default", &installed, &read_alias, 0);

    Some(NodeEnv {
        manager: NVM_SH.to_string(),
        current,
        installed,
    })
}

/// Bir takma adi kurulu bir surume cozer.
///
/// nvm.sh takma adlari ZINCIR: `default` → `lts/*` → `lts/jod` → `v22.11.0`.
/// Her adim bir dosya; dosya bir surum ya da baska bir takma ad iceriyor.
/// `node`/`stable` en yeni kurulu surum. Yarim surum (`22`, `22.11`) o
/// dizideki en yenisi — `nvm use 22` de oyle davraniyor.
///
/// `read_alias` disaridan geliyor ki cozumleme dosya sistemi olmadan
/// testlenebilsin. Derinlik siniri kendine isaret eden bir takma adin sonsuz
/// donguye girmesini engelliyor.
pub fn resolve_alias(
    name: &str,
    installed: &[String],
    read_alias: &dyn Fn(&str) -> Option<String>,
    depth: u8,
) -> Option<String> {
    if depth > 8 {
        return None;
    }
    let name = name.trim();
    if name.is_empty() {
        return None;
    }
    if name == "node" || name == "stable" {
        return installed.first().cloned();
    }
    if let Some(found) = match_installed(name, installed) {
        return Some(found);
    }
    let next = read_alias(name)?;
    resolve_alias(&next, installed, read_alias, depth + 1)
}

/// `22`, `22.11`, `22.11.0` ya da `v22.11.0` → kurulu en yeni eslesen surum.
fn match_installed(name: &str, installed: &[String]) -> Option<String> {
    let want = name.strip_prefix('v').unwrap_or(name);
    let parts: Vec<&str> = want.split('.').collect();
    let numeric = parts
        .iter()
        .all(|p| !p.is_empty() && p.chars().all(|c| c.is_ascii_digit()));
    if parts.is_empty() || parts.len() > 3 || !numeric {
        return None;
    }
    // `installed` yeni once sirali: ilk eslesen en yenisi.
    installed
        .iter()
        .find(|v| {
            let have: Vec<&str> = v.split('.').collect();
            have.len() >= parts.len() && have[..parts.len()] == parts[..]
        })
        .cloned()
}

// ---------------------------------------------------------------------- ortak

/// Bir klasordeki `vX.Y.Z` alt klasorleri, yeni once.
fn installed_in(dir: &Path) -> Vec<String> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let names: Vec<String> = entries
        .flatten()
        .filter(|e| e.path().is_dir())
        .map(|e| e.file_name().to_string_lossy().to_string())
        .collect();
    sort_versions(names)
}

/// `vX.Y.Z` adlarini suzer, `v` on ekini atar ve yeniden eskiye siralar.
///
/// Siralama SAYISAL: metin siralamasi `24.9.0`u `24.18.0`un ustune koyar.
/// Baska adlar (`temp`, `.cache`) listeye girmiyor.
pub fn sort_versions(names: Vec<String>) -> Vec<String> {
    let mut list: Vec<((u64, u64, u64), String)> = names
        .into_iter()
        .filter_map(|n| {
            let bare = n.strip_prefix('v')?;
            parse_version(bare).map(|v| (v, bare.to_string()))
        })
        .collect();
    list.sort_by(|a, b| b.0.cmp(&a.0));
    list.dedup_by(|a, b| a.0 == b.0);
    list.into_iter().map(|(_, s)| s).collect()
}

/// `24.18.0` → `(24, 18, 0)`; eksik ya da sayisal olmayan parca → `None`.
fn parse_version(text: &str) -> Option<(u64, u64, u64)> {
    let mut it = text.split('.');
    let a = it.next()?.parse().ok()?;
    let b = it.next()?.parse().ok()?;
    let c = it.next()?.parse().ok()?;
    if it.next().is_some() {
        return None;
    }
    Some((a, b, c))
}

/// Surum klasorunun yolundan surum: `...\v24.18.0` → `24.18.0`.
///
/// Bag hedefi sonda ayirac tasiyabiliyor; `components()` onu yutuyor.
pub fn version_of_dir(path: &Path) -> Option<String> {
    let name = path.components().next_back()?.as_os_str().to_string_lossy();
    let bare = name.strip_prefix('v')?;
    parse_version(bare).map(|_| bare.to_string())
}

#[cfg(test)]
#[path = "nodever_tests.rs"]
mod nodever_tests;
