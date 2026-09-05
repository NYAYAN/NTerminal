import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { useStore } from "./useStore";

/**
 * Görünüm varsayılanları iki dilde duruyor ve AYNI olmak zorunda.
 *
 * Doğru kaynak Rust tarafı (`model.rs`): `settings.json` ondan yazılıyor ve
 * alanı eksik bir dosya ayrıştırılırken boşluklar oradan doluyor. Buradaki
 * kopya yalnızca açılış verisi gelmeden önceki İLK ÇİZİM için.
 *
 * Ayrışırlarsa belirti şu: uygulama bir satır yüksekliğiyle açılıyor, ayarlar
 * diskten gelince başkasına geçiyor — terminal gözle görülür biçimde bir kez
 * zıplıyor ve `fit()` PTY'ye iki farklı ölçü bildiriyor. Aynı gerekçe yazı
 * tipi için de geçerli ve o `lib/platform.test.ts` içinde bağlı; bu dosya
 * ÖLÇÜ veren sayıları bağlıyor.
 *
 * Liste bilinçli olarak dar: burada olması gereken, değeri değişince
 * DÜZENİN kaydığı alanlar. Renk, tema ya da imleç biçimi ayrışsa yanlış
 * görünür ama hiçbir şey yeniden ölçülendirilmez.
 */
const OLCU_ALANLARI = {
  fontSize: "font_size",
  lineHeight: "line_height",
  letterSpacing: "letter_spacing",
  uiFontSize: "ui_font_size",
  sidebarWidth: "sidebar_width",
  panelWidth: "panel_width",
  filesWidth: "files_width",
} as const;

/** `impl Default for Appearance` gövdesi — başka bir struct'ın alanına bakmayalım. */
function rustAppearanceDefaults(): string {
  const rust = readFileSync(join(process.cwd(), "src-tauri/src/model.rs"), "utf8");
  const start = rust.indexOf("impl Default for Appearance");
  expect(start, "`impl Default for Appearance` bulunamadı").toBeGreaterThan(-1);
  const rest = rust.slice(start + 1);
  const end = rest.indexOf("\nimpl ");
  return end === -1 ? rest : rest.slice(0, end);
}

describe("görünüm varsayılanları", () => {
  it("ölçü veren alanlar Rust tarafıyla birebir aynı", () => {
    const block = rustAppearanceDefaults();
    const ts = useStore.getState().settings.appearance;

    for (const [tsKey, rustKey] of Object.entries(OLCU_ALANLARI)) {
      // Satır başına çapa: `font_size` deseni çapasız olsaydı `ui_font_size`
      // satırına da uyardı ve iki alan tek değere bağlanırdı.
      const found = block.match(new RegExp(`\\n\\s*${rustKey}:\\s*([0-9_.]+)`));
      expect(found, `Rust tarafında \`${rustKey}\` okunamadı`).toBeTruthy();
      // Rust okunabilirlik için `10_000` yazabiliyor; sayı olarak aynı değer.
      const rustValue = Number(found![1].replace(/_/g, ""));
      expect(rustValue, `\`${rustKey}\` sayıya çevrilemedi`).not.toBeNaN();
      expect(
        ts[tsKey as keyof typeof OLCU_ALANLARI],
        `\`${tsKey}\` (TS) ile \`${rustKey}\` (Rust) ayrışmış`,
      ).toBe(rustValue);
    }
  });

  /*
   * Satır yüksekliği AYRICA kaydırıcının aralığında olmalı.
   *
   * Aralık dışında bir varsayılan, ayarı hiç açmamış kullanıcıya kaydırıcının
   * ucunda duran ama gerçekte başka bir değer gösteren bir denetim verir;
   * kaydırıcıya ilk dokunuş değeri sessizce sıçratır.
   */
  it("varsayılan satır yüksekliği kaydırıcının adımlarına oturuyor", () => {
    const { lineHeight } = useStore.getState().settings.appearance;
    expect(lineHeight).toBeGreaterThanOrEqual(1);
    expect(lineHeight).toBeLessThanOrEqual(2);
    // Kaydırıcı 0.05 adımlı (bkz. `SettingsDialog`). Kayan nokta artığını
    // yuvarlayarak eliyoruz: 1.5 / 0.05 = 29.999999999999996.
    expect(Math.round((lineHeight * 100) % 5)).toBe(0);
  });
});
