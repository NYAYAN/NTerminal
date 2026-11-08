import { commandProgram } from "./labels";
import type { MsgKey } from "./messages";

/**
 * Tam ekran programın çubuğunda (`KeyBar`) ne yazacağı ve hangi düğmelerin
 * çıkacağı.
 *
 * ## Neden var
 *
 * BİLDİRİLEN: "`git pull` dediğimde komut yazın kısmında değil üst kısımda
 * `:q!` yazmak gerekiyor." git birleştirme mesajı için vim açıyor ve vim'den
 * nasıl çıkılacağını bilmeyen kullanıcı orada kalıyor. Çubuk programın adını
 * söylüyor; bilinen programlar için çıkışı TEK TIKA indiriyor.
 *
 * ## Düğmeler ne gönderiyor
 *
 * Programın kendi tuşlarını, kullanıcı yazmış gibi. vim'de önce Esc: kullanıcı
 * ekleme kipindeyse `:wq` metne yazılırdı; komut kipindeyken Esc zararsız.
 * Kaydetmeden çıkışta `:q!` — git'in birleştirme mesajında bu, git'in hazır
 * mesajıyla devam etmek demek (dosya değişmeden kapanıyor).
 *
 * Program bilinmiyorsa düğme yok: yanlış programa `:q!` göndermek o programda
 * başka bir şey yapar. O durumda çubukta Durdur kalıyor.
 */

export interface KeyAction {
  /** Düğmenin metni. */
  label: MsgKey;
  /** Programa gidecek baytlar. */
  keys: string;
  /** Düğmenin ipucunda gösterilen tuşlar (`:wq`). */
  shown: string;
}

export interface KeyBarInfo {
  /** Çubukta görünen program adı; bilinmiyorsa null ("Tam ekran program"). */
  name: string | null;
  hint: MsgKey;
  actions: KeyAction[];
}

const ESC = "\x1b";

const VIM: KeyAction[] = [
  { label: "input.keysSaveQuit", keys: `${ESC}:wq\r`, shown: ":wq" },
  { label: "input.keysQuitNoSave", keys: `${ESC}:q!\r`, shown: ":q!" },
];

const NANO: KeyAction[] = [
  // nano Ctrl+O'dan sonra dosya adını soruyor; Enter onu onaylıyor.
  { label: "input.keysSave", keys: "\x0f\r", shown: "Ctrl+O" },
  { label: "input.keysQuit", keys: "\x18", shown: "Ctrl+X" },
];

const QUIT_Q: KeyAction[] = [{ label: "input.keysQuit", keys: "q", shown: "q" }];

// Map, nesne değil: süreç adı dışarıdan geliyor ve `constructor` adında bir
// program nesnenin kendi alanına düşerdi.
const ACTIONS = new Map<string, KeyAction[]>([
  ["vim", VIM],
  ["nvim", VIM],
  ["vi", VIM],
  ["view", VIM],
  ["vimdiff", VIM],
  ["nano", NANO],
  ["pico", NANO],
  ["less", QUIT_Q],
  ["more", QUIT_Q],
  ["most", QUIT_Q],
  ["man", QUIT_Q],
  ["htop", QUIT_Q],
  ["top", QUIT_Q],
  ["btop", QUIT_Q],
  ["fzf", [{ label: "input.keysCancel", keys: ESC, shown: "Esc" }]],
]);

const VIM_FAMILY = new Set(["vim", "nvim", "vi", "view", "vimdiff"]);

/**
 * Süreç ya da komut adını karşılaştırılabilir hâle getirir: yol, `.exe` ve
 * büyük harf düşüyor (`/usr/bin/vim`, Windows'ta `Vim.exe` → `vim`).
 */
export function programName(raw: string | null | undefined): string | null {
  const base = raw?.trim().split(/[\\/]/).pop() ?? "";
  const name = base.replace(/\.exe$/i, "").toLowerCase();
  return name || null;
}

/**
 * Çubuğun içeriği.
 *
 * `detected`: ön plandaki programın adı (Rust, `pty_foreground`) — `git pull`
 * zincirinde vim. Okunamadıysa (Windows'ta grup bilgisi olmayan bir an,
 * yarış) ad çalışan komuttan geliyor; o zaman düğmeler yalnızca komut
 * programı DOĞRUDAN çalıştırıyorsa çıkıyor (`vim x`). `git` gibi bir
 * başlatıcıda tam ekranda hangi programın açık olduğu bilinmiyor.
 */
export function keyBarInfo(
  detected: string | null | undefined,
  command: string | null | undefined,
): KeyBarInfo {
  const running = programName(commandProgram(command));
  const program = programName(detected);
  if (program) {
    const gitEditor = running === "git" && VIM_FAMILY.has(program);
    return {
      name: program,
      hint: gitEditor ? "input.keysGitHint" : "input.keysHint",
      actions: ACTIONS.get(program) ?? [],
    };
  }
  return { name: running, hint: "input.keysHint", actions: (running && ACTIONS.get(running)) || [] };
}
