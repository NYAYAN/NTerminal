// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { anchorAbove } from "./popover";

/**
 * Açılır pencere dayanağın ÜSTÜNDE durmalı.
 *
 * Ekranın bir köşesinde açılan pencere aynı işi yapıyor ama gözü tıkladığı
 * yerden koparıyor: "bu liste neye ait" sorusu doğuyor. Yerleşim hesabı gerçek
 * tarayıcıda gözle denetlenmesi zor bir şey, o yüzden testle bağlı.
 */

function el(rect: Partial<DOMRect>): HTMLElement {
  const node = document.createElement("div");
  vi.spyOn(node, "getBoundingClientRect").mockReturnValue({
    top: 0,
    left: 0,
    width: 0,
    height: 0,
    right: 0,
    bottom: 0,
    x: 0,
    y: 0,
    toJSON: () => ({}),
    ...rect,
  } as DOMRect);
  return node;
}

function kur(anchorRect: Partial<DOMRect>, panelRect: Partial<DOMRect>) {
  const anchor = el(anchorRect);
  anchor.className = "hedef";
  document.body.appendChild(anchor);
  const panel = el(panelRect);
  return { anchor, panel };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("dayanağın üstüne yerleşme", () => {
  it("pencerenin altı dayanağın üstünde kalıyor", () => {
    const { panel } = kur({ top: 500, left: 120, height: 16 }, { width: 380, height: 300 });
    anchorAbove(panel, ".hedef");
    // 500 - 6 aralık - 300 yükseklik
    expect(panel.style.top).toBe("194px");
    expect(panel.style.left).toBe("120px");
  });

  it("üstte yer yoksa ekranda kalıyor", () => {
    // Kısa pencere: hesap eksiye düşüyor ve pencerenin üstü ekran dışına
    // taşıyor; yarısı görünmez hâlde kalırdı.
    const { panel } = kur({ top: 40, left: 20, height: 16 }, { width: 380, height: 300 });
    anchorAbove(panel, ".hedef");
    expect(Number.parseInt(panel.style.top, 10)).toBeGreaterThanOrEqual(0);
  });

  it("sağdan taşma içeri çekiliyor", () => {
    const { panel } = kur({ top: 500, left: 900, height: 16 }, { width: 380, height: 200 });
    anchorAbove(panel, ".hedef");
    const left = Number.parseInt(panel.style.left, 10);
    expect(left + 380).toBeLessThanOrEqual(window.innerWidth);
  });

  it("dayanak yoksa dokunmuyor", () => {
    // Pencere CSS'teki yerinde kalmalı; sıfırlamak onu köşeye atardı.
    const panel = el({ width: 380, height: 200 });
    anchorAbove(panel, ".yok");
    expect(panel.style.top).toBe("");
  });

  it("pencere yoksa çökmüyor", () => {
    expect(() => anchorAbove(null, ".hedef")).not.toThrow();
  });
});
