import { describe, expect, it } from "vitest";

import { treeMarks } from "./treeMarks";

/*
 * Dosya ağacının git işaretleri.
 *
 * İSTEK: "Dosyalar kısmında değişiklik olan dosyaları da anlamalıyım." Git
 * yolları depo köküne göre, ağaç sekmenin dizininden başlıyor; kayma olursa
 * yanlış dosya işaretlenir ya da hiçbiri — ikisi de "değişiklik yok" demekle
 * aynı yanıltıcılıkta.
 */

const change = (status: string, path: string) => ({ status, path });

describe("ağacın git işaretleri", () => {
  it("dosya kendi durumuyla, üst klasörleri de işaretli", () => {
    const marks = treeMarks([change(" M", "src/lib/a.ts"), change("??", "yeni.md")], "C:/depo", "C:/depo");
    expect([...marks.files]).toEqual([
      ["src/lib/a.ts", " M"],
      ["yeni.md", "??"],
    ]);
    expect([...marks.dirs]).toEqual([
      ["src", "mod"],
      ["src/lib", "mod"],
    ]);
  });

  it("sekme depo kökünün ALTINDAYSA yollar ağacın köküne göre; dışı düşüyor", () => {
    const marks = treeMarks(
      [change(" M", "src/lib/a.ts"), change(" M", "docs/b.md")],
      "C:/depo",
      "C:\\depo\\src",
    );
    expect([...marks.files]).toEqual([["lib/a.ts", " M"]]);
    expect([...marks.dirs]).toEqual([["lib", "mod"]]);
  });

  it("yalnızca yeni dosya olan klasör yeşil; bir değişen varsa sarı (değişti baskın)", () => {
    const marks = treeMarks(
      [change("??", "yeni/a.ts"), change("A ", "yeni/b.ts"), change("??", "karisik/c.ts"), change(" M", "karisik/d.ts")],
      "/depo",
      "/depo",
    );
    expect(marks.dirs.get("yeni")).toBe("new");
    expect(marks.dirs.get("karisik")).toBe("mod");
    // Sıra tersine de aynı sonuç: önce değişen sonra yeni.
    const ters = treeMarks([change(" M", "k/d.ts"), change("??", "k/c.ts")], "/depo", "/depo");
    expect(ters.dirs.get("k")).toBe("mod");
  });

  it("silinen dosya ağaçta yok ama klasörü değişmiş sayılıyor", () => {
    const marks = treeMarks([change(" D", "src/eski.ts")], "/depo", "/depo");
    expect(marks.files.size).toBe(0);
    expect(marks.dirs.get("src")).toBe("mod");
  });

  it("yeniden adlandırılan dosya yeni adıyla", () => {
    const marks = treeMarks([{ status: "R ", path: "src/yeni.ts", origPath: "src/eski.ts" }], "/depo", "/depo");
    expect([...marks.files]).toEqual([["src/yeni.ts", "R "]]);
    expect(marks.dirs.get("src")).toBe("new");
  });
});
