/**
 * Uygulamayla birlikte gelen yazı tipleri.
 *
 * Yazı tipi ayarı serbest metin ve öyle kalmalı — kullanıcının sistemindeki
 * herhangi bir yazı tipini yazabilmesi gerekiyor. Ama serbest metin tek başına
 * gömülü aileleri GÖRÜNMEZ kılıyor: kullanıcı "JetBrains Mono" yazabileceğini
 * bilmiyorsa o dosyalar boşuna paketlenmiş oluyor. Ayarlardaki alan bu yüzden
 * bir öneri listesi (`<datalist>`) gösteriyor; yazmayı engellemiyor, yalnızca
 * neyin hazır olduğunu söylüyor.
 *
 * Buradaki adlar `styles/fonts.css` içindeki `@font-face` aileleriyle birebir
 * aynı olmak zorunda; ayrılırlarsa liste var olmayan bir yazı tipi öneriyor ve
 * seçen kullanıcı sessizce jenerik `monospace`e düşüyor. Test bağlıyor.
 */

export interface BundledFont {
  /** `@font-face` ailesinin adı. */
  family: string;
  /** Ayara yazılan tam yığın: aile + geri düşüş. */
  stack: string;
}

export const BUNDLED_FONTS: BundledFont[] = [
  {
    family: "JetBrains Mono",
    stack: "JetBrains Mono, Menlo, Consolas, monospace",
  },
  {
    family: "IBM Plex Mono",
    stack: "IBM Plex Mono, Menlo, Consolas, monospace",
  },
];

/**
 * Sistemde kurulu olabilecek eş aralıklı yazı tipleri.
 *
 * Neden sabit bir aday listesi: tarayıcı "kurulu yazı tiplerini say" diye bir
 * yol vermiyor. `queryLocalFonts()` var ama izin istiyor ve yalnızca güvenli
 * bağlamda çalışıyor; terminal ayarı için kullanıcıya izin sorusu sormak ağır
 * kaçıyor. Onun yerine bilinen aileleri tek tek DENİYORUZ (bkz.
 * `detectInstalled`).
 *
 * Liste iki platformun varsayılanlarını ve yaygın kurulan açık lisanslı
 * aileleri kapsıyor. Warp'ın varsayılanı Hack, o da burada — kuruluysa
 * seçilebiliyor.
 */
export const CANDIDATE_FONTS: string[] = [
  // Windows
  "Cascadia Code",
  "Cascadia Mono",
  "Consolas",
  "Lucida Console",
  // macOS
  "SF Mono",
  "Menlo",
  "Monaco",
  // Yaygın, açık lisanslı
  "Hack",
  "Fira Code",
  "FiraCode Nerd Font",
  "Source Code Pro",
  "Roboto Mono",
  "Ubuntu Mono",
  "Inconsolata",
  "DejaVu Sans Mono",
  "Liberation Mono",
  "Noto Sans Mono",
  "Anonymous Pro",
  "Space Mono",
  "Victor Mono",
  "Iosevka",
  "MesloLGS NF",
];

/** Bir ailenin ayara yazılacak tam yığını. */
export function fontStack(family: string): string {
  return `${family}, Menlo, Consolas, monospace`;
}

/**
 * Bir yazı tipi ailesi kurulu mu?
 *
 * Ölçüm hilesi: aynı metni "aile, jenerik" ve yalnızca "jenerik" ile çizip
 * genişlikleri karşılaştırıyoruz. Aile yoksa tarayıcı jeneriğe düşüyor ve iki
 * genişlik AYNI çıkıyor.
 *
 * İKİ jenerik deneniyor ve bu şart. Tek jenerikle (`monospace`) ölçmek, aile
 * SİSTEMİN VARSAYILAN eş aralıklısı olduğunda yanlış sonuç veriyor: genişlikler
 * eşit çıkıyor ve kurulu bir yazı tipi "yok" sayılıyor. Windows'ta Consolas tam
 * olarak bu durumda. `sans-serif` ile ölçüm o durumu yakalıyor.
 *
 * Ölçme işlevi DIŞARIDAN veriliyor: gerçek ölçüm canvas gerektiriyor, canvas
 * ise test ortamında yok. Böylece kural test edilebilir kalıyor.
 */
export function isFontInstalled(
  family: string,
  measure: (spec: string) => number,
): boolean {
  for (const generic of ["monospace", "sans-serif"]) {
    const taban = measure(generic);
    const aday = measure(`"${family}", ${generic}`);
    if (taban !== aday) return true;
  }
  return false;
}

/**
 * Makinede kurulu eş aralıklı yazı tipleri — SÜREÇTE BİR KEZ ölçülüyor.
 *
 * Liste yirmi aday × iki canvas ölçümü demek ve ayarlar penceresi her
 * açıldığında yeniden koşuyordu (`useMemo` bileşenle birlikte ölüyor).
 * Kurulu yazı tipleri uygulama çalışırken değişmiyor; değişirse (kullanıcı
 * yeni bir yazı tipi kurarsa) yeniden başlatmak gerekiyor — pencereyi her
 * açılışta yavaşlatmaya değmeyecek bir kenar durum.
 *
 * Canvas yoksa önbelleğe ALINMIYOR: o bir kurulum hatası değil, o anın
 * durumu; bir dahaki denemede ölçüm yapılabilir.
 */
let kuruluOnbellek: string[] | null = null;

export function installedMonoFonts(): string[] {
  if (kuruluOnbellek) return kuruluOnbellek;
  const measure = canvasMeasurer();
  if (!measure) return [];
  const bundled = new Set(BUNDLED_FONTS.map((f) => f.family));
  kuruluOnbellek = detectInstalled(CANDIDATE_FONTS, measure).filter(
    (family) => !bundled.has(family),
  );
  return kuruluOnbellek;
}

/** Adaylardan kurulu olanlar, verilen sırada. */
export function detectInstalled(
  candidates: readonly string[],
  measure: (spec: string) => number,
): string[] {
  return candidates.filter((family) => isFontInstalled(family, measure));
}

/**
 * Tarayıcı tarafı ölçüm işlevi.
 *
 * Büyük punto (72px) bilinçli: küçük puntoda iki farklı yazı tipinin genişliği
 * yuvarlanarak eşitlenebiliyor ve kurulu bir aile "yok" görünüyor. Metin de
 * geniş/dar harfleri birlikte içeriyor, tek harfle ölçüm yanıltıcı.
 */
export function canvasMeasurer(): ((spec: string) => number) | null {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  return (spec: string) => {
    ctx.font = `72px ${spec}`;
    return ctx.measureText("mmmmmmmmmmlliWWW@#0Oo").width;
  };
}
