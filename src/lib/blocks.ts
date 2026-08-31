/**
 * Komut blokları — Warp'ın üst alandaki düzeni.
 *
 * ## Blok nedir
 *
 * Bir istem satırı, ona yazılan komut ve o komutun bütün çıktısı: birlikte tek
 * bir birim. Terminalde bunlar ayrımsız bir metin ırmağı; nerede bittiğini göz
 * arıyor. Blok, sınırı görünür kılıyor — ve sınır görünür olunca "bu komut
 * başarılı mıydı", "şu çıktı hangi komuta aitti", "bunu yeniden çalıştır" gibi
 * sorular tek bakışta yanıtlanıyor.
 *
 * ## Neden terminali yeniden yazmıyoruz
 *
 * Warp çıktıyı kendi çiziyor. Biz çizmiyoruz ve bu bilinçli: ızgarayı bırakmak
 * `vim`i, `less`i, arama eklentisini, bağlantı renklendirmesini, seçimi ve
 * hızı birden kaybetmek demek. Onun yerine sınırları xterm'in İŞARETÇİLERİNDEN
 * (marker) okuyup üstüne bir katman çiziyoruz. İşaretçiyi xterm kendisi
 * güncelliyor: tampon kayınca satır numarası da kayıyor, kaydırma geçmişinden
 * düşünce işaretçi kendini kapatıyor.
 *
 * Buradaki işlevler saf: satır numaraları ve hücre yüksekliğinden piksel
 * hesaplıyorlar. Gerçek terminalde denemesi zor olan kısım tam da bu hesap.
 */

/** Bir bloğun çizim için gereken hâli. */
export interface BlockView {
  id: string;
  /** Bloğun ilk satırı (mutlak tampon satırı). */
  startLine: number;
  /** Bloğun son satırı (dahil). Açık blokta null. */
  endLine: number | null;
  command: string | null;
  /** Komutun çalıştırıldığı dizin — başlıkta gösteriliyor. */
  cwd: string | null;
  exitCode: number | null;
  durationMs: number | null;
  running: boolean;
}

/** Görünümün ölçüleri. */
export interface Viewport {
  /** Görünümün ilk satırı (mutlak tampon satırı). */
  top: number;
  /** Görünen satır sayısı. */
  rows: number;
  /** Bir satırın yüksekliği (px). */
  cellHeight: number;
}

export interface Rect {
  top: number;
  height: number;
}

/**
 * Bloğun görünümdeki dikdörtgeni; görünümün dışındaysa null.
 *
 * Kırpma ŞART, süs değil: bir blok binlerce satır çıktı üretebiliyor ve
 * kırpılmadan çizilen kutu görünümün metrelerce dışına taşıyor. Tarayıcı bunu
 * çizmeye çalışırken kaydırma tutukluyor. Kırpılmış kutu her zaman ekran
 * boyunda kalıyor.
 *
 * Açık blok (`endLine === null`) görünümün sonuna kadar uzanıyor: komut hâlâ
 * çalışıyor ve nerede biteceği bilinmiyor.
 */
export function blockRect(block: BlockView, view: Viewport): Rect | null {
  const viewEnd = view.top + view.rows - 1;
  const end = block.endLine ?? viewEnd;

  // Tümüyle görünümün dışında.
  if (end < view.top || block.startLine > viewEnd) return null;

  const ilk = Math.max(block.startLine, view.top);
  const son = Math.min(end, viewEnd);
  return {
    top: (ilk - view.top) * view.cellHeight,
    height: (son - ilk + 1) * view.cellHeight,
  };
}

/** Görünüme değen bloklar. */
export function visibleBlocks(blocks: readonly BlockView[], view: Viewport): BlockView[] {
  return blocks.filter((block) => blockRect(block, view) !== null);
}

/**
 * Bloğun durumu — şeridin rengi buna göre.
 *
 * Üç durum var ve üçü de ayrı bir soruya yanıt: hâlâ mı çalışıyor, bitti mi,
 * hata mı verdi. Çıkış kodu bilinmiyorsa (işaret göndermeyen kabuk, yarıda
 * kesilen oturum) "sessiz" kalıyoruz: yeşil göstermek yanlış güven verirdi.
 */
export type BlockTone = "running" | "ok" | "fail" | "unknown";

/**
 * Blok çizilmeye değer mi?
 *
 * ÖLÇÜLEN BELİRTİ: `clear` sonrası ekranın dibinde iki rozet üst üste
 * kalıyordu — biri `clear` komutunun bloğu, biri bekleyen istem. `clear`
 * ekranı boşalttığı için o bloğun satırlarında gösterilecek bir şey yok;
 * geriye yalnızca başlık rozeti kalıyor ve temiz bir ekran bekleyen kullanıcıya
 * iki satırlık artık gösteriyor.
 *
 * Kural İÇERİĞE bakıyor, kaçış dizisine değil. `clear`ın ekranı nasıl
 * temizlediği (`ESC[2J` mi, satır satır boşluk mu) ConPTY'nin işi ve sürümüne
 * göre değişiyor; "satırları boşsa gösterme" her iki yolda da doğru sonucu
 * veriyor.
 *
 * ## Neden ÖRNEKLEME
 *
 * İlk hâli yalnızca KISA blokları (üç satıra kadar) denetliyordu; uzun bloğun
 * içeriği olduğu varsayılıyordu. Ölçülen belirti bu varsayımı çürüttü: `ls`
 * çıktısı otuz satırlık bir blok, `clear` ekranı siliyor ve blok "uzun" olduğu
 * için hiç denetlenmiyor — geriye metinsiz, upuzun bir şerit kalıyor.
 *
 * Bütün satırları okumak da doğru değil: bir blok binlerce satır olabiliyor ve
 * bu denetim her karede koşuyor. Onun yerine bloğa YAYILMIŞ en fazla
 * `maxProbes` satır okunuyor. Hepsi boşsa blok boş sayılıyor.
 *
 * Yanılma payı: aralara serpilmiş boş satırlarla dolu, içeriği tam da
 * örneklenmeyen satırlarda olan bir blok gizlenebilir. Yirmi dört örnekte bunun
 * olması için bloğun kasten öyle kurulması gerekiyor.
 */
export function hasVisibleContent(
  block: BlockView,
  read: (from: number, to: number) => string,
  maxProbes = 24,
): boolean {
  // Bekleyen istem: gösterilecek çıktısı zaten yok, başlık tek başına anlamlı.
  if (!block.command) return true;
  // Açık blok: komut çalışıyor, çıktısı henüz gelmemiş olabilir.
  if (block.endLine === null) return true;

  const satir = block.endLine - block.startLine + 1;
  if (satir <= maxProbes) {
    return read(block.startLine, block.endLine).trim().length > 0;
  }

  // Yayılmış örnekleme: ilk ve son satır her zaman içeride.
  const adim = (satir - 1) / (maxProbes - 1);
  for (let i = 0; i < maxProbes; i++) {
    const y = block.startLine + Math.round(i * adim);
    if (read(y, y).trim().length > 0) return true;
  }
  return false;
}

export function blockTone(block: BlockView): BlockTone {
  if (block.running) return "running";
  if (block.exitCode === null) return "unknown";
  return block.exitCode === 0 ? "ok" : "fail";
}
