//! Kabuk baslatma argumanlarinin, ortam degiskenlerinin ve yol cevrimlerinin
//! testleri.

use super::*;

#[test]
#[cfg(windows)]
fn msys_yol_cevrimi() {
    assert_eq!(
        unix_style_path(std::path::Path::new("C:\\Users\\ali\\nterminal.sh")),
        "/c/Users/ali/nterminal.sh"
    );
    // Zaten unix bicimindeyse dokunmuyoruz.
    assert_eq!(
        unix_style_path(std::path::Path::new("/home/ali/x.sh")),
        "/home/ali/x.sh"
    );
}

#[test]
#[cfg(windows)]
fn wsl_yol_cevrimi() {
    assert_eq!(
        wsl_mount_path(std::path::Path::new("D:\\veri\\nterminal.sh")).as_deref(),
        Some("/mnt/d/veri/nterminal.sh")
    );
    // Surucu harfi yoksa cevrim yapilamaz; entegrasyon devre disi kalmali.
    assert_eq!(wsl_mount_path(std::path::Path::new("\\\\sunucu\\pay\\x.sh")), None);
}

/// Entegrasyon argumanlarini gercek betik dosyalariyla sinamak icin
/// gecici bir klasore bos betikler yaziyoruz: `apply_integration` dosyanin
/// varligini kontrol ediyor.
///
/// zsh koprusu ALT KLASORDE (`zdotdir/`) duruyor - ZDOTDIR o klasoru
/// gosterecek ve zsh orada yalnizca kendi nokta dosyalarini gormeli.
fn fixture_dir(name: &str) -> std::path::PathBuf {
    let dir = std::env::temp_dir().join(format!("nterminal-int-{name}-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    for file in ["nterminal.ps1", "nterminal.sh", "nterminal.cmd", "nterminal.zsh"] {
        std::fs::write(dir.join(file), "# test").unwrap();
    }
    let zdotdir = dir.join("zdotdir");
    std::fs::create_dir_all(&zdotdir).unwrap();
    for file in [".zshenv", ".zprofile", ".zshrc", ".zlogin"] {
        std::fs::write(zdotdir.join(file), "# test").unwrap();
    }
    dir
}

/// `apply_integration`i env toplayarak cagirir.
fn integrate(
    kind: ShellKind,
    args: &mut Vec<String>,
    dir: &std::path::Path,
) -> (bool, Vec<(String, String)>) {
    let mut env = Vec::new();
    let ok = apply_integration(kind, args, &mut env, dir, None, None);
    (ok, env)
}

/// Ortam degiskeni listesinde bir anahtari arar.
fn env_get<'a>(env: &'a [(String, String)], key: &str) -> Option<&'a str> {
    env.iter().find(|(k, _)| k == key).map(|(_, v)| v.as_str())
}

