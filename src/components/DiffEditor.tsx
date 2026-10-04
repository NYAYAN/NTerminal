import { useEffect, useImperativeHandle, useLayoutEffect, useRef } from "react";

import { indentSelection, lineAt, newlineWithIndent, offsetOfLine, textEdit, type Edited } from "../lib/diffEdit";
import { isMac } from "../lib/platform";

/*
 * Fark penceresinin sağ tarafındaki yazı alanı (dosya görüntüleyicisi de
 * kullanıyor: orada altında renkli satır yok, harfleri yine kendisi çiziyor).
 *
 * İSTEK: "Düzenle de bizim terminalimizde olmalı" — IntelliJ'deki gibi sağ
 * taraf doğrudan yazılabilir. Bölmenin satırları SANAL çiziliyor (yalnızca
 * görünenler) ve farkın renkleri, sözcük parçaları onlarda; yazı alanı onların
 * ÜSTÜNDE, aynı yazı tipi, satır yüksekliği ve soldaki boşlukla duran saydam
 * bir `<textarea>`. Metni yazı alanı çiziyor, renkleri altındaki satırlar:
 * yazarken harfler hiç gecikmiyor, fark bir sonraki çizimde yetişiyor. İmleç,
 * seçim, IME, kopyala/yapıştır ve sürükle-bırak tarayıcının kendisi.
 *
 * Yazı alanı kendi başına KAYMIYOR: boyu bütün dosya kadar ve bölmenin
 * kaydırıcısının içinde; tarayıcı imleci göstermek için o kaydırıcıyı
 * kaydırıyor. Yine de iç kaydırma olursa (satır sona eklenince, çizimden
 * önce) kaydırıcıya aktarılıyor — yoksa yazı ile renkler kayardı.
 */

export interface EditorHandle {
  /** Odaklanır ve imleci satırın başına koyar. */
  focusLine(line: number): void;
}

