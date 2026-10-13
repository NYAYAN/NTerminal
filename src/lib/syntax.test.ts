import { createJavaScriptRegexEngine } from "@shikijs/engine-javascript";
import { createShikiPrimitiveAsync } from "@shikijs/primitive";
import { INITIAL, type IGrammar, type StateStack } from "@shikijs/primitive/textmate";
import { describe, expect, it } from "vitest";

import { carryTokens, SyntaxSession, type SyntaxHost } from "./syntax";
import { LINE_ATTEMPTS, LINE_TIME_LIMIT, SyntaxDocument, type LineTokens } from "./syntaxDocument";
import { GRAMMARS } from "./syntaxGrammars";
import { syntaxLanguage } from "./syntaxLanguages";
import { CLASSIFIER_THEME, classTable, SYNTAX_CLASSES } from "./syntaxScopes";
import { createSyntaxService, type SyntaxReply, type SyntaxRequest } from "./syntaxService";

/*
 * Sözdizimi renklendirmesi.
 *
 * İSTEK: "Dosyaları açtığımda kodları renkli göstermek mümkün mü? VS Code'da,
 * IntelliJ'de, WebStorm'da nasıl oluyorsa öyle." Gramerler VS Code'un kendileri;
 * burada bağlı olan, onların BİZİM tarafımızda doğru kullanılması:
 *
 * - kapsamlardan sınıflara eşleme (anahtar sözcük, dize, işlev, tür...),
 * - artımlı renklendirmenin baştan renklendirmeyle AYNI sonucu vermesi,
 * - iş parçacığının geciken yanıtının, o arada yazılan satırları bozmaması.
 */

const shiki = createShikiPrimitiveAsync({
  themes: [CLASSIFIER_THEME],
  langs: [],
  engine: createJavaScriptRegexEngine({ forgiving: true }),
});

/**
 * Satırın süre sınırı YOK (vscode-textmate'te 0). Uygulamanın sınırı gerçek
 * saate bakıyor: makine yüklüyken satırı yarıda bırakıp buradaki sınıf
 * beklentilerini düşürüyordu (bkz. "TypeScript: VS Code'un ayrımları").
 * Sınırın kendisi "satırın süre sınırı"nda, gerçek saat olmadan sınanıyor.
 */
const NO_LIMIT = 0;

async function grammar(lang: string) {
  const s = await shiki;
  await s.loadLanguage((await GRAMMARS[lang]()).default);
  return { grammar: s.getLanguage(lang), classOf: classTable(s.setTheme(CLASSIFIER_THEME.name!).colorMap) };
}

/** Belgenin bütün satırlarının belirteçleri (bekleyen iş bitene kadar). */
function tokenizeAll(doc: SyntaxDocument): LineTokens[] {
  const out: LineTokens[] = new Array(doc.lineCount).fill([]);
  while (doc.pending) {
    for (const chunk of doc.work(Number.POSITIVE_INFINITY)) {
      chunk.tokens.forEach((t, k) => (out[chunk.start + k] = t));
    }
  }
  return out;
}

/** `[metin, sınıf]` çiftleri; düz metin atlanıyor. Okunur beklentiler için. */
function classified(line: string, tokens: LineTokens): [string, string][] {
  const out: [string, string][] = [];
  for (let k = 0; k < tokens.length; k += 2) {
    const cls = SYNTAX_CLASSES[tokens[k + 1]];
    const end = k + 2 < tokens.length ? tokens[k + 2] : line.length;
    const text = line.slice(tokens[k], end).trim();
    if (cls && text) out.push([text, cls]);
  }
  return out;
}

async function classify(lang: string, source: string): Promise<[string, string][][]> {
  const { grammar: g, classOf } = await grammar(lang);
  const lines = source.split("\n");
  const doc = new SyntaxDocument(g, classOf, lines, NO_LIMIT);
  return tokenizeAll(doc).map((t, i) => classified(lines[i], t));
}

