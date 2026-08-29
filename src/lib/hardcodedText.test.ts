import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Sabit kodlanmış arayüz metni taraması.
 *
 * Bu test bir kez ödenmiş bedelden geliyor: metinleri sözlüğe taşırken elle
 * `grep` ile taradım ve dört metni kaçırdım — hepsi aynı sebeple, arada `{}`
 * ya da satır sonu olduğu için satır bazlı aramaya takılmadılar. Kaçan metin
 * arayüzde İngilizce seçildiğinde Türkçe kalıyor ve bu ancak gözle görülüyor.
 *
 * ## Neden AST
 *
 * İlk sürüm metinsel bir sezgiyle çalışıyordu: yorumları ve `{...}`
 * ifadelerini boşaltıp kalan JSX metnine bakıyordu. O yaklaşım SESSİZCE
 * BOZUKTU ve bunu ölçerek bulduk — `{` sayarak JSX ifade parantezini sıradan
 * bir kod bloğundan ayırt etmek mümkün değil, dolayısıyla `function X() {`
 * satırından itibaren dosyanın TAMAMI "ifade içi" sayılıp boşaltılıyordu.
 * Bütün JSX bir fonksiyon gövdesinde olduğu için tarama hiçbir şey görmüyordu.
 *
 * Daha kötüsü: kendi öz-denetim testi, fonksiyon sarmalayıcısı OLMAYAN bir
 * örnek üzerinde çalıştığı için geçiyordu. Yani test "çalışıyorum" diyordu.
 * Buradaki ders artık kodda: öz-denetim gerçek `scan()` işlevini, gerçekçi bir
 * kaynak üzerinde çağırıyor (aşağıya bakın).
 *
 * Şimdi TypeScript'in kendi ayrıştırıcısı kullanılıyor: `JsxText` düğümleri ve
 * dize değerli JSX öznitelikleri tam olarak biliniyor, sezgiye yer yok.
 */

const SRC = join(process.cwd(), "src");

/** Taranmayacak dosyalar: sözlüğün kendisi ve dil motoru. */
const SKIP = new Set(["messages.ts", "i18n.ts"]);

/** Kullanıcıya görünen JSX öznitelikleri. */
const ATTRS = new Set(["placeholder", "title", "aria-label", "label", "alt"]);

/**
 * Kullanıcıya görünen nesne alanları.
 *
 * Menü girdileri (`{ kind: "item", label: "..." }`) ve onay penceresi istekleri
 * JSX değil, düz nesne; metinleri de çeviriden geçmeli.
 */
const PROPS = new Set([
  "label",
  "title",
  "hint",
  "placeholder",
  "message",
  "detail",
  "confirmLabel",
  "cancelLabel",
]);

/**
 * Tek sözcük bile olsa çeviri gerektiren etiketler.
 *
 * Bir düğmenin ya da etiketin içindeki tek sözcük ("Kapat", "Sil") neredeyse
 * her zaman arayüz metni. Diğer etiketlerde tek sözcük genelde ürün adı, kod
 * örneği ya da teknik kısaltma oluyor ("NTerminal", "NODE_ENV=development",
 * "pid") — onları işaretlemek gürültü olurdu.
 */
const WORDY_TAGS = new Set(["button", "label"]);

/**
 * Çeviri gerektirmeyen, bilinçli olarak sabit metinler.
 *
 * Ürün adları ve kod örnekleri. Listeye ekleme yapmak bir karar: "bu metin
 * gerçekten dile bağlı değil mi?"
 */
const ALLOWED = new Set([
  "Bash (Git Bash / MSYS)",
  "PowerShell 7+ (pwsh)",
  "Windows PowerShell 5.1",
]);

const LETTER = /[A-Za-zÇĞİÖŞÜçğıöşü]/;

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

function letterCount(text: string): number {
  return [...text].filter((c) => LETTER.test(c)).length;
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter((w) => LETTER.test(w)).length;
}

/**
 * İnsan diline benzeyen metin: en az iki sözcük ve en az altı harf.
 *
 * Tek sözcükler (`NODE_ENV=development`, `PS7`, dosya yolları) ve simgeler
 * dışarıda kalıyor; `WORDY_TAGS` içindekiler ayrıca ele alınıyor.
 */
function looksLikeSentence(text: string): boolean {
  const clean = text.trim();
  if (!clean || ALLOWED.has(clean)) return false;
  return letterCount(clean) >= 6 && wordCount(clean) >= 2;
}

/** Düğme/etiket içindeki tek sözcük de sayılıyor. */
function looksLikeLabel(text: string): boolean {
  const clean = text.trim();
  if (!clean || ALLOWED.has(clean)) return false;
  return letterCount(clean) >= 3 && wordCount(clean) >= 1;
}

export interface Finding {
  file: string;
  line: number;
  kind: string;
  text: string;
}

