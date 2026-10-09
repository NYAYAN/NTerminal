import { describe, expect, it } from "vitest";

import { quoteForShell, shellFamily } from "./shellQuote";

/**
 * `cd` için yol alıntılama, kabuk ailesine göre.
 *
 * ÖLÇÜLEN HATA: tek kural (cmd'ninki — `"…"`, içerideki `"` ikilenir) bütün
 * kabuklara uygulanıyordu. POSIX kabuklarda `$`, `` ` ``, `\` çift tırnak
 * içinde genişler ve boşluk yoksa tırnak da yoktu: `~/Work/$RELEASE`
 * klasörü `~/Work/`a iniyordu, `Projeler!eski` zsh'de "event not found"
 * veriyordu. Kilitli sekmenin sessiz düzeltmesi aynı yoldan yanlış klasöre
 * `cd` atıp sonraki komutu orada çalıştırıyordu.
 */
describe("POSIX (bash, zsh, fish)", () => {
  it("düz yol tırnaksız", () => {
    expect(quoteForShell("/Users/ali/proje", "posix")).toBe("/Users/ali/proje");
    expect(quoteForShell("~/proje", "posix")).toBe("~/proje");
    expect(quoteForShell("", "posix")).toBe("");
  });

  it("genişleyen karakterler tek tırnakla korunuyor", () => {
    expect(quoteForShell("/Users/ali/Work/$RELEASE", "posix")).toBe("'/Users/ali/Work/$RELEASE'");
    expect(quoteForShell("/tmp/Projeler!eski", "posix")).toBe("'/tmp/Projeler!eski'");
    expect(quoteForShell("/tmp/a`b", "posix")).toBe("'/tmp/a`b'");
    expect(quoteForShell("/tmp/yeni klasor", "posix")).toBe("'/tmp/yeni klasor'");
  });

  it("içerideki tek tırnak kapanıp kaçırılıyor", () => {
    expect(quoteForShell("/tmp/O'Neil", "posix")).toBe("'/tmp/O'\\''Neil'");
  });

  it("`~` tırnağın dışında kalıyor: kabuk onu ev dizinine açmalı", () => {
    expect(quoteForShell("~/yeni klasor", "posix")).toBe("~/'yeni klasor'");
    expect(quoteForShell("~ali/yeni klasor", "posix")).toBe("~ali/'yeni klasor'");
  });
});

describe("PowerShell", () => {
  it("düz Windows yolu tırnaksız", () => {
    expect(quoteForShell("C:\\Users\\ali\\proje", "powershell")).toBe("C:\\Users\\ali\\proje");
  });

  it("boşluk ve `$` tek tırnakla, içerideki tırnak ikileniyor", () => {
    expect(quoteForShell("C:\\yeni klasor", "powershell")).toBe("'C:\\yeni klasor'");
    expect(quoteForShell("C:\\Work\\$env", "powershell")).toBe("'C:\\Work\\$env'");
    expect(quoteForShell("C:\\O'Neil", "powershell")).toBe("'C:\\O''Neil'");
  });
});

describe("cmd.exe", () => {
  it("boşluk ve ayraçlar çift tırnakla, diğerleri olduğu gibi", () => {
    expect(quoteForShell("C:\\proje", "cmd")).toBe("C:\\proje");
    expect(quoteForShell("C:\\yeni klasor", "cmd")).toBe('"C:\\yeni klasor"');
    expect(quoteForShell("C:\\a&b", "cmd")).toBe('"C:\\a&b"');
    // cmd'de `$` genişlemez; tırnak gereksiz.
    expect(quoteForShell("C:\\Work\\$x", "cmd")).toBe("C:\\Work\\$x");
  });
});

describe("aile seçimi", () => {
  it("profil türü belirleyici", () => {
    expect(shellFamily("zsh", "C:\\x\\cmd.exe", "windows")).toBe("posix");
    expect(shellFamily("pwsh", "/bin/zsh", "macos")).toBe("powershell");
    expect(shellFamily("power-shell", null, "macos")).toBe("powershell");
    expect(shellFamily("cmd", null, "macos")).toBe("cmd");
    expect(shellFamily("wsl", null, "windows")).toBe("posix");
    expect(shellFamily("fish", null, "windows")).toBe("posix");
  });

  it("özel profilde çalıştırılan kabuğun adına bakılıyor", () => {
    expect(shellFamily("custom", "C:\\Program Files\\PowerShell\\7\\pwsh.exe", "windows")).toBe("powershell");
    expect(shellFamily("custom", "C:\\Windows\\System32\\cmd.exe", "windows")).toBe("cmd");
    expect(shellFamily("custom", "/opt/homebrew/bin/bash", "macos")).toBe("posix");
    expect(shellFamily(undefined, "/bin/sh", "macos")).toBe("posix");
  });

  it("hiçbir ipucu yoksa platform", () => {
    expect(shellFamily(undefined, "", "windows")).toBe("cmd");
    expect(shellFamily(undefined, "", "macos")).toBe("posix");
    expect(shellFamily(null, null, "linux")).toBe("posix");
    expect(shellFamily("custom", "/usr/local/bin/nu", "macos")).toBe("posix");
  });
});
