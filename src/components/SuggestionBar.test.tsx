// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLanguage } from "../lib/i18n";
import { setPlatform } from "../lib/platform";
import { useStore } from "../store/useStore";
import { SuggestionBar } from "./SuggestionBar";

/**
 * Komut önerisi listesinin arayüz davranışı.
 *
 * Öneri deposunda hesaplanıyor (lib/suggest.ts testleri o hesabı kapsıyor);
 * burada test edilen şey listenin doğru çizilmesi, seçimin gezinmeyle
 * ilerlemesi ve kabul etmenin ETKİN OTURUMA ulaşması. Son madde önemli:
 * öneri kabul edilip kabuğa yazılmazsa özellik hiç yok gibi.
 */

const rows = (container: HTMLElement) => [...container.querySelectorAll(".suggest-row")];
const selected = (container: HTMLElement) => container.querySelector(".suggest-row.on");
/** Satırın komut metni. Satırda ayrıca istem işareti ve zaman damgası var. */
const cmd = (row: Element | null) => row?.querySelector(".suggest-cmd")?.textContent;

function setSuggest(items: string[], index = 0, input = "np") {
  const ui = useStore.getState().ui;
  useStore.setState({
    ui: { ...ui, suggest: items.length ? { items, index, input, kind: "history" } : null },
  });
}

beforeEach(() => {
  setLanguage("tr");
  useStore.setState({ suggestHistory: [] });
  setSuggest([]);
});

afterEach(() => {
  cleanup();
  setSuggest([]);
});