/** Tek bir kaynak metnini tarar. Dosya adı yalnızca raporda kullanılıyor. */
function scanSource(text: string, file: string): Finding[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: Finding[] = [];
  const lineOf = (node: ts.Node) =>
    sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

  const visit = (node: ts.Node) => {
    // 1) JSX metin düğümleri.
    if (ts.isJsxText(node)) {
      const clean = node.text.trim();
      if (clean) {
        const parent = node.parent;
        const tag =
          parent && ts.isJsxElement(parent)
            ? parent.openingElement.tagName.getText(sf)
            : "";
        const wordy = WORDY_TAGS.has(tag);
        if (looksLikeSentence(clean) || (wordy && looksLikeLabel(clean))) {
          out.push({ file, line: lineOf(node), kind: `jsx<${tag || "?"}>`, text: clean });
        }
      }
    }

    // 2) Kullanıcıya görünen JSX öznitelikleri.
    if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer)) {
      const name = node.name.getText(sf);
      if (ATTRS.has(name) && looksLikeSentence(node.initializer.text)) {
        out.push({
          file,
          line: lineOf(node),
          kind: `attr:${name}`,
          text: node.initializer.text,
        });
      }
    }

    // 3) Menü girdisi / onay isteği gibi nesne alanları.
    if (ts.isPropertyAssignment(node) && ts.isStringLiteral(node.initializer)) {
      const name = node.name.getText(sf).replace(/["']/g, "");
      if (PROPS.has(name) && looksLikeSentence(node.initializer.text)) {
        out.push({
          file,
          line: lineOf(node),
          kind: `prop:${name}`,
          text: node.initializer.text,
        });
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sf);
  return out;
}

function scan(path: string): Finding[] {
  const file = relative(process.cwd(), path).replace(/\\/g, "/");
  return scanSource(readFileSync(path, "utf8"), file);
}

describe("sabit kodlanmış arayüz metni", () => {
  const files = sourceFiles(SRC);

  it("taranacak dosyalar bulundu", () => {
    // Tarama boş dönerse aşağıdaki test hiçbir şey doğrulamaz.
    expect(files.length).toBeGreaterThan(20);
  });

  it("çeviriden geçmemiş metin yok", () => {
    const findings = files.flatMap(scan);
    const report = findings
      .map((f) => `  ${f.file}:${f.line} [${f.kind}] ${JSON.stringify(f.text)}`)
      .join("\n");
    expect(findings, `sözlüğe taşınmamış metin:\n${report}`).toEqual([]);
  });

  /**
   * Öz-denetim.
   *
   * Örnekler GERÇEKÇİ olmak zorunda ve gerçek `scanSource` ile taranmak
   * zorunda. Önceki sürümün tam hatası buydu: öz-denetim sarmalayıcısız bir
   * örnek üzerinde ayrı bir kod yolunu doğruluyor, gerçek tarama ise ölü
   * duruyordu.
   */
  describe("tarama gerçekten çalışıyor", () => {
    it("fonksiyon gövdesindeki JSX metnini yakalıyor", () => {
      const sample = `
        export function A() {
          return <div className="hintline">Bu metin sözlüğe taşınmamış.</div>;
        }
      `;
      const hits = scanSource(sample, "ornek.tsx");
      expect(hits.map((h) => h.text), "fonksiyon içindeki metin kaçtı").toContain(
        "Bu metin sözlüğe taşınmamış.",
      );
    });

    it("map ifadesinin içindeki JSX metnini yakalıyor", () => {
      // Liste öğeleri arayüzün büyük kısmı; `{...map()}` içinde kaldıkları için
      // önceki tarama bunları hiç görmüyordu.
      const sample = `
        export function B({ items }) {
          return (
            <ul>
              {items.map((x) => (
                <li key={x.id}>Bu satır sözlüğe taşınmamış.</li>
              ))}
            </ul>
          );
        }
      `;
      const hits = scanSource(sample, "ornek.tsx");
      expect(hits.map((h) => h.text), "map içindeki metin kaçtı").toContain(
        "Bu satır sözlüğe taşınmamış.",
      );
    });

    it("düğme içindeki tek sözcüğü yakalıyor", () => {
      const sample = `
        export function C() {
          return <button onClick={close}>Kapat</button>;
        }
      `;
      expect(scanSource(sample, "ornek.tsx").map((h) => h.text)).toContain("Kapat");
    });

    it("çeviriden geçen metni işaretlemiyor", () => {
      const sample = `
        export function D() {
          return (
            <div>
              <span>{t("common.close")}</span>
              <button>{t("confirm.delete")}</button>
              <p>{tp("status.tabs", n)}</p>
            </div>
          );
        }
      `;
      expect(scanSource(sample, "ornek.tsx")).toEqual([]);
    });

    it("TypeScript jeneriklerini metin sanmıyor", () => {
      // Eski metinsel tarama `>` ile `<` arasını metin sayıyordu ve iki jenerik
      // arasında kalan kod parçası cümle gibi görünüyordu.
      const sample = `
        export async function load(): Promise<Map<string, number>> {
          const cache = new Map<string, Array<number>>();
          return cache;
        }
      `;
      expect(scanSource(sample, "ornek.ts")).toEqual([]);
    });

    it("ürün adını ve kod örneğini işaretlemiyor", () => {
      const sample = `
        export function E() {
          return (
            <div>
              <h3>NTerminal</h3>
              <span className="mono">NODE_ENV=development</span>
              <span>pid</span>
            </div>
          );
        }
      `;
      expect(scanSource(sample, "ornek.tsx")).toEqual([]);
    });

    it("menü girdisinin etiketini yakalıyor", () => {
      const sample = `
        const entries = [{ kind: "item", label: "Klasörü gezginde aç", run: f }];
      `;
      expect(scanSource(sample, "ornek.ts").map((h) => h.kind)).toContain("prop:label");
    });
  });
});
