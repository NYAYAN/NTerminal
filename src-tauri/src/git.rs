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
    /// Yeniden adlandirma ya da kopyalamada ESKI yol; baska durumda yok.
    ///
    /// Indeksten cikarmak icin (`unstage`) gerekiyor: yalnizca yeni ad
    /// cikarilinca eski adin "silindi" kaydi indekste kaliyor ve dosya iki ayri
    /// degisiklige ayriliyor (`D  eski` + `?? yeni`, olculdu). Ikisi birden
    /// cikarilinca dosya calisma agacindaki haline donuyor.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub orig_path: Option<String>,
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
    /// Dalin yukari akisi (`origin/main`); yoksa `None`.
    ///
    /// Yukari akis SILINMISSE de (`[gone]`: uzak dal birlestirilip silinmis)
    /// `None`. Arayuz iki durumu ayni ele aliyor - "uzakta bunun karsiligi yok,
    /// yayinla" - ve `git push` icin de dogru olan bu: silinmis bir yukari
    /// akisa gonderilmez, dal yeniden olusturulur.
    pub upstream: Option<String>,
    /// Depoda HIC commit yok (`## No commits yet on main`).
    ///
    /// Arayuz push'u kapatiyor: gonderilecek bir sey yok ve "yayinla" demek
    /// bos bir depoda yalnizca hata uretirdi. Commit ATILABILIYOR (ilk commit).
    pub unborn: bool,
    /// Indekste commit'e HAZIR dosya sayisi.
    ///
    /// `changes` `MAX_CHANGES`'ta kesiliyor, bu sayi kesilmiyor: commit dugmesi
    /// "kac dosya commit'lenecek" sorusunu yanitliyor ve cevap listenin gorunen
    /// kismina bagli olmamali. Cakisma (`UU`) hazir SAYILMIYOR: git cakisma
    /// varken commit'i reddediyor.
    pub staged: u32,
    /// Stash'te bekleyen kayit sayisi.
    ///
    /// SUREC BASLATMADAN okunuyor: `logs/refs/stash` dosyasindaki satir sayisi
    /// (her stash bir yansima satiri; son stash silinince dosya KAYBOLUYOR,
    /// olculdu). `git stash list` her durum okumasina bir surec daha eklerdi ve
    /// sekme rozeti icin buna deger degil. Reftable deposunda (git'in istege
    /// bagli yeni depolamasi) dosya yok ve sayi 0 kaliyor: yalnizca rozet eksik
    /// kalir, liste `git stash list` ile okundugu icin dogru.
    pub stash_count: u32,
    pub changes: Vec<GitChange>,
    /// Calisma agacinin KOKU (mutlak yol).
    ///
    /// Arayuze gerekiyor cunku `changes` icindeki yollar koke gore
    /// (porcelain oyle veriyor) ve "dosyayi ac" tam yol istiyor. Terminalin
    /// bulundugu dizinle birlestirmek, kabuk alt bir klasordeyse var olmayan
    /// bir yol uretiyordu.
    pub root: String,
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
        // Bicim: `XY <yol>`. Durum iki karakter, sonra bir bosluk.
        let Some((status, rest)) = line.split_at_checked(2) else {
            continue;
        };
        // Sayac listeyi kesmeden ONCE: commit dugmesi kesilmemis sayiya bakiyor.
        if is_staged(status) {
            info.staged += 1;
        }
        let rest = rest.trim_start();
        // Yeniden adlandirma ve kopyalama `eski -> yeni` veriyor. Ilgilendigimiz
        // yeni ad; eskisi indeksten cikarmak icin lazim (bkz. `orig_path`).
        //
        // YALNIZCA R/C durumunda bolunuyor: "a -> b.txt" adli siradan bir
        // dosya da tirnakli gelirdi ama ayirici tirnagin ICINDE kalip yanlis
        // yerden bolunurdu.
        let (orig_path, path) = match rest.split_once(" -> ") {
            Some((eski, yeni)) if status.contains('R') || status.contains('C') => {
                (Some(unquote(eski)), unquote(yeni))
            }
            _ => (None, unquote(rest)),
        };
        info.changes.push(GitChange {
            status: status.to_string(),
            path,
            orig_path,
        });
    }

    /*
     * Sira YOLA gore, git'in sirasina gore DEGIL; kesme siralamadan SONRA.
     *
     * BILDIRILEN: "dosyalari toplu sectirince dosyalar kendi arasinda yer
     * degistiriyor." OLCULDU: porcelain once izlenen degisiklikleri yola gore,
     * EN SONDA takipsizleri (`??`) veriyor. Sahnelenen yeni dosya `??`ten `A `ya
     * gecince listenin sonundan ortasina atliyordu (`a c e b d/` ->
     * `a b c d/x e`). Yol bir dosyanin kimligi, durum onun bir ozelligi
     * (satirin anahtari da yol, bkz. `GitChanges`); sira da durumla oynamamali.
     *
     * Kesme siralamadan sonra: once kesip sonra siralamak, iki yuzu asan bir
     * listede GOSTERILEN dosyalarin kumesini de durumla degistirirdi.
     */
    info.changes.sort_by(|a, b| a.path.cmp(&b.path));
    info.changes.truncate(MAX_CHANGES);

    info
}

/// Porcelain'in bosluklu yollar icin koydugu cift tirnaklari atar.
fn unquote(path: &str) -> String {
    path.trim_matches('"').to_string()
}

/// Cakisma durumlari: iki taraf da bir seyler yapmis, cozum bekliyor.
fn is_unmerged(status: &str) -> bool {
    matches!(status, "DD" | "AU" | "UD" | "UA" | "DU" | "AA" | "UU")
}

/// Durumun ILK harfi indeks tarafi; bu harflerden biriyse dosya commit'e hazir.
fn is_staged(status: &str) -> bool {
    !is_unmerged(status)
        && status
            .as_bytes()
            .first()
            .is_some_and(|x| b"MADRCT".contains(x))
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
        info.unborn = true;
        return;
    }

    // `main...origin/main [ahead 1, behind 2]`
    let (isim, kalan) = match head.split_once("...") {
        Some((isim, kalan)) => (isim, Some(kalan)),
        None => (head, None),
    };
    info.branch = isim.trim().to_string();

    let Some(kalan) = kalan else { return };
    // Yukari akis adi `[`ten ONCEKI kisim: `origin/main [ahead 1]`.
    let (ad, sayac) = match kalan.find('[') {
        Some(i) => (kalan[..i].trim(), &kalan[i..]),
        None => (kalan.trim(), ""),
    };
    // `[gone]`: ad hala yaziyor ama uzakta artik yok (bkz. `GitInfo::upstream`).
    if !ad.is_empty() && !sayac.contains("gone") {
        info.upstream = Some(ad.to_string());
    }

    let Some(start) = sayac.find('[') else { return };
    let Some(end) = sayac.find(']') else { return };
    for parca in sayac[start + 1..end].split(',') {
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
            /*
             * `core.quotepath=false`: ASCII disi yollar OLDUGU GIBI gelsin.
             *
             * OLCULEN HATA: varsayilanda git, Turkce harfli bir dosya adini
             * (c-cedilla, noktasiz i ve s-cedilla iceren "calistir.md") sekizlik
             * kacisla veriyor: `"\303\247al\304\261\305\237t\304\261r.md"`. Buradaki
             * ayristirici yalnizca cevre tirnaklarini atiyordu. Yol o haliyle
             * `git add` / `git diff` / `git checkout`a verilince "pathspec did
             * not match any files" ile dusuyor - yani Turkce adli her dosya
             * listede gorunuyor ama uzerinde HICBIR islem yapilamiyordu.
             *
             * Bosluklu yollar bu ayardan etkilenmiyor: onlar yine tirnakli
             * geliyor ve `unquote` atiyor.
             */
            "-c",
            "core.quotepath=false",
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
    let mut info = parse_porcelain(&String::from_utf8_lossy(&out.stdout));
    info.root = repo_root(path)
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string());
    info.stash_count = stash_count(std::path::Path::new(path));
    Some(info)
}

