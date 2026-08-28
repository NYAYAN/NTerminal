// @vitest-environment jsdom
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
