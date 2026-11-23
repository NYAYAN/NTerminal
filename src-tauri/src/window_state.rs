//! Ana pencerenin boyutu, yeri ve buyutulmus olup olmadigi - kapanistan
//! acilisa.
//!
//! BILDIRILEN: "her pc'yi actigimda terminal farkli boyutta geliyor." Pencere
//! hicbir sey hatirlamiyordu: her acilista `tauri.conf.json`daki 1480x920 ile
//! ekranin ortasinda, sigmazsa `preventOverflow` ile kucultulerek aciliyordu.
//! Hangi ekranin bagli oldugu ve olcekleme (Windows'ta %125 / %150) her acilista
//! baska bir boyut veriyordu; kullanicinin biraktigi boyut ise hic gelmiyordu.
//!
//! Kayit veri klasorunde (`window.json`), ayarlarin yaninda: tasinabilir kopya
//! ve yalitilmis ornek (`NTERMINAL_DATA_DIR`) kullanicinin penceresini ezmesin.
//!
//! Degerler FIZIKSEL piksel: Tauri'nin konum ve boyut olaylari oyle geliyor.
//! Acilista kayit bugunku ekranlara gore yerlestiriliyor (`placement`): ekran
//! artik yoksa (dizustunden harici ekran cikarildi) pencere ana ekrana
//! sigdirilip ortalaniyor - ekranin disinda ya da ekrandan buyuk acilmiyor.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{PhysicalPosition, PhysicalSize, Runtime, WebviewWindow, WindowEvent};

/// Kayit dosyasinin adi (veri klasorunde).
pub const FILE: &str = "window.json";

/// Pencerenin en kucuk boyutu - `tauri.conf.json`daki `minWidth` / `minHeight`
/// (mantiksal; olcekle carpiliyor).
const MIN_LOGICAL: (f64, f64) = (760.0, 460.0);

/// Tasima ve boyutlandirma surerken diske yazmak icin beklenen sessizlik.
const QUIET: Duration = Duration::from_millis(500);

/// Kaydedilen pencere: buyutulmemis haldeki kutu ve buyutulmus mu.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Bounds {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    #[serde(default)]
    pub maximized: bool,
}

/// Bir ekranin calisma alani (gorev cubugu ve menu cubugu disinda kalan yer).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Area {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

impl Area {
    fn right(&self) -> i64 {
        self.x as i64 + self.width as i64
    }
    fn bottom(&self) -> i64 {
        self.y as i64 + self.height as i64
    }
    fn contains(&self, x: i64, y: i64) -> bool {
        x >= self.x as i64 && x < self.right() && y >= self.y as i64 && y < self.bottom()
    }
    fn overlap(&self, b: &Bounds) -> i64 {
        let w = (self.right().min(b.x as i64 + b.width as i64) - (self.x as i64).max(b.x as i64)).max(0);
        let h = (self.bottom().min(b.y as i64 + b.height as i64) - (self.y as i64).max(b.y as i64)).max(0);
        w * h
    }
}

/// Kaydin bugunku ekranlardaki yeri.
///
/// Hangi ekran: pencerenin ORTASI hangisindeyse; hicbirinde degilse en cok
/// ortustugu ekran. Ikisi de yoksa (o ekran artik bagli degil) `primary` ve
/// pencere orada ortalaniyor. Boyut ekranin calisma alanina sigdiriliyor
/// (`min` altina inmeden), konum da pencere tumuyle ekranda kalacak sekilde
/// iciye cekiliyor: basligi ekranin disinda kalan pencere tutulup
/// tasinamazdi.
///
/// Ekran listesi bossa (okunamadi) `None`: pencere oldugu gibi kaliyor.
pub fn placement(saved: Bounds, monitors: &[Area], primary: usize, min: (u32, u32)) -> Option<Bounds> {
    if monitors.is_empty() {
        return None;
    }
    let cx = saved.x as i64 + saved.width as i64 / 2;
    let cy = saved.y as i64 + saved.height as i64 / 2;
    let found = monitors
        .iter()
        .position(|m| m.contains(cx, cy))
        .or_else(|| {
            monitors
                .iter()
                .enumerate()
                .map(|(i, m)| (i, m.overlap(&saved)))
                .filter(|(_, area)| *area > 0)
                .max_by_key(|(_, area)| *area)
                .map(|(i, _)| i)
        });
    let area = monitors[found.unwrap_or(primary.min(monitors.len() - 1))];

    let width = saved.width.max(min.0).min(area.width.max(min.0));
    let height = saved.height.max(min.1).min(area.height.max(min.1));
    let (x, y) = if found.is_some() {
        let max_x = (area.right() - width as i64).max(area.x as i64);
        let max_y = (area.bottom() - height as i64).max(area.y as i64);
        (
            (saved.x as i64).clamp(area.x as i64, max_x) as i32,
            (saved.y as i64).clamp(area.y as i64, max_y) as i32,
        )
    } else {
        (
            (area.x as i64 + (area.width as i64 - width as i64) / 2) as i32,
            (area.y as i64 + (area.height as i64 - height as i64) / 2) as i32,
        )
    };
    Some(Bounds { x, y, width, height, maximized: saved.maximized })
}

/// Okunamayan ya da bozuk dosya: kayit yok, pencere varsayilaniyla aciliyor.
pub fn load(path: &std::path::Path) -> Option<Bounds> {
    let text = std::fs::read_to_string(path).ok()?;
    let bounds: Bounds = serde_json::from_str(&text).ok()?;
    (bounds.width > 0 && bounds.height > 0).then_some(bounds)
}

