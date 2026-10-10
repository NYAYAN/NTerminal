import { describe, expect, it } from "vitest";

import { fileType } from "./fileTypes";

/**
 * Dosya türünün simgesi. İSTEK: "her dosyanın türüne göre iconları
 * göstermiyorsak göstermek doğru olur." Önce yalnızca görsel / kod / belge
 * ayrımı vardı: `App.tsx`, `main.rs` ve `package.json` aynı simgeyle
 * duruyordu.
 */

const label = (path: string) => fileType(path)?.label ?? null;

describe("dosya türü", () => {
  it.each([
    ["src/App.tsx", "TSX"],
    ["src/lib/fileTypes.ts", "TS"],
    ["src-tauri/src/main.rs", "RS"],
    ["package.json", "{}"],
    ["README.md", "MD"],
    ["src/styles/global.css", "#"],
    ["index.html", "<>"],
    ["scripts/run.mjs", "JS"],
    ["build.sh", "SH"],
    ["scripts\\win-env.ps1", "PS"],
    [".github/workflows/build.yml", "YML"],
    ["src-tauri/Cargo.toml", "TML"],
    ["C:\\proje\\SRC\\APP.TS", "TS"],
  ])("%s → %s", (path, expected) => {
    expect(label(path)).toBe(expected);
  });

  it("adı türünü söyleyen dosyalar: kilitler, Dockerfile, git, ortam dosyaları", () => {
    // `package-lock.json` bir JSON ama kilit dosyası; ad uzantıdan önce geliyor.
    expect(label("package-lock.json")).toBe("LCK");
    expect(label("src-tauri/Cargo.lock")).toBe("LCK");
    expect(label("yarn.lock")).toBe("LCK");
    expect(label("Dockerfile")).toBe("DK");
    expect(label("Dockerfile.dev")).toBe("DK");
    expect(label(".gitignore")).toBe("GIT");
    expect(label(".env")).toBe("ENV");
    expect(label(".env.production")).toBe("ENV");
  });

  it("tanınmayan tür etiketsiz: genel simge çiziliyor", () => {
    expect(fileType("notlar.xyz")).toBeNull();
    expect(fileType("LICENSE")).toBeNull();
    // Noktayla başlayan adın uzantısı yok.
    expect(fileType(".bashrc")).toBeNull();
  });

  it("etiketler kutuya sığıyor, renkler geçerli", () => {
    const paths = ["a.ts", "a.tsx", "a.rs", "a.json", "a.toml", "a.cpp", "Dockerfile", ".gitignore"];
    for (const path of paths) {
      const type = fileType(path)!;
      expect(type.label.length, path).toBeLessThanOrEqual(3);
      expect(type.color, path).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
