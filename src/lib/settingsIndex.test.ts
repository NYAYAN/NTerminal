import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_LANG, setLanguage, t } from "./i18n";
import { setPlatform } from "./platform";
import { MESSAGES } from "./messages";
import {
  SECTIONS,
  SETTINGS_INDEX,
  fold,
  searchSettings,
  settingLabel,
  softened,
  type Section,
} from "./settingsIndex";

/**
 * Ayar arama indeksi.
 *
 * İndeks elle tutulan bir liste; elle tutulan listeler sürükleniyor. Buradaki
 * ilk test onu kaynakla karşılaştırıyor: arayüzdeki her ayar satırı
 * `data-setting="<anahtar>"` taşıyor ve o anahtarların kümesi indeksle birebir
 * aynı olmalı. Yeni bir ayar eklenip indekse yazılmazsa arama onu bulamaz —
 * ve bu ancak elle deneyerek görülür.
 */
const SOURCE = readFileSync(
  join(process.cwd(), "src/components/SettingsDialog.tsx"),
  "utf8",
);

/** Kaynakta `data-setting` taşıyan satırların anahtarları, bölüm bölüm. */
function keysFromSource(): Map<Section, Set<string>> {
  const out = new Map<Section, Set<string>>();
  // Bölüm blokları `{section === "x" && (` ile başlıyor; sıradaki bloğa kadar
  // olan aralık o bölüme ait.
  const guards = [...SOURCE.matchAll(/\{section === "(\w+)" && \(/g)];
  for (let i = 0; i < guards.length; i++) {
    const section = guards[i][1] as Section;
    const start = guards[i].index!;
    const end = i + 1 < guards.length ? guards[i + 1].index! : SOURCE.length;
    const region = SOURCE.slice(start, end);
    const keys = new Set(
      [...region.matchAll(/data-setting="([^"]+)"/g)].map((m) => m[1]),
    );
    out.set(section, keys);
  }
  return out;
}

afterEach(() => setLanguage(DEFAULT_LANG));

describe("indeks bütünlüğü", () => {
  const fromSource = keysFromSource();

  it("her anahtar sözlükte var", () => {
    const missing = SETTINGS_INDEX.flatMap((e) =>
      [e.key, e.hint].filter((k): k is NonNullable<typeof k> => !!k),
    ).filter((k) => !(k in MESSAGES));
    expect(missing, `sözlükte olmayan anahtar: ${missing.join(", ")}`).toEqual([]);
  });

  it("her bölüm kimliği tanımlı", () => {
    const known = new Set(SECTIONS.map((s) => s.id));
    const bad = SETTINGS_INDEX.filter((e) => !known.has(e.section)).map((e) => e.section);
    expect(bad).toEqual([]);
  });

  it("yinelenen girdi yok", () => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const e of SETTINGS_INDEX) {
      const id = `${e.section}:${e.key}`;
      if (seen.has(id)) dupes.push(id);
      seen.add(id);
    }
    expect(dupes).toEqual([]);
  });

  it("kaynakta data-setting taşıyan bölümler bulundu", () => {
    // Tarama boş dönerse aşağıdaki karşılaştırma hiçbir şey doğrulamaz.
    const tagged = [...fromSource.entries()].filter(([, keys]) => keys.size > 0);
    expect(tagged.length, "hiçbir bölümde data-setting bulunamadı").toBeGreaterThanOrEqual(5);
  });

  it("işaretli bölümlerde indeks kaynakla birebir", () => {
    const problems: string[] = [];
    for (const [section, keys] of fromSource) {
      if (keys.size === 0) continue; // iki panelli bölümler işaretlenmiyor
      const indexed = new Set(
        SETTINGS_INDEX.filter((e) => e.section === section).map((e) => e.key as string),
      );
      for (const key of keys) {
        if (!indexed.has(key)) problems.push(`${section}: "${key}" arayüzde var, indekste yok`);
      }
      for (const key of indexed) {
        if (!keys.has(key)) problems.push(`${section}: "${key}" indekste var, arayüzde yok`);
      }
    }
    expect(problems, problems.join("\n")).toEqual([]);
  });
});

describe("metin sadeleştirme", () => {
  it("Türkçe harfleri sadeleştiriyor", () => {
    // Kullanıcı "gorunum" yazarken aksanlı harfe basmak zorunda kalmamalı.
    expect(fold("Görünüm")).toBe("gorunum");
    expect(fold("İmleç")).toBe("imlec");
    expect(fold("Kısayollar")).toBe("kisayollar");
    expect(fold("Bağlantılar")).toBe("baglantilar");
    expect(fold("Şeçim")).toBe("secim");
  });

  it("büyük I ve İ doğru küçültülüyor", () => {
    // Türkçe kuralı: I -> ı (sonra i'ye sadeleşiyor), İ -> i.
    expect(fold("IŞIK")).toBe("isik");
    expect(fold("İLK")).toBe("ilk");
  });
});

