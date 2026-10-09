import type { Platform } from "./platform";
import type { ShellKind } from "../types";

/**
 * Kabuğa yazılan bir yolu, O KABUĞUN kurallarıyla alıntılamak.
 *
 * ## Ölçülen hata
 *
 * Eski `quoteForShell` tek kural uyguluyordu: boşluk görünce `"…"`, içerideki
 * `"` ise `""` ile ikileniyordu. Bu cmd.exe'nin kuralı. POSIX kabuklarda
 * (zsh, bash, fish) çift tırnak içinde `""` kaçış değildir; `$`, `` ` `` ve
 * `\` genişler; etkileşimli zsh/bash'te `!` geçmiş genişlemesi tetikler — ve
 * bu karakterler boşluk yoksa hiç tırnaklanmıyordu. `~/Work/$RELEASE` klasörü
 * `cd ~/Work/$RELEASE` olarak gidip `~/Work/`a iniyordu; `Projeler!eski`
 * "event not found" veriyordu. En sinsisi kilitli sekmenin sessiz düzeltmesi
 * (`runQuietly`): yanlış klasöre `cd` atıyor, sonraki komut orada çalışıyor.
 *
 * ## Üç aile, üç kural
 *
 * - **posix** (bash, zsh, fish, WSL): tek tırnak; içerideki `'` için `'\''`.
 *   Tek tırnak içinde HİÇBİR şey genişlemez, tek istisna tırnağın kendisi.
 * - **powershell**: tek tırnak; içerideki `'` ikilenir (`''`). Çift tırnak
 *   `$` ve `` ` `` genişletirdi.
 * - **cmd**: çift tırnak; cmd'de `"` kaçışı yok, yol içindeki `"` olduğu gibi
 *   kalıyor (dosya sisteminde zaten geçersiz).
 *
 * Başındaki `~` tırnağın DIŞINDA kalıyor: `'~/x'` kabukta ev dizinine
 * açılmaz, `~/'x'` açılır. Uygulamanın gönderdiği yollar çoğu zaman mutlak;
 * yine de `cd` önerileri kullanıcının yazdığı `~`yi koruyor.
 */
export type ShellFamily = "posix" | "powershell" | "cmd";

/** Tırnaksız güvenli karakterler: harf, rakam ve yol ayracı türünden olanlar. */
const POSIX_SAFE = /^[A-Za-z0-9_\-./~:@%+=,]+$/;
/** PowerShell'de `~`, `:` ve `\` sorunsuz; `$`, `` ` ``, `@`, `,`, `;` değil. */
const POWERSHELL_SAFE = /^[A-Za-z0-9_\-./\\~:+=]+$/;
/** cmd.exe ayraçları ve boşluk. */
const CMD_UNSAFE = /[\s&|<>^()"]/;

/**
 * Profilin türünden (ve bilinmiyorsa çalıştırılan kabuğun adından) aileyi
 * seçer. `custom` profil ve profilsiz oturum için kabuk adına bakılıyor;
 * o da yoksa platform: Windows'ta cmd kuralı (PowerShell de düz bir
 * `"C:\x y"`yi anlıyor), diğerlerinde POSIX.
 */
export function shellFamily(
  kind: ShellKind | null | undefined,
  shell: string | null | undefined,
  platform: Platform,
): ShellFamily {
  switch (kind) {
    case "power-shell":
    case "pwsh":
      return "powershell";
    case "cmd":
      return "cmd";
    case "bash":
    case "zsh":
    case "fish":
    case "wsl":
      return "posix";
    default:
      break;
  }
  const exe = (shell ?? "").split(/[\\/]/).pop()?.toLowerCase() ?? "";
  if (exe.startsWith("pwsh") || exe.startsWith("powershell")) return "powershell";
  if (exe === "cmd.exe" || exe === "cmd") return "cmd";
  if (/^(bash|zsh|fish|sh|dash|ksh|wsl)(\.exe)?$/.test(exe)) return "posix";
  return platform === "windows" ? "cmd" : "posix";
}

/** Yolu verilen kabuk ailesi için alıntılar; gerekmiyorsa olduğu gibi. */
export function quoteForShell(path: string, family: ShellFamily): string {
  switch (family) {
    case "posix":
      return quoteSingle(path, POSIX_SAFE, "'\\''");
    case "powershell":
      return quoteSingle(path, POWERSHELL_SAFE, "''");
    case "cmd":
      if (!CMD_UNSAFE.test(path)) return path;
      return `"${path}"`;
  }
}

function quoteSingle(path: string, safe: RegExp, escapedQuote: string): string {
  if (path === "" || safe.test(path)) return path;
  // `~/` ya da `~kullanıcı/` ön eki genişlemeli: tırnak ondan SONRA başlıyor.
  const tilde = /^~[^/\\]*[/\\]/.exec(path);
  const head = tilde ? tilde[0] : "";
  const rest = path.slice(head.length);
  return `${head}'${rest.replace(/'/g, escapedQuote)}'`;
}
