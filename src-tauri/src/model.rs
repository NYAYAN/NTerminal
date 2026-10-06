//! Diske yazilan ve arayuzle paylasilan veri modelleri.
//!
//! Tum alanlar serde varsayilanlariyla tanimli: eski bir settings.json veya
//! baska bir makineden gelen .nterminal.json yeni alanlar eklendikten sonra da
//! okunabilsin diye. Surum alanlari gocler (migration) icin ayrilmis.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub const SETTINGS_VERSION: u32 = 2;
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
    /// Arayuz yazi tipi. Bos dize = sistemin kendi arayuz ailesi.
    ///
    /// Terminalinkinden AYRI: terminal es aralikli olmak zorunda (sutun hizasi
    /// ondan geliyor), arayuz degil.
    pub ui_font_family: String,
    /// Arayuz yazi tipi olcusu (px).
    ///
    /// Arayuzun butun olculeri buna gore turuyor (`--ui-font-size`). Terminal
    /// etkilenmiyor - onunki `font_size` ve kac sutun sigdigini o belirliyor.
    pub ui_font_size: u16,
    /// Arayuzde tanimli palet anahtari.
    pub theme: String,
    pub cursor_style: String,
    pub cursor_blink: bool,
    pub scrollback: u32,
    pub sidebar_width: u16,
    /// Sag panelin (gecmis / favoriler) genisligi.
    pub panel_width: u16,
    /// Dosya sutununun (gruplarin sagindaki agac / goruntuleyici) genisligi.
    ///
    /// Kenar cubugundan AYRI bir olcu: o sekme adlarini gosteriyor, burasi
    /// dosya ICERIGINI de gosteriyor (goruntuleyici bu sutunda aciliyor) ve
    /// kod okumak icin belirgin sekilde daha fazla yer istiyor.
    pub files_width: u16,
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
    /// Sekmenin solundaki kabuk rozeti ("PS", "CMD", "WSL") gorunsun mu.
    ///
    /// Varsayilan ACIK: tek bakista hangi kabugun calistigi belli oluyor.
    /// Kapatilabilir olmasi bilincli - tek profille calisan kullanicida rozet
    /// her satirda ayni seyi tekrar ediyor ve dar kenar cubugunda sekme adina
    /// ayrilan yeri yiyor.
    pub show_shell_badge: bool,
    /// Grup kenar cubugu daraltilmis mi (baslik cubugundaki panel dugmesi).
    ///
    /// Ayarda tutuluyor, gecici arayuz durumunda degil: kullanici cubugu
    /// kapattiysa uygulamayi yeniden actiginda da kapali bekliyor.
    pub sidebar_collapsed: bool,
    /// Favoriler panelinde DARALTILMIS grup adlari.
    ///
    /// Neden liste: favori grubu ayri bir varlik degil, favorinin uzerinde
    /// duran serbest bir metin (bkz. `Favorite::folder`). Uzerine "daraltildi"
    /// yazacak bir kayit yok, o yuzden durum adlarla tutuluyor.
    ///
    /// Bos dize GRUPLANMAMIS bolumu demek. Guvenli bir nobetci: grup adlari
    /// kaydedilirken kirpiliyor ve bos olanlar `None` sayiliyor, yani gercek
    /// bir grup asla `""` olamiyor.
    ///
    /// Sekme gruplarinin daraltma durumu da kalici (bkz. `Group::collapsed`);
    /// burasi ayni beklentiyi karsiliyor.
    pub collapsed_favorite_folders: Vec<String>,
}

