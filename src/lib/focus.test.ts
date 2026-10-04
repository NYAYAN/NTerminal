// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { isNativeCopyKey, pageSelectionText } from "./focus";

/**
 * Sayfadaki seçimin kopyalanması.
 *
 * BİLDİRİLEN: Değişiklikler panelindeki git hata kutusunun metni seçilip Cmd+C
 * yapılınca kopyalanmıyordu — genel kısayol tuşu terminalin seçimine
 * yönlendirip tarayıcının kopyalamasını engelliyordu. `App` artık sayfada
 * seçim varken tarayıcının kendi tuşunda yoldan çekiliyor; bu iki işlev o
 * kararın girdileri.
 */

afterEach(() => {
  window.getSelection()?.removeAllRanges();
  document.body.innerHTML = "";
});

function sec(el: Element) {
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
}

function kur(html: string): HTMLElement {
  document.body.innerHTML = html;
  return document.body;
}

describe("pageSelectionText", () => {
  it("paneldeki seçili metni veriyor", () => {
    const b = kur('<div class="git-commit-error"><pre>The following paths are ignored</pre></div>');
    sec(b.querySelector("pre")!);
    expect(pageSelectionText()).toBe("The following paths are ignored");
  });

  it("seçim yoksa boş", () => {
    kur("<pre>metin</pre>");
    expect(pageSelectionText()).toBe("");
  });

  it("terminalin içindeki seçim sayılmıyor (xterm'in kendi kopyalaması var)", () => {
    const b = kur('<div class="xterm"><span>ekran</span></div>');
    sec(b.querySelector("span")!);
    expect(pageSelectionText()).toBe("");
  });

  it("komut kutusunun içindeki seçim sayılmıyor (kutunun kendi kopyalaması var)", () => {
    const b = kur('<div class="command-input"><span>ls -la</span></div>');
    sec(b.querySelector("span")!);
    expect(pageSelectionText()).toBe("");
  });
});

describe("isNativeCopyKey", () => {
  const tus = (p: Partial<KeyboardEvent>) => ({
    key: "c",
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ...p,
  });

  it("mac'te Cmd+C, Ctrl+C değil", () => {
    expect(isNativeCopyKey(tus({ metaKey: true }), true)).toBe(true);
    // mac'te Ctrl+C kabuğun tuşu (SIGINT), kopyalama değil.
    expect(isNativeCopyKey(tus({ ctrlKey: true }), true)).toBe(false);
  });

  it("Windows'ta Ctrl+C; Ctrl+Shift+C tarayıcının tuşu değil", () => {
    expect(isNativeCopyKey(tus({ ctrlKey: true }), false)).toBe(true);
    expect(isNativeCopyKey(tus({ ctrlKey: true, shiftKey: true }), false)).toBe(false);
    expect(isNativeCopyKey(tus({ metaKey: true }), false)).toBe(false);
  });

  it("büyük harf ve başka tuşlar", () => {
    expect(isNativeCopyKey(tus({ key: "C", metaKey: true }), true)).toBe(true);
    expect(isNativeCopyKey(tus({ key: "v", metaKey: true }), true)).toBe(false);
    expect(isNativeCopyKey(tus({ metaKey: true, altKey: true }), true)).toBe(false);
  });
});
