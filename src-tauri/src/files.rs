//! Dizin altindaki dosyalarin listesi — Ctrl+P dosya arama icin.
//!
//! ## Neden .gitignore okunmuyor
//!
//! Dogru cozum bu olurdu ve bir kutuphane (`ignore`) tam bunu yapiyor. Yeni bir
//! bagimlilik eklemek yerine ATLANACAK KLASOR listesi kullaniliyor: pratikte
//! agirligin tamami birkac bilinen klasorde (`node_modules`, `target`, `dist`)
//! ve onlari atmak listeyi kullanilabilir kiliyor.
//!
//! Bedeli: .gitignore'da olan baska seyler listede gorunuyor. Bir dosya arama
//! kutusunda bu yanlis sonuc degil, fazla sonuc.
//!
//! ## Neden sinir var
//!
//! Bir ev klasoru ya da surucu koku yuz binlerce dosya tutuyor. Sinirsiz
//! yuruyus arayuzu dakikalarca bekletir ve bellegi doldurur. Sinira takilan
//! yuruyus DURUYOR; arama kutusu eksik listeyle de ise yariyor, donmeyen bir
//! arayuz eksiksiz listeden onemli.

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

/// Agactaki tek bir girdi.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Entry {
    pub name: String,
    /// Klasor mu? Sembolik baglantilar izlenerek belirleniyor.
    pub dir: bool,
}

/// Bir dizinin girdileri: klasorler once, sonra dosyalar.
///
/// Gizli girdiler DAHIL: terminalde `.env`, `.gitignore`, `.github` gunluk
/// kullanimda. Onlari gizlemek dosya yoneticisi aliskanligi, kabuk aliskanligi
/// degil.
///
/// Bu islev TEK SEVIYE okuyor. Agaci tembel acmanin butun amaci bu: derin bir
/// projede her seviyeyi onden okumak binlerce klasor gezmek demek.
pub fn entries(dir: &Path) -> Vec<Entry> {
    let Ok(read) = std::fs::read_dir(dir) else {
        return Vec::new();
    };

    let mut out: Vec<Entry> = Vec::new();
    for entry in read.flatten() {
        let Some(name) = entry.file_name().to_str().map(String::from) else {
            continue;
        };
        // `is_dir()` sembolik baglantiyi IZLIYOR: klasore isaret eden bir
        // baglanti da acilabilir olmali.
        out.push(Entry { dir: entry.path().is_dir(), name });
    }

    // Klasorler once: goz agacta once onlari arayip iciyor. Ikinci olcut
    // buyuk/kucuk harf gozetmeyen ad - ASCII siralamasi butun buyuk harfleri
    // one atiyor ve liste karisik gorunuyor.
    out.sort_by(|a, b| b.dir.cmp(&a.dir).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    out
}

/// Goruntuleyicinin okudugu en fazla bayt.
///
/// Yarim megabayt: bir kaynak dosyasi icin fazlasiyla yeterli, buyuk bir kutuk
/// (log) ya da veri dosyasi ise arayuze tasinmamali - metni DOM'a cizmek
/// megabayt basina yuzlerce milisaniye ve kimse yarim megabayttan fazlasini
/// goruntuleyicide okumuyor.
const MAX_READ: usize = 512 * 1024;

/// Ikili dosya sezgisi icin bakilan ilk bayt sayisi.
const SNIFF: usize = 8192;

/// Goruntuleyiciye giden dosya icerigi.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FileText {
    pub text: String,
    /// Sinira takildi mi; goruntuleyici bunu soylemek zorunda.
    pub truncated: bool,
    /// Ikili sezildi mi; icerik bos gelir.
    pub binary: bool,
    /// Dosyanin gercek boyutu (bayt).
    pub size: u64,
}

