import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  buildRows,
  lineOffsets,
  lineSegments,
  lineToRow,
  rowToLine,
  sideFolds,
  unifiedRows,
  type RowModel,
  type Segment,
  type UnifiedRow,
} from "../lib/diffView";
import { transferLine, type Fold, type LineChange, type TextDiff } from "../lib/textDiff";
import { EditorLayer, type EditorBinding } from "./DiffEditor";

/*
 * Fark penceresinin editörleri.
 *
 * IntelliJ'in yan yana görünümünün düzeni (2026.2, yeni arayüz), ekran
 * görüntüsünden piksel piksel ölçüldü:
 *
 *   [şerit][sol metin][» | numara]  ~eğri bağlayıcılar~  [numara][sağ metin][şerit]
 *
 * - Sol editörün oluğu (satır numaraları) SAĞINDA, ortadaki ayırıcıya bitişik;
 *   kaydırma şeridi en solda. İki tarafın numaraları yan yana durunca hangi
 *   satırın hangisine karşılık geldiği ortadan okunuyor — oluk solda olsaydı
 *   sol numaralar pencerenin kenarında, bağlayıcıdan bir metin genişliği uzakta
 *   kalırdı.
 * - Değişen satırın zemini olukta da var (tam renk); metin alanında sözcük
 *   farkı varsa satır YUMUŞAK renkte, değişen sözcükler tam renkte.
 * - Bir tarafta satırı olmayan blok (ekleme/silme) o tarafta iki piksellik bir
 *   çizgi: bloğun düştüğü iki satırın arası.
 * - `»` sol olukta, bloğun ilk satırında: yerel değişiklikte "bu bloğu HEAD'e
 *   geri al". Sağ taraf düzenlenebilir (çalışma ağacı), sol değil (HEAD).
 *
 * Satırlar SANAL: yalnızca görünen aralık (ve biraz payı) çiziliyor. On bin
 * satırlık bir dosyayı iki kez DOM'a dökmek hem açılışı hem kaydırmayı
 * yavaşlatırdı; satır yüksekliği sabit olduğu için konum hesaplamak bedava.
 */

/** Görünen aralığın üstüne/altına çizilen fazladan satır. */
const OVERSCAN = 12;

export interface Caret {
  side: 1 | 2;
  line: number;
}

export interface PanesHandle {
  /** Satırı görünen alanın ortasına getirir — IntelliJ'de F7 de böyle kaydırıyor. */
  scrollToLine(side: 1 | 2, line: number): void;
}

export interface PaneLabels {
  /** `»` düğmesinin ipucu (IntelliJ: "Revert" + kısayol). */
  apply: string;
  /** Ctrl basılıyken değiştirilmiş blokta `»`: "Append". */
  append: string;
  /**
   * Katlanmış aralığın ipucu ("43 değişmemiş satır"). Ekranda YAZI yok —
   * IntelliJ'de katlama yalnızca dalgalı bir çizgi — ama ekran okuyucu ve
   * fareyle üstüne gelen ne kadarın gizlendiğini öğrenebilmeli.
   */
  fold: (n: number) => string;
}

/** `»` düğmesi: geri al ya da (Ctrl ile) arkasına ekle. */
interface Arrow {
  append: boolean;
  run: () => void;
}

// ------------------------------------------------------------- satır görünüşü

/** Değişiklik türünün CSS sınıfı. */
function kindClass(change: LineChange): string {
  return change.kind === "inserted" ? "ins" : change.kind === "deleted" ? "del" : "mod";
}

/** Sözcük farkı varsa metin alanı yumuşak renkte (parçalar tam renkte). */
function isSoft(change: LineChange): boolean {
  return change.inner !== null && change.inner.length > 0;
}

function renderSegments(segments: readonly Segment[]): ReactNode {
  return segments.map((s, i) => {
    if (s.empty) return <span key={i} className={`dw-frag ${shortKind(s.kind)} empty`} />;
    if (s.kind) {
      return (
        <span key={i} className={`dw-frag ${shortKind(s.kind)}`}>
          {s.text}
        </span>
      );
    }
    return s.text;
  });
}

function shortKind(kind: Segment["kind"]): string {
  return kind === "inserted" ? "ins" : kind === "deleted" ? "del" : "mod";
}

/** Satırın görsel sütun sayısı: sekme 4'ün katına. */
function visualColumns(text: string): number {
  let col = 0;
  for (let i = 0; i < text.length; i++) col = text.charCodeAt(i) === 9 ? col + 4 - (col % 4) : col + 1;
  return col;
}

function maxColumns(lines: readonly string[]): number {
  let max = 0;
  for (const line of lines) {
    if (line.length > max) max = Math.max(max, visualColumns(line));
  }
  return max;
}

/**
 * Metin alanının genişliği (CSS). Sağ taraf yazılabilirken genişlik KABA
 * adımlarla büyüyor: en uzun satıra yazarken her tuşta değişseydi tarayıcı
 * bütün yazı alanını yeniden dizerdi. ÖLÇÜLDÜ: 20 bin satırda tuş başına
 * ~60 ms fazladan. Adım 40 sütun; boş kalan kısım yatay kaydırmada pay.
 */
const EDIT_WIDTH_STEP = 40;

function textWidth(columns: number, editable: boolean): string {
  const cols = editable ? Math.ceil((columns + 1) / EDIT_WIDTH_STEP) * EDIT_WIDTH_STEP : columns;
  return `calc(${cols}ch + 32px)`;
}

/** Bir satırın her şeyi: zemin, numaralar, içerik ve (sol olukta) `»`. */
interface RowView {
  key: string;
  /** Metin alanının sınıfı (`ins`, `mod soft`, `fold`…). */
  cls: string;
  /** Oluğun sınıfı — değişen satırda tam renk. */
  gutterCls: string;
  numbers: string[];
  content: ReactNode;
  caret: boolean;
  /** Katlama satırı: katlamanın sırası ve gizlediği satır sayısı. */
  fold?: number;
  foldCount?: number;
  arrow?: Arrow;
}