describe("öneri çubuğu", () => {
  it("öneri yokken hiçbir şey çizmiyor", () => {
    const { container } = render(<SuggestionBar />);
    expect(container.innerHTML).toBe("");
  });

  it("önerileri listeliyor", () => {
    setSuggest(["npm test", "npm run dev"]);
    const { container } = render(<SuggestionBar />);
    expect(rows(container)).toHaveLength(2);
    expect(cmd(rows(container)[0])).toBe("npm test");
    expect(cmd(rows(container)[1])).toBe("npm run dev");
  });

  it("yazılan kısım ile önerinin devamı ayrı gösteriliyor", () => {
    // "bunu yazdınız, şu eklenecek" ayrımı görünsün.
    setSuggest(["npm test"], 0, "npm t");
    const { container } = render(<SuggestionBar />);
    expect(container.querySelector(".suggest-typed")!.textContent).toBe("npm t");
    expect(container.querySelector(".suggest-rest")!.textContent).toBe("est");
  });

  it("seçili öneri işaretli", () => {
    setSuggest(["a1", "a2", "a3"], 1, "a");
    const { container } = render(<SuggestionBar />);
    expect(cmd(selected(container))).toBe("a2");
    expect(container.querySelectorAll(".suggest-row.on")).toHaveLength(1);
  });

  it("sayaç seçimi gösteriyor", () => {
    setSuggest(["a1", "a2", "a3"], 2, "a");
    const { container } = render(<SuggestionBar />);
    expect(container.querySelector(".suggest-head .kbd")!.textContent).toBe("3/3");
  });

  it("başlık şeridi var", () => {
    // Kabuğun kendi tahmin listesi de ekranda olabiliyor; hangisinin
    // uygulamaya ait olduğu okunabilmeli.
    setSuggest(["a1"], 0, "a");
    const { container } = render(<SuggestionBar />);
    expect(container.querySelector(".suggest-title")!.textContent).toBe("GEÇMİŞ");
  });

  it("komutun en son çalıştırıldığı an satırda yazıyor", () => {
    // Aynı ön ekle başlayan iki komut arasındaki seçim çoğu zaman buna
    // bakılarak yapılıyor.
    const now = new Date();
    now.setHours(9, 5, 0, 0);
    useStore.setState({
      suggestHistory: [{ command: "npm test", cwd: null, at: now.getTime() }],
    });
    setSuggest(["npm test"], 0, "np");
    const { container } = render(<SuggestionBar />);
    expect(container.querySelector(".suggest-when")!.textContent).toContain("09");
  });

  it("zamanı bilinmeyen komutta alan boş kalıyor", () => {
    // Geçmiş henüz yüklenmediyse satır yine de çizilmeli.
    setSuggest(["npm test"], 0, "np");
    const { container } = render(<SuggestionBar />);
    expect(container.querySelector(".suggest-when")!.textContent).toBe("");
  });

  it("gezinme seçimi değiştiriyor ve başa dönüyor", async () => {
    setSuggest(["a1", "a2", "a3"], 0, "a");
    const { container } = render(<SuggestionBar />);

    await act(async () => useStore.getState().moveSuggestion(1));
    expect(cmd(selected(container))).toBe("a2");

    await act(async () => useStore.getState().moveSuggestion(1));
    expect(cmd(selected(container))).toBe("a3");

    // Sonda ileri gitmek başa dönüyor.
    await act(async () => useStore.getState().moveSuggestion(1));
    expect(cmd(selected(container))).toBe("a1");

    await act(async () => useStore.getState().moveSuggestion(-1));
    expect(cmd(selected(container))).toBe("a3");
  });

  it("satıra tıklamak O ÖNERİYİ kabul ediyor", async () => {
    // Seçili olan değil, tıklanan öneri gitmeli.
    const accept = vi.fn();
    const focus = vi.fn();
    const spy = vi
      .spyOn(useStore.getState(), "activeSession")
      .mockReturnValue({ acceptSuggestion: accept, focus } as never);

    setSuggest(["a1", "a2", "a3"], 0, "a");
    const { container } = render(<SuggestionBar />);
    await act(async () => {
      fireEvent.click(rows(container)[2]);
    });

    // İkinci argüman öneriyi ÜRETEN önek: kabul ederken satır ekrandan
    // yeniden okunmuyor (okunduğunda hayalet metin yüzünden yanlış çıkıyor ve
    // komut kabuğa iki kez gidebiliyordu).
    expect(accept).toHaveBeenCalledWith("a3", "a");
    expect(focus, "kabul sonrası odak terminale dönmeli").toHaveBeenCalled();
    expect(useStore.getState().ui.suggest, "kabul sonrası liste kapanmalı").toBe(null);
    spy.mockRestore();
  });

  it("kabul etmek seçili öneriyi gönderiyor", async () => {
    const accept = vi.fn();
    const spy = vi
      .spyOn(useStore.getState(), "activeSession")
      .mockReturnValue({ acceptSuggestion: accept, focus: () => {} } as never);

    setSuggest(["a1", "a2"], 1, "a");
    render(<SuggestionBar />);
    await act(async () => useStore.getState().acceptSuggestion());

    expect(accept).toHaveBeenCalledWith("a2", "a");
    spy.mockRestore();
  });

  it("etkin oturum yoksa çökmüyor", async () => {
    const spy = vi.spyOn(useStore.getState(), "activeSession").mockReturnValue(null);
    setSuggest(["a1"], 0, "a");
    render(<SuggestionBar />);
    await act(async () => useStore.getState().acceptSuggestion());
    // Liste yine kapanmalı: açık kalması kullanıcıyı kilitler.
    expect(useStore.getState().ui.suggest).toBe(null);
    spy.mockRestore();
  });

  it("ipucu metni dile göre", async () => {
    setSuggest(["a1"], 0, "a");
    const { container } = render(<SuggestionBar />);
    const foot = () => container.querySelector(".suggest-foot")!.textContent;
    expect(foot()).toContain("kabul et");

    await act(async () => {
      setLanguage("en");
    });
    expect(foot()).toContain("accept");
  });

  it("tuşlar rozet olarak çiziliyor", () => {
    // Düz metin olarak yazıldığında hangi işaretin TUŞ olduğu okunmuyordu.
    setSuggest(["a1"], 0, "a");
    const { container } = render(<SuggestionBar />);
    // Üç ok + Esc + silme.
    expect(container.querySelectorAll(".suggest-foot .keycap")).toHaveLength(5);
    expect(container.querySelector(".keycap-word")!.textContent).toBe("Esc");
  });
});

