/**
 * İki metnin satır satır karşılaştırılması — fark penceresinin motoru.
 *
 * Değişiklikler panelindeki fark `git diff`in BİRLEŞİK çıktısından geliyor
 * (bkz. `diff.ts`); orada yalnızca değişen satırların çevresi var. Fark
 * penceresi ise IntelliJ / WebStorm'daki gibi iki dosyanın TAMAMINI yan yana
 * gösteriyor: solda HEAD, sağda çalışma ağacı. Bunun için iki metnin kendisi
 * karşılaştırılıyor ve hangi satırın hangisine denk geldiği burada bulunuyor.
 *
 * ## Neden `git diff` değil
 *
 * `git diff -U0` değişiklik aralıklarını verebilirdi ama pencerenin istediği
 * üç şey onun dışında kalıyordu:
 *
 * - **Boşluk kipleri.** IntelliJ'in "Trim whitespaces" seçeneği (yalnızca satır
 *   başı ve sonu) git'te yok; `-b` başka bir şey (boşluk MİKTARI).
 * - **Kelime düzeyi parçalar.** Değişen satırın içinde hangi sözcüğün değiştiği
 *   zaten burada hesaplanmak zorunda.
 * - **Bloğu geri almak** (`»`). Sağ dosyayı yazmak için iki tarafın satırlarının
 *   kendisi gerekiyor; aralıkları başka bir süreçten alıp metni burada kesmek
 *   iki ayrı satır sayımının tutmasına güvenmek olurdu.
 *
 * Algoritma git'inkiyle aynı aileden: Myers'ın O(ND) farkı (GNU diff'in doğrusal
 * bellekli `diag`/`compareseq` biçimi) ve ardından git'in "girinti sezgisi"
 * (`xdl_change_compact`). İkincisi önemli: en kısa düzenleme betiği çoğu zaman
 * birden fazla, ve "yeni işlev" bloğunun `}` satırından mı yoksa boş satırdan mı
 * başladığı ona kalıyor. Sezgi olmadan eklenen bir işlev ekranda bir önceki
 * işlevin kapanış parantezini de götürüyormuş gibi görünürdü.
 *
 * Her şey saf: girdi iki metin, çıktı aralıklar. Çizim, kaydırma ve dosya yazma
 * bileşende; buradaki her kural vitest ile sınanıyor.
 */

// ------------------------------------------------------------------ türler

/**
 * Boşlukların nasıl sayılacağı — IntelliJ'in "Ignore Differences" seçenekleri.
 *
 * - `none`: her karakter önemli (varsayılan).
 * - `trim`: satır başındaki ve sonundaki boşluk/sekme yok sayılıyor.
 * - `whitespace`: satırın neresinde olursa olsun boşluk yok sayılıyor.
 * - `blankLines`: `whitespace` + yalnızca boş satırlardan oluşan eklemeler ve
 *   silmeler de yok sayılıyor.
 */
export type IgnorePolicy = "none" | "trim" | "whitespace" | "blankLines";

/**
 * Değişen satırların içinin nasıl vurgulanacağı — "Highlighting Differences".
 *
 * - `words`: değişen sözcükler (varsayılan).
 * - `lines`: yalnızca satırlar; satırın içi ayrıca vurgulanmıyor.
 * - `split`: sözcük farkına göre büyük bloklar küçük bloklara bölünüyor.
 * - `chars`: değişen karakterler.
 * - `none`: hiçbir şey vurgulanmıyor.
 */
export type HighlightPolicy = "words" | "lines" | "split" | "chars" | "none";

export type ChangeKind = "inserted" | "deleted" | "modified";

/**
 * Değişen bir bloğun İÇİNDE değişen parça.
 *
 * Konumlar bloğun metnine göre (satırları `\n` ile birleştirilmiş hâli,
 * bloğun ilk karakteri 0). Bir tarafı boş olabilir: sözcük eklenmiş ya da
 * silinmiş demek; boş taraf ekranda ince bir dikey çizgiyle gösteriliyor.
 */
export interface InnerFragment {
  start1: number;
  end1: number;
  start2: number;
  end2: number;
}

/**
 * Bir değişiklik bloğu: iki taraftaki satır aralıkları.
 *
 * Satırlar 0 tabanlı, aralıklar yarı açık (`[start, end)`). Boş aralık o
 * tarafta satır olmadığı demek: `start1 === end1` ekleme, `start2 === end2`
 * silme. Boş aralığın `start`ı, bloğun o tarafta DÜŞTÜĞÜ yer — iki satırın
 * arası; ekrandaki ince çizgi oraya çiziliyor.
 */
export interface LineChange {
  start1: number;
  end1: number;
  start2: number;
  end2: number;
  kind: ChangeKind;
  /**
   * Satırların içindeki değişen parçalar; vurgulama kapalıysa, blok yalnızca
   * ekleme/silmeyse ya da iç fark hesaplanamayacak kadar büyükse `null`.
   */
  inner: InnerFragment[] | null;
  /**
   * Seçilen boşluk kipinde YOK SAYILAN blok (yalnızca boş satırlar).
   *
   * Listeden atılmıyor: iki tarafın satır sayısı farklı ve kaydırma eşlemesi
   * ile katlama bu farkı bilmek zorunda. Çizilmiyor, sayılmıyor, gezinmede
   * atlanıyor.
   */
  ignored: boolean;
}

export interface DiffOptions {
  ignore: IgnorePolicy;
  highlight: HighlightPolicy;
}

export interface TextDiff {
  /** Sol metnin satırları (satır sonları ayıklanmış). */
  lines1: string[];
  lines2: string[];
  changes: LineChange[];
}

