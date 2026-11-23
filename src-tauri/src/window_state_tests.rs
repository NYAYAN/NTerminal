//! Kaydedilen pencerenin bugunku ekranlara yerlestirilmesi.
//!
//! BILDIRILEN: "her pc'yi actigimda terminal farkli boyutta geliyor." Kayit
//! geri gelmeli; ama ekran duzeni degistiyse (harici ekran cikarildi, olcek
//! degisti) pencere ekranin disinda ya da ekrandan buyuk acilmamali.

use super::*;

const MIN: (u32, u32) = (760, 460);

/// Dizustu: 1920x1080, ustte 25 piksellik menu cubugu.
const LAPTOP: Area = Area { x: 0, y: 25, width: 1920, height: 1055 };
/// Sagdaki harici ekran: 2560x1440.
const EXTERNAL: Area = Area { x: 1920, y: 0, width: 2560, height: 1440 };

fn b(x: i32, y: i32, width: u32, height: u32) -> Bounds {
    Bounds { x, y, width, height, maximized: false }
}

#[test]
fn ekrana_sigan_kayit_oldugu_gibi_geri_geliyor() {
    let saved = b(100, 80, 1200, 800);
    assert_eq!(placement(saved, &[LAPTOP], 0, MIN), Some(saved));
    // Harici ekrandaki pencere de yerinde.
    let there = b(2100, 200, 1800, 1000);
    assert_eq!(placement(there, &[LAPTOP, EXTERNAL], 0, MIN), Some(there));
}

#[test]
fn buyutulmus_bayragi_korunuyor() {
    let saved = Bounds { maximized: true, ..b(100, 80, 1200, 800) };
    assert_eq!(placement(saved, &[LAPTOP], 0, MIN).map(|p| p.maximized), Some(true));
}

#[test]
fn ekran_artik_yoksa_ana_ekrana_sigdirilip_ortalaniyor() {
    // Harici ekranda kaydedildi, bugun yalnizca dizustu var.
    let saved = b(2100, 200, 2400, 1300);
    let placed = placement(saved, &[LAPTOP], 0, MIN).unwrap();
    assert_eq!((placed.width, placed.height), (1920, 1055), "ekrandan buyuk acildi");
    assert_eq!((placed.x, placed.y), (0, 25));

    let small = b(3000, 300, 1000, 700);
    let placed = placement(small, &[LAPTOP], 0, MIN).unwrap();
    assert_eq!((placed.width, placed.height), (1000, 700));
    assert_eq!((placed.x, placed.y), (460, 25 + (1055 - 700) / 2), "ortalanmadi");
}

#[test]
fn ekran_tasan_pencere_iceri_cekiliyor() {
    // Sag alt kismi ekranin disinda (ekran cozunurlugu dustu): pencere
    // tumuyle ekrana cekiliyor, kenarlari gorunmeli.
    let saved = b(1500, 700, 1000, 600);
    let placed = placement(saved, &[LAPTOP], 0, MIN).unwrap();
    assert_eq!(placed, b(920, 480, 1000, 600));
    // Ust kenari menu cubugunun altinda.
    let up = b(100, -40, 800, 600);
    assert_eq!(placement(up, &[LAPTOP], 0, MIN).unwrap().y, 25);
}

#[test]
fn ortasi_hicbir_ekranda_degilse_en_cok_ortustugu_ekran() {
    // Ortasi iki ekranin da disinda (asagida), harici ekranla daha cok ortusuyor.
    let saved = b(1800, 1100, 1200, 800);
    let placed = placement(saved, &[LAPTOP, EXTERNAL], 0, MIN).unwrap();
    assert!(placed.x >= EXTERNAL.x, "harici ekrana yerlesmedi: {placed:?}");
    assert!(placed.y as i64 + placed.height as i64 <= EXTERNAL.y as i64 + EXTERNAL.height as i64);
}

#[test]
fn en_kucuk_boyutun_altina_inmiyor_ana_ekran_secimi_sinirli() {
    let tiny = b(100, 100, 200, 100);
    let placed = placement(tiny, &[LAPTOP], 0, MIN).unwrap();
    assert_eq!((placed.width, placed.height), MIN);
    // Gecersiz ana ekran sirasi dusmuyor.
    assert!(placement(b(9000, 9000, 900, 600), &[LAPTOP], 7, MIN).is_some());
    // Ekran listesi okunamadiysa dokunulmuyor.
    assert_eq!(placement(tiny, &[], 0, MIN), None);
}

#[test]
fn kayit_dosyasi_yazilip_okunuyor_bozugu_yok_sayiliyor() {
    let dir = std::env::temp_dir().join(format!("nterminal-window-state-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join(FILE);
    let saved = Bounds { maximized: true, ..b(10, 20, 1300, 850) };
    save(&path, &saved);
    assert_eq!(load(&path), Some(saved));
    assert!(!path.with_extension("json.tmp").exists(), "gecici dosya kaldi");

    std::fs::write(&path, "{yarim").unwrap();
    assert_eq!(load(&path), None);
    std::fs::write(&path, r#"{"x":0,"y":0,"width":0,"height":0}"#).unwrap();
    assert_eq!(load(&path), None, "sifir boyut gecerli sayildi");
    let _ = std::fs::remove_dir_all(&dir);
}
