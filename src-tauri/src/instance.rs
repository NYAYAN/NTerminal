//! Tek ornek: ayni veri klasorunu iki N-Terminal sureci paylasmiyor.
//!
//! BILDIRILEN HATA: "uygulamadan cikinca acik portlar kapanmiyor". Olculen
//! durum: kurulu uygulamanin UC sureci ayni anda calisiyordu, ikisinin
//! penceresi gizliydi. Sabah acilan ilk surecin sekmesindeki `ng serve` 1453
//! portunu dinlemeye devam ediyordu; sonradan acilan surecte ayni sekmede
//! baslatilan `ng serve` portu alamadi.
//!
//! ZINCIR: kapatma dugmesinin varsayilani "arka planda calis" - pencere
//! gizleniyor, kabuklar ve icindeki sunucular BILINCLI olarak yasiyor (bkz.
//! App.tsx `onCloseRequested`). Kullanici uygulamayi yeniden baslatinca yeni
//! bir surec aciliyordu: ayni `workspace.json`dan ayni sekmeleri kuruyor, eski
//! surec ise gizli pencerede sunucuyu calistirmaya devam ediyordu. Ustelik iki
//! surec ayni `workspace.json` ve `scrollback/` dosyalarina birbirinin ustune
//! yaziyordu.
//!
//! "Cikis"in kendisi saglam: sekme kapaninca da, uygulama sureci bitince de
//! torundaki sunucu portu birakiyor (bkz. pty_tests.rs `kapanis`).
//!
//! COZUM: ikinci surec acilmiyor; ilk surece "pencereni goster" deyip cikiyor.
//! Arka planda calisan sunucu kaybolmuyor, kullanici onu sekmesinde kaldigi
//! yerde goruyor.
//!
//! Kilit uygulama kimligine degil VERI KLASORUNE bagli: tasinabilir kopya
//! kendi klasoruyle, gelistirme ornegi `NTERMINAL_DATA_DIR` ile kurulu
//! uygulamanin yaninda calisabilmeli. Ayni klasoru paylasan iki surec ise tam
//! olarak onlenmesi gereken durum. `tauri-plugin-single-instance` bu yuzden
//! kullanilmiyor: kilidi uygulama kimliginden (`com.nyayan.nterminal`)
//! kuruyor ve baska bir anahtar kabul etmiyor.
//!
//! Yalnizca Windows. macOS'ta ayni uygulamayi yeniden acmak yeni surec
//! baslatmiyor, LaunchServices calisani one getiriyor.

use std::path::Path;

/// Veri klasorunun sahibi olan surecin kilidi. Surec boyunca yasamali:
/// dusurulurse bir sonraki acilis kendini yine ilk sanar.
pub struct Instance {
    #[cfg(windows)]
    event: win::Handle,
}

// SAFETY: cekirdek nesnesi tutamagi surecin; hangi is parcasindan kullanildigi
// fark etmiyor. `on_activate` onu bekleyen is parcasina tasiyor.
#[cfg(windows)]
unsafe impl Send for Instance {}

/// Veri klasorunu bu surec icin alir.
///
/// `None`: ayni klasorle calisan bir N-Terminal var, ona penceresini gostermesi
/// soylendi ve bu surec ACILMAMALI. Kilit kurulamazsa (beklenmeyen bir Windows
/// hatasi) yine `Some` doner: koruma yuzunden uygulamanin hic acilmamasi iki
/// ornekten kotu.
#[cfg(windows)]
pub fn acquire(root: &Path) -> Option<Instance> {
    let name: Vec<u16> = event_name(root).encode_utf16().chain(std::iter::once(0)).collect();
    // Kendiliginden sifirlanan, isaretsiz bir olay. Ayni adla zaten varsa
    // CreateEventW onu aciyor ve GetLastError ERROR_ALREADY_EXISTS diyor.
    // SAFETY: `name` NUL ile biten gecerli bir UTF-16 dizesi; guvenlik
    // ozniteligi NULL (varsayilan). GetLastError hemen ardindan okunuyor.
    let (event, existed) = unsafe {
        let event = win::CreateEventW(std::ptr::null(), 0, 0, name.as_ptr());
        (event, win::GetLastError() == win::ERROR_ALREADY_EXISTS)
    };
    if event.is_null() {
        eprintln!("[nterminal] tek ornek kilidi kurulamadi; koruma olmadan aciliyor");
        return Some(Instance { event });
    }
    if !existed {
        return Some(Instance { event });
    }
    // On plana gecme hakki kullanicinin az once actigi bu surecte. Ilk surec
    // pencereyi one getirecek; hakki ona birakiyoruz ki Windows'un on plan
    // kilidi pencereyi arkada birakmasin.
    // SAFETY: `event` az once acilmis gecerli bir tutamak; isaretlenip
    // kapatiliyor, sonra kullanilmiyor.
    unsafe {
        win::AllowSetForegroundWindow(win::ASFW_ANY);
        win::SetEvent(event);
        win::CloseHandle(event);
    }
    None
}