// ------------------------------------------------------------------ satırlar

/**
 * Metni satırlara böler. `\r\n`, `\r` ve `\n` aynı ayırıcı.
 *
 * Sondaki `\n` SON BİR BOŞ SATIR üretiyor ve bu bilinçli: IntelliJ'in
 * belgesinde de `"a\nb\n"` üç satır (sonuncusu boş). Bir taraf satır sonuyla
 * bitip öteki bitmiyorsa fark tam olarak o boş satır oluyor — "dosya sonunda
 * satır sonu yok" farkının ekrandaki karşılığı.
 */
export function splitLines(text: string): string[] {
  return text.split(/\r\n|\r|\n/);
}

/** Satır ayırıcısı: dosyanın kendi biçimi korunarak yazılsın diye. */
export function lineSeparator(raw: string): string {
  if (raw.includes("\r\n")) return "\r\n";
  if (raw.includes("\r")) return "\r";
  return "\n";
}

/** IntelliJ'in kırptığı boşluklar yalnızca boşluk ve sekme. */
function isBlankChar(code: number): boolean {
  return code === 32 || code === 9;
}

function trimBlanks(line: string): string {
  let s = 0;
  let e = line.length;
  while (s < e && isBlankChar(line.charCodeAt(s))) s++;
  while (e > s && isBlankChar(line.charCodeAt(e - 1))) e--;
  return line.slice(s, e);
}

/** Yalnızca boşluk/sekmeden oluşan (ya da boş) satır. */
export function isBlankLine(line: string): boolean {
  for (let i = 0; i < line.length; i++) {
    if (!isBlankChar(line.charCodeAt(i))) return false;
  }
  return true;
}

/** Satırın, seçilen kipte KARŞILAŞTIRILAN hâli. */
function lineKey(line: string, policy: IgnorePolicy): string {
  if (policy === "none") return line;
  if (policy === "trim") return trimBlanks(line);
  return line.replace(/[ \t]+/g, "");
}

/**
 * Satırları tam sayılara çevirir: Myers'ın iç döngüsü dize değil sayı
 * karşılaştırsın. İki taraf AYNI sözlüğü kullanıyor, yani eşit satırlar eşit
 * sayı oluyor.
 */
function encode(
  lines1: readonly string[],
  lines2: readonly string[],
  key: (line: string) => string,
): [Int32Array, Int32Array] {
  const ids = new Map<string, number>();
  const one = (lines: readonly string[]) => {
    const out = new Int32Array(lines.length);
    for (let i = 0; i < lines.length; i++) {
      const k = key(lines[i]);
      let id = ids.get(k);
      if (id === undefined) {
        id = ids.size;
        ids.set(k, id);
      }
      out[i] = id;
    }
    return out;
  };
  return [one(lines1), one(lines2)];
}

// ------------------------------------------------------------------- Myers

/**
 * GNU diff'in "çok pahalı" sınırı: maliyet bunu aşınca en iyi orta nokta
 * aranmıyor, o ana kadar en çok ilerleyen köşegen alınıyor.
 *
 * Sınırsız Myers baştan sona yeniden yazılmış büyük bir dosyada O(N·D) — on
 * bin satırlık iki farklı dosyada yüz milyonlarca adım ve donmuş bir pencere.
 * Sınır kabaca girdinin karekökü; aşıldığında fark EN KISA olmayabilir ama
 * doğru kalıyor (her eşleşme gerçek bir eşleşme).
 */
function tooExpensiveFor(size: number): number {
  let te = 1;
  for (let diags = size + 3; diags !== 0; diags >>= 2) te <<= 1;
  return Math.max(1024, te);
}

interface Part {
  xmid: number;
  ymid: number;
  loMinimal: boolean;
  hiMinimal: boolean;
}

/** Myers'ın çalışma alanı; bayraklar 1 kaydırmalı (`ch[i + 1]`), iki uçta 0 nöbetçi. */
interface Work {
  a: Int32Array;
  b: Int32Array;
  ch1: Uint8Array;
  ch2: Uint8Array;
  fd: Int32Array;
  bd: Int32Array;
  off: number;
  tooExpensive: number;
}

const FAR = 0x3fffffff;

/**
 * `a[xoff..xlim)` ile `b[yoff..ylim)` arasındaki en kısa düzenleme betiğinin
 * ORTA noktası: iki yönden aynı anda ilerleyen arama buluştuğunda.
 *
 * GNU diff'in `diag()` işlevinin birebir karşılığı; köşegen dizileri negatif
 * köşegenler için `off` kadar kaydırılmış.
 */
