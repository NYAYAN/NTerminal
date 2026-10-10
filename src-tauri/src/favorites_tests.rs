//! Favori deposunun davranis testleri.

use super::*;
use std::sync::atomic::{AtomicU32, Ordering};

static COUNTER: AtomicU32 = AtomicU32::new(0);

fn temp_paths(name: &str) -> DataPaths {
    let n = COUNTER.fetch_add(1, Ordering::SeqCst);
    let root = std::env::temp_dir().join(format!("nterminal-fav-{name}-{}-{n}", std::process::id()));
    let _ = std::fs::remove_dir_all(&root);
    let paths = DataPaths { root, portable: true };
    paths.ensure().unwrap();
    paths
}

fn req(command: &str) -> NewFavorite {
    NewFavorite {
        command: command.into(),
        label: None,
        note: None,
        group_id: None,
        folder: None,
        cwd: None,
        alias: None,
    }
}

#[test]
fn ekleme_ve_listeleme() {
    let store = FavoriteStore::load(temp_paths("add"));
    let fav = store
        .add(NewFavorite {
            command: "  npm run build  ".into(),
            label: Some("  Derle  ".into()),
            note: Some("".into()),
            group_id: None,
            folder: None,
            cwd: None,
            alias: None,
        })
        .unwrap();

    // Bosluklar kirpilmali, bos not None olmali.
    assert_eq!(fav.command, "npm run build");
    assert_eq!(fav.label.as_deref(), Some("Derle"));
    assert!(fav.note.is_none());
    assert_eq!(store.list().len(), 1);
}

#[test]
fn bos_komut_reddedilir() {
    let store = FavoriteStore::load(temp_paths("empty"));
    assert!(store.add(req("   ")).is_err());
    assert!(store.list().is_empty());
}

#[test]
fn ayni_komut_iki_kez_eklenmez() {
    let store = FavoriteStore::load(temp_paths("dup"));
    let first = store.add(req("git status")).unwrap();
    let second = store.add(req("git status")).unwrap();
    // Ayni kayit geri donmeli; liste kirlenmemeli.
    assert_eq!(first.id, second.id);
    assert_eq!(store.list().len(), 1);
}

#[test]
fn guncelleme_alanlari_ayirt_eder() {
    let store = FavoriteStore::load(temp_paths("update"));
    let fav = store
        .add(NewFavorite {
            command: "dotnet test".into(),
            label: Some("Test".into()),
            note: Some("hizli".into()),
            group_id: None,
            folder: None,
            cwd: None,
            alias: None,
        })
        .unwrap();

    // Yalnizca komutu degistir: label ve note korunmali (None = dokunma).
    let updated = store
        .update(
            &fav.id,
            FavoritePatch {
                command: Some("dotnet test --no-build".into()),
                ..Default::default()
            },
        )
        .unwrap()
        .unwrap();
    assert_eq!(updated.command, "dotnet test --no-build");
    assert_eq!(updated.label.as_deref(), Some("Test"));
    assert_eq!(updated.note.as_deref(), Some("hizli"));

    // Some(None) = temizle.
    let cleared = store
        .update(
            &fav.id,
            FavoritePatch {
                note: Some(None),
                ..Default::default()
            },
        )
        .unwrap()
        .unwrap();
    assert!(cleared.note.is_none());
    assert_eq!(cleared.label.as_deref(), Some("Test"), "label etkilenmemeli");
}

#[test]
fn guncellemede_bos_komut_reddedilir() {
    let store = FavoriteStore::load(temp_paths("update-empty"));
    let fav = store.add(req("ls")).unwrap();
    assert!(store
        .update(
            &fav.id,
            FavoritePatch { command: Some("  ".into()), ..Default::default() }
        )
        .is_err());
    // Kayit bozulmamali.
    assert_eq!(store.list()[0].command, "ls");
}

#[test]
fn olmayan_kimlik_none_doner() {
    let store = FavoriteStore::load(temp_paths("missing"));
    assert!(store.update("yok", FavoritePatch::default()).unwrap().is_none());
}

