import {
  EncodedTokenMetadata,
  INITIAL,
  type IGrammar,
  type ITokenizeLineResult2,
  type StateStack,
} from "@shikijs/primitive/textmate";

/**
 * Bir dosyanın satır satır renklendirilmesi — VS Code'un yaptığı gibi.
 *
 * TextMate grameri satırları SIRAYLA işliyor: her satır bir önceki satırın
 * bittiği durumdan (açık yorum, dize, şablon...) başlıyor. Burada her satırın
 * bitiş durumu saklanıyor; bir satır değişince yalnızca o satırdan itibaren,
 * bitiş durumu eskisiyle AYNI çıkana kadar yeniden renklendiriliyor. Bir harf
 * eklemek tek satır demek; `/*` yazmak dosyanın kalanı.
 *
 * İş dilim dilim (`work`): renklendirici ayrı iş parçacığında olsa da yeni
 * gelen düzenlemeleri bekletmesin.
 */

/** Bir satırın belirteçleri: `[başlangıç, sınıf, başlangıç, sınıf, …]`. Boş: düz metin. */
export type LineTokens = readonly number[];

/** Ardışık satırların yeni belirteçleri. */
export interface TokenChunk {
  start: number;
  tokens: LineTokens[];
}

/**
 * Bundan uzun satır renklendirilmiyor (VS Code'da `maxTokenizationLineLength`).
 * Küçültülmüş bir paketin tek satırı yüzlerce kilobayt; TextMate onu saniyeler
 * içinde ve on binlerce belirteçle bitirirdi. Satır düz kalıyor, durum
 * değişmeden sonrakine geçiyor.
 */
export const MAX_LINE = 10_000;

/**
 * Bir satırın bir denemesine ayrılan en uzun süre (ms; VS Code'unki de 500).
 * Son deneme de dolarsa satırın kalanı düz kalıyor.
 *
 * Süreye gramerin düzenli ifadelerinin DERLENMESİ de giriyor ve o, dilin ilk
 * satırlarında oluyor. ÖLÇÜLDÜ: TSX'in ilk satırı soğuk motorda 175 ms; 100
 * ms'lik sınırla ilk dosyanın ilk satırı yarıda kesiliyordu. Derlenen
 * ifadeler kalıcı: süre dolan satır yeniden deneniyor (`LINE_ATTEMPTS`).
 */
export const LINE_TIME_LIMIT = 500;

/**
 * Süresi dolan satır, her deneme bir öncekinden İLERİ gittikçe (`advanced`)
 * yeniden deneniyor, en çok bu kadar kez. İlerlemeyen deneme ağır bir satır
 * demek: bırakılıyor, maliyeti iki deneme.
 *
 * Tek yeniden deneme yük altında yetmiyordu. ÖLÇÜLDÜ (tam test takımı
 * paralel koşarken, 2026-10-13): TypeScript'in soğuk ilk satırı ilk denemede
 * üç koşunun üçünde kesildi (535–544 ms); yeniden deneme 61, 494 ve 504 ms,
 * sonuncusunda yine kesildi. Kesilen satırın kalanı düz: test `return`den
 * sonrasını (`fetch`, `"x"`, `42`) renksiz bularak düştü.
 */
export const LINE_ATTEMPTS = 8;

export class SyntaxDocument {
  private lines: string[];
  /** Satırın BİTİŞ durumu; `undefined`: henüz renklendirilmedi. */
  private states: (StateStack | undefined)[];
  /** Renklendirilmesi gereken satırlar. */
  private dirty: boolean[];
  private dirtyCount: number;
  /** İlk kirli satır (yoksa satır sayısı). */
  private next = 0;

  constructor(
    private readonly grammar: IGrammar,
    /** Renk kimliği → sınıf (`syntaxScopes.classTable`). */
    private readonly classOf: Uint8Array,
    lines: readonly string[],
    /**
     * Bir denemenin süre sınırı (ms); 0: sınırsız (vscode-textmate'te de).
     * Testler kaldırıyor: renk sınıfını sınayan bir test makinenin yüküne
     * bağlı kalmasın (bkz. `syntax.test.ts`).
     */
    private readonly lineTimeLimit = LINE_TIME_LIMIT,
  ) {
    this.lines = lines.slice();
    this.states = new Array(lines.length).fill(undefined);
    this.dirty = new Array(lines.length).fill(true);
    this.dirtyCount = lines.length;
  }

  get lineCount(): number {
    return this.lines.length;
  }

  /** Bekleyen iş var mı? */
  get pending(): boolean {
    return this.dirtyCount > 0;
  }

  /** `[start, start + removed)` satırlarının yerine `inserted`. */
  replace(start: number, removed: number, inserted: readonly string[]): void {
    const end = start + removed;
    for (let i = start; i < end; i++) if (this.dirty[i]) this.dirtyCount--;
    const blank = new Array<undefined>(inserted.length).fill(undefined);
    this.lines = splice(this.lines, start, end, inserted);
    this.states = splice(this.states, start, end, blank);
    this.dirty = splice(this.dirty, start, end, new Array<boolean>(inserted.length).fill(true));
    this.dirtyCount += inserted.length;
    // Yalnızca silindiyse ardından gelen satırın başlangıç durumu değişti.
    if (inserted.length === 0 && start < this.lines.length) this.mark(start);
    if (this.next >= end) this.next += inserted.length - removed;
    else if (this.next > start) this.next = start;
    if (inserted.length > 0 || start < this.lines.length) this.next = Math.min(this.next, start);
  }