function diag(w: Work, xoff: number, xlim: number, yoff: number, ylim: number, minimal: boolean): Part {
  const { a, b, fd, bd, off } = w;
  const dmin = xoff - ylim;
  const dmax = xlim - yoff;
  const fmid = xoff - yoff;
  const bmid = xlim - ylim;
  let fmin = fmid;
  let fmax = fmid;
  let bmin = bmid;
  let bmax = bmid;
  const odd = ((fmid - bmid) & 1) !== 0;

  fd[off + fmid] = xoff;
  bd[off + bmid] = xlim;

  for (let c = 1; ; c++) {
    // İleri arama: her köşegende bir adım.
    if (fmin > dmin) {
      fmin--;
      fd[off + fmin - 1] = -1;
    } else fmin++;
    if (fmax < dmax) {
      fmax++;
      fd[off + fmax + 1] = -1;
    } else fmax--;
    for (let d = fmax; d >= fmin; d -= 2) {
      const tlo = fd[off + d - 1];
      const thi = fd[off + d + 1];
      const x0 = tlo < thi ? thi : tlo + 1;
      let x = x0;
      let y = x0 - d;
      while (x < xlim && y < ylim && a[x] === b[y]) {
        x++;
        y++;
      }
      fd[off + d] = x;
      if (odd && bmin <= d && d <= bmax && bd[off + d] <= x) {
        return { xmid: x, ymid: y, loMinimal: true, hiMinimal: true };
      }
    }

    // Geri arama.
    if (bmin > dmin) {
      bmin--;
      bd[off + bmin - 1] = FAR;
    } else bmin++;
    if (bmax < dmax) {
      bmax++;
      bd[off + bmax + 1] = FAR;
    } else bmax--;
    for (let d = bmax; d >= bmin; d -= 2) {
      const tlo = bd[off + d - 1];
      const thi = bd[off + d + 1];
      const x0 = tlo < thi ? tlo : thi - 1;
      let x = x0;
      let y = x0 - d;
      while (xoff < x && yoff < y && a[x - 1] === b[y - 1]) {
        x--;
        y--;
      }
      bd[off + d] = x;
      if (!odd && fmin <= d && d <= fmax && x <= fd[off + d]) {
        return { xmid: x, ymid: y, loMinimal: true, hiMinimal: true };
      }
    }

    if (minimal || c < w.tooExpensive) continue;

    // Çok pahalı: iki yönün o ana kadarki en iyisinden iyi olanı al.
    let fxybest = -1;
    let fxbest = 0;
    for (let d = fmax; d >= fmin; d -= 2) {
      let x = Math.min(fd[off + d], xlim);
      let y = x - d;
      if (ylim < y) {
        x = ylim + d;
        y = ylim;
      }
      if (fxybest < x + y) {
        fxybest = x + y;
        fxbest = x;
      }
    }
    let bxybest = FAR * 2;
    let bxbest = 0;
    for (let d = bmax; d >= bmin; d -= 2) {
      let x = Math.max(xoff, bd[off + d]);
      let y = x - d;
      if (y < yoff) {
        x = yoff + d;
        y = yoff;
      }
      if (x + y < bxybest) {
        bxybest = x + y;
        bxbest = x;
      }
    }
    if (xlim + ylim - bxybest < fxybest - (xoff + yoff)) {
      return { xmid: fxbest, ymid: fxybest - fxbest, loMinimal: true, hiMinimal: false };
    }
    return { xmid: bxbest, ymid: bxybest - bxbest, loMinimal: false, hiMinimal: true };
  }
}

/**
 * İki diziyi karşılaştırıp değişen öğeleri işaretler.
 *
 * GNU diff'in `compareseq()`ı; özyineleme yerine açık bir yığın — yeniden
 * yazılmış büyük bir dosyada derinlik sayılamayacak kadar artabiliyor.
 */
function markChanges(a: Int32Array, b: Int32Array): { ch1: Uint8Array; ch2: Uint8Array } {
  const n1 = a.length;
  const n2 = b.length;
  const w: Work = {
    a,
    b,
    ch1: new Uint8Array(n1 + 2),
    ch2: new Uint8Array(n2 + 2),
    fd: new Int32Array(n1 + n2 + 3),
    bd: new Int32Array(n1 + n2 + 3),
    off: n2 + 1,
    tooExpensive: tooExpensiveFor(n1 + n2),
  };

  const stack: number[] = [0, n1, 0, n2, 0];
  while (stack.length > 0) {
    const minimal = stack.pop()! === 1;
    let ylim = stack.pop()!;
    let yoff = stack.pop()!;
    let xlim = stack.pop()!;
    let xoff = stack.pop()!;

    while (xoff < xlim && yoff < ylim && a[xoff] === b[yoff]) {
      xoff++;
      yoff++;
    }
    while (xoff < xlim && yoff < ylim && a[xlim - 1] === b[ylim - 1]) {
      xlim--;
      ylim--;
    }
    if (xoff === xlim) {
      for (let y = yoff; y < ylim; y++) w.ch2[y + 1] = 1;
    } else if (yoff === ylim) {
      for (let x = xoff; x < xlim; x++) w.ch1[x + 1] = 1;
    } else {
      const part = diag(w, xoff, xlim, yoff, ylim, minimal);
      stack.push(xoff, part.xmid, yoff, part.ymid, part.loMinimal ? 1 : 0);
      stack.push(part.xmid, xlim, part.ymid, ylim, part.hiMinimal ? 1 : 0);
    }
  }
  return { ch1: w.ch1, ch2: w.ch2 };
}

// ------------------------------------------------- git'in girinti sezgisi

/*
 * En kısa düzenleme betiği çoğu zaman tek değil: aynı satırla başlayıp biten
 * bir blok yukarı ya da aşağı kaydırılabiliyor ve her konum aynı uzunlukta bir
 * fark veriyor. Hangisinin seçileceği okunurluğu belirliyor — iki işlevin
 * arasına eklenen bir işlev ya `}\n\nfunction b() {…` ya da
 * `function b() {…}\n\n` olarak görünür; ikincisi doğrusu.
 *
 * Aşağısı git'in `xdl_change_compact`ı ve girinti sezgisi (git 2.14'ten beri
 * varsayılan), sabitleriyle birlikte. Kendi kuralımızı uydurmak yerine
 * milyonlarca depoda denenmiş olanı almak bilinçli: kullanıcı bu farkları
 * terminalde `git diff` ile zaten görüyor ve iki yerde farklı bloklar görmesi
 * kafa karıştırırdı.
 */

