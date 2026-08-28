import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Sabit kodlanmış arayüz metni taraması.
 *
 * Bu test bir kez ödenmiş bedelden geliyor: metinleri sözlüğe taşırken elle
 * `grep` ile taradım ve **dört metni kaçırdım** — hepsi aynı sebeple, arada
 * `{}` ya da satır sonu olduğu için satır bazlı aramaya takılmadılar:
 *
 *   <label>Boyut ({fontSize} px)</label>
 *   <div className="hintline">\n  Terminalde geriye doğru kaç satır…\n</div>
 *   `${total.toLocaleString("tr-TR")} kayıt`
 *   [oturum sona erdi, çıkış kodu {code}]
 *
 * Kaçan metin arayüzde İngilizce seçildiğinde Türkçe kalıyor ve bu ancak
 * gözle görülüyor. Tarama şimdi yapısal: yorumlar ve `{...}` ifadeleri
 * çıkarıldıktan sonra kalan JSX metni ile insan diline benzeyen öznitelik
 * değerleri işaretleniyor.
 */

const SRC = join(process.cwd(), "src");

/** Taranmayacak dosyalar: sözlüğün kendisi, testler ve dil motoru. */
const SKIP = new Set(["messages.ts", "i18n.ts"]);

/**
 * Çeviri gerektirmeyen, bilinçli olarak sabit metinler.
 *
 * Ürün adları, kod örnekleri ve tek karakterlik simgeler. Listeye ekleme
 * yapmak bir karar: "bu metin gerçekten dile bağlı değil mi?"
 */
const ALLOWED = new Set([
  "Bash (Git Bash / MSYS)",
  "PowerShell 7+ (pwsh)",
  "Windows PowerShell 5.1",
]);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      out.push(...sourceFiles(path));
      continue;
    }
    if (!/\.tsx?$/.test(name)) continue;
    if (SKIP.has(name) || /\.test\.tsx?$/.test(name)) continue;
    out.push(path);
  }
  return out;
}

/** Satır ve blok yorumlarını boşlukla değiştirir (konumlar kaymasın). */
function stripComments(source: string): string {
  let out = "";
  let i = 0;
  while (i < source.length) {
    if (source.startsWith("//", i)) {
      while (i < source.length && source[i] !== "\n") {
        out += " ";
        i += 1;
      }
      continue;
    }
    if (source.startsWith("/*", i)) {
      const end = source.indexOf("*/", i + 2);
      const stop = end === -1 ? source.length : end + 2;
      for (; i < stop; i++) out += source[i] === "\n" ? "\n" : " ";
      continue;
    }
    out += source[i];
    i += 1;
  }
  return out;
}

/**
 * `{...}` ifadelerini boşaltır.
 *
 * JSX metni bunların ARASINDA kalan kısım. İfadelerin içi kod; orada geçen
 * metin ya `t(...)` çağrısıdır ya da başka bir yerde denetleniyor.
 */
function blankBraces(source: string): string {
  const chars = [...source];
  let depth = 0;
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] === "{") {
      depth += 1;
      chars[i] = " ";
      continue;
    }
    if (chars[i] === "}") {
      if (depth > 0) depth -= 1;
      chars[i] = " ";
      continue;
    }
    if (depth > 0 && chars[i] !== "\n") chars[i] = " ";
  }
  return chars.join("");
}

const LETTERS = /[A-Za-zÇĞİÖŞÜçğıöşü]/g;

/**
 * İnsan diline benzeyen metin: en az iki sözcük ve en az altı harf.
 *
 * Tek sözcükler (`NODE_ENV=development`, `PS7`, dosya yolları) ve simgeler
 * dışarıda kalıyor; bunlar çeviri gerektirmiyor.
 */
function looksLikeSentence(text: string): boolean {
  const clean = text.trim();
  if (!clean) return false;
  if (ALLOWED.has(clean)) return false;
  const letters = clean.match(LETTERS)?.length ?? 0;
  if (letters < 6) return false;
  const words = clean.split(/\s+/).filter((w) => LETTERS.test(w));
  LETTERS.lastIndex = 0;
  return words.length >= 2;
}

interface Finding {
  file: string;
  text: string;
}

function scan(path: string): Finding[] {
  const raw = readFileSync(path, "utf8");
  const source = blankBraces(stripComments(raw));
  const file = relative(process.cwd(), path).replace(/\\/g, "/");
  const out: Finding[] = [];

  // 1) JSX metin dugumleri.
  //
  // Kapanis etiketi (`</`) SART: `>` ile `<` arasini kosulsuz almak
  // TypeScript jeneriklerini metin saniyordu - iki ayri jenerik arasinda
  // kalan kod parcasi (`): Promise` gibi) iki sozcuk gibi gorunuyor.
  // JSX metni neredeyse her zaman kapanis etiketiyle bitiyor.
  if (path.endsWith(".tsx")) {
    for (const match of source.matchAll(/>([^<>]+)<\//g)) {
      if (looksLikeSentence(match[1])) out.push({ file, text: match[1].trim() });
    }
  }

  // 2) Kullaniciya gorunen oznitelikler ve menu etiketleri.
  const attrs = /(?:placeholder|title|aria-label|label)\s*[=:]\s*"([^"]+)"/g;
  for (const match of source.matchAll(attrs)) {
    if (looksLikeSentence(match[1])) out.push({ file, text: match[1] });
  }

  return out;
}

describe("sabit kodlanmış arayüz metni", () => {
  const files = sourceFiles(SRC);

  it("taranacak dosyalar bulundu", () => {
    // Tarama boş dönerse aşağıdaki test hiçbir şey doğrulamaz.
    expect(files.length).toBeGreaterThan(20);
  });

  it("çeviriden geçmemiş metin yok", () => {
    const findings = files.flatMap(scan);
    const report = findings.map((f) => `  ${f.file}: ${JSON.stringify(f.text)}`).join("\n");
    expect(findings, `sözlüğe taşınmamış metin:\n${report}`).toEqual([]);
  });

  it("tarama gerçekten metin yakalıyor", () => {
    // Testin kendisi çalışmıyorsa (yanlış ayrıştırma) sessizce geçer. Bilinen
    // bir örnekle doğruluyoruz.
    const sample = `
      const x = <div>{t("a.b")}</div>;
      const y = <label>Boyut ({size} px) burada</label>;
    `;
    const cooked = blankBraces(stripComments(sample));
    // Gerçek taramanın deseniyle aynı: aksi hâlde bu öz-denetim başka bir kod
    // yolunu doğrular ve tarama bozulduğunda sessiz kalır.
    const hits = [...cooked.matchAll(/>([^<>]+)<\//g)]
      .map((m) => m[1])
      .filter(looksLikeSentence);
    expect(hits.length, "bilinen sabit metin yakalanamadı").toBeGreaterThan(0);
  });
});
