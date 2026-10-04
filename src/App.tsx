import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { CommandPalette } from "./components/CommandPalette";
import { FilePalette } from "./components/FilePalette";
import { FolderIcon, SearchIcon, SidebarIcon } from "./components/Icons";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { FilePanel } from "./components/FilePanel";
import { GroupSidebar } from "./components/GroupSidebar";
import { HistoryRecall } from "./components/HistoryRecall";
import { SettingsDialog } from "./components/SettingsDialog";
import { SidePanel } from "./components/SidePanel";
import { CommandInput } from "./components/CommandInput";
import { BranchPicker } from "./components/BranchPicker";
import { ContextBar } from "./components/ContextBar";
import { DirPicker } from "./components/DirPicker";
import { NodePicker } from "./components/NodePicker";
import { RunningLinks } from "./components/RunningLinks";
import { StatusBar } from "./components/StatusBar";
import { SuggestionBar } from "./components/SuggestionBar";
import { TabBar } from "./components/TabBar";
import { TerminalArea } from "./components/TerminalArea";
import { StashDialog } from "./components/StashDialog";
import { TransferDialog } from "./components/TransferDialog";
import { WindowControls } from "./components/WindowControls";
import { frameMonitor } from "./lib/health";
import { useT, useLang } from "./lib/i18n";
import { api, onOpenFile, onSessionEnd } from "./lib/ipc";
import { isNativeCopyKey, pageSelectionText } from "./lib/focus";
import { matchCombo, prettyCombo } from "./lib/keys";
import { isMac } from "./lib/platform";
import { DELETE_SUGGESTION_KEY } from "./lib/suggest";
import { flushAllState, useStore } from "./store/useStore";

