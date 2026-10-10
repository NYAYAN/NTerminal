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
use parking_lot::Mutex;
use tauri::ipc::{Channel, InvokeResponseBody};
use portable_pty::{native_pty_system, Child, ChildKiller, CommandBuilder, MasterPty, PtySize};
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

/// PowerShell'e entegrasyon betigini yukleten komut (`-Command` degeri).
///
/// BILDIRILEN HATA: baska bir bilgisayara kurulan uygulamada dipte
/// "Kabuk baslatiliyor..." seridi hic kalkmiyor, komut kutusu hic acilmiyordu.
///
/// KOK NEDEN: betik `-File` ile yukleniyordu ve `-File` YURUTME ILKESINE
/// tabi. Stok bir Windows istemcisinde ilke `Restricted`: hicbir .ps1
/// calismiyor, PowerShell "bu sistemde betik calistirmak devre disi" deyip
/// entegrasyonsuz bir isteme dusuyor. Istem isareti (OSC 133) hic gelmiyor ve
/// serit sonsuza kadar bekliyor. Gelistirme makinesinde gorunmuyordu cunku
/// orada grup ilkesi `MachinePolicy = Unrestricted` koyuyor.
///
/// Ilke yalnizca DOSYAYI denetliyor (PowerShell kaynaginda yalnizca
/// `ExternalScript` turu `CheckPolicy`den geciyor). Ayni metni okuyup betik
/// blogu olarak calistirmak, komutlari isteme yazmakla ayni sey - Microsoft'un
/// belgeledigi gibi ilke bir guvenlik siniri degil ve buna izin veriyor. Boylece:
///
///  - `Restricted`, `AllSigned` ve grup ilkesiyle zorlanan ilkede de yukleniyor
///    (`-ExecutionPolicy Bypass` bunu yapamazdi: grup ilkesi onu eziyor);
///  - dosya internetten gelmis gibi isaretliyse (`Zone.Identifier`) ya da veri
///    klasoru bir ag paylasimindaysa uyari/soru cikmiyor;
///  - kullanicinin OTURUMUNUN ilkesi degismiyor. `-ExecutionPolicy Bypass`
///    butun sekmeyi (ve miras yoluyla cocuk sureclerini) Bypass'a cekerdi;
///    kullanicinin kendi betikleri N-Terminal'de baska, disarida baska
///    davranirdi.
///
/// `&` (nokta degil): betik `-File`daki gibi kendi kapsaminda kosuyor, yerel
/// degiskenleri kullanicinin oturumuna sizmiyor. Kalici her sey zaten
/// `Global:` ile tanimli.
///
/// Yuklenemezse (Constrained Language gibi) arayuze `Integration=failed`
/// bildiriliyor: arayuz sekmeyi entegrasyonsuz sayiyor, sonsuz bir
/// "baslatiliyor" yerine duz terminal kaliyor. `Write-Host` ve `[char]`
/// bilincli: kisitli dil kipinde de calisan tek yol onlar.
pub const POWERSHELL_BOOTSTRAP: &str = concat!(
    "try { & ([scriptblock]::Create([IO.File]::ReadAllText($env:NTERMINAL_INTEGRATION_SCRIPT))) } ",
    "catch { Write-Host -NoNewline ([char]27 + ']633;P;Integration=failed' + [char]7); ",
    "Write-Host -ForegroundColor Red ('N-Terminal: ' + $_) }",
);

/// Betigin yolunu tasiyan ortam degiskeni.
///
/// Yol komut satirina GOMULMUYOR: tek tirnakli PowerShell dizesinde `'` ve
/// onun dort Unicode esi (U+2018..U+201B) de ayirici sayiliyor; `O'Neil` gibi
/// bir kullanici adi komutu bozardi. Ortam degiskeninde alintilama derdi yok.
pub const POWERSHELL_SCRIPT_ENV: &str = "NTERMINAL_INTEGRATION_SCRIPT";

/// Uygulamayla gelen PSReadLine'in ikili modulu (yalnizca Windows PowerShell 5.1).
///
/// Betik bunu yalnizca PSReadLine HIC yuklenmemisse kullaniyor. `Restricted`
/// ilkede kabuk modulu kendisi yukleyemiyor: `PSReadLine.psm1` de bir betik ve
/// engelleniyor. PSReadLine olmadan komut baslangici (`133;C`) Enter aninda
/// gelmiyor ve kutu calisan komutun ustunde acik kaliyordu. Ikili modul (DLL)
/// ilkeye tabi degil; `.psm1`in tek isi olan `PSConsoleHostReadLine`i betik
/// kendisi tanimliyor. Bkz. nterminal.ps1, "PSReadLine yedegi".
pub const PSREADLINE_DLL_ENV: &str = "NTERMINAL_PSREADLINE";

