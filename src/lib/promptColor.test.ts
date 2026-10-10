// @vitest-environment jsdom
import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { Terminal } from "@xterm/xterm";
import { describe, expect, it } from "vitest";

/**
 * Renkli varsayılan istem: gerçek zsh'in ürettiği BAYTLAR xterm'de doğru
 * hücre niteliklerine dönüşüyor mu?
 *
 * `shellIntegration.test.ts` kaçış dizilerinin varlığına bakıyor; bu test
 * onları GERÇEK bir xterm'e yazıp hücreleri okuyor (çizim gerektirmiyor, yalnızca
 * ayrıştırma): kimlik ve dizin renkli ve kalın, iki renk birbirinden farklı,
 * istem işareti varsayılan renge dönmüş. Renklerin GERÇEK tonu temadan geliyor
 * (palet indeksleri: 2 = yeşil, 4 = mavi); burada yalnızca "palet rengi mi,
 * varsayılan mı" bağlanıyor.
 */
const DIR = join(process.cwd(), "src-tauri/shell-integration");
const win = process.platform === "win32";

/**
 * zsh'e varsayılan istemi verip betiği kaynak eder; GENİŞLETİLMİŞ istemi döndürür.
 * `ek`: kullanıcının seçtiği renkler gibi betiğe giden ortam değişkenleri.
 */
function genisletilmisIstem(ek: Record<string, string> = {}): string {
  const r = spawnSync(
    "zsh",
    ["-f", "-c", `PS1="%n@%m %1~ %# "; source ${JSON.stringify(join(DIR, "nterminal.zsh"))}; print -rnP -- "<<S>>$PS1<</S>>"`],
    { env: { PATH: "/usr/bin:/bin", HOME: "/tmp", TERM: "xterm-256color", ...ek }, encoding: "utf8", timeout: 15000 },
  );
  return /<<S>>([\s\S]*?)<<\/S>>/.exec(r.stdout ?? "")?.[1] ?? "";
}

describe("renkli istem — xterm hücre nitelikleri", () => {
  it.skipIf(win)("kimlik ve dizin palet renginde + kalın, işaret varsayılan renkte", async () => {
    const istem = genisletilmisIstem();
    expect(istem, "zsh istem üretmedi").not.toBe("");

    const term = new Terminal({ cols: 120, rows: 5, allowProposedApi: true });
    await new Promise<void>((resolve) => term.write(istem, resolve));

    const line = term.buffer.active.getLine(0)!;
    const text = line.translateToString(true);
    // "kullanıcı@makine dizin % "
    const at = text.indexOf("@");
    const bosluk = text.indexOf(" ");
    expect(at, text).toBeGreaterThan(0);
    expect(bosluk, text).toBeGreaterThan(at);

    const cell = (x: number) => line.getCell(x)!;
    const kimlik = cell(0);
    const dizin = cell(bosluk + 1);
    const isaret = cell(text.trimEnd().length - 1);

    expect(kimlik.isFgPalette(), "kimlik palet renginde değil").toBe(true);
    expect(kimlik.getFgColor(), "kimlik yeşil (2) değil").toBe(2);
    expect(kimlik.isBold(), "kimlik kalın değil").toBeTruthy();

    expect(dizin.isFgPalette(), "dizin palet renginde değil").toBe(true);
    expect(dizin.getFgColor(), "dizin mavi (4) değil").toBe(4);
    expect(dizin.isBold()).toBeTruthy();
    expect(dizin.getFgColor(), "kimlik ve dizin aynı renkte").not.toBe(kimlik.getFgColor());

    // Renk sızmamalı: işaret ve sonrası varsayılan renk, kalın değil.
    expect(isaret.getChars()).toBe("%");
    expect(isaret.isFgDefault(), "renk istem işaretine sızdı").toBe(true);
    expect(isaret.isBold(), "kalın istem işaretine sızdı").toBeFalsy();
    term.dispose();
  });

  it.skipIf(win)("iki alan arasındaki boşluk ve @ kimlikle aynı renkte (bölünmüş renk yok)", async () => {
    const term = new Terminal({ cols: 120, rows: 5, allowProposedApi: true });
    await new Promise<void>((resolve) => term.write(genisletilmisIstem(), resolve));
    const line = term.buffer.active.getLine(0)!;
    const text = line.translateToString(true);
    const at = text.indexOf("@");
    // kullanici@makine tek bir renk bloğu: '@' ve son harf de yeşil.
    expect(line.getCell(at)!.getFgColor()).toBe(2);
    expect(line.getCell(text.indexOf(" ") - 1)!.getFgColor()).toBe(2);
    term.dispose();
  });
});

