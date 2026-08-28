// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLanguage } from "../lib/i18n";
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

function setSuggest(items: string[], index = 0, input = "np") {
  const ui = useStore.getState().ui;
  useStore.setState({ ui: { ...ui, suggest: items.length ? { items, index, input } : null } });
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
    expect(rows(container)[0].textContent).toBe("npm test");
    expect(rows(container)[1].textContent).toBe("npm run dev");
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
    expect(selected(container)!.textContent).toBe("a2");
    expect(container.querySelectorAll(".suggest-row.on")).toHaveLength(1);
  });

  it("sayaç seçimi gösteriyor", () => {
    setSuggest(["a1", "a2", "a3"], 2, "a");
    const { container } = render(<SuggestionBar />);
    expect(container.querySelector(".suggest-foot .kbd")!.textContent).toBe("3/3");
  });

  it("gezinme seçimi değiştiriyor ve başa dönüyor", async () => {
    setSuggest(["a1", "a2", "a3"], 0, "a");
    const { container } = render(<SuggestionBar />);

    await act(async () => useStore.getState().moveSuggestion(1));
    expect(selected(container)!.textContent).toBe("a2");

    await act(async () => useStore.getState().moveSuggestion(1));
    expect(selected(container)!.textContent).toBe("a3");

    // Sonda ileri gitmek başa dönüyor.
    await act(async () => useStore.getState().moveSuggestion(1));
    expect(selected(container)!.textContent).toBe("a1");

    await act(async () => useStore.getState().moveSuggestion(-1));
    expect(selected(container)!.textContent).toBe("a3");
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

    expect(accept).toHaveBeenCalledWith("a3");
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

    expect(accept).toHaveBeenCalledWith("a2");
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
    expect(container.querySelector(".suggest-foot .dim")!.textContent).toContain("kabul et");

    await act(async () => {
      setLanguage("en");
    });
    expect(container.querySelector(".suggest-foot .dim")!.textContent).toContain("accept");
  });
});
