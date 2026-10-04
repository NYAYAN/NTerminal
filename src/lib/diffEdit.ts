/**
 * Fark penceresinin sağ tarafını yazmak: satır sonları, geri alma ve girinti.
 *
 * İSTEK: "Düzenle de bizim terminalimizde olmalı" — IntelliJ'deki gibi fark
 * penceresinin sağ tarafı doğrudan yazılabilir ve yazdıkça fark güncelleniyor.
 * Yazı alanı bir `<textarea>`; bu modül onun DOM'dan bağımsız yarısı.
 *
 * Metin her yerde dosyanın KENDİ biçiminde (ham, `\r\n` dahil) tutuluyor:
 * fark, `»` ve kayıt onu kullanıyor. Yazı alanı ise her satır sonunu `\n`e
 * çeviriyor; çeviri yalnızca yazı alanının kapısında (`toDisplay` / `toFile`).
 */

/** Düzenlenebilir bir dosyanın satır sonu. */
export type Eol = "\n" | "\r\n";

/**
 * Dosyanın satır sonu; düzenlenebilmesi için TEK biçim olmalı.
 *
 * Karışık (bazı satırlar CRLF, bazıları LF) ya da yalnız CR olan dosyada
 * `null`: yazı alanı hepsini `\n` yapıyor ve geri yazarken hangisinin nerede
 * olduğu bilinemezdi — dokunulmayan satırlar da değişirdi.
 */
export function editableEol(raw: string): Eol | null {
  let cr = 0;
  let lf = 0;
  let crlf = 0;
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    if (c === 13) {
      cr++;
      if (raw.charCodeAt(i + 1) === 10) crlf++;
    } else if (c === 10) lf++;
  }
  if (cr === 0) return "\n";
  return cr === crlf && lf === crlf ? "\r\n" : null;
}

/** Dosya metni → yazı alanının metni (satır sonları `\n`). */
export function toDisplay(raw: string, eol: Eol): string {
  return eol === "\r\n" ? raw.replaceAll("\r\n", "\n") : raw;
}

/** Yazı alanının metni → dosyaya yazılacak metin. */
export function toFile(display: string, eol: Eol): string {
  return eol === "\r\n" ? display.replaceAll("\n", "\r\n") : display;
}

/**
 * Ham metindeki bir konumun yazı alanındaki karşılığı: öncesindeki her `\r\n`
 * yazı alanında tek karakter.
 */
export function displayOffset(raw: string, offset: number, eol: Eol): number {
  if (eol === "\n") return offset;
  let n = 0;
  for (let i = raw.indexOf("\r\n"); i >= 0 && i < offset; i = raw.indexOf("\r\n", i + 2)) n++;
  return offset - n;
}

// ------------------------------------------------------------------ düzenleme

/** Tek bir değişiklik: `at`teki `removed` yerine `inserted`. */
export interface TextEdit {
  at: number;
  removed: string;
  inserted: string;
}

/**
 * İki metnin farkı tek bir değişiklik olarak: ortak baş ve son ayıklanıyor.
 *
 * Yazı alanı yalnızca yeni metni veriyor; tuşa basmak, yapıştırmak, sürükleyip
 * bırakmak hep bitişik tek bir aralığı değiştiriyor, yani bu her zaman doğru
 * aralığı buluyor. Aynıysa `null`.
 */
export function textEdit(before: string, after: string): TextEdit | null {
  if (before === after) return null;
  const max = Math.min(before.length, after.length);
  let p = 0;
  while (p < max && before.charCodeAt(p) === after.charCodeAt(p)) p++;
  let s = 0;
  while (
    s < max - p &&
    before.charCodeAt(before.length - 1 - s) === after.charCodeAt(after.length - 1 - s)
  ) {
    s++;
  }
  return { at: p, removed: before.slice(p, before.length - s), inserted: after.slice(p, after.length - s) };
}

export function applyEdit(text: string, edit: TextEdit): string {
  return text.slice(0, edit.at) + edit.inserted + text.slice(edit.at + edit.removed.length);
}

// ------------------------------------------------------------------ geri alma

/**
 * Art arda yazılan karakterler tek bir geri alma adımı: aralarında bu kadardan
 * az süre varsa ve imleç kesintisiz ilerliyorsa. IntelliJ de yazmayı
 * "komut birleştirme" ile tek adımda geri alıyor; harf harf geri almak
 * kullanılmaz olurdu.
 */
