import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { tokenizeCommand } from "../lib/cmdline";
import { passThroughSequence, resolveInputMode, SIGINT } from "../lib/inputMode";
import { useT } from "../lib/i18n";
import { matchCombo } from "../lib/keys";
import { promptedTabs } from "../lib/promptSeen";
import { sessions, useStore } from "../store/useStore";

/**
 * Komut satırı — terminalin ızgarasının DIŞINDA.
 *
 * ## Neden var
 *
 * Kabuğun çizdiği satır ekranın bir parçası: tekerlekle kaydırınca o da
 * kayıyor, çıktı geldikçe yeri değişiyor. İstenen ise Warp'taki gibi sabit bir
 * yer — "komutu buraya yazarım" diyebileceğiniz, kaydırmadan etkilenmeyen bir
 * kutu. Bunun tek yolu girdiyi ızgaradan çıkarmak.
 *
 * Yazdıklarınız kabuğa Enter'a basana kadar GİTMİYOR. Kabuğun satır
 * düzenleyicisi (PSReadLine, readline) devrede değil; ekranda komut ancak
 * çalışırken beliriyor — kaydırma geçmişinde de doğru yerde duruyor.
 *
 * ## Ne zaman devrede
 *
 * Yalnızca kabuk istemde beklerken. Komut çalışırken, `vim` gibi tam ekran
 * programlarda ve kabuk entegrasyonu olmayan profillerde tuşlar doğrudan
 * terminale gidiyor — o programlar tuşları BİR BİR, o an istiyor. Kararı
 * `lib/inputMode.ts` veriyor; bu bileşen yalnızca sonucunu uyguluyor.
 *
 * ## Tab kutuyu TERK ETMİYOR
 *
 * Eski hâli bir "kaçış kapısı"ydı: Tab metni kabuğa gönderiyor ve kutu o istem
 * boyunca kapanıyordu, tamamlama kabuğun kendi düzenleyicisinde sürsün diye.
 * BİLDİRİLEN HATA: "cd Desktop yazdım ve Tab'a bastım, komut yazma yeri
 * kayboldu, odak üstteki terminale geçti ve komutları oraya yazmaya
 * başladım." Kullanıcı için kutunun kaybolması bir özellik değil arıza —
 * yazdığı yer bir tuşla yer değiştiriyor ve geri gelmiyor.
 *
 * Şimdi Tab kutunun İÇİNDE bir tuş: öneri listesi açıksa seçili satırı kabul
 * ediyor (sağ okla aynı). `cd` için bu kabuğun tamamlamasıyla aynı yürüyüş —
 * `cd Desk` → Tab → `cd Desktop` → liste Desktop'ın içini gösteriyor → Tab
 * bir kat daha iniyor. Liste kapalıysa Tab hiçbir şey yapmıyor ama tarayıcının
 * varsayılanı da engelleniyor: o varsayılan odağı bir sonraki öğeye, yani
 * terminale taşırdı — aynı hatanın başka bir yoldan dönüşü.
 *
 * Kabuğun kendi tamamlaması bu kipte erişilemez; `cd` dışındaki komutlar için
 * bu bir eksik ve kutunun tamamlayıcısı büyüdükçe kapanacak. Kutuyu bir tuşla
 * yok etmekten daha küçük bir eksik.
 */
