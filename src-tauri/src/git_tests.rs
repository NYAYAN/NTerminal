//! `git status --porcelain=v1 -b` cozumleyicisinin kose durumlari.
//!
//! Hepsi gercek bir depoda uretilebilir ama her biri ayri bir kurulum ister
//! (ayrik HEAD, commit'siz depo, uzak dal, yeniden adlandirma). Bicim sabit ve
//! belgelenmis; metin uzerinden test etmek hem hizli hem eksiksiz.

use super::*;

#[test]
fn dal_adi_okunuyor() {
    let info = parse_porcelain("## main\n");
    assert_eq!(info.branch, "main");
    assert!(!info.detached);
    assert_eq!(info.ahead, 0);
    assert_eq!(info.behind, 0);
}

#[test]
fn uzak_dal_adi_dala_karismiyor() {
    // `main...origin/main` iki ad tasiyor; rozete YEREL dal yazilmali.
    let info = parse_porcelain("## main...origin/main\n");
    assert_eq!(info.branch, "main");
}

#[test]
fn ileri_geri_sayaci() {
    let info = parse_porcelain("## main...origin/main [ahead 3, behind 12]\n");
    assert_eq!(info.ahead, 3);
    assert_eq!(info.behind, 12);
}

#[test]
fn yalnizca_ileri() {
    let info = parse_porcelain("## feature/x...origin/feature/x [ahead 1]\n");
    assert_eq!(info.branch, "feature/x");
    assert_eq!(info.ahead, 1);
    assert_eq!(info.behind, 0);
}

#[test]
fn ayrik_head() {
    // Rozet "main" yazamaz: bir dalda degiliz. Yanlis dal adi gostermek,
    // hic gostermemekten kotu.
    let info = parse_porcelain("## HEAD (no branch)\n");
    assert!(info.detached);
    assert_eq!(info.branch, "HEAD");
}

#[test]
fn commit_yokken_dal_adi_geliyor() {
    // Yeni `git init` edilmis depo. Bicim tumden farkli.
    let info = parse_porcelain("## No commits yet on main\n");
    assert_eq!(info.branch, "main");
    assert!(!info.detached);
}

#[test]
fn degisiklikler_durum_harfleriyle() {
    let text = "## main\n M src/a.rs\nA  src/b.rs\n?? yeni.txt\n";
    let info = parse_porcelain(text);
    assert_eq!(info.changes.len(), 3);
    assert_eq!(info.changes[0].status, " M");
    assert_eq!(info.changes[0].path, "src/a.rs");
    assert_eq!(info.changes[1].status, "A ");
    assert_eq!(info.changes[2].status, "??");
    assert_eq!(info.changes[2].path, "yeni.txt");
}

#[test]
fn yeniden_adlandirmada_yeni_ad_aliniyor() {
    // Kullanicinin aradigi dosya YENI adiyla duruyor; eskisini gostermek
    // listede olmayan bir dosyaya bakmasina yol acardi.
    let info = parse_porcelain("## main\nR  eski.rs -> yeni.rs\n");
    assert_eq!(info.changes[0].path, "yeni.rs");
}

#[test]
fn bosluklu_yol_tirnaklarindan_ariniyor() {
    // git bosluk iceren yollari tirnakliyor; rozet listesinde tirnak
    // gostermenin anlami yok.
    let info = parse_porcelain("## main\n M \"bir dosya.txt\"\n");
    assert_eq!(info.changes[0].path, "bir dosya.txt");
}

#[test]
fn liste_sinirlaniyor() {
    // Binlerce dosyalik bir degisiklikte butun yollari arayuze tasimak bos
    // maliyet; iki yuz satir zaten goz gezdirilmiyor.
    let mut text = String::from("## main\n");
    for i in 0..500 {
        text.push_str(&format!(" M dosya{i}.txt\n"));
    }
    assert_eq!(parse_porcelain(&text).changes.len(), MAX_CHANGES);
}

#[test]
fn bos_cikti_cokmuyor() {
    let info = parse_porcelain("");
    assert_eq!(info.branch, "");
    assert!(info.changes.is_empty());
}
