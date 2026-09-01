//! Git durumu — blok basligindaki dal rozeti icin.
//!
//! ## Neden `git` cagiriliyor, `.git` klasoru okunmuyor
//!
//! Dal adi `.git/HEAD` dosyasindan bedavaya okunabilir ve ilk tasarim oyleydi.
//! Ama rozette dal adinin yaninda DEGISIKLIK SAYISI da var; onu bulmak calisma
//! agacini indeksle karsilastirmak demek. Bunu elle yapmak git'in kendi
//! kurallarini (`.gitignore`, `assume-unchanged`, alt modul, satir sonu
//! donusumu) yeniden yazmak olurdu ve her biri ayri bir yanlis sonuc kaynagi.
//!
//! Tek bir `git status --porcelain -b` cagrisi ikisini birden veriyor ve
//! cevabi git'in kendisi uretiyor.
//!
//! ## Maliyet
//!
//! Surec baslatmak bedava degil; bu yuzden cagri SEYREK: dizin degistiginde ve
//! komut bittiginde. Her tus vurusunda degil.

use crate::platform::quiet_command;
use serde::Serialize;

/// Rozette gosterilen tek bir degisiklik.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GitChange {
    /// Porcelain durum harfleri, iki karakter: `" M"`, `"A "`, `"??"`.
    pub status: String,
    /// Depo kokune gore yol.
    pub path: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct GitInfo {
    /// Dal adi; ayrik HEAD'de kisa nesne kimligi.
    pub branch: String,
    /// HEAD bir dala bagli degil (ayrik).
    pub detached: bool,
    pub ahead: u32,
    pub behind: u32,
    pub changes: Vec<GitChange>,
}

/// Listede tutulan en fazla degisiklik.
///
/// Iki yuz satirlik bir liste zaten goz gezdirilmiyor; binlerce dosyalik bir
/// degisiklikte butun yollari arayuze tasimak bos maliyet.
const MAX_CHANGES: usize = 200;

/// `git status --porcelain=v1 -b` ciktisini cozer.
///
/// Ayri ve saf: bicimin butun kose durumlari (ayrik HEAD, ilk commit'ten onceki
/// depo, yeniden adlandirma, ileri/geri sayaci) burada testleniyor. Gercek bir
/// depoda denemek her biri icin ayri bir kurulum isterdi.
pub fn parse_porcelain(text: &str) -> GitInfo {
    let mut info = GitInfo::default();

    for line in text.lines() {
        if let Some(head) = line.strip_prefix("## ") {
            parse_branch_line(head, &mut info);
            continue;
        }
        if line.len() < 4 {
            continue;
        }
        if info.changes.len() >= MAX_CHANGES {
            continue;
        }
        // Bicim: `XY <yol>`. Durum iki karakter, sonra bir bosluk.
        let (status, rest) = line.split_at(2);
        let path = rest.trim_start();
        // Yeniden adlandirma `eski -> yeni` veriyor; ilgilendigimiz yeni ad.
        let path = path.split(" -> ").last().unwrap_or(path);
        info.changes.push(GitChange {
            status: status.to_string(),
            path: path.trim_matches('"').to_string(),
        });
    }

    info
}

fn parse_branch_line(head: &str, info: &mut GitInfo) {
    // Ayrik HEAD: `## HEAD (no branch)`
    if head.starts_with("HEAD (no branch)") {
        info.detached = true;
        info.branch = "HEAD".into();
        return;
    }
    // Ilk commit yok: `## No commits yet on main`
    if let Some(rest) = head.strip_prefix("No commits yet on ") {
        info.branch = rest.trim().to_string();
        return;
    }

    // `main...origin/main [ahead 1, behind 2]`
    let (isim, kalan) = match head.split_once("...") {
        Some((isim, kalan)) => (isim, Some(kalan)),
        None => (head, None),
    };
    info.branch = isim.trim().to_string();

    let Some(kalan) = kalan else { return };
    let Some(start) = kalan.find('[') else { return };
    let Some(end) = kalan.find(']') else { return };
    for parca in kalan[start + 1..end].split(',') {
        let parca = parca.trim();
        if let Some(n) = parca.strip_prefix("ahead ") {
            info.ahead = n.trim().parse().unwrap_or(0);
        } else if let Some(n) = parca.strip_prefix("behind ") {
            info.behind = n.trim().parse().unwrap_or(0);
        }
    }
}

