import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { comboFromEvent, matchCombo, parseCombo, prettyCombo } from "./keys";
import { setPlatform } from "./platform";

/**
 * Cmd tuşu ve macOS kısayol yazımı.
 *
 * Neden ayrı bir dosya: `osc.test.ts` içindeki kısayol testleri Windows
 * davranışını bağlıyor; buradakiler mac'e özgü ve platformu elle kuruyor.
 *
 * En önemli iddia en altta: mac'te hiçbir varsayılan kısayol `Ctrl+<harf>`
 * olmamalı. macOS'ta Ctrl terminalin KENDİ tuşu (Ctrl+C = SIGINT, Ctrl+D = EOF,
 * Ctrl+R = ters arama). Arayüz kısayolunu oraya bağlamak kabuğun tuşunu yer ve
 * bu ancak mac'te, komut çalışırken fark edilir.
 */

const KEY_EVENT = {
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  metaKey: false,
  key: "",
  code: "",
};

const event = (init: Partial<KeyboardEvent>): KeyboardEvent =>
  ({ ...KEY_EVENT, ...init }) as KeyboardEvent;

afterEach(() => setPlatform("windows"));

describe("Cmd ayrıştırma", () => {
  it("dört yazımı da kabul ediyor", () => {
    // Kısayollar settings.json'da metin olarak duruyor ve başka bir makineden
    // ya da sürümden gelebiliyor; tek yazıma bağlamak taşınabilirliği kırar.
    for (const spelling of ["Cmd+T", "Command+T", "Meta+T", "Super+T"]) {
      const parsed = parseCombo(spelling);
      expect(parsed?.meta, `${spelling} meta olarak okunmadı`).toBe(true);
      expect(parsed?.key).toBe("t");
      expect(parsed?.ctrl, `${spelling} yanlışlıkla ctrl saydı`).toBe(false);
    }
  });

  it("Option ve Alt aynı tuş", () => {
    // mac klavyesinde tuşun üstünde "option" yazıyor; ayarları elle düzenleyen
    // kullanıcı onu yazabilmeli.
    for (const spelling of ["Alt+B", "Option+B", "Opt+B"]) {
      expect(parseCombo(spelling)?.alt, `${spelling} alt olarak okunmadı`).toBe(true);
    }
  });

  it("Cmd ile Ctrl karışmıyor", () => {
    expect(parseCombo("Ctrl+T")?.meta).toBe(false);
    expect(parseCombo("Cmd+T")?.ctrl).toBe(false);
  });

  it("birleşik değiştiriciler okunuyor", () => {
    const parsed = parseCombo("Cmd+Shift+P");
    expect(parsed).toMatchObject({ meta: true, shift: true, ctrl: false, alt: false, key: "p" });
  });
});

describe("Cmd eşleştirme", () => {
  it("Cmd+T olayını eşliyor", () => {
    expect(matchCombo(event({ metaKey: true, key: "t", code: "KeyT" }), "Cmd+T")).toBe(true);
  });

  it("Ctrl+T tanımı Cmd+T olayıyla eşleşmiyor", () => {
    // Meta tam karşılaştırılmasa mac'te Cmd basılıyken Ctrl kısayolları da
    // tetiklenirdi.
    expect(matchCombo(event({ metaKey: true, key: "t", code: "KeyT" }), "Ctrl+T")).toBe(false);
  });

  it("Cmd+T tanımı Ctrl+T olayıyla eşleşmiyor", () => {
    expect(matchCombo(event({ ctrlKey: true, key: "t", code: "KeyT" }), "Cmd+T")).toBe(false);
  });

  it("fazladan Cmd reddediliyor", () => {
    expect(
      matchCombo(event({ ctrlKey: true, metaKey: true, key: "t", code: "KeyT" }), "Ctrl+T"),
    ).toBe(false);
  });

  it("Cmd+Shift ayrımı korunuyor", () => {
    const withShift = event({ metaKey: true, shiftKey: true, key: "P", code: "KeyP" });
    expect(matchCombo(withShift, "Cmd+Shift+P")).toBe(true);
    expect(matchCombo(withShift, "Cmd+P")).toBe(false);
  });

  it("Cmd ile noktalama fiziksel kodla eşleşiyor", () => {
    // Cmd+, ayarları açıyor; mac'te sistem geneli kural.
    expect(matchCombo(event({ metaKey: true, key: ",", code: "Comma" }), "Cmd+,")).toBe(true);
    expect(matchCombo(event({ metaKey: true, key: "+", code: "Equal" }), "Cmd+=")).toBe(true);
  });
});