export function CommandInput() {
  const t = useT();
  const appInput = useStore((s) => s.settings.behavior.appInput);
  const groups = useStore((s) => s.groups);
  const activeGroupId = useStore((s) => s.activeGroupId);
  const allSignals = useStore((s) => s.inputSignals);
  const suggest = useStore((s) => s.ui.suggest);
  // Kutu terminalle AYNI yazı tipinde: yazdığınız komut, bir satır sonra
  // ekranda göreceğiniz komutla aynı görünmeli.
  const appearance = useStore((s) => s.settings.appearance);
  /**
   * Kutunun satır yüksekliği, TAM PİKSEL — ve kutunun yerini alan şeritlerin
   * içerik yüksekliği.
   *
   * BİLDİRİLEN: "yükleniyor bittiğinde ufak bir yükseklik değişmesi oluyor."
   * ÖLÇÜLEN: kutu 33px, şerit 29px. Şeridin metni kendi yazı tipinin doğal
   * satırını alıyordu (16px), kutunun metin alanı 20px'ti. Dolgu ve kenarlık
   * zaten aynıydı; tek ölçüyü ikisine de buradan veriyoruz. Yuvarlama şart:
   * 13px × 1.55 = 20.15px kesirli kalır ve iki öğe hiçbir zaman aynı tam
   * piksele oturmazdı.
   */
  const rowH = Math.round(appearance.fontSize * 1.55);
  const rowStyle = { "--cmd-row-h": `${rowH}px` } as React.CSSProperties;
  const allRunning = useStore((s) => s.running);
  const allExited = useStore((s) => s.exited);
  const stopArmed = useStore((s) => s.stopArmed);
  // Kopyalama kısayolu kutuda KUTU tarafından karşılanıyor (bkz. onKeyDown).
  const keys = useStore((s) => s.settings.keybindings);

  const group = groups.find((g) => g.id === activeGroupId);
  const tab = group?.tabs.find((item) => item.id === group.activeTabId) ?? group?.tabs[0];
  const tabId = tab?.id ?? null;

  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const highlightRef = useRef<HTMLPreElement | null>(null);

  /*
   * Sinyaller OTURUMDAN okunuyor; depodaki kopya yalnızca yeniden çizimi
   * tetikliyor.
   *
   * ÖLÇÜLEN HATA: yalnızca depodaki kopyaya bakılıyordu. O kopya bir OLAYLA
   * yazılıyor ve olay ancak bir DEĞİŞİM olunca geliyor; kaçan ya da durum
   * bilinmeden önce gelen tek bir olay depoyu kalıcı olarak eski bırakıyordu.
   * Belirti: komut kutusu hiç açılmıyor, sekmeyi yeniden başlatmak düzeltiyor.
   */
  const stored = tabId ? allSignals[tabId] : undefined;
  const signals = (tabId ? sessions.get(tabId)?.inputSignals() : undefined) ?? stored;
  const running = tabId ? !!allRunning[tabId] : false;
  /*
   * Kabuk öldü mü — DEPODAN, oturumun bildirdiği sinyallerden değil.
   *
   * Sinyaller kabuğun anlattığı şey; ölü kabuk bir şey anlatmıyor ve son
   * söylediği ("istemde bekliyorum") olduğu yerde kalıyor. Süreç bittiğinde
   * uygulama bunu PTY olayından doğrudan biliyor, kaynağı o.
   */
  const exited = tabId ? !!allExited[tabId] : false;
  // Klavyeden gelen ilk Ctrl+C burayı "tekrar basın" hâline geçiriyor.
  const armed = !!tabId && stopArmed === tabId;
  const mode = resolveInputMode({
    enabled: appInput,
    integration: signals?.integration ?? false,
    atPrompt: signals?.atPrompt ?? false,
    altScreen: signals?.altScreen ?? false,
    exited,
  });
  const active = mode === "app";

  useEffect(() => {
    if (!tabId) return;
    if (active) promptedTabs.add(tabId);
    if (exited) promptedTabs.delete(tabId);
  }, [active, exited, tabId]);

  /*
   * Kabuk henüz ilk istemine gelmedi: kutunun YERİNDE bir yükleniyor şeridi.
   *
   * BİLDİRİLEN İSTEK: "yeni bir sekme oluşturunca komut yazma yeri sonradan
   * geliyor; bence hep olsun, o kısımda ufak bir yükleniyor gösterelim."
   * PowerShell profilini yüklerken bir iki saniye geçiyor ve o sürede alt
   * kenar boştu — kutu sonra beliriyor, düzen zıplıyordu.
   *
   * Şerit PASİF: kip ham kalıyor, tuşlar terminale gidiyor. Kabuk açılışta bir
   * şey sorarsa (parola, onay) cevap verilebilmeli. Entegrasyonu olmayan
   * profil şeridi görmüyor: orada istem sinyali hiç gelmeyecek, sonsuz bir
   * "başlatılıyor" yalan olurdu. Entegrasyon bayrağı süreç açılır açılmaz
   * belli (`SpawnResult.integration`), o yüzden ayrım ilk kareden yapılabiliyor.
   */
  const starting =
    !!tabId &&
    appInput &&
    !exited &&
    !running &&
    !promptedTabs.has(tabId) &&
    (signals === undefined || (signals.integration && !signals.altScreen && !signals.atPrompt));

  // Sekme değişince kutu boşalmalı: yazılan metin O sekmenin kabuğuna ait.
  useEffect(() => {
    setValue("");
  }, [tabId]);

  /**
   * Veri yolunu tek kapıya indir ve odağı doğru yere ver.
   *
   * `setAppInput` xterm'in stdin'ini kapatıyor. Odağın kutuda olduğunu
   * varsaymak yetmiyor: kullanıcı metin seçmek için terminale tıkladığında
   * odak oraya geçiyor ve yazdığı her şey iki yoldan birden kabuğa ulaşırdı.
   */
  useEffect(() => {
    if (!tabId) return;
    const session = sessions.get(tabId);
    if (!session) return;
    session.setAppInput(active);
    if (active) ref.current?.focus();
    else session.focus();

    /*
     * Temizlik ŞART, süs değil.
     *
     * Etki yalnızca ETKİN sekmenin oturumuna dokunuyor. Sekme değiştiğinde
     * yenisi için yeniden koşuyor, ama eskisinin `disableStdin` bayrağı açık
     * kalıyordu — bölme kipinde bu görünür bir kilitlenme: yan bölmeye
     * tıklıyorsunuz, kutu ona ait değil, yazdığınız da hiçbir yere gitmiyor.
     */
    return () => session.setAppInput(false);
  }, [active, tabId]);

  /*
   * Terminale tıklamak odağı kutudan ALMAMALI.
   *
   * ÖLÇÜLEN BELİRTİ: çıktının içine tıklayınca odak xterm'e geçiyordu ve o
   * andan sonra yazılan hiçbir şey hiçbir yere gitmiyordu — kutu odağı
   * kaybetmiş, terminalin stdin'i ise zaten kapalı. Kullanıcı "yazamıyorum"
   * durumuna düşüyor ve sebebi görünmüyor.
   *
   * Seçim yapmak bundan etkilenmiyor: xterm'in seçimi kendi modelinde, odağı
   * bırakınca kaybolmuyor, kopyalama da çalışmaya devam ediyor.
   *
   * `mouseup` seçildi, `mousedown` değil: sürükleyerek seçim yaparken odağı
   * ortada geri almak seçimi yarıda kesiyordu.
   */
  useEffect(() => {
    if (!active) return;
    const onUp = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest(".term-wrap")) return;
      ref.current?.focus();
    };
    document.addEventListener("mouseup", onUp);
    return () => document.removeEventListener("mouseup", onUp);
  }, [active]);

  // Yazdıkça öneri listesi. Kabuğun satırını okumuyoruz artık — metin burada.
  useEffect(() => {
    if (!active) return;
    useStore.getState().updateSuggestions({ prefix: value, full: value, hintTail: false });
  }, [value, active]);

  /**
   * Öneri kabul etme yolu.
   *
   * Ham kipte öneri kabuğa DEL tuşlarıyla yazılıyor (`acceptKeys`). Burada
   * satır kabukta değil, bizde: kutunun içeriğini değiştirmek yeterli. Depo
   * hangi yolu kullanacağını bu kayıttan anlıyor, böylece kabul etme tek
   * yerden (`acceptSuggestionAt`) geçmeye devam ediyor.
   */
  useEffect(() => {
    if (!active) {
      useStore.getState().setAppInputSink(null);
      return;
    }
    useStore.getState().setAppInputSink((text, mode) => {
      // Ekleme kipinde araya boşluk konuyor: `code` + `src/a.ts` birleşip
      // `codesrc/a.ts` olmamalı. Zaten boşlukla bitiyorsa ikincisi eklenmiyor.
      setValue((prev) => {
        if (mode === "replace") return text;
        if (!prev) return text;
        return prev.endsWith(" ") ? prev + text : `${prev} ${text}`;
      });
      ref.current?.focus();
    });
    return () => useStore.getState().setAppInputSink(null);
  }, [active]);

  // Kutu içeriğe göre büyüsün; tek satırlık başlangıç yüksekliği korunuyor.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value, active]);

  /*
   * Komut çalışırken kutu kapanıyor — ama YERİNE bir şerit geliyor.
   *
   * ÖLÇÜLEN SORUN: "Komut yazdım, Enter'a bastım, komut satırı kayboldu.
   * Durdurmak istersem nasıl yapacağım?" Kip doğru çalışıyordu (tuşlar
   * çalışan komuta gitsin diye kutu kapanıyor) ama ekranda bunu söyleyen ve
   * durdurmanın yolunu gösteren hiçbir şey yoktu; kullanıcı kutunun
   * kaybolmasını bir arıza gibi görüyordu.
   *
   * Şerit AYNI yerde duruyor: gözün baktığı yer değişmiyor.
   *
   * Tam ekran programlarda (vim, less) çizilmiyor: orada ekranı program
   * yönetiyor ve Ctrl+C'nin anlamı programın kendisine ait.
   */
  /*
   * Kabuk kapandıysa burada hiçbir şey çizilmiyor.
   *
   * "Durdur" şeridi de yok: durdurulacak bir şey kalmadı. Ne yapılacağını
   * terminalin üstündeki kutu söylüyor (Yeniden başlat / Sekmeyi kapat).
   */
  if (exited) return null;

  if (!active && running && signals?.integration && !signals.altScreen) {
    /*
     * Şerit iki hâlli: sıradan ve SİLAHLI.
     *
     * Silahlı hâl klavyeden gelen ilk Ctrl+C'nin karşılığı. Bir basışın
     * hiçbir şey yapmıyormuş gibi görünmesi, iki basış kuralını kullanıcı
     * gözünde bir arızaya çeviriyordu; şerit tam da bakılan yer olduğu için
     * yanıt burada veriliyor.
     *
     * Düğme TIKLAMAYLA tek seferde durduruyor. İki basış kuralının sebebi
     * tuşun ikinci anlamı (kopyalama); düğmenin ikinci bir anlamı yok.
     */
    return (
      <div className={armed ? "command-running armed" : "command-running"} style={rowStyle}>
        <span className="running-dot" aria-hidden="true" />
        <span className="running-text">
          {armed ? t("input.stopAgain") : t("input.running")}
        </span>
        <span className="spacer" />
        <button
          type="button"
          className="running-stop"
          title={t("input.stopTitle")}
          // Durdurma TEK YERDEN geçiyor (`stopRunning`): Ctrl+C'nin baytı
          // burada elle yazılsaydı, iki tarafın ayrışması hâlinde düğme
          // çalışmayan bir bayt göndermeye başlardı.
          onClick={() => useStore.getState().stopRunning(tabId!)}
        >
          {armed ? t("input.stopAgainShort") : t("input.stop")}
        </button>
      </div>
    );
  }

  if (starting) {
    return (
      <div className="command-running starting" style={rowStyle}>
        <span className="running-dot" aria-hidden="true" />
        <span className="running-text">{t("input.starting")}</span>
      </div>
    );
  }

  /*
   * İstem ÇİZİLİYOR: kutu kapalı ama SATIR YERİNDE KALIYOR.
   *
   * ÖLÇÜLEN HATA: `cd` yazıp Enter'a basınca terminal metni bir zıplayıp geri
   * dönüyordu — "flash".
   *
   * KÖK NEDEN bu daldı. Kabuk komutu bitirince `133;D` geliyor (`running`
   * kapanıyor) ama "istemdeyim" (`133;B`) ancak PS1 tümüyle yazıldıktan sonra.
   * Arada kutu da şerit de çizilmiyordu, yani `input` ızgara satırı 0'a
   * iniyordu: terminal ~36px büyüyor → `ResizeObserver` → `fit()` → PTY'ye
   * YENİ satır sayısı → kabuk istemi yeniden çiziyor. `133;B` gelince satır
   * geri geliyor ve aynı zincir ters yönde bir kez daha işliyor. Kullanıcının
   * gördüğü iki ölçülendirme arasındaki sıçramaydı.
   *
   * `cd`de en görünür olması rastlantı değil: ekranda onu örtecek çıktı yok ve
   * dizin değişince istem (git bilgisi okuyan temalarda) daha yavaş çiziliyor,
   * yani aradaki boşluk bir kareyi aşıyor.
   *
   * Şerit BOŞ: "başlatılıyor" yazmak yanlış olurdu (kabuk çoktan açık) ve
   * yanıp sönen bir nokta komutlar arasında sürekli kırpışırdı. Tek işi
   * yüksekliği tutmak — ölçüleri `.command-running` ile aynı olduğu için
   * terminal hiç yeniden ölçülendirilmiyor.
   *
   * Koşullar dar: yalnızca kutunun ZATEN açılacağı durumda. Ayar kapalıysa,
   * entegrasyon yoksa ya da tam ekran bir program (vim, less) çalışıyorsa
   * satır gerçekten olmamalı — orada terminalin bütün alanı kullanması doğru.
   */
  if (!active && appInput && signals?.integration && !signals.altScreen) {
    return <div className="command-running idle" style={rowStyle} aria-hidden="true" />;
  }

  if (!active || !tabId) return null;

  /*
   * Dizin rozeti BURADA YOK.
   *
   * Kutunun hemen üstündeki bağlam şeridi (`ContextBar`) dizini, dalı ve
   * değişiklik sayısını birlikte taşıyor ve komut çalışırken de görünür
   * kalıyor. Kutunun kendi rozeti aynı bilgiyi bir satır arayla tekrarlıyordu.
   */
  // Renkli katman ile metin kutusu AYNI yazı tipini kullanmak zorunda: iki
  // katman üst üste duruyor ve tek piksellik fark bile harfleri kaydırıyor.
  const typography = {
    fontFamily: appearance.fontFamily,
    fontSize: `${appearance.fontSize}px`,
    lineHeight: `${rowH}px`,
  };

  const send = (data: string) => sessions.get(tabId)?.sendKeys(data);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const store = useStore.getState();
    const box = e.currentTarget;
    const session = sessions.get(tabId);
    const boxSelection = box.selectionStart !== box.selectionEnd;

    /**
     * Kutudaki seçimi panoya yazar.
     *
     * Kutu bunu KENDİSİ yapıyor, tarayıcıya bırakmıyor. İki sebep: Windows'ta
     * kopyalama kısayolu Ctrl+Shift+C ve tarayıcının o tuşa bir karşılığı yok
     * — bırakılsa tuş kutuda ölürdü; ikincisi pano yazılamadığında kullanıcı
     * bunu duymalı, ızgara yolunda da öyle (bkz. `App.tsx`).
     *
     * `collapse`: Ctrl+C ile kopyalandıysa seçim kaldırılıyor. Aksi hâlde
     * seçim durduğu sürece her Ctrl+C yine kopyalar ve tuşun öteki anlamına
     * (satırı bırak, kabuğa kesme gönder) bir daha ulaşılamaz — ızgara yolu
     * aynı sebeple `clearSelection()` çağırıyor (`copyForCtrlC`). Kopyalama
     * kısayoluyla kopyalandığında seçim duruyor: orada ikinci bir anlam yok.
     */
    const copyBoxSelection = (collapse: boolean) => {
      const text = box.value.slice(box.selectionStart, box.selectionEnd);
      void navigator.clipboard
        .writeText(text)
        .catch(() => store.toast(t("common.clipboardFailed"), "err"));
      if (collapse) box.setSelectionRange(box.selectionEnd, box.selectionEnd);
    };

    /*
     * Kopyalama kısayolu (Windows'ta Ctrl+Shift+C, mac'te Cmd+C) seçim varken
     * kutunun seçimini kopyalıyor. `App.tsx` bu kısayolu kutuya bilerek
     * bırakıyor (gerekçesi orada). Seçim YOKKEN dokunulmuyor: kullanıcı
     * kopyalamayı Ctrl+C'ye bağlamış olabilir ve o zaman tuşun kesme anlamı
     * aşağıda karşılanmalı.
     */
    if (boxSelection && matchCombo(e.nativeEvent, keys.copy ?? "")) {
      e.preventDefault();
      copyBoxSelection(false);
      return;
    }

    /*
     * Kabuğun denetim karakterleri: Ctrl+C / Ctrl+D / Ctrl+L, yalnız Ctrl ile.
     * Hangi tuşların geçtiği ve neden yalnız Ctrl (Shift, Alt/AltGr, Win
     * dışarıda) `passThroughSequence` üzerinde anlatılıyor.
     */
    const pass = passThroughSequence(e);

    /*
     * Ctrl+C'nin İKİ anlamı var: kopyala ya da kes. Karar TEK YERDE —
     * `resolveCtrlC` (platform, ayar, ızgaradaki seçim, kutudaki seçim);
     * oturum ilk üçünü biliyor, kutu dördüncüsünü veriyor. Burada kuralı
     * yeniden yazmak bir kez denendi ve aynı gün üç ayrı kopya sayıldı; iki
     * kopya ayrıştığında tuş ya boşa gidiyor ya da SIGINT kabuğa hiç
     * ulaşmıyor. Kararın öyküsü `resolveCtrlC` üzerinde.
     *
     * "copy-grid": odak kutuda ama seçim ızgarada (çıktıdan sürükleyip seçince
     * odak kutuya geri geliyor). Eskiden burada yalnızca `return` vardı ve
     * "kopyalamayı App.tsx yapıyor" deniyordu — yapmıyordu: oradaki dal
     * odağın TERMİNALDE olmasını istiyor. Tuş yutuluyor, hiçbir şey
     * kopyalanmıyor, ızgara seçimi de durduğu için sonraki her Ctrl+C aynı
     * yere düşüyordu. Kopyalama artık burada ve seçimi de temizliyor.
     */
    if (pass === SIGINT) {
      const action = session?.ctrlCAction(boxSelection) ?? "sigint";
      if (action === "copy-box") {
        e.preventDefault();
        copyBoxSelection(true);
        return;
      }
      if (action === "copy-grid" && session) {
        e.preventDefault();
        void session.copyForCtrlC().then((result) => {
          if (result === "failed") store.toast(t("common.clipboardFailed"), "err");
        });
        return;
      }
      // "sigint": aşağıda kabuğa gidiyor.
    }

    /*
     * Kabuğun tuşu; kutu boşken bile geçmeli, yoksa çalışan bir şeyi
     * durdurmanın yolu kalmaz. Kesme gittiyse yazılan satır da bırakılıyor:
     * kabuk kendi satırını nasıl atıyorsa kutu da öyle.
     */
    if (pass) {
      e.preventDefault();
      send(pass);
      if (pass === SIGINT) setValue("");
      store.closeSuggestions();
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      store.closeSuggestions();
      return;
    }

    if (e.key === "Tab") {
      /*
       * Tab kutuda kalıyor (bkz. bileşen başlığı). `preventDefault` liste
       * kapalıyken de ŞART: tarayıcının Tab'ı odağı bir sonraki öğeye taşır,
       * o da terminal — kutu "kaybolmuş" olur.
       */
      e.preventDefault();
      if (suggest && suggest.items.length > 0 && !e.shiftKey) store.acceptSuggestion();
      return;
    }

    /*
     * Geçmiş paneli AÇIKKEN Ctrl+A: kapsamı değiştirir (bu sekme <-> tüm
     * sekmeler). `HistoryRecall` (Ctrl+R) penceresindeki AYNI kısayol; iki
     * yerde farklı tuş öğretmek kullanıcıya iki ayrı alışkanlık yükler.
     *
     * Yalnızca `kind === "recent"` iken devrede: yazarken çıkan ön ek
     * eşleşmesi (`kind: "history"`) sekmeye göre süzülmüyor, orada Ctrl+A'yı
     * ele geçirmek tarayıcının "tümünü seç"ini sebepsiz yere kilitlerdi.
     */
    if (suggest?.kind === "recent" && e.ctrlKey && e.key.toLowerCase() === "a") {
      e.preventDefault();
      store.openHistorySuggestions(suggest.scope === "all" ? "tab" : "all");
      return;
    }

    if (suggest && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      store.moveSuggestion(e.key === "ArrowUp" ? 1 : -1);
      return;
    }

    if (e.key === "ArrowUp" && !value) {
      /*
       * Boş kutuda yukarı ok: GEÇMİŞ PANELİ.
       *
       * Bu kipte kabuğun kendi geçmiş gezinmesi ERİŞİLEMEZ — kabuğun satırı
       * boş, yukarı ok ona gitse geçmişi ızgarada gezdirirdi, kutuda değil.
       * Terminalde en köklü alışkanlıklardan biri bu; karşılığını vermeden
       * bırakmak "geçmişim gitti" demek olurdu.
       *
       * Önceki hâli Ctrl+R penceresini açıyordu; doğru işi yapıyordu ama
       * ekranın ortasında bir ÖRTÜ olarak. İstenen Warp'taki gibi: panel
       * kutunun hemen ÜSTÜNDE açılıyor, ok tuşlarıyla geziliyor, Esc
       * kapatıyor. Panelin kendisi zaten var (`SuggestionBar`, başlığı
       * "GEÇMİŞ"); eksik olan onu boş satırda açan yoldu.
       *
       * Varsayılan kapsam BU SEKME — bildirilen istek buydu, "bir terminal
       * açtığımda yukarı okla o terminalin geçmişi gelsin". Kullanıcı Ctrl+A
       * ile tüm sekmelerin geçmişine genişletebiliyor (yukarıya bakın); yeni
       * açılmış, kendi geçmişi olmayan bir sekmede liste kendiliğinden tüm
       * geçmişten kuruluyor (gerekçesi `openHistorySuggestions` üzerinde).
       *
       * Hiçbir sekmede tek bir komut yoksa hiçbir şey açılmıyor — boş bir
       * panel tuşu bozuk gösterirdi.
       */
      e.preventDefault();
      store.openHistorySuggestions();
      return;
    }

    if (suggest && e.key === "ArrowRight") {
      // Sağ ok yalnızca imleç SONDAYKEN öneriyi kabul ediyor; ortadayken
      // normal imleç hareketi olmalı.
      if (box.selectionStart === value.length && box.selectionEnd === value.length) {
        e.preventDefault();
        store.acceptSuggestion();
      }
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      /*
       * Liste açık ve kutu BOŞSA Enter seçili komutu kutuya yazıyor.
       *
       * Boş satırı kabuğa göndermek burada hiçbir işe yaramıyor (yalnızca yeni
       * bir istem çizdiriyor) ve kullanıcı listede bir şey seçmişken tam
       * olarak onu bekliyor. ÇALIŞTIRMIYOR: tek bir Enter'la geçmişten bir
       * komut koşturmak `rm -rf` sınıfı bir kaza demek; komut kutuya geliyor,
       * ikinci Enter çalıştırıyor.
       */
      if (suggest && !value) {
        store.acceptSuggestion();
        return;
      }
      const text = value;
      // Boş satırda Enter da kabuğa gitmeli: kullanıcı istemi tazelemek
      // isteyebilir, kabuk da yeni bir istem çiziyor.
      send(`${text}\r`);
      setValue("");
      store.closeSuggestions();
    }
  };

  return (
    <div className="command-input">
      <div className="command-input-row">
        <span className="command-input-mark" aria-hidden="true">
          {">_"}
        </span>

        <div className="command-input-box">
          {/*
            Renklendirme SAYDAM metin kutusunun ARKASINDA duran ikinci bir
            katman. Metin kutusunun içine renkli metin çizmek mümkün değil —
            `textarea` tek renk alıyor.

            Sondaki boşluk bilinçli: satır sonunda yeni satır varken tarayıcı
            son boş satırı çizmiyor ve katman bir satır kısa kalıyor.
          */}
          <pre ref={highlightRef} className="command-input-hl" aria-hidden="true" style={typography}>
            {tokenizeCommand(value).map((token, index) => (
              <span key={index} className={`tok-${token.kind}`}>
                {token.text}
              </span>
            ))}
            {" "}
          </pre>

          <textarea
            ref={ref}
            className="command-input-field"
            rows={1}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            placeholder={t("input.placeholder")}
            style={typography}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            // Kutu kendi içinde kaydığında renkli katman da kaymalı; yoksa
            // uzun komutlarda renkler metinden ayrı düşer.
            onScroll={(e) => {
              const hl = highlightRef.current;
              if (hl) hl.scrollTop = e.currentTarget.scrollTop;
            }}
          />
        </div>
      </div>
    </div>
  );
}
