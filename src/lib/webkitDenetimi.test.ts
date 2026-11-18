import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const SCRIPT = readFileSync("public/webkit-denetimi.js", "utf8");

/** Betiği sahte bir pencerede koşturup gövdeye yazılanı döndürür. */
function run({ lookbehind }: { lookbehind: boolean }): string {
  const body = { innerHTML: '<div id="root"></div>', style: {} as Record<string, string> };
  let ready: (() => void) | undefined;
  const RealRegExp = RegExp;
  const context = {
    window: {} as Record<string, unknown>,
    RegExp: function (source: string) {
      if (!lookbehind && source.includes("(?<")) throw new SyntaxError("Invalid regular expression");
      return new RealRegExp(source);
    },
    document: { body, addEventListener: (_e: string, fn: () => void) => (ready = fn) },
  };
  runInNewContext(SCRIPT, context);
  ready?.();
  return body.innerHTML;
}

describe("eski WebKit denetimi", () => {
  it("index.html betiği modül paketinden önce yüklüyor", () => {
    const html = readFileSync("index.html", "utf8");
    const guard = html.indexOf('<script src="/webkit-denetimi.js"></script>');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(html.indexOf('type="module"'));
  });

  it("güncel WebKit'te arayüze dokunmuyor", () => {
    expect(run({ lookbehind: true })).toBe('<div id="root"></div>');
  });

  it("lookbehind yoksa siyah ekran yerine güncelleme uyarısı", () => {
    const html = run({ lookbehind: false });
    expect(html).toContain("Safari 16.4");
    expect(html).toContain("Yazılım Güncelleme");
  });

  it("arayüz kodunda regex lookbehind yok: eski WebKit bütün dosyayı reddediyor", () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        return statSync(path).isDirectory() ? walk(path) : [path];
      });
    const offenders = walk("src")
      .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f))
      .filter((f) => /\(\?<[=!]/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
