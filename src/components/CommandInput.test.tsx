// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLanguage } from "../lib/i18n";
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
/** Seçim varken Ctrl+C kopyalamalı; kararı oturum veriyor. */
const wantsCtrlCCopy = vi.fn(() => false);
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
  sendKeys.mockClear();
  focus.mockClear();
  setAppInput.mockClear();
  wantsCtrlCCopy.mockReturnValue(false);
  sessions.set(TAB, {
    sendKeys,
    focus,
    setAppInput,
    wantsCtrlCCopy,
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
    expect(sendKeys).toHaveBeenCalledWith("");

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

  it("seçim varken Ctrl+C kabuğu durdurmuyor", () => {
    // Yukarıdan metin seçip Ctrl+C'ye basan biri kopyalamak istiyor. Kararı
    // oturum veriyor; kutu onu bozmamalı.
    wantsCtrlCCopy.mockReturnValue(true);
    const { container } = render(<CommandInput />);
    fireEvent.keyDown(field(container)!, { key: "c", ctrlKey: true });
    expect(sendKeys, "seçim varken SIGINT gitmemeli").not.toHaveBeenCalled();
  });

  it("Tab satırı kabuğa devredip kutuyu kapatıyor", () => {
    // Sekme tamamlaması kabuğun işi ve kutudaki metni göremiyor. Devir
    // olmadan Tab hiçbir şey yapmazdı.
    const { container } = render(<CommandInput />);
    const el = field(container)!;
    fireEvent.change(el, { target: { value: "cd src" } });
    fireEvent.keyDown(el, { key: "Tab" });
    expect(sendKeys).toHaveBeenCalledWith("cd src\t");
    expect(field(container), "devirden sonra kutu kapanmalı").toBe(null);
  });

  it("kabul edilen öneri kutuya yazılıyor, kabuğa değil", () => {
    // Ham kipte öneri kabuğa DEL tuşlarıyla yazılıyor; burada kabuğun satırı
    // zaten boş, o yol satırı bozardı.
    const { container } = render(<CommandInput />);
    act(() => {
      const ui = useStore.getState().ui;
      useStore.setState({
        ui: { ...ui, suggest: { items: ["npm run build"], index: 0, input: "npm" } },
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
