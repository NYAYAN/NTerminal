// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLanguage } from "../lib/i18n";
import { promptedTabs } from "../lib/promptSeen";
import { sessions, useStore } from "../store/useStore";
import type { Group, TabState } from "../types";
import { CommandInput } from "./CommandInput";

/**
 * Uygulamanın kendi komut satırı.
 *
 * En riskli parça bu: bütün tuş vuruşları buradan geçiyor. Bir hata "yazamıyorum"
 * ya da daha kötüsü "vim'de kilitlendim" demek. Bu yüzden testler iki şeyi
 * bağlıyor — kutunun NE ZAMAN açıldığı ve tuşların NEREYE gittiği.
 *
 * Kip kararının kendisi `lib/inputMode.test.ts` içinde; burada o kararın
 * arayüze doğru yansıdığı test ediliyor.
 */

const TAB = "t1";

function tab(id: string): TabState {
  return {
    id,
    title: id,
    customTitle: id,
    profileId: "p1",
    cwd: null,
    createdAt: 0,
    lastActiveAt: 0,
    hasScrollback: false,
    lastCommand: null,
    locked: false,
  };
}

function group(tabs: TabState[]): Group {
  return {
    id: "g1",
    name: "g1",
    color: null,
    icon: null,
    collapsed: false,
    favorite: false,
    ungrouped: false,
    defaultProfileId: null,
    defaultCwd: null,
    env: {},
    activeTabId: tabs[0]?.id ?? null,
    tabs,
  };
}

const sendKeys = vi.fn();
const focus = vi.fn();
const setAppInput = vi.fn();
/**
 * Ctrl+C kararı — oturum veriyor (`resolveCtrlC` üzerinden). Kutu yalnızca
 * kendi seçimini bildiriyor ve sonucu uyguluyor; kuralın kendisi
 * `lib/inputMode.test.ts` içinde test ediliyor. Varsayılan: kabuğa.
 */
const ctrlCAction = vi.fn<(boxSelection: boolean) => "copy-box" | "copy-grid" | "sigint">(
  () => "sigint",
);
const copyForCtrlC = vi.fn(async () => "copied" as "copied" | "failed" | "passthrough");
/** Pano: jsdom'da yok; kutu kendi seçimini buraya yazıyor. */
const writeText = vi.fn(async () => {});
/**
 * Kip sinyalleri OTURUMDAN okunuyor; depodaki kopya yalnızca yeniden çizimi
 * tetikliyor. Sahte oturum da bunu vermek zorunda.
 */
const inputSignals = vi.fn(() => ({ atPrompt: true, altScreen: false, integration: true }));
/** Program uygulama imleç tuşlarını istemiş mi (DECCKM); varsayılan hayır. */
const applicationCursorKeys = vi.fn(() => false);
/** Çalışan program parola mı soruyor; kuralın kendisi `inputMode.test.ts` içinde. */
const secretPrompt = vi.fn(() => false);

/** Kabuğun bildirdiği sinyaller; varsayılan "istemde bekliyor". */
function seed(signals: Partial<{ atPrompt: boolean; altScreen: boolean; integration: boolean }> = {}) {
  const tam = { atPrompt: true, altScreen: false, integration: true, ...signals };
  // Oturum ASIL kaynak; depodaki kopya yalnızca yeniden çizim tetikleyicisi.
  inputSignals.mockReturnValue(tam);
  const state = useStore.getState();
  useStore.setState({
    groups: [group([tab(TAB)])],
    activeGroupId: "g1",
    ready: true,
    inputSignals: {
      [TAB]: tam,
    },
    settings: {
      ...state.settings,
      behavior: { ...state.settings.behavior, appInput: true },
    },
    ui: { ...state.ui, suggest: null },
  });
}

const field = (c: HTMLElement) => c.querySelector<HTMLTextAreaElement>(".command-input-field");

beforeEach(() => {
  setLanguage("tr");
  // Her test yeni bir kabukla başlıyor: "ilk istem görüldü" kaydı sıfır.
  promptedTabs.clear();
  sendKeys.mockClear();
  focus.mockClear();
  setAppInput.mockClear();
  ctrlCAction.mockReset().mockReturnValue("sigint");
  copyForCtrlC.mockClear();
  writeText.mockClear();
  applicationCursorKeys.mockReset().mockReturnValue(false);
  secretPrompt.mockReset().mockReturnValue(false);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  sessions.set(TAB, {
    sendKeys,
    focus,
    setAppInput,
    ctrlCAction,
    copyForCtrlC,
    inputSignals,
    applicationCursorKeys,
    secretPrompt,
  } as never);
  seed();
});

afterEach(() => {
  cleanup();
  sessions.delete(TAB);
  useStore.setState({
    groups: [],
    activeGroupId: null,
    inputSignals: {},
    appInputSink: null,
    running: {},
    stopArmed: null,
  });
});

/** Komut çalışıyor: kabuk istemde değil ve depo komutu "çalışıyor" biliyor. */
function seedRunning(signals: Partial<{ altScreen: boolean; integration: boolean }> = {}) {
  seed({ atPrompt: false, ...signals });
  useStore.setState({ running: { [TAB]: true } });
}

/** Uygulama komut satırı ayarını kapatır (klasik terminal). `seed` ayarı açtığı için ondan SONRA. */
function appInputOff() {
  const state = useStore.getState();
  useStore.setState({
    settings: { ...state.settings, behavior: { ...state.settings.behavior, appInput: false } },
  });
}