/// Git komutlarinin KOSACAGI dizin: deponun koku.
///
/// ## Olculen hata
///
/// `git status --porcelain` yollari her zaman depo KOKUNE gore veriyor —
/// kabuk hangi alt klasorde olursa olsun. `git diff -- <yol>` ise pathspec'i
/// BULUNULAN DIZINE gore cozuyor. Kabuk bir alt klasordeyken ikisi
/// tutmuyordu: `git -C alt/klasor diff -- src/App.tsx` hicbir seyle
/// eslesmiyor, cikti bos donuyor ve panel "Gosterilecek fark yok" yaziyordu.
/// Ayni sebeple `checkout --` de yanlis dosyayi ariyordu, yani "geri al"
/// sessizce hicbir sey yapmiyordu.
///
/// Cozum yollari degil DIZINI degistirmek: komutlar kokten kosunca yollar
/// zaten dogru. `:/` sihirli pathspec'i de olurdu ama `--no-index` (takipsiz
/// dosya farki) pathspec degil GERCEK yol istiyor, yani iki dal iki ayri
/// kural olurdu.
///
/// Depo bulunamazsa verilen yola dusuyoruz: cagiran zaten `read()` ile depo
/// oldugunu dogrulamis oluyor, burasi yalnizca kotu bir durumda cokmesin.
fn work_dir(path: &str) -> String {
    repo_root(path)
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string())
}

/// Dal secicideki tek satir.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GitBranch {
    /// Dal adi; uzak dalda `origin/` on eki YOK, yerel adiyla ayni.
    pub name: String,
    /// Yalnizca uzakta var olan dal icin uzak adi (`origin`); yerel dalda yok.
    pub remote: Option<String>,
}

/// Secicideki dallar, en son commit alan basta.
///
/// Sira `committerdate` ile: alfabetik siralama uzun dal listelerinde ise
/// yaramiyor - aradigin dal genelde son dokundugun dal. Alfabetik listede o
/// dal ortada bir yerde kaliyor.
///
/// ## Uzak dallar da listede
///
/// Ilk tasarimda yoktu: uzak bir dali `git checkout` ile secmek yerel bir
/// izleme dali OLUSTURUYOR ve "gecis yaptim" sandigin yerde yeni bir dal
/// yaratmis oluyorsun. Ama eksiklik daha kotu cikti: `git fetch` sonrasi
/// gelen dal listede gorunmuyor ve kullanici bunu "yenilenmiyor" diye okuyor.
/// Simdi uzak dal listede, yaninda uzagin adi etiket olarak duruyor ve
/// gonderilen komut `git checkout --track origin/ad` - ne oldugu ekranda
/// yaziyor.
///
/// Ayni adla yerel dal varsa uzak kopyasi listelenmiyor: ikisi ayni seye
/// gidiyor ve iki satir "hangisi?" sorusunu dogurur. `origin/HEAD` gibi
/// simgesel basvurular da yok - dal degil, isaretci.
///
/// ## `remotes: false` - yalnizca yerel dallar
///
/// Uzak dallarin sayisi yerel dallarinkinden bagimsiz buyuyor ve okumanin
/// suresini onlar belirliyor. OLCULDU (macOS, 50 bin uzak dal): yalnizca
/// `refs/heads/` 29-56 ms; hepsi 634 ms (paketli ref) ile 8 sn (`git fetch`
/// sonrasi, her ref ayri dosya). Secici yerel dallari once cizip uzaklari
/// arkadan bekleyebilsin diye yerel liste ayri istenebiliyor. Tekillestirme
/// ayni kaliyor: uzak satir yoksa elenecek bir sey de yok.
pub fn branches(path: &str, remotes: bool) -> Vec<GitBranch> {
    let mut args = vec![
        "-C",
        path,
        "--no-optional-locks",
        "for-each-ref",
        "--sort=-committerdate",
        "--format=%(refname)%09%(symref)",
        "refs/heads/",
    ];
    if remotes {
        args.push("refs/remotes/");
    }
    let Ok(out) = quiet_command("git").args(&args).output() else {
        return Vec::new();
    };
    if !out.status.success() {
        return Vec::new();
    }
    parse_refs(&String::from_utf8_lossy(&out.stdout))
}

/// `for-each-ref --format=%(refname)%09%(symref)` ciktisini dal listesine cevirir.
///
/// Saf: sira korunuyor, yerel dalla ayni adli uzak dal dusuyor, simgesel
/// basvurular (`refs/remotes/origin/HEAD`) atlaniyor.
pub fn parse_refs(text: &str) -> Vec<GitBranch> {
    const HEADS: &str = "refs/heads/";
    const REMOTES: &str = "refs/remotes/";

    let rows: Vec<&str> = text
        .lines()
        .map(|l| l.trim_end_matches('\r'))
        .filter(|l| !l.trim().is_empty())
        .filter_map(|l| {
            let (r, sym) = l.split_once('\t').unwrap_or((l, ""));
            // Simgesel basvuru (`origin/HEAD -> origin/main`): dal degil.
            sym.trim().is_empty().then(|| r.trim())
        })
        .collect();

    let locals: std::collections::HashSet<&str> = rows
        .iter()
        .filter_map(|r| r.strip_prefix(HEADS))
        .collect();

    rows.iter()
        .filter_map(|r| {
            if let Some(name) = r.strip_prefix(HEADS) {
                return Some(GitBranch {
                    name: name.to_string(),
                    remote: None,
                });
            }
            let (remote, name) = r.strip_prefix(REMOTES)?.split_once('/')?;
            if locals.contains(name) {
                return None;
            }
            Some(GitBranch {
                name: name.to_string(),
                remote: Some(remote.to_string()),
            })
        })
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
///
/// ## Takipli dosya: `HEAD`e karsi
///
/// OLCULEN HATA: cikti `git diff -- dosya` idi ve o, calisma agacini INDEKSLE
/// karsilastiriyor. Dosya sahnelenince ikisi ayni oluyor ve fark BOS geliyor
/// (0 satir) - panelde bir dosyayi commit'e eklemek satirin farkini "Gosterilecek
/// fark yok"a ceviriyordu.
///
/// `git diff HEAD -- dosya` calisma agacini son commit'le karsilastiriyor:
/// sahnelenmis, sahnelenmemis ve karisik (`MM`) durumun HEPSINDE dosyanin
/// TOPLAM degisikligini veriyor. Karisik durumda commit'e yalnizca sahnelenen
/// kisim girecek ama panel "bu dosyada ne degisti" sorusunu yanitliyor; hangisinin
/// sahnelenmis oldugunu satirdaki kutu ("kismen" durumu) soyluyor.
///
/// Ilk commit'ten onceki depoda `HEAD` yok ("bad revision 'HEAD'"); orada yalnizca
/// indeks var ve sahnelenmis dosyanin farki `--cached` ile geliyor.
pub fn diff(path: &str, file: &str, untracked: bool) -> Option<String> {
    // Kokten kosuyor: `file` koke gore geliyor (bkz. `work_dir`).
    let dir = work_dir(path);
    if untracked {
        // NUL aygiti platforma gore degisiyor; git ikisini de taniyor ama
        // Windows'ta `/dev/null` yok.
        return run_diff(&dir, &["--no-index", "--", NUL_DEVICE, file]);
    }
    run_diff(&dir, &["HEAD", "--", file]).or_else(|| run_diff(&dir, &["--cached", "--", file]))
}

/// `git diff <kuyruk>`i kosar; git ciktiyi uretemediyse `None`.
fn run_diff(dir: &str, tail: &[&str]) -> Option<String> {
    let mut args: Vec<&str> = vec!["-C", dir, "--no-optional-locks", "diff", "--no-color", "--no-ext-diff"];
    args.extend(tail);

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

// --------------------------------------------------------- fark penceresi
//
// Degisiklikler panelindeki fark birlesik (`git diff`) ve yalnizca degisen
// satirlarin cevresini tasiyor. Fark penceresi IntelliJ'deki gibi iki dosyanin
// TAMAMINI yan yana gosteriyor: solda HEAD, sagda calisma agaci. Iki tarafin
// karsilastirmasi arayuzde (`textDiff.ts`); burasi yalnizca iki metni getiriyor
// ve `»` ile geri alinan blogu dosyaya yaziyor.

/// Fark penceresinin tek tarafta tasidigi en fazla bayt.
///
/// Dosya goruntuleyicisinin yarim megabaytindan BUYUK: orada dosyanin basini
/// okumak yetiyor, fark ise iki tarafin TAMAMINI istiyor - kesilmis bir dosyanin
/// sonu "silindi" gibi gorunurdu. Dort megabayt bir kaynak dosyasi icin
/// fazlasiyla yeterli; daha buyugu kesiliyor ve arayuz bunu soyluyor.
const SIDE_LIMIT: usize = 4 * 1024 * 1024;

/// Fark penceresinin iki tarafi.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DiffSides {
    /// Dosyanin HEAD'deki hali. HEAD'de yoksa (yeni ya da takipsiz dosya,
    /// hic commit'i olmayan depo) `None`: pencere o zaman tek taraf ciziyor.
    pub base: Option<crate::files::FileText>,
    /// Calisma agacindaki hali; dosya silinmisse `None`.
    pub current: Option<crate::files::FileText>,
    /// HEAD'in kisa kimligi (sekiz hane) - sol basliktaki etiket. IntelliJ de
    /// yerel degisiklik farkinda sol tarafi commit'in kisa kimligiyle anar.
    pub head: Option<String>,
}

/// Bir dosyanin HEAD'deki ve calisma agacindaki hali.
///
/// Yeniden adlandirmada HEAD'deki hal ESKI yoldan okunuyor (`orig`); yoksa sol
/// taraf bos gelir ve dosya bastan yazilmis gibi gorunurdu.
///
/// `git cat-file blob` HAM icerigi veriyor: satir sonu donusumu (`autocrlf`) ve
/// filtreler uygulanmiyor. Satir sonlari arayuzde zaten ayni sayiliyor
/// (`\r\n` = `\n`); filtreyi (ornegin git-lfs) calistirmak ise farki acmak icin
/// ag istegi yapmak olabilirdi.
pub fn diff_sides(
    path: &str,
    file: &str,
    orig: Option<&str>,
    untracked: bool,
) -> Result<DiffSides, String> {
    let root = repo_root(path).ok_or_else(|| "depo koku bulunamadi".to_string())?;
    let dir = root.to_string_lossy().to_string();

    let head = git_at(&dir)
        .args(["rev-parse", "-q", "--verify", "--short=8", "HEAD"])
        .output()
        .ok()
        .filter(|out| out.status.success())
        .map(|out| String::from_utf8_lossy(&out.stdout).trim().to_string())
        .filter(|s| !s.is_empty());

    let base = if untracked || head.is_none() {
        None
    } else {
        let spec = format!("HEAD:{}", orig.unwrap_or(file));
        git_at(&dir)
            .args(["cat-file", "blob", &spec])
            .output()
            .ok()
            // Yol HEAD'de yoksa (yeni eklenmis dosya) git 128 ile cikiyor;
            // bu bir hata degil, "sol taraf yok" demek.
            .filter(|out| out.status.success())
            .map(|out| {
                let size = out.stdout.len() as u64;
                crate::files::text_from_bytes(&out.stdout, size, SIDE_LIMIT)
            })
    };

    let target = root.join(file);
    let current = if target.is_file() {
        let bytes = std::fs::read(&target).map_err(|e| e.to_string())?;
        let size = bytes.len() as u64;
        Some(crate::files::text_from_bytes(&bytes, size, SIDE_LIMIT))
    } else {
        None
    };

    Ok(DiffSides { base, current, head })
}


/// Fark penceresinin `»` dugmesi: calisma agacindaki dosyayi yeni icerikle yazar.
///
/// ## Neden `expected`
///
/// Arayuz yeni icerigi, farkini ALDIGI hale gore kurdu. Dosya o arada bir
/// duzenleyicide degistiyse (kaydet, bicimlendir) korkusuzca yazmak o
/// degisikligi sessizce silerdi. Dosyanin su anki hali farkin alindigi hal degilse
/// hicbir sey yazilmiyor ve `changed` donuyor; arayuz farki tazeliyor.
///
/// UTF-8 olmayan dosya da reddediliyor: arayuz onu `from_utf8_lossy` ile
/// okudu, yani elindeki metin dosyanin kendisi degil ve geri yazmak gecersiz
/// baytlari U+FFFD ile degistirirdi.
///
/// ## Sinirlar
///
/// Yalnizca depo kokunun ALTINDAKI, VAR OLAN, sembolik baglanti olmayan bir dosya.
/// Yol porcelain'den geliyor ama denetim burada: `..` ya da baglanti uzerinden
/// deponun disina yazmak bu komutun isi degil.
pub fn write_worktree_file(path: &str, file: &str, expected: &str, text: &str) -> Result<(), String> {
    use std::path::Component;

    let root = repo_root(path).ok_or_else(|| "depo koku bulunamadi".to_string())?;
    let rel = std::path::Path::new(file);
    if rel.components().any(|c| !matches!(c, Component::Normal(_))) {
        return Err(format!("gecersiz yol: {file}"));
    }
    crate::files::write_checked(&root.join(rel), expected, text)
}

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
    let index = mtime_ms(&dir.join("index"));
    // Ucuncu parca: stash gunlugu. `stash drop` INDEKSE dokunmuyor (yalnizca
    // gunlugu ve `refs/stash`i degistiriyor), yani terminalden silinen bir
    // stash imzada gorunmuyordu ve panel eski listeyi gostermeye devam ederdi.
    let stash = mtime_ms(&stash_log_path(&dir));
    Some(format!("{}|{index}|{stash}", head.trim()))
}