/// Verilen dizinin git durumu; depo degilse ya da git yoksa `None`.
///
/// Hata YUTULUYOR ve bu bilincli: git kurulu olmayabilir, dizin depo
/// olmayabilir, depo bozuk olabilir. Uclunun de dogru karsiligi ayni - rozet
/// gosterilmez. Kullaniciya hata bildirmek burada gurultu olurdu; rozet zaten
/// bir kolaylik, bir sozlesme degil.
pub fn read(path: &str) -> Option<GitInfo> {
    let out = quiet_command("git")
        .args([
            "-C",
            path,
            // `--no-optional-locks`: durum sorgusu indeks kilidini TUTMASIN.
            // Bu cagri arka planda ve siklikla kosuyor; kullanicinin ayni anda
            // yazdigi `git commit` kilidi bekleyip takilirdi.
            "--no-optional-locks",
            "status",
            "--porcelain=v1",
            "-b",
            // `normal`: takip edilmeyen bir KLASOR tek satirda bildiriliyor.
            // `all` icindeki her dosyayi tek tek listeliyor ve `node_modules`
            // gibi bir klasorde bu on binlerce satir demek.
            "--untracked-files=normal",
        ])
        .output()
        .ok()?;

    if !out.status.success() {
        return None;
    }
    Some(parse_porcelain(&String::from_utf8_lossy(&out.stdout)))
}

/// Depodaki YEREL dallar, en son islenene gore sirali.
///
/// Sira `committerdate` ile: alfabetik siralama uzun dal listelerinde ise
/// yaramiyor - aradigin dal genelde son dokundugun dal. Alfabetik listede o
/// dal ortada bir yerde kaliyor.
///
/// Uzak dallar YOK. Listeye eklemek onlari `git checkout` ile secilebilir
/// gosterirdi; o da yerel bir izleme dali OLUSTURUYOR, yani "gecis yaptim"
/// sandigin yerde yeni bir dal yaratmis oluyorsun. Ayri bir is.
pub fn branches(path: &str) -> Vec<String> {
    let Ok(out) = quiet_command("git")
        .args([
            "-C",
            path,
            "--no-optional-locks",
            "for-each-ref",
            "--sort=-committerdate",
            "--format=%(refname:short)",
            "refs/heads/",
        ])
        .output()
    else {
        return Vec::new();
    };
    if !out.status.success() {
        return Vec::new();
    }
    String::from_utf8_lossy(&out.stdout)
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .map(String::from)
        .collect()
}

/// Tek bir dosyanin farki (birlesik bicim), renk kacislari olmadan.
///
/// `--no-color`: arayuz satirlari kendisi boyuyor. Git'in ANSI kacislarini
/// gecirmek metni kirletir ve ayristirmayi da zorlastirirdi.
///
/// `--no-ext-diff`: kullanicinin `diff.external` ayari olabilir ve o zaman
/// cikti tumden baska bir bicimde gelirdi.
///
/// Takip edilmeyen dosya icin `git diff` BOS doner - dosya indekste yok.
/// `--no-index` ile bos bir kaynaga karsi karsilastiriyoruz; sonuc "her satir
/// eklendi" farki oluyor, yani kullanicinin gormek istedigi sey.
pub fn diff(path: &str, file: &str, untracked: bool) -> Option<String> {
    let mut args: Vec<&str> = vec!["-C", path, "--no-optional-locks", "diff", "--no-color", "--no-ext-diff"];
    if untracked {
        // NUL aygiti platforma gore degisiyor; git ikisini de taniyor ama
        // Windows'ta `/dev/null` yok.
        args.extend(["--no-index", "--", NUL_DEVICE, file]);
    } else {
        args.extend(["--", file]);
    }

    let out = quiet_command("git").args(&args).output().ok()?;
    // `--no-index` fark VARSA 1 donuyor; basarisizlik degil.
    let text = String::from_utf8_lossy(&out.stdout).to_string();
    if text.is_empty() && !out.status.success() {
        return None;
    }
    Some(text)
}

#[cfg(windows)]
const NUL_DEVICE: &str = "NUL";
#[cfg(not(windows))]
const NUL_DEVICE: &str = "/dev/null";

/// Deponun `.git` klasoru; bulunamazsa `None`.
///
/// Yukari dogru yuruyor cunku kabuk alt bir klasorde olabilir. `.git` bir
/// DOSYA da olabilir: alt modullerde ve `git worktree` ile olusturulmus calisma
/// agaclarinda icinde `gitdir: <yol>` yaziyor. O durumu ele almazsak worktree
/// kullanan biri icin parmak izi hic bulunamaz ve tazeleme sessizce calismaz.
pub fn git_dir(start: &std::path::Path) -> Option<std::path::PathBuf> {
    let mut dir = Some(start);
    while let Some(cur) = dir {
        let aday = cur.join(".git");
        if aday.is_dir() {
            return Some(aday);
        }
        if aday.is_file() {
            let text = std::fs::read_to_string(&aday).ok()?;
            let yol = text.trim().strip_prefix("gitdir:")?.trim();
            let yol = std::path::Path::new(yol);
            return Some(if yol.is_absolute() { yol.to_path_buf() } else { cur.join(yol) });
        }
        dir = cur.parent();
    }
    None
}

