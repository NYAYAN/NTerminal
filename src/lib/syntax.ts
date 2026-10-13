import { useEffect, useLayoutEffect, useReducer, useRef } from "react";

import type { LineTokens } from "./syntaxDocument";
import { syntaxLanguage } from "./syntaxLanguages";
import type { SyntaxReply, SyntaxRequest } from "./syntaxService";

/**
 * Sözdizimi renklendirmesi — ana pencere tarafı.
 *
 * İSTEK: "Dosyaları açtığımda kodları renkli göstermek mümkün mü? VS Code'da,
 * IntelliJ'de, WebStorm'da nasıl oluyorsa öyle bir şey istiyorum."
 *
 * Belirteçler VS Code'un KENDİ gramerlerinden (TextMate, Shiki paketlerinden):
 * aynı kural takımı, aynı ayrımlar. İş ayrı bir iş parçacığında
 * (`syntax.worker.ts`); burada belgenin satırları, her satırın belirteçleri ve
 * düzenlemelerin kaydı tutuluyor.
 *
 * ## Yazarken renkler kaymıyor
 *
 * Düzenlenen satırın belirteçleri iş parçacığının yanıtını beklemiyor: eski
 * belirteçler değişikliğin üzerinden taşınıyor (`carryTokens`) — bir sözcüğün
 * sonuna eklenen harf o sözcüğün renginde, satır bölününce ikinci yarı kendi
 * rengiyle. Kesin belirteçler bir sonraki karede yetişiyor. Yanıt geldiğinde
 * kullanıcı yazmaya devam ettiyse satırlar düzenleme kaydından geçiriliyor
 * (`mapLine`): o arada değişen satırın eski yanıtı atılıyor, kayan satırınki
 * yeni yerine oturuyor.
 */

export type { LineTokens };

/** Renklendiriciyle konuşan uç: iş parçacığı ya da (testlerde) süreç içi hizmet. */
export interface SyntaxHost {
  post(request: SyntaxRequest): void;
  listen(receive: (reply: SyntaxReply) => void): void;
}

/** `undefined`: henüz kurulmadı; `null`: bu ortamda yok (jsdom, iş parçacığı açılamadı). */
let host: SyntaxHost | null | undefined;
const sessions = new Map<number, SyntaxSession>();
let nextId = 1;

function connect(target: SyntaxHost) {
  target.listen((reply) => sessions.get(reply.doc)?.receive(reply));
}

function getHost(): SyntaxHost | null {
  if (host !== undefined) return host;
  host = null;
  if (typeof Worker === "undefined") return host;
  try {
    const worker = new Worker(new URL("./syntax.worker.ts", import.meta.url), { type: "module" });
    const target: SyntaxHost = {
      post: (request) => worker.postMessage(request),
      listen: (receive) =>
        worker.addEventListener("message", (event: MessageEvent<SyntaxReply>) => receive(event.data)),
    };
    // İş parçacığının modülü yüklenemediyse dosyalar düz metin kalıyor.
    worker.addEventListener("error", () => {
      for (const session of sessions.values()) session.fail();
    });
    connect(target);
    host = target;
  } catch {
    host = null;
  }
  return host;
}

/** Testler: renklendiriciyi değiştirir (`null`: yok, `undefined`: iş parçacığı). */
export function setSyntaxHost(next: SyntaxHost | null | undefined): void {
  sessions.clear();
  host = next;
  if (next) connect(next);
}

/** Düzenleme kaydının bir girdisi: iş parçacığının yanıtını yerine oturtmak için. */
interface LoggedEdit {
  version: number;
  start: number;
  removed: number;
  inserted: number;
}

/** Bir dosyanın renklendirme oturumu. Ana pencere tarafında tek kaynak. */
export class SyntaxSession {
  readonly id = nextId++;
  lines: readonly string[];
  /** Satırların belirteçleri; `undefined`: henüz gelmedi (düz metin). */
  tokens: readonly (LineTokens | undefined)[];
  /**
   * Satırların KALICI anahtarları: satır eklenince ya da silinince altındaki
   * satırlar yeni anahtar almıyor, React onları yeniden çizmiyor. Dizinle
   * anahtarlamak 5.000 satırlık bir dosyada Enter'a basınca 5.000 satırı
   * baştan çizerdi.
   */
  keys: readonly number[];
  failed = false;
  private version = 0;
  private edits: LoggedEdit[] = [];
  private outbox: SyntaxRequest[] = [];
  private nextKey: number;
  private closed = false;