/// Bir dosyanin degisme zamani (ms); dosya yoksa 0.
fn mtime_ms(path: &std::path::Path) -> u128 {
    std::fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

/// Deponun ORTAK git dizini.
///
/// Ek calisma agaclarinda (`git worktree`) `.git` bir dosya ve `.git/worktrees/<ad>`e
/// isaret ediyor; orada bir `commondir` dosyasi ana dizine GORELI yolu veriyor
/// (`../..`, olculdu). `refs/` ve reflog'lar - stash dahil - ORTAK dizinde, agacin
/// kendi dizininde degil. Sade depoda `commondir` yok ve `.git` kendisi ortak.
fn common_dir(gitdir: &std::path::Path) -> std::path::PathBuf {
    match std::fs::read_to_string(gitdir.join("commondir")) {
        Ok(text) if !text.trim().is_empty() => {
            let yol = std::path::Path::new(text.trim());
            if yol.is_absolute() {
                yol.to_path_buf()
            } else {
                gitdir.join(yol)
            }
        }
        _ => gitdir.to_path_buf(),
    }
}

/// Stash yansima dosyasinin yolu (var olmayabilir: son stash silinince kayboluyor).
fn stash_log_path(gitdir: &std::path::Path) -> std::path::PathBuf {
    common_dir(gitdir).join("logs").join("refs").join("stash")
}

/// Stash'teki kayit sayisi; surec BASLATMADAN (bkz. `GitInfo::stash_count`).
///
/// Satir sayisi bayt duzeyinde sayiliyor: yansima satirlari yazar adi tasiyor ve
/// UTF-8 olmayan bir ad `read_to_string`i dusurup sayiyi sessizce 0 yapardi.
pub fn stash_count(start: &std::path::Path) -> u32 {
    let Some(dir) = git_dir(start) else { return 0 };
    std::fs::read(stash_log_path(&dir))
        .map(|bytes| bytes.iter().filter(|&&b| b == b'\n').count() as u32)
        .unwrap_or(0)
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
/// Yol depo KOKUNE gore geliyor (porcelain oyle veriyor), o yuzden komutlar
/// da KOKTEN kosuyor — kabuk bir alt klasordeyse `-C path` yanlis dosyayi
/// arardi (gerekcesi `work_dir` icinde).
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

    // Kokten kosuyor: `file` koke gore geliyor (bkz. `work_dir`).
    let dir = work_dir(path);

    // Indeksi coz. Dosya indekste degilse git hata veriyor; bu bir sorun
    // degil, yalnizca "cozecek bir sey yoktu" demek.
    let _ = quiet_command("git")
        .args(["-C", &dir, "--no-optional-locks", "restore", "--staged", "--", file])
        .output();

    let out = quiet_command("git")
        .args(["-C", &dir, "--no-optional-locks", "checkout", "--", file])
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

// ------------------------------------------------------------ yazma islemleri
//
// `stage`, `unstage`, `commit` ve `push`: Degisiklikler panelinden commit atmayi
// mumkun kiliyorlar. Dortunun ortak kararlari:
//
// - KOKTEN kosuyorlar. `revert` ile ayni sebep (bkz. `work_dir`): yollar
//   porcelain'den geliyor ve depo kokune gore.
// - Git'in KENDI hata metnini donduruyorlar. "Reddedildi", "commit edilecek bir
//   sey yok", "kimlik bilinmiyor", bir kancanin (hook) ciktisi: hepsinin dogru
//   aciklamasi git'in yazdigi cumle ve arayuz onu oldugu gibi gosteriyor. Kendi
//   cevirimizi yazmak, her surumde degisen bir metin listesini ayristirmak demek.
// - Terminal istemi KAPALI (`GIT_TERMINAL_PROMPT=0`). Uygulama terminalsiz bir
//   surec; git kimlik sormaya kalkarsa bekler ve arayuz "gonderiliyor"da asili
//   kalir. Kapaliyken hemen "could not read Username" ile dusuyor. Anahtar zinciri
//   ve kimlik yoneticisi gibi yardimcilar bundan etkilenmiyor.

/// Indeksi degistiren islemler TEK TEK kosuyor.
///
/// Iki `git add` ayni anda baslarsa ikincisi `index.lock` yuzunden "Unable to
/// create '.git/index.lock': File exists" ile dusuyor. Kullanici iki kutuyu art
/// arda isaretlediginde bu her an olabilecek bir yaris.
static INDEX_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

/// `-C <dizin>` ve kapali terminal istemiyle bir git komutu hazirlar.
fn git_at(dir: &str) -> std::process::Command {
    let mut cmd = quiet_command("git");
    cmd.args(["-C", dir]).env("GIT_TERMINAL_PROMPT", "0");
    cmd
}

/// Hata metninin en fazla uzunlugu (karakter).
///
/// Bir commit kancasi (lint, test) megabaytlarca cikti yazabiliyor; bunu IPC
/// uzerinden arayuze tasimak ve bir hata kutusuna sigdirmak anlamsiz. Bastaki
/// kisim yeter: nedenin yazildigi yer orasi.
const MAX_ERROR_CHARS: usize = 4000;

/// Basarisiz bir git komutunun kullaniciya gosterilecek metni.
///
/// stderr VE stdout birlikte: git iki yere de yaziyor. `commit` icin "commit
/// edilecek bir sey yok" iletisi STDOUT'a gidiyor (olculdu, stderr bos), bir
/// kancanin ciktisi ise ikisinden birine. Yalnizca stderr'e bakmak ilkini bos
/// birakirdi.
fn failure_text(out: &std::process::Output) -> String {
    let err = String::from_utf8_lossy(&out.stderr);
    let norm = String::from_utf8_lossy(&out.stdout);
    let mut text = [err.trim(), norm.trim()]
        .into_iter()
        .filter(|p| !p.is_empty())
        .collect::<Vec<_>>()
        .join("\n");
    if text.is_empty() {
        // Metinsiz bir basarisizlik: en azindan cikis durumu.
        return format!("git basarisiz oldu ({})", out.status);
    }
    if let Some((cut, _)) = text.char_indices().nth(MAX_ERROR_CHARS) {
        text.truncate(cut);
        text.push_str("...");
    }
    text
}

/// Verilen yollari indekse ekler (`git add`).
///
/// `--literal-pathspecs`: yollar GERCEK dosya adlari, desen degil. OLCULDU:
/// varsayilanda `git add -- "[a].txt"` `[a].txt` ile birlikte `a.txt`yi de
/// ekliyor (kose parantezli ad bir karakter sinifi sayiliyor). Yollar
/// porcelain'den geliyor, yani `[`, `*`, `?` ya da bastaki `:` gercek adin
/// parcasi ve baska dosyalari surukleyip goturmemeli.
///
/// Silinmis bir dosyanin yolu verilirse silme indekse eklenir (`D `); takipsiz
/// bir klasor verilirse icindeki her sey.
///
/// ## Izlenen dosyalar `add -u` ile
///
/// BILDIRILEN: "Dosyalarin tumunu sec dedigimde" panel "Dosya secimi
/// degistirilemedi — The following paths are ignored by one of your .gitignore
/// files: js-storefront/yatas/.vscode" diyordu. `.vscode` bir `.gitignore`'da
/// ama icindeki dosyalar daha once commit'lenmis; degisen `settings.json`
/// listede ` M`.
///
/// OLCULDU (git 2.50): yok sayilan bir klasorun altindaki IZLENEN dosyayi yolla
/// vermek (`git add -- sub/.vscode/settings.json`) dosyayi SAHNELIYOR ama uyari
/// basip 1 ile cikiyor; `advice.addIgnoredFile=false` yalnizca ipucunu
/// susturuyor, kod yine 1. Islem olmus, arayuz basarisiz sanip hata
/// gosteriyordu. `git add -u` (yalnizca izlenenleri guncelle) ayni isi uyarisiz
/// ve 0 ile yapiyor; silmeyi ve cakisma cozumunu de kapsiyor. Ama takipsiz yolu
/// SESSIZCE atliyor — o yuzden yollar ikiye ayriliyor: indekste olanlar
/// `add -u`, olmayanlar (takipsiz dosya ve klasorler) duz `add`.
///
/// `-f` (zorla) DEGIL: takipsiz bir klasor yolu verildiginde icindeki yok
/// sayilan her seyi (`node_modules`) de eklerdi.
pub fn stage(path: &str, files: &[String]) -> Result<(), String> {
    if files.is_empty() {
        return Ok(());
    }
    let _sira = INDEX_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let dir = work_dir(path);
    let indekste = tracked_paths(&dir, files)?;
    let (izlenen, takipsiz): (Vec<String>, Vec<String>) =
        files.iter().cloned().partition(|f| indekste.contains(f.as_str()));
    if !izlenen.is_empty() {
        run_index(&dir, &["add", "-u", "--"], &izlenen)?;
    }
    if !takipsiz.is_empty() {
        run_index(&dir, &["add", "--"], &takipsiz)?;
    }
    Ok(())
}

/// Verilen yollardan INDEKSTE olanlar (`git ls-files`), depo kokune gore.
///
/// Takipsiz bir klasor yolu (`yeni/`) listede yer almiyor: `ls-files` onun
/// altindaki izlenen dosyalari verir (yoksa hicbir sey), klasorun kendisini
/// degil — yani klasor dogru tarafa, duz `add`e dusuyor.
fn tracked_paths(dir: &str, files: &[String]) -> Result<std::collections::HashSet<String>, String> {
    let out = git_at(dir)
        .arg("--literal-pathspecs")
        .args(["ls-files", "-z", "--"])
        .args(files)
        .output()
        .map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(failure_text(&out));
    }
    Ok(String::from_utf8_lossy(&out.stdout)
        .split('\0')
        .filter(|p| !p.is_empty())
        .map(str::to_string)
        .collect())
}

/// Verilen yollari indeksten cikarir; calisma agacindaki dosyalara DOKUNMAZ.
///
/// `restore --staged` DEGIL `reset -q`: ilk commit'ten onceki depoda HEAD yok ve
/// `restore --staged` "could not resolve HEAD" ile dusuyor (olculdu); `reset`
/// bos agaca karsi calisiyor. Yeniden adlandirmada eski ve yeni yol BIRLIKTE
/// verilmeli (bkz. `GitChange::orig_path`).
pub fn unstage(path: &str, files: &[String]) -> Result<(), String> {
    index_op(path, &["reset", "-q", "--"], files)
}

fn index_op(path: &str, verb: &[&str], files: &[String]) -> Result<(), String> {
    // Bos liste: yapilacak is yok, hata degil. `git add --` yollarsiz
    // "Nothing specified, nothing added" der.
    if files.is_empty() {
        return Ok(());
    }
    let _sira = INDEX_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    run_index(&work_dir(path), verb, files)
}

/// Indeksi degistiren git komutu; kilidi CAGIRAN tutuyor.
fn run_index(dir: &str, verb: &[&str], files: &[String]) -> Result<(), String> {
    let out = git_at(dir)
        .arg("--literal-pathspecs")
        .args(verb)
        .args(files)
        .output()
        .map_err(|e| e.to_string())?;
    if out.status.success() {
        Ok(())
    } else {
        Err(failure_text(&out))
    }
}

/// Indeksteki dosyalari commit'ler; basarida KISA nesne kimligini doner.
///
/// `-a` YOK: commit'e yalnizca acikca sahnelenenler giriyor. Panelin kutulari
/// tam olarak bunu gosteriyor; sahnelenmemis bir degisikligin kendiliginden
/// girmesi "isaretlemedigim dosya commit'e girdi" demek.
///
/// Kancalar (pre-commit, commit-msg) ATLANMIYOR: onlari kullanici koymus ve
/// `--no-verify` sessizce devre disi birakirdi. Bir kanca basarisiz olursa
/// ciktisi hata metninde (bkz. `failure_text`).
pub fn commit(path: &str, message: &str) -> Result<String, String> {
    // Arayuz bos iletide dugmeyi kapatiyor; bu yalnizca savunma. Git de bos
    // iletiyi reddediyor ama ne dedigi surume gore degisiyor.
    if message.trim().is_empty() {
        return Err("commit iletisi bos".into());
    }
    let _sira = INDEX_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let dir = work_dir(path);
    let out = git_at(&dir)
        .args(["commit", "-m", message])
        .output()
        .map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(failure_text(&out));
    }
    let head = git_at(&dir)
        .args(["rev-parse", "--short", "HEAD"])
        .output()
        .map_err(|e| e.to_string())?;
    Ok(String::from_utf8_lossy(&head.stdout).trim().to_string())
}

