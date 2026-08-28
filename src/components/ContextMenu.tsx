import { useEffect, useLayoutEffect, useRef, useState } from "react";

export type MenuEntry =
  | { kind: "item"; label: string; hint?: string; danger?: boolean; disabled?: boolean; run: () => void }
  | { kind: "check"; label: string; checked: boolean; run: () => void }
  | { kind: "separator" }
  | { kind: "header"; label: string };

export interface ContextMenuState {
  x: number;
  y: number;
  entries: MenuEntry[];
}

/**
 * Sağ tık menüsü.
 *
 * Konum ekran dışına taşmayacak şekilde kırpılıyor: sekme çubuğu pencerenin
 * sağ kenarına yakınsa menü sola açılıyor, alt kenara yakınsa yukarı.
 */
export function ContextMenu({ state, onClose }: { state: ContextMenuState; onClose: () => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ x: state.x, y: state.y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const margin = 6;
    const x = Math.max(margin, Math.min(state.x, window.innerWidth - rect.width - margin));
    const y = Math.max(margin, Math.min(state.y, window.innerHeight - rect.height - margin));
    setPos({ x, y });
  }, [state.x, state.y, state.entries]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    // Kaydırma sırasında menü havada kalmasın.
    const onScroll = () => onClose();
    window.addEventListener("keydown", onKey, { capture: true });
    window.addEventListener("wheel", onScroll, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKey, { capture: true });
      window.removeEventListener("wheel", onScroll);
    };
  }, [onClose]);

  return (
    <>
      <div className="menu-backdrop" onMouseDown={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div className="ctx-menu" ref={ref} style={{ left: pos.x, top: pos.y }}>
        {state.entries.map((entry, index) => {
          if (entry.kind === "separator") return <div className="ctx-sep" key={index} />;
          if (entry.kind === "header") {
            return (
              <div className="ctx-header" key={index}>
                {entry.label}
              </div>
            );
          }
          if (entry.kind === "check") {
            return (
              <button
                key={index}
                className="ctx-item"
                onClick={() => {
                  entry.run();
                  onClose();
                }}
              >
                <span className="ctx-mark">{entry.checked ? "✓" : ""}</span>
                <span className="ctx-label">{entry.label}</span>
              </button>
            );
          }
          return (
            <button
              key={index}
              className={entry.danger ? "ctx-item danger" : "ctx-item"}
              disabled={entry.disabled}
              onClick={() => {
                entry.run();
                onClose();
              }}
            >
              <span className="ctx-mark" />
              <span className="ctx-label">{entry.label}</span>
              {entry.hint && <span className="ctx-hint">{entry.hint}</span>}
            </button>
          );
        })}
      </div>
    </>
  );
}

/** Bağlam menüsü durumunu yönetmek için küçük yardımcı. */
export function useContextMenu() {
  const [state, setState] = useState<ContextMenuState | null>(null);
  const open = (event: React.MouseEvent, entries: MenuEntry[]) => {
    event.preventDefault();
    event.stopPropagation();
    setState({ x: event.clientX, y: event.clientY, entries });
  };
  /** Imlec yerine belirli bir noktaya acar (dugme altina cakilan menuler icin). */
  const openAt = (x: number, y: number, entries: MenuEntry[]) => setState({ x, y, entries });
  return { state, open, openAt, close: () => setState(null) };
}
