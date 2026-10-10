// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_DESIGN, DESIGNS, applyDesignToDocument, isDesign } from "./design";
import { sanitizeAppearance } from "./settingsLimits";
import { useStore } from "../store/useStore";

describe("tasarım", () => {
  afterEach(() => {
    delete document.documentElement.dataset.design;
    delete document.documentElement.dataset.layout;
  });

  it("varsayılan Kokpit: güncelleyen de ilk kuran da Kokpit'le açıyor", () => {
    // İSTEK: "uygulamayı güncelleyenler kokpit görünümü default olarak
    // görsünler. Default ayar olarak kokpit olmalı, ilk kurulumda da aynı
    // şekilde." Alanı olmayan eski settings.json'ın neye düştüğü aşağıdaki
    // "bilinmeyen tasarım" testinde; üç kopyanın aynılığı en alttakinde.
    expect(DEFAULT_DESIGN).toBe("kokpit");
  });

  it("üç tasarım var ve varsayılan onlardan biri", () => {
    expect(DESIGNS.map((d) => d.id)).toEqual(["premium", "kokpit", "classic"]);
    expect(isDesign(DEFAULT_DESIGN)).toBe(true);
    expect(isDesign("kokpit")).toBe(true);
    expect(isDesign("glass")).toBe(false);
    expect(isDesign(undefined)).toBe(false);
  });

  it("belgeye data-design yazıyor", () => {
    applyDesignToDocument("classic");
    expect(document.documentElement.dataset.design).toBe("classic");
    applyDesignToDocument("premium");
    expect(document.documentElement.dataset.design).toBe("premium");
  });

  /*
   * Kokpit kendi görünüşü olan bir tasarım DEĞİL: premium'un biçimi, farklı
   * bir iskelet. Kök `data-design="premium"` taşıyor (premium.css aynen
   * işliyor) ve yerleşim ayrı bir öznitelikte. Başka tasarıma geçince
   * yerleşim özniteliği kalkmalı.
   */
  it("Kokpit premium görünüşü ve kendi yerleşimini yazıyor", () => {
    applyDesignToDocument("kokpit");
    expect(document.documentElement.dataset.design).toBe("premium");
    expect(document.documentElement.dataset.layout).toBe("kokpit");
    applyDesignToDocument("classic");
    expect(document.documentElement.dataset.design).toBe("classic");
    expect(document.documentElement.dataset.layout).toBeUndefined();
    applyDesignToDocument("kokpit");
    applyDesignToDocument("premium");
    expect(document.documentElement.dataset.layout).toBeUndefined();
  });

  /*
   * Elle düzenlenmiş ya da gelecekteki bir sürümün yazdığı tasarım adı
   * bilinmiyorsa varsayılana düşmeli: CSS tanımadığı değerde hiçbir kural
   * uygulamaz ve arayüz ne klasik ne premium, "yarım" kalırdı.
   */
  it("bilinmeyen tasarım varsayılana düşüyor, bilinen aynen kalıyor", () => {
    const a = useStore.getState().settings.appearance;
    const bozuk = { ...a, design: "neon" } as unknown as typeof a;
    expect(sanitizeAppearance(bozuk).design).toBe(DEFAULT_DESIGN);
    const eksik = { ...a, design: undefined } as unknown as typeof a;
    expect(sanitizeAppearance(eksik).design).toBe(DEFAULT_DESIGN);
    expect(sanitizeAppearance({ ...a, design: "classic" }).design).toBe("classic");
    expect(sanitizeAppearance({ ...a, design: "kokpit" }).design).toBe("kokpit");
    // Değişmeyen nesne aynı başvuruyla dönmeli ("geri al" karşılaştırması).
    const temiz = { ...a, design: "premium" as const };
    expect(sanitizeAppearance(temiz)).toBe(temiz);
  });

  /*
   * Varsayılan üç yerde yazılı: `DEFAULT_DESIGN`, deponun ilk çizim nesnesi ve
   * Rust tarafı (`model.rs`, diskte alanı olmayan dosyayı dolduran). Ayrışırsa
   * belirti: uygulama bir tasarımda açılır, ayarlar diskten gelince ötekine
   * atlar — bütün çerçeve bir kez biçim değiştirir.
   */
  it("varsayılan tasarım depo ve Rust tarafıyla aynı", () => {
    expect(useStore.getState().settings.appearance.design).toBe(DEFAULT_DESIGN);
    const rust = readFileSync(join(process.cwd(), "src-tauri/src/model.rs"), "utf8");
    const start = rust.indexOf("impl Default for Appearance");
    expect(start).toBeGreaterThan(-1);
    const block = rust.slice(start);
    const found = block.match(/\n\s*design:\s*"([a-z]+)"\.into\(\)/);
    expect(found, "Rust tarafında `design` varsayılanı okunamadı").toBeTruthy();
    expect(found![1]).toBe(DEFAULT_DESIGN);
  });
});
