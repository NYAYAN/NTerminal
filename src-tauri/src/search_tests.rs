//! Icerik aramasi.
//!
//! Gercek dosyalar yazip gercek arama kosuyoruz. Kurallarin cogu bir belirtiye
//! karsilik geliyor: "aradigim satir listede yok", "isaret yanlis harfte",
//! "arama hic bitmiyor". Konumlar UTF-16 birimi; ornekler bu yuzden Turkce harf
//! ve emoji tasiyor — ASCII'de bayt ile UTF-16 ayni sayiyi verip hatayi saklardi.

use super::*;
use std::process::Command;

fn temp_tree(name: &str) -> PathBuf {
    let root = std::env::temp_dir().join(format!(
        "nterminal-search-{name}-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    let _ = std::fs::remove_dir_all(&root);
    std::fs::create_dir_all(&root).unwrap();
    root
}

fn write(root: &Path, rel: &str, content: &[u8]) {
    let p = root.join(rel);
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent).unwrap();
    }
    std::fs::write(p, content).unwrap();
}

fn git(root: &Path, args: &[&str]) {
    let out = Command::new("git").current_dir(root).args(args).output().expect("git calistirilamadi");
    assert!(out.status.success(), "git {args:?}: {}", String::from_utf8_lossy(&out.stderr));
}

fn opts(case_sensitive: bool, whole_word: bool, regex: bool) -> SearchOptions {
    SearchOptions { case_sensitive, whole_word, regex }
}

fn find(root: &Path, query: &str, o: SearchOptions) -> SearchResult {
    search(root, query, &o, &AtomicBool::new(false)).unwrap()
}

/// Tek dosyalik metinde eslesen satirlar.
fn lines_of(text: &str, query: &str, o: SearchOptions) -> Vec<LineHit> {
    let re = matcher(query, &o).unwrap();
    hits_in(text.as_bytes(), &re, !o.regex)
}

/// Gosterilen metinde isaretlenen parcalar — UTF-16 konumlariyla, arayuzun
/// yapacagi gibi.
fn marked(hit: &LineHit) -> Vec<String> {
    let units: Vec<u16> = hit.text.encode_utf16().collect();
    hit.ranges
        .iter()
        .map(|[s, e]| String::from_utf16(&units[*s as usize..*e as usize]).unwrap())
        .collect()
}

// ----------------------------------------------------------------- eslesme

#[test]
fn duz_metin_satir_numarasi_ve_konumuyla_geliyor() {
    let hits = lines_of("bir\niki foo üç\nfoo\n", "foo", SearchOptions::default());
    assert_eq!(hits.len(), 2);
    assert_eq!((hits[0].line, hits[0].col, hits[0].len), (2, 4, 3));
    assert_eq!(hits[0].text, "iki foo üç");
    assert_eq!(marked(&hits[0]), ["foo"]);
    assert_eq!((hits[1].line, hits[1].col), (3, 0));
}

#[test]
fn varsayilan_buyuk_kucuk_harf_gozetmiyor() {
    // IDE'lerin varsayilani: "useStore" aramasi `UseStore`u da bulmali.
    let hits = lines_of("Foo\nfOO\nbar\n", "foo", SearchOptions::default());
    assert_eq!(hits.iter().map(|h| h.line).collect::<Vec<_>>(), [1, 2]);

    let hits = lines_of("Foo\nfoo\n", "foo", opts(true, false, false));
    assert_eq!(hits.iter().map(|h| h.line).collect::<Vec<_>>(), [2]);
}

#[test]
fn tam_sozcuk_kelimenin_icinde_eslesmiyor() {
    let o = opts(false, true, false);
    let hits = lines_of("foobar\nfoo bar\n_foo\nfoo()\n", "foo", o.clone());
    assert_eq!(hits.iter().map(|h| h.line).collect::<Vec<_>>(), [2, 4]);

    // Sozcuk karakteriyle bitmeyen uca `\b` konmuyor: `foo(` aramasi `foo()`yu
    // bulmali. Sona `\b` koymak "parantezden sonra sozcuk" demek olurdu.
    let hits = lines_of("foo()\nfoo(x)\nxfoo(\n", "foo(", o);
    assert_eq!(hits.iter().map(|h| h.line).collect::<Vec<_>>(), [1, 2]);
}

