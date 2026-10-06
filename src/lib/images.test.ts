import { beforeEach, describe, expect, it } from "vitest";

import { setLanguage } from "./i18n";
import { imageErrorText, imageMime, isSvgPath } from "./images";

/**
 * Hangi dosya RESİM olarak açılıyor.
 *
 * İSTEK: "dosyalardan png tıkladığımda görsel olarak göremiyorum." Karar
 * uzantıdan veriliyor (dosyayı okumadan hangi görüntüleyicinin açılacağı
 * bilinmeli); MIME `data:` adresine giriyor ve SVG ancak doğru MIME'la çiziliyor.
 */

beforeEach(() => setLanguage("tr"));

describe("görsel türü", () => {
  it("bilinen uzantılar MIME'ıyla, harf gözetmeden", () => {
    expect(imageMime("/p/logo.png")).toBe("image/png");
    expect(imageMime("C:\\p\\FOTO.JPG")).toBe("image/jpeg");
    expect(imageMime("a.jpeg")).toBe("image/jpeg");
    expect(imageMime("icon.svg")).toBe("image/svg+xml");
    expect(imageMime("favicon.ico")).toBe("image/x-icon");
    expect(imageMime("x.webp")).toBe("image/webp");
  });

  it("metin ve uzantısız dosya resim değil", () => {
    expect(imageMime("/p/a.ts")).toBe(null);
    expect(imageMime("/p/Makefile")).toBe(null);
    // Adı `.png` olan gizli dosya: uzantı değil, adın kendisi.
    expect(imageMime("/p/.png")).toBe(null);
    // Klasör adındaki nokta sayılmıyor.
    expect(imageMime("/p/v1.png/readme")).toBe(null);
  });

  it("SVG ayrıca tanınıyor: önizleme ile kaynak arasında geçiş", () => {
    expect(isSvgPath("/p/a.SVG")).toBe(true);
    expect(isSvgPath("/p/a.png")).toBe(false);
  });
});

describe("görsel hatası", () => {
  it("çok büyük görsel boyutuyla söyleniyor", () => {
    expect(imageErrorText("too-large:31457280")).toBe(
      "Görsel çok büyük (30.0 MB) — 20 MB'a kadar olanlar önizleniyor",
    );
  });

  it("öteki hatalar okunamadı", () => {
    expect(imageErrorText("No such file or directory")).toBe("Dosya okunamadı");
  });
});
