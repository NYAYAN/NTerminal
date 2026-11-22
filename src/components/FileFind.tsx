import type { RefObject } from "react";

import { isFindKey } from "../lib/fileFind";
import { useT } from "../lib/i18n";
import { isMac } from "../lib/platform";
import { useStore } from "../store/useStore";
import { flagForKey, SearchToggles, toggleFlag } from "./SearchToggles";

/**
 * Açık dosyada arama çubuğu — görüntüleyicinin başlığının altında bir şerit
 * (gerekçesi `.viewer-find` üzerinde).
 *
 * Terminaldeki arama çubuğuyla aynı tuşlar (`TerminalFind`):
 * Enter sonraki, Shift+Enter önceki, Esc kapatır. Seçenekler (Aa, tam sözcük,
 * düzenli ifade) dosyaların içinde aramanın seçenekleri: kutunun içinde
 * duruyorlar ve paletle, dosya sütunuyla paylaşılıyorlar (bkz.
 * `SearchToggles`).
 *
 * Durum görüntüleyicide (`FileViewer`): sorgu, işaretli eşleşme ve sonuçlar
 * dosyaya ait; çubuk yalnızca gösteriyor ve tuşları karşılıyor.
 *
 * `data-owns-escape`: Esc'yi çubuk karşılıyor. Uygulamanın genel dinleyicisi
 * (`App.tsx`) önce koşuyor ve öyle olmasa arkadaki terminal aramasını
 * kapatırdı; dosya paneli de Esc'de kapanırdı (`FilePanel`).
 */
export function FileFind({
  query,
  onQuery,
  count,
  none,
  error,
  inputRef,
  onStep,
  onClose,
}: {
  query: string;
  onQuery: (query: string) => void;
  /** "3/12"; sorgu boşsa boş. */
  count: string;
  /** Sorgu var ama eşleşme yok. */
  none: boolean;
  /** Düzenli ifade derlenemedi. */
  error: string | null;
  inputRef: RefObject<HTMLInputElement | null>;
  onStep: (direction: 1 | -1) => void;
  onClose: () => void;
}) {
  const t = useT();
  const binding = useStore((s) => s.settings.keybindings.findInTerminal);
  const mac = isMac();

  return (
    <div className={none || error ? "viewer-find none" : "viewer-find"} data-owns-escape="">
      <div className={error ? "search-field bad" : "search-field"}>
        <input
          ref={inputRef}
          value={query}
          placeholder={t("viewerFind.placeholder")}
          aria-label={t("viewerFind.placeholder")}
          aria-invalid={error ? true : undefined}
          title={error ?? undefined}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => onQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            // Dosya paneli Esc'de kapanıyor, harfler de genel kısayollara
            // gitmesin (bkz. `FilePanel`, `App.tsx`).
            e.stopPropagation();
            if (e.key === "Escape") {
              e.preventDefault();
              onClose();
              return;
            }
            // Enter / F3 ve mac'te ⌘G: IDE'lerin ve tarayıcının "sonraki".
            const nextKey =
              e.key === "Enter" ||
              e.key === "F3" ||
              (mac && e.metaKey && !e.ctrlKey && !e.altKey && e.code === "KeyG");
            if (nextKey) {
              e.preventDefault();
              onStep(e.shiftKey ? -1 : 1);
              return;
            }
            const flag = flagForKey(e);
            if (flag) {
              e.preventDefault();
              toggleFlag(flag);
              return;
            }
            // Açıkken yeniden basılan arama tuşu kutudakini seçiyor: yeni bir
            // şey yazmak için silmek gerekmesin.
            if (isFindKey(e.nativeEvent, binding, mac)) {
              e.preventDefault();
              e.currentTarget.select();
            }
          }}
        />
        <SearchToggles />
      </div>
      <span className="count" title={error ?? undefined}>
        {error ? "!" : count}
      </span>
      {/* Düğmeler odağı kutudan almıyor: gezinirken yazmaya devam edilebilsin. */}
      <button
        type="button"
        className="icon-btn"
        title={t("find.prev")}
        aria-label={t("find.prev")}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onStep(-1)}
      >
        ↑
      </button>
      <button
        type="button"
        className="icon-btn"
        title={t("find.next")}
        aria-label={t("find.next")}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onStep(1)}
      >
        ↓
      </button>
      <button
        type="button"
        className="icon-btn"
        title={t("find.close")}
        aria-label={t("find.close")}
        onClick={onClose}
      >
        ×
      </button>
    </div>
  );
}
