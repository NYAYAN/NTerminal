import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { useT } from "../lib/i18n";
import type { MsgKey } from "../lib/messages";
import { useStore, type SidePanelMode } from "../store/useStore";
import { FavoritesPanel } from "./FavoritesPanel";
import { GitChanges, allFilesCollapsed } from "./GitChanges";
import { useActiveGit } from "./gitShared";
import { HistoryPanel } from "./HistoryPanel";
import { CollapseAllIcon, ExpandAllIcon, FolderIcon } from "./Icons";

const MODE_KEYS: Record<SidePanelMode, MsgKey> = {
  history: "app.history",
  favorites: "app.favorites",
  git: "app.changes",
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
  const favoriteCount = useStore((s) => s.favorites.length);
  const storedWidth = useStore((s) => s.settings.appearance.panelWidth);
  const patchAppearance = useStore((s) => s.patchAppearance);
  const setUi = useStore((s) => s.setUi);

  // Toplu katlama düğmesi için: liste ile AYNI türetme (bkz. `useActiveGit`).
  const { changes } = useActiveGit();
  const gitExpanded = useStore((s) => s.ui.gitExpanded);
  const allCollapsed = allFilesCollapsed(changes, gitExpanded);
  const showPaths = useStore((s) => s.ui.gitShowPaths);

  const [width, setWidth] = useState(storedWidth);
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);
  const aside = useRef<HTMLElement | null>(null);

  /*
   * Panelin ÇİZİLEN genişliği `.main`e değişken olarak (`--side-panel-w`).
   *
   * Panel terminalin üstünde açılıyor (bkz. `.side-panel`); Dosyalar katmanı da
   * öyle. İkisi birden açıkken Dosyalar panelin soluna kadar uzanıyor (bkz.
   * `.main:has(> .side-panel) .files-overlay`) ve bunun için genişliği bilmeli.
   * Çizilen, istenen değil: CSS dar pencerede paneli sınırlıyor. Gözlemci
   * sürüklemeyi de pencere boyutunu da yakalıyor.
   */
  useLayoutEffect(() => {
    const el = aside.current;
    const main = el?.parentElement;
    if (!el || !main) return;
    const write = () =>
      main.style.setProperty("--side-panel-w", `${Math.round(el.getBoundingClientRect().width)}px`);
    write();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(write) : null;
    observer?.observe(el);
    return () => {
      observer?.disconnect();
      main.style.removeProperty("--side-panel-w");
    };
  }, []);

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
    <aside className="side-panel" ref={aside} style={{ width }}>
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
              <span className="panel-tab-label">{t(MODE_KEYS[key])}</span>
              {key === "favorites" && favoriteCount > 0 && (
                <span className="pill-count">{favoriteCount}</span>
              )}
            </button>
          ))}
        </div>
        {/* Toplu aç/kapa — YALNIZCA "Değişiklikler" kipinde ve dosya varken.
         *
         * Yeri kapatma çarpısının SOLU: liste kapalı geliyor; "hepsine bir
         * bakayım" ve bakıp bittikten sonra "hepsini topla" panelin başlığına
         * ait eylemler, satırlara değil. Boş listede çizilmiyor — yapacağı bir
         * iş yokken duran düğme gürültü (favoriler panelinde de aynı kural).
         *
         * Simge yönü durumu söylüyor: hiçbiri açık değilse açan simge, yoksa
         * daraltan. Böylece düğme bir açma/kapama anahtarı gibi okunuyor. */}
        {mode === "git" && changes.length > 0 && (
          <>
            {/* Klasör yollarını göster/gizle.
             *
             * Satırlarda varsayılan olarak yalnızca dosya adı duruyor
             * (gerekçesi `ui.gitShowPaths`); bu düğme klasör zincirini soluk
             * bir ön ek olarak geri getiriyor. Basılıyken `on` sınıfı var:
             * açık olmak varsayılan değil, dolayısıyla vurgu bilgi taşıyor. */}
            <button
              className={showPaths ? "icon-btn on" : "icon-btn"}
              title={t(showPaths ? "git.hidePaths" : "git.showPaths")}
              aria-pressed={showPaths}
              onClick={() => setUi({ gitShowPaths: !showPaths })}
            >
              <FolderIcon size={14} />
            </button>
            <button
              className="icon-btn"
              title={t(allCollapsed ? "git.expandAllFiles" : "git.collapseAllFiles")}
              aria-pressed={allCollapsed}
              onClick={() =>
                setUi({ gitExpanded: allCollapsed ? changes.map((c) => c.path) : [] })
              }
            >
              {allCollapsed ? <ExpandAllIcon size={14} /> : <CollapseAllIcon size={14} />}
            </button>
          </>
        )}
        <button className="icon-btn" title={t("panel.close")} onClick={() => setUi({ historyOpen: false })}>
          ×
        </button>
      </div>

      {mode === "history" && <HistoryPanel />}
      {mode === "favorites" && <FavoritesPanel />}
      {mode === "git" && <GitChanges />}
    </aside>
  );
}
