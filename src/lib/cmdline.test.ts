import { describe, expect, it } from "vitest";

import { tokenizeCommand } from "./cmdline";

const kinds = (text: string) => tokenizeCommand(text).map((t) => `${t.kind}:${t.text}`);
const birlesim = (text: string) => tokenizeCommand(text).map((t) => t.text).join("");

describe("komut satırı ayırma", () => {
  it("çıktının birleşimi girdiye BİREBİR eşit", () => {
    // Bu testin bağladığı şey görsel değil, hizalama: renkli katman saydam
    // metin kutusunun ARKASINDA duruyor. Tek bir boşluk kaybolsa harfler
    // kayar ve imleç yanlış yerde görünür.
    for (const ornek of [
      "npm run build",
      "  git   status  ",
      'echo "merhaba dünya" | grep -i selam',
      "cd ..\src && npm test",
      "",
      "   ",
      'tırnak "kapanmadı',
    ]) {
      expect(birlesim(ornek), JSON.stringify(ornek)).toBe(ornek);
    }
  });

  it("ilk sözcük komut adı", () => {
    expect(kinds("npm test")[0]).toBe("cmd:npm");
  });

  it("bayraklar ayrı", () => {
    expect(kinds("ls -la --color")).toEqual(["cmd:ls", "plain: ", "flag:-la", "plain: ", "flag:--color"]);
  });

  it("borudan sonra yeni komut başlıyor", () => {
    // `git log | grep hata` satırında `grep` de bir komut; vurguyu hak ediyor.
    const out = tokenizeCommand("git log | grep hata");
    expect(out.filter((t) => t.kind === "cmd").map((t) => t.text)).toEqual(["git", "grep"]);
  });

  it("&& ve ; sonrası da komut", () => {
    const out = tokenizeCommand("cd src && npm test; ls");
    expect(out.filter((t) => t.kind === "cmd").map((t) => t.text)).toEqual(["cd", "npm", "ls"]);
  });

  it("yönlendirme yeni komut BAŞLATMIYOR", () => {
    // `>` sonrası dosya adı geliyor, komut değil.
    const out = tokenizeCommand("ls > liste.txt");
    expect(out.filter((t) => t.kind === "cmd").map((t) => t.text)).toEqual(["ls"]);
  });

  it("tırnaklı metin tek parça", () => {
    const out = tokenizeCommand('echo "iki kelime"');
    expect(out.find((t) => t.kind === "str")?.text).toBe('"iki kelime"');
  });

  it("kapanmamış tırnak satır sonuna kadar", () => {
    // Ekranda görmek istenen tam olarak bu: renk "tırnağı kapatmadım" diyor.
    const out = tokenizeCommand('echo "yarım');
    expect(out.find((t) => t.kind === "str")?.text).toBe('"yarım');
  });

  it("bayrak değeri bayrak değil", () => {
    const out = tokenizeCommand("ng build --configuration production");
    expect(out.filter((t) => t.kind === "flag").map((t) => t.text)).toEqual(["--configuration"]);
  });

  it("boş girdi boş liste", () => {
    expect(tokenizeCommand("")).toEqual([]);
  });
});