describe("komut satırı kutusu", () => {
  it("kabuk istemde beklerken açılıyor", () => {
    const { container } = render(<CommandInput />);
    expect(field(container)).not.toBe(null);
  });

  it("ayar kapalıyken komut çalışırken DURDUR şeridi geliyor", () => {
    // ÖLÇÜLEN SORUN: "Enter'a bastım, komut satırı kayboldu. Durdurmak
    // istersem nasıl yapacağım?" Klasik terminalde (ayar kapalı) kutu hiç
    // yok; ekranda komutun çalıştığını söyleyen ve yolu gösteren şey şerit.
    seedRunning();
    appInputOff();
    const { container } = render(<CommandInput />);
    expect(field(container), "ayar kapalıyken kutu olmamalı").toBe(null);

    const stop = container.querySelector<HTMLButtonElement>(".command-running .running-stop");
    expect(stop, "durdurma düğmesi yok").not.toBe(null);
    fireEvent.click(stop!);
    // Ctrl+C'nin baytı tek yerden geliyor; düğme de onu göndermeli.
    expect(sendKeys).toHaveBeenCalledWith("\x03");
  });

  it("tam ekran programda şerit de YOK", () => {
    // vim/less ekranı kendisi yönetiyor; Ctrl+C'nin anlamı programa ait.
    seedRunning({ altScreen: true });
    const { container } = render(<CommandInput />);
    expect(container.innerHTML).toBe("");
  });

  /*
   * BİLDİRİLEN: "Terminalde `ng serve` dediğimde 'Would you like to use a
   * different port? (Y/n)' mesajı geliyor. Bu bilgiyi komut yazma kısmına
   * yazamıyoruz, doğrudan mesajın çıktığı yere yazıyoruz — gerçek bir
   * terminal yapısı sağlamamış oluyor."
   *
   * Eski hâl bilinçliydi: komut çalışınca kutu kapanıyor, tuşlar ızgaraya
   * gidiyordu ("program tuşları o an isteyebilir"). Kullanıcı için yazılan
   * yer iki taneydi. Kutu artık açık kalıyor ve çalışan programın satırı
   * oluyor.
   */
  it("komut çalışırken kutu AÇIK kalıyor ve yanıt Enter'la programa gidiyor", () => {
    seedRunning();
    const { container } = render(<CommandInput />);
    const el = field(container);
    expect(el, "çalışırken kutu kapanmış").not.toBe(null);
    expect(container.querySelector(".command-input.stdin"), "yanıt satırı değil").not.toBe(null);
    // Yer tutucu DURUM söylüyor, kutuyu anlatmıyor. İlk hâli "Komut
    // çalışıyor… soru sorarsa yanıtı buraya yazın"dı; bildirilen: "amatörce
    // değil mi". Buraya yazılacağını odak ve imleç zaten söylüyor.
    expect(el!.placeholder).toBe("Komut çalışıyor…");
    expect(document.activeElement, "odak kutuda değil").toBe(el);
    // Tek giriş kapısı: terminalin kendi girdisi kapalı.
    expect(setAppInput).toHaveBeenCalledWith(true);

    fireEvent.change(el!, { target: { value: "n" } });
    // Yazarken hiçbir şey gitmiyor: satır Enter'a kadar kutuda.
    expect(sendKeys).not.toHaveBeenCalled();
    fireEvent.keyDown(el!, { key: "Enter" });
    expect(sendKeys).toHaveBeenCalledWith("n\r");
    expect(el!.value).toBe("");
  });

  it("çok satırlı yanıt terminalin satır sonuyla gidiyor", () => {
    // Izgaraya yapıştırmak her satırı `\r` ile gönderiyordu (xterm böyle
    // çeviriyor); kutudan giden de aynı baytlar olmalı, `\n` değil.
    seedRunning();
    const { container } = render(<CommandInput />);
    const el = field(container)!;
    fireEvent.change(el, { target: { value: "bir\niki\r\nüç" } });
    fireEvent.keyDown(el, { key: "Enter" });
    expect(sendKeys).toHaveBeenCalledWith("bir\riki\rüç\r");
  });

  it("boş yanıt satırında Enter programa gidiyor: varsayılanı kabul etmek", () => {
    // "(Y/n)" sorusunda büyük harf varsayılan; çoğu zaman yanıt yalnızca Enter.
    seedRunning();
    const { container } = render(<CommandInput />);
    fireEvent.keyDown(field(container)!, { key: "Enter" });
    expect(sendKeys).toHaveBeenCalledWith("\r");
  });

  it("boş yanıt satırında oklar ve Boşluk doğrudan programa: seçim listeleri", () => {
    // `ng new`in "Which stylesheet format?" listesi oklarla, işaret kutulu
    // listeler Boşlukla sürülüyor. Tuş o an gitmeli, Enter'ı beklememeli.
    seedRunning();
    const { container } = render(<CommandInput />);
    const el = field(container)!;
    fireEvent.keyDown(el, { key: "ArrowDown" });
    expect(sendKeys).toHaveBeenLastCalledWith("\x1b[B");
    fireEvent.keyDown(el, { key: " " });
    expect(sendKeys).toHaveBeenLastCalledWith(" ");

    // Program uygulama imleç kipini açtıysa kodlama değişiyor.
    applicationCursorKeys.mockReturnValue(true);
    fireEvent.keyDown(el, { key: "ArrowUp" });
    expect(sendKeys).toHaveBeenLastCalledWith("\x1bOA");
  });

  it("yazmaya başlayınca oklar kutunun: satır düzenleniyor, programa gitmiyor", () => {
    seedRunning();
    const { container } = render(<CommandInput />);
    const el = field(container)!;
    fireEvent.change(el, { target: { value: "my-app" } });
    const olay = fireEvent.keyDown(el, { key: "ArrowLeft" });
    expect(sendKeys).not.toHaveBeenCalled();
    expect(olay, "imleç hareketi engellenmiş").toBe(true);
  });

  it("Tab yazılanı programa devrediyor: tamamlamayı program yapıyor", () => {
    // REPL ya da ssh ardındaki kabuk satırı görmeden tamamlayamaz; program
    // aynı baytları, aynı sırada alıyor.
    seedRunning();
    const { container } = render(<CommandInput />);
    const el = field(container)!;
    fireEvent.change(el, { target: { value: "impo" } });
    const olay = fireEvent.keyDown(el, { key: "Tab" });
    expect(sendKeys).toHaveBeenCalledWith("impo\t");
    expect(el.value).toBe("");
    // Tarayıcının Tab'ı odağı terminale taşırdı; kutu "kaybolmuş" olurdu.
    expect(olay, "varsayılan engellenmeli").toBe(false);
  });

  it("yanıt satırında Ctrl+C tek basışta kesiyor ve gönderilmemiş satırı bırakıyor", () => {
    // Terminal sürücüsü de kesmede bekleyen satırı atıyor.
    seedRunning();
    const { container } = render(<CommandInput />);
    const el = field(container)!;
    fireEvent.change(el, { target: { value: "yarım" } });
    el.setSelectionRange(el.value.length, el.value.length);
    fireEvent.keyDown(el, { key: "c", ctrlKey: true });
    expect(sendKeys).toHaveBeenCalledWith("\x03");
    expect(el.value).toBe("");
  });

  it("yanıt satırında geçmiş önerisi ve geçmiş paneli açılmıyor", () => {
    // Çalışan programa yazılan "y"nin, bir parolanın komut geçmişiyle ilgisi
    // yok; boş satırda yukarı ok da geçmişi değil programın listesini sürüyor.
    useStore.setState({
      suggestHistory: [{ command: "npm test", cwd: null, tabId: TAB }],
    });
    seedRunning();
    const { container } = render(<CommandInput />);
    const el = field(container)!;
    fireEvent.keyDown(el, { key: "ArrowUp" });
    expect(sendKeys).toHaveBeenCalledWith("\x1b[A");
    fireEvent.change(el, { target: { value: "npm" } });
    expect(useStore.getState().ui.suggest, "öneri listesi açılmış").toBe(null);
  });

  it("yanıt satırı renklendirilmiyor", () => {
    // Yazılan bir kabuk komutu değil; `y`yi komut rengine boyamak yanıltıcı.
    seedRunning();
    const { container } = render(<CommandInput />);
    fireEvent.change(field(container)!, { target: { value: "npm" } });
    expect(container.querySelector(".command-input-hl"), "renkli katman var").toBe(null);
    expect(field(container)!.classList.contains("plain")).toBe(true);
  });

  it("yanıt satırında Durdur düğmesi var ve SIGINT gönderiyor", () => {
    // Şeridin işi (çalıştığını söylemek, durdurmanın yolunu göstermek) kutuya
    // taşındı; şerit kutunun yerine geçtiği için ikisi birden çizilemiyordu.
    seedRunning();
    const { container } = render(<CommandInput />);
    const stop = container.querySelector<HTMLButtonElement>(".command-input .running-stop");
    expect(stop, "durdurma düğmesi yok").not.toBe(null);
    // Kesmeyi yok sayan programda yazmaya kutuda devam edilebilmeli: düğme
    // odağı almıyor.
    expect(fireEvent.mouseDown(stop!), "düğme odağı kutudan alıyor").toBe(false);
    fireEvent.click(stop!);
    expect(sendKeys).toHaveBeenCalledWith("\x03");
  });

  /*
   * Parola sorusu: yazılan gizleniyor.
   *
   * Terminal parola sorarken yazılanı yansıtmıyor. Kutu yansıtıyor; bu
   * olmasa `ssh`in sorusuna yazılan parola kutuda açık metin dururdu.
   */
  it("parola sorusunda yazılan nokta olarak görünüyor ve panoya çıkmıyor", () => {
    secretPrompt.mockReturnValue(true);
    const state = useStore.getState();
    useStore.setState({
      settings: { ...state.settings, keybindings: { ...state.settings.keybindings, copy: "Ctrl+Shift+C" } },
    });
    seedRunning();
    const { container } = render(<CommandInput />);
    const el = field(container)!;
    // Boşken gizlenecek bir şey yok; yer tutucu noktaya dönmesin.
    expect(el.classList.contains("secret")).toBe(false);

    fireEvent.change(el, { target: { value: "hunter2" } });
    expect(el.classList.contains("secret"), "parola açık görünüyor").toBe(true);

    el.setSelectionRange(0, el.value.length);
    fireEvent.keyDown(el, { key: "C", ctrlKey: true, shiftKey: true });
    expect(writeText, "parola panoya yazıldı").not.toHaveBeenCalled();

    fireEvent.keyDown(el, { key: "Enter" });
    expect(sendKeys).toHaveBeenCalledWith("hunter2\r");
  });

  it("parola sorusu yoksa yanıt açık görünüyor", () => {
    seedRunning();
    const { container } = render(<CommandInput />);
    const el = field(container)!;
    fireEvent.change(el, { target: { value: "n" } });
    expect(el.classList.contains("secret")).toBe(false);
  });

  it("komut bitince gönderilmemiş yanıt kutuda kalmıyor, komut taslağı geri geliyor", () => {
    /*
     * Tek değer olsaydı iki kaza birden: komut bitmeden gönderilmemiş "y"
     * bir sonraki Enter'da KOMUT olarak çalışır, istemde yarım bırakılan
     * taslak da (geçmiş panelinden bir komut çalıştırılınca) çalışan
     * programın satırına düşerdi.
     */
    const { container, rerender } = render(<CommandInput />);
    fireEvent.change(field(container)!, { target: { value: "git status" } });

    act(() => seedRunning());
    rerender(<CommandInput />);
    expect(field(container)!.value, "taslak programa gidecek satırda").toBe("");
    fireEvent.change(field(container)!, { target: { value: "y" } });

    act(() => {
      useStore.setState({ running: {} });
      seed();
    });
    rerender(<CommandInput />);
    expect(field(container)!.value, "yanıt komut satırında kaldı").toBe("git status");
    expect(sendKeys).not.toHaveBeenCalled();
  });

  it("komut başlayınca odak kutuya geliyor", () => {
    // Komut kenar çubuğundaki bir düğmeden (geçmiş, favori) başlarsa odak o
    // düğmede kalır ve programın sorusuna yazılan hiçbir yere gitmezdi.
    // Kutu açık kaldığı için bunu "kutu açıldı" olayı yakalamıyor.
    const button = document.createElement("button");
    document.body.appendChild(button);

    const { container, rerender } = render(<CommandInput />);
    button.focus();
    expect(document.activeElement).toBe(button);

    act(() => seedRunning());
    rerender(<CommandInput />);
    expect(document.activeElement, "odak düğmede kaldı").toBe(field(container));

    button.remove();
  });

  /*
   * Kabuk ilk istemine gelmeden: kutunun YERİNDE yükleniyor şeridi.
   *
   * BİLDİRİLEN İSTEK: "yeni bir sekme oluşturunca komut yazma yeri sonradan
   * geliyor; bence hep olsun, o kısımda ufak bir yükleniyor gösterelim."
   */
  it("kabuk başlarken yükleniyor şeridi var, kutu yok, tuşlar terminale", () => {
    seed({ atPrompt: false });
    const { container } = render(<CommandInput />);
    expect(field(container), "istem gelmeden kutu açılmamalı").toBe(null);
    expect(container.querySelector(".command-running.starting")).not.toBe(null);
    // Şerit PASİF: kabuk açılışta bir şey sorarsa cevap verilebilmeli.
    expect(setAppInput).not.toHaveBeenCalledWith(true);
  });

  it("ilk istemden sonra şerit bir daha çıkmıyor: komutlar arasında sessiz", () => {
    // A → B arası (istem çizilirken) sinyal kısa süre düşüyor; orada
    // "başlatılıyor" yazmak yanlış olurdu.
    const { container, rerender } = render(<CommandInput />);
    expect(field(container)).not.toBe(null);
    act(() => seed({ atPrompt: false }));
    rerender(<CommandInput />);
    expect(container.querySelector(".command-running.starting")).toBe(null);
    expect(field(container)).toBe(null);
    // Sessiz ama BOŞ DEĞİL: satır yerinde duruyor (bir alttaki teste bak).
    const bos = container.querySelector<HTMLElement>(".command-running.idle");
    expect(bos, "istem çizilirken satır boşalmamalı").not.toBe(null);
    expect(bos!.querySelector(".running-dot"), "boş şeritte nokta yanmamalı").toBe(null);
    expect(bos!.textContent, "boş şeritte yazı olmamalı").toBe("");
  });

  /*
   * BİLDİRİLEN HATA: "cd ile bir yola gittiğimde terminalde flash oluyor" —
   * terminal metni bir zıplayıp geri dönüyor.
   *
   * KÖK NEDEN: `133;D` (komut bitti) ile `133;B` (istem hazır) arasında ne
   * kutu ne şerit çiziliyordu; `input` ızgara satırı 0'a iniyor, terminal
   * ~bir satır büyüyor, `ResizeObserver` → `fit()` → PTY'ye yeni ölçü →
   * kabuk istemi yeniden çiziyor. `133;B` gelince aynı zincir ters yönde.
   *
   * Test ÖLÇÜYE bakıyor, öğenin varlığına değil: satırın orada olması tek
   * başına yetmiyor, KUTUYLA AYNI yüksekliği taşıması gerekiyor.
   */
  it("istem çizilirken satır kutuyla aynı yüksekliği koruyor", () => {
    const fontSize = useStore.getState().settings.appearance.fontSize;
    const beklenen = `${Math.round(fontSize * 1.55)}px`;

    const kutu = render(<CommandInput />);
    expect(field(kutu.container)!.style.lineHeight).toBe(beklenen);
    kutu.unmount();

    seed({ atPrompt: false });
    const bos = render(<CommandInput />);
    const strip = bos.container.querySelector<HTMLElement>(".command-running.idle")!;
    expect(strip.getAttribute("style")).toContain(`--cmd-row-h: ${beklenen}`);
  });

  /*
   * Satır yalnızca kutunun ZATEN açılacağı durumda tutuluyor.
   *
   * Üç durumda kutu hiç açılmayacak ve orada boş bir şerit terminalden kalıcı
   * olarak yer çalardı — üstelik `vim` gibi tam ekran programlarda alanın
   * tamamının terminale geçmesi İSTENEN şey.
   */
  it("kutunun hiç açılmayacağı durumlarda satır da yok", () => {
    for (const [ad, signals] of [
      ["tam ekran program", { atPrompt: false, altScreen: true }],
      ["entegrasyonsuz kabuk", { atPrompt: false, integration: false }],
    ] as const) {
      promptedTabs.clear();
      seed(signals);
      const { container, unmount } = render(<CommandInput />);
      expect(container.querySelector(".command-running.idle"), ad).toBe(null);
      unmount();
    }

    // Ayar kapalı: kutu tümden yok, satır da yok.
    promptedTabs.clear();
    seed({ atPrompt: false });
    const state = useStore.getState();
    useStore.setState({
      settings: {
        ...state.settings,
        behavior: { ...state.settings.behavior, appInput: false },
      },
    });
    const { container } = render(<CommandInput />);
    expect(container.querySelector(".command-running.idle"), "ayar kapalı").toBe(null);
  });

  it("şerit ile kutu aynı satır yüksekliğini paylaşıyor", () => {
    // BİLDİRİLEN: "yükleniyor bittiğinde ufak bir yükseklik değişmesi oluyor."
    // ÖLÇÜLEN: kutu 33px, şerit 29px. Tek ölçü: yuvarlanmış satır yüksekliği
    // kutunun metnine line-height, şeride --cmd-row-h olarak gidiyor.
    const fontSize = useStore.getState().settings.appearance.fontSize;
    const beklenen = `${Math.round(fontSize * 1.55)}px`;

    const kutu = render(<CommandInput />);
    expect(field(kutu.container)!.style.lineHeight).toBe(beklenen);
    kutu.unmount();

    // İlk çizim sekmeyi "istem görüldü" diye kaydetti; şerit için yeni kabuk.
    promptedTabs.clear();
    seed({ atPrompt: false });
    const serit = render(<CommandInput />);
    const strip = serit.container.querySelector<HTMLElement>(".command-running.starting")!;
    expect(strip.getAttribute("style")).toContain(`--cmd-row-h: ${beklenen}`);
  });

  it("kabuk entegrasyonu yoksa yükleniyor şeridi de yok", () => {
    // Orada istem sinyali hiç gelmeyecek; sonsuz "başlatılıyor" yalan olurdu.
    seed({ atPrompt: false, integration: false });
    const { container } = render(<CommandInput />);
    expect(container.innerHTML).toBe("");
  });

  it("tam ekran programda kapalı", () => {
    seed({ altScreen: true });
    const { container } = render(<CommandInput />);
    expect(container.innerHTML).toBe("");
  });

  it("kabuk entegrasyonu yoksa kapalı", () => {
    seed({ integration: false });
    const { container } = render(<CommandInput />);
    expect(container.innerHTML).toBe("");
  });

  it("ayar kapalıyken kapalı", () => {
    const state = useStore.getState();
    useStore.setState({
      settings: { ...state.settings, behavior: { ...state.settings.behavior, appInput: false } },
    });
    const { container } = render(<CommandInput />);
    expect(container.innerHTML).toBe("");
  });

  it("kip açıkken terminalin stdin'i kapanıyor", () => {
    // Odağın kutuda olduğunu varsaymak yetmiyor: kullanıcı seçim için
    // terminale tıklarsa yazdığı her şey İKİ yoldan birden kabuğa giderdi.
    render(<CommandInput />);
    expect(setAppInput).toHaveBeenCalledWith(true);
  });

  it("terminale tıklamak odağı kutudan almıyor", () => {
    // ÖLÇÜLEN BELİRTİ: çıktının içine tıklayınca odak xterm'e geçiyor ve o
    // andan sonra yazılan hiçbir şey hiçbir yere gitmiyordu — kutu odağı
    // kaybetmiş, terminalin stdin'i zaten kapalı.
    const host = document.createElement("div");
    host.className = "term-wrap";
    document.body.appendChild(host);

    const { container } = render(<CommandInput />);
    const el = field(container)!;
    el.blur();
    expect(document.activeElement).not.toBe(el);

    fireEvent.mouseUp(host);
    expect(document.activeElement, "odak kutuya dönmeli").toBe(el);

    host.remove();
  });

  it("kutu kapanınca terminalin stdin'i geri açılıyor", () => {
    // Bölme kipinde görünür bir kilitlenmeydi: yan bölmeye tıklıyorsunuz,
    // kutu ona ait değil, yazdığınız da hiçbir yere gitmiyor.
    const { unmount } = render(<CommandInput />);
    setAppInput.mockClear();
    unmount();
    expect(setAppInput).toHaveBeenCalledWith(false);
  });

  it("kutu dizin rozetini çizmiyor", () => {
    // Dizin, dal ve değişiklik sayısı kutunun hemen üstündeki bağlam
    // şeridinde (`ContextBar`) ve komut çalışırken de görünür kalıyor. Kutunun
    // kendi rozeti aynı bilgiyi bir satır arayla tekrarlıyordu.
    const state = useStore.getState();
    useStore.setState({
      groups: [{ ...state.groups[0], tabs: [{ ...state.groups[0].tabs[0], cwd: "/repo" }] }],
    });

    const { container } = render(<CommandInput />);
    expect(container.querySelector(".ci-chip")).toBe(null);
  });

  it("Enter komutu kabuğa gönderiyor ve kutuyu boşaltıyor", () => {
    const { container } = render(<CommandInput />);
    const el = field(container)!;
    fireEvent.change(el, { target: { value: "npm test" } });
    fireEvent.keyDown(el, { key: "Enter" });
    expect(sendKeys).toHaveBeenCalledWith("npm test\r");
    expect(el.value).toBe("");
  });

  it("Shift+Enter göndermiyor: çok satırlı komut yazılabilmeli", () => {
    const { container } = render(<CommandInput />);
    const el = field(container)!;
    fireEvent.change(el, { target: { value: "for x in 1 2 3" } });
    fireEvent.keyDown(el, { key: "Enter", shiftKey: true });
    expect(sendKeys).not.toHaveBeenCalled();
  });

  it("Ctrl+C kutu boşken bile kabuğa gidiyor", () => {
    // Yoksa çalışan bir şeyi durdurmanın yolu kalmıyor.
    const { container } = render(<CommandInput />);
    fireEvent.keyDown(field(container)!, { key: "c", ctrlKey: true });
    expect(sendKeys).toHaveBeenCalledWith("\x03");
  });

  /*
   * IZGARADA seçim varken Ctrl+C: kutu kopyalamayı KENDİSİ tetikliyor.
   *
   * ÖLÇÜLEN HATA: burada yalnızca `return` vardı ve yorum "kopyalamayı
   * App.tsx yapıyor" diyordu. Yapmıyordu — oradaki dal odağın terminalde
   * olmasını istiyor, odak ise kutuda (çıktıdan sürükleyip seçince kutu odağı
   * geri alıyor). Tuş yutuluyor, hiçbir şey kopyalanmıyor, ızgara seçimi de
   * durduğu için sonraki her Ctrl+C aynı yere düşüyordu.
   */
  it("ızgarada seçim varken Ctrl+C ızgarayı kopyalıyor, kabuğu durdurmuyor", () => {
    ctrlCAction.mockReturnValue("copy-grid");
    const { container } = render(<CommandInput />);
    fireEvent.keyDown(field(container)!, { key: "c", ctrlKey: true });

    expect(copyForCtrlC, "ızgara kopyalanmadı").toHaveBeenCalledTimes(1);
    expect(sendKeys, "seçim varken SIGINT gitmemeli").not.toHaveBeenCalled();
    // Kutuda seçim yoktu; karar buna göre isteniyor.
    expect(ctrlCAction).toHaveBeenCalledWith(false);
  });

  /*
   * BİLDİRİLEN HATA: "Komut yazın kısmında `cd Desktop\Work\Github\Survey`
   * yazıyorum ve bu metni seçip kopyala yapmak için Ctrl+C basıyorum; metin
   * kayboluyor ve kopyalayamamış oluyorum."
   *
   * Seçim KUTUNUN içinde, ızgarada değil. Kutu bir `textarea` ve seçimi
   * tarayıcının modelinde duruyor; oturum onu göremiyordu, karar "seçim yok"
   * çıkıyor, tuş SIGINT olarak kabuğa gidiyor ve satır siliniyordu. Artık
   * kutu kendi seçimini karara veriyor ve sonucu kendisi uyguluyor.
   */
  it("kutudaki seçimle Ctrl+C kopyalıyor, satırı silmiyor", () => {
    ctrlCAction.mockReturnValue("copy-box");
    const { container } = render(<CommandInput />);
    const el = field(container)!;
    fireEvent.change(el, { target: { value: "cd Desktop\\Work\\Github\\Survey" } });
    el.setSelectionRange(3, el.value.length);

    fireEvent.keyDown(el, { key: "c", ctrlKey: true });

    expect(ctrlCAction, "kutudaki seçim karara bildirilmeli").toHaveBeenCalledWith(true);
    expect(writeText).toHaveBeenCalledWith("Desktop\\Work\\Github\\Survey");
    expect(sendKeys, "seçim varken SIGINT gitmemeli").not.toHaveBeenCalled();
    expect(el.value, "yazılan satır silinmiş").toBe("cd Desktop\\Work\\Github\\Survey");
  });

  it("Ctrl+C ile kopyalanınca seçim kalkıyor: ikinci Ctrl+C kabuğa gidiyor", () => {
    // Seçim dursaydı her Ctrl+C yine kopyalar, tuşun öteki anlamına (satırı
    // bırak) bir daha ulaşılamazdı. Izgara yolu aynı sebeple seçimi temizliyor.
    ctrlCAction.mockReturnValue("copy-box");
    const { container } = render(<CommandInput />);
    const el = field(container)!;
    fireEvent.change(el, { target: { value: "npm test" } });
    el.setSelectionRange(0, el.value.length);
    fireEvent.keyDown(el, { key: "c", ctrlKey: true });
    expect(el.selectionStart, "seçim kalkmalı").toBe(el.selectionEnd);

    // Seçim yok → oturum artık "kabuğa" diyor (kuralı inputMode.test bağlıyor).
    ctrlCAction.mockReturnValue("sigint");
    fireEvent.keyDown(el, { key: "c", ctrlKey: true });
    expect(sendKeys).toHaveBeenCalledWith("\x03");
    expect(el.value).toBe("");
  });

  it("kutuda seçim YOKKEN Ctrl+C kabuğa gidiyor ve satırı bırakıyor", () => {
    // Kontrol grubu: kaçış kapısı daraldı, kapanmadı.
    const { container } = render(<CommandInput />);
    const el = field(container)!;
    fireEvent.change(el, { target: { value: "npm test" } });
    el.setSelectionRange(el.value.length, el.value.length);

    fireEvent.keyDown(el, { key: "c", ctrlKey: true });
    expect(ctrlCAction).toHaveBeenCalledWith(false);
    expect(sendKeys).toHaveBeenCalledWith("\x03");
    expect(el.value).toBe("");
  });

  /*
   * Kopyalama KISAYOLU (Windows'ta Ctrl+Shift+C) kutuda çalışmalı.
   *
   * İki aşamalı hataydı. Önce kutu shift'i görmüyor, tuş SIGINT'e dönüşüp
   * satırı siliyordu. Shift süzülünce tuş bu kez ÖLÜ kaldı: `App.tsx` onu
   * "tarayıcı kopyalasın" diye kutuya bırakıyor, ama tarayıcının
   * Ctrl+Shift+C'ye bir karşılığı yok. Kutu artık kendisi kopyalıyor.
   */
  it("kopyalama kısayolu kutunun seçimini kopyalıyor", () => {
    const state = useStore.getState();
    useStore.setState({
      settings: { ...state.settings, keybindings: { ...state.settings.keybindings, copy: "Ctrl+Shift+C" } },
    });
    const { container } = render(<CommandInput />);
    const el = field(container)!;
    fireEvent.change(el, { target: { value: "git status" } });
    el.setSelectionRange(0, 3);
    fireEvent.keyDown(el, { key: "C", ctrlKey: true, shiftKey: true });

    expect(writeText).toHaveBeenCalledWith("git");
    expect(sendKeys, "kopyalama kısayolu kabuğa gitmiş").not.toHaveBeenCalled();
    expect(el.value, "yazılan satır silinmiş").toBe("git status");
    // Kısayolla kopyalamada seçim DURUYOR: burada ikinci bir anlam yok.
    expect(el.selectionEnd - el.selectionStart).toBe(3);
  });

  it("seçim yokken kopyalama kısayolu bir şey yapmıyor, satırı da silmiyor", () => {
    const state = useStore.getState();
    useStore.setState({
      settings: { ...state.settings, keybindings: { ...state.settings.keybindings, copy: "Ctrl+Shift+C" } },
    });
    const { container } = render(<CommandInput />);
    const el = field(container)!;
    fireEvent.change(el, { target: { value: "git status" } });
    fireEvent.keyDown(el, { key: "C", ctrlKey: true, shiftKey: true });

    expect(writeText).not.toHaveBeenCalled();
    expect(sendKeys).not.toHaveBeenCalled();
    expect(el.value).toBe("git status");
  });

  it("Ctrl+Alt+C (AltGr) kabuğa gitmiyor, satırı silmiyor", () => {
    // Windows'ta AltGr tarayıcıya ctrl+alt olarak geliyor; Türkçe Q'da
    // sürekli basılan bir tuş. Eskiden Alt görülmüyor ve tuş SIGINT oluyordu.
    const { container } = render(<CommandInput />);
    const el = field(container)!;
    fireEvent.change(el, { target: { value: "echo selam" } });
    fireEvent.keyDown(el, { key: "c", ctrlKey: true, altKey: true });

    expect(sendKeys).not.toHaveBeenCalled();
    expect(el.value).toBe("echo selam");
  });

  /*
   * Tab kutuyu TERK ETMİYOR.
   *
   * BİLDİRİLEN HATA: "cd Desktop yazdım ve Tab'a bastım, komut yazma yeri
   * kayboldu, odak üstteki terminale geçti ve komutları oraya yazmaya
   * başladım." Eski hâl bunu bilerek yapıyordu (satırı kabuğa devrediyordu);
   * kullanıcı için kutunun bir tuşla yok olması arızaydı.
   */
  it("Tab satırı kabuğa devretmiyor, kutu açık kalıyor", () => {
    const { container } = render(<CommandInput />);
    const el = field(container)!;
    fireEvent.change(el, { target: { value: "cd Desktop" } });
    const olay = fireEvent.keyDown(el, { key: "Tab" });
    expect(sendKeys, "hiçbir şey kabuğa gitmemeli").not.toHaveBeenCalled();
    expect(field(container), "kutu yerinde").not.toBe(null);
    expect(field(container)!.value, "yazılan duruyor").toBe("cd Desktop");
    // Tarayıcının Tab'ı odağı sonraki öğeye (terminale) taşırdı; engellenmeli.
    expect(olay, "varsayılan engellenmeli").toBe(false);
  });

  it("Tab liste açıkken seçili öneriyi kutuya yazıyor", () => {
    // Kabuğun tamamlamasıyla aynı yürüyüş: `cd Desk` → Tab → `cd Desktop`.
    const { container } = render(<CommandInput />);
    const el = field(container)!;
    fireEvent.change(el, { target: { value: "cd Desk" } });
    act(() => {
      const ui = useStore.getState().ui;
      useStore.setState({
        ui: { ...ui, suggest: { items: ["cd Desktop"], index: 0, input: "cd Desk", kind: "dirs" } },
      });
    });
    fireEvent.keyDown(el, { key: "Tab" });
    expect(field(container)!.value).toBe("cd Desktop");
    expect(sendKeys).not.toHaveBeenCalled();
  });

  it("kabul edilen öneri kutuya yazılıyor, kabuğa değil", () => {
    // Ham kipte öneri kabuğa DEL tuşlarıyla yazılıyor; burada kabuğun satırı
    // zaten boş, o yol satırı bozardı.
    const { container } = render(<CommandInput />);
    act(() => {
      const ui = useStore.getState().ui;
      useStore.setState({
        ui: { ...ui, suggest: { items: ["npm run build"], index: 0, input: "npm", kind: "history" } },
      });
    });
    act(() => useStore.getState().acceptSuggestion());
    expect(field(container)!.value).toBe("npm run build");
    expect(sendKeys, "öneri kabuğa gitmemeli").not.toHaveBeenCalled();
  });

  /*
   * Boş satırda yukarı ok: GEÇMİŞ PANELİ.
   *
   * İstenen Warp'ın davranışı: kutuya odaklanıp yukarı oka basınca üstünde
   * "HISTORY" başlıklı bir panel açılıyor. Önceki hâli Ctrl+R penceresini
   * açıyordu — doğru işi yapıyordu ama ekranın ortasında bir ÖRTÜ olarak, göz
   * yazdığı yerden kopuyordu.
   */
  it("boş kutuda yukarı ok geçmiş panelini açıyor", () => {
    useStore.setState({
      suggestHistory: [
        { command: "npm test", cwd: null, tabId: TAB },
        { command: "git status", cwd: null, tabId: TAB },
      ],
    });
    const { container } = render(<CommandInput />);
    fireEvent.keyDown(field(container)!, { key: "ArrowUp" });

    const suggest = useStore.getState().ui.suggest;
    expect(suggest, "panel açılmadı").not.toBe(null);
    expect(suggest!.items).toEqual(["npm test", "git status"]);
    expect(useStore.getState().ui.searchOpen, "örtü açılmış").toBe(false);
  });

  /*
   * BİLDİRİLEN İSTEK: "bir terminal açtığımda yukarı oka bastığımda o
   * terminalin geçmişi gelsin."
   *
   * Eskiden liste TÜM sekmelerin ortak havuzundan geliyordu: yeni açılan bir
   * sekmede yukarı ok, o sekmede hiç çalıştırılmamış komutları gösteriyordu.
   * Kabuğun kendi yukarı oku da öyle çalışmaz — kendi oturumunun satırlarını
   * hatırlar.
   */
  it("yukarı ok BAŞKA sekmenin komutlarını getirmiyor", () => {
    useStore.setState({
      suggestHistory: [
        { command: "yarn build", cwd: null, tabId: "baska-sekme" },
        { command: "npm test", cwd: null, tabId: TAB },
      ],
    });
    const { container } = render(<CommandInput />);
    fireEvent.keyDown(field(container)!, { key: "ArrowUp" });

    expect(useStore.getState().ui.suggest!.items).toEqual(["npm test"]);
  });

  it("Ctrl+A kapsamı tüm sekmelere genişletiyor, tekrar basmak geri alıyor", () => {
    // Kullanıcı isterse tüm geçmişe bakabilmeli; varsayılan yine bu sekme.
    useStore.setState({
      suggestHistory: [
        { command: "yarn build", cwd: null, tabId: "baska-sekme" },
        { command: "npm test", cwd: null, tabId: TAB },
      ],
    });
    const { container } = render(<CommandInput />);
    const el = field(container)!;
    fireEvent.keyDown(el, { key: "ArrowUp" });
    expect(useStore.getState().ui.suggest!.scope).toBe("tab");

    act(() => {
      fireEvent.keyDown(el, { key: "a", ctrlKey: true });
    });
    expect(useStore.getState().ui.suggest!.items).toEqual(["yarn build", "npm test"]);
    expect(useStore.getState().ui.suggest!.scope).toBe("all");

    act(() => {
      fireEvent.keyDown(el, { key: "a", ctrlKey: true });
    });
    expect(useStore.getState().ui.suggest!.items).toEqual(["npm test"]);
    expect(useStore.getState().ui.suggest!.scope).toBe("tab");
  });

  it("kendi geçmişi olmayan YENİ sekmede tüm geçmişe düşüyor", () => {
    /*
     * Yeni sekmenin kendi geçmişi yok; hiçbir şey açmamak "geçmişim gitti"
     * demek olurdu — bu panelin var oluş sebebi tam olarak bunu önlemek.
     * Liste karışık geliyor ama kapsam etiketi de "tüm sekmeler" diyor:
     * sessizce değil, adıyla.
     */
    useStore.setState({
      suggestHistory: [{ command: "yarn build", cwd: null, tabId: "baska-sekme" }],
    });
    const { container } = render(<CommandInput />);
    fireEvent.keyDown(field(container)!, { key: "ArrowUp" });

    const suggest = useStore.getState().ui.suggest;
    expect(suggest!.items).toEqual(["yarn build"]);
    expect(suggest!.scope, "kapsam yalan söylüyor").toBe("all");
  });

  it("panel kapalıyken Ctrl+A ele geçirilmiyor: tarayıcının tümünü seç'i kalsın", () => {
    const { container } = render(<CommandInput />);
    const el = field(container)!;
    fireEvent.change(el, { target: { value: "npm test" } });
    const olay = fireEvent.keyDown(el, { key: "a", ctrlKey: true });

    expect(olay, "varsayılan engellenmiş").toBe(true);
    expect(useStore.getState().ui.suggest).toBe(null);
  });

  it("geçmiş boşsa hiçbir şey açılmıyor", () => {
    // Boş bir panel tuşu bozuk gösterirdi.
    useStore.setState({ suggestHistory: [] });
    const { container } = render(<CommandInput />);
    fireEvent.keyDown(field(container)!, { key: "ArrowUp" });
    expect(useStore.getState().ui.suggest).toBe(null);
  });

  it("panel açıkken Enter seçileni KUTUYA yazıyor, çalıştırmıyor", () => {
    // Tek Enter'la geçmişten komut koşturmak `rm -rf` sınıfı bir kaza demek.
    useStore.setState({
      suggestHistory: [{ command: "git push --force", cwd: null, tabId: TAB }],
    });
    const { container } = render(<CommandInput />);
    const el = field(container)!;
    fireEvent.keyDown(el, { key: "ArrowUp" });
    act(() => {
      fireEvent.keyDown(el, { key: "Enter" });
    });

    expect(field(container)!.value).toBe("git push --force");
    expect(sendKeys, "komut kabuğa gitmiş").not.toHaveBeenCalled();
  });

  /*
   * mac'te Cmd tuşu Ctrl DEĞİL.
   *
   * ÖLÇÜLEN HATA: kutuya yapıştırmak isteyen kullanıcıya WebKit'in pano izni
   * düğmesi ("Paste") çıkıyor, tıklayınca hiçbir şey olmuyordu. Aynı satırın
   * ikizi burada: kaçış kapısı `e.ctrlKey || e.metaKey` diyordu ve mac'te
   * Cmd+C SIGINT'e dönüşüyordu — kutudaki metni kopyalamak imkânsız,
   * üstelik yazılan satır da siliniyordu.
   */
  it("Cmd+C kabuğa SIGINT göndermiyor", () => {
    const { container } = render(<CommandInput />);
    const el = field(container)!;
    fireEvent.change(el, { target: { value: "echo selam" } });
    fireEvent.keyDown(el, { key: "c", metaKey: true });

    expect(sendKeys, "Cmd+C kabuğa gitmiş").not.toHaveBeenCalled();
    expect(el.value, "yazılan satır silinmiş").toBe("echo selam");
  });

  it("Ctrl+C hâlâ kabuğa gidiyor", () => {
    // Kontrol grubu: kaçış kapısı kapanmadı, yalnızca doğru tuşa bağlandı.
    const { container } = render(<CommandInput />);
    fireEvent.keyDown(field(container)!, { key: "c", ctrlKey: true });
    expect(sendKeys).toHaveBeenCalledWith("\x03");
  });

  it("silahlı durumda şerit tekrar basmayı söylüyor", () => {
    // Bir basışın hiçbir şey yapmıyormuş gibi görünmesi, iki basış kuralını
    // kullanıcı gözünde arızaya çevirirdi.
    seedRunning();
    appInputOff();
    useStore.setState({ stopArmed: TAB });

    const { container } = render(<CommandInput />);
    expect(container.querySelector(".command-running.armed"), "silahlı hâl çizilmedi")
      .not.toBe(null);
    expect(container.textContent).toContain("Durdurmak için tekrar basın");
  });

  it("silahlı durumda yanıt satırı da tekrar basmayı söylüyor", () => {
    // İlk Ctrl+C odak kutunun DIŞINDAYKEN geliyor (kenar çubuğu, sekme
    // çubuğu); geri bildirim yine bakılan yerde, kutunun kendisinde.
    seedRunning();
    useStore.setState({ stopArmed: TAB });

    const { container } = render(<CommandInput />);
    expect(container.querySelector(".command-input.armed"), "silahlı hâl çizilmedi").not.toBe(null);
    expect(field(container)!.placeholder).toBe("Durdurmak için tekrar basın");
    expect(container.querySelector(".running-stop")!.textContent).toBe("Tekrar basın");
  });

  it("kabuk kapandıysa kutu da şerit de YOK", () => {
    // BİLDİRİLEN HATA: "'Bu sekmedeki kabuk kapandı' diyor ama altta komut
    // yazın kısmı aktif." Yazılan her şey olmayan bir sürece gidiyordu.
    // Ne yapılacağını terminalin üstündeki kutu söylüyor.
    seed();
    useStore.setState({ exited: { [TAB]: true } });

    const { container } = render(<CommandInput />);
    expect(field(container), "ölü kabukta kutu açık").toBe(null);
    expect(container.querySelector(".command-running"), "durdurulacak bir şey yok").toBe(null);

    useStore.setState({ exited: {} });
  });
});
