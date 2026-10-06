//! Dosyalarin ICINDE metin arama.
//!
//! Dosya paletinin "Dosya icerigi" sekmesi ve dosya sutunundaki aramanin
//! "Icerik" kipi buradan okuyor. Ad aramasi (`files::list`) dosya ADLARINI
//! arayuzde, bellekte suzuyor; burada her dosyanin icine bakmak gerekiyor ve bu
//! is diskte yapiliyor — arayuze binlerce dosyanin icerigini tasimak hem yavas
//! hem anlamsiz olurdu.
//!
//! ## Hangi dosyalara bakiliyor
//!
//! Dizin bir git deposundaysa liste git'ten geliyor: `git ls-files --cached
//! --others --exclude-standard`, yani izlenenler ve `.gitignore`a takilmayan
//! yeni dosyalar. Icerik aramasinin gurultusu neredeyse tamamen yok sayilan
//! dosyalarda (derleme ciktisi, onbellek, kucultulmus paketler) ve hangi
//! dosyanin projeye ait oldugunu en iyi bilen git. `ignore` gibi yeni bir
//! bagimlilik gerekmiyor: git zaten uygulamanin calisma kosulu.
//!
//! Depo degilse, git yoksa ya da git hic dosya vermediyse (ornegin yok sayilan
//! bir klasorun icindeyiz) Ctrl+P'nin yuruyusu kullaniliyor: agir klasorler
//! atlaniyor, derinlik ve sayi sinirli (bkz. `files::list`).
//!
//! ## Eslesme bir SATIRA ait
//!
//! Sonuc listesi satir numarasi ve o satirin metniyle okunuyor, goruntuleyici
//! de o satira gidiyor. Duz metinde once butun dosyada tek bir tarama yapiliyor
//! (dosyalarin cogunda eslesme yok ve bu tarama SIMD hizinda); duz metin satir
//! sonu iceremedigi icin her eslesme zaten tek bir satirin icinde.
//!
//! Duzenli ifadede bu kestirme YOK, satir satir bakiliyor: `\s` ya da `[^x]`
//! satir sonunu da yakalayip iki satira yayilan bir eslesme bulabiliyor,
//! `(?-m)^` ise butun dosyada baska bir yerde eslesiyor. Butun dosyaya bakan
//! bir on suzgec ya bos yere dosyayi aciyor ya da — daha kotusu — eslesmeyi
//! kaciriyordu.
//!
//! ## Sinirlar BILDIRILIYOR
//!
//! Ilk iki bin satir, iki megabayttan kucuk dosyalar, en fazla yirmi bin dosya.
//! Sinira takilan arama sonucunu yine veriyor ama neyin disarida kaldigini da
//! soyluyor (`truncated`, `files_capped`, `skipped_large`); sessizce kesmek
//! "baska yerde yokmus" sanmaya yol acardi.
//!
//! ## Iptal
//!
//! Kullanici yazdikca yeni arama basliyor; eskisinin bitmesini beklemek
//! anlamsiz. Her aramanin bir kimligi var, arayuz eskisini `cancel` ile
//! durduruyor: is parcaciklari her dosyadan once bayraga bakiyor, `git
//! ls-files` sureci de olduruluyor.

use regex::bytes::{Regex, RegexBuilder};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::mpsc::{self, RecvTimeoutError};
use std::sync::{Arc, LazyLock};
use std::time::{Duration, Instant};

use parking_lot::Mutex;

use crate::platform::quiet_command;

/// Gosterilecek en fazla satir.
///
/// Iki bin: tek bir sozcugun bir projede gectigi yerler cogu zaman bunun cok
/// altinda; ustundeyse aranan sey bir sozcuk degil, bir harf ve cozum daha cok
/// satir degil daha iyi bir sorgu. Liste DOM'a cizildigi icin sinir arayuzu de
/// koruyor.
pub const MAX_LINES: usize = 2_000;

