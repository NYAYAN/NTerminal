import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  applyEdit,
  displayOffset,
  EditHistory,
  editableEol,
  indentUnit,
  textEdit,
  toDisplay,
  toFile,
} from "../lib/diffEdit";
import { baseName, formatBytes } from "../lib/format";
import { useT } from "../lib/i18n";
import { api } from "../lib/ipc";
import { prettyCombo } from "../lib/keys";
import { isMac } from "../lib/platform";
import { useStore } from "../store/useStore";
import { EditorLayer, type EditorBinding, type EditorHandle } from "./DiffEditor";
import { ChevronIcon, PencilIcon, RedoIcon, SaveIcon, UndoIcon } from "./Icons";
import type { FileText } from "../types";

/**
 * Dosya görüntüleyici — "Dosyalar" sekmesinin ikinci hâli.
 *
 * ## Neden beşinci bir sekme değil
 *
 * Görüntüleyici tek başına bir yer değil, bir dosyayı SEÇTİKTEN sonraki hâl.
 * Beşinci bir sekme çoğu zaman boş dururdu ve "hangi dosya açık" sorusunun
 * yanıtı sekme adında olmazdı. Şimdi ağaç ile görüntüleyici aynı sekmenin iki
 * durumu: yol seçilince içerik, geri denince ağaç.
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
 * kaybolmasın diye düzenlemeyi kapatırken, başka dosyaya geçerken ya da
 * ağaca dönerken kendiliğinden yazılıyor (IntelliJ de dosyadan çıkınca
 * kaydediyor). Dosya okunduktan sonra başka bir yerde kaydedildiyse üzerine
 * yazılmıyor; kullanıcı seçiyor.
 *
 * ## Neden sözdizimi renklendirmesi yok
 *
 * Bir renklendirici (Prism, Shiki, highlight.js) onlarca dil grameri ve
 * yüzlerce kilobayt demek. Satır numarası ve eş aralıklı yazı tipi "şu
 * dosyada ne var" sorusunu yanıtlamaya yetiyor.
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

export function FileViewer({ path }: { path: string }) {
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
        void api.writeTextFile(path, ed.base, ed.raw).catch((err) => useStore.getState().toast(String(err), "err"));
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

  const lines = loaded && !loaded.binary ? display.split("\n") : [];
  const numbers = useMemo(
    () => Array.from({ length: Math.max(1, lines.length) }, (_, i) => i + 1).join("\n"),
    [lines.length],
  );
  const columns = useMemo(() => {
    let max = 0;
    for (const line of lines) if (line.length > max) max = line.length;
    return Math.ceil((max + 1) / WIDTH_STEP) * WIDTH_STEP;
  }, [lines]);

  return (
    <div className="viewer">
      <div className={editing ? "viewer-head editing" : "viewer-head"}>
        <button
          type="button"
          className="viewer-back"
          title={t("viewer.back")}
          onClick={() => useStore.getState().setUi({ viewerPath: null })}
        >
          {/* Sola bakan ok: ağaca dönüş. `ChevronIcon` kapalı hâlde sağa
              bakıyor, bu yüzden çevriliyor. */}
          <span className="flip">
            <ChevronIcon open={false} size={11} />
          </span>
        </button>
        <span className="viewer-name" title={path}>
          {baseName(path) || path}
        </span>
        {dirty && (
          <span className="viewer-dirty" title={t("viewer.unsaved")} aria-label={t("viewer.unsaved")}>
            ●
          </span>
        )}
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
              <EditorLayer {...binding} className="viewer-editor" scroller=".viewer-body" lines={lines.length} />
            </div>
          </div>
        ) : (
          lines.length > 0 && (
            <div className="viewer-code">
              {lines.map((line, i) => (
                <div key={i} className="viewer-line">
                  {/* Satır numarası seçime girmiyor: kodu kopyalayan biri
                      numaraları da kopyalamak istemiyor. */}
                  <span className="viewer-no">{i + 1}</span>
                  <span className="viewer-text">{line || " "}</span>
                </div>
              ))}
            </div>
          )
        )}

        {loaded?.truncated && <div className="viewer-cut">{t("viewer.truncated")}</div>}
      </div>
    </div>
  );
}