  constructor(
    readonly path: string,
    readonly lang: string,
    lines: readonly string[],
    private readonly target: SyntaxHost,
    private readonly changed: () => void,
  ) {
    this.lines = lines;
    this.tokens = new Array<undefined>(lines.length).fill(undefined);
    this.keys = Array.from({ length: lines.length }, (_, i) => i);
    this.nextKey = lines.length;
    sessions.set(this.id, this);
    target.post({ type: "open", doc: this.id, lang, lines: lines.slice() });
  }

  /**
   * Yeni satırlar (çizim sırasında çağrılıyor). Aynı dizi için ikinci çağrı
   * hiçbir şey yapmıyor; düzenleme iş parçacığına `flush`ta gidiyor.
   */
  sync(lines: readonly string[]): void {
    if (lines === this.lines || this.closed) return;
    const prev = this.lines;
    this.lines = lines;
    let start = 0;
    const shortest = Math.min(prev.length, lines.length);
    while (start < shortest && prev[start] === lines[start]) start++;
    let endPrev = prev.length;
    let endNext = lines.length;
    while (endPrev > start && endNext > start && prev[endPrev - 1] === lines[endNext - 1]) {
      endPrev--;
      endNext--;
    }
    if (endPrev === start && endNext === start) return;

    const removed = endPrev - start;
    const inserted = lines.slice(start, endNext);
    const carried = carryTokens(prev.slice(start, endPrev), this.tokens.slice(start, endPrev), inserted);
    this.tokens = this.tokens.slice(0, start).concat(carried, this.tokens.slice(endPrev));
    // Değişen satır anahtarını koruyor; fazlası yeni anahtar alıyor.
    const kept = Math.min(removed, inserted.length);
    const fresh = Array.from({ length: inserted.length - kept }, () => this.nextKey++);
    this.keys = this.keys.slice(0, start).concat(this.keys.slice(start, start + kept), fresh, this.keys.slice(endPrev));

    this.version++;
    this.edits.push({ version: this.version, start, removed, inserted: inserted.length });
    this.outbox.push({ type: "edit", doc: this.id, version: this.version, start, removed, inserted });
  }

  /** Bekleyen düzenlemeleri iş parçacığına gönderir (çizim işlendikten sonra). */
  flush(): void {
    if (this.closed) return;
    for (const request of this.outbox) this.target.post(request);
    this.outbox = [];
  }

  receive(reply: SyntaxReply): void {
    if (this.closed) return;
    if (reply.type === "failed") {
      this.fail();
      return;
    }
    // Bu sürümü gören iş parçacığı ondan öncekileri de görmüş: kayıt kısalıyor.
    this.edits = this.edits.filter((edit) => edit.version > reply.version);
    let next: (LineTokens | undefined)[] | null = null;
    for (const chunk of reply.chunks) {
      chunk.tokens.forEach((tokens, k) => {
        const line = this.mapLine(chunk.start + k);
        if (line < 0 || line >= this.lines.length) return;
        next ??= this.tokens.slice();
        next[line] = tokens;
      });
    }
    if (next) {
      this.tokens = next;
      this.changed();
    }
  }

  fail(): void {
    if (this.failed) return;
    this.failed = true;
    this.changed();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    sessions.delete(this.id);
    this.target.post({ type: "close", doc: this.id });
  }

  /**
   * İş parçacığının bildiği satır numarası → bugünkü. O arada düzenlenen
   * satır için -1: eski belirteçleri yeni metne uymaz.
   */
  private mapLine(line: number): number {
    for (const edit of this.edits) {
      if (line < edit.start) continue;
      if (line < edit.start + edit.removed) return -1;
      line += edit.inserted - edit.removed;
    }
    return line;
  }
}

/**
 * Düzenlenen satırların yeni hâlleri için, eski belirteçlerden TAHMİN.
 *
 * Değişmeyen baş eski belirteçleriyle kalıyor; eklenen metin hemen önündeki
 * belirtecin rengini alıyor (bir sözcüğün ya da dizenin sonuna yazmak onun
 * rengini sürdürüyor); değişmeyen son, eski belirteçleriyle yeni yerine
 * kayıyor. Aradaki yeni satırlar düz. İş parçacığının kesin cevabı bir sonraki
 * karede bunların yerini alıyor — yalnızca o karede satır renksiz
 * görünmesin diye.
 */
