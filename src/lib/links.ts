/**
 * Terminal çıktısındaki bağlantıları bulma.
 *
 * Neden xterm'in kendi bağlantı sağlayıcısını kullanmıyoruz: o sağlayıcı
 * yalnızca imleç bağlantının üzerine geldiğinde çalışıyor ve bağlantıyı
 * KALICI olarak işaretleyemiyor (`ILinkProviderOptions` içinde renk/biçim
 * seçeneği yok). Kalıcı renk için xterm'in dekorasyon API'sine bağlantının
 * satır ve hücre aralığını vermek gerekiyor — bu modül onu üretiyor.
 */

export interface LinkMatch {
  /** Metin içindeki başlangıç indeksi (dahil). */
  start: number;
  /** Metin içindeki bitiş indeksi (hariç). */
  end: number;
  /** Açılacak adres; `www.` ile başlıyorsa şema eklenir. */
  url: string;
}

/**
 * Adres gövdesi.
 *
 * Boşluk ve terminal çıktısında adresi çevreleyen tipik karakterler dışarıda:
 * `<>"'` sarmalayıcı, `` ` `` kabuk, `{}|\^[]` ise RFC 3986'da adres gövdesinde
 * geçemeyen karakterler. Kapanış parantezi bilinçli olarak İÇERİDE: Wikipedia
 * gibi adreslerde geçiyor, dengesizse aşağıda kırpılıyor.
 */
const URL_RE = /(?:https?:\/\/|www\.)[^\s<>"'`{}|\\^[\]]+/gi;

/** Adresin sonuna yapışan noktalama. */
const TRAILING = new Set([".", ",", ";", ":", "!", "?", "'", '"', "*", "_", "~"]);

/**
 * Sondaki noktalamayı kırpar.
 *
 * Terminal çıktısında adres neredeyse her zaman bir cümlenin ya da parantezin
 * içinde geçiyor: `bkz. http://a/b.` — sondaki nokta adrese ait değil.
 * Kapanış parantezi ise ancak DENGESİZSE kırpılıyor; `http://a/b_(c)` gibi
 * adreslerde parantez adrese ait.
 */
function trimTrailing(text: string): string {
  let end = text.length;
  for (;;) {
    if (end === 0) break;
    const ch = text[end - 1];

    if (TRAILING.has(ch)) {
      end -= 1;
      continue;
    }

    if (ch === ")" || ch === "]" || ch === "}") {
      const open = ch === ")" ? "(" : ch === "]" ? "[" : "{";
      const slice = text.slice(0, end);
      let balance = 0;
      for (const c of slice) {
        if (c === open) balance += 1;
        else if (c === ch) balance -= 1;
      }
      // balance < 0 → fazladan kapanış var, adrese ait değil.
      if (balance < 0) {
        end -= 1;
        continue;
      }
    }

    break;
  }
  return text.slice(0, end);
}

/** Bir metin satırındaki bağlantıları bulur. */
export function findLinks(text: string): LinkMatch[] {
  const out: LinkMatch[] = [];
  if (!text) return out;

  URL_RE.lastIndex = 0;
  for (;;) {
    const match = URL_RE.exec(text);
    if (!match) break;

    const raw = match[0];
    const trimmed = trimTrailing(raw);
    // Kırpma sonrası gövde kalmadıysa (örnek: "www.") bağlantı sayılmıyor.
    const body = trimmed.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
    if (!body || !trimmed) continue;

    out.push({
      start: match.index,
      end: match.index + trimmed.length,
      url: /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`,
    });
  }
  return out;
}

/** xterm hücresinin ihtiyaç duyduğumuz kadarı. */
export interface CellLike {
  /** Hücrenin taşıdığı karakter(ler); birleşik karakterlerde birden fazla. */
  chars: string;
  /** Genişlik: 1 normal, 2 geniş (CJK), 0 geniş karakterin ikinci yarısı. */
  width: number;
}

/**
 * Hücrelerden satır metni ve "metin indeksi → hücre indeksi" eşlemesi.
 *
 * Neden gerekli: dekorasyon konumu HÜCRE cinsinden veriliyor, bağlantı ise
 * METİN içinde bulunuyor. Geniş karakterler (CJK) iki hücre kaplıyor ve
 * birleşik karakterler tek hücrede birden fazla karakter taşıyor — ikisi de
 * indeksleri kaydırıyor. Eşleme olmadan Türkçe/CJK içeren bir satırda
 * bağlantının rengi yanlış hücrelere düşüyor.
 */
export function readCells(cells: CellLike[]): { text: string; cellOf: number[] } {
  let text = "";
  const cellOf: number[] = [];

  for (let index = 0; index < cells.length; index++) {
    const cell = cells[index];
    // Genişliği 0 olan hücre, önceki geniş karakterin ikinci yarısı: metne
    // katkısı yok.
    if (cell.width === 0) continue;
    const chars = cell.chars === "" ? " " : cell.chars;
    for (let i = 0; i < chars.length; i++) {
      text += chars[i];
      cellOf.push(index);
    }
  }

  return { text, cellOf };
}

export interface CellRange {
  /** Başlangıç hücresi. */
  x: number;
  /** Kaç hücre. */
  width: number;
  url: string;
}

/**
 * Bağlantıları hücre aralıklarına çevirir.
 *
 * Sondaki hücre de dahil: `end` hariç bir indeks olduğu için son karakterin
 * hücresini `end - 1` üzerinden buluyoruz, genişliğini de o hücrenin
 * kapladığı kadar sayıyoruz.
 */
export function linkCellRanges(cells: CellLike[]): CellRange[] {
  const { text, cellOf } = readCells(cells);
  const out: CellRange[] = [];

  for (const link of findLinks(text)) {
    const first = cellOf[link.start];
    const lastCharCell = cellOf[link.end - 1];
    if (first === undefined || lastCharCell === undefined) continue;
    // Son karakterin hücresi geniş olabilir; kapladığı hücreleri de sayıyoruz.
    const lastWidth = Math.max(1, cells[lastCharCell]?.width ?? 1);
    out.push({ x: first, width: lastCharCell + lastWidth - first, url: link.url });
  }

  return out;
}
