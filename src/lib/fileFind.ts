import { t } from "./i18n";
import { matchCombo } from "./keys";
import type { SearchFlags } from "../types";

/**
 * Açık dosyada arama (görüntüleyicinin `Cmd+F` / `Ctrl+Shift+F` çubuğu).
 *
 * BİLDİRİLEN: "bir dosya açıkken arama için Cmd+F yapınca gidip terminalden
 * search ediyor, dosyadan değil." Görüntüleyicinin kendi araması yoktu;
 * kısayol paneli kapatıp terminalde arıyordu.
 *
 * ## Kurallar içerik aramasıyla AYNI
 *
 * Seçenekler (Aa, tam sözcük, düzenli ifade) paletin ve dosya sütununun
 * "İçerik" aramasıyla paylaşılıyor (`ui.searchFlags`). Orada arama Rust'ta
 * (`search::matcher`); aynı sorgu iki yerde farklı eşleşirse "sütunda var,
 * dosyada yok" denirdi. Bu yüzden oradaki kurallar burada da:
 *
 *  - varsayılan büyük/küçük harf GÖZETMEYEN arama;
 *  - tam sözcükte düz metin yalnızca SÖZCÜK karakteriyle biten ucundan
 *    sınırlanıyor (`foo(` aranınca `foo()` eşleşmeli);
 *  - düzenli ifade tam sözcükte `\b(?:…)\b` ile sarılıyor;
 *  - `^` ve `$` satırın başı ve sonu.
 *
 * Sözcük sınırı Unicode'a göre. JavaScript'in `\b`'si yalnızca ASCII harfleri
 * sözcük sayıyor: `çalış` tam sözcük aranınca baştaki `ç` "sözcük değil"
 * sayılır ve hiçbir şey eşleşmezdi. Rust'ın `\b`'si Unicode. Aynı sınır
 * düzenli ifadenin İÇİNDE kurulamıyor — önceki harfe bakmak geri bakış ister ve
 * arayüz kodunda geri bakış yok (eski WebKit bütün dosyayı reddediyor, bkz.
 * `webkitDenetimi.test.ts`). Sınır eşleşmeden SONRA, iki yanındaki harfe
 * bakılarak sınanıyor (`wholeWordCheck`).
 */

/** Bir eşleşme: satır (0'dan) ve satırdaki `[start, end)` — UTF-16 birimiyle. */
export interface FindMatch {
  line: number;
  start: number;
  end: number;
}

export interface FindResult {
  matches: FindMatch[];
  /** `MAX_FIND_MATCHES`a takıldı: başka eşleşmeler de var. */
  capped: boolean;
  /** Sorgu düzenli ifade olarak derlenemedi; kullanıcıya gösterilecek cümle. */
  error: string | null;
}

/**
 * İşaretlenen eşleşme sınırı.
 *
 * Yarım megabaytlık bir dosyada tek harf aramak yüz binlerce eşleşme demek;
 * her biri ekranda bir `<mark>`. Sınır SÖYLENİYOR ("9999+"): kesilen bir
 * sayıyı tam sanmak olmasın.
 */
export const MAX_FIND_MATCHES = 9_999;

/** Rust `regex`inin Unicode `\w`'si — köşeli parantezsiz, sınıfın içine de yazılabilsin. */
const WORD_CHARS = "\\p{Alphabetic}\\p{M}\\p{Nd}\\p{Pc}\\p{Join_Control}";
const WORD = new RegExp(`^[${WORD_CHARS}]$`, "u");

/** `at`ta başlayan karakter (vekil çifti bütün) sözcük karakteri mi. */
function wordAt(text: string, at: number): boolean {
  if (at >= text.length) return false;
  return WORD.test(String.fromCodePoint(text.codePointAt(at)!));
}

/** `at`tan önceki karakter sözcük karakteri mi. */
function wordBefore(text: string, at: number): boolean {
  if (at <= 0) return false;
  const low = text.charCodeAt(at - 1);
  const pair = low >= 0xdc00 && low <= 0xdfff && at >= 2;
  return wordAt(text, pair ? at - 2 : at - 1);
}

/** Düz metinde tam sözcük sınırı yalnızca bu karakterlerle biten uçta (Rust: `is_alphanumeric() || '_'`). */
const WORDISH = /^[\p{Alphabetic}\p{N}_]$/u;

/** `u` kipinde kaçırılabilen (sözdizimi) karakterler. */
const SYNTAX = "^$\\.*+?()[]{}|/";

/** Düz metni düzenli ifadede harfi harfine aranır hâle getirir. */
export function escapeText(text: string): string {
  return text.replace(/[\\^$.*+?()[\]{}|/]/g, "\\$&");
}

