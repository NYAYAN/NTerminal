import type { MsgKey } from "./messages";

/**
 * Arayüz TASARIMI: renk temasından ayrı bir eksen.
 *
 * Tema RENKLERİ söylüyor (zemin, metin, vurgu, palet); tasarım ise BİÇİMİ:
 * köşe yarıçapı, kenarlık ağırlığı, gölge, katman ve cam etkisi. İkisi
 * bağımsız — Solarized Açık'ı Premium ile ya da N-Terminal Koyu'yu Klasik ile
 * kullanmak mümkün. Tek ayara bağlamak her tema için iki kopya ister ve
 * kullanıcıya "rengini sevdiğim temanın sade hâli yok" dedirtirdi.
 *
 * - `classic`: uygulamanın ilk günden beri taşıdığı düz, yoğun ve sıkı düzen.
 * - `premium`: katmanlı yüzeyler, yumuşak gölgeler, ince hat kenarlıklar,
 *   yuvarlatılmış köşeler ve yüzen menülerde cam (bulanıklık) etkisi.
 * - `kokpit`: premium'un görünüşü, başka bir YERLEŞİM. Solda grupların ikon
 *   rayı, yanında yalnızca etkin grubun sekmeleri kart kart (son komutu ve
 *   durumuyla), sağda yan panel terminalin üstüne binmeden sabit bir sütun.
 *   İSTEK: "C'yi Görünümden seçebilir olarak kurabilir miyiz. Kişiler görünüm
 *   geçişi yapabilsin."
 *
 * Uygulama tamamen CSS'te: kök öğeye `data-design` yazılıyor ve
 * `styles/premium.css` yalnızca `:root[data-design="premium"]` altında
 * kurallar taşıyor. Klasik için ek kural YOK — klasik, `global.css`in
 * kendisi. Böylece tasarım değiştirmek yeniden çizim ya da yeniden
 * başlatma istemiyor ve klasik tasarımın bozulma riski sıfır.
 */
export type Design = "classic" | "premium" | "kokpit";

export interface DesignInfo {
  id: Design;
  nameKey: MsgKey;
  descKey: MsgKey;
}

export const DESIGNS: readonly DesignInfo[] = [
  { id: "premium", nameKey: "design.premium", descKey: "design.premiumDesc" },
  { id: "kokpit", nameKey: "design.kokpit", descKey: "design.kokpitDesc" },
  { id: "classic", nameKey: "design.classic", descKey: "design.classicDesc" },
];

/**
 * Varsayılan KOKPİT.
 *
 * İSTEK: "uygulamayı güncelleyenler kokpit görünümü default olarak görsünler.
 * Default ayar olarak kokpit olmalı, ilk kurulumda da aynı şekilde." İkisi tek
 * değerle karşılanıyor: yeni kurulumda ve alanı olmayan eski bir
 * `settings.json`da (tasarım ayarı v0.3.3'ten sonra geldi; Rust tarafı
 * `serde(default)` ile aynı değere düşüyor, bkz. `model.rs`) uygulama
 * Kokpit'le açılıyor. Başka tasarım isteyen Ayarlar › Görünüm › Tasarım'dan
 * tek tıkla dönüyor; seçilen tasarım kaydedildiği için bir daha değişmiyor. `model.rs` ile AYNI kalmalı — ayrışırlarsa açılışın ilk
 * karesi bir tasarımda, ayarlar diskten gelince öteki tasarımda çizilir.
 */
export const DEFAULT_DESIGN: Design = "kokpit";

export function isDesign(value: unknown): value is Design {
  return DESIGNS.some((d) => d.id === value);
}

/**
 * Görünüş (`data-design`) ve yerleşim (`data-layout`) ayrı iki eksen.
 *
 * Kokpit premium'un BÜTÜN cilasını taşıyor (kartlar, anahtarlar, cam menüler,
 * Ayarlar penceresi); farkı yalnızca yerleşim. O yüzden belgeye görünüş olarak
 * `premium`, yerleşim olarak `kokpit` yazılıyor: `premium.css` olduğu gibi
 * geçerli, `kokpit.css` yalnızca yerleşimi değiştiriyor. Premium kurallarını
 * iki kez yazmak ya da her seçiciyi iki tasarıma genişletmek gerekmiyor.
 */
export function designLook(design: Design): "classic" | "premium" {
  return design === "classic" ? "classic" : "premium";
}

export function designLayout(design: Design): "kokpit" | null {
  return design === "kokpit" ? "kokpit" : null;
}

/**
 * Tasarımı belgeye yazar. Tema uygulanan her yerde (açılış, ayar yaması,
 * sıfırlama, fark penceresi) hemen ardından çağrılıyor; CSS gerisini
 * hallediyor.
 */
export function applyDesignToDocument(design: Design): void {
  const root = document.documentElement;
  root.dataset.design = designLook(design);
  const layout = designLayout(design);
  if (layout) root.dataset.layout = layout;
  else delete root.dataset.layout;
}
