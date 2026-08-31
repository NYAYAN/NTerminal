import { useEffect, useRef, useState } from "react";

import { useT } from "../lib/i18n";
import type { MsgKey } from "../lib/messages";
import { useStore, type SidePanelMode } from "../store/useStore";
import { FavoritesPanel } from "./FavoritesPanel";
import { FileTree } from "./FileTree";
import { FileViewer } from "./FileViewer";
import { GitChanges } from "./GitChanges";
import { HistoryPanel } from "./HistoryPanel";

const MODE_KEYS: Record<SidePanelMode, MsgKey> = {
  history: "app.history",
  favorites: "app.favorites",
  git: "app.changes",
  files: "app.files",
};

/**
 * Sağ panelin kabuğu: başlık, kip sekmeleri ve genişlik tutamacı.
 * İçerik dört listeden biri — geçmiş, favoriler, git değişiklikleri ya da
 * dosya ağacı.
 *
 * Değişiklikler AYRI bir çekmece olarak yazılmıştı ve geri alındı: kullanıcının
 * zaten bildiği çekmece bu. İkinci bir çekmece hem ikinci bir kapatma yolu hem
 * ikinci bir genişlik tutamacı demekti; üçüncü bir sekme olarak eklemek
 * öğrenilmiş olanı tekrar kullanıyor.
 */
export function SidePanel() {
  const t = useT();
  const mode = useStore((s) => s.ui.panelMode);
  const viewerPath = useStore((s) => s.ui.viewerPath);
  const favoriteCount = useStore((s) => s.favorites.length);
  const storedWidth = useStore((s) => s.settings.appearance.panelWidth);
  const patchAppearance = useStore((s) => s.patchAppearance);
  const setUi = useStore((s) => s.setUi);

  const [width, setWidth] = useState(storedWidth);
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  // Ayardan gelen genislik degisirse (ice alma, baska pencere) yakala.
  useEffect(() => {
    setWidth(storedWidth);
  }, [storedWidth]);

  useEffect(() => {
    const move = (event: MouseEvent) => {
      if (!drag.current) return;
      const next = Math.min(
        720,
        Math.max(260, drag.current.startWidth - (event.clientX - drag.current.startX)),
      );
      setWidth(next);
    };
    const up = () => {
      if (!drag.current) return;
      drag.current = null;
      // Surukleme bitince ayara yaz; surukleme sirasinda her karede yazmiyoruz.
      const el = document.querySelector<HTMLElement>(".side-panel");
      const final = el ? Math.round(el.getBoundingClientRect().width) : width;
      if (Number.isFinite(final) && final !== storedWidth) {
        void patchAppearance({ panelWidth: final });
      }
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [storedWidth, width, patchAppearance]);

  return (
    <aside className="side-panel" style={{ width }}>
      <div
        className="panel-resize"
        onMouseDown={(e) => {
          drag.current = { startX: e.clientX, startWidth: width };
          e.preventDefault();
        }}
      />

      <div className="panel-head">
        <div className="panel-tabs">
          {(Object.keys(MODE_KEYS) as SidePanelMode[]).map((key) => (
            <button
              key={key}
              className={mode === key ? "on" : ""}
              onClick={() => setUi({ panelMode: key })}
            >
              {t(MODE_KEYS[key])}
              {key === "favorites" && favoriteCount > 0 && (
                <span className="pill-count">{favoriteCount}</span>
              )}
            </button>
          ))}
        </div>
        <button className="icon-btn" title={t("panel.close")} onClick={() => setUi({ historyOpen: false })}>
          ×
        </button>
      </div>

      {mode === "history" && <HistoryPanel />}
      {mode === "favorites" && <FavoritesPanel />}
      {mode === "git" && <GitChanges />}
      {/* "Dosyalar" sekmesinin iki durumu: yol seçilmişse içerik, yoksa ağaç. */}
      {mode === "files" && (viewerPath ? <FileViewer path={viewerPath} /> : <FileTree />)}
    </aside>
  );
}
