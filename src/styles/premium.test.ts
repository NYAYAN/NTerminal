import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Premium tasarımın KLASİĞE dokunmadığının güvencesi.
 *
 * `premium.css` içindeki her seçici `:root[data-design="premium"]` ile
 * başlamak zorunda. Tek bir kaçak kural (`.tab { … }` gibi) her iki tasarımı
 * birden değiştirir ve bunu ancak klasik tasarımı seçen biri, "bir şey
 * değişti" diyerek fark eder. Kuralı burada bağlıyoruz: dosyaya eklenen her
 * kural ya kapsamlı ya da test düşüyor.
 *
 * Ayrıştırma basit ve bilinçli: yorumlar atılıyor, `@media` gibi blokların
 * içi de taranıyor (iç kurallar da kapsamlı olmalı), `@keyframes`e izin
 * veriliyor (adlandırılmış animasyon kendi başına hiçbir şeye uygulanmaz).
 */
const SCOPE = ':root[data-design="premium"]';

function selectors(css: string): string[] {
  const out: string[] = [];
  let i = 0;
  const walk = (end: number) => {
    while (i < end) {
      const open = css.indexOf("{", i);
      if (open === -1 || open >= end) return;
      const header = css.slice(i, open).trim();
      i = open + 1;
      if (header.startsWith("@keyframes")) {
        // Gövdeyi atla.
        let depth = 1;
        while (depth > 0 && i < css.length) {
          const ch = css[i++];
          if (ch === "{") depth++;
          else if (ch === "}") depth--;
        }
        continue;
      }
      if (header.startsWith("@")) {
        // İç kuralları tara; kapanış ayracını bul.
        let depth = 1;
        let j = i;
        while (depth > 0 && j < css.length) {
          const ch = css[j++];
          if (ch === "{") depth++;
          else if (ch === "}") depth--;
        }
        walk(j - 1);
        i = j;
        continue;
      }
      out.push(header);
      const close = css.indexOf("}", i);
      i = close + 1;
    }
  };
  walk(css.length);
  return out;
}

/**
 * Seçici listesini YALNIZCA en üst düzeydeki virgüllerden böler.
 *
 * `:is(.a, .b)` / `:where(...)` içindeki virgül liste ayırıcısı değil; düz
 * `split(",")` onları da bölüyor ve `.b)` gibi parçaları "kapsam dışı" sayıyordu.
 */
function splitSelectorList(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < list.length; i++) {
    const ch = list[i];
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    else if (ch === "," && depth === 0) {
      out.push(list.slice(start, i));
      start = i + 1;
    }
  }
  out.push(list.slice(start));
  return out.map((x) => x.trim()).filter(Boolean);
}