#[cfg(not(windows))]
pub fn acquire(_root: &Path) -> Option<Instance> {
    Some(Instance {})
}

impl Instance {
    /// Baska bir acilis bu sureci her cagirdiginda `f` calisiyor (ayri bir is
    /// parcasinda). Kilit de o is parcasiyla surecin sonuna kadar tutuluyor.
    pub fn on_activate<F: Fn() + Send + 'static>(self, f: F) {
        #[cfg(windows)]
        {
            if self.event.is_null() {
                return;
            }
            let spawned = std::thread::Builder::new()
                .name("nterm-instance".into())
                .spawn(move || {
                    let instance = self;
                    // SAFETY: tutamak bu is parcasina tasinan `instance`in;
                    // dongu bitene kadar kapatilmiyor.
                    while unsafe { win::WaitForSingleObject(instance.event, win::INFINITE) }
                        == win::WAIT_OBJECT_0
                    {
                        f();
                    }
                });
            if let Err(err) = spawned {
                eprintln!("[nterminal] tek ornek dinleyicisi baslatilamadi: {err}");
            }
        }
        #[cfg(not(windows))]
        {
            let _ = (self, f);
        }
    }
}

#[cfg(windows)]
impl Drop for Instance {
    fn drop(&mut self) {
        if !self.event.is_null() {
            // SAFETY: tutamak bizim ve yalnizca burada, bir kez kapatiliyor.
            unsafe { win::CloseHandle(self.event) };
        }
    }
}

/// Olay nesnesinin adi: `Local\NTerminal-<veri klasorunun ozeti>`.
///
/// `Local\`: oturum basina. Ayni makinedeki baska bir Windows oturumu (uzak
/// masaustu, kullanici degistirme) kendi N-Terminal'ini acabilmeli.
///
/// Gelistirme yapisi ayri ad alaninda (`dev-`): `npm start` cogu zaman kurulu
/// N-Terminal'in kendi sekmesinden kosuyor ve ikisi varsayilan veri klasorunu
/// paylasiyor. Ortak kilit olsaydi gelistirme ornegi hic acilmaz, kurulu
/// uygulamanin penceresini one getirip cikardi.
#[cfg(windows)]
fn event_name(root: &Path) -> String {
    let kind = if cfg!(debug_assertions) { "dev-" } else { "" };
    format!("Local\\NTerminal-{kind}{:016x}", fnv1a(folder_key(root).as_bytes()))
}

/// Ayni klasorun farkli yazimlari ayni anahtari vermeli: buyuk/kucuk harf,
/// `/` ile `\`, sondaki ayirici, kisa (8.3) ad. Kullanici adi uzunsa `%TEMP%`
/// kisa adla geliyor (`C:\Users\ABCDEF~1\...`); `NTERMINAL_DATA_DIR`i oradan
/// kuran biri ayni klasoru iki yazimla verebilir.
///
/// Klasor varsa `canonicalize` hepsini cozuyor; acilis bunu `ensure()`dan
/// sonra cagirdigi icin normalde var. Yoksa elle sadelestiriyoruz.
#[cfg(windows)]
fn folder_key(root: &Path) -> String {
    match std::fs::canonicalize(root) {
        Ok(path) => path.to_string_lossy().to_lowercase(),
        Err(_) => root
            .to_string_lossy()
            .replace('/', "\\")
            .trim_end_matches('\\')
            .to_lowercase(),
    }
}

/// FNV-1a, 64 bit. `DefaultHasher` DEGIL: onun ciktisinin Rust surumleri
/// arasinda ayni kalacagi garanti edilmiyor. Guncellemeden sonra acilan yeni
/// surum, arka planda kalan eski surumun kilidini ayni adla bulmali.
#[cfg(windows)]
fn fnv1a(bytes: &[u8]) -> u64 {
    bytes.iter().fold(0xcbf2_9ce4_8422_2325, |hash, &byte| {
        (hash ^ u64::from(byte)).wrapping_mul(0x0000_0100_0000_01b3)
    })
}

#[cfg(windows)]
mod win {
    use std::ffi::c_void;

    pub type Handle = *mut c_void;

