//! Git durumu — blok basligindaki dal rozeti icin.
//!
//! ## Neden `git` cagiriliyor, `.git` klasoru okunmuyor
//!
//! Dal adi `.git/HEAD` dosyasindan bedavaya okunabilir ve ilk tasarim oyleydi.
//! Ama rozette dal adinin yaninda DEGISIKLIK SAYISI da var; onu bulmak calisma
//! agacini indeksle karsilastirmak demek. Bunu elle yapmak git'in kendi
//! kurallarini (`.gitignore`, `assume-unchanged`, alt modul, satir sonu
//! donusumu) yeniden yazmak olurdu ve her biri ayri bir yanlis sonuc kaynagi.
//!
//! Tek bir `git status --porcelain -b` cagrisi ikisini birden veriyor ve
//! cevabi git'in kendisi uretiyor.
//!
//! ## Maliyet
//!
//! Surec baslatmak bedava degil; bu yuzden cagri SEYREK: dizin degistiginde ve
//! komut bittiginde. Her tus vurusunda degil.

use serde::Serialize;
use std::process::Command;

/// Rozette gosterilen tek bir degisiklik.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GitChange {
    /// Porcelain durum harfleri, iki karakter: `" M"`, `"A "`, `"??"`.
    pub status: String,
    /// Depo kokune gore yol.
    pub path: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct GitInfo {
    /// Dal adi; ayrik HEAD'de kisa nesne kimligi.
    pub branch: String,
    /// HEAD bir dala bagli degil (ayrik).
    pub detached: bool,
    pub ahead: u32,
    pub behind: u32,
    pub changes: Vec<GitChange>,
}

/// Listede tutulan en fazla degisiklik.
///
/// Iki yuz satirlik bir liste zaten goz gezdirilmiyor; binlerce dosyalik bir
/// degisiklikte butun yollari arayuze tasimak bos maliyet.
const MAX_CHANGES: usize = 200;

/// `git status --porcelain=v1 -b` ciktisini cozer.
///
/// Ayri ve saf: bicimin butun kose durumlari (ayrik HEAD, ilk commit'ten onceki
/// depo, yeniden adlandirma, ileri/geri sayaci) burada testleniyor. Gercek bir
/// depoda denemek her biri icin ayri bir kurulum isterdi.
pub fn parse_porcelain(text: &str) -> GitInfo {
    let mut info = GitInfo::default();

    for line in text.lines() {
        if let Some(head) = line.strip_prefix("## ") {
            parse_branch_line(head, &mut info);
            continue;
        }
        if line.len() < 4 {
            continue;
        }
        if info.changes.len() >= MAX_CHANGES {
            continue;
        }
        // Bicim: `XY <yol>`. Durum iki karakter, sonra bir bosluk.
        let (status, rest) = line.split_at(2);
        let path = rest.trim_start();
        // Yeniden adlandirma `eski -> yeni` veriyor; ilgilendigimiz yeni ad.
        let path = path.split(" -> ").last().unwrap_or(path);
        info.changes.push(GitChange {
            status: status.to_string(),
            path: path.trim_matches('"').to_string(),
        });
    }

    info
}

fn parse_branch_line(head: &str, info: &mut GitInfo) {
    // Ayrik HEAD: `## HEAD (no branch)`
    if head.starts_with("HEAD (no branch)") {
        info.detached = true;
        info.branch = "HEAD".into();
        return;
    }
    // Ilk commit yok: `## No commits yet on main`
    if let Some(rest) = head.strip_prefix("No commits yet on ") {
        info.branch = rest.trim().to_string();
        return;
    }

    // `main...origin/main [ahead 1, behind 2]`
    let (isim, kalan) = match head.split_once("...") {
        Some((isim, kalan)) => (isim, Some(kalan)),
        None => (head, None),
    };
    info.branch = isim.trim().to_string();

    let Some(kalan) = kalan else { return };
    let Some(start) = kalan.find('[') else { return };
    let Some(end) = kalan.find(']') else { return };
    for parca in kalan[start + 1..end].split(',') {
        let parca = parca.trim();
        if let Some(n) = parca.strip_prefix("ahead ") {
            info.ahead = n.trim().parse().unwrap_or(0);
        } else if let Some(n) = parca.strip_prefix("behind ") {
            info.behind = n.trim().parse().unwrap_or(0);
        }
    }
}

/// Verilen dizinin git durumu; depo degilse ya da git yoksa `None`.
///
/// Hata YUTULUYOR ve bu bilincli: git kurulu olmayabilir, dizin depo
/// olmayabilir, depo bozuk olabilir. Uclunun de dogru karsiligi ayni - rozet
/// gosterilmez. Kullaniciya hata bildirmek burada gurultu olurdu; rozet zaten
/// bir kolaylik, bir sozlesme degil.
pub fn read(path: &str) -> Option<GitInfo> {
    let out = Command::new("git")
        .args([
            "-C",
            path,
            // `--no-optional-locks`: durum sorgusu indeks kilidini TUTMASIN.
            // Bu cagri arka planda ve siklikla kosuyor; kullanicinin ayni anda
            // yazdigi `git commit` kilidi bekleyip takilirdi.
            "--no-optional-locks",
            "status",
            "--porcelain=v1",
            "-b",
            // `normal`: takip edilmeyen bir KLASOR tek satirda bildiriliyor.
            // `all` icindeki her dosyayi tek tek listeliyor ve `node_modules`
            // gibi bir klasorde bu on binlerce satir demek.
            "--untracked-files=normal",
        ])
        .output()
        .ok()?;

    if !out.status.success() {
        return None;
    }
    Some(parse_porcelain(&String::from_utf8_lossy(&out.stdout)))
}

#[cfg(test)]
#[path = "git_tests.rs"]
mod git_tests;