describe("premium.css kapsamı", () => {
  const css = readFileSync(join(process.cwd(), "src/styles/premium.css"), "utf8").replace(
    /\/\*[\s\S]*?\*\//g,
    "",
  );

  it("her seçici premium köküyle başlıyor", () => {
    const all = selectors(css);
    expect(all.length).toBeGreaterThan(50);
    const kacak = all.flatMap((group) =>
      splitSelectorList(group).filter((s) => !s.startsWith(SCOPE)),
    );
    expect(kacak, "kapsam dışı seçiciler").toEqual([]);
  });

  /*
   * Ayarlar penceresinin premium'a özel öğeleri klasikte GİZLİ olmalı:
   * işaretleme iki tasarımda ortak, klasiğin görünüşü bu kuralla korunuyor.
   */
  it("premium'a özel ayar öğeleri klasikte gizli", () => {
    const global = readFileSync(join(process.cwd(), "src/styles/global.css"), "utf8").replace(
      /\/\*[\s\S]*?\*\//g,
      "",
    );
    const rule = /([^{}]+)\{\s*display:\s*none;\s*\}/g;
    const hidden = [...global.matchAll(rule)].flatMap((m) => m[1].split(",").map((x) => x.trim()));
    for (const selector of [
      ".settings-nav .nav-ico",
      ".settings-search-ico",
      ".modal-head .settings-page",
      ".about-hero > .about-icon",
    ]) {
      expect(hidden, selector).toContain(selector);
    }
  });

  it("global.css premium dosyasını içe aktarıyor", () => {
    const global = readFileSync(join(process.cwd(), "src/styles/global.css"), "utf8");
    expect(global).toContain('@import "./premium.css";');
  });

  /*
   * Terminal ızgarasını belirleyen üç ölçü (`layout.test.ts`) premium'da da
   * aynı kalmalı; yoksa tasarım değiştirmek sütun sayısını değiştirirdi.
   */
  it("terminal dolgusuna ve kaydırma çubuğu genişliğine dokunmuyor", () => {
    expect(css).not.toMatch(/\.term-host \.xterm\s*\{/);
    expect(css).not.toMatch(/\.xterm-viewport/);
    expect(css).not.toMatch(/::-webkit-scrollbar\s*\{/);
  });

  it("öz-denetim: :is() içindeki virgül seçiciyi bölmüyor", () => {
    expect(splitSelectorList(`${SCOPE} :is(.a, .b) > .c, .d`)).toEqual([
      `${SCOPE} :is(.a, .b) > .c`,
      ".d",
    ]);
  });

  it("öz-denetim: kapsam dışı kural yakalanıyor", () => {
    const ornek = `${SCOPE} .a { x: 1; } @media (x) { .b { y: 2; } } @keyframes k { from { o: 0 } }`;
    expect(selectors(ornek)).toEqual([`${SCOPE} .a`, ".b"]);
  });
});

/**
 * Kokpit yerleşiminin (`kokpit.css`) Premium'a ve Klasik'e dokunmadığının
 * güvencesi — premium.css için yukarıdakiyle aynı kural, kendi köküyle.
 * Kokpit seçilince kökte `data-design="premium"` de duruyor; yerleşim kuralları
 * yalnızca `data-layout="kokpit"` altında.
 */
describe("kokpit.css kapsamı", () => {
  const KOKPIT = ':root[data-layout="kokpit"]';
  const css = readFileSync(join(process.cwd(), "src/styles/kokpit.css"), "utf8").replace(
    /\/\*[\s\S]*?\*\//g,
    "",
  );
  const global = readFileSync(join(process.cwd(), "src/styles/global.css"), "utf8").replace(
    /\/\*[\s\S]*?\*\//g,
    "",
  );

  it("her seçici Kokpit köküyle başlıyor", () => {
    const all = selectors(css);
    expect(all.length).toBeGreaterThan(30);
    const kacak = all.flatMap((group) =>
      splitSelectorList(group).filter((s) => !s.startsWith(KOKPIT)),
    );
    expect(kacak, "kapsam dışı seçiciler").toEqual([]);
  });

  /*
   * Kokpit premium'un üstüne biniyor: aynı özgüllükteki iki kuraldan
   * Kokpit'inki kazanmalı, yani içe aktarma premium'dan SONRA.
   */
  it("global.css Kokpit'i premium'dan sonra içe aktarıyor", () => {
    const premium = global.indexOf('@import "./premium.css";');
    const kokpit = global.indexOf('@import "./kokpit.css";');
    expect(premium).toBeGreaterThan(-1);
    expect(kokpit).toBeGreaterThan(premium);
  });

  it("terminal ölçülerine dokunmuyor", () => {
    expect(css).not.toMatch(/\.term-host \.xterm\s*\{/);
    expect(css).not.toMatch(/xterm/);
    // Gizlenen tek kaydırma çubuğu rayınki; terminalinki ve genel çubuk aynen.
    const scrollbars = selectors(css).filter((s) => s.includes("::-webkit-scrollbar"));
    expect(scrollbars).toEqual([`${KOKPIT} .grail-groups::-webkit-scrollbar`]);
  });

  /*
   * Kokpit'te yan panel terminalin yanında; global.css'teki "panelin solunda
   * dur" kaydırmalarını `--side-panel-w` değişkenini sıfırlayarak geri alıyor.
   * Bu yalnızca kaydırmaların HEPSİ o değişkenden hesaplanıyorsa işe yarar:
   * sabit bir sayıyla eklenen yeni bir kaydırma Kokpit'te panelin genişliği
   * kadar boşluk bırakırdı.
   */
  it("panel kaydırmaları değişkenden; Kokpit değişkeni sıfırlıyor", () => {
    const rules = [...global.matchAll(/([^{}]*\.main:has\(> \.side-panel\)[^{}]*)\{([^}]*)\}/g)];
    expect(rules.length).toBeGreaterThanOrEqual(5);
    for (const [, header, body] of rules) {
      expect(body, header.trim()).toContain("var(--side-panel-w");
    }
    expect(css).toMatch(/\.main\s*\{[^}]*--side-panel-w:\s*0px\s*!important/);
  });
});
