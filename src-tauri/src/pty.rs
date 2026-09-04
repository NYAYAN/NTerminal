//! ConPTY oturumlarinin yonetimi (portable-pty uzerinden).
//!
//! Her sekme icin bir oturum: bir okuyucu is parcasi PTY cikisini okur, bir
//! yayinci is parcasi da bu ciktiyi kisa araliklarla toplayip tek olayda
//! arayuze gonderir. Toplama onemli: `dir /s C:\` gibi bir komut saniyede
//! binlerce kucuk parca uretir, her birini ayri IPC olayi yapmak arayuzu
//! kilitler.

use crate::model::{Settings, ShellKind};
use crate::store::{profile_executable, resolve_profile};
use anyhow::{anyhow, Context, Result};
use base64::Engine;
use parking_lot::Mutex;
use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap};
use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, RecvTimeoutError};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

/// Cikti toplama penceresi. 6 ms goze gorunmez ama olay sayisini ~50 kat azaltir.
/// Cocuk surece bildirilen terminal yetenekleri.
///
/// Renk kararini bunlar veriyor. Node tabanli araclar (Angular CLI, Vite,
/// chalk, supports-color) `process.stdout.getColorDepth()` uzerinden karar
/// veriyor; o da once stdout'un gercek bir TTY olmasina, sonra COLORTERM ve
/// TERM'e bakiyor. ConPTY TTY'yi sagliyor, bu iki degisken de renk
/// DERINLIGINI belirliyor: COLORTERM=truecolor olmadan pek cok arac 16 renge
/// duser, TERM hic yoksa rengi tumden kapatir.
///
/// Sabit olarak duruyor ki entegrasyon testi ayni degerlerle olcum yapabilsin.
pub const TERMINAL_ENV: [(&str, &str); 2] = [
    ("TERM", "xterm-256color"),
    ("COLORTERM", "truecolor"),
];

/// Actigimiz kabuktan SILINEN miras degiskenleri.
///
/// `env_clear` cagirmiyoruz - kullanicinin PATH'i ve arac ortami korunmali -
/// ama bazi degiskenler miras alindiginda aktif zarar veriyor. Sabit olarak
/// duruyor ki test ayni listeyle olcum yapabilsin.
///
/// `NTERMINAL_INTEGRATION_LOADED`: entegrasyon betiklerinin "zaten yuklendim"
/// nobetcisi. Gerekcenin tamami `spawn` icinde, silindigi yerde.
pub const CLEAR_INHERITED_ENV: [&str; 1] = ["NTERMINAL_INTEGRATION_LOADED"];

const COALESCE_WINDOW: Duration = Duration::from_millis(6);
/// Tek olayda gonderilecek azami bayt.
const MAX_CHUNK: usize = 128 * 1024;
const READ_BUF: usize = 32 * 1024;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpawnSpec {
    /// Oturum kimligi; sekme kimligiyle ayni tutuluyor.
    pub id: String,
    pub profile_id: String,
    #[serde(default)]
    pub cwd: Option<String>,
    /// Gruba ozel ortam degiskenleri (profilin ustune biner).
    #[serde(default)]
    pub env: BTreeMap<String, String>,
    #[serde(default = "default_cols")]
    pub cols: u16,
    #[serde(default = "default_rows")]
    pub rows: u16,
}

