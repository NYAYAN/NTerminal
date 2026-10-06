import { dirName, shortenPath } from "./format";

/**
 * Dizin seçicinin yol hesapları.
 *
 * Saf tutuluyor çünkü asıl hata riski burada: ayırıcı hangisi, üst dizin
 * nerede biter, kök dizinin üstü var mı. Gerçek dosya sisteminde denemesi
 * yavaş ve platforma bağlı; kural olarak yazınca ikisi de test edilebiliyor.
 */

/** Yolun ayırıcısı: içinde `\` varsa Windows sayılıyor. */
export function separatorOf(path: string): string {
  return path.includes("\\") ? "\\" : "/";
}

/**
 * Alt dizine iner.
 *
 * Sondaki ayırıcı tekrarlanmıyor: `C:\Users\` + `Docs` → `C:\Users\Docs`,
 * `C:\Users\Docs` değil. Kabuğa gönderilecek yol bu, fazladan ayırıcı bazı
 * kabuklarda çalışıyor ama geçmişte çirkin bir kayıt bırakıyor.
 */
export function joinDir(base: string, name: string): string {
  const sep = separatorOf(base);
  const temiz = base.endsWith(sep) ? base.slice(0, -1) : base;
  return `${temiz}${sep}${name}`;
}

/**
 * Üst dizin; kökteysek `null`.
 *
 * `null` dönmesi önemli: seçici "üst dizin" satırını buna bakarak gizliyor.
 * Kökte o satırı göstermek tıklandığında hiçbir şey yapmayan bir düğme
 * demekti.
 */
export function parentDir(path: string): string | null {
  const sep = separatorOf(path);
  const temiz = path.endsWith(sep) && path.length > 1 ? path.slice(0, -1) : path;
  const at = temiz.lastIndexOf(sep);
  if (at < 0) return null;

  // POSIX kökü: `/foo` -> `/`. Ayırıcıyı atarsak boş dize kalır.
  if (at === 0) return temiz.length > 1 ? sep : null;

  const ust = temiz.slice(0, at);
  // Windows sürücü kökü: `C:` tek başına dizin değil, `C:\` olmalı.
  if (/^[a-zA-Z]:$/.test(ust)) return ust + sep;
  return ust;
}

/**
 * Listeyi arama metnine göre süzer.
 *
 * Büyük/küçük harf gözetmiyor ve İÇEREN eşleşme kullanıyor: klasör adının
 * başını hatırlamak zorunda kalmamak gerekiyor — `Presentation` içindeki
 * `WebAPI`yi aramak için "web" yazmak yetmeli.
 */
export function filterDirs(names: readonly string[], query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...names];
  return names.filter((name) => name.toLowerCase().includes(q));
}

/**
 * İki yol AYNI klasörü mü gösteriyor?
 *
 * Kilitli sekmenin klasörünü koruyan denetim buna bakıyor, o yüzden yanlış
 * "değişti" kararı görünür bir hataya dönüşüyor: kabuk aynı yeri farklı
 * yazınca sekme kendini boşuna geri çağırırdı. Kabuklar aynı dizini birden
 * çok biçimde bildiriyor:
 *
 *  * sondaki ayırıcı — `C:\proje` ile `C:\proje\`
 *  * ayırıcı yönü — OSC 7 `file://` yolunu eğik bölüyle veriyor, `cd` ise
 *    ters bölüyle geri geliyor
 *  * büyük/küçük harf — PowerShell `C:\Proje`, cmd `c:\proje` yazabiliyor
 *
 * Harf duyarlılığı YOLUN BİÇİMİNDEN çıkarılıyor, platform ayarından değil:
 * sürücü harfi ya da ters bölü gören yol Windows yolu sayılıp harf
 * gözetmiyor. POSIX yolunda gözetiyor, çünkü orada `/home/Ali` ile
 * `/home/ali` GERÇEKTEN iki ayrı dizin — onları eşit saymak kilidi sessizce
 * yanlış klasörde açık bırakırdı.
 */