export const MERGE_MS = 1000;

/** Geçmişin derinliği; bir dosyada saatlerce yazmak belleği büyütmesin. */
const HISTORY_LIMIT = 500;

interface Entry extends TextEdit {
  time: number;
  typing: boolean;
}

/** Geri alındığında / yinelendiğinde uygulanacak değişiklik ve imlecin yeri. */
export interface Step {
  edit: TextEdit;
  caret: number;
}

/**
 * Sağ tarafın geri alma geçmişi — ham metin üzerinde.
 *
 * Yazı alanının KENDİ geri alması kullanılmıyor: metni programla değiştirmek
 * (`»`, diskten yeniden yükleme) onu siliyor ya da bozuyor. Yazmak da `»` de
 * buraya düşüyor ve Ctrl+Z / Cmd+Z hepsini aynı sırayla geri alıyor.
 */
export class EditHistory {
  private done: Entry[] = [];
  private undone: Entry[] = [];

  get canUndo(): boolean {
    return this.done.length > 0;
  }

  get canRedo(): boolean {
    return this.undone.length > 0;
  }

  clear() {
    this.done = [];
    this.undone = [];
  }

  /** `typing`: klavyeden gelen değişiklik — öncekiyle birleşebilir. */
  push(edit: TextEdit, typing: boolean, now = Date.now()) {
    this.undone = [];
    const last = this.done[this.done.length - 1];
    if (typing && last?.typing && now - last.time < MERGE_MS && merge(last, edit)) {
      last.time = now;
      return;
    }
    this.done.push({ ...edit, time: now, typing });
    if (this.done.length > HISTORY_LIMIT) this.done.shift();
  }

  /** Son değişikliği geri alan adım; yoksa `null`. */
  undo(): Step | null {
    const entry = this.done.pop();
    if (!entry) return null;
    this.undone.push(entry);
    return {
      edit: { at: entry.at, removed: entry.inserted, inserted: entry.removed },
      caret: entry.at + entry.removed.length,
    };
  }

  /** Son geri alınanı yineleyen adım; yoksa `null`. */
  redo(): Step | null {
    const entry = this.undone.pop();
    if (!entry) return null;
    this.done.push(entry);
    return { edit: { at: entry.at, removed: entry.removed, inserted: entry.inserted }, caret: entry.at + entry.inserted.length };
  }
}

/** `next` `last`in devamıysa onu `last`e katar. Yeni satır yeni bir adım başlatıyor. */
function merge(last: Entry, next: TextEdit): boolean {
  if (next.inserted.includes("\n") || last.inserted.endsWith("\n")) return false;
  // Yazmaya devam: imlecin hemen önüne.
  if (next.removed === "" && next.at === last.at + last.inserted.length) {
    last.inserted += next.inserted;
    return true;
  }
  if (next.inserted !== "" || last.inserted !== "") return false;
  // Geri silme (Backspace): bir öncekinin hemen solundan.
  if (next.at + next.removed.length === last.at) {
    last.at = next.at;
    last.removed = next.removed + last.removed;
    return true;
  }
  // İleri silme (Delete): aynı yerden.
  if (next.at === last.at) {
    last.removed += next.removed;
    return true;
  }
  return false;
}

// ------------------------------------------------------------------ satırlar

/** `offset`in bulunduğu satırın başı. */
export function lineStartAt(text: string, offset: number): number {
  return offset <= 0 ? 0 : text.lastIndexOf("\n", offset - 1) + 1;
}

/** `offset`in satır numarası (0'dan). */
export function lineAt(text: string, offset: number): number {
  let n = 0;
  for (let i = text.indexOf("\n"); i >= 0 && i < offset; i = text.indexOf("\n", i + 1)) n++;
  return n;
}

/** `line`ın başladığı konum; satır yoksa metnin sonu. */
export function offsetOfLine(text: string, line: number): number {
  let at = 0;
  for (let n = 0; n < line; n++) {
    const i = text.indexOf("\n", at);
    if (i < 0) return text.length;
    at = i + 1;
  }
  return at;
}

// ------------------------------------------------------------------ girinti

