// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useStore } from "./useStore";

/**
 * Öneri boru hattının depo tarafı.
 *
 * Saf sıralama mantığı `lib/suggest.ts` testlerinde; burada test edilen şey
 * o mantığın arayüz durumuna DOĞRU bağlanması: ayar kapalıysa hiç açılmaması,
 * imleç ortadayken açılmaması, gezinme sırasında seçimin kaybolmaması ve
 * eşleşme kalmayınca kapanması. Bu geçişlerin biri bozulduğunda liste ya hiç
 * görünmüyor ya da ekranda takılı kalıyor — ikisi de sessiz.
 */

const HISTORY = ["npm run bundle", "npm test", "git status", "npm run dev"];

function setBehavior(patch: Record<string, unknown>) {
  const settings = useStore.getState().settings;
  useStore.setState({
    settings: { ...settings, behavior: { ...settings.behavior, ...patch } },
  });
}

const suggest = () => useStore.getState().ui.suggest;

beforeEach(() => {
  const ui = useStore.getState().ui;
  useStore.setState({ ui: { ...ui, suggest: null }, suggestHistory: [...HISTORY] });
  setBehavior({ appSuggestions: true });
});

describe("öneri durumu", () => {
  it("ön eke uyan öneriler açılıyor", () => {
    useStore.getState().updateSuggestions({ prefix: "npm", full: "npm" });
    expect(suggest()?.items).toEqual(["npm run bundle", "npm test", "npm run dev"]);
    expect(suggest()?.index).toBe(0);
    expect(suggest()?.input).toBe("npm");
  });

  it("ayar kapalıysa hiç açılmıyor", () => {
    setBehavior({ appSuggestions: false });
    useStore.getState().updateSuggestions({ prefix: "npm", full: "npm" });
    expect(suggest()).toBe(null);
  });

  it("ayar kapatılınca açık liste kapanıyor", () => {
    useStore.getState().updateSuggestions({ prefix: "npm", full: "npm" });
    expect(suggest()).not.toBe(null);
    setBehavior({ appSuggestions: false });
    useStore.getState().updateSuggestions({ prefix: "npm", full: "npm" });
    expect(suggest()).toBe(null);
  });

  it("imleç satır ortasındayken açılmıyor", () => {
    // Kabul etmek imlecin sağındaki metni yok sayardı.
    useStore.getState().updateSuggestions({ prefix: "npm", full: "npm test" });
    expect(suggest()).toBe(null);
  });

  it("eşleşme kalmayınca kapanıyor", () => {
    useStore.getState().updateSuggestions({ prefix: "npm", full: "npm" });
    expect(suggest()).not.toBe(null);
    useStore.getState().updateSuggestions({ prefix: "kubectl", full: "kubectl" });
    expect(suggest()).toBe(null);
  });

  it("boş satırda kapanıyor — ok tuşları kabuğa kalsın", () => {
    // Bu davranış özelliğin güvenliği: liste açıkken oklar listede geziniyor.
    // Boş satırda liste kapalı olmazsa kabuğun kendi geçmişi erişilemez olur.
    useStore.getState().updateSuggestions({ prefix: "npm", full: "npm" });
    useStore.getState().updateSuggestions({ prefix: "", full: "" });
    expect(suggest()).toBe(null);
  });

  it("aynı ön ekte seçim korunuyor", () => {
    // Kullanıcı listede gezinirken yeniden hesap seçimi başa atmamalı.
    useStore.getState().updateSuggestions({ prefix: "npm", full: "npm" });
    useStore.getState().moveSuggestion(1);
    expect(suggest()?.index).toBe(1);

    useStore.getState().updateSuggestions({ prefix: "npm", full: "npm" });
    expect(suggest()?.index).toBe(1);
  });

  it("ön ek değişince seçim başa dönüyor", () => {
    useStore.getState().updateSuggestions({ prefix: "npm", full: "npm" });
    useStore.getState().moveSuggestion(1);
    useStore.getState().updateSuggestions({ prefix: "npm r", full: "npm r" });
    expect(suggest()?.index).toBe(0);
  });

  it("liste kısalınca seçim sınır içinde kalıyor", () => {
    // "npm" → 3 öneri; "npm r" → 2 öneri. Seçim 2'de kalsaydı tanımsız öneri
    // kabul edilmeye çalışılırdı.
    useStore.getState().updateSuggestions({ prefix: "npm", full: "npm" });
    useStore.getState().moveSuggestion(1);
    useStore.getState().moveSuggestion(1);
    expect(suggest()?.index).toBe(2);

    useStore.setState({ suggestHistory: ["npm run bundle", "npm run dev"] });
    useStore.getState().updateSuggestions({ prefix: "npm run", full: "npm run" });
    expect(suggest()?.items).toHaveLength(2);
    expect(suggest()!.index).toBeLessThan(suggest()!.items.length);
  });

  it("kapatma listeyi siliyor", () => {
    useStore.getState().updateSuggestions({ prefix: "npm", full: "npm" });
    useStore.getState().closeSuggestions();
    expect(suggest()).toBe(null);
    // İkinci kez kapatmak zararsız olmalı.
    useStore.getState().closeSuggestions();
    expect(suggest()).toBe(null);
  });
});