#[test]
fn tam_sozcuk_turkce_harfleri_sozcuk_sayiyor() {
    // `\b` Unicode'a gore: "çalış" icindeki "alı" bir sozcuk degil.
    let hits = lines_of("çalış\nalı veriş\n", "alı", opts(false, true, false));
    assert_eq!(hits.iter().map(|h| h.line).collect::<Vec<_>>(), [2]);
}

#[test]
fn duz_metinde_ozel_karakterler_kacirilyor() {
    let hits = lines_of("a.b\naxb\n(x)\n", "a.b", SearchOptions::default());
    assert_eq!(hits.iter().map(|h| h.line).collect::<Vec<_>>(), [1]);
    let hits = lines_of("a.b\n(x)\n", "(x)", SearchOptions::default());
    assert_eq!(hits.iter().map(|h| h.line).collect::<Vec<_>>(), [2]);
}

#[test]
fn duzenli_ifade() {
    let hits = lines_of("fo1\nfooo22\nfx\n", r"fo+\d", opts(false, false, true));
    assert_eq!(hits.iter().map(|h| h.line).collect::<Vec<_>>(), [1, 2]);
    assert_eq!(marked(&hits[1]), ["fooo2"]);
}

#[test]
fn duzenli_ifade_satir_satir_uygulaniyor() {
    // `\s` satir sonunu da yakaliyor; butun dosyaya bakilsaydi iki satira
    // yayilan bir eslesme bulunurdu. Eslesme bir SATIRA ait olmali.
    let o = opts(false, false, true);
    assert!(lines_of("a\nbar\n", r"a\s+bar", o.clone()).is_empty());
    assert_eq!(lines_of("a  bar\n", r"a\s+bar", o.clone()).len(), 1);

    // `(?-m)^` butun dosyada yalnizca BASTA eslesirdi; satir satir bakinca her
    // satirin basi. Onceden butun dosyaya bakan bir on suzgec bunu kaciriyordu.
    let hits = lines_of("x\nbar\n", r"(?-m)^bar", o.clone());
    assert_eq!(hits.iter().map(|h| h.line).collect::<Vec<_>>(), [2]);

    // `^` ve `$` her satir icin; CRLF dosyada da.
    let hits = lines_of("foo\r\nbar foo\r\nfoo bar\r\n", "foo$", o);
    assert_eq!(hits.iter().map(|h| h.line).collect::<Vec<_>>(), [1, 2]);
}

#[test]
fn gecersiz_duzenli_ifade_tek_cumlelik_hata() {
    let err = matcher("(foo", &opts(false, false, true)).unwrap_err();
    assert!(err.starts_with(BAD_REGEX), "{err}");
    // Kitapligin cok satirli metni (desen + `^` isareti) arayuze tasinmiyor.
    assert!(!err.contains('\n'), "{err}");
    assert!(err.contains("unclosed group"), "{err}");
}

#[test]
fn bos_eslesmeler_atiliyor() {
    // `x*` her konumda bos bir eslesme bulur; liste her satirla dolardi.
    let hits = lines_of("abc\nxx\n\n", "x*", opts(false, false, true));
    assert_eq!(hits.iter().map(|h| h.line).collect::<Vec<_>>(), [2]);
    assert!(lines_of("abc\n", "^", opts(false, false, true)).is_empty());
}

#[test]
fn crlf_satirinda_satir_sonu_metne_girmiyor() {
    let hits = lines_of("foo\r\nbar foo\r\n", "foo", SearchOptions::default());
    assert_eq!(hits.len(), 2);
    assert_eq!(hits[1].text, "bar foo");
    assert_eq!(hits[1].col, 4);
}

#[test]
fn ayni_satirdaki_eslesmeler_tek_satir() {
    let hits = lines_of("foo foo foo\n", "foo", SearchOptions::default());
    assert_eq!(hits.len(), 1);
    assert_eq!(marked(&hits[0]), ["foo", "foo", "foo"]);
}

#[test]
fn bir_satirda_en_fazla_yirmi_isaret() {
    let line = "ab ".repeat(100);
    let hits = lines_of(&line, "ab", SearchOptions::default());
    assert_eq!(hits.len(), 1);
    // Gosterilen parca kirpiliyor; isaretler onun icinde ve tavanin altinda.
    assert!(hits[0].ranges.len() <= MAX_RANGES);
}

// ---------------------------------------------------------------- konumlar