export function App() {
  const ready = useStore((s) => s.ready);
  const bootError = useStore((s) => s.bootError);
  const bootstrap = useStore((s) => s.bootstrap);
  const groups = useStore((s) => s.groups);
  const activeGroupId = useStore((s) => s.activeGroupId);
  const settings = useStore((s) => s.settings);
  const nodeEnv = useStore((s) => s.nodeEnv);
  const setUi = useStore((s) => s.setUi);
  const sidebarCollapsed = settings.appearance.sidebarCollapsed;

  /*
   * `ui` nesnesinin TAMAMINA abone OLMUYORUZ, alan alan abone oluyoruz.
   *
   * ÖLÇÜLEN SORUN: `useStore((s) => s.ui)` diyorduk ve `setUi` her çağrıda
   * yeni bir nesne üretiyor (`{ ...ui, ...patch }`). Sonuç: HANGİ alan
   * değişirse App ve altındaki bütün ağaç yeniden çiziliyordu — sekme çubuğu,
   * terminal alanı, blok katmanı dâhil.
   *
   * En sıcak yol yazmaktı: `ui.suggest` her tuş vuruşunda güncelleniyor, yani
   * komut kutusuna yazarken tuş başına bir App çizimi düşüyordu. Oysa App'in
   * çiziminde `suggest` HİÇ kullanılmıyor.
   *
   * Aşağıdaki alanlar App'in gerçekten okuduğu alanlar. Artık `suggest`,
   * `confirm`, `findOpen`, `panelMode`, `viewerPath`, `gitExpanded`,
   * `gitShowPaths`, `renamingTabId`, `editingGroupId` ve `settingsSection`
   * değişimleri App'i uyandırmıyor; onları okuyan bileşenler kendileri abone.
   *
   * Geri çağrılardaki `store.ui.*` okumaları (kısayol işleyicisi) `getState()`
   * üzerinden ve abonelik kurmuyor — onlar olduğu gibi kalıyor.
   */
  const treeOpen = useStore((s) => s.ui.treeOpen);
  const historyOpen = useStore((s) => s.ui.historyOpen);
  const paletteOpen = useStore((s) => s.ui.paletteOpen);
  const filePaletteOpen = useStore((s) => s.ui.filePaletteOpen);
  const searchOpen = useStore((s) => s.ui.searchOpen);
  const dirPicker = useStore((s) => s.ui.dirPicker);
  const branchPicker = useStore((s) => s.ui.branchPicker);
  const settingsOpen = useStore((s) => s.ui.settingsOpen);
  const transferOpen = useStore((s) => s.ui.transferOpen);
  const stashDialog = useStore((s) => s.ui.stashDialog);
  const nodePicker = useStore((s) => s.ui.nodePicker);
  const toast = useStore((s) => s.ui.toast);
  const appVersion = useStore((s) => s.appVersion);

  const t = useT();
  const key = (action: string) => prettyCombo(settings.keybindings[action] ?? "");

  const [closing, setClosing] = useState(false);
  // Kapanış durumu ayrıca ref'te: kapatma dinleyicisi bir kez kuruluyor ve
  // durumu ÇAĞRI ANINDA okuması gerekiyor, closure'dan değil.
  const closingRef = useRef(false);

  /*
   * Açılış verisi DEPONUN durumuna bağlı, bir ref'e değil.
   *
   * ÖLÇÜLEN HATA: geliştirme kipinde `useStore.ts` düzenlenince uygulama
   * "N-Terminal yükleniyor…" ekranında sonsuza kadar kaldı. Zincir şöyleydi:
   * Vite depo modülünü sıcak değiştiriyor ve depo `ready: false` ile SIFIRDAN
   * kuruluyor; `App` ise yerinde kalıyor (Fast Refresh bileşen durumunu ve
   * ref'leri koruyor). Eski hâlde bir `bootstrapped` ref'i "bir kez koştum"
   * diyordu — yeni depo için hiç koşmamıştı. `bootstrap()` bir daha
   * çağrılmıyor, `ready` hiç `true` olmuyor, ekranda yükleme yazısı.
   *
   * Aynı belirti yanlış yere yazılabilirdi ("ikinci örnek kilit tutuyor",
   * "`app_bootstrap` dönmüyor"); Rust tarafı yalnızca iki kilit alıp klonluyor,
   * takılacak bir şeyi yok. Kaynak buradaki koruma.
   *
   * Koruma artık `ready`: açılış bitmediyse koş, bittiyse koşma. Çift çağrı
   * yine yok — `ready` bir kez `true` oluyor ve `bootstrap()` başarısızlığı da
   * `ready: true` + `bootError` yazıyor (bkz. depo), yani hata döngüsü de yok.
   */
  useEffect(() => {
    if (ready) return;
    void bootstrap();
  }, [ready, bootstrap]);

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

  /*
   * Oturum sonu (Windows Installer, oturum kapatma): yalnızca son kaydı yaz.
   *
   * Kapatma kararı burada DEĞİL ve olamaz: sistem uygulamayı kapatıyor. Rust
   * tarafı isteği yakalıyor, bu kaydı bekliyor ve süreci kendisi bitiriyor;
   * ayrıntısı `onSessionEnd` ve `session_end.rs` içinde. Dinleyici kapatma
   * dinleyicisiyle aynı nedenle bir kez kuruluyor.
   */
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void onSessionEnd(flushAllState).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  /*
   * Fark penceresindeki "Jump to Source" dosyayı BURADA açtırıyor.
   *
   * Görüntüleyicinin durumu bu pencerenin deposunda; fark penceresi ayrı bir
   * sayfa ve ona dokunamıyor. Rust ana pencereyi öne getirip olayı gönderiyor,
   * burası yalnızca dosyayı açıyor (bkz. `mainWindowOpenFile`).
   */
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void onOpenFile((path) => useStore.getState().openFile(path)).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  /*
   * Kare ölçümü açılışta başlıyor ve hiç durmuyor.
   *
   * Bir düğmenin arkasında olamaz: ölçmek istediğimiz şey donmanın KENDİSİ ve
   * donmuş bir uygulamada kullanıcı hiçbir düğmeye basamıyor. Sonda o yüzden
   * hep açık ve takılmaları halka tamponda tutuyor — donma geçtikten sonra da
   * elde sayı kalıyor (gerekçenin tamamı `lib/health.ts` içinde).
   *
   * Bedeli kare başına iki çıkarma ve iki dizi yazımı; `ready`i beklemiyor,
   * çünkü açılışın kendisi de ölçülmeye değer.
   */
  useEffect(() => {
    frameMonitor.start();
    return () => frameMonitor.stop();
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

  /*
   * WebView2'nin KENDİ sağ tık menüsünü kapat.
   *
   * ÖLÇÜLEN SORUN: terminalin dışında bir yere sağ tıklamak tarayıcı menüsünü
   * açıyordu — Geri, Yenile, Farklı kaydet, Yazdır, İncele. Bunların hiçbiri
   * bir terminalde anlamlı değil; "Yenile" ise doğrudan zararlı: uygulamayı
   * yeniden yükleyip bütün sekmeleri düşürüyor.
   *
   * Uygulamanın kendi menüsü olan yerler (sekme, grup, geçmiş, favoriler,
   * terminal) varsayılanı zaten kendileri engelliyor; bu kural geri kalan her
   * yeri kapsıyor.
   *
   * METİN ALANLARI MUAF: orada menü kes/kopyala/yapıştır veriyor ve bu gerçek
   * bir iş. Tümden kapatmak, ayarlardaki bir alana yapıştırma yolunu elden
   * alırdı.
   */
  useEffect(() => {
    const onContextMenu = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea")) return;
      event.preventDefault();
    };
    document.addEventListener("contextmenu", onContextMenu);
    return () => document.removeEventListener("contextmenu", onContextMenu);
  }, []);

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
        store.ui.filePaletteOpen ||
        store.ui.searchOpen ||
        store.ui.stashDialog !== null ||
        store.ui.confirm !== null;

      // Örtüler açıkken Esc kapatsın, gerisi örtünün kendi işi.
      if (event.key === "Escape") {
        // Onay penceresi Esc'yi kendisi ele aliyor (capture fazinda). Stash
        // penceresi de: o, is surerken Esc'yi bilerek yok sayiyor.
        if (store.ui.confirm || store.ui.stashDialog) return;
        if (store.ui.suggest) return store.closeSuggestions();
        if (store.ui.findOpen) return store.setUi({ findOpen: false });
        if (store.ui.paletteOpen) return store.setUi({ paletteOpen: false });
        if (store.ui.filePaletteOpen) return store.setUi({ filePaletteOpen: false });
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
      /*
       * Uygulamanın komut satırı bir `textarea` ama SIRADAN bir metin kutusu
       * DEĞİL: terminalin girdi satırı, yani kısayolların asıl çalışması
       * gereken yer.
       *
       * ÖLÇÜLEN BELİRTİ: Ctrl+P tarayıcının yazdırma penceresini açıyordu.
       * Sebep bu satırdı — odak kutuda olduğu için işleyici tümden çıkıyor,
       * `preventDefault` hiç çağrılmıyor ve tarayıcının varsayılanı kazanıyor.
       * Aynı sebeple Ctrl+T, Ctrl+W, Ctrl+Shift+P de kutuya yazarken ölüydü;
       * yani neredeyse her zaman.
       *
       * Dinleyici capture fazında olduğu için burada ele alınan tuş kutuya hiç
       * ulaşmıyor (`run` içinde `stopPropagation`); kutunun kendi tuşları
       * (Enter, Tab, oklar, kopyala/yapıştır kısayolları) burada bir eşleşme
       * bulmadığı için dokunulmadan geçiyor. Ctrl+C de öyle: aşağıdaki iki
       * basışlı durdurma dalı kutuyu terminalin kendisi gibi dışarıda
       * bırakıyor (`shellCtrlC`), kararı kutu veriyor.
       */
      const inCommandInput = !!target?.closest(".command-input");
      if (!inTerminal && !inCommandInput && target?.closest("input, textarea, select")) {
        return;
      }

      const run = (fn: () => void) => {
        event.preventDefault();
        event.stopPropagation();
        fn();
      };

      /*
       * Sayfada SEÇİLİ METİN varken kopyalama o metnindir.
       *
       * BİLDİRİLEN: Değişiklikler panelindeki git hata kutusunun metnini seçip
       * Cmd+C yapınca kopyalanmıyordu. Aşağıdaki `keys.copy` dalı tuşu HER
       * YERDE yakalayıp terminalin seçimini kopyalıyor ve `preventDefault`
       * veriyordu: sayfadaki seçim panoya hiç gitmiyordu. Daha tehlikelisi,
       * sekmede komut çalışırken aynı Cmd+C durdurmayı silahlandırıyordu —
       * "kopyalama kazanır" kararı (`copyWins`) yalnızca terminale ve komut
       * kutusuna bakıyor.
       *
       * Durdurma dalından ÖNCE: seçim varken basılan kopyalama tuşu bir
       * kopyalama isteği. Tarayıcının kendi tuşunda (mac'te Cmd+C, diğerlerinde
       * Ctrl+C) yoldan çekiliyoruz, tarayıcı kopyalıyor. Ayarlanmış kısayol
       * başka bir tuşsa (Windows'ta Ctrl+Shift+C, tarayıcıda karşılığı yok)
       * seçimi biz yazıyoruz. Terminal ve komut kutusu bu kuralın dışında
       * (bkz. `pageSelectionText`).
       */
      const pageText = !inTerminal && !inCommandInput ? pageSelectionText() : "";
      if (pageText) {
        if (isNativeCopyKey(event, isMac())) return;
        if (matchCombo(event, keys.copy)) {
          return run(() => {
            void navigator.clipboard
              ?.writeText(pageText)
              .catch(() => store.toast(t("common.clipboardFailed"), "err"));
          });
        }
      }

      // Ctrl+C terminalde iki isi de yapmak zorunda: secim varsa kopyalar,
      // yoksa kabuga SIGINT olarak gecer. Karar SENKRON veriliyor
      // (hasSelection senkron) cunku preventDefault'u burada vermek sart -
      // asenkron bekleseydik tus xterm'e ulasip `\x03` gonderilirdi.
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

      /*
       * Ctrl+C ile ÇALIŞAN KOMUTU DURDURMA — İKİ BASIŞ.
       *
       * BİLDİRİLEN HATA: "Komut çalışıyor kısmındayken Ctrl+C ile
       * durduramıyorum." Doğruydu: komut başlayınca komut kutusu kapanıp
       * yerine bir şerit geliyor, odak terminalin DIŞINDA kalıyor ve
       * aşağıdaki `keys.copy` dalı tuşu yutuyordu (mac'te Cmd+C boş bir
       * kopyalama, Windows'ta hiçbir şey). Kabuğa SIGINT gitmiyordu.
       *
       * NEDEN İKİ BASIŞ: aynı tuş kopyalama da demek — Windows'ta her yerde,
       * mac'te Cmd+C olarak. Tek basışta durdurmak, kopyalamak isteyen
       * kullanıcının komutunu keserdi. İlk basış silahlıyor ve şerit
       * "tekrar basın" yazıyor; ikincisi durduruyor.
       *
       * TERMİNALİN İÇİ HARİÇ: orada düz Ctrl+C kabuğun kendi tuşu ve tek
       * basışta gitmeli. Bir terminalde `ng serve`i durdurmak için iki kez
       * basmak, otuz yıllık bir alışkanlığı bozmak olurdu. Burada dışarıda
       * bırakılıyor, aşağıya dokunulmadan geçiyor ve xterm'e ulaşıyor.
       *
       * mac'te Cmd+C de kabul ediliyor: kopyalanacak bir seçim yokken zaten
       * hiçbir şey yapmıyordu, dolayısıyla kaybedilen bir davranış yok.
       *
       * KOMUT KUTUSU DA HARİÇ, terminalle aynı sebeple: komut çalışırken kutu
       * açık kalıyor ve çalışan programın yanıt satırı oluyor — yani artık
       * terminalin girdi satırı orası. Kutunun kendi Ctrl+C kararı var
       * (`resolveCtrlC`: seçim varsa kopyala, yoksa kes); burada yutulsaydı
       * `ng serve`i kutudan durdurmak iki basış isterdi.
       */
      const stopKey =
        event.key.toLowerCase() === "c" &&
        !event.shiftKey &&
        !event.altKey &&
        (event.ctrlKey || (isMac() && event.metaKey));
      // Kabuğun kendi tuşu: terminalde ya da komut kutusunda, düz Ctrl+C.
      const shellCtrlC = (inTerminal || inCommandInput) && event.ctrlKey && !event.metaKey;
      /*
       * Kopyalama yalnızca GERÇEKTEN kopyalama kısayolu basıldığında ve
       * kopyalanacak bir şey varken kazanıyor. Windows'ta Ctrl+C kopyalama
       * kısayolu DEĞİL (o Ctrl+Shift+C), yani orada bu dal hep durdurmaya
       * gidiyor.
       *
       * Kutudaki seçim de sayılıyor: mac'te komut çalışırken kutuda seçilen
       * metni Cmd+C ile kopyalamak isteyenin tuşu, yalnızca ızgaraya
       * bakılsaydı durdurma silahına dönüşürdü. Kopyalamayı kutu kendisi
       * yapıyor (`CommandInput.onKeyDown`).
       */
      const boxSelected =
        inCommandInput &&
        target instanceof HTMLTextAreaElement &&
        target.selectionStart !== target.selectionEnd;
      const copyWins = matchCombo(event, keys.copy) && (!!session?.hasSelection() || boxSelected);
      const runningTab = store.activeTab();
      if (
        stopKey &&
        !shellCtrlC &&
        !copyWins &&
        runningTab &&
        store.running[runningTab.tab.id]
      ) {
        return run(() => {
          if (store.stopArmed === runningTab.tab.id) store.stopRunning(runningTab.tab.id);
          else store.armStop(runningTab.tab.id);
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
        // Kutudaki karşılığıyla aynı tuş (bkz. `CommandInput`); klasör
        // önerileri geçmiş değil, orada tuş kabuğa gidiyor.
        if (suggest.kind !== "dirs" && matchCombo(event, DELETE_SUGGESTION_KEY)) {
          return run(() => void store.deleteSuggestionAt(suggest.index));
        }
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
      // Ctrl+P: bulunulan dizindeki dosyalarda arama. Seçilen yol komut
      // satırının sonuna ekleniyor.
      if (matchCombo(event, keys.filePalette))
        return run(() => store.setUi({ filePaletteOpen: true }));
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
      /*
       * Kopyala / yapıştır KOMUT KUTUSUNDA yakalanmıyor.
       *
       * BİLDİRİLEN HATA: "Bir yazıyı kopyalayıp komut yazın kısmına
       * yapıştırmak istediğimde 'paste' diye bir şey çıkıyor, tıklıyorum bir
       * şey yapmıyor."
       *
       * İki ayrı kusur aynı satırdan geliyordu. Birincisi o düğme: mac'te
       * Cmd+V burada yakalanıp `session.paste()`e gidiyor, o da
       * `navigator.clipboard.readText()` çağırıyor ve WebKit panoyu okumak
       * için kullanıcıdan izin isteyen kendi "Paste" düğmesini çiziyor.
       * İkincisi daha derin: izin verilse bile metin KUTUYA değil kabuğa
       * gidiyordu, çünkü `session.paste()` PTY'ye yazıyor.
       *
       * Kutu zaten bir `textarea`: tarayıcının kendi yapıştırması tam olarak
       * doğru şeyi yapıyor — izin sormuyor (kullanıcı jesti panoyu doğrudan
       * getiriyor), metni imlecin olduğu yere koyuyor. Yapılacak tek şey
       * yoldan çekilmek.
       *
       * KOPYALAMA için bu gerekçe yalnızca YARI doğru ve bir kez yanılttı:
       * Ctrl+V/Cmd+V gibi Ctrl+Shift+V de tarayıcının yerel yapıştırması
       * (düz metin olarak), ama Ctrl+Shift+C'nin — Windows'taki kopyalama
       * kısayolumuz — tarayıcıda hiçbir karşılığı yok. Yoldan çekilince tuş
       * kutuda ölüyordu. Bu yüzden kopyalamayı KUTU kendisi yapıyor
       * (`CommandInput.onKeyDown`, `keys.copy` dalı); burada yine geçiliyor
       * ki oraya ulaşsın.
       */
      if (!inCommandInput && matchCombo(event, keys.copy)) {
        if (session) return run(() => void session.copySelection());
      }
      if (!inCommandInput && matchCombo(event, keys.paste)) {
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
        {/* Baslik cubugunun sol kosesindeki iki GORUNUM dugmesi.
         *
         * Kural "baslik cubugu bir eylem cubugu degil" ve ikisi de ona uyuyor:
         * bunlar bir sey YAPMIYOR, bir bolmeyi acip kapatiyor. Ikisi de
         * baska hicbir yerden acilip kapanamiyor - sekme cubugunda yerleri yok
         * (sekmeye ait degiller), durum cubugunda da yer kalmadi.
         *
         * Siralari duzenin sirasini izliyor: soldaki en soldaki paneli
         * (gruplar), sagdaki onun sagindaki gorunumu (dosya agaci) aciyor. */}

        {/* Grup kenar cubugu.
         *
         * Durum AYARDA tutuluyor, gecici arayuz durumunda degil: cubugu
         * kapatan kullanici uygulamayi yeniden actiginda da kapali bekliyor
         * (bkz. `Appearance.sidebarCollapsed`).
         *
         * `on` sinifi bilincli olarak YOK: kenar cubugu varsayilan olarak acik
         * ve surekli vurgulu duran bir dugme baslik cubugunda gurultu. Durumu
         * zaten cubugun kendisi soyluyor. */}
        <button
          className="icon-btn view-btn"
          title={t(sidebarCollapsed ? "app.sidebarShow" : "app.sidebarHide")}
          aria-pressed={!sidebarCollapsed}
          onClick={() =>
            void useStore.getState().patchAppearance({ sidebarCollapsed: !sidebarCollapsed })
          }
        >
          <SidebarIcon size={13} />
        </button>

        {/* Dosya sutunu: bulunulan dizini GRUPLARIN SAGINDA aciyor.
         *
         * Iki durumlu - acikken ayni dugme kapatiyor. Tek yonlu halinde dugme
         * actigi paneli kapatamiyordu; kapatmak icin panelin kendi "x"
         * dugmesini bulmak gerekiyordu. Burada `on` sinifi VAR: acik olmak
         * varsayilan degil, dolayisiyla vurgu bir bilgi tasiyor.
         *
         * Simge KLASOR: dugme bir agac gorunumu degil, bulunulan dizini
         * aciyor - kullanicinin aradigi sey "dosyalar" ve onun evrensel
         * simgesi klasor. Onceki agac simgesi (dallanan cizgiler) bir veri
         * yapisini anlatiyordu, aranan seyi degil. */}
        <button
          className={treeOpen ? "icon-btn view-btn on" : "icon-btn view-btn"}
          title={t(treeOpen ? "app.filesCloseTitle" : "app.filesTitle")}
          aria-pressed={treeOpen}
          onClick={() => setUi({ treeOpen: !treeOpen })}
        >
          <FolderIcon size={13} />
        </button>

        <div className="brand">
          <span className="mark">&gt;_</span>
          N-Terminal
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

        {/* Arama alani ORTADA: iki yanindaki esnek surukleme alanlari onu
            merkezde tutuyor. Warp'ta da ustte, ortada duruyor. */}
        <div className="drag" data-tauri-drag-region />

        {/* Arama alani: Ctrl+P ile ayni seyi aciyor.
         *
         * Kisayolu bilmek gerekmemeli - Warp'ta da ustte duran bu alan ayni
         * isi yapiyor. Gercek bir metin kutusu DEGIL, dugme: yazmaya baslamak
         * icin paletin kendi kutusu aciliyor ve odak orada. Iki ayri kutu
         * tutmak "hangisine yaziyorum" sorusunu doguruyordu. */}
        <button
          className="titlebar-search"
          title={t("app.searchTitle", { keys: key("filePalette") })}
          onClick={() => setUi({ filePaletteOpen: true })}
        >
          <SearchIcon size={12} />
          <span>{t("app.searchFiles")}</span>
          <span className="kbd">{key("filePalette")}</span>
        </button>

        <div className="drag" data-tauri-drag-region />

        {/* Pencere dugmeleri en sagda ve kosenin ta kendisine dayali; yerel
            baslik cubugu kapali (`decorations: false`) oldugu icin onun isini
            bu cubuk devraldi. macOS'ta hic cizilmiyor - orada trafik isiklari
            yerel kaliyor. */}
        <WindowControls />
      </div>

      {/* Daraltılmışken hiç çizilmiyor: ızgaranın `auto` sütunu sıfıra
          iniyor ve terminal o alanı alıyor. */}
      {!sidebarCollapsed && <GroupSidebar />}

      {/* Dosya sütunu grupların SAĞINDA, terminalin solunda — düzenin sırası
          başlık çubuğundaki düğmelerin sırasıyla aynı. Kapalıyken hiç
          çizilmiyor, `auto` sütunu sıfıra iniyor. */}
      {treeOpen && <FilePanel />}

      <div className="main">
        <TabBar />
        <TerminalArea />
        <ContextBar />
        <RunningLinks />
        <CommandInput />
        <SuggestionBar />
        {historyOpen && <SidePanel />}
        <StatusBar />
      </div>

      {paletteOpen && <CommandPalette />}
      {filePaletteOpen && <FilePalette />}
      {searchOpen && <HistoryRecall />}
      {dirPicker && (
        <DirPicker cwd={dirPicker} onClose={() => useStore.getState().setUi({ dirPicker: null })} />
      )}
      {branchPicker && (
        <BranchPicker
          cwd={branchPicker.cwd}
          current={branchPicker.current}
          onClose={() => useStore.getState().setUi({ branchPicker: null })}
        />
      )}
      {nodePicker && nodeEnv && (
        <NodePicker env={nodeEnv} onClose={() => useStore.getState().setUi({ nodePicker: false })} />
      )}
      {settingsOpen && <SettingsDialog />}
      {transferOpen && <TransferDialog />}
      {stashDialog && <StashDialog cwd={stashDialog.cwd} />}

      <ConfirmDialog />

      {toast && <div className={`toast ${toast.tone}`}>{toast.text}</div>}

      {closing && <div className="toast">{t("app.savingState")}</div>}
    </div>
  );
}