/// Icine bakilan en buyuk dosya (bayt).
///
/// Iki megabayt: kilit dosyalari (`package-lock.json`) bunun altinda kaliyor ve
/// onlarda aramak gercek bir is ("bu paket nereden geliyor"). Ustu cogunlukla
/// veri, kutuk ya da uretilmis dosya; atlananlarin sayisi bildiriliyor.
pub const MAX_FILE_BYTES: u64 = 2 * 1024 * 1024;

/// Bakilacak en fazla dosya — Ctrl+P'nin listesiyle ayni sinir.
pub const MAX_FILES: usize = 20_000;

/// Bir satirda isaretlenen en fazla eslesme.
///
/// Kucultulmus tek satirlik bir dosyada ayni sozcuk binlerce kez gecebiliyor;
/// hepsini tasimak gosterilen parcaya sigmayan isaretler demek.
const MAX_RANGES: usize = 20;

/// Kirpilan satirda ilk eslesmeden once birakilan baglam (UTF-16 birimi).
const SNIPPET_BEFORE: usize = 40;

/// Bir satirdan gosterilen en fazla metin (UTF-16 birimi).
const SNIPPET_MAX: usize = 240;

/// Ikili dosya sezgisi: ilk sekiz kilobaytta NUL. Goruntuleyiciyle AYNI karar
/// (bkz. `files::text_from_bytes`): aramada cikip acilinca "ikili dosya" diyen
/// bir sonuc olmasin.
const SNIFF: usize = 8192;

/// En fazla is parcacigi. Disk okumasi agir basiyor; sekizden sonrasi kazanc
/// getirmiyor, yalnizca makineyi mesgul ediyor.
const MAX_THREADS: usize = 8;

/// `git ls-files` icin taninan sure.
///
/// OLCULMEDI, GEREKCESI VAR: ev klasoru bir "dotfiles" deposu olan kullanicida
/// (`status.showUntrackedFiles=no` ile) `--others` butun ev klasorunu yuruyor ve
/// dakikalar surebiliyor. Sure dolarsa git birakiliyor ve sinirli yuruyuse
/// donuluyor; arama asili kalmiyor.
const GIT_LIST_TIMEOUT: Duration = Duration::from_secs(4);

/// Dosya listesinin onbellekte kaldigi sure.
///
/// Yazarken her harf (bekleme suresinden sonra) yeni bir arama; her birinde
/// git'e yeniden sormak buyuk bir depoda yuzlerce milisaniye. Bes saniye bir
/// yazma solugunu kapsiyor. Icerik HER aramada diskten okunuyor; eskiyebilen
/// yalnizca liste — o arada eklenen bir dosya en fazla bes saniye gecikiyor,
/// silinen dosya ise okunamadigi icin zaten atlaniyor.
const LIST_TTL: Duration = Duration::from_secs(5);

/// Duzenli ifade derlenemedi. Arayuz bu oneki taniyip "Gecersiz duzenli ifade"
/// diyor; ardindaki aciklama `regex` kitapliginin kendi cumlesi.
pub const BAD_REGEX: &str = "regex:";

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SearchOptions {
    /// Buyuk/kucuk harfe duyarli.
    pub case_sensitive: bool,
    /// Yalnizca tam sozcuk.
    pub whole_word: bool,
    /// Sorgu duzenli ifade.
    pub regex: bool,
}

/// Eslesen tek bir satir.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LineHit {
    /// 1'den baslayan satir numarasi.
    pub line: u32,
    /// Satirin gosterilen parcasi: bastaki girinti atilmis, uzunsa ilk
    /// eslesmenin cevresinden kirpilmis ve kirpilan uc `…` ile isaretli.
    pub text: String,
    /// `text` icindeki eslesmeler, `[baslangic, bitis)` — UTF-16 birimiyle,
    /// yani JavaScript dizesinin kendi konumlariyla.
    pub ranges: Vec<[u32; 2]>,
    /// Ilk eslesmenin TAM satirdaki yeri (UTF-16): goruntuleyici onu isaretliyor.
    pub col: u32,
    /// Ilk eslesmenin uzunlugu (UTF-16).
    pub len: u32,
}