    pub const ERROR_ALREADY_EXISTS: u32 = 183;
    pub const WAIT_OBJECT_0: u32 = 0;
    pub const INFINITE: u32 = u32::MAX;
    /// `AllowSetForegroundWindow`: herhangi bir surec.
    pub const ASFW_ANY: u32 = u32::MAX;

    #[link(name = "kernel32")]
    unsafe extern "system" {
        pub fn CreateEventW(
            attributes: *const c_void,
            manual_reset: i32,
            initial_state: i32,
            name: *const u16,
        ) -> Handle;
        pub fn SetEvent(event: Handle) -> i32;
        pub fn WaitForSingleObject(handle: Handle, milliseconds: u32) -> u32;
        pub fn CloseHandle(handle: Handle) -> i32;
        pub fn GetLastError() -> u32;
    }

    #[link(name = "user32")]
    unsafe extern "system" {
        pub fn AllowSetForegroundWindow(process_id: u32) -> i32;
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::sync::mpsc;
    use std::time::Duration;

    /// Test basina ayri klasor: kilit klasore bagli, testler paralel kosabilir.
    fn gecici_klasor(ad: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("nterminal-ornek-{ad}-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn ayni_klasorle_ikinci_acilis_acilmiyor_ilk_ornege_haber_veriyor() {
        // Bildirilen hatanin kilidi: ikinci acilis kendi penceresini ACMAMALI
        // (None) ve ilk ornege haber gitmeli - gizli pencereyi o gosteriyor.
        let dir = gecici_klasor("ikinci");
        let ilk = acquire(&dir).expect("ilk acilis kilidi alamadi");
        let (tx, rx) = mpsc::channel();
        ilk.on_activate(move || {
            let _ = tx.send(());
        });

        assert!(acquire(&dir).is_none(), "ikinci acilis ayri bir ornek olarak acilacakti");
        rx.recv_timeout(Duration::from_secs(5)).expect("ilk ornege haber gitmedi");

        // Her acilis ayri bir haber: olay kendiliginden sifirlaniyor, ikinci
        // kez acmak da pencereyi yine one getirmeli.
        assert!(acquire(&dir).is_none());
        rx.recv_timeout(Duration::from_secs(5)).expect("ikinci haber gitmedi");
    }

    #[test]
    fn farkli_veri_klasorleri_yan_yana_acilabiliyor() {
        // Gelistirme ornegi kurulu uygulama acikken `NTERMINAL_DATA_DIR` ile
        // ayri klasorde calisiyor (calistir skill'i); tasinabilir kopya da
        // kendi klasoruyle.
        let a = acquire(&gecici_klasor("a")).expect("a klasoru");
        let b = acquire(&gecici_klasor("b"));
        assert!(b.is_some(), "baska veri klasorundeki ornek engellendi");
        drop((a, b));
    }

    #[test]
    fn birakilan_kilit_yeniden_alinabiliyor() {
        // Kapanan ornegin kilidi kalmamali; kalsaydi uygulama bir daha
        // acilmaz, olmayan bir ornege haber verip cikardi.
        let dir = gecici_klasor("birak");
        drop(acquire(&dir).expect("ilk"));
        assert!(acquire(&dir).is_some(), "kapanan ornegin kilidi kaldi");
    }

    #[test]
    fn ayni_klasorun_farkli_yazimlari_ayni_anahtari_veriyor() {
        let dir = gecici_klasor("Yazim");
        let beklenen = folder_key(&dir);
        let yazimlar = [
            PathBuf::from(dir.to_string_lossy().to_uppercase()),
            PathBuf::from(dir.to_string_lossy().replace('\\', "/")),
            PathBuf::from(format!("{}\\", dir.display())),
            // `temp_dir()` kisa (8.3) adla gelebiliyor; tam yolu da ayni olmali.
            std::fs::canonicalize(&dir).unwrap(),
        ];
        for yazim in yazimlar {
            assert_eq!(folder_key(&yazim), beklenen, "{}", yazim.display());
        }
    }

    #[test]
    fn olay_adi_surumler_arasinda_degismiyor() {
        // Ad degisirse guncellemeden sonra acilan surum arka planda kalan eski
        // surumu goremez ve ikinci ornek olarak acilir. FNV-1a'nin bilinen
        // deger ciftleri: bos dize ve "a".
        assert_eq!(fnv1a(b""), 0xcbf2_9ce4_8422_2325);
        assert_eq!(fnv1a(b"a"), 0xaf63_dc4c_8601_ec8c);
        let name = event_name(&gecici_klasor("ad"));
        let hash = name.rsplit('-').next().unwrap();
        assert!(name.starts_with("Local\\NTerminal-"), "{name}");
        assert_eq!(hash.len(), 16, "{name}");
    }
}
