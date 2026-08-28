import { describe, expect, it } from "vitest";

import { cwdFromFileUri, parseOsc133, parseOsc633, unescapeOsc } from "./osc";
import { base64ToBytes } from "./ipc";
import { formatDuration, fuzzyScore, baseName, shortenPath } from "./format";
import { matchCombo, parseCombo, prettyCombo } from "./keys";

/**
 * Buradaki kurallar `src-tauri/shell-integration/` altındaki betiklerle
 * simetrik olmak zorunda. Bozulursa komut geçmişi sessizce yanlış metin
 * kaydeder - arayüzde hata gibi görünmez, o yüzden testle bağlıyoruz.
 */
describe("OSC kaçış çözme", () => {
  it("noktalı virgülü geri getirir", () => {
    // Betik `;` -> `\x3B` yazıyor, çünkü OSC yükünde `;` ayırıcı.
    expect(unescapeOsc("git add .\\x3B git commit")).toBe("git add .; git commit");
  });

  it("ters eğik çizgiyi geri getirir", () => {
    expect(unescapeOsc("cd C:\\\\Users\\\\ali")).toBe("cd C:\\Users\\ali");
  });

  it("satır sonu ve denetim karakterlerini çözer", () => {
    expect(unescapeOsc("bir\\x0Aiki")).toBe("bir\niki");
    expect(unescapeOsc("a\\x0D\\x0Ab")).toBe("a\r\nb");
    expect(unescapeOsc("\\x1B[31m")).toBe("\u001b[31m");
  });

  it("kaçış içermeyen metne dokunmaz", () => {
    expect(unescapeOsc("npm run build")).toBe("npm run build");
    expect(unescapeOsc("")).toBe("");
  });

  it("geçersiz kaçışta veri kaybetmez", () => {
    // `\xZZ` geçerli değil: ters eğik çizgi olduğu gibi kalmalı.
    expect(unescapeOsc("a\\xZZb")).toBe("a\\xZZb");
    expect(unescapeOsc("son\\")).toBe("son\\");
  });

  it("küçük harfli hex de kabul eder", () => {
    expect(unescapeOsc("a\\x3bb")).toBe("a;b");
  });
});

describe("OSC 133 ayrıştırma", () => {
  it("istem işaretlerini tanır", () => {
    expect(parseOsc133("A").kind).toBe("A");
    expect(parseOsc133("B").kind).toBe("B");
    expect(parseOsc133("C").kind).toBe("C");
  });

  it("çıkış kodunu okur", () => {
    expect(parseOsc133("D;0")).toEqual({ kind: "D", exitCode: 0 });
    expect(parseOsc133("D;3")).toEqual({ kind: "D", exitCode: 3 });
    // Yerel uygulamalar negatif/büyük kodlar döndürebiliyor.
    expect(parseOsc133("D;-1073741510").exitCode).toBe(-1073741510);
  });

  it("kod bildirilmediğinde null verir", () => {
    // cmd.exe çıkış kodu bildiremiyor; "bilinmiyor" ile "0" karışmamalı.
    expect(parseOsc133("D")).toEqual({ kind: "D", exitCode: null });
    expect(parseOsc133("D;")).toEqual({ kind: "D", exitCode: null });
    expect(parseOsc133("D;abc").exitCode).toBe(null);
  });

  it("bilinmeyen işareti yok sayar", () => {
    expect(parseOsc133("Z").kind).toBe(null);
    expect(parseOsc133("").kind).toBe(null);
  });
});

describe("OSC 633 ayrıştırma", () => {
  it("komut metnini çözer", () => {
    const parsed = parseOsc633("E;dotnet build .\\x3B echo bitti");
    expect(parsed?.kind).toBe("E");
    expect(parsed?.value).toBe("dotnet build .; echo bitti");
  });

  it("komut metnindeki boşlukları kırpar", () => {
    expect(parseOsc633("E;   git status   ")?.value).toBe("git status");
  });

  it("dizin özelliğini okur", () => {
    const parsed = parseOsc633("P;Cwd=C:\\\\Users\\\\ali\\\\proje");
    expect(parsed?.key).toBe("Cwd");
    expect(parsed?.value).toBe("C:\\Users\\ali\\proje");
  });

  it("süre eklentisini okur", () => {
    const parsed = parseOsc633("X;Dur=4200");
    expect(parsed?.key).toBe("Dur");
    expect(parsed?.value).toBe("4200");
  });

  it("boş yükte null verir", () => {
    expect(parseOsc633("")).toBe(null);
  });
});

describe("OSC 7 dizin çözümlemesi", () => {
  it("sürücü harfli yolu Windows biçimine çevirir", () => {
    expect(cwdFromFileUri("file:///C:/Users/ali/proje")).toBe("C:\\Users\\ali\\proje");
  });

  it("makine adını atar", () => {
    expect(cwdFromFileUri("file://PC-01/C:/Users/ali")).toBe("C:\\Users\\ali");
  });

  it("yüzde kodlamasını çözer", () => {
    expect(cwdFromFileUri("file:///C:/Program%20Files/Git")).toBe("C:\\Program Files\\Git");
  });

  it("WSL / Linux yolunu olduğu gibi bırakır", () => {
    expect(cwdFromFileUri("file:///home/ali/kod")).toBe("/home/ali/kod");
  });

  it("boş yükte null verir", () => {
    expect(cwdFromFileUri("")).toBe(null);
    expect(cwdFromFileUri("   ")).toBe(null);
  });
});

