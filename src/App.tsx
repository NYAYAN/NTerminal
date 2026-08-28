import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { CommandPalette } from "./components/CommandPalette";
import { GroupSidebar } from "./components/GroupSidebar";
import { HistoryRecall } from "./components/HistoryRecall";
import { SettingsDialog } from "./components/SettingsDialog";
import { SidePanel } from "./components/SidePanel";
import { StatusBar } from "./components/StatusBar";
import { TabBar } from "./components/TabBar";
import { TerminalArea } from "./components/TerminalArea";
import { TransferDialog } from "./components/TransferDialog";
import { matchCombo } from "./lib/keys";
import { flushAllState, useStore } from "./store/useStore";

export function App() {
  const ready = useStore((s) => s.ready);
  const bootError = useStore((s) => s.bootError);
  const bootstrap = useStore((s) => s.bootstrap);
  const groups = useStore((s) => s.groups);
  const activeGroupId = useStore((s) => s.activeGroupId);
  const settings = useStore((s) => s.settings);
  const ui = useStore((s) => s.ui);
  const setUi = useStore((s) => s.setUi);
  const appVersion = useStore((s) => s.appVersion);

  const [closing, setClosing] = useState(false);
  const bootstrapped = useRef(false);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    void bootstrap();
  }, [bootstrap]);

  // Açılışta aktif grubun hiç sekmesi yoksa bir tane aç: boş pencere ile
  // karşılaşmak kimsenin istediği şey değil.
  useEffect(() => {
    if (!ready) return;
    const store = useStore.getState();
    const group = store.groups.find((g) => g.id === store.activeGroupId);
    if (group && group.tabs.length === 0) store.addTab({ groupId: group.id });
  }, [ready, activeGroupId, groups.length]);

  // Pencere kapatılırken tüm durumu diske yaz, sonra gerçekten kapat.
  // Kaydetme bitmeden kapatırsak "kaldığı yerden devam" bilgisi kaybolur.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    const window_ = getCurrentWindow();
    void window_
      .onCloseRequested(async (event) => {
        if (closing) return;
        event.preventDefault();
        setClosing(true);
        try {
          await flushAllState();
        } finally {
          await window_.destroy();
        }
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => unlisten?.();
  }, [closing]);

  // Periyodik güvenlik kaydı: uygulama beklenmedik şekilde kapanırsa (güç
  // kesintisi, çökme) en fazla iki dakikalık kayıp olsun.
  useEffect(() => {
    if (!ready) return;
    const timer = window.setInterval(() => {
      void flushAllState();
    }, 120_000);
    return () => window.clearInterval(timer);
  }, [ready]);

  // ------------------------------------------------------------ kısayollar

  useEffect(() => {
    if (!ready) return;

    const handler = (event: KeyboardEvent) => {
      const keys = settings.keybindings;
      const store = useStore.getState();
      const session = store.activeSession();
      const anyOverlayOpen =
        store.ui.settingsOpen || store.ui.transferOpen || store.ui.paletteOpen || store.ui.searchOpen;

      // Örtüler açıkken Esc kapatsın, gerisi örtünün kendi işi.
      if (event.key === "Escape") {
        if (store.ui.findOpen) return store.setUi({ findOpen: false });
        if (store.ui.paletteOpen) return store.setUi({ paletteOpen: false });
        if (store.ui.searchOpen) return store.setUi({ searchOpen: false });
        if (store.ui.settingsOpen) return store.setUi({ settingsOpen: false });
        if (store.ui.transferOpen) return store.setUi({ transferOpen: false });
        return;
      }
      if (anyOverlayOpen) return;

      // Dinleyici capture fazinda: metin kutularinin kendi stopPropagation
      // cagrilari bize ulasmadan once burasi calisiyor. O yuzden odagin bir
      // giris alaninda olup olmadigini kendimiz kontrol ediyoruz - yoksa
      // sekme adini yazarken Ctrl+W sekmeyi kapatir.
      const target = event.target as HTMLElement | null;
      const inTerminal = !!target?.closest(".xterm");
      if (!inTerminal && target?.closest("input, textarea, select")) return;

      const run = (fn: () => void) => {
        event.preventDefault();
        event.stopPropagation();
        fn();
      };

      if (matchCombo(event, keys.newTab)) return run(() => store.addTab());
      if (matchCombo(event, keys.closeTab)) {
        const active = store.activeTab();
        if (active) return run(() => void store.closeTab(active.tab.id));
      }
      if (matchCombo(event, keys.nextTab)) return run(() => store.cycleTab(1));
      if (matchCombo(event, keys.prevTab)) return run(() => store.cycleTab(-1));
      if (matchCombo(event, keys.newGroup)) return run(() => store.addGroup());
      if (matchCombo(event, keys.commandPalette)) return run(() => store.setUi({ paletteOpen: true }));
      if (matchCombo(event, keys.historyPanel))
        return run(() => store.setUi({ historyOpen: !store.ui.historyOpen }));
      if (matchCombo(event, keys.historySearch)) return run(() => store.setUi({ searchOpen: true }));
      if (matchCombo(event, keys.favorites))
        return run(() => store.setUi({ historyOpen: true, panelMode: "favorites" }));
      if (matchCombo(event, keys.settings)) return run(() => store.setUi({ settingsOpen: true }));
      if (matchCombo(event, keys.renameTab)) {
        const active = store.activeTab();
        if (active) return run(() => store.setUi({ renamingTabId: active.tab.id }));
      }
      if (matchCombo(event, keys.toggleLock)) {
        const active = store.activeTab();
        if (active) return run(() => store.toggleTabLock(active.tab.id));
      }
      if (matchCombo(event, keys.clearTerminal)) return run(() => session?.clear());
      if (matchCombo(event, keys.findInTerminal)) return run(() => store.setUi({ findOpen: true }));
      if (matchCombo(event, keys.copy)) {
        if (session) return run(() => void session.copySelection());
      }
      if (matchCombo(event, keys.paste)) {
        if (session) return run(() => void session.paste());
      }
      if (matchCombo(event, keys.zoomIn))
        return run(() =>
          void store.patchAppearance({
            fontSize: Math.min(32, store.settings.appearance.fontSize + 1),
          }),
        );
      if (matchCombo(event, keys.zoomOut))
        return run(() =>
          void store.patchAppearance({
            fontSize: Math.max(8, store.settings.appearance.fontSize - 1),
          }),
        );
      if (matchCombo(event, keys.zoomReset))
        return run(() => void store.patchAppearance({ fontSize: 14 }));

      // Ctrl+1..9: gruptaki n. sekmeye geç.
      if (event.ctrlKey && !event.shiftKey && !event.altKey && /^[1-9]$/.test(event.key)) {
        return run(() => store.selectTabByIndex(Number(event.key) - 1));
      }
    };

    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
  }, [ready, settings.keybindings]);

  // Sağ tık ile yapıştırma: xterm'in kendi menüsü yok, biz sağlıyoruz.
  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (!settings.behavior.pasteOnRightClick) return;
      const target = event.target as HTMLElement | null;
      if (!target?.closest(".term-host")) return;
      event.preventDefault();
      const session = useStore.getState().activeSession();
      void session?.paste();
    };
    window.addEventListener("contextmenu", handler);
    return () => window.removeEventListener("contextmenu", handler);
  }, [settings.behavior.pasteOnRightClick]);

  if (!ready) {
    return <div className="hint">NTerminal yükleniyor…</div>;
  }

  if (bootError) {
    return (
      <div className="hint">
        <p className="err-text">NTerminal başlatılamadı</p>
        <p className="mono">{bootError}</p>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="titlebar" data-tauri-drag-region>
        <div className="brand">
          <span className="mark">&gt;_</span>
          NTerminal
          <span className="version">{appVersion}</span>
        </div>
        <button className="icon-btn" title="Yeni sekme (Ctrl+T)" onClick={() => useStore.getState().addTab()}>
          + Sekme
        </button>
        <button
          className="icon-btn"
          title="Yeni grup (Ctrl+Shift+N)"
          onClick={() => useStore.getState().addGroup()}
        >
          + Grup
        </button>
        <div className="drag" data-tauri-drag-region />
        <button
          className={ui.historyOpen && ui.panelMode === "history" ? "icon-btn on" : "icon-btn"}
          title="Komut geçmişi (Ctrl+Shift+H)"
          onClick={() =>
            setUi(
              ui.historyOpen && ui.panelMode === "history"
                ? { historyOpen: false }
                : { historyOpen: true, panelMode: "history" },
            )
          }
        >
          Geçmiş
        </button>
        <button
          className={ui.historyOpen && ui.panelMode === "favorites" ? "icon-btn on" : "icon-btn"}
          title="Favori komutlar (Ctrl+Shift+B)"
          onClick={() =>
            setUi(
              ui.historyOpen && ui.panelMode === "favorites"
                ? { historyOpen: false }
                : { historyOpen: true, panelMode: "favorites" },
            )
          }
        >
          ★ Favoriler
        </button>
        <button
          className="icon-btn"
          title="Ayarları içe/dışa aktar"
          onClick={() => setUi({ transferOpen: true })}
        >
          Aktar
        </button>
        <button className="icon-btn" title="Ayarlar (Ctrl+,)" onClick={() => setUi({ settingsOpen: true })}>
          Ayarlar
        </button>
      </div>

      <GroupSidebar />

      <div className="main">
        <TabBar />
        <TerminalArea />
        {ui.historyOpen && <SidePanel />}
        <StatusBar />
      </div>

      {ui.paletteOpen && <CommandPalette />}
      {ui.searchOpen && <HistoryRecall />}
      {ui.settingsOpen && <SettingsDialog />}
      {ui.transferOpen && <TransferDialog />}

      {ui.toast && <div className={`toast ${ui.toast.tone}`}>{ui.toast.text}</div>}

      {closing && <div className="toast">Durum kaydediliyor…</div>}
    </div>
  );
}

