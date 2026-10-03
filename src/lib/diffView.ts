/**
 * Fark penceresinin çizim kararları: hangi satır ekranın neresinde, imleç
 * nereye gidiyor, satırın hangi parçası hangi renkte.
 *
 * `textDiff.ts` iki metni karşılaştırıyor; burası o sonucu EKRANA çeviriyor.
 * İkisi ayrı çünkü bu kararların hiçbiri farkın kendisini değiştirmiyor ama
 * hepsi bir satır kayınca yanlış satırı boyuyor — ve bileşenin içinde
 * sınanamazlardı.
 */

import type { Fold, InnerFragment, LineChange } from "./textDiff";

// ---------------------------------------------------------- satır modeli

/**
 * Bir tarafın ekrandaki satırları.
 *
 * Katlama bir aralığı TEK satırlık bir yer tutucuya indiriyor, yani ekrandaki
 * sıra ile dosyadaki satır numarası ayrışıyor. Her şey (kaydırma, ortadaki
 * bağlayıcılar, kaydırma çubuğundaki işaretler) ekrandaki sırayla çalışıyor;
 * satır yüksekliği sabit olduğu için sıra × yükseklik = konum.
 */
export interface RowModel {
  /** `rows[i] >= 0` satır numarası; `< 0` katlama: `~rows[i]` katlamanın sırası. */
  rows: Int32Array;
  /** Satırın ekrandaki sırası; katlanmış satırda yer tutucunun sırası. */
  rowOfLine: Int32Array;
}

/** `folds` bu tarafın aralıkları (`[start, end)`), sıralı ve çakışmasız. */
export function buildRows(lineCount: number, folds: readonly { start: number; end: number }[]): RowModel {
  const rows: number[] = [];
  const rowOfLine = new Int32Array(lineCount);
  let line = 0;
  folds.forEach((fold, k) => {
    for (; line < fold.start; line++) {
      rowOfLine[line] = rows.length;
      rows.push(line);
    }
    const at = rows.length;
    rows.push(~k);
    for (; line < fold.end; line++) rowOfLine[line] = at;
  });
  for (; line < lineCount; line++) {
    rowOfLine[line] = rows.length;
    rows.push(line);
  }
  return { rows: Int32Array.from(rows), rowOfLine };
}

/**
 * Kesirli SATIR → kesirli SIRA. Katlanmış aralığın içindeki satır, yer
 * tutucunun içinde orantılı bir noktaya düşüyor: kaydırma eşlemesi katlamanın
 * üstünden atlarken sıçramasın.
 */
export function lineToRow(model: RowModel, folds: readonly { start: number; end: number }[], line: number): number {
  const n = model.rowOfLine.length;
  if (n === 0) return 0;
  if (line >= n) return model.rows.length + (line - n);
  if (line <= 0) return line;
  const whole = Math.floor(line);
  const row = model.rowOfLine[whole];
  const entry = model.rows[row];
  if (entry < 0) {
    const fold = folds[~entry];
    return row + (line - fold.start) / (fold.end - fold.start);
  }
  return row + (line - whole);
}

/** Kesirli SIRA → kesirli SATIR (`lineToRow`un tersi). */
export function rowToLine(model: RowModel, folds: readonly { start: number; end: number }[], row: number): number {
  const count = model.rows.length;
  if (count === 0) return 0;
  if (row <= 0) return row;
  if (row >= count) return model.rowOfLine.length + (row - count);
  const whole = Math.floor(row);
  const entry = model.rows[whole];
  if (entry < 0) {
    const fold = folds[~entry];
    return fold.start + (row - whole) * (fold.end - fold.start);
  }
  return entry + (row - whole);
}

/** Bir tarafın katlama aralıkları (`Fold` iki tarafı birlikte taşıyor). */
export function sideFolds(folds: readonly Fold[], side: 1 | 2): { start: number; end: number }[] {
  return folds.map((f) => (side === 1 ? { start: f.start1, end: f.end1 } : { start: f.start2, end: f.end2 }));
}

// ---------------------------------------------------------------- gezinme

/** Değişikliğin bir taraftaki aralığı. */
export function sideRange(change: LineChange, side: 1 | 2): [number, number] {
  return side === 1 ? [change.start1, change.end1] : [change.start2, change.end2];
}

/**
 * İmlecin ALTINDAKİ ilk değişiklik — "Next Difference" (F7).
 *
 * İmleç bir değişikliğin içindeyse o değil, ondan sonraki: tuşa basan kişi
 * zaten baktığı bloğa değil, bir sonrakine gitmek istiyor.
 */
export function nextChangeIndex(changes: readonly LineChange[], side: 1 | 2, caret: number): number | null {
  for (let i = 0; i < changes.length; i++) {
    if (changes[i].ignored) continue;
    if (sideRange(changes[i], side)[0] > caret) return i;
  }
  return null;
}

/** İmlecin ÜSTÜNDE kalan son değişiklik — "Previous Difference" (Shift+F7). */
export function prevChangeIndex(changes: readonly LineChange[], side: 1 | 2, caret: number): number | null {
  for (let i = changes.length - 1; i >= 0; i--) {
    if (changes[i].ignored) continue;
    const [start, end] = sideRange(changes[i], side);
    if (start < caret && end <= caret) return i;
  }
  return null;
}

