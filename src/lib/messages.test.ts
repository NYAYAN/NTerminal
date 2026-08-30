import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { MESSAGES, type MsgKey } from "./messages";

/**
 * Sözlük hijyeni.
 *
 * İki yönlü bir tehlike var:
 *  - **Kullanılmayan anahtar** — kaldırılan bir metnin çevirisi dosyada kalıyor.
 *    Tek başına zararsız görünüyor ama zamanla sözlük gerçeği yansıtmayı
 *    bırakıyor: iki dili güncellerken artık hangi metnin ekranda olduğu belli
 *    olmuyor. (Bu test yazıldığında `window.confirm` yerine kendi onay
 *    penceremiz geldiği için sekiz anahtar boşta kalmıştı.)
 *  - **Var olmayan anahtar** — `MsgKey` tipi bunu derlemede yakalıyor, o yüzden
 *    burada tekrar test etmiyoruz.
 */
const SRC = join(process.cwd(), "src");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      out.push(...sourceFiles(path));
      continue;
    }
    if (!/\.tsx?$/.test(name)) continue;
    // Sözlüğün kendisi ve testler sayılmıyor: anahtarın "kullanıldığı" yer
    // arayüz olmalı, tanımı ya da testi değil.
    if (name === "messages.ts" || /\.test\.tsx?$/.test(name)) continue;
    out.push(path);
  }
  return out;
}

const HAYSTACK = sourceFiles(SRC)
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");

const KEYS = Object.keys(MESSAGES) as MsgKey[];

/**
 * Anahtar kaynakta geçiyor mu?
 *
 * `.one` / `.other` çiftleri `tp()` ile KÖKÜ üzerinden çağrılıyor
 * (`tp("status.tabs", n)`), tam anahtar hiçbir yerde yazmıyor — kökü aramak
 * gerekiyor.
 */
function isUsed(key: MsgKey): boolean {
  const base = key.replace(/\.(one|other)$/, "");
  return HAYSTACK.includes(`"${key}"`) || HAYSTACK.includes(`"${base}"`);
}

describe("sözlük hijyeni", () => {
  it("kaynak dosyalar taranabildi", () => {
    // Tarama boş dönerse aşağıdaki test her şeyi "kullanılmıyor" sanır ya da
    // (tersine) hiçbir şey doğrulamaz.
    expect(sourceFiles(SRC).length).toBeGreaterThan(20);
    expect(HAYSTACK.length).toBeGreaterThan(50_000);
  });

  it("kullanılmayan anahtar yok", () => {
    const unused = KEYS.filter((key) => !isUsed(key));
    expect(unused, `sözlükte kullanılmayan anahtar:\n${unused.join("\n")}`).toEqual([]);
  });

  it("çoğul kökleri gerçekten tp() ile çağrılıyor", () => {
    // `.one`/`.other` çifti tanımlanmış ama `tp()` yerine `t()` ile tam anahtar
    // çağrılıyorsa çoğul kuralı hiç işlemiyor demektir.
    const bases = [...new Set(KEYS.filter((k) => k.endsWith(".one")).map((k) => k.slice(0, -4)))];
    const bad = bases.filter((base) => !HAYSTACK.includes(`tp("${base}"`));
    expect(bad, `çoğul kökü tp() ile çağrılmıyor:\n${bad.join("\n")}`).toEqual([]);
  });
});

/**
 * Büyük harf düzeni.
 *
 * İki kural var ve ikisi de bir kez ödenmiş bedelden geliyor:
 *
 *  - **Metinler büyük harfle başlar.** Yüzden fazlası küçük harfle başlıyordu
 *    ve aynı ekranda "Sekmeyi kapat" ile "sekme adı" yan yana duruyordu.
 *  - **Cümle stili, başlık stili değil.** Yedi menü öğesi ("Kilidi Aç",
 *    "Grupları Daralt", "Favori Gruba Ekle") başlık stilindeydi, komşuları
 *    cümle stilinde. Aynı menüde iki yazım "biri yanlış" diye okunuyor ama
 *    hangisinin yanlış olduğu belli olmuyor.
 */