/// Bir metin dosyasini okur.
///
/// ## Neden ikili sezgisi var
///
/// Bir `.png` ya da `.exe`yi metin olarak cizmek ekrani anlamsiz karakterlerle
/// dolduruyor ve tarayiciyi zorluyor. Sezgi ilk sekiz kilobaytta NUL bayti
/// aramak: metin dosyalarinda NUL bulunmuyor, ikili bicimlerin neredeyse
/// tamaminda bulunuyor. Kusursuz degil ama yanilma bedeli dusuk - kullaniciya
/// "ikili dosya" denir, olan bir sey yok.
///
/// ## Neden sinir var
///
/// Yarim megabayttan sonrasi kesiliyor ve bu BILDIRILIYOR. Sessizce kesmek
/// "dosyanin sonu buymus" sanmaya yol acardi.
///
/// ## Sinir OKURKEN uygulaniyor
///
/// Eski kod once `fs::read` ile dosyanin TAMAMINI belleğe aliyor, siniri
/// sonra kesiyordu: goruntuleyicide birkac gigabaytlik bir kutuge tiklamak
/// gigabaytlarca ayirma (bellek yetersizliginde abort) ve okuma suresince
/// donan bir pencere demekti. Simdi `take` ile yalnizca sinir + 1 bayt
/// okunuyor; fazladan bayt "kesildi mi" sorusunun cevabi, `size` ise
/// `metadata`dan.
pub fn read_text(path: &Path) -> Option<FileText> {
    use std::io::Read;

    let meta = std::fs::metadata(path).ok()?;
    if !meta.is_file() {
        return None;
    }
    let size = meta.len();

    let file = std::fs::File::open(path).ok()?;
    let mut bytes = Vec::with_capacity((size as usize).min(MAX_READ + 1));
    file.take(MAX_READ as u64 + 1).read_to_end(&mut bytes).ok()?;
    Some(text_from_bytes(&bytes, size, MAX_READ))
}

/// Yazma reddedildiginde donen, arayuzun cevirdigi kodlar.
pub const WRITE_CHANGED: &str = "changed";
pub const WRITE_NOT_TEXT: &str = "not-text";

/// Var olan duz bir dosyayi, su anki hali `expected` ise `text` ile degistirir.
///
/// Fark penceresinin sag tarafi ve dosya goruntuleyicisi (Duzenle / Kaydet)
/// buradan yaziyor.
///
/// `expected`: arayuz metni dosyanin OKUDUGU haline gore kurdu. Dosya o arada
/// baska bir yerde kaydedildiyse korkusuzca yazmak o kaydi sessizce silerdi;
/// hicbir sey yazilmiyor ve `changed` donuyor, arayuz kullaniciya soruyor.
///
/// UTF-8 olmayan dosya reddediliyor (`not-text`): arayuz onu `from_utf8_lossy`
/// ile okudu, elindeki metin dosyanin kendisi degil ve geri yazmak gecersiz
/// baytlari U+FFFD ile degistirirdi.
///
/// Sembolik baglanti ya da klasor degil, var olan bir dosya: yeni dosya
/// olusturmak ya da baglantinin ardindaki baska bir yere yazmak bu isin parcasi
/// degil.
pub fn write_checked(target: &Path, expected: &str, text: &str) -> Result<(), String> {
    let meta = std::fs::symlink_metadata(target).map_err(|e| e.to_string())?;
    if !meta.file_type().is_file() {
        return Err(format!("duz bir dosya degil: {}", target.display()));
    }
    let bytes = std::fs::read(target).map_err(|e| e.to_string())?;
    let current = String::from_utf8(bytes).map_err(|_| WRITE_NOT_TEXT.to_string())?;
    if current != expected {
        return Err(WRITE_CHANGED.to_string());
    }
    std::fs::write(target, text).map_err(|e| e.to_string())
}

/// Dosya goruntuleyicisinde duzenlenen dosyayi yazar; yol mutlak olmali.
pub fn write_text(path: &Path, expected: &str, text: &str) -> Result<(), String> {
    if !path.is_absolute() {
        return Err(format!("mutlak yol degil: {}", path.display()));
    }
    write_checked(path, expected, text)
}

