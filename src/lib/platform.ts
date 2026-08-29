/**
 * Platform bilgisi ve platforma göre değişen arayüz kararları.
 *
 * Doğru kaynak Rust tarafı (`platform.rs`, `Bootstrap.platform`): derlendiği
 * hedefi bilen tek yer orası. Ama `matchCombo` gibi işlevler açılış verisi
 * gelmeden de çağrılabiliyor, o yüzden ilk değer tarayıcıdan tahmin ediliyor ve
 * açılışta Rust'ın değeriyle düzeltiliyor.
 *
 * `i18n.ts` ile aynı desen: zustand yerine modül düzeyinde durum. Sebebi aynı —
 * `keys.ts` ve `TerminalSession` bunu çağırıyor, depoya bağlamak dairesel bir
 * bağımlılık kurardı.
 */

export type Platform = "windows" | "macos" | "linux";

/**
 * Tarayıcıdan ilk tahmin.
 *
 * `navigator.platform` kullanımdan kalkmış ama Tauri'nin WebView'ünde hâlâ
 * güvenilir; yine de userAgent'a da bakıyoruz. Bu değer yalnızca açılış
 * verisi gelene kadar geçerli.
 */
function guess(): Platform {
  if (typeof navigator === "undefined") return "windows";
  const text = `${navigator.userAgent} ${navigator.platform ?? ""}`;
  if (/mac|iphone|ipad/i.test(text)) return "macos";
  if (/win/i.test(text)) return "windows";
  if (/linux|x11/i.test(text)) return "linux";
  return "windows";
}

let current: Platform = guess();

/**
 * Açılış verisinden gelen kesin değeri yazar.
 *
 * `<html data-platform>` de burada işaretleniyor: CSS'in platforma göre
 * değişmesi gereken tek yeri (tek aralıklı yazı tipi yığını) bir seçiciyle
 * çözülüyor, JS'den stil yazmak gerekmiyor.
 */
export function setPlatform(value: Platform) {
  current = value;
  if (typeof document !== "undefined") {
    document.documentElement.dataset.platform = value;
  }
}

/**
 * Varsayılan tek aralıklı yazı tipi yığını.
 *
 * Rust tarafı (`model.rs` → `default_font_family`) doğru kaynak; bu yalnızca
 * açılış verisi gelmeden önceki ilk çizim için. İki listenin aynı kalması
 * gerekiyor, test bunu bağlıyor.
 */
export function defaultFontStack(): string {
  return isMac()
    ? "SF Mono, Menlo, Monaco, Courier New, monospace"
    : "Cascadia Mono, Consolas, Courier New, monospace";
}

export function platform(): Platform {
  return current;
}

export function isMac(): boolean {
  return current === "macos";
}

/**
 * Arayüz kısayollarının ana değiştirici tuşu.
 *
 * macOS'ta Cmd, diğerlerinde Ctrl. Kozmetik değil: mac'te Ctrl terminalin
 * KENDİ tuşu (Ctrl+C = SIGINT, Ctrl+D = EOF, Ctrl+R = ters arama). Arayüz
 * kısayolunu Ctrl'e bağlamak kabuğun tuşlarını yer.
 */
export function modKey(): "Cmd" | "Ctrl" {
  return isMac() ? "Cmd" : "Ctrl";
}

/**
 * Dosya yöneticisinin adı — arayüz metinlerinde `{fm}` yerine geçiyor.
 *
 * Açılış verisinden geliyor ("Gezgin" / "Finder"); henüz gelmediyse platformdan
 * türetiliyor. Metinde "Gezgin'de aç" yazmak mac kullanıcısına yanlış yer
 * gösterir.
 */
let fileManagerTr = "";
let fileManagerEn = "";

export function setFileManager(tr: string, en: string) {
  fileManagerTr = tr;
  fileManagerEn = en;
}

export function fileManager(lang: "tr" | "en"): string {
  if (lang === "en") return fileManagerEn || (isMac() ? "Finder" : "Explorer");
  return fileManagerTr || (isMac() ? "Finder" : "Gezgin");
}
