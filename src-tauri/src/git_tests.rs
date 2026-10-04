//! `git status --porcelain=v1 -b` cozumleyicisinin kose durumlari.
//!
//! Hepsi gercek bir depoda uretilebilir ama her biri ayri bir kurulum ister
//! (ayrik HEAD, commit'siz depo, uzak dal, yeniden adlandirma). Bicim sabit ve
//! belgelenmis; metin uzerinden test etmek hem hizli hem eksiksiz.

use super::*;
// Yazmanın ret kodları (denetim `files::write_checked`te).
use crate::files::{WRITE_CHANGED, WRITE_NOT_TEXT};

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
fn commit_yokken_depo_dogmamis_isaretleniyor() {
    // Arayuz push'u kapatiyor: gonderilecek bir sey yok.
    assert!(parse_porcelain("## No commits yet on main\n").unborn);
    assert!(!parse_porcelain("## main\n").unborn);
    assert!(!parse_porcelain("## HEAD (no branch)\n").unborn);
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

// ------------------------------------------- alt klasorde calisan kabuk

/*
 * BILDIRILEN HATA: "Degisiklikler kismina gittigimde 'Gosterilecek fark yok'
 * diyor, oysaki var."
 *
 * Kok neden iki git kuralinin ayrisi: `status --porcelain` yollari her zaman
 * depo KOKUNE gore veriyor, `diff -- <yol>` ise pathspec'i BULUNULAN DIZINE
 * gore cozuyor. Kabuk bir alt klasordeyken ikisi tutmuyor ve cikti bos
 * doniyordu. Ayni sebeple `revert` de sessizce hicbir sey yapmiyordu -
 * yikici bir islemin sessizce calismamasi daha kotu, cunku kullanici
 * degisikligin geri alindigini saniyor.
 *
 * Testler ALT KLASORDEN cagiriyor; kokten cagiran testler zaten yukarida ve
 * ikisi birlikte kuraldaki farki tutuyor.
 */

#[test]
fn alt_klasorden_fark_okunabiliyor() {
    let root = temp_repo("diff-subdir");
    std::fs::create_dir_all(root.join("src/derin")).unwrap();
    yaz(&root, "src/derin/a.txt", "ilk\n");
    git(&root, &["add", "."]);
    git(&root, &["commit", "--quiet", "-m", "ilk"]);
    yaz(&root, "src/derin/a.txt", "degisti\n");

    // Kabuk alt klasorde; yol ise porcelain'in verdigi gibi koke gore.
    let alt = root.join("src").to_string_lossy().to_string();
    let text = diff(&alt, "src/derin/a.txt", false).expect("fark alinamadi");

    assert!(text.contains("degisti"), "alt klasorden fark bos dondu:\n{text}");
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn alt_klasorden_geri_alma_calisiyor() {
    let root = temp_repo("revert-subdir");
    std::fs::create_dir_all(root.join("src")).unwrap();
    yaz(&root, "src/a.txt", "ilk\n");
    git(&root, &["add", "."]);
    git(&root, &["commit", "--quiet", "-m", "ilk"]);
    yaz(&root, "src/a.txt", "bozuldu\n");

    let alt = root.join("src").to_string_lossy().to_string();
    revert(&alt, "src/a.txt", false).unwrap();

    assert_eq!(oku(&root, "src/a.txt"), "ilk\n", "alt klasorden geri alma calismadi");
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn durum_deponun_kokunu_bildiriyor() {
    // Arayuz "dosyayi ac" icin tam yol kuruyor; kokU bilmezse kabugun
    // bulundugu dizinle birlestirip var olmayan bir yol uretiyor.
    let root = temp_repo("root-report");
    std::fs::create_dir_all(root.join("src")).unwrap();
    yaz(&root, "src/a.txt", "ilk\n");

    let alt = root.join("src").to_string_lossy().to_string();
    let info = read(&alt).expect("depo okunamadi");

    let bildirilen = std::fs::canonicalize(&info.root).unwrap();
    assert_eq!(bildirilen, std::fs::canonicalize(&root).unwrap());
    let _ = std::fs::remove_dir_all(&root);
}

// ---- Dal listesi (`for-each-ref` ciktisi) ----

fn yerel(name: &str) -> GitBranch {
    GitBranch {
        name: name.into(),
        remote: None,
    }
}

fn uzak(remote: &str, name: &str) -> GitBranch {
    GitBranch {
        name: name.into(),
        remote: Some(remote.into()),
    }
}

#[test]
fn fetch_ile_gelen_uzak_dal_listede() {
    // Bildirilen hata: `git fetch` sonrasi yeni dal seciciye gelmiyordu -
    // liste yalnizca `refs/heads/` okuyordu.
    let text = "refs/remotes/origin/yeni-ozellik\t\nrefs/heads/main\t\n";
    assert_eq!(
        parse_refs(text),
        vec![uzak("origin", "yeni-ozellik"), yerel("main")]
    );
}

#[test]
fn yerel_dali_olan_uzak_dal_tekrar_gorunmuyor() {
    // `main` ile `origin/main` ayni yere gidiyor; iki satir "hangisi?" sorar.
    let text = "refs/heads/main\t\nrefs/remotes/origin/main\t\nrefs/remotes/origin/dev\t\n";
    assert_eq!(parse_refs(text), vec![yerel("main"), uzak("origin", "dev")]);
}

#[test]
fn yerel_dal_uzaktan_sonra_gelse_de_uzak_kopya_dusuyor() {
    // Sira committerdate ile: uzak kopya once gelebilir. Tekillestirme siraya
    // bagli olmamali.
    let text = "refs/remotes/origin/main\t\nrefs/heads/main\t\n";
    assert_eq!(parse_refs(text), vec![yerel("main")]);
}

#[test]
fn origin_head_isaretcisi_dal_degil() {
    let text = "refs/remotes/origin/HEAD\trefs/remotes/origin/main\nrefs/remotes/origin/main\t\n";
    assert_eq!(parse_refs(text), vec![uzak("origin", "main")]);
}

#[test]
fn egik_cizgili_dal_adi_uzakta_bolunmuyor() {
    // `feature/x`in uzak adi `origin`, dal adi `feature/x`; ilk `/`den sonrasi
    // bir butun.
    let text = "refs/remotes/origin/feature/x\t\n";
    assert_eq!(parse_refs(text), vec![uzak("origin", "feature/x")]);
}

#[test]
fn windows_satir_sonu_ve_bos_satir_zarar_vermiyor() {
    let text = "refs/heads/main\t\r\n\r\nrefs/heads/dev\t\r\n";
    assert_eq!(parse_refs(text), vec![yerel("main"), yerel("dev")]);
}

/// Iki asamali okuma: `remotes: false` uzak ref'lere hic bakmiyor.
///
/// Secici once bu listeyi ciziyor ve "yerel dallar" diye sunuyor; icine uzak
/// bir dal karissaydi bolumun disinda, basliksiz gorunurdu. Uzak izleme dali
/// agsiz kuruluyor: `update-ref`, `git fetch`in biraktigi ref'in aynisi.
#[test]
fn yerel_okuma_uzak_dallari_getirmiyor() {
    let root = repo_bir_commitli("dallar-yerel");
    git(&root, &["branch", "-M", "main"]);
    git(&root, &["update-ref", "refs/remotes/origin/yeni-ozellik", "HEAD"]);
    let yol = root.to_string_lossy();

    assert_eq!(branches(&yol, false), vec![yerel("main")]);
    assert_eq!(
        branches(&yol, true),
        vec![yerel("main"), uzak("origin", "yeni-ozellik")]
    );
    let _ = std::fs::remove_dir_all(&root);
}

// ------------------------------------- yukari akis ve sahnelenen dosya sayisi

#[test]
fn yukari_akis_adi_okunuyor() {
    let info = parse_porcelain("## main...origin/main\n");
    assert_eq!(info.upstream.as_deref(), Some("origin/main"));
}

#[test]
fn yukari_akis_sayaclarla_birlikte_okunuyor() {
    // Ad `[`ten ONCEKI kisim; sayac ayni satirda ama ayri bir parca.
    let info = parse_porcelain("## feature/x...origin/feature/x [ahead 1, behind 2]\n");
    assert_eq!(info.upstream.as_deref(), Some("origin/feature/x"));
    assert_eq!((info.ahead, info.behind), (1, 2));
}

#[test]
fn yukari_akisi_olmayan_dalda_yok() {
    // Yeni dal: `## ozellik`. Arayuz bu durumda "Yayinla" diyor.
    assert_eq!(parse_porcelain("## ozellik\n").upstream, None);
}

#[test]
fn silinmis_yukari_akis_yok_sayiliyor() {
    /*
     * `[gone]`: uzak dal birlestirilip silinmis (GitHub'in "dali otomatik sil"i).
     * Ad hala satirda yaziyor ama uzakta artik yok. `git push` icin dogru olan
     * "yukari akis yok" gibi davranmak: silinmis bir dala gonderilmez, dal
     * yeniden olusturulur. Sayaclar da 0 - karsilastirilacak bir sey kalmadi.
     */
    let info = parse_porcelain("## ozellik...origin/ozellik [gone]\n");
    assert_eq!(info.upstream, None);
    assert_eq!((info.ahead, info.behind), (0, 0));
}

#[test]
fn ayrik_head_ve_ilk_commit_yukari_akissiz() {
    assert_eq!(parse_porcelain("## HEAD (no branch)\n").upstream, None);
    assert_eq!(parse_porcelain("## No commits yet on main\n").upstream, None);
}

#[test]
fn sahnelenen_sayisi_indeks_harfinden_geliyor() {
    // Ilk harf INDEKS tarafi. `??`, ` M` ve ` D` commit'e girmeyecek.
    let text = "## main\nM  a\nA  b\nD  c\nR  d -> e\n M f\n D g\n?? h\nMM i\n";
    let info = parse_porcelain(text);
    // M, A, D, R ve MM: bes dosya.
    assert_eq!(info.staged, 5);
}

#[test]
fn cakisma_sahnelenmis_sayilmiyor() {
    // Git, cakisma varken commit'i reddediyor; "commit'e hazir" saymak yalan.
    let info = parse_porcelain("## main\nUU a\nAA b\nDD c\nAU d\nUD e\nUA f\nDU g\n");
    assert_eq!(info.staged, 0);
}

#[test]
fn sahnelenen_sayisi_liste_kesilse_de_kesilmiyor() {
    // Commit dugmesi "kac dosya commit'lenecek" sorusunu yanitliyor; cevap
    // listenin gorunen kismina bagli olmamali.
    let mut text = String::from("## main\n");
    for i in 0..500 {
        text.push_str(&format!("M  dosya{i}.txt\n"));
    }
    let info = parse_porcelain(&text);
    assert_eq!(info.changes.len(), MAX_CHANGES);
    assert_eq!(info.staged, 500);
}

#[test]
fn yeniden_adlandirmada_eski_yol_da_geliyor() {
    let info = parse_porcelain("## main\nR  eski.rs -> yeni.rs\n");
    assert_eq!(info.changes[0].path, "yeni.rs");
    assert_eq!(info.changes[0].orig_path.as_deref(), Some("eski.rs"));
}

#[test]
fn tirnakli_yeniden_adlandirmada_iki_yan_da_ariniyor() {
    let info = parse_porcelain("## main\nR  \"eski ad.rs\" -> \"yeni ad.rs\"\n");
    assert_eq!(info.changes[0].path, "yeni ad.rs");
    assert_eq!(info.changes[0].orig_path.as_deref(), Some("eski ad.rs"));
}

#[test]
fn ok_isaretli_ad_yalnizca_yeniden_adlandirmada_bolunuyor() {
    // ` M` durumundaki dosya "a -> b.txt" adli olabilir (tirnakli gelir); ayirici
    // tirnagin ICINDE, bolunurse yol bozulur.
    let info = parse_porcelain("## main\n M \"a -> b.txt\"\n");
    assert_eq!(info.changes[0].path, "a -> b.txt");
    assert_eq!(info.changes[0].orig_path, None);
}

#[test]
fn json_alanlari_arayuzun_bekledigi_adlarda() {
    let info = parse_porcelain("## main...origin/main [ahead 1]\nM  a.rs\nR  eski -> yeni\n");
    let json = serde_json::to_value(&info).unwrap();
    assert_eq!(json["upstream"], "origin/main");
    assert_eq!(json["staged"], 2);
    assert_eq!(json["unborn"], false);
    assert_eq!(json["changes"][1]["origPath"], "eski");
}

#[test]
fn eski_yol_yoksa_json_a_hic_yazilmiyor() {
    // Arayuzdeki tip `origPath?: string`; `null` gonderilse `?? ` denetimleri
    // ile karisirdi. Alan yoksa yok.
    let info = parse_porcelain("## main\n M a.rs\n");
    let json = serde_json::to_string(&info.changes[0]).unwrap();
    assert!(!json.contains("origPath"), "{json}");
}

// ------------------------------------------------------- uzak depo secimi

fn adlar(liste: &[&str]) -> Vec<String> {
    liste.iter().map(|s| s.to_string()).collect()
}

#[test]
fn origin_varsa_origin_seciliyor() {
    assert_eq!(choose_remote(&adlar(&["fork", "origin"])).unwrap(), "origin");
}

#[test]
fn tek_uzak_varsa_o_seciliyor() {
    assert_eq!(choose_remote(&adlar(&["fork"])).unwrap(), "fork");
}

#[test]
fn uzak_yoksa_hata() {
    assert!(choose_remote(&[]).unwrap_err().contains("uzak depo"));
}

#[test]
fn cok_uzak_ve_origin_yoksa_tahmin_edilmiyor() {
    // Yanlis bir uzaga yayinlanan dali geri almak zahmetli; sormak bir hata metni.
    let hata = choose_remote(&adlar(&["a", "b"])).unwrap_err();
    assert!(hata.contains("a, b"), "{hata}");
}

// ------------------------------------------------------- hata metni

fn cikti(stdout: &str, stderr: &str) -> std::process::Output {
    // Gecerli bir `ExitStatus` uretmenin platformdan bagimsiz tek yolu gercek
    // bir komut kosturmak; metinleri sonra degistiriyoruz.
    let mut out = Command::new("git").arg("--version").output().expect("git calistirilamadi");
    out.stdout = stdout.as_bytes().to_vec();
    out.stderr = stderr.as_bytes().to_vec();
    out
}

#[test]
fn hata_metni_stderr_ve_stdout_birlestiriyor() {
    // `git commit` "commit edilecek bir sey yok" iletisini STDOUT'a yaziyor,
    // bir kanca ise stderr'e. Ikisi de kullaniciya ulasmali.
    let text = failure_text(&cikti("stdout metni\n", "stderr metni\n"));
    assert!(text.contains("stderr metni") && text.contains("stdout metni"), "{text}");
}

#[test]
fn yalnizca_stdout_dolu_olan_hata_bos_kalmiyor() {
    // OLCULEN: `git commit` sahnelenmis bir sey yokken cikis 1, stderr BOS,
    // aciklama stdout'ta.
    let text = failure_text(&cikti("nothing to commit\n", ""));
    assert_eq!(text, "nothing to commit");
}

#[test]
fn hata_metni_sinirli_ve_karakter_sinirinda_kesiliyor() {
    // Cok baytli harflerle: bayt sinirinda kesmek panikletirdi.
    let uzun = "\u{15f}".repeat(MAX_ERROR_CHARS * 2);
    let text = failure_text(&cikti("", &uzun));
    assert!(text.ends_with("..."));
    assert_eq!(text.chars().count(), MAX_ERROR_CHARS + 3);
}

#[test]
fn metinsiz_basarisizlik_cikis_durumunu_yaziyor() {
    let text = failure_text(&cikti("", ""));
    assert!(text.starts_with("git basarisiz oldu"), "{text}");
}

// ------------------------------------------------------ gercek depoda yazma

// Asagidakiler GERCEK bir depo kuruyor, ayni sebeple `revert` testleri gibi:
// davranis metinden degil git'in kendisinden okunmali. Ozellikle bir dosyanin
// hangi harfle gorundugu, `unstage`in neyi geri aldigi ve `push`in uzakta ne
// biraktigi git'in yanitiyla sabit.

fn git_out(root: &std::path::Path, args: &[&str]) -> String {
    let out = Command::new("git")
        .current_dir(root)
        .args(args)
        .output()
        .expect("git calistirilamadi");
    assert!(out.status.success(), "git {args:?}: {}", String::from_utf8_lossy(&out.stderr));
    String::from_utf8_lossy(&out.stdout).trim().to_string()
}

fn yol_of(root: &std::path::Path) -> String {
    root.to_string_lossy().to_string()
}

/// Bir dosyanin porcelain durumu; listede yoksa `None`.
fn durum_of(root: &std::path::Path, dosya: &str) -> Option<String> {
    read(&yol_of(root))
        .expect("depo okunamadi")
        .changes
        .into_iter()
        .find(|c| c.path == dosya)
        .map(|c| c.status)
}

fn liste(dosyalar: &[&str]) -> Vec<String> {
    dosyalar.iter().map(|s| s.to_string()).collect()
}

/// Bir commit'i olan depo.
fn repo_bir_commitli(name: &str) -> std::path::PathBuf {
    let root = temp_repo(name);
    yaz(&root, "a.txt", "ilk\n");
    git(&root, &["add", "a.txt"]);
    git(&root, &["commit", "--quiet", "-m", "ilk"]);
    root
}

#[test]
fn degisen_dosya_sahneleniyor() {
    let root = repo_bir_commitli("stage-mod");
    yaz(&root, "a.txt", "degisti\n");
    assert_eq!(durum_of(&root, "a.txt").as_deref(), Some(" M"));

    stage(&yol_of(&root), &liste(&["a.txt"])).unwrap();

    assert_eq!(durum_of(&root, "a.txt").as_deref(), Some("M "));
    assert_eq!(read(&yol_of(&root)).unwrap().staged, 1);
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn takipsiz_dosya_sahneleniyor() {
    let root = repo_bir_commitli("stage-new");
    yaz(&root, "yeni.txt", "x\n");

    stage(&yol_of(&root), &liste(&["yeni.txt"])).unwrap();

    assert_eq!(durum_of(&root, "yeni.txt").as_deref(), Some("A "));
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn silinmis_dosyanin_sahnelenmesi_silmeyi_kaydediyor() {
    // `git add -- <silinmis yol>` silmeyi indekse yaziyor (olculdu). Bu olmasa
    // silinen bir dosya panelde isaretlenir ama commit'e hic girmezdi.
    let root = repo_bir_commitli("stage-del");
    std::fs::remove_file(root.join("a.txt")).unwrap();
    assert_eq!(durum_of(&root, "a.txt").as_deref(), Some(" D"));

    stage(&yol_of(&root), &liste(&["a.txt"])).unwrap();

    assert_eq!(durum_of(&root, "a.txt").as_deref(), Some("D "));
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn turkce_adli_dosya_listeden_alinip_sahnelenebiliyor() {
    /*
     * OLCULEN HATA: git varsayilanda ASCII disi yollari sekizlik kacisla
     * veriyor (`"\303\247al..."`) ve durum ayristirici yalnizca cevre
     * tirnaklarini atiyordu. Yol o haliyle `git add`e verilince "pathspec did
     * not match any files" - Turkce adli her dosya listede gorunuyor ama
     * uzerinde hicbir islem yapilamiyordu.
     *
     * Test tam yolculugu deniyor: listeden okunan yol dogrudan `stage`e gidiyor.
     */
    let root = repo_bir_commitli("stage-turkce");
    let ad = "\u{e7}al\u{131}\u{15f}t\u{131}r.md";
    yaz(&root, ad, "x\n");

    let okunan = read(&yol_of(&root)).unwrap();
    let yol = okunan
        .changes
        .iter()
        .find(|c| c.path.contains("t\u{131}r") || c.path.contains("303"))
        .expect("dosya listede yok")
        .path
        .clone();
    assert_eq!(yol, ad, "yol kacisli geldi: {yol}");

    stage(&yol_of(&root), &[yol]).unwrap();

    assert_eq!(durum_of(&root, ad).as_deref(), Some("A "));
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn kose_parantezli_ad_baska_dosyayi_surukleyip_goturmuyor() {
    /*
     * OLCULDU: varsayilan pathspec ile `git add -- "[a].txt"` `[a].txt` ile
     * BIRLIKTE `a.txt`yi de ekliyor (`[a]` bir karakter sinifi). `stage`
     * `--literal-pathspecs` ile calisiyor: yol bir dosya adi, desen degil.
     */
    let root = repo_bir_commitli("stage-literal");
    yaz(&root, "b.txt", "1\n");
    yaz(&root, "[b].txt", "2\n");

    stage(&yol_of(&root), &liste(&["[b].txt"])).unwrap();

    assert_eq!(durum_of(&root, "[b].txt").as_deref(), Some("A "));
    assert_eq!(
        durum_of(&root, "b.txt").as_deref(),
        Some("??"),
        "desen baska bir dosyayi da sahneledi"
    );
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn alt_klasorden_sahnelenip_cikarilabiliyor() {
    // Yollar porcelain'den KOKE gore geliyor; kabuk alt klasordeyken `-C alt`
    // yanlis dosyayi ararm (bkz. `work_dir`).
    let root = repo_bir_commitli("stage-subdir");
    // `src/` TAKIPLI olmali: takipsiz bir klasor porcelain'de `?? src/` diye TEK
    // satir olarak gorunur (`--untracked-files=normal`), icindeki dosya ayri
    // satir olmaz ve asagidaki `??` denetimi hic bir sey bulamazdi.
    std::fs::create_dir_all(root.join("src")).unwrap();
    yaz(&root, "src/var.txt", "x\n");
    git(&root, &["add", "src/var.txt"]);
    git(&root, &["commit", "--quiet", "-m", "src klasoru"]);
    yaz(&root, "src/yeni.txt", "x\n");
    let alt = root.join("src").to_string_lossy().to_string();

    stage(&alt, &liste(&["src/yeni.txt"])).unwrap();
    assert_eq!(durum_of(&root, "src/yeni.txt").as_deref(), Some("A "));

    unstage(&alt, &liste(&["src/yeni.txt"])).unwrap();
    assert_eq!(durum_of(&root, "src/yeni.txt").as_deref(), Some("??"));
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn sahnelenen_dosya_indeksten_cikiyor_icerigi_duruyor() {
    let root = repo_bir_commitli("unstage-mod");
    yaz(&root, "a.txt", "degisti\n");
    git(&root, &["add", "a.txt"]);
    assert_eq!(durum_of(&root, "a.txt").as_deref(), Some("M "));

    unstage(&yol_of(&root), &liste(&["a.txt"])).unwrap();

    assert_eq!(durum_of(&root, "a.txt").as_deref(), Some(" M"));
    // Indeksten cikarmak dosyayi ESKI haline dondurmek DEGIL.
    assert_eq!(oku(&root, "a.txt"), "degisti\n", "calisma agaci degisti");
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn ilk_commit_yokken_de_indeksten_cikarilabiliyor() {
    // OLCULDU: `restore --staged` burada "could not resolve HEAD" ile dusuyor.
    let root = temp_repo("unstage-unborn");
    yaz(&root, "a.txt", "x\n");
    git(&root, &["add", "a.txt"]);
    assert_eq!(durum_of(&root, "a.txt").as_deref(), Some("A "));

    unstage(&yol_of(&root), &liste(&["a.txt"])).unwrap();

    assert_eq!(durum_of(&root, "a.txt").as_deref(), Some("??"));
    assert!(root.join("a.txt").exists());
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn yeniden_adlandirma_iki_yolla_birlikte_cikarilinca_ayrisiyor() {
    let root = repo_bir_commitli("unstage-rename");
    git(&root, &["mv", "a.txt", "b.txt"]);
    let bilgi = read(&yol_of(&root)).unwrap();
    let degisiklik = &bilgi.changes[0];
    assert_eq!(degisiklik.status, "R ");
    assert_eq!(degisiklik.orig_path.as_deref(), Some("a.txt"));

    let mut yollar = vec![degisiklik.orig_path.clone().unwrap()];
    yollar.push(degisiklik.path.clone());
    unstage(&yol_of(&root), &yollar).unwrap();

    // Ikisi de sahnelenmemis: eski ad silinmis, yeni ad takipsiz.
    assert_eq!(durum_of(&root, "a.txt").as_deref(), Some(" D"));
    assert_eq!(durum_of(&root, "b.txt").as_deref(), Some("??"));
    assert_eq!(read(&yol_of(&root)).unwrap().staged, 0);
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn yalniz_yeni_adi_cikarmak_eski_adin_silindi_kaydini_birakiyor() {
    /*
     * `orig_path`in var olma sebebi bu (OLCULDU): yeniden adlandirmada yalnizca
     * YENI yolu cikarmak eski adin "silindi" kaydini indekste birakiyor. Kullanici
     * kutuyu kaldirdigi halde commit'e bir silme girmeye devam ederdi.
     */
    let root = repo_bir_commitli("unstage-rename-half");
    git(&root, &["mv", "a.txt", "b.txt"]);

    unstage(&yol_of(&root), &liste(&["b.txt"])).unwrap();

    assert_eq!(durum_of(&root, "a.txt").as_deref(), Some("D "), "silme indekste kalmadi");
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn bos_yol_listesi_hata_degil() {
    let root = repo_bir_commitli("stage-empty");
    assert!(stage(&yol_of(&root), &[]).is_ok());
    assert!(unstage(&yol_of(&root), &[]).is_ok());
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn olmayan_yol_git_iletisiyle_hata_donuyor() {
    let root = repo_bir_commitli("stage-missing");
    let hata = stage(&yol_of(&root), &liste(&["yok.txt"])).unwrap_err();
    assert!(!hata.is_empty());
    assert!(!hata.starts_with("git basarisiz oldu"), "git'in metni yutuldu: {hata}");
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn es_zamanli_sahneleme_kilit_yuzunden_dusmuyor() {
    /*
     * Iki `git add` ayni anda baslarsa ikincisi `index.lock` yuzunden dusuyor.
     * Kullanici kutulari art arda isaretleyince bu gercek bir yaris; `INDEX_LOCK`
     * islemleri siraya diziyor.
     */
    let root = repo_bir_commitli("stage-race");
    let mut adlar_ = Vec::new();
    for i in 0..8 {
        let ad = format!("d{i}.txt");
        yaz(&root, &ad, "x\n");
        adlar_.push(ad);
    }
    let yol = yol_of(&root);

    let isler: Vec<_> = adlar_
        .iter()
        .cloned()
        .map(|ad| {
            let yol = yol.clone();
            std::thread::spawn(move || stage(&yol, &[ad]))
        })
        .collect();
    for is in isler {
        is.join().unwrap().expect("es zamanli sahneleme dustu");
    }

    assert_eq!(read(&yol).unwrap().staged, 8);
    let _ = std::fs::remove_dir_all(&root);
}

// ------------------------------------------------------------------ commit

#[test]
fn commit_yalnizca_sahnelenenleri_aliyor() {
    // `-a` yok: panelin kutulari tam olarak bunu gosteriyor. Isaretlenmemis
    // bir dosyanin commit'e girmesi "secmedigim dosya gitti" demek.
    let root = repo_bir_commitli("commit-only-staged");
    yaz(&root, "b.txt", "1\n");
    git(&root, &["add", "b.txt"]);
    git(&root, &["commit", "--quiet", "-m", "ikinci"]);
    yaz(&root, "a.txt", "secili\n");
    yaz(&root, "b.txt", "secili-degil\n");
    git(&root, &["add", "a.txt"]);

    commit(&yol_of(&root), "sadece a").unwrap();

    assert_eq!(git_out(&root, &["show", "--name-only", "--format=", "HEAD"]), "a.txt");
    assert_eq!(durum_of(&root, "b.txt").as_deref(), Some(" M"), "sahnelenmemis dosya gitti");
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn commit_kisa_kimligi_donuyor() {
    let root = repo_bir_commitli("commit-hash");
    yaz(&root, "a.txt", "degisti\n");
    git(&root, &["add", "a.txt"]);

    let kimlik = commit(&yol_of(&root), "ikinci").unwrap();

    assert_eq!(kimlik, git_out(&root, &["rev-parse", "--short", "HEAD"]));
    assert!(kimlik.len() >= 7 && kimlik.chars().all(|c| c.is_ascii_hexdigit()), "{kimlik}");
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn ilk_commit_de_atilabiliyor() {
    let root = temp_repo("commit-first");
    yaz(&root, "a.txt", "x\n");
    git(&root, &["add", "a.txt"]);

    commit(&yol_of(&root), "ilk").unwrap();

    assert_eq!(git_out(&root, &["log", "--format=%s"]), "ilk");
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn commit_iletisi_cok_satirli_ve_tireyle_baslayabiliyor() {
    // `-m` argumani; iletinin ilk karakteri `-` olsa da secenek sanilmamali.
    let root = repo_bir_commitli("commit-multiline");
    yaz(&root, "a.txt", "degisti\n");
    git(&root, &["add", "a.txt"]);

    commit(&yol_of(&root), "-tire ile basliyor\n\ngovde satiri").unwrap();

    assert_eq!(git_out(&root, &["log", "-1", "--format=%s"]), "-tire ile basliyor");
    assert_eq!(git_out(&root, &["log", "-1", "--format=%b"]), "govde satiri");
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn bos_ileti_commit_atmiyor() {
    let root = repo_bir_commitli("commit-empty");
    yaz(&root, "a.txt", "degisti\n");
    git(&root, &["add", "a.txt"]);
    let once = git_out(&root, &["rev-parse", "HEAD"]);

    assert!(commit(&yol_of(&root), "  \n ").is_err());

    assert_eq!(git_out(&root, &["rev-parse", "HEAD"]), once);
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn sahnelenmis_bir_sey_yokken_git_in_iletisi_gorunuyor() {
    /*
     * OLCULDU: bu durumda git cikis 1 ile doner, stderr BOS, aciklama
     * STDOUT'ta. Yalnizca stderr'e bakan bir uygulama kullaniciya bos bir hata
     * kutusu gosterirdi.
     *
     * Metnin KENDISINE bakmiyoruz (kullanicinin git'i baska dilde konusuyor
     * olabilir): onemli olan bos olmamasi ve genel yedek metne dusmemesi.
     */
    let root = repo_bir_commitli("commit-nothing");

    let hata = commit(&yol_of(&root), "bos").unwrap_err();

    assert!(!hata.is_empty());
    assert!(!hata.starts_with("git basarisiz oldu"), "stdout'taki aciklama yutuldu: {hata}");
    let _ = std::fs::remove_dir_all(&root);
}

#[cfg(unix)]
#[test]
fn basarisiz_kancanin_ciktisi_hatada_gorunuyor() {
    /*
     * Kancalar ATLANMIYOR (`--no-verify` yok): onlari kullanici koymus. Bir
     * kanca (lint, test) reddedince kullanicinin bilmesi gereken sey kancanin
     * yazdigi cumle; commit de atilmamis olmali.
     */
    use std::os::unix::fs::PermissionsExt;
    let root = repo_bir_commitli("commit-hook");
    let kanca = root.join(".git/hooks/pre-commit");
    std::fs::write(&kanca, "#!/bin/sh\necho 'kanca-reddetti' >&2\nexit 1\n").unwrap();
    std::fs::set_permissions(&kanca, std::fs::Permissions::from_mode(0o755)).unwrap();
    yaz(&root, "a.txt", "degisti\n");
    git(&root, &["add", "a.txt"]);
    let once = git_out(&root, &["rev-parse", "HEAD"]);

    let hata = commit(&yol_of(&root), "kancali").unwrap_err();

    assert!(hata.contains("kanca-reddetti"), "kancanin ciktisi yok: {hata}");
    assert_eq!(git_out(&root, &["rev-parse", "HEAD"]), once, "kanca reddettigi halde commit atildi");
    let _ = std::fs::remove_dir_all(&root);
}

// -------------------------------------------------------------------- push

/// Bos bir `bare` uzak depo.
fn temp_remote(name: &str) -> std::path::PathBuf {
    let root = std::env::temp_dir().join(format!(
        "nterminal-git-remote-{name}-{}-{:?}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    let _ = std::fs::remove_dir_all(&root);
    std::fs::create_dir_all(&root).unwrap();
    git(&root, &["init", "--bare", "--quiet"]);
    root
}

/// Uzakta bir ref'in gosterdigi commit; ref yoksa `None`.
fn uzakta(uzak: &std::path::Path, ref_adi: &str) -> Option<String> {
    let out = Command::new("git")
        .arg("--git-dir")
        .arg(uzak)
        .args(["rev-parse", "--verify", "-q", ref_adi])
        .output()
        .expect("git calistirilamadi");
    out.status
        .success()
        .then(|| String::from_utf8_lossy(&out.stdout).trim().to_string())
}

fn dal_of(root: &std::path::Path) -> String {
    git_out(root, &["symbolic-ref", "--short", "HEAD"])
}

/// Bir commit'i olan depo ve `origin` olarak bagli bos bir uzak.
fn repo_ve_uzak(name: &str) -> (std::path::PathBuf, std::path::PathBuf) {
    let root = repo_bir_commitli(name);
    let uzak = temp_remote(name);
    git(&root, &["remote", "add", "origin", &uzak.to_string_lossy()]);
    (root, uzak)
}

fn yeni_commit(root: &std::path::Path, icerik: &str) {
    yaz(root, "a.txt", icerik);
    git(root, &["commit", "--quiet", "-am", icerik.trim()]);
}

#[test]
fn yeni_dal_yayinlaniyor_ve_izleme_kuruluyor() {
    let (root, uzak) = repo_ve_uzak("push-publish");
    let dal = dal_of(&root);
    assert_eq!(read(&yol_of(&root)).unwrap().upstream, None);

    let hedef = push(&yol_of(&root)).unwrap();

    assert_eq!(hedef, format!("origin/{dal}"));
    assert_eq!(
        uzakta(&uzak, &format!("refs/heads/{dal}")),
        Some(git_out(&root, &["rev-parse", "HEAD"])),
        "dal uzakta olusmadi"
    );
    // `-u` izlemeyi kurdu: artik yukari akisi var ve ileride degil.
    let bilgi = read(&yol_of(&root)).unwrap();
    assert_eq!(bilgi.upstream, Some(format!("origin/{dal}")));
    assert_eq!(bilgi.ahead, 0);
    let _ = std::fs::remove_dir_all(&root);
    let _ = std::fs::remove_dir_all(&uzak);
}

#[test]
fn yukari_akisi_olan_dal_yalin_push_ile_gidiyor() {
    let (root, uzak) = repo_ve_uzak("push-plain");
    push(&yol_of(&root)).unwrap();
    yeni_commit(&root, "ikinci\n");
    assert_eq!(read(&yol_of(&root)).unwrap().ahead, 1);

    let hedef = push(&yol_of(&root)).unwrap();

    let dal = dal_of(&root);
    assert_eq!(hedef, format!("origin/{dal}"));
    assert_eq!(
        uzakta(&uzak, &format!("refs/heads/{dal}")),
        Some(git_out(&root, &["rev-parse", "HEAD"]))
    );
    assert_eq!(read(&yol_of(&root)).unwrap().ahead, 0);
    let _ = std::fs::remove_dir_all(&root);
    let _ = std::fs::remove_dir_all(&uzak);
}

#[test]
fn etiketler_yapilandirma_istese_bile_gitmiyor() {
    /*
     * OLCULDU: `push.followTags=true` iken yalin `git push` yerelde duran
     * ACIKLAMALI etiketi de uzaga itiyor. Bu depoda etiket itmek YAYIN demek ve
     * yerelde uzaga gitmemesi gereken bir yedek etiketi duruyor; `--no-follow-tags`
     * bunu yapilandirmaya ragmen engelliyor.
     *
     * Iki yol da deneniyor: yayinlama (`-u`) ve yalin push.
     */
    let (root, uzak) = repo_ve_uzak("push-tags");
    git(&root, &["config", "push.followTags", "true"]);
    git(&root, &["tag", "-a", "yedek-bir", "-m", "yedek"]);

    push(&yol_of(&root)).unwrap();
    assert_eq!(git_out(&uzak, &["tag", "--list"]), "", "yayinlama etiketi itti");

    yeni_commit(&root, "ikinci\n");
    git(&root, &["tag", "-a", "yedek-iki", "-m", "yedek"]);
    push(&yol_of(&root)).unwrap();
    assert_eq!(git_out(&uzak, &["tag", "--list"]), "", "yalin push etiketi itti");
    let _ = std::fs::remove_dir_all(&root);
    let _ = std::fs::remove_dir_all(&uzak);
}

#[test]
fn reddedilen_push_git_iletisiyle_donuyor_uzak_degismiyor() {
    // Uzak baska yerden ilerlemis: push reddedilir. Zorla itme YOK; metin
    // oldugu gibi kullaniciya gidiyor, karar terminalde.
    let (root, uzak) = repo_ve_uzak("push-rejected");
    push(&yol_of(&root)).unwrap();
    let dal = dal_of(&root);

    // Ikinci bir kopya uzagi ilerletiyor.
    let baska = temp_repo("push-rejected-other");
    std::fs::remove_dir_all(&baska).unwrap();
    git(
        std::env::temp_dir().as_path(),
        &["clone", "--quiet", &uzak.to_string_lossy(), &baska.to_string_lossy()],
    );
    git(&baska, &["config", "user.email", "test@nterminal"]);
    git(&baska, &["config", "user.name", "NTerminal Test"]);
    yaz(&baska, "b.txt", "baska\n");
    git(&baska, &["add", "b.txt"]);
    git(&baska, &["commit", "--quiet", "-m", "baska yerden"]);
    git(&baska, &["push", "--quiet", "origin", &dal]);
    let uzak_once = uzakta(&uzak, &format!("refs/heads/{dal}"));

    yeni_commit(&root, "yerel\n");
    let hata = push(&yol_of(&root)).unwrap_err();

    assert!(!hata.is_empty() && !hata.starts_with("git basarisiz oldu"), "{hata}");
    assert_eq!(uzakta(&uzak, &format!("refs/heads/{dal}")), uzak_once, "reddedilen push uzagi degistirdi");
    let _ = std::fs::remove_dir_all(&root);
    let _ = std::fs::remove_dir_all(&uzak);
    let _ = std::fs::remove_dir_all(&baska);
}

#[test]
fn silinmis_yukari_akisli_dal_yeniden_yayinlaniyor() {
    /*
     * PR birlestirildi, GitHub uzak dali sildi, yerelde `[gone]` kaldi. Dal artik
     * uzakta yok; "yayinla" yolu onu yeniden olusturuyor ve izlemeyi kuruyor.
     */
    let (root, uzak) = repo_ve_uzak("push-gone");
    git(&root, &["checkout", "-q", "-b", "ozellik"]);
    push(&yol_of(&root)).unwrap();
    git(&root, &["push", "--quiet", "origin", "--delete", "ozellik"]);
    git(&root, &["fetch", "--quiet", "--prune"]);
    assert_eq!(uzakta(&uzak, "refs/heads/ozellik"), None);
    assert_eq!(read(&yol_of(&root)).unwrap().upstream, None, "[gone] yukari akis sayildi");

    let hedef = push(&yol_of(&root)).unwrap();

    assert_eq!(hedef, "origin/ozellik");
    assert_eq!(uzakta(&uzak, "refs/heads/ozellik"), Some(git_out(&root, &["rev-parse", "HEAD"])));
    assert_eq!(read(&yol_of(&root)).unwrap().upstream.as_deref(), Some("origin/ozellik"));
    let _ = std::fs::remove_dir_all(&root);
    let _ = std::fs::remove_dir_all(&uzak);
}

#[test]
fn ayrik_head_gonderilmiyor() {
    // `git push -u origin HEAD` ayrik HEAD'de anlasilmaz bir refspec hatasi
    // veriyor; ne oldugunu soyleyen bir cumle daha iyi.
    let (root, uzak) = repo_ve_uzak("push-detached");
    git(&root, &["checkout", "-q", "--detach"]);

    let hata = push(&yol_of(&root)).unwrap_err();

    // Bizim cumlemiz: git'in kendi metni de "HEAD" kelimesini iceriyor, yalnizca
    // o kelimeye bakmak korumanin kalktigini fark etmezdi (mutasyonla olculdu).
    assert!(hata.contains("dala bagli degil"), "koruma devreye girmedi: {hata}");
    assert_eq!(uzakta(&uzak, "refs/heads/HEAD"), None);
    let _ = std::fs::remove_dir_all(&root);
    let _ = std::fs::remove_dir_all(&uzak);
}

#[test]
fn uzak_depo_yokken_hata() {
    let root = repo_bir_commitli("push-noremote");
    let hata = push(&yol_of(&root)).unwrap_err();
    assert!(hata.contains("uzak depo"), "{hata}");
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn ilk_commit_yokken_gonderilmiyor() {
    let root = temp_repo("push-unborn");
    let uzak = temp_remote("push-unborn");
    git(&root, &["remote", "add", "origin", &uzak.to_string_lossy()]);

    let hata = push(&yol_of(&root)).unwrap_err();

    assert!(hata.contains("commit yok"), "{hata}");
    let _ = std::fs::remove_dir_all(&root);
    let _ = std::fs::remove_dir_all(&uzak);
}

#[test]
fn alt_klasorden_de_gonderilebiliyor() {
    let (root, uzak) = repo_ve_uzak("push-subdir");
    std::fs::create_dir_all(root.join("src")).unwrap();
    let alt = root.join("src").to_string_lossy().to_string();

    let hedef = push(&alt).unwrap();

    assert_eq!(hedef, format!("origin/{}", dal_of(&root)));
    let _ = std::fs::remove_dir_all(&root);
    let _ = std::fs::remove_dir_all(&uzak);
}

// ------------------------------------------------ sahnelenmis dosyanin farki

/*
 * OLCULEN HATA: fark `git diff -- dosya` ile aliniyordu ve o calisma agacini
 * INDEKSLE karsilastiriyor. Dosya sahnelenince ikisi ayni oluyor, fark bos
 * geliyor ve panel "Gosterilecek fark yok" diyordu - bir dosyayi commit'e
 * eklemek satirin farkini yok ediyordu. Artik `HEAD`e karsi.
 */

#[test]
fn sahnelenmis_dosyanin_farki_bos_gelmiyor() {
    let root = repo_bir_commitli("diff-staged");
    yaz(&root, "a.txt", "degisti\n");
    git(&root, &["add", "a.txt"]);
    assert_eq!(durum_of(&root, "a.txt").as_deref(), Some("M "));

    let text = diff(&yol_of(&root), "a.txt", false).expect("fark alinamadi");

    assert!(
        text.contains("+degisti") && text.contains("-ilk"),
        "sahnelenmis dosyanin farki bos: {text:?}"
    );
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn sahnelenmemis_dosyanin_farki_eskisi_gibi_geliyor() {
    let root = repo_bir_commitli("diff-unstaged");
    yaz(&root, "a.txt", "degisti\n");
    assert_eq!(durum_of(&root, "a.txt").as_deref(), Some(" M"));

    let text = diff(&yol_of(&root), "a.txt", false).expect("fark alinamadi");

    assert!(text.contains("+degisti") && text.contains("-ilk"), "{text:?}");
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn kismen_sahnelenmis_dosyada_toplam_fark_geliyor() {
    // `MM`: commit'e yalnizca sahnelenen kisim girecek ama panel "bu dosyada ne
    // degisti" sorusunu yanitliyor, yani HEAD'den bu yana TOPLAM degisiklik.
    // Ara hal ("birinci") sahnelenip uzerine yazildi; farkta gorunmemeli.
    let root = repo_bir_commitli("diff-partial");
    yaz(&root, "a.txt", "birinci\n");
    git(&root, &["add", "a.txt"]);
    yaz(&root, "a.txt", "ikinci\n");
    assert_eq!(durum_of(&root, "a.txt").as_deref(), Some("MM"));

    let text = diff(&yol_of(&root), "a.txt", false).expect("fark alinamadi");

    assert!(text.contains("-ilk") && text.contains("+ikinci"), "{text:?}");
    assert!(!text.contains("birinci"), "ara hal farka sizdi: {text:?}");
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn sahnelenmis_silmenin_farki_gosteriliyor() {
    let root = repo_bir_commitli("diff-staged-del");
    git(&root, &["rm", "--quiet", "a.txt"]);
    assert_eq!(durum_of(&root, "a.txt").as_deref(), Some("D "));

    let text = diff(&yol_of(&root), "a.txt", false).expect("fark alinamadi");

    assert!(text.contains("-ilk"), "silinen satirlar gorunmuyor: {text:?}");
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn ilk_commit_yokken_sahnelenmis_dosyanin_farki_geliyor() {
    // `HEAD` yok ("bad revision 'HEAD'"); yalnizca indeks var ve `--cached`a
    // dusuluyor. Yoksa ilk dosyalarini ekleyen biri hicbir fark goremezdi.
    let root = temp_repo("diff-unborn");
    yaz(&root, "n.txt", "yeni\n");
    git(&root, &["add", "n.txt"]);

    let text = diff(&yol_of(&root), "n.txt", false).expect("fark alinamadi");

    assert!(text.contains("+yeni"), "{text:?}");
    let _ = std::fs::remove_dir_all(&root);
}

// ------------------------------------------------------------------- stash

// --- saf cozumleyiciler

const US: char = '\u{1f}';

fn stash_satiri(id: &str, zaman: &str, konu: &str) -> String {
    format!("{id}{US}{zaman}{US}{konu}\n")
}

#[test]
fn adli_ve_adsiz_stash_okunuyor() {
    let text = format!(
        "{}{}",
        stash_satiri("79ced1c8a3bc", "1790709222", "On main: fix: ayar penceresi"),
        stash_satiri("03acc28da85d", "1790709100", "WIP on main: 065c14e ilk commit"),
    );
    let liste = parse_stash_list(&text);
    assert_eq!(liste.len(), 2);

    // Adli: dal adi ILK `: `a kadar, ad iki nokta icerse de bolme dogru yerde.
    assert_eq!(liste[0].id, "79ced1c8a3bc");
    assert_eq!(liste[0].branch, "main");
    assert_eq!(liste[0].name, "fix: ayar penceresi");
    assert!(liste[0].named);
    assert_eq!(liste[0].time, 1790709222);

    // Adsiz: git'in varsayilani; ad olarak `karma konu`.
    assert_eq!(liste[1].branch, "main");
    assert_eq!(liste[1].name, "065c14e ilk commit");
    assert!(!liste[1].named);
}

#[test]
fn stash_konusunda_egik_cizgili_dal_adi_bolunmuyor() {
    let liste = parse_stash_list(&stash_satiri("abcdef1", "1", "On feature/x/y: ad"));
    assert_eq!(liste[0].branch, "feature/x/y");
    assert_eq!(liste[0].name, "ad");
}

#[test]
fn ayrik_head_stash_konusu() {
    let liste = parse_stash_list(&stash_satiri("abcdef1", "1", "WIP on (no branch): 1a2b3c4 konu"));
    assert_eq!(liste[0].branch, "(no branch)");
    assert!(!liste[0].named);
}

#[test]
fn duz_metinli_stash_adli_sayiliyor() {
    // `git stash store -m ...` gibi araclarin yazdigi duz metin: dal bilinmiyor
    // ama bir insanin yazdigi bir ad; "adsiz" diye gizlenmemeli.
    let liste = parse_stash_list(&stash_satiri("abcdef1", "1", "elle saklanan"));
    assert_eq!(liste[0].branch, "");
    assert_eq!(liste[0].name, "elle saklanan");
    assert!(liste[0].named);
}

#[test]
fn adi_bos_stash_konusu_cokmuyor() {
    let liste = parse_stash_list(&stash_satiri("abcdef1", "1", "On main:"));
    assert_eq!(liste[0].branch, "main");
    assert_eq!(liste[0].name, "");
}

#[test]
fn bozuk_stash_satirlari_atiliyor() {
    // Bos satir, eksik alan ve kimliksiz satir listeyi bozmamali.
    let text = format!(
        "\n{}garip satir\n{}",
        stash_satiri("", "1", "On main: kimliksiz"),
        stash_satiri("abcdef1", "1", "On main: saglam"),
    );
    let liste = parse_stash_list(&text);
    assert_eq!(liste.len(), 1);
    assert_eq!(liste[0].name, "saglam");
}

#[test]
fn okunamayan_zaman_sifir_oluyor_satir_dusmuyor() {
    let liste = parse_stash_list(&stash_satiri("abcdef1", "bozuk", "On main: ad"));
    assert_eq!(liste.len(), 1);
    assert_eq!(liste[0].time, 0);
}

#[test]
fn windows_satir_sonu_stash_listesini_bozmuyor() {
    let text = format!("abcdef1{US}1{US}On main: ad\r\n");
    assert_eq!(parse_stash_list(&text)[0].name, "ad");
}

#[test]
fn stash_json_alanlari_arayuzun_bekledigi_adlarda() {
    let liste = parse_stash_list(&stash_satiri("abcdef1", "5", "On main: ad"));
    let json = serde_json::to_value(&liste[0]).unwrap();
    assert_eq!(json["id"], "abcdef1");
    assert_eq!(json["named"], true);
    assert_eq!(json["time"], 5);
}

#[test]
fn name_status_z_cozuluyor() {
    let text = "M\0a.txt\0R100\0eski.txt\0yeni.txt\0A\0b.txt\0";
    let dosyalar = parse_name_status_z(text);
    assert_eq!(dosyalar.len(), 3);
    assert_eq!(dosyalar[0].status, "M ");
    assert_eq!(dosyalar[0].path, "a.txt");
    assert_eq!(dosyalar[0].orig_path, None);
    // Yeniden adlandirma: once ESKI, sonra YENI (olculdu); yol yeni ad.
    assert_eq!(dosyalar[1].status, "R ");
    assert_eq!(dosyalar[1].path, "yeni.txt");
    assert_eq!(dosyalar[1].orig_path.as_deref(), Some("eski.txt"));
    assert_eq!(dosyalar[2].status, "A ");
    assert!(dosyalar.iter().all(|d| !d.untracked));
}

#[test]
fn name_status_z_bozuk_girdide_cokmuyor() {
    assert!(parse_name_status_z("").is_empty());
    // Yeniden adlandirmanin ikinci yolu eksik: eksik kaydi uretmek yerine duruyor.
    assert!(parse_name_status_z("R100\0eski.txt\0").is_empty());
    assert!(parse_name_status_z("M\0").is_empty());
}

#[test]
fn name_status_z_bosluklu_ve_turkce_adlari_oldugu_gibi_veriyor() {
    // `-z` yollari tirnaksiz veriyor: ayri bir kural gerekmiyor.
    let dosyalar = parse_name_status_z("M\0bir dosya.txt\0A\0\u{e7}al\u{131}\u{15f}t\u{131}r.md\0");
    assert_eq!(dosyalar[0].path, "bir dosya.txt");
    assert_eq!(dosyalar[1].path, "\u{e7}al\u{131}\u{15f}t\u{131}r.md");
}

#[test]
fn stash_kimligi_dogrulaniyor() {
    // Kimlik `git diff <kimlik>^1` gibi komutlara giriyor; `--output=...` gibi bir
    // dize bir SECENEK olarak yorumlanabilirdi.
    assert!(valid_id("abcdef1"));
    assert!(valid_id(&"a".repeat(40)));
    assert!(valid_id(&"A1".repeat(32)));
    for bozuk in ["", "abc", "--output=x", "xyz1234", "abcdef1 --stat", &"a".repeat(65)] {
        assert!(!valid_id(bozuk), "gecerli sayildi: {bozuk:?}");
    }
}

// --- gercek depoda

fn stash_listesi(root: &std::path::Path) -> Vec<GitStash> {
    stashes(&yol_of(root))
}

/// Verilen adlari degistirip (i\u{e7}erik = `<ad>-degisti`) stash'e hazirlar.
fn degistir(root: &std::path::Path, adlar: &[&str]) {
    for ad in adlar {
        yaz(root, ad, &format!("{ad}-degisti\n"));
    }
}

/// Iki dosyasi (`a.txt`, `b.txt`) commit'li depo.
fn repo_iki_dosyali(name: &str) -> std::path::PathBuf {
    let root = temp_repo(name);
    yaz(&root, "a.txt", "ilk\n");
    yaz(&root, "b.txt", "ilk\n");
    git(&root, &["add", "."]);
    git(&root, &["commit", "--quiet", "-m", "ilk"]);
    root
}

#[test]
fn secilen_dosya_stashe_atiliyor_digeri_yerinde_kaliyor() {
    let root = repo_iki_dosyali("stash-secili");
    degistir(&root, &["a.txt", "b.txt"]);

    let id = stash_push(&yol_of(&root), "ayar denemesi", &liste(&["a.txt"]), false).unwrap();

    // Secilen dosya eski haline dondu, secilmeyen dokunulmadi.
    assert_eq!(oku(&root, "a.txt"), "ilk\n", "secilen dosya stash'e gitmedi");
    assert_eq!(oku(&root, "b.txt"), "b.txt-degisti\n", "secilmeyen dosya da gitti");
    assert_eq!(durum_of(&root, "b.txt").as_deref(), Some(" M"));

    let l = stash_listesi(&root);
    assert_eq!(l.len(), 1);
    assert_eq!(l[0].id, id, "donen kimlik listedeki stash'in kimligi degil");
    assert_eq!(l[0].name, "ayar denemesi");
    assert!(l[0].named);
    assert_eq!(l[0].branch, dal_of(&root));
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn ad_verilmezse_git_in_varsayilani_kullaniliyor() {
    let root = repo_iki_dosyali("stash-adsiz");
    degistir(&root, &["a.txt"]);

    stash_push(&yol_of(&root), "  ", &liste(&["a.txt"]), false).unwrap();

    let l = stash_listesi(&root);
    assert!(!l[0].named, "bos ad 'adli' sayildi");
    assert!(!l[0].name.is_empty());
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn cok_satirli_ad_listede_tek_satir_gorunuyor() {
    // Git yansima konusunu kendisi tek satira indiriyor (satir sonu, sekme ve art
    // arda bosluk tek bosluk oluyor, olculdu). Liste ayristiricisi satir satir
    // okuyor: bu zincirin bozulmadigini burada sabitliyoruz.
    let root = repo_iki_dosyali("stash-satir");
    degistir(&root, &["a.txt"]);

    stash_push(&yol_of(&root), "bir\niki   uc", &liste(&["a.txt"]), false).unwrap();

    let l = stash_listesi(&root);
    assert_eq!(l.len(), 1);
    assert_eq!(l[0].name, "bir iki uc");
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn takipsiz_dosya_include_untracked_ile_stash_e_giriyor() {
    let root = repo_iki_dosyali("stash-untracked");
    yaz(&root, "yeni.txt", "taze\n");

    // Onsuz git pathspec hatasi veriyor (olculdu): takipsiz dosya "bilinmiyor".
    let hata = stash_push(&yol_of(&root), "u", &liste(&["yeni.txt"]), false).unwrap_err();
    assert!(!hata.is_empty());
    assert!(root.join("yeni.txt").exists(), "hata verdigi halde dosya gitti");

    stash_push(&yol_of(&root), "u", &liste(&["yeni.txt"]), true).unwrap();
    assert!(!root.join("yeni.txt").exists(), "takipsiz dosya calisma agacinda kaldi");

    // Geri getirince dosya yerine donuyor.
    let id = stash_listesi(&root)[0].id.clone();
    stash_apply(&yol_of(&root), &id, false, false).unwrap();
    assert_eq!(oku(&root, "yeni.txt"), "taze\n");
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn kose_parantezli_ad_baska_dosyayi_stashlemiyor() {
    // `stage` ile ayni tuzak (bkz. `--literal-pathspecs`): `[b].txt` bir desen degil
    // bir dosya adi ve `b.txt`yi de goturmemeli.
    let root = repo_iki_dosyali("stash-literal");
    yaz(&root, "[b].txt", "koseli\n");
    git(&root, &["add", "[b].txt"]);
    git(&root, &["commit", "--quiet", "-m", "koseli"]);
    yaz(&root, "[b].txt", "koseli-degisti\n");
    yaz(&root, "b.txt", "b-degisti\n");

    stash_push(&yol_of(&root), "literal", &liste(&["[b].txt"]), false).unwrap();

    assert_eq!(oku(&root, "[b].txt"), "koseli\n", "koseli dosya stash'e gitmedi");
    assert_eq!(oku(&root, "b.txt"), "b-degisti\n", "desen baska bir dosyayi da goturdu");
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn yeniden_adlandirma_iki_yolla_stashleniyor() {
    // Eski ve yeni yol birlikte verilmeli; yoksa eski adin "silindi" kaydi
    // indekste kalir (bkz. `GitChange::orig_path`).
    let root = repo_iki_dosyali("stash-rename");
    git(&root, &["mv", "a.txt", "yeni.txt"]);
    let bilgi = read(&yol_of(&root)).unwrap();
    let degisiklik = bilgi.changes.iter().find(|c| c.path == "yeni.txt").unwrap();
    let mut yollar = vec![degisiklik.orig_path.clone().unwrap()];
    yollar.push(degisiklik.path.clone());

    stash_push(&yol_of(&root), "ad degisti", &yollar, false).unwrap();

    assert!(root.join("a.txt").exists(), "eski ad geri gelmedi");
    assert!(!root.join("yeni.txt").exists(), "yeni ad kaldi");
    assert!(read(&yol_of(&root)).unwrap().changes.is_empty(), "calisma agaci temiz degil");
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn sahnelenmis_degisiklik_de_stashe_giriyor_ve_indeks_temizleniyor() {
    let root = repo_iki_dosyali("stash-staged");
    yaz(&root, "a.txt", "sahnelenmis\n");
    git(&root, &["add", "a.txt"]);
    assert_eq!(durum_of(&root, "a.txt").as_deref(), Some("M "));

    stash_push(&yol_of(&root), "sahneli", &liste(&["a.txt"]), false).unwrap();

    assert_eq!(durum_of(&root, "a.txt"), None, "indeks temizlenmedi");
    assert_eq!(oku(&root, "a.txt"), "ilk\n");
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn stashlenecek_bir_sey_yoksa_hata_donuyor() {
    /*
     * OLCULDU: yollarda degisiklik yokken git "No local changes to save" yazip
     * cikis kodu 0 veriyor. Cikis koduna guvenseydik arayuz "stash'e atildi"
     * derdi ama hicbir sey atilmamis olurdu. `refs/stash` oncesi ve sonrasi
     * karsilastiriliyor.
     */
    let root = repo_iki_dosyali("stash-bos");
    degistir(&root, &["a.txt"]);

    let hata = stash_push(&yol_of(&root), "bos", &liste(&["b.txt"]), false).unwrap_err();

    assert!(hata.contains("degisiklik yok"), "{hata}");
    assert!(stash_listesi(&root).is_empty());
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn ikinci_ayni_stash_denemesi_eski_stash_i_yeni_sanmiyor() {
    // Zaten bir stash var; ikinci push HICBIR sey atmadiysa `refs/stash` ayni
    // kaliyor ve bu bir basari sayilmamali.
    let root = repo_iki_dosyali("stash-ikinci");
    degistir(&root, &["a.txt"]);
    stash_push(&yol_of(&root), "ilk", &liste(&["a.txt"]), false).unwrap();

    let hata = stash_push(&yol_of(&root), "ikinci", &liste(&["a.txt"]), false).unwrap_err();

    assert!(hata.contains("degisiklik yok"), "{hata}");
    assert_eq!(stash_listesi(&root).len(), 1);
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn bos_dosya_listesi_stash_e_gitmiyor() {
    let root = repo_iki_dosyali("stash-bosliste");
    degistir(&root, &["a.txt"]);
    assert!(stash_push(&yol_of(&root), "x", &[], false).is_err());
    assert_eq!(oku(&root, "a.txt"), "a.txt-degisti\n");
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn ilk_commit_yokken_stash_git_in_iletisiyle_reddediliyor() {
    let root = temp_repo("stash-unborn");
    yaz(&root, "a.txt", "x\n");
    git(&root, &["add", "a.txt"]);

    let hata = stash_push(&yol_of(&root), "x", &liste(&["a.txt"]), false).unwrap_err();

    assert!(!hata.is_empty());
    assert!(!hata.starts_with("git basarisiz oldu"), "git'in metni yutuldu: {hata}");
    let _ = std::fs::remove_dir_all(&root);
}

/// Bir stash atilmis depo; stash'in kimligini de doner.
fn repo_stashli(name: &str) -> (std::path::PathBuf, String) {
    let root = repo_iki_dosyali(name);
    degistir(&root, &["a.txt"]);
    let id = stash_push(&yol_of(&root), "deneme", &liste(&["a.txt"]), false).unwrap();
    (root, id)
}

#[test]
fn apply_degisikligi_geri_getiriyor_stash_i_koruyor() {
    let (root, id) = repo_stashli("stash-apply");

    stash_apply(&yol_of(&root), &id, false, false).unwrap();

    assert_eq!(oku(&root, "a.txt"), "a.txt-degisti\n");
    assert_eq!(stash_listesi(&root).len(), 1, "apply stash'i sildi");
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn pop_degisikligi_geri_getirip_stash_i_siliyor() {
    let (root, id) = repo_stashli("stash-pop");

    stash_apply(&yol_of(&root), &id, true, false).unwrap();

    assert_eq!(oku(&root, "a.txt"), "a.txt-degisti\n");
    assert!(stash_listesi(&root).is_empty(), "pop stash'i silmedi");
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn index_secenegi_sahnelenmis_durumu_geri_yukluyor() {
    /*
     * OLCULDU: `--index` olmadan `MM` durumundaki dosya ` M` olarak (sahnelenmemis)
     * geri geliyor. Paneldeki kutular sahnelemeyi gosterdigi icin secenek var.
     */
    for (index, beklenen) in [(false, " M"), (true, "MM")] {
        let root = repo_iki_dosyali(&format!("stash-index-{index}"));
        yaz(&root, "a.txt", "sahnelenmis\n");
        git(&root, &["add", "a.txt"]);
        yaz(&root, "a.txt", "sahnelenmis\nagac\n");
        assert_eq!(durum_of(&root, "a.txt").as_deref(), Some("MM"));
        let id = stash_push(&yol_of(&root), "idx", &liste(&["a.txt"]), false).unwrap();

        stash_apply(&yol_of(&root), &id, false, index).unwrap();

        assert_eq!(durum_of(&root, "a.txt").as_deref(), Some(beklenen), "index={index}");
        let _ = std::fs::remove_dir_all(&root);
    }
}

#[test]
fn cakisan_pop_hata_veriyor_ve_stash_i_silmiyor() {
    /*
     * OLCULDU: cakismada git cikis kodu 1 veriyor, calisma agacinda `UU` birakiyor
     * ve `pop` stash'i SILMIYOR. Silseydi kullanici hem yarim uygulanmis hem de
     * kaybolmus bir stash'le kalirdi.
     */
    let root = repo_iki_dosyali("stash-cakisma");
    yaz(&root, "a.txt", "stash-hali\n");
    let id = stash_push(&yol_of(&root), "cakisir", &liste(&["a.txt"]), false).unwrap();
    yaz(&root, "a.txt", "baska-hal\n");
    git(&root, &["commit", "--quiet", "-am", "baska"]);

    let hata = stash_apply(&yol_of(&root), &id, true, false).unwrap_err();

    assert!(!hata.is_empty() && !hata.starts_with("git basarisiz oldu"), "{hata}");
    assert_eq!(stash_listesi(&root).len(), 1, "cakisan pop stash'i sildi");
    assert_eq!(durum_of(&root, "a.txt").as_deref(), Some("UU"));
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn ezilecek_yerel_degisiklik_varsa_git_reddediyor_stash_kaliyor() {
    let (root, id) = repo_stashli("stash-kirli");
    yaz(&root, "a.txt", "yerel-farkli\n");

    let hata = stash_apply(&yol_of(&root), &id, true, false).unwrap_err();

    assert!(!hata.is_empty());
    assert_eq!(oku(&root, "a.txt"), "yerel-farkli\n", "yerel degisiklik ezildi");
    assert_eq!(stash_listesi(&root).len(), 1);
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn olmayan_stash_uygulanmiyor_yanlis_stash_a_dokunulmuyor() {
    let (root, _) = repo_stashli("stash-yok");
    let yok = "deadbeef".repeat(5);

    let hata = stash_apply(&yol_of(&root), &yok, true, false).unwrap_err();

    assert!(hata.contains("bulunamadi"), "{hata}");
    assert_eq!(stash_listesi(&root).len(), 1, "yanlis bir stash silindi");
    assert!(stash_apply(&yol_of(&root), "--output=x", false, false).is_err());
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn kimlik_liste_kayinca_da_dogru_stash_i_buluyor() {
    /*
     * `stash@{n}` yeni stash'ler eklendikce kayiyor. Arayuzde gorunen liste ile
     * diskteki liste ayrisabilir (terminalden `git stash` atildi); kimlik ise ayni
     * stash'i gosteriyor ve islem aninda guncel listede aranıyor.
     */
    let root = repo_iki_dosyali("stash-kayma");
    yaz(&root, "a.txt", "bir\n");
    let bir = stash_push(&yol_of(&root), "bir", &liste(&["a.txt"]), false).unwrap();
    yaz(&root, "a.txt", "iki\n");
    let iki = stash_push(&yol_of(&root), "iki", &liste(&["a.txt"]), false).unwrap();
    // Liste artik [iki, bir]; `bir` stash@{1}.
    assert_eq!(stash_listesi(&root)[1].id, bir);

    stash_apply(&yol_of(&root), &bir, false, false).unwrap();
    assert_eq!(oku(&root, "a.txt"), "bir\n", "yanlis stash uygulandi");

    // Ust stash'i sil; `bir` artik stash@{0}. Ayni kimlikle pop hala dogru.
    git(&root, &["checkout", "--quiet", "--", "."]);
    stash_drop(&yol_of(&root), &iki).unwrap();
    stash_apply(&yol_of(&root), &bir, true, false).unwrap();
    assert_eq!(oku(&root, "a.txt"), "bir\n");
    assert!(stash_listesi(&root).is_empty());
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn drop_yalnizca_o_stash_i_siliyor() {
    let root = repo_iki_dosyali("stash-drop");
    yaz(&root, "a.txt", "bir\n");
    let bir = stash_push(&yol_of(&root), "bir", &liste(&["a.txt"]), false).unwrap();
    yaz(&root, "a.txt", "iki\n");
    let iki = stash_push(&yol_of(&root), "iki", &liste(&["a.txt"]), false).unwrap();

    stash_drop(&yol_of(&root), &bir).unwrap();

    let l = stash_listesi(&root);
    assert_eq!(l.len(), 1);
    // Kalan stash'in kimligi DEGISMEDI: sirasi kaydi ama kimligi ayni.
    assert_eq!(l[0].id, iki);
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn olmayan_stash_silinmiyor() {
    let (root, _) = repo_stashli("stash-drop-yok");
    let hata = stash_drop(&yol_of(&root), &"cafebabe".repeat(5)).unwrap_err();
    assert!(hata.contains("bulunamadi"), "{hata}");
    assert_eq!(stash_listesi(&root).len(), 1);
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn stash_dosyalari_takipli_ve_takipsizi_listeliyor() {
    let root = repo_iki_dosyali("stash-dosyalar");
    degistir(&root, &["a.txt"]);
    git(&root, &["mv", "b.txt", "yeniad.txt"]);
    yaz(&root, "taze.txt", "x\n");
    std::fs::create_dir_all(root.join("klasor")).unwrap();
    yaz(&root, "klasor/ic.txt", "y\n");
    let yollar = liste(&["a.txt", "b.txt", "yeniad.txt", "taze.txt", "klasor/"]);
    let id = stash_push(&yol_of(&root), "karma", &yollar, true).unwrap();

    let sonuc = stash_files(&yol_of(&root), &id).unwrap();

    let durum = |yol: &str| sonuc.files.iter().find(|f| f.path == yol);
    assert_eq!(durum("a.txt").unwrap().status, "M ");
    let ad = durum("yeniad.txt").expect("yeniden adlandirma listede yok");
    assert_eq!(ad.status, "R ");
    assert_eq!(ad.orig_path.as_deref(), Some("b.txt"));
    // Takipsizler ucuncu ebeveynden; klasor dosyalara aciliyor.
    assert!(durum("taze.txt").unwrap().untracked);
    assert_eq!(durum("taze.txt").unwrap().status, "??");
    assert!(durum("klasor/ic.txt").unwrap().untracked, "klasor dosyalara acilmadi");
    assert_eq!(sonuc.total as usize, sonuc.files.len());
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn turkce_adli_dosya_stash_dosyalarinda_ham_geliyor() {
    // `-z` yollari tirnaksiz veriyor; kaçış dizisi ya da tirnak yok.
    let root = repo_iki_dosyali("stash-turkce");
    let ad = "\u{e7}al\u{131}\u{15f}t\u{131}r.md";
    yaz(&root, ad, "x\n");
    let id = stash_push(&yol_of(&root), "tr", &liste(&[ad]), true).unwrap();

    let sonuc = stash_files(&yol_of(&root), &id).unwrap();

    assert_eq!(sonuc.files[0].path, ad, "yol kacisli ya da tirnakli geldi");
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn stash_dosya_listesi_kesiliyor_ama_toplam_dogru_kaliyor() {
    // `-u` ile alinmis bir `node_modules` on binlerce dosya demek. Sessizce kesmek
    // "dosyam nerede" diye sordururdu: toplam ayri geliyor, arayuz "... ve N daha"
    // diyor.
    let root = repo_iki_dosyali("stash-kesik");
    let mut yollar = Vec::new();
    for i in 0..(MAX_STASH_FILES + 30) {
        let ad = format!("toplu{i:03}.txt");
        yaz(&root, &ad, "x\n");
        yollar.push(ad);
    }
    let id = stash_push(&yol_of(&root), "cok", &yollar, true).unwrap();

    let sonuc = stash_files(&yol_of(&root), &id).unwrap();

    assert_eq!(sonuc.files.len(), MAX_STASH_FILES);
    assert_eq!(sonuc.total as usize, MAX_STASH_FILES + 30);
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn stash_dosyalari_gecersiz_kimlikte_hata() {
    let (root, _) = repo_stashli("stash-dosyalar-hata");
    assert!(stash_files(&yol_of(&root), "--stat").is_err());
    assert!(stash_files(&yol_of(&root), &"0".repeat(40)).is_err());
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn stash_farki_takipli_dosyada_degisikligi_gosteriyor() {
    let (root, id) = repo_stashli("stash-fark");
    let text = stash_diff(&yol_of(&root), &id, "a.txt", None, false).expect("fark alinamadi");
    assert!(text.contains("-ilk") && text.contains("+a.txt-degisti"), "{text:?}");
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn stash_farki_takipsiz_dosyada_her_satir_eklendi_diyor() {
    let root = repo_iki_dosyali("stash-fark-takipsiz");
    yaz(&root, "taze.txt", "icerik\n");
    let id = stash_push(&yol_of(&root), "u", &liste(&["taze.txt"]), true).unwrap();

    let text = stash_diff(&yol_of(&root), &id, "taze.txt", None, true).expect("fark alinamadi");

    assert!(text.contains("+icerik"), "{text:?}");
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn stash_farki_yeniden_adlandirmada_iki_yolla_eslesiyor() {
    // Yalnizca yeni ad verilince git eslemeyi goremiyor ve dosyayi "yeni eklendi"
    // diye gosteriyor (olculdu).
    let root = repo_iki_dosyali("stash-fark-rename");
    git(&root, &["mv", "a.txt", "yeni.txt"]);
    let id = stash_push(&yol_of(&root), "rn", &liste(&["a.txt", "yeni.txt"]), false).unwrap();

    let iki = stash_diff(&yol_of(&root), &id, "yeni.txt", Some("a.txt"), false).unwrap();
    let tek = stash_diff(&yol_of(&root), &id, "yeni.txt", None, false).unwrap();

    assert!(iki.contains("rename from"), "eslesme gorunmuyor: {iki:?}");
    assert!(tek.contains("new file mode"), "{tek:?}");
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn stash_farki_gecersiz_kimlikte_yok() {
    let (root, _) = repo_stashli("stash-fark-yok");
    assert_eq!(stash_diff(&yol_of(&root), "--output=x", "a.txt", None, false), None);
    assert_eq!(stash_diff(&yol_of(&root), &"0".repeat(40), "a.txt", None, false), None);
    let _ = std::fs::remove_dir_all(&root);
}

// --- sayac ve imza

#[test]
fn stash_sayisi_yansima_dosyasindan_okunuyor() {
    let root = repo_iki_dosyali("stash-sayac");
    assert_eq!(stash_count(&root), 0);

    yaz(&root, "a.txt", "bir\n");
    let bir = stash_push(&yol_of(&root), "bir", &liste(&["a.txt"]), false).unwrap();
    yaz(&root, "a.txt", "iki\n");
    stash_push(&yol_of(&root), "iki", &liste(&["a.txt"]), false).unwrap();
    assert_eq!(stash_count(&root), 2);
    // Durum okumasi da ayni sayiyi tasiyor (sekme rozeti oradan).
    assert_eq!(read(&yol_of(&root)).unwrap().stash_count, 2);

    stash_drop(&yol_of(&root), &bir).unwrap();
    assert_eq!(stash_count(&root), 1);

    // Son stash silinince dosya KAYBOLUYOR (olculdu): eksik dosya 0 demek.
    let kalan = stash_listesi(&root)[0].id.clone();
    stash_drop(&yol_of(&root), &kalan).unwrap();
    assert_eq!(stash_count(&root), 0);
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn stash_sayisi_alt_klasorden_de_okunuyor() {
    let (root, _) = repo_stashli("stash-sayac-alt");
    std::fs::create_dir_all(root.join("src")).unwrap();
    assert_eq!(stash_count(&root.join("src")), 1);
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn stash_sayisi_ek_calisma_agacinda_ortak_dizinden_okunuyor() {
    /*
     * Ek calisma agacinda (`git worktree`) `.git` bir dosya ve stash gunlugu
     * agacin kendi dizininde DEGIL ortak dizinde (olculdu). Yalnizca `gitdir`e
     * bakan bir sayac worktree kullanan biri icin hep 0 derdi.
     */
    let (root, _) = repo_stashli("stash-worktree");
    let wt = std::env::temp_dir().join(format!(
        "nterminal-git-wt-{}-{:?}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    git(&root, &["worktree", "add", "--quiet", &wt.to_string_lossy(), "HEAD"]);

    assert_eq!(stash_count(&wt), 1, "worktree ortak dizindeki stash'i gormedi");
    assert_eq!(stashes(&yol_of(&wt)).len(), 1);
    let _ = std::fs::remove_dir_all(&wt);
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn stash_sayisi_git_dizini_olmayan_yerde_sifir() {
    let root = temp_tree("stash-sayac-yok");
    assert_eq!(stash_count(&root), 0);
    let _ = std::fs::remove_dir_all(&root);
}

fn kisa_bekle() {
    // Degisme zamani milisaniye cozunurlukte; ayni milisaniyeye dusen iki islem
    // ayni imzayi uretebilirdi.
    std::thread::sleep(std::time::Duration::from_millis(30));
}

#[test]
fn imza_stash_atilinca_degisiyor() {
    let root = repo_iki_dosyali("stash-imza-atma");
    degistir(&root, &["a.txt"]);
    let once = fingerprint(&yol_of(&root)).unwrap();
    kisa_bekle();

    stash_push(&yol_of(&root), "x", &liste(&["a.txt"]), false).unwrap();

    assert_ne!(once, fingerprint(&yol_of(&root)).unwrap());
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn imza_stash_silinince_de_degisiyor() {
    /*
     * `stash drop` INDEKSE dokunmuyor (yalnizca gunlugu ve `refs/stash`i
     * degistiriyor). Imza yalnizca HEAD ve indekse bakarken terminalden silinen
     * bir stash gorunmuyor ve panel eski listeyi gostermeye devam ediyordu.
     */
    let root = repo_iki_dosyali("stash-imza-silme");
    yaz(&root, "a.txt", "bir\n");
    let bir = stash_push(&yol_of(&root), "bir", &liste(&["a.txt"]), false).unwrap();
    yaz(&root, "a.txt", "iki\n");
    stash_push(&yol_of(&root), "iki", &liste(&["a.txt"]), false).unwrap();
    kisa_bekle();
    let once = fingerprint(&yol_of(&root)).unwrap();
    kisa_bekle();

    stash_drop(&yol_of(&root), &bir).unwrap();

    assert_ne!(once, fingerprint(&yol_of(&root)).unwrap(), "silme imzada gorunmedi");
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn imza_stash_yokken_kararli() {
    let root = repo_iki_dosyali("stash-imza-kararli");
    assert_eq!(fingerprint(&yol_of(&root)), fingerprint(&yol_of(&root)));
    let _ = std::fs::remove_dir_all(&root);
}

// --------------------------- stash: sahnelenmis silme ve yeniden adlandirma

/*
 * OLCULDU: git `stash push -- <yol>` icin pathspec'i INDEKSTE ariyor. Sahnelenmis
 * bir silmede (`D `) ve yeniden adlandirmanin eski adinda yol indekste yok ve git
 * SECIMDEKI TUM dosyalarla birlikte "did not match any file(s) known to git" ile
 * dusuyor. Panelde silinmis bir dosyanin kutusunu isaretlemek tam olarak sahnelenmis
 * silme uretiyor; sonra "hepsini stash'e at" demek bu hataya duserdi.
 */

#[test]
fn sahnelenmis_silme_stash_e_giriyor() {
    let root = repo_iki_dosyali("stash-silme");
    git(&root, &["rm", "--quiet", "a.txt"]);
    assert_eq!(durum_of(&root, "a.txt").as_deref(), Some("D "));

    let id = stash_push(&yol_of(&root), "silme", &liste(&["a.txt"]), false).unwrap();

    assert!(root.join("a.txt").exists(), "silme stash'e girmedi, dosya hala yok");
    assert_eq!(durum_of(&root, "a.txt"), None, "calisma agaci temiz degil");

    // Geri getirince silme geri geliyor.
    stash_apply(&yol_of(&root), &id, false, false).unwrap();
    assert!(!root.join("a.txt").exists());
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn sahnelenmis_silme_baska_degisikliklerle_birlikte_stashleniyor() {
    // Gercekci karma secim: degisen, sahnelenmis silinen, takipsiz ve yeni eklenen.
    let root = repo_iki_dosyali("stash-karma");
    yaz(&root, "a.txt", "degisti\n");
    git(&root, &["rm", "--quiet", "b.txt"]);
    yaz(&root, "taze.txt", "t\n");
    yaz(&root, "eklenen.txt", "e\n");
    git(&root, &["add", "eklenen.txt"]);
    let yollar = liste(&["a.txt", "b.txt", "taze.txt", "eklenen.txt"]);

    stash_push(&yol_of(&root), "karma", &yollar, true).unwrap();

    assert!(read(&yol_of(&root)).unwrap().changes.is_empty(), "calisma agaci temiz degil");
    assert_eq!(oku(&root, "a.txt"), "ilk\n");
    assert!(root.join("b.txt").exists());
    assert!(!root.join("taze.txt").exists());
    assert!(!root.join("eklenen.txt").exists());
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn yeni_eklenen_dosya_stash_e_giriyor() {
    let root = repo_iki_dosyali("stash-eklenen");
    yaz(&root, "eklenen.txt", "e\n");
    git(&root, &["add", "eklenen.txt"]);
    assert_eq!(durum_of(&root, "eklenen.txt").as_deref(), Some("A "));

    stash_push(&yol_of(&root), "yeni", &liste(&["eklenen.txt"]), false).unwrap();

    assert!(!root.join("eklenen.txt").exists());
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn kullanici_senaryosu_eklenmis_degisiklik_ve_eklenmis_yeni_dosya_birlikte_stashleniyor() {
    /*
     * BILDIRILEN DURUM (yatas deposu): iki dosya secili — ikisi de indekste, biri
     * degistirilmis (`M `), biri yepyeni (`A `) — ve baska dosyalar ELLENMEMIS
     * degisiklikte. Ilk denemede "Command git_stash_push not found" cikti; sebep
     * acik uygulamanin ESKI bir Rust derlemesiyle calismasiydi, git tarafi degil.
     * Bu test ayni durumun git tarafinin dogru calistigini gercek bir depoda
     * sabitliyor: yol bosluklu, dosyalar ic ice klasorlerde, geri getirmede
     * sahnelenmis durum (`--index`) donuyor.
     */
    let root = temp_repo("stash yatas senaryo");
    let modul = "js-storefront/yatas/src/app/app.module.ts";
    let araya = "js-storefront/yatas/src/core/interceptors/spa-mock.interceptor.ts";
    let ayar = "js-storefront/yatas/.vscode/settings.json";
    for klasor in [
        "js-storefront/yatas/src/app",
        "js-storefront/yatas/src/core/interceptors",
        "js-storefront/yatas/.vscode",
    ] {
        std::fs::create_dir_all(root.join(klasor)).unwrap();
    }
    yaz(&root, modul, "export class AppModule {}\n");
    yaz(&root, ".gitignore", "node_modules\n");
    yaz(&root, ayar, "{}\n");
    git(&root, &["add", "."]);
    git(&root, &["commit", "--quiet", "-m", "ilk"]);

    // Kullanicinin durumu: iki dosya indekste, iki dosya ellenmemis degisiklikte.
    yaz(&root, modul, "export class AppModule { providers = [SpaMock]; }\n");
    yaz(&root, araya, "export class SpaMockInterceptor {}\n");
    git(&root, &["add", modul, araya]);
    yaz(&root, ".gitignore", "node_modules\n.angular\n");
    yaz(&root, ayar, "{\"a\":1}\n");
    assert_eq!(durum_of(&root, modul).as_deref(), Some("M "));
    assert_eq!(durum_of(&root, araya).as_deref(), Some("A "));

    let id = stash_push(&yol_of(&root), "spa-mock + app.module", &liste(&[modul, araya]), false)
        .unwrap();

    // Secilen ikisi temiz agaca dondu...
    assert_eq!(oku(&root, modul), "export class AppModule {}\n");
    assert!(!root.join(araya).exists(), "yeni dosya calisma agacinda kaldi");
    assert_eq!(durum_of(&root, modul), None);
    assert_eq!(durum_of(&root, araya), None);
    // ...secilmeyenlere dokunulmadi.
    assert_eq!(durum_of(&root, ".gitignore").as_deref(), Some(" M"));
    assert_eq!(durum_of(&root, ayar).as_deref(), Some(" M"));
    assert_eq!(oku(&root, ".gitignore"), "node_modules\n.angular\n");

    // Liste ve icerik: ad, kimlik ve tam iki dosya.
    let l = stash_listesi(&root);
    assert_eq!(l.len(), 1);
    assert_eq!(l[0].id, id);
    assert_eq!(l[0].name, "spa-mock + app.module");
    let icerik = stash_files(&yol_of(&root), &id).unwrap();
    let mut gorunen: Vec<(String, String)> =
        icerik.files.iter().map(|f| (f.status.clone(), f.path.clone())).collect();
    gorunen.sort_by(|a, b| a.1.cmp(&b.1));
    assert_eq!(
        gorunen,
        vec![("M ".to_string(), modul.to_string()), ("A ".to_string(), araya.to_string())]
    );

    // Geri getir (pop + index): sahnelenmis durum da donuyor, stash siliniyor.
    stash_apply(&yol_of(&root), &id, true, true).unwrap();
    assert_eq!(durum_of(&root, modul).as_deref(), Some("M "));
    assert_eq!(durum_of(&root, araya).as_deref(), Some("A "));
    assert_eq!(oku(&root, araya), "export class SpaMockInterceptor {}\n");
    assert!(stash_listesi(&root).is_empty());
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn basarisiz_stash_sahnelenmis_silmeyi_kaybettirmiyor() {
    /*
     * Silmeleri indekse geri koymak (`reset`) stash DENEMESININ yan etkisi. Deneme
     * dusunce kullanicinin sahnelenmis silmesi yerinde kalmali; yoksa kutuyu
     * isaretlemis biri, hata mesajiyla birlikte isaretin de kaybolmasiyla
     * karsilasirdi.
     */
    let root = repo_iki_dosyali("stash-silme-hata");
    git(&root, &["rm", "--quiet", "a.txt"]);

    // Ikinci yol yok: git tumunu reddediyor.
    let hata = stash_push(&yol_of(&root), "x", &liste(&["a.txt", "yok.txt"]), false).unwrap_err();

    assert!(!hata.is_empty());
    assert_eq!(durum_of(&root, "a.txt").as_deref(), Some("D "), "sahnelenmis silme kayboldu");
    assert!(stash_listesi(&root).is_empty());
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn basarisiz_stash_yeniden_adlandirmayi_kaybettirmiyor() {
    let root = repo_iki_dosyali("stash-rename-hata");
    git(&root, &["mv", "a.txt", "yeni.txt"]);
    assert_eq!(durum_of(&root, "yeni.txt").as_deref(), Some("R "));

    let hata =
        stash_push(&yol_of(&root), "x", &liste(&["a.txt", "yeni.txt", "yok.txt"]), false).unwrap_err();

    assert!(!hata.is_empty());
    assert_eq!(durum_of(&root, "yeni.txt").as_deref(), Some("R "), "R durumu kayboldu");
    assert!(root.join("yeni.txt").exists());
    assert!(!root.join("a.txt").exists());
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn hicbir_sey_stashlenmediyse_de_sahnelenmis_silme_yerinde_kaliyor() {
    // Yolda baska bir degisiklik yok: sonuc "degisiklik yok" hatasi degil, silme
    // zaten stash'lendi. Bu test tersini de sabitliyor: silme olmayan yolda hata.
    let root = repo_iki_dosyali("stash-silme-bos");
    git(&root, &["rm", "--quiet", "a.txt"]);

    let hata = stash_push(&yol_of(&root), "x", &liste(&["b.txt"]), false).unwrap_err();

    assert!(hata.contains("degisiklik yok"), "{hata}");
    assert_eq!(durum_of(&root, "a.txt").as_deref(), Some("D "), "dokunulmamis silme bozuldu");
    let _ = std::fs::remove_dir_all(&root);
}

// ---- Fark penceresi: iki taraf ve `»` ile yazma ----

#[test]
fn fark_penceresi_head_ve_calisma_agacini_getiriyor() {
    let root = repo_bir_commitli("sides-mod");
    yaz(&root, "a.txt", "degisti\n");

    let sides = diff_sides(&yol_of(&root), "a.txt", None, false).unwrap();

    assert_eq!(sides.base.map(|b| b.text).as_deref(), Some("ilk\n"));
    assert_eq!(sides.current.map(|c| c.text).as_deref(), Some("degisti\n"));
    let head = sides.head.expect("HEAD kimligi yok");
    assert_eq!(head.len(), 8, "kisa kimlik sekiz hane olmali: {head}");
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn fark_penceresi_alt_klasorden_koke_gore_okuyor() {
    // Kabuk alt klasorde; yol porcelain'in verdigi gibi KOKE gore. Komutlar
    // kabugun dizininden kossaydi `HEAD:src/a.txt` yanlis yeri arardi.
    let root = temp_repo("sides-subdir");
    std::fs::create_dir_all(root.join("src")).unwrap();
    yaz(&root, "src/a.txt", "ilk\n");
    git(&root, &["add", "."]);
    git(&root, &["commit", "--quiet", "-m", "ilk"]);
    yaz(&root, "src/a.txt", "ikinci\n");

    let alt = root.join("src").to_string_lossy().to_string();
    let sides = diff_sides(&alt, "src/a.txt", None, false).unwrap();

    assert_eq!(sides.base.map(|b| b.text).as_deref(), Some("ilk\n"));
    assert_eq!(sides.current.map(|c| c.text).as_deref(), Some("ikinci\n"));
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn fark_penceresi_yeni_ve_silinen_dosyada_tek_taraf() {
    let root = repo_bir_commitli("sides-new-del");
    yaz(&root, "yeni.txt", "x\n");
    git(&root, &["add", "yeni.txt"]);
    std::fs::remove_file(root.join("a.txt")).unwrap();

    let yeni = diff_sides(&yol_of(&root), "yeni.txt", None, false).unwrap();
    assert!(yeni.base.is_none(), "HEAD'de olmayan dosyanin sol tarafi var");
    assert_eq!(yeni.current.map(|c| c.text).as_deref(), Some("x\n"));

    let silinen = diff_sides(&yol_of(&root), "a.txt", None, false).unwrap();
    assert_eq!(silinen.base.map(|b| b.text).as_deref(), Some("ilk\n"));
    assert!(silinen.current.is_none(), "silinen dosyanin sag tarafi var");
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn fark_penceresi_yeniden_adlandirmada_eski_yoldan_okuyor() {
    let root = repo_bir_commitli("sides-rename");
    git(&root, &["mv", "a.txt", "b.txt"]);
    yaz(&root, "b.txt", "ilk\nek\n");

    let sides = diff_sides(&yol_of(&root), "b.txt", Some("a.txt"), false).unwrap();

    assert_eq!(sides.base.map(|b| b.text).as_deref(), Some("ilk\n"));
    assert_eq!(sides.current.map(|c| c.text).as_deref(), Some("ilk\nek\n"));
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn fark_penceresi_commitsiz_depoda_sol_taraf_yok() {
    let root = temp_repo("sides-unborn");
    yaz(&root, "a.txt", "ilk\n");
    git(&root, &["add", "a.txt"]);

    let sides = diff_sides(&yol_of(&root), "a.txt", None, false).unwrap();

    assert!(sides.head.is_none());
    assert!(sides.base.is_none());
    assert_eq!(sides.current.map(|c| c.text).as_deref(), Some("ilk\n"));
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn blok_yazma_beklenen_icerikte_yaziyor() {
    let root = repo_bir_commitli("write-ok");
    yaz(&root, "a.txt", "degisti\n");

    write_worktree_file(&yol_of(&root), "a.txt", "degisti\n", "ilk\n").unwrap();

    assert_eq!(oku(&root, "a.txt"), "ilk\n");
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn blok_yazma_dosya_arada_degistiyse_hicbir_sey_yazmiyor() {
    // Fark alindiktan sonra dosya bir duzenleyicide kaydedildi: korkusuzca yazmak
    // o kaydi silerdi.
    let root = repo_bir_commitli("write-changed");
    yaz(&root, "a.txt", "duzenleyicide kaydedildi\n");

    let hata = write_worktree_file(&yol_of(&root), "a.txt", "degisti\n", "ilk\n").unwrap_err();

    assert_eq!(hata, WRITE_CHANGED);
    assert_eq!(oku(&root, "a.txt"), "duzenleyicide kaydedildi\n");
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn blok_yazma_utf8_olmayan_dosyayi_bozmuyor() {
    let root = repo_bir_commitli("write-latin1");
    std::fs::write(root.join("a.txt"), [0x61u8, 0xe7, 0x0a]).unwrap();

    let hata = write_worktree_file(&yol_of(&root), "a.txt", "a\u{fffd}\n", "x\n").unwrap_err();

    assert_eq!(hata, WRITE_NOT_TEXT);
    assert_eq!(std::fs::read(root.join("a.txt")).unwrap(), vec![0x61u8, 0xe7, 0x0a]);
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn blok_yazma_depo_disina_cikmiyor() {
    let root = repo_bir_commitli("write-escape");
    let disarisi = root.with_extension("disari.txt");
    std::fs::write(&disarisi, "dokunma\n").unwrap();
    let ad = format!("../{}", disarisi.file_name().unwrap().to_string_lossy());

    assert!(write_worktree_file(&yol_of(&root), &ad, "dokunma\n", "bozuldu\n").is_err());
    assert_eq!(std::fs::read_to_string(&disarisi).unwrap(), "dokunma\n");

    let _ = std::fs::remove_file(&disarisi);
    let _ = std::fs::remove_dir_all(&root);
}

#[cfg(unix)]
#[test]
fn blok_yazma_sembolik_baglantiyi_izlemiyor() {
    let root = repo_bir_commitli("write-symlink");
    let disarisi = root.with_extension("hedef.txt");
    std::fs::write(&disarisi, "dokunma\n").unwrap();
    std::os::unix::fs::symlink(&disarisi, root.join("bag.txt")).unwrap();

    assert!(write_worktree_file(&yol_of(&root), "bag.txt", "dokunma\n", "bozuldu\n").is_err());
    assert_eq!(std::fs::read_to_string(&disarisi).unwrap(), "dokunma\n");

    let _ = std::fs::remove_file(&disarisi);
    let _ = std::fs::remove_dir_all(&root);
}

// ---------------------------------------------------------------- outgoing

fn log_satiri(id: &str, kisa: &str, yazar: &str, zaman: &str, konu: &str) -> String {
    format!("{id}{US}{kisa}{US}{yazar}{US}{zaman}{US}{konu}\n")
}

#[test]
fn commit_gunlugu_cozuluyor() {
    let text = format!(
        "{}{}",
        log_satiri("a".repeat(40).as_str(), "aaaaaaa", "Nurullah Yayan", "1700000000", "ilk: ayar"),
        log_satiri("b".repeat(40).as_str(), "bbbbbbb", "Biri", "5", ""),
    );
    let liste = parse_commit_log(&text);
    assert_eq!(liste.len(), 2);
    assert_eq!(liste[0].short, "aaaaaaa");
    assert_eq!(liste[0].author, "Nurullah Yayan");
    assert_eq!(liste[0].time, 1_700_000_000);
    assert_eq!(liste[0].subject, "ilk: ayar");
    // Bos konu (`--allow-empty-message`) satiri dusurmuyor.
    assert_eq!(liste[1].subject, "");
}

#[test]
fn commit_gunlugu_bozuk_satirlari_atiyor() {
    assert!(parse_commit_log("").is_empty());
    assert!(parse_commit_log("yarim\u{1f}satir\n").is_empty());
    // Windows satir sonu konuya karismiyor.
    let text = log_satiri("c".repeat(40).as_str(), "ccccccc", "X", "1", "konu").replace('\n', "\r\n");
    assert_eq!(parse_commit_log(&text)[0].subject, "konu");
}

#[test]
fn gonderilecek_json_alanlari_arayuzun_bekledigi_adlarda() {
    let liste = parse_commit_log(&log_satiri("abcdef1", "abcdef1", "Y", "7", "k"));
    let json = serde_json::to_value(GitOutgoing { commits: liste, total: 1 }).unwrap();
    assert_eq!(json["total"], 1);
    assert_eq!(json["commits"][0]["id"], "abcdef1");
    assert_eq!(json["commits"][0]["short"], "abcdef1");
    assert_eq!(json["commits"][0]["author"], "Y");
    assert_eq!(json["commits"][0]["time"], 7);
    assert_eq!(json["commits"][0]["subject"], "k");
}

fn konular(o: &GitOutgoing) -> Vec<String> {
    o.commits.iter().map(|c| c.subject.clone()).collect()
}

#[test]
fn yukari_akis_varken_onde_olan_commitler_listeleniyor() {
    let (root, uzak) = repo_ve_uzak("outgoing-upstream");
    push(&yol_of(&root)).unwrap();
    assert_eq!(outgoing(&yol_of(&root)).unwrap(), GitOutgoing::default(), "itildikten sonra liste bos degil");

    yeni_commit(&root, "ikinci\n");
    yeni_commit(&root, "ucuncu\n");
    let o = outgoing(&yol_of(&root)).unwrap();

    // En yeni basta (git'in sirasi) ve `read`in `ahead`i ile ayni sayi.
    assert_eq!(konular(&o), ["ucuncu", "ikinci"]);
    assert_eq!(o.total, 2);
    assert_eq!(read(&yol_of(&root)).unwrap().ahead, 2);
    assert_eq!(o.commits[0].id, git_out(&root, &["rev-parse", "HEAD"]));
    assert_eq!(o.commits[0].author, "NTerminal Test");

    push(&yol_of(&root)).unwrap();
    assert_eq!(outgoing(&yol_of(&root)).unwrap().total, 0);
    let _ = std::fs::remove_dir_all(&root);
    let _ = std::fs::remove_dir_all(&uzak);
}

#[test]
fn yukari_akis_yokken_hicbir_uzakta_olmayanlar_listeleniyor() {
    // "Yayinla" yolu: `push` dali `-u` ile gonderecek. Uzakta zaten olan
    // commit'ler (ana dal) listede olmamali.
    let (root, uzak) = repo_ve_uzak("outgoing-publish");
    push(&yol_of(&root)).unwrap();
    git(&root, &["checkout", "--quiet", "-b", "yeni-dal"]);
    yeni_commit(&root, "dalda\n");

    let o = outgoing(&yol_of(&root)).unwrap();

    assert_eq!(read(&yol_of(&root)).unwrap().upstream, None);
    assert_eq!(konular(&o), ["dalda"]);
    assert_eq!(o.total, 1);
    let _ = std::fs::remove_dir_all(&root);
    let _ = std::fs::remove_dir_all(&uzak);
}

#[test]
fn uzagi_olmayan_depoda_butun_gecmis_sayiliyor_ama_liste_kesiliyor() {
    let root = repo_bir_commitli("outgoing-uzaksiz");
    for i in 0..(MAX_OUTGOING + 4) {
        git(&root, &["commit", "--quiet", "--allow-empty", "-m", &format!("c{i}")]);
    }

    let o = outgoing(&yol_of(&root)).unwrap();

    assert_eq!(o.total as usize, MAX_OUTGOING + 5);
    assert_eq!(o.commits.len(), MAX_OUTGOING);
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn ayrik_head_ve_bos_depoda_gonderilecek_yok() {
    let bos = temp_repo("outgoing-bos");
    assert_eq!(outgoing(&yol_of(&bos)).unwrap(), GitOutgoing::default());

    let root = repo_bir_commitli("outgoing-ayrik");
    yeni_commit(&root, "ikinci\n");
    git(&root, &["checkout", "--quiet", "--detach", "HEAD~1"]);
    assert_eq!(outgoing(&yol_of(&root)).unwrap(), GitOutgoing::default());
    let _ = std::fs::remove_dir_all(&bos);
    let _ = std::fs::remove_dir_all(&root);
}

fn dosya_listesi(root: &std::path::Path, rev: &str) -> Vec<(String, String, Option<String>)> {
    let id = git_out(root, &["rev-parse", rev]);
    commit_files(&yol_of(root), &id)
        .unwrap()
        .files
        .into_iter()
        .map(|f| (f.status, f.path, f.orig_path))
        .collect()
}

#[test]
fn commit_dosyalari_kok_degisiklik_ve_yeniden_adlandirma() {
    let root = repo_bir_commitli("commit-dosyalari");
    // Kok commit bos agaca gore: dosya eklendi.
    assert_eq!(dosya_listesi(&root, "HEAD"), [("A ".into(), "a.txt".into(), None)]);

    yaz(&root, "bir dosya.txt", "x\n");
    git(&root, &["add", "."]);
    git(&root, &["commit", "--quiet", "-m", "ekle"]);
    yeni_commit(&root, "degisti\n");
    assert_eq!(dosya_listesi(&root, "HEAD"), [("M ".into(), "a.txt".into(), None)]);
    assert_eq!(dosya_listesi(&root, "HEAD~1"), [("A ".into(), "bir dosya.txt".into(), None)]);

    git(&root, &["mv", "a.txt", "b.txt"]);
    git(&root, &["commit", "--quiet", "-m", "adlandir"]);
    assert_eq!(
        dosya_listesi(&root, "HEAD"),
        [("R ".into(), "b.txt".into(), Some("a.txt".into()))]
    );
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn birlestirme_commiti_ilk_ebeveynine_gore_anlatiliyor() {
    /*
     * OLCULDU: `diff-tree -m --first-parent` git 2.50'de IKI ebeveyne gore de
     * fark veriyordu (ana daldaki dosya da "eklendi" gorunuyordu). Ilk ebeveyn
     * acikca veriliyor: birlestirmeyle dala yalnizca yan daldaki dosya geldi.
     */
    let root = repo_bir_commitli("commit-birlestirme");
    let ana = dal_of(&root);
    git(&root, &["checkout", "--quiet", "-b", "yan"]);
    yaz(&root, "yan.txt", "y\n");
    git(&root, &["add", "."]);
    git(&root, &["commit", "--quiet", "-m", "yan"]);
    git(&root, &["checkout", "--quiet", &ana]);
    yaz(&root, "ana.txt", "a\n");
    git(&root, &["add", "."]);
    git(&root, &["commit", "--quiet", "-m", "ana"]);
    git(&root, &["merge", "--quiet", "--no-ff", "yan", "-m", "birlestir"]);

    assert_eq!(dosya_listesi(&root, "HEAD"), [("A ".into(), "yan.txt".into(), None)]);
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn commit_farki_tek_dosyayi_ve_yeniden_adlandirmayi_veriyor() {
    let root = repo_bir_commitli("commit-farki");
    let kok = git_out(&root, &["rev-parse", "HEAD"]);
    assert!(commit_diff(&yol_of(&root), &kok, "a.txt", None).unwrap().contains("+ilk"));

    yaz(&root, "b.txt", "baska\n");
    git(&root, &["add", "."]);
    yeni_commit(&root, "degisti\n");
    let id = git_out(&root, &["rev-parse", "HEAD"]);
    let fark = commit_diff(&yol_of(&root), &id, "a.txt", None).unwrap();
    assert!(fark.contains("-ilk") && fark.contains("+degisti"), "{fark}");
    assert!(!fark.contains("b.txt"), "baska dosyanin farki karisti: {fark}");

    git(&root, &["mv", "a.txt", "c.txt"]);
    git(&root, &["commit", "--quiet", "-m", "adlandir"]);
    let id = git_out(&root, &["rev-parse", "HEAD"]);
    let fark = commit_diff(&yol_of(&root), &id, "c.txt", Some("a.txt")).unwrap();
    assert!(fark.contains("rename from a.txt") && fark.contains("rename to c.txt"), "{fark}");
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn commit_kimligi_dogrulaniyor() {
    let root = repo_bir_commitli("commit-kimlik");
    assert!(commit_files(&yol_of(&root), "--output=x").is_err());
    assert_eq!(commit_diff(&yol_of(&root), "--stat", "a.txt", None), None);
    let _ = std::fs::remove_dir_all(&root);
}

// ------------------------------------------------- yok sayilan klasorde izlenen

/// `.vscode` yok sayiliyor ama icindeki dosyalar daha once commit'lenmis
/// (bildirilen depodaki durum: `.gitignore:123 .vscode`).
fn repo_yok_sayilan_klasorlu(name: &str) -> std::path::PathBuf {
    let root = temp_repo(name);
    std::fs::create_dir_all(root.join("alt/.vscode")).unwrap();
    yaz(&root, "alt/.vscode/settings.json", "ilk\n");
    yaz(&root, "alt/.vscode/launch.json", "ilk\n");
    yaz(&root, "a.txt", "ilk\n");
    git(&root, &["add", "."]);
    git(&root, &["commit", "--quiet", "-m", "ilk"]);
    yaz(&root, "alt/.gitignore", ".vscode\n");
    git(&root, &["add", "alt/.gitignore"]);
    git(&root, &["commit", "--quiet", "-m", "yok say"]);
    root
}

#[test]
fn yok_sayilan_klasordeki_izlenen_dosya_hatasiz_sahneleniyor() {
    /*
     * OLCULDU: duz `git add -- alt/.vscode/settings.json` dosyayi sahneleyip
     * "The following paths are ignored" ile 1 donuyordu; panel "Dosya secimi
     * degistirilemedi" diyordu. Toplu kutunun gonderdigi liste aynen bu: izlenen,
     * silinen, siradan ve takipsiz yollar bir arada.
     */
    let root = repo_yok_sayilan_klasorlu("stage-yok-sayilan");
    yaz(&root, "alt/.vscode/settings.json", "degisti\n");
    std::fs::remove_file(root.join("alt/.vscode/launch.json")).unwrap();
    yaz(&root, "a.txt", "degisti\n");
    yaz(&root, "yeni.txt", "yeni\n");
    assert_eq!(durum_of(&root, "alt/.vscode/settings.json").as_deref(), Some(" M"));

    stage(&yol_of(&root), &liste(&["alt/.vscode/settings.json", "alt/.vscode/launch.json", "a.txt", "yeni.txt"]))
        .expect("izlenen dosya yok sayilan klasorde diye hata dondu");

    assert_eq!(durum_of(&root, "alt/.vscode/settings.json").as_deref(), Some("M "));
    assert_eq!(durum_of(&root, "alt/.vscode/launch.json").as_deref(), Some("D "));
    assert_eq!(durum_of(&root, "a.txt").as_deref(), Some("M "));
    assert_eq!(durum_of(&root, "yeni.txt").as_deref(), Some("A "));
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn takipsiz_klasordeki_yok_sayilan_dosya_eklenmiyor() {
    // `-f` kullanilmadiginin kaniti: takipsiz klasor yolu verilince icindeki
    // yok sayilan dosya (`node_modules` gibi) indekse girmemeli.
    let root = repo_bir_commitli("stage-takipsiz-klasor");
    yaz(&root, ".gitignore", "*.log\n");
    git(&root, &["add", ".gitignore"]);
    git(&root, &["commit", "--quiet", "-m", "yok say"]);
    std::fs::create_dir_all(root.join("yeni")).unwrap();
    yaz(&root, "yeni/a.txt", "a\n");
    yaz(&root, "yeni/hata.log", "log\n");

    stage(&yol_of(&root), &liste(&["yeni/"])).unwrap();

    let indeks = git_out(&root, &["ls-files"]);
    assert!(indeks.contains("yeni/a.txt"), "{indeks}");
    assert!(!indeks.contains("hata.log"), "yok sayilan dosya eklendi: {indeks}");
    let _ = std::fs::remove_dir_all(&root);
}
