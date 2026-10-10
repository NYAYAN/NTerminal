import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { parseOsc133, parseOsc633 } from "./osc";

/**
 * Kabuk entegrasyon betiklerinin yapısal denetimi.
 *
 * Bu betikler Windows'ta koşturulamıyor (zsh yok) ve mac'te koşturulduklarında
 * hata vermeden yarım çalışabiliyorlar — en sinsi durum bu: uygulama açılıyor,
 * istem geliyor, ama komut geçmişi boş kalıyor. Aşağıdaki testler o yarım
 * durumların bilinen sebeplerini bağlıyor.
 *
 * Betiklerin DAVRANIŞI ayrıca gerçek zsh 5.9 ve bash 3.2.57 üzerinde denendi
 * (Docker, alpine + bash:3.2 imajları); oradan çıkan kaçış tablosu
 * `fixtures/zshEscape.tsv` ve dizi sırası `fixtures/zshOsc.txt` olarak
 * saklanıyor ve `zshEscape.test.ts` / bu dosya onları doğruluyor.
 */

const DIR = join(process.cwd(), "src-tauri/shell-integration");
const ZDOTDIR = join(DIR, "zdotdir");

function read(...parts: string[]): string {
  return readFileSync(join(...parts), "utf8");
}

const ZSH = read(DIR, "nterminal.zsh");
const SH = read(DIR, "nterminal.sh");

/**
 * Gerçek zsh başlatan testler zsh YOKSA atlanıyor. Windows'ta yok; CI'ın Linux
 * makinesinde (ubuntu-latest) de kurulu değil: 0.4.2'nin ilk CI koşusu bu
 * testlerde boş çıktıyla düştü ("zsh istem üretmedi"). macOS'ta /bin/zsh her
 * zaman var, testler orada koşuyor. bash Linux'ta da var; onun testleri
 * yalnızca Windows'ta atlanıyor.
 */
const noZsh =
  process.platform === "win32" ||
  spawnSync("zsh", ["-f", "-c", "exit 0"], { env: { PATH: "/usr/bin:/bin" } }).status !== 0;

/**
 * PowerShell tarafının karşılığı: PSReadLine uygulamayla birlikte geliyor.
 *
 * Bu testler her platformda koşuyor — Rust tarafındaki kurulum testi
 * `#[cfg(windows)]` olduğu için mac'te hiç çalışmıyor ve paketlenen dosyalar
 * denetimsiz kalıyordu. Buradaki denetim dosyaların KENDİSİNE bakıyor, yani
 * yanlış sürüm ya da eksik dosya mac'te de yakalanıyor.
 */
describe("PSReadLine modülü", () => {
  const MODULE = join(DIR, "modules", "PSReadLine");
  const psd1 = () => read(MODULE, "PSReadLine.psd1");

  it("modül dosyaları yerinde", () => {
    for (const f of [
      "PSReadLine.psd1",
      "PSReadLine.psm1",
      "PSReadLine.format.ps1xml",
      "Microsoft.PowerShell.PSReadLine2.dll",
      "License.txt",
    ]) {
      expect(existsSync(join(MODULE, f)), `${f} eksik`).toBe(true);
    }
    // Polyfiller çalışma zamanına göre seçiliyor; ikisi de gerekli.
    expect(existsSync(join(MODULE, "net462", "Microsoft.PowerShell.PSReadLine.Polyfiller.dll"))).toBe(true);
    expect(existsSync(join(MODULE, "net6plus", "Microsoft.PowerShell.PSReadLine.Polyfiller.dll"))).toBe(true);
  });

  it("sürüm 2.2 ya da üstü", () => {
    // Satır içi öneri (`PredictionSource`) 2.2 ile geldi. Daha eski bir sürüm
    // paketlemek bütün işi anlamsız kılar ve hata sessiz olur: modül yüklenir,
    // öneri yine çıkmaz.
    const m = /ModuleVersion\s*=\s*'([\d.]+)'/.exec(psd1());
    expect(m, "ModuleVersion okunamadı").not.toBe(null);
    const [major, minor] = m![1].split(".").map(Number);
    expect(major * 100 + minor, `paketlenen sürüm ${m![1]}`).toBeGreaterThanOrEqual(202);
  });

  it("Windows PowerShell 5.1'i destekliyor", () => {
    // Hedef zaten 5.1: pwsh 7.2+ kendi güncel PSReadLine'ıyla geliyor ve ona
    // dokunmuyoruz. Modül 5.1'i desteklemiyorsa paketlemenin anlamı yok.
    const m = /PowerShellVersion\s*=\s*'([\d.]+)'/.exec(psd1());
    expect(m, "PowerShellVersion okunamadı").not.toBe(null);
    expect(Number.parseFloat(m![1]), `modül PowerShell ${m![1]}+ istiyor`).toBeLessThanOrEqual(5.1);
  });
});

/**
 * PowerShell entegrasyonunun tahmin (prediction) kurulumu.
 *
 * Betik Windows dışında koşturulamadığı için içeriğine bakıyoruz.
 */