/**
 * Kullanıcının düzenli ifadesini Rust'ın anlamıyla JavaScript'e taşır.
 *
 * İki fark kapatılıyor:
 *
 *  - SÖZCÜK SINIFLARI. JavaScript'te `\w` ve `\d` yalnızca ASCII; Rust'ta
 *    Unicode. `\w+` "çalış"ın `ç`sinde dururdu, içerik aramasında bulunan satır
 *    dosyada bulunmazdı. `\w`, `\W`, `\d`, `\D` Unicode karşılıklarına
 *    çevriliyor. Sınıfın içindeki `\W` ASCII kalıyor (`u` kipinde bir birleşimin
 *    tümleyeni sınıfa yazılamıyor). Kullanıcının yazdığı `\b` / `\B`
 *    JavaScript'in (ASCII): Unicode sınırı geri bakış isterdi (bkz. dosya başı);
 *    Unicode'a göre tam sözcük için seçenek var.
 *  - GEREKSİZ KAÇIŞLAR. Rust `\-`, `\#`, `\:` gibi kaçışları kabul ediyor;
 *    JavaScript'in `u` kipi (Unicode sınıfları için şart) yalnızca sözdizimi
 *    karakterlerinin kaçışını kabul ediyor ve `foo\-bar` "geçersiz" sayılırdı.
 *    Karakter `\xHH` olarak yazılıyor: sınıfın içinde de dışında da yalnızca o
 *    karakter demek.
 */
function portPattern(pattern: string): string {
  let out = "";
  let inClass = false;
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch !== "\\" || i + 1 >= pattern.length) {
      if (ch === "[" && !inClass) inClass = true;
      else if (ch === "]" && inClass) inClass = false;
      out += ch;
      continue;
    }
    const next = pattern[i + 1];
    i += 1;
    if (next === "w") out += inClass ? WORD_CHARS : `[${WORD_CHARS}]`;
    else if (next === "W" && !inClass) out += `[^${WORD_CHARS}]`;
    else if (next === "d") out += "\\p{Nd}";
    else if (next === "D") out += "\\P{Nd}";
    else {
      const code = next.charCodeAt(0);
      // Yazdırılabilir ASCII, harf ya da rakam değil (boşluk da: `\ `).
      const punct = code >= 0x20 && code < 0x7f && !/[A-Za-z0-9]/.test(next);
      out += punct && !SYNTAX.includes(next) ? `\\x${code.toString(16).padStart(2, "0")}` : ch + next;
    }
  }
  return out;
}

/** Bir kod noktası ileri: boş eşleşmede `u` kipinde vekil çifti bölünmesin. */
function nextIndex(text: string, at: number): number {
  const code = text.charCodeAt(at);
  return code >= 0xd800 && code <= 0xdbff && at + 1 < text.length ? at + 2 : at + 1;
}

/** Eşleşme tam sözcük kuralına uyuyor mu (satır, `[start, end)`). */
type WordCheck = (text: string, start: number, end: number) => boolean;

/**
 * Tam sözcük sınaması — Rust'ın sardığı `\b`lerin karşılığı.
 *
 *  - Düz metin: yalnızca sözcük karakteriyle biten uçta sınır var; o uçtaki
 *    komşu sözcük karakteri olmamalı.
 *  - Düzenli ifade (`\b(?:…)\b`): iki uçta da sınır — uçtaki karakterle komşusu
 *    farklı türde (biri sözcük, öbürü değil).
 *
 * Sınır eşleşmeden sonra sınandığı için düzenli ifadede küçük bir fark kalıyor:
 * `a|ab` aynı yerde önce `a`yı buluyor, `a` sınava takılınca `ab` denenmeden
 * sonraki harfe geçiliyor. Rust `ab`yi bulurdu.
 */
function wholeWordCheck(query: string, regex: boolean): WordCheck {
  if (regex) {
    return (text, start, end) =>
      wordAt(text, start) !== wordBefore(text, start) && wordBefore(text, end) !== wordAt(text, end);
  }
  const chars = [...query];
  const before = WORDISH.test(chars[0] ?? "");
  const after = WORDISH.test(chars[chars.length - 1] ?? "");
  return (text, start, end) => !(before && wordBefore(text, start)) && !(after && wordAt(text, end));
}

/** Sorguyu eşleyiciye çevirir; derlenemezse hata cümlesi. */
export function findMatcher(
  query: string,
  flags: SearchFlags,
): { re: RegExp; check: WordCheck | null } | { error: string } {
  const pattern = flags.regex ? portPattern(query) : escapeText(query);
  try {
    return {
      re: new RegExp(pattern, flags.caseSensitive ? "gu" : "giu"),
      check: flags.wholeWord ? wholeWordCheck(query, flags.regex) : null,
    };
  } catch (err) {
    // Motorun cümlesi: "Invalid regular expression: /a(/giu: Unterminated group"
    // (V8) ya da "Invalid regular expression: missing )" (WebKit). Kullanıcıya
    // yalnızca neden: kalıbı ve bayrakları kutuda zaten görüyor.
    const detail =
      err instanceof Error
        ? err.message.replace(/^Invalid regular expression:\s*/i, "").replace(/^\/.*\/[a-z]*:\s*/s, "")
        : String(err);
    return { error: t("search.badRegex", { detail }) };
  }
}

