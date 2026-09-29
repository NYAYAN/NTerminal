//! Menu cubugu (macOS) / bildirim alani (Windows) simgesi.
//!
//! Uygulama pencere kapansa da yasayabiliyor: uzun suren bir islem calisirken
//! pencereyi kaldirmak, sonra geri cagirmak. O yuzden HER ZAMAN bir simge
//! duruyor - "arka planda calisiyor ama geri donus yolu yok" durumu
//! olusmasin diye.
//!
//! Menu metinleri burada, Rust tarafinda: simge arayuz cizilmeden once
//! kuruluyor ve isletim sistemi ciziyor, `i18n.ts` sozlugune erisimi yok.
//! Ikilinin ayrilmamasi icin metinler `messages.ts` ile ayni dizeleri
//! kullaniyor ve `trayLabels.test.ts` ikisini bagliyor.

use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Manager,
};

// Yalnizca sol tik davranisinin kuruldugu platformlarda kullaniliyor.
#[cfg(not(target_os = "macos"))]
use tauri::tray::{MouseButton, MouseButtonState, TrayIconEvent};

/// macOS menu cubugu icin tek renkli (template) isaret.
///
/// Renkli uygulama simgesi menu cubuginda yanlis duruyor: sistem simgeleri
/// tek renk ve koyu/acik temaya gore otomatik donuyor. `icon_as_template`
/// yalnizca siyah + saydam bir goruntuyle dogru calisiyor.
#[cfg(target_os = "macos")]
const TRAY_ICON: &[u8] = include_bytes!("../icons/tray-mac@2x.png");

/// Windows bildirim alani ve Linux: renkli uygulama simgesi.
#[cfg(not(target_os = "macos"))]
const TRAY_ICON: &[u8] = include_bytes!("../icons/32x32.png");

fn label_show(lang: &str) -> &'static str {
    if lang == "en" {
        "Show N-Terminal"
    } else {
        "N-Terminal'i göster"
    }
}

fn label_quit(lang: &str) -> &'static str {
    if lang == "en" {
        "Quit"
    } else {
        "Çıkış"
    }
}

/// Ana pencereyi gorunur yapip one getirir.
///
/// Uc adim da gerekli: gizlenmis pencere `show` olmadan gorunmuyor,
/// simge durumundaki pencere `unminimize` olmadan acilmiyor, ve ikisi de
/// olsa odak baska uygulamada kalabiliyor.
pub fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// Menu metinlerini degistirir.
///
/// Dil ayardan degisince cagriliyor. Yeniden kurmak sart: `MenuItem` metni
/// olusturulduktan sonra degistirilemiyor, menu bastan yaratiliyor.
pub fn set_labels(app: &AppHandle, show: &str, quit: &str) -> tauri::Result<()> {
    let show_item = MenuItem::with_id(app, "tray-show", show, true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "tray-quit", quit, true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_item, &quit_item])?;
    if let Some(tray) = app.tray_by_id("nterminal") {
        tray.set_menu(Some(menu))?;
    }
    Ok(())
}

/// Simgeyi kurar. Uygulama acilisinda bir kez cagriliyor.
pub fn setup(app: &AppHandle, lang: &str) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "tray-show", label_show(lang), true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "tray-quit", label_quit(lang), true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;

    let builder = TrayIconBuilder::with_id("nterminal")
        .icon(Image::from_bytes(TRAY_ICON)?)
        .tooltip("N-Terminal")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "tray-show" => show_main(app),
            // Cikis simgeden geliyor, yani pencere gizli olabilir. `exit`
            // pencereleri YIKMIYOR - Tauri cikista onlari yalnizca gizliyor
            // (`cleanup_before_exit`) - yani `Destroyed` kancasi burada
            // kosmuyor. Kabuklar yine de arkada kalmiyor: surec bitince
            // ConPTY'ler kapaniyor ve icindeki surecler, torunlar dahil,
            // sonlaniyor. Windows'ta olculdu, bkz. pty_tests.rs `kapanis`.
            "tray-quit" => app.exit(0),
            _ => {}
        });

    // Sol tikla menu: macOS'ta menu cubugu simgelerinin beklenen davranisi bu.
    // Windows'ta sol tik pencereyi acip kapatiyor (asagidaki olay), menuye sag
    // tikla ulasiliyor - o platformun aliskanligi da bu.
    #[cfg(target_os = "macos")]
    let builder = builder.icon_as_template(true).show_menu_on_left_click(true);
    #[cfg(not(target_os = "macos"))]
    let builder = builder.show_menu_on_left_click(false).on_tray_icon_event(|tray, event| {
        if let TrayIconEvent::Click { button, button_state, .. } = event {
            if button == MouseButton::Left && button_state == MouseButtonState::Up {
                show_main(tray.app_handle());
            }
        }
    });

    builder.build(app)?;
    Ok(())
}