#[test]
fn konumlar_utf16_birimiyle() {
    // "ğüş " dort karakter ama alti bayt; 😀 bir karakter ama iki UTF-16
    // birimi. Isaret JavaScript dizesinde `slice` ile kesiliyor.
    let hits = lines_of("ğüş foo 😀 foo\n", "foo", SearchOptions::default());
    assert_eq!(hits.len(), 1);
    assert_eq!(hits[0].ranges, vec![[4, 7], [11, 14]]);
    assert_eq!((hits[0].col, hits[0].len), (4, 3));
    assert_eq!(marked(&hits[0]), ["foo", "foo"]);
}

#[test]
fn buyuk_kucuk_harf_gozetmeyen_turkce_eslesme_dogru_yerde() {
    let hits = lines_of("ŞEKER şeker\n", "şeker", SearchOptions::default());
    assert_eq!(marked(&hits[0]), ["ŞEKER", "şeker"]);
}

#[test]
fn bastaki_girinti_atiliyor_konum_tam_satirda_kaliyor() {
    let hits = lines_of("        \tfoo bar\n", "foo", SearchOptions::default());
    assert_eq!(hits[0].text, "foo bar");
    assert_eq!(hits[0].ranges, vec![[0, 3]]);
    // Goruntuleyici TAM satiri gosteriyor: sutun girintiyle birlikte.
    assert_eq!(hits[0].col, 9);
}

#[test]
fn girintinin_icindeki_eslesme_kirpilmiyor() {
    // Bosluk aranirken girintiyi atmak eslesmenin kendisini atmak olurdu.
    let hits = lines_of("    x\n", "  ", SearchOptions::default());
    assert_eq!(hits[0].col, 0);
    assert_eq!(marked(&hits[0])[0], "  ");
}

#[test]
fn uzun_satir_eslesmenin_cevresinden_kirpiliyor() {
    let line = format!("{}foo{}\n", "a".repeat(1000), "b".repeat(1000));
    let hits = lines_of(&line, "foo", SearchOptions::default());
    let hit = &hits[0];
    assert!(hit.text.starts_with('…') && hit.text.ends_with('…'), "{}", hit.text);
    assert!(hit.text.encode_utf16().count() <= SNIPPET_MAX + 2);
    assert_eq!(marked(hit), ["foo"]);
    // Eslesmeden once baglam birakiliyor.
    assert_eq!(hit.ranges[0][0] as usize, SNIPPET_BEFORE + 1);
    assert_eq!(hit.col, 1000);
}

#[test]
fn kirpma_vekil_ciftini_bolmuyor() {
    // Kesim noktasi bir emojinin iki yarisinin arasina denk geliyor.
    for pad in 0..3 {
        let line = format!("{}{}foo\n", "x".repeat(pad), "😀".repeat(40));
        let hits = lines_of(&line, "foo", SearchOptions::default());
        let text = &hits[0].text;
        assert!(!text.contains('\u{FFFD}'), "bolunmus vekil cifti: {text:?}");
        assert_eq!(marked(&hits[0]), ["foo"]);
    }
}

#[test]
fn duz_metin_kestirmesi_satir_satir_aramayla_ayni_sonucu_veriyor() {
    // Duz metinde butun dosyaya tek tarama yapiliyor; sonuc satir satir
    // bakmakla AYNI olmali. Iki yolun ayrismasi en kolay boyle yakalaniyor.
    let text = "a foo\r\n\nfoo foo\nxfoox\n   foo\n\u{1F600}foo\nson";
    for query in ["foo", "o f", "x", "son", "\u{1F600}"] {
        for o in [SearchOptions::default(), opts(true, false, false), opts(false, true, false)] {
            let re = matcher(query, &o).unwrap();
            assert_eq!(
                literal_hits(text.as_bytes(), &re),
                line_by_line_hits(text.as_bytes(), &re),
                "{query:?} {o:?}"
            );
        }
    }
}

#[test]
fn gecersiz_utf8_isareti_kaydirmiyor() {
    // Goruntuleyici gecersiz baytlari U+FFFD gosteriyor; sutun ona gore.
    let mut bytes = b"\xff\xfe foo\n".to_vec();
    bytes.extend_from_slice(b"ok\n");
    let re = matcher("foo", &SearchOptions::default()).unwrap();
    let hits = hits_in(&bytes, &re, true);
    let shown = String::from_utf8_lossy(b"\xff\xfe foo");
    let col = shown.encode_utf16().position(|u| u == u16::from(b'f')).unwrap();
    assert_eq!(hits[0].col as usize, col);
}

