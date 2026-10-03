import { describe, expect, it } from "vitest";

import {
  appendChange,
  applyChange,
  compareLines,
  countChanges,
  diffTexts,
  foldGap,
  foldRanges,
  innerFragments,
  splitLines,
  transferLine,
  unchangedGaps,
  type LineChange,
} from "./textDiff";

/**
 * Fark penceresinin motoru.
 *
 * Penceredeki her şey — renkli bloklar, ortadaki bağlayıcılar, eş zamanlı
 * kaydırma, `»` ile bloğu geri alma — buradaki aralıklara dayanıyor. Bir
 * aralık bir satır kayarsa ekranda yanlış satır boyanır, kaydırma kayar ve en
 * kötüsü `»` dosyanın yanlış yerini yazar. O yüzden doğruluk rastgele girdilerle
 * de sınanıyor: elle yazılmış birkaç örnek, en kısa farkı bulamayan ya da
 * eşleşmeyen satırları "eşleşti" sayan bir hatayı kolayca kaçırıyor.
 */

const L = (...lines: string[]) => lines.join("\n");

/** Blokların özeti: `[start1, end1, start2, end2, kind]`. */
function blocks(changes: readonly LineChange[]) {
  return changes.map((c) => [c.start1, c.end1, c.start2, c.end2, c.kind]);
}

/** Bloklar arasındaki satırlar iki tarafta birebir aynı mı (fark GEÇERLİ mi)? */
function assertValid(a: string[], b: string[], changes: readonly LineChange[]) {
  let i = 0;
  let j = 0;
  for (const c of changes) {
    expect(c.start1 - i, "değişmemiş aralıklar eşit uzunlukta değil").toBe(c.start2 - j);
    for (; i < c.start1; i++, j++) expect(a[i]).toBe(b[j]);
    i = c.end1;
    j = c.end2;
  }
  expect(a.length - i).toBe(b.length - j);
  for (; i < a.length; i++, j++) expect(a[i]).toBe(b[j]);
}