/// Son commit'i geri alir (IntelliJ'in "Undo Commit"i): `git reset --soft HEAD^`.
/// Basarida commit'in TAM iletisini doner; arayuz onu commit kutusuna koyuyor.
///
/// ISTEK: "commit ettikten sonra push basinca acilan ekranda commit'i geri
/// almak mumkun mu?" — Push panelindeki en ustteki commit'te.
///
/// ## Neden yalnizca soft
///
/// Commit kalkiyor ama ICERIGI kaybolmuyor: degisiklikler eklenmis (staged)
/// hâlde calisma agacinda duruyor. Hicbir sey silinmedigi icin arayuz onay
/// sormuyor. `--hard` ya da `--mixed` bu islevin isi degil.
///
/// ## Reddettigi durumlar
///
/// - `id` artik HEAD degil (panel acikken terminalden commit atildi): yanlis
///   commit'i geri almamak icin.
/// - Ayrik HEAD: geri alinacak dal yok.
/// - Commit UZAKTA var (herhangi bir uzak izleme dalinda): onu geri almak
///   paylasilmis gecmisi yeniden yazmak ve sonraki push'u zorlamaya donusturmek
///   demek. Panel zaten yalnizca gonderilmemis commit'leri gosteriyor; bu
///   savunma.
/// - Deponun ilk commit'i: geri donulecek ebeveyn yok.
pub fn undo_last_commit(path: &str, id: &str) -> Result<String, String> {
    if !valid_id(id) {
        return Err("gecersiz commit kimligi".into());
    }
    let _sira = INDEX_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let dir = work_dir(path);
    let out = |args: &[&str]| -> Result<std::process::Output, String> {
        git_at(&dir).args(args).output().map_err(|e| e.to_string())
    };

    if !out(&["symbolic-ref", "-q", "HEAD"])?.status.success() {
        return Err("ayrik HEAD: geri alinacak dal yok".into());
    }
    let head = out(&["rev-parse", "--verify", "-q", "HEAD"])?;
    let head = String::from_utf8_lossy(&head.stdout).trim().to_string();
    if head.is_empty() || !head.starts_with(&id.to_ascii_lowercase()) {
        return Err("son commit degisti; liste tazelendi, yeniden deneyin".into());
    }
    let remotes = out(&["for-each-ref", "--contains", "HEAD", "--format=%(refname)", "refs/remotes"])?;
    if !remotes.status.success() {
        return Err(failure_text(&remotes));
    }
    if !String::from_utf8_lossy(&remotes.stdout).trim().is_empty() {
        return Err("bu commit uzakta var; geri almak paylasilmis gecmisi degistirirdi".into());
    }
    if !out(&["rev-parse", "--verify", "-q", "HEAD^1"])?.status.success() {
        return Err("deponun ilk commit'i geri alinamaz".into());
    }

    let message = out(&["log", "-1", "--no-show-signature", "--format=%B", "HEAD"])?;
    let message = String::from_utf8_lossy(&message.stdout).trim_end().to_string();
    let reset = out(&["reset", "--soft", "--quiet", "HEAD^1"])?;
    if !reset.status.success() {
        return Err(failure_text(&reset));
    }
    Ok(message)
}