/** DiffWindow'un yazı alanına verdikleri. */
export interface EditorBinding {
  /** Yazı alanının metni (satır sonları `\n`). */
  text: string;
  /** Programın koyduğu seçim (geri alma); `seq` değişince uygulanıyor. */
  selection: { start: number; end: number; seq: number } | null;
  /** Sekme tuşunun eklediği girinti. */
  indent: string;
  /** Kullanıcı metni değiştirdi. `typing`: klavyeden (geri almada birleşebilir). */
  onInput: (text: string, typing: boolean) => void;
  /** İmlecin satırı (gezinme ve imleç satırının zemini). */
  onCaretLine: (line: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  /** Ctrl+S / Cmd+S (dosya görüntüleyicisi; fark penceresi kendi yakalıyor). */
  onSave?: () => void;
  handle: React.RefObject<EditorHandle | null>;
  label: string;
}

/** Yazı alanının yerleştiği yer: fark bölmesi ya da dosya görüntüleyicisi. */
interface Placement {
  /** Satır sayısı; boy bundan. */
  lines: number;
  /** Satır yüksekliği (px). Verilmezse CSS'in kendi satır yüksekliği (`lh`). */
  lineHeight?: number;
  /** CSS sınıfı (varsayılan fark penceresininki). */
  className?: string;
  /** İç kaydırmanın aktarılacağı kaydırıcı. */
  scroller?: string;
}

/** Bir konumun, metne uygulanan değişiklikten sonraki yeri. */
function mapOffset(o: number, edit: { at: number; removed: string; inserted: string }): number {
  if (o <= edit.at) return o;
  if (o >= edit.at + edit.removed.length) return o + edit.inserted.length - edit.removed.length;
  return edit.at + edit.inserted.length;
}

export function EditorLayer(props: EditorBinding & Placement) {
  const { text, selection, lineHeight: lh, lines } = props;
  const ta = useRef<HTMLTextAreaElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const appliedSeq = useRef<number | null>(null);
  /*
   * İlk metin yalnızca bir kez: React `defaultValue` değişince textarea'nın
   * içeriğini (bütün dosyayı) DOM'da yeniden yazıyor. ÖLÇÜLDÜ: 20 bin satırda
   * tuş başına ~35 ms. Sonraki metinler aşağıdaki efektten `value`ya.
   */
  const initial = useRef(text).current;

  /*
   * İmlecin satırı yukarıya YALNIZCA yazı alanı odaktayken: odakta değilken
   * seçimi kimse görmüyor ve bildirmek, F7'nin ya da sol tarafa tıklamanın
   * koyduğu imleci ezerdi.
   */
  const reportCaret = () => {
    const el = ta.current;
    if (!el || document.activeElement !== el) return;
    const at = el.selectionDirection === "backward" ? el.selectionStart : el.selectionEnd;
    latest.current.onCaretLine(lineAt(el.value, at));
  };

  /*
   * Metin dışarıdan değiştiyse (`»`, diskten yeniden yükleme, geri alma) yazı
   * alanına yaz. Seçim istenmediyse eski seçim değişikliğin üzerinden taşınıyor:
   * imlecin üstüne eklenen satırlar onu yerinden oynatmasın.
   */
  useLayoutEffect(() => {
    const el = ta.current;
    if (!el) return;
    if (el.value !== text) {
      const edit = textEdit(el.value, text);
      const start = edit ? mapOffset(el.selectionStart, edit) : el.selectionStart;
      const end = edit ? mapOffset(el.selectionEnd, edit) : el.selectionEnd;
      el.value = text;
      el.setSelectionRange(Math.min(start, text.length), Math.min(end, text.length));
    }
    if (selection && selection.seq !== appliedSeq.current) {
      appliedSeq.current = selection.seq;
      el.setSelectionRange(selection.start, selection.end);
    }
    reportCaret();
    // `reportCaret` ref'ten okuyor; yalnızca metin ve istenen seçim tetiklesin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, selection]);

  useImperativeHandle(
    props.handle,
    () => ({
      focusLine(line: number) {
        const el = ta.current;
        if (!el) return;
        const at = offsetOfLine(el.value, line);
        el.focus({ preventScroll: true });
        el.setSelectionRange(at, at);
        reportCaret();
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  /*
   * Menüden gelen Geri Al / Yinele (macOS'ta Düzen menüsü) tuş olayı olmadan
   * `beforeinput` olarak geliyor; yazı alanının kendi geçmişi yerine bizimki.
   */
  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    const onBefore = (event: InputEvent) => {
      if (event.inputType === "historyUndo") {
        event.preventDefault();
        latest.current.onUndo();
      } else if (event.inputType === "historyRedo") {
        event.preventDefault();
        latest.current.onRedo();
      }
    };
    el.addEventListener("beforeinput", onBefore);
    return () => el.removeEventListener("beforeinput", onBefore);
  }, []);

  /** Programın yaptığı bir düzenleme (sekme, Enter): yazı alanına ve yukarıya. */
  const commit = (el: HTMLTextAreaElement, edited: Edited) => {
    el.value = edited.text;
    el.setSelectionRange(edited.start, edited.end);
    latest.current.onInput(edited.text, true);
    reportCaret();
  };

  return (
    <textarea
      ref={ta}
      className={props.className ?? "dw-editor"}
      aria-label={props.label}
      defaultValue={initial}
      wrap="off"
      spellCheck={false}
      autoCorrect="off"
      autoCapitalize="off"
      autoComplete="off"
      // Sonda bir boş satır payı: son satıra Enter basınca iç kaydırma olmasın.
      style={{ height: lh !== undefined ? (lines + 1) * lh : `calc(${lines + 1} * 1lh)` }}
      onInput={(event) => {
        latest.current.onInput(event.currentTarget.value, true);
        reportCaret();
      }}
      onSelect={reportCaret}
      onKeyUp={reportCaret}
      onMouseUp={reportCaret}
      onFocus={reportCaret}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return;
        const el = event.currentTarget;
        const bare = !event.metaKey && !event.ctrlKey && !event.altKey;
        // Geri al / İleri al / Kaydet: fark penceresinde pencerenin dinleyicisi
        // önce yakalıyor ve buraya hiç gelmiyor; ana pencerede gelen bu.
        const mod = isMac() ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
        if (mod && !event.altKey) {
          const redo = (event.code === "KeyZ" && event.shiftKey) || (!isMac() && event.code === "KeyY" && !event.shiftKey);
          const action =
            redo ? latest.current.onRedo
            : event.code === "KeyZ" ? latest.current.onUndo
            : event.code === "KeyS" && !event.shiftKey ? latest.current.onSave
            : undefined;
          if (action) {
            event.preventDefault();
            action();
            return;
          }
        }
        if (event.key === "Tab" && bare) {
          event.preventDefault();
          commit(el, indentSelection(el.value, el.selectionStart, el.selectionEnd, props.indent, event.shiftKey));
        } else if (event.key === "Enter" && bare && !event.shiftKey) {
          event.preventDefault();
          commit(el, newlineWithIndent(el.value, el.selectionStart, el.selectionEnd));
        }
      }}
      onScroll={(event) => {
        const el = event.currentTarget;
        if (el.scrollTop === 0 && el.scrollLeft === 0) return;
        const scroller = el.closest<HTMLElement>(props.scroller ?? ".dw-scroll");
        if (scroller) {
          scroller.scrollTop += el.scrollTop;
          scroller.scrollLeft += el.scrollLeft;
        }
        el.scrollTop = 0;
        el.scrollLeft = 0;
      }}
    />
  );
}