/// Bir dosyadaki eslesmeler.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FileHits {
    /// Kok dizine gore yol, platformun ayiricisiyla — Ctrl+P listesiyle ayni bicim.
    pub path: String,
    pub lines: Vec<LineHit>,
    /// Isaretlenen eslesme sayisi (satir basina en fazla `MAX_RANGES`).
    pub matches: u32,
}

#[derive(Debug, Clone, Default, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub files: Vec<FileHits>,
    /// Toplam isaretlenen eslesme.
    pub matches: u32,
    /// Toplam satir.
    pub lines: u32,
    /// Icine bakilan dosya sayisi.
    pub searched: u32,
    /// `MAX_LINES`a takildi: baska eslesmeler de var.
    pub truncated: bool,
    /// Dosya listesi `MAX_FILES`ta kesildi.
    pub files_capped: bool,
    /// `MAX_FILE_BYTES`tan buyuk oldugu icin atlanan dosya sayisi.
    pub skipped_large: u32,
    /// Liste git'ten geldi: `.gitignore`a takilanlar aranmadi.
    pub git: bool,
    /// Arama iptal edildi; sonuc yok sayilmali.
    pub cancelled: bool,
}

/// Sorguyu esleyiciye cevirir.
///
/// Duz metin `regex::escape` ile kacirilip ayni motora veriliyor: iki ayri
/// arama yolu, ayni sorgunun iki kipte farkli sonuc vermesinin yolu olurdu.
/// Varsayilan buyuk/kucuk harf GOZETMEYEN arama (IDE'lerin de varsayilani).
///
/// Tam sozcukte duz metin `\b` ile ancak sozcuk karakteriyle biten ucundan
/// sariliyor: `foo(` aramasinda sondaki `\b` "parantezden sonra sozcuk gelsin"
/// demek olurdu ve `foo()` hic eslesmezdi.
///
/// `multi_line` + `crlf`: `^` ve `$` her satirin basi/sonu, CRLF dosyada da.
pub fn matcher(query: &str, opts: &SearchOptions) -> Result<Regex, String> {
    let core = if opts.regex { query.to_string() } else { regex::escape(query) };
    let pattern = if !opts.whole_word {
        core
    } else if opts.regex {
        format!(r"\b(?:{core})\b")
    } else {
        let word = |c: Option<char>| c.is_some_and(|c| c.is_alphanumeric() || c == '_');
        let before = if word(query.chars().next()) { r"\b" } else { "" };
        let after = if word(query.chars().last()) { r"\b" } else { "" };
        format!("{before}{core}{after}")
    };
    RegexBuilder::new(&pattern)
        .case_insensitive(!opts.case_sensitive)
        .multi_line(true)
        .crlf(true)
        .build()
        .map_err(|err| format!("{BAD_REGEX} {}", regex_reason(&err.to_string())))
}

/// `regex` hatasinin asil cumlesi.
///
/// Kitapligin metni cok satirli: desen, altinda bir `^` isareti ve en sonda
/// `error: unclosed group`. Arayuzde tek satirlik bir bildirimde yalnizca o son
/// cumle anlamli.
fn regex_reason(text: &str) -> String {
    text.lines()
        .rev()
        .find_map(|line| line.trim().strip_prefix("error:").map(|s| s.trim().to_string()))
        .or_else(|| text.lines().map(str::trim).find(|l| !l.is_empty()).map(String::from))
        .unwrap_or_default()
}

/// Bir arama: kimlikle kaydolur, sonunda kaydi siler.
///
/// Kimlik arayuzden geliyor ve iptal ona bakiyor (bkz. `cancel`).
pub fn run(id: u64, root: &Path, query: &str, opts: &SearchOptions) -> Result<SearchResult, String> {
    let Some(flag) = begin(id) else {
        return Ok(SearchResult { cancelled: true, ..Default::default() });
    };
    let out = search(root, query, opts, &flag);
    finish(id);
    out
}

