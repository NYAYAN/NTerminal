import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_LANG,
  getLanguage,
  localeTag,
  normalizeLang,
  setLanguage,
  t,
  tp,
  tSplit,
} from "./i18n";
import { MESSAGES, type MsgKey } from "./messages";

afterEach(() => {
  setLanguage(DEFAULT_LANG);
});

const KEYS = Object.keys(MESSAGES) as MsgKey[];

describe("sözlük eksiksizliği", () => {
  it("her metnin iki dili var ve ikisi de boş değil", () => {
    // Tek dilli bir girdi arayüzde boş bir düğme olarak çıkar; testin varlığı
    // `as const satisfies` ile yakalanamayan boş dizeyi de kapsıyor.
    const bad: string[] = [];
    for (const key of KEYS) {
      const entry = MESSAGES[key] as readonly string[];
      if (entry.length !== 2) bad.push(`${key}: ${entry.length} dil`);
      else if (!entry[0].trim() || !entry[1].trim()) bad.push(`${key}: boş çeviri`);
    }
    expect(bad, `eksik çeviri:\n${bad.join("\n")}`).toEqual([]);
  });

  it("çoğul anahtarları çift geliyor", () => {
    // `tp()` `.one`/`.other` ikilisine dayanıyor; biri eksikse `t()` tanımsız
    // girdiye düşer ve çalışma anında çöker.
    const ones = KEYS.filter((k) => k.endsWith(".one")).map((k) => k.slice(0, -4));
    const others = KEYS.filter((k) => k.endsWith(".other")).map((k) => k.slice(0, -6));
    expect([...ones].sort()).toEqual([...others].sort());
    expect(ones.length, "hiç çoğul anahtar yok — çoğul desteği kullanılmıyor mu?").toBeGreaterThan(0);
  });

  it("yer tutucular iki dilde aynı", () => {
    // İngilizcede `{n}` yazıp Türkçede unutmak, kullanıcıya sayı göstermeyen
    // bir cümle bırakıyor. Aynı ada sahip yer tutucular her iki dilde de olmalı.
    const names = (text: string) =>
      [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    const bad: string[] = [];
    for (const key of KEYS) {
      const [tr, en] = MESSAGES[key];
      const a = names(tr);
      const b = names(en);
      // Yinelenenleri yok say: aynı yer tutucu iki kez geçebilir.
      const uniq = (x: string[]) => [...new Set(x)].sort();
      if (uniq(a).join(",") !== uniq(b).join(",")) {
        bad.push(`${key}: tr[${uniq(a)}] en[${uniq(b)}]`);
      }
    }
    expect(bad, `yer tutucu uyuşmazlığı:\n${bad.join("\n")}`).toEqual([]);
  });
});

describe("çeviri", () => {
  it("dil değişince metin değişir", () => {
    expect(getLanguage()).toBe("tr");
    expect(t("common.close")).toBe("Kapat");
    setLanguage("en");
    expect(t("common.close")).toBe("Close");
  });

  it("bilinmeyen dil Türkçeye düşer", () => {
    // Diskteki settings.json başka bir sürümden gelmiş olabilir.
    expect(normalizeLang("de")).toBe("tr");
    expect(normalizeLang(null)).toBe("tr");
    expect(normalizeLang(undefined)).toBe("tr");
    expect(normalizeLang("en")).toBe("en");
    setLanguage("klingon");
    expect(getLanguage()).toBe("tr");
  });

  it("yer tutucu doldurulur", () => {
    expect(t("view.shortcut", { keys: "Ctrl+Shift+E" })).toBe("Kısayol: Ctrl+Shift+E");
  });

  it("eksik parametre yer tutucuyu bozmadan bırakır", () => {
    // "undefined" yazmak hatayı gizler; yer tutucunun kalması gösterir.
    expect(t("view.shortcut")).toBe("Kısayol: {keys}");
    expect(t("view.shortcut", {})).toBe("Kısayol: {keys}");
  });

  it("sıfır değeri yer tutucuya yazılır", () => {
    // `0` yanlışlıkla "boş" sayılıp atlanmamalı.
    expect(t("group.showAll", { n: 0 })).toBe("Tüm grupları göster (0)");
  });

  it("Intl etiketi dille birlikte değişir", () => {
    expect(localeTag("tr")).toBe("tr-TR");
    expect(localeTag("en")).toBe("en-US");
  });
});

describe("çoğul", () => {
  it("Türkçede sayıdan sonra isim tekil kalır", () => {
    expect(tp("status.tabs", 1)).toBe("1 sekme");
    expect(tp("status.tabs", 5)).toBe("5 sekme");
  });

  it("İngilizcede tekil ve çoğul ayrışır", () => {
    setLanguage("en");
    expect(tp("status.tabs", 1)).toBe("1 tab");
    expect(tp("status.tabs", 5)).toBe("5 tabs");
    expect(tp("status.tabs", 0)).toBe("0 tabs");
  });

  it("biçimlendirilmiş sayı geçirilebilir", () => {
    // Durum çubuğu binlik ayırıcılı sayı gösteriyor; çoğul kararı ham sayıya,
    // yazılan değer biçimlenmiş metne göre olmalı.
    expect(tp("status.commands", 12345, { n: "12.345" })).toBe("12.345 komut");
  });
});

describe("metni ikiye bölme", () => {
  it("yer tutucudan böler", () => {
    const [before, after] = tSplit("term.openHint", "keys");
    expect(before).toBe("");
    expect(after).toBe(" ile yeni sekme açın.");
  });

  it("İngilizcede parçalar yer değiştirir", () => {
    // Cümle yapısı dile göre değişiyor: bu yüzden parçalar sabitlenmiyor.
    setLanguage("en");
    const [before, after] = tSplit("term.openHint", "keys");
    expect(before).toBe("Press ");
    expect(after).toBe(" to open a new tab.");
  });

  it("yer tutucu yoksa tamamı ilk parçada kalır", () => {
    const [before, after] = tSplit("common.close", "keys");
    expect(before).toBe("Kapat");
    expect(after).toBe("");
  });
});
