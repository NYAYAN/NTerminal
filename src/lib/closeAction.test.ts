import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Kapatma davranışının TEK bir karar noktası var.
 *
 * Ölçülmüş hata: karar hem `App.tsx` içinde hem de Rust tarafında bir
 * `CloseRequested` kancasında duruyordu. Rust'taki hiçbir zaman çalışmadı —
 * arayüz kapatma isteğini yakalayıp durumu diske yazdıktan sonra `destroy()`
 * çağırıyor, `destroy` ise kapatma isteğini tümden atlıyor. Sonuç: "arka
 * planda kal" ayarı seçiliyken bile uygulama kapanıyor ve menü çubuğundaki
 * simge kayboluyordu.
 *
 * Hata sessizdi çünkü Rust kodu derleniyor, testler geçiyor ve kod okununca
 * doğru görünüyordu. Bir daha ikiye ayrılmasın diye bağlı.
 */
const APP = readFileSync(join(process.cwd(), "src/App.tsx"), "utf8");
const LIB_RS = readFileSync(join(process.cwd(), "src-tauri/src/lib.rs"), "utf8");

describe("kapatma davranışı", () => {
  it("kararı arayüz veriyor", () => {
    // Durumu diske yazan taraf burası; kapatmayı da burası bitirmeli.
    expect(APP, "kapatma isteği dinlenmiyor").toContain("onCloseRequested");
    expect(APP, "ayar okunmuyor — kapatma her zaman aynı şeyi yapar").toContain(
      'closeAction === "background"',
    );
    expect(APP, "arka planda kalma yolu pencereyi gizlemiyor").toMatch(/window_\.hide\(\)/);
  });

  it("Rust tarafında ikinci bir karar yok", () => {
    // İki kanca varken kazananı `destroy()` belirliyordu; Rust'ınki ölü koddu
    // ama okuyan herkese "burada hallediliyor" diyordu.
    // Yorumda geçen "onCloseRequested" kelimesine takılmamak için KOD deseni
    // aranıyor: olay dalının kendisi.
    expect(LIB_RS, "Rust'ta ikinci bir kapatma kancası var").not.toMatch(
      /WindowEvent::CloseRequested/,
    );
    expect(LIB_RS, "prevent_close burada iş görmüyor").not.toMatch(/api\.prevent_close\(/);
  });

  it("Rust yalnızca yıkım sonrası temizlik yapıyor", () => {
    // Pencere gerçekten yok olduğunda kabuk süreçleri bırakılmamalı.
    expect(LIB_RS).toContain("WindowEvent::Destroyed");
    expect(LIB_RS).toContain("kill_all");
  });
});