describe("PowerShell tahmin kurulumu", () => {
  const PS1 = read(DIR, "nterminal.ps1");

  it("liste görünümünde seçili satırın rengi ayarlanıyor", () => {
    // ÖLÇÜLEN HATA: açık temada seçili satırın metni okunmuyordu. PSReadLine
    // varsayılanı yalnızca ARKA PLANI koyulaştırıyor (48;5;238), yazı rengine
    // dokunmuyor; açık temada yazı da koyu olduğu için satır kayboluyordu.
    //
    // Ters video (SGR 7) terminalin kendi iki rengini takas ediyor: her temada
    // okunabilir. Sabit bir renk yazmak temalardan birinde yine kaybolurdu,
    // bu yüzden kural sabit renk DEĞİL takas olmalı.
    expect(PS1).toMatch(/ListPredictionSelected\s*=\s*\(\$Global:__NTermESC \+ '\[7m'\)/);
  });

  it("istemi dibe itme ayara bağlı ve varsayılanı kapalı", () => {
    // Arayüz bildirmediyse davranış DEĞİŞMEMELİ: eski bir uygulama sürümüyle
    // çalışırken kullanıcının ekranını sessizce yeniden düzenlemek istemiyoruz.
    expect(PS1).toMatch(/__NTermPromptBottom\s*=\s*\(\$env:NTERMINAL_PROMPT_BOTTOM -eq '1'\)/);
    expect(PS1).toMatch(/if \(-not \$Global:__NTermPromptBottom\) \{ return '' \}/);
  });

  it("boşluklar istem işaretinden ÖNCE yazılıyor", () => {
    // 133;A "istem burada başlıyor" demek ve arayüz yazdığınız satırı oradan
    // okuyor. Boşluklar sonra yazılsaydı işaret boş bir satırı gösterir,
    // satır okuma (dolayısıyla öneri listesi) bozulurdu.
    const pad = PS1.indexOf("__NTermBottomPad $userPrompt");
    const mark = PS1.indexOf("']133;A'", pad);
    expect(pad, "boşluk çağrısı yok").toBeGreaterThan(-1);
    expect(mark, "133;A işareti boşluktan sonra gelmiyor").toBeGreaterThan(pad);
  });

  it("çok satırlı istemde son satır dibe oturuyor", () => {
    // Tek satır varsayılsaydı iki satırlı istemin ALT satırı ekranın dışına
    // taşardı; hesap istemin kendi satır sayısını düşüyor.
    expect(PS1).toMatch(/\$bosluk = \$sonSatir - \[Console\]::CursorTop - \$promptLines/);
  });

  it("blok başlığı kipinde görünür istem boş satıra dönüyor", () => {
    // Başlık ekranda BİR SATIR yer istiyor ve arayüz ızgaraya satır
    // ekleyemiyor — yalnızca var olanın üstüne çizebiliyor. İstemi tümden
    // silmek o satırı da yok ederdi.
    expect(PS1).toMatch(/if \(\$Global:__NTermBlockHeader\) \{\s*\$userPrompt = "`n"/);
  });

  it("blok başlığı kipi arayüze bildiriliyor", () => {
    // Bildirmeyen bir kabukta (bash, cmd) boş satır oluşmuyor; arayüz başlığı
    // oraya çizerse çıktının üstünü örter. Karar bu yüzden bildirime bağlı.
    expect(PS1).toMatch(/633;P;BlockHeader=1/);
    expect(PS1).toMatch(/633;P;BlockHeader=0/);
  });

  it("liste görünümü hâlâ kuruluyor", () => {
    // Renk düzeltmesi görünüm ayarının yerine geçmemeli.
    expect(PS1).toMatch(/PredictionViewStyle ListView/);
    expect(PS1).toMatch(/PredictionViewStyle InlineView/);
  });
});

/**
 * Satır içi öneri eklentisi (zsh-autosuggestions) uygulamayla birlikte geliyor.
 *
 * Önceden yoksa durum "unsupported" bildiriliyor, arayüz de kullanıcıya
 * `brew install zsh-autosuggestions` diyordu — yani özelliğin çalışması için
 * önce Homebrew kurulması gerekiyordu.
 */
describe("satır içi öneri eklentisi", () => {
  /** Eklenti aday listesi: aranan yollar, yazıldıkları sırayla. */
  const adaylar = () => {
    const start = ZSH.indexOf("for __nterm_cand in");
    expect(start, "aday döngüsü bulunamadı").toBeGreaterThan(-1);
    const body = ZSH.slice(start, ZSH.indexOf("do", start));
    return [...body.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  };

  it("uygulamayla gelen kopya aday listesinde", () => {
    expect(adaylar().some((p) => p.includes("zsh-autosuggestions.zsh"))).toBe(true);
    expect(existsSync(join(DIR, "zsh-autosuggestions.zsh")), "eklenti dosyası yok").toBe(true);
  });

  it("kullanıcının kendi kurulumu ÖNCE geliyor", () => {
    // Sıra bir tercih değil, doğruluk meselesi: kendi sürümünü yapılandırmış
    // (renk, strateji, tuş bağlama) biri bizim yapılandırılmamış kopyamıza
    // düşmemeli. Bizimki yalnızca hiçbiri yoksa devreye girer, o yüzden EN SON.
    const list = adaylar();
    const bizimki = list.findIndex((p) => p.includes("NTERMINAL_OWN_ZDOTDIR"));
    expect(bizimki, "uygulamanın kopyası aday listesinde yok").toBeGreaterThan(-1);
    expect(bizimki, "uygulamanın kopyası kullanıcınınkinden önce deneniyor").toBe(list.length - 1);
  });

  it("kullanıcı zaten yüklediyse ikinci kez yüklenmiyor", () => {
    // İki kez source etmek tuş bağlamalarını üst üste kuruyor.
    expect(ZSH).toContain("$+functions[_zsh_autosuggest_start]");
  });

  it("öneri kapalıyken eklentiye hiç dokunulmuyor", () => {
    // Kullanıcı kabuk önerisini kapattıysa onun .zshrc'sindeki ayar geçerli
    // kalmalı; eklentiyi yine de yüklemek o kararı eziyor.
    // `${X-}`: `setopt nounset` açık kullanıcıda tanımsız değişken betiği kesmesin.
    const off = ZSH.indexOf('${NTERMINAL_PREDICTION-} == "off"');
    const loop = ZSH.indexOf("for __nterm_cand in");
    expect(off, "kapalı denetimi yok").toBeGreaterThan(-1);
    expect(off, "kapalı denetimi yükleme döngüsünden sonra geliyor").toBeLessThan(loop);
  });
});

describe("zsh betiği", () => {
  it("dosya var", () => {
    expect(existsSync(join(DIR, "nterminal.zsh"))).toBe(true);
  });

  it("preexec ve precmd kancalarını tanımlıyor", () => {
    // zsh'in bash'ten farkı: komut satırını `preexec` doğrudan argüman olarak
    // veriyor, DEBUG tuzağı + sentinel gerekmiyor.
    expect(ZSH).toContain("__nterm_preexec()");
    expect(ZSH).toContain("__nterm_precmd()");
    expect(ZSH).toContain("__nterm_ps1_mark()");
  });

  it("precmd dizinin BAŞINA, ps1_mark SONUNA kayıtlı", () => {
    // Sıra doğruluk meselesi: $? bir sonraki kancaya kadar yaşıyor, başka bir
    // kanca önce koşarsa okuduğumuz çıkış kodu onun kodudur — `false` sonrası
    // "0" bildirilir ve geçmişte her komut başarılı görünür.
    //
    // ps1_mark ise EN SONDA olmalı: tema (powerlevel10k, starship) PS1'i
    // kullanıcının .zshrc'sinde kuruyor, önce eklersek işaretin üstüne yazılır.
    const line = ZSH.match(/precmd_functions=\((.+)\)/)?.[1];
    expect(line, "precmd_functions ataması bulunamadı").toBeTruthy();
    expect(line!.trim().startsWith("__nterm_precmd"), `sıra yanlış: ${line}`).toBe(true);
    expect(line!.trim().endsWith("__nterm_ps1_mark"), `sıra yanlış: ${line}`).toBe(true);
  });

  it("PS1 işaretini her istemde yeniden kontrol ediyor", () => {
    // Tek seferlik eklemek powerlevel10k / starship gibi PS1'i her istemde
    // yeniden kuran temalarda ilk istemden sonra kaybolur; komut metni okunamaz.
    const body = ZSH.slice(ZSH.indexOf("__nterm_ps1_mark()"));
    expect(body).toContain("133;B");
    expect(body, "PS1 zaten işaretli mi denetimi yok").toMatch(/\$PS1 != \*'133;B'\*/);
  });

  it("PS1 işaretini sıfır genişlikli bölgeye alıyor", () => {
    // `%{ %}` olmadan zsh satır uzunluğunu yanlış hesaplıyor ve imleç kayıyor.
    expect(ZSH).toContain("%{");
    expect(ZSH).toContain("%}");
  });

  it("kaçış sırasında ters eğik çizgi ÖNCE geliyor", () => {
    // Sonra gelirse kendi eklediğimiz kaçışları tekrar kaçırırız ve arayüz
    // metni çift çözer.
    const fn = ZSH.slice(ZSH.indexOf("__nterm_escape()"), ZSH.indexOf("__nterm_report_cwd()"));
    const bs = fn.indexOf('v=${v//"$bs"/');
    const semi = fn.indexOf('v=${v//";"');
    expect(bs, "ters eğik çizgi değişimi yok").toBeGreaterThan(-1);
    expect(semi, "noktalı virgül değişimi yok").toBeGreaterThan(-1);
    expect(bs, "ters eğik çizgi kaçışı ilk sırada olmalı").toBeLessThan(semi);
  });

  it("desen tırnak içinde — zsh glob'una yem olmasın", () => {
    // zsh `${v//desen/...}` içinde deseni GLOB sayıyor ve `\` orada kaçış
    // karakteri. Tırnaklamak harfi harfine eşleştiriyor; düz yazımla bash ve
    // zsh farklı sayıda ters eğik çizgi üretiyor.
    expect(ZSH).toContain('${v//"$bs"/"$bs$bs"}');
  });

  it("fish için betik yok — desteklenmiyor olarak işaretli", () => {
    // fish bash/zsh söz dizimini paylaşmıyor. Betik varmış gibi görünmesi
    // "açık ama hiçbir şey bildirmiyor" durumuna yol açardı.
    expect(existsSync(join(DIR, "nterminal.fish"))).toBe(false);
  });
});

describe("ZDOTDIR köprüsü", () => {
  // zsh'in `--init-file` karşılığı yok: entegrasyonu yüklemenin tek yolu
  // ZDOTDIR'i kendi klasörümüze çevirmek. O zaman kullanıcının BÜTÜN başlangıç
  // dosyaları atlanıyor, her biri için bir köprü şart.
  const FILES = [".zshenv", ".zprofile", ".zshrc", ".zlogin"] as const;

  it("dört başlangıç dosyasının hepsi köprülü", () => {
    // Biri eksikse kullanıcının PATH'i, alias'ları ya da teması sessizce gider.
    for (const f of FILES) {
      expect(existsSync(join(ZDOTDIR, f)), `${f} köprüsü yok`).toBe(true);
    }
  });

  it("her köprü kullanıcının aynı adlı dosyasını yüklüyor", () => {
    for (const f of FILES) {
      const text = read(ZDOTDIR, f);
      expect(text, `${f} kullanıcının dosyasını yüklemiyor`).toContain(
        `__nterm_source_user "$NTERMINAL_USER_ZDOTDIR/${f}"`,
      );
    }
  });

  it(".zshenv yardımcıları tanımlıyor — ilk okunan dosya o", () => {
    const env = read(ZDOTDIR, ".zshenv");
    expect(env).toContain("__nterm_source_user()");
    expect(env).toContain("__nterm_restore_zdotdir()");
    expect(env).toContain("NTERMINAL_OWN_ZDOTDIR=$ZDOTDIR");
  });

  it(".zshrc kullanıcının rc'sini entegrasyondan ÖNCE yüklüyor", () => {
    // Tema PS1'i kullanıcının .zshrc'sinde kuruyor; entegrasyonu önce
    // yüklersek işaretimizin üstüne yazılıyor ve komut metni hiç okunamıyor.
    const rc = read(ZDOTDIR, ".zshrc");
    const user = rc.indexOf('__nterm_source_user "$NTERMINAL_USER_ZDOTDIR/.zshrc"');
    const ours = rc.indexOf("nterminal.zsh");
    expect(user, "kullanıcının .zshrc'si yüklenmiyor").toBeGreaterThan(-1);
    expect(ours, "nterminal.zsh yüklenmiyor").toBeGreaterThan(-1);
    expect(user, "sıra ters: entegrasyon kullanıcının rc'sinden önce").toBeLessThan(ours);
  });

  it("ZDOTDIR kullanıcıya geri veriliyor", () => {
    // Bizim klasörü göstermeye devam ederse, kullanıcının .zshrc'sine satır
    // ekleyen bir kurulum betiği (nvm, conda, rustup) BİZİM klasöre yazar —
    // ve biz onu her açılışta üzerine yazıyoruz. Yaptığı ayar sessizce kaybolur.
    const rc = read(ZDOTDIR, ".zshrc");
    expect(rc).toContain("__nterm_restore_zdotdir");
  });

  it("köprü klasörü alt klasörde — zsh yalnızca nokta dosyalarını görsün", () => {
    // ZDOTDIR bir klasörü gösteriyor; entegrasyon klasörünün kökünde
    // nterminal.ps1 / .sh gibi dosyalar da var, onları ayrı tutmak temiz.
    expect(existsSync(join(ZDOTDIR, ".zshrc"))).toBe(true);
    expect(existsSync(join(DIR, ".zshrc")), "kök klasöre .zshrc konmamalı").toBe(false);
  });
});

describe("bash betiği — platform zinciri", () => {
  it("macOS'ta login zincirini yüklüyor", () => {
    // pty.rs `--login`i çıkarmak zorunda (bash `--init-file`i yalnızca login
    // OLMAYAN kabukta okuyor), dolayısıyla /etc/profile ve .bash_profile'ı
    // betiğin kendisi yüklemek zorunda. Yoksa mac'te PATH'i kuran path_helper
    // hiç koşmaz ve "brew kurdum ama komut bulunamıyor" olur.
    expect(SH).toContain("darwin*)");
    expect(SH).toContain("/etc/profile");
    expect(SH).toContain(".bash_profile");
  });

  it("macOS'ta profil varsa .bashrc'yi ikinci kez yüklemiyor", () => {
    // Çift yükleme PATH girdilerini iki kez yazıyor. Gerçek bash 3.2.57'de
    // ölçüldü: profil varken /opt/tekil PATH'te bir kez görünüyor.
    const mac = SH.slice(SH.indexOf("darwin*)"), SH.indexOf("  *)"));
    expect(mac, "koşulsuz .bashrc yüklemesi mac dalında olmamalı").toContain(
      '[ -z "$__nterm_profile" ]',
    );
  });

  it("Git Bash / WSL dalı korunuyor", () => {
    const other = SH.slice(SH.indexOf("  *)"));
    expect(other).toContain("/etc/bash.bashrc");
    expect(other).toContain('"$HOME/.bashrc"');
  });
});

describe("OSC sözleşmesi", () => {
  /**
   * Betiklerin gönderdiği her dizi ön yüzün ayrıştırabildiği bir dizi olmalı.
   *
   * İki taraf ayrı dillerde ve birbirini görmüyor. Betiğe yeni bir dizi
   * eklenip ayrıştırıcı güncellenmezse hiçbir hata çıkmıyor — dizi sessizce
   * yok sayılıyor.
   */
  function payloads(script: string): { code: string; payload: string }[] {
    const out: { code: string; payload: string }[] = [];
    // __nterm_osc "633;P;Cwd=..." / __NTermOsc '133;A'
    for (const m of script.matchAll(/__nterm_osc\s+["']([^"']+)["']/g)) {
      const [code, ...rest] = m[1].split(";");
      out.push({ code, payload: rest.join(";") });
    }
    return out;
  }

  const zshPayloads = payloads(ZSH);
  const shPayloads = payloads(SH);

  it("betiklerden dizi çıkarılabildi", () => {
    // Tarama boş dönerse aşağıdaki testler hiçbir şey doğrulamaz.
    expect(zshPayloads.length, "zsh betiğinden dizi çıkmadı").toBeGreaterThanOrEqual(6);
    expect(shPayloads.length, "bash betiğinden dizi çıkmadı").toBeGreaterThanOrEqual(6);
  });

  it("yalnızca bilinen OSC kodları gönderiliyor", () => {
    const known = new Set(["7", "133", "633"]);
    for (const list of [zshPayloads, shPayloads]) {
      for (const { code } of list) {
        expect(known.has(code), `bilinmeyen OSC kodu: ${code}`).toBe(true);
      }
    }
  });

  it("133 yükleri ayrıştırılabiliyor", () => {
    const seen = new Set<string>();
    for (const list of [zshPayloads, shPayloads]) {
      for (const { code, payload } of list) {
        if (code !== "133") continue;
        // Kabuk değişkeni içeren yükte ($code) sabit kısmı sınıyoruz.
        const fixed = payload.replace(/\$\{?\w+\}?/g, "0");
        const parsed = parseOsc133(fixed);
        expect(parsed.kind, `ayrıştırılamayan 133 yükü: ${payload}`).not.toBe(null);
        seen.add(parsed.kind!);
      }
    }
    // A istem başı, C komut başladı, D komut bitti — üçü de yardımcıdan gidiyor.
    expect([...seen].sort()).toEqual(["A", "C", "D"]);
  });

  it("her iki betik de 133;B'yi PS1'e gömüyor", () => {
    // B ötekilerden farklı yolla gidiyor: istemin SONUNDA olması gerektiği için
    // bir kancadan gönderilemiyor, istem dizesinin içine yazılıyor. Eksik
    // olursa komut girişinin başladığı nokta bilinmiyor ve komut metni ekran
    // tamponundan tahmin edilmek zorunda kalıyor.
    expect(ZSH, "zsh PS1 işareti yok").toContain("133;B");
    expect(SH, "bash PS1 işareti yok").toContain("133;B");
  });

  it("633 yükleri ayrıştırılabiliyor", () => {
    const kinds = new Set<string>();
    for (const list of [zshPayloads, shPayloads]) {
      for (const { code, payload } of list) {
        if (code !== "633") continue;
        const parsed = parseOsc633(payload);
        expect(parsed, `ayrıştırılamayan 633 yükü: ${payload}`).not.toBe(null);
        kinds.add(parsed!.kind);
      }
    }
    // E komut metni, P özellik (Cwd / Prediction).
    expect(kinds.has("E"), "komut metni bildirilmiyor").toBe(true);
    expect(kinds.has("P"), "dizin/öneri bildirilmiyor").toBe(true);
  });

  it("iki betik aynı diziler kümesini gönderiyor", () => {
    // zsh ile bash arasındaki fark yalnızca NASIL topladıkları olmalı, NE
    // gönderdikleri değil. Ayrışma bir kabukta yarım çalışan bir özellik demek.
    // Kabuk DEĞİŞKENLERİ çıkarılıyor: zsh ana makine adını `$HOST`, bash
    // `$HOSTNAME` ile veriyor. Bu doğru bir fark — karşılaştırılan şey dizinin
    // biçimi, değişkenin adı değil.
    const shape = (list: { code: string; payload: string }[]) =>
      [
        ...new Set(
          list.map(
            ({ code, payload }) =>
              `${code};${payload.replace(/\$\{[^}]*\}|\$\w+/g, "").split("=")[0].split(";")[0]}`,
          ),
        ),
      ].sort();
    // Prediction yalnızca zsh'te var (bash'te karşılığı yok); onu çıkarıyoruz.
    const zsh = shape(zshPayloads).filter((s) => !s.includes("Prediction"));
    expect(zsh).toEqual(shape(shPayloads));
  });
});

/**
 * Gerçek zsh'in ürettiği dizi akışı.
 *
 * Yukarıdaki testler betiğin METNİNİ denetliyor; buradaki, betik gerçekten
 * koşturulduğunda ortaya çıkan diziyi denetliyor. İkisi ayrı şeyler: metin
 * doğru görünüp davranış yanlış olabilir (kanca sırası, `$?` kaybı, kaçış
 * farkı — hepsi sessiz).
 *
 * Sınama verisi gerçek zsh 5.9'da (macOS'un da kullandığı sürüm) Docker
 * içinde üretildi. Böylece protokol Windows'ta, zsh olmadan da doğrulanıyor.
 *
 * Yeniden üretmek için:
 *   docker run --rm -v .../shell-integration:/si:ro -v .../scratchpad:/sp:ro \
 *     alpine:3.21 sh /sp/zsh-osc-fixture.sh > src/lib/fixtures/zshOsc.txt
 */
describe("gerçek zsh akışı", () => {
  const lines = readFileSync(join(process.cwd(), "src/lib/fixtures/zshOsc.txt"), "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));

  /** Yükü OSC koduna ve gerisine böler. */
  const split = (line: string) => {
    const at = line.indexOf(";");
    return { code: line.slice(0, at), rest: line.slice(at + 1) };
  };

  it("sınama verisi okunabildi", () => {
    // Boş gelirse aşağıdakiler hiçbir şey doğrulamaz.
    expect(lines.length, "OSC sınama verisi boş").toBeGreaterThan(20);
  });

  it("her satır ayrıştırılabiliyor", () => {
    const bad: string[] = [];
    for (const line of lines) {
      const { code, rest } = split(line);
      if (code === "7") continue; // dosya URI'si, ayrı ayrıştırıcı
      if (code === "133" && parseOsc133(rest).kind === null) bad.push(line);
      if (code === "633" && parseOsc633(rest) === null) bad.push(line);
    }
    expect(bad, `ayrıştırılamayan satır:\n${bad.join("\n")}`).toEqual([]);
  });

  it("komut döngüsü doğru sırada", () => {
    // Her komut için beklenen sıra: 133;D (öncekinin sonu) → Cwd → 133;A
    // (istem başı) → 133;B (giriş başı) → 633;E (komut metni) → 133;C (çalıştı).
    // Sıra bozulursa arayüz komutu yanlış noktadan okur ya da hiç okumaz.
    const flow = lines
      .map((l) => {
        const { code, rest } = split(l);
        if (code === "133") return `133${rest[0]}`;
        if (code === "633" && rest.startsWith("E")) return "633E";
        if (code === "633" && rest.startsWith("P;Cwd")) return "Cwd";
        return null;
      })
      .filter(Boolean)
      .join(" ");

    // İlk komuttan itibaren döngü.
    expect(flow).toContain("133D Cwd 133A 133B 633E 133C");
  });

  it("çıkış kodları doğru bildirilmiş", () => {
    // `echo tamam` başarılı, `false` başarısız. Kanca sırası bozuksa ikisi de
    // 0 gelir ve geçmişte her komut başarılı görünür — en sinsi hata bu.
    const codes = lines
      .filter((l) => l.startsWith("133;D;"))
      .map((l) => parseOsc133(split(l).rest).exitCode);
    expect(codes.slice(0, 3), `bildirilen kodlar: ${codes}`).toEqual([0, 1, 0]);
  });

  it("komut metinleri kaçışlı geliyor ve geri çözülüyor", () => {
    const commands = lines
      .filter((l) => l.startsWith("633;E;"))
      .map((l) => parseOsc633(split(l).rest)!.value);
    expect(commands).toEqual(["echo tamam", "false", 'echo "a;b"', "exit"]);
  });

  it("ayırıcı karakter ham hâlde akışa girmiyor", () => {
    // `echo "a;b"` içindeki `;` kaçmasa yük ortadan bölünür ve komut metni
    // "echo \"a" olarak okunur.
    const raw = lines.find((l) => l.startsWith("633;E;") && l.includes("a"));
    expect(raw, "örnek komut satırı bulunamadı").toBeTruthy();
    expect(raw!, "noktalı virgül kaçırılmamış").toContain("\x3B");
  });

  it("dizin her istemde bildirilmiş", () => {
    const cwds = new Set(
      lines.filter((l) => l.startsWith("633;P;Cwd=")).map((l) => parseOsc633(split(l).rest)!.value),
    );
    expect([...cwds]).toEqual(["/home/t/proje"]);
  });

  it("her komut için tek komut metni gönderilmiş", () => {
    // İki kez gönderilse arayüz aynı komut için iki kayıt açardı.
    const e = lines.filter((l) => l.startsWith("633;E;")).length;
    const c = lines.filter((l) => l === "133;C").length;
    expect(e).toBe(c);
  });
});

/**
 * Renkli varsayılan istem — GERÇEK zsh ve bash üzerinde.
 *
 * ## İstek
 *
 * "nyayan@Nurullahs-MacBook-Pro locale-test % echo merhaba" satırı düz beyaz:
 * ekran geçmişinde komutun NEREDE başladığını gözle bulmak zor. Kullanıcı
 * "en azından nerede komut yazdığını anlayabilsin" istedi.
 *
 * ## Kural
 *
 * Yalnızca işletim sisteminin verdiği varsayılan istem renkleniyor (zsh
 * `%n@%m %1~ %#`, bash `\h:\W \u\$` ve bash'in yerleşik `\s-\v\$`). Kullanıcının
 * bilerek kurduğu istem (oh-my-zsh, starship, kendi PROMPT'u) DEĞİŞMİYOR ve
 * ayar kapalıyken hiçbir şeye dokunulmuyor.
 *
 * Betikler YAPISAL olarak denetleniyor (yukarıdaki testler) ama bu kural bir
 * DAVRANIŞ: yanlış bir desen ya sessizce hiçbir şey yapmaz ya da kullanıcının
 * istemini ezer. O yüzden betik gerçek kabukta kaynak edilip PS1 okunuyor.
 * Windows'ta zsh/bash yok; orada atlanıyor. zsh testleri zsh kurulu olmayan
 * makinede de atlanıyor (CI'ın Linux makinesi; bkz. `noZsh`).
 */
describe("renkli varsayılan istem", () => {
  const win = process.platform === "win32";
  const ZSH_SCRIPT = join(DIR, "nterminal.zsh");
  const SH_SCRIPT = join(DIR, "nterminal.sh");
  const ESC = String.fromCharCode(27);

  function run(
    cmd: string,
    args: string[],
    env: Record<string, string | undefined>,
    setup?: (home: string) => void,
  ) {
    // Kullanıcının dosyalarına DOKUNMAMAK için boş bir HOME.
    const home = mkdtempSync(join(tmpdir(), "nt-istem-"));
    try {
      setup?.(home);
      const r = spawnSync(cmd, args, {
        env: { PATH: "/usr/bin:/bin", HOME: home, TERM: "xterm-256color", ...env },
        encoding: "utf8",
        timeout: 15000,
      });
      return { out: r.stdout ?? "", err: r.stderr ?? "", code: r.status };
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  }

  /**
   * Betik kaynak edilirken OSC dizileri yazıyor (dizin bildirimi); PS1 değerlerini
   * onlardan ayırmak için sentinel arasına alıyoruz.
   */
  const between = (out: string, tag: string) =>
    new RegExp(`<<${tag}>>([\\s\\S]*?)<</${tag}>>`).exec(out)?.[1] ?? "";

  /** zsh: verilen PS1 ile betiği kaynak edip PS1'i (ham) ve genişletilmiş hâlini döndürür. */
  function zsh(ps1: string, env: Record<string, string | undefined> = {}) {
    const r = run(
      "zsh",
      [
        "-f",
        "-c",
        `PS1=${JSON.stringify(ps1)}; source ${JSON.stringify(ZSH_SCRIPT)}; ` +
          `print -rn -- "<<RAW>>$PS1<</RAW>>"; print -rnP -- "<<EXP>>$PS1<</EXP>>"`,
      ],
      env,
    );
    return { raw: between(r.out, "RAW"), expanded: between(r.out, "EXP"), err: r.err };
  }

  /**
   * bash: kullanıcının istemi GERÇEK akıştaki yerinden veriliyor.
   *
   * Betik önce kullanıcının başlangıç dosyalarını yüklüyor (macOS'ta
   * /etc/profile → /etc/bashrc, sonra ~/.bash_profile) ve PS1'i ANCAK ONDAN
   * SONRA görüyor; kaynak etmeden önce PS1 vermek boşa: /etc/bashrc onu ezer.
   * O yüzden istem, geçici HOME'daki profil dosyalarına yazılıyor. `ps1`
   * verilmezse işletim sisteminin kendi varsayılanı kalıyor.
   *
   * bash 3.2'de `${PS1@P}` yok, yalnızca ham PS1 okunuyor. Betik entegrasyon
   * işaretini (`\[\033]133;B\007\]`) PS1'in SONUNA hemen ekliyor; o yapışkan
   * son ek bu testlerin konusu değil, karşılaştırmadan çıkarılıyor.
   */
  function bash(ps1: string | undefined, env: Record<string, string | undefined> = {}) {
    const r = run(
      "bash",
      // `-i`: etkileşimli kabuk bash'in yerleşik PS1'ini (`\s-\v\$`) veriyor ve
      // /etc/bashrc ancak PS1 doluysa kendi varsayılanını yazıyor; `-i`siz PS1
      // boş kalır ve o dosya hemen dönerdi.
      ["--norc", "--noprofile", "-i", "-c", `. ${JSON.stringify(SH_SCRIPT)}; printf '<<RAW>>%s<</RAW>>' "$PS1"`],
      env,
      (home) => {
        if (ps1 === undefined) return;
        // macOS `.bash_profile`ı, Git Bash/WSL/Linux `.bashrc`yi okuyor.
        for (const f of [".bash_profile", ".bashrc"]) {
          writeFileSync(join(home, f), `PS1='${ps1}'\n`);
        }
      },
    );
    const isaret = "\\[\\033]133;B\\007\\]";
    const raw = between(r.out, "RAW");
    return { raw: raw.endsWith(isaret) ? raw.slice(0, -isaret.length) : raw, err: r.err };
  }

  const strip = (s: string) => s.replace(new RegExp(`${ESC}\\[[0-9;]*m`, "g"), "");

  it("betikler ayarı okuyor", () => {
    expect(ZSH).toContain("NTERMINAL_PROMPT_COLOR");
    expect(SH).toContain("NTERMINAL_PROMPT_COLOR");
  });

  it.skipIf(noZsh)("zsh: işletim sisteminin varsayılan istemi renkleniyor", () => {
    const r = zsh("%n@%m %1~ %# ");
    expect(r.raw, r.err).toContain("%F{green}");
    expect(r.raw).toContain("%F{blue}");
    // Gerçekten renk KAÇIŞI üretiyor (genişletilmiş hâlde SGR dizisi var).
    expect(r.expanded).toContain(`${ESC}[`);
  });

  it.skipIf(noZsh)("zsh: renklenen istemin GÖRÜNEN metni aynı kalıyor", () => {
    // Renk yalnızca renk: düzen, genişlik ve içerik değişmemeli, yoksa
    // imleç konumu ve komut satırı okuması kayar.
    const duz = zsh("%n@%m %1~ %# ", { NTERMINAL_PROMPT_COLOR: "0" });
    const renkli = zsh("%n@%m %1~ %# ", { NTERMINAL_PROMPT_COLOR: "1" });
    expect(strip(renkli.expanded)).toBe(strip(duz.expanded));
    expect(renkli.expanded).not.toBe(duz.expanded);
  });

  it.skipIf(noZsh)("zsh: renk kaçışları sıfırlanıyor (sonraki metne sızmıyor)", () => {
    const r = zsh("%n@%m %1~ %# ");
    // Kalın ve renk açıldıysa kapatılmış olmalı: son metin (`% `) varsayılan renkte.
    const acilis = (r.expanded.match(new RegExp(`${ESC}\\[[0-9;]*m`, "g")) ?? []).length;
    expect(acilis).toBeGreaterThan(2);
    expect(r.expanded.trimEnd().endsWith("%")).toBe(true);
  });

  it.skipIf(noZsh)("zsh: kullanıcının kendi istemine DOKUNULMUYOR", () => {
    for (const ps1 of ["%~ > ", "%F{red}özel%f $ ", "❯ ", "%n@%m %1~ %# x"]) {
      const r = zsh(ps1);
      expect(r.raw, `kullanıcının istemi değişti: ${ps1}`).toBe(ps1);
    }
  });

  // ------------------------------------------- kullanıcının seçtiği renkler
  //
  // Uygulama `R;G;B` yolluyor (terminal zeminine karşı okunur hâle getirilmiş,
  // bkz. `promptColors.ts`); betik bunu bir KAÇIŞ DİZİSİNİN içine yazıyor. Bu
  // yüzden en az iki şey bağlı: seçilen renk gerçekten istemde çıkıyor ve
  // bozuk/kötü niyetli değer HİÇBİR ZAMAN kabuğa ulaşmıyor.

  it.skipIf(noZsh)("zsh: seçilen kullanıcı@makine rengi istemde çıkıyor, dizin paletten kalıyor", () => {
    const r = zsh("%n@%m %1~ %# ", { NTERMINAL_PROMPT_USER_RGB: "255;140;0" });
    expect(r.raw, r.err).toContain(`%{${ESC}[38;2;255;140;0m%}`);
    expect(r.raw).toContain("%F{blue}");
    expect(r.raw, "palet yeşili seçilen renkle birlikte kaldı").not.toContain("%F{green}");
    expect(r.expanded).toContain(`${ESC}[38;2;255;140;0m`);
  });

  it.skipIf(noZsh)("zsh: seçilen dizin rengi istemde çıkıyor, kullanıcı@makine paletten kalıyor", () => {
    const r = zsh("%n@%m %1~ %# ", { NTERMINAL_PROMPT_DIR_RGB: "0;170;255" });
    expect(r.raw, r.err).toContain(`%{${ESC}[38;2;0;170;255m%}`);
    expect(r.raw).toContain("%F{green}");
    expect(r.raw).not.toContain("%F{blue}");
  });

  it.skipIf(noZsh)("zsh: iki renk birlikte seçilince ikisi de çıkıyor", () => {
    const r = zsh("%n@%m %1~ %# ", {
      NTERMINAL_PROMPT_USER_RGB: "255;140;0",
      NTERMINAL_PROMPT_DIR_RGB: "0;170;255",
    });
    expect(r.expanded).toContain(`${ESC}[38;2;255;140;0m`);
    expect(r.expanded).toContain(`${ESC}[38;2;0;170;255m`);
    expect(r.raw).not.toContain("%F{");
  });

  it.skipIf(noZsh)("zsh: seçilen renkte de GÖRÜNEN metin ve sıfırlama aynı kalıyor", () => {
    const duz = zsh("%n@%m %1~ %# ", { NTERMINAL_PROMPT_COLOR: "0" });
    const renkli = zsh("%n@%m %1~ %# ", {
      NTERMINAL_PROMPT_USER_RGB: "255;140;0",
      NTERMINAL_PROMPT_DIR_RGB: "0;170;255",
    });
    expect(strip(renkli.expanded)).toBe(strip(duz.expanded));
    // Renk son metne (`% `) sızmıyor: varsayılan renge dönülmüş.
    expect(renkli.expanded).toContain(`${ESC}[39m`);
    expect(renkli.expanded.trimEnd().endsWith("%")).toBe(true);
  });

  it.skipIf(noZsh)("zsh: bozuk ya da kötü niyetli renk değeri palet rengine düşüyor, hiçbir şey çalışmıyor", () => {
    const iz = join(tmpdir(), `nt-enjeksiyon-${process.pid}-${Date.now()}`);
    try {
      for (const kotu of [
        "1;2",
        "1;2;3;4",
        "a;b;c",
        ";1;2",
        "1;2;",
        "1;;2",
        "1;2;3;",
        "1 2 3",
        `1;2;3$(touch ${iz})`,
        `1;2;3\`touch ${iz}\``,
        `1;2;3;touch ${iz}`,
        "\x1b[31m",
      ]) {
        const r = zsh("%n@%m %1~ %# ", { NTERMINAL_PROMPT_USER_RGB: kotu, NTERMINAL_PROMPT_DIR_RGB: kotu });
        expect(r.raw, `bozuk değer kabul edildi: ${JSON.stringify(kotu)}`).toContain("%F{green}");
        expect(r.raw).toContain("%F{blue}");
        expect(r.raw).not.toContain("38;2");
      }
      expect(existsSync(iz), "değer bir komut olarak ÇALIŞTI").toBe(false);
    } finally {
      rmSync(iz, { force: true });
    }
  });

  it.skipIf(noZsh)("zsh: ayar kapalıyken seçilen renk de uygulanmıyor", () => {
    const r = zsh("%n@%m %1~ %# ", {
      NTERMINAL_PROMPT_COLOR: "0",
      NTERMINAL_PROMPT_USER_RGB: "255;140;0",
    });
    expect(r.raw).toBe("%n@%m %1~ %# ");
  });

  it.skipIf(noZsh)("zsh: kullanıcının kendi istemine seçilen renk de dokunmuyor", () => {
    const r = zsh("%~ > ", { NTERMINAL_PROMPT_USER_RGB: "255;140;0" });
    expect(r.raw).toBe("%~ > ");
  });

  it.skipIf(noZsh)("zsh: `setopt nounset` açıkken de renk uygulanıyor", () => {
    // Kullanıcının .zshrc'si `setopt nounset` açtıysa betik tanımsız bir
    // değişkende yarıda kalıyor ve istem HİÇ renklenmiyordu.
    const r = run(
      "zsh",
      [
        "-f",
        "-c",
        `setopt nounset; PS1=${JSON.stringify("%n@%m %1~ %# ")}; source ${JSON.stringify(ZSH_SCRIPT)}; ` +
          `print -rn -- "<<RAW>>$PS1<</RAW>>"`,
      ],
      { NTERMINAL_PROMPT_USER_RGB: "255;140;0" },
    );
    expect(between(r.out, "RAW"), r.err).toContain("38;2;255;140;0");
  });

  it.skipIf(noZsh)("zsh: ayar kapalıyken varsayılana da dokunulmuyor", () => {
    const r = zsh("%n@%m %1~ %# ", { NTERMINAL_PROMPT_COLOR: "0" });
    expect(r.raw).toBe("%n@%m %1~ %# ");
  });

  it.skipIf(noZsh)("zsh: değişken hiç yoksa (eski uygulama) renkleniyor", () => {
    const r = zsh("%n@%m %1~ %# ", { NTERMINAL_PROMPT_COLOR: undefined });
    expect(r.raw).toContain("%F{green}");
  });

  it.skipIf(process.platform !== "darwin")("bash: macOS'un GERÇEK varsayılanı (/etc/bashrc) renkleniyor", () => {
    // Kullanıcı dosyası yok: istemi /etc/bashrc veriyor.
    const r = bash(undefined);
    expect(r.raw, r.err).toContain("\\033[1;32m");
  });

  it.skipIf(win)("bash: varsayılan istem renkleniyor ve sıfır genişlik sarmalı korunuyor", () => {
    const r = bash("\\h:\\W \\u\\$ ");
    expect(r.raw, r.err).toContain("\\033[1;32m");
    expect(r.raw).toContain("\\033[1;34m");
    // \[ \] sarmaları OLMAZSA readline satır uzunluğunu yanlış hesaplar ve
    // imleç kayar: her renk dizisi bir sarmanın içinde olmalı.
    const renkler = r.raw.match(/\\033\[[0-9;]*m/g) ?? [];
    const sarili = r.raw.match(/\\\[\\033\[[0-9;]*m\\\]/g) ?? [];
    expect(renkler.length).toBeGreaterThan(0);
    expect(sarili.length, `sarılmamış renk dizisi var: ${r.raw}`).toBe(renkler.length);
  });

  it.skipIf(win)("bash: yerleşik varsayılan (sh-3.2$) renkleniyor", () => {
    const r = bash("\\s-\\v\\$ ");
    expect(r.raw, r.err).toContain("\\033[1;32m");
    expect(r.raw).toContain("\\s-\\v");
  });

  it.skipIf(win)("bash: kullanıcının kendi istemine DOKUNULMUYOR", () => {
    for (const ps1 of ["\\w \\$ ", "\\u@\\h \\W % ", "$ "]) {
      expect(bash(ps1).raw, `kullanıcının istemi değişti: ${ps1}`).toBe(ps1);
    }
  });

  it.skipIf(win)("bash: seçilen renkler istemde çıkıyor ve sıfır genişlik sarmalı korunuyor", () => {
    const r = bash("\\h:\\W \\u\\$ ", {
      NTERMINAL_PROMPT_USER_RGB: "255;140;0",
      NTERMINAL_PROMPT_DIR_RGB: "0;170;255",
    });
    expect(r.raw, r.err).toContain("\\033[1;38;2;255;140;0m");
    expect(r.raw).toContain("\\033[1;38;2;0;170;255m");
    expect(r.raw, "palet rengi seçilenle birlikte kaldı").not.toContain("\\033[1;32m");
    const renkler = r.raw.match(/\\033\[[0-9;]*m/g) ?? [];
    const sarili = r.raw.match(/\\\[\\033\[[0-9;]*m\\\]/g) ?? [];
    expect(sarili.length, `sarılmamış renk dizisi var: ${r.raw}`).toBe(renkler.length);
  });

  it.skipIf(win)("bash: yalnız kullanıcı rengi seçilince dizin paletten kalıyor", () => {
    const r = bash("\\h:\\W \\u\\$ ", { NTERMINAL_PROMPT_USER_RGB: "255;140;0" });
    expect(r.raw, r.err).toContain("\\033[1;38;2;255;140;0m");
    expect(r.raw).toContain("\\033[1;34m");
  });

  it.skipIf(win)("bash: yerleşik varsayılan (sh-3.2$) da seçilen rengi alıyor", () => {
    const r = bash("\\s-\\v\\$ ", { NTERMINAL_PROMPT_USER_RGB: "255;140;0" });
    expect(r.raw, r.err).toContain("\\033[1;38;2;255;140;0m");
    expect(r.raw).toContain("\\s-\\v");
  });

  it.skipIf(win)("bash: bozuk ya da kötü niyetli renk değeri palet rengine düşüyor, hiçbir şey çalışmıyor", () => {
    const iz = join(tmpdir(), `nt-enjeksiyon-bash-${process.pid}-${Date.now()}`);
    try {
      for (const kotu of [
        "1;2",
        "1;2;3;4",
        "a;b;c",
        ";1;2",
        "1;2;",
        "1;;2",
        "1 2 3",
        `1;2;3$(touch ${iz})`,
        `1;2;3\`touch ${iz}\``,
        `1;2;3;touch ${iz}`,
      ]) {
        const r = bash("\\h:\\W \\u\\$ ", { NTERMINAL_PROMPT_USER_RGB: kotu, NTERMINAL_PROMPT_DIR_RGB: kotu });
        expect(r.raw, `bozuk değer kabul edildi: ${JSON.stringify(kotu)}`).toContain("\\033[1;32m");
        expect(r.raw).toContain("\\033[1;34m");
        expect(r.raw).not.toContain("38;2");
      }
      expect(existsSync(iz), "değer bir komut olarak ÇALIŞTI").toBe(false);
    } finally {
      rmSync(iz, { force: true });
    }
  });

  it.skipIf(win)("bash: ayar kapalıyken seçilen renk de uygulanmıyor", () => {
    const r = bash("\\h:\\W \\u\\$ ", { NTERMINAL_PROMPT_COLOR: "0", NTERMINAL_PROMPT_USER_RGB: "255;140;0" });
    expect(r.raw).toBe("\\h:\\W \\u\\$ ");
  });

  it.skipIf(win)("bash: ayar kapalıyken varsayılana da dokunulmuyor", () => {
    expect(bash("\\h:\\W \\u\\$ ", { NTERMINAL_PROMPT_COLOR: "0" }).raw).toBe("\\h:\\W \\u\\$ ");
  });
});

/**
 * zsh geçmiş dosyası kullanıcının klasöründe kalmalı.
 *
 * ÖLÇÜLEN HATA: uygulamanın zsh sekmelerinde `HISTFILE` kullanıcının
 * `~/.zsh_history`'si değil uygulamanın kendi `shell-integration/zdotdir/`
 * klasöründeki bir dosyaya gidiyordu (kurulu uygulamada 266 satır birikmişti,
 * gerçek geçmiş 1012 satırdı). Ctrl+R, yukarı ok ve zsh-autosuggestions
 * kullanıcının gerçek geçmişini görmüyordu.
 *
 * ZİNCİR: macOS'un `/etc/zshrc`si kullanıcının .zshrc'sinden ÖNCE koşup
 * `HISTFILE=${ZDOTDIR:-$HOME}/.zsh_history` yazıyor; o an ZDOTDIR köprümüzü
 * gösteriyor.
 */
describe("zsh geçmiş dosyası (gerçek zsh)", () => {
  /**
   * Entegrasyon klasörünün GEÇİCİ kopyası: kabuklar geçmişi ZDOTDIR'e yazıyor ve
   * gerçek klasör depo ağacının içinde — bir test koşusu `.zsh_history`yi depoya
   * yazıp bir kez yanlışlıkla commit'lendi. PSReadLine ikilileri kopyalanmıyor.
   */
  const KOPYA = mkdtempSync(join(tmpdir(), "nt-entegrasyon-"));
  cpSync(DIR, KOPYA, { recursive: true, filter: (kaynak) => !kaynak.includes(`${join(DIR, "modules")}`) });
  const OWN = join(KOPYA, "zdotdir");
  afterAll(() => rmSync(KOPYA, { recursive: true, force: true }));

  /** Köprüyle bir zsh açar, `histfile=[…]` satırını okur. */
  function histfile(opts: { userZdotdir?: string; zshrc?: string } = {}) {
    const home = mkdtempSync(join(tmpdir(), "nt-hist-"));
    try {
      if (opts.zshrc !== undefined) {
        const dir = opts.userZdotdir ?? home;
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, ".zshrc"), opts.zshrc);
      }
      const r = spawnSync("zsh", ["-l", "-i", "-c", 'print -r -- "histfile=[$HISTFILE]"'], {
        env: {
          PATH: "/usr/bin:/bin",
          HOME: home,
          TERM: "xterm-256color",
          LANG: "C.UTF-8",
          ZDOTDIR: OWN,
          ...(opts.userZdotdir ? { NTERMINAL_ZDOTDIR: opts.userZdotdir } : {}),
        },
        encoding: "utf8",
        timeout: 15000,
      });
      const m = /histfile=\[([^\]]*)\]/.exec(r.stdout ?? "");
      return { histfile: m?.[1] ?? null, home, err: r.stderr ?? "" };
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  }

  // /etc/zshrc yalnızca macOS'ta HISTFILE'ı ZDOTDIR'e göre kuruyor.
  it.skipIf(process.platform !== "darwin")("HISTFILE uygulamanın klasörüne değil $HOME'a gidiyor", () => {
    const r = histfile();
    expect(r.histfile, r.err).not.toBeNull();
    expect(r.histfile, "geçmiş uygulamanın klasörüne yazılıyor").not.toContain("shell-integration");
    expect(r.histfile).toBe(`${r.home}/.zsh_history`);
  });

  it.skipIf(process.platform !== "darwin")("kullanıcının kendi ZDOTDIR'i varsa geçmiş orada", () => {
    const zd = mkdtempSync(join(tmpdir(), "nt-zd-"));
    try {
      const r = histfile({ userZdotdir: zd });
      expect(r.histfile).toBe(`${zd}/.zsh_history`);
    } finally {
      rmSync(zd, { recursive: true, force: true });
    }
  });

  it.skipIf(noZsh)("kullanıcı HISTFILE'ı kendisi yazdıysa ona dokunulmuyor", () => {
    const r = histfile({ zshrc: 'HISTFILE=/tmp/kullanici-ozel-gecmis\n' });
    expect(r.histfile).toBe("/tmp/kullanici-ozel-gecmis");
  });
});

/**
 * `setopt nounset` açık kullanıcıda köprü ve entegrasyon yarıda kalmamalı.
 *
 * ÖLÇÜLEN HATA (gerçek zsh, `.zshenv` ve `.zshrc` `setopt nounset` ile):
 * köprü "NTERMINAL_ZDOTDIR: parameter not set" ile durup `ZDOTDIR`i
 * kullanıcıya geri vermiyordu (kurulum betikleri satırlarını bizim klasöre
 * yazıyor ve her açılışta kayboluyordu); entegrasyon betiği tanımsız
 * `NTERMINAL_INTEGRATION_LOADED`ta ve kanca dizilerinde duruyor, uygulama düz
 * terminale düşüyordu.
 */
describe("zsh nounset (gerçek zsh)", () => {
  const KOPYA = mkdtempSync(join(tmpdir(), "nt-entegrasyon-"));
  cpSync(DIR, KOPYA, { recursive: true, filter: (kaynak) => !kaynak.includes(`${join(DIR, "modules")}`) });
  const OWN = join(KOPYA, "zdotdir");
  afterAll(() => rmSync(KOPYA, { recursive: true, force: true }));

  it.skipIf(noZsh)("köprü ZDOTDIR'i geri veriyor, entegrasyon yükleniyor, hata yok", () => {
    const home = mkdtempSync(join(tmpdir(), "nt-nounset-"));
    const user = join(home, "zd");
    try {
      mkdirSync(user, { recursive: true });
      writeFileSync(join(user, ".zshenv"), "setopt nounset\n");
      writeFileSync(join(user, ".zshrc"), "setopt nounset\n");
      const r = spawnSync(
        "zsh",
        ["-l", "-i", "-c", 'print -r -- "zdotdir=[${ZDOTDIR-}] loaded=[${NTERMINAL_INTEGRATION_LOADED-}]"'],
        {
          env: {
            PATH: "/usr/bin:/bin",
            HOME: home,
            TERM: "xterm-256color",
            LANG: "C.UTF-8",
            // Uygulama veriyor (pty.rs); macOS'un /etc/zshrc'si nounset altında
            // bu değişken yoksa kendisi düşüyor.
            TERM_PROGRAM: "NTerminal",
            ZDOTDIR: OWN,
            NTERMINAL_ZDOTDIR: user,
          },
          encoding: "utf8",
          timeout: 15000,
        },
      );
      const err = r.stderr ?? "";
      expect(err, "nounset betiği yarıda kesti").not.toMatch(/parameter not set/);
      expect(r.stdout).toContain(`zdotdir=[${user}]`);
      expect(r.stdout, "entegrasyon yüklenmedi").toContain("loaded=[1]");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
