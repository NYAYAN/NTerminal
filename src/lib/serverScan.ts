/**
 * Terminale YENİ YAZILAN satırlarda sunucu adresi arama.
 *
 * ## Neden ayrı ve saf bir modül
 *
 * Bu kural altı tur boyunca yanlış yerde arandı. Sebebi şu: doğruluğu gerçek
 * bir kabuk + gerçek bir ConPTY olmadan denenemiyor sanılıyordu, o yüzden her
 * denemede kullanıcıya soruldu. Oysa kuralın girdisi üç sayı ve bir satır
 * okuyucu — hepsi taklit edilebiliyor. Modül ayrıldığı andan itibaren senaryo
 * testte kuruluyor.
 *
 * ## Neden akan baytlar değil, satırlar
 *
 * ÖLÇÜLEN HATA: `ng serve` durdurulup yeniden çalıştırıldığında eski portun
 * rozeti geri geliyordu. Sebep ConPTY'nin YENİDEN ÇİZİMİ: komut başlayınca
 * komut kutusu "Durdur" şeridine dönüşüyor, satır yüksekliği değişiyor,
 * terminal yeniden ölçülüyor ve ConPTY görünen ekranın TAMAMINI yeniden
 * yayımlıyor. Ekranda duran eski adres satırı ikinci kez akıştan geçiyor.
 *
 * Yeniden çizim VAR OLAN satırları yeniden yazıyor, yeni satır EKLEMİYOR.
 * Dolayısıyla "imleç ilerlediyse tara" kuralı yeniden çizimi yapısal olarak
 * dışlıyor — pencere boyutu değişimi ve `clear` da dahil.
 */

import { extractServerUrls } from "./serverLinks";

/** Taramanın sürdürdüğü durum. */
export interface ScanState {
  /**
   * Taramanın ÇAPADAN kaç satır ileri gittiği.
   *
   * MUTLAK satır numarası DEĞİL ve bu düzeltilmiş bir hatanın izi. Mutlak
   * tutulduğunda kaydırma geçmişi dolunca tarama kalıcı olarak duruyordu:
   * xterm en eski satırı atıp yenisini eklediği için `baseY` büyümeyi
   * bırakıyor, yani akan çıktıda `baseY + cursorY` sabit kalıyor ve "imleç
   * ilerledi mi" koşulu bir daha hiç sağlanmıyor. Çapaya göre ölçmek bunu
   * yapısal olarak çözüyor: çapa da kırpmayla birlikte kaydığı için ikisinin
   * FARKI doğru kalıyor.
   */
  scannedAhead: number;
  /** Bu komut için bulunan adresler, görüldükleri sırada. */
  urls: string[];
}

/** Terminalin taramaya konu olan hâli. */
export interface ScanContext {
  /** Görünümün üstünden geçmişe kayan satır sayısı. */
  baseY: number;
  /** İmlecin görünüm içindeki satırı. */
  cursorY: number;
  /** Mutlak satır numarasından metin. */
  readLine: (y: number) => string;
  /**
   * Bu satır bir öncekinin SARILMIŞ devamı mı.
   *
   * Uzun bir günlük satırı terminalin genişliğinde bitmiyor ve alt satırdan
   * devam ediyor; xterm bunu ayrı bir tampon satırı olarak tutuyor ama
   * `isWrapped` ile işaretliyor. Tarama bu işareti bilmek zorunda — gerekçesi
   * aşağıda, birleştirmenin yapıldığı yerde.
   */
  isWrapped: (y: number) => boolean;
  /**
   * Komutun başladığı satırın GÜNCEL numarası; çapa yoksa `-1`.
   *
   * Çağıran bunu bir xterm işaretçisinden veriyor (`registerMarker`).
   * İşaretçiyi xterm kendisi güncelliyor: kaydırma geçmişi dolup en eski
   * satırlar atıldığında numarayı aşağı çekiyor, satır büsbütün düşünce de
   * işaretçiyi kapatıyor. Taramanın mutlak numaralara güvenememesinin sebebi
   * bu — bkz. `ScanState.scannedAhead`.
   */
  anchorLine: number;
  /** Komut çalışıyor mu. */
  running: boolean;
  /** İkincil ekran tamponu etkin mi (vim, less). */
  altScreen: boolean;
}

export interface ScanLimits {
  /** Tutulacak en fazla adres. */
  maxUrls: number;
  /** Tek çağrıda okunacak en fazla satır. */
  maxLines: number;
}

export interface ScanResult {
  state: ScanState;
  /** Liste değişti mi; arayüze bildirim bunun üzerine yapılıyor. */
  changed: boolean;
}

/**
 * Yeni satırları tarar ve bulunan adresleri duruma ekler.
 *
 * Durumu DEĞİŞTİRMİYOR: yenisini döndürüyor. Böylece test, aynı girdiyle iki
 * kez çağırıp sonucun aynı olduğunu doğrulayabiliyor.
 */