describe("dosya adından dil", () => {
  it("yaygın türler ve uzantısız adlar", () => {
    expect(syntaxLanguage("/depo/src/App.tsx")).toBe("tsx");
    expect(syntaxLanguage("C:\\depo\\main.rs")).toBe("rust");
    expect(syntaxLanguage("/depo/Dockerfile")).toBe("docker");
    expect(syntaxLanguage("/depo/.env.local")).toBe("dotenv");
    expect(syntaxLanguage("/depo/profile.PS1")).toBe("powershell");
    expect(syntaxLanguage("/home/u/.bashrc")).toBe("shellscript");
  });

  it("tanınmayan dosya düz metin: yanlış gramerle boyamaktan iyi", () => {
    expect(syntaxLanguage("/depo/notlar.txt")).toBe(null);
    expect(syntaxLanguage("/depo/README")).toBe(null);
    expect(syntaxLanguage("/depo/.gitignore")).toBe(null);
  });

  it("eşlemedeki her dilin bir grameri var", async () => {
    // `syntaxLanguages.ts` ile `syntaxGrammars.ts` iki ayrı tablo; biri
    // güncellenip öbürü unutulursa o dildeki dosyalar sessizce düz kalırdı.
    const source = await import("node:fs").then((fs) =>
      fs.readFileSync(new URL("./syntaxLanguages.ts", import.meta.url), "utf8"),
    );
    const used = new Set([...source.matchAll(/:\s*"([a-z0-9-]+)"/g)].map((m) => m[1]));
    for (const lang of used) expect(GRAMMARS[lang], lang).toBeTypeOf("function");
  });
});