/// Gecerli dali uzaga gonderir; basarida HEDEFI (`origin/main`) doner.
///
/// ## Iki yol
///
/// - Yukari akisi VAR: yalin `git push`. Kullanicinin yapilandirmasina
///   (`push.default`, `branch.<ad>.pushRemote`, `remote.pushDefault`) uyuyor;
///   terminalde yazacagi komutla ayni seyi yapiyor.
/// - Yukari akisi YOK (yeni dal ya da `[gone]`): `git push -u <uzak> HEAD` -
///   dalin uzakta olusturulmasi ve izlemenin kurulmasi. Arayuz bu durumda
///   "Yayinla" diyor.
///
/// ## Etiketler ASLA gitmiyor
///
/// `--no-follow-tags`: OLCULDU - `push.followTags=true` yapilandirmasinda yalin
/// `git push` yerelde duran ACIKLAMALI etiketi de uzaga itiyor, bayrak bunu
/// yapilandirmaya ragmen engelliyor. Bu depoda etiket itmek YAYIN demek (`v*`
/// etiketi surum paketlerini GitHub Release'ine bagliyor) ve yerelde uzaga
/// gitmemesi gereken bir yedek etiketi (`trailer-oncesi-yedek`) duruyor.
/// Panelden itilen bir seyin surpriz bir yayina donusmemesi icin etiketler bu
/// islevin kapsami disinda.
///
/// Zorla itme (`--force`) HIC yok: reddedilen bir push kullaniciya oldugu gibi
/// gosteriliyor, karar terminalde.
pub fn push(path: &str) -> Result<String, String> {
    let dir = work_dir(path);

    // Ayrik HEAD'de `symbolic-ref` basarisiz: gonderilecek bir dal yok.
    let head = git_at(&dir)
        .args(["symbolic-ref", "-q", "--short", "HEAD"])
        .output()
        .map_err(|e| e.to_string())?;
    if !head.status.success() {
        return Err("HEAD bir dala bagli degil; gonderilemez".into());
    }
    let branch = String::from_utf8_lossy(&head.stdout).trim().to_string();

    // Ilk commit'ten onceki depoda `push` "src refspec HEAD does not match any"
    // diyor; ne yapilmasi gerektigini soyleyen bir cumle daha iyi.
    let has_commit = git_at(&dir)
        .args(["rev-parse", "--verify", "-q", "HEAD"])
        .output()
        .map_err(|e| e.to_string())?
        .status
        .success();
    if !has_commit {
        return Err("henuz commit yok; gonderilecek bir sey yok".into());
    }

    // `@{upstream}` silinmis (`[gone]`) ya da hic kurulmamis bir yukari akista
    // basarisiz oluyor (olculdu): ikisi de "yayinla" yoluna dusuyor.
    let up = git_at(&dir)
        .args(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"])
        .output()
        .map_err(|e| e.to_string())?;

    if up.status.success() {
        let target = String::from_utf8_lossy(&up.stdout).trim().to_string();
        let out = git_at(&dir)
            .args(["push", "--no-follow-tags"])
            .output()
            .map_err(|e| e.to_string())?;
        return push_result(&out, target);
    }

    let remotes = git_at(&dir)
        .arg("remote")
        .output()
        .map_err(|e| e.to_string())?;
    let names: Vec<String> = String::from_utf8_lossy(&remotes.stdout)
        .lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect();
    let remote = choose_remote(&names)?;

    let out = git_at(&dir)
        .args(["push", "--no-follow-tags", "-u", &remote, "HEAD"])
        .output()
        .map_err(|e| e.to_string())?;
    push_result(&out, format!("{remote}/{branch}"))
}

fn push_result(out: &std::process::Output, target: String) -> Result<String, String> {
    if out.status.success() {
        Ok(target)
    } else {
        Err(failure_text(out))
    }
}

/// Yeni bir dalin yayinlanacagi uzak depo.
///
/// `origin` varsa o: hemen her depoda ana uzak. Yoksa TEK uzak varsa o. Birden
/// cok uzak ve `origin` yoksa TAHMIN ETMIYOR: yanlis bir uzaga yayinlanan dal
/// geri alinmasi zahmetli bir sey (baskasinin deposuna sizabilir), sormak ise
/// bir hata metni.
///
/// Saf: uzak listesi disaridan geliyor, boylece kose durumlari gercek depo
/// kurmadan test ediliyor.
pub fn choose_remote(names: &[String]) -> Result<String, String> {
    if names.iter().any(|n| n == "origin") {
        return Ok("origin".into());
    }
    match names {
        [] => Err("uzak depo tanimli degil".into()),
        [only] => Ok(only.clone()),
        _ => Err(format!(
            "birden cok uzak depo var ({}) ve hangisine gonderilecegi belli degil",
            names.join(", ")
        )),
    }
}

// ---------------------------------------------------------------- outgoing
//
// Gonderilecek commit'ler: Push'a basmadan once neyin gidecegi.
//
// BILDIRILEN: "push edecegim icerigi de gormem gerekmez mi? hangi commitler
// var diye." Panel yalnizca "N commit gonderilmedi" diyordu.
//
// Liste `push`in gonderecegi seyle AYNI ayrimi yapiyor: yukari akis varsa
// `@{upstream}..HEAD`, yoksa ("yayinla" yolu, silinmis uzak dahil) hicbir
// uzakta olmayan commit'ler (`HEAD --not --remotes`). Uclari de salt okunur.

/// Gonderilecek listedeki tek commit.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitSummary {
    /// TAM karma; dosya listesi ve fark bununla isteniyor.
    pub id: String,
    /// Git'in kisalttigi karma (depoya gore 7+ hane).
    pub short: String,
    pub author: String,
    /// Unix saniyesi (commit zamani).
    pub time: i64,
    /// Iletinin ilk satiri.
    pub subject: String,
}

