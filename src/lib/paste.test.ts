import { describe, expect, it } from "vitest";

import { sanitizePaste } from "./paste";

const ESC = String.fromCharCode(27);

describe("yapıştırılan metnin temizlenmesi", () => {
  it("bracketed paste'in bitiş işareti düz metne dönüyor", () => {
    // YENİDEN ÜRETİLDİ (zsh): bu metin temizlenmeden yapıştırılınca
    // `echo SIZDI` Enter'a basılmadan çalıştı.
    const pano = `echo guvenli${ESC}[201~\necho SIZDI\n`;
    const temiz = sanitizePaste(pano);
    expect(temiz).toBe("echo guvenli[201~\necho SIZDI\n");
    expect(temiz).not.toContain(ESC);
  });

  it("sekme ve satır sonları kalıyor", () => {
    expect(sanitizePaste("a\tb\nc\r\nd")).toBe("a\tb\nc\r\nd");
  });

  it("C0, DEL ve C1 denetim karakterleri atılıyor", () => {
    // \x15 Ctrl+U: kutuda `echo iyi kotu` görünüp kabukta `kotu` çalışırdı.
    expect(sanitizePaste("echo iyi \x15kotu")).toBe("echo iyi kotu");
    expect(sanitizePaste("a\x00b\x03c\x04d\x08e\x0bf\x0cg\x7fh")).toBe("abcdefgh");
    // \x9b tek baytlık CSI, \x85 NEL.
    expect(sanitizePaste("a\x9b201~b\x85c")).toBe("a201~bc");
  });

  it("sıradan metne dokunulmuyor", () => {
    const metin = 'git commit -m "çğıöşü — 日本語 🚀" && echo $HOME | sed \'s/a/b/\'';
    expect(sanitizePaste(metin)).toBe(metin);
    expect(sanitizePaste("")).toBe("");
  });
});
