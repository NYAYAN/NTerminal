import { describe, expect, it } from "vitest";

import { dropTabKeys } from "./useStore";

/**
 * Kapanan sekme sekme başına tutulan HER haritadan düşmeli.
 *
 * ## Ölçülen sızıntı
 *
 * `closeTab` yalnızca `running` haritasını temizliyordu. `exited`,
 * `inputSignals`, `runLinks`, `scrollAtBottom` ve `sessionEpoch` kapanan
 * sekmenin anahtarını sonsuza dek taşıyordu. Değerler küçük — ama uygulama
 * günlerce açık kalıyor ve sekme açıp kapatmak günlük bir iş, yani beş harita
 * yalnızca büyüyordu.
 *
 * Test bunu bağlıyor çünkü sızıntı GÖRÜNMEZ: ekranda hiçbir belirtisi yok,
 * yalnızca bellek ve her `set` çağrısında kopyalanan nesne büyüyor. Yeni bir
 * sekme başına harita eklenirse bu test onu da istemeli.
 */

const durum = () => ({
  running: { a: true, b: false },
  exited: { a: false, b: true },
  sessionEpoch: { a: 3, b: 1 },
  inputSignals: {
    a: { atPrompt: true, altScreen: false, integration: true },
    b: { atPrompt: false, altScreen: true, integration: false },
  },
  runLinks: { a: ["http://localhost:4200"], b: [] },
  scrollAtBottom: { a: true, b: false },
});

describe("kapanan sekmenin kayıtları", () => {
  it("altı haritanın hepsinden düşüyor", () => {
    const sonra = dropTabKeys(durum(), "a");
    for (const [ad, harita] of Object.entries(sonra)) {
      expect(Object.keys(harita), `${ad} haritasında kapanan sekme duruyor`).toEqual(["b"]);
    }
  });

  it("kalan sekmenin değerlerine dokunmuyor", () => {
    const sonra = dropTabKeys(durum(), "a");
    expect(sonra.exited.b).toBe(true);
    expect(sonra.sessionEpoch.b).toBe(1);
    expect(sonra.runLinks.b).toEqual([]);
  });

  it("anahtar yoksa AYNI nesneyi döndürüyor", () => {
    /*
     * Kimlik korunması bir eniyileme değil, doğruluk: zustand kaydı sığ
     * karşılaştırıyor. Her seferinde yeni nesne vermek, o haritaya bakan her
     * bileşeni sekme kapatan her işlemde boşuna yeniden çizdirirdi — altı
     * harita, altı gereksiz çizim dalgası.
     */
    const once = durum();
    const sonra = dropTabKeys(once, "boyle-bir-sekme-yok");
    expect(sonra.running).toBe(once.running);
    expect(sonra.exited).toBe(once.exited);
    expect(sonra.sessionEpoch).toBe(once.sessionEpoch);
    expect(sonra.inputSignals).toBe(once.inputSignals);
    expect(sonra.runLinks).toBe(once.runLinks);
    expect(sonra.scrollAtBottom).toBe(once.scrollAtBottom);
  });

  it("girdiyi değiştirmiyor", () => {
    const once = durum();
    dropTabKeys(once, "a");
    expect(Object.keys(once.running)).toEqual(["a", "b"]);
  });
});
