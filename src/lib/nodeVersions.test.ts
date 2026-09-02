import { describe, expect, it } from "vitest";

import { filterVersions, useNodeCommand } from "./nodeVersions";

describe("node sürüm geçiş komutu", () => {
  it("nvm-windows düz use", () => {
    // Bağ makine geneli; tek komut yetiyor.
    expect(useNodeCommand("nvm-windows", "24.11.1")).toBe("nvm use 24.11.1");
  });

  it("nvm.sh varsayılanı da değiştiriyor", () => {
    // `nvm use` tek başına yalnızca o kabukta geçerli; rozet varsayılanı
    // okuduğu için değişmezdi ve yeni sekme eski sürümle açılırdı.
    expect(useNodeCommand("nvm", "22.11.0")).toBe(
      "nvm alias default 22.11.0 && nvm use 22.11.0",
    );
  });
});

describe("sürüm araması", () => {
  const liste = ["24.18.0", "24.11.1", "22.11.0", "18.20.4"];

  it("boş aramada hepsi, sıra korunuyor", () => {
    expect(filterVersions(liste, " ")).toEqual(liste);
  });

  it("içeren eşleşme; baştaki v yok sayılıyor", () => {
    expect(filterVersions(liste, "24")).toEqual(["24.18.0", "24.11.1"]);
    expect(filterVersions(liste, "v22")).toEqual(["22.11.0"]);
    expect(filterVersions(liste, ".20.")).toEqual(["18.20.4"]);
  });
});
