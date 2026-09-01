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

// --------------------------------------------------------------- .git bulma

/// Gecici bir klasor agaci kurar.
fn temp_tree(name: &str) -> std::path::PathBuf {
    let root = std::env::temp_dir().join(format!("nterm-git-{name}"));
    let _ = std::fs::remove_dir_all(&root);
    std::fs::create_dir_all(&root).unwrap();
    root
}

#[test]
fn git_dir_alt_klasorden_yukari_yuruyor() {
    // Kabuk deponun altinda bir klasorde olabiliyor; imza yine bulunmali.
    let root = temp_tree("walk");
    std::fs::create_dir_all(root.join(".git")).unwrap();
    let derin = root.join("a/b/c");
    std::fs::create_dir_all(&derin).unwrap();

    assert_eq!(git_dir(&derin), Some(root.join(".git")));
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn git_dosyasi_gitdir_yolunu_izliyor() {
    // `git worktree` ve alt modullerde `.git` bir DOSYA ve icinde
    // `gitdir: <yol>` yaziyor. Ele almazsak worktree kullanan biri icin imza
    // hic bulunamaz ve tazeleme sessizce calismaz.
    let root = temp_tree("worktree");
    let gercek = root.join("gercek-git");
    std::fs::create_dir_all(&gercek).unwrap();
    let agac = root.join("agac");
    std::fs::create_dir_all(&agac).unwrap();
    std::fs::write(agac.join(".git"), format!("gitdir: {}\n", gercek.display())).unwrap();

    assert_eq!(git_dir(&agac), Some(gercek));
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn depo_olmayan_klasorde_git_dir_yok() {
    let root = temp_tree("plain");
    assert_eq!(git_dir(&root), None);
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn imza_head_degisince_degisiyor() {
    // Baska bir IDE'den dal degistirmek `HEAD`i yaziyor; imzanin bunu
    // yakalamasi tazelemenin butun dayanagi.
    let root = temp_tree("fp");
    let git = root.join(".git");
    std::fs::create_dir_all(&git).unwrap();
    std::fs::write(git.join("HEAD"), "ref: refs/heads/main\n").unwrap();

    let once = fingerprint(root.to_str().unwrap()).unwrap();
    std::fs::write(git.join("HEAD"), "ref: refs/heads/baska\n").unwrap();
    let sonra = fingerprint(root.to_str().unwrap()).unwrap();

    assert_ne!(once, sonra, "HEAD degisti, imza ayni kaldi");
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn imza_ayni_durumda_ayni() {
    // Degismediyse tam sorgu KOSMAMALI; imzanin kararli olmasi sart.
    let root = temp_tree("fp-stable");
    let git = root.join(".git");
    std::fs::create_dir_all(&git).unwrap();
    std::fs::write(git.join("HEAD"), "ref: refs/heads/main\n").unwrap();

    let a = fingerprint(root.to_str().unwrap());
    let b = fingerprint(root.to_str().unwrap());
    assert_eq!(a, b);
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn depo_olmayan_klasorde_imza_yok() {
    let root = temp_tree("fp-plain");
    assert_eq!(fingerprint(root.to_str().unwrap()), None);
    let _ = std::fs::remove_dir_all(&root);
}

// --------------------------------------------------------- geri alma

// Bu dosyadaki oteki testler salt metin ayristirmasi; asagidakiler GERCEK bir
// depo kuruyor. Sebebi `revert`in yikici olmasi: davranisi metinden degil
// git'in kendisinden okunmali. Ozellikle bir kose durumu kritik - indekste
// olup HEAD'de OLMAYAN dosya SILINMEMELI.

use std::process::Command;

/// Bos bir depo kurar ve yolunu doner.
fn temp_repo(name: &str) -> std::path::PathBuf {
    let root = std::env::temp_dir().join(format!(
        "nterminal-git-{name}-{}-{:?}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    let _ = std::fs::remove_dir_all(&root);
    std::fs::create_dir_all(&root).unwrap();
    git(&root, &["init", "--quiet"]);
    // Commit atabilmek icin kimlik sart; makinede global ayar olmayabilir.
    git(&root, &["config", "user.email", "test@nterminal"]);
    git(&root, &["config", "user.name", "NTerminal Test"]);
    /*
     * Satir sonu cevrimi KAPALI.
     *
     * Git for Windows kurulumu `core.autocrlf=true` birakiyor; o zaman
     * `checkout` dosyayi CRLF ile yaziyor ve icerik karsilastirmasi makinenin
     * git ayarina bagli hale geliyor. Test uygulamanin davranisini olcmeli,
     * kurulumun tercihini degil.
     */
    git(&root, &["config", "core.autocrlf", "false"]);
    root
}

fn git(root: &std::path::Path, args: &[&str]) {
    let out = Command::new("git")
        .current_dir(root)
        .args(args)
        .output()
        .expect("git calistirilamadi");
    assert!(out.status.success(), "git {args:?}: {}", String::from_utf8_lossy(&out.stderr));
}

fn yaz(root: &std::path::Path, ad: &str, icerik: &str) {
    std::fs::write(root.join(ad), icerik).unwrap();
}

fn oku(root: &std::path::Path, ad: &str) -> String {
    std::fs::read_to_string(root.join(ad)).unwrap()
}

#[test]
fn geri_alma_takip_edilen_dosyayi_head_e_donduruyor() {
    let root = temp_repo("revert-tracked");
    let yol = root.to_string_lossy().to_string();
    yaz(&root, "a.txt", "ilk\n");
    git(&root, &["add", "a.txt"]);
    git(&root, &["commit", "--quiet", "-m", "ilk"]);

    yaz(&root, "a.txt", "bozuldu\n");
    revert(&yol, "a.txt", false).unwrap();

    assert_eq!(oku(&root, "a.txt"), "ilk\n", "dosya HEAD'e donmedi");
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn geri_alma_indekslenmis_degisikligi_de_cozuyor() {
    let root = temp_repo("revert-staged");
    let yol = root.to_string_lossy().to_string();
    yaz(&root, "a.txt", "ilk\n");
    git(&root, &["add", "a.txt"]);
    git(&root, &["commit", "--quiet", "-m", "ilk"]);

    // Hem indekste hem calisma agacinda degisiklik.
    yaz(&root, "a.txt", "indekste\n");
    git(&root, &["add", "a.txt"]);
    yaz(&root, "a.txt", "agacta\n");

    revert(&yol, "a.txt", false).unwrap();

    assert_eq!(oku(&root, "a.txt"), "ilk\n");
    let info = read(&yol).expect("depo okunamadi");
    assert!(info.changes.is_empty(), "geri almadan sonra degisiklik kaldi: {:?}", info.changes);
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn geri_alma_yeni_eklenen_dosyayi_silmiyor() {
    /*
     * KOSE DURUM ve bu testin asil sebebi.
     *
     * Dosya indekste ama HEAD'de yok. "HEAD'e dondur" dendiginde silmek
     * teknik olarak tutarli gorunuyor ama kullanicinin yeni yazdigi dosyayi
     * yok etmek demek - geri donusu olmayan bir veri kaybi. Dogru sonuc:
     * indeksten cikar, dosyayi birak. Kullanici gercekten silmek istiyorsa
     * artik takipsiz olarak gorunuyor ve ayri bir onayla silebiliyor.
     */
    let root = temp_repo("revert-added");
    let yol = root.to_string_lossy().to_string();
    yaz(&root, "eski.txt", "x\n");
    git(&root, &["add", "eski.txt"]);
    git(&root, &["commit", "--quiet", "-m", "ilk"]);

    yaz(&root, "yeni.txt", "onemli\n");
    git(&root, &["add", "yeni.txt"]);

    revert(&yol, "yeni.txt", false).unwrap();

    assert!(root.join("yeni.txt").exists(), "yeni dosya SILINDI - veri kaybi");
    assert_eq!(oku(&root, "yeni.txt"), "onemli\n", "icerik degisti");
    let info = read(&yol).expect("depo okunamadi");
    assert!(
        info.changes.iter().any(|c| c.path == "yeni.txt" && c.status.trim() == "??"),
        "dosya takipsiz hale donmedi: {:?}",
        info.changes
    );
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn geri_alma_takipsiz_dosyayi_siliyor() {
    // Takipsiz dosyada geri alinacak bir degisiklik yok; dosyanin kendisi
    // degisiklik. Arayuz bunu ayri bir metinle ve "Sil" dugmesiyle soruyor.
    let root = temp_repo("revert-untracked");
    let yol = root.to_string_lossy().to_string();
    yaz(&root, "a.txt", "x\n");
    git(&root, &["add", "a.txt"]);
    git(&root, &["commit", "--quiet", "-m", "ilk"]);

    yaz(&root, "gecici.txt", "at\n");
    revert(&yol, "gecici.txt", true).unwrap();

    assert!(!root.join("gecici.txt").exists(), "takipsiz dosya silinmedi");
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn geri_alma_klasoru_silmiyor() {
    // Takipsiz bir KLASOR porcelain'de tek satir olarak gorunebiliyor;
    // silmek icindeki her seyi goturur.
    let root = temp_repo("revert-dir");
    let yol = root.to_string_lossy().to_string();
    std::fs::create_dir(root.join("klasor")).unwrap();
    yaz(&root, "klasor/icerik.txt", "onemli\n");

    let sonuc = revert(&yol, "klasor", true);

    assert!(sonuc.is_err(), "klasor silindi");
    assert!(root.join("klasor/icerik.txt").exists());
    let _ = std::fs::remove_dir_all(&root);
}
