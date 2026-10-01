//! Oturum sonu: Windows Installer (Restart Manager), oturum kapatma ya da
//! yeniden baslatma uygulamayi kapatmak istediginde.
//!
//! OLCULEN HATA (NOTLAR.md §2.6): MSI kurulurken Restart Manager acik
//! N-Terminal'e kapanmasini soyledi; surec iki saniye sonra `0xc0000409` ile
//! dustu (WER `BEX64`). Calisma alani ve ekran ciktilari son periyodik
//! kayittaki halinde kaldi. Yalitilmis ornekte ayni istekle (gercek
//! `RmShutdown` ya da ayni iletiler: WM_QUERYENDSESSION, ardindan
//! WM_ENDSESSION + ENDSESSION_CLOSEAPP):
//!
//! ```text
//! panicked at tao-0.35.3\src\platform_impl\windows\event_loop\runner.rs:371:25:
//! cannot move state from Destroyed
//! ```
//!
//! ZINCIR: tao `WM_ENDSESSION`i kendi gizli penceresinde ("Tao Thread Event
//! Target") karsiliyor: olay dongusunu `Destroyed` durumuna aliyor ve `0`
//! donuyor. Oturum kapanirken Windows sureci bunun ardindan kendisi
//! sonlandiriyor; Restart Manager ise SONLANDIRMIYOR, uygulamanin kendisinin
//! cikmasini bekliyor. Ileti dongusu donmeye devam ediyor ve gelen ilk Tauri
//! iletisi (IPC yaniti, PTY ciktisi) `Destroyed`dan cikmaya calisip
//! panikliyor. Surum yapisinda `panic = "abort"`: panik dogrudan `0xc0000409`.
//!
//! COZUM: tao'nun penceresine tao'dan SONRA bir alt sinif (subclass)
//! takiliyor. comctl32 alt siniflari son takilandan baslayarak cagiriyor;
//! bizimki once calisiyor ve `WM_ENDSESSION(TRUE)`i tao'ya hic iletmiyor.
//! Yerine duzgun kapanis (`end`): arayuz son durumu diske yaziyor, kabuklar
//! kapaniyor, tepsi simgesi kalkiyor, surec cikiyor.
//!
//! tao'yu guncellemek neden yetmiyor: 0.37 ayni iletide sureci hemen bitiriyor
//! (Tauri 2.12 istiyor). Cokme gidiyor ama arayuzun son kaydi yine yapilmiyor,
//! ve olay isleyicisi calisirken gelen `WM_ENDSESSION` orada da panik
//! (tao#1345). Bu alt sinif tao'nun surumunden bagimsiz once calisiyor.

use std::sync::atomic::{AtomicBool, Ordering};

/// Arayuz son kaydi bitirdi mi (`session_end_flushed` komutu).
static FLUSHED: AtomicBool = AtomicBool::new(false);

/// `session_end_flushed` komutu: arayuz son kaydi bitirdi.
pub fn mark_flushed() {
    FLUSHED.store(true, Ordering::SeqCst);
}

/// Kapanis istegini yakalamayi kurar. Uygulama acilisinda, ana is
/// parcaciginda bir kez (`setup`).
pub fn install<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    #[cfg(windows)]
    {
        let handle = app.clone();
        let installed = intercept(move |stage| match stage {
            Stage::Query => request_flush(&handle),
            Stage::Cancelled => cancel(),
            Stage::End => end(&handle),
        });
        if !installed {
            // Sinif adi degistiyse (tao guncellemesi) koruma olmadan calisiyoruz:
            // `session_end_tests.rs` bunu once yakalamali.
            eprintln!("[nterminal] oturum sonu yakalanamadi: tao'nun ileti penceresi bulunamadi");
        }
    }
    #[cfg(not(windows))]
    let _ = app;
}

#[cfg(windows)]
pub use windows_impl::*;