describe("kapsamdan sınıfa", () => {
  it("TypeScript: VS Code'un ayrımları", async () => {
    // KIRILGANDI (2026-10-13 ölçüldü): tam takımda 3 koşunun 1'inde düştü,
    // gelen dizide 13 yerine 10 öğe vardı: `return`den sonrası (`fetch`,
    // `"x"`, `42`) düzdü. Sebep satırın süre sınırı (500 ms): bu, dosyada
    // renklendirilen İLK satır ve süreye ifadelerin ilk derlenmesi giriyor.
    // Tek başına 262–421 ms (6 koşu). Ölçümlü 3 tam takım koşusunun üçünde de
    // ilk deneme kesildi (535–544 ms); tek yeniden deneme birinde 504 ms'de
    // yine kesildi (satırın sonuna denk geldi, geçti). Saat sahte yapılıp iki
    // deneme 30 tarama adımının 15'incisinde kesilince düşüşteki fark birebir
    // çıktı; 24'üncü adımdan önce kesilen her deneme bu testi düşürüyor.
    // Sınıflar artık süre sınırı olmadan (`NO_LIMIT`); sınırın davranışı
    // "satırın süre sınırı"nda.
    const [decl, call, comment] = await classify(
      "typescript",
      ['export function load(path: string): Promise<number> { return fetch("x", 42); }', "load(p);", "// açıklama"].join(
        "\n",
      ),
    );
    expect(decl).toEqual(
      expect.arrayContaining([
        ["export", "control"],
        ["function", "keyword"],
        ["load", "function"],
        ["path", "param"],
        ["string", "type"],
        ["Promise", "type"],
        ["number", "type"],
        ["return", "control"],
        ["fetch", "function"],
        ['"x"', "string"],
        ["42", "number"],
      ]),
    );
    expect(call).toEqual(expect.arrayContaining([["load", "function"]]));
    expect(comment).toEqual([["// açıklama", "comment"]]);
  });

  it("şablon dizesinin içindeki ifade dize renginde DEĞİL", async () => {
    // `meta.template.expression` düz: `${…}` kendi belirteçleriyle boyanıyor.
    const [line] = await classify("typescript", "const s = `a ${count} b`;");
    expect(line).toEqual(expect.arrayContaining([["count", "variable"], ["${", "keyword"]]));
  });

  it("veri dilleri: JSON anahtarı, YAML anahtarı, CSS özelliği", async () => {
    const [json] = await classify("json", '{ "ad": "değer", "n": 3, "ok": true }');
    expect(json).toEqual(
      expect.arrayContaining([
        ['"ad"', "property"],
        ['"değer"', "string"],
        ["3", "number"],
        ["true", "constant"],
      ]),
    );
    const [yaml] = await classify("yaml", "name: deploy # not");
    expect(yaml).toEqual(expect.arrayContaining([["name", "property"], ["deploy", "string"], ["# not", "comment"]]));
    const [css] = await classify("css", ".kutu { color: #fff; margin: 4px; }");
    expect(css).toEqual(
      expect.arrayContaining([
        [".kutu", "attr"],
        ["color", "property"],
        ["#fff", "string"],
        ["4px", "number"],
      ]),
    );
  });

  it("Markdown başlığı, PowerShell değişkeni, Python tanımı", async () => {
    const [md] = await classify("markdown", "# Başlık");
    expect(md.map(([, c]) => c)).toContain("heading");
    const [ps] = await classify("powershell", "$yol = Get-ChildItem -Path C:\\");
    expect(ps).toEqual(expect.arrayContaining([["Get-ChildItem", "function"]]));
    expect(ps.find(([t]) => t.includes("yol"))?.[1]).toBe("variable");
    const [py] = await classify("python", "def topla(a, b):");
    expect(py).toEqual(expect.arrayContaining([["def", "keyword"], ["topla", "function"]]));
  });

  it("çok satırlı yorum sonraki satırları da boyuyor; kapanınca bitiyor", async () => {
    const lines = await classify("typescript", "/* bir\niki\nüç */ const x = 1;");
    expect(lines[1]).toEqual([["iki", "comment"]]);
    expect(lines[2]).toEqual(expect.arrayContaining([["const", "keyword"]]));
  });

  it("her gramer yükleniyor ve bir satırı renklendiriyor", { timeout: 120_000 }, async () => {
    // JavaScript'in düzenli ifade motoru Oniguruma'nın her kalıbını
    // çeviremiyor; çeviremediği bir dil hatayla değil düz metinle sonuçlanmalı.
    // Süre sınırı yok: satır yarıda kesilirse kalanının kalıpları hiç
    // denenmezdi (C++'ın ilk satırı tam takımda iki denemede de kesiliyordu).
    for (const lang of Object.keys(GRAMMARS)) {
      const { grammar: g, classOf } = await grammar(lang);
      const doc = new SyntaxDocument(g, classOf, ["abc = 1 # x // y", ""], NO_LIMIT);
      expect(() => tokenizeAll(doc), lang).not.toThrow();
    }
  });
});

/*
 * Artımlı renklendirme baştan renklendirmeyle aynı olmalı.
 *
 * Düzenleme yalnızca değişen satırdan itibaren, bitiş durumu eskisine
 * kavuşana kadar yeniden renklendiriyor. Bu kısayolun bir hatası (durumu
 * kaydırmamak, silinen satırın ardını kirletmemek) ekranda "yorum kapanmış
 * ama satırlar hâlâ gri" diye görünür. Rastgele düzenlemelerden sonra her
 * satır sıfırdan renklendirmeyle karşılaştırılıyor.
 */
