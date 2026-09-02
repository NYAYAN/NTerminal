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
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  sessions.set(TAB, {
    sendKeys,
    focus,
    setAppInput,
    ctrlCAction,
    copyForCtrlC,
    inputSignals,
  } as never);
  seed();
});

afterEach(() => {
  cleanup();
  sessions.delete(TAB);
  useStore.setState({ groups: [], activeGroupId: null, inputSignals: {}, appInputSink: null });
});

describe("komut satırı kutusu", () => {
  it("kabuk istemde beklerken açılıyor", () => {
    const { container } = render(<CommandInput />);
    expect(field(container)).not.toBe(null);
  });

  it("komut çalışırken DURDUR şeridi geliyor", () => {
    // ÖLÇÜLEN SORUN: "Enter'a bastım, komut satırı kayboldu. Durdurmak
    // istersem nasıl yapacağım?" Kutunun kapanması doğru; ekranda bunu
    // söyleyen ve yolu gösteren bir şey olmaması değil.
    seed({ atPrompt: false });
    useStore.setState({ running: { [TAB]: true } });

    const { container } = render(<CommandInput />);
    expect(field(container), "çalışırken kutu kapalı olmalı").toBe(null);

    const stop = container.querySelector<HTMLButtonElement>(".running-stop");
    expect(stop, "durdurma düğmesi yok").not.toBe(null);
    fireEvent.click(stop!);
    // Ctrl+C'nin baytı tek yerden geliyor; düğme de onu göndermeli.
    expect(sendKeys).toHaveBeenCalledWith("\x03");

    useStore.setState({ running: {} });
  });

  it("tam ekran programda şerit de YOK", () => {
    // vim/less ekranı kendisi yönetiyor; Ctrl+C'nin anlamı programa ait.
    seed({ atPrompt: false, altScreen: true });
    useStore.setState({ running: { [TAB]: true } });
    const { container } = render(<CommandInput />);
    expect(container.innerHTML).toBe("");
    useStore.setState({ running: {} });
  });

  it("komut çalışırken kutu kapalı", () => {
    // Çalışan komut tuşları o an isteyebilir (parola, y/n). Kutu burada
    // açık kalsaydı kullanıcı ona cevap veremezdi.
    seed({ atPrompt: false });
    useStore.setState({ running: { [TAB]: true } });
    const { container } = render(<CommandInput />);
    expect(field(container)).toBe(null);
    useStore.setState({ running: {} });
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
        { command: "npm test", cwd: null },
        { command: "git status", cwd: null },
      ],
    });
    const { container } = render(<CommandInput />);
    fireEvent.keyDown(field(container)!, { key: "ArrowUp" });

    const suggest = useStore.getState().ui.suggest;
    expect(suggest, "panel açılmadı").not.toBe(null);
    expect(suggest!.items).toEqual(["npm test", "git status"]);
    expect(useStore.getState().ui.searchOpen, "örtü açılmış").toBe(false);
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
    useStore.setState({ suggestHistory: [{ command: "git push --force", cwd: null }] });
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
    seed({ atPrompt: false });
    useStore.setState({ running: { [TAB]: true }, stopArmed: TAB });

    const { container } = render(<CommandInput />);
    expect(container.querySelector(".command-running.armed"), "silahlı hâl çizilmedi")
      .not.toBe(null);
    expect(container.textContent).toContain("Durdurmak için tekrar basın");

    useStore.setState({ running: {}, stopArmed: null });
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
