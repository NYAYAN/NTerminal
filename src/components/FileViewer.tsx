import {
  Fragment,
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import {
  applyEdit,
  displayOffset,
  EditHistory,
  editableEol,
  indentUnit,
  lineAt,
  offsetOfLine,
  textEdit,
  toDisplay,
  toFile,
} from "../lib/diffEdit";
import { folderLabel } from "../lib/dirs";
import {
  escapeText,
  findCount,
  findInLines,
  isFindKey,
  matchAtOrAfter,
  provideViewerFind,
  type FindMatch,
  type FindResult,
} from "../lib/fileFind";
import { baseName, formatBytes } from "../lib/format";
import { useT } from "../lib/i18n";
import { api } from "../lib/ipc";
import { prettyCombo } from "../lib/keys";
import { isMac } from "../lib/platform";
import { useSyntax, type LineTokens } from "../lib/syntax";
import { useStore } from "../store/useStore";
import { EditorLayer, type EditorBinding, type EditorHandle } from "./DiffEditor";
import { FileFind } from "./FileFind";
import { CloseIcon, ImageIcon, PencilIcon, RedoIcon, SaveIcon, UndoIcon } from "./Icons";
import { CHUNK, CodeLayer, sameLines, tokenSpans } from "./SyntaxText";
import type { FileText, ViewerReveal } from "../types";

/**
 * Dosya görüntüleyici — dosya panelinde ağacın YANINDA, terminalin kalan
 * genişliğinde.
 *
 * ## Neden ağacın yanında, onun yerinde değil
 *
 * İlk hâli ağaçla aynı sütunu paylaşıyordu: dosya seçilince ağaç gidiyor,
 * "geri" ile dönüyordu. Sütun dar olduğu için kod bir şeride sıkışıyordu ve
 * başka bir dosyaya bakmak her seferinde geri-ileri demekti. İSTEK: "bir dosyayı
 * seçersem yanına full width olarak açılsın." Şimdi ağaç solda kalıyor,
 * görüntüleyici sağdaki bütün genişliği alıyor; başlıktaki × yalnızca dosyayı
 * kapatıyor, ağaç yerinde.
 *
 * ## Aramadan gelince o satıra gidiyor
 *
 * İçerik aramasından açılan dosya (`reveal`) eşleşmenin satırına kaydırılıyor,
 * satır ve eşleşme işaretleniyor. Aynı dosyada başka bir eşleşmeye tıklamak
 * dosyayı yeniden okumadan oraya gidiyor (`seq`).
 *
 * ## Düzenleme
 *
 * İSTEK: "Dosyalar kısmından bir dosyayı açtığımda orada da düzenleme
 * yapabilmeliyim, kaydet butonu da olmalı; düzenle, geri al, ileri al, kaydet."
 * Varsayılan salt okunur; kalem (Düzenle) yazı alanını açıp kapatıyor ve
 * açıkken vurgu renginde. Fark penceresinin yazı alanı ve geri alma geçmişi
 * (`DiffEditor`, `diffEdit`) burada da kullanılıyor: satır sonları dosyanın
 * kendi biçiminde kalıyor, Enter girintiyi koruyor.
 *
 * Kayıt AÇIK: Kaydet düğmesi ya da Ctrl+S / Cmd+S. Kaydedilmemiş değişiklik
 * kaybolmasın diye düzenlemeyi kapatırken, başka dosyaya geçerken, dosyayı ya
 * da paneli kapatırken kendiliğinden yazılıyor (IntelliJ de dosyadan çıkınca
 * kaydediyor). Dosya okunduktan sonra başka bir yerde kaydedildiyse üzerine
 * yazılmıyor; kullanıcı seçiyor.
 *
 * ## Sözdizimi renklendirmesi
 *
 * İSTEK: "Dosyaları açtığımda kodları renkli göstermek mümkün mü? VS Code'da,
 * IntelliJ'de, WebStorm'da nasıl oluyorsa öyle." Önceki karar "renklendirici
 * yok"tu: onlarca gramer, yüzlerce kilobayt. Kullanıcı isteyince maliyet
 * yerine KONUM değişti: gramerler yalnızca o dilde bir dosya açılınca ve ayrı
 * bir iş parçacığında yükleniyor (`lib/syntax.ts`); arayüz beklemiyor, dosya
 * önce düz görünüp renkler gelince boyanıyor.
 *
 * Okurken satırlar belirteç `span`larıyla çiziliyor. Düzenlerken yazı alanının
 * harfleri SAYDAM ve altında aynı metnin renkli bir katmanı var (`.viewer-hl`)
 * — komut satırındaki renklendirmenin yolu (`CommandInput`). İmleç, seçim ve
 * yazmanın kendisi yine tarayıcının yazı alanı.
 *
 * ## Dosyada arama
 *
 * BİLDİRİLEN: "bir dosya açıkken arama için Cmd+F yapınca gidip terminalden
 * search ediyor, dosyadan değil." Arama kısayolu (`findInTerminal`) dosya
 * açıkken bu görüntüleyicinin çubuğunu açıyor (`FileFind`): bütün eşleşmeler
 * işaretli, biri etkin; Enter / Shift+Enter aralarında geziyor. Okurken
 * işaretler satırların içinde; düzenlerken yazı alanının altındaki bir katmanda
 * (`FindLayer`) ve etkin eşleşme yazı alanında SEÇİLİYOR — Esc'den sonra
 * üzerine yazılabilsin.
 *
 * ## Sınırlar BİLDİRİLİYOR
 *
 * Yarım megabayttan sonrası kesiliyor ve kesildiği yazılıyor; ikili dosya da
 * öyle. Sessizce kesmek "dosyanın sonu buymuş" sanmaya yol açardı. Kesilen,
 * ikili ya da satır sonları karışık dosya düzenlenemiyor (geri yazmak dosyayı
 * bozardı); kalem kapalı ve nedenini söylüyor.
 */

/** Yazılan metin (dosyanın kendi biçiminde) ve üzerine yazıldığı disk içeriği. */
interface Edit {
  raw: string;
  base: string;
}

type Issue = "conflict" | "notText";

/** Bayt sayısı: başlıktaki boyut kayıttan sonra da doğru kalsın. */
function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** Düzenlerken yazı alanının genişliği kaba adımlarla büyüyor (bkz. `DiffPanes` `textWidth`). */
const WIDTH_STEP = 40;

/**
 * Kayıttan sonra git durumu hemen tazeleniyor: dosya ağacı ve Değişiklikler
 * paneli dosyayı "değişti" diye işaretlesin. Yoklama (`pollGit`) bunu görmüyor —
 * yalnızca HEAD'e ve indekse bakıyor, çalışma ağacındaki yazmaya değil.
 */
function gitChanged(root: string | null) {
  if (root) void useStore.getState().refreshGit(root);
}

/**
 * Satırı kaydırıcının ortasına getirir; eşleşme yatayda görünmüyorsa onu da.
 *
 * `scrollIntoView` kullanılmıyor: panelin ATALARINI da kaydırıyor (terminal
 * alanı `overflow: hidden` ama kaydırılabilir) ve dikey/yatay kararı tek
 * çağrıda verilemiyor.
 */
function bringIntoView(scroller: HTMLElement, row: HTMLElement, mark: HTMLElement | null) {
  const box = scroller.getBoundingClientRect();
  const r = row.getBoundingClientRect();
  scroller.scrollTop += r.top - box.top - (box.height - r.height) / 2;
  if (!mark) return;
  const m = mark.getBoundingClientRect();
  if (m.left < box.left || m.right > box.right) {
    scroller.scrollLeft += m.left - box.left - box.width / 3;
  }
}

/** Satırın metni, eşleşmesi `<mark>` içinde. Satır o arada kısaldıysa kırpılıyor. */
function markedLine(line: string, col: number, len: number, tokens: LineTokens | undefined) {
  const start = Math.min(col, line.length);
  const end = Math.min(start + len, line.length);
  if (end <= start) return line ? tokenSpans(line, tokens) : " ";
  return (
    <>
      {tokenSpans(line, tokens, 0, start)}
      <mark className="viewer-mark">{tokenSpans(line, tokens, start, end)}</mark>
      {tokenSpans(line, tokens, end)}
    </>
  );
}

/**
 * Satırın metni, dosyada aramanın eşleşmeleri `<mark>` içinde; etkin olan
 * ayrıca işaretli (`.on`). Satır o arada kısaldıysa aralık kırpılıyor.
 */
function foundLine(
  line: string,
  tokens: LineTokens | undefined,
  found: readonly FindMatch[],
  active: FindMatch | null,
): ReactNode {
  const out: ReactNode[] = [];
  let at = 0;
  for (const m of found) {
    const start = Math.min(Math.max(m.start, at), line.length);
    const end = Math.min(m.end, line.length);
    if (end <= start) continue;
    if (start > at) out.push(<Fragment key={`t${at}`}>{tokenSpans(line, tokens, at, start)}</Fragment>);
    out.push(
      <mark key={`m${start}`} className={m === active ? "viewer-find-hit on" : "viewer-find-hit"}>
        {tokenSpans(line, tokens, start, end)}
      </mark>,
    );
    at = end;
  }
  if (at < line.length) out.push(<Fragment key={`t${at}`}>{tokenSpans(line, tokens, at)}</Fragment>);
  return out.length > 0 ? out : " ";
}

/**
 * Etkin eşleşme görünmüyorsa görünür kılar: dikeyde ortalar, yatayda
 * sola yaklaştırır. Görünüyorsa KAYDIRMIYOR — yazdıkça daralan aramada ekran
 * her harfte zıplamasın.
 */
function revealMatch(scroller: HTMLElement, mark: HTMLElement) {
  const box = scroller.getBoundingClientRect();
  const m = mark.getBoundingClientRect();
  if (m.top < box.top || m.bottom > box.bottom) {
    scroller.scrollTop += m.top - box.top - (box.height - m.height) / 2;
  }
  if (m.left < box.left || m.right > box.right) {
    scroller.scrollLeft += m.left - box.left - box.width / 3;
  }
}

/** Dosyada aramanın satır satır eşleşmeleri; eşleşmesi olmayan satır boş (seyrek dizi). */
type FoundLines = readonly (readonly FindMatch[] | undefined)[];

/**
 * Düzenlerken eşleşmelerin işaretleri: yazı alanının ALTINDA, renkli katmanın
 * da altında (bkz. `.viewer-find-layer`).
 *
 * Yalnızca eşleşmesi olan satırlar çiziliyor, her biri kendi satırının
 * yüksekliğinde konumlu; harfler saydam, yalnızca `<mark>`ların zemini
 * görünüyor. Bütün dosyayı ikinci kez çizmek gerekmiyor.
 */
function FindLayer({ lines, found, active }: { lines: readonly string[]; found: FoundLines; active: FindMatch | null }) {
  const rows: ReactNode[] = [];
  found.forEach((ranges, i) => {
    if (!ranges) return;
    rows.push(
      <div key={i} className="viewer-find-row" style={{ "--row": i } as CSSProperties}>
        {foundLine(lines[i] ?? "", undefined, ranges, active)}
      </div>,
    );
  });
  return (
    <div className="viewer-find-layer" aria-hidden="true">
      {rows}
    </div>
  );
}

/** Kapanan aramanın sorgusu: başka bir dosyada arama açılınca kutuda o duruyor. */
let rememberedQuery = "";

/**
 * Okuma görünümünün bir satırı.
 *
 * `memo`: belirteçler parça parça geliyor ve her parça yalnızca kendi
 * satırlarını değiştiriyor; öbür satırların belirteç dizisi aynı nesne
 * kalıyor, React onları yeniden çizmiyor. Satırlar ayrıca dilimli
 * (`RowChunk`): değişmeyen dilimin satır öğeleri hiç kurulmuyor.
 */
const ViewerRow = memo(function ViewerRow({
  no,
  line,
  tokens,
  hit,
  found,
  active,
}: {
  no: number;
  line: string;
  tokens: LineTokens | undefined;
  /** Aramadan gelinen eşleşme; yalnızca o satıra veriliyor. */
  hit: ViewerReveal | null;
  /** Dosyada aramanın bu satırdaki eşleşmeleri. */
  found: readonly FindMatch[] | undefined;
  /** Etkin eşleşme bu satırdaysa o. */
  active: FindMatch | null;
}) {
  return (
    <div className={hit ? "viewer-line hit" : "viewer-line"}>
      {/* Satır numarası seçime girmiyor: kodu kopyalayan biri numaraları da
          kopyalamak istemiyor. */}
      <span className="viewer-no">{no}</span>
      <span className="viewer-text">
        {found
          ? foundLine(line, tokens, found, active)
          : hit
            ? markedLine(line, hit.col, hit.len, tokens)
            : line
              ? tokenSpans(line, tokens)
              : " "}
      </span>
    </div>
  );
});

interface RowChunkProps {
  from: number;
  to: number;
  lines: readonly string[];
  tokens: readonly (LineTokens | undefined)[] | null;
  reveal: ViewerReveal | null;
  found: FoundLines | null;
  active: FindMatch | null;
}

/** Eşleşme bu dilimde mi (yalnızca o dilim işaretle yeniden çiziliyor)? */
const hitIn = (p: RowChunkProps) => (p.reveal && p.reveal.line > p.from && p.reveal.line <= p.to ? p.reveal : null);

/** Etkin arama eşleşmesi bu dilimde mi? Sonrakine geçince yalnızca iki dilim yeniden çiziliyor. */
const activeIn = (p: RowChunkProps) => (p.active && p.active.line >= p.from && p.active.line < p.to ? p.active : null);

/** Dilimin satırlarında arama eşleşmeleri aynı mı? Eşleşmesi olmayan dilim arama açılınca da yeniden çizilmiyor. */
function sameFound(a: RowChunkProps, b: RowChunkProps): boolean {
  if (a.found === b.found) return true;
  for (let i = a.from; i < a.to; i++) if (a.found?.[i] !== b.found?.[i]) return false;
  return true;
}

/** Okuma görünümünün `CHUNK` satırlık dilimi; sarmalayıcı öğe yok (tablo satırları). */
const RowChunk = memo(
  function RowChunk({ from, to, lines, tokens, reveal, found, active }: RowChunkProps) {
    const rows = [];
    for (let i = from; i < to; i++) {
      rows.push(
        <ViewerRow
          key={i}
          no={i + 1}
          line={lines[i]}
          tokens={tokens?.[i]}
          hit={reveal && reveal.line === i + 1 ? reveal : null}
          found={found?.[i]}
          active={active && active.line === i ? active : null}
        />,
      );
    }
    return <>{rows}</>;
  },
  (a, b) =>
    a.from === b.from &&
    a.to === b.to &&
    hitIn(a) === hitIn(b) &&
    activeIn(a) === activeIn(b) &&
    sameFound(a, b) &&
    sameLines(a.from, a.to, a.lines, b.lines) &&
    (a.tokens === b.tokens || (!!a.tokens && !!b.tokens && sameLines(a.from, a.to, a.tokens, b.tokens))),
);

export function FileViewer({
  path,
  root = null,
  reveal = null,
  onPreview,
}: {
  path: string;
  /** Ağacın kökü: başlıktaki klasör ona göre yazılıyor. */
  root?: string | null;
  /** Gidilecek satır ve işaretlenecek eşleşme (içerik aramasından). */
  reveal?: ViewerReveal | null;
  /** SVG'nin kaynağına bakılıyor: görsel önizlemesine dönüş (bkz. `ImageViewer`). */
  onPreview?: () => void;
}) {
  const t = useT();
  const [file, setFile] = useState<FileText | null | "err">(null);
  const [editMode, setEditMode] = useState(false);
  const [edit, setEdit] = useState<Edit | null>(null);
  const [issue, setIssue] = useState<Issue | null>(null);
  const [selection, setSelection] = useState<EditorBinding["selection"]>(null);
  const editRef = useRef<Edit | null>(null);
  const issueRef = useRef<Issue | null>(null);
  const history = useRef(new EditHistory());
  const selectionSeq = useRef(0);
  const editorHandle = useRef<EditorHandle>(null);
  const body = useRef<HTMLDivElement>(null);
  /** Düzenleme açılınca odaklanılacak: yazı alanı bir sonraki çizimde kuruluyor. */
  const focusPending = useRef(false);

  const putEdit = useCallback((next: Edit | null) => {
    editRef.current = next;
    setEdit(next);
  }, []);
  const putIssue = useCallback((next: Issue | null) => {
    issueRef.current = next;
    setIssue(next);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await api.readTextFile(path);
      setFile(res ?? "err");
      return res;
    } catch {
      setFile("err");
      return null;
    }
  }, [path]);

  useEffect(() => {
    let cancelled = false;
    setFile(null);
    setEditMode(false);
    putEdit(null);
    putIssue(null);
    history.current = new EditHistory();
    void api
      .readTextFile(path)
      .then((res) => !cancelled && setFile(res ?? "err"))
      .catch(() => !cancelled && setFile("err"));
    return () => {
      cancelled = true;
      // Başka dosyaya geçiliyor ya da ağaca dönülüyor: yazılmamış olan kaybolmasın.
      const ed = editRef.current;
      if (ed && ed.raw !== ed.base && !issueRef.current) {
        void api
          .writeTextFile(path, ed.base, ed.raw)
          .then(() => gitChanged(root))
          .catch((err) => useStore.getState().toast(String(err), "err"));
      }
    };
  }, [path, putEdit, putIssue]);

  const loaded = file && file !== "err" ? file : null;
  const eol = useMemo(
    () => (loaded && !loaded.binary && !loaded.truncated ? editableEol(loaded.text) : null),
    [loaded],
  );
  const editable = eol !== null;
  const raw = edit?.raw ?? loaded?.text ?? "";
  const display = useMemo(() => (eol ? toDisplay(raw, eol) : raw), [raw, eol]);
  const indent = useMemo(() => (loaded && !loaded.binary ? indentUnit(toDisplay(loaded.text, "\r\n")) : "    "), [loaded]);
  const editing = editMode && editable;
  const dirty = !!edit && edit.raw !== edit.base;

  /** Yeni metin (dosyanın kendi biçiminde): geçmişe giriyor; kayıt açık. */
  const rewrite = (next: string, typing: boolean) => {
    if (!loaded) return;
    const ed = editRef.current;
    const prev = ed ? ed.raw : loaded.text;
    const step = textEdit(prev, next);
    if (!step) return;
    history.current.push(step, typing);
    putEdit({ raw: next, base: ed ? ed.base : loaded.text });
  };

  const undoRedo = (which: "undo" | "redo") => {
    if (!loaded) return;
    const ed = editRef.current;
    const step = which === "undo" ? history.current.undo() : history.current.redo();
    if (!step) return;
    const next = applyEdit(ed ? ed.raw : loaded.text, step.edit);
    putEdit({ raw: next, base: ed ? ed.base : loaded.text });
    const offset = eol ? displayOffset(next, step.caret, eol) : step.caret;
    setSelection({ start: offset, end: offset, seq: ++selectionSeq.current });
  };

  const save = async () => {
    const ed = editRef.current;
    if (!ed || ed.raw === ed.base || issueRef.current) return;
    try {
      await api.writeTextFile(path, ed.base, ed.raw);
    } catch (err) {
      const text = String(err);
      if (text.includes("changed")) putIssue("conflict");
      else if (text.includes("not-text")) putIssue("notText");
      else useStore.getState().toast(text, "err");
      return;
    }
    const latest = editRef.current;
    if (latest) putEdit({ ...latest, base: ed.raw });
    setFile((prev) => (prev && prev !== "err" ? { ...prev, text: ed.raw, size: byteLength(ed.raw) } : prev));
    gitChanged(root);
  };

  /** Kalem: düzenlemeyi açıp kapatıyor; kapatırken yazılmamış olan kaydediliyor. */
  const toggleEdit = () => {
    if (!editable) return;
    if (editMode) {
      setEditMode(false);
      void save();
      return;
    }
    setEditMode(true);
    focusPending.current = true;
  };

  // Düzenleme açılınca imleç görünen ilk satıra: okurken bakılan yer yerinde kalsın.
  useEffect(() => {
    if (!focusPending.current || !editorHandle.current) return;
    focusPending.current = false;
    const area = body.current?.querySelector<HTMLTextAreaElement>(".viewer-editor");
    const lh = area ? parseFloat(getComputedStyle(area).lineHeight) : NaN;
    const top = body.current?.scrollTop ?? 0;
    editorHandle.current.focusLine(Number.isFinite(lh) && lh > 0 ? Math.ceil(top / lh) : 0);
  });

  /** Çakışmada: buradaki değişiklikleri bırak, diskteki gelsin. */
  const loadDisk = async () => {
    putIssue(null);
    putEdit(null);
    history.current = new EditHistory();
    await load();
  };

  /** Çakışmada: diskteki hâlin üzerine buradakini yaz. */
  const keepMine = async () => {
    const fresh = await api.readTextFile(path).catch(() => null);
    const ed = editRef.current;
    if (!fresh || fresh.binary || fresh.truncated || !ed) return;
    putEdit({ ...ed, base: fresh.text });
    putIssue(null);
    await save();
  };

  const mod = isMac() ? "Cmd" : "Ctrl";
  const tip = (label: string, combo: string) => `${label} (${prettyCombo(combo)})`;

  const binding: EditorBinding | null =
    editing && eol
      ? {
          text: display,
          selection,
          indent,
          onInput: (text, typing) => rewrite(toFile(text, eol), typing),
          onCaretLine: () => {},
          onUndo: () => undoRedo("undo"),
          onRedo: () => undoRedo("redo"),
          onSave: () => void save(),
          handle: editorHandle,
          label: baseName(path) || path,
        }
      : null;

  const lines = useMemo(() => (loaded && !loaded.binary ? display.split("\n") : []), [loaded, display]);
  /*
   * Renklendiriciye giden satırlar. Düzenlenemeyen dosyada (kesilmiş ya da
   * satır sonları karışık) `\r` satırın içinde kalıyor; gramer onu metnin
   * parçası sanmasın.
   */
  const codeLines = useMemo(
    () => (!loaded || loaded.binary ? null : eol ? lines : lines.map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l))),
    [loaded, eol, lines],
  );
  const syntax = useSyntax(path, codeLines);
  const numbers = useMemo(
    () => Array.from({ length: Math.max(1, lines.length) }, (_, i) => i + 1).join("\n"),
    [lines.length],
  );
  const columns = useMemo(() => {
    let max = 0;
    for (const line of lines) if (line.length > max) max = line.length;
    return Math.ceil((max + 1) / WIDTH_STEP) * WIDTH_STEP;
  }, [lines]);

  /*
   * Aramadan gelen satıra git — dosya yüklenince ve her yeni gidişte (`seq`).
   *
   * Çizimden HEMEN sonra (`useLayoutEffect`): dosya önce tepeden görünüp sonra
   * zıplamasın. Okurken satır ortalanıyor ve eşleşme `<mark>` ile işaretli;
   * düzenlerken eşleşme yazı alanında SEÇİLİYOR — işaret katmanı orada yok,
   * seçim hem görünüyor hem üzerine yazılabiliyor.
   */
  const revealSeq = reveal?.seq ?? null;
  const revealed = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (!reveal || !loaded || loaded.binary || revealed.current === reveal.seq) return;
    const scroller = body.current;
    if (!scroller) return;
    revealed.current = reveal.seq;

    if (editing && eol) {
      const start = Math.min(display.length, offsetOfLine(display, reveal.line - 1) + reveal.col);
      setSelection({ start, end: Math.min(display.length, start + reveal.len), seq: ++selectionSeq.current });
      const area = scroller.querySelector<HTMLTextAreaElement>(".viewer-editor");
      area?.focus({ preventScroll: true });
      const lh = area ? parseFloat(getComputedStyle(area).lineHeight) : NaN;
      if (Number.isFinite(lh) && lh > 0) {
        scroller.scrollTop = Math.max(0, (reveal.line - 1) * lh - scroller.clientHeight / 2);
      }
      return;
    }
    const row = scroller.querySelector(".viewer-code")?.children[reveal.line - 1];
    if (row instanceof HTMLElement) bringIntoView(scroller, row, row.querySelector(".viewer-mark"));
    // `reveal` nesnesinin kendisi değil sırası: aynı gidiş ikinci kez koşmasın.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealSeq, loaded]);

  /*
   * Dosyada arama (bkz. dosya başı ve `FileFind`).
   *
   * Arama ekranda GÖRÜNEN metinde: düzenlerken yazılmakta olan metin de
   * aranıyor, kaydedilmesi beklenmiyor. Kesilmiş dosyada yalnızca gösterilen
   * ilk yarım megabayt.
   */
  const flags = useStore((s) => s.ui.searchFlags);
  const findBinding = useStore((s) => s.settings.keybindings.findInTerminal);
  const [findOpen, setFindOpen] = useState(false);
  const [query, setQuery] = useState(rememberedQuery);
  /**
   * Etkin eşleşmenin ARANDIĞI yer: bu konumda ya da sonrasında başlayan ilk
   * eşleşme etkin. Eşleşmenin kendisi saklanmıyor — sorgu ya da metin değişince
   * eşleşmeler yeniden hesaplanıyor, konum yerinde kalıyor ve yazdıkça daralan
   * arama dosyanın başına sıçramıyor.
   */
  const [anchor, setAnchor] = useState({ line: 0, col: 0 });
  /** Her açılışta artıyor: kutuya odaklan, etkin eşleşmeyi göster. */
  const [findSeq, setFindSeq] = useState(0);
  /**
   * Her gezinmede artıyor: tek eşleşmede Enter aynı yeri gösteriyor ama
   * kullanıcı o arada kaydırdıysa ya da düzenlerken imleci taşıdıysa eşleşme
   * yeniden gösterilip seçilmeli.
   */
  const [stepSeq, setStepSeq] = useState(0);
  const findInput = useRef<HTMLInputElement>(null);
  /** Arama açılmadan önce odağın olduğu yer: kapanınca oraya dönülüyor. */
  const findReturn = useRef<HTMLElement | null>(null);

  // Ertelenmiş sorgu: büyük dosyada her harfte bütün metni taramak yazmayı
  // yavaşlatmasın; kutu hemen güncelleniyor, işaretler bir sonraki çizimde.
  const findText = useDeferredValue(findOpen ? query : "");
  const found: FindResult | null = useMemo(
    () => (findText && codeLines ? findInLines(codeLines, findText, flags) : null),
    [findText, codeLines, flags],
  );
  const activeIndex = found ? matchAtOrAfter(found.matches, anchor.line, anchor.col) : -1;
  const active = found && activeIndex >= 0 ? found.matches[activeIndex] : null;
  const foundLines = useMemo<FoundLines | null>(() => {
    if (!found || found.matches.length === 0) return null;
    const per: FindMatch[][] = [];
    for (const m of found.matches) (per[m.line] ??= []).push(m);
    return per;
  }, [found]);

  /** Seçili metin ve başladığı yer (satır 0'dan); seçim yoksa null. */
  const selectionSeed = (): { text: string; line: number; col: number } | null => {
    const scroller = body.current;
    if (!scroller) return null;
    const area = scroller.querySelector<HTMLTextAreaElement>(".viewer-editor");
    if (area) {
      const { selectionStart: start, selectionEnd: end, value } = area;
      if (end <= start) return null;
      const line = lineAt(value, start);
      return { text: value.slice(start, end), line, col: start - offsetOfLine(value, line) };
    }
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    const rowOf = (node: Node) => (node instanceof Element ? node : node.parentElement)?.closest(".viewer-line");
    const node = range.startContainer;
    const row = rowOf(node);
    const code = scroller.querySelector(".viewer-code");
    const cell = row?.querySelector(".viewer-text");
    if (!row || !code || !cell || row.parentElement !== code) return null;
    // Birden çok satıra yayılan seçim aranacak bir şey değil (IDE'ler de
    // almıyor). Satırlar arası metnin `toString`teki biçimi motora göre
    // değişiyor; satıra DOM'dan bakılıyor.
    if (rowOf(range.endContainer) !== row) return null;
    const before = document.createRange();
    before.setStart(cell, 0);
    before.setEnd(node, range.startOffset);
    return {
      text: range.toString(),
      line: Array.prototype.indexOf.call(code.children, row),
      col: before.toString().length,
    };
  };

  /** Bakılan yer: düzenlerken imleç, okurken ekranın en üstündeki satır. */
  const viewAnchor = (): { line: number; col: number } => {
    const scroller = body.current;
    const area = scroller?.querySelector<HTMLTextAreaElement>(".viewer-editor");
    if (area) {
      const line = lineAt(area.value, area.selectionStart);
      return { line, col: area.selectionStart - offsetOfLine(area.value, line) };
    }
    const first = scroller?.querySelector(".viewer-code")?.firstElementChild;
    const height = first instanceof HTMLElement ? first.getBoundingClientRect().height : 0;
    return { line: scroller && height > 0 ? Math.floor(scroller.scrollTop / height) : 0, col: 0 };
  };

  /**
   * Aramayı açar; açıksa kutuya döner ve kutudakini seçer.
   *
   * Seçili bir metin varsa (tek satır) kutuya o geliyor ve etkin eşleşme
   * seçilen yer oluyor — IDE'lerdeki gibi. Seçim yoksa kutuda son aranan duruyor;
   * arama bakılan yerden başlıyor.
   */
  const openFind = () => {
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && !focused.closest(".viewer-find")) findReturn.current = focused;
    const seed = selectionSeed();
    if (seed && seed.text && !seed.text.includes("\n") && seed.text.length <= 200) {
      // Düzenli ifade kipinde seçim harfi harfine aranmalı (`a.b`).
      const text = flags.regex ? escapeText(seed.text) : seed.text;
      setQuery(text);
      rememberedQuery = text;
      setAnchor({ line: seed.line, col: seed.col });
    } else if (!findOpen) {
      setAnchor(viewAnchor());
    }
    setFindOpen(true);
    setFindSeq((n) => n + 1);
  };
  const openFindRef = useRef(openFind);
  openFindRef.current = openFind;

  // Genel kısayol dinleyicisi (`App.tsx`) aramayı buradan açıyor.
  useEffect(() => provideViewerFind(() => openFindRef.current()), []);

  // Her açılışta kutuya: yazmaya hemen başlanabilsin, kutudaki seçili olsun.
  useEffect(() => {
    if (findSeq === 0) return;
    findInput.current?.focus();
    findInput.current?.select();
  }, [findSeq]);

  /** Kapatır; odak düzenlerken yazı alanına (etkin eşleşme seçili), değilse geldiği yere. */
  const closeFind = () => {
    setFindOpen(false);
    const area = body.current?.querySelector<HTMLTextAreaElement>(".viewer-editor");
    const back = area ?? findReturn.current;
    findReturn.current = null;
    if (back?.isConnected) back.focus({ preventScroll: true });
  };

  const changeQuery = (next: string) => {
    setQuery(next);
    rememberedQuery = next;
  };

  const stepFind = (direction: 1 | -1) => {
    if (!found || found.matches.length === 0) return;
    const n = found.matches.length;
    const next = found.matches[(activeIndex + direction + n) % n];
    setAnchor({ line: next.line, col: next.start });
    setStepSeq((k) => k + 1);
  };

  /*
   * Etkin eşleşmeyi göster — yalnızca ARAMA değiştiğinde (açılış, sorgu,
   * seçenekler, gezinme). Düzenlerken yazılan harf eşleşmeleri yeniden
   * hesaplatıyor ama ekranı imlecin olduğu yerden alıp götürmemeli; anahtar o
   * yüzden metni içermiyor.
   *
   * Düzenlerken etkin eşleşme yazı alanında SEÇİLİYOR: Esc'den sonra imleç
   * orada, üzerine yazılabiliyor.
   */
  const revealKey =
    findOpen && active
      ? `${findSeq}.${stepSeq}|${findText}|${+flags.caseSensitive}${+flags.wholeWord}${+flags.regex}|${anchor.line}:${anchor.col}`
      : null;
  const revealedKey = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!revealKey || revealKey === revealedKey.current || !active) return;
    revealedKey.current = revealKey;
    if (editing && eol) {
      const start = offsetOfLine(display, active.line) + active.start;
      setSelection({ start, end: start + (active.end - active.start), seq: ++selectionSeq.current });
    }
    const scroller = body.current;
    const mark = scroller?.querySelector<HTMLElement>(".viewer-find-hit.on");
    if (scroller && mark) revealMatch(scroller, mark);
    // Anahtar bütün girdileri taşıyor; `active` ve düzenleme durumu onunla birlikte değişiyor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealKey]);

  const folder = folderLabel(path, root);
  /** Satır, gösterilen ilk 512 KB'ın dışında kaldı: söyleniyor, sessizce tepede kalınmıyor. */
  const outside = !!reveal && !!loaded && !loaded.binary && loaded.truncated && reveal.line > lines.length;

  return (
    <div
      className="viewer"
      onKeyDown={(e) => {
        // Yazı alanındayken genel dinleyici kısayolu bırakıyor (metin kutusu);
        // Windows'ta Ctrl+F de burada (bkz. `isFindKey`).
        if (e.defaultPrevented || !isFindKey(e.nativeEvent, findBinding, isMac())) return;
        e.preventDefault();
        e.stopPropagation();
        openFind();
      }}
    >
      <div className={editing ? "viewer-head editing" : "viewer-head"}>
        <span className="viewer-name" title={path}>
          {baseName(path) || path}
        </span>
        {folder && (
          <span className="viewer-dir" title={path}>
            {folder}
          </span>
        )}
        {dirty && (
          <span className="viewer-dirty" title={t("viewer.unsaved")} aria-label={t("viewer.unsaved")}>
            ●
          </span>
        )}
        <span className="viewer-spacer" />
        {loaded && <span className="viewer-size">{formatBytes(loaded.size)}</span>}
        {loaded && (
          <span className="viewer-tools">
            <button
              type="button"
              data-tool="edit"
              className={editing ? "viewer-tool on" : "viewer-tool"}
              aria-pressed={editing}
              disabled={!editable}
              title={editable ? t(editing ? "diff.stopEditing" : "edit.edit") : t("viewer.cannotEdit")}
              onClick={toggleEdit}
            >
              <PencilIcon size={13} />
            </button>
            <button
              type="button"
              data-tool="undo"
              className="viewer-tool"
              disabled={!history.current.canUndo}
              title={tip(t("edit.undo"), `${mod}+Z`)}
              onClick={() => undoRedo("undo")}
            >
              <UndoIcon size={13} />
            </button>
            <button
              type="button"
              data-tool="redo"
              className="viewer-tool"
              disabled={!history.current.canRedo}
              title={tip(t("edit.redo"), isMac() ? "Cmd+Shift+Z" : "Ctrl+Y")}
              onClick={() => undoRedo("redo")}
            >
              <RedoIcon size={13} />
            </button>
            <button
              type="button"
              data-tool="save"
              className="viewer-tool"
              disabled={!dirty || !!issue}
              title={tip(t("edit.save"), `${mod}+S`)}
              onClick={() => void save()}
            >
              <SaveIcon size={13} />
            </button>
          </span>
        )}
        {onPreview && (
          <button
            type="button"
            data-tool="preview"
            className="viewer-tool"
            title={t("viewer.showPreview")}
            aria-label={t("viewer.showPreview")}
            onClick={onPreview}
          >
            <ImageIcon size={13} />
          </button>
        )}
        {/* Yalnızca DOSYAYI kapatıyor; ağaç yerinde kalıyor. Kaydedilmemiş olan
            sökülürken yazılıyor (yukarıdaki temizlik). */}
        <button
          type="button"
          className="viewer-tool viewer-close"
          title={t("viewer.close")}
          aria-label={t("viewer.close")}
          onClick={() => useStore.getState().setUi({ viewerPath: null, viewerReveal: null })}
        >
          <CloseIcon size={12} />
        </button>
      </div>

      {issue && (
        <div className="viewer-issue" role="alert">
          <span>{issue === "conflict" ? t("diff.conflict") : t("diff.notText")}</span>
          <button type="button" className="viewer-link" onClick={() => void loadDisk()}>
            {t("diff.loadDisk")}
          </button>
          {issue === "conflict" && (
            <button type="button" className="viewer-link" onClick={() => void keepMine()}>
              {t("diff.keepMine")}
            </button>
          )}
        </div>
      )}

      {findOpen && (
        <FileFind
          query={query}
          onQuery={changeQuery}
          count={findCount(found, activeIndex)}
          none={!!found && !found.error && found.matches.length === 0}
          error={found?.error ?? null}
          inputRef={findInput}
          onStep={stepFind}
          onClose={closeFind}
        />
      )}

      <div className="viewer-body" ref={body}>
        {file === null && <div className="pop-empty">{t("common.loading")}</div>}
        {file === "err" && <div className="pop-empty">{t("viewer.failed")}</div>}
        {loaded?.binary && <div className="pop-empty">{t("viewer.binary")}</div>}

        {binding ? (
          <div className="viewer-edit">
            {/* Numaralar tek bir `pre`: yazı alanıyla aynı satır yüksekliğinde
                aynı biçimde diziliyor; ayrı satır kutuları kesirli yükseklikte
                binlerce satır sonra kayardı. */}
            <pre className="viewer-gutter" aria-hidden="true">
              {numbers}
            </pre>
            <div className="viewer-edit-area" style={{ minWidth: `calc(${columns}ch + 20px)` }}>
              {/* Renkli katman yazı alanının ALTINDA; yazı alanının harfleri
                  saydam (`.colored`), görünen metin bu katman. */}
              {/* Arama işaretleri en altta: renkli harfler de yazı alanı da üstünde. */}
              {foundLines && <FindLayer lines={lines} found={foundLines} active={active} />}
              {syntax && <CodeLayer lines={lines} tokens={syntax.tokens} keys={syntax.keys} />}
              <EditorLayer
                {...binding}
                className={syntax ? "viewer-editor colored" : "viewer-editor"}
                scroller=".viewer-body"
                lines={lines.length}
              />
            </div>
          </div>
        ) : (
          lines.length > 0 && (
            <div className="viewer-code">
              {Array.from({ length: Math.ceil(lines.length / CHUNK) }, (_, k) => (
                <RowChunk
                  key={k}
                  from={k * CHUNK}
                  to={Math.min((k + 1) * CHUNK, lines.length)}
                  lines={lines}
                  tokens={syntax?.tokens ?? null}
                  // Arama eşleşmeleri varken içerik aramasından gelinen işaret
                  // çizilmiyor: iki ayrı sarı işaret hangisinin etkin olduğunu
                  // karıştırırdı.
                  reveal={foundLines ? null : reveal}
                  found={foundLines}
                  active={active}
                />
              ))}
            </div>
          )
        )}

        {outside && reveal && (
          <div className="viewer-cut">{t("viewer.revealOutside", { line: reveal.line })}</div>
        )}
        {loaded?.truncated && <div className="viewer-cut">{t("viewer.truncated")}</div>}
      </div>
    </div>
  );
}
