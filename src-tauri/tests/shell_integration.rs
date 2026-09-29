//! Kabuk entegrasyonunun ucdan uca dogrulanmasi.
//!
//! Komut gecmisinin tamami OSC 133/633 isaretlerine dayaniyor: komut metni,
//! cikis kodu, sure. Betikteki kucuk bir hata (yanlis kacis, $? okuma sirasi,
//! PSReadLine kancasinin kurulamamasi) gecmisi sessizce bos veya yanlis
//! birakir - arayuzden bakildiginda hata gibi gorunmez. Bu yuzden gercek bir
//! ConPTY icinde gercek bir kabuk baslatip isaretleri okuyoruz.

use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::mpsc;
use std::time::{Duration, Instant};

const SEP: &str = "\\";

/// `C:\...\x.sh` -> `/c/.../x.sh` (Git Bash / MSYS bicimi).
fn msys_path(path: &std::path::Path) -> String {
    let text = path.to_string_lossy().replace(SEP, "/");
    let bytes = text.as_bytes();
    if bytes.len() > 2 && bytes[1] == b':' && bytes[0].is_ascii_alphabetic() {
        format!("/{}{}", (bytes[0] as char).to_ascii_lowercase(), &text[2..])
    } else {
        text
    }
}

fn script_path(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("shell-integration")
        .join(name)
}

fn find_powershell() -> Option<PathBuf> {
    let sysroot = std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".into());
    let candidate =
        PathBuf::from(sysroot).join("System32\\WindowsPowerShell\\v1.0\\powershell.exe");
    candidate.is_file().then_some(candidate)
}

/// Uygulamanin actigi gibi entegre PowerShell: `-NoLogo -NoExit -Command
/// <yukleyici>`, betigin yolu ortam degiskeninde.
///
/// Yukleyici ve degisken adi uygulamanin KENDI sabitlerinden geliyor. Eskiden
/// burada `-File` elle yaziliyordu; uygulama baska yoldan yuklese de testler
/// gecmeye devam ederdi - `-File` yurutme ilkesine takildiginda da gectiler.
///
/// Miras silinecekler de `PtyManager::spawn`daki gibi siliniyor: testler
/// entegre bir N-Terminal sekmesinden kosturuldugunda nobetci (bkz.
/// `entegrasyon_miras_alinan_nobetciye_takilmiyor`) betigi ilk satirda
/// durdururdu. Nobetciyi olcen test onu bu cagridan SONRA yaziyor.
fn powershell_entegre(powershell: &std::path::Path, script: &std::path::Path) -> CommandBuilder {
    let mut cmd = CommandBuilder::new(powershell);
    cmd.arg("-NoLogo");
    cmd.arg("-NoExit");
    cmd.arg("-Command");
    cmd.arg(nterminal_lib::pty::POWERSHELL_BOOTSTRAP);
    cmd.env(nterminal_lib::pty::POWERSHELL_SCRIPT_ENV, script);
    for key in nterminal_lib::pty::CLEAR_INHERITED_ENV {
        cmd.env_remove(key);
    }
    cmd
}

fn find_git_bash() -> Option<PathBuf> {
    let pf = std::env::var("ProgramFiles").unwrap_or_else(|_| format!("C:{SEP}Program Files"));
    let pf86 =
        std::env::var("ProgramFiles(x86)").unwrap_or_else(|_| format!("C:{SEP}Program Files (x86)"));
    for base in [pf, pf86] {
        let candidate = PathBuf::from(base).join("Git").join("bin").join("bash.exe");
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

/// SGR (renk) dizilerini atar.
///
/// Bu yardimcinin gerekli olmasi testin kanitladigi seyin ta kendisi: Node
/// renk destegi gordugu icin `console.log` ciktisini kendiliginden renkliyor
/// (boolean'i sariya boyuyor), dolayisiyla ayristirmadan once temizlemek
/// gerekiyor.
fn strip_ansi(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch != '\u{1b}' {
            out.push(ch);
            continue;
        }
        // ESC [ ... <son harf>  (CSI dizisi)
        if chars.peek() == Some(&'[') {
            chars.next();
            for c in chars.by_ref() {
                if c.is_ascii_alphabetic() || c == '~' {
                    break;
                }
            }
        }
    }
    out
}

fn find_node() -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    std::env::split_paths(&path)
        .map(|dir| dir.join("node.exe"))
        .find(|candidate| candidate.is_file())
}

fn find_cmd() -> Option<PathBuf> {
    let sysroot = std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".into());
    let candidate = PathBuf::from(sysroot).join("System32\\cmd.exe");
    candidate.is_file().then_some(candidate)
}

struct PtyHarness {
    // master, oturum boyunca yasamali: dustugunde ConPTY kapanir.
    _master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    rx: mpsc::Receiver<Vec<u8>>,
    child: Box<dyn portable_pty::Child + Send + Sync>,
    buffer: String,
    dsr_answered: bool,
}

