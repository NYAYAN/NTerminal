import { formatBytes } from "./format";
import { t } from "./i18n";

/**
 * Görüntüleyicinin RESİM olarak gösterdiği dosyalar: uzantı → MIME.
 *
 * İSTEK: "dosyalardan png tıkladığımda görsel olarak göremiyorum." Görüntüleyici
 * her dosyayı metin olarak okuyordu; PNG'de ilk sekiz kilobaytta NUL bulup
 * "ikili dosya" diyordu.
 *
 * Karar uzantıdan, içerikten değil: dosyayı okumadan hangi görüntüleyicinin
 * açılacağı bilinmeli. Yanlış uzantılı bir dosya (adı `.png`, içi metin) resim
 * olarak açılamıyor ve bu SÖYLENİYOR (bkz. `viewer.imageFailed`).
 *
 * Liste webview'in gösterebildikleri. TIFF ve HEIC yalnızca macOS'ta (WebKit)
 * gösteriliyor; Windows'ta (WebView2) açılamadıkları bildiriliyor — sessizce
 * boş bir alan değil.
 *
 * SVG MIME'ı ŞART: `data:` adresinde tarayıcı türü koklamıyor, SVG ancak
 * `image/svg+xml` ile çiziliyor. `<img>` içindeki SVG'nin betikleri çalışmıyor;
 * bir dosyayı önizlemek onu çalıştırmak değil.
 */
const TYPES: Record<string, string> = {
  png: "image/png",
  apng: "image/apng",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  jfif: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  bmp: "image/bmp",
  ico: "image/x-icon",
  cur: "image/x-icon",
  svg: "image/svg+xml",
  tif: "image/tiff",
  tiff: "image/tiff",
  heic: "image/heic",
  heif: "image/heif",
};

function extension(path: string): string {
  const name = path.slice(Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1);
  const dot = name.lastIndexOf(".");
  // `.png` adlı (uzantısız, gizli) dosya resim değil.
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/** Dosya resim olarak gösteriliyorsa MIME'ı; değilse `null`. */
export function imageMime(path: string): string | null {
  return TYPES[extension(path)] ?? null;
}

/**
 * SVG hem resim hem metin: önizleme varsayılan, kaynağı görmek/düzenlemek bir
 * tık. İçerik aramasından açılınca doğrudan KAYNAK (eşleşme satırda).
 */
export function isSvgPath(path: string): boolean {
  return extension(path) === "svg";
}

/** Kaynak kodu ve yapılandırma sayılan uzantılar (bkz. `fileKind`). */
const CODE = new Set([
  "ts", "tsx", "js", "jsx", "mjs", "cjs", "json", "jsonc", "css", "scss", "less", "html", "htm",
  "vue", "svelte", "rs", "go", "py", "rb", "php", "java", "kt", "swift", "m", "mm", "c", "h",
  "cc", "cpp", "hpp", "cs", "lua", "sql", "sh", "bash", "zsh", "fish", "ps1", "psm1", "psd1",
  "ps1xml", "bat", "cmd", "toml", "yml", "yaml", "xml", "plist", "gradle", "lock",
]);

/**
 * Dosya listesindeki simgenin türü: görsel, kod ya da belge.
 *
 * Ctrl+P satırının başındaki simge için. Görsel kararı görüntüleyicininkiyle
 * AYNI liste (`TYPES`): resim simgeli satır resim olarak açılıyor. Geri kalan
 * kaba bir ayrım — amaç dosyayı tanımak değil, gözün satırları türe göre
 * gruplayabilmesi.
 */
export function fileKind(path: string): "image" | "code" | "doc" {
  if (imageMime(path) !== null) return "image";
  return CODE.has(extension(path)) ? "code" : "doc";
}

/** Rust'ın "çok büyük" hatasının öneki (bkz. `files::IMAGE_TOO_LARGE`). */
const TOO_LARGE = "too-large:";

/** Görsel okunamadığında kullanıcıya gösterilecek cümle. */
export function imageErrorText(raw: unknown): string {
  const text = String(raw);
  if (text.startsWith(TOO_LARGE)) {
    const size = Number(text.slice(TOO_LARGE.length));
    return t("viewer.imageTooLarge", { size: Number.isFinite(size) ? formatBytes(size) : "?" });
  }
  return t("viewer.failed");
}