/// Ciktiyi tek mesajda toplama penceresi.
///
/// Kisa, cunku bu dogrudan tus gecikmesi: yazilan harfin ekranda gorunmesi en
/// az bu kadar bekliyor. Pencereyi agir akista uzatmak DENENDI (16 KB
/// birikince 40 ms'ye): 30 MB `yes` ciktisinda sure degismedi (16,0 s ↔ 15,9 s),
/// cunku tavan burada degil, cekirdekte (bkz. `DataChannel`); geri alindi.
const COALESCE_WINDOW: Duration = Duration::from_millis(6);
/// Tek olayda gonderilecek azami bayt.
const MAX_CHUNK: usize = 128 * 1024;
const READ_BUF: usize = 32 * 1024;
/// Cocuk oldukten sonra son ciktinin bosalmasi icin taninan sure. Okuyucu EOF
/// gormezse (bir torun slave'i tutuyorsa) cikis olayi en fazla bu kadar gecikir;
/// toplama (reaper) bu sureden bagimsiz, hemen oluyor.
const EXIT_DRAIN_GRACE: Duration = Duration::from_millis(200);

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
struct ExitEvent {
    id: String,
    code: Option<u32>,
}

/// Bir oturumun yazma ucu; `sessions` kilidinden BAGIMSIZ kilitli.
///
/// PTY master'a yazmak bloklayici: on plandaki program girdiyi okumuyorsa
/// (takilmis `ssh`, yanit vermeyen bir TUI) slave'in girdi kuyrugu dolar ve
/// `write_all` kuyruk bosalana kadar doner. Eskiden bu bekleme `sessions`
/// kilidi TUTULURKEN oluyordu: o anda `kill`, `resize`, `spawn`, `alive`
/// hepsi ayni kilidi istedigi icin pencere donuyor ve sekmeyi kapatarak
/// kurtulmak da mumkun olmuyordu - buyuk bir yapistirma bunu tetiklemenin en
/// kolay yolu. Simdi global kilit yalnizca bu tutamaci klonlayacak kadar
/// tutuluyor; bekleme oturumun kendi kilidinde ve komut `spawn_blocking`
/// icinde (bkz. lib.rs `pty_write`).
pub type Writer = Arc<Mutex<Box<dyn Write + Send>>>;

/// Oturumun yazma ucuna yazar ve bosaltir. `writer()` ile alinan tutamacla
/// `sessions` kilidinin disinda cagrilmali.
pub fn write_to(writer: &Writer, data: &[u8]) -> Result<()> {
    let mut w = writer.lock();
    w.write_all(data)?;
    w.flush()?;
    Ok(())
}

struct Session {
    master: Box<dyn MasterPty + Send>,
    writer: Writer,
    killer: Box<dyn ChildKiller + Send + Sync>,
    pid: Option<u32>,
    alive: Arc<AtomicBool>,
    /// `kill()` bunu true yapiyor; reaper is parcasi cikis olayini bastiriyor.
    killed: Arc<AtomicBool>,
}

/// Oturum olaylarinin gittigi yer.
///
/// Uygulamada `TauriSink` (veri icin IPC kanali, cikis icin olay), testte bir
/// mpsc kanali.
trait EventSink: Clone + Send + 'static {
    /// PTY ciktisi. `false`: alici gitmis, yayinci durmali.
    fn data(&self, bytes: &[u8]) -> bool;
    /// Cocuk bitti. Oturum basina en fazla bir kez, son veriden sonra. Yalnizca
    /// reaper cagiriyor; veri yayan is parcasi degil.
    fn exit(&self, code: Option<u32>);
}