/// `root` altindaki dosyalarda `query`yi arar.
pub fn search(
    root: &Path,
    query: &str,
    opts: &SearchOptions,
    cancel: &AtomicBool,
) -> Result<SearchResult, String> {
    if query.is_empty() {
        return Ok(SearchResult::default());
    }
    if !root.is_dir() {
        return Err(format!("klasor degil: {}", root.display()));
    }
    let re = matcher(query, opts)?;

    let Some(list) = candidates(root, cancel) else {
        return Ok(SearchResult { cancelled: true, ..Default::default() });
    };
    let scan = scan(root, &list.paths, &re, !opts.regex, cancel);
    if cancel.load(Ordering::Relaxed) {
        return Ok(SearchResult { cancelled: true, git: list.git, ..Default::default() });
    }

    let mut result = SearchResult {
        searched: scan.searched as u32,
        skipped_large: scan.skipped_large as u32,
        files_capped: list.capped,
        git: list.git,
        ..Default::default()
    };

    // Is parcaciklari dosyalari karisik sirayla bitiriyor; liste dosya sirasiyla
    // kuruluyor. Sinir de bu sirayla uygulaniyor, yani ayni sorgu her seferinde
    // ayni ilk iki bin satiri veriyor (bkz. `scan`).
    let mut hits = scan.hits;
    hits.sort_by_key(|(index, _)| *index);
    let mut lines = 0usize;
    for (_, mut file) in hits {
        let room = MAX_LINES - lines;
        if room == 0 {
            result.truncated = true;
            break;
        }
        if file.lines.len() > room {
            file.lines.truncate(room);
            file.matches = file.lines.iter().map(|l| l.ranges.len() as u32).sum();
            result.truncated = true;
        }
        lines += file.lines.len();
        result.matches += file.matches;
        result.files.push(file);
    }
    result.lines = lines as u32;
    Ok(result)
}

// ------------------------------------------------------------- dosya listesi

/// Aranacak dosyalar.
struct Candidates {
    /// Kok dizine gore yollar, buyuk/kucuk harf gozetmeden sirali.
    paths: Arc<Vec<String>>,
    git: bool,
    capped: bool,
}

struct CachedList {
    root: PathBuf,
    at: Instant,
    paths: Arc<Vec<String>>,
    git: bool,
    capped: bool,
}

static LIST_CACHE: LazyLock<Mutex<Option<CachedList>>> = LazyLock::new(|| Mutex::new(None));

/// Aranacak dosyalarin listesi; iptal edildiyse `None`.
fn candidates(root: &Path, cancel: &AtomicBool) -> Option<Candidates> {
    if let Some(hit) = LIST_CACHE.lock().as_ref() {
        if hit.root == root && hit.at.elapsed() < LIST_TTL {
            return Some(Candidates { paths: hit.paths.clone(), git: hit.git, capped: hit.capped });
        }
    }

    let (mut paths, git) = match git_files(root, cancel) {
        GitList::Files(list) if !list.is_empty() => (list, true),
        GitList::Cancelled => return None,
        _ => (crate::files::list(root), false),
    };
    let capped = paths.len() > MAX_FILES;
    paths.truncate(MAX_FILES);
    // Agac gibi okunsun: klasorler ve dosyalar adlarina gore, harf gozetmeden.
    paths.sort_by_cached_key(|p| p.to_lowercase());
    let paths = Arc::new(paths);

    *LIST_CACHE.lock() = Some(CachedList {
        root: root.to_path_buf(),
        at: Instant::now(),
        paths: paths.clone(),
        git,
        capped,
    });
    Some(Candidates { paths, git, capped })
}

enum GitList {
    Files(Vec<String>),
    /// Depo degil, git yok ya da sure doldu: yuruyuse donulecek.
    Unavailable,
    Cancelled,
}

