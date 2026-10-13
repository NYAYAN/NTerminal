import { createJavaScriptRegexEngine } from "@shikijs/engine-javascript";
import { createShikiPrimitiveAsync, type ShikiPrimitive } from "@shikijs/primitive";
import type { IGrammar } from "@shikijs/primitive/textmate";

import { SyntaxDocument, type TokenChunk } from "./syntaxDocument";
import { GRAMMARS } from "./syntaxGrammars";
import { CLASSIFIER_THEME, classTable } from "./syntaxScopes";

/**
 * Renklendiricinin kendisi: açık belgeler, gramer yükleme, dilim dilim iş.
 *
 * Ayrı iş parçacığında (`syntax.worker.ts`) koşuyor; testler aynı hizmeti
 * süreç içinde kuruyor. Ana pencereyle konuşma yalnızca iletiyle:
 *
 * - `open`  — belgenin bütün satırları ve dili,
 * - `edit`  — `[start, start + removed)` satırlarının yerine `inserted`,
 * - `close` — belge kapandı.
 *
 * Yanıt `tokens`: belgenin hangi SÜRÜMÜNE (`version`, her düzenlemede bir
 * artıyor) ait olduğuyla. Ana pencere o arada yazmaya devam ettiyse satırları
 * kendi düzenleme kaydından geçirip yerine oturtuyor (`syntax.ts`).
 */

export type SyntaxRequest =
  | { type: "open"; doc: number; lang: string; lines: string[] }
  | { type: "edit"; doc: number; version: number; start: number; removed: number; inserted: string[] }
  | { type: "close"; doc: number };

export type SyntaxReply =
  | { type: "tokens"; doc: number; version: number; chunks: TokenChunk[] }
  | { type: "failed"; doc: number };

/**
 * Bir dilimin süresi (ms). Düzenleme iletisi en çok bu kadar bekliyor; iş
 * ayrı iş parçacığında olduğu için arayüzü dondurmuyor.
 */
const SLICE_MS = 12;

/**
 * Düzenlemenin hemen ardından yapılan ilk dilim: değişen satır, sıradaki iş
 * beklemeden boyansın.
 */
const EDIT_SLICE_MS = 4;

interface Entry {
  version: number;
  lang: string;
  /** Gramer yüklenene kadar satırlar burada; sonra belgede. */
  lines: string[];
  doc: SyntaxDocument | null;
}

interface Engine {
  shiki: ShikiPrimitive;
  classOf: Uint8Array;
}

export function createSyntaxService(
  post: (reply: SyntaxReply) => void,
  schedule: (run: () => void) => void = (run) => setTimeout(run, 0),
): (request: SyntaxRequest) => void {
  const docs = new Map<number, Entry>();
  const grammars = new Map<string, Promise<IGrammar>>();
  let engine: Promise<Engine> | null = null;
  let scheduled = false;

  const getEngine = () =>
    (engine ??= createShikiPrimitiveAsync({
      themes: [CLASSIFIER_THEME],
      langs: [],
      // `forgiving`: JavaScript'in düzenli ifadelerine çevrilemeyen tek tük
      // kalıp atlanıyor; bütün dil düşmesin.
      engine: createJavaScriptRegexEngine({ forgiving: true }),
    }).then((shiki) => ({ shiki, classOf: classTable(shiki.setTheme(CLASSIFIER_THEME.name!).colorMap) })));

  const getGrammar = (lang: string): Promise<IGrammar> => {
    let pending = grammars.get(lang);
    if (!pending) {
      const load = GRAMMARS[lang];
      pending = load
        ? getEngine().then(async ({ shiki }) => {
            await shiki.loadLanguage((await load()).default);
            return shiki.getLanguage(lang);
          })
        : Promise.reject(new Error(`dil yok: ${lang}`));
      // Yüklenemeyen dil bir sonraki dosyada yeniden denensin.
      pending.catch(() => grammars.delete(lang));
      grammars.set(lang, pending);
    }
    return pending;
  };

  /** Belgenin `deadline`e kadar olan işi; yeni belirteçler hemen gönderiliyor. */
  const step = (id: number, entry: Entry, deadline: number) => {
    if (!entry.doc?.pending) return;
    let chunks: TokenChunk[];
    try {
      chunks = entry.doc.work(deadline);
    } catch {
      // Gramerin bir kalıbı bu satırda patladı: her dilimde yeniden patlamasın,
      // dosya düz metin kalsın.
      docs.delete(id);
      post({ type: "failed", doc: id });
      return;
    }
    if (chunks.length > 0) post({ type: "tokens", doc: id, version: entry.version, chunks });
  };

  const pump = () => {
    scheduled = false;
    const deadline = performance.now() + SLICE_MS;
    // Son dokunulan belge önde (Map eklenme sırasını tutuyor; dokunulan sona
    // taşınıyor, bu yüzden tersten).
    for (const [id, entry] of [...docs].reverse()) {
      step(id, entry, deadline);
      if (performance.now() >= deadline) break;
    }
    if ([...docs.values()].some((e) => e.doc?.pending)) wake();
  };

  const wake = () => {
    if (scheduled) return;
    scheduled = true;
    schedule(pump);
  };

  /** Belgeyi sıranın sonuna (en öne) al. */
  const touch = (id: number, entry: Entry) => {
    docs.delete(id);
    docs.set(id, entry);
  };

  return (request) => {
    switch (request.type) {
      case "open": {
        const entry: Entry = { version: 0, lang: request.lang, lines: request.lines, doc: null };
        docs.set(request.doc, entry);
        void Promise.all([getEngine(), getGrammar(request.lang)]).then(
          ([{ classOf }, grammar]) => {
            if (docs.get(request.doc) !== entry) return;
            entry.doc = new SyntaxDocument(grammar, classOf, entry.lines);
            entry.lines = [];
            wake();
          },
          () => {
            if (docs.get(request.doc) !== entry) return;
            docs.delete(request.doc);
            post({ type: "failed", doc: request.doc });
          },
        );
        return;
      }
      case "edit": {
        const entry = docs.get(request.doc);
        if (!entry) return;
        entry.version = request.version;
        if (entry.doc) {
          entry.doc.replace(request.start, request.removed, request.inserted);
          touch(request.doc, entry);
          step(request.doc, entry, performance.now() + EDIT_SLICE_MS);
          wake();
        } else {
          const { start, removed, inserted } = request;
          entry.lines = entry.lines.slice(0, start).concat(inserted, entry.lines.slice(start + removed));
        }
        return;
      }
      case "close":
        docs.delete(request.doc);
        return;
    }
  };
}