describe("olaydan kısayol üretme", () => {
  it("Cmd olarak yazıyor", () => {
    // "Meta" kullanıcıya bir şey anlatmıyor ve settings.json taşınabilir olmalı.
    expect(comboFromEvent(event({ metaKey: true, key: "t" }))).toBe("Cmd+T");
  });

  it("birleşik yazımda sıra sabit", () => {
    expect(
      comboFromEvent(event({ ctrlKey: true, shiftKey: true, altKey: true, metaKey: true, key: "k" })),
    ).toBe("Ctrl+Shift+Alt+Cmd+K");
  });

  it("ürettiği metni kendisi geri okuyabiliyor", () => {
    // Ayarlarda basılan tuş metne çevrilip diske yazılıyor, sonra buradan geri
    // okunuyor. İki yön ayrışırsa kullanıcının atadığı kısayol hiç çalışmaz.
    const combo = comboFromEvent(event({ metaKey: true, shiftKey: true, key: "h" }))!;
    expect(matchCombo(event({ metaKey: true, shiftKey: true, key: "h", code: "KeyH" }), combo)).toBe(
      true,
    );
  });

  it("yalnızca değiştiriciye basmak kısayol üretmiyor", () => {
    expect(comboFromEvent(event({ metaKey: true, key: "Meta" }))).toBe(null);
  });
});

describe("kısayol yazımı", () => {
  it("mac'te simge, ayırıcısız ve HIG sırasında", () => {
    setPlatform("macos");
    // Apple'ın sırası: Control, Option, Shift, Command.
    expect(prettyCombo("Cmd+Shift+K")).toBe("⇧⌘K");
    expect(prettyCombo("Ctrl+Alt+Shift+Cmd+K")).toBe("⌃⌥⇧⌘K");
    expect(prettyCombo("Cmd+,")).toBe("⌘,");
  });

  it("mac'te özel tuşlar simgeye çevriliyor", () => {
    setPlatform("macos");
    expect(prettyCombo("Cmd+Enter")).toBe("⌘↩");
    expect(prettyCombo("Ctrl+Tab")).toBe("⌃⇥");
    expect(prettyCombo("Cmd+Backspace")).toBe("⌘⌫");
    // İleri silme: mac klavyesinde Fn+⌫, menülerde ⌦ diye yazılıyor.
    expect(prettyCombo("Shift+Delete")).toBe("⇧⌦");
  });

  it("Windows'ta metin yazımı sürüyor", () => {
    setPlatform("windows");
    expect(prettyCombo("Ctrl+Shift+H")).toBe("Ctrl+Shift+H");
    expect(prettyCombo("Ctrl+Tab")).toBe("Ctrl+Tab");
  });
});

/**
 * Rust tarafındaki varsayılan kısayollar.
 *
 * `model.rs` iki liste taşıyor (mac ve diğerleri). Buradaki testler o listeleri
 * kaynaktan okuyup ayrıştırıyor: elle tutulan iki liste birbirinden ayrışmaya
 * yatkın ve sonucu "kısayol çalışmıyor" oluyor.
 */