const START_OF_FILE_PENALTY = 1;
const END_OF_FILE_PENALTY = 21;
const TOTAL_BLANK_WEIGHT = -30;
const POST_BLANK_WEIGHT = 6;
const RELATIVE_INDENT_PENALTY = -4;
const RELATIVE_INDENT_WITH_BLANK_PENALTY = 10;
const RELATIVE_OUTDENT_PENALTY = 24;
const RELATIVE_OUTDENT_WITH_BLANK_PENALTY = 17;
const RELATIVE_DEDENT_PENALTY = 23;
const RELATIVE_DEDENT_WITH_BLANK_PENALTY = 17;
const INDENT_WEIGHT = 60;
const INDENT_HEURISTIC_MAX_SLIDING = 100;
const MAX_INDENT = 200;
const MAX_BLANKS = 20;

/** Satırın girintisi (sekme 8'e yuvarlanır); boş satırda -1. */
function indentOf(line: string): number {
  let ret = 0;
  for (let i = 0; i < line.length; i++) {
    const c = line.charCodeAt(i);
    if (c === 32) ret += 1;
    else if (c === 9) ret += 8 - (ret % 8);
    else if (c === 13 || c === 11 || c === 12) continue;
    else return ret;
    if (ret >= MAX_INDENT) return MAX_INDENT;
  }
  return -1;
}

interface Split {
  endOfFile: boolean;
  indent: number;
  preBlank: number;
  preIndent: number;
  postBlank: number;
  postIndent: number;
}

function measureSplit(lines: readonly string[], split: number): Split {
  const n = lines.length;
  const m: Split = { endOfFile: false, indent: -1, preBlank: 0, preIndent: -1, postBlank: 0, postIndent: -1 };
  if (split >= n) m.endOfFile = true;
  else m.indent = indentOf(lines[split]);

  for (let i = split - 1; i >= 0; i--) {
    m.preIndent = indentOf(lines[i]);
    if (m.preIndent !== -1) break;
    m.preBlank += 1;
    if (m.preBlank === MAX_BLANKS) {
      m.preIndent = 0;
      break;
    }
  }
  for (let i = split + 1; i < n; i++) {
    m.postIndent = indentOf(lines[i]);
    if (m.postIndent !== -1) break;
    m.postBlank += 1;
    if (m.postBlank === MAX_BLANKS) {
      m.postIndent = 0;
      break;
    }
  }
  return m;
}

interface Score {
  effectiveIndent: number;
  penalty: number;
}

function scoreAddSplit(m: Split, s: Score) {
  if (m.preIndent === -1 && m.preBlank === 0) s.penalty += START_OF_FILE_PENALTY;
  if (m.endOfFile) s.penalty += END_OF_FILE_PENALTY;

  const postBlank = m.indent === -1 ? 1 + m.postBlank : 0;
  const totalBlank = m.preBlank + postBlank;
  s.penalty += TOTAL_BLANK_WEIGHT * totalBlank;
  s.penalty += POST_BLANK_WEIGHT * postBlank;

  const indent = m.indent !== -1 ? m.indent : m.postIndent;
  const anyBlanks = totalBlank !== 0;
  s.effectiveIndent += indent;

  if (indent === -1 || m.preIndent === -1) return;
  if (indent > m.preIndent) {
    s.penalty += anyBlanks ? RELATIVE_INDENT_WITH_BLANK_PENALTY : RELATIVE_INDENT_PENALTY;
  } else if (indent < m.preIndent) {
    if (m.postIndent !== -1 && m.postIndent > indent) {
      s.penalty += anyBlanks ? RELATIVE_OUTDENT_WITH_BLANK_PENALTY : RELATIVE_OUTDENT_PENALTY;
    } else {
      s.penalty += anyBlanks ? RELATIVE_DEDENT_WITH_BLANK_PENALTY : RELATIVE_DEDENT_PENALTY;
    }
  }
}

function scoreCmp(s1: Score, s2: Score): number {
  const cmpIndents =
    (s1.effectiveIndent > s2.effectiveIndent ? 1 : 0) - (s1.effectiveIndent < s2.effectiveIndent ? 1 : 0);
  return INDENT_WEIGHT * cmpIndents + (s1.penalty - s2.penalty);
}

/** Bir taraftaki değişiklik grubu; `ch` dizisi 1 kaydırmalı. */
interface Group {
  start: number;
  end: number;
}

function groupInit(ch: Uint8Array): Group {
  let end = 0;
  while (ch[end + 1]) end++;
  return { start: 0, end };
}

function groupNext(ch: Uint8Array, n: number, g: Group): boolean {
  if (g.end === n) return false;
  g.start = g.end + 1;
  g.end = g.start;
  while (ch[g.end + 1]) g.end++;
  return true;
}

function groupPrevious(ch: Uint8Array, g: Group): boolean {
  if (g.start === 0) return false;
  g.end = g.start - 1;
  g.start = g.end;
  while (ch[g.start]) g.start--;
  return true;
}

function groupSlideDown(ids: Int32Array, ch: Uint8Array, n: number, g: Group): boolean {
  if (g.end < n && ids[g.start] === ids[g.end]) {
    ch[g.start + 1] = 0;
    g.start++;
    ch[g.end + 1] = 1;
    g.end++;
    while (ch[g.end + 1]) g.end++;
    return true;
  }
  return false;
}

function groupSlideUp(ids: Int32Array, ch: Uint8Array, g: Group): boolean {
  if (g.start > 0 && ids[g.start - 1] === ids[g.end - 1]) {
    g.start--;
    ch[g.start + 1] = 1;
    g.end--;
    ch[g.end + 1] = 0;
    while (ch[g.start]) g.start--;
    return true;
  }
  return false;
}