/** En uzun ortak alt dizi — en kısa farkın ölçüsü (küçük girdiler için). */
function lcs(a: string[], b: string[]): number {
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

/** Basit, tekrarlanabilir rastgele sayı üreteci (mulberry32). */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomLines(next: () => number, n: number, alphabet: number): string[] {
  return Array.from({ length: n }, () => `satir ${Math.floor(next() * alphabet)}`);
}

describe("satır farkı", () => {
  it("aynı metinde blok yok", () => {
    expect(compareLines(["a", "b"], ["a", "b"], "none")).toEqual([]);
  });

  it("değiştirme, ekleme ve silme ayrı türler", () => {
    const changes = compareLines(["a", "b", "c", "d"], ["a", "B", "c", "x", "d"], "none");
    expect(blocks(changes)).toEqual([
      [1, 2, 1, 2, "modified"],
      [3, 3, 3, 4, "inserted"],
    ]);
    const silme = compareLines(["a", "b", "c"], ["a", "c"], "none");
    expect(blocks(silme)).toEqual([[1, 2, 1, 1, "deleted"]]);
  });

  it("boş aralığın konumu bloğun düştüğü yer", () => {
    // Ekleme solda iki satırın ARASINA düşüyor: `start1` sonraki satır.
    const [c] = compareLines(["a", "c"], ["a", "b", "c"], "none");
    expect([c.start1, c.end1]).toEqual([1, 1]);
  });

  it("sonda satır sonu farkı son boş satır olarak görünüyor", () => {
    // "a\nb" ile "a\nb\n": IntelliJ'de ikincisinin sonunda boş bir 3. satır var.
    const d = diffTexts("a\nb", "a\nb\n", { ignore: "none", highlight: "words" });
    expect(blocks(d.changes)).toEqual([[2, 2, 2, 3, "inserted"]]);
  });

  it("\\r\\n ile \\n aynı satır ayırıcısı", () => {
    expect(splitLines("a\r\nb\rc\nd")).toEqual(["a", "b", "c", "d"]);
    const d = diffTexts("a\r\nb\r\n", "a\nb\n", { ignore: "none", highlight: "words" });
    expect(d.changes).toEqual([]);
  });

  it("rastgele girdide fark geçerli ve EN KISA", () => {
    // Üç yüz deneme: küçük alfabe çok sayıda eşit satır ve belirsiz eşleşme
    // demek — Myers'ın köşegen hesabındaki bir kayma tam burada çıkıyor.
    const next = rng(7);
    for (let deneme = 0; deneme < 300; deneme++) {
      const a = randomLines(next, Math.floor(next() * 30), 5);
      const b = randomLines(next, Math.floor(next() * 30), 5);
      const changes = compareLines(a, b, "none");
      assertValid(a, b, changes);
      const silinen = changes.reduce((s, c) => s + c.end1 - c.start1, 0);
      const eklenen = changes.reduce((s, c) => s + c.end2 - c.start2, 0);
      const ortak = lcs(a, b);
      expect(silinen, `deneme ${deneme}: fark en kısa değil`).toBe(a.length - ortak);
      expect(eklenen).toBe(b.length - ortak);
    }
  });

  it("büyük ve tamamen farklı dosyada da bitiyor ve geçerli kalıyor", () => {
    // "Çok pahalı" sınırı: sınırsız Myers burada yüz milyonlarca adım atardı.
    const next = rng(11);
    const a = randomLines(next, 6000, 3000);
    const b = randomLines(next, 6000, 3000);
    const t0 = performance.now();
    const changes = compareLines(a, b, "none");
    expect(performance.now() - t0).toBeLessThan(5000);
    assertValid(a, b, changes);
  });

  it("araya eklenen işlev boş satırla bitiyor, öncekinin `}` satırını almıyor", () => {
    // git'in girinti sezgisi. En kısa fark iki türlü: "}\n\nfunction b() {…"
    // ya da "function b() {…}\n\n". Okunan doğrusu ikincisi.
    const eski = ["function a() {", "  return 1;", "}", "", "function c() {", "  return 3;", "}"];
    const yeni = [
      "function a() {",
      "  return 1;",
      "}",
      "",
      "function b() {",
      "  return 2;",
      "}",
      "",
      "function c() {",
      "  return 3;",
      "}",
    ];
    const [c] = compareLines(eski, yeni, "none");
    expect(yeni.slice(c.start2, c.end2)).toEqual(["function b() {", "  return 2;", "}", ""]);
  });

  it("kayabilen blokta git'in girinti sezgisiyle AYNI konum", () => {
    // Yukarıdaki örneği ön ek kırpması zaten doğru çözüyor; bu ise çözmüyor.
    // ÖLÇÜLDÜ, gerçek git 2.x ile: `--no-indent-heuristic` bloğu boş satırla
    // BAŞLATIYOR ("\nfunction a() {…}"), varsayılan (sezgi açık) bloğu işlevle
    // başlatıp boş satırla bitiriyor ve dosyanın en üstüne koyuyor. Motor
    // ikincisini vermeli — kullanıcı aynı farkı terminalde `git diff` ile de
    // görüyor ve iki yerde iki ayrı blok görmemeli.
    const eski = ["function a() {", "  return 1;", "}", "function c() {", "  return 3;", "}"];
    const yeni = ["function a() {", "  return 1;", "}", "", ...eski];
    const [c] = compareLines(eski, yeni, "none");
    expect([c.start2, c.end2]).toEqual([0, 4]);
    expect(yeni.slice(c.start2, c.end2)).toEqual(["function a() {", "  return 1;", "}", ""]);
  });
});

describe("boşluk kipleri", () => {
  it("trim: yalnızca satır başı/sonu boşluğu yok sayılıyor", () => {
    expect(compareLines(["  a b  "], ["a b"], "trim")).toEqual([]);
    expect(compareLines(["a b"], ["a  b"], "trim")).toHaveLength(1);
  });

  it("whitespace: satırın içindeki boşluk da yok sayılıyor", () => {
    expect(compareLines(["a b"], ["a  b"], "whitespace")).toEqual([]);
    expect(compareLines(["a+b"], ["a + b"], "whitespace")).toEqual([]);
  });

  it("blankLines: yalnızca boş satır eklemek fark sayılmıyor ama hizada kalıyor", () => {
    const changes = compareLines(["a", "b"], ["a", "", "  ", "b"], "blankLines");
    expect(changes).toHaveLength(1);
    expect(changes[0].ignored).toBe(true);
    expect(countChanges(changes)).toBe(0);
    // Kaydırma eşlemesi yine iki satırlık farkı biliyor.
    expect(transferLine(changes, 1, true)).toBe(3);
  });
});

describe("iç parçalar", () => {
  it("değişen sözcük vurgulanıyor, gerisi değil", () => {
    const f = innerFragments("const y = 2;", "const y = 3;", "none");
    expect(f).toEqual([{ start1: 10, end1: 11, start2: 10, end2: 11 }]);
  });

  it("eklenen sözcüğün karşı tarafı boş bir nokta", () => {
    const [f] = innerFragments("foo bar", "foo baz bar", "none")!;
    expect(f.start1).toBe(f.end1);
    expect("foo baz bar".slice(f.start2, f.end2)).toBe("baz");
  });

  it("yalnızca boşlukla ayrılan parçalar tek parça", () => {
    const f = innerFragments("a b", "x y", "none")!;
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ start1: 0, end1: 3, start2: 0, end2: 3 });
  });

  it("boşluk kipinde yalnızca boşluğu değişen sözcük vurgulanmıyor", () => {
    expect(innerFragments("a  b", "a b", "whitespace")).toEqual([]);
    // Kip `none` iken iki boşluğun bire inmesi de bir fark.
    expect(innerFragments("a  b", "a b", "none")).toHaveLength(1);
  });

  it("karakter kipi sözcüğün içindeki harfi buluyor", () => {
    const [f] = innerFragments("color", "colour", "none", true)!;
    expect("colour".slice(f.start2, f.end2)).toBe("u");
    expect(f.start1).toBe(f.end1);
  });

  it("yalnızca DEĞİŞTİRİLMİŞ blokların iç parçası var", () => {
    const d = diffTexts(L("a", "b x"), L("a", "b y", "c"), { ignore: "none", highlight: "words" });
    const modified = d.changes.find((c) => c.kind === "modified")!;
    expect(modified.inner).not.toBeNull();
    const lines = diffTexts(L("a", "b x"), L("a", "b y"), { ignore: "none", highlight: "lines" });
    expect(lines.changes[0].inner).toBeNull();
  });

  it("split: aynı yerde kalan satır sonları bloğu bölüyor", () => {
    // IntelliJ'in örneği: "A\nB" → "A X\nB X" tek değil iki değişiklik.
    const d = diffTexts(L("A", "B"), L("A X", "B X"), { ignore: "none", highlight: "split" });
    expect(blocks(d.changes)).toEqual([
      [0, 1, 0, 1, "modified"],
      [1, 2, 1, 2, "modified"],
    ]);
    const words = diffTexts(L("A", "B"), L("A X", "B X"), { ignore: "none", highlight: "words" });
    expect(words.changes).toHaveLength(1);
  });
});

