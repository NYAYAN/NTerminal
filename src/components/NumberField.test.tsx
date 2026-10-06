// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LIMITS } from "../lib/settingsLimits";
import { NumberField } from "./NumberField";

/**
 * Sayı ayarı yazarken DEĞİL, kutudan çıkınca kaydediyor.
 *
 * ÖLÇÜLEN VERİ KAYBI: "Kaydırma tamponu"na 10000'in yerine 20000 yazarken
 * ilk "2" tuşunda ayar 2 oldu ve açık bütün terminaller tamponlarını o an
 * kırptı — 3001 satırlık sekme 58 satıra düştü (geri gelmiyor). Kutu
 * boşaltılınca ayar 0 oldu ve diske 0 yazıldı. Bu testler ara değerlerin
 * ayara HİÇ ulaşmadığını bağlıyor.
 */

afterEach(cleanup);

function kur(value = 10_000) {
  const onCommit = vi.fn();
  const view = render(
    <NumberField value={value} limit={LIMITS.scrollback} step={500} onCommit={onCommit} />,
  );
  const input = view.container.querySelector("input") as HTMLInputElement;
  return { ...view, input, onCommit };
}

/** Kullanıcının tuş tuş yazması: her tuşta kutunun değeri değişiyor. */
function yaz(input: HTMLInputElement, text: string) {
  let value = "";
  for (const ch of text) {
    value += ch;
    fireEvent.change(input, { target: { value } });
  }
}

describe("sayı ayarı", () => {
  it("yazarken ara değerler kaydedilmiyor", () => {
    const { input, onCommit } = kur();
    yaz(input, "20000");
    expect(onCommit, "ara değer ayara ulaştı").not.toHaveBeenCalled();
    expect(input.value).toBe("20000");
  });

  it("kutudan çıkınca kaydediyor", () => {
    const { input, onCommit } = kur();
    yaz(input, "20000");
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(20_000);
  });

  it("Enter kaydediyor", () => {
    const { input, onCommit } = kur();
    yaz(input, "12000");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledWith(12_000);
  });

  it("sınırın dışındaki değer sınıra çekiliyor", () => {
    const { input, onCommit } = kur();
    yaz(input, "2");
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith(LIMITS.scrollback.min);
  });

  it("boşaltılan kutu eski değere dönüyor, 0 yazmıyor", () => {
    const { input, onCommit } = kur();
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
    expect(input.value).toBe("10000");
  });

  it("aynı değer kaydedilmiyor", () => {
    const { input, onCommit } = kur();
    yaz(input, "10000");
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("Esc yazılanı geri alıyor ve o sırada Esc'yi sahipleniyor", () => {
    // Genel dinleyici Esc'yi pencereyi kapatmaya harcamasın (escapeOwnedBy).
    const { input, onCommit } = kur();
    expect(input.hasAttribute("data-owns-escape"), "düzenlenmiyorken sahiplenmiş").toBe(false);
    yaz(input, "3000");
    expect(input.hasAttribute("data-owns-escape"), "düzenlerken sahiplenmiyor").toBe(true);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.value).toBe("10000");
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("kaydedilmemiş değerle sökülürse yine kaydediyor", () => {
    // Pencere kapandı (örtüye tıklama): kullanıcı yazdı ve vazgeçmedi.
    const { input, onCommit, unmount } = kur();
    yaz(input, "30000");
    unmount();
    expect(onCommit).toHaveBeenCalledWith(30_000);
  });
});
