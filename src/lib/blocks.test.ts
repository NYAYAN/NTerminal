import { describe, expect, it } from "vitest";

import {
  blockRect,
  blockTone,
  hasVisibleContent,
  visibleBlocks,
  type BlockView,
  type Viewport,
} from "./blocks";

const CELL = 20;
const VIEW: Viewport = { top: 100, rows: 10, cellHeight: CELL };

function block(patch: Partial<BlockView> = {}): BlockView {
  return {
    id: "b",
    startLine: 100,
    endLine: 104,
    command: "npm test",
    cwd: "/repo",
    exitCode: 0,
    durationMs: 120,
    running: false,
    ...patch,
  };
}

describe("blok dikdörtgeni", () => {
  it("görünümün içindeki blok satırlarına oturuyor", () => {
    expect(blockRect(block({ startLine: 102, endLine: 104 }), VIEW)).toEqual({
      top: 2 * CELL,
      height: 3 * CELL,
    });
  });

  it("tek satırlık blok bir hücre yüksekliğinde", () => {
    expect(blockRect(block({ startLine: 105, endLine: 105 }), VIEW)).toEqual({
      top: 5 * CELL,
      height: CELL,
    });
  });

  it("üstten taşan blok kırpılıyor", () => {
    // Kırpma olmadan `top` negatif çıkıyor ve kutu görünümün üstüne taşıyor.
    expect(blockRect(block({ startLine: 90, endLine: 103 }), VIEW)).toEqual({
      top: 0,
      height: 4 * CELL,
    });
  });

  it("alttan taşan blok kırpılıyor", () => {
    // Binlerce satırlık çıktıda kırpılmamış kutu tarayıcıyı tutukluyor.
    expect(blockRect(block({ startLine: 107, endLine: 5000 }), VIEW)).toEqual({
      top: 7 * CELL,
      height: 3 * CELL,
    });
  });

  it("görünümün tümüyle dışındaki blok çizilmiyor", () => {
    expect(blockRect(block({ startLine: 10, endLine: 20 }), VIEW)).toBe(null);
    expect(blockRect(block({ startLine: 200, endLine: 210 }), VIEW)).toBe(null);
  });

  it("sınır: son satırı görünümün ilk satırı olan blok görünüyor", () => {
    expect(blockRect(block({ startLine: 90, endLine: 100 }), VIEW)).toEqual({
      top: 0,
      height: CELL,
    });
  });

  it("açık blok görünümün sonuna kadar uzanıyor", () => {
    // Komut çalışıyor; nerede biteceği bilinmiyor.
    expect(blockRect(block({ startLine: 105, endLine: null, running: true }), VIEW)).toEqual({
      top: 5 * CELL,
      height: 5 * CELL,
    });
  });

  it("hiçbir durumda negatif yükseklik üretmiyor", () => {
    for (let start = 80; start <= 130; start += 3) {
      for (const end of [start, start + 1, start + 40, 5000]) {
        const rect = blockRect(block({ startLine: start, endLine: end }), VIEW);
        if (!rect) continue;
        expect(rect.height, `${start}-${end}`).toBeGreaterThan(0);
        expect(rect.top, `${start}-${end}`).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe("görünen bloklar", () => {
  it("yalnızca görünüme değenler", () => {
    const list = [
      block({ id: "eski", startLine: 10, endLine: 20 }),
      block({ id: "ustte", startLine: 95, endLine: 101 }),
      block({ id: "ortada", startLine: 102, endLine: 104 }),
      block({ id: "sonra", startLine: 300, endLine: 310 }),
    ];
    expect(visibleBlocks(list, VIEW).map((b) => b.id)).toEqual(["ustte", "ortada"]);
  });
});

describe("blok durumu", () => {
  it("çalışan, başarılı, hatalı", () => {
    expect(blockTone(block({ running: true, exitCode: null }))).toBe("running");
    expect(blockTone(block({ exitCode: 0 }))).toBe("ok");
    expect(blockTone(block({ exitCode: 1 }))).toBe("fail");
  });

  it("çıkış kodu bilinmiyorsa sessiz", () => {
    // Yeşil göstermek yanlış güven verirdi: kabuk işaret göndermemiş olabilir.
    expect(blockTone(block({ exitCode: null, running: false }))).toBe("unknown");
  });
});

describe("boş blok çizilmiyor", () => {
  const bos = () => "   \n  \n";
  const dolu = () => "toplam 3 dosya";

  it("ekranı silinmiş blok elenıyor", () => {
    // ÖLÇÜLEN BELİRTİ: `clear` sonrası ekranın dibinde iki rozet üst üste
    // kalıyordu — biri `clear` bloğu, biri bekleyen istem.
    expect(hasVisibleContent(block({ startLine: 100, endLine: 101 }), bos)).toBe(false);
  });

  it("içeriği olan blok çiziliyor", () => {
    expect(hasVisibleContent(block({ startLine: 100, endLine: 101 }), dolu)).toBe(true);
  });

  it("bekleyen istem her zaman çiziliyor", () => {
    // Onun zaten çıktısı yok; başlık tek başına anlamlı.
    expect(hasVisibleContent(block({ command: null }), bos)).toBe(true);
  });

  it("çalışan komut her zaman çiziliyor", () => {
    // Çıktısı henüz gelmemiş olabilir.
    expect(hasVisibleContent(block({ endLine: null, running: true }), bos)).toBe(true);
  });

  it("UZUN blok da denetleniyor", () => {
    // ÖLÇÜLEN BELİRTİ: `ls` çıktısı otuz satırlık bir blok; `clear` ekranı
    // siliyor ve blok "uzun" olduğu için hiç denetlenmiyordu — geriye metinsiz,
    // upuzun bir şerit kalıyordu.
    expect(hasVisibleContent(block({ startLine: 100, endLine: 900 }), bos)).toBe(false);
  });

  it("uzun blokta içerik yakalanıyor", () => {
    // Örnekleme bloğa YAYILMIŞ: 24 örnek, aralarında tam 10 satır. Onuncu
    // örneğin denk geldiği satıra içerik koyup bulunmasını bekliyoruz.
    const start = 100;
    const end = start + 23 * 10;
    const dolu = start + 10 * 10;
    const oku = (from: number) => (from === dolu ? "bir sey" : " ");
    expect(hasVisibleContent(block({ startLine: start, endLine: end }), oku)).toBe(true);
  });

  it("uzun blokta satır sayısı kadar okuma YAPILMIYOR", () => {
    // Her karede koşan bir denetim; binlerce satır okumak katmanı terminalden
    // pahalı hâle getirirdi.
    let okuma = 0;
    hasVisibleContent(block({ startLine: 0, endLine: 5000 }), () => {
      okuma += 1;
      return " ";
    });
    expect(okuma).toBeLessThanOrEqual(24);
  });
});
