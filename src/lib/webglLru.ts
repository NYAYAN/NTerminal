/**
 * WebGL bağlamı taşıyan terminallerin "en son kullanılan" sırası.
 *
 * ## Ölçülen hata
 *
 * BİLDİRİLEN BELİRTİ: "sekmeler arası geçişte yavaşlıyor, `ng build`
 * `dotnet run` gibi komutları çalıştırınca."
 *
 * Altı sekme, dördünde kesintisiz çıktı akarken ölçülen geçiş süresi 50-84 ms
 * ve geçiş başına en büyük kare boşluğu 70 ms — yani her sekme değişiminde
 * üç-dört kare düşüyor. Örnekleme profili sebebi isimle verdi (18 geçiş,
 * toplam 5,5 sn):
 *
 * | İş | Süre |
 * |---|---|
 * | genel bakış sütununun `onRender` işleyicisi (`clientHeight` okuyup yerleşimi zorluyor) | 990 ms |
 * | `createRow` — DOM oluşturucu satır kuruyor | 263 ms |
 * | `replaceChildren` — DOM oluşturucu satırları değiştiriyor | 189 ms |
 * | `getContext` — WebGL bağlamı kuruluyor | 144 ms |
 * | `_measure` — karakter ölçüsü yeniden ölçülüyor | 141 ms |
 * | `handleResize` + `getShaderParameter` (WebGL kurulumu) | 129 ms |
 *
 * KÖK NEDEN: bağlam SEKME BAŞINA DEĞİL ODAK BAŞINA veriliyordu. Odağı
 * kaybeden terminalin WebGL eklentisi bırakılıyor ve xterm onun yerine
 * sıfırdan bir DOM oluşturucu kuruyor (satır öğeleri + karakter ölçümü);
 * odağı alan terminalde ters yönde aynı iş (bağlam + shader + atlas). Yani
 * her geçiş iki oluşturucu kurulumu ödüyor.
 *
 * Bedeli sekme değişiminde bitmiyor: DOM oluşturucuyla çizilen gizli
 * terminaller kare başına DOM'u değiştiriyor, bu da genel bakış sütununun
 * her çizimde yaptığı `clientHeight` okumasını gerçek bir yerleşim hesabına
 * çeviriyor. Listenin başındaki 990 ms buradan geliyor.
 *
 * ## Çözüm ve neden LRU
 *
 * Bağlam ODAKLA GELİP GİTMİYOR: bir kez verildi mi, tavan zorlamadıkça
 * kalıyor. İki sekme arasında gidip gelmek artık hiçbir oluşturucu kurulumu
 * gerektirmiyor.
 *
 * Tavan gerekiyor çünkü tarayıcı motoru canlı WebGL bağlamı sayısını
 * sınırlıyor (Chromium'da ~16); sınır aşılınca en eski bağlam KAYBEDİLİYOR ve
 * o terminalde gözle görülür bir sıçrama oluyor.
 *
 * **Neden sekiz, dört değil.** Dört ile ölçülen (YAYIN derlemesi, beş sekme,
 * dördünde kesintisiz çıktı): sekmeler arası geçişler 27-33 ms ve kare
 * düşmüyor, AMA tavanın dışında kalan beşinci sekmeye ilk geçiş 233 ms
 * sürüyor ve tek karede 231 ms blokluyor — bağlam o sekme için sıfırdan
 * kuruluyor. Kullanıcının çalışma alanı altı sekme; tavanı sekiz yapmak bu
 * uçurumu gerçek bir çalışma alanı için tümden kaldırıyor ve motorun
 * sınırının yarısında kalıyor. Uçurum yok olmuyor, yalnızca sekiz sekmenin
 * ötesine taşınıyor: dokuzuncu sekmeye ilk geçiş yine kurulum ödüyor.
 *
 * Mantık burada ve SAF: hangi terminalin bağlam tutacağı bir sıralama
 * kararı, xterm'e ya da DOM'a ihtiyacı yok, dolayısıyla testi de doğrudan.
 */

/** En fazla kaç terminal aynı anda WebGL bağlamı tutabilir. */
export const MAX_WEBGL = 8;

/**
 * Öğeyi listenin SONUNA taşır (en son kullanılan).
 *
 * Yeni dizi döndürüyor: çağıran tarafta paylaşılan bir diziyi yerinde
 * değiştirmek, aynı listeye bakan iki yolu birbirine bağlar.
 */
export function touch<T>(lru: readonly T[], item: T): T[] {
  return [...lru.filter((x) => x !== item), item];
}

/**
 * Öğeyi listenin BAŞINA taşır (ilk düşecek).
 *
 * Görünmez olan terminal bağlamını hemen bırakmıyor — geri dönülürse kurulum
 * bedeli ödenmesin. Ama yeni bir istek geldiğinde ilk kurban o olmalı.
 * Listede yoksa dokunulmuyor: bağlamı olmayan bir terminali sıraya sokmak
 * onu var sayardı.
 */
export function demote<T>(lru: readonly T[], item: T): T[] {
  if (!lru.includes(item)) return [...lru];
  return [item, ...lru.filter((x) => x !== item)];
}

/** Listeden çıkarır (bağlam bırakıldı ya da oturum kapandı). */
export function drop<T>(lru: readonly T[], item: T): T[] {
  return lru.filter((x) => x !== item);
}

/**
 * Tavan aşıldıysa bağlamı bırakılacak olanları seçer.
 *
 * Sıra: önce GÖRÜNMEYENLER, en eskiden başlayarak. Görünen bir terminalin
 * bağlamını almak, ekranda o an duran bir şeyi DOM oluşturucuya düşürmek
 * demek — bölme kipinde bu doğrudan görünür bir kalite kaybı.
 *
 * `keep` asla seçilmiyor: istek onun için yapıldı, hemen geri almak sonsuz
 * bir kurulum döngüsü olurdu.
 *
 * Görünmeyen kalmadıysa (hepsi görünür, tavan dolu) en eski görünen düşüyor:
 * tavan bir kalite tercihi değil, motorun sınırı.
 */
export function evictions<T>(
  lru: readonly T[],
  max: number,
  keep: T,
  isVisible: (item: T) => boolean,
): T[] {
  const fazla = lru.length - max;
  if (fazla <= 0) return [];

  const secilen: T[] = [];
  const aday = lru.filter((x) => x !== keep);

  for (const x of aday) {
    if (secilen.length >= fazla) break;
    if (!isVisible(x)) secilen.push(x);
  }
  for (const x of aday) {
    if (secilen.length >= fazla) break;
    if (!secilen.includes(x)) secilen.push(x);
  }
  return secilen;
}
