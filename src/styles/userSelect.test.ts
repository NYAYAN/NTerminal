import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Her `user-select` bildiriminin yanında önekli kardeşi.
 *
 * WebKit (macOS'taki WKWebView) önsüz `user-select`i tanımıyor; ölçülen:
 * `CSS.supports("user-select", "none") === false`. Yalnız önsüz yazılan kural
 * macOS'ta hiç uygulanmıyor ve "seçilmesin" denen yazı seçilebiliyor —
 * BİLDİRİLEN: Kokpit'te soldaki grubun yazısına çift tıklamak kelimeyi
 * seçiyor, macOS da Spotlight'ı açıyordu. Windows'ta (Chromium) önsüzü
 * yeterli olduğu için hata yalnız macOS'ta görünüyor; bu test ikisini
 * birlikte bağlıyor.
 */

const DIR = join(process.cwd(), "src/styles");

/** Yorumları atılmış kural gövdeleri: `seçici { … }`. */
function rules(css: string): string[] {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("}")
    .filter((chunk) => chunk.includes("{"));
}

describe("user-select önekleri", () => {
  const files = readdirSync(DIR).filter((name) => name.endsWith(".css"));

  it.each(files)("%s: her user-select yanında -webkit-user-select var", (name) => {
    const eksik: string[] = [];
    for (const rule of rules(readFileSync(join(DIR, name), "utf8"))) {
      for (const match of rule.matchAll(/(?<![-\w])user-select:\s*([a-z-]+)/g)) {
        const prefixed = new RegExp(`-webkit-user-select:\\s*${match[1]}\\b`);
        if (!prefixed.test(rule)) eksik.push(rule.slice(0, rule.indexOf("{")).trim());
      }
    }
    expect(eksik, "önekli kardeşi olmayan kurallar").toEqual([]);
  });

  it("uygulama gövdesi seçilemez", () => {
    const body = rules(readFileSync(join(DIR, "global.css"), "utf8")).find((rule) =>
      /(^|\n)\s*body\s*\{/.test(rule),
    );
    expect(body).toMatch(/-webkit-user-select:\s*none/);
  });
});