  /**
   * `deadline`e (`performance.now()` cinsinden) kadar renklendirir ve
   * belirteçleri değişen satırları döndürür.
   */
  work(deadline: number): TokenChunk[] {
    const chunks: TokenChunk[] = [];
    let chunk: TokenChunk | null = null;
    let i = this.next;
    while (i < this.lines.length && this.dirtyCount > 0) {
      if (!this.dirty[i]) {
        i = this.findDirty(i + 1);
        chunk = null;
        continue;
      }
      const start = i === 0 ? INITIAL : this.states[i - 1]!;
      const { tokens, end } = this.tokenize(this.lines[i], start);
      const prev = this.states[i];
      this.states[i] = end;
      this.dirty[i] = false;
      this.dirtyCount--;
      // Bitiş durumu değiştiyse sonraki satır da baştan bakılmalı.
      if ((!prev || !prev.equals(end)) && i + 1 < this.lines.length) this.mark(i + 1);
      if (!chunk) {
        chunk = { start: i, tokens: [] };
        chunks.push(chunk);
      }
      chunk.tokens.push(tokens);
      i++;
      if (performance.now() >= deadline) break;
    }
    this.next = i < this.lines.length && this.dirty[i] ? i : this.findDirty(i);
    return chunks;
  }

  private mark(i: number) {
    if (!this.dirty[i]) {
      this.dirty[i] = true;
      this.dirtyCount++;
    }
  }

  private findDirty(from: number): number {
    if (this.dirtyCount === 0) return this.lines.length;
    for (let i = from; i < this.lines.length; i++) if (this.dirty[i]) return i;
    // Kirli satır `from`un gerisinde kaldı (dilim ortasında bir düzenleme).
    for (let i = 0; i < from && i < this.lines.length; i++) if (this.dirty[i]) return i;
    return this.lines.length;
  }

  private tokenize(line: string, start: StateStack): { tokens: LineTokens; end: StateStack } {
    if (line.length > MAX_LINE) return { tokens: [], end: start };
    let result = this.grammar.tokenizeLine2(line, start, this.lineTimeLimit);
    for (let n = 1; result.stoppedEarly && n < LINE_ATTEMPTS; n++) {
      const next = this.grammar.tokenizeLine2(line, start, this.lineTimeLimit);
      // Yerinde sayan ya da geri kalan (makine o an daha yüklü) deneme: en
      // ileri gideni tut, bırak.
      if (next.stoppedEarly && !advanced(result, next)) break;
      result = next;
    }
    const raw = result.tokens;
    const out: number[] = [];
    let last = -1;
    for (let k = 0; k < raw.length; k += 2) {
      const at = raw[k];
      if (at >= line.length) break;
      const cls = this.classOf[EncodedTokenMetadata.getForeground(raw[k + 1])] ?? 0;
      if (cls === last) continue;
      out.push(at, cls);
      last = cls;
    }
    const tokens = out.length === 2 && out[1] === 0 ? [] : out;
    // Süre doldu: VS Code gibi durum satırın BAŞINDAKİ; yarım kalmış bir
    // durumla sonraki satırları boyamak, bir satırı düz bırakmaktan kötü.
    return { tokens, end: result.stoppedEarly ? start : result.ruleStack };
  }
}

/**
 * Süresi dolan `next`, `prev`den ileri gitti mi? Satırın aynı durumdan
 * taranışı belirlenimci: ikisi aynı belirteçlerle başlıyor, fark kesildikleri
 * yerde. İleri: son belirteç daha sonra başlıyor, ya da aynı yerde başlıyor
 * ama kendisi ya da durum değişmiş — tarama birçok adımda yeni belirteç
 * açmadan kural değiştiriyor. ÖLÇÜLDÜ: `syntax.test.ts`teki TypeScript
 * satırının 30 tarama adımının 12'sinde son belirteç yerinde kalıyor,
 * bunların 10'unda durum değişiyor; yalnızca belirtece bakmak o denemeleri
 * ilerlemiyor sayardı.
 */
function advanced(prev: ITokenizeLineResult2, next: ITokenizeLineResult2): boolean {
  const a = prev.tokens;
  const b = next.tokens;
  const from = a[a.length - 2];
  const to = b[b.length - 2];
  if (to !== from) return to > from;
  return b[b.length - 1] !== a[a.length - 1] || !next.ruleStack.equals(prev.ruleStack);
}

/** `arr[from, to)` yerine `items`; yeni dizi (büyük yapıştırmada `...` yığını taşırırdı). */
function splice<T>(arr: T[], from: number, to: number, items: readonly T[]): T[] {
  return arr.slice(0, from).concat(items as T[], arr.slice(to));
}
