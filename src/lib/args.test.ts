import { describe, expect, it } from "vitest";

import { formatArgs, parseArgs, sameArgs } from "./args";

/**
 * Profil argümanları kutusu.
 *
 * ÖLÇÜLEN HATA: kutuya "-l -i" yazmak "-l-i" üretiyordu. Kutu her tuşta
 * metni boşluktan bölüp boşları atıyor ve diziyi geri birleştirip kutuya
 * yazıyordu; sondaki boşluk o turda kayboluyordu. Boşluk içeren bir argüman
 * (`C:\Program Files\...`) hiç yazılamıyordu.
 */
describe("argüman ayrıştırma", () => {
  it("boşluktan bölüyor, fazla boşluğu yok sayıyor", () => {
    expect(parseArgs("-l   -i")).toEqual(["-l", "-i"]);
    expect(parseArgs("  -NoLogo  ")).toEqual(["-NoLogo"]);
    expect(parseArgs("")).toEqual([]);
  });

  it("yazarken sondaki boşluk yeni bir argüman AÇMIYOR ama kaybolmuyor", () => {
    // Dizi aynı kalıyor; metnin kendisi kutuda (ArgsInput) korunuyor.
    expect(parseArgs("-l ")).toEqual(["-l"]);
    expect(parseArgs("-l -")).toEqual(["-l", "-"]);
  });

  it("tırnak içi tek argüman", () => {
    expect(parseArgs('-File "C:\\Program Files\\x.ps1"')).toEqual([
      "-File",
      "C:\\Program Files\\x.ps1",
    ]);
    expect(parseArgs("-c 'echo hi'")).toEqual(["-c", "echo hi"]);
  });

  it("ters bölü kaçış değil: Windows yolu olduğu gibi", () => {
    expect(parseArgs("C:\\Users\\x")).toEqual(["C:\\Users\\x"]);
  });

  it("boş tırnak boş bir argüman", () => {
    expect(parseArgs('-c ""')).toEqual(["-c", ""]);
  });

  it("kapanmamış tırnak yazarken ara hâl: içerik yine argüman", () => {
    expect(parseArgs('"C:\\Program Fi')).toEqual(["C:\\Program Fi"]);
  });
});

describe("argümanları kutuya yazma", () => {
  it("gidiş-dönüş aynı", () => {
    for (const args of [
      ["-l"],
      ["-NoLogo", "-NoExit"],
      ["-File", "C:\\Program Files\\x.ps1"],
      ["-c", 'say "hi"'],
      ["-c", ""],
    ]) {
      expect(parseArgs(formatArgs(args)), JSON.stringify(args)).toEqual(args);
    }
  });

  it("yalnızca gereken tırnaklanıyor", () => {
    expect(formatArgs(["-l", "-i"])).toBe("-l -i");
    expect(formatArgs(["a b"])).toBe('"a b"');
  });

  it("dizi karşılaştırması", () => {
    expect(sameArgs(["-l"], ["-l"])).toBe(true);
    expect(sameArgs(["-l"], ["-l", "-i"])).toBe(false);
    expect(sameArgs(["-l"], ["-i"])).toBe(false);
  });
});
