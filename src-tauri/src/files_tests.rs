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

// ------------------------------------------------------------- okuma

/// Buyuk dosya: metin sinirda kesiliyor, kesildigi SOYLENIYOR, boyut gercek.
///
/// Sinir okurken uygulaniyor (`take`), sonradan degil: eski kod dosyanin
/// tamamini belleğe alip sonra kesiyordu; gigabaytlik bir kutuk pencereyi
/// donduruyor ve bellegi dolduruyordu. Bu test ayirmayi olcemiyor; sinirin
/// dogru yerde oldugunu ve kesme bayraginin dogru geldigini bagliyor.
#[test]
fn buyuk_dosya_sinirda_kesiliyor_ve_bildiriliyor() {
    let root = tree("read-big");
    let p = root.join("buyuk.log");
    let satir = "0123456789abcdef\n";
    let mut icerik = String::new();
    while icerik.len() < MAX_READ + 4096 {
        icerik.push_str(satir);
    }
    std::fs::write(&p, &icerik).unwrap();

    let okunan = read_text(&p).expect("dosya okunamadi");
    assert!(okunan.truncated, "sinir asildi ama bildirilmedi");
    assert!(!okunan.binary);
    assert_eq!(okunan.size, icerik.len() as u64, "boyut dosyanin gercek boyutu olmali");
    assert_eq!(okunan.text.len(), MAX_READ, "metin tam sinirda kesilmeli");
    assert!(icerik.starts_with(&okunan.text));

    // Sinirin altindaki dosya oldugu gibi.
    let kucuk = root.join("kucuk.txt");
    std::fs::write(&kucuk, "merhaba\n").unwrap();
    let okunan = read_text(&kucuk).unwrap();
    assert!(!okunan.truncated);
    assert_eq!(okunan.text, "merhaba\n");
    let _ = std::fs::remove_dir_all(&root);
}

// ------------------------------------------------------------- yazma
//
// Goruntuleyicideki Kaydet ve fark penceresinin sag tarafi buradan yaziyor.
// En onemlisi "arada degistiyse yazma": baska bir duzenleyicide kaydedileni
// sessizce silmek kullanicinin isini kaybettirir.

#[test]
fn yazma_okunan_hal_ayniysa_yaziyor() {
    let root = tree("write-ok");
    let p = root.join("a.txt");
    std::fs::write(&p, "eski\n").unwrap();
    write_text(&p, "eski\n", "yeni\n").unwrap();
    assert_eq!(std::fs::read_to_string(&p).unwrap(), "yeni\n");
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn yazma_dosya_arada_degistiyse_hicbir_sey_yazmiyor() {
    let root = tree("write-changed");
    let p = root.join("a.txt");
    std::fs::write(&p, "baska yerde kaydedildi\n").unwrap();
    assert_eq!(write_text(&p, "eski\n", "yeni\n").unwrap_err(), WRITE_CHANGED);
    assert_eq!(std::fs::read_to_string(&p).unwrap(), "baska yerde kaydedildi\n");
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn yazma_utf8_olmayan_dosyayi_bozmuyor() {
    let root = tree("write-latin1");
    let p = root.join("a.txt");
    std::fs::write(&p, [0x61u8, 0xe7, 0x0a]).unwrap();
    assert_eq!(write_text(&p, "a\u{fffd}\n", "x\n").unwrap_err(), WRITE_NOT_TEXT);
    assert_eq!(std::fs::read(&p).unwrap(), vec![0x61u8, 0xe7, 0x0a]);
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn yazma_goreli_yol_klasor_ve_olmayan_dosya_reddediliyor() {
    let root = tree("write-reject");
    assert!(write_text(Path::new("a.txt"), "", "x").is_err());
    assert!(write_text(&root, "", "x").is_err());
    assert!(write_text(&root.join("yok.txt"), "", "x").is_err());
    assert!(!root.join("yok.txt").exists(), "yeni dosya olusturmuyor");
    let _ = std::fs::remove_dir_all(&root);
}

#[cfg(unix)]
#[test]
fn yazma_baglantinin_ardina_yazmiyor() {
    let root = tree("write-link");
    let hedef = root.join("hedef.txt");
    std::fs::write(&hedef, "dokunma\n").unwrap();
    let bag = root.join("bag.txt");
    std::os::unix::fs::symlink(&hedef, &bag).unwrap();
    assert!(write_text(&bag, "dokunma\n", "x\n").is_err());
    assert_eq!(std::fs::read_to_string(&hedef).unwrap(), "dokunma\n");
    let _ = std::fs::remove_dir_all(&root);
}


// ---------------------------------------------------------------- gorsel

#[test]
fn gorsel_base64_olarak_okunuyor() {
    // NUL ve 0xFF iceren gercek PNG basligi: metin okuyucusu bunlari "ikili"
    // diye bos donduruyordu (BILDIRILEN: "png'yi gorsel olarak goremiyorum");
    // burada bayt bayt geri gelmeli.
    let root = tree("image");
    let png = [0x89u8, b'P', b'N', b'G', b'\r', b'\n', 0x1a, b'\n', 0, 0, 0, 0xff];
    std::fs::write(root.join("a.png"), png).unwrap();
    let img = read_image(&root.join("a.png")).unwrap();
    assert_eq!(img.size, png.len() as u64);
    use base64::Engine;
    assert_eq!(base64::engine::general_purpose::STANDARD.decode(&img.data).unwrap(), png);
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn buyuk_gorsel_boyutuyla_reddediliyor() {
    // Arayuz boyutu soyluyor ("Gorsel cok buyuk (31 MB)"); sinir sessizce bos
    // bir alan birakmamali.
    let root = tree("image-large");
    std::fs::write(root.join("b.png"), [7u8; 10]).unwrap();
    let err = read_image_limited(&root.join("b.png"), 4).unwrap_err();
    assert_eq!(err, format!("{IMAGE_TOO_LARGE}:10"));
    assert!(read_image_limited(&root.join("b.png"), 10).is_ok(), "sinirin tam kendisi reddedildi");
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn klasor_ve_olmayan_dosya_gorsel_degil() {
    let root = tree("image-dir");
    assert!(read_image(&root).is_err());
    assert!(read_image(&root.join("yok.png")).is_err());
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn gorsel_arayuzun_bekledigi_adlarla_seriliyor() {
    // Arayuz `types.ts`teki `ImageData`yi okuyor; alan adi kayarsa derleyici
    // gormez, goruntuleyici bos kalir.
    let v = serde_json::to_value(ImageData { data: "AA==".into(), size: 1 }).unwrap();
    assert_eq!(v, serde_json::json!({ "data": "AA==", "size": 1 }));
}