/// Gonderilecek commit'ler, en yeni basta, ve TOPLAM sayi.
///
/// Liste `MAX_OUTGOING`te kesiliyor, `total` kesilmiyor: hic uzagi olmayan bir
/// depoyu "yayinla" demek butun gecmisi gondermek ve on binlerce satiri arayuze
/// tasimak bos maliyet. Arayuz kesildigini "… ve N commit daha" ile soyluyor.
#[derive(Debug, Clone, Serialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct GitOutgoing {
    pub commits: Vec<GitCommitSummary>,
    pub total: u32,
}

const MAX_OUTGOING: usize = 100;

/// `git log --format=%H%x1f%h%x1f%an%x1f%ct%x1f%s` ciktisini cozer.
///
/// Saf: bicim burada testleniyor. `%s` tek satir; konu bos olabilir (`commit
/// --allow-empty-message`), o yuzden alan sayisi 5'ten azsa satir atiliyor ama
/// bos konu kabul ediliyor.
pub fn parse_commit_log(text: &str) -> Vec<GitCommitSummary> {
    text.lines()
        .filter_map(|line| {
            let mut parts = line.trim_end_matches('\r').splitn(5, '\u{1f}');
            let id = parts.next()?.trim();
            let short = parts.next()?.trim();
            let author = parts.next()?;
            let time = parts.next()?.trim().parse::<i64>().unwrap_or(0);
            let subject = parts.next()?;
            if id.is_empty() {
                return None;
            }
            Some(GitCommitSummary {
                id: id.to_string(),
                short: short.to_string(),
                author: author.to_string(),
                time,
                subject: subject.to_string(),
            })
        })
        .collect()
}

/// `push`in gonderecegi commit'ler.
///
/// Ayrik HEAD'de ya da ilk commit'ten onceki depoda bos: orada gonderilecek dal
/// yok (bkz. `push`).
pub fn outgoing(path: &str) -> Result<GitOutgoing, String> {
    let dir = work_dir(path);
    let ok = |args: &[&str]| -> Result<bool, String> {
        Ok(git_at(&dir).args(args).output().map_err(|e| e.to_string())?.status.success())
    };
    if !ok(&["symbolic-ref", "-q", "HEAD"])? || !ok(&["rev-parse", "--verify", "-q", "HEAD"])? {
        return Ok(GitOutgoing::default());
    }

    let range: &[&str] = if ok(&["rev-parse", "--verify", "-q", "@{upstream}"])? {
        &["@{upstream}..HEAD"]
    } else {
        &["HEAD", "--not", "--remotes"]
    };

    let count = git_at(&dir)
        .args(["rev-list", "--count"])
        .args(range)
        .arg("--")
        .output()
        .map_err(|e| e.to_string())?;
    if !count.status.success() {
        return Err(failure_text(&count));
    }
    let total = String::from_utf8_lossy(&count.stdout).trim().parse::<u32>().unwrap_or(0);
    if total == 0 {
        return Ok(GitOutgoing::default());
    }

    // `--no-show-signature`: `log.showSignature` acik bir makinede imza satirlari
    // bicimin arasina karisirdi.
    let log = git_at(&dir)
        .args(["log", "--no-color", "--no-show-signature", "-n"])
        .arg(MAX_OUTGOING.to_string())
        .arg("--format=%H%x1f%h%x1f%an%x1f%ct%x1f%s")
        .args(range)
        .arg("--")
        .output()
        .map_err(|e| e.to_string())?;
    if !log.status.success() {
        return Err(failure_text(&log));
    }
    Ok(GitOutgoing {
        commits: parse_commit_log(&String::from_utf8_lossy(&log.stdout)),
        total,
    })
}

/// Commit'in ILK ebeveyni (`kimlik^1`); kok commit'te `None`.
///
/// Birlestirme commit'i ilk ebeveynine gore anlatiliyor: dala ne GELDIGI
/// (`git log --first-parent` ve IntelliJ'in varsayilani). Ikinci ebeveyne gore
/// fark, birlestirilen dalin zaten bilinen commit'lerini yeniden listelerdi.
fn first_parent(dir: &str, id: &str) -> Option<String> {
    let parent = format!("{id}^1");
    git_at(dir)
        .args(["rev-parse", "-q", "--verify", &parent])
        .output()
        .ok()?
        .status
        .success()
        .then_some(parent)
}

/// Bir commit'in degistirdigi dosyalar ve toplam dosya sayisi.
///
/// Bicim stash'in dosya listesiyle ayni (`StashFiles`): ikisi de "bir revizyonun
/// dosyalari" ve arayuz ayni satirla ciziyor. Kok commit bos agaca gore
/// (`--root`).
pub fn commit_files(path: &str, id: &str) -> Result<StashFiles, String> {
    if !valid_id(id) {
        return Err("gecersiz commit kimligi".into());
    }
    let dir = work_dir(path);
    let mut cmd = git_at(&dir);
    cmd.args(["diff-tree", "-r", "-z", "-M", "--name-status", "--no-commit-id"]);
    match first_parent(&dir, id) {
        Some(parent) => cmd.arg(parent).arg(id),
        None => cmd.arg("--root").arg(id),
    };
    let out = cmd.output().map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(failure_text(&out));
    }
    let mut files = parse_name_status_z(&String::from_utf8_lossy(&out.stdout));
    let total = files.len() as u32;
    files.truncate(MAX_STASH_FILES);
    Ok(StashFiles { files, total })
}

/// Bir commit'teki tek dosyanin farki (birlesik bicim, renksiz); okunamazsa `None`.
///
/// Yeniden adlandirmada ESKI yol da pathspec'e giriyor (bkz. `stash_diff`).
pub fn commit_diff(path: &str, id: &str, file: &str, orig: Option<&str>) -> Option<String> {
    if !valid_id(id) {
        return None;
    }
    let dir = work_dir(path);
    let mut cmd = git_at(&dir);
    cmd.arg("--literal-pathspecs")
        .args(["diff-tree", "-p", "-M", "--no-color", "--no-commit-id"]);
    match first_parent(&dir, id) {
        Some(parent) => cmd.arg(parent).arg(id),
        None => cmd.arg("--root").arg(id),
    };
    cmd.args(["--", file]);
    if let Some(orig) = orig {
        cmd.arg(orig);
    }
    let out = cmd.output().ok()?;
    out.status
        .success()
        .then(|| String::from_utf8_lossy(&out.stdout).to_string())
}

// ------------------------------------------------------------------- stash
//
// Stash listesi, icerigi ve uc yazma islemi (`stash_push`, `stash_apply`,
// `stash_drop`). Ortak kararlar:
//
// - Bir stash'i KIMLIGIYLE (commit karmasi) anlatiyoruz, `stash@{n}` ile degil.
//   `n` baska bir stash eklendikce ya da silindikce kayiyor ve arayuzde gorunen
//   liste ile diskteki liste ayrisabiliyor (terminalden `git stash` atildi).
//   Islem aninda guncel listede aranip `stash@{n}`e cevriliyor; bulunamazsa
//   YANLIS bir stash'e dokunmak yerine hata veriliyor.
// - `apply` ham karma ile calisiyor ama `pop` ve `drop` calismiyor ("is not a
//   stash reference", olculdu); ucunun de ayni yoldan gitmesi icin hepsi
//   `stash@{n}` kullaniyor.
// - Indeksi degistirenler `INDEX_LOCK` altinda: `git add` ile ayni `index.lock`
//   yarisi burada da gecerli.

/// Stash listesindeki tek satir.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GitStash {
    /// Stash commit'inin TAM karmasi; ayni stash'i gosteren tek kalici sey.
    pub id: String,
    /// Kullanicinin verdigi ad; verilmediyse git'in `WIP on ...` metninden dal
    /// adi atilmis hali (`1a2b3c4 son commit konusu`).
    pub name: String,
    /// Stash'in atildigi dal; bilinmiyorsa bos.
    pub branch: String,
    /// Unix saniyesi.
    pub time: i64,
    /// Ad kullanicinin verdigi bir ad mi; `false` ise git'in varsayilani.
    pub named: bool,
}

/// `git stash list --format=%H%x1f%ct%x1f%gs` ciktisini cozer.
///
/// Saf: bicim (`On dal: ad`, `WIP on dal: karma konu`, `stash store -m` ile gelen
/// duz metin) burada testleniyor.
pub fn parse_stash_list(text: &str) -> Vec<GitStash> {
    text.lines().filter_map(parse_stash_line).collect()
}

fn parse_stash_line(line: &str) -> Option<GitStash> {
    let mut parts = line.trim_end_matches('\r').splitn(3, '\u{1f}');
    let id = parts.next()?.trim();
    let time = parts.next()?.trim().parse::<i64>().unwrap_or(0);
    let subject = parts.next()?.trim();
    if id.is_empty() {
        return None;
    }
    let (branch, name, named) = split_stash_subject(subject);
    Some(GitStash {
        id: id.to_string(),
        name,
        branch,
        time,
        named,
    })
}