fn default_cols() -> u16 {
    120
}
fn default_rows() -> u16 {
    30
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpawnResult {
    pub id: String,
    pub pid: Option<u32>,
    pub shell: String,
    pub args: Vec<String>,
    pub cwd: Option<String>,
    /// Kabuk entegrasyonu bu oturum icin devrede mi? Devrede degilse arayuz
    /// komut gecmisini tus yakalama yedegiyle toplar.
    pub integration: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DataEvent {
    id: String,
    /// base64: PTY cikisi ham bayt akisi, gecerli UTF-8 olmak zorunda degil.
    data: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExitEvent {
    id: String,
    code: Option<u32>,
}

struct Session {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    killer: Box<dyn ChildKiller + Send + Sync>,
    pid: Option<u32>,
    alive: Arc<AtomicBool>,
}

#[derive(Default)]
pub struct PtyManager {
    sessions: Mutex<HashMap<String, Session>>,
}

impl PtyManager {
    pub fn spawn(
        &self,
        app: &AppHandle,
        spec: SpawnSpec,
        settings: &Settings,
        integration_dir: &std::path::Path,
    ) -> Result<SpawnResult> {
        // Ayni kimlikle acik bir oturum varsa once onu kapat: arayuz yeniden
        // baglanmak istiyorsa sahipsiz bir surec birakmayalim.
        self.kill(&spec.id);

        let profile = resolve_profile(settings, &spec.profile_id)
            .ok_or_else(|| anyhow!("tanimli profil yok"))?
            .clone();

        let exe = profile_executable(&profile);
        let mut args: Vec<String> = profile.args.clone();
        // Entegrasyonun yazdigi ortam degiskenleri. Profil/grup env'inden SONRA
        // uygulaniyor: kullanici ZDOTDIR yazdiysa bile kopru calismali, yoksa
        // entegrasyon sessizce olur.
        let mut int_env: Vec<(String, String)> = Vec::new();
        // Kullanicinin GERCEK ZDOTDIR'i. En ozel kaynak once: grup env'i,
        // sonra profil env'i, sonra uygulamanin kendi ortami.
        let user_zdotdir = spec
            .env
            .get("ZDOTDIR")
            .or_else(|| profile.env.get("ZDOTDIR"))
            .cloned()
            .or_else(|| std::env::var("ZDOTDIR").ok());
        let integration = profile.shell_integration
            && profile.kind.supports_integration()
            && apply_integration(
                profile.kind,
                &mut args,
                &mut int_env,
                integration_dir,
                user_zdotdir.as_deref(),
                // Arayuzden geliyor (Behavior.shell_prediction). `int_env`den
                // OKUNAMAZ: o vektor bu cagriyla doluyor, cagri aninda bos.
                spec.env.get("NTERMINAL_PREDICTION").map(String::as_str),
            );

        let cwd = spec
            .cwd
            .clone()
            .filter(|c| !c.trim().is_empty() && std::path::Path::new(c).is_dir())
            .or_else(|| profile.cwd.clone().filter(|c| std::path::Path::new(c).is_dir()))
            .or_else(|| dirs::home_dir().map(|p| p.to_string_lossy().to_string()));

        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows: spec.rows.max(2),
                cols: spec.cols.max(10),
                pixel_width: 0,
                pixel_height: 0,
            })
            .context("ConPTY acilamadi")?;

        let mut cmd = CommandBuilder::new(&exe);
        cmd.args(&args);
        if let Some(dir) = &cwd {
            cmd.cwd(dir);
        }
        // Profil env -> grup env sirasi: grup daha ozel oldugu icin sonra yazilir.
        for (k, v) in &profile.env {
            cmd.env(k, v);
        }
        for (k, v) in &spec.env {
            cmd.env(k, v);
        }
        // Entegrasyon env'i kullanici env'inin USTUNE: ZDOTDIR'in bizim
        // kopruyu gostermesi zorunlu, aksi halde kancalar hic yuklenmez.
        // Kullanicinin kendi degeri kaybolmuyor - NTERMINAL_ZDOTDIR olarak
        // kopruye geciyor ve kopru onun dosyalarini oradan yukluyor.
        for (k, v) in &int_env {
            cmd.env(k, v);
        }
        for (k, v) in TERMINAL_ENV {
            cmd.env(k, v);
        }
        cmd.env("TERM_PROGRAM", "NTerminal");
        cmd.env("TERM_PROGRAM_VERSION", env!("CARGO_PKG_VERSION"));
        // NTERMINAL_PREDICTION arayuzden spec.env icinde geliyor (yukarida
        // yaziliyor): ayar Behavior.shell_prediction, kabuk betigi onu okuyup
        // PSReadLine tahminini aciyor.
        cmd.env("NTERMINAL", "1");
        cmd.env("NTERMINAL_SESSION", &spec.id);
        if integration {
            cmd.env("NTERMINAL_INTEGRATION", "1");
        }

        /*
         * Kabuk entegrasyonunun "zaten yuklendim" nobetcisi cocuk icin
         * SILINIYOR.
         *
         * OLCULEN HATA: dipteki komut kutusu hic acilmiyor, istem ekranin
         * USTUNDE duruyor ve `PS C:\...>` metni gorunuyor (blok basligi
         * kipinde o satir bos olmaliydi). Yani entegrasyon hic yuklenmemis.
         *
         * ZINCIR: `nterminal.ps1` bastan sona bir kez kosmak icin kendini
         * bir ortam degiskeniyle koruyor:
         *
         *     if ($env:NTERMINAL_INTEGRATION_LOADED -eq '1') { return }
         *
         * `$env:` GERCEK bir surec degiskeni yaziyor, yani o kabugun butun
         * cocuklari onu miras aliyor. Uygulama entegre bir N-Terminal
         * sekmesinden baslatildiginda (gelistirirken tipik: bir sekmede
         * `npm start`) `nterminal.exe`in kendi ortaminda bu degisken '1'
         * oluyor. Burada `env_clear` cagirmiyoruz - kullanicinin PATH'i ve
         * arac ortami korunmali - dolayisiyla degisken actigimiz HER
         * sekmeye de geciyor ve betik ilk satirda geri donuyor: istem
         * sarmalayici yok, OSC 133 yok, `atPrompt` hic gelmiyor, kutu da
         * `resolveInputMode` geregi sonsuza kadar kapali kaliyor.
         *
         * Nobetcinin isi TEK BIR kabuk icinde cifte yuklemeyi onlemek (profil
         * iki kez cagrilirsa). Actigimiz her sekme ise YENI ve en ustteki
         * kabuk; onun icin nobetci bos olmali. Silmek ic ice kabuklari
         * bozmuyor: kullanici sekmede elle `powershell` yazarsa o surec
         * degiskeni yine sekmenin kabugundan miras aliyor ve koruma
         * calismaya devam ediyor - orasi bizim spawn'imiz degil.
         *
         * Ucu birden siliniyor cunku ayni nobetci uc betikte de var
         * (`nterminal.ps1`, `nterminal.sh`, `nterminal.zsh`).
         */
        for key in CLEAR_INHERITED_ENV {
            cmd.env_remove(key);
        }

        let mut child = pair
            .slave
            .spawn_command(cmd)
            .with_context(|| format!("kabuk baslatilamadi: {exe}"))?;
        // slave ucunu birakmak sart: yoksa surec bitse bile okuyucu EOF gormez.
        drop(pair.slave);

        let pid = child.process_id();
        let killer = child.clone_killer();
        let reader = pair
            .master
            .try_clone_reader()
            .context("PTY okuyucu alinamadi")?;
        let writer = pair.master.take_writer().context("PTY yazici alinamadi")?;

        let alive = Arc::new(AtomicBool::new(true));

        // Okuyucu -> yayinci kanali. Okuma bloklayici oldugu icin toplama
        // isini ayri bir is parcasinda recv_timeout ile yapiyoruz.
        let (tx, rx) = mpsc::channel::<Vec<u8>>();
        let id_reader = spec.id.clone();
        std::thread::Builder::new()
            .name(format!("nterm-read-{}", id_reader))
            .spawn(move || {
                let mut reader = reader;
                let mut buf = vec![0u8; READ_BUF];
                loop {
                    match reader.read(&mut buf) {
                        Ok(0) => break,
                        Ok(n) => {
                            if tx.send(buf[..n].to_vec()).is_err() {
                                break;
                            }
                        }
                        Err(_) => break,
                    }
                }
            })
            .context("okuyucu is parcasi baslatilamadi")?;

        let app_emit = app.clone();
        let id_emit = spec.id.clone();
        let alive_emit = alive.clone();
        std::thread::Builder::new()
            .name(format!("nterm-emit-{}", id_emit))
            .spawn(move || {
                let data_event = format!("pty:data:{id_emit}");
                let mut pending: Vec<u8> = Vec::with_capacity(MAX_CHUNK);
                loop {
                    // Ilk parca icin sinirsiz bekle.
                    match rx.recv() {
                        Ok(chunk) => pending.extend_from_slice(&chunk),
                        Err(_) => break, // okuyucu kapandi
                    }
                    // Kisa bir pencere boyunca gelenleri ayni olaya topla.
                    let deadline = Instant::now() + COALESCE_WINDOW;
                    while pending.len() < MAX_CHUNK {
                        let remaining = deadline.saturating_duration_since(Instant::now());
                        if remaining.is_zero() {
                            break;
                        }
                        match rx.recv_timeout(remaining) {
                            Ok(chunk) => pending.extend_from_slice(&chunk),
                            Err(RecvTimeoutError::Timeout) => break,
                            Err(RecvTimeoutError::Disconnected) => break,
                        }
                    }
                    let payload = DataEvent {
                        id: id_emit.clone(),
                        data: base64::engine::general_purpose::STANDARD.encode(&pending),
                    };
                    pending.clear();
                    if app_emit.emit(&data_event, payload).is_err() {
                        break;
                    }
                }

                // Kanal kapandi: surec bitti. Cikis kodunu bekleyip bildir.
                let code = child.wait().ok().map(|status| status.exit_code());
                alive_emit.store(false, Ordering::SeqCst);
                let _ = app_emit.emit(
                    &format!("pty:exit:{id_emit}"),
                    ExitEvent { id: id_emit.clone(), code },
                );
            })
            .context("yayinci is parcasi baslatilamadi")?;

        self.sessions.lock().insert(
            spec.id.clone(),
            Session {
                master: pair.master,
                writer,
                killer,
                pid,
                alive,
            },
        );

        Ok(SpawnResult {
            id: spec.id,
            pid,
            shell: exe,
            args,
            cwd,
            integration,
        })
    }

    pub fn write(&self, id: &str, data: &[u8]) -> Result<()> {
        let mut sessions = self.sessions.lock();
        let session = sessions
            .get_mut(id)
            .ok_or_else(|| anyhow!("oturum bulunamadi: {id}"))?;
        session.writer.write_all(data)?;
        session.writer.flush()?;
        Ok(())
    }

    pub fn resize(&self, id: &str, cols: u16, rows: u16) -> Result<()> {
        let sessions = self.sessions.lock();
        let session = sessions
            .get(id)
            .ok_or_else(|| anyhow!("oturum bulunamadi: {id}"))?;
        session.master.resize(PtySize {
            rows: rows.max(2),
            cols: cols.max(10),
            pixel_width: 0,
            pixel_height: 0,
        })?;
        Ok(())
    }

    pub fn kill(&self, id: &str) -> bool {
        let Some(mut session) = self.sessions.lock().remove(id) else {
            return false;
        };
        session.alive.store(false, Ordering::SeqCst);
        let _ = session.killer.kill();
        // master'in dusmesi okuyucuya EOF verir, is parcalari kendiliginden biter.
        true
    }

    pub fn kill_all(&self) {
        let ids: Vec<String> = self.sessions.lock().keys().cloned().collect();
        for id in ids {
            self.kill(&id);
        }
    }

    pub fn alive(&self, id: &str) -> bool {
        self.sessions
            .lock()
            .get(id)
            .map(|s| s.alive.load(Ordering::SeqCst))
            .unwrap_or(false)
    }

    pub fn pid(&self, id: &str) -> Option<u32> {
        self.sessions.lock().get(id).and_then(|s| s.pid)
    }

    pub fn list(&self) -> Vec<String> {
        self.sessions.lock().keys().cloned().collect()
    }
}

/// Kabuk entegrasyon betigini baslatma argumanlarina ekler.
/// Basarili olursa true doner.
///
/// `env` de yaziliyor cunku zsh argumanla yuklenemiyor: `--init-file`
/// karsiligi yok, tek yol ZDOTDIR ortam degiskeni (bkz. Zsh dali).
///
/// `user_zdotdir`: kullanicinin GERCEK ZDOTDIR'i. Kopru dosyalari bununla onun
/// kendi baslangic dosyalarini buluyor; None ise $HOME'a dusuyorlar.
fn apply_integration(
    kind: ShellKind,
    args: &mut Vec<String>,
    env: &mut Vec<(String, String)>,
    dir: &std::path::Path,
    user_zdotdir: Option<&str>,
    // Yalnizca Windows dalinda okunuyor (PSReadLine yolu); POSIX'te
    // kullanilmiyor ve uyari uretmesin diye isaretli.
    #[cfg_attr(not(windows), allow(unused_variables))] prediction: Option<&str>,
) -> bool {
    match kind {
        ShellKind::PowerShell | ShellKind::Pwsh => {
            let script = dir.join("nterminal.ps1");
            if !script.is_file() {
                return false;
            }
            // -NoLogo: "Windows PowerShell / Copyright (C) Microsoft ..."
            // afisini susturur. Her sekmenin basinda dort satirlik degismez bir
            // metin duruyordu; kullaniciya soyledigi bir sey yok ve ilk komut
            // blogunu ekranin ortasina itiyordu.
            //
            // Profil argumanina DEGIL buraya konuyor: profiller bir kez tespit
            // edilip kaydediliyor, yani orada degistirmek yalnizca yeni
            // kurulumlari etkilerdi. Kullanici kendi yazdiysa tekrarlamiyoruz.
            if !args.iter().any(|a| a.eq_ignore_ascii_case("-nologo")) {
                args.push("-NoLogo".into());
            }
            // -NoExit: betik kostuktan sonra etkilesimli kal.
            // -File: yol argumani olarak gectigi icin alintilama derdi yok.
            args.push("-NoExit".into());
            args.push("-File".into());
            args.push(script.to_string_lossy().to_string());

            // Yalnizca Windows PowerShell 5.1: uygulamayla gelen PSReadLine'i
            // gorunur kil.
            //
            // 5.1 PSReadLine 2.0 ile geliyor ve hicbir zaman guncellenmiyor;
            // satir ici oneri icin 2.2+ gerekiyor. `PSModulePath`in BASINA
            // kendi klasorumuzu koyuyoruz, kabuk arama sirasinda once bizimkini
            // buluyor. Bu, oturum icinde modul degistirmekten daha guvenli:
            // eski surum hic yuklenmiyor, dolayisiyla ayni assembly'nin iki
            // surumunun carpismasi da soz konusu degil.
            //
            // pwsh'e DOKUNMUYORUZ: PowerShell 7.2+ zaten 2.2+ ile geliyor ve
            // bizimkini one almak ileride onun daha yeni surumunu golgeleyip
            // sessizce eskiye dusururdu.
            //
            // Kullanici oneriyi kapattiysa (`NTERMINAL_PREDICTION=off`) yolu
            // hic degistirmiyoruz - kendi kurulumu ve ayari gecerli kalsin.
            #[cfg(windows)]
            if kind == ShellKind::PowerShell {
                // Ayar YOKSA da yukluyoruz: arayuz varsayilani "list", yani
                // oneri aciktir. Yalnizca acikca "off" denmisse dokunmuyoruz.
                let wants_prediction = prediction != Some("off");
                let modules = dir.join("modules");
                if wants_prediction && modules.join("PSReadLine").join("PSReadLine.psd1").is_file() {
                    // Kullanicinin kendi yolu KAYBOLMAMALI: bastan ekliyoruz,
                    // ustune yazmiyoruz. Yoksa profilindeki modullerin hicbiri
                    // bulunamaz.
                    let existing = std::env::var("PSModulePath").unwrap_or_default();
                    let value = if existing.is_empty() {
                        modules.to_string_lossy().to_string()
                    } else {
                        format!("{};{}", modules.to_string_lossy(), existing)
                    };
                    env.push(("PSModulePath".into(), value));
                }
            }
            true
        }
        ShellKind::Cmd => {
            let script = dir.join("nterminal.cmd");
            if !script.is_file() {
                return false;
            }
            // /K: toplu isi kos, sonra etkilesimli kal.
            args.push("/K".into());
            args.push(script.to_string_lossy().to_string());
            true
        }
        ShellKind::Bash => {
            let script = dir.join("nterminal.sh");
            if !script.is_file() {
                return false;
            }
            // --login CIKARILMAK ZORUNDA: bash `--init-file`i yalnizca login
            // OLMAYAN etkilesimli kabukta okuyor (man bash, --rcfile). Login
            // kabugunda birakirsak betik hic yuklenmez ve entegrasyon sessizce
            // olur.
            //
            // Bedeli: login kabugunun okudugu dosyalar (mac'te /etc/profile ve
            // ~/.bash_profile) atlanir. Betik onlari KENDISI yukluyor - bkz.
            // nterminal.sh, bolum 1.
            args.retain(|a| a != "--login" && a != "-l");
            args.push("--init-file".into());
            // Git Bash yolu MSYS bicimine cevirmek zorunda (`/c/...`); mac ve
            // Linux'ta yol zaten POSIX bicimde.
            #[cfg(windows)]
            args.push(unix_style_path(&script));
            #[cfg(not(windows))]
            args.push(script.to_string_lossy().to_string());
            if !args.iter().any(|a| a == "-i") {
                args.push("-i".into());
            }
            true
        }
        ShellKind::Zsh => {
            let zdotdir = dir.join("zdotdir");
            // Kopru dosyalarindan .zshrc olmazsa kancalar hic yuklenmez.
            if !zdotdir.join(".zshrc").is_file() {
                return false;
            }
            // zsh'in `--init-file` karsiligi YOK. Baslangic dosyalarini
            // degistirmenin tek yolu ZDOTDIR: kendi klasorumuzu gosteriyoruz,
            // oradaki dort kopru dosyasi da kullanicinin gercek dosyalarini
            // yukluyor (bkz. shell-integration/zdotdir/.zshenv).
            env.push(("ZDOTDIR".into(), zdotdir.to_string_lossy().to_string()));
            // Kullanicinin kendi ZDOTDIR'i varsa kopruye bildiriyoruz; yoksa
            // kopru $HOME'a dusuyor. Kendi klasorumuzu geri vermemek SART:
            // uygulama bir NTerminal sekmesinden baslatildiginda ZDOTDIR bizde
            // olur, kopru kendi kendini yuklemeye calisir ve kullanicinin hicbir
            // dosyasi okunmaz.
            if let Some(user) = user_zdotdir.filter(|u| !u.trim().is_empty()) {
                if std::path::Path::new(user) != zdotdir {
                    env.push(("NTERMINAL_ZDOTDIR".into(), user.to_string()));
                }
            }
            true
        }
        // Fish bash/zsh soz dizimini paylasmiyor; kendi betigi yazilmadan
        // entegrasyon "acik ama hicbir sey bildirmiyor" olurdu.
        // `supports_integration()` bunu zaten disarida tutuyor, burada da
        // acikca yaziyoruz ki dal eklendiginde gozden kacmasin.
        ShellKind::Fish => false,
        // WSL yalnizca Windows'ta var. Ice alinan (import) bir yapilandirmadan
        // mac'e gelmis bir WSL profili entegrasyon almiyor - profilin kendisi
        // de zaten calismaz, `unavailable` isaretiyle gosteriliyor.
        #[cfg(not(windows))]
        ShellKind::Wsl => false,
        #[cfg(windows)]
        ShellKind::Wsl => {
            let script = dir.join("nterminal.sh");
            if !script.is_file() {
                return false;
            }
            let Some(wsl_path) = wsl_mount_path(&script) else {
                return false;
            };
            // `wsl.exe ... -- bash --init-file /mnt/c/... -i`
            if !args.iter().any(|a| a == "--") {
                args.push("--".into());
            }
            args.push("bash".into());
            args.push("--init-file".into());
            args.push(wsl_path);
            args.push("-i".into());
            true
        }
        ShellKind::Custom => false,
    }
}

/// `C:\Users\x\y.sh` -> `/c/Users/x/y.sh` (MSYS / Git Bash bicimi).
///
/// Yalnizca Windows: mac ve Linux'ta yol zaten POSIX bicimde, cevrim yapmak
/// bozardi.
#[cfg(windows)]
fn unix_style_path(path: &std::path::Path) -> String {
    let text = path.to_string_lossy().replace('\\', "/");
    match text.as_bytes() {
        [drive, b':', b'/', ..] if drive.is_ascii_alphabetic() => {
            format!("/{}{}", (*drive as char).to_ascii_lowercase(), &text[2..])
        }
        _ => text,
    }
}

/// `C:\Users\x\y.sh` -> `/mnt/c/Users/x/y.sh` (WSL bicimi).
///
/// Yalnizca Windows: WSL baska platformda yok.
#[cfg(windows)]
fn wsl_mount_path(path: &std::path::Path) -> Option<String> {
    let text = path.to_string_lossy().replace('\\', "/");
    let bytes = text.as_bytes();
    match bytes {
        [drive, b':', b'/', ..] if drive.is_ascii_alphabetic() => Some(format!(
            "/mnt/{}{}",
            (*drive as char).to_ascii_lowercase(),
            &text[2..]
        )),
        _ => None,
    }
}

#[cfg(test)]
#[path = "pty_tests.rs"]
mod tests;