/** git'in `xdl_change_compact`ı: bir tarafın gruplarını okunur konuma kaydırır. */
function compact(
  ids: Int32Array,
  lines: readonly string[],
  ch: Uint8Array,
  chO: Uint8Array,
  nO: number,
): void {
  const n = ids.length;
  const g = groupInit(ch);
  const go = groupInit(chO);

  for (;;) {
    if (g.end !== g.start) {
      let groupsize: number;
      let earliestEnd: number;
      let endMatchingOther: number;
      do {
        groupsize = g.end - g.start;
        endMatchingOther = -1;
        while (groupSlideUp(ids, ch, g)) groupPrevious(chO, go);
        earliestEnd = g.end;
        if (go.end > go.start) endMatchingOther = g.end;
        while (groupSlideDown(ids, ch, n, g)) {
          groupNext(chO, nO, go);
          if (go.end > go.start) endMatchingOther = g.end;
        }
      } while (groupsize !== g.end - g.start);

      if (g.end === earliestEnd) {
        // Kaydırılamıyor.
      } else if (endMatchingOther !== -1) {
        // Öteki taraftaki bir grupla hizalanabiliyor: oraya geri dön.
        while (go.end === go.start) {
          if (!groupSlideUp(ids, ch, g)) break;
          groupPrevious(chO, go);
        }
      } else {
        let shift = earliestEnd;
        if (g.end - groupsize - 1 > shift) shift = g.end - groupsize - 1;
        if (g.end - INDENT_HEURISTIC_MAX_SLIDING > shift) shift = g.end - INDENT_HEURISTIC_MAX_SLIDING;
        let bestShift = -1;
        let best: Score = { effectiveIndent: 0, penalty: 0 };
        for (; shift <= g.end; shift++) {
          const score: Score = { effectiveIndent: 0, penalty: 0 };
          scoreAddSplit(measureSplit(lines, shift), score);
          scoreAddSplit(measureSplit(lines, shift - groupsize), score);
          if (bestShift === -1 || scoreCmp(score, best) <= 0) {
            best = score;
            bestShift = shift;
          }
        }
        while (g.end > bestShift) {
          if (!groupSlideUp(ids, ch, g)) break;
          groupPrevious(chO, go);
        }
      }
    }
    if (!groupNext(ch, n, g)) break;
    groupNext(chO, nO, go);
  }
}

// -------------------------------------------------------- satır blokları

/** Değişim bayraklarından blok listesi; eşit satırlar iki tarafta sırayla eşleşiyor. */
function blocksFrom(ch1: Uint8Array, n1: number, ch2: Uint8Array, n2: number): LineChange[] {
  const out: LineChange[] = [];
  let i = 0;
  let j = 0;
  while (i < n1 || j < n2) {
    if (i < n1 && j < n2 && !ch1[i + 1] && !ch2[j + 1]) {
      i++;
      j++;
      continue;
    }
    const s1 = i;
    const s2 = j;
    while (i < n1 && ch1[i + 1]) i++;
    while (j < n2 && ch2[j + 1]) j++;
    // Güvence: iki taraf da ilerlemediyse bayraklar tutarsız demek (olmamalı);
    // sonsuz döngü yerine kalan her şeyi tek blok say.
    if (i === s1 && j === s2) {
      i = n1;
      j = n2;
    }
    out.push(makeChange(s1, i, s2, j));
  }
  return out;
}

function makeChange(start1: number, end1: number, start2: number, end2: number): LineChange {
  const kind: ChangeKind = start1 === end1 ? "inserted" : start2 === end2 ? "deleted" : "modified";
  return { start1, end1, start2, end2, kind, inner: null, ignored: false };
}

/**
 * Satır düzeyinde fark: hangi satır aralığı hangisine karşılık geliyor.
 *
 * İç parçalar burada hesaplanmıyor (bkz. `diffTexts`).
 */
export function compareLines(
  lines1: readonly string[],
  lines2: readonly string[],
  policy: IgnorePolicy,
): LineChange[] {
  const [a, b] = encode(lines1, lines2, (line) => lineKey(line, policy));
  const { ch1, ch2 } = markChanges(a, b);
  compact(a, lines1, ch1, ch2, b.length);
  compact(b, lines2, ch2, ch1, a.length);
  const changes = blocksFrom(ch1, a.length, ch2, b.length);
  if (policy === "blankLines") {
    for (const change of changes) {
      change.ignored =
        lines1.slice(change.start1, change.end1).every(isBlankLine) &&
        lines2.slice(change.start2, change.end2).every(isBlankLine);
    }
  }
  return changes;
}

// ----------------------------------------------------------- iç parçalar

/** Bir taraf bunu aşarsa iç fark hesaplanmıyor; satırlar yine vurgulanıyor. */
const INNER_LIMIT = 50_000;

interface Token {
  start: number;
  end: number;
  text: string;
}

const WORD = /[\p{L}\p{N}_]/u;

/**
 * Metni sözcüklere böler: harf/rakam dizileri, boşluk dizileri ve tek tek
 * noktalama. Satır sonu kendi başına bir öğe — `split` kipinde blokların
 * bölüneceği yerler onlar.
 *
 * Boşluk öğesi kipe göre DÜŞÜYOR: `whitespace`ta her boşluk, `trim`de yalnızca
 * satır başı ve sonundaki. Düşen boşluk karşılaştırmaya girmiyor, yani
 * yalnızca boşluğu değişmiş bir satırda vurgulanacak bir şey kalmıyor.
 */
