import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

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
