/**
 * Komut önerisi: daha önce çalıştırılan komutlardan, yazılan ön eke göre.
 *
 * Neden ön ek eşleşmesi, bulanık arama değil: öneri "yazdığınızın devamı"
 * olarak sunuluyor. Bulanık eşleşen bir öneri ön eki uzatmadığı için hayalet
 * metin yanılsamasını bozuyor — kullanıcı yazdığı harflerin kaybolduğunu
 * görüyor. Bulanık arama ayrı bir iş ve `Ctrl+R` onu yapıyor.
 */

/** Öneri gösterilmesi için gereken en az ön ek uzunluğu. */
export const MIN_PREFIX = 2;

/**
 * Listede tutulacak en fazla öneri.
 *
 * Beş: liste terminalin yüksekliğinden yer alıyor (üstüne binmiyor, onu
 * küçültüyor). Sekizde çubuk 191px oluyordu — 627px'lik bir terminalin üçte
 * biri. Beş öneri, ön ek yeterince uzunsa neredeyse her zaman aradığını
 * içeriyor.
 */
export const MAX_SUGGESTIONS = 5;

/**
 * Ön eke uyan komutları sıralar.
 *
 * `history` EN YENİDEN eskiye sıralı olmalı: en son çalıştırılan komut ilk
 * öneri olur. Yinelenenler ilk (yani en yeni) görüldüğü yerde tutulur.
 */
export function rankSuggestions(
  history: readonly string[],
  prefix: string,
  limit = MAX_SUGGESTIONS,
): string[] {
  const needle = prefix.toLowerCase();
  if (needle.length < MIN_PREFIX) return [];

  const seen = new Set<string>();
  const out: string[] = [];

  for (const raw of history) {
    const command = raw.trim();
    if (!command) continue;
    // Yazılanın aynısını önermek anlamsız: kabul etmek hiçbir şey değiştirmez.
    if (command === prefix) continue;
    if (!command.toLowerCase().startsWith(needle)) continue;
    if (seen.has(command)) continue;
    seen.add(command);
    out.push(command);
    if (out.length >= limit) break;
  }

  return out;
}

/**
 * Öneriyi kabul etmek için kabuğa gönderilecek tuş dizisi.
 *
 * İki yol var ve aradaki fark önemli:
 *  - Öneri yazılanla TAM olarak başlıyorsa yalnızca kalanı yazıyoruz. Hiçbir
 *    şey silinmediği için kabuğun satır düzenleyicisiyle en az temas.
 *  - Başlamıyorsa (yalnızca büyük/küçük harf farkı olabilir) yazılan kadar
 *    geri silip öneriyi baştan yazıyoruz.
 *
 * Silme karakteri olarak DEL (`\x7f`) kullanılıyor: PSReadLine ve GNU readline
 * ikisi de bunu "önceki karakteri sil" olarak yorumluyor. `\b` (0x08) bazı
 * kabuklarda imleci sola kaydırmakla yetiniyor ve metin silinmiyor.
 */
export function acceptKeys(current: string, suggestion: string): string {
  // ÖLÇÜLEN HATA. `current` boşken aşağıdaki `startsWith` her zaman doğru
  // çıkıyor ve önerinin TAMAMI yazılıyor — satırda zaten yazılı olanın
  // üstüne. Kullanıcının geçmişine `yarn start:devyarn start:dev` diye bir
  // kayıt böyle girdi: komut kabuğa iki kez ulaştı.
  //
  // Boş `current` "satır boş" demek değil, "satırı OKUYAMADIM" demek
  // (istem işareti yoksa ya da komut çalışıyorsa okuma boş dönüyor). Bilmediğimiz
  // bir satıra kör metin yazmak yerine hiçbir şey yapmıyoruz: öneri
  // uygulanmamış olur, ama kimsenin komutu bozulmaz.
  if (!current) return "";
  if (suggestion === current) return "";
  if (suggestion.startsWith(current)) return suggestion.slice(current.length);
  return "\x7f".repeat(current.length) + suggestion;
}

/**
 * Listede dolanma. Sonda ileri gitmek başa döner.
 *
 * Dönmesi bilinçli: liste kısa ve kullanıcı yukarı oka basmaya devam ederken
 * "bitti" hissi yerine baştan görmek daha az şaşırtıcı.
 */
export function cycleIndex(index: number, length: number, direction: 1 | -1): number {
  if (length <= 0) return 0;
  return (((index + direction) % length) + length) % length;
}

/**
 * Öneri gösterilsin mi?
 *
 * `full` satırın tamamı, `prefix` imlece kadarki kısım. İkisi farklıysa imleç
 * satırın ortasında: orada öneri göstermek yanıltıcı olur, çünkü kabul etmek
 * imlecin sağındaki metni yok sayar.
 *
 * `hintTail` bu kuralın istisnası ve gerekli: kabuğun KENDİ satır içi önerisi
 * (zsh-autosuggestions, PSReadLine) de imlecin sağında, ekranda duruyor. Onu
 * "kullanıcının yazdığı metin" saymak, ekranda hayalet metin olan HER AN
 * listeyi kapatıyordu — yani kabuk öneri verebildiği anda bizimki susuyordu.
 *
 * Ölçülen belirti: geçmişte hem `yarn start:dev` hem `yarn start:prod` varken
 * `yarn` yazınca liste hiç açılmıyor, yalnızca kabuğun tek satırlık hayalet
 * önerisi görünüyordu. Oysa listenin bütün değeri birden çok seçeneği yan yana
 * göstermesi.
 */
export function canSuggest(prefix: string, full: string, hintTail = false): boolean {
  if (prefix.trim().length < MIN_PREFIX) return false;
  if (prefix === full) return true;
  // İmlecin sağındaki metin kabuğun hayalet önerisiyse satırın sonundayız.
  return hintTail && full.startsWith(prefix);
}
