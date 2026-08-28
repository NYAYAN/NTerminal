/**
 * Kabuk entegrasyonu OSC yüklerinin ayrıştırılması.
 *
 * Karşı taraf `src-tauri/shell-integration/` altındaki betikler. Buradaki
 * kaçış kuralı onlarla birebir eşleşmek zorunda: yükte `;` ayırıcı olduğu için
 * komut metnindeki her `;` ve her denetim karakteri kaçışlanmış geliyor.
 */

/** Betiklerin uyguladığı kaçışı geri alır: `\\` ve `\xNN`. */
export function unescapeOsc(value: string): string {
  if (!value.includes("\\")) return value;
  let out = "";
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch !== "\\") {
      out += ch;
      continue;
    }
    const next = value[i + 1];
    if (next === "\\") {
      out += "\\";
      i += 1;
    } else if (next === "x" || next === "X") {
      const hex = value.slice(i + 2, i + 4);
      if (/^[0-9a-fA-F]{2}$/.test(hex)) {
        out += String.fromCharCode(parseInt(hex, 16));
        i += 3;
      } else {
        // Geçersiz kaçış: ters eğik çizgiyi olduğu gibi bırak, veri kaybetme.
        out += ch;
      }
    } else {
      out += ch;
    }
  }
  return out;
}

/**
 * OSC 7 yükünü Windows yoluna çevirir.
 *
 * Gelen biçimler: `file:///C:/Users/x`, `file://makine/C:/Users/x`,
 * `file:///home/ali` (WSL). Sürücü harfi varsa ters eğik çizgiye çeviriyoruz;
 * yoksa (WSL / Linux) yolu olduğu gibi bırakıyoruz.
 */
export function cwdFromFileUri(payload: string): string | null {
  const trimmed = payload.trim();
  if (!trimmed) return null;
  try {
    const withoutScheme = trimmed.replace(/^file:\/\//i, "");
    // Ana makine adı varsa at: şema sonrası ilk '/' öncesindeki kısım.
    const slash = withoutScheme.indexOf("/");
    let path = withoutScheme.startsWith("/")
      ? withoutScheme
      : slash === -1
        ? withoutScheme
        : withoutScheme.slice(slash);

    path = decodeURIComponent(path);
    // `/C:/Users/x` -> `C:/Users/x`
    path = path.replace(/^\/([A-Za-z]:)/, "$1");

    if (/^[A-Za-z]:/.test(path)) return path.replace(/\//g, "\\");
    return path;
  } catch {
    return null;
  }
}

export type Osc133Kind = "A" | "B" | "C" | "D" | null;

export interface Osc133 {
  kind: Osc133Kind;
  /** Yalnızca D için: çıkış kodu. Kabuk bildirmediyse null. */
  exitCode: number | null;
}

/** `A`, `B`, `C`, `D`, `D;0`, `D;3` yüklerini ayrıştırır. */
export function parseOsc133(payload: string): Osc133 {
  const parts = payload.split(";");
  const kind = parts[0];
  if (kind !== "A" && kind !== "B" && kind !== "C" && kind !== "D") {
    return { kind: null, exitCode: null };
  }
  if (kind !== "D") return { kind, exitCode: null };

  const raw = parts[1];
  if (raw === undefined || raw === "") return { kind: "D", exitCode: null };
  const code = Number.parseInt(raw, 10);
  return { kind: "D", exitCode: Number.isNaN(code) ? null : code };
}

export interface Osc633 {
  /** `E`: komut metni, `P`: özellik (Cwd), `X`: NTerminal eklentisi (Dur). */
  kind: string;
  /** E için komut metni; P/X için değer. */
  value: string;
  /** P ve X için anahtar (`Cwd`, `Dur`). */
  key: string | null;
}

/** `E;<komut>`, `P;Cwd=<yol>`, `X;Dur=<ms>` yüklerini ayrıştırır. */
export function parseOsc633(payload: string): Osc633 | null {
  const sep = payload.indexOf(";");
  const kind = sep === -1 ? payload : payload.slice(0, sep);
  if (!kind) return null;
  const rest = sep === -1 ? "" : payload.slice(sep + 1);

  if (kind === "E") {
    return { kind, value: unescapeOsc(rest).trim(), key: null };
  }
  // P ve X anahtar=değer biçiminde.
  const eq = rest.indexOf("=");
  if (eq === -1) return { kind, value: unescapeOsc(rest), key: null };
  return {
    kind,
    key: rest.slice(0, eq),
    value: unescapeOsc(rest.slice(eq + 1)),
  };
}
