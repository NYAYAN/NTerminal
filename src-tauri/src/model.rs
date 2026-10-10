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
///
/// mac'te ilk aile `ui-monospace`, "SF Mono" DEGIL: WebKit SF ailelerini
/// adiyla VERMIYOR. OLCULEN: "SF Mono, Menlo, ..." yigininda hucre Menlo'nunkiyle
/// ayni cikiyordu (8x16 px, 14 px'te) - eski varsayilan aslinda Menlo ciziyordu.
/// `ui-monospace` gercek SF Mono'yu veriyor (8,5x17). Menlo her mac'te var.
pub fn default_font_family() -> String {
    #[cfg(target_os = "macos")]
    return "ui-monospace, Menlo, Monaco, monospace".into();
    #[cfg(not(target_os = "macos"))]
    return "Cascadia Mono, Consolas, Courier New, monospace".into();
}

/// Eski mac varsayilani. Ayarlar penceresinde "Ozel..." olarak gorunuyordu
/// (menude yoktu) ve SF Mono yerine Menlo ciziyordu; `sanitize` yenisine
/// tasiyor. Kullanicinin elle sectigi bir yigin bu metnin aynisi olamaz.
const LEGACY_MAC_FONT: &str = "SF Mono, Menlo, Monaco, Courier New, monospace";

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
    /// Kisayolla (Cmd+= / Cmd+-) yapilan yakinlastirma; `font_size`a eklenen
    /// fark. Ayarin kendisi DEGIL: Cmd+0 bunu sifirliyor ve terminal Ayarlar'da
    /// secilen boyuta donuyor (onceden sabit 14'e donuyordu).
    pub font_zoom: i16,
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
    /// Arayuz tasarimi: "classic" | "premium" | "kokpit".
    ///
    /// Renk temasindan AYRI bir eksen: tema renkleri, tasarim bicimi (kose,
    /// golge, katman, cam etkisi) soyluyor. Dogrulama ve uygulama arayuzde
    /// (`lib/design.ts`); burasi yalnizca tasiyor. Varsayilan "kokpit" (ISTEK:
    /// guncelleyen de ilk kuran da Kokpit'le acsin): alani olmayan eski bir
    /// settings.json Kokpit'le aciliyor, baska tasarim isteyen Ayarlar >
    /// Gorunum > Tasarim'dan donuyor. `lib/design.ts`
    /// icindeki `DEFAULT_DESIGN` ile AYNI kalmali.
    pub design: String,
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
    /// Varsayilan KAPALI (gerekce `Default` icinde): tek profille calisan
    /// kullanicida rozet her satirda ayni seyi tekrar ediyor ve dar kenar
    /// cubugunda sekme adina ayrilan yeri yiyor. Acan kullanici tek bakista
    /// hangi kabugun calistigini goruyor.
    pub show_shell_badge: bool,
    /// Grup kenar cubugu daraltilmis mi (baslik cubugundaki panel dugmesi).
    ///
    /// Ayarda tutuluyor, gecici arayuz durumunda degil: kullanici cubugu
    /// kapattiysa uygulamayi yeniden actiginda da kapali bekliyor.
    pub sidebar_collapsed: bool,
    /// Kokpit'in grup rayi genis mi: genisken grup adlari karolarin yaninda
    /// yaziyor. Ayarda, cunku genisletilen ray yeniden acilista da genis
    /// bekleniyor (ISTEK: "grubu genislet daralt da yapabilir miyiz").
    pub rail_expanded: bool,
    /// Genis rayda sekmeler gruplarin altinda mi (agac). Acikken kart sutunu
    /// gizleniyor; ayarda, cunku secim yeniden acilista da bekleniyor (ISTEK:
    /// "genislet dersem bir buton ciksin, bu buton ile sekmeleri grupta
    /// goster diyeyim").
    pub rail_tabs: bool,
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
            font_zoom: 0,
            // 1.50 - xterm'in kendi varsayilani (1.0) ve onceki deger (1.2)
            // degil. Satirlar bitisikken uzun ciktida goz satir atliyor;
            // yaridan fazla bosluk ise ekrandan satir yiyor. Kaydirici
            // 1.00-2.00 arasi, yani isteyen ikisine de gidebiliyor.
            line_height: 1.5,
            letter_spacing: 0.0,
            // Bos: arayuz sistemin kendi ailesini kullaniyor (CSS'teki
            // `--ui-font`).
            ui_font_family: String::new(),
            ui_font_size: 14,
            theme: "nterminal-dark".into(),
            design: "kokpit".into(),
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
            rail_expanded: false,
            rail_tabs: false,
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
    /// Kabugun VARSAYILAN istemini renklendir (yalnizca macOS/Linux kabuklari).
    ///
    /// Kabuga NTERMINAL_PROMPT_COLOR ile bildiriliyor. macOS'un zsh
    /// varsayilani (`%n@%m %1~ %#`) ve bash varsayilani (`\h:\W \u\$`) duz
    /// metin: ekran gecmisinde bir komutun NEREDE basladigini gozle bulmak
    /// zor. Kullanicinin bilerek kurdugu istem (oh-my-zsh, starship, kendi
    /// PROMPT'u) DEGISMIYOR - yalnizca isletim sisteminin verdigi varsayilanin
    /// AYNISI ise kullanici@makine ve dizin renkleniyor.
    ///
    /// Varsayilan ACIK: istek "en azindan nerede komut yazdigimi anlayayim"
    /// idi ve kapali bir varsayilan hicbir kullaniciya ulasmazdi.
    pub color_prompt: bool,
    /// Renkli istemde kullanici@makine rengi (`#rrggbb`); bos: temanin paleti (yesil).
    ///
    /// Arayuz rengi terminal zeminine karsi okunur hale getirip (`promptRgb`)
    /// kabuga `NTERMINAL_PROMPT_USER_RGB` ile `R;G;B` olarak veriyor. Bos birakmak
    /// "secilmedi" demek, hicbir sey degismiyor.
    pub prompt_user_color: String,
    /// Renkli istemde klasor rengi (`#rrggbb`); bos: temanin paleti (mavi).
    pub prompt_dir_color: String,
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
            color_prompt: true,
            prompt_user_color: String::new(),
            prompt_dir_color: String::new(),
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

