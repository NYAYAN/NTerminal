import { useEffect, useState } from "react";

import { api } from "../lib/ipc";
import { sessions, useStore } from "../store/useStore";

export function StatusBar() {
  const groups = useStore((s) => s.groups);
  const activeGroupId = useStore((s) => s.activeGroupId);
  const profiles = useStore((s) => s.settings.profiles);
  const running = useStore((s) => s.running);
  const paths = useStore((s) => s.paths);
  const restored = useStore((s) => s.restoredSession);

  const group = groups.find((g) => g.id === activeGroupId);
  const tab = group?.tabs.find((t) => t.id === group.activeTabId) ?? group?.tabs[0];
  const session = tab ? sessions.get(tab.id) : undefined;
  const profile = profiles.find((p) => p.id === tab?.profileId);

  const [historyCount, setHistoryCount] = useState<number | null>(null);

  // Geçmiş sayısı sık değişiyor ama saniyede birkaç kez okumaya değmez.
  useEffect(() => {
    let alive = true;
    const read = () => {
      void api
        .historyStats()
        .then((stats) => {
          if (alive) setHistoryCount(stats.total);
        })
        .catch(() => {});
    };
    read();
    const timer = window.setInterval(read, 5000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  const totalTabs = groups.reduce((sum, g) => sum + g.tabs.length, 0);

  return (
    <div className="statusbar">
      {group && (
        <span className="item">
          <span className="dot" style={{ background: group.color ?? "#666", width: 7, height: 7, borderRadius: "50%" }} />
          {group.name}
        </span>
      )}

      {profile && <span className="item">{profile.name}</span>}

      {tab?.cwd && (
        <span
          className="item cwd"
          title={`${tab.cwd}\n(Dosya Gezgini'nde açmak için tıklayın)`}
          style={{ cursor: "pointer" }}
          onClick={() => void api.revealInExplorer(tab.cwd!).catch(() => {})}
        >
          {tab.cwd}
        </span>
      )}

      <span className="spacer" />

      {tab && running[tab.id] && <span className="pill">komut çalışıyor</span>}

      {session &&
        (session.integration ? (
          <span className="pill ok" title="Kabuk entegrasyonu etkin: komut metni ve çıkış kodu kabuktan geliyor">
            entegrasyon
          </span>
        ) : (
          <span
            className="pill warn"
            title="Kabuk entegrasyonu yok: komutlar ekran tamponundan okunuyor, çıkış kodu bilinmiyor"
          >
            entegrasyon yok
          </span>
        ))}

      {session?.pid != null && (
        <span className="item" title="Kabuk süreç kimliği">
          pid {session.pid}
        </span>
      )}

      {historyCount !== null && (
        <span className="item" title="Kayıtlı komut sayısı">
          {historyCount.toLocaleString("tr-TR")} komut
        </span>
      )}

      <span className="item" title="Toplam sekme">
        {totalTabs} sekme
      </span>

      {paths?.portable && (
        <span className="pill" title={`Ayarlar exe'nin yanındaki klasörde: ${paths.root}`}>
          taşınabilir
        </span>
      )}

      {restored && (
        <span className="pill" title="Önceki oturumun grup ve sekme düzeni geri yüklendi">
          oturum geri yüklendi
        </span>
      )}
    </div>
  );
}