#[test]
fn silme() {
    let store = FavoriteStore::load(temp_paths("remove"));
    let a = store.add(req("a")).unwrap();
    store.add(req("b")).unwrap();
    assert_eq!(store.remove(&[a.id]).unwrap(), 1);
    assert_eq!(store.list().len(), 1);
    assert_eq!(store.list()[0].command, "b");
}

#[test]
fn komuta_gore_silme() {
    let store = FavoriteStore::load(temp_paths("remove-cmd"));
    store.add(req("git pull")).unwrap();
    store.add(req("git push")).unwrap();
    // Gecmisteki yildiza tekrar basmak bu yolu kullaniyor.
    assert_eq!(store.remove_by_command("  git pull  ").unwrap(), 1);
    assert_eq!(store.list().len(), 1);
    assert_eq!(store.list()[0].command, "git push");
}

#[test]
fn siralama_eksik_kimliklerle_veri_kaybetmez() {
    let store = FavoriteStore::load(temp_paths("reorder"));
    let a = store.add(req("a")).unwrap();
    let b = store.add(req("b")).unwrap();
    let c = store.add(req("c")).unwrap();

    // Arayuz eski bir kopyayla yalnizca iki kimlik gonderdi.
    store.reorder(&[c.id.clone(), a.id.clone()]).unwrap();

    let list = store.list();
    assert_eq!(list.len(), 3, "sirada gecmeyen kayit silinmemeli");
    assert_eq!(list[0].command, "c");
    assert_eq!(list[1].command, "a");
    assert_eq!(list[2].command, "b", "gecmeyen kayit sona eklenmeli");

    // Olmayan kimlik yok sayilmali.
    store.reorder(&["yok".into(), b.id]).unwrap();
    assert_eq!(store.list().len(), 3);
    assert_eq!(store.list()[0].command, "b");
}

#[test]
fn kullanim_sayaci() {
    let store = FavoriteStore::load(temp_paths("used"));
    let fav = store.add(req("make")).unwrap();
    assert_eq!(fav.used_count, 0);
    assert!(fav.last_used_at.is_none());

    store.mark_used(&fav.id).unwrap();
    store.mark_used(&fav.id).unwrap();

    let list = store.list();
    assert_eq!(list[0].used_count, 2);
    assert!(list[0].last_used_at.is_some());
}

#[test]
fn diskten_yeniden_okunabilir() {
    let paths = temp_paths("reload");
    {
        let store = FavoriteStore::load(paths.clone());
        store
            .add(NewFavorite {
                command: "cargo watch".into(),
                label: Some("Izle".into()),
                note: None,
                group_id: Some("g1".into()),
                folder: None,
                cwd: Some("C:\\proje".into()),
                alias: None,
            })
            .unwrap();
    }
    let reopened = FavoriteStore::load(paths);
    let list = reopened.list();
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].command, "cargo watch");
    assert_eq!(list[0].label.as_deref(), Some("Izle"));
    assert_eq!(list[0].group_id.as_deref(), Some("g1"));
    assert_eq!(list[0].cwd.as_deref(), Some("C:\\proje"));
}

#[test]
fn bozuk_dosya_uygulamayi_dusurmez() {
    let paths = temp_paths("corrupt");
    std::fs::write(paths.favorites_file(), "{ bu json degil").unwrap();
    // Bos liste ile aciliyor, panik yok.
    let store = FavoriteStore::load(paths);
    assert!(store.list().is_empty());
    // Ve uzerine yazilabiliyor.
    store.add(req("kurtarildi")).unwrap();
    assert_eq!(store.list().len(), 1);
}

#[test]
fn ice_alma_ayni_komutu_tekrarlamaz() {
    let store = FavoriteStore::load(temp_paths("ingest"));
    store.add(req("mevcut")).unwrap();

    let incoming = vec![
        Favorite {
            id: "fav-x".into(),
            command: "mevcut".into(), // ayni komut: atlanmali
            label: None,
            note: None,
            group_id: None,
            folder: None,
            cwd: None,
            alias: None,
            created_at: 1,
            used_count: 0,
            last_used_at: None,
        },
        Favorite {
            id: "fav-y".into(),
            command: "gelen".into(),
            label: Some("Gelen".into()),
            note: None,
            group_id: None,
            folder: None,
            cwd: None,
            alias: None,
            created_at: 2,
            used_count: 5,
            last_used_at: Some(9),
        },
    ];
    assert_eq!(store.ingest(incoming, false).unwrap(), 1);
    let list = store.list();
    assert_eq!(list.len(), 2);
    assert!(list.iter().any(|f| f.command == "gelen"));
}

