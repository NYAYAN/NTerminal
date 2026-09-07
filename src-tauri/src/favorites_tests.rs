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
        })
        .unwrap();
    let yama: FavoritePatch = serde_json::from_str(r#"{"cwd":null}"#).unwrap();
    let sonra = store.update(&eklenen.id, yama).unwrap().unwrap();
    assert_eq!(sonra.cwd, None, "klasor yolu silinmedi");
}
