import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { ChevronIcon } from "./Icons";

export type MenuEntry =
  | { kind: "item"; label: string; hint?: string; danger?: boolean; disabled?: boolean; run: () => void }
  /**
   * İşaretli/işaretsiz seçim satırı.
   *
   * `hint` sağda soluk duran ayırt edici metin. Sekme listesinde eklendi:
   * sekiz sekmenin adı da "nurullah.yayan" olabiliyor (kabuk kullanıcı adını
   * başlık yapıyor) ve aynı adı sekiz kez listelemek, doğru sekmeyi bulmayı
   * imkânsız kılıyordu — listenin var olma sebebi tam olarak bu.
   */
  | { kind: "check"; label: string; checked: boolean; hint?: string; run: () => void }
  | { kind: "separator" }
  | { kind: "header"; label: string }
  /**
   * Tıklanamayan bilgi satırı: solda ne olduğu, sağda değeri.
   *
   * Durum çubuğu dar kaldığında öğeleri "⋯" menüsüne taşıyor ve oradaki
   * çoğunun bir eylemi yok — "Kabuk pid: 11421" okunacak bir şey, yapılacak
   * değil. `item` + boş `run` yanlış söz veriyor (tıklanabilir görünüyor,
   * tıklayınca menü kapanıyor), `disabled` ise "şu an kullanılamıyor" diyor.
   * İkisi de doğru değil, o yüzden ayrı bir tür.
   */
  | { kind: "info"; label: string; value?: string; title?: string }
  /**
   * Alt menü.
   *
   * Uzun listeler (örnek: "Gruba taşı" altındaki gruplar) menüyü ana
   * eylemlerin görünmeyeceği kadar uzatıyordu; on beş grubu olan bir
   * kullanıcıda "Sekmeyi kapat" ekranın dışında kalıyor.
   */
  | { kind: "submenu"; label: string; entries: MenuEntry[]; disabled?: boolean };

export interface ContextMenuState {
  x: number;
  y: number;
  entries: MenuEntry[];
}

/** Alt menünün açılması için gereken bekleme (ms). */
const SUBMENU_OPEN_DELAY = 120;

/**
 * Sağ tık menüsü.
 *
 * Konum ekran dışına taşmayacak şekilde kırpılıyor: sekme çubuğu pencerenin
 * sağ kenarına yakınsa menü sola açılıyor, alt kenara yakınsa yukarı.
 */
export function ContextMenu({ state, onClose }: { state: ContextMenuState; onClose: () => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ x: state.x, y: state.y });

  /*
   * Klavye: menü açılınca odak ilk satırda, kapanınca açıldığı yere dönüyor.
   *
   * Menü eskiden yalnızca fareyle geziliyordu: satırlar düğme olsa da odağı
   * kimse vermiyordu, ok tuşları işlemiyordu ve ekran okuyucu düz `div`
   * okuyordu. Klavyeyle (⇧F10 / menü tuşu / uygulamanın kısayolları) açılan
   * menü, odak terminalde kaldığı için ilk ok tuşunu kabuğa gönderiyordu.
   * Gezinti `MenuPanel` içinde (ok, Home/End, sağ-sol ok alt menü); burada
   * yalnızca odağın gidip gelmesi.
   */
  // Çizim sırasında alınıyor, etkide değil: çocuk etkileri önce koşuyor ve
  // `MenuPanel` o anda ilk satırı odaklamış oluyor — etkide bakılsa "açıldığı
  // yer" menünün kendisi çıkardı.
  const [back] = useState(() =>
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  useEffect(
    () => () => {
      if (back?.isConnected) back.focus();
    },
    [back],
  );

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
      <MenuPanel ref={ref} entries={state.entries} pos={pos} onClose={onClose} />
    </>
  );
}

/**
 * Menü gövdesi. Alt menüler aynı bileşeni yeniden kullanıyor, böylece
 * kırpma ve tıklama davranışı tek yerde kalıyor.
 */
