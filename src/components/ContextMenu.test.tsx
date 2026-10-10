// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ContextMenu, type MenuEntry } from "./ContextMenu";

/**
 * Sağ tık menüsü, özellikle alt menüler.
 *
 * Alt menü, "Gruba taşı" altındaki grup listesi menüyü ana eylemler ekranın
 * dışında kalacak kadar uzattığı için eklendi. Açılma/kapanma zamanlaması ve
 * tıklamanın doğru girdiyi çalıştırması gözle bakmadan anlaşılmıyor; bu yüzden
 * test.
 */

/** Alt menü küçük bir gecikmeyle açılıyor; onu bekliyoruz. */
async function settle(ms = 200) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

afterEach(cleanup);

function menu(entries: MenuEntry[], onClose = () => {}) {
  return render(<ContextMenu state={{ x: 40, y: 40, entries }} onClose={onClose} />);
}

/**
 * Tarayıcının kendi sağ tık menüsü kapalı olmalı.
 *
 * ÖLÇÜLEN SORUN: terminalin dışında bir yere sağ tıklamak WebView2'nin
 * menüsünü açıyordu — Geri, Yenile, Farklı kaydet, Yazdır, İncele. "Yenile"
 * doğrudan zararlı: uygulamayı yeniden yükleyip bütün sekmeleri düşürüyor.
 *
 * Kaynak üzerinden denetliyoruz: kural `App.tsx` içinde belge düzeyinde bir
 * dinleyici ve gerçek bir sağ tıklama olmadan davranışı kurmak WebView2
 * gerektiriyor.
 */
describe("tarayıcı sağ tık menüsü", () => {
  const APP = readFileSync(join(process.cwd(), "src/App.tsx"), "utf8");

  it("belge düzeyinde engelleniyor", () => {
    expect(APP).toContain('document.addEventListener("contextmenu"');
    // İşleyici gövdesi varsayılanı gerçekten engelliyor mu.
    expect(APP).toMatch(/onContextMenu[\s\S]{0,300}preventDefault\(\)/);
  });

  it("metin alanları MUAF", () => {
    // Orada menü kes/kopyala/yapıştır veriyor; tümden kapatmak ayarlardaki bir
    // alana yapıştırma yolunu elden alırdı.
    expect(APP).toMatch(/closest\("input, textarea"\)/);
  });
});