describe("büyük harf düzeni", () => {
  const LOWER_START = /^[a-zçğıiöşü]/;

  /**
   * Başka bir metnin İÇİNE parametre olarak giren parçalar.
   *
   * Bunları büyütmek cümleyi ortasından büyük harfle böler:
   * "Ctrl+A kapsam: Tüm sekmeler", "3 kayıt · Okunuyor…". Sondaki dosya adı
   * ise arayüz metni değil.
   */
  const PARCA = new Set<string>([
    "recall.scopeAll",
    "recall.scopeTab",
    "settings.historyReading",
    "fav.emptyLine3",
    "unit.yesterday",
    "transfer.defaultFileName",
  ]);

  it("metinler büyük harfle başlıyor", () => {
    const bad: string[] = [];
    for (const key of KEYS) {
      if (PARCA.has(key)) continue;
      const [tr, en] = MESSAGES[key];
      if (LOWER_START.test(tr)) bad.push(`${key} [TR] ${JSON.stringify(tr)}`);
      if (LOWER_START.test(en)) bad.push(`${key} [EN] ${JSON.stringify(en)}`);
    }
    expect(bad, `küçük harfle başlayan metin:\n${bad.join("\n")}`).toEqual([]);
  });

  it("parça listesi gerçekten parça", () => {
    // Liste bir kaçış kapısı; içine yanlışlıkla bir ETİKET girerse o metin
    // sessizce küçük kalır. Hepsinin küçük harfle başlaması bunu doğruluyor —
    // aksi hâlde listede olmalarının bir anlamı yok.
    const gereksiz = [...PARCA].filter((k) => {
      const entry = MESSAGES[k as MsgKey];
      return entry && !LOWER_START.test(entry[0]) && !LOWER_START.test(entry[1]);
    });
    expect(gereksiz, `parça listesinde gereksiz anahtar: ${gereksiz.join(", ")}`).toEqual([]);
  });

  /** Eylem etiketi taşıyan alanlar. */
  const LABEL_PREFIX =
    /^(menu|common|group|app|view|tab|window|confirm|settings|transfer|fav|history|recall|status|palette|env|term|pane)\./;
  /** Bu ekler açıklama/ipucu demek — tam cümle, kural dışı. */
  const HINT_SUFFIX = /(Hint|Title|Detail|Message|Blurb|Placeholder)$/;

  /** Özel adlar ve tuş adları: büyük harf yazılmaları doğru. */
  const PROPER = new Set([
    "NTerminal", "Windows", "Terminal", "One", "Half", "Solarized", "Koyu", "Açık",
    "Dark", "Light", "PowerShell", "Git", "Bash", "WSL", "Zsh", "Fish", "Cmd",
    "PSReadLine", "Tauri", "Rust", "Gezgin", "Finder", "Explorer",
    "Ctrl", "Alt", "Shift", "Esc", "Tab", "Enter", "Option", "Meta",
    "Ayarlar", "Profiller", "Davranış", "Settings", "Profiles", "Behavior",
    "Komut", "İstemi", "Prompt", "Command",
    // Geliştiricinin adı (Hakkında bölümü). Soyadın büyük yazılması Türkçe
    // yazışma geleneği, başlık stili değil.
    "Nurullah", "YAYAN",
  ]);

  const CAP = /^[A-ZÇĞİÖŞÜ]/;
  const LETTER = /[A-Za-zÇĞİÖŞÜçğıöşü]/;

  /**
   * Yeni bir etiket başlatan ayırıcılar.
   *
   * "İçe / Dışa aktar…" iki paralel komutu birleştiriyor, "Ayarlar › Davranış"
   * bir gezinme yolu. Ayırıcının sağındaki taraf yeni bir etiket ve kendi baş
   * harfini alıyor — başlık stili değil.
   */
  const SEPARATOR = new Set(["/", "›", "→", "·", "|", "»"]);

  /**
   * Metinde ilk sözcükten sonra gelen, özel ad OLMAYAN büyük harfli sözcükler.
   * Boş dizi = cümle stili.
   */
  function titleCaseWords(text: string): string[] {
    // Çok cümleli metin: noktadan sonra büyük harf doğru.
    if (/[.!?]\s/.test(text) || text.includes("\n")) return [];

    const tokens = text.split(/\s+/);
    const out: string[] = [];
    let seen = 0;

    for (let i = 0; i < tokens.length; i++) {
      const raw = tokens[i];
      if (!LETTER.test(raw)) continue; // ayırıcıların kendisi
      seen += 1;
      if (seen === 1) continue; // ilk sözcük zaten büyük olmalı
      if (SEPARATOR.has(tokens[i - 1])) continue; // sağdaki taraf yeni etiket
      if (raw.includes("+")) continue; // tuş bileşimi: "Ctrl+A"

      const word = raw.replace(/^[(‹›"'→·]+|[)‹›"'.,:;…]+$/g, "");
      if (CAP.test(word) && !PROPER.has(word)) out.push(word);
    }
    return out;
  }

  it("eylem etiketleri cümle stilinde", () => {
    const bad: string[] = [];
    for (const key of KEYS) {
      if (!LABEL_PREFIX.test(key) || HINT_SUFFIX.test(key)) continue;
      const [tr, en] = MESSAGES[key];
      for (const [lang, text] of [
        ["TR", tr],
        ["EN", en],
      ] as const) {
        const words = titleCaseWords(text);
        if (words.length) bad.push(`${key} [${lang}] ${JSON.stringify(text)} → ${words.join(", ")}`);
      }
    }
    expect(bad, `başlık stilinde etiket:\n${bad.join("\n")}`).toEqual([]);
  });

  describe("kural gerçekten çalışıyor", () => {
    // Yukarıdaki testler boş dizi bekliyor; kural hiçbir şey yakalamıyorsa da
    // boş döner ve sessizce geçer. Bilinen örneklerle doğruluyoruz.
    it("başlık stilini yakalıyor", () => {
      expect(titleCaseWords("Favori Gruba Ekle")).toEqual(["Gruba", "Ekle"]);
      expect(titleCaseWords("Kilidi Aç")).toEqual(["Aç"]);
      expect(titleCaseWords("Collapse Groups")).toEqual(["Groups"]);
    });

    it("cümle stilini işaretlemiyor", () => {
      expect(titleCaseWords("Sekmeyi kapat")).toEqual([]);
      expect(titleCaseWords("Favori gruba ekle")).toEqual([]);
    });

    it("ayırıcıdan sonraki etiketi işaretlemiyor", () => {
      // "İçe aktar" ve "Dışa aktar" iki ayrı komut; çizgi onları birleştiriyor.
      expect(titleCaseWords("İçe / Dışa aktar…")).toEqual([]);
      expect(titleCaseWords("Import / Export…")).toEqual([]);
      // Gezinme yolu: "›" sağındaki menü adı kendi baş harfini alır.
      expect(titleCaseWords("Kilitli — sağ tık › Kilidi aç")).toEqual([]);
      // Ama ayırıcı olmadan başlık stili yine yakalanmalı.
      expect(titleCaseWords("İçe Dışa aktar")).toEqual(["Dışa"]);
    });

    it("tuş bileşimini işaretlemiyor", () => {
      expect(titleCaseWords("Bu sekmenin geçmişinde ara… (Ctrl+A: tüm sekmeler)")).toEqual([]);
    });

    it("özel adları ve tuş adlarını işaretlemiyor", () => {
      expect(titleCaseWords("Windows Terminal")).toEqual([]);
      expect(titleCaseWords("Option tuşu Meta olsun")).toEqual([]);
      expect(titleCaseWords("Komut İstemi (cmd)")).toEqual([]);
    });

    it("çok cümleli metni kural dışı bırakıyor", () => {
      // "Şu an" yeni bir cümlenin başı, başlık stili değil.
      expect(titleCaseWords("Sınır aşılınca en eski kayıtlar silinir. Şu an: 4 MB")).toEqual([]);
    });
  });
});