describe("artımlı renklendirme", () => {
  const SOURCE = [
    "import { a } from './a';",
    "",
    "export class Kutu<T> {",
    "  private items: T[] = [];",
    "  /** belge",
    "   * yorumu */",
    "  add(item: T): void {",
    "    const s = `x ${item} y`;",
    "    this.items.push(item);",
    "  }",
    "}",
    "const re = /a+b/g; // son",
  ];
  const FRAGMENTS = ["/*", "*/", "`", "${", "}", '"', "'", "// ", "x", "\n", "\n  if (a) {\n", ""];

  /** Tekrarlanabilir rastgelelik (her koşuda aynı düzenlemeler). */
  function random(seed: number) {
    let s = seed >>> 0;
    return () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 2 ** 32;
    };
  }

  it("400 rastgele düzenlemeden sonra her satır baştan renklendirmeyle aynı", async () => {
    const { grammar: g, classOf } = await grammar("typescript");
    const rnd = random(7);
    let text = SOURCE.join("\n");
    const doc = new SyntaxDocument(g, classOf, text.split("\n"), NO_LIMIT);
    let tokens = tokenizeAll(doc);

    for (let n = 0; n < 400; n++) {
      // Metin üzerinde rastgele bir yer ve parça; satır düzeyinde düzenlemeye çevir.
      // Arada bir de bütün bir satır siliniyor: ardından gelen satır değişmiyor,
      // yalnızca başladığı durum değişiyor (karakter düzeyindeki parçalar bunu
      // neredeyse hiç üretmiyordu — o yolu kıran bir hata ilk turda kaçtı).
      let next: string;
      const all = text.split("\n");
      if (rnd() < 0.15 && all.length > 1) {
        all.splice(Math.floor(rnd() * all.length), 1);
        next = all.join("\n");
      } else {
        const at = Math.floor(rnd() * (text.length + 1));
        const cut = rnd() < 0.4 ? Math.floor(rnd() * 6) : 0;
        const piece = FRAGMENTS[Math.floor(rnd() * FRAGMENTS.length)];
        next = text.slice(0, at) + piece + text.slice(Math.min(text.length, at + cut));
      }
      const before = text.split("\n");
      const after = next.split("\n");
      let start = 0;
      while (start < Math.min(before.length, after.length) && before[start] === after[start]) start++;
      let eb = before.length;
      let ea = after.length;
      while (eb > start && ea > start && before[eb - 1] === after[ea - 1]) {
        eb--;
        ea--;
      }
      doc.replace(start, eb - start, after.slice(start, ea));
      tokens = tokens.slice(0, start).concat(new Array(ea - start).fill([]), tokens.slice(eb));
      while (doc.pending) {
        for (const chunk of doc.work(Number.POSITIVE_INFINITY)) {
          chunk.tokens.forEach((t, k) => (tokens[chunk.start + k] = t));
        }
      }
      text = next;
    }

    const fresh = tokenizeAll(new SyntaxDocument(g, classOf, text.split("\n"), NO_LIMIT));
    expect(tokens).toEqual(fresh);
  });

  it("satır silinince alttaki satır, kendisi değişmese de yeniden renkleniyor", async () => {
    // Silinen satır bir yorum açıyordu: alttaki satır artık yorumun içinde değil.
    const { grammar: g, classOf } = await grammar("typescript");
    const doc = new SyntaxDocument(g, classOf, ["/* açık", "const a = 1;"], NO_LIMIT);
    const before = tokenizeAll(doc);
    expect(classified("const a = 1;", before[1])).toEqual([["const a = 1;", "comment"]]);
    doc.replace(0, 1, []);
    const after: LineTokens[] = [before[1]];
    while (doc.pending) {
      for (const chunk of doc.work(Number.POSITIVE_INFINITY)) {
        chunk.tokens.forEach((t, k) => (after[chunk.start + k] = t));
      }
    }
    expect(classified("const a = 1;", after[0])).toEqual(expect.arrayContaining([["const", "keyword"]]));
  });

  it("dilim süresi dolunca iş kaldığı yerden sürüyor", async () => {
    const { grammar: g, classOf } = await grammar("typescript");
    const lines = Array.from({ length: 300 }, (_, i) => `const v${i} = "${i}"; // ${i}`);
    const doc = new SyntaxDocument(g, classOf, lines, NO_LIMIT);
    // Süresi geçmiş bir dilim yine en az bir satır ilerliyor: iş hiç takılmıyor.
    const first = doc.work(0);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ start: 0 });
    expect(first[0].tokens).toHaveLength(1);
    const rest = tokenizeAll(doc);
    expect(rest.slice(1)).toEqual(tokenizeAll(new SyntaxDocument(g, classOf, lines, NO_LIMIT)).slice(1));
  });
});