describe("bağlam menüsü", () => {
  it("girdi türlerini çiziyor", () => {
    const { container } = menu([
      { kind: "header", label: "Başlık" },
      { kind: "item", label: "Eylem", run: () => {} },
      { kind: "separator" },
      { kind: "check", label: "Seçenek", checked: true, run: () => {} },
    ]);
    expect(container.querySelector(".ctx-header")!.textContent).toBe("Başlık");
    expect(container.querySelectorAll(".ctx-item")).toHaveLength(2);
    expect(container.querySelector(".ctx-sep")).not.toBe(null);
    expect(container.querySelector(".ctx-mark")!.textContent).toBe("");
  });

  it("eylem çalışıyor ve menü kapanıyor", () => {
    const run = vi.fn();
    const onClose = vi.fn();
    menu([{ kind: "item", label: "Eylem", run }], onClose);
    fireEvent.click(screen.getByText("Eylem"));
    expect(run).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("devre dışı eylem çalışmıyor", () => {
    const run = vi.fn();
    const { container } = menu([{ kind: "item", label: "Eylem", disabled: true, run }]);
    const button = container.querySelector(".ctx-item") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(run).not.toHaveBeenCalled();
  });
});

describe("alt menü", () => {
  const groups: MenuEntry = {
    kind: "submenu",
    label: "Gruba taşı",
    entries: [
      { kind: "item", label: "Yayın", run: () => {} },
      { kind: "item", label: "Geliştirme", run: () => {} },
    ],
  };

  it("alt menülü satır oklu ve başlangıçta kapalı", () => {
    const { container } = menu([groups]);
    const row = container.querySelector(".ctx-item.has-sub");
    expect(row, "alt menülü satır bulunamadı").not.toBe(null);
    expect(row!.querySelector(".ctx-sub-arrow"), "ok işareti yok").not.toBe(null);
    expect(container.querySelectorAll(".ctx-menu")).toHaveLength(1);
    expect(screen.queryByText("Yayın")).toBe(null);
  });

  it("üzerine gelince açılıyor", async () => {
    const { container } = menu([groups]);
    fireEvent.mouseEnter(container.querySelector(".ctx-item.has-sub")!);
    await settle();
    expect(container.querySelectorAll(".ctx-menu"), "alt panel çizilmedi").toHaveLength(2);
    expect(screen.getByText("Yayın")).toBeTruthy();
    expect(screen.getByText("Geliştirme")).toBeTruthy();
  });

  it("tıklamak da açıyor — dokunmatik için", async () => {
    const { container } = menu([groups]);
    fireEvent.click(container.querySelector(".ctx-item.has-sub")!);
    await settle();
    expect(screen.getByText("Yayın")).toBeTruthy();
  });

  it("alt menüdeki girdi çalışıyor ve TÜM menü kapanıyor", async () => {
    const run = vi.fn();
    const onClose = vi.fn();
    const { container } = menu(
      [
        {
          kind: "submenu",
          label: "Gruba taşı",
          entries: [{ kind: "item", label: "Yayın", run }],
        },
      ],
      onClose,
    );
    fireEvent.mouseEnter(container.querySelector(".ctx-item.has-sub")!);
    await settle();
    fireEvent.click(screen.getByText("Yayın"));

    expect(run).toHaveBeenCalledOnce();
    // Alt menüden seçim yapmak ana menüyü de kapatmalı; aksi hâlde kullanıcı
    // eylemin gerçekleştiğini görmüyor ve ikinci kez tıklıyor.
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("başka bir satıra geçmek alt menüyü kapatıyor", async () => {
    const { container } = menu([groups, { kind: "item", label: "Kapat", run: () => {} }]);
    fireEvent.mouseEnter(container.querySelector(".ctx-item.has-sub")!);
    await settle();
    expect(screen.getByText("Yayın")).toBeTruthy();

    const other = [...container.querySelectorAll(".ctx-item")].find(
      (el) => el.textContent?.includes("Kapat"),
    )!;
    fireEvent.mouseEnter(other);
    await settle(50);
    expect(screen.queryByText("Yayın"), "alt menü açık kaldı").toBe(null);
  });

  it("devre dışı alt menü açılmıyor", async () => {
    const { container } = menu([{ ...groups, disabled: true } as MenuEntry]);
    const row = container.querySelector(".ctx-item.has-sub") as HTMLButtonElement;
    expect(row.disabled).toBe(true);
    fireEvent.mouseEnter(row);
    await settle();
    expect(screen.queryByText("Yayın")).toBe(null);
  });

  it("alt menü açıkken satır işaretli", async () => {
    const { container } = menu([groups]);
    fireEvent.mouseEnter(container.querySelector(".ctx-item.has-sub")!);
    await settle();
    expect(container.querySelector(".ctx-item.has-sub.open")).not.toBe(null);
  });
});

/**
 * Bilgi satırı, durum çubuğunun "⋯" menüsü için eklendi: oradaki girdilerin
 * çoğunun bir eylemi yok, okunacak bir değerleri var.
 */
describe("bilgi satırı", () => {
  it("etiketi ve değeri çiziyor", () => {
    const { container } = menu([{ kind: "info", label: "Kabuk pid", value: "11421" }]);
    expect(container.querySelector(".ctx-info")!.textContent).toContain("Kabuk pid");
    expect(container.querySelector(".ctx-info .ctx-hint")!.textContent).toBe("11421");
  });

  it("değersiz de çizilebiliyor", () => {
    // "Oturum geri yüklendi" gibi tek başına anlamlı durumlar için.
    const { container } = menu([{ kind: "info", label: "Oturum geri yüklendi" }]);
    expect(container.querySelector(".ctx-info")!.textContent).toBe("Oturum geri yüklendi");
    expect(container.querySelector(".ctx-info .ctx-hint")).toBe(null);
  });

  it("düğme değil — tıklanacak bir şey olduğunu söylemiyor", () => {
    // `item` + boş `run` tıklanabilir görünüp menüyü kapatırdı; `disabled` ise
    // "şu an kullanılamıyor" derdi. İkisi de yanlış söz veriyor.
    const { container } = menu([{ kind: "info", label: "Sekme", value: "3" }]);
    expect(container.querySelector(".ctx-info")!.tagName).toBe("DIV");
    expect(container.querySelectorAll("button.ctx-item")).toHaveLength(0);
  });
});

/**
 * Klavye: menü ok tuşlarıyla geziliyor, odak açılışta ilk satırda, kapanışta
 * açıldığı yere dönüyor.
 *
 * Eskiden satırlar düğme olsa da kimse odak vermiyordu: klavyeyle açılan
 * menüde ilk ok tuşu kabuğa gidiyor, ekran okuyucu düz `div` okuyordu.
 */
describe("klavye", () => {
  it("açılışta ilk satır odaklı, roller tanımlı", () => {
    const { container } = menu([
      { kind: "header", label: "Başlık" },
      { kind: "item", label: "Bir", run: () => {} },
      { kind: "check", label: "İki", checked: true, run: () => {} },
    ]);
    expect(container.querySelector('[role="menu"]')).not.toBe(null);
    expect(document.activeElement?.textContent).toBe("Bir");
    expect(screen.getByText("İki").closest("button")!.getAttribute("role")).toBe("menuitemcheckbox");
    expect(screen.getByText("İki").closest("button")!.getAttribute("aria-checked")).toBe("true");
  });

  it("ok tuşları satırlar arasında dolaşıyor, devre dışı satırı atlıyor, uçlarda sarıyor", () => {
    const { container } = menu([
      { kind: "item", label: "Bir", run: () => {} },
      { kind: "item", label: "Kapalı", disabled: true, run: () => {} },
      { kind: "item", label: "Üç", run: () => {} },
    ]);
    const panel = container.querySelector('[role="menu"]')!;
    fireEvent.keyDown(panel, { key: "ArrowDown" });
    expect(document.activeElement?.textContent).toBe("Üç");
    fireEvent.keyDown(panel, { key: "ArrowDown" });
    expect(document.activeElement?.textContent, "sondan başa sarmalı").toBe("Bir");
    fireEvent.keyDown(panel, { key: "ArrowUp" });
    expect(document.activeElement?.textContent, "baştan sona sarmalı").toBe("Üç");
    fireEvent.keyDown(panel, { key: "Home" });
    expect(document.activeElement?.textContent).toBe("Bir");
    fireEvent.keyDown(panel, { key: "End" });
    expect(document.activeElement?.textContent).toBe("Üç");
  });

  it("sağ ok alt menüyü açıp ilk satırına odaklanıyor, sol ok geri dönüyor", async () => {
    const run = vi.fn();
    const { container } = menu([
      { kind: "item", label: "Bir", run: () => {} },
      { kind: "submenu", label: "Taşı", entries: [{ kind: "item", label: "Alfa", run }] },
    ]);
    const panel = container.querySelector('[role="menu"]')!;
    fireEvent.keyDown(panel, { key: "ArrowDown" });
    expect(document.activeElement?.textContent).toContain("Taşı");
    fireEvent.keyDown(panel, { key: "ArrowRight" });
    await settle();
    expect(document.activeElement?.textContent, "alt menünün ilk satırı odaklanmalı").toBe("Alfa");
    const sub = document.activeElement!.closest('[role="menu"]')!;
    fireEvent.keyDown(sub, { key: "ArrowLeft" });
    await settle(50);
    expect(container.querySelectorAll('[role="menu"]'), "alt menü kapanmalı").toHaveLength(1);
    expect(document.activeElement?.textContent, "odak alt menülü satıra dönmeli").toContain("Taşı");
  });

  it("kapanınca odak açıldığı yere dönüyor", () => {
    const button = document.createElement("button");
    button.textContent = "Kaynak";
    document.body.appendChild(button);
    button.focus();
    const view = menu([{ kind: "item", label: "Bir", run: () => {} }]);
    expect(document.activeElement?.textContent).toBe("Bir");
    view.unmount();
    expect(document.activeElement).toBe(button);
    button.remove();
  });
});