/**
 * Satırlarda arar. Sorgu boşsa sonuç boş.
 *
 * Satır satır: bir eşleşme satır sonunu aşmıyor (görüntüleyici satır satır
 * işaretliyor). Boş eşleşmeler (`a*`, `^`) işaretlenecek bir şey olmadığı için
 * sayılmıyor.
 */
export function findInLines(
  lines: readonly string[],
  query: string,
  flags: SearchFlags,
  limit = MAX_FIND_MATCHES,
): FindResult {
  if (!query) return { matches: [], capped: false, error: null };
  const matcher = findMatcher(query, flags);
  if ("error" in matcher) return { matches: [], capped: false, error: matcher.error };
  const { re, check } = matcher;
  const matches: FindMatch[] = [];
  for (let line = 0; line < lines.length; line++) {
    const text = lines[line];
    if (!text) continue;
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      // Boş eşleşme ya da tam sözcüğe uymuyor: bir karakter ileriden devam
      // (`foo` "xfoo foo"da ilk yerde takılınca ikinciyi bulsun).
      if (end === start || (check && !check(text, start, end))) {
        if (start >= text.length) break;
        re.lastIndex = nextIndex(text, start);
        continue;
      }
      if (matches.length === limit) return { matches, capped: true, error: null };
      matches.push({ line, start, end });
    }
  }
  return { matches, capped: false, error: null };
}

/**
 * `(line, col)` konumunda ya da sonrasında başlayan ilk eşleşmenin sırası;
 * sonrasında yoksa başa dönülüyor (ilk eşleşme). Eşleşme yoksa -1.
 *
 * Yazdıkça daralan arama yerinde kalsın diye: "fo" yazarken işaretli
 * eşleşme "foo"ya geçince aynı yerde durmalı, dosyanın başına sıçramamalı.
 */
export function matchAtOrAfter(matches: readonly FindMatch[], line: number, col: number): number {
  if (matches.length === 0) return -1;
  let lo = 0;
  let hi = matches.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const m = matches[mid];
    if (m.line < line || (m.line === line && m.start < col)) lo = mid + 1;
    else hi = mid;
  }
  return lo < matches.length ? lo : 0;
}

/** Sayaç metni: "3/12", sınıra takıldıysa "3/9999+". */
export function findCount(result: FindResult | null, active: number): string {
  if (!result || result.error) return "";
  const total = result.matches.length;
  return `${total === 0 ? 0 : active + 1}/${total}${result.capped ? "+" : ""}`;
}

/**
 * Aramayı açan tuş mu: ayarlardaki kısayol (varsayılanı mac'te `Cmd+F`,
 * Windows'ta `Ctrl+Shift+F`) ya da platformun kendi "bul" tuşu.
 *
 * Görüntüleyicinin içindeyken Windows'ta `Ctrl+F` de açıyor: bir metin
 * görüntüleyicisinde "bul"un tuşu o (IDE'ler, tarayıcı, Not Defteri). Terminalde
 * `Ctrl+F` kabuğun tuşu (imleç bir harf ileri); orada bu kural yok, yalnızca
 * görüntüleyicinin kendi tuş dinleyicisinde.
 */
export function isFindKey(event: KeyboardEvent, binding: string | undefined, mac: boolean): boolean {
  if (binding && matchCombo(event, binding)) return true;
  return matchCombo(event, mac ? "Cmd+F" : "Ctrl+F");
}

/**
 * Açık görüntüleyicinin aramayı açan işlevi.
 *
 * Kısayolun genel dinleyicisi (`App.tsx`) görüntüleyicinin içini bilmiyor;
 * görüntüleyici açıkken kendini buraya kaydediyor. Yalnızca METİN
 * görüntüleyicisi kaydoluyor: görselde aranacak metin yok, orada kısayol eskisi
 * gibi terminalde arıyor.
 */
let opener: (() => void) | null = null;

/** Görüntüleyici kaydolur; dönen işlev kaydı siler (başkası kaydolduysa dokunmaz). */
export function provideViewerFind(open: () => void): () => void {
  opener = open;
  return () => {
    if (opener === open) opener = null;
  };
}

/** Açık bir metin görüntüleyicisi var mı. */
export function viewerFindAvailable(): boolean {
  return opener !== null;
}

/** Görüntüleyicinin aramasını açar (açıksa kutuya odaklanır). */
export function openViewerFind(): void {
  opener?.();
}