#[test]
fn ice_alma_replace_temizler() {
    let store = FavoriteStore::load(temp_paths("ingest-replace"));
    store.add(req("eski")).unwrap();
    let incoming = vec![Favorite {
        id: "fav-y".into(),
        command: "yeni".into(),
        label: None,
        note: None,
        group_id: None,
        folder: None,
        cwd: None,
        alias: None,
        created_at: 2,
        used_count: 0,
        last_used_at: None,
    }];
    store.ingest(incoming, true).unwrap();
    let list = store.list();
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].command, "yeni");
}

/// Favori klasoru: ekleme, guncelleme, temizleme ve diskten geri okuma.
///
/// ISTEK: "favorilerde gruplama olsun". Klasor ayri bir varlik degil, favorinin
/// uzerinde duran serbest bir metin - bu yuzden asil risk `clean()` ve yama
/// semantiginde: `None` = dokunma, `Some(None)` = temizle. Ikisini karistirmak
/// kullanicinin klasorunu sessizce silerdi.
#[test]
fn favori_klasoru_kaydediliyor_ve_temizlenebiliyor() {
    let paths = temp_paths("folder");
    let dir = paths.root.clone();
    let store = FavoriteStore::load(paths);

    let eklenen = store
        .add(NewFavorite {
            command: "npm test".into(),
            label: None,
            note: None,
            group_id: None,
            folder: Some("  Yayin  ".into()),
            cwd: None,
            alias: None,
        })
        .unwrap();
    // Bosluklar kirpiliyor: "Yayin " ile "Yayin" iki ayri klasor olmamali.
    assert_eq!(eklenen.folder.as_deref(), Some("Yayin"));

    // Yama alani YAZILMAZSA klasore dokunulmuyor.
    let dokunulmadi = store
        .update(&eklenen.id, FavoritePatch { label: Some(Some("Testler".into())), ..Default::default() })
        .unwrap()
        .unwrap();
    assert_eq!(dokunulmadi.folder.as_deref(), Some("Yayin"), "yama klasoru dusurdu");

    // `Some(None)` = temizle.
    let temizlendi = store
        .update(&eklenen.id, FavoritePatch { folder: Some(None), ..Default::default() })
        .unwrap()
        .unwrap();
    assert_eq!(temizlendi.folder, None);

    // Bos metin de "klasorsuz" demek.
    let bos = store
        .update(&eklenen.id, FavoritePatch { folder: Some(Some("   ".into())), ..Default::default() })
        .unwrap()
        .unwrap();
    assert_eq!(bos.folder, None);

    // Diskten yeniden okundugunda klasor duruyor.
    store
        .update(&eklenen.id, FavoritePatch { folder: Some(Some("Test".into())), ..Default::default() })
        .unwrap();
    let yeniden = FavoriteStore::load(DataPaths { root: dir.clone(), portable: true });
    assert_eq!(yeniden.list()[0].folder.as_deref(), Some("Test"));

    let _ = std::fs::remove_dir_all(&dir);
}

/// Klasor alanini BILMEYEN eski bir favorites.json okunabilmeli.
#[test]
fn eski_favori_dosyasi_klasorsuz_okunuyor() {
    let paths = temp_paths("folder-eski");
    let dir = paths.root.clone();
    std::fs::write(
        paths.favorites_file(),
        r#"[{"id":"f1","command":"ls","createdAt":0,"usedCount":0}]"#,
    )
    .unwrap();

    let store = FavoriteStore::load(paths);
    let items = store.list();
    assert_eq!(items.len(), 1, "eski dosya okunamadi");
    assert_eq!(items[0].folder, None);

    let _ = std::fs::remove_dir_all(&dir);
}