describe("katlama", () => {
  const eski = Array.from({ length: 40 }, (_, i) => `l${i}`);
  const yeni = eski.map((l, i) => (i === 20 ? "değişti" : l));
  const changes = compareLines(eski, yeni, "none");

  it("değişikliğin çevresinde bağlam kalıyor, gerisi katlanıyor", () => {
    expect(foldRanges(changes, 40, 40, 4)).toEqual([
      { start1: 0, end1: 16, start2: 0, end2: 16 },
      { start1: 25, end1: 40, start2: 25, end2: 40 },
    ]);
  });

  it("kısa aralık katlanmıyor", () => {
    const yakin = eski.map((l, i) => (i === 1 ? "x" : l));
    const f = foldRanges(compareLines(eski, yakin, "none"), 40, 40, 4);
    // Değişiklik ikinci satırda: üstte tek satır var, katlanacak bir şey yok.
    expect(f.every((fold) => fold.start1 > 1)).toBe(true);
  });

  it("değişiklik yoksa hiçbir şey katlanmıyor", () => {
    expect(foldRanges([], 40, 40, 4)).toEqual([]);
  });

  it("katlama kademeli açılıyor: 4, 8, 16 satır bağlam, sonra tümü", () => {
    // IntelliJ'in iç içe katlamaları: her tıklama bağlamı ikiye katlıyor.
    const gaps = unchangedGaps(changes, 40, 40);
    const alt = gaps[1]; // değişikliğin altındaki 19 satır (21..40)
    expect(foldGap(alt, 4)).toMatchObject({ start1: 25, end1: 40 });
    expect(foldGap(alt, 8)).toMatchObject({ start1: 29, end1: 40 });
    expect(foldGap(alt, 16)).toMatchObject({ start1: 37, end1: 40 });
    // 32 satır bağlam 19 satırlık aralığı aşıyor: katlanacak bir şey kalmadı.
    expect(foldGap(alt, 32)).toBeNull();
  });
});