describe("ayar arama", () => {
  it("boş sorgu sonuç vermiyor", () => {
    expect(searchSettings("", t)).toEqual([]);
    expect(searchSettings("   ", t)).toEqual([]);
  });

  it("etiketle buluyor", () => {
    const hits = searchSettings("tema", t);
    expect(hits.map((h) => h.key)).toContain("settings.colorTheme");
  });

  it("aksansız yazım da buluyor", () => {
    const hits = searchSettings("gorunum", t);
    expect(hits.length, "aksansız arama sonuç vermedi").toBeGreaterThan(0);
  });

  it("bölüm adıyla da buluyor", () => {
    // "geçmiş" yazan kullanıcı o bölümün ayarlarını görmeli.
    const hits = searchSettings("geçmiş", t);
    expect(hits.some((h) => h.section === "history")).toBe(true);
  });

  it("açıklamada geçen kelimeyi buluyor", () => {
    // Kullanıcı ayarın adını değil ne yaptığını biliyor: "PSReadLine" yalnızca
    // açıklamada geçiyor.
    const hits = searchSettings("PSReadLine", t);
    expect(hits.map((h) => h.key)).toContain("settings.predictionShell");
  });

  it("etiket eşleşmesi açıklama eşleşmesinden önce", () => {
    // Adını yazdığınız ayar en üstte olmalı.
    const hits = searchSettings("bağlantı", t);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].key).toBe("settings.highlightLinks");
  });

  it("eşleşmeyen sorgu boş dönüyor", () => {
    expect(searchSettings("kubernetes", t)).toEqual([]);
  });

  it("sonuçlar bölüm adını taşıyor", () => {
    const [hit] = searchSettings("tema", t);
    expect(hit.sectionLabel).toBe("Görünüm");
  });

  it("İngilizcede İngilizce etiketlerle arıyor", () => {
    setLanguage("en");
    expect(searchSettings("theme", t).map((h) => h.key)).toContain("settings.colorTheme");
    // Türkçe etiket artık eşleşmemeli: arama görünen metne göre çalışıyor.
    expect(searchSettings("renk teması", t)).toEqual([]);
  });
});

describe("platforma bağlı ayarlar", () => {
  afterEach(() => setPlatform("windows"));

  it("mac'e özgü ayar Windows'ta aramada çıkmıyor", () => {
    // Arayüzde `isMac()` koşuluyla çiziliyor. Windows'ta arama sonucunda
    // görünürse tıklayan kullanıcı hiçbir yere gitmiyor — sonuç var, satır yok.
    setPlatform("windows");
    const hits = searchSettings("option", t);
    expect(hits.map((h) => h.key)).not.toContain("settings.macOptionIsMeta");
  });

  it("mac'te o ayar aramada çıkıyor", () => {
    setPlatform("macos");
    const hits = searchSettings("option", t);
    expect(hits.map((h) => h.key)).toContain("settings.macOptionIsMeta");
  });

  it("mac'te açıklama araması mac metnine göre", () => {
    // Ekranda hangi ipucu duruyorsa onda aranmalı.
    //
    // "PSReadLine" ayırt edici DEĞİL: pwsh mac'te de kurulabiliyor ve orada da
    // PSReadLine kullanıyor, iki metinde de geçiyor. Ayırt edici olan, yalnızca
    // o platformda anlamı olan ifadeler.
    setPlatform("macos");
    expect(
      searchSettings("zsh-autosuggestions", t).map((h) => h.key),
      "mac ipucundaki ifade bulunamadı",
    ).toContain("settings.predictionShell");
    expect(
      searchSettings("Windows PowerShell", t).map((h) => h.key),
      "mac'te ekranda olmayan ifade eşleşti",
    ).not.toContain("settings.predictionShell");
  });

  it("Windows'ta açıklama araması Windows metnine göre", () => {
    setPlatform("windows");
    expect(searchSettings("Windows PowerShell", t).map((h) => h.key)).toContain(
      "settings.predictionShell",
    );
    expect(
      searchSettings("zsh-autosuggestions", t).map((h) => h.key),
      "Windows'ta ekranda olmayan ifade eşleşti",
    ).not.toContain("settings.predictionShell");
  });

  it("Windows'a özgü ayar mac'te aramada çıkmıyor", () => {
    // Ctrl+C kopyalama mac'te işlevsiz: kopyalama orada Cmd+C.
    setPlatform("macos");
    expect(searchSettings("Ctrl+C", t).map((h) => h.key)).not.toContain("settings.ctrlCCopies");
    setPlatform("windows");
    expect(searchSettings("Ctrl+C", t).map((h) => h.key)).toContain("settings.ctrlCCopies");
  });

  it("platforma bağlı ayarların hepsi arayüzde koşullu çiziliyor", () => {
    // İndekste platform kısıtı yazıp arayüzde koşulsuz çizmek tersi hataya yol
    // açar: kullanıcı işe yaramayan bir onay kutusu görür.
    const source = readFileSync(
      join(process.cwd(), "src/components/SettingsDialog.tsx"),
      "utf8",
    );
    const gated = SETTINGS_INDEX.filter((e) => e.only);
    // Tarama boş dönerse bu test hiçbir şey doğrulamaz.
    expect(gated.length, "platforma bağlı ayar bulunamadı").toBeGreaterThan(0);
    for (const entry of gated) {
      const at = source.indexOf(`data-setting="${entry.key}"`);
      expect(at, `${entry.key} arayüzde yok`).toBeGreaterThan(-1);
      // Satırdan geriye doğru bakıp isMac() koşulu arıyoruz.
      const before = source.slice(Math.max(0, at - 900), at);
      expect(before, `${entry.key} isMac() koşulu olmadan çiziliyor`).toContain("isMac()");
    }
  });
});