function tokenize(text: string, policy: IgnorePolicy, chars: boolean): Token[] {
  const out: Token[] = [];
  const n = text.length;
  let i = 0;
  let lineStart = true;
  while (i < n) {
    const ch = text[i];
    if (ch === "\n") {
      out.push({ start: i, end: i + 1, text: "\n" });
      i++;
      lineStart = true;
      continue;
    }
    if (ch === " " || ch === "\t") {
      let e = i + 1;
      while (e < n && (text[e] === " " || text[e] === "\t")) e++;
      const lineEnd = e === n || text[e] === "\n";
      const drop =
        policy === "whitespace" || policy === "blankLines" || (policy === "trim" && (lineStart || lineEnd));
      if (!drop) {
        if (chars) for (let k = i; k < e; k++) out.push({ start: k, end: k + 1, text: text[k] });
        else out.push({ start: i, end: e, text: text.slice(i, e) });
      }
      i = e;
      continue;
    }
    lineStart = false;
    if (!chars && WORD.test(ch)) {
      let e = i + 1;
      while (e < n && WORD.test(text[e])) e++;
      out.push({ start: i, end: e, text: text.slice(i, e) });
      i = e;
      continue;
    }
    // Vekil çift (emoji) tek öğe kalsın: yarısı vurgulanırsa glif bozuluyor.
    const code = text.charCodeAt(i);
    const width = code >= 0xd800 && code <= 0xdbff && i + 1 < n ? 2 : 1;
    out.push({ start: i, end: i + width, text: text.slice(i, i + width) });
    i += width;
  }
  return out;
}

/** İki parça arası yalnızca boşluksa (her iki tarafta) birleştirilir. */
function onlyBlanks(text: string, from: number, to: number): boolean {
  for (let i = from; i < to; i++) {
    const c = text.charCodeAt(i);
    if (c !== 32 && c !== 9) return false;
  }
  return true;
}

/**
 * İki metnin sözcük (ya da karakter) düzeyinde farkı.
 *
 * Bitişik iki parçanın arasında yalnızca boşluk kalıyorsa parçalar
 * birleştiriliyor: `a b` → `x y` iki ayrı kutu değil tek kutu. IntelliJ de
 * böyle gösteriyor ve göz için doğrusu bu — aradaki tek boşluğun "değişmedi"
 * diye ayrı boyanması bilgi değil gürültü.
 */
export function innerFragments(
  text1: string,
  text2: string,
  policy: IgnorePolicy,
  chars = false,
): InnerFragment[] | null {
  if (text1.length > INNER_LIMIT || text2.length > INNER_LIMIT) return null;
  const tok1 = tokenize(text1, policy, chars);
  const tok2 = tokenize(text2, policy, chars);
  const [a, b] = encode(
    tok1.map((t) => t.text),
    tok2.map((t) => t.text),
    (s) => s,
  );
  const { ch1, ch2 } = markChanges(a, b);

  const raw: InnerFragment[] = [];
  let i = 0;
  let j = 0;
  // Son eşleşen öğelerin bitişi: boş tarafın konumu buna göre bulunuyor.
  let prevEnd1 = 0;
  let prevEnd2 = 0;
  while (i < tok1.length || j < tok2.length) {
    if (i < tok1.length && j < tok2.length && !ch1[i + 1] && !ch2[j + 1]) {
      prevEnd1 = tok1[i].end;
      prevEnd2 = tok2[j].end;
      i++;
      j++;
      continue;
    }
    const s1 = i;
    const s2 = j;
    while (i < tok1.length && ch1[i + 1]) i++;
    while (j < tok2.length && ch2[j + 1]) j++;
    if (i === s1 && j === s2) break;

    const next1 = i < tok1.length ? tok1[i].start : text1.length;
    const next2 = j < tok2.length ? tok2[j].start : text2.length;
    let start1: number;
    let end1: number;
    let start2: number;
    let end2: number;
    if (i > s1) {
      start1 = tok1[s1].start;
      end1 = tok1[i - 1].end;
    } else {
      // Bu tarafta öğe yok: karşı taraftaki parçanın düştüğü boşluğa, aradaki
      // boşluk payı korunarak yerleştir.
      const s = j > s2 ? tok2[s2].start : prevEnd2;
      start1 = end1 = Math.min(next1, prevEnd1 + Math.max(0, s - prevEnd2));
    }
    if (j > s2) {
      start2 = tok2[s2].start;
      end2 = tok2[j - 1].end;
    } else {
      const s = i > s1 ? tok1[s1].start : prevEnd1;
      start2 = end2 = Math.min(next2, prevEnd2 + Math.max(0, s - prevEnd1));
    }
    raw.push({ start1, end1, start2, end2 });
  }

  const out: InnerFragment[] = [];
  for (const f of raw) {
    const last = out[out.length - 1];
    if (last && onlyBlanks(text1, last.end1, f.start1) && onlyBlanks(text2, last.end2, f.start2)) {
      last.end1 = Math.max(last.end1, f.end1);
      last.end2 = Math.max(last.end2, f.end2);
      continue;
    }
    out.push({ ...f });
  }
  for (const f of out) {
    [f.start1, f.end1] = trimRange(text1, f.start1, f.end1);
    [f.start2, f.end2] = trimRange(text2, f.start2, f.end2);
  }
  return out;
}

/**
 * Parçanın kenarındaki boşluğu kırpar: `baz ` değil `baz` vurgulansın.
 *
 * Yalnızca boşluktan oluşan parça KIRPILMIYOR — boşluk kipinde "iki boşluk
 * bir oldu" da bir fark ve tümden kırpılırsa ekranda hiç görünmezdi.
 */
function trimRange(text: string, start: number, end: number): [number, number] {
  let s = start;
  let e = end;
  while (s < e && isBlankChar(text.charCodeAt(s))) s++;
  while (e > s && isBlankChar(text.charCodeAt(e - 1))) e--;
  return s === e && start !== end ? [start, end] : [s, e];
}