impl PtyHarness {
    fn spawn(cmd: CommandBuilder) -> Self {
        let pty = native_pty_system();
        let pair = pty
            .openpty(PtySize { rows: 30, cols: 120, pixel_width: 0, pixel_height: 0 })
            .expect("ConPTY acilamadi");
        let child = pair.slave.spawn_command(cmd).expect("kabuk baslatilamadi");
        drop(pair.slave);

        let mut reader = pair.master.try_clone_reader().expect("okuyucu");
        let writer = pair.master.take_writer().expect("yazici");
        let (tx, rx) = mpsc::channel();
        std::thread::spawn(move || {
            let mut buf = vec![0u8; 8192];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        if tx.send(buf[..n].to_vec()).is_err() {
                            break;
                        }
                    }
                }
            }
        });

        Self {
            _master: pair.master,
            writer,
            rx,
            child,
            buffer: String::new(),
            dsr_answered: false,
        }
    }

    /// ConPTY acilista `ESC[6n` (imlec konumu raporu) sorar ve yanit bekler.
    /// Gercek uygulamada bu yaniti xterm.js kendiliginden veriyor; burada
    /// terminal yerine biz oldugumuz icin elle cevapliyoruz. Cevaplanmazsa
    /// kabuk cikti uretmeye baslamiyor.
    fn answer_dsr_if_needed(&mut self) {
        if self.dsr_answered {
            return;
        }
        if self.buffer.contains("\u{1b}[6n") {
            self.dsr_answered = true;
            let _ = self.writer.write_all(b"\x1b[1;1R");
            let _ = self.writer.flush();
        }
    }

    /// Beklenen metin gorunene kadar okur. Bulursa true doner.
    fn wait_for(&mut self, needle: &str, timeout: Duration) -> bool {
        let deadline = Instant::now() + timeout;
        self.answer_dsr_if_needed();
        if self.buffer.contains(needle) {
            return true;
        }
        loop {
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                return false;
            }
            match self.rx.recv_timeout(remaining.min(Duration::from_millis(500))) {
                Ok(chunk) => {
                    self.buffer.push_str(&String::from_utf8_lossy(&chunk));
                    self.answer_dsr_if_needed();
                    if self.buffer.contains(needle) {
                        return true;
                    }
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {
                    self.answer_dsr_if_needed();
                    if self.child.try_wait().ok().flatten().is_some() {
                        // Kabuk oldu; beklemeye devam etmenin anlami yok.
                        return self.buffer.contains(needle);
                    }
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    return self.buffer.contains(needle);
                }
            }
        }
    }

    /// Kabugun girdiyi gercekten okudugunu dogrular.
    ///
    /// Kabuk ilk istemini basar basmaz stdin'i okumaya hazir olmuyor; hemen
    /// komut yazmak (ozellikle cmd.exe'de) girdinin yutulmasina yol aciyordu.
    /// Bos bir Enter gonderip istemin yeniden cizilmesini (yeni `133;B`)
    /// bekliyoruz - sabit bir bekleme suresinden hem daha hizli hem daha saglam.
    fn sync_prompt(&mut self, timeout: Duration) -> bool {
        assert!(
            self.wait_for("]133;B", timeout),
            "ilk istem gelmedi. Son cikti:\n{}",
            self.tail()
        );
        for _ in 0..3 {
            self.buffer.clear();
            self.send_line("");
            if self.wait_for("]133;B", Duration::from_secs(5)) {
                self.buffer.clear();
                return true;
            }
        }
        false
    }

    fn send_line(&mut self, line: &str) {
        self.writer.write_all(line.as_bytes()).expect("yazma");
        self.writer.write_all(b"\r").expect("yazma");
        self.writer.flush().expect("flush");
    }

    fn tail(&self) -> String {
        let start = self.buffer.len().saturating_sub(1500);
        self.buffer[start..].escape_debug().to_string()
    }
}

