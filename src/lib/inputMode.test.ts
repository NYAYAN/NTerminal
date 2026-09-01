import { describe, expect, it } from "vitest";

import { passThroughSequence, resolveInputMode, type InputSignals } from "./inputMode";

const ACIK: InputSignals = {
  enabled: true,
  integration: true,
  atPrompt: true,
  altScreen: false,
  exited: false,
};

describe("girdi kipi", () => {
  it("kabuk istemde beklerken uygulama kipi", () => {
    expect(resolveInputMode(ACIK)).toBe("app");
  });

  it("komut çalışırken ham kip", () => {
    // Çalışan komut tuşları o an isteyebiliyor (parola istemi, y/n sorusu).
    // Enter'a kadar bekleyen bir kutu burada kilitlenmeye yol açardı.
    expect(resolveInputMode({ ...ACIK, atPrompt: false })).toBe("raw");
  });

  it("kabuk ÖLDÜYSE ham kip", () => {
    /*
     * BİLDİRİLEN HATA: "'Bu sekmedeki kabuk kapandı' diyor ama altta komut
     * yazın kısmı aktif."
     *
     * `atPrompt` kabuğun BİLDİRDİĞİ bir durum; kabuk ölürken "artık istemde
     * değilim" diye bir şey bildirmiyor, son değeri olduğu yerde kalıyor.
     * Kutu o değere bakıp açık duruyor ve yazılan her şey olmayan bir sürece
     * gidiyordu — çalışıyormuş gibi görünüp hiçbir şey yapmayan bir kutu.
     */
    expect(resolveInputMode({ ...ACIK, exited: true })).toBe("raw");
  });

  it("tam ekran programda ham kip", () => {
    // vim, less, htop: ikincil ekran tamponu. Entegrasyon sinyali gecikse
    // bile bu yakalıyor.
    expect(resolveInputMode({ ...ACIK, altScreen: true })).toBe("raw");
  });

  it("kabuk entegrasyonu yoksa ham kip", () => {
    // `atPrompt` yalnızca entegrasyondan geliyor; onsuz hep false kalır ve
    // kutu bir daha açılmazdı. cmd ve entegrasyonu kapatılmış profiller.
    expect(resolveInputMode({ ...ACIK, integration: false })).toBe("raw");
  });

  it("ayar kapalıyken ham kip", () => {
    expect(resolveInputMode({ ...ACIK, enabled: false })).toBe("raw");
  });

  it("kuşkulu her durumda ham kip kazanıyor", () => {
    // Asimetrik risk: yanlışlıkla ham kip yalnızca eski davranışı verir,
    // yanlışlıkla uygulama kipi kullanıcıyı vim içinde kilitler.
    for (const alan of ["enabled", "integration", "atPrompt"] as const) {
      expect(resolveInputMode({ ...ACIK, [alan]: false }), alan).toBe("raw");
    }
    expect(resolveInputMode({ ...ACIK, altScreen: true })).toBe("raw");
  });
});

describe("kabuğa geçen tuşlar", () => {
  it("Ctrl+C kutu boşken bile kabuğa gidiyor", () => {
    // Yoksa çalışan bir şeyi durdurmanın yolu kalmıyor.
    expect(passThroughSequence({ key: "c", ctrl: true })).toBe("\x03");
    expect(passThroughSequence({ key: "C", ctrl: true })).toBe("\x03");
  });

  it("Ctrl+D ve Ctrl+L kabuğun işi", () => {
    expect(passThroughSequence({ key: "d", ctrl: true })).toBe("\x04");
    expect(passThroughSequence({ key: "l", ctrl: true })).toBe("\x0c");
  });

  it("Ctrl'süz tuşlar kutuda kalıyor", () => {
    expect(passThroughSequence({ key: "c", ctrl: false })).toBe(null);
    expect(passThroughSequence({ key: "a", ctrl: true })).toBe(null);
  });
});