export function scanForServerUrls(
  state: ScanState,
  ctx: ScanContext,
  limits: ScanLimits,
): ScanResult {
  const bitti: ScanResult = { state, changed: false };

  if (!ctx.running) return bitti;
  if (state.urls.length >= limits.maxUrls) return bitti;
  // İkincil ekran kendi tamponunu kullanıyor; oradaki satır numaraları
  // birincil tamponla ilgisiz.
  if (ctx.altScreen) return bitti;
  // Çapa yok (komut başlamadı ya da işaretçi kapandı): karşılaştıracak bir
  // şey de yok. Çağıran çapayı yeniden kurunca tarama sürüyor.
  if (ctx.anchorLine < 0) return bitti;

  const son = ctx.baseY + ctx.cursorY;
  /** Taramanın geldiği yer — çapa kaydıkça bu da kayıyor. */
  const scanLine = ctx.anchorLine + state.scannedAhead;

  /*
   * İMLEÇ GERİ GİTTİYSE taranmıyor ve işaret DE geri alınmıyor.
   *
   * Yeniden çizim tam olarak bunu yapıyor: imleci ekranın başına alıp içeriği
   * yeniden yazıyor. İşareti oraya çekmek, yeniden yazılan satırların (ve
   * içindeki eski adresin) yeniden taranmasına kapı açıyor — kovaladığımız
   * belirtinin ta kendisi.
   *
   * Bunun bir bedeli vardı ve ÖDENDİ: işaret mutlak bir satır numarasıyken,
   * kaydırma geçmişi dolduğunda numaralar aşağı kayıyor, işaret kalıcı olarak
   * ilerde kalıyor ve tarama duruyordu — "uzun süre kullanınca sunucu portu
   * görünmüyor" hatası buydu. Bugün ölçü ÇAPAYA GÖRE (bkz. `anchorLine`),
   * yani kırpma ikisini birlikte kaydırıyor ve karşılaştırma doğru kalıyor.
   */
  if (son <= scanLine) return bitti;

  /*
   * Pencere ALTTAN sınırlı, üstten değil.
   *
   * ÖLÇÜLEN HATA: bir ara `baseY` "kırpılma" sanılıp işaret öne çekiliyordu.
   * Oysa `baseY` her yeni satırda büyüyor. Sonuç: uzun çıktıda işaret her
   * seferinde sona atlıyor ve ARADAKİ satırlar hiç taranmıyordu — sunucu
   * adresi tam oraya düşüyor ve rozet hiç çıkmıyordu.
   *
   * Sınırın tek işi maliyeti bağlamak.
   */
  /*
   * Aralık İMLEÇ SATIRINI DA içeriyor (`scanLine`dan başlıyor, `+1` yok).
   *
   * ÖLÇÜLEN HATA — ve gerçek terminalde koşan test bunu ilk denemede yakaladı:
   * metin imlecin BİR ÜSTÜNDEKİ satıra yazılıyor. `
` imleci bir alta
   * indiriyor, dolayısıyla yazılan içerik `son - 1`de duruyor. `scanLine + 1`
   * ile başlamak o satırı hep atlıyordu ve adres hiç bulunamıyordu.
   *
   * İmleç satırının bir sonraki taramada yeniden okunması da doğru: o satır
   * hâlâ yazılıyor olabilir. Aynı adres iki kez eklenmiyor.
   */
  const ilk = Math.max(scanLine, son - limits.maxLines + 1, 0);

  /*
   * SARILAN satırlar araya satır sonu KONMADAN birleştiriliyor.
   *
   * ÖLÇÜLEN HATA: sunucu şeridinde portsuz bir `localhost` rozeti ve
   * `localhost:1453/port` gibi yarım adresler çıkıyordu. Sebep buydu: uzun bir
   * günlük satırı ekran genişliğinde bitmiyor, xterm devamını ayrı bir tampon
   * satırında tutuyor ve her satırın sonuna satır sonu koymak adresi tam
   * ortasından ikiye bölüyordu. Ortaya çıkan ilk parça (`http://localhost`)
   * tek başına geçerli bir adres olduğu için sessizce rozete dönüşüyordu —
   * yani hata "adres bulunamadı" değil, YANLIŞ adres göstermekti.
   *
   * Pencerenin İLK satırı sarılmış olabilir; başı yukarıda kalıyor ve geri
   * getirilemiyor. Bu bir kayıp değil: o satır bir önceki taramada okundu.
   */
  let metin = "";
  for (let y = ilk; y <= son; y++) {
    if (y > ilk && !ctx.isWrapped(y)) metin += "\n";
    metin += ctx.readLine(y);
  }

  const urls = [...state.urls];
  let changed = false;
  for (const url of extractServerUrls(metin, limits.maxUrls)) {
    if (urls.includes(url)) continue;
    if (urls.length >= limits.maxUrls) break;
    urls.push(url);
    changed = true;
  }

  return { state: { scannedAhead: son - ctx.anchorLine, urls }, changed };
}