describe("satır eşlemesi", () => {
  // a b c d   |   a X Y c d
  const changes = compareLines(["a", "b", "c", "d"], ["a", "X", "Y", "c", "d"], "none");

  it("değişmemiş satırlar kayma kadar ilerliyor", () => {
    expect(transferLine(changes, 0, true)).toBe(0);
    expect(transferLine(changes, 2, true)).toBe(3);
    expect(transferLine(changes, 3, false)).toBe(2);
  });

  it("bloğun içinde birebir, karşı bloğun sonunda duruyor", () => {
    // IntelliJ'in `transferLine`ı: oran değil satır satır; kısa taraf kendi
    // bloğunun sonunda bekliyor (sağdaki iki satırlık bloğun karşısında soldaki
    // tek satır).
    expect(transferLine(changes, 1.5, true)).toBe(1.5);
    expect(transferLine(changes, 2.5, false)).toBe(2);
  });
});

describe("bloğu uygula (»)", () => {
  /** Bütün blokları (sondan başa) uygulamak sağ metni sola eşitlemeli. */
  function applyAll(left: string, right: string): string {
    const d = diffTexts(left, right, { ignore: "none", highlight: "lines" });
    let out = right;
    for (const change of [...d.changes].reverse()) out = applyChange(out, d.lines1, change);
    return out;
  }

  it("tek bloğu soldakine çeviriyor, dosyanın gerisine dokunmuyor", () => {
    const d = diffTexts(L("a", "b", "c"), L("a", "B", "c", "x"), { ignore: "none", highlight: "lines" });
    expect(applyChange(L("a", "B", "c", "x"), d.lines1, d.changes[0])).toBe(L("a", "b", "c", "x"));
  });

  it("son satırları silerken öncekinin satır sonu da gidiyor", () => {
    expect(applyAll(L("a", "b"), L("a", "b", "c"))).toBe(L("a", "b"));
  });

  it("Ctrl ile `»`: soldaki satırlar bloğun ARKASINA ekleniyor (Append)", () => {
    const d = diffTexts(L("a", "b", "c"), L("a", "B", "c"), { ignore: "none", highlight: "lines" });
    expect(appendChange(L("a", "B", "c"), d.lines1, d.changes[0])).toBe(L("a", "B", "b", "c"));
  });

  it("satır sonları \\r\\n kalıyor", () => {
    expect(applyAll("a\nb\nc\n", "a\r\nX\r\nc\r\nd\r\n")).toBe("a\r\nb\r\nc\r\n");
  });

  it("rastgele girdide bütün bloklar uygulanınca sol metin çıkıyor", () => {
    const next = rng(3);
    for (let deneme = 0; deneme < 200; deneme++) {
      const a = randomLines(next, Math.floor(next() * 12), 4).join("\n") + (next() < 0.5 ? "\n" : "");
      const b = randomLines(next, Math.floor(next() * 12), 4).join("\n") + (next() < 0.5 ? "\n" : "");
      expect(applyAll(a, b), `deneme ${deneme}`).toBe(a);
    }
  });
});