/// Deponun durumunu ozetleyen ucuz bir imza; degistiyse tam sorgu gerekiyor.
///
/// ## Neden imza
///
/// Dal baska bir uygulamadan (IDE, baska bir terminal) degistirilebiliyor ve
/// NTerminal bunu fark etmiyordu - rozet ancak burada bir komut kosunca
/// tazeleniyordu. Cozum yoklama, ama her yoklamada `git status` kosturmak buyuk
/// bir depoda saniyeler suren bir surec baslatmak demek.
///
/// Imza IKI DOSYA OKUMASI: `HEAD`in icerigi (dal adi) ve `index`in degisme
/// zamani (asamalama, checkout). Ikisi de bayt mertebesinde; tam sorgu ancak
/// imza degisince kosuyor.
///
/// SINIRI: yalnizca calisma agacindaki bir dosyayi duzenlemek `index`e
/// dokunmuyor, dolayisiyla imza degismiyor. O durumu komut sonu ve pencereye
/// donus tazelemeleri yakaliyor.
pub fn fingerprint(path: &str) -> Option<String> {
    let dir = git_dir(std::path::Path::new(path))?;
    let head = std::fs::read_to_string(dir.join("HEAD")).unwrap_or_default();
    let index = std::fs::metadata(dir.join("index"))
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis())
        .unwrap_or(0);
    Some(format!("{}|{index}", head.trim()))
}

#[cfg(test)]
#[path = "git_tests.rs"]
mod git_tests;

/// Bir dosyadaki degisiklikleri geri alir.
///
/// ## Iki ayri is, tek dugme
///
/// TAKIP EDILEN dosyada "geri al" HEAD'e donmek demek: once indeks
/// cozuluyor (`restore --staged`), sonra calisma agaci HEAD'den yaziliyor
/// (`checkout --`). Iki adim ayri cunku dosya indekste olup HEAD'de
/// OLMAYABILIR (yeni eklenmis dosya): o durumda ikinci adim basarisiz olur ve
/// bu DOGRU sonuctur - dosya takipsiz hale doner, SILINMEZ. Kullanicinin yeni
/// yazdigi dosyayi "geri al" diye silmek veri kaybi olurdu.
///
/// TAKIPSIZ dosyada geri alinacak bir degisiklik yok; dosyanin kendisi
/// degisiklik. Tek karsiligi silmek ve bu GERI ALINAMAZ - git'te kaydi yok.
/// Bu yuzden karar arayuzde acikca soruluyor (bkz. `GitChanges`), burasi
/// yalnizca uyguluyor.
///
/// Yol depo KOKUNE gore geliyor (porcelain oyle veriyor) ve `-C path` ile
/// birlestiginde dogru dosyaya denk geliyor.
pub fn revert(path: &str, file: &str, untracked: bool) -> Result<(), String> {
    if untracked {
        let root = repo_root(path).ok_or_else(|| "depo kokü bulunamadi".to_string())?;
        let target = root.join(file);
        // Klasor degil DOSYA siliyoruz: takipsiz bir klasor porcelain'de tek
        // satir olarak gorunebiliyor ve `remove_dir_all` cok sey goturur.
        if target.is_dir() {
            return Err("klasor silinmiyor".into());
        }
        return std::fs::remove_file(&target).map_err(|e| e.to_string());
    }

    // Indeksi coz. Dosya indekste degilse git hata veriyor; bu bir sorun
    // degil, yalnizca "cozecek bir sey yoktu" demek.
    let _ = quiet_command("git")
        .args(["-C", path, "--no-optional-locks", "restore", "--staged", "--", file])
        .output();

    let out = quiet_command("git")
        .args(["-C", path, "--no-optional-locks", "checkout", "--", file])
        .output()
        .map_err(|e| e.to_string())?;

    if out.status.success() {
        return Ok(());
    }

    /*
     * HEAD'de olmayan dosya: yukaridaki `restore --staged` onu indeksten
     * cikardi ve simdi takipsiz duruyor. Istenen sonuc bu, `checkout`un
     * sikayeti bir hata degil.
     */
    let err = String::from_utf8_lossy(&out.stderr);
    if err.contains("did not match any file") || err.contains("pathspec") {
        return Ok(());
    }
    Err(err.trim().to_string())
}

/// Deponun calisma agaci koku.
fn repo_root(path: &str) -> Option<std::path::PathBuf> {
    let out = quiet_command("git")
        .args(["-C", path, "--no-optional-locks", "rev-parse", "--show-toplevel"])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if text.is_empty() {
        return None;
    }
    Some(std::path::PathBuf::from(text))
}