/** Satırın üstünde durduğu değişiklik; yoksa `null`. */
export function changeAtLine(changes: readonly LineChange[], side: 1 | 2, line: number): number | null {
  for (let i = 0; i < changes.length; i++) {
    const [start, end] = sideRange(changes[i], side);
    if (start > line) break;
    if (line < end && !changes[i].ignored) return i;
  }
  return null;
}

// ----------------------------------------------------------- satır parçaları

/** Satırın içindeki bir parçanın türü — IntelliJ iç parçaları da türüne göre boyuyor. */
export type FragmentKind = "inserted" | "deleted" | "modified";

/** Satır metninin bir dilimi; `kind` yoksa satırın değişmemiş parçası. */
export interface Segment {
  text: string;
  kind: FragmentKind | null;
  /**
   * Boş parça: bu tarafta karakter yok, karşı tarafta var. Ekranda ince bir
   * dikey çizgi — sözcüğün nereye eklendiğini ya da nereden silindiğini
   * gösteriyor.
   */
  empty?: boolean;
}

/** İç parçanın türü: bir tarafı boşsa ekleme ya da silme. */
export function fragmentKind(f: InnerFragment): FragmentKind {
  if (f.start1 === f.end1) return "inserted";
  if (f.start2 === f.end2) return "deleted";
  return "modified";
}

/**
 * Bir satırın parçaları: bloğun iç parçalarından bu satıra düşenler.
 *
 * İç parçaların konumu BLOĞUN metnine göre (satırlar `\n` ile birleşik), yani
 * `offset` bu satırın bloğun içindeki başlangıcı. Birden fazla satıra yayılan
 * parça her satırda kendi payıyla görünüyor.
 */
export function lineSegments(
  text: string,
  offset: number,
  fragments: readonly InnerFragment[] | null,
  side: 1 | 2,
): Segment[] {
  if (!fragments || fragments.length === 0) return [{ text, kind: null }];
  const out: Segment[] = [];
  const end = offset + text.length;
  let pos = offset;
  for (const f of fragments) {
    const s = side === 1 ? f.start1 : f.start2;
    const e = side === 1 ? f.end1 : f.end2;
    const kind = fragmentKind(f);
    if (s === e) {
      // Boş parça bu satıra düşüyorsa işaretçi. Satır sonundaki konum (`end`,
      // yani `\n`in yeri) bu satırın: sonraki satır `end + 1`den başlıyor,
      // dolayısıyla her konumun tek bir sahibi var.
      if (s < offset || s > end || s < pos) continue;
      if (s > pos) out.push({ text: text.slice(pos - offset, s - offset), kind: null });
      out.push({ text: "", kind, empty: true });
      pos = s;
      continue;
    }
    if (e <= offset || s >= end) continue;
    const from = Math.max(s, offset);
    const to = Math.min(e, end);
    if (from > pos) out.push({ text: text.slice(pos - offset, from - offset), kind: null });
    if (to > from) out.push({ text: text.slice(from - offset, to - offset), kind });
    pos = Math.max(pos, to);
  }
  if (pos < end) out.push({ text: text.slice(pos - offset), kind: null });
  return out.length > 0 ? out : [{ text, kind: null }];
}

/**
 * Bloğun satırlarının, bloğun metnindeki başlangıçları.
 *
 * İç parçalar bloğun `\n` ile birleştirilmiş metnine göre; satır satır
 * çizerken her satırın o metindeki yeri gerekiyor.
 */
export function lineOffsets(lines: readonly string[], start: number, end: number): number[] {
  const out: number[] = [];
  let at = 0;
  for (let i = start; i < end; i++) {
    out.push(at);
    at += lines[i].length + 1;
  }
  return out;
}

// --------------------------------------------------------- birleşik görünüm

/**
 * "Unified viewer"ın satırı: değişmemiş satır iki numarasıyla, değişen bloğun
 * önce eski (silinen) sonra yeni (eklenen) satırları.
 */
export type UnifiedRow =
  | { kind: "same"; line1: number; line2: number }
  | { kind: "old"; line1: number; change: number }
  | { kind: "new"; line2: number; change: number }
  | { kind: "fold"; fold: number };

export function unifiedRows(changes: readonly LineChange[], n1: number, folds: readonly Fold[]): UnifiedRow[] {
  const out: UnifiedRow[] = [];
  let line1 = 0;
  let line2 = 0;
  let foldAt = 0;
  const same = (to1: number) => {
    while (line1 < to1) {
      const fold = folds[foldAt];
      if (fold && fold.start1 === line1) {
        out.push({ kind: "fold", fold: foldAt });
        line2 += fold.end1 - line1;
        line1 = fold.end1;
        foldAt++;
        continue;
      }
      out.push({ kind: "same", line1, line2 });
      line1++;
      line2++;
    }
  };
  changes.forEach((change, index) => {
    same(change.start1);
    line2 = change.start2;
    // Yok sayılan blok (yalnızca boş satırlar) farkta yok: birleşik görünüm
    // YENİ metnin üstüne kurulu, yani yalnızca onun satırları renksiz kalıyor.
    if (change.ignored) {
      for (let j = change.start2; j < change.end2; j++) out.push({ kind: "same", line1: -1, line2: j });
    } else {
      for (let i = change.start1; i < change.end1; i++) out.push({ kind: "old", line1: i, change: index });
      for (let j = change.start2; j < change.end2; j++) out.push({ kind: "new", line2: j, change: index });
    }
    line1 = change.end1;
    line2 = change.end2;
  });
  same(n1);
  return out;
}