/// Git'in bildigi dosyalar: izlenenler + yok sayilmayan izlenmeyenler.
///
/// Surec AKITILARAK okunuyor ve uc durumda birakiliyor: liste `MAX_FILES`i
/// gecti (fazlasi zaten kullanilmayacak), sure doldu (bkz. `GIT_LIST_TIMEOUT`)
/// ya da arama iptal edildi. Bekleyip `output()` demek iptal edilen her aramanin
/// arkada bir git sureci birakmasi demekti; hizli yazan biri bunlari ust uste
/// yigardi.
fn git_files(root: &Path, cancel: &AtomicBool) -> GitList {
    let spawned = quiet_command("git")
        .arg("-C")
        .arg(root)
        .args(["ls-files", "-z", "--cached", "--others", "--exclude-standard"])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn();
    let Ok(mut child) = spawned else {
        return GitList::Unavailable;
    };
    let Some(mut stdout) = child.stdout.take() else {
        let _ = child.kill();
        let _ = child.wait();
        return GitList::Unavailable;
    };

    let (tx, rx) = mpsc::channel::<Vec<u8>>();
    let reader = std::thread::spawn(move || {
        let mut buf = vec![0u8; 64 * 1024];
        loop {
            match stdout.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    if tx.send(buf[..n].to_vec()).is_err() {
                        break;
                    }
                }
            }
        }
    });

    enum End {
        Eof,
        Enough,
        Timeout,
        Cancelled,
    }
    let deadline = Instant::now() + GIT_LIST_TIMEOUT;
    let mut data: Vec<u8> = Vec::new();
    let mut count = 0usize;
    let end = loop {
        if cancel.load(Ordering::Relaxed) {
            break End::Cancelled;
        }
        let left = deadline.saturating_duration_since(Instant::now());
        if left.is_zero() {
            break End::Timeout;
        }
        match rx.recv_timeout(left.min(Duration::from_millis(50))) {
            Ok(chunk) => {
                count += chunk.iter().filter(|b| **b == 0).count();
                data.extend_from_slice(&chunk);
                if count > MAX_FILES {
                    break End::Enough;
                }
            }
            Err(RecvTimeoutError::Timeout) => continue,
            Err(RecvTimeoutError::Disconnected) => break End::Eof,
        }
    };

    // Bitmis surece `kill` zararsiz; bitmemisse boru kapanir ve okuyucu da cikar.
    if !matches!(end, End::Eof) {
        let _ = child.kill();
    }
    let status = child.wait();
    drop(rx);
    let _ = reader.join();

    match end {
        End::Cancelled => GitList::Cancelled,
        End::Timeout => GitList::Unavailable,
        // `-C` verilen dizin depo degilse git 128 ile cikiyor.
        End::Eof if !status.is_ok_and(|s| s.success()) => GitList::Unavailable,
        End::Eof | End::Enough => GitList::Files(parse_git_list(&data)),
    }
}

/// `-z` ciktisini yollara cevirir.
///
/// Git yolu her platformda `/` ile yaziyor; Windows'ta `\`ye cevriliyor ki
/// arayuz Ctrl+P listesiyle ayni bicimi gorsun (agacin anahtarlari da o
/// bicimde). Cakisma sirasinda `--cached` ayni dosyayi her asama icin yeniden
/// listeliyor; tekrarlar atiliyor.
fn parse_git_list(data: &[u8]) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for raw in data.split(|b| *b == 0) {
        if raw.is_empty() {
            continue;
        }
        // UTF-8 olmayan ad (Windows disinda olabiliyor) arayuze dogru
        // ulasamaz; okunamayan yolu listede tutmanin anlami yok.
        let Ok(rel) = std::str::from_utf8(raw) else { continue };
        let rel = if cfg!(windows) { rel.replace('/', "\\") } else { rel.to_string() };
        if seen.insert(rel.clone()) {
            out.push(rel);
        }
    }
    out
}

// ------------------------------------------------------------------ tarama

#[derive(Default)]
struct Scan {
    /// (dosyanin listedeki sirasi, eslesmeler)
    hits: Vec<(usize, FileHits)>,
    searched: usize,
    skipped_large: usize,
}

