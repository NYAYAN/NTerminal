//! Diske yazilan ve arayuzle paylasilan veri modelleri.
//!
//! Tum alanlar serde varsayilanlariyla tanimli: eski bir settings.json veya
//! baska bir makineden gelen .nterminal.json yeni alanlar eklendikten sonra da
//! okunabilsin diye. Surum alanlari gocler (migration) icin ayrilmis.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub const SETTINGS_VERSION: u32 = 1;
pub const WORKSPACE_VERSION: u32 = 1;
pub const BUNDLE_VERSION: u32 = 1;

// ---------------------------------------------------------------- profiller

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ShellKind {
    PowerShell,
    Pwsh,
    Cmd,
    Bash,
    Wsl,
    /// macOS'un varsayilan kabugu (Catalina'dan beri).
    Zsh,
    Fish,
    Custom,
}

impl Default for ShellKind {
    fn default() -> Self {
        // Platforma gore: Windows'ta her kurulumda bulunan kabuk PowerShell,
        // macOS'ta zsh. Bu deger yalnizca eksik/bozuk bir profil okundugunda
        // devreye giriyor ama yanlis platform varsayilani orada da is gormez
        // bir profil uretir.
        #[cfg(windows)]
        return ShellKind::PowerShell;
        #[cfg(not(windows))]
        return ShellKind::Zsh;
    }
}

impl ShellKind {
    /// Kabuk entegrasyonu (OSC 133/633) bu tur icin desteklenir mi?
    ///
    /// `Custom` disinda hepsi destekli. `Fish` bilincli olarak DISARIDA: fish
    /// bash/zsh soz dizimini paylasmiyor, kendi entegrasyon betigi yazilmadan
    /// destekli saymak "acildi ama hicbir sey bildirmiyor" durumuna yol acar -
    /// gecmis, oneri ve cikis kodu sessizce calismaz.
    pub fn supports_integration(self) -> bool {
        !matches!(self, ShellKind::Custom | ShellKind::Fish)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub kind: ShellKind,
    /// Calistirilacak exe. Bos birakilirsa kind uzerinden cozulur.
    #[serde(default)]
    pub shell: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub cwd: Option<String>,
    #[serde(default)]
    pub env: BTreeMap<String, String>,
    #[serde(default = "default_true")]
    pub shell_integration: bool,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub icon: Option<String>,
    /// Ice alma sonrasi doldurulur: exe bu makinede bulunamadi.
    #[serde(default)]
    pub unavailable: bool,
}

fn default_true() -> bool {
    true
}

// ------------------------------------------------------------------ ayarlar

/// Varsayilan tek aralikli yazi tipi yigini.
///
/// Platform basina ayri olmasi SART: Cascadia Mono ve Consolas mac'te YOK,
/// oradaki liste dogrudan jenerik `monospace`'e duserdi - Chromium'un varsayilani
/// ise terminal icin kotu (dar, ligatursuz, satir yuksekligi tutarsiz).
/// Menlo her mac'te var; SF Mono Xcode ile geliyor ve varsa daha iyi.
pub fn default_font_family() -> String {
    #[cfg(target_os = "macos")]
    return "SF Mono, Menlo, Monaco, Courier New, monospace".into();
    #[cfg(not(target_os = "macos"))]
    return "Cascadia Mono, Consolas, Courier New, monospace".into();
}

/// Kapsayici duzeyinde `serde(default)`: eksik alanlar `Default` uygulamasindan
/// dolduruluyor. Bu sart - yeni bir gorunum alani eklendiginde (ornek:
/// panel_width) kullanicinin diskte duran settings.json'i o alani icermiyor,
/// alan bazinda varsayilan olmadan ayristirma tumden dusuyor ve kullanici tum
/// ayarlarini kaybediyor.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Appearance {
    pub font_family: String,
    pub font_size: u16,
    pub line_height: f32,
    pub letter_spacing: f32,
    /// Arayuzde tanimli palet anahtari.
    pub theme: String,
    pub cursor_style: String,
    pub cursor_blink: bool,
    pub scrollback: u32,
    pub sidebar_width: u16,
    /// Sag panelin (gecmis / favoriler) genisligi.
    pub panel_width: u16,
    /// Ciktidaki baglantilari renkli goster.
    ///
    /// Kapatilabilir olmasi bilincli: renklendirme her cizimde gorunur
    /// satirlari tarayip xterm dekorasyonu kaydediyor. Cok yogun cikti
    /// ureten islerde (buyuk derleme kayitlari) bu maliyeti istemeyen
    /// kullanici kapatabilmeli.
    pub highlight_links: bool,
    /// Terminal alani nasil gosterilsin: "tabs" | "panes".
    ///
    /// "tabs" tek terminal, "panes" etkin grubun tum sekmelerini doseyerek
    /// ayni ekranda gosterir.
    pub view_mode: String,
}