describe("varsayılan kısayollar", () => {
  // Satır sonları normalleştiriliyor: depo Windows'ta tutuluyor ve git
  // core.autocrlf CRLF yazabiliyor; desenin buna takılmaması gerekiyor.
  const rust = readFileSync(join(process.cwd(), "src-tauri/src/model.rs"), "utf8").replace(
    /\r\n/g,
    "\n",
  );

  function pairs(macos: boolean): Record<string, string> {
    const marker = macos
      ? /#\[cfg\(target_os = "macos"\)\]\s*\n\s*let pairs = \[/
      : /#\[cfg\(not\(target_os = "macos"\)\)\]\s*\n\s*let pairs = \[/;
    const found = marker.exec(rust);
    expect(found, `liste bulunamadı (macos=${macos})`).toBeTruthy();
    const start = found!.index + found![0].length;
    const body = rust.slice(start, rust.indexOf("];", start));
    const out: Record<string, string> = {};
    for (const m of body.matchAll(/\("(\w+)",\s*"([^"]+)"\)/g)) out[m[1]] = m[2];
    return out;
  }

  const mac = pairs(true);
  const win = pairs(false);

  it("iki liste okunabildi", () => {
    // Ayrıştırma boş dönerse aşağıdaki testler hiçbir şey doğrulamaz.
    expect(Object.keys(win).length).toBeGreaterThanOrEqual(20);
    expect(Object.keys(mac).length).toBeGreaterThanOrEqual(20);
  });

  it("iki listede aynı eylemler var", () => {
    // Bir eylem yalnızca bir listede olsa o platformda kısayolu hiç olmazdı.
    expect(Object.keys(mac).sort()).toEqual(Object.keys(win).sort());
  });

  it("her kısayol ayrıştırılabiliyor", () => {
    const bad: string[] = [];
    for (const [list, name] of [
      [win, "windows"],
      [mac, "macos"],
    ] as const) {
      for (const [action, combo] of Object.entries(list)) {
        if (!parseCombo(combo)) bad.push(`${name}/${action}: ${combo}`);
      }
    }
    expect(bad, `ayrıştırılamayan kısayol:\n${bad.join("\n")}`).toEqual([]);
  });

  it("aynı platformda iki eylem aynı tuşta değil", () => {
    for (const [list, name] of [
      [win, "windows"],
      [mac, "macos"],
    ] as const) {
      const seen = new Map<string, string>();
      const clashes: string[] = [];
      for (const [action, combo] of Object.entries(list)) {
        // Karşılaştırma ayrıştırılmış hâl üzerinden: "Cmd+T" ile "Meta+T" aynı
        // tuş ama metin olarak farklı.
        const p = parseCombo(combo)!;
        const id = `${p.ctrl}|${p.shift}|${p.alt}|${p.meta}|${p.key}`;
        const prev = seen.get(id);
        if (prev) clashes.push(`${name}: ${prev} ile ${action} aynı tuşta (${combo})`);
        seen.set(id, action);
      }
      expect(clashes, clashes.join("\n")).toEqual([]);
    }
  });

  it("mac'te ana değiştirici Cmd", () => {
    // Tab gezinmesi bilinçli istisna: Cmd+Tab işletim sistemine ait, webview'e
    // hiç ulaşmıyor.
    const tabActions = new Set(["nextTab", "prevTab"]);
    const wrong = Object.entries(mac)
      .filter(([action]) => !tabActions.has(action))
      .filter(([, combo]) => !parseCombo(combo)!.meta);
    expect(
      wrong.map(([a, c]) => `${a}: ${c}`),
      "mac'te Cmd kullanmayan kısayol",
    ).toEqual([]);
  });

  it("mac'te hiçbir kısayol Ctrl+<harf> değil", () => {
    // macOS'ta Ctrl kabuğun tuşu: Ctrl+C = SIGINT, Ctrl+D = EOF, Ctrl+R = ters
    // arama, Ctrl+A/E = satır başı/sonu. Arayüz kısayolunu oraya bağlamak
    // kabuğun tuşunu yer ve bu ancak komut çalışırken fark edilir.
    const bad: string[] = [];
    for (const [action, combo] of Object.entries(mac)) {
      const p = parseCombo(combo)!;
      if (p.ctrl && !p.meta && p.key.length === 1 && /[a-z]/.test(p.key)) {
        bad.push(`${action}: ${combo}`);
      }
    }
    expect(bad, `kabuğun tuşunu yiyen kısayol:\n${bad.join("\n")}`).toEqual([]);
  });

  it("Windows'ta ana değiştirici Ctrl", () => {
    const wrong = Object.entries(win).filter(([, combo]) => !parseCombo(combo)!.ctrl);
    expect(wrong.map(([a, c]) => `${a}: ${c}`)).toEqual([]);
  });

  it("Windows'ta hiçbir kısayol Cmd kullanmıyor", () => {
    // Cmd Windows'ta Win tuşu; işletim sistemi kısayollarıyla çakışır.
    const wrong = Object.entries(win).filter(([, combo]) => parseCombo(combo)!.meta);
    expect(wrong.map(([a, c]) => `${a}: ${c}`)).toEqual([]);
  });
});

/**
 * Ctrl+C kararının tek yerde kalması.
 *
 * Davranışsal test için `TerminalSession` kurmak gerekiyor (xterm + canvas);
 * hiçbir test bunu yapmıyor ve yalnızca bu iddia için o altyapıyı kurmak
 * orantısız. Bunun yerine kaçınmak istediğimiz DEĞİŞİKLİK bağlanıyor.
 *
 * Korunan senaryo: bir çağıran koşulu kendi içinde yeniden yazarsa (ayarı,
 * seçimi ya da platformu doğrudan okuyarak), mac dalı unutulur. O zaman
 * Ctrl+C `preventDefault` ile yutulur ama kopyalama da yapılmaz — SIGINT
 * kabuğa hiç ulaşmaz ve çalışan komut durdurulamaz. Sessiz ve teşhisi zor.
 *
 * ÖLÇÜLEN: tam bu oldu. Komut kutusu kendi Ctrl+C koşulunu yazdı (`!isMac()`
 * dahil) ve bu test onu görmedi — yalnızca `App.tsx`i okuyordu. Kural bu
 * yüzden saf bir işleve taşındı (`resolveCtrlC`, `lib/inputMode.ts`); artık
 * ÜÇ çağıran da (App, oturum, kutu) buraya bağlı.
 */
describe("Ctrl+C kararı", () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
  const app = read("src/App.tsx");
  const box = read("src/components/CommandInput.tsx");
  const session = read("src/terminal/TerminalSession.ts");
  const lib = read("src/lib/inputMode.ts");

  it("App.tsx kararı oturuma soruyor", () => {
    expect(app, "App.tsx senkron karar için oturumu çağırmıyor").toContain(
      "session.wantsCtrlCCopy()",
    );
  });

  it("komut kutusu kararı oturuma soruyor", () => {
    expect(box, "kutu Ctrl+C kararı için oturumu çağırmıyor").toContain("ctrlCAction(");
  });

  it("çağıranlar koşulu kendi içinde yeniden yazmıyor", () => {
    for (const [name, text] of [
      ["App.tsx", app],
      ["CommandInput.tsx", box],
    ] as const) {
      expect(text, `${name}: ayar doğrudan okunuyor — kural bölünmüş`).not.toContain(
        "ctrlCCopiesSelection",
      );
    }
    // Platform yalnızca KUTU için bağlanıyor: `App.tsx` `isMac()`i başka
    // kararlar için de meşru kullanıyor (Cmd+C'nin durdurma anlamı, sekme
    // değiştiricisi). Kutunun ise Ctrl+C dışında platforma bakacağı bir şey
    // yok — orada `isMac()` görünmesi kuralın ikinci kez yazıldığı demek.
    expect(box, "CommandInput.tsx: platform kararı yerelde yazılmış").not.toContain("isMac()");
  });

  it("oturum kuralı saf işleve devrediyor", () => {
    const at = session.indexOf("ctrlCAction(boxSelection: boolean)");
    expect(at, "ctrlCAction tanımı bulunamadı").toBeGreaterThan(-1);
    expect(session.slice(at, at + 400), "oturum resolveCtrlC çağırmıyor").toContain(
      "resolveCtrlC(",
    );
  });

  it("kural mac'te kopyalamayı devre dışı bırakıyor", () => {
    const at = lib.indexOf("export function resolveCtrlC(");
    expect(at, "resolveCtrlC tanımı bulunamadı").toBeGreaterThan(-1);
    const body = lib.slice(at, at + 300);
    expect(body, "mac dalı yok").toMatch(/signals\.mac\)\s*return "sigint"/);
  });
});