/// Baytlari goruntulenecek metne cevirir: ikili sezgisi ve sinir burada.
///
/// Ayri cunku fark penceresi de ayni karari veriyor - hem diskten okunan
/// calisma agaci dosyasi hem `git cat-file` ile gelen HEAD hali icin. Iki ayri
/// sezgi, ayni dosyanin bir tarafta "ikili" ote tarafta metin gorunmesine yol
/// acabilirdi.
pub fn text_from_bytes(bytes: &[u8], size: u64, limit: usize) -> FileText {
    let ikili = bytes.iter().take(SNIFF).any(|b| *b == 0);
    if ikili {
        return FileText { text: String::new(), truncated: false, binary: true, size };
    }

    let truncated = bytes.len() > limit;
    let dilim = if truncated { &bytes[..limit] } else { bytes };
    // `from_utf8_lossy`: gecersiz baytlar U+FFFD oluyor. Hata dondurmek yerine
    // gostermek dogru - dosyanin cogu okunabilirse kullanici onu gormeli.
    FileText {
        text: String::from_utf8_lossy(dilim).to_string(),
        truncated,
        binary: false,
        size,
    }
}

/// Yuruyuse girmeyen klasorler.
///
/// Iki ayri sebep var: `node_modules` / `target` / `dist` gibi olanlar URETILEN
/// dosyalar ve aranmiyor; `.git` ise deponun ic yapisi.
const SKIP: &[&str] = &[
    ".git",
    "node_modules",
    "target",
    "dist",
    "build",
    "out",
    "bin",
    "obj",
    ".next",
    ".nuxt",
    ".svelte-kit",
    ".venv",
    "venv",
    "__pycache__",
    ".gradle",
    ".idea",
    "vendor",
    "Pods",
];

/// Toplanacak en fazla dosya.
///
/// Yirmi bin: bulanik arama bu boyutta hala anlik ve listenin bellekteki
/// agirligi birkac megabayt. Daha buyugu arama kutusunu yavaslatiyor, ustelik
/// kimse yirmi binden fazla sonucun arasinda gezinmiyor.
const MAX_FILES: usize = 20_000;

/// En fazla inilecek derinlik.
///
/// Derin ic ice klasorlerde (uretilen kod, onbellek) yuruyus sinirsiz uzuyor.
/// On seviye elle yazilan proje agaclarinin tamamini kapsiyor.
const MAX_DEPTH: usize = 10;

/// Yuruyusun toplam SURESI.
///
/// OLCULEN HATA: ev dizininde (`~`) acilan bir sekmede Ctrl+P `list_files`i
/// 8 SANIYE surdurdu; `MAX_FILES` sinirina ulasmak icin `.npm` (1,3 sn),
/// `.gradle` (0,9 sn), `Library`, `.cargo`... dizinlerini tek tek okumak
/// gerekiyordu. Komut Tauri'de ana is parcaciginda kostugu icin bu sure boyunca
/// pencere, terminal ciktisi dahil, DONDU. (Komut artik ana is parcaciginda
/// kosmuyor, ama palet 8 sn bos kalmamali.)
///
/// Sinir SAYIYA degil SUREYE de bagli olmali: bir dizin agacinin ne kadar
/// buyuk oldugu onceden bilinmiyor, ag suruculeri ve iCloud yer tutuculari
/// dosya sayisindan bagimsiz yavas. Genislik oncelikli yuruyus oldugu icin sure
/// dolarsa elde YUZEYDEKI dosyalar kaliyor - aranan dosya cogunlukla orada.
const LIST_BUDGET: Duration = Duration::from_millis(400);

