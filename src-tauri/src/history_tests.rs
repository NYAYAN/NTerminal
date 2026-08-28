//! Gecmis deposunun davranis testleri.

use super::*;
use crate::model::HistoryEntry;
use std::sync::atomic::{AtomicU32, Ordering};

static COUNTER: AtomicU32 = AtomicU32::new(0);

fn temp_paths(name: &str) -> DataPaths {
    let n = COUNTER.fetch_add(1, Ordering::SeqCst);
    let root = std::env::temp_dir().join(format!(
        "nterminal-test-{name}-{}-{n}",
        std::process::id()
    ));
    let _ = std::fs::remove_dir_all(&root);
    let paths = DataPaths { root, portable: true };
    paths.ensure().unwrap();
    paths
}

fn req(command: &str, tab: &str) -> NewHistoryEntry {
    NewHistoryEntry {
        command: command.into(),
        tab_id: tab.into(),
        group_id: "g1".into(),
        profile_id: "p1".into(),
        cwd: Some("C:\\proje".into()),
        source: None,
    }
}

#[test]
fn kayit_ekleme_ve_tamamlama() {
    let store = HistoryStore::load(temp_paths("add"), 1000);
    let entry = store.add(req("git status", "t1")).unwrap();
    assert!(entry.exit_code.is_none(), "yeni kayit henuz bitmemis olmali");

    store.finish(&entry.id, Some(0), Some(120)).unwrap();
    let page = store.query(&HistoryFilter::default());
    assert_eq!(page.entries.len(), 1);
    assert_eq!(page.entries[0].exit_code, Some(0));
    assert_eq!(page.entries[0].duration_ms, Some(120));
}

#[test]
fn sekme_ve_grup_filtresi() {
    let store = HistoryStore::load(temp_paths("filter"), 1000);
    store.add(req("a", "t1")).unwrap();
    store.add(req("b", "t2")).unwrap();
    store.add(req("c", "t1")).unwrap();

    let only_t1 = store.query(&HistoryFilter {
        tab_id: Some("t1".into()),
        ..Default::default()
    });
    assert_eq!(only_t1.total, 2);
    // En yeni once siralanmali: gecmis paneli boyle gosteriyor.
    assert_eq!(only_t1.entries[0].command, "c");

    let group = store.query(&HistoryFilter {
        group_id: Some("g1".into()),
        ..Default::default()
    });
    assert_eq!(group.total, 3);
}

#[test]
fn arama_komut_ve_dizinde_gecer() {
    let store = HistoryStore::load(temp_paths("search"), 1000);
    store.add(req("npm run build", "t1")).unwrap();
    store.add(req("cargo test", "t1")).unwrap();

    assert_eq!(
        store
            .query(&HistoryFilter { query: Some("cargo".into()), ..Default::default() })
            .total,
        1
    );
    // Dizin de aranabilir alan.
    assert_eq!(
        store
            .query(&HistoryFilter { query: Some("proje".into()), ..Default::default() })
            .total,
        2
    );
    // Buyuk/kucuk harf onemsiz.
    assert_eq!(
        store
            .query(&HistoryFilter { query: Some("NPM".into()), ..Default::default() })
            .total,
        1
    );
}

#[test]
fn basari_filtresi_bitmemis_kayitlari_dislar() {
    let store = HistoryStore::load(temp_paths("outcome"), 1000);
    let ok = store.add(req("ok", "t1")).unwrap();
    store.finish(&ok.id, Some(0), Some(5)).unwrap();
    let bad = store.add(req("bad", "t1")).unwrap();
    store.finish(&bad.id, Some(1), Some(5)).unwrap();
    store.add(req("calisiyor", "t1")).unwrap();

    assert_eq!(
        store
            .query(&HistoryFilter { only_succeeded: Some(true), ..Default::default() })
            .total,
        1
    );
    assert_eq!(
        store
            .query(&HistoryFilter { only_succeeded: Some(false), ..Default::default() })
            .total,
        1
    );
    assert_eq!(store.query(&HistoryFilter::default()).total, 3);
}

