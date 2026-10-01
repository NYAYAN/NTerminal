//! Oturum sonu yakalamasi GERCEK tao dongusuyle sinaniyor: Tauri'nin kullandigi
//! surum (`tauri_runtime_wry::tao`), yani Tauri guncellenince testler de onu
//! sinar.
//!
//! Istek Restart Manager'in yaptigi gibi gidiyor: BASKA bir is parcacigindan,
//! yanit beklenerek (`SendMessageTimeoutW`). Dongu o sirada GetMessageW'de
//! bekliyor ve ileti tao'nun penceresine orada teslim ediliyor.

use super::*;
use parking_lot::Mutex;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri_runtime_wry::tao;
use tao::event::Event;
use tao::event_loop::{ControlFlow, EventLoop, EventLoopBuilder};
use tao::platform::run_return::EventLoopExtRunReturn;
use tao::platform::windows::EventLoopBuilderExtWindows;

const ENDSESSION_CLOSEAPP: isize = 0x1;
const SMTO_BLOCK: u32 = 0x1;
const WM_NULL: u32 = 0x0000;

#[link(name = "user32")]
unsafe extern "system" {
    fn SendMessageTimeoutW(
        hwnd: win::Hwnd,
        msg: u32,
        wparam: usize,
        lparam: isize,
        flags: u32,
        timeout: u32,
        result: *mut usize,
    ) -> isize;
    fn PostThreadMessageW(thread: u32, msg: u32, wparam: usize, lparam: isize) -> i32;
}

/// tao testleri sirayla: iki dongu ayni anda da calisabilir ama ham girdi
/// kaydi gibi surec capinda ayarlari var, birbirine karismasinlar.
static DONGU: Mutex<()> = Mutex::new(());

/// Test is parcacigina bagli tao dongusu. cargo testleri ana is parcaciginda
/// kosmuyor; tao buna ancak `any_thread` ile izin veriyor.
fn dongu() -> EventLoop<u32> {
    let mut builder = EventLoopBuilder::<u32>::with_user_event();
    builder.with_any_thread(true);
    builder.build()
}

fn tao_hedefi() -> win::Hwnd {
    find_tao_target().expect("tao'nun ileti penceresi bulunamadi; sinif adi degismis olabilir")
}

/// Restart Manager gibi: baska is parcacigindan, yanit bekleyerek. Teslim
/// edildiyse pencerenin yaniti.
fn gonder(hwnd: usize, msg: u32, wparam: usize) -> Option<usize> {
    let mut sonuc = 0usize;
    // SAFETY: `hwnd` test dongusunun penceresi, ileti yalnizca ona gidiyor.
    let ok = unsafe {
        SendMessageTimeoutW(
            hwnd as win::Hwnd,
            msg,
            wparam,
            ENDSESSION_CLOSEAPP,
            SMTO_BLOCK,
            10_000,
            &mut sonuc,
        )
    } != 0;
    ok.then_some(sonuc)
}

#[test]
fn restart_manager_istegi_tao_dongusunu_dusurmuyor() {
    // Bildirilen cokmenin kendisi. Yakalama olmadan tao `WM_ENDSESSION`i
    // aliyor, dongu `Destroyed` oluyor ve istekten sonra gelen ilk kullanici
    // olayi "cannot move state from Destroyed" ile panikliyor; surum yapisinda
    // bu panik abort, yani `0xc0000409`. Yakalama kaldirilinca bu test o
    // iletiyle dusuyor (denendi).
    let _sira = DONGU.lock();
    let mut event_loop = dongu();
    let hedef = tao_hedefi();
    let asamalar = Arc::new(Mutex::new(Vec::new()));
    let kayit = asamalar.clone();
    assert!(intercept_window(hedef, move |asama| kayit.lock().push(asama)));

    let proxy = event_loop.create_proxy();
    let hwnd = hedef as usize;
    let gonderen = std::thread::spawn(move || {
        // Restart Manager'in sirasi: once soru, sonra karar. Araya iptal edilmis
        // bir kapanis (wParam FALSE) da koyuyoruz; o tao'ya gitmeli.
        let soru = gonder(hwnd, win::WM_QUERYENDSESSION, 0);
        let iptal = gonder(hwnd, win::WM_ENDSESSION, 0);
        let son = gonder(hwnd, win::WM_ENDSESSION, 1);
        // Uretimde panige yol acan sey: istekten SONRA gelen ilk Tauri iletisi
        // (IPC yaniti, PTY ciktisi).
        let _ = proxy.send_event(1);
        (soru, iptal, son)
    });

    let mut cikis_istendi = false;
    let mut erken_yikim = false;
    event_loop.run_return(|event, _, control_flow| {
        *control_flow = ControlFlow::Wait;
        match event {
            Event::UserEvent(1) => {
                cikis_istendi = true;
                *control_flow = ControlFlow::Exit;
            }
            // Cikis istenmeden gelen yikim: iletiyi tao islemis demek.
            Event::LoopDestroyed if !cikis_istendi => erken_yikim = true,
            _ => {}
        }
    });

    let (soru, iptal, son) = gonderen.join().expect("gonderen is parcacigi dustu");
    assert!(iptal.is_some() && son.is_some(), "iletiler teslim edilemedi");
    // Hayir (0) kurulumu ya da oturum kapatmayi engellerdi.
    assert_eq!(soru, Some(1), "WM_QUERYENDSESSION evet denmedi");
    assert!(!erken_yikim, "tao dongusu istekle yikildi: iletiyi once tao aldi");
    assert_eq!(*asamalar.lock(), vec![Stage::Query, Stage::Cancelled, Stage::End]);
}