/// Kullanici ev dizininin DOGRUDAN altinda atlanan klasorler.
///
/// Yalnizca kok ev dizini iken: bir projenin icindeki `Library` (Unity) ya da
/// `.cache` zaten uretilen dosya ve `SKIP` listesinde ya da aranmiyor; ev
/// dizininde ise bunlar arac onbellekleri - binlerce dosya, hicbiri kullanicinin
/// "aradigi dosya" degil. Olculen agirlar (ev dizini yuruyusu 8 sn): `.npm`,
/// `.gradle`, `Library`, `.cargo`, `.nuget`, `.cache`, `.rustup`.
const HOME_SKIP: &[&str] = &[
    "Library", ".Trash", ".npm", ".cache", ".cargo", ".rustup", ".nvm", ".gradle", ".nuget", ".m2",
    ".docker", ".local", ".pyenv", ".pub-cache", ".android",
];

/// Tek bir klasorun icinde sureye bakma sikligi (girdi sayisi). Yuz binlerce
/// girdili tek bir klasor bile butceyi asmamali.
const BUDGET_CHECK_EVERY: usize = 2048;

/// Yuruyus ayarlari. `list` uretim degerleriyle cagiriyor; testler kucuk
/// degerlerle.
struct ListOpts {
    max_files: usize,
    budget: Duration,
    /// Kok bu dizinse (ev dizini), altindaki `HOME_SKIP` klasorleri atlanir.
    home: Option<PathBuf>,
}

/// `root` altindaki dosyalarin `root`a gore yollari.
///
/// Genislik oncelikli (breadth-first): sinira takilirsa elde YUZEYDEKI dosyalar
/// kaliyor, derinlerdekiler degil. Kullanicinin aradigi dosya cok daha sik
/// yuzeye yakin; derinlik oncelikli yuruyus sinira ilk dalda takilip geri
/// kalanini hic gormezdi.
pub fn list(root: &Path) -> Vec<String> {
    list_with(
        root,
        &ListOpts { max_files: MAX_FILES, budget: LIST_BUDGET, home: dirs::home_dir() },
    )
}

fn list_with(root: &Path, opts: &ListOpts) -> Vec<String> {
    let started = Instant::now();
    let over_budget = || started.elapsed() >= opts.budget;
    // Kok ev dizini mi? Yol bicimi farkliliklarina (sondaki ayirac) karsi
    // karsilastirma bilesenlerle yapiliyor.
    let is_home_root = opts
        .home
        .as_deref()
        .map(|h| h.components().eq(root.components()))
        .unwrap_or(false);

    let mut out: Vec<String> = Vec::new();
    let mut kuyruk: std::collections::VecDeque<(PathBuf, usize)> =
        std::collections::VecDeque::new();
    kuyruk.push_back((root.to_path_buf(), 0));

    while let Some((dir, depth)) = kuyruk.pop_front() {
        if out.len() >= opts.max_files || over_budget() {
            break;
        }
        let Ok(entries) = std::fs::read_dir(&dir) else {
            // Okunamayan klasor (izin, kopmus ag surucusu) yuruyusu durdurmuyor.
            continue;
        };

        for (i, entry) in entries.flatten().enumerate() {
            if i % BUDGET_CHECK_EVERY == BUDGET_CHECK_EVERY - 1 && over_budget() {
                break;
            }
            let path = entry.path();
            let Some(name) = entry.file_name().to_str().map(String::from) else {
                continue;
            };
            let Ok(kind) = entry.file_type() else { continue };

            if kind.is_dir() {
                if depth + 1 > MAX_DEPTH || SKIP.contains(&name.as_str()) {
                    continue;
                }
                if is_home_root && depth == 0 && HOME_SKIP.contains(&name.as_str()) {
                    continue;
                }
                kuyruk.push_back((path, depth + 1));
                continue;
            }
            if out.len() >= opts.max_files {
                break;
            }
            if let Ok(rel) = path.strip_prefix(root) {
                out.push(rel.to_string_lossy().to_string());
            }
        }
    }

    out
}

// ---------------------------------------------------------------- gorsel

