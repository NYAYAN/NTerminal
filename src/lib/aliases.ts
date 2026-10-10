import type { Favorite } from "../types";

/**
 * Favori komut kısaltmaları.
 *
 * İSTEK: "npm run build --configuration için nrb dediğimde çalışsın, yarn
 * start:dev için ysd dediğimde çalışsın. Tabi bu kısayolları biz
 * belirlemeliyiz." Kısaltma favorinin bir alanı; komut kutusunda satırın İLK
 * sözcüğü bir kısaltmaysa Enter favorinin komutunu gönderiyor, arkasına
 * yazılanlar sona ekleniyor (`nrb --watch`).
 *
 * Komut terminalin BULUNDUĞU klasörde çalışıyor — favorinin kayıtlı klasörüne
 * geçilmiyor (istenen bu: "terminalde hangi klasör dizinindeyse orada
 * çalışmalı"). Listeden çalıştırmak ise klasöre geçmeye devam ediyor
 * (`runFavorite`).
 *
 * Açılım yalnızca uygulamanın komut kutusunda: tam ekran programlar ve
 * çalışan bir komutun soruları kabuğun satırı değil. Kabuğun kendi
 * alışkanlığı da korunuyor: `\nrb` kısaltmayı atlıyor — eşleşmiyor, kabuk da
 * ters bölüyü atıp `nrb`yi çalıştırıyor.
 */

/** Kısaltmanın neden kabul edilmediği; geçerliyse null. */
export type AliasProblem =
  | { kind: "space" }
  | { kind: "taken"; favorite: Favorite };

/**
 * Formda yazılan kısaltmayı denetler. Boş kısaltma geçerli (kısaltma yok).
 *
 * Rust tarafı aynı iki kuralı ayrıca uyguluyor (`favorites.rs`); burada
 * denetlemek hatayı kaydetmeden önce, kullanıcının dilinde göstermek için.
 */
export function aliasProblem(
  alias: string,
  favorites: readonly Favorite[],
  selfId: string | null,
): AliasProblem | null {
  const value = alias.trim();
  if (!value) return null;
  // Satırın ilk sözcüğü olarak aranıyor: boşluklu bir kısaltma hiç eşleşmezdi.
  if (/\s/.test(value)) return { kind: "space" };
  const owner = favorites.find((f) => f.alias === value && f.id !== selfId);
  return owner ? { kind: "taken", favorite: owner } : null;
}

/**
 * Satırın ilk sözcüğü bir kısaltmaysa açılımı; değilse null.
 *
 * Kısaltma HER grupta çalışıyor, favori bir gruba bağlı olsa da. BİLDİRİLEN:
 * Yataş grubuna bağlı favorinin kısaltması (`yysd`) NTerminal grubundaki
 * sekmede açılmadı, kabuğa olduğu gibi gitti ("command not found"; uygulama
 * geçmişinde çıkış kodu 127). Grup kısıtı favorinin LİSTEDE nerede
 * göründüğü; kısaltma ise kullanıcının ezberlediği tek sözcük ve her yerde
 * aynı şeyi yapmalı. Kısaltmalar zaten bütün favorilerde tekil
 * (`aliasProblem`, `favorites.rs`): grup ayrımı bir belirsizlik de
 * çözmüyordu. Büyük-küçük harf ayırt ediliyor (komut adları da öyle).
 */
export function expandAlias(
  line: string,
  favorites: readonly Favorite[],
): { text: string; favorite: Favorite } | null {
  const match = /^(\S+)([\s\S]*)$/.exec(line);
  if (!match) return null;
  const [, word, rest] = match;
  const favorite = favorites.find((f) => f.alias === word);
  return favorite ? { text: favorite.command + rest, favorite } : null;
}