/*
 * Satırın süre sınırı: uygulamanın davranışı, gerçek saat olmadan.
 *
 * Bir deneme `LINE_TIME_LIMIT` (500 ms). Süreye ifadelerin ilk derlenmesi de
 * giriyor; derlenen ifadeler kalıcı olduğundan süresi dolan satır, her deneme
 * öncekinden ileri gittikçe yeniden deneniyor (en çok `LINE_ATTEMPTS`). Tek
 * yeniden deneme yük altında yetmedi (bkz. "TypeScript: VS Code'un
 * ayrımları"). İlerlemeyen deneme ağır bir satır demek: bırakılıyor, yarım
 * belirteçler kalıyor, sonraki satır bu satırın BAŞINDAKİ durumdan.
 *
 * Gramer sahte: "süre doldu"yu ve satırda nereye kadar geldiğini kendisi
 * söylüyor; sonuç makinenin yüküne bağlı değil.
 */
describe("satırın süre sınırı", () => {
  const KEYWORD = SYNTAX_CLASSES.indexOf("keyword");
  const STRING = SYNTAX_CLASSES.indexOf("string");
  /** Renk kimliği sınıfın sırası. */
  const IDENTITY = Uint8Array.from(SYNTAX_CLASSES, (_, i) => i);
  const LINES = ["export const s = 1;", "x;"];

  interface Reply {
    stopped: boolean;
    /** Son belirtecin başı: deneme satırda buraya kadar geldi. */
    at: number;
    /** Bitiş durumunun adı; verilmezse `at`tan. */
    state?: string;
  }

  /** Her çağrıda sıradaki yanıt: baştan anahtar sözcük, `at`tan dize. */
  function scripted(replies: Reply[]) {
    const calls: { start: StateStack; limit: number | undefined }[] = [];
    const states = new Map<string, StateStack>();
    const state = (name: string): StateStack => {
      if (!states.has(name)) {
        const s = { equals: (other: StateStack) => other === s } as unknown as StateStack;
        states.set(name, s);
      }
      return states.get(name)!;
    };
    const grammar = {
      tokenizeLine2(_line: string, start: StateStack, limit?: number) {
        calls.push({ start, limit });
        const r = replies.shift();
        if (!r) throw new Error("beklenmeyen deneme");
        // Ön plan rengi 15. bitten (vscode-textmate `EncodedTokenMetadata`).
        return {
          tokens: Uint32Array.of(0, KEYWORD << 15, r.at, STRING << 15),
          ruleStack: state(r.state ?? `@${r.at}`),
          stoppedEarly: r.stopped,
        };
      },
    } as unknown as IGrammar;
    return { grammar, calls, state };
  }

  it("süresi dolan satır ilerledikçe yeniden deneniyor; biten denemenin belirteçleri ve durumu", () => {
    const { grammar, calls, state } = scripted([
      { stopped: true, at: 4 },
      { stopped: true, at: 9 },
      // Aynı yerde ama başka kuralda: yine ilerleme (bkz. `advanced`).
      { stopped: true, at: 9, state: "tür açıklamasında" },
      { stopped: false, at: 12, state: "satır sonu" },
      { stopped: false, at: 1 },
    ]);
    const [first] = tokenizeAll(new SyntaxDocument(grammar, IDENTITY, LINES));
    expect(first).toEqual([0, KEYWORD, 12, STRING]);
    // Hepsi satırın başındaki durumdan, uygulamanın sınırıyla.
    expect(calls.slice(0, 4).map((c) => c.start === INITIAL)).toEqual([true, true, true, true]);
    expect(calls.map((c) => c.limit)).toEqual(new Array(5).fill(LINE_TIME_LIMIT));
    // Sonraki satır biten denemenin bitişinden.
    expect(calls[4].start).toBe(state("satır sonu"));
  });

  it("ilerlemeyen denemede bırakılıyor: en ileri giden yarım sonuç, sonraki satır bu satırın başındaki durumdan", () => {
    // Aynı yerde aynı durumda: tek bir ifade ağır (süre bir ifadenin içini
    // kesemiyor). Geride: makine o an daha yüklü, önceki daha ileriydi.
    for (const again of [
      { stopped: true, at: 6 },
      { stopped: true, at: 3 },
    ]) {
      const { grammar, calls } = scripted([{ stopped: true, at: 6 }, again, { stopped: false, at: 1 }]);
      const [first] = tokenizeAll(new SyntaxDocument(grammar, IDENTITY, LINES));
      expect(calls, `ikinci denemenin son belirteci ${again.at}`).toHaveLength(3);
      expect(first).toEqual([0, KEYWORD, 6, STRING]);
      expect(calls[2].start).toBe(INITIAL);
    }
  });

  it("hep ilerleyip bitmeyen satır en çok LINE_ATTEMPTS kez deneniyor", () => {
    const { grammar, calls } = scripted(
      Array.from({ length: LINE_ATTEMPTS + 1 }, (_, i) => ({ stopped: true, at: i + 1 })),
    );
    const [first] = tokenizeAll(new SyntaxDocument(grammar, IDENTITY, LINES.slice(0, 1)));
    expect(calls).toHaveLength(LINE_ATTEMPTS);
    expect(first).toEqual([0, KEYWORD, LINE_ATTEMPTS, STRING]);
  });

  it("verilen sınır gramere aynen gidiyor: buradaki NO_LIMIT sınırsız demek", () => {
    const { grammar, calls } = scripted([{ stopped: false, at: 1 }]);
    tokenizeAll(new SyntaxDocument(grammar, IDENTITY, ["x;"], NO_LIMIT));
    expect(calls.map((c) => c.limit)).toEqual([0]);
  });
});

