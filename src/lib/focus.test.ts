// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { escapeOwnedBy, focusEscaped, isNativeCopyKey, pageSelectionText } from "./focus";

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

/**
 * Esc'yi odaktaki öğe karşılıyor.
 *
 * ÖLÇÜLEN: Ayarlar'da kısayol kaydederken ("Tuşa basın…") Esc kaydı iptal
 * etmiyor, bütün pencereyi kapatıyordu. Genel dinleyici `window`da capture
 * fazında ve Esc'yi her zaman ilk o görüyordu; arama kutusunun "Esc temizler"
 * kodu da aynı sebeple gerçek uygulamada hiç çalışmıyordu (bileşen testinde
 * geçiyordu: orada genel dinleyici yok — bu yüzden kural burada da bağlı).
 */
describe("Esc sahipliği", () => {
  it("öznitelik taşıyan öğe ve çocukları sahipleniyor", () => {
    const root = kur('<div data-owns-escape><input id="i" /></div><input id="d" />');
    expect(escapeOwnedBy(root.querySelector("#i"))).toBe(true);
    expect(escapeOwnedBy(root.querySelector("#d"))).toBe(false);
  });

  it("öğe olmayan hedef sahiplenmiyor", () => {
    expect(escapeOwnedBy(null)).toBe(false);
    expect(escapeOwnedBy(window)).toBe(false);
  });

  it("genel dinleyici örtüleri kapatmadan ÖNCE soruyor", () => {
    // Sıra şart: kural Ayarlar'ı kapatan satırdan sonra gelse Esc yine
    // pencereyi kapatırdı. Kaynakta yorumlar dışarıda bırakılarak okunuyor.
    const app = readFileSync(join(process.cwd(), "src/App.tsx"), "utf8").replace(
      /\/\/[^\n]*/g,
      "",
    );
    const branch = app.slice(app.indexOf('if (event.key === "Escape")'));
    const owned = branch.indexOf("escapeOwnedBy(event.target)");
    const settings = branch.indexOf("settingsOpen: false");
    expect(owned, "Esc dalında escapeOwnedBy yok").toBeGreaterThan(-1);
    expect(owned, "escapeOwnedBy Ayarlar'ı kapatan satırdan sonra").toBeLessThan(settings);
  });
});

/**
 * Kip penceresinden kaçan odak.
 *
 * ÖLÇÜLEN: Ayarlar ⌘, ile açılınca odak terminalin gizli textarea'sında
 * kalıyordu ve yazılan harf kabuğa gidiyordu.
 */
describe("odak kaçışı", () => {
  it("pencerenin içi kaçış değil, terminal kaçış", () => {
    const root = kur(
      '<div class="overlay"><div id="m"><input id="i" /></div></div><textarea id="t"></textarea>',
    );
    const modal = root.querySelector("#m")!;
    expect(focusEscaped(root.querySelector("#i"), modal)).toBe(false);
    expect(focusEscaped(root.querySelector("#t"), modal)).toBe(true);
  });

  it("başka bir örtüye (onay penceresi) geçen odak kaçış değil", () => {
    // Ayarların üstünde açılan onay penceresi odağı kendi düğmesine alıyor;
    // onu geri çekmek onayı kullanılmaz yapardı.
    const root = kur(
      '<div class="overlay"><div id="m"></div></div><div class="overlay"><button id="b"></button></div>',
    );
    expect(focusEscaped(root.querySelector("#b"), root.querySelector("#m")!)).toBe(false);
  });
});