/// Yansima konusunu (dal, ad, adli mi) parcalarina ayirir.
///
/// Dal adi ilk `: ` a kadar: git dal adinda iki nokta kabul etmiyor, yani ad
/// (`fix: ayar penceresi`) icinde iki nokta olsa da bolme dogru yerde.
fn split_stash_subject(subject: &str) -> (String, String, bool) {
    let (rest, named) = if let Some(r) = subject.strip_prefix("On ") {
        (r, true)
    } else if let Some(r) = subject.strip_prefix("WIP on ") {
        (r, false)
    } else {
        // `git stash store -m ...` gibi araclarin yazdigi duz metin: dal bilinmiyor,
        // ama bir insanin yazdigi bir ad.
        return (String::new(), subject.to_string(), true);
    };
    match rest.split_once(": ") {
        Some((branch, name)) => (branch.to_string(), name.to_string(), named),
        None => (rest.trim_end_matches(':').to_string(), String::new(), named),
    }
}

/// Deponun stash'leri, en yeni basta (git'in sirasi).
///
/// Hata YUTULUYOR (git yok, depo degil): bos liste "stash yok" ile ayni sey
/// olarak gosteriliyor ve bu bir kolaylik listesi, bir sozlesme degil.
pub fn stashes(path: &str) -> Vec<GitStash> {
    let dir = work_dir(path);
    let Ok(out) = quiet_command("git")
        .args(["-C", &dir, "--no-optional-locks", "stash", "list", "--format=%H%x1f%ct%x1f%gs"])
        .output()
    else {
        return Vec::new();
    };
    if !out.status.success() {
        return Vec::new();
    }
    parse_stash_list(&String::from_utf8_lossy(&out.stdout))
}

/// Karma gibi gorunen bir kimlik mi: 7-64 onaltilik hane.
///
/// Kimlik arayuzden geliyor ve `git diff <kimlik>^1` gibi komutlara giriyor;
/// `--output=...` gibi bir dize burada bir SECENEK olarak yorumlanabilirdi.
fn valid_id(id: &str) -> bool {
    (7..=64).contains(&id.len()) && id.bytes().all(|b| b.is_ascii_hexdigit())
}

/// Stash'in icindeki bir dosya.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StashFile {
    /// Porcelain benzeri iki karakter: `"M "`, `"A "`, `"D "`, `"R "`, takipsizde `"??"`.
    pub status: String,
    pub path: String,
    /// Dosya `-u` ile alinmis TAKIPSIZ bir dosya (stash'in ucuncu ebeveyninde).
    pub untracked: bool,
    /// Yeniden adlandirmada eski yol.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub orig_path: Option<String>,
}

/// Bir stash'in dosya listesi ve TOPLAM dosya sayisi.
///
/// Liste `MAX_STASH_FILES`'ta kesiliyor, `total` kesilmiyor: `-u` ile alinmis bir
/// `node_modules` on binlerce dosya demek ve hepsini arayuze tasimak bos maliyet.
/// Arayuz kesildigini "... ve N dosya daha" satiriyla soyluyor; sessizce kesmek
/// "dosyam nerede" sorusunu dogururdu.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StashFiles {
    pub files: Vec<StashFile>,
    pub total: u32,
}

const MAX_STASH_FILES: usize = 200;

/// `git diff --name-status -z` ciktisini cozer.
///
/// `-z`: yollar TIRNAKSIZ ve NUL ile ayrilmis, yani bosluklu, Turkce harfli ya da
/// tirnakli adlar icin ayri bir kural gerekmiyor. Yeniden adlandirma ve kopyalama
/// (`R100`, `C75`) iki yol tasiyor: once ESKI, sonra YENI (olculdu).
pub fn parse_name_status_z(text: &str) -> Vec<StashFile> {
    let mut out = Vec::new();
    let mut parts = text.split('\0').filter(|s| !s.is_empty());
    while let Some(status) = parts.next() {
        let letter = status.chars().next().unwrap_or('M');
        if letter == 'R' || letter == 'C' {
            let (Some(old), Some(new)) = (parts.next(), parts.next()) else {
                break;
            };
            out.push(StashFile {
                status: format!("{letter} "),
                path: new.to_string(),
                untracked: false,
                orig_path: Some(old.to_string()),
            });
        } else {
            let Some(path) = parts.next() else { break };
            out.push(StashFile {
                status: format!("{letter} "),
                path: path.to_string(),
                untracked: false,
                orig_path: None,
            });
        }
    }
    out
}

/// Bir stash'in icerdigi dosyalar.
///
/// Iki kaynak: TAKIPLI degisiklikler `kimlik^1` (stash'in atildigi HEAD) ile
/// `kimlik` arasindaki fark; `-u` ile alinan TAKIPSIZ dosyalar ise ucuncu
/// ebeveynin (`kimlik^3`) agaci (klasorler dosyalara aciliyor, olculdu). Bu,
/// `git stash show --include-untracked`in yaptigi is, ama eski git surumlerinde de
/// calisan parcalariyla.
pub fn stash_files(path: &str, id: &str) -> Result<StashFiles, String> {
    if !valid_id(id) {
        return Err("gecersiz stash kimligi".into());
    }
    let dir = work_dir(path);
    let base = format!("{id}^1");
    let out = git_at(&dir)
        .args(["diff", "--name-status", "-z", "-M", "--no-color", "--no-ext-diff", &base, id])
        .output()
        .map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(failure_text(&out));
    }
    let mut files = parse_name_status_z(&String::from_utf8_lossy(&out.stdout));

    // `^3` yalnizca `-u` ile alinmis stash'lerde var.
    let third = format!("{id}^3");
    let has_third = git_at(&dir)
        .args(["rev-parse", "-q", "--verify", &third])
        .output()
        .map_err(|e| e.to_string())?
        .status
        .success();
    if has_third {
        let out = git_at(&dir)
            .args(["ls-tree", "-r", "-z", "--name-only", &third])
            .output()
            .map_err(|e| e.to_string())?;
        if !out.status.success() {
            return Err(failure_text(&out));
        }
        for p in String::from_utf8_lossy(&out.stdout).split('\0').filter(|s| !s.is_empty()) {
            files.push(StashFile {
                status: "??".into(),
                path: p.to_string(),
                untracked: true,
                orig_path: None,
            });
        }
    }

    let total = files.len() as u32;
    files.truncate(MAX_STASH_FILES);
    Ok(StashFiles { files, total })
}

/// Bir stash'teki tek dosyanin farki (birlesik bicim, renksiz); okunamazsa `None`.
///
/// Yeniden adlandirmada ESKI yol da pathspec'e giriyor: yalnizca yeni ad verilince
/// git eslemeyi goremiyor ve dosyayi "yeni eklendi" diye gosteriyor (olculdu).
/// Takipsiz dosya ucuncu ebeveynden geliyor: `git show --format=` kok commit'in
/// farkini bos agaca karsi veriyor, yani "her satir eklendi".
pub fn stash_diff(
    path: &str,
    id: &str,
    file: &str,
    orig: Option<&str>,
    untracked: bool,
) -> Option<String> {
    if !valid_id(id) {
        return None;
    }
    let dir = work_dir(path);
    let mut cmd = git_at(&dir);
    cmd.arg("--literal-pathspecs");
    if untracked {
        cmd.args(["show", "--no-color", "--no-ext-diff", "--format="])
            .arg(format!("{id}^3"))
            .args(["--", file]);
    } else {
        cmd.args(["diff", "--no-color", "--no-ext-diff", "-M"])
            .arg(format!("{id}^1"))
            .arg(id)
            .args(["--", file]);
        if let Some(orig) = orig {
            cmd.arg(orig);
        }
    }
    let out = cmd.output().ok()?;
    out.status
        .success()
        .then(|| String::from_utf8_lossy(&out.stdout).to_string())
}

/// `refs/stash`in gosterdigi commit; hic stash yoksa `None`.
fn stash_top(dir: &str) -> Option<String> {
    let out = git_at(dir)
        .args(["rev-parse", "-q", "--verify", "refs/stash"])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
    (!text.is_empty()).then_some(text)
}

/// Iletinin bas ve sonundaki bosluklari atar; bos kalirsa `-m` hic verilmiyor.
///
/// Bos ad "adsiz" demek: `-m "  "` git'e bos bir ad yazdirirdi ve liste satiri
/// "adli" sayilip bos gorunurdu. Ic bosluk ve satir sonlarina DOKUNULMUYOR: git
/// yansima konusunu kendisi tek satira indiriyor (satir sonu, sekme ve art arda
/// bosluk tek bosluk oluyor, olculdu), yani liste ayristiricisi icin ayrica bir
/// temizlik gerekmiyor.
fn clean_message(message: &str) -> String {
    message.trim().to_string()
}

