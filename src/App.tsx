import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { CommandPalette } from "./components/CommandPalette";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { GroupSidebar } from "./components/GroupSidebar";
import { HistoryRecall } from "./components/HistoryRecall";
import { SettingsDialog } from "./components/SettingsDialog";
import { SidePanel } from "./components/SidePanel";
import { StatusBar } from "./components/StatusBar";
import { SuggestionBar } from "./components/SuggestionBar";
import { TabBar } from "./components/TabBar";
import { TerminalArea } from "./components/TerminalArea";
import { TransferDialog } from "./components/TransferDialog";
import { WindowControls } from "./components/WindowControls";
import { useT, useLang } from "./lib/i18n";
import { api } from "./lib/ipc";
import { matchCombo, prettyCombo } from "./lib/keys";
import { isMac } from "./lib/platform";
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

  const t = useT();
  const key = (action: string) => prettyCombo(settings.keybindings[action] ?? "");

  const [closing, setClosing] = useState(false);
  // Kapanış durumu ayrıca ref'te: kapatma dinleyicisi bir kez kuruluyor ve
  // durumu ÇAĞRI ANINDA okuması gerekiyor, closure'dan değil.
  const closingRef = useRef(false);
  const bootstrapped = useRef(false);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    void bootstrap();
  }, [bootstrap]);

  // Menü çubuğu / bildirim alanı simgesinin menüsü de arayüz dilini izlesin.
  //
  // Simge açılışta Rust tarafındaki metinlerle kuruluyor (o an sözlük henüz
  // yüklenmemiş oluyor); dil değişince burası güncelliyor. Olmasaydı menü,
  // uygulama yeniden başlatılana kadar eski dilde kalırdı.
  const lang = useLang();
  useEffect(() => {
    void api.trayLabels(t("tray.show"), t("tray.quit")).catch(() => {});
  }, [lang, t]);

  // Açılışta aktif grubun hiç sekmesi yoksa bir tane aç: boş pencere ile
  // karşılaşmak kimsenin istediği şey değil.
  useEffect(() => {
    if (!ready) return;
    const store = useStore.getState();
    const group = store.groups.find((g) => g.id === store.activeGroupId);
    if (group && group.tabs.length === 0) store.addTab({ groupId: group.id });
  }, [ready, activeGroupId, groups.length]);

  /*
   * Pencere kapatılırken tüm durumu diske yaz, sonra kapatma kararını uygula.
   *
   * Karar BURADA ve tek yerde. Rust tarafında da bir `CloseRequested` kancası
   * denendi ve hiç çalışmadı: buradaki `destroy()` kapatma isteğini tümden
   * atlıyor, yani Rust'ın `prevent_close()` çağrısının bir hükmü kalmıyordu.
   * "Arka planda kal" ayarı seçiliyken bile uygulama kapanıyordu — kullanıcının
   * bildirdiği hata buydu. İki kancadan biri kalmalıydı; durumu diske yazan
   * taraf burası olduğu için karar da burada.
   */
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    const window_ = getCurrentWindow();
    void window_
      .onCloseRequested(async (event) => {
        if (closingRef.current) return;
        event.preventDefault();

        // Ayar ÇAĞRI ANINDA okunuyor, closure'dan değil: dinleyici yalnızca
        // bir kez kuruluyor (aşağıdaki boş bağımlılık listesi), dolayısıyla
        // ayarı yakalamak onu dondurmak olurdu.
        //
        // Dinleyicinin bir kez kurulması da bilinçli: `onCloseRequested` bir
        // söz döndürüyor ve bağımlılık her değiştiğinde etki yeniden koşuyordu.
        // Söz çözülmeden temizlik çalışırsa `unlisten` henüz tanımsız oluyor,
        // yani ESKİ dinleyici kaldırılmadan yenisi ekleniyordu.
        if (useStore.getState().settings.behavior.closeAction === "background") {
          // Arka planda kal: pencere YOK EDİLMİYOR, gizleniyor. Kabuk
          // süreçleri ve ekran çıktısı olduğu gibi kalıyor; menü çubuğu /
          // bildirim alanı simgesinden geri çağrıldığında çalışan komut
          // kaldığı yerden görünür.
          //
          // `finally`: kaydetme bir sebeple düşerse bile pencere gizlenmeli.
          // Aksi halde kapatma düğmesi hiçbir şey yapmıyor gibi görünüyor.
          try {
            await flushAllState();
          } finally {
            await window_.hide();
          }
          return;
        }

        closingRef.current = true;
        setClosing(true);
        try {
          await flushAllState();
        } finally {
          await window_.destroy();
        }
      })
      .then((fn) => {
        // Etki sökülmüşse dinleyiciyi hemen bırak: yoksa sızıyor.
        if (disposed) fn();
        else unlisten = fn;
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

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
      // Onay penceresi de bir ortu: acikken kisayollar islememeli, yoksa
      // Ctrl+W onay beklerken ikinci bir kapatma istegi baslatir.
      const anyOverlayOpen =
        store.ui.settingsOpen ||
        store.ui.transferOpen ||
        store.ui.paletteOpen ||
        store.ui.searchOpen ||
        store.ui.confirm !== null;

      // Örtüler açıkken Esc kapatsın, gerisi örtünün kendi işi.
      if (event.key === "Escape") {
        // Onay penceresi Esc'yi kendisi ele aliyor (capture fazinda).
        if (store.ui.confirm) return;
        if (store.ui.suggest) return store.closeSuggestions();
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

      // Ctrl+C terminalde iki isi de yapmak zorunda: secim varsa kopyalar,
      // yoksa kabuga SIGINT olarak gecer. Karar SENKRON veriliyor
      // (hasSelection senkron) cunku preventDefault'u burada vermek sart -
      // asenkron bekleseydik tus xterm'e ulasip  gonderilirdi.
      if (
        inTerminal &&
        event.ctrlKey &&
        !event.shiftKey &&
        !event.altKey &&
        event.key.toLowerCase() === "c" &&
        session &&
        // Ayar, seçim ve platform kararı oturumda: mac'te bu her zaman false
        // (kopyalama orada Cmd+C). Burada tekrar yazmak, iki tarafın
        // ayrışması hâlinde tuşun yutulup SIGINT'in kaybolmasına yol açardı.
        session.wantsCtrlCCopy()
      ) {
        return run(() => {
          void session.copyForCtrlC().then((result) => {
            if (result === "failed") store.toast(t("common.clipboardFailed"), "err");
          });
        });
      }

      // Komut önerisi listesi açıkken ok tuşları LISTEDE geziniyor.
      //
      // Bunu yapmak güvenli çünkü liste yalnızca kullanıcı bir şey yazmışken
      // ve eşleşme varken açılıyor: boş satırda liste kapalı olduğu için
      // yukarı ok kabuğun kendi geçmişine gidiyor. Aksi bir tasarım (okları
      // her zaman yakalamak) kabuğun geçmiş gezinmesini bozardı.
      //
      // Enter ve Tab bilinçli olarak yakalanmıyor: Enter komutu çalıştırmalı,
      // Tab kabuğun tamamlamasına gitmeli.
      const suggest = store.ui.suggest;
      if (
        inTerminal &&
        suggest &&
        suggest.items.length > 0 &&
        !event.ctrlKey &&
        !event.altKey &&
        // Cmd de dışarıda: mac'te Cmd+↑/↓ metin gezinme tuşları, onları
        // öneri listesine yönlendirmek beklenmedik olur.
        !event.metaKey
      ) {
        if (event.key === "ArrowUp") return run(() => store.moveSuggestion(1));
        if (event.key === "ArrowDown") return run(() => store.moveSuggestion(-1));
        if (event.key === "ArrowRight") return run(() => store.acceptSuggestion());
        if (event.key === "Enter" || event.key === "Tab") {
          store.closeSuggestions();
          // preventDefault YOK: tuş kabuğa gitmeye devam etsin.
        }
      }

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
      if (matchCombo(event, keys.toggleViewMode)) return run(() => void store.toggleViewMode());
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

      // Ctrl+1..9 (mac'te Cmd+1..9): gruptaki n. sekmeye geç.
      //
      // Bu kısayol ayarlanabilir listede değil, o yüzden değiştiriciyi burada
      // seçiyoruz. mac'te Ctrl+<rakam> kabuğa ait değil ama Cmd sistem geneli
      // kural ve diğer kısayollarla tutarlı olması gerekiyor.
      const tabMod = isMac() ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
      if (tabMod && !event.shiftKey && !event.altKey && /^[1-9]$/.test(event.key)) {
        return run(() => store.selectTabByIndex(Number(event.key) - 1));
      }
    };

    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
  }, [ready, settings.keybindings]);

  if (!ready) {
    return <div className="hint">{t("app.loading")}</div>;
  }

  if (bootError) {
    return (
      <div className="hint">
        <p className="err-text">{t("app.bootFailed")}</p>
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
        {/* Baslik cubugunda TEK eylem: Ayarlar.
         *
         * Buradan cikanlar ve nereye gittikleri:
         *   Yeni sekme  -> sekme cubugundaki "+" (ayrica Ctrl+T, komut paleti)
         *   Yeni grup   -> kenar cubugundaki "+" (ayrica Ctrl+Shift+N, palet)
         *   Aktar       -> Ayarlar penceresinin altindaki "Ice / disa aktar…"
         *   Gecmis      -> durum cubugu
         *   Favoriler   -> durum cubugu
         *
         * Hicbiri erisilemez olmadi; ikisi de zaten baska yerde vardi ve
         * baslik cubugu bir eylem cubugu degil. */}
        <button
          className="icon-btn"
          title={t("app.settingsTitle", { keys: key("settings") })}
          onClick={() => setUi({ settingsOpen: true })}
        >
          {t("app.settings")}
        </button>

        <div className="drag" data-tauri-drag-region />

        {/* Pencere dugmeleri en sagda ve kosenin ta kendisine dayali; yerel
            baslik cubugu kapali (`decorations: false`) oldugu icin onun isini
            bu cubuk devraldi. macOS'ta hic cizilmiyor - orada trafik isiklari
            yerel kaliyor. */}
        <WindowControls />
      </div>

      <GroupSidebar />

      <div className="main">
        <TabBar />
        <TerminalArea />
        <SuggestionBar />
        {ui.historyOpen && <SidePanel />}
        <StatusBar />
      </div>

      {ui.paletteOpen && <CommandPalette />}
      {ui.searchOpen && <HistoryRecall />}
      {ui.settingsOpen && <SettingsDialog />}
      {ui.transferOpen && <TransferDialog />}

      <ConfirmDialog />

      {ui.toast && <div className={`toast ${ui.toast.tone}`}>{ui.toast.text}</div>}

      {closing && <div className="toast">{t("app.savingState")}</div>}
    </div>
  );
}