/** Satır aralığının bloğun metnindeki hâli ve satır başlarının konumu. */
function blockText(lines: readonly string[], start: number, end: number): string {
  return lines.slice(start, end).join("\n");
}

/**
 * `split` kipi: bir bloğu, sözcük farkında EŞLEŞEN satır sonlarından böler.
 *
 * `A\nB` → `A X\nB X` tek blok değil iki blok: iki satır da ayrı ayrı değişmiş
 * ve aralarındaki satır sonu iki tarafta da aynı yerde. IntelliJ'in "Split
 * changes" tarifi tam olarak bu.
 */
function splitChange(
  change: LineChange,
  lines1: readonly string[],
  lines2: readonly string[],
  policy: IgnorePolicy,
): LineChange[] {
  const text1 = blockText(lines1, change.start1, change.end1);
  const text2 = blockText(lines2, change.start2, change.end2);
  if (text1.length > INNER_LIMIT || text2.length > INNER_LIMIT) return [change];
  const tok1 = tokenize(text1, policy, false);
  const tok2 = tokenize(text2, policy, false);
  const [a, b] = encode(
    tok1.map((t) => t.text),
    tok2.map((t) => t.text),
    (s) => s,
  );
  const { ch1, ch2 } = markChanges(a, b);

  // Eşleşen satır sonları: (soldaki satır, sağdaki satır) bölme noktaları.
  const cuts: [number, number][] = [];
  let i = 0;
  let j = 0;
  let line1 = 0;
  let line2 = 0;
  while (i < tok1.length && j < tok2.length) {
    if (!ch1[i + 1] && !ch2[j + 1]) {
      if (tok1[i].text === "\n") {
        line1++;
        line2++;
        cuts.push([line1, line2]);
      }
      i++;
      j++;
      continue;
    }
    if (ch1[i + 1]) {
      if (tok1[i].text === "\n") line1++;
      i++;
    }
    if (ch2[j + 1]) {
      if (tok2[j].text === "\n") line2++;
      j++;
    }
  }
  if (cuts.length === 0) return [change];

  const out: LineChange[] = [];
  let from1 = change.start1;
  let from2 = change.start2;
  const bounds = [...cuts.map(([c1, c2]) => [change.start1 + c1, change.start2 + c2]), [change.end1, change.end2]];
  for (const [to1, to2] of bounds) {
    const same =
      to1 - from1 === to2 - from2 &&
      lines1
        .slice(from1, to1)
        .every((line, k) => lineKey(line, policy) === lineKey(lines2[from2 + k], policy));
    if (!same) out.push(makeChange(from1, to1, from2, to2));
    from1 = to1;
    from2 = to2;
  }
  return out.length > 0 ? out : [change];
}

/**
 * İki metnin tam farkı: satır blokları ve (kipe göre) blokların iç parçaları.
 *
 * Yalnızca DEĞİŞTİRİLMİŞ (iki tarafı da dolu) blokların iç parçası var: ekleme
 * ya da silmenin tamamı zaten tek renk.
 */
export function diffTexts(text1: string, text2: string, options: DiffOptions): TextDiff {
  const lines1 = splitLines(text1);
  const lines2 = splitLines(text2);
  let changes = compareLines(lines1, lines2, options.ignore);

  if (options.highlight === "split") {
    changes = changes.flatMap((change) =>
      change.kind === "modified" && !change.ignored ? splitChange(change, lines1, lines2, options.ignore) : [change],
    );
  }

  if (options.highlight === "words" || options.highlight === "split" || options.highlight === "chars") {
    for (const change of changes) {
      if (change.kind !== "modified" || change.ignored) continue;
      change.inner = innerFragments(
        blockText(lines1, change.start1, change.end1),
        blockText(lines2, change.start2, change.end2),
        options.ignore,
        options.highlight === "chars",
      );
    }
  }
  return { lines1, lines2, changes };
}

/** Görünen (yok sayılmayan) blok sayısı — "N fark". */
export function countChanges(changes: readonly LineChange[]): number {
  let n = 0;
  for (const change of changes) if (!change.ignored) n++;
  return n;
}

// ---------------------------------------------------------------- katlama

/**
 * Katlanan değişmemiş aralık. İki tarafta aynı uzunlukta (değişmemiş satırlar
 * birebir eşleşiyor), ekranda iki tarafta da tek satırlık bir yer tutucu.
 */
export interface Fold {
  start1: number;
  end1: number;
  start2: number;
  end2: number;
}

/**
 * İki değişiklik arasındaki değişmemiş aralık — katlamanın hammaddesi.
 *
 * `above`/`below`: aralığın üstünde/altında GÖRÜNEN bir değişiklik var mı;
 * bağlam satırları yalnızca o yanda bırakılıyor. Yok sayılan blok da bir
 * SINIR (iki tarafın satır sayısı orada ayrışıyor, katlama onu aşamaz) ama
 * çevresinde bağlam istemiyor.
 */
export interface Gap {
  start1: number;
  end1: number;
  start2: number;
  end2: number;
  above: boolean;
  below: boolean;
}

export function unchangedGaps(changes: readonly LineChange[], n1: number, n2: number): Gap[] {
  const out: Gap[] = [];
  let prev1 = 0;
  let prev2 = 0;
  let prevVisible = false;
  for (const change of changes) {
    out.push({ start1: prev1, end1: change.start1, start2: prev2, end2: change.start2, above: prevVisible, below: !change.ignored });
    prevVisible = !change.ignored;
    prev1 = change.end1;
    prev2 = change.end2;
  }
  out.push({ start1: prev1, end1: n1, start2: prev2, end2: n2, above: prevVisible, below: false });
  return out;
}

