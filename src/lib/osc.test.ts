import { beforeEach, describe, expect, it } from "vitest";

import {
  cwdCandidatesFromFileUri,
  cwdFromFileUri,
  parseOsc133,
  parseOsc633,
  unescapeOsc,
} from "./osc";
import { base64ToBytes } from "./ipc";
import { formatDuration, fuzzyScore, baseName, dirName, shortenPath } from "./format";
import { matchCombo, parseCombo, prettyCombo } from "./keys";
import { setPlatform } from "./platform";

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

  it("çok baytlı UTF-8 yüzde dizilerini birlikte çözer", () => {
    // `%C3%BC` tek başına anlamsız; ancak ARDIŞIK dizi ü'dür.
    expect(cwdFromFileUri("file://mac/Users/ali/Masa%C3%BCst%C3%BC")).toBe("/Users/ali/Masaüstü");
  });

  it("GEÇERSİZ yüzde dizisi yükü atmıyor, ham bırakıyor", () => {
    // Kabuklar yolu bazen yüzde kodlamadan ham yazıyor; ham yolda `%` sıradan
    // bir karakter. `decodeURIComponent` tek geçersiz dizide bütün yükü atıp
    // `null` dönüyordu: yalnızca OSC 7 gönderen kabukta bu klasörde dizin
    // bildirimi hiç güncellenmiyordu.
    expect(cwdFromFileUri("file://mac/tmp/100%_test")).toBe("/tmp/100%_test");
    expect(cwdFromFileUri("file://mac/tmp/50%")).toBe("/tmp/50%");
    expect(cwdFromFileUri("file://mac/tmp/%E0%A4")).toBe("/tmp/%E0%A4"); // eksik UTF-8
  });

  it("geçerli ve geçersiz diziler bir arada", () => {
    expect(cwdFromFileUri("file://mac/tmp/a%20b/100%_x")).toBe("/tmp/a b/100%_x");
  });
});

describe("OSC 7 yolunun iki okuması", () => {
  // Kabuk betikleri (zsh, bash) yolu yüzde KODLAMADAN ham yazıyor; cmd.exe ve
  // standart göndericiler kodlayarak. Yükten hangisi olduğu anlaşılamıyor:
  // `TerminalSession` iki okumayı da kesin bildirimle (633;P;Cwd) karşılaştırıyor.
  // Tek okuma (hep çözümle) adında `%20` geçen klasörü, tek okuma (hiç çözümleme)
  // kodlanmış yolu bozuyordu.

  it("ham ve çözülmüş okuma birbirinden ayrılıyor", () => {
    expect(cwdCandidatesFromFileUri("file://mac/tmp/a%20b")).toEqual({
      raw: "/tmp/a%20b",
      decoded: "/tmp/a b",
    });
  });

  it("yüzde içermeyen yolda ikisi aynı", () => {
    expect(cwdCandidatesFromFileUri("file:///home/ali/kod")).toEqual({
      raw: "/home/ali/kod",
      decoded: "/home/ali/kod",
    });
  });

  it("Windows yolunda ham okuma da sürücü biçimine çevriliyor", () => {
    // cmd.exe: `file:///C:\src\appd\Release` (ters bölü ham `$P`den geliyor).
    expect(cwdCandidatesFromFileUri("file:///C:\\src\\appd\\Release")).toEqual({
      raw: "C:\\src\\appd\\Release",
      decoded: "C:\\src\\appd\\Release",
    });
    expect(cwdCandidatesFromFileUri("file:///C:/Program%20Files/Git")).toEqual({
      raw: "C:\\Program%20Files\\Git",
      decoded: "C:\\Program Files\\Git",
    });
  });

  it("boş yükte null", () => {
    expect(cwdCandidatesFromFileUri("")).toBe(null);
    expect(cwdCandidatesFromFileUri("  ")).toBe(null);
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
    expect(baseName("/Users/ali/proje")).toBe("proje");
    expect(baseName("/Users/ali/proje/")).toBe("proje");
    expect(baseName(null)).toBe("");
  });

  it("klasör kısmını ayırıcısıyla verir", () => {
    // "Değişiklikler" satırındaki soluk klasör ön eki buradan geliyor:
    // dosya adı ayrı bir öge olduğu için ön ekin ayırıcıyla bitmesi gerekiyor,
    // yoksa ikisi yapışık ("srcapp.ts") çiziliyordu.
    expect(dirName("src/lib/format.ts")).toBe("src/lib/");
    expect(dirName("src\\lib\\format.ts")).toBe("src\\lib\\");
    // Kökteki dosyada klasör YOK: `null` dönüyor ve çağıran boş bir ön ek
    // çizme kararını ayrıca vermek zorunda kalmıyor.
    expect(dirName("README.md")).toBe(null);
  });

  it("uzun yolu kısaltır", () => {
    expect(shortenPath("C:\\a\\b\\c\\d\\e", 2)).toBe("…\\d\\e");
    // Kısa yol olduğu gibi kalmalı.
    expect(shortenPath("C:\\a", 3)).toBe("C:\\a");
  });

  it("kısaltırken yolun kendi ayırıcısını koruyor", () => {
    // POSIX yolunu `…\Users\ali` diye göstermek yolu tanınmaz hâle getiriyor;
    // mac'te durum çubuğunda ve sekme altyazısında tam olarak bu görünürdü.
    expect(shortenPath("/Users/ali/Desktop/proje/src", 2)).toBe("…/proje/src");
    // İçe alınan bir yapılandırmadan gelen Windows yolu mac'te de kendi
    // biçiminde kalmalı — çevirmek yolu yanlış göstermek olur.
    expect(shortenPath("C:\\a\\b\\c\\d", 2)).toBe("…\\c\\d");
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
  /**
   * Platform ELLE kuruluyor; buradaki iddialar Windows yazımını bağlıyor
   * (mac yazımı `keysMac.test.ts` içinde).
   *
   * Kurulmadığında test makineye göre değişiyordu: `platform.ts` ilk tahmini
   * `navigator`dan alıyor ve Node 24 `navigator.platform` alanını sunuyor —
   * Windows'ta "Win32", mac'te "MacIntel". Yani aynı test Windows'ta geçip
   * mac'te düşüyordu, üstelik `prettyCombo` doğru çalışırken: beklenen
   * "Ctrl+Shift+H", gelen "⌃⇧H".
   */
  beforeEach(() => setPlatform("windows"));

  // Gerçek bir KeyboardEvent'te dört değiştirici alanı da HER ZAMAN boolean.
  // Birini eksik bırakmak `undefined` üretir ve `matchCombo`'nun tam
  // karşılaştırması onu hiçbir şeyle eşleştiremez — test kodun değil,
  // yardımcının hatasıyla düşer.
  const event = (init: Partial<KeyboardEvent>): KeyboardEvent =>
    ({
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      metaKey: false,
      key: "",
      code: "",
      ...init,
    }) as KeyboardEvent;

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
    // Öneri panelinin silme ipucu; küçük harfli "Shift+delete" yazıyordu.
    expect(prettyCombo("Shift+Delete")).toBe("Shift+Del");
  });

  it("geçersiz bileşimi ayrıştırmaz", () => {
    expect(parseCombo("")).toBe(null);
    expect(parseCombo("Ctrl")).toBe(null);
  });
});