/**
 * Süreç içi renklendirici; yanıtlar iş parçacığındaki gibi SONRAKİ görevde.
 * Kendi motoru, yani ilk satırı soğuk (tam takımda 178–357 ms): süre sınırı yok.
 */
function inProcessHost(): SyntaxHost & { sent: SyntaxRequest[] } {
  let receive: (reply: SyntaxReply) => void = () => {};
  const handle = createSyntaxService(
    (reply) => setTimeout(() => receive(structuredClone(reply)), 0),
    undefined,
    NO_LIMIT,
  );
  const sent: SyntaxRequest[] = [];
  return {
    sent,
    post: (request) => {
      sent.push(request);
      handle(structuredClone(request));
    },
    listen: (fn) => {
      receive = fn;
    },
  };
}

async function until(check: () => boolean, ms = 10_000) {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error("zaman aşımı");
    await new Promise((r) => setTimeout(r, 5));
  }
}

describe("ana pencere oturumu", () => {
  it("geciken yanıt o arada eklenen satırların altına kayıyor, değişen satırınki atılıyor", () => {
    const posted: SyntaxRequest[] = [];
    const host: SyntaxHost = { post: (r) => posted.push(r), listen: () => {} };
    const session = new SyntaxSession("/a.ts", "typescript", ["a", "b", "c"], host, () => {});
    // Kullanıcı 0. satırın önüne iki satır ekledi ve "b"yi değiştirdi;
    // iş parçacığı henüz bunları görmedi (sürüm 0'ın yanıtı geliyor).
    session.sync(["x", "y", "a", "b", "c"]);
    session.sync(["x", "y", "a", "B", "c"]);
    const A = [0, 2];
    const B = [0, 4];
    const C = [0, 5];
    session.receive({ type: "tokens", doc: session.id, version: 0, chunks: [{ start: 0, tokens: [A, B, C] }] });
    expect(session.tokens[2]).toBe(A);
    expect(session.tokens[3], "değişen satırın eski belirteçleri yeni metne uymaz").not.toBe(B);
    expect(session.tokens[4]).toBe(C);
    session.flush();
    expect(posted.map((r) => r.type)).toEqual(["open", "edit", "edit"]);
  });

  it("satır eklemek alttaki satırların anahtarını değiştirmiyor", () => {
    const host: SyntaxHost = { post: () => {}, listen: () => {} };
    const session = new SyntaxSession("/a.ts", "typescript", ["a", "b", "c"], host, () => {});
    const [ka, kb, kc] = session.keys;
    session.sync(["a", "b1", "b2", "c"]);
    // "b" bölündü: ilk yarısı anahtarını korudu, ikinci yarı yeni anahtar aldı.
    expect(session.keys[0]).toBe(ka);
    expect(session.keys[1]).toBe(kb);
    expect(session.keys[3]).toBe(kc);
    expect(new Set(session.keys).size).toBe(4);
  });

  it("gerçek renklendiriciyle uçtan uca: aç, yaz, kapat", async () => {
    const host = inProcessHost();
    let changes = 0;
    const session = new SyntaxSession("/a.ts", "typescript", ["const a = 1;", "let b;"], host, () => changes++);
    host.listen((reply) => session.receive(reply));
    await until(() => session.tokens.every((t) => t !== undefined));
    expect(classified("const a = 1;", session.tokens[0]!)).toEqual(
      expect.arrayContaining([["const", "keyword"], ["1", "number"]]),
    );
    // Satırın başına yorum açılıyor: alttaki satır da yoruma dönmeli.
    session.sync(["/* const a = 1;", "let b;"]);
    session.flush();
    await until(() => SYNTAX_CLASSES[session.tokens[1]?.[1] ?? 0] === "comment");
    expect(changes).toBeGreaterThan(1);
    session.close();
    expect(host.sent.at(-1)).toEqual({ type: "close", doc: session.id });
  });

  it("dili yüklenemeyen belge düz metin kalıyor ve bunu bildiriyor", async () => {
    const host = inProcessHost();
    const session = new SyntaxSession("/a.xyz", "olmayan-dil", ["a"], host, () => {});
    host.listen((reply) => session.receive(reply));
    await until(() => session.failed);
    expect(session.tokens).toEqual([undefined]);
  });
});