/// Dosyalari paralel tarar.
///
/// Is parcaciklari siradaki dosyayi ortak bir sayactan aliyor. Toplanan satir
/// `MAX_LINES`i GECINCE yeni dosya alinmiyor; alinmis olanlar bitiriliyor. Bu
/// yuzden taranan dosyalar listenin kesintisiz bir BASI ve sonuc dosya
/// sirasiyla kesildiginde ilk iki bin satir her kosuda ayni — hangi is
/// parcaciginin once bittiginden bagimsiz.
fn scan(root: &Path, paths: &[String], re: &Regex, literal: bool, cancel: &AtomicBool) -> Scan {
    let next = AtomicUsize::new(0);
    let found = AtomicUsize::new(0);
    let threads = std::thread::available_parallelism()
        .map_or(1, |n| n.get())
        .clamp(1, MAX_THREADS)
        .min(paths.len().max(1));

    let parts: Vec<Scan> = std::thread::scope(|scope| {
        let workers: Vec<_> = (0..threads)
            .map(|_| {
                scope.spawn(|| {
                    let mut part = Scan::default();
                    loop {
                        if cancel.load(Ordering::Relaxed) || found.load(Ordering::Relaxed) > MAX_LINES {
                            break;
                        }
                        let index = next.fetch_add(1, Ordering::Relaxed);
                        let Some(rel) = paths.get(index) else { break };
                        part.searched += 1;
                        match scan_file(&root.join(rel), re, literal) {
                            Outcome::Hits(lines) => {
                                found.fetch_add(lines.len(), Ordering::Relaxed);
                                let matches = lines.iter().map(|l| l.ranges.len() as u32).sum();
                                part.hits.push((index, FileHits { path: rel.clone(), lines, matches }));
                            }
                            Outcome::Large => part.skipped_large += 1,
                            Outcome::Nothing => {}
                        }
                    }
                    part
                })
            })
            .collect();
        workers.into_iter().map(|w| w.join().unwrap_or_default()).collect()
    });

    let mut out = Scan::default();
    for part in parts {
        out.hits.extend(part.hits);
        out.searched += part.searched;
        out.skipped_large += part.skipped_large;
    }
    out
}

enum Outcome {
    Nothing,
    Large,
    Hits(Vec<LineHit>),
}

fn scan_file(path: &Path, re: &Regex, literal: bool) -> Outcome {
    let Ok(meta) = std::fs::metadata(path) else { return Outcome::Nothing };
    if !meta.is_file() {
        return Outcome::Nothing;
    }
    if meta.len() > MAX_FILE_BYTES {
        return Outcome::Large;
    }
    let Ok(bytes) = std::fs::read(path) else { return Outcome::Nothing };
    // Okuma ile boyut sorgusu arasinda buyumus olabilir; sinir yine gecerli.
    if bytes.len() as u64 > MAX_FILE_BYTES {
        return Outcome::Large;
    }
    let lines = hits_in(&bytes, re, literal);
    if lines.is_empty() {
        Outcome::Nothing
    } else {
        Outcome::Hits(lines)
    }
}

/// Bir dosyanin eslesen satirlari.
///
/// `literal`: sorgu duz metin, yani hicbir eslesme satir sonu iceremiyor;
/// butun dosyada tek tarama yapilip eslesmeler satirlarina dagitiliyor. Degilse
/// her satira ayri bakiliyor (gerekcesi modul belgesinde).
///
/// Bos eslesmeler atiliyor: `a*` ya da `^` gibi bir ifade her satirda bos bir
/// eslesme bulur ve listeyi ise yaramaz satirlarla doldururdu.
pub fn hits_in(bytes: &[u8], re: &Regex, literal: bool) -> Vec<LineHit> {
    if bytes.iter().take(SNIFF).any(|b| *b == 0) {
        return Vec::new();
    }
    if literal {
        literal_hits(bytes, re)
    } else {
        line_by_line_hits(bytes, re)
    }
}

/// Eslesmeleri toplanmakta olan satir.
struct OpenLine {
    no: usize,
    /// Satirin dosyadaki baslangici (bayt).
    start: usize,
    /// Satirin icindeki eslesmeler (bayt).
    ranges: Vec<(usize, usize)>,
}