impl Default for Appearance {
    fn default() -> Self {
        Self {
            font_family: default_font_family(),
            font_size: 14,
            // 1.50 - xterm'in kendi varsayilani (1.0) ve onceki deger (1.2)
            // degil. Satirlar bitisikken uzun ciktida goz satir atliyor;
            // yaridan fazla bosluk ise ekrandan satir yiyor. Kaydirici
            // 1.00-2.00 arasi, yani isteyen ikisine de gidebiliyor.
            line_height: 1.5,
            letter_spacing: 0.0,
            // Bos: arayuz sistemin kendi ailesini kullaniyor (CSS'teki
            // `--ui-font`). 13, bugune kadarki sabit deger - varsayilan
            // gorunum degismiyor.
            ui_font_family: String::new(),
            ui_font_size: 14,
            theme: "nterminal-dark".into(),
            cursor_style: "bar".into(),
            cursor_blink: true,
            scrollback: 10_000,
            sidebar_width: 240,
            panel_width: 390,
            files_width: 320,
            highlight_links: true,
            view_mode: "tabs".into(),
            // Varsayilan KAPALI: tek profille calisan kullanicida rozet her
            // satirda ayni seyi tekrar ediyor ve dar kenar cubugunda sekme
            // adina ayrilan yeri yiyor. Isteyen Ayarlar > Gorunum'dan aciyor.
            show_shell_badge: false,
            sidebar_collapsed: false,
            collapsed_favorite_folders: Vec::new(),
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
    ///
    /// Varsayilan ACIK: gunde yirmi kez `npm test` calistiran biri icin
    /// panelin tamami ayni satirin tekrari oluyor ve arama ise yaramiyor.
    /// Tekrarlar toplanmis liste "ne calistirdim" sorusunun gercek cevabi.
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
    ///
    /// Varsayilan "inline" ve bu bilincli: "list" iken ekranda IKI liste
    /// olusuyordu. PSReadLine kendi listesini terminalin ICINE ciziyor (10
    /// satir, sagda `[History]` etiketleri), uygulama da kendi panelini
    /// istemin altina aciyor - ayni gecmis, iki farkli bicimde, ust uste.
    /// Ustelik PSReadLine listesi komut basina suzulemiyor: `cd` yazinca
    /// baska dizinlerde calistirilmis on `cd` satiri doluyor ve cogu bu
    /// dizinde gecersiz. "inline" birakildiginda kabuk yalnizca tek satirlik
    /// hayalet metni ciziyor, liste isini uygulamanin paneli yapiyor.
    pub shell_prediction: String,
    /// Komut satiri her zaman pencerenin dibinde dursun.
    ///
    /// Kabuga NTERMINAL_PROMPT_BOTTOM ile bildiriliyor; kabuk entegrasyonu
    /// istemi cizmeden once imleci son satira indiriyor. Ustte kalan bosluga
    /// ciktilar ve oneri paneli yerlesiyor - Warp'in duzeni.
    ///
    /// Neden kabukta: satiri kabuk ciziyor. Arayuz tarafindan bosluk eklemek
    /// (xterm'e bos satir yazmak) ayni akista degil, yani istem bazen
    /// bosluklardan ONCE ciziliyor ve ekran zipliyor.
    pub prompt_at_bottom: bool,
    /// Komut satirini uygulama cizsin (terminalin izgarasinin disinda).
    ///
    /// Acikken tuslar pencerenin dibindeki kutuda toplaniyor ve kabuga
    /// Enter'da gidiyor. Yalnizca kabuk istemde beklerken; komut calisirken,
    /// tam ekran programlarda (vim, less) ve entegrasyonsuz profillerde
    /// tuslar dogrudan terminale gidiyor.
    pub app_input: bool,
    /// Komut bloklari: her komut ve ciktisi gorsel olarak ayri bir birim.
    ///
    /// Sinirlar kabuk entegrasyonundan (OSC 133) geliyor; entegrasyonu olmayan
    /// profillerde hicbir sey cizilmiyor.
    pub command_blocks: bool,
    /// Kabugun istemi yerine blogun kendi basligi.
    ///
    /// Acikken kabuk gorunur bir istem yazmiyor (yalnizca isaretler ve bir bos
    /// satir); dizin, sure ve cikis durumu o bos satira uygulama tarafindan
    /// ciziliyor. Simdilik yalnizca PowerShell.
    pub block_headers: bool,
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
    /// Pencere kapatilinca ne olsun: "quit" | "background".
    ///
    /// "background": pencere gizleniyor, uygulama menu cubugu (macOS) ya da
    /// bildirim alani (Windows) simgesinde yasamaya devam ediyor. Kabuk
    /// surecleri de yasiyor - zaten amaci bu: uzun suren bir islemi kapatmadan
    /// pencereyi kaldirabilmek.
    ///
    /// Varsayilan "background". Uygulamanin menu cubugunda / bildirim alaninda
    /// her zaman bir simgesi var; kapatma dugmesine basinca tumden olmesi bu
    /// varlikla celisiyordu - simge de kayboluyordu. Teams, Slack ve benzeri
    /// uygulamalarin davranisi da bu. Tamamen cikmak icin simgedeki "Cikis"
    /// ya da bu ayar var.
    pub close_action: String,
    /// Acilista yeni surum var mi diye baksin mi.
    ///
    /// Kapatilabilir olmasi sart: bu bir AG ISTEGI ve kullanicinin haberi
    /// olmadan yapilan bir istek olmamali. Varsayilan acik - guncellemeyi
    /// kacirmak, istegin kendisinden buyuk bir maliyet.
    pub check_updates: bool,
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
            history_dedupe: true,
            show_only_favorite_groups: false,
            mac_option_is_meta: false,
            app_suggestions: true,
            shell_prediction: "inline".into(),
            prompt_at_bottom: true,
            app_input: true,
            command_blocks: true,
            block_headers: true,
            close_action: "background".into(),
            check_updates: true,
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
        ("filePalette", "Ctrl+P"),
        // Dosyalarin icinde arama. IDE'lerin Ctrl+Shift+F'si burada
        // "terminalde ara" (Windows Terminal'in aliskanligi, ondan once
        // vardi); G "grep"ten.
        ("textSearch", "Ctrl+Shift+G"),
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
        ("filePalette", "Cmd+P"),
        // Dosyalarin icinde arama: mac'te IDE'lerin (VS Code, JetBrains,
        // Xcode) tusu. Terminalde arama Cmd+F oldugu icin cakismiyor.
        ("textSearch", "Cmd+Shift+F"),
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
    /// GRUPLANMAMIS sekmelerin kovasi.
    ///
    /// Sekmeler modelde her zaman bir grubun icinde; degistirmek "sekme
    /// nerede yasiyor" sorusunu her yerde ikiye bolerdi. Bunun yerine TEK bir
    /// grup boyle isaretleniyor ve arayuz onu basliksiz, duz bir liste olarak
    /// ciziyor. Kullanici acisindan sonuc: sekme acmak icin grup gerekmiyor.
    #[serde(default)]
    pub ungrouped: bool,
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
