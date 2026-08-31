import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { tokenizeCommand } from "../lib/cmdline";
import { shortenPath } from "../lib/format";
import { passThroughSequence, resolveInputMode } from "../lib/inputMode";
import { useT } from "../lib/i18n";
import { sessions, useStore } from "../store/useStore";
import { FolderIcon } from "./Icons";

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
 * ## Kaçış kapısı: Tab
 *
 * Sekme tamamlamayı kabuk yapıyor ve kutudaki metni göremiyor. Tab'a
 * basıldığında metin olduğu gibi kabuğa gönderiliyor ve kutu o istem boyunca
 * kapanıyor: satır artık terminalde, tamamlama, geçmiş, her şey kabuğun kendi
 * düzenleyicisinde çalışıyor. Kendi tamamlayıcımızı yazmadan önce bu, işi
 * kaybetmeden devretmenin en dürüst yolu.
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

  const group = groups.find((g) => g.id === activeGroupId);
  const tab = group?.tabs.find((item) => item.id === group.activeTabId) ?? group?.tabs[0];
  const tabId = tab?.id ?? null;

  const [value, setValue] = useState("");
  /**
   * Tab ile kabuğa devredildi mi?
   *
   * Ayrı bir bayrak şart: devrettikten sonra kabuk HÂLÂ istemde bekliyor, yani
   * sinyaller değişmiyor ve kip kendiliğinden "app"e geri dönerdi — kutu
   * yeniden açılıp aynı satırı ikinci kez toplamaya başlardı.
   */
  const [handedOff, setHandedOff] = useState(false);
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const highlightRef = useRef<HTMLPreElement | null>(null);

  const signals = tabId ? allSignals[tabId] : undefined;
  const mode = resolveInputMode({
    enabled: appInput && !handedOff,
    integration: signals?.integration ?? false,
    atPrompt: signals?.atPrompt ?? false,
    altScreen: signals?.altScreen ?? false,
  });
  const active = mode === "app";

  // Sekme değişince kutu boşalmalı: yazılan metin O sekmenin kabuğuna ait.
  useEffect(() => {
    setValue("");
    setHandedOff(false);
  }, [tabId]);

  // Yeni istem geldiğinde devir bitiyor: kutu bir sonraki komut için açılıyor.
  useEffect(() => {
    if (!signals?.atPrompt) setHandedOff(false);
  }, [signals?.atPrompt]);

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
    useStore.getState().setAppInputSink((text) => {
      setValue(text);
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

  if (!active || !tabId) return null;

  /*
   * Dizin rozeti YALNIZCA blok başlığı yokken.
   *
   * Başlık açıkken kabuğun bekleyen istem satırı zaten kutunun hemen üstünde
   * ve orada aynı dizin rozeti duruyor. İkisini birden çizmek aynı bilgiyi iki
   * satır üst üste tekrarlamak olurdu.
   */
  const cwd = sessions.get(tabId)?.hasBlockHeaders() ? null : (tab?.cwd ?? null);
  // Renkli katman ile metin kutusu AYNI yazı tipini kullanmak zorunda: iki
  // katman üst üste duruyor ve tek piksellik fark bile harfleri kaydırıyor.
  const typography = {
    fontFamily: appearance.fontFamily,
    fontSize: `${appearance.fontSize}px`,
  };

  const send = (data: string) => sessions.get(tabId)?.sendKeys(data);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const store = useStore.getState();

    // Ctrl+C SEÇİM VARKEN kopyalar, kabuğu durdurmaz.
    //
    // Kararı oturum veriyor (`wantsCtrlCCopy`): ayar, seçim ve platform aynı
    // yerde. Burada tekrar yazsaydım iki taraf ayrıştığında tuş yutulur ve
    // SIGINT kabuğa hiç ulaşmazdı — çalışan komut durdurulamaz olurdu.
    //
    // Olayı DURDURMUYORUZ: kopyalamayı App.tsx'teki genel işleyici yapıyor,
    // olay ona ulaşmalı.
    if (
      (e.key === "c" || e.key === "C") &&
      e.ctrlKey &&
      sessions.get(tabId)?.wantsCtrlCCopy()
    ) {
      return;
    }

    // Ctrl+C / Ctrl+D / Ctrl+L kabuğun işi; kutu boşken bile geçmeli.
    const pass = passThroughSequence({ key: e.key, ctrl: e.ctrlKey || e.metaKey });
    if (pass) {
      e.preventDefault();
      send(pass);
      if (pass === "\x03") setValue("");
      store.closeSuggestions();
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      store.closeSuggestions();
      return;
    }

    if (e.key === "Tab") {
      // Tamamlamayı kabuğa devret (bkz. bileşen başlığı).
      e.preventDefault();
      store.closeSuggestions();
      send(value + "\t");
      setValue("");
      setHandedOff(true);
      return;
    }

    if (suggest && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      store.moveSuggestion(e.key === "ArrowUp" ? 1 : -1);
      return;
    }

    if (e.key === "ArrowUp" && !value) {
      /*
       * Boş kutuda yukarı ok: geçmiş.
       *
       * Bu kipte kabuğun kendi geçmiş gezinmesi ERİŞİLEMEZ — kabuğun satırı
       * boş, yukarı ok ona gitse geçmişi ızgarada gezdirirdi, kutuda değil.
       * Terminalde en köklü alışkanlıklardan biri bu; karşılığını vermeden
       * bırakmak "geçmişim gitti" demek olurdu.
       *
       * Öneri listesi bu boşluğu dolduramıyor: en az iki harf istiyor, boş
       * kutuda hiç açılmıyor. Uygulamanın geçmiş arama penceresi (Ctrl+R ile
       * açılan) tam olarak bu işi yapıyor ve seçileni kutuya yazıyor.
       */
      e.preventDefault();
      store.setUi({ searchOpen: true });
      return;
    }

    if (suggest && e.key === "ArrowRight") {
      // Sağ ok yalnızca imleç SONDAYKEN öneriyi kabul ediyor; ortadayken
      // normal imleç hareketi olmalı.
      const el = e.currentTarget;
      if (el.selectionStart === value.length && el.selectionEnd === value.length) {
        e.preventDefault();
        store.acceptSuggestion();
      }
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
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
      {cwd && (
        <div className="command-input-meta">
          <span className="ci-chip" title={cwd}>
            <FolderIcon size={11} />
            {shortenPath(cwd, 3)}
          </span>
        </div>
      )}

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