#[cfg(windows)]
mod windows_impl {
    use super::FLUSHED;
    use std::panic::{catch_unwind, AssertUnwindSafe};
    use std::ptr::{null, null_mut};
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::time::{Duration, Instant};
    use tauri::{Emitter, Manager};

    /// Arayuze "son durumu yaz" diyen olay. `ipc.ts` ayni adi dinliyor;
    /// `sessionEnd.test.ts` ikisini bagliyor.
    pub const EVENT: &str = "app:session-end";

    /// Arayuzun son kaydina taninan azami sure.
    ///
    /// Beklemenin sebebi: kayit komutlari (`workspace_save`, `scrollback_save`)
    /// es zamanli, yani ANA is parcaciginda kosuyor. O is parcacigi
    /// `WM_ENDSESSION`in icindeyken iletileri biz islemezsek kayit hic kosmaz.
    ///
    /// Sinirin sebebi: Windows kapanmayi bekleyen uygulamayi birkac saniye sonra
    /// "kapanmayi engelliyor" diye gosteriyor, Restart Manager da sonsuza kadar
    /// beklemiyor. Arayuz cevap vermezse (cokmus sayfa) kaydi birakip cikiyoruz;
    /// kayip en fazla son periyodik kayittan bu yana (iki dakika). Olculen kayit
    /// 6-14 ms (pencere acik ya da gizli, gelistirme ve surum yapisi); gercek
    /// `RmShutdown` 87 ms'de dondu.
    const FLUSH_TIMEOUT: Duration = Duration::from_secs(3);

    /// Kayit istendi (olay gitti) ve henuz iptal edilmedi.
    static REQUESTED: AtomicBool = AtomicBool::new(false);

    /// Kapanis bir kez: ic ice gelen ikinci bir istek yeniden baslatmasin.
    static ENDING: AtomicBool = AtomicBool::new(false);

    /// tao'nun ileti penceresinin sinif adi (tao `create_event_target_window`).
    const TAO_TARGET_CLASS: &str = "Tao Thread Event Target";

    /// `SetWindowSubclass` kimligi; yalnizca bizim alt sinifimizi ayirt ediyor.
    const SUBCLASS_ID: usize = 0x4E54_4553; // "NTES"

    /// Alt sinifin bildirdigi oturum sonu asamalari.
    #[derive(Debug, Clone, Copy, PartialEq, Eq)]
    pub enum Stage {
        /// `WM_QUERYENDSESSION`: kapanis soruluyor. Yanit tao'nun (evet); burada
        /// kayit yalnizca BASLATILIYOR. Oturum kapanirken WebView2 surecleri de
        /// `WM_ENDSESSION` aliyor ve bizden once kapanabilir; soru asamasinda ise
        /// herkes hala ayakta.
        Query,
        /// `WM_ENDSESSION(FALSE)`: kapanis iptal edildi (baska bir uygulama
        /// engelledi). tao'ya da gidiyor, o bu durumda bir sey yapmiyor.
        Cancelled,
        /// `WM_ENDSESSION(TRUE)`: kapaniyoruz. tao'ya ILETILMIYOR.
        End,
    }