/**
 * Kullanıcının Ayarlar'dan seçtiği renkler (`R;G;B`): kabuk bunu ham truecolor
 * SGR olarak yazıyor. Palet rengi yerine gerçekten RGB hücre olarak çıkmalı,
 * kalın kalmalı ve son metne sızmamalı.
 */
describe("renkli istem — kullanıcının seçtiği renkler", () => {
  it.skipIf(win)("kimlik ve dizin seçilen RGB renkte + kalın, işaret varsayılan renkte", async () => {
    const istem = genisletilmisIstem({
      NTERMINAL_PROMPT_USER_RGB: "255;140;0",
      NTERMINAL_PROMPT_DIR_RGB: "0;170;255",
    });
    expect(istem, "zsh istem üretmedi").not.toBe("");

    const term = new Terminal({ cols: 120, rows: 5, allowProposedApi: true });
    await new Promise<void>((resolve) => term.write(istem, resolve));
    const line = term.buffer.active.getLine(0)!;
    const text = line.translateToString(true);
    const bosluk = text.indexOf(" ");
    const cell = (x: number) => line.getCell(x)!;

    const kimlik = cell(0);
    expect(kimlik.isFgRGB(), "kimlik RGB renkte değil").toBe(true);
    expect(kimlik.getFgColor(), "kimlik seçilen turuncu değil").toBe(0xff8c00);
    expect(kimlik.isBold(), "kimlik kalın değil").toBeTruthy();
    // kullanici@makine tek bir renk bloğu.
    expect(cell(text.indexOf("@")).getFgColor()).toBe(0xff8c00);
    expect(cell(bosluk - 1).getFgColor()).toBe(0xff8c00);

    const dizin = cell(bosluk + 1);
    expect(dizin.isFgRGB(), "dizin RGB renkte değil").toBe(true);
    expect(dizin.getFgColor(), "dizin seçilen mavi değil").toBe(0x00aaff);
    expect(dizin.isBold()).toBeTruthy();

    // Renk sızmamalı.
    const isaret = cell(text.trimEnd().length - 1);
    expect(isaret.getChars()).toBe("%");
    expect(isaret.isFgDefault(), "seçilen renk istem işaretine sızdı").toBe(true);
    expect(isaret.isBold(), "kalın istem işaretine sızdı").toBeFalsy();
    term.dispose();
  });

  it.skipIf(win)("yalnız kimlik seçilince dizin palet mavisinde kalıyor", async () => {
    const term = new Terminal({ cols: 120, rows: 5, allowProposedApi: true });
    await new Promise<void>((resolve) =>
      term.write(genisletilmisIstem({ NTERMINAL_PROMPT_USER_RGB: "255;140;0" }), resolve),
    );
    const line = term.buffer.active.getLine(0)!;
    const text = line.translateToString(true);
    const dizin = line.getCell(text.indexOf(" ") + 1)!;
    expect(line.getCell(0)!.getFgColor()).toBe(0xff8c00);
    expect(dizin.isFgPalette(), "dizin palet rengini kaybetti").toBe(true);
    expect(dizin.getFgColor()).toBe(4);
    term.dispose();
  });

  it.skipIf(win)("bozuk değer palet yeşiline düşüyor", async () => {
    const term = new Terminal({ cols: 120, rows: 5, allowProposedApi: true });
    await new Promise<void>((resolve) =>
      term.write(genisletilmisIstem({ NTERMINAL_PROMPT_USER_RGB: "1;2;3;4" }), resolve),
    );
    const kimlik = term.buffer.active.getLine(0)!.getCell(0)!;
    expect(kimlik.isFgPalette()).toBe(true);
    expect(kimlik.getFgColor()).toBe(2);
    term.dispose();
  });
});