function MenuPanel({
  ref,
  entries,
  pos,
  onClose,
  onBack,
}: {
  ref?: React.Ref<HTMLDivElement>;
  entries: MenuEntry[];
  pos: { x: number; y: number };
  onClose: () => void;
  /** Alt menüde sol ok: üst menüye dön (alt menüyü kapat, satırı odakla). */
  onBack?: () => void;
}) {
  // Açık alt menünün girdi sırası ve konumu.
  const [open, setOpen] = useState<{ index: number; x: number; y: number; flip: boolean } | null>(
    null,
  );
  const timer = useRef<number | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const scheduleOpen = (index: number, row: HTMLElement) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    // Küçük bir gecikme: imleç alt menülü bir satırın üzerinden geçerken
    // menü açılıp kapanmasın.
    timer.current = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const panelRect = panel.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      // Sağda yer yoksa sola aç: sabit bir tahmini genişlikle karar veriyoruz,
      // gerçek genişlik ölçülene kadar menü zaten çizilmemiş olurdu.
      const estimated = 220;
      const flip = panelRect.right + estimated > window.innerWidth - 6;
      setOpen({
        index,
        x: flip ? panelRect.left - estimated + 4 : panelRect.right - 4,
        y: rowRect.top - 4,
        flip,
      });
    }, SUBMENU_OPEN_DELAY);
  };

  const closeSub = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setOpen(null);
  };

  const openEntry = open !== null ? entries[open.index] : undefined;

  /** Bu panelin odaklanabilir satırları (devre dışı ve bilgi satırları hariç). */
  const focusables = () =>
    panelRef.current
      ? Array.from(panelRef.current.querySelectorAll<HTMLButtonElement>("button.ctx-item:not(:disabled)"))
      : [];

  // Açılışta ilk satır odaklı: ok tuşları hemen işlesin, Enter ilk eylemi yapsın.
  useEffect(() => {
    focusables()[0]?.focus();
  }, []);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const items = focusables();
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    const focusAt = (i: number) => items[(i + items.length) % items.length]?.focus();
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusAt(current + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        focusAt(current - 1);
        break;
      case "Home":
        event.preventDefault();
        focusAt(0);
        break;
      case "End":
        event.preventDefault();
        focusAt(items.length - 1);
        break;
      case "ArrowRight": {
        const row = items[current];
        if (row?.classList.contains("has-sub")) {
          event.preventDefault();
          const index = Number(row.dataset.index);
          scheduleOpen(index, row);
        }
        break;
      }
      case "ArrowLeft":
        if (onBack) {
          event.preventDefault();
          event.stopPropagation();
          onBack();
        }
        break;
      default:
        break;
    }
  };

  return (
    <>
      <div
        className="ctx-menu"
        role="menu"
        onKeyDown={onKeyDown}
        ref={(node) => {
          panelRef.current = node;
          if (typeof ref === "function") ref(node);
          else if (ref && typeof ref === "object") (ref as { current: HTMLDivElement | null }).current = node;
        }}
        style={{ left: pos.x, top: pos.y }}
      >
        {entries.map((entry, index) => {
          if (entry.kind === "separator") return <div className="ctx-sep" key={index} />;

          if (entry.kind === "info") {
            /*
             * `title`: kısa değerin ARKASINDAKİ açıklama.
             *
             * Durum okumaları çubuktan buraya taşınınca ipuçlarını taşıyacak
             * bir yer kalmamıştı — oysa asıl işi gören onlar: "Sınırlı" tek
             * başına ne yapılacağını söylemiyor, ipucu ise sebebi ve çözümü
             * yazıyor (bkz. `status.integrationOffTitle`).
             */
            return (
              <div className="ctx-item ctx-info" key={index} title={entry.title}>
                <span className="ctx-mark" />
                <span className="ctx-label">{entry.label}</span>
                {entry.value && <span className="ctx-hint">{entry.value}</span>}
              </div>
            );
          }

          if (entry.kind === "header") {
            return (
              <div className="ctx-header" key={index}>
                {entry.label}
              </div>
            );
          }

          if (entry.kind === "submenu") {
            const isOpen = open?.index === index;
            return (
              <button
                key={index}
                className={isOpen ? "ctx-item has-sub open" : "ctx-item has-sub"}
                role="menuitem"
                aria-haspopup="menu"
                aria-expanded={isOpen}
                data-index={index}
                disabled={entry.disabled}
                onMouseEnter={(e) => {
                  if (entry.disabled) return;
                  scheduleOpen(index, e.currentTarget);
                }}
                onMouseLeave={() => {
                  // Alt menüye geçmek için imleç bu satırdan çıkıyor; menü
                  // kendi üzerine gelindiğinde açık kalıyor (aşağıdaki panelin
                  // onMouseEnter'ı zamanlayıcıyı iptal ediyor).
                  if (timer.current !== null) window.clearTimeout(timer.current);
                }}
                onClick={(e) => {
                  // Tıklama da açsın: dokunmatik ve klavye için gerekli.
                  e.stopPropagation();
                  if (isOpen) closeSub();
                  else scheduleOpen(index, e.currentTarget);
                }}
              >
                <span className="ctx-mark" />
                <span className="ctx-label">{entry.label}</span>
                <span className="ctx-sub-arrow">
                  <ChevronIcon open={false} size={11} />
                </span>
              </button>
            );
          }

          if (entry.kind === "check") {
            return (
              <button
                key={index}
                className="ctx-item"
                role="menuitemcheckbox"
                aria-checked={entry.checked}
                onMouseEnter={closeSub}
                onClick={() => {
                  entry.run();
                  onClose();
                }}
              >
                <span className="ctx-mark">{entry.checked ? "✓" : ""}</span>
                <span className="ctx-label">{entry.label}</span>
                {entry.hint && <span className="ctx-hint">{entry.hint}</span>}
              </button>
            );
          }

          return (
            <button
              key={index}
              className={entry.danger ? "ctx-item danger" : "ctx-item"}
              role="menuitem"
              disabled={entry.disabled}
              onMouseEnter={closeSub}
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

      {open !== null && openEntry?.kind === "submenu" && (
        <div
          className="ctx-sub-wrap"
          onMouseEnter={() => {
            if (timer.current !== null) window.clearTimeout(timer.current);
          }}
          onMouseLeave={closeSub}
        >
          <MenuPanel
            entries={openEntry.entries}
            pos={{ x: open.x, y: open.y }}
            onClose={onClose}
            onBack={() => {
              closeSub();
              panelRef.current
                ?.querySelector<HTMLButtonElement>(`button.ctx-item[data-index="${open.index}"]`)
                ?.focus();
            }}
          />
        </div>
      )}
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