fn save(path: &std::path::Path, bounds: &Bounds) {
    if let Ok(text) = serde_json::to_string_pretty(bounds) {
        // Yarim yazilmis dosya acilista bozuk sayiliyor ve varsayilana
        // donuluyor; gecici dosya + yeniden adlandirma onu da onluyor.
        let tmp = path.with_extension("json.tmp");
        if std::fs::write(&tmp, text).is_ok() {
            let _ = std::fs::rename(&tmp, path);
        }
    }
}

fn monitor_areas<R: Runtime>(window: &WebviewWindow<R>) -> (Vec<Area>, usize) {
    let monitors = window.available_monitors().unwrap_or_default();
    let primary = window.primary_monitor().ok().flatten();
    let areas: Vec<Area> = monitors
        .iter()
        .map(|m| {
            let r = m.work_area();
            Area { x: r.position.x, y: r.position.y, width: r.size.width, height: r.size.height }
        })
        .collect();
    let primary_index = primary
        .and_then(|p| monitors.iter().position(|m| m.position() == p.position() && m.size() == p.size()))
        .unwrap_or(0);
    (areas, primary_index)
}

/// Kaydedilmis boyutu ve yeri ana pencereye uygular. Acilista, pencere ilk
/// kez cizilmeden once (`setup`).
pub fn restore<R: Runtime>(window: &WebviewWindow<R>, path: &std::path::Path) {
    let Some(saved) = load(path) else { return };
    let (areas, primary) = monitor_areas(window);
    let scale = window.scale_factor().unwrap_or(1.0);
    let min = ((MIN_LOGICAL.0 * scale).round() as u32, (MIN_LOGICAL.1 * scale).round() as u32);
    let Some(target) = placement(saved, &areas, primary, min) else { return };
    let _ = window.set_size(PhysicalSize::new(target.width, target.height));
    let _ = window.set_position(PhysicalPosition::new(target.x, target.y));
    if target.maximized {
        let _ = window.maximize();
    }
}

/// Pencerenin o anki hali; buyutulmus, simge durumunda ya da tam ekranken
/// kutu kaydedilmiyor (geri donulecek boyut o degil), yalnizca bayrak.
fn current<R: Runtime>(window: &WebviewWindow<R>, last: Option<Bounds>) -> Option<Bounds> {
    if window.is_minimized().unwrap_or(false) || window.is_fullscreen().unwrap_or(false) {
        return last;
    }
    let maximized = window.is_maximized().unwrap_or(false);
    if maximized {
        return last.map(|b| Bounds { maximized: true, ..b });
    }
    let pos = window.outer_position().ok()?;
    let size = window.inner_size().ok()?;
    if size.width == 0 || size.height == 0 {
        return last;
    }
    Some(Bounds { x: pos.x, y: pos.y, width: size.width, height: size.height, maximized: false })
}

/// Ana pencerenin olaylarini izleyen kayitci.
///
/// Tasirken ve boyutlandirirken olaylar art arda geliyor: diske her birinde
/// degil, `QUIET` kadar sessizlikten sonra bir kez yaziliyor (tek bir arka
/// plan is parcacigi). Kapatma istegi ve yikimda hemen yaziliyor - bilgisayar
/// kapanirken surec beklemeden sonlandirilabiliyor.
#[derive(Clone)]
pub struct Recorder {
    path: PathBuf,
    state: Arc<Mutex<(Option<Bounds>, Instant)>>,
    writer: Arc<AtomicBool>,
}

impl Recorder {
    pub fn new(path: PathBuf) -> Self {
        let last = load(&path);
        Self { path, state: Arc::new(Mutex::new((last, Instant::now()))), writer: Arc::new(AtomicBool::new(false)) }
    }

    pub fn on_event<R: Runtime>(&self, window: &WebviewWindow<R>, event: &WindowEvent) {
        match event {
            WindowEvent::Moved(_) | WindowEvent::Resized(_) => {
                let mut state = self.state.lock().unwrap();
                let Some(now) = current(window, state.0) else { return };
                if state.0 == Some(now) {
                    return;
                }
                *state = (Some(now), Instant::now());
                drop(state);
                self.schedule();
            }
            WindowEvent::CloseRequested { .. } => {
                let mut state = self.state.lock().unwrap();
                if let Some(now) = current(window, state.0) {
                    state.0 = Some(now);
                }
                if let Some(bounds) = state.0 {
                    save(&self.path, &bounds);
                }
            }
            WindowEvent::Destroyed => {
                if let Some(bounds) = self.state.lock().unwrap().0 {
                    save(&self.path, &bounds);
                }
            }
            _ => {}
        }
    }

    fn schedule(&self) {
        if self.writer.swap(true, Ordering::SeqCst) {
            return;
        }
        let this = self.clone();
        let spawned = std::thread::Builder::new().name("nterm-window-state".into()).spawn(move || loop {
            std::thread::sleep(QUIET);
            let state = this.state.lock().unwrap();
            if state.1.elapsed() < QUIET {
                continue;
            }
            if let Some(bounds) = state.0 {
                save(&this.path, &bounds);
            }
            this.writer.store(false, Ordering::SeqCst);
            break;
        });
        if spawned.is_err() {
            self.writer.store(false, Ordering::SeqCst);
        }
    }
}

#[cfg(test)]
#[path = "window_state_tests.rs"]
mod tests;