fn literal_hits(bytes: &[u8], re: &Regex) -> Vec<LineHit> {
    let mut out = Vec::new();
    let mut line_no = 1usize;
    let mut line_start = 0usize;
    // Satir sayiminin geldigi yer: her eslesmede yalnizca aradaki parca sayiliyor.
    let mut counted = 0usize;
    let mut open: Option<OpenLine> = None;
    let close = |line: OpenLine, out: &mut Vec<LineHit>| {
        out.push(line_hit(line.no, line_at(bytes, line.start), &line.ranges));
    };

    for m in re.find_iter(bytes) {
        if m.is_empty() {
            continue;
        }
        let gap = &bytes[counted..m.start()];
        let newlines = gap.iter().filter(|b| **b == b'\n').count();
        if newlines > 0 {
            line_no += newlines;
            line_start = counted + gap.iter().rposition(|b| *b == b'\n').unwrap_or(0) + 1;
        }
        counted = m.start();

        if open.as_ref().is_some_and(|line| line.start != line_start) {
            if let Some(line) = open.take() {
                close(line, &mut out);
            }
            if out.len() > MAX_LINES {
                return out;
            }
        }
        let line = open.get_or_insert_with(|| OpenLine { no: line_no, start: line_start, ranges: Vec::new() });
        if line.ranges.len() < MAX_RANGES {
            line.ranges.push((m.start() - line_start, m.end() - line_start));
        }
    }
    if let Some(line) = open {
        close(line, &mut out);
    }
    out
}

/// `start`ta baslayan satir; sondaki `\r` haric.
fn line_at(bytes: &[u8], start: usize) -> &[u8] {
    let rest = &bytes[start..];
    let line = rest.split(|b| *b == b'\n').next().unwrap_or(rest);
    line.strip_suffix(b"\r").unwrap_or(line)
}

fn line_by_line_hits(bytes: &[u8], re: &Regex) -> Vec<LineHit> {
    let mut out = Vec::new();
    for (index, raw) in bytes.split(|b| *b == b'\n').enumerate() {
        let line = raw.strip_suffix(b"\r").unwrap_or(raw);
        let ranges: Vec<(usize, usize)> = re
            .find_iter(line)
            .filter(|m| !m.is_empty())
            .take(MAX_RANGES)
            .map(|m| (m.start(), m.end()))
            .collect();
        if ranges.is_empty() {
            continue;
        }
        out.push(line_hit(index + 1, line, &ranges));
        if out.len() > MAX_LINES {
            break;
        }
    }
    out
}

/// Bayt dilimini metne cevirince kac UTF-16 birimi tuttugu.
///
/// Gecersiz UTF-8 goruntuleyicideki gibi U+FFFD oluyor (`from_utf8_lossy`): iki
/// taraf ayni sutunu saymali, yoksa isaret kayar.
fn utf16_len(bytes: &[u8]) -> usize {
    String::from_utf8_lossy(bytes).encode_utf16().count()
}

