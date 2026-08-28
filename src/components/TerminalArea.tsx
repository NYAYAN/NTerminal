import { useEffect, useMemo, useRef, useState } from "react";

import { api } from "../lib/ipc";
import { sessions, useStore } from "../store/useStore";
import { TerminalFind } from "./TerminalFind";

/**
 * Tek bir sekmenin terminal barındırıcısı.
 *
 * xterm bir örnek için `open()` yalnızca bir kez çağrılabildiği için, DOM
 * düğümü sekme yaşadığı sürece yerinde kalıyor. Görünmeyen sekmeler
 * `visibility: hidden` ile saklanıyor ama düzenden çıkarılmıyor: `display:none`
 * yapsak xterm'in ölçüm hesabı sıfırlanır ve sekmeye dönüldüğünde satırlar kayar.
 */
function TerminalHost({ tabId, epoch, visible }: { tabId: string; epoch: number; visible: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const booted = useRef(false);

  useEffect(() => {
    booted.current = false;
  }, [epoch]);

  useEffect(() => {
    if (booted.current) return;
    const host = ref.current;
    if (!host) return;
    booted.current = true;

    let cancelled = false;
    void (async () => {
      const store = useStore.getState();
      const session = await store.ensureSession(tabId);
      if (!session || cancelled) return;

      session.attach(host);

      // Önceki oturumun ekran çıktısı: kabuk başlamadan önce yazılıyor ki
      // kullanıcı "kaldığı yeri" doğrudan görsün.
      let restore: string | null = null;
      const tab = store.groups.flatMap((g) => g.tabs).find((t) => t.id === tabId);
      if (tab?.hasScrollback && store.settings.behavior.restoreScrollback) {
        restore = await api.scrollbackLoad(tabId).catch(() => null);
      }
      if (cancelled) return;

      await session.start(restore);
      if (!cancelled) session.setActive(visible);
    })();

    return () => {
      cancelled = true;
    };
    // visible bilerek bağımlılık değil: ilk kurulumda kullanılıyor, sonrası
    // aşağıdaki setActive efektinden yönetiliyor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId, epoch]);

  return <div className="term-host" data-visible={visible} ref={ref} />;
}

export function TerminalArea() {
  const groups = useStore((s) => s.groups);
  const activeGroupId = useStore((s) => s.activeGroupId);
  const exited = useStore((s) => s.exited);
  const findOpen = useStore((s) => s.ui.findOpen);
  const sessionEpoch = useStore((s) => s.sessionEpoch);

  const [mounted, setMounted] = useState<string[]>([]);

  const activeGroup = groups.find((g) => g.id === activeGroupId);
  const activeTabId = activeGroup?.activeTabId ?? activeGroup?.tabs[0]?.id ?? null;

  const liveTabIds = useMemo(
    () => new Set(groups.flatMap((g) => g.tabs.map((t) => t.id))),
    [groups],
  );

  // Aktif sekmeyi listeye ekle, kapatılanları çıkar. Bir kez bağlanan sekme
  // bağlı kalıyor: geri dönüldüğünde tampon ve kaydırma konumu korunsun.
  useEffect(() => {
    setMounted((prev) => {
      const filtered = prev.filter((id) => liveTabIds.has(id));
      const next =
        activeTabId && !filtered.includes(activeTabId) ? [...filtered, activeTabId] : filtered;
      const same = next.length === prev.length && next.every((id, i) => id === prev[i]);
      return same ? prev : next;
    });
  }, [activeTabId, liveTabIds]);

  // WebGL bağlamını ve odağı yalnızca görünen terminal tutsun.
  useEffect(() => {
    for (const [id, session] of sessions) {
      session.setActive(id === activeTabId);
    }
  }, [activeTabId, mounted]);

  if (!activeGroup || activeGroup.tabs.length === 0) {
    return (
      <div className="empty-state">
        <p>Bu grupta sekme yok.</p>
        <p>
          <kbd>Ctrl</kbd> + <kbd>T</kbd> ile yeni sekme açın.
        </p>
        <button className="primary" onClick={() => useStore.getState().addTab()}>
          Yeni sekme
        </button>
      </div>
    );
  }

  return (
    <div className="terminal-area">
      {mounted.map((tabId) => (
        <TerminalHost
          key={`${tabId}:${sessionEpoch[tabId] ?? 0}`}
          tabId={tabId}
          epoch={sessionEpoch[tabId] ?? 0}
          visible={tabId === activeTabId}
        />
      ))}

      {findOpen && <TerminalFind />}

      {activeTabId && exited[activeTabId] && (
        <div
          style={{
            position: "absolute",
            bottom: 12,
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "var(--surface-alt)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "7px 12px",
            zIndex: 3,
            boxShadow: "0 8px 24px rgba(0,0,0,.45)",
          }}
        >
          <span className="dim">Bu sekmedeki kabuk kapandı.</span>
          <button
            className="primary"
            onClick={() => void useStore.getState().restartTab(activeTabId)}
          >
            Yeniden başlat
          </button>
          <button
            className="outline"
            onClick={() => void useStore.getState().closeTab(activeTabId)}
          >
            Sekmeyi kapat
          </button>
        </div>
      )}
    </div>
  );
}