/** Bir taraftaki ince çizgi: satırı olmayan bloğun düştüğü yer (sıra sınırı). */
interface GapMark {
  key: string;
  row: number;
  cls: string;
}

/** Kaydırma şeridindeki işaret: sıra aralığı ve renk. */
interface StripeMark {
  from: number;
  to: number;
  cls: string;
}

// ------------------------------------------------------------------ bölme

interface PaneProps {
  /** Sol editör: şerit solda, oluk sağda (IntelliJ'in aynalanmış oluğu). */
  mirror: boolean;
  rowCount: number;
  lineHeight: number;
  /** Metin alanının içerik genişliği (CSS). */
  textWidth: string;
  /** Oluğun numara sütunu sayısı ve genişliği. */
  numberColumns: number;
  numberWidth: string;
  /** Olukta `»` sütunu var mı. */
  arrows: boolean;
  top: number;
  height: number;
  row: (index: number) => RowView;
  gaps: readonly GapMark[];
  stripe: readonly StripeMark[];
  bind: (el: HTMLDivElement | null) => void;
  onScroll: () => void;
  onLineDown: (row: number) => void;
  onFold: (fold: number) => void;
  labels: PaneLabels;
  /**
   * Metnin üstündeki yazı alanı (sağ taraf düzenlenebilirken). Satırlar o
   * zaman yalnızca zemini ve fark parçalarını çiziyor; harfler yazı alanının.
   */
  editor?: ReactNode;
}

function Pane(props: PaneProps) {
  const {
    mirror,
    rowCount,
    lineHeight: lh,
    top,
    height,
    row,
    gaps,
    stripe,
    bind,
    onScroll,
    onLineDown,
    onFold,
    labels,
  } = props;
  const scroller = useRef<HTMLDivElement | null>(null);
  const first = Math.max(0, Math.floor(top / lh) - OVERSCAN);
  const last = Math.min(rowCount, Math.ceil((top + height) / lh) + OVERSCAN);

  const views: RowView[] = [];
  for (let i = first; i < last; i++) views.push(row(i));

  /*
   * Sondaki sanal boşluk: son satır görünen alanın tepesine kadar
   * kaydırılabiliyor. IntelliJ'de de öyle ("virtual space") ve eş zamanlı
   * kaydırma buna muhtaç — kısa taraf, uzun tarafın son bloğuyla hizalanacak
   * kadar aşağı inebilmeli.
   */
  const canvasHeight = rowCount * lh + Math.max(0, height - lh);

  const setRef = (el: HTMLDivElement | null) => {
    scroller.current = el;
    bind(el);
  };

  // Oluk ve şerit kendi başına kaymıyor; teker oradan da metni kaydırsın.
  const forwardWheel = (event: React.WheelEvent) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTop += event.deltaY;
    el.scrollLeft += event.deltaX;
  };

  const gutter = (
    <div
      className="dw-gutter"
      style={{ ["--dw-num-w" as string]: props.numberWidth, ["--dw-num-cols" as string]: props.numberColumns }}
      onWheel={forwardWheel}
    >
      <div className="dw-gutter-inner" style={{ transform: `translateY(${-top}px)` }}>
        {views.map((v, k) => {
          /*
           * Hücre sırası ORTADAN DIŞA doğru aynı: [simge][numara][katlama alanı]
           * metne bakan yandan başlıyor. Sol editörde oluk aynalı (IntelliJ
           * `isMirrored()`): `»` metnin hemen yanında, numaralar ondan sonra,
           * ayırıcıya bitişik boşluk en sonda. Sağ editörde tersi.
           */
          const icon = (
            <span key="i" className="dw-arrow-cell">
              {props.arrows && v.arrow && (
                <button
                  type="button"
                  className="dw-arrow"
                  title={v.arrow.append ? labels.append : labels.apply}
                  onClick={v.arrow.run}
                >
                  {v.arrow.append ? <AppendArrow /> : <ApplyArrow />}
                </button>
              )}
            </span>
          );
          const numbers = v.numbers.map((n, c) => (
            <span key={`n${c}`} className="dw-num">
              {n}
            </span>
          ));
          const edge = <span key="e" className="dw-fold-cell" />;
          return (
            <div
              key={v.key}
              className={`dw-gutter-row ${v.gutterCls}${v.caret ? " caret" : ""}`}
              style={{ top: (first + k) * lh }}
              onMouseDown={
                v.fold !== undefined
                  ? (event) => {
                      event.preventDefault();
                      onFold(v.fold!);
                    }
                  : undefined
              }
            >
              {mirror ? [icon, ...numbers, edge] : [edge, ...numbers, icon]}
            </div>
          );
        })}
        {gaps.map((g) => (
          <div key={g.key} className={`dw-gap ${g.cls}`} style={{ top: g.row * lh - 1 }} />
        ))}
      </div>
    </div>
  );

  const text = (
    <div className="dw-scroll" ref={setRef} onScroll={onScroll}>
      <div className="dw-canvas" style={{ height: canvasHeight, width: props.textWidth }}>
        {views.map((v, k) => (
          <div
            key={v.key}
            className={`dw-line ${v.cls}${v.caret ? " caret" : ""}`}
            style={{ top: (first + k) * lh }}
            title={v.foldCount !== undefined ? labels.fold(v.foldCount) : undefined}
            onMouseDown={(event) => {
              if (event.button !== 0) return;
              if (v.fold !== undefined) {
                event.preventDefault();
                onFold(v.fold);
              } else onLineDown(first + k);
            }}
          >
            {v.fold !== undefined ? null : v.content}
          </div>
        ))}
        {gaps.map((g) => (
          <div key={g.key} className={`dw-gap ${g.cls}`} style={{ top: g.row * lh - 1 }} />
        ))}
        {props.editor}
      </div>
    </div>
  );

  const bar = (
    <Stripe
      scroller={scroller}
      contentHeight={canvasHeight}
      rowsHeight={rowCount * lh}
      top={top}
      height={height}
      lineHeight={lh}
      marks={stripe}
      onWheel={forwardWheel}
    />
  );

  return (
    <div className={`dw-pane${mirror ? " mirror" : ""}${props.editor ? " editable" : ""}`}>
      {mirror ? bar : gutter}
      {text}
      {mirror ? gutter : bar}
    </div>
  );
}

