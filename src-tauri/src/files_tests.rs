//! Dosya yuruyusunun sinirlari ve atlamalari.
//!
//! Gercek bir agac kurup yuruyoruz. Kural sayisi az ama her biri bir belirtiye
//! karsilik geliyor: "arayuz donuyor" ya da "aradigim dosya listede yok".

use super::*;

fn tree(name: &str) -> std::path::PathBuf {
    let root = std::env::temp_dir().join(format!("nterm-files-{name}"));
    let _ = std::fs::remove_dir_all(&root);
    std::fs::create_dir_all(&root).unwrap();
    root
}

fn touch(root: &Path, rel: &str) {
    let p = root.join(rel);
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent).unwrap();
    }
    std::fs::write(p, b"x").unwrap();
}

#[test]
fn dosyalar_goreli_yolla_geliyor() {
    let root = tree("rel");
    touch(&root, "a.txt");
    touch(&root, "src/b.rs");

    let out = list(&root);
    // Ayirici platforma gore degisiyor; dosya adlarini denetliyoruz.
    assert_eq!(out.len(), 2);
    assert!(out.iter().any(|p| p.ends_with("a.txt")));
    assert!(out.iter().any(|p| p.ends_with("b.rs")));
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn agir_klasorler_atlaniyor() {
    // `node_modules` bir projede yuz binlerce dosya tutuyor; girilmesi yuruyusu
    // dakikalara cikariyor ve aranan dosya orada degil.
    let root = tree("skip");
    touch(&root, "kod.ts");
    touch(&root, "node_modules/paket/index.js");
    touch(&root, ".git/HEAD");
    touch(&root, "target/debug/x.exe");

    let out = list(&root);
    assert_eq!(out.len(), 1, "atlanmasi gereken klasorlere girildi: {out:?}");
    assert!(out[0].ends_with("kod.ts"));
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn derinlik_siniri_var() {
    // Derin ic ice klasorlerde yuruyus sinirsiz uzuyor.
    let root = tree("depth");
    let derin = (0..MAX_DEPTH + 3)
        .map(|i| format!("d{i}"))
        .collect::<Vec<_>>()
        .join("/");
    touch(&root, &format!("{derin}/gizli.txt"));
    touch(&root, "yuzey.txt");

    let out = list(&root);
    assert!(out.iter().any(|p| p.ends_with("yuzey.txt")));
    assert!(
        !out.iter().any(|p| p.ends_with("gizli.txt")),
        "derinlik sinirini asan dosya listeye girdi"
    );
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn yuzeydeki_dosyalar_once_geliyor() {
    // Sinira takilirsa elde YUZEYDEKI dosyalar kalmali: kullanicinin aradigi
    // dosya cok daha sik yuzeye yakin.
    let root = tree("bfs");
    touch(&root, "ust.txt");
    touch(&root, "a/b/c/alt.txt");

    let out = list(&root);
    let ust = out.iter().position(|p| p.ends_with("ust.txt")).unwrap();
    let alt = out.iter().position(|p| p.ends_with("alt.txt")).unwrap();
    assert!(ust < alt, "derindeki dosya yuzeydekinden once geldi");
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn bos_klasor_bos_liste() {
    let root = tree("empty");
    assert!(list(&root).is_empty());
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn olmayan_klasor_cokmuyor() {
    let yok = std::env::temp_dir().join("nterm-files-yok-boyle-bir-sey");
    assert!(list(&yok).is_empty());
}