/**
 * Dosyanın girinti birimi: sekme ya da kaç boşluk.
 *
 * Satırların çoğu sekmeyle başlıyorsa sekme. Boşlukta en sık görülen girinti
 * ADIMI (art arda iki satırın girinti farkı): en küçük girinti yanıltıyor —
 * JSDoc'un ` * ` satırları bir boşlukla başlıyor. Bir boşluk adımı aynı
 * sebeple sayılmıyor. Hiç ipucu yoksa dört.
 */
export function indentUnit(text: string): string {
  let tabs = 0;
  let spaces = 0;
  const steps = new Map<number, number>();
  let prev = 0;
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    if (line.charCodeAt(0) === 9) {
      tabs++;
      continue;
    }
    let width = 0;
    while (line.charCodeAt(width) === 32) width++;
    if (width > 0) spaces++;
    const step = width - prev;
    if (step >= 2) steps.set(step, (steps.get(step) ?? 0) + 1);
    prev = width;
  }
  if (tabs > spaces) return "\t";
  let best = 4;
  let count = 0;
  for (const [step, n] of steps) {
    if (n > count || (n === count && step < best)) {
      best = step;
      count = n;
    }
  }
  return " ".repeat(Math.min(8, best));
}

/** Bir düzenlemenin sonucu: yeni metin ve seçim. */
export interface Edited {
  text: string;
  start: number;
  end: number;
}

/**
 * Sekme tuşu: seçim tek satırdaysa imlece bir birim (boşlukta bir sonraki
 * durağa kadar), birden çok satırdaysa her satırın başına bir birim.
 * `outdent` (Shift+Sekme) her satırın başından bir birim siliyor.
 */
export function indentSelection(text: string, start: number, end: number, unit: string, outdent: boolean): Edited {
  const multi = text.slice(start, end).includes("\n");
  if (!outdent && !multi) {
    let insert = unit;
    if (unit !== "\t") {
      const column = start - lineStartAt(text, start);
      insert = " ".repeat(unit.length - (column % unit.length));
    }
    const caret = start + insert.length;
    return { text: text.slice(0, start) + insert + text.slice(end), start: caret, end: caret };
  }

  const first = lineStartAt(text, start);
  // Seçim bir satırın en başında bitiyorsa o satır seçili sayılmıyor.
  const lastPos = end > start && end === lineStartAt(text, end) ? end - 1 : end;
  const nl = text.indexOf("\n", lastPos);
  const last = nl < 0 ? text.length : nl;

  // Her satırın başında eklenen ya da silinen; seçimin uçları buna göre kayıyor.
  const marks: { at: number; cut: number; add: number }[] = [];
  let at = first;
  const out = text
    .slice(first, last)
    .split("\n")
    .map((line) => {
      let next = line;
      if (outdent) {
        let cut = 0;
        if (line.charCodeAt(0) === 9) cut = 1;
        else while (cut < (unit === "\t" ? 4 : unit.length) && line.charCodeAt(cut) === 32) cut++;
        if (cut > 0) marks.push({ at, cut, add: 0 });
        next = line.slice(cut);
      } else if (line !== "") {
        // Boş satıra girinti eklenmiyor (IntelliJ de eklemiyor).
        marks.push({ at, cut: 0, add: unit.length });
        next = unit + line;
      }
      at += line.length + 1;
      return next;
    });

  // Satır başındaki uç satır başında kalıyor: seçim eklenen girintiyi de kapsıyor.
  const map = (o: number) => {
    let r = o;
    for (const m of marks) {
      if (m.at < o) r += m.add;
      r -= Math.max(0, Math.min(o - m.at, m.cut));
    }
    return r;
  };
  return { text: text.slice(0, first) + out.join("\n") + text.slice(last), start: map(start), end: map(end) };
}

/**
 * Enter: yeni satır, bir öncekinin girintisiyle. İmleç girintinin içindeyse
 * girintinin yalnızca imlece kadarki kısmı.
 */
export function newlineWithIndent(text: string, start: number, end: number): Edited {
  const lineStart = lineStartAt(text, start);
  let indentEnd = lineStart;
  while (indentEnd < start && (text.charCodeAt(indentEnd) === 32 || text.charCodeAt(indentEnd) === 9)) indentEnd++;
  const insert = "\n" + text.slice(lineStart, indentEnd);
  const caret = start + insert.length;
  return { text: text.slice(0, start) + insert + text.slice(end), start: caret, end: caret };
}
