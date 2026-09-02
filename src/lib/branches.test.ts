import { describe, expect, it } from "vitest";

import { checkoutCommand, filterBranches } from "./branches";
import type { GitBranch } from "../types";

const yerel = (name: string): GitBranch => ({ name, remote: null });
const uzak = (name: string, remote = "origin"): GitBranch => ({ name, remote });

describe("dal geçiş komutu", () => {
  it("yerel dal düz checkout", () => {
    expect(checkoutCommand(yerel("main"))).toBe("git checkout main");
  });

  it("uzak dal izleme dalı kurarak geçiyor", () => {
    // Bildirilen hata: fetch ile gelen dal listede yoktu. Şimdi var ve
    // seçilince ne olduğu komutun kendisinde okunuyor.
    expect(checkoutCommand(uzak("yeni-ozellik"))).toBe(
      "git checkout --track origin/yeni-ozellik",
    );
    expect(checkoutCommand(uzak("dev", "upstream"))).toBe("git checkout --track upstream/dev");
  });
});

describe("dal araması", () => {
  const liste = [yerel("main"), uzak("feature/api-v2"), yerel("Fix-Login")];

  it("boş aramada hepsi, sıra korunuyor", () => {
    expect(filterBranches(liste, "  ")).toEqual(liste);
  });

  it("ada göre, büyük/küçük harf gözetmeden, içeren eşleşme", () => {
    expect(filterBranches(liste, "API")).toEqual([uzak("feature/api-v2")]);
    expect(filterBranches(liste, "login")).toEqual([yerel("Fix-Login")]);
  });

  it("uzağın adıyla da bulunuyor", () => {
    expect(filterBranches(liste, "origin")).toEqual([uzak("feature/api-v2")]);
  });
});
