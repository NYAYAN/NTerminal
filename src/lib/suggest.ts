/**
 * Komut önerisi: daha önce çalıştırılan komutlardan, yazılan ön eke göre.
 *
 * Neden ön ek eşleşmesi, bulanık arama değil: öneri "yazdığınızın devamı"
 * olarak sunuluyor. Bulanık eşleşen bir öneri ön eki uzatmadığı için hayalet
 * metin yanılsamasını bozuyor — kullanıcı yazdığı harflerin kaybolduğunu
 * görüyor. Bulanık arama ayrı bir iş ve `Ctrl+R` onu yapıyor.
 */

/**
 * Kabuğa gerçekten bildirilecek tahmin kipi.
 *
 * ## Neden bir kural gerekiyor
 *
 * "İstemin altında liste" (PSReadLine ListView) ile "komut satırı dipte
 * dursun" AYNI ANDA çalışamıyor. Liste imlecin ALTINA çiziliyor; istem son
 * satırdayken orada yer yok, PSReadLine da ekranı on satır yukarı kaydırarak
 * kendine yer açıyor. Sonuç, ölçülen belirti: istem dibe iniyor, liste
 * açılıyor, istem on satır yukarı fırlıyor — yani "sabit" olması istenen yer
 * her tuş vuruşunda oynuyor.
 *
 * Bu ikisi çelişkili DEĞİL, biri diğerini teknik olarak imkânsız kılıyor. Kural
 * bu yüzden burada, tek yerde: kabuğa liste yerine satır içi hayalet metin
 * bildiriyoruz. Kaybedilen bir şey yok — listeyi zaten uygulama kendi paneliyle
 * çiziyor (bkz. `SuggestionBar`), üstelik yazdığınız satırı örtmeden.
 *
 * Kullanıcının AYARI değişmiyor; yalnızca o ayarın bu oturumdaki karşılığı
 * hesaplanıyor. Dipte durma kapatılırsa liste geri geliyor.
 */
export function effectiveShellPrediction(
  setting: string,
  promptAtBottom: boolean,
): string {
  if (promptAtBottom && setting === "list") return "inline";
  return setting;
}

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

/** Geçmişten gelen bir komut ve çalıştırıldığı dizin. */
export interface SuggestEntry {
  command: string;
  /** Komutun çalıştırıldığı dizin; bilinmiyorsa null. */
  cwd: string | null;
  /**
   * Komutun çalıştırıldığı an (ms). Bilinmiyorsa yok.
   *
   * Sıralamaya girmiyor — `history` zaten en yeniden eskiye sıralı. Listede
   * "ne zaman kullanmıştım" bilgisini göstermek için taşınıyor: aynı ön ekle
   * başlayan iki komut arasında seçim çoğu zaman buna bakılarak yapılıyor.
   */
  at?: number | null;
  /**
   * Komutun çalıştırıldığı sekme; bilinmiyorsa null.
   *
   * `recentCommands` bunu süzgeç olarak kullanıyor: boş satırda yukarı ok
   * varsayılan olarak yalnızca BU sekmenin geçmişini göstersin, başka bir
   * sekmede çalıştırılmış komutlarla karışmasın.
   */
  tabId?: string | null;
}

/**
 * Ön eke uyan komutları sıralar.
 *
 * `history` EN YENİDEN eskiye sıralı olmalı: en son çalıştırılan komut ilk
 * öneri olur. Yinelenenler ilk (yani en yeni) görüldüğü yerde tutulur.
 *
 * ## Neden dizin önemli
 *
 * Aynı dizinde çalıştırılmış komutlar ÖNCE geliyor. Bildirilen belirti bunu
 * iyi anlatıyor: `.../src-tauri/target` içinde `cd t` yazınca liste
 * `cd NTerminal` öneriyordu — o klasör orada yok, yani öneri tıklansa komut
 * hata verirdi. Yol içeren komutlar (`cd`, `code`, `./betik`) bulundukları
 * dizine bağlı ve geçmiş tek bir havuz.
 *
 * Süzme DEĞİL sıralama: başka dizinde çalıştırılmış komutlar listeden
 * atılmıyor, altta kalıyor. `npm test` her yerde geçerli ve onu saklamak
 * kullanıcıdan bir şey götürürdü.
 */
export function rankSuggestions(
  history: readonly SuggestEntry[],
  prefix: string,
  cwd: string | null = null,
  limit = MAX_SUGGESTIONS,
): string[] {
  const needle = prefix.toLowerCase();
  if (needle.length < MIN_PREFIX) return [];

  const seen = new Set<string>();
  const ayni: string[] = [];
  const diger: string[] = [];

  for (const entry of history) {
    const command = entry.command.trim();
    if (!command) continue;
    // Yazılanın aynısını önermek anlamsız: kabul etmek hiçbir şey değiştirmez.
    if (command === prefix) continue;
    if (!command.toLowerCase().startsWith(needle)) continue;
    if (seen.has(command)) continue;
    seen.add(command);
    (cwd && entry.cwd === cwd ? ayni : diger).push(command);
    // İki kova da dolduysa daha fazla taramaya gerek yok.
    if (ayni.length >= limit) break;
  }

  return [...ayni, ...diger].slice(0, limit);
}

/**
 * BOŞ satırda yukarı ok: son çalıştırılan komutlar.
 *
 * `rankSuggestions`ten ayrı çünkü sorusu farklı. Orada soru "yazdığımın
 * devamı ne olabilir"; burada "en son ne yapmıştım". Ön ek yok, dolayısıyla
 * `MIN_PREFIX` kuralı da yok — bu liste tam olarak kabuğun yukarı okunun
 * karşılığı.
 *
 * DİZİNE göre sıralama da YOK ve bu bilinçli. Ön ekli öneride aynı dizinde
 * çalıştırılmış komutları öne almak doğru (`cd t` başka projede anlamsız),
 * ama "son komutlarım" listesini yeniden sıralamak kullanıcının beklediği
 * sırayı bozar: kabuğun yukarı oku her zaman zaman sırasıyla gider.
 *
 * Yinelenenler ilk (en yeni) görüldükleri yerde tutuluyor: aynı komutu üst
 * üste beş kez çalıştırmış olmak listeyi tek bir satırla doldurmamalı.
 *
 * ## Sekme süzgeci
 *
 * `tabId` verilirse yalnızca O SEKMEDE çalıştırılmış komutlar dönüyor — gerçek
 * bir kabuğun yukarı oku da yalnızca kendi oturumunun geçmişini gösterir,
 * başka bir sekmede çalıştırdığınız komutu araya karıştırmaz. `null` süzgeç
 * yok demek: kullanıcı isterse (Ctrl+A) tüm sekmelerin geçmişini görebiliyor.
 */
export function recentCommands(
  history: readonly SuggestEntry[],
  tabId: string | null,
  limit = MAX_SUGGESTIONS,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of history) {
    if (tabId !== null && entry.tabId !== tabId) continue;
    const command = entry.command.trim();
    if (!command || seen.has(command)) continue;
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
