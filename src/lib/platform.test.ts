// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_LANG, setLanguage, t } from "./i18n";
import {
  defaultFontStack,
  fileManager,
  isMac,
  modKey,
  platform,
  setFileManager,
  setPlatform,
} from "./platform";

/**
 * Platform durumu ve platforma bağlı arayüz kararları.
 *
 * Bu modül küçük ama yanlış bir değer sessiz sonuçlar veriyor: Cmd/Ctrl seçimi
 * bozulursa mac'te hiçbir kısayol çalışmaz, `{fm}` bozulursa mac kullanıcısına
 * "Gezgin'de aç" yazılır. İkisi de yalnızca o platformda görülür — bu yüzden
 * testler platformu elle kurup her iki durumu da geçiyor.
 */

afterEach(() => {
  setPlatform("windows");
  setFileManager("", "");
  setLanguage(DEFAULT_LANG);
});

describe("platform durumu", () => {
  it("kesin değer yazılabiliyor", () => {
    setPlatform("macos");
    expect(platform()).toBe("macos");
    expect(isMac()).toBe(true);

    setPlatform("windows");
    expect(platform()).toBe("windows");
    expect(isMac()).toBe(false);

    setPlatform("linux");
    expect(isMac()).toBe(false);
  });

  it("html öğesine işaret koyuyor", () => {
    // CSS'in platforma göre değişen tek yeri (tek aralıklı yazı tipi) bu
    // işarete bağlı; konmazsa mac'te yazı tipi jenerik monospace'e düşer.
    setPlatform("macos");
    expect(document.documentElement.dataset.platform).toBe("macos");
    setPlatform("windows");
    expect(document.documentElement.dataset.platform).toBe("windows");
  });
});

describe("değiştirici tuş", () => {
  it("mac'te Cmd, diğerlerinde Ctrl", () => {
    setPlatform("macos");
    expect(modKey()).toBe("Cmd");
    setPlatform("windows");
    expect(modKey()).toBe("Ctrl");
    setPlatform("linux");
    expect(modKey()).toBe("Ctrl");
  });
});

describe("yazı tipi yığını", () => {
  it("mac'te Menlo, Windows'ta Cascadia", () => {
    setPlatform("macos");
    expect(defaultFontStack()).toContain("Menlo");
    expect(defaultFontStack()).not.toContain("Cascadia");

    setPlatform("windows");
    expect(defaultFontStack()).toContain("Cascadia");
    expect(defaultFontStack()).not.toContain("Menlo");
  });

  it("her iki yığın jenerik monospace ile bitiyor", () => {
    // Listedeki hiçbir yazı tipi yoksa tarayıcı yine tek aralıklı bir şey
    // seçmeli; orantılı yazı tipiyle çizilen bir terminal kullanılamaz.
    for (const p of ["macos", "windows"] as const) {
      setPlatform(p);
      expect(defaultFontStack().trim().endsWith("monospace")).toBe(true);
    }
  });

  it("Rust tarafındaki varsayılanla aynı", () => {
    // İki liste ayrı dillerde duruyor: Rust'ın değeri settings.json'a yazılıyor,
    // buradaki yalnızca ilk çizim için. Ayrışırlarsa kullanıcı açılışta bir
    // yazı tipi, ayarlar geldikten sonra başka birini görür — gözle fark
    // edilmeyecek kadar hızlı ama ölçüm farkı düzen kaymasına yol açıyor.
    const rust = readFileSync(join(process.cwd(), "src-tauri/src/model.rs"), "utf8");
    const block = rust.slice(rust.indexOf("fn default_font_family"));
    const macLine = block.match(/target_os = "macos"\)\]\s*\n\s*return "([^"]+)"/);
    const winLine = block.match(/not\(target_os = "macos"\)\)\]\s*\n\s*return "([^"]+)"/);
    expect(macLine, "Rust mac yazı tipi satırı okunamadı").toBeTruthy();
    expect(winLine, "Rust Windows yazı tipi satırı okunamadı").toBeTruthy();

    setPlatform("macos");
    expect(defaultFontStack()).toBe(macLine![1]);
    setPlatform("windows");
    expect(defaultFontStack()).toBe(winLine![1]);
  });
});

describe("dosya yöneticisi adı", () => {
  it("açılış verisinden gelen ad kullanılıyor", () => {
    setFileManager("Finder", "Finder");
    expect(fileManager("tr")).toBe("Finder");
    expect(fileManager("en")).toBe("Finder");
  });

  it("açılış verisi gelmediyse platformdan türetiliyor", () => {
    // Açılış verisi asenkron; ilk çizimde metin yine doğru olmalı.
    setPlatform("macos");
    expect(fileManager("tr")).toBe("Finder");
    expect(fileManager("en")).toBe("Finder");

    setPlatform("windows");
    expect(fileManager("tr")).toBe("Gezgin");
    expect(fileManager("en")).toBe("Explorer");
  });
});

// Menü etiketi ("Klasörü aç") artık dosya yöneticisinin adını yazmıyor —
// menü zaten bir klasörün üzerinde. Yer tutucu, adı bilmenin işe yaradığı
// açıklama metinlerinde kaldı: durum çubuğu ipucu ve komut paleti.
describe("{fm} yerleşik parametresi", () => {
  it("metne platforma göre yerleşiyor", () => {
    setPlatform("windows");
    setFileManager("Gezgin", "Explorer");
    expect(t("status.revealHint")).toBe("(Gezgin'de açmak için tıklayın)");

    setPlatform("macos");
    setFileManager("Finder", "Finder");
    expect(t("status.revealHint")).toBe("(Finder'de açmak için tıklayın)");
  });

  it("İngilizcede de yerleşiyor", () => {
    setLanguage("en");
    setFileManager("Finder", "Finder");
    expect(t("status.revealHint")).toBe("(click to open in Finder)");
  });

  it("yer tutucu metinde kalmıyor", () => {
    // Doldurulmamış bir `{fm}` ekranda olduğu gibi görünürdü.
    setFileManager("Finder", "Finder");
    for (const key of ["status.revealHint", "palette.reveal"] as const) {
      expect(t(key), `${key} içinde {fm} kalmış`).not.toContain("{fm}");
    }
  });

  it("elle geçirilen parametre yerleşiği eziyor", () => {
    // Çağrı yeri özel bir ad vermek isterse öncelik onda olmalı.
    setFileManager("Finder", "Finder");
    expect(t("status.revealHint", { fm: "Dosyalar" })).toBe("(Dosyalar'de açmak için tıklayın)");
  });

  it("bilinmeyen yer tutucu olduğu gibi kalıyor", () => {
    // Eksik parametreyi "undefined" yazmak yerine görünür bırakmak hatayı
    // gösteriyor; bu davranış {fm} eklendikten sonra da sürmeli.
    expect(t("confirm.closeTabMessage")).toContain("{name}");
  });
});
