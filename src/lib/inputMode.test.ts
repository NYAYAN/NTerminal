import { describe, expect, it } from "vitest";

import {
  looksLikeSecretPrompt,
  passThroughSequence,
  resolveCtrlC,
  resolveInputMode,
  SIGINT,
  stdinKeyAction,
  type CtrlCSignals,
  type InputSignals,
  type PassThroughKey,
} from "./inputMode";

const ACIK: InputSignals = {
  enabled: true,
  integration: true,
  atPrompt: true,
  altScreen: false,
  running: false,
  exited: false,
};

/** Komut çalışıyor: kabuk istemde değil, 133;C komut metniyle geldi. */
const CALISIYOR: InputSignals = { ...ACIK, atPrompt: false, running: true };

describe("girdi kipi", () => {
  it("kabuk istemde beklerken uygulama kipi", () => {
    expect(resolveInputMode(ACIK)).toBe("app");
  });

  /*
   * BİLDİRİLEN: "`ng serve` 'Would you like to use a different port? (Y/n)'
   * diye soruyor; cevabı komut yazma kısmına yazamıyoruz, doğrudan mesajın
   * çıktığı yere yazıyoruz."
   *
   * Eski karar burada "raw"du: kutu kapanıyor, tuşlar ızgaraya gidiyordu.
   * Yazılan yer TEK olmalı — soruyu kim sorarsa sorsun yanıt kutuya.
   */
  it("komut çalışırken YANIT kipi: kutu açık, satır çalışan programa", () => {
    expect(resolveInputMode(CALISIYOR)).toBe("stdin");
  });

  it("komut bitti, istem henüz çiziliyor: ham kip — yazılanı alacak kimse yok", () => {
    // 133;D ile 133;B arası. Kutu orada yer tutucu şeritle bekliyor.
    expect(resolveInputMode({ ...ACIK, atPrompt: false, running: false })).toBe("raw");
  });

  it("komut çalışırken de tam ekran program ham kipte", () => {
    // `git log` less'i açtı: her tuş o an bir komut, satır biriktirmek
    // programı kullanılamaz yapardı.
    expect(resolveInputMode({ ...CALISIYOR, altScreen: true })).toBe("raw");
  });

  it("komut çalışırken entegrasyon, ayar ve ölü kabuk yine ham kipe düşürüyor", () => {
    expect(resolveInputMode({ ...CALISIYOR, integration: false }), "entegrasyon").toBe("raw");
    expect(resolveInputMode({ ...CALISIYOR, enabled: false }), "ayar").toBe("raw");
    expect(resolveInputMode({ ...CALISIYOR, exited: true }), "ölü kabuk").toBe("raw");
  });

  it("istem sinyali çalışma sinyalinden önce: iç içe kabuk kendi istemini gösteriyorsa komut satırı", () => {
    // Çalışan komut entegrasyonlu bir kabuksa (ya da 133;D kaçtıysa) 133;B
    // istemi yeniden açıyor; o an yazılan bir komut, bir yanıt değil.
    expect(resolveInputMode({ ...CALISIYOR, atPrompt: true })).toBe("app");
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

/** Değiştiricisiz tuş olayı; testler değiştiricileri üstüne yazıyor. */
function key(name: string, mods: Partial<PassThroughKey> = {}): PassThroughKey {
  return { key: name, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, ...mods };
}

const BOS = { empty: true, appCursor: false };
const DOLU = { empty: false, appCursor: false };
const send = (data: string) => ({ kind: "send", data });

/*
 * Çalışan komuta yazarken tuşların yolu.
 *
 * Kural tek cümle: kutu BOŞKEN kutunun kullanmadığı tuş doğrudan programa,
 * yazmaya başlayınca satır kutuda toplanıp Enter'la gidiyor. Boş kutu seçim
 * listelerini (`ng new`in stil sorusu, `npm create vite`), "devam etmek için
 * bir tuşa basın"ı ve programın Ctrl kısayollarını sürüyor.
 */
describe("çalışan komuta yazılan tuşlar", () => {
  it("dolu kutuda Enter satırı gönderiyor, Shift+Enter satır açıyor", () => {
    expect(stdinKeyAction(key("Enter"), DOLU)).toEqual({ kind: "submit" });
    expect(stdinKeyAction(key("Enter", { shiftKey: true }), DOLU)).toBe(null);
  });

  it("boş kutuda Enter programa gidiyor: '(Y/n)' sorusunda varsayılanı kabul etmek", () => {
    expect(stdinKeyAction(key("Enter"), BOS)).toEqual(send("\r"));
  });

  it("boş kutuda oklar seçim listesini sürüyor, xterm'in kodlamasıyla", () => {
    expect(stdinKeyAction(key("ArrowUp"), BOS)).toEqual(send("\x1b[A"));
    expect(stdinKeyAction(key("ArrowDown"), BOS)).toEqual(send("\x1b[B"));
    expect(stdinKeyAction(key("ArrowRight"), BOS)).toEqual(send("\x1b[C"));
    expect(stdinKeyAction(key("ArrowLeft"), BOS)).toEqual(send("\x1b[D"));
    // Ctrl+→ sözcük atlıyor: `1 + 4·Ctrl` = 5.
    expect(stdinKeyAction(key("ArrowRight", { ctrlKey: true }), BOS)).toEqual(send("\x1b[1;5C"));
  });

  it("program uygulama imleç kipini açtıysa oklar ESC O ile gidiyor", () => {
    // Tuş artık xterm'den geçmiyor; kipi açan programda `ESC [ A` tanınmazdı.
    const app = { empty: true, appCursor: true };
    expect(stdinKeyAction(key("ArrowUp"), app)).toEqual(send("\x1bOA"));
    expect(stdinKeyAction(key("Home"), app)).toEqual(send("\x1bOH"));
  });

  it("boş kutuda Boşluk, Tab, Esc, Backspace ve düzenleme tuşları programa", () => {
    // Boşluk işaret kutulu listede seçimi değiştiriyor.
    expect(stdinKeyAction(key(" "), BOS)).toEqual(send(" "));
    expect(stdinKeyAction(key("Tab"), BOS)).toEqual(send("\t"));
    expect(stdinKeyAction(key("Tab", { shiftKey: true }), BOS)).toEqual(send("\x1b[Z"));
    expect(stdinKeyAction(key("Escape"), BOS)).toEqual(send("\x1b"));
    expect(stdinKeyAction(key("Backspace"), BOS)).toEqual(send("\x7f"));
    expect(stdinKeyAction(key("Delete"), BOS)).toEqual(send("\x1b[3~"));
    expect(stdinKeyAction(key("PageDown"), BOS)).toEqual(send("\x1b[6~"));
    expect(stdinKeyAction(key("End"), BOS)).toEqual(send("\x1b[F"));
  });

  it("boş kutuda Ctrl + harf denetim karakteri oluyor", () => {
    expect(stdinKeyAction(key("d", { ctrlKey: true }), BOS)).toEqual(send("\x04"));
    expect(stdinKeyAction(key("z", { ctrlKey: true }), BOS)).toEqual(send("\x1a"));
    expect(stdinKeyAction(key("R", { ctrlKey: true }), BOS)).toEqual(send("\x12"));
  });

  it("Ctrl+V yapıştırmada kutuya kalıyor, Ctrl+C kopyala/kes kararına", () => {
    // Pano metni kutuya gelmeli, programa `\x16` değil. Ctrl+C'nin kararı
    // tek yerde (`resolveCtrlC`); burada ikinci kez verilmemeli.
    for (const ctx of [BOS, DOLU]) {
      expect(stdinKeyAction(key("v", { ctrlKey: true }), ctx)).toBe(null);
      expect(stdinKeyAction(key("c", { ctrlKey: true }), ctx)).toBe(null);
    }
  });

  it("yazılan harf her zaman kutuya", () => {
    for (const ctx of [BOS, DOLU]) {
      expect(stdinKeyAction(key("y"), ctx)).toBe(null);
      expect(stdinKeyAction(key("Y", { shiftKey: true }), ctx)).toBe(null);
    }
  });

  it("arayüzün ve işletim sisteminin tuşları programa gitmiyor", () => {
    // AltGr (Windows'ta ctrl+alt) Türkçe Q'da `@` yazıyor; Ctrl+Shift arayüz
    // kısayolu; Cmd/Win işletim sisteminin. Ctrl+Tab sekme değiştiriyor.
    expect(stdinKeyAction(key("@", { ctrlKey: true, altKey: true }), BOS)).toBe(null);
    expect(stdinKeyAction(key("d", { ctrlKey: true, altKey: true }), BOS)).toBe(null);
    expect(stdinKeyAction(key("D", { ctrlKey: true, shiftKey: true }), BOS)).toBe(null);
    expect(stdinKeyAction(key("ArrowUp", { metaKey: true }), BOS)).toBe(null);
    expect(stdinKeyAction(key("Tab", { ctrlKey: true }), BOS)).toBe(null);
    // Shift+PageUp terminalde kaydırmanın tuşu.
    expect(stdinKeyAction(key("PageUp", { shiftKey: true }), BOS)).toBe(null);
  });

  it("dolu kutuda oklar ve Backspace kutuyu düzenliyor, programa gitmiyor", () => {
    for (const name of ["ArrowUp", "ArrowLeft", "Home", "Backspace", "Delete", " "]) {
      expect(stdinKeyAction(key(name), DOLU), name).toBe(null);
    }
  });

  it("dolu kutuda Tab satırı programa devrediyor: tamamlamayı program yapıyor", () => {
    // REPL ya da ssh ardındaki kabuk satırı görmeden tamamlayamaz.
    expect(stdinKeyAction(key("Tab"), DOLU)).toEqual({ kind: "flush", data: "\t" });
  });

  it("dolu kutuda Ctrl+D satırı yeni satırsız teslim ediyor, Esc satırı bırakıyor", () => {
    expect(stdinKeyAction(key("d", { ctrlKey: true }), DOLU)).toEqual({ kind: "flush", data: "\x04" });
    expect(stdinKeyAction(key("Escape"), DOLU)).toEqual({ kind: "clear" });
  });

  it("Ctrl+L satıra dokunmadan ekranı temizletiyor", () => {
    expect(stdinKeyAction(key("l", { ctrlKey: true }), DOLU)).toEqual(send("\x0c"));
    expect(stdinKeyAction(key("l", { ctrlKey: true }), BOS)).toEqual(send("\x0c"));
  });
});

/*
 * Parola sorusu sezgisi.
 *
 * Terminal parola sorarken yazılanı yansıtmıyor, kutu yansıtıyor. Sezgi
 * yanılırsa iki bedel asimetrik: yanlış pozitifte yanıt nokta olarak görünüyor
 * (gönderilen aynı), yanlış negatifte parola ekranda açık duruyor.
 */
describe("parola sorusu", () => {
  it("bilinen parola soruları gizli sayılıyor", () => {
    for (const line of [
      "nurullah@sunucu's password: ",
      "Enter passphrase for key '/c/Users/nurullah/.ssh/id_ed25519': ",
      "Password for 'https://nurullah@github.com': ",
      "[sudo] password for nurullah: ",
      "Enter password:",
      "Parola: ",
      "Şifrenizi girin: ",
      "Enter PIN: ",
      "Access token:",
      "Passwort：",
    ]) {
      expect(looksLikeSecretPrompt(line), line).toBe(true);
    }
  });

  it("parola sözcüğü geçen ama soru olmayan satırlar gizli sayılmıyor", () => {
    for (const line of [
      // Bildirilen sorunun kendisi: yanıt görünmeli.
      "? Would you like to use a different port? (Y/n) ",
      "Would you like to reset your password? (y/N)",
      "Password changed successfully.",
      // "pin" sözcüğün içinde; satır iki noktayla bitse de parola değil.
      "Pinging google.com [142.250.184.206] with 32 bytes of data:",
      "Enter your name: ",
      "",
    ]) {
      expect(looksLikeSecretPrompt(line), line).toBe(false);
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