/*
 * Geçmişten silme.
 *
 * BİLDİRİLEN İSTEK: "terminal geçmişini yukarı ok tuşuna basınca
 * gösteriyoruz, istemediklerimizi oradan kaldırabilmeliyiz."
 *
 * Silmenin kendisi (kapsam, disk, onay) depoda test ediliyor
 * (`store/deleteSuggestion.test.ts`); burada bağlanan şey panelin doğru
 * satırı doğru yoldan istemesi ve yolun görünür olması.
 */
describe("öneri çubuğunda silme", () => {
  const del = (row: Element) => row.parentElement!.querySelector<HTMLButtonElement>(".suggest-del");
  const deleteSuggestionAt = vi.fn(async () => {});
  const original = useStore.getState().deleteSuggestionAt;

  beforeEach(() => {
    setPlatform("windows");
    deleteSuggestionAt.mockClear();
    useStore.setState({ deleteSuggestionAt });
  });

  afterEach(() => {
    useStore.setState({ deleteSuggestionAt: original });
    setPlatform("windows");
  });

  it("geçmiş satırlarında silme düğmesi var", () => {
    setSuggest(["a1", "a2"], 0, "a");
    const { container } = render(<SuggestionBar />);
    expect(rows(container).map((row) => !!del(row))).toEqual([true, true]);
  });

  it("klasör önerilerinde silme düğmesi de ipucu da yok", () => {
    // O satırlar diskteki klasörler, geçmiş değil: silinecek bir şey yok.
    const ui = useStore.getState().ui;
    useStore.setState({
      ui: { ...ui, suggest: { items: ["cd src"], index: 0, input: "cd ", kind: "dirs" } },
    });
    const { container } = render(<SuggestionBar />);
    expect(container.querySelector(".suggest-del")).toBe(null);
    expect(container.querySelector(".suggest-foot")!.textContent).not.toContain("sil");
  });

  it("düğme TIKLANAN satırı siliyor ve onu kabul etmiyor", async () => {
    // Seçili olan değil, tıklanan satır gitmeli — kabul etmedeki kuralın
    // aynısı. Tıklama satıra da ulaşsaydı komut kutuya yazılırdı.
    const accept = vi.fn();
    const spy = vi
      .spyOn(useStore.getState(), "activeSession")
      .mockReturnValue({ acceptSuggestion: accept, focus: () => {} } as never);
    setSuggest(["a1", "a2", "a3"], 0, "a");
    const { container } = render(<SuggestionBar />);

    await act(async () => {
      fireEvent.click(del(rows(container)[2])!);
    });

    expect(deleteSuggestionAt).toHaveBeenCalledWith(2);
    expect(accept, "silme düğmesi satırı kabul etti").not.toHaveBeenCalled();
    expect(useStore.getState().ui.suggest, "panel kapanmamalı").not.toBe(null);
    spy.mockRestore();
  });

  it("düğmeye basmak odağı kutudan almıyor", () => {
    // Onay kapandığında kullanıcı kaldığı yerden yazmaya devam etmeli.
    setSuggest(["a1"], 0, "a");
    const { container } = render(<SuggestionBar />);
    const olay = fireEvent.mouseDown(del(rows(container)[0])!);
    expect(olay, "mousedown varsayılanı engellenmedi").toBe(false);
  });

  it("düğmenin ipucu tuşu da söylüyor", () => {
    setSuggest(["a1"], 0, "a");
    const { container } = render(<SuggestionBar />);
    expect(del(rows(container)[0])!.title).toBe("Geçmişten sil (Shift+Del)");
  });

  it("alt satırda silme tuşu platformun yazımıyla", () => {
    // mac'te kısayollar simgeyle yazılıyor (bkz. `prettyCombo`); "Shift+Del"
    // orada başka bir sistemin diliyle konuşmak olurdu.
    setSuggest(["a1"], 0, "a");
    const { container, unmount } = render(<SuggestionBar />);
    const last = () => [...container.querySelectorAll(".suggest-foot .keycap")].at(-1)!.textContent;
    expect(last()).toBe("Shift+Del");
    expect(container.querySelector(".suggest-foot")!.textContent).toContain("sil");
    unmount();

    setPlatform("macos");
    const mac = render(<SuggestionBar />);
    expect([...mac.container.querySelectorAll(".suggest-foot .keycap")].at(-1)!.textContent).toBe(
      "⇧⌦",
    );
  });
});
