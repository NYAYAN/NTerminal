import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  ACTION_GROUPS,
  canonicalCombo,
  comboConflicts,
  comboFromEvent,
  groupBindings,
  matchCombo,
  parseCombo,
  prettyCombo,
} from "./keys";
import { setPlatform } from "./platform";

/**
 * Ayarlar › Kısayollar: tuş kaydı, çakışma ve gruplama.
 */

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

afterEach(() => setPlatform("windows"));

/**
 * "+" tuşu.
 *
 * ÖLÇÜLEN: ⌘⇧= basılınca kısayol "Shift+Cmd++" olarak saklandı; "+" metnin
 * AYIRICISI olduğu için `parseCombo` onu bölünce tuş kalmadı, `null` döndü ve
 * yakınlaştırma kısayolu tümden öldü. Karakter yerine fiziksel tuş saklanıyor.
 */
describe("+ tuşunun kaydı", () => {
  const durumlar = [
    // ABD düzeni: + = Shift ile "=" tuşu.
    { ad: "ABD Shift+=", init: { key: "+", code: "Equal", shiftKey: true, metaKey: true } },
    // Türkçe Q: + = Shift ile "4" tuşu.
    { ad: "Türkçe Q Shift+4", init: { key: "+", code: "Digit4", shiftKey: true, metaKey: true } },
    // Sayısal tuş takımı.
    { ad: "sayısal +", init: { key: "+", code: "NumpadAdd", ctrlKey: true } },
  ];

  for (const { ad, init } of durumlar) {
    it(`${ad}: okunabilir bir kısayol olarak saklanıyor ve eşleşiyor`, () => {
      const pressed = event(init);
      const combo = comboFromEvent(pressed)!;
      expect(parseCombo(combo), `${combo} okunamıyor`).not.toBe(null);
      expect(matchCombo(pressed, combo), `${combo} kendi tuşuyla eşleşmiyor`).toBe(true);
    });
  }

  it("ayırıcı hiçbir zaman tuş olarak yazılmıyor", () => {
    const combo = comboFromEvent(event({ key: "+", code: "Equal", shiftKey: true, metaKey: true }));
    expect(combo).toBe("Shift+Cmd+=");
    expect(combo!.endsWith("++")).toBe(false);
  });

  it("mac'te sembolle gösteriliyor, çiğ metinle değil", () => {
    setPlatform("macos");
    expect(prettyCombo("Shift+Cmd+=")).toBe("⇧⌘=");
    expect(prettyCombo("Cmd+NumpadAdd")).toBe("⌘Num +");
  });

  it("başka tuşa basınca eşleşmiyor", () => {
    expect(matchCombo(event({ key: "=", code: "Equal", metaKey: true }), "Shift+Cmd+=")).toBe(false);
    expect(matchCombo(event({ key: "4", code: "Digit4", metaKey: true }), "Shift+Cmd+4")).toBe(false);
  });
});

/**
 * Çakışma.
 *
 * Aynı tuş iki eyleme atanınca genel dinleyici ilk eşleşeni çalıştırıyor;
 * öteki eylem kısayoldan sessizce erişilemez oluyordu. Ayarlar iki satırı
 * da uyarıyor.
 */
describe("kısayol çakışması", () => {
  it("aynı tuşu taşıyan iki eylem birbirini görüyor", () => {
    const conflicts = comboConflicts({ newTab: "Cmd+T", clearTerminal: "cmd+t", copy: "Cmd+C" });
    expect(conflicts.get("newTab")).toEqual(["clearTerminal"]);
    expect(conflicts.get("clearTerminal")).toEqual(["newTab"]);
    expect(conflicts.has("copy")).toBe(false);
  });

  it("değiştirici sırası ve yazımı fark etmiyor", () => {
    expect(canonicalCombo("Ctrl+Shift+T")).toBe(canonicalCombo("shift+control+t"));
    expect(canonicalCombo("Cmd+=")).not.toBe(canonicalCombo("Shift+Cmd+="));
  });

  it("okunamayan kısayol çakışma sayılmıyor", () => {
    expect(comboConflicts({ a: "", b: "" }).size).toBe(0);
  });
});

/**
 * Gruplama.
 *
 * Önceki liste Rust'ın `BTreeMap`inden gelen, eylem KİMLİĞİNE göre alfabetik
 * sıraydı (`clearTerminal`, `closeTab`, `commandPalette`, `copy`…) — kullanıcı
 * için rastgele.
 */
describe("kısayol grupları", () => {
  it("varsayılan her eylem bir grupta", () => {
    // Rust'a yeni bir kısayol eklenip burada gruplanmazsa "Diğer"e düşer:
    // çalışır ama yanlış yerde durur. Liste kaynaktan okunuyor.
    const rust = readFileSync(join(process.cwd(), "src-tauri/src/model.rs"), "utf8");
    const block = rust.slice(rust.indexOf("fn default_keybindings"));
    const actions = new Set([...block.matchAll(/\("(\w+)",\s*"[^"]+"\)/g)].map((m) => m[1]));
    expect(actions.size, "Rust kısayol listesi okunamadı").toBeGreaterThan(15);
    const grouped = new Set(ACTION_GROUPS.flatMap((g) => g.actions));
    const missing = [...actions].filter((a) => !grouped.has(a));
    expect(missing, `gruplanmamış eylem: ${missing.join(", ")}`).toEqual([]);
  });

  it("bir eylem tek grupta", () => {
    const all = ACTION_GROUPS.flatMap((g) => g.actions);
    expect(new Set(all).size).toBe(all.length);
  });

  it("bilinmeyen eylem en sonda 'Diğer' altında, boş grup yok", () => {
    const groups = groupBindings({ newTab: "Cmd+T", eskiEylem: "Cmd+J" });
    expect(groups.map((g) => g.key)).toEqual(["keys.groupTabs", "keys.groupOther"]);
    expect(groups[1].actions).toEqual(["eskiEylem"]);
  });
});