#[test]
fn powershell_argumanlari() {
    let dir = fixture_dir("ps");
    let mut args = vec!["-NoLogo".to_string()];
    let (ok, env) = integrate(ShellKind::Pwsh, &mut args, &dir);
    assert!(ok);

    // Kullanicinin argumanlari basta kalmali, sonra -NoExit -File <betik>.
    // -NoLogo kullanicidan geldigi icin IKINCI kez eklenmemeli.
    assert_eq!(args[0], "-NoLogo");
    assert_eq!(args[1], "-NoExit");
    assert_eq!(args[2], "-File");
    assert!(args[3].ends_with("nterminal.ps1"));
    assert_eq!(args.iter().filter(|a| a.eq_ignore_ascii_case("-nologo")).count(), 1);
    assert!(env.is_empty(), "PowerShell ortam degiskeni gerektirmiyor");
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn powershell_afisi_susturuluyor() {
    // "Windows PowerShell / Copyright (C) Microsoft ..." her sekmenin basinda
    // dort satir yer kapliyordu; kullaniciya soyledigi bir sey yok.
    let dir = fixture_dir("ps-nologo");
    let mut args: Vec<String> = Vec::new();
    let (ok, _) = integrate(ShellKind::PowerShell, &mut args, &dir);
    assert!(ok);
    assert!(
        args.iter().any(|a| a.eq_ignore_ascii_case("-nologo")),
        "afis susturulmamis: {args:?}"
    );
    // -File'dan ONCE gelmeli, yoksa betige arguman olarak gecer.
    let nologo = args.iter().position(|a| a.eq_ignore_ascii_case("-nologo")).unwrap();
    let file = args.iter().position(|a| a == "-File").unwrap();
    assert!(nologo < file, "-NoLogo, -File'dan sonra: {args:?}");
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn cmd_argumanlari() {
    let dir = fixture_dir("cmd");
    let mut args = Vec::new();
    let (ok, _) = integrate(ShellKind::Cmd, &mut args, &dir);
    assert!(ok);
    assert_eq!(args[0], "/K");
    assert!(args[1].ends_with("nterminal.cmd"));
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn bash_login_argumani_kaldirilir() {
    let dir = fixture_dir("bash");
    // Profilin varsayilani `--login -i` (Git Bash) ya da `-l` (mac).
    //
    // --login CIKARILMAK ZORUNDA: bash `--init-file`i yalnizca login OLMAYAN
    // etkilesimli kabukta okuyor. Birakilsaydi betik hic yuklenmez ve
    // entegrasyon sessizce olurdu - komut gecmisi bos kalirdi.
    let mut args = vec!["--login".to_string(), "-i".to_string()];
    let (ok, _) = integrate(ShellKind::Bash, &mut args, &dir);
    assert!(ok);

    assert!(!args.contains(&"--login".to_string()), "--login kaldirilmali");
    assert!(!args.contains(&"-l".to_string()), "-l de kaldirilmali");
    let pos = args.iter().position(|a| a == "--init-file").expect("--init-file yok");
    assert!(args[pos + 1].starts_with("/"), "betik yolu POSIX bicimde olmali");
    assert_eq!(args.iter().filter(|a| *a == "-i").count(), 1, "-i tekrarlanmamali");
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn bash_kisa_login_argumani_da_kaldirilir() {
    // mac profilinin varsayilani `-l` (uzun bicim degil).
    let dir = fixture_dir("bash-l");
    let mut args = vec!["-l".to_string()];
    let (ok, _) = integrate(ShellKind::Bash, &mut args, &dir);
    assert!(ok);
    assert!(!args.contains(&"-l".to_string()), "-l kaldirilmali");
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
#[cfg(windows)]
fn bash_yolu_windowsta_msys_bicimine_cevrilir() {
    let dir = fixture_dir("bash-msys");
    let mut args = Vec::new();
    let (ok, _) = integrate(ShellKind::Bash, &mut args, &dir);
    assert!(ok);
    let pos = args.iter().position(|a| a == "--init-file").unwrap();
    // Git Bash `C:\...` anlamiyor; `/c/...` bekliyor.
    assert!(
        args[pos + 1].starts_with('/') && !args[pos + 1].contains('\\'),
        "MSYS bicimi bekleniyordu: {}",
        args[pos + 1]
    );
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
#[cfg(windows)]
fn wsl_argumanlari() {
    let dir = fixture_dir("wsl");
    let mut args = vec!["-d".to_string(), "Ubuntu".to_string()];
    let (ok, _) = integrate(ShellKind::Wsl, &mut args, &dir);
    assert!(ok);

    let sep = args.iter().position(|a| a == "--").expect("-- ayirici yok");
    assert_eq!(args[sep + 1], "bash");
    assert_eq!(args[sep + 2], "--init-file");
    assert!(args[sep + 3].starts_with("/mnt/"), "WSL yolu bekleniyordu: {}", args[sep + 3]);
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn ozel_profil_entegrasyon_almaz() {
    let dir = fixture_dir("custom");
    let mut args = Vec::new();
    // Custom: hangi kabuk oldugunu bilmiyoruz, betik yuklemek riskli.
    let (ok, env) = integrate(ShellKind::Custom, &mut args, &dir);
    assert!(!ok);
    assert!(args.is_empty());
    assert!(env.is_empty());
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn fish_entegrasyon_almaz() {
    let dir = fixture_dir("fish");
    let mut args = Vec::new();
    // fish bash/zsh soz dizimini paylasmiyor. Entegrasyonu "acik" saymak
    // kullaniciya calisiyor izlenimi verirdi ama gecmis, oneri ve cikis kodu
    // hic gelmezdi - sessiz bir yarim durum.
    let (ok, env) = integrate(ShellKind::Fish, &mut args, &dir);
    assert!(!ok, "fish icin entegrasyon bildirilmemeli");
    assert!(args.is_empty(), "yarim arguman birakilmamali");
    assert!(env.is_empty());
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn fish_desteklenmiyor_olarak_isaretli() {
    // apply_integration'a hic gelmemesi gerekiyor; iki yer de ayni seyi
    // soylemeli.
    assert!(!ShellKind::Fish.supports_integration());
    assert!(!ShellKind::Custom.supports_integration());
    assert!(ShellKind::Zsh.supports_integration());
    assert!(ShellKind::Bash.supports_integration());
}

#[test]
fn betik_yoksa_entegrasyon_kapali_kalir() {
    let bos = std::env::temp_dir().join(format!("nterminal-bos-{}", std::process::id()));
    std::fs::create_dir_all(&bos).unwrap();
    let mut args = Vec::new();
    // Betik dosyasi yok: sessizce entegrasyonsuz devam edilmeli, hata degil.
    let (ok, _) = integrate(ShellKind::Pwsh, &mut args, &bos);
    assert!(!ok);
    assert!(args.is_empty(), "yarim arguman birakilmamali");
    let _ = std::fs::remove_dir_all(bos);
}

// ------------------------------------------------------------------- zsh

#[test]
fn zsh_zdotdir_ile_yukleniyor() {
    let dir = fixture_dir("zsh");
    let mut args = vec!["-l".to_string()];
    let (ok, env) = integrate(ShellKind::Zsh, &mut args, &dir);
    assert!(ok);

    // zsh'in `--init-file` karsiligi YOK: yukleme yalnizca ZDOTDIR ile
    // olabiliyor. Arguman eklenmemeli - eklenirse zsh onu dosya adi sanip
    // etkilesimli kabuk yerine betik kosturur.
    assert_eq!(args, vec!["-l".to_string()], "argumanlar degismemeli");

    let zdotdir = env_get(&env, "ZDOTDIR").expect("ZDOTDIR yazilmamis");
    assert!(
        zdotdir.ends_with("zdotdir"),
        "ZDOTDIR kopru klasorunu gostermeli: {zdotdir}"
    );
    assert!(
        std::path::Path::new(zdotdir).join(".zshrc").is_file(),
        "ZDOTDIR icinde .zshrc olmali"
    );
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn zsh_login_argumani_korunuyor() {
    // bash'in tersine: zsh `-l` ile de ZDOTDIR'i okuyor, dolayisiyla login
    // kabugunu bozmak gerekmiyor. mac'te `-l` SART - PATH'i /etc/zprofile
    // icindeki path_helper kuruyor.
    let dir = fixture_dir("zsh-l");
    let mut args = vec!["-l".to_string()];
    let (ok, _) = integrate(ShellKind::Zsh, &mut args, &dir);
    assert!(ok);
    assert!(args.contains(&"-l".to_string()), "-l korunmali");
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn zsh_kopru_yoksa_entegrasyon_kapali() {
    // nterminal.zsh var ama kopru dosyalari yok: ZDOTDIR'i yonlendirmek
    // kullanicinin TUM baslangic dosyalarini atlatirdi - PATH'i, alias'lari ve
    // temasi giderdi. Entegrasyonsuz devam etmek buna yegdir.
    let dir = std::env::temp_dir().join(format!("nterminal-zsh-bos-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("nterminal.zsh"), "# test").unwrap();
    let mut args = Vec::new();
    let (ok, env) = integrate(ShellKind::Zsh, &mut args, &dir);
    assert!(!ok, "kopru yoksa entegrasyon bildirilmemeli");
    assert!(env.is_empty(), "yarim ZDOTDIR birakilmamali");
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn zsh_kullanici_zdotdiri_kopruye_gecirilir() {
    let dir = fixture_dir("zsh-user");
    let mut args = Vec::new();
    let mut env = Vec::new();
    let ok = apply_integration(
        ShellKind::Zsh,
        &mut args,
        &mut env,
        &dir,
        Some("/Users/ali/.config/zsh"),
        None,
    );
    assert!(ok);
    // Kopru dosyalari kullanicinin gercek dosyalarini bu degerle buluyor.
    // Gecirilmezse $HOME'a duser ve ozel bir ZDOTDIR kullanan kullanicinin
    // hicbir ayari yuklenmez.
    assert_eq!(
        env_get(&env, "NTERMINAL_ZDOTDIR"),
        Some("/Users/ali/.config/zsh")
    );
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn zsh_kendi_klasorunu_kullanici_zdotdiri_sanmiyor() {
    // Uygulama bir NTerminal sekmesinden baslatildiginda ZDOTDIR zaten bizim
    // kopruyu gosteriyor. Onu "kullanicinin ZDOTDIR'i" diye geri verirsek
    // kopru kendi kendini yuklemeye calisir ve kullanicinin hicbir dosyasi
    // okunmaz - sessiz ve teshisi zor.
    let dir = fixture_dir("zsh-self");
    let own = dir.join("zdotdir").to_string_lossy().to_string();
    let mut args = Vec::new();
    let mut env = Vec::new();
    let ok = apply_integration(ShellKind::Zsh, &mut args, &mut env, &dir, Some(&own), None);
    assert!(ok);
    assert_eq!(
        env_get(&env, "NTERMINAL_ZDOTDIR"),
        None,
        "kendi klasorumuz kullanici klasoru olarak gecirilmemeli"
    );
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn zsh_bos_kullanici_zdotdiri_yazilmiyor() {
    // Bos dize gecirilirse kopru `${NTERMINAL_ZDOTDIR:-$HOME}` ile $HOME'a
    // dusuyor; degiskeni bos yazmak yerine hic yazmamak ayni sonucu veriyor ve
    // ortami temiz tutuyor.
    let dir = fixture_dir("zsh-empty");
    let mut args = Vec::new();
    let mut env = Vec::new();
    assert!(apply_integration(ShellKind::Zsh, &mut args, &mut env, &dir, Some("   "), None));
    assert_eq!(env_get(&env, "NTERMINAL_ZDOTDIR"), None);
    let _ = std::fs::remove_dir_all(dir);
}

// ---------------------------------------------------------- oturum yasami
//
// Gercek bir kabukla ama Tauri olmadan: olaylar `EventSink` uzerinden bir
// kanala geliyor. Yalnizca Unix - senaryolar /bin/sh, sinyaller ve `ps`
// uzerine kurulu. ConPTY tarafinda ayni akis calisiyor ama zombi kavrami yok.

#[cfg(unix)]
mod oturum {
    use super::*;
    use std::sync::mpsc::{self, RecvTimeoutError};
    use std::time::{Duration, Instant};

    enum Olay {
        Veri(Vec<u8>),
        Cikis(Option<u32>),
    }

    #[derive(Clone)]
    struct Kanal(mpsc::Sender<Olay>);

    impl EventSink for Kanal {
        fn data(&self, bytes: &[u8]) -> bool {
            self.0.send(Olay::Veri(bytes.to_vec())).is_ok()
        }
        fn exit(&self, code: Option<u32>) {
            let _ = self.0.send(Olay::Cikis(code));
        }
    }

    /// `/bin/sh -c <betik>` baslatir; kabugun pid'ini ve olay kanalini verir.
    fn baslat(manager: &PtyManager, id: &str, betik: &str) -> (u32, mpsc::Receiver<Olay>) {
        let (tx, rx) = mpsc::channel();
        let mut cmd = CommandBuilder::new("/bin/sh");
        cmd.args(["-c", betik]);
        let size = PtySize { rows: 24, cols: 80, pixel_width: 0, pixel_height: 0 };
        let pid = manager
            .launch(id, cmd, size, Kanal(tx))
            .expect("kabuk baslatilamadi")
            .expect("pid yok");
        (pid, rx)
    }

    /// Cikis olayina ya da sureye kadar gelen her seyi toplar: birlesik veri
    /// ve (geldiyse) cikis kodu.
    fn topla(rx: &mpsc::Receiver<Olay>, timeout: Duration) -> (Vec<u8>, Option<Option<u32>>) {
        let deadline = Instant::now() + timeout;
        let mut veri = Vec::new();
        loop {
            let remaining = deadline.saturating_duration_since(Instant::now());
            match rx.recv_timeout(remaining) {
                Ok(Olay::Veri(b)) => veri.extend_from_slice(&b),
                Ok(Olay::Cikis(code)) => return (veri, Some(code)),
                Err(RecvTimeoutError::Timeout) | Err(RecvTimeoutError::Disconnected) => {
                    return (veri, None)
                }
            }
        }
    }

    /// Metin veri olaylarinda gorunene kadar bekler.
    fn veri_bekle(rx: &mpsc::Receiver<Olay>, needle: &str, timeout: Duration) -> bool {
        let deadline = Instant::now() + timeout;
        let mut veri = String::new();
        loop {
            let remaining = deadline.saturating_duration_since(Instant::now());
            match rx.recv_timeout(remaining) {
                Ok(Olay::Veri(b)) => {
                    veri.push_str(&String::from_utf8_lossy(&b));
                    if veri.contains(needle) {
                        return true;
                    }
                }
                Ok(Olay::Cikis(_)) => return false,
                Err(_) => return false,
            }
        }
    }

    /// Surecin `ps` durumu. None: surec tabloda yok, yani toplanmis.
    /// Some("Z"): olmus ama `wait()` edilmemis - zombi.
    fn surec_durumu(pid: u32) -> Option<String> {
        let out = std::process::Command::new("ps")
            .args(["-o", "stat=", "-p", &pid.to_string()])
            .output()
            .expect("ps calistirilamadi");
        let durum = String::from_utf8_lossy(&out.stdout).trim().to_string();
        (!durum.is_empty()).then_some(durum)
    }

    /// Surec tablodan silinene kadar bekler; son gorulen durumu doner.
    fn toplanmayi_bekle(pid: u32, timeout: Duration) -> Option<String> {
        let deadline = Instant::now() + timeout;
        let mut durum = surec_durumu(pid);
        while durum.is_some() && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(25));
            durum = surec_durumu(pid);
        }
        durum
    }

    /// Slave ucunu kabuktan sonra da acik tutan torun: SIGHUP'i yok sayan bir
    /// `sleep`. Arka planda birakilmis bir sunucunun ya da `nohup`lu bir
    /// komutun sekme kapatildiktan sonra yaptigi sey tam olarak bu.
    ///
    /// Bu torunun okuyucuyu GERCEKTEN bloklamasi PLATFORMA BAGLI ve burada
    /// varsayilmiyor. Linux'ta master ucu, slave'i tutan son surec de
    /// kapanana kadar EOF vermiyor. macOS'ta veriyor: olculdu, bu moduldeki
    /// uc test toplam 40 ms'de bitiyor, yani EOF kabuk olur olmaz geliyor.
    /// Senaryo yine de anlamli - toplama artik EOF'a hic bakmadigi icin iki
    /// davranista da ayni sonucu vermeli, testler ikisini de kapsiyor.
    const TORUN: &str = "(trap '' HUP; exec sleep 10) &";

    #[test]
    fn oldurulen_kabuk_zombi_kalmiyor() {
        // OLCULEN HATA: calisan uygulamanin altinda, saatler once kapatilmis
        // iki sekmeye ait iki `<defunct>` zsh (ps: STAT=Z). Kabuk SIGHUP ile
        // olmus ama `wait()` edilmemis.
        //
        // ZINCIR: `wait()` yalnizca yayincidaydi ve yayinci oraya ancak
        // okuyucu EOF gorunce geliyordu. Yani toplama, kabugun OLMESINE degil
        // PTY okuyucusunun kapanmasina bagliydi; ikisi ayni sey degil ve
        // okuyucunun EOF gormedigi her yol kabugu zombi birakiyordu.
        //
        // Linux'ta bilinen bir yol var: master ucu, slave'i tutan son surec
        // de kapanana kadar EOF vermiyor, yani kabugun arkada biraktigi bir
        // torun okumayi sonsuza kadar acik tutabiliyor. macOS'ta bu yol YOK
        // (bkz. `TORUN`), dolayisiyla gozlenen iki zombinin kok nedeni
        // kanitlanmis DEGIL. Duzeltme nedenden bagimsiz: her cocuk kosulsuz
        // bekleniyor. Bu test de sonuca bakiyor, mekanizmaya degil - torun 10
        // saniye yasiyor, kabuk 5 saniye icinde tablodan silinmeli.
        let manager = PtyManager::default();
        let (pid, rx) = baslat(&manager, "zombi", &format!("{TORUN} echo HAZIR; wait"));
        // Torun gercekten fork edilmis olmali, yoksa senaryo kurulmaz.
        assert!(veri_bekle(&rx, "HAZIR", Duration::from_secs(10)), "kabuk baslamadi");

        assert!(manager.kill("zombi"));

        let durum = toplanmayi_bekle(pid, Duration::from_secs(5));
        assert!(
            durum.is_none(),
            "kabuk (pid {pid}) toplanmamis, ps durumu: {durum:?} - zombi kaldi"
        );
        // Kapatilan oturumdan cikis olayi gelmemeli: arayuz dinleyicilerini
        // zaten kaldirdi; `spawn` ayni kimlikle yeniden baglaniyorsa yeni
        // oturumun dinleyicileri o kimlikte ve bu olay onu "sona erdi" sanirdi.
        let (_, cikis) = topla(&rx, Duration::from_millis(300));
        assert!(cikis.is_none(), "kapatilan oturum cikis olayi yolladi: {cikis:?}");
    }

    #[test]
    fn cikis_olayi_okuyucu_eof_gormese_de_geliyor() {
        // Kabuk kendi kendine bitiyor ve arkada slave'i tutan bir torun
        // kaliyor. Okuyucunun EOF gorup gormedigi platforma bagli (bkz.
        // `TORUN`); cikis olayi ikisinde de gelmeli, cunku kabugun bitisini
        // artik `wait()` bildiriyor, okuyucu degil. EOF'un geciktigi
        // platformda eski akisla bu olay torun bitene kadar (burada 10 s,
        // gercekte belki hic) gelmiyor ve sekme "[oturum sona erdi]"
        // yazmadan asili kaliyordu.
        let manager = PtyManager::default();
        let (_, rx) = baslat(&manager, "eof-yok", &format!("{TORUN} exit 3"));
        let (_, cikis) = topla(&rx, Duration::from_secs(3));
        assert_eq!(cikis, Some(Some(3)), "cikis olayi 3 saniyede gelmedi ya da kod yanlis");
        assert!(!manager.alive("eof-yok"));
    }

    #[test]
    fn cikis_olayi_son_veriden_sonra_ve_kodla_geliyor() {
        // Arayuz cikis olayinda "[oturum sona erdi]" yaziyor; ondan sonra veri
        // gelirse mesaj ciktinin ortasinda kalir. Cikis kodu da kabugun
        // kendi kodu olmali - gecmis kaydi onu yaziyor.
        let manager = PtyManager::default();
        let (_, rx) = baslat(&manager, "sira", "echo merhaba; exit 7");
        let (veri, cikis) = topla(&rx, Duration::from_secs(5));
        assert_eq!(cikis, Some(Some(7)));
        assert!(
            String::from_utf8_lossy(&veri).contains("merhaba"),
            "cikti cikis olayindan once gelmedi: {:?}",
            String::from_utf8_lossy(&veri)
        );
        // Cikistan sonra veri yok.
        let (sonra, _) = topla(&rx, Duration::from_millis(200));
        assert!(sonra.is_empty(), "cikis olayindan sonra veri geldi: {sonra:?}");
        // Oturum kaydi kapatilana kadar duruyor (`alive` false), kapatmak onu
        // siliyor; ikinci kapatma "yoktu" diyor.
        assert!(!manager.alive("sira"));
        assert!(manager.list().contains(&"sira".to_string()));
        assert!(manager.kill("sira"));
        assert!(!manager.kill("sira"));
    }
}