describe("öneri kaynağı", () => {
  it("yeni komut başa ekleniyor", () => {
    useStore.getState().noteCommand("kubectl get pods");
    expect(useStore.getState().suggestHistory[0]).toBe("kubectl get pods");
  });

  it("var olan komut başa taşınıyor, yinelenmiyor", () => {
    useStore.getState().noteCommand("git status");
    const list = useStore.getState().suggestHistory;
    expect(list[0]).toBe("git status");
    expect(list.filter((c) => c === "git status")).toHaveLength(1);
  });

  it("boş komut eklenmiyor", () => {
    const before = useStore.getState().suggestHistory.length;
    useStore.getState().noteCommand("");
    useStore.getState().noteCommand("   ");
    expect(useStore.getState().suggestHistory).toHaveLength(before);
  });

  it("kaynak sınırsız büyümüyor", () => {
    for (let i = 0; i < 600; i++) useStore.getState().noteCommand(`komut-${i}`);
    // Her tuş vuruşunda taranıyor; liste sınırlı kalmalı.
    expect(useStore.getState().suggestHistory.length).toBeLessThanOrEqual(400);
    expect(useStore.getState().suggestHistory[0]).toBe("komut-599");
  });

  it("komut çalıştırıldığında kaynak güncelleniyor ve liste kapanıyor", () => {
    useStore.getState().updateSuggestions({ prefix: "npm", full: "npm" });
    expect(suggest()).not.toBe(null);

    // onCommandStart'ın yaptığı iki iş.
    useStore.getState().noteCommand("npm run e2e");
    useStore.getState().closeSuggestions();

    expect(useStore.getState().suggestHistory[0]).toBe("npm run e2e");
    expect(suggest()).toBe(null);
  });
});

describe("öneriyi kabul etme", () => {
  it("seçili öneri oturuma gidiyor ve liste kapanıyor", () => {
    const accept = vi.fn();
    const spy = vi
      .spyOn(useStore.getState(), "activeSession")
      .mockReturnValue({ acceptSuggestion: accept, focus: () => {} } as never);

    useStore.getState().updateSuggestions({ prefix: "npm", full: "npm" });
    useStore.getState().moveSuggestion(1);
    useStore.getState().acceptSuggestion();

    // İkinci argüman öneriyi ÜRETEN önek. Kabul ederken satır ekrandan
    // yeniden okunmuyor: okuma boş dönebiliyor ve o durumda önerinin tamamı
    // yazılıp komut kabuğa iki kez giriyordu.
    expect(accept).toHaveBeenCalledWith("npm test", "npm");
    expect(suggest()).toBe(null);
    spy.mockRestore();
  });

  it("liste kapalıyken kabul etmek hiçbir şey yapmıyor", () => {
    const accept = vi.fn();
    const spy = vi
      .spyOn(useStore.getState(), "activeSession")
      .mockReturnValue({ acceptSuggestion: accept, focus: () => {} } as never);

    useStore.getState().acceptSuggestion();
    expect(accept).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("geçersiz indeks güvenli", () => {
    const accept = vi.fn();
    const spy = vi
      .spyOn(useStore.getState(), "activeSession")
      .mockReturnValue({ acceptSuggestion: accept, focus: () => {} } as never);

    useStore.getState().updateSuggestions({ prefix: "npm", full: "npm" });
    useStore.getState().acceptSuggestionAt(99);
    expect(accept).not.toHaveBeenCalled();
    // Liste açık kalmalı: geçersiz bir tıklama listeyi kapatmamalı.
    expect(suggest()).not.toBe(null);
    spy.mockRestore();
  });
});