/// Sayisal ayarlarin sinirlari - arayuzdeki `src/lib/settingsLimits.ts` ile
/// AYNI (`settingsLimits.test.ts` karsilastiriyor).
///
/// Arayuz de sinirliyor ama elle duzenlenen ya da ice aktarilan dosya arayuzden
/// gecmeden diske ve xterm'e ulasiyordu: xterm 1'in altindaki satir
/// yuksekliginde hata firlatiyor, 0'lik kaydirma tamponu terminalin ciktisini
/// siliyor, 1'lik gecmis siniri gecmisi kayit aninda kirpiyor.
pub mod limits {
    pub const FONT_SIZE: (u16, u16) = (8, 32);
    pub const LINE_HEIGHT: (f32, f32) = (1.0, 2.0);
    pub const LETTER_SPACING: (f32, f32) = (-1.0, 3.0);
    pub const UI_FONT_SIZE: (u16, u16) = (11, 20);
    pub const SCROLLBACK: (u32, u32) = (500, 200_000);
    pub const SCROLLBACK_SAVE_LINES: (u32, u32) = (0, 20_000);
    pub const HISTORY_LIMIT: (u32, u32) = (100, 500_000);
}

/// Degeri degistirir ve degistiyse isaretler.
fn fix<T: PartialEq>(slot: &mut T, next: T, changed: &mut bool) {
    if *slot != next {
        *slot = next;
        *changed = true;
    }
}

/// JavaScript'in `Math.round`u: yarim yukari (-0,5 -> 0). Rust'in `round`u
/// sifirdan uzaga yuvarliyor (-0,5 -> -1); iki taraf ayni degeri uretsin.
fn js_round(x: f32) -> f32 {
    (x + 0.5).floor()
}

impl Settings {
    /// Ayarlari sinirlarin icine ceker; eski mac yazi tipi varsayilanini
    /// yenisine tasir. Bir sey degistiyse `true` (cagiran diske yazsin).
    ///
    /// Yukleme, kaydetme ve ice aktarma ayni kapidan geciyor. Arayuzdeki
    /// karsiligi `sanitizeSettings` (`settingsLimits.ts`).
    pub fn sanitize(&mut self) -> bool {
        use limits::*;
        let mut changed = false;
        let a = &mut self.appearance;

        if a.font_family == LEGACY_MAC_FONT {
            a.font_family = default_font_family();
            changed = true;
        }
        let size = a.font_size.clamp(FONT_SIZE.0, FONT_SIZE.1);
        fix(&mut a.font_size, size, &mut changed);
        // Fark boyutla BIRLIKTE anlamli: 30 px'te +4 yazi boyutunu 34'e cikarirdi.
        let zoom = a
            .font_zoom
            .clamp(FONT_SIZE.0 as i16 - size as i16, FONT_SIZE.1 as i16 - size as i16);
        fix(&mut a.font_zoom, zoom, &mut changed);
        // Iki ondalik: kaydirici 0,05 adimli; kayan nokta artigi kalmasin.
        let line = if a.line_height.is_finite() {
            (a.line_height.clamp(LINE_HEIGHT.0, LINE_HEIGHT.1) * 100.0).round() / 100.0
        } else {
            1.5
        };
        fix(&mut a.line_height, line, &mut changed);
        // Tam sayi: xterm harf araligini cihaz pikselinde tam sayiya yuvarliyor,
        // yarim degerlerin yarisi hicbir sey degistirmiyordu.
        let spacing = if a.letter_spacing.is_finite() {
            js_round(a.letter_spacing).clamp(LETTER_SPACING.0, LETTER_SPACING.1)
        } else {
            0.0
        };
        fix(&mut a.letter_spacing, spacing, &mut changed);
        let ui = a.ui_font_size.clamp(UI_FONT_SIZE.0, UI_FONT_SIZE.1);
        fix(&mut a.ui_font_size, ui, &mut changed);
        let scrollback = a.scrollback.clamp(SCROLLBACK.0, SCROLLBACK.1);
        fix(&mut a.scrollback, scrollback, &mut changed);
        if !matches!(a.cursor_style.as_str(), "block" | "bar" | "underline") {
            a.cursor_style = "bar".into();
            changed = true;
        }

        let b = &mut self.behavior;
        let save = b
            .scrollback_save_lines
            .clamp(SCROLLBACK_SAVE_LINES.0, SCROLLBACK_SAVE_LINES.1);
        fix(&mut b.scrollback_save_lines, save, &mut changed);
        let history = b.history_limit.clamp(HISTORY_LIMIT.0, HISTORY_LIMIT.1);
        fix(&mut b.history_limit, history, &mut changed);

        changed
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
