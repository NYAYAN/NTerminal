import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { contrastRatio } from "../lib/contrast";
import { THEMES, getTheme } from "../lib/themes";

/**
 * Grup rengi artık yalnızca ince bir şeritte değil ARKA PLANDA da görünüyor.
 * Bu, okunabilirliği sessizce bozabilecek bir değişiklik: kullanıcı grup rengi
 * olarak herhangi bir rengi seçebiliyor (Ayarlar → Gruplar → Renk yerleşik bir
 * renk seçici) ve arka plan koyulaştıkça sabit renkli soluk metin kayboluyor.
 *
 * Ölçülen ilk hâli: Solarized Açık + siyah grup rengi → alt satır karşıtlığı
 * 2.12, koyu tema + beyaz grup rengi → 2.26. İkisi de okunmuyordu.
 *
 * Bu test CSS'teki karışım oranlarını DOSYADAN okuyup aynı hesabı burada
 * yapıyor: oranı yükseltmek testi düşürür. Amaç bir stil tercihini dondurmak
 * değil, okunabilirlik sınırını korumak.
 */
const CSS = readFileSync(join(process.cwd(), "src/styles/global.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

/** `selector { … color-mix(in srgb, var(--<a>) N%, …) }` içindeki N. */
function mixPercent(selector: string, first: string): number {
  const at = CSS.indexOf(`${selector} {`);
  expect(at, `CSS kuralı bulunamadı: ${selector}`).toBeGreaterThan(-1);
  const body = CSS.slice(at, CSS.indexOf("}", at));
  const re = new RegExp(`color-mix\\(in srgb,\\s*var\\(--${first}\\)\\s*([\\d.]+)%`);
  const match = re.exec(body);
  expect(match, `${selector} içinde ${first} karışımı bulunamadı`).not.toBe(null);
  return Number.parseFloat(match![1]);
}

function rgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ];
}

function toHex([r, g, b]: [number, number, number]): string {
  const h = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** `color-mix(in srgb, a p%, b)` — iki opak renk için düz sRGB karışımı. */
function mix(a: string, b: string, percent: number): string {
  const [ar, ag, ab] = rgb(a);
  const [br, bg, bb] = rgb(b);
  const p = percent / 100;
  return toHex([ar * p + br * (1 - p), ag * p + bg * (1 - p), ab * p + bb * (1 - p)]);
}

const IDLE = mixPercent(".group", "group-color");
const ACTIVE = mixPercent(".group.active", "group-color");
const TABS = mixPercent(".group.active .group-tabs", "group-color");
const DIM = mixPercent(".group .group-count,\n.group .tab-row-sub", "text");

/**
 * Kullanıcının seçebileceği renkler. Uçları (saf siyah, saf beyaz) bilinçli
 * içeriyor: yerleşik renk seçici onları da veriyor ve en kötü durumlar orada.
 */
const COLORS = [
  "#58a6ff",
  "#3fb950",
  "#d29922",
  "#bc8cff",
  "#39c5cf",
  "#ff7b72",
  "#f778ba",
  "#a371f7",
  "#ffffff",
  "#000000",
  "#6e7681",
];

const MIN_NAME = 4.5;
const MIN_DIM = 3.0;

describe("grup rengi okunabilirliği", () => {
  it("karışım oranları CSS'ten okunabildi", () => {
    // Oranlar bulunamazsa aşağıdaki testler sessizce anlamsız hâle gelirdi.
    expect(IDLE).toBeGreaterThan(0);
    expect(ACTIVE).toBeGreaterThan(0);
    expect(TABS).toBeGreaterThan(0);
    expect(DIM).toBeGreaterThan(0);
  });

  for (const meta of THEMES) {
    const theme = getTheme(meta.id);
    const { surfaceAlt, text, textDim } = theme.ui;
    // `.group .group-count` kuralı soluk metni ana metinden türetiyor.
    const dimText = mix(text, textDim, DIM);

    for (const color of COLORS) {
      const idleBg = mix(color, surfaceAlt, IDLE);
      const activeBg = mix(color, surfaceAlt, ACTIVE);
      // Sekme listesi etkin grubun arka planı üzerine bir kat daha alıyor.
      const tabsBg = mix(color, activeBg, TABS);

      it(`${meta.id} / ${color}: grup adı okunabilir`, () => {
        for (const [label, bg] of [
          ["etkin değil", idleBg],
          ["etkin", activeBg],
        ] as const) {
          const ratio = contrastRatio(text, bg);
          expect(ratio, `${label} arka plan ${bg}, karşıtlık ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(
            MIN_NAME,
          );
        }
      });

      it(`${meta.id} / ${color}: soluk metin okunabilir`, () => {
        for (const [label, bg] of [
          ["sekme sayısı", activeBg],
          ["sekme alt satırı", tabsBg],
        ] as const) {
          const ratio = contrastRatio(dimText, bg);
          expect(ratio, `${label} arka plan ${bg}, karşıtlık ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(
            MIN_DIM,
          );
        }
      });
    }
  }
});

/**
 * Öneri listesinin seçili satırı.
 *
 * Bu blok ölçülmüş bir hatadan geliyor: seçili satırın "eklenecek kısmı" vurgu
 * renginde çiziliyordu, arka planı da vurgu renginin açık bir karışımıydı —
 * yani renk rengin üzerine geliyordu. Solarized Açık'ta karşıtlık 2.54'e
 * iniyordu; listenin EN ÖNEMLİ metni en okunmaz olanıydı. Vurgu rengi artık
 * yalnızca arka plan tonunda ve sol kenar çizgisinde.
 */
describe("öneri listesi okunabilirliği", () => {
  const SELECTED = mixPercent(".suggest-row.on", "accent");

  it("seçili satırın vurgu oranı okunabildi", () => {
    expect(SELECTED).toBeGreaterThan(0);
  });

  it("seçili satırın metni vurgu rengi DEĞİL", () => {
    // Vurgu rengini vurgu tonlu arka plana koymak hatanın kendisiydi.
    const body = CSS.slice(CSS.indexOf(".suggest-rest {"));
    const rule = body.slice(0, body.indexOf("}"));
    expect(rule).toMatch(/color:\s*var\(--text\)/);
    expect(
      CSS,
      "seçili satır için accent renkli metin kuralı geri gelmiş",
    ).not.toMatch(/\.suggest-row\.on\s+\.suggest-rest\s*\{[^}]*var\(--accent\)/);
  });

  for (const meta of THEMES) {
    const theme = getTheme(meta.id);

    it(`${meta.id}: seçili öneri metni okunabilir`, () => {
      const bg = mix(theme.ui.accent, theme.ui.surfaceAlt, SELECTED);
      const ratio = contrastRatio(theme.ui.text, bg);
      expect(ratio, `arka plan ${bg}, karşıtlık ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
    });

    it(`${meta.id}: seçili olmayan öneri okunabilir`, () => {
      const ratio = contrastRatio(theme.ui.textDim, theme.ui.surfaceAlt);
      expect(ratio, `karşıtlık ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(3.0);
    });
  }
});