// --------------------------------------------------------------- dosyalar

#[test]
fn ikili_dosya_aranmiyor() {
    let root = temp_tree("binary");
    write(&root, "a.bin", b"foo\0bar");
    write(&root, "b.txt", b"foo");
    let res = find(&root, "foo", SearchOptions::default());
    assert_eq!(res.files.iter().map(|f| f.path.as_str()).collect::<Vec<_>>(), ["b.txt"]);
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn buyuk_dosya_atlanip_bildiriliyor() {
    let root = temp_tree("large");
    let mut big = b"foo\n".to_vec();
    big.resize(MAX_FILE_BYTES as usize + 1, b'x');
    write(&root, "big.txt", &big);
    write(&root, "small.txt", b"foo");
    let res = find(&root, "foo", SearchOptions::default());
    assert_eq!(res.skipped_large, 1);
    assert_eq!(res.files.len(), 1);
    assert_eq!(res.files[0].path, "small.txt");
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn sayilar_ve_dosya_sirasi() {
    let root = temp_tree("order");
    write(&root, "b.txt", b"foo\nfoo foo\n");
    write(&root, "A.txt", b"foo\n");
    write(&root, "c/d.txt", b"x\n");
    let res = find(&root, "foo", SearchOptions::default());
    // Harf gozetmeden sirali: `A.txt` buyuk harf diye one atilmiyor, adiyla yerinde.
    let paths: Vec<_> = res.files.iter().map(|f| f.path.as_str()).collect();
    assert_eq!(paths, ["A.txt", "b.txt"]);
    assert_eq!((res.lines, res.matches), (3, 4));
    assert_eq!(res.files[1].matches, 3);
    assert!(!res.truncated);
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn satir_siniri_her_kosuda_ayni_ilk_satirlari_veriyor() {
    // Is parcaciklari dosyalari karisik sirayla bitiriyor; sinir yine de dosya
    // sirasiyla uygulanmali, yoksa ayni arama her seferinde baska sonuc verir.
    let root = temp_tree("limit");
    let body = "foo\n".repeat(700);
    for i in 0..8 {
        write(&root, &format!("f{i}.txt"), body.as_bytes());
    }
    let first = find(&root, "foo", SearchOptions::default());
    assert!(first.truncated);
    assert_eq!(first.lines as usize, MAX_LINES);
    let paths: Vec<_> = first.files.iter().map(|f| f.path.clone()).collect();
    assert_eq!(paths, ["f0.txt", "f1.txt", "f2.txt"]);
    assert_eq!(first.files[2].lines.len(), MAX_LINES - 1400);
    // `searched` karsilastirilmiyor: sinira takilinca ALINMIS dosyalar
    // bitiriliyor ve kac tane alindigi zamanlamaya bagli. Sonucun kendisi degil.
    let key = |r: &SearchResult| (r.files.clone(), r.lines, r.matches, r.truncated);
    for _ in 0..5 {
        assert_eq!(key(&find(&root, "foo", SearchOptions::default())), key(&first));
    }
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn bos_sorgu_bos_sonuc() {
    let root = temp_tree("empty");
    write(&root, "a.txt", b"foo");
    assert_eq!(find(&root, "", SearchOptions::default()), SearchResult::default());
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn klasor_olmayan_kok_hata() {
    let err = search(Path::new("/yok/boyle/bir/yer"), "x", &SearchOptions::default(), &AtomicBool::new(false));
    assert!(err.is_err());
}

#[test]
fn depo_degilse_yuruyus_agir_klasorleri_atliyor() {
    let root = temp_tree("walk");
    write(&root, "src/a.ts", b"foo");
    write(&root, "node_modules/x/index.js", b"foo");
    let res = find(&root, "foo", SearchOptions::default());
    assert!(!res.git);
    let paths: Vec<_> = res.files.iter().map(|f| f.path.replace('\\', "/")).collect();
    assert_eq!(paths, ["src/a.ts"]);
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn depoda_gitignore_uygulaniyor() {
    let root = temp_tree("git");
    git(&root, &["init", "--quiet"]);
    write(&root, ".gitignore", b"ignored.txt\nbuild/\n");
    write(&root, "a.txt", b"foo");
    write(&root, "ignored.txt", b"foo");
    write(&root, "build/out.txt", b"foo");
    write(&root, "src/b.txt", b"foo");
    // Izlenen dosya da listede (yalnizca `--others` degil).
    git(&root, &["add", "a.txt"]);

    let res = find(&root, "foo", SearchOptions::default());
    assert!(res.git);
    let paths: Vec<_> = res.files.iter().map(|f| f.path.replace('\\', "/")).collect();
    assert_eq!(paths, ["a.txt", "src/b.txt"]);
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn yok_sayilan_klasorun_icinde_yuruyuse_donuluyor() {
    // Kabuk `dist/` gibi yok sayilan bir klasordeyken git hicbir dosya
    // vermiyor; arama "hic eslesme yok" dememeli, klasoru yurumeli.
    let root = temp_tree("ignored-cwd");
    git(&root, &["init", "--quiet"]);
    write(&root, ".gitignore", b"gen/\n");
    write(&root, "gen/out.txt", b"foo");
    let res = find(&root.join("gen"), "foo", SearchOptions::default());
    assert!(!res.git);
    assert_eq!(res.files.len(), 1);
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn git_listesi_tekrarsiz() {
    assert_eq!(parse_git_list(b"a\0b\0a\0\0"), ["a", "b"]);
}

// ------------------------------------------------------------------ iptal

#[test]
fn iptal_bayragi_sonucu_iptal_diye_isaretliyor() {
    let root = temp_tree("cancel");
    write(&root, "a.txt", b"foo");
    let res = search(&root, "foo", &SearchOptions::default(), &AtomicBool::new(true)).unwrap();
    assert!(res.cancelled);
    assert!(res.files.is_empty());
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn baslamadan_iptal_edilen_arama_hic_baslamiyor() {
    // Iptal Rust'ta aramanin kendisinden once islenebiliyor (ayri gorevler).
    let root = temp_tree("early");
    write(&root, "a.txt", b"foo");
    let id = 9_000_001;
    cancel(id);
    let res = run(id, &root, "foo", &SearchOptions::default()).unwrap();
    assert!(res.cancelled);
    // Kayit temizlendi: ayni kimlik bir daha iptal sayilmiyor.
    assert!(!REGISTRY.lock().early.contains(&id));
    let res = run(id, &root, "foo", &SearchOptions::default()).unwrap();
    assert!(!res.cancelled);
    assert!(!REGISTRY.lock().active.contains_key(&id));
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn suren_aramanin_bayragi_kaldiriliyor() {
    let id = 9_000_002;
    let flag = begin(id).unwrap();
    cancel(id);
    assert!(flag.load(Ordering::Relaxed));
    finish(id);
    assert!(!REGISTRY.lock().active.contains_key(&id));
}

#[test]
fn erken_iptal_kumesi_sinirsiz_buyumuyor() {
    for id in 0..(EARLY_LIMIT as u64 * 3) {
        cancel(8_000_000 + id);
    }
    assert!(REGISTRY.lock().early.len() <= EARLY_LIMIT);
}

#[test]
fn regex_hata_cumlesi_ayiklaniyor() {
    let text = "regex parse error:\n    (foo\n    ^\nerror: unclosed group";
    assert_eq!(regex_reason(text), "unclosed group");
    assert_eq!(regex_reason("compiled regex exceeds size limit"), "compiled regex exceeds size limit");
}

#[test]
fn sonuc_arayuzun_bekledigi_adlarla_seriliyor() {
    // Arayuz `types.ts`teki `TextSearchResult`u okuyor; alan adi kayarsa
    // derleyici gormez, sonuc listesi sessizce bos kalir.
    let v = serde_json::to_value(SearchResult {
        files: vec![FileHits {
            path: "a".into(),
            lines: vec![LineHit { line: 1, text: "x".into(), ranges: vec![[0, 1]], col: 0, len: 1 }],
            matches: 1,
        }],
        ..Default::default()
    })
    .unwrap();
    for key in ["files", "matches", "lines", "searched", "truncated", "filesCapped", "skippedLarge", "git", "cancelled"] {
        assert!(v.get(key).is_some(), "{key} yok: {v}");
    }
    let line = &v["files"][0]["lines"][0];
    for key in ["line", "text", "ranges", "col", "len"] {
        assert!(line.get(key).is_some(), "{key} yok: {line}");
    }
    let o: SearchOptions = serde_json::from_str(r#"{"caseSensitive":true,"wholeWord":true,"regex":true}"#).unwrap();
    assert!(o.case_sensitive && o.whole_word && o.regex);
}