export function carryTokens(
  before: readonly string[],
  tokens: readonly (LineTokens | undefined)[],
  after: readonly string[],
): (LineTokens | undefined)[] {
  const out = new Array<LineTokens | undefined>(after.length).fill(undefined);
  if (before.length === 0 || after.length === 0) return out;
  const first = before[0];
  const last = before[before.length - 1];
  const head = tokens[0];
  const tail = tokens[tokens.length - 1];
  const a = after[0];
  const z = after[after.length - 1];

  let p = 0;
  const pMax = Math.min(first.length, a.length);
  while (p < pMax && first.charCodeAt(p) === a.charCodeAt(p)) p++;
  // Tek satırda baş ile son örtüşmesin.
  const sMax = Math.min(last.length - (before.length === 1 ? p : 0), z.length - (after.length === 1 ? p : 0));
  let s = 0;
  while (s < sMax && last.charCodeAt(last.length - 1 - s) === z.charCodeAt(z.length - 1 - s)) s++;

  const headPairs = (end: number): number[] => {
    if (!head) return [];
    const pairs: number[] = [];
    for (let k = 0; k < head.length; k += 2) if (head[k] < p) pairs.push(head[k], head[k + 1]);
    if (end > p) pairs.push(p, classAt(head, Math.max(0, p - 1)));
    return pairs;
  };
  const tailPairs = (): number[] => {
    if (!tail || s === 0) return [];
    const from = last.length - s;
    const shift = z.length - s - from;
    const pairs = [from + shift, classAt(tail, from)];
    for (let k = 0; k < tail.length; k += 2) if (tail[k] > from) pairs.push(tail[k] + shift, tail[k + 1]);
    return pairs;
  };

  if (after.length === 1) {
    if (head || tail) out[0] = normalize(headPairs(z.length - s).concat(tailPairs()), z.length);
  } else {
    if (head) out[0] = normalize(headPairs(a.length), a.length);
    if (tail) out[after.length - 1] = normalize(tailPairs(), z.length);
  }
  return out;
}

/** `x` konumundaki karakterin sınıfı. */
function classAt(tokens: LineTokens, x: number): number {
  let cls = 0;
  for (let k = 0; k < tokens.length && tokens[k] <= x; k += 2) cls = tokens[k + 1];
  return cls;
}

/** Aynı başlangıçta sonuncusu, satır dışı olan yok, ardışık aynı sınıf tek. */
function normalize(pairs: number[], length: number): LineTokens {
  const out: number[] = [];
  for (let k = 0; k < pairs.length; k += 2) {
    const at = pairs[k];
    const cls = pairs[k + 1];
    if (at >= length) break;
    if (out.length > 0 && out[out.length - 2] === at) out.length -= 2;
    if (out.length > 0 && out[out.length - 1] === cls) continue;
    out.push(at, cls);
  }
  return out.length === 2 && out[0] === 0 && out[1] === 0 ? [] : out;
}

/** `useSyntax`ın verdiği: satır başına belirteçler ve kalıcı anahtarlar. */
export interface SyntaxView {
  readonly tokens: readonly (LineTokens | undefined)[];
  readonly keys: readonly number[];
}

/**
 * Dosyanın renklendirmesi. `lines` dosyanın GÖRÜNEN satırları (`\n` ile
 * bölünmüş); `null`: okunmadı, ikili ya da okunamadı. Dil tanınmıyorsa ya da
 * renklendirici yoksa `null` — dosya düz metin.
 */
export function useSyntax(path: string, lines: readonly string[] | null): SyntaxView | null {
  const lang = lines ? syntaxLanguage(path) : null;
  const [, changed] = useReducer((n: number) => n + 1, 0);
  const current = useRef<SyntaxSession | null>(null);
  const latest = useRef(lines);
  latest.current = lines;

  useEffect(() => {
    const first = latest.current;
    const target = lang && first ? getHost() : null;
    if (!target || !lang || !first) return;
    const session = new SyntaxSession(path, lang, first, target, changed);
    current.current = session;
    changed();
    return () => {
      session.close();
      if (current.current === session) current.current = null;
    };
  }, [path, lang]);

  const session = current.current;
  const live = session && session.path === path && lines ? session : null;
  live?.sync(lines!);
  useLayoutEffect(() => {
    live?.flush();
  });
  return live;
}