/// Arayuz yamayi JSON olarak gonderiyor; "alan yok" ile "alan null" ayrimi
/// COZUMLEME asamasinda kayboluyordu. Yapiyi elle kuran testler bunu
/// gormuyordu: klasor yolunu bosaltip kaydetmek hicbir sey yapmiyordu.
#[test]
fn json_yamada_null_temizle_demek() {
    let yok: FavoritePatch = serde_json::from_str(r#"{"label":"Ad"}"#).unwrap();
    assert_eq!(yok.cwd, None, "gonderilmeyen alan dokunulmamis sayilmali");
    assert_eq!(yok.label, Some(Some("Ad".into())));

    let null: FavoritePatch = serde_json::from_str(r#"{"cwd":null,"folder":null}"#).unwrap();
    assert_eq!(null.cwd, Some(None), "null gonderilen alan temizlenmeli");
    assert_eq!(null.folder, Some(None));

    // Ucu ucuna: kayit gercekten yolunu birakiyor mu?
    let store = FavoriteStore::load(temp_paths("json-null"));
    let eklenen = store
        .add(NewFavorite {
            command: "npm test".into(),
            label: None,
            note: None,
            group_id: None,
            folder: None,
            cwd: Some(r"C:\proje".into()),
            alias: None,
        })
        .unwrap();
    let yama: FavoritePatch = serde_json::from_str(r#"{"cwd":null}"#).unwrap();
    let sonra = store.update(&eklenen.id, yama).unwrap().unwrap();
    assert_eq!(sonra.cwd, None, "klasor yolu silinmedi");
}

fn with_alias(command: &str, alias: &str) -> NewFavorite {
    NewFavorite { alias: Some(alias.into()), ..req(command) }
}

/// Kisaltma (ISTEK: "npm run build --configuration icin nrb dediginde
/// calissin"): kirpiliyor, bos birakmak kaldiriyor, JSON'da null temizliyor.
#[test]
fn kisaltma_kaydediliyor_ve_temizlenebiliyor() {
    let paths = temp_paths("alias");
    let dir = paths.root.clone();
    let store = FavoriteStore::load(paths);

    let eklenen = store.add(with_alias("npm run build --configuration", "  nrb  ")).unwrap();
    assert_eq!(eklenen.alias.as_deref(), Some("nrb"));

    // Alan gonderilmezse kisaltmaya dokunulmuyor.
    let yama: FavoritePatch = serde_json::from_str(r#"{"label":"Derle"}"#).unwrap();
    let dokunulmadi = store.update(&eklenen.id, yama).unwrap().unwrap();
    assert_eq!(dokunulmadi.alias.as_deref(), Some("nrb"), "yama kisaltmayi dusurdu");

    // Diskten yeniden okununca duruyor.
    let yeniden = FavoriteStore::load(DataPaths { root: dir.clone(), portable: true });
    assert_eq!(yeniden.list()[0].alias.as_deref(), Some("nrb"));

    // null ve bos metin kaldiriyor.
    let null: FavoritePatch = serde_json::from_str(r#"{"alias":null}"#).unwrap();
    assert_eq!(store.update(&eklenen.id, null).unwrap().unwrap().alias, None);
    store
        .update(&eklenen.id, FavoritePatch { alias: Some(Some("ysd".into())), ..Default::default() })
        .unwrap();
    let bos = store
        .update(&eklenen.id, FavoritePatch { alias: Some(Some("   ".into())), ..Default::default() })
        .unwrap()
        .unwrap();
    assert_eq!(bos.alias, None);

    let _ = std::fs::remove_dir_all(&dir);
}

/// Kisaltma satirin ILK sozcugu olarak araniyor; icinde bosluk olan bir
/// kisaltma hicbir zaman eslesmezdi. Reddediliyor ve kayda dokunulmuyor.
#[test]
fn kisaltma_tek_sozcuk() {
    let store = FavoriteStore::load(temp_paths("alias-space"));
    assert!(store.add(with_alias("npm test", "n t")).is_err());
    assert!(store.list().is_empty(), "gecersiz kisaltmayla favori eklendi");

    let fav = store.add(with_alias("npm test", "nt")).unwrap();
    let yama = FavoritePatch {
        label: Some(Some("Testler".into())),
        alias: Some(Some("n t".into())),
        ..Default::default()
    };
    assert!(store.update(&fav.id, yama).is_err());
    let kayit = &store.list()[0];
    assert_eq!(kayit.alias.as_deref(), Some("nt"));
    assert_eq!(kayit.label, None, "gecersiz yamanin diger alanlari yazildi");
}

/// Iki favori ayni kisaltmayi alirsa hangisinin calisacagi belirsiz kalirdi.
#[test]
fn kisaltma_tekil() {
    let store = FavoriteStore::load(temp_paths("alias-unique"));
    let nrb = store.add(with_alias("npm run build", "nrb")).unwrap();
    assert!(store.add(with_alias("yarn build", "nrb")).is_err());

    let ysd = store.add(with_alias("yarn start:dev", "ysd")).unwrap();
    let cakisan = FavoritePatch { alias: Some(Some("nrb".into())), ..Default::default() };
    assert!(store.update(&ysd.id, cakisan).is_err());

    // Kendi kisaltmasini yeniden yazmak cakisma degil.
    let ayni = FavoritePatch { alias: Some(Some("nrb".into())), ..Default::default() };
    assert_eq!(store.update(&nrb.id, ayni).unwrap().unwrap().alias.as_deref(), Some("nrb"));
}

/// Ice alma favoriyi KAYBETMIYOR: kisaltmasi burada baskasindaysa kayit
/// kisaltmasiz geliyor.
#[test]
fn ice_almada_cakisan_kisaltma_dusuyor() {
    let store = FavoriteStore::load(temp_paths("alias-ingest"));
    store.add(with_alias("npm run build", "nrb")).unwrap();
    let gelen = |id: &str, command: &str, alias: &str| Favorite {
        id: id.into(),
        command: command.into(),
        label: None,
        note: None,
        group_id: None,
        folder: None,
        cwd: None,
        alias: Some(alias.into()),
        created_at: 0,
        used_count: 0,
        last_used_at: None,
    };
    let incoming = vec![gelen("f1", "yarn build", "nrb"), gelen("f2", "yarn start:dev", "ysd")];
    assert_eq!(store.ingest(incoming, false).unwrap(), 2);

    let list = store.list();
    let alias_of = |command: &str| list.iter().find(|f| f.command == command).unwrap().alias.clone();
    assert_eq!(alias_of("npm run build").as_deref(), Some("nrb"));
    assert_eq!(alias_of("yarn build"), None, "cakisan kisaltma ice alindi");
    assert_eq!(alias_of("yarn start:dev").as_deref(), Some("ysd"));
}

/// Kisaltma alanini BILMEYEN eski bir favorites.json okunabilmeli.
#[test]
fn eski_favori_dosyasi_kisaltmasiz_okunuyor() {
    let paths = temp_paths("alias-eski");
    std::fs::write(paths.favorites_file(), r#"[{"id":"f1","command":"ls","createdAt":0,"usedCount":0}]"#).unwrap();
    let store = FavoriteStore::load(paths);
    assert_eq!(store.list()[0].alias, None);
}

/// BILDIRILEN: favorideki `yarn start:dev` formdan `yysd` kisaltmasiyla
/// yeniden eklendi; `add` var olan kaydi oldugu gibi dondurdu, form kaydedilmis
/// gibi kapandi ve kisaltma hicbir yere yazilmadi. Kayitta olmayan bir alan
/// getiren istek artik HATA - basari gibi gorunup yazilani yutmuyor.
#[test]
fn mevcut_komuta_yeni_alan_sessizce_yutulmuyor() {
    let store = FavoriteStore::load(temp_paths("dup-fields"));
    let fav = store.add(req("yarn start:dev")).unwrap();

    let err = store.add(with_alias("  yarn start:dev  ", "yysd")).unwrap_err();
    assert!(err.to_string().contains("zaten favorilerde"), "beklenmeyen hata: {err}");

    // Her alan tek basina yetiyor: biri bile kayitta yoksa istek reddediliyor.
    let alanlar: [(&str, fn(&mut NewFavorite)); 6] = [
        ("label", |r| r.label = Some("Dev sunucu".into())),
        ("note", |r| r.note = Some("once npm i".into())),
        ("group_id", |r| r.group_id = Some("g1".into())),
        ("folder", |r| r.folder = Some("Yatas".into())),
        ("cwd", |r| r.cwd = Some("/proje".into())),
        ("alias", |r| r.alias = Some("ysd".into())),
    ];
    for (alan, doldur) in alanlar {
        let mut istek = req("yarn start:dev");
        doldur(&mut istek);
        assert!(store.add(istek).is_err(), "{alan} sessizce yutuldu");
    }

    let list = store.list();
    assert_eq!(list.len(), 1, "ikinci kayit acildi");
    assert_eq!(list[0].id, fav.id);
    assert_eq!(list[0].alias, None, "reddedilen istek kayda yazildi");
    assert_eq!(list[0].label, None);
}

/// Yildiz yolu degismedi: ayni istegi tekrarlamak (yildiza ya da Enter'a iki
/// kez basmak) hata degil, ayni kaydi donduruyor. Bos alan "belirtilmedi"
/// demek: yalniz komut gonderen yildiz kayittaki ad ve kisaltmayi silmiyor.
#[test]
fn ayni_istegi_tekrarlamak_ayni_kaydi_donduruyor() {
    let store = FavoriteStore::load(temp_paths("dup-same"));
    let tam = || NewFavorite {
        label: Some("Derle".into()),
        cwd: Some("/proje".into()),
        ..with_alias("npm run build", "nrb")
    };
    let ilk = store.add(tam()).unwrap();

    // Kisaltma KENDI kaydinda: "baska bir favoride kullaniliyor" denmemeli.
    let tekrar = store.add(tam()).unwrap();
    assert_eq!(tekrar.id, ilk.id);

    let yildiz = store.add(req(" npm run build ")).unwrap();
    assert_eq!(yildiz.id, ilk.id);
    assert_eq!(yildiz.alias.as_deref(), Some("nrb"), "yildiz kisaltmayi dusurdu");
    assert_eq!(yildiz.label.as_deref(), Some("Derle"));

    // Kaydin bir kismini ayniyla getiren istek de karsilanmis sayiliyor.
    let kismi = store.add(NewFavorite { label: Some("  Derle ".into()), ..req("npm run build") }).unwrap();
    assert_eq!(kismi.id, ilk.id);
    assert_eq!(store.list().len(), 1);
}

/// Komut favoriler arasinda tekil: duzenleme baska bir favorinin komutunu
/// alirsa gecmisteki yildiz (`remove_by_command`) ikisini birden silerdi.
/// Reddedilen yamanin hicbir alani yazilmiyor.
#[test]
fn duzenleme_baska_favorinin_komutunu_alamiyor() {
    let store = FavoriteStore::load(temp_paths("dup-update"));
    store.add(req("npm test")).unwrap();
    let diger = store.add(req("npm run test")).unwrap();

    let yama = FavoritePatch {
        command: Some("  npm test ".into()),
        label: Some(Some("Testler".into())),
        ..Default::default()
    };
    let err = store.update(&diger.id, yama).unwrap_err();
    assert!(err.to_string().contains("zaten favorilerde"), "beklenmeyen hata: {err}");

    let kayit = store.list().into_iter().find(|f| f.id == diger.id).unwrap();
    assert_eq!(kayit.command, "npm run test");
    assert_eq!(kayit.label, None, "reddedilen yamanin diger alanlari yazildi");

    // Kendi komutunu yeniden yazmak cakisma degil (form komutu her kayitta gonderiyor).
    let ayni = FavoritePatch { command: Some("npm run test".into()), ..Default::default() };
    assert!(store.update(&diger.id, ayni).unwrap().is_some());
}

/// Bu kural yokken duzenlemeyle olusmus bir cift kayitlari KILITLEMEMELI:
/// komutu degismeyen yama denetlenmiyor.
#[test]
fn eski_cift_komutlu_kayit_duzenlenebiliyor() {
    let paths = temp_paths("dup-legacy");
    std::fs::write(
        paths.favorites_file(),
        r#"[{"id":"a","command":"ls","createdAt":0,"usedCount":0},
            {"id":"b","command":"ls","createdAt":0,"usedCount":0}]"#,
    )
    .unwrap();
    let store = FavoriteStore::load(paths);
    let yama = FavoritePatch {
        command: Some("ls".into()),
        label: Some(Some("Liste".into())),
        ..Default::default()
    };
    let kayit = store.update("b", yama).unwrap().unwrap();
    assert_eq!(kayit.label.as_deref(), Some("Liste"));
}
