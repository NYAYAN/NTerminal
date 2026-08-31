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
