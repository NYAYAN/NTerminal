import { useEffect, useRef, useState } from "react";

import { gitMessageTitle, helpText, joinGitMessage, splitGitMessage, type GitMessageParts } from "../lib/gitMessage";
import { useT } from "../lib/i18n";
import { api } from "../lib/ipc";
import { isMac } from "../lib/platform";
import { sessions, useStore } from "../store/useStore";

interface GitMessageEditorProps {
  tabId: string;
  /** git'in mesaj dosyası (mutlak yol, `nterminal-edit.sh` bildirdi). */
  path: string;
  /** Kutunun yazı tipi: mesaj, bir sonraki satırda göreceği commit gibi. */
  typography: React.CSSProperties;
}

/**
 * git bir mesaj istediğinde komut kutusunun YERİNE gelen düzenleyici.
 *
 * BİLDİRİLEN: "`git pull` dediğimde komut yazın kısmında değil üst kısımda
 * `:q!` yazmak gerekiyor." git birleştirme mesajı için vim açıyordu; artık
 * `GIT_EDITOR` yardımcı betiğe gidiyor (`nterminal-edit.sh`) ve mesaj burada
 * düzenleniyor. git bu sırada yanıt bekliyor.
 *
 * Onayla dosyayı yazıyor ve betiğe `ok` gönderiyor: git devam ediyor. İptal
 * `cancel` gönderiyor: git işlemi bırakıyor ("Not committing merge"). Dosya
 * okunamazsa (ikili, çok büyük, silinmiş) yanıt `editor`: betik `vi`yi açıyor,
 * çubuk da onu tanıyor.
 *
 * Yazma `writeTextFile`ın beklenen-içerik denetimiyle: dosya bu arada başka
 * bir şey tarafından değiştirildiyse üstüne yazılmıyor, hata söyleniyor ve
 * düzenleyici açık kalıyor.
 */
export function GitMessageEditor({ tabId, path, typography }: GitMessageEditorProps) {
  const t = useT();
  const [parts, setParts] = useState<GitMessageParts | null>(null);
  const [busy, setBusy] = useState(false);
  const original = useRef("");
  const field = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    let alive = true;
    void api
      .readTextFile(path)
      .then((file) => {
        if (!alive) return;
        if (!file || file.binary || file.truncated) throw new Error("okunamadı");
        original.current = file.text;
        setParts(splitGitMessage(file.text));
      })
      .catch(() => {
        if (!alive) return;
        useStore.getState().toast(t("gitEdit.loadFailed"), "err");
        sessions.get(tabId)?.finishEdit("editor");
      });
    return () => {
      alive = false;
    };
    // `t` dile bağlı; dil değişince dosyayı yeniden okumanın anlamı yok.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, tabId]);

  const loaded = parts !== null;
  useEffect(() => {
    if (loaded) field.current?.focus();
  }, [loaded]);

  const confirm = async () => {
    if (!parts || busy) return;
    setBusy(true);
    try {
      await api.writeTextFile(path, original.current, joinGitMessage(parts));
      sessions.get(tabId)?.finishEdit("ok");
    } catch (err) {
      useStore.getState().toast(t("gitEdit.saveFailed", { error: String(err) }), "err");
      setBusy(false);
    }
  };
  const cancel = () => sessions.get(tabId)?.finishEdit("cancel");

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // IME birleştirmesi sürerken Enter aday seçiyor (bkz. `CommandInput`).
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === "Enter" && (isMac() ? e.metaKey : e.ctrlKey)) {
      e.preventDefault();
      void confirm();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  };

  // Mesaj kadar uzun, ama terminali yutmayacak kadar: en az üç, en çok on iki satır.
  const rows = Math.min(Math.max((parts?.body.split("\n").length ?? 1) + 1, 3), 12);
  const help = parts ? helpText(parts.help) : "";

  return (
    <div className="command-input git-edit">
      <div className="git-edit-head">
        <span className="git-edit-title">{t(gitMessageTitle(path))}</span>
        <span className="git-edit-hint">
          {t("gitEdit.hint", { keys: isMac() ? "⌘⏎" : "Ctrl+Enter" })}
        </span>
        <span className="spacer" />
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={cancel}>
          {t("gitEdit.cancel")}
        </button>
        <button
          type="button"
          className="primary"
          disabled={!parts || busy}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => void confirm()}
        >
          {t("gitEdit.confirm")}
        </button>
      </div>
      <textarea
        ref={field}
        className="git-edit-field"
        rows={rows}
        spellCheck={false}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        readOnly={!parts || busy}
        value={parts?.body ?? ""}
        style={typography}
        onChange={(e) => setParts((prev) => (prev ? { ...prev, body: e.target.value } : prev))}
        onKeyDown={onKeyDown}
      />
      {help && <pre className="git-edit-help">{help}</pre>}
    </div>
  );
}