#[test]
fn tekrarlari_toplama() {
    let store = HistoryStore::load(temp_paths("dedupe"), 1000);
    store.add(req("ls", "t1")).unwrap();
    store.add(req("ls", "t1")).unwrap();
    store.add(req("pwd", "t1")).unwrap();

    assert_eq!(store.query(&HistoryFilter::default()).total, 3);
    assert_eq!(
        store
            .query(&HistoryFilter { dedupe: true, ..Default::default() })
            .total,
        2
    );
}

#[test]
fn sinir_asilinca_en_eskiler_silinir() {
    let store = HistoryStore::load(temp_paths("limit"), 100);
    for i in 0..150 {
        store.add(req(&format!("komut-{i}"), "t1")).unwrap();
    }
    let page = store.query(&HistoryFilter::default());
    assert_eq!(page.grand_total, 100);
    assert_eq!(page.entries[0].command, "komut-149");
    assert!(
        !page.entries.iter().any(|e| e.command == "komut-0"),
        "en eski kayit silinmis olmali"
    );
}

#[test]
fn diskten_yeniden_okunabilir() {
    let paths = temp_paths("reload");
    let id = {
        let store = HistoryStore::load(paths.clone(), 1000);
        let entry = store.add(req("dotnet build", "t1")).unwrap();
        store.finish(&entry.id, Some(2), Some(4200)).unwrap();
        entry.id
    };

    // Ayni klasorden yeni bir depo: gunluk yeniden oynatilmali.
    let reopened = HistoryStore::load(paths, 1000);
    let page = reopened.query(&HistoryFilter::default());
    assert_eq!(page.total, 1);
    assert_eq!(page.entries[0].id, id);
    assert_eq!(
        page.entries[0].exit_code,
        Some(2),
        "tamamlanma bilgisi de korunmali"
    );
    assert_eq!(page.entries[0].duration_ms, Some(4200));
}

#[test]
fn silme_diske_de_yansir() {
    let paths = temp_paths("delete");
    {
        let store = HistoryStore::load(paths.clone(), 1000);
        let a = store.add(req("a", "t1")).unwrap();
        store.add(req("b", "t1")).unwrap();
        assert_eq!(store.delete(&[a.id]).unwrap(), 1);
    }

    let reopened = HistoryStore::load(paths, 1000);
    let page = reopened.query(&HistoryFilter::default());
    assert_eq!(page.total, 1);
    assert_eq!(page.entries[0].command, "b");
}

#[test]
fn kapsam_temizleme_yalnizca_o_sekmeyi_siler() {
    let paths = temp_paths("clear");
    {
        let store = HistoryStore::load(paths.clone(), 1000);
        store.add(req("a", "t1")).unwrap();
        store.add(req("b", "t2")).unwrap();

        let removed = store
            .clear(&HistoryFilter { tab_id: Some("t1".into()), ..Default::default() })
            .unwrap();
        assert_eq!(removed, 1);
    }

    let reopened = HistoryStore::load(paths, 1000);
    let page = reopened.query(&HistoryFilter::default());
    assert_eq!(page.total, 1);
    assert_eq!(page.entries[0].tab_id, "t2");
}

#[test]
fn ice_alma_ayni_kaydi_iki_kez_yazmaz() {
    let store = HistoryStore::load(temp_paths("ingest"), 1000);
    let existing = store.add(req("mevcut", "t1")).unwrap();

    let incoming = vec![
        existing.clone(), // ayni id: atlanmali
        HistoryEntry {
            id: "h-gelen".into(),
            command: "gelen".into(),
            tab_id: "t9".into(),
            group_id: "g9".into(),
            profile_id: "p9".into(),
            cwd: None,
            started_at: 1,
            duration_ms: Some(1),
            exit_code: Some(0),
            source: "import".into(),
        },
    ];
    assert_eq!(store.ingest(incoming, false).unwrap(), 1);

    let page = store.query(&HistoryFilter::default());
    assert_eq!(page.total, 2);
    // started_at'e gore siralandigi icin gelen (1 ms) en eski olmali.
    assert_eq!(page.entries.last().unwrap().command, "gelen");
}

