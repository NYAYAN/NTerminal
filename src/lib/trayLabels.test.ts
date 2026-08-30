import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { MESSAGES } from "./messages";

/**
 * Menü çubuğu / bildirim alanı simgesinin menü metinleri İKİ YERDE yazılı.
 *
 * Sebebi zorunlu: menüyü işletim sistemi çiziyor ve simge, arayüz yüklenmeden
 * önce kuruluyor — o anda `messages.ts` sözlüğü yok. Bu yüzden açılış metinleri
 * Rust tarafında (`src-tauri/src/tray.rs`), dil değiştiğinde geçirilen metinler
 * ise sözlükte duruyor.
 *
 * İkisi ayrıştığında hata SESSİZ ve tuhaf: uygulama Türkçeyken menü açılışta
 * bir metin, dil değiştirilip geri alınınca başka bir metin gösteriyor. Kimse
 * bunu hata olarak bildirmez, sadece özensiz görünür.
 */
const TRAY_RS = readFileSync(join(process.cwd(), "src-tauri/src/tray.rs"), "utf8");

describe("tepsi menüsü metinleri", () => {
  it("Rust tarafındaki metinler sözlükle aynı", () => {
    const beklenen: [string, string][] = [
      [MESSAGES["tray.show"][0], MESSAGES["tray.show"][1]],
      [MESSAGES["tray.quit"][0], MESSAGES["tray.quit"][1]],
    ];
    for (const [tr, en] of beklenen) {
      expect(TRAY_RS, `Türkçe metin tray.rs içinde yok: ${tr}`).toContain(`"${tr}"`);
      expect(TRAY_RS, `İngilizce metin tray.rs içinde yok: ${en}`).toContain(`"${en}"`);
    }
  });

  it("her iki dil için de dal var", () => {
    // `lang == "en"` denetimi kalkarsa menü her dilde İngilizce kalır.
    expect(TRAY_RS, "dil dalı yok").toMatch(/lang\s*==\s*"en"/);
  });

  it("simge her zaman kuruluyor", () => {
    // Simge bir ayara bağlansaydı, "arka planda çalış" seçili ve simge kapalı
    // olduğunda uygulamaya geri dönmenin yolu kalmazdı.
    expect(TRAY_RS, "simge kurulumu bulunamadı").toContain("TrayIconBuilder");
    expect(TRAY_RS, "simge bir ayara bağlanmış").not.toMatch(/if\s+.*tray_icon/);
  });

  it("macOS'ta tek renkli (template) simge kullanılıyor", () => {
    // Renkli simge menü çubuğunda yanlış duruyor ve koyu/açık temaya uymuyor.
    expect(TRAY_RS).toMatch(/icon_as_template\(true\)/);
    expect(TRAY_RS).toMatch(/tray-mac@2x\.png/);
  });
});