    /// Arayuzden son kaydi ister; beklemiyor.
    pub fn request_flush<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
        FLUSHED.store(false, Ordering::SeqCst);
        let sent = app.emit(EVENT, ()).is_ok();
        REQUESTED.store(sent, Ordering::SeqCst);
    }

    /// Kapanis iptal: sonraki istek kaydi yeniden baslatmali.
    pub fn cancel() {
        REQUESTED.store(false, Ordering::SeqCst);
    }

    /// Duzgun kapanis. Ana is parcaciginda, `WM_ENDSESSION`in icinden cagriliyor
    /// ve DONMUYOR: surec burada bitiyor.
    ///
    /// 1. Arayuzun kaydini bekle (`FLUSH_TIMEOUT`). Soru asamasinda istenmediyse
    ///    simdi iste. Tamamlanmis bir kayit yeniden istenmiyor: soru ile son
    ///    arasi milisaniyeler ve o arada WebView2 kapanmis olabilir.
    /// 2. Kabuklari kapat: `Destroyed` kancasindaki `kill_all` ile ayni; ConPTY
    ///    kapaninca torunlar da gidiyor (bkz. pty_tests.rs `kapanis`).
    /// 3. `cleanup_before_exit`: tepsi simgesini kaldiriyor (olculdu: tepsinin
    ///    penceresi burada yok ediliyor, `NIM_DELETE` hatasiz), pencereyi
    ///    gizliyor. Tepsideki "Cikis"in sonunda Tauri'nin yaptigi da bu.
    /// 4. Cik. Restart Manager bunu bekliyor; oturum kapanirken de Windows sureci
    ///    birazdan kendisi sonlandiracakti.
    ///
    /// Burada panik OLMAMALI: surum yapisinda panik abort, yani duzeltilen
    /// belirtinin kendisi. Hicbir adimda `unwrap` yok.
    pub fn end<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
        if ENDING.swap(true, Ordering::SeqCst) {
            return;
        }
        let started = Instant::now();
        if !REQUESTED.load(Ordering::SeqCst) {
            request_flush(app);
        }
        let flushed = REQUESTED.load(Ordering::SeqCst)
            && pump_until(started + FLUSH_TIMEOUT, || FLUSHED.load(Ordering::SeqCst));
        eprintln!(
            "[nterminal] oturum sonu: arayuz kaydi {} ({} ms)",
            if flushed { "tamam" } else { "bitmedi" },
            started.elapsed().as_millis()
        );

        if let Some(state) = app.try_state::<crate::AppState>() {
            state.pty.kill_all();
        }
        app.cleanup_before_exit();
        std::process::exit(0);
    }

    /// Iletileri isler; `done` dogru olunca `true`, `deadline` gecince `false`.
    ///
    /// `WM_ENDSESSION`in icinden cagriliyor ve dis dongu (tao) biz donene kadar
    /// bekliyor: arayuzun IPC istekleri (WebView2 geri cagrilari) ve Tauri
    /// iletileri yalnizca burada islenebiliyor. tao ic ice donguyu taniyor;
    /// pencere surukleme ve menuler de ayni sekilde calisiyor.
    pub fn pump_until(deadline: Instant, done: impl Fn() -> bool) -> bool {
        let mut msg = win::Msg::default();
        loop {
            if done() {
                return true;
            }
            // SAFETY: `msg` bu is parcaciginin yigininda; PeekMessageW onu
            // dolduruyor, ardindan ayni ileti ceviriliyor ve dagitiliyor.
            while unsafe { win::PeekMessageW(&mut msg, null_mut(), 0, 0, win::PM_REMOVE) } != 0 {
                if msg.message == win::WM_QUIT {
                    // Dis donguye ait bir cikis: geri koy, o da gorsun.
                    // SAFETY: yalnizca bu is parcaciginin kuyruguna yaziyor.
                    unsafe { win::PostQuitMessage(msg.wparam as i32) };
                    return done();
                }
                // SAFETY: `msg` az once PeekMessageW'den geldi.
                unsafe {
                    win::TranslateMessage(&msg);
                    win::DispatchMessageW(&msg);
                }
                if done() {
                    return true;
                }
                // Surekli ileti gelse de (PTY ciktisi) sure asilmamali.
                if Instant::now() >= deadline {
                    return false;
                }
            }
            let left = deadline.saturating_duration_since(Instant::now());
            if left.is_zero() {
                return done();
            }
            let ms = u32::try_from(left.as_millis()).unwrap_or(u32::MAX - 1).max(1);
            // SAFETY: tutamak dizisi yok (sayi 0); yalnizca kuyruga ileti gelmesini
            // ya da surenin dolmasini bekliyor.
            unsafe {
                win::MsgWaitForMultipleObjectsEx(0, null(), ms, win::QS_ALLINPUT, win::MWMO_INPUTAVAILABLE)
            };
        }
    }

    /// Bu is parcacigindaki tao ileti penceresi.
    pub fn find_tao_target() -> Option<win::Hwnd> {
        unsafe extern "system" fn each(hwnd: win::Hwnd, found: isize) -> i32 {
            let mut name = [0u16; 64];
            // SAFETY: `name` yazilabilir ve boyu dogru verildi.
            let len = unsafe { win::GetClassNameW(hwnd, name.as_mut_ptr(), name.len() as i32) };
            if len > 0 && String::from_utf16_lossy(&name[..len as usize]) == TAO_TARGET_CLASS {
                // SAFETY: `found` asagidaki `target`in adresi; numaralandirma
                // surerken yasiyor.
                unsafe { *(found as *mut win::Hwnd) = hwnd };
                return 0; // bulundu, dur
            }
            1
        }
        let mut target: win::Hwnd = null_mut();
        // SAFETY: geri cagri yalnizca `target`e yaziyor ve EnumThreadWindows
        // donmeden bitiyor.
        unsafe {
            win::EnumThreadWindows(win::GetCurrentThreadId(), each, &mut target as *mut win::Hwnd as isize)
        };
        (!target.is_null()).then_some(target)
    }

    /// `on_stage`i tao'nun bu is parcacigindaki ileti penceresine baglar.
    pub fn intercept(on_stage: impl Fn(Stage) + 'static) -> bool {
        match find_tao_target() {
            Some(hwnd) => intercept_window(hwnd, on_stage),
            None => false,
        }
    }

    /// `hwnd`e gelen oturum sonu iletilerini `on_stage`e bildirir.
    /// `WM_ENDSESSION(TRUE)` pencerenin kendi yordamina (tao) GITMIYOR; soru ve
    /// iptal ile geri kalan her ileti oldugu gibi geciyor.
    ///
    /// Alt sinif, pencereyi olusturan is parcacigindan ve pencerenin kendi
    /// alt siniflarindan SONRA takilmali; o zaman ilk o calisiyor.
    pub fn intercept_window(hwnd: win::Hwnd, on_stage: impl Fn(Stage) + 'static) -> bool {
        let hook: Box<Hook> = Box::new(Box::new(on_stage));
        let data = Box::into_raw(hook);
        // SAFETY: `data` pencere yok olana kadar yasiyor; `WM_NCDESTROY`de
        // alt sinifla birlikte birakiliyor.
        let ok = unsafe { win::SetWindowSubclass(hwnd, subclass_proc, SUBCLASS_ID, data as usize) } != 0;
        if !ok {
            // SAFETY: takilamadi, kimse `data`yi tutmuyor.
            drop(unsafe { Box::from_raw(data) });
        }
        ok
    }

    type Hook = Box<dyn Fn(Stage)>;

    /// Kancayi cagirir. Panik FFI sinirindan gecemez; gecseydi sonuc yine
    /// abort olurdu.
    fn notify(data: usize, stage: Stage) {
        // SAFETY: `data` `intercept_window`in kutusu; pencere yasadikca gecerli.
        let hook = unsafe { &*(data as *const Hook) };
        let _ = catch_unwind(AssertUnwindSafe(|| hook(stage)));
    }

    unsafe extern "system" fn subclass_proc(
        hwnd: win::Hwnd,
        msg: u32,
        wparam: usize,
        lparam: isize,
        id: usize,
        data: usize,
    ) -> isize {
        match msg {
            win::WM_QUERYENDSESSION => {
                notify(data, Stage::Query);
                // SAFETY: zincirdeki bir sonraki yordama (tao) aynen iletiliyor.
                unsafe { win::DefSubclassProc(hwnd, msg, wparam, lparam) }
            }
            win::WM_ENDSESSION if wparam == 0 => {
                notify(data, Stage::Cancelled);
                // SAFETY: yukaridaki gibi.
                unsafe { win::DefSubclassProc(hwnd, msg, wparam, lparam) }
            }
            win::WM_ENDSESSION => {
                notify(data, Stage::End);
                0
            }
            win::WM_NCDESTROY => {
                // SAFETY: pencere yok oluyor; alt sinif cikariliyor ve kutu bir kez
                // birakiliyor.
                unsafe {
                    win::RemoveWindowSubclass(hwnd, subclass_proc, id);
                    drop(Box::from_raw(data as *mut Hook));
                    win::DefSubclassProc(hwnd, msg, wparam, lparam)
                }
            }
            // SAFETY: zincirdeki bir sonraki yordama (tao) aynen iletiliyor.
            _ => unsafe { win::DefSubclassProc(hwnd, msg, wparam, lparam) },
        }
    }

    pub mod win {
        use std::ffi::c_void;

        pub type Hwnd = *mut c_void;
        pub type Handle = *mut c_void;
        pub type SubclassProc = unsafe extern "system" fn(Hwnd, u32, usize, isize, usize, usize) -> isize;
        pub type EnumProc = unsafe extern "system" fn(Hwnd, isize) -> i32;

        pub const WM_QUERYENDSESSION: u32 = 0x0011;
        pub const WM_QUIT: u32 = 0x0012;
        pub const WM_ENDSESSION: u32 = 0x0016;
        pub const WM_NCDESTROY: u32 = 0x0082;
        pub const PM_REMOVE: u32 = 0x0001;
        pub const QS_ALLINPUT: u32 = 0x04FF;
        pub const MWMO_INPUTAVAILABLE: u32 = 0x0004;

        #[repr(C)]
        #[derive(Default)]
        pub struct Point {
            pub x: i32,
            pub y: i32,
        }

        #[repr(C)]
        pub struct Msg {
            pub hwnd: Hwnd,
            pub message: u32,
            pub wparam: usize,
            pub lparam: isize,
            pub time: u32,
            pub pt: Point,
            pub private: u32,
        }

        impl Default for Msg {
            fn default() -> Self {
                Msg {
                    hwnd: std::ptr::null_mut(),
                    message: 0,
                    wparam: 0,
                    lparam: 0,
                    time: 0,
                    pt: Point::default(),
                    private: 0,
                }
            }
        }

        #[link(name = "comctl32")]
        unsafe extern "system" {
            pub fn SetWindowSubclass(hwnd: Hwnd, proc_: SubclassProc, id: usize, data: usize) -> i32;
            pub fn RemoveWindowSubclass(hwnd: Hwnd, proc_: SubclassProc, id: usize) -> i32;
            pub fn DefSubclassProc(hwnd: Hwnd, msg: u32, wparam: usize, lparam: isize) -> isize;
        }

        #[link(name = "user32")]
        unsafe extern "system" {
            pub fn EnumThreadWindows(thread: u32, f: EnumProc, lparam: isize) -> i32;
            pub fn GetClassNameW(hwnd: Hwnd, name: *mut u16, max: i32) -> i32;
            pub fn PeekMessageW(msg: *mut Msg, hwnd: Hwnd, min: u32, max: u32, remove: u32) -> i32;
            pub fn TranslateMessage(msg: *const Msg) -> i32;
            pub fn DispatchMessageW(msg: *const Msg) -> isize;
            pub fn PostQuitMessage(code: i32);
            pub fn MsgWaitForMultipleObjectsEx(
                count: u32,
                handles: *const Handle,
                milliseconds: u32,
                wake: u32,
                flags: u32,
            ) -> u32;
        }

        #[link(name = "kernel32")]
        unsafe extern "system" {
            pub fn GetCurrentThreadId() -> u32;
        }
    }
}

#[cfg(all(test, windows))]
#[path = "session_end_tests.rs"]
mod tests;