/** IntelliJ'in `»` simgesi (Diff.Arrow): iki ince ok ucu. */
function ApplyArrow() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
      <path d="M2 2.5 L5.5 6 L2 9.5 M6 2.5 L9.5 6 L6 9.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Ctrl basılıyken: `»` aşağı kıvrılıyor (Diff.ArrowRightDown) — "arkasına ekle". */
function AppendArrow() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
      <path d="M2 2 L5 5 L2 8 M5.5 2 L8.5 5 L5.5 8 M2 10.5 H10" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ---------------------------------------------------------- kaydırma şeridi

/**
 * Kaydırma çubuğu ve üstündeki değişiklik işaretleri.
 *
 * Tarayıcının çubuğu değil: IntelliJ'de değişikliklerin dosyanın neresinde
 * olduğu çubuğun üstünde renkli işaretlerle görünüyor ve göz önce oraya
 * bakıyor. Yerleşik çubuğa işaret konamıyor; ayrıca sol editörün çubuğu
 * IntelliJ'de pencerenin SOL kenarında.
 */
function Stripe(props: {
  scroller: React.RefObject<HTMLDivElement | null>;
  contentHeight: number;
  rowsHeight: number;
  top: number;
  height: number;
  lineHeight: number;
  marks: readonly StripeMark[];
  onWheel: (event: React.WheelEvent) => void;
}) {
  const { scroller, contentHeight, rowsHeight, top, height, lineHeight: lh, marks } = props;
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; top: number } | null>(null);
  const total = Math.max(contentHeight, 1);
  const thumbH = Math.max(24, (height / total) * height);
  const thumbTop = total > height ? (top / (total - height)) * (height - thumbH) : 0;
  const scale = height / Math.max(rowsHeight, height);

  const scrollTo = (value: number) => {
    const el = scroller.current;
    if (el) el.scrollTop = value;
  };

  return (
    <div
      className="dw-stripe"
      ref={track}
      onWheel={props.onWheel}
      onPointerDown={(event) => {
        if (event.button !== 0 || !track.current) return;
        const rect = track.current.getBoundingClientRect();
        const y = event.clientY - rect.top;
        if (y >= thumbTop && y <= thumbTop + thumbH) {
          drag.current = { y: event.clientY, top };
          track.current.setPointerCapture?.(event.pointerId);
        } else {
          // İşarete tıklamak oraya götürüyor: tıklanan nokta ortaya gelsin.
          scrollTo((y / scale) - height / 2);
        }
        event.preventDefault();
      }}
      onPointerMove={(event) => {
        const d = drag.current;
        if (!d || total <= height) return;
        const ratio = (total - height) / Math.max(1, height - thumbH);
        scrollTo(d.top + (event.clientY - d.y) * ratio);
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
    >
      {marks.map((m, i) => (
        <div
          key={i}
          className={`dw-mark ${m.cls}`}
          style={{ top: m.from * lh * scale, height: Math.max(2, (m.to - m.from) * lh * scale) }}
        />
      ))}
      {total > height && <div className="dw-thumb" style={{ top: thumbTop, height: thumbH }} />}
    </div>
  );
}

// ------------------------------------------------------------- ortak durum

/** Bölmelerin görünen alanı: yükseklik bölmenin kendisinden ölçülüyor. */
function useViewport(el: React.RefObject<HTMLDivElement | null>): number {
  const [height, setHeight] = useState(600);
  useLayoutEffect(() => {
    const measure = () => {
      const h = el.current?.clientHeight;
      if (h && h > 0) setHeight(h);
    };
    measure();
    window.addEventListener("resize", measure);
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    if (observer && el.current) observer.observe(el.current);
    return () => {
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [el]);
  return height;
}

/** Bir taraftaki satırın ekrandaki y'si (sıra × yükseklik). */
function rowY(model: RowModel, line: number, lh: number): number {
  if (line >= model.rowOfLine.length) return model.rows.length * lh;
  return model.rowOfLine[Math.max(0, line)] * lh;
}

/** Bir tarafın değişiklik eşlemesi: satır → blok sırası (yoksa -1). */
function changeIndexByLine(changes: readonly LineChange[], n: number, side: 1 | 2): Int32Array {
  const out = new Int32Array(n).fill(-1);
  changes.forEach((c, i) => {
    if (c.ignored) return;
    const [s, e] = side === 1 ? [c.start1, c.end1] : [c.start2, c.end2];
    for (let l = s; l < e; l++) out[l] = i;
  });
  return out;
}

// ------------------------------------------------------------- yan yana

interface SideBySideProps {
  diff: TextDiff;
  folds: readonly Fold[];
  lineHeight: number;
  /** "Do not highlight": değişiklikler hesaplanıyor ama boyanmıyor. */
  colorize: boolean;
  sync: boolean;
  caret: Caret;
  onCaret: (caret: Caret) => void;
  onFold: (fold: number) => void;
  /** `»` gösterilsin mi (sağ taraf yazılabilir ve tam okunmuşsa). */
  canApply: boolean;
  onApply: (change: number) => void;
  /** Ctrl basılı: değiştirilmiş blokta `»` "Append" oluyor. */
  appendMode: boolean;
  onAppend: (change: number) => void;
  labels: PaneLabels;
  /** Sağ taraf yazılabilir mi (verilmezse salt okunur). */
  editor?: EditorBinding | null;
}

/**
 * Ortadaki ayırıcının genişliği (px). IntelliJ'de kayıt defteri değeri
 * `diff.divider.width=24`; ekran görüntüsünden de 24 mantıksal piksel ölçüldü.
 */
const DIVIDER_W = 24;

/**
 * Eş zamanlı kaydırmanın ve "sonraki farka git"in çapası: görünen alanın
 * üstten ÜÇTE BİRİ (IntelliJ `SyncScrollSupport`: `viewRect.height / 3`).
 * Ortası değil: göz bir metni üst kısmından okumaya başlıyor ve gidilen blok
 * oraya geliyor; altında da bloğun devamına yer kalıyor.
 */
function anchorOf(height: number, lh: number): number {
  return Math.max(2 * lh, Math.round(height / 3));
}

export const SideBySide = forwardRef<PanesHandle, SideBySideProps>(function SideBySide(props, ref) {
  const { diff, folds, lineHeight: lh, colorize, sync, caret, onCaret, canApply, onApply, labels } = props;
  const { appendMode, onAppend } = props;
  const { lines1, lines2, changes } = diff;

  const folds1 = useMemo(() => sideFolds(folds, 1), [folds]);
  const folds2 = useMemo(() => sideFolds(folds, 2), [folds]);
  const model1 = useMemo(() => buildRows(lines1.length, folds1), [lines1.length, folds1]);
  const model2 = useMemo(() => buildRows(lines2.length, folds2), [lines2.length, folds2]);
  const byLine1 = useMemo(() => changeIndexByLine(changes, lines1.length, 1), [changes, lines1.length]);
  const byLine2 = useMemo(() => changeIndexByLine(changes, lines2.length, 2), [changes, lines2.length]);
  const editing = !!props.editor;
  const width = useMemo(
    () => textWidth(Math.max(maxColumns(lines1), maxColumns(lines2)), editing),
    [lines1, lines2, editing],
  );
  const digits = String(Math.max(lines1.length, lines2.length)).length;

  const el1 = useRef<HTMLDivElement | null>(null);
  const el2 = useRef<HTMLDivElement | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const height = useViewport(el2);
  const [scroll, setScroll] = useState({ top1: 0, top2: 0 });
  /** Programın kaydırdığı bölme ve hedef değer: o bölmenin olayı geri yansımasın. */
  const echo = useRef<{ 1: number | null; 2: number | null }>({ 1: null, 2: null });

  // Blok içi konumlar (iç parçalar bloğun metnine göre) — blok başına bir kez.
  const offsets = useRef(new Map<string, number[]>());
  useEffect(() => offsets.current.clear(), [diff]);
  const offsetOf = useCallback(
    (index: number, side: 1 | 2, line: number) => {
      const c = changes[index];
      const key = `${side}:${index}`;
      let list = offsets.current.get(key);
      if (!list) {
        list = side === 1 ? lineOffsets(lines1, c.start1, c.end1) : lineOffsets(lines2, c.start2, c.end2);
        offsets.current.set(key, list);
      }
      return list[line - (side === 1 ? c.start1 : c.start2)] ?? 0;
    },
    [changes, lines1, lines2],
  );

  /** Ana bölmenin tepesindeki konumu öteki bölmeye taşır. */
  const follow = useCallback(
    (from: 1 | 2) => {
      const master = from === 1 ? el1.current : el2.current;
      const slave = from === 1 ? el2.current : el1.current;
      if (!master || !slave) return;
      const mm = from === 1 ? model1 : model2;
      const mf = from === 1 ? folds1 : folds2;
      const sm = from === 1 ? model2 : model1;
      const sf = from === 1 ? folds2 : folds1;
      const anchor = anchorOf(height, lh);
      const masterLine = rowToLine(mm, mf, (master.scrollTop + anchor) / lh);
      const slaveLine = transferLine(changes, masterLine, from === 1);
      const max = Math.max(0, slave.scrollHeight - slave.clientHeight);
      const target = Math.round(Math.min(max, Math.max(0, lineToRow(sm, sf, slaveLine) * lh - anchor)));
      if (Math.abs(slave.scrollTop - target) >= 1) {
        echo.current[from === 1 ? 2 : 1] = target;
        slave.scrollTop = target;
      }
      if (slave.scrollLeft !== master.scrollLeft) slave.scrollLeft = master.scrollLeft;
    },
    [changes, folds1, folds2, height, lh, model1, model2],
  );

  const onScroll = (side: 1 | 2) => {
    const el = side === 1 ? el1.current : el2.current;
    if (!el) return;
    const expected = echo.current[side];
    const isEcho = expected !== null && Math.abs(el.scrollTop - expected) < 1;
    echo.current[side] = null;
    if (sync && !isEcho) follow(side);
    setScroll({ top1: el1.current?.scrollTop ?? 0, top2: el2.current?.scrollTop ?? 0 });
  };

  /*
   * Katlama değişince OKUMA NOKTASINDAKİ satır yerinde kalıyor.
   *
   * BİLDİRİLEN: "Değişmemiş parçaları daralt doğru çalışmıyor." ÖLÇÜLDÜ: 200
   * satırlık dosyada katlamaya basınca içerik ~22 satıra indi ama kaydırma
   * konumu eski yerinde kaldı (scrollTop 453px); görünen alan içeriğin
   * sonundaki boşluğa düştü, bölmeler neredeyse boş göründü. Katlama açarken de
   * tersi: okunan yer başka bir satıra kayıyordu.
   *
   * Eski düzende okuma noktasındaki (`anchorOf`) satır bulunup yeni düzende aynı
   * yere getiriliyor. Konum DOM'dan değil SON KAYDIRMADAN (`scroll`) okunuyor:
   * içerik kısalınca tarayıcı `scrollTop`'u kendiliğinden kırpıyor ve bu anda
   * DOM'daki değer zaten yanlış. `useLayoutEffect`: boyanmadan önce, yanlış
   * konum bir kare bile görünmesin. Karşı tarafı aşağıdaki etki hizalıyor.
   */
  const lastLayout = useRef({ model1, model2, folds1, folds2 });
  useLayoutEffect(() => {
    const prev = lastLayout.current;
    lastLayout.current = { model1, model2, folds1, folds2 };
    if (prev.model1 === model1 && prev.model2 === model2) return;
    const side = caret.side;
    const node = side === 1 ? el1.current : el2.current;
    if (!node) return;
    const [pm, pf, nm, nf] =
      side === 1 ? [prev.model1, prev.folds1, model1, folds1] : [prev.model2, prev.folds2, model2, folds2];
    const anchor = anchorOf(height, lh);
    const line = rowToLine(pm, pf, ((side === 1 ? scroll.top1 : scroll.top2) + anchor) / lh);
    const target = Math.max(0, Math.round(lineToRow(nm, nf, line) * lh - anchor));
    if (Math.abs(node.scrollTop - target) >= 1) {
      echo.current[side] = target;
      node.scrollTop = target;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model1, model2]);

  // Katlama ya da fark değişince karşı taraf yeniden hizalansın.
  useEffect(() => {
    if (sync) follow(caret.side);
    setScroll({ top1: el1.current?.scrollTop ?? 0, top2: el2.current?.scrollTop ?? 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folds, diff, sync]);

  useImperativeHandle(
    ref,
    () => ({
      scrollToLine(side, line) {
        const el = side === 1 ? el1.current : el2.current;
        const model = side === 1 ? model1 : model2;
        const f = side === 1 ? folds1 : folds2;
        if (!el) return;
        const y = lineToRow(model, f, line) * lh;
        el.scrollTop = Math.max(0, y - anchorOf(height, lh));
        // Kaydırma olayı yine gelecek ve eşlemeyi o yapacak; ama ölçümler
        // (jsdom, gizli pencere) olayı geciktirebiliyor: hemen de hizala.
        if (sync) follow(side);
        setScroll({ top1: el1.current?.scrollTop ?? 0, top2: el2.current?.scrollTop ?? 0 });
      },
    }),
    [follow, folds1, folds2, height, lh, model1, model2, sync],
  );

  // İmleç satırı karşı tarafta: eşlenen satır.
  const caret1 = caret.side === 1 ? caret.line : Math.floor(transferLine(changes, caret.line, false));
  const caret2 = caret.side === 2 ? caret.line : Math.floor(transferLine(changes, caret.line, true));

  const rowView = (side: 1 | 2) => (index: number): RowView => {
    const model = side === 1 ? model1 : model2;
    const lines = side === 1 ? lines1 : lines2;
    const byLine = side === 1 ? byLine1 : byLine2;
    const entry = model.rows[index];
    if (entry < 0) {
      const fold = folds[~entry];
      const n = side === 1 ? fold.end1 - fold.start1 : fold.end2 - fold.start2;
      return { key: `f${~entry}`, cls: "fold", gutterCls: "fold", numbers: [""], content: null, caret: false, fold: ~entry, foldCount: n };
    }
    const line = entry;
    const ci = byLine[line];
    let cls = "";
    let gutterCls = "";
    let content: ReactNode = lines[line];
    if (ci >= 0 && colorize) {
      const change = changes[ci];
      const kind = kindClass(change);
      cls = isSoft(change) ? `${kind} soft` : kind;
      gutterCls = kind;
      if (change.inner) {
        content = renderSegments(lineSegments(lines[line], offsetOf(ci, side, line), change.inner, side));
      }
    }
    let arrow: Arrow | undefined;
    if (side === 1 && canApply && colorize) {
      // `»` bloğun İLK satırında; soldaki aralığı boş blokta (ekleme) çizginin
      // hemen altındaki satırda — IntelliJ'de de öyle. Ctrl basılıyken
      // DEĞİŞTİRİLMİŞ blokta "Append" (eklemede/silmede anlamı yok).
      const target = changeArrowAt(changes, line, lines1.length);
      if (target !== null) {
        const append = appendMode && changes[target].kind === "modified";
        arrow = { append, run: () => (append ? onAppend(target) : onApply(target)) };
      }
    }
    return {
      key: `l${line}`,
      cls,
      gutterCls,
      numbers: [String(line + 1)],
      content,
      caret: line === (side === 1 ? caret1 : caret2),
      arrow,
    };
  };

  /** İnce çizgiler: bu tarafta satırı olmayan bloklar. */
  const gaps = (side: 1 | 2): GapMark[] => {
    if (!colorize) return [];
    const model = side === 1 ? model1 : model2;
    const top = side === 1 ? scroll.top1 : scroll.top2;
    const out: GapMark[] = [];
    changes.forEach((c, i) => {
      if (c.ignored) return;
      const [s, e] = side === 1 ? [c.start1, c.end1] : [c.start2, c.end2];
      if (s !== e) return;
      const row = s >= model.rowOfLine.length ? model.rows.length : model.rowOfLine[s];
      const y = row * lh - top;
      if (y < -lh || y > height + lh) return;
      out.push({ key: `g${i}`, row, cls: kindClass(c) });
    });
    return out;
  };

  const stripe1 = useMemo(() => stripeMarks(changes, model1, 1), [changes, model1]);
  const stripe2 = useMemo(() => stripeMarks(changes, model2, 2), [changes, model2]);

  return (
    <div className="dw-sbs" ref={frame}>
      <Pane
        mirror
        rowCount={model1.rows.length}
        lineHeight={lh}
        textWidth={width}
        numberColumns={1}
        numberWidth={`${digits}ch`}
        arrows={canApply}
        top={scroll.top1}
        height={height}
        row={rowView(1)}
        gaps={gaps(1)}
        stripe={colorize ? stripe1 : []}
        bind={(el) => {
          el1.current = el;
        }}
        onScroll={() => onScroll(1)}
        onLineDown={(row) => {
          const entry = model1.rows[row];
          if (entry >= 0) onCaret({ side: 1, line: entry });
        }}
        onFold={props.onFold}
        labels={labels}
      />
      <Divider
        changes={changes}
        folds={folds}
        model1={model1}
        model2={model2}
        top1={scroll.top1}
        top2={scroll.top2}
        height={height}
        lineHeight={lh}
        colorize={colorize}
        onWheel={(event) => {
          const el = el2.current;
          if (!el) return;
          el.scrollTop += event.deltaY;
        }}
      />
      <Pane
        mirror={false}
        rowCount={model2.rows.length}
        lineHeight={lh}
        textWidth={width}
        numberColumns={1}
        numberWidth={`${digits}ch`}
        arrows={false}
        top={scroll.top2}
        height={height}
        row={rowView(2)}
        gaps={gaps(2)}
        stripe={colorize ? stripe2 : []}
        bind={(el) => {
          el2.current = el;
        }}
        onScroll={() => onScroll(2)}
        onLineDown={(row) => {
          const entry = model2.rows[row];
          if (entry >= 0) onCaret({ side: 2, line: entry });
        }}
        onFold={props.onFold}
        labels={labels}
        editor={
          // Katlanmış satır varken yazı alanının satırları bölmeninkilerle örtüşmüyor.
          props.editor && model2.rows.length === lines2.length ? (
            <EditorLayer {...props.editor} lineHeight={lh} lines={lines2.length} />
          ) : undefined
        }
      />
    </div>
  );
});

/**
 * `»`ün bu satırda olup olmadığı: bloğun soldaki ilk satırı; soldaki aralığı
 * boşsa (sağa eklenmiş satırlar) çizginin altındaki satır, dosyanın sonundaysa
 * son satır.
 */
function changeArrowAt(changes: readonly LineChange[], line: number, n1: number): number | null {
  for (let i = 0; i < changes.length; i++) {
    const c = changes[i];
    if (c.ignored) continue;
    const at = c.start1 < n1 ? c.start1 : n1 - 1;
    if (at === line) return i;
    if (at > line) break;
  }
  return null;
}

function stripeMarks(changes: readonly LineChange[], model: RowModel, side: 1 | 2): StripeMark[] {
  const out: StripeMark[] = [];
  for (const c of changes) {
    if (c.ignored) continue;
    const [s, e] = side === 1 ? [c.start1, c.end1] : [c.start2, c.end2];
    const from = s >= model.rowOfLine.length ? model.rows.length : model.rowOfLine[s];
    const to = e > s ? (e - 1 >= model.rowOfLine.length ? model.rows.length : model.rowOfLine[e - 1] + 1) : from;
    out.push({ from, to, cls: kindClass(c) });
  }
  return out;
}

// --------------------------------------------------------------- ayırıcı

/**
 * Ortadaki bağlayıcılar: soldaki bloğu sağdaki karşılığına bağlayan şekiller.
 *
 * Kenarlar kübik eğri ve iki uçta YATAY: IntelliJ'in bağlayıcıları da düz
 * yamuk değil, S biçimli bant. Satırı olmayan taraf iki piksellik bir uç —
 * o taraftaki ince çizginin devamı.
 */
function Divider(props: {
  changes: readonly LineChange[];
  folds: readonly Fold[];
  model1: RowModel;
  model2: RowModel;
  top1: number;
  top2: number;
  height: number;
  lineHeight: number;
  colorize: boolean;
  onWheel: (event: React.WheelEvent) => void;
}) {
  const { changes, folds, model1, model2, top1, top2, height, lineHeight: lh, colorize } = props;
  const w = DIVIDER_W;
  // Kontrol noktaları genişliğin 0.3 ve 0.7'sinde (IntelliJ `CTRL_PROXIMITY_X`).
  const c1 = w * 0.3;
  const c2 = w * 0.7;
  const paths: ReactNode[] = [];
  if (colorize) {
    changes.forEach((change, i) => {
      if (change.ignored) return;
      let a1 = rowY(model1, change.start1, lh) - top1;
      let b1 = change.end1 > change.start1 ? rowY(model1, change.end1 - 1, lh) + lh - top1 : a1;
      let a2 = rowY(model2, change.start2, lh) - top2;
      let b2 = change.end2 > change.start2 ? rowY(model2, change.end2 - 1, lh) + lh - top2 : a2;
      if (Math.max(b1, b2) < 0 || Math.min(a1, a2) > height) return;
      if (a1 === b1) {
        a1 -= 1;
        b1 += 1;
      }
      if (a2 === b2) {
        a2 -= 1;
        b2 += 1;
      }
      const d =
        `M0 ${a1} C${c1} ${a1} ${c2} ${a2} ${w} ${a2} ` +
        `L${w} ${b2} C${c2} ${b2} ${c1} ${b1} 0 ${b1} Z`;
      paths.push(<path key={i} className={kindClass(change)} d={d} />);
    });
  }
  // Katlamanın dalgası ayırıcıdan da geçiyor: iki taraftaki yer tutucuları
  // birbirine bağlayan ince bir çizgi (eş zamanlı kaydırmada ikisi aynı
  // yükseklikte değilse eğri).
  folds.forEach((fold, k) => {
    const y1 = model1.rowOfLine[fold.start1] * lh + lh / 2 - top1;
    const y2 = model2.rowOfLine[fold.start2] * lh + lh / 2 - top2;
    if (Math.max(y1, y2) < 0 || Math.min(y1, y2) > height) return;
    paths.push(
      <path key={`f${k}`} className="fold" d={`M0 ${y1} C${c1} ${y1} ${c2} ${y2} ${w} ${y2}`} />,
    );
  });
  return (
    <svg className="dw-divider" width={w} height={height} onWheel={props.onWheel} aria-hidden="true">
      {paths}
    </svg>
  );
}

// ---------------------------------------------------------------- birleşik

interface UnifiedProps {
  diff: TextDiff;
  folds: readonly Fold[];
  lineHeight: number;
  colorize: boolean;
  caret: Caret;
  onCaret: (caret: Caret) => void;
  onFold: (fold: number) => void;
  canApply: boolean;
  onApply: (change: number) => void;
  labels: PaneLabels;
}

/**
 * "Unified viewer": tek editör, değişen bloğun önce eski sonra yeni satırları.
 * Olukta iki numara sütunu (eski | yeni); satır yalnızca bir tarafa aitse
 * öteki sütun boş.
 *
 * Eski satırlar SİLİNEN, yeni satırlar EKLENEN renginde — blok bir
 * değiştirme olsa bile: tek sütunda "mavi" bir satırın eski mi yeni mi olduğu
 * anlaşılmazdı. İç parçalar yine türlerine göre.
 */
export const Unified = forwardRef<PanesHandle, UnifiedProps>(function Unified(props, ref) {
  const { diff, folds, lineHeight: lh, colorize, caret, onCaret, canApply, onApply, labels } = props;
  const { lines1, lines2, changes } = diff;
  const rows = useMemo(() => unifiedRows(changes, lines1.length, folds), [changes, lines1.length, folds]);
  const width = useMemo(() => textWidth(Math.max(maxColumns(lines1), maxColumns(lines2)), false), [lines1, lines2]);
  const digits = String(Math.max(lines1.length, lines2.length)).length;
  const el = useRef<HTMLDivElement | null>(null);
  const height = useViewport(el);
  const [top, setTop] = useState(0);

  /** Satırın (taraf, numara) → sıra eşlemesi; imleç ve gezinme için. */
  const rowOf = useMemo(() => {
    const m1 = new Map<number, number>();
    const m2 = new Map<number, number>();
    rows.forEach((r, i) => {
      if (r.kind === "same") {
        if (r.line1 >= 0) m1.set(r.line1, i);
        if (r.line2 >= 0) m2.set(r.line2, i);
      } else if (r.kind === "old") m1.set(r.line1, i);
      else if (r.kind === "new") m2.set(r.line2, i);
    });
    return { m1, m2 };
  }, [rows]);

  const findRow = (side: 1 | 2, line: number): number => {
    const map = side === 1 ? rowOf.m1 : rowOf.m2;
    const exact = map.get(line);
    if (exact !== undefined) return exact;
    // Katlanmış satır: o katlamanın yer tutucusu.
    const k = folds.findIndex((f) => (side === 1 ? f.start1 <= line && line < f.end1 : f.start2 <= line && line < f.end2));
    if (k >= 0) {
      const at = rows.findIndex((r) => r.kind === "fold" && r.fold === k);
      if (at >= 0) return at;
    }
    // Boş aralığın noktası: o satırdan sonraki ilk satır.
    for (let l = line; l < line + 4; l++) {
      const next = map.get(l);
      if (next !== undefined) return next;
    }
    return rows.length;
  };

  useImperativeHandle(
    ref,
    () => ({
      scrollToLine(side, line) {
        const node = el.current;
        if (!node) return;
        node.scrollTop = Math.max(0, findRow(side, line) * lh - anchorOf(height, lh));
        setTop(node.scrollTop);
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, height, lh, folds],
  );

  /*
   * Satırlar değişince (katlama) okuma noktasındaki satır yerinde kalıyor —
   * yan yana görünümdekiyle aynı hata ve aynı çözüm (bkz. `SideBySide`). Konum
   * son kaydırmadan (`top`); satır eski düzende bulunup yenisinde aranıyor.
   */
  const lastRows = useRef({ rows, folds });
  useLayoutEffect(() => {
    const prev = lastRows.current;
    lastRows.current = { rows, folds };
    const node = el.current;
    if (prev.rows === rows || !node || prev.rows.length === 0) return;
    const anchor = anchorOf(height, lh);
    const r = prev.rows[Math.min(prev.rows.length - 1, Math.max(0, Math.floor((top + anchor) / lh)))];
    const at: [1 | 2, number] =
      r.kind === "fold"
        ? [2, prev.folds[r.fold].start2]
        : r.kind === "old"
          ? [1, r.line1]
          : r.kind === "new" || r.line2 >= 0
            ? [2, r.line2]
            : [1, r.line1];
    const target = Math.max(0, Math.round(findRow(at[0], at[1]) * lh - anchor));
    if (Math.abs(node.scrollTop - target) >= 1) node.scrollTop = target;
    setTop(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const caretRow = findRow(caret.side, caret.line);

  const offsets = useRef(new Map<string, number[]>());
  useEffect(() => offsets.current.clear(), [diff]);
  const offsetOf = (index: number, side: 1 | 2, line: number) => {
    const c = changes[index];
    const key = `${side}:${index}`;
    let list = offsets.current.get(key);
    if (!list) {
      list = side === 1 ? lineOffsets(lines1, c.start1, c.end1) : lineOffsets(lines2, c.start2, c.end2);
      offsets.current.set(key, list);
    }
    return list[line - (side === 1 ? c.start1 : c.start2)] ?? 0;
  };

  const view = (index: number): RowView => {
    const r: UnifiedRow = rows[index];
    if (r.kind === "fold") {
      const f = folds[r.fold];
      return {
        key: `f${r.fold}`,
        cls: "fold",
        gutterCls: "fold",
        numbers: ["", ""],
        content: null,
        caret: false,
        fold: r.fold,
        foldCount: f.end2 - f.start2,
      };
    }
    if (r.kind === "same") {
      const text = r.line2 >= 0 ? lines2[r.line2] : lines1[r.line1];
      return {
        key: `s${r.line1}:${r.line2}`,
        cls: "",
        gutterCls: "",
        numbers: [r.line1 >= 0 ? String(r.line1 + 1) : "", r.line2 >= 0 ? String(r.line2 + 1) : ""],
        content: text,
        caret: index === caretRow,
      };
    }
    const side: 1 | 2 = r.kind === "old" ? 1 : 2;
    const line = r.kind === "old" ? r.line1 : r.line2;
    const change = changes[r.change];
    const text = side === 1 ? lines1[line] : lines2[line];
    const kind = side === 1 ? "del" : "ins";
    let content: ReactNode = text;
    let cls = "";
    if (colorize) {
      cls = isSoft(change) ? `${kind} soft` : kind;
      if (change.inner) content = renderSegments(lineSegments(text, offsetOf(r.change, side, line), change.inner, side));
    }
    const first = side === 1 ? change.start1 === line : change.start1 === change.end1 && change.start2 === line;
    return {
      key: `${r.kind}${line}`,
      cls,
      gutterCls: colorize ? kind : "",
      numbers: side === 1 ? [String(line + 1), ""] : ["", String(line + 1)],
      content,
      caret: index === caretRow,
      arrow: canApply && first && colorize ? { append: false, run: () => onApply(r.change) } : undefined,
    };
  };

  const stripe = useMemo(() => {
    const out: StripeMark[] = [];
    let i = 0;
    while (i < rows.length) {
      const r = rows[i];
      if (r.kind === "old" || r.kind === "new") {
        const kind = r.kind === "old" ? "del" : "ins";
        const from = i;
        while (i < rows.length && rows[i].kind === r.kind) i++;
        out.push({ from, to: i, cls: kind });
        continue;
      }
      i++;
    }
    return out;
  }, [rows]);

  return (
    <div className="dw-unified">
      <Pane
        mirror={false}
        rowCount={rows.length}
        lineHeight={lh}
        textWidth={width}
        numberColumns={2}
        numberWidth={`${digits}ch`}
        arrows={canApply}
        top={top}
        height={height}
        row={view}
        gaps={[]}
        stripe={colorize ? stripe : []}
        bind={(node) => {
          el.current = node;
        }}
        onScroll={() => setTop(el.current?.scrollTop ?? 0)}
        onLineDown={(index) => {
          const r = rows[index];
          if (r.kind === "old") onCaret({ side: 1, line: r.line1 });
          else if (r.kind === "new") onCaret({ side: 2, line: r.line2 });
          else if (r.kind === "same") onCaret(r.line2 >= 0 ? { side: 2, line: r.line2 } : { side: 1, line: r.line1 });
        }}
        onFold={props.onFold}
        labels={labels}
      />
    </div>
  );
});

// ------------------------------------------------------------- tek taraf

interface OneSideProps {
  lines: string[];
  /** Bütün dosya: eklenen (yeni dosya) ya da silinen. */
  kind: "ins" | "del";
  lineHeight: number;
  colorize: boolean;
  caret: Caret;
  onCaret: (caret: Caret) => void;
  labels: PaneLabels;
  /** Yeni dosya yazılabilir mi (silinen dosyada hiç verilmiyor). */
  editor?: EditorBinding | null;
}

/**
 * Bir tarafı olmayan dosya — yeni (takipsiz / eklenmiş) ya da silinmiş.
 *
 * IntelliJ bu durumda iki editör değil TEK editör gösteriyor ve dosyanın
 * tamamı eklenen ya da silinen renginde. Boş bir sol editör ile ortadan dosya
 * boyu bir bağlayıcı bilgi taşımaz, yer kaplardı.
 */
export const OneSide = forwardRef<PanesHandle, OneSideProps>(function OneSide(props, ref) {
  const { lines, kind, lineHeight: lh, colorize, caret, onCaret, labels } = props;
  const el = useRef<HTMLDivElement | null>(null);
  const height = useViewport(el);
  const [top, setTop] = useState(0);
  const editing = !!props.editor;
  const width = useMemo(() => textWidth(maxColumns(lines), editing), [lines, editing]);
  const side: 1 | 2 = kind === "del" ? 1 : 2;

  useImperativeHandle(
    ref,
    () => ({
      scrollToLine(_side, line) {
        const node = el.current;
        if (!node) return;
        node.scrollTop = Math.max(0, line * lh - anchorOf(height, lh));
        setTop(node.scrollTop);
      },
    }),
    [height, lh],
  );

  const stripe = useMemo<StripeMark[]>(() => [{ from: 0, to: lines.length, cls: kind }], [lines.length, kind]);

  return (
    <div className="dw-unified">
      <Pane
        mirror={false}
        rowCount={lines.length}
        lineHeight={lh}
        textWidth={width}
        numberColumns={1}
        numberWidth={`${String(lines.length).length}ch`}
        arrows={false}
        top={top}
        height={height}
        row={(index) => ({
          key: `l${index}`,
          cls: colorize ? kind : "",
          gutterCls: colorize ? kind : "",
          numbers: [String(index + 1)],
          content: lines[index],
          caret: caret.side === side && caret.line === index,
        })}
        gaps={[]}
        stripe={colorize ? stripe : []}
        bind={(node) => {
          el.current = node;
        }}
        onScroll={() => setTop(el.current?.scrollTop ?? 0)}
        onLineDown={(index) => onCaret({ side, line: index })}
        onFold={() => {}}
        labels={labels}
        editor={props.editor ? <EditorLayer {...props.editor} lineHeight={lh} lines={lines.length} /> : undefined}
      />
    </div>
  );
});