/// Verilen yollari stash'e atar; basarida YENI stash'in kimligini doner.
///
/// ## Yollar
///
/// `--literal-pathspecs` (bkz. `stage`): yollar gercek dosya adlari. Yeniden
/// adlandirmada eski ve yeni yol BIRLIKTE verilmeli, yoksa eski adin "silindi"
/// kaydi indekste kalir (bkz. `GitChange::orig_path`).
///
/// `include_untracked`: secimde takipsiz dosya varsa `--include-untracked`. Onsuz
/// git "pathspec did not match any file(s) known to git" ile dusuyor (olculdu).
///
/// ## Hicbir sey stash'lenmediyse HATA
///
/// OLCULDU: yollarda degisiklik yokken git "No local changes to save" yazip
/// cikis kodu 0 veriyor. Cikis koduna guvenirsek arayuz "stash'e atildi" der ama
/// hicbir sey atilmamis olur. `refs/stash` oncesi ve sonrasi karsilastiriliyor.
///
/// Ilk commit'ten onceki depoda git kendisi reddediyor ("You do not have the
/// initial commit yet"); metni oldugu gibi donuyor.
pub fn stash_push(
    path: &str,
    message: &str,
    files: &[String],
    include_untracked: bool,
) -> Result<String, String> {
    if files.is_empty() {
        return Err("stash icin dosya secilmedi".into());
    }
    let _sira = INDEX_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let dir = work_dir(path);

    /*
     * SAHNELENMIS SILMELER (`D `, yeniden adlandirmanin eski adi) once indekse
     * geri konuyor.
     *
     * OLCULDU: git, pathspec'i INDEKSTE arıyor; sahnelenmis bir silmede yol
     * indekste yok ve `git stash push -- a.txt` "pathspec did not match any
     * file(s) known to git" ile dusuyor, secimdeki TUM dosyalarla birlikte.
     * Yalnizca yeni adi vermek de calismiyor: eski adin silinme kaydi indekste
     * kaliyor ve dosya "yari tasinmis" birakiliyor. Bu, panelde silinmis bir
     * dosyanin kutusunu isaretleyen (`git add` = sahnelenmis silme) ve sonra
     * hepsini stash'e atmak isteyen birinin yolu.
     *
     * `reset` yolu indekse HEAD'den geri koyuyor (` D`): artik indekste ve calisma
     * agacindaki silme stash'e girebiliyor.
     */
    let silinenler = staged_deletions(&dir, files);
    if !silinenler.is_empty() {
        let out = git_at(&dir)
            .arg("--literal-pathspecs")
            .args(["reset", "-q", "--"])
            .args(&silinenler)
            .output()
            .map_err(|e| e.to_string())?;
        if !out.status.success() {
            return Err(failure_text(&out));
        }
    }

    let sonuc = run_stash_push(&dir, message, files, include_untracked);

    // Basarisiz olduysa yukaridaki `reset`i geri al: kullanicinin sahnelenmis
    // silmesi (ve `R ` durumu) stash denemesinin yan etkisiyle kaybolmasin.
    if sonuc.is_err() && !silinenler.is_empty() {
        let _ = git_at(&dir)
            .arg("--literal-pathspecs")
            .args(["rm", "-q", "--cached", "--ignore-unmatch", "--"])
            .args(&silinenler)
            .output();
    }
    sonuc
}

fn run_stash_push(
    dir: &str,
    message: &str,
    files: &[String],
    include_untracked: bool,
) -> Result<String, String> {
    let before = stash_top(dir);

    let mut cmd = git_at(dir);
    cmd.arg("--literal-pathspecs").args(["stash", "push"]);
    if include_untracked {
        cmd.arg("--include-untracked");
    }
    let message = clean_message(message);
    if !message.is_empty() {
        cmd.args(["-m", &message]);
    }
    let out = cmd.arg("--").args(files).output().map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(failure_text(&out));
    }

    match stash_top(dir) {
        Some(after) if Some(&after) != before.as_ref() => Ok(after),
        _ => Err("stash'lenecek degisiklik yok".into()),
    }
}

/// Verilen yollardan SAHNELENMIS SILME olanlar: indekste yok, HEAD'de var.
///
/// Iki komut, yol sayisindan bagimsiz: `ls-files` indekste olanlari, `ls-tree`
/// indekste olmayanlardan HEAD'de bulunanlari veriyor (takipsiz dosya ikisinde de
/// yok, o yuzden ayrilir). Dizin yollari (`klasor/`) disarida: bir dizin
/// "indekste yok" olamaz, altindaki dosyalar vardir. HEAD yoksa (ilk commit'ten
/// onceki depo) `ls-tree` dusuyor ve bos donuyor; stash'i git'in kendisi reddedecek.
fn staged_deletions(dir: &str, files: &[String]) -> Vec<String> {
    let dosyalar: Vec<&String> = files.iter().filter(|f| !f.ends_with('/')).collect();
    if dosyalar.is_empty() {
        return Vec::new();
    }

    let Ok(out) = git_at(dir)
        .arg("--literal-pathspecs")
        .args(["ls-files", "-z", "--"])
        .args(&dosyalar)
        .output()
    else {
        return Vec::new();
    };
    let text = String::from_utf8_lossy(&out.stdout).to_string();
    let indekste: std::collections::HashSet<&str> =
        text.split('\0').filter(|s| !s.is_empty()).collect();
    let eksik: Vec<&String> = dosyalar
        .into_iter()
        .filter(|f| !indekste.contains(f.as_str()))
        .collect();
    if eksik.is_empty() {
        return Vec::new();
    }

    let Ok(out) = git_at(dir)
        .arg("--literal-pathspecs")
        .args(["ls-tree", "-r", "-z", "--name-only", "HEAD", "--"])
        .args(&eksik)
        .output()
    else {
        return Vec::new();
    };
    if !out.status.success() {
        return Vec::new();
    }
    String::from_utf8_lossy(&out.stdout)
        .split('\0')
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .collect()
}

/// Kimligi `stash@{n}` basvurusuna cevirir; stash artik yoksa hata.
fn stash_ref(dir: &str, id: &str) -> Result<String, String> {
    if !valid_id(id) {
        return Err("gecersiz stash kimligi".into());
    }
    let out = git_at(dir)
        .args(["stash", "list", "--format=%H"])
        .output()
        .map_err(|e| e.to_string())?;
    let text = String::from_utf8_lossy(&out.stdout);
    text.lines()
        .position(|l| l.trim() == id)
        .map(|n| format!("stash@{{{n}}}"))
        .ok_or_else(|| "stash bulunamadi; liste degismis olabilir".to_string())
}

/// Bir stash'i calisma agacina uygular; `pop` ise basarida siler.
///
/// `index`: `--index`, stash'e atilirken SAHNELENMIS olan degisiklikleri yine
/// sahnelenmis olarak geri yukler. Onsuz hepsi sahnelenmemis gelir (olculdu:
/// `MM` yerine ` M`); paneldeki kutular sahnelemeyi gosterdigi icin secenek
/// var. Varsayilan kapali: indeks o arada degistiyse git "Conflicts in index"
/// diye reddedebiliyor.
///
/// CAKISMADA git cikis kodu 1 veriyor, calisma agacinda cakisma isaretleri
/// (`UU`) birakiyor ve `pop` stash'i SILMIYOR (olculdu). Metin oldugu gibi
/// donuyor; arayuz listeyi tazeleyince cakisan dosyalar Degisiklikler'de
/// gorunuyor. Yerel degisiklikler ustune yazilacaksa git zaten reddediyor.
pub fn stash_apply(path: &str, id: &str, pop: bool, index: bool) -> Result<(), String> {
    let _sira = INDEX_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let dir = work_dir(path);
    let reference = stash_ref(&dir, id)?;

    let mut cmd = git_at(&dir);
    cmd.args(["stash", if pop { "pop" } else { "apply" }]);
    if index {
        cmd.arg("--index");
    }
    let out = cmd.arg(&reference).output().map_err(|e| e.to_string())?;
    if out.status.success() {
        Ok(())
    } else {
        Err(failure_text(&out))
    }
}

/// Bir stash'i siler. Geri alinamaz (karma yalnizca `git fsck` ile bulunur).
pub fn stash_drop(path: &str, id: &str) -> Result<(), String> {
    let _sira = INDEX_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let dir = work_dir(path);
    let reference = stash_ref(&dir, id)?;
    let out = git_at(&dir)
        .args(["stash", "drop"])
        .arg(&reference)
        .output()
        .map_err(|e| e.to_string())?;
    if out.status.success() {
        Ok(())
    } else {
        Err(failure_text(&out))
    }
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
