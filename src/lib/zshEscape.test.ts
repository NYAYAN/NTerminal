import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { unescapeOsc } from "./osc";

/**
 * zsh kaçış kuralı ile ön yüz çözücüsünün çapraz doğrulaması.
 *
 * Bu iki taraf ayrı dillerde yazılmış ve birbirini görmüyor: kaçışı
 * `shell-integration/nterminal.zsh` içindeki `__nterm_escape` yapıyor, geri
 * almayı `osc.ts` içindeki `unescapeOsc`. Aralarında bir sözleşme var ve
 * bozulduğunda kimse hata vermiyor — komut metni yalnızca YANLIŞ görünüyor:
 * `echo a; echo b` yerine `echo a\x3B echo b` gibi.
 *
 * Kaçışı zsh'in içinde denemek şart, gözle okumak yetmez: `${v//desen/...}`
 * içinde ters eğik çizginin kaç kez yazılacağı bash ile zsh arasında
 * farklıdır. Bu yüzden sınama verisi (`fixtures/zshEscape.tsv`) GERÇEK zsh
 * 5.9 koşturularak üretildi — macOS'un da kullandığı sürüm. Girdi base64
 * olarak duruyor, yani dosya kendini anlatıyor ve girdiyi iki yerde
 * tekrarlamak gerekmiyor.
 *
 * Yeniden üretmek için (Docker gerekir):
 *   docker run --rm -v .../shell-integration:/si:ro -v .../scratch:/sp:ro \
 *     alpine:3.21 sh -c 'apk add --no-cache zsh coreutils && \
 *     zsh /sp/escape-vectors.zsh /si/nterminal.zsh'
 */

interface Vector {
  label: string;
  input: string;
  escaped: string;
}

function vectors(): Vector[] {
  const text = readFileSync(
    join(process.cwd(), "src/lib/fixtures/zshEscape.tsv"),
    "utf8",
  );
  const out: Vector[] = [];
  for (const line of text.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    // Kaçışlı sütunda sekme YOK (her denetim karakteri \xNN oluyor), bu yüzden
    // satır bazlı ayırma güvenli.
    const [label, b64, ...rest] = line.split("\t");
    if (!label || b64 === undefined) continue;
    out.push({
      label,
      input: Buffer.from(b64, "base64").toString("utf8"),
      escaped: rest.join("\t"),
    });
  }
  return out;
}

const VECTORS = vectors();

describe("zsh kaçışı", () => {
  it("sınama verisi okunabildi", () => {
    // Dosya boş/bozuk gelirse aşağıdaki döngü hiçbir şey doğrulamaz.
    expect(VECTORS.length, "sınama verisi boş").toBeGreaterThanOrEqual(15);
  });

  it("her vektör geri çözülüyor", () => {
    const bad: string[] = [];
    for (const v of VECTORS) {
      const back = unescapeOsc(v.escaped);
      if (back !== v.input) {
        bad.push(
          `${v.label}: beklenen ${JSON.stringify(v.input)}, ` +
            `çözülen ${JSON.stringify(back)} (kaçışlı: ${JSON.stringify(v.escaped)})`,
        );
      }
    }
    expect(bad, bad.join("\n")).toEqual([]);
  });

  it("ayırıcı karakter kaçışlı çıktıda kalmıyor", () => {
    // OSC yükünde `;` ayırıcı: kaçmadan kalırsa komut metni ortadan bölünür.
    const leaked = VECTORS.filter((v) => v.input.includes(";") && v.escaped.includes(";"));
    expect(leaked.map((v) => v.label), "';' kaçırılmamış").toEqual([]);
  });

  it("denetim karakteri kaçışlı çıktıda kalmıyor", () => {
    // Kaçmayan bir ESC, arayüze giden diziyi bozar (OSC'nin içinde yeni bir
    // dizi başlatır).
    /* eslint-disable-next-line no-control-regex */
    const CONTROL = /[\x00-\x1f\x7f]/;
    const leaked = VECTORS.filter((v) => CONTROL.test(v.escaped));
    expect(leaked.map((v) => v.label), "denetim karakteri kaçırılmamış").toEqual([]);
  });

  it("önceden kaçışlı görünen metin iki kez çözülmüyor", () => {
    // Kullanıcı gerçekten `echo \x3B` yazdıysa geri çözüm `;` vermemeli.
    const v = VECTORS.find((x) => x.label === "onceden_kacisli");
    expect(v, "onceden_kacisli vektörü yok").toBeTruthy();
    expect(unescapeOsc(v!.escaped)).toBe("echo \\x3B");
  });

  it("zsh çıktısı bash ile aynı kuralı üretiyor", () => {
    // İki betik tek ayrıştırıcıya konuşuyor; kural farklılaşırsa biri
    // sessizce bozuk metin gönderir. Sabit bir örnekle sabitliyoruz.
    const v = VECTORS.find((x) => x.label === "her_kacis")!;
    expect(v.escaped).toBe("\\\\\\x3B\\x0A\\x0D\\x1B\\x07");
  });
});
