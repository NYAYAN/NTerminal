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

/// Damga: boyut ve degisiklik zamani; yazinca degisiyor, klasor/olmayan dosya
/// icin yok. Fark penceresi tam okumayi yalnizca damga oynayinca yapiyor.
#[test]
fn damga_yazinca_degisiyor_klasor_icin_yok() {
    let root = tree("stamp");
    let p = root.join("a.txt");
    std::fs::write(&p, "bir\n").unwrap();
    let once = stamp(&p).expect("damga yok");
    assert_eq!(once.size, 4);
    assert!(once.modified_ms > 0, "degisiklik zamani okunmali");
    std::fs::write(&p, "bir iki\n").unwrap();
    let sonra = stamp(&p).unwrap();
    assert_ne!(once, sonra, "icerik degisti, damga ayni kaldi");
    assert!(stamp(&root).is_none(), "klasor icin damga olmamali");
    assert!(stamp(&root.join("yok.txt")).is_none());
    let _ = std::fs::remove_dir_all(&root);
}

// ------------------------------------------- ev dizini, sure butcesi, okuma
//
// test-ve-basarim-duzeltmeleri dalindan: ev dizininde arac onbellekleri
// atlaniyor, yuruyus sure butcesiyle sinirli (8 sn -> 0,4 sn), metin okuma
// sinirlari.

/// Ev dizini olarak davranan bir agac: arac onbellekleri + gercek dosyalar.
fn sahte_ev(name: &str) -> std::path::PathBuf {
    let home = tree(name);
    touch(&home, ".zshrc");
    touch(&home, "proje/kod.rs");
    touch(&home, "proje/.cache/x.txt"); // projenin icindeki .cache ev onbellegi DEGIL
    for onbellek in ["Library", ".npm", ".cache", ".cargo", ".gradle", ".Trash"] {
        touch(&home, &format!("{onbellek}/derin/dosya.txt"));
    }
    home
}

fn secenek(home: Option<&Path>) -> ListOpts {
    ListOpts { max_files: MAX_FILES, budget: LIST_BUDGET, home: home.map(Path::to_path_buf) }
}

#[test]
fn ev_dizininde_arac_onbellekleri_atlaniyor() {
    // OLCULEN HATA: `~` altinda Ctrl+P 8 saniye suruyordu; `.npm`, `.gradle`,
    // `Library`, `.cargo` gibi onbellekler binlerce dosya tutuyor ve hicbiri
    // kullanicinin aradigi dosya degil.
    let home = sahte_ev("ev-atla");
    let out = list_with(&home, &secenek(Some(&home)));

    assert!(out.iter().any(|p| p == ".zshrc"), "ev dizininin kendi dosyasi kayip: {out:?}");
    assert!(out.iter().any(|p| p.ends_with("kod.rs")), "proje dosyasi kayip: {out:?}");
    for onbellek in ["Library", ".npm", ".cargo", ".gradle", ".Trash"] {
        assert!(
            !out.iter().any(|p| p.starts_with(onbellek)),
            "{onbellek} atlanmadi: {out:?}"
        );
    }
    assert!(
        !out.iter().any(|p| p.starts_with(".cache/")),
        "ev dizinindeki .cache atlanmadi: {out:?}"
    );
    let _ = std::fs::remove_dir_all(&home);
}

#[test]
fn ev_atlamasi_yalnizca_dogrudan_altinda() {
    // Projenin ICINDEKI `.cache` ev onbellegi degil; kullanici orada arama
    // yapiyor olabilir. Atlama yalnizca ev dizininin DOGRUDAN altinda.
    let home = sahte_ev("ev-derin");
    let out = list_with(&home, &secenek(Some(&home)));
    assert!(
        out.iter().any(|p| p.ends_with("proje/.cache/x.txt")),
        "projenin icindeki .cache yanlislikla atlandi: {out:?}"
    );
    let _ = std::fs::remove_dir_all(&home);
}

#[test]
fn kok_ev_dizini_degilse_ayni_adli_klasorler_atlanmiyor() {
    // Bir Unity projesinin `Library` klasoru ya da baska bir yerdeki `.cache`:
    // kok ev dizini degilse HOME_SKIP devreye girmemeli.
    let home = sahte_ev("ev-degil");
    let baska = tree("ev-degil-baska");
    touch(&baska, "Library/kaynak.txt");
    let out = list_with(&baska, &secenek(Some(&home)));
    assert!(out.iter().any(|p| p.ends_with("Library/kaynak.txt")), "{out:?}");
    let _ = std::fs::remove_dir_all(&home);
    let _ = std::fs::remove_dir_all(&baska);
}