impl Drop for PtyHarness {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

/// Once kosum duzeninin kendisini dogruluyoruz: bu gecmezse asagidaki
/// basarisizliklar betikle ilgili degil, testle ilgilidir.
#[test]
fn kosum_duzeni_conpty_ciktisini_okuyabiliyor() {
    let Some(cmd_exe) = find_cmd() else {
        eprintln!("cmd.exe yok, test atlandi");
        return;
    };
    let mut cmd = CommandBuilder::new(&cmd_exe);
    cmd.arg("/c");
    cmd.arg("echo nterminal-kosum-tamam");

    let mut pty = PtyHarness::spawn(cmd);
    assert!(
        pty.wait_for("nterminal-kosum-tamam", Duration::from_secs(20)),
        "ConPTY ciktisi okunamadi. Alinan:\n{}",
        pty.tail()
    );
}

#[test]
fn powershell_entegrasyonu_istem_komut_ve_cikis_kodu_bildirir() {
    let Some(powershell) = find_powershell() else {
        eprintln!("powershell.exe yok, test atlandi");
        return;
    };
    let script = script_path("nterminal.ps1");
    assert!(
        script.is_file(),
        "entegrasyon betigi bulunamadi: {}",
        script.display()
    );

    let mut cmd = powershell_entegre(&powershell, &script);
    cmd.env("TERM", "xterm-256color");
    cmd.env("NTERMINAL", "1");

    let mut pty = PtyHarness::spawn(cmd);

    // 1) Istem isaretleri: A (istem basliyor) ve B (komut girisi basliyor).
    assert!(
        pty.wait_for("]133;A", Duration::from_secs(40)),
        "OSC 133;A gelmedi. Son cikti:\n{}",
        pty.tail()
    );
    assert!(
        pty.wait_for("]133;B", Duration::from_secs(20)),
        "OSC 133;B gelmedi. Son cikti:\n{}",
        pty.tail()
    );

    // 2) Dizin bildirimi: sekme basligi ve yeni sekmenin klasoru buna dayaniyor.
    assert!(
        pty.wait_for("]633;P;Cwd=", Duration::from_secs(15)),
        "dizin bildirimi (OSC 633;P;Cwd) gelmedi. Son cikti:\n{}",
        pty.tail()
    );

    // 3) Basarili komut: metin bildirilmeli, cikis kodu 0 olmali.
    assert!(
        pty.sync_prompt(Duration::from_secs(30)),
        "kabuk girdiyi okumaya baslamadi. Son cikti:\n{}",
        pty.tail()
    );
    pty.send_line("Write-Output nterminal-test-ok");
    assert!(
        pty.wait_for("]633;E;", Duration::from_secs(25)),
        "komut metni (OSC 633;E) gelmedi. Son cikti:\n{}",
        pty.tail()
    );
    assert!(
        pty.buffer.contains("Write-Output nterminal-test-ok"),
        "bildirilen komut metni beklenenle uyusmuyor. Son cikti:\n{}",
        pty.tail()
    );
    assert!(
        pty.wait_for("]133;D;0", Duration::from_secs(25)),
        "basarili komut icin cikis kodu 0 bildirilmedi. Son cikti:\n{}",
        pty.tail()
    );

    // 4) Hatali komut: yerel uygulamanin gercek cikis kodu tasinmali.
    //    ($LASTEXITCODE degisimini yakalayan mantigin sinavi bu.)
    pty.buffer.clear();
    pty.send_line("cmd /c exit 3");
    assert!(
        pty.wait_for("]133;D;3", Duration::from_secs(25)),
        "yerel uygulamanin cikis kodu (3) bildirilmedi. Son cikti:\n{}",
        pty.tail()
    );

    // 5) Ardindan gelen basarili komut yine 0 bildirmeli: onceki hatanin
    //    $LASTEXITCODE'da takili kalmasi tipik bir tuzak.
    pty.buffer.clear();
    pty.send_line("Write-Output tekrar-ok");
    assert!(
        pty.wait_for("]133;D;0", Duration::from_secs(25)),
        "hatali komuttan sonraki basarili komut 0 bildirmeli. Son cikti:\n{}",
        pty.tail()
    );
}

#[test]
fn powershell_entegrasyonu_noktali_virgulu_kacirir() {
    let Some(powershell) = find_powershell() else {
        eprintln!("powershell.exe yok, test atlandi");
        return;
    };
    let script = script_path("nterminal.ps1");

    let mut pty = PtyHarness::spawn(powershell_entegre(&powershell, &script));
    assert!(
        pty.wait_for("]133;B", Duration::from_secs(40)),
        "istem gelmedi. Son cikti:\n{}",
        pty.tail()
    );

    // ';' OSC yukunde ayirici; kacirilmazsa komut metni arayuzde kirpilir.
    pty.buffer.clear();
    pty.send_line("Write-Output bir; Write-Output iki");
    assert!(
        pty.wait_for("]633;E;", Duration::from_secs(25)),
        "komut metni gelmedi. Son cikti:\n{}",
        pty.tail()
    );
    assert!(
        pty.buffer.contains("\\x3B") || pty.buffer.contains("\\x3b"),
        "noktali virgul kacirilmamis. Son cikti:\n{}",
        pty.tail()
    );
}

#[test]
fn cmd_entegrasyonu_istem_ve_dizin_bildirir() {
    let Some(cmd_exe) = find_cmd() else {
        eprintln!("cmd.exe yok, test atlandi");
        return;
    };
    let script = script_path("nterminal.cmd");
    assert!(script.is_file(), "cmd betigi yok: {}", script.display());

    let mut cmd = CommandBuilder::new(&cmd_exe);
    cmd.arg("/K");
    cmd.arg(&script);

    let mut pty = PtyHarness::spawn(cmd);

    // cmd.exe cikis kodu bildiremiyor (PROMPT degiskeni %ERRORLEVEL%'i her
    // istemde yeniden cozmuyor); istem ve dizin isaretleri gelmeli ki arayuz
    // komut metnini ekran tamponundan okuyabilsin.
    assert!(
        pty.wait_for("]133;A", Duration::from_secs(30)),
        "cmd icin OSC 133;A gelmedi. Son cikti:\n{}",
        pty.tail()
    );
    assert!(
        pty.wait_for("]133;B", Duration::from_secs(15)),
        "cmd icin OSC 133;B gelmedi. Son cikti:\n{}",
        pty.tail()
    );
    assert!(
        pty.wait_for("]633;P;Cwd=", Duration::from_secs(15)),
        "cmd icin dizin bildirimi gelmedi. Son cikti:\n{}",
        pty.tail()
    );

    // Komut sonrasi yeni istemde D isareti gelmeli: sure olcumu buna dayaniyor.
    assert!(
        pty.sync_prompt(Duration::from_secs(20)),
        "cmd girdiyi okumaya baslamadi. Son cikti:\n{}",
        pty.tail()
    );
    pty.send_line("echo nterminal-cmd-test");
    assert!(
        pty.wait_for("]133;D", Duration::from_secs(20)),
        "cmd icin komut bitis isareti gelmedi. Son cikti:\n{}",
        pty.tail()
    );
}

/// Bash entegrasyonu: komut metni, cikis kodu ve "sahte kayit yok" garantisi.
///
/// Bu testin varlik nedeni gercek bir hata: DEBUG tuzagi PROMPT_COMMAND'in
/// parcalarinda ve baslangic betiginin kendi satirlarinda da tetikleniyor.
/// Ilk surumde her bash sekmesi kullanicinin gecmisine betigin bir satirini
/// kaydediyordu. Ilk bildirilen komutun kullanicinin komutu oldugunu burada
/// dogruluyoruz.
#[test]
fn bash_entegrasyonu_sahte_kayit_uretmez() {
    let Some(bash) = find_git_bash() else {
        eprintln!("Git Bash yok, test atlandi");
        return;
    };
    let script = script_path("nterminal.sh");
    assert!(script.is_file(), "bash betigi yok: {}", script.display());

    let mut cmd = CommandBuilder::new(&bash);
    cmd.arg("--init-file");
    cmd.arg(msys_path(&script));
    cmd.arg("-i");
    cmd.env("TERM", "xterm-256color");
    // Kullanicinin gercek gecmis dosyasina dokunmayalim.
    cmd.env("HISTFILE", "");

    let mut pty = PtyHarness::spawn(cmd);

    assert!(
        pty.wait_for("]133;A", Duration::from_secs(40)),
        "OSC 133;A gelmedi. Son cikti:
{}",
        pty.tail()
    );
    assert!(
        pty.wait_for("]633;P;Cwd=", Duration::from_secs(15)),
        "dizin bildirimi gelmedi. Son cikti:
{}",
        pty.tail()
    );

    // Istem cizilene kadar HIC komut bildirilmemis olmali.
    assert!(
        !pty.buffer.contains("]633;E;"),
        "istem cizilmeden komut bildirildi (sahte kayit). Son cikti:
{}",
        pty.tail()
    );

    assert!(
        pty.sync_prompt(Duration::from_secs(30)),
        "kabuk girdiyi okumaya baslamadi. Son cikti:
{}",
        pty.tail()
    );

    // Basarili komut
    pty.send_line("echo nterminal-bash-ok");
    assert!(
        pty.wait_for("]633;E;", Duration::from_secs(25)),
        "komut metni gelmedi. Son cikti:
{}",
        pty.tail()
    );
    assert!(
        pty.buffer.contains("echo nterminal-bash-ok"),
        "bildirilen ilk komut kullanicinin komutu degil. Son cikti:
{}",
        pty.tail()
    );
    assert!(
        pty.wait_for("]133;D;0", Duration::from_secs(25)),
        "basarili komut icin 0 bildirilmedi. Son cikti:
{}",
        pty.tail()
    );

    // Hatali komut: bash cikis kodunu dogru tasimali.
    pty.buffer.clear();
    pty.send_line("false");
    assert!(
        pty.wait_for("]133;D;1", Duration::from_secs(25)),
        "hatali komut icin 1 bildirilmedi. Son cikti:
{}",
        pty.tail()
    );

    // Boru hatti tek kayit acmali: her basit komut icin ayri kayit olmamali.
    pty.buffer.clear();
    pty.send_line("echo bir | grep bir");
    assert!(
        pty.wait_for("]133;D;0", Duration::from_secs(25)),
        "boru hatti tamamlanmadi. Son cikti:
{}",
        pty.tail()
    );
    let reports = pty.buffer.matches("]633;E;").count();
    assert_eq!(
        reports, 1,
        "boru hatti {reports} kayit acti, 1 olmali. Son cikti:
{}",
        pty.tail()
    );
}

/// Bos satirda Enter, onceki komutu ikinci kez kaydetmemeli.
///
/// Bu da gercek bir hataydi: PSReadLine kancasi kuruluyken Get-History yedegi
/// de acik kaliyordu. Bos satirda Enter'a basildiginda kanca komut bildirmiyor
/// (metin bos), yedek ise "yeni bir gecmis kaydi var" diye onceki komutu
/// tekrar bildiriyordu.
#[test]
fn powershell_bos_enter_tekrar_kayit_uretmez() {
    let Some(powershell) = find_powershell() else {
        eprintln!("powershell.exe yok, test atlandi");
        return;
    };
    let script = script_path("nterminal.ps1");

    let mut pty = PtyHarness::spawn(powershell_entegre(&powershell, &script));
    assert!(
        pty.sync_prompt(Duration::from_secs(40)),
        "kabuk girdiyi okumaya baslamadi. Son cikti:
{}",
        pty.tail()
    );

    // Once gercek bir komut calistir.
    pty.send_line("Write-Output nterminal-bir");
    assert!(
        pty.wait_for("]133;D;0", Duration::from_secs(25)),
        "komut tamamlanmadi. Son cikti:
{}",
        pty.tail()
    );

    // Simdi bos satirda Enter: yeni bir komut bildirimi OLMAMALI.
    pty.buffer.clear();
    pty.send_line("");
    // Istem yeniden cizilene kadar bekle.
    assert!(
        pty.wait_for("]133;B", Duration::from_secs(20)),
        "bos Enter sonrasi istem gelmedi. Son cikti:
{}",
        pty.tail()
    );
    let reports = pty.buffer.matches("]633;E;").count();
    assert_eq!(
        reports, 0,
        "bos Enter {reports} komut bildirdi, 0 olmali. Son cikti:
{}",
        pty.tail()
    );
}

/// Renk cocuk surece "renk uretebilirsin" diye bildirilmek zorunda.
///
/// `ng serve`, `dotnet run`, `vite` gibi araclar rengi KENDILERI uretiyor;
/// bizim isimiz ANSI dizilerini gecirmek degil yalnizca - once o araclarin
/// renk uretmeye karar vermesi gerekiyor. Node tabanli araclar (Angular CLI,
/// Vite, chalk, supports-color) karari `process.stdout.getColorDepth()` ile
/// veriyor; o da (1) stdout'un gercek bir TTY olmasina, (2) COLORTERM'e,
/// (3) TERM'e bakiyor.
///
/// Uc kosuldan biri bozulursa cikti tek renk geliyor ve bu arayuzden hata
/// gibi gorunmuyor - kullanici "renklendirme yapmiyoruz" diye bildiriyor,
/// sebebi gorunmuyor. O yuzden gercek ConPTY icinde gercek Node'a soruyoruz.
#[test]
fn renk_destegi_cocuk_surece_ulasiyor() {
    let Some(powershell) = find_powershell() else {
        eprintln!("powershell.exe yok, test atlandi");
        return;
    };
    if find_node().is_none() {
        eprintln!("node.exe PATH'te yok, test atlandi");
        return;
    }

    let mut cmd = powershell_entegre(&powershell, &script_path("nterminal.ps1"));
    // Uygulamanin gercekte gonderdigi degerler; ayni sabitten geliyor ki
    // pty.rs'te degistirilirse test de onunla birlikte degissin.
    for (key, value) in nterminal_lib::pty::TERMINAL_ENV {
        cmd.env(key, value);
    }
    cmd.env("NTERMINAL", "1");
    // NO_COLOR / NODE_DISABLE_COLORS her seyi kilitliyor: Node bu degiskenleri
    // gorunce TERM ve COLORTERM'e HIC bakmadan renk derinligini 1 dondururuyor.
    // Testi calistiran ortamda ayarli olabiliyorlar - olcum ilk denemede tam
    // bu yuzden 1 cikti ve test uygulama hakkinda yanlis bilgi verdi.
    // Bilincli olarak temizliyoruz: burada olculen sey UYGULAMANIN cocuga ne
    // bildirdigi, testi calistiran kabugun tercihi degil.
    //
    // Uygulamanin kendisi bunlari temizlemiyor: kullanici NO_COLOR ayarladiysa
    // bunu kastediyor demektir.
    cmd.env_remove("NO_COLOR");
    cmd.env_remove("NODE_DISABLE_COLORS");
    cmd.env_remove("FORCE_COLOR");

    let mut pty = PtyHarness::spawn(cmd);
    assert!(
        pty.sync_prompt(Duration::from_secs(40)),
        "istem hazir olmadi. Son cikti:\n{}",
        pty.tail()
    );

    // Isaret bilincli olarak parcali yaziliyor ("NT" + "COLOR"): kabuk yazilan
    // komutu ekrana yansitiyor, tek parca olsa yansimayi cikti sanardik.
    pty.send_line(
        "node -e \"const s=process.stdout; \
console.log('NT'+'COLOR', !!s.isTTY, s.getColorDepth ? s.getColorDepth() : 0, \
process.env.TERM, process.env.COLORTERM)\"",
    );

    assert!(
        pty.wait_for("NTCOLOR ", Duration::from_secs(40)),
        "node cikti vermedi. Son cikti:\n{}",
        pty.tail()
    );

    let clean = strip_ansi(&pty.buffer);
    let at = clean.rfind("NTCOLOR ").expect("isaret");
    let rest = &clean[at + "NTCOLOR ".len()..];
    let line = rest.lines().next().unwrap_or("").trim();
    let fields: Vec<&str> = line.split_whitespace().collect();
    assert!(
        fields.len() >= 4,
        "beklenmeyen cikti bicimi: {line:?}\nSon cikti:\n{}",
        pty.tail()
    );

    let is_tty = fields[0];
    let depth: u32 = fields[1].parse().unwrap_or(0);
    let term = fields[2];
    let colorterm = fields[3];

    assert_eq!(
        is_tty, "true",
        "cocuk surec stdout'u TTY gormuyor - hicbir arac renk uretmez. Cikti: {line:?}"
    );
    // 1 = renk yok, 4 = 16 renk, 8 = 256 renk, 24 = truecolor.
    assert!(
        depth >= 8,
        "renk derinligi {depth} - arac 256 renk bile kullanamaz. Cikti: {line:?}"
    );
    assert_eq!(term, "xterm-256color", "TERM cocuga ulasmamis: {line:?}");
    assert_eq!(colorterm, "truecolor", "COLORTERM cocuga ulasmamis: {line:?}");
}

/// Komut onerisi istendiginde entegrasyon KIRILMAMALI.
///
/// PSReadLine tahmini yalnizca 2.2+ surumunde var; Windows PowerShell 5.1 ile
/// gelen 2.0 `Set-PSReadLineOption -PredictionSource` parametresini tanimiyor.
/// Betik bunu yakalamazsa yuklenirken hata verir ve entegrasyonun TAMAMI
/// (komut gecmisi, cikis kodu, dizin bildirimi) sessizce olur - kullanici
/// yalnizca "gecmis bos" diye gorur, sebebini gormez.
///
/// Bu yuzden testi tahmini DESTEKLEMEYEN kabukla calistiriyoruz: burada
/// onemli olan onerinin gorunmesi degil, istegin zarar vermemesi.
#[test]
fn oneri_istegi_eski_psreadline_ile_entegrasyonu_bozmuyor() {
    let Some(powershell) = find_powershell() else {
        eprintln!("powershell.exe yok, test atlandi");
        return;
    };

    let mut cmd = powershell_entegre(&powershell, &script_path("nterminal.ps1"));
    cmd.env("TERM", "xterm-256color");
    cmd.env("NTERMINAL", "1");
    // Arayuzun varsayilani: liste gorunumu.
    cmd.env("NTERMINAL_PREDICTION", "list");

    let mut pty = PtyHarness::spawn(cmd);

    // Istem isaretleri: entegrasyon ayakta mi?
    assert!(
        pty.wait_for("]133;A", Duration::from_secs(40)),
        "oneri istendiginde OSC 133;A gelmedi - betik yuklenirken hata vermis olabilir. Son cikti:\n{}",
        pty.tail()
    );
    assert!(
        pty.wait_for("]133;B", Duration::from_secs(20)),
        "oneri istendiginde OSC 133;B gelmedi. Son cikti:\n{}",
        pty.tail()
    );

    // Durum arayuze bildirilmis olmali. Hangi deger geldigi makineye bagli
    // (PSReadLine 2.2+ varsa 'list'/'inline', yoksa 'unsupported'); onemli olan
    // bildirimin YAPILMASI - destek yokken arayuz ne yapilacagini soyluyor.
    //
    // Bu kontrol sync_prompt'tan ONCE: bildirim betik yuklenirken bir kez
    // gidiyor, sync_prompt ise tamponu temizliyor. Ilk denemede kontrol
    // sonraya kalmisti ve bildirim "gelmedi" gorunuyordu.
    assert!(
        pty.wait_for("]633;P;Prediction=", Duration::from_secs(20)),
        "oneri durumu bildirilmedi. Son cikti:\n{}",
        pty.tail()
    );

    let early = strip_ansi(&pty.buffer);
    let at = early.find("]633;P;Prediction=").unwrap() + "]633;P;Prediction=".len();
    let state: String = early[at..]
        .chars()
        .take_while(|c| c.is_ascii_alphabetic())
        .collect();
    assert!(
        ["list", "inline", "unsupported"].contains(&state.as_str()),
        "beklenmeyen oneri durumu: {state:?}"
    );
    eprintln!("oneri durumu: {state}");

    // Betikten hata sizmamis olmali; yukleme ciktisina bakiyoruz.
    for needle in [
        "PredictionSource",
        "ParameterBindingException",
        "CommandNotFoundException",
    ] {
        assert!(
            !early.contains(needle),
            "betik hata sizdirmis ({needle}). Son cikti:\n{}",
            pty.tail()
        );
    }

    // Komut kaydi da calismaya devam etmeli.
    assert!(pty.sync_prompt(Duration::from_secs(30)), "istem hazir olmadi");
    pty.send_line("Write-Output ONERI_TESTI");
    assert!(
        pty.wait_for("]633;E;Write-Output ONERI_TESTI", Duration::from_secs(20)),
        "komut metni bildirilmedi. Son cikti:\n{}",
        pty.tail()
    );
    assert!(
        pty.wait_for("]133;D;0", Duration::from_secs(20)),
        "cikis kodu bildirilmedi. Son cikti:\n{}",
        pty.tail()
    );
}

/// Miras alinan "zaten yuklendim" nobetcisi entegrasyonu oldurmemeli.
///
/// BILDIRILEN HATA: dipteki komut kutusu hic acilmadi, istem ekranin USTUNDE
/// durdu ve `PS C:\...>` metni gorundu (blok basligi kipinde o satir bos
/// olmaliydi).
///
/// ZINCIR: `nterminal.ps1` kendini bir ortam degiskeniyle koruyor
/// (`if ($env:NTERMINAL_INTEGRATION_LOADED -eq '1') { return }`) ve `$env:`
/// GERCEK bir surec degiskeni yaziyor - o kabugun butun cocuklari miras
/// aliyor. Uygulama entegre bir N-Terminal sekmesinden baslatildiginda
/// (gelistirirken tipik: bir sekmede `npm start`) degisken uygulamanin
/// ortamina, oradan da actigi HER sekmeye geciyor. Betik ilk satirda geri
/// donuyor: istem sarmalayici yok, OSC 133 yok, `atPrompt` hic gelmiyor ve
/// kutu `resolveInputMode` geregi sonsuza kadar kapali kaliyor.
///
/// Test iki yonu birden olcuyor, cunku yalnizca biri kanit degil:
///   1. Nobetci mirasken entegrasyon GERCEKTEN olmuyor (hatanin mekanizmasi).
///   2. Silindiginde calisiyor (`PtyManager::spawn`in yaptigi is).
///
/// "Isaret gelmedi"yi zaman asimiyla DEGIL, pozitif bir bitis kosuluyla
/// olcuyoruz: kabuk bir komutu yankilayana kadar bekleyip tamponda OSC olup
/// olmadigina bakiyoruz. Yavas makinede zaman asimi yanlis gecerdi.
#[test]
fn entegrasyon_miras_alinan_nobetciye_takilmiyor() {
    let Some(powershell) = find_powershell() else {
        eprintln!("powershell.exe yok, test atlandi");
        return;
    };
    let script = script_path("nterminal.ps1");
    assert!(script.is_file(), "entegrasyon betigi yok");

    // Uygulamanin sildigi liste ile buradaki olcum ayni kaynaktan.
    assert!(
        nterminal_lib::pty::CLEAR_INHERITED_ENV.contains(&"NTERMINAL_INTEGRATION_LOADED"),
        "nobetci silinenler listesinden dusmus: entegrasyon ic ice kabukta olur"
    );

    let baslat = |nobetci: Option<&str>| {
        let mut cmd = powershell_entegre(&powershell, &script);
        cmd.env("TERM", "xterm-256color");
        cmd.env("NTERMINAL", "1");
        match nobetci {
            Some(value) => cmd.env("NTERMINAL_INTEGRATION_LOADED", value),
            // `CommandBuilder` cocuga ayri bir ortam kuruyor; burada degiskeni
            // hic yazmamak "silinmis" durumun ta kendisi.
            None => {}
        }
        PtyHarness::spawn(cmd)
    };

    // 1) Nobetci mirasken: kabuk yasiyor ama entegrasyon kurulmuyor.
    let mut pty = baslat(Some("1"));
    pty.send_line("Write-Output NOBETCI_MIRAS");
    assert!(
        pty.wait_for("NOBETCI_MIRAS", Duration::from_secs(40)),
        "kabuk komutu yankilamadi, test kosum duzeniyle ilgili. Son cikti:\n{}",
        pty.tail()
    );
    assert!(
        !pty.buffer.contains("]133;"),
        "nobetci mirasken OSC 133 geldi: betigin korumasi degismis, bu testin \
         olctugu mekanizma artik gecerli degil. Son cikti:\n{}",
        pty.tail()
    );
    drop(pty);

    // 2) Nobetci yokken: entegrasyon kuruluyor. `PtyManager::spawn` her sekme
    //    icin tam olarak bu durumu hazirliyor.
    let mut temiz = baslat(None);
    assert!(
        temiz.wait_for("]133;B", Duration::from_secs(40)),
        "nobetci silinmisken bile entegrasyon kurulmadi. Son cikti:\n{}",
        temiz.tail()
    );
}

/// Testin kendi gecici klasoru; ayni adli eski bir kosunun kalintisi silinir.
fn gecici_klasor(ad: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("nterminal-{ad}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("gecici klasor acilamadi");
    dir
}

/// Gecici klasoru siler; kilit kalkana kadar birkac kez dener.
///
/// Kabuk olduruldukten hemen sonra yukledigi DLL'ler bir sure daha kilitli
/// kalabiliyor (ya da virus tarayicisi dosyayi tutuyor). Tek denemede silme
/// basarisiz oluyor ve her kosu %TEMP%'te bir PSReadLine kopyasi birakiyordu.
fn gecici_klasoru_sil(dir: &std::path::Path) {
    for _ in 0..20 {
        if std::fs::remove_dir_all(dir).is_ok() || !dir.exists() {
            return;
        }
        std::thread::sleep(Duration::from_millis(250));
    }
    eprintln!("gecici klasor silinemedi: {}", dir.display());
}

/// Klasoru alt klasorleriyle birlikte kopyalar.
fn kopyala(kaynak: &std::path::Path, hedef: &std::path::Path) {
    std::fs::create_dir_all(hedef).expect("hedef klasor acilamadi");
    for entry in std::fs::read_dir(kaynak).expect("kaynak okunamadi") {
        let entry = entry.expect("klasor girdisi");
        let to = hedef.join(entry.file_name());
        if entry.file_type().expect("dosya turu").is_dir() {
            kopyala(&entry.path(), &to);
        } else {
            std::fs::copy(entry.path(), &to).expect("dosya kopyalanamadi");
        }
    }
}

/// Betigin bildirdigi oneri durumu (`633;P;Prediction=<durum>`).
fn oneri_durumu(buffer: &str) -> Option<String> {
    let clean = strip_ansi(buffer);
    let at = clean.find("]633;P;Prediction=")? + "]633;P;Prediction=".len();
    Some(clean[at..].chars().take_while(|c| c.is_ascii_alphabetic()).collect())
}

/// Entegrasyon YURUTME ILKESINE takilmamali.
///
/// BILDIRILEN HATA: baska bir bilgisayara kurulan uygulamada dipte "Kabuk
/// baslatiliyor..." seridi hic kalkmadi, komut kutusu hic acilmadi.
///
/// KOK NEDEN: betik `-File` ile yukleniyordu ve `-File` yurutme ilkesine
/// tabi. Stok bir Windows istemcisinde ilke `Restricted`: kabuk "betik
/// calistirmak devre disi" deyip entegrasyonsuz isteme dusuyor, istem isareti
/// hic gelmiyor. Gelistirme makinesinde gorunmedi: orada grup ilkesi
/// `Unrestricted` koyuyor.
///
/// Test icin ilkeyi degistirmek sistem ayarini degistirmek olurdu. Onun
/// yerine neredeyse HER ilkede engellenen bir dosya kuruyoruz: internetten
/// indirilmis gibi isaretli (`Zone.Identifier`, ZoneId=3) bir kopya.
/// `RemoteSigned` ve `AllSigned` onu imzasiz diye, `Restricted` her betik gibi
/// reddediyor; `Unrestricted` calistirmadan once soruyor ve bos bir Enter
/// varsayilan cevabi (calistirma) seciyor. Yalnizca `Bypass` engellemiyor.
///
/// Iki yon birden, cunku yalnizca biri kanit degil:
///   1. `-File` bu dosyayi YUKLEMIYOR: hatanin mekanizmasi. Etkin ilke kabuga
///      soruluyor; Bypass'sa bu yon olculemez ve test bunu yazip geciyor.
///   2. Uygulamanin yukleyicisi AYNI dosyayi yukluyor: duzeltme.
#[test]
fn powershell_entegrasyonu_yurutme_ilkesine_takilmiyor() {
    let Some(powershell) = find_powershell() else {
        eprintln!("powershell.exe yok, test atlandi");
        return;
    };
    let dir = gecici_klasor("ilke");
    let script = dir.join("nterminal.ps1");
    std::fs::copy(script_path("nterminal.ps1"), &script).expect("betik kopyalanamadi");
    // NTFS alternatif veri akisi: tarayicinin ve Explorer'in indirilen
    // dosyaya koydugu "Web'den geldi" isareti.
    std::fs::write(
        format!("{}:Zone.Identifier", script.display()),
        "[ZoneTransfer]\r\nZoneId=3\r\n",
    )
    .expect("Zone.Identifier yazilamadi (gecici klasor NTFS degil mi?)");

    // Testi baslatan kabugun `-ExecutionPolicy Bypass`i (scripts/run.mjs)
    // cocuga `PSExecutionPolicyPreference` olarak geciyor ve olculen ilkeyi
    // Bypass'a cekiyordu. Kullanicinin gordugu ilke bu degisken OLMADAN olan.
    let ilke_mirasini_sil =
        |cmd: &mut CommandBuilder| cmd.env_remove("PSExecutionPolicyPreference");

    // 1) Eski yol: -File.
    let mut cmd = CommandBuilder::new(&powershell);
    cmd.arg("-NoLogo");
    cmd.arg("-NoExit");
    cmd.arg("-File");
    cmd.arg(&script);
    for key in nterminal_lib::pty::CLEAR_INHERITED_ENV {
        cmd.env_remove(key);
    }
    ilke_mirasini_sil(&mut cmd);
    let mut eski = PtyHarness::spawn(cmd);
    // Unrestricted soruyorsa bos satir varsayilani (calistirma) seciyor; soru
    // yoksa istemde bos bir Enter zararsiz. Isaret parcali yaziliyor ki
    // yansiyan girdi cikti sanilmasin.
    eski.send_line("");
    eski.send_line("Write-Output ('ILKE=' + (Get-ExecutionPolicy) + '=BIT' + 'TI')");
    assert!(
        eski.wait_for("=BITTI", Duration::from_secs(40)),
        "kabuk komutu calistirmadi, test kosum duzeniyle ilgili. Son cikti:\n{}",
        eski.tail()
    );
    let clean = strip_ansi(&eski.buffer);
    let ilke: String = clean
        .match_indices("ILKE=")
        .map(|(at, _)| &clean[at + "ILKE=".len()..])
        .find_map(|rest| {
            let name: String = rest.chars().take_while(|c| c.is_ascii_alphabetic()).collect();
            rest[name.len()..].starts_with("=BITTI").then_some(name)
        })
        .expect("etkin ilke okunamadi");
    if ilke == "Bypass" {
        eprintln!("etkin ilke Bypass: isaretli dosya -File ile de yuklenir, mekanizma olculemedi");
    } else {
        assert!(
            !eski.buffer.contains("]133;"),
            "ilke {ilke} iken -File isaretli dosyayi yukledi: bu testin olctugu mekanizma \
             artik gecerli degil. Son cikti:\n{}",
            eski.tail()
        );
        eprintln!("etkin ilke {ilke}: -File isaretli dosyayi yuklemedi (beklenen)");
    }
    drop(eski);

    // 2) Uygulamanin yolu: ayni dosya, ayni ilke.
    let mut cmd = powershell_entegre(&powershell, &script);
    ilke_mirasini_sil(&mut cmd);
    let mut yeni = PtyHarness::spawn(cmd);
    assert!(
        yeni.wait_for("]133;B", Duration::from_secs(40)),
        "yukleyici isaretli dosyayi yukleyemedi (ilke {ilke}). Son cikti:\n{}",
        yeni.tail()
    );
    assert!(
        !yeni.buffer.contains("Integration=failed"),
        "yukleyici hata bildirdi. Son cikti:\n{}",
        yeni.tail()
    );
    drop(yeni);
    gecici_klasoru_sil(&dir);
}

/// Yukleyici betigi yukleyemezse arayuze SOYLUYOR.
///
/// Soylemeseydi arayuz sekmeyi hala entegre sayar ve "Kabuk baslatiliyor..."
/// seridi yine sonsuza kadar kalirdi - yukaridaki hatanin ta kendisi. Kabuk
/// ayakta kalmali: kullanici duz terminalde calismaya devam edebilmeli.
#[test]
fn powershell_yukleyici_hatayi_bildiriyor() {
    let Some(powershell) = find_powershell() else {
        eprintln!("powershell.exe yok, test atlandi");
        return;
    };
    let yok = std::env::temp_dir().join("nterminal-olmayan-klasor").join("nterminal.ps1");
    let mut pty = PtyHarness::spawn(powershell_entegre(&powershell, &yok));
    assert!(
        pty.wait_for("]633;P;Integration=failed", Duration::from_secs(40)),
        "yukleyici hatayi bildirmedi. Son cikti:\n{}",
        pty.tail()
    );
    pty.send_line("Write-Output ('KABUK' + '_AYAKTA')");
    assert!(
        pty.wait_for("KABUK_AYAKTA", Duration::from_secs(20)),
        "hatadan sonra kabuk komut calistirmiyor. Son cikti:\n{}",
        pty.tail()
    );
}

/// Baslatma komutu kullanicinin gecmisinde kalmamali.
///
/// `-Command` metni oturum gecmisine yaziliyor (`-File` yazilmiyordu): kalsa
/// kullanicinin `Get-History`sinde 1 numarada yukleyici durur ve PSReadLine
/// yokken betigin gecmis yedegi onu kullanicinin ilk komutu sanip bildirirdi.
/// Betik ilk istemde siliyor.
#[test]
fn powershell_baslatma_komutu_gecmiste_kalmiyor() {
    let Some(powershell) = find_powershell() else {
        eprintln!("powershell.exe yok, test atlandi");
        return;
    };
    let mut pty =
        PtyHarness::spawn(powershell_entegre(&powershell, &script_path("nterminal.ps1")));
    assert!(
        pty.sync_prompt(Duration::from_secs(40)),
        "istem hazir olmadi. Son cikti:\n{}",
        pty.tail()
    );
    // Calisan komut gecmise ancak bitince giriyor; bos Enter'lar hic girmiyor.
    pty.send_line("Write-Output ('GECMIS=' + @(Get-History).Count + '=S' + 'ON')");
    assert!(
        pty.wait_for("=SON", Duration::from_secs(20)),
        "komut cikti vermedi. Son cikti:\n{}",
        pty.tail()
    );
    assert!(
        strip_ansi(&pty.buffer).contains("GECMIS=0=SON"),
        "baslatma komutu oturum gecmisinde kalmis. Son cikti:\n{}",
        pty.tail()
    );
}

/// PSReadLine modulu acilista yuklenemezse betik onu DLL'den yukluyor.
///
/// `Restricted` ilkede uygulamanin PSReadLine'i de yuklenemiyor: modulun kok
/// dosyasi `PSReadLine.psm1` bir betik ve ilke onu engelliyor. PSReadLine
/// olmadan `PSConsoleHostReadLine` kancasi yok; komut baslangici (133;C) Enter
/// aninda degil, komut BITTIKTEN sonra gecmis yedeginden geliyor ve arayuz o
/// arada kutuyu calisan komutun ustunde acik tutuyor.
///
/// Ilkeyi degistirmek yerine modulun bir kopyasini kurup `.psm1`ini ilk
/// satirda hata atan bir dosyayla degistiriyoruz: kabugun acilistaki yuklemesi
/// ayni yerde, kok modulde dusuyor.
///
/// Iki yon: yedek degiskeni yokken kanca gercekten kurulamiyor (mekanizma:
/// 133;C ciktidan SONRA geliyor), varken betik PSReadLine'i yukluyor, oneri
/// aciliyor ve 133;C ciktidan ONCE geliyor (duzeltme).
#[test]
fn psreadline_yuklenemezse_betik_dllden_yukluyor() {
    let Some(powershell) = find_powershell() else {
        eprintln!("powershell.exe yok, test atlandi");
        return;
    };
    let kaynak = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("shell-integration")
        .join("modules")
        .join("PSReadLine");
    let dir = gecici_klasor("psrl");
    let psrl = dir.join("modules").join("PSReadLine");
    kopyala(&kaynak, &psrl);
    std::fs::write(psrl.join("PSReadLine.psm1"), "throw 'NTERMINAL_TEST: psm1 engellendi'\r\n")
        .expect("psm1 yazilamadi");

    let baslat = |yedek: bool| {
        let mut cmd = powershell_entegre(&powershell, &script_path("nterminal.ps1"));
        cmd.env("NTERMINAL_PREDICTION", "list");
        // pty.rs'teki gibi: uygulamanin modul klasoru arama yolunun BASINDA.
        let mevcut = std::env::var("PSModulePath").unwrap_or_default();
        cmd.env("PSModulePath", format!("{};{mevcut}", dir.join("modules").display()));
        if yedek {
            cmd.env(
                nterminal_lib::pty::PSREADLINE_DLL_ENV,
                psrl.join("Microsoft.PowerShell.PSReadLine2.dll"),
            );
        }
        PtyHarness::spawn(cmd)
    };

    // Komut ciktisi ile 133;C'nin sirasi: kanca varsa C Enter aninda, ciktidan
    // once geliyor; yoksa gecmis yedegi onu bir sonraki istemde gonderiyor.
    // Isaret parcali yaziliyor ki yansiyan girdi cikti sanilmasin.
    let c_ciktidan_once = |pty: &mut PtyHarness| {
        assert!(pty.sync_prompt(Duration::from_secs(30)), "istem hazir olmadi");
        pty.send_line("Start-Sleep -Milliseconds 300; Write-Output ('KANCA' + '_OK')");
        assert!(
            pty.wait_for("KANCA_OK", Duration::from_secs(20))
                && pty.wait_for("]133;D", Duration::from_secs(20)),
            "komut tamamlanmadi. Son cikti:\n{}",
            pty.tail()
        );
        let c = pty.buffer.find("]133;C").expect("133;C hic gelmedi");
        c < pty.buffer.find("KANCA_OK").unwrap()
    };

    // 1) Yedek yok: PSReadLine yuklenemiyor ve kanca kurulamiyor.
    let mut pty = baslat(false);
    assert!(
        pty.wait_for("]133;B", Duration::from_secs(40)),
        "entegrasyon kurulmadi. Son cikti:\n{}",
        pty.tail()
    );
    assert_eq!(
        oneri_durumu(&pty.buffer).as_deref(),
        Some("unsupported"),
        "bozuk modulle PSReadLine yine de yuklenmis: bu testin olctugu durum olusmuyor. \
         Son cikti:\n{}",
        pty.tail()
    );
    // Gecmis yedegi devredeyken baslatma komutu ilk "komut" olarak gitmemeli.
    assert!(
        !pty.buffer.contains(nterminal_lib::pty::POWERSHELL_SCRIPT_ENV),
        "baslatma komutu kullanici komutu olarak bildirildi. Son cikti:\n{}",
        pty.tail()
    );
    assert!(
        !c_ciktidan_once(&mut pty),
        "PSReadLine yokken kanca calismis: mekanizma degismis. Son cikti:\n{}",
        pty.tail()
    );
    drop(pty);

    // 2) Yedek var: betik DLL'i yukluyor.
    let mut pty = baslat(true);
    assert!(
        pty.wait_for("]633;P;Prediction=", Duration::from_secs(40)),
        "oneri durumu bildirilmedi. Son cikti:\n{}",
        pty.tail()
    );
    assert_eq!(
        oneri_durumu(&pty.buffer).as_deref(),
        Some("list"),
        "yedek PSReadLine'i yukleyemedi. Son cikti:\n{}",
        pty.tail()
    );
    assert!(
        c_ciktidan_once(&mut pty),
        "yedekle yuklenen PSReadLine'da kanca Enter aninda bildirmiyor. Son cikti:\n{}",
        pty.tail()
    );
    drop(pty);
    gecici_klasoru_sil(&dir);
}