#[test]
fn ice_alma_replace_mevcut_gecmisi_temizler() {
    let store = HistoryStore::load(temp_paths("ingest-replace"), 1000);
    store.add(req("eski", "t1")).unwrap();

    let incoming = vec![HistoryEntry {
        id: "h-yeni".into(),
        command: "yeni".into(),
        tab_id: "t9".into(),
        group_id: "g9".into(),
        profile_id: "p9".into(),
        cwd: None,
        started_at: 5,
        duration_ms: None,
        exit_code: None,
        source: "import".into(),
    }];
    store.ingest(incoming, true).unwrap();

    let page = store.query(&HistoryFilter::default());
    assert_eq!(page.total, 1);
    assert_eq!(page.entries[0].command, "yeni");
}

#[test]
fn gunluk_sisince_sikistirilir() {
    let paths = temp_paths("compact");
    let store = HistoryStore::load(paths.clone(), 5000);
    // Her komut iki satir yaziyor (add + fin), COMPACT_MIN_LINES asilmali.
    for i in 0..1600 {
        let entry = store.add(req(&format!("k{i}"), "t1")).unwrap();
        store.finish(&entry.id, Some(0), Some(1)).unwrap();
    }
    let lines = std::fs::read_to_string(paths.history_file())
        .unwrap()
        .lines()
        .filter(|l| !l.trim().is_empty())
        .count();
    let live = store.query(&HistoryFilter::default()).grand_total;
    assert_eq!(live, 1600);
    assert!(
        lines <= live * COMPACT_RATIO,
        "gunluk sikistirilmamis: {lines} satir / {live} kayit"
    );

    // Sikistirmadan sonra da tam veri okunabilmeli.
    let reopened = HistoryStore::load(paths, 5000);
    let page = reopened.query(&HistoryFilter::default());
    assert_eq!(page.total, 1600);
    assert!(page.entries.iter().all(|e| e.exit_code == Some(0)));
}

#[test]
fn istatistikler_dogru_sayar() {
    let store = HistoryStore::load(temp_paths("stats"), 1000);
    let a = store.add(req("a", "t1")).unwrap();
    store.finish(&a.id, Some(0), Some(1)).unwrap();
    let b = store.add(req("b", "t1")).unwrap();
    store.finish(&b.id, Some(1), Some(1)).unwrap();
    store.add(req("c", "t1")).unwrap();

    let stats = store.stats();
    assert_eq!(stats.total, 3);
    assert_eq!(stats.succeeded, 1);
    assert_eq!(stats.failed, 1);
    assert_eq!(stats.running, 1);
}

#[test]
fn bozuk_satir_gecmisi_bosaltmaz() {
    let paths = temp_paths("corrupt");
    {
        let store = HistoryStore::load(paths.clone(), 1000);
        store.add(req("saglam", "t1")).unwrap();
    }
    // Yarim yazilmis bir satir ekle (elektrik kesintisi senaryosu).
    {
        use std::io::Write as _;
        let mut f = std::fs::OpenOptions::new()
            .append(true)
            .open(paths.history_file())
            .unwrap();
        f.write_all(b"{\"t\":\"add\",\"id\":\"yarim\"").unwrap();
    }

    let reopened = HistoryStore::load(paths, 1000);
    let page = reopened.query(&HistoryFilter::default());
    assert_eq!(page.total, 1, "bozuk satir yuzunden gecmis kaybedilmemeli");
    assert_eq!(page.entries[0].command, "saglam");
}