/**
 * Aralığın `context` satır bağlam bırakılarak katlanan ortası; katlanacak
 * kadar uzun değilse `null`.
 *
 * İki satırdan kısa aralık katlanmıyor (IntelliJ'in `FoldingModelSupport`ı da
 * öyle): tek satırı tek satırlık bir yer tutucuyla değiştirmek bir şey
 * kazandırmıyor, yalnızca bir tıklama ekliyor.
 */
export function foldGap(gap: Gap, context: number): Fold | null {
  const head = gap.above ? context : 0;
  const tail = gap.below ? context : 0;
  const count = Math.min(gap.end1 - gap.start1, gap.end2 - gap.start2) - head - tail;
  if (count < 2) return null;
  return {
    start1: gap.start1 + head,
    end1: gap.start1 + head + count,
    start2: gap.start2 + head,
    end2: gap.start2 + head + count,
  };
}

/**
 * "Collapse Unchanged Fragments": değişikliklerden `context` satırdan uzak
 * değişmemiş aralıklar.
 *
 * Değişiklik yoksa hiçbir şey katlanmıyor — aynı iki dosyada ekranın boş bir
 * yer tutucudan ibaret kalması "dosya boş mu?" diye okunurdu.
 */
export function foldRanges(changes: readonly LineChange[], n1: number, n2: number, context: number): Fold[] {
  if (!changes.some((c) => !c.ignored)) return [];
  const out: Fold[] = [];
  for (const gap of unchangedGaps(changes, n1, n2)) {
    const fold = foldGap(gap, context);
    if (fold) out.push(fold);
  }
  return out;
}

// --------------------------------------------------------- satır eşlemesi

/**
 * Bir taraftaki (kesirli) satırın öteki taraftaki karşılığı.
 *
 * Değişmemiş satırlar birebir eşleşiyor. Değişen bloğun İÇİNDE de birebir,
 * ama karşı tarafın bloğunun sonunda duruyor — IntelliJ'in `transferLine`ı
 * böyle (`SyncScrollSupport`): iki satırlık bir bloğun karşısındaki on satırlık
 * bloğu kaydırırken kısa taraf iki satır ilerleyip bloğun sonunda bekliyor.
 * Boş aralık (ekleme) karşı tarafta tek bir nokta.
 */
export function transferLine(changes: readonly LineChange[], line: number, fromLeft: boolean): number {
  let delta = 0;
  for (const change of changes) {
    const s = fromLeft ? change.start1 : change.start2;
    const e = fromLeft ? change.end1 : change.end2;
    const os = fromLeft ? change.start2 : change.start1;
    const oe = fromLeft ? change.end2 : change.end1;
    if (line < s) break;
    if (line < e) return Math.min(os + (line - s), oe);
    delta = oe - e;
  }
  return line + delta;
}

// ---------------------------------------------------------- bloğu uygula

/**
 * Sağ dosyada bir bloğu soldaki karşılığıyla değiştirir — IntelliJ'in `»`
 * düğmesi; yerel değişikliklerde "bu bloğu geri al".
 *
 * Ham metin üzerinde çalışıyor: dosyanın satır sonları (`\r\n`) ve sonundaki
 * satır sonunun olup olmadığı KORUNUYOR, yalnızca bloğun satırları değişiyor.
 * Satırlara bölüp yeniden birleştirmek bütün dosyanın satır sonlarını tek
 * biçime çevirirdi ve `git diff` dosyanın tamamını değişmiş gösterirdi.
 */
export function applyChange(raw2: string, lines1: readonly string[], change: LineChange): string {
  const sep = lineSeparator(raw2);
  // Satır başları: `starts[k]` k. satırın ilk karakteri; `ends[k]` ayırıcıdan önceki son konum.
  const starts: number[] = [0];
  const ends: number[] = [];
  const re = /\r\n|\r|\n/g;
  for (let m = re.exec(raw2); m; m = re.exec(raw2)) {
    ends.push(m.index);
    starts.push(m.index + m[0].length);
  }
  ends.push(raw2.length);
  const n = starts.length;

  const s = change.start2;
  const e = change.end2;
  const replacement = lines1.slice(change.start1, change.end1);

  if (s === e) {
    // Sağ tarafta satır yok: soldaki satırları bu noktaya ekle.
    if (replacement.length === 0) return raw2;
    if (s < n) return raw2.slice(0, starts[s]) + replacement.join(sep) + sep + raw2.slice(starts[s]);
    return raw2 + sep + replacement.join(sep);
  }

  let from = starts[s];
  const to = e < n ? starts[e] : raw2.length;
  let text: string;
  if (replacement.length === 0) {
    text = "";
    // Son satırlar siliniyorsa ÖNCEKİ satırın ayırıcısı da gitmeli; yoksa
    // dosyanın sonunda olmayan bir boş satır kalır.
    if (e >= n && s > 0) from = ends[s - 1];
  } else {
    text = replacement.join(sep) + (e < n ? sep : "");
  }
  return raw2.slice(0, from) + text + raw2.slice(to);
}

/**
 * Soldaki satırları sağdaki bloğun ARKASINA ekler — Ctrl basılıyken `»`
 * "Append" oluyor (IntelliJ'de değiştirilmiş blokta).
 *
 * Bloğun sağ satırları yerinde kalıyor, soldakiler hemen altına geliyor:
 * "eskiyi geri getir ama yeniyi de silme".
 */
export function appendChange(raw2: string, lines1: readonly string[], change: LineChange): string {
  const at = { ...change, start2: change.end2, end2: change.end2, start1: change.start1, end1: change.end1 };
  return applyChange(raw2, lines1, at);
}