/// Goruntuleyicinin onizledigi en buyuk gorsel (bayt).
///
/// Yirmi megabayt: ekran goruntuleri, simgeler ve tasarim ciktilari bunun cok
/// altinda. Ustu (ham fotograf, dev bir tarama) base64 olarak arayuze tasininca
/// bellekte birkac kat yer kapliyor; onizleme icin anlamsiz. Sinir BILDIRILIYOR.
pub const MAX_IMAGE: u64 = 20 * 1024 * 1024;

/// Gorsel cok buyuk: arayuz bu oneki taniyip boyutla birlikte soyluyor
/// (`too-large:<bayt>`).
pub const IMAGE_TOO_LARGE: &str = "too-large";

/// Goruntuleyicinin resim onizlemesine giden icerik.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ImageData {
    /// Dosyanin baytlari, base64.
    pub data: String,
    /// Dosyanin boyutu (bayt).
    pub size: u64,
}

/// Bir gorselin baytlari - dosya goruntuleyicisinin resim onizlemesi.
///
/// ## Neden base64
///
/// Arayuz baytlari `<img>`e `data:` adresiyle veriyor. Uygulamanin CSP'si
/// (`tauri.conf.json`) gorsellere `'self'`, `asset:` ve `data:` disinda kaynak
/// tanimiyor: `blob:` adresi gelistirmede calisip uretim derlemesinde bos
/// cikardi. Varlik protokolunu (`asset:`) acmak ise butun diski adresle
/// okunabilir yapmak demekti; bu komut yalnizca istenen dosyayi, sinirla okuyor.
///
/// Tur denetimi yok (uzanti arayuzde): yanlis uzantili dosyayi tarayici cizemiyor
/// ve arayuz bunu soyluyor.
pub fn read_image(path: &Path) -> Result<ImageData, String> {
    read_image_limited(path, MAX_IMAGE)
}

pub(crate) fn read_image_limited(path: &Path, limit: u64) -> Result<ImageData, String> {
    use base64::Engine;

    let meta = std::fs::metadata(path).map_err(|e| e.to_string())?;
    if !meta.is_file() {
        return Err(format!("dosya degil: {}", path.display()));
    }
    if meta.len() > limit {
        return Err(format!("{IMAGE_TOO_LARGE}:{}", meta.len()));
    }
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    // Boyut sorgusu ile okuma arasinda buyumus olabilir; sinir yine gecerli.
    if bytes.len() as u64 > limit {
        return Err(format!("{IMAGE_TOO_LARGE}:{}", bytes.len()));
    }
    Ok(ImageData {
        data: base64::engine::general_purpose::STANDARD.encode(&bytes),
        size: bytes.len() as u64,
    })
}

/// Fark penceresinin canli yoklamasi icin dosyanin ucuz damgasi.
///
/// Pencere yarim saniyede bir "dosya degisti mi" diye bakiyor. Bunu dosyanin
/// TAMAMINI okuyup (yarim megabayta kadar) IPC'den gecirerek yapiyordu: en kotu
/// durumda saniyede bir megabayt JSON ve dize karsilastirmasi, pencere acik
/// kaldigi surece. `metadata` tek sistem cagrisi; metin ancak boyut ya da
/// degisiklik zamani oynayinca okunuyor. Zaman damgasi + boyut: ayni boyutta
/// farkli icerik olabiliyor (bir harfi degistirmek), o yuzden ikisi birlikte.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FileStamp {
    pub size: u64,
    /// Degisiklik zamani, Unix epoch'tan milisaniye; dosya sistemi vermiyorsa 0.
    pub modified_ms: u64,
}

/// Dosya yoksa ya da duz dosya degilse `None`.
pub fn stamp(path: &Path) -> Option<FileStamp> {
    let meta = std::fs::metadata(path).ok()?;
    if !meta.is_file() {
        return None;
    }
    let modified_ms = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    Some(FileStamp { size: meta.len(), modified_ms })
}

#[cfg(test)]
#[path = "files_tests.rs"]
mod files_tests;