#[test]
fn kapanis_beklerken_dongu_iletileri_isliyor() {
    // `end` arayuzun son kaydini WM_ENDSESSION'IN ICINDEN bekliyor. Kayit
    // komutlari ana is parcaciginda kosuyor; bekleme iletileri islemeseydi kayit
    // hic gelmez, her kapanis `FLUSH_TIMEOUT` kadar surer ve kayit yine
    // yapilmamis olurdu.
    let _sira = DONGU.lock();
    let mut event_loop = dongu();
    let hedef = tao_hedefi();
    let proxy = event_loop.create_proxy();
    let islendi = Arc::new(AtomicBool::new(false));
    // 0: kanca calismadi, 1: bekleme olayi gordu, 2: sure doldu.
    let sonuc = Arc::new(AtomicUsize::new(0));
    {
        let islendi = islendi.clone();
        let sonuc = sonuc.clone();
        let proxy = proxy.clone();
        assert!(intercept_window(hedef, move |asama| {
            if asama != Stage::End {
                return;
            }
            // Tauri'nin `emit`i ve IPC yanitlari da boyle: donguye kuyruklaniyor.
            let _ = proxy.send_event(7);
            let tamam = pump_until(Instant::now() + Duration::from_secs(5), || {
                islendi.load(Ordering::SeqCst)
            });
            sonuc.store(if tamam { 1 } else { 2 }, Ordering::SeqCst);
        }));
    }

    let hwnd = hedef as usize;
    let gonderen = std::thread::spawn(move || {
        let son = gonder(hwnd, win::WM_ENDSESSION, 1);
        let _ = proxy.send_event(1);
        son.is_some()
    });

    let islendi_dongu = islendi.clone();
    event_loop.run_return(move |event, _, control_flow| {
        *control_flow = ControlFlow::Wait;
        match event {
            Event::UserEvent(7) => islendi_dongu.store(true, Ordering::SeqCst),
            Event::UserEvent(1) => *control_flow = ControlFlow::Exit,
            _ => {}
        }
    });

    assert!(gonderen.join().expect("gonderen is parcacigi dustu"), "istek teslim edilemedi");
    assert_eq!(
        sonuc.load(Ordering::SeqCst),
        1,
        "kapanis beklerken dongu olaylari islemedi (0: kanca yok, 2: sure doldu)"
    );
}

#[test]
fn arayuz_cevap_vermezse_bekleme_surede_bitiyor() {
    // Cokmus bir sayfa kaydi hic bitirmez; kapanis yine de bitmeli.
    let basla = Instant::now();
    assert!(!pump_until(basla + Duration::from_millis(300), || false));
    let gecen = basla.elapsed();
    assert!(gecen >= Duration::from_millis(300), "sure dolmadan dondu: {gecen:?}");
    assert!(gecen < Duration::from_secs(3), "sure asildi: {gecen:?}");
}

#[test]
fn surekli_ileti_gelse_de_bekleme_surede_bitiyor() {
    // Calisan bir sunucunun PTY ciktisi kuyrugu hic bosaltmayabilir. Kuyruk
    // bosalmadan sureye bakilmasaydi bu dongu hic bitmezdi.
    // SAFETY: yalnizca bu is parcaciginin kuyruguna bos ileti birakiyor.
    let tid = unsafe { win::GetCurrentThreadId() };
    let basla = Instant::now();
    let bitti = pump_until(basla + Duration::from_millis(300), || {
        // SAFETY: yukaridaki gibi.
        unsafe { PostThreadMessageW(tid, WM_NULL, 0, 0) };
        false
    });
    assert!(!bitti);
    assert!(basla.elapsed() < Duration::from_secs(3), "sure asildi: {:?}", basla.elapsed());
}