impl Default for Appearance {
    fn default() -> Self {
        Self {
            font_family: default_font_family(),
            font_size: 14,
            line_height: 1.2,
            letter_spacing: 0.0,
            theme: "nterminal-dark".into(),
            cursor_style: "bar".into(),
            cursor_blink: true,
            scrollback: 10_000,
            sidebar_width: 240,
            panel_width: 390,
            highlight_links: true,
            view_mode: "tabs".into(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Behavior {
    /// Kapatilirken grup/sekme duzenini geri yukle.
    pub restore_session: bool,
    /// Sekmelerin ekran ciktisini (scrollback) da geri yukle.
    pub restore_scrollback: bool,
    /// Sekme basina kaydedilecek satir sayisi.
    pub scrollback_save_lines: u32,
    /// Sekme kapatilirken onay sor: "always" | "running" | "never".
    ///
    /// Varsayilan "always": kapatma dugmesi kapatma isleminden geri donusu
    /// olmayan tek tiklik bir yol aciyordu. Kilitli sekmeler bu ayardan
    /// bagimsiz olarak hic kapanmiyor - kilit daha guclu koruma.
    pub confirm_close_tab: String,
    pub copy_on_select: bool,
    /// Terminalde sag tik ne yapsin: "menu" | "paste" | "copyPaste".
    ///
    /// Varsayilan "menu". Eskiden sag tik kosulsuz yapistiriyordu; metin secip
    /// kopyalamak isteyen kullanici sag tikladiginda istem satirina panonun
    /// icerigi dokuluyordu. "copyPaste" Windows Terminal davranisi: secim
    /// varsa kopyalar, yoksa yapistirir.
    pub right_click_action: String,
    /// Ctrl+C secim varken kopyalasin. Secim yoksa tus kabuga gecer, yani
    /// SIGINT'i kaybetmiyoruz; kopyalamadan sonra secim temizlendigi icin
    /// ikinci Ctrl+C her zaman kabuga gider.
    pub ctrl_c_copies_selection: bool,
    /// Yeni sekme acilirken aktif sekmenin dizininden basla.
    pub inherit_cwd: bool,
    /// Gecmiste tutulacak azami kayit sayisi (asinca en eskiler silinir).
    pub history_limit: u32,
    /// Gecmis panelinde ayni komutun tekrarlarini tek satirda topla.
    pub history_dedupe: bool,
    /// Kenar cubugunda yalnizca favori gruplari goster.
    pub show_only_favorite_groups: bool,
    /// Uygulama tarafi komut onerisi.
    ///
    /// Kabuk tahmininden (shell_prediction) BAGIMSIZ: o PSReadLine 2.2+
    /// gerektiriyor ve cmd/bash'te karsiligi yok. Bu ise gecmisimizden
    /// besleniyor, her kabukta calisiyor ve yukari/asagi okla seciliyor.
    pub app_suggestions: bool,
    /// Kabuk komut onerisi: "off" | "inline" | "list".
    ///
    /// Kabuga NTERMINAL_PREDICTION ile bildiriliyor; PowerShell tarafinda
    /// PSReadLine tahminini aciyor. "off" = dokunma (kullanicinin kendi
    /// profil ayari gecerli kalsin).
    pub shell_prediction: String,
    /// YALNIZCA macOS: Option tusu Meta gibi davransin.
    ///
    /// Acikken Option+B / Option+F / Option+Backspace kabuga ESC dizisi olarak
    /// gidiyor, yani kelime kelime gezinme calisiyor - Windows'ta Alt'in yaptigi
    /// is. Kapalıyken Option normal karakter uretiyor.
    ///
    /// Varsayilan KAPALI ve bu bilincli: Turkce Mac klavyesinde `@` = Option+Q.
    /// Acik olsa `@` yazilamazdi - terminalde `@angular/cli`, e-posta adresi,
    /// git remote yazmak imkansiz olurdu. Kelime gezinmesi bundan daha az
    /// onemli, ustelik ayardan acilabiliyor.
    pub mac_option_is_meta: bool,
}

impl Default for Behavior {
    fn default() -> Self {
        Self {
            restore_session: true,
            restore_scrollback: true,
            scrollback_save_lines: 2_000,
            confirm_close_tab: "always".into(),
            copy_on_select: true,
            right_click_action: "menu".into(),
            ctrl_c_copies_selection: true,
            inherit_cwd: true,
            history_limit: 50_000,
            history_dedupe: false,
            show_only_favorite_groups: false,
            mac_option_is_meta: false,
            app_suggestions: true,
            shell_prediction: "list".into(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    #[serde(default = "settings_version")]
    pub version: u32,
    #[serde(default)]
    pub appearance: Appearance,
    #[serde(default)]
    pub behavior: Behavior,
    #[serde(default)]
    pub profiles: Vec<Profile>,
    #[serde(default)]
    pub default_profile_id: String,
    /// Eylem adi -> kisayol ("newTab" -> "Ctrl+T").
    #[serde(default)]
    pub keybindings: BTreeMap<String, String>,
    /// Arayuz dili: "tr" | "en". Bilinmeyen deger arayuzde "tr" sayiliyor.
    #[serde(default = "default_language")]
    pub language: String,
}

fn default_language() -> String {
    "tr".into()
}

fn settings_version() -> u32 {
    SETTINGS_VERSION
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            version: SETTINGS_VERSION,
            appearance: Appearance::default(),
            behavior: Behavior::default(),
            profiles: Vec::new(),
            default_profile_id: String::new(),
            keybindings: default_keybindings(),
            language: default_language(),
        }
    }
}

/// Varsayilan kisayollar.
///
/// macOS'ta Cmd, Windows'ta Ctrl. Bu kozmetik bir tercih degil: Cmd+T / Cmd+W /
/// Cmd+C mac'te isletim sistemi genelinde beklenen tuslar, Ctrl ise terminalin
/// KENDI tusu (Ctrl+C = SIGINT, Ctrl+D = EOF, Ctrl+R = ters arama). Mac'te
/// Ctrl'u arayuz kisayoluna baglamak kabugun kendi tuslarini yer.
///
/// Bu yuzden mac tarafinda kopyala/yapistir da Shift'siz: Cmd+C ile SIGINT
/// carpismasi yok, Windows'ta oldugu gibi secim-varsa-kopyala numarasina
/// gerek kalmiyor.
pub fn default_keybindings() -> BTreeMap<String, String> {
    #[cfg(not(target_os = "macos"))]
    let pairs = [
        ("newTab", "Ctrl+T"),
        ("closeTab", "Ctrl+W"),
        ("nextTab", "Ctrl+Tab"),
        ("prevTab", "Ctrl+Shift+Tab"),
        ("newGroup", "Ctrl+Shift+N"),
        ("commandPalette", "Ctrl+Shift+P"),
        ("historyPanel", "Ctrl+Shift+H"),
        ("historySearch", "Ctrl+R"),
        ("favorites", "Ctrl+Shift+B"),
        ("settings", "Ctrl+,"),
        ("renameTab", "Ctrl+Shift+R"),
        ("toggleLock", "Ctrl+Shift+L"),
        ("toggleViewMode", "Ctrl+Shift+E"),
        ("clearTerminal", "Ctrl+Shift+K"),
        ("findInTerminal", "Ctrl+Shift+F"),
        ("copy", "Ctrl+Shift+C"),
        ("paste", "Ctrl+Shift+V"),
        ("zoomIn", "Ctrl+="),
        ("zoomOut", "Ctrl+-"),
        ("zoomReset", "Ctrl+0"),
    ];
    #[cfg(target_os = "macos")]
    let pairs = [
        ("newTab", "Cmd+T"),
        ("closeTab", "Cmd+W"),
        // Cmd+Tab isletim sistemine ait (uygulama gecisi), webview'e hic
        // ulasmiyor. Mac terminalleri sekme gezinmesini Cmd+Shift+[ ] ve
        // Ctrl+Tab ile veriyor; ikincisi burada cakismiyor cunku kabuga giden
        // bir Ctrl+Tab dizisi yok.
        ("nextTab", "Ctrl+Tab"),
        ("prevTab", "Ctrl+Shift+Tab"),
        ("newGroup", "Cmd+Shift+N"),
        ("commandPalette", "Cmd+Shift+P"),
        ("historyPanel", "Cmd+Shift+H"),
        // Cmd+R: mac'te Ctrl+R kabugun ters aramasi, ona dokunmuyoruz.
        ("historySearch", "Cmd+R"),
        ("favorites", "Cmd+Shift+B"),
        ("settings", "Cmd+,"),
        ("renameTab", "Cmd+Shift+R"),
        ("toggleLock", "Cmd+Shift+L"),
        ("toggleViewMode", "Cmd+Shift+E"),
        ("clearTerminal", "Cmd+K"),
        ("findInTerminal", "Cmd+F"),
        ("copy", "Cmd+C"),
        ("paste", "Cmd+V"),
        ("zoomIn", "Cmd+="),
        ("zoomOut", "Cmd+-"),
        ("zoomReset", "Cmd+0"),
    ];
    pairs.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect()
}

// -------------------------------------------------------- calisma alani

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TabState {
    pub id: String,
    /// Kabuktan / OSC 0-2 ile gelen baslik.
    #[serde(default)]
    pub title: String,
    /// Kullanici elle adlandirdiysa bu kazanir.
    #[serde(default)]
    pub custom_title: Option<String>,
    #[serde(default)]
    pub profile_id: String,
    #[serde(default)]
    pub cwd: Option<String>,
    #[serde(default)]
    pub created_at: i64,
    #[serde(default)]
    pub last_active_at: i64,
    /// Bu sekmenin ekran ciktisi diskte duruyor mu?
    #[serde(default)]
    pub has_scrollback: bool,
    /// Son calistirilan komut - sekme ipucunda gosterilir.
    #[serde(default)]
    pub last_command: Option<String>,
    /// Kilitli sekme kapatilamaz. Yanlislikla kapatmaya karsi koruma;
    /// kapatmak icin once kilidin kaldirilmasi gerekiyor.
    #[serde(default)]
    pub locked: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Group {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(default)]
    pub collapsed: bool,
    /// Favori grup. Kenar cubugunda suzgec acikken yalnizca bunlar listelenir.
    #[serde(default)]
    pub favorite: bool,
    /// Bu gruptaki yeni sekmeler icin varsayilan profil.
    #[serde(default)]
    pub default_profile_id: Option<String>,
    /// Bu gruptaki yeni sekmeler icin baslangic dizini.
    #[serde(default)]
    pub default_cwd: Option<String>,
    /// Gruba ozel ortam degiskenleri; profil env degerlerinin ustune biner.
    #[serde(default)]
    pub env: BTreeMap<String, String>,
    #[serde(default)]
    pub active_tab_id: Option<String>,
    #[serde(default)]
    pub tabs: Vec<TabState>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    #[serde(default = "workspace_version")]
    pub version: u32,
    #[serde(default)]
    pub active_group_id: Option<String>,
    #[serde(default)]
    pub groups: Vec<Group>,
    /// Son kaydetme zamani (ms).
    #[serde(default)]
    pub saved_at: i64,
}

fn workspace_version() -> u32 {
    WORKSPACE_VERSION
}

impl Default for Workspace {
    fn default() -> Self {
        Self {
            version: WORKSPACE_VERSION,
            active_group_id: None,
            groups: Vec::new(),
            saved_at: 0,
        }
    }
}

// ------------------------------------------------------------------ gecmis

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub id: String,
    pub command: String,
    #[serde(default)]
    pub tab_id: String,
    #[serde(default)]
    pub group_id: String,
    #[serde(default)]
    pub profile_id: String,
    #[serde(default)]
    pub cwd: Option<String>,
    #[serde(default)]
    pub started_at: i64,
    #[serde(default)]
    pub duration_ms: Option<u64>,
    #[serde(default)]
    pub exit_code: Option<i32>,
    /// "integration" (OSC 133/633) veya "keystroke" (tus yakalama yedegi).
    #[serde(default)]
    pub source: String,
}

/// Gecmis dosyasi append-only bir gunluk: her satir ya yeni kayit, ya var olan
/// bir kaydin tamamlanma bilgisi, ya da silme islemi. Boylece her komut sonunda
/// 50 bin satirlik dosyayi bastan yazmak gerekmiyor.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "t", rename_all = "lowercase")]
pub enum HistoryRecord {
    Add(HistoryEntry),
    Fin {
        id: String,
        #[serde(default)]
        exit_code: Option<i32>,
        #[serde(default)]
        duration_ms: Option<u64>,
    },
    Del {
        ids: Vec<String>,
    },
}