/**
 * Başlık bağlamı.
 *
 * Terminal ve arayüz yazı tipinin ikisinde de "Yazı tipi ailesi" / "Boyut"
 * var; hangisi olduğunu başlık söylüyor. Sonuç listesi başlığı göstermeseydi
 * iki "Boyut" ayırt edilemezdi. İndeksteki başlık elle yazılıyor — kaynakla
 * karşılaştırılıyor ki satır başka bir başlığın altına taşınınca sürüklenmesin.
 */
describe("başlık bağlamı", () => {
  it("işaretli her ayarın başlığı kaynaktaki başlığıyla aynı", () => {
    const problems: string[] = [];
    for (const entry of SETTINGS_INDEX) {
      const at = SOURCE.indexOf(`data-setting="${entry.key}"`);
      if (at === -1) continue; // iki panelli bölümler işaretlenmiyor
      const before = SOURCE.slice(0, at);
      const headings = [...before.matchAll(/<h3>\{t\("([^"]+)"\)\}<\/h3>/g)];
      const heading = headings.at(-1)?.[1];
      if (entry.group !== heading) {
        problems.push(`${entry.key}: indekste "${entry.group}", kaynakta "${heading}"`);
      }
    }
    expect(problems, problems.join("\n")).toEqual([]);
  });

  it("aynı etiketli iki ayar başlıklarıyla ayrışıyor", () => {
    const sizes = searchSettings("boyut", t).filter((h) => h.label === "Boyut");
    expect(sizes.map((h) => h.groupLabel).sort()).toEqual(["Arayüz yazı tipi", "Terminal yazı tipi"]);
  });

  it("başlıkla da buluyor", () => {
    // "Arayüz" artık etiketlerde değil başlıkta: iki ayar yine bulunmalı.
    const keys = searchSettings("arayüz", t).map((h) => h.key);
    expect(keys).toContain("settings.uiFontFamily");
    expect(keys).toContain("settings.uiFontSize");
  });
});

/**
 * Sonuç etiketi yer tutucusuz.
 *
 * ÖLÇÜLEN: "boyut" araması "Boyut ({n} px)" ve "Arayüz boyutu ({n} px)"
 * gösteriyordu: etiket ekranda değerle dolduruluyor, aramada değer yok.
 */
describe("sonuç etiketi", () => {
  it("yer tutuculu parantez düşüyor", () => {
    expect(settingLabel("Boyut ({n} px)")).toBe("Boyut");
    expect(settingLabel("Satır yüksekliği ({n})")).toBe("Satır yüksekliği");
    expect(settingLabel("Renk teması")).toBe("Renk teması");
  });

  it("hiçbir sonuçta çiğ yer tutucu yok", () => {
    for (const lang of ["tr", "en"] as const) {
      setLanguage(lang);
      for (const entry of SETTINGS_INDEX) {
        for (const hit of searchSettings(fold(t(entry.key)).slice(0, 4), t)) {
          expect(hit.label, `${lang} ${hit.key}`).not.toMatch(/\{\w+\}/);
        }
      }
    }
  });
});

/**
 * Türkçe ünsüz yumuşaması.
 *
 * ÖLÇÜLEN: "aralık" araması "Harf aralığı"nı bulmuyordu — k ek alınca ğ
 * oluyor ve sadeleştirilmiş hâlleri ayrışıyor (aralik / araligi).
 */
describe("ünsüz yumuşaması", () => {
  it("aralık → Harf aralığı", () => {
    expect(searchSettings("aralık", t).map((h) => h.key)).toContain(
      "settings.letterSpacingLabel",
    );
  });

  it("yalnızca harfle biten uzun sözcükte", () => {
    expect(softened("aralik")).toBe("arali");
    expect(softened("renk")).toBe("ren");
    // Kısa sözcük her şeyi eşlerdi; "Ctrl+C" sözcük değil.
    expect(softened("ip")).toBe(null);
    expect(softened("ctrl+c")).toBe(null);
    expect(softened("tema")).toBe(null);
  });
});