export function sameDir(a: string, b: string): boolean {
  const windowsYolu = (p: string) => /^[a-zA-Z]:/.test(p) || p.includes("\\");
  const duzelt = (p: string) => {
    const tek = p.trim().replace(/\\/g, "/");
    // Sondaki ayırıcı atılıyor ama kök korunuyor: `/` ve `C:/` kendileri birer
    // dizin, boş dizeye indirilemez.
    const kisa = tek.length > 1 && tek.endsWith("/") ? tek.slice(0, -1) : tek;
    return /^[a-zA-Z]:$/.test(kisa) ? `${kisa}/` : kisa;
  };

  const x = duzelt(a);
  const y = duzelt(b);
  if (windowsYolu(a) || windowsYolu(b)) return x.toLowerCase() === y.toLowerCase();
  return x === y;
}

/**
 * `path`in `root`a göre yolu (yolun kendi ayırıcısıyla); kökün altında değilse
 * `null`.
 *
 * Kök ve yol farklı biçimde gelebiliyor — fark penceresi git'in eğik çizgisini
 * veriyor, PowerShell sürücü harfini küçük yazabiliyor. Harf duyarlılığı
 * `sameDir`deki gibi yolun BİÇİMİNDEN: Windows yolunda gözetilmiyor, POSIX'te
 * gözetiliyor (orada `/home/Ali` ile `/home/ali` gerçekten iki ayrı yer).
 */
export function relativePath(root: string, path: string): string | null {
  const windows = [root, path].some((p) => /^[a-zA-Z]:/.test(p) || p.includes("\\"));
  const kok = root.replace(/\\/g, "/").replace(/\/+$/, "");
  const yol = path.replace(/\\/g, "/");
  const onEk = `${kok}/`;
  const ayni = windows ? yol.toLowerCase().startsWith(onEk.toLowerCase()) : yol.startsWith(onEk);
  if (!ayni) return null;
  // Ayırıcı değişimi birebir (karakter karakter), konumlar iki yazımda aynı.
  const rest = path.slice(onEk.length);
  return rest.length > 0 ? rest : null;
}

/**
 * Bir dosyanın `root` ile arasındaki klasörler — dosya ağacının ANAHTARLARIYLA.
 *
 * Aramadan ya da paletten açılan dosya ağaçta da gösteriliyor ("burada"):
 * dalları açmak için ağacın tuttuğu yolları üretmek gerekiyor. Ağaç anahtarı
 * kökten `joinDir` ile kuruyor, yani sonuç da KÖKÜN yazımıyla kuruluyor —
 * dosya yolu başka biçimde gelse bile.
 *
 * Dosya kökün altında değilse `null`: başka bir dizinin dosyasını açmak ağaca
 * dokunmamalı.
 */
export function ancestorDirs(root: string, path: string): string[] | null {
  const rel = relativePath(root, path);
  if (rel === null) return null;
  const parcalar = rel.split(/[\\/]/).filter(Boolean);
  // Son parça dosyanın kendisi.
  parcalar.pop();

  const out: string[] = [];
  let at = root;
  for (const ad of parcalar) {
    at = joinDir(at, ad);
    out.push(at);
  }
  return out;
}

/**
 * Görüntüleyici başlığında adın yanındaki klasör: kökün altındaysa ona göre
 * (`src/components`), değilse mutlak yolun son üç parçası. Ad zaten ayrı
 * yazılıyor; klasör "hangi `index.ts`" sorusunun yanıtı.
 */
export function folderLabel(path: string, root: string | null): string | null {
  const rel = root ? relativePath(root, path) : null;
  const dir = dirName(rel ?? path);
  if (!dir) return null;
  const clean = dir.slice(0, -1);
  return rel ? clean : shortenPath(clean, 3);
}