describe("yazarken renklerin taşınması", () => {
  // `const ad = "x";` → const(anahtar) ad(değişken) "x"(dize)
  const LINE = 'const ad = "x";';
  const T: LineTokens = [0, 2, 5, 0, 6, 9, 8, 0, 11, 4, 14, 0];
  const cls = (line: string, tokens: LineTokens | undefined) => classified(line, tokens ?? []);

  it("sözcüğün sonuna eklenen harf o sözcüğün renginde", () => {
    const [next] = carryTokens([LINE], [T], ['const adi = "x";']);
    expect(cls('const adi = "x";', next)).toEqual([
      ["const", "keyword"],
      ["adi", "variable"],
      ['"x"', "string"],
    ]);
  });

  it("satır bölününce ikinci yarı kendi renkleriyle yeni satıra", () => {
    const [a, b] = carryTokens([LINE], [T], ["const ad =", '  "x";']);
    expect(cls("const ad =", a)).toEqual([
      ["const", "keyword"],
      ["ad", "variable"],
    ]);
    expect(cls('  "x";', b)).toEqual([['"x"', "string"]]);
  });

  it("satırlar birleşince baş birinciden, son ikinciden", () => {
    const [joined] = carryTokens(["const ad =", '  "x";'], [[0, 2, 5, 0, 6, 9, 8, 0], [0, 0, 2, 4, 5, 0]], [
      'const ad =  "x";',
    ]);
    expect(cls('const ad =  "x";', joined)).toEqual([
      ["const", "keyword"],
      ["ad", "variable"],
      ['"x"', "string"],
    ]);
  });

  it("belirteci hiç gelmemiş satır tahmin edilmiyor", () => {
    expect(carryTokens(["a"], [undefined], ["ab"])).toEqual([undefined]);
  });
});