/// Eslesen satirin gosterilecek hali.
///
/// Bastaki girinti atiliyor: derin bir bloktaki satir listede saga kaymis
/// gorunuyor ve dar sutunda asil metin ekrandan cikiyordu. Uzun satir (ornegin
/// kucultulmus bir dosya) ilk eslesmenin cevresinden kirpiliyor; kirpilan uc
/// `…` tasiyor ki satirin devami oldugu belli olsun.
///
/// Konumlar UTF-16 BIRIMI: arayuzun dizeleri UTF-16 ve `ranges` dogrudan
/// `text.slice()` ile kullaniliyor. Bayt konumu verseydik Turkce harfli ya da
/// emojili her satirda isaret kayardi.
fn line_hit(no: usize, line: &[u8], ranges: &[(usize, usize)]) -> LineHit {
    // Bayt sinirlarini UTF-16'ya cevir. Sinirlar artan sirada ve hepsi gecerli
    // birer karakter siniri (eslesmeler gecerli UTF-8), yani parca parca
    // cevirmek satiri bir kerede cevirmekle ayni sayiyi veriyor.
    let mut at = 0usize;
    let mut at16 = 0usize;
    let mut r16: Vec<(usize, usize)> = Vec::with_capacity(ranges.len());
    for &(start, end) in ranges {
        at16 += utf16_len(&line[at..start]);
        let s16 = at16;
        at16 += utf16_len(&line[start..end]);
        at = end;
        r16.push((s16, at16));
    }

    let units: Vec<u16> = String::from_utf8_lossy(line).encode_utf16().collect();
    let (first_start, first_end) = r16[0];

    let lead = units
        .iter()
        .take_while(|u| **u == u16::from(b' ') || **u == u16::from(b'\t'))
        .count()
        .min(first_start);
    let mut start = lead;
    let mut cut_before = false;
    if first_start - start > SNIPPET_BEFORE {
        start = first_start - SNIPPET_BEFORE;
        cut_before = true;
        // Vekil cifti bolunmesin: ikinci yarisiyla baslayan parca bozuk bir
        // karakterle acilirdi.
        if is_low_surrogate(units[start]) {
            start -= 1;
        }
    }
    let mut end = units.len();
    let mut cut_after = false;
    if end - start > SNIPPET_MAX {
        end = start + SNIPPET_MAX;
        cut_after = true;
        if is_high_surrogate(units[end - 1]) {
            end -= 1;
        }
    }

    let mut text = String::new();
    let shift = if cut_before {
        text.push('…');
        1
    } else {
        0
    };
    text.push_str(&String::from_utf16_lossy(&units[start..end]));
    if cut_after {
        text.push('…');
    }

    let ranges = r16
        .iter()
        .filter(|(s, e)| *s < end && *e > start)
        .map(|(s, e)| [((*s).max(start) - start + shift) as u32, ((*e).min(end) - start + shift) as u32])
        .collect();

    LineHit {
        line: no as u32,
        text,
        ranges,
        col: first_start as u32,
        len: (first_end - first_start) as u32,
    }
}

fn is_high_surrogate(u: u16) -> bool {
    (0xD800..0xDC00).contains(&u)
}

fn is_low_surrogate(u: u16) -> bool {
    (0xDC00..0xE000).contains(&u)
}

// ------------------------------------------------------------------- iptal

#[derive(Default)]
struct Registry {
    /// Suren aramalarin bayraklari.
    active: HashMap<u64, Arc<AtomicBool>>,
    /// Daha baslamadan iptal edilenler.
    early: HashSet<u64>,
}

static REGISTRY: LazyLock<Mutex<Registry>> = LazyLock::new(|| Mutex::new(Registry::default()));

/// `early` kumesinin tavani: bitmis bir aramanin gecikmis iptali kumeye dusup
/// sonsuza kadar kalmasin.
const EARLY_LIMIT: usize = 256;

/// Aramayi kaydeder; daha baslamadan iptal edildiyse `None`.
///
/// Iki komut (arama ve iptal) arayuzden sirayla gidiyor ama Rust'ta ayri
/// gorevlerde kosuyor: iptal, aramanin kendisinden ONCE islenebiliyor. O
/// durumda kimlik `early`ye yaziliyor ve arama hic baslamiyor.
fn begin(id: u64) -> Option<Arc<AtomicBool>> {
    let mut reg = REGISTRY.lock();
    if reg.early.remove(&id) {
        return None;
    }
    let flag = Arc::new(AtomicBool::new(false));
    reg.active.insert(id, flag.clone());
    Some(flag)
}

fn finish(id: u64) {
    REGISTRY.lock().active.remove(&id);
}

/// Aramayi durdurur. Arama bitmisse etkisi yok; henuz baslamadiysa baslamiyor.
pub fn cancel(id: u64) {
    let mut reg = REGISTRY.lock();
    if let Some(flag) = reg.active.get(&id) {
        flag.store(true, Ordering::Relaxed);
        return;
    }
    if reg.early.len() >= EARLY_LIMIT {
        reg.early.clear();
    }
    reg.early.insert(id);
}

#[cfg(test)]
#[path = "search_tests.rs"]
mod search_tests;
