import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Geliştirme ortamı kullanıcının derlemesini DEĞİŞTİRMEMELİ.
 *
 * BİLDİRİLEN HATA: geliştirme kipinde açılan NTerminal'de `dotnet run`
 * düşüyordu, aynı komut Windows Terminal'de çalışıyordu:
 *
 *   Could not load file or assembly '...\bin\x64\Debug\net10.0\sapnco_utils.dll'
 *
 * Sebep `scripts/win-env.ps1` idi. `vcvars64.bat` ortama `Platform=x64`
 * yazıyor; MSBuild ortam değişkenlerini özellik olarak okuduğu için çıktı
 * klasörü `bin\Debug\...` yerine `bin\x64\Debug\...` oluyor ve o klasörde
 * karma kipli bir derlemeyi yüklemek için gereken `ijwhost.dll` yoktu.
 *
 * Zincir uzun ve gözden kaçmaya çok müsait: betik ortamı oturuma alıyor →
 * `dev.ps1` `tauri dev` çağırıyor → cargo uygulamayı başlatıyor → uygulama
 * açtığı her kabuğa kendi ortamını veriyor. Belirti de uygulamada değil
 * KULLANICININ PROJESİNDE çıkıyor, yani buradan bir daha kaydığında kimse
 * NTerminal'i suçlamaz.
 *
 * Bu yüzden kural testle bağlı. Betik bir PowerShell dosyası; testin
 * yapabileceği şey kuralın kaynakta durduğunu doğrulamak.
 */
const SCRIPT = readFileSync(join(process.cwd(), "scripts/win-env.ps1"), "utf8");

describe("MSVC ortamı", () => {
  it("MSBuild'in okuduğu değişkenler içeri alınmıyor", () => {
    // `Platform` bildirilen hatanın ta kendisi; `PreferredToolArchitecture`
    // aynı sınıftan ve aynı sebeple dışarıda.
    const match = /\$msbuildEtkili\s*=\s*@\(([^)]*)\)/.exec(SCRIPT);
    expect(match, "atlama listesi yok — vcvars ortamı olduğu gibi alınıyor").not.toBe(null);
    expect(match![1]).toContain("'Platform'");
    expect(match![1]).toContain("'PreferredToolArchitecture'");
  });

  it("liste gerçekten uygulanıyor", () => {
    // Listeyi tanımlayıp döngüde kullanmamak sessiz bir gerileme olurdu.
    expect(SCRIPT, "atlama döngüde uygulanmıyor").toMatch(
      /if \(\$msbuildEtkili -contains \$name\) \{[\s\S]{0,80}continue/,
    );
  });

  it("bağlamak için gereken değişkenler ALINMAYA devam ediyor", () => {
    // Fazla budamak ters hatayı üretir: LIB olmadan `msvcrt.lib` bulunamaz ve
    // Rust yapısı LNK1104 ile düşer — bu betiğin var olma sebebi tam olarak o.
    const match = /\$msbuildEtkili\s*=\s*@\(([^)]*)\)/.exec(SCRIPT)!;
    for (const gerekli of ["LIB", "INCLUDE", "LIBPATH", "PATH"]) {
      expect(match[1], `${gerekli} atlanmış — Rust yapısı düşer`).not.toContain(`'${gerekli}'`);
    }
  });

  it("atlananlar kullanıcıya bildiriliyor", () => {
    // Sessizce bir değişkeni düşürmek, altı ay sonra "neden x64 değil" diye
    // arayan kişiye hiçbir iz bırakmaz.
    expect(SCRIPT).toMatch(/\$skipped/);
    expect(SCRIPT).toMatch(/Write-Host "Alinmadi/);
  });
});