/// PTY ciktisini arayuze tasiyan kanal: HAM BAYT, base64 ve JSON yok.
///
/// `ipc::Channel` buyuk yuku `fetch` ile ozel protokolden ham olarak
/// geciriyor (kucuk yuk eval ile, esik Tauri'nin). Eski yol Tauri olayiydi:
/// her parca base64 dize olarak JSON'a, oradan bir JS kaynagina gomuluyor ve
/// arayuzde geri cozuluyordu - bayt basina uc kopya. Kanal ayrica `pty_spawn`
/// cagrisinin ARGUMANI: arayuz onu spawn'dan once kuruyor, yani "dinleyici
/// spawn'dan sonra kuruldu, ilk istem dustu" yarisi (eski `onPtyData`)
/// yapisal olarak kalkti. Cikis olayi seyrek; olay olarak kaliyor.
///
/// ## Olculen hiz - ve tavanin nerede oldugu
///
/// 30 MB `yes` ciktisi (15 milyon satir), macOS: olayla 16,0 s, kanalla
/// 15,9 s; 10 MB'lik TEK satir iki yolda da 0,4 s. Yani satir agirlikli
/// ciktida hiz tasima yolundan bagimsiz. Yalin bir Python okuyucusu (pty.fork
/// + os.read dongusu, arayuz yok) ayni ciktiyi 14,6 s'de aliyor: 9,3 milyon
/// okuma, ortalama 4 bayt - cekirdek PTY'si ciktiyi SATIR BASINA teslim
/// ediyor, `stty raw` ile bile (2 baytlik okumalar). Tavan ~1 milyon satir/s
/// ve cekirdekte; xterm tek basina (WKWebView, IPC yok) ayni 30 MB'yi 5,4 s'de
/// yaziyor. Satir sayisi degil bayt sayisi buyuyunce (uzun satir) hiz
/// 26 MB/s. Burada kazanilacak bir sey kalmadi; kanal yine de bayt basina
/// isi azaltiyor ve yarisi kaldiriyor.
pub type DataChannel = Channel<InvokeResponseBody>;

#[derive(Clone)]
struct TauriSink {
    app: AppHandle,
    id: String,
    data: DataChannel,
    exit_event: String,
}

impl TauriSink {
    fn new(app: &AppHandle, id: &str, data: DataChannel) -> Self {
        Self {
            app: app.clone(),
            id: id.to_string(),
            data,
            exit_event: format!("pty:exit:{id}"),
        }
    }
}

impl EventSink for TauriSink {
    fn data(&self, bytes: &[u8]) -> bool {
        self.data.send(InvokeResponseBody::Raw(bytes.to_vec())).is_ok()
    }

    fn exit(&self, code: Option<u32>) {
        let _ = self.app.emit(&self.exit_event, ExitEvent { id: self.id.clone(), code });
    }
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
        on_data: DataChannel,
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

        let size = PtySize {
            rows: spec.rows.max(2),
            cols: spec.cols.max(10),
            pixel_width: 0,
            pixel_height: 0,
        };
        let pid = self.launch(&spec.id, cmd, size, TauriSink::new(app, &spec.id, on_data))?;