describe("base64 çözme", () => {
  it("ASCII metni çözer", () => {
    expect(new TextDecoder().decode(base64ToBytes("aGVsbG8="))).toBe("hello");
  });

  it("dolgusuz girdiyi çözer", () => {
    expect(new TextDecoder().decode(base64ToBytes("aGVsbG8"))).toBe("hello");
  });

  it("UTF-8 dışı ham baytları korur", () => {
    // PTY çıktısı geçerli UTF-8 olmak zorunda değil; kayıpsız taşınmalı.
    const bytes = base64ToBytes("//79");
    expect(Array.from(bytes)).toEqual([0xff, 0xfe, 0xfd]);
  });

  it("boş girdide boş dizi verir", () => {
    expect(base64ToBytes("").length).toBe(0);
  });

  it("uzun içerikte tam uzunluk korunur", () => {
    const source = new Uint8Array(3000).map((_, i) => i % 256);
    const b64 = btoa(String.fromCharCode(...source));
    expect(Array.from(base64ToBytes(b64))).toEqual(Array.from(source));
  });
});

describe("biçimlendirme", () => {
  it("süreyi okunabilir yazar", () => {
    expect(formatDuration(340)).toBe("340 ms");
    expect(formatDuration(1500)).toBe("1.5 sn");
    expect(formatDuration(45_000)).toBe("45 sn");
    expect(formatDuration(125_000)).toBe("2 dk 5 sn");
    expect(formatDuration(null)).toBe("");
  });

  it("yol son parçasını verir", () => {
    expect(baseName("C:\\Users\\ali\\proje")).toBe("proje");
    expect(baseName("C:\\Users\\ali\\proje\\")).toBe("proje");
    expect(baseName(null)).toBe("");
  });

  it("uzun yolu kısaltır", () => {
    expect(shortenPath("C:\\a\\b\\c\\d\\e", 2)).toBe("…\\d\\e");
    // Kısa yol olduğu gibi kalmalı.
    expect(shortenPath("C:\\a", 3)).toBe("C:\\a");
  });

  it("bulanık arama alt diziyi öne alır", () => {
    const exact = fuzzyScore("git commit", "commit");
    const fuzzy = fuzzyScore("git checkout main", "cm");
    expect(exact).not.toBe(null);
    expect(fuzzy).not.toBe(null);
    expect(exact!).toBeLessThan(fuzzy!);
  });

  it("bulanık arama eşleşmeyeni reddeder", () => {
    expect(fuzzyScore("git status", "zzz")).toBe(null);
    // Boş sorgu her şeyi kabul eder.
    expect(fuzzyScore("git status", "")).toBe(0);
  });
});

describe("kısayollar", () => {
  const event = (init: Partial<KeyboardEvent>): KeyboardEvent =>
    ({ ctrlKey: false, shiftKey: false, altKey: false, key: "", code: "", ...init }) as KeyboardEvent;

  it("basit bileşimi eşler", () => {
    expect(matchCombo(event({ ctrlKey: true, key: "t", code: "KeyT" }), "Ctrl+T")).toBe(true);
  });

  it("fazladan değiştirici tuşu reddeder", () => {
    // Ctrl+Shift+T, Ctrl+T ile eşleşmemeli: ikisi ayrı eylem.
    expect(
      matchCombo(event({ ctrlKey: true, shiftKey: true, key: "T", code: "KeyT" }), "Ctrl+T"),
    ).toBe(false);
  });

  it("Shift ile gelen büyük harfi eşler", () => {
    expect(
      matchCombo(event({ ctrlKey: true, shiftKey: true, key: "H", code: "KeyH" }), "Ctrl+Shift+H"),
    ).toBe(true);
  });

  it("Tab ve özel tuşları eşler", () => {
    expect(matchCombo(event({ ctrlKey: true, key: "Tab", code: "Tab" }), "Ctrl+Tab")).toBe(true);
  });

  it("noktalama tuşlarını fiziksel kodla da eşler", () => {
    expect(matchCombo(event({ ctrlKey: true, key: "+", code: "Equal" }), "Ctrl+=")).toBe(true);
    expect(matchCombo(event({ ctrlKey: true, key: ",", code: "Comma" }), "Ctrl+,")).toBe(true);
  });

  it("bileşimi okunabilir yazar", () => {
    expect(prettyCombo("ctrl+shift+h")).toBe("Ctrl+Shift+H");
    expect(prettyCombo("Ctrl+Tab")).toBe("Ctrl+Tab");
  });

  it("geçersiz bileşimi ayrıştırmaz", () => {
    expect(parseCombo("")).toBe(null);
    expect(parseCombo("Ctrl")).toBe(null);
  });
});