#[test]
fn sure_butcesi_asilinca_eldeki_liste_donuyor() {
    // Bir agacin ne kadar buyuk oldugu onceden bilinmiyor (ag suruculeri,
    // iCloud yer tutuculari dosya sayisindan bagimsiz yavas). Butce dolunca
    // yuruyus DURMALI ve eldeki liste donmeli - eksik liste, bekleyen bir
    // paletten iyi.
    let root = tree("butce");
    for i in 0..5000 {
        std::fs::write(root.join(format!("d{i:05}.txt")), b"x").unwrap();
    }
    let tam = list_with(&root, &ListOpts { max_files: MAX_FILES, budget: Duration::from_secs(30), home: None });
    assert_eq!(tam.len(), 5000, "genis butcede eksik liste");

    // Tek klasorun ICINDE de sure denetleniyor (BUDGET_CHECK_EVERY): yuz binlerce
    // girdili tek bir klasor butceyi asmamali.
    let t0 = Instant::now();
    let kisa = list_with(&root, &ListOpts { max_files: MAX_FILES, budget: Duration::from_micros(1), home: None });
    assert!(kisa.len() < tam.len(), "sifir butcede bile tum liste geldi: {}", kisa.len());
    assert!(t0.elapsed() < Duration::from_secs(2));
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn butce_yuzeydeki_dosyalari_koruyor() {
    // Sure dolarsa elde YUZEYDEKI dosyalar kalmali (genislik oncelikli).
    let root = tree("butce-yuzey");
    touch(&root, "ust.txt");
    for i in 0..300 {
        touch(&root, &format!("d{i}/a/b/c/derin.txt"));
    }
    let out = list_with(&root, &ListOpts { max_files: 5, budget: Duration::from_secs(30), home: None });
    assert!(out.iter().any(|p| p == "ust.txt"), "sinirda yuzeydeki dosya kayboldu: {out:?}");
    let _ = std::fs::remove_dir_all(&root);
}

fn dosya(name: &str, icerik: &[u8]) -> std::path::PathBuf {
    let dir = tree(name);
    let p = dir.join("f.txt");
    std::fs::write(&p, icerik).unwrap();
    p
}

#[test]
fn buyuk_dosya_kesilerek_okunuyor_ve_bildiriliyor() {
    // Goruntuleyici en fazla yarim megabayt gosteriyor ve kesildigini
    // SOYLUYOR. Eskiden dosyanin TAMAMI bellege okunuyordu: birkac GB'lik bir
    // kutuk dosyasi o kadar bellek ayirip ana is parcacigini bekletirdi. Simdi
    // en fazla MAX_READ + 1 bayt okunuyor.
    let p = dosya("buyuk", &vec![b'a'; MAX_READ + 1000]);
    let t = read_text(&p).expect("okunamadi");
    assert!(t.truncated, "kesildigi bildirilmedi");
    assert_eq!(t.text.len(), MAX_READ);
    assert_eq!(t.size, (MAX_READ + 1000) as u64, "gercek boyut kayip");
    assert!(!t.binary);
}

#[test]
fn tam_sinirdaki_dosya_kesilmiyor() {
    // Tam MAX_READ bayt: kesilecek bir sey yok. `+1` okuma bunu ayirt ediyor;
    // `take(MAX_READ)` olsaydi burada yanlis "kesildi" derdi.
    let p = dosya("sinir", &vec![b'a'; MAX_READ]);
    let t = read_text(&p).unwrap();
    assert!(!t.truncated, "sinirda kesildi denildi");
    assert_eq!(t.text.len(), MAX_READ);
}

#[test]
fn kucuk_metin_dosyasi_ve_turkce_karakterler() {
    let p = dosya("kucuk", "merhaba çalışıyor şğıİ\n".as_bytes());
    let t = read_text(&p).unwrap();
    assert_eq!(t.text, "merhaba çalışıyor şğıİ\n");
    assert!(!t.truncated && !t.binary);
}

#[test]
fn ikili_dosya_sezgisi_calisiyor() {
    let mut icerik = b"PNG".to_vec();
    icerik.push(0);
    icerik.extend_from_slice(&[7u8; 100]);
    let p = dosya("ikili", &icerik);
    let t = read_text(&p).unwrap();
    assert!(t.binary && t.text.is_empty());
}

#[test]
fn klasor_ve_olmayan_yol_none() {
    let d = tree("read-klasor");
    assert!(read_text(&d).is_none());
    assert!(read_text(&d.join("yok.txt")).is_none());
}