        Ok(SpawnResult {
            id: spec.id,
            pid,
            shell: exe,
            args,
            cwd,
            integration,
        })
    }

    /// PTY'yi acar, kabugu baslatir ve uc is parcasi kurar: okuyucu, yayinci
    /// (`sink.data`) ve reaper (`sink.exit`). Oturumu haritaya yazar, pid doner.
    ///
    /// Olaylar dogrudan Tauri'ye degil `sink`e gidiyor ki oturum yasami gercek
    /// bir kabukla, Tauri olmadan sinanabilsin (bkz. pty_tests.rs `oturum`).
    fn launch<S: EventSink>(
        &self,
        id: &str,
        cmd: CommandBuilder,
        size: PtySize,
        sink: S,
    ) -> Result<Option<u32>> {
        let exe = cmd
            .get_argv()
            .first()
            .map(|a| a.to_string_lossy().to_string())
            .unwrap_or_default();
        let pty_system = native_pty_system();
        let pair = pty_system.openpty(size).context("ConPTY acilamadi")?;
        let child: Box<dyn Child + Send + Sync> = pair
            .slave
            .spawn_command(cmd)
            .with_context(|| format!("kabuk baslatilamadi: {exe}"))?;
        drop(pair.slave);

        let pid = child.process_id();
        let killer = child.clone_killer();
        let reader = pair.master.try_clone_reader().context("PTY okuyucu alinamadi")?;
        let writer = pair.master.take_writer().context("PTY yazici alinamadi")?;
        let alive = Arc::new(AtomicBool::new(true));
        let killed = Arc::new(AtomicBool::new(false));

        // Okuyucu -> yayinci kanali. Okuma bloklayici oldugu icin toplama
        // isini ayri bir is parcasinda recv_timeout ile yapiyoruz.
        let (tx, rx) = mpsc::channel::<Vec<u8>>();
        std::thread::Builder::new()
            .name(format!("nterm-read-{id}"))
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

        // Yayinci: ciktiyi kisa araliklarla toplayip tek olayda gonderir.
        // Kanal kapaninca (okuyucu EOF gordu) son parcayi da yollayip
        // `drained_tx`i dusuruyor. Reaper bunu, cikis olayindan ONCE ciktinin
        // bosaldiginin isareti olarak bekliyor.
        let (drained_tx, drained_rx) = mpsc::channel::<()>();
        let sink_data = sink.clone();
        std::thread::Builder::new()
            .name(format!("nterm-emit-{id}"))
            .spawn(move || {
                let _drained_tx = drained_tx;
                let mut pending: Vec<u8> = Vec::with_capacity(MAX_CHUNK);
                loop {
                    // Ilk parca icin sinirsiz bekle.
                    match rx.recv() {
                        Ok(chunk) => pending.extend_from_slice(&chunk),
                        Err(_) => break, // okuyucu kapandi
                    }
                    // Kisa bir pencere boyunca gelenleri ayni mesaja topla.
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
                    if !sink_data.data(&pending) {
                        break; // alici gitti
                    }
                    pending.clear();
                }
                // Dongu bitti: son veri gonderildi, `_drained_tx` burada dusuyor.
            })
            .context("yayinci is parcasi baslatilamadi")?;

        // Reaper: cocugu `wait()` ile TOPLAYAN tek yer.
        //
        // OLCULEN HATA: calisan uygulamanin altinda saatler once kapatilmis
        // sekmelere ait `<defunct>` (zombi) kabuklar birikiyordu. `wait()`
        // eskiden yalnizca yayincidaydi ve oraya ancak okuyucu EOF gorunce
        // gelinirdi; okuyucu master'in bir dup'ini okuyor, kabuk olse bile
        // slave'i tutan bir torun (arka plan sunucusu, nohup) varsa EOF hic
        // gelmiyor ve cocuk toplanmiyordu.
        //
        // `child.wait()` yalnizca cocuk gercekten olunce donuyor; `kill()`
        // bagimsiz bir `ChildKiller` ile sinyali gonderdiginde de donuyor.
        // Yani toplama artik EOF'a bagli degil.
        let alive_reap = alive.clone();
        let killed_reap = killed.clone();
        std::thread::Builder::new()
            .name(format!("nterm-reap-{id}"))
            .spawn(move || {
                let mut child = child;
                let code = child.wait().ok().map(|status| status.exit_code());
                // Cikis olayi ciktinin ARKASINDA kalmali (arayuz "[oturum sona
                // erdi]" yaziyor). Okuyucu EOF gorduyse `drained_rx` hemen
                // kapaniyor; torun EOF'u engelliyorsa sonsuza kadar degil,
                // yalnizca kisa bir sure bekleyip yine de bildiriyoruz.
                let _ = drained_rx.recv_timeout(EXIT_DRAIN_GRACE);
                alive_reap.store(false, Ordering::SeqCst);
                // Kapatilan oturum icin cikis olayi yok: arayuz dinleyicilerini
                // zaten kaldirdi ve `spawn` ayni kimlikle yeniden baglanabilir.
                if !killed_reap.load(Ordering::SeqCst) {
                    sink.exit(code);
                }
            })
            .context("reaper is parcasi baslatilamadi")?;

        self.sessions.lock().insert(
            id.to_string(),
            Session {
                master: pair.master,
                writer: Arc::new(Mutex::new(writer)),
                killer,
                pid,
                alive,
                killed,
            },
        );
        Ok(pid)
    }

    /// Oturumun yazma tutamaci. Global kilit yalnizca arama suresince tutuluyor;
    /// yazmanin kendisi (`write_to`) kilidin disinda.
    pub fn writer(&self, id: &str) -> Result<Writer> {
        self.sessions
            .lock()
            .get(id)
            .map(|s| s.writer.clone())
            .ok_or_else(|| anyhow!("oturum bulunamadi: {id}"))
    }

    pub fn write(&self, id: &str, data: &[u8]) -> Result<()> {
        let writer = self.writer(id)?;
        write_to(&writer, data)
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
        // Once "kapatildi" isareti, sonra sinyal: reaper `child.wait()`ten
        // uyaninca isareti gormus olmali ki bu oturum icin cikis olayi yaymasin.
        session.killed.store(true, Ordering::SeqCst);
        session.alive.store(false, Ordering::SeqCst);
        let _ = session.killer.kill();
        // Cocugu reaper is parcasi `child.wait()` ile topluyor; sinyal onu
        // uyandiriyor. Toplama artik okuyucunun EOF gormesine bagli degil.
        #[cfg(unix)]
        if let Some(pid) = session.pid {
            kill_process_group(pid);
        }
        true
    }

    pub fn kill_all(&self) {
        // Kapanista bekleme yok: SIGKILL'i erteleyen is parcasi surec
        // bitince olur. Asil is `kill` icinde; buradaki SIGHUP yeterli,
        // cunku kapanan uygulamanin PTY'leri de kapaniyor.
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

/// SIGKILL'den once torunlara taninan sure.
///
/// Kabuk SIGHUP'la hemen oluyor; `trap`li ya da `nohup`lu bir torun olmuyor.
/// Bir saniye, duzgun kapanmak isteyen bir sunucuya (sinyal isleyicisi olan)
/// zaman tanimak icin; sonrasi zorla.
#[cfg(unix)]
const KILL_GRACE: Duration = Duration::from_secs(1);

/// Kabugun SUREC GRUBUNU oldurur: once SIGHUP, bir saniye sonra SIGKILL.
///
/// portable-pty'nin `ChildKiller::kill`i Unix'te yalnizca kabugun PID'ine
/// SIGHUP gonderiyor. Kabuk `setsid` ile oturum ve grup lideri; SIGHUP'i yok
/// sayan ya da `nohup`/`disown` edilmis bir torun slave'i tutmaya devam
/// ediyor. O zaman: okuyucu is parcasi master'in dup'inda sonsuza kadar
/// `read`de kaliyor, yayinci `rx.recv()`de bekliyor - kapatilan her boyle
/// sekme icin iki is parcasi ve tampon kalici siziyor; ustelik okuyucu
/// master'i acik tuttugu icin cekirdek PTY'yi "hangup" yapmiyor, torun hic
/// SIGHUP almiyor (kisir dongu). Windows'ta ConPTY kapaninca agac oluyor;
/// Unix'te bunu kendimiz yapiyoruz.
///
/// `killpg` grubun BUTUN uyelerine gidiyor. Grup kimligi kabugun PID'i ve
/// grup var oldugu surece o PID yeniden verilmiyor (cekirdek grup lideri
/// olmus olsa da pgid'yi tutuyor); yani bir saniye sonraki SIGKILL baska
/// bir surece gitmez. Grup bosalmissa ESRCH doner, zararsiz.
#[cfg(unix)]
fn kill_process_group(pid: u32) {
    let pgid = pid as libc::pid_t;
    // SAFETY: `killpg` bellege dokunmuyor; gecersiz grup icin ESRCH doner.
    unsafe {
        libc::killpg(pgid, libc::SIGHUP);
    }
    std::thread::Builder::new()
        .name(format!("nterm-kill-{pid}"))
        .spawn(move || {
            std::thread::sleep(KILL_GRACE);
            // SAFETY: yukaridaki gibi.
            unsafe {
                libc::killpg(pgid, libc::SIGKILL);
            }
        })
        .ok();
}

/// Kabuk entegrasyon betigini baslatma argumanlarina ekler.
/// Basarili olursa true doner.
///
/// `env` de yaziliyor cunku zsh argumanla yuklenemiyor: `--init-file`
/// karsiligi yok, tek yol ZDOTDIR ortam degiskeni (bkz. Zsh dali). PowerShell
/// de betigin yolunu oradan okuyor (bkz. `POWERSHELL_SCRIPT_ENV`).
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
            // -Command, -File DEGIL: -File yurutme ilkesine takiliyor. Gerekcesi
            // `POWERSHELL_BOOTSTRAP` uzerinde.
            args.push("-NoExit".into());
            args.push("-Command".into());
            args.push(POWERSHELL_BOOTSTRAP.into());
            env.push((POWERSHELL_SCRIPT_ENV.into(), script.to_string_lossy().to_string()));

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

                    // Ilke modulu engellerse betigin yedegi (bkz.
                    // `PSREADLINE_DLL_ENV`). Ayni kosulda: oneri kapaliysa
                    // kabugun kendi kurulumuna yine dokunmuyoruz.
                    let dll = modules.join("PSReadLine").join("Microsoft.PowerShell.PSReadLine2.dll");
                    if dll.is_file() {
                        env.push((PSREADLINE_DLL_ENV.into(), dll.to_string_lossy().to_string()));
                    }
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
