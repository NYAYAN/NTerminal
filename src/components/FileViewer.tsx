import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  applyEdit,
  displayOffset,
  EditHistory,
  editableEol,
  indentUnit,
  offsetOfLine,
  textEdit,
  toDisplay,
  toFile,
} from "../lib/diffEdit";
import { folderLabel } from "../lib/dirs";
import { baseName, formatBytes } from "../lib/format";
import { useT } from "../lib/i18n";
import { api } from "../lib/ipc";
import { prettyCombo } from "../lib/keys";
import { isMac } from "../lib/platform";
import { useSyntax, type LineTokens } from "../lib/syntax";
import { useStore } from "../store/useStore";
import { EditorLayer, type EditorBinding, type EditorHandle } from "./DiffEditor";
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
}: {
  no: number;
  line: string;
  tokens: LineTokens | undefined;
  /** Aramadan gelinen eşleşme; yalnızca o satıra veriliyor. */
  hit: ViewerReveal | null;
}) {
  return (
    <div className={hit ? "viewer-line hit" : "viewer-line"}>
      {/* Satır numarası seçime girmiyor: kodu kopyalayan biri numaraları da
          kopyalamak istemiyor. */}
      <span className="viewer-no">{no}</span>
      <span className="viewer-text">
        {hit ? markedLine(line, hit.col, hit.len, tokens) : line ? tokenSpans(line, tokens) : " "}
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
}

/** Eşleşme bu dilimde mi (yalnızca o dilim işaretle yeniden çiziliyor)? */
const hitIn = (p: RowChunkProps) => (p.reveal && p.reveal.line > p.from && p.reveal.line <= p.to ? p.reveal : null);

/** Okuma görünümünün `CHUNK` satırlık dilimi; sarmalayıcı öğe yok (tablo satırları). */
const RowChunk = memo(
  function RowChunk({ from, to, lines, tokens, reveal }: RowChunkProps) {
    const rows = [];
    for (let i = from; i < to; i++) {
      rows.push(
        <ViewerRow
          key={i}
          no={i + 1}
          line={lines[i]}
          tokens={tokens?.[i]}
          hit={reveal && reveal.line === i + 1 ? reveal : null}
        />,
      );
    }
    return <>{rows}</>;
  },
  (a, b) =>
    a.from === b.from &&
    a.to === b.to &&
    hitIn(a) === hitIn(b) &&
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

  const folder = folderLabel(path, root);
  /** Satır, gösterilen ilk 512 KB'ın dışında kaldı: söyleniyor, sessizce tepede kalınmıyor. */
  const outside = !!reveal && !!loaded && !loaded.binary && loaded.truncated && reveal.line > lines.length;

  return (
    <div className="viewer">
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
                  reveal={reveal}
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
