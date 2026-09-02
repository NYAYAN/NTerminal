import { describe, expect, it } from "vitest";

import {
  passThroughSequence,
  resolveCtrlC,
  resolveInputMode,
  SIGINT,
  type CtrlCSignals,
  type InputSignals,
  type PassThroughKey,
} from "./inputMode";

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

/** Yalnız Ctrl basılı bir tuş olayı; testler değiştiricileri üstüne yazıyor. */
function ctrl(key: string, mods: Partial<PassThroughKey> = {}): PassThroughKey {
  return { key, ctrlKey: true, shiftKey: false, altKey: false, metaKey: false, ...mods };
}

describe("kabuğa geçen tuşlar", () => {
  it("Ctrl+C kutu boşken bile kabuğa gidiyor", () => {
    // Yoksa çalışan bir şeyi durdurmanın yolu kalmıyor.
    expect(passThroughSequence(ctrl("c"))).toBe(SIGINT);
    expect(passThroughSequence(ctrl("C"))).toBe(SIGINT);
    // Sabit üç yerden okunuyor (kutu, Durdur düğmesi, satırı boşaltma
    // denetimi); değeri ETX olmaya devam etmeli.
    expect(SIGINT).toBe("\x03");
  });

  it("Ctrl+D ve Ctrl+L kabuğun işi", () => {
    expect(passThroughSequence(ctrl("d"))).toBe("\x04");
    expect(passThroughSequence(ctrl("l"))).toBe("\x0c");
  });

  it("Ctrl'süz tuşlar kutuda kalıyor", () => {
    expect(passThroughSequence(ctrl("c", { ctrlKey: false }))).toBe(null);
    expect(passThroughSequence(ctrl("a"))).toBe(null);
  });

  /*
   * Denetim karakterleri YALNIZ Ctrl ile; her eksik değiştirici bir kez hata
   * oldu (öyküsü `PassThroughKey` üzerinde):
   *  - Shift: Ctrl+Shift+C Windows'ta kopyalama kısayolu, SIGINT'e dönüşüyordu.
   *  - Alt: AltGr tarayıcıya ctrl+alt olarak geliyor; Türkçe Q'da AltGr+C
   *    satırı siliyor, Ctrl+Alt+D EOF gönderip kabuğu kapatabiliyordu.
   *  - Meta: Ctrl+Win+C'nin kabukta bir anlamı yok.
   */
  it("Shift, Alt ya da Win eşlik ediyorsa kabuğa GİTMİYOR", () => {
    for (const key of ["C", "D", "L"]) {
      expect(passThroughSequence(ctrl(key, { shiftKey: true })), `shift+${key}`).toBe(null);
      expect(passThroughSequence(ctrl(key, { altKey: true })), `alt+${key}`).toBe(null);
      expect(passThroughSequence(ctrl(key, { metaKey: true })), `meta+${key}`).toBe(null);
    }
  });
});

/*
 * Ctrl+C'nin iki anlamı: kopyala mı, kes mi.
 *
 * BİLDİRİLEN HATA: kutuda metni seçip Ctrl+C'ye basmak satırı siliyor ve
 * kopyalamıyordu — karar yalnızca ızgaradaki seçime bakıyordu. İlk düzeltme
 * kuralı kutuya ikinci kez yazdı; inceleme aynı gün üç kopya saydı. Kural
 * artık burada, tek yerde; oturum ve kutu girdileri toplayıp buraya soruyor.
 */
describe("Ctrl+C kararı", () => {
  const WINDOWS: CtrlCSignals = {
    mac: false,
    copiesSelection: true,
    boxSelection: false,
    gridSelection: false,
  };

  it("kutudaki seçim kopyalanıyor", () => {
    expect(resolveCtrlC({ ...WINDOWS, boxSelection: true })).toBe("copy-box");
  });

  it("kutu boş, ızgarada seçim varsa ızgara kopyalanıyor", () => {
    expect(resolveCtrlC({ ...WINDOWS, gridSelection: true })).toBe("copy-grid");
  });

  it("kutudaki seçim ızgaradakinden önce: odak kutuda, yazılan yer orası", () => {
    expect(resolveCtrlC({ ...WINDOWS, boxSelection: true, gridSelection: true })).toBe("copy-box");
  });

  it("hiçbir yerde seçim yoksa kabuğa", () => {
    expect(resolveCtrlC(WINDOWS)).toBe("sigint");
  });

  it("ayar kapalıysa seçim olsa da kabuğa — iki yüzeyde birden", () => {
    // Kullanıcı "Ctrl+C her zaman kessin" demiş; ayarı yalnızca ızgarada
    // saymak onu yarım yalan yapardı (ilk düzeltmenin gözden kaçırdığı yer).
    const kapali = { ...WINDOWS, copiesSelection: false };
    expect(resolveCtrlC({ ...kapali, boxSelection: true })).toBe("sigint");
    expect(resolveCtrlC({ ...kapali, gridSelection: true })).toBe("sigint");
  });

  it("mac'te Ctrl+C her koşulda kabuğun tuşu", () => {
    // Kopyalama orada Cmd+C; Ctrl+C ile çakışma yok. Bu dal unutulsaydı tuş
    // yutulur, SIGINT kabuğa hiç ulaşmazdı (bkz. keysMac.test.ts).
    expect(resolveCtrlC({ ...WINDOWS, mac: true, boxSelection: true, gridSelection: true })).toBe(
      "sigint",
    );
  });
});
