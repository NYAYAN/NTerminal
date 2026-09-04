import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Dosya sütununun genişliği sürüklenebilir ve KALICI.
 *
 * BİLDİRİLEN HATA: "bir dosyayı aradım ve dosyalar kısmında açtım, o alanı
 * genişletemiyorum." İlk hâli sabit genişlikteydi. Ağaç için yetiyordu ama
 * görüntüleyici de bu sütunda açıldığı için dosya İÇERİĞİ bir şeride
 * sıkışıyordu — kod okumak yatay kaydırma işine dönüyordu.
 *
 * Düzenek kenar çubuğununkiyle aynı (sağ kenarda tutamak, sürüklerken DOM'a
 * yazıp bırakınca ayara). Bu testler o düzeneğin üç parçasını da tutuyor:
 * tutamak var, ölçü ayarda saklanıyor, sürükleme sırasında diske yazılmıyor.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const PANEL = read("src/components/FilePanel.tsx");
const CSS = read("src/styles/global.css");

describe("dosya sütunu genişliği", () => {
  it("tutamak çiziliyor", () => {
    expect(PANEL, "yeniden boyutlandırma tutamağı yok").toContain("file-panel-resize");
    expect(PANEL, "sürükleme başlatılmıyor").toMatch(/onMouseDown/);
  });

  it("tutamak SAĞ kenarda", () => {
    // Sütun solda; genişleyen kenar sağ olanı. (Sağ panelin tutamağı aynı
    // sebeple sol kenarında.)
    const at = CSS.indexOf(".file-panel-resize {");
    expect(at, "tutamak kuralı yok").toBeGreaterThan(-1);
    const body = CSS.slice(at, CSS.indexOf("}", at));
    expect(body, "sağ kenara yerleşmiyor").toMatch(/right:\s*-?\d+px/);
    expect(body, "imleç sütun boyutlandırma değil").toMatch(/cursor:\s*col-resize/);
  });

  it("ölçü ayarda tutuluyor", () => {
    // Geçici durum olsaydı kullanıcı her açılışta ölçüyü yeniden verirdi.
    expect(PANEL, "ayardan okumuyor").toContain("appearance.filesWidth");
    expect(PANEL, "ayara yazmıyor").toMatch(/patchAppearance\(\{ filesWidth:/);
  });

  it("sürükleme sırasında ayara YAZMIYOR", () => {
    /*
     * `patchAppearance` kalıcılaştırıyor, yani her karede çağırmak her karede
     * diske yazmak demek. Sürükleme sırasında ölçü DOM'a yazılıyor, ayara
     * yalnızca bırakılınca.
     *
     * Ölçüt: fare hareketi işleyicisinde `patchAppearance` geçmemeli.
     */
    const at = PANEL.indexOf("const move = ");
    expect(at, "hareket işleyicisi bulunamadı").toBeGreaterThan(-1);
    const move = PANEL.slice(at, PANEL.indexOf("const up = "));
    expect(move, "her karede ayara yazıyor").not.toContain("patchAppearance");
    expect(move, "ölçü DOM'a yazılmıyor").toMatch(/style\.width/);
  });

  it("sınırlar hem JS hem CSS tarafında", () => {
    // İkisi de gerekli: JS sürüklemeyi sınırlıyor, CSS ayardan gelen bozuk
    // bir değeri (içe alma, elle düzenlenmiş settings.json) tutuyor.
    expect(PANEL, "JS sınırı yok").toMatch(/MIN_WIDTH|MAX_WIDTH/);
    const at = CSS.indexOf(".file-panel {");
    const body = CSS.slice(at, CSS.indexOf("}", at));
    expect(body, "CSS alt sınırı yok").toMatch(/min-width:\s*\d+px/);
    expect(body, "CSS üst sınırı yok").toMatch(/max-width:\s*\d+px/);
  });
});
